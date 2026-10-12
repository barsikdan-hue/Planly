# Cleanup code audit — 2026-10-12

Source: `barsikdan-hue/Planly`, audit checkout `work/Planly-production-audit`, baseline `da9a2e89`. This is a read-only code investigation and an execution contract for a later owner-approved cleanup. No production mutation, queue processing, provider send, R2 deletion, infrastructure change, or runtime fix was performed by this investigation.

## Acceptance and evidence boundaries

**CLEANUP_SAFE: NOT ESTABLISHED. EXECUTION BLOCKED.** Existing APIs support individual deletion, but do not establish a safe full cleanup with a concurrently sending worker and complete R2 reconciliation. Exact production cardinalities are **UNVERIFIED**, not zero. SQL below is a runnable read-only inventory recipe; its results must populate the later owner-reviewed manifest before any deletion. An inventory-unavailable preparation report cannot meet an exact-count cleanup approval gate.

Findings below are **CODE**: file/function/data-flow evidence. Test names are inspected coverage, not fresh TESTED claims. Current production occurrence of each failure is **UNPROVEN**. The parent audit records fresh test/CI/runtime evidence separately. No private text, filenames, remote message identifiers, object keys, credentials, cookies, or recovery values belong in the committed report.

## Existing deletion and cancellation paths

| Path | Actual operation and constraints |
| --- | --- |
| `PATCH /api/posts/{id}` | `app/api/posts/[id]/route.ts:9`, `updatePost` (`lib/server/posts.ts:212`): owner session required; complete validated save body required, not a `{status}` patch. Set `status: DRAFT`, preserve title/baseText/media/targets, preferably clear target scheduled times. This avoids immediate sending because `shouldProcessImmediately` requires READY (`lib/server/scheduler/tick.ts:34`). Reads and writes must keep private body in memory, never report it. |
| Cancellation reconciliation | `lib/server/posts.ts:222-243`: owner advisory lock → Post row lock → all publication row locks → editability guard. `lib/server/publications.ts:51-75` cancels safe temporary failures, duplicate open rows, and SCHEDULED/QUEUED rows when Post becomes non-READY. DB CANCELLED is authoritative; queue mirror is best effort (`posts.ts:33-41`). |
| `DELETE /api/posts/{id}` | `app/api/posts/[id]/route.ts:25`; `deletePost`, `lib/server/posts.ts:304-311`: owner-scoped direct SQL deletion; no owner lock, explicit publication lock/guard, queue removal, or retained creation tombstone. Success 204, absent/foreign row 404. |
| `DELETE /api/library-items/{id}` | `app/api/library-items/[id]/route.ts:21`; `deleteLibraryItem`, `lib/server/library-items.ts:125-143`: owner lock and creation-attempt/item row locks; attempts transition CREATED→DELETED before deleting item. Media remains; linked Post survives with source set NULL. Success 204, absent/foreign 404. |
| `DELETE /api/media/{id}` | `app/api/media/[id]/route.ts:7`; `deleteMediaAsset`, `lib/server/media.ts:90-119`: asset FOR UPDATE, reject Post or Library attachment, delete metadata transaction, then R2 delete outside transaction. Attachment returns 409; missing/foreign 404. R2 failure is logged and swallowed, so 204 does not prove R2 deletion. |

There is no `GET /api/posts/{id}` handler: individual Post input must come from safe `GET /api/posts` or private read-only SQL, not `/api/bootstrap`. `GET /api/bootstrap` writes through `ensureOwnerSocialAccounts` and calls `runDuePublications` (`app/api/bootstrap/route.ts:13-14`); authenticated app loading/polling therefore is not a read-only inventory operation. There is no verified bulk cleanup API, publication-specific cancellation API, owner-wide pause/drain API, or existing orphan-deletion API in this execution path. Do not invent endpoints or treat `runDuePublications`, a retry, scheduler tick, or analytics refresh as read-only inspection.

## Proven code safety gaps and durable protections

### C01 — Post deletion can overlap a provider send

`deletePost` (`posts.ts:304`) is unrestricted by delivery state. `processPublication` (`scheduler/processor.ts:76-96`) commits an atomic SCHEDULED/QUEUED→PUBLISHING claim, rereads content, then prepares private media and calls `connector.publish` (`processor.ts:137-138`) outside any transaction. If deletion occurs after content/media have been copied into the processor and before handoff, the connector can still send after the Post and Publication disappear. A successful later Publication UPDATE can affect zero rows; the function does not inspect affected count. If deletion occurs before reread, it instead raises `Publication not found`. Neither schedule-configuration preservation nor a zero count at a single instant excludes this in-flight path.

