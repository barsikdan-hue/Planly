# Swipe Planner 2.0 — предложение дизайна для review

Дата: 2026-10-12. STATUS: DESIGN_REVIEW_REQUIRED. Это предложение, не завершённая реализация и не разрешение на выпуск.

## Назначение и границы

Главный механизм ручного отбора существующих заготовок: «Не нравится», «Позже», «В календарь». Каждое действие явно выполняет владелец. Никаких автоматически созданных тестовых материалов, AI, provider sends, платных ресурсов, изменений Render/env или production-данных. Новая продуктовая фаза не вводится; работа расширяет текущие Phase 6 и Phase 9. Незавершённая очистка production остаётся отдельной задачей.

## Проверенные источники

- Репозиторий origin https://github.com/barsikdan-hue/Planly.git. GitHub main: 30374c8dbc6d137da2d393d42bdee5389f34564e.
- Inspect checkout: work/Planly-harness-devex, codex/swipe-review-full-text, HEAD 062c3fe4e89289f4afcdc631e3a4a2b907ebcae7, clean. Реализация должна начинаться в отдельной чистой ветке от проверенного main, а не поверх исторической ветки PR40.
- AGENTS.md main прочитан через GitHub; локальные ROADMAP.md, Harness routing, Swipe, Dashboard, client pending creation, server Post creation/Library archive, schema и E2E fixture исследованы. Перед реализацией сверить diff всех затрагиваемых файлов с main.
- CI main: https://github.com/barsikdan-hue/Planly/actions/runs/38255106334 — SUCCESS. Self-host: https://github.com/barsikdan-hue/Planly/actions/runs/38255106364 — SUCCESS. Это baseline, а не проверка будущих изменений.
- Открытые PR37 (VK docs) и PR38 (audit docs) не относятся к этому milestone и не изменяются.
- CODE: Swipe по умолчанию mode=draft, доступен только content+reviewing. Pointer handlers распознают окончательный жест, но нет отображаемого drag/наклона/состояния выхода. Полный текст уже имеет локальное CSS-переопределение PR40; его regression сохраняется.
- CODE: submitSwipeApproval использует owner-scoped durable pending creation; createPost держит owner/source locks, проверяет stale source и свободный слот, сохраняет Post/targets/media/publications/USED в транзакции. archiveLibraryItem проверяет revision и READY, но не сохраняет feedback или durable replay receipt.
- CODE: shouldProcessImmediately допускает время до now+10 секунд; обычный POST /api/posts затем вызывает runDuePublications. «Любое будущее время» нельзя считать защитой Swipe от immediate send. Пока это установленный execution path; RED-сценарий предстоит выполнить на фикстурах.

## A. Вход и возвращение

На главной отдельная заметная карточка с кнопкой «Разобрать заготовки · N». N — ровно READY без sourcePostId, по текущему owner snapshot. Review заменяет основную область главной, а не переводит незаметно в библиотеку. «Назад на главную» возвращает туда же. Вход из библиотеки сохраняется с возвратом в библиотеку. Смена владельца завершает текущий review и очищает его настройки/временные состояния.

При N=0: «Пока нет готовых заготовок» и «Добавить заготовку», открывающая существующий редактор библиотеки без сохранения или генерации. После сохранения материал становится доступен обычным штатным способом.

## B. Карточка и движения

Рекомендуется CSS + Pointer Events: использовать существующие обработчики и небольшой выделенный hook состояния жеста. Motion for React рассмотрен как альтернатива с готовой физикой, но новая зависимость не нужна для одной карточки. Пересмотр выбора допустим только при воспроизводимой проблеме нативного подхода.

Состояния: idle → dragging → submitting → confirmed exit → next. Недостаточный горизонтальный жест: spring-back без API. Вертикальный жест: отмена drag, нативный scroll. Ошибка API: карточка возвращается в idle с причиной, счётчики и feedback не меняются. Неизвестный результат: отдельное pending/recovery состояние, карточка остаётся, нового UUID или автоматического запроса нет. Только явное восстановление того же намерения.

Рекомендуемые параметры для тестируемого первого варианта: direction-lock после 12px; решение при abs(dx) >= 80px и abs(dx) > abs(dy); наклон ограничен ±8°; возврат CSS easing 220ms, подтверждённый выход 180ms, вход следующей карточки 160ms. Эти числа — проектные решения, не уже проверенные параметры.

