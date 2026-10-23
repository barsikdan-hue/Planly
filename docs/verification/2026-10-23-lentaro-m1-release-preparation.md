# Lentaro M1 release preparation — 23 October 2026

Status: **SOURCE_MERGED / VERIFIED_IMAGE_BUILT / NEWVPS_STAGING_TECHNICAL_PASS / PUBLIC_LOGIN_BROWSER_PASS**. Owner standing SaaS continuation authorization21October remains active. New operations have fresh records; historical one-use recovery grants remain consumed. No provider send or production release is claimed. Authenticated Owner/cross-USER product acceptance remains pending and is not inferred from health or the public login page.

## Source integration and CI

- PR68 merged as `be77bc721bfdda4e342248504c7d34a3ef992487`; [CI39918296322](https://github.com/barsikdan-hue/Planly/actions/runs/39918296322) and [Self-host39918296407](https://github.com/barsikdan-hue/Planly/actions/runs/39918296407) SUCCESS.
- PR69 merged after68 as `0691ff91a9497237238941d25d34675c6622453e`. Its tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b` exactly equals the retained CI artifact/source tree for M1 `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7`. [Self-host39921233023](https://github.com/barsikdan-hue/Planly/actions/runs/39921233023) and [main CI39921233034](https://github.com/barsikdan-hue/Planly/actions/runs/39921233034) SUCCESS.
- Render service autoDeploy=`no`, trigger=`off`, freshly read23October before the M1 merge. No Render mutation.

## Preservation prerequisites

Full old-image isolated restore03c74766 already PASS, with independent actual integrity review. Additional RAM-only verification of the retained original proof confirmed all11 original acceptance rows: DB/schema/all rows/ledger13/sequences, media, Redis, old-app existing session/private media, final DB invariance and owned cleanup. This work does not replay that restore.

Fresh read-only preflight `c9b7c365-d654-4289-bf88-07d6c2e5dea1`: SSH0/SEALED/VALID, full original staging83a baseline unchanged.22tables,4sessions,ledger13,source606files,23original artifacts, private auth/config/schema/sequences/media/Redis continuity. Only candidate migrations0013–0016 are missing. The first13 candidate SQL files equal Git83;12 running files are exact full LF-to-CRLF copies and one is exact Git bytes. Their actual hashes/timestamps remain equal to the saved ledger. No historical SQL replay, normalization or ledger rewrite.

## Verified runtime image

Retained CI ZIP:10083763bytes, SHA256 `743e2a78fa88dc319ddbf2b59fc7ec8ecb0a78ad697e8359692f798d03239b1f`; inner TGZ SHA256 `7c008b20cbaf0f4b560a7832c99eba169629e030ef0f5cec3fe74c20356e7b7c`. Prior verification matched all746 Git source blobs; compiled build identity and the only permitted pg symlink were checked again. No dependency installation or explicit image pull.

Existing base image `sha256:79c1878d12e3fe9cff1dbc68558bbb8c3f15a41d724fb3977ee3a50021194aef` was reused only for unchanged dependencies/runtime. Actual package/lock bytes are exact full CRLF copies of the candidate files; installed Node22.13.0/Next16.3.4/React19.2.6/Drizzle0.45.2/pg8.23.0 matched. Native backend discovery9e14835f confirmed Engine29.9.1/API1.56 and the existing default Docker driver. The build explicitly selected that driver/local Unix context and verified a unique local base alias against the exact base ID before/after.

Whole-package independent source review found two Important defects: an unbound builder with an image-ID FROM, and late preparation of response retention. Both were corrected in the covered Native pass with causal RED/GREEN;12 focused tests passed. The first actual build `d3540091-2d1a-45c3-a2f8-62233b7139ff` returned HOLD before candidate launch: source `.dockerignore` hid the compiled `.next` directory. Its response was sealed and inspected; working source/data were not changed. The executed sources and receipt remain immutable.

A new v2 helper replaces only the verified artifact's build-context ignore file; source checkout ignore rules remain unchanged. New regression RED/GREEN and actual artifact admission passed;13 focused tests PASS. Build `352b53e3-08f5-44a1-a5f4-b93086b79a92` completed **IMAGE_BUILD_PASS / SSH0 / SEALED / VALID**,12 native commands, working component IDs/images/start times/restart counts unchanged.

- Image: `sha256:6bc0f783eb8c7489eff5b99beec5c325aa37bfe363c1ab8c4f85a46488125719`.
- Root helper SHA256: `5d7a947b0ab75d4e1ac3791ed23fc55f5675c98fe29167ef2face008ec39350b`.
- Wrapper SHA256: `14cf90b780d2ab8616786f5ab1ba3b786c5dbeeb88fec250b2dff038806dd214`.
- Response664bytes SHA256: `1ff9add0aea755443604822d3403ba743af9799885035cab2c818e0cb08d0fc5`.
- Private ciphertext918bytes SHA256: `b52fc5a915559d4d733f544c634d4b03a5dac1dd847a3b8a64b86696b1440e79`.

Private raw evidence, helpers, configuration and encrypted response remain outside Git. `pull=false` and RUN `network=none` are not presented as an absolute daemon egress firewall.

## Actual disposable migration rehearsal

Run `78e49030-630c-4d0b-8b6e-1247b7af90c1` completed **MIGRATION_REHEARSAL_PASS / SSH0 / SEALED / VALID**. A separate pinned PostgreSQL container used networknone/read-only/tmpfs; a candidate Node container shared only that isolated namespace. No working volumes, public ports, provider tokens or sender were used.

The original dump was restored and verified against all22 tables/rows/schema/ledger13/sequences. The real candidate `node node_modules/drizzle-kit/bin.cjs migrate` ran once, producing exactly28 tables and17 ledger rows. All four new hashes/timestamps matched0013–0016, all first13 ledger entries were preserved, all old projected rows and sequences were preserved, and the six new tables were empty. The migration ID sequence alone advanced13→17. Historical migration replayfalse/provider calls0. Both owned containers were normally stopped/removed; final label-scoped absence PASS. Full working baseline before/after remained unchanged.146 rehearsal native commands, excluding the two fixed read-only baseline collector calls.

Independent source review found an incomplete adapter to the frozen Restore methods. One Native correction added explicit local-daemon routing, pinned-image/empty-bind allowlists and owned-container lifecycle checks. Actual frozen create/container/exec integration was tested with mocked native replies, including refusal of foreign images/networks/binds/CIDs and stopped exec. Five focused checks PASS before dispatch. This does not represent a second independent source PASS.

- Root helper SHA256 `5fe60cc5a3691500ffef2fb413566e530544135f93ca911d3e71e7121179f004`.
- Wrapper SHA256 `7f9d052349e8700901dd456bc595e6796eb416507b05600db10fbcefccb3337f`.
- Response781bytes SHA256 `d05e8c54932d1a1e0ae45a53021029470471c1f65584614397ee6e6eaeda6216`.
- Private ciphertext1030bytes SHA256 `7c289a73b72a88daca4a9f2bdb56c4dbaa9e9937e1327e29aacf9f08ce314990`.

## Actual NEWVPS staging rollout

The persistent rollout was completed from the verified image without rebuilding or pulling. Two preflight-only HOLDs proved and corrected Compose representation differences before any service stop or migration: absolute `storage.build.context`, then `OWNER_PASSWORD_HASH` dollar escaping. Failed candidates were retained under their run evidence and the old pointers/runtime remained active. Intermittent SSH banner timeouts never reached server execution.

Run `66d0e22c-93a6-4560-adf8-7600623fae0f` then stopped the exact old worker/web, ran migrations0013–0016 once, and verified28tables/ledger17, the original projected rows and sequences, six empty new tables and provider calls0. It atomically moved `current`/`SOURCE_SHA` to b7 and started exact web `707bd9a1430de712528c55da1ffb6f5cfe02ce330b181724680418c6e22be0b5`. Its WEB_REPLACE HOLD was caused by a host-local health probe against an intentionally unpublished port; Docker showed `3000/tcp:null` while the container health was healthy/restarts0.

The exact non-migrating resume `dd40aeaa-e566-4810-8bd0-2d47f82b99c9` required that retained HOLD, rechecked28tables/ledger17/publications0, verified `/api/health` from inside the exact web container, started only worker `e3a19ccc5d24ed4874b4df064b2e3cb8558adc7e2a70b5ce681c8e3975375b08`, waited for stable web/worker, confirmed the exact five running Compose components, and removed the stopped owned migrator. Result: `M1_STAGING_RELEASE_PASS`, SSH0, SEALED/VALID, errors0, provider calls0.

Playwright then opened `https://stage.lentaro.ru/login` and received title `Lentaro`, a nonblank Russian login form with Email/Пароль/Войти controls, no visible overlay, and zero console warnings/errors. The show-password control changed the empty password input from `password` to `text`. No credentials were exposed or guessed.

## Remaining acceptance

Next: Owner-authenticated staging walkthrough and the required cross-USER/ADMIN-as-non-owner isolation checks. This human/product acceptance cannot be manufactured by standing deployment authority. Public-origin/Mini App/bot configuration and real USER provider journey remain unverified. Independent off-VM disaster recovery remains a production-cutover prerequisite. Robokassa and email accounts are not connected; development continues with the approved1000RUB/calendar-month/manual-renewal/no-trial terms, without invented credentials or commercial acceptance.
