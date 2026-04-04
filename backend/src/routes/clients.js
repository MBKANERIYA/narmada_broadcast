import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();




/**
 * GET /api/v1/clients
 */
router.get('/', async (req, res) => {
    try {
        const { search } = req.query;

        let sql = `
      SELECT c.*, l.name as lead_name, l.contact_person
      FROM clients c
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE 1=1
    `;
        const params = [];

        if (search) {
            sql += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        sql += ' ORDER BY c.created_at DESC LIMIT 500';

        const clients = await query(sql, params);
        res.json(clients);
    } catch (error) {
        console.error('Clients list error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/clients
 */
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, location, source, lead_id, deal_date, price, property_details, documents_link } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const result = await run(`
      INSERT INTO clients (name, phone, email, location, source, lead_id, deal_date, price, property_details, documents_link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, phone, email, location, source, lead_id || null, deal_date || null, price || null, property_details || null, documents_link || null]);

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Client create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/clients/bulk
 * Bulk import clients from CSV data (admin only)
 * IMPORTANT: This route MUST come before /:id routes to prevent Express matching "bulk" as an id
 */
router.post('/bulk', async (req, res) => {
    try {
        // Admin check
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { clients } = req.body;

        if (!clients || !Array.isArray(clients) || clients.length === 0) {
            return res.status(400).json({ error: 'clients array is required' });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (const client of clients) {
            if (!client.name || client.name.trim() === '') {
                errorCount++;
                errors.push(`Row skipped: name is required`);
                continue;
            }

            try {
                await run(`
                    INSERT INTO clients (name, phone, email, location, source, deal_date, price, property_details, documents_link)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    client.name.trim(),
                    client.phone || null,
                    client.email || null,
                    client.location || null,
                    client.source || null,
                    client.deal_date || null,
                    client.price || null,
                    client.property_details || null,
                    client.documents_link || null
                ]);
                successCount++;
            } catch (err) {
                errorCount++;
                errors.push(`Row "${client.name}": ${err.message}`);
            }
        }

        res.json({
            message: `Imported ${successCount} clients, ${errorCount} errors`,
            successCount,
            errorCount,
            errors: errors.slice(0, 10)
        });
    } catch (error) {
        console.error('Client bulk import error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/clients/:id
 * Update client details (admin only)
 */
router.put('/:id', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { name, phone, email, location, source, deal_date, price, property_details, documents_link } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        await run(`
            UPDATE clients 
            SET name = ?, phone = ?, email = ?, location = ?, source = ?, 
                deal_date = ?, price = ?, property_details = ?, documents_link = ?
            WHERE id = ?
        `, [name, phone, email, location, source, deal_date || null, price || null, property_details || null, documents_link || null, req.params.id]);

        res.json({ success: true });
    } catch (error) {
        console.error('Client update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/clients/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        await run('DELETE FROM clients WHERE id = ?', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        console.error('Client delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;

