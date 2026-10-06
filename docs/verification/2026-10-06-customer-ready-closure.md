# Customer-Ready milestone closure audit — 2026-10-06

STATUS: Approved release scope technically complete; Owner milestone closure pending. This docs-only reconciliation requires its own PR verification/Owner merge gate. Final docs HEAD/checks live in the closure PR metadata to avoid a circular evidence commit.

## Contract and current authority

Owner authorized a closure audit, closure of superseded PR21 and a minimal stale-roadmap update. No new requirement, QA campaign, runtime fix, production deploy, provider send, secrets/env/infra change or CR07/CR08/GAP01/Phase 7/Analytics/AI work is included.

Fresh Git remote main and actual live Render commit both equal `a3875c6a52e4921e5d7c2aa3ce5b723388462aa8`. Existing deployment: `dep-db2ej3ks728c73c5rji0`, service `srv-dav07le0tbcc73d0gfi0`, [production](https://planly-m4zq.onrender.com). Fresh health: HTTP 200, `{"status":"ok"}`. Work starts from a clean isolated linked worktree at this exact SHA; older root/checkpoints are not current authority.

Historical PR8/Phase 6 acceptance remains unchanged. ROADMAP's previous top-level PR8 checkpoint and “finish customer-ready acceptance” instruction were stale; the update points to the actual release train and retains history.

## Approved scope disposition

| Work | Current factual disposition |
| --- | --- |
| PR9–11 release safety/publishing UI | Merged ancestors of current main; historical evidence retains its scope. AI CTA removed, explicit publish-mode flow implemented. |
| CR01–05 / PR12–17 | Merged ancestors: bounded retry supersession, login limiter, overlapping uploads, Calendar schedule intent, editor publish-mode and Library recovery. Earlier independent roots are not reopened by this audit. |
| CR11 / PR19 | Merged `4621cfdedef43b98a014a9f4c7e9ad83e9c435ba`, approved head `39c7bb9c37df45f88f138b8e6972d68840d011b6`; canonical OwnerLifetime is current authority. |
| CR09 / PR18 | Merged `49f9e7b09783ba1f420af3e6914f433abc2133be`, approved head `a48dbe9762da5f9a1f8d841be34414e09e24c570`; App-owned Composer upload batches compose with CR11 and PR14/16/17 recovery. |
| CR06 / PR20 | Merged, deployed and CR06_PRODUCTION_ACCEPTED at current exact main. No original semantic RED remains in the accepted native suite. |

Both CR11 and CR09 approved heads are proved ancestors of current main. Actual main push workflows [CI 37461940104](https://github.com/barsikdan-hue/Planly/actions/runs/37461940104) and [Self-host 37461940061](https://github.com/barsikdan-hue/Planly/actions/runs/37461940061) were freshly rechecked as SUCCESS at the exact SHA. Existing post-merge evidence records 716 PASS / 0 FAIL / 0 SKIP, migration drift/apply, typecheck, lint and build PASS; lint has 13 existing warnings. This audit does not relabel prior execution as a new runtime QA run.

Current execution paths inspected: `PlannerApp.transitionOwner/isOwnerCurrent` invalidates the old lifetime before hydration; `uploadComposerEditor` registers parent token/owner batches before awaits and guards admission/attachments/notifications; `saveLibraryEditor` consumes the sole durable owner-scoped envelope; authenticated Library POST requires a key and calls `createLibraryItemForIntent`; owner → attempt → item serialization handles replay/conflict; `deleteLibraryItem` retains DELETED history before deleting the owned row. These are source-path inspections, not fresh exhaustive browser fault tests.

## Production acceptance scope

[Merged PR20 delivery/acceptance evidence](https://github.com/barsikdan-hue/Planly/pull/20) records exact deploy/build/migration-through-0005/start/health and read-only main-screen checks. Later explicitly authorized write-acceptance used only text-only marker `CR06-ACCEPTANCE-20261006-74101e31-8664-4871-916c-1eaac31b5012`, key `fc5dc734-7cf3-4399-9ff1-fc0469d09ebc`, item `b794ec0a-20b1-477e-8ad7-594a3edc6aa2`.

Normal App Save proved matching sessionStorage durable key/payload/token/revision/raw before POST, then CREATE 201 and exact acknowledgement cleanup. Explicit authenticated API retries of that captured frozen intent returned the same ID, including after browser reload; duplicates 0. Changed payload/same key returned 409 with the original unchanged. Exact test DELETE returned 204; original replay returned 410 before/after reload, no resurrection. Library returned to baseline 0; client raw/attempt absent. Minimal required terminal history remains by contract. Unrelated posts/media/accounts snapshots were unchanged; health 200; provider sends 0. The complete seven-write trace is recorded in PR20. No new production mutation is made by this closure.

CR11/CR09 are included in this accepted production release. Their scoped native/compatibility proofs are preserved; no fresh production A→B owner-poll/upload fault injection, lost-ACK UI test or server restart is claimed here. Historical Telegram/MAX provider acceptance is not repeated or broadened.

## Temporary probe retirement

PR21 `Compatibility probe: CR11 + frozen PR18`, head `a4e734c2e10d34813665c397789c805b224bdbc4`, is superseded and closed without merge. Its continuation tests/loader/owner-lifecycle tests are byte-identical to current main; its three owner-poll preconditions/outcome assertions survive in `tests/cr11-pr18-owner-poll.test.mjs` with historical title/blank-line differences. PR18 runtime/tests/lib/app/db equal the later reviewed fresh-main composition `24df53be37a93b247939fc6fd7db7d69026f06a2`; [integration evidence](2026-10-06-cr09-fresh-main-final.md) records why that corrected composition supersedes the earlier disposable probe. No obsolete probe runtime was copied into main.

Remote temporary branches `orchestrator/cr11-pr18-compat` and `codex/cr11-pr18-fresh-compatibility` still exist for provenance; this task does not authorize deleting branches/worktrees. PR22 is the historical later closed probe. Fresh public GitHub REST inventory before retirement showed PR21 as the sole open PR and 0 open issues. Post-retirement inventory and any new docs PR are recorded in the closure PR metadata. Empty issue inventory does not erase the documented backlog.

## Remaining findings, debt and closure decision

- No open proven P0/P1 blocker or unfinished implementation/acceptance gate was found within the currently approved release scope. This is eligible for an Owner milestone-close decision after docs merge, not a defect-free certification or automatic milestone closure.
- CR07 remains a documented independent P2: same-owner poll assigns `snapshot.socialAccounts` without an account revision guard after an acknowledged toggle (`PlannerApp` poll/updateAccount). CR08 remains a documented independent P2: `media-validation.ts` WebP dimensions accept VP8X only. These findings are not repaired, not converted into accepted technical debt, and not started. See [original backlog](2026-10-05-customer-ready-campaign.md).
- GAP01 crash/PUBLISHING diagnosis remains unproven, not a newly demonstrated blocker. CR11/CR09 already-admitted callbacks, child/account/reschedule/late-delete paths, unscheduled owner observation and cross-tab/device boundaries retain their [recorded exclusions](2026-10-06-cr09-fresh-main-final.md). No new reproduction campaign is run.
- Accepted technical debt remains free GitHub scheduler trigger precision/no production timing SLA, 13 existing lint warnings and historical Sites/Vinext image size. Ambiguous provider handoff requires review, never blind resend. Owner-server DNS/TLS/backups/hosting optimization retain their future infrastructure boundary.
- No next milestone is authorized. CR07/CR08/GAP01 require a separate approved task. Phase 7 additional networks stays HOLD pending explicit Owner product decision; real Analytics remains future; AI is removed, not deferred. No infrastructure migration.

## Docs-only verification and gate

Changed scope is ROADMAP.md, one current-state paragraph in AGENTS.md, the concise closure plan and this new report. Historical verification files, runtime, tests, migrations, dependencies and workflows are untouched. Verify whitespace/local Markdown targets/unchanged runtime tree, independent documentation review, clean pushed exact docs HEAD and normal repository CI/Self-host. No provider-live trigger or production deployment is authorized. Final exact-head results/mergeability/base live in the docs PR metadata.

NEXT_ACTION: READY_FOR_OWNER_MERGE_GATE — DOCS after terminal checks; Owner may merge the docs PR and close the Customer-Ready milestone, acknowledging the listed limits. No product phase begins automatically.

Independent whole-branch documentation review: APPROVE, no actionable Critical/Important/Minor. Reviewer independently verified source/ancestry/probe continuity, local links, actual closed/unmerged PR21, PR20 acceptance metadata and prior native/Docker job success. Fresh production fault injection, prohibited backlog repairs/future scope and pending docs exact-head CI were explicitly declined; those boundaries remain unchanged. Terminal delivery results are recorded in the docs PR, not inferred from review approval.
