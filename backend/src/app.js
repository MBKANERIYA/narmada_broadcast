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
import { parseJsonObject, verifyRazorpayWebhookSignature } from './utils/security.js';

import Razorpay from 'razorpay';

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
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}));
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

// Serve uploads publicly
app.use('/api/v1/uploads', express.static(join(process.cwd(), 'uploads')));

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
        const signature = req.headers['x-razorpay-signature'];
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
                    const tenant = await get('SELECT * FROM tenants WHERE id = ?', [order.tenant_id]);
                    const botSettings = parseJsonObject(tenant?.bot_settings);
                    const webhookSecret = botSettings.razorpay_webhook_secret;

                    if (!webhookSecret) {
                        console.warn(`[Razorpay Webhook] Webhook secret not configured for order #${orderId}. Rejecting unsigned payment update.`);
                        return res.status(400).json({ error: 'Razorpay webhook secret not configured' });
                    }

                    if (!verifyRazorpayWebhookSignature(req.rawBody, signature, webhookSecret)) {
                        console.warn(`[Razorpay Webhook] Invalid signature for order #${orderId}`);
                        return res.status(401).json({ error: 'Invalid webhook signature' });
                    }

                    // Update order status atomically to prevent race conditions
                    const updateResult = await run("UPDATE orders SET payment_status = 'paid' WHERE id = ? AND payment_status != 'paid'", [orderId]);
                    if (updateResult.changes === 0) {
                        console.log(`[Razorpay Webhook] Order #${orderId} already paid. Skipping duplicate webhook.`);
                        return res.json({ status: 'ok' });
                    }
                    console.log(`[Razorpay Webhook] Order #${orderId} marked as paid.`);

                    // Send WhatsApp confirmation
                    const { sendTextMessage } = await import('./services/whatsapp.js');

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
        } else {
            // Auto-create contact from WhatsApp message
            try {
                const newContact = await run(
                    `INSERT INTO contacts (tenant_id, name, phone, source, whatsapp_consent) VALUES (?, ?, ?, 'whatsapp', TRUE)`,
                    [tenantId, contactName || fromPhone, fromPhone]
                );
                contactId = newContact.lastInsertRowid;
                console.log(`[Webhook] Auto-created contact #${contactId} for ${fromPhone} (${contactName})`);
            } catch (e) {
                console.error('[Webhook] Auto-create contact error:', e.message);
            }
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
    } else if (msg.type === 'interactive') {
        const interactiveType = msg.interactive?.type;
        if (interactiveType === 'button_reply') {
            body = msg.interactive.button_reply.title;
            messageType = 'interactive_button';
        } else if (interactiveType === 'list_reply') {
            body = msg.interactive.list_reply.title;
            messageType = 'interactive_list';
        } else {
            body = '[Interactive]';
            messageType = 'interactive';
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
        conversation = { id: result.lastInsertRowid, bot_paused: false };
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

    if (conversation.bot_paused) {
        if (messageType === 'interactive_button' || messageType === 'interactive_list') {
            console.log(`[Bot] Conversation #${conversation.id} was paused, but user interacted with a menu. Unpausing automatically.`);
            await run(`UPDATE whatsapp_conversations SET bot_paused = 0 WHERE id = ?`, [conversation.id]);
            conversation.bot_paused = false;
            emitToTenant(tenantId, 'chat_updated', { type: 'bot_resumed', conversationId: conversation.id });
        } else {
            console.log(`[Bot] Conversation #${conversation.id} is paused. Skipping automated replies.`);
            return;
        }
    }

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
                `SELECT id, total_amount, currency FROM orders WHERE tenant_id = ? AND phone = ? AND shipping_address IS NULL AND payment_status = 'pending' ORDER BY id DESC LIMIT 1`,
                [tenantId, fromPhone]
            );

            if (pendingOrder) {
                addressProcessed = true;
                const orderId = pendingOrder.id;

                // Save address
                await run(`UPDATE orders SET shipping_address = ? WHERE id = ? AND tenant_id = ?`, [body, orderId, tenantId]);
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

                // Update order with payment link and last_reminder_at
                const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                await run(`UPDATE orders SET payment_link = ?, payment_link_id = ?, last_reminder_at = ? WHERE id = ?`, [paymentLink.short_url, paymentLink.id, outNow, orderId]);

                const { sendInteractiveMessage } = await import('./services/whatsapp.js');
                const interactiveOptions = {
                    type: "button",
                    body: { text: replyText },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: `cancel_order_${orderId}`, title: "Cancel Order" } },
                            { type: "reply", reply: { id: "menu_customer_support", title: "🎧 Customer Support" } }
                        ]
                    }
                };
                const result = await sendInteractiveMessage(fromPhone, interactiveOptions, tenant);

                if (result && result.messageId) {
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
    // AI CHATBOT LOGIC / CUSTOM SHOPPING FLOW
    // ============================================================
    if ((messageType === 'text' || messageType === 'interactive_button' || messageType === 'interactive_list') && body && !addressProcessed) {
        try {
            const { sendInteractiveMessage, sendTextMessage } = await import('./services/whatsapp.js');

            // Handle Cancel Order Button
            if (messageType === 'interactive_button' && msg.interactive?.button_reply?.id?.startsWith('cancel_order_')) {
                const orderId = msg.interactive.button_reply.id.replace('cancel_order_', '');
                
                // Fetch order details to get payment_link_id
                const orderToCancel = await get(`SELECT payment_link_id FROM orders WHERE id = ? AND tenant_id = ?`, [orderId, tenantId]);
                
                if (orderToCancel && orderToCancel.payment_link_id && botSettings.razorpay_key_id && botSettings.razorpay_key_secret) {
                    try {
                        const rzp = new Razorpay({
                            key_id: botSettings.razorpay_key_id,
                            key_secret: botSettings.razorpay_key_secret,
                        });
                        await rzp.paymentLink.cancel(orderToCancel.payment_link_id);
                        console.log(`[Order] Successfully cancelled Razorpay payment link ${orderToCancel.payment_link_id} for order #${orderId}`);
                    } catch (rzpErr) {
                        console.error(`[Order] Failed to cancel Razorpay payment link for order #${orderId}:`, rzpErr.message);
                    }
                }

                await run(`UPDATE orders SET fulfillment_status = 'cancelled', payment_status = 'failed' WHERE id = ? AND tenant_id = ?`, [orderId, tenantId]);
                
                const replyText = `Your order #${orderId} has been successfully cancelled. Please let us know if there is anything else we can help you with!`;
                const interactiveOptions = {
                    type: "button",
                    body: { text: replyText },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "menu_shop_categories", title: "🛍️ Shop Categories" } },
                            { type: "reply", reply: { id: "menu_customer_support", title: "🎧 Customer Support" } }
                        ]
                    }
                };
                const result = await sendInteractiveMessage(fromPhone, interactiveOptions, tenant);
                if (result && result.messageId) {
                    const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                    await run(
                        `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'interactive', ?, ?, 'sent')`,
                        [tenantId, conversation.id, replyText, result.messageId]
                    );
                    await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, [replyText, outNow, conversation.id]);
                    emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                }
                return; // End flow
            }

            const automationEnabled = botSettings.enabled !== false;
            const shouldOfferShoppingOptions = messageType === 'text';

            // Custom shopping flow - handle dynamic category selection.
            let selectedCategory = null;
            if (automationEnabled && messageType === 'interactive_button' && msg.interactive?.button_reply?.id?.startsWith('cat_')) {
                selectedCategory = msg.interactive.button_reply.id.replace('cat_', '');
            } else if (automationEnabled && messageType === 'interactive_list' && msg.interactive?.list_reply?.id?.startsWith('cat_')) {
                selectedCategory = msg.interactive.list_reply.id.replace('cat_', '');
            }

            if (selectedCategory) {
                let categoryName = selectedCategory;
                try {
                    categoryName = decodeURIComponent(selectedCategory);
                } catch (decodeError) {
                    console.warn('[Bot] Failed to decode selected category:', decodeError.message);
                }

                const products = await query(`SELECT * FROM products WHERE tenant_id = ? AND category = ? LIMIT 30`, [tenantId, categoryName]);

                if (products && products.length > 0 && tenant.whatsapp_catalog_id) {
                    const catalogPayload = {
                        type: "product_list",
                        header: { type: "text", text: categoryName.substring(0, 60) },
                        body: { text: "Tap a product below to view details or add to cart." },
                        action: {
                            catalog_id: tenant.whatsapp_catalog_id,
                            sections: [
                                {
                                    title: "Products",
                                    product_items: products.map(p => ({ product_retailer_id: p.sku || String(p.id) }))
                                }
                            ]
                        }
                    };
                    const result = await sendInteractiveMessage(fromPhone, catalogPayload, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(
                            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'interactive', ?, ?, 'sent')`,
                            [tenantId, conversation.id, `Sent ${categoryName} Catalog`, result.messageId]
                        );
                        await run(
                            `UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`,
                            [`Sent ${categoryName} Catalog`, outNow, conversation.id]
                        );
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                } else {
                    await sendTextMessage(fromPhone, `Sorry, no products available in ${categoryName} right now.`, tenant);
                }
                return; // End flow
            } else if (automationEnabled) {
                // If the user clicks Shop Categories
                if (messageType === 'interactive_button' && msg.interactive?.button_reply?.id === 'menu_shop_categories') {
                    const categories = await query(`SELECT DISTINCT category FROM products WHERE tenant_id = ? AND category IS NOT NULL AND category != '' LIMIT 10`, [tenantId]);
                    if (categories && categories.length > 0) {
                        const interactiveOptions = {
                            type: "list",
                            header: { type: "text", text: "Our Categories" },
                            body: { text: "What would you like to explore today?" },
                            footer: { text: "Tap below to view categories" },
                            action: {
                                button: "View Categories",
                                sections: [
                                    {
                                        title: "Available Categories",
                                        rows: categories.map((c) => ({
                                            id: `cat_${encodeURIComponent(c.category)}`.substring(0, 200),
                                            title: c.category.substring(0, 24)
                                        }))
                                    }
                                ]
                            }
                        };
                        const result = await sendInteractiveMessage(fromPhone, interactiveOptions, tenant);
                        if (result && result.messageId) {
                            const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                            await run(
                                `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'interactive', ?, ?, 'sent')`,
                                [tenantId, conversation.id, "[Category List Sent]", result.messageId]
                            );
                            await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, ["[Category List Sent]", outNow, conversation.id]);
                            emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                        }
                    } else {
                        await sendTextMessage(fromPhone, "Sorry, we don't have any categories available right now.", tenant);
                    }
                    return; // End flow
                }

                // If the user clicks Customer Support
                if (messageType === 'interactive_button' && msg.interactive?.button_reply?.id === 'menu_customer_support') {
                    const interactiveOptions = {
                        type: "list",
                        header: { type: "text", text: "Customer Support" },
                        body: { text: "What do you need help with? Please select a topic from the menu below." },
                        footer: { text: "Select an option" },
                        action: {
                            button: "Support Topics",
                            sections: [
                                {
                                    title: "Select a Topic",
                                    rows: [
                                        { id: "support_topic_order", title: "🛍️ Order Status" },
                                        { id: "support_topic_payment", title: "💳 Payment Issues" },
                                        { id: "support_topic_shipping", title: "🚚 Shipping & Delivery" },
                                        { id: "support_topic_returns", title: "🔄 Returns & Refunds" },
                                        { id: "support_topic_product", title: "📦 Product Info" },
                                        { id: "support_topic_other", title: "❓ Other / General" }
                                    ]
                                }
                            ]
                        }
                    };
                    const result = await sendInteractiveMessage(fromPhone, interactiveOptions, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(`INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'interactive', ?, ?, 'sent')`, [tenantId, conversation.id, "[Support Options Sent]", result.messageId]);
                        await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, ["[Support Options Sent]", outNow, conversation.id]);
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                    return; // End flow
                }

                const isButtonTopic = messageType === 'interactive_button' && msg.interactive?.button_reply?.id?.startsWith('support_topic_');
                const isListTopic = messageType === 'interactive_list' && msg.interactive?.list_reply?.id?.startsWith('support_topic_');

                // If the user selects a specific support topic
                if (isButtonTopic || isListTopic) {
                    const topicId = isButtonTopic ? msg.interactive.button_reply.id : msg.interactive.list_reply.id;
                    const topicMap = {
                        'support_topic_order': 'Order Status',
                        'support_topic_payment': 'Payment Issues',
                        'support_topic_shipping': 'Shipping & Delivery',
                        'support_topic_returns': 'Returns & Refunds',
                        'support_topic_product': 'Product Info',
                        'support_topic_other': 'General Inquiry'
                    };
                    const selectedTopic = topicMap[topicId] || 'Support';
                    
                    const interactiveOptions = {
                        type: "button",
                        body: { text: `For help with ${selectedTopic}, how would you like to connect with us?` },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "support_contact_chat", title: "💬 Chat in WhatsApp" } },
                                { type: "reply", reply: { id: "support_contact_call", title: "📞 Request a Call" } }
                            ]
                        }
                    };
                    const result = await sendInteractiveMessage(fromPhone, interactiveOptions, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(`INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'interactive', ?, ?, 'sent')`, [tenantId, conversation.id, "[Support Contact Methods Sent]", result.messageId]);
                        await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, ["[Support Contact Methods Sent]", outNow, conversation.id]);
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                    return; // End flow
                }

                // If the user selects a contact method
                if (messageType === 'interactive_button' && msg.interactive?.button_reply?.id === 'support_contact_chat') {
                    // Pause bot and notify agent
                    await run(`UPDATE whatsapp_conversations SET bot_paused = 1 WHERE id = ?`, [conversation.id]);
                    const replyText = "We have notified our support team. An agent will join this chat to help you shortly.";
                    const result = await sendTextMessage(fromPhone, replyText, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(`INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent')`, [tenantId, conversation.id, replyText, result.messageId]);
                        await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, [replyText, outNow, conversation.id]);
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                    return; // End flow
                }

                if (messageType === 'interactive_button' && msg.interactive?.button_reply?.id === 'support_contact_call') {
                    const supportPhone = tenant.phone || "+919876543210";
                    const formattedPhone = supportPhone.startsWith('+') ? supportPhone : `+${supportPhone}`;
                    const contactInfo = {
                        name: {
                            first_name: "Support",
                            formatted_name: "Customer Support"
                        },
                        phones: [{
                            phone: formattedPhone,
                            type: "WORK",
                            wa_id: formattedPhone.replace(/\D/g, '')
                        }]
                    };
                    
                    const { sendContactMessage } = await import('./services/whatsapp.js');
                    await sendContactMessage(fromPhone, contactInfo, tenant);

                    const replyText = `Our support team has been notified and will call you soon on ${fromPhone}.\n\nYou can also click the contact card above to reach us immediately!`;
                    const result = await sendTextMessage(fromPhone, replyText, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(`INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent')`, [tenantId, conversation.id, replyText, result.messageId]);
                        await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, [replyText, outNow, conversation.id]);
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                    return; // End flow
                }
                if (messageType === 'interactive_button' && msg.interactive?.button_reply?.id?.startsWith('feedback_')) {
                    const feedbackType = msg.interactive.button_reply.id === 'feedback_good' ? 'positive' : 'negative';
                    const replyText = feedbackType === 'positive' 
                        ? "Thank you for the positive feedback! We're glad we could help." 
                        : "Thank you for your feedback. We're sorry to hear about your experience and will use this to improve our support.";
                    
                    const result = await sendTextMessage(fromPhone, replyText, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(`INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'text', ?, ?, 'sent')`, [tenantId, conversation.id, replyText, result.messageId]);
                        await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, [replyText, outNow, conversation.id]);
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                    return; // End flow
                }

                // Default auto-reply for any generic text message
                if (shouldOfferShoppingOptions) {
                    const interactiveOptions = {
                        type: "button",
                        body: { text: "Hi! How can we help you today?" },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "menu_shop_categories", title: "🛍️ Shop Categories" } },
                                { type: "reply", reply: { id: "menu_customer_support", title: "🎧 Customer Support" } }
                            ]
                        }
                    };
                    const result = await sendInteractiveMessage(fromPhone, interactiveOptions, tenant);
                    if (result && result.messageId) {
                        const outNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
                        await run(
                            `INSERT INTO whatsapp_chat_messages (tenant_id, conversation_id, direction, message_type, body, provider_message_id, status) VALUES (?, ?, 'outbound', 'interactive', ?, ?, 'sent')`,
                            [tenantId, conversation.id, "[Welcome Menu Sent]", result.messageId]
                        );
                        await run(`UPDATE whatsapp_conversations SET last_message_text = ?, last_message_at = ?, unread_count = 0 WHERE id = ?`, ["[Welcome Menu Sent]", outNow, conversation.id]);
                        emitToTenant(tenantId, 'chat_updated', { type: 'new_message', conversationId: conversation.id });
                    }
                    return; // End flow
                }
            }

            // Check if chatbot is enabled overall
            let shouldReply = automationEnabled; // Default to true if not set
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













