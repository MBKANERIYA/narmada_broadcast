# Changelog

All notable changes to the WhatsApp Broadcast SaaS project, in reverse chronological order.

---

## 2026-06-12 — Hotfix: Meta API audio/webm Content-Type Binary Validation Rejection
**What**: Integrated an FFmpeg-based transcoding pipeline on the backend to convert browser-recorded `audio/webm` buffers to native `audio/ogg` (Opus) containers.
**Why**: Meta's Graph API performs binary file structure validation. Renaming metadata MIME types is rejected as `application/octet-stream` if the binary structure is still WebM (EBML).
**Impact**: Voice notes recorded in the browser are correctly transcoded on the fly and sent successfully to Meta's API without binary validation errors.
**Files Changed**: `backend/src/routes/whatsapp-chat.js`, `backend/src/services/transcoder.js`
**Tests**: Verified syntax check.
**Commit**: `3b81130`

- Created `backend/src/services/transcoder.js` utilizing streaming `ffmpeg` stdin/stdout piping.
- Integrated `transcodeWebmToOgg` into the backend `send-media` route to convert recorded audio on the fly.

## 2026-06-12 — Hotfix: WhatsApp Chat Inbox Reference Errors
**What**: Restored browser voice recording states and handlers, and added native audio rendering to MediaMessage in Chat Inbox.
**Why**: The previous implementation was missing critical Javascript variable/handler definitions inside the `WhatsAppChat` component body and native audio tags in `MediaMessage`, causing runtime reference crashes that blocked opening chats.
**Impact**: Chat Inbox and conversation selection are fully operational again.
**Files Changed**: `frontend/src/components/WhatsAppChat.jsx`
**Tests**: Verified frontend builds successfully (`npm run build`).
**Commit**: `f2312e6`

- Implemented state variables (`isRecording`, `recordingTime`) and refs (`mediaRecorderRef`, `audioChunksRef`, `timerRef`) in `WhatsAppChat`.
- Added `startRecording`, `cancelRecording`, `stopAndSendRecording` handlers using the browser `MediaRecorder` API.
- Integrated standard `formatDuration(seconds)` utility for recording time representation.
- Added native `<audio>` element rendering to `MediaMessage` to correctly play sent voice notes.

## 2026-06-12 — Audio Recording and Store Timings Bot Control
**What**: Implemented voice note recording in Chat Inbox and store hours chatbot settings.
**Why**: Customers wanted to be able to record and send audio messages directly, and firms wanted to configure chatbot behaviors when customers message after-hours.
**Impact**: Chat inbox can now record and play voice messages; incoming after-hours messages trigger away actions like away message or silence based on configured hours.
**Files Changed**: `backend/src/app.js`, `backend/src/database.js`, `backend/src/routes/tenant-settings.js`, `backend/src/routes/whatsapp-chat.js`, `backend/src/services/whatsapp.js`, `frontend/src/components/Icons.jsx`, `frontend/src/components/Settings.jsx`, `frontend/src/components/WhatsAppChat.jsx`, `frontend/src/stores/store.js`
**Tests**: Verified frontend builds successfully (`npm run build`), backend syntax check (`node --check`) passes.
**Commit**: `c4e5d6a` (local changes to be committed)

- Added a new "Chatbot & Hours" settings tab to manage smart chatbot status, business hours timezone, open days, hours, and after-hours auto-responses.
- Updated incoming webhook message processor to intercept after-hours text messages and execute "Respond Normally", "Send Away Message", or "Remain Silent" rules.
- Added support for recording voice notes from the browser utilizing the MediaRecorder API, dispatches recorded audio blob to Meta's API, and displays native audio player controls in the Chat Inbox thread.
- Omitted caption parameter for audio media messages to satisfy Meta API schema validation constraints.

