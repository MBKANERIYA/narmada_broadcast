# Architectural Decisions

This document logs the architectural choices made during the development of the WhatsApp Broadcast SaaS.

## Decision: Preact + Vite Frontend Framework
**Date**: 2026-04-10
**Status**: Accepted
**Context**: We need a fast, lightweight, and modern Single Page Application (SPA) frontend.
**Decision**: Use Preact (Vite template) with Zustand for state management.
**Alternatives Considered**: React (heavier bundle size), Vue (different programming model, JSX is preferred for matching React-like components).
**Consequences**: Smaller bundle sizes, fast builds. Requires `import from 'preact/hooks'` instead of `'react'`.

## Decision: MySQL 8.0 Prepared Statements and LIMIT/OFFSET Handling
**Date**: 2026-04-11
**Status**: Accepted
**Context**: MySQL `pool.execute()` prepared statements do not allow placeholders for LIMIT and OFFSET variables.
**Decision**: Parse and sanitize LIMIT and OFFSET as integers (`parseInt`) and inline them into SQL query strings rather than using `?` placeholders.
**Alternatives Considered**: Use `pool.query()` which does client-side interpolation, but `pool.execute()` is preferred for query caching and performance.
**Consequences**: Extra care is needed to ensure inlined values are strictly parsed as integers to prevent SQL injection.

## Decision: Single-Domain Multi-Tenancy with Soft Resolution
**Date**: 2026-04-11
**Status**: Accepted
**Context**: The application runs on a single domain (`broadcast.innodify.in`) rather than separate subdomains for each tenant.
**Decision**: Resolve tenants softly using a custom header `x-tenant-slug` sent by the frontend, fallback to the `tenantId` stored inside the JWT auth token.
**Alternatives Considered**: Wildcard subdomains (too complex for initial DNS/SSL config).
**Consequences**: The frontend must send `x-tenant-slug` with every API request. Login must query by email globally across all tenants.

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
**Status**: Accepted
**Context**: The project pivoted away from third-party remote AI APIs (Google Gemini API via OpenAI SDK) to guarantee offline reliability, eliminate external API key configuration requirements, and ensure responses are strictly aligned with the merchant's FAQ/product dataset.
**Decision**: Use a local feature-extraction pipeline via `@xenova/transformers` with the `all-MiniLM-L6-v2` model running directly on the CPU. Match incoming messages to existing FAQs and products using cosine similarity.
**Alternatives Considered**: Google Gemini API (requires external API keys, internet connectivity, and can generate off-topic conversational text).
**Consequences**: The system is completely self-contained with zero external API key requirements. Responses are strictly bounded by active FAQs and products.

