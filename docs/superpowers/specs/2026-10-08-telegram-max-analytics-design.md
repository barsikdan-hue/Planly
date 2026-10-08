# Phase 8 — automatic Telegram/MAX post-performance analytics

Status: PROPOSED / OWNER WRITTEN-SPEC REVIEW REQUIRED. Not an implementation authorization.

## Agreed intent and exclusions

Owner decision 2026-10-08: defer VK, proceed to Phase 8 Telegram/MAX analytics, help identify which posts perform better, and use automatic metrics through existing bots. The approved approach shows unavailable metrics as unavailable and compares posts within a provider. The first draft's mention of MAX repost counts was corrected after inspecting the expanded official schema: only views are confirmed.

The proposal below turns that approach into a concrete design for review. Manual statistics entry, CSV import, Telegram user-session/MTProto integration, AI, new networks, scheduler redesign and infrastructure migration are excluded. Existing publishing, retry, account/auth and VK behavior remain unchanged.

## Current implementation gap

`components/planner/dashboard.tsx::AnalyticsSummary` and `components/planner/settings.tsx::Analytics` show marked demonstration numbers, trends and recommendations. `publications` already associates owned posts/targets with publication times and provider remote IDs, but there are no metric snapshots or reaction-event ingestion. The connector contract currently exposes publication only. Bootstrap invokes publication processing, so it must not become the analytics read endpoint.

Use baseline main `124f6d4fceedcbb8a9ef2ba59827a65b1cabe383`. Source discovery and official references are recorded in [transition evidence](../../verification/2026-10-08-vk-hold-phase8-discovery.md).

## Metric contract

| Provider | First metric | Source | Coverage and meaning |
|---|---|---|---|
| MAX | Views | Message.stat.views from GET /messages/{messageId} | Channel posts only; cumulative viewers returned by MAX for that specific message. Nullable/absent stat is unavailable, not zero. No repost-count metric is promised. |
| Telegram | Reactions | message_reaction_count updates | Anonymous aggregate reaction counts, received after collection is enabled for an administrator bot. No historical zero/backfill is inferred from a missing event. |

Only PUBLISHED Telegram/MAX publications belonging to the current owner are eligible. Match the saved destination and remote message identity before accepting a metric. Never fetch an arbitrary client-provided message ID or URL. First MVP supports channel publications only; verify Telegram event chat.type and MAX channel coverage before accepting observations. Chat/dialog publications remain visible with unsupported coverage, excluded from ranking. Webhook mapping must resolve one active owned account/publication unambiguously; reject conflicting destination/message mappings instead of writing metrics across owners.

Telegram albums currently store comma-separated message IDs. First MVP measures only the first/caption message and labels it "реакции на основное сообщение"; it does not imply a total across the album. MAX currently stores one message ID for a post, including posts with multiple attachments. Validate provider-specific IDs before constructing fixed-host requests; legacy IDs outside the documented format are unavailable rather than guessed.

A valid observed integer zero is AVAILABLE. No observation, unsupported coverage, malformed response, revoked access and temporarily unavailable collection are distinct from numeric zero. Values must be nonnegative safe integers; raw provider bodies/errors and user reaction identities are not stored or returned.

## User flow and comparison semantics

Replace the demo analytics screen and dashboard summary with real-data states. Provider tabs select Telegram or MAX. Periods 7/30 days select publications by actual publishedAt from Moscow midnight N-1 days before today through now, including today; they do not claim that the cumulative reactions/views occurred inside that period. Label the metric as cumulative and show the observation timestamp.

Rank within the selected provider by its named metric descending; ties use publishedAt descending and publication ID for stable ordering. Show publication text preview, date, provider link, age, observed metric and coverage. Missing metrics are listed separately and excluded from sums/ranking. A post with two provider publications is two independent observations, not a combined performance score.

Display the observed/eligible publication count beside any total. Totals are sums of observed post metrics, never unique audience reach. A missing Telegram event is not a zero-reaction post. Show "сбор реакций ещё не дал данных" until an authenticated aggregate update arrives. Last-known values remain visible with timestamps after a collection failure; mark observations older than 24 hours as stale. Staleness is a presentation rule, not proof that a value changed.

Remove hardcoded engagement deltas, the fixed daily views chart, saves/likes cards and the fixed content recommendation. First MVP supplies a ranked table and coverage summary. Do not generate daily impression growth, best-posting-time advice, ER or causal recommendations without matching data/history. Different post ages must remain visible; the ranking is by raw cumulative metric, not an age-normalized effectiveness verdict.

## Components and data flow