## 2026-06-12 — UI Redesign: Smart Knowledge Base FAQ Dashboard
**What**: Completely redesigned and overhauled the Smart Knowledge Base FAQ dashboard layout and styling.
**Why**: The previous UI had severe form field misalignment and squished inputs, making it look unprofessional.
**Impact**: Clean, premium aesthetic and fully responsive grid split-pane on desktop.
**Files Changed**: `frontend/src/components/KnowledgeBase.jsx`, `frontend/src/styles/main.css`, `frontend/package-lock.json`, `knowledge-base/active-context.md`, `knowledge-base/decisions.md`, `knowledge-base/known-issues.md`
**Tests**: Verified frontend builds successfully locally (`npm run build`). No automated test suites currently exist.
**Commit**: `93756b0`

- Implemented responsive split-column grid: Form on the left (max 480px), FAQ list on the right.
- Restructured form fields with `<div className="form-group">` wrappers, aligning labels and textareas vertically.
- Added interactive text input icons (magnifying glass, chat icons) and focus transition rings.
- Integrated a live horizontal Statistics panel showing Total FAQs, AI Status, and NLP Model metrics.
- Added dynamic search filtering in the Active FAQs list.
- Redesigned FAQ item cards with green brand left-accent, hover shadows, slide translation, and hover-triggered delete actions.

## 2026-06-12 — Feature: Send Media in WhatsApp Chat
**What**: Added the ability to send images and documents from the platform to WhatsApp users.
**Why**: Enhances the chat experience by allowing agents to send product images, invoices, and other media directly from the dashboard.
**Files Changed**: `backend/src/services/whatsapp.js`, `backend/src/routes/whatsapp-chat.js`, `frontend/src/stores/store.js`, `frontend/src/components/WhatsAppChat.jsx`
- Created `uploadMediaForMessage` service to proxy local file uploads to the Meta Graph API's `/media` endpoint.
- Added `POST /conversations/:id/send-media` endpoint using `multer` to handle `multipart/form-data` uploads.
- Updated `WhatsAppChat` UI with an attachment button (paperclip), image preview area, and caption support.

## 2026-06-12 — Fix: WhatsApp Media Message Display
**What**: Added secure backend proxy to fetch and render image messages sent from WhatsApp users to the SaaS Inbox.
**Why**: Meta requires authentication to fetch media URLs. The frontend could not directly display `<img>` tags without a bearer token, resulting in grey "📷 Image" placeholders.
**Files Changed**: `backend/src/routes/whatsapp-chat.js`, `frontend/src/stores/store.js`, `frontend/src/components/WhatsAppChat.jsx`
- Added `GET /api/v1/whatsapp/chat/media/:media_id` proxy endpoint in backend to securely download binary media from Meta API.
- Created `fetchMediaUrl` utility in frontend store to handle authenticated blob fetching.
- Added `MediaMessage` component to dynamically load and display images securely via `URL.createObjectURL`.

## 2026-06-12 — Feature: AI Chatbot Integration
**What**: Integrated an advanced AI auto-reply bot using Google Gemini's free `gemini-1.5-flash` model via the OpenAI SDK.
**Why**: Allows the platform to automatically respond to incoming customer messages for completely free without needing a paid OpenAI account.
**Files Changed**: `backend/src/services/openai.js`, `backend/src/app.js`, `backend/package.json`
- Installed `openai` npm package.
- Created `generateChatbotReply()` in `openai.js` that pulls the last 10 messages from the database to build conversation context and generates an AI response.
- Switched the SDK Base URL to `generativelanguage.googleapis.com/v1beta/openai/` to use Google's generous free tier.
- Integrated AI logic into `processIncomingMessage()` inside `app.js` to automatically reply to incoming text messages if `AI_API_KEY` is present.

