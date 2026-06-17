# WhatsApp Broadcast SaaS — Knowledge Base

Multi-tenant SaaS platform for WhatsApp broadcast messaging and two-way chat inbox. Each tenant connects their own Meta WhatsApp Business API credentials.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Preact + Vite (JSX, Zustand state) |
| Backend | Express.js (Node.js 20+) |
| Database | MySQL 8.0 |
| Auth | JWT + bcryptjs |
| WhatsApp API | Meta Cloud API v21.0 |
| Test Runner | Node built-in `node:test`, ESLint, Vite build, npm audit |
| Process Manager | PM2 |
| Reverse Proxy | Nginx |
| Hosting | Hostinger VPS (Ubuntu) |
| Domain | broadcast.innodify.in |

## Directory Structure

```
whatsapp-broadcast-saas/
├── backend/
│   └── src/
│       ├── app.js              # Express app setup + routes
│       ├── config.js           # Environment config
│       ├── database.js         # MySQL pool + migrations
│       ├── middleware/
│       │   ├── auth.js         # JWT auth + tenant fallback
│       │   ├── tenant.js       # Soft tenant resolution
│       │   └── limits.js       # Subscription limits
│       └── routes/
│           ├── auth.js         # Login (cross-tenant) + signup
│           ├── contacts.js     # CRUD + import + tags/locations
│           ├── whatsapp.js     # Broadcast + templates
│           ├── whatsappChat.js # Two-way chat inbox
│           ├── tenantSettings.js # Firm profile + WhatsApp creds
│           └── public.js       # Public signup (no auth)
├── frontend/
│   └── src/
│       ├── components/         # Preact JSX components
│       ├── stores/store.js     # Zustand state management
│       └── styles/main.css     # Design system + responsive
└── knowledge-base/             # This folder
```

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | `README.md` | This file — project overview, structure, critical rules |
| 2 | `PROJECT_OVERVIEW.md` | Business model, features, tech stack, design decisions |
| 3 | `ARCHITECTURE.md` | Database schema, API endpoints, data flow |
| 4 | `DEPLOYMENT.md` | VPS setup, Nginx, PM2, MySQL, environment variables |
| 5 | `DEVELOPMENT_GUIDE.md` | Local dev setup, coding patterns, how to add features |
| 6 | `frontend.md` | App shell, responsive UI rules, browser QA notes |
| 7 | `security.md` | Webhook signatures, tenant scoping, secret masking, dependency audit rules |
| 8 | `testing.md` | Current verification commands, test gaps, future test rules |
| 9 | `CREDENTIALS_AND_INFRA.md` | Server details, domains, database credentials, API keys |
| 10 | `changelog.md` | Chronological history of all changes |

## Critical Rules

### Tenant Resolution (IMPORTANT — read this first)
- Single domain: `broadcast.innodify.in` (no per-tenant subdomains)
- Tenant middleware is **soft** — if slug not found, passes with null (doesn't block)
- JWT auth middleware sets `req.tenantId` from token as fallback
- Login searches by email across ALL tenants (not scoped to slug)
- Frontend stores `tenant_slug` in localStorage after login/signup
- `getTenantSlug()` recognizes `broadcast`, `app`, `www`, `api`, `admin` as app domains

### MySQL Gotchas
- **NEVER use `LIMIT ?` or `OFFSET ?`** in `pool.execute()` — MySQL prepared statements don't support integer placeholders for LIMIT/OFFSET. Inline them as sanitized `parseInt()` values.
- JSON columns: Use `JSON_CONTAINS()` for tag filtering, `JSON_TABLE()` for tag listing

### Deploy Command
```bash
cd /opt/whatsapp-broadcast && git pull origin main
cd frontend && npm run build && cd ..
pm2 restart whatsapp-broadcast
```

### Verification Before Handoff
- Backend regressions: run `npm test` from `backend/`.
- Backend syntax: run `node --check` across `backend/src/**/*.js`.
- Frontend lint/build: run `npm run lint` and `npm run build` from `frontend/`.
- Dependency audit: run `npm audit --audit-level=high` from both `frontend/` and `backend/`.
- Secret scan: keep deployment docs on placeholders; do not commit production-looking DB, JWT, webhook, Meta, or Razorpay secrets.

## Quick Facts

| Item | Value |
|------|-------|
| Domain | broadcast.innodify.in |
| VPS | Hostinger srv1566548 |
| GitHub | github.com/shivanshu407/whatsapp-broadcast-saas |
| Git User | shivanshu407 |
| DB | MySQL 8.0 (local on VPS) |
| Backend Port | 3001 |
| Node | 20.19+ for frontend tooling, backend supports 18+ |
| Test Command | `cd backend && npm test`; plus `cd frontend && npm run lint && npm run build` |
