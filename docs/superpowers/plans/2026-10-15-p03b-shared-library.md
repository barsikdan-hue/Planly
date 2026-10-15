# P03-B Shared Content Library Implementation Plan

> **For agentic workers:** Use Superpowers TDD and independent read-only review. This task is approved for implementation; proceed without an additional plan approval round.

**Goal:** ADMIN explicitly publishes READY materials; active colleagues copy selected materials, including ordered private media bytes, into independent personal READY items.

**Architecture:** Add explicit share records referencing existing private LibraryItem rows, plus durable owner-scoped copy receipts. Never change private list/media authorization. Lock the authenticated actor, sorted source rows and media before bounded internal storage reads; create new private keys/assets and compensate written objects on transactional failure. Serialize share/unshare/edit/delete on source rows. Existing copies have no cascading source dependency.

**Tech Stack:** Existing Next/React, PostgreSQL/Drizzle, private S3-compatible storage, native tests and Playwright.

**Spec:** Owner P03-B request; Issue #54; PR #41; docs/superpowers/specs/2026-10-14-p01-multiuser-foundation-design.md.

## Global constraints

- No merge/deploy/production migration/secrets/infra/provider sends.
- Private LibraryItem/Media ownership remains unchanged; published previews disclose only selected media.
- No Post/PostTarget/Schedule/Queue creation; no new dependency or service.
- One batch is atomic (1–20 unique selected shares); same user/key/input replays, different input conflicts, deleted results return 410.
- Share reflects current READY source; unshare or source deletion hides it. A previously committed copy is independent.

## Review focus

- Storage writes with uncertain responses: register destination keys before PUT and compensate on failure; cleanup failure must be explicit and sanitized.
- Malformed source/media relations: reject the whole item rather than expose or silently omit a foreign attachment.
- Concurrent mutation: one source lock boundary for edit/delete/unshare/copy; deterministic ordering for multiple selections.
- Delayed UI responses/account replacement: abort on unmount and keep request state scoped to owner lifetime.
- Retry after lost response/unshare/deleted destination: durable receipt checked first without generating another copy.

### Task 1: Backend publication and copy boundary

**Files:** db/schema.ts, drizzle additive migration+snapshot, lib/contracts/shared-library.ts, lib/server/shared-library.ts, app/api/shared-library/**, app/api/admin/shared-library/**, tests/shared-library.integration.test.ts.

**Interfaces:** GET /api/shared-library returns `{items: SharedLibraryItemDto[]}` with id/title/text/updatedAt/media previews (no private IDs). ADMIN GET /api/admin/shared-library returns `{sourceIds:string[]}`; POST /api/admin/shared-library/[id] strict `{shared:boolean}` where id is owned private source. POST /api/shared-library/copy strict `{ids:string[]}`, UUID Idempotency-Key returns `{items:LibraryItemDto[]}`. Shared DTO media: `{name,mimeType,previewUrl}` in original order.

- [ ] Write native ADMIN/A/B session tests for missing feature; observe RED.
- [ ] Add minimal share/receipt schema and generate migration; implement actor recheck, ownership, READY and strict API validation.
- [ ] Implement bounded private byte copies with checksum verification, new USER-owned IDs/keys, atomic batch receipts and compensation.
- [ ] GREEN: privacy, lifecycle, image/video/order, retry/concurrency, source changes, corrupt relations, rollback and no publication creation.

### Task 2: Existing library UI

**Files:** components/planner/content-library.tsx, components/planner/shared-library.tsx, components/planner/app.tsx, tests/shared-library-ui.test.mjs, existing lifecycle loader.

**Interfaces:** SharedLibrary onCopied callback refreshes personal bootstrap through the existing owner lifecycle. ADMIN share controls only apply to own READY items. Mine/Shared buttons remain within Prepared content; selected copies require explicit click, retain key on ambiguous failure and require new intent after success.

- [ ] Write RED UI cases for visibility, explicit selection, retry identity and stale-response disposal.
- [ ] Add simple Mine/Shared choice, shared title/text/previews, individual and selected-copy actions, ADMIN share/unshare controls.
- [ ] GREEN existing Library/Composer/Swipe UI regression and focused new cases.

### Task 3: Runtime verification and delivery

**Files:** tests/shared-library-http-smoke.mjs, tests/e2e/shared-library.spec.ts, .github/workflows/ci.yml, .github/workflows/self-host.yml, docs/verification/2026-10-15-p03b-shared-library.md.

- [ ] Compiled HTTP RED then GREEN using real sessions and private loopback storage; desktop/mobile real backend E2E.
- [ ] Targeted/full native, migration drift/apply, typecheck/lint/build, compiled HTTP and browser checks. Serialize shared DB suites.
- [ ] Independent read-only Critic; fix proven defects and rerun affected checks.
- [ ] Push separate branch, create/attach Draft PR, verify exact source-HEAD CI and Docker Self-host; record synthetic merge mapping when applicable.
- [ ] Report limits and stop at owner review gate.
