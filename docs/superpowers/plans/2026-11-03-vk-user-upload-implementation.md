# VK one-operation user-token upload implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare one owner-confirmed server upload using a transient Mini App user token, without saving credentials or publishing.

**Architecture:** A new isolated operation uses the existing top-level owner window handshake pattern. The server enforces same-origin admission and an atomic operation claim before two bounded permission/upload-address reads and one file upload. Token remains in request memory only.

**Tech Stack:** Next.js Node routes, TypeScript, browser ES modules, Node tests, Redis NX.

**Spec:** 2026-11-03-vk-publishing-grant-design.md

## Global constraints

- Fixed group 242095689; fixed server-generated PNG; no arbitrary image/URL input.
- Separate operation identifier; all existing markers retained. No database/credential persistence, OAuth refresh changes, saveWallPhoto, wall.post or queue enabling.
- Exact origin/source/nonce, 120-second handoff TTL, owner admission, explicit trusted confirmation, bounded JSON input and closed diagnostics. Redis claim contains no token and expires never.
- No external operation or deployment in this implementation phase.

## Review focus

- Wrong origin/source/replaced payload or expired handoff cannot transfer a token to the server.
- Anonymous/non-owner/CSRF/oversized requests cannot claim or call VK.
- Concurrent windows and unknown outcomes cannot cause repeated provider operations.
- Token and provider echo never enter output, URLs, logs, files, browser storage or persistence.
- Community management is checked server-side, independently of untrusted client scope declarations; wall publishing remains unproven because this test never calls wall.post.

## Task 1: Server operation (server implementer)

- [ ] Add failing tests for admission, body bounds, scope/token shape, one-shot claim, editor membership, upload URL validation, fixed image, unknown outcome and sanitized output.
- [ ] Implement server-only transient-token upload service and a separate route, reusing connector multipart transport where feasible; no dependencies added.
- [ ] Verify targeted tests and review the shared connector regression surface.

## Task 2: Window transport (browser implementer)

- [ ] Add failing tests for exact origin/source/nonce/TTL, consent, payload replacement, cancellation, duplicate/uncertain results and secret-free rendering.
- [ ] Add isolated public window modules/page and Mini App sender; preserve old flows. Coordinate a shared protocol module with server implementer.
- [ ] Verify deterministic tests and browser synthetic flow without provider calls.

## Task 3: Integration and evidence (root)

- [ ] Wire the new sender to closure-held token in controller and explicit UI button. Preserve old markers and update privacy copy to distinguish the new consent.
- [ ] Run focused regressions, static build, typecheck/lint and application build; independent review and fix findings.
- [ ] Commit/push source and inspect exact-head CI. Record SOURCE/CI separately from unchanged staging/provider state. Prepare concrete release proposal only after CI.
