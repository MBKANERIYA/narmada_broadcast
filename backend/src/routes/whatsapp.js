import { Router } from 'express';
import multer from 'multer';
import { query, run, get } from '../database.js';
import { sendTemplateMessage, sendBulkMessages, normalizePhone, uploadMediaForTemplate, createTemplate, fetchTemplates, deleteTemplate } from '../services/whatsapp.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

/**
 * Middleware: Admin-only access for all WhatsApp routes
 */
router.use((req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required for WhatsApp features' });
    }
    next();
});

/**
 * GET /api/v1/whatsapp/recipients
 * Get recipient counts and lists for audience selection
 * Query: type=clients|leads|all, status=new|contacted|qualified
 */
router.get('/recipients', async (req, res) => {
    try {
        const { type = 'all', status, search } = req.query;

        const result = { clients: [], leads: [], counts: {} };

        // Helper to add search filter to sql arrays
        // Supports comma-separated keywords: each keyword is an AND filter
        // e.g. "Ahmedabad, Rahul" => must match BOTH "Ahmedabad" AND "Rahul"
        const applySearch = (sql, params, forLeads = false) => {
            let filteredSql = sql;
            if (search) {
                // Split by comma, trim each keyword, remove empties
                const keywords = search.split(',').map(k => k.trim()).filter(k => k.length > 0);
                
                for (const keyword of keywords) {
                    // Check if keyword is a pure number (for price/budget filtering)
                    const isNumeric = /^\d+(\.\d+)?$/.test(keyword);
                    
                    if (isNumeric) {
                        const numValue = parseFloat(keyword);
                        if (forLeads) {
                            filteredSql += ` AND (budget_max >= ? OR budget_min >= ?)`;
                            params.push(numValue, numValue);
                        } else {
                            filteredSql += ` AND (price >= ?)`;
                            params.push(numValue);
                        }
                    } else {
                        const searchTerm = `%${keyword}%`;
                        if (forLeads) {
                            filteredSql += ` AND (name LIKE ? OR email LIKE ? OR location LIKE ? OR budget_max LIKE ? OR budget_min LIKE ?)`;
                            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
                        } else {
                            filteredSql += ` AND (name LIKE ? OR email LIKE ? OR location LIKE ? OR price LIKE ?)`;
                            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
                        }
                    }
                }
            }
            return { sql: filteredSql, params };
        };

        if (type === 'clients' || type === 'all') {
            const baseSql = `SELECT id, name, phone, alternate_phone, email, whatsapp_consent 
                 FROM clients WHERE phone IS NOT NULL AND phone != ''`;
            const { sql: clientSql, params: clientParams } = applySearch(baseSql, [], false);
            
            const clients = await query(clientSql, clientParams);
            result.clients = clients.map(c => ({
                ...c,
                validPhone: !!normalizePhone(c.phone),
                type: 'client',
            }));
            result.counts.clients = clients.length;
            result.counts.clientsWithValidPhone = clients.filter(c => normalizePhone(c.phone)).length;
        }

        if (type === 'leads' || type === 'all') {
            let baseSql = `SELECT id, name, phone, email, status, whatsapp_consent 
                           FROM leads WHERE phone IS NOT NULL AND phone != '' AND status NOT IN ('rejected', 'client')`;
            const initParams = [];
            if (status) {
                baseSql += ' AND status = ?';
                initParams.push(status);
            }
            const { sql: leadSql, params: leadParams } = applySearch(baseSql, initParams, true);
            
            const leads = await query(leadSql, leadParams);
            result.leads = leads.map(l => ({
                ...l,
                validPhone: !!normalizePhone(l.phone),
                type: 'lead',
            }));
            result.counts.leads = leads.length;
            result.counts.leadsWithValidPhone = leads.filter(l => normalizePhone(l.phone)).length;
        }

        result.counts.total = (result.counts.clientsWithValidPhone || 0) + (result.counts.leadsWithValidPhone || 0);

        res.json(result);
    } catch (error) {
        console.error('WhatsApp recipients error:', error);
        res.status(500).json({ error: 'Failed to fetch recipients' });
    }
});

/**
 * POST /api/v1/whatsapp/send
 * Send a single test message
 * Body: { phone, campaignName, templateParams, userName, languageCode }
 */
router.post('/send', async (req, res) => {
    try {
        const { phone, campaignName, templateParams = [], userName = '', languageCode } = req.body;

        if (!phone) return res.status(400).json({ error: 'Phone number is required' });
        if (!campaignName) return res.status(400).json({ error: 'Campaign name is required' });

        const data = await sendTemplateMessage(phone, campaignName, templateParams, userName, languageCode);

        res.json({ success: true, message: 'Message sent', data });
    } catch (error) {
        console.error('WhatsApp send error:', error);
        res.status(500).json({ error: error.message || 'Failed to send message' });
    }
});

