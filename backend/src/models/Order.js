import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sku: { type: String },
    item_name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 }
});

const OrderSchema = new mongoose.Schema({
    contact_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    phone: { type: String, required: true },
    total_amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    payment_status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    fulfillment_status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
    shipping_address: { type: String },
    notes: { type: String },
    payment_link: { type: String },
    payment_link_id: { type: String },
    last_reminder_at: { type: Date },
    items: [OrderItemSchema],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Pre-save removed

export default mongoose.model('Order', OrderSchema);
