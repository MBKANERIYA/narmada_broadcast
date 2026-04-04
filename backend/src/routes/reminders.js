import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/reminders
 * Get all reminders for the current user (or all for admin)
 * Returns pending reminders by default
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
            WHERE 1=1
        `;
        const params = [];

        // Non-admin users only see their own reminders
        if (!isAdmin && userId) {
            sql += ' AND r.user_id = ?';
            params.push(userId);
        }

        // Filter by pending (not completed)
        if (pending !== 'false') {
            sql += ' AND r.completed = 0';
        }

        // Filter upcoming (within next 7 days)
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
 * Get reminders that are due today or overdue
 * Accepts optional ?clientTime query param for timezone-correct comparison
 */
router.get('/due', async (req, res) => {
    try {
        const userId = req.user?.userId;
        const isAdmin = req.user?.role === 'admin';
        const clientTime = req.query.clientTime; // YYYY-MM-DD HH:mm:ss from frontend

        let sql = `
            SELECT r.*, 
                   l.name as lead_name,
                   l.phone as lead_phone,
                   l.interest as lead_interest
            FROM cold_reminders r
            LEFT JOIN leads l ON r.lead_id = l.id
            WHERE r.completed = 0 
            AND r.remind_at <= ?
        `;
        // Use client time if provided (expecting YYYY-MM-DD HH:mm:ss string)
        // Otherwise fallback to server time
        let comparisonTime;
        if (clientTime) {
            comparisonTime = clientTime;
        } else {
            // Always use IST (UTC+5:30) regardless of server timezone
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms
            const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
            comparisonTime = istNow.getFullYear() + '-' +
                String(istNow.getMonth() + 1).padStart(2, '0') + '-' +
                String(istNow.getDate()).padStart(2, '0') + ' ' +
                String(istNow.getHours()).padStart(2, '0') + ':' +
                String(istNow.getMinutes()).padStart(2, '0') + ':' +
                String(istNow.getSeconds()).padStart(2, '0');
        }

        console.log('[DueReminders] Comparison time:', comparisonTime);
        const params = [comparisonTime];

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
 * Create a new cold lead reminder
 */
router.post('/', async (req, res) => {
    try {
        const { lead_id, remind_at, notes } = req.body;
        const userId = req.user?.userId;

        if (!lead_id || !remind_at) {
            return res.status(400).json({ error: 'lead_id and remind_at are required' });
        }

        const result = await run(`
            INSERT INTO cold_reminders (lead_id, user_id, remind_at, notes)
            VALUES (?, ?, ?, ?)
        `, [lead_id, userId, remind_at, notes || null]);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Reminder created' });
    } catch (error) {
        console.error('Reminder create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/reminders/:id/complete
 * Mark a reminder as completed
 */
router.patch('/:id/complete', async (req, res) => {
    try {
        await run('UPDATE cold_reminders SET completed = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Reminder completed' });
    } catch (error) {
        console.error('Reminder complete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/reminders/:id
 * Delete a reminder
 */
router.delete('/:id', async (req, res) => {
    try {
        await run('DELETE FROM cold_reminders WHERE id = ?', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        console.error('Reminder delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
