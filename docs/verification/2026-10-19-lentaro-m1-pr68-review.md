# M1 A — независимый source review PR #68

Дата: 19.10.2026. Роль: независимый read-only reviewer. Основание: согласованный Lentaro Working Version Contract v2, задача A. Применён workflow `superpowers:requesting-code-review` в роли назначенного reviewer.

**Вердикт: PASS в указанном source scope. Подтверждённых actionable P0/P1/P2 findings не обнаружено.** Это не merge approval, deployment approval или приёмка M1 целиком.

## Exact tree и сохранность

- Repo: `barsikdan-hue/Planly`; checkout: `work/Planly-p04b1-batch-consent`.
- Branch: `codex/p04b1-library-batch-consent`.
- Base: `da7ad737a3236f1c161ae46c519386e05869f47a`.
- Reviewed HEAD: `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`.
- HEAD проверен до и после review. Git status оба раза: только существующие untracked `P04-B1-FIX01-review.md` и `P04-B1-FIX01-review.patch`; они не изменялись.
- Product files, index, branch, refs, DB, runtime и провайдеры не изменялись. Единственный созданный reviewer artifact — этот файл вне source checkout. Исторический audit snapshot не менялся.

## Scope и проверенный causal path

Рассмотрен полный base→HEAD production delta, включая FIX01, а не только его recovery patch. Прочитаны новые route exports, HTTP/server/contracts/hashes/proof/recovery/UI, интеграция App/ContentLibrary, helper extraction из createPost, schema/migration, связанные tests/fixtures/CI и dated design/verification. Для risky edges прочитаны существующие Library/media ownership paths, owner schedule lock/slot occupancy, publication reconciliation и verified connection authorization/lifecycle. MP4 fixture не декодировался заново; его decoded browser evidence остаётся ранее предоставленным.

| Граница | Результат source review |
| --- | --- |
| Session/lifecycle | Owner берётся из session token; user lock предшествует отдельному повторному session lookup/lock. ACTIVE/authInitialized/sessionVersion/expiry проверяются после ожиданий и перед завершением callback. Fresh USER/not configured OWNER проверка отделена от исторического recovery. |
| Ownership | Source/media/account выборки scoped по owner; foreign media и foreign linked Post отклоняются до projection/signing. Historical GET ищет receipt по `(userId, operationId)` и проверяет owned result posts. ADMIN не получает private colleague access. |
| Consent | Строгий canonical intent фиксирует порядок sources, content/revision, destination и время. HMAC preview привязан к owner/request/snapshot и ограничен 10 минутами. Commit проверяет текущие state/content/binding/slots; replacement allocator не вызывается. |
| Atomic admission | Все Post/target/media/publication/USED/receipt записи находятся в одной транзакции. Созданный graph проверяется до receipt/commit, binding pointer соответствует принятому account/destination. Queue mirror выполняется после commit. |
| Legacy paths | `insertPostRelations` переносит только прежний блок target/media inserts. Parent createPost, source/creationKey replay, validation, Swipe receipt, reconcile и queue boundaries сохранены. |
| Replay/410 | Сохранённый intent/receipt проверяется до fresh admission. Тот же intent возвращает прежние IDs; изменённый конфликтует. Отсутствующий owned result даёт terminal 410 без recreation. Source/binding/role drift не превращает replay в новое создание. |
| Client uncertainty | Exact intent/key сохраняется до POST. Каждая попытка имеет собственную локальную запись; поздний rollback удаляет только её. 401/404/503/loss/invalid не считаются доказательством общего rollback. Matching durable receipt подтверждает исходную операцию. Owner generation fences защищают async callbacks. |
| FIX01 | Terminal tombstones сохраняются и не запрещают независимый новый batch. Старый terminal intent не отправляется снова. Unknown/corrupt/conflicting history остаётся fail closed; terminal count/unique IDs/hash проверяются. |
| Scheduler/cancel | Новый scheduler/provider transport не добавлен. Существующие publications/BullMQ identity/reconciliation и USER binding handoff остаются authoritative. Preclaim whole-Post cancellation boundary не расширен; AUTH/AMBIGUOUS не превращаются в blind retry. |
| Tests | Прочитаны causal cases для native lock waits/logout/revoke/block/expiry, concurrent operation/source/slot, real lost COMMIT acknowledgement, mirror/Redis loss, worker restart, claim/cancel, cross-owner/media denies, strict HTTP rollback projection, two-tab attempt ordering, reload/410 и mobile widths. Checks/assertions не заменены ослабленной acceptance. |

