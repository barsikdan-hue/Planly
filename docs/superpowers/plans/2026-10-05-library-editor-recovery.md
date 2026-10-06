# Library Editor Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve one unsaved Library editor and its known save/upload continuations through navigation and same-tab reload without automatic submission.

**Architecture:** PlannerApp owns Library editor identity/revision, recovery durability and operation lock. ContentLibrary receives an optional controlled editor interface with a legacy standalone fallback. A separate owner/sessionStorage helper stores raw editable fields only; server DTO controls lifecycle/provenance.

**Tech Stack:** Existing React/TypeScript/Zod/sessionStorage; Node>=22.13.0, native PostgreSQL17/Redis7 CI. No new dependencies.

**Spec:** [approved representation](../specs/2026-10-05-library-editor-recovery-design.md). Orchestrator APPROVE_OPTION_A_WITH_GUARDS includes missing-item/media/failed-Cancel policies; PLAN_REVIEW returned IMPLEMENTATION_APPROVED at3b2e9a1722fb6ac0988fd9c278d32ebdfb90361e. Existing campaign execution is inline, followed by fresh independent adversarial review.

## Global Constraints

- Runtime files only App/ContentLibrary/new Library recovery helper; no API/DB/shared contracts/Composer recovery/frozen pending/scheduler/providers/auth/infra changes.
- Separate key `planly:library-editor:v1:${encodeURIComponent(ownerId)}`; version1, total JSON length<=150000; no trim/submission schema for recovery.
- Raw title/text and ordered unique media IDs only, optional existing ID, UUID editor token, nonnegative safe-integer revision. No status/sourcePostId/server timestamps/secrets/File/Blob in recovery.
- Explicit Save validates existing limits title200/text20000/media20 and trims input; new item POST omits status; existing item PATCH derives ARCHIVED vs READY from current server DTO, server retains USED.
- Missing existing item retains ID, visible conflict and disabled Save; no automatic POST. Missing media excluded with notice, remaining order/text retained. Failed durable Cancel keeps form/error.
- No autosave/auto-retry/guessing unknown ID. CR06 truly lost response idempotency remains independent; no duplicate-proof lost-response claim.
- PR12–16 frozen; no main merge/deploy/provider sends. Current fresh base95f53b7.

## Review Focus

1. Successful new save arrives after child unmount/newer revision: retain current fields and known saved ID or conditionally clear; never a second POST from received acknowledgement (Task2).
2. Old token/owner/App generation save/upload result: no editor/cache writes or cross-owner data update; assets from cancelled editor remain only in same-owner Media library (Task2).
3. Quota/remove failure with old cache: old snapshot is not current durability; explicit Cancel may discard an older record of the same token, never another token (Tasks1/2).
4. Empty/title-only/raw whitespace and missing source/media: preserve editable work, current lifecycle/provenance and remaining attachment order, no restore mutation (Tasks1/2).
5. Child remount during operation, polling and generic Archive/Restore/Delete: parent lock holds, server list revision protection remains, card acknowledgement cannot clear form (Task2).

## Task1 — separate Library recovery representation (TDD)

Files: create lib/client/library-editor-recovery.ts and tests/library-editor-recovery-storage.test.ts. Existing library-editor-recovery.test.mjs RED is unchanged.

Interfaces produced:

```ts
type LibraryRecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type LibraryEditorFields = { id?: string; title: string; text: string; mediaIds: string[] };
type LibraryEditorSnapshot = { version: 1; token: string; revision: number; editor: LibraryEditorFields };
libraryRecoveryStorage(): LibraryRecoveryStorage | null;
libraryEditorKey(ownerId: string): string;
libraryEditorFields(fields: LibraryEditorFields): LibraryEditorFields;
readLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string): {
  snapshot: LibraryEditorSnapshot | null; unavailable: boolean; invalid: boolean
};
writeLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string, snapshot: LibraryEditorSnapshot): boolean;
clearSavedLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string, submitted: LibraryEditorSnapshot): boolean;
discardLibraryEditorRecovery(storage: LibraryRecoveryStorage, ownerId: string, token: string): boolean;
restoreLibraryEditorRecovery(snapshot: LibraryEditorSnapshot, items: Pick<LibraryItemDto, 'id'>[], media: Pick<Media, 'id'>[]): {
  snapshot: LibraryEditorSnapshot; missingItem: boolean; missingMediaCount: number
};
```

