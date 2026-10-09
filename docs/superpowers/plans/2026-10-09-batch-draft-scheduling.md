# Phase 9 Batch Draft Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the Owner individually review existing drafts, preview their exact free slots, and save the whole batch atomically with reliable lost-response recovery.

**Architecture:** Reuse current slot calculation, owner schedule locking and publication reconciliation. Add narrow snapshot/preview and commit services, an additive immutable operation receipt, and per-operation owner-scoped client recovery. Confirmation schedules existing Posts; it does not invoke provider publication directly.

**Tech Stack:** Existing TypeScript, Next.js, React, Zod, Drizzle/PostgreSQL, Node test runner and current queue/scheduler. Node floor remains 22.13.0; no new dependencies, env variables or services.

**Spec:** [Owner-approved written specification](../specs/2026-10-09-batch-draft-scheduling-design.md), approved in chat on 2026-10-09 at PR34 head `7d2577746a7a35afc5afce8cc3a1a12c511234b6`.

**Status:** OWNER PLAN APPROVED at head `3217d13a633df27d7d7d8f84c7612571b4118582` on 2026-10-09 with native execution in this chat. Tasks 1–5 completed; Task 6 implementation and behavior tests completed, desktop/mobile browser verification pending. Task 7 independent review and exact-head CI in progress. Merge/deploy/provider gates remain separate.

## Global Constraints

- Select 1–20 owned existing DRAFT Posts, with at least one active Telegram/MAX target, null active target times and no publication history. Active VK targets exclude the Post; inactive targets remain untouched.
- Preserve individual content approval, content/media order/overrides/target identity, existing manual editing, Phase 6 approval and the free scheduler. No automatic approval, silent shifting, partial scheduling or automatic retry.
- Use Moscow time, 1–31 inclusive dates, weekdays 1–7, 1–4 unique daily HH:mm values, strictly future slots and one selected Post per batch minute. Occupancy is the union of selected batch providers with current latest-CANCELLED semantics.
- Preview is read-only: no database writes, publication work, queue changes or provider requests. Commit creates scheduled work through current reconciliation; never call `runDuePublications` or a connector in either new route.
- Retain Telegram analytics/VK/Instagram HOLD and CR07/CR08/GAP01 deferred status. No scopes, OAuth, webhook/env, secrets, infrastructure, AI, recurring content or timing redesign.
- Keep existing auth and CSRF safeguards. Never expose credentials, raw provider bodies or arbitrary error/input dumps.
- Use synthetic content/accounts and isolated native PostgreSQL for tests. Production merge/deploy/migrations and real provider work require their Owner gates; local/CI checks are not live acceptance.
- Reconfirm clean checkout, remote, current main and migration sequence before implementation. Source baseline is main `a2187cd`; last verified production is `2539796`, not the docs PR head.

## Review Focus

1. Equivalent ISO offsets for the same instant must canonicalize to one hash and one receipt; seconds/non-slot times must be rejected — Tasks 1 and 3.
2. Corrupt or unreadable current-owner pending storage must block dispatch rather than hide an uncertain commit; another owner's entries must never be read/applied — Task 5.
3. Two tabs can start before seeing the other's pending entry; preserve both original keys through lost responses/reload and clear only the acknowledged operation — Task 5.
4. Filtering the draft list must not silently drop selected Posts or their review requirements; server-returned changed content and expired media previews need a visible fresh review — Task 6.
5. A committed receipt followed by a failed calendar refresh is still a successful scheduling operation; do not turn that refresh failure into a new commit or false rollback — Task 6.

## File boundaries and shared types

Create `lib/contracts/scheduling-plan.ts` for wire validation/types, `lib/scheduling-plan.ts` for pure allocation/canonicalization, `lib/server/scheduling-plan-snapshot.ts` for owned snapshots/fingerprints, `lib/server/scheduling-plan-preview.ts` for read-only preview, `lib/server/scheduling-plan-commit.ts` for the atomic operation, and `lib/server/scheduling-plan-http.ts` for safe route guards/errors. Extract only current relation validation into `lib/server/post-relations.ts`; keep ordinary Post behavior unchanged.

