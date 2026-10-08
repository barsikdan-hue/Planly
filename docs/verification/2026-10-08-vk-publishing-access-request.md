# VK publishing access request — Owner review draft

Date: 2026-10-08. **NOT SENT.** Owner approved preparing this request and safe callback diagnostics. Sending it, changing VK/Render settings, merging, deploying and live publications remain separate gates.

Proposed recipient: `devsupport@corp.vk.com`, the channel supplied in the Owner's official-documentation evidence. Confirm the current support process before sending; the current approval policy was not fully independently retrievable during the audit.

## Draft message

Subject: Planly — publishing permissions for VK ID Web application 54809575

Здравствуйте!

Просим подтвердить поддерживаемый способ публикации текста и фотографий в сообщество из нашего приложения Planly и процедуру получения необходимых доступов.

- VK ID application: **54809575**, Web, Confidential.
- Base domain: `planly-m4zq.onrender.com`.
- Registered redirect: `https://planly-m4zq.onrender.com/api/social-accounts/vk/callback`.
- Intended community: **242095689**. Приложение проверяет права редактора или администратора авторизованного пользователя до подключения сообщества.
- Authorization: server-side authorization code with PKCE S256, state and device_id; VK ID access/refresh tokens. App service credential and IP allowlist are configured privately. Credentials are never included in this request.
- Use case: явная публикация и отложенная публикация подготовленного пользователем текста, JPEG/PNG и текста с фотографиями. Видео не входит в текущий объём.

Просим уточнить:

1. Доступны ли новому VK ID Web Confidential приложению scopes `wall` и `photos`? Требуется ли отдельное одобрение, верификация бизнес-профиля или иной тип приложения?
2. Может ли access token этого VK ID flow вызывать `wall.post`, `photos.getWallUploadServer` и `photos.saveWallPhoto` для указанного сообщества? Подтвердите точные scopes и method-level ограничения для каждого вызова.
3. Какие права нужны для `groups.getById` с полями `is_admin,admin_level` либо для поддерживаемого эквивалента проверки полномочий пользователя?
4. Если доступ ограничен, просим сообщить процедуру и требования для его предоставления приложению **54809575**. Если этот flow не поддерживает публикацию, какой официальный способ авторизации следует использовать?
5. Подтвердите применимую API version, выдачу permissions в поле `scope` при code exchange и refresh, а также правила обновления/ротации tokens.

Сейчас после согласия пользователя VK ID возвращает его в Planly, но подключение не завершается. Фактическая первая стадия production-отказа ещё не установлена. Код требует явного grant `wall` и `photos`; синтетические ответы с базовыми scopes отвергаются до проверки сообщества и сохранения credentials. Мы не считаем успешный вход доказательством права на публикацию.

При необходимости предоставим только безопасные сведения: стадия отказа, нормализованная категория ошибки, время попытки и идентификатор приложения. Токены, authorization code, state, device_id, service credential и сырые ответы в переписку не передаём.

Спасибо!

## Acceptance after provider response

Owner reviews the provider's exact eligibility/permission contract before choosing any authorization change. An approved supported grant must still pass actual community validation. Account CONNECTED is not live publishing acceptance; a separately authorized minimal text/photo smoke is required after approved delivery. Do not bypass scope checks, substitute a service token for a publishing user token, or switch to legacy OAuth without a verified supported contract.
