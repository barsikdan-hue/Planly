# Phase 7A VK — approved OAuth and connector contract

Owner authorized autonomous implementation on 2026-10-07 after approving a narrow exception for rotating OAuth credentials. This supersedes the initial architecture stop in the [research report](../../verification/2026-10-07-phase7a-vk-contract.md). Actual app scopes/community and live readiness remain unproven until the separate secret/provider gates.

## Boundaries

Extend the existing SocialAccount/PostTarget/private-media/processor/scheduler/retry workflow. Telegram/MAX keep their env credentials. No new secret service, scheduler, infrastructure, Instagram, Analytics, AI, merge, deploy or live provider publication. Video is excluded because reliable supported readiness is not proven. JPEG/PNG and text are the VK implementation scope; application limits are conservative Planly limits, not claims of provider maxima.

## Credentials and OAuth

Static VK app credentials and a 32-byte random AES-256-GCM key stay in server env. PostgreSQL stores only an authenticated encrypted credential envelope: ciphertext, IV, tag, key version, expiry and account/provider metadata. Account/provider/purpose/version are authenticated as AAD; moving an envelope between accounts or purposes fails. Invalid/missing keys, tampered envelopes and unknown key versions fail closed. No token enters DTOs, frontend, logs, docs or source; tests use generated synthetic credentials.

Official VK ID authorization code flow uses PKCE S256, state, fixed registered redirect URI, confidential backend exchange and service token. Durable, short-lived, one-use authorization intents bind owner/account/community and encrypted verifier; callback requires the current matching authenticated owner and returned state/device_id. Required wall/photos scopes must be present in the grant. Validate community posting authority before storing credentials/CONNECTED state. Reconnect replaces only that VK account. Disconnect deletes its credentials and pending OAuth intents and sets it disconnected/disabled; Telegram/MAX are untouched.

## Refresh failure boundary

Use a dedicated PostgreSQL connection and account-specific advisory lock for all VK credential lifecycle operations; transaction locks protect credential/account reads and writes. Hold account serialization through refresh and successful encrypted-pair commit. Before external refresh, commit a durable UNCERTAIN marker while retaining the advisory lock. A crash, lost response or failed pair persistence leaves UNCERTAIN, so subsequent attempts cannot reuse the old refresh. Return sanitized AUTH diagnostics and require reconnect. No blind refresh retry. On confirmed refresh, atomically store the encrypted replacement pair/expiry and clear UNCERTAIN before releasing serialization. Concurrent workers reread the committed fresh pair. Account disable/deletion is rechecked before publishing.

## Connector and product integration

Use pinned API 5.199 as the researched baseline. VK publication receives the durable publication ID, VK account ID, canonical negative community wall ID, text and ordered private JPEG/PNG bytes. Text+photo uses official upload-server/save methods and typed attachment IDs; confirm every saved object/remote receipt. Restrict returned upload endpoints to HTTPS VK-controlled upload hosts, reject redirects and malformed/untrusted destinations before handing off private bytes. Never place access tokens in URLs. Use bounded transport deadlines.

Confirmed wall receipt yields owner-scoped remote ID and constructed VK wall URL. Keep durable publication claims and independent PostTarget outcomes. Stable guid is advisory; unknown mutation outcome is PERMANENT/AMBIGUOUS_DELIVERY with no blind resend. Explicit rate-limit response may use existing bounded temporary retry; AUTH requires reconnect, validation/permission/challenge errors are terminal as appropriate. Provider messages/request_params/raw exceptions never reach diagnostics.

Settings adds VK community/OAuth connect/reconnect/disconnect in the existing account card. Composer, preview, Library/queue contracts and provider mappings admit VK without changing existing recovery/owner lifecycle. Existing Publish Now and scheduling paths remain authoritative.

## Verification and gates

TDD for encryption binding/tamper, OAuth state/owner/one-use/scopes, concurrent refresh, uncertain persistence, disconnect, text/photo receipts, private-byte endpoint safety, errors/ambiguity, three-provider input and independent outcomes. Native PostgreSQL proves serialization; fixtures prove provider transport contracts, never live readiness. Run protected/full native suite with 0 FAIL/0 SKIP, typecheck/lint/build, Docker/Self-host, security review and exact-head PR CI.

Real setup stops at READY_FOR_OWNER_SECRET_GATE — VK with explicit app/scopes/redirect/community/env instructions. Owner configures secrets privately. No live post or deploy follows automatically. Completed implementation/CI may be READY_FOR_OWNER_MERGE_GATE — PHASE7A VK while live permission/readiness remains separately unproven.
