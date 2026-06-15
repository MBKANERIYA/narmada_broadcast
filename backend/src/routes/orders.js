import express from 'express';
import { query, run, get } from '../database.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const paymentStatus = req.query.payment_status;
        const fulfillmentStatus = req.query.fulfillment_status;

        let sql = `
            SELECT o.*, c.name as contact_name, c.email as contact_email
            FROM orders o
            LEFT JOIN contacts c ON o.contact_id = c.id
            WHERE o.tenant_id = ?
        `;
        let countSql = `SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?`;
        const params = [tenantId];
        const countParams = [tenantId];

        if (paymentStatus) {
            sql += ` AND o.payment_status = ?`;
            countSql += ` AND payment_status = ?`;
            params.push(paymentStatus);
            countParams.push(paymentStatus);
        }

        if (fulfillmentStatus) {
            sql += ` AND o.fulfillment_status = ?`;
            countSql += ` AND fulfillment_status = ?`;
            params.push(fulfillmentStatus);
            countParams.push(fulfillmentStatus);
        }

        sql += ` ORDER BY o.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;

        const [orders, countResult] = await Promise.all([
            query(sql, params),
            get(countSql, countParams)
        ]);

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

router.patch('/:id/status', async (req, res) => {
    try {
        const tenantId = req.tenant.id;
        const orderId = parseInt(req.params.id);
        const { payment_status, fulfillment_status } = req.body;

        const order = await get(
            `SELECT id FROM orders WHERE id = ? AND tenant_id = ?`,
            [orderId, tenantId]
        );
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const updates = [];
        const params = [];

        if (payment_status) {
            updates.push('payment_status = ?');
            params.push(payment_status);
        }

        if (fulfillment_status) {
            updates.push('fulfillment_status = ?');
            params.push(fulfillment_status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid status provided' });
        }

        params.push(orderId, tenantId);

        await run(
            `UPDATE orders SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
            params
        );

        res.json({ success: true, message: 'Order status updated' });
    } catch (error) {
        console.error('[Orders] Error updating order:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

export default router;
