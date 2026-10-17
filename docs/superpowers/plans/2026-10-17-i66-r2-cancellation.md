# Issue 66 R2 Approval Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Withdraw an owned target approval only when every historical attempt positively proves no provider handoff, preserving immutable content and AUTH history.

**Architecture:** A dedicated authenticated transaction shares a conservative history classifier with the existing connection release barrier. One nullable target timestamp records explicit withdrawal. Existing processor claim, Queue, Worker, retry and frozen Post semantics remain authoritative. UI uses server-authored eligibility and offers the existing explicit copy into an unsaved draft.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL 17, existing Next HTTP routes and React planner, BullMQ mirror, Node native tests and Playwright synthetic fixtures.

**Spec:** Owner-approved minimal R2 design, Issue 66 comment 6230940257: https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6230940257 . Local design: `artifacts/i66-implementation/2026-10-17/r2-cancellation-design.md` outside this checkout. Approval dated 2026-10-17 supersedes its old DESIGN ONLY status, without widening the supported no-send classes.

## Global Constraints

- Cancellation only with proven no-send across ALL same-target historical attempts. AUTH, ambiguous outcomes and publication history remain intact.
- Original Post remains immutable. Re-publication requires an explicit copy, explicit new draft save, then fresh approval. No automatic resends.
- No Scheduler, Worker, Queue or retry rewrite. No generic Post editability exception. Only the narrow existing release AUTH barrier changes.
- One additive nullable `postTargets.approvalCancelledAt`; no backfill. Schema generation/rehearsal only on a new disposable local test database and CI. No existing staging/production DB migration.
- Strict same-origin authenticated POST with expectedPublicationId, expectedPublicationUpdatedAt, expectedBindingRevision, expectedTargetUpdatedAt. Session ACTIVE and current ownership required for mutation AND replay.
- Preserve Post/media, target identity/account/textOverride/active and every AUTH field including historical destination/revision/date/receipts/diagnostics.
- Conservative support: PERSONAL_PROVIDER_SETUP_REQUIRED count 0 and null lastAttemptAt, or matching TELEGRAM_DISCONNECTED/MAX_DISCONNECTED count 1 and present lastAttemptAt; exactly one AUTH; no receipt/ambiguity. Other rows only unattempted SCHEDULED/QUEUED/CANCELLED with null lastAttemptAt and no uncertainty. All FAILED, attempted CANCELLED/open, additional AUTH, PUBLISHING/PUBLISHED on selected target reject.
- Read-only replay precedes first-mutation target-version/current-binding checks, but always verifies the expected immutable AUTH/version and complete history. Marker requires null schedule, target.updatedAt equal to marker and no open history. One captured timestamp writes marker and updatedAt; wall-clock timestamps are not collision-proof revisions.
- Selected safe open rows become CANCELLED/nextRetryAt null atomically. Best-effort removal after commit; DB status is the barrier if queue cleanup fails.
- Historical destination comes only from the exact AUTH publication, missing means unknown. Never substitute a current/rebound account destination.
- Existing Draft PR 67, branch codex/i66-verified-channel-connections. R2 is one separate coherent commit after its verification; no merge, deploy, provider calls, secret changes or infra operations.

## Review Focus

- Prior failed or attempted CANCELLED history can masquerade as a new local AUTH: reject all such target histories.
- Lost-response replay after release/rebind must read the original receipt without touching a new binding or queue.
- Claim wins means cancellation rejects and preserves the real outcome; cancel wins means stale jobs cannot send or refresh pointers.
- An eligible target may have a published sibling on the same immutable Post: preserve all content/media/history and show copy as a separate explicit action.
- DTO/UI races, foreign sessions and unknown historical destination must fail closed and refresh without optimistic send/cancel success.

### Task 1: Implement and verify the complete bounded R2 slice

