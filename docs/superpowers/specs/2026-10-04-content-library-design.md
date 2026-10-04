# Phase 5 — Content Library design

Date: 2026-10-04
Repository: `barsikdan-hue/Planly`
Base: `main` at `d8243f00133214fd3f3a62c99cfc703a5dc1f04c`
Status: approved design, implementation not started

## 1. Goal

Phase 5 adds a real server-backed Content Library for prepared content created outside Planly.

Product flow:

`Prepared Content → Library → explicit Create publication action → Composer → Post → Calendar/Publication`

A library item is not a Post and must not enter publication, scheduling, PostTarget, queue or provider logic until the owner explicitly starts a publication from it and then saves/schedules/publishes that Composer draft.

Phase 5 must preserve the current working publication core and avoid broad refactors.

## 2. Current state

The current UI file `components/planner/library.tsx` contains two existing screens:

- `Content`: the current list of persisted Posts;
- `MediaLibrary`: the existing media library.

There is no server-side content-library entity today.

Current persisted `Post` data is already part of the publication lifecycle through `posts`, `post_targets`, `post_media`, `publications`, scheduler reconciliation and provider connectors. Reusing `Post(DRAFT)` as a content-library record would therefore violate the product rule that prepared library material must remain outside Posts until explicit approval.

Existing `media_assets` are independent of Posts and can be reused safely by library items without duplicating files. The existing media deletion rule rejects deletion while media is attached to a Post; Phase 5 must extend the same protection to media attached to a library item.

## 3. Scope

Phase 5 includes:

- create a prepared library item;
- edit its title, text and attached media;
- persist it on the server;
- search library items;
- filter by simple status;
- archive, restore and permanently delete a library item;
- reload persistence through the normal server snapshot;
- start a publication from a library item;
- reuse existing media assets;
- keep current Posts and publication flows working unchanged in behavior.

Phase 5 does not include:

- swipe gestures;
- reject/skip semantics;
- automatic next-free-slot selection;
- reusable publication slots;
- AI;
- analytics;
- new social networks;
- scheduler redesign;
- categories/tags/taxonomy beyond the approved simple status filter;
- content import from external services.

Those remain later-phase concerns.

## 4. UX

The main navigation item currently named `Контент` becomes `Библиотека`.

Inside the screen there are two top-level tabs:

- `Заготовки` — the new Content Library;
- `Публикации` — the current Posts screen, preserving its existing filters/actions and publication status behavior.

The existing separate `Медиа` navigation item remains unchanged.

### 4.1 Заготовки

Each library card shows:

- title;
- text preview;
- attached media preview when present;
- status;
- updated date;
- actions.

Actions:

- `Создать публикацию` for READY items;
- `Открыть публикацию` for USED items when the linked Post still exists;
- `Редактировать`;
- `Архивировать` or `Вернуть из архива`;
- `Удалить`.

Filters:

- `Все`;
- `Готовые`;
- `Использованные`;
- `Архив`.

Search matches title, text and attached media names.

Editing a USED library item changes only the library copy. It never mutates the already-created Post and does not reopen conversion. To publish another variant, use the existing Post duplication flow from the linked publication.

### 4.2 Add/edit library item

Use a focused library editor rather than the publication Composer because a library item has no networks, schedule or provider overrides.

Fields:

- title, optional, max 200 characters;
- text, optional if media exists, max 20,000 characters;
- media selection/upload using the existing server media flow.

At least text or one media asset is required.

New items always start READY. Archiving is an explicit later action, not a create mode.

### 4.3 Create publication

`Создать публикацию` opens the existing Composer with a new unsaved draft populated from the library item:

- base text from the library item;
- media IDs copied by reference;
- normal default network selection from the existing `blankPost()` behavior;
- no schedule preselected beyond current Composer defaults;
- no server Post is created merely by opening the Composer.

The user may still edit the draft before saving, scheduling or publishing.

The source library item becomes `USED` only after the server successfully creates the first Post from that source. Merely opening or abandoning the Composer must not mark it used.

## 5. Data model

Add a dedicated enum:

`library_item_status = READY | USED | ARCHIVED`

Add table `library_items`:

