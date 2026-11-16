# VK Web 54809575 — isolated Render verification

Owner approved the six-step Render test-service proposal in chat on 2026-11-16. This document records that scope; it is not permission to change existing production, merge, buy resources, or retry previous operations.

## Intent and approaches
Confirm fresh `wall photos` permission and, after identity/community checks, publish exactly one new neutral photo/text post to community 242095689. Owner selected a separate small Render service over restoring NEWVPS or changing old Render production. Use the free compute plan only. No scheduler, database, migrations, persistent credentials, or Lentaro startup.

## Design
Node built-ins HTTP server; fresh PKCE S256/state and secure owner cookie; fixed owned app54809575, expected VK user815727447, community242095689. Confidential service token enters only Render env. Token remains server memory, expires within20min, never returned/logged; no refresh/background-work claim. Show closed stage/reason, granted scopes, identity match, group role values and upload-server eligibility without an upload. Reuse existing `lib/server/connectors/vk.ts` unchanged for role/upload/save/owner_id/wall.post checks and diagnostics. No alternative OAuth app/token, relaxed role checks or API restriction bypass.

Public pages require an owner capability exchanged from URL fragment to a Secure/HttpOnly/SameSite=Lax cookie; remove fragment immediately. POST actions require exact configured Origin. Callback binds owner session+one-time state, rejects replay/expiry/duplicates, redirects to a query-free result. No app request/body/header/error-object logging. No input-controlled target, message, image or provider URL.

## One-shot publication
Browser has no publish button. A local controller holds an Ed25519 private key and a durable exclusive ATTEMPTED file outside Git, written and fsynced BEFORE issuing one publication permit. Render holds only its public key. Permit binds fixed operation, current server bootId and fresh grantId with short expiry. Server consumes the permit synchronously before await. Restart loses token and changes bootId, so old permit cannot run again; controller never issues another permit when local marker exists. No retries, no marker resets; uncertain outcome reconciled by receipt/readback only. Callback never uploads or posts. Local authorized controller can inspect sanitized state, publish once, and read back exact receipt.

## Acceptance and limits
Unit/contracts first (network injected, no real providers), then HTTP loopback tests, then existing isolated PostgreSQL/Redis regression CI because reused source remains unchanged. Independent review before release. New branch/Draft PR, exact-head green CI; new isolated Render service autoDeploy OFF. Missing VK service token/cabinet redirect/IP settings must be reported clearly, not guessed or bypassed. Owner alone completes VK consent. Success requires VK post receipt AND matching wall readback/photo+text; health200 or mocks are not provider proof.


## Evidence-driven amendment —16November
Fresh deployed checker confirmed explicit wall/photos and expected self identity, then VK omitted BOTH optional group role fields. Original strictrole check rejected before upload. Official VKCOM schema5.199 supports alternative positive groups.get filtereditor (admin OR editor). Minimal shared validator change: only joint property absence, after exact active target validation, permits ONE current-token groups.get request with filtereditor/extended0/count1000 and no user_id. Require well-shaped numeric unique IDs/count and positive exact target inclusion; partial page can prove presence but absence always denies, no pagination/retry. Explicit/partial/invalid rolefields never fall back. Upload/save/wall/one-shot checks remain unchanged. Expose only managementProof enum; provider7/15/1051 failures retain stage and deny. Existing deployedfa1d remains untouched until exact source CI and separate Owner deploy decision.
