# Publication retry race implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox tracking.

**Goal:** A delayed retry must never resurrect a superseded or terminal publication.
**Architecture:** Preserve the shared retry helper used by tick and BullMQ. Serialize retry eligibility with existing Post mutation locks; reread current history before changing FAILED to QUEUED.
**Tech Stack:** TypeScript, Drizzle, native PostgreSQL, node:test.
**Spec:** Owner customer-ready campaign, 2026-10-05: root cause first, one bounded problem, duplicate-publication P0, no second pipeline, no merge/deploy.

## Global constraints
- PostgreSQL remains authoritative; preserve connector contract, schema, retry budget and provider deadlines.
- Existing owner → Post → publication lock order; no new infrastructure or provider messages.
- Fresh main baseline: 95f53b7, native CI 446/446, self-host successful.

## Review focus
- Editor wins during FAILED/retry gap: replacement is the only deliverable row.
- Retry wins before editor: reconciliation reuses the existing open row.
- Terminal receipt/ambiguous outcome must never become QUEUED.
- Repeated retry preparation must not shorten provider deadline.
- Draft/inactive/deleted targets cannot be reactivated by stale completion.

## Task 1: Serialize retry eligibility
Files: tests/publication-retry-race.integration.test.ts; lib/server/scheduler/retry.ts; new verification report.
Consumes: prepareTemporaryPublicationRetry(id, limit, delays, providerDelay?, now?). Produces: unchanged scheduled/delay result.
- [ ] Write native regression: real processor TEMPORARY rejection → updatePost → stale retry → tick. Assert exactly one successful delivery. Add unchanged/deadline/terminal/draft/repeated/concurrent controls.
- [ ] Push test-only draft PR; verify actual CI RED for invariant violations, not setup errors.
- [ ] In one transaction acquire existing owner/Post locks, lock/reread publication history, require FAILED TEMPORARY eligibility and active READY target without a replacement/unsafe receipt; conditionally queue original.
- [ ] Run targeted controls, full native suite, migrations/typecheck/lint/build, Docker worker/private media/persistence/recovery.
- [ ] Independent whole-branch review, clean diff, commit/push actual CI, owner gate. Continue independent audit tasks in fresh branches.

Self-review: one runtime root and one helper, no new API/schema. Tests assert actual delivery and durable state. Native CI is required; local missing database is not evidence of a product regression.
