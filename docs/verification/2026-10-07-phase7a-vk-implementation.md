# Phase 7A VK — implementation and release evidence

Owner approved the narrow encrypted rotating-OAuth exception on 2026-10-07. [Approved spec](../superpowers/specs/2026-10-07-vk-oauth-design.md) and [implementation plan](../superpowers/plans/2026-10-07-phase7a-vk.md). The historical research architecture stop is superseded; real app permissions and live acceptance are not superseded by fixture proof.

## Authority and release boundary

- Repository: `barsikdan-hue/Planly`; draft [PR24](https://github.com/barsikdan-hue/Planly/pull/24), branch `codex/phase7a-vk`.
- Fresh main/base: `e7e40cb1549cc7d5fb7c16ba34ee82d6d42a004b`; accepted production remains `a3875c6a52e4921e5d7c2aa3ce5b723388462aa8`.
- Verified runtime head: `3db3c96aedb90fb30beeb24671a484b63205a3aa`; GitHub PR synthetic merge `53f7194a19722d794c40b3d489d0f919fd1d3e44` combines that exact head with the exact base. No actual merge occurred.
- After the verified runtime checkpoint, a narrow final delta classifies official known auth codes 27/28 as AUTH (two RED fixtures → targeted 120/120 GREEN). The accompanying evidence/process files are Markdown only. The final exact pushed head, complete suite count, CI and mergeability snapshot are recorded in the PR body after verification; no recursive self-hash update is needed.
- No production deploy, real provider send, secret/env change, infrastructure migration, Instagram, Analytics, CR07/CR08/GAP01 or video implementation.

## Implemented execution path

`Settings → owner-authenticated /vk/start → encrypted owner/account/community PKCE intent → VK ID → /vk/callback → one-use intent consumption → confidential exchange → community authority validation → encrypted credentials + CONNECTED account commit`.

`Publish Now / scheduled create → independent PostTarget/publication claim → enabled/CONNECTED VK guard → owner-filtered ordered private media bytes → account-scoped credential read/refresh → VK text/photo connector → confirmed remote ID/URL or sanitized independent terminal diagnostic`.

- AES-256-GCM uses a random 12-byte IV and authenticated account/provider/purpose/key-version binding. PostgreSQL stores ciphertext/IV/tag/version/expiry and account metadata; static app credentials and the 32-byte key remain server env. DTOs expose only existing public account fields. Telegram/MAX remain env-only.
- A dedicated PostgreSQL session holds account advisory serialization across committed UNCERTAIN state, external rotating refresh and atomic replacement-pair commit. Lost response, crash boundary or actual database rejection leaves UNCERTAIN; old refresh is not retried and publishing requires reconnect.
- OAuth validates owner, expiry, state, encrypted verifier/community binding, explicit initial wall/photos grant and editor/admin community authority. Disconnect deletes only that owned VK account's envelopes/intents, even with unavailable OAuth config.
- VK is an independent third provider in existing editor/recovery/Library/slots/targets; CR11 OwnerLifetime remains the sole UI owner authority. Delayed VK acknowledgements cannot navigate or modify another owner/unmounted App. Callback feedback is generic, consumed once and reflects no raw provider errors.
- Text, ordered JPEG/PNG photos and text+photos use API 5.199 and the researched wall-photo multipart contract. Application limits are conservative, not claims of provider maxima. Remote wall IDs/URLs require valid receipts. Video is excluded.
- Wall-photo multipart field `photo` is confirmed by official Java SDK [Upload.java](https://github.com/VKCOM/vk-java-sdk/blob/3be91e5f2ab52133897e67f4b53379ee180d865a/sdk/src/main/java/com/vk/api/sdk/actions/Upload.java) and [HttpTransportClient.java](https://github.com/VKCOM/vk-java-sdk/blob/3be91e5f2ab52133897e67f4b53379ee180d865a/sdk/src/main/java/com/vk/api/sdk/httpclient/HttpTransportClient.java), pinned commit `3be91e5f2ab52133897e67f4b53379ee180d865a` (2024-06-26). It supports fixture construction, not real app authorization.
- Tokens appear only in server API form bodies, never URLs. Private upload endpoints require allowed HTTPS VK hosts and no redirects. Malformed/foreign receipts fail closed. Unknown wall or photo-save mutation outcomes are terminal; explicit known rate rejections use the existing bounded retry. Publication claims/dedup and independent other-provider outcomes remain intact.

## RED and root-cause evidence

- Tests-only `e639aef402146c1efc9fb451602b747db92cd24c`: native [37577518765](https://github.com/barsikdan-hue/Planly/actions/runs/37577518765), 736 total / 716 baseline PASS / 20 missing-feature RED / 0 SKIP.
- Lint-clean tests-only `486ba95e1b4c37bbd6ccd297fb8fae2cd3207396`: native [37579064253](https://github.com/barsikdan-hue/Planly/actions/runs/37579064253), 749 total / 716 baseline PASS / 33 missing-feature RED / 0 SKIP. An intermediate tests-only checkpoint failed Next's reserved `module` variable lint before tests; the fixture variable was corrected without changing expectations.
- Independent review reproduced uncertain `photos.saveWallPhoto` mapping to TEMPORARY. Five RED fixtures proved the mutation gap; minimal mutation classification now returns terminal `VK_PHOTO_SAVE_AMBIGUOUS`. No duplicate wall-post outcome was inferred.
- Review reproduced whitespace/control replacement credentials accepted as READY. Strict token validation was added through unit RED→GREEN. Disconnect origin validation's OAuth-config dependency was independently reproduced and removed through RED→GREEN.
- Initial implementation native [37579848407](https://github.com/barsikdan-hue/Planly/actions/runs/37579848407): 823 total / 820 PASS / 3 obsolete pre-Phase7A scope assertions / 0 SKIP. All new native credential/product/connector cases passed. The failures treated supported VK as invalid recovery/network/UI data; unsupported recovery fixtures now use Instagram, exact three-provider assertions exclude Instagram, and VK calendar coverage is positive. No assertion was skipped or weakened to accept an incorrect product outcome.
- Missing callback feedback had 10 App PASS / 2 semantic RED, then 12/12 GREEN after the narrow effect. Calendar legend had an explicit RED before its minimal addition.
- Official [pinned error schema](https://github.com/VKCOM/vk-api-schema/blob/333481bd082ad747d4873ef4a77f9247097eeef0/errors.json) defines global group/app authorization failures 27/28. Two additional fixtures reproduced PERMANENT instead of AUTH; the final delta adds only those codes to AUTH mapping. Local VK + Telegram/MAX transport fixtures: 120 PASS / 0 FAIL / 0 SKIP. Actual occurrence with this VK ID app is not claimed. The final full suite therefore contains two additional tests beyond the 835-test checkpoint below; its fresh results are recorded in PR24.

## Fresh verification of runtime head

| Gate | Evidence |
|---|---|
| Full native suite | [CI 37580663376](https://github.com/barsikdan-hue/Planly/actions/runs/37580663376), job 112659316010: **835 PASS / 0 FAIL / 0 SKIP**, Node 22.13.0, PostgreSQL 17, Redis 7 |
| Migration drift / apply | PASS; additive 0006 introduces VK enum and encrypted credential/OAuth intent tables; existing migrations untouched |
| Native refresh graph | waiter 326 → holder 325, `Lock/advisory`, blockers `[325]`, durable state UNCERTAIN while external refresh is held; concurrent callers receive one committed replacement |
| Lost refresh / pair-persist rejection | PASS; actual PostgreSQL trigger rejects replacement, UNCERTAIN persists, subsequent lookup makes zero old-refresh transport retries |
| Task/product regressions | Native crypto/OAuth/account lifecycle, immediate + scheduled three-provider outcomes, duplicate skip, disconnected guard and ordered owned private bytes PASS |
| Protected behavior | Library source/conversion/delete, CR06 durable creation, PR17 editor recovery, CR11 owner lifetime and CR09 upload/recovery remain in full native PASS |
| Typecheck / lint / production build | PASS in the same native CI |
| Docker / Self-host | [37580663256](https://github.com/barsikdan-hue/Planly/actions/runs/37580663256), job 112659315832 SUCCESS: migrated startup, HTTP/private media, persistence/restart and scheduler recovery. Optional telegram-live job deliberately skipped; native tests have zero skips |
| Independent review | Task1/Task2 and final integration/delta reviewed; addressed findings above; no remaining actionable execution/security finding |
| Frontend leakage / diff scope | No credential fields or server credential imports in client/contracts/components; runtime diff is only approved VK integration |

Supporting Windows Node 24 evidence: protected VK/TG/MAX/owner/upload/Library set 232/232 before final feedback delta; final ordinary isolated sequential owner/VK/recovery set 67/67, zero skips. A parallel local attempt hit Windows Node OOM; a multi-file `isolation=none` attempt mixed shared fixture hooks and was not comparable. Neither was treated as product evidence or used to change tests/runtime; the proper isolated runner and authoritative native suite passed. Local full lint was stopped after it stalled; native lint and local scoped lint passed.

## Remaining human gates

Implementation/CI proof is separate from live VK readiness. [Private setup instructions](2026-10-07-vk-owner-setup.md) define READY_FOR_OWNER_SECRET_GATE — VK: app approval for wall/photos, confidential service credential/IP allowlist, exact callback URI, authorized intended community and private server env names. No values are requested in chat. Permissions, real upload-host eligibility and live provider behavior remain NOT PROVEN.

After final evidence-head CI and clean/pushed/base checks, the implementation is eligible for READY_FOR_OWNER_MERGE_GATE — PHASE7A VK. Merge, production deployment and any minimal live-provider acceptance require their explicit Owner approvals.
