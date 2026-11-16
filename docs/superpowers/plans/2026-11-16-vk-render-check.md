# VK Render Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy an isolated owner-only verifier for Web54809575 and one permitted photo post.
**Architecture:** Built-in Node server, existing VK connector unchanged, in-memory OAuth, local durable one-shot signed permit controller.
**Tech Stack:** Node22.13+ built-ins, existing TypeScript connector via strip-types, node:test, GitHub Actions, Render free.
**Spec:** docs/superpowers/specs/2026-11-16-vk-render-check-design.md

## Global Constraints
App54809575/user815727447/community242095689 only. No production/main/NEWVPS edits, no paid resources, no DB/migration/worker startup, no provider retry, no previous marker reuse. Keys/tokens absent from Git/logs/DTO. Reuse original connector guards.

## Review Focus
- Replay/concurrency/restart: boot+grant-bound signature and local exclusive marker precede network.
- OAuth mix-up: session/state/expiry/returned-state/scopes/current users.get subject all required.
- Foreign targets/URLs: fixed target/content; connector HTTPS allowlist, no redirect.
- Diagnostics leakage: closed finite reason/stage only, no raw errors/URLs/token.
- Free Render restarts: fail closed; no token recovery/automatic new publication.

### Task1 — Verifier core and controller contracts
Files: experiments/vk-render-check/core.mjs, tests/vk-render-check.test.mjs.
- [x] Write tests for PKCE, state mismatch/replay/expiry, missing scopes, wrong identity, role denial, 1051, signatures, concurrency and no automatic send.
- [x] Watch RED before implementation.
- [x] Implement core by injecting network/time and importing unchanged connector.
- [x] Verify GREEN plus existing connector unit tests.

### Task2 — HTTP and local one-shot controller
Files: experiments/vk-render-check/server.mjs, page.mjs, controller.py, controller.test.py; tests/vk-render-http.test.mjs; fixture.png.
- [x] Write RED owner/Origin/session/callback/sanitization and local durable-claim tests.
- [x] Implement bounded POST bodies, secure owner cookie, safe pages, no automatic provider I/O at startup.
- [x] Verify loopback tests, Node syntax, controller tests; no live provider calls.

### Task3 — Remote validation and isolated deploy
Files: .github/workflows/vk-render-check.yml; service README and evidence.
- [ ] Independent review, fix concrete defects with RED→GREEN; exact commit/push/Draft PR.
- [ ] Confirm unit before isolated PG/Redis existing CI, new verifier CI, no failures/skips.
- [ ] Create new free Render service in approved My Workspace, branch pinned, autoDeploy OFF; no shared env/DB.
- [ ] Verify exact deployed source/health/public deny and unchanged production.
- [ ] Provide owner exact new callback/domain and secret entry step if missing; after config verify one fresh OAuth and safe stage results, then one locally claimed publication and receipt readback when available.

## Execution ledger
2026-11-16: source0710 isolated native worktree created; original dirty probe WIP preserved. Existing production2f13 autoDeployOFF verified. Owner approved separate Render approach and one publication; source changes remain isolated. Builder implementation choices (Node, memory-only tokens, signed local permit) enforce already agreed safety bounds without new product behavior.

Task1/2: RED19 core, RED6 HTTP, RED5 controller observed before implementation; GREEN32 new tests +80 original connector tests. Targeted eslint0errors/0warnings and diff-check passed. Numeric role diagnostic coercion and stale repeated-auth report each reproduced RED then fixed: nonnumeric role INVALID; only one OAuth start per boot. Ruling: use Node controller instead of proposed Python file so Ed25519 uses built-ins and adds no package/runtime dependencies. Windows local private dir requires explicit ACL verification; token lifetime20min/restarts fail closed. Final independent review in progress, no provider calls or new service yet.
