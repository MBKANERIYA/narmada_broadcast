import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, run, get } from '../database.js';
import { generateToken, auth as authMiddleware } from '../middleware/auth.js';
import { checkUserLimit } from '../middleware/limits.js';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Tenant-scoped login: looks up user within the current tenant
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Look up user scoped to current tenant
        const user = await get(
            'SELECT * FROM users WHERE email = ? AND tenant_id = ?',
            [email, req.tenantId]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token with tenantId
        const token = generateToken(user.id, user.email, user.role, req.tenantId);

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            tenant: {
                id: req.tenant.id,
                name: req.tenant.name,
                slug: req.tenant.slug,
                logo_url: req.tenant.logo_url,
                primary_color: req.tenant.primary_color,
                subscription_plan: req.tenant.subscription_plan,
            },
        });
    } catch (error) {
        console.error('[LOGIN ERROR]', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/auth/register
 * Admin-only: create new user accounts within the tenant
 */
router.post('/register', authMiddleware, checkUserLimit, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required to create users' });
        }

        const { name, email, password } = req.body;
        const role = ['admin', 'agent'].includes(req.body.role) ? req.body.role : 'agent';

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email already exists within this tenant
        const existing = await get(
            'SELECT id FROM users WHERE email = ? AND tenant_id = ?',
            [email, req.tenantId]
        );
        if (existing) {
            return res.status(409).json({ error: 'Email already registered in your firm' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        const result = await run(
            'INSERT INTO users (tenant_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [req.tenantId, name, email, passwordHash, role]
        );

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/users
 * List users within the current tenant
 */
router.get('/', async (req, res) => {
    try {
        const users = await query(
            'SELECT id, name, email, role, created_at FROM users WHERE tenant_id = ? ORDER BY created_at DESC',
            [req.tenantId]
        );
        res.json(users);
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/users/:id
 * Delete a user within the current tenant (admin only)
 */
router.delete('/:id', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const userId = req.params.id;

        // Prevent self-deletion
        if (parseInt(userId) === req.user.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        // Only delete within this tenant
        await run('DELETE FROM users WHERE id = ? AND tenant_id = ?', [userId, req.tenantId]);
        res.status(204).send();
    } catch (error) {
        console.error('User delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
