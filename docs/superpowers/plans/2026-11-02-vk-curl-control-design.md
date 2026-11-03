# One standalone curl upload control

## Confirmed inputs and boundary

Current source d2d105b; staging web b4040d1, static probe d2d105b. Owner screenshot886e7b09 reports fallback ABSENT. Actual preceding upload: HTTP405, HTML, METHOD_REJECTION, Allow unspecified. No confirmed upload, save or post. Old consumed markers remain untouched.

Read-only host preflight: /usr/bin/curl exists on staging VPS62.173.149.73; curl is absent in the web container. No packages installed and no provider calls made by this preflight.

## Selected control

Prepare a standalone host curl command, rather than modify the application or add a listener/service. It receives one fresh temporary upload URL and the same neutral PNG through bounded stdin over existing SSH. No VK access token, session cookie or host credentials enter this payload. No URL in argv, shell, log, report or persistent file. URL is placed only into curl stdin configuration; the PNG and bounded response use a root-only temporary directory. Curl runs once; process/network errors and unknown outcomes do not retry.

Preserve strict URL admission (HTTPS, exact pu.vk.ru, observed /cDIGITS/ssDIGITS/upload.php family, required act=do_add and wallphoto=1, no credentials/fragments/token parameters). Resolve public IPv4 once and pin with --resolve. Disable proxy configuration and curlrc, redirects and retry; preserve TLS verification and host name. POST one multipart photo field, filename planly-server-test.png, Content-Type image/png. Bound runtime and response size. Emit only HTTP status, bounded enum classifications and optional numeric VK error; never response text, photo/hash or signed URL. Create a separate permanent one-shot marker before network dispatch, never touch older markers. No saveWallPhoto or wall.post.

This comparison changes HTTP client/serialization from native Node HTTPS to curl, on the same VPS and host with the same method, field, image and DNS/TLS policy. A different result would implicate a client-dependent factor, not prove which header/serialization detail caused it. Another405 would not prove a global VK outage or IP block.

## Missing input and next approval

The existing UI deliberately does not export or retain its temporary signed URL; prior addresses cannot be reconstructed. Before implementing the transfer step, Owner must approve how one freshly obtained address is transferred from Mini App to the standalone operation. Do not request a token or URL in chat, copy an existing browser session, reset markers, install packages, deploy, create a service or execute another upload under preparation approval. Prefer a narrowly reviewed one-time export into the existing private local area, read once over SSH and removed afterward; this export changes the previous secret-handling boundary and needs an explicit decision. Preparation alone does not authorize that export or provider calls.

Acceptance before execution: offline URL/config/privacy tests and fault-injection tests (no retry and unknown-result handling), independent review, exact helper hash, and a separately recorded maximum-one provider-upload gate with bounded API reads to obtain its fresh address. No production or main change.
