# Planly MVP v1 Design

**Date:** 2026-09-30  
**Status:** Approved design, implementation not started  
**Product:** Planly — Personal SMM Planner

## 1. Product goal

Planly is a personal content-control center for one owner. The primary workflow is deliberately short:

`Create content -> choose Telegram/MAX -> choose publish now or time -> publish -> see result`

The MVP must replace demo behavior with a real production path. A frontend badge is not proof of publication: success exists only after the provider API confirms it and a remote message/post identifier is stored.

Planly is not a corporate SaaS. MVP v1 must not add teams, roles, billing, subscriptions, CRM, white-label, marketplace, complex permissions, mobile apps, or broad multi-network support.

## 2. Current state

The existing UI prototype already covers Dashboard, Create Post, Calendar, Content, Media, Social Accounts, Settings, demo analytics and an AI-assistant placeholder.

Known starting limitations from the prior audit:

- the local implementation is a frontend prototype;
- content persistence is based on localStorage;
- media is stored as browser-side Data URLs;
- authentication and social connections are demo implementations;
- real provider publishing has not been proven;
- `barsikdan-hue/Planly` is currently empty;
- no Planly Render service, PostgreSQL instance, or Redis/Key Value instance exists yet.

The existing UI is the design baseline. Reuse it rather than redesigning the product unless a backend requirement forces a targeted UI change.

## 3. MVP v1 scope

MVP v1 contains seven sequential capabilities:

1. consolidate the existing source into the `Planly` GitHub repository;
2. establish backend, PostgreSQL, owner authentication, media storage, logging and tests;
3. implement real Post/PostTarget/Media/SocialAccount/Publication persistence;
4. implement persistent scheduling with Redis + BullMQ and a publication worker;
5. implement real Telegram publishing and verify it end-to-end;
6. implement real MAX publishing and verify it end-to-end;
7. add AI Content Studio using OpenAI for web research, post drafting, image generation and saving results as editable drafts.

VK, Instagram, analytics recommendations, automatic content plans and automatic publishing of AI-generated material are outside MVP v1.

## 4. Architecture

Keep one repository and one product, not a microservice fleet.

### 4.1 Runtime units

**Next.js web application**
- existing UI;
- forms and preview;
- server-side API routes/actions;
- owner authentication;
- CRUD for posts, media, social accounts and schedules;
- AI draft endpoints.

**PostgreSQL**
- source of truth for application state;
- posts, targets, accounts, publications, media metadata and AI research metadata.

**Redis / Render Key Value**
- BullMQ queue only;
- delayed jobs and retry coordination;
- never the source of truth for posts/publication status.

**Publication worker**
- consumes publication jobs;
- reloads the current Publication from PostgreSQL;
- calls the correct social connector;
- stores provider IDs, status and diagnostics;
- applies retry and idempotency rules.

**Object storage**
- S3-compatible storage, Cloudflare R2 as the default MVP choice;
- stores uploaded and AI-generated media;
- PostgreSQL stores metadata and storage keys, never permanent Data URLs.

**External APIs**
- Telegram Bot API;
- MAX API;
- OpenAI API using Responses API for text/research and image generation for draft artwork.

### 4.2 Deployment

Target deployment is Render:

- one Planly web service;
- one Planly background worker;
- one PostgreSQL instance;
- one Key Value/Redis instance;
- secrets only in Render environment variables;
- object-storage credentials server-side only.

Web and worker are built from the same repository and share TypeScript modules instead of communicating through an unnecessary internal microservice.

## 5. Authentication and ownership

MVP v1 is single-owner.

Use a small server-side authentication flow:

- no public registration;
- owner email configured server-side;
- password stored only as a strong hash in a server-managed secret/environment variable, never plaintext in the repository;
- successful login creates a server-side session represented by an HttpOnly cookie;
- production cookie is `Secure` with an appropriate `SameSite` policy;
- session expiration is enforced;
- login is rate-limited;
- all data access is ownership-scoped even though only one owner exists.

Do not preserve demo auth as a production mechanism. Do not store sessions, provider tokens or OpenAI credentials in localStorage/sessionStorage.

## 6. Core data model

### User
- `id`
- `email`
- timestamps

One owner exists in MVP v1.

