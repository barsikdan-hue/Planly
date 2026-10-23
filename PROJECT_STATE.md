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
| Active source | `codex/lentaro-m1`, Draft PR #69; verified core RC `22f7bad`, small Mini App display-label follow-up in progress; not released |
| Existing VPS staging | `https://stage.lentaro.ru`, media `media-stage.lentaro.ru`; fresh preflight 2026-10-19 09:57 UTC source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, web/worker/PostgreSQL/Redis/MinIO; ledger **13 rows**, not migration number |
| Existing Render | Separate older runtime `2f13a5acc8a8010bfdc989cc99deb4655b584747`, autoDeploy disabled at audit. Preserve it; do not recreate or choose hosting from old docs |

VPS rows are confirmed by the narrow [09:57 UTC read-only release preflight](docs/verification/2026-10-19-lentaro-m1-preflight.md); Render rows retain the completed audit scope. No release occurred. Source, CI, staging, production and provider acceptance remain distinct. Owner Telegram/MAX delivery already works within its established scope. New USER binding/delivery and M1 flow are not yet live accepted.

## Current work

- A complete: #68 source reuse/review; original uncommitted reviews and all other checkouts preserved. No later A1 execution result found in inspected comments; no claim about unavailable private results.
- B source ready (`1c0d7df`), independent server review PASS: durable source/revision/intent receipt and atomic private copy/Post/publications through existing storage/scheduler paths. B1 USER-only guard unchanged.
- C source ready (`8539381`): ready-content navigation, onboarding, Lentaro labels, owner-fenced exact-intent recovery. Seven recovery checks, navigation, TypeScript/scoped lint and 28 desktop/mobile shared-feed browser cases passed. Corrected source review PASS; current full validation is recorded in PR #69.
- D: three real texts/images independently factual/editorial/visual READY for exact frozen revision. Portable package committed (`628f422`), ACCEPTED_LOCAL 3/3, integrity 112/112 plus cross-platform byte check; no runtime upload.
- E: Draft [PR #69](https://github.com/barsikdan-hue/Planly/pull/69) includes unmerged #68. Core RC `22f7badfa7c383f69309ad3554eab7323cb27a74` has independent corrective review PASS, CI39234466495 SUCCESS (1690 native, 162 browser PASS / 4 configured SKIP, all6 compiled HTTP smokes) and Self-host39234466380 SUCCESS; source and tested synthetic merge574d5938 have identical treee512dfb2. Current Mini App label-only follow-up has focused checks; its exact-head CI is maintained in PR #69. Earlier failures and fixes remain in the dated verification reports.
- F: no M1 deployment. Exact migrations0013–0016 and five USER setup flags remain missing in the dated preflight. Latest A1 attempt ended FAIL_HOLD with recorded cleanup PASS; the caught perform error was not retained, so ROOT_CAUSE_NOT_PROVEN. On19October the owner PAUSED NEW A1 ATTEMPTS, asked for a retained-log explanation and continuation of independent M1 work. No new A1 approval is pending. Verified recovery remains mandatory before updating the working server. [Release package](docs/verification/2026-10-19-lentaro-m1-release.md); actual A1 receipts and pause are indexed outside checkout in artifacts/lentaro-m1/2026-10-19/M1_RC_HANDOFF.md.

## Release constraints and next action

Recorded A1 backup is same-VM. The original OCI failure, later preflight HOLD and latest post-daemon FAIL_HOLD are distinct attempts; no successful restore is established. Latest selected proof/termination readback confirms graceful owned cleanup, not restore acceptance or a full post-attempt data baseline. New A1 attempts are PAUSED BY OWNER. Do not replay them, resume off-VM #64/#65, or update the working server before verified recovery and the matching release/migration/setup grants.

Next independent step: finish the existing Mini App Lentaro display labels, focused review and exact-candidate CI on PR #69. Preserve core RC22f7bad and its immutable archive. Keep A1 paused and runtime release gated; current provider successes of the owner retain their existing scope.

Immutable audit outside checkout: `artifacts/lentaro-audit/2026-10-19`, ZIP SHA256 `c8fd1b3e165e7da66d016d16682c3d6994e896987ba474cb09ab671bf5542477`. New detailed evidence belongs in `docs/verification`; update this entrypoint after completed stages.