**Files:**
- Create focused classifier/service `lib/server/publication-approval-cancellation.ts` (split pure history classifier into an adjacent file only if necessary for cohesive imports).
- Create strict HTTP helper/route under `app/api/posts/[id]/targets/[targetId]/cancel-approval/route.ts`, following existing routes/auth/CSRF/error conventions; route post parameter follows current folder naming.
- Modify `db/schema.ts`, next additive `drizzle/0014_*.sql` plus generated journal/snapshot.
- Modify `lib/server/social-connections/lifecycle.ts` only for marker + full classifier AUTH release exception.
- Modify `lib/server/posts.ts`, `lib/contracts/planner.ts`, `lib/client/planly-api.ts` for precise cancellation DTO/request, preserving unrelated contracts.
- Integrate a small target-level confirmation/status component with `components/planner/app.tsx` detail view and existing Post mapping. Follow existing owner-lifetime fencing; no unrelated refactor. Add CSS only when needed for accessible 320/390/desktop layout.
- New focused native service/history/HTTP/race tests; targeted actual-source UI/Playwright fixture tests; existing regression tests as needed. Update `docs/social-connections.md` with supported scope, blocked uncertainty and copy rules. Include this plan.

**Interfaces:**
- Produces `cancelPublicationApproval(rawSessionToken, postId, targetId, input, options?)` (or a cohesive factory with equivalent public signature), result `{postId,targetId,publicationId,approvalCancelledAt,replayed}`. Options permit a clock and existing queue mirror seam for deterministic tests, never client-provided identity/provenance.
- Target DTO includes approvalCancelledAt and cancelApproval `{eligible,reason:AVAILABLE|ALREADY_CANCELLED|UNSUPPORTED_HISTORY,expectedPublicationId,expectedPublicationUpdatedAt,expectedTargetUpdatedAt,expectedBindingRevision,historicalDestinationId}`. Missing legacy fields in client test fixtures must remain safely non-eligible.
- Consumes existing lockConnectionActor/owner lock, Post/history lock ordering, registered default processor resolver, existing queue mirror, explicit duplicatePost and owner-lifetime fencing.

- [ ] Inspect exact existing paths and guards. Read the full approved design before tests; no new design approval required. Record any ambiguity to controller before widening scope.
- [ ] TDD RED: actual native service/HTTP behavior, not just missing imports. Capture expected failing behavior before implementing each new rule. Cover both supported classes for Telegram/MAX and negative prior TEMPORARY→retry→PERSONAL count1, DISCONNECTED count2, attempted CANCELLED→new PERSONAL count0, provider AUTH/unknown/ambiguity/extra AUTH/PUBLISHING/PUBLISHED/inconsistent metadata/foreign actor/stale revision/version. Preserve snapshots on every rejection.
- [ ] Minimal GREEN: owner→Post→all Post publications ordered ID→target locking, owned account checks under common owner serialization. Exact already-cancelled replay branch before first-mutation freshness checks. Rollback leaves all original rows untouched. No generic save exception or binding mutation.
- [ ] Generate the one additive migration and test drift/fresh disposable migration round-trip. No legacy backfill. Controller provides a fresh localhost-only PG17 database and Redis window; test suites run serially.
- [ ] Deterministic native races using actual SQL barriers/pg_blocking_pids or proven existing harness, not sleeps: cancel wins and actual processor claim wins on explicitly labelled synthetic open sibling defense fixtures; AUTH itself is terminal and cannot normally claim. Actual AUTH retry veto; retry-before-AUTH stays ineligible. Release/cancel serialization; stale queued/active job and queue removal failure; after release/rebind old rows cannot send/retarget. Verify real PUBLISHING outcome/receipts remain intact when cancel rejects. Use default registered resolver plus fake fetch for actual guard tests, never real network.
- [ ] HTTP tests for ACTIVE ownership/session, strict bounded JSON, CSRF/origin/query/header selectors, malformed/stale requests, replay and private no-store response. Cancellation needs no current provider rights or real provider request.
- [ ] DTO/UI TDD: exact AUTH ID/version, target timestamp, bindingRevision, historical destination (unknown when missing); confirmation, reload, conflict, owner switch/inflight fencing; published sibling; immutable old Post; explicit copy opens blank-ID draft editor with empty targets and no persistence/send, explicit new draft save and separate fresh approval get new IDs/current pointer. Test 1366/390/320 and keyboard. Preserve existing immutable generic save regression.
- [ ] Run focused new tests and affected posts/edit/publications/processor/retry-race/connection lifecycle suites once after implementation, typecheck without incremental cache, focused lint/diff-check. Browser build/checks sequential to typecheck. Record commands/exits/counters, original RED and GREEN logs, fixture limits and screenshots.
- [ ] Self-review, commit only this R2 slice (including plan/docs/tests) as one separate commit, do not push. Report in task-1-report.md. Controller performs task Critic, broad final integration Critic, root verification, push and new exact-HEAD GitHub CI/Self-host. Fix concrete review findings on this branch; preserve Draft.