Create `lib/client/scheduling-plan-recovery.ts`, `lib/client/scheduling-plan-state.ts` and `components/planner/scheduling-plan.tsx`. Integrate through existing `lib/client/planly-api.ts`, `components/planner/library.tsx`, `components/planner/app.tsx` and `app/globals.css`; do not split unrelated App/editor flows.

Wire types in the contracts file:
- `PlanSettings = Pick<SlotQuery, 'startDate'|'endDate'|'weekdays'|'times'>`.
- `SchedulingPlanPreviewInput = { postIds: string[]; settings: PlanSettings }`.
- `SchedulingPlanCommitInput = { operationId: string; settings: PlanSettings; rows: { postId: string; fingerprint: string; scheduledAt: string; reviewed: true }[] }`.
- `SchedulingIssue = 'POST_INELIGIBLE'|'ACCOUNT_UNAVAILABLE'|'CONTENT_INVALID'|'NO_SLOT'`.
- `SchedulingPlanPreview = { complete: boolean; rows: { post: PostDto; accounts: SocialAccountDto[]; fingerprint: string|null; scheduledAt: string|null; issue: SchedulingIssue|null }[]; media: (MediaAssetDto & {previewUrl: string})[] }`.
- `SchedulingPlanReceipt = { operationId: string; appliedAt: string; rows: {postId: string; targetIds: string[]; scheduledAt: string}[] }`; `SchedulingPlanCommitResult = { receipt: SchedulingPlanReceipt; replayed: boolean }`.

## Task 1: Strict contracts and deterministic allocation

**Files:** Create `lib/contracts/scheduling-plan.ts`, `lib/scheduling-plan.ts`, `tests/scheduling-plan.test.ts`. Reuse `lib/contracts/swipe-planner.ts` and `lib/planner-slots.ts` without relaxing their validators.

**Interfaces:** Export `schedulingPlanPreviewInputSchema`, `schedulingPlanCommitInputSchema`, `schedulingPlanReceiptSchema` and the shared types above. Export `canonicalSchedulingPlanCommit(input: SchedulingPlanCommitInput): SchedulingPlanCommitInput`, `allocateDraftSlots(postIds: readonly string[], query: SlotQuery, occupied: ReadonlySet<string>, now: Date): {postId: string; scheduledAt: string|null}[]`, and `isSchedulingPlanSlot(settings: PlanSettings, scheduledAt: string): boolean`.

- [x] Write failing contract/allocation tests, including these exact assertions using 2030-01-01, all weekdays and times `10:00`, `18:00`:
  ```ts
  assert.deepEqual(allocateDraftSlots(['a','b','c'], query, new Set(), new Date('2029-12-31T00:00Z')).map(r => r.scheduledAt),
    ['2030-01-01T07:00:00.000Z', '2030-01-01T15:00:00.000Z', null]);
  assert.equal(isSchedulingPlanSlot(settings, '2030-01-01T07:00:30Z'), false);
  assert.deepEqual(canonicalSchedulingPlanCommit(utcInput), canonicalSchedulingPlanCommit(offsetEquivalentInput));
  assert.equal(schedulingPlanCommitInputSchema.safeParse({...validInput, rows: [{...validInput.rows[0], reviewed: false}]}).success, false);
  ```
  Fixtures differ only by equivalent UTC/+03:00 times. Also assert bounds 0/21 Posts, duplicate IDs, unknown fields, invalid UUID/64-lowercase-hex fingerprints, 32-date ranges, 5 times, invalid dates/weekdays, minute occupancy including seconds, leap/year boundaries and preservation of selected order. A settings object has no client-supplied providers.
- [x] Run `node --test --experimental-strip-types tests/scheduling-plan.test.ts`; confirm RED for missing new behavior, not a broken fixture.
- [x] Implement strict Zod objects. Reuse `slotQuerySchema` by validating settings with a temporary valid provider list, then use actual server-derived providers for allocation. Canonicalize instants to UTC ISO, sort unique weekdays/times, retain row order. For each row call `findNextSlot` and reserve its minute in a copied occupied set; never mutate the caller's set or omit unassigned rows.
- [x] Run the same command plus `node --test --experimental-strip-types tests/planner-slots.test.ts`; require all PASS. Commit `feat: add batch scheduling contracts and allocation`.

