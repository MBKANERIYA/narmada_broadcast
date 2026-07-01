
import Setting from '../models/Setting.js';

/**
 * Syncs a single product to the Meta Commerce Manager Catalog.
 * @param {Object} product - The product document from MongoDB.
 */
export async function syncProductToMeta(product) {
    try {
        const settings = await Setting.findOne({ singletonId: 'admin_settings' });
        if (!settings || !settings.whatsapp_catalog_id || !settings.whatsapp_access_token) {
            console.log('[MetaCatalogSync] Skipping sync: Catalog ID or Access Token not configured.');
            return;
        }

        const catalogId = settings.whatsapp_catalog_id;
        const accessToken = settings.whatsapp_access_token;
        const url = `https://graph.facebook.com/v19.0/${catalogId}/items_batch`;

        // Determine product ID for Meta (use SKU if available, fallback to Mongo ID)
        const contentId = product.sku || product._id.toString();

        // Determine availability
        const availability = (product.inventory_available !== false && (product.inventory_quantity === null || product.inventory_quantity > 0)) ? 'in stock' : 'out of stock';
        
        // Ensure image URL is absolute and valid. Fallback to a placeholder if none.
        let imageUrl = product.image_url || product.images?.[0];
        if (!imageUrl) {
            imageUrl = 'https://dummyimage.com/600x600/cccccc/000000&text=No+Image'; // Meta requires an image
        }

        // Format price (Meta expects string format like "100.00 INR")
        const priceValue = (product.selling_price || product.mrp || 0).toFixed(2);
        const priceString = `${priceValue} INR`;

        const payload = {
            requests: [
                {
                    method: 'UPDATE', // UPDATE acts as an upsert in Meta Catalog Batch API
                    data: {
                        id: contentId,
                        title: product.name || 'Untitled Product',
                        description: product.description || 'No description available.',
                        availability: availability,
                        condition: 'new',
                        price: priceString,
                        image_url: imageUrl,
                        brand: 'Narmada', // Default brand if none exists
                    }
                }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('[MetaCatalogSync] Meta API Error:', data.error.message);
        } else if (data.handles && data.handles.length > 0) {
            console.log(`[MetaCatalogSync] Product ${contentId} queued for sync successfully. Batch ID:`, data.handles[0]);
        } else {
            console.log('[MetaCatalogSync] Unexpected Meta response:', data);
        }
    } catch (error) {
        console.error('[MetaCatalogSync] Failed to sync product:', error.message);
    }
}

/**
 * Removes a product from the Meta Commerce Manager Catalog.
 * @param {Object} product - The product document from MongoDB.
 */
export async function deleteProductFromMeta(product) {
    try {
        const settings = await Setting.findOne({ singletonId: 'admin_settings' });
        if (!settings || !settings.whatsapp_catalog_id || !settings.whatsapp_access_token) {
            return;
        }

        const catalogId = settings.whatsapp_catalog_id;
        const accessToken = settings.whatsapp_access_token;
        const url = `https://graph.facebook.com/v19.0/${catalogId}/items_batch`;

        const contentId = product.sku || product._id.toString();

        const payload = {
            requests: [
                {
                    method: 'DELETE',
                    data: {
                        id: contentId
                    }
                }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('[MetaCatalogSync] Meta API Error on delete:', data.error.message);
        } else {
            console.log(`[MetaCatalogSync] Product ${contentId} queued for deletion successfully.`);
        }
    } catch (error) {
        console.error('[MetaCatalogSync] Failed to delete product from Meta:', error.message);
    }
}