**Required gate:** an established sender barrier and drain for *all* sending paths (Redis worker, free HTTP tick, immediate POST/PATCH calls, any concurrent owner tab/API caller). No infrastructure suspension is authorized by this audit. If all pending rows can first be durably cancelled through existing PATCH, that protects subsequent claims, but already claimed PUBLISHING work must be separately drained/settled. Do not DELETE a PUBLISHING or unsettled ambiguous result.

### C02 — Mixed terminal/open history blocks ordinary cancellation

`postEditBlockedReason` (`lib/server/post-editability.ts:5-9`) blocks any changed input if *any* history is PUBLISHED, PUBLISHING, REQUIRES_RECONNECT, or FAILED/AMBIGUOUS_DELIVERY. `updatePost` applies that guard before reconciliation (`posts.ts:242-243`). A multi-target Post can therefore contain a completed/unsafe target and another scheduled target, yet cannot be changed to DRAFT through existing API. Whole-Post DELETE bypasses this guard and is unsafe for C01. No per-target safe cancellation path is established.

**Required gate:** inventory this combination. Any matching row blocks an all-existing-APIs cleanup until an owner-approved operational barrier or separately scoped minimal safety repair exists. No repair is implemented here.

### C03 — R2 deletion failure loses its durable DB reference

`deleteMediaAsset` deletes `media_assets` in its transaction and then calls `storage.delete` (`media.ts:112-118`). The catch returns normally and records no durable deletion receipt/retry row. An R2 failure leaves an object whose key is no longer discoverable through normal metadata APIs. `createMediaAsset` has a similar orphan possibility if DB insertion fails and its compensating object delete also fails (`media.ts:81-85`). `ObjectStorage` (`lib/server/storage.ts:4-8`) exposes put/delete/signedGetUrl, not List/Head inventory or orphan reconciliation.

**Required gate:** secure noncommitted key/size manifest and safe R2 List/Head access before metadata deletion; confirm every expected key absent afterward. Remaining keys need a narrowly authorized exact-key R2 deletion action or independent safety repair, not a bucket wipe or blind retry. API 204 alone cannot close this gate.

### C04 — Post creation dedupe disappears with the Post

`createPost` (`posts.ts:118-128,171-186`) looks up `(user_id, creation_key)` on `posts`; `db/schema.ts` stores the key/hash on that row only. `deletePost` removes it. A subsequent explicit retry from `lib/client/pending-creation.ts:38-54` can insert a new ordinary Post with the old key if no media/source validation prevents it. READY with old scheduled time can become sendable again. This is a CODE data-flow proof of an absent deletion tombstone; an observed production resurrection is UNPROVEN.

Library intents have the opposite protection: `library_creation_attempts` intentionally has no cascading item FK (`db/schema.ts:132-144`), `deleteLibraryItem` marks DELETED, and `createLibraryItemForIntent` (`library-items.ts:75-94`) rejects deleted result. Preserve those tombstones. Source-backed USED items also reject another source Post after its first Post is deleted (`createPost`, `posts.ts:144-150`), but ordinary Post creation lacks that protection.

### C05 — SQL deletion does not clean Redis jobs

Post/Publication cascade deletion does not call `removePublicationJob`. `reconcileScheduledJobs` (`scheduler/reconcile.ts:31-51`) re-enqueues only SQL SCHEDULED/QUEUED rows; it never scans Redis for missing/terminal SQL rows. `processPublication` on a stale job whose SQL row was deleted throws before reaching its skip logic (`processor.ts:15-29,55-58`). Old waiting/delayed/failed jobs can remain, fail, or be retried by BullMQ. No new send occurs if the SQL row was already absent before processing, but this does not stop C01.

Existing cancellation preserves SQL CANCELLED and therefore stale delivery is a skip (`processor.ts:62-64`); Redis removal can fail in best-effort mirroring while SQL remains safe. `ensurePublicationJob` uses publication ID as BullMQ job ID (`queue.ts:16-22,33-48`). Its dedupe is per Publication, not a permanent post tombstone. Do not flush Redis globally: authentication/infrastructure/other work must remain.

### Restart and duplicate handling

