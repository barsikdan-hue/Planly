# Phase 5 Content Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-backed prepared-content library that stays independent from Posts until the owner explicitly starts and successfully creates a publication from a library item.

**Architecture:** Introduce dedicated `library_items` persistence and CRUD, reuse existing `media_assets`, and keep the current Post/publication stack as the only publication path. Library-to-Post conversion is an atomic extension of existing Post creation: it records provenance, marks the library item `USED`, and preserves existing idempotency/queue behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, PostgreSQL, Drizzle ORM, Zod, Node test runner, existing Planly client/API patterns.

**Spec:** `docs/superpowers/specs/2026-10-04-content-library-design.md`

## Global Constraints

- A LibraryItem is not a Post and must not enter PostTarget/publication/scheduler/provider logic until explicit conversion.
- New library items always start `READY`; client code may request only `READY` or `ARCHIVED` on update; only the server may set `USED`.
- Reuse existing `media_assets`; never duplicate media bytes.
- One library item may create at most one first-class source Post; further variants use existing Post duplication.
- Preserve existing `/api/posts` publication path, Post idempotency, queue reconciliation, Telegram/MAX behavior and Composer recovery.
- Preserve the existing `#content` hash; only the visible navigation label changes to `Библиотека`.
- Do not add AI, swipe/reject, categories/tags, automatic slots, analytics, networks, scheduler redesign or external services.
- Keep bugfix/refactor work limited to what is directly required by this feature.
- Merge, production deployment and migrations on production remain owner gates.

## Review Focus

1. **Lost response during Library → Post conversion:** retry must resolve the same Post and keep one `USED` source item, never create a duplicate.
2. **Concurrent conversion vs archive/update/delete:** row locking must yield one deterministic winner with no partial state or second source Post.
3. **Media deletion while referenced only by Library:** delete must return the existing in-use conflict behavior and preserve the asset.
4. **Recovered Composer draft from a Library item:** source provenance must survive editor recovery/pending creation so the eventual first save still marks the correct item `USED`.
5. **USED item editing:** editing the library copy must not mutate the source Post, clear provenance, or reopen conversion.

---

## File Structure

### New focused files

- `lib/contracts/library.ts` — LibraryItem schemas/types only.
- `lib/server/library-items.ts` — owner-scoped Library CRUD, media relation validation/order, row-lock helpers and source-Post lookup.
- `app/api/library-items/route.ts` — list/create API.
- `app/api/library-items/[id]/route.ts` — update/delete API.
- `components/planner/content-library.tsx` — top-level `Заготовки | Публикации` screen and Library item editor/cards.
- `tests/library-contract.test.ts` — Zod/library contract tests.
- `tests/library-items.integration.test.ts` — persistence/ownership/media/status tests.
- `tests/library-conversion.integration.test.ts` — atomic conversion/race/idempotency tests.
- `tests/content-library-ui.test.mjs` — focused UI/navigation/Composer-prefill tests using existing test-loader patterns.

### Existing files modified

- `db/schema.ts` — enum/tables/join/provenance column.
- `drizzle/0004_*.sql`, `drizzle/meta/*` — generated forward migration and metadata.
- `lib/contracts/planner.ts` — create-only Post request wrapper with optional source-library ID; mutable `SavePostInput` stays unchanged.
- `lib/server/posts.ts` — optional source-aware create transaction; no Library CRUD.
- `lib/server/post-idempotency.ts` — include source provenance in create hash when present.
- `lib/server/media.ts` — treat `library_item_media` as an in-use reference.
- `app/api/media/[id]/route.ts` — keep a safe 409 message for media attached to Post or Library.
- `app/api/posts/route.ts` — parse create-only source field and pass it to `createPost`.
- `app/api/bootstrap/route.ts` — include `libraryItems` in the single snapshot.
- `lib/client/planly-api.ts` — library CRUD helpers and create-Post provenance transport.
- `lib/client/pending-creation.ts` — persist/replay source-library provenance with the durable create request.
- `lib/client/editor-recovery.ts` — include source-library provenance in recovered unsaved Composer state.
- `lib/planner.ts` — transient Composer source field and helper for prefilling from a Library item; no server publication semantics added.
- `components/planner/library.tsx` — rename/reuse current Posts view as Publications; keep `MediaLibrary` behavior.
- `components/planner/app.tsx` — snapshot state, navigation label, library CRUD handlers and Library → Composer wiring.
- `app/globals.css` — minimal styles for Library tabs/cards/editor using existing visual language.
- `tests/api-contract.test.ts`, `tests/media.integration.test.ts`, `tests/editor-recovery*.test.mjs`, `tests/pending-creation.test.ts`, `tests/planner-navigation*.test.*` — extend existing regression coverage where the modified shared path already has tests.

