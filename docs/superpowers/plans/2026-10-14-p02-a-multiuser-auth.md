# P02-A Multiuser Auth Implementation Plan

> Execute inline with writing-plans/TDD/verification and independent read-only Critic. User explicitly authorized implementation, fixtures-only enrollment and this scope; no new design approval is required.

**Goal:** ADMIN and active USER fixtures authenticate with distinct credentials, recover their own server-side identity after reload, and cannot access another workspace.

**Architecture:** Extend existing users/sessions, scrypt and opaque HMAC tokens. Keep existing repository userId guards and current owner env password. Initialize the existing configured owner once by email without replacing its id/data or re-enabling an already initialized blocked account. A versioned session identity serializes issuance and revocation on the user row. Real provider operations remain restricted to the existing owner; no new enrollment endpoint.

**Spec:** User P02-A implementation request in this chat and Issue54, building on approved P01 privacy/lifecycle policy. PR55 must be accepted before merging this independent main-based branch; revalidate the integrated result afterward.

**Constraints:** ADMIN/USER only; access ACTIVE/BLOCKED; additive migration; password hashes only, no new secrets/provider credentials; no production/provider/infra/merge/deploy actions. Default legacy non-owner rows remain blocked. ADMIN has no personal-data override.

**Review focus:** Legacy owner/session preservation; suspension cannot be bypassed by owner bootstrap; password verification/issuance vs revocation races; no credential use via direct queued work; per-session API identity/no-store/forged IDs; delayed A responses and B requests retain captured identities.

## Task 1 — additive auth persistence

Files: db/schema.ts, generated migration0010/snapshot/journal, auth/access.ts; tests/multiuser-schema.integration.test.ts.

- RED schema columns/defaults and legacy-row preservation on disposable native PG.
- Add role/access/passwordHash/authInitialized/sessionVersion to users, version to sessions. Generate/apply additive migration; no row deletion or id change.
- GREEN schema tests; migration drift clean.

## Task 2 — credential/session/API vertical slice

Files: existing auth owner/session/login/logout/SSR helpers, bootstrap/http, provider API boundaries and real-dispatch guard. Tests: multiuser-auth.integration.test.ts and multiuser-api.integration.test.ts.

- RED actual ADMIN/A/B login and HMAC session/API tests on the new schema while auth remains single-owner.
- Extend authentication and locked session creation; active initialized user+matching version+expiry required on every session read. Logout deletes only supplied session; revoke increments user version and deletes its sessions. Preserve old owner aliases and public DTO fields.
- Return private no-store responses; reject cross-site auth/mutations and forged identity selectors. Guard new-user connect/toggle/OAuth/analytics provider refresh and real dispatch; preserve existing owner paths and fake transport tests.
- GREEN A/B read/write, ADMIN no override, expiry/logout/block/revoke, issuance race, empty bootstrap/media signing, foreign ID/forged identity and provider zero-call cases. Existing owner-lifetime tests cover late UI continuations.

## Task 3 — real HTTP, regression and delivery

- Run an isolated compiled Next.js HTTP smoke for three fixture logins, cookie reload/logout/SSR and real personal APIs; no mocked UI/provider transport.
- Full native tests, typecheck/lint/build, desktop/mobile fixture E2E and CI/Self-host at exact HEAD. Document baseline Windows harness limitations separately.
- Independent read-only Critic after integration, fix valid findings with RED/GREEN. Draft PR from main, explicit PR55 dependency and no auto merge/deploy.