touch-action: pan-y pinch-zoom; захват pointer после горизонтального direction-lock. pointercancel/lostpointercapture возвращают карточку, не отправляя решение. Кнопки, input, ссылки, video/audio и текстовое выделение исключаются из drag. Фото/видео, воспроизведение, редактор и вертикальный scroll полного текста сохраняются. Решение по кнопке и ArrowLeft/ArrowRight использует тот же lock и action path; «Позже» доступно кнопкой, дополнительная клавиша Space только при фокусе самой карточки. ArrowUp/Down не перехватываются. После перехода фокус доступно переносится на новую карточку; при ошибке остаётся на исходной. prefers-reduced-motion убирает наклон и движения, но не меняет бизнес-события и порядок серверного подтверждения.

## C. Настройка и слот

Перед первой карточкой явный компактный экран настройки: включённые CONNECTED соцсети, расписание, горизонт 7/30 дней, кнопка «Начать разбор». Сети не выбираются автоматически. По умолчанию после настройки — «Следующий свободный слот». Настройки существуют в текущей сессии review, без скрытой смены аккаунтов или постоянных профилей расписания.

На каждой карточке явно видны сети и будущая дата/время МСК. «Изменить расписание» возвращает к настройке. Ручное время остаётся дополнительным выбором будущего слота; черновик не является вариантом правого свайпа в новом flow. При отсутствии сети/слота, stale preview или приближении времени к настоящему правый жест возвращается без mutation и показывает причину. «Не нравится» и «Позже» доступны, даже если календарь недоступен, если нет неразрешённого предыдущего решения.

Для Swipe установить server-side marker с обязательным source Library и immutable UUID intent. Новый Swipe approval требует source revision, только будущий scheduled READY, одинаковое время независимых targets и atomic free-slot/account checks. Обычные Composer API semantics не менять. Для Swipe POST запрещён inline runDuePublications; mirror queue запускается только после commit по текущей штатной логике. Минимальное время Swipe — не раньше серверного now+60 секунд, preview ищет слот после этого cutoff. Если слот устарел между preview и commit, ответ 409, нового слота без подтверждения владельца не выбирать. Никаких provider connector или Scheduler redesign изменений.

## D. Feedback: предлагаемая семантика

Предлагается одна актуальная оценка на owner + LibraryItem, а не неограниченное накопление одинаковых голосов. Повтор того же UUID возвращает сохранённый receipt. Если владелец явно возвращает заготовку из архива и разбирает заново, новое подтверждённое решение может заменить предыдущую оценку; агрегат учитывает только последнюю. История подтверждённых намерений сохраняет происхождение и позволяет объяснить замену. SKIP не отправляет feedback, вес 0 и не увеличивает DISLIKE.

Хранение в существующем PostgreSQL: owner-scoped current feedback + durable decision receipts. Один owner+operation UUID уникален, canonical request hash обнаруживает изменённый payload при повторе. Под source row lock LIKE/создание ровно одного scheduled Post/USED/receipt/feedback — один commit; DISLIKE/archive/receipt/feedback — один commit. Никакого последующего независимого POST feedback после успешного Post: это создало бы окно частичного сохранения. Случай, когда обычный editor уже создал Post из источника, не выдаётся за новое Swipe LIKE; нужны typed conflict и штатный refresh. Recovery не меняет payload, слот или UUID. Concurrent LIKE/DISLIKE: побеждает один commit, второй получает stale/conflict, не голос.

Безопасные данные: source Library ID, source version/content fingerprint, длина текста, media types/count, decision, confirmedAt, origin=swipe-planner, input method (gesture/button/keyboard), operation ID, linked Post ID, выбранные providers и scheduledAt для LIKE. Не хранить токены, account credentials, signed media URLs, provider logs или полный текст в feedback. Полные исходные тексты не включаются в экспорт этой минимальной версии. Тематические метки отсутствуют, поэтому aggregate — likes/dislikes/total/доля LIKE; при total=0 доля null, не 0 и не вывод о тематике.

