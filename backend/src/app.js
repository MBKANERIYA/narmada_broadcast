import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { auth } from './middleware/auth.js';
import { resolveTenant, superAdminOnly } from './middleware/tenant.js';
import { run, get, query } from './database.js';
import { normalizePhone } from './services/whatsapp.js';
import { emitToTenant } from './services/websocket.js';

import Razorpay from 'razorpay';
import crypto from 'crypto';

// Routes
import authRoutes from './routes/auth.js';
import whatsappRoutes from './routes/whatsapp.js';
import whatsappChatRoutes from './routes/whatsapp-chat.js';
import contactsRoutes from './routes/contacts.js';
import tenantSettingsRoutes from './routes/tenant-settings.js';
import leadsRoutes from './routes/leads.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import productsRoutes from './routes/products.js';
import knowledgeBaseRoutes from './routes/knowledge-base.js';
import ordersRoutes from './routes/orders.js';
import analyticsRoutes from './routes/analytics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-slug'],
}));

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/', (req, res) => res.json({ message: 'WhatsApp Marketing Platform API' }));

// ============================================================
// WhatsApp Webhook — Public endpoint (no tenant/auth needed)
// Handles BOTH delivery statuses AND incoming messages
// ============================================================
app.get('/api/v1/whatsapp-webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "CrmSaasWebhookToken123";

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("✅ Webhook Verified by Meta");
            res.status(200).send(challenge);
        } else {
            console.warn("⚠️ Webhook Verification Failed");
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// ============================================================
// Razorpay Webhook — Public endpoint (no tenant/auth needed)
// ============================================================
app.post('/api/v1/razorpay-webhook', async (req, res) => {
    try {
        const secret = req.headers['x-razorpay-signature'];
        const body = req.body;
        
        console.log(`[Razorpay Webhook] Received event: ${body.event}`);
        
        if (body.event === 'payment_link.paid') {
            const paymentLink = body.payload.payment_link.entity;
            const orderIdStr = paymentLink.notes?.order_id;
            
            if (orderIdStr) {
                const orderId = parseInt(orderIdStr, 10);
                
                // Get the order to find the tenant
                const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
                
                if (order && order.payment_status !== 'paid') {
                    // Update order status atomically to prevent race conditions
                    const updateResult = await run("UPDATE orders SET payment_status = 'paid' WHERE id = ? AND payment_status != 'paid'", [orderId]);
                    if (updateResult.changes === 0) {
                        console.log(`[Razorpay Webhook] Order #${orderId} already paid. Skipping duplicate webhook.`);
                        return res.json({ status: 'ok' });
                    }
                    console.log(`[Razorpay Webhook] Order #${orderId} marked as paid.`);
                    
                    // Fetch tenant settings to get razorpay secret if validation is needed
                    const tenant = await get('SELECT * FROM tenants WHERE id = ?', [order.tenant_id]);
                    
                    // Send WhatsApp confirmation
                    const { sendTextMessage } = await import('./services/whatsapp.js');
                    let botSettings = {};
                    try {
                        botSettings = typeof tenant.bot_settings === 'string' ? JSON.parse(tenant.bot_settings) : (tenant.bot_settings || {});
                    } catch (e) {}
                    
                    let confirmationMsg = botSettings.payment_success_template || '🎉 *Payment Received!*\n\nThank you for your payment of {currency} {total}. Your order #{order_id} is now confirmed and being processed.';
                    confirmationMsg = confirmationMsg.replace('{currency}', order.currency || 'INR')
                                                     .replace('{total}', order.total_amount)
                                                     .replace('{order_id}', orderId);
                    
                    await sendTextMessage(order.phone, confirmationMsg, tenant);
                    
                    // Update chat inbox UI real-time
                    emitToTenant(order.tenant_id, 'order_updated', { orderId, status: 'paid' });
                    
                    // Find conversation to emit chat update
                    const conv = await get('SELECT id FROM whatsapp_conversations WHERE tenant_id = ? AND phone = ?', [order.tenant_id, order.phone]);
                    if (conv) {
                        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(
                            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, status)
                             VALUES (?, ?, 'outbound', 'text', ?, 'sent')`,
                            [order.tenant_id, conv.id, confirmationMsg]
                        );
                        await run(
                            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`,
                            [confirmationMsg.substring(0, 100), nowStr, conv.id]
                        );
                        emitToTenant(order.tenant_id, 'chat_updated', { type: 'new_message', conversationId: conv.id });
                    }
                }
            }
        }
        
        res.sendStatus(200);
    } catch (err) {
        console.error('[Razorpay Webhook] Error:', err.message);
        res.sendStatus(500);
    }
});

