# P02-B invite-only registration

Approved implementation scope: Issue #54 and the P01 security specification. Base: main `1cc6899`. No production writes, migrations, deploy, merge or provider sends.

1. Native RED: ADMIN creates an email invitation; USER cannot. Add an additive invitations table, random 256-bit token with hash-only storage, 24-hour expiry and list/revoke endpoints. Reject existing accounts and concurrent duplicate pending invitations.
2. Native RED: inspect/activate expired, revoked, replayed and concurrently used links; strict inputs, CSRF, bounded request budgets and password validation. Lock invitation, atomically create an ACTIVE initialized USER and an opaque session using existing scrypt/session primitives. Never enroll or reactivate an existing account.
3. Browser RED: ADMIN creates/copies a fragment-only invitation link; colleague sets a password and enters an empty private workspace. Minimal dedicated invitation page linked from Settings only after a server ADMIN check. No token in URL query/path, list/error response, logs or persistent browser storage. Raw token is returned once to the authorized creator and supplied only in POST bodies by the recipient.
4. Native/API regression: real ADMIN/A/B sessions, owner ID/password/session/data preservation, foreign resources and provider credentials denied, logout/reload, duplicate email, malformed/forged payloads and token-hash checks.
5. Compiled HTTP, desktop/mobile browser E2E, typecheck, lint, build, full native CI and Docker Self-host. Independent read-only Critic; repair only proven in-scope defects, rerun affected checks, then push one Draft PR and verify exact-HEAD CI.

Routine implementation choices: fixed 24h TTL; password length 12–128 characters; duplicate existing email is rejected (reset/recovery is separate); a pending invitation can be revoked then recreated. Invitation administration grants no personal-content access. Expiry/revoke/replay errors reveal no token or account state. Existing owner/session/provider business logic remains intact.

Evidence is isolated/local or GitHub CI/Self-host, not production acceptance. Owner gate remains merge and subsequent deployment/production migration.
