# Personal SMM Planner

CURRENT PHASE: 1 — UI PROTOTYPE, по прямому запросу владельца.
CURRENT GOAL: проверить интерфейс персонального центра управления контентом.

DONE
- Dashboard, Create Post, Calendar (day/week/month), Content, Media, Social Accounts, Analytics demo, Settings.
- Общий state публикаций, отдельные PostTarget и тексты под соцсети.
- Создание, редактирование, копирование, удаление с подтверждением, живой preview.
- Drag/drop запланированных постов; перенос через редактор на телефоне.
- Локальная медиатека в IndexedDB; MIME/signature/size проверки, 20 MB/file, 80 MB total.
- Сохранение постов, медиа, аккаунтов и имени в этом браузере; очередь записей, баннер ошибки сохранения.
- Поиск, статусы, фильтр по площадкам. Адаптивное меню.

TESTED
- TypeScript compiler.
- Core unit tests (5): empty text / missing targets, valid future Moscow time, invalid/past date-time, rescheduling without lost targets, draft rules.
- Eight screen render smoke checks.
- Production build.

KNOWN ISSUES / LIMITATIONS
- Нет реальных публикаций, backend content storage, AI или реальной аналитики. Расписание не отправляет посты автоматически.
- Демо хранится только в браузере; очистка browser data удаляет его. Нет синхронизации между устройствами/вкладками.
- Браузерный UI/E2E и WebMCP вызовы не проверены: требуемый инструмент control-browser в доступном наборе отсутствует. SSR checks не заменяют UI QA.
- Phase 0 production foundation (PostgreSQL/auth/logging/Docker) не реализован этим прототипом. Hosting owner-only access обеспечивает платформенный доступ к демо, а не backend авторизацию будущего приложения.

TECH DEBT
- Заменить локальную демобазу на backend + PostgreSQL в Phase 2.
- Проверить UI сценарии в браузере перед использованием как основы production.

BLOCKERS для production: фундамент Phase 0, Content Core, Scheduler.
NEXT MILESTONE: review UX прототипа владельцем; затем Phase 0 production foundation и Phase 2.
NEXT PHASE: Content Core только после готового production foundation.
