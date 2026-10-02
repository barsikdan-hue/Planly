# MAX publication checkpoint — 2026-10-02

- Owner destination: https://max.ru/channel_danil_sochi_realty
- Designated bot: @se14310498_bot
- Changes are isolated to feat/self-host-build; main is unchanged.
- CI 36973994580 passed typecheck, lint, tests and build for owner connection / private media worker integration.
- Official root CA retrieved over verified HTTPS from https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt. SHA256 certificate fingerprint D26D2D0231B7C39F92CC738512BA54103519E4405D68B5BD703E9788CA8ECF31; expiry 2032-02-27.
- Read-only MAX preflight with additional CA confirmed the designated bot identity. TLS verification was never disabled.
- After owner removed/re-added bot, runs 36978911163, 36979042900 and 36979146372 still found no events. Latest confirmed webhook count 0; update count 0.
- No numeric chat_id or destination membership has been confirmed. No MAX message POST has been attempted; no live MAX post was sent.

## Remaining work

1. Obtain chat_id from a real administrator event/message or owner-provided ID; confirm exact destination and posting permission.
2. Complete scoped MAX CA support in production Docker web/worker (currently CA exists only in the isolated read-only probe process).
3. Run real text, photo, video and ordered album publications through Planly owner API, private storage and worker. Store safe remote IDs and evidence; do not resend Telegram.
4. Add / verify independent MAX retry regression; final code review and current-branch UI check.
5. Only then offer a tested downloadable build. Do not claim completed MAX acceptance yet.
