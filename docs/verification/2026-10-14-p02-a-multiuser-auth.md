# P02-A pre-PR implementation evidence

STATUS: implementation validated in an isolated environment; production acceptance is not claimed. Native GitHub CI and Self-host results belong to the candidate PR's exact-head checks.

BASE: main ce46b4a0a5791eb6da75834dce4d7ecc95361938. Branch: codex/p02-a-multiuser-auth. Product source: Issue54 and the owner's explicit P02-A implementation scope. PR55 fe58221 is still Draft/unmerged and is not copied into this branch.

## Change and identity boundary

- Additive migration0010 extends users with ADMIN/USER, ACTIVE/BLOCKED, nullable scrypt hash, initialization marker and session version; sessions capture that version. No reseed, reset, row deletion or owner credential migration.
- The configured legacy owner initializes once by existing email/id. Its environment password and version0 sessions remain valid; an initialized blocked owner cannot be reactivated by login/bootstrap.
- Actual login verifies the selected user's password; opaque HMAC session lookup checks expiry, access state, initialization and version. Session issuance/revocation serializes on the native user row. Logout deletes only its supplied session.
- Personal Posts/Media/Library/Accounts/Schedule/Analytics remain session-scoped; ADMIN has no data override. Forged identity selectors and credential/role payload fields are rejected. Private JSON and client reads are no-store; auth/mutations reject cross-site requests. Existing VK origin validation is retained.
- USER gets an owned disabled provider catalog. Owner Telegram/MAX env credentials and existing OAuth/analytics provider operations remain owner-only. The real worker checks that boundary before claim/media/connector resolution. Existing owner dispatch logic and injected fixture transports are retained. The existing worker receives only OWNER_EMAIL for this check, without an auth password.
- Verified owner changes reset personal transient UI state, remount Settings and invalidate prior request lifetimes. Delayed A success/error/401/logout/delete cannot change B state, unlock B operations or navigate its active session away.

## Local evidence (supporting, not production proof)

Environment: disposable loopback PostgreSQL16.15/Redis7.2.16, Node24.21.0, frozen package lock. New enrollment exists only in fixtures. No external provider sends.

- RED: auth schema absent (`Missing auth column role`), A login401; meaningful UI REDs reproduced retained A profile/delete text, blocked owner transition, late401 redirect, inherited logout lock and late delete closing B confirmation.
- Native auth/schema plus old owner checks:20/20. Real ADMIN/A/B cookie handlers, password mismatch, reload, foreign reads/writes/media attachment, roleADMIN no override, expiry/forgery/logout, suspension/revocation, old token preservation, native issuance-vs-revocation lock, parallel requests, zero real Telegram/MAX fetches with owner credential markers present.
- Changed-path regressions:129/129. Expanded native/UI/client subset:33/33 before the final additional delete case; that case also passed in full regression.
- Full Windows run:1123/1125. One fixture lacked the required bootstrap profile and was corrected, original regression GREEN1/1. The other failure is unchanged baseline Windows URL.pathname conversion in self-host-init.test.mjs (`C:\\C:\\...SMM%20Planer...`, MODULE_NOT_FOUND). It is not skipped or weakened; native Linux CI must verify the full suite.
- Typecheck exit0; lint exit0 (16 warnings); production build exit0 with ANALYTICS_CSS_OK. Migration generation reports no schema changes.
- Real compiled Next HTTP smoke PASS: ADMIN/A/B login, SSR/reload, personal APIs and signed own media URLs, own draft writes, direct foreign/forged IDs, concurrent profiles, independent logout/expiry. UI lifecycle harness evidence is distinct from this real backend proof.
- Desktop/mobile browser pilot:48/48 on synthetic loopback fixtures, separately from the real backend HTTP proof.
- Independent read-only Critic:0 P0 /0 P1 /0 P2 outstanding confirmed findings after fixes.

## Release gate

CI-driven repair after candidate30d25a9: native CI38553268364 ran1125 tests,1122 passed; three failures depended on missing fixture S3 configuration. Removing local S3 env reproduced those exact three failures. The test now owns/restores synthetic loopback storage inputs, with unchanged strict isolation assertions. Self-host38553268373 passed, including the real compiled multiuser HTTP smoke, but must repeat at the repaired candidate HEAD.

An additional native RED proved that explicitly blocking a migration-default BLOCKED/uninitialized owner returned early and allowed later lazy initialization to grant access. The lifecycle primitive now records that explicit intent under its existing row lock, preserves ADMIN/id/password, increments version and revokes sessions. Repair checks: CI-environment17/17; old auth + new auth/schema + UI response regressions32/32; typecheck/lint/build/real compiled HTTP exit0; independent Critic0/0/0. Fresh native full CI and Self-host are required on the pushed repair.

Accept and merge P01-A #55 first. Then integrate current main and repeat native full CI, compiled multiuser HTTP and Self-host checks. Owner authorization remains required for merge/deploy, production migrations/DB, secrets/infrastructure and real provider sends. This PR creates no registration/invitation/admin dashboard, personal provider credentials, shared Library refactor or new scheduler.
