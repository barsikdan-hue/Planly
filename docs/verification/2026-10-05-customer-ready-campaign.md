# Customer-ready campaign — 2026-10-05

STATUS: STOP_REGRESSION. Campaign is not complete; PR12 remains DRAFT and is NOT ready for merge.
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
| CR-01 | P0 proven | processor marks FAILED/TEMPORARY -> updatePost creates replacement -> retry helper unconditionally queues original -> two IDs deliver | native RED actually delivered Edited twice; first fix under review, STOP below |
| CR-02 | P0 security candidate | loginFingerprint includes client-controlled User-Agent, rotating header resets bucket | native route RED before fixing; proxy trust not proven |
| CR-03 | P1 release blocker | Composer concurrent addFiles calls each reset one busy boolean, first completion enables save while second pending | callback RED, wait for all active uploads |
| CR-04 | P1 | Calendar passes date/time with draft status; Composer initializes mode only from status, hiding explicit schedule | reproduced production 2026-10-06 18:00 opens Now |
| CR-05 | P1 | Library editor exists only in mounted component state; navigation/reload discards unsaved fields | independent recovery/discard-protection task |
| CR-06 | P1 | Library creation POST has no durable idempotency identity; lost response then Save creates another item | independent server/client retry task |
| CR-07 | P2 | bootstrap poll overwrites newer acknowledged social-account toggle without revision guard | callback reproduction false->true; server remains false |
| CR-08 | P2 | WebP dimension parser accepts VP8X only; real sharp-generated VP8/VP8L 2x3 rejected | preserve MIME/size limits, add valid fixtures |
| GAP-01 | unproven runtime gap | web tick/reconciliation exclude PUBLISHING; crash claim may remain without visible ambiguous-delivery diagnosis | safe native crash/restart reproduction; no blind resend |

Accepted debt: free scheduler trigger precision, existing lint warnings. Additional networks/AI/analytics/automation remain excluded.

## Task work log
TASK: CR-01 superseded retry race
PRIORITY: P0 proven
ROOT_CAUSE: unconditional retry update ignores superseding publication lifecycle
RED: CI37324764288 at80f1170, 453total/447PASS/6expectedFAIL/0skip; old446 allPASS, actual Edited twice
FIX: d716dc5 serializes retry eligibility under owner/Post/history locks; provisional, NOT accepted
FILES: lib/server/scheduler/retry.ts; tests/publication-retry-race.integration.test.ts; bounded plan; this report
TARGETED: initial7 native cases GREEN atd716dc5; added8th regression pending nativeRED
FULL: d716dc5 CI37325812261 success; final diagnostic commit intentionally expects one failing regression
TYPECHECK: local d716dc5 PASS; native CI PASS
LINT: local/native PASS, 0errors/13existingwarnings
BUILD: local webpack PASS (optional valkey-glide warning), native standard Next build PASS
RUNTIME: baseline self-host PASS; d716dc5 self-host pending at stop; patch not deployed
REGRESSIONS: Important review finding: timestamp equality incorrectly suppresses a valid current TEMPORARY retry
COMMIT: 80f1170 RED; d716dc5 provisional fix; diagnostic/report commit follows
PR: https://github.com/barsikdan-hue/Planly/pull/12 (DRAFT)
BACKLOG_FOUND: CR-02–08, GAP-01
NEXT: owner decision to resume after explicit regression STOP; no further runtime changes

## Independent review and required stop
- Fresh whole-branch review found Important in retry.ts: `other.createdAt >= current.createdAt` treats older safe cancelled/failed history sharing a millisecond as superseding. Actual helper adapter probe allowed999<1000 and refused1000==1000. Native diagnostic regression added; no workaround shipped.
- Dropping chronology alone is also insufficient: old TEMP failure A may requeue with an obsolete shorter provider deadline after edited replacement B fails with a longer deadline. Only one job remains, but B's retry deadline/budget can be lost.
- User rule is explicit: new regression -> immediate STOP. Runtime modification stopped; native evidence/report only. PR remains DRAFT, merge/deploy unapproved.
- Proposed bounded next revision, NOT implemented: reconciliation atomically CANCELS a replaced FAILED/TEMPORARY publication while preserving error fields; locked retry requires FAILED/TEMPORARY, so old completion sees CANCELLED. Remove timestamp heuristic; add latest-provider-deadline, retry-first->edit ID reuse, inactive/deleted/ambiguous controls. One lifecycle root, existing pipeline/schema.
- Reviewer declined native concurrency/GREEN and production/provider verdicts; these require separate actual execution evidence. No other changes accepted from review.

## Owner checkpoint
STATUS: STOP_REGRESSION / NOT_READY_FOR_MERGE
CURRENT_MAIN: 95f53b7d18e656e0f8ceff5002b4c42af3d12251
BRANCH: codex/customer-ready-retry-race
PR: https://github.com/barsikdan-hue/Planly/pull/12 (DRAFT)
PROBLEM: a real temporary rejection/edit/retry interleaving sends the same target twice
IMPLEMENTED: provisional shared-helper guard only; known regression prevents readiness
UNCHANGED: processor, connectors, Post API, DB/schema, infrastructure, production/main
KNOWN_ISSUES: review regression; unmerged CR-01; CR-02 candidate and CR-03–08 backlog
NEXT_RECOMMENDED_TASK: resume CR-01 with explicit lifecycle supersession; finish full checks/review before next fresh-main task
