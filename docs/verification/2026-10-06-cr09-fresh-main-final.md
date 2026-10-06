# CR09 / PR18 integration after CR11 merge

STATUS: VERIFICATION_IN_PROGRESS. Final technical status, exact PR18 head and terminal native/Docker links are recorded in [PR18 metadata/checks](https://github.com/barsikdan-hue/Planly/pull/18), as required by the approved plan's canonical final-head evidence rule. No PR18 merge or production deployment is authorized by this report.

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

## Review and handoff

Independent whole-branch final review: PENDING. Scope is existing App/Composer continuation integration and regression/evidence artifacts. No API/DB/recovery schema/package/workflow/provider change, refactor or new product behavior.

Existing exclusions remain: already-admitted save/publish/Swipe responses after owner departure, account/reschedule/late-delete/child-local continuations and owner changes without scheduled-publication polling are not certified by this bounded CR09/CR11 gate. Modeled callback tests and Self-host do not establish actual React/browser/Render/provider acceptance. CR06/CR07/CR08/GAP01 are not started.

NEXT_ACTION: actual PR18 exact-head full CI/Docker and final review, then clean/pushed fresh-main base, behind 0 and mergeable true before READY_FOR_OWNER_MERGE_GATE — PR18. No PR18 merge or production deploy without separate Owner approval.
