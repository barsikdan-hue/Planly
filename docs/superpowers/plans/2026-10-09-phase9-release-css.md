# Phase 9 release CSS verification plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject built/served release CSS missing Phase 9 and investigate the stale production artifact without guessing a cache fix.

**Architecture:** Extend the existing emitted-root-stylesheet verifier with Phase 9 checks and artifact hashes. Reuse a dependency-free AST contract in isolated Self-host HTTP verification. An isolated Linux build experiment compares old CSS, updated CSS with restored cache, and current output. Runtime, CSS source, scheduling, API, DB, environment and hosting configuration remain unchanged.

**Tech Stack:** Next 16.3.4, PostCSS, Node 22.13 CI, Docker Self-host, browser viewport verification.

**Spec:** Owner's CSS/build task, production SHA `5a321c99ad7130c1a9d8ec890e496a8304a458a7`.

## Constraints and proven facts

- No merge/deploy/env/infra/provider actions.
- Current production stylesheet equals the artifact built from pre-Phase-9 CSS byte-for-byte.
- Fresh Self-host artifact has Phase 9; local warm and restored-cache builds update correctly.
- Underlying Render loss boundary is NOT PROVEN. Do not alter compiler/cache settings on this evidence.
- Proven checker defect: `verify-analytics-build.mjs` accepts the actual stale production CSS because its checks cover analytics only.

## Task 1 — Repair the proven artifact acceptance gap

- [ ] Add failing tests requiring Phase 9 declarations and mobile rules in emitted route CSS, including missing/commented/orphan and incorrect-declaration cases.
- [ ] Observe RED on the current checker, including the actual stale production artifact.
- [ ] Extract a shared AST contract into `scripts/release-css-contract.mjs`; extend `scripts/verify-analytics-build.mjs` without weakening analytics checks/path validation.
- [ ] Add safe emitted asset SHA256 metadata; observe GREEN on targeted tests and rejection of stale production CSS.

## Task 2 — Complete build/package/HTTP evidence

- [ ] Extend `tests/self-host-smoke.mjs` to fetch actual authenticated root stylesheet links, inspect served CSS through the container's PostCSS parser, and check the shared contract.
- [ ] Add `scripts/diagnose-css-cache.mjs` plus a CI step to build old CSS in an ignored sandbox, restore only its cache, update CSS and compare emitted selectors/hashes. This is diagnostic, not a runtime cache change.
- [ ] Full suite, typecheck, lint and build; draft PR; exact-head native CI and Self-host.

## Task 3 — Browser and independent review

- [ ] Inspect actual built CSS in isolated browser UI at 1366x768 and 390x844, including long text/media. Distinguish fixture UI from production.
- [ ] Independent review of scoped diff/evidence; address proven defects only.
- [ ] Report root cause UNKNOWN if Linux experiment cannot reproduce; retain draft/no merge gate and explain the missing Render artifact evidence.
