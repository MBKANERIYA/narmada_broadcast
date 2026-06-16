# Known Issues

A registry of active bugs, limitations, and workarounds.

## ISSUE-001: MySQL LIMIT/OFFSET Prepared Statement Failures
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-04-11
**Resolved**: 2026-04-11
**Symptom**: Contacts and Chat Inbox endpoints fail with `ER_WRONG_ARGUMENTS` when trying to fetch paginated datasets.
**Root Cause**: Node.js `mysql2` `pool.execute()` creates prepared statements on the MySQL server, which does not allow placeholders `?` in `LIMIT` and `OFFSET` clauses.
**Workaround**: None needed.
**Fix**: Inline parsed integer variables into the query strings directly.

## ISSUE-002: Smart FAQs Layout Misalignment
**Status**: Resolved
**Severity**: Medium
**Discovered**: 2026-06-12
**Resolved**: 2026-06-12
**Symptom**: In the Smart Knowledge Base view, the "Add New FAQ" form layout is misaligned. Labels are placed inline next to input fields, inputs are squished, textareas overlap, and buttons float awkwardly.
**Root Cause**: The component uses generic `<div>` wrappers instead of `<div className="form-group">`, and does not follow the flexbox structure defined in `main.css`.
**Workaround**: Users can still interact with the form, but it looks unprofessional.
**Fix**: Overhauled the form and FAQ cards styling in `KnowledgeBase.jsx` to use proper layout groups, flex containers, and aligned elements.

## ISSUE-003: Public Debug Endpoint Exposes Tenant and Chat Metadata
**Status**: Resolved
**Severity**: Critical
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: Anyone who can reach `/api/v1/debug/chat-status` can retrieve tenant identifiers, WhatsApp phone number IDs, recent conversations, recent message previews, webhook event logs, and the webhook verify token.
**Root Cause**: `backend/src/app.js` registers the diagnostic endpoint before tenant/auth middleware and intentionally leaves it public.
**Workaround**: None needed.
**Fix**: Removed the public debug endpoint from `backend/src/app.js`.
**Regression Test**: `backend/test/regression.test.js` asserts the `chat-status` debug route is not registered.

## ISSUE-004: Razorpay Webhook Does Not Verify Signatures
**Status**: Resolved
**Severity**: Critical
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: A forged request to `/api/v1/razorpay-webhook` can mark an order as paid if it contains a matching `order_id` note.
**Root Cause**: The route reads the `x-razorpay-signature` header but does not compute or compare an HMAC with the tenant webhook secret before updating the order.
**Workaround**: None needed.
**Fix**: Captured raw JSON request bodies, added timing-safe Razorpay HMAC verification in `backend/src/utils/security.js`, required each tenant's stored webhook secret before marking orders paid, and tenant-scoped the pending order lookup/update.
**Regression Test**: `backend/test/regression.test.js` covers valid, invalid, and missing Razorpay signatures.

## ISSUE-005: Label Broadcasts Are Blocked by Campaign Enum
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: Broadcasts with `recipientType: 'labeled'` fail when inserting the campaign record on schemas where `whatsapp_campaigns.recipient_type` still only allows `all`, `tagged`, and `custom`.
**Root Cause**: `backend/src/routes/whatsapp.js` accepts the new `labeled` recipient type, but `backend/src/database.js` does not create or migrate the enum to include `labeled`.
**Workaround**: None needed.
**Fix**: Updated the base schema and migration list in `backend/src/database.js` so `whatsapp_campaigns.recipient_type` includes `labeled`.
**Regression Test**: `backend/test/regression.test.js` asserts the schema and migration include the `labeled` enum value.

## ISSUE-006: Open Chat Thread Does Not Refresh on Realtime Events
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: Incoming messages and bot replies refresh the conversation list but do not refresh the currently open chat thread via Socket.io.
**Root Cause**: Backend emits `conversationId`, while the frontend socket handler checks `data.conversation_id`.
**Workaround**: None needed.
**Fix**: Updated the frontend socket handler in `frontend/src/stores/store.js` to accept both `conversationId` and `conversation_id`.
**Regression Test**: `backend/test/regression.test.js` statically asserts the store handles the backend `conversationId` event key.

