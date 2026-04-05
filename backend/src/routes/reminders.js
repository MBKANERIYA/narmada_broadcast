import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/reminders
 */
router.get('/', async (req, res) => {
    try {
        const isAdmin = req.user?.role === 'admin';
        const userId = req.user?.userId;
        const { pending, upcoming } = req.query;

        let sql = `
            SELECT r.*, 
                   l.name as lead_name,
                   l.phone as lead_phone,
                   l.location as lead_location,
                   l.interest as lead_interest,
                   u.name as user_name
            FROM cold_reminders r
            LEFT JOIN leads l ON r.lead_id = l.id
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.tenant_id = ?
        `;
        const params = [req.tenantId];

        if (!isAdmin && userId) {
            sql += ' AND r.user_id = ?';
            params.push(userId);
        }

        if (pending !== 'false') {
            sql += ' AND r.completed = 0';
        }

        if (upcoming === 'true') {
            sql += ' AND r.remind_at <= DATE_ADD(CONVERT_TZ(NOW(), @@session.time_zone, "+05:30"), INTERVAL 7 DAY) AND r.remind_at >= CONVERT_TZ(NOW(), @@session.time_zone, "+05:30")';
        }

        sql += ' ORDER BY r.remind_at ASC LIMIT 50';

        const reminders = await query(sql, params);
        res.json(reminders);
    } catch (error) {
        console.error('Reminders list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/reminders/due
 */
router.get('/due', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const isAdmin = req.user?.role === 'admin';
        const clientTime = req.query.clientTime;

        let sql = `
            SELECT r.*, 
                   l.name as lead_name,
                   l.phone as lead_phone,
                   l.interest as lead_interest
            FROM cold_reminders r
            LEFT JOIN leads l ON r.lead_id = l.id
            WHERE r.tenant_id = ? AND r.completed = 0 
            AND r.remind_at <= ?
        `;
        let comparisonTime;
        if (clientTime) {
            comparisonTime = clientTime;
        } else {
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
            comparisonTime = istNow.getFullYear() + '-' +
                String(istNow.getMonth() + 1).padStart(2, '0') + '-' +
                String(istNow.getDate()).padStart(2, '0') + ' ' +
                String(istNow.getHours()).padStart(2, '0') + ':' +
                String(istNow.getMinutes()).padStart(2, '0') + ':' +
                String(istNow.getSeconds()).padStart(2, '0');
        }

        const params = [req.tenantId, comparisonTime];

        if (!isAdmin && userId) {
            sql += ' AND r.user_id = ?';
            params.push(userId);
        }

        sql += ' ORDER BY r.remind_at ASC';

        const reminders = await query(sql, params);
        res.json(reminders);
    } catch (error) {
        console.error('Due reminders error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/reminders
 */
router.post('/', async (req, res) => {
    try {
        const { lead_id, remind_at, notes } = req.body;
        const userId = req.user?.userId;

        if (!lead_id || !remind_at) {
            return res.status(400).json({ error: 'lead_id and remind_at are required' });
        }

        const result = await run(`
            INSERT INTO cold_reminders (tenant_id, lead_id, user_id, remind_at, notes)
            VALUES (?, ?, ?, ?, ?)
        `, [req.tenantId, lead_id, userId, remind_at, notes || null]);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Reminder created' });
    } catch (error) {
        console.error('Reminder create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/reminders/:id/complete
 */
router.patch('/:id/complete', async (req, res) => {
    try {
        await run('UPDATE cold_reminders SET completed = 1 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        res.json({ success: true, message: 'Reminder completed' });
    } catch (error) {
        console.error('Reminder complete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/reminders/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await run('DELETE FROM cold_reminders WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        res.status(204).send();
    } catch (error) {
        console.error('Reminder delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
