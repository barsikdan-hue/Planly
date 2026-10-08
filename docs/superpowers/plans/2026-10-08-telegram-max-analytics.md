# Telegram/MAX Post Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demonstration analytics with owned, observed MAX channel views and Telegram channel reaction counts so the Owner can compare posts within a provider.

**Architecture:** Add an analytics contract, latest-observation storage, a bounded MAX reader and a separate authenticated Telegram webhook. Owner GET reads storage only; protected refresh collects MAX metrics without publication side effects. Preserve the existing publishing contract and record its numeric delivery destination in its successful persistence write to prevent historical identity confusion.

**Tech Stack:** Existing Node >=22.13.0, TypeScript, Next.js 16, React 19, Zod 3, PostgreSQL/Drizzle and node:test. No new dependency, worker, service or scheduler.

**Spec:** [Approved design](../specs/2026-10-08-telegram-max-analytics-design.md), approved by Owner on 2026-10-08. Owner approved the receipt-identity clarification and this plan, and selected inline execution on 2026-10-08. Baseline main `124f6d4fceedcbb8a9ef2ba59827a65b1cabe383`; documentation branch `codex/phase8-analytics-discovery` in the verified existing linked worktree. Recheck authority and a clean tree at execution time.

## Global Constraints

- Only PUBLISHED Telegram/MAX publications belonging to the current owner are eligible. First MVP supports channel publications only.
- First MVP measures only the first/caption message of Telegram albums and labels it "реакции на основное сообщение".
- A valid observed integer zero is AVAILABLE. Missing, unsupported, invalid and inaccessible data is unavailable, never fabricated zero.
- Compare within a provider. Periods 7/30 days select actual publishedAt from Moscow midnight N-1 days before today through now; metrics are cumulative, not activity inside that period.
- MAX refresh: at most 20 owned published rows, successful-observation cache 15 minutes, concurrency at most two, 10-second per-request bound. Observations older than 24 hours are presented as stale.
- GET /api/analytics never publishes, processes scheduled work or calls a provider. No polling loop or implicit background consumer.
- No scopes, VK changes, AI, Instagram, manual imports, MTProto, infrastructure migration or publication sends. Keep auth, retries, scheduling and credential handling intact.
- No tokens, raw bodies/provider descriptions, Telegram actor identities or session values in persistence, logs or DTOs.
- Merge/deploy, private webhook secret setup, registration and any real reaction/send remain explicit Owner gates. Do not activate Telegram collection while implementing endpoints.

## Review Focus

- Reconnecting an account to another channel with the same message number must not attach old reactions to a new destination (Tasks 2/4).
- A response that finishes after account disable/reconnection or post deletion must not recreate observations or write a different owner's data (Tasks 2/3).
- A provider error after an observed zero must preserve that zero and its original observation time while displaying the collection failure (Tasks 2/3/5).
- Older asynchronous UI replies after owner/provider/period changes must not replace the current selection or leak a previous owner (Task 5).
- An incomplete reaction vector, duplicate reaction type, large total or unknown event must not become a fabricated complete count; out-of-order aggregates must not increase by replay (Tasks 1/4).

## File responsibilities and interfaces

Create `lib/contracts/analytics.ts` for client-safe DTOs/query schemas; `lib/analytics.ts` for pure metric/time/identity rules. Create focused server modules `lib/server/analytics/{repository,max,refresh,telegram,http}.ts` for DB access, MAX reads, bounded orchestration, aggregate ingestion and route security respectively. Add `app/api/analytics/route.ts`, `app/api/analytics/refresh/route.ts`, and `app/api/analytics/telegram/webhook/route.ts`. Create `components/planner/analytics.tsx`, `components/planner/analytics-summary.tsx` and `lib/client/analytics-state.ts` for real views and asynchronous selection guards.