- `id text primary key`;
- `user_id text not null` → users, cascade on user deletion;
- `title text null`;
- `body_text text not null`;
- `status library_item_status not null default READY`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`.

Indexes:

- user ID;
- user ID + status only if implementation/query evidence shows it useful; avoid speculative indexing.

Add join table `library_item_media`:

- `library_item_id` → library_items, cascade;
- `media_id` → media_assets, cascade;
- `position integer not null`;
- primary key `(library_item_id, media_id)`;
- unique `(library_item_id, position)`.

Media bytes are never copied. Library items and Posts may reference the same `media_assets` row independently.

Add nullable provenance column to `posts`:

- `source_library_item_id text null` → library_items;
- unique per non-null source.

The purpose is atomic conversion bookkeeping and duplicate protection. One library item may create at most one first-class Post through the approved conversion flow. Users who want another publication can duplicate the resulting Post using the existing Post duplication behavior.

Deleting a library item that already has a source Post must not delete the Post. Use `ON DELETE SET NULL` for `posts.source_library_item_id`.

## 6. Contracts

Add dedicated library contracts rather than mixing library state into mutable Post content.

`CreateLibraryItemInput`:

- `title?: string | null`, trimmed, max 200;
- `text: string`, trimmed, max 20,000;
- `mediaIds: string[]`, unique, max 20;
- refinement: text or media required.

Creation status is always READY.

`UpdateLibraryItemInput` is a full replacement of editable library content:

- same title/text/media rules as creation;
- `status: READY | ARCHIVED`.

Clients must not directly set `USED`; the server owns that transition when a source Post is successfully created. A USED item remains USED when its library copy is edited; editing cannot reset it to READY.

`LibraryItemDto`:

- id;
- title;
- text;
- status;
- mediaIds;
- createdAt;
- updatedAt;
- `sourcePostId: string | null`.

For Post creation, carry an optional source-library identifier only on create requests. Updating an existing Post must never change its source library item.

## 7. Server architecture

Add a focused server module for library persistence, following existing owner-scoped patterns.

Responsibilities:

- list owner library items;
- read one owner library item;
- validate referenced media belongs to the owner;
- create/update/archive/restore/delete item;
- preserve media order;
- reject cross-owner IDs;
- expose source Post linkage when present.

Do not put library CRUD inside `lib/server/posts.ts`.

Update the existing media deletion service so a media asset attached to either `post_media` or `library_item_media` is considered in use and cannot be deleted until detached. This preserves the current safety rule instead of allowing a library item to lose content through an unrelated Media screen action.

### 7.1 Conversion transaction

The first successful creation of a Post from a library item must be atomic with marking the source `USED`.

Expected transaction behavior:

1. validate and lock the owned library item;
2. reject ARCHIVED as a conversion source unless it is restored first;
3. if the item is already USED and has a linked source Post, resolve the existing Post rather than create a duplicate;
4. create the Post through the existing Post persistence rules and idempotency contract;
5. set `posts.source_library_item_id`;
6. set the library item status to `USED`;
7. commit;
8. perform existing queue mirroring after commit exactly as current Post creation does.

Library update/archive/delete operations that race with conversion must lock/serialize on the same owned library row so the final state is deterministic and no duplicate Post can be created.

The implementation should reuse the current Post creation logic rather than fork validation, target creation, media attachment or publication reconciliation into a second implementation.

The exact internal function boundary may be chosen after implementation-time code inspection, but the behavior above is mandatory.

## 8. API

Add owner-authenticated endpoints:

`GET /api/library-items`

- returns owner items ordered by latest update first;
- includes media IDs and source Post linkage where applicable.

`POST /api/library-items`

- creates a READY item;
- validates input/media ownership.

`PATCH /api/library-items/:id`

- replaces editable title/text/media and applies READY/ARCHIVED owner status where permitted;
- cannot directly set USED;
- a USED item may update its library copy but remains USED;
- archived READY items may be restored to READY.

`DELETE /api/library-items/:id`

- permanently removes the library item and its join rows;
- never deletes media assets;
- never deletes an already-created Post;
- missing/non-owned item follows the existing API error convention and must not leak cross-owner existence.

Post creation from a library source uses the existing `/api/posts` creation path with an explicit source-library identifier on create only. The implementation may choose a small create-request wrapper or dedicated create-only field/header, but must keep existing Post content validation and `idempotency-key` behavior intact. Do not add source provenance to mutable PATCH content.

Do not introduce a second independent publication endpoint.

## 9. Bootstrap and client state

Extend `/api/bootstrap` and `PlannerSnapshot` with `libraryItems` so initial application load remains a single server snapshot.

`PlannerData` gains library items alongside posts/media/socialAccounts.

Add client API helpers for library CRUD.

Do not use browser localStorage/sessionStorage as the source of truth for Library. Normal server persistence is authoritative.

The existing Composer recovery mechanism remains limited to Composer drafts. Phase 5 does not add a second crash-recovery subsystem for library editing unless implementation evidence proves a concrete data-loss problem that cannot be handled by normal save/error state.

## 10. Navigation/component boundaries

Update navigation presentation while preserving the existing `content` route/hash for compatibility. The visible label becomes `Библиотека`; `normalizePlannerView('content')` continues to work.

Refactor only enough to keep responsibilities clear:

- keep current Post list behavior reusable as a Publications tab;
- add a dedicated Library Items view/editor component;
- keep MediaLibrary separate;
- avoid growing `app.tsx` with all library UI implementation inline.

A small extraction from the existing `components/planner/library.tsx` is allowed if directly necessary for the two-tab layout. Unrelated UI cleanup is out of scope.

## 11. Error handling

Library errors are ordinary application errors, not provider errors.

Required cases:

- invalid title/text/media count → 400;
- referenced media missing/not owned → safe client error, no partial write;
- library item missing/not owned → non-leaking not-found behavior;
- deleting media still attached to a library item → reject using the existing in-use media pattern;
- archive/update/delete racing with conversion → row locking/transaction decides one winner; no duplicate Post or partial library state;
- repeated create-Post request after lost response → current Post idempotency behavior must still recover the same Post;
- if Post creation fails, library item remains READY;
- if conversion commits but client loses the response, retry must resolve to the same source Post and USED library item.

No network/provider call occurs from library CRUD itself.

## 12. Security

- all library reads/writes are scoped by authenticated owner ID;
- media ownership is checked server-side;
- no provider tokens or secrets are added to library DTOs/frontend;
- HTML is not trusted or rendered as raw markup;
- use existing request-size and media upload limits;
- no new external service.

## 13. Migration strategy

Add one forward migration after `0003`.

The migration adds:

- `library_item_status` enum;
- `library_items`;
- `library_item_media`;
- nullable `posts.source_library_item_id` with unique index and `ON DELETE SET NULL` foreign key.

No destructive data migration is required. Existing Posts and media remain valid with null provenance.

The migration must pass existing migration drift/apply checks before merge.

## 14. Testing

Follow TDD for implementation.

### Contract/unit tests

- valid text-only, media-only and text+media library input;
- empty item rejected;
- title/text/media limits;
- new item always READY;
- USED cannot be assigned/reset directly by client;
- navigation still accepts existing `content` route.

### DB/integration tests

- create/list/update/archive/restore/delete owner library item;
- media order preserved;
- cross-owner media rejected;
- deleting unattached item does not delete media;
- deleting a media asset attached to a library item is rejected;
- deleting USED item leaves created Post intact and clears/nulls provenance through FK behavior;
- bootstrap includes library items;
- migration/schema checks.

### Conversion tests

- opening Composer creates no server Post and does not set USED;
- first successful save from source creates one Post and marks item USED atomically;
- retry after lost response resolves same Post;
- repeated conversion cannot create a second source Post;
- creation failure leaves item READY;
- archive/update/delete race with conversion does not create duplicate/partial state;
- existing Post creation without library source remains unchanged;
- scheduling/publish-now path from a library source still uses existing target/publication logic.

### UI tests

- visible navigation label `Библиотека`;
- `Заготовки | Публикации` tabs;
- search/filter behavior;
- create/edit/archive/restore/delete UI;
- USED item links to its created publication and cannot reconvert;
- existing Publications tab keeps current filters/actions;
- Create publication populates Composer correctly;
- reload shows persisted library items.

### Regression/verification

Before DONE:

- focused tests;
- full test suite;
- migration drift/apply;
- typecheck;
- lint;
- build;
- Self-host build;
- GitHub CI on PR;
- owner merge gate;
- authorized Render deploy of new code;
- production browser acceptance of library CRUD, reload and Library → Composer → saved Post;
- no live Telegram/MAX send is required unless the implementation unexpectedly changes provider/publication code. If publication internals are touched materially, use the smallest justified provider smoke.

## 15. Definition of Done

Phase 5 is DONE only when:

- prepared content is stored independently from Posts;
- library CRUD works and survives reload;
- title/text/media editing works;
- search/status filters work;
- existing media assets are reused without byte duplication and cannot be deleted while attached;
- opening Create publication does not create a Post;
- successful first Post creation from a library item marks it USED atomically;
- retries cannot create duplicate source Posts;
- existing Posts/Calendar/publication flows regressions are absent;
- tests/CI/build pass;
- Render production acceptance passes after owner-authorized merge/deploy;
- roadmap/evidence docs are updated only with verified final state.

## 16. Future compatibility

Phase 6 Swipe Planner can operate on READY library items without changing the publication core:

- swipe left can introduce reject/skip semantics later;
- swipe right can use the same conversion boundary defined here;
- next-free-slot/manual-time behavior can be layered after approval;
- Library items still remain outside Posts until approval.

This is why Phase 5 uses a dedicated library entity now rather than overloading `Post(DRAFT)`.