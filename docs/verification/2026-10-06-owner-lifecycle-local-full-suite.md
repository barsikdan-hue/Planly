# CR11 local whole-project test limitations

Runtime checkpoint: `915f4fe14b46c599ba6ce9905d2b9618d449b574`; Windows Node v24.21.0. Supporting local evidence, not native CI.

Command: `node --max-old-space-size=512 --test --test-reporter=tap --test-concurrency=1 --experimental-strip-types` followed by every `tests/*.test.mjs` and `tests/*.test.ts` file (the package test selection).

**Actual: 531 tests / 360 PASS / 171 FAIL / 0 skipped**, exit 1. DATABASE_URL and REDIS_URL were not configured. Pure selection separately passed 359/359/0skip; expanded/protected passed164/164/0skip. All new CR11 tests passed in this whole-project command.

169 failures report required missing DATABASE_URL through server-env/getDb setup hooks. Health expects200 but returns503 when database connectivity cannot be established. One existing Windows self-host test uses a URL pathname as a shell file path and attempts `C:\C:\Users\...\SMM%20Planer\...\init-self-host.mjs`; module is not found. Native/API tests, health runtime and self-host script/test are unchanged by CR11; these local limitations are not a new App regression. Do not repair unrelated infrastructure/platform debt here.

No native PASS is inferred. The accepted gate requires Owner-approved PR17 merge, CR11 fresh-main rebase and actual exact-HEAD native PostgreSQL/Redis CI with0FAIL/0SKIP plus Docker before READY.

Full ignored log: `.superpowers/customer-ready/cr11-whole-project.log`. Every failing record is named below; no failure omitted.

| Classification | Failing test |
| --- | --- |
| MISSING_DATABASE_URL | bootstrap rejects unauthenticated requests and returns owner snapshot when authenticated |
| MISSING_DATABASE_URL | Library API authenticates collection and item routes before processing content |
| MISSING_DATABASE_URL | Library API uses JSON 400, validation 422, READY creation, full replacement and 204 deletion |
| MISSING_DATABASE_URL | Library API foreign and missing items and media return safe indistinguishable 404 |
| MISSING_DATABASE_URL | Library API exposes USED source Post in list and bootstrap and keeps USED on edit |
| MISSING_DATABASE_URL | Media DELETE protects Library-only and Post references with safe 409 and owner 404 |
| MISSING_DATABASE_URL | posts endpoint distinguishes malformed JSON, invalid input and valid creation |
| MISSING_DATABASE_URL | unknown post is 404 and response does not expose stack or database internals |
| MISSING_DATABASE_URL | owner API saves captionless media, preserves it after reload and schedules independent targets |
| MISSING_DATABASE_URL | captionless media cannot bypass ownership or refer to missing assets |
| MISSING_DATABASE_URL | Telegram connection verifies channel posting permissions before exposing CONNECTED |
| MISSING_DATABASE_URL | owner login accepts configured credentials and rejects wrong credentials |
| MISSING_DATABASE_URL | session stores only a hash and rejects forged, expired and invalidated tokens |
| MISSING_DATABASE_URL | another database user cannot receive an owner session |
| MISSING_DATABASE_URL | persistent login rate limit blocks the sixth attempt and clears after success |
| MISSING_DATABASE_URL | PostgreSQL stores the owner content graph and cascades owner deletion |
| MISSING_DATABASE_URL | owner email and publication idempotency keys are unique |
| HEALTH_503_WITHOUT_DATABASE | health endpoint proves database connectivity without exposing configuration |
| MISSING_DATABASE_URL | reading a READY Library source never creates a Post or changes its status |
| MISSING_DATABASE_URL | successful conversion commits one first-class Post and USED source before queue mirroring |
| MISSING_DATABASE_URL | ARCHIVED source is rejected without creating a Post or a queue change |
| MISSING_DATABASE_URL | invalid Post relations leave the Library source READY and its creation key reusable |
| MISSING_DATABASE_URL | a failure during publication insertion rolls back Post, targets, media and source state together |
| MISSING_DATABASE_URL | USED source resolves the surviving Post and does not reconcile or mirror again |
| MISSING_DATABASE_URL | USED source whose Post was deleted cannot create a second source Post |
| MISSING_DATABASE_URL | two concurrent conversions with different keys produce one source Post and one publication |
| MISSING_DATABASE_URL | concurrent same-key conversion of different sources conflicts and leaves the losing source READY |
| MISSING_DATABASE_URL | a key bound to another source while USED conversion waits must conflict after acquiring the owner lock |
| MISSING_DATABASE_URL | conversion racing archive: archive locks first |
| MISSING_DATABASE_URL | conversion racing archive: conversion locks first |
| MISSING_DATABASE_URL | conversion racing update: update locks first |
| MISSING_DATABASE_URL | conversion racing update: conversion locks first |
| MISSING_DATABASE_URL | conversion racing delete: delete locks first |
| MISSING_DATABASE_URL | conversion racing delete: conversion locks first |
| MISSING_DATABASE_URL | queue approval racing earlier archive rejects stale source atomically |
| MISSING_DATABASE_URL | queue approval racing earlier update rejects stale source atomically |
| MISSING_DATABASE_URL | queue approval racing earlier delete rejects stale source atomically |
| MISSING_DATABASE_URL | Library create starts READY, trims content and preserves media order without creating a Post |
| MISSING_DATABASE_URL | Library list orders latest updates first and excludes another owner |
| MISSING_DATABASE_URL | Library full replacement clears omitted title, replaces ordered media, archives and restores |
| MISSING_DATABASE_URL | Library create and update reject foreign or missing media atomically |
| MISSING_DATABASE_URL | Library foreign and missing mutation failures are indistinguishable and preserve the owner item |
| MISSING_DATABASE_URL | Library edit of USED copy keeps USED and exposes source Post without changing that Post |
| MISSING_DATABASE_URL | Library deletion removes joins, preserves media and source Post, and clears its FK |
| MISSING_DATABASE_URL | Library DTO never exposes another owner source Post even if linked in the database |
| MISSING_DATABASE_URL | conditional Library archive preserves ordered media and rejects missing, foreign and USED sources |
| MISSING_DATABASE_URL | Library-only media reference prevents asset and object deletion until detached |
| MISSING_DATABASE_URL | media deletion waits for a concurrent Library attachment and preserves the committed attachment |
| MISSING_DATABASE_URL | upload validates before storage, persists owner metadata and returns signed preview |
| MISSING_DATABASE_URL | cross-owner delete is rejected and attached media cannot be deleted |
| MISSING_DATABASE_URL | failed database insert compensates by deleting uploaded object |
| MISSING_DATABASE_URL | DRAFT with a retained target schedule creates no publication |
| MISSING_DATABASE_URL | READY to DRAFT cancels an open publication even when the date is retained |
| MISSING_DATABASE_URL | a stale queued DRAFT publication is cancelled before connector handoff |
| MISSING_DATABASE_URL | ARCHIVED with a retained target schedule creates no publication |
| MISSING_DATABASE_URL | READY to ARCHIVED cancels an open publication even when the date is retained |
| MISSING_DATABASE_URL | a stale queued ARCHIVED publication is cancelled before connector handoff |
| MISSING_DATABASE_URL | READY retains immediate publication and duplicate protection |
| MISSING_DATABASE_URL | non-ready guard preserves protected PUBLISHED history |
| MISSING_DATABASE_URL | non-ready guard preserves protected FAILED history |
| MISSING_DATABASE_URL | non-ready guard preserves protected REQUIRES_RECONNECT history |
| MISSING_DATABASE_URL | non-ready guard preserves protected PUBLISHING history |
| MISSING_DATABASE_URL | C:\\Users\\EliteSochi\\Documents\\ChatGPT\\SMM Planer\\work\\Planly-owner-lifecycle\\tests\\non-ready-publication.integration.test.ts |
| MISSING_DATABASE_URL | preview uses selected owned accounts and minute occupancy including seconds |
| MISSING_DATABASE_URL | preview rejects disabled/disconnected accounts without foreign fallback |
| MISSING_DATABASE_URL | active targets reserve every publication outcome except latest CANCELLED |
| MISSING_DATABASE_URL | only latest publication controls cancellation; target without history still reserves |
| MISSING_DATABASE_URL | automatic approval requires READY, targets and one shared instant; draft without targets schedules nothing |
| MISSING_DATABASE_URL | automatic conflict and elapsed slot preserve READY source and create no additional rows |
| MISSING_DATABASE_URL | stale approval and conditional archive preserve edited content and media |
| MISSING_DATABASE_URL | source revision advances even when edits share the same clock millisecond |
| MISSING_DATABASE_URL | queue scheduled approvals enforce connected accounts while legacy manual contract remains |
| MISSING_DATABASE_URL | idempotency and linked-source replay precede elapsed/stale/occupied validation |
| MISSING_DATABASE_URL | API preview requires owner auth and validates query; status-only reject preserves full content |
| MISSING_DATABASE_URL | conditional rejection rejects content-bearing commands rather than bypassing revision guard |
| MISSING_DATABASE_URL | POST source options reach transactional slot guard with zero precommit writes |
| MISSING_DATABASE_URL | source options retain planner context and hashes preserve legacy bytes |
| MISSING_DATABASE_URL | concurrent automatic approvals cannot claim the same minute |
| MISSING_DATABASE_URL | Composer reschedule and creation wait on the same owner schedule lock |
| MISSING_DATABASE_URL | planner/source conflicts have explicit precommit HTTP codes |
| MISSING_DATABASE_URL | C:\\Users\\EliteSochi\\Documents\\ChatGPT\\SMM Planer\\work\\Planly-owner-lifecycle\\tests\\planner-slots.integration.test.ts |
| MISSING_DATABASE_URL | authenticated PATCH cannot pair changed text with the original published receipt |
| MISSING_DATABASE_URL | published post rejects title mutation atomically |
| MISSING_DATABASE_URL | published post rejects text mutation atomically |
| MISSING_DATABASE_URL | published post rejects override mutation atomically |
| MISSING_DATABASE_URL | published post rejects schedule mutation atomically |
| MISSING_DATABASE_URL | published post rejects status mutation atomically |
| MISSING_DATABASE_URL | published post rejects remove target mutation atomically |
| MISSING_DATABASE_URL | published post rejects add target mutation atomically |
| MISSING_DATABASE_URL | published post rejects media order mutation atomically |
| MISSING_DATABASE_URL | PUBLISHING/in flight cannot be edited into a new apparent publication |
| MISSING_DATABASE_URL | REQUIRES_RECONNECT/TELEGRAM_401 cannot be edited into a new apparent publication |
| MISSING_DATABASE_URL | FAILED/AMBIGUOUS_DELIVERY cannot be edited into a new apparent publication |
| MISSING_DATABASE_URL | one published target blocks changes to the remaining scheduled target |
| MISSING_DATABASE_URL | inactive target history still blocks edits and is exposed as a post-level reason |
| MISSING_DATABASE_URL | exact published PATCH replay is a no-op, including timestamps and queue mirroring |
| MISSING_DATABASE_URL | draft content and unexecuted schedule remain editable with stable publication identity |
| MISSING_DATABASE_URL | processor claim before PATCH keeps the content handed to the provider immutable |
| MISSING_DATABASE_URL | native PostgreSQL edit lock serializes the real processor claim before content is read |
| MISSING_DATABASE_URL | C:\\Users\\EliteSochi\\Documents\\ChatGPT\\SMM Planer\\work\\Planly-owner-lifecycle\\tests\\post-edit-guard.integration.test.ts |
| MISSING_DATABASE_URL | concurrent POST retries with one key create one post and one publication |
| MISSING_DATABASE_URL | sequential lost-response POST retry returns one post and one publication |
| MISSING_DATABASE_URL | same creation key is isolated between owners |
| MISSING_DATABASE_URL | a key is bound to its original request even after the post was edited |
| MISSING_DATABASE_URL | a rejected first request can be corrected using its uncommitted key |
| MISSING_DATABASE_URL | malformed creation key is rejected before persistence |
| MISSING_DATABASE_URL | replaying creation does not repeat queue reconciliation or mirroring |
| MISSING_DATABASE_URL | target order is canonical while media order remains part of original identity |
| MISSING_DATABASE_URL | POST accepts a create-only source in the body and same-key same-source retry returns that Post |
| MISSING_DATABASE_URL | creation key conflicts on changed or removed source even when content is unchanged |
| MISSING_DATABASE_URL | ordinary creation key conflicts when a Library source is added to the same content |
| MISSING_DATABASE_URL | changed content under the same key conflicts before a USED source can resolve the existing Post |
| MISSING_DATABASE_URL | changed source under a used key conflicts before resolving another already USED source |
| MISSING_DATABASE_URL | a fresh key returning a USED source stays unreserved and preserves canonical creation identity |
| MISSING_DATABASE_URL | POST missing and foreign Library sources return indistinguishable safe 404 responses |
| MISSING_DATABASE_URL | POST rejects malformed create-only source IDs through existing 422 validation |
| MISSING_DATABASE_URL | ARCHIVED and orphaned USED sources produce safe client conflicts rather than server errors |
| MISSING_DATABASE_URL | create/update preserves per-provider text, schedule and media order |
| MISSING_DATABASE_URL | second owner cannot read, update or delete another owners post |
| MISSING_DATABASE_URL | foreign-owner media is rejected and transaction leaves no post behind |
| MISSING_DATABASE_URL | updating a post preserves target identity for the same social account |
| MISSING_DATABASE_URL | ordinary Post creation without a source preserves null provenance and leaves Library READY |
| MISSING_DATABASE_URL | Post PATCH cannot replace or clear source provenance and does not consume another Library item |
| MISSING_DATABASE_URL | updatePost ignores source options and preserves the immutable original source |
| MISSING_DATABASE_URL | overlong scheduled Telegram text is rejected before persistence and queue mirroring |
| MISSING_DATABASE_URL | one invalid target rejects the complete update with actionable 422 and keeps old state |
| MISSING_DATABASE_URL | owned media metadata prevents invalid captions, formats and image dimensions before queueing |
| MISSING_DATABASE_URL | unscheduled draft remains permissive and a valid override schedules independently of long base text |
| MISSING_DATABASE_URL | scheduled DRAFT and empty override cannot bypass provider validation |
| MISSING_DATABASE_URL | owner POST route returns actionable 422 without durable writes |
| MISSING_DATABASE_URL | tick leaves provider VALIDATION terminal without an automatic retry |
| MISSING_DATABASE_URL | worker leaves provider VALIDATION terminal without an automatic retry |
| MISSING_DATABASE_URL | publish-now input is recognized without treating a future schedule or draft as immediate |
| MISSING_DATABASE_URL | scoped catch-up processes only the requested owner and post |
| MISSING_DATABASE_URL | publish-now POST processes its publication before returning instead of waiting for cron |
| MISSING_DATABASE_URL | authenticated bootstrap catches up an overdue owner publication without external cron |
| MISSING_DATABASE_URL | successful publish stores remote ID and becomes PUBLISHED |
| MISSING_DATABASE_URL | duplicate delivery after PUBLISHED does not call connector again |
| MISSING_DATABASE_URL | TEMPORARY connector failure is normalized without fake success |
| MISSING_DATABASE_URL | AUTH connector failure is normalized without fake success |
| MISSING_DATABASE_URL | VALIDATION connector failure is normalized without fake success |
| MISSING_DATABASE_URL | PERMANENT connector failure is normalized without fake success |
| MISSING_DATABASE_URL | successful connector result without remote ID is rejected |
| MISSING_DATABASE_URL | stale PUBLISHING is never blindly sent again |
| MISSING_DATABASE_URL | processor passes captionless ordered private media bytes to TELEGRAM and stores confirmed ID |
| MISSING_DATABASE_URL | processor passes captionless ordered private media bytes to MAX and stores confirmed ID |
| MISSING_DATABASE_URL | unexpected connector exception after handoff is not eligible for a blind retry |
| MISSING_DATABASE_URL | scheduled target has one durable open publication and repeated save stays idempotent |
| MISSING_DATABASE_URL | rescheduling keeps publication identity and updates its due time |
| MISSING_DATABASE_URL | removing a target preserves its row and cancels its unexecuted publication |
| MISSING_DATABASE_URL | ordinary save cannot recreate a publication after ambiguous provider delivery |
| MISSING_DATABASE_URL | PostgreSQL commit survives queue mirroring failure |
| MISSING_DATABASE_URL | reconciliation restores a missing job exactly once from PostgreSQL |
| MISSING_DATABASE_URL | reschedule replaces the old delayed time for the same publication job |
| MISSING_DATABASE_URL | cancelled publications are removed and never re-enqueued by reconciliation |
| MISSING_DATABASE_URL | Redis queue reconstruction respects future provider retry deadline |
| MISSING_DATABASE_URL | web scheduler tick publishes due rows without Redis and leaves future rows alone |
| MISSING_DATABASE_URL | web scheduler tick respects provider retry_after before retrying queued publications |
| MISSING_DATABASE_URL | web scheduler tick preserves temporary failures for a later retry without Redis |
| MISSING_DATABASE_URL | scheduler tick endpoint requires the private bearer secret |
| MISSING_DATABASE_URL | delayed job does not publish early and fires after due time |
| MISSING_DATABASE_URL | duplicate queue delivery after success does not publish twice |
| MISSING_DATABASE_URL | worker restart before due time does not lose delayed publication |
| MISSING_DATABASE_URL | TEMPORARY failure retries and later succeeds |
| MISSING_DATABASE_URL | TEMPORARY retry exhaustion stops after bounded attempts |
| MISSING_DATABASE_URL | provider retry_after prevents an early retry while preserving the bounded budget |
| WINDOWS_SELF_HOST_PATH | self-host setup writes private credentials, a usable password hash and literal dollar signs |
| MISSING_DATABASE_URL | create, reload, edit targets, reload, delete and reload are PostgreSQL authoritative |
| MISSING_DATABASE_URL | owner bootstrap creates exactly Telegram and MAX disconnected rows without credentials |
| MISSING_DATABASE_URL | another owner cannot toggle a guessed social account id |
| MISSING_DATABASE_URL | MAX owner connection validates remote bot and chat before persisting canonical destination |
