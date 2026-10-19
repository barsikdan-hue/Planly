# Lentaro M1 B — atomic shared feed server verification

Date: 2026-10-19. Status: **SOURCE_REVIEW_CANDIDATE / FOCUSED_LOCAL_PASS**.

Source commit: `1c0d7df730e59891cf402b19e570a6b6317dde11` on `codex/lentaro-m1`; baseline `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`. Parent-owned UI/docs work was present during whole-worktree typechecking and was not included in this server commit. Independent focused review, final integrated full CI/build/browser verification and external release remain separate steps.

## Implemented boundary

`GET /api/shared-feed` returns the existing opaque shared DTOs excluding this user's decided share/revision. `POST /api/shared-feed/decisions` accepts a strict LIKE/DISLIKE intent. `GET /api/shared-feed/decisions/[operationId]` returns only the actor's immutable receipt. Responses use `{receipt,replayed}` and the contract exports agreed with the UI.

One PostgreSQL transaction holds the actor lock and source revision lock, creates independent private Library/media, creates the Post and existing target/publication relations, captures USER binding revisions, records personal swipe feedback and shared provenance, and marks the copy USED. DISLIKE writes only private provenance. Receipt primary key scopes operations to the user; unique user/share/revision enforces first decision. Source/result identifiers deliberately have no cascading foreign keys so deleted results remain terminal.

The narrow `copySharedLibrarySources` internal primitive reuses the original checksums, ordered copies, aggregate 20-file/100-MiB admission and cancellation. Its 60-second signal starts after media locking/admission, preserving the original forward-copy timing; rollback cleanup retains separate 30-second storage calls. The original public copy receipts and DTO shape remain unchanged. The existing B1 USER-only authorization was not changed.

Final session validation occurs after waits/storage/receipt preparation and takes a session SHARE lock through COMMIT. Historical replay validates current access/session but precedes current shared-source checks. Queue mirroring occurs only after known COMMIT; queue failure leaves durable publications for existing reconciliation. Lost COMMIT acknowledgement is reconciled under the actor lock. An unreadable outcome preserves copied bytes and requires same-operation recovery.

## RED and GREEN evidence

Initial RED was observed before implementation:

- `tests/shared-feed-contract.test.ts`: **2 failed**, explicit missing strict intent/receipt schema assertions.
- `tests/shared-feed.integration.test.ts`: **14 failed**, explicit missing atomic shared-feed service assertion in setup. This is the initial native feature boundary; the final expanded 28-test set is not claimed to have all failed before implementation.

The first implemented run had 15/16 passing; the remaining test incorrectly supplied an own `approval: undefined` property on strict DISLIKE. It was corrected to an actually valid changed intent so it tests hash conflict rather than schema rejection. The synthetic unavailable-outcome helper was also corrected to honor pg callback calls. An interrupted expanded run and a subsequent all-setup-failure run overlapped local memory error 1455 and absent task fixture listeners after environment refresh. No source root cause or PASS was inferred from those runs. The owner task restarted the same disposable fixtures; final runs below completed normally.

Final fresh commands ran from `work/Planly-lentaro-m1` using the task-local safe runner, which removes inherited service credentials and supplies synthetic loopback configuration:

```text
node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs --experimental-strip-types --test --test-concurrency=1 tests/shared-feed-contract.test.ts tests/shared-feed.integration.test.ts
28 PASS / 0 FAIL / 0 SKIP; exit 0; duration 8758.958 ms

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs --experimental-strip-types --test --test-concurrency=1 tests/shared-library.integration.test.ts tests/library-batch.integration.test.ts tests/swipe-feedback.integration.test.ts tests/swipe-post-handler.test.ts
83 PASS / 0 FAIL / 0 SKIP; exit 0; duration 33973.8675 ms

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/typescript/bin/tsc --noEmit
exit 0

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/eslint/bin/eslint.js lib/contracts/shared-feed.ts lib/server/shared-feed.ts lib/server/shared-library.ts db/schema.ts app/api/shared-feed tests/shared-feed-contract.test.ts tests/shared-feed.integration.test.ts
exit 0, no diagnostics

git diff --cached --check
exit 0
```

The 28 tests include strict payload/result consistency; atomic LIKE and no-copy DISLIKE; USER A/B independent copies and bindings; ADMIN/configured-owner individual rights; ADMIN/other-USER private operation denial; same/different-key concurrency; hash conflict; stale/unshare lock races; deleted-result 410; ordered exact bytes/checksums; occupied slot; disabled account/missing USER binding; storage failure/compensation; logout/session expiry during IO and lifecycle/result lock waits; actual COMMIT with lost acknowledgement; unreadable COMMIT outcome; known pre-COMMIT rollback; queue failure; real route session/CSRF/identity guards.

The 83 existing regression tests include public copy DTO and storage boundaries, cumulative deadlines, uncertain PUT/COMMIT cleanup, B1 fresh ADMIN/configured-owner denial, USER publication binding, receipt races, cancellation and existing swipe feedback. They passed with the extracted common copy primitive.

