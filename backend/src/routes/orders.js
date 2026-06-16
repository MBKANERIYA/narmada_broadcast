import express from 'express';
import { query, run, get } from '../database.js';

const router = express.Router();

/**
 * GET /api/v1/orders
 * List orders with search, filters, sorting, pagination
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;

        // Filters
        const paymentStatus = req.query.payment_status;
        const fulfillmentStatus = req.query.fulfillment_status;
        const search = req.query.search?.trim();
        const dateFrom = req.query.date_from;
        const dateTo = req.query.date_to;

        // Sorting
        const allowedSortFields = ['created_at', 'total_amount', 'payment_status', 'fulfillment_status'];
        const sortBy = allowedSortFields.includes(req.query.sort_by) ? req.query.sort_by : 'created_at';
        const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';

        let sql = `
            SELECT o.*, c.name as contact_name, c.email as contact_email
            FROM orders o
            LEFT JOIN contacts c ON o.contact_id = c.id
            WHERE o.tenant_id = ?
        `;
        let countSql = `SELECT COUNT(*) as total FROM orders o LEFT JOIN contacts c ON o.contact_id = c.id WHERE o.tenant_id = ?`;
        const params = [tenantId];
        const countParams = [tenantId];

        if (paymentStatus) {
            sql += ` AND o.payment_status = ?`;
            countSql += ` AND o.payment_status = ?`;
            params.push(paymentStatus);
            countParams.push(paymentStatus);
        }

        if (fulfillmentStatus) {
            sql += ` AND o.fulfillment_status = ?`;
            countSql += ` AND o.fulfillment_status = ?`;
            params.push(fulfillmentStatus);
            countParams.push(fulfillmentStatus);
        }

        if (search) {
            sql += ` AND (o.phone LIKE ? OR o.id LIKE ? OR c.name LIKE ? OR o.shipping_address LIKE ?)`;
            countSql += ` AND (o.phone LIKE ? OR o.id LIKE ? OR c.name LIKE ? OR o.shipping_address LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (dateFrom) {
            sql += ` AND o.created_at >= ?`;
            countSql += ` AND o.created_at >= ?`;
            params.push(dateFrom);
            countParams.push(dateFrom);
        }

        if (dateTo) {
            sql += ` AND o.created_at <= ?`;
            countSql += ` AND o.created_at <= ?`;
            // Add end of day
            params.push(dateTo + ' 23:59:59');
            countParams.push(dateTo + ' 23:59:59');
        }

        sql += ` ORDER BY o.${sortBy} ${sortOrder} LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [orders, countResult] = await Promise.all([
            query(sql, params),
            get(countSql, countParams)
        ]);

        // Fetch line items for all orders in one query
        if (orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            const placeholders = orderIds.map(() => '?').join(',');
            const items = await query(
                `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
                orderIds
            );
            const itemsByOrder = {};
            for (const item of (items || [])) {
                if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
                itemsByOrder[item.order_id].push(item);
            }
            for (const order of orders) {
                order.items = itemsByOrder[order.id] || [];
            }
        }

        res.json({
            orders: orders || [],
            total: countResult?.total || 0,
            page,
            limit
        });
    } catch (error) {
        console.error('[Orders] Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * GET /api/v1/orders/stats
 * Quick summary stats for the orders page header cards
 */
router.get('/stats', async (req, res) => {
    try {
        const tenantId = req.tenant.id;

        const [totalResult, revenueResult, todayResult, pendingResult, avgResult] = await Promise.all([
            get('SELECT COUNT(*) as count FROM orders WHERE tenant_id = ?', [tenantId]),
            get("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE tenant_id = ? AND payment_status = 'paid'", [tenantId]),
            get("SELECT COUNT(*) as count FROM orders WHERE tenant_id = ? AND DATE(created_at) = CURDATE()", [tenantId]),
            get("SELECT COUNT(*) as count FROM orders WHERE tenant_id = ? AND payment_status = 'pending'", [tenantId]),
            get("SELECT COALESCE(AVG(total_amount), 0) as avg FROM orders WHERE tenant_id = ? AND payment_status = 'paid'", [tenantId]),
        ]);

        res.json({
            totalOrders: totalResult?.count || 0,
            totalRevenue: parseFloat(revenueResult?.total || 0),
            ordersToday: todayResult?.count || 0,
            pendingPayments: pendingResult?.count || 0,
            avgOrderValue: parseFloat(avgResult?.avg || 0),
        });
    } catch (error) {
        console.error('[Orders] Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch order stats' });
    }
});

/**
 * GET /api/v1/orders/export
 * Export filtered orders as CSV
 */
