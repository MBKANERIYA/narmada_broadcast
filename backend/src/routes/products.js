import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Product from '../models/Product.js';
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

router.post('/upload-images', runUpload(upload.array(PRODUCT_UPLOAD_FIELD, 10)), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No images uploaded' });
        const imageUrls = req.files.map(file => publicUploadUrl(req, file.filename));
        res.json({ image_urls: imageUrls, image_url: imageUrls[0] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

router.post('/upload-image', runUpload(upload.single('image')), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const imageUrl = publicUploadUrl(req, req.file.filename);
    return res.json({ image_url: imageUrl, image_urls: [imageUrl] });
});

router.get('/', async (req, res) => {
    try {
        const products = await Product.find().sort({ created_at: -1 });
        res.json({ products: products.map(p => {
            const obj = p.toObject();
            obj.id = obj._id;
            return obj;
        }) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

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

        const product = new Product({
            name, description: description || '', mrp: mrp || 0, selling_price: selling_price || 0,
            category: category || '', sku: sku || '', image_url: image_url || '', images: images || [], product_vector: vector
        });
        await product.save();
        res.status(201).json({ message: 'Product added successfully!', id: product._id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add product' });
    }
});

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

        const product = await Product.findByIdAndUpdate(id, {
            name, description: description || '', mrp: mrp || 0, selling_price: selling_price || 0,
            category: category || '', sku: sku || '', image_url: image_url || '', images: images || [], product_vector: vector
        });

        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product updated successfully!' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