### Post
Represents the editable content item.
- `id`
- `userId`
- `title`
- `baseText`
- `status`: `DRAFT | READY | ARCHIVED`
- timestamps

A Post is not globally published. Publication status belongs to each target/publication.

### PostTarget
Represents how one Post should appear on one social account.
- `id`
- `postId`
- `socialAccountId`
- `textOverride` nullable
- `scheduledAt` nullable
- timestamps

`textOverride` allows Telegram and MAX to have different text without duplicating the whole Post.

### SocialAccount
- `id`
- `userId`
- `provider`: `TELEGRAM | MAX`
- provider account/channel identifier
- display name
- encrypted provider credential/token material where persistence is required
- connection status
- timestamps

If a provider token can remain entirely in Render secrets for one fixed account, prefer that simpler path over duplicating the secret in the database.

### MediaAsset
- `id`
- `userId`
- object-storage key
- MIME type
- byte size
- checksum
- width/height where applicable
- duration where applicable
- source: `UPLOAD | AI_GENERATED`
- timestamps

An ordered relation connects media assets to a Post.

### Publication
One PostTarget produces one independent publication stream.
- `id`
- `userId`
- `postId`
- `postTargetId`
- provider
- `status`: `SCHEDULED | QUEUED | PUBLISHING | PUBLISHED | FAILED | CANCELLED | REQUIRES_RECONNECT`
- `scheduledAt`
- `publishedAt` nullable
- provider remote ID nullable
- provider URL nullable
- attempt count
- last attempt timestamp
- next retry timestamp nullable
- normalized error type nullable
- provider error code/message nullable
- unique idempotency key
- timestamps

Telegram success and MAX failure must coexist cleanly for the same Post.

### AIResearchSource
Stores provenance for researched drafts.
- `id`
- `postId`
- URL
- title nullable
- domain
- retrieved timestamp
- source type

The user must be able to inspect what factual sources were used.

## 7. Social connector contract

Provider-specific code is isolated behind one common interface. Adding VK later must not require rewriting scheduler logic.

Required connector responsibilities:

- `validate()`
- `publish()`
- `uploadMedia()` where required
- `refreshToken()` where relevant
- `getPost()` where supported
- `getAnalytics()` where supported
- `getCapabilities()`

MVP implementations:
- `TelegramConnector`
- `MaxConnector`

Connector output normalizes:
- success/failure;
- remote ID;
- remote URL when available;
- provider diagnostics;
- normalized error category.

Unsupported features/metrics return an explicit unsupported/null state, never a fake zero.

## 8. Scheduler and idempotency

Flow:

`Post -> PostTarget -> Publication -> BullMQ job -> Worker -> SocialConnector`

Rules:

- PostgreSQL is authoritative;
- delayed jobs persist in Redis/BullMQ;
- every Publication has a unique idempotency key;
- worker reloads Publication state before publishing;
- a `PUBLISHED` publication must never be published again by retry logic;
- duplicate queue delivery must be harmless;
- retry of MAX must not repeat successful Telegram publication;
- app/worker restart must not lose scheduled work;
- status becomes `PUBLISHED` only after provider confirmation and remote-ID persistence;
- no infinite retries.

### Error categories

- **TEMPORARY**: timeout, network error, provider 429, provider 5xx -> bounded retry/backoff;
- **AUTH**: invalid/expired/revoked credential -> refresh where supported, otherwise `REQUIRES_RECONNECT`;
- **VALIDATION**: unsupported media, text limits, invalid destination -> no retry, expose reason;
- **PERMANENT**: provider rejection that cannot succeed unchanged -> `FAILED` with diagnostics.

Default retry sequence may start near 1m, 5m, 15m and 60m but remains configurable.

## 9. Telegram MVP

Telegram is the first production integration and must be stable before MAX is considered complete.

Support:
- text;
- single photo;
- video;
- media group where supported by the chosen Telegram flow;
- publish now;
- scheduled publication through Planly's worker;
- storing `chat_id` and returned `message_id`/equivalent remote identifier;
- normalized provider errors.

A Telegram integration test is complete only when:

`connected destination -> Planly draft -> publish -> Telegram confirms -> remote ID stored -> UI shows published`

