# P04-B1 — readiness and bounded design v2

STATUS: DESIGN_V2 / ORCHESTRATOR_DESIGN_APPROVAL_PENDING. IMPLEMENTATION NOT AUTHORIZED. Revision only, 2026-10-17. No writing-plans, TDD, feature implementation, branch, PR or new acceptance claim.

Supersedes v1 SHA256 `e5956ce10a8d730a4d3e0cfe0236d988869431696fec8a6c1f3574ebb732e9b4`, retained as `readiness-and-design-v1.md`. External Orchestrator review is retained as `orchestrator-design-review-v1.txt`: CHANGES_REQUIRED, I1/I2 and R1–R4. This is a design contract, not an implementation plan or proof that future tests pass.

## Authority and current readiness

GitHub main rechecked for v2: `da7ad737a3236f1c161ae46c519386e05869f47a`. All code references below are to that exact commit. Runtime/CI observations in this section retain their original observation time; v2 does not repeat staging/Render operations or CI.
Existing checkout: `work/Planly-harness-devex`, clean branch `codex/t06-open-pr-review`, historical HEAD `ce46b4a0a5791eb6da75834dce4d7ecc95361938`; current source inspected with `git show origin/main:path`, not historical working files. Git identity configured; no other branch edited. Open PR inventory has no competing P04-B implementation; historical Draft PRs remain unchanged.

