import { Router } from 'express';
import { query, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/dashboard
 */
router.get('/', async (req, res) => {
  try {
    const stats = {
      total_leads: 0,
      leads_by_status: {},
      today_followups: 0,
      pending_tasks: 0,
      recent_leads: [],
      upcoming_followups: [],
    };

    // Total leads (exclude converted and rejected)
    const totalResult = await get("SELECT COUNT(*) as count FROM leads WHERE status NOT IN ('client', 'rejected')");
    stats.total_leads = totalResult?.count || 0;

    // New leads count (fresh inquiries not escalated)
    const newResult = await get("SELECT COUNT(*) as count FROM leads WHERE status = 'new' AND escalated = 0");
    stats.new_leads = newResult?.count || 0;

    // Leads by status
    const statusCounts = await query('SELECT status, COUNT(*) as count FROM leads GROUP BY status');
    for (const row of statusCounts) {
      stats.leads_by_status[row.status] = row.count;
    }

    // Today's follow-ups
    const todayResult = await get(`
      SELECT COUNT(*) as count FROM follow_ups 
      WHERE DATE(scheduled_at) = DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30')) AND completed = 0
    `);
    stats.today_followups = todayResult?.count || 0;

    // Pending tasks
    const tasksResult = await get('SELECT COUNT(*) as count FROM tasks WHERE completed = 0');
    stats.pending_tasks = tasksResult?.count || 0;

    // Recent leads
    stats.recent_leads = await query(`
      SELECT id, name, phone, status, created_at 
      FROM leads 
      WHERE escalated = 0
      ORDER BY created_at DESC LIMIT 5
    `);

    // Upcoming follow-ups
    stats.upcoming_followups = await query(`
      SELECT f.id, f.lead_id, l.name as lead_name, f.scheduled_at, f.type
      FROM follow_ups f
      LEFT JOIN leads l ON f.lead_id = l.id
      WHERE f.completed = 0 AND f.scheduled_at >= CONVERT_TZ(NOW(), @@session.time_zone, '+05:30')
      ORDER BY f.scheduled_at ASC LIMIT 5
    `);

    res.json(stats);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/v1/sources
 */
router.get('/sources', async (req, res) => {
  try {
    const sources = await query('SELECT id, name, type FROM sources ORDER BY name');
    res.json(sources);
  } catch (error) {
    console.error('Sources error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
