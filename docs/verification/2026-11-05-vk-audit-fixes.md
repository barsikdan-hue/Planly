# VK autopublishing — bounded repair evidence, 5 November 2026

## Scope and provenance

User requested six separate fixes based on the supplied static audit. That document is technical evidence; its rollout suggestions are not authorization for provider calls, deployment, secrets or production mutation.

Base source: `8ebf6a47d53287c788393891aab0c3b2b012a3c1`, matching GitHub PR79. New branch `codex/lentaro-vk-audit-fixes-20261105`; existing dirty source checkout was left intact. GitHub main freshly read as `466a30e6d5219060c89d5911f3541761e3ff7037`. The root folder is an uncommitted prototype, not the SaaS repository. Native worktree creation rejected the nested repository; a manual isolated worktree was used.

Fresh read-only NEWVPS inspection at 2026-11-05 11:49 UTC (14:49 Moscow):

| Component | Actual source | Image/state |
| --- | --- | --- |
| Staging web | `8ebf6a47d53287c788393891aab0c3b2b012a3c1` | `9202700988a87f43c99793e24b6f06db0a1561ca0e79922c46b2caec6627d00a`, healthy, restarts0 |
| Staging worker | `466a30e6d5219060c89d5911f3541761e3ff7037` | `b02921415773c864d1f9ea21ce3d0cbd1562115545a25cbd91e7b7744b9a01d2`, running, restarts0 |
| Render production | `2f13a5acc8a8010bfdc989cc99deb4655b584747` | existing live deploy `dep-db7h8jt9fdbs73e8fffg`; autoDeploy=no/trigger=off |

Render workspace was explicitly selected by the user. Only service/deploy metadata was read. Staging PostgreSQL was queried in a READ ONLY transaction for aggregate counts: four VK accounts, zero VK credentials, zero nonterminal publications. All five VK configuration keys are absent in both web and worker. No credential values, private posts or media were read.

**First currently proven blocker:** persistent VK OAuth/publishing configuration and credentials are absent, before any VK upload. Different web/worker SHAs are independently material. This does not identify the historical transient Mini App upload failure. No new provider trace, upload, photo save or wall post was executed.

## Reproductions and fixes

| Scenario | Proven source condition | Bounded correction and test |
| --- | --- | --- |
| Multi-tenant authorization | VK excluded from capture/current binding; callback owner-only; missing lifecycle proof | Reuse encrypted grant storage with user/session/generation/revision/destination/config proof and existing publication pointers. Atomic OAuth commit, refresh preservation, revoke/reconnect checks and pinned token handoff. Registered owner follows the same VK checks. `vk-publication-authorization`, `vk-oauth-binding`, `vk-authorization.integration` |
| 1051 / 27 / 15 | Explicit rejection classified generic temporary/ambiguous or reconnect | Distinct permanent diagnoses plus closed stage/method/provider code; preserve community preflight refusal. No permission bypass or blind retry. `vk-audit-connector` and authorization tests |
| Photo owner | Photo owner forced equal to negative wall owner | Accept exact destination owner or authenticated upload-server user ID; attachment built from actual receipt. Reject other/private/malformed/duplicate receipts. `vk-audit-connector` |
| HTTP405 diagnostics | Non2xx collapsed to generic upload failure | Safe stage/status/host category/attempt/network class persisted with failure and emitted by worker; whitelist sanitizer strips URLs, nested fields and getters. `publication-outcomes`, `vk-audit-connector` |
| Upload fallback | VK fallback URL ignored | At most one fallback, only after explicit primary HTTP405, only independently allowlisted VK-provided HTTPS URL. No fallback for redirect, transport ambiguity, malformed receipt, save or post. `vk-audit-connector` |
| Status races | Unconditional failure/success/catch writes; duplicate diagnoses active sender as crashed | CAS by PUBLISHING + claimed attempt, preserving competing receipt. PostgreSQL session lease separates active duplicate from abandoned PUBLISHING; bounded dedicated pool avoids starving query pool. `publication-outcomes`, `vk-audit-races.integration` |

No schema migration, external OAuth client ID, security-check removal or integration rewrite. Old encrypted grants without binding metadata fail closed and require a fresh OAuth connection.

## Verification ledger

- Baseline connector/contract: 85/85 PASS.
- Connector initial RED: 21 expected failures among 35 tests; final focused connector/contract 125/125 PASS, including unsafe fallback, receipt ownership, 1051/27/15 and sanitizer cases.
- Scheduler initial RED: 7/7 failed on the requested late-outcome/duplicate scenarios; after CAS/lease, 7/7 PASS. Two further telemetry tests were RED without emission, then PASS; current focused scheduler total 9/9 PASS.
- Auth initial RED covered missing VK capture, owner-only callback, lifecycle/epoch and proof absence. Auth + corrected existing origin fixture: 66/66 PASS before final review additions.
- Initial broad unit run found the origin fixture drift (390/391 PASS); it was fixed by supplying the actual actor/session/account contract, preserving assertions.
- Final allowlisted local gate `node scripts/verify-vk-audit.mjs --unit`: **398/398 PASS, 0 FAIL, 0 SKIP**, exit0, Node24.21.0, 44,987ms. Evidence explicitly flags dirty WIP; exact committed SHA evidence is a later CI gate.
- Concurrent local compiler invocations were cancelled without any PASS claim. One subsequent compiler snapshot caught the in-progress handoff-union/caller-arity edits; these call sites were completed afterward. Final exact candidate typecheck/build is verified separately; no local typecheck PASS is claimed.
- Disposable integration and final exact-source results are recorded below when executed. Prepared suites are not execution evidence.

## Integration boundary

Dedicated GitHub workflow gates integration on unit success for the same SHA. It verifies GitHub-hosted disposable container IDs, PostgreSQL17 system identity, Redis7 run identity and generated nonce sentinels. Test children receive an allowlisted environment with fresh synthetic credentials, plus a socket preload blocking non-loopback transport. Seven suites use a random DB and Redis13. Broad existing regression retains its `/planly_test`/CREATEDB safety guards using a separately generated DB/role in the same attested disposable instance and Redis14. No staging/production DSN is accepted. Existing native assertions are not weakened.

## External contracts and remaining gates

[Official VK photo methods](https://raw.githubusercontent.com/VKCOM/vk-api-schema/master/photos/methods.json) require user-token applicability; [photo objects](https://raw.githubusercontent.com/VKCOM/vk-api-schema/master/photos/objects.json) describe independent photo ownership and fallback URL. The [official error schema](https://raw.githubusercontent.com/VKCOM/vk-api-schema/master/errors.json) describes 27/15 but does not enumerate 1051. Its explicit handling follows the user-requested audit and fixtures, not a universal live capability claim.

Community authority preflight does not prove photos.saveWallPhoto or wall.post is allowed for the actual app/profile. Live capability, actual image presence, native OAuth and scheduled provider delivery remain UNVERIFIED. Unknown save/post outcomes remain terminal and require reconciliation before any resend.

The worker accepts a validated `PLANLY_BUILD_REVISION` for diagnostics; isolated CI supplies its exact checked-out SHA. Existing deployed images do not supply this new field. A future separately approved rollout must pin web and worker and provide the revision; missing provenance is emitted as null, never inferred. No claim of exact-revision new runtime telemetry is made before that rollout.

Production, staging rollout, persistent configuration/migration, merge and provider requests remain separate owner gates. No such mutation occurred in this repair.
