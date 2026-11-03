# VK publishing grant: bounded next step

Status: owner approved source implementation on 2026-11-03. No deployment or real token transfer/upload has been authorized by this source decision.

## Evidence

The server connector already supports native multipart photo upload, saveWallPhoto and wall.post. Source d966ab6 corrects the observed pu.vk.ru allowlist defect (84 targeted tests, independent review). Staging has no VK credential rows or required VK configuration. Existing VK ID OAuth demands an access/refresh pair with wall/photos; the observed Mini App consent grants wall/photos/groups but did not report a verified lifetime or refresh contract. The community key cannot be substituted for user-only photo methods.

Official references checked 2026-11-03:
- https://raw.githubusercontent.com/VKCOM/vk-api-schema/master/photos/methods.json
- https://raw.githubusercontent.com/VKCOM/vk-bridge/master/packages/core/src/types/data.ts

## Recommended bounded design

First establish one real new-image upload using the actual server connector transport and a user token obtained through the owner's own Mini App 54809413. This is a feasibility test, not release of unattended SaaS publishing.

Reuse the existing top-level Planly owner window and exact-origin/source/nonce/expiry checks. Add a separate explicit, accurately labelled consent to transfer the VK user token to the Planly staging server for this single operation. Token is never placed in URLs, browser storage, logs, files, Redis or database. Server holds it only for the bounded request; no refresh token is invented and no existing credential schema is bypassed. Do not enable or enqueue the account.

New server admission must be owner-only, exact-origin, CSRF protected, body-limited, TTL limited and atomically one-shot across windows. Fixed group 242095689 and fixed neutral PNG; no arbitrary destination or media URL input. Validate granted wall/photos/groups and group-management proof. The test performs at most one getWallUploadServer and one multipart file upload; no saveWallPhoto or wall.post. Unknown outcome is consumed and never retried automatically. Old markers remain unchanged. Return closed status/HTTP enums only, with no provider echo or signed URL.

The specific root cause investigation compares this exact transport with the prior signed-URL-only relay and curl evidence. It must not assume HTTP405 is fixed by the hostname repair.

## Alternatives

1. Resume the existing VK ID rotating-grant route only after the owner's application actually receives wall/photos access. No evidence currently establishes that availability; setting env values alone does not resolve it.
2. Import/store a Mini App token as a background credential now. Rejected for this step: lifetime, permitted server use and renewal have not been established. Do not label it permanent or enable the worker on that assumption.

## Conditions after feasibility

Only a valid upload receipt establishes upload success. Saving and publishing require a new counted provider authorization. Background release additionally requires verified token lifetime/renewal or an explicitly accepted finite reconnect contract, safe encrypted per-account storage, agent ownership/consent and denial tests, appropriate web/worker configuration and separate release gates.

## Gates

Owner must explicitly approve changing the prior invariant that the VK token never leaves the Mini App. Source implementation and offline tests follow that decision. Each exact build/deploy and the counted real user-token transfer/upload remain separate reviewable operations. No settings or secret values are changed by preparing this design.
