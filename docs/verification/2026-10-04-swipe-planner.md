# Phase 6 Swipe Planner — integration evidence, 2026-10-04

Base: `49a16c977aed425c99e5fa81bcb3705526a5653c`. Branch: `codex/phase6-swipe-planner`. Owner-approved spec/plan, implementation only through PR gate. Production is unchanged; merge/deploy and final Render acceptance require the owner gate.

## Implemented contract

Existing READY Library cards, oldest first. Skip stays READY; conditional reject archives without content replacement. Explicit per-card approval creates a draft or a manual/next-slot scheduled Post through existing durable creation, PostTarget reconciliation and scheduler paths. Presets/custom times and 7/30-date horizons are session-only. Nothing submits during hydration or preset changes.

Server preview reads actual selected owned targets and latest cancellation state. Save serializes owner schedule writes before source/Post/publication locks, revalidates connected accounts, future time, source revision and minute occupancy in the existing transaction. Same-key/source replay returns the committed Post before elapsed-slot/version revalidation. No DB schema, migration, dependency, connector or worker changes.

## Fresh local evidence

- Backend focused suite: 92 total, **75 passed / 17 native-lock skips / 0 failed**. Fresh isolated PGlite database; skips are not PostgreSQL concurrency proof. Native PostgreSQL/Redis full suite is the required CI gate.
- Durable approval/Composer/Library regression suite: **101/101 passed**, no skips.
- Review UI suite after independent-review correction: **15/15 passed**. Original UI/Library/navigation focused integration: **68/68 passed** before that correction. Tests overlap; counts must not be added as unique tests.
- Whole-repository typecheck PASS. Lint PASS: **0 errors / 13 warnings**. Production Next.js build PASS after final runtime fix.
- Migration generation reports no schema changes; `git diff --exit-code -- drizzle/` PASS. Existing migrations applied successfully only to the fresh isolated local DB.
- Compiled local runtime, browser + DB acceptance: skip READY and unlinked, reject ARCHIVED and unlinked, exactly three approved Posts, draft without targets, manual 2026-10-06 11:30 MSK and next 2026-10-05 10:00 MSK stored at exact UTC times, no PUBLISHED record. Daily/custom equivalent preset switches resolve a fresh preview. Fixtures use no running worker/provider transport.
- Hook tests cover horizontal threshold/cancel/vertical/media exclusions, focused keyboard controls, 5xx/lost response/reload exact-payload retry, storage failure, stale source and unrelated dirty Composer. Physical mobile touch and real browser network-loss injection are not claimed.

## Review and implementation rulings

Independent fresh code review found one preset transition that cleared preview without restarting an equivalent query. Regraded as a blocked supported next-slot flow; reproduced RED, minimal refresh-generation fix, 15/15 GREEN. No other critical/important review finding remained.

Owner schedule locking required the older same-source native race fixture to observe owner serialization rather than hold a source lock while waiting for a second owner-locked request. The revised assertions still prove one committed conversion and stale-source recheck. New tests explicitly cover concurrent automatic approvals and Composer rescheduling. Source revision timestamps advance monotonically even within the same millisecond (frozen-clock RED/GREEN).

Legacy creation hashes remain unchanged when planner context is absent. Queue acknowledgement bypasses Composer PATCH logic, so the existing canonical content helper needs no alteration. The pure year-9999 horizon boundary was reproduced and fixed with bounded numeric enumeration.

Windows setup failures were dependency/runtime issues: Turbopack cannot build through an external node_modules junction; an isolated frozen offline install resolved this. A temporary preserved dependency link matching TypeScript's source glob was moved outside the worktree. No application configuration was changed. The pure-slot child-process startup timeout was widened to ten seconds; its behavioral assertion is unchanged.

## Remote integration / owner gate

PR checks must pass on the final branch head before READY_FOR_OWNER_MERGE_GATE: native full tests, typecheck, lint, production build, migration drift/apply and Docker Self-host runtime. Actual run links/counts belong to the PR checks and final handoff; local skips or historical main checks do not replace them. The live Telegram workflow is intentionally not requested.

After authorized merge/deploy, compare deployed SHA and verify the existing Render Library → Swipe → Calendar flow. Production/provider acceptance remains pending. Known excluded debt (Library/bootstrap performance, list/delete race, Windows self-host init, signed preview lint, Logout) remains outside this change.
