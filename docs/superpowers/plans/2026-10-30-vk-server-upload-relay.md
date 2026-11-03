# Owner-scoped server upload test

Root cause: Owner console626af2e4 confirms actual pu.vk.ru upload response lacks
ACAO for stage.lentaro.ru. Browser cannot read it. Old attempts remain unknown;
do not reset either existing marker or retry them.

User approved preparing a server handler then explicitly requested execution.
Scope: source-only owner-authenticated same-origin upload-only endpoint, not full
agent onboarding/token export/saveWallPhoto/wall.post. Accept fixed group242095689,
PNG<=1MB, strict base64 and current pu.vk.ru upload URL in bounded JSON. Only exact
pu.vk.ru HTTPS, observed /cDIGITS/ssDIGITS/upload.php path, actdo_add/wallphoto1;
reject credentials/port/fragment/token query keys/control characters. Signed URL
stays in memory, no logging/storage; token never accepted.

Resolve exact hostname IPv4, reject non-public/reserved addresses, pin HTTPS
connection to validated IP while preserving hostname certificate verification.
No redirects/proxy/env credentials. Absolute request deadline and bounded reply.
Validate upload response shape and return only fixed result/HTTPstatus. No raw
upload response/hash/photo/URL returned or logged in this upload-only test.

Existing owner session + provider-owner email gate + same-origin mutation policy.
Read-only GET admission checks the owner session before browser claim/POST. This
can fail closed under third-party cookie policies in VK iframe; no auth bypass.
One fixed server-side Redis SET NX marker (no expiry, no deletion) before network
dispatch, preserved on error. Source does not write this marker. No agent gate
relaxation or relying on vk_app_id URL as authentication. Prepared frontend uses
GET admission, a separate browser marker, existing Web Lock and reset epoch fences.
Real owner admission inside VK remains unverified; no public relay.
Both static meta and separately deployed probe header CSP need connect-src 'self'.
Independent review caught missing self; regression observed RED/GREEN before fix.

TDD for URL/body/DNS/auth/claim/one-upload/no-reflection, build/type/lint, independent
review and exact CI before release request. Staging deployment, signed URL transfer
to server and one NEW upload-only attempt require a concrete separate Owner gate.
No claim that this fixes server transport until actual approved upload evidence.
