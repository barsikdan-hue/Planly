# CR11 Owner Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate mounted App state and proved continuations when an authoritative authenticated profile changes from A to B.

**Architecture:** Option A: one App owner ID/generation authority with a synchronous transition shared by bootstrap and poll. Preserve Library's editor-specific lifecycle and existing owner-keyed recovery/pending helpers; capture App owner lifetimes for proved Composer/upload/profile paths.

**Tech Stack:** Existing TypeScript/React App, Node >=22.13.0 test runner, existing lifecycle fixture, PostgreSQL17/Redis7 CI. No dependencies added.

**Spec:** `docs/superpowers/specs/2026-10-06-owner-lifecycle-design.md` — APPROVE_OPTION_A_WITH_GUARDS.

## Global Constraints

- A durable recovery/pending stays under key A; no deletion, migration, merge or automatic retry.
- B uses B recovery/pending only, with existing bootstrap precedence and warnings; no A fallback even when B storage fails.
- Invalidate old generation before B data; every A→B→A lifetime is unique.
- Same-owner poll preserves editor/token/revision; saveLock and pending helper semantics unchanged.
- Existing Library owner binding preserved; no whole-interface key/remount or reset-everything function.
- Only proved paths admitted. No API/DB/auth/server, provider, scheduler, infrastructure or AI changes.
- Frozen PR17 unchanged; PR18 frozen DRAFT. Merge/deploy require Owner gate.
- Stacked CI NOT_TRIGGERED accepted for diagnosis, not readiness. PR17 merge → fresh-main CR11 rebase → actual native CI/Docker → PR18 integration.

## Review Focus

- A→B→A with an earlier restored editor token: first-life A callbacks remain stale despite matching owner/token.
- B unreadable/corrupt pending storage: no A fallback or silent new creation; A durable data remains untouched.
- B recovery and pending coexist: bootstrap's origin/token/acknowledged-ID precedence remains identical.
- Upload rejection after a switch/unmount: no old-owner error toast, no next file dispatched; same-owner controls still notify.
- Same-owner scheduled poll during raw edits: raw/cache/token preserved while safe server data refreshes.

## File responsibilities and interfaces

Modify only `components/planner/app.tsx` runtime. Add tests to `tests/owner-lifecycle-app.test.mjs`; use existing helpers unchanged unless a narrowly documented fixture extension is essential. Update CR11 spec/report/plan evidence. Do not change pending/recovery helper schemas or sibling frozen worktrees.

App-local types/functions:

- `type OwnerLifetime = { id: string; generation: object }`.
- `ownerLifetimeRef: MutableRefObject<OwnerLifetime | null>` is the canonical authority; rendered `ownerContext: OwnerLifetime | null` supplies captured callbacks. Remove the independent Composer `recoveryOwner` ref and read canonical ID where its existing helpers require owner. Keep Library's private binding for its protected editor guards.
- `isOwnerCurrent(context: OwnerLifetime | null): boolean` checks mounted lifetime, ID and generation identity against the current canonical ref. A returned A gets a new object. Unmount invalidates acceptance.
- `hydrateComposerOwner(snapshot: Awaited<ReturnType<typeof loadPlanner>>): void` extracts current bootstrap recovery/pending logic verbatim, using destination owner's snapshot posts/media and storage; it never dispatches network requests.
- `transitionOwner(snapshot: Awaited<ReturnType<typeof loadPlanner>>): boolean` returns false for same owner. Otherwise invalidate old authority, clear only proved owner-scoped Composer/ref/pending/notice/warning/confirmation state, create new context, install full destination snapshot, hydrate destination Composer, bind existing Library. Initial bootstrap uses this path as well. Do not reset view/query/contentTab/review/detail/account/card/child state without new RED.
- Existing internal `setDraft` continues latest-state persistence; Composer receives `setDraftForOwner: Dispatch<SetStateAction<Post>>` capturing rendered context and rejecting stale calls before invoking it. Descriptor `save`, `publishNow` and retry admission capture/check context before validation, locks, storage reads or dispatch. Existing saveLock/finally and pending helper behavior retained.
- Existing `upload(files: FileList | File[], canApply?: () => boolean): Promise<Media[]>` captures rendered lifetime and combines it with optional Library predicate. Check before each dispatch, after awaited upload, before state and toast. Return only permitted assets; physical requests already sent are not cancelled.
- Existing `updateName(name: string): Promise<void>` captures lifetime; reject stale admission and suppress old success/error application after await.