- Main [CI39022298851](https://github.com/barsikdan-hue/Planly/actions/runs/39022298851) and [Self-host39022299088](https://github.com/barsikdan-hue/Planly/actions/runs/39022299088): success on exact main, not on a future feature HEAD.
- NEWVPS read-only observation `2026-10-17T13:29:08.855664+00:00`: web/worker label83a, exact old image `sha256:79c1878d12e3fe9cff1dbc68558bbb8c3f15a41d724fb3977ee3a50021194aef`; five original containers running, zero restarts; web/PG/Redis/MinIO healthy. Ledger13; approved22-table baseline `3247505f3fa14b6c27971ef826bf1c60fde7402c8f99cbd4f46c8a29c9111c28` unchanged; sessions4, original post/media and media object bytes preserved; eight queue counts0, Redis persistenceOK, health/loginHTTPS200. No login, file write, migration, provider operation or lifecycle action.
- Previously read Render metadata: LIVE `2f13a5acc8a8010bfdc989cc99deb4655b584747`, deploy `dep-db7h8jt9fdbs73e8fffg`, autoDeploy=no/trigger=off. Production function acceptance was not repeated.
- P03-B remains bounded reported STAGING_FUNCTIONAL_PASS [#63](https://github.com/barsikdan-hue/Planly/issues/63#issuecomment-6218593875). P04-A SOURCE_MERGED/MOCK_VERIFIED, not STAGING_ACCEPTED.0012 already present;0013/0014 must not run on live DB here.
- P04-A readiness blocker: retained same-VM backup exists but full restore is still unverified in [A1 report](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6233853378). A later [restore-only task contract](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6234302277) is not a completed restore result; this task does not resume it. Off-VM restore remains unverified, #65 not activated.
- Before any eventual P04-A release: actual successful isolated restore/image identity proof, fresh baseline/queues/resources/legacy duplicate checks, exact candidate/archive identity, clone0013/0014 rehearsal and conditional code rollback proof. Preserve schema/history/session/media/config; old83a cannot process newly admitted P04 work as a blind rollback. Separate backup/image preparation, persistent migration and staging deploy gates remain required.
- Mini App setup, signed launch/native browser return, real Telegram/MAX identity/membership/bot privileges/revocation and sends remain UNVERIFIED. No provider API calls are needed for mock development.

Current AGENTS/ROADMAP/tool-routing contract and `docs/harness/2026-10-12-owner-master-contract.md` read from main. Referenced root `PLANLY_CODEX_MASTER_HARNESS.md` is absent from tracked main and workspace root; its contents are not inferred. The maintained docs contract and current explicit Owner instruction provide the applicable scope.

## Current flow and proven gap

1. `shared-library.ts:copySharedLibrary` uses actor/session checks, own durable copy receipt, independent media bytes and creates personal READY Library items. It creates no publication.
2. `components/planner/app.tsx` routes a personal item to composer/Swipe. `posts.ts:createPost` owns a transaction and converts one source: owner lock, source/relations checks, Post/targets/media, `reconcilePostPublicationsInTx`, source USED, then queue mirror outside commit. Its linked-source lookup returns an existing Post before fresh-source validation.
3. Phase9 `scheduling-plan-preview.ts`/`scheduling-plan-commit.ts` accepts existing DRAFT Post IDs with preexisting targets, validates snapshots/slots and atomically writes all scheduling plus `scheduling_plan_operations` receipt. The strict receipt has no Library source mapping or operation discriminator.
4. `publications.ts:reconcilePostPublicationsInTx` captures USER binding revision/destination; `scheduler/reconcile.ts` reconstructs jobs from durable DB rows. Processor guards authorization before claim/handoff and preserves ambiguous delivery without blind resend. These paths stay authoritative.

Thus a loop over public `createPost`, or creating drafts before Phase9 commit, leaves partial Posts/USED sources after later failure. Reusing the Phase9 receipt JSON without a new contract is unsafe. Independent read-only Critic confirmed this gap and that a bounded persistence/admission extension is feasible without a scheduler rewrite. Existing test files provide rollback/race patterns; they have not been freshly run for a new feature.

## B1 boundary and user journey (R4)

Preferred remains a narrow Library batch preview/commit/result API and one dedicated durable consent-receipt table. No second Scheduler, Worker, retry policy or provider transport; old Phase9 API/receipt remains unchanged. A versioned Phase9 union touches more recovery contracts; a loop over public createPost cannot provide the required atomicity.

1. ADMIN shares content through P03-B. USER selects an explicit finite set and first creates independent personal READY copies with the existing copy receipt/media mechanism. Copying is not publication consent. B1 starts from those own copies; it neither locks nor converts the ADMIN originals.
2. A colleague with role USER, excluding the configured OWNER identity even if its role were USER, selects 1–20 distinct own READY items in a visible order and 1–2 own confirmed Telegram/MAX accounts, at most one account per provider and 40 targets total. B1 uses the same selected account set for every row. Existing per-user/provider uniqueness applies. Fresh B1 preview/admission is USER-only; ADMIN/configured OWNER use their unchanged existing flows. This narrow design boundary avoids the legacy configured OWNER binding-pointer bypass in capturePublicationBinding without modifying it. No role bypasses ownership. Historical replay/result of an already accepted own receipt remains available to any currently ACTIVE owner with a valid session even after a role change; it does not admit new work.
3. USER selects the existing finite PlanSettings: startDate/endDate, weekdays1–7 and up to4 HH:mm values, maximum31 dates, existing Moscow UTC+3 interpretation. Allocation uses the existing slot-minute rules. All targets of one Post share its displayed minute; rows occupy distinct minutes across the selected provider set. No publish-now in B1: every admitted time is strictly in the future at the fresh validation boundary.
4. Preview displays each personal content version and ordered media, account/destination labels and IDs, exact dates/times with timezone, number of Posts/targets and the action to be taken. Show the preclaim-only cancellation limit. An incomplete preview cannot be confirmed. Preview creates no Posts, targets, publications, jobs or durable consent rows.
5. One explicit button confirms exactly that finite preview. No per-item approval checkbox, synthetic Swipe LIKE, recurring series or enrollment of future ADMIN items. Commit either saves all rows plus receipt or none. UI displays the durable result, then the existing calendar/statuses. Later source ADMIN edits cannot mutate the independent personal content.

## Exact immutable intent and mutable snapshot (I1)

Design revision is v2; the new wire/receipt contract starts at version1. JSON below describes exact fields, not product code. IDs are opaque nonempty bounded strings, operationId is a canonical lowercase UUID. Strict schemas reject unknown keys, duplicates and excessive sizes before hashing. No caller-supplied owner selector is accepted; owner always comes from the authenticated principal.

### Canonical intent C and requestHash

C contains exactly these fields in this fixed key order:

```
contractVersion: 1
kind: LIBRARY_BATCH_FUTURE
settings: {startDate, endDate, weekdays, times}
rows: [
  {sourceId, sourceRevision, contentHash,
   targets: [{accountId, provider, destinationId, scheduledAt}]}
]
```

- Row order is the reviewed selection/allocation order and is significant. targets use TELEGRAM before MAX, then accountId; the same target set is required on all rows. weekday integers and HH:mm arrays are unique/sorted. Strings are preserved verbatim; no implicit text trim or Unicode rewriting. ISO instants are canonical UTC strings with seconds/fraction zero; sourceRevision is the exact previewed source.updatedAt normalized to UTC with millisecond precision.
- sourceRevision and contentHash are frozen values shown/accepted at preview, not values reread and substituted during replay. contentHash = SHA256 of fixed-key JSON `{title,baseText,media}` where title is null or the exact string, baseText is source.bodyText and media is the position-ordered array of `{id,position,checksum,mimeType,byteSize,width,height,durationMs}` with explicit null dimensions/duration. These are digests of content, not editable text overrides. B1 does not edit content within the batch dialog.
- Targets contain the exact accepted destination ID and UTC time; labels are backed by the preview snapshot. Source/account IDs, content versions and times must change C when the visible publication intent changes.
- requestHash = SHA256 UTF-8 of `planly.library-batch.intent.v1` + LF + canonical JSON(C). Operation identity is `(authenticated userId, operationId)`; operationId is not part of C. Auth cookies, session ID/expiry/version, current source status/updatedAt, enabled/status/generation/binding/config revisions, snapshotFingerprint, preview expiry/signature, current time and result IDs are **not recomputed into requestHash**. Frozen sourceRevision is part of the original intent; later source.updatedAt is not.
- Client persists the exact original C and operationId before the first commit POST, scoped to the current owner, and resubmits those bytes/semantics after timeout or re-login. Never rebuild C from current Library/account state on recovery. A second preview with changed content/version/destination/time is a different intent, not a mutation of a pending operation.

### Snapshot S and snapshotFingerprint

Snapshot is server-derived only, captured under the locks below. Canonical S contains exactly:

```
contractVersion: 1
owner: {id,role,authInitialized,accessState,sessionVersion}
intentHash: requestHash
sources: [{id,userId,title,bodyText,status,updatedAt,linkedPostId}]
attachments: [{sourceId,mediaId,position}]
media: [{id,userId,storageKey,checksum,mimeType,byteSize,width,height,durationMs,updatedAt}]
accounts: [{id,userId,provider,providerAccountId,displayName,enabled,
            connectionStatus,connectionGeneration,bindingRevision,updatedAt}]
bindings: [{accountId,userId,provider,destinationId,humanId,botId,
            sessionVersion,revision,configRevision,checkedAt,updatedAt}]
configs: [{provider,configRevision}]
```

Collections use database ID order except attachments ordered by sourceId/position and configs by fixed provider order. Dates use canonical UTC ISO; linkedPostId is explicit null for a fresh source. SHA256 uses domain `planly.library-batch.snapshot.v1` + LF + fixed-key JSON(S). No raw token, cookie, password, initData, ticket or provider secret is included. S stays server-side; client sees only its digest. storageKey/humanId/botId are not exposed in the DTO. Config revision uses the existing local socialConnectionConfig, never a provider request.

S represents current eligibility, not permanent intent. It must match only for **first admission**, while the principal is role USER and not configured OWNER, source READY, unlinked, ownership/media valid and accounts enabled/CONNECTED with current local verified grants. Check binding user/provider/destination/revision/sessionVersion/configRevision using the existing currentBinding invariants. The explicit fresh role/OWNER check makes the unchanged legacy OWNER pointer bypass unreachable from B1; no implementation change to that bypass is proposed. Session ID/expiry and slot occupancy are deliberately outside S: current-session validation is independent, and occupied minutes are revalidated as predicates, not hashed wholesale. That prevents unrelated calendar activity from unnecessarily invalidating an unchanged free minute.

## Preview → commit → result contract (R3)

Proposed new endpoint family, leaving Phase9 routes unchanged:

| Endpoint | Input / output contract |
| --- | --- |
| POST `/api/library/batch-consent/preview` | Strict `{sourceIds:[...],accountIds:[...],settings}`; owner/session/origin validated. Output complete/error rows plus owned display DTOs and, only if complete, `{C,requestHash,snapshotFingerprint,previewProof}`. No operation receipt or publication writes. |
| POST `/api/library/batch-consent/commit` | Strict `{operationId,intent:C,snapshotFingerprint,previewProof}`. No independent raw content/media/account/owner fields. One confirmation creates the durable result. |
| GET `/api/library/batch-consent/operations/:operationId` | Current session and derived owner only. Historical receipt/result availability; no fresh admission, account validation, queue mutation or source recreation. `Cache-Control: private,no-store`. |

To bind the displayed descriptor to the server preview without a new table/service/secret, previewProof is a versioned HMAC-SHA256 envelope signed server-side with the existing SESSION_SECRET and a purpose-separated domain. Envelope fields are exactly `{v:1,ownerId,requestHash,snapshotFingerprint,issuedAt,expiresAt}` with expiry10minutes after issue. Verify the MAC in constant time. OwnerId is derived/compared server-side, never accepted as an alternate identity selector. The envelope is not a session or a permission grant; a current independently checked session is always required. This is new proposed design surface; no env/secret change or proof generation is performed in this task.

Preview signs a coherent snapshot obtained with the same owner/session/source/media/account order as commit, using a single READ COMMITTED transaction and fresh clock checks. Signing/media URL generation is local, no provider/storage-network IO under these locks. Its proof is issued only after all required locks/validation have completed. Existing signed-media issuance continues to enforce per-owner checks; its URLs are neither hashed, stored in pending requests nor placed in receipts. Display URLs can be refreshed for the same owner without changing contentHash. A failed/uncertain preview response creates no consent and can be requested again.

Before first commit: validate the signed descriptor, current S, exact C content/source version/destination/time, existing provider content capabilities and free-slot predicates. Never rerun the allocator to select a replacement time. If any proposed minute is occupied/past, source changed/USED/deleted, account paused/rebound/released, local grant/config changed, snapshot differs or proof expired: roll back the **entire** fresh batch and return stale/conflict; UI requires a new preview and another single confirmation. No silent time adjustment, enrollment or partial draft creation.

The client mints/persists operationId for the complete confirmed preview before sending commit and disables duplicate clicks. Selection changes before any send discard that unsubmitted intent. Once a send has uncertain outcome, the pending original intent/key is retained; the user must resolve/recover it rather than generate another key automatically. Owner changes/logout clear private rendered data and block stale callbacks; recovery material is owner-scoped, contains no credential/signed URL and is never displayed to another principal. A new valid session of the same owner can recover it.

### Error semantics

| Condition | Response / side effects |
| --- | --- |
| Missing/expired/revoked session, after any lock wait | 401; no new batch effects. Existing receipt is not erased. |
| Identity selectors/origin violation, or fresh preview/admission by ADMIN/configured OWNER | 403; no effects. Role/OWNER exclusion applies after receipt lookup on commit, never before historical replay/result recovery. |
| Missing or foreign-owned source/account/media/result | Uniform404 unavailable, without disclosing foreign data. No ADMIN exception. Own historical missing result uses410 below. |
| Invalid/unknown fields, duplicate IDs, count/precision/range/content shape | 422; no fresh effects. |
| Same operationId, different canonical intent/hash | 409 BATCH_OPERATION_CONFLICT, never adopt a result of different intent. |
| Fresh stale source/content/binding/config/proof | 409 BATCH_PREVIEW_STALE; no fresh effects; preview again. |
| Fresh disabled/unverified account or incompatible content | 409 BATCH_ACCOUNT_UNAVAILABLE / BATCH_CONTENT_INVALID; no fresh effects. |
| Fresh occupied/past/off-settings minute | 409 BATCH_SLOT_CONFLICT; no fresh effects; no allocator fallback. |
| Own receipt exists but a mapped result Post is missing | 410 BATCH_RESULT_DELETED with minimal historical operation/result IDs; terminal, no recreation. Existing siblings are not repeated. |
| Proven transaction rollback before COMMIT | No result saved; typed validation errors above only after rollback is known. Same operation can safely be queried/retried; never infer this from an arbitrary network/DB exception. |
| Lost HTTP/COMMIT acknowledgement or uncertain DB failure | 503 BATCH_RESULT_UNCERTAIN when a response is possible, otherwise transport timeout. Keep exact key/intent. No cleanup, rekey or compensating resend. |
| COMMIT succeeded, Redis mirror failed | Return committed receipt/saved result; optional technical queue-pending indication. Never claim rollback or that a provider sent. |

GET absence is404 BATCH_RESULT_NOT_FOUND scoped to the owner and means no receipt was observed at that read's serialization point, not that an earlier/in-flight commit can never complete. UI retains the key/C and may repeat the **same** operation; it must not use404/timeout as permission to mint new publication identity.

## Durable receipt and replay algorithm (I1)

One new versioned table, proposed name `library_batch_consent_operations`, has PK `(userId,operationId)`, requestHash, immutable canonicalIntent C, acceptedSnapshotFingerprint, receipt JSON and createdAt. Only userId references users; source/Post/target/publication IDs in the receipt are retained values, **not cascading result FKs**. Hash/version/shape checks fail closed. No pending reservation rows, background intent executor or new provider idempotency subsystem.

Receipt fields: `{contractVersion:1,kind,operationId,requestHash,acceptedSnapshotFingerprint,confirmedAt,rows}`. Each row is `{sourceId,sourceRevision,contentHash,postId,targets:[{accountId,provider,destinationId,scheduledAt,targetId,publicationId}]}`. No credential, signed URL, live provider receipt or raw body/media bytes. The authenticated owner scopes every read. This receipt is historical consent/mapping, not a mutable Post DTO or a claim that any content was delivered. Edits/deletions do not mutate its intent; live current status comes only from existing owner-scoped Post/status APIs.

1. Parse strict input and derive current principal/token digest with existing auth/origin/identity protections. Compute requestHash from submitted canonical **original C only**. Do not fetch current source/account state to compute it.
2. Start one READ COMMITTED transaction, lock users row then current session row as below, recheck ACTIVE/authInitialized/session version/expiry after the owner wait. The initial unprotected session reference never authorizes admission by itself.
3. Read own `(userId,operationId)` receipt before any fresh source/account/proof validation. With an existing receipt: compare stored C and hash; validate receipt structure/mapping. Different intent gives409. For matching intent, do not demand READY sources, unexpired old previewProof, unchanged snapshot/binding, enabled accounts or the original session. Lock only mapped owned result Posts in ascending ID order for availability; recheck current session expiry with a fresh clock after waits. Return the saved immutable receipt plus replayed=true; a missing mapped Post gives terminal410. No writes to Posts/sources/jobs and no mirror side effects. The GET result endpoint follows the same current owner/session guard, receipt validation and availability rules, without needing a supplied C.
4. With no receipt: require role USER and not configured OWNER, validate the owner's proof and current snapshot, lock all selected resources, fresh time/auth/content/capability/slot revalidation, then perform the fresh admission below. Preview has the same fresh principal restriction. Matching the proof without current ownership/state checks is insufficient. Neither this role restriction nor current account eligibility is applied ahead of an existing receipt's historical replay.
5. Insert receipt in the same transaction as every new Post/target/publication and USED mark. Check session expiry again at callback exit with a fresh clock; expiry causes rollback. Receipt collision is not treated as blind success: same-user owner lock serializes compliant writers; a DB constraint/conflict abort leads to recovery via the same operation and validated receipt.
6. Await transaction completion. Only after proven COMMIT, mirror queue changes. If that await throws with uncertain COMMIT, do not start another fresh intent, delete rows or emit extra enqueue effects in the catch. Read recovery or repeat identical commit under the same user lock. A competing identical request waits and sees the durable result after COMMIT; a rolled-back first transaction leaves no partial work.

Replay after READY→USED, account disable/rebind/release, session expiry/new login or user block/restore reads historical consent only if the **current** session is valid for the current ACTIVE owner. Auth/access changes can still deny a currently invalid user. Snapshot changes never convert the same accepted intent into409 on replay. They also never authorize re-enqueue or resend. Deleted results remain terminal.

## Lock ordering and static deadlock check

No blanket runtime deadlock-free claim is made: this revision statically checks new lock edges against current writers; deterministic native PostgreSQL races are an implementation acceptance gate, not executed here. Every lock selector must include authenticated owner before locking; never lock a foreign row and check ownership afterward. Within each multirow set use DB `ORDER BY id ASC`, not locale-dependent client sorting.

**Fresh preview/admission:** unprotected own session reference → users(owner) FOR UPDATE → sessions(current token,user/version) FOR UPDATE → own receipt read (commit only) → own libraryItems ascending FOR UPDATE → attached own mediaAssets ascending FOR UPDATE → own socialAccounts ascending FOR UPDATE → read local bindings/config under retained user+account locks → validate → newly inserted Post/target/media/publication rows → immutable receipt/USED writes. No existing publication row is locked by fresh admission; occupiedSlotMinutes is a plain MVCC read, serialized against competing schedule edits by the users lock. Reconcile may reacquire the already-held same account row, never another owner's user/account. Session lock is acquired independently, never by calling lockOwnedConnectionAccount after source acquisition.

**Replay/result:** users → sessions → receipt read → mapped own Posts ascending FOR SHARE → fresh expiry check → return. No source, media, account or publication locks, no current snapshot comparison and no attempt to resurrect old content. Retain locks through transaction completion, including receipt/result materialization.

**Session checks:** after owner/session wait and after all subsequent waits, require user.authInitialized, accessState ACTIVE, matching user/session owner and current sessionVersion, unexpired expiresAt and existing tokenHash. Logout's deleteSessionByToken serializes on the session row; block/revoke serializes on users then sessions. Validity is measured at the final authorization/admission boundary with Date.now()/clock_timestamp(), not PostgreSQL transaction-start now(). The statement does not pretend time cannot advance while COMMIT is in flight. Revocation waits for the admitted transaction; it is not retroactive cancellation.

| Existing competing path / source | Observed lock edges and interaction with B1 |
| --- | --- |
| createPost, updatePost, Phase9, retry/cancel (`posts.ts`, `scheduling-plan-commit.ts`, `publication-approval-cancellation.ts`) | Same owner first. One owner's operations cannot hold opposite later edges concurrently. Old Phase9 Post→publication→account remains unchanged. |
| USER connection lifecycle/proof (`social-connections/state.ts`) | user→account→session→intent; although B1 takes session earlier, same-user user-row serialization prevents overlap. Foreign-account selectors are denied before lock. B1 never takes provider advisory locks or proof/intents rows. |
| block/revoke/create session (`auth/access.ts`, `auth/session.ts`) | user→sessions. Logout alone deletes session and cascaded intents, but does not then request user/source/media/account rows. No reverse session→user edge is introduced. |
| ADMIN management (`auth/user-management.ts`) | ADMIN actor→manageable USER. B1 locks one principal and never a second user. Cross-ADMIN targeting is already denied. Source-owner ADMIN row is never requested by B1. |
| library update/archive without owner (`library-items.ts`) | source→media FK insertion; no later user/account/session lock. B1 follows source→media. Library delete/intent paths already user→source; foreign shared listing/copy uses actor→globally sorted sources→sorted media and never locks source administrator's user. |
| media deletion (`media.ts`) | asset FOR UPDATE then attachment-reference reads; rejects attached assets and does not request owner/source/account locks afterward. B1 source→asset does not gain a reverse edge from this path. |
| account enable toggle (`social-accounts.ts`) | one account UPDATE, no subsequent owner/session/source/media lock. Lifecycle/reconnect additionally holds user first. B1 holds account through reconcile/commit so toggles serialize. |
| processor claim/handoff (`scheduler/processor.ts`, `publication-authorization.ts`) | preclaim auth user→account transaction finishes before standalone publication CAS. Handoff later uses a separate user→account transaction after claim; no transaction holds publication while waiting for user. B1 fresh rows are invisible before COMMIT; replay does not lock publications. |
| raw deletePost (`posts.ts`) | Post delete plus child cascades, no later owner/source lock; replay SHARE serializes result availability without a Post→user cycle. It does not extend historical deletion policy. |

Static result: no new wait-for cycle identified among these paths for correctly owned data. Foreign references/corrupt graph are rejected, not repaired. Use one transaction, no nested transaction awaiting its own owner lock, no network/queue/provider/storage reads while holding these DB locks, and deterministic sorted acquisition. A deadlock/timeout during implementation must roll back; do not silently weaken validation, change lock order ad hoc or retry with a new operation ID. Native tests must demonstrate logout/revoke/expiry waits, opposite selection order, connection lifecycle, library edit/delete, media delete, account toggle, Phase9 and claim cancellation interactions. Database fault/deadlock detection is not a substitute for these proofs.

## Fresh admission atomicity and minimal createPost boundary (R2)

Before **any** new Post insert, require role USER/not configured OWNER and validate every selected own READY/unlinked source and every ordered attachment's owner/metadata, all selected verified accounts, complete signed snapshot, exact accepted times, existing content capabilities, free slots and intra-batch distinct-minute reservations. Validate all inputs using server rows, not client-provided body or capabilities. ValidatePostRelations currently maps provider→the user's unique account; B1 must additionally assert that map matches each explicit accountId accepted in C. For this initialized USER identity, unchanged capturePublicationBinding produces the verified pointer; configured OWNER is excluded because it intentionally returns an empty pointer in the legacy path. No legacy linked-source lookup is allowed to adopt an existing Post for a new B1 key.

The smallest shared helper is **only** `insertPostRelationsInTx(tx, {postId, input, accounts, now})`, replacing the existing target and postMedia insertion block immediately **after** createPost has won its parent insert (`posts.ts`, the input.targets/input.mediaIds blocks before reconcile). The helper inserts ordered targets with identical IDs/default fields and ordered postMedia rows for an already-created Post. It does not open/commit a transaction, acquire auth/owner/source locks, parse requests, create a Post, reserve creationKey, look up replay, mark USED, record Swipe decisions, reconcile, emit queue changes or read a DTO. The validated accounts map is supplied by the enclosing admitted caller. No public helper endpoint or arbitrary identity injection.

Old createPost retains its existing parent insert and onConflictDoNothing/creationKey logic, every early return and readExisting branch, linked-USED-source lookup semantics, transaction boundary, reconcile call, source transition, Swipe receipt and DTO/queue behavior. This boundary avoids moving the entire createPost transaction or changing its public semantics. B1 separately inserts a small parent Post row block inside its own outer transaction, with creationKey/inputHash null and sourceLibraryItemId set; it then calls this relation helper and existing reconcile per Post. Each target must have exactly one matching SCHEDULED publication with accepted user/provider/target/time/binding pointer; no extra/missing publications. Mark all sources USED and insert one immutable receipt. Any invariant/insert failure rolls back every Post/target/media link/publication/source mark/receipt.

**Preserved old invariants, to be regression-checked before helper extraction is accepted:**

- SavePost/createPostSource strict validation and existing READY/DRAFT/no-target behavior; no B1 requirement leaking into single-post, OWNER/VK or old Phase9 paths.
- Same legacy creationKey/hash replay, conflicting-key errors, race on source conversion, linked USED-source lookup leaving a new key unreserved, deleted Swipe result behavior and canonical IDs.
- Source owner/revision/archive/USED checks, requireFreeSlot/account/time rules and Swipe's existing 60s admission lead, with unchanged order and error classes.
- Existing target active=true/default null approval state, provider→own account mapping, textOverride and timestamp values, ordered media, relation capability/owner checks and rollback.
- Existing Swipe capture/record decision, LIKE/DISLIKE receipt/history and DTO materialization. B1 consent never fabricates a Swipe receipt.
- Existing public reconcile/queue-after-commit best effort, old Phase9 strict preview/commit/receipt/recovery, Post edit/history/cancel rules and registered USER binding guard.

Relevant existing test families: `posts.integration`, `post-idempotency.integration`, `post-edit-guard.integration`, `swipe-feedback.integration`, `swipe-slot-flow`, `scheduling-plan-{preview,commit,api}.integration`, `publication-{content,isolation,processor,retry-race}.integration`, `publications.integration`, `media.integration`, social-connection and shared-library suites. This is a coverage contract, not a claim that they ran in this design-only turn.

## DB → Redis recovery argument and required proof (R1)

Database is authoritative; this is reuse of the existing durable publication reconciliation path, not a new outbox service. `publications.ts:reconcilePostPublicationsInTx` inserts SCHEDULED publication/idempotencyKey in the batch transaction. `scheduler/reconcile.ts:reconcileScheduledJobs` scans SCHEDULED/QUEUED and calls existing ensurePublicationJob with runAt=max(scheduledAt,nextRetryAt). `scheduler/queue.ts` uses **publicationId as BullMQ jobId**. `scheduler/worker.ts:startPublicationWorker` reconciles before starting Worker and on its default60,000ms interval; caught periodic failure waits for a later reconciliation. A startup failure can prevent Worker startup until its existing runtime is restored. B1 changes none of this.

| Failure point | Durable state / recovery |
| --- | --- |
| Callback fails before COMMIT | No batch Posts/publications/USED/receipt; no external queue IO was done. |
| COMMIT succeeds, process dies before enqueue/HTTP response | All rows and receipt persist. Replay returns same IDs only. Existing startup/periodic reconciliation discovers the persisted publications and creates their jobs. |
| Redis fails before/halfway through the mirror | Receipt still means saved, not sent. Remaining SCHEDULED/QUEUED rows stay discoverable; earlier jobs use same IDs. Later reconciliation fills missing jobs. |
| Enqueue succeeds but its acknowledgement is lost | ensurePublicationJob/reconciliation uses same publicationId, so no second logical publication; repeated/concurrent job delivery is fenced by existing DB SCHEDULED/QUEUED→PUBLISHING compare-and-set. |
| All Redis jobs are lost; DB remains | Reconciliation recreates only eligible durable open work. CANCELLED/AUTH/PUBLISHED/AMBIGUOUS history does not become a fresh publication through this path. No blind retry after an unknown send. |
| Worker/Redis unavailable for a long time | Consent remains saved. No immediate recovery/delivery SLA; UI must not report publication success. Existing reconciliation can resume after availability returns; overdue work follows existing scheduler policy, without promising its original wall-clock delivery time. |

Required later mock/disposable proof: fail mirror **after real native DB COMMIT**; assert N Posts/targets/publications and one receipt, zero/partial jobs. Re-login/replay and assert identical IDs/no new DB rows. Restore Redis in the isolated test, call real existing reconciliation twice plus concurrent ensure; assert exactly one live BullMQ job per eligible publicationId, exact runAt, no duplicate logical publications, and one mock handoff at most per successful claim. Separately exercise startup and periodic recovery, whole Redis loss, cancellation before recovery and AUTH/ambiguous histories. After a crash while PUBLISHING, existing ambiguity protection remains authoritative; it is not converted into an auto-resend test expectation. Until those tests run, the recovery argument is static source-backed feasibility, not acceptance evidence.

## Cancellation guarantee ends at publication claim (I2)

B1 promises the existing whole-Post unschedule only while **every historical attempt of every target is unclaimed and proven unsent**: for a fresh B1 result all publications are SCHEDULED/QUEUED with attemptCount0 and no AUTH/unknown history. Do not promise cancellation in the interval between claim and provider handoff. UI uses the existing change-to-DRAFT updatePost/reconcile path, preserves content/media/targets and clears accepted future schedule consistently with that path; no new cancellation API or batch-atomic cancel.

Proof boundary in current source: updatePost obtains owner→Post→all publications ascending FOR UPDATE, then postEditBlockedReason; reconcile in the same transaction marks open work CANCELLED before the locks release. Processor's standalone claim CAS accepts only SCHEDULED/QUEUED and conflicts with those same row locks. If cancellation wins, later stale jobs cannot claim the CANCELLED rows; if claim wins first, updatePost observes PUBLISHING and refuses the edit. A multi-target claim/auth transition winning for any target removes the whole-Post guarantee. Required later native barrier test must prove both orders, including enqueue/reconcile racing after cancellation, without provider calls.

Concrete excluded case: Telegram PUBLISHED plus MAX SCHEDULED in the same Post. postEditBlockedReason blocks the Post; B1 **does not** offer or claim cancellation of MAX alone. Partial-target cancellation is a separately scoped follow-up contract, not an implicit Worker change or Owner decision needed to finish this bounded B1 design. Account pause remains explicit account-wide and is not a substitute for guaranteed per-target cancellation. Existing AUTH-only cancelPublicationApproval retains its all-history safety classifier; B1 does not invoke it for arbitrary SCHEDULED targets. Preserve AUTH/receipts/immutable original Post and ambiguous outcomes; no automatic resend.

## Isolation, verification boundaries and remaining risks

Owner derives only from a currently valid session. Every source/media/account/result selector includes that owner; foreign/missing IDs fail uniformly before lock or projection. No ADMIN access to another colleague's unpublished content. Receipt/GET/DTO/job/publication graph and signed-media issuance/bytes must all remain owner-consistent. No admin raw source or foreign bytes enter B1. Foreign-reference corruption rolls back, never reassigns ownership. Post/target/publication snapshots retain consent destination and USER binding pointer; reconnect/release must fail existing guards rather than redirect work. B1 proof/snapshot checks are local evidence of an existing grant, not a new real-provider membership check.

Later verification must cover all user-requested cases plus I1 replay after USED/new-session/block-restore/account changes/role change and deleted results; fresh ADMIN/configured OWNER refusal (including an OWNER-email row with USER role) with no nullable-pointer admission; forged/mismatched preview proof and changed visible intent; I2 both claim/cancel orders and the explicit partial-publication limitation; deterministic session/logout/revoke/expiry lock waits, source/media/account races, inverse selection orders/deadlock checks; all-or-nothing validation/slot rollback; post-COMMIT queue-loss recovery; USER A/B and ADMIN non-owner API/DB/job/media issuance+bytes; reload/timeout/lost COMMIT; unavailable mocked providers/AUTH/ambiguity with no resend. Preserve old single-post/Swipe/Phase9 behavior. No tests, builds or feature CI are run or claimed here; no writing-plans/TDD is authorized yet.

Remaining risks: current provider grants can be revoked externally after local checks; the existing delivery authorization/handoff, including its unavoidable external race and accepted ticket/initData phishing/relay limitation, stays unchanged. A future DB/config/current-main change requires reinspection. A session must be valid at the final admission check; time can advance after that check. Worker outage can delay due work. No guarantee of cancellation after any claim or partial delivery. Same-VM backup and unverified isolated/off-VM recovery still block unrelated release acceptance. This v2 adds a purpose-separated preview MAC using an existing server key, immutable C stored owner-side, and a receipt table; their security/compatibility tests remain mandatory before source acceptance. No new infrastructure/secret is requested.

## Review disposition and next gate

I1: design separates immutable intent hash from first-admission state fingerprint and independent current-session checks. I2: guarantee ends at claim for the entire Post; partial-target cancellation excluded. R1: source-backed recovery/fault matrix and exact later proof defined. R2: shared helper narrowed to insertion of relations only, with legacy invariants retained. R3: exact signed preview/commit/error contract; no silent reallocation. R4: bounded future scheduling only, no publish-now/recurrence/future-template enrollment. Critic-found configured OWNER pointer mismatch is addressed by USER-only/not configured OWNER fresh admission, preserving historical replay after role changes. This B1 scope boundary and the preview MAC contract are explicit proposals for ORCHESTRATOR_DESIGN_APPROVAL, not silently implemented product rules.

Independent read-only Critic must check this exact document hash and current source, particularly canonicalization/replay, auth/lock graph, preview proof, helper invariants and cancellation/recovery boundaries. Correct any new design blockers and repeat review before handoff. Critic design approval cannot establish implementation or runtime acceptance.

NEXT GATE: ORCHESTRATOR_DESIGN_APPROVAL. Send only v2 hash, precise changed sections/delta, I1/I2/R1–R4 status, Critic verdict, risks and remaining decisions. STOP before writing-plans, TDD or implementation, even if this revision is internally consistent. Future merge, each staging/production deploy, persistent migrations, secrets/env/infra/DNS and provider reads/sends retain separate exact Owner gates. No A1 action, off-VM transfer, migration execution or provider call is part of this revision.
