# CR-04 Calendar scheduling intent evidence

STATUS: RED_CONFIRMED; no implementation/merge/deploy.
AUTHORITY: barsikdan-hue/Planly; fresh origin/main95f53b7d18e656e0f8ceff5002b4c42af3d12251; work/Planly-calendar-create; codex/customer-ready-calendar-create. PR12a3b8c31/PR13 8d9bb74/PR14d056543 frozenREADY, separate Owner gates in direct ChatGPT bridge. Orchestrator accepted each and authorized independent CR04 investigation; release order12→recheck→13→recheck→14.

ROOT_CAUSE: components/planner/calendar.tsx::Calendar chosen hour/day/month/new-post callback supplies date,time → components/planner/app.tsx::createPost merges them into blankPost(status=draft) → components/planner/composer.tsx::publishMode initializer considers status only → Now mode hides explicit scheduling fields. First broken layer is loss of scheduling intent in app's new editor state, not scheduler/timezone/API.
HISTORICAL_PRODUCTION: prior campaign on same main95f53b7 reproduced Calendar2026-10-0618:00 opening Now. No fresh production mutations here; patch acceptance remains NOT PROVEN before authorized delivery.
BASELINE: existing composer-customer-ready/post-edit-app-lifecycle/post-edit-ui-callbacks13/13PASS on fresh worktree.
RED: tests/calendar-create-mode.test.mjs6total/2PASS/4expectedFAIL/0skip. Actual PlannerApp callback/effects through existing hook harness, plus real React server-rendered Composer (hooks not mocked there). Hour18:00/default10:00, recovery reload and past selection fail status=draft vs scheduled. Generic Content new-post Now and declined dirty replacement controlsPASS. No server mutation; runtime tests mock GET bootstrap, reject/count every unexpected mutation. Deterministic lifecycle/markup evidence, not browser proof.

CONTRACT: Calendar explicit date/time opens unsaved scheduled Composer with selected fields visible; generic new-post keeps Now despite blankPost's default date/time. Preserve dirty confirmation, session recovery, manual draft saving and future-time validation. No automatic save/schedule/publish.
SCOPE: initial editor state at PlannerApp.createPost only; no Composer/upload/auth/retry/scheduler/provider/API/Calendar layout/Library/recovery schema/infra changes.
NEXT: minimal date-context status fix after RED, focused GREEN/control checks, serial local protected/type/lint/build; full native CI/Docker + independent review/exactHEAD. Merge/deploy through direct Orchestrator Owner gate; no provider messages.
