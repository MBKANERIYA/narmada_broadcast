## Current Status
**Last Updated**: 2026-07-02
**Last Agent Session**: Fixed duplicate Chat Inbox resolve actions on branch `codex/chat-inbox-single-resolve-action` and opened PR https://github.com/MBKANERIYA/narmada_broadcast/pull/6; handoff conversations now use only Resolve Handoff for feedback, while generic Resolve Chat is limited to non-handoff paused support chats.
**Test Suite Status**: PASS - `cd backend && npm test` (25 tests); PASS - backend `node --check` sweep; PASS - `cd frontend && npm run lint` (10 warnings, 0 errors); PASS - `cd frontend && npm run build`; PASS - `npm audit --audit-level=high` in both `backend/` and `frontend/`; PASS - `git diff --check`.

## In Progress
- [ ] Have the upstream owner merge PR https://github.com/MBKANERIYA/narmada_broadcast/pull/6, then let Vercel redeploy from `main`.
- [ ] Smoke-test Chat Inbox filters on the live Vercel URL: All, Unread, Paid orders, Unpaid orders, Abandoned carts, Needs human, filter counts, and conversation chips.
- [ ] Smoke-test Chat Inbox handoff state on the live Vercel URL: a `needs_human + bot_paused` conversation should show Needs Human/Resolve Handoff but not the green Resolve Chat button, and resolving should send one feedback request.
- [ ] Confirm Vercel production env vars still include `MONGO_URI` and `JWT_SECRET`.

## Blocked On
- GitHub push permission - `shivanshu407` has read-only access to `MBKANERIYA/narmada_broadcast`, so updates are pushed to the fork and opened through a PR.
- Vercel/MongoDB setup is manual: the code cannot create the client's Atlas database or set Vercel env vars from this local checkout.

## Decisions Needed
- None for this change; SQL commerce filters were ported to Mongo order state for the single-client fork.

## Next Steps (for the next agent session)
1. Check whether PR https://github.com/MBKANERIYA/narmada_broadcast/pull/6 is merged into `MBKANERIYA/narmada_broadcast:main`.
2. Check the Vercel deployment status after `main` updates.
3. Log in on `https://narmada-broadcast-8vox.vercel.app/` and verify Settings -> Automation & Hours, Knowledge Base, Test Your Bot, Chat Inbox timestamps, Resolve Handoff, teach-from-chat, the commerce filters, and the single resolve action.
4. Rotate/delete the previously exposed Atlas user from the old hardcoded URI if that manual cleanup has not already been completed.

## Do Not Touch
- Do not reintroduce hardcoded MongoDB credentials or point this fork at the original SaaS database.
- Do not restore external AI provider requirements; Smart Automation is local with lexical fallback.
- Do not convert this into a tenant-seat SaaS deployment unless the client requirement changes.
