# Composer Upload Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep current-editor uploads locked and acknowledged through quick/full/navigation child replacement, without changing transport or submission semantics.
**Architecture:** App owns in-flight batch identity and editor-scoped acknowledgement; Composer optionally delegates file input/drop to a controlled parent interface while keeping its standalone fallback. Existing raw draft/setDraft/recovery and media upload pipeline are reused.
**Tech Stack:** Existing React/TypeScript/Node>=22.13; native PostgreSQL17/Redis7 CI. No dependency, schema or infrastructure changes.
**Spec:** [approved Option A](../specs/2026-10-05-composer-upload-continuation-design.md). Direct completed APPROVE_OPTION_A_WITH_COMPLETION_ORDER_GUARD atae0d39a. Independent direct recovery RED4/1PASS/3expectedFAIL reached before this plan. Existing execution method: inline with fresh independent final adversarial review.

## Global Constraints

- Runtime App/Composer only; no Dashboard/server/API/DB/contracts/recovery-helper/pending-creation/CR10/Library/scheduler/provider/auth/infra changes. Frozen PR12–17 untouched; base95f53b7.
- No autosave/publication, durable File/Blob queue, reload upload replay, navigation restriction or new CTA. Existing validation/limits/per-file/partial-success behavior retained.
- Parent pending count belongs to current owner/token/App generation, survives child replacement, guards actual Save/publish callbacks. Old operation cleanup cannot affect a new token/context.
- Same-token successful IDs merge into latest draft through existing setDraft; same-owner old-token assets remain global Media only; other owner/generation/unmount rejects stale continuation and messages.
- Batch completion order; file order inside each batch; existing/manual IDs stay first; first-occurrence dedup. B completes before A: existing[M1] -> [M1,B1,B2,A1,A2].
- Rendering uses state, never ref.current. Ref mutation/persistence outside React state updater functions. Raw recovery helpers/pending Post semantics remain unchanged.
- Native0FAIL/0SKIP + completed exact-head Docker, independent review and Owner merge/deploy gates remain mandatory; local callbacks are not browser/production proof.

## Review Focus

1. Overlapping batches straddling quick/full: completion order, latest manual edits, partial failures and busy until every current batch settles (Task1).
2. Stale enabled Save/publish callback after upload starts or token replacement: zero Post mutation/pending-create effect, not just disabled UI (Task1).
3. Old token cleanup/result while new-token upload awaits: asset only global Media, no attachment/message/unlock; full App unmount/other owner rejects all old continuation (Task1).
4. Shared Library/Media upload and standalone Composer: default arguments/toasts/partial success remain, independent frozen PR14 overlap retained (Tasks1/2).
5. Recovery write unavailable or ordered existing IDs: use current existing setDraft warning semantics, no new durable-success claim; acknowledgement once and direct persisted-media observation (Task1).

## Task1 — parent batches and optional Composer control (TDD)

Files: modify components/planner/app.tsx, components/planner/composer.tsx; extend tests/composer-upload-continuation.test.mjs and its actual callback fixture/helper only as needed. Existing focused/protected tests unchanged. No new runtime helper.

Interfaces produced/consumed:

```ts
// Composer exported internal client control and optional ComposerProps field.
type ComposerUploadControl = {
  busy: boolean;
  addFiles: (files: FileList | File[]) => Promise<void>;
};
// uploadControl?: ComposerUploadControl
// App-local identity; rendered owner/generation state + existing editorKey.
type ComposerUploadContext = { ownerId: string; token: string; generation: number };
type ComposerUploadBatch = { id: string; context: ComposerUploadContext };
bindComposerUploadOwner(ownerId: string): void;
isCurrentComposerOwner(context: ComposerUploadContext): boolean;
isCurrentComposerEditor(context: ComposerUploadContext): boolean;
hasPendingComposerUpload(): boolean;
uploadComposerEditor(files: FileList | File[], context: ComposerUploadContext): Promise<void>;
// Existing upload optional guards; default one-argument callers retain behavior.
upload(files: FileList | File[], canApply?: () => boolean, canNotify?: () => boolean): Promise<Media[]>;
```

App owns active batches in a ref map keyed by operation UUID and rendered pending/context state. Owner binding after bootstrap and mounted generation effect provide captured state for descriptor; actual callbacks validate recoveryOwner/current editorToken/mounted generation refs. Owner replacement invalidates old generation/batches; cleanup rejects full-App continuation. Busy derives only rendered current context count. State updates are pure; ref map changes/count calculation occur outside updaters. Existing editor-token update/reset naturally selects a new context; no cached raw editor/status rewriting.

