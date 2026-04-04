# Real Estate CRM SaaS

Multi-tenant CRM platform for real estate firms with direct Meta WhatsApp Cloud API integration.

## Architecture

```
realestate-crm-saas/
├── backend/          # Express.js API (Node.js 18+)
│   ├── src/
│   │   ├── app.js          # Express app setup
│   │   ├── server.js       # Server entry point
│   │   ├── config.js       # Environment config
│   │   ├── database.js     # MySQL connection + migrations
│   │   ├── middleware/     # Auth, tenant resolution
│   │   ├── routes/         # API route handlers
│   │   └── services/       # WhatsApp, external services
│   ├── package.json
│   └── .env.example
├── frontend/         # Preact SPA (Vite)
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── stores/         # Zustand state management
│   │   └── index.jsx       # App entry
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Tech Stack

- **Frontend:** Preact + Vite + Zustand
- **Backend:** Express.js + MySQL (mysql2)
- **Auth:** JWT (bcryptjs)
- **WhatsApp:** Direct Meta Cloud API (per-tenant credentials)
- **Hosting:** DigitalOcean (App Platform / Droplet + Managed MySQL)

## Setup

```bash
# Backend
cd backend
cp .env.example .env    # Edit with your credentials
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Key Features

- Lead management with pipeline stages
- Client conversion tracking
- WhatsApp broadcast via direct Meta API (no middleman charges)
- Team management with role-based access
- Site visit scheduling
- Follow-up reminders
- Inventory/project management
- Dashboard analytics

## Multi-Tenancy (Coming)

- Shared database with `tenant_id` isolation
- Per-tenant WhatsApp credentials
- Subdomain routing (firm.yourcrm.in)
- Subscription billing via Razorpay
