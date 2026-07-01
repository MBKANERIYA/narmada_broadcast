# Chatbot And Smart Knowledge Base

## What This Subsystem Does

The chatbot subsystem answers customer WhatsApp messages from the client's own
FAQ and product data. It powers the Knowledge Base test console, the Settings
AI Assistant panel, and webhook auto-replies. Gemini embeddings are optional:
when `AI_API_KEY` is missing or embeddings are not yet generated, the backend
uses deterministic lexical matching so the product remains usable.

## Structure

| File | Responsibility |
|------|----------------|
| `backend/src/services/smartResponder.js` | Main FAQ/product reply matcher, vector cache, lexical fallback |
| `backend/src/services/botLearning.js` | Analytics, unanswered logging, suggestions, teach-from-chat helpers |
| `backend/src/services/retrievalEngine.js` | Optional retrieval v2 path when enabled by bot flags |
| `backend/src/services/smartFlows.js` | Order/product flow helpers and handoff replies |
| `backend/src/routes/knowledge-base.js` | FAQ CRUD, import, test console, alternate phrasings |
| `backend/src/routes/tenant-settings.js` | Chatbot settings, AI Assistant analytics/test/re-embed endpoints |
| `backend/src/routes/webhook.js` | Incoming WhatsApp message processing and auto-reply dispatch |
| `backend/src/models/KnowledgeBase.js` | FAQ records and optional question vectors |
| `backend/src/models/FaqPhrasing.js` | Alternate phrasings for FAQ matching |
| `backend/src/models/BotUnanswered.js` | Missed customer messages |
| `backend/src/models/BotSuggestion.js` | Suggested FAQ gaps |
| `backend/src/models/BotInteraction.js` | Bot answer/handoff/disambiguation interaction log |

## Conventions And Rules

- `AI_API_KEY` is optional for normal FAQ/product CRUD.
- `AI_API_KEY` is required only for `/tenant-settings/embeddings/reembed`.
- FAQ and product saves must not fail just because embeddings are unavailable.
- Keep `invalidateTenantVectorCache()` calls when FAQ, phrasing, product, or bot-setting changes affect retrieval.
- The Knowledge Base list API returns `{ faqs: [...] }` because the frontend consumes `data.faqs`.
- The test console route is `POST /api/v1/knowledge-base/test`.
- Settings AI Assistant routes live under `/api/v1/tenant-settings/ai-assistant/*`.
- Text fallback threshold is aligned with the UI expectation of `0.45`.

## Known Gotchas

- Older docs claimed a local MiniLM model; the current runtime uses Gemini embeddings when configured plus lexical fallback.
- Frontend Settings calls several AI Assistant routes in parallel. Missing one route causes noisy 404s even if core settings save works.
- Vercel functions are stateless; do not rely on long-running background model warmup.
- If FAQs were created before `AI_API_KEY` existed, they may have empty vectors; re-embed after adding the key.

## How It Is Tested

`backend/test/regression.test.js` covers:

- AI Assistant route contracts used by Settings.
- Knowledge Base list/test/phrasings contracts used by the frontend.
- `scoreTextMatch()` behavior for text-only FAQ/product matching.
- Deployment docs requiring env-only Mongo and no hardcoded secrets.

Run:

```bash
cd backend
npm test
```

## Related KB Files

- `ARCHITECTURE.md` for the full system shape.
- `DEPLOYMENT.md` for `AI_API_KEY` and `MONGO_URI` setup.
- `testing.md` for verification commands.
- `security.md` for secret masking and webhook concerns.
