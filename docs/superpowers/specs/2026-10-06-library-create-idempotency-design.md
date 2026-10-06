# CR06 Library creation intent — complete spec for review

STATUS: SPEC_REVIEW_REQUIRED. Representation decision: direct Orchestrator `APPROVE_OPTION_B_WITH_EXPLICIT_TERMINAL_SEMANTICS`. This document proposes the complete technical contract; it is not implementation authorization. Runtime and implementation-plan work remain prohibited until their respective reviews.

## Purpose and evidence

One explicit Library create intent must produce at most one item despite a lost acknowledgement or concurrent repetitions. Two intentional identical creations remain allowed. After an ambiguous create, explicit Save resolves the original outcome before newer raw work can be saved. No automatic network replay, content matching or ID guessing.

Main-based diagnostic checkpoints `ad737b3` and `47334055ee49a55e5cae278ac62411dc65c8980a`: native454total/452PASS/2declaredsemanticFAIL/0skip, all446 baseline and6 controlsPASS. Exact4733405 CI37414483040/job112109949733 confirms postcommit retry2rows/differentID and concurrent3rows/3IDs; drift/migrations/types/lintPASS, CIbuildSKIPPED after declaredRED. Exact4733405 Self-host37414483079/job112109949937 completedSUCCESS; liveproviderSKIPPED. Frozen PR17 actual callback probe7/4PASS/3declaredRED/0skip, protected46/46PASS. These establish the protocol gap; callback, native, Docker and production evidence remain separate.

## Server attempt schema and key lifetime

A Library-specific `library_creation_attempts` table contains:

| Field | Contract |
|---|---|
| userId | authenticated owner; references users with existing owner-deletion cascade convention |
| creationKey | server-validated lowercase UUID; unique with userId |
| inputHash | server-computed SHA256 of original canonical create payload |
| itemId | original server-generated Library UUID, retained after item deletion |
| state | CREATED or DELETED |
| createdAt / updatedAt | server timestamps; no client-supplied dates |

Use composite owner/key primary or unique constraint and an owner/item lookup index. `itemId` intentionally has no cascading FK to the Library item: deletion must retain its original identity and terminal attempt record. Creation and deletion services enforce owned mapping atomically; replay of a missing mapped item is fail-closed and never inserts. The owner reference remains authoritative. No TTL, expiry, background cleanup or generic request ledger is introduced.

Each distinct explicit create intent gets a fresh UUID. It is not the editor token, content hash, item ID or Post creation key. The same key survives unresolved retry/navigation/reload; successful durable acknowledgement or terminal handling closes that intent. Explicit independent creation gets another key, even for identical content.

## Transport and canonical hash

Follow existing Post transport conventions: Library collection POST requires an `Idempotency-Key` UUID header; body remains `CreateLibraryItemInput`. Missing/malformed key yields422 before persistence. Actual Planly Library client creation requires the explicit durable key argument and never generates an ad hoc key inside the API helper. No browser create path may fall back to unkeyed POST. Internal CRUD helpers may keep their existing unkeyed signature for deliberately independent server/test creations; they are not exposed as an unprotected user POST.

Server canonicalizes with existing Library validation: trimmed title/text, absent/null title encoded as null, empty title preserved if the current contract permits it, ordered mediaIds unchanged. Hash an explicit JSON projection `{title,text,mediaIds}`. Do not sort media, include lifecycle/provenance, accept a caller's hash or make content the identity. A replay is checked against the originally committed hash, not current mutable item content.

## Atomic create/replay and concurrency

Keyed create uses the existing authenticated owner row lock convention before any attempt/item lock. Lock order is owner → attempt → Library item, compatible with existing Post owner → source-row ordering. Use the existing owner lock helper without changing scheduler or Post behavior. The unique owner/key constraint independently protects persistence.

Within one transaction:

1. Lock authenticated owner, read owned attempt for key.
2. If an attempt exists, compare original hash first. Mismatch returns409 with stable `LIBRARY_CREATION_KEY_CONFLICT`, no mutation.
3. Matching DELETED returns410 with stable `LIBRARY_CREATION_RESULT_DELETED`, no mutation or fresh item.
4. Matching CREATED reads the owned current item and DTO, under the transaction's serialization point. It returns201 and the current DTO; it does not rerun content/media insert, reset READY/USED/ARCHIVED, overwrite title/media, create a Post or touch source provenance. A missing mapped item is410/fail-closed, never a fallback create.
5. For a new key, validate owned current media, insert Library item and ordered joins, insert CREATED attempt mapping, build its DTO, then commit together. Validation/DB failure rolls back all of them. Rejected precommit attempts reserve no key and may be explicitly corrected.

Read replay DTO consistently inside the protected transaction, adapting the current owned-item reader to accept the transaction where necessary. Avoid releasing the lock and then making a separate unguarded read that can accidentally classify a concurrent delete as an unrelated404. A delete after the response's valid serialization point is an ordinary later mutation.