## Migration and environment

Generated by the existing Drizzle tooling: `0016_shared_feed_decisions.sql`, its generated snapshot, and additive journal entry. Only the new table, shape constraint, user foreign key and unique decision index are added.

```text
node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/drizzle-kit/bin.cjs generate --name shared_feed_decisions
generated 0016_shared_feed_decisions.sql

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/drizzle-kit/bin.cjs migrate
migrations applied successfully; exit 0

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/drizzle-kit/bin.cjs generate --name shared_feed_drift_check
No schema changes, nothing to migrate; exit 0
```

This rehearsal used only fresh task-owned local PostgreSQL 16, `127.0.0.1:55681/planly_test`, and Redis `127.0.0.1:6388`. Runtime Node was `v24.21.0`. Media IO used a test-owned loopback object-storage server. Existing other-port fixtures and inherited DATABASE_URL were not used. Persistent staging/production databases, provider configuration and infrastructure were not changed. **Real provider calls/sends: 0**; mock transports/loopback only. Local evidence does not establish Linux CI, deployed runtime, provider acceptance or recovery of persistent data.

## Client recovery codes

Known conflicts: `SHARED_FEED_OPERATION_CONFLICT` 409, `SHARED_FEED_ALREADY_DECIDED` 409, `SHARED_FEED_SOURCE_STALE` 409. Own operation absent: `SHARED_FEED_RESULT_NOT_FOUND` 404. Deleted mapped copy/Post: `SHARED_FEED_RESULT_DELETED` 410, never recreation. Missing/unshared opaque source: existing `SHARED_SOURCE_UNAVAILABLE` 404.

Uncertain/recoverable failures: `SHARED_FEED_OUTCOME_UNKNOWN` 502, `SHARED_FEED_CLEANUP_FAILED` 502, `SHARED_FEED_TIMEOUT` 504, `SHARED_FEED_FAILED` 502. Preserve the immutable operation and use result lookup/same-key retry. Existing account/slot/content/auth validation errors retain their existing response codes.

Next: independent focused server review of the named source commit; integrate its result with the M1 UI candidate and exact-head CI. No push, merge, deploy, persistent migration or provider operation was performed by this server task.

## Whole-M1 review correction: bind consent to the displayed actor

Review found a P1 race on candidate `fc26d14fb0b454d578ff850fbc6fc60a46de635d`: an old tab displaying USER A could send its consent after another tab replaced the session cookie with USER B. Because the request identified only shared source and provider names, the server correctly authenticated B but incorrectly treated A's displayed intent as consent to B's accounts.

Causal native RED, before the fix:

```text
node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs --experimental-strip-types --test --test-concurrency=1 --test-name-pattern="stale owner A" tests/shared-feed.integration.test.ts
0 PASS / 2 FAIL; exit 1
LIKE observed {posts:1, receipts:1, publications:2, copies:1}, expected all zero.
DISLIKE observed {receipts:1}, expected zero.
```

Contract RED then confirmed the old schema rejected the expected actor field and still accepted an intent without one (2 FAIL / 1 PASS).

Fix source commit: `46ad74db6a041122d4f0b440a6c5abfb1c60e540`. The new, not-yet-deployed API now requires `expectedActorId` (string length 1–200). It is compared with the authenticated, locked actor **before historical receipt lookup or copying**, and is also checked during uncertain-COMMIT reconciliation. It never selects the actor or grants another user's authority. The immutable request hash includes this precondition; receipt shape and database schema are unchanged. The existing `readJson` identity-override guard remains unchanged and permits this neutral comparison field.

Mismatch returns `409 SHARED_FEED_ACTOR_CHANGED`, with no copied bytes, Post, publication, receipt, queue action or successful acknowledgement. Client handling must retain the pending exact intent and recover only in its original actor context. Missing precondition is 422. Matching context retains the existing approval/replay behavior.

Fresh final verification for the correction:

```text
node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs --experimental-strip-types --test --test-concurrency=1 tests/shared-feed-contract.test.ts tests/shared-feed.integration.test.ts
33 PASS / 0 FAIL / 0 SKIP; exit 0; duration 4895.2843 ms

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/eslint/bin/eslint.js lib/contracts/shared-feed.ts lib/server/shared-feed.ts tests/shared-feed-contract.test.ts tests/shared-feed.integration.test.ts
exit 0

node .superpowers/sdd/2026-10-19-lentaro-m1/run-node.mjs node_modules/typescript/bin/tsc --noEmit
exit 0
```

The 33 checks include both stale-cookie LIKE and DISLIKE, mismatch before a same-operation historical receipt, HTTP 409/422/matching-context 201 through the unchanged identity guard, and all existing atomicity/session/storage/queue/recovery cases. Only disposable PG55681 and loopback fixture media were used. No additional migration, full-suite rerun, provider call or deployment was performed for this correction. UI/journal integration and final whole-M1 review/CI belong to the coordinating task.
