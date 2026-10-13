# Swipe Planner 2.0 — delivery evidence and release gates

Date: 2026-10-13. This record accompanies the three stacked draft PRs. It is development evidence, not production acceptance or authorization to release.

## Approved authority

- Repository: `barsikdan-hue/Planly`; inspected main baseline `30374c8dbc6d137da2d393d42bdee5389f34564e`.
- [Frozen revision 2](../superpowers/specs/2026-10-12-swipe-planner-2-design.md), [implementation plan](../superpowers/plans/2026-10-13-swipe-planner-2.md).
- [Owner approval in PR42](https://github.com/barsikdan-hue/Planly/pull/42#issuecomment-6139059591) and [review amendments](https://github.com/barsikdan-hue/Planly/pull/42#issuecomment-6139044486). Historical DESIGN_REVIEW_REQUIRED wording in the exact copied proposal is preserved; the subsequent owner decision approved implementation.
- Reused the clean dedicated `work/Planly-harness-devex` checkout, separate `codex/swipe-planner-2-*` branches. Unrelated work and branches preserved.

## Three dependent changes

| Stage | Scope | Reviewable change |
|---|---|---|
| 1 | Dashboard READY/unlinked entry, return/empty editor, native Pointer Events/CSS motion, reduced motion, full-text/media/keyboard and owner-generation protection | [Draft PR43](https://github.com/barsikdan-hue/Planly/pull/43), source `c5e49a7b2ec455aaf5742acd920815e13c689795` |
| 2 | Explicit networks/schedule, next/manual free slot, Moscow date, fresh server cutoff/account locks, immutable recovery and conflict handling; no inline Scheduler for marked Swipe | [Draft PR44](https://github.com/barsikdan-hue/Planly/pull/44), source `10c9715aec51246696e15e5532690f80ac93e2f5`, base PR43 |
| 3 | Atomic current feedback and durable receipts, DISLIKE recovery, terminal410, private snapshot/export | `codex/swipe-planner-2-preferences`, base PR44; [local verification record](2026-10-13-swipe-planner-2-preferences.md). Exact final head, draft PR and remote checks are recorded in its PR description after creation. |

Stages 1/2 are intermediate changes. The complete milestone requires stage 3. CSS/Pointer Events retains the existing implementation without an animation dependency. SKIP creates no vote. Confirmed decisions only cause success/count/motion; unknown results retain the original owner-scoped intent and require explicit retry.

## Actual verification

| Evidence | Stage 1 | Stage 2 | Stage 3 pre-PR snapshot |
|---|---|---|---|
| Linux full tests | 1056/1056, fail0/skip0 | 1078/1078, fail0/skip0 | Remote checks not yet established at this document snapshot; use final draft PR Checks and description |
| Linux E2E | 24/24 | 38/38 | Final browser result and exact source are in stage3 verification/PR |
| Typecheck/lint/build/migration drift | CI passed | CI passed | Local typecheck/lint/build passed; lint15 pre-existing warnings; final drift/browser/full-native results follow in stage3 record |
| Independent Critic | APPROVED exact c5e49a7; busy isolation and helper acknowledgement fixes re-reviewed | APPROVED exact10c9715; midnight anchor and offline deselection independently reproduced closed | Task3 and final whole-branch reviews are gates, not assumed from earlier reviews |

Stage1 [CI38359184205](https://github.com/barsikdan-hue/Planly/actions/runs/38359184205) verified source c5e49a7 through synthetic PR checkout c0ddf13e846586026fed59e53639097a87c9d95f; [Self-host38359184388](https://github.com/barsikdan-hue/Planly/actions/runs/38359184388) docker-runtime passed. Stage2 [CI38366326979](https://github.com/barsikdan-hue/Planly/actions/runs/38366326979) verified source10c9715 through synthetic checkout50f466a3cf94b79f9160b87a578d47399a39694e; [Self-host38366327001](https://github.com/barsikdan-hue/Planly/actions/runs/38366327001) docker-runtime passed. Synthetic checkouts are test refs, not merges into main. Live-provider jobs were intentionally skipped at the PR gate.

Local Windows full suites remained honest LIMITED: stage1 a155e5a1050/1052 and stage2 exact10c1076/1078, fail2/skip0. Unchanged `self-host-init.test.mjs` uses URL.pathname and produces a doubled Windows drive/encoded path MODULE_NOT_FOUND; its POSIX0600 security assertion was preserved. Unchanged analytics GC child returned status=null against expected0 under its existing5000ms timeout; historical CPU/timeout cause is NOT PROVEN. Neither test, script, timeout nor assertion was weakened. An earlier idle analytics diagnostic passed1/1; that does not explain the full-run failure. Linux CI is separate evidence.

Stage3 behavioral RED omitted persistence:7fail/1pass across8 native cases, including actual0-vs1 feedback counts, missing terminal result and missing rollback. Restored GREEN8/8. Recovery RED demonstrated retained typed410, then GREEN5/5. Actual App hydration RED then App/owner GREEN16/16. Later focused regression198/198 and native32/32 passed, skip0: shared UUID across decision kinds, mirror exactly1/rollback0, Post-row deletion lock/typed410, and a real READ COMMITTED snapshot RED followed by repeatable-read restoration. Targeted desktop/mobile browser10/10 passed for lost DISLIKE, exact reload/retry, terminal LIKE/DISLIKE410, zero-ratio/manual JSON and delayed owner-change0downloads. These are bounded local facts; final full/E2E/CI results require their own recorded gates.

## Tool routing and isolation

| Tool | Responsibility | Evidence | Codex responsibility |
|---|---|---|---|
| Superpowers writing-plans/TDD/debugging/verification | Approved three-stage plan; observable RED, minimal correction, fresh GREEN | Plan, permanent regression tests, command results | Preserve scope, investigate root cause, distinguish actual results from proposals |
| Playwright Test | Reproducible UI behavior | Fixed1366x768 and390x844, native touch, retries0, workers1; failclosed loopback APIs | Bind synthetic outcomes to native API/transaction tests; no production bootstrap |
| Playwright MCP | Independent visual inspection | Full text/tail/scroll, buttons and desktop/mobile layout on isolated UI | Do not present resized desktop as native touch or as production proof |
| Native PostgreSQL/Redis | Transactions/races/fault injection/recovery | Existing binaries, fresh test data, loopback55483/55484, TEST-only migration | Remove provider env, serialize heavy checks, preserve rollback and uncertainty |
| GitHub | Branches/draft PRs/free existing CI and Self-host | Exact source head, jobs/steps/logs, test counts and synthetic merge ref | Inspect actual results, handle failures, never infer PASS from missing workflow runs |
| Independent read-only Critic | Spec/quality and scoped fix checks, final whole-branch review | Exact base/head reports with file/function/condition evidence | Resolve proven Important findings, re-review repairs, retain rulings |

Only the two existing CI/Self-host PR-base filters were expanded to `codex/swipe-planner-2-*` for genuine stacked-PR checks. Jobs, provider gates, permissions, push triggers, services and env stayed unchanged. No CI Doctor or paid resource was enabled. No Render/Cloudflare/production data or credentials were used.

## Recorded implementation decisions and limits

1. Reuse the clean dedicated checkout rather than relocate it. If wrong: checkout relocation; unrelated WIP stays preserved.
2. Extend only existing PR-base filters for stacked checks. If wrong: narrow filter correction; no new workflow/provider permission.
3. Use existing native test binaries with fresh loopback data because local Docker/WSL are unavailable. If wrong: replace the local test harness, not production infrastructure.
4. Preserve the Windows/POSIX credential security test and unchanged analytics assertions; use actual Linux full CI and disclose local limitations. If wrong: a separately scoped portability/reproducibility repair is needed, not an assertion waiver.
5. Permit busy owner transitions only for captured guarded Swipe queue operations; ordinary Composer retains baseline busy polling isolation. If wrong: bounded owner-lifecycle repair.
6. Move helper acknowledgement generation/original-UUID protection into stage1 because approved PR1 invariants require it. If wrong: scoped helper repair; legacy defaults remain unchanged.
7. Keep reject/skip available when calendar configuration is unavailable, as approved spec requires; block only approval or an unresolved decision. If wrong: bounded review/setup correction.
8. Retain generic marked400/404/422/5xx pending results; release only explicit proven precommit codes. A hypothetical current postcommit Zod/signing failure was NOT PROVEN. If wrong: narrow error-classification correction; no blind replay/new UUID.
9. Interpret RESULT deletion precisely: LIKE result is Post; DISLIKE result is Library item. Source-only LIKE deletion with surviving Post replays it, sourceDeleted=true/resultDeleted=false. If wrong: receipt/lifecycle test correction; no resurrection.
10. Anchor the preview query across the live midnight timer until explicit owner change/refresh/new confirmed card; retain live cutoff. Allow explicit removal of a selected offline provider, no automatic fallback. If wrong: scoped schedule/account UI repair.

Receipts and current feedback retain safe fingerprints/provenance, not complete texts/titles/signed URLs/credentials. Current votes include deleted-source history; a separate privacy reset is outside this milestone. Old pre-receipt Posts can replay while their key/result exists without fabricated historical votes; deletion guarantees require a retained receipt and are not retroactively invented. No thematic classification or AI is introduced.

## Final owner gate

No merge, deploy, production migration or real provider publication is authorized. Tests and browser checks use isolated synthetic content. Production acceptance and Telegram/MAX/VK sends: NOT RUN. Review draft PRs in dependency order; release needs a separate owner decision including the additive production migration. Actual final CI/Critic/limitations must be checked before that decision.