### Task 1: Canonical owner transition and proved continuation isolation

**Files:** Modify `components/planner/app.tsx` (bootstrap/poll, Composer descriptor, upload, profile, proved confirmation). Test `tests/owner-lifecycle-app.test.mjs`.

**Consumes:** Existing `loadPlanner`, editor/pending storage readers/restorers, PR17 `bindLibraryOwner`, actual App fixture/callbacks.
**Produces:** App-local interfaces above, owner-isolated Composer/recovery/pending/media/profile behavior. No exported API changes.

- [x] **Step 1: Add focused assertions for approved lifetime/storage edge cases.** Preserve the original 17. Use actual captured descriptors and scheduled polling, never private state injection. Required assertions:

```javascript
// A lifetime round trip: old callbacks cannot regain admission.
const old = value.app.composer();
await switchTo(value); await switchTo(value, 'owner');
old.setDraft(raw('stale first A', ['A']));
await old.save(old.draft, 'draft'); await old.publishNow(old.draft);
await value.settle();
assert.equal(value.app.composer().draft.text, 'A private raw');
assert.equal(value.requests.length, 0);

// Existing B recovery and pending preserve bootstrap precedence.
assert.equal(value.app.composer().draft.text, 'B owned recovery');
assert.ok(retry(value)); assert.equal(value.requests.length, 0);
// No recovery + matching Composer pending restores pending editor;
// swipe pending does not replace Composer with swipe editor.

// B corrupt recovery/read failure never retains A raw/media;
// corrupt/unreadable pending blocks, no automatic request.
assert.equal(value.app.composer().draft.text, '');
assert.deepEqual(value.app.composer().draft.mediaIds, []);
assert.equal(cache.values.get(editorKey('owner')), preservedA);
assert.equal(value.requests.length, 0);
```

Also capture the actual A retry button then switch B and invoke it: zero request, B/A caches preserved. Same-owner poll control asserts draft text/media/token/key and A cache remain unchanged. Delayed failed upload after switch asserts zero success/error messages and no second file dispatch; same-owner success/error controls prove notification behavior still works. Unmount while upload/profile response awaits asserts no toast/state/storage effect after completion.

- [x] **Step 2: Run RED and inspect every failure.** `node --max-old-space-size=512 --test --test-reporter=tap --test-concurrency=1 --experimental-strip-types tests/owner-lifecycle-app.test.mjs`. Original evidence is 17/3 PASS/14 FAIL/0skip. Record actual expanded totals; controls may already pass. Correct fixture faults before calling a result product RED. No weakening old assertions.

- [x] **Step 3: Implement transition/hydration interfaces in App.** Preserve bootstrap's exact cache handling and copy. New canonical owner replaces Composer-only recoveryOwner. Set new generation and reset proved active refs before B snapshot; install B data before B hydration. Use destination snapshot arrays directly during hydration, not asynchronous `dataRef`. Preserve A keys and B recovery/pending precedence. Same-owner poll remains on its existing revision-aware path.

- [x] **Step 4: Implement admitted callback/continuation guards.** Guard exposed Composer changes and save/publish/retry before side effects. Generic upload combines canonical owner with optional Library guard; old-owner errors/messages stay quiet. Profile success/error validates captured lifetime. Preserve Library's current guarded callbacks and same-owner behavior. Do not broaden unrelated async paths from inventory alone.

