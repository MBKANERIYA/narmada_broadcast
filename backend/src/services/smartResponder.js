import KnowledgeBase from '../models/KnowledgeBase.js';
import Product from '../models/Product.js';
import FaqPhrasing from '../models/FaqPhrasing.js';
import { MATCH_THRESHOLD, flagEnabled } from '../config/botConfig.js';

let isModelWarmed = false;

export async function getExtractor() {
    if (!process.env.AI_API_KEY) {
        console.warn('[SmartResponder] Warning: AI_API_KEY is missing. Smart replies will fail.');
    }
    return true;
}

export async function initModel() {
    if (!isModelWarmed) {
        console.log('[SmartResponder] Initializing Google Gemini Embeddings API...');
        isModelWarmed = true;
    }
}

export async function generateEmbedding(text, opts = {}) {
    if (!process.env.AI_API_KEY) throw new Error('AI_API_KEY missing');
    
    const prefix = opts.prefix || '';
    const input = prefix ? `${prefix}${text}` : text;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.AI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text: input }] }
        })
    });
    
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Gemini API Error: ${err.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    return data.embedding.values;
}

export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProductSum = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProductSum += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProductSum / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function dotProduct(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    return cosineSimilarity(vecA, vecB);
}

export function normalizeText(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

const TENANT_VECTOR_TTL_MS = 5 * 60 * 1000;
const tenantVectorCache = new Map();

export function invalidateTenantVectorCache(tenantId) {
    if (tenantId === undefined || tenantId === null) {
        tenantVectorCache.clear();
    } else {
        tenantVectorCache.delete(String(tenantId || 'single-tenant'));
    }
}

function parseVector(value) {
    if (!value) return null;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return null;
    }
}

export async function getTenantKnowledge(tenantId, { force = false } = {}) {
    const key = String(tenantId || 'single-tenant');
    const cached = tenantVectorCache.get(key);
    if (!force && cached && (Date.now() - cached.ts) < TENANT_VECTOR_TTL_MS) {
        return cached;
    }

    const faqRows = await KnowledgeBase.find({ is_active: true });
    const phrasingRows = await FaqPhrasing.find({});

    const phrasingsByFaq = new Map();
    for (const p of phrasingRows) {
        const vec = parseVector(p.phrasing_vector);
        if (!vec) continue;
        const fid = p.faq_id.toString();
        if (!phrasingsByFaq.has(fid)) phrasingsByFaq.set(fid, []);
        phrasingsByFaq.get(fid).push({ text: p.phrasing, vec, model: p.embedding_model || null });
    }

    const faqs = faqRows
        .map((f) => ({
            id: f._id.toString(),
            question: f.question,
            answer: f.answer,
            vec: parseVector(f.question_vector),
            model: f.embedding_model || null,
            phrasings: phrasingsByFaq.get(f._id.toString()) || [],
        }))
        .filter((f) => f.vec || (f.phrasings && f.phrasings.length));

    const prodRows = await Product.find({ inventory_available: { $ne: false } });
    const products = prodRows
        .map((p) => ({
            id: p._id.toString(),
            name: p.name,
            description: p.description,
            mrp: p.mrp,
            selling_price: p.selling_price,
            image_url: p.image_url,
            vec: parseVector(p.product_vector),
            model: p.embedding_model || null,
        }))
        .filter((p) => p.vec);

    const entry = { ts: Date.now(), faqs, products };
    tenantVectorCache.set(key, entry);
    return entry;
}

async function applySmartFlowSlots(reply, context, botSettings) {
    if (!reply || !flagEnabled(botSettings, 'smart_flows')) return reply;
    if (reply.type !== 'faq' || !reply.text) return reply;
    try {
        const { renderSlots } = await import('./smartFlows.js');
        return {
            ...reply,
            text: renderSlots(reply.text, {
                tenant: context.tenant,
                botSettings,
                order: context.order,
            }),
        };
    } catch (err) {
        console.warn('[SmartResponder] Slot rendering skipped:', err.message);
        return reply;
    }
}

export async function handleSmartReply(tenantId, messageBody, chatHistory = [], botSettings = {}, context = {}) {
    if (!messageBody || messageBody.trim() === '') return null;

    if (flagEnabled(botSettings, 'smart_flows')) {
        try {
            const { handleSmartFlow } = await import('./smartFlows.js');
            const flowReply = await handleSmartFlow({
                tenantId,
                messageBody,
                botSettings,
                tenant: context.tenant,
                phone: context.phone,
                conversationId: context.conversationId,
                persistState: context.persistState !== false,
            });
            if (flowReply) return flowReply;
        } catch (err) {
            console.error('[SmartResponder] smart_flows failed, falling back to retrieval:', err.message);
        }
    }

    if (flagEnabled(botSettings, 'retrieval_v2')) {
        try {
            const { retrieveAnswer } = await import('./retrievalEngine.js');
            return await applySmartFlowSlots(await retrieveAnswer(tenantId, messageBody, botSettings), context, botSettings);
        } catch (err) {
            console.error('[SmartResponder] retrieval_v2 failed, falling back to legacy:', err.message);
        }
    }

    return applySmartFlowSlots(await handleSmartReplyLegacy(tenantId, messageBody, chatHistory), context, botSettings);
}

async function handleSmartReplyLegacy(tenantId, messageBody, chatHistory = []) {
    try {
        const { faqs, products } = await getTenantKnowledge(tenantId);
        if ((!faqs || faqs.length === 0) && (!products || products.length === 0)) {
            return null;
        }

        let contextString = messageBody;
        if (chatHistory && chatHistory.length > 0) {
            const historyText = chatHistory.map(m => `${m.direction === 'inbound' ? 'User' : 'Bot'}: ${m.body}`).join('\n');
            contextString = `Conversation Context:\n${historyText}\n\nCurrent Message: ${messageBody}`;
        }

        const messageVector = await generateEmbedding(contextString);

        let bestFaqMatch = null;
        let highestFaqScore = -1;

        if (faqs && faqs.length > 0) {
            for (const faq of faqs) {
                if (!faq.vec) continue;
                const score = cosineSimilarity(messageVector, faq.vec);
                if (score > highestFaqScore) {
                    highestFaqScore = score;
                    bestFaqMatch = faq;
                }
            }
        }

        let bestProductMatch = null;
        let highestProductScore = -1;

        if (products && products.length > 0) {
            for (const product of products) {
                if (!product.vec) continue;
                const score = cosineSimilarity(messageVector, product.vec);
                if (score > highestProductScore) {
                    highestProductScore = score;
                    bestProductMatch = product;
                }
            }
        }

        const THRESHOLD = MATCH_THRESHOLD;

        console.log(`[SmartResponder] Message: "${messageBody}"`);
        console.log(`  - Best FAQ: ${bestFaqMatch?.question || 'None'} (Score: ${highestFaqScore.toFixed(2)})`);
        console.log(`  - Best Product: ${bestProductMatch?.name || 'None'} (Score: ${highestProductScore.toFixed(2)})`);

        if (highestProductScore >= THRESHOLD && highestProductScore > highestFaqScore) {
            return { type: 'product', data: bestProductMatch };
        } else if (highestFaqScore >= THRESHOLD) {
            return { type: 'faq', text: bestFaqMatch.answer, faqId: bestFaqMatch.id };
        }

        return null;
    } catch (error) {
        console.error('[SmartResponder] Error processing smart reply:', error);
        return null;
    }
}
