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
      WHERE 1=1
    `;
        const params = [];

        // Employees can't see escalated leads
        if (!isAdmin) {
            sql += ' AND l.escalated = 0';
        }

        // Filter for escalated leads (admin only) - exclude already processed ones
        if (isAdmin && escalated === '1') {
            sql += ' AND l.escalated = 1 AND l.status NOT IN (?, ?)';
            params.push('rejected', 'client');
        }

        // Archive view: show rejected AND converted leads
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
      WHERE l.id = ?
    `, [req.params.id]);

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

        // Convert undefined to null for MySQL compatibility
        const values = [
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
      INSERT INTO leads (name, phone, email, budget_min, budget_max, location, interest, motive_to_buy, contact_person, source, status, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, values);

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Lead create error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
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
      WHERE id = ?
    `, [name, phone, email, budget_min, budget_max, location, interest, motive_to_buy, contact_person, source, status, assigned_to, req.params.id]);

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

        // Get current status
        const lead = await get('SELECT status FROM leads WHERE id = ?', [req.params.id]);
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Update status
        await run('UPDATE leads SET status = ? WHERE id = ?', [status, req.params.id]);

        // Create audit log
        await run('INSERT INTO status_updates (lead_id, user_id, old_status, new_status) VALUES (?, ?, ?, ?)',
            [req.params.id, userId, lead.status, status]);

        res.json({ success: true });
    } catch (error) {
        console.error('Lead status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/leads/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        await run('DELETE FROM leads WHERE id = ?', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        console.error('Lead delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
/**
 * PATCH /api/v1/leads/:id/escalate
 * Escalate a lead to admin (warm lead)
 */
router.patch('/:id/escalate', async (req, res) => {
    try {
        const leadId = req.params.id;

        // Mark lead as escalated
        await run('UPDATE leads SET escalated = 1, status = ? WHERE id = ?', ['warm', leadId]);

        res.json({ success: true, message: 'Lead escalated to admin' });
    } catch (error) {
        console.error('Lead escalate error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/leads/:id/convert-client
 * Convert warm lead to client
 */
router.put('/:id/convert-client', async (req, res) => {
    try {
        const leadId = req.params.id;
        const { deal_date, price, property_details, documents_link, email, location, alternate_phone } = req.body;

        const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        // Check if already converted (prevent duplicate clicks)
        if (lead.status === 'client') {
            return res.status(400).json({ error: 'Lead already converted to client' });
        }

        // Check if client already exists for this lead
        const existingClient = await get('SELECT id FROM clients WHERE lead_id = ?', [leadId]);
        if (existingClient) {
            return res.status(400).json({ error: 'Client already exists for this lead' });
        }

        // Use form data for client fields, falling back to lead data for name/phone only
        const clientEmail = email || lead.email || '';
        const clientLocation = location || lead.location || '';

        // Add to clients table with deal details (name/phone from lead, rest from form)
        await run(`
            INSERT INTO clients (name, phone, email, location, source, lead_id, deal_date, price, property_details, documents_link, alternate_phone) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [lead.name, lead.phone, clientEmail, clientLocation, lead.source || '', leadId, deal_date || null, price || null, property_details || null, documents_link || null, alternate_phone || null]);

        // Update lead status
        await run('UPDATE leads SET status = ?, escalated = 0 WHERE id = ?', ['client', leadId]);

        res.json({ success: true, message: 'Lead converted to client' });
    } catch (error) {
        console.error('Convert client error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/leads/:id/reject
 * Reject/Archive a warm lead
 */
router.patch('/:id/reject', async (req, res) => {
    try {
        // Mark as rejected and remove escalated flag
        await run('UPDATE leads SET status = ?, escalated = 0 WHERE id = ?', ['rejected', req.params.id]);
        res.json({ success: true, message: 'Lead rejected and archived' });
    } catch (error) {
        console.error('Lead reject error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/leads/:id/restore
 * Restore an archived/rejected lead back to warm leads
 */
router.patch('/:id/restore', async (req, res) => {
    try {
        // Set status back to 'new' and escalate to warm leads
        await run('UPDATE leads SET status = ?, escalated = 1 WHERE id = ?', ['new', req.params.id]);
        res.json({ success: true, message: 'Lead restored to warm leads' });
    } catch (error) {
        console.error('Lead restore error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/leads/:id
 * Delete a lead permanently (admin only)
 */
router.delete('/:id', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const leadId = req.params.id;

        // Manual Cascade Delete - Ensure dependencies are removed even if DB Foreign Keys fail to cascade
        await run('DELETE FROM site_visits WHERE lead_id = ?', [leadId]);
        await run('DELETE FROM follow_ups WHERE lead_id = ?', [leadId]);
        await run('DELETE FROM status_updates WHERE lead_id = ?', [leadId]);

        // For tasks, we might want to just unassign or delete. Let's delete for clean up.
        await run('DELETE FROM tasks WHERE lead_id = ?', [leadId]);

        // Delete the lead
        await run('DELETE FROM leads WHERE id = ?', [leadId]);

        res.status(204).send();
    } catch (error) {
        console.error('Lead delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