---

### Task 1: Database model and Library contracts

**Files:**
- Modify: `db/schema.ts`
- Create: `lib/contracts/library.ts`
- Create: `tests/library-contract.test.ts`
- Modify: `tests/db-schema.test.ts`
- Create: generated `drizzle/0004_*.sql`
- Modify/Create: generated `drizzle/meta/*`

**Interfaces:**
- Produces `libraryItemStatusEnum`, `libraryItems`, `libraryItemMedia`, and nullable `posts.sourceLibraryItemId` with `ON DELETE SET NULL` and uniqueness for non-null provenance.
- Produces `CreateLibraryItemInput`, `UpdateLibraryItemInput`, `LibraryItemDto`, `createLibraryItemInputSchema`, `updateLibraryItemInputSchema` from `lib/contracts/library.ts`.
- `CreateLibraryItemInput`: `{ title?: string | null; text: string; mediaIds: string[] }` and server-created status is always `READY`.
- `UpdateLibraryItemInput`: full replacement `{ title?: string | null; text: string; status: 'READY' | 'ARCHIVED'; mediaIds: string[] }`; `USED` is not accepted from the client.

- [ ] **Step 1: Write failing contract/schema tests**

Add tests asserting:
- text-only, media-only and text+media inputs parse;
- empty content fails;
- title >200, text >20,000, >20 media IDs and duplicate media IDs fail;
- update accepts only `READY | ARCHIVED`, never `USED`;
- schema exports contain Library tables and nullable source provenance on Posts.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- tests/library-contract.test.ts tests/db-schema.test.ts`

Expected: FAIL because library contracts/schema do not exist.

- [ ] **Step 3: Implement contracts and Drizzle schema minimally**

Create the exact interfaces above. `library_items.body_text` is non-null text, `library_item_media.position` preserves order, and `posts.source_library_item_id` points to `library_items.id` with `ON DELETE SET NULL`.

- [ ] **Step 4: Generate migration and verify schema tests GREEN**

Run:
- `pnpm db:generate`
- `pnpm test -- tests/library-contract.test.ts tests/db-schema.test.ts`

Expected: generated migration after `0003`; focused tests PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add content library schema`

---

### Task 2: Owner-scoped Library CRUD, API, bootstrap and media safety

**Files:**
- Create: `lib/server/library-items.ts`
- Create: `app/api/library-items/route.ts`
- Create: `app/api/library-items/[id]/route.ts`
- Modify: `app/api/bootstrap/route.ts`
- Modify: `lib/server/media.ts`
- Modify: `app/api/media/[id]/route.ts`
- Create: `tests/library-items.integration.test.ts`
- Modify: `tests/api-contract.test.ts`
- Modify: `tests/media.integration.test.ts`

**Interfaces:**
- Produces `listLibraryItems(userId: string): Promise<LibraryItemDto[]>`.
- Produces `createLibraryItem(userId: string, raw: CreateLibraryItemInput): Promise<LibraryItemDto>`.
- Produces `updateLibraryItem(userId: string, id: string, raw: UpdateLibraryItemInput): Promise<LibraryItemDto>`.
- Produces `deleteLibraryItem(userId: string, id: string): Promise<void>`.
- Internal server helper(s) may expose a transaction-scoped owner row lock and source-Post lookup for Task 3, but Library CRUD remains in this module.
- `/api/bootstrap` adds `libraryItems` to the existing snapshot.

- [ ] **Step 1: Write failing CRUD/ownership/media tests**

