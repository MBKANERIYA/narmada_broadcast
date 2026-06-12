import express from 'express';
import { query, run, get } from '../database.js';
import { syncProductToMeta, deleteProductFromMeta } from '../services/whatsapp.js';
import { generateEmbedding } from '../services/smartResponder.js';

const router = express.Router();

// Get all products for the tenant
router.get('/', async (req, res) => {
    try {
        const products = await query('SELECT * FROM products WHERE tenant_id = ? ORDER BY created_at DESC', [req.tenant.id]);
        res.json({ products });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Add a new product
router.post('/', async (req, res) => {
    try {
        const { name, description, mrp, selling_price, category, sku, image_url } = req.body;
        
        if (!name) return res.status(400).json({ error: 'Product name is required' });

        const searchString = `Product: ${name}\nCategory: ${category || 'General'}\nDescription: ${description || ''}\nPrice: ${selling_price || mrp || ''}`;
        const vector = await generateEmbedding(searchString);

        const result = await run(
            `INSERT INTO products (tenant_id, name, description, mrp, selling_price, category, sku, image_url, product_vector) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.tenant.id, name, description || '', mrp || 0, selling_price || 0, category || '', sku || '', image_url || '', JSON.stringify(vector)]
        );

        const productId = result.lastInsertRowid;
        
        let syncError = null;
        try {
            const metaProductId = await syncProductToMeta(req.tenant, { id: productId, ...req.body });
            if (metaProductId) {
                await run('UPDATE products SET meta_product_id = ? WHERE id = ?', [metaProductId, productId]);
            }
        } catch (syncErr) {
            syncError = syncErr.message;
            console.error('Product created but Meta sync failed:', syncErr.message);
        }

        if (syncError) {
            res.status(201).json({ message: 'Product added locally, but Facebook Sync Failed: ' + syncError, id: productId });
        } else {
            res.status(201).json({ message: 'Product added successfully & synced to Meta!', id: productId });
        }
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Update a product
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, mrp, selling_price, category, sku, image_url } = req.body;

        if (!name) return res.status(400).json({ error: 'Product name is required' });

        const searchString = `Product: ${name}\nCategory: ${category || 'General'}\nDescription: ${description || ''}\nPrice: ${selling_price || mrp || ''}`;
        const vector = await generateEmbedding(searchString);

        const result = await run(
            `UPDATE products SET name = ?, description = ?, mrp = ?, selling_price = ?, category = ?, sku = ?, image_url = ?, product_vector = ?
             WHERE id = ? AND tenant_id = ?`,
            [name, description || '', mrp || 0, selling_price || 0, category || '', sku || '', image_url || '', JSON.stringify(vector), id, req.tenant.id]
        );

        if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });

        let syncError = null;
        const [prod] = await query('SELECT * FROM products WHERE id = ? AND tenant_id = ?', [id, req.tenant.id]);
        if (prod) {
            try {
                const metaProductId = await syncProductToMeta(req.tenant, { ...prod, ...req.body });
                if (metaProductId && metaProductId !== prod.meta_product_id) {
                    await run('UPDATE products SET meta_product_id = ? WHERE id = ?', [metaProductId, id]);
                }
            } catch (syncErr) {
                syncError = syncErr.message;
                console.error('Product updated but Meta sync failed:', syncErr.message);
            }
        }

        if (syncError) {
            res.json({ message: 'Product updated locally, but Facebook Sync Failed: ' + syncError });
        } else {
            res.json({ message: 'Product updated successfully & synced to Meta!' });
        }
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete a product
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [prod] = await query('SELECT meta_product_id FROM products WHERE id = ? AND tenant_id = ?', [id, req.tenant.id]);

        const result = await run('DELETE FROM products WHERE id = ? AND tenant_id = ?', [id, req.tenant.id]);

        if (result.changes === 0) return res.status(404).json({ error: 'Product not found' });

        if (prod && prod.meta_product_id) {
            try {
                await deleteProductFromMeta(req.tenant, prod.meta_product_id);
            } catch (syncErr) {
                console.error('Meta delete failed:', syncErr.message);
            }
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
