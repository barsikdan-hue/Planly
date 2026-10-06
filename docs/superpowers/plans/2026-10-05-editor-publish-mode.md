# Editor Publish Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox tracking.

**Goal:** Preserve the same editor's explicit Now/Scheduled choice through navigation and reload without changing publication lifecycle or frozen retry semantics.

**Architecture:** PlannerApp owns a separate EditorUiIntent; Composer receives controlled mode/callback. Optional UI metadata shares recovery's atomic content envelope and is separately captured in pending creation only for fallback. Server-content comparisons remain unchanged.

**Tech Stack:** existing React/TypeScript/Zod, sessionStorage, Node test hook harness; Node >=22.13.0, native PostgreSQL17/Redis7 CI. No dependency additions.

**Spec:** [approved Option A with guards](../specs/2026-10-05-editor-publish-mode-design.md). Orchestrator IMPLEMENTATION_APPROVED received at e016dfe; Tasks1–3 completed inline in isolated worktree, independent adversarial review found no concrete new runtime defect. Task4 oracle interpretation APPROVE_OPTION_A received at d93d2e6; final-head checks required after documentation/test update.

## Global constraints

- UI mode is not Post.status, EditorFields, API DTO, DB, canonicalCreationInput or server lifecycle.
- Recovery v1 owner/session key unchanged; content + optional UI one envelope. Bad optional UI must not invalidate good content or pending input.
- Pending key/input/intent/time/token/origin/PATCH decision remain unchanged by UI-only changes. Swipe origin omits Composer UI.
- Mode-only changes create a new editor revision, never a submission. Full current content+UI durability is required before pending cleanup; storage failure fails safe.
- Existing content-based replacement policy unchanged. Generic/Library/media/copy initialize Now; existing edit defaults from server lifecycle; same-editor stored UI overrides only presentation.
- No merge/deploy/provider messages. PR12–15 frozen. Calendar initial mode belongs to PR15; fresh-main compatibility recheck after its authorized merge.

## Review focus

1. Legacy/corrupt optional metadata retains good content and original replay request — Task1/2 parsing cases.
2. Mode-only change after lost publish-now response keeps original timestamp/key/body and no PATCH — Task2/3 deferred-fetch cases.
3. Acknowledged ID with failed UI write never proves current editor durable — Task3 fail-once storage case.
4. UI switch during an in-flight save survives its acknowledgement — Task3 revision case.
5. Matching-token pending fallback cannot overwrite newer recovery UI or capture Swipe origin — Task2/3 hydration cases.

## File map and interfaces

Modify only `lib/client/editor-recovery.ts`, `lib/client/pending-creation.ts`, `components/planner/app.tsx`, `components/planner/composer.tsx`; add/update focused tests and report. No unrelated extraction or lifecycle refactor.

`editor-recovery.ts` produces:
- `EditorUiIntent = { publishMode: 'now' | 'scheduled' }`.
- `optionalEditorUiSchema`: parses valid metadata; malformed/absent values become undefined, with strict valid-mode object shape.
- `initialEditorUi(post: Pick<Post,'status'>): EditorUiIntent`: scheduled only for scheduled status; otherwise now. Never infer from date/time.
- `writeRecovery(storage, ownerId, fields: EditorFields, ui?: EditorUiIntent): boolean`: same v1 envelope/key, optional ui beside editor, existing size and write/read validation.
- `readRecovery(...)`: existing editor/unavailable/invalid plus optional `ui`; absent/corrupt optional UI does not add mandatory result fields or reject valid editor.
- `clearSavedRecovery(storage, ownerId, submitted: EditorFields, submittedUi?: EditorUiIntent): boolean`: existing content match plus explicit UI match when supplied. Omitting UI preserves legacy content-only callers/tests. `restoreRecovery` and `shouldReplaceEditor` retain signatures/semantics; their content projection/equality stays UI-free.

`pending-creation.ts` consumes these types/schema and produces existing `PendingCreation` with optional `editorUi`; extend submitPendingCreation options with optional editorUi. Store only for a new non-Swipe pending request. Preserve all existing positional arguments, payload schema, content equality and canonical payload logic. Corrupt optional metadata is discarded during parsing without rejecting the valid durable request.

`ComposerProps` gains optional `publishMode` and `onPublishModeChange(mode)` for controlled App usage. Keep local fallback initialized from draft.status for existing standalone Composer consumers/SSR tests; hook ordering remains unconditional. Actual App always supplies both. Mode callback has no save/publish side effect. Quick actions and unrelated local UI state remain unchanged.

## Task1 — atomic recovery metadata (TDD)

Files: editor-recovery.ts; new tests/editor-ui-recovery.test.ts; existing editor-recovery tests protected.

- [ ] Add RED: round-trip explicit Scheduled with Draft content; explicit Now with server-Scheduled restore; legacy no-ui; bad ui object/enum/oversize/unknown fields retains valid text/media; bad content still rejected; owner/tab isolation; future date does not imply Scheduled. Assert raw JSON has ui beside editor and never status/targets.
- [ ] Add cleanup RED: changed explicit mode cannot be cleared by old submitted mode; matching pair clears atomically; legacy caller remains content-only; quota failure retains older usable envelope and returns false.
- [ ] Run `node --test --test-concurrency=1 --experimental-strip-types tests/editor-ui-recovery.test.ts tests/editor-recovery.test.mjs`; verify new assertions fail for missing metadata, not loader/import failure.
- [ ] Implement the interfaces above. Keep encoded content equality independent of UI for replacement and pending consumers; explicit UI cleanup comparison is separate.
- [ ] Re-run Task1 command and require zero failures/skips; inspect diff for schema/API lifecycle leakage, commit bounded recovery change.

