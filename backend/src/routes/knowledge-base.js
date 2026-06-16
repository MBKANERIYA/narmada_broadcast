import express from 'express';
import { query, run } from '../database.js';
import { generateEmbedding } from '../services/smartResponder.js';

const router = express.Router();

/**
 * GET /api/v1/knowledge-base
 * Fetch all FAQs for the authenticated tenant.
 */
router.get('/', async (req, res) => {
    try {
        const faqs = await query(
            'SELECT id, question, answer, is_active, created_at FROM whatsapp_knowledge_base WHERE tenant_id = ? ORDER BY created_at DESC',
            [req.tenant.id]
        );
        res.json({ faqs });
    } catch (error) {
        console.error('[KnowledgeBase] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch knowledge base' });
    }
});

/**
 * POST /api/v1/knowledge-base
 * Add a new FAQ. Automatically generates the vector embedding.
 */
router.post('/', async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ error: 'Question and answer are required' });
        }

        // Generate the semantic vector for the question
        console.log(`[KnowledgeBase] Generating embedding for: "${question}"`);
        const vectorArray = await generateEmbedding(question);
        const vectorJson = JSON.stringify(vectorArray);

        const result = await run(
            'INSERT INTO whatsapp_knowledge_base (tenant_id, question, answer, question_vector) VALUES (?, ?, ?, ?)',
            [req.tenant.id, question, answer, vectorJson]
        );

        res.status(201).json({ 
            id: result.lastInsertRowid,
            question, 
            answer,
            is_active: 1,
            message: 'FAQ added successfully with semantic embedding'
        });

    } catch (error) {
        console.error('[KnowledgeBase] Create error:', error);
        res.status(500).json({ error: 'Failed to create FAQ' });
    }
});

/**
 * PUT /api/v1/knowledge-base/:id
 * Toggle active status or update text
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active, question, answer } = req.body;

        let queryStr = 'UPDATE whatsapp_knowledge_base SET ';
        const params = [];

        if (is_active !== undefined) {
            queryStr += 'is_active = ?, ';
            params.push(is_active ? 1 : 0);
        }

        if (question !== undefined && question.trim() !== '') {
            queryStr += 'question = ?, ';
            params.push(question);
            
            console.log(`[KnowledgeBase] Updating embedding for: "${question}"`);
            const vectorArray = await generateEmbedding(question);
            const vectorJson = JSON.stringify(vectorArray);
            
            queryStr += 'question_vector = ?, ';
            params.push(vectorJson);
        }

        if (answer !== undefined && answer.trim() !== '') {
            queryStr += 'answer = ?, ';
            params.push(answer);
        }

        if (params.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Remove trailing comma and space
        queryStr = queryStr.slice(0, -2);
        
        queryStr += ' WHERE id = ? AND tenant_id = ?';
        params.push(id, req.tenant.id);

        await run(queryStr, params);

        res.json({ success: true });
    } catch (error) {
        console.error('[KnowledgeBase] Update error:', error);
        res.status(500).json({ error: 'Failed to update FAQ' });
    }
});

/**
 * DELETE /api/v1/knowledge-base/:id
 * Remove an FAQ
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await run(
            'DELETE FROM whatsapp_knowledge_base WHERE id = ? AND tenant_id = ?',
            [id, req.tenant.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('[KnowledgeBase] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete FAQ' });
    }
});

/**
 * POST /api/v1/knowledge-base/test
 * Test bot: simulate a customer message and see what the AI would match
 */
router.post('/test', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get all active FAQs with vectors
        const faqs = await query(
            'SELECT id, question, answer, question_vector FROM whatsapp_knowledge_base WHERE tenant_id = ? AND is_active = 1',
            [req.tenant.id]
        );

        if (!faqs.length) {
            return res.json({ matches: [], message: 'No FAQs in knowledge base' });
        }

        // Generate embedding for the test message
        const messageVector = await generateEmbedding(message);

        // Compute similarity for each FAQ
        const scored = [];
        for (const faq of faqs) {
            if (!faq.question_vector) continue;
            let faqVector;
            try {
                faqVector = typeof faq.question_vector === 'string' ? JSON.parse(faq.question_vector) : faq.question_vector;
            } catch { continue; }

            const score = cosineSimilarity(messageVector, faqVector);
            scored.push({ id: faq.id, question: faq.question, answer: faq.answer, score: Math.round(score * 1000) / 1000 });
        }

        // Sort by score descending and return top 3
        scored.sort((a, b) => b.score - a.score);
        const THRESHOLD = 0.45;
        const topMatches = scored.slice(0, 3);
        const wouldReply = topMatches.length > 0 && topMatches[0].score >= THRESHOLD;

        res.json({
            test_message: message,
            would_reply: wouldReply,
            threshold: THRESHOLD,
            best_score: topMatches[0]?.score || 0,
            matched_answer: wouldReply ? topMatches[0].answer : null,
            matches: topMatches,
        });
    } catch (error) {
        console.error('[KnowledgeBase] Test error:', error);
        res.status(500).json({ error: 'Failed to test bot' });
    }
});

// Import cosineSimilarity locally for the test endpoint
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag === 0 ? 0 : dot / mag;
}

export default router;