## Task 2: Owned snapshots and read-only preview

**Files:** Create `lib/server/post-relations.ts`, `lib/server/scheduling-plan-snapshot.ts`, `lib/server/scheduling-plan-preview.ts`, `tests/scheduling-plan-preview.integration.test.ts`, `tests/helpers/scheduling-plan-db.ts`; modify only the extracted validator call sites in `lib/server/posts.ts`.

**Interfaces:** Export `validatePostRelations(tx: Transaction, userId: string, input: SavePostInput): Promise<Map<string,string>>` with the existing validator's behavior. Export `readSchedulingSnapshots(tx: Transaction, userId: string, postIds: readonly string[]): Promise<SchedulingSnapshot[]>`, `fingerprintSchedulingSnapshot(snapshot: SchedulingSnapshot): string`, and `schedulingEligibility(snapshot: SchedulingSnapshot): SchedulingIssue|null`. Define `SchedulingSnapshot = {post: PostRow; targets: {target: TargetRow; account: AccountRow}[]; media: {asset: MediaRow; position: number}[]; history: PublicationRow[]}`, with row aliases from the corresponding Drizzle `$inferSelect` types. Read all target/history rows for eligibility, sort targets by ID for canonicalization and media by `postMedia.position`; expose active targets only in PostDto. Export `previewSchedulingPlan(userId: string, input: SchedulingPlanPreviewInput, options?: {now?: () => Date; storage?: Pick<ObjectStorage,'signedGetUrl'>}): Promise<SchedulingPlanPreview>`.