- [ ] Reread spec/Task1; record clean base and consumed existing App token/setDraft/bootstrap/upload/Save/publish interfaces in ledger. Run fresh focused protected baseline only if runtime/source or assumptions changed; prior69/69 and exact root449/447/2 verified.
- [ ] Preserve original valid REDs and separate reached recovery RED. Extend fixture via actual descriptors/buttons/file input/drop/cache/HTTP only; do not inspect hook slots or forge editor identity. Add overlapping two-batch quick->full RED in both completion orders; expected manual[M1], B first => [M1,B1,B2,A1,A2], every applicable submit remains disabled after B until A settles. Include latest text/overrides/date/media choice edits while pending.
- [ ] Add direct callback RED: capture enabled parent/child submit before upload begins, then invoke draft/scheduled/publish while pending with valid future schedule/connected accounts. Assert zero /api/posts requests and zero pending-create cache changes. Repeat stale old-token callback after actual new/edit/duplicate identity replacement; never submit to a new editor. Pending/account/read-only/saving guards remain tested independently.
- [ ] Add old-token/new-operation RED: replace via actual App editor command while old upload awaits; start new-token upload; resolve old asset/error then old cleanup. Old asset only same-owner global Media, new raw fields/cache/count untouched, no stale message, new operation remains busy. Full App unmount and other-owner new App preserve new editor/cache/media and reject old continuation. Use callback/effect ownership, no simulated browser acceptance.
- [ ] Add navigation away/back same-token deferred upload, single/multi-file/empty/partial/duplicate acknowledgement controls, completion order and direct recovery persistence. Storage-denied control retains visible latest work/existing warning semantics and does not claim reload-safe durability. Default shared Library/Media upload still returns assets and existing success/per-file errors; standalone Composer delegates nothing when control absent.
- [ ] Run new acceptance RED serially and classify only expected root failures; existing protected baseline must remain GREEN. Initial fixture failures are not root evidence; fix fixtures before runtime. Log actual totals, no prediction substituted for results.
- [ ] Add optional ComposerUploadControl prop/hooks unconditionally. Effective busy is controlled busy when supplied, existing local busy otherwise. Controlled addFiles awaits parent and does not locally attach or decrement parent state; input/drop reuse that branch. Standalone fallback is unchanged, including the separately frozen PR14 mounted/count contract when integrated. Existing saving/account/read-only guards and labels remain.
- [ ] App creates unique batch before awaiting, validates captured current context, updates rendered current count. Reuse upload with owner/generation canApply (before each file and before data apply) and token canNotify for per-file/global messages. Default no-guard callers unchanged. Same-owner other-token assets still global; stale owner/unmounted results not applied. No second media API pipeline.
- [ ] Parent acknowledgement validates same owner/generation/token, merges successful IDs into latest raw draft via existing setDraft with first-occurrence dedup. No attachment write in child; no clear/reset/pending-save acknowledgement. Per-file order comes from existing sequential upload; whole batches append upon completion. Catch unexpected controlled failure only while current context, preserve partial successes/per-file semantics; finally deletes only own batch and updates count only for matching current context.
- [ ] Bind descriptor to rendered owner/generation/existing editorKey; reject stale upload/submit commands before work. Save/publish actual parent callback checks hasPendingComposerUpload before submission/pending-cache work; token-bound descriptor wrappers reject departed-editor callbacks. Existing retryCreation reaches same guarded methods; no pending protocol modification. No refs read in render.
- [ ] Run original4+extended actual acceptance plus protected Composer UI/raw recovery/pending/CRUD/Postedit/media-order/Swipe serial GREEN/0skip, typecheck and focused lint. Inspect UI->parent batch->existing upload->Media vs attachment->existing setDraft/cache dataflow and same-token parent submit guard. Commit/push only approved two runtime files + tests/docs.

## Task2 — final verification, review and gate

- [ ] Run complete serial local pure/protected suites, typecheck, full lint0errors/13existingwarnings and Webpack build; restore own generated tsconfig.tsbuildinfo before clean claim. Native DB/locking/worker are separately required, local skips do not replace them.
- [ ] Fresh independent whole-branch adversarial review: old operation vs new token, owner/generation/unmount, overlap completion order, direct submit/pending safeguards, cache failure, shared upload/default fallback, partial messages. Fix only same-root issues via RED->GREEN; no frozen branch edits or unrelated runtime area.
- [ ] Verify fresh main/base; optional isolated compatibility with frozen PR14/PR16/PR17 to preserve overlap/UI namespaces/Library upload guards. Keep any temporary merge uncommitted/unpushed and label supporting evidence; fresh-main release recheck still mandatory.
- [ ] Push/update DRAFT PR18; require exact-final-head native0FAIL/0SKIP with migrations/drift/types/lint/standard build and Docker HTTP/private media/workerbytes/persistence/Redis recovery/packaged build SUCCESS. One cancelled-before-steps retry is ordinary CI execution, not a product PASS; record actual attempt/job/counts.
- [ ] Record full scope/review/rulings/remaining CR06/P2/unproven backlog and clean source. Final head CI lives in canonical PR body to avoid circular report commits. Mark READY only after GREEN; send direct MERGE_DEPLOY and read completed response. No actual merge/deploy/provider sends without Owner gate; production/browser NOT PROVEN until authorized delivery.

## Self-review and handoff

Spec contracts map to Task1 parent count/identity/attachment/ordering/submit and Task2 compatibility/remote gates. Review Focus1–5 each has explicit assertions. Optional control avoids child attachment plus parent attachment duplication; owner/generation asset permission is separate from token message/attachment permission. Current shared upload one-argument behavior preserved. No durable upload protocol, recovery schema change or blind frozen-PR integration.

Plan is proportionate to one existing lifetime root: one independently testable runtime integration task and one final verification task. Existing inline execution method is preserved with fresh independent final review. PLAN_REVIEW must approve this written plan before executing Task1.
