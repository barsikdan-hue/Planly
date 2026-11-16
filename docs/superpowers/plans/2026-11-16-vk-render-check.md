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

Independent review:32new tests rerun, no remaining blockers; parent-directory fsync implemented on POSIX, Windows limitation documented. DraftPR86/sourceb40a848 standalone GitHub check43820997349 succeeded. Existing audit workflow did NOT trigger because its pull_request base filter lacked the0710 branch; extend only that filter to include the actual stacked PR base, preserving all jobs/checks/guards. No test skips or relaxed assertions. This is required to obtain the specified ordered unit→isolated DB evidence on this source.


### Scoped repair — observed optional role omission
Root cause of the first local stop is proven: current token wall/photos and self identity valid, exact active group valid, both optional role properties absent, strict property check denies. Why VK omits them is UNVERIFIED; do not change scopes/client/provider constraints. Primary source: VKCOM/vk-api-schema groups/methods.json and groups/objects.json version5.199, fetched live16November.
- [x] RED28 role-proof cases +2 checker transport cases before implementation; existing explicit-deny tests retained.
- [x] Only joint absence may use one server-filtered current-user editor membership proof; no explicit user_id, no missing-target permission inference; roles proof safe enum.
- [x] Independent reviewer fetched primaryschema and reran62focusedcases,0fail0skip; no blocking findings.
- [ ] Exact-head unit→isolatedPG/Redis→full/typecheck/lint/build CI and DraftPR update.
- [ ] Separate exact-SHA Owner deploy decision, then ONE fresh OAuth (previous token erased on failure); publish only if all real checks pass and local attempt marker remains absent.
CurrentRender fa1d is intentionally unchanged while preparing this repair. No new provider or publication attempt has occurred.

### Offline preparation while awaiting VK support
Actual db6ec6e grant/role/upload-server checks succeeded. One locally claimed upload returned200 but the unchanged receipt guard stopped before save/post. Raw response was not retained; exact root cause is NOT_PROVEN. Owner sent support request and asked what can be done now. Current operation stays consumed; no deploy/newOAuth/upload/post.
- [x] Verify local PNGCRC/pixels/hash and unchanged multipart bytes/header/length/part count on loopback only; record runtime-specific closing-CRLF observation without inventing a VK requirement.
- [x] RED18 classifier cases and RED1 verifier observation/terminal/no-retry case; add finite field-shape observer to existing bounded bytes, preserving response and acceptance checks.
- [ ] Independent reviewer and exact-head CI on Render-matching Node22.13, unit before isolatedPG/Redis/full regression.
- [ ] Report prepared source/runtime wire facts, preserve previous marker, no speculative production fix or provider retry; await support/new explicit operation decision.