Browser presence must not be required at publication time.

## 10. MAX MVP

MAX is the second production connector and uses the same Publication/Scheduler path as Telegram.

Support the capability set proven by current official MAX API documentation during implementation. At minimum MVP v1 targets:
- text;
- image attachment;
- publish now;
- scheduled publication through Planly's worker;
- remote message/post identifier persistence;
- remote URL persistence when returned;
- normalized errors.

Do not add MAX-specific branching to the generic scheduler beyond selecting `MaxConnector`.

## 11. Media handling

Remove permanent browser Data URLs from the production path.

Upload flow:

`browser -> server validation -> object storage -> MediaAsset -> Post relation`

Validate server-side:
- maximum size;
- extension;
- Content-Type;
- magic bytes/file signature;
- allowlisted formats;
- image dimensions where relevant;
- safe object-storage key generation.

Never trust only filename/browser MIME. Never expose object-storage secrets to frontend code.

## 12. AI Content Studio

AI is a draft-generation assistant, not an autonomous publisher.

### User-facing actions

MVP v1 supports:
- `Find topics`;
- `Research topic`;
- `Write post`;
- `Improve`;
- `Shorten`;
- `Add CTA`;
- `Adapt for Telegram`;
- `Adapt for MAX`;
- `Generate image`.

Every result remains editable before scheduling/publication.

### Research flow

`user request -> OpenAI Responses API -> web_search -> source list -> draft generation -> save Post + AIResearchSource`

Research should prioritize useful real-estate-agent subjects such as:
- current real-estate market developments;
- mortgages and financing changes;
- official regulatory changes;
- Rosreestr/government information;
- infrastructure/tourism developments relevant to southern Russian markets;
- practical buyer/investor education;
- Sochi/Anapa market context when useful.

AI must not fabricate current statistics, laws, project facts or market claims. Research-derived drafts keep the source list for inspection.

### Content Profile

MVP v1 includes a simple owner Content Profile used in AI prompts:
- role: real-estate agent;
- target audience;
- preferred regions;
- tone/style notes;
- forbidden/undesired phrasing;
- CTA preference;
- optional recurring topics.

It is stored server-side and editable in Settings. This is prompt context, not fine-tuning.

### Image generation

For educational/editorial/news-style posts, OpenAI image generation may create draft artwork.

Flow:

`Post context -> image brief -> OpenAI image generation -> server download -> object storage -> MediaAsset(source=AI_GENERATED) -> attach to draft`

Do not use AI-generated images as factual depictions of a specific property or residential complex unless clearly illustrative. Real property posts should use real media.

### AI safety boundary

AI endpoints cannot publish directly to Telegram/MAX. They can only create or modify drafts/media. Publishing always uses the normal PostTarget/Publication workflow.

## 13. UI changes

Keep the existing visual language.

Required functional changes only:
- replace demo persistence with backend data;
- replace demo social-account state with real connection state;
- make quick composer save real drafts;
- add Telegram and MAX target selection;
- expose per-target publication status;
- add AI Content Studio actions to existing composer/create flow;
- add source/provenance view for researched drafts;
- add real upload progress/error state;
- clearly mark or hide demo analytics until real metrics exist.

No broad dashboard redesign belongs in MVP v1.

## 14. Security

Secrets never enter client bundles or persisted browser state.

Server-only secrets include:
- Telegram bot token;
- MAX API token/credential;
- OpenAI API key;
- database connection string;
- Redis connection string;
- object-storage credentials;
- session secret/password hash/encryption key.

Required controls:
- input validation on mutations;
- ownership checks;
- rate limiting on login and AI-heavy endpoints;
- media validation;
- safe error responses without token leakage;
- no secrets in logs;
- dependency and secret scan before release;
- SSRF protection if arbitrary remote media URLs are later accepted;
- CSRF protection where applicable to the session pattern.

## 15. Observability

Use structured server logs with correlation IDs for publication attempts.

Log:
- publication ID;
- provider;
- attempt number;
- normalized result/error category;
- latency;
- provider status code where safe.

Never log provider tokens, OpenAI keys, passwords, cookies or raw authorization headers.

UI exposes a human-readable publication failure reason without sensitive provider payloads.

## 16. Testing strategy