1. A separate owner-authenticated GET /api/analytics reads existing publications and stored observations only. It never triggers publishing or calls providers. Response DTOs contain only the selected metrics, safe coverage/error enums, publication metadata and observation times.
2. Owner-authenticated POST /api/analytics/refresh uses the existing auth/CSRF pattern and accepts a provider/page selection, not destinations/remote URLs. For MAX it resolves at most 20 owned published rows, skips observations newer than 15 minutes, and performs fixed-host GET reads with at most two concurrent requests and a 10-second per-request bound. Reading the analytics page may request this bounded refresh once; a button allows a later explicit refresh. No background polling loop, new worker or scheduler is introduced.
3. A dedicated Telegram webhook validates X-Telegram-Bot-Api-Secret-Token and a bounded message_reaction_count payload before any persistence. It resolves only known published messages/accounts and does not publish or process commands. The existing bot token remains server-env-only; a distinct TELEGRAM_ANALYTICS_WEBHOOK_SECRET will require a later private setup gate. It must not reuse session or VK encryption secrets.
4. Store a latest metric observation per publication/remote message/metric with nullable value, source, observedAt, providerEventAt when present, safe coverage/collection status and Telegram ordering metadata. Keep the existing publication row/status untouched. Tie observations to owned publications; deleting a post/publication removes its associated observations through the existing lifecycle.
5. Telegram ingestion stores no actor/user identity or raw update. Aggregate reaction vectors are reduced to a validated total: reject malformed vectors or invalid counts/unsafe sums; a valid empty vector yields an observed zero. Duplicate update IDs are idempotent; older provider event timestamps cannot overwrite newer totals. For equal timestamps use update ID as a deterministic tie-breaker. No event is treated as an increment: each accepted event replaces the observed aggregate total.

Metrics access uses a separate read contract/module, not an extension that silently changes SocialConnector.publish. Reuse existing trusted MAX transport/certificate configuration and server credentials. External failures map to fixed analytics-only categories such as ACCESS_DENIED, NOT_FOUND_OR_INACCESSIBLE, RATE_LIMITED, UNAVAILABLE and INVALID_RESPONSE; they do not change account connection status or retry/send a publication. Inaccessible and deleted provider messages cannot be distinguished from a MAX 404 alone.

Per-account refresh serialization and the 15-minute successful-observation cache prevent duplicate concurrent work. For a failed/rate-limited read preserve the last observation and store the next eligible attempt time; do not immediately retry within the request. API failures never produce a fabricated numeric value. Secrets, token-bearing URLs and arbitrary provider descriptions are excluded from logs and frontend DTOs.

## Telegram activation gate

No webhook registration or update consumption occurs during design. Before activation, a read-only getWebhookInfo check and Owner confirmation of other bot consumers must establish whether Planly can receive updates without disrupting another service. Do not overwrite an existing foreign webhook, consume another application's polling queue, discard pending updates or change bot privileges automatically.

For an approved exclusive/compatible bot, register the production webhook only after its endpoint is LIVE and the private secret is configured. Enable message_reaction_count deliberately, preserving any existing required allowed updates. The Owner must separately approve this configuration. If a foreign consumer or insufficient channel rights is found, stop that activation path for Owner decision and keep Telegram coverage unavailable; MAX analytics can still be verified independently.

No historical Telegram reaction counts are promised. Delayed updates may take minutes; connection status or a 200 webhook registration response does not prove that reaction collection works.

## Verification and acceptance

Unit checks must cover provider identity matching, integer zero vs missing, malformed/negative/unsafe numeric values, album primary-message mapping, publication cohort/timezone bounds, observed coverage totals, stable ranking and stale states. No unsupported metric may appear as a number.

Database/route checks must cover owner isolation before any provider request, pure GET behavior, protected refresh, 20-row/concurrency/cache bounds, concurrent refresh and rate-limit behavior, safe failure preservation, deletion lifecycle, secret validation, bounded webhook payloads, unknown message rejection, duplicate/out-of-order Telegram updates and no actor/raw payload persistence.

Required regression checks preserve publishing, scheduling and auth behavior. Canonical exact-head CI supplies full suite/typecheck/lint/build/migrations; Self-host verifies schema/runtime. Local evidence remains separate from deployment/provider evidence.

After separate merge/deploy and private webhook setup approval, verify production ownership, empty/unavailable/partial-data states, period/provider controls and real observations. Use an already published owned MAX channel post for a minimal read; do not send a test publication automatically. A safe Telegram aggregate event requires a separately agreed real reaction/receipt check. Until those checks pass, classify actual bot access and metric delivery as NOT PROVEN.

Success for the first release: supported observed metrics replace demo values, ranking and coverage are accurate for their documented source, unavailable data is explicit, and existing publication behavior is unchanged. Provider-specific success can be reported independently; no combined Telegram/MAX PASS when one collector is unverified.

## Review and delivery boundary

Owner review of this written specification is the next required step. That review authorizes writing the implementation plan only; plan review/execution selection precedes runtime implementation under the architectural brainstorming path. Merge, production deployment, env/webhook configuration and any provider mutation retain their explicit gates. Current work changes documentation only.
