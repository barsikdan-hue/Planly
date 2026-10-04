# Phase 5 Content Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-backed prepared-content library that stays outside Posts until the owner explicitly creates a publication from a library item.

**Architecture:** Add dedicated Library persistence/API/UI, reuse existing `media_assets`, and keep the current Post/publication stack as the only publication path. Library → Post conversion extends existing Post creation inside one transaction so provenance, `USED` status and idempotency stay consistent.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, PostgreSQL, Drizzle ORM, Zod, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-04-content-library-design.md`

## Global Constraints

- LibraryItem is not a Post and has no targets, schedule, queue or provider state.
- New items always start `READY`; owner update may request `READY | ARCHIVED`; only the server sets `USED`.
- A USED item may edit its library copy but remains USED; it cannot create a second source Post.
- Reuse `media_assets`; never copy media bytes.
- One LibraryItem creates at most one first-class source Post. Later variants use existing Post duplication.
- Preserve current `/api/posts`, idempotency, Composer recovery, queue reconciliation and Telegram/MAX behavior.
- Preserve `#content`; only visible navigation becomes `Библиотека`.
- No AI, swipe/reject, tags/categories, automatic slots, analytics, new networks, scheduler redesign or external services.
- Existing code/tests override stale wording in docs. In particular, current `apiError()` maps Zod validation to HTTP 422; Library validation follows that convention rather than inventing a one-off 400 path.
- Merge, production deployment and production migration remain owner gates.

## Review Focus

1. Lost response during Library → Post conversion must recover the same Post with one USED source item.
2. Conversion racing archive/update/delete must serialize without duplicate Post or partial state.
3. Media referenced only by Library must still be protected from deletion.
4. Composer recovery/pending creation must retain source Library provenance.
5. Editing a USED Library item must not mutate the linked Post or reopen conversion.

---

## File Map

**Create:**
- `lib/contracts/library.ts`
- `lib/server/library-items.ts`
- `app/api/library-items/route.ts`
- `app/api/library-items/[id]/route.ts`
- `components/planner/content-library.tsx`
- `tests/library-contract.test.ts`
- `tests/library-items.integration.test.ts`
- `tests/library-conversion.integration.test.ts`
- `tests/content-library-ui.test.mjs`

**Modify:**
- `db/schema.ts`
- generated `drizzle/0004_*.sql` and `drizzle/meta/*`
- `lib/contracts/planner.ts`
- `lib/server/posts.ts`
- `lib/server/post-idempotency.ts`
- `lib/server/media.ts`
- `app/api/posts/route.ts`
- `app/api/media/[id]/route.ts`
- `app/api/bootstrap/route.ts`
- `lib/client/planly-api.ts`
- `lib/client/pending-creation.ts`
- `lib/client/editor-recovery.ts`
- `lib/planner.ts`
- `components/planner/library.tsx`
- `components/planner/app.tsx`
- `app/globals.css`
- focused existing tests for API/media/recovery/navigation/idempotency.

Use direct focused Node test commands, not `pnpm test -- <files>`, because the repository test script already expands its own test globs.

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
- `libraryItemStatusEnum = READY | USED | ARCHIVED`
- `libraryItems`
- `libraryItemMedia`
- nullable unique `posts.sourceLibraryItemId` → `library_items.id`, `ON DELETE SET NULL`
- `CreateLibraryItemInput = { title?: string | null; text: string; mediaIds: string[] }`
- `UpdateLibraryItemInput = { title?: string | null; text: string; status: 'READY' | 'ARCHIVED'; mediaIds: string[] }`
- `LibraryItemDto = { id; title; text; status; mediaIds; sourcePostId; createdAt; updatedAt }`

- [ ] **Step 1: Write failing contract/schema tests**

Assert valid text-only/media-only/text+media input; reject empty content, title >200, text >20,000, >20 media IDs, duplicate media IDs and client `USED` update.

- [ ] **Step 2: Run RED tests**

Run:
`node --test --test-concurrency=1 --experimental-strip-types tests/library-contract.test.ts tests/db-schema.test.ts`

Expected: FAIL because Library schema/contracts do not exist.

- [ ] **Step 3: Implement the minimal schema/contracts**

Keep Library contracts in `lib/contracts/library.ts`; do not mix Library state into mutable Post content.

- [ ] **Step 4: Generate migration and run GREEN tests**

Run:
- `pnpm db:generate`
- `node --test --test-concurrency=1 --experimental-strip-types tests/library-contract.test.ts tests/db-schema.test.ts`

Expected: generated forward migration after `0003`; tests PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: add content library schema"`

---