/**
 * POST /api/v1/whatsapp/broadcast
 * Send bulk messages to selected recipients
 * Body: { campaignName, templateParams, recipientType, recipientFilter, recipientIds, languageCode }
 */
router.post('/broadcast', async (req, res) => {
    try {
        const { campaignName, templateParams = [], recipientType, recipientFilter, recipientIds, languageCode } = req.body;

        if (!campaignName) return res.status(400).json({ error: 'Campaign name is required' });
        if (!recipientType) return res.status(400).json({ error: 'Recipient type is required' });

        // Build recipient list
        let recipients = [];

        if (recipientType === 'custom' && recipientIds) {
            // Custom selection — get by IDs  
            const { clientIds = [], leadIds = [] } = recipientIds;

            if (clientIds.length > 0) {
                const placeholders = clientIds.map(() => '?').join(',');
                const clients = await query(
                    `SELECT id, name, phone FROM clients WHERE id IN (${placeholders}) AND phone IS NOT NULL AND phone != ''`,
                    clientIds
                );
                recipients.push(...clients.map(c => ({ ...c, type: 'client' })));
            }

            if (leadIds.length > 0) {
                const placeholders = leadIds.map(() => '?').join(',');
                const leads = await query(
                    `SELECT id, name, phone FROM leads WHERE id IN (${placeholders}) AND phone IS NOT NULL AND phone != ''`,
                    leadIds
                );
                recipients.push(...leads.map(l => ({ ...l, type: 'lead' })));
            }
        } else if (recipientType === 'all_clients') {
            const clients = await query(
                `SELECT id, name, phone FROM clients WHERE phone IS NOT NULL AND phone != ''`
            );
            recipients = clients.map(c => ({ ...c, type: 'client' }));

        } else if (recipientType === 'all_leads') {
            const leads = await query(
                `SELECT id, name, phone FROM leads WHERE phone IS NOT NULL AND phone != '' AND status NOT IN ('rejected', 'client')`
            );
            recipients = leads.map(l => ({ ...l, type: 'lead' }));

        } else if (recipientType === 'leads_by_status') {
            const status = recipientFilter?.status;
            if (!status) return res.status(400).json({ error: 'Status filter is required for leads_by_status' });

            const leads = await query(
                `SELECT id, name, phone FROM leads WHERE phone IS NOT NULL AND phone != '' AND status = ?`,
                [status]
            );
            recipients = leads.map(l => ({ ...l, type: 'lead' }));
        }

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No valid recipients found' });
        }

        // Create campaign record
        const campaign = await run(`
            INSERT INTO whatsapp_campaigns (name, campaign_name, recipient_type, recipient_filter, total_recipients, status, sent_by)
            VALUES (?, ?, ?, ?, ?, 'processing', ?)
        `, [
            `Broadcast ${new Date().toLocaleDateString('en-IN')}`,
            campaignName,
            recipientType,
            JSON.stringify(recipientFilter || {}),
            recipients.length,
            req.user.userId,
        ]);

        const campaignId = campaign.lastInsertRowid;

        // Send messages in background (don't await — respond immediately)
        processBroadcast(campaignId, recipients, campaignName, templateParams, languageCode).catch(err => {
            console.error('Broadcast processing error:', err);
        });

        res.json({
            success: true,
            campaignId,
            totalRecipients: recipients.length,
            message: `Broadcasting to ${recipients.length} recipients. Check campaign status for progress.`,
        });
    } catch (error) {
        console.error('WhatsApp broadcast error:', error);
        res.status(500).json({ error: error.message || 'Failed to start broadcast' });
    }
});

/**
 * Process broadcast in background
 */
async function processBroadcast(campaignId, recipients, campaignName, templateParams, languageCode) {
    try {
        // Log each recipient
        for (const r of recipients) {
            await run(`
                INSERT INTO whatsapp_messages (campaign_id, phone, recipient_name, recipient_type, recipient_id, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
            `, [campaignId, normalizePhone(r.phone) || r.phone, r.name, r.type, r.id]);
        }

        // Send bulk messages
        const results = await sendBulkMessages(recipients, campaignName, templateParams, 50, 1000, languageCode);

        // Update individual message statuses
        for (const msg of results.messageIds) {
            await run(
                `UPDATE whatsapp_messages SET status = 'sent', sent_at = CURRENT_TIMESTAMP, provider_message_id = ? WHERE campaign_id = ? AND phone = ?`,
                [msg.messageId, campaignId, msg.phone]
            );
        }
        for (const err of results.errors) {
            const normalized = normalizePhone(err.phone) || err.phone;
            await run(
                `UPDATE whatsapp_messages SET status = 'failed', error_message = ? WHERE campaign_id = ? AND phone = ?`,
                [err.error, campaignId, normalized]
            );
        }

        // Update campaign status
        await run(`
            UPDATE whatsapp_campaigns 
            SET status = 'completed', successful_count = ?, failed_count = ?, completed_at = NOW(),
                error_log = ?
            WHERE id = ?
        `, [
            results.successful,
            results.failed,
            results.errors.length > 0 ? JSON.stringify(results.errors.slice(0, 50)) : null,
            campaignId,
        ]);
    } catch (error) {
        console.error('Broadcast processing fatal error:', error);
        await run(
            `UPDATE whatsapp_campaigns SET status = 'failed', error_log = ? WHERE id = ?`,
            [error.message, campaignId]
        );
    }
}

