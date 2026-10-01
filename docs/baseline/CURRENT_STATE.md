# Planly Current State

**Date:** 2026-10-01  
**Milestone:** MVP v1 / Milestone 1 — Foundation + Content Core  
**Branch:** `feat/foundation-content-core`

## Status

**CODE COMPLETE / DEPLOYMENT SMOKE PENDING**

The selected light Planly UI is now backed by a real server persistence boundary. PostgreSQL is authoritative for owner/content state, media has a private object-storage boundary, and the production runtime is standard Next.js for Render.

Milestone 1 is not being called fully production-verified until a real Render web service + PostgreSQL + S3-compatible object store pass the deployed smoke flow and restart-persistence check.

## CURRENT PHASE

Transition from Phase 2 Content Core into Phase 3 Scheduler preparation.

The codebase now has the persistence/auth/media foundations required before introducing Redis, BullMQ or provider workers.

## CURRENT GOAL

Finish external deployment verification for Foundation, then start Milestone 2:

`Post → PostTarget → BullMQ Job → Worker → TelegramConnector`

MAX follows only after Telegram is stable.

## DONE

### Runtime and database

- Standard Next.js runtime: `next dev`, `next build`, `next start`.
- PostgreSQL + Drizzle are the production data layer.
- Migration-backed schema exists for users, sessions, social accounts, posts, post targets, media, publications and supporting auth state.
- GitHub Actions starts a clean PostgreSQL service and applies migrations before verification.
- `/api/health` performs a real database query and exposes no connection details.

### Owner auth

- Single-owner email/password login.
- Password verification uses scrypt hashes from server environment configuration.
- Session cookie uses an opaque token while PostgreSQL stores only the token hash.
- Expired, forged and invalidated sessions are rejected.
- Persistent login throttling is covered by tests.
- Protected API ownership is derived server-side; client-supplied ownership is not trusted.

### Content Core

- `Post` persistence is server-authoritative.
- Each post has independent Telegram/MAX `PostTarget` records.
- Per-network text overrides and schedule intent are persisted.
- Create/update/delete operations are transactional where related records must move together.
- Cross-owner read/update/delete attempts are rejected.
- Repeated updates do not create duplicate targets.
- PostgreSQL reload persistence is integration-tested through route handlers.

### Media

- Browser Data URL / IndexedDB media is no longer the production persistence path.
- Server validates allowed MIME types, size, magic bytes and image dimensions.
- Private S3-compatible object storage is used behind a server-only boundary.
- Storage keys are generated independently of the user-supplied filename.
- Metadata includes checksum and relevant dimensions.
- Preview access uses temporary signed URLs.
- Failed DB persistence compensates by deleting an already-uploaded object.
- Cross-owner and attached-media deletion constraints are tested.

### UI

- Existing light Planly layout is preserved rather than redesigned.
- Production planner state loads from the server API instead of IndexedDB.
- UI mutations update local state only after server success.
- Failed saves do not silently discard the user's draft text.
- Active MVP networks are Telegram and MAX only.
- VK/Instagram production controls were removed from the current MVP flow.
- Fake `Опубликовать (демо)` success paths were removed.
- Scheduling stores intent only; background delivery is explicitly deferred to Milestone 2.
- Social accounts remain `DISCONNECTED` until real provider connectors exist.

### Deployment configuration

- `.env.example` contains required variable names with blank values only.
- `render.yaml` defines exactly one web service + one PostgreSQL database.
- Redis and worker resources are intentionally absent from Milestone 1.
- Render health check points to `/api/health`.
- Sensitive owner/S3 variables are marked for external secret configuration rather than committed values.
- A deployed Foundation smoke script exists as `pnpm smoke:foundation`.
- The smoke script has separate `seed-restart` and `verify-restart` phases to prove PostgreSQL survives a service restart/redeploy.

## TESTED

Current CI verifies, on Linux with a clean PostgreSQL container:

