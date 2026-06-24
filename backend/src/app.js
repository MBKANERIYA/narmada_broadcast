import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { auth } from './middleware/auth.js';
import { initDatabase } from './database.js';

// Initialize DB for serverless environment
initDatabase().catch(console.error);

// Routes
import authRoutes from './routes/auth.js';
import contactsRoutes from './routes/contacts.js';
import tenantSettingsRoutes from './routes/tenant-settings.js';
import adminRoutes from './routes/admin.js';
import productsRoutes from './routes/products.js';
import knowledgeBaseRoutes from './routes/knowledge-base.js';
import ordersRoutes from './routes/orders.js';
import analyticsRoutes from './routes/analytics.js';
// WhatsApp routes (migrated to MongoDB)
import whatsappRoutes from './routes/whatsapp.js';
import webhookRoutes from './routes/webhook.js';
// import whatsappChatRoutes from './routes/whatsapp-chat.js'; // TODO: migrate to MongoDB

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

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

app.get('/health', (req, res) => res.json({ status: 'healthy' }));
app.get('/', (req, res) => res.json({ message: 'WhatsApp Marketing Platform API (MongoDB)' }));
app.use('/api/v1/uploads', express.static(join(process.cwd(), 'uploads')));

// Public Webhook (No Auth)
app.use('/api/v1/whatsapp-webhook', webhookRoutes);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/contacts', contactsRoutes);
app.use('/api/v1/tenant-settings', tenantSettingsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/knowledge-base', knowledgeBaseRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// WhatsApp broadcast routes (migrated to MongoDB)
app.use('/api/v1/whatsapp', whatsappRoutes);
// WhatsApp chat routes — still needs MongoDB migration
app.use('/api/v1/whatsapp/chat', (req, res) => res.json({}));

export default app;
