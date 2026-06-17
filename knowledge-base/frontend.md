# Frontend

## What This Subsystem Does
The frontend is a Preact + Vite single-page app for tenant staff. It presents the public landing/auth flow and the authenticated dashboard used for contacts, broadcasts, WhatsApp chat, catalogue management, orders, Smart FAQs, settings, and admin-only controls.

## How It Is Structured
| Path | Purpose |
|------|---------|
| `frontend/src/App.jsx` | Top-level routing between landing/auth and the authenticated app shell. |
| `frontend/src/components/Sidebar.jsx` | Primary navigation, tenant branding, unread badge, mobile drawer controls. |
| `frontend/src/stores/store.js` | Zustand auth/session state, current view, socket setup, API helper methods. |
| `frontend/src/styles/main.css` | Main design system, dashboard layout, responsive app shell, tables, cards, forms, chat, orders, auth. |
| `frontend/src/styles/landing.css` | Public landing page styling. |
| `frontend/vite.config.js` | Vite build setup and dev proxy configuration. |

## Conventions and Rules
- Authenticated users should land on `overview`, not a deep operational page.
- Tenant admins must not see the super-admin-only Admin Panel navigation item.
- Mobile navigation uses `app-layout.nav-open` plus `sidebar.sidebar--open`; both classes are part of the drawer contract.
- The desktop app shell uses a pinned sidebar and hides `.mobile-header`; phone/tablet widths show `.mobile-header` and slide the sidebar in from the left.
- Orders must render a desktop table and a separate `.orders-mobile-list` card view for small screens.
- Secret inputs in Settings should remain blank after loading existing settings; never rehydrate stored secrets into browser form state.
- Local browser QA against production data can run through Vite with `VITE_DEV_API_PROXY_TARGET=https://broadcast.innodify.in`.

## Known Gotchas
- The app is view-state driven, not URL-route driven. Navigation buttons update Zustand `currentView`.
- Browser QA must avoid sending WhatsApp messages, saving settings, deleting contacts/products, or uploading files unless the user explicitly asks for those side effects.
- Some chat and order controls are icon-only or plain clickable rows, so QA may need visible-DOM or coordinate clicks rather than role-only locators.
- `main.css` contains older baseline sections plus the newer polish layer; when changing layout, search for duplicate selectors before assuming one rule is authoritative.

## How It Is Tested
- Run `npm run lint` from `frontend/`.
- Run `npm run build` from `frontend/`.
- Run `npm test` from `backend/`; the regression suite includes static frontend contract checks for mobile drawer classes, admin nav visibility, Orders mobile cards, and Vite proxy configuration.
- Browser QA should cover desktop and 390px phone widths for Overview, Contacts, Broadcast, Chat Inbox, Catalogue, Orders, Smart FAQs, and Settings.

## Related KB Files
- `README.md` for project-wide quick facts and verification gates.
- `testing.md` for exact commands.
- `security.md` for secret masking and webhook requirements.
- `DEPLOYMENT.md` for VPS build and update commands.
