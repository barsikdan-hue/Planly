# PLANLY — MASTER CODEX CONTRACT: TOOLS, HARNESS, AUTONOMOUS REPAIR

**Дата:** 12.10.2026  
**Репозиторий:** `barsikdan-hue/Planly`  
**Режим:** разрешены аудит, установка и настройка бесплатных доверенных инструментов, изолированная реализация DevEx в отдельной ветке, тестирование и PR. **Не разрешены merge, production deploy, реальные публикации, secrets/infra-изменения, destructive migration и платные ресурсы.**

## 0. Суть задачи

Сделай существующую разработку Planly быстрее и автономнее: обнаруженная ошибка → самостоятельная диагностика и исследование → доказанный root cause → минимальное исправление → независимое ревью → воспроизводимые тесты → готовый PR. Не требуй вмешательства Owner между обычными техническими итерациями в утверждённом scope. Owner решает продуктовые вопросы и утверждает merge/deploy/опасные операции, а не управляет каждым тестом.

Сначала изучи **фактическое** состояние checkout, `main`, веток, открытых PR, `AGENTS.md`, `ROADMAP.md`, workflows, тестов, runtime и доступных Codex Plugins/MCP/Skills. Не доверяй старым отчётам больше текущего кода. На момент подготовки задания `main=da9a2e89cc37119e87952ac56fcf86a1383de3f7`, открыты draft PR #37 (VK) и #38 (production-cleanup audit); перепроверь. Не затрагивай чужие незавершённые ветки. VK/Instagram HOLD; Telegram analytics HOLD; AI не возвращать в основную дорожную карту без отдельного решения. Не запускать новую продуктовую фазу.

## 1. Установи, проверь и опиши инструменты

**Требование Owner:** установить перечисленные инструменты, которые реально доступны в твоём Codex-окружении, **без дубликатов и без фиктивных результатов**. Сначала проверь, что уже есть, поддержку текущей поверхности (Codex CLI / desktop / cloud), разрешения, доверенный источник, свежую безопасную версию, объём изменений и стоимость. Пропускай переустановку работающего. Если установка требует UI-действия владельца, аккаунтной авторизации, API-key или оплаты, зафиксируй `BLOCKED_BY_OWNER_ACTION`, точный шаг и продолжай независимую работу. Установка CLI/пакетов допустима в доступной пользовательской среде, но не изменяй production-секреты, инфраструктуру, глобальные политики доступа и платные настройки. Не исполняй случайные установочные скрипты из интернета.

### A. Superpowers — `obra/superpowers`
- Источник: https://github.com/obra/superpowers
- Найти/установить через официальный Codex `/plugins`, если доступен. Проверить, что bootstrap и сами Skills реально читаются.
- **Баг:** `systematic-debugging`; до фикса доказать причину. **Новая согласованная функция:** `brainstorming` (только если дизайн действительно не определён) → `writing-plans` (для нетривиальной работы) → `test-driven-development` (когда применимо). **Готовность:** `verification-before-completion`.
- `requesting-code-review` / `receiving-code-review` — при PR и разборе замечаний; `subagent-driven-development` — только для достаточно сложной задачи с независимым Critic; `dispatching-parallel-agents` — только для независимых исследований; `using-git-worktrees` — только при конфликтующих параллельных ветках; `diagnosing-superpowers` — при доказанном сбое самих skills.
- **Не вызывать весь набор на каждую мелкую правку.** Выбирать конкретные навыки по триггеру и ожидаемому результату.

### B. OpenAI `Build Web Apps` — `openai/plugins`, `build-web-apps`
- Источники: https://github.com/openai/plugins и https://github.com/openai/plugins/tree/main/plugins/build-web-apps
- Найти в официальном Codex каталоге `/plugins`, проверить и установить, если доступен.
- Для UI-багов: `frontend-testing-debugging` → воспроизводимый сценарий, браузер, screenshots, console/network errors, повторная проверка.
- Для React/Next.js изменений: `react-best-practices`; для реальных shadcn/UI-компонентов: `shadcn-best-practices`; для новой согласованной UI-функции: `frontend-app-builder`.
- **Не использовать** Stripe, billing, Supabase migration, image generation или новый UI framework без соответствующей отдельной задачи. У Planly существующая PostgreSQL/Drizzle архитектура; плагин не даёт разрешения менять её.

