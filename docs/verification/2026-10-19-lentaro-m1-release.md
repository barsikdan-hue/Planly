# Lentaro M1 — bounded staging release package

Status: source candidate; **not release authorization and not live acceptance**. Product candidate is `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7` in [Draft PR #69](https://github.com/barsikdan-hue/Planly/pull/69), unmerged; required source review and CI39256264337/Self-host39256264393 are complete/SUCCESS. Tested synthetic merge `723a3ec5cfdc60af7d898227348d2e9a4c6f05fe` matches source tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b`. Resolve the actual deployment artifact/image digest and revalidate release-sensitive drift under the matching future grant; never deploy a moving branch name. Main/#68 dependency and exact validation are recorded in PROJECT_STATE and the PR. This documentation follow-up does not change the product candidate.

## Existing scope versus missing release scope

Owner approved M1 source development, commit/push and Draft PR. The already rented VPS staging `stage.lentaro.ru` is the next target. Render remains a separate existing environment with no recreation/cutover authorization. Existing owner Telegram/MAX successes retain their scope. No new provider probe is implied by this package.

Latest audited staging source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, PostgreSQL ledger 13 **rows**; no current inspection claimed here. Existing source migration files include 0012 shared library, 0013 USER connection tables, 0014 approval cancellation, 0015 B1 and new additive 0016 shared decisions. Do not infer applied migration names from row count or replay 0012. Read actual ledger/hash and compare with the exact candidate before proposing any persistent migration.

A1: recorded same-VM archive checksums do not prove recovery. Following the earlier pause, the owner authorized ONE frozen next-package/V4 diagnostic run. [Actual result](2026-10-19-lentaro-a1-diagnostic-run.md): CONSUMED / aggregate HOLD / entry FAIL_HOLD/exit1 / SSH1, cleanup recorded PASS, original Failure LOADED_IMAGE_CONFIG_SET at EXISTING_STORE_IMAGE_CHAIN_VERIFY/candidate line232. Actual config-ID set differs from archive-derived native config-ID set; the identity difference and underlying cause remain ROOT_CAUSE_NOT_PROVEN. This does not prove the earlier unclassified failure had the same cause. The separately authorized later passive six-file read is also consumed: six retained files/5915 bytes, SSH0, INSUFFICIENT_DATA_STOP; retained termination records PASS/graceful/exit0/remaining0, without fresh process/socket inspection or restore PASS. All consumed attempts remain consumed and server actions are stopped. This release refresh performs no further readback. The frozen package/logger and earlier [local retention verification](2026-10-19-lentaro-a1-v4-retention-check.md) are preserved. Do not replay/reset a grant, latch or reservation or extend scope to production data, off-VM keys/destinations, #64/#65 or schema changes. Safe results and frozen pins remain in the existing outside-Git M1 handoff.

## Fresh bounded preflight — 19 October, 09:57 UTC

[Read-only receipt](2026-10-19-lentaro-m1-preflight.md): existing pinned access, no writes/login/provider calls. Staging remains exact83a/image79c1878; five components running/restarts0. All13 applied ledger hashes/timestamps match0000–0012. The following four migrations are actually missing, rather than inferred from count:

| File | SHA256 |
|---|---|
| 0013_gorgeous_iron_lad.sql | `1f29cb9c7f703d69110ca8c3380cff0bb69252d0b1739a2d70450edb186e4670` |
| 0014_approval_cancellation.sql | `649c443272b60e441090444bd5515b61910cc437d6da1ef97ac6a0d2aa9dcaad` |
| 0015_curvy_blockbuster.sql | `8d7861cdd268cc2b250ab9b884ae1cdcb1091fc5bce7f69074b8cd0d345d21c2` |
| 0016_shared_feed_decisions.sql | `73d3be4ee02212aa0a82b8e3147ba14f80b52bafe0976c64c9db801ff12929e3` |

Nonempty flags are **false** for `TELEGRAM_MINI_APP_URL`, `MAX_MINI_APP_URL`, `TELEGRAM_BOT_TOKEN`, `MAX_BOT_TOKEN`, `PLANLY_PUBLIC_ORIGIN` in both current web and worker. This proves missing staging setup, not failure of the owner's separately proven Telegram/MAX environment. No values were printed/retained. A source-only deployment cannot make new USER connections work there without private setup.

The preceding 09:57 preflight is a dated observation, not current runtime permission. Subsequent retained A1 results supersede its former unknown-outcome statements as described above. No successful restore is established. No additional A1 authorization is requested by this package; the last direct one-run scope is exhausted and further server actions require a separate direct owner instruction.

## Private connection setup proposal

Separate staging configuration approval must name the existing bots and private credential source; do not create new bots/services by default or copy secret values into reports. Proposed public origin is exactly `https://stage.lentaro.ru`. Telegram/MAX Mini App launch URLs must be the actual configured launch URLs of those existing bots, independently checked in their provider setup; inventing a URL is not readiness. Existing protected bot tokens may be set only via the approved private mechanism after their source/identity is established. Until then mark USER connection/setup acceptance UNKNOWN and display the existing SETUP_REQUIRED explanation.

Provider setup inspection, bot/Mini App changes and any membership reads/sends require exact operations/accounts/counts. They are not bundled implicitly into deploying code or editing five env keys. The owner performs their native provider consent personally. These runtime prerequisites do not block source development/RC verification, but do block claiming the full live USER journey.

## Concrete external actions to authorize once the immutable candidate is green

1. **Read-only preflight on existing VPS staging:** capture source/image identities, actual migration hashes/ledger, component health, scheduled/unknown outcomes and the single active sender for these data. Preserve private evidence without credentials/IP/user content in reports. Identify the rollback image and volume/backup identities privately.
2. **Recovery gate — latest diagnostic budget exhausted:** a valid restore PASS is still required. The exact next-package/V4 one-run authorization was consumed by FAIL_HOLD; its old reservation boundary and existing transport latch must not be replayed/reset. Any further server scope requires fresh current evidence and a separate direct grant. The retained error code does not establish recovery. Confirm the chosen DB/media recovery point and restore compatibility before persistent changes. Missing independent/off-VM recovery remains explicit; do not pretend same-VM evidence covers total server loss.
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

## Local/GitHub readiness refresh — 19 October 2026

This refresh uses local source/docs and GitHub GET metadata/logs only. No SSH, provider/Render access, secret read, build, test rerun, merge or runtime action was performed. Runtime observations above retain their original timestamps.

### Candidate, dependency order and deliverable identity

At the start of this local refresh GitHub reported main `da7ad737a3236f1c161ae46c519386e05869f47a`; [#68](https://github.com/barsikdan-hue/Planly/pull/68) OPEN/non-Draft/unmerged at `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`; [#69](https://github.com/barsikdan-hue/Planly/pull/69) OPEN/Draft/unmerged at `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7`; [#70](https://github.com/barsikdan-hue/Planly/pull/70) OPEN/Draft/unmerged at `22ff85055bf9c000e9aaa1ddbdf19dd928c7b255`, based on #69's branch/head. Local `merge-base --is-ancestor` succeeds for #68→#69 and #69→#70. Thus #69 already contains #68's commits; #70 is the documentation follow-up, not another product candidate.

Proposed integration order is #68, then #69, then #70 after its base is retargeted to main, using merge commits to preserve dependency ancestry. This method will be included in the one future release approval. Squashing/rebasing #68 or changing main/source requires checking the resulting ancestry/tree and relevant CI again; do not duplicate/cherry-pick the same product work or deploy a synthetic PR merge SHA as though it were merged main. No merge is authorized here.

| Evidence | Exact identity / limit |
|---|---|
| Source tree | Product b7c331e has tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b`; docs HEAD22ff850 does not replace the product pin |
| CI | [39256264337](https://github.com/barsikdan-hue/Planly/actions/runs/39256264337) SUCCESS; existing verification retained, no rerun |
| Self-host | [39256264393](https://github.com/barsikdan-hue/Planly/actions/runs/39256264393) SUCCESS; docker-runtime job118072217476; telegram-live SKIPPED |
| Actual CI app image | Job log writes `sha256:528dab2bcda823d7f2dc807dce75453c6be30cdc2806761c8103b473cf2b01f0` to local `planly:local` for web/migrate/worker. This is a CI-local image ID, not an available registry pull reference |
| Uploaded artifact | ID12186919094, `planly-build-723a3ec5cfdc60af7d898227348d2e9a4c6f05fe`, 10083763 bytes; GitHub digest `sha256:743e2a78fa88dc319ddbf2b59fc7ec8ecb0a78ad697e8359692f798d03239b1f`; expires `2026-10-22T13:02:26Z` |
| Artifact contents by workflow | `git archive HEAD` plus `.next` copied from `planly:local`, packaged as `planly-build.tgz` excluding `.next/cache`. Workflow uploads that package; it does not docker-save/export or push an image. The GitHub artifact digest is not an image digest or the inner tgz digest. Artifact bytes were not downloaded/rehashed by this refresh |
| Staging delivery image | **UNKNOWN**: no retained deployable image/registry pin established by these records. Decide and verify an immutable delivery/build path under the future scope before release approval can be executable; never equate the ZIP digest with the CI image ID |

Concrete image-preparation boundary for the eventual release packet: select the exact final product commit/tree, unchanged Dockerfile and frozen pnpm lock inputs, target native platform and resolved base-image digest; permit one explicitly scoped isolated build/export or registry delivery, record provenance and resulting app config/image/manifest identities, and verify the delivered digest before replacing web/worker. Existing Dockerfile builds `.next` from source with `pnpm install --frozen-lockfile`; it does not consume this uploaded tgz. A route that reuses the tgz instead needs a reviewed packaging/provenance definition and byte verification rather than an assumed image equivalence. Pin all relevant build inputs; a version-tagged base alone is not immutable provenance. No such build/export/upload is performed now, and no current deploy digest can be completed from the available metadata alone. Image preparation is a separate release dependency after the recovery gate, never hidden inside A1 permission.

The four SQL SHA256 values above were freshly recomputed from the unchanged candidate files and match. Their absence remains established by the dated 09:57 actual ledger comparison, not a current server read. A future release preflight must stop on any source/ledger drift, rather than apply this list blindly.

### Existing bot mapping and private setup remainder

These are retained bounded setup observations, not new provider checks:

| Existing bot | Confirmed identity | Proposed native launch / HTTPS hosting | Recorded gap |
|---|---|---|---|
| Telegram | `@danil_sochi_realty_bot`, ID8821211792; getMe200 at10:24UTC | `https://t.me/danil_sochi_realty_bot` / `https://stage.lentaro.ru/social-connections/miniapp/telegram` | MainMiniApp=false; exact BotFather/menu configuration and signed launch not verified |
| MAX | `@se14310498_bot`, ID426760171; CA-enabled GET/me200 at10:29UTC | `https://max.ru/se14310498_bot` / `https://stage.lentaro.ru/social-connections/miniapp/max` | Owner settings read10:45: published, hosting empty, Save disabled; no save. General moderation warning exists; URL-only save effect on moderation/current owner delivery is UNKNOWN |

TG1/MAX2 identity grants were consumed; this package implies no repeat identity request. Proposed launch links do not prove the native signed connection/return path. Both proposed HTTPS routes returned404 on old83a at10:58:56UTC; deploy the reviewed route before a separately approved provider hosting save. Keep existing owner delivery settings and tokens; no rotation or new bot is proposed.

Private credential **source is identified**, not copied: the two existing protected bot-token rows in the existing Render Planly dashboard. A bounded, owner-approved private transfer mechanism into staging is **not yet established**; neither the connector's metadata capability nor a known dashboard row proves transfer readiness. No token, password, invitation or session value is read by this refresh or placed in Git/chat/journals. Specify the exact private source-to-destination mechanism in the executable setup packet rather than asking for token text in chat.

At10:32:59UTC staging web/worker had `NODE_EXTRA_CA_CERTS` nonempty=false and readonly certificate mount=false. Existing public CA `certs/russian_trusted_root_ca_pem.crt` freshly hashes to `e4370c9b6b540f063ba1829222d2d6041cbb0bfc5d001ee6bbb97620914594dc`. Dockerfile does not copy it and compose does not set this key. A future setup overlay may mount this exact public certificate read-only into web/worker and set `NODE_EXTRA_CA_CERTS` to its container destination, with missing host file failing closed. Actual host placement/compose support remain unverified. This extends process trust and requires an approved restart; it is not TLS verification bypass and does not justify editing product Dockerfile now. Tokens, the two launch URLs and `PLANLY_PUBLIC_ORIGIN=https://stage.lentaro.ru` must be consistently supplied to the intended components by the reviewed overlay; current compose alone does not establish that wiring. Keep launch and hosting URL roles distinct.

### Three accepted materials and bounded import

Existing [editorial package](../editorial/lentaro-m1-2026-10-19/README.md) is batch `lentaro-m1-pilot-2026-10-19`, revision1, ACCEPTED_LOCAL3/3, snapshot `20a88854db86330940ed164ac58b1389abcee05d215fc6a09f620eeb10b40c56`. Fresh byte hashes match its acceptance ledger:

| Material r1 | Text SHA256 | JPEG SHA256 |
|---|---|---|
| L01 | `5124851952a9bd875523918b8408757268cc568594e21c8e84b0b7cf3559ac75` | `4c1ff13f42d7a38b77313b8e124ba87c48c5075a669ca4a0681335f5dc94b2c2` |
| L02 | `9a191117461c2fe4deb94e8afdc0cfa98e45b321abaaac52c55abfc4e8fee809` | `a0ca59ac6267db405cce56af26a6723952cfa30c9dbb5377a80d3931868f42da` |
| L03 | `9345f177eee84e1bb8b4acb8cf996fe64b6d668efb05fdabc08e381ce30f0678` | `755001a8ee9311dfed8c2ee382d30db7ac1cce20227f585948ace8376f4e6059` |

Runtime import/publication count remains0, schedule eligibility NOT_EVALUATED. Before later use, refresh any time-sensitive L03 source/placement/account-purpose facts required by the acceptance notes; local editorial acceptance is not blanket legal clearance.

Use [LOADING.md](../editorial/lentaro-m1-2026-10-19/LOADING.md) and a **working copy** of [loading-journal-template.json](../editorial/lentaro-m1-2026-10-19/loading-journal-template.json). Frozen template is NOT_RUN and pins earlier inspection source6cf369b; bind the working journal to the actually approved/deployed b7 candidate (or its verified final release identity), environment, named ADMIN and owner decision before writing. Preserve the frozen template. For each item record confirmed media/library/share IDs and revision; never infer success from a lost reply. Media POST has no durable idempotency: ambiguous upload must reconcile that one own asset by SHA before another upload. Library creation reuses the package's fixed creation key and identical payload. Sharing follows confirmed IDs. No scheduling/provider send is part of the three-item import.

### Private access and release stop conditions

Use the existing [invite flow](2026-10-14-p02b-invite-registration.md): authorized ADMIN creates one invitation for a named consenting actor and privately hands off the one-time link; recipient chooses their password in their own browser. The bearer token is shown once, stored hashed, expires after24h and is consumed atomically. Never record it or a password in this journal, Git or chat. Do not re-enroll an existing email, bypass OWNER protection, invite colleagues in bulk or treat isolated fixture tests as live acceptance. The five owner steps above remain the acceptance sequence; actual provider consent is the user's own action.

For staging isolation acceptance, the final release table must additionally name two synthetic USER fixtures and the existing ADMIN as a non-owner. Provision them through the existing invite/registration flow only under the release data grant, with private ephemeral test credentials and a manifest of exactly the created IDs. These actors receive no provider connection or send permission. Verify independent swipe choices/personal copies, reload, and cross-USER/ADMIN denials for posts, media, calendar and connections using only their own test records. The separately consenting owner USER remains the actual handoff account. State the finite fixture creation/retention or cleanup boundary in the one final approval; do not silently expand the single real invitation into invitations to colleagues or delete pre-existing records.

Release must name the single active sender for the affected staging data and preserve queued/history/unknown-outcome receipts. Existing Render data/scheduler is a separate environment; no Render change or cross-environment cutover is included. Quiesce/resume only the exact approved staging sender in a reviewed order, with no overlap or ad-hoc second scheduler. Record prior application image and DB/media recovery identity privately, verify migration compatibility, and retain volumes/secrets. On ledger drift, invalid recovery, ambiguous send, wrong recipient, isolation failure, migration failure or unknown rollback compatibility: STOP the dependent rollout, preserve evidence, no retry-to-green, guessed down migration, data deletion or blind old-sender restart. A1 restore PASS is mandatory before persistent release; same-VM restore evidence still does not cover total server loss.

### Missing decisions and future unified release consent — DRAFT / HELD

The release decision cannot be signed as an executable package yet. Required inputs are: accepted A1 restore PASS; immutable staging delivery image/build identity and compatible rollback pin; fresh ledger/component/sender/recovery preflight; final source identity under the proposed merge-commit order; concrete private credential transfer/CA overlay; exact TG/MAX configuration operations and moderation handling; named ADMIN/USER/private invite handoff and destinations; explicit content-load and bounded send counts. External bot changes and real sends remain separately enumerated actions within a future unified decision, not consequences of code deployment. No live runtime acceptance is claimed by current CI.

Future owner-facing draft, to replace all unresolved inputs with reviewed pins **after restore PASS**:

> Разрешаю единый staging-выпуск Lentaro M1 на существующем `stage.lentaro.ru` по приложенной окончательной таблице: merge #68 → #69 → #70 указанным способом; точный release source/tree и доставляемый image/build SHA; свежая проверка единственного отправителя и ledger; только перечисленные отсутствующие0013–0016 с четырьмя SHA выше; замена существующих web/worker с сохранением БД/медиа/истории/секретов. Разрешаю только описанный приватный перенос двух существующих bot tokens, согласованный CA-overlay и перечисленные настройки этих Telegram/MAX ботов без ротации. Разрешаю загрузить и расшарить ровно L01–L03 r1 с указанными SHA через журнал; одно приватное приглашение названному владельцу USER; два явно названных синтетических USER для проверки изоляции с существующим ADMIN и только перечисленные fixture-записи; пять шагов приёмки. Только после его личного provider consent — один выбранный материал в его названный Telegram и/или MAX, не более одной отправки на каждую явно выбранную сеть (максимум две), без повтора неопределённого исхода. При FAIL/HOLD/дрейфе — остановить зависимый выпуск и сохранить evidence; rollback приложения только по заранее подтверждённой совместимости, без удаления данных. Render/production, DNS, новые сервисы/расходы, off-VM перенос, массовые приглашения и другие provider операции исключены.

This is a draft for one future concrete decision, not a request to approve unknown identities or a grant. The separate A1 diagnostic/possible proven-fix/restore package must resolve its own scope; this release report authorizes no server run and does not reset consumed A1 attempts.
