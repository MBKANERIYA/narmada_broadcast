import { Router } from 'express';
import Setting from '../models/Setting.js';
import { auth } from '../middleware/auth.js';
const router = Router();
router.use(auth);

function maskString(str) {
    if (!str || str.length < 8) return '********';
    return str.substring(0, 4) + '*'.repeat(str.length - 8) + str.substring(str.length - 4);
}


async function getSettings() {
    let setting = await Setting.findOne({ singletonId: 'admin_settings' });
    if (!setting) {
        setting = new Setting();
        await setting.save();
    }
    return setting;
}

/**
 * GET /api/v1/tenant-settings
 * Returns the single user settings
 */
router.get('/', async (req, res) => {
    try {
        const setting = await getSettings();
        
        // Return masked settings to frontend
        const safeSettings = setting.toObject();
        safeSettings.id = safeSettings._id;
        
        if (safeSettings.whatsapp_access_token) {
            safeSettings.whatsapp_access_token = maskString(safeSettings.whatsapp_access_token);
        }
        
        res.json(safeSettings);
    } catch (error) {
        console.error('Settings GET error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/tenant-settings/profile
 */
router.put('/profile', async (req, res) => {
    try {
        const { name, email, phone, logo_url, primary_color } = req.body;
        const setting = await getSettings();
        
        Object.assign(setting, { name, email, phone, logo_url, primary_color });
        await setting.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/tenant-settings/whatsapp
 */
router.put('/whatsapp', async (req, res) => {
    try {
        const { whatsapp_access_token, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_catalog_id } = req.body;
        const setting = await getSettings();
        
        // Only update token if it's not the masked string
        if (whatsapp_access_token && !whatsapp_access_token.includes('***')) {
            setting.whatsapp_access_token = whatsapp_access_token;
        }
        
        if (whatsapp_phone_number_id) setting.whatsapp_phone_number_id = whatsapp_phone_number_id;
        if (whatsapp_business_account_id) setting.whatsapp_business_account_id = whatsapp_business_account_id;
        if (whatsapp_catalog_id !== undefined) setting.whatsapp_catalog_id = whatsapp_catalog_id;
        
        if (setting.whatsapp_access_token && setting.whatsapp_phone_number_id) {
            setting.whatsapp_configured = true;
        }
        
        await setting.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Settings WhatsApp PUT error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/v1/tenant-settings/whatsapp
 */
router.delete('/whatsapp', async (req, res) => {
    try {
        const setting = await getSettings();
        setting.whatsapp_access_token = null;
        setting.whatsapp_phone_number_id = null;
        setting.whatsapp_business_account_id = null;
        setting.whatsapp_catalog_id = null;
        setting.whatsapp_configured = false;
        await setting.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/v1/tenant-settings/chatbot
 */
router.put('/chatbot', async (req, res) => {
    try {
        const { bot_settings } = req.body;
        const setting = await getSettings();
        
        setting.bot_settings = bot_settings;
        await setting.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
