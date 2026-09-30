# Personal SMM Planner — Phase 1
Goal: кликабельный прототип по утверждённому пользователем JSON и описанию.
Architecture: React/TypeScript, общий state для экранов. Данные демо сохраняются локально в браузере. Реальных API, токенов, scheduler и AI нет.
Design: фон #F3F7FC, primary #3867F4, меню 228px, карточки 14px; desktop first, мобильное меню. Без команд и тарифов.

- [x] lib/planner.ts: модели Post/PostTarget, demo seed, валидация будущего времени МСК. tests/planner.test.mjs проверяет пустой текст, targets, время и перенос без потери независимых статусов.
- [x] components/planner: общий shell, Dashboard, Composer, Calendar, Content, Media, Social Accounts, Analytics, Settings; accessible primitives, выбор/preview сети, текст по сети, локальные фото/видео, редактирование и удаление с подтверждением, недельный drag/drop и перенос через редактор.
- [x] Persistence: локальная демобаза, сохранение после reload, ошибка browser quota, настройки имени, быстрый поиск и фильтры, mobile layout.
- [x] Verification: node --test, tsc --noEmit, production build; preview только при доступном разрешённом инструменте; private publish и terminal status.
Review focus: пустые сети, прошедшее время, invalid media MIME/size, повторное сохранение того же post id, browser storage unavailable. Проверяются core тестами и защитой UI.
