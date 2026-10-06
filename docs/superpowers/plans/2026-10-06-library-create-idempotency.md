# CR06 Library creation intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Direct Orchestrator selected native execution using executing-plans, with one fresh independent final reviewer; tasks share one client/server intent contract.

**Goal:** One explicit Library create intent produces at most one item after lost acknowledgements or concurrent repetition, preserving newer raw work and intentional identical creations.

**Architecture:** A Library-specific durable owner/key attempt and item are committed atomically. A separate owner-scoped client envelope freezes the original payload and survives ambiguity; explicit Save resolves it before another create or newer-content PATCH. Deletion retains terminal history, and CR11 OwnerLifetime guards every continuation.

**Tech Stack:** Existing TypeScript/Zod/Drizzle/PostgreSQL, React App/sessionStorage, Node test runner, native GitHub CI and existing Self-host Docker. No new dependency or infrastructure.

**Spec:** `docs/superpowers/specs/2026-10-06-library-create-idempotency-design.md` (`SPEC_APPROVED_WITH_GUARDS`; mandatory guards incorporated).

STATUS: PLAN_APPROVED_WITH_TASK_BOUNDARY_CORRECTION / STOP_AWAIT_OWNER_RELEASE. Mandatory correction incorporated: Task1 server primitive, Task2 pure client envelope, Task3 atomic transport/App cutover. Direct completed Orchestrator ruling says no additional PLAN_REVIEW is needed after this correction; CR07/CR08/GAP01 must not start now. This is future execution design, not permission to implement now.

## Global Constraints

- PR12–17 merged and verified → CR11/#19 rebased, CI/Docker GREEN and merged → fetch fresh main → re-inspect actual Library/App/API/schema paths → confirm spec assumptions still hold → only then execute CR06 TDD runtime after PLAN_REVIEW.
- No artificial integration tree as the primary CR06 runtime baseline; materially changed paths/contracts mean `PLAN_STALE / STOP` and direct Orchestrator review.
- Preserve frozen PR12–19. No Owner release approval has been observed; no merge/deploy/provider sends.
- Client/server keyed-create contract ships together. Task1/2 preserve the working browser path; Task3 enables mandatory server header, explicit client key and durable App admission in one tested commit. No intermediate commit breaks the browser path.
- Server hash is SHA256(JSON.stringify({ title: parsed.title ?? null, text: parsed.text, mediaIds: parsed.mediaIds })) after existing create schema parse; ordered media stay ordered. Empty title remains empty; undefined becomes null; no additional normalization.
- Separate Library identity, not content/editorToken/Post key. No automatic replay/PATCH, TTL, expiry, generic request ledger, ID guessing or content deduplication.
- `LIBRARY_CREATION_KEY_CONFLICT`409 binds changed payload; `LIBRARY_CREATION_RESULT_DELETED`410 forbids resurrection.
- Fail-closed new CREATE: durable frozen envelope write/readback precedes POST; raw remains visible on storage failure. Known-item PATCH keeps existing semantics.
- Canonical CR11 OwnerLifetime and PR17 raw recovery/status/media/save-upload rules remain authoritative. No Composer/Post/scheduler/provider redesign, AI or additional networks.
- Archive frozen diagnostic truth; reviewed representation-aware acceptance replaces active old-behavior observations explicitly, never with skips or weakened invariants.

## Review Focus

1. Same-normalized new edits must survive acknowledgement by raw revision, even when content normalization produces equal payloads (Task3).
2. A committed item's media may disappear or content/status/provenance may change before retry; replay returns current DTO without revalidating old media or overwriting it (Task1).
3. Successful storage methods may silently fail to persist/remove; readback must prevent duplicate admission and unsafe cleanup (Task2/3).
4. Raw Cancel/replacement while the old result is unknown must visibly resolve only the old intent on first Save; replacement ID remains absent (Task3).
5. A first-A callback after A→B→A, or a captured callback after attempt cleanup, must never dispatch a fresh create or clear a newer envelope (Task3).

## Files and responsibility

Observed anchors are main 95f53b7 + frozenPR17/PR19, not a claim about future fresh main. Task0 revalidates all of them.

