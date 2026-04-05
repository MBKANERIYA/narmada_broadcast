import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { auth } from './middleware/auth.js';
import { resolveTenant } from './middleware/tenant.js';

// Routes
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import clientsRoutes from './routes/clients.js';
import followupsRoutes from './routes/followups.js';
import visitsRoutes from './routes/visits.js';
import dashboardRoutes from './routes/dashboard.js';
import inventoryRoutes from './routes/inventory.js';
import remindersRoutes from './routes/reminders.js';
import projectsRoutes from './routes/projects.js';
import whatsappRoutes from './routes/whatsapp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// CORS - Whitelist allowed origins from config
app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-slug'],
}));

// Health check (no tenant needed)
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

app.get('/', (req, res) => {
    res.json({ message: 'Real Estate CRM SaaS API' });
});

import { run } from './database.js';

// ============================================================
// WhatsApp Webhook — Public endpoint (no tenant/auth needed)
// Meta sends delivery statuses here for ALL tenants
// ============================================================
app.get('/api/v1/whatsapp-webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "CrmSaasWebhookToken123";
    
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("✅ Webhook Verified by Meta");
            res.status(200).send(challenge);
        } else {
            console.warn("⚠️ Webhook Verification Failed (Token Mismatch)");
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

app.post('/api/v1/whatsapp-webhook', async (req, res) => {
    try {
        const body = req.body;
        
        if (body.object === "whatsapp_business_account") {
            for (const entry of (body.entry || [])) {
                for (const change of (entry.changes || [])) {
                    const value = change.value;
                    
                    if (value?.statuses) {
                        for (const status of value.statuses) {
                            const messageId = status.id;
                            const currentStatus = status.status;
                            const timestamp = new Date(parseInt(status.timestamp) * 1000).toISOString().slice(0, 19).replace('T', ' ');

                            let errorDetail = null;
                            if (status.errors) {
                                errorDetail = status.errors.map(err => `${err.title}: ${err.error_data?.details || err.message}`).join(' | ');
                            }

                            // Update database record (no tenant filter needed — provider_message_id is globally unique)
                            try {
                                let updateQuery = '';
                                let params = [];

                                if (currentStatus === 'delivered') {
                                    updateQuery = 'UPDATE whatsapp_messages SET status = ?, delivered_at = ? WHERE provider_message_id = ?';
                                    params = ['delivered', timestamp, messageId];
                                } else if (currentStatus === 'read') {
                                    updateQuery = 'UPDATE whatsapp_messages SET status = ?, read_at = ? WHERE provider_message_id = ?';
                                    params = ['read', timestamp, messageId];
                                } else if (currentStatus === 'failed') {
                                    updateQuery = 'UPDATE whatsapp_messages SET status = ?, error_message = ? WHERE provider_message_id = ?';
                                    params = ['failed', errorDetail || 'Unknown delivery failure', messageId];
                                } else {
                                    updateQuery = 'UPDATE whatsapp_messages SET status = ? WHERE provider_message_id = ?';
                                    params = [currentStatus, messageId];
                                }

                                await run(updateQuery, params);
                            } catch (dbErr) {
                                console.error('Database update error in webhook:', dbErr.message);
                            }
                        }
                    } 
                    
                    if (value?.messages) {
                        value.messages.forEach(msg => {
                            console.log(`[WhatsApp] Incoming from ${msg.from}: "${msg.text?.body || msg.type}"`);
                        });
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

// ============================================================
// TENANT-SCOPED API ROUTES
// All routes below require tenant resolution
// ============================================================
app.use('/api/v1', resolveTenant);

// Auth routes (tenant resolved, but auth not required for login)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', auth, authRoutes);

// Protected routes (tenant + auth required)
app.use('/api/v1/dashboard', auth, dashboardRoutes);
app.use('/api/v1/leads', auth, leadsRoutes);
app.use('/api/v1/followups', auth, followupsRoutes);
app.use('/api/v1/clients', auth, clientsRoutes);
app.use('/api/v1/visits', auth, visitsRoutes);
app.use('/api/v1/inventory', auth, inventoryRoutes);
app.use('/api/v1/reminders', auth, remindersRoutes);
app.use('/api/v1/projects', auth, projectsRoutes);
app.use('/api/v1/whatsapp', auth, whatsappRoutes);
app.use('/api/v1/sources', auth, dashboardRoutes);

// Serve static frontend files (if built & local)
const staticDir = join(__dirname, '..', 'public');
if (existsSync(staticDir)) {
    app.use(express.static(staticDir));

    // SPA fallback
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
