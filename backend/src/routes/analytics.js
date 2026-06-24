import { Router } from 'express';
import Contact from '../models/Contact.js';
import Order from '../models/Order.js';
// We don't have WhatsAppCampaign/WhatsAppConversation models yet, but we will mock them or use empty array for now.
// For now, let's just return basic stats so the frontend doesn't crash.

const router = Router();

router.get('/', async (req, res) => {
    try {
        const totalContacts = await Contact.countDocuments();
        
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // Mock revenue over time
        const revenueOverTime = await Order.aggregate([
            { $match: { payment_status: 'paid', created_at: { $gte: thirtyDaysAgo } } },
            { $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                revenue: { $sum: "$total_amount" }
            }},
            { $sort: { _id: 1 } }
        ]).then(res => res.map(r => ({ date: r._id, revenue: r.revenue })));

        const ordersByStatus = await Order.aggregate([
            { $group: { _id: "$fulfillment_status", count: { $sum: 1 } } }
        ]).then(res => res.map(r => ({ status: r._id, count: r.count })));

        const recentOrders = await Order.find()
            .populate('contact_id', 'name')
            .sort({ created_at: -1 })
            .limit(5)
            .then(res => res.map(r => ({
                id: r._id,
                contact_name: r.contact_id ? r.contact_id.name : 'Unknown',
                total_amount: r.total_amount,
                status: r.fulfillment_status,
                created_at: r.created_at
            })));

        res.json({
            summary: {
                totalContacts,
                messagesSent: 0,
                messagesDelivered: 0,
                messagesRead: 0,
                activeCampaigns: 0,
                totalRevenue: revenueOverTime.reduce((acc, curr) => acc + curr.revenue, 0)
            },
            revenueOverTime,
            messagesOverTime: [],
            campaignStats: [],
            recentOrders,
            ordersByStatus
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
