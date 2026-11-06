# Lentaro — VK repair checkpoint, 6 November 2026

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
