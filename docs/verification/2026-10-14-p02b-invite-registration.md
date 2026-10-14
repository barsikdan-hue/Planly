# P02-B isolated implementation verification

Base main: `1cc689926e3153b43f51d006b9fda3d8e4500960`. Branch: `codex/p02-b-invite-registration`. Approved scope: Issue #54 and the P01 security specification. No merge, deploy, production migration, production credentials or real provider sends.

Implemented: ADMIN invitation creation/list/revoke and manual copy; 256-bit random bearer, hash-only storage, 24-hour expiry; strict inspect/accept POSTs; atomic single-use USER/password/session activation. Existing email cannot be enrolled or reactivated. Existing owner identity/password/sessions and private-data guards are preserved. One-time authorized creation response contains the bearer; list, inspect, errors and DB do not contain it. Links use fragments, cleared on mount and replacement.

Fresh local evidence (disposable PostgreSQL/Redis only):

- Native invite/auth/schema regression: 46/46, fail 0, skip 0. Includes 14 invitation security cases, duplicate/parallel activation, expiry/revoke/replay, session-write rollback, forged selectors/role/email, ADMIN admission, stable token rate budget, A/B isolation and existing worker no-resend guards.
- Compiled invitations HTTP and existing ADMIN/A/B HTTP: PASS; real cookies, SSR/reload, private APIs/media and owner preservation.
- Browser actual-network targeted regression: 6/6, desktop/mobile, unchanged 30-second limits, zero retries/skips. ADMIN Settings → create/copy/revoke → recipient password/empty workspace; USER logout/password login/reload; replacement/invalid/replayed/revoked links; delayed real logout cannot erase a newer B cookie.
- Existing UI fixtures: 48/48 in the broader local run. The former virtual HTTPS transport failed redirects and cookie routing; its results are not represented as a final full-suite PASS. Final browser fixtures use actual loopback HTTP and preserve production Secure/HttpOnly/SameSite cookie flags.
- Typecheck/build PASS; lint exit 0 (19 warnings); migration generation reports no drift. Migration 0011 creates only the invitations table, constraints and index, applied only in isolation.

RED/GREEN evidence: missing ADMIN endpoint and `/invite` 404; email/invitation lock inversion reproduced as deadlock/500; malformed creation validated before authorization; rotating IP headers bypassed token KDF budget; same-document replacement ignored by mount-only effect. Each has a focused passing regression after its narrow correction.

Independent read-only Critic reviewed application corrections and browser transport. Findings were repaired; final application has no outstanding actionable findings. Failure artifacts do not retain invite/password/session traces, screenshots or DOM snapshots; transport errors do not echo session headers.

Fixture decisions: Playwright `route.fetch` follows redirects by default ([official documentation](https://playwright.dev/docs/api/class-route#route-fetch)); forwarding a redirect through a virtual HTTPS origin cannot provide a real HTTPS listener. Chromium supports the localhost Secure-cookie exception ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)); an actual compiled-browser probe verified protected cookie flags, authenticated reload and clipboard without changing server flags. This is isolated Chromium evidence, not production TLS or Safari acceptance.

GitHub native CI, the full 54-case browser suite and Docker Self-host are mandatory against the final PR HEAD; see the PR's exact-HEAD workflow links for their final results. `PR_READY` is not production acceptance. Owner gate: merge, deploy and production migration remain separate.
