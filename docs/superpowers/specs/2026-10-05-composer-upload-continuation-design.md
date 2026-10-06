# CR09 Composer upload continuation — representation proposal

STATUS: APPROVED_OPTION_A_WITH_COMPLETION_ORDER_GUARD atae0d39a1784fefb5d8a94b1967f0d552eccaef8f via completed direct Orchestrator reply. Writing the plan is approved; runtime requires separate PLAN_REVIEW approval.

## Intent and proven root

Customer uploads a file in Dashboard quick Composer, then opens the full editor while upload awaits. The same App-owned raw draft must receive the uploaded attachment and keep submission disabled until its uploads settle. No automatic save/publication or new upload pipeline is requested.

Actual path: PlannerApp composer descriptor -> Dashboard quick Composer and expand navigate('create') -> full Composer at another tree position. App draft/token survives navigation; child mounted flag and busy state do not. Composer::addFiles calls App upload, then attaches only while mounted.current. App::upload stores returned assets globally, but owns no editor continuation/lock. First broken layer: child ownership of an operation whose editor outlives that child.

Three actual App/Dashboard/Composer callback probes: same-mount control PASS; quick->full pending publish lock FAIL (false instead of true); quick->full received asset reaches Media, raw text stays, zero Post mutations, but draft/media recovery lack attachment. Local RED3total/1PASS/2expectedFAIL/0skip. Initial probe fixture omitted the real uploadMedia POST->GET lookup and Card action traversal; those fixture errors were corrected before this valid RED. No runtime correction was made.

## Options requiring decision

A — Recommended: App owns editor upload batches and attachment acknowledgements. Composer gets optional controlled upload/busy props; standalone fallback remains. Active owner/App generation guards global Media; originating editor token guards attachment/messages and batch cleanup. Same token retains latest draft edits and ordered deduplicated IDs across quick/full/navigation. Different token never receives old attachments; same-owner successful assets may remain in Media. Full App unmount invalidates continuation. Reuse current upload API and recovery writes, no File/Blob storage or upload replay.

B — Persist a pending upload/replay protocol. Adds durable asset-operation identity and reload semantics; File/Blob cannot be restored from current recovery. Larger subsystem and infrastructure/transport decisions, unnecessary for this proven mounted-App navigation root.

C — Disable navigation while uploading. Avoids quick->full replacement but changes customer navigation and still does not solve other child unmounts; a product restriction instead of aligning continuation with existing editor lifetime.

## Proposed Option A contract and scope

- Runtime App/Composer only, optional internal controlled interface; Dashboard uses existing descriptor. No server/API/DB/contracts, scheduler/providers/auth/infra, Composer UI mode representation, pending Post creation semantics, or Library recovery changes.
- App owns active batches per captured owner/editor token/App generation. Multiple batches may overlap; busy is true while any active batch for current editor remains. Old cleanup cannot decrement or unlock newer editor batches.
- Ordering approved explicitly: batches append in completion order; successful assets inside a batch preserve input file order; existing manually selected IDs stay first; first-occurrence deduplication. Existing[M1], batches A[A1,A2]/B[B1,B2], B completes first: [M1,B1,B2,A1,A2]. No sort by start time/name/ID.
- Same-editor navigation changes child position but not editor identity: latest raw text/networks/overrides/date/time/media choices survive, successful assets merge into the latest same-token draft once and persist via existing setDraft outside React updater side effects.
- New/edit/duplicate/clear identity invalidates old attachment continuation. Old successful upload can remain same-owner Media only; never writes current editor/recovery or emits stale editor result. Owner replacement/App unmount rejects old data/editor/cache continuations.
- Save/publish callbacks require current editor uploads settled, not just disabled buttons, so stale captured enabled callbacks cannot submit incomplete media. Existing save/pending/account/read-only validation still applies. No publication/provider sends in tests or verification.
- Partial success returns successful assets through existing per-file error behavior. Existing upload limits/validation are unchanged. No reload replay, upload cancellation protocol, autosave, new CTA or File/Blob cache.
- Parent source is fresh main95f53b7. PR14 overlap behavior, PR16 UI recovery and PR17 Library recovery are frozen and must be checked in isolated compatibility before release. No frozen branch edits or dependency silently pulled into this PR.

## Required evidence before implementation/readiness

Representation approval first, then proportionate written plan and implementation approval if Orchestrator selects architectural process. Extend RED for overlapping batches across remount, new token/owner/App unmount, late cleanup, partial success and direct stale submit callbacks. Protect existing raw recovery/pending save/lifecycle/read-only/saving/account/ordered media/standalone Composer behavior. RED->minimal implementation->focused/protected/full, typecheck/lint/build, fresh independent adversarial review, exact-final-head native PostgreSQL/Redis0FAIL/0SKIP and completed Docker SUCCESS. Then direct merge/deploy gate, real Owner approval, authorized production verification. Local hook harness is not browser acceptance.

Self-review: Option A matches the proven lifetime mismatch and preserves the existing upload/explicit submit flow. Option B/C tradeoffs and owner/token/generation separation are explicit. No new product semantics or silent frozen-PR integration. Remaining details belong in a reviewed implementation plan; this proposal grants no runtime permission.

Orchestrator hard guards: parent count for current token; callback-level Save/publish pending checks; same-token latest revision merge through existing setDraft; old-token messages rejected separately from same-owner global assets; other owner/generation/unmount rejects continuation; partial success/per-file errors and non-Composer callers preserved; frozen PR14 overlap compatible; no recovery/pending/UI-mode/server changes. Separate direct recovery RED was required before PLAN_REVIEW and now reaches the persisted media assertion (4total/1PASS/3expectedFAIL/0skip).