### Controller verification and delivery

- [ ] Reconcile every task requirement and actual diff with native/HTTP/browser evidence, resolve review findings in scope.
- [ ] Independent task review plus final broad integration review; no duplicate full-suite reviewer reruns. Existing pre-R2 baseline reviewed at 216c6f1; final reviewer sees whole branch package and R2 focus.
- [ ] Appropriate fresh root regression/type/lint/default build (known local junction limitation reported honestly); exact new HEAD CI and Self-host with native tests, fresh migration drift, canonical build and compiled browser checks.
- [ ] Push the new R2 commit only to existing PR67 feature branch; read back Draft/head/base, CI SHA and source/PR-merge tree identity. Update sanitized PR/Issue evidence with scope and remaining live gates.
- [ ] Preserve evidence, stop only owned local test services. No deploy/merge/live provider actions; report exact source SHA, native/CI/Self-host/Critic and supported cancellation boundary.

### Task 2: Separately approved OWNER AUTH account-error fence

**Owner gate 2026-10-17:** after native final Critic I1 proved the race, Owner explicitly approved only an OWNER Telegram/MAX outcome-state fence in existing Scheduler, a separate commit in Draft PR67. Observation must precede AUTH; ERROR only if original generation/revision/destination still match. AUTH/receipts, USER guard, VK, Queue, Worker, retry and architecture remain unchanged. No real providers, setup/secrets, migration, merge or deploy.

**Files:** narrow `lib/server/scheduler/processor.ts` failure seam; new focused native test file `tests/owner-auth-error-fence.integration.test.ts`; clarify `docs/social-connections.md` scope and late-AUTH wording (final Critic M3). No refactor or formatting of unrelated R2 code (M1 retained minor).

**Spec/evidence:** Issue66 comment6231811299 and the direct Owner gate; original native exact6f0524b probe `artifacts/i66-implementation/2026-10-17/final-critic-owner-race.source.txt` and `.log` outside checkout; prospective early-observation design `r2-owner-auth-fence-proposal.md`. Capture before AUTH is committed, never recapture current account after AUTH.

- [ ] Read exact pre-AUTH account snapshots/call paths. TDD native RED for Telegram AND MAX with default configured OWNER resolver and fake metadata-only fetch. Actual R2 cancellation→release→connect at newer generation; hold after AUTH commit/before trailing work and before account ERROR SQL. Preserve deterministic promise barriers, expected CONNECTED and byte-equivalent AUTH assertions; no sleeps or real network.
- [ ] Minimal GREEN: carry immutable earlier account identity/generation/bindingRevision/destination into the existing unobserved OWNER Telegram/MAX AUTH error side effect; make ERROR conditional on all those original values. Null destination comparison must be safe. Preserve unchanged-account ERROR behavior, publication AUTH/result/receipt writes and existing USER observed error branch. VK behavior/source path untouched.
- [ ] Test each generation/revision/destination mismatch independently plus the real lifecycle sequence and unchanged observation, Telegram/MAX, late-result receipt/history preservation and no duplicate send. Label direct state-mutation defense fixtures separately from real reconnect flow.
- [ ] Run focused new cases, R2 native/source-hook, existing USER generation/publication/legacy/processor and retry regressions appropriate to changed seam; typecheck/lint/diff-check. No successful unrelated full-suite reruns. Fix only proven failures within scope.
- [ ] Correct docs: whole branch contains approved narrow USER authorization hooks and this OWNER error-state fence; engine/Queue/Worker/retry architecture remains unchanged. Clarify protected late AUTH applies Telegram/MAX with these observations; do not claim VK/live proof.
- [ ] Self-review and one separate fix commit, no push. Report `.superpowers/sdd/i66-r2-cancellation/task-2-report.md`. Controller scoped independent Critic of final fix wave I1+M3, fresh exact-HEAD CI/Self-host and Draft readback; stop before merge.
