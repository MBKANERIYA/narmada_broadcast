import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/leads
 */
router.get('/', async (req, res) => {
    try {
        const { status, assigned_to, search, escalated } = req.query;
        const isAdmin = req.user?.role === 'admin';

        let sql = `
      SELECT l.*, l.source as source_name, u.name as assigned_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.tenant_id = ?
    `;
        const params = [req.tenantId];

        if (!isAdmin) {
            sql += ' AND l.escalated = 0';
        }

        if (isAdmin && escalated === '1') {
            sql += ' AND l.escalated = 1 AND l.status NOT IN (?, ?)';
            params.push('rejected', 'client');
        }

        if (req.query.archived === '1') {
            sql += ' AND l.status IN (?, ?)';
            params.push('rejected', 'client');
        } else if (status) {
            sql += ' AND l.status = ?';
            params.push(status);
        }

        if (assigned_to) {
            sql += ' AND l.assigned_to = ?';
            params.push(assigned_to);
        }

        if (search) {
            sql += ' AND (l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        sql += ' ORDER BY l.created_at DESC LIMIT 500';

        const leads = await query(sql, params);
        res.json(leads);
    } catch (error) {
        console.error('Leads list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/leads/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const lead = await get(`
      SELECT l.*, l.source as source_name
      FROM leads l
      WHERE l.id = ? AND l.tenant_id = ?
    `, [req.params.id, req.tenantId]);

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        res.json(lead);
    } catch (error) {
        console.error('Lead get error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/leads
 */
router.post('/', async (req, res) => {
    try {
        const {
            name, phone, email, budget_min, budget_max,
            location, interest, motive_to_buy, contact_person,
            source, status = 'new', assigned_to
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const values = [
            req.tenantId,
            name,
            phone || null,
            email || null,
            budget_min || null,
            budget_max || null,
            location || null,
            interest || null,
            motive_to_buy || null,
            contact_person || null,
            source || null,
            status,
            assigned_to || null
        ];

        const result = await run(`
      INSERT INTO leads (tenant_id, name, phone, email, budget_min, budget_max, location, interest, motive_to_buy, contact_person, source, status, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, values);

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Lead create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/leads/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const {
            name, phone, email, budget_min, budget_max,
            location, interest, motive_to_buy, contact_person,
            source, status, assigned_to
        } = req.body;

        await run(`
      UPDATE leads SET
        name = ?, phone = ?, email = ?, budget_min = ?, budget_max = ?,
        location = ?, interest = ?, motive_to_buy = ?, contact_person = ?,
        source = ?, status = ?, assigned_to = ?
      WHERE id = ? AND tenant_id = ?
    `, [name, phone, email, budget_min, budget_max, location, interest, motive_to_buy, contact_person, source, status, assigned_to, req.params.id, req.tenantId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Lead update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/leads/:id/status
 */
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const userId = req.user?.userId || 1;

        const lead = await get('SELECT status FROM leads WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        await run('UPDATE leads SET status = ? WHERE id = ? AND tenant_id = ?', [status, req.params.id, req.tenantId]);

        await run('INSERT INTO status_updates (tenant_id, lead_id, user_id, old_status, new_status) VALUES (?, ?, ?, ?, ?)',
            [req.tenantId, req.params.id, userId, lead.status, status]);

        res.json({ success: true });
    } catch (error) {
        console.error('Lead status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/leads/:id/escalate
 */
router.patch('/:id/escalate', async (req, res) => {
    try {
        await run('UPDATE leads SET escalated = 1, status = ? WHERE id = ? AND tenant_id = ?', ['warm', req.params.id, req.tenantId]);
        res.json({ success: true, message: 'Lead escalated to admin' });
    } catch (error) {
        console.error('Lead escalate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/leads/:id/convert-client
 */
router.put('/:id/convert-client', async (req, res) => {
    try {
        const leadId = req.params.id;
        const { deal_date, price, property_details, documents_link, email, location, alternate_phone } = req.body;

        const lead = await get('SELECT * FROM leads WHERE id = ? AND tenant_id = ?', [leadId, req.tenantId]);
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        if (lead.status === 'client') {
            return res.status(400).json({ error: 'Lead already converted to client' });
        }

        const existingClient = await get('SELECT id FROM clients WHERE lead_id = ? AND tenant_id = ?', [leadId, req.tenantId]);
        if (existingClient) {
            return res.status(400).json({ error: 'Client already exists for this lead' });
        }

        const clientEmail = email || lead.email || '';
        const clientLocation = location || lead.location || '';

        await run(`
            INSERT INTO clients (tenant_id, name, phone, email, location, source, lead_id, deal_date, price, property_details, documents_link, alternate_phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [req.tenantId, lead.name, lead.phone, clientEmail, clientLocation, lead.source || '', leadId, deal_date || null, price || null, property_details || null, documents_link || null, alternate_phone || null]);

        await run('UPDATE leads SET status = ?, escalated = 0 WHERE id = ? AND tenant_id = ?', ['client', leadId, req.tenantId]);

        res.json({ success: true, message: 'Lead converted to client' });
    } catch (error) {
        console.error('Convert client error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/leads/:id/reject
 */
router.patch('/:id/reject', async (req, res) => {
    try {
        await run('UPDATE leads SET status = ?, escalated = 0 WHERE id = ? AND tenant_id = ?', ['rejected', req.params.id, req.tenantId]);
        res.json({ success: true, message: 'Lead rejected and archived' });
    } catch (error) {
        console.error('Lead reject error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/leads/:id/restore
 */
router.patch('/:id/restore', async (req, res) => {
    try {
        await run('UPDATE leads SET status = ?, escalated = 1 WHERE id = ? AND tenant_id = ?', ['new', req.params.id, req.tenantId]);
        res.json({ success: true, message: 'Lead restored to warm leads' });
    } catch (error) {
        console.error('Lead restore error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/leads/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const leadId = req.params.id;

        // Cascade delete within tenant
        await run('DELETE FROM site_visits WHERE lead_id = ? AND tenant_id = ?', [leadId, req.tenantId]);
        await run('DELETE FROM follow_ups WHERE lead_id = ? AND tenant_id = ?', [leadId, req.tenantId]);
        await run('DELETE FROM status_updates WHERE lead_id = ? AND tenant_id = ?', [leadId, req.tenantId]);
        await run('DELETE FROM tasks WHERE lead_id = ? AND tenant_id = ?', [leadId, req.tenantId]);

        await run('DELETE FROM leads WHERE id = ? AND tenant_id = ?', [leadId, req.tenantId]);

        res.status(204).send();
    } catch (error) {
        console.error('Lead delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
