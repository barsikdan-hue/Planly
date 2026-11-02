# Standalone curl control preparation

Owner approved implementation of a one-time URL-only export into C:/Users/EliteSochi/.codex/private/vk-control/, SSH in-memory transfer and local URL-file removal after the operation. This source preparation does not execute a real upload or authorize deployment.

## Implemented

- Separate top-level export window reuses exact origin/source/nonce, owner admission, TTL and fresh-peer confirmation. Trusted native file-picker click asks for the approved directory and exact filename vk-curl-address.json; browser APIs do not expose the absolute selected directory, so Owner must choose it as instructed. Local runner accepts only the fixed approved path. Unsupported picker does not fall back to Downloads/clipboard. File contains only uploadUrl and exportedAt, not token/cookie/image. Separate export WebLock+permanent marker prevents another write; original markers untouched. Cancellation during asynchronous write aborts before commit.
- Local runner defaults to --prepare: render a neutral PNG offline with intercepted browser network, no provider operations. --execute-once is a distinct future gate. On execution it admits only a bounded fresh export, creates a separate local permanent marker, sends the helper and then payload via existing SSH, never puts the URL into argv/logs, and removes only the approved URL file after the operation returns or becomes unknown. No token/session export. It creates no service/listener or application configuration.
- Root-only standalone curl helper has its own permanent marker. Strict observed URL family, required unique parameters including empty-duplicate rejection, encoded-control rejection, public IPv4 validation/pinning, TLS verification, no proxy/curlrc/redirect/retry, bounded time and response. Multipart POST photo; no saveWallPhoto/wall.post. Signed URL goes through curl stdin configuration only. Temporary PNG and response files are root-only and removed on exit; raw responses never emitted. Only closed status/classification fields escape. Unknown outcome consumes the attempt; no automatic retry.

## Verification

84 scoped Node tests PASS; six offline Python tests PASS, including timeout then second-run no dispatch; four export tests cover private fields, consumed marker and cancellation. Fully intercepted browser export PASS: trusted-only native-picker stub, no POST, URL absent from visible text, repeat blocked. Existing synthetic upload-window regression PASS. Static build, TypeScript, targeted lint and full Next build PASS. Independent review findings (write cancellation and blank query parsing) reproduced RED and corrected GREEN; final review no actionable findings.

Private local directory created with protected owner+SYSTEM ACL, no URL exported or read. Existing unrelated WIP preserved. No VPS helper upload, package installation, service mutation, new VK reads or uploads performed by preparation. Staging remains web b4040d1/static d2d105b until separately approved rollout.

## Limits and next gates

The PNG uses the same neutral canvas drawing commands; exact historical byte identity is not established across Chromium versions. DNS answer selection and client defaults can also differ. A result difference implicates a client/environment-dependent factor, not a proven specific root cause. Another405 does not prove an IP block or global provider outage.

Need exact-head Linux CI, candidate image build and owner-approved deployment for the new export window/static button. Then one separately authorized fresh pair of group/upload-address reads and export, followed by at most one standalone curl upload under an exact provider/infra gate. No real upload currently executed or declared working.
