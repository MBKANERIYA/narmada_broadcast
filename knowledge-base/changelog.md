# Changelog

All notable changes to the WhatsApp Broadcast SaaS project, in reverse chronological order.

---

## 2026-04-22 — Fix: Messages & Replies Not Showing in Chat Inbox
**What**: Fixed chat inbox not displaying new messages or customer replies
**Why**: Stale JavaScript closure bug — the polling setInterval captured the initial null value of selectedConvId, so message polling NEVER ran after the initial click
**Files Changed**: `frontend/src/components/WhatsAppChat.jsx`, `backend/src/app.js`, `backend/src/routes/whatsapp-chat.js`
- Root Cause: `useEffect` with `[]` dependency meant `selectedConvId` was always `null` inside the interval callback (React stale closure)
- Fix: Use refs (`selectedConvIdRef`, `searchRef`) that stay in sync with state, so the interval always reads current values
- Polling now restarts when conversation changes for immediate responsiveness
- Added detailed webhook logging to trace incoming message processing
- Added messages API endpoint logging to help debug empty message responses

---

## 2026-04-17 — Feature: Rich Template Cards in Chat Inbox
**What**: Template messages now display as full WhatsApp-style cards with header image, body, footer, and buttons
**Why**: Previously showed only `[Template: n1]` or plain body text — users couldn't see the complete message sent to customers
**Files Changed**: `backend/src/routes/whatsapp-chat.js`, `backend/src/services/whatsapp.js`, `frontend/src/components/WhatsAppChat.jsx`
**Commit**: `9a584bc`
- Backend `resolveTemplateBody()` now stores rich JSON with all template components (header, body, footer, buttons)
- `getTemplatePlainText()` extracts plain text for sidebar conversation preview
- Frontend `TemplateCard` component renders WhatsApp-style cards with:
  - Header images (IMAGE), video placeholders, document icons, text headers
  - Body text with variables filled in
  - Footer text
  - Styled buttons (phone, URL, quick reply) with icons
- Backward compatible: old `[Template: name]` format messages still render as before
- Only new messages after deploy get the rich card format

---

## 2026-04-15 — Fix: Broadcast Messages Not Sending (All Campaigns Failed)
**What**: Fixed broadcasts showing 0 sent / 0 failed / status "Failed"
**Why**: `processBroadcast` background function crashed before sending messages; error was hidden from UI
**Files Changed**: `backend/src/routes/whatsapp.js`, `backend/src/database.js`, `frontend/src/components/WhatsAppBroadcast.jsx`
**Commit**: `4c63172`
- Reload tenant from DB in `processBroadcast` instead of using potentially stale cache object
- Show `error_log` in campaign history table and campaign detail modal
- Added step-by-step console.log in `processBroadcast` for server-side debugging
- Added missing `buttons_json` column to `whatsapp_templates` table migration
- Wrapped the catch block's DB update in its own try/catch to prevent silent failures

## 2026-04-15 — Feature: Start New Chat from Inbox
**What**: Added ability to start new WhatsApp conversations from the Chat Inbox
**Why**: Chat Inbox had no way to initiate conversations — only showed replies to broadcasts
**Files Changed**: `backend/src/routes/whatsapp-chat.js`, `frontend/src/components/WhatsAppChat.jsx`, `frontend/src/stores/store.js`
**Commit**: `d75c69c`
- Green "+" button next to search bar to start new conversation
- Two-step modal: (1) Enter phone or select from contacts list (2) Pick template + fill variables
- WhatsApp-style inline preview of template before sending
- Backend `POST /conversations/new` creates/finds conversation, sends template, stores message
- "Start New Chat" CTA button shown when conversation list is empty
- Contact search with hover effects and arrow icon

## 2026-04-15 — Fix: LIMIT/OFFSET Prepared Statement in Chat
**What**: Fixed `ER_WRONG_ARGUMENTS` crash in chat conversations and messages queries
**Why**: MySQL `pool.execute()` doesn't support `?` placeholders for LIMIT/OFFSET
**Files Changed**: `backend/src/routes/whatsapp-chat.js`
**Commit**: `0ea06a5`
- Inlined LIMIT and OFFSET as `parseInt()` values in both conversation list and message list queries