- [x] **Step 5: Run focused GREEN and protected baseline.** All original plus added cases pass with zero skips. Protected 8 files from the diagnostic report must retain all 128 PASS. If a regression/new independent root appears, stop and send a documented STOP gate rather than extending runtime silently.

- [x] **Step 6: Commit and push bounded runtime checkpoint.** Record exact changed files/exclusions and focused/protected actual counts in report. Stage App/tests/report/plan only; `git diff --check`, clean verification, commit `fix(planly): isolate mounted owner lifecycle`, push current branch. DRAFT maintained.

### Task 2: Independent review, verification and release dependency evidence

**Files:** Test/report/plan updates only unless final reviewer establishes an in-scope correction. PR18 integration worktree remains disposable evidence, not copied into CR11 diff.

**Consumes:** Task1 behavior and interfaces; frozen PR18 actual 3-case owner-poll probe and compatibility suite.
**Produces:** Reviewed CR11 checkpoint and clear dependency/CI status; not production acceptance.

- [x] **Step 1: Run serial pure suite, typecheck, full lint and local Webpack build.** Use existing campaign selection excluding native integration/self-host/current-build fixtures when local PG/Redis unavailable. Report actual counts and existing warnings. Restore only own generated tsconfig.tsbuildinfo. No local skips passed off as native proof.

- [x] **Step 2: Obtain one fresh whole-branch review per selected execution skill.** Review against approved spec, all 17 preserved tests, five Review Focus cases and explicit scope exclusions. Resolve Important/Critical findings with meaningful RED→minimal GREEN within contract, then appropriate regression. Follow the executing skill's one-review/fix-pass rule if native selected.

- [x] **Step 3: Supporting isolated integration with frozen PR18.** Apply reviewed CR11 patch to preserved PR14/16/17/18 compatibility tree without editing frozen branches. Resolve only syntactic interface overlap according to canonical owner authority, retaining CR09 batch/editor token semantics. Run the 3 independent owner-poll checks (global Media B, A recovery unchanged, old toast absent) and full existing compatibility selection/typecheck. If new conflict reveals architecture outside contract: STOP_SPLIT, no copied edits into PR18. Passing here is supporting evidence; fresh-main verification is still required.

- [x] **Step 4: Publish exact checkpoint evidence.** Report tests/build/review/supporting integration, push, update PR19 and query actual exact-HEAD workflow runs. With stacked base and unchanged workflows, NOT_TRIGGERED stays explicit. Status is IMPLEMENTED_AWAITING_PR17_MERGE_AND_EXACT_HEAD_CI, never READY. No Owner request to manually relay report.

- [ ] **Step 5: Respect dependent merge gate.** Direct Orchestrator gate presents completed evidence and PR17 dependency. After actual Owner-approved PR17 merge, rebase CR11 onto verified fresh main, update PR base, run actual native/Docker CI at new exact HEAD and required compatibility tests. Only then request CR11 OWNER_MERGE_GATE. PR18 returns to READY only after its own fresh integration and CI; no merge/deploy performed from this plan approval.

## Plan self-review and execution request

The plan maps every approved state/path to Task1, preserves excluded states, defines shared signatures once and pins all five Review Focus conditions. It does not claim root cause for save already in flight or child-local state. Recommended execution: **Native / executing-plans**, because one App lifecycle boundary owns the tightly coupled transition and guards; one fresh final reviewer can assess the whole contract. Request direct Orchestrator PLAN_REVIEW and execution-method selection before any runtime edit.

Execution selected by completed direct Orchestrator PLAN_REVIEW at `31c5a8a`: Native / executing-plans; App-only runtime authorized. Task1 expanded/protected GREEN164/164/0skip; Task2 pending.

Task2 stacked verification stage complete: pure359/359, expanded/protected164/164, freshreview36/36/nofindings, supporting39/39and298/298/typecheck. Wholeproject531/360PASS/171declaredlocalenv-platformFAIL/0skip documented byname. Dependent fresh-main/CI/Owner gate remains pending; preserve workspace.
