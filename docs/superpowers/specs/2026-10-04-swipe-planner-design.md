# Phase 6 — Smart Content Queue / Swipe Planner

Date: 2026-10-04. Repository: `barsikdan-hue/Planly`.
Source: `49a16c977aed425c99e5fa81bcb3705526a5653c`.
Status: APPROVED by the owner implementation request on 2026-10-04. Implemented on the Phase 6 branch; merge/deploy and production acceptance remain gated.

## Inspection snapshot before approval

- Cwd root is an unborn `master` with untracked prototype files; it is not the production source.
- `work/Planly`: clean `codex/docs-product-rules`, HEAD `d720802fd4c53370fe30334b25b2b6af2ad67397`.
- Existing linked worktree: clean `codex/content-library-task1`, HEAD `d81a822d3a0cb36c50d8174e1f1a30ad072e6895`.
- `git ls-remote origin refs/heads/main` confirms the supplied `49a16c9`; fetched without changing either checkout.
- Inspection directory is a `git archive` export of that exact SHA, not a Git checkout/feature branch. Dependency junction uses the existing checkout; both pnpm lockfiles have identical SHA256.
- Phase 5: DONE per owner handoff, consistent with current code. Current phase: Phase 6 design. Goal: process prepared Library items quickly. Next milestone: approved Swipe Planner implementation through PR/merge gate.
- No engineering blocker identified by inspection/focused verification. Pending: owner approval of the decisions below. Full local DB/Redis verification has not been run.

## Proven execution paths

| Existing file / function | Current condition and flow |
| --- | --- |
| `components/planner/content-library.tsx::ContentLibrary` | Prepared and Publications tabs; READY opens Composer, USED opens surviving linked Post, ARCHIVED cannot convert. No swipe queue. |
| `components/planner/app.tsx::createFromLibrary` | Copies Library text/ordered media into an unsaved Composer with `sourceLibraryItemId`; does not POST. |
| `lib/planner.ts::toSavePostInput`, `app.tsx::save/submitEditor` | Draft or manual Moscow schedule → durable pending creation → existing POST/PATCH API. |
| `lib/client/pending-creation.ts::submitPendingCreation` | Stores UUID and immutable original request before sending; explicit retry reuses them. Hydration sends nothing. |
| `app/api/posts/route.ts::POST`, `lib/server/posts.ts::createPost` | Owner auth, validation, idempotency, source-row lock, owned media/targets, one transaction. Creates Post/targets/media/publications and READY→USED together. Existing linked source resolves the same Post. |
| `db/schema.ts` | Library READY/USED/ARCHIVED; nullable source link with unique index. No ContentSuggestion entity, slot presets or slot allocator. |
| `lib/server/publications.ts::reconcilePostPublicationsInTx` | Active target with scheduledAt creates/reuses publication; no scheduledAt means no new publication. Post status alone is not the scheduling guard. |
| `lib/server/scheduler/reconcile.ts`, `tick.ts`, `processor.ts` | Queue mirroring after commit, DB reconciliation/recovery, due-time scan and processor claim. Reuse unchanged. |
| `components/planner/calendar.tsx::Calendar` | Existing Post day/week/month display, manual create/reschedule; no free-slot computation. |