Concurrent same-owner/key requests converge on one committed mapping/item. Different keys, including identical payloads, produce independent items. Owner B's equal key is independent and cannot reveal A's mapping or DTO. Native PostgreSQL barriers must prove same-key contention and create/delete order; PGlite or callback fixtures cannot certify isolation.

Replay lookup precedes current-media existence checks: a committed original payload may contain media that was subsequently removed. Matching retry returns the current DTO without revalidating/recreating old media; new creation still validates all owned media atomically.

## Delete transaction and terminal result

Library deletion acquires owner → associated attempt → item locks in the same order. Confirm item ownership, mark all owned matching CREATED records DELETED with updatedAt, then delete the item in that transaction. Existing joins/source-Post FK behavior remains. Do not delete attempt history, recreate media or mutate an associated Post. Unkeyed legacy items have no attempt to terminalize; their ordinary deletion behavior remains.

Repeated replay of the original same-key/body after deletion always returns410, including after process restart. Changed body under that key remains409 because original intent binding is checked first. Foreign deletion remains indistinguishable from missing item and cannot alter another owner's attempts. Concurrent replay/delete linearizes to current DTO before deletion or410 after it, never a second item or resurrection.

## Separate client envelope and durability

Owner-scoped sessionStorage key `planly:library-create:v1:<encodedOwner>` stores one active creation-attempt envelope separately from PR17 raw recovery:

```
version: 1
creationKey: UUID
editorToken: original Library editor UUID
editorRevision: original submitted raw revision
input: frozen normalized CreateLibraryItemInput
```

`editorRevision` is necessary to detect newer raw edits across reload even when normalization yields equal content; it is not server identity. Envelope schema is strict/bounded, including ordered media IDs, validated UUIDs/revision and a size cap. No token/secrets/File/Blob/server lifecycle/provenance is stored. The storage key scopes owner; the server still authenticates every request independently.

Before first POST, validate current raw input, freeze a normalized payload and independent key, durably write the envelope and reread its exact projection. If storage is unavailable, corrupt, cannot write/read back, or contains an unresolved conflicting record, do not send a new CREATE. Keep raw visible and show a concise durability error. Never replace unreadable/corrupt state with a fresh key and hope the old create failed. A known-item PATCH keeps existing semantics and is not subject to new-create admission.

On unknown transport outcome, preserve the same envelope, raw recovery and original key. Hydration reads but never submits. Same-owner ordinary polls preserve current attempt/editor identity. Explicit Save retries the frozen original envelope even if current raw title/text/media changed. Current owner/lifetime/operation guards are checked before admission, after awaits and before local state/storage/messages.

## Acknowledgement, newer raw and cleanup order

For an active matching editor token, the resolved item ID is attached to current raw work. If revision/fields changed since the envelope was created, preserve all latest raw fields and ordered media, persist the known ID in PR17 recovery, leave the editor unsaved, and return from the operation. No implicit PATCH. The next separate explicit Save uses that ID through existing PATCH/status authority.

Even when raw is unchanged, do not clear work solely because a key resolved: compare the current DTO's canonical content with frozen input and require PR17 full-current-snapshot durability. If the server item was independently edited, keep raw with resolved ID instead of silently discarding it. Replay never overwrites that current server DTO.

Durability order: persist a raw snapshot carrying resolved ID and verify it, or prove unchanged acknowledged raw was durably cleared under existing PR17 rules; only then remove the exact matching attempt and verify removal. A failed raw write, raw clear, attempt remove or verification keeps a visible warning/known ID and a safe unresolved envelope. Replaying its old key remains safe. Never manufacture durability from an older same-token raw snapshot. New raw arriving during acknowledgement remains protected by token/revision/operation checks.

If terminal410 arrives, preserve raw and do not attach deleted ID or create anything. Resolve the old attempt as deleted only after its exact durable removal is verified, show that the previous result was created and later deleted, then return. Only another separate explicit Save may begin a fresh key/intent. Failed terminal cleanup keeps the old envelope; repeated explicit resolution safely returns410. A409 preserves envelope/raw/error and sends no alternative key or mutation.

## Explicit raw Cancel, editor replacement and stale callbacks

PR17 raw Cancel does not itself delete server items or silently discard a separate unresolved creation attempt. Replacement edits never overwrite an envelope bound to a different editor token. This spec proposes the following complete continuation policy for review:

- If another editor has replaced/cancelled the envelope's editor, the next explicit Save first resolves the old frozen create only. Same-owner result may update the Library list, but its item ID is not attached to the replacement editor. The replacement raw work stays unsaved.
- After exact durable cleanup of that resolved old attempt, return with a clear recovery notice; a subsequent separate Save creates the replacement's independent new intent/key. A terminal deleted outcome follows the same no-create-in-this-call rule.
- A response from an obsolete operation cannot clear replacement raw, delete a newer envelope, unlock another operation or apply messages in a different lifetime. Ordinary successful acknowledgement/new editor uses a fresh token and key; captured first-intent callbacks cannot silently create another intent after cleanup. Admission includes the rendered editor/attempt generation and current operation identity.