Cover:
- create/list order latest-updated first;
- update title/text/media and archive/restore READY item;
- editing a server-`USED` item changes content but keeps `USED`;
- owner/media ownership enforcement and missing IDs do not partially write;
- media order persists;
- permanent Library delete leaves media bytes/rows intact;
- foreign/missing item returns non-leaking not-found behavior;
- media delete is 409 when referenced only by `library_item_media`;
- bootstrap contains `libraryItems`.

Include Review Focus #3 and #5 here.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- tests/library-items.integration.test.ts tests/api-contract.test.ts tests/media.integration.test.ts`

Expected: FAIL on missing Library server/API behavior.

- [ ] **Step 3: Implement minimal CRUD/API/bootstrap/media-reference logic**

Use owner-scoped queries everywhere. In `deleteMediaAsset`, reject deletion when either `post_media` or `library_item_media` contains the asset; do not delete attached bytes. Keep the route response safe and generic (`Media is attached to content` or equivalent), status 409.

- [ ] **Step 4: Run focused tests and migration apply check**

Run:
- `pnpm test -- tests/library-items.integration.test.ts tests/api-contract.test.ts tests/media.integration.test.ts`
- `pnpm db:migrate` against the test/CI database used by the project harness.

Expected: focused tests PASS; migration applies from previous schema without destructive changes.

- [ ] **Step 5: Commit**

Commit message: `feat: add content library CRUD`

---

### Task 3: Atomic Library → Post conversion and idempotency

**Files:**
- Modify: `lib/contracts/planner.ts`
- Modify: `lib/server/posts.ts`
- Modify: `lib/server/post-idempotency.ts`
- Modify: `app/api/posts/route.ts`
- Create: `tests/library-conversion.integration.test.ts`
- Modify: `tests/post-idempotency.integration.test.ts`
- Modify: `tests/posts.integration.test.ts`

**Interfaces:**
- Add `createPostRequestSchema = savePostInputSchema.extend({ sourceLibraryItemId: z.string().min(1).max(200).optional() })` and `CreatePostRequest` only for POST creation.
- Keep `SavePostInput` unchanged for PATCH and publication content.
- Extend `PostPersistenceOptions` with `sourceLibraryItemId?: string`.
- Extend `creationInputHash(input: SavePostInput, sourceLibraryItemId?: string): string` so the source ID participates in idempotency identity when present; calls without a source retain existing behavior.
- `createPost(...)` remains the single Post creation/publication-reconciliation path.

- [ ] **Step 1: Write failing conversion/idempotency/race tests**

Assert:
- READY source + successful create yields exactly one Post and atomically changes source to USED;
- merely reading/opening a Library item creates no Post and leaves READY;
- ARCHIVED source cannot convert;
- a failed Post create leaves source READY;
- repeated request with the same idempotency key/source returns the same Post;
- same key with changed source/content conflicts as current idempotency policy requires;
- repeated conversion of an already USED source resolves the existing source Post instead of creating another;
- two concurrent conversions of one source result in one source Post;
- concurrent archive/delete/update versus conversion serializes on the same library row and leaves no partial state;
- ordinary Post creation without `sourceLibraryItemId` remains unchanged.

Include Review Focus #1 and #2 here.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- tests/library-conversion.integration.test.ts tests/post-idempotency.integration.test.ts tests/posts.integration.test.ts`

Expected: FAIL on missing source-aware Post create behavior.

- [ ] **Step 3: Implement source-aware creation inside the existing transaction**

Inside the current `createPost` transaction:
- lock/validate the owned source Library row when `sourceLibraryItemId` exists;
- resolve an existing `posts.sourceLibraryItemId` first for retries/USED source;
- reject ARCHIVED source;
- include source ID in the Post insert and creation hash;
- after successful Post/targets/media/publication reconciliation, set the source to `USED` in the same transaction;
- preserve post-commit queue mirroring exactly once through the current `mirrorQueueBestEffort` path.

Do not create a second publication service or duplicate the existing Post persistence body.

- [ ] **Step 4: Run focused conversion tests GREEN**

Run: `pnpm test -- tests/library-conversion.integration.test.ts tests/post-idempotency.integration.test.ts tests/posts.integration.test.ts`

