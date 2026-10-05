# Customer-ready campaign — 2026-10-05

STATUS: READY_FOR_OWNER_MERGE_GATE for PR12 after final report-head checks. Bounded retry supersession correction verified; customer-ready campaign is not complete. No merge/deploy.
CURRENT_MAIN: 95f53b7d18e656e0f8ceff5002b4c42af3d12251 (fresh fetch; PR9–11 merged).
Authority: work/Planly, barsikdan-hue/Planly; isolated work/Planly-customer-ready. No merge/deploy/secrets/config changes or provider sends.

## Baseline and evidence scope
- Exact-main [CI37314917455](https://github.com/barsikdan-hue/Planly/actions/runs/37314917455): 446/446, zero fail/skip; migrations/drift/typecheck/lint/build PASS. [Self-host37314917425](https://github.com/barsikdan-hue/Planly/actions/runs/37314917425) success.
- Local full suite: 278 passed, 171 failed setup/platform checks; no native PostgreSQL/Redis/Docker available, DATABASE_URL absent; known Windows self-host-init URL.pathname limitation. Exact-main Linux CI supersedes this environment limitation.
- Independent UI/recovery/API focused suite 142/142; server pure suite 51/51. Callback probes use actual TSX logic with boundary promises; they are not browser acceptance.
- Authenticated production: fresh reload confirms Now/Schedule controls, removed AI CTA, independent published Telegram/MAX receipts, immutable original/copy action, Calendar and empty Library/Swipe states, Settings real account states. Mobile 390x844 Settings/Composer inspected, no horizontal overflow; viewport reset. Health HTTP200/status ok. Initial tab had old assets until reload; Render cold wake required another reload. Deployed SHA unverified: Render MCP needs user-confirmed workspace.
- Disposable unsaved Library form probe (no Save/API mutation): entered CR-AUDIT-UNSAVED marker, navigated to Calendar and back, reopened empty form. Text disappeared without discard warning. No existing content was edited/deleted, no uploads or provider sends.
- Previous owner acceptance covers deployed Telegram/MAX. No fresh provider test is claimed.

## Audit matrix
| Zone | Code/tests checked | Fresh browser / limitations |
|---|---|---|
| Create | text/variants/targets/media order/validation/now/schedule/save/edit/copy/recovery/idempotent lost-POST retry | fresh controls; selected Calendar slot incorrectly opens Now; publication/upload not exercised on production |
| Library | CRUD/filter/archive/media/provenance/USED/conversion/source refresh | empty state and Publications list; unsaved editor and lost-response retry defects below |
| Calendar | day/week/month, Moscow conversion, immutable history, reschedule callback | actual published rows and chosen-slot failure; dragging not proved |
| Swipe | skip/reject/draft/manual/nextslot/repeated/stale/conflict/recovery guards | empty queue browser; active actions covered by current native/UI tests |
| Publication | both connectors/media validation, atomic claims, retry budget/deadlines, reconciliation, DRAFT/ARCHIVED guards | actual existing provider receipts; no fresh sends; retry/edit race under native investigation |
| Auth/settings | ownership, cookie/session/token filtering, real connection state, no frontend credentials | production Settings shows both accounts CONNECTED/enabled; UA-rotation limiter candidate requires native route test |
| Navigation | route normalization/direct create/legacy socials/search/editor guards | production Calendar/Create/Library/Swipe/Settings, mobile Settings/Composer; no fresh browser network-fault/drag/provider acceptance |

## Prioritized backlog (independent roots; one PR per task)
| ID | Priority | Root / evidence | Next |
|---|---|---|---|
| CR-01 | P0 proven | processor marks FAILED/TEMPORARY -> updatePost creates replacement -> retry helper queues original -> two IDs deliver; chronology guard incorrectly suppresses equal-time valid retry | explicit cancellation implemented in PR12; owner merge/deploy gate follows verification |
| CR-02 | P0 security candidate | loginFingerprint includes client-controlled User-Agent, rotating header resets bucket | native route RED before fixing; proxy trust not proven |
| CR-03 | P1 release blocker | Composer concurrent addFiles calls each reset one busy boolean, first completion enables save while second pending | callback RED, wait for all active uploads |
| CR-04 | P1 | Calendar passes date/time with draft status; Composer initializes mode only from status, hiding explicit schedule | reproduced production 2026-10-06 18:00 opens Now |
| CR-05 | P1 | Library editor exists only in mounted component state; navigation/reload discards unsaved fields | independent recovery/discard-protection task |
| CR-06 | P1 | Library creation POST has no durable idempotency identity; lost response then Save creates another item | independent server/client retry task |
| CR-07 | P2 | bootstrap poll overwrites newer acknowledged social-account toggle without revision guard | callback reproduction false->true; server remains false |
| CR-08 | P2 | WebP dimension parser accepts VP8X only; real sharp-generated VP8/VP8L 2x3 rejected | preserve MIME/size limits, add valid fixtures |
| GAP-01 | unproven runtime gap | web tick/reconciliation exclude PUBLISHING; crash claim may remain without visible ambiguous-delivery diagnosis | safe native crash/restart reproduction; no blind resend |

Accepted debt: free scheduler trigger precision, existing lint warnings. Additional networks/AI/analytics/automation remain excluded.

## PR12 final contract and implementation
TASK: CR-01, same bounded lifecycle P0; owner continuation starts from4adb69d. Intermediate review corrections are authorized within this root; merge/deploy remain owner gates.
ROOT_CAUSE: retry originally ignored replacement lifecycle; provisional `createdAt >=` guard guessed causal order from timestamps and rejected a legitimate same-millisecond current failure.
FINAL_INVARIANT: only the still-active FAILED/TEMPORARY publication of an active READY target can transition to QUEUED. Superseding reconciliation tombstones old safe failures as CANCELLED in the same transaction as replacement; chronology never determines retry eligibility.
IMPLEMENTED:
- `publications.ts::reconcilePostPublicationsInTx`: cancel safe FAILED/TEMPORARY except AMBIGUOUS_DELIVERY, clear nextRetryAt, preserve attempts/error/receipt history, emit queue removal before creating/reusing replacement. Draft and target deactivation use the same cancellation point.
- `publications.ts::reconcilePostPublications`: acquire owner → Post → ordered publication history locks before calling shared reconciliation. updatePost already holds them; createPost owns its new Post/history under the owner lock.
- `retry.ts::prepareTemporaryPublicationRetry`: same locked reread and conditional FAILED → QUEUED; remove chronology, retain active target/schedule, retry budget and target-scoped competing/unsafe outcome checks.
- Existing queue mirroring removes obsolete jobs where possible. Failed Redis cleanup cannot undo PostgreSQL cancellation; existing processor terminal check and atomic claim refuse stale CANCELLED delivery.
FILES_CHANGED: exactly5 — lib/server/publications.ts; lib/server/scheduler/retry.ts; tests/publication-retry-race.integration.test.ts; bounded plan; this report.
UNRELATED_DIFF: none. No UI/auth/Library/Calendar/connector/processor/schema/API/infrastructure changes. tsconfig.tsbuildinfo restored after generated checks.

## RED evidence retained
- Original [CI37324764288](https://github.com/barsikdan-hue/Planly/actions/runs/37324764288) at80f1170:453total/447PASS/6expectedFAIL/0skip; old446 pass, actual Edited delivered twice.
- Same-timestamp [CI37326480638](https://github.com/barsikdan-hue/Planly/actions/runs/37326480638) at4adb69d:454total/453PASS/1FAIL/0skip, valid retry incorrectly refused.
- Cancellation test-only8a9abaf [CI37330221618](https://github.com/barsikdan-hue/Planly/actions/runs/37330221618): four explicit FAILED-vs-CANCELLED failures. A raw BullMQ Job assertion caused the reporter to exhaust its heap; changed to a bounded boolean assertion, without changing runtime.
- Test-onlyc4c8daa [CI37330744023](https://github.com/barsikdan-hue/Planly/actions/runs/37330744023):466total/458PASS/8FAIL/0skip. Six lifecycle/Redis/equal-time/direct-reconciliation failures; two test-barrier failures because PostgreSQL waiter chains require transitive blocker discovery. Reviewer correction uses a recursive pg_blocking_pids CTE, with no timing sleeps.

## Verification and independent review
GREEN: implementation commit975e11a78a581e55e15ebc197456333a503b17fe; native CI and Docker/runtime PASS. Final report-only HEAD must also pass both required workflows before PR leaves DRAFT.
TARGETED:20/20 retry-race native cases PASS within the full suite, no skips, including real PostgreSQL contention and Redis job controls.
FULL: [CI37331215108](https://github.com/barsikdan-hue/Planly/actions/runs/37331215108):466/466 PASS,0fail/0skip; migration drift and apply PASS.
TYPECHECK: fresh local PASS, native PASS.
LINT: fresh local/native PASS,0errors/13unchangedwarnings in untouched files.
BUILD: fresh local webpack PASS; native standard production build PASS. Optional BullMQ valkey-glide local build warning unchanged.
RUNTIME: [Self-host37331215119](https://github.com/barsikdan-hue/Planly/actions/runs/37331215119) PASS — Compose build/start, migrated web/worker, HTTP/private media, PostgreSQL/media persistence across stack recreation, Redis-loss scheduler restoration and honest unsupported-provider outcome. No production deployment or fresh provider sends; live workflow intentionally skipped.
LOCAL_PROTECTED:277/277,0fail/0skip. Native PostgreSQL/Redis/Docker unavailable locally; native CI/runtime is authoritative for those checks.
RACE_CONTROLS:
- retry-first: real owner-lock barrier queues retry first and edit second; row reused, one edited delivery, duplicate successful delivery skipped.
- edit-first: real lock barrier queues edit first; old failure CANCELLED, diagnostics preserved, stale preparation and duplicate processor deliveries refused; one replacement delivery.
- same-timestamp: current safe failure remains eligible alongside cancelled history with identical createdAt.
- stale-job: native Redis removal and PostgreSQL authority when cleanup throws; stale processor cannot send.
- repeated-retry: queued PostgreSQL deadline remains exact; native Redis restoration keeps one job and its provider deadline (mirror timestamp tolerance100ms).
- other-target history cannot suppress Telegram retry; inactive history cannot revive; PUBLISHED/PUBLISHING/REQUIRES_RECONNECT/AMBIGUOUS/CANCELLED remain unchanged by retry and protected history by reconciliation.
REVIEW: independent adversarial source review found no remaining actionable runtime defect after test-barrier and coverage corrections. No reverse lock order found. Source review does not itself prove native/runtime/live behavior.
REGRESSIONS: chronology and cancellation regressions resolved; zero failures in full native suite. Two test harness failures corrected and actual blocked lock orders GREEN. No known remaining regression in this bounded change.

## Owner checkpoint
STATUS: READY_FOR_OWNER_MERGE_GATE after exact report-head verification
CURRENT_MAIN:95f53b7d18e656e0f8ceff5002b4c42af3d12251
BRANCH:codex/customer-ready-retry-race
PR:https://github.com/barsikdan-hue/Planly/pull/12 — mark ready only after final report-head CI/runtime pass
HEAD:975e11a78a581e55e15ebc197456333a503b17fe (implementation; final report commit follows)
BACKLOG_FOUND:CR-02 security candidate; CR-03–08 independent UI/Library/media issues; GAP-01 unproven crash diagnosis. None changed by PR12; campaign not complete.
NEXT: owner merge/deploy decision after exact final-head checks and ready transition. Optional next independent P0/P1 audit in a separate branch; no permission to merge/deploy here. Production/live acceptance of this patch remains NOT PROVEN until authorized delivery.