This avoids permanent blocking after raw Cancel, hidden ID transfer and accidental overwrite of an unknown attempt. It is an explicit spec-review proposal beyond the representation decision; no runtime choice is made before that review.

## Owner isolation, PR17 and CR11

Keep PR17 separate raw recovery, DTO acknowledgement, owned Library generation, save/upload lock, current server status and ordered-media rules. Do not merge raw recovery with the attempt record or rewrite Composer/Post pending state. Upload acknowledgement can change current raw revision; retry still uses the frozen original media list and preserves newer raw for explicit PATCH.

Owner A→B invalidates A before applying B, preserves durable A keys, and B reads only B raw/attempt state. A→B→A creates a new lifetime; first-A callbacks remain stale even if IDs/tokens/keys match. CR11 canonical OwnerLifetime is the authority in the integrated tree; existing Library private token/revision guards remain additional checks. No new independent App owner authority is introduced. Server completion for A may persist A's item, but cannot apply B UI/cache/messages. Whole App unmount invalidates continuations.

## Delivery, migration and rollback safety

Current PR20 stays diagnostic/spec-only on main; do not copy frozen PR17/PR19 runtime into it. The proposal is one integrated CR06 runtime task on actual fresh main after Owner-approved prerequisite release through PR17 and CR11/#19 integration. Mandatory keyed user POST must be deployed with its durable client, never as a server-only contract break against the current client. PR18 is separately preserved; run its existing compatibility where shared App changes overlap, without assuming it merged or extending Composer scope.

Add one table/enum/index migration through existing Drizzle generation/journal workflow. It is additive: no destructive backfill, no changes to existing Library/Post rows, no provider/env/paid resources. Pre-existing items remain ordinary unkeyed items; fresh protected creates populate attempts. Apply migrations only in disposable native/Docker verification until authorized production delivery.

Rollback preserves the attempt table/history; never drop it or expiry-clean keys to simulate rollback. Old application versions have unkeyed user POST and can reproduce CR06, so a rollback to them is not reliability acceptance. Report that explicitly; coordinated production rollback/deploy remains Owner infrastructure/release control. Native migration drift/apply, existing CRUD/source conversions and Docker restart/persistence must pass before delivery readiness.

## Required evidence and oracle continuity

Archive the exact original main-based diagnostic observations as historical executable evidence against their frozen source; do not quietly change their meaning to make CI green. Representation-aware acceptance extends the two failure invariants with stable explicit keys. Intentional-identical control gets distinct keys; the old edited-body observation maps to frozen-original replay plus later explicit PATCH, not a test expecting the old duplicate bug. Any active-oracle adaptation is included in the reviewed implementation plan.

| Layer | Required cases |
|---|---|
| Native API/DB | reached commit then response loss/replay; deterministic same-key contention; distinct keys identical content; corrected precommit; malformed/missing key; changed title/text/ordered media409; owner/media isolation; invalid input rollback |
| Native replay/delete | current USED/ARCHIVED/content/media/provenance preserved; deleted410/restart/no resurrection; replay/delete both lock orders; foreign/missing item; no orphan item/mapping on DB failure |
| Attempt storage | freeze/canonical projection/strict decoding; write/readback/remove failure; corrupt/version/oversize; exact key/token cleanup; raw/attempt independence; zero implicit transport |
| Actual App/Library | same mount/navigation/remount/reload; original attempt token/key preserved; newer title/text/media and same-normalized revision kept; known ID then explicit PATCH; unchanged durable cleanup; raw/attempt durability failures; terminal410 then separate new intent; new editor/Cancel policy; repeated/captured callbacks and operation locks |
| Integration | original PR17 recovery/continuation suite; CR11 same-owner/A-B-A/generation and generic upload controls; relevant frozen PR18 compatibility; standard Library/source/Swipe/Post protections |
| Delivery | full native0FAIL/0SKIP after implementation, typecheck, lint, standard build, Self-hostDocker, fresh independent review; actual Owner merge/deploy gate; production/browser acceptance only after authorized delivery; no provider sends for this Library-only change |

One problem only: Library creation intent and its acknowledgement. Exclude Post pending/idempotency rewrite, scheduler/connector/provider changes, CR07/CR08/GAP01, new networks/AI/analytics, automatic retries/background resolution, TTL/cleanup jobs, content deduplication, unrelated UI/state resets and speculative security layers.

Next direct gate: `SPEC_REVIEW / CR06`. Request approval of this complete contract, especially replacement/Cancel acknowledgement policy and dependency-bound atomic client/server delivery. Written implementation plan and runtime remain prohibited until later approvals.