// In-memory webhook event log for diagnostics (keeps last 20)
const webhookLog = [];

app.post('/api/v1/whatsapp-webhook', async (req, res) => {
    try {
        const body = req.body;
        const logEntry = { time: new Date().toISOString(), object: body.object, entries: body.entry?.length || 0 };
        webhookLog.push(logEntry);
        if (webhookLog.length > 20) webhookLog.shift();

        console.log(`[Webhook] Received event: object=${body.object}`);

        if (body.object === "whatsapp_business_account") {
            for (const entry of (body.entry || [])) {
                for (const change of (entry.changes || [])) {
                    const value = change.value;
                    const phoneNumberId = value?.metadata?.phone_number_id;

                    console.log(`[Webhook] Change field=${change.field}, phone_id=${phoneNumberId}, has_messages=${!!value?.messages}, has_statuses=${!!value?.statuses}`);

                    // ---- DELIVERY STATUS UPDATES ----
                    if (value?.statuses) {
                        for (const status of value.statuses) {
                            const messageId = status.id;
                            const currentStatus = status.status;
                            const timestamp = new Date(parseInt(status.timestamp) * 1000)
                                .toISOString().slice(0, 19).replace('T', ' ');

                            let errorDetail = null;
                            if (status.errors) {
                                errorDetail = status.errors.map(err =>
                                    `${err.title}: ${err.error_data?.details || err.message}`
                                ).join(' | ');
                            }

                            try {
                                // Update broadcast message log
                                if (currentStatus === 'delivered') {
                                    await run('UPDATE whatsapp_messages SET status = ?, delivered_at = ? WHERE provider_message_id = ?', ['delivered', timestamp, messageId]);
                                } else if (currentStatus === 'read') {
                                    await run('UPDATE whatsapp_messages SET status = ?, read_at = ? WHERE provider_message_id = ?', ['read', timestamp, messageId]);
                                } else if (currentStatus === 'failed') {
                                    await run('UPDATE whatsapp_messages SET status = ?, error_message = ? WHERE provider_message_id = ?', ['failed', errorDetail || 'Unknown failure', messageId]);
                                } else {
                                    await run('UPDATE whatsapp_messages SET status = ? WHERE provider_message_id = ?', [currentStatus, messageId]);
                                }

                                // Also update chat message status
                                if (currentStatus === 'delivered') {
                                    await run('UPDATE whatsapp_chat_messages SET status = ? WHERE provider_message_id = ? AND status != ?', ['delivered', messageId, 'read']);
                                } else if (currentStatus === 'read') {
                                    await run('UPDATE whatsapp_chat_messages SET status = ? WHERE provider_message_id = ?', ['read', messageId]);
                                } else if (currentStatus === 'failed') {
                                    await run('UPDATE whatsapp_chat_messages SET status = ?, error_message = ? WHERE provider_message_id = ?', ['failed', errorDetail || 'Unknown failure', messageId]);
                                }
                                // Emit status update to connected clients
                                const tenant = await get('SELECT id FROM tenants WHERE whatsapp_phone_number_id = ?', [phoneNumberId]);
                                if (tenant) {
                                    emitToTenant(tenant.id, 'chat_updated', { type: 'status_update', messageId, status: currentStatus });
                                }
                            } catch (dbErr) {
                                console.error('Webhook DB update error:', dbErr.message);
                            }
                        }
                    }

                    // ---- INCOMING MESSAGES (NEW — Chat Inbox) ----
                    if (value?.messages) {
                        for (const msg of value.messages) {
                            try {
                                await processIncomingMessage(msg, value.contacts, phoneNumberId);
                            } catch (err) {
                                console.error('[Webhook] Error processing incoming message:', err.message);
                            }
                        }
                    }
                }
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error("Webhook processing error:", error);
        res.sendStatus(500);
    }
});

/**
 * Check if the current time is outside the business store hours in the specified timezone
 */
function isAfterHours(botSettings) {
    if (!botSettings || !botSettings.store_hours || !botSettings.store_hours.enabled) {
        return false; // Not enabled or no settings -> business is always open
    }

    const { start, end, days, timezone } = botSettings.store_hours;
    if (!start || !end || !days || !Array.isArray(days) || days.length === 0) {
        return false;
    }

    try {
        const tz = timezone || 'Asia/Kolkata';
        const tzDateStr = new Date().toLocaleString('en-US', { timeZone: tz });
        const localDate = new Date(tzDateStr);

        const currentDay = localDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        const currentHour = localDate.getHours();
        const currentMin = localDate.getMinutes();

        if (!days.includes(currentDay)) {
            return true; // Not open today
        }

        const [startHour, startMin] = start.split(':').map(Number);
        const [endHour, endMin] = end.split(':').map(Number);

        const currentTimeMinutes = currentHour * 60 + currentMin;
        const startTimeMinutes = startHour * 60 + startMin;
        const endTimeMinutes = endHour * 60 + endMin;

        if (currentTimeMinutes < startTimeMinutes || currentTimeMinutes > endTimeMinutes) {
            return true; // Outside store hours
        }

        return false; // Within store hours
    } catch (e) {
        console.error('[Bot] Error in isAfterHours calculation:', e);
        return false; // Fail safe: assume open
    }
}

/**
 * Process an incoming WhatsApp message and store it in the chat system
 */
async function processIncomingMessage(msg, contacts, phoneNumberId) {
    const fromPhone = normalizePhone(msg.from);
    if (!fromPhone) {
        console.warn(`[Webhook] Could not normalize phone: ${msg.from}`);
        return;
    }

    const senderProfile = contacts?.[0]?.profile?.name || null;
    console.log(`[Webhook] Processing incoming message from ${fromPhone} (raw: ${msg.from}), type=${msg.type}, phone_number_id=${phoneNumberId}`);

    // Find the tenant by their phone_number_id
    const tenant = await get(
        'SELECT * FROM tenants WHERE whatsapp_phone_number_id = ? AND whatsapp_configured = TRUE',
        [phoneNumberId]
    );
    if (!tenant) {
        console.warn(`[Webhook] No tenant found for phone_number_id: ${phoneNumberId}. Check tenant WhatsApp settings.`);
        return;
    }
    const tenantId = tenant.id;
    console.log(`[Webhook] Matched tenant_id=${tenantId}`);

    // Find or create conversation
    let conversation = await get(
        'SELECT * FROM whatsapp_conversations WHERE tenant_id = ? AND phone = ?',
        [tenantId, fromPhone]
    );

    // Try to match phone to a contact
    let contactId = conversation?.contact_id || null;
    let contactName = senderProfile || conversation?.contact_name || fromPhone;

    if (!contactId) {
        const contact = await get(
            'SELECT id, name FROM contacts WHERE tenant_id = ? AND phone LIKE ?',
            [tenantId, `%${fromPhone.slice(-10)}`]
        );
        if (contact) {
            contactId = contact.id;
            contactName = contact.name;
        }
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const windowExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    // Extract message content
    let messageType = msg.type || 'text';
    let body = null;
    let mediaId = null;
    let mediaMime = null;
    let parsedOrderTotal = 0;

    if (msg.type === 'text') {
        body = msg.text?.body || '';
    } else if (msg.type === 'image') {
        body = msg.image?.caption || '';
        mediaId = msg.image?.id;
        mediaMime = msg.image?.mime_type;
    } else if (msg.type === 'video') {
        body = msg.video?.caption || '';
        mediaId = msg.video?.id;
        mediaMime = msg.video?.mime_type;
    } else if (msg.type === 'document') {
        body = msg.document?.filename || 'Document';
        mediaId = msg.document?.id;
        mediaMime = msg.document?.mime_type;
    } else if (msg.type === 'audio') {
        body = '🎵 Audio message';
        mediaId = msg.audio?.id;
        mediaMime = msg.audio?.mime_type;
    } else if (msg.type === 'reaction') {
        body = msg.reaction?.emoji || '👍';
        messageType = 'reaction';
    } else if (msg.type === 'sticker') {
        body = '🏷️ Sticker';
        mediaId = msg.sticker?.id;
        mediaMime = msg.sticker?.mime_type;
    } else if (msg.type === 'order') {
        messageType = 'order';
        const order = msg.order || {};
        const items = order.product_items || [];
        let totalAmount = 0;
        let currency = 'INR';
        const parsedItems = [];
        
        let text = '🛒 *New Order Received*\n\n';
        for (const item of items) {
            const price = parseFloat(item.item_price || 0);
            const qty = parseInt(item.quantity || 1);
            totalAmount += price * qty;
            currency = item.currency || currency;
            
            let productId = null;
            let itemName = `Item #${item.product_retailer_id}`;
            try {
                const product = await get('SELECT id, name, image_url FROM products WHERE tenant_id = ? AND sku = ?', [tenantId, item.product_retailer_id]);
                if (product) {
                    productId = product.id;
                    itemName = product.name;
                    if (product.image_url && !mediaId) {
                        mediaId = product.image_url;
                    }
                }
            } catch(e) {
                console.error('[Order] Product lookup error:', e.message);
            }
            
            text += `${qty}x ${itemName} — ${price.toFixed(2)} ${currency}\n`;
            parsedItems.push({ product_id: productId, sku: item.product_retailer_id, item_name: itemName, quantity: qty, price });
        }
        text += `\n*Total: ${totalAmount.toFixed(2)} ${currency}*`;
        if (order.text) {
            text += `\n\nNotes: ${order.text}`;
        }
        body = text;
        parsedOrderTotal = totalAmount;

        try {
            const orderResult = await run(
                `INSERT INTO orders (tenant_id, contact_id, phone, total_amount, currency, notes) VALUES (?, ?, ?, ?, ?, ?)`,
                [tenantId, contactId, fromPhone, totalAmount, currency, order.text || null]
            );
            const orderId = orderResult.lastInsertRowid;
            for (const pi of parsedItems) {
                await run(
                    `INSERT INTO order_items (order_id, product_id, sku, item_name, quantity, price) VALUES (?, ?, ?, ?, ?, ?)`,
                    [orderId, pi.product_id, pi.sku, pi.item_name, pi.quantity, pi.price]
                );
            }
            console.log(`[Order] ✅ Created order #${orderId} (${parsedItems.length} items, ${totalAmount.toFixed(2)} ${currency}) for ${fromPhone}`);
        } catch (omsErr) {
            console.error('[Order] Failed to save to OMS:', omsErr.message);
        }
    } else {
        body = `[${msg.type}]`;
    }

    const previewText = (body || '').substring(0, 100);

    if (!conversation) {
        // Create new conversation
        const result = await run(
            `INSERT INTO whatsapp_conversations (tenant_id, phone, contact_name, contact_id, last_message_text, last_message_at, last_customer_message_at, window_expires_at, unread_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [tenantId, fromPhone, contactName, contactId, previewText, now, now, windowExpiry]
        );
        conversation = { id: result.lastInsertRowid };
    } else {
        // Update existing conversation
        await run(
            `UPDATE whatsapp_conversations
             SET contact_name = COALESCE(?, contact_name), contact_id = COALESCE(?, contact_id),
                 last_message_text = ?, last_message_at = ?,
                 last_customer_message_at = ?, window_expires_at = ?,
                 unread_count = unread_count + 1, is_archived = FALSE
             WHERE id = ?`,
            [contactName, contactId, previewText, now, now, windowExpiry, conversation.id]
        );
    }

    // Insert chat message
    const insertResult = await run(
        `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, media_id, media_mime_type, provider_message_id, status)
         VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, 'delivered')`,
        [tenantId, conversation.id, messageType, body, mediaId, mediaMime, msg.id]
    );

    console.log(`[Chat] ✅ Incoming from ${fromPhone}: "${previewText}" (tenant: ${tenantId}, conv: ${conversation.id}, msg_id: ${insertResult.lastInsertRowid})`);

    // Emit real-time update
    emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });

    // ============================================================
    // PARSE BOT SETTINGS (shared by order auto-reply + AI chatbot)
    // ============================================================
    let botSettings = {};
    if (tenant.bot_settings) {
        try {
            botSettings = typeof tenant.bot_settings === 'string'
                ? JSON.parse(tenant.bot_settings)
                : tenant.bot_settings;
        } catch (parseErr) {
            console.error('[Bot] Failed to parse tenant bot_settings:', parseErr.message);
        }
    }

    // ============================================================
    // ORDER AUTO-PAYMENT REPLY & ADDRESS COLLECTION
    // ============================================================
    if (messageType === 'order') {
        try {
            if (botSettings.razorpay_key_id && botSettings.razorpay_key_secret) {
                // Ask for address instead of sending link directly
                let addressPrompt = botSettings.address_prompt_template || 'Great! Your total is ₹{total}.\n\nPlease reply with your full delivery address to proceed.';
                addressPrompt = addressPrompt.replace('{total}', parsedOrderTotal.toFixed(2));
                const { sendTextMessage } = await import('./services/whatsapp.js');
                const result = await sendTextMessage(fromPhone, addressPrompt, tenant);

                if (result && result.messageId) {
                    const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    await run(
                        `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
                         VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent', NULL)`,
                        [tenantId, conversation.id, addressPrompt, result.messageId]
                    );
                    await run(
                        `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`,
                        [addressPrompt.substring(0, 100), outNow, conversation.id]
                    );
                    emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                }
            } else if (botSettings.auto_payment_link) {
                const paymentLink = botSettings.auto_payment_link;
                const paymentMessage = botSettings.payment_message_template
                    ? botSettings.payment_message_template.replace('{total}', parsedOrderTotal.toFixed(2)).replace('{link}', paymentLink)
                    : `Thank you for your order! Please complete your payment using this link:\n${paymentLink}`;

                const { sendTextMessage } = await import('./services/whatsapp.js');
                const result = await sendTextMessage(fromPhone, paymentMessage, tenant);

                if (result && result.messageId) {
                    const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    await run(
                        `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
                         VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent', NULL)`,
                        [tenantId, conversation.id, paymentMessage, result.messageId]
                    );
                    await run(
                        `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`,
                        [paymentMessage.substring(0, 100), outNow, conversation.id]
                    );
                    emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                }
            }
        } catch (payErr) {
            console.error('[Order] Failed to send auto-payment reply:', payErr.message);
        }
    }

    // ============================================================
    // CHECK FOR AWAITING ADDRESS FOR PENDING ORDER
    // ============================================================
    let addressProcessed = false;
    if (messageType === 'text' && body && botSettings.razorpay_key_id && botSettings.razorpay_key_secret) {
        try {
            // Find if there's a pending order without shipping address
            const pendingOrder = await get(
                `SELECT id, total_amount, currency FROM orders WHERE phone = ? AND shipping_address IS NULL AND payment_status = 'pending' ORDER BY id DESC LIMIT 1`,
                [fromPhone]
            );

            if (pendingOrder) {
                addressProcessed = true;
                const orderId = pendingOrder.id;
                
                // Save address
                await run(`UPDATE orders SET shipping_address = ? WHERE id = ?`, [body, orderId]);
                console.log(`[Order] Saved address for order #${orderId}`);
                
                // Generate Razorpay Link
                const rzp = new Razorpay({
                    key_id: botSettings.razorpay_key_id,
                    key_secret: botSettings.razorpay_key_secret,
                });
                
                const amountInPaise = Math.round(pendingOrder.total_amount * 100);
                
                const paymentLinkRequest = {
                    amount: amountInPaise,
                    currency: pendingOrder.currency || 'INR',
                    accept_partial: false,
                    description: `Order #${orderId} from ${tenant.name}`,
                    customer: {
                        name: contactName,
                        contact: fromPhone
                    },
                    notify: {
                        sms: false,
                        email: false
                    },
                    reminder_enable: true,
                    notes: {
                        order_id: orderId.toString(),
                        tenant_id: tenantId.toString()
                    }
                };
                
                const paymentLink = await rzp.paymentLink.create(paymentLinkRequest);
                
                let replyText = botSettings.payment_link_template || 'Thanks for the address!\n\nPlease complete your payment of {currency} {total} here:\n{link}';
                replyText = replyText.replace('{currency}', pendingOrder.currency || 'INR')
                                     .replace('{total}', pendingOrder.total_amount)
                                     .replace('{link}', paymentLink.short_url);
                
                const { sendTextMessage } = await import('./services/whatsapp.js');
                const result = await sendTextMessage(fromPhone, replyText, tenant);
                
                if (result && result.messageId) {
                    const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    await run(
                        `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
                         VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent', NULL)`,
                        [tenantId, conversation.id, replyText, result.messageId]
                    );
                    await run(
                        `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`,
                        [replyText.substring(0, 100), outNow, conversation.id]
                    );
                    emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                }
            }
        } catch (err) {
            console.error('[Order] Error processing address / Razorpay link:', err);
            // Fallthrough to AI chatbot if it fails
        }
    }

    // ============================================================
    // AI CHATBOT LOGIC
    // ============================================================
    if (messageType === 'text' && body && !addressProcessed) {
        try {

            // Check if chatbot is enabled overall
            let shouldReply = botSettings.enabled !== false; // Default to true if not set
            let awayReplyText = null;

            if (shouldReply) {
                const afterHours = isAfterHours(botSettings);
                if (afterHours) {
                    const action = botSettings.after_hours_action || 'respond_normally';
                    if (action === 'remain_silent') {
                        shouldReply = false;
                        console.log(`[Bot] Closed (After Hours). Action: remain_silent. Skipping reply to ${fromPhone}.`);
                    } else if (action === 'send_away_message') {
                        shouldReply = true;
                        awayReplyText = botSettings.away_message || "Thanks for contacting us! We are currently closed. We will get back to you during business hours.";
                        console.log(`[Bot] Closed (After Hours). Action: send_away_message. Sending out-of-office message to ${fromPhone}.`);
                    } else {
                        console.log(`[Bot] Closed (After Hours). Action: respond_normally. Running normal semantic reply.`);
                    }
                }
            }

            if (shouldReply) {
                let botReply = null;
                if (awayReplyText) {
                    botReply = { type: 'faq', text: awayReplyText };
                } else {
                    const { handleSmartReply } = await import('./services/smartResponder.js');
                    let chatHistory = [];
                    try {
                        const historyRows = await query(
                            `SELECT direction, body FROM whatsapp_chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 4`,
                            [conversation.id]
                        );
                        if (historyRows && historyRows.length > 0) {
                            chatHistory = historyRows.reverse();
                        }
                    } catch (err) {
                        console.error('[Bot] Failed to fetch chat history for memory:', err.message);
                    }
                    botReply = await handleSmartReply(tenantId, body, chatHistory);
                }

                if (botReply) {
                    const { sendTextMessage, sendMediaMessage } = await import('./services/whatsapp.js');
                    
                    let result;
                    let textToSave = '';
                    let typeToSave = 'text';

                    if (botReply.type === 'faq') {
                        // Send FAQ as text
                        result = await sendTextMessage(fromPhone, botReply.text, tenant);
                        textToSave = botReply.text;
                    } else if (botReply.type === 'product') {
                        // Send Product as image (if available) + text
                        const product = botReply.data;
                        const caption = `*${product.name}*\n${product.description ? product.description + '\n' : ''}\nPrice: ₹${product.selling_price || product.mrp}`;
                        
                        if (product.image_url) {
                            result = await sendMediaMessage(fromPhone, 'image', { link: product.image_url }, caption, tenant);
                            textToSave = caption;
                            typeToSave = 'image';
                        } else {
                            result = await sendTextMessage(fromPhone, caption, tenant);
                            textToSave = caption;
                        }
                    }

                    if (result && result.messageId) {
                        // Save outbound message to DB
                        const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(
                            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status, sent_by)
                             VALUES (?, ?, 'outbound', ?, ?, ?, 'sent', NULL)`,
                            [tenantId, conversation.id, typeToSave, textToSave, result.messageId]
                        );

                        // Update conversation last message & mark unread as 0 since bot handled it
                        await run(
                            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`,
                            [textToSave.substring(0, 100), nowStr, conversation.id]
                        );

                        console.log(`[Bot] 🤖 Smart Auto-Responder replied to ${fromPhone} with ${botReply.type}`);

                        // Emit real-time update for bot reply
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                }
            }
        } catch (botErr) {
            console.error('[Bot] Failed to run Smart Responder:', botErr.message);
        }
    }
}

