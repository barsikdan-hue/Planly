# VK rejection diagnostic implementation plan

Owner approved source preparation of a separately named diagnostic operation; old ATTEMPTED markers must remain intact. No live upload/build/deploy authorization.

1. TDD: strict safe metadata classifier for Allow/Content-Type and a maximum4KB rejection body, with only enums and bounded numeric VK error code emitted. Never emit raw headers/body/URL/description/hash/photo/token. Unknown, oversized, aborted and incomplete responses are explicit.
2. Capture that metadata from the existing single POST response without changing method, multipart, URL, DNS/TLS, redirects, deadlines or retry behavior. Sanitize again at API/browser/message boundaries.
3. Put the new fixed diagnostic operation ID in one shared public module used by server/browser. Do not read, clear, expire or reuse prior markers. Preserve owner auth and server NX. UI identifies this as a new405 diagnostic, not a retry of the old attempt.
4. Run isolated tests, synthetic browser, type/lint/static/Next checks, independent review, source push and exact-head CI. No VPS operation or provider traffic. Root cause of actual405 remains unproven until separately approved diagnostic evidence.
