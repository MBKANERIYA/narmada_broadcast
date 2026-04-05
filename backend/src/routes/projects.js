import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/projects
 */
router.get('/', async (req, res) => {
    try {
        const projects = await query(`
            SELECT p.*, u.name as created_by_name,
                   COUNT(i.id) as inventory_count
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LEFT JOIN inventory i ON i.project_id = p.id
            WHERE p.tenant_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `, [req.tenantId]);
        res.json(projects);
    } catch (error) {
        console.error('Projects list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/projects/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const project = await get('SELECT * FROM projects WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const inventoryItems = await query(
            'SELECT * FROM inventory WHERE project_id = ? AND tenant_id = ? ORDER BY size',
            [req.params.id, req.tenantId]
        );

        res.json({ ...project, inventory: inventoryItems });
    } catch (error) {
        console.error('Project detail error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/projects
 */
router.post('/', async (req, res) => {
    try {
        const { name, location, builder, total_units, unit_types, description } = req.body;
        const userId = req.user?.userId;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const result = await run(`
            INSERT INTO projects (tenant_id, name, location, builder, total_units, unit_types, description, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.tenantId, name, location || null, builder || null,
            total_units || 0, unit_types ? JSON.stringify(unit_types) : null,
            description || null, userId
        ]);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Project created' });
    } catch (error) {
        console.error('Project create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/projects/:id
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
            WHERE id = ? AND tenant_id = ?
        `, [
            name, location || null, builder || null, total_units || 0,
            unit_types ? JSON.stringify(unit_types) : null, description || null,
            req.params.id, req.tenantId
        ]);

        res.json({ success: true, message: 'Project updated' });
    } catch (error) {
        console.error('Project update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PATCH /api/v1/projects/:id/units
 */
router.patch('/:id/units', async (req, res) => {
    try {
        const { unit_types, total_units } = req.body;

        await run(
            'UPDATE projects SET unit_types = ?, total_units = ? WHERE id = ? AND tenant_id = ?',
            [JSON.stringify(unit_types), total_units || 0, req.params.id, req.tenantId]
        );

        res.json({ success: true, message: 'Unit counts updated' });
    } catch (error) {
        console.error('Project units update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/projects/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        await run('DELETE FROM projects WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        res.status(204).send();
    } catch (error) {
        console.error('Project delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
