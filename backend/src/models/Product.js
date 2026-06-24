import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    mrp: { type: Number, default: 0 },
    selling_price: { type: Number, default: 0 },
    category: { type: String },
    sku: { type: String },
    image_url: { type: String },
    images: { type: [String], default: [] },
    meta_product_id: { type: String },
    product_vector: { type: [Number] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Pre-save removed

export default mongoose.model('Product', ProductSchema);
