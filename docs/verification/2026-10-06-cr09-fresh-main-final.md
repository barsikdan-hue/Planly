# CR09 / PR18 integration after CR11 merge

STATUS: VERIFIED_RUNTIME_CHECKPOINT. Actual integrated runtime/test checkpoint `c8265e1058744df7e0225ff114fd751789fca8d9` passed fresh native/Docker and independent review. Final evidence-only descendant additionally requires its own exact-head native/Docker SUCCESS before READY_FOR_OWNER_MERGE_GATE — PR18. Final technical status, exact PR18 head and terminal links are recorded in [PR18 metadata/checks](https://github.com/barsikdan-hue/Planly/pull/18), following the approved plan's canonical final-head evidence rule. No PR18 merge or production deployment is authorized by this report.

## Merge and fresh baseline

Owner explicitly approved PR19 merge and subsequent autonomous PR18 integration, excluding production deploy. PR19 exact approved head `39c7bb9c37df45f88f138b8e6972d68840d011b6` was marked ready and merged with expected-head protection. Actual merge/fresh main: `4621cfdedef43b98a014a9f4c7e9ad83e9c435ba`; parents `acbbf8f9222f2496a9c7e93cc4dcc30ebb1c1a82` and `39c7bb9c37df45f88f138b8e6972d68840d011b6`. The approved head is an ancestor; actual main tree `87eb40f6ed3275bba84a10c5756122af1df8b03f` equals the approved PR19 tree, with empty diff.

Fresh main verification was rerun, rather than inferred from PR19:

- Local owner/upload/editor-mode/Library sanity: **62/62 PASS / 0 FAIL / 0 SKIP**, exit 0.
- [Actual main push native CI](https://github.com/barsikdan-hue/Planly/actions/runs/37437039954), job `112181287868`: SUCCESS, **615/615 PASS / 0 FAIL / 0 SKIP / 0 cancelled / 0 todo**; migration drift/apply, typecheck, lint and production build SUCCESS.
- [Actual main push Self-host](https://github.com/barsikdan-hue/Planly/actions/runs/37437039957), Docker job `112181287566`: SUCCESS; foundation, actual worker private bytes, PostgreSQL/media persistence, Redis-loss reconciliation and worker result smoke confirmed.
- Existing Render service `srv-dav07le0tbcc73d0gfi0` was read before merge: `autoDeploy=no`, `autoDeployTrigger=off`. No deploy/provider command, secrets/infra change or destructive production DB action was performed.

## Exact PR18 inputs and conflict root

Frozen original PR18 head: `f7dd2bb29d9c2a23d3919cda3e83a57fcf099027`. Authoritative remote: `https://github.com/barsikdan-hue/Planly.git`. Separate local integration branch/worktree: `codex/cr09-fresh-main-integration`, `C:/Users/EliteSochi/Documents/ChatGPT/SMM Planer/work/Planly-cr09-fresh-main`. Existing old PR18, CR11 and probe worktrees remain preserved. Manual worktree fallback follows the previously documented native-tool binding to the stale/unborn parent checkout.

Starting at exact fresh main, `git merge --no-commit --no-ff f7dd2bb29d9c2a23d3919cda3e83a57fcf099027` produced **11 App + 3 Composer** conflicts. Both parents legitimately changed the same execution paths:

- App owner/recovery binding: frozen CR09's historical numeric generation/second owner authority overlaps merged CR11 `OwnerLifetime` and PR17 Library recovery. Current canonical owner invalidation/hydration and Library controller are retained; batches derive ID/generation from that authority.
- App Save/publish/retry and descriptor: combine current owner admission/controlled publish-mode recovery with token-bound upload control and current-editor pending guards. Keep the real global retry button disabled while the current upload is pending.
- App shared upload/notifications/delete acknowledgement: retain current owner and Library guards/media revision while preserving CR09 token-scoped notifications and deleted-media tombstones. Success and per-file error notifications both consume `canNotify`.
- Composer: preserve PR14 mounted/overlap counter fallback and PR16 controlled publish mode; optional CR09 parent control delegates upload and busy without duplicate child attachment.

Before resolution, App/Composer source at main was byte-identical to runtime checkpoint `0497094ab66fccd9b61906aefb86e7887dd27fe6`. The [saved guarded resolver](probes/cr11-fresh-main-resolve.mjs) matched every expected conflict and preserved the reviewed policies. Result App blob `c252187c1e62677acd78f173315379584b1b75c0` and Composer blob `ce9dac42dd352ee66de38941eebfd6f525abb9f5` exactly equal the prior reviewed compatibility head `24df53be37a93b247939fc6fd7db7d69026f06a2`. All runtime/test source compared to that head is identical; no prior probe PR was reopened or recreated.

This is explicit integration of existing approved behavior. The historical plan's numeric representation is not reintroduced beside merged CR11; current user authorization expressly requires preserving CR11. The [fresh integration plan](../superpowers/plans/2026-10-06-cr09-fresh-main-integration.md) records that ruling and gates. Original CR09 quick→full/recovery REDs and owner-poll REDs remain in historical reports. The previous resolver omissions and their RED→GREEN are retained in the [CR11 fresh-main report](2026-10-06-owner-lifecycle-fresh-main-final.md); the corrected resolver is used here. No new runtime correction beyond this composition or weakened oracle/assertion/timeout/skip was introduced.

## Fresh regression evidence

Focused run: **41/41 PASS / 0 FAIL / 0 SKIP**, exit 0: frozen CR09 upload acceptance 37 + original owner-poll probes 3 + current-owner notification control 1. The original four CR09 root/recovery assertions remain. Owner-poll probes run actual POST acknowledgement → deferred GET → actual scheduled A→B profile poll → late A completion and independently reject old global media, attachment/recovery mutation and notification. The positive control verifies current-owner attachment, unlock and exactly one successful notification.

Two CI-path test copies come from merged evidence artifacts without assertion/precondition changes. Their canonical Git blobs equal the artifact blobs; Windows CRLF checkout bytes may differ from the original LF SHA256. The three frozen owner-poll probe assertions remain unchanged; only the already-reviewed fixture import-path adaptation exists.

Targeted 24-file regression: **301/301 PASS / 0 FAIL / 0 SKIP**, exit 0. Includes current CR11 38, frozen CR09 37, owner-poll/current-owner control, PR14 fallback upload, PR16 editor-mode recovery, PR17 Library recovery, Post edit/pending and Swipe paths. Full native suite is required on the actual new PR18 exact head, not inferred from the previous combined probe or fresh main.

Local no-incremental typecheck: PASS; ESLint: PASS, **0 errors / 13 existing warnings**; fresh corrected local Webpack production build: PASS, exit 0. Actual final-head native CI uses Node22.13/PostgreSQL17/Redis7; local Node24 hook/HTTP/timer/storage fixtures are supporting evidence. Local native DB/Docker tools are unavailable; required full native and Self-host execution use the existing real workflows without infrastructure changes.

Actual PR18 checkpoint `c8265e1058744df7e0225ff114fd751789fca8d9` has parents fresh main `4621cfdedef43b98a014a9f4c7e9ad83e9c435ba` and frozen `f7dd2bb29d9c2a23d3919cda3e83a57fcf099027`. Actual REST base is `main@4621cfd`; behind 0 and mergeable true. GitHub synthetic merge `a739346f5cf306bcaaf953f210ec8c9d90a87325` has those fresh main/checkpoint parents and identical tree `836bb3350a62f2b72f0a9970f723a39b4478fd8b`, empty diff. The connector's initial stale normalized base SHA was refreshed by explicit main-base metadata update; actual REST and Git provenance confirm the correct base.

- [Actual PR18 checkpoint native CI](https://github.com/barsikdan-hue/Planly/actions/runs/37438459805), job `112186003156`: SUCCESS, **656/656 PASS / 0 FAIL / 0 SKIP / 0 cancelled / 0 todo**; migrations/drift/typecheck/lint/production build SUCCESS. No previous compatibility/main result was substituted.
- [Actual PR18 checkpoint Self-host](https://github.com/barsikdan-hue/Planly/actions/runs/37438459690), Docker job `112186002308`: SUCCESS; foundation, actual worker private object bytes, stack recreation, PostgreSQL/media persistence, Redis-loss reconciliation and honest unsupported-provider result passed. Provider-live and failure-only diagnostics are intentionally conditional workflow skips, distinct from native suite SKIP.

## Review and handoff

One fresh independent whole-branch review on the most capable available reviewer model: **APPROVE within approved scope**, no actionable Critical/Important/Minor finding. Actual `4621cfd..c8265e1` 12-file range, App/Composer, all new tests/loader, plans/spec and evidence were inspected. Reviewer independently read focused/targeted log endings and verified clean source/diff check, without tests reruns, file edits or another agent. No deferred minors. Scope is existing App/Composer continuation integration and regression/evidence artifacts; no API/DB/recovery schema/package/workflow/provider change, refactor or new product behavior.

Executor rulings on every declined input class are recorded explicitly below; these do not waive a proved defect or certify all App paths:

1. Unscheduled/hidden owner observer — existing observer boundary, outside approved change — stale UI until an applied snapshot remains unproven.
2. Logout/login outside a snapshot — auth lifecycle unchanged — a distinct unverified transition remains.
3. Server authorization/session ownership — client fixtures cannot prove server isolation — server cross-owner effects are not certified.
4. Physical/internal POST→GET cancellation — transport unchanged, no cancellation policy added — unused server assets/work remain possible.
5. Already-admitted Save/Publish/Swipe after departure/unmount — approved CR11 exclusion — late results/cache/messages remain unproven.
6. Save starts before upload — contract guards uploads-before-submit admission only — later attachment intent after save acknowledgement remains unproven.
7. Pending-helper races — helpers unchanged beyond existing captured owner persistence — independent recovery races are not certified.
8. Captured duplicate/create/edit/media-use/navigation beyond inspected admissions — unchanged scope — transfer through other callbacks remains unproven.
9. Child-local Settings/picker/preview state — no generalized child-reset policy — rendered state retention remains unproven.
10. Swipe selections/presets/skips/results/preview — separate child lifecycle — retained old review state remains unproven.
11. Search/query/contentTab/review/detail/post confirmation — retained CR11 scope — selection/confirmation leakage remains unproven.
12. Account connect/toggle — unchanged independent continuation — stale account effects/messages remain unproven.
13. In-flight DELETE/reschedule — tombstone proof is successful same-owner local deletion — cross-owner mutation effects remain unproven.
14. Library card/source/conflict refresh outside controlled editor — excluded independent paths — late card effects remain unproven.
15. Other same-owner profile/upload ordering — existing revisions only — additional ordering races are not certified.
16. Cross-tab/device deletion, repair and non-durable recovery — no replay/repair/cross-tab protocol — stale IDs/non-durable loss remain unproven.
17. Actual React Strict Mode/concurrent DOM/file selection/remount — hook harness cannot prove browser scheduling — browser-only faults remain unproven.
18. Exact native/Redis/migrations/build/Docker — pending during review, now independently resolved by actual checkpoint terminal workflows above; final evidence head still requires fresh terminal checks — no native PASS inferred from local tests.
19. Render/browser/provider acceptance — deploy/live verification explicitly not authorized — production acceptance remains unproven.
20. CR06/CR07/CR08/GAP01/other milestones — explicitly outside current scope — independent backlog remains, none started.

Existing exclusions remain: already-admitted save/publish/Swipe responses after owner departure, account/reschedule/late-delete/child-local continuations and owner changes without scheduled-publication polling are not certified by this bounded CR09/CR11 gate. Modeled callback tests and Self-host do not establish actual React/browser/Render/provider acceptance. CR06/CR07/CR08/GAP01 are not started.

Final evidence-only descendant changes this report only; runtime/tests/packages/workflows remain identical to verified `c8265e1`. Its final exact SHA and own terminal CI/Docker links are canonical in PR18 metadata. Require clean/pushed current head, unchanged fresh main, behind 0 and mergeable true before READY_FOR_OWNER_MERGE_GATE — PR18. No PR18 merge or production deploy without separate Owner approval.
