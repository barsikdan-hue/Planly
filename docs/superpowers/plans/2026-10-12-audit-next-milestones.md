# Planly audit follow-up tasks and cleanup dry-run plan

> **For agentic workers:** use superpowers:executing-plans for an owner-approved task; systematic-debugging before fixes and verification-before-completion before claims. This preparation authorizes no implementation or production mutation.

**Goal:** close independent cleanup, Swipe, reliability and Telegram analytics work without combining architecture changes.

**Architecture:** reuse current Post/Library/publication/storage/recovery paths. PostgreSQL is durable scheduling state; Redis is its job mirror; R2 removal requires independent reconciliation. Existing free scheduler and per-content approval remain.

**Tech Stack:** Next.js/React, PostgreSQL 17/Drizzle, BullMQ/Redis, private R2; existing Telegram/MAX connectors.

**Spec:** [Task 01 audit and evidence boundaries](../../verification/2026-10-12-production-audit.md), [cleanup code trace](../../verification/2026-10-12-cleanup-code-audit.md), [Swipe trace](../../verification/2026-10-12-swipe-inspection.md).

## Global constraints

- No production deletion/change, merge/deploy, env/secrets/infra mutation or provider publication without the applicable separate OWNER GATE.
- Preserve owner/accounts/auth, Telegram/MAX connections/credentials, scheduler configuration and functioning infrastructure.
- Preserve Library DELETED tombstones and scheduling receipts; do not delete social-network messages.
- VK/Instagram HOLD; AI newsroom separate; no second Swipe Planner or publishing engine.
- UNVERIFIED cardinalities block exact-count cleanup approval; read-only metadata is not permission for writes.

## Review focus

- A processor that already captured content can hand it off after Post DELETE without a lifecycle guard.
- Mixed published/uncertain and pending targets cannot use ordinary DRAFT cancellation.
- R2 failure after SQL deletion can be hidden behind HTTP 204 and lose metadata.
- Old Post pending-create/editor data can recreate content after deletion on explicit retry/save.
- Restart/different tab/device/tick can repopulate queues or recovery; one zero snapshot is insufficient.

## Task A — exact-count dry-run, then safe cleanup after OWNER GATE

Status: **BLOCKED / NOT APPROVED FOR EXECUTION**. Preparation only; safety repairs, if needed, get their own bounded contract before cleanup.

**Files:** inspect `db/schema.ts`, `lib/server/posts.ts`, `library-items.ts`, `media.ts`, `publications.ts`, `scheduler/{processor,queue,reconcile,tick,worker}.ts`, `components/planner/app.tsx`, `lib/client/{pending-creation,editor-recovery,library-creation-attempt,library-editor-recovery,scheduling-plan-recovery}.ts`. Source inventory: `docs/verification/2026-10-12-production-inventory.sql`. Later evidence: a new aggregate-only cleanup report; exact IDs/keys live in a private noncommitted manifest.

**Interfaces:** read-only SQL, safe `GET /api/posts` list (not bootstrap), normal full-body `PATCH /api/posts/{id}` with DRAFT, individual DELETE posts/library/media, existing `removePublicationJob(id)` under a later authorized operational context. There is no verified owner-wide pause or target-specific cancel API.

- [ ] Privately identify owner scope on an already authorized read-only production connection. Run aggregate SQL in one snapshot; require owner_matches=1 and zero ownership anomalies. Read Redis states without Worker creation or scripts that write. Safely list/head every owner R2 prefix page, privately compare key sets and sizes. Record recovery/pending key presence only across owner tabs/devices.
- [ ] Populate exact count manifest: Posts by status; targets by active/scheduled; Publications by status/retry; Library by status; links; Media/currently free/free-after-deletion; analytics/history; R2 bytes/objects/orphans/missing; queue states; recovery intents. Record receipts/tombstones/accounts/auth retained. Missing counts are STOP, not zero. Refresh pre-execution.
- [ ] Establish a reviewable barrier/drain covering HTTP ticks/bootstrap/immediate mutations, Redis workers and user uploads/retries. Preserve Scheduler settings/connections. Show no already-admitted provider call remains; zero SQL PUBLISHING alone is insufficient. For mixed terminal/open history, obtain separately approved minimal safety solution or operational mechanism; do not bypass locks with DELETE.
- [ ] In isolated fixtures, pin delete/handoff race, mixed-target cancellation, duplicate/stale job, restart reconciliation, lost-response retry, R2 delete failure/partial cleanup and pending-create recreation. Existing tests to extend only under separate implementation approval: `publication-processor.integration.test.ts`, `non-ready-publication.integration.test.ts`, `media.integration.test.ts`, `post-idempotency.integration.test.ts`, `scheduler-reconcile.integration.test.ts`. Failure must remain visible; no speculative fix or retries to hide it.
- [ ] Present exact aggregate dry-run, preservation invariants, required barrier/remediation and irreversible loss list to Owner. Obtain explicit cleanup authorization for that manifest; no broad bucket/DB/Redis purge.
- [ ] Execute the cleanup report's checkpointed sequence: quiesce/cancel/drain → scoped queue reconciliation → Post → Library → free Media → DB/Redis/R2 validation → owner recovery discard/reload and non-recreation proof. Reconcile ambiguous results by reading; stop on active handoff, 409, unknown membership, R2 failure or inconsistent preserved state.
- [ ] Re-run inventory; compare exact affected counts, zero owned content/links/jobs/objects, retained auth/accounts/receipts/tombstones and no new provider messages from cleanup. Unreachable device/storage is UNVERIFIED. Preserve required terminal history, never purge credentials or social messages.

