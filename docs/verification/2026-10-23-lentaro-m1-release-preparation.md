# Lentaro M1 release preparation — 23 October 2026

Status: **SOURCE_MERGED / VERIFIED_IMAGE_BUILT / M1_NOT_DEPLOYED**. Owner standing SaaS continuation authorization21October remains active. New operations have fresh records; historical one-use recovery grants remain consumed. Existing VPS remains the staging target. No provider send or production release is claimed.

## Source integration and CI

- PR68 merged as `be77bc721bfdda4e342248504c7d34a3ef992487`; [CI39918296322](https://github.com/barsikdan-hue/Planly/actions/runs/39918296322) and [Self-host39918296407](https://github.com/barsikdan-hue/Planly/actions/runs/39918296407) SUCCESS.
- PR69 merged after68 as `0691ff91a9497237238941d25d34675c6622453e`. Its tree `b35ddfe5f7e50025cb029aff5af6bbd7b642dc8b` exactly equals the retained CI artifact/source tree for M1 `b7c331e2b5249d8f1dbc7bd11f8e86534171d1d7`. [Self-host39921233023](https://github.com/barsikdan-hue/Planly/actions/runs/39921233023) SUCCESS; [main CI39921233034](https://github.com/barsikdan-hue/Planly/actions/runs/39921233034) still running at this checkpoint.
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

## Remaining acceptance

Next: one disposable candidate migration rehearsal, then persistent staging rollout and browser/user isolation acceptance. M1 remains NOT_DEPLOYED. Public-origin/Mini App/bot configuration and real USER provider journey remain unverified. Independent off-VM disaster recovery is still unverified and remains a production-cutover prerequisite. Robokassa and email accounts are not connected; development continues with the approved1000RUB/calendar-month/manual-renewal/no-trial terms, without invented credentials or commercial acceptance.
