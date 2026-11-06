# VK permissions repair — 6 November 2026

Scope: bounded continuation of Draft PR80 after explicit user authorization to check and fix. No merge, deploy, persistent configuration change or provider upload/save/post is authorized here. The historical read-only audit remains unchanged.

## Contract and source correction

The exact [VK ID reference supplied by support](https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description#Zapros-koda-podtverzhdeniya-i-rabota-s-formoj-razresheniya-dostupov-polzovatelya) was read in the browser and in the user's complete pasted text. Request scope inheritance during refresh does not establish the replacement token's returned permissions. The source previously substituted stored scope labels when response.scope was absent and accepted absent response.state.

The repair requests prompt=consent with the existing configured client ID, wall photos and PKCE; both initial and refreshed token responses require explicit scopes and an exact nonempty state roundtrip. Invalid refresh responses retain UNCERTAIN and cannot retry the old refresh pair. These reproduced source defects are not asserted to explain a historical live INVALID_GRANT.

The obsolete multiuser integration expectation that all USER VK OAuth is owner-only was replaced with actual per-user ownership/state isolation. Telegram/MAX owner restrictions, credential preservation and zero provider transport assertions remain. No security assertion was disabled.

## Verification before commit

- TDD reproduced four failures for missing state, fabricated scopes and missing explicit consent. The completed permission contract suite has 13 passing tests.
- Local combined VK/publication unit gate: 411 PASS, 0 FAIL, 0 SKIP. Evidence: ignored .superpowers/vk-permissions-20261106/unit-gate.log. This is dirty-worktree evidence, not exact-commit CI.
- One subsequent local typecheck and targeted lint completed with exit0; git diff --check passed.
- Independent read-only review found no actionable issue in the final source/test/workflow delta.
- Previous exact source 14391ea8adab113f791584bae60b2abc92837dac: CI run42025522023 unit398/398 PASS; seven disposable PostgreSQL17/Redis7 suites88/88 PASS; full suite1970/1971 PASS. Its sole failure was the obsolete USER VK403 expectation. Compiler/lint/build were not reached in that run. The corrected test and added refresh integration cases still require fresh CI.
- The workflow now has one PR trigger instead of duplicate push and PR runs. Integration still depends on unit success at the exact checked-out head; disposable identity, loopback-only transport and database guards are unchanged.

## Live evidence and its limits

User observed the owned native app54809413 return wall/photos/groups granted. The user then reported groups.get returned items_array, the entire list was read, and group242095689 was present among editor/admin groups. The fallback diagnostic was ABSENT. In this source that block appears after successful validation of the primary photos.getWallUploadServer URL; this is a source-based inference from user-observed output, not a captured provider receipt. An absent optional fallback is not an upload failure.

No new file upload, photos.saveWallPhoto or wall.post has been executed. Native consent does not establish persistent OAuth background capability or a stored application grant.

Read-only staging snapshot at 2026-11-06T05:28:02Z: web8ebf6a47d53287c788393891aab0c3b2b012a3c1 healthy, worker466a30e6d5219060c89d5911f3541761e3ff7037 running, both restarts0; public health200; zero VK credentials and zero nonterminal publications. One marker already exists for vk-user-upload-diagnostic-20261103-02. Do not reset it or repeat its provider operation; reconcile the stored safe result first. These deployed revisions do not include PR80.

Next: exact-head unit -> disposable PostgreSQL17/Redis7 integration/full regression -> typecheck/lint/build. Production and staging deployment remain separate owner gates.
