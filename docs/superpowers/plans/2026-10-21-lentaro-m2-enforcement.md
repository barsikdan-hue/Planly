# Lentaro M2 Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expired/unverified users cannot create commercial work or begin provider sends, while own reading, renewal and safe cancellation remain available.
**Architecture:** Reuse the user lifecycle lock and existing ownership checks; add transactional entitlement assertions and durable per-publication holds. New paid periods cannot erase holds or replay old publication intents.
**Tech Stack:** Existing PostgreSQL/Drizzle, scheduler/worker/reconciliation and private storage; no new queue or driver.
**Spec:** [Approved design§3,7–11](../specs/2026-10-21-lentaro-m2-commercial-design.md).

## Global Constraints

All [index constraints/interfaces/lock order](2026-10-21-lentaro-m2-index.md) apply. Depends on Plans1–2 exported verification/access functions. Enrollment/enforcement defaults OFF until explicit conversion; M2-active tests must prove every guard ON. Existing ambiguous sends remain ambiguous; no second sender, retries or timeout increases. Execute only after M1/plan gates.

## Review Focus

1. Direct service/helper paths bypass route/UI guard → no mutation without paid access (Task1).
2. Receipt lookup/replay after expiry → return historical result without new content (Task1).
3. Expiry during provider-control validation/media IO/lock wait → no handoff after final denial (Task2).
4. Restart/renewal/old Redis job → held publication never sends without explicit review (Task2).
5. Cancel/review/update/block races and ambiguous PUBLISHING → preserve original receipt and exactly one new future intent (Task3).

### Task 1: Guard the complete commercial mutation surface

**Files:** create `lib/server/billing/enforcement.ts`, `tests/billing-write-boundaries.integration.test.ts`; modify `lib/server/{posts,library-items,library-creation,library-batch,shared-library,shared-feed,media,scheduling-plan-preview,scheduling-plan-commit,profile,http}.ts`, `lib/server/social-connections/{service,lifecycle,http}.ts` and the actual matching routes below. Preserve existing specialized HTTP error wrappers.
**Interfaces:** `requireCommercialWrite(tx:Tx,userId:string,now:Date):Promise<void>` rechecks current user/verification/paid period under existing user lock and throws typed `BillingAccessError` with code `PAYMENT_REQUIRED` or `EMAIL_VERIFICATION_REQUIRED`; `withCommercialWrite<T>(userId:string,work:(tx:Tx)=>Promise<T>):Promise<T>` is for services lacking their own transaction only. HTTP mapping is402/403 with safe code, never401/session logout.

| Boundary | M2 rule | Existing files/routes to cover |
|---|---|---|
| Post/create/update/delete and personal Library/media mutation | Require paid; historical result replay first, no new mutation | `posts.ts`, `create-post-handler.ts`, `library-items.ts`, `library-creation.ts`, `media.ts`; `/api/posts`, `/api/library-items`, `/api/media` and `[id]` routes |
| Shared catalogue/feed GET and new copy/swipe | Require paid to read new editorial content or mutate; own decision receipt GET remains readable | `shared-library.ts`, `shared-feed.ts`; `/api/shared-library`, `/api/shared-library/copy`, `/api/shared-feed`, `/api/shared-feed/decisions` |
| Slots/batch/scheduling | New preview/commit paid; committed receipt GET/replay readable | `planner-slots.ts`, `library-batch.ts`, `scheduling-plan-{preview,commit}.ts`; `/api/planner-slots`, `/api/library/batch-consent/*`, `/api/scheduling-plans/*` |
| Other paid changes | Profile PATCH, new provider connect/enable/start/proof/confirm, analytics refresh and feedback POST require paid | `/api/profile`, `/api/social-accounts/[id]`, `/api/social-connections/*`, `/api/analytics/refresh`, `/api/swipe-feedback`; corresponding existing service modules |
| Safety/read exceptions | Own bootstrap/posts/media/history/analytics GET/feedback export/payment/auth remain readable; cancel approval, connection pause/release/disable remain possible | `/api/bootstrap`, own GET routes, `/api/posts/[id]/targets/[targetId]/cancel-approval`, connection lifecycle routes |
| Technical ADMIN | Existing ADMIN user/invite/shared-editorial administration stays role-checked; no private colleague reads or new global paid exemption | Existing `/api/admin/*` and legacy configured ADMIN owner behavior |

- [ ] Write a table-driven native test across EACH route/service row: paid A succeeds, expired A denies402, unverified A denies403, B/ADMIN-non-owner cannot touch A, blocked session still401. For every denial assert unchanged DB counts/rows, storage writes0, queue additions0 and connector calls0. Old owner/M1 flags-OFF controls retain prior behavior.
- [ ] Add replay tests after expiry for Post creation, Library creation, batch, scheduling-plan and shared-feed decision: existing same intent returns same ids or existing410 tombstone; it never inserts a second record. A changed request hash still409; no receipt-existence probe leaks another actor's data.
- [ ] Run RED: `node --test --test-concurrency=1 --experimental-strip-types tests/billing-write-boundaries.integration.test.ts`.
- [ ] Implement checks in the existing transaction after user lock, before new writes/side effects; recheck DB time before commit when slow copy/upload work intervenes. Do not nest a transaction behind an already held user lock. Media preflight occurs before storage put and final paid/identity validation before DB persistence; preserve existing owned-object cleanup on persistence failure. Billing errors must not be remapped to media422 or generic500. Add paid assertions to service seams, not only route wrappers. Record the final enumerated API/method list in the test so a new unclassified mutation is visible.
- [ ] GREEN plus existing posts, library, batch, shared-feed, cancellation and social lifecycle regressions; commit Task1. No live provider reads are introduced by the tests.

