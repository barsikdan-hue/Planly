# VK Mini App feasibility probe

Owner selected this isolated feasibility spike and confirmed ownership of
Mini App54809413. Web VK ID54809575 is a different application and stays unchanged.
Use the existing isolated checkout, new branch codex/vk-miniapp-probe-20261029
from084b0f4; native worktree tool could not use the authoritative nested checkout
as sourceRoot, so reuse it without resetting known documentation WIP. No unrelated
code from the backup branch is changed. Use executing-plans/TDD inline.

## Goal and limits

Prove whether the actual VK Mini App can return wall/photos user permissions and
obtain a new wall-photo upload endpoint. This is not production authentication,
full photo delivery or recurring SaaS publishing proof. No backend/token export,
storage, cookies, logs, analytics, uploads, post/delete methods or account changes.
Token lives only in a controller closure until reset/page exit; UI only shows
allowlisted scope booleans, optional provider-reported expiry and safe error codes.

## Files and steps

- [x] Add tests/vk-miniapp-probe.test.mjs first. Watch failing controller import,
  then prove denied/missing-scope/wrong-context paths, exact authorized app ID,
  no token echo, duplicate clicks, reset/late responses and no write methods.
- [x] Implement experiments/vk-miniapp-probe/controller.mjs with injected official
  bridge, no automatic auth grant; button-scoped init/auth and two read-only calls:
  groups.getById242095689 with admin/editor control check, then
  photos.getWallUploadServer242095689. Baseline API5.199, fixed15s SDK bound,
  no retries. Current-context checks after each asynchronous operation.
- [x] Minimal static UI/main/build with pinned official @vkontakte/vk-bridge3.0.2
  and esbuild0.28.2, separate lockfile; no root dependencies/app routes changed.
- [x] Build and run synthetic controller/security checks and local UI inspection.
  Outside VK, render instructions; do not fake a provider PASS. Independent review.
- [ ] Prepare exact build hashes, host/URL selection and any existing Mini App URL
  change for Owner review. No deployment, tunnel, app-setting update or provider
  access before its precise gate. Human completes permission consent themselves.
- [ ] Only after approved hosting/configuration: actual grant and read-only probe.
  Upload/save/send are later gates. A successful short-lived grant alone does not
  establish unattended scheduling: lifetime/renewal must be verified separately.

## Current external dependency

App ownership confirmed. Existing Mini App web hosting URL/settings are unknown
because browser policy blocks VK. Owner must show non-secret launch/web-version
settings before choosing a host or editing them; never reuse group token as user
token or substitute Web app ID. Public official sources:
https://github.com/VKCOM/vk-bridge/blob/master/packages/core/src/types/data.ts
https://github.com/VKCOM/create-vk-mini-app

## Source checkpoint

11/11 focused tests PASS, build PASS, targeted ESLint PASS, independent source
review no actionable findings (reviewer independently reran11tests). Reset during
late grant and community lookup covered. Local390px page shows outside-VK state,
all actions disabled; no provider interaction. Screenshot under private local
visualizations/vk-miniapp-probe-local390.png. Dedicated credential-free CI added.
Native worktree error did not mutate root; reused existing isolation/new branch.
Initial late-grant test exposed deferred SDK dispatch timing, removed unnecessary
microtask deferral; no retries/timeouts increased. No real credentials loaded.

Owner subsequently confirmed old editapp54809413 redirects to Web54809575, then
opened the distinct developer portal dev.vk.ru/ru/admin/app-settings/54809413/info.
An attempt to read this actual Mini App page was rejected by site-safety policy;
no alternate/private browser access attempted. Launch/hosting settings remain a
human screenshot dependency, not a reason to substitute app IDs or edit Web54809575.