router.get('/export', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const paymentStatus = req.query.payment_status;
        const fulfillmentStatus = req.query.fulfillment_status;
        const search = req.query.search?.trim();
        const dateFrom = req.query.date_from;
        const dateTo = req.query.date_to;

        let sql = `
            SELECT o.id, o.phone, c.name as contact_name, c.email as contact_email,
                   o.total_amount, o.currency, o.payment_status, o.fulfillment_status,
                   o.shipping_address, o.notes, o.created_at
            FROM orders o
            LEFT JOIN contacts c ON o.contact_id = c.id
            WHERE o.tenant_id = ?
        `;
        const params = [tenantId];

        if (paymentStatus) { sql += ` AND o.payment_status = ?`; params.push(paymentStatus); }
        if (fulfillmentStatus) { sql += ` AND o.fulfillment_status = ?`; params.push(fulfillmentStatus); }
        if (search) {
            sql += ` AND (o.phone LIKE ? OR o.id LIKE ? OR c.name LIKE ?)`;
            const s = `%${search}%`;
            params.push(s, s, s);
        }
        if (dateFrom) { sql += ` AND o.created_at >= ?`; params.push(dateFrom); }
        if (dateTo) { sql += ` AND o.created_at <= ?`; params.push(dateTo + ' 23:59:59'); }

        sql += ` ORDER BY o.created_at DESC LIMIT 5000`;

        const orders = await query(sql, params);

        // Build CSV
        const headers = ['Order ID', 'Customer Name', 'Phone', 'Email', 'Amount', 'Currency', 'Payment Status', 'Fulfillment Status', 'Shipping Address', 'Notes', 'Date'];
        const csvRows = [headers.join(',')];
        for (const o of (orders || [])) {
            csvRows.push([
                o.id,
                `"${(o.contact_name || '').replace(/"/g, '""')}"`,
                o.phone,
                o.contact_email || '',
                o.total_amount,
                o.currency,
                o.payment_status,
                o.fulfillment_status,
                `"${(o.shipping_address || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                `"${(o.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                o.created_at,
            ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=orders-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvRows.join('\n'));
    } catch (error) {
        console.error('[Orders] Export error:', error);
        res.status(500).json({ error: 'Failed to export orders' });
    }
});

/**
 * GET /api/v1/orders/:id
 * Fetch single order with line items
 */
router.get('/:id', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const orderId = parseInt(req.params.id);

        const order = await get(`
            SELECT o.*, c.name as contact_name, c.email as contact_email, c.phone as contact_phone
            FROM orders o
            LEFT JOIN contacts c ON o.contact_id = c.id
            WHERE o.id = ? AND o.tenant_id = ?
        `, [orderId, tenantId]);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await query(
            `SELECT * FROM order_items WHERE order_id = ?`,
            [orderId]
        );

        order.items = items || [];
        res.json(order);
    } catch (error) {
        console.error('[Orders] Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
});

/**
 * PATCH /api/v1/orders/bulk/status
 * Bulk update status for multiple orders
 */
router.patch('/bulk/status', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const { orderIds, payment_status, fulfillment_status } = req.body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'No order IDs provided' });
        }

        const updates = [];
        const baseParams = [];

        const validPaymentStatuses = ['pending', 'paid', 'failed'];
        const validFulfillmentStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

        if (payment_status && validPaymentStatuses.includes(payment_status)) {
            updates.push('payment_status = ?');
            baseParams.push(payment_status);
        }
        if (fulfillment_status && validFulfillmentStatuses.includes(fulfillment_status)) {
            updates.push('fulfillment_status = ?');
            baseParams.push(fulfillment_status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid status provided' });
        }

        const placeholders = orderIds.map(() => '?').join(',');
        const params = [...baseParams, tenantId, ...orderIds];

        await run(
            `UPDATE orders SET ${updates.join(', ')} WHERE tenant_id = ? AND id IN (${placeholders})`,
            params
        );

        res.json({ success: true, message: `${orderIds.length} orders updated` });
    } catch (error) {
        console.error('[Orders] Bulk update error:', error);
        res.status(500).json({ error: 'Failed to update orders' });
    }
});

/**
 * PATCH /api/v1/orders/:id/status
 * Update payment and/or fulfillment status + notes
 */
router.patch('/:id/status', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const orderId = parseInt(req.params.id);
        const { payment_status, fulfillment_status, notes } = req.body;

        const order = await get(
            `SELECT id FROM orders WHERE id = ? AND tenant_id = ?`,
            [orderId, tenantId]
        );
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const updates = [];
        const params = [];

        const validPaymentStatuses = ['pending', 'paid', 'failed'];
        const validFulfillmentStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

        if (payment_status && validPaymentStatuses.includes(payment_status)) {
            updates.push('payment_status = ?');
            params.push(payment_status);
        }

        if (fulfillment_status && validFulfillmentStatuses.includes(fulfillment_status)) {
            updates.push('fulfillment_status = ?');
            params.push(fulfillment_status);
        }

        if (notes !== undefined) {
            updates.push('notes = ?');
            params.push(notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        params.push(orderId, tenantId);

        await run(
            `UPDATE orders SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
            params
        );

        res.json({ success: true, message: 'Order updated' });
    } catch (error) {
        console.error('[Orders] Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

export default router;

