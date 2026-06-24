import { Router } from 'express';
import KnowledgeBase from '../models/KnowledgeBase.js';
import { generateEmbedding } from '../services/smartResponder.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const faqs = await KnowledgeBase.find().sort({ created_at: -1 });
        res.json(faqs.map(f => {
            const doc = f.toObject();
            doc.id = doc._id;
            return doc;
        }));
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { question, answer } = req.body;
        if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });

        const vector = await generateEmbedding(question);
        
        const faq = new KnowledgeBase({ question, answer, question_vector: vector, is_active: true });
        await faq.save();
        res.status(201).json({ id: faq._id });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { question, answer, is_active } = req.body;
        if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });

        const vector = await generateEmbedding(question);
        
        const faq = await KnowledgeBase.findByIdAndUpdate(req.params.id, {
            question, answer, question_vector: vector, is_active: is_active ?? true
        });
        
        if (!faq) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const faq = await KnowledgeBase.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ error: 'Not found' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.patch('/:id/toggle', async (req, res) => {
    try {
        const { is_active } = req.body;
        const faq = await KnowledgeBase.findByIdAndUpdate(req.params.id, { is_active });
        if (!faq) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/import', async (req, res) => {
    try {
        const { faqs } = req.body;
        if (!Array.isArray(faqs)) return res.status(400).json({ error: 'Array required' });

        let imported = 0;
        let skipped = 0;

        for (const f of faqs) {
            if (!f.question || !f.answer) {
                skipped++;
                continue;
            }
            try {
                const vector = await generateEmbedding(f.question);
                const faq = new KnowledgeBase({ question: f.question, answer: f.answer, question_vector: vector });
                await faq.save();
                imported++;
            } catch (err) {
                skipped++;
            }
        }
        res.json({ imported, skipped });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
