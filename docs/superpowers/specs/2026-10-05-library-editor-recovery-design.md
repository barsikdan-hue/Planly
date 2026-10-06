# CR-05 Library editor recovery — approved representation

STATUS: IMPLEMENTATION_APPROVED. Orchestrator APPROVE_OPTION_A_WITH_GUARDS explicitly approves parent lifetime, separate recovery and all three fallback policies; subsequent PLAN_REVIEW approved inline implementation at3b2e9a1722fb6ac0988fd9c278d32ebdfb90361e. Runtime verification is in progress in the three approved areas. PR12–16 frozen READY, pending Owner merge/deploy gates.

## Intent and root

Preserve the same unsaved Library editor's raw title/text, ordered media and existing identity through navigation, Swipe remount and same-tab reload. Explicit Save remains the only content submission; Cancel remains explicit discard. No autosave or new product flow.

Fresh authority: main95f53b7d18e656e0f8ceff5002b4c42af3d12251, work/Planly-library-recovery, codex/customer-ready-library-recovery.

ContentLibrary::editor is component-local useState(null). Input/selectMedia callbacks update only that child. PlannerApp conditionally renders ContentLibrary when view=content and !reviewing; navigation/Swipe unmount loses the editor. Bootstrap only reloads server Library items. Actual App+Library RED4total/1same-mountcontrolPASS/3expectedFAIL: new navigation, new same-tab reload, existing edit remount lose the title/form; fields/media are correct before transition, zero mutations.

Continuation evidence: ContentLibrary::submit clears only while child mounted; App::saveLibraryItem updates items but returns void, dropping the known saved DTO identity. ContentLibrary::addFiles likewise attaches only while mounted. New child resets lock/busy. Recovery alone without parent continuation ownership risks resurrecting an acknowledged new editor or losing uploaded attachments.

## Options

A — parent-controlled Library editor/operation state plus a separate owner/sessionStorage recovery helper. Parent survives child navigation/remount and owns known save/upload acknowledgement. Recommended; client callback interface changes only.

B — child-owned state plus storage on each change. Smaller first diff, but multiple child instances then need shared operation/acknowledgement coordination; complexity exceeds A once deferred save/upload is included.

C — navigation/beforeunload discard warning only. Avoids storage but does not recover actual reload or accepted navigation; materially weaker product behavior.

## Approved Option A contract

Runtime areas: components/planner/app.tsx, components/planner/content-library.tsx, new lib/client/library-editor-recovery.ts. No Composer/editor-recovery/pending-creation changes, no API/DB/server/shared Library input schema changes, no scheduler/providers/auth/infra. Client-only callback returns/optional controlled props may change; standalone Library compatibility retained.

Parent owns active Library editor, stable editor token/revision, durable snapshot and operation lock/busy/errors for editor saves/uploads. Archive/Restore/Delete card commands remain distinct; their acknowledgements never clear an unrelated open editor. Preserve existing libraryRevision list/poll protection.

Separate owner-keyed v1 sessionStorage envelope (not Composer key): `{version:1,token,revision,editor:{id?,title,text,mediaIds}}`. Validate raw strings, ordered unique IDs, token/revision and total size<=150000. Do not reuse submission schema: it trims and rejects empty/title-only drafts. No File/Blob, secrets, status, sourcePostId or server updatedAt in recovery. Closed editor has no record; empty/title-only open editor is valid recovery state. Other owner/tab cannot restore it.

Fresh server Library DTO remains authority for status/provenance. Existing ARCHIVED edit sends ARCHIVED; other existing edit sends READY as today, and server updateLibraryItem retains USED. Recovery overlays editable content only, not a cached lifecycle. Missing existing item retains its ID with visible conflict; never convert automatically into a new POST. Unavailable media are excluded with a notice; preserve remaining order and text. Invalid/oversized metadata is rejected safely; no submission during restore.

Every editor update persists coherent snapshot outside React updater functions. Failure keeps in-memory work and older cache, invalidates durability proof and warns. Successful Cancel removes only the current matching record, then closes editor; failed durable removal retains editor with error so cancelled work cannot silently resurrect.

Editor Save captures owner/token/revision/content and uses existing API path exactly once. Server DTO always refreshes Library data under existing revision guard. Same untouched durable editor may be cleared conditionally after acknowledgement. Newer revision of the same editor preserves fields and attaches a known returned new ID so a subsequent save is PATCH. Different token/owner/unmounted App ignores stale editor mutation. Failed write/removal cannot count an older snapshot as current durability.

Parent-owned operation lock survives child remount: no second editor save/upload while one is pending. Successful upload result attaches ordered IDs to current fields of only the originating editor token even if child unmounted; other editor/cancel never receives stale attachments. Uploaded assets still enter the shared Media library through the existing upload path. Full App unmount/owner replacement invalidates old continuation.

Failed save retains editor. Truly lost creation response still has unknown saved ID: no auto-retry/guess, no new idempotency request in CR05. Existing CR06 POST duplicate-on-explicit-retry defect remains a separate bounded server/client task; do not claim it fixed by recovery or introduce a second creation pipeline.

## Acceptance and gates

New/existing navigation, Swipe remount, same-tab reload: raw title/text, media order and identity; no mutations. Existing identity must be demonstrated by subsequent PATCH, not heading alone. Empty/title-only/media-only, cancel/reload, corrupt/oversized/unavailable storage, owner/tab isolation, missing item/media, fresh READY/ARCHIVED/USED/provenance authority.

Deferred successful save after child unmount must not resurrect a confirmed new editor; remount cannot submit twice; newer same-token work keeps fields and acknowledged ID; different-token/owner continuations ignored. Storage failure cannot falsely clear; failed/lost response keeps fields with zero automatic retry. Upload/navigation and stale result isolation; polling cannot replace unsaved editor or newer acknowledged Library data. Protect existing Library CRUD/conversion, Composer recovery and Swipe behavior.

Sequence after representation approval: writing-plans with exact interfaces/tests/tasks → direct plan review/IMPLEMENTATION_APPROVED → TDD sequential implementation → independent adversarial review → full native PostgreSQL/Redis/type/lint/build + Docker exact-head → READY direct Orchestrator gate. No merge/deploy without Owner approval; no provider sends. Production/browser acceptance remains separate.

## Self-review

Root isolated from CR06 and CR10; content/lifecycle semantics preserved; no autosave or shared storage key; continuation ownership covers navigation instead of adding component-only cache. Missing-item, missing-media and failed-Cancel behavior are explicit review decisions. Initial root/RED checkpoint preceded runtime implementation; approval and implementation evidence are recorded separately in the verification report.
