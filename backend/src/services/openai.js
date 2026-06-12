import OpenAI from 'openai';
import { get, query } from '../database.js';

export async function generateChatbotReply(tenantId, conversationId, userMessage) {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
        console.warn('AI_API_KEY is not set. Chatbot cannot reply.');
        return null;
    }

    try {
        // Fetch the last 10 text messages for context
        const messages = await query(
            `SELECT direction, body FROM whatsapp_chat_messages 
             WHERE conversation_id = ? AND message_type = 'text' AND body IS NOT NULL
             ORDER BY created_at DESC LIMIT 10`,
            [conversationId]
        );
        messages.reverse(); // Order from oldest to newest

        const history = messages.map(m => ({
            role: m.direction === 'inbound' ? 'user' : 'assistant',
            content: m.body
        }));

        // Get basic tenant info for the prompt
        const tenant = await get('SELECT name, phone FROM tenants WHERE id = ?', [tenantId]);
        const businessName = tenant?.name || 'our business';

        // Add System Prompt
        const systemPrompt = {
            role: 'system',
            content: `You are a helpful, professional, and friendly customer support assistant for ${businessName}. 
Your goal is to answer customer questions politely. 
Keep your answers very concise and formatted well for WhatsApp (using *bold* for emphasis). 
If you don't know the answer, politely tell them a human agent will assist them shortly.`
        };

        history.unshift(systemPrompt);

        // We use the OpenAI SDK, but point it to Google Gemini's 100% FREE API endpoint
        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
        });

        const response = await openai.chat.completions.create({
            model: 'gemini-1.5-flash',
            messages: history,
            max_tokens: 200,
            temperature: 0.7
        });

        return response.choices[0]?.message?.content || null;
    } catch (error) {
        console.error('AI API Error:', error.message);
        return null;
    }
}