- [ ] Write storage RED for raw round-trip, empty/title-only/media-only forms, B→A order, no lifecycle/provenance leakage; malformed/version/UUID/revision/duplicate IDs/oversize rejection; owner/tab isolation; missing existing ID retained and only missing media filtered with notice flags; quota/read/remove errors.
- [ ] Write clear-vs-discard RED: saved cleanup requires exact current token/revision/raw content; changed token/revision/text/order cannot clear. Explicit discard removes current matching token even if its cached revision is older after failed write, or succeeds idempotently if absent; foreign/invalid record cannot be erased; remove failure false.
- [ ] Run `node --test --experimental-strip-types tests/library-editor-recovery-storage.test.ts`; meaningful expected unsupported-helper RED, no fixture/import configuration failures. Then implement helper only, outside server/submission schemas.
- [ ] Projection clones ordered IDs and omits all noneditable fields; whole-envelope validation/size check before setItem. Failed set keeps old record. Saved-clear rereads/exact-matches full snapshot; discard rereads/token-matches; both remove synchronously and report failure honestly. Restore keeps ID/token/revision, filters available IDs in original order and returns missing flags, no submission.
- [ ] Run same command GREEN plus existing editor-recovery tests; inspect keys/status exclusions, commit bounded helper change. App recovery RED remains expected until Task2.

## Task2 — parent ownership and continuations (TDD)

Files: App/ContentLibrary; extend tests/library-editor-recovery.test.mjs; create tests/library-editor-continuations.test.mjs and shared tests/helpers/library-editor-fixture.mjs (actual callbacks, existing hook loader). Protect content-library-ui/editor-recovery-lifecycle/post-edit-app-lifecycle/swipe-planner-app.

Interfaces consumed: Task1 snapshot/storage/projection/read/write/clear/discard/restore.

ContentLibrary optional client-only control produced:

```ts
type LibraryEditorControl = {
  editor: LibraryEditorFields | null; busy: boolean;
  error: string | null; notice: string | null; blockedReason: string | null;
  onChange: Dispatch<SetStateAction<LibraryEditorFields | null>>;
  onError: (message: string | null) => void;
  save: (fields: LibraryEditorFields) => Promise<void>;
  upload: (files: FileList | File[]) => Promise<void>;
  cancel: () => void;
};
// Add only optional `editorControl?: LibraryEditorControl` to existing props.
```

App-local functions/ownership:

- `changeLibraryEditor(update: SetStateAction<LibraryEditorFields|null>, expectedToken: string|null): void`; parent control closes over the rendered token, stale child command rejected. Functional field edits retain token and increment revision; new/edit identity creates UUID. IDs change only on explicit identity/hydration/known acknowledgement. Null routes to explicit durable discard.
- `persistLibraryEditor(snapshot: LibraryEditorSnapshot): boolean`; updates local durability proof only on full successful write; storage failure invalidates it and warns while keeping memory/older storage.
- `cancelLibraryEditor(expectedToken: string|null): void`; requires active owner/token, discard helper success, then closes/reset error/notice. Failed remove keeps editor. This is explicit discard, not saved durability.
- `saveLibraryEditor(fields: LibraryEditorFields, expectedToken: string|null): Promise<void>`; lock, owner/token/generation/snapshot capture, raw validation/trim, missing-source guard, existing API call and conditional acknowledgement below. Catch sets parent error and retains form; no rejected unhandled click promise.
- Existing `saveLibraryItem(input,id?): Promise<LibraryItemDto>` now returns the received DTO; existing archive/restore callers ignore it. Data/list updates retain libraryRevision and apply only to captured active owner/App generation, regardless of editor token. No card command clears form.
- `uploadLibraryEditor(files, expectedToken): Promise<void>`; capture same guards/lock, use existing upload path with optional owner/App apply guard, then merge result IDs only into current same-token raw fields. Do not introduce another media API pipeline.
- Existing `upload(files, canApply?:()=>boolean): Promise<Media[]>` preserves default one-argument behavior for Composer/MediaLibrary. Only Library supplies guard: check before each file and before data/toast application; cancelled/different editor still stores assets in same-owner Media, different owner/App unmount never updates old data. Attachment token check is separate.
- Available server Media from poll is applied only when its captured mediaRevision is still current; existing upload/delete acknowledgements advance the counter, so stale poll cannot erase known assets or attachments. Partial polling fixtures without profile/media preserve the existing Post/Library polling path.
- Parent owns snapshot ref/state, persisted snapshot proof, operation ref/busy/error/notice, active App generation. Descriptor uses state for render, refs only in callbacks/effects. Operation unlock only its own captured operation; stale result cannot unlock a newer owner operation.

