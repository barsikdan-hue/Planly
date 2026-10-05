# Phase 6 Swipe Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Native execution; no per-task owner approval.

**Goal:** Process prepared Library cards into existing drafts or scheduled Posts only after explicit approval.
**Architecture:** Library review UI → existing durable creation/API → existing atomic Post conversion and scheduler. A read-only slot preview and transactional occupancy guard add planning behavior without another publication engine.
**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Drizzle/PostgreSQL, existing Node test harness, Redis/BullMQ paths unchanged.
**Spec:** `../specs/2026-10-04-swipe-planner-design.md`
**Status:** APPROVED 2026-10-04; Tasks 1–4 implemented and focused GREEN. Task 5 local typecheck/lint/build/migration and browser/hook checks passed; native full-suite CI and Self-host are required on the PR. Merge/deploy remains owner-gated.

## Global Constraints

- No AI, new network, suggestion table, queue worker, scheduler redesign, paid infrastructure, persistent custom presets, bulk approval, undo of committed publishing, or unrelated debt fixes.
- Buttons provide all actions on desktop/mobile; arrows act only with card focus, never in text/date fields.
- Every item still requires explicit approval; no bulk auto-approval.
- Times stored as UTC; UI remains Europe/Moscow.
- Legacy creation hashes stay byte-compatible.
- Reload never auto-submits; confirmed precommit conflicts release pending state.
- Focused TDD between tasks. Integration gate: full tests, typecheck, lint, build, migration drift/apply on isolated DB, actual CI and Self-host.

## Review Focus

- Response lost after commit → retry returns original Post, including after chosen slot elapsed (Task 3).
- Concurrent approvals/Composer reschedule → slot conflict writes nothing; owner lock order is consistent (Task 2).
- Source edited/deleted/archived during review → no stale publication or destructive archive (Task 2).
- Multi-platform seconds/minutes and failed/cancelled history → account-specific minute occupancy (Tasks 1–2).
- Reload, storage failure, focused input, vertical scrolling → no implicit submission or accidental swipe (Tasks 3–4).

## Preparation after approval

- [x] Reconfirm source/main SHA, identities and clean worktrees; inspect any drift before applying this plan. Create isolated `codex/phase6-swipe-planner` from the approved source using available worktree tooling. Carry these reviewed documents into that branch; do not edit older branch checkouts.
- [x] Establish focused baseline on a fresh isolated local PGlite DB (84/84 PASS); native PostgreSQL/Redis baseline and full integration remain CI gates. Never reuse production DB; current integration suites delete users. No full reruns after each normal task.

### Task 1 — Pure slot contract and candidate selection

**Create:** `lib/contracts/swipe-planner.ts`, `lib/planner-slots.ts`, `tests/planner-slots.test.ts`.
**Interfaces:** `SlotQuery { providers: Provider[]; startDate: string; endDate: string; weekdays: number[]; times: string[] }`; Zod `slotQuerySchema` enforces unique nonempty providers, valid dates, ≤31 inclusive dates, unique ISO weekdays 1–7, 1–4 unique HH:mm times. `findNextSlot(query: SlotQuery, occupiedMinutes: ReadonlySet<string>, now: Date): string | null` returns UTC ISO. Occupied-minute keys are UTC ISO truncated to minute for the query's selected accounts.

- [x] RED tests: exact 10:00 Moscow→07:00Z, today elapsed excluded, inclusive end/no slot, weekday/year/month/leap boundaries, sorted duplicate rejection, 31-date maximum, 10:00:30 occupancy blocks 10:00, two-platform union, immutable input. Run `node --test --experimental-strip-types tests/planner-slots.test.ts`; verify fails for missing implementation.
- [x] Implement deterministic enumeration and preset constants: daily10, weekdays10, daily10and18; exact values match spec. No date library or new dependency.
- [x] GREEN same command; focused typecheck if required. Commit only Task 1 files.

### Task 2 — Preview, atomic guard and conditional reject