## 2026-04-14 — Admin Panel for Tenant Management
**What**: Added super admin panel to manage user accounts (temporary dev tool)
**Why**: Need to upgrade/suspend/delete tenants during development without direct DB access
**Files Changed**: `backend/src/routes/admin.js` [NEW], `frontend/src/components/AdminPanel.jsx` [NEW], `backend/src/app.js`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`
**Commit**: `b958740`
- Backend: GET/PUT/DELETE /api/v1/admin/tenants endpoints protected by `superAdminOnly` middleware
- Frontend: Card-based UI with inline edit for plan/status, suspend toggle, delete with confirmation
- View users per tenant in expandable section
- Sidebar shows "Admin Panel" link only for users with `role === 'admin'`
- Backend enforces `SUPER_ADMIN_EMAILS` env var — must be set on server
- Default tenant (id=1) cannot be deleted

## 2026-04-11 — MySQL LIMIT/OFFSET Prepared Statement Fix
**What**: Fixed contacts GET endpoint crashing with `ER_WRONG_ARGUMENTS` (errno 1210)
**Why**: MySQL `pool.execute()` uses server-side prepared statements which don't support `LIMIT ?` or `OFFSET ?` as placeholders
**Files Changed**: `backend/src/routes/contacts.js`
**Commit**: `27dcc88`
- Inlined LIMIT and OFFSET as `parseInt()` values instead of `?` placeholders
- This was the root cause of "imported contacts not visible" — the GET always crashed silently
- All imports were actually succeeding (verified via debug logs)

## 2026-04-11 — Tenant Auth System Overhaul (3 commits)
**What**: Fixed "Account not found" and "Invalid credentials" errors on login/logout/new-device
**Why**: Single-domain SaaS (`broadcast.innodify.in`) was being treated as subdomain-based multi-tenant
**Files Changed**: `backend/src/middleware/tenant.js`, `backend/src/middleware/auth.js`, `backend/src/routes/auth.js`, `frontend/src/stores/store.js`
**Commits**: `2c6f0a8`, `3c72a5f`, `e841410`
- **Frontend** `getTenantSlug()`: Recognizes `broadcast`, `app`, `www`, `api`, `admin` as app domains (not tenants)
- **Backend** `resolveTenant`: Made "soft" — if slug not found, passes with `null` instead of blocking with 404
- **Backend** `auth` middleware: Now loads tenant from JWT `tenantId` when tenant middleware didn't resolve
- **Backend** login route: Searches by email across ALL tenants (not scoped to `req.tenantId`)
- Added final check: rejects if no `tenantId` from either slug or JWT

## 2026-04-11 — CSV File Upload Import (Contacts)
**What**: Replaced text-paste import modal with proper CSV file upload
**Why**: Users need to upload CSV files, not paste raw text
**Files Changed**: `frontend/src/components/Contacts.jsx`, `frontend/src/stores/store.js`
**Commit**: `0cad430`
- Click-to-upload area with dashed border UI
- Parses CSV with header detection (skips row if contains "name"+"phone")
- Preview table showing first 5 rows before import
- "Download Template" button inside modal
- Template button in header downloads `contacts_import_template.csv`
- `importContacts` now `await`s `fetchContacts()` for guaranteed refresh

## 2026-04-10 — Comprehensive Responsive Adaptation
**What**: Full responsive overhaul for tablet (1024px) and mobile (768px)
**Why**: All component grids used inline `style={{}}` which CSS media queries couldn't override
**Files Changed**: `frontend/src/styles/main.css`, `frontend/src/components/WhatsAppChat.jsx`, `frontend/src/components/Icons.jsx`
**Commit**: `2c31e9c`
- Added tablet breakpoint (≤1024px) and expanded mobile breakpoint (≤768px)
- CSS attribute selectors override inline grids: `[style*="1fr 1fr 1fr"]`, `[style*="1fr 340px"]`
- Chat inbox: mobile shows list/chat toggle with ← back button
- 44px min touch targets, 16px font inputs (prevents iOS zoom)
- Added `arrow-left` icon to icon system

## 2026-04-10 — WhatsApp Button Types Support
**What**: Template builder now supports all WhatsApp button types (Call, URL, Quick Reply)
**Why**: Previously only supported call buttons; Meta allows URL and Quick Reply too
**Files Changed**: `backend/src/services/whatsapp.js`, `backend/src/routes/whatsapp.js`, `frontend/src/components/WhatsAppBroadcast.jsx`
**Commit**: `21db69f`
- Dynamic button builder UI: + Call, + Website, + Quick Reply
- Auto-disables at Meta limits (1 call, 2 URL)
- Backend `createTemplate` accepts generic `buttons[]` array
- Live preview renders all button types with correct WhatsApp icons
