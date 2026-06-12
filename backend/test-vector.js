import { generateEmbedding } from './src/services/smartResponder.js';

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

async function run() {
    console.log('Generating embedding for FAQ 1...');
    const faqVector = await generateEmbedding('Our store is located at 123 Main Street and we are open from 9 AM to 5 PM.');
    
    console.log('Generating embedding for Question 1...');
    const q1Vector = await generateEmbedding('what time do you close?');
    
    console.log('Generating embedding for Question 2...');
    const q2Vector = await generateEmbedding('how much is this item?');

    const score1 = cosineSimilarity(faqVector, q1Vector);
    const score2 = cosineSimilarity(faqVector, q2Vector);

    console.log(`\nScore for "what time do you close?" -> ${score1.toFixed(3)}`);
    console.log(`Score for "how much is this item?" -> ${score2.toFixed(3)}`);

    if (score1 > score2) {
        console.log('\n✅ Semantic search working correctly! The time question scored higher than the pricing question.');
    }
}

run();