Приватный export GET из нового owner-authenticated endpoint: versioned JSON с актуальными оценками, provenance и агрегатом; download вручную, Cache-Control: private, no-store. Никакой передачи в Codex/третьим лицам автоматически и никаких реальных export JSON в Git. Owner ID из auth; параметр выбора другого owner запрещён. Query/export использует согласованный read snapshot. Смена владельца и поздний ответ A после входа B не могут применить состояние A или инициировать его download.

## Самостоятельные PR и границы

1. **UI/motion**: вход Dashboard, возврат, empty state/editor, card motion, reduced-motion и accessibility. Существующие бизнес-операции сохранены. До slot-flow этапа подпись положительного действия соответствует существующему режиму: нельзя называть создание DRAFT «В календарь». Это промежуточный шаг, не полная продуктовая приемка 2.0.
2. **Slot flow**: явная настройка, default next slot, МСК на карточке, отключение draft approval в Swipe, server cutoff и запрет inline immediate tick только для Swipe, immutable recovery и конфликты. Работает на текущих штатных Library/Post paths; не зависит от наличия feedback migration.
3. **Preferences/export**: атомарное хранение решений вместе с existing Post/archive transactions, replay receipts, owner isolation, summary/export. Может тестироваться и ревьюиться отдельно от анимаций; обновляет те же обработчики осмысленно, без общего refactor.

PR отдельные, каждый с собственным diff, regression и CI. При пересечении интеграционных строк явно указывать зависимость/обновлять базу после разрешённого owner merge; не выдавать stacked CI за независимый main CI. Не считать промежуточный PR выполнением всей Definition of Done. ROADMAP обновлять по факту каждого PR, без новой фазы и без ложного PRODUCTION ACCEPTED. Merge/deploy и применение migration в production требуют отдельного Owner Gate.

## Проверки и Tool Routing

Файловые/Git инструменты: authority, exact SHA/diff, существующие contract/locks и CLI проверки. GitHub connector: PR/checks/jobs фактического SHA, draft PR и attach; gh отсутствует в PATH, это не отсутствие доступа к GitHub. Shell tests: RED/GREEN, pnpm test/typecheck/lint/build, serial isolated DB tests; никогда production DB/env. Playwright Test: существующий loopback fixture 127.0.0.1:4318, envDir=false, provider requests запрещены; desktop 1366×768, mobile 390×844 и reduced-motion. Browser tool: визуальная локальная проверка и DOM/network evidence, с CUA fallback если Playwright MCP отсутствует. Независимый read-only Critic на каждом PR. Codex отвечает за root cause, границы, полноту тестов, фиксацию ограничений и gates.

Матрица: три действия; text last-line/long words/no horizontal overflow; настоящая browser-emulated touch-scroll vs horizontal drag, pointercancel, release outside; фото/видео controls; keyboard/focus; success delayed until response; 409 stale slot; disconnected account; no slot; time crosses cutoff; 422 invalid; 500; commit+lost response; same UUID replay/reload; duplicate new operation; concurrent opposite decisions; rejected storage write prevents dispatch; owner change in flight; export owner isolation/no automatic transfer; zero denominator; no labels → no themes; legacy conversions produce no fabricated feedback; migration drift and old API compatibility. Full suite mandatory per PR, failures reported by name, no retries/skips/assertion weakening to obtain PASS.

## Документация использованных платформ

- MDN touch-action: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action — browser scroll может вызвать pointercancel; pan-y/pinch-zoom сохраняет vertical scroll/zoom.
- MDN setPointerCapture: https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture — событийный capture используется после выбора горизонтального drag.
- Motion gestures: https://motion.dev/docs/react-gestures — альтернатива с готовыми drag gestures; не выбрана без доказанной необходимости новой зависимости.

## Уточнения после независимого Critic — revision 2

Эти уточнения являются частью предложения и ещё требуют Owner review. Проблемы в предложении исправлены; реализация пока не изменялась.

1. **Replay и удаление.** Сначала найти receipt по authenticated owner+UUID и сравнить canonical immutable request hash. Подтверждённый тот же запрос возвращается до новых проверок READY/revision/accounts/cutoff, даже после истечения времени или отключения сети. Изменённый payload с прежним UUID —409. Если результат был удалён, receipt становится логическим tombstone/результатом410, без нового Post или feedback. Receipt не имеет каскадного FK к Post/Library; при удалении владельца данные удаляются. Новые validation failures до commit не создают feedback. Оригинальный клиентский UUID сохраняется при неизвестном результате и применяется только после явного recovery.

