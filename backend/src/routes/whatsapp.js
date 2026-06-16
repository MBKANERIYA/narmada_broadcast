import { Router } from 'express';
import multer from 'multer';
import { query, run, get, getTenantById } from '../database.js';
import { sendTemplateMessage, sendBulkMessages, normalizePhone, uploadMediaForTemplate, createTemplate, editTemplate, fetchTemplates, deleteTemplate } from '../services/whatsapp.js';
import { checkWhatsAppEnabled } from '../middleware/limits.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Admin-only + WhatsApp plan check
router.use((req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required for WhatsApp features' });
    }
    next();
});
router.use(checkWhatsAppEnabled);

/**
 * GET /api/v1/whatsapp/recipients
 * Fetch contacts as broadcast recipients with filtering
 */
router.get('/recipients', async (req, res) => {
    try {
        const { tag, label, search, location, min_ticket, max_ticket } = req.query;

        let sql = `SELECT id, name, phone, email, location, ticket_size, tags, labels, whatsapp_consent 
                    FROM contacts WHERE tenant_id = ? AND phone IS NOT NULL AND phone != '' AND whatsapp_consent = TRUE`;
        const params = [req.tenantId];

        if (label) {
            sql += ' AND LOWER(labels) LIKE LOWER(?)';
            params.push(`%"${label}"%`);
        }

        if (location) {
            sql += ' AND location LIKE ?';
            params.push(`%${location}%`);
        }

        if (min_ticket) {
            sql += ' AND ticket_size >= ?';
            params.push(parseFloat(min_ticket));
        }

        if (max_ticket) {
            sql += ' AND ticket_size <= ?';
            params.push(parseFloat(max_ticket));
        }

        if (search) {
            const keywords = search.split(',').map(k => k.trim()).filter(k => k.length > 0);
            for (const keyword of keywords) {
                sql += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR location LIKE ?)';
                const s = `%${keyword}%`;
                params.push(s, s, s, s);
            }
        }

        sql += ' ORDER BY name ASC';

        const contacts = await query(sql, params);

        const withValid = contacts.map(c => ({
            ...c,
            tags: c.tags ? (typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags) : [],
            validPhone: !!normalizePhone(c.phone),
        }));

        res.json({
            contacts: withValid,
            counts: {
                total: contacts.length,
                withValidPhone: withValid.filter(c => c.validPhone).length,
            }
        });
    } catch (error) {
        console.error('WhatsApp recipients error:', error);
        res.status(500).json({ error: 'Failed to fetch recipients' });
    }
});

/**
 * POST /api/v1/whatsapp/send
 * Send a single template message
 */
router.post('/send', async (req, res) => {
    try {
        const { phone, campaignName, templateParams = [], userName = '', languageCode } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number is required' });
        if (!campaignName) return res.status(400).json({ error: 'Campaign name is required' });

        const data = await sendTemplateMessage(phone, campaignName, templateParams, userName, languageCode, req.tenant);
        res.json({ success: true, message: 'Message sent', data });
    } catch (error) {
        console.error('WhatsApp send error:', error);
        res.status(500).json({ error: error.message || 'Failed to send message' });
    }
});

/**
 * POST /api/v1/whatsapp/broadcast
 * Broadcast template to filtered contacts
 */