## ISSUE-007: Bot Pause Toggle Is UI-Only
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: Agents can toggle the pause/play button in Chat Inbox, but the backend smart responder continues to auto-reply to inbound customer messages.
**Root Cause**: Paused conversation IDs are stored only in browser localStorage; the webhook auto-reply path never checks a persisted pause flag.
**Workaround**: None needed.
**Fix**: Added `whatsapp_conversations.bot_paused`, persisted pause state through `PATCH /whatsapp/chat/conversations/:id/bot-pause`, updated the frontend store/chat UI to use server state, and made the inbound webhook skip auto-replies for paused conversations.
**Regression Test**: `backend/test/regression.test.js` asserts the schema, route, frontend store, and webhook pause check exist.

## ISSUE-008: Razorpay Secrets Are Rehydrated Into Settings Form
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: Razorpay key secret and webhook secret can be returned inside `bot_settings` and repopulated into password fields after settings reload.
**Root Cause**: `GET /api/v1/tenant-settings` masks WhatsApp access tokens but returns `bot_settings` unchanged; the frontend parses that JSON directly into secret-bearing form state.
**Workaround**: None needed.
**Fix**: Added settings sanitization helpers that blank Razorpay secret values on reads, expose boolean `has_*` flags, and preserve stored secrets when updates submit blank secret fields.
**Regression Test**: `backend/test/regression.test.js` covers masking and blank-secret merge behavior.

## ISSUE-009: Frontend Lint Gate Is Red
**Status**: Resolved
**Severity**: Medium
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: `npm run lint` in `frontend/` exits with 11 errors and 37 warnings.
**Root Cause**: Current violations include conditional hooks in `Catalogue.jsx`, unescaped JSX text, missing hook dependencies, unused variables, and image accessibility warnings.
**Workaround**: None needed.
**Fix**: Added local ESLint configuration/dependency, moved `Catalogue.jsx` hooks before early returns, and cleaned unused frontend bindings so the lint gate is deterministic and green.
**Regression Test**: `npm run lint` from `frontend/` exits 0.

## ISSUE-010: Deployment Documentation Contains Production-Looking Secrets
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: `knowledge-base/DEPLOYMENT.md` includes concrete-looking database, JWT, and webhook secret values in example production commands.
**Root Cause**: Deployment instructions were written with real-looking values instead of placeholders or secret-manager references.
**Workaround**: Rotate any copied values if they were ever used outside documentation examples.
**Fix**: Replaced concrete-looking deployment secrets with placeholders in `knowledge-base/DEPLOYMENT.md`.
**Regression Test**: `backend/test/regression.test.js` checks the deployment docs use placeholders, and the targeted `rg` secret-pattern scan returns no matches.

## ISSUE-011: Dependency Audit Finds High/Critical Vulnerabilities
**Status**: Resolved
**Severity**: Critical
**Discovered**: 2026-06-16
**Resolved**: 2026-06-16
**Symptom**: `npm audit --audit-level=high` reported vulnerable frontend and backend dependency chains including Preact, Vite/esbuild, Socket.io/ws, Nodemailer, Express/path-to-regexp/qs, and `@xenova/transformers` through old ONNX/protobuf packages.
**Root Cause**: Lockfiles had drifted to vulnerable transitive versions, and the deprecated `@xenova/transformers` package pinned an old ONNX runtime.
**Workaround**: None needed.
**Fix**: Ran non-forced audit fixes, upgraded Vite to 8, added an npm `ws` override to 8.21.0, and migrated local semantic embeddings from `@xenova/transformers` to `@huggingface/transformers`.
**Regression Test**: `npm audit --audit-level=high` from both `frontend/` and `backend/` exits 0.