// ============================================================
// DEBUG — Diagnostic endpoint (public, no auth)
// Remove in production when not needed
// ============================================================
app.get('/api/v1/debug/chat-status', async (req, res) => {
    try {
        // 1. Check tenants and their WhatsApp config
        const tenants = await query(
            'SELECT id, name, slug, whatsapp_phone_number_id, whatsapp_configured FROM tenants'
        );

        // 2. Check recent conversations
        const conversations = await query(
            `SELECT id, tenant_id, phone, contact_name, last_message_text, last_message_at, window_expires_at, unread_count 
             FROM whatsapp_conversations ORDER BY last_message_at DESC LIMIT 10`
        );

        // 3. Check recent chat messages (both inbound and outbound)
        const messages = await query(
            `SELECT id, tenant_id, conversation_id, direction, message_type, SUBSTRING(body, 1, 80) as body_preview, status, created_at 
             FROM whatsapp_chat_messages ORDER BY created_at DESC LIMIT 20`
        );

        // 4. Count inbound vs outbound
        const inboundCount = await get('SELECT COUNT(*) as cnt FROM whatsapp_chat_messages WHERE direction = "inbound"');
        const outboundCount = await get('SELECT COUNT(*) as cnt FROM whatsapp_chat_messages WHERE direction = "outbound"');

        res.json({
            info: 'Chat Inbox Diagnostic',
            webhook_url: `${req.protocol}://${req.get('host')}/api/v1/whatsapp-webhook`,
            verify_token: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'CrmSaasWebhookToken123',
            tenants: tenants.map(t => ({
                id: t.id,
                name: t.name,
                slug: t.slug,
                phone_number_id: t.whatsapp_phone_number_id || '❌ NOT SET',
                configured: t.whatsapp_configured ? '✅' : '❌',
            })),
            message_counts: {
                inbound: inboundCount?.cnt || 0,
                outbound: outboundCount?.cnt || 0,
            },
            recent_conversations: conversations,
            recent_messages: messages,
            webhook_event_log: webhookLog,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// PUBLIC ROUTES — No tenant resolution, no auth required
// Future public endpoints: add to routes/public.js
// ============================================================
app.use('/api/v1/leads', leadsRoutes);
app.use('/api/v1/public', publicRoutes);

// ============================================================
// TENANT-SCOPED ROUTES — Tenant resolution required
// ============================================================
app.use('/api/v1', resolveTenant);

// Auth (tenant resolved, auth not required for login)
app.use('/api/v1/auth', authRoutes);

// Protected routes (tenant + auth required)
app.use('/api/v1/contacts', auth, contactsRoutes);
app.use('/api/v1/whatsapp', auth, whatsappRoutes);
app.use('/api/v1/whatsapp/chat', auth, whatsappChatRoutes);
app.use('/api/v1/tenant-settings', auth, tenantSettingsRoutes);
app.use('/api/v1/products', auth, productsRoutes);
app.use('/api/v1/knowledge-base', auth, knowledgeBaseRoutes);
app.use('/api/v1/orders', auth, ordersRoutes);
app.use('/api/v1/analytics', auth, analyticsRoutes);

// Super admin routes (auth + super admin check)
app.use('/api/v1/admin', auth, superAdminOnly, adminRoutes);

// Serve static frontend
const staticDir = join(__dirname, '..', 'public');
if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(join(staticDir, 'index.html'));
        }
    });
}

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

export default app;













