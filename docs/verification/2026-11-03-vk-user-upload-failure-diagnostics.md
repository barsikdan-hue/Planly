# VK transient operation: consumed unknown outcome and diagnostic repair

## Actual provider attempt

The owner approved one groups.get, one photos.getWallUploadServer and at most one fixed PNG upload for community242095689, then operated the new owner window. Screenshots show UPSTREAM_UNCONFIRMED in popup and Mini App, with no HTTP or stage detail. Read-only Redis audit found exactly one ATTEMPTED marker for vk-user-upload-20261103-01. Dedicated Nginx logs show the authorized POST received HTTP200 from Planly. That response does not establish any VK call or upload success.

Bounded web-log inspection found no allowlisted DNS/TLS/timeout/reset code. No raw logs, token, signed URL, photo/hash or API error description were returned. The released catch-all erases the distinction between provider HTTP rejection, VK error envelope, invalid response and transport failure. Therefore the actual failing layer and exact cause remain NOT_PROVEN; discarded metadata cannot be recovered retrospectively.

The marker remains consumed. No second provider request, upload, post or marker reset was performed while investigating these screenshots.

## Source repair

Introduced one shared closed diagnostic DTO: stage GROUPS_READ/UPLOAD_ADDRESS_READ/FILE_UPLOAD/UPLOAD_RESPONSE; fixed reason; optional bounded numeric VK code and allowlisted transport category. API rejections now emit PROVIDER_READ_REJECTED; malformed API replies emit INVALID_PROVIDER_RESPONSE. File upload and response validation retain separate stages. HTTP fields represent only actually observed statuses. Parent deadline races retain the active stage. No raw error strings, nested provider data, token or URL are exposed.

Popup and Mini App sanitize again and format only fixed labels. Authorization, exact origin/header, body/deadline limits, permanent Redis claim, operation ID, fixed group/PNG, native multipart, token-memory-only rule, no save/post and no retry remain unchanged.

## Verification

New regressions first failed for discarded provider-stage diagnostics; repaired code passes147 focused tests. Synthetic browser uses a mocked VK error27 to verify stage/code survive both windows while the synthetic token is excluded, trusted consent remains required and duplicate operation is blocked. This mocked code27 is NOT the observed real error. Static build, standalone typecheck, targeted ESLint and full Next production build passed. Independent reviewer passed40 relevant tests and found no actionable issue.

Exact-head CI remains a separate check after push. Staging still serves ee72a47. No new image build/deploy, infrastructure/secret change or provider operation is included in this source repair. A future diagnostic attempt requires its own explicit scope/authorization and a distinct operation decision; this repair does not silently re-enable the consumed test.