### C. Browser + Playwright MCP + Playwright Test
- Найти и проверить официальный Browser plugin в Codex. Если он доступен, выполнять browser-сценарии через рекомендованный skill; если недоступен — использовать Playwright MCP / Playwright Test без ложных утверждений о Browser.
- Playwright MCP: https://github.com/microsoft/playwright-mcp ; официальный вариант Codex CLI: `codex mcp add playwright npx "@playwright/mcp@latest"` (только в поддерживаемом CLI; проверить зарегистрированный сервер и реально открыть безопасную страницу). Не отключать проверки host/security, использовать изолированный профиль.
- Playwright Test: https://playwright.dev/docs/intro . После проверки отсутствия/совместимости добавить через существующий `pnpm` в devDependencies **в отдельной DevEx-ветке**; версии фиксировать lockfile. Отдельно скачать нужный Chromium в тестовом окружении. Не устанавливать все браузеры без необходимости.
- **Задача Playwright MCP/Browser:** интерактивно исследовать UI и собрать доказательства. **Задача Playwright Test:** воспроизводимые E2E в CI на изолированной среде/фикстурах. **Задача Codex:** анализ, локализация root cause, код, тесты, PR. Не путать эти роли.
- Начать с 2–3 коротких E2E без side effects: календарь/навигация, черновик/preview/reload, адаптивность desktop 1366×768 и mobile 390×844. НЕ публиковать в Telegram/MAX из автоматического браузерного теста и не удалять реальные данные.

### D. Codex Code Review / GitHub
- Проверить GitHub-коннектор и Codex Code Review/Auto-review. Если доступно и допустимо без нового платного обязательства — подключить/настроить для PR; иначе подготовить точную инструкцию Owner.
- **GitHub:** получить фактические SHA, diff, tests, failed job logs, PR comments, проверить что выполнена проверка именно HEAD данной ветки.
- **Codex reviewer:** независимо прочитать diff, указать дефекты, security/race/regression и недостающие тесты; замечания дать Fixer. `@codex review` использовать при доступности.
- **Critic read-only**, не изменяет код. Тесты/CI имеют приоритет над мнением агента. Не утверждать, что auto-review включён, пока реально не проверено.

### E. GitHub Agentic Workflows (`gh-aw`) и CI Failure Doctor
- Источники: https://github.com/github/gh-aw ; https://github.github.com/gh-aw/ ; https://github.com/github/gh-aw/blob/main/.github/workflows/ci-doctor.md
- Проверить `gh` и возможность `gh extension install github/gh-aw`; использовать актуальный безопасный релиз (проверить предупреждения об уязвимостях). Установить только при доступности среды.
- Исследовать CI Failure Doctor и **подготовить** read-only схему диагностики падения CI: trigger → failed jobs/logs → классификация ошибки → диагностический PR comment/issue → предложение следующего шага. Дедупликация по fingerprint/SHA; минимальные permissions; безопасные outputs; ограничения запусков.
- **Не активировать облачный AI workflow до проверки оплаты, используемого AI engine, credentials, GitHub Actions usage и отдельного Owner gate.** Наличие Codex Pro не доказывает бесплатность API inference в GitHub Actions. Не использовать чужой demo-workflow вслепую; проверить permissions, triggers, network, generated lock.
- Не заменять обычный deterministic CI агентом. Если gh-aw невыгоден, сохраняем CI и запускаем Fixer из существующего Codex по ссылке на падение.

### F. OpenAI Developers / Docs
- Источник: https://developers.openai.com/learn/developers-codex-plugin
- Найти доступный официальный Docs skill/plugin для сверки текущего поведения Codex, Plugins/MCP и OpenAI API; установить при доступности и отсутствии затрат. Не создавать API keys и не включать платные запросы ради установки. В задачах без OpenAI API достаточно официальной документации/web search.

### G. Уже используемые внешние инструменты
- **Render:** только read-only состояние сервиса, deployed SHA, health, сборка, логи и наблюдаемое поведение в пределах доступных прав. Deploy/infra/env — Owner gate.
- **Cloudflare/R2:** только при медиа/хранилище — проверка конфигурации и документации в пределах разрешённого read-only доступа. Никаких изменений ключей, бакетов, публичности.
- **GitHub:** источник истины для PR/CI/коммитов. Не считать текстовый отчёт доказательством успешного CI.
- **Codex Goals / Subagents / Git worktrees / Hooks:** это возможности среды, не отдельные обязательные загрузки. Проверить наличие; `/goal` использовать для измеримой долгой задачи, если поддерживается. Hooks только после чтения, оценки безопасности и необходимости; не добавлять глобальные перехватчики ради моды.

## 2. Постоянное правило Harness — TOOL ROUTING CONTRACT

После Inspect **добавь компактное обязательное правило в существующий `AGENTS.md`** без переписывания остального. Если подробная матрица слишком велика — размести её в отдельном новом документе внутри `docs/` с осмысленным именем, добавь точную ссылку в `AGENTS.md`. Не утверждай, что новый файл уже существует. Не дублируй большую инструкцию в каждом промпте: загружай детали только релевантного инструмента.

