import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query, run, get } from '../database.js';
import { syncProductToMeta, deleteProductFromMeta } from '../services/whatsapp.js';
import { generateEmbedding } from '../services/smartResponder.js';

const router = express.Router();
const PRODUCT_UPLOAD_FIELD = 'images';
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function isAllowedProductImage(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    return ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype) && ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function publicUploadUrl(req, filename) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || req.get('host');
    return `${protocol}://${host}/api/v1/uploads/${filename}`;
}

function runUpload(uploadMiddleware) {
    return (req, res, next) => {
        uploadMiddleware(req, res, (error) => {
            if (!error) return next();
            const message = error instanceof multer.MulterError ? error.message : (error.message || 'Upload failed');
            return res.status(400).json({ error: message });
        });
    };
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const originalBase = path.basename(file.originalname || 'product-image');
        const safeFilename = originalBase.replace(/[^a-zA-Z0-9.-]/g, '_') || 'product-image';
        cb(null, `${Date.now()}_${Math.round(Math.random() * 1e9)}_${safeFilename}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (isAllowedProductImage(file)) return cb(null, true);
        return cb(new Error('Only JPG, PNG, WebP, or GIF image uploads are allowed'));
    },
});

// Upload images for a product
router.post('/upload-images', runUpload(upload.array(PRODUCT_UPLOAD_FIELD, 10)), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }
        const imageUrls = req.files.map(file => publicUploadUrl(req, file.filename));
        res.json({ image_urls: imageUrls, image_url: imageUrls[0] });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

router.post('/upload-image', runUpload(upload.single('image')), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const imageUrl = publicUploadUrl(req, req.file.filename);
    return res.json({ image_url: imageUrl, image_urls: [imageUrl] });
});

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
        let { name, description, mrp, selling_price, category, sku, image_url, images } = req.body;

        if (!name) return res.status(400).json({ error: 'Product name is required' });

        if (images && Array.isArray(images) && images.length > 0) {
            image_url = images[0];
        } else if (image_url && !images) {
            images = [image_url];
        }

        const searchString = `Product: ${name}\nCategory: ${category || 'General'}\nDescription: ${description || ''}\nPrice: ${selling_price || mrp || ''}`;
        const vector = await generateEmbedding(searchString);

        const result = await run(
            `INSERT INTO products (tenant_id, name, description, mrp, selling_price, category, sku, image_url, images, product_vector)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.tenant.id, name, description || '', mrp || 0, selling_price || 0, category || '', sku || '', image_url || '', JSON.stringify(images || []), JSON.stringify(vector)]
        );

        const productId = result.lastInsertRowid;

        let syncError = null;
        try {
            const productForSync = { id: productId, name, description, mrp, selling_price, category, sku, image_url, images };
            const metaProductId = await syncProductToMeta(req.tenant, productForSync);
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
        let { name, description, mrp, selling_price, category, sku, image_url, images } = req.body;

        if (!name) return res.status(400).json({ error: 'Product name is required' });

        if (images && Array.isArray(images) && images.length > 0) {
            image_url = images[0];
        } else if (image_url && (!images || images.length === 0)) {
            images = [image_url];
        }

        const searchString = `Product: ${name}\nCategory: ${category || 'General'}\nDescription: ${description || ''}\nPrice: ${selling_price || mrp || ''}`;
        const vector = await generateEmbedding(searchString);

        const result = await run(
            `UPDATE products SET name = ?, description = ?, mrp = ?, selling_price = ?, category = ?, sku = ?, image_url = ?, images = ?, product_vector = ?
             WHERE id = ? AND tenant_id = ?`,
            [name, description || '', mrp || 0, selling_price || 0, category || '', sku || '', image_url || '', JSON.stringify(images || []), JSON.stringify(vector), id, req.tenant.id]
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

        let syncError = null;
        if (prod && prod.meta_product_id) {
            try {
                await deleteProductFromMeta(req.tenant, prod.meta_product_id);
            } catch (syncErr) {
                syncError = syncErr.message;
                console.error('Meta delete failed:', syncErr.message);
            }
        }

        if (syncError) {
            res.json({ message: 'Product deleted locally, but Meta Sync Failed: ' + syncError });
        } else {
            res.json({ message: 'Product deleted successfully' });
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
