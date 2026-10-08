# VK service-token failure: bounded diagnostic follow-up

## Authority and evidence

Owner requested continuing the VK repair. Preserve ROOT_CAUSE_NOT_PROVEN -> NO FIX and separate merge/deploy gates. GitHub main and latest Render LIVE deploy were independently reverified at `9d9de5561113e0e7a8c86356e7577d78c828936d`. A clean reused isolated worktree starts `codex/vk-service-token-signals` from that exact main. No production behavior fix is justified yet.

The Owner's real attempt after PR29 produced one safe event at 2026-10-08 10:50:21 UTC (13:50:21 Europe/Moscow): AUTH / TOKEN_EXCHANGE / INVALID_GRANT / OTHER_INVALID_GRANT, HTTP 200, description PRESENT, mentions [SERVICE_TOKEN]. Its raw description was neither logged nor persisted, and cannot be recovered from this event. Service-token mention alone does not prove token rejection, ownership mismatch, IP restrictions or a request bug. The Owner privately confirmed token equality with app 54809575; this is distinct from provider verification of its validity.

## Independent official-source comparison

- [VKCOM PHP SDK TokensParams](https://github.com/VKCOM/vk-php-sdk/blob/cf5b8d84440256e1595d067ef255cbc8e372eb0d/src/VK/OAuth/User/DTO/TokensParams.php#L187) includes service_token unchanged when nonempty.
- [VKCOM PHP SDK User::getTokens](https://github.com/VKCOM/vk-php-sdk/blob/cf5b8d84440256e1595d067ef255cbc8e372eb0d/src/VK/OAuth/User/User.php#L78) sends those parameters by form POST to /oauth2/auth, matching Planly's placement/encoding.
- [VKCOM Web SDK exchangeCode](https://github.com/VKCOM/vkid-web-sdk/blob/8ff76cfe59ea72e370c4c6c3b40712ecfd43aadd/src/auth/auth.ts#L206) omits the service token in its browser implementation. That does not establish a confidential-server requirement to omit it.

No duplicated service_token, extra encoding or whitespace insertion was found in Planly. These SDKs establish implementation support, not current app/token/IP acceptance. Earlier official portal access was blocked; the restriction was respected. No third-party explanation is treated as causal evidence. An independent reviewer reached the same conclusion: ROOT_CAUSE_PROVEN=NO. Removing service_token, moving it into a URL, adding client_secret or rotating secrets has no demonstrated basis.

## Bounded implementation contract

The proven observability gap is that the current safe event cannot distinguish any descriptive words beyond the SERVICE_TOKEN parameter name. Add only optional `providerServiceTokenTerms` to existing authorization-code invalid-grant metadata, leaving all request fields and exact reason classifications intact.

Inspect at most the existing 4096-character description bound, only for PRESENT descriptions mentioning SERVICE_TOKEN. Return at most ten unique fixed enums in a stable order:

`INVALID`, `MISSING`, `REQUIRED`, `EXPIRED`, `REVOKED`, `IP`, `APPLICATION`, `CONFIDENTIAL`, `RESTRICTED`, `ALLOWLIST`.

These are lexical word-presence signals, **not provider-reported causes**. Negation, quotes and echoed parameters can also match. INVALID does not mean the provider proved the token invalid; IP does not mean an IP restriction caused rejection. Empty/unrecognized vocabulary yields no new field; another generic response can still leave the cause unknown. No raw words, values, IPs, URLs, identifiers, description or body are retained. The logger independently validates dense bounded arrays, enum values, description state and SERVICE_TOKEN mention, reconstructs only named fields and drops forged/malformed new data. Existing metadata remains compatible.

Plan: reproduce the missing signals with consumer-level RED tests; implement the fixed vocabulary and defensive logger; run focused/security checks and exact-head canonical CI/Self-host; publish a DRAFT PR and stop before merge/deploy. Existing OAuth request, PKCE, Origin/auth/state checks, scopes, grant validation, community validation, encrypted persistence, refresh and publishing remain unchanged. No schema/env/dependency/workflow changes.

## Verification and gates

- RED: new consumer-level tests yielded 9 expected missing-field failures; 6 existing omission/gating behaviors passed.
- GREEN: focused diagnostic/OAuth/Origin/route/crypto suite: 80 PASS / 0 FAIL / 0 SKIP. Existing exact invalid-grant expectations retain all assertions and fixtures, with one additive field for the service-token fixture.
- New checks cover private provider echoes, negative wording, duplicate/bounded terms, word boundaries, oversized/malformed descriptions, refresh/other-error exclusion and forged/sparse/oversized/non-array metadata.
- Local typecheck and scoped lint passed. Independent security review found no actionable issues and independently ran 62 focused checks: all passed, zero skips/failures.
- Fresh local build failed before application compilation: Turbopack rejects the existing node_modules junction pointing outside the worktree filesystem root. No dependency/build workaround or retry was used. Local build is BLOCKED, not PASS. Exact-head canonical CI/Self-host results are recorded on the PR; canonical CI supplies isolated PostgreSQL/Redis and the full test/build/lint gates.

ROOT_CAUSE_PROVEN: NO. This patch addresses evidence collection only. New real OAuth/provider requests, publications, Render/VK/env/secret changes, merge and deployment: NOT RUN. After a separate Owner-approved diagnostic release, observe one real Owner attempt and use its safe terms to choose the next read-only check; do not automatically infer or fix a cause.
