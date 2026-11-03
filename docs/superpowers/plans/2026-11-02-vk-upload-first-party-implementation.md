# VK First-party Upload Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Scope is approved source implementation, not deployment or provider execution.

**Goal:** Perform existing owner-only upload diagnostic from a top-level Planly window without relying on iframe cookies.

**Architecture:** Strict origin/source/nonce handoff and bounded immutable payload; existing owner admission and upload-only POST run in first-party context after a separate trusted confirmation. Keep all server authorization and one-shot markers.

**Tech Stack:** Existing Next.js, native modules, postMessage, Web Locks, node:test, Playwright synthetic browser fixtures.

**Spec:** 2026-11-02-vk-upload-first-party-design.md (Owner approved).

## Global constraints

Fixed staging origin, group242095689, nonce128+bits,120s TTL, one frozen payload/window. No session/VK token transfer, URL payload, marker reset, cookie changes, save or post. Denials cannot claim/upload. Server NX is authoritative across partitioned storage.

## Review focus

Wrong window/origin/nonce; late admission after reset/expiry; payload replacement after preview; partitioned storage/reload ambiguity; popup blocked/opener separation.

### Task 1: Protocol and window receiver

- [x] Add failing tests for handshake identity, TTL, admission denials, immutable payload, explicit confirmation and one terminal result.
- [x] Implement public/vk-upload-window-core.mjs with strict payload/status protocol; retain no token/state after termination.
- [x] Add receiver page and public window binding: frame-ancestors none, top-level/opener checks, CSP, fresh admission, locks, unchanged browser/server markers and upload-only POST.
- [x] Verify tests including denied admission and no automatic POST.

### Task 2: Mini App handoff

- [x] Add failing sender tests for blocked/closed popup, wrong message identity, cancellation, no sensitive transfer, no duplicate/late payload.
- [x] Implement first-party-upload.mjs; open fixed window synchronously on click, refresh existing control proof via controller, send only validated URL/image/group/nonce; no claim on handshake.
- [x] Wire optional controller transport and Mini App button while retaining old one-shot fences and all other flows.
- [x] Verify cancellation and existing diagnostic regressions.

### Task 3: Verification and delivery

- [x] Synthetic browser popup test with unavailable iframe cookies, real trusted confirmation, denial/expiry and embedding defense; no provider access.
- [x] Type/lint/static/Next build and independent review.
- [ ] Exact-head CI, source commit/push and Draft PR update.
- [x] Record source/runtime/provider boundaries. Build/deploy/live transfer/upload remain Owner gates.
