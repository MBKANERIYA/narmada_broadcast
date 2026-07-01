import { Router } from 'express';
import { generateToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Hardcoded authentication as requested
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanPass = String(password || '').trim();

        // Hardcoded check for single client admin
        if ((cleanEmail === 'admin' || cleanEmail.startsWith('admin@')) && cleanPass === 'admin123') {
            const token = generateToken('admin-user-id', 'admin', 'admin');
            return res.json({
                token,
                user: { id: 'admin-user-id', name: 'Admin User', email: 'admin', role: 'admin' },
                tenant: { id: 'single-tenant', name: 'Admin Account', slug: 'admin', subscription_status: 'active', subscription_plan: 'commerce' }
            });
        }

        return res.status(401).json({ error: 'Invalid credentials. Use admin / admin123' });
    } catch (error) {
        console.error('[LOGIN ERROR]', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/auth/signup
 */
router.post('/signup', async (req, res) => {
    res.status(403).json({ error: 'Signup is disabled in this single-user version.' });
});

/**
 * GET /api/v1/users
 */
router.get('/', async (req, res) => {
    res.json([{ id: 'admin-user-id', name: 'Admin User', email: 'admin', role: 'admin', created_at: new Date() }]);
});

/**
 * DELETE /api/v1/users/:id
 */
router.delete('/:id', async (req, res) => {
    res.status(403).json({ error: 'Cannot delete the hardcoded admin user' });
});

export default router;
