# Lentaro — VK OAuth community diagnostic checkpoint, 9 November 2026

Deployed staging remains d297890/image9bd9c95b; five VK fields configured for Web54809575 after closed manual key correction. Gateway no-send fence active, worker stopped, BullMQ paused, counts4users/4posts/3publications/credentials0/nonterminal0, old receipt marker1permanent preserved. Production/main untouched. Three owner OAuth attempts07:37:52/07:38:05/07:39:14UTC reached COMMUNITY_VALIDATION then AUTH/FAILED. By exact deployed source ordering, returnedstate and required access/refresh/expiry/wall/photos grant checks passed before that stage; actual refresh and publishing remain unverified. The concrete group/API/network rejection is unavailable because the OAuth catch discarded VkCommunityValidationError. DNS/TLS-only probes07:43UTC passed for api.vk.com/api.vk.ru; no HTTP/API/token used. Official schema5.199 matches the current validator; no basis to relax guards or switch domains.

Source branch codex/vk-oauth-community-diag-20261109 from6db307b fixes only that proven diagnostic loss: typed closed connectorCode/errorType/vkErrorCode/networkErrorClass survives the catch, is revalidated at logging and appears only under COMMUNITY_VALIDATION. Foreign errors stay generic. Validation and authorization acceptance, persistence, retry and publishing behavior are unchanged. New14unit RED→GREEN, focused112PASS, typecheck/diff-check0; actual OAuth2integration regressions are added but await attested CI. Independent Critic no blockers. Artifact proof now requires compiled OAuth callback bytes; targeted artifact6PASS after meaningful missing-callback RED. Workflow adds exact stacked PR base and image export only after unit→isolatedintegration. No new source deploy/OAuth/provider request; existing staging fence remains in place. Exact-source CI/image results are PENDING at this checkpoint and must be reported separately; do not treat local checks as runtime proof.

Plan: docs/superpowers/plans/2026-11-09-vk-oauth-community-diagnostics.md. Existing historical checkpoint follows.

# Lentaro — VK repair checkpoint, 6 November 2026

New source branch codex/vk-firstparty-receipt-20261106 from23589fd:
current direct-browser upload CORS failure is confirmed by user console.
Separate first-party owner relay receipt feeds existing Bridge save/post;
old upload-only contracts and both consumed direct markers are preserved.
Local456 unit PASS and typecheck exit0; intercepted success/HTTP405 browser PASS,
providerCalls0. Real Redis claim race is prepared for attested CI only.
No new provider operation or rollout. Required next gate is exact-source CI,
immutable Linux web+static artifacts, then separate owner web/static staging decision.
Details: [CORS transport repair](docs/verification/2026-11-06-vk-firstparty-receipt.md).

Separate draft branch codex/vk-post-proof-20261106 from verified c940a43:
dated operation planly-vk-newphoto-20261106-01 for one explicitly requested post.
Legacy ATTEMPTED is preserved; no retry/resume/reset of the old operation. MiniApp now safely accepts the authenticated uploader photo owner, matching the backend contract.
Local421 unit/contract PASS; lint/static build exit0; independent review clear. Exact-head CI pending.
No provider write or deployment. PR80 remains the separately verified repair.
Details: [new post proof](docs/verification/2026-11-06-vk-new-post-proof.md).

OAuth follow-up: explicit consent, exact returned state and explicit returned
scopes on refresh; no fabricated permissions from previously stored labels.
Local unit/contract411/411 PASS; local typecheck and targeted lint exit0.
Previous exact-head CI14391ea: unit398 PASS; isolated PG17/Redis7 88 PASS;
full suite1970/1971, one obsolete USER VK403 expectation now replaced with
per-user account/state isolation. Fresh exact-head CI is pending.
User-observed native app54809413 grants wall/photos/groups and group authority;
primary upload-server success is inferred from the displayed fallback block.
No new upload/save/post. Read-only staging6Nov still web8ebf6a4/worker466a30e,
credentials0/nonterminal0; existing one-shot marker prohibits blind retry.
See [6 November evidence](docs/verification/2026-11-06-vk-oauth-permissions.md).

## Previous checkpoint (5 November)

Task branch: `codex/lentaro-vk-audit-fixes-20261105`, base `8ebf6a4`.

Six requested scenarios have targeted source corrections and reproductions.
Final local unit/contract gate: 398 PASS / 0 FAIL / 0 SKIP, Node24.21.0;
the checkout was dirty during this run, so it is not exact-commit CI proof.
Dedicated CI requires unit PASS at the same SHA before disposable PG17/Redis7.
Integration, full regression, typecheck/lint/build and final CI are pending here.

Fresh read-only staging: web `8ebf6a4`, worker `466a30e`; both lack VK config,
zero VK credentials and zero nonterminal publications. This proves persistent
publishing is blocked before upload, not the cause of an old transient upload.
Render live source `2f13a5a`, autoDeploy=no/trigger=off, metadata read only.

No schema migration, secret/configuration/infra change, merge, deployment or
provider request performed. Old unbound VK grants require OAuth reconnect.
Image autopublishing and native/multi-tenant live acceptance remain unverified.

Details: [repair evidence](docs/verification/2026-11-05-vk-audit-fixes.md).
