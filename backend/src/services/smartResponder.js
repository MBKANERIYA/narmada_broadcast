import { pipeline } from '@xenova/transformers';
import { query, run } from '../database.js';

let extractor = null;

/**
 * Initialize the embedding model.
 * This runs locally on the CPU and downloads a tiny (~90MB) model on first run.
 */
async function getExtractor() {
    if (!extractor) {
        console.log('[SmartResponder] Loading all-MiniLM-L6-v2 model...');
        // Use the feature extraction pipeline
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('[SmartResponder] Model loaded successfully.');
    }
    return extractor;
}

/**
 * Generate a vector embedding for a given text.
 */
export async function generateEmbedding(text) {
    const extract = await getExtractor();
    const output = await extract(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Evaluates an incoming message against the tenant's knowledge base.
 * @returns {string|null} The answer to send, or null if no match.
 */
export async function handleSmartReply(tenantId, messageBody) {
    if (!messageBody || messageBody.trim() === '') return null;

    try {
        // 1. Fetch Tenant's Knowledge Base
        const faqs = await query(
            'SELECT id, question, answer, question_vector FROM whatsapp_knowledge_base WHERE tenant_id = ? AND is_active = TRUE',
            [tenantId]
        );

        // 2. Fetch Tenant's Products
        const products = await query(
            'SELECT id, name, description, mrp, selling_price, image_url, product_vector FROM products WHERE tenant_id = ?',
            [tenantId]
        );

        if ((!faqs || faqs.length === 0) && (!products || products.length === 0)) {
            return null; // No knowledge base or products configured
        }

        // 2. Generate embedding for the incoming message
        const messageVector = await generateEmbedding(messageBody);

        let bestFaqMatch = null;
        let highestFaqScore = -1;

        // 3. Find the semantically closest FAQ
        if (faqs && faqs.length > 0) {
            for (const faq of faqs) {
                if (!faq.question_vector) continue;
                
                let faqVector;
                try {
                    faqVector = typeof faq.question_vector === 'string' ? JSON.parse(faq.question_vector) : faq.question_vector;
                } catch (e) { continue; }

                const score = cosineSimilarity(messageVector, faqVector);
                if (score > highestFaqScore) {
                    highestFaqScore = score;
                    bestFaqMatch = faq;
                }
            }
        }

        let bestProductMatch = null;
        let highestProductScore = -1;

        // 4. Find the semantically closest Product
        if (products && products.length > 0) {
            for (const product of products) {
                if (!product.product_vector) continue;
                
                let prodVector;
                try {
                    prodVector = typeof product.product_vector === 'string' ? JSON.parse(product.product_vector) : product.product_vector;
                } catch (e) { continue; }

                const score = cosineSimilarity(messageVector, prodVector);
                if (score > highestProductScore) {
                    highestProductScore = score;
                    bestProductMatch = product;
                }
            }
        }

        // 5. Determine the winner (Threshold Check 0.45)
        const THRESHOLD = 0.45;
        
        console.log(`[SmartResponder] Message: "${messageBody}"`);
        console.log(`  - Best FAQ: ${bestFaqMatch?.question || 'None'} (Score: ${highestFaqScore.toFixed(2)})`);
        console.log(`  - Best Product: ${bestProductMatch?.name || 'None'} (Score: ${highestProductScore.toFixed(2)})`);

        if (highestProductScore >= THRESHOLD && highestProductScore > highestFaqScore) {
            return { type: 'product', data: bestProductMatch };
        } else if (highestFaqScore >= THRESHOLD) {
            return { type: 'faq', text: bestFaqMatch.answer };
        }

        return null;

    } catch (error) {
        console.error('[SmartResponder] Error processing smart reply:', error);
        return null;
    }
}
