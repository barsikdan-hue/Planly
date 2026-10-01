# Planly Foundation + Content Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the selected light Planly prototype into a Render-ready single-owner application with standard Next.js runtime, PostgreSQL persistence, owner authentication, real draft CRUD, real media storage, and server-backed UI state while preserving the existing visual design.

**Architecture:** Keep the current Next.js/React UI and replace only the production path beneath it. Standard Next.js runs on Render; PostgreSQL via Drizzle is the source of truth; route handlers call focused server services; media uses an S3-compatible object-store adapter; browser IndexedDB becomes non-authoritative legacy code and is removed from the active runtime. Scheduler, Telegram, MAX, OpenAI and analytics remain outside this milestone.

**Tech Stack:** Node.js >=22.13.0, Next.js 16, React 19, TypeScript 5.9, pnpm 11, Drizzle ORM + PostgreSQL, Zod, Node crypto, S3-compatible object storage, node:test, GitHub Actions, Render.

**Spec:** `docs/superpowers/specs/2026-09-30-mvp-v1-design.md`

## Global Constraints

- Preserve the current light UI and component structure under `components/planner/*`.
- GitHub `main` is the source of truth; do not use the uploaded local ZIP as implementation input.
- Do not rewrite the product from scratch.
- Do not implement Redis/BullMQ, Telegram, MAX, OpenAI or real analytics in this milestone.
- Do not claim scheduled/remote publication works before the scheduler/provider milestones.
- PostgreSQL is authoritative for application state; IndexedDB/localStorage must not be required for production behavior.
- Single owner only: no registration, teams, roles, billing or complex permissions.
- Secrets are server-only and never returned to client code or logs.
- Telegram/MAX credentials remain Render secrets in MVP v1; do not add token columns merely because a provider may need them later.
- Active MVP providers are `TELEGRAM` and `MAX`; VK/Instagram are outside MVP v1.
- Server validates every mutation and every media upload.
- TDD for behavior changes: failing test first, minimal implementation, full relevant suite green, then commit.

## Review Focus

1. **Cross-owner access by guessed IDs** — every service mutation/query must scope by `userId`; integration tests attempt access with a second fixture owner and expect not-found/forbidden behavior.
2. **Lost update / double-submit** — repeated create/update requests must not silently create duplicate posts or targets; client save buttons remain locked during mutation and server updates are transactional.
3. **Fake publication semantics** — UI must not mark a post `PUBLISHED` or pretend a provider send occurred; scheduling stores intent only and is visibly pending scheduler integration.
4. **Malicious media** — MIME/extension/magic bytes/size are checked server-side; mismatch is rejected before object storage write.
5. **Auth/session leakage** — session cookie is HttpOnly, Secure in production, SameSite=Lax; raw session tokens/passwords/auth headers never enter DB logs or client responses.

---

## Task 1: Switch the Production Runtime to Standard Next.js and Add Reproducible CI

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `.github/workflows/ci.yml`
- Create: `tests/runtime-config.test.mjs`
- Preserve unused for now: `build/*`, `scripts/run-framework.mjs`, other Sites/Cloudflare helpers

**Interfaces:**
- Consumes: current Next `app/*` and `components/*` UI.
- Produces: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm typecheck`, `pnpm lint`, `pnpm test` as the only supported production verification commands.

- [ ] **Step 1: Write `tests/runtime-config.test.mjs` that fails against the current package scripts**

Assert:
- `scripts.dev === "next dev"`;
- `scripts.build === "next build"`;
- `scripts.start === "next start"`;
- `scripts.typecheck === "tsc --noEmit"`;
- `scripts.test` exists and runs Node tests;
- `packageManager` remains pnpm;
- Node engine remains `>=22.13.0`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/runtime-config.test.mjs`
Expected: FAIL because production scripts still point to Vinext/Wrangler helpers.

- [ ] **Step 3: Update `package.json` minimally**

Required changes:
- standard Next dev/build/start scripts;
- add `typecheck` and `test` scripts;
- add PostgreSQL/S3/security dependencies only when Tasks 2–6 need them; do not delete dormant Sites dependencies in this milestone unless they break standard Next verification.

- [ ] **Step 4: Remove `@cloudflare/workers-types` from the active TypeScript `types` list**

