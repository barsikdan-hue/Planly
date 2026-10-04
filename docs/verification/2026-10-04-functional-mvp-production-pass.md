# Functional MVP production acceptance — 2026-10-04

STATUS: **PASS**. Phase 4 is complete. Phase 5, Content Library, is the next product milestone and requires a separately started implementation task.

## Identity and evidence scope

- Repository: `barsikdan-hue/Planly`; acceptance source/deployed checkpoint: `af6288540bfe34d12e992b0535dfc2e04a5bc787` on `main`, matching current remote main. Checkout was clean before this documentation branch.
- [PR #4](https://github.com/barsikdan-hue/Planly/pull/4) is merged. Existing Render service `srv-dav07le0tbcc73d0gfi0`, manual deployment `dep-db1177dg1s2s73839l80`, is `live` at that SHA; deployment finished `2026-10-04T08:53:37.443602Z`.
- Acceptance environment: authenticated browser at `https://planly-m4zq.onrender.com`; public Telegram channel history independently checked at `https://t.me/s/danil_sochi_realty`.
- The owner handoff already accepted production desktop/mobile UI, draft/edit/reload/copy/delete, Calendar, Settings, PNG/MP4 upload and save/reload previews, MAX media and scheduled text with receipts. This report closes the remaining Telegram gate at the same code checkpoint. It does not claim that the earlier MAX/UI acceptance was repeated in this run.
- No production code, secret, infrastructure or scheduler configuration was changed by this acceptance. The owner privately applied the token correction and deployed the existing code checkpoint before this run.

## Telegram validation

Settings → existing Telegram account → `@danil_sochi_realty` → «Проверить и подключить» succeeded against the new runtime. The server path is `Settings/SocialAccounts` → client `connectSocialAccount` → `PATCH /api/social-accounts/:id` → server `connectSocialAccount` → `createTelegramConnector.validate` → `getMe` → `getChat` → `getChatMember` → canonical account persistence.

The successful result proves bot validation and the destination administrator/posting-permission checks in the deployed connector. The persisted API account was `CONNECTED`, enabled, and canonical destination `-1004390954741`, display name `«Данил | Недвижимость у моря»`. Raw provider identity responses and token values were not exposed. This report does not independently claim a particular bot username beyond the server's successful bot identity validation.

## Minimal live smoke

| Scenario | Local test marker | Post / target IDs | Persisted result | Provider receipt |
| --- | --- | --- | --- | --- |
| PNG plus caption, publish now | `TGFINAL-M-0854` | Post `15ed2d66-202b-4417-b3a0-8841974e8d65`; target `d8881767-b889-455c-83cf-6da0228ac3bc` | `SCHEDULED` → `PUBLISHED`; error `null`; one media ID | [Telegram 31](https://t.me/danil_sochi_realty/31) |
| Scheduled plain text | `TGFINAL-S-0854` | Post `772c5d1c-e8da-4882-954a-f6cded1d460e`; target `f4f4ce37-b498-4e9b-b7e5-5e06b44d5ece` | `SCHEDULED` → `PUBLISHED`; error `null`; no media | [Telegram 32](https://t.me/danil_sochi_realty/32) |

The PNG was uploaded through the actual production editor file chooser, then appeared in the attached-media view and Telegram preview. Fixture: `planly-telegram-acceptance.png`, 640×360, 4,855 bytes; SHA-256 `b474207076db0a078b89072c1117cd94ff3366cf9254da6a34823b127563df37`. Stored media ID: `b02a1919-96d5-4c93-a53f-259160dd6d1d`.

Each post was created once with a `[ТЕСТ PLANLY]` caption/text. The scheduled text was persisted for **2026-10-04 12:02 Moscow**, `2026-10-04T09:02:00.000Z`, before processing. The initial automation fill changed the native date/time display without updating React state; the same unprocessed post was edited using keyboard changes, and the PATCH response confirmed the intended timestamp before the tick. No second post was created. This was an automation interaction limitation, not a proven product bug.

Publication receipts came from the authenticated server bootstrap API after reload, not merely local UI state. The post record status remains `READY`; its Telegram target publication is `PUBLISHED`, and the UI correctly shows «Опубликовано» with the provider link. Public Telegram history independently contained the PNG/caption at ID 31 and plain text at ID 32.

## Scheduler and duplicates

The existing `scheduler-tick.yml` workflow was dispatched on `main`; it calls the authenticated production endpoint. No redesign or cron change was made.

| Run | Runtime result | Evidence |
| --- | --- | --- |
| Media tick | `scanned:1, processed:1, published:1, skipped:0, failed:0` at `08:57:59 UTC` | [37190611775](https://github.com/barsikdan-hue/Planly/actions/runs/37190611775) |
| Due scheduled-text tick | `scanned:1, processed:1, published:1, skipped:0, failed:0` at `09:02:52 UTC` | [37190878155](https://github.com/barsikdan-hue/Planly/actions/runs/37190878155) |
| Control tick after both published | `scanned:0, processed:0, published:0, skipped:0, failed:0` at `09:04:24 UTC` | [37190962756](https://github.com/barsikdan-hue/Planly/actions/runs/37190962756) |

All three jobs completed successfully at the expected production code SHA. After the control tick, the authenticated planner contained one post per test marker and public Telegram history contained exactly one matching message per marker, IDs 31 and 32. **No duplicates observed in this bounded acceptance window.** This is not a universal exactly-once guarantee. Direct external PostgreSQL inspection was unavailable because the existing database rejects external connections; its network policy was preserved. Persisted application API results, provider messages and scheduler receipts supply the acceptance evidence.

Manual tick dispatch proves the functional scheduled-publication chain after the due time. It does not prove GitHub cron timing precision, which remains accepted debt until target hosting.

## Runtime and exact-SHA checks

- Database-backed `/api/health`: HTTP 200, `{"status":"ok"}`, before and after smoke.
- Render error-log query: zero entries, `hasMore:false`, from `2026-10-04T08:53:37Z` through `2026-10-04T09:04:44.775448803Z`.
- Existing exact-main [CI 37185070550](https://github.com/barsikdan-hue/Planly/actions/runs/37185070550): freshly inspected result `success`; **243 tests, 243 pass, 0 fail, 0 skipped**, with migration drift/apply, typecheck, lint and build successful. This run preceded the provider smoke and was not rerun locally for acceptance.
- Existing exact-main [Self-host build 37185070546](https://github.com/barsikdan-hue/Planly/actions/runs/37185070546): freshly inspected result `success`; kept distinct from Render/provider proof.

## Product closure and delivery boundary

Functional MVP PASS combines the accepted production baseline from the owner handoff with the fresh final Telegram checks above. Historical verification documents retain their original scope and are not rewritten.

Documentation is delivered separately on `codex/docs-product-rules`: current `ROADMAP.md`, `AGENTS.md`, necessary `README.md` corrections and this new evidence report. AI is removed from the product roadmap; Content Library is next, followed by the non-AI Swipe Planner. Additional networks require explicit owner decision. Documentation PR merge remains an owner gate. Content Library implementation, a new production code deployment, paid resources and scheduler redesign are outside this task.
