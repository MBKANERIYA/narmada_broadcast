import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/projects
 * List all projects with unit counts
 */
router.get('/', async (req, res) => {
    try {
        const projects = await query(`
            SELECT p.*, u.name as created_by_name,
                   COUNT(i.id) as inventory_count
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN inventory i ON i.project_id = p.id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `);
        res.json(projects);
    } catch (error) {
        console.error('Projects list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/projects/:id
 * Get single project with inventory items
 */
router.get('/:id', async (req, res) => {
    try {
        const project = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const inventoryItems = await query(
            'SELECT * FROM inventory WHERE project_id = ? ORDER BY size',
            [req.params.id]
        );

        res.json({ ...project, inventory: inventoryItems });
    } catch (error) {
        console.error('Project detail error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/projects
 * Create new project
 */
router.post('/', async (req, res) => {
    try {
        const { name, location, builder, total_units, unit_types, description } = req.body;
        const userId = req.user?.userId;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const result = await run(`
            INSERT INTO projects (name, location, builder, total_units, unit_types, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            location || null,
            builder || null,
            total_units || 0,
            unit_types ? JSON.stringify(unit_types) : null,
            description || null,
            userId
        ]);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Project created' });
    } catch (error) {
        console.error('Project create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/projects/:id
 * Update project
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, location, builder, total_units, unit_types, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        await run(`
            UPDATE projects 
            SET name = ?, location = ?, builder = ?, total_units = ?, unit_types = ?, description = ?
            WHERE id = ?
        `, [
            name,
            location || null,
            builder || null,
            total_units || 0,
            unit_types ? JSON.stringify(unit_types) : null,
            description || null,
            req.params.id
        ]);

        res.json({ success: true, message: 'Project updated' });
    } catch (error) {
        console.error('Project update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/projects/:id/units
 * Update unit counts for a project
 */
router.patch('/:id/units', async (req, res) => {
    try {
        const { unit_types, total_units } = req.body;

        await run(`
            UPDATE projects SET unit_types = ?, total_units = ? WHERE id = ?
        `, [JSON.stringify(unit_types), total_units || 0, req.params.id]);

        res.json({ success: true, message: 'Unit counts updated' });
    } catch (error) {
        console.error('Project units update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/projects/:id
 * Delete project (admin only)
 */
router.delete('/:id', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        await run('DELETE FROM projects WHERE id = ?', [req.params.id]);
        res.status(204).send();
    } catch (error) {
        console.error('Project delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
