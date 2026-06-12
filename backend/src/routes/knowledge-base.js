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
        const { is_active } = req.body;

        await run(
            'UPDATE whatsapp_knowledge_base SET is_active = ? WHERE id = ? AND tenant_id = ?',
            [is_active === true || is_active === 1 ? 1 : 0, id, req.tenant.id]
        );

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

export default router;
