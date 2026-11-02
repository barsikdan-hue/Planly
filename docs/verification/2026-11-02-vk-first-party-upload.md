# VK first-party upload window — source verification

## Scope and authority

Owner approved approach1 and source implementation from the design on2November. Base5099baf, branch codex/vk-miniapp-probe-20261029, existing DraftPR79. Known unrelated WIP preserved. No new rollout/provider permission inferred.

Owner observed top-level OWNER_SESSION_RECOGNIZED and iframe OWNER_SESSION_REQUIRED. Source cookie SameSite=Lax explains that difference. Cookie/auth/provider gate remain unchanged.

## Implementation

Mini App opens a fixed Planly window synchronously on click, refreshes existing VK control proof and passes only bounded URL/PNG/group. Popup checks first-party owner admission, freezes one validated payload and shows a preview. A separate trusted click, fresh source-window challenge/ACK and fresh owner admission are required before existing upload-only POST. No save/photo post or token export.

Origin/window/128-bit nonce,120s TTL,5s fresh confirmation ACK, cancellation/reset/pagehide, source navigation, payload replacement and repeated/uncertain attempt fences are enforced. Receiver page denies embedding through CSP/XFO and top-level check. Browser marker key and final server NX remain unchanged; differing storage partitions cannot bypass the server fence. No automatic resume after login/reload.

Ruling: require a fresh source ACK immediately before upload because the opener WindowProxy can remain alive after source navigation. A failed ACK cancels before any upload. Tests reproduced missing-ACK dispatch RED before the correction and GREEN after.

Ruling: expiry after dispatch reports uncertain outcome, rather than saying upload never started. Markers remain consumed; no retry.

## Local evidence

-69 scoped diagnostic/relay tests PASS, including13new protocol/document/sender cases. New feature tests first observed RED before implementation; stale/uncertain edge regressions also observed RED/GREEN.
- Full synthetic browser PASS: all origins intercepted, iframe cookie admission401, popup admission200, no POST before trusted confirmation, programmatic click denied, exactly1mock POST, repeat blocked, source navigation after preview blocks upload. Provider calls0. Cookie is a synthetic fixture, never a real session.
- TypeScript, targeted lint, standalone static build and full Next build PASS. New page appears in compiled route manifest.
- Independent full source and challenge-delta reviews: no actionable findings.

## Limits and next gate

Actual VK popup/opener policy, actual owner admission in that popup and provider upload remain NOT_VERIFIED. Source is not runtime/provider proof. No staging file/container/env/migration/marker/provider changes performed. Exact-head Linux CI and reviewed artifacts must precede separate build/deploy gates; first live signed-URL transfer and upload require a concrete counted Owner gate.
