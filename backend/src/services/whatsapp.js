/**
 * Meta WhatsApp Cloud API Service
 */

const WHATSAPP_API_VERSION = 'v22.0';
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

function getCredentials() {
    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
        throw new Error('WHATSAPP_CLOUD_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set in .env');
    }

    return { token, phoneId };
}

/**
 * Normalize Indian phone numbers to WhatsApp format (91XXXXXXXXXX)
 */
export function normalizePhone(phone) {
    if (!phone) return null;

    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.length === 10) {
        return '91' + cleaned;
    }
    if (cleaned.startsWith('91') && cleaned.length === 12) {
        return cleaned;
    }
    if (cleaned.startsWith('0') && cleaned.length === 11) {
        return '91' + cleaned.slice(1);
    }
    if (cleaned.startsWith('091') && cleaned.length === 13) {
        return cleaned.slice(1);
    }

    return cleaned.length >= 10 ? cleaned : null;
}

/**
 * Cache for template definitions fetched from Meta (keyed by template name)
 * Avoids re-fetching on every single message in a bulk broadcast
 */
const templateDefCache = new Map();

/**
 * Cache for media IDs to avoid re-uploading the same template image multiple times
 */
const mediaIdCache = new Map();

/**
 * Downloads an image from a Meta CDN URL and uploads it via the WhatsApp Media API.
 * Returns the media ID, which is safe to use in outbound messages.
 */
async function processAndCacheMediaId(imageUrl) {
    if (mediaIdCache.has(imageUrl)) {
        return mediaIdCache.get(imageUrl);
    }
    
    try {
        const { token, phoneId } = getCredentials();
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.statusText}`);
        
        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        
        // Use FormData with a Blob for Node 18+ native fetch
        const blob = new Blob([buffer], { type: contentType });
        const formData = new FormData();
        formData.append('file', blob, 'header_image.jpg');
        formData.append('type', contentType);
        formData.append('messaging_product', 'whatsapp');

        const uploadRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const uploadData = await uploadRes.json();
        if (uploadData.id) {
            mediaIdCache.set(imageUrl, uploadData.id);
            return uploadData.id;
        } else {
            console.warn('[WhatsApp] Media upload failed:', uploadData);
            return null;
        }
    } catch (err) {
        console.error('[WhatsApp] Error processing media URL:', err.message);
        return null;
    }
}

/**
 * Fetch a single template's definition from Meta to detect its components
 * (HEADER with IMAGE, BUTTONS, etc.)
 */
async function getTemplateDefinition(templateName) {
    // Check cache first (valid for 5 minutes)
    const cached = templateDefCache.get(templateName);
    if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
        return cached.data;
    }

    try {
        const templates = await fetchTemplates();
        const tpl = templates.find(t => t.name === templateName);
        if (tpl) {
            templateDefCache.set(templateName, { data: tpl, fetchedAt: Date.now() });
        }
        return tpl || null;
    } catch (err) {
        console.error(`[WhatsApp] Failed to fetch template definition for "${templateName}":`, err.message);
        return null;
    }
}

/**
 * Send a single template message via Meta Cloud API
 * Automatically detects template components (IMAGE header, buttons, etc.) and builds the correct payload
 */
export async function sendTemplateMessage(phone, campaignName, templateParams = [], userName = '', languageCode = null) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        throw new Error(`Invalid phone number: ${phone}`);
    }

    const { token, phoneId } = getCredentials();

    // Fetch the template definition from Meta to detect HEADER, BUTTONS, etc.
    const tplDef = await getTemplateDefinition(campaignName);
    const tplComponents = tplDef?.components || [];

    const components = [];

    // --- HEADER component ---
    // If template has an IMAGE/VIDEO/DOCUMENT header, we MUST include it in the send payload
    const headerComp = tplComponents.find(c => c.type === 'HEADER');
    if (headerComp) {
        if (headerComp.format === 'IMAGE') {
            // Get the image URL from the template's example
            const imageUrl = headerComp.example?.header_handle?.[0] || headerComp.example?.header_url?.[0] || null;
            if (imageUrl) {
                let imageSpec = { link: imageUrl };
                
                // If it's a Meta CDN link, we should try to upload it and use the media ID instead. 
                // Meta API rejects scontent URLs for outbound messages asynchronously.
                if (imageUrl.includes('scontent.whatsapp.net')) {
                    const mediaId = await processAndCacheMediaId(imageUrl);
                    if (mediaId) {
                        imageSpec = { id: mediaId };
                    }
                }

                components.push({
                    type: "header",
                    parameters: [{
                        type: "image",
                        image: imageSpec
                    }]
                });
            } else {
                console.warn(`[WhatsApp] Template "${campaignName}" has IMAGE header but no example URL found. Skipping header component.`);
            }
        } else if (headerComp.format === 'VIDEO') {
            const videoUrl = headerComp.example?.header_handle?.[0] || headerComp.example?.header_url?.[0] || null;
            if (videoUrl) {
                components.push({
                    type: "header",
                    parameters: [{
                        type: "video",
                        video: { link: videoUrl }
                    }]
                });
            }
        } else if (headerComp.format === 'DOCUMENT') {
            const docUrl = headerComp.example?.header_handle?.[0] || headerComp.example?.header_url?.[0] || null;
            if (docUrl) {
                components.push({
                    type: "header",
                    parameters: [{
                        type: "document",
                        document: { link: docUrl }
                    }]
                });
            }
        }
        // TEXT headers with variables would also need parameters, but that's less common
    }

    // --- BODY component ---
    // Filter out empty params — only include ones the user actually filled in
    const filledParams = templateParams.filter(p => p && String(p).trim() !== '');

    if (filledParams.length > 0) {
        components.push({
            type: "body",
            parameters: filledParams.map(param => {
                let textVal = String(param);
                // Dynamically replace {name} or {{name}} with the actual recipient's name
                if (textVal.includes('{name}')) textVal = textVal.replace(/{name}/g, userName || 'Customer');
                if (textVal.includes('{{name}}')) textVal = textVal.replace(/{{name}}/g, userName || 'Customer');

                return {
                    type: "text",
                    text: textVal
                };
            })
        });
    }

    // --- BUTTON components ---
    // URL buttons with variables (e.g., {{1}}) need parameters too
    const buttonsComp = tplComponents.find(c => c.type === 'BUTTONS');
    if (buttonsComp?.buttons) {
        buttonsComp.buttons.forEach((btn, idx) => {
            if (btn.type === 'URL' && btn.url?.includes('{{')) {
                components.push({
                    type: "button",
                    sub_type: "url",
                    index: String(idx),
                    parameters: [{ type: "text", text: "details" }]
                });
            }
        });
    }

    // Determine language based on template definition or passed code
    const langCode = languageCode || tplDef?.language || (campaignName === 'hello_world' ? 'en_US' : 'en');

    const payload = {
        messaging_product: "whatsapp",
        to: normalizedPhone,
        type: "template",
        template: {
            name: campaignName,
            language: {
                code: langCode
            },
            components: components.length > 0 ? components : undefined
        }
    };

    console.log(`[WhatsApp Cloud API] Sending to ${normalizedPhone} | Template: ${campaignName}`);
    console.log(`[WhatsApp Cloud API] Payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log(`[WhatsApp Cloud API] Response for ${normalizedPhone}:`, JSON.stringify(data));

    if (!response.ok) {
        const errMsg = data.error?.message || `WhatsApp Cloud API error (${response.status})`;
        throw new Error(errMsg);
    }

    return {
        messageId: data.messages && data.messages.length > 0 ? data.messages[0].id : null,
        data: data
    };
}

