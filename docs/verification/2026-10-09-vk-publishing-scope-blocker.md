# VK publishing scopes: proven app configuration blocker

Date: 2026-10-09. Scope: Phase 7A investigation only; HOLD/INVESTIGATION is preserved. No runtime fix, OAuth, provider publication, setting/env change, merge or deployment.

## Authority and evidence provenance

GitHub main was independently verified as `da9a2e89cc37119e87952ac56fcf86a1383de3f7`. The clean `work/Planly-library-idempotency` checkout at `c6f6fc215544d1b8cc0d06fd021878bcd0eca0c1` has an identical tree. GitHub authenticated identity: `barsikdan-hue`.

The Owner supplied new live read-only evidence from the correct VK ID Business cabinet: application 54809575, Planly, Web, enabled, confidential, business verification complete; base domain `planly-m4zq.onrender.com`; callback `https://planly-m4zq.onrender.com/api/social-accounts/vk/callback`; service credential and secret present; Render egress ranges present in IP restrictions. Values were not supplied or exposed. The Access tab does not offer/configure `wall` or `photos`. This report records Owner-supplied cabinet evidence; the agent did not independently reopen the restricted cabinet.

APP_IDENTITY_MISMATCH: REJECTED on the new correct-cabinet evidence. The separate VK Developers Mini App 54809413 is not a replacement target.

## Two separate findings

**PUBLISHING_SCOPE_BLOCKER: PROVEN.** Current app Access configuration lacks the two publishing permissions required by Planly. `lib/server/vk/oauth.ts:52` requests `scope=wall photos`; `parseVkGrant` at lines 10-16 rejects a grant lacking either permission before community validation/persistence. This establishes the configuration/prerequisite blocker, not an observed grant-parser failure. Scope checks remain intact.

**HISTORICAL_INVALID_GRANT_ROOT_CAUSE: NOT PROVEN.** The last recorded event in [VK HOLD report](2026-10-08-vk-hold-phase8-discovery.md) is AUTH / TOKEN_EXCHANGE / INVALID_GRANT / OTHER_INVALID_GRANT at 2026-10-08T12:32:59Z, HTTP 200, description PRESENT with SERVICE_TOKEN mention. No raw description was retained. Missing publishing configuration does not establish why VK rejected that exchange. No new attempt was run. A lexical service-token mention is not causal proof.

## Minimum method contract

Current connector uses API 5.199: `lib/server/connectors/vk.ts:62-74` validates community identity and user editor/admin authority; lines 109-150 implement the wall-photo pipeline and publication.

| Method | Required access / token type in current official sources | Current app has it |
| --- | --- | --- |
| groups.getById | User, group or service token. Some returned fields require groups; current Planly needs user is_admin/admin_level, so exact field-access eligibility needs provider confirmation. | UNKNOWN for the required user-authority response; no live call/grant accepted. |
| wall.post | User token; wall permission, individual approval. | NO: wall is absent from current Access configuration. |
| photos.getWallUploadServer | User token; photos permission, individual approval. | NO: photos is absent. |
| photos.saveWallPhoto | User token; its method page lists no separate scope. The existing complete upload/save flow and Planly grant contract require photos. | NO for the current photos prerequisite; standalone method rejection has not been observed. |

