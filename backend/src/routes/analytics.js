import express from 'express';
import { query, get } from '../database.js';

const router = express.Router();

/**
 * GET /api/v1/analytics/dashboard
 * Returns comprehensive dashboard metrics for the tenant
 */
router.get('/dashboard', async (req, res) => {
    try {
        const tenantId = req.tenantId;

        // ── Top-Level Metrics ──
        const contactsResult = await get(
            'SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?',
            [tenantId]
        );

        const ordersResult = await get(
            'SELECT COUNT(*) as count FROM orders WHERE tenant_id = ?',
            [tenantId]
        );

        const revenueResult = await get(
            "SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE tenant_id = ? AND payment_status = 'paid'",
            [tenantId]
        );

        const campaignsResult = await get(
            'SELECT COUNT(*) as count FROM whatsapp_campaigns WHERE tenant_id = ?',
            [tenantId]
        );

        const conversationsResult = await get(
            'SELECT COUNT(*) as count FROM whatsapp_conversations WHERE tenant_id = ?',
            [tenantId]
        );

        // ── Revenue Over Time (Last 30 Days, grouped by day) ──
        const revenueOverTime = await query(
            `SELECT DATE(created_at) as date, SUM(total_amount) as revenue, COUNT(*) as orders
             FROM orders
             WHERE tenant_id = ? AND payment_status = 'paid' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [tenantId]
        );

        // ── Messages Over Time (Last 30 Days, split by direction) ──
        const messagesOverTime = await query(
            `SELECT DATE(created_at) as date, direction, COUNT(*) as count
             FROM whatsapp_chat_messages
             WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
             GROUP BY DATE(created_at), direction
             ORDER BY date ASC`,
            [tenantId]
        );

        // Restructure messages into a per-day format
        const messagesByDay = {};
        for (const row of messagesOverTime) {
            const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
            if (!messagesByDay[dateStr]) {
                messagesByDay[dateStr] = { date: dateStr, inbound: 0, outbound: 0 };
            }
            if (row.direction === 'inbound') {
                messagesByDay[dateStr].inbound = row.count;
            } else {
                messagesByDay[dateStr].outbound = row.count;
            }
        }

        // ── Campaign Success Rate ──
        const campaignStats = await query(
            `SELECT status, COUNT(*) as count FROM whatsapp_campaigns WHERE tenant_id = ? GROUP BY status`,
            [tenantId]
        );

        // ── Recent Orders ──
        const recentOrders = await query(
            `SELECT id, phone, total_amount, currency, payment_status, fulfillment_status, created_at
             FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5`,
            [tenantId]
        );

        // ── Order Status Breakdown ──
        const ordersByStatus = await query(
            `SELECT payment_status, COUNT(*) as count FROM orders WHERE tenant_id = ? GROUP BY payment_status`,
            [tenantId]
        );

        res.json({
            metrics: {
                totalContacts: contactsResult?.count || 0,
                totalOrders: ordersResult?.count || 0,
                totalRevenue: parseFloat(revenueResult?.total || 0),
                totalCampaigns: campaignsResult?.count || 0,
                totalConversations: conversationsResult?.count || 0,
            },
            revenueOverTime: revenueOverTime.map(r => ({
                date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0],
                revenue: parseFloat(r.revenue),
                orders: r.orders,
            })),
            messagesOverTime: Object.values(messagesByDay),
            campaignStats: campaignStats.reduce((acc, row) => {
                acc[row.status] = row.count;
                return acc;
            }, {}),
            ordersByStatus: ordersByStatus.reduce((acc, row) => {
                acc[row.payment_status] = row.count;
                return acc;
            }, {}),
            recentOrders,
        });
    } catch (error) {
        console.error('[Analytics] Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

export default router;