- migrations on an empty database;
- TypeScript typecheck;
- ESLint;
- full Node test suite;
- production `next build`;
- auth/session/rate-limit behavior;
- owner isolation;
- database constraints;
- Post/PostTarget transactional persistence;
- reload/create/edit/delete persistence through API routes;
- media validation and object-storage boundary behavior;
- UI/server contract;
- Telegram/MAX-only MVP surface;
- absence of fake publication state;
- Render/env deployment contract;
- database-backed health endpoint.

The latest pre-report branch run at commit `fab9925a00602b19229653885b79bf5d3e18d4f5` completed successfully. A fresh final CI run is still required after this report commit before merge/completion claims.

## KNOWN ISSUES / BLOCKERS

1. **Real Render deployment smoke is not yet executed.** Repository config is ready, but a real Planly Render web service/database have not been counted as verified in this report.
2. **S3-compatible production storage credentials are not configured in this repository.** They must be supplied as Render secrets; they must not be committed or pasted into frontend code.
3. **No real social publishing exists yet.** Telegram/MAX UI state is not remote publication proof.
4. **No background scheduler exists yet.** A saved schedule remains intent only while the browser may be closed.
5. **No OpenAI content research/generation exists yet.** It remains after trustworthy provider delivery.

## TECH DEBT

- Imported ChatGPT Sites/Vinext/Cloudflare files and dependencies still exist in the repository even though the production path is Next.js + PostgreSQL. They are intentionally not deleted in this milestone to avoid mixing a broad cleanup refactor with Foundation work.
- ESLint currently reports non-blocking warnings around legacy `<img>` usage and internal navigation via `window.location.assign`. They do not fail CI but should be cleaned during a dedicated UI polish task.
- The package name still reflects the imported starter and can be renamed in a separate housekeeping change.
- Analytics remains demo-only and must not be interpreted as provider metrics.

## SECURITY CHECKPOINT

- No database URL, owner password/hash, session secret or S3 credentials are intentionally exposed through `NEXT_PUBLIC_*`.
- Client planner modules do not read server secret environment variables.
- API errors are normalized and tests reject stack/database-detail leakage for expected request failures.
- `.env.example` contains names only.
- Provider API tokens are not part of Milestone 1 frontend or repository configuration.

## NEXT PHASE

### External completion gate for Milestone 1

Before merging as fully production-verified:

1. provision/attach one Render PostgreSQL instance and one Planly web service;
2. configure owner auth secrets and S3-compatible object-storage secrets in Render;
3. deploy the branch/release;
4. verify `/api/health` is green;
5. run `pnpm smoke:foundation` against the deployment;
6. run `seed-restart`, restart/redeploy the service, then run `verify-restart` with the returned post id;
7. confirm PostgreSQL persistence and signed media preview after restart.

### Milestone 2 — Scheduler + Telegram

Only after that gate:

- add Redis + BullMQ;
- create publication jobs per `PostTarget`;
- separate web scheduling from worker delivery;
- implement idempotency and duplicate protection;
- bounded retry with TEMPORARY / AUTH / VALIDATION / PERMANENT classes;
- restart recovery;
- TelegramConnector using official Bot API;
- persist real remote `message_id` before showing `PUBLISHED`;
- test partial success where Telegram succeeds and another target fails without republishing Telegram.

### Later

- MAX connector after Telegram stability;
- OpenAI Responses API research/text generation and image generation into drafts;
- persisted source provenance for researched posts;
- real provider analytics;
- smart automation only after publication/analytics are trustworthy.

## Milestone 1 definition-of-done checklist

- [x] production Next.js runtime established;
- [x] PostgreSQL schema/migrations implemented;
- [x] owner-only auth/session implemented;
- [x] server-authoritative content CRUD implemented;
- [x] Telegram/MAX PostTarget persistence implemented;
- [x] private media-storage boundary implemented;
- [x] browser-only persistence removed from production planner flow;
- [x] fake publication success removed;
- [x] GitHub Actions verification implemented and green before final report update;
- [x] Render blueprint + DB health endpoint implemented;
- [x] deployed smoke script implemented;
- [ ] real Render health check verified;
- [ ] real deployed Foundation smoke verified;
- [ ] restart/redeploy persistence smoke verified.

Until the final three items are green, Milestone 1 is code-complete but not fully deployment-verified.
