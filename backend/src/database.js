import mongoose from 'mongoose';
import config from './config.js';

let initialized = false;

const initDatabase = async () => {
    if (initialized) return;
    try {
        const uri = process.env.MONGO_URI || config.db?.uri || 'mongodb+srv://maulik:maulik@cluster0.bg20tsw.mongodb.net/whatsapp_saas';
        await mongoose.connect(uri);
        console.log('MongoDB connected successfully');
        initialized = true;
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }
};

export const query = async () => [];
export const get = async () => null;
export const run = async () => ({ changes: 0, lastInsertRowid: 0 });
export const getTenantById = async () => null;
export const getTenantBySlug = async () => null;

export { initDatabase };
export default { initDatabase, query, get, run, getTenantById, getTenantBySlug };