### Task 2: Persist expiry holds and enforce the last handoff boundary

**Files:** create `lib/server/billing/publication-holds.ts`, `tests/billing-handoff.integration.test.ts`, `tests/billing-hold-restart.integration.test.ts`; modify `db/schema.ts`, `lib/server/auth/access.ts`, `lib/server/social-connections/publication-authorization.ts`, `lib/server/scheduler/{processor,tick,reconcile,retry}.ts`; generate `drizzle/0019_m2_billing_holds.sql` and meta.
**Interfaces:** `readBillingHold(tx:Tx,publicationId:string):Promise<{held:boolean,reason:'ACCESS_EXPIRED'|'EMAIL_UNVERIFIED'|null}>`; `holdUnstartedPublication(tx:Tx,input:{publicationId:string,userId:string,claimedAttempt:number|null,reason:'ACCESS_EXPIRED'|'EMAIL_UNVERIFIED'}):Promise<boolean>`; same `requireCommercialWrite` in final lifecycle admission. A typed billing denial is distinct from existing null/AUTH denial.

- [ ] Write RED barriers using existing native lock-test style: entitlement expires while media/control awaits or user lock blocks → start callback0; valid admission starts once then expiry permits only that already-started result to settle. Paid renewal vs admission obeys user→entitlement→account order; block/revoke still wins according to existing admitted/not-admitted semantics.
- [ ] Add `publication_billing_holds` with publication PK, user FK, reason, original schedule/attempt provenance, heldAt and release/review receipt binding, plus `billing_hold_review_operations` with PK(userId,operationId), requestHash and immutable result receipt. Receipt old/new IDs are historical values rather than cascading content FKs, preserving replay/tombstones. Conditional updates may move only this freshly claimed and definitely unstarted PUBLISHING attempt back to SCHEDULED while atomically inserting hold; pre-existing PUBLISHING/AMBIGUOUS_DELIVERY and terminal receipts are untouched. Hold denial is not provider AUTH/PERMANENT failure.
- [ ] Run RED: `node --test --test-concurrency=1 --experimental-strip-types tests/billing-handoff.integration.test.ts tests/billing-hold-restart.integration.test.ts`.
- [ ] Integrate the paid check inside existing `beginOwnerProviderHandoff`/`beginVerifiedProviderHandoff` user-locked admission after external control validation and immediately before synchronous `start()`. Processor distinguishes denied-before-start from unknown-after-start. Poll/reconcile/retry filters exclude active holds, and direct processor re-entry checks holds independently of queue discovery. Worker shutdown and retry delays remain unchanged.
- [ ] Test restart and old duplicate Redis jobs with expired→renewed access: held ids remain held/calls0, own readable calendar exposes hold, unknown/terminal history unchanged. Test future unheld schedules resume only when still future and paid. Inspect generated SQL/drift on disposable DB; GREEN targeted scheduler regressions and commit Task2.

### Task 3: Allow explicit review and safe cancellation without replay

**Files:** create `lib/server/billing/hold-review.ts`, `app/api/billing/publications/[id]/review/route.ts`, `tests/billing-hold-review.integration.test.ts`; modify `lib/server/posts.ts`, `lib/server/post-update.ts` (new narrow extracted transaction seam), `lib/server/billing/publication-holds.ts`, `lib/contracts/{billing,planner}.ts`; use the Task2 review-operation schema without rewriting its committed migration.
**Interfaces:** export from `lib/contracts/billing.ts`: `ReviewHeldPublicationInput={operationId:string,publicationId:string,expectedPostUpdatedAt:string,newScheduledAt:string}` and `HoldReviewReceipt={operationId:string,oldPublicationId:string,newPublicationId:string,replayed:boolean}`. `reviewHeldPublication(request:Request,input:ReviewHeldPublicationInput):Promise<HoldReviewReceipt>`; `updatePostInTransaction(tx:Tx,userId:string,postId:string,input:SavePostInput,options:PostPersistenceOptions):Promise<{dto:PostDto,changes:PublicationQueueChange[]}>`. Export existing `PostPersistenceOptions` from `posts.ts` (type-only import); `PublicationQueueChange` is the existing export from `lib/server/publications.ts`. Export the small unchanged update body from `post-update.ts`; `updatePost` retains its current public signature and mirrors queue changes only after COMMIT.

- [ ] RED tests: unpaid cannot review; paid own current revision/future free slot creates one new intent; double/lost-response review returns same ids; changed revision/destination/occupied/past slot rejects without writes; A cannot review B; cancel vs review has one winning transition; uncertain/PUBLISHING/terminal old result refuses resend.
- [ ] Run `node --test --test-concurrency=1 --experimental-strip-types tests/billing-hold-review.integration.test.ts` RED. Extract the relevant post-update transaction unchanged, prove existing edit/cancel/scheduling regression before adding review logic; if the extraction needs a broad refactor, stop this task and report the concrete seam conflict.
- [ ] Under user→entitlement→source/post→publication locks, read own hold and immutable operation receipt first, validate paid state/revision/target, then use existing update/cancel/new-publication logic inside the SAME transaction to retain the old outcome and persist exactly one review receipt/new future publication. Mirror jobs only after COMMIT. The old cancelled hold's history remains; receipt lookup/replay still works after later expiry/deletion with existing terminal semantics.
- [ ] Run GREEN and post edit, scheduling, cancellation, worker/reconciliation/native race regressions. Verify no automatic renewal handler releases holds. Commit Task3.

**Acceptance:** all mutation methods enumerated and tested; final admission and restart behavior proved with native locks/isolated Redis; no source change to provider retry/timeouts. Independent focused Critic must inspect replay-before-gating and all denied-after-claim branches, then exact-head source CI.