### Foundation
- build/typecheck/lint;
- DB migration tests;
- auth happy path and invalid login;
- ownership tests;
- media-validation tests.

### Content core
- create/edit/delete draft;
- reload persistence;
- per-network text override;
- media ordering;
- invalid input rejection.

### Scheduler mandatory cases
- delayed job fires at intended time;
- duplicate queue delivery;
- worker restart before publish;
- worker restart around publish;
- provider timeout;
- 401/auth failure;
- 429;
- 5xx;
- permanent validation failure;
- partial success: Telegram published, MAX failed;
- repeated request does not duplicate an already published target.

### Telegram/MAX
For each connector:
- mocked contract tests for response normalization;
- real test-channel/destination smoke test;
- remote ID persistence;
- media publish where supported;
- network error behavior.

### AI
- research persists source metadata;
- generated text saves as draft, never published content;
- image generation creates stored MediaAsset;
- OpenAI timeout/error leaves existing draft intact;
- repeated AI request does not silently overwrite user-edited content.

### End-to-end MVP proof

1. owner logs in;
2. creates or AI-generates a post;
3. optionally generates/uploads an image;
4. chooses Telegram and/or MAX;
5. saves as draft;
6. schedules or publishes now;
7. closes the browser;
8. worker publishes independently;
9. remote IDs are stored;
10. UI displays independent result per target;
11. restart/retry does not create duplicate remote posts.

## 17. Delivery sequence

### Milestone 0 — Source consolidation
- obtain/export existing local source;
- compare it with active Site UI;
- preserve best existing implementation;
- commit a runnable baseline into `barsikdan-hue/Planly`;
- run current build/tests before feature work.

### Milestone 1 — Foundation + Content Core
- PostgreSQL;
- migrations/schema;
- owner auth;
- real draft CRUD;
- media/object storage;
- tests.

### Milestone 2 — Scheduler
- Render Key Value/Redis;
- BullMQ;
- worker;
- idempotency/retry/error classification;
- restart/duplicate tests.

### Milestone 3 — Telegram production slice
- TelegramConnector;
- real test channel;
- text/media publication;
- remote IDs;
- E2E verification.

### Milestone 4 — MAX production slice
- MaxConnector;
- real test destination;
- supported text/media publication;
- remote IDs;
- E2E verification.

### Milestone 5 — AI Content Studio
- Content Profile;
- web research;
- source persistence;
- writing/adaptation actions;
- image generation;
- AI output saved only as editable drafts.

### Milestone 6 — MVP verification
- full E2E suite;
- security/secret scan;
- restart/retry verification;
- real Telegram/MAX smoke publication;
- deployment health check;
- release report: DONE / TESTED / KNOWN ISSUES / TECH DEBT.

## 18. Definition of Done

MVP v1 is complete only when:
- existing Planly UI runs from the GitHub-backed application;
- owner authenticates without demo auth;
- post data survives reload/server restart because PostgreSQL is authoritative;
- media is stored outside localStorage;
- Telegram publishes real test posts and stores remote IDs;
- MAX publishes real test posts and stores remote IDs;
- scheduled jobs work with browser closed;
- retries are bounded and do not duplicate successful targets;
- Telegram and MAX statuses are independent;
- OpenAI can research fresh information using web search and persist sources;
- OpenAI can generate/edit a post and create draft artwork;
- AI output lands in Drafts and cannot bypass publication workflow;
- secrets are server-only;
- relevant tests pass;
- real integration smoke tests pass;
- no critical regression remains in the primary flow.

## 19. Explicit non-goals

Do not add unless this design is reopened:
- VK;
- Instagram;
- YouTube/TikTok;
- teams/roles;
- billing/subscriptions;
- CRM;
- marketplace;
- complex permissions;
- mobile app;
- automatic AI publishing without owner review;
- automatic recurring content plan;
- analytics recommendations;
- fake/demo full analytics dashboard;
- broad UI redesign;
- unnecessary microservices.

## 20. Decision priority

When implementation choices conflict:

1. reliability;
2. simplicity;
3. UX;
4. maintainability;
5. development speed;
6. additional features.

The MVP succeeds when Planly becomes a dependable personal workflow, not when it accumulates the largest feature list.
