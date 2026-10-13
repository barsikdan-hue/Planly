# Phase 8 Telegram analytics: resumed audit, production acceptance blocked

Owner resumed Phase 8 on 2026-10-13 from `2f13a5acc8a8010bfdc989cc99deb4655b584747`. This audit does not authorize merge, deploy, env/webhook changes, production database writes, backfill, publications or real reactions. MAX runtime remains unchanged. Historical reports remain intact.

## Harness contract and routing

The clean dedicated checkout `work/Planly-harness-devex` has remote `barsikdan-hue/Planly`; branch `codex/phase8-telegram-analytics` starts at the approved baseline. GitHub main and Render LIVE were independently read again on 2026-10-13: both still use the complete baseline SHA. Render deploy `dep-db73gbnf3r2c73d2tuag` is LIVE. No deployment was started.

Goal: prove identity and ingestion prerequisites before a minimal repair; eventual production acceptance requires actual persisted reaction evidence. Existing implementation is a pure owner-authenticated analytics GET, frozen receipt identity and a dedicated aggregate webhook. Systematic-debugging, test-driven-development and verification-before-completion guide the work. No proven runtime defect means no speculative patch or fabricated RED/GREEN repair.

| Tool | Trigger, scope and action | Evidence, boundary and fallback |
|---|---|---|
| Source/git and Node tests | Trace Telegram receipt, parser, ownership, locks, ordering and routes at the baseline; exercise real handlers against isolated loopback PostgreSQL/Redis | Exact functions, changed tests and saved logs; no production DB/provider access. Missing historical fields remain unproven |
| Browser/CDP and HTTP | Read existing production analytics and an unauthenticated empty webhook request; retain only safe DTO/status metadata | Production observations below; no fabricated authenticated event or reaction. No cookies/headers/token retained; direct API navigation was browser-blocked, so provider/period controls were used |
| GitHub/Render connectors | Read source/deployed SHA; publish separate draft PR and inspect its actual CI/Self-host results | Exact run/PR links; no merge/deploy/configuration. Missing checks are unverified, not PASS |
| Independent Critic | Read source and test diff without mutations or concurrent DB tests | No actionable findings; production acceptance remains separate from test readiness |

## Proven observations and limits

At `2026-10-13T14:54:09.387Z`, authenticated production `GET /api/analytics?provider=telegram&period=30&page=0` returned HTTP 200: `eligibleCount=0`, `observedCount=0`, `total=null`, `totalOverflow=false`, `rows=[]`. The UI agreed. The 7-day and 30-day Telegram selections emitted GET only in the captured trace; trace was not truncated. This proves the current owned cohort is empty, not that the historical publications were deleted or their identities repaired. No zero reactions were invented.

An unauthenticated `POST /api/analytics/telegram/webhook` with empty JSON returned HTTP 503 and `Reaction collection is not configured`. `app/api/analytics/telegram/webhook/route.ts::POST` rejects absent or invalid `TELEGRAM_ANALYTICS_WEBHOOK_SECRET` before reading the body, parsing an event or using the database. This proves the current receiver configuration guard blocks collection. It does not distinguish an absent secret from a malformed secret, prove webhook registration absent, or explain the old identity failures.

The existing bot token and webhook secret were absent from the local process environment; the checkout has no private env file. No credential value was retrieved or exposed. `getWebhookInfo` was NOT CALLED because existing authorization was unavailable locally. Registration URL, `allowed_updates`, pending errors, bot admin permissions and external update consumers remain UNKNOWN. No `getUpdates`, `setWebhook` or `deleteWebhook` call occurred. Repository runtime search found no polling or webhook-registration consumer; this cannot rule out an external consumer.

Opening the analytics screen initially selected MAX, whose existing mount behavior requests an automatic refresh. The visible MAX cohort was 0/0; the initial refresh request/response was not captured because tracing began afterward. It cannot be claimed that this entire browser visit was read-only or that its initial provider activity was audited. Source `refreshMaxAnalytics` returns for an empty cohort before constructing/calling a provider reader or saving observations. The audit then used Telegram controls only and did not repeat MAX refresh. No MAX code or settings were changed.

## Historical `IDENTITY_UNPROVEN`: exact cause NOT PROVEN

The [2026-10-09 report](2026-10-09-phase8-partial-acceptance-phase9-transition.md) records two eligible Telegram rows with null metrics and `IDENTITY_UNPROVEN`, but deliberately retains no publication IDs, raw receipt IDs or stored destinations. Retained release evidence contains MAX observations, not these two Telegram identities. Current production GET supplies no historical rows to correlate. Older publishing reports are not proof that their examples are the same two rows.