`startPublicationWorker` (`scheduler/worker.ts:36-56`) reconciles SQL on startup and every 60 seconds by default. Preserved SCHEDULED/QUEUED work can be recreated in Redis after restart; retained CANCELLED work is not re-enqueued. `prepareTemporaryPublicationRetry` (`scheduler/retry.ts:22-62`) serializes owner→Post→history and requires READY, same active target/time, safe TEMPORARY failure, attempt limit, and no competing unsafe/open history. Cancellation before a retry protects against its recreation.

Duplicate claims use an atomic status UPDATE; a processor that observes PUBLISHING converts it to FAILED/AMBIGUOUS_DELIVERY rather than blindly resending (`processor.ts:66-73`). That may race a still-live first call; it establishes refusal to resend, not proof that delivery is settled or cancelled. Worker/tick overlap, runtime drain, active-job state, and actual production retry counts remain UNVERIFIED here.

## Deletion dependency graph and irreversible effects

`db/schema.ts` defines Post→post_targets, Post→post_media, Post→publications and target→publications CASCADE. Publication→publication_metrics CASCADE. Library→library_item_media CASCADE; Post.source_library_item_id SET NULL. Media links also cascade at DB level, but normal media deletion prevents attached assets. Parent owner/session/social account/credential rows are not removed by these child deletes.

Deleting Posts irreversibly destroys content, target overrides/times, publication history, provider-ID/destination receipts, diagnostics, attempts/retry state, analytics metrics and Post creation-key identity. Social messages remain: no deletion connector call exists in `deletePost`. Deleting Library destroys READY/USED/ARCHIVED content and associations but retains intent tombstones; deleting media destroys metadata and private R2 bytes when R2 confirms success. PostgreSQL and R2 are not one atomic transaction. No undo API or backup restore guarantee is established.

**Must retain:** `users`, `sessions`, `login_rate_limits`, `social_accounts`, `vk_credentials`, `vk_oauth_intents`, server env/credentials, Scheduler configuration/services, `library_creation_attempts`, and `scheduling_plan_operations`. The scheduling receipt has no Post FK (`schema.ts:54-60`); `commitSchedulingPlan` (`scheduling-plan-commit.ts:24-32`) returns retained receipt without mutating deleted Posts on replay. Removing receipts would destroy replay protection. Historical receipt IDs/times are intentional retained metadata, not live content. Do not clear the whole database, cookie storage, entire browser site data, or Redis.

## Read-only inventory recipe (not executed against production here)

Run on an already approved read-only production connection. Bind `owner_id` privately in psql; do not print identifiers, private body/text, object keys, connection string, or recovery values. Counts must use the same owner and timestamp. This script has only SELECT in a REPEATABLE READ / READ ONLY transaction.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT status, count(*) FROM posts WHERE user_id = :'owner_id' GROUP BY status ORDER BY status;
SELECT t.active, count(*) FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE p.user_id=:'owner_id' GROUP BY t.active;
SELECT x.status,count(*) FROM publications x WHERE x.user_id=:'owner_id' GROUP BY x.status ORDER BY x.status;
SELECT count(*) FILTER(WHERE status IN ('SCHEDULED','QUEUED')) AS open,
 count(*) FILTER(WHERE status='PUBLISHING') AS publishing,
 count(*) FILTER(WHERE next_retry_at IS NOT NULL) AS retry_marked,
 count(*) FILTER(WHERE status='FAILED' AND normalized_error_type='TEMPORARY') AS temporary_failed,
 count(*) FILTER(WHERE provider_error_code='AMBIGUOUS_DELIVERY') AS ambiguous
 FROM publications WHERE user_id=:'owner_id';
SELECT count(*) AS mixed_blocked_posts FROM posts p WHERE p.user_id=:'owner_id'
 AND EXISTS(SELECT 1 FROM publications x WHERE x.post_id=p.id AND x.status IN ('SCHEDULED','QUEUED'))
 AND EXISTS(SELECT 1 FROM publications x WHERE x.post_id=p.id AND
 (x.status IN ('PUBLISHED','PUBLISHING','REQUIRES_RECONNECT') OR (x.status='FAILED' AND x.provider_error_code='AMBIGUOUS_DELIVERY')));
SELECT status,count(*) FROM library_items WHERE user_id=:'owner_id' GROUP BY status ORDER BY status;
SELECT count(*) AS media_count,coalesce(sum(byte_size),0) AS db_declared_bytes,
 count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM post_media pm WHERE pm.media_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM library_item_media lm WHERE lm.media_id=m.id)) AS currently_free
 FROM media_assets m WHERE m.user_id=:'owner_id';
