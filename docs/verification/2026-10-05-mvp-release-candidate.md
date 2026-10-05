# MVP release candidate campaign — first owner gate

STATUS: READY_FOR_OWNER_MERGE_GATE for the non-ready publication fix; the broader customer-ready campaign is still in progress.
BRANCH: `codex/mvp-release-candidate`; source baseline `c1dde2c966705d7f61fcbf4405d177ea3fe6f6c0`; verified runtime commit `12a5a8e87d2222efbdb42f4d9897efcf18756818`.
PR: [#9](https://github.com/barsikdan-hue/Planly/pull/9).
CURRENT MILESTONE: MVP RELEASE CANDIDATE / CUSTOMER-READY PLANLY.

## Inspection and roadmap reconciliation

- Repository identity, clean baseline, remote and fetched main matched `barsikdan-hue/Planly` and `c1dde2c`. The older root checkout was not used as source authority. Work is isolated in `work/Planly-mvp-rc`.
- GitHub confirmed PR #8 merged at `c1dde2c`. ROADMAP and the stale AGENTS current-state paragraph now record the owner's 2026-10-05 Phase 6 / PR #8 deployment and production acceptance, without replacing historical verification records.
- Phases 0–6 are done for MVP; the current milestone is release readiness. Phase 7 is HOLD, analytics/automation remain future, AI remains removed, and hosting changes require a proven need and owner gate.
- Current architecture was traced through `createPost`/`updatePost`, target/publication reconciliation, scoped tick, atomic processor claim and connectors. Existing PostgreSQL authority and free scheduler are preserved.

## Focused customer-ready audit

Authenticated production browser walkthrough covered Dashboard, Create, Library, Calendar and Settings. Telegram/MAX were visibly connected. The mobile editor and Settings were inspected at 390×844; the editor had no horizontal overflow. `/api/health` returned 200 with `status: ok`.

| Priority | Finding | Evidence / disposition |
|---|---|---|
| P0 safety boundary | DRAFT/ARCHIVED with retained target schedules can create/send a Publication | Reproduced against real PostgreSQL with a fixture connector in RED CI; selected and fixed |
| P1 unfinished primary control | Composer exposes “AI-помощник скоро” and promises future AI despite the removed roadmap | Present in both production editor variants and `Composer` source; deferred at this first merge gate |

The P0 trigger is an API payload or historical inconsistent row. The normal current UI draft builder clears scheduledAt. A live production incident or a normal-UI trigger is NOT PROVEN. Auth owner filtering, media reference/deletion protection and duplicate claims were inspected; this was a focused audit, not an exhaustive security certification. Existing lint, scheduler timing, Library/bootstrap and logout debt were not expanded into fixes.

## Root cause and minimal change

`savePostInputSchema` accepts a non-ready status with a scheduled target → `posts.ts::createPost/updatePost` persists it → `publications.ts::reconcilePostPublicationsInTx` previously checked only target.active/scheduledAt → a durable SCHEDULED row is produced → `tick.ts::runDuePublications` selects it → `processor.ts::processPublication` previously called the connector without checking Post readiness.

- Reconciliation now reads the owned Post in its transaction. Non-READY cancels an open Publication and requests queue removal, or creates no Publication.
- Processor re-reads after the atomic claim and cancels non-READY before media preparation/connector handoff. Both BullMQ and the free scheduler use this processor.
- Existing terminal/in-flight/ambiguous-history checks remain earlier. Existing published-edit locking and `POST_EDIT_BLOCKED` ordering remain intact; the input schema was not changed.
- No new publication pipeline, migration, provider rewrite, infrastructure, secrets, extra networks or AI.

## Verification

- RED at `223d98b`: [CI 37293170945](https://github.com/barsikdan-hue/Planly/actions/runs/37293170945), 442 tests: 436 passed, six new invariant cases failed, zero skipped. DRAFT/ARCHIVED creation produced SCHEDULED rows, downgrades failed to cancel, and stale queued non-ready rows actually fixture-published. All pre-existing tests passed.
- GREEN at runtime `12a5a8e`: [CI 37293776342](https://github.com/barsikdan-hue/Planly/actions/runs/37293776342), **442/442**, zero failures/skips; migrations/drift, typecheck, lint and standard Next/Turbopack build passed. All 11 new checks passed, including READY duplicate protection and protected history.
- [Self-host 37293776388](https://github.com/barsikdan-hue/Planly/actions/runs/37293776388) passed Docker web/worker, private media, persistence/restart and scheduler/Redis recovery. The Telegram live job was skipped.
- Local baseline UI/contracts: 29/29. Local protected contracts/recovery/idempotency/Swipe checks: 60/60. Typecheck passed, lint had zero errors and 13 existing warnings, webpack build passed.
- Local limits: four PR #8 DB tests initially failed at setup from absent DATABASE_URL. PGlite pipeline startup failed from host memory pressure. Standard local Turbopack rejected the external dependency junction; local webpack succeeded. Native CI supplies full DB, locking and standard-build evidence; these local failures are not represented as product regressions.
- Independent source review of `c1dde2c..12a5a8e`: no findings. Downgrade-first cancels before claim; claim-first blocks editing. The new plain SELECT adds no lock-order cycle.

## Production and owner gate

PROD: existing browser navigation and health inspected; this fix is **not deployed**. Phase 6 / PR #8 Publish Now, Scheduled Publish, Telegram and MAX acceptance is owner-confirmed historical evidence, not fresh provider proof from this campaign. Render deployed SHA was not independently read because the MCP requires a user-confirmed workspace.

BLOCKER: OWNER_MERGE_GATE, followed by the authorized production delivery/verification gate. No merge, deploy, secret/environment change, destructive DB operation or provider send was performed.

NEXT_ACTION: owner approves PR #9 merge/delivery. Then verify the existing Render deployment and run only the necessary publication smoke; resume the customer-ready campaign with the proven unfinished AI control. The full customer-ready release is not declared complete by this report.
