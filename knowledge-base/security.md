# Security

## What This Subsystem Does
Security is split across request authentication, tenant scoping, webhook verification, client-safe secret handling, and dependency hygiene. The backend is multi-tenant, so any route that reads or mutates tenant data must either run behind `authenticateToken`/tenant middleware or explicitly validate the tenant context before touching the database.

## How It Is Structured
| Area | Files | Notes |
|------|-------|-------|
| Auth and tenant context | `backend/src/middleware/auth.js`, `backend/src/middleware/tenant.js` | JWT auth sets the fallback tenant ID; tenant middleware resolves `x-tenant-slug` softly. |
| Webhook security | `backend/src/app.js`, `backend/src/utils/security.js` | WhatsApp verification uses the configured verify token; Razorpay webhooks verify the HMAC over `req.rawBody`. |
| Settings secret handling | `backend/src/routes/tenant-settings.js`, `backend/src/utils/settings-security.js` | Secret-bearing payment settings are blanked before returning to the browser and preserved on blank updates. |
| Chat human takeover | `backend/src/database.js`, `backend/src/app.js`, `backend/src/routes/whatsapp-chat.js`, `frontend/src/stores/store.js`, `frontend/src/components/WhatsAppChat.jsx` | `bot_paused` is stored per conversation and the webhook skips auto-replies while paused. |
| Dependency security | `backend/package.json`, `frontend/package.json` | `npm audit --audit-level=high` must pass in both workspaces. |

## Conventions and Rules
- Do not add public debug endpoints that expose tenant, message, token, webhook, or credential data.
- Razorpay webhook handlers must verify `x-razorpay-signature` against the tenant's stored `razorpay_webhook_secret` before updating payment state.
- Database lookups from webhook payloads must include `tenant_id` where a tenant can be derived.
- Browser settings responses must not return raw tokens or payment secrets. Use blank values plus `has_*` flags for secret fields.
- Do not store pause/handoff state only in localStorage; it must be server-side state if it changes webhook behavior.
- Use placeholders in docs and examples. Production-looking DB, JWT, webhook, Meta, or Razorpay secrets do not belong in the repo.
- Keep `ws` pinned through npm overrides until upstream Socket.io dependency ranges allow the patched version without an override.

## Known Gotchas
- `express.json()` captures `req.rawBody` through its `verify` hook; do not remove that hook or Razorpay signature verification will stop working.
- `mergeSecretSettings()` preserves stored Razorpay secrets when the frontend sends blank strings. Treat blank secret updates as "unchanged", not "clear this secret".
- `@huggingface/transformers` replaced `@xenova/transformers` to clear vulnerable ONNX/protobuf transitive dependencies while preserving local embeddings. Smoke-test Smart FAQ/product replies after deployment because the runtime changed.
- `rg` returns exit code 1 when a secret-pattern scan finds no matches; that is a pass for this use case.

## How It Is Tested
- `backend/test/regression.test.js` covers Razorpay signature validation, removal of the public debug route, labeled campaign schema support, realtime event key compatibility, persisted bot pause contracts, settings secret masking, deployment-doc placeholders, and the Catalogue hook ordering regression.
- Run `npm audit --audit-level=high` from both `frontend/` and `backend/`.
- Run a targeted secret scan from the repo root for project-specific production-looking examples. Keep exact guard patterns in tests or local scripts so documentation does not contain the literal banned tokens:

```powershell
rg -n "<project-specific-secret-patterns>" backend frontend knowledge-base README.md Dockerfile
```

## Links To Related KB Files
- `testing.md` for the full verification checklist.
- `DEPLOYMENT.md` for production environment placeholders and setup.
- `known-issues.md` for resolved security findings and regression-test pointers.
- `decisions.md` for the local transformer runtime and test framework decisions.