router.post('/broadcast', async (req, res) => {
    try {
        const { campaignName, templateParams = [], recipientType, recipientFilter, recipientIds, languageCode } = req.body;
        if (!campaignName) return res.status(400).json({ error: 'Campaign name is required' });

        let recipients = [];

        if (recipientType === 'custom' && recipientIds && recipientIds.length > 0) {
            // Custom selection by IDs
            const placeholders = recipientIds.map(() => '?').join(',');
            const contacts = await query(
                `SELECT id, name, phone FROM contacts WHERE tenant_id = ? AND id IN (${placeholders}) AND phone IS NOT NULL AND phone != ''`,
                [req.tenantId, ...recipientIds]
            );
            recipients = contacts;

        } else if (recipientType === 'labeled' && recipientFilter?.label) {
            // Filter by label (e.g. "vip", "follow_up", "complaint")
            const contacts = await query(
                `SELECT id, name, phone FROM contacts WHERE tenant_id = ? AND phone IS NOT NULL AND phone != '' AND whatsapp_consent = TRUE AND LOWER(labels) LIKE LOWER(?)`,
                [req.tenantId, `%"${recipientFilter.label}"%`]
            );
            recipients = contacts;

        } else {
            // All contacts
            const contacts = await query(
                `SELECT id, name, phone FROM contacts WHERE tenant_id = ? AND phone IS NOT NULL AND phone != '' AND whatsapp_consent = TRUE`,
                [req.tenantId]
            );
            recipients = contacts;
        }

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No valid recipients found' });
        }

        const campaign = await run(`
            INSERT INTO whatsapp_campaigns (tenant_id, name, campaign_name, recipient_type, recipient_filter, total_recipients, status, sent_by)
            VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)
        `, [
            req.tenantId,
            `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
            campaignName,
            recipientType || 'all',
            JSON.stringify(recipientFilter || {}),
            recipients.length,
            req.user.userId,
        ]);

        const campaignId = campaign.lastInsertRowid;

        // Process in background
        processBroadcast(campaignId, recipients, campaignName, templateParams, languageCode, req.tenant, req.tenantId).catch(err => {
            console.error('Broadcast processing error:', err);
        });

        res.json({
            success: true,
            campaignId,
            totalRecipients: recipients.length,
            message: `Broadcasting to ${recipients.length} recipients.`,
        });
    } catch (error) {
        console.error('WhatsApp broadcast error:', error);
        res.status(500).json({ error: error.message || 'Failed to start broadcast' });
    }
});

async function processBroadcast(campaignId, recipients, campaignName, templateParams, languageCode, tenant, tenantId) {
    try {
        // Step 1: Reload tenant from DB to get fresh WhatsApp credentials (cache may be stale)
        console.log(`[Broadcast #${campaignId}] Step 1: Reloading tenant ${tenantId} from DB...`);
        const freshTenant = await getTenantById(tenantId);
        if (!freshTenant) {
            throw new Error(`Tenant ${tenantId} not found in database`);
        }
        if (!freshTenant.whatsapp_access_token || !freshTenant.whatsapp_phone_number_id) {
            throw new Error('WhatsApp credentials missing. Please reconfigure in Settings.');
        }
        console.log(`[Broadcast #${campaignId}] Tenant loaded. WhatsApp configured: ${freshTenant.whatsapp_configured}, WABA ID: ${freshTenant.whatsapp_business_account_id || 'MISSING'}`);

        // Step 2: Insert pending message records
        console.log(`[Broadcast #${campaignId}] Step 2: Inserting ${recipients.length} pending message records...`);
        for (const r of recipients) {
            await run(
                `INSERT INTO whatsapp_messages (tenant_id, campaign_id, phone, recipient_name, recipient_id, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [tenantId, campaignId, normalizePhone(r.phone) || r.phone, r.name, r.id]
            );
        }
        console.log(`[Broadcast #${campaignId}] Pending records inserted.`);

        // Step 3: Send messages via Meta API (using fresh tenant credentials)
        console.log(`[Broadcast #${campaignId}] Step 3: Sending ${recipients.length} messages via Meta API (template: ${campaignName})...`);
        const results = await sendBulkMessages(recipients, campaignName, templateParams, 50, 1000, languageCode, freshTenant);
        console.log(`[Broadcast #${campaignId}] Send complete. Success: ${results.successful}, Failed: ${results.failed}`);
        if (results.errors.length > 0) {
            console.log(`[Broadcast #${campaignId}] Errors:`, results.errors.slice(0, 5));
        }

        // Step 4: Update message statuses in DB
        for (const msg of results.messageIds) {
            await run(
                `UPDATE whatsapp_messages SET status = 'sent', sent_at = CURRENT_TIMESTAMP, provider_message_id = ? WHERE campaign_id = ? AND phone = ? AND tenant_id = ?`,
                [msg.messageId, campaignId, msg.phone, tenantId]
            );
        }
        for (const err of results.errors) {
            const normalized = normalizePhone(err.phone) || err.phone;
            await run(
                `UPDATE whatsapp_messages SET status = 'failed', error_message = ? WHERE campaign_id = ? AND phone = ? AND tenant_id = ?`,
                [err.error, campaignId, normalized, tenantId]
            );
        }

        // Step 5: Mark campaign completed
        await run(`
            UPDATE whatsapp_campaigns 
            SET status = 'completed', successful_count = ?, failed_count = ?, completed_at = NOW(), error_log = ?
            WHERE id = ? AND tenant_id = ?
        `, [
            results.successful,
            results.failed,
            results.errors.length > 0 ? JSON.stringify(results.errors.slice(0, 50)) : null,
            campaignId,
            tenantId,
        ]);
        console.log(`[Broadcast #${campaignId}] Campaign marked completed.`);
    } catch (error) {
        console.error(`[Broadcast #${campaignId}] FATAL ERROR:`, error.message, error.stack);
        try {
            await run(
                `UPDATE whatsapp_campaigns SET status = 'failed', error_log = ? WHERE id = ? AND tenant_id = ?`,
                [error.message, campaignId, tenantId]
            );
        } catch (dbErr) {
            console.error(`[Broadcast #${campaignId}] Failed to update campaign status:`, dbErr.message);
        }
    }
}

/**
 * GET /api/v1/whatsapp/campaigns
 */
router.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await query(`
            SELECT wc.*, u.name as sent_by_name
            FROM whatsapp_campaigns wc
            LEFT JOIN users u ON wc.sent_by = u.id
            WHERE wc.tenant_id = ?
            ORDER BY wc.created_at DESC
            LIMIT 50
        `, [req.tenantId]);
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

/**
 * GET /api/v1/whatsapp/campaigns/:id
 */
router.get('/campaigns/:id', async (req, res) => {
    try {
        const campaign = await get(
            `SELECT wc.*, u.name as sent_by_name FROM whatsapp_campaigns wc LEFT JOIN users u ON wc.sent_by = u.id WHERE wc.id = ? AND wc.tenant_id = ?`,
            [req.params.id, req.tenantId]
        );
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        const messages = await query(
            `SELECT * FROM whatsapp_messages WHERE campaign_id = ? AND tenant_id = ? ORDER BY id`,
            [req.params.id, req.tenantId]
        );

        res.json({ ...campaign, messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch campaign details' });
    }
});

/**
 * POST /api/v1/whatsapp/templates/upload-image
 */
router.post('/templates/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image file provided' });

        const headerHandle = await uploadMediaForTemplate(req.file.buffer, req.file.mimetype, req.file.originalname, req.tenant);
        res.json({ success: true, headerHandle });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to upload image' });
    }
});

/**
 * POST /api/v1/whatsapp/templates
 */
router.post('/templates', async (req, res) => {
    try {
        const { name, category, language, bodyText, headerImageHandle, footerText, buttons } = req.body;
        if (!name) return res.status(400).json({ error: 'Template name is required' });
        if (!bodyText) return res.status(400).json({ error: 'Body text is required' });

        const result = await createTemplate({
            name, category: category || 'MARKETING', language: language || 'en',
            bodyText, headerImageHandle: headerImageHandle || null,
            footerText: footerText || null, buttons: buttons || [],
        }, req.tenant);

        try {
            await run(`
                INSERT INTO whatsapp_templates (tenant_id, meta_template_id, name, category, language, body_text, has_header_image, footer_text, buttons_json, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                req.tenantId, result.id, name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                category || 'MARKETING', language || 'en', bodyText,
                headerImageHandle ? 1 : 0, footerText || null,
                JSON.stringify(buttons || []),
                result.status || 'PENDING', req.user.userId,
            ]);
        } catch (dbErr) {
            console.error('Failed to save template to local DB:', dbErr.message);
        }

        res.json({ success: true, template: result });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to create template' });
    }
});

/**
 * GET /api/v1/whatsapp/templates
 */
/**
 * PUT /api/v1/whatsapp/templates/:id
 * Edit an existing template (Meta API updates components only)
 */
router.put('/templates/:id', async (req, res) => {
    try {
        const { bodyText, headerImageHandle, footerText, buttons } = req.body;
        if (!bodyText) return res.status(400).json({ error: 'Body text is required' });

        const result = await editTemplate(req.params.id, {
            bodyText,
            headerImageHandle: headerImageHandle || null,
            footerText: footerText || null,
            buttons: buttons || [],
        }, req.tenant);

        // Update local DB record if exists
        try {
            await run(`
                UPDATE whatsapp_templates
                SET body_text = ?, footer_text = ?, has_header_image = ?, buttons_json = ?, status = 'PENDING'
                WHERE meta_template_id = ? AND tenant_id = ?
            `, [
                bodyText,
                footerText || null,
                headerImageHandle ? 1 : 0,
                JSON.stringify(buttons || []),
                req.params.id,
                req.tenantId,
            ]);
        } catch (dbErr) {
            console.error('Failed to update template in local DB:', dbErr.message);
        }

        res.json({ success: true, template: result });
    } catch (error) {
        console.error('Template edit error:', error);
        res.status(500).json({ error: error.message || 'Failed to edit template' });
    }
});

/**
 * GET /api/v1/whatsapp/templates
 */
router.get('/templates', async (req, res) => {
    try {
        const templates = await fetchTemplates(req.tenant);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to fetch templates' });
    }
});

/**
 * DELETE /api/v1/whatsapp/templates/:name
 */
router.delete('/templates/:name', async (req, res) => {
    try {
        await deleteTemplate(req.params.name, req.tenant);
        try { await run('DELETE FROM whatsapp_templates WHERE name = ? AND tenant_id = ?', [req.params.name, req.tenantId]); } catch (e) {}
        res.json({ success: true, message: `Template "${req.params.name}" deleted` });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to delete template' });
    }
});

export default router;
