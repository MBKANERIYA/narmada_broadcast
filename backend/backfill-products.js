import { query, run } from './src/database.js';
import { generateEmbedding } from './src/services/smartResponder.js';

async function backfill() {
    console.log('Starting product vector backfill...');
    try {
        const products = await query('SELECT id, name, description, category, mrp, selling_price FROM products WHERE product_vector IS NULL');
        console.log(`Found ${products.length} products without vectors.`);

        for (const p of products) {
            const searchString = `Product: ${p.name}\nCategory: ${p.category || 'General'}\nDescription: ${p.description || ''}\nPrice: ${p.selling_price || p.mrp || ''}`;
            console.log(`Generating embedding for product ID ${p.id}...`);
            const vector = await generateEmbedding(searchString);
            
            await run('UPDATE products SET product_vector = ? WHERE id = ?', [JSON.stringify(vector), p.id]);
            console.log(`Updated product ID ${p.id}`);
        }

        console.log('Backfill complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error during backfill:', error);
        process.exit(1);
    }
}

backfill();
