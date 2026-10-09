# Phase 9 — distribute reviewed drafts into free slots

Status: OWNER WRITTEN-SPEC APPROVED on 2026-10-09 for PR34 head `7d2577746a7a35afc5afce8cc3a1a12c511234b6`, by explicit message `Одобряю спецификацию фазы 9`. Owner previously authorized the recommended first scenario: distribute existing drafts into free slots, preview, then explicitly confirm saving. [Implementation plan](../plans/2026-10-09-batch-draft-scheduling.md) was approved at head `3217d13a633df27d7d7d8f84c7612571b4118582` on 2026-10-09 for native execution in this chat. Implementation is in PR34; local/native checks support development, while exact-head CI, independent review and desktop/mobile UI verification are release gates. No production merge, deploy, migration or provider send is authorized by plan approval.

## Intent and source authority

Help the Owner schedule several existing posts with less repeated manual work while retaining individual content approval and control over every destination and time.

Inspected source baseline: main `a2187cd1531e595816a044691ae76ee7930e1162`, following documentation-only PR33. Last verified production baseline remains `2539796a7427175642d5b9e8c351382a4c18954c` from PR32; PR33 was merged without deployment. Source and production acceptance are separate.

The first MVP covers existing owned Telegram/MAX drafts. Telegram analytics, VK OAuth/publishing, Instagram and CR07/CR08/GAP01 retain their [deferred status](../../verification/2026-10-09-phase8-partial-acceptance-phase9-transition.md). Existing Telegram publishing remains in scope through its current scheduler; analytics HOLD does not disable it.

## Existing behavior and gap

- [Slot calculation](../../../lib/planner-slots.ts) already supports Moscow time, 1–31 inclusive dates, selected weekdays, 1–4 daily times and strictly future slots.
- [Server slot checking](../../../lib/server/planner-slots.ts) checks enabled, connected accounts and occupied minutes. Post mutations serialize through `lockOwnerSchedule`.
- [Post mutations](../../../lib/server/posts.ts) validate content/media ownership, lock Post/publication history and reconcile scheduled work in the same transaction. Queue mirroring follows commit.
- [Publication reconciliation](../../../lib/server/publications.ts) is the existing durable publication path; the worker/recovery infrastructure remains authoritative.
- [Editability guards](../../../lib/server/post-editability.ts) protect published, sending and uncertain-delivery posts.
- The [Phase 6 design](2026-10-04-swipe-planner-design.md) requires individual content approval. `DRAFT` is an editing status, not a persisted approval record. Library READY is not approval to publish.
- Existing [pending creation recovery](../../../lib/client/pending-creation.ts) demonstrates owner-scoped, durable retry intent, but its Post-creation receipt cannot prove an operation that updates several existing Posts.

There is no current batch scheduling transaction or batch operation receipt. Repeated independent update requests could partially succeed and provide no reliable recovery after a lost response.

## Approaches considered

1. **Recommended: atomic batch scheduling with a durable receipt.** One preview and one explicit confirmation schedule the displayed batch together. Adds a small operation table and narrow service; avoids partial success and ambiguous retry.
2. **Independent per-post saves.** Less new server code, but partial success requires complex recovery and leaves the Owner uncertain which displayed plan was applied. Not selected.
3. **Recurring/background automatic planning.** Handles recurring content and permanent rules, but broadens approval, scheduler and lifecycle requirements. Defer to a separately approved milestone.

## User flow and eligibility

Entry point: the current Content list's drafts view, with an action to distribute drafts into slots. Existing single-post editing, manual scheduling and Phase 6 Library approval stay available.

1. Select 1–20 owned existing drafts. Default ordering is selection order; allow explicit move-up/move-down controls before preview.
2. Show each post's full text, target overrides and existing private media previews, plus its current Telegram/MAX destinations. Each row requires an explicit content-reviewed check. Selecting all for review does not mark content reviewed automatically.
3. Choose a date range, weekdays and times using current slot constraints and presets. Clearly label all displayed times as Moscow time. Defaults may suggest a preset; they do not confirm anything.
4. Request a read-only preview. Display every post, destination and assigned time from the server response. Review checks bind to the displayed server fingerprint; if the server snapshot differs from the content previously reviewed, clear that row's check and require a fresh review of the returned content. Any changed order, selection, schedule settings or content clears the preview and relevant review checks. Ignore an older preview response after a newer request, selection change, logout or owner change.
5. Explicitly confirm the displayed batch: the button states how many posts will be scheduled. Display that the existing scheduler will publish at those times and that free-service delays remain possible.
6. After success, reload the authoritative posts/calendar and display the saved receipt. Cancellation before confirmation changes no post or publication.

