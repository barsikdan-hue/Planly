# Planly Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Milestone 2: a PostgreSQL-authoritative scheduler using Render Key Value/Redis + BullMQ + a dedicated worker, with durable delayed jobs, idempotency, bounded retries, duplicate protection, and restart recovery.

**Architecture:** PostgreSQL remains the source of truth. Saving/rescheduling a Post reconciles durable `Publication` rows first, then best-effort mirrors open publications into BullMQ using `publication.id` as the BullMQ `jobId`. A standalone worker reloads the Publication from PostgreSQL before every attempt. Periodic reconciliation repairs DB→Redis gaps after Redis outages or restarts. No real Telegram/MAX API call is added in this milestone; worker behavior is tested through an injected connector contract/fake connector. The first real connector is Milestone 3 Telegram.

**Tech Stack:** Next.js 16, TypeScript 5.9, PostgreSQL 17, Drizzle ORM, BullMQ, ioredis, Render Key Value/Redis, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-30-mvp-v1-design.md`

## Global Constraints

- PostgreSQL is authoritative; Redis is queue/retry coordination only.
- One PostTarget maps to an independent Publication stream; Telegram success must never be coupled to MAX failure.
- `PUBLISHED` is terminal and must never be automatically republished.
- Queue delivery is at-least-once; duplicate delivery must be harmless.
- No infinite retries. Initial retry schedule: approximately 1m, 5m, 15m, 60m.
- `TEMPORARY` retries; `AUTH` becomes `REQUIRES_RECONNECT` unless a connector explicitly refreshes; `VALIDATION` and `PERMANENT` do not retry.
- A worker crash after an external provider may have accepted a request but before remote-ID persistence is an ambiguous delivery. Because Telegram does not provide request idempotency, recovery must prefer **no duplicate**: stale `PUBLISHING` is not blindly resent and is surfaced with explicit diagnostics for manual review.
- Secrets stay server-side. Never log Redis URLs, provider tokens, cookies, passwords, or authorization headers.
- This milestone does **not** add Telegram/MAX provider calls, AI, analytics, billing, teams, roles, or unrelated UI redesign.

## Review Focus

1. Redis unavailable while a schedule is saved: PostgreSQL keeps the schedule and reconciliation later enqueues it without user data loss.
2. Duplicate BullMQ delivery: the second execution observes current PostgreSQL state and does not repeat an already-terminal Publication.
3. Worker crash around provider handoff: stale `PUBLISHING` never triggers a blind duplicate send.
4. Reschedule/cancel before execution: old delayed job cannot publish at the old time.
5. Retry exhaustion: TEMPORARY errors stop after the bounded sequence and end as `FAILED` with diagnostics.

---

### Task 1: Queue runtime and Redis configuration

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `lib/server/env.ts`
- Create: `lib/server/scheduler/redis.ts`
- Create: `lib/server/scheduler/queue.ts`
- Create: `tests/scheduler-queue.test.ts`

**Interfaces:**
- Produces: `getRedisConnection(): IORedis`
- Produces: `getPublicationQueue(): Queue<PublicationJob>`
- Produces: `enqueuePublication(publicationId: string, runAt: Date): Promise<void>`
- Produces: `removePublicationJob(publicationId: string): Promise<void>`
- Job payload: `{ publicationId: string }`; BullMQ `jobId` is exactly the Publication ID.

- [ ] **Step 1: Write failing queue tests** proving stable `jobId`, non-negative delay calculation, and no secrets exposed in configuration errors.
- [ ] **Step 2: Run `pnpm test`** and confirm the new tests fail because queue modules/dependencies do not exist.
- [ ] **Step 3: Add `bullmq` and `ioredis`; add required `REDIS_URL` server env validation; implement lazy Redis/Queue factories.** Do not connect at module import time so build/test imports remain deterministic.
- [ ] **Step 4: Implement enqueue/remove with `publicationId` as job ID** and delayed execution based on `runAt`; repeated enqueue for the same Publication must not create a second job.
- [ ] **Step 5: Run `pnpm typecheck && pnpm lint && pnpm test`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: add scheduler queue foundation`.

