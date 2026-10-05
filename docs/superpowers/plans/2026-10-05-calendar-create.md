# CR-04 — preserve Calendar scheduling intent

STATUS: VERIFYING_CR04. Orchestrator APPROVE_SPLIT_A authorizes initial Calendar mode only. Original reload oracle preserved separately as CR10 design/RED; reviewed UI intent representation required before recovery runtime changes. Historical STOP_SPLIT and evidence remain in the verification report.

Approved customer-ready campaign; systematic-debugging → TDD → minimal fix → verification/review. Fresh main95f53b7; separate codex/customer-ready-calendar-create. PR12/13/14 frozen READY, each pending Owner gate.

Contract: creating from an explicitly chosen Calendar date/time initially opens unsaved Composer in scheduled mode with those fields visible. Generic new-post actions keep default Now. Preserve dirty replacement confirmation, existing recovery behavior, draft saving, future-time validation and no mutation until explicit save/publish. Reload mode persistence is separate CR10, not an acceptance claim here.

Candidate first broken layer: Calendar.createPost(date,time) → PlannerApp.createPost merges date/time into blankPost but leaves status=draft → Composer initializes publishMode from status and opens Now, hiding the selected schedule. Earlier production audit reproduced selected2026-10-0618:00 opening Now; deterministic proof still required on fresh source.

Scope: initial unsaved editor state at PlannerApp.createPost only; no Composer/upload/auth/retry/scheduler/provider/API/Calendar-layout/Library/recovery schema or new product flow.

- [x] Confirm source identity/clean baseline13/13PASS and actual app callback/component regressions, meaningful RED6total/2PASS/4expectedFAIL.
- [x] Approved scope split; scoped RED5total/2PASS/3expectedFAIL, minimal one-line initial-mode fix; focused GREEN18/18, generic/replacement controls. Preserved CR10 reload oracle separately still RED1/1.
- [ ] Full native tests/typecheck/lint/build/Docker, local protected checks, independent review and exact final HEAD.
- [ ] Push/PR READY then direct Orchestrator MERGE_DEPLOY gate; no delivery without Owner approval. Independent campaign work separately.
