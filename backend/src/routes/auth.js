import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, run, get } from '../database.js';
import { generateToken, auth as authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * DELETE /api/v1/users/:id
 */
router.delete('/:id', async (req, res) => {
    console.log(`[DELETE] Request for user ${req.params.id} by ${req.user?.email} (${req.user?.role})`);
    try {
        // Only admin can delete
        if (!req.user || req.user.role !== 'admin') {
            console.log('[DELETE] Denied: Not admin');
            return res.status(403).json({ error: 'Admin access required' });
        }

        const userId = req.params.id;

        // Prevent self-deletion
        if (parseInt(userId) === req.user.userId) {
            console.log('[DELETE] Denied: Self deletion');
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        console.log('[DELETE] Executing DB delete...');
        await run('DELETE FROM users WHERE id = ?', [userId]);
        console.log('[DELETE] Success');
        res.status(204).send();
    } catch (error) {
        console.error('User delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('[LOGIN] Attempt for:', email);

        if (!email || !password) {
            console.log('[LOGIN] Missing email or password');
            return res.status(400).json({ error: 'Email and password required' });
        }

        console.log('[LOGIN] Looking up user...');
        const user = await get('SELECT * FROM users WHERE email = ?', [email]);
        console.log('[LOGIN] User found:', user ? 'Yes' : 'No');

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('[LOGIN] Checking password...');
        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            console.log('[LOGIN] Invalid password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('[LOGIN] Generating token...');
        const token = generateToken(user.id, user.email, user.role);

        console.log('[LOGIN] Success for:', email);
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('[LOGIN ERROR]', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/auth/register
 * Admin-only: create new user accounts
 */
router.post('/register', authMiddleware, async (req, res) => {
    try {
        // Only authenticated admins can create users
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required to create users' });
        }

        const { name, email, password } = req.body;
        // Whitelist role — only allow 'admin' or 'agent'
        const role = ['admin', 'agent'].includes(req.body.role) ? req.body.role : 'agent';

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email already exists
        const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        const result = await run(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [name, email, passwordHash, role]
        );

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/users (for assignment dropdown and team list)
 * This becomes the root when mounted at /api/v1/users
 */
router.get('/', async (req, res) => {
    try {
        const users = await query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
        res.json(users);
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