**Create:** `lib/server/planner-slots.ts`, `app/api/planner-slots/route.ts`, `tests/planner-slots.integration.test.ts`.
**Modify:** `lib/server/posts.ts`, `lib/server/library-items.ts`, `lib/contracts/planner.ts`, `lib/contracts/library.ts`, `app/api/posts/route.ts`, `app/api/library-items/[id]/route.ts`, `lib/server/post-idempotency.ts`, `lib/server/http.ts`.
**Tests:** extend `tests/library-conversion.integration.test.ts`, `tests/library-items.integration.test.ts`, `tests/post-idempotency.integration.test.ts`.
**Interfaces:** `GET /api/planner-slots?providers=telegram,max&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&weekdays=1,2,...&times=10:00,18:00` → `{ scheduledAt: string | null }`, owner-authenticated. `createPostSourceSchema`/persistence options add optional `requireFreeSlot: boolean` and `sourceLibraryUpdatedAt: string` (offset datetime). Flag requires source, READY, nonempty unique providers, identical nonnull future scheduledAt across targets. Queue client supplies flag only for automatic preview. Extend `creationInputHash` with optional canonical planner context; existing callers without context keep old hash.
**New server helpers:** `lockOwnerSchedule(tx: Transaction, userId: string): Promise<void>` locks owned users row; `occupiedSlotMinutes(tx: Transaction, userId: string, query: SlotQuery): Promise<Set<string>>` reads actual active targets and latest publications; `archiveLibraryItem(userId: string, id: string, expectedUpdatedAt: string): Promise<LibraryItemDto>` performs a locked status-only archive. Library PATCH accepts this new command shape alongside legacy full-content update. Typed stale-source and slot conflicts map to explicit 409 codes.

- [x] RED: owned preview, no foreign data, disconnected scheduling rejected, occupancy all statuses/active flags, cross-platform overlap rules; stale version archive preserves new content; source mutation leaves zero Posts/publications; concurrent two-source same-minute automatic approvals yields one success/one typed conflict; reschedule holds same owner lock; same-source replay returns original. Use native PostgreSQL for lock tests, no skips counted as proof.
- [x] Run focused tests and verify expected assertion/missing-interface failures. Implement owner lock before source/Post/publication locks in create/update paths. Recheck creation key after waiting; check linked source before new slot/revision validation. For new scheduled queue approvals (identified by sourceLibraryUpdatedAt), enforce enabled/CONNECTED accounts and future times server-side; legacy callers retain their existing contract. Guard, insert and USED transition stay inside existing createPost transaction. Use existing reconciliation/mirror; do not duplicate inserts or touch connectors/processor. Conditional archive must preserve text/media.
- [x] GREEN: `node --test --test-concurrency=1 --experimental-strip-types tests/planner-slots.test.ts tests/planner-slots.integration.test.ts tests/library-conversion.integration.test.ts tests/library-items.integration.test.ts tests/post-idempotency.integration.test.ts tests/posts.integration.test.ts tests/post-edit-guard.integration.test.ts`. Relevant typecheck/lint. Commit task files.

### Task 3 — Durable queue approval over existing creation pipeline

**Modify:** `lib/client/planly-api.ts`, `lib/client/pending-creation.ts`, `lib/post-creation.ts`, `lib/planner.ts`, `components/planner/app.tsx`.
**Create:** `lib/client/swipe-planner.ts`, `tests/swipe-planner-recovery.test.ts`.
**Extend:** `tests/pending-creation.test.ts`, `tests/editor-recovery.test.mjs`, `tests/editor-recovery-lifecycle.test.mjs`, `tests/post-edit-app-lifecycle.test.mjs`, `tests/content-library-ui.test.mjs`.
**Interfaces:** `ComposerPostInput` gains optional `requireFreeSlot`/`sourceLibraryUpdatedAt`. Pending schema adds optional `origin: 'composer' | 'swipe-planner'` (missing means composer); preserve v1 existing records. `submitPendingCreation(...existingArgs, options?: { origin?: 'composer' | 'swipe-planner' })` uses same durable UUID/request path. Queue origin never applies post-ack Composer PATCH logic; explicit retry submits original payload regardless of later controls. `loadPlannerSlot(query: SlotQuery): Promise<{ scheduledAt: string | null }>` and conditional archive wrapper in existing API client. Queue payload includes source title, text and ordered media.

