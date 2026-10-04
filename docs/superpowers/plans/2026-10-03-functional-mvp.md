# Functional MVP implementation plan

> **For agentic workers:** Use systematic-debugging, test-driven-development and verification-before-completion. Execute the independent fixes in order and commit separately.

**Goal:** Complete the verified create → text/media → Telegram/MAX → preview → draft/publish/schedule → independent result → reopen/edit flow.

**Architecture:** PostgreSQL remains authoritative for saved posts and publication state. Validate scheduled targets using their effective text and owned media metadata inside the save transaction before mutations/enqueue, sharing capability rules with existing connectors. Recover unfinished editor fields through one owner-scoped sessionStorage record per browser tab, without server autosave.

**Tech stack:** Existing Next.js, React, TypeScript, Drizzle/PostgreSQL, node:test, Telegram/MAX connectors; no new product dependencies.

**Spec:** User's 2026-10-03 functional milestone instruction, recorded in ROADMAP.md. Work autonomously until reviewable; merge/main and production deploy require owner approval.

## Constraints and review focus

- No scheduler timing investigation or architecture change, VK, AI, analytics, paid Render or broad refactor.
- Reject incompatible scheduled content atomically; unscheduled drafts can remain incomplete for a provider.
- Effective text uses `textOverride ?? baseText`, including meaningful empty overrides and override-only posts.
- VALIDATION is terminal, while only TEMPORARY failures can enter bounded retry.
- Restore only after authenticated bootstrap; current server statuses and fresh media URLs win over cached state.
- API failure, storage failure and switching editor during an outstanding request must not silently discard unfinished work.
- Tests use disposable databases and local provider/storage fixtures. Real PostgreSQL/Redis CI and production/provider evidence are labelled separately.

## Task 1 — content validation

Files: shared `lib/publication-content.ts`, server posts/http, current connectors, planner contracts/client guard and focused node:test coverage.

- [x] Reproduce invalid text/media being accepted and queued through actual save path; retain red evidence.
- [x] Share current connector limits without expanding provider features; run metadata-only validation before transactional writes.
- [x] Return actionable HTTP 422 for scheduled content errors; preserve unscheduled drafts.
- [x] Prove create/update rollback, override handling, boundary limits and terminal VALIDATION behavior.
- [x] Review diff, run relevant regression/typecheck/lint, commit this fix independently.

## Task 2 — draft/reload persistence

Files: small editor recovery helper, `components/planner/app.tsx`, focused node:test coverage.

- [x] Reproduce React-only editor state loss on reload and identify every editor replacement/clear path.
- [x] Store editable fields only in owner-scoped sessionStorage after hydration; recover existing post metadata from bootstrap.
- [x] Handle deleted posts/media and malformed/unavailable storage with an honest notice; never auto-publish.
- [x] Guard replacement of dirty content and clear/reset only the revision confirmed saved by the API.
- [x] Verify reload/new/edit/failed save/successful save in the actual local browser; commit separately.

## Task 3 — functional audit and handoff

- [x] Audit Dashboard, Create Post, Content, Calendar, Media, Settings and Telegram/MAX settings using a local authenticated browser.
- [x] Exercise upload/preview, draft/edit/delete, immediate/due/future publication, duplicate request, errors and independent target outcomes with actual server paths and local provider fixtures.
- [x] Fix only separately reproduced bounded functional defects, each with its own regression and commit.
- [x] Run full CI on PostgreSQL/Redis, typecheck/lint/build and self-host runtime; inspect exact head results.
- [x] Record pass/fail/unverified per flow, known limitations and evidence. Request main merge/deploy only after the branch is reviewable; do not claim fresh production acceptance before that gate.

## Outstanding production acceptance — remote-first update 2026-10-04

- [ ] Owner approval for PR #4 merge + deployment on the existing Render service, then execute both without an intermediate approval stop.
- [ ] Verify deployed SHA/health and the user-facing flows through Render, including actual media upload. Use a supported upload mechanism or manual production file selection if automation cannot operate the chooser; localhost file selection is not a prerequisite.
- [ ] Minimal safe Telegram/MAX live smoke for affected provider validation/lifecycle/publication behavior, with one immediate and one scheduled valid case as needed; verify independent target receipts and no duplicate send. Do not investigate GitHub trigger intervals.

Evidence: [internal functional verification](../../verification/2026-10-03-functional-mvp.md) and [remote-first review/checklist](../../verification/2026-10-04-pr4-remote-first-review.md). Existing branch evidence supports review. Final user-facing PASS follows production acceptance, under AGENTS.md.
