# VK authorization-code exchange investigation

## Scope and authority

Read-only production investigation of `TOKEN_EXCHANGE / INVALID_GRANT`, followed by preparation of the Owner-authorized diagnostic-only proposal. No production fix, env changes, secret rotation, VK settings changes, publication, merge or deployment is authorized here.

GitHub main and Render's latest LIVE deploy were independently checked at `9efaa9bf62b75e9f2d247c56218c746616f9ac4a`, deploy `dep-db3l1360tbcc73fvia5g`. The clean reused isolated worktree had identical content at `8a130c9`; the diagnostic branch starts from the exact production SHA.

## Real production evidence

Render app logs, queried read-only for 08:53:00-08:55:00 UTC on 2026-10-08, contain exactly two allowlisted events:

| UTC timestamp | Code | Stage | Reason |
| --- | --- | --- | --- |
| 08:53:50.264966144 | AUTH | TOKEN_EXCHANGE | INVALID_GRANT |
| 08:54:16.769700734 | AUTH | TOKEN_EXCHANGE | INVALID_GRANT |

Owner reports fresh authorization, consent and callback after privately correcting configuration. The code maps `value.error === 'invalid_grant'` to these events. Intent lookup, expiry check, authenticated decryption and state/owner/community binding precede the exchange. Grant parsing, community validation and persistence are later boundaries. Neither event identifies which grant constraint VK rejected; their code identities, age and provider descriptions are unavailable. No new real OAuth attempt was performed by this investigation.

## Exact structural trace at the production SHA

`lib/server/vk/oauth.ts::startVkOAuth` generates a 48-byte random verifier encoded as Base64URL (64 ASCII characters, no padding) and 32-byte random state. The same verifier is encrypted with AES-256-GCM together with state hash, owner and community. The authorization URL uses `SHA256(verifier).digest('base64url')` (43 characters), `code_challenge_method=S256`, the configured client ID and redirect URI.

The callback route reads code, state and device ID using `URL.searchParams.get`, once. Completion uses the state hash to select the intent, locks the account, decrypts the original payload, validates binding, deletes the intent and commits before making exactly one provider exchange. The form uses the recovered verifier and unchanged callback fields. `URLSearchParams` performs one form encoding. Client ID, service token and redirect URI come from `getVkConfig()` again at completion; they are not snapshotted in the intent. Configuration drift between START and completion is therefore a possible condition, not an observed cause.

## Official-source comparison

Current official primary sources fetched during this investigation:

