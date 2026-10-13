# Swipe Planner 2.0 — transactional feedback and private export

Local implementation record, 2026-10-13. Task 3 depends on the slot-flow commit `10c9715aec51246696e15e5532690f80ac93e2f5`; its draft PR is stacked on the slot branch. This is not production acceptance. Merge, production migration/deployment and real provider sends remain an Owner Gate.

New marked review decisions save a retained receipt and one current assessment per owner/source in the same transaction as Post creation/USED or Library archive. An explicit later review replaces the current assessment; history remains. Skip, edits, unmarked Composer conversions and replay create no assessment. Metadata describes the acknowledged source version, including its ordered-media fingerprint; it contains no title/body, media URLs or credentials.

Receipt lookup and canonical hash comparison precede live readiness, time and account checks. An unchanged UUID replays its owned result. A deleted LIKE Post or DISLIKE Library result returns `DECISION_RESULT_DELETED` (410), without recreation. Deleting only a LIKE source preserves replay of its surviving Post; exported `sourceDeleted` and `resultDeleted` flags distinguish those cases. Marked DTOs are materialized while result locks and the transaction remain active.

Pre-receipt Task 2 Posts still replay by their existing key without fabricated feedback. Once such an old Post and its key are deleted, retained deletion recovery cannot be guaranteed; no historical backfill is performed.

Review has durable owner-scoped DISLIKE recovery alongside existing LIKE recovery. Hydration sends no mutation. Explicit retry sends the original UUID/path/body; unknown outcomes retain it. Typed terminal 410 resolves only the matching current-owner intent, shows a deletion notice and adds no review count. Either unresolved decision blocks new review decisions. Owner generation and operation guards protect late callbacks, storage and busy state.

The Review screen's “Мои оценки” loads private statistics on demand. The aggregate counts latest confirmed assessments by source, including deleted sources, with `likeRatio: null` for zero total and no inferred topics. “Скачать JSON” manually exports versioned safe metadata/current assessments/receipt history. Both authenticated GET endpoints reject query selectors, use `private, no-store` and a read-only repeatable-read transaction. Late responses after an owner change cannot apply a summary or initiate a download.

## Local verification

All database checks use isolated TEST PostgreSQL; additive migration `0009_swipe_feedback.sql` was applied there only. No production database, live providers, paid resources or production export files were used.

- Behavioral RED omitted atomic persistence: receipt/current counts were zero instead of one, rollback and terminal replay assertions failed; restored implementation passed native tests.
- Snapshot RED used READ COMMITTED while a native lock delayed the second query and the source was deleted. It observed the newer deletion flag; REPEATABLE READ preserves the established snapshot. A separate native Post deletion lock proves replay waits and returns typed 410.
- Focused regression: 198/198, no skips; final narrow native/API/legacy conversion checks: 32/32, no skips. Covers rollback/no queue mirror, opposite decisions, explicit replacement, shared UUID across decision kinds, replay after cutoff/disconnect/source edit, lifecycle/privacy, owner recovery and legacy Composer behavior.
- Targeted actual browser: 10/10 across desktop 1366×768 and mobile 390×844, retries/skips zero. Lost DISLIKE response and reload, identical replay, terminal LIKE/DISLIKE, manual download/zero ratio and stale-owner download prevention. All external requests fail closed; unexplained browser errors zero.
- Final typecheck, lint, build and migration drift generation: exit 0; lint has 0 errors and 15 pre-existing warnings; build reports ANALYTICS_CSS_OK; generation reports no schema changes. Final full browser suite: 48/48, retries/skips zero, including retained full-text, native touch, media, keyboard, motion and slot-conflict cases.
- Full native suite starts only on frozen source after all heavy checks and the independent browser inspection. Its exact final result, independent Critic and GitHub checks are recorded in the final stacked PR; none is implied by these local checks. See [remote delivery record](2026-10-13-swipe-planner-2-remote.md).
