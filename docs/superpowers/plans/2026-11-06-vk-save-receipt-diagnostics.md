# VK saved-photo diagnostics Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this single bounded task; request independent review before delivery.

**Goal:** Expose the closed reason for a saved-photo rejection without changing acceptance or sending another operation.

**Architecture:** Keep the existing publisher and Mini App. Internally classify the existing saved-response guard; return only a fixed enum and map it to fixed UI text.

**Tech Stack:** Existing JavaScript modules, Node test runner, intercepted Playwright, guarded GitHub CI.

**Spec:** docs/verification/2026-11-06-vk-save-receipt-diagnostics.md

## Global Constraints

No guard relaxation; no new operation IDs/marker reset, retry, upload/save/post, deployment, secrets/config/infra/schema/worker/main/production changes. No raw response/key/identity/URL/token in diagnostics/storage/logs. Existing consumed operation remains terminal.

## Review Focus

Missing uploader proof and foreign owner must remain distinct denials. access_key presence still blocks. Cancellation stays terminal. Provider-thrown fields cannot forge diagnostics. Browser UI/storage cannot reveal private payload.

## Task: closed rejection reason

- [x] Add rejection/privacy/spoofing fixtures to tests/vk-new-post-proof.test.mjs and observe RED for missing reason.
- [x] Add internal closed classification in experiments/vk-miniapp-probe/single-photo-test.mjs; preserve decision order/accepted set; observe GREEN.
- [x] Map reasons in experiments/vk-miniapp-probe/main.mjs; extend tests/vk-receipt-browser.mjs with intercepted saved-response rejection and zero posts/private rendering/storage.
- [x] Run targeted unit, combined isolated-unit runner, targeted lint/static build and intercepted browser checks.
- [ ] Independent read-only Critic; fix concrete findings; commit/push Draft PR stacked on d297890. Verify unit-before-disposable-PG/Redis exact-source CI and report actual boundaries. Do not deploy or send.

Ruling: include codex/vk-firstparty-receipt-20261106 as an exact additional PRbase in vk-audit.yml, as requested by Critic; otherwise the planned CIgate would never run. No jobs/permissions/services/safety ordering were changed. Product review was clear. Local468unit, typecheck/lint/static build and three intercepted browser scenarios passed; committed CI pending.
