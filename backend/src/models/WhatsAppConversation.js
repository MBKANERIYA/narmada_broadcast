import mongoose from 'mongoose';

const WhatsAppConversationSchema = new mongoose.Schema({
    tenant_id: { type: String, required: true },
    phone: { type: String, required: true },
    contact_name: { type: String, default: '' },
    contact_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    last_message_text: { type: String, default: '' },
    last_message_at: { type: Date, default: Date.now },
    window_expires_at: { type: Date, default: null },
    unread_count: { type: Number, default: 0 },
    is_archived: { type: Boolean, default: false },
    bot_paused: { type: Boolean, default: false },
    labels: { type: [String], default: [] }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Index for quick lookups
WhatsAppConversationSchema.index({ tenant_id: 1, phone: 1 }, { unique: true });

export default mongoose.model('WhatsAppConversation', WhatsAppConversationSchema);
