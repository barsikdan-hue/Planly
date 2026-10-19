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

- A complete: #68 source reuse/review; original uncommitted reviews and all other checkouts preserved. The latest known A1 result and Owner pause are recorded under F; unavailable older private history is not claimed to have been read.
- B source ready (`1c0d7df`), independent server review PASS: durable source/revision/intent receipt and atomic private copy/Post/publications through existing storage/scheduler paths. B1 USER-only guard unchanged.
- C source ready: ready-content navigation, onboarding, Lentaro labels and owner-fenced exact-intent recovery. Remaining Mini App/finish labels and opaque account-hint prefix were completed in `b7c331e`, with independent corrected-diff review PASS. Focused 54/54, related browser 12 PASS/4 pre-existing configured SKIP, typecheck/scoped lint passed; current full candidate validation is under E.
- D: three real texts/images independently factual/editorial/visual READY for exact frozen revision. Portable package committed (`628f422`), ACCEPTED_LOCAL 3/3, integrity 112/112 plus cross-platform byte check; no runtime upload.
- E: current product candidate `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7` in Draft [PR #69](https://github.com/barsikdan-hue/Planly/pull/69), including unmerged #68. [CI39256264337 SUCCESS](https://github.com/barsikdan-hue/Planly/actions/runs/39256264337):1690 native PASS/0 FAIL/0 SKIP, 162 browser PASS/4 configured SKIP, all 6 compiled HTTP smokes and migration/typecheck/lint/build/CSS checks. [Self-host39256264393 SUCCESS](https://github.com/barsikdan-hue/Planly/actions/runs/39256264393), real Telegram job SKIPPED. Actual checkout `723a3ec5cfdc60af7d898227348d2e9a4c6f05fe` and source b7c331e have identical tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b`; Git-data and job-log readback agree. Core RC 22f7bad and all earlier archives remain preserved. This documentation correction does not create a new product candidate or claim a repeated full test run.
- F: no M1 deployment. Exact migrations0013–0016 and five USER setup flags remain missing in the dated preflight. The owner lifted the prior pause for ONE frozen V4 diagnostic run, now CONSUMED: run b29737a7, aggregate HOLD / entry FAIL_HOLD/exit1 / SSH1, recorded cleanup PASS. V4 retained Failure / LOADED_IMAGE_CONFIG_SET at EXISTING_STORE_IMAGE_CHAIN_VERIFY, candidate line232: daemon image-ls IDs differ from archive-derived native config IDs. Which identity differs and why remain ROOT_CAUSE_NOT_PROVEN. Server actions stopped after failure, no retry or post-failure server readback. [Execution evidence](docs/verification/2026-10-19-lentaro-a1-diagnostic-run.md). Verified recovery remains mandatory before updating the working server. [Release package](docs/verification/2026-10-19-lentaro-m1-release.md); detailed safe result is indexed outside checkout in artifacts/lentaro-m1/2026-10-19/M1_RC_HANDOFF.md.

## Release constraints and next action

Recorded A1 backup is same-VM. Original OCI failure, later preflight HOLD, earlier unclassified post-daemon failure and latest V4 diagnostic failure are distinct attempts; no successful restore is established. Latest cleanup is recorded PASS, with no separate post-failure server readback. Earlier selected termination readback must not be presented as verification of this new run. The one-run authorization is exhausted: STOP_AFTER_FAIL_HOLD / NO_RETRY. Do not replay the frozen package or reset latch/reservation, resume off-VM #64/#65, or update the working server before verified recovery and matching release/migration/setup grants.

Next: source candidate b7c331e is ready; labels, review and required CI/Self-host are COMPLETE. Existing package/logger V4 are preserved. On the owner's local-first direction, [local metadata inspection](docs/verification/2026-10-19-lentaro-a1-image-id-local.md) recovered all four expected native config IDs and older VFS corroboration; the failed run's actual image-ls set remains unavailable in inspected local files. A passive existing-server-file collection plan is prepared, not executed/authorized; no restore retry merely to obtain IDs. Keep exact set equality and all images unchanged until cause is proven. Any new server scope needs separate permission; never replay/reset the consumed package. Verified recovery and matching release/migration/setup grants remain mandatory before updating the working server. Owner Telegram/MAX successes retain their existing scope.

Immutable audit outside checkout: `artifacts/lentaro-audit/2026-10-19`, ZIP SHA256 `c8fd1b3e165e7da66d016d16682c3d6994e896987ba474cb09ab671bf5542477`. New detailed evidence belongs in `docs/verification`; update this entrypoint after completed stages.

The existing [execution plan](docs/superpowers/plans/2026-10-19-lentaro-m1.md) now closes completed A–E source/validation items and records the owner's remaining staged goal: gated M1 runtime/acceptance, then M2 commercial decisions/implementation, operating readiness/domain release and M3 networks. No independent M1 source task remains identified. Later implementation is conditional on the stated preceding acceptance/decisions; the overall paid-SaaS goal is not complete.
