# Lentaro M1 — narrow release preflight (read-only)

Fresh SSH metadata: 2026-10-19T09:57:16.066392+00:00. Source candidate local HEAD `0f687394acb0381a7ca6a40d8da2d605ceadcee7`, branch `codex/lentaro-m1`, status `CLEAN`. Existing staging remains source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`.

**RESULT: RELEASE_NOT_READY / RESTORE_UNVERIFIED.** This report performs no release action and does not consume the existing helper-only / one clone-only grant.

## Access and scope

Existing dedicated key and pinned known_hosts reused with `StrictHostKeyChecking=yes`, `BatchMode=yes`. No password/new authentication flow or account/provider request. Read selected Docker fields, current source marker and migration files; ledger queried in explicit `BEGIN READ ONLY ... COMMIT` with default_transaction_read_only, statement/lock timeouts. No user rows, bootstrap, queue dispatch, secrets values, archive bodies, backup/clone/helper execution or remote file writes. Component flags were emitted only as `Boolean(process.env[key])`; values were neither printed nor retained.

First PowerShell pipe invocation failed before receipt collection; pinned access probe succeeded; byte-exact LF input via subprocess completed with exit0. This was transport/script input correction, not a repeated restore attempt.

## Runtime

| Component | Image | Source label | State / health | Started UTC | Restarts |
|---|---|---|---|---|---|
| web | `sha256:79c1878d12e3fe9cff1dbc68558bbb8c3f15a41d724fb3977ee3a50021194aef` | `83a0350203d1d37ad0cbbb2e6d61934485b877e1` | running / healthy | 2026-10-17T12:08:44.333946202Z | 0 |
| worker | `sha256:79c1878d12e3fe9cff1dbc68558bbb8c3f15a41d724fb3977ee3a50021194aef` | `83a0350203d1d37ad0cbbb2e6d61934485b877e1` | running / no healthcheck | 2026-10-17T12:08:53.328774852Z | 0 |
| postgres | `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` | `none` | running / healthy | 2026-10-16T11:36:30.145551538Z | 0 |
| redis | `sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499` | `none` | running / healthy | 2026-10-16T11:36:30.137378051Z | 0 |
| storage | `sha256:f94fdfbcd6aabd114432e1d89db81625340d9fb422187e266d749f02ffff7c1d` | `none` | running / healthy | 2026-10-16T11:36:30.130837211Z | 0 |

No new runtime image/release, live UI/provider acceptance or restore is established by those metadata.

## Actual migration ledger and candidate comparison

`drizzle.__drizzle_migrations` contains **13 rows**, not migration0013. Ordered by `(created_at,id)`. Each applied row exactly matches both SHA256 of running-source SQL and journal timestamp for0000–0012. The same applied entries were compared with candidate HEAD.

| Candidate migration tag | Journal timestamp ms | SQL SHA256 | Exact ledger status |
|---|---:|---|---|
| `0000_lonely_khan` | 1790831382562 | `e20c1a52e6912e460e042e930834f042c7375beb1f1cd4563d0e8e7cd5977dda` | APPLIED id=1 |
| `0001_tranquil_cannonball` | 1790832079770 | `f862e7a66aeaa78121f3fbd7b3dc74addd3df076f20c0a91cc59b4991fd9f299` | APPLIED id=2 |
| `0002_smiling_shockwave` | 1790854775455 | `710a51e58e3415ab8fe8628b4a680af09cc9afa5fad01e99482d4e47c4188374` | APPLIED id=3 |
| `0003_clear_groot` | 1791038091475 | `1f45d26cd4861d890740d521411a9f31a731f26f2d28c8ffd5d47b837a0de3d4` | APPLIED id=4 |
| `0004_clumsy_sharon_carter` | 1791107433185 | `980276bace59f99bbf95e593b9f11cb5ad9265a52dfdab8d7773dbaf03e982a2` | APPLIED id=5 |
| `0005_medical_toxin` | 1791278572303 | `141fffa336082cb867ad8023f81020819e638b4204c91d8b66eb72c1ae461504` | APPLIED id=6 |
| `0006_futuristic_abomination` | 1791352195518 | `2e9637798e48ce98cd4af0d2310f6636fdec79802e01ea8d9737c0226e15dc05` | APPLIED id=7 |
| `0007_analytics` | 1791465215544 | `525d63602320d7b5be95ee4e4ed43fb2f94254573d481a55a434bb6c124b9a6c` | APPLIED id=8 |
| `0008_scheduling_plans` | 1791528131621 | `2d6fad54e74fc65e0446311b6d7d515f522d0df2e0d6fd511d93d96d6a10cb02` | APPLIED id=9 |
| `0009_swipe_feedback` | 1791879344955 | `445bad650c5777e522acf933713863bbd65e087ab11682f6dce1e363de67e4f0` | APPLIED id=10 |
| `0010_sweet_blonde_phantom` | 1791972539049 | `14f294675fadc4cf233d6a9574d85fea0bbb699eaf0fa6f85879401384e074f4` | APPLIED id=11 |
| `0011_brave_captain_marvel` | 1791988221699 | `4f9edccd4215ce672feb6e508b690e833144e165f71a7a2dd2832049c5168e6f` | APPLIED id=12 |
| `0012_awesome_guardsmen` | 1792047233550 | `8000d2744e0aec2b0843952aacdce280ecc1ce6e9cbca5104abe5fbc6100a03a` | APPLIED id=13 |
| `0013_gorgeous_iron_lad` | 1792213200691 | `1f29cb9c7f703d69110ca8c3380cff0bb69252d0b1739a2d70450edb186e4670` | ABSENT (no hash+timestamp match) |
| `0014_approval_cancellation` | 1792223636894 | `649c443272b60e441090444bd5515b61910cc437d6da1ef97ac6a0d2aa9dcaad` | ABSENT (no hash+timestamp match) |
| `0015_curvy_blockbuster` | 1792248309750 | `8d7861cdd268cc2b250ab9b884ae1cdcb1091fc5bce7f69074b8cd0d345d21c2` | ABSENT (no hash+timestamp match) |
| `0016_shared_feed_decisions` | 1792398588758 | `73d3be4ee02212aa0a82b8e3147ba14f80b52bafe0976c64c9db801ff12929e3` | ABSENT (no hash+timestamp match) |

Therefore persistent staging would require **0013_gorgeous_iron_lad,0014_approval_cancellation,0015_curvy_blockbuster,0016_shared_feed_decisions** before this candidate. This is inventory only: no migration rehearsal, approval or persistent execution is implied.

## A1 phase / later grant evidence

Current private retained bundle metadata read shallowly; archive/database/media/session bodies were not opened. Artifact manifest SHA256 remains `4daa31368d1789534d25a173905319c1c6bd42173c0e9229d2fee589450c553c`. Restore helper remains original SHA256 `40a7845f3e5f738fadb8d5b3ffa48135a8fd951d9a02e2d6b93bb05886856ee5`; restore-node SHA256 `667b6e3161b0e098ba940ea8b24e24f65ff280350877fe155684936264be1842`.

| Selected metadata | Fresh observed value |
|---|---|
| `phase.json` (`b63a416a4798e6e9a306f261392e012bcca7cc9d9a0935942fddc166db516d88`) | `{"phase": "CAPTURE_AND_IMAGE_RETENTION_COMPLETE"}`; checks `[]` |
| `restore-attempt.json` (`cb12bca4a555df56dad2cb0e59fb7e10b7336fb4e6c9417a95d8be960ebd9932`) | `{"gate": "A1_ONLY", "liveOperationsPermitted": false, "reviewedHelperSha256": "40a7845f3e5f738fadb8d5b3ffa48135a8fd951d9a02e2d6b93bb05886856ee5", "startedAt": "2026-10-17T12:10:27.497665+00:00"}`; checks `[]` |
| `restore-proof.json` (`8dc3360b4fc58ed9d2449e34db1dbae0bdf9b5642ff78531dd3efba176cea1cc`) | `{"cleanup": "PASS", "source": "83a0350203d1d37ad0cbbb2e6d61934485b877e1", "status": "FAIL"}`; checks `[{"check": "RETAINED_CONFIG_SAFE_MATERIALIZATION", "status": "PASS"}]` |

There are two existing restore-work directories: one contains the original failed restore proof/private error; one contains the earlier store-capability proof. Exactly one restore-proof was found in these directories, original SHA256 `8dc3360b4fc58ed9d2449e34db1dbae0bdf9b5642ff78531dd3efba176cea1cc`, statusFAIL / cleanupPASS, only RETAINED_CONFIG_SAFE_MATERIALIZATION completed. Phase, attempt and helper timestamps remain17.10. No later clone/repair/retry result metadata was found in this bundle or the narrowly inspected staging-root/backups operation directories.

**Later helper-only + one clone-only contract result: UNKNOWN.** Existing owner grant [Issue66 comment6234302277](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6234302277) must not be mistaken for a new permission requirement. Current retained artifacts do not prove its later execution or unused status elsewhere. Broader host/chat/private-file investigation was not performed. The original verified failure remains authoritative for this bundle; no restorePASS was found.

## Existing connection setup flags

Nonempty flags from configured environment of running web/worker only; no provider calls. These booleans establish current setup absence and do not evaluate future provisioned configuration or browser behavior.

| Key | Web nonempty | Worker nonempty |
|---|---|---|
| `TELEGRAM_MINI_APP_URL` | false | false |
| `MAX_MINI_APP_URL` | false | false |
| `TELEGRAM_BOT_TOKEN` | false | false |
| `MAX_BOT_TOKEN` | false | false |
| `PLANLY_PUBLIC_ORIGIN` | false | false |

Own-USER Telegram/MAX connection readiness cannot be claimed for current staging: those configuration values are absent/empty. Candidate source/CI alone cannot prove provider provisioning. Any env/secret/provider provisioning and release retain their applicable owner scope.

## Handoff

Root release flow must preserve the existing A1 grant and resolve its latest execution record before any attempt; no blind helper retry or maintenance. Current source/image unchanged, migration inventory exact, current component states observed. Persistent migrations/deploy, independent off-VM recovery and provider verification remain separate evidence/authorization boundaries. No public IP/key/cookie/env value/private object name is included.
