import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/visits
 * Get scheduled visits with optional date filtering
 */
router.get('/', async (req, res) => {
    try {
        const { from_date, to_date } = req.query;

        let sql = `
            SELECT v.*, l.name as lead_name, l.phone as lead_phone, l.location as lead_location, u.name as created_by_name
            FROM site_visits v
            LEFT JOIN leads l ON v.lead_id = l.id
            LEFT JOIN users u ON v.created_by = u.id
            WHERE l.status NOT IN ('rejected', 'client')
            AND (v.status IS NULL OR v.status = 'scheduled')
        `;
        const params = [];

        if (from_date) {
            sql += ' AND DATE(v.scheduled_at) >= ?';
            params.push(from_date);
        }

        if (to_date) {
            sql += ' AND DATE(v.scheduled_at) <= ?';
            params.push(to_date);
        }

        sql += ' ORDER BY v.scheduled_at ASC LIMIT 100';

        const visits = await query(sql, params);
        res.json(visits);
    } catch (error) {
        console.error('Visits list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/visits
 * Schedule a new site visit
 */
router.post('/', async (req, res) => {
    try {
        const { lead_id, scheduled_at, location, notes } = req.body;
        const userId = req.user?.userId;

        if (!lead_id || !scheduled_at) {
            return res.status(400).json({ error: 'Lead ID and scheduled date are required' });
        }

        const result = await run(`
            INSERT INTO site_visits (lead_id, scheduled_at, location, notes, created_by)
            VALUES (?, ?, ?, ?, ?)
        `, [lead_id, scheduled_at, location || null, notes || null, userId]);

        res.status(201).json({ id: result.insertId, message: 'Visit scheduled' });
    } catch (error) {
        console.error('Visit create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/visits/:id/status
 * Update visit status (scheduled, completed, cancelled)
 */
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await run('UPDATE site_visits SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Visit status update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