## 2026-06-12 — Fix: Meta Commerce Catalog Sync for India
**What**: Added `origin_country` to the Meta Commerce API product sync payload
**Why**: Meta requires `origin_country` for catalogs in India. Without this field, products sync to the catalog but are hidden/rejected and do not display on the WhatsApp Business profile.
**Files Changed**: `backend/src/services/whatsapp.js`
- Added `origin_country: 'IN'` to the `PRODUCT_ITEM` `items_batch` payload.

## 2026-06-11 — Feature: Meta Commerce Catalog Integration
**What**: Automatically syncs locally created products to Meta Commerce Catalog via Graph API
**Why**: Ensures products added via the SaaS UI appear on the tenant's actual WhatsApp Business Profile in the WhatsApp app
**Files Changed**: `backend/src/database.js`, `backend/src/routes/tenant-settings.js`, `frontend/src/components/Settings.jsx`, `backend/src/services/whatsapp.js`, `backend/src/routes/products.js`
- Added `whatsapp_catalog_id` to tenants table and `meta_product_id` to products table
- Updated UI in Settings to allow entering Commerce Catalog ID
- Built `syncProductToMeta` to upsert products via `POST /<CATALOG_ID>/items_batch`
- Wired product create/update/delete API routes to sync to Meta in real-time

## 2026-06-11 — Feature: Product Catalogue
**What**: Added Product Catalogue functionality to allow tenants to manage products.
**Why**: Tenants need a way to manage their product catalogue before creating WhatsApp catalog messages or broadcast templates involving products.
**Files Changed**: `backend/src/routes/products.js`, `backend/src/database.js`, `backend/src/app.js`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/components/Catalogue.jsx`
- Backend: Added `products` table migration in `database.js`
- Backend: Added full CRUD API (`GET`, `POST`, `PUT`, `DELETE` on `/api/v1/products`) scoped by `tenant_id`
- Frontend: Added `Catalogue.jsx` component with a responsive grid layout
- Frontend: Added modal for creating/editing products with fields for Name, Description, MRP, Selling Price, Category, SKU, and Image URL
- Frontend: Added new 'Catalogue' item to `Sidebar.jsx` and registered route in `App.jsx`

## 2026-04-27 — Feature: Template Edit Functionality
**What**: Added ability to edit existing WhatsApp templates from the Templates tab
**Why**: Users previously had to delete and recreate templates to make changes — now they can edit body, footer, buttons, and header image directly
**Files Changed**: `backend/src/services/whatsapp.js`, `backend/src/routes/whatsapp.js`, `frontend/src/stores/store.js`, `frontend/src/components/WhatsAppBroadcast.jsx`
- Backend: Added `editTemplate()` service function that calls Meta's `POST /{template_id}` API to update template components
- Backend: Added `PUT /api/v1/whatsapp/templates/:id` route that accepts updated body/footer/buttons/image and forwards to Meta API, also updates local DB record
- Frontend Store: Added `editWhatsAppTemplate` Zustand action
- Frontend UI: "Edit" button in template list table opens a full-screen modal with:
  - Read-only display of name, category, language (Meta doesn't allow changing these)
  - Editable body text, footer, header image, and button builder
  - Live WhatsApp-style preview panel (matches the create template preview)
  - Pre-fills all fields from the existing template's Meta component data
  - On save, resubmits template to Meta for review and shows success toast
- Invalidates template definition cache after edit to ensure fresh data

---

## 2026-04-22 — Fix: Message Timestamps Showing in UTC
**What**: Fixed chat messages and conversation list timestamps showing UTC time instead of local time
**Why**: Database timestamps are stored in UTC without timezone markers, so the frontend interpreted them as local time before formatting
**Files Changed**: `frontend/src/components/WhatsAppChat.jsx`
- Added `parseUTC` helper to append `Z` to timestamp strings from the backend
- This forces the JavaScript `Date` object to parse it as UTC rather than local time
- `toLocaleTimeString` and `toLocaleDateString` now correctly convert the UTC time to the user's local timezone (e.g., IST)
- Applied to both the conversation list timestamps and the individual message timestamps

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
