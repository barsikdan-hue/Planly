# First-party upload receipt repair — 6 November 2026

Current root cause is confirmed by the owner's Chrome console: the direct browser upload from stage.lentaro.ru to pu.vk.ru cannot read its response because Access-Control-Allow-Origin is absent; net::ERR_FAILED follows. Its upstream HTTP status and whether VK accepted bytes remain unknown. The source never reached photos.saveWallPhoto/wall.post. Both consumed direct-operation IDs remain terminal; the signed upload URL/screenshot are not copied into this report.

## Bounded repair

Branch codex/vk-firstparty-receipt-20261106 starts from verified/static-deployed23589fd. Reuse existing first-party owner popup, exact pu.vk.ru URL guard, public IPv4 DNS pinning, TLS hostname/certificate validation, multipart transport, deadlines, rejection classifier and no redirects. The new endpoint /api/social-accounts/vk/upload-receipt-test returns only a validated private {server,photo,hash} to the new popup and Mini App memory. Existing /upload-test and every upload-only result remain status-only.

VK token stays in the controller's Bridge closure. Neither popup nor server receives it. Receipt never enters DOM, snapshot, diagnostics, storage or logs. The new operation requires exact origin/source/nonce, TTL, frozen payload, fresh ACK, initial and final owner admission, a trusted popup click, a permanent per-owner Redis NX upload claim and a separate browser publication claim. Success before payload/ACK is rejected. Reset/cancel/expiry stops continuation. Fresh authenticated upload-server user_id pins the allowed photo owner; foreign/private receipts remain rejected.

Current UI opens the first-party popup synchronously and uses publishReceiptTest/flow.run. It no longer calls uploadPhoto/browser fetch for publication. After private receipt, the existing Bridge save/post sequence uses the actual validated owner and fixed group242095689. The closed SERVER_UPLOAD_PENDING stage makes popup/admission/transport failure distinct from a claim that a browser upload request was sent. HTTP405 safe metadata survives to the Mini App; it never starts save/post. No retry/fallback or browser security change is introduced.

New fixed IDs: upload vk-upload-receipt-20261106-01; publication planly-vk-receipt-post-20261106-01. Text: «Тест Lentaro 06.11.2026: серверная загрузка новой картинки в VK». These are draft operation contracts, not a silently re-enabled old attempt. No provider call, deployment, merge, migration, secret/config/CSP/infrastructure change has occurred during preparation.

## Local evidence

- Protocol5 RED then PASS; backend/route12 RED then PASS; claim helper4 RED then PASS. Old relay/rejection cases remain green.
- Frontend wrappers initially3 RED, publisher/claim3 RED, forged early success1 RED and stage-clarity1 RED; final targeted frontend/legacy tests pass.
- Combined local VK/publication gate:456 PASS /0 FAIL /0 SKIP, dirty-worktree evidence. Standalone typecheck exit0; targeted lint and static build verified separately. A prefer-const lint finding was corrected without restoring the old synchronous-callback timer TDZ.
- Actual main/controller/popup source in a fully intercepted browser: success makes one owned endpoint upload and one stubbed Bridge save/post; HTTP405 makes zero save/post calls. Before trusted confirmation no upload; browser pu.vk.ru requests0; providerCalls0; token/receipt not rendered/stored, old markers retained and repeat disabled.
- Independent read-only review of backend/helper/guarded integration and runtime client/server boundary: clear. CI/exporter has separate unit/provenance checks and source review; it is not a running service proof.

## Exact-source CI and release gates

The same-SHA unit gate precedes disposable PostgreSQL17/Redis7 suites. A new explicit integration target (not the general *.test glob) refuses to write until loopback namespace, versions and matching PostgreSQL/Redis nonce sentinels are verified; it races20 real claims, requires exactly one winner and permanent TTL=-1, then deletes only its two fresh UUID keys after sentinel recheck. Full regression/typecheck/lint/build follow. No local integration has been executed; prepared tests are not PASS claims.

Only after unit/integration success may CI build/export a Linux/amd64 web image. A bounded derived Dockerfile changes exactly RUN pnpm build to RUN --network=none pnpm build and records both recipe hashes. Dependency installation has no inherited credentials. A nonroot/read-only/network-none container performs filesystem reads only: compiled API/page routes, exact public modules and BUILD_ID. It does not import/start the app, worker, database or provider. The artifact records source SHA, image ID, platform and archive digest. Static CI separately pins SOURCE_REVISION and asset hashes and runs both intercepted browser regressions.

This repair needs a separately approved **web-only plus static** staging release. The old static23589fd approval does not cover it. Prepare exact artifacts, existing-image/static rollback, unchanged env/config/worker/DB/Redis/CSP/counts and a counted at-most-one new provider operation for owner review. Neither mocked browser success nor green CI establishes real upload/save/post, background OAuth or scheduled-worker acceptance. Exact committed CI results belong in the final external release report/PR after execution.
