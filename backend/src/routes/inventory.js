import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/inventory
 */
router.get('/', async (req, res) => {
    try {
        const items = await query(`
            SELECT i.*, u.name as created_by_name 
            FROM inventory i
            LEFT JOIN users u ON i.created_by = u.id
            WHERE i.tenant_id = ?
            ORDER BY i.is_hot DESC, i.created_at DESC
        `, [req.tenantId]);
        res.json(items);
    } catch (error) {
        console.error('Inventory list error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/v1/inventory/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const item = await get(`
            SELECT i.*, u.name as created_by_name 
            FROM inventory i
            LEFT JOIN users u ON i.created_by = u.id
            WHERE i.id = ? AND i.tenant_id = ?
        `, [req.params.id, req.tenantId]);

        if (!item) {
            return res.status(404).json({ error: 'Property not found' });
        }
        res.json(item);
    } catch (error) {
        console.error('Inventory get error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/v1/inventory
 */
router.post('/', async (req, res) => {
    try {
        const { photo_link, location, size, demand, property_type, listing_type, status, is_hot, price, other_details } = req.body;
        const userId = req.user?.userId;

        if (!location) {
            return res.status(400).json({ error: 'Location is required' });
        }

        const result = await run(`
            INSERT INTO inventory (tenant_id, photo_link, location, size, demand, property_type, listing_type, status, is_hot, price, other_details, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.tenantId,
            photo_link || null, location, size || null, demand || null,
            property_type || null, listing_type || 'sale', status || 'available',
            is_hot || false, price || null, other_details || null, userId
        ]);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Property added to inventory' });
    } catch (error) {
        console.error('Inventory create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/inventory/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const { photo_link, location, size, demand, property_type, listing_type, status, is_hot, price, other_details } = req.body;

        if (!location) {
            return res.status(400).json({ error: 'Location is required' });
        }

        await run(`
            UPDATE inventory 
            SET photo_link = ?, location = ?, size = ?, demand = ?, property_type = ?, listing_type = ?, status = ?, is_hot = ?, price = ?, other_details = ?
            WHERE id = ? AND tenant_id = ?
        `, [
            photo_link || null, location, size || null, demand || null,
            property_type || null, listing_type || 'sale', status || 'available',
            is_hot || false, price || null, other_details || null,
            req.params.id, req.tenantId
        ]);

        res.json({ success: true, message: 'Property updated' });
    } catch (error) {
        console.error('Inventory update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/inventory/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        await run('DELETE FROM inventory WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        res.json({ success: true, message: 'Property deleted' });
    } catch (error) {
        console.error('Inventory delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
