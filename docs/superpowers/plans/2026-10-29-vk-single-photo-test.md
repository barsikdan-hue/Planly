# One owner-authorized new-photo publication spike

Owner repeatedly authorized one new neutral image and fixed text in group242095689.
Existing MiniApp54809413 current grant proves editor-list match and upload endpoint,
not actual file transfer/save/post. Do not export token, reuse old community key,
weaken browser policy or claim unattended SaaS delivery.

Prepare source inline using TDD, independent review and exact-head CI. A separate
button starts one fixed operation; same-origin localStorage latch is claimed before
any mutation and retained across reset/reload/error, with no secrets in storage.
Token, upload URL and upload response remain closure-only. Generate a neutral PNG
in browser canvas (no external image/AI service). Fixed text:
Тест Planly: автоматическая загрузка нового изображения в VK

After fresh control proof: allow only existing connector's HTTPS pu[digits].vk.com
upload host family, multipart photo, redirect:error/credentials:omit, bounded wait.
Direct-browser CORS support is NOT_PROVEN; failure stops, no relay/fallback introduced.
Validate response then photos.saveWallPhoto for fixed group, validate owner_id/id,
then wall.post fixed owner/from_group/text/photo and fixed operation GUID. No retry.
Any unknown outcome is terminal, needs readback before owner chooses another action.
Page reset invalidates continuation and does not unlock persistent mutation latch.

Prepare explicit UI notice replacing no-upload/no-send claim for new version.
Current CSP connect-src none blocks upload: deployment requires a separate precise
gate for new source plus ONLY static probe header/meta connect-src https://*.vk.com;
runtime code remains stricter pu-family. App/DB/env/other paths unchanged.
Do not deploy or call provider under source-preparation commands. Human completes
VK consent and clicks test button because VK private browser control is blocked.
