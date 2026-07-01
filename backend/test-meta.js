import mongoose from 'mongoose';
import Setting from './src/models/Setting.js';


async function run() {
    await mongoose.connect('mongodb+srv://maulik:maulik@cluster0.bg20tsw.mongodb.net/whatsapp_saas');
    
    const settings = await Setting.findOne({ singletonId: 'admin_settings' });
    if (!settings || !settings.whatsapp_catalog_id || !settings.whatsapp_access_token) {
        console.log('Catalog ID or token missing in DB');
    }
    settings.whatsapp_catalog_id = "2084594175658512";
    await settings.save();
    console.log("Updated catalog ID in database to 2084594175658512");
    process.exit(0);
}
run();
