# Lentaro — current project state

Updated 2026-10-19. Read this entrypoint and its environment boundaries before work; check relevant drift and existing code/active PRs. The completed audit is historical evidence, not a task to repeat.

## Product and authorization

Invite-only M1 for practicing real-estate agents: sign in → own Telegram/MAX → ready editorial feed → individual swipe → personal calendar → independent delivery outcomes. External `realty-editorial-v3` prepares content. Billing/public signup and VK/Instagram expansion do not block M1.

Owner approved [contract v2](docs/superpowers/specs/LENTARO_WORKING_VERSION_CONTRACT_v2_2026-10-19.md), ordinary A–F development, additive migration **source**, commit/push and Draft PR. [Design](docs/superpowers/specs/2026-10-19-lentaro-m1-design.md), [plan](docs/superpowers/plans/2026-10-19-lentaro-m1.md). Internal subtasks need no repeated approval. Merge, each environment release, persistent migration, infrastructure/secrets/DNS and provider reads/sends retain exact separate grants. No new costs.

## Source and environments

| Object | Latest established identity / scope |
|---|---|
| main at M1 start | `da7ad737a3236f1c161ae46c519386e05869f47a` |
| [PR #68](https://github.com/barsikdan-hue/Planly/pull/68) | OPEN/unmerged at start; source `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`; independent complete source review PASS, no actionable P0/P1/P2 |
| Current product candidate | `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7`, `codex/lentaro-m1`, Draft PR #69; Mini App/finish and opaque account-hint Lentaro labels COMPLETE; source ready, not released |
| Documentation follow-up | `codex/lentaro-m1-state-docs`, documentation only on product candidate b7c331e; no new product candidate or repeated full M1 checks |
| Existing VPS staging | `https://stage.lentaro.ru`, media `media-stage.lentaro.ru`; fresh preflight 2026-10-19 09:57 UTC source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, web/worker/PostgreSQL/Redis/MinIO; ledger **13 rows**, not migration number |
| Existing Render | Separate older runtime `2f13a5acc8a8010bfdc989cc99deb4655b584747`, autoDeploy disabled at audit. Preserve it; do not recreate or choose hosting from old docs |

VPS rows are confirmed by the narrow [09:57 UTC read-only release preflight](docs/verification/2026-10-19-lentaro-m1-preflight.md); Render rows retain the completed audit scope. No release occurred. Source, CI, staging, production and provider acceptance remain distinct. Owner Telegram/MAX delivery already works within its established scope. New USER binding/delivery and M1 flow are not yet live accepted.

## Current work

- A complete: #68 source reuse/review; original uncommitted reviews and all other checkouts preserved. The latest consumed unified A1 result is recorded under F; unavailable older private history is not claimed to have been read.
- B source ready (`1c0d7df`), independent server review PASS: durable source/revision/intent receipt and atomic private copy/Post/publications through existing storage/scheduler paths. B1 USER-only guard unchanged.
- C source ready: ready-content navigation, onboarding, Lentaro labels and owner-fenced exact-intent recovery. Remaining Mini App/finish labels and opaque account-hint prefix were completed in `b7c331e`, with independent corrected-diff review PASS. Focused 54/54, related browser 12 PASS/4 pre-existing configured SKIP, typecheck/scoped lint passed; current full candidate validation is under E.
- D: three real texts/images independently factual/editorial/visual READY for exact frozen revision. Portable package committed (`628f422`), ACCEPTED_LOCAL 3/3, integrity 112/112 plus cross-platform byte check; no runtime upload.
- E: current product candidate `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7` in Draft [PR #69](https://github.com/barsikdan-hue/Planly/pull/69), including unmerged #68. [CI39256264337 SUCCESS](https://github.com/barsikdan-hue/Planly/actions/runs/39256264337):1690 native PASS/0 FAIL/0 SKIP, 162 browser PASS/4 configured SKIP, all 6 compiled HTTP smokes and migration/typecheck/lint/build/CSS checks. [Self-host39256264393 SUCCESS](https://github.com/barsikdan-hue/Planly/actions/runs/39256264393), real Telegram job SKIPPED. Actual checkout `723a3ec5cfdc60af7d898227348d2e9a4c6f05fe` and source b7c331e have identical tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b`; Git-data and job-log readback agree. Core RC 22f7bad and all earlier archives remain preserved. This documentation correction does not create a new product candidate or claim a repeated full test run.
- F: no M1 deployment. The approved unified scope consumed both SSH dispatches: Phase Aac1f completed DIAGNOSED_ALLOWED/cleanup PASS, Docker29.9.1/linux/amd64, default0 versus --all4 exact config IDs, canonical missing/extra0/0 and original archive/platform/layer/source PASS; historical b297 actual IDs remain UNKNOWN. Original C3225 stopped in preparation. The owner then separately approved ONE continuation49f905dd: prerequisites/archiver delivery succeeded, old b297 reservation was archived unchanged, original restore entry returned1/FAIL_HOLD with reported cleanup PASS; aggregate HOLD/SSH1. Retained error is UNKNOWN/UNKNOWN/CANDIDATE.run/line335, a subprocess.run call. Actual command/stage/type/cause remain UNKNOWN / ROOT_CAUSE_NOT_PROVEN. [Latest actual result](docs/verification/2026-10-19-lentaro-a1-restore-continuation-result.md). All invocation grants are consumed; STOP/no retry/readback. Recovery remains UNVERIFIED and mandatory before a working-server update.

## Release constraints and next action

Recorded A1 backup is same-VM; off-VM recovery remains unverified/deferred. The owner approved the frozen unified package ed6d7874, but its inventory and conditional restore dispatch budgets are both exhausted. **STOP / NO_RETRY** even while the original clock window remains. Never reuse/reset the old grants/latch/reservation or rerun inventory to retrieve IDs. Old six-file read, original A1-next package/logger V4 and all history are preserved.

Phase A has complete current image-ID/platform/version evidence and justifies the exact one-line --all correction without weakening equality. The separately approved continuation actually closed the missing archiver delivery prerequisite, then failed farther inside the original command runner. Successful preparation is not successful recovery. No failure was repaired by guessing, changing timeouts or deleting images.

Independent local actual-result review proves a diagnostic coverage defect: supplied stage is discarded and unlisted exact exception classes become UNKNOWN; diagnosticIncomplete=false is persistence-only. It does not prove a timeout or a runtime fix. Frozen executed helper7708/transportd550 and all previous packages/V4/history are preserved. Latest safe receipt075be4db, result-review492d329c; no post-HOLD server action.

ONE prepared next decision: `artifacts/lentaro-m1/2026-10-19/A1-latest-saved-artifacts-approval.md`, SHA256 `8592b79229a6a7f7613582c8a1d89364e6ed424fdf39d80b8d041a92414f9391`. Passive reading only of seven fixed latest-run49 artifacts plus bounded same-run progress/command-error/clone logs (at most36files/16MiB), exact outcome/proof pins, safe projections; one SSH/new≤1hour grant. No server writes, daemon, Docker, restore, old b297 collection, env/config/state/customer/DB reads or fallback. New collectorbe5e6f1b/transport6161b92a have13/13 focused checks/compile PASS; independent readiness review is indexed beside the package. Current status **LOCAL PREPARED / NOT AUTHORIZED / NOT EXECUTED**; new collection grant/latch absent. Read existing evidence before even considering another restore.

The existing [release package](docs/verification/2026-10-19-lentaro-m1-release.md) was refreshed using source and GitHub metadata only: b7c331e/CI/Self-host remain complete, #68→#69→#70 ancestry established, migrations0013–0016 and the three accepted materials freshly hash-checked. CI-local image `528dab2b…` is identified but the uploaded source/build artifact is not a deployable image; staging delivery image remains UNKNOWN. Future release must pin the delivery image/build provenance, safe private bot-secret transfer/CA setup, native connection settings, named actors/destinations, single sender, content journal and rollback compatibility in ONE concrete scope after recovery. No Render recreation, merge, server/provider action or unchanged-M1 retest occurred in this preparation. Owner Telegram/MAX successes retain their existing scope.

Immutable audit outside checkout: `artifacts/lentaro-audit/2026-10-19`, ZIP SHA256 `c8fd1b3e165e7da66d016d16682c3d6994e896987ba474cb09ab671bf5542477`. New detailed evidence belongs in `docs/verification`; update this entrypoint after completed stages.

The existing [execution plan](docs/superpowers/plans/2026-10-19-lentaro-m1.md) now closes completed A–E source/validation items and records the owner's remaining staged goal: gated M1 runtime/acceptance, then M2 commercial decisions/implementation, operating readiness/domain release and M3 networks. No independent M1 source task remains identified. Later implementation is conditional on the stated preceding acceptance/decisions; the overall paid-SaaS goal is not complete.



Final passive collection review: `A1-latest-saved-artifacts-review.md` SHA256 `fa1ed73c613a23e1af89b5590f6327537d3221db709dbb979e1715e469e37577`, LOCAL_PASSIVE_READ_READINESS_PASS/0 unresolved substantive findings; this is not a grant. The latest independent release refinement also distinguishes b7 Git-archive SQL bytes from Windows CRLF checkout hashes (0013/0015), pins retained Node base/build inputs and exact CA byte delivery, and accounts for scheduler bootstrap entrypoints and the stock MAX attachment-not-ready loop. The reviewed RAM-to-SSH setup writer/controlled tick envelope and private real-USER/destination references remain unfinished release prerequisites. Source b7 and its existing CI/Self-host results are preserved; no new full M1 checks or runtime release occurred.
