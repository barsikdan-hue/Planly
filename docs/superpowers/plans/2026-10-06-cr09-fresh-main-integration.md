# CR09 fresh-main integration after approved CR11 merge

Execution: inline using Superpowers executing-plans, systematic-debugging, TDD for a new runtime correction, verification-before-completion and one fresh independent whole-branch final review. Owner directly authorized PR19 merge and PR18 integration; PR18 merge and production deployment remain separate gates.

## Contract

Source main/PR19 merge: `4621cfdedef43b98a014a9f4c7e9ad83e9c435ba`, containing exact approved `39c7bb9c37df45f88f138b8e6972d68840d011b6`. Frozen CR09: `f7dd2bb29d9c2a23d3919cda3e83a57fcf099027`. Preserve the [approved CR09 behavior](../specs/2026-10-05-composer-upload-continuation-design.md) and [merged CR11 scope](../specs/2026-10-06-owner-lifecycle-design.md), including PR14 fallback upload counting, PR16 editor mode recovery and PR17 Library recovery.

Only existing App/Composer upload integration, regression tests and new evidence/plan documents are in scope. No API/DB/recovery schema/dependency/workflow/provider/infra changes, new feature or refactor. No production deploy/provider send, PR18 merge, CR06/CR07/CR08/GAP01 work. Historical evidence stays unchanged.

The old CR09 plan described numeric generation and a second owner binding because CR11 was absent. The approved fresh integration explicitly preserves merged CR11's canonical OwnerLifetime; batches consume that authority rather than recreate the historical second authority. This is the already-reviewed behavioral composition, not a new product/architecture policy. Any material contract mismatch beyond this integration causes PLAN_STALE/STOP.

## Task 1 — fresh baseline and conflict trace

- [ ] Verify GitHub exact PR19 head/CI, mark ready and merge with expected-head protection; verify actual merge SHA/parents/fresh main and identical approved tree.
- [ ] Run fresh-main sanity and inspect actual push native CI/Docker. No deploy (Render autoDeploy verified off).
- [ ] In an isolated clean worktree at exact main, inspect existing owner, editor token, upload/notification, Library and submission paths, then merge frozen CR09 without commit.
- [ ] Classify actual conflicts against both parents and current contracts. Reuse the saved exact resolver only if its guarded conflict count/content match; verify all runtime blobs against the reviewed composition.

## Task 2 — regression and exact-head delivery

- [ ] Preserve three frozen owner-poll probes; add their CI-path copies and the current-owner notification control from merged evidence. No assertion weakening or skips.
- [ ] Run corrected focused upload/poll control, 24-file targeted regression, typecheck, lint and production build. For any new runtime defect: proven root → independent RED → minimal fix → GREEN; independent roots STOP_SPLIT, regression FIX NOT ACCEPTED.
- [ ] Commit the resolved merge on a separate local branch, fast-forward push to PR18's original remote branch, keep PR18 DRAFT and base fresh main. Do not create another probe PR.
- [ ] Require actual exact-head full native suite 0 FAIL / 0 unexpected SKIP, migration/typecheck/lint/build, Docker/Self-host SUCCESS. No local native/Docker PASS without available environment.

## Task 3 — final review/evidence/gate

- [ ] One independent read-only full-branch review covers actual fresh-main diff, ordering/owner/token/notification/submit/tombstone integration and merged PR14/16/17/CR11 contracts. Record excluded/unproven paths; root-first TDD for any in-scope review correction.
- [ ] Record exact inputs/blobs, merge sanity, conflict trace, test counts, CI/Docker links and review/rulings in a new report. Final-head CI verdicts live in PR metadata to avoid circular report commits.
- [ ] Verify clean/pushed exact final head, main unchanged, behind 0, mergeable true, native and Self-host SUCCESS. Stop at READY_FOR_OWNER_MERGE_GATE — PR18. No merge or deployment.
