import { Router } from 'express';
import WhatsAppMessage from '../models/WhatsAppMessage.js';
import WhatsAppConversation from '../models/WhatsAppConversation.js';
import WhatsAppChatMessage from '../models/WhatsAppChatMessage.js';
import Setting from '../models/Setting.js';
import { emitToTenant } from '../services/websocket.js';
import { normalizePhone } from '../services/whatsapp.js';

const router = Router();

/**
 * POST /api/v1/whatsapp-webhook
 * Meta Cloud API Webhook to receive messages and message delivery statuses
 */
router.post('/', async (req, res) => {
    try {
        const body = req.body;
        console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));

        if (body.object !== 'whatsapp_business_account') {
            return res.sendStatus(404);
        }

        // We only have one tenant for now, fetch the global settings to get the tenant ID
        let setting = await Setting.findOne({ singletonId: 'admin_settings' });
        if (!setting) {
            console.error('Webhook: Setting not found');
            return res.sendStatus(200);
        }
        const tenantId = setting._id.toString();

        for (const entry of body.entry) {
            for (const change of entry.changes) {
                const value = change.value;

                // 1. Handle incoming messages
                if (value.messages && value.messages.length > 0) {
                    for (const msg of value.messages) {
                        const fromPhone = normalizePhone(msg.from) || msg.from;
                        const messageId = msg.id;
                        const contactName = value.contacts?.[0]?.profile?.name || fromPhone;
                        
                        let bodyText = '[Unsupported Media]';
                        let mediaId = null;
                        let mediaMimeType = null;
                        
                        if (msg.type === 'text') {
                            bodyText = msg.text?.body || '';
                        } else if (msg.type === 'image') {
                            bodyText = msg.image?.caption || '📷 Image';
                            mediaId = msg.image?.id;
                            mediaMimeType = msg.image?.mime_type;
                        } else if (msg.type === 'document') {
                            bodyText = msg.document?.caption || msg.document?.filename || '📎 Document';
                            mediaId = msg.document?.id;
                            mediaMimeType = msg.document?.mime_type;
                        } else if (msg.type === 'audio') {
                            bodyText = '🎤 Voice Note';
                            mediaId = msg.audio?.id;
                            mediaMimeType = msg.audio?.mime_type;
                        } else if (msg.type === 'video') {
                            bodyText = msg.video?.caption || '🎥 Video';
                            mediaId = msg.video?.id;
                            mediaMimeType = msg.video?.mime_type;
                        } else if (msg.type === 'button') {
                            bodyText = msg.button?.text || '[Button Clicked]';
                        } else if (msg.type === 'interactive') {
                            if (msg.interactive?.type === 'button_reply') {
                                bodyText = msg.interactive?.button_reply?.title || '[Button Reply]';
                            } else if (msg.interactive?.type === 'list_reply') {
                                bodyText = msg.interactive?.list_reply?.title || '[List Reply]';
                            }
                        }

                        // Check if message already exists
                        const existingMsg = await WhatsAppChatMessage.findOne({ provider_message_id: messageId });
                        if (existingMsg) continue;

                        // Find or create conversation
                        let conversation = await WhatsAppConversation.findOne({ tenant_id: tenantId, phone: fromPhone });
                        
                        if (!conversation) {
                            conversation = new WhatsAppConversation({
                                tenant_id: tenantId,
                                phone: fromPhone,
                                contact_name: contactName,
                                window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
                            });
                        } else {
                            if (!conversation.contact_name) conversation.contact_name = contactName;
                        }

                        // Save chat message
                        const newMsg = await WhatsAppChatMessage.create({
                            tenant_id: tenantId,
                            conversation_id: conversation._id,
                            direction: 'inbound',
                            message_type: msg.type,
                            body: bodyText,
                            media_id: mediaId,
                            media_mime_type: mediaMimeType,
                            provider_message_id: messageId,
                            status: 'received'
                        });

                        // Update conversation
                        conversation.last_message_text = bodyText.substring(0, 100);
                        conversation.last_message_at = new Date();
                        conversation.unread_count = (conversation.unread_count || 0) + 1;
                        // Renew 24h window for inbound messages
                        conversation.window_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        
                        await conversation.save();

                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation._id.toString() });
                    }
                }

                // 2. Handle message statuses (sent, delivered, read, failed)
                if (value.statuses && value.statuses.length > 0) {
                    for (const status of value.statuses) {
                        const messageId = status.id;
                        const updateData = { status: status.status };
                        
                        if (status.status === 'failed' && status.errors) {
                            updateData.error_message = status.errors[0]?.message || 'Unknown error';
                        }
                        
                        // Update broadcast message status
                        await WhatsAppMessage.updateOne(
                            { provider_message_id: messageId },
                            { $set: updateData }
                        );

                        // Update chat message status
                        const chatMsg = await WhatsAppChatMessage.findOneAndUpdate(
                            { provider_message_id: messageId },
                            { $set: updateData },
                            { new: true }
                        );

                        if (chatMsg) {
                            emitToTenant(tenantId, 'chat_updated', { type: 'status_update', conversationId: chatMsg.conversation_id.toString(), messageId: chatMsg._id.toString(), status: updateData.status });
                        }
                    }
                }
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.sendStatus(500);
    }
});

/**
 * GET /api/v1/whatsapp-webhook
 * Meta Cloud API Webhook Verification
 */
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

export default router;