- [x] Write RED integration tests. The new isolated helper seeds owner/other, connected synthetic TG/MAX accounts, DRAFT Posts with active unscheduled targets and optional media/history; exports `seedSchedulingFixture()`, `schedulingCounts(userId): Promise<{posts:number; targets:number; publications:number}>` and `cleanupSchedulingFixture()`. Use the existing suite's database setup/teardown discipline. Assert preview assignments match Task 1, count snapshots before/after are identical, owned order is preserved, and no queue/connector is called.
  ```ts
  const before = await schedulingCounts(owner);
  const preview = await previewSchedulingPlan(owner, input, {now: () => now, storage: fakeSigningStorage});
  assert.equal(preview.complete, true);
  assert.deepEqual(await schedulingCounts(owner), before);
  assert.deepEqual(preview.rows.map(r => r.post.id), input.postIds);
  ```
  Test no-target drafts, active/inactive unsupported targets, every history status including CANCELLED, disconnected/disabled accounts, invalid effective overrides/media, ownership isolation, incomplete ranges, provider-union occupancy and latest-CANCELLED release. Missing/foreign IDs share the same safe not-found result.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/scheduling-plan-preview.integration.test.ts`; require semantic RED in isolated migrated PostgreSQL.
- [x] Extract relation validation without changing its content/media checks. Read selected owned snapshots in one transaction. Fingerprint deterministic Post versions/content, active targets/overrides, media IDs/order and publication metadata, plus selected account identity/enabled/state/version; exclude expiring signed URLs. Sign only selected owned media through current storage; no provider calls. If any row is ineligible, mark the preview incomplete and do not allocate a partial confirmable batch. For eligible but insufficient capacity return the ordered rows with `NO_SLOT` on unassigned rows.
- [x] Run the focused command and `node --test --test-concurrency=1 --experimental-strip-types tests/planner-slots.integration.test.ts tests/publication-content.integration.test.ts`; all PASS. Commit `feat: preview owned drafts in free scheduling slots`.

## Task 3: Atomic operation receipt and commit

**Files:** Modify `db/schema.ts`; create generated `drizzle/0008_scheduling_plans.sql`, `drizzle/meta/0008_snapshot.json` and update `drizzle/meta/_journal.json` through Drizzle; create `lib/server/scheduling-plan-commit.ts`, `tests/scheduling-plan-commit.integration.test.ts`. Do not change old migrations.

**Interfaces:** Export schema table `schedulingPlanOperations`: `(user_id text, operation_id uuid)` composite primary key, owner FK ON DELETE CASCADE, SHA256 request hash, JSONB typed minimal receipt, created timestamp. No Post FK or receipt-update path. Export `commitSchedulingPlan(userId: string, input: SchedulingPlanCommitInput, options?: {now?: () => Date; mirrorQueue?: (changes: PublicationQueueChange[]) => Promise<void>}): Promise<SchedulingPlanCommitResult>` and `SchedulingPlanConflictError` with codes `PLAN_STALE`, `PLAN_SLOT_CONFLICT`, `PLAN_ACCOUNT_UNAVAILABLE`, `PLAN_INELIGIBLE`, `PLAN_INCOMPLETE`, `PLAN_OPERATION_CONFLICT`.

- [x] Write RED database tests for new service/receipt behavior. Derive the commit rows from Task 2's preview with `reviewed: true`, never guessed fingerprints. Assert all selected Posts become READY, only active target times/timestamps change, exact expected publications exist, and content/target IDs/overrides/media order remain equal to the pre-commit snapshot.
  ```ts
  const first = await commitSchedulingPlan(owner, commitInput, noMirror);
  const counts = await schedulingCounts(owner);
  const replay = await commitSchedulingPlan(owner, offsetEquivalentInput, noMirror);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(await schedulingCounts(owner), counts);
  ```
  Add rollback on the second Post's injected reconciliation/SQL failure (fixture-scoped DB failure, not production hooks), stale/edited/deleted Posts, content/media/account changes, occupied/past minutes and different payload/same key. Query the new operation table directly to assert zero receipts after rollback and exactly one after replay/concurrency. Verify replay after time passage, Post edit/deletion and account disconnect occurs before current eligibility/future-time checks and never resurrects changes. Test owner isolation and owner deletion cascade. Test two same-key concurrent requests create one receipt; different batches competing for one slot yield one success and one full rollback.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/scheduling-plan-commit.integration.test.ts` for RED before implementation. Use actual native PostgreSQL row locks and coordination barriers (`pg_stat_activity`/test connections) following `planner-slots.integration.test.ts`; do not substitute an in-memory lock for concurrency proof.