| File / function | Condition and data flow | What it establishes |
|---|---|---|
| `lib/server/analytics/repository.ts::publicationIdentity` | Missing/invalid `providerRemoteId` fails primary-message parsing. Otherwise destination must be frozen `analyticsDestinationId`, or strict numeric historical `/c/` URL matching the primary message; it must be safe numeric with `-100` prefix | Either message identity or destination identity may explain the historical state. A public username alone never proves an immutable destination |
| `drizzle/0007_analytics.sql` and scheduler history | Migration adds nullable `analytics_destination_id` without backfill. Earlier publication processor did not capture it | Legacy rows can lack frozen destination; this is a possible historical mechanism, not evidence about the two specific rows |
| `lib/server/connectors/telegram.ts::validate/publish` → `lib/server/scheduler/processor.ts` | Validation canonicalizes the numeric chat ID; publication checks receipt chat against destination; successful processor persists numeric destination with the receipt | Current normal receipt path preserves identity; no demonstrated regression to repair |
| `lib/server/analytics/telegram.ts::ingestTelegramReaction` → `repository.ts::lockOwned/saveObservation` | Exact published primary message, owned enabled/connected account, frozen destination, unique mapping and owner email; receipt-second guard; locked recheck; event date/update-ID ordering | Unknown, foreign, ambiguous, disconnected, stale and duplicate observations fail closed; accepted aggregate replaces the count atomically |

Do not infer a legacy numeric destination from the currently connected account or a public username. No backfill or relaxed identity guard is included.

## Webhook activation prerequisites

The [official Telegram Bot API](https://core.telegram.org/bots/api#getwebhookinfo) provides read-only webhook status. Aggregate reaction delivery requires bot admin privileges and explicit `message_reaction_count` in `allowed_updates`; delivery can be delayed. An empty webhook URL alone cannot identify another polling consumer. These contract facts are prerequisites, not proof of this bot's configuration.

Before any activation, privately read `getWebhookInfo` with an existing authorized credential and inventory every existing bot consumer. Retain sanitized host/path, allowed update names, pending count and error presence/time; strip token-bearing URLs and error text. Preserve other consumers' required updates and pending updates. A foreign webhook or unknown polling owner blocks registration pending Owner decision.

## Changes and verification

Runtime, schema, connector contracts, provider settings and dependencies are unchanged. Four real PostgreSQL integration tests extend Telegram checks for disconnected/same-owner ambiguous mapping, pre-publication versus receipt-second events, preservation of the entire last-known observation after ignored events, and authenticated webhook persistence/redelivery. These characterize existing safety behavior; they are not a claimed RED/GREEN fix for an unproven defect.

Focused run: 12/12 PASS, zero failed/skipped/cancelled, using fresh loopback PostgreSQL 17 on port 55501 and Redis on 55502 with synthetic credentials and provider env removed. Schema migration succeeded only on this disposable database. Independent Critic found no actionable issue in source or the +53-line test diff.

At report preparation, the full local regression run is still running and has already reported a failure in the existing MAX GC deadline child test (5-second child process bound). Host RAM pressure was measured independently (about 30 MiB free on a 4 GiB host); this alone does not prove the timeout's cause. No MAX/test timeout change or assertion weakening is included. Full-run final counts and any isolated diagnostic result must be reported separately. Typecheck passed; lint/build are pending. New-branch CI/Self-host are NOT_TRIGGERED until the draft PR is opened. Read the actual PR run conclusions for final CI status; earlier baseline CI is not this branch's verification.

## Remaining Owner gates

1. Historical identity evidence: obtain a read-only, sanitized extract of the actual two publications if still retained: publication identity, receipt message ID, frozen destination, URL shape and ownership relationship. An explicit unavailable-history decision can close investigation scope but cannot turn the cause into proven or authorize backfill.
2. Private access/configuration: perform the authorized read-only webhook/consumer inventory using an existing server-side credential. Only after compatibility is established may Owner separately authorize a distinct valid webhook secret and minimal Telegram registration. No config write has been approved or performed here.
3. Production acceptance: after configured receiver and supported owned receipt are proven, separately authorize one controlled real reaction/receipt check, allowing delivery delay and recording persisted/UI aggregate plus ordering/idempotency evidence. New publications are not required automatically.

Phase 8 Telegram production acceptance remains BLOCKED. No merge/deploy, production schema operation, secret change, provider mutation or automatic rollback occurred. The existing receiver is already deployed; this audit alone does not require a new deployment.