2. **Owner isolation уже в PR1.** Каждый approve/reject/recovery/refresh/ack/storage-clear/finally захватывает OwnerContext и generation до dispatch и проверяет его после каждого await, перед setData/counters/pending/editor/storage изменениями. Позднее завершение A не может очистить storage B, снять busy lock B или изменить его карточку. Не ограничиваться unmount/key review. В частности, acknowledgeQueue получает captured context аргументом, а не читает нового текущего owner.

3. **Сериализация сети и времени в PR2.** Для нового Swipe intent lock order: owner → source Library → соответствующие существующие Post/history locks при lookup → выбранные social_accounts в детерминированном порядке ID. READ FOR UPDATE выбранных аккаунтов сериализует проверки с обычным SQL UPDATE enabled/connectionStatus; новых provider calls или изменений connector не нужно. Обычный requirePlannerAccounts SELECT без locks не считать atomic доказательством. Cutoff проверяется по свежим серверным часам после lock waits непосредственно перед созданием. Durable replay bypasses these new-intent validations. Запрет inline tick проверяется реальным route test со spy/injected scheduler, не только поиском строки в файле.

4. **Жизнь оценок.** Текущая оценка относится к сохранённому fingerprint подтверждённой версии title/text/упорядоченных media IDs, а не автоматически переносится на отредактированную версию. Редактирование само по себе не записывает новый голос. После явного повторного review актуальная строка заменяется новой snapshot metadata; история receipts остаётся. Замена DISLIKE→LIKE меняет total не более одного на исходную заготовку: dislike -1, like +1, total без изменения. После удаления источника минимальная оценка/receipts сохраняются как история с sourceDeleted/resultDeleted; полные тексты/названия/медиа URLs не сохраняются. Aggregate явно обозначен как статистика последних подтверждённых оценок по источникам, включая удалённые, а не характеристика текущей библиотеки. Export содержит текущие оценки и отдельную историю подтверждённых receipts с их lifecycle flags; replay не является новым history event. Тематических выводов нет. Retention — до удаления владельца либо отдельного явно согласованного privacy/reset contract.

5. **Промежуточные PR.** До PR3 durable DISLIKE recovery ещё отсутствует: PR1/PR2 сохраняют текущую archive operation и не выдаются за завершённую2.0. Протокол PR2/PR3 имеет зависимость, хотя diff/test review каждого этапа отдельный; указывать её в PR и не обещать независимое применение несовместимых серверных изменений. Synthetic loopback fixture расширяется только разрешёнными fake mutation scenarios; все прочие writes/providers по-прежнему fail closed. Атомарность доказывается serial disposable PostgreSQL integration tests.

6. **Добавлены обязательные тесты.** Receipt replay после cutoff/disconnect/удаления результата; изменённый payload UUID; disconnect в lock wait; stale timestamp после lock waits; owner A→B на каждом async mutation/ack/finally; DISLIKE→LIKE aggregate replacement; source edit/delete lifecycle в export; lost DISLIKE response с recovery после reload. Тесты должны проверять outcome и state, а не только stub вызовы.

7. **Terminal recovery410.** Typed DECISION_RESULT_DELETED с410 — окончательный результат ранее подтверждённого intent, а не неизвестная ошибка. PR3 явно классифицирует его в recovery: при ещё актуальном captured owner+generation очищает только совпавший UUID pending, обновляет локальное состояние и сообщает об удалённом результате; не создаёт Post, feedback или новый UUID и не увеличивает UI-счётчик. Неизвестные/неподтверждённые ошибки по-прежнему оставляют исходный pending. Добавить reload→same UUID recovery→typed410 и owner change во время410 response tests. Независимое повторное design review: прежние четыре замечания закрыты, блокирующих противоречий не найдено; это не acceptance реализации.

## Gate после revision 2

До реализации требуется review этого дизайна, особенно семантики замены оценки и состава экспорта. Явно вызванный brainstorming требует: «the human partner reviews and approves the written spec». Затем writing-plans подготовит короткий исполнимый план с точными файлами/сигнатурами/RED assertions и его review. После разрешения — автономная реализация без согласования каждого файла, independent Critic и отдельные draft PR. Настоящие публикации, merge и deploy не разрешены текущей задачей.
