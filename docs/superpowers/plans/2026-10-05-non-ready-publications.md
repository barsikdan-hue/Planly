# Non-ready publication safety implementation plan

> **For agentic workers:** Use superpowers:executing-plans with systematic-debugging, test-driven-development and verification-before-completion. The owner authorized autonomous execution within the release candidate campaign.

**Goal:** DRAFT and ARCHIVED posts must never be sent merely because their targets retain a schedule.

**Architecture:** Preserve the existing Post → PostTarget → Publication → queue/tick → connector pipeline. Enforce the same READY invariant during transactional reconciliation and before connector handoff. Preserve validation and immutable-history error ordering.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, Node test runner, existing GitHub CI.

**Contract:** Owner's 2026-10-05 customer-ready campaign; normal draft saves already clear schedules in `toSavePostInput`. Source checkpoint `c1dde2c`. No product expansion, migration, secrets, provider sends, infrastructure, merge or deploy.

## Task 1: Prove and repair non-ready publication safety

**Files:** `tests/non-ready-publication.integration.test.ts`, `lib/server/publications.ts`, `lib/server/scheduler/processor.ts`.

**Interfaces:** Preserve `reconcilePostPublicationsInTx(tx, userId, postId)` and `processPublication(publicationId, resolveConnector)`; use existing `PublicationQueueChange` and `CANCELLED` behavior.

**Review focus:** READY immediate/future schedules still publish; stale jobs cannot send a draft; downgrade cancels open jobs; published/in-flight/uncertain history stays protected; owner isolation and edit locking stay intact.

- [x] Add regression cases: DRAFT/ARCHIVED with retained target schedules create no Publication; READY → non-ready cancels an open Publication and requests queue removal; a historical stale row is cancelled before any fixture connector call; READY still sends once; terminal history remains unchanged.
- [x] Observe RED in actual GitHub CI with native PostgreSQL/Redis before changing runtime code. Local DB infrastructure is unavailable; PGlite startup failed from host memory pressure.
- [x] In reconciliation, read the owned Post in the same transaction and treat non-READY as unscheduled, reusing existing cancellation/removal logic.
- [x] In the processor, after the atomic claim and fresh joined read, cancel a non-READY row before media preparation/connector handoff. Keep all existing terminal/PUBLISHING checks ahead of this guard.
- [x] Verify focused GREEN and full native CI, including existing published-edit guard, scheduler, idempotency, Phase 6 and PR #8 tests; typecheck, lint and standard build. Local webpack build is supporting evidence only because shared dependencies are outside Turbopack's worktree root.
- [x] Review, commit, push and stop at OWNER_MERGE_GATE with the PR and [evidence](../../verification/2026-10-05-mvp-release-candidate.md). Provider acceptance of this fix requires a later authorized deployment and a minimal smoke.
