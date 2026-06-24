import { Router } from 'express';
import WhatsAppMessage from '../models/WhatsAppMessage.js';

const router = Router();

/**
 * POST /api/v1/whatsapp-webhook
 * Meta Cloud API Webhook to receive message delivery statuses (delivered, read, failed)
 */
router.post('/', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    const value = change.value;
                    
                    // Handle message statuses (sent, delivered, read, failed)
                    if (value.statuses && value.statuses.length > 0) {
                        for (const status of value.statuses) {
                            const messageId = status.id;
                            const updateData = { status: status.status };
                            
                            if (status.status === 'failed' && status.errors) {
                                updateData.error_message = status.errors[0]?.message || 'Unknown error';
                            }
                            
                            await WhatsAppMessage.updateOne(
                                { provider_message_id: messageId },
                                { $set: updateData }
                            );
                        }
                    }
                }
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
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
