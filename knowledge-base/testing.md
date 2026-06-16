# Testing

## Test Frameworks in Use
| Layer | Framework | Notes |
|-------|-----------|-------|
| Backend regression | Node.js built-in `node:test` + `node:assert/strict` | Configured through `backend/package.json` as `npm test`; tests live under `backend/test/`. |
| Frontend lint | ESLint flat config | Configured in `frontend/eslint.config.js`; runs against `src/**/*.js` and `src/**/*.jsx`. |
| Frontend build | Vite 8 | Production compile gate for the Preact SPA. |
| Dependency audit | npm audit | Run in both `frontend/` and `backend/` with `--audit-level=high`. |

## How to Run Checks
| Command | What it runs |
|---------|--------------|
| `npm test` from `backend/` | Backend regression suite in `backend/test/*.test.js` |
| `node --check <file>` | Syntax check for one backend ES module file |
| `Get-ChildItem -Path backend/src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }` | PowerShell-friendly backend syntax sweep |
| `npm run lint` from `frontend/` | ESLint over `src/**/*.js` and `src/**/*.jsx` |
| `npm run build` from `frontend/` | Vite production build for the Preact SPA |
| `npm audit --audit-level=high` from `frontend/` | Frontend dependency vulnerability gate |
| `npm audit --audit-level=high` from `backend/` | Backend dependency vulnerability gate |

## Test File Conventions
Backend regression tests live in `backend/test/*.test.js` and should use the built-in Node test runner unless a broader integration framework is deliberately introduced and logged in `decisions.md`.

Frontend automated component tests are not configured yet. Until they exist, keep frontend behavior covered by deterministic lint/build checks and add backend/static regression tests for cross-stack contract bugs when possible.

## What Must Be Tested
- Auth and tenant isolation must cover allowed and denied tenant access.
- Webhooks must cover valid and invalid signature paths before they update payments, messages, or orders.
- WhatsApp chat behavior must cover inbound message storage, realtime event refresh, 24-hour window enforcement, template sends, and bot auto-replies.
- Broadcast targeting must cover all recipient types, including tags, labels, and custom selections.
- Settings must cover secret masking so tokens and payment secrets are not rehydrated into browser form state after reload.

## Mocks, Fakes, and Fixtures
No shared runtime mocks or fixtures exist yet. Current regression tests use source inspection and pure helper tests so they do not require MySQL, Meta, Razorpay, SMTP, or Socket.io.

External services that need fakes once integration tests are added: Meta Graph API, Razorpay, SMTP, Socket.io, and MySQL.

## Known Flaky Tests
None - keep it that way.