Keep `node`. Do not delete historical platform source files solely for cleanup.

- [ ] **Step 5: Verify GREEN**

Run:
- `node --test tests/runtime-config.test.mjs`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Expected: all exit 0.

- [ ] **Step 6: Add Linux CI**

`.github/workflows/ci.yml` uses Node 22.13+ and pnpm 11, runs frozen install, `typecheck`, `lint`, `test`, `build`. PostgreSQL service is added when Task 2 integration tests land.

- [ ] **Step 7: Commit**

`git commit -m "build: run Planly on standard Next.js"`

---

## Task 2: Replace the Empty D1 Scaffold With PostgreSQL Schema and Migrations

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/index.ts`
- Modify: `drizzle.config.ts`
- Create: `lib/server/env.ts`
- Create: `tests/db-schema.test.ts`
- Create: `tests/db.integration.test.ts`
- Create generated migration files under: `drizzle/*`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `getDb()`, `closeDb()`, validated `serverEnv`, and Drizzle tables `users`, `sessions`, `loginRateLimits`, `socialAccounts`, `posts`, `postTargets`, `mediaAssets`, `postMedia`, `publications`.

- [ ] **Step 1: Write failing schema tests**

Assert exact table/column constraints required by the approved spec:
- one unique owner email;
- session token hash unique + expiry;
- social provider enum only `TELEGRAM | MAX`;
- post status `DRAFT | READY | ARCHIVED`;
- independent PostTargets with nullable `textOverride` and `scheduledAt`;
- media metadata and ordered join table;
- publication status/error fields + unique `idempotencyKey`;
- foreign keys cascade only where deleting the owner/post should delete owned child records.

- [ ] **Step 2: Run schema tests and verify RED**

Expected: FAIL because `db/schema.ts` is intentionally empty.

- [ ] **Step 3: Implement PostgreSQL schema in `db/schema.ts`**

Use application-generated UUID strings. Use timezone-aware timestamps. Do not add provider token columns.

- [ ] **Step 4: Replace D1 `getDb()` with Node PostgreSQL Drizzle**

`db/index.ts` exports:
- `getDb(): NodePgDatabase<typeof schema>`
- `closeDb(): Promise<void>`

Use a singleton `pg.Pool` and `DATABASE_URL` from `lib/server/env.ts`.

- [ ] **Step 5: Convert `drizzle.config.ts` to PostgreSQL**

Use `dialect: "postgresql"`, `schema: "./db/schema.ts"`, `out: "./drizzle"`, credentials from `DATABASE_URL`.

- [ ] **Step 6: Generate migration and add PostgreSQL CI service**

Add scripts:
- `db:generate`
- `db:migrate`

CI PostgreSQL must apply migrations before integration tests.

- [ ] **Step 7: Write and run DB integration tests**

Prove:
- migrations apply to an empty DB;
- insert/read/update/delete works;
- FK ownership relations work;
- duplicate unique fields are rejected.

- [ ] **Step 8: Run full verification and commit**

Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

Commit: `git commit -m "feat: add PostgreSQL content schema"`

---

## Task 3: Add Single-Owner Authentication and Persistent Sessions

**Files:**
- Create: `lib/server/auth/password.ts`
- Create: `lib/server/auth/session.ts`
- Create: `lib/server/auth/rate-limit.ts`
- Create: `lib/server/auth/owner.ts`
- Create: `app/login/page.tsx`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Modify: `app/page.tsx`
- Create: `scripts/hash-owner-password.mjs`
- Create: `tests/auth.test.ts`
- Create: `tests/auth.integration.test.ts`

**Interfaces:**
- `verifyOwnerPassword(password: string, encodedHash: string): Promise<boolean>`
- `createOwnerSession(userId: string): Promise<string>` returns raw cookie token exactly once
- `getOwnerFromSession(): Promise<Owner | null>`
- `requireOwner(): Promise<Owner>` for pages
- `requireApiOwner(request?: Request): Promise<Owner>` for API routes
- `destroyOwnerSession(): Promise<void>`

- [ ] **Step 1: Write RED tests for password/session/auth behavior**

Cover correct password, wrong password, expired session, random/forged cookie, logout invalidation, and another user’s session.

- [ ] **Step 2: Implement password hashing using Node `crypto.scrypt`**

Encoded hash stores algorithm/version/salt/parameters/hash; password plaintext is never persisted or logged.

- [ ] **Step 3: Implement opaque DB sessions**

Cookie: `planly_session`; random 32-byte token; DB stores HMAC-SHA256 token hash using `SESSION_SECRET`; 7-day expiry; HttpOnly; SameSite=Lax; Secure in production.

- [ ] **Step 4: Implement persistent login rate limit**

Use `loginRateLimits` table keyed by SHA-256 of client fingerprint/IP. Rule: 5 failed attempts per 15 minutes; successful login clears the bucket. Never store raw IP solely for rate limiting.

- [ ] **Step 5: Add login/logout routes and owner login page**

No registration. Login accepts owner email + password. Email must equal server `OWNER_EMAIL` after normalization.

- [ ] **Step 6: Guard `app/page.tsx` with `requireOwner()`**

Do not depend on ChatGPT Sites headers in Render production. Keep `app/chatgpt-auth.ts` untouched as legacy Sites compatibility code, but remove it from the production authentication path.

- [ ] **Step 7: Run auth + full suite and commit**

Commit: `git commit -m "feat: add owner authentication"`

---

## Task 4: Add Server Content Services With Ownership and Transactions

**Files:**
- Create: `lib/contracts/planner.ts`
- Create: `lib/server/posts.ts`
- Create: `lib/server/social-accounts.ts`
- Create: `lib/server/profile.ts`
- Create: `tests/posts.integration.test.ts`
- Create: `tests/social-accounts.integration.test.ts`
- Modify: `lib/planner.ts`

**Interfaces:**
- `listPlannerPosts(userId: string): Promise<PostDto[]>`
- `createPost(userId: string, input: SavePostInput): Promise<PostDto>`
- `updatePost(userId: string, postId: string, input: SavePostInput): Promise<PostDto>`
- `deletePost(userId: string, postId: string): Promise<void>`
- `listSocialAccounts(userId: string): Promise<SocialAccountDto[]>`
- `setSocialAccountEnabled(userId: string, accountId: string, enabled: boolean): Promise<SocialAccountDto>`
- `getProfile(userId: string): Promise<ProfileDto>`
- `updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileDto>`

- [ ] **Step 1: Write ownership/transaction RED tests**

Cover create/edit/delete, per-provider text override, media order, scheduledAt, second-owner isolation, duplicate submit/idempotent update expectations, invalid provider, and rollback when target write fails.

- [ ] **Step 2: Define DTO/input schemas in `lib/contracts/planner.ts` with Zod**

Client contracts use lowercase UI provider values `telegram | max`; DB maps them to enum `TELEGRAM | MAX` only at server boundary.

- [ ] **Step 3: Implement services transactionally**

One Post save updates Post + PostTargets + post-media relation atomically. Services always require `userId` and query owned records only.

- [ ] **Step 4: Update `lib/planner.ts` active network model**

`Network = 'telegram' | 'max'`. Remove VK/Instagram from active MVP seed/types. Keep pure client validation helpers where useful; no DB calls in this file.

- [ ] **Step 5: Seed/ensure the two owner SocialAccount rows**

At owner bootstrap ensure Telegram and MAX rows exist with `DISCONNECTED` status and no credentials in DB.

- [ ] **Step 6: Run integration + full suite and commit**

Commit: `git commit -m "feat: add server content services"`

---

## Task 5: Expose Authenticated Content API

**Files:**
- Create: `app/api/bootstrap/route.ts`
- Create: `app/api/posts/route.ts`
- Create: `app/api/posts/[id]/route.ts`
- Create: `app/api/profile/route.ts`
- Create: `app/api/social-accounts/[id]/route.ts`
- Create: `lib/server/http.ts`
- Create: `tests/api-contract.test.ts`

**Interfaces:**
- `GET /api/bootstrap` -> `{ profile, posts, media, socialAccounts }`
- `POST /api/posts` -> created `PostDto`
- `PATCH /api/posts/:id` -> updated `PostDto`
- `DELETE /api/posts/:id` -> 204
- `PATCH /api/profile` -> updated `ProfileDto`
- `PATCH /api/social-accounts/:id` -> updated account

- [ ] **Step 1: Write RED contract tests**

Assert unauthorized 401, malformed JSON 400, invalid Zod input 422, unknown/other-owner record 404, valid CRUD response shapes, and safe errors without stack/secrets.

- [ ] **Step 2: Implement shared JSON/error helpers**

Normalize validation and not-found errors. Never echo provider/database internals to the client.

- [ ] **Step 3: Implement route handlers as thin adapters**

Every route calls `requireApiOwner` then service functions; no business logic duplicated in routes.

- [ ] **Step 4: Run route/service tests and full suite**

- [ ] **Step 5: Commit**

`git commit -m "feat: expose authenticated content API"`

---

## Task 6: Add Server-Side Media Validation and S3-Compatible Storage

**Files:**
- Create: `lib/server/media-validation.ts`
- Create: `lib/server/storage.ts`
- Create: `lib/server/media.ts`
- Create: `app/api/media/route.ts`
- Create: `app/api/media/[id]/route.ts`
- Create: `tests/media-validation.test.ts`
- Create: `tests/media.integration.test.ts`
- Modify: `package.json`

**Interfaces:**
- `validateMediaUpload(file: File): Promise<ValidatedMedia>`
- `putMediaObject(input): Promise<{ key: string }>`
- `createMediaAsset(userId: string, file: File): Promise<MediaDto>`
- `deleteMediaAsset(userId: string, mediaId: string): Promise<void>`
- `GET /api/media` -> owner media list with time-limited preview URLs
- `POST /api/media` multipart -> `MediaDto`
- `DELETE /api/media/:id` -> 204

- [ ] **Step 1: Write media RED tests**

Allow only JPEG, PNG, WebP, MP4, WebM; max 20 MiB/file; reject zero bytes, MIME/signature mismatch, renamed executable/random bytes, oversized image dimensions, and cross-owner deletion.

- [ ] **Step 2: Implement validation before object-store write**

Use magic bytes plus MIME allowlist; SHA-256 checksum; use `sharp` for image metadata/dimension validation; safe generated object key independent from filename.

- [ ] **Step 3: Implement private S3-compatible adapter**

Server env:
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

Use presigned GET URLs for preview. Credentials never reach browser state.

- [ ] **Step 4: Ensure DB/object-storage failure ordering is safe**

No MediaAsset row on failed object upload; delete object on DB insert failure; reject deletion of media still attached to a post unless detach is explicitly requested by the caller.

- [ ] **Step 5: Run media + full suite and commit**

Commit: `git commit -m "feat: add server media storage"`

---

## Task 7: Replace IndexedDB Production State With the Server API Without Redesigning UI

**Files:**
- Modify: `components/planner/app.tsx`
- Modify: `components/planner/composer.tsx`
- Modify: `components/planner/common.tsx`
- Modify: `components/planner/settings.tsx`
- Modify as needed: `components/planner/dashboard.tsx`, `components/planner/calendar.tsx`, `components/planner/library.tsx`
- Create: `lib/client/planly-api.ts`
- Keep but stop importing in production: `lib/browser-store.ts`
- Modify: `tests/planner.test.mjs`
- Modify/Create: `tests/render-check.tsx`

**Interfaces:**
- `loadPlanner(): Promise<PlannerBootstrap>`
- `savePost(input): Promise<PostDto>`
- `removePost(id): Promise<void>`
- `uploadMedia(files): Promise<MediaDto[]>`
- `removeMedia(id): Promise<void>`
- `saveProfile(input): Promise<ProfileDto>`
- `setAccountEnabled(id, enabled): Promise<SocialAccountDto>`

- [ ] **Step 1: Add RED component/render tests for server-backed behavior**

Assert:
- no active import/use of `readStore`/`writeStore`;
- initial state comes from bootstrap API;
- save/update/delete calls server endpoints;
- failed request preserves current editor content and shows error;
- double-click while saving does not duplicate create;
- only Telegram/MAX appear;
- no button/text claims a real remote publication occurred.

- [ ] **Step 2: Implement `lib/client/planly-api.ts`**

Centralize fetch, JSON parsing, 401 redirect-to-login behavior and typed errors.

- [ ] **Step 3: Adapt `PlannerApp` to server snapshot/mutations**

Preserve navigation/layout. Remove demo seed fallback from authenticated production path. Keep optimistic UI only where rollback is explicit; otherwise apply server-returned DTO.

- [ ] **Step 4: Adapt composer to Foundation semantics**

- drafts save normally;
- date/time and targets can be stored;
- `Запланировать` stores schedule intent but UI clearly says scheduler delivery is not active until the next milestone;
- remove `Опубликовать (демо)` and all fake published success paths;
- disconnected accounts may be selected for a draft but cannot be presented as connected.

- [ ] **Step 5: Adapt Social Accounts UI**

Show Telegram and MAX only. Show persisted status `DISCONNECTED | CONNECTED | ERROR`; in this milestone both remain disconnected until provider integration. Do not ask for provider tokens in browser UI.

- [ ] **Step 6: Verify reload persistence**

Integration/E2E check: create draft -> reload -> same draft from PostgreSQL; edit -> reload -> change remains; delete -> reload -> absent.

- [ ] **Step 7: Run full suite/build and commit**

Commit: `git commit -m "feat: move planner state to server persistence"`

---

## Task 8: Render Deployment Configuration and Foundation Verification

**Files:**
- Create: `render.yaml`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `docs/baseline/CURRENT_STATE.md`
- Create: `tests/foundation-smoke.mjs`

**Interfaces:**
- Produces one Render web service connected to one Render PostgreSQL instance.
- Redis/worker are intentionally absent until Milestone 2.

- [ ] **Step 1: Add safe env template**

Names only, no values/secrets:
- `DATABASE_URL`
- `OWNER_EMAIL`
- `OWNER_PASSWORD_HASH`
- `SESSION_SECRET`
- S3 variables from Task 6
- `NODE_ENV`

- [ ] **Step 2: Add Render blueprint/config for web + Postgres only**

Build command runs frozen pnpm install/migration/build as appropriate; start uses `pnpm start`; health endpoint is added if needed at `app/api/health/route.ts` and proves DB connectivity without exposing details.

- [ ] **Step 3: Add Foundation smoke test**

Against test deployment/local server:
1. unauthenticated `/` redirects to login;
2. valid owner login succeeds;
3. create draft;
4. reload and read draft;
5. edit per-network Telegram/MAX text;
6. upload one valid image;
7. reload and preview image;
8. invalid media rejected;
9. logout invalidates session;
10. restart app and repeat read to prove PostgreSQL persistence.

- [ ] **Step 4: Run security checks**

Search client bundle/source for configured secret values/names used incorrectly; verify responses/logs contain no raw password, session token, DATABASE_URL or S3 secret.

- [ ] **Step 5: Final verification**

Required green evidence:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- migrations on empty PostgreSQL
- Foundation smoke test
- GitHub Actions green
- Render health check green

- [ ] **Step 6: Update report and commit**

`docs/baseline/CURRENT_STATE.md` gets DONE / TESTED / KNOWN ISSUES / TECH DEBT / NEXT PHASE.

Commit: `git commit -m "docs: verify Planly foundation and content core"`

---

## Plan Self-Review Result

- **Spec coverage:** Covers approved MVP v1 Milestone 1 only: Render runtime, PostgreSQL, single-owner auth, Post/PostTarget/SocialAccount/MediaAsset/Publication schema, real drafts, server media, and production persistence. Scheduler/providers/AI remain explicit non-goals.
- **Current-code fit:** Plan starts from the actual modular light UI, current IndexedDB store, empty D1 schema, D1 DB adapter and Sites/Vinext scripts observed on `main` after PR #1.
- **Minimality:** Dormant Sites/Cloudflare files are not deleted merely to make the repository aesthetically pure. Production path is switched without a broad cleanup refactor.
- **Type consistency:** Client uses lowercase `telegram|max`; server/DB uses uppercase provider enum; conversion happens only in contracts/services.
- **Review Focus:** ownership, duplicate saves, fake publication state, malicious media and auth leakage each have an owning test task.
- **Next phase:** only after this plan is green may Milestone 2 add Redis + BullMQ + publication worker.