SELECT count(*) AS post_media_links FROM post_media pm JOIN posts p ON p.id=pm.post_id WHERE p.user_id=:'owner_id';
SELECT count(*) AS library_media_links FROM library_item_media lm JOIN library_items l ON l.id=lm.library_item_id WHERE l.user_id=:'owner_id';
SELECT count(*) AS metrics_deleted_with_posts FROM publication_metrics m JOIN publications x ON x.id=m.publication_id WHERE x.user_id=:'owner_id';
SELECT count(*) AS receipts_retained FROM scheduling_plan_operations WHERE user_id=:'owner_id';
SELECT state,count(*) AS intents_retained FROM library_creation_attempts WHERE user_id=:'owner_id' GROUP BY state;
COMMIT;
```

PostTargets have `active`, not a status column; report that fact rather than inventing target statuses. DB `sum(byte_size)` is declared asset bytes, **not STORAGE_USAGE**. R2 inventory must paginate the exact owner prefix, compare securely with DB storage_key set, count/sum object sizes, count DB-without-object and object-without-DB separately, and prove prefix ownership. Object listing alone cannot associate preexisting orphans with a cleanup failure. Prefix is derived by `ownerPrefix` (`media.ts:47-49`), not the raw owner ID. Signed URLs and object bytes are unnecessary for inventory.

Redis requires read-only job-state inventory: aggregate waiting/active/delayed/failed/completed/waiting-children/paused states and scoped publication membership. Match by exact Publication ID in a secure transient manifest; count absent SQL jobs and terminal-SQL jobs. Do not call queue add/remove/retry/drain/obliterate/pause or instantiate a Worker for inspection. SQL PUBLISHING count and Redis active count represent different evidence. Free HTTP tick activity also needs a sender-barrier proof.

## Browser recovery and pending operations

Inspect **key presence/count only**, in every owner tab/browser/device. `sessionStorage` is per tab; `localStorage` survives reload and is shared by origin. The keys are owner scoped:

- Session: `planly:editor:v1:{encodedOwner}`, `planly:pending-create:v1:{encodedOwner}` (`editor-recovery.ts:31,52`; `pending-creation.ts:15`).
- Session: `planly:library-editor:v1:{encodedOwner}`, `planly:library-create:v1:{encodedOwner}` (`library-editor-recovery.ts:14,17`; `library-creation-attempt.ts:21-23`).
- Local: every `planly:scheduling-plan:v1:{encodedOwner}:*` (`scheduling-plan-recovery.ts:10-11`; `components/planner/scheduling-plan.tsx:35`).

`restoreRecovery` (`editor-recovery.ts:85-93`) converts a missing saved Post into a new unsaved draft and filters removed media; recovery is not deleted by server cleanup. `confirmDelete` (`components/planner/app.tsx:957-976`) removes visible Post/media data but does not clear the durable creation intent and editor caches. Hydration itself does not send (`pending-creation.ts:38`); an explicit save/retry can. For Library, preserved DELETED tombstones block old creation-key replay. A fresh key or restored unsaved editor can still create new content on an explicit user action. Browser inventory across inaccessible tabs/devices is UNVERIFIED, and therefore complete absence of recreation is not established.

Later cleanup must quiesce open editors/uploads/API callers first, remove only these owner recovery/pending keys after private intent reconciliation and owner-approved discard, preserve authentication cookies, and close/reload tabs so React in-memory fields do not repersist the old values. Never click “retry save” as a read-only reconciliation step: ordinary pending Post retries can insert/send. Verify keys remain absent after reload and that no Post/Library/Media reappears while senders remain barred.

## Executable later cleanup sequence and STOP conditions

This sequence names existing APIs and validations, but is **not executable with current unverified cardinalities/barriers/R2 access**. It is not permission to delete.

1. **READ-ONLY manifest gate:** record exact baseline/deployed SHA and owner scope; obtain inventory above, Redis states, R2 object inventory, recovery key counts. Secure noncommitted manifest holds exact post/library/media/publication IDs and R2 keys, baseline counts and preserved-account/session/config fingerprints. Publish only aggregate counts. Any unavailable count is UNVERIFIED and blocks approval. Refresh before execution because counts can drift.
2. **OWNER GATE:** approve exact counts, cascade losses, preserved receipts/tombstones, all-session recovery discard, secure key manifest handling, and any necessary sender barrier or exact-key orphan removal. No whole-service creation/deletion or scheduler/config change is assumed.
3. **Quiesce writers, then cancel:** prevent new owner mutations/uploads/retries/ticks under the approved operational mechanism. For each editable Post with SCHEDULED/QUEUED or safe temporary retry history, privately use safe `GET /api/posts` (`app/api/posts/route.ts:8-14`), select the exact manifest ID in memory, reconstruct only the SavePostInput fields from the returned DTO, then PATCH DRAFT, clearing scheduled times without altering content/media/targets. Require acknowledged DRAFT and durable CANCELLED rows. Stop on 409/unknown response, mixed blocked history, PUBLISHING, or ambiguous result. Reconcile by read-only state, never force retry/provider send.
4. **Prove all sender paths drained:** SQL open and PUBLISHING zero for the cleanup scope; no matching active Redis job, no in-flight tick/immediate API/provider handoff, no unacknowledged upload/mutation. Existing API cancellation suffices for future claims only; C01/C02 prevent claiming this barrier from snapshots alone. Preserve scheduler configuration and connections. If a barrier cannot be proved, STOP before any DELETE.
5. **Remove scoped residual Redis jobs under explicit authorization:** use existing `removePublicationJob(publicationId)` for manifest-owned jobs, including cancelled/failed leftovers. A locked/active removal or unfamiliar ID is STOP. Reverify absence; no global flush. Stale jobs after deletion must not be relied on as successful cancellation.
6. **DELETE Posts individually:** `DELETE /api/posts/{id}`. Verify 204 or read-only absence after unknown outcome before further action. Repeated DELETE yields 404, so treat verified manifest-owned absence as completed rather than expecting strict 204 idempotence. Confirm Post/target/media-link/Publication/metrics cascades, no provider requests caused by cleanup, and preserved accounts/sessions/receipts/tombstones.
7. **DELETE all Library statuses individually:** `DELETE /api/library-items/{id}`. Verify library/media-link absence and retained creation attempts DELETED. Do not delete `library_creation_attempts` or `scheduling_plan_operations`. Post deletion does not auto-reset USED library items; deleting both categories is intentional.
8. **DELETE now-free Media individually:** prove zero references first, use `DELETE /api/media/{id}`. Reconcile unknown outcomes via DB and R2 independently. Require R2 List/Head absence for each secure-manifest key even on 204. An R2 failure is incomplete cleanup; preserve manifest for narrowly authorized remediation. Do not delete a different owner's keys or unattested preexisting orphans.
9. **Recovery discard and final proof:** clear exactly approved owner-scoped recovery/pending keys on all reachable tabs/devices, close/reload and recheck absence; no broad cookie/site-data purge. Compare final aggregate counts to manifest: Posts/targets/publications/metrics/library/link/media/owned R2 keys zero for approved scope; no matching Redis jobs; receipts/tombstones/account/auth/connections/config retained; no re-created content. If any browser/device or storage view is inaccessible, classify that part UNVERIFIED, not CLEAN.

No transaction spans this sequence. Partial completion must be checkpointed by object/category and resumed from read-only reconciliation. Counts, object membership and unknown network results are evaluated after each category. Owner approval alone does not remedy the technical blockers.

## Inspected regression coverage

Existing tests cover cancellation of open work and stale non-READY delivery (`tests/non-ready-publication.integration.test.ts:53,66`), ordinary create-key dedupe (`post-idempotency.integration.test.ts:34,45,88`), Library deleted-intent 410 and restart replay (`library-creation-intent.integration.test.ts:81,100`; `library-create-ambiguity.integration.test.ts:109`), attachment locks (`media.integration.test.ts:28,43`), analytics cascades/late observation rejection (`analytics-repository.integration.test.ts:41`; `analytics-refresh.integration.test.ts:29`), retained scheduling receipt replay after deletion (`scheduling-plan-commit.integration.test.ts:36`), duplicate published delivery and stale PUBLISHING refusal (`publication-processor.integration.test.ts:77,107`).

Inspection did not find a test asserting safe Post DELETE while connector handoff is in flight, retained ordinary Post deletion tombstones, or durable R2 deletion retry/receipt on storage failure. These remain independently scoped reliability candidates, not implemented changes. Test fixture cleanup often deletes users/content directly and must never run against production. Fresh results are owned by the parent audit.