/**
 * Send bulk messages with rate limiting and error tracking
 */
export async function sendBulkMessages(recipients, campaignName, templateParams = [], batchSize = 50, delayMs = 1000, languageCode = null) {
    const results = {
        successful: 0,
        failed: 0,
        errors: [],
        messageIds: [],
    };

    const seen = new Set();
    const uniqueRecipients = [];
    for (const r of recipients) {
        const normalized = normalizePhone(r.phone);
        if (!normalized) {
            results.failed++;
            results.errors.push({ phone: r.phone, name: r.name, error: 'Invalid phone number' });
            continue;
        }
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        uniqueRecipients.push({ ...r, normalizedPhone: normalized });
    }

    // Send in batches with delay
    for (let i = 0; i < uniqueRecipients.length; i += batchSize) {
        const batch = uniqueRecipients.slice(i, i + batchSize);

        const batchPromises = batch.map(async (recipient) => {
            try {
                const data = await sendTemplateMessage(
                    recipient.normalizedPhone,
                    campaignName,
                    templateParams,
                    recipient.name || 'Customer',
                    languageCode
                );
                results.successful++;
                results.messageIds.push({
                    phone: recipient.normalizedPhone,
                    name: recipient.name,
                    messageId: data.messageId,
                });
            } catch (error) {
                results.failed++;
                results.errors.push({
                    phone: recipient.phone,
                    name: recipient.name,
                    error: error.message,
                });
            }
        });

        await Promise.all(batchPromises);

        // Delay between batches to respect rate limits
        if (i + batchSize < uniqueRecipients.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

/**
 * Upload media (image) for use in template creation via Meta Resumable Upload API
 * Returns the header_handle needed for HEADER component
 */
export async function uploadMediaForTemplate(imageBuffer, mimeType = 'image/jpeg', fileName = 'template_header.jpg') {
    const { token } = getCredentials();

    // Step 1: Create an upload session
    const sessionUrl = `${WHATSAPP_API_URL}/app/uploads?file_length=${imageBuffer.length}&file_type=${encodeURIComponent(mimeType)}&file_name=${encodeURIComponent(fileName)}`;

    console.log('[WhatsApp] Creating upload session...');
    const sessionRes = await fetch(sessionUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const sessionData = await sessionRes.json();

    if (!sessionRes.ok || !sessionData.id) {
        throw new Error(sessionData.error?.message || 'Failed to create upload session');
    }

    const uploadSessionId = sessionData.id;
    console.log('[WhatsApp] Upload session created:', uploadSessionId);

    // Step 2: Upload the actual file data
    const uploadUrl = `${WHATSAPP_API_URL}/${uploadSessionId}`;
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Authorization': `OAuth ${token}`,
            'file_offset': '0',
            'Content-Type': mimeType,
        },
        body: imageBuffer,
    });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || !uploadData.h) {
        throw new Error(uploadData.error?.message || 'Failed to upload media file');
    }

    console.log('[WhatsApp] Media uploaded, handle:', uploadData.h.substring(0, 50) + '...');
    return uploadData.h;
}