Перед КАЖДОЙ задачей Codex формирует внутренний либо краткий видимый TOOL ROUTING CONTRACT:

`TASK → GOAL → EXISTING IMPLEMENTATION → RISK → SELECTED TOOLS/SKILLS → EACH TOOL'S EXACT JOB → EXPECTED EVIDENCE → TESTS → FALLBACK → HUMAN GATE`.

Для КАЖДОГО выбранного инструмента укажи:
1. **Trigger:** почему именно эта задача требует его;
2. **Scope:** какие файлы/процессы/браузерные сценарии ему доступны;
3. **Action:** что конкретно он должен проверить или выполнить;
4. **Deliverable:** какие артефакты вернуть (trace, screenshot, test log, diff review, URL/CI evidence);
5. **Boundary:** что делает инструмент, а что остаётся за Codex; что инструмент делать НЕ должен;
6. **Fallback:** как действовать, если инструмент отсутствует или сломался.

Перечислять все плагины в каждом отчёте не надо: 1–3 подходящих достаточно. Остальные обозначать `NOT_APPLICABLE` без загрузки их SKILL.md. Для простого исправления не требовать brainstorming и большой план. Для frontend UI-багов выбирать реальный браузер; для scheduler — node/Postgres/Redis тесты и временные гонки; для внешних API — connector fixtures, network/timeouts и idempotency; для CI — job logs; для деплоя — Render read-only и production acceptance **только после разрешённого релиза**.

## 3. Автономная работа при ошибке / STOP

Слово STOP в отчёте — не само по себе приказ немедленно передать всё Owner. Действуй по следующему протоколу внутри ранее согласованной области:

**TRACK 1: собственное решение (evidence-first)**
- Проверь истинный статус: ошибочный тест, инфраструктура, flaky, браузер/плагин, провайдер, неполные данные, human gate.
- Получи лог, конкретную команду, HEAD, ожидаемый и фактический результат.
- Проверь существующие функции, тесты, контракт API/DB и воссоздай исходный симптом. `ROOT_CAUSE_NOT_PROVEN → NO CODE FIX`.
- При подтверждённой причине: минимальный patch, сначала regression RED, затем GREEN, targeted test → relevant regression → typecheck/lint/build/CI → браузер/обновлённый артефакт при необходимости.
- Если тесты/independent Critic нашли ошибку — исправь в той же ветке и повтори проверку без приглашения Owner на каждый круг.

**TRACK 2: внешнее техническое исследование (обязательно при неочевидном сбое)**
- По точной сигнатуре ошибки и версиям инструментов самостоятельно ищи официальный Docs/Changelog, upstream GitHub Issues/PR, подтверждённые воспроизведения и безопасные workaround.
- Сопоставляй внешнее объяснение с нашим stack и фактическими логами; найденная в интернете «похожая проблема» ещё не доказательство нашего root cause.
- Не копируй случайные `curl | bash`, не встраивай чужой патч без проверки, не ослабляй тесты и security, не подменяй причину симптоматическим retry.
- Запиши 1–3 источника и заключение: `APPLICABLE / NOT_APPLICABLE / UNVERIFIED`.

**Продолжение:** делай несколько разумных диагностических/repair-итераций, пока появляется новое проверяемое доказательство. Не крути бесконечные одинаковые попытки, не расходуй API-кредиты без утверждения бюджета. Если причина не доказана, можно делать безопасную диагностику/изолированные тесты/документацию, но нельзя притворяться, что проблема исправлена. Не пиши `DONE` при провале или непроверенном сценарии.

**Настоящий STOP** допускается, если нужны secrets, новые аккаунтные permissions, расходы, решения по продукту, prod данных/infra, рискованные миграции, merge/deploy, provider publishes либо дальнейшее расследование невозможно без внешнего доказательства. Запиши: `BLOCKER → evidence → investigations already done → exact smallest owner action → safe continuation`. Не задавай уже отвеченные вопросы. При обычном падающем CI техническое расследование/ремонт не должны требовать решения Owner.

### Handoff для независимого ChatGPT-оркестратора

Если Codex дошёл до обоснованного STOP, не оставляй доказательства только в локальном чате: безопасно запиши в draft PR или GitHub Issue/комментарий `HEAD, failing command, redacted log, reproduction, source links, what was tried, precise blocker, safe next step`. Никаких секретов и production PII. Так ChatGPT в отдельном аккаунте сможет независимо получить **реальные** доказательства через GitHub.

