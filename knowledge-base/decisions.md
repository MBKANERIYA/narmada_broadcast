# Architectural Decisions

This document logs the architectural choices made during the development of the WhatsApp Broadcast SaaS.

## Decision: Single-Client Vercel Product Uses Env-Only MongoDB
**Date**: 2026-07-01
**Status**: Accepted
**Context**: The Narmada fork is sold and deployed as a dedicated product for one client, not as a tenant seat on the original SaaS. The Vercel deployment must not depend on the original app database or any hardcoded fallback credentials.
**Decision**: Keep the fork single-client, deploy it on Vercel from `MBKANERIYA/narmada_broadcast`, require `MONGO_URI` from Vercel environment variables in production, and fail fast if it is missing.
**Alternatives Considered**: Reuse the original SaaS database or leave a fallback Atlas URI in code. Both were rejected because they break client isolation and expose secrets.
**Consequences**: Each client deployment must provision its own MongoDB Atlas database and set `MONGO_URI`; local development can still use `mongodb://127.0.0.1:27017/narmada_broadcast_dev`.
**Superseded By**:

## Decision: Smart Bot Uses Gemini Embeddings With Lexical Fallback
**Date**: 2026-07-01
**Status**: Superseded
**Context**: The deployed fork's chatbot and Knowledge Base were failing when `AI_API_KEY` was missing or when frontend AI Assistant routes did not exist. The product should remain usable before embeddings are configured.
**Decision**: Store FAQs/products even when embeddings cannot be generated, use Gemini embeddings when `AI_API_KEY` exists, and use deterministic lexical matching as the fallback responder path.
**Alternatives Considered**: Require `AI_API_KEY` before any FAQ/product can be saved, or return no bot matches until re-embed completes. Both were rejected because they make the client deployment feel broken during setup.
**Consequences**: Basic bot matching works immediately; semantic quality improves after adding `AI_API_KEY` and running re-embed.
**Superseded By**: [Single-Client Vercel Product Uses Local Smart Automation](#decision-single-client-vercel-product-uses-local-smart-automation)

## Decision: Single-Client Vercel Product Uses Local Smart Automation
**Date**: 2026-07-02
**Status**: Accepted
**Context**: The Narmada fork should be an independent single-client version of the main WhatsApp Broadcast platform, not a separate cloud-AI chatbot product. Requiring a provider key for Smart Automation created confusion and diverged from the main product.
**Decision**: Use local embedding models through `@huggingface/transformers` plus deterministic lexical fallback. Keep Vercel/MongoDB isolation for this client's deployment, but do not require Gemini, OpenAI, or any external provider key for FAQ/product matching or re-embedding.
**Alternatives Considered**: Keep the Gemini embedding endpoint as optional, or remove embeddings entirely and use only lexical matching. Optional Gemini was rejected because it changes the product/deployment contract; lexical-only was rejected because the main platform already uses local semantic matching.
**Consequences**: Vercel env setup only needs product infrastructure secrets like `MONGO_URI` and `JWT_SECRET`; local model cold starts may be slower on Vercel, so lexical fallback remains required.
**Superseded By**:

## Decision: Preact + Vite Frontend Framework
**Date**: 2026-04-10
**Status**: Accepted
**Context**: We need a fast, lightweight, and modern Single Page Application (SPA) frontend.
**Decision**: Use Preact (Vite template) with Zustand for state management.
**Alternatives Considered**: React (heavier bundle size), Vue (different programming model, JSX is preferred for matching React-like components).
**Consequences**: Smaller bundle sizes, fast builds. Requires `import from 'preact/hooks'` instead of `'react'`.

## Decision: MySQL 8.0 Prepared Statements and LIMIT/OFFSET Handling
**Date**: 2026-04-11
**Status**: Superseded
**Context**: MySQL `pool.execute()` prepared statements do not allow placeholders for LIMIT and OFFSET variables.
**Decision**: Parse and sanitize LIMIT and OFFSET as integers (`parseInt`) and inline them into SQL query strings rather than using `?` placeholders.
**Alternatives Considered**: Use `pool.query()` which does client-side interpolation, but `pool.execute()` is preferred for query caching and performance.
**Consequences**: Extra care is needed to ensure inlined values are strictly parsed as integers to prevent SQL injection.
**Superseded By**: [Single-Client Vercel Product Uses Env-Only MongoDB](#decision-single-client-vercel-product-uses-env-only-mongodb)

## Decision: Single-Domain Multi-Tenancy with Soft Resolution
**Date**: 2026-04-11
**Status**: Superseded
**Context**: The application runs on a single domain (`broadcast.innodify.in`) rather than separate subdomains for each tenant.
**Decision**: Resolve tenants softly using a custom header `x-tenant-slug` sent by the frontend, fallback to the `tenantId` stored inside the JWT auth token.
**Alternatives Considered**: Wildcard subdomains (too complex for initial DNS/SSL config).
**Consequences**: The frontend must send `x-tenant-slug` with every API request. Login must query by email globally across all tenants.
**Superseded By**: [Single-Client Vercel Product Uses Env-Only MongoDB](#decision-single-client-vercel-product-uses-env-only-mongodb)

## Decision: Free AI Chatbot Integration using Google Gemini API via OpenAI SDK
**Date**: 2026-06-12
**Status**: Superseded
**Context**: We need a smart auto-responder bot without requiring a paid OpenAI account.
**Decision**: Integrate Google's `gemini-1.5-flash` model utilizing the OpenAI compatibility layer by setting the base URL to `generativelanguage.googleapis.com/v1beta/openai/`.
**Alternatives Considered**: Paid OpenAI API, locally-hosted LLM (too resource-heavy for the VPS).
**Consequences**: High-quality, low-latency, and free chatbot responses. Outgoing message formats must align with Gemini constraints.
**Superseded By**: [Pure Local NLP Model Chatbot](#decision-pure-local-nlp-model-chatbot-superseding-gemini-api-integration)

## Decision: Pure Local NLP Model Chatbot (Superseding Gemini API Integration)
**Date**: 2026-06-12
**Status**: Superseded
**Context**: The project pivoted away from third-party remote AI APIs (Google Gemini API via OpenAI SDK) to guarantee offline reliability, eliminate external API key configuration requirements, and ensure responses are strictly aligned with the merchant's FAQ/product dataset.
**Decision**: Use a local feature-extraction pipeline with the `all-MiniLM-L6-v2` model running directly on the CPU. Match incoming messages to existing FAQs and products using cosine similarity.
**Alternatives Considered**: Google Gemini API (requires external API keys, internet connectivity, and can generate off-topic conversational text).
**Consequences**: The system was completely self-contained with zero external API key requirements. Responses were strictly bounded by active FAQs and products.
**Superseded By**: [Smart Bot Uses Gemini Embeddings With Lexical Fallback](#decision-smart-bot-uses-gemini-embeddings-with-lexical-fallback)

## Decision: Use Node Built-In Regression Tests
**Date**: 2026-06-16
**Status**: Accepted
**Context**: The code review fixes needed regression coverage without adding a heavyweight test framework or requiring live MySQL, Meta, Razorpay, SMTP, or Socket.io services.
**Decision**: Use Node.js built-in `node:test` with `node:assert/strict` for backend regression tests under `backend/test/*.test.js`, exposed through `npm test` in `backend/package.json`.
**Alternatives Considered**: Vitest or Jest for all JavaScript tests. Those would add more dependencies and configuration before the project has frontend component-test infrastructure.
**Consequences**: Regression tests are fast and dependency-light, but current coverage is mostly helper/static contract coverage rather than full HTTP/database integration coverage.
**Superseded By**:

## Decision: Maintained Local Transformer Runtime
**Date**: 2026-06-16
**Status**: Accepted
**Context**: `@xenova/transformers` is no longer the safest runtime dependency because it pins old ONNX/protobuf packages that trigger critical audit findings.
**Decision**: Keep the local CPU-bound semantic matching architecture, but import `pipeline` from `@huggingface/transformers` instead of `@xenova/transformers`.
**Alternatives Considered**: Force npm to override `@xenova/transformers` transitive ONNX packages, run `npm audit fix --force` and accept a downgrade, or remove local embeddings. Overrides risked untested ABI/API combinations, forced downgrade was marked breaking, and removing embeddings would regress the product.
**Consequences**: Dependency audit is clean while preserving the local FAQ/product embedding flow. First model load behavior should still be verified after deployment because the runtime package changed.
**Superseded By**:
