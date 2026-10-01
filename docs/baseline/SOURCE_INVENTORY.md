# Planly Source Inventory

**Date:** 2026-09-30
**Milestone:** MVP v1 / Milestone 0 — Source consolidation
**Authoritative repository:** `barsikdan-hue/Planly`
**Authoritative branch:** `main`
**Baseline commit:** `e53e3b3a1950c2561a153983700d1b57bafecbbb`

## Ruling

The uploaded `SMM Planer.7z` is **not** the authoritative source. It is an older local snapshot and must not be copied over `main`.

The actual `main` branch already contains the later light Planly implementation imported from the selected ChatGPT Site. The repository therefore becomes the only source of truth for future development. The archive remains reference material for historical tests/fixes only.

## Current main source shape

Key product files:

- `app/page.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `app/chatgpt-auth.ts`
- `components/planner/app.tsx`
- `components/planner/dashboard.tsx`
- `components/planner/composer.tsx`
- `components/planner/calendar.tsx`
- `components/planner/library.tsx`
- `components/planner/settings.tsx`
- `lib/planner.ts`
- `lib/browser-store.ts`
- `tests/planner.test.mjs`
- `tests/render-check.tsx`
- `ROADMAP.md`
- `docs/PROJECT_BASELINE.md`

Platform/starter infrastructure also exists under `build/`, `scripts/`, `components/ui/`, `vendor/`, and connector-preview helpers. Those files are not evidence of Planly production backend functionality by themselves.

## Runtime and package manager

From current `package.json`:

- Node.js: `>=22.13.0`
- Next.js: `16.3.4`
- React: `19.2.6`
- TypeScript: `5.9.3`
- Vinext/Vite/Cloudflare starter runtime is present
- package manager metadata: `pnpm@11.25.0`
- tracked lockfile: `pnpm-lock.yaml`

Current scripts expose `dev`, `build`, `start`, `lint`, and `db:generate`. The current package manifest does not expose the existing planner tests as an npm script.

## Current persistence

`lib/browser-store.ts` stores Planly workspace state in browser IndexedDB database `personal-smm-planner-v1`, object store `workspace`.

Stored browser state includes:

- posts;
- media;
- owner display name;
- demo social-account toggles.

This is better than the older archive's localStorage implementation, but it is still browser-only persistence. It is not PostgreSQL and cannot support reliable background publishing.

## Current database scaffold

`db/schema.ts` is intentionally empty. Current `.openai/hosting.json` declares both `d1` and `r2` as `null`.

Therefore:

- no application DB schema exists in `main`;
- no production content database is active;
- no object-storage binding is active;
- Drizzle presence is scaffold/tooling, not proof of a working backend.

## Current UI scope

The current modular planner contains the selected light UI and the product screens required by Phase 1:

- Dashboard / Главная;
- Create Post;
- Calendar;
- Content;
- Media;
- Social Accounts;
- demo Analytics;
- Settings.

The current browser implementation explicitly labels publication behavior as demo behavior. Real provider delivery is not part of `main`.

## Existing connector-related code

`lib/connector-contract.mts`, `lib/connectors.ts`, and related files are **ChatGPT Sites connected-app runtime helpers**. They are not the approved Planly `SocialConnector` abstraction for Telegram/MAX publishing and must not be mistaken for it.

They may remain as platform infrastructure, but social publication code must follow the approved MVP spec.

## Preserved earlier backend branch

Branch: `reference/dark-mvp`

Useful existing files:

- `server/api.mjs`
- `server/social.mjs`
- `server/worker.mjs`
- `server/crypto.mjs`
- `server/local-store.mjs`

This branch already demonstrates several useful behaviors:

- owner-scoped server requests;
- server-side token handling/encryption;
- provider validation;
- Telegram/VK/Instagram publishing code;
- independent delivery records;
- claim-before-send logic;
- uncertain-delivery state after crashes/timeouts;
- remote ID persistence;
- server-side media validation;
- scheduled worker entrypoint.

However, its architecture is Cloudflare D1/R2/Worker-oriented and does **not** match the approved MVP v1 runtime of PostgreSQL + Redis/BullMQ + Render. Reuse concepts/tests selectively; do not merge the branch tree wholesale.

## Uploaded archive comparison

The uploaded `SMM Planer.7z` was inspected but is older than current GitHub `main`.

Fresh checks performed against the archive before this ruling:

- core unit tests: 6/6 PASS;
- TypeScript: PASS;
- ESLint: 0 errors, 2 warnings;
- archived static runtime: HTTP 200;
- source secret-pattern scan: 0 findings.

The archive also contains older monolithic UI and npm/static-build tooling. Those results are useful as historical regression evidence only. They are not permission to overwrite the current modular code.

## Import safety result

Two temporary archive-import commits were created only on `feat/mvp-v1-baseline` during investigation, then the branch was reset back to `e53e3b3a1950c2561a153983700d1b57bafecbbb` after the newer GitHub source was discovered.

`main` was never changed by the attempted archive import.

## Source-of-truth order from now on

1. `barsikdan-hue/Planly` `main` — authoritative code.
2. `reference/dark-mvp` — read-only implementation reference for reusable backend ideas/tests.
3. active light ChatGPT Site — UX/visual reference until production deployment replaces it.
4. uploaded local archive — historical reference only.

Future implementation plans must name files from the real GitHub tree, not from the old local archive.