/**
 * GET /api/v1/whatsapp/campaigns
 * Get campaign history
 */
router.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await query(`
            SELECT wc.*, u.name as sent_by_name
            FROM whatsapp_campaigns wc
            LEFT JOIN users u ON wc.sent_by = u.id
            ORDER BY wc.created_at DESC
            LIMIT 50
        `);
        res.json(campaigns);
    } catch (error) {
        console.error('WhatsApp campaigns list error:', error);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

/**
 * GET /api/v1/whatsapp/campaigns/:id
 * Get campaign details with message log
 */
router.get('/campaigns/:id', async (req, res) => {
    try {
        const campaign = await get(
            `SELECT wc.*, u.name as sent_by_name FROM whatsapp_campaigns wc LEFT JOIN users u ON wc.sent_by = u.id WHERE wc.id = ?`,
            [req.params.id]
        );
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        const messages = await query(
            `SELECT * FROM whatsapp_messages WHERE campaign_id = ? ORDER BY id`,
            [req.params.id]
        );

        res.json({ ...campaign, messages });
    } catch (error) {
        console.error('WhatsApp campaign detail error:', error);
        res.status(500).json({ error: 'Failed to fetch campaign details' });
    }
});

/**
 * POST /api/v1/whatsapp/templates/upload-image
 * Upload an image to Meta for use as template header
 * Returns the header_handle needed for template creation
 */
router.post('/templates/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const headerHandle = await uploadMediaForTemplate(
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname
        );

        res.json({ success: true, headerHandle });
    } catch (error) {
        console.error('Template image upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload image' });
    }
});

/**
 * POST /api/v1/whatsapp/templates
 * Create a new WhatsApp message template
 * Body: { name, category, language, bodyText, headerImageHandle, footerText, callButtonText, callButtonPhone }
 */
router.post('/templates', async (req, res) => {
    try {
        const { name, category, language, bodyText, headerImageHandle, footerText, callButtonText, callButtonPhone } = req.body;

        if (!name) return res.status(400).json({ error: 'Template name is required' });
        if (!bodyText) return res.status(400).json({ error: 'Body text is required' });

        const result = await createTemplate({
            name,
            category: category || 'MARKETING',
            language: language || 'en',
            bodyText,
            headerImageHandle: headerImageHandle || null,
            footerText: footerText || null,
            callButtonText: callButtonText || null,
            callButtonPhone: callButtonPhone || null,
        });

        // Save to local DB for reference
        try {
            await run(`
                INSERT INTO whatsapp_templates (meta_template_id, name, category, language, body_text, has_header_image, footer_text, call_button_text, call_button_phone, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                result.id,
                name.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                category || 'MARKETING',
                language || 'en',
                bodyText,
                headerImageHandle ? 1 : 0,
                footerText || null,
                callButtonText || null,
                callButtonPhone || null,
                result.status || 'PENDING',
                req.user.userId,
            ]);
        } catch (dbErr) {
            console.error('Failed to save template to local DB:', dbErr.message);
            // Non-fatal — template was created on Meta successfully
        }

        res.json({ success: true, template: result });
    } catch (error) {
        console.error('Template creation error:', error);
        res.status(500).json({ error: error.message || 'Failed to create template' });
    }
});

/**
 * GET /api/v1/whatsapp/templates
 * List all templates from Meta WhatsApp Business Account
 */
router.get('/templates', async (req, res) => {
    try {
        const templates = await fetchTemplates();
        res.json(templates);
    } catch (error) {
        console.error('Fetch templates error:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch templates' });
    }
});

/**
 * DELETE /api/v1/whatsapp/templates/:name
 * Delete a template by name
 */
router.delete('/templates/:name', async (req, res) => {
    try {
        await deleteTemplate(req.params.name);

        // Also remove from local DB
        try {
            await run('DELETE FROM whatsapp_templates WHERE name = ?', [req.params.name]);
        } catch (dbErr) {
            // Non-fatal
        }

        res.json({ success: true, message: `Template "${req.params.name}" deleted` });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: error.message || 'Failed to delete template' });
    }
});

export default router;
