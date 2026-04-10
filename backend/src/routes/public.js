/**
 * Public Signup Route
 * 
 * This route handles self-service tenant creation + admin user provisioning.
 * It is mounted BEFORE the tenant middleware so new users can sign up
 * without an existing tenant context.
 * 
 * POST /api/v1/public/signup
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { run, get } from '../database.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

router.post('/signup', async (req, res) => {
    try {
        const { name, firmName, email, password } = req.body;

        if (!name || !firmName || !email || !password) {
            return res.status(400).json({ error: 'Name, business name, email, and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Generate slug from firm name
        const slug = firmName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (!slug) {
            return res.status(400).json({ error: 'Invalid business name' });
        }

        // Check if slug already exists
        const existingTenant = await get('SELECT id FROM tenants WHERE slug = ?', [slug]);
        if (existingTenant) {
            return res.status(409).json({ error: 'A business with a similar name already exists. Try a different name.' });
        }

        // Check if email already exists globally
        const existingUser = await get('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(409).json({ error: 'This email is already registered. Try signing in.' });
        }

        // Create tenant with 14-day trial
        const trialEnds = new Date();
        trialEnds.setDate(trialEnds.getDate() + 14);

        const tenantResult = await run(
            `INSERT INTO tenants (name, slug, email, subscription_plan, subscription_status, trial_ends_at)
             VALUES (?, ?, ?, 'trial', 'active', ?)`,
            [firmName, slug, email, trialEnds.toISOString()]
        );
        const tenantId = tenantResult.lastInsertRowid;

        // Create admin user
        const passwordHash = bcrypt.hashSync(password, 10);
        const userResult = await run(
            'INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [tenantId, name, email, passwordHash, 'admin']
        );
        const userId = userResult.lastInsertRowid;

        // Auto-login: generate token
        const token = generateToken(userId, email, 'admin', tenantId);

        console.log(`[SIGNUP] New tenant created: ${firmName} (${slug}) by ${email}`);

        res.status(201).json({
            token,
            user: { id: userId, name, email, role: 'admin' },
            tenant: {
                id: tenantId, name: firmName, slug,
                subscription_plan: 'trial', subscription_status: 'active',
            },
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