Когда Owner передаёт STOP/ошибку ChatGPT, оркестратор должен: (1) самостоятельно проверить GitHub/CI/код и принять техническое решение о следующем минимальном действии; (2) независимо поискать известные решения по точной сигнатуре в official docs/upstream GitHub Issues и проверить их применимость; (3) сформировать для Codex короткий исполнимый fix contract без повторных вопросов. ChatGPT не должен выдавать план за выполненный фикс и не может наблюдать закрытый Codex-сеанс автоматически без специально настроенного триггера.

## 4. Особые гарантии Planly

- Никогда не отправляй секреты во frontend, PR, логи или чат.
- Сохраняй Post/PostTarget независимые статусы, durable/idempotent requests, BullMQ retries, scheduler recovery и подтверждение публикаций.
- Без автоматических повторных реальных видеопубликаций или неограниченных provider retries.
- Не редактируй одновременно один и тот же участок кода разными write-агентами. Critic read-only, Git worktrees только для независимых задач.
- Не смягчай assertions ради зелёного CI, не делай массовый рефакторинг внутри bugfix.
- Не переходи к VK, Telegram analytics, Instagram и AI-editor без новой явно согласованной продуктовой задачи.
- Следи за реальными расходами: никаких новых облачных сервисов, workers и платных inference без Owner gate.

## 5. План исполнения этой задачи

**Step 0 — Evidence.** Сверь workspace/main/open PR/CI, текущие инструменты, поддержку Plugins/MCP и baseline скорости. Измерь тесты, сборку и возможное влияние `--test-concurrency=1`; **не включай параллельность общих PostgreSQL/Redis integration-тестов без доказательства изоляции**.

**Step 1 — Tools.** Установи/активируй подтверждённо доступные бесплатные плагины из раздела 1, проверь вызовом их реальную работоспособность. Отдельно отметь недоступные функции UI/аккаунта и платные зависимости. Установка в личный Codex profile и изменение репозитория — разные операции, не путай их.

**Step 2 — Harness.** В существующем `AGENTS.md` зафиксируй короткое правило TOOL ROUTING CONTRACT, автономное расследование ошибок и human gates. Подробности только в отдельном точечно загружаемом документе при необходимости. Проверь на трёх примерах (UI bug, CI failure, API error), что выбираются разные наборы инструментов, а не все подряд.

**Step 3 — Bounded pilot.** В отдельной ветке внедри минимальные детерминированные браузерные проверки для существующего UI или другую конкретную DevEx-правку с доказанной пользой. Без production provider sends, без фиктивных PASS, без поломки существующего `pnpm test`. Проверки запускаются в доступном окружении. Для любого дополнительного workflow сначала read-only draft, без включения оплачиваемого агента.

**Step 4 — Review and release preparation.** Независимый Critic, targeted/full-relevant tests, migrations checks where relevant, typecheck, lint, build, real GitHub CI/Self-host. Push в отдельную ветку и создай PR только с согласованными DevEx-изменениями; проверить точный HEAD и CI. Merge/deploy не выполнять. После PR предложи, какая следующая **уже разрешённая** задача сайта может быть ускорена новым процессом, но не начинать новые продуктовые изменения без milestone approval.

## 6. Definition of Done

- Inventory реальных installed/working/missing tools с версиями и ограничениями.
- `AGENTS.md` содержит рабочее правило маршрутизации; без бесконтрольного роста контекста.
- Для выбранных инструментов проверены конкретные вызовы/выходные данные.
- Минимальный proof-of-value: один воспроизводимый сценарий или контролируемый failure → диагностика → test → review → CI → PR.
- Не затронуты production, пользовательский контент, tokens, accounts, scheduler, release-state и другие PR.
- Показано до/после по времени/количеству ручных owner-gates там, где можно измерить; без выдуманных процентов.

**Финальный отчёт на русском, коротко:**
`STATUS | MAIN_SHA | BRANCH/HEAD | INSTALLED_AND_VERIFIED | UNAVAILABLE/BLOCKED | TOOL_ROUTING_RULE | PILOT_EVIDENCE | TESTS | CI | PR | COST_RISK | NEXT_SAFE_ACTION | OWNER_GATE`

**Не останавливайся после одного аудита, если разрешённая настройка и пилот ещё выполнимы. Но никогда не называй установку или локальный тест production acceptance.**

## 7. Источники, которые надо сверять при необходимости

- Codex Skills/Plugins: https://developers.openai.com/plugins/concepts/skills
- OpenAI advice on concise AGENTS/Skills: https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra
- Codex Goals: https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- Iterative repair loops: https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex
- Codex Code Review rules: https://developers.openai.com/blog/custom-code-review-rules-for-codex
- Playwright Test: https://playwright.dev/docs/intro
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Superpowers: https://github.com/obra/superpowers
- Build Web Apps plugin: https://github.com/openai/plugins/tree/main/plugins/build-web-apps
- gh-aw documentation: https://github.github.com/gh-aw/
