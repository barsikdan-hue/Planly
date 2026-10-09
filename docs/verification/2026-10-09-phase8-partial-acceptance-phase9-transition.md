# Phase 8 partial acceptance, deferred Telegram and Phase 9 transition

Owner decision on 2026-10-09: defer the unfinished work, record it for later and continue the roadmap. This records a transition, not full Phase 8 acceptance or authorization to change bot/environment settings.

## Authority and verified release

Repo: `barsikdan-hue/Planly`. Source/current main and Render LIVE: `2539796a7427175642d5b9e8c351382a4c18954c`, merged PR32 after explicit Owner merge/deploy approval. Merge tree equals verified head `b7035627c5480744838e074fed81de590e1d2e2b`. Native CI [37807602286](https://github.com/barsikdan-hue/Planly/actions/runs/37807602286) and Self-host [37807602264](https://github.com/barsikdan-hue/Planly/actions/runs/37807602264) SUCCESS; 976/976 tests passed, zero failed/skipped/cancelled; migrations/typecheck/lint/build passed. These are head-CI results, not a separate claim of fresh merge-SHA CI.

Existing Render service `srv-dav07le0tbcc73d0gfi0`, deploy `dep-db46mrm7bikc73aq16d0`, exact merge SHA, LIVE 2026-10-09 07:21:58 Moscow. Health HTTP 200/status ok. Cache/env unchanged. Both CI and Render build reported ANALYTICS_CSS_OK with matching source CSS SHA256; real browser controls used flex/gap12px, buttons padding9px14px, table cells padding14px10px. Full-page screenshot confirmed visible styling. The earlier Render omission's underlying mechanism remains unproven.

## MAX acceptance scope

One normal Planly refresh on the existing two owned published posts returned HTTP 200: checked 2, observed 2, unavailable 0, skipped 0, busy false. A following GET returned both AVAILABLE with views 5 and 5, total 10, eligible/observed 2/2 and no collection errors. Observation time 04:23:26.449 UTC; final read 04:23:28.054 UTC. No test publications, provider writes or extra refreshes. This proves collection for these posts, not every channel/message/metric.

## Telegram: deferred, not repaired or accepted

Real production GET after selecting Telegram returned HTTP 200, eligible 2, observed 0, total null. Both old rows have IDENTITY_UNPROVEN, null metric and no collection error. UI shows "Не подтверждён адрес этой публикации" and "сбор реакций ещё не дал данных". Missing observations are not zero reactions. No actual message/account IDs, raw responses, cookies or tokens are retained in this report.

Current `repository.ts::publicationIdentity` requires a valid primary message ID and an immutable numeric destination (stored receipt or supported numeric legacy URL) for Telegram coverage. `telegram.ts::ingestTelegramReaction` matches that identity to an owned connected channel before persistence. The response proves the identity boundary is unmet; it does not prove which stored field is responsible. Do not assign a root cause from the UI or weaken the check.

The authenticated aggregate receiver is deployed. Its `TELEGRAM_ANALYTICS_WEBHOOK_SECRET` validation, actual webhook registration/allowed updates, other consumers and real delivery were not verified or changed in this release. Do not claim the webhook is absent or the bot token is invalid without evidence.

Resume checklist, only after explicit Owner resumption:

1. Read-only inspect the two legacy receipt identities with sanitized metadata; prove the exact missing/invalid condition before proposing a fix or backfill. Preserve historical receipts and ownership checks.
2. Privately inventory `getWebhookInfo`, required allowed updates and any other polling/webhook consumer. Do not consume a polling queue, overwrite a foreign webhook or discard pending updates.
3. Obtain separate Owner approval for any minimal identity correction and private webhook/env configuration. Use a distinct secret, never reuse session/VK keys or expose bot credentials.
4. Separately agree one real reaction/receipt check on an existing owned post, respecting delayed delivery and event ordering. No synthetic provider success or blind retries.
5. Record real persisted/UI reaction evidence before declaring Telegram analytics accepted. Historical reactions are not promised.

Telegram analytics is HOLD. Existing Telegram publishing remains within its previous acceptance scope. VK remains HOLD at TOKEN_EXCHANGE / INVALID_GRANT; Instagram, CR07/CR08/GAP01 and infrastructure work are not resumed.

## Next roadmap phase

Phase 9: scheduling automation. Owner authorized moving into discovery, not an unspecified implementation. Clarify the first scenario (placing approved drafts into slots versus recurring selected posts), then approve its design/plan as required. Reuse the planner/free scheduler and preserve explicit content approval; no AI, provider publication, bot permissions, infrastructure or unrelated fixes during discovery. Phase 8 stays PARTIALLY ACCEPTED with Telegram deferred.

This documentation update changes no runtime, tests, dependencies, schema, secrets, provider settings or production state. Historical verification reports remain intact.
