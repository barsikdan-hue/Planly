# Lentaro M1 — bounded staging release package

Status: source candidate; **not release authorization and not live acceptance**. Product candidate is `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7` in [Draft PR #69](https://github.com/barsikdan-hue/Planly/pull/69), unmerged; required source review and CI39256264337/Self-host39256264393 are complete/SUCCESS. Tested synthetic merge `723a3ec5cfdc60af7d898227348d2e9a4c6f05fe` matches source tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b`. Resolve the actual deployment artifact/image digest and revalidate release-sensitive drift under the matching future grant; never deploy a moving branch name. Main/#68 dependency and exact validation are recorded in PROJECT_STATE and the PR. This documentation follow-up does not change the product candidate.

## Existing scope versus missing release scope

Owner approved M1 source development, commit/push and Draft PR. The already rented VPS staging `stage.lentaro.ru` is the next target. Render remains a separate existing environment with no recreation/cutover authorization. Existing owner Telegram/MAX successes retain their scope. No new provider probe is implied by this package.

Latest audited staging source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, PostgreSQL ledger 13 **rows**; no current inspection claimed here. Existing source migration files include 0012 shared library, 0013 USER connection tables, 0014 approval cancellation, 0015 B1 and new additive 0016 shared decisions. Do not infer applied migration names from row count or replay 0012. Read actual ledger/hash and compare with the exact candidate before proposing any persistent migration.

A1: recorded same-VM archive checksums do not prove recovery. Earlier OCI mismatch and later preflight HOLD are distinct from the latest retained continuation FAIL_HOLD after isolated daemon creation. Latest cleanup is recorded PASS; the original perform exception was not retained, so ROOT_CAUSE_NOT_PROVEN. All consumed attempts remain consumed. The owner has PAUSED NEW A1 ATTEMPTS; the already prepared next diagnostic package and logger V4 are preserved, not authorized or executed. [Local retention verification](2026-10-19-lentaro-a1-v4-retention-check.md) does not prove recovery or repair the unknown cause. Do not replay any grant or extend it to production data, off-VM keys/destinations, #64/#65 or schema changes. Actual retained results and frozen private-package pins are indexed in the existing outside-Git M1 handoff.

## Fresh bounded preflight — 19 October, 09:57 UTC

[Read-only receipt](2026-10-19-lentaro-m1-preflight.md): existing pinned access, no writes/login/provider calls. Staging remains exact83a/image79c1878; five components running/restarts0. All13 applied ledger hashes/timestamps match0000–0012. The following four migrations are actually missing, rather than inferred from count:

| File | SHA256 |
|---|---|
| 0013_gorgeous_iron_lad.sql | `1f29cb9c7f703d69110ca8c3380cff0bb69252d0b1739a2d70450edb186e4670` |
| 0014_approval_cancellation.sql | `649c443272b60e441090444bd5515b61910cc437d6da1ef97ac6a0d2aa9dcaad` |
| 0015_curvy_blockbuster.sql | `8d7861cdd268cc2b250ab9b884ae1cdcb1091fc5bce7f69074b8cd0d345d21c2` |
| 0016_shared_feed_decisions.sql | `73d3be4ee02212aa0a82b8e3147ba14f80b52bafe0976c64c9db801ff12929e3` |

Nonempty flags are **false** for `TELEGRAM_MINI_APP_URL`, `MAX_MINI_APP_URL`, `TELEGRAM_BOT_TOKEN`, `MAX_BOT_TOKEN`, `PLANLY_PUBLIC_ORIGIN` in both current web and worker. This proves missing staging setup, not failure of the owner's separately proven Telegram/MAX environment. No values were printed/retained. A source-only deployment cannot make new USER connections work there without private setup.

The preceding 09:57 preflight is a dated observation, not current runtime permission. Subsequent retained A1 results supersede its former unknown-outcome statements as described above. No successful restore is established. No additional A1 authorization is requested by this package; leave attempts paused until a separate direct owner instruction.

## Private connection setup proposal

Separate staging configuration approval must name the existing bots and private credential source; do not create new bots/services by default or copy secret values into reports. Proposed public origin is exactly `https://stage.lentaro.ru`. Telegram/MAX Mini App launch URLs must be the actual configured launch URLs of those existing bots, independently checked in their provider setup; inventing a URL is not readiness. Existing protected bot tokens may be set only via the approved private mechanism after their source/identity is established. Until then mark USER connection/setup acceptance UNKNOWN and display the existing SETUP_REQUIRED explanation.

Provider setup inspection, bot/Mini App changes and any membership reads/sends require exact operations/accounts/counts. They are not bundled implicitly into deploying code or editing five env keys. The owner performs their native provider consent personally. These runtime prerequisites do not block source development/RC verification, but do block claiming the full live USER journey.

## Concrete external actions to authorize once the immutable candidate is green

1. **Read-only preflight on existing VPS staging:** capture source/image identities, actual migration hashes/ledger, component health, scheduled/unknown outcomes and the single active sender for these data. Preserve private evidence without credentials/IP/user content in reports. Identify the rollback image and volume/backup identities privately.
2. **Recovery gate — currently paused:** a valid restore PASS is still required. The frozen diagnostic package can only run after separate explicit one-run authorization; the present owner pause cannot be bypassed through this release package. A diagnostic failure or retained error code does not establish recovery. Confirm the chosen DB/media recovery point and restore compatibility before persistent changes. Missing independent/off-VM recovery remains explicit; do not pretend same-VM evidence covers total server loss.
3. **Staging-only release and persistent migration grant:** name the actual candidate source/image SHA and the exact missing migration filenames/hashes discovered in step 1. Grant only those migrations and existing web/worker replacement, retaining PostgreSQL/Redis/MinIO volumes and secrets. Never create a new scheduler or leave two active senders. No Render/production/DNS/secret changes.
4. **Bounded staging data grant:** load the three approved issue materials via existing ADMIN media upload → idempotent Library create → share, using the package journal. Confirm hashes/order/revision before sharing. A lost media-upload response requires checking that one asset; do not blindly upload again. No invitations to real colleagues or cleanup of existing content is included.
5. **Browser acceptance using named test actors:** sign in, verify own connection state, shared feed/private choice, calendar/reload and cancellation. Define precisely whether temporary fixture actors/content may be created/deleted. Do not use or expose unrelated users' data.
6. **Separate minimum real-provider grant if needed:** one explicitly consenting USER, its exact owned Telegram channel and MAX destination, one approved JPEG+text material, one send per selected provider (maximum two sends), one resulting remote status/link per provider. No blind retries after ambiguous outcomes; no automatic test of owner's already proven path. Native consent in the provider is performed by that USER. Account identifiers remain private. If only one provider is authorized, verify only that provider and retain the other as UNKNOWN.

Steps 3–6 are not authorized by the source-development approval. Final owner request must substitute actual immutable SHAs and the precise current missing migrations/accounts/counts; this document deliberately grants nothing.

## Rollout/rollback verification

- Before rollout preserve the original runtime identities and recovery artifacts; read CI/self-host artifact contents/identity and confirm candidate migration drift check passed.
- Additive 0016 creates only a user-scoped receipt table/index/check; no data backfill. 0013–0015 have their own connection/cancellation/consent semantics and must be reviewed as actually missing, not assumed safe merely because additive.
- After each approved migration verify ledger hashes/schema, then web/worker image match, public health/login and private-media authorization. New UI or health alone cannot prove scheduling/delivery.
- If migration fails, stop dependent rollout and preserve evidence. Do not run guessed down migrations or delete receipt/binding/history rows.
- Roll back application only to the verified compatible prior image with persistent DB/media retained. New-source scheduled publications/unknown outcomes and binding/cancellation rules may make an older sender incompatible: establish compatibility before resuming it. If unproven, keep the affected rollout stopped under the approved release handling rather than send from an old image blindly.
- Record SOURCE/CI/STAGING/PRODUCTION/PROVIDER labels separately with timestamps and source/runtime/image evidence. No current M1 production claim.

## Owner test after authorized release

Use `https://stage.lentaro.ru` only once the exact M1 release is confirmed there. Access is invite-only through the existing secure invitation flow; never put passwords/invitation tokens in Git or reports.

1. Войти и открыть «Готовый контент».
2. Проверить Telegram/MAX в настройках или подтвердить подключение своего канала.
3. Выбрать сети и время, одобрить один материал свайпом; другой скрыть или отложить.
4. Открыть личный календарь, проверить текст/медиа и отмену до отправки.
5. После отдельно согласованной отправки открыть результат или конкретную ошибку каждой сети.

Report a problem as: expected / actual / steps / displayed version. The owner performs no local commands or SQL. Until deployment, this is a prepared test sequence, not a claim of working M1 at the staging URL.