Fresh evidence: 84/84 focused tests passed, zero failures/skips (`work/phase6-focused-tests.log`). Command: `node --test --test-concurrency=1 --experimental-strip-types tests/library-contract.test.ts tests/content-library-ui.test.mjs tests/planner.test.mjs tests/post-input.test.ts tests/planner-navigation.test.ts`.
GitHub at source SHA: [CI PASS](https://github.com/barsikdan-hue/Planly/actions/runs/37208787817), including native PostgreSQL/Redis tests, migration drift/apply, typecheck/lint/build; [Self-host PASS](https://github.com/barsikdan-hue/Planly/actions/runs/37208787700), Docker runtime/media/persistence/scheduler recovery. Telegram live job skipped. This is CI evidence, not a fresh provider test.
Production: `/api/health` returned HTTP 200 and `{"status":"ok"}`; source shows this probes DB with `select 1`. Deployed SHA and authenticated Library/provider acceptance NOT PROVEN in this inspection: Render MCP requires owner-selected workspace. No deployments or publications sent.
ROADMAP/AGENTS still describe Phase 5 as next; code and the current owner handoff override that stale status. Update current roadmap during integration, without rewriting historical evidence.

## Approach and owner decisions

Recommended: add a Library review mode and a small slot-selection helper around existing Posts. Composer-only approval is cheaper but retains repeated editor work. A separate queue entity/publication engine adds duplication and is rejected for this milestone.

1. Entry: “Разобрать заготовки” in Prepared tab. Only READY with no linked Post; oldest createdAt, then id. Preserve title/text and ordered shared media. Show progress and empty/end states.
2. Session controls: Telegram/MAX selection; destination mode “Черновик”, “Вручную”, or “Следующий слот”. No network is silently selected. Scheduling requires at least one currently enabled/CONNECTED account. Draft may have no targets.
3. Right swipe / “Одобрить”: explicit commit using the visible mode/time/platforms. Draft creates DRAFT with null target times; manual/next creates READY with scheduled target times. Only success advances and shows actual server result.
4. Left swipe / “Отклонить”: status-only conditional archive to existing ARCHIVED; no Post, deletion or media mutation. Restore through existing Library archive UI. “Пропустить” leaves READY and hides the card only until this review session ends. Reload/new session shows skipped cards again.
5. Buttons provide all actions on desktop/mobile; arrows act only with card focus, never in text/date fields. Horizontal pointer swipe ≥80px commits the corresponding action; vertical scroll/cancel does nothing. Dragging cannot approve while preview controls or a request are active. No new gesture dependency.
6. Presets: daily 10:00; weekdays 10:00; daily 10:00+18:00, all Moscow. Custom weekdays and 1–4 unique HH:mm times. Choose next 7 or 30 Moscow dates including today; elapsed slots excluded. These are session settings, not saved recurring automation. No DB migration. Every item still requires explicit approval; no bulk auto-approval.

## Slot and reliability contract

- Server preview chooses earliest strictly future candidate in the inclusive date range, capped at 31 dates. Weekdays use ISO 1–7. All selected platforms share one instant. Times stored as UTC; UI remains Europe/Moscow.
- A candidate minute is occupied if any selected social account has an active target scheduled in that minute, except when its latest publication is CANCELLED. Failed/reconnect outcomes reserve their minute; inactive targets/null schedules do not. Other accounts do not occupy the selected accounts' slots. Do not use flattened UI Post.date for this decision.
- Preview is advisory. New automatic-slot creation rechecks occupancy in the Post transaction. All Post creation/update paths share the same owner-row lock before source/Post/publication locks, so another scheduling transaction cannot interleave during the check/commit. Existing manual scheduling may deliberately overlap; this milestone does not change that behavior.
- If preview becomes occupied or is now elapsed: typed 409 `PLANNER_SLOT_CONFLICT`, zero new Post/publication, source stays READY. Retain card, fetch a new preview, and require another explicit approve. No silent move to another time. No slot in range: disable approve, offer manual/draft/change range.
- New queue approval and reject carry the displayed Library `updatedAt`. Under source lock, changed/archived/deleted source rejects before a new write; refresh/review again. Existing Phase 5 conversion semantics remain unchanged.
- Existing linked-source/idempotency replay takes precedence over time/version/occupancy revalidation and returns the original Post without reallocation or schedule edits. Same UUID with a different request is a conflict. Legacy creation hashes stay byte-compatible.
- Persist the complete approval request, source revision, chosen preview time, UUID and queue origin before POST, using existing pending creation. Network timeout/5xx blocks subsequent approval and Composer creation until explicit original-request retry resolves. Reload never auto-submits; confirmed precommit conflicts release pending state. Storage failure prevents submission.
- Scheduler/publication content validation stays authoritative. Validation failure leaves card/source unchanged; offer Composer for editing. Opening/cancelling Composer creates nothing. Library title reaches Post title through queue payload; title is not posted as body text.

## Scope / acceptance

No AI, new network, suggestion table, queue worker, scheduler redesign, paid infrastructure, persistent custom presets, bulk approval, undo of committed publishing, or unrelated debt fixes. Do not fix unbounded Library bootstrap, concurrent list/delete hydration 404, Windows self-host-init, signed-preview lint warnings or Logout here.

Acceptance: skip/reject/cancel produce zero Posts/publications; approval creates exactly one source-linked Post with ordered media; draft schedules nothing; manual/next appears in existing Calendar; replay/double click/concurrent automatic approval cannot create duplicates or claim the same occupied minute; stale source/slot errors preserve reviewability; existing Library/Composer/provider paths retain their contracts.
Focused TDD between tasks. Integration gate: full tests, typecheck, lint, build, migration drift/apply on isolated DB, actual CI and Self-host. Owner merge/deploy gate, then existing Render browser verification and the smallest explicitly authorized provider smoke when needed. Stop for regression/unproven cause or an out-of-plan product/architecture decision.