Modify `db/schema.ts` and generated `drizzle/0007_analytics.sql`, `drizzle/meta/0007_snapshot.json`, `drizzle/meta/_journal.json`; generate the migration with `pnpm db:generate --name analytics` and verify the actual generated basename before committing. Modify only the successful Telegram/MAX receipt write in `lib/server/scheduler/processor.ts` for identity metadata. Modify `lib/client/planly-api.ts`, `components/planner/{app,dashboard,settings}.tsx`, relevant existing render fixtures and `app/globals.css` if layout styles require it. Do not alter `SocialConnector`, connector implementations, VK or bootstrap.

Shared names used below:

- `AnalyticsProvider = 'telegram' | 'max'`; `AnalyticsMetric = 'views' | 'reactions'`.
- `AnalyticsQuery = { provider: AnalyticsProvider; period: 7 | 30; page: number }`; page is a nonnegative integer, maximum 10000; page size is 20.
- `MetricObservation = { value: number | null; observedAt: string | null; coverage: 'AVAILABLE' | 'NO_DATA' | 'UNSUPPORTED' | 'IDENTITY_UNPROVEN'; stale: boolean; collectionError: AnalyticsError | null }`.
- `AnalyticsError = 'ACCESS_DENIED' | 'NOT_FOUND_OR_INACCESSIBLE' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'INVALID_RESPONSE'`.
- `AnalyticsRow = { publicationId: string; text: string; publishedAt: string; providerUrl: string | null; primaryMessageOnly: boolean; metric: MetricObservation }`.
- `AnalyticsDto = { provider: AnalyticsProvider; period: 7 | 30; page: number; pageSize: 20; eligibleCount: number; observedCount: number; total: number | null; totalOverflow: boolean; rows: AnalyticsRow[]; asOf: string }`. Counts and total cover the complete cohort, rows are the ranked page; no observed values means total null.
- `RefreshSummary = { checked: number; observed: number; unavailable: number; skipped: number; busy: boolean; nextPage: number | null }`. Refresh page uses stable publishedAt descending/publication ID ascending collection order, independent of metric ranking; nextPage enables collecting the next 20 without an unbounded loop.

### Task 1: Pure metric, cohort and identity contract

**Files:** Create `lib/contracts/analytics.ts`, `lib/analytics.ts`, `tests/analytics-contract.test.ts`.

**Interfaces:** Export `analyticsQuerySchema`, `analyticsRefreshSchema` and all shared DTO types above. Export `publicationWindow(period: 7 | 30, now: Date): { from: Date; through: Date }`, `parseTelegramPrimaryId(remoteId: string): string | null`, `legacyTelegramDestination(url: string | null, primaryId: string): string | null`, `summarizeObserved(values: readonly (number | null)[]): { observedCount: number; total: number | null; totalOverflow: boolean }`, and `parseMaxViews(message: unknown, expected: { destinationId: string; remoteId: string }): { coverage: MetricObservation['coverage']; value: number | null; error: AnalyticsError | null }`. Schemas reject unknown input properties, remote URLs/IDs and VK provider selections.

- [x] Write failing tests with these exact assertions:

```ts
assert.deepEqual(publicationWindow(7, new Date('2026-10-08T12:00:00Z')), {
  from: new Date('2026-10-01T21:00:00Z'), through: new Date('2026-10-08T12:00:00Z')
});
assert.equal(parseTelegramPrimaryId('31,32'), '31');
assert.equal(parseTelegramPrimaryId('31,,32'), null);
assert.equal(legacyTelegramDestination('https://t.me/c/123456/31', '31'), '-100123456');
assert.equal(legacyTelegramDestination('https://t.me/channel_name/31', '31'), null);
assert.equal(analyticsQuerySchema.safeParse({provider:'vk', period:7, page:0}).success, false);
```

