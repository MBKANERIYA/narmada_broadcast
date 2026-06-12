# Known Issues

A registry of active bugs, limitations, and workarounds.

## ISSUE-001: MySQL LIMIT/OFFSET Prepared Statement Failures
**Status**: Resolved
**Severity**: High
**Discovered**: 2026-04-11
**Resolved**: 2026-04-11
**Symptom**: Contacts and Chat Inbox endpoints fail with `ER_WRONG_ARGUMENTS` when trying to fetch paginated datasets.
**Root Cause**: Node.js `mysql2` `pool.execute()` creates prepared statements on the MySQL server, which does not allow placeholders `?` in `LIMIT` and `OFFSET` clauses.
**Workaround**: None needed.
**Fix**: Inline parsed integer variables into the query strings directly.

## ISSUE-002: Smart FAQs Layout Misalignment
**Status**: Open
**Severity**: Medium
**Discovered**: 2026-06-12
**Resolved**: 
**Symptom**: In the Smart Knowledge Base view, the "Add New FAQ" form layout is misaligned. Labels are placed inline next to input fields, inputs are squished, textareas overlap, and buttons float awkwardly.
**Root Cause**: The component uses generic `<div>` wrappers instead of `<div className="form-group">`, and does not follow the flexbox structure defined in `main.css`.
**Workaround**: Users can still interact with the form, but it looks unprofessional.
**Fix**: Overhaul the form and FAQ cards styling in `KnowledgeBase.jsx` to use proper layout groups and premium UI.