### Task 2: Library CRUD, API, bootstrap and media safety

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
- `listLibraryItems(userId: string): Promise<LibraryItemDto[]>`
- `createLibraryItem(userId: string, raw: CreateLibraryItemInput): Promise<LibraryItemDto>`
- `updateLibraryItem(userId: string, id: string, raw: UpdateLibraryItemInput): Promise<LibraryItemDto>`
- `deleteLibraryItem(userId: string, id: string): Promise<void>`
- `/api/bootstrap` adds `libraryItems`

- [ ] **Step 1: Write failing integration/API tests**

Cover create/list/update/archive/restore/delete, latest-updated ordering, media order, cross-owner/missing media rejection without partial writes, non-leaking missing item, bootstrap inclusion, and sourcePostId exposure.

Also assert:
- editing a DB-marked USED item changes the Library copy but status stays USED;
- deleting a USED item leaves the already-created Post intact and `posts.source_library_item_id` becomes NULL via FK;
- deleting a Library item never deletes media assets;
- media delete returns 409 while referenced only by `library_item_media`.

- [ ] **Step 2: Run RED tests**

Run:
`node --test --test-concurrency=1 --experimental-strip-types tests/library-items.integration.test.ts tests/api-contract.test.ts tests/media.integration.test.ts`

Expected: FAIL on missing Library behavior.

- [ ] **Step 3: Implement minimal CRUD/API/bootstrap/media protection**

All queries are owner-scoped. `deleteMediaAsset()` must consider both `post_media` and `library_item_media`; route error stays safe/generic and 409.

- [ ] **Step 4: Run GREEN tests and migration apply**

Run focused command above, then repository migration apply check against the normal test/CI database.

Expected: PASS; migration applies without destructive changes.

- [ ] **Step 5: Commit**

`git commit -m "feat: add content library CRUD"`

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
- Keep `SavePostInput` unchanged.
- Because `savePostInputSchema` is already refined and cannot safely be `.extend()`ed, add a separate create-only source parser, e.g. `createPostSourceSchema = z.object({ sourceLibraryItemId: z.string().min(1).max(200).optional() })`.
- POST route parses the same raw body twice: `savePostInputSchema.parse(raw)` for Post content and `createPostSourceSchema.parse(raw)` for optional provenance. Zod stripping keeps PATCH behavior unchanged.
- Extend `PostPersistenceOptions` with `sourceLibraryItemId?: string`.
- Extend `creationInputHash(input: SavePostInput, sourceLibraryItemId?: string): string`; source ID participates in hash when present, ordinary calls stay byte-compatible in behavior.

- [ ] **Step 1: Write failing conversion/idempotency/race tests**

Assert:
- READY source + successful create creates exactly one Post and marks source USED atomically;
- opening/reading Library creates no Post;
- ARCHIVED source cannot convert;
- failed Post creation leaves source READY;
- same idempotency key + same source retries to same Post;
- changed source/content under same key conflicts;
- already USED source resolves its linked Post instead of creating another;
- two concurrent conversions produce one source Post;
- conversion racing archive/update/delete locks the same source row and yields deterministic final state;
- ordinary Post creation without source remains unchanged.

- [ ] **Step 2: Run RED tests**

Run:
`node --test --test-concurrency=1 --experimental-strip-types tests/library-conversion.integration.test.ts tests/post-idempotency.integration.test.ts tests/posts.integration.test.ts`

Expected: FAIL on source-aware creation.

- [ ] **Step 3: Implement source-aware creation inside the existing Post transaction**

Inside current `createPost()` transaction:
- lock owned Library source when provided;
- resolve existing linked source Post first for retry/USED cases;
- reject ARCHIVED source;
- include source ID in insert/hash;
- create targets/media/publications using existing logic only;
- set Library item USED in the same transaction;
- keep existing post-commit queue mirror path.

Do not introduce another publication service or copy the Post creation implementation.

- [ ] **Step 4: Run GREEN tests**

Run the focused command above. Expected: PASS including race/retry controls.

- [ ] **Step 5: Commit**

`git commit -m "feat: convert library items to posts atomically"`

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
- Add Library CRUD client helpers for exact Task 2 endpoints.
- `savePost` sends `sourceLibraryItemId` only on POST create, never PATCH.
- Add transient `sourceLibraryItemId?: string | null` to the unsaved Composer/client Post shape only as needed for conversion recovery.
- `blankPost()` sets it to null.
- Existing recovery/pending schemas accept old stored records without the optional field; no version bump that invalidates existing v1 session data.

- [ ] **Step 1: Write failing client/recovery tests**

Assert POST-only provenance transport, exact Library CRUD requests, editor recovery round-trip of source ID, old recovery records still parse, pending creation stores source ID before dispatch, lost-response retry reuses same key/source, and ordinary new/edit/duplicate Composer flows clear source provenance.

- [ ] **Step 2: Run RED tests**

Run:
`node --test --test-concurrency=1 --experimental-strip-types tests/planly-api.test.ts tests/pending-creation.test.ts tests/editor-recovery.test.mjs tests/editor-recovery-lifecycle.test.mjs`