- [x] RED: persist-before-send, storage failure sends nothing, response-loss/reload retry uses byte-identical original time/source/UUID, changed payload conflicts, successful past-slot replay does not reschedule; known precommit slot/source conflicts clear pending, 5xx/timeout retain it; old Composer pending records still recover. One shared pending lock prevents switching to another card or Composer creation while unresolved; queue recovery does not replace/erase an unrelated dirty Composer.
- [x] Implement queue-origin handling and a thin `lib/client/swipe-planner.ts` payload/recovery adapter around existing pending functions. Hydration reads only. On acknowledge update Posts and refresh Library through existing revision-aware path; on unresolved response show explicit retry. On slot conflict retain card and reload preview, never automatically approve another timestamp.
- [x] GREEN: `node --test --test-concurrency=1 --experimental-strip-types tests/swipe-planner-recovery.test.ts tests/pending-creation.test.ts tests/editor-recovery.test.mjs tests/editor-recovery-lifecycle.test.mjs tests/post-edit-app-lifecycle.test.mjs tests/content-library-ui.test.mjs`; relevant typecheck/lint. Commit task files.

### Task 4 — Review cards, controls and existing Calendar integration

**Create:** `components/planner/swipe-planner.tsx`, `tests/swipe-planner-ui.test.mjs`.
**Modify:** `components/planner/content-library.tsx`, `components/planner/app.tsx`, `tests/helpers/planner-lifecycle-loader.mjs`, `app/globals.css` using existing class conventions. Existing Calendar/Composer components consumed through callbacks; no rewrite.
**Interface:** `SwipePlanner` props carry owned `LibraryItemDto[]`, ordered `Media[]`, `SocialAccountDto[]`, pending/busy state and callbacks for slot preview, approve, conditional archive, open Composer and close. Component owns session settings/skip IDs/gesture state; app owns durable requests/acknowledged data. Exact approved payload is passed through Task 3, no client-only optimistic USED transition.

- [x] RED UI/hook tests: READY oldest-first; buttons/swipes parity; ≥80px horizontal action, vertical/cancel/media-control exclusion; arrows only on card focus; skip makes no API call; reject calls conditional archive only; failed reject/approve keeps card; success advances once; no slot disables approval; draft has null times; network must be explicitly selected for scheduling; empty/end states; dirty Composer guard; reload/pending banner blocks unsafe next action.
- [x] Implement “Разобрать заготовки” entry and review mode, session presets/custom controls, 7/30-date horizon, manual date/time, progress and acknowledged-result link. Reuse media preview/components and existing Calendar Post list. Stop counting rejected/skipped as approved; no auto-fill control.
- [x] GREEN: `node --test --test-concurrency=1 --experimental-strip-types tests/swipe-planner-ui.test.mjs tests/content-library-ui.test.mjs tests/planner.test.mjs tests/planner-navigation-ui.test.mjs`. Typecheck/lint affected files. Commit task files.

### Task 5 — Integration and delivery gate

**Modify:** `ROADMAP.md`, current-status paragraph in `AGENTS.md`; create `docs/verification/2026-10-04-swipe-planner.md` with actual evidence. Preserve historical reports. Date filename may follow actual execution date.

- [x] Inspect final diff against approved source/spec; verify exclusions, no env/dependency/DB schema changes. Verify legacy idempotency compatibility, reject/skip zero-write semantics, duplicate/slot/stale-source protections and durable recovery.
- [ ] Once at integration: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`; `pnpm db:generate` then `git diff --exit-code -- drizzle/`; `pnpm db:migrate` only on isolated test DB. Stop for new regression. Existing lint warnings recorded without scope expansion.
- [x] Local browser/hook evidence covers manual/draft/next, mobile scroll/swipe and unresolved-request recovery. Report separately from production/provider behavior.
- [ ] Push `codex/phase6-swipe-planner`, create PR targeting main (CI/Self-host trigger on PR; branch push alone is insufficient), inspect actual CI and Self-host results for current SHA. Attach PR to chat. Report compactly; STOP for owner merge/deploy approval.
- [ ] Only after authorized delivery: compare deployed SHA, verify existing Render Library→Swipe→Calendar flow with browser. No test publication without explicit authorization; smallest authorized provider smoke follows existing scheduler path. Production acceptance pending until verified.

## Self-review / handoff

Spec coverage: Task 1 slot/preset policy; Task 2 transactional/source protections and reject; Task 3 idempotency/recovery; Task 4 human controls/skip/cards; Task 5 verification/roadmap/delivery. Five Review Focus conditions have explicit tests above. Owner approval authorizes this implementation through the PR gate. Merge, deploy and production acceptance remain separate owner gates.
