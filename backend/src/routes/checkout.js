import crypto from 'crypto';
import express from 'express';
import Razorpay from 'razorpay';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Setting from '../models/Setting.js';

const router = express.Router();

function publicBaseUrl(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || req.get('host');
    return `${protocol}://${host}`;
}

function normalizeQuantity(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.min(parsed, 99);
}

function productCanFulfillQuantity(product, quantity) {
    if (product.inventory_available === false) {
        return { ok: false, reason: 'out_of_stock' };
    }

    const hasTrackedQuantity = product.inventory_quantity !== null && product.inventory_quantity !== undefined && product.inventory_quantity !== '';
    const inventoryQuantity = hasTrackedQuantity ? Number(product.inventory_quantity) : null;
    if (
        inventoryQuantity !== null &&
        Number.isFinite(inventoryQuantity) &&
        product.inventory_policy !== 'continue' &&
        Number(product.inventory_quantity) < quantity
    ) {
        return { ok: false, reason: 'insufficient_stock' };
    }

    return { ok: true };
}

function parseImages(value, fallback) {
    if (Array.isArray(value)) return value;
    if (value) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch { }
    }
    return fallback ? [fallback] : [];
}

async function maybeCreatePaymentLink({ tenant, order, customer, req }) {
    if (!tenant?.razorpay_key_id || !tenant?.razorpay_key_secret) {
        return null;
    }

    const razorpay = new Razorpay({
        key_id: tenant.razorpay_key_id,
        key_secret: tenant.razorpay_key_secret,
    });

    const paymentLink = await razorpay.paymentLink.create({
        amount: Math.round(Number(order.total_amount || 0) * 100),
        currency: order.currency || 'INR',
        description: `Order #${order._id || order.id} from ${tenant.name || 'Store'}`,
        customer: {
            name: customer.name || undefined,
            contact: customer.phone || undefined,
            email: customer.email || undefined,
        },
        notify: { sms: true, email: Boolean(customer.email) },
        callback_url: `${publicBaseUrl(req)}/checkout/${order.checkout_token}`,
        callback_method: 'get',
        notes: {
            order_id: String(order._id || order.id),
            tenant_id: String(tenant._id || 'single-tenant'),
            source: 'hosted_checkout',
        },
    });

    await Order.findByIdAndUpdate(order._id || order.id, {
        $set: { payment_link: paymentLink.short_url, payment_link_id: paymentLink.id }
    });

    return paymentLink;
}

router.post('/sessions', async (req, res) => {
    try {
        const { product_id, quantity = 1 } = req.body || {};
        if (!product_id) {
            return res.status(400).json({ error: 'product_id is required' });
        }

        const product = await Product.findById(product_id);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const qty = normalizeQuantity(quantity);
        const stockCheck = productCanFulfillQuantity(product, qty);
        if (!stockCheck.ok) {
            if (stockCheck.reason === 'insufficient_stock') {
                return res.status(409).json({ error: `Only ${product.inventory_quantity} left in stock` });
            }
            return res.status(409).json({ error: 'This product is currently out of stock' });
        }

        const price = Number(product.selling_price || product.mrp || 0);
        const checkoutToken = crypto.randomBytes(24).toString('hex');
        
        const order = await Order.create({
            tenant_id: 'single-tenant',
            phone: '',
            total_amount: price * qty,
            currency: 'INR',
            payment_status: 'pending',
            fulfillment_status: 'pending',
            checkout_token: checkoutToken,
            checkout_status: 'open',
            checkout_expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            source_channel: 'hosted_checkout',
            items: [{
                product_id: product._id.toString(),
                sku: product.sku || '',
                item_name: product.name,
                quantity: qty,
                price: price
            }]
        });

        res.status(201).json({
            token: checkoutToken,
            checkout_url: `${publicBaseUrl(req)}/checkout/${checkoutToken}`,
        });
    } catch (error) {
        console.error('[Checkout] Session create error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

router.get('/:token', async (req, res) => {
    try {
        const order = await Order.findOne({ checkout_token: req.params.token });
        if (!order) return res.status(404).json({ error: 'Checkout not found' });
        if (order.checkout_status === 'expired' || order.checkout_status === 'cancelled') {
            return res.status(410).json({ error: 'Checkout is no longer available' });
        }

        const tenant = await Setting.findOne() || {};

        res.json({
            checkout: {
                token: order.checkout_token,
                status: order.checkout_status,
                payment_status: order.payment_status,
                payment_link: order.payment_link,
                total_amount: order.total_amount,
                currency: order.currency || 'INR',
                tenant_name: tenant.name || 'Store',
                logo_url: tenant.logo_url || null,
                primary_color: tenant.primary_color || '#2563EB',
                customer_name: order.customer_name,
                phone: order.phone,
                shipping_address: order.shipping_address,
            },
            items: (order.items || []).map((item) => ({
                ...item,
                images: parseImages(item.images, null),
            })),
        });
    } catch (error) {
        console.error('[Checkout] Fetch error:', error);
        res.status(500).json({ error: 'Failed to load checkout' });
    }
});

router.post('/:token/place', async (req, res) => {
    try {
        const { name, phone, email, shipping_address, payment_method = 'online', notes = '' } = req.body || {};
        if (!name || !phone || !shipping_address) {
            return res.status(400).json({ error: 'Name, phone, and delivery address are required' });
        }

        const order = await Order.findOne({ checkout_token: req.params.token });
        if (!order) return res.status(404).json({ error: 'Checkout not found' });
        if (!['open', 'ordered'].includes(order.checkout_status)) {
            return res.status(400).json({ error: 'Checkout is not open' });
        }

        await Order.findByIdAndUpdate(order._id, {
            $set: {
                customer_name: name,
                phone: phone,
                shipping_address: shipping_address,
                notes: notes || '',
                checkout_status: 'ordered'
            }
        });

        const refreshedOrder = await Order.findById(order._id);
        const tenant = await Setting.findOne() || {};

        let paymentLink = null;
        if (payment_method !== 'cod') {
            try {
                paymentLink = await maybeCreatePaymentLink({
                    tenant: tenant,
                    order: refreshedOrder,
                    customer: { name, phone, email },
                    req,
                });
            } catch (paymentErr) {
                console.warn(`[Checkout] Order #${order._id} placed but payment link failed:`, paymentErr.message);
            }
        }

        res.json({
            success: true,
            order_id: order._id.toString(),
            payment_link: paymentLink?.short_url || refreshedOrder.payment_link || null,
        });
    } catch (error) {
        console.error('[Checkout] Place order error:', error);
        res.status(500).json({ error: error.message || 'Failed to place order' });
    }
});

export default router;
