# VK transient upload failure classification

The owner performed the authorized operation once. Screenshots show UPSTREAM_UNCONFIRMED in both popup and Mini App. Fresh read-only Redis audit found one ATTEMPTED marker; dedicated Nginx access log confirms one authorized POST returned HTTP200. Two other POST denials belong to rollout checks. No known transport error code appeared in the bounded web log inspection. The old implementation catches API HTTP rejection, VK JSON errors, malformed replies and transport failures as the same generic result. This source defect is proven; the specific provider failure of the consumed attempt is NOT_PROVEN and cannot be recovered because the token/body were not retained.

## Scope and checks

- Keep operation vk-user-upload-20261103-01 and its consumed markers unchanged. No retry, new operation ID, provider request, deployment, credential/payload logging or persistence.
- Distinguish GROUPS_READ, UPLOAD_ADDRESS_READ, FILE_UPLOAD and UPLOAD_RESPONSE using closed reason/transport enums, bounded observed HTTP status and numeric VK error code only where appropriate.
- Share a strict diagnostic sanitizer between server, popup and Mini App. Discard unknown fields, nested values, raw error descriptions, signed URLs and credentials. Existing unknown outcomes remain unknown; no inference from new classification is applied retrospectively.
- TDD: explicit provider rejection must cease collapsing into generic unknown; malformed responses and network failures have distinct safe categories; terminal marker and zero save/post calls remain tested.
- Focused regressions, synthetic browser echo checks, typecheck/lint/build, independent review and exact-head CI before preparing any separate release proposal.