### Task 2: Preserve target identity and durable publication intent

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/<generated migration>`
- Modify: `lib/server/posts.ts`
- Create: `lib/server/publications.ts`
- Modify: `tests/db-schema.test.ts`
- Modify: `tests/posts.integration.test.ts`
- Create: `tests/publications.integration.test.ts`

**Interfaces:**
- Produces: `reconcilePostPublications(userId: string, postId: string): Promise<PublicationQueueChange[]>`
- `PublicationQueueChange` is `{ publicationId: string; action: 'enqueue' | 'remove'; runAt?: Date }`.
- PostTarget identity is preserved across ordinary edits for the same SocialAccount instead of delete/reinsert.

- [ ] **Step 1: Write failing integration tests** for repeated save preserving target ID, one open Publication per scheduled target, reschedule preserving idempotency intent, and target removal cancelling an unexecuted Publication.
- [ ] **Step 2: Run targeted tests** and confirm current delete/reinsert behavior fails the identity/history assertions.
- [ ] **Step 3: Add the minimal schema support needed to preserve target history** (including an internal active/inactive target marker if required by the implementation) and generate a migration. Existing Publication history must not be erased by an ordinary edit.
- [ ] **Step 4: Replace destructive target recreation in `updatePost()` with reconciliation keyed by owned SocialAccount.** `readOwnedPost()` exposes only active targets.
- [ ] **Step 5: Implement `reconcilePostPublications()` transactionally.** PostgreSQL changes happen before queue mirroring; repeated calls are idempotent.
- [ ] **Step 6: Run schema, posts, publications, then full tests.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: persist scheduler publication intent`.

### Task 3: Mirror PostgreSQL publication state into BullMQ

**Files:**
- Modify: `lib/server/posts.ts`
- Modify: `lib/server/publications.ts`
- Modify: `lib/server/scheduler/queue.ts`
- Create: `lib/server/scheduler/reconcile.ts`
- Create: `tests/scheduler-reconcile.integration.test.ts`

**Interfaces:**
- Produces: `applyPublicationQueueChanges(changes: PublicationQueueChange[]): Promise<void>`
- Produces: `reconcileScheduledJobs(now?: Date): Promise<{ scanned: number; enqueued: number }>`

- [ ] **Step 1: Write failing tests** proving: DB commit survives queue failure; later reconciliation enqueues the missing job; reschedule removes/replaces the old delayed time; cancelled publications are not re-enqueued.
- [ ] **Step 2: Run targeted tests** and confirm failure before implementation.
- [ ] **Step 3: After successful Post create/update transaction, perform best-effort queue mirroring.** Queue failure must not roll back the authoritative PostgreSQL schedule.
- [ ] **Step 4: Implement reconciliation scan** for open scheduled/queued Publications and ensure exactly one BullMQ job per Publication ID.
- [ ] **Step 5: Run targeted and full tests.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: reconcile scheduled publications to queue`.

### Task 4: Connector contract and publication processor

**Files:**
- Create: `lib/server/connectors/types.ts`
- Create: `lib/server/connectors/registry.ts`
- Create: `lib/server/scheduler/processor.ts`
- Create: `tests/publication-processor.integration.test.ts`

**Interfaces:**
- `SocialConnector.publish(input: PublishInput): Promise<PublishResult>`
- `PublishResult` success requires a non-empty provider remote ID before the DB can become `PUBLISHED`.
- Processor: `processPublication(publicationId: string, connectorResolver?: ConnectorResolver): Promise<ProcessResult>`.

- [ ] **Step 1: Write failing processor tests with fake connectors** for success, duplicate delivery after PUBLISHED, TEMPORARY error, AUTH error, VALIDATION error, PERMANENT error, and missing remote ID.
- [ ] **Step 2: Add a restart/ambiguity test:** a stale `PUBLISHING` Publication is not blindly sent again; it becomes an explicit no-auto-retry failure/diagnostic state according to the Global Constraints.
- [ ] **Step 3: Implement the minimal connector types and resolver contract.** Production resolver may report provider-not-implemented until Telegram milestone; tests inject fakes.
- [ ] **Step 4: Implement processor DB state transitions**: reload current row, skip terminal rows, claim attempt, increment attempt metadata, call connector, persist normalized result.
- [ ] **Step 5: Implement bounded error classification behavior** without provider-specific branching in scheduler code.
- [ ] **Step 6: Run targeted and full tests.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: add idempotent publication processor`.

### Task 5: BullMQ worker, retries, restart recovery