## Миграция и проверки этой review-сессии

- `0015_curvy_blockbuster.sql` — additive создание `library_batch_consent_operations`; PK `(user_id, operation_id)`, hash checks, единственный FK на user. Result/source IDs сохраняются в JSON и не теряются при cascade удаления результата.
- Выполнено read-only структурное сравнение snapshot 0014→0015: изменён только `tables.public.library_batch_consent_operations`; `0015.prevId` точно равен `0014.id` (`d784e6fb-b576-453f-b0b2-ef1494ccb8b1`). Journal добавляет idx15/tag0015 после0014.
- `git diff --check da7ad737..HEAD`: exit0.
- Тесты, build, migration rehearsal и runtime повторно не запускались. Причин повторять неизменившийся full suite в рамках этого review не обнаружено.

Предоставленное current-tree CI evidence сохранено в своём scope: CI `39214004728` — 1648 native PASS, 134 browser PASS/4 configured SKIP, typecheck/lint/build и compiled HTTP smokes SUCCESS; Self-host `39214004720` SUCCESS, live Telegram SKIPPED. Эти результаты взяты из текущего audit/контракта, а не повторно проверены reviewer через GitHub. CI checkout — synthetic merge `3453b6544a68a9e4e91fae58bae93dfca5ac4ae7` = reviewed source + указанная base; это не merge в main.

Исторический teardown timeout остаётся **ROOT_CAUSE_NOT_PROVEN / NO FIX**. Green CI не доказывает его устранение; review не предлагает speculative cleanup, retries или timeout changes.

## Что M1 B/C обязаны сохранить при reuse

1. B1 fresh admission намеренно ограничен USER и личными READY/unlinked sources. ADMIN/configured OWNER исключены из-за существующего legacy nullable-binding capture. Нельзя просто снять guard или подать shared original ID в B1. Рабочий owner flow и новый direct shared flow требуют явно согласованного контракта, сохраняющего текущий owner publishing path и strict USER binding checks.
2. Общий оригинал/ревизия и личное намерение должны иметь durable provenance к личному copy/result. Отдельные copy и scheduling receipts нельзя связать только двумя последовательными browser POST. Lost response/concurrent retry должны найти прежний результат, сохраняя `(user, shared revision, intent)` область дедупликации.
3. Новый per-card consent не должен менять historical `LIBRARY_BATCH_FUTURE` intent/receipt/hash semantics. Его own retry не означает новый осознанный повтор. Deleted outcome сохраняется как terminal история.
4. Отказ/пропуск относятся к пользователю; shared originals и чужие решения неизменны. Изменение/снятие оригинала не переписывает уже согласованный личный Post/media.
5. Показанные сеть/destination/slot проверяются сервером; отсутствие слота/сети не становится publish-now. Сохраняются lifecycle/ownership перед admission и handoff, independent per-network outcomes, cancellation и AMBIGUOUS fences.

**Disposition:** #68 пригоден как source foundation для M1 в пределах его существующего B1-контракта. M1 direct shared feed, owner/colleague user journey и дальнейший итоговый cross-flow review этим PASS не закрыты. Merge/deploy/persistent migrations/provider operations остаются отдельными gates. A1/off-VM restore состояние проверяет основной исполнитель отдельно; этот source review его не сертифицирует.