Eligibility is deliberately narrow: `DRAFT`, at least one active destination, only Telegram/MAX active destinations, all active target times null, and no publication history for that Post. Accounts must be owned, enabled and CONNECTED; effective text/media must pass existing publication-content validation. An inactive historical VK target does not become active or get a time. Published, scheduled, failed, cancelled-history or uncertain posts require separate ordinary editing/copying; the batch does not reinterpret their history. A draft without a destination must first be edited. A draft containing an active VK destination is excluded rather than silently dropping it.

The Owner explicitly reviews each selected current content snapshot and then approves its displayed destinations/times. No automatic approval of Library items, automatic Post creation or inferred historical approval is introduced.

## Slot allocation contract

Reuse `findNextSlot`, `slotMinuteKey` and existing account/occupancy rules. For this MVP use the union of active Telegram/MAX providers across the selected batch to calculate occupied minutes; each selected Post receives one distinct available minute, shared by its own active destinations. Reserve that minute in the preview's in-memory occupied set before assigning the next Post.

This deliberately yields one selected Post per batch slot, including when two selected Posts use different providers. An existing active target on either selected batch provider reserves its minute according to the current latest-publication/CANCELLED rule. Providers outside the batch do not reserve a minute for this operation. Existing manual scheduling's overlap behavior is unchanged.

If the range cannot fit the entire batch, return an incomplete preview with the unassigned rows identified and disable confirmation. Do not silently omit posts, extend the range, add times or move an existing post. The Owner changes settings and previews again.

The preview is advisory and writes no database rows, publications or queue jobs. It performs no provider requests. A commit accepts exactly the displayed times; it never calculates substitute times on conflict.

## API and snapshot contract

Proposed owner-authenticated endpoints: `POST /api/scheduling-plans/preview` and `POST /api/scheduling-plans/commit`. Follow existing mutation authentication, origin/CSRF and request validation conventions; do not weaken them. No GET request performs scheduling or publication processing.

Preview input: ordered distinct Post IDs and the validated date/day/time settings. Providers are derived from current owned active targets, not trusted from client metadata. Limit to 20 Posts and existing 31-date/4-time bounds.

Preview response: ordered owned content/destination snapshots, server-computed content fingerprints, exact UTC ISO assignments, Moscow display data and completeness/eligibility issues. Reuse current authorized media previews; return no credentials or unrelated owner data.

A fingerprint covers the current Post fields/version, active target IDs/account IDs/providers/overrides/times, ordered media IDs and relevant publication-media metadata, and selected account identity/enabled/connection state/version. Canonical serialization is deterministic. It is a stale-data check, not an authorization credential; commit independently verifies ownership and current data.

Commit input: a UUID operation key, ordered distinct rows containing Post ID, expected fingerprint, exact scheduled time and explicit review confirmation, plus the original slot settings. The server validates that all proposed times belong to those settings and are distinct future minutes. Reject unknown fields or unsupported sizes/providers rather than interpreting arbitrary input.

## Atomic commit and concurrency

Use one PostgreSQL transaction and a narrow scheduling-plan service. Do not call `updatePost` repeatedly or inside the transaction: it owns its own transaction/owner lock. If necessary extract only the existing relation/content validation into a shared transaction-aware helper; avoid unrelated refactoring.

1. Authenticate the current owner, parse bounded input and derive a canonical request hash covering the key-independent normalized payload, ordered rows, fingerprints, confirmations and settings.
2. Lock the owner through `lockOwnerSchedule`; look up an owned receipt for this operation key before checking current Post status or expired times. Matching hash returns that immutable receipt without further writes or enqueueing. A different hash returns an operation-key conflict.
3. For a new operation, lock selected owned Posts in ascending ID order, then their existing publication rows in deterministic ID order. Lock relevant owned account rows in ascending ID order after Post/history locks to prevent an account change racing the account recheck. Current Telegram/MAX account mutations in `social-accounts.ts` and the scheduler processor update the account through individual statements, without a surrounding transaction that holds account locks while acquiring owner/Post/history locks; retain that compatibility. Attached media deletion is already rejected by `deleteMediaAsset` after checking references under its asset lock.
4. Re-read Post/target/media/account/history data, validate individual review confirmations, fingerprints, eligibility, ownership and effective publication content. Recompute current occupancy for the selected provider union. Recheck future times after acquiring locks. A deletion, edit, missing media, disabled/disconnected destination, stale preview, invalid content or occupied/past minute aborts the whole transaction.
5. Update only each Post's status to READY, its active target scheduled times and the corresponding timestamps. Preserve content, media order, target IDs, overrides and destinations. Reconcile each Post through `reconcilePostPublicationsInTx` in the same transaction; ensure the expected scheduled publications exist before committing.
6. Persist the batch operation receipt atomically with the changes. Commit once; mirror resulting queue changes afterwards through the existing best-effort mechanism. Recovery from queue loss remains the current database reconciliation path.

There is no direct send in preview/commit. Confirmed SCHEDULED work may subsequently be published by the existing scheduler. If a future time becomes due during the transaction, normal scheduler execution after commit applies; the UI must not promise a minimum waiting period.

Conflicts produce no partial new operation receipt, Post updates or publication changes. Existing manual actions after this operation may subsequently edit or cancel safe scheduled posts through their current guards; replaying the operation must never restore those old assignments.

## Durable receipt and lost-response recovery

Proposed additive table: `scheduling_plan_operations`, with UUID operation ID, owned user foreign key/cascade deletion, request hash, a minimal immutable result receipt and created timestamp; unique `(user_id, operation_id)`. Receipt contains Post/target IDs and confirmed times, not text, media content, credentials or provider bodies. Do not cascade receipt deletion from Post deletion; retry must not resurrect deleted posts. Retain receipts until owner deletion for this MVP; no cleanup job or new service.

Before the first commit request, the client persists an owner-scoped pending record with the same key and exact commit payload. Use a separate storage entry for each `(owner_id, operation_id)`, not one replaceable owner-wide record; never overwrite a different operation. Failure to persist prevents dispatch. Store IDs, fingerprints, settings and times rather than post text/media. Do not issue an automatic commit on reload.

Enumerate all pending entries for the current owner before starting a batch, on reload and on cross-tab storage updates. While any known commit result is unknown, block a new batch and offer an explicit retry of each original payload/key. Two tabs may race before seeing each other's entry: preserve both records and resolve both separately; server slot/snapshot checks still arbitrate their commits atomically. Completion/rejection clears only its own matching entry, never another tab's operation. A timeout, lost response or unknown 5xx preserves its record. A validated pre-commit rejection permits clearing it after showing the rejection; receipt/hash conflicts remain blocked for explicit resolution. On retry, a committed operation returns its original receipt even if its times are now past, Posts were edited/deleted or an account disconnected. The UI labels this as the saved result of the earlier operation and reloads current state; it does not claim current Posts still match the receipt.

Use existing owner-lifetime/generation protection so logout, owner changes, unmounts or a newer UI operation cannot apply a stale acknowledgement. Never replay another owner's pending intent or clear it with a mismatched key. Local-storage loss after dispatch cannot be repaired by guessing a new key; explain that current calendar state must be checked before new scheduling.

## Errors and exclusions

Use typed, safe errors for incomplete plan, ineligible Post, stale snapshot, occupied/past slot, account unavailable, content validation and operation-key conflict. Return 409 for a stale/conflicting commit with instructions to preview and review again; return schema/content validation errors through existing conventions. Do not leak whether another owner's Post exists. Missing authentication retains current unauthorized behavior.

No automatic retry, silent shifting, partial scheduling, provider sends, recurring duplication, permanent rule/preset storage, best-time prediction, AI, new networks, webhook/analytics backfill, env/key changes, infrastructure migration or scheduler timing redesign.

## Verification and acceptance requirements

Focused tests must prove deterministic ordering/Moscow boundaries, existing occupancy semantics, in-batch uniqueness, complete/incomplete ranges and read-only preview. Database tests must prove atomic rollback, content/target/media preservation, ownership isolation, account/snapshot/content revalidation and two concurrent commits competing for the same slot.

Exercise operation replay after a lost acknowledgement, time passage, Post edit/deletion and account disconnect; different payload with the same key must fail, with no duplicate publications or queue side effects. Verify no receipt is committed on pre-commit rejection and queue-mirror failure after commit does not report a false rollback. Client tests cover individual review, preview invalidation, storage failures, original-key retries and owner/generation changes. A two-tab lost-response test must prove that both distinct pending records survive, reload can recover each original key, and acknowledging one cannot erase the other.

Run the canonical native CI and Self-host workflows for the exact implementation head, including migrations, full suite, typecheck, lint, build and scheduler recovery. Do not weaken existing tests or interpret skipped provider smoke as a live pass.

After separately authorized merge/deploy, verify exact Render SHA/health and the real production selection/preview/conflict/recovery UI. Read-only production preview can demonstrate allocation but cannot prove successful scheduling or delivery. A real commit schedules provider work, so choose Owner-approved existing drafts/destinations/future times before a bounded provider smoke. No synthetic publication or Telegram/MAX send is authorized by this spec proposal.

Acceptance: the Owner reviews every selected Post, sees the complete exact plan, saves it atomically, and can recover an uncertain response without new publication work. Phase 9 remains unaccepted until implementation/release evidence exists. Phase 8 remains partially accepted and its deferred tasks remain recorded.

## Next gates

The Owner approved the written spec and the linked implementation plan on 2026-10-09, selecting native execution. Implementation is in PR34, pending release verification. Merge, production deploy, migrations and real provider verification retain their separate Owner gates.
