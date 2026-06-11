import { Router } from 'express';
import { run, get, query } from '../database.js';
import { invalidateTenantCache } from '../database.js';

const router = Router();

/**
 * All routes here require: auth + admin role
 */
router.use((req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
});

/**
 * GET /api/v1/tenant-settings
 * Get current tenant settings (for admin settings page)
 */
router.get('/', async (req, res) => {
    try {
        const tenant = await get(
            `SELECT id, name, slug, email, phone, logo_url, primary_color,
                    subscription_plan, subscription_status, trial_ends_at,
                    whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_catalog_id, whatsapp_configured,
                    max_users, created_at
             FROM tenants WHERE id = ?`,
            [req.tenantId]
        );

        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Get current user count
        const userCount = await get(
            'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?',
            [req.tenantId]
        );

        // Don't expose access tokens in GET response
        res.json({
            ...tenant,
            whatsapp_access_token: tenant.whatsapp_configured ? '••••••••' : null,
            current_users: userCount?.count || 0,
        });
    } catch (error) {
        console.error('Tenant settings get error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/tenant-settings/profile
 * Update firm profile (name, contact, branding)
 */
router.put('/profile', async (req, res) => {
    try {
        const { name, email, phone, logo_url, primary_color } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Firm name and email are required' });
        }

        await run(`
            UPDATE tenants SET name = ?, email = ?, phone = ?, logo_url = ?, primary_color = ?
            WHERE id = ?
        `, [name, email, phone || null, logo_url || null, primary_color || '#6366f1', req.tenantId]);

        // Invalidate cache so changes reflect immediately
        invalidateTenantCache(req.tenant.slug);

        res.json({ success: true, message: 'Firm profile updated' });
    } catch (error) {
        console.error('Tenant profile update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/tenant-settings/whatsapp
 * Configure WhatsApp Meta Cloud API credentials
 */
router.put('/whatsapp', async (req, res) => {
    try {
        const { whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_catalog_id } = req.body;

        if (!whatsapp_access_token || !whatsapp_phone_number_id || !whatsapp_business_account_id) {
            return res.status(400).json({
                error: 'All three WhatsApp fields are required: Access Token, Phone Number ID, Business Account ID',
            });
        }

        // Validate credentials by making a test API call
        try {
            const testUrl = `https://graph.facebook.com/v22.0/${whatsapp_phone_number_id}`;
            const testRes = await fetch(testUrl, {
                headers: { 'Authorization': `Bearer ${whatsapp_access_token}` },
            });
            const testData = await testRes.json();

            if (!testRes.ok) {
                return res.status(400).json({
                    error: `Invalid credentials: ${testData.error?.message || 'Verification failed'}`,
                });
            }
        } catch (fetchErr) {
            return res.status(400).json({
                error: 'Could not verify credentials. Check your Access Token and Phone Number ID.',
            });
        }

        await run(`
            UPDATE tenants 
            SET whatsapp_access_token = ?, whatsapp_phone_number_id = ?, whatsapp_business_account_id = ?, whatsapp_catalog_id = ?, whatsapp_configured = TRUE
            WHERE id = ?
        `, [whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_catalog_id || null, req.tenantId]);

        invalidateTenantCache(req.tenant.slug);

        res.json({ success: true, message: 'WhatsApp configured successfully' });
    } catch (error) {
        console.error('WhatsApp config update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/tenant-settings/whatsapp
 * Disconnect WhatsApp integration
 */
router.delete('/whatsapp', async (req, res) => {
    try {
        await run(`
            UPDATE tenants 
            SET whatsapp_access_token = NULL, whatsapp_phone_number_id = NULL, whatsapp_business_account_id = NULL, whatsapp_configured = FALSE
            WHERE id = ?
        `, [req.tenantId]);

        invalidateTenantCache(req.tenant.slug);

        res.json({ success: true, message: 'WhatsApp disconnected' });
    } catch (error) {
        console.error('WhatsApp disconnect error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/tenant-settings/subscription
 * Get subscription details + plan comparison
 */
router.get('/subscription', async (req, res) => {
    try {
        const tenant = await get(
            `SELECT subscription_plan, subscription_status, trial_ends_at, max_users,
                    razorpay_subscription_id, razorpay_customer_id
             FROM tenants WHERE id = ?`,
            [req.tenantId]
        );

        const plans = await query(
            'SELECT id, name, display_name, price_monthly, price_yearly, max_users, whatsapp_enabled FROM subscription_plans WHERE is_active = 1 ORDER BY price_monthly'
        );

        const userCount = await get(
            'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?',
            [req.tenantId]
        );

        // Calculate trial remaining days
        let trialDaysLeft = null;
        if (tenant.subscription_plan === 'trial' && tenant.trial_ends_at) {
            const diff = new Date(tenant.trial_ends_at) - new Date();
            trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }

        res.json({
            current: {
                plan: tenant.subscription_plan,
                status: tenant.subscription_status,
                trial_ends_at: tenant.trial_ends_at,
                trial_days_left: trialDaysLeft,
                max_users: tenant.max_users,
                current_users: userCount?.count || 0,
                has_razorpay: !!tenant.razorpay_subscription_id,
            },
            available_plans: plans,
        });
    } catch (error) {
        console.error('Subscription info error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
