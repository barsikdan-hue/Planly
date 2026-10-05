# CR-03 — overlapping Composer uploads

Approved customer-ready campaign; systematic-debugging → TDD → minimal fix → verification → independent review. Fresh origin/main95f53b7; branch codex/customer-ready-composer-upload. PR12/13 remain frozen READY independently.

Contract: draft/save/schedule/publish controls stay disabled while any upload batch in the current Composer remains pending. Preserve concurrent uploads, functional draft/media merge, quick/full layouts, per-file failure/partial-success handling, account/saving guards and unmount protection.

Proven first broken layer: components/planner/composer.tsx::addFiles sets a shared boolean true for both overlapping batches; first finally sets false while another upload promise remains pending. Enabled callbacks serialize incomplete mediaIds before later attachment completion. Actual callback probe reproduced both layouts/orderings and PlannerApp.upload catching failure into []. This is deterministic callback evidence, not browser/production proof.

Scope: one Composer pending-batch state; existing upload/API and draft merge retained. No auth/retry/scheduler/provider/API/recovery/calendar/library changes; no upload serialization, feature or infrastructure change.

- [x] Verify fresh clean main worktree; focused baseline16/16 PASS.
- [x] Actual Composer callback regressions: same-render overlapping input/drop, both completion orders/layouts, empty/partial result, latest draft, single batch and saving/account guards; confirm meaningful RED10total/3PASS/7expectedFAIL.
- [x] Minimal functional pending count, derive busy; mounted completion protection. Targeted GREEN26/26 including10race cases.
- [x] Full native CI456/456/typecheck/lint/standard build and isolated Docker runtime; local protected287/287 + webpack build. Independent adversarial review; final documentation HEAD repeat recorded in canonical PR before READY.
- [ ] Push/PR report READY, direct Orchestrator merge gate; no merge/deploy without Owner approval. Continue independent next P0/P1 separately.

Human gates: new product/architecture scope, secrets/infra/destructive operation, merge/deploy. New independent root/regression → STOP/SPLIT rather than expand this fix.
