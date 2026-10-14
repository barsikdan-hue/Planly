# Phase 8: 2026-10-14 Telegram reaction and MAX views live verification

## Scope and authority

- Owner explicitly resumed Telegram analytics, approved one private Render configuration redeploy, Telegram webhook registration preserving existing update types, and exactly two test publications (one Telegram, one MAX).
- Documentation-only follow-up was approved on 2026-10-14. This report does not authorize code changes, merge/deploy, provider retries, historical receipt backfill, or additional publications.
- Production source/Render deploy: `2f13a5acc8a8010bfdc989cc99deb4655b584747`, Render service `srv-dav07le0tbcc73d0gfi0`, successful deploy `dep-db7h8jt9fdbs73e8fffg` LIVE 2026-10-14 05:36:20 UTC. Fresh production `/api/health` returned HTTP 200 `{"status":"ok"}` after both sends.

## Live evidence and provenance

| Check | Result | Evidence tier / caveat |
|---|---|---|
| Telegram publication | PUBLISHED, provider primary message ID `38`; [public link](https://t.me/danil_sochi_realty/38) | Codex live-run report relayed by Owner; public message URL independently resolves to channel/embed |
| MAX publication | PUBLISHED, provider receipt `mid.ffffb84787c0929a01a138f6f2476791`; [public link](https://max.ru/channel_danil_sochi_realty/AaE49vJHZ5E) | Codex live-run report; public page independently displays `MAX-ANALYTICS-20261014` marker and intended test text |
| Telegram analytics | `AVAILABLE`, reactions **1** | Codex reported production analytics observation; Owner confirms adding one like immediately after receiving the post. Correlation is plausible; the raw webhook delivery and DB row were **not** independently inspected in this documentation review |
| MAX analytics | `AVAILABLE`, views **1** | Codex reported production analytics observation. This is a view count, **not** a MAX reaction count |
| Send count/errors | Exactly 2 sends, no retries, no collection/send errors reported | Codex live-run report; not independently reconstructed from provider history |
| Webhook configuration | `WEBHOOK_ACTIVE` reported from local PowerShell registration script | Script checks receiver secret response and Telegram `getWebhookInfo` URL and required `allowed_updates` (`message`, `callback_query`, `message_reaction_count`). Raw bot state/secret were not accessible to independent reviewer |
| Render runtime | LIVE at same SHA; `/api/health` returned status ok after test | Independently verified using connected Render and public health endpoint |

The Codex report identified a local Windows evidence artifact `artifacts/phase8-telegram-analytics/2026-10-14/live-publication-evidence.json`. That artifact's **content was not accessible** to this review and is not claimed as an inspected GitHub artifact. The exact underlying publication IDs beyond the provider receipts above, DB record contents and authenticated analytics HTTP payloads were not independently checked here.

Read-only Render request-log query for `/api/analytics/telegram/webhook` returned no matching request entries within the queried range; absence of log entries does **not** prove Telegram did not deliver an event. The post's reported available reaction is stronger application-level evidence, but independent network/DB receipt proof remains limited.

## Outcome and boundaries

- **PASS (scoped):** owner-approved Telegram live post + one reported `AVAILABLE` reaction, and MAX live post + one reported `AVAILABLE` view; production remained healthy; no additional test posts needed.
- **NOT FULLY VERIFIED:** end-to-end independent trace of Telegram provider update ID → authenticated webhook request → committed PostgreSQL observation; no new webhook replay/ordering/idempotency fault injection in production. Do not claim it from a UI count alone.
- **LEGACY OPEN:** the two historical Telegram `IDENTITY_UNPROVEN` rows described in the [2026-10-09 partial acceptance](2026-10-09-phase8-partial-acceptance-phase9-transition.md) were not independently inspected or repaired. They must not be silently backfilled or treated as zero reactions. The 2026-10-13 audit observed an empty 30-day Telegram cohort at that earlier time; the new post is separate evidence.
- **MAX LIMIT:** supported analytic metric is views; MAX reaction collection was not implemented or proven by this test.
- **OUT OF SCOPE:** VK remains HOLD; Instagram and infrastructure migration remain unapproved. AI remains removed from the product roadmap.

## Repository/release gates

- [Draft PR #46](https://github.com/barsikdan-hue/Planly/pull/46) at `9c7a765b09e3afa9a20af89bfaafa437bd99acb5` is separate diagnostics/tests only, unmerged and not required for the already deployed webhook route. Its Linux [CI](https://github.com/barsikdan-hue/Planly/actions/runs/38420045568) reports 1102/1102 PASS and [Self-host](https://github.com/barsikdan-hue/Planly/actions/runs/38420045633) SUCCESS; these are not fresh tests of this documentation-only branch.
- Current docs change only records verified/reported evidence and adjusts ROADMAP wording. No runtime, env, credentials, provider traffic, queue or database writes were made by the documentation task.
- Merge and deploy remain **OWNER GATES**. Before any future work on historical identities, capture exact sanitized stored receipt fields and prove root cause; `ROOT_CAUSE_NOT_PROVEN → NO FIX`.

**Status:** Phase 8 **PARTIALLY ACCEPTED with scoped live Telegram reaction/MAX views PASS**, not a blanket certification of all metrics or legacy data.
