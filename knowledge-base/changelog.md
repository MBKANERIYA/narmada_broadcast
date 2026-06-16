# Changelog

All notable changes to the WhatsApp Broadcast SaaS project, in reverse chronological order.

## 2026-06-16 — Fix: WhatsApp Broadcast Recipient Filtering
**What**: Fixed the "By Label" and "By Tag" filter logic in the WhatsApp Broadcast interface to properly preview the suggested contact count and made the matching case-insensitive.
**Why**: Selecting "By Label" was not updating the preview count correctly because the frontend was not passing the label parameter to the API, and the backend was missing the label check. Additionally, `JSON_CONTAINS` is strictly case-sensitive in MySQL, meaning searching for "vip" failed to match contacts tagged as "VIP".
**Files Changed**:
- `backend/src/routes/whatsapp.js`: Added `label` checking in the `GET /recipients` API.
- `frontend/src/stores/store.js`: Updated `fetchWhatsAppRecipients` to accept a flexible `filters` object including `label`.
- `frontend/src/components/WhatsAppBroadcast.jsx`: Refactored the `useEffect` hook to explicitly pass `tag` and `label` only when the respective recipient type is selected.

---

## 2026-06-16 — Fix: Webhook Signature Backward Compatibility
**What**: Made the Razorpay Webhook Signature verification optional if the secret is not configured.
**Why**: During the recent security audit, signatures were made mandatory, which broke the automatic "Payment Received" WhatsApp confirmation for existing users who had not yet configured their Webhook Secret in the Settings dashboard.
**Files Changed**:
- `backend/src/app.js`: Bypassed signature check if `webhookSecret` is empty.

---

## 2026-06-16 — Feature: Multiple Image Uploads for Products
**What**: Upgraded the product catalogue to support multiple image uploads instead of just a single image URL, and enabled multi-image sync to Meta Catalog.
**Why**: Allows adding additional images for a richer product gallery in both the dashboard and WhatsApp Business catalog.
**Files Changed**:
- `backend/src/database.js`: Added `images` JSON column to the `products` table.
- `backend/src/routes/products.js`: Added `POST /upload-images` endpoint and updated product creation/editing to accept an array of images.
- `backend/src/services/whatsapp.js`: Updated `syncProductToMeta` to pass extra images via `additional_image_links`.
- `frontend/src/components/Catalogue.jsx`: Refactored the UI to accept multiple files, render an image grid thumbnail preview, and allow removing uploaded images. Also improved card styling to be premium and square with blurred backdrops.

---

