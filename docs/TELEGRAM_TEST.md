# Telegram Phase 4 — test-channel verification

The bot token is configured privately as `TELEGRAM_BOT_TOKEN` on both web and worker. Never use a `NEXT_PUBLIC_` name or send the token in chat. This single-owner slice reads runtime environment configuration; it does not persist credentials in the browser/database.

In Planly → Соцсети, enter the channel/group username or negative chat ID and select «Проверить и подключить». The server checks getMe/getChat/getChatMember and administrator status (channels additionally require posting permission), then stores the canonical chat ID. Add the bot as group/channel administrator first; channels additionally require permission to post messages. MAX remains unsupported.

Supported: plain text (4096 UTF-16 units), PNG/JPEG photos (10 MiB), MP4 video (the app's 20 MiB upload limit), mixed photo/video albums (2–10 items), captions (1024 UTF-16 units). WebP/WebM publishing and automatic text splitting are deliberately rejected. The app's general media library may contain those formats for future connectors. Worker downloads private object bytes internally and sends multipart uploads; it never makes the bucket public.

«Опубликовать сейчас» uses the same Publication/BullMQ path as delayed scheduling. The page polls server state while publications are scheduled; closing the browser does not cancel work. Per-target result and Telegram link appear only after provider confirmation and remote-ID persistence. Album message IDs are stored in order as a comma-separated string. Token/permission failure requires reconnect. Telegram retry_after is the minimum bounded backoff. A lost/malformed mutation response or unexpected exception after provider handoff becomes AMBIGUOUS_DELIVERY and is not blindly retried: inspect the channel before any manual resend.

## Authorized live test target

Owner supplied `@danil_sochi_realty` on 2026-10-02 and clarified it is a group; sender bot is `@danil_sochi_realty_bot`. The isolated live job publishes explicitly marked `[ТЕСТ PLANLY]` text/photo/video/album messages only to this destination. Ordinary CI does not call Telegram; the live job runs only on the first attempt of a push whose commit message contains `[telegram-live]`. Workflow reruns do not publish; another deliberate run requires a new explicit trigger commit. Do not use that label unintentionally.

Before the live run, add the bot token to GitHub repository **Settings → Secrets and variables → Actions → New repository secret**, name `TELEGRAM_BOT_TOKEN`, and give the bot administrator status (channels additionally require posting permission). An operator then creates the explicit live-test trigger commit on the approved branch. No main merge, paid Render worker or scheduled GitHub timer is needed: the actual Docker worker runs inside the disposable runner for this test.

The live workflow uses a fresh database/Redis/private media stack and owner session. It creates posts through Planly API, waits for real worker confirmation, verifies saved remote IDs plus the UI adapter's published state, and saves `telegram-live-evidence.json` without token/cookie/signed URLs. The album is scheduled 15 seconds ahead. Test messages remain visible in the channel; nothing is deleted from Telegram automatically.

Passing unit/integration/HTTP Docker tests is not a claim of a live Telegram pass. Phase 4 remains **LIVE TEST PENDING** until the provider confirms this gate. A browser walkthrough of the deployed UI remains a separate online acceptance check before final build handoff.

Group extension approved 2026-10-02: channel, supergroup and basic group are supported with an administrator bot; private user chats are rejected. Basic groups without message permalinks store the confirmed remote ID and no invented URL. Accidental outer token whitespace is removed before validation; malformed nonempty tokens have a distinct safe error. Live acceptance still pending.