- [x] Add the table; run `pnpm exec drizzle-kit generate --name scheduling_plans` and inspect only the additive table/FK/key/metadata diff. Run `pnpm db:migrate` against isolated test PostgreSQL, never production. If current main has advanced the migration sequence, stop and resolve authority before generation.
- [x] Implement one transaction: owner lock → owned receipt lookup/hash comparison → sorted Post/history/account locks → fresh snapshots/eligibility/content/slot/future checks → status/active schedule updates → current `reconcilePostPublicationsInTx` for every selected Post → assert expected work → insert immutable receipt → commit. Validate membership in original settings and minute uniqueness; no silent allocation on commit. Use shared canonical input SHA256 without operation ID. Schema parsing must not reject elapsed times before receipt lookup.
- [x] Mirror only a newly committed operation through existing `applyPublicationQueueChanges`, outside the transaction. Catch mirror failure with a fixed safe classification and return the committed receipt; replay mirrors nothing. Test injected mirror failure still returns success and current database reconciliation recovers scheduled work without duplication.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/scheduling-plan-commit.integration.test.ts tests/scheduler-reconcile.integration.test.ts tests/planner-slots.integration.test.ts`; all PASS. Verify generated drift is empty and commit `feat: atomically commit reviewed scheduling plans`.

## Task 4: Authenticated API and typed transport

**Files:** Create `lib/server/scheduling-plan-http.ts`, `app/api/scheduling-plans/preview/route.ts`, `app/api/scheduling-plans/commit/route.ts`, `tests/scheduling-plan-api.integration.test.ts`, `tests/scheduling-plan-transport.test.ts`; modify `lib/client/planly-api.ts`.

**Interfaces:** Export `requireSchedulingPlanRequest(request: Request): void`, `schedulingPlanApiError(error: unknown): Response`; export each route's `POST(request: Request): Promise<Response>`. Client exports `previewSchedulingPlanRequest(input: SchedulingPlanPreviewInput): Promise<SchedulingPlanPreview>` and `commitSchedulingPlanRequest(input: SchedulingPlanCommitInput): Promise<SchedulingPlanCommitResult>` using existing private `request<T>`/`PlanlyApiError`.

- [x] Write RED route/transport tests: unauthenticated → 401; authenticated JSON with `X-Planly-Scheduling: 1` succeeds; missing/wrong header, non-JSON content type or supplied `sec-fetch-site` other than `same-origin` → 403. Follow the existing analytics POST guard pattern without importing analytics runtime. Neither Host nor X-Forwarded-Host is a trust source; do not add permissive CORS. Assert unknown input fields → 422, malformed JSON → 400, foreign/missing Post → indistinguishable 404, stale/slot/ineligible/account/incomplete conflict → typed 409, and operation conflict → 409 without a clearable pre-commit marker. Provider/tick functions are never invoked by either route.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/scheduling-plan-api.integration.test.ts tests/scheduling-plan-transport.test.ts`; confirm RED.
- [x] Implement both POST routes using `requireApiOwner`, strict schemas, the request guard and Task 2/3 services. Responses are `cache-control: no-store`, success 200. Map malformed JSON → `PLAN_BAD_JSON`/400, Zod input → `PLAN_INVALID_INPUT`/422, publication validation → `PLAN_CONTENT_INVALID`/422, owned missing/foreign source → `PLAN_POST_NOT_FOUND`/404; use Task 3 codes for conflicts. These proven pre-commit errors include `{code, commitApplied:false}`. Never add this marker to unknown errors or operation-key conflicts. Auth/CSRF use safe 401/403 and remain blocked on the client. Generic server error returns safe 500 without arbitrary error/body logging. Client sends exact original body with the custom header/JSON; add no automatic retry and do not change unrelated API calls.
- [x] Run focused tests plus `tests/auth.integration.test.ts`; PASS. Commit `feat: expose guarded scheduling plan endpoints`.

## Task 5: Durable per-operation recovery and review state

**Files:** Create `lib/client/scheduling-plan-recovery.ts`, `lib/client/scheduling-plan-state.ts`, `tests/scheduling-plan-recovery.test.ts`, `tests/scheduling-plan-state.test.ts`.

**Interfaces:** Define `SchedulingRecoveryStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>`, `PendingSchedulingPlan = {version:1; ownerId:string; operationId:string; input:SchedulingPlanCommitInput}` and `SchedulingRecoveryRead = {pending:PendingSchedulingPlan[]; blocked:boolean}`. Export `readPendingSchedulingPlans(storage, ownerId): SchedulingRecoveryRead`, `persistPendingSchedulingPlan(storage, pending): void`, `completePendingSchedulingPlan(storage, ownerId, operationId): void`, `submitPendingSchedulingPlan(storage, pending, send: (input:SchedulingPlanCommitInput)=>Promise<SchedulingPlanCommitResult>): Promise<SchedulingPlanCommitResult>`. Use storage key `planly:scheduling-plan:v1:<encoded owner>:<operation UUID>` and a 64 KiB record limit; immutable same-key/same-payload writes only.

Define a pure state reducer `reduceSchedulingPlan(state: SchedulingPlanState, event: SchedulingPlanEvent): SchedulingPlanState` for ordered selection/settings, authoritative preview, checked fingerprints, request revision and pending/receipt/error state. Define `canConfirmSchedulingPlan(state): boolean`: complete current preview, all selected rows individually checked against their current fingerprints, no outstanding recovery and no request in flight. React consumes this reducer in Task 6; no storage/network actions inside it.