## Task2 — pending fallback without replay changes (TDD)

Files: pending-creation.ts; new tests/pending-editor-ui.test.ts; pending-creation.test.ts protected.

- [ ] Add RED: capture Composer ui once before fetch; optional metadata retained across acknowledgement; legacy/no-ui replay works; malformed editorUi does not reject original valid key/input; Swipe origin never captures metadata.
- [ ] Add lost-response RED with two explicit mode values on successive calls. Assert same POST key/body/intent/frozen scheduledAt, fresh input callback not invoked, no PATCH; acknowledgement/source-ID normalization remains intact.
- [ ] Run `node --test --test-concurrency=1 --experimental-strip-types tests/pending-editor-ui.test.ts tests/pending-creation.test.ts`; verify missing-metadata RED and existing retry controls.
- [ ] Implement optional schema field and options capture only when creating non-Swipe pending. Existing record is never rebuilt because of UI change; editorFields/canonical comparison remains untouched.
- [ ] Re-run command with zero failures/skips, inspect immutable fields, commit bounded pending metadata change.

## Task3 — parent-owned UI + paired durability (TDD)

Files: app.tsx/Composer; tests/editor-mode-recovery.test.mjs + loader; new tests/editor-mode-save-lifecycle.test.mjs. Protect composer-customer-ready-ui, post-edit-app-lifecycle, editor-recovery-lifecycle.

- [ ] Extend actual App+Composer RED matrix: both existing reload failures; navigation/remount; explicit mode-only choice with no text; default/new/Library/media/copy reset; current server status/targets/read-only authority; missing post/media; mode toggle sends no mutation. Existing generic control remains.
- [ ] Add deferred-save RED: mode switch while save pending increments revision, does not send request, acknowledgement retains newer mode/content and attaches saved ID; untouched editor clears/reset Now. Save Draft payload is DRAFT/null schedule regardless of tab; Scheduled action keeps future validation.
- [ ] Add durability RED: after saved-ID attachment, fail UI/content envelope write and keep pending request; ID-only match cannot clear it. Recovery text/metadata retry succeeds without a new creation key. Test storage blocked/quota paths and rapid mode flips.
- [ ] Add hydration/retry RED: recovery UI wins over older pending UI; absent recovery uses matching-token pending metadata; wrong tokens/Swipe do not replace editor; malformed optional UI preserves valid frozen request. Lost publish-now response→reload→mode-only change→retry asserts original key/body/time and no PATCH.
- [ ] Run focused command covering Task3 new tests plus existing protected files; record meaningful RED before product changes.
- [ ] Add UI state/ref and persisted UI snapshot in App. Mode change increments editorRevision and persists current content+UI outside React updater functions. setDraft persists with current UI. Every failed write invalidates local durability snapshots while keeping older storage and warning.
- [ ] Centralize paired persistence and exact current durability comparison locally in App. clearSubmittedEditor requires unchanged revision and durable current pair before matching content/UI removal. acknowledgeEditor replaces the ID-only shortcut with full current pair durability; failed persistence never completes pending. Do not put UI into submit content equality.
- [ ] Update all existing transition sites: initial/bootstrap restoration and its rewrite; matching pending fallback and acknowledged ID attachment; replacement/duplicate/new identity; successful clear/reset. Assign new UI before the existing setDraft persistence so each envelope is coherent. Mode-only changes do not change pending submission intent.
- [ ] Pass UI/callback in App's composer props and ui in submitPendingCreation options. Controlled Composer renders supplied mode; actual Tabs callback updates parent. Keep local fallback and Quick explicit actions for compatibility; preserve upload code unchanged.
- [ ] Re-run focused and Task1/2 tests with zero failures/skips. Require content-only dirty guard behavior unchanged. Inspect resulting UI state flow and exact persisted pair, commit bounded integration.

## Task4 — full verification/review/delivery gate

- [ ] Run protected local suites serially, typecheck/lint/build; restore own generated tsconfig.tsbuildinfo. No database-less skips as native proof.
- [ ] Push/update DRAFT PR16; native PostgreSQL/Redis full suite, migrations/typecheck/lint/standard build and Docker HTTP/private-media/persistence/Redis recovery must pass. Known13 lint warnings may remain unchanged.
- [ ] Independent adversarial review focuses on frozen key/time/body/PATCH, malformed metadata salvage, rapid mode/save races, full-pair durability, identities/legacy/pending fallback and Swipe exclusion. New within-scope defects get their own RED→GREEN.
- [x] Verify isolated compatibility with PR15 Calendar initialization; repeat on fresh main before release. Orchestrator APPROVE_OPTION_A explicitly resolves the original lifecycle-as-UI conflict: frozen PR15 reload oracle stays unchanged as historical evidence; ONLY status=Scheduled assertion is superseded. Active CR10 acceptance requires unsaved lifecycle Draft + UI Scheduled + preserved date/time + real Composer Scheduled controls + zero mutations. Original initial tests5/5PASS, companion oracle1/1PASS; historical oracle remains separately expected RED. No runtime workaround.
- [ ] Report exact scope/evidence/SHA, final-head CI/runtime, clean diff; mark READY only after GREEN. Direct Orchestrator MERGE_DEPLOY; no delivery without Owner gate. Production/browser acceptance remains NOT PROVEN until authorized deployment.

## Self-review / handoff

Spec guards1–9 map to interfaces and Tasks1–3; each Review Focus has a RED case. Shared content signatures stay compatible, optional metadata is not mandatory, no DB/data migration. Recovery identity uses the existing owner session envelope and pending tokens; no independent UI storage key. Runtime implementation begins only after direct Orchestrator PLAN_REVIEW returns IMPLEMENTATION_APPROVED. Native inline execution is the existing campaign method; separate independent review remains required.