Expected: FAIL because provenance is not yet recovered/replayed.

- [ ] **Step 3: Implement minimal client/recovery support**

Library itself remains server-authoritative; only unsaved Composer provenance uses the existing session recovery/pending-create mechanism.

- [ ] **Step 4: Run GREEN tests**

Run focused command above. Expected: PASS including old recovery records.

- [ ] **Step 5: Commit**

`git commit -m "feat: preserve library source through composer recovery"`

---

### Task 5: Library UI, navigation and Library → Composer

**Files:**
- Create: `components/planner/content-library.tsx`
- Modify: `components/planner/library.tsx`
- Modify: `components/planner/app.tsx`
- Modify: `app/globals.css`
- Create: `tests/content-library-ui.test.mjs`
- Modify: `tests/planner-navigation.test.ts`
- Modify: `tests/planner-navigation-ui.test.mjs`

**Interfaces:**
- Sidebar visible label: `Библиотека`; hash remains `content`.
- `ContentLibrary` top tabs: `Заготовки | Публикации`.
- Existing Post list is reused/renamed as Publications with current filters/actions unchanged.
- Library editor: optional title, text, existing media selection/upload, save/cancel.
- READY: Create publication, Edit, Archive, Delete.
- USED: Open linked publication when available, Edit Library copy, Delete. No archive-to-READY and no second conversion.
- ARCHIVED: Restore, Edit, Delete. No conversion until restored.
- Create publication opens a new unsaved Composer with copied text/media and sourceLibraryItemId; it performs no POST until the user saves/schedules/publishes.

- [ ] **Step 1: Write failing UI/navigation tests**

Assert visible nav label, `content` hash compatibility, both tabs, current Publications filters/actions, Library search over title/text/media names, READY/USED/ARCHIVED filters, CRUD handlers updating local state only after successful API result, Library → Composer prefill without POST, USED item opening linked Post, and bootstrap reload persistence.

- [ ] **Step 2: Run RED tests**

Run:
`node --test --test-concurrency=1 --experimental-strip-types tests/content-library-ui.test.mjs tests/planner-navigation.test.ts tests/planner-navigation-ui.test.mjs`

Expected: FAIL because Library workspace is not wired.

- [ ] **Step 3: Implement minimal UI/state wiring**

Keep Library UI in `content-library.tsx`; do not grow `app.tsx` with card/editor markup. Reuse existing UI primitives and current Post actions.

- [ ] **Step 4: Run GREEN tests**

Run focused command above. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: add content library workspace"`

---

### Task 6: Full verification, PR and production acceptance

**Files:**
- Documentation/evidence only after verified results.
- Do not mark Phase 5 DONE before production acceptance.

- [ ] **Step 1: Run full local verification**

Run:
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- repository migration drift/apply checks

Expected: all old + new tests PASS; no hidden skips used to bypass failures.

- [ ] **Step 2: Run verification-before-completion review**

Inspect actual diff for: no AI/new network/scheduler scope creep; no secrets in frontend; no second publication path; create-only provenance; protected Library media; no unrelated refactor.

- [ ] **Step 3: Push implementation branch and open PR**

Require real GitHub CI and Self-host success. Stop at owner merge/deploy gate with concise report: `STATUS / CHANGED / TESTS / CI / PR / MIGRATION / RISKS / NEXT_ACTION`.

- [ ] **Step 4: After explicit merge+deploy approval, verify Render**

Production browser acceptance:
- create Library item with text/media;
- reload persistence;
- edit;
- archive/restore;
- media-in-use delete protection;
- search/filter;
- Library → Composer opens without server Post creation;
- first save creates one Post and marks source USED;
- reload shows USED and linked publication;
- ordinary Posts/Calendar still work.

No live Telegram/MAX send unless implementation materially changes provider/publication code beyond the approved source-aware create transaction. If such internals are materially changed, use the smallest justified provider smoke.

- [ ] **Step 5: Record final evidence/docs**

Only after production PASS update roadmap/evidence with the verified checkpoint. Do not start Phase 6 in the same branch.

---

## Execution Notes

- Start from current `main` containing `d8243f00133214fd3f3a62c99cfc703a5dc1f04c` or a later owner-approved main descendant.
- Use isolated branch/worktree, recommended `codex/content-library`.
- Required workflow: brainstorming complete → this writing-plan → test-driven-development → verification-before-completion.
- For agentic execution use subagent-driven-development when available; otherwise executing-plans/native execution is acceptable.
- Parallel agents may investigate/review independent slices, but must not edit the same shared files concurrently, especially `db/schema.ts`, `lib/server/posts.ts`, `components/planner/app.tsx` and shared tests.
- If atomic conversion requires a broad rewrite of Post persistence, STOP with evidence instead of refactoring the publication core inside Phase 5.