Expected: PASS, including concurrent/retry controls.

- [ ] **Step 5: Commit**

Commit message: `feat: convert library items to posts atomically`

---

### Task 4: Client transport and Composer recovery provenance

**Files:**
- Modify: `lib/client/planly-api.ts`
- Modify: `lib/client/pending-creation.ts`
- Modify: `lib/client/editor-recovery.ts`
- Modify: `lib/planner.ts`
- Modify: `tests/planly-api.test.ts`
- Modify: `tests/pending-creation.test.ts`
- Modify: `tests/editor-recovery.test.mjs`
- Modify: `tests/editor-recovery-lifecycle.test.mjs`

**Interfaces:**
- `PlannerSnapshot` adds `libraryItems: LibraryItemDto[]`.
- Add `load/create/update/delete` Library API helpers matching Task 2 endpoints.
- Extend client `savePost` creation transport with optional `sourceLibraryItemId`; PATCH never sends or mutates provenance.
- Add transient `sourceLibraryItemId?: string | null` to the client-side unsaved Composer/Post shape only as needed to carry conversion provenance through current editor recovery.
- `blankPost()` initializes it to `null`.
- Existing editor recovery/pending schemas remain backward-compatible with old stored records by making the field optional; do not invalidate existing v1 session data merely because it lacks provenance.

- [ ] **Step 1: Write failing client/recovery tests**

Assert:
- POST transport includes source ID only for create; PATCH omits it;
- Library CRUD helpers call exact endpoints/methods;
- editor recovery round-trip retains `sourceLibraryItemId` when present and still accepts old records without it;
- pending creation stores source provenance before dispatch and reuses it on retry;
- lost response retry sends the same idempotency key and same source ID;
- replacing Composer with an ordinary new/edit/duplicate flow clears source provenance.

Include Review Focus #4 here.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- tests/planly-api.test.ts tests/pending-creation.test.ts tests/editor-recovery.test.mjs tests/editor-recovery-lifecycle.test.mjs`

Expected: FAIL because source provenance is not transported/recovered.

- [ ] **Step 3: Implement minimal client/recovery support**

Keep server persistence authoritative for Library itself. Only the unsaved Composer conversion provenance uses the existing session recovery/pending-create mechanism.

- [ ] **Step 4: Run focused tests GREEN**

Run: `pnpm test -- tests/planly-api.test.ts tests/pending-creation.test.ts tests/editor-recovery.test.mjs tests/editor-recovery-lifecycle.test.mjs`

Expected: PASS with old recovery records still valid.

- [ ] **Step 5: Commit**

Commit message: `feat: preserve library source through composer recovery`

---

### Task 5: Library UI, navigation and Library → Composer flow

**Files:**
- Create: `components/planner/content-library.tsx`
- Modify: `components/planner/library.tsx`
- Modify: `components/planner/app.tsx`
- Modify: `app/globals.css`
- Modify: `lib/planner-navigation.ts` only if a test proves presentation wiring requires it; preserve accepted `content` hash either way.
- Create: `tests/content-library-ui.test.mjs`
- Modify: `tests/planner-navigation.test.ts`
- Modify: `tests/planner-navigation-ui.test.mjs`
- Modify: relevant existing planner UI test only when its current assertions cover the touched flow.

**Interfaces:**
- Existing visible nav label becomes `Библиотека`; route/hash remains `content`.
- `ContentLibrary` renders top tabs `Заготовки` and `Публикации`.
- Existing Post-list component becomes/reuses `Publications` with its current filters/actions unchanged.
- Library editor supports title, text, existing media selection/upload, save/cancel; at least text or media required server-side and client may mirror validation for UX.
- READY actions: Create publication, Edit, Archive, Delete.
- USED actions: Open publication when `sourcePostId` exists, Edit library copy, Delete; no second source conversion.
- ARCHIVED actions: Restore, Edit/Delete as permitted by the spec; no conversion until restored.
- Create publication prefills a new unsaved Composer with text/media/source ID; opening it creates no server Post.

- [ ] **Step 1: Write failing UI/navigation tests**

