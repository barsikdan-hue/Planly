# Owner transition: VK HOLD, Phase 8 analytics discovery

## Decision and authority

On 2026-10-08 the Owner deferred VK and chose Phase 8 Telegram/MAX analytics. The stated purpose is to understand which posts perform better, not merely count delivery outcomes. The Owner selected automatic metrics through existing bots for the specification, with unavailable metrics displayed as unavailable and comparisons within one provider. The proposed written design still requires review before an implementation plan or runtime changes.

Repository: barsikdan-hue/Planly. Clean reused linked worktree: `work/Planly-library-idempotency`; source baseline/current main: `124f6d4fceedcbb8a9ef2ba59827a65b1cabe383`; new branch: `codex/phase8-analytics-discovery`. The reused worktree is not a submodule. This change records the roadmap decision and read-only discovery only.

## VK stopping point

PR30 merged head `0fb3edc487a28367b7ffe96360da14f5f3f41606` into main `124f6d4fceedcbb8a9ef2ba59827a65b1cabe383`. Render deploy `dep-db3om33ncjis73b8fet0` became LIVE at 2026-10-08T12:31:11.619177Z; the post-LIVE health probe returned HTTP 200 / status ok.

The Owner's subsequent real attempt produced one safe event at 2026-10-08T12:32:59.064958893Z: AUTH / TOKEN_EXCHANGE / INVALID_GRANT / OTHER_INVALID_GRANT, provider HTTP 200, description PRESENT, mentions SERVICE_TOKEN. No optional service-token terms appeared. Start/callback/intent recovery reached token exchange; grant validation, community validation and credential persistence were not reached. Raw descriptions, bodies and credential values were not retained.

ROOT_CAUSE_PROVEN: NO. CONNECTED: NO. VK_PUBLISHING_PROVEN: NO. No support request was sent. Deferral does not claim a successful connection or justify removing grant checks. Preserve existing VK code/configuration and cease VK work until the Owner resumes it.

## Current analytics path

- `components/planner/dashboard.tsx::AnalyticsSummary` supplies fixed views, likes, saves and trend values. Dashboard labels them demonstration statistics.
- `components/planner/settings.tsx::Analytics` reuses that summary, scales fixed numbers for 30 days, draws a fixed chart and supplies fixed per-post examples. These are not provider metrics.
- `app/api/bootstrap/route.ts::GET` returns owner-scoped profile/posts/media/accounts/library data and invokes existing due-publication processing. It is not a pure read-only analytics collector; do not reuse a live bootstrap request as a harmless provider probe.
- `db/schema.ts::publications` records provider, publication status/time, remote ID/URL, attempts and errors. There is no analytics metric/snapshot table. Publication outcomes are not audience engagement.
- `lib/server/connectors/types.ts::SocialConnector` exposes publication only. Existing Telegram/MAX connectors do not implement audience metric collection or analytics event ingestion.

## Official capability checks — 2026-10-08

- [Telegram Bot API](https://core.telegram.org/bots/api#update): reaction updates require an administrator bot and explicit allowed update types. Anonymous reaction counts may arrive with delay. No new webhook/polling configuration was applied, and no existing updates were consumed.
- [Telegram membership count](https://core.telegram.org/bots/api#getchatmembercount): documented chat-member count exists. A count observed now cannot establish historical growth.
- The current Telegram Bot API reference does not document a per-post views or saves counter; inspection/search of the current reference found no views field. This is a Bot API capability boundary, not a claim about all Telegram APIs. Do not invent zero values, historical backfill or cross-provider engagement scores.
- [MAX Message](https://dev.max.ru/docs-api/objects/Message) and [GET message](https://dev.max.ru/docs-api/methods/GET/messages/-messageId-): optional/nullable `stat` is for channel posts. Opening the nested MessageStat schema in the official site revealed only `views`: viewers of the original post or of that particular repost. This does not document a repost-count field. The initial broad reading of the collapsed description was corrected in the conversation; do not promise a repost counter. Chat/dialog messages do not have the same documented coverage. Actual access/response coverage still needs a separately gated production check.
- [MAX Chat](https://dev.max.ru/docs-api/objects/Chat): `type` distinguishes chat/channel/dialog; member count and an optional message count are documented. These are not per-post effectiveness measures.

Documented capability is not production evidence that the existing bot has access to every desired metric. No live provider requests, publications, secret reads/changes, subscriptions, infrastructure changes or runtime implementation occurred during this discovery.

## Design boundaries

The Owner chose automatic bot-visible metrics; optional manual statistics entry or a separate Telegram integration are excluded from the first design. Compare posts within a provider using explicitly named observed metrics and timestamps/coverage, with unavailable data shown as unavailable rather than zero. Account for observation age, missing history and independently stored per-provider publications before choosing a ranking contract. AI and new networks are excluded.

Next gate: review the [proposed written design](../superpowers/specs/2026-10-08-telegram-max-analytics-design.md), then prepare/review the implementation plan. This document is discovery evidence, not an approved implementation specification. Documentation PR merge/deploy and any subsequent runtime release remain separate Owner gates.

## Subsequent written-spec approval — 2026-10-08

Owner approved the written specification. The [implementation plan](../superpowers/plans/2026-10-08-telegram-max-analytics.md) is prepared for review and execution selection; implementation has not started. Code inspection identified that publication records lack an immutable delivery destination while the linked account destination can change. The plan proposes freezing non-secret numeric receipt identity in the existing successful Telegram/MAX persistence write, with unproven historical mappings unavailable. This clarification is presented in the plan review, without changing sending/status/retry behavior or the connector contract. Native CI 37779789172 and Self-host 37779789182 both succeeded for documentation head 998ef802179f2347a32ad83e7c97a22909530dae; this is not verification of the forthcoming implementation or a later docs head.
