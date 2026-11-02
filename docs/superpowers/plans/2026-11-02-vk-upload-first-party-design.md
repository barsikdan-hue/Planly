# VK upload-only: first-party window design (proposed)

Status: OWNER_APPROVED 2026-11-02 for approach1 and source implementation. No deployment or real upload authorized.

## Confirmed problem

Owner reported OWNER_SESSION_RECOGNIZED at the top-level staging admission URL and OWNER_SESSION_REQUIRED for the same GET inside the VK iframe on 2 November. Current source5099baf uses planly_session with HttpOnly, Secure in production, SameSite=Lax, Path=/. The iframe cannot rely on that cookie. Existing auth checks and the main cookie must be preserved.

Reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie

## Approaches

1. Recommended for the existing bounded diagnostic: open a top-level Planly window from an explicit Mini App click. Perform owner admission and the existing upload-only POST there. This uses the existing session without supplying a session token to the iframe. Requires a window and an explicit confirmation there; opener/message support must be verified and fail closed.
2. Separate narrowly scoped short-lived capability for the iframe, issued after first-party owner confirmation. This introduces a new credential issuance, binding, expiry, revocation and replay mechanism. More appropriate to a separately designed final onboarding flow; not selected implicitly.

Global SameSite=None, cookie extraction, session-token postMessage, an anonymous upload relay and removal of the owner check are excluded.

## Proposed behavior for approach 1

- Scope remains one upload-only diagnostic for fixed group242095689. No saveWallPhoto, wall.post, scheduling, agent enrollment or grant widening.
- Explicit click opens a fixed same-origin Planly page in a new top-level window. A blocked popup, absent opener or login requirement produces an actionable state with no upload/claim. Opening or handshake alone must not consume any one-shot marker.
- The new page is top-level only and cannot be used embedded. It performs the existing GET admission with the normal session. Failure preserves 401/403/503 categories.
- Communication validates exact origin https://stage.lentaro.ru, the specific expected window reference and a fresh cryptographic request nonce in both directions. No wildcard targetOrigin. A ready message alone cannot initiate an upload.
- Only the already bounded signed upload URL, generated PNG, fixed group and nonce are sent to the Planly window in memory after the user requests the test. VK access token and Planly session token are never sent. No sensitive payload in URL, fragment, localStorage, logs or persisted queues.
- The Planly window shows the fixed group, image preview and upload-only purpose. A separate explicit click there authorizes the single upload request. Stale/replaced window, expired handshake, cancellation or closure invalidates pending work. No implicit resume after login/reload.
- Before POST: fresh owner admission, bounded payload validation, concurrency fence and existing browser/server one-shot markers. Do not reset any marker. Existing uncertain attempts stay consumed. Server Redis SET NX remains the final cross-window/refresh/replay barrier.
- Cookie, owner provider gate, server transport allowlist/DNS/TLS/redirect limits and origin policy remain unchanged. Denials cannot claim or upload. Result message contains only the fixed status and bounded HTTP status, never raw provider response.
- If opener messaging cannot be made reliable under the actual browser policy, fail closed and review the alternative; do not silently export credentials or weaken access.

### Review constraints

- Nonce has at least128 bits from a cryptographic RNG, handshake TTL120 seconds, one payload/request per window; terminal state rejects further messages and nonce reuse.
- Strict payload schema/limits are checked before preview. Freeze the accepted payload and bind the explicit confirmation to that exact image/URL. Later replacement is rejected; a different payload requires a new flow and fresh confirmation.
- Fixed window URL with no redirect parameter; HTTP CSP frame-ancestors 'none' plus a top-level check. Lost opener or COOP separation is a closed failure, not permission to use another transport.
- Browser storage can be partitioned: iframe and top-level localStorage may differ. A fresh popup marker never proves no previous attempt occurred; the unchanged server NX is decisive. No marker clearing/migration to bypass consumed attempts.
- Add tests for payload replacement after preview, nonce reuse and separate storage contexts.

Reference for message checks: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage

## Verification and gates

Use deterministic tests for wrong origin/source/nonce, stale messages, popup blocked/closed, iframe load denied, missing/forbidden/error admission, no-claim on handshake, cancellation, duplicate and uncertain attempts, one POST only, secret-free status messages and no save/post calls. Run type/lint/build, isolated browser fixtures with third-party cookies unavailable, independent review and exact-head CI.

Owner approves the design before implementation because authentication/handoff architecture is an Owner gate. Source work follows after approval. Each build/deploy and the first real signed-URL transfer/upload remain separately scoped external-action gates. No real provider operation is authorized here. Runtime success remains unverified until approved browser/provider evidence.