**Irreversible consequences:** Post/target text and schedules, local publication receipts/history/provider IDs/analytics and ordinary Post creation dedupe are lost; Library and attachments removed; media metadata/private bytes removed; approved unsaved browser work discarded. Required scheduling receipts/Library tombstones survive. This audit supplies no recovery guarantee.

## Task B — minimal Swipe review UX fix, separate PR

Status: **READY FOR OWNER SCOPING; NOT IMPLEMENTED**.

**Files:** `app/globals.css` Swipe rule; inspect `components/planner/swipe-planner.tsx`. Keep existing component/callbacks. Add a focused real DOM/CSS acceptance test rather than merely asserting CSS strings; retain `tests/swipe-planner-{ui,app,recovery}.test.*`.

**Input:** `swipe-text` inherits two-line/44px generic card clipping. **Output:** the existing review surface exposes the complete text before approval with usable vertical scrolling and unchanged explicit decisions. Exact minimal layout/expand choice is agreed at task start.

- [ ] Reproduce with a long synthetic multi-paragraph draft on desktop/mobile in an isolated fixture; assert last paragraph is reachable/readable. This fails on baseline CSS.
- [ ] Scope the override/expand behavior within existing Swipe; no second planner or queue. Implement only after agreed bounded contract.
- [ ] Verify left reject/right approve; vertical touch scroll never chooses a decision; image/video controls don't intercept unintended swipes; keyboard/buttons readable/focusable; fast double decision submits once; stale preview and lost response preserve recovery.
- [ ] Run focused checks and required typecheck/lint/build; push separate PR and inspect native CI. Respect merge/deploy gate.
- [ ] After authorized delivery, verify production review visually using approved non-sendable content and a known-safe access method. Do not bootstrap existing due jobs without authorization. Provider send is not required for CSS acceptance.

## Task C — Reliability CR07 / CR08 / GAP01

Status: **INDEPENDENT DEFERRED TASKS; NOT STARTED**. Split into reviewable fixes/diagnosis, not one refactor.

**CR07:** `components/planner/app.tsx` scheduled poll and `updateAccount`. Write controlled same-owner poll-before-toggle/response-after-ack regression; prove latest acknowledged account state is preserved. Determine minimal revision/ordering guard after root cause proof; include owner departure boundaries; no account/provider configuration mutation in production tests.

**CR08:** `lib/server/media-validation.ts::webpDimensions`, `tests/media-validation.test.ts`. Use genuinely decodable VP8, VP8L, VP8X fixtures plus malformed/truncated/oversize cases; show valid simple WebP fails baseline, implement minimal correct bounded dimension parser, retain MIME/signature/safe-limit checks. No unrelated media architecture work.

**GAP01:** `lib/server/scheduler/processor.ts`, `worker.ts`, `retry.ts`, isolated `publication-processor.integration.test.ts`/`scheduler-worker.integration.test.ts`. Reproduce crash boundaries before claim, after claim before handoff, after handoff before DB acknowledgement, worker/tick overlap and restart. Label unknown delivery honestly and refuse blind resend. Diagnosis can conclude NOT PROVEN; no fix until evidence. Do not reinterpret all PUBLISHING as definitely sent or safe-to-retry.

- [ ] For each approved subtask: verify fresh baseline, controlled failing regression, FILE/FUNCTION/CONDITION trace; stop on architecture/product decision.
- [ ] Minimal fix only for proven defect; native PostgreSQL/Redis CI where locks/races matter; exact denominators and no skipped failure claims.
- [ ] Separate PR/evidence and Owner merge/deploy gate; no live send unless the Owner specifically approves the smallest affected-provider verification.

Cleanup C01–C05 are additional safety gaps; triage them explicitly for Task A rather than silently expanding CR07/CR08/GAP01.

## Task D — finish Telegram Analytics after separate Owner decision

Status: **HOLD / NOT STARTED**. Preserve existing MAX acceptance and publishing independently.

**Files:** inspect `lib/server/analytics/{telegram,repository,refresh,http}.ts`, `app/api/analytics/telegram/webhook/route.ts`, `db/schema.ts`, `tests/analytics-telegram*.test.ts`, `analytics-identity.test.ts`, `analytics-repository.integration.test.ts`, `docs/verification/2026-10-09-phase8-partial-acceptance-phase9-transition.md`.

- [ ] Owner explicitly resumes Telegram analytics; agree proof of legacy identity and handling of permanently removed cleanup publications. Never backfill fabricated zeros or revive deleted content.
- [ ] Read-only webhook/consumer inventory through separately authorized provider scope; identify legacy identity proof requirements. Do not overwrite an existing consumer or weaken owner/destination matching.
- [ ] Separately approve any webhook/env activation, identity backfill and one real reaction receipt. Keep secrets private and scope evidence to one approved scenario.
- [ ] Verify valid event updates exact publication, duplicate/out-of-order/deleted/mismatched-owner cases rejected; retain unknown coverage semantics. Independent native CI and production receipt evidence required for full Phase 8 acceptance.
- [ ] Report metric denominator/coverage honestly; no fresh publication is implicit in analytics completion, VK/Instagram stay HOLD.

No milestone above starts from this document alone. All current production data and infrastructure remain untouched.