- [x] Write RED tests using fake storage, deferred transport and pure events. Assert storage write failure results in zero `send` calls, unknown 5xx/lost response preserves original key/body, typed proven pre-commit rejection clears only its own record, operation-key conflict stays blocked, replay uses the original payload and successful acknowledgement clears only the matching key.
  ```ts
  persistPendingSchedulingPlan(cache, first);
  persistPendingSchedulingPlan(cache, second);
  assert.equal(readPendingSchedulingPlans(cache, owner).pending.length, 2);
  completePendingSchedulingPlan(cache, owner, first.operationId);
  assert.deepEqual(readPendingSchedulingPlans(cache, owner).pending.map(p => p.operationId), [second.operationId]);
  ```
  Test two tabs lose responses independently, reload enumerates/retries both original keys, and no automatic dispatch occurs. Corrupt/oversized/unreadable current-owner entries block new work; other-owner entries cannot enter the current UI. State tests assert selection/reordering/settings/content changes invalidate preview/checks, no select-all approval, incomplete preview cannot confirm and older preview generations cannot apply.
- [x] Run `node --test --experimental-strip-types tests/scheduling-plan-recovery.test.ts tests/scheduling-plan-state.test.ts`; confirm RED.
- [x] Implement strict record parsing and per-operation storage. Generate a new UUID only for a fresh explicit confirmation after checking all known current-owner entries; persist before dispatch. Typed pre-commit clearing requires `commitApplied:false` and a code from Task 4's validation/not-found mapping or Task 3's conflict codes except `PLAN_OPERATION_CONFLICT`; 401/403/unknown/operation conflict remain recoverable/blocked. Verify response receipt operation ID matches the pending entry before acknowledgement. A malformed response preserves the original record. Listen/enumerate on hydration and cross-tab storage updates in Task 6; never guess a replacement key.
- [x] Run focused tests and `tests/pending-creation.test.ts`; PASS. Commit `feat: recover scheduling operations without duplicate work`.

## Task 6: Integrate the reviewed scheduling UI

**Files:** Create `components/planner/scheduling-plan.tsx`, `tests/scheduling-plan-ui.test.mjs`, `tests/scheduling-plan-app.test.mjs`, `tests/helpers/scheduling-plan-fixture.mjs`; modify `components/planner/library.tsx`, `components/planner/app.tsx`, `app/globals.css` and extend only the instrumentation allowlist in `tests/helpers/planner-lifecycle-loader.mjs` for the new component.

**Interfaces:** `SchedulingPlan({ownerContext, isOwnerCurrent, media, onSaved, onClose})`, where owner context is `{id:string; generation:object}`, media is current `MediaAssetWithPreview[]`, `isOwnerCurrent(context):boolean`, and `onSaved(result:SchedulingPlanCommitResult):Promise<void>` reloads current `loadPlanner()` state with existing owner-generation protection. Add optional `startScheduling:()=>void` to existing `Content` props; invoke from its drafts tab action. The panel loads owned current Posts through a new `loadSchedulingDrafts(): Promise<PostDto[]>` client function calling existing read-only `GET /api/posts`; its eligibility remains server-authoritative.

- [x] Write RED behavior tests with the current lifecycle hook harness and modeled HTTP/storage, not string-only assertions. The new fixture extends current App fixtures with owned draft/account/media DTOs, preview/commit responses and storage events. Assert selecting/reordering/filtering retains selected IDs, all full texts/overrides/media/destinations appear, each row needs a separate review, and confirmation displays its count. Include these boundary assertions:
  ```js
  assert.equal(commitRequests.length, 0); // incomplete or one unchecked row
  assert.equal(commitRequests.length, 1); // one explicit complete confirmation
  assert.deepEqual(commitRequests[0].body.rows.map(r => r.postId), ['b','a']);
  assert.equal(reloadErrorVisible, true);
  assert.equal(commitRequests.length, 1); // committed receipt + failed refresh is not retried
  ```
  Test server-changed fingerprint clears checks, stale preview responses after reorder/logout/owner change do not apply, fresh preview is required on conflict, media signing/loading failure prompts refresh/review, pending operations are offered individually, storage events block new batches and cancellation never schedules. Verify filters only affect discovery, not the review list. Returned receipt followed by refresh failure is labelled saved with a refresh action; no false rollback/new commit.
