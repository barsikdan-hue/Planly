# VK OAuth start: public Origin behind Render

## Contract and approval

Owner approved a separate minimal Origin fix and a new PR without merge/deploy on 2026-10-08. Base main and current production: `ccb4884c4dd5d17c44b5c4e09ae3ea5df6760461` (merged diagnostic PR26).

Scope: let an authenticated owner begin VK OAuth from the configured public site behind Render while retaining exact Origin validation. No provider permissions, credentials, settings, infrastructure, publishing, refresh, or disconnect lifecycle changes.

## Production evidence and first failing boundary

- Render deploy `dep-db3k42e0tbcc73fs8e4g` became LIVE at the base SHA; health returned HTTP 200 with `status: ok`. CI and Self-host also succeeded on this merge SHA.
- Owner reported another consent/return failure. No corresponding real `VK_OAUTH_FAILURE` appeared in the inspected logs. Its grant/exchange failure remains NOT PROVEN.
- A separate synthetic `error=access_denied` callback produced the safe `AUTH / CALLBACK / ACCESS_DENIED` event at `2026-10-08T07:24:28.276415803Z`. This verifies deployed logging, not the cause of the owner's OAuth attempt. It performs no code exchange or credential writes.
- A new UI attempt in the authenticated production browser returned **HTTP 401 from POST `/api/social-accounts/vk/start` before navigation to VK**, twice. CDP showed browser Origin `https://planly-m4zq.onrender.com` and a session cookie present.
- Protected `/api/bootstrap` returned HTTP 200 with the exact same owner session cookie after the start refusal. Only cookie presence/equality were reported; no cookie, token, or hash was exported.

Execution: `start.POST` → `requireApiOwner` → `requireVkSameOrigin` → HTTP 401 → client `redirectUnauthorized` → login. Therefore this reproduced attempt never reaches authorize, callback, exchange, grant parsing, community validation, or persistence.

## Root cause

`requireVkSameOrigin` originally compares the browser Origin with `new URL(request.url).origin`. Docker starts Next with `-H 0.0.0.0`. The installed, pinned Next 16.3.4 `attachRequestMeta` constructs `initURL` from its listen hostname and port; `NextRequestAdapter.fromNodeNextRequest` uses that metadata for the route request URL. Forwarded public Host does not replace this listen URL.

An executable probe using those real Next methods produced `https://0.0.0.0:10000` (and the HTTP variant) and the real guard threw `UnauthorizedError` for the correct public browser Origin. A direct public-URL control passed: three assertions passed. The port in this local probe is a controlled fixture; the exact production internal URL was not logged.

## Minimal change

- Start authenticates the owner first, validates the existing server VK configuration, and passes the HTTPS redirect's origin explicitly to the guard.
- The guard uses this configured origin for start and retains its prior default for existing callers. It does not trust `Host`, `X-Forwarded-Host`, or request input as public authority.
- The existing disconnect-with-missing/corrupt-OAuth-setup test and production disconnect flow are unchanged.
- Exact foreign Origin, scheme, port and subdomain mismatches are refused before intent DB access or provider calls. Bad VK configuration gives the existing CONFIG/503 response.
- Requested `wall photos`, PKCE, encrypted intent storage, required grant scopes, rotating credentials and publishing gates are unchanged.

## Verification

- New route regression runs the real Next adapter, owner check, configuration, guard and OAuth intent encryption. Only external PostgreSQL/session transport is substituted; fake secrets are generated per test and cleaned up.
- RED: seven tests, five passed, two failed as expected (`401 != 200` for the legitimate public Origin and `401 != 503` for invalid configuration).
- GREEN: origin/routes/diagnostics, **32 passed, zero failed/skipped**.
- Independent review: no actionable findings; origin/routes, **11 passed, zero failed/skipped** on Node 24.21.0.
- Typecheck passed. Full local `pnpm test` was attempted without the required test database environment; the unchanged bootstrap integration setup failed with Zod `DATABASE_URL: Required`, before route execution. This is not a full local PASS. Native CI must run the full suite with PostgreSQL and Redis.
- Local canonical `pnpm build` stopped before compilation: Turbopack rejected this reused worktree's external `node_modules` junction (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`). The junction and build configuration were not altered. Native CI must verify the canonical build with its normal frozen dependency installation.
- Exact branch commit, native CI, Self-host and production acceptance are separate subsequent gates; none is inferred from these local results.

## Remaining provider boundary

This fix addresses the proven OAuth-start refusal only. Whether app 54809575 can obtain `wall` and `photos`, the first real callback/exchange failure, provider approval and actual publication remain unproven. Do not remove required publishing scopes or mark CONNECTED from a basic VK ID grant. A new production OAuth attempt is required after an authorized merge/deploy. The VK support request draft remains unsent.