- `lib/contracts/library.ts`: existing schema plus shared canonical projection and Library UUID key schema.
- New `lib/server/library-creation.ts`: Library-only hash/error types; no generic framework.
- `db/schema.ts`, generated `drizzle/` SQL/snapshot/journal: additive attempt table/state/indexes. Generator assigns the next migration tag against actual fresh main; never predict/reuse a frozen tag.
- `lib/server/library-items.ts`: keyed atomic create/replay, transaction DTO reader and terminalizing delete; retain intentional internal unkeyed CRUD.
- `app/api/library-items/route.ts`, `lib/server/http.ts`, `lib/client/planly-api.ts`: required user header, stable409/410 and explicit client key.
- New `lib/client/library-creation-attempt.ts`: strict owner-scoped envelope I/O and verified exact cleanup; raw storage remains separate.
- `components/planner/app.tsx`: attempt hydration/admission/acknowledgement using existing Library control and CR11 lifetime, no App refactor.
- Tests: existing Library/API/schema suites; new native `tests/library-creation-intent.integration.test.ts`, pure `tests/library-creation-contract.test.ts`, storage `tests/library-creation-attempt.test.ts`, actual callback `tests/library-creation-intent-app.test.mjs`; minimally extend `tests/helpers/library-editor-fixture.mjs` to capture request headers and silent storage failures.
- `tests/self-host-smoke.mjs`: keyed Library smoke and restart/terminal-history persistence in the existing disposable stack.
- Evidence only: archive `tests/library-create-ambiguity.integration.test.ts` as non-compiled `.ts.txt` under `docs/verification/probes/` and keep its exact 4733405 frozen-source reproduction instructions; write a new implementation verification report.

### Task0: Confirm the executable baseline and plan freshness

**Files:** inspect AGENTS, actual App/Library/API/schema/migrations/workflows and frozen integration suites; no runtime edit.

**Interfaces:** consumes approved spec/plan and exact GitHub merged prerequisite heads; produces recorded fresh-main SHA/clean worktree and confirmed path/contract map.

- [ ] Verify actual GitHub merge states and exact-head native/Docker results for prerequisite train and CR11; absent prerequisite = remain blocked, never cherry-pick a future baseline.
- [ ] Fetch main in authoritative repository; inspect branch/HEAD/status/remote, create an isolated codex branch with using-git-worktrees, preserve all dirty WIP. Record source SHA separately from deployed SHA.
- [ ] Re-inspect `saveLibraryEditor`, `saveLibraryItem`, Library API/read/delete, PR17 storage guards and CR11 `isOwnerCurrent`; confirm this contract still applies. Material difference → PLAN_STALE/STOP bridge.
- [ ] Record baseline full native 0 fail / 0 skip, types/lint/build and protected PR17/CR11 suites using existing CI/native environment. Existing independent regression → STOP_SPLIT rather than changing its oracle.

### Task1: Server primitive, atomic replay/delete and additive migration

**Files:** contracts, new server helper, schema/drizzle, Library service, native service/contract/schema tests above. Existing API/client/App transport remains unchanged.

**Interfaces:** `canonicalLibraryCreateInput(raw: CreateLibraryItemInput): {title:string|null;text:string;mediaIds:string[]}` parses existing schema and returns the exact projection. `libraryCreationKeySchema` validates UUID and normalizes lower case. Server `libraryCreationInputHash(input: CreateLibraryItemInput): string`, `LibraryCreationConflictError`, `LibraryCreationDeletedError` carry the stable Library409/410 error identities for Task3 mapping. Service adds `createLibraryItemForIntent(userId:string,raw:CreateLibraryItemInput,creationKey:string):Promise<LibraryItemDto>`; existing `createLibraryItem(userId,raw)` remains independent CRUD and keeps the current browser POST working until Task3. Internal `readOwnedLibraryItem(userId,id,executor)` accepts DB/transaction; keyed replay reads/locks inside its transaction. Existing `deleteLibraryItem(userId,id):Promise<void>` terminalizes history and preserves ordinary legacy deletion.

