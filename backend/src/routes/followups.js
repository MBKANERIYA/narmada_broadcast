import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/followups
 */
router.get('/', async (req, res) => {
    try {
        const { pending, today, lead_id } = req.query;
        const isAdmin = req.user?.role === 'admin';
        const userId = req.user?.userId;

        let sql = `
      SELECT f.*, 
             l.name as lead_name, 
             l.phone as lead_phone,
             l.email as lead_email,
             l.location as lead_location,
             l.interest as lead_interest,
             l.budget_min as lead_budget_min,
             l.budget_max as lead_budget_max,
             l.motive_to_buy as lead_motive,
             l.escalated as lead_escalated,
             u.name as user_name
      FROM follow_ups f
      LEFT JOIN leads l ON f.lead_id = l.id
      LEFT JOIN users u ON f.user_id = u.id
      WHERE 1=1
    `;
        const params = [];

        // Non-admin users only see their own follow-ups and non-escalated leads
        if (!isAdmin && userId) {
            sql += ' AND f.user_id = ?';
            params.push(userId);
            sql += ' AND (l.escalated = 0 OR l.escalated IS NULL)';
        }

        if (pending === 'true') {
            sql += ' AND f.completed = 0';
        }

        if (today === 'true') {
            sql += " AND DATE(f.scheduled_at) = DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30'))";
        }

        if (lead_id) {
            sql += ' AND f.lead_id = ?';
            params.push(lead_id);
        }

        sql += ' ORDER BY f.scheduled_at ASC LIMIT 100';

        const followUps = await query(sql, params);
        res.json(followUps);
    } catch (error) {
        console.error('Follow-ups list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/followups
 */
// POST /api/v1/followups
router.post('/', async (req, res) => {
    try {
        const { lead_id, scheduled_at, type = 'call', notes } = req.body;
        const userId = req.user?.userId || 1;

        if (!lead_id || !scheduled_at) {
            return res.status(400).json({ error: 'lead_id and scheduled_at required' });
        }

        // Check for existing pending follow-up
        const existing = await get('SELECT id FROM follow_ups WHERE lead_id = ? AND completed = 0', [lead_id]);
        if (existing) {
            return res.status(409).json({ error: 'This lead already has a pending follow-up scheduled.' });
        }

        const result = await run(`
      INSERT INTO follow_ups (lead_id, user_id, scheduled_at, type, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [lead_id, userId, scheduled_at, type, notes]);

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Follow-up create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/followups/:id/complete
 * Complete a follow-up with an outcome
 * Outcomes: try_again, rescheduled, escalated, completed, rejected
 */
router.patch('/:id/complete', async (req, res) => {
    try {
        const { outcome, notes, reschedule_date } = req.body;
        const followupId = req.params.id;

        // Get the follow-up to find the lead_id
        const followup = await get('SELECT lead_id FROM follow_ups WHERE id = ?', [followupId]);
        if (!followup) {
            return res.status(404).json({ error: 'Follow-up not found' });
        }

        // Update the follow-up as completed with outcome
        await run(`
      UPDATE follow_ups SET completed = 1, completed_at = NOW(), outcome = ?, notes = CONCAT(IFNULL(notes, ''), ' | Outcome: ', ?)
      WHERE id = ? AND completed = 0
    `, [outcome || 'completed', outcome || 'completed', followupId]);

        // Handle different outcomes
        if (outcome === 'escalated') {
            // Escalate the lead to admin
            await run('UPDATE leads SET escalated = 1, status = ? WHERE id = ?', ['warm', followup.lead_id]);
        } else if (outcome === 'rejected') {
            // Reject the lead
            await run('UPDATE leads SET status = ? WHERE id = ?', ['rejected', followup.lead_id]);
        } else if (outcome === 'try_again' && reschedule_date) {
            // Create a new follow-up for trying again
            const userId = req.user?.userId || 1;
            await run(`
        INSERT INTO follow_ups (lead_id, user_id, scheduled_at, type, notes)
        VALUES (?, ?, ?, 'call', 'Rescheduled from previous follow-up')
      `, [followup.lead_id, userId, reschedule_date]);
        } else if (outcome === 'rescheduled' && reschedule_date) {
            // Create a new follow-up for rescheduled
            const userId = req.user?.userId || 1;
            await run(`
        INSERT INTO follow_ups (lead_id, user_id, scheduled_at, type, notes)
        VALUES (?, ?, ?, 'call', 'Rescheduled by lead request')
      `, [followup.lead_id, userId, reschedule_date]);
        }

        res.json({ success: true, outcome });
    } catch (error) {
        console.error('Follow-up complete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/followups/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await run('DELETE FROM follow_ups WHERE id = ?', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        console.error('Follow-up delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