**Files:**
- Create: `worker/index.ts`
- Create: `lib/server/scheduler/worker.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `tests/scheduler-worker.integration.test.ts`

**Interfaces:**
- Worker entry command: `pnpm worker`
- Worker consumes `PublicationJob` and calls `processPublication()`.
- Reconciliation runs once at startup and periodically while worker is alive.

- [ ] **Step 1: Add Redis service to CI and write failing worker integration tests** for delayed job, duplicate job, restart-before-publish, TEMPORARY retries, and retry exhaustion.
- [ ] **Step 2: Implement BullMQ Worker with graceful shutdown.** SIGTERM/SIGINT must stop new work and close worker/queue/Redis cleanly.
- [ ] **Step 3: Configure bounded retry/backoff** approximating 1m, 5m, 15m, 60m while persisting attempt/nextRetryAt diagnostics in PostgreSQL.
- [ ] **Step 4: Start reconciliation on worker boot and on a modest interval** so Redis loss/restart is repaired from PostgreSQL without a separate microservice.
- [ ] **Step 5: Run the full scheduler test matrix, then `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: add publication worker and retry recovery`.

### Task 6: Publication status API/UI projection

**Files:**
- Modify: `lib/contracts/planner.ts`
- Modify: `lib/server/posts.ts`
- Modify: `lib/server/bootstrap.ts` or the actual bootstrap module used by `/api/bootstrap`
- Modify: `components/planner/*` only where current target/status UI requires data projection
- Modify: `tests/api-contract.test.ts`
- Modify: `tests/planly-api.test.ts`
- Add/modify focused planner tests for independent target status

**Interfaces:**
- Post/target DTO exposes its latest Publication status and safe human-readable failure reason without provider secrets.

- [ ] **Step 1: Write failing contract/UI tests** showing Telegram and MAX target statuses remain independent and demo/fake success is never shown.
- [ ] **Step 2: Project latest Publication state into existing DTO/bootstrap flow** without redesigning the dashboard.
- [ ] **Step 3: Render existing status UI from real Publication state.** Unsupported/not-yet-connected providers remain visibly disconnected.
- [ ] **Step 4: Run contract/UI tests and full verification.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: expose real publication status`.

### Task 7: Render Redis + worker deployment and production verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md` deployment section if needed
- Modify: `ROADMAP.md` to reflect actual completed Foundation/Content Core and current Scheduler milestone

**Interfaces:**
- Render Key Value in Frankfurt with `noeviction`.
- Planly web and worker receive the same `DATABASE_URL`, `REDIS_URL`, and required server-only storage/auth configuration; worker receives no browser/client secrets.

- [ ] **Step 1: Create Render Key Value/Redis in Frankfurt** only after the target workspace is explicitly confirmed; use `noeviction` and persistence supported by the chosen plan.
- [ ] **Step 2: Add `REDIS_URL` to Render environment without exposing it in chat/logs.**
- [ ] **Step 3: Create a Render background worker from the same repository/branch** using `pnpm worker`; do not create a second application architecture.
- [ ] **Step 4: Production smoke:** create a future scheduled Publication, confirm it exists in PostgreSQL and BullMQ, restart worker before due time, and verify the job remains/reappears. No real social API call is made in this milestone.
- [ ] **Step 5: Duplicate/retry smoke using the safe non-provider test path** and verify no duplicate terminal publication is produced.
- [ ] **Step 6: Update `ROADMAP.md` with `DONE / TESTED / KNOWN ISSUES / TECH DEBT / NEXT PHASE` based on evidence, not intentions.
- [ ] **Step 7: Run final `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, inspect Render web/worker logs for secrets/errors, and commit documentation.**

## Completion Gate

Milestone 2 is complete only when all of these are proven:

- schedule survives browser close and web-service restart;
- Redis outage does not erase PostgreSQL schedule intent;
- worker restart before due time does not lose the job;
- duplicate job delivery does not duplicate a terminal Publication;
- stale/ambiguous `PUBLISHING` is not blindly resent;
- retries are bounded and categorized;
- independent PostTargets keep independent Publication state;
- CI and production build are green;
- Render worker and Redis are healthy;
- no provider secrets or fake publication-success states exist.

**Next milestone after this plan:** Milestone 3 — Telegram production slice (`TelegramConnector`, real test channel, text/media publish, remote ID persistence, end-to-end verification).