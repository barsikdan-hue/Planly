# Transient user-token upload source checkpoint — 2026-11-03

Owner approved the design and source implementation in this chat. This decision changes the previous token-never-leaves-Mini-App invariant only for the new explicitly confirmed in-memory upload test. It does not authorize deployment or a real provider attempt.

## Implemented

New operation `vk-user-upload-20261103-01`, owner endpoint `/api/social-accounts/vk/user-upload-test`, and top-level owner confirmation page `/social-connections/vk-user-upload-test`. The Mini App keeps its grant in the controller closure and passes it through exact-origin/source/nonce messaging to the owner window. A trusted confirmation, live peer check and fresh owner admission are required before the POST. Payload replacement, cancellation, expiry, absent browser locks/storage and replay fail closed.

The server enforces owner access, exact origin/custom header, bounded 20KB JSON and cancellation/deadline, fixed group 242095689, 120-second input freshness, and permanent atomic Redis NX claim. Claim contains only the operation/owner and ATTEMPTED; no token. It checks real editor membership using one groups.get, obtains one photos.getWallUploadServer response, then uploads one fixed 800x500 PNG. The PNG preview and server bytes share an immutable public fixture. A native FormData helper is shared with the existing publication connector. Tokens stay in request memory, are never persisted or returned. Redirects/retries, saveWallPhoto, wall.post and account/queue enabling are absent.

Client-provided scope labels are shape checks, not independent proof of wall publishing. Actual group membership and photo-method access are verified server-side during the future authorized test. Lifetime/refresh and unattended scheduling remain unproven.

## Fresh local verification

- TDD RED: missing controller method and missing new modules; GREEN after implementation.
- 130 focused connector/controller/server/window/sender/document tests PASS.
- Intercepted Playwright browser PASS: first-party owner cookie in popup, no POST before trusted confirmation, one POST, sanitized output, no token in DOM/storage/results, second window blocked. Compiled Mini App index/main boot has no page errors. All origins intercepted; provider calls zero.
- Standalone typecheck PASS; full lint exits zero (existing/generated warnings); static probe build and full Next production build PASS, including new routes.
- Independent review passed 105 relevant tests, found a root npm-ci/lockfile mismatch in the new CI browser step. Fixed to existing pinned pnpm/frozen lockfile and placed browser test after static build; follow-up review found no further issues.
- Broad local VK glob is NOT PASS: DB integration tests require missing local DATABASE_URL. Exact-head GitHub CI with isolated PostgreSQL/Redis is the required integration lane; no real staging database was used for tests.

## Boundaries and next action

Runtime remains the previously deployed d542d86. No SSH mutation, infrastructure/configuration/secret change, new VK read, file upload or post occurred in this implementation. All previous operation markers remain unchanged. Next: exact-head CI, then prepare a precise candidate build and web-only release with rollback for owner approval; the later real token transfer/one upload is a separate gate. Do not reuse any old publication authorization.
