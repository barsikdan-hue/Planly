# VK Mini App diagnostic spike

Current prepared correction: actual Owner dry-run reports upload host pu.vk.ru.
Original pu[digits].vk.com-only guard caused UPLOAD_HOST before any mutation.
Only exact pu.vk.ru is added to the static test guard/meta CSP; HTTPS, credentials,
port, fragment, token-in-URL, image, ownership, redirect and one-shot checks remain.
Public TLS hostname verification PASS; actual upload/CORS/save/post not verified.
No backend connector changes. Staging stays400cce4 until separate deployment gate.

## Prepared source: single owner-authorized new-photo test

New source adds a third explicit one-shot publication button for fixed group242095689,
fixed TEST_MESSAGE and a neutral canvas-generated PNG. First two buttons remain
read-only. Same-origin Web Locks serialize clicks/tabs; fixed localStorage marker
is written before first mutation and survives reset/reload. No token in storage.
Fresh control proof precedes upload; token/upload URL remain closure-only. Strict
HTTPS pu[digits].vk.com upload family, no credentials/redirects. Then saveWallPhoto
and fixed wall.post GUID, validating saved photo owner and post receipt. Unknown
outcome is terminal; do not clear latch/retry. Reset cancels further steps, including
preflight/image generation. This is not a server-side/global idempotency ledger;
do not launch it in another browser/profile or manually remove the marker.
Browser CORS upload support remains unverified; failure stops without a relay or
fallback. One actual Owner send grant exists, not yet consumed. Staging stillc1e3fbc.
Deployment needs exact Owner gate for the assets plus probe-only header CSP
connect-src https://*.vk.com (meta updated too), preserving all other site paths.
25 tests/build/targeted lint and independent review are source evidence only.
No source preparation command uploads/saves/posts or changes hosting.

## Current source revision: editor-list control proof

Owner authorized preparation only, not deployment or live calls. Actual54809413
grant returned wall/photos, but groups.getById omitted is_admin/admin_level despite
the owner's access to community management. Do not assume why VK omitted them.
The new source replaces that role-field check with official groups.get filter=editor,
extended=0, count=1000, offset=0, using the same current user token and no user_id.
VK documents editor as administrator-or-editor. New consent scope is wall,photos,groups;
all three returned scopes are mandatory. Exactly one page is read; a valid numeric
target ID242095689 must occur in its items before photos.getWallUploadServer runs.
Missing target in an incomplete page stops explicitly without pagination. Malformed
or duplicate IDs fail closed. Other IDs/list/token are never emitted or persisted.
Only shape, target-match and completeness booleans are displayed. Existing reset,
late-response, no-upload/no-send and closure-only token boundaries remain.
Official schema: https://github.com/VKCOM/vk-api-schema/blob/master/groups/methods.json
Official Bridge scopes: https://github.com/VKCOM/vk-bridge/blob/master/packages/core/src/types/data.ts
Earlier getById instructions below describe the original deployed investigation,
not the updated source. Staging remains9e8cdfd until a separate exact deployment gate.

Owner selected this spike and confirmed Mini App54809413. It is NOT the Web
VK ID app54809575. No existing app/hosting configuration has been changed.
An earlier supplied screenshot showed54809575 after an old-panel redirect. Owner
has now opened dev.vk.ru/ru/admin/app-settings/54809413/info; browser site-safety
also blocks this domain, so actual Mini App launch URL remains unverified.
Confirm its real launch settings before deploying/changing anything.

## Build and local verification

```sh
npm ci --prefix experiments/vk-miniapp-probe --ignore-scripts
npm run build --prefix experiments/vk-miniapp-probe
node --test tests/vk-miniapp-probe.test.mjs
```

Separate package/lock pins official @vkontakte/vk-bridge3.0.2 and esbuild0.28.2.
No root dependencies changed. Deployable assets are dist/index.html, app.js and
style.css; no source maps, remote script CDN, analytics or credential configuration.
Do not deploy or expose a development tunnel from these build instructions.

Outside VK the page only shows instructions and disables all operations. A local
HTML load proves rendering, not a working provider grant. vk_app_id is a context
hint checked for54809413, not a signed proof of the human/app's authenticity.

## Actual operation after a separate hosting/app-configuration gate

1. Host exact reviewed assets with HTTPS and suitable iframe headers. Confirm the
   selected Mini App web launch URL and preserve its previous configuration.
2. Human opens Mini App54809413. VKWebAppInit alone does not request credentials.
3. Human presses the permissions button and completes VK consent themselves.
   Request is wall,photos; only actually returned scopes count. Missing grants stop.
4. Token stays in a controller closure. UI only displays fixed scope booleans,
   optional provider-reported expires_in and bounded numeric error codes. No token
   DOM/storage/export/backend transfer, SDK debug logging or raw-error reflection.
5. Human presses photo-check button. Exactly two possible read-only methods:
   groups.getById242095689 with is_admin/admin_level2or3, then
   photos.getWallUploadServer242095689. No file is uploaded, no photo is saved and
   no post is created. Returned upload URL is not displayed, persisted or followed.
6. Clear/page exit invalidates stored credentials/results. In-flight SDK calls may
   settle later; stale callbacks cannot restore local state or start next probe.
   This does not revoke permissions in VK. SDK timeout15s, no automatic retries.

## What PASS would mean

PHOTO_ENDPOINT_AVAILABLE means this one actual grant could obtain an HTTPS upload
URL after the community check. It does not establish upload/save/publication,
validity of the upload host, unattended scheduling, renewal or multi-user SaaS
binding. expires_in absent means UNKNOWN; never manufacture token lifetime.

No production authentication/login logic is implemented here. A future backend
integration requires verified signed launch/user binding, one-time session-bound
consent, encrypted server credentials, lifecycle/revocation checks and isolation.
Do not bypass existing owner-only VK guards based on this page's URL parameters.
Upload, save, publication, token transfer and actual app changes remain separate
scoped gates. No previous group-token send grant applies to this spike.

Current source evidence: 11 synthetic controller tests PASS; standalone build and
targeted ESLint PASS; local390px outside-VK rendering inspected. Independent source
review found no actionable issues. Real grant/SDK/API shapes/expiry/renewal and
hosting remain unverified. Static spike uses no persistent backend database.
