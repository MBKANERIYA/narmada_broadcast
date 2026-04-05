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

    const totalResult = await get(
      "SELECT COUNT(*) as count FROM leads WHERE tenant_id = ? AND status NOT IN ('client', 'rejected')",
      [req.tenantId]
    );
    stats.total_leads = totalResult?.count || 0;

    const newResult = await get(
      "SELECT COUNT(*) as count FROM leads WHERE tenant_id = ? AND status = 'new' AND escalated = 0",
      [req.tenantId]
    );
    stats.new_leads = newResult?.count || 0;

    const statusCounts = await query(
      'SELECT status, COUNT(*) as count FROM leads WHERE tenant_id = ? GROUP BY status',
      [req.tenantId]
    );
    for (const row of statusCounts) {
      stats.leads_by_status[row.status] = row.count;
    }

    const todayResult = await get(`
      SELECT COUNT(*) as count FROM follow_ups 
      WHERE tenant_id = ? AND DATE(scheduled_at) = DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+05:30')) AND completed = 0
    `, [req.tenantId]);
    stats.today_followups = todayResult?.count || 0;

    const tasksResult = await get(
      'SELECT COUNT(*) as count FROM tasks WHERE tenant_id = ? AND completed = 0',
      [req.tenantId]
    );
    stats.pending_tasks = tasksResult?.count || 0;

    stats.recent_leads = await query(`
      SELECT id, name, phone, status, created_at 
      FROM leads 
      WHERE tenant_id = ? AND escalated = 0
      ORDER BY created_at DESC LIMIT 5
    `, [req.tenantId]);

    stats.upcoming_followups = await query(`
      SELECT f.id, f.lead_id, l.name as lead_name, f.scheduled_at, f.type
      FROM follow_ups f
      LEFT JOIN leads l ON f.lead_id = l.id
      WHERE f.tenant_id = ? AND f.completed = 0 AND f.scheduled_at >= CONVERT_TZ(NOW(), @@session.time_zone, '+05:30')
      ORDER BY f.scheduled_at ASC LIMIT 5
    `, [req.tenantId]);

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
    const sources = await query(
      'SELECT id, name, type FROM sources WHERE tenant_id = ? ORDER BY name',
      [req.tenantId]
    );
    res.json(sources);
  } catch (error) {
    console.error('Sources error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
