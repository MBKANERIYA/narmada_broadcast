# Future Scope — Platform Improvements

> Last Updated: 2026-06-16
> Status: Documented for future implementation

This document captures all planned improvements identified during a full platform audit from an SMB WhatsApp commerce perspective.

---

## Phase 1: Orders Overhaul (HIGHEST PRIORITY)

The Orders page is currently a raw data dump with no search, filtering, sorting, or pagination.

| Feature | Status | Description |
|---------|--------|-------------|
| Search | Planned | Search by order #, phone, address |
| Filter: Payment Status | Planned | All / Paid / Pending / Failed |
| Filter: Fulfillment Status | Planned | All / Pending / Processing / Shipped / Delivered / Cancelled |
| Filter: Date Range | Planned | Today / This Week / This Month / Custom |
| Sort | Planned | By Date, Amount, Status (asc/desc) |
| Pagination | Planned | Page-based with page size selector (25/50/100) |
| Revenue Summary Cards | Planned | Total Revenue, Pending Payments, Orders Today, Avg Order Value |
| Export CSV | Planned | Download filtered orders as CSV for accounting/GST |
| Bulk Actions | Planned | Select multiple → Mark Shipped / Mark Delivered |
| Order Notes | Planned | Internal notes per order (DB column already exists) |

---

## Phase 2: Chat Inbox Polish

| Feature | Status | Description |
|---------|--------|-------------|
| Conversation Filters | Planned | Tabs: All / Unread / Has Orders / Needs Reply |
| Quick Replies | Planned | Saved canned responses for common messages |
| AI Pause Toggle | Planned | Per-conversation toggle to pause bot when human takes over |
| Load Older Messages | Planned | "Load More" button (currently only last 50 shown) |
| Conversation Tags/Labels | Planned | Tag conversations as VIP, Follow Up, Complaint, etc. |
| Assign to Team Member | Planned | Route conversations to specific employees |
| Internal Notes | Planned | Team-only notes on conversations |

---

## Phase 3: Catalogue & Contacts

### Catalogue
| Feature | Status | Description |
|---------|--------|-------------|
| Sort | Planned | By Name, Price, Date Added |
| Pagination | Planned | Page-based (currently loads all products at once) |
| Categories/Tags | Planned | Group products into categories |
| Stock/Inventory Count | Planned | Actual inventory numbers + low-stock alerts |
| Bulk Actions | Planned | Select multiple → delete, hide, update |
| Product Variants | Planned | Sizes, colors, etc. |

### Contacts
| Feature | Status | Description |
|---------|--------|-------------|
| Export CSV | Planned | Download contacts (import already exists) |
| Quick Chat Button | Planned | One-click open WhatsApp chat from contact row |
| Contact Activity Timeline | Planned | Unified view of orders, chats, campaigns per contact |
| Duplicate Detection | Planned | Warn on importing duplicate phone numbers |

---

## Phase 4: Broadcast & Knowledge Base

### Broadcast
| Feature | Status | Description |
|---------|--------|-------------|
| Campaign Scheduling | Planned | Schedule broadcasts for future date/time |
| Campaign Analytics | Planned | Delivery rate, read rate charts |
| Template Preview | Planned | Visual preview of template before sending |
| A/B Testing | Planned | Test two templates against segments |

### Knowledge Base
| Feature | Status | Description |
|---------|--------|-------------|
| Test Bot | Planned | Input field to test what the bot would reply |
| FAQ Categories | Planned | Group FAQs by topic |
| Bulk Import (CSV) | Planned | CSV import for FAQs |
| Usage Analytics | Planned | Track which FAQs are matched most often |

---

## Phase 5: Platform-Level Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| Generative AI (LLM) | Planned | Feed FAQ match + chat history into LLM for human-like responses |
| Secret Encryption | Planned | AES-256-GCM for Razorpay keys stored in DB |
| Human-Agent Handoff | Planned | Graceful AI → human transition in live chat |
