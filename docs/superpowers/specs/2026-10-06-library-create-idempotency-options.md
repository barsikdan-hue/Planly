# CR06 identity lifecycle — architecture options, not an approved design

Classification: architectural. A durable client/server creation identity changes interfaces and potentially schema. Brainstorming follows the approved diagnostic; runtime and implementation planning remain gated. Purpose: explicit retry of one unknown Library creation must recover its result while allowing intentional identical second creations. Native postcommit/concurrent evidence is required before selecting a representation.

## Common requirements

- Creation identity represents explicit intent, independently of content equality and ordinary editor revisions. Owner identity scopes it. Separate intentional creations receive separate identities.
- Freeze the original normalized create payload and ordered media with an attempt before the first POST. Persist before transport, with an explicit storage-failure policy; no automatic replay on hydration. Do not assume current editor token alone is a request key.
- Unknown outcome retains the original attempt and newer raw edits separately. A retry replays the frozen original, never silently uses the current edited body with an old key or guesses ID from matching Library cards.
- An acknowledgement only resolves the original request; newer raw work survives with the resolved item ID. Whether that action immediately PATCHes newer work or requires another explicit Save is an architecture/UX decision to be settled, not implemented here.
- Successful acknowledged clear permits a new explicit editor/intent. Navigation/reload preserve unresolved intent under the same owner; another owner cannot see, submit or apply it. A→B→A must not revive first-life callbacks. PR17's raw recovery and PR19's owner lifetime contracts remain protected.
- Server replay must not reset current READY/USED/ARCHIVED state, media, provenance or source Post. Foreign owner access is rejected. Malformed identity, changed payload under a committed key, deleted result and unavailable storage need explicit outcomes.
- No content-derived key, matching-content search, second Post/publication pipeline, unknown-outcome automatic retry, scheduler/provider changes or enterprise subsystem.

## A — Key/hash on Library item, following existing Post pattern

Optional validated creation key at Library POST transport; nullable original key/hash on `library_items`; unique owner/key. Serialize/recheck and create atomically; matching replay returns the owned current DTO, mismatched frozen payload conflicts. Keep legacy unkeyed API callers creating intentional independent items. Client maintains a separate owner-scoped attempt envelope and retains original payload.

Advantages: uses current entity and familiar Post approach; no general-purpose ledger. Costs: additive columns/index migration; deletion removes key history, so replay after deleted creation cannot be proved safe without a retained identity/tombstone policy. This limitation must be decided before selecting A. Do not claim deletion-safe replay from row uniqueness alone.

## B — Library-specific durable attempt record

Separate owner/key record atomically stores original hash and created item identity, preserving a terminal deleted-result outcome when the item is removed. Replays resolve the original result; distinct intentional keys create distinct items. The same client attempt envelope is required. Bound this to Library creation, not a generic job/workflow framework.

Advantages: explicit durability across deletion, controlled resolution of unknown outcome. Costs: additional table/FK/terminal-state semantics and migration; delete path joins the bounded contract. No expiry/cleanup inference may allow an old unresolved key to create again.

## C — Explicit reserve/resolve creation-intent protocol

Server issues/records an owner-scoped intent before content submission, then create and resolve use that identity. This avoids inferring an editor UUID's semantics but adds a round trip and protocol states. It still needs frozen-body validation, persistence, replay/deletion and owner guards; reservation failure must never create an item. Broader API/client surface than A/B.

## Recommendation and unresolved decisions

Prefer the smallest Library-specific durable attempt contract. A is closest to existing code if a safe deleted-result policy is supplied; B is preferable if durable no-resurrection guarantees require independent retained history. C adds protocol cost without removing persistence requirements. Do not select content matching or token reuse merely because it is smaller.

Orchestrator must choose representation, same-key changed-body response, deleted-result semantics, client storage-failure admission, and edited-raw acknowledgement behavior. Choosing these options permits a complete written spec only; that spec must be reviewed before a written implementation plan and execution selection. No runtime authorization is implied by this options document.

## Proposed scope and integration path

Server: Library POST route, bounded Library creation service/identity helper, HTTP conflict mapping, schema/migration only if selected. Client: Library transport, attempt persistence separate from raw recovery, App Library Save/acknowledgement boundary. Existing Post pending/recovery, auth, scheduler, connectors and UI lifecycle are preserved.

Current diagnostics remain main-based; frozen PR17 client probe is disposable. Do not copy PR17/PR19 implementation onto this branch to manufacture CI or modify their bases. After an approved server contract, decide split server delivery and client integration on actual fresh main versus one fresh-main task after prerequisites; native CI on old source is not fresh integrated acceptance. Owner approval is still required for merge/deploy and destructive migration, secrets/infrastructure or major product fork.

Acceptance after approval: native sequential postcommit replay, concurrent same intent, precommit failure, owner isolation, distinct identical intentions, ordered media and changed-body conflicts; client ambiguous outcome/remount/reload/newer edits, explicit second creation, same-owner/changed-owner lifetimes, storage corrupt/unavailable, known acknowledgement durability; deleted/USED/ARCHIVED result controls and PR17/PR19 compatibility. The diagnostic REDs must remain traceable; a representation-aware oracle may extend them only after explicit approval.
