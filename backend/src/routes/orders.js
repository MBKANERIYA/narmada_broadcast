import express from 'express';

import Order from '../models/Order.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const { payment_status, fulfillment_status, search, date_from, date_to } = req.query;
        let query = {};

        if (payment_status) query.payment_status = payment_status;
        if (fulfillment_status) query.fulfillment_status = fulfillment_status;
        
        if (search) {
            query.$or = [
                { phone: { $regex: search, $options: 'i' } },
                { shipping_address: { $regex: search, $options: 'i' } }
            ];
        }

        if (date_from || date_to) {
            query.created_at = {};
            if (date_from) query.created_at.$gte = new Date(date_from);
            if (date_to) query.created_at.$lte = new Date(date_to + 'T23:59:59.999Z');
        }

        const allowedSortFields = ['created_at', 'total_amount', 'payment_status', 'fulfillment_status'];
        const sortBy = allowedSortFields.includes(req.query.sort_by) ? req.query.sort_by : 'created_at';
        const sortOrder = req.query.sort_order === 'asc' ? 1 : -1;

        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .populate('contact_id', 'name email phone')
            .sort({ [sortBy]: sortOrder })
            .skip(skip)
            .limit(limit);

        res.json({
            orders: orders.map(o => {
                const doc = o.toObject();
                doc.id = doc._id;
                doc.contact_name = doc.contact_id ? doc.contact_id.name : null;
                doc.contact_email = doc.contact_id ? doc.contact_id.email : null;
                return doc;
            }),
            total,
            page,
            limit
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments();
        
        const revenueAgg = await Order.aggregate([
            { $match: { payment_status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total_amount' }, avg: { $avg: '$total_amount' } } }
        ]);

        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayEnd = new Date();
        todayEnd.setHours(23,59,59,999);
        
        const ordersToday = await Order.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
        const pendingPayments = await Order.countDocuments({ payment_status: 'pending' });

        res.json({
            totalOrders,
            totalRevenue: revenueAgg[0] ? revenueAgg[0].total : 0,
            ordersToday,
            pendingPayments,
            avgOrderValue: revenueAgg[0] ? revenueAgg[0].avg : 0,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order stats' });
    }
});

router.get('/export', async (req, res) => {
    try {
        const { payment_status, fulfillment_status, search, date_from, date_to } = req.query;
        let query = {};

        if (payment_status) query.payment_status = payment_status;
        if (fulfillment_status) query.fulfillment_status = fulfillment_status;
        
        if (search) {
            query.$or = [
                { phone: { $regex: search, $options: 'i' } },
                { shipping_address: { $regex: search, $options: 'i' } }
            ];
        }

        if (date_from || date_to) {
            query.created_at = {};
            if (date_from) query.created_at.$gte = new Date(date_from);
            if (date_to) query.created_at.$lte = new Date(date_to + 'T23:59:59.999Z');
        }

        const orders = await Order.find(query).populate('contact_id', 'name email').sort({ created_at: -1 }).limit(5000);

        const headers = ['Order ID', 'Customer Name', 'Phone', 'Email', 'Amount', 'Currency', 'Payment Status', 'Fulfillment Status', 'Shipping Address', 'Notes', 'Date'];
        const csvRows = [headers.join(',')];
        
        for (const o of orders) {
            const doc = o.toObject();
            csvRows.push([
                doc._id,
                `"${(doc.contact_id?.name || '').replace(/"/g, '""')}"`,
                doc.phone,
                doc.contact_id?.email || '',
                doc.total_amount,
                doc.currency,
                doc.payment_status,
                doc.fulfillment_status,
                `"${(doc.shipping_address || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                `"${(doc.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                doc.created_at,
            ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=orders-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvRows.join('\n'));
    } catch (error) {
        res.status(500).json({ error: 'Failed to export orders' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('contact_id', 'name email phone');
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        const doc = order.toObject();
        doc.id = doc._id;
        doc.contact_name = doc.contact_id?.name;
        doc.contact_email = doc.contact_id?.email;
        doc.contact_phone = doc.contact_id?.phone;
        res.json(doc);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
});

router.patch('/bulk/status', async (req, res) => {
    try {
        const { orderIds, payment_status, fulfillment_status } = req.body;
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'No order IDs provided' });
        }

        let updates = {};
        if (payment_status) updates.payment_status = payment_status;
        if (fulfillment_status) updates.fulfillment_status = fulfillment_status;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid status provided' });
        }

        await Order.updateMany({ _id: { $in: orderIds } }, { $set: updates });
        res.json({ success: true, message: `${orderIds.length} orders updated` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update orders' });
    }
});

router.patch('/:id/status', async (req, res) => {
    try {
        const { payment_status, fulfillment_status, notes } = req.body;

        let updates = {};
        if (payment_status) updates.payment_status = payment_status;
        if (fulfillment_status) updates.fulfillment_status = fulfillment_status;
        if (notes !== undefined) updates.notes = notes;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        const order = await Order.findByIdAndUpdate(req.params.id, { $set: updates });
        if (!order) return res.status(404).json({ error: 'Order not found' });

        res.json({ success: true, message: 'Order updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

export default router;
