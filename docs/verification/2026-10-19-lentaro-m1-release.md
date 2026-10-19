# Lentaro M1 — bounded staging release package

Status: source preparation; **not release authorization and not live acceptance**. Candidate is the immutable `codex/lentaro-m1` Draft PR head once its required checks/reviews pass. Resolve and record its full source SHA and self-host artifact/synthetic-merge SHA from that PR; never deploy a moving branch name. Main/#68 dependency and exact validation are recorded in PROJECT_STATE and the PR.

## Existing scope versus missing release scope

Owner approved M1 source development, commit/push and Draft PR. The already rented VPS staging `stage.lentaro.ru` is the next target. Render remains a separate existing environment with no recreation/cutover authorization. Existing owner Telegram/MAX successes retain their scope. No new provider probe is implied by this package.

Latest audited staging source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, PostgreSQL ledger 13 **rows**; no current inspection claimed here. Existing source migration files include 0012 shared library, 0013 USER connection tables, 0014 approval cancellation, 0015 B1 and new additive 0016 shared decisions. Do not infer applied migration names from row count or replay 0012. Read actual ledger/hash and compare with the exact candidate before proposing any persistent migration.

A1: recorded same-VM archive checksums do not prove recovery. Earlier clone restore stopped at OCI identity mismatch. A later helper-only repair plus one isolated clone attempt was authorized in [#66](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6234302277); a later result was not found in the inspected public chain. Locate that result/private receipt first. Do not blindly repeat the attempt or extend its grant to production data, off-VM keys/destinations, #64/#65, or schema changes.

## Concrete external actions to authorize once the immutable candidate is green

1. **Read-only preflight on existing VPS staging:** capture source/image identities, actual migration hashes/ledger, component health, scheduled/unknown outcomes and the single active sender for these data. Preserve private evidence without credentials/IP/user content in reports. Identify the rollback image and volume/backup identities privately.
2. **Recovery gate:** attach the valid A1 clone-only restore receipt or resolve its exact existing grant with the owner. Confirm the chosen DB/media recovery point and restore compatibility before persistent changes. Missing independent/off-VM recovery remains explicit; do not pretend same-VM evidence covers total server loss.
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
