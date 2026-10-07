# Phase 7A VK — private Owner setup gate

Implementation fixtures are not proof of real VK app approval or publishing authority. Production still runs accepted CR06; no VK merge, deploy or live post is authorized by this document.

## READY_FOR_OWNER_SECRET_GATE — VK

1. In the official [VK ID developer portal](https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/create-application), create/select the Planly application and configure its web/backend confidential flow. Keep its static service credential private. Use the existing Render service; do not create a vault or another service.
2. Obtain explicit app approval for `wall` and `photos`. New VK ID apps may require the official extended-permissions process via `devsupport@corp.vk.com`; seeing names in an SDK is not evidence that this app has them. Do not substitute legacy OAuth or claim readiness until the real grant confirms both scopes. Configure the existing Render outbound IP addresses in the confidential app's allowlist as required by VK ID.
3. Register exactly `https://planly-m4zq.onrender.com/api/social-accounts/vk/callback` as the redirect URL. The backend uses the same fixed URI for PKCE authorization and exchange.
4. Choose one intended VK community, preferably a dedicated acceptance community. The VK user must be its administrator or editor with posting authority. Enter its positive numeric community ID in Planly Settings; the server validates the matching community before enabling the account. Video is excluded.
5. Fill these names privately in the existing Render service's server environment at the separately authorized configuration/deployment gate:

| Env name | Private value / purpose |
|---|---|
| `VK_CLIENT_ID` | Numeric VK ID application ID |
| `VK_SERVICE_TOKEN` | Static confidential app service credential from VK ID |
| `VK_REDIRECT_URI` | Exact callback URL above |
| `VK_CREDENTIAL_ENCRYPTION_KEY` | Canonical base64 of 32 cryptographically random bytes; generate/store privately, never paste into chat |
| `VK_CREDENTIAL_KEY_VERSION` | `1` for initial setup |

Telegram/MAX environment credentials are unchanged. Access/refresh tokens are obtained only by the server during VK ID exchange and stored encrypted; the Owner never pastes them into Planly or chat. Do not replace an existing encryption key casually: old envelopes fail closed and require reconnect.

Once the appropriate Owner merge/deploy/configuration approvals exist, connect through VK ID in Settings. A successful app grant and community validation establish account readiness; only a separately authorized minimal live publication establishes provider acceptance. No provider send occurs automatically from setup instructions.

## Researched contract and limits

Official sources and exact researched schema/SDK revisions are recorded in the [contract research](2026-10-07-phase7a-vk-contract.md). The approved [OAuth/security contract](../superpowers/specs/2026-10-07-vk-oauth-design.md) supersedes that report's historical architecture stop. API 5.199 is the pinned implementation baseline, not a claim of the latest provider version. Planly accepts VK text and ordered JPEG/PNG photos under conservative application limits; real upload-host eligibility and permissions still require acceptance proof.
