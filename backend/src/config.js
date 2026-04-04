// Config for CRM Mahalaxmi API
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
// Try .env.production first in production, then .env as fallback
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
const envPath = path.join(__dirname, '..', envFile);

dotenv.config({ path: envPath });

// Fallback: also try .env (Hostinger stores env vars here)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Fallback: try current working directory
if (!process.env.DB_USER) {
    dotenv.config({ path: path.join(process.cwd(), envFile) });
    dotenv.config({ path: path.join(process.cwd(), '.env') });
}

export default {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // MySQL Database
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'crm_mahalaxmi',
    },

    // JWT
    jwtSecret: (() => {
        const secret = process.env.JWT_SECRET;
        if (process.env.NODE_ENV === 'production' && (!secret || secret === 'change-me-in-production')) {
            throw new Error('FATAL: JWT_SECRET must be set to a strong value in production');
        }
        return secret || 'dev-only-secret-not-for-production';
    })(),
    jwtExpiration: parseInt(process.env.JWT_EXPIRATION) || 86400,

    // CORS
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
};