Also assert MAX matching `body.mid`/`recipient.chat_id`, absent/null stat => NO_DATA, views 0 => AVAILABLE, wrong destination/mid or negative/fractional/unsafe number => invalid. Reject URL credentials/query/hash/untrusted host, message ID mismatches and duplicate album IDs. Check 30-day month/year boundaries, safe-total overflow and a single observed zero versus no observations.
- [x] Run `node --test --experimental-strip-types tests/analytics-contract.test.ts`; expect FAIL because the new modules/exports do not exist, not an environment failure.
- [x] Implement the named pure functions and schemas. Use safe integers throughout; MAX IDs must match the official `[a-zA-Z0-9_-]+` format. Telegram IDs are positive safe integers. Receipt URLs are parsed only to establish identity, never fetched. Bounded DTO previews are at most 200 characters.
- [x] Run the same command; expect all assertions PASS with no skips.
- [x] Commit: `feat: define analytics metric and identity contract`.

### Task 2: Observations, frozen delivery identity and owned reads

**Files:** Modify `db/schema.ts`, generated migration/meta files, `lib/server/scheduler/processor.ts`; create `lib/server/analytics/repository.ts`, `tests/analytics-repository.integration.test.ts`; extend `tests/publication-processor.integration.test.ts`.

**Interfaces:** Add nullable `publications.analyticsDestinationId` (text) and `publicationMetrics`: publicationId cascading FK/primary key, remoteMessageId, destinationId, metric, source (`MAX_MESSAGE` or `TELEGRAM_AGGREGATE`), bigint-in-number-mode nullable value constrained to 0..Number.MAX_SAFE_INTEGER, observedAt, providerEventAt, lastUpdateId, collectionError, attemptedAt, nextAttemptAt. Export `listAnalytics(userId: string, query: AnalyticsQuery, now: Date): Promise<AnalyticsDto>` and `saveObservation(tx: AnalyticsTx, input: OwnedObservation): Promise<boolean>`; export AnalyticsTx as the existing Drizzle transaction type derived from getDb. `OwnedObservation = { userId: string; publicationId: string; accountId: string; destinationId: string; remoteMessageId: string; metric: AnalyticsMetric; value: number; observedAt: Date; providerEventAt: Date | null; updateId: number | null }`. Derive source from the provider, not client input. No secret or actor fields.