Assert:
- sidebar text is `Библиотека` while `normalizePlannerView('content') === 'content'`;
- `Заготовки | Публикации` render;
- Publications keeps current status/network/search behavior;
- Library search matches title/text/media names and status filters map to READY/USED/ARCHIVED;
- add/edit/archive/restore/delete handlers call client API and update local state only after success;
- Create publication prefills Composer and does not call POST `/api/posts` on open;
- USED item opens linked Post instead of offering a second conversion;
- reload bootstrap data renders persisted Library items.

- [ ] **Step 2: Run focused UI tests and confirm RED**

Run: `pnpm test -- tests/content-library-ui.test.mjs tests/planner-navigation.test.ts tests/planner-navigation-ui.test.mjs`

Expected: FAIL because Library UI is not wired.

- [ ] **Step 3: Implement the minimum UI and state wiring**

Keep Library UI in `content-library.tsx`; do not move unrelated PlannerApp logic. Reuse existing buttons/cards/tabs/media preview components. The `Публикации` tab must call the same existing Post actions rather than reimplement them.

- [ ] **Step 4: Run focused UI tests GREEN**

Run: `pnpm test -- tests/content-library-ui.test.mjs tests/planner-navigation.test.ts tests/planner-navigation-ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add content library workspace`

---

### Task 6: End-to-end regression, docs and delivery evidence

**Files:**
- Modify only documentation/evidence files required by verified results after code is complete.
- Do not mark `ROADMAP.md` Phase 5 DONE before production acceptance.

**Interfaces:**
- No new product interface. This task proves Tasks 1–5 integrate without regressing current publication behavior.

- [ ] **Step 1: Run focused library suite**

Run all tests added/modified for Tasks 1–5.

Expected: PASS with no skips introduced to hide failures.

- [ ] **Step 2: Run full verification**

Run:
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- migration drift/apply verification using the repository's existing CI path
- Self-host workflow/check after push

Expected: all existing and new tests PASS; no regression in Post/Calendar/Media/Telegram/MAX code paths.

- [ ] **Step 3: Perform verification-before-completion review**

Inspect the actual diff and confirm:
- no AI/new-network/scheduler scope creep;
- no secrets/frontend token exposure;
- no second publication path;
- source provenance is create-only;
- Library media references prevent unsafe deletion;
- no unrelated refactor.

- [ ] **Step 4: Push implementation branch and open PR**

Require actual GitHub CI + Self-host success. Stop at the owner merge/deploy gate with a concise report: `STATUS / CHANGED / TESTS / CI / PR / MIGRATION / RISKS / NEXT_ACTION`.

- [ ] **Step 5: After explicit owner merge+deploy approval, verify Render**

Production browser acceptance must cover:
- create Library item with text/media;
- reload persistence;
- edit and archive/restore;
- media-in-use delete protection;
- search/filter;
- Library → Composer opens without server Post creation;
- first save creates one Post and marks source USED;
- reload shows USED + linked publication;
- ordinary Post/Calendar flow still works.

No live Telegram/MAX send is required unless implementation materially changes provider/publication code beyond the approved source-aware create transaction; if provider/publication internals are materially changed, run only the smallest justified provider smoke.

- [ ] **Step 6: Update final evidence/docs and commit**

Only after production PASS, record the verified Phase 5 checkpoint and next milestone. Do not mix Phase 6 implementation into this branch.

---

## Execution Notes

- Start implementation from current `main` after confirming it contains merge commit `d8243f00133214fd3f3a62c99cfc703a5dc1f04c` (or a later owner-approved main that contains it).
- Use an isolated feature branch/worktree, recommended name `codex/content-library`.
- Required feature workflow: `brainstorming` is complete; this plan is the `writing-plans` output; implementation uses `test-driven-development`; agentic execution should use `subagent-driven-development` when available; before DONE use `verification-before-completion`.
- Multi-agent work is useful only for independent test/review slices. Do not allow parallel edits to `db/schema.ts`, `lib/server/posts.ts`, `components/planner/app.tsx` or the same test file.
- If implementation discovers that atomic conversion cannot be achieved without a broad rewrite of Post persistence, STOP and report the concrete blocker instead of refactoring the publication core under this feature.
