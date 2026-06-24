import mongoose from 'mongoose';

const WhatsAppMessageSchema = new mongoose.Schema({
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppCampaign', required: true },
    phone: { type: String, required: true },
    recipient_name: { type: String, default: '' },
    recipient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    status: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], default: 'pending' },
    sent_at: { type: Date, default: null },
    provider_message_id: { type: String, default: null },
    error_message: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export default mongoose.model('WhatsAppMessage', WhatsAppMessageSchema);