- [x] Write failing integration tests for owner isolation; published-only eligibility; zero/missing distinction; ranking value descending then publishedAt descending/id ascending; all-cohort coverage; stale >24h; primary album identity; and cascade deletion. Write a processor test asserting the stored numeric destination equals the exact publish input despite an account switch during a mocked send, and no extra sends/retries or VK metadata change.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/analytics-repository.integration.test.ts tests/publication-processor.integration.test.ts` against isolated test PostgreSQL. Expect FAIL on missing schema/exports. Never run destructive fixture cleanup against production.
- [x] Implement the schema and generate/apply migration in the isolated environment. In the existing successful write only, freeze canonical numeric input.destinationId for Telegram/MAX; legacy publications remain null and VK remains null. Do not add an extra post-send write or new connector fields.
- [x] Implement owner-scoped joins through publication/post/target/account. Telegram identity is frozen destination or strict numeric /c/ URL; never current destination alone. MAX may use the provider-confirmed recipient in Task 3. Require active matching account and unambiguous publication mapping at writes; conditional writes/locks must reject disabled, reconnected or deleted rows. Never resurrect or change publication/account state. Missing identity is IDENTITY_UNPROVEN. Preserve known value/observedAt on collection failures. Persist only one latest metric per publication.
- [x] Run the same tests plus `pnpm db:generate` followed by `git diff --exit-code -- drizzle/` after committing/staging the generated migration consistently; distinguish uncommitted generated changes from drift. Expect all tests PASS and no new generated drift. Check fresh install and existing 0006 upgrade.
- [x] Commit: `feat: persist owned analytics observations and delivery identity`.

### Task 3: Bounded MAX observation collection

**Files:** Create `lib/server/analytics/max.ts`, `lib/server/analytics/refresh.ts`, `tests/analytics-max.test.ts`, `tests/analytics-refresh.integration.test.ts`.

**Interfaces:** `createMaxAnalyticsReader(options: { token: string; fetcher?: typeof fetch; timeoutMs?: number }): MaxAnalyticsReader`; `MaxAnalyticsReader = { read(expected: { destinationId: string; remoteId: string }, signal?: AbortSignal): Promise<MaxMetricRead> }`. `MaxMetricRead` is Task 1's validated coverage/value/error tuple, never a raw body. `refreshMaxAnalytics(userId: string, query: AnalyticsQuery, options?: { now?: Date; reader?: MaxAnalyticsReader }): Promise<RefreshSummary>` consumes Task 2 storage and Task 1 identity rules. Telegram refresh does no outbound read and reports no collection work.

- [x] Write failing tests for fixed `https://platform-api2.max.ru`, Authorization header only, redirect rejection, token-free errors, GET-only calls, response identity, active channel coverage, absent stat, 0, 401/403/404/429/5xx/invalid JSON/timeout. Add races: two refreshes of one account, disable/reconnect/delete while provider read is pending, failure after observed zero, and a peer account not blocked unnecessarily. Assert no publisher/queue/account-status calls.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/analytics-max.test.ts tests/analytics-refresh.integration.test.ts`; expect missing-module/schema FAIL.
- [x] Implement fixed-host GET /chats/{destinationId} to establish channel type once per bounded refresh and GET /messages/{remoteId} for selected rows. Instantiate the reader for each refresh; share its channel-check promise for that destination. Reuse the existing global fetch/CA configuration; do not refactor publication transport. Restrict IDs before URL construction, cap response bodies at 1 MiB, normalize only documented fields and discard arbitrary descriptions. No request retries.
- [x] Implement stable chronological pages of at most 20, skip successful observations newer than 15 minutes and failed rows before nextAttemptAt, concurrency two, per-call 10 seconds and overall 25-second refresh deadline. Serialize per account with a dedicated PostgreSQL connection and pg_try_advisory_lock on an analytics-only account key; BUSY returns immediately. Always unlock/release in finally. A cancelled/deadline-limited read preserves old values; next eligible attempt is at least 15 minutes later (429 uses at least that bound, without immediate retry). Revalidate account/ownership/identity before writes; never trust account data captured before an asynchronous read.
- [x] Run both test files; expect PASS, request count/concurrency/deadline bounds exact and no skipped tests. Test aborted-reader completion cannot write a late result.
- [x] Commit: `feat: collect bounded MAX channel views`.

### Task 4: Authenticated Telegram aggregate receiver

**Files:** Create `lib/server/analytics/telegram.ts`, `app/api/analytics/telegram/webhook/route.ts`, `tests/analytics-telegram.test.ts`, `tests/analytics-telegram.integration.test.ts`.

**Interfaces:** `parseReactionCountUpdate(input: unknown): ReactionAggregate | null`; null means unrelated update; malformed selected events throw exported `ReactionInputError` with fixed text. `ReactionAggregate = { updateId: number; destinationId: string; messageId: string; eventAt: Date; total: number }`. `ingestTelegramReaction(update: ReactionAggregate, now?: Date): Promise<'APPLIED' | 'IGNORED'>` consumes frozen identity and atomic storage from Task 2. Route exports POST only and uses the dedicated env secret, not owner cookies.

- [x] Write failing tests: missing/mismatched/malformed secret rejected before body/DB; unconfigured receiver 503; streamed body >64 KiB =>413; malformed JSON/selected event =>400; unrelated authenticated update =>200 IGNORED. Validate channel chat.type, negative safe chat ID, positive safe message ID, nonnegative safe update ID/date/counts; reaction vector at most 1000 entries with unique documented type keys, empty vector=>observed zero, invalid/unsafe sum=>reject. Strip all incidental raw/actor fields.
- [x] Add DB tests for unknown/foreign/ambiguous channel-message mappings, channel switch with reused message ID, album non-primary events, replay, older event date, equal-date update ID ties, and concurrent newer/older updates; expect one latest aggregate, never incremental sum. Deleted posts must remain deleted.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/analytics-telegram.test.ts tests/analytics-telegram.integration.test.ts`; expect FAIL on absent receiver.
- [x] Implement bounded streaming parsing after constant-time secret verification. Secret format `[A-Za-z0-9_-]{1,256}` per Telegram; only future private env configuration enables it. Authenticate before inspecting updates. Compare atomic ordering by (eventAt, updateId), not global update ID alone; reject unknown reaction type rather than emit a partial total. Authenticated ignored events return generic 200 without mapping details. Transient DB errors return safe 503 so Telegram can retry; no raw errors logged.
- [x] Run the same tests; expect PASS. Verify no getUpdates/setWebhook/deleteWebhook/provider send is present or invoked.
- [x] Commit: `feat: ingest authenticated Telegram reaction totals`.

### Task 5: Owner API and real analytics UI

**Files:** Create `lib/server/analytics/http.ts`, analytics GET/refresh routes, `components/planner/{analytics,analytics-summary}.tsx`, `lib/client/analytics-state.ts`, `tests/analytics-routes.integration.test.ts`, `tests/analytics-ui.test.mjs`, `tests/analytics-app.test.mjs`; adapt existing hook-loader/render fixtures as needed. Modify `lib/client/planly-api.ts`, `components/planner/{app,dashboard,settings}.tsx`, optional `app/globals.css` and `tests/render-check.tsx`.

**Interfaces:** Routes use requireApiOwner before parsing/collection and return no-store DTOs. Add `loadAnalytics(query: AnalyticsQuery): Promise<AnalyticsDto>` and `refreshAnalytics(query: AnalyticsQuery): Promise<RefreshSummary>` to existing client. Components `Analytics({ ownerContext }: { ownerContext: { id: string; generation: object } | null })` and `AnalyticsSummary({ data, loading, error }: { data: AnalyticsDto | null; loading: boolean; error: string | null })`. Export `isAnalyticsSelectionCurrent(captured: AnalyticsSelection, current: AnalyticsSelection | null): boolean`, where `AnalyticsSelection = { ownerId: string; generation: object; provider: AnalyticsProvider; period: 7 | 30; page: number; revision: number }`; components consume it for every asynchronous completion.

- [x] Write failing authenticated route tests for 401-before-fetch/DB writes, input strictness, pure GET, and refresh protection. Require application/json plus `X-Planly-Analytics: 1`; reject present Sec-Fetch-Site values other than same-origin. Keep no cross-origin CORS allowance; do not derive trust from Host/forwarded headers/internal Render URL or VK config. Existing SameSite owner cookie is preserved. Assert mutation-shaped arbitrary destination/URL input cannot trigger a request.
- [x] Write behavioral UI tests using existing node:test hook-harness conventions: loading/error/empty/partial; actual 0 visible; missing shows "нет данных"; provider switch and 7/30 cohort labels; age/timestamp/stale/failure preservation; observed/eligible counts; overflow total unavailable; no demo trends/saves/recommendation. Delay replies during period/provider/owner changes and unmount; assert old data stays discarded. Assert one bounded MAX refresh on analytics entry, manual refresh and next-page collection, no timer polling/provider call from dashboard. Test button keyboard/disabled behavior in production browser later.
- [x] Run `node --test --test-concurrency=1 --experimental-strip-types tests/analytics-routes.integration.test.ts tests/analytics-ui.test.mjs tests/analytics-app.test.mjs`; expect failures on absent routes/components.
- [x] Implement GET delegation to storage only; POST delegation to Task 3; sanitized fixed failures. Frontend defaults to MAX, 7 days; chronological refresh nextPage is separate from ranked GET page. One refresh per owner analytics-entry lifetime; manual/page collection remains explicitly bounded. Show cumulative ranking, observation age, primary-message-only label and coverage. Dashboard loads stored 7-day data only and displays provider metrics separately, with no blended score. Handle 401 through existing client behavior, clear state on owner transition and use selection guards/AbortController.
- [x] Move Analytics out of settings, remove old demo AnalyticsSummary and sidebar demo badge; retain social settings/VK flow unchanged. Use only validated stored provider links, safe HTTPS provider-host targets with noopener; don't render token-bearing/untrusted links. Update existing fixtures to the real empty-data interface rather than remove assertions. Run the three tests and `pnpm typecheck`; expect PASS.
- [x] Commit: `feat: show real provider analytics with explicit coverage`.

### Task 6: Canonical verification and release handoff

**Files:** New `docs/verification/2026-10-08-phase8-analytics-implementation.md` (use the actual execution date if later); update ROADMAP.md and AGENTS.md to implementation status only after actual code evidence. Do not change workflows to skip/relax checks.

**Interfaces:** Reuse the final implementation head and PR; evidence records local, native CI, Self-host, deployment and each provider independently. These are review/release instructions, not authorization to merge or deploy.

- [ ] Run focused analytics tests against isolated dependencies, then canonical `pnpm db:generate`, migration drift check, `pnpm db:migrate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` in the configured test environment. Required regressions include existing auth, owner lifecycle, Telegram/MAX connectors, processor, retry, scheduler and VK contracts. Inspect fresh exit codes/counts; no retry/skip/timeout increase to conceal a failure.
- [ ] Independently review the diff and entire approved-spec coverage; no secrets/new dependency/foreign scope. Push implementation branch, create/update draft PR, attach it, and inspect native CI and Self-host for the exact final head. Optional live-publication job must remain skipped. Any failure or new scope ambiguity stops release for root-cause verification.
- [ ] Record receipt-identity legacy coverage limitations, MAX missing access, Telegram activation not yet proven. Present READY_FOR_OWNER_MERGE_GATE only with all required exact-head checks SUCCESS. Stop before merge/deploy until explicit Owner approval; the documentation approval is not a release approval.
- [ ] After a later authorized release: verify exact merged/main Render LIVE SHA, health200, browser empty/partial/selection/error/keyboard states. Read only an already published owned MAX channel post and compare provider count/identity with UI/DB; no automatic test publication. Stop that provider's acceptance if access/coverage cannot be established.
- [ ] Telegram activation requires separate Owner approval after endpoint LIVE: private distinct secret configuration, read-only getWebhookInfo and confirmation of any other bot consumers. Existing foreign webhook/polling consumer => STOP_OWNER_DECISION. Empty webhook URL alone does not prove absence of polling. Preserve required allowed_updates, add message_reaction_count deliberately, never drop pending updates or change privileges. No automatic registration script runs during CI/start/build. A separately authorized real aggregate reaction/receipt verifies ingestion; HTTP200 registration alone is not PASS.
- [ ] Record MAX and Telegram acceptance separately; commit evidence only after it exists. Never claim analytics or Phase 8 complete from local/CI alone.

## Plan review and execution handoff

Owner approved this plan, including frozen non-secret delivery metadata and conservative historical identity coverage, and selected inline execution on 2026-10-08. Tasks 1–5 are implemented and verified on the feature branch. Canonical verification, independent review and the Owner release gate follow. Inline is recommended for these five closely coupled implementation tasks to keep shared DTO/storage/identity decisions consistent; a fresh whole-branch reviewer checks the result before the merge gate.

Official references: [Telegram aggregate reactions](https://core.telegram.org/bots/api#messagereactioncountupdated), [webhook authentication/allowed updates](https://core.telegram.org/bots/api#setwebhook), [MAX Message](https://dev.max.ru/docs-api/objects/Message), [MAX GET message](https://dev.max.ru/docs-api/methods/GET/messages/-messageId-). Provider coverage remains NOT PROVEN until the later authorized production checks.
