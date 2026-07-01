import mongoose from 'mongoose';
import Setting from './src/models/Setting.js';
import { syncProductToMeta } from './src/services/metaCatalogSync.js';

async function run() {
    await mongoose.connect('mongodb+srv://maulik:maulik@cluster0.bg20tsw.mongodb.net/whatsapp_saas');
    
    // Simulate a product object
    const dummyProduct = {
        _id: new mongoose.Types.ObjectId(),
        sku: 'TEST_META_PUSH_001',
        name: 'Test Meta Push API',
        description: 'Testing the Meta Commerce API integration',
        inventory_available: true,
        inventory_quantity: 10,
        image_url: 'https://dummyimage.com/600x600/000/fff&text=Test',
        selling_price: 99.99
    };
    
    console.log('Pushing to Meta Catalog...');
    await syncProductToMeta(dummyProduct);
    console.log('Done!');
    process.exit(0);
}

run();