- [x] Run `node --test --experimental-strip-types tests/scheduling-plan-ui.test.mjs tests/scheduling-plan-app.test.mjs`; confirm RED.
- [x] Implement the panel with Task 5 reducer/recovery and Task 4 transport. Ordered 1–20 selection, move controls, current presets/settings, Moscow labels, authoritative full-content preview, individual fingerprint checks, complete-plan confirmation and explicit original-key retries. Copy: `Распределить по слотам`, `Содержание проверено`, `Запланировать N постов`, `Время — Москва`, and an explanation that free-service publication delays remain possible. Use current private media URLs; refresh expired previews without trusting changed content as already reviewed. If local storage was lost, show calendar verification guidance rather than fabricate an intent. Do not auto-submit on mount or storage events.
- [x] Integrate only through current owner-lifetime guards. Mount recovery access even when the draft filter hides all selected Posts. After a known successful receipt, retain/show the receipt independently of refresh success; retry refresh alone. Prevent double-click dispatch and stale acknowledgements; logout never removes another owner's intent. Preserve ordinary Content/Library/Composer navigation and creation.
- [ ] Run focused tests plus `tests/owner-lifecycle-app.test.mjs`, `tests/swipe-planner-app.test.mjs`, `tests/content-library-ui.test.mjs`. Check local browser desktop/mobile selection, readable long text/overrides, full media, count/error messages and keyboard controls with synthetic drafts; no real provider commits. Commit `feat: review and confirm batch draft schedules`.

## Task 7: Integration verification and Owner release gate

**Files:** Update `ROADMAP.md`, the current-state paragraph of `AGENTS.md` and this plan's completed checkboxes; create `docs/verification/2026-10-09-phase9-batch-scheduling.md` for exact evidence. If delivery is later, use the actual date for the verification report.

- [ ] Re-read the approved spec and map every requirement to Tasks 1–6 evidence. Run focused failures again only if new edits justify them; do not weaken assertions, add blanket skips or increase timeouts to manufacture PASS.
- [ ] In isolated development/test infrastructure run `pnpm db:generate` and inspect no generated drift; `pnpm db:migrate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Require exit 0/full suite 0 failures/cancellations/skips in canonical CI; native PostgreSQL lock tests must run. Preserve the existing analytics CSS/build check and Self-host recovery contract.
- [ ] Request an independent whole-branch review against the approved spec and baseline; resolve actionable correctness/security findings, then rerun affected checks. Record safe evidence categories separately: focused/native tests, full CI, Self-host, local UI, production, provider.
- [ ] Push approved implementation commits, update PR34 with final behavior/validation (keep draft until verification is ready), and inspect native CI + Self-host for the exact final SHA. Confirm no unapproved file/scope/env/provider changes. Documentation-head CI is not implementation-head evidence.
- [ ] When all required checks/review pass, STOP at `READY_FOR_OWNER_MERGE_GATE`. Provide exact final head/base, CI links and request separate Owner merge/deploy approval. Do not merge, deploy or migrate production from plan approval alone.
- [ ] After explicit release approval only: merge, verify main SHA, deploy that exact SHA to the existing Render service, verify LIVE/health/deployed identity and real production preview/recovery UI. A production commit schedules real work: obtain Owner-approved existing drafts/destinations/future times for a minimal scheduler/provider smoke. Without that evidence report preview-only acceptance and leave scheduling/delivery unproven. Preserve all deferred Phase 8/VK work.

## Plan self-review and handoff

Coverage: eligibility/approval → Tasks 2/6; allocation → 1/2; snapshot/auth → 2/4; atomicity/account/slot races → 3; receipt/replay/two-tab recovery → 3/5; stale UI/owner lifecycle → 5/6; canonical release/live gates → 7. All five Review Focus cases have named owning tests. Shared names/types are defined above before downstream use. No runtime implementation, migration generation/application or tests of unimplemented behavior are performed by preparing this plan.

Owner approved this plan and native execution on 2026-10-09 with `Одобряю план фазы 9, реализуй сам в этом чате`. Independent review remains at the integration checkpoint. Merge/deploy/provider gates remain separate.