/**
 * Create a new WhatsApp message template via Meta Graph API
 * Supports: optional image header, body text with variables, optional footer, optional call button
 */
export async function createTemplate({ name, category, language, bodyText, headerImageHandle, footerText, callButtonText, callButtonPhone }) {
    const { token } = getCredentials();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!wabaId) {
        throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID must be set in .env');
    }

    const components = [];

    // HEADER component (optional image)
    if (headerImageHandle) {
        components.push({
            type: 'HEADER',
            format: 'IMAGE',
            example: {
                header_handle: [headerImageHandle]
            }
        });
    }

    // BODY component (required)
    const bodyComponent = {
        type: 'BODY',
        text: bodyText
    };

    // Extract variables from body text (e.g. {{1}}, {{2}})
    const variableMatches = bodyText.match(/\{\{(\d+)\}\}/g);
    if (variableMatches && variableMatches.length > 0) {
        bodyComponent.example = {
            body_text: [variableMatches.map((_, i) => `Sample ${i + 1}`)]
        };
    }
    components.push(bodyComponent);

    // FOOTER component (optional)
    if (footerText && footerText.trim()) {
        components.push({
            type: 'FOOTER',
            text: footerText.trim()
        });
    }

    // BUTTONS component (optional call button)
    if (callButtonPhone && callButtonText) {
        components.push({
            type: 'BUTTONS',
            buttons: [{
                type: 'PHONE_NUMBER',
                text: callButtonText.substring(0, 25), // Max 25 chars
                phone_number: callButtonPhone.startsWith('+') ? callButtonPhone : `+${callButtonPhone}`
            }]
        });
    }

    const payload = {
        name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category: category || 'MARKETING',
        language: language || 'en',
        components
    };

    console.log('[WhatsApp] Creating template:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${WHATSAPP_API_URL}/${wabaId}/message_templates`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('[WhatsApp] Create template response:', JSON.stringify(data));

    if (!response.ok) {
        throw new Error(data.error?.message || `Failed to create template (${response.status})`);
    }

    return {
        id: data.id,
        status: data.status,
        category: data.category
    };
}

/**
 * Fetch all templates from Meta WhatsApp Business Account
 */
export async function fetchTemplates() {
    const { token } = getCredentials();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!wabaId) {
        throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID must be set in .env');
    }

    const response = await fetch(`${WHATSAPP_API_URL}/${wabaId}/message_templates?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to fetch templates');
    }

    return data.data || [];
}

/**
 * Delete a template from Meta WhatsApp Business Account
 */
export async function deleteTemplate(templateName) {
    const { token } = getCredentials();
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!wabaId) {
        throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID must be set in .env');
    }

    const response = await fetch(`${WHATSAPP_API_URL}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to delete template');
    }

    return data;
}

export default {
    normalizePhone,
    sendTemplateMessage,
    sendBulkMessages,
    uploadMediaForTemplate,
    createTemplate,
    fetchTemplates,
    deleteTemplate,
};
