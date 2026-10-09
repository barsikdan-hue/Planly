# Phase 9 batch scheduling — implementation verification

Status: desktop/mobile local browser acceptance PASS after two reproduced UI fixes. Required exact-head CI/Self-host status and the Owner release gate are tracked in PR34. No production acceptance, merge, deploy, production migration or provider publication has been performed.

Owner approved the specification at `7d2577746a7a35afc5afce8cc3a1a12c511234b6` and the implementation plan at `3217d13a633df27d7d7d8f84c7612571b4118582`, selecting native execution in this chat on 2026-10-09. Repository: `barsikdan-hue/Planly`; branch: `codex/phase9-scheduling-design`; source baseline: `a2187cd1531e595816a044691ae76ee7930e1162`. Last verified production remains `2539796a7427175642d5b9e8c351382a4c18954c` from PR32; this report does not refresh production identity.

Implementation checkpoint: `0c27acfba59cd210ed1673648747bff03e9ba362`. A subsequent test-only lint binding correction is `a72275f5a95c0bcbb9c1c165d68591fe54257797`. Review fixes are at `94d6908433a038afe4e9003a76429a383d8528cf`. Final head and workflow evidence are recorded in [PR34](https://github.com/barsikdan-hue/Planly/pull/34) after checks finish; earlier heads are not evidence for a later head.

## Requirement coverage

| Requirement | Owning evidence |
|---|---|
| Strict 1–20 selection, Moscow minute/date/day/time boundaries, canonical offsets, no silent shifting | `scheduling-plan.test.ts`, existing `planner-slots.test.ts` |
| Owned snapshots, active Telegram/MAX eligibility, no history, account/content/media recheck, complete read-only preview | `scheduling-plan-preview.integration.test.ts` |
| Content/media/target preservation, one transaction, immutable receipt/replay after deletion/edit/disconnection/time passage | `scheduling-plan-commit.integration.test.ts` |
| Native owner locks, same-key serialization, competing same-provider slot claims, whole-batch rollback | Native PostgreSQL commit integration tests; no in-memory lock substitute |
| Authentication, CSRF custom header/site/JSON, safe strict errors, foreign/missing equivalence, no provider/tick call | `scheduling-plan-api.integration.test.ts`, `scheduling-plan-transport.test.ts`, existing auth tests |
| Individual review, ordering/filter independence, old preview/owner responses ignored, expired media review refresh | `scheduling-plan-state.test.ts`, `scheduling-plan-ui.test.mjs`, `scheduling-plan-app.test.mjs` |
| Per-operation pending storage, two lost-response records, immutable retries, unknown errors retained, clear only proven rejection | `scheduling-plan-recovery.test.ts`, UI tests |
| Known saved receipt remains saved after calendar refresh failure; retry refresh alone | UI behavior test; no second commit request |
| Existing Content Library, owner lifecycle, individual/manual publishing and scheduler recovery preserved | Existing regression tests plus canonical CI/Self-host |

## Local evidence

All new test groups were observed RED before their feature was implemented, then GREEN. Tests ran with Node 24.21.0; canonical CI retains Node 22.13.0.

- Task 1 contracts/allocation + existing slot unit tests: 11/11 PASS.
- Task 5 recovery/state + existing pending creation tests: 20/20 PASS.
- Task 2 preview + existing slot/content integration: 32/32 PASS.
- Task 3 native commit + scheduler reconcile/slot regression: 32/32 PASS.
- Final API/transport/auth check after bounded-body and receipt safety changes: 12/12 PASS, zero failures/cancellations/skips.
- Native receipt-safety/atomic commit rerun: 16/16 PASS, zero failures/cancellations/skips.
- UI/App focused: 9/9 PASS. Existing Content Library/owner lifecycle/Swipe Planner plus the preceding eight UI tests: 90/90 PASS; the ninth changed-fingerprint/late-owner test was added afterward and passed in the focused run.
- Typecheck: exit 0 after correcting new state/test typing. Focused lint: exit 0, one informational image warning.
- Additive migration `0008_scheduling_plans.sql` was generated and applied only to an isolated loopback native PostgreSQL 17.11 test database. `pnpm db:generate` reports no schema changes; migration files have no drift.

Local API tests substitute only the external queue-mirroring adapter through a test loader. Database/auth/route/transaction logic remain real. Native CI and Self-host provide real Redis/queue recovery evidence. No production dependencies, env values or provider credentials were copied into the fixture.

Local full lint was attempted but its final exit was unavailable after the exec session closed; it is NOT claimed as PASS. Exact native CI supplies the full lint result. Local full-suite execution requires Redis, which is unavailable in the isolated Windows fixture; it has not been represented as PASS. The post-review native rerun initially failed before assertions with ECONNREFUSED: the isolated PostgreSQL fixture process had exited for an unknown reason. The same verified fixture was restarted; native checks then passed 24/24. The fixture was cleanly stopped afterward. No production state changed. Local canonical build was attempted and stopped on the pre-existing external `node_modules` junction: Turbopack reported that the symlink points outside its filesystem root. No dependency layout, build contract, bundler flag, CI rule or timeout was changed to bypass this. Canonical build acceptance must come from exact-head CI/Self-host.

## Findings corrected during integration

1. Static route-test imports initially loaded the real queue before the test loader registration. The owned stuck test processes were stopped; mapper/service imports now occur after the test adapter is registered. No production injection hook was added.
2. A corrupt saved receipt raised a Zod input error and produced a clearable pre-commit response. A native regression test observed HTTP 422 where HTTP 500 was required. Saved receipt validation now raises an internal invariant failure, preserving uncertain operation recovery; original scheduled rows remain intact.
3. A valid JSON preview padded beyond 64 KiB returned HTTP 200. Both routes now use the existing bounded JSON utility, without importing analytics collection runtime; native regression proves safe rejection before preview work.
4. Canonical CI [37898195120](https://github.com/barsikdan-hue/Planly/actions/runs/37898195120) failed at lint on a new test variable named `module`. Migration drift/application and typecheck succeeded; Test and Build did not run. The test binding was renamed; the Next rule and assertions remain enabled. Subsequent native CI passed 1024/1024 tests with zero failures/cancellations/skips at `a72275f5a95c0bcbb9c1c165d68591fe54257797`. The documentation checkpoint `071484441dc6531c23a11dc83ba451edb8cbeed5` then passed both [CI 37898844188](https://github.com/barsikdan-hue/Planly/actions/runs/37898844188) and [Self-host 37898844096](https://github.com/barsikdan-hue/Planly/actions/runs/37898844096). These are intermediate results; later review fixes need fresh exact-head checks.

## Browser acceptance on 2026-10-09

Real Codex in-app Chromium browser, desktop viewport 1366×768 and mobile viewport 390×844. The browser rendered the actual `SchedulingPlan`, `Button`, client reducer/recovery/transport and `app/globals.css` from this checkout through an ignored Vite fixture. Only HTTP responses and drafts/accounts/media were synthetic. No production credentials, production database, worker, connector or provider endpoint was used. This proves local UI behavior, not production scheduling or provider delivery. Server transaction/recovery evidence remains separate in native tests/CI.

Fixture: four synthetic Telegram/MAX drafts, including a UUID-format post ID; base text and full override of 1851+ characters including a long unbroken word and end marker; locally generated SVG image and WebM video. Preview used the real slot allocator with the first 10:00 minute occupied. Explicit fixture commit saved only a synthetic receipt; lost-response mode saved that receipt and rejected the response. Recovery replay compared the original operation key and entire payload. Reload preserved only this fixture's synthetic local storage. No automatic request was made after reload.

| Browser requirement | Desktop | Mobile | Observed evidence |
|---|---|---|---|
| Select one and several drafts, preserve order | PASS | PASS | 1/3 selected; move controls update selection/preview order, including UUID post |
| Search/provider filter preserve selection | PASS | PASS | Hidden/no-match discovery retained selected IDs and order |
| Free-slot preview | PASS | PASS | Occupied first 10:00 skipped; 18:00 then following day slots shown in Moscow time |
| Full base text and provider overrides | PASS | PASS | End markers present, 16px mobile font, pre-wrap/anywhere; no truncation |
| Images/video | PASS | PASS | Image natural width nonzero; video native controls and 640px decoded video width, readyState 4; keyboard playback exercised |
| Separate review checkbox for every post | PASS | PASS | Confirm disabled at 0/1/2 of 3 checks; enabled only at 3 of 3 |
| Order/settings changes clear preview/review | PASS | PASS | Row count becomes zero, Confirm disabled; date/preset/time edits checked |
| Fresh success receipt | PASS | PASS | Ordered rows/application time visible after explicit confirmation |
| Uncertain response recovery | PASS | PASS | New plan blocked, original key/payload replayed unchanged, historical receipt shown |
| Reload recovery | Not separately repeated | PASS | Pending intent rediscovered without sending; explicit retry retrieves saved receipt |
| Horizontal overflow/readability | PASS | PASS | Final scrollWidth equals clientWidth: 1351/1351 desktop, 375/375 mobile, including recovery/UUID controls |
| Keyboard Tab/Space/Enter | PASS | PASS | Space selects/reviews, Enter previews/moves/confirms/retries, Tab reaches following enabled control |

Two defects were reproduced before fixes:

1. Mobile recovery expanded document width to 575px (client width 375px); UUID post move/remove controls separately expanded it to 413px. Root cause: shared `Button` supplies `white-space:nowrap` and fixed height; the long label increased the scheduling grid's intrinsic track width. Scoped CSS now allows wrapping, bounded width and automatic height only on scheduling recovery/order buttons. CSS regression observed RED then GREEN; real browser recheck proves 375/375 with fully visible multi-line labels. No clipping/overflow hiding was used.
2. A successful recovery displayed a receipt while retaining the obsolete uncertain-response alert. Root cause: `reduceSchedulingPlan`'s `COMMITTED` transition retained `error` from the preceding failed send. That transition now clears only the prior error after a validated acknowledgement. UI regression observed RED (one stale alert) then GREEN (zero); browser recheck on both sizes shows saved historical receipt, pending warning gone and zero alerts, with identical original key/payload.

Focused UI/App/state/recovery/CSS suite after both fixes: 20/20 PASS, zero failures/cancellations/skips. Focused ESLint and typecheck exited 0. Browser console error/warning query returned no entries. Viewport override reset, temporary smoke tab closed, fixture server stopped. Initial IAB navigation timed out; exposing the test browser allowed attachment without changing Planly code.

Screenshots: [desktop receipt](assets/phase9-browser/desktop-success.jpg), [mobile long text](assets/phase9-browser/mobile-text.jpg), [mobile media](assets/phase9-browser/mobile-media.jpg), [recovery before fix](assets/phase9-browser/mobile-recovery-before.jpg), [recovery after fix](assets/phase9-browser/mobile-recovery-after.jpg), [final mobile receipt](assets/phase9-browser/mobile-replay.jpg).

## Remaining gates and deferred work

- Independent whole-branch review is complete. It found no Critical issue and two concrete fixes: restored receipts must be labelled historical with application time, and fractional non-slot timestamps must reject before Date loses precision. Both new regression tests were observed RED, then GREEN in 26/26 pure/client tests. Typecheck and focused lint passed. Reviewer follow-up at `94d6908433a038afe4e9003a76429a383d8528cf` confirmed both fixes resolved, with 2/2 targeted tests PASS. Native API/commit/preview rerun passed 24/24 with zero failures/cancellations/skips. Final exact-head CI remains required.
- Exact final-head native CI and Self-host must both succeed, including full suite with zero failures/cancellations/skips, typecheck/lint/build, migration drift and scheduler recovery.
- Desktop/mobile local browser smoke PASS as recorded above. Earlier attachment failures are tool limitations, not UI defects. The new browser fixes require fresh exact-head CI/Self-host; earlier `9038b5e` passed native CI 37901026788 and Self-host 37901026671 before these changes.
- Keep PR34 draft until required verification is complete. Do not declare `READY_FOR_OWNER_MERGE_GATE` while a mandatory check remains unverified.
- Merge/deploy and production migration require separate Owner approval. Exact deployed SHA/health and production UI must then be verified. A real scheduling commit can trigger future provider work; obtain approval for concrete existing drafts, destinations and future times before a bounded provider smoke.
- Telegram analytics remains HOLD; VK/Instagram remain HOLD; CR07/CR08/GAP01 remain deferred. Existing Telegram/MAX publishing, individual content approval, manual flows and free scheduler remain in their accepted scope. Phase 9 adds no direct provider send, automatic approval/retry, recurring automation, AI, secrets/env or infrastructure changes.
