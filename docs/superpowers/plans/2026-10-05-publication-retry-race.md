# Publication retry race implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox tracking.

**Goal:** A delayed retry must never resurrect a superseded or terminal publication.
**Architecture:** Preserve the shared retry helper used by tick and BullMQ. Serialize retry and reconciliation with owner → Post → history locks. Reconciliation atomically cancels superseded FAILED/TEMPORARY history and emits queue removal; retry checks durable state, never timestamp chronology.
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
Files: tests/publication-retry-race.integration.test.ts; lib/server/scheduler/retry.ts; lib/server/publications.ts; bounded verification report.
Consumes: prepareTemporaryPublicationRetry(id, limit, delays, providerDelay?, now?). Produces: unchanged scheduled/delay result.
- [x] Original native RED: real processor TEMPORARY rejection → updatePost → stale retry → tick delivered Edited twice; actual CI, no setup failures.
- [x] Independent equal-timestamp regression retained at 4adb69d; owner authorized bounded correction, no merge/deploy.
- [x] Push cancellation/queue/protected-outcome controls before runtime correction; verify native RED.
- [x] Cancel superseded FAILED/TEMPORARY atomically during reconciliation, retain error history, emit queue removal, lock standalone reconciliation in the same order. Remove timestamp heuristic from locked retry.
- [x] Run targeted20/20 and full native466/466, migrations/typecheck/lint/build, Docker worker/private media/persistence/recovery at975e11a.
- [x] Independent whole-branch review: no remaining actionable runtime issue; clean bounded5-file diff, implementation pushed and actual CI inspected. Final report-head CI must pass before ready transition; merge/deploy remain owner gates. Further audits stay separate.

Self-review: one lifecycle root, existing reconciliation and shared retry, no new API/schema. Controls cover retry-first, edit-first, same timestamp, inactive targets, other-target history, protected outcomes, Redis failure/stale delivery, repeated preparation/restoration and deadline preservation. Native CI is required; local missing database is not evidence of a product regression.