Official method pages, retrieved directly over HTTPS with HTTP 200 on 2026-10-09:
- [groups.getById](https://dev.vk.com/ru/method/groups.getById)
- [wall.post](https://dev.vk.com/ru/method/wall.post)
- [photos.getWallUploadServer](https://dev.vk.com/ru/method/photos.getWallUploadServer)
- [photos.saveWallPhoto](https://dev.vk.com/ru/method/photos.saveWallPhoto)

The current published [VKCOM schema](https://github.com/VKCOM/vk-api-schema/tree/333481bd082ad747d4873ef4a77f9247097eeef0), version 5.199, master commit 333481bd082ad747d4873ef4a77f9247097eeef0 dated 2025-04-14, was independently retrieved. It lists user/group/service for groups.getById and user only for the three publishing/photo methods. Method documentation remains primary for permission requirements; the schema does not prove app-specific eligibility.

## Public provider policy and minimum official route

[VK API access rights](https://dev.vk.com/ru/reference/access-rights) states that some extended rights may be granted to VK ID applications after individual agreement through `devsupport@corp.vk.com`. Both wall.post and photos.getWallUploadServer direct applicants to that channel for exceptional access. [VK ID user-information documentation](https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/work-with-user-info/user-info) likewise distinguishes extended API permissions from business verification.

The minimum currently documented route is an application-specific request to VK support for wall/photos approval or its official procedure. Business verification alone does not demonstrate these permissions. Approval is not guaranteed.

**PROVIDER_POLICY_NOT_PUBLICLY_CONFIRMED:** no official public statement of a general suspension, permanent refusal of Wall/Photos for all new apps, or a different supported server-side text-and-photo publishing flow was found in the checked official documents and focused official-domain searches. This is a bounded finding, not proof that no such policy exists.

[Issue 242](https://github.com/VKCOM/vk-api-schema/issues/242) contains third-party reports of community-token text publication, photo-upload error 27, and support difficulties. Comments on an official repository are not official policy. The saveWallPhoto failure is presumed in the issue, not a measured result. No community-token experiment, architecture or implementation was started.

## Support request — NOT SENT

Recipient proposed by current official documentation: devsupport@corp.vk.com.

Subject: Planly, VK ID Web 54809575 — запрос доступов wall/photos

Здравствуйте!

Planly — личный SMM-планировщик. Наше приложение VK ID 54809575 (Planly, платформа Web) включено и является конфиденциальным; верификация бизнес-профиля завершена.

Базовый домен: planly-m4zq.onrender.com.
Доверенный callback: https://planly-m4zq.onrender.com/api/social-accounts/vk/callback.

Нужна серверная публикация подготовленного пользователем текста и фотографий только в собственное/администрируемое сообщество 242095689. Используем Authorization Code Flow с PKCE и серверным хранением зашифрованных пользовательских credentials. Требуемые методы: wall.post, photos.getWallUploadServer, photos.saveWallPhoto и groups.getById для проверки прав пользователя на сообщество.

В разделе «Доступы» приложения сейчас нет возможности выбрать Wall/Photos (wall/photos).

Просим уточнить:
1. Можно ли сейчас предоставить приложению 54809575 расширенные доступы Wall и Photos?
2. Если да, просим одобрить/включить их либо указать официальную процедуру и требования. Также просим уточнить права для groups.getById с is_admin/admin_level.
3. Если нет, какой официально поддерживаемый тип токена и flow авторизации следует использовать серверному приложению в 2026 году для публикации текста и фотографий в своё VK-сообщество?

Спасибо!

No credential values, authorization data or raw provider responses are included. Sending this draft requires explicit Owner authorization and has not occurred.

## Conditional paths after an official response — no implementation authorization

A. WALL_PHOTOS_APPROVED: retain current VK ID architecture; verify configured access and explicit grant scopes in one separately approved fresh OAuth; then separately approved bounded text smoke, followed by photo smoke. CONNECTED alone is not publishing proof.

B. VK_OFFICIALLY_REFUSES_EXTENDED_SCOPES: record the provider's exact application-specific refusal. Current VK ID publishing architecture is blocked to that documented extent. Separately evaluate community-token text-only capability after Owner decision; photos remain a separate problem. Do not generalize an app-specific refusal into a universal policy.

C. VK_PROVIDES_DIFFERENT_SUPPORTED_FLOW: inspect the actual official contract and prepare the smallest migration design before changing code, env or settings.

## Verification and stop

Current source/scopes and method call sites were inspected; current official method/access documents and pinned schema were freshly retrieved. No runtime/test assertions were altered. Report-only change: runtime tests/typecheck/build were not rerun locally. Canonical PR CI status must be recorded separately from provider readiness.

CODE_CHANGED: NONE. ENV_CHANGED: NONE. VK_SETTINGS_CHANGED: NONE. PROVIDER_MUTATIONS: 0. NEW_OAUTH/TOKEN_EXCHANGE/VK_API_PROBES: 0. SUPPORT_SENT: NO. ROADMAP/AGENTS/HISTORICAL_REPORTS_CHANGED: NO. No merge/deploy.

Stop at the provider-response/Owner gate. Next action: Owner reviews the draft and decides whether to send the application-specific request. Keep Phase 7A HOLD/INVESTIGATION; do not remove scopes, claim the historical invalid_grant fixed, or begin a fallback automatically.