- [ ] Extend RED matrix: new/existing navigation, Swipe remount, reload, title-only/empty/media-only/raw whitespace, ordered attachments; post-recovery known ID Save must PATCH. Fresh READY/ARCHIVED/USED/provenance controls; missing item ID retained/Save blocked/no POST; missing media filter+notice; Composer key remains independent.
- [ ] Add actual deferred save RED: start Save, unmount/remount child, busy still true and second callback cannot dispatch; successful untouched save closes only its own matching durable record even while child absent. Newer same-token fields during flight persist plus returned create ID; next Save PATCH. Different token/owner/App-unmount result cannot clear/write another form/cache.
- [ ] Add storage/Cancel RED: current write fails after older durable snapshot, acknowledgement cannot use older proof; failed remove keeps form/error; restored storage permits explicit same-token Cancel of older cache with no ghost reload. Failed/lost response keeps raw content with zero automatic retry; CR06 unknown-ID retry not claimed fixed.
- [ ] Add upload RED: completion after navigation attaches ordered IDs on return; remount lock blocks second upload/save; partial success and20-limit retained; cancelled/different-token result only updates same-owner Media; different owner/unmounted App receives no state/cache changes.
- [ ] Add generic Archive/Restore/Delete and poll controls: server list data may change, unsaved fields are retained; no card acknowledgement clears form. If available Media changes during navigation, filter only disappeared IDs with notice, preserving current token/title/text/order. Poll status/provenance stays server-authoritative.
- [ ] Run focused actual-callback tests before App/Library changes and record declared RED separately from existing baseline failures. Refactor fixture only when assertions/setup are unchanged; no status/identity proxy replaces real payload/controls.
- [ ] Integrate parent state and bootstrap after owner binding using Task1 restore helper; no hydrate API mutation. Server data effects reconcile missing media with notice, never replace raw title/text/ID or replay cached status. Current missing source derives blockedReason from server list; explicit Save also checks it.
- [ ] Acknowledge editor save only if active captured owner/generation/token. Same revision/content plus exact current durable snapshot may clear via saved helper. If newer work or failed clear, preserve fields, attach known returned ID for new creation, increment/persist snapshot and keep form. Failed persistence never proves cleanup. Unknown/lost response never guesses ID or auto-replays.
- [ ] Control ContentLibrary fields/save/upload/cancel with parent object; keep hooks/local fallback unconditional and existing standalone CRUD/media/error behavior. Parent control handles validation/errors and operations; card perform stays distinct. Use existing notice/error styling, no new product CTA.
- [ ] Run focused+Task1+protected command serially GREEN/0skip, typecheck/lint; inspect exact UI→parent→storage→ack path and unchanged API payload/status/USED authority, commit bounded integration.

## Task3 — final verification and gate

- [ ] Run serial protected/full local pure checks, typecheck, full lint13existingwarnings only, local Webpack build; restore generated tsconfig.tsbuildinfo. Native PostgreSQL/Redis suite/migrations/standard build required; local skips cannot substitute.
- [ ] Fresh independent adversarial review covers storage failure/old proof, token/revision/owner/generation, post-unmount save/upload, duplicate operation prevention, known create ID→PATCH, missing source/media, lifecycle authority and CR06 boundary. Fix only within same root via RED→GREEN.
- [ ] Verify fresh main/base; push/update DRAFT PR17 and require actual exact-final-head native0fail/0skip + Docker HTTP/private media/persistence/Redis recovery completed SUCCESS. Report actual counts rather than predicted totals; no provider sends.
- [ ] Optional isolated integration with frozen PR16 as supporting compatibility proof for two independent editor namespaces; no frozen branch edit or dependency dragged into PR17. Fresh-main compatibility recheck remains required before actual release train merge.
- [ ] Record exact scope/SHA/CI/runtime/clean diff and remaining CR06/CR09/P2/unproven backlog, mark READY only after GREEN and direct Orchestrator MERGE_DEPLOY. No human relay/merge/deploy without Owner gate; production/browser acceptance NOT PROVEN before authorized delivery.

## Self-review and handoff

Spec guards map to Task1 raw/identity/schema/durability and Task2 parent operation/continuation/server-authority rules; Review Focus1–5 have explicit tests. Saved cleanup and explicit Cancel have different authorization semantics, preventing permanent ghost forms after a failed write without treating old cache as save durability. Optional upload guard preserves all existing non-Library behavior. Client-only callback DTO return is not an API contract change. No independently scoped CR06 pipeline included.

Direct PLAN_REVIEW approved existing inline execution at3b2e9a1. Execute Task1→Task2→Task3 within the approved scope; next normal Orchestrator gate is READY_FOR_OWNER_MERGE_GATE.
