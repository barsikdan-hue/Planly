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
| Active source | `codex/lentaro-m1`, isolated worktree based on #68; development in progress, not released |
| Existing VPS staging | `https://stage.lentaro.ru`, media `media-stage.lentaro.ru`; last audit receipt source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, web/worker/PostgreSQL/Redis/MinIO; ledger **13 rows**, not migration number |
| Existing Render | Separate older runtime `2f13a5acc8a8010bfdc989cc99deb4655b584747`, autoDeploy disabled at audit. Preserve it; do not recreate or choose hosting from old docs |

Runtime rows reuse dated evidence from the completed 19 October audit, not a new inspection/release. Source, CI, staging, production and provider acceptance remain distinct. Owner Telegram/MAX delivery already works within its established scope. New USER binding/delivery and M1 flow are not yet live accepted.

## Current work

- A complete: #68 source reuse/review; original uncommitted reviews and all other checkouts preserved. No later A1 execution result found in inspected comments; no claim about unavailable private results.
- B source ready (`1c0d7df`), independent review in progress: durable source/revision/intent receipt and atomic private copy/Post/publications through existing storage/scheduler paths. B1 USER-only guard unchanged.
- C source ready (`8539381`): ready-content navigation, onboarding, Lentaro labels, owner-fenced exact-intent recovery. Six local recovery checks, navigation, TypeScript/scoped lint and 20 isolated desktop/mobile browser cases passed; final integrated CI pending.
- D: three real texts/images independently factual/editorial/visual READY for exact frozen revision. Portable package committed (`628f422`), ACCEPTED_LOCAL 3/3, integrity 112/112 plus cross-platform byte check; no runtime upload.
- E: Draft [PR #69](https://github.com/barsikdan-hue/Planly/pull/69) is open against main, depends on unmerged #68. Initial server review PASS. Whole-M1 review found a cross-tab displayed-actor mismatch and two UI refresh gaps; causal regressions reproduced and corrections passed 33 server / 28 browser cases; corrected-source focused review pending. Initial Self-host passed; initial CI found one exact-byte content packaging failure, corrected without changing reviewed content. Fresh final-source CI/review remain required.
- F: no M1 deployment. Prepare exact rollout/rollback and owner testing handoff after E.

## Release constraints and next action

Recorded A1 backup is same-VM; restore stopped at OCI identity mismatch. A later helper-only repair/clone attempt was authorized, but completion was not found. Do not blindly replay maintenance or resume paused off-VM #64/#65. Before persistent release establish current baseline/ledger, matching restore result/grant, exact candidate image/source and only actually missing migrations.

Next: finish server/browser integration and review, commit source/content, push and Draft PR against main with explicit #68 dependency. Collect exact-source/synthetic-merge CI provenance, then present one concrete staging release package for missing grants. Fixtures are not staging/provider acceptance.

Immutable audit outside checkout: `artifacts/lentaro-audit/2026-10-19`, ZIP SHA256 `c8fd1b3e165e7da66d016d16682c3d6994e896987ba474cb09ab671bf5542477`. New detailed evidence belongs in `docs/verification`; update this entrypoint after completed stages.
