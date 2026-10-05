# CR-04 — preserve Calendar scheduling intent

STATUS: STOP_SPLIT. Minimal local experiment fixed initial Calendar mode but declared reload regression still failed because recovery drops status. Experiment reverted before push. See verification report for independent recovery trace, options and Orchestrator scope question. No further implementation until split/contract decision.

Approved customer-ready campaign; systematic-debugging → TDD → minimal fix → verification/review. Fresh main95f53b7; separate codex/customer-ready-calendar-create. PR12/13/14 frozen READY, each pending Owner gate.

Contract: creating from an explicitly chosen Calendar date/time opens unsaved Composer in scheduled mode with those fields visible. Generic new-post actions keep default Now. Preserve dirty replacement confirmation, session recovery, draft saving, future-time validation and no mutation until explicit save/publish.

Candidate first broken layer: Calendar.createPost(date,time) → PlannerApp.createPost merges date/time into blankPost but leaves status=draft → Composer initializes publishMode from status and opens Now, hiding the selected schedule. Earlier production audit reproduced selected2026-10-0618:00 opening Now; deterministic proof still required on fresh source.

Scope: initial unsaved editor state at PlannerApp.createPost only; no Composer/upload/auth/retry/scheduler/provider/API/Calendar-layout/Library/recovery schema or new product flow.

- [x] Confirm source identity/clean baseline13/13PASS and actual app callback/component regressions, meaningful RED6total/2PASS/4expectedFAIL.
- [ ] Minimal explicit Calendar schedule intent in new draft; focused GREEN, generic/replacement/reload controls.
- [ ] Full native tests/typecheck/lint/build/Docker, local protected checks, independent review and exact final HEAD.
- [ ] Push/PR READY then direct Orchestrator MERGE_DEPLOY gate; no delivery without Owner approval. Independent campaign work separately.