- [Web SDK exchangeCode](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/auth/auth.ts): POST `/oauth2/auth`, authorization_code, client_id, redirect_uri, code_verifier, state and callback device_id; code in form body. Planly sends these fields in one form body, which is also the PHP SDK transport.
- [Web SDK PKCE implementation](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/utils/oauth.ts): SHA-256 of verifier, Base64, then remove padding and replace `+`/`/` with `-`/`_`. This matches Node's Base64URL digest.
- [PHP SDK token fields](https://github.com/VKCOM/vk-php-sdk/blob/master/src/VK/OAuth/User/DTO/TokensParams.php) and [transport/callback documentation](https://github.com/VKCOM/vk-php-sdk/blob/master/src/VK/OAuth/User/User.php): authorization code and callback device ID, client ID, verifier, redirect URI, optional service_token, form POST. The PHP DTO also transforms the verifier; it is not used as an oracle for Planly's verifier, for which the Web SDK is the direct reference.
- [PHP authorization parameters](https://github.com/VKCOM/vk-php-sdk/blob/master/src/VK/OAuth/User/DTO/AuthorizeUrlParams.php) explicitly use `S256`. The Web SDK uses lowercase `s256`; this variation does not prove a production error.

The [official HTTP documentation](https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description), backend-flow documentation and confidential-app configuration could not be retrieved by web tooling. Direct browser access to the documentation was rejected by the browser security policy; no workaround was attempted. Current portal-specific verifier bounds, code lifetime/reuse policy, exact redirect comparison policy, confidential-app service-token/IP requirements and documented invalid_grant descriptions remain unverified. No third-party explanation is used as causal evidence.

| Property | Code/synthetic evidence | Production limitation |
| --- | --- | --- |
| Endpoint, method, form fields | Match official SDK core contract | Does not prove grant acceptance |
| PKCE algorithm / format | Recovered verifier reproduces challenge; 64/43 characters, URL-safe and unpadded | Actual VK grant binding not observable |
| Device ID | Callback value preserved exactly, including synthetic reserved characters | Provider validity/device binding UNKNOWN |
| State | Callback value preserved; hash and encrypted owner/community binding checked | Provider-side constraints UNKNOWN |
| Client ID / redirect URI | Same config source at START and exchange; exact equality in synthetic flow | Actual values/registration equality not re-read privately; drift not proven |
| Service token | Included unchanged; official PHP SDK supports this field | Belongs to app 54809575: UNKNOWN |
| Authorization code | One exchange per consumed local intent | VK expiry, prior use or validity UNKNOWN; local intent TTL is 10 minutes, not VK code TTL |

## Verification

- Baseline OAuth/diagnostic/crypto tests: 28 PASS, 0 FAIL.
- A one-off in-memory probe ran 100 synthetic START -> encrypted intent -> callback parsing -> actual completion/request functions. Only PostgreSQL transport and provider fetch were replaced. Independent WebCrypto SHA-256 plus manual Base64URL conversion equalled the original challenge after recovery. Code/device/state round-trip, client/redirect equality, verifier preservation, no plaintext verifier in the stored envelope, local replay refusal and no downstream writes after provider failure all passed. Real provider requests: zero. No synthetic credential values were printed.
- Diagnostic RED: nine new tests failed because the fixed classification was absent.
- Diagnostic GREEN plus unchanged OAuth, crypto, diagnostics, routes and Origin tests: 48 PASS, 0 FAIL, 0 SKIP. Existing tests were not edited.
- Typecheck/lint and canonical CI results must be read separately before claiming readiness. Local full integration execution requires an isolated database; no local DATABASE_URL was configured or substituted from production.

## Diagnostic-only proposal

Current `requestVkGrant` discards `error_description`; neither logs nor persisted data can recover historical descriptions. Keep AUTH/TOKEN_EXCHANGE/INVALID_GRANT unchanged and add only `invalidGrantReason` to this specific failure log. Classify strict whole-string matches as PKCE_MISMATCH, CODE_VERIFIER_REJECTED, CODE_INVALID_EXPIRED_OR_USED, DEVICE_ID_REJECTED, REDIRECT_REJECTED or SERVICE_TOKEN_REJECTED. Unknown, missing, malformed, appended/embedded secret-bearing text becomes OTHER_INVALID_GRANT. These descriptions are conservative synthetic classifier fixtures, not a claim that the observed VK response contained any of them. The logger independently rechecks the enum; no raw body, arbitrary description, code, verifier, token, identifier, URL or cause object reaches logs.

The exchange request, auth/state/CSRF checks, scopes, grant parser, connector, token refresh, encrypted persistence and publishing behavior remain unchanged. A provider-reported classification still needs corroboration; CODE_VERIFIER_REJECTED does not by itself mean PKCE mismatch, and SERVICE_TOKEN_REJECTED does not by itself prove an app mismatch.

## Decision

ROOT_CAUSE_PROVEN: NO. Only the first provider rejection boundary is proven. Service-token ownership is UNKNOWN. Stop before production changes. Owner approval is required before merging/deploying the diagnostic proposal and before any new real OAuth attempt. After an approved diagnostic deployment, observe one Owner attempt and investigate the reported category without automatically fixing it. An OTHER_INVALID_GRANT result may still require Owner-side private inspection or official provider clarification.