- [ ] Write RED contract tests `canonical title and ordered media are exact`: omitted/null title equal; supplied empty title distinct from null; whitespace trims through schema; media order changes hash; duplicate media/empty content fail validation; caller cannot supply trusted hash. Assert exact projection literals, not a mirrored implementation.
- [ ] Write RED native service `same intent yields one mapping/item` directly through `createLibraryItemForIntent` and real PostgreSQL. Write deterministic contention using an owner-row lock barrier: three same-key calls yield one ID/row; different keys with equal content yield two items. Client→API→DB committed lost-response acceptance belongs to Task3.
- [ ] Add native service assertions: changed title/text/order throws Library409 conflict and leaves mapping unchanged; owner B equal key is independent; foreign/missing media rejected atomically; corrected precommit has no attempt and then creates once; malformed key/invalid content rejected with no rows. User transport401/422 cases belong to Task3.
- [ ] Add replay/delete matrix: USED/ARCHIVED/current content/media/provenance unchanged by original replay; removed old media does not block replay; matching deleted result410 after DB pool close/reopen; changed deleted payload409; replay-before-delete and delete-before-replay forced with native lock barriers; legacy unkeyed delete preserved; foreign/missing delete cannot mutate another owner's state; transaction failure rolls back mapping/item/joins together. Use test-only DB constraints/barriers, no production fault hook.
- [ ] Run pure contract test and native integration on disposable PostgreSQL: `node --test --test-concurrency=1 --experimental-strip-types tests/library-creation-contract.test.ts tests/library-creation-intent.integration.test.ts`. Capture intended semantic RED, no fixture/skip-as-proof.
- [ ] Implement named interfaces and `libraryCreationAttempts` Drizzle table: userId with owner FK cascade, creationKey,inputHash,itemId,state CREATED|DELETED,createdAt,updatedAt; unique(owner,key), owner/item index; itemId history survives delete. Generate additive migration with `pnpm db:generate`, inspect SQL/journal, apply ONLY disposable native DB `pnpm db:migrate` and rerun generation/drift check.
- [ ] Implement owner→attempt→item lock order using existing `lockOwnerSchedule`; lookup original hash before replay/media checks; matching CREATED returns current owned DTO within locked transaction; no reinsertion/reset/Post mutation; matching DELETED or missing mapped item returns410; terminalize attempts and delete together. Existing update/archive/source conversion item locks continue to serialize with replay; test them rather than broadening scheduler.
- [ ] Run named service tests plus `tests/library-contract.test.ts tests/library-items.integration.test.ts tests/library-conversion.integration.test.ts tests/planly-api.test.ts tests/db-schema.test.ts`; required native GREEN with 0 fail / 0 skip for these suites. Verify the existing browser POST/client/App still use their unchanged path, with no additional regression. Existing frozen diagnostic RED remains declared until Task3; no full-suite readiness claim. Commit the working server primitive, tests and additive migration.

### Task2: Frozen client envelope with verified persistence

**Files:** new attempt storage module and pure storage tests. Existing API/client/App behavior remains unchanged.

**Interfaces:** `LibraryCreationAttempt={version:1;creationKey:string;editorToken:string;editorRevision:number;input:{title:string|null;text:string;mediaIds:string[]}}`. `libraryCreationAttemptKey(ownerId:string):string` uses `planly:library-create:v1:${encodeURIComponent(ownerId)}`. `readLibraryCreationAttempt(storage:LibraryRecoveryStorage,ownerId:string):{attempt:LibraryCreationAttempt|null;unavailable:boolean;invalid:boolean}`. `writeLibraryCreationAttempt(storage,ownerId,attempt):boolean` verifies serialized readback; `clearLibraryCreationAttempt(storage,ownerId,expectedAttempt):boolean` requires full exact projection and verifies null after removal. Consumes Task1 canonical projection/key schema and PR17 storage type; produces pure envelope operations for Task3, without touching working App admission.

- [ ] Write RED `frozen original envelope and owner isolation`: caller mutation cannot alter cloned ordered media; A/B keys separate; editorToken independent of key; revision preserved; canonical body exact. Bound revision 0..Number.MAX_SAFE_INTEGER, title200/text20000/media20 with media ID≤200 characters, total serialized150000 characters; reject unknown fields, version, invalid UUID, corrupt/oversized input. These caps follow existing Library payload and PR17 recovery bounds; no implicit corrupt cleanup.
- [ ] Write RED failure matrix for thrown and silent get/set/remove, stale exact cleanup vs newer key/token/revision/payload, inaccessible storage. Assert failed write is false; raw key unchanged; failed clear retains recoverable intent. Envelope module performs no transport. Actual zero-POST admission is verified in Task3.
- [ ] Run `node --test --test-concurrency=1 --experimental-strip-types tests/library-creation-attempt.test.ts` to capture intended RED; implement exact interfaces, named bounds and readback, preserving raw storage API.
- [ ] Run new storage and existing `tests/library-editor-recovery-storage.test.ts` suites GREEN, types/lint and unchanged client/browser controls; commit pure helper/tests checkpoint. No transport/App behavior change.

