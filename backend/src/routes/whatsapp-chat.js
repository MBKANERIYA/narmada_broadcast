import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { query, run, get } from '../database.js';
import { sendTextMessage, sendMediaMessage, sendTemplateMessage, normalizePhone, getTemplateDefinition, uploadMediaForMessage } from '../services/whatsapp.js';
import { emitToTenant } from '../services/websocket.js';
import { checkWhatsAppEnabled } from '../middleware/limits.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

/**
 * Resolve full template content as JSON string for rich display
 * Returns JSON with all components: header, body, footer, buttons
 */
async function resolveTemplateBody(templateName, templateParams = [], tenant) {
    try {
        const tpl = await getTemplateDefinition(templateName, tenant);
        if (!tpl) return `[Template: ${templateName}]`;

        const components = tpl.components || [];
        const bodyComp = components.find(c => c.type === 'BODY');
        const headerComp = components.find(c => c.type === 'HEADER');
        const footerComp = components.find(c => c.type === 'FOOTER');
        const buttonsComp = components.find(c => c.type === 'BUTTONS');

        // Resolve body text with variables
        let bodyText = bodyComp?.text || '';
        bodyText = bodyText.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
            const paramIdx = parseInt(idx) - 1;
            return templateParams[paramIdx] || `{{${idx}}}`;
        });

        // Build rich template data
        const templateData = {
            _type: 'template_rich',
            template_name: templateName,
            body: bodyText,
        };

        // Header
        if (headerComp) {
            templateData.header = { format: headerComp.format };
            if (headerComp.format === 'TEXT') {
                templateData.header.text = headerComp.text || '';
            } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                templateData.header.url = headerComp.example?.header_handle?.[0] || headerComp.example?.header_url?.[0] || '';
            }
        }

        // Footer
        if (footerComp?.text) {
            templateData.footer = footerComp.text;
        }

        // Buttons
        if (buttonsComp?.buttons?.length) {
            templateData.buttons = buttonsComp.buttons.map(btn => ({
                type: btn.type,
                text: btn.text,
            }));
        }

        return JSON.stringify(templateData);
    } catch (err) {
        console.error('resolveTemplateBody error:', err.message);
        return `[Template: ${templateName}]`;
    }
}

/**
 * Extract plain text summary from template body (for sidebar preview)
 */
function getTemplatePlainText(resolvedBody) {
    try {
        const data = JSON.parse(resolvedBody);
        if (data._type === 'template_rich') {
            return data.body || `[Template: ${data.template_name}]`;
        }
    } catch {}
    return resolvedBody;
}

// Admin-only + WhatsApp enabled
router.use((req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
});
router.use(checkWhatsAppEnabled);

/**
 * POST /api/v1/whatsapp/chat/conversations/new
 * Start a new conversation by sending a template to a phone number
 */
router.post('/conversations/new', async (req, res) => {
    try {
        const { phone, contactName, templateName, templateParams = [], languageCode = 'en_US' } = req.body;
        if (!phone || !templateName) {
            return res.status(400).json({ error: 'Phone number and template name are required' });
        }

        const normalized = normalizePhone(phone);
        if (!normalized) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }

        // Check if conversation already exists for this phone
        let conversation = await get(
            'SELECT * FROM whatsapp_conversations WHERE phone = ? AND tenant_id = ?',
            [normalized, req.tenantId]
        );

        if (!conversation) {
            // Try to find matching contact
            const contact = await get(
                'SELECT id, name FROM contacts WHERE phone LIKE ? AND tenant_id = ?',
                [`%${normalized.slice(-10)}%`, req.tenantId]
            );

            // Create new conversation
            // Resolve template body for initial conversation preview
            const initialBody = await resolveTemplateBody(templateName, templateParams, req.tenant);

            await run(
                `INSERT INTO whatsapp_conversations (tenant_id, phone, contact_name, contact_id, last_message_text, last_message_at, window_expires_at)
                 VALUES (?, ?, ?, ?, ?, NOW(), NULL)`,
                [req.tenantId, normalized, contactName || contact?.name || normalized, contact?.id || null, getTemplatePlainText(initialBody).substring(0, 100)]
            );

            conversation = await get(
                'SELECT * FROM whatsapp_conversations WHERE phone = ? AND tenant_id = ?',
                [normalized, req.tenantId]
            );
        }

        // Resolve actual template body text
        const resolvedBody = await resolveTemplateBody(templateName, templateParams, req.tenant);

        // Send template via Meta API
        const result = await sendTemplateMessage(
            normalized, templateName, templateParams,
            contactName || conversation.contact_name || 'Customer',
            languageCode, req.tenant
        );

        // Store outbound message with actual template content
        await run(
            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
             VALUES (?, ?, 'outbound', 'template', ?, ?, 'sent', ?)`,
            [req.tenantId, conversation.id, resolvedBody, result.messageId, req.user.userId]
        );

        // Update conversation last message
        await run(
            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = NOW() WHERE id = ?`,
            [getTemplatePlainText(resolvedBody).substring(0, 100), conversation.id]
        );

        emitToTenant(req.tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });

        res.json({ success: true, conversationId: conversation.id, messageId: result.messageId });
    } catch (error) {
        console.error('Start new conversation error:', error);
        res.status(500).json({ error: error.message || 'Failed to start conversation' });
    }
});

/**
 * GET /api/v1/whatsapp/chat/conversations
 * List all conversations for this tenant
 */
router.get('/conversations', async (req, res) => {
    try {
        const { search, archived = '0', page = 1, limit = 30 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const isArchived = archived === '1' ? 1 : 0;
        let sql = `SELECT wc.*, c.name as matched_contact_name, c.email as matched_contact_email
                    FROM whatsapp_conversations wc
                    LEFT JOIN contacts c ON wc.contact_id = c.id
                    WHERE wc.tenant_id = ? AND wc.is_archived = ${isArchived}`;
        const params = [req.tenantId];

        if (search) {
            sql += ' AND (wc.contact_name LIKE ? OR wc.phone LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const safeLimit = parseInt(limit) || 30;
        const safeOffset = Math.max(0, offset);
        sql += ` ORDER BY wc.last_message_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

        const conversations = await query(sql, params);

        // Total unread count
        const unreadResult = await get(
            'SELECT SUM(unread_count) as total_unread FROM whatsapp_conversations WHERE tenant_id = ? AND is_archived = FALSE',
            [req.tenantId]
        );

        res.json({
            conversations: conversations.map(conv => ({
                ...conv,
                display_name: conv.matched_contact_name || conv.contact_name || conv.phone,
                is_window_open: conv.window_expires_at ? new Date(conv.window_expires_at) > new Date() : false,
                window_remaining_minutes: conv.window_expires_at
                    ? Math.max(0, Math.round((new Date(conv.window_expires_at) - new Date()) / 60000))
                    : 0,
            })),
            total_unread: unreadResult?.total_unread || 0,
        });
    } catch (error) {
        console.error('Fetch conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

/**
 * GET /api/v1/whatsapp/chat/conversations/:id/messages
 * Get messages for a conversation
 */
router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const conversation = await get(
            'SELECT * FROM whatsapp_conversations WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const safeLimit = parseInt(limit) || 50;
        const safeOffset = Math.max(0, offset);

        const messages = await query(
            `SELECT wcm.*, u.name as sender_name
             FROM whatsapp_chat_messages wcm
             LEFT JOIN users u ON wcm.sent_by = u.id
             WHERE wcm.conversation_id = ? AND wcm.tenant_id = ?
             ORDER BY wcm.created_at ASC
             LIMIT ${safeLimit} OFFSET ${safeOffset}`,
            [req.params.id, req.tenantId]
        );

        const total = await get(
            'SELECT COUNT(*) as count FROM whatsapp_chat_messages WHERE conversation_id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );

        console.log(`[Chat API] Fetched ${messages.length} messages for conv=${req.params.id}, tenant=${req.tenantId}, total=${total?.count || 0}`);

        res.json({
            conversation: {
                ...conversation,
                is_window_open: conversation.window_expires_at ? new Date(conversation.window_expires_at) > new Date() : false,
                window_remaining_minutes: conversation.window_expires_at
                    ? Math.max(0, Math.round((new Date(conversation.window_expires_at) - new Date()) / 60000))
                    : 0,
            },
            messages,
            total: total?.count || 0,
        });
    } catch (error) {
        console.error('Fetch messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/v1/whatsapp/chat/conversations/:id/send
 * Send a free-form text reply (within 24h window)
 */
router.post('/conversations/:id/send', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'Message text is required' });

        const conversation = await get(
            'SELECT * FROM whatsapp_conversations WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        // Check 24h window
        const windowOpen = conversation.window_expires_at && new Date(conversation.window_expires_at) > new Date();
        if (!windowOpen) {
            return res.status(400).json({
                error: '24-hour messaging window has expired. Send a template message to re-engage.',
                window_expired: true,
            });
        }

        // Send via Meta API
        const result = await sendTextMessage(conversation.phone, text.trim(), req.tenant);

        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Store outbound message
        await run(
            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
             VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent', ?)`,
            [req.tenantId, conversation.id, text.trim(), result.messageId, req.user.userId]
        );

        // Update conversation
        await run(
            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ? WHERE id = ?`,
            [text.trim().substring(0, 100), now, conversation.id]
        );

        emitToTenant(req.tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });

        res.json({ success: true, messageId: result.messageId });
    } catch (error) {
        console.error('Send chat message error:', error);
        res.status(500).json({ error: error.message || 'Failed to send message' });
    }
});

/**
 * POST /api/v1/whatsapp/chat/conversations/:id/send-media
 * Send an image or document (within 24h window)
 */
router.post('/conversations/:id/send-media', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No media file provided' });
        
        const conversation = await get(
            'SELECT * FROM whatsapp_conversations WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const now = new Date();
        const windowExpires = conversation.window_expires_at ? new Date(conversation.window_expires_at) : new Date(0);
        if (now > windowExpires) {
            return res.status(400).json({ error: '24-hour service window has expired. You can only send template messages.' });
        }

        // 1. Upload media to Meta
        let uploadMime = req.file.mimetype;
        let uploadName = req.file.originalname;
        let uploadBuffer = req.file.buffer;

        // Meta Cloud API does not support audio/webm. If webm audio is received,
        // we transcode the binary WebM buffer to native OGG Opus container using FFmpeg.
        if (uploadMime.includes('webm') || uploadName.endsWith('.webm')) {
            try {
                const { transcodeWebmToOgg } = await import('../services/transcoder.js');
                uploadBuffer = await transcodeWebmToOgg(req.file.buffer);
                uploadMime = 'audio/ogg';
                uploadName = uploadName.replace(/\.webm$/, '.ogg');
                req.file.mimetype = 'audio/ogg';
                req.file.originalname = uploadName;
                req.file.buffer = uploadBuffer; // update in file object too
            } catch (transcodeErr) {
                console.error('[Transcoder] WebM to OGG transcoding failed:', transcodeErr.message);
                return res.status(400).json({ error: 'Failed to process voice note audio format: ' + transcodeErr.message });
            }
        }

        const metaMediaId = await uploadMediaForMessage(uploadBuffer, uploadMime, uploadName, req.tenant);
        
        // 2. Send media message using the Meta ID
        const isImage = req.file.mimetype.startsWith('image/');
        const isAudio = req.file.mimetype.startsWith('audio/');
        const isVideo = req.file.mimetype.startsWith('video/');
        let mediaType = 'document';
        if (isImage) mediaType = 'image';
        else if (isAudio) mediaType = 'audio';
        else if (isVideo) mediaType = 'video';
        
        const result = await sendMediaMessage(conversation.phone, mediaType, { id: metaMediaId }, req.body.caption || '', req.tenant);

        // 3. Save media locally so we can display it in the chat interface 
        // (Meta doesn't allow downloading outbound media via API)
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        
        const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const localFileName = `${Date.now()}_${safeFilename}`;
        fs.writeFileSync(path.join(uploadDir, localFileName), req.file.buffer);
        const localMediaId = `local_media:${localFileName}`;

        const nowStr = now.toISOString().slice(0, 19).replace('T', ' ');

        // 4. Save to database using the localMediaId
        await run(
            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, media_id, media_mime_type, provider_message_id, status, sent_by)
             VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, 'sent', ?)`,
            [req.tenantId, conversation.id, mediaType, req.body.caption || '', localMediaId, req.file.mimetype, result.messageId, req.user.userId]
        );

        // Update conversation
        let preview = `📎 Document`;
        if (isImage) preview = `📷 Image`;
        else if (isAudio) preview = `🎤 Voice Note`;
        else if (isVideo) preview = `🎥 Video`;

        await run(
            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ? WHERE id = ?`,
            [req.body.caption || preview, nowStr, conversation.id]
        );

        emitToTenant(req.tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });

        res.json({ success: true, messageId: result.messageId });
    } catch (error) {
        console.error('Send media message error:', error);
        res.status(500).json({ error: error.message || 'Failed to send media' });
    }
});

/**
 * POST /api/v1/whatsapp/chat/conversations/:id/send-template
 * Send a template message (when 24h window expired)
 */
router.post('/conversations/:id/send-template', async (req, res) => {
    try {
        const { templateName, templateParams = [], languageCode } = req.body;
        if (!templateName) return res.status(400).json({ error: 'Template name is required' });

        const conversation = await get(
            'SELECT * FROM whatsapp_conversations WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        // Import sendTemplateMessage
        const { sendTemplateMessage } = await import('../services/whatsapp.js');

        // Resolve actual template body text
        const resolvedBody = await resolveTemplateBody(templateName, templateParams, req.tenant);

        const result = await sendTemplateMessage(
            conversation.phone, templateName, templateParams,
            conversation.contact_name || 'Customer', languageCode, req.tenant
        );

        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        await run(
            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
             VALUES (?, ?, 'outbound', 'template', ?, ?, 'sent', ?)`,
            [req.tenantId, conversation.id, resolvedBody, result.messageId, req.user.userId]
        );

        await run(
            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ? WHERE id = ?`,
            [getTemplatePlainText(resolvedBody).substring(0, 100), now, conversation.id]
        );

        emitToTenant(req.tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });

        res.json({ success: true, messageId: result.messageId });
    } catch (error) {
        console.error('Send template in chat error:', error);
        res.status(500).json({ error: error.message || 'Failed to send template' });
    }
});

/**
 * PATCH /api/v1/whatsapp/chat/conversations/:id/read
 * Mark conversation as read
 */
router.patch('/conversations/:id/read', async (req, res) => {
    try {
        await run(
            'UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

/**
 * PATCH /api/v1/whatsapp/chat/conversations/:id/archive
 * Toggle archive status
 */
router.patch('/conversations/:id/archive', async (req, res) => {
    try {
        const conv = await get(
            'SELECT is_archived FROM whatsapp_conversations WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId]
        );
        if (!conv) return res.status(404).json({ error: 'Not found' });

        await run(
            'UPDATE whatsapp_conversations SET is_archived = ? WHERE id = ? AND tenant_id = ?',
            [!conv.is_archived, req.params.id, req.tenantId]
        );
        res.json({ success: true, is_archived: !conv.is_archived });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update' });
    }
});

/**
 * GET /api/v1/whatsapp/chat/media/:media_id
 * Proxy endpoint to fetch media from Meta API and serve to frontend
 */
router.get('/media/:media_id', async (req, res) => {
    try {
        const { media_id } = req.params;

        // Verify the media belongs to the tenant
        const msg = await get(
            'SELECT media_mime_type FROM whatsapp_chat_messages WHERE media_id = ? AND tenant_id = ? LIMIT 1',
            [media_id, req.tenantId]
        );
        if (!msg) return res.status(404).json({ error: 'Media not found or unauthorized' });

        // Handle local outbound media
        if (media_id.startsWith('local_media:')) {
            const fileName = media_id.replace('local_media:', '');
            // Prevent directory traversal
            const safeName = path.basename(fileName);
            const filePath = path.join(process.cwd(), 'uploads', safeName);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Local media file not found on disk' });
            }
            
            res.setHeader('Content-Type', msg.media_mime_type || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            return fs.createReadStream(filePath).pipe(res);
        }

        // Handle inbound media from Meta
        const tenant = await get('SELECT whatsapp_access_token FROM tenants WHERE id = ?', [req.tenantId]);
        if (!tenant || !tenant.whatsapp_access_token) return res.status(400).json({ error: 'WhatsApp not configured' });

        // 1. Get media URL from Meta
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${media_id}`, {
            headers: { Authorization: `Bearer ${tenant.whatsapp_access_token}` }
        });
        const metaData = await metaRes.json();
        if (!metaData.url) throw new Error('Failed to get media URL from Meta: ' + JSON.stringify(metaData));

        // 2. Download media binary
        const mediaRes = await fetch(metaData.url, {
            headers: { Authorization: `Bearer ${tenant.whatsapp_access_token}` }
        });

        if (!mediaRes.ok) throw new Error('Failed to download media binary');

        // Set Content-Type from database or meta response
        res.setHeader('Content-Type', metaData.mime_type || msg.media_mime_type || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

        // 3. Pipe binary to response
        const arrayBuffer = await mediaRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);

    } catch (error) {
        console.error('Media download error:', error.message);
        res.status(500).json({ error: 'Failed to download media' });
    }
});

export default router;



//https://crm-api.mahalaxmi.associates/api/v1/whatsapp-webhook