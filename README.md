# Planly

Personal SMM Planner for one owner.

Main flow:

`Создать контент → выбрать Telegram/MAX → выбрать время → сохранить → позже опубликовать через worker`

This repository is the authoritative Planly source. Target runtime: the owner's server with Next.js, PostgreSQL, Redis and a standalone worker. See [self-host launch and verification](docs/SELF_HOST.md). Render remains optional; legacy Sites/Vinext files are not the production runtime.

## Current milestone

**MVP v1 / Phase 4 — Telegram/MAX publication and UI completion**

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
- Telegram and MAX connectors with historical live provider verification;
- Docker Compose for web, worker, migrations, PostgreSQL, Redis and private media storage.

Not implemented yet:

- OpenAI research/text/image generation;
- production analytics.

A UI state is never treated as proof that a social network actually published a post. Historical provider evidence and its runtime scope are recorded in [the handoff inspection](docs/verification/2026-10-03-handoff-inspection.md). Current work completes the navigation/settings flow; it does not add AI or publish test content.

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

Queue/processor/worker and both provider connectors are implemented. Self-host verification checks the actual container runtime. The current goal is a simpler sidebar and social-account management in Settings; see [ROADMAP.md](ROADMAP.md) for verification limits and the remaining browser gate.

OpenAI content research/generation remains a later milestone after publication is trustworthy.

## Project docs

- `docs/verification/2026-10-03-handoff-inspection.md` — current handoff evidence and verification limits.
- `docs/baseline/CURRENT_STATE.md` — historical baseline; current code, CI and runtime take precedence.
- `docs/superpowers/specs/2026-09-30-planly-mvp-v1-design.md` — approved MVP v1 architecture.
- `docs/superpowers/plans/2026-10-01-foundation-content-core.md` — Milestone 1 implementation plan.
