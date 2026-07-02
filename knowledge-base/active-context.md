## Current Status
**Last Updated**: 2026-07-02
**Last Agent Session**: Fixed Meta catalogue price parsing so comma-grouped prices such as `3,499.00 INR` import as full rupee amounts instead of `3`, preventing wrong product prices in bot replies after the next Meta sync.
**Test Suite Status**: PASS - watched new backend regression fail before implementation; PASS - `cd backend && npm test` (30 tests); PASS - backend PowerShell `node --check` sweep across `backend/src/**/*.js`; PASS - `cd frontend && npm run lint` (10 warnings, 0 errors); PASS - `cd frontend && npm run build`; PASS - `npm audit --audit-level=high` in both `backend/` and `frontend/`; PASS - `git diff --check`.

## In Progress
- [ ] Verify the customer-side WhatsApp catalogue after Meta finishes async catalogue processing. If products still do not appear, check Meta Commerce Manager catalogue diagnostics and that the configured catalogue is attached to the WhatsApp account/phone storefront.
- [ ] Smoke-test live Vercel unknown-message behavior on `https://broadcast-gilt.vercel.app/`: send a nonsense customer text, confirm the bot asks "Sorry, I didn't understand..." with Yes/No buttons, tap No and verify no Needs Human state, then repeat and tap Yes to verify Needs Human appears.
- [ ] Smoke-test live Vercel support feedback on `https://broadcast-gilt.vercel.app/`: resolve a test chat, tap Good/Bad in WhatsApp, and verify the only bot response is "Thank you for your feedback."
- [ ] Smoke-test live Vercel Chat Inbox freshness on `https://broadcast-gilt.vercel.app/`: receive a new WhatsApp message and verify the conversation list/open thread update within about 5 seconds without refreshing.
- [ ] Smoke-test Chat Inbox filters on the live Vercel URL: All, Unread, Paid orders, Unpaid orders, Abandoned carts, Needs human, filter counts, and conversation chips.
- [ ] Smoke-test Chat Inbox handoff state on the live Vercel URL: a `needs_human + bot_paused` conversation should show Needs Human/Resolve Handoff but not the green Resolve Chat button, and resolving should send one feedback request.
- [ ] Confirm Vercel production env vars still include `MONGO_URI` and `JWT_SECRET`.
- [ ] After the price-parser fix is deployed, run `Sync from Meta` on the live Catalogue page to overwrite any already-corrupted local product prices.

## Blocked On
- None for GitHub writes: `shivanshu407` has write access to `naramadaessence/broadcast`; push deployment changes directly to `origin`.
- Vercel/MongoDB setup is manual: the code cannot create the client's Atlas database or set Vercel env vars from this local checkout.

## Decisions Needed
- None for this change.

## Next Steps (for the next agent session)
1. Run `git status --short --branch` and confirm local `main` tracks `origin/main` for `naramadaessence/broadcast`.
2. Deploy the price-parser fix, then run `Sync from Meta` on `https://broadcast-gilt.vercel.app/` so existing products with truncated prices are corrected in MongoDB.
3. Ask the client/user to refresh/check the WhatsApp customer catalogue. The live app already queued 27 products and then imported/queued 25 Meta products with 0 failures.
4. If customer WhatsApp still only shows the test product, inspect Meta Commerce Manager diagnostics and WhatsApp channel/catalog attachment for catalogue `***8512`.
5. Verify Settings -> Automation & Hours, Knowledge Base, Test Your Bot, Chat Inbox timestamps, Resolve Handoff, teach-from-chat, commerce filters, the single resolve action, support-feedback thank-you, inbox polling refresh, and unknown-message Yes/No handoff confirmation.
6. Rotate/delete the previously exposed Atlas user from the old hardcoded URI if that manual cleanup has not already been completed.

## Do Not Touch
- Do not reintroduce hardcoded MongoDB credentials or point this fork at the original SaaS database.
- Do not restore external AI provider requirements; Smart Automation is local with lexical fallback.
- Do not convert this into a tenant-seat SaaS deployment unless the client requirement changes.
