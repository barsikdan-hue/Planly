# Planly

Personal SMM Planner for one owner.

Main flow:

`Создать контент → выбрать Telegram/MAX → выбрать время → сохранить → позже опубликовать через worker`

This repository is the authoritative Planly source. The current production and final acceptance environment is the existing Render deployment. The eventual Phase 10 target is the owner's server with Next.js, PostgreSQL, Redis and a standalone worker; see [self-host launch and verification](docs/SELF_HOST.md). Legacy Sites/Vinext files are not the production runtime.

## Current milestone

**MVP v1 / Phase 4 — Telegram/MAX Functional MVP DONE**

PR #4 is merged and deployed on the existing Render service at `af6288540bfe34d12e992b0535dfc2e04a5bc787`. Functional MVP acceptance combines the owner-confirmed production UI/media/MAX handoff at this SHA with the final fresh Telegram gate: bot/destination permission validation, PNG upload/preview/publication and scheduled text publication, with no duplicates observed after a control scheduler tick. See [production acceptance and evidence scope](docs/verification/2026-10-04-functional-mvp-production-pass.md). Phase 5 Content Library is next; starting it is a separate milestone decision.

Implemented in this milestone:

- Next.js production runtime;
- PostgreSQL + Drizzle migrations;
- owner-only authentication and hashed server sessions;
- server-authoritative Post/PostTarget/SocialAccount/MediaAsset/Publication data model;
- Telegram and MAX only in the active MVP UI;
- per-network text and schedule intent;
- private S3-compatible media storage with server validation and signed previews;
- real API persistence instead of IndexedDB;
- database-backed `/api/health`;
- GitHub Actions verification;
- Render web + PostgreSQL deployment blueprint;
- Redis/BullMQ queue, worker, bounded retry and reconciliation;
- Telegram and MAX connectors, accepted production behavior and scoped live provider evidence;
- content validation before enqueue, editor reload recovery and selected media preview order;
- repeatable post creation after a lost response and protection of published or uncertain originals;
- Docker Compose for web, worker, migrations, PostgreSQL, Redis and private media storage.

Not implemented yet:

- production analytics.

AI research/text/image generation is removed from the product roadmap. Additional networks require an explicit owner decision.

A UI state is never treated as proof that a social network actually published a post. The [current production acceptance report](docs/verification/2026-10-04-functional-mvp-production-pass.md) distinguishes fresh Telegram receipts from the accepted earlier UI/media/MAX handoff; MAX was not freshly rerun for the final Telegram gate. Historical branch checks and provider evidence retain their original scope. Development may use local browsers; final user-facing acceptance uses the existing Render deployment in a browser. Edge is preferred, not mandatory. Delivery follows the full Harness and human gates in [AGENTS.md](AGENTS.md).

## Requirements

- Node.js `>=22.13.0`
- pnpm `11.25.0`
- PostgreSQL 17-compatible server
- private S3-compatible object storage for media

## Environment

Copy `.env.example` to your local environment file and supply real values outside Git.

Required server variables:

- `DATABASE_URL`
- `OWNER_EMAIL`
- `OWNER_PASSWORD_HASH`
- `SESSION_SECRET`
- `S3_ENDPOINT`
- `S3_PUBLIC_ENDPOINT` (optional browser endpoint when storage is inside Docker)
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `NODE_ENV`
- `REDIS_URL`

Never expose these through `NEXT_PUBLIC_*` or client code.

`OWNER_PASSWORD_HASH` is a scrypt hash, not a plaintext password. Configure `TELEGRAM_BOT_TOKEN` and `MAX_BOT_TOKEN` only on the server for the corresponding connectors. Never expose provider tokens to the browser.

## Local setup

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Production-style build:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

## Database

PostgreSQL is the source of truth.

Core tables cover:

- users / sessions;
- social accounts;
- posts;
- post targets;
- media assets and post-media ordering;
- publications;
- persistent login-rate-limit state.

Run migrations with:

```bash
pnpm db:migrate
```

Schema changes must be migration-backed. Do not edit production tables manually as an application workflow.

## Media

Media is not stored in browser state.

The server validates:

- supported MIME types;
- file size;
- file signature / magic bytes;
- image dimensions;
- ownership and attachment constraints.

Objects are written to private S3-compatible storage under generated keys. The UI receives temporary signed preview URLs, never storage credentials.

## Authentication

Planly is currently a single-owner application.

- Login endpoint: `/api/auth/login`
- Logout endpoint: `/api/auth/logout`
- Session cookie stores an opaque token; the database stores only its hash.
- Protected API routes derive ownership from the server session.
- There are no roles, teams or multi-tenant permissions in MVP v1.

## API / UI boundary

The frontend reads a server snapshot and performs mutations through Next.js route handlers.

IndexedDB is no longer authoritative for production planner data. UI state changes only after the server confirms the mutation, so a network error cannot silently pretend a draft was saved.

Unsaved editor changes are kept separately in owner-scoped `sessionStorage` for recovery after reloading the same tab. Text, per-network variants, selected networks, date/time and references to uploaded media are restored after authentication. Closing the tab or browser is outside this recovery guarantee. Explicit saving is still required to store a draft in PostgreSQL; recovery performs no automatic save or publication.

New-post requests persist their exact payload and creation key before dispatch. After a lost response, manual retry resolves the original post before applying newer edits to its confirmed ID. Switching to another editor is blocked while creation remains unresolved. The creation key lasts while its post row exists; hard deletion ends that guarantee.

Published, publishing or uncertain originals reject content changes. The editor offers a separate draft copy using the current local text, variants and media. Exact unchanged server replays remain harmless; retrying a pending creation does not republish its original.

Active social networks in this milestone are exactly:

- Telegram
- MAX

Account connection is confirmed by the server after validating the bot and destination permissions. An account without a confirmed connection remains `DISCONNECTED`.

## Verification

Main verification commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The test suite includes ownership, auth/session invalidation, validation, PostgreSQL persistence, media safety, UI/server contract, deployment config and health checks.

For a deployed Foundation smoke test:

```bash
PLANLY_BASE_URL=https://your-planly.example \
PLANLY_OWNER_EMAIL=owner@example.com \
PLANLY_OWNER_PASSWORD='your-plaintext-login-password' \
pnpm smoke:foundation
```

The smoke flow checks login, create/read/update/delete persistence, Telegram/MAX per-network text, valid and invalid media, signed preview and logout invalidation.

Restart persistence is split deliberately into two phases:

```bash
PLANLY_SMOKE_PHASE=seed-restart ... pnpm smoke:foundation
# restart/redeploy the web service, keep the returned post id
PLANLY_SMOKE_PHASE=verify-restart PLANLY_RESTART_POST_ID=<id> ... pnpm smoke:foundation
```

Do not put smoke-test plaintext credentials into committed files or CI logs.

## Render

`render.yaml` defines only:

- one web service;
- one PostgreSQL database.

The Render blueprint does not provision a paid worker. The existing GitHub scheduler workflow calls the authenticated `/api/scheduler/tick` endpoint. The owner's-server target uses the standalone worker in `compose.yaml`.

The web service uses `/api/health`, which returns `200 {"status":"ok"}` only when PostgreSQL responds. Configuration details are not returned to the client.

Before the first real deployment, set the owner credentials/session secret and S3-compatible storage variables in Render secret environment settings.

## Roadmap

Publication path:

`Post → PostTarget → BullMQ Job → Worker → TelegramConnector / MaxConnector`

Foundation, UI, Content Core, scheduler core and Telegram/MAX Functional MVP are DONE for MVP. Phase 5 Content Library is NEXT, followed by Phase 6 Smart Content Queue / Swipe Planner, Phase 7 additional networks only by explicit owner decision, Phase 8 analytics, Phase 9 scheduling automation and Phase 10 target hosting optimization. See [ROADMAP.md](ROADMAP.md) for phase contracts and [production acceptance](docs/verification/2026-10-04-functional-mvp-production-pass.md) for current evidence. GitHub scheduler timing remains accepted temporary tech debt until the Phase 10 target self-host deployment.

Smart Content Queue uses left reject/right approve, then the next free slot or manual date/time. A ContentSuggestion becomes a Post only after approval. AI is excluded.

## Project docs

- `docs/verification/2026-10-04-functional-mvp-production-pass.md` — current Functional MVP acceptance, deployed SHA and final Telegram evidence.
- `docs/verification/2026-10-03-functional-mvp.md` — verified functional branch, final acceptance and limits.
- `docs/verification/2026-10-03-handoff-inspection.md` — historical production handoff evidence and verification limits.
- `docs/baseline/CURRENT_STATE.md` — historical baseline; current code, CI and runtime take precedence.
- `docs/superpowers/specs/2026-09-30-planly-mvp-v1-design.md` — approved MVP v1 architecture.
- `docs/superpowers/plans/2026-10-01-foundation-content-core.md` — Milestone 1 implementation plan.
