# Harness DevEx implementation plan

> **For agentic workers:** use superpowers:executing-plans for the pilot, one independent read-only final Critic, and verification-before-completion. No milestone expansion.

**Goal:** make tool routing and autonomous diagnosis permanent and add a reproducible browser pilot of existing Planly UI without server/provider side effects.

**Architecture:** preserve product runtime; mount the real PlannerApp/CSS in a separate loopback Vite fixture, intercept every API with synthetic data and block external traffic. Playwright Test exercises desktop/mobile; deterministic CI retains serial native database tests. CLI/profile tools are installed separately from repository dependencies.

**Tech Stack:** existing React/Next/Vite, pnpm 11.25.0, pinned Playwright Test/Chromium, existing GitHub/Render connectors.

**Spec:** Owner-approved `PLANLY_CODEX_MASTER_HARNESS.md`, SHA256 recorded in verification report; source remains in Owner Downloads, no repository product phase starts.

## Constraints / review focus

- No merge/deploy, provider sends, production content, secrets/infra, paid inference or agentic cloud activation.
- Preserve existing `pnpm test` and serial shared PostgreSQL/Redis checks.
- Fixtures must exercise real components, not a replacement UI; unexpected API and remote requests must fail.
- Failed assertions cannot be weakened; controlled 503 must have explicit expected evidence.
- Tools must return real versions/calls, not install intentions; blocked UI/auth documented and independent work continues.

## Tasks

- [ ] Verify source/main/PR/CI/runtime, install inventory and official sources; record baseline timings and limitations.
- [ ] Install missing trusted tools only; verify help/protocol/browser safely. Do not duplicate working plugins or grant new global access.
- [ ] Add compact routing/autonomous-loop AGENTS rule plus three distinct UI/CI/API examples and inactive CI Doctor design.
- [ ] Pin Playwright in package/lock; preserve all existing lock resolutions. Write browser scenarios before fixture; observe missing-harness RED, implement minimal isolated fixture, run desktop/mobile GREEN.
- [ ] Prove controlled bootstrap503→visible error→explicit reload recovery; retain screenshots/trace outside committed production source. Confirm no real API/provider traffic.
- [ ] Run relevant existing tests/typecheck/lint/build and deterministic browser CI; independent read-only Critic, fix proven defects, repeat affected checks.
- [ ] Push separate branch/PR, inspect actual head/CI and leave Owner merge/deploy gate. Document exact evidence, cost limits, blockers and next safe action.

## Rulings / evidence ledger

- No brainstorming: Owner already specifies bounded DevEx design and exclusions.
- Clone baseline main separately: existing #37/#38 branches stay untouched.
- Browser fixture bypasses server authentication only in tests/e2e; no product route or auth change. Production bootstrap is excluded because it performs catch-up sends.
- pnpm add metadata timeout followed by offline missing-time is an installation-layer failure, not a product regression. Diagnose official registry/cache behavior without changing app dependency ranges or weakening supply-chain checks.
