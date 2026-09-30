# Planly Current State

**Date:** 2026-09-30
**Milestone:** MVP v1 / Milestone 0 — verified baseline
**Baseline commit:** `e53e3b3a1950c2561a153983700d1b57bafecbbb`

## Status

**Milestone 0: PASS WITH ENVIRONMENT LIMITATION**

The authoritative source has been identified and consolidated in GitHub. No local folder is required for future development.

A full fresh dependency install/build could not be executed inside the current sandbox because outbound DNS/network access to GitHub/package registries is blocked. That limitation is recorded as environment-related rather than silently converted into a project failure.

## Current phase

- **CURRENT PHASE:** Phase 1 UI Prototype completed enough to serve as the product baseline.
- **CURRENT GOAL:** start production Foundation/Content Core without redesigning the selected UI.
- **BLOCKERS:** production PostgreSQL, owner auth outside Sites-host assumptions, media object storage, server persistence, queue/worker, provider connectors.
- **NEXT MILESTONE:** Milestone 1 — Foundation + Content Core.

## Fresh verification performed in this session

### Current GitHub core logic

The exact current `main` versions of `lib/planner.ts` and `tests/planner.test.mjs` were fetched from GitHub and run with Node type stripping in a clean scratch directory.

Result: **5/5 PASS**.

Covered behaviors:

1. empty post / missing target validation;
2. invalid and past scheduling time rejection;
3. future Moscow time conversion;
4. rescheduling preserves independent target state;
5. drafts may omit network/schedule but still require content.

### GitHub checkout attempt

A clean `git clone` was attempted from the sandbox. It failed before repository access because the sandbox cannot resolve `github.com`.

Therefore no claim is made that a fresh install/build was executed here.

### Existing repository evidence

`ROADMAP.md` records prior checks of TypeScript, core unit tests, eight screen render smoke checks, and production build for the imported light prototype. `docs/PROJECT_BASELINE.md` also records 5/5 light-prototype unit tests at import time.

Those historical checks are retained as evidence but are not relabeled as fresh session results.

## What actually works today

### UI

The selected light Planly UI exists in modular components and covers the intended Phase 1 screens.

### Browser content workflow

The app can model:

- posts;
- per-network targets/statuses;
- per-network text overrides;
- drafts/scheduled/demo-published/demo-failed states;
- media selection;
- calendar movement;
- search/filtering;
- social-account demo toggles.

### Persistence

Current `main` persists workspace state to IndexedDB through `lib/browser-store.ts`.

This is **not production persistence**. Browser cleanup, another device, server restart semantics, and background workers cannot rely on it.

### Media

Current media is read into browser Data URLs and stored with the browser workspace. Client-side checks include MIME/type, size and basic file signatures.

This is useful prototype validation but is not server-side object storage.

### Authentication

`app/chatgpt-auth.ts` contains Sites/dispatch ChatGPT-auth helpers, while the current client planner itself is still prototype-oriented.

The production Render version must not assume Sites dispatch headers exist. Milestone 1 must provide the approved owner-only server auth/session model or another explicitly approved equivalent for the production host.

## What is NOT working production functionality

- PostgreSQL application schema and persistence;
- Redis/BullMQ queue;
- independent publication worker on Render;
- real Telegram publication from current `main`;
- real MAX publication;
- scheduled publication with browser closed;
- production object storage;
- OpenAI research/draft/image generation;
- persisted AI source provenance;
- provider remote-ID persistence in current `main`;
- bounded retry/recovery in current `main`;
- production analytics.

Frontend labels and demo statuses must never be counted as proof of remote publication.

## Reusable code from `reference/dark-mvp`

The early backend branch is not the production architecture, but the following concepts are worth porting through tests rather than rewriting blindly:

- ownership checks around every mutation;
- independent per-network delivery state;
- provider remote IDs;
- claim-before-send behavior;
- uncertain/unknown state after an interrupted write where remote acceptance is possible;
- preventing blind duplicate retry;
- validation before scheduling;
- Telegram `getMe/getChat/getChatMember` connection verification;
- Telegram `sendMessage/sendPhoto/sendVideo` publishing path;
- safe provider-error normalization;
- server-side media signature validation;
- no secret/token exposure to frontend.

Do **not** directly port:

- D1-specific SQL/runtime wiring;
- Cloudflare Worker cron as the scheduler architecture;
- R2 binding assumptions without deciding the production object store;
- VK/Instagram scope into MVP v1;
- the old combined provider helper as the final SocialConnector interface.

## Archive ruling

The uploaded `SMM Planer.7z` is older than current GitHub `main` and is no longer a development dependency.

No further user action with local Planly folders is required for source management.

## Definition of Milestone 0 done

- [x] authoritative source identified;
- [x] current source tree inspected;
- [x] package/runtime metadata inspected;
- [x] current persistence implementation identified;
- [x] current DB scaffold inspected;
- [x] existing tests identified;
- [x] fresh current core test run completed, 5/5 PASS;
- [x] selected Site/main relationship documented;
- [x] older archive prevented from overwriting newer code;
- [x] reusable earlier backend implementation identified;
- [x] `main` left untouched by failed archive import;
- [ ] fresh full install/lint/build in this sandbox — BLOCKED by outbound network/DNS policy, must be proven in CI/Render during Foundation work.

## Required handoff into Milestone 1

Milestone 1 must start from the actual current files:

- `package.json`
- `components/planner/*`
- `lib/planner.ts`
- `lib/browser-store.ts`
- `db/index.ts`
- `db/schema.ts`
- `app/chatgpt-auth.ts`
- `tests/planner.test.mjs`
- `tests/render-check.tsx`

It must preserve the selected light UI while replacing browser-only state behind a server persistence boundary.

The first production slice should establish:

1. server/runtime target for Render;
2. PostgreSQL schema + migrations;
3. owner-only auth/session suitable for that runtime;
4. Post/PostTarget/SocialAccount/MediaAsset/Publication persistence;
5. server-side media storage boundary;
6. CI/build/test verification on Linux;
7. only after those are green, Redis/BullMQ scheduler planning.

Do not start Telegram/MAX/OpenAI implementation before Foundation/Content Core establishes the persistence and publication boundaries they depend on.