### Task3: Atomic transport and App cutover

**Files:** collection API route, http error mapping, client API helper, `components/planner/app.tsx`, native/API/callback tests, minimal Library fixture header/failure controls, Self-host Library POST callers and diagnostic archive. Existing PR17/CR11/CR09 probes stay protected.

**Interfaces:** consumes Task1 server primitive and Task2 envelope methods. Collection POST switches to required key and `createLibraryItemForIntent`, with201/currentDTO,409/410stablecode and precommit422. Client `createLibraryItem(input:CreateLibraryItemInput,creationKey:string):Promise<LibraryItemDto>` sends explicit header and validates nonempty acknowledgementID, without key generation/retry. Existing `saveLibraryEditor(fields,expectedToken)` and `saveLibraryItem` wrapper integrate durable admission in the same task. No fallback unkeyed browser create. Existing `OwnerLifetime/isOwnerCurrent`, raw token/revision, mounted flag and exact operation identity remain independent necessary guards. Attempt generation is captured by rendered controls and rotated on cleanup; stale captured controls cannot begin a new intent.

- [ ] Write RED native `committed client response loss replays one mapping/item` through actual client→authenticated API→PostgreSQL and4733405 response-stream failure boundary. Assert commit/one row before loss, then same key/body yields same ID and one item/attempt; repeat concurrent actual client requests. Add transport unauthenticated401, missing/malformed key422, invalid content422, mismatch409 and deleted410 no-insert cases.
- [ ] Write API contract RED: explicit key exact header/body, missing key fails before fetch, malformed/empty acknowledgement ID attaches nothing,409/410 stable body/code, known PATCH unchanged. User POST and client signature change together with App admission below, never as a separate broken commit.

- [ ] Write RED actual App cases: commit followed by lost acknowledgement in same mount/navigation/remount/reload → explicit retry with same key/original body/one item; hydration and bootstrap matching content cause zero POST and no ID guessing; corrected precommit Save; acknowledged intent followed by intentional identical new editor uses a new key; repeated submit/save-upload overlap respects existing lock. Label HTTP as modeled; native Task1 independently proves the commit boundary.
- [ ] Add `newer raw attaches resolved ID then separate PATCH`: changed title/text/ordered media and upload acknowledgement survive; same-normalized raw revision survives; no PATCH in retry call; next Save PATCHes current raw/known ID and preserves USED/status/source authority. If replay current server content differs from frozen input, keep raw/known ID instead of clearing it.
- [ ] Add raw write/readback/clear and attempt remove/readback failure cases; compare full current snapshot, not an older same-token cache. Matching acknowledgement must persist+verify current raw with known ID or verify legitimate unchanged raw clear before exact attempt cleanup; warning retains safe envelope/known ID. Interleaved new raw must survive.
- [ ] Add `deleted resolution returns then separate fresh create`:410 preserves raw without ID, no additional transport; only verified cleanup permits subsequent explicit Save with fresh key; failed cleanup retains old key/410;409 preserves raw/envelope with no fresh key/PATCH.
- [ ] Add `Cancel/replacement is visible and resolution-only`: cancel A/open editable B preserves A envelope and visible owner-scoped notice before Save; Save B resolves A only, CREATED may update list but never attaches A ID to B, DELETED follows the same rule; B raw remains unsaved, durable cleanup then return; next Save B uses new key. A legitimate raw Cancel/replacement is the explicit exception to matched-editor ID persistence: verify preservation of any current B raw without attaching A ID; never clear B raw. Cleanup failure retains A envelope and notice.
- [ ] Add captured first-intent callback after cleanup and A→B→A success/error cases. Assert zero stale dispatch/cache/message/clear/unlock; A durable keys preserved, B reads B only, second A has new lifetime; App unmount is quiet; same-owner poll preserves identity; known-item PATCH works even when new CREATE state is corrupt/unavailable.
- [ ] Run new native/API/callback cases for intended RED. Implement required keyed API/error mapping, explicit-key client and App hydration/notice/admission/frozen retry/acknowledgement/terminal cleanup as one cutover. Keep new helpers limited to attempt storage; no generic lifecycle rewrite.
- [ ] In this same cutover, archive byte-identical4733405 diagnostic as `docs/verification/probes/cr06-main-95f53b7-library-create-ambiguity.integration.test.ts.txt`, record SHA256 and frozen-source reproduction commands. Replace active old-behavior observations with the reviewed same-key lost-ack/concurrency invariants, distinct-key intentional control and frozen-original replay plus later PATCH. Adapt existing user POST tests and Self-host callers with explicit keys. No skip, historical rewrite or delayed oracle update after committing Task3.
- [ ] Run new native/API/callback suites, types/lint/build, and `tests/library-editor-recovery.test.mjs tests/library-editor-recovery-storage.test.ts tests/library-editor-continuations.test.mjs tests/content-library-ui.test.mjs tests/owner-lifecycle-app.test.mjs`. Repeat existing isolated PR18 owner-poll/PR14/PR16/PR17 compatibility per recorded fixture instructions on current integrated runtime, without modifying frozen PR18. All must be GREEN; commit the complete atomic transport/App cutover with working browser creates and explicit reviewed oracle adaptations.

### Task4: Preserve original diagnostic and establish delivery readiness

**Files:** archived diagnostic/probe, representation-aware native/callback tests, new verification report and PR metadata; no workflow weakening.

**Interfaces:** consumes all implemented contracts; produces actual exact-head gates and independently reviewed PR for Owner merge gate. Production PASS requires separate production evidence.

- [ ] Verify Task3 archived diagnostic hash equals4733405 original and frozen-source reproduction instructions are complete. The text artifact cannot enter TypeScript compilation or active test globs. Audit active acceptance adaptations and preserved one-item invariants; no skips or rewritten history.
- [ ] Run focused matrix on actual native PostgreSQL with full PR17/CR11/Library/Swipe/Post protections. Use `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; required native 0 fail / 0 skip and all required checks PASS, baseline warnings separately. No retry/timeout increase/assertion weakening for independent failures.
- [ ] Update existing Self-host Library POST smoke for the required key, and add same-key replay after process/stack restart plus deleted-attempt persistence. Existing private-worker/media/Redis-loss checks stay unchanged. No provider sends or credentials changes.
- [ ] Push the complete candidate branch/update PR on actual main, verify actual exact-head native CI and Self-host Docker SUCCESS, native 0 fail / 0 skip; record jobs/counts/build/log limits. DRAFT stays until all gates.
- [ ] Request fresh independent final code review using requesting-code-review, approved spec/plan, exact base/head, focused diff, native/Docker evidence and declined-to-judge boundaries. Resolve same-root findings and push/reverify affected gates on the resulting exact head; independent root → STOP_SPLIT/Orchestrator. Send direct `MERGE_DEPLOY / READY_FOR_OWNER_MERGE_GATE` with concrete final PR/HEAD only after checks/review. No merge/deploy until Owner approval.
- [ ] After separately authorized coordinated delivery, compare deployed SHA and verify actual Render Library acknowledgement/reload/new-raw/terminal owner flows in browser within approved test data. Keep production acceptance separate; Library-only change needs no provider publication. Report source/CI/Docker/production and remaining limitations distinctly.

## Self-review and handoff

Server/hash/schema/media/status/provenance/deletion/native contention requirements map to Task1; envelope/bounds/fail-closed admission map to Task2; every editor/storage cleanup/Cancel/owner/callback rule maps to Task3; oracle continuity/release/readiness map to Task4. Five Review Focus lines have explicit owning test steps. Signature/key/type names agree across tasks. No unspecified runtime fallback or second owner authority.

Direct decision: `PLAN_APPROVED_WITH_TASK_BOUNDARY_CORRECTION`. Method: native executing-plans with fresh independent final review. Correction moves mandatory transport/client/App admission and corresponding active-oracle adaptation into one Task3 cutover; Task1/2 leave the existing browser path working. No additional plan review required for the mandated correction. Next: `STOP_AWAIT_OWNER_RELEASE`, prerequisite sequence #12→#13→#14→#15→#16→#17→CR11/#19; then Task0 on actual fresh main. No runtime starts in current main95f53b7; CR07/CR08/GAP01 not started.