## 2026-06-16 — Security, Realtime, Bot Pause, Lint, and Dependency Fixes
**What**: Fixed all documented review findings and added regression coverage for the critical paths.
**Why**: The review found exposed diagnostics, unsigned payment webhooks, schema drift, realtime refresh mismatch, UI-only bot pause, settings secret rehydration, red lint, secret-like docs, and dependency audit vulnerabilities.
**Impact**: Razorpay payment webhooks now require tenant-specific valid signatures; public chat diagnostics are removed; bot pause is persisted and enforced server-side; label broadcasts can insert campaign rows; settings reads no longer return Razorpay secrets; frontend lint/build and dependency audits are green. Vite was upgraded to 8 and local embeddings now import from `@huggingface/transformers`.
**Files Changed**:
- `backend/package.json`
- `backend/package-lock.json`
- `backend/src/app.js`
- `backend/src/database.js`
- `backend/src/routes/tenant-settings.js`
- `backend/src/routes/whatsapp-chat.js`
- `backend/src/services/smartResponder.js`
- `backend/src/utils/security.js`
- `backend/src/utils/settings-security.js`
- `backend/test/regression.test.js`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/eslint.config.js`
- `frontend/vite.config.js`
- `frontend/src/components/Catalogue.jsx`
- `frontend/src/components/Contacts.jsx`
- `frontend/src/components/KnowledgeBase.jsx`
- `frontend/src/components/Orders.jsx`
- `frontend/src/components/Overview.jsx`
- `frontend/src/components/WhatsAppBroadcast.jsx`
- `frontend/src/components/WhatsAppChat.jsx`
- `frontend/src/stores/store.js`
- `frontend/src/utils/helpers.js`
- `knowledge-base/DEPLOYMENT.md`
- `knowledge-base/README.md`
- `knowledge-base/active-context.md`
- `knowledge-base/changelog.md`
- `knowledge-base/decisions.md`
- `knowledge-base/known-issues.md`
- `knowledge-base/security.md`
- `knowledge-base/testing.md`
**Tests**: PASS - `npm test` from `backend/` (8 tests); PASS - backend `node --check` across `backend/src/**/*.js`; PASS - `npm run lint` from `frontend/`; PASS - `npm run build` from `frontend/`; PASS - `npm audit --audit-level=high` from both `frontend/` and `backend/`; PASS - targeted `rg` secret-pattern scan returned no matches.
**Commit**: Not available

- Removed the public `/api/v1/debug/chat-status` endpoint.
- Added Razorpay webhook HMAC verification against tenant settings before paid-order updates, and tenant-scoped pending-order lookup/update.
- Added persisted `bot_paused` conversation state, a backend pause endpoint, frontend store support, and webhook auto-reply enforcement.
- Added helper utilities for raw-body signature verification, JSON parsing, client-safe settings masking, and blank-secret preservation.
- Fixed Vite 8 `manualChunks` compatibility by converting the object map to a function.
- Added `knowledge-base/security.md` to document webhook, tenant, secret, bot-pause, dependency-audit, and secret-scan conventions.

---

## 2026-06-16 - Detailed Code Review Findings Documentation
**What**: Documented review findings in the knowledge base and added a testing guide for the current verification commands and test gaps.
**Why**: The review found open security, data integrity, realtime chat, bot pause, secret masking, and lint issues that need to be visible to future sessions.
**Impact**: Documentation only. Product behavior is unchanged.
**Files Changed**:
- `knowledge-base/known-issues.md`
- `knowledge-base/active-context.md`
- `knowledge-base/testing.md`
- `knowledge-base/README.md`
- `knowledge-base/changelog.md`
**Tests**: Before documentation updates, `npm run build` in `frontend/` passed; backend `node --check` across `backend/src/**/*.js` passed; `npm run lint` in `frontend/` failed with 11 errors and 37 warnings.
**Commit**: Not available

- Added open issues for the public debug endpoint, unsigned Razorpay webhook, deployment-doc secrets, label broadcast enum mismatch, realtime event key mismatch, UI-only bot pause, settings secret rehydration, and red frontend lint gate.
- Added `testing.md` because no automated test framework exists yet, but build/lint/syntax verification commands are now part of the project handoff.

---

## 2026-06-16 — Feature: Local Image Uploads for Products
**What**: Added an image file upload feature to the "Add/Edit Product" modal in the Catalogue dashboard.
**Why**: Users previously had to paste an existing URL for a product image. Now they can directly upload local image files which are saved and served statically from the backend.
**Files Changed**:
- `backend/src/routes/products.js`: Added `POST /upload-image` endpoint utilizing `multer` with disk storage in `uploads` folder.
- `backend/src/app.js`: Added static file serving (`app.use('/uploads')`) for public access to uploaded images.
- `frontend/src/components/Catalogue.jsx`: Implemented file input, `uploadingImage` state, and `handleImageUpload` function to send `FormData` directly to the new API and auto-fill the URL field.

---

## 2026-06-16 — Sync: Pulled Latest Code
**What**: Executed `git pull origin main` to fetch and accept all incoming changes from the remote repository.
**Why**: User request to sync the local codebase with the remote repository.
**Files Changed**: Multiple backend and frontend files were updated via fast-forward.
**Commit**: `a29bc62`

---

## 2026-06-16 — Fix: Labels Persistence, Auto-Create Contacts, Broadcast Label Filtering
**What**: Three interconnected fixes:
1. Labels now persist on BOTH `whatsapp_conversations.labels` AND `contacts.labels` (synced via PATCH endpoint)
2. New WhatsApp messages auto-create a contact if one doesn't exist for that phone (source='whatsapp')
3. Broadcasts can filter by label — "By Label" button sends `recipientType: 'labeled'` with `recipientFilter: { label: 'vip' }`
**Why**: Labels weren't persisting because the store only updated `activeConversation` but not the conversations list. Labels on conversations alone couldn't be used in broadcasts (which target contacts). New customers messaging on WhatsApp weren't being saved to contacts.
**Impact**: Labels are now the shared taxonomy between Chat, Contacts, and Broadcast. Every WhatsApp customer auto-gets a contact record.
**Files Changed**:
- `backend/src/database.js`: Migration to add `labels` JSON column to `contacts` table
- `backend/src/app.js`: Auto-create contact on new WhatsApp message (INSERT INTO contacts with source='whatsapp')
- `backend/src/routes/whatsapp-chat.js`: Labels PATCH syncs to linked contact via contact_id
- `backend/src/routes/whatsapp.js`: New `recipientType: 'labeled'` filter using `JSON_CONTAINS(labels, ?)`
- `frontend/src/stores/store.js`: Fixed `updateConversationLabels` to update both activeConversation AND conversations list
- `frontend/src/components/WhatsAppChat.jsx`: Fixed `getConvLabels` to handle both array and string types
- `frontend/src/components/WhatsAppBroadcast.jsx`: Added "By Label" button + label dropdown selector
- `frontend/src/components/Contacts.jsx`: Shows label badges alongside tags in contacts table
**Tests**: Frontend builds successfully (71 modules, 0 errors).

## 2026-06-16 — Feature: Load Older Messages (Cursor Pagination)
**What**: Chat messages now load via cursor-based pagination. A "Load Older Messages" button appears when there are more messages.
**Why**: Previously only the latest 100 messages loaded. Long conversations were truncated with no way to see history.
**Impact**: Backend messages endpoint changed from page/offset to `before_id` cursor. Store adds `fetchOlderMessages` and `chatHasMore` state.
**Files Changed**:
- `backend/src/routes/whatsapp-chat.js`: Rewrote messages endpoint with `before_id` cursor, `has_more` flag, fetches latest N by default.
- `frontend/src/stores/store.js`: Added `fetchOlderMessages`, `chatHasMore` state.
- `frontend/src/components/WhatsAppChat.jsx`: Added "↑ Load Older Messages" button at top of messages area.
**Tests**: Frontend builds successfully.

## 2026-06-16 — Feature: Conversation Labels
**What**: 6 color-coded labels (VIP, Follow Up, Complaint, New Order, Pending Payment, Resolved) that can be toggled per conversation via a tag icon dropdown.
**Why**: SMBs need to categorize conversations for prioritization and follow-up tracking.
**Impact**: New `labels` JSON column on `whatsapp_conversations` table. Labels show as colored dots in sidebar and badges in chat header.
**Files Changed**:
- `backend/src/database.js`: Migration to add `labels` JSON column.
- `backend/src/routes/whatsapp-chat.js`: New `PATCH /conversations/:id/labels` endpoint.
- `frontend/src/stores/store.js`: Added `updateConversationLabels` method.
- `frontend/src/components/WhatsAppChat.jsx`: Label picker dropdown, label badges below header, label dots in conversation list.
**Tests**: Frontend builds successfully.

## 2026-06-16 — Feature: Knowledge Base Test Bot
**What**: Collapsible "🧪 Test Your Bot" panel on the Knowledge Base page. Type a customer question → see the bot's matched answer with confidence scores for all top matches.
**Why**: SMBs had no way to verify their FAQ entries were matching correctly without sending real WhatsApp messages.
**Impact**: New `POST /api/v1/knowledge-base/test` endpoint runs cosine similarity against all active FAQs.
**Files Changed**:
- `backend/src/routes/knowledge-base.js`: Added `/test` POST endpoint with local cosineSimilarity function.
- `frontend/src/components/KnowledgeBase.jsx`: Added test bot state, UI panel with input, results display with match scores.
**Tests**: Frontend builds successfully.

## 2026-06-16 — Feature: Orders Overhaul (Phase 1)
**What**: Complete rewrite of Orders page — backend and frontend — with search, filters, sorting, stats, export, bulk actions, and notes.
**Why**: The orders page was a raw data dump. SMBs processing 50+ daily orders need search, date filters, bulk status updates, and CSV export for accounting.
**Impact**: Orders page is now a fully functional order management system.
**Files Changed**:
- `backend/src/routes/orders.js`: Added search, sort_by/sort_order, date_from/date_to params, `/stats` endpoint, `/export` CSV endpoint, `/bulk/status` bulk update, notes in PATCH, input validation.
- `frontend/src/components/Orders.jsx`: Complete rewrite with stat cards, debounced search, payment/fulfillment/date filters, date presets, sortable column headers, checkbox selection, bulk actions bar, CSV export button, editable order notes, improved pagination with page size selector.
**Tests**: Frontend builds successfully (71 modules, 0 errors).

## 2026-06-16 — Feature: Analytics Dashboard
**What**: Added Overview dashboard as the default landing page with custom SVG charts (zero new dependencies).
**Why**: SMBs need an at-a-glance view of revenue, orders, contacts, campaigns, and conversations.
**Files Changed**:
- `backend/src/routes/analytics.js` (NEW): Dashboard metrics API.
- `frontend/src/components/Overview.jsx` (NEW): Custom AreaChart, BarChart, DonutChart components.
- `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`: Wired in as default view.
**Tests**: Frontend builds successfully.

## 2026-06-16 — Feature: Contacts Overhaul
**What**: Complete rewrite of Contacts page with tag/location filter dropdowns, sortable columns, server-side pagination, CSV export, bulk delete, and quick-chat button.
**Why**: Contacts page had no filters, no pagination UI, and no export despite the backend already supporting tags/location filtering.
**Impact**: Contacts are now fully manageable for SMBs with 100s-1000s of contacts.
**Files Changed**:
- `backend/src/routes/contacts.js`: Added sorting (sort_by/sort_order), CSV export endpoint, moved static routes (`/tags/list`, `/locations/list`, `/export`) before `/:id`.
- `frontend/src/components/Contacts.jsx`: Complete rewrite with tag/location filter dropdowns, sortable columns (name, location, ticket_size), pagination with page size selector, CSV export, checkbox selection, bulk delete, WhatsApp quick-chat button.
- `frontend/src/stores/store.js`: Updated `fetchContacts` to pass sort_by, sort_order, location, and limit params.
**Tests**: Frontend builds successfully (71 modules, 0 errors).

## 2026-06-16 — Feature: Catalogue Search, Sort & Filter
**What**: Added client-side search, category filter, and sort options to the product catalogue page.
**Why**: SMBs with 50+ products couldn't find anything without scrolling. Search by name/SKU and sort by price/name makes product management much faster.
**Files Changed**:
- `frontend/src/components/Catalogue.jsx`: Added search input, category filter dropdown, sort selector (newest, name, price), product count.
**Tests**: Frontend builds successfully.

## 2026-06-16 — Feature: Chat Inbox — Quick Replies & Bot Pause
**What**: Added a `/` slash-command quick replies system and per-conversation bot pause toggle to the chat inbox.
**Why**: SMBs answering 50+ chats daily need canned responses. Typing `/` shows a popup of saved replies that can be clicked to insert. Bot pause lets the human agent take over a conversation without the AI bot interfering.
**Files Changed**:
- `frontend/src/components/WhatsAppChat.jsx`: Quick replies state/logic, `/` trigger popup, manage quick replies modal (⚡ icon), bot pause toggle with visual indicator.
- `frontend/src/components/Icons.jsx`: Added `pause`, `play`, `zap` icons.
**Tests**: Frontend builds successfully.

## 2026-06-15 — Feature: Order Management System (OMS) Frontend Dashboard
**What**: Created a fully featured Orders Dashboard and auto-payment settings configuration screen on the frontend.
**Why**: Allows merchants to view orders placed via WhatsApp in a tabular format, filter by payment and fulfillment statuses, view granular line items and customer info, update statuses, and configure auto-payment links for automatic replies.
**Files Changed**:
- `frontend/src/components/Orders.jsx`: Created new Orders page with status filters, detail modals, and status update controls.
- `frontend/src/components/Sidebar.jsx`: Integrated the Orders link into navigation.
- `frontend/src/App.jsx`: Added routing and rendering switcher for the Orders view.
- `frontend/src/components/Settings.jsx`: Integrated state variables and UI fields for the Auto-Payment Link and dynamic template configuration in chatbot settings.
**Tests**: Verified that the frontend builds successfully without any errors.

## 2026-06-15 — Feature: WhatsApp Text Formatting in UI
**What**: Added support for rendering WhatsApp-style markdown (bold, italic, strikethrough, monospace) in the Chat Inbox.
**Why**: When users or customers sent messages with WhatsApp formatting like `*bold*` or `_italic_`, the platform displayed the raw symbols instead of actual formatted text. This update adds a robust regex parser that converts WhatsApp markdown into safe HTML elements, perfectly mimicking the native WhatsApp visual experience.
**Files Changed**: `frontend/src/components/WhatsAppChat.jsx`
- Created `formatWhatsAppText()` utility to safely escape HTML and apply `<strong>`, `<em>`, `<del>`, and `<code>` tags.
- Applied `dangerouslySetInnerHTML` to message and template body containers.

## 2026-06-15 — Feature: WhatsApp Order Message Parsing & Images
**What**: Added parsing, product images, and rich-text formatting for incoming WhatsApp Cart/Order messages.
**Why**: When a customer added a product from the WhatsApp Catalog to their cart and sent it, the webhook received a message of type `order`, but the backend only saved `[order]` as plain text. This update unpacks the Meta `order` payload, queries the `products` table using the SKU/retailer ID to get the actual product names and image URL, and saves a beautifully formatted order summary (with quantities, total price, and the product image) so it's fully readable in the Chat Inbox.
**Files Changed**: `backend/src/app.js`, `frontend/src/components/WhatsAppChat.jsx`
- Replaced the default `[order]` fallback in the webhook with a loop that parses `product_items` and computes totals.
- Extracted `image_url` from the database and saved it into the `media_id` field.
- Updated `WhatsAppChat.jsx` to natively render product images when `message_type === 'order'`.
- Added `whiteSpace: 'pre-wrap'` to the chat body text so that the formatted newlines actually render as line breaks in the UI.

## 2026-06-15 — Fix: Enhanced Meta API Error Visibility
**What**: Improved the error handling for Meta API integrations to capture and forward detailed error metadata directly to the frontend toast notifications.
**Why**: When users encountered "Authorization Error" (e.g. from a restricted or unlinked WhatsApp Business Account), the backend was masking the actual reason because it only looked at the top-level error message instead of parsing `error_user_title`, `error_user_msg`, and `error_data.details`. This fix ensures users know exactly *why* a message failed to send.
**Files Changed**: `backend/src/services/whatsapp.js`
- Added a new global `formatMetaError` utility to extract granular error details from the Meta Graph API response payloads.
- Replaced all raw `data.error?.message` generic throw calls with the detailed formatting helper.

## 2026-06-15 — Fix: WhatsApp Catalog India Compliance Fields
**What**: Added `manufacturer_info` to the Meta Commerce API product sync payload.
**Why**: Products were syncing to the Meta Catalog but failing to display in the WhatsApp Business Catalog in India because Meta compliance rules require both `origin_country` and `manufacturer_info` for India catalogs.
**Files Changed**: `backend/src/services/whatsapp.js`
**Tests**: Verified payload construction.
- Appended `manufacturer_info: tenant.name || 'Manufacturer'` to the `PRODUCT_ITEM` payload in `syncProductToMeta`.

## 2026-06-15 — Fix: Meta Commerce Catalog SKU Match Rate & Deletion Sync
**What**: Removed `PROD-` prefix from Meta Catalog product ID sync, clarified SKU label, and fixed product deletion synchronization.
**Why**: 
- **Match Rate**: Meta Pixel tracks events using the website's native product ID or SKU. The `PROD-` prefix was causing a "Products not matching ad events" error because `PROD-123` doesn't match the pixel's `123`.
- **Deletion**: Deleting products locally did not actually delete them from the Meta Catalog because the Graph API batch payload was missing the required `item_type: 'PRODUCT_ITEM'` field, and errors were silently ignored.
**Files Changed**: `backend/src/services/whatsapp.js`, `frontend/src/components/Catalogue.jsx`, `backend/src/routes/products.js`
**Tests**: Verified syntax and logic changes.
- Changed fallback product ID in `syncProductToMeta` from `` `PROD-${product.id}` `` to `String(product.id)`.
- Updated the SKU label in the Catalogue component to explicitly remind users it must match the "Meta Pixel Content ID".
- Added `item_type: 'PRODUCT_ITEM'` to `deleteProductFromMeta` and configured the route to bubble up Meta deletion errors as toast warnings in the frontend.

## 2026-06-12 — Frontend Optimizations: WebSockets & FAQ Editing UI
**What**: Implemented `socket.io-client` in the React frontend for real-time chat updates, removing the old HTTP polling system. Added UI capabilities to edit existing FAQs in the Knowledge Base dashboard.
**Why**: Completes the frontend counterpart to the backend real-time and semantic search improvements. Polling was inefficient, and FAQ editing is a better user experience than deleting/re-creating.
**Impact**: Chat updates immediately without delay. Less backend load from polling. Users can now edit FAQs with a dedicated UI that triggers backend vector re-calculation.
**Files Changed**: `frontend/package.json`, `frontend/src/App.jsx`, `frontend/src/stores/store.js`, `frontend/src/components/WhatsAppChat.jsx`, `frontend/src/components/KnowledgeBase.jsx`, `backend/src/services/websocket.js`
**Tests**: Verified Socket.io connection initializes upon login, handles disconnects upon logout, and chat polling is removed. Verified the FAQ edit form submits `PUT` requests successfully.

- Installed `socket.io-client`.
- Added `initSocket()` to the Zustand `store.js` that triggers on `isAuthenticated` in `App.jsx`.
- Cleaned up `pollRef` and `setInterval` logic from `WhatsAppChat.jsx`.
- Extended `KnowledgeBase.jsx` form to handle `PUT` requests when an `editingId` is active, and added an edit button to the active FAQs list.
- Configured Socket.io to use the `/api/socket.io` path to ensure compatibility with existing Nginx proxy configurations on the VPS.

---

## 2026-06-12 — Backend Optimizations: WebSockets, NLP Pre-warming, & FAQ Editing
**What**: Implemented Socket.io for real-time chat updates, pre-warmed local NLP models, improved tenant cache invalidation, and added FAQ editing support.
**Why**: Ensures the frontend chat inbox updates instantly without polling, improves first-reply speed of the NLP model, fixes cache collision risks, and allows users to edit FAQs without deleting and recreating them.
**Impact**: Chat updates are now event-driven and immediate. Local NLP model responses are faster. FAQ edits now correctly recalculate and store semantic vector embeddings.
**Files Changed**: `backend/package.json`, `backend/src/server.js`, `backend/src/app.js`, `backend/src/database.js`, `backend/src/services/smartResponder.js`, `backend/src/services/websocket.js`, `backend/src/routes/whatsapp-chat.js`, `backend/src/routes/knowledge-base.js`
**Tests**: Verified Socket.io connection and authentication locally. Verified `initModel` executes without errors. Verified `PUT` updates successfully recalculate embeddings.

- Installed `socket.io` and created `websocket.js` for JWT-authenticated real-time events.
- Integrated `initWebSocket` and NLP `initModel` into `server.js` startup lifecycle.
- Replaced HTTP polling reliance by emitting `chat_updated` via `emitToTenant` in webhooks and API routes.
- Modified `getTenantBySlug` to perform DB fallback on cache miss and improved `invalidateTenantCache` for granular invalidation.
- Updated `PUT /api/v1/knowledge-base/:id` to accept question/answer edits and re-calculate the `question_vector`.

## 2026-06-12 — Remove Google Gemini / OpenAI SDK and Finalize Local NLP Model Chatbot
**What**: Removed unused OpenAI SDK and Google Gemini API integration files and package dependencies.
**Why**: Pivoted to using the pure local semantic NLP model (`smartResponder.js`) running on the CPU using `@xenova/transformers`.
**Impact**: Removed third-party dependency `openai` and deprecated unused code, making the app fully self-contained.
**Files Changed**: `backend/package.json`, `backend/package-lock.json`, `backend/src/services/openai.js`, `knowledge-base/decisions.md`
**Tests**: Verified backend starts up cleanly and local NLP model remains fully operational.

- Deleted `backend/src/services/openai.js`.
- Uninstalled `openai` package and updated `package-lock.json`.
- Updated decisions documentation to reflect deprecation of Gemini API in favor of the local CPU-bound semantic NLP model.

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
