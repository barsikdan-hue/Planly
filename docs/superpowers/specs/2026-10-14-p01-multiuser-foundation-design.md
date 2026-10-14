# P01 — отдельные кабинеты и безопасная основа авторизации

Статус: **APPROVED FOR P01-A IMPLEMENTATION**, 14.10.2026. Пользователь явно согласовал спецификацию и пакет invite/recovery/admin/media решений в этом чате. Основание: [Issue #54](https://github.com/barsikdan-hue/Planly/issues/54), текущий код `ce46b4a0a5791eb6da75834dce4d7ecc95361938`. [Аудит и доказательства](../../verification/2026-10-14-p01-audit.md).

## Цель и границы

Расширить существующий Planly до 100 личных кабинетов, сохранив текущего владельца и его данные. В каждом кабинете сервер определяет пользователя по сессии; клиент не выбирает owner/userId. ADMIN не получает обход проверок личных ресурсов. Общая библиотека, собственные подключения, согласованная автопубликация и onboarding остаются следующими отдельными срезами.

P01 в Issue #54 — inspect/spec; основа отдельных пользователей названа P02. Здесь первый реализационный PR готовится как **P01-A: защита связей кабинета**, до расширения login. Это необходимая предпосылка P02, а не заявление о готовом многопользовательском продукте.

## Согласованные продуктовые решения — один пакет

1. **Invite-only:** публичной регистрации нет; ADMIN разрешает доступ конкретному email. Приглашение одноразовое, ограничено по времени, хранится как hash, активация атомарна. Публичные signup/OAuth flows не добавляются первым PR.
2. **Recovery:** ADMIN инициирует одноразовый сброс после проверки личности вне Planly; пользователь сам задаёт пароль. ADMIN не видит пароль. Нет email-провайдера в первом срезе. После сброса отзываются все сессии этого пользователя; logout отзывает только текущую сессию и не отменяет согласованные публикации.
3. **Admin visibility:** список пользователей и состояния доступа плюс агрегированное состояние сервиса. Без чужих текстов, медиа, токенов, каналов, индивидуальных provider statuses и аналитики. Возможность индивидуальной диагностики потребует отдельного решения.

Согласованная граница безопасности: существующие private signed media URLs — bearer-доступ на 300 секунд. Срок сохраняется; logout/revoke запрещает выдачу новых URL, но уже выданный URL живёт до истечения. Немедленный отзыв потребует отдельной схемы доставки медиа.

## Архитектура после согласования

Использовать PostgreSQL/Drizzle и существующие scrypt, opaque sessions, owner-scoped repositories, Post/PostTarget/publications и scheduler. Новый auth-фреймворк, БД, vault и инфраструктура не нужны.

В отдельном auth PR добавить роли ADMIN/USER, состояние доступа, индивидуальный password hash и ревокацию. Точный текущий owner определяется по настроенному OWNER_EMAIL; сохраняются его id, все FK, media keys, receipts и idempotency. Текущий env password hash остаётся источником его входа. Остальные существующие users не становятся активными или ADMIN автоматически. Изменения схемы только additive; миграция на production отдельно gated. Возобновление доступа не восстанавливает отозванные сессии.

Все API/SSR проверяют активную сессию; private responses используют no-store. Мутации защищаются от cross-origin запросов. Жизненный цикл request/session, блокировки пользователя, enqueue и provider handoff нужно проверить транзакционными race-тестами до открытия реальных кабинетов. Блокировка доступа должна останавливать будущие handoffs; уже начатая отправка сохраняет receipt/AMBIGUOUS_DELIVERY без повторной отправки. Logout сам по себе не останавливает автоматизацию.

При расширении auth подключения новых USER к текущим общим TG/MAX credentials и VK OAuth остаются закрыты server-side до отдельного self-service security/capability среза. Пустой кабинет допустим; использование credentials владельца по умолчанию недопустимо.

## Первый небольшой PR — P01-A

**Одна проблема:** защита межпользовательских связей при чтении и отправке. Текущая auth, UI и schema остаются прежними в этом PR.

- `scheduler/processor.ts`: до claim и до storage/connector handoff проверять совпадение владельцев publication/post/account, связь target.postId с post, соответствие provider и владельцев всех вложенных media. Некорректная связь не приводит к частичной отправке или чтению чужого объекта.
- Обрабатывать такой отказ безопасно, без изменения чужого account. Не использовать AUTH failure, который сейчас меняет connectionStatus. Сохранять terminal receipts, PUBLISHING uncertainty и существующую защиту от blind retries; не очищать повреждённые production данные.
- PUBLISHED/CANCELLED/FAILED/REQUIRES_RECONNECT остаются неизменными даже при повреждённом графе; существующий на входе PUBLISHING сохраняет обработку AMBIGUOUS_DELIVERY. Новый integrity failure применяется к SCHEDULED/QUEUED на входе либо к собственной свежей claim при второй проверке. Отдельные regression cases совмещают повреждённый граф с terminal/PUBLISHING.
- `posts.ts::readOwnedPost`: не возвращать foreign media IDs даже при некорректной сохранённой связи. Сохранить порядок корректных медиа и текущие DTO.
- Тесты: A/B-графы с каждым несовпадением owner/post/target/provider/media; spies storage/connector = 0; чужие данные неизменны; корректная публикация работает; A/B signing и scheduler user filter; duplicate/concurrent/AMBIGUOUS_DELIVERY regressions сохраняются.

План исполнения после утверждения: воспроизведение RED на isolated native PostgreSQL → минимальный GREEN → targeted/full native tests, typecheck/lint/build → independent read-only Critic → desktop/mobile fixture E2E → Draft PR и exact-head CI/Self-host → Owner merge gate. Не отправлять реальный контент.

Следующий auth PR опирается на принятый P01-A: две действительные fixture-сессии A/B, полный route-level IDOR matrix, login/logout/revoke/reload и races. Приглашение/восстановление и минимальный ADMIN экран вводятся последующими отдельными PR; self-service TG/MAX, общая Library opt-in и scheduling не смешиваются с auth.

## Release gates и приёмка

Первый PR готов к review только при доказанных deny-сценариях и зелёных native CI/Self-host на его HEAD. Multiuser acceptance отдельно требует двух реальных кабинетов и разрешённого deployed browser/live E2E. `PR_READY` не означает `PRODUCTION_ACCEPTED` или доказанную нагрузку 100 пользователей.

Merge, deploy, production DB, secrets, infrastructure, provider sends и новые security/product решения требуют отдельного human gate. Без платной БД; подготовка сохранения данных по PR #50 остаётся отдельной задачей, backup/restore пока UNVERIFIED. Согласование этой спецификации разрешает writing-plans/TDD для P01-A, но не production операции.
