# Phase 9 batch scheduling — production acceptance and implementation verification

Current status: **PHASE 9: DONE / PRODUCTION ACCEPTED**, 2026-10-09. PR34/PR35 are merged/deployed; main and Render LIVE are `fba293376e3ef502e52a6f8567dc813ed119a532`, health HTTP 200. A real production UI acceptance saved one reviewed two-post batch, verified receipt/reload/preservation and safely removed both disposable fixtures and their new media. Provider sends 0 within this bounded scheduling acceptance. No provider publication was performed. The closure change updates documentation only; no merge/deploy or new milestone is authorized.

Owner approved the specification at `7d2577746a7a35afc5afce8cc3a1a12c511234b6` and the implementation plan at `3217d13a633df27d7d7d8f84c7612571b4118582`, selecting native execution in this chat on 2026-10-09. Repository: `barsikdan-hue/Planly`; historical implementation branch: `codex/phase9-scheduling-design`; source baseline: `a2187cd1531e595816a044691ae76ee7930e1162`. PR32 production `2539796a7427175642d5b9e8c351382a4c18954c` was the earlier baseline; the production acceptance below supersedes that identity.

## Production acceptance — 2026-10-09

Render deploy `dep-db4bo65g1s2s738u6sj0` is LIVE at exact main SHA `fba293376e3ef502e52a6f8567dc813ed119a532`, finished `2026-10-09T10:06:48.632994Z`. Fresh Git main/source checks and read-only Render deploy lookup matched. `/api/health` returned HTTP 200 again after cleanup. Checkout was clean before creating the documentation-only closure branch.

Owner explicitly authorized two disposable production DRAFT fixtures and cleanup through existing product flows. Settings discovery found the real connected destinations below. Owner confirmed these exact Telegram/MAX destinations before scheduling; “Агент без галстука” is a static composer/dashboard label, not the saved account name. That unrelated label was not changed.

- Telegram: `-1004390954741`; MAX: `-78857616977254`; saved display name for both: `«Данил | Недвижимость у моря»`, enabled and CONNECTED.
- A: `PHASE9_ACCEPTANCE_A`, post `114452f4-8516-46a1-816d-cbec1a044966`, 979 characters of synthetic text, no media. Normal Composer POST `/api/posts` returned 201.
- B: `PHASE9_ACCEPTANCE_B`, post `792d831a-fe67-439f-af4b-f264b8ace371`, 95 characters of synthetic text and newly generated PNG `PHASE9_ACCEPTANCE_B.png`, media `572d6f1a-7cb4-436b-b0df-005398e5ddfc`. Normal upload and Composer creation both returned 201. PNG: 320×200, 1266 bytes, SHA256 `5f5f2986ff99ef477f04d2111c6a48e200da008d619b60dd40e9ff9abe5bbd0a`. No published/user media was reused.

| Production acceptance | Result / observed evidence |
|---|---|
| Pre-commit safety | Fresh GET `/api/posts`: exactly these two new posts DRAFT; four active targets have `scheduledAt=null`, `publication=null`; originals unchanged. Correct preview revalidated both DRAFT snapshots/accounts with no eligibility issue. |
| No pre-existing publication jobs | New post/target IDs, no publication history, and deployed creation/reconciliation path: DRAFT cannot create a publication row or queue job. Read-only preview requires no history. No raw Redis enumeration is claimed. |
| Selection/order/preview | Real production Codex browser selected A then B. HTTP 200 preview preserved order, full text/end markers, original media and target IDs; both destination IDs visible. PNG decoded 320×200. |
| Safe slots | A `2026-10-11T07:00:00.000Z` (10:00 Moscow); B `2026-10-11T15:00:00.000Z` (18:00 Moscow). Earliest slot was over 43 hours ahead immediately before commit, exceeding +24h. Both rows issue-free. |
| Individual review gate | Confirm disabled at 0/2 and 1/2 checks; enabled only at 2/2. Each row was separately reviewed. |
| Atomic commit/receipt | One button activation, one POST `/api/scheduling-plans/commit`, HTTP 200, `replayed=false`. One receipt, operation `59f518de-6813-40f1-a30b-255755062bbd`, applied `2026-10-09T11:11:35.410Z`, two ordered rows/four original target IDs and exact preview timestamps. UI displayed “План сохранён: 2 постов”. |
| Persistence/reload | Following GET and fresh reload/bootstrap showed both READY, each target SCHEDULED at the expected timestamp, `remoteId/remoteUrl/error=null`. Text/media/target/account IDs and overrides unchanged. UI showed exactly two scheduled cards at 11 October 10:00/18:00. |
| Duplicates | 0 observed: one commit response, one operation receipt, two unique post rows/four unique target IDs, exactly the two expected scheduled cards after reload; native transaction/history constraints supply duplicate protection. No unperformed raw database duplicate query is claimed. |
| Provider sends | 0 for this probe, established by fresh DRAFT/no-history state, future SCHEDULED states without remote IDs, the exact deployed no-send commit path and due-only/delayed scheduler path, then cancellation before either slot. No provider call, Publish Now, synthetic callback or manual scheduler tick was used. This is bounded state/source evidence, not an independent provider traffic counter or a new delivery acceptance. |
| Cleanup | Normal edit → Save DRAFT returned 200 for each post: four publications CANCELLED, target schedules null, remote IDs null. Only then normal post DELETEs returned 204; normal unreferenced-media DELETE returned 204. Reconciliation removes the delayed jobs before deletion; no direct DB/Redis/storage workaround. |
| Final cleanup reload | Both fixture IDs and disposable media absent; no test schedule. Original two-post DTO SHA256 before/after exactly `5b25e900647ec731439d3a6a927cdb4eeb92c65834b4f75eae5b4ff1817b98f8`. Remaining media metadata (excluding expiring signed URLs), accounts and library exactly unchanged. Blank local composer recovery contained zero characters and no fixture media; it did not recreate a server post. |

Safety source inspected at the deployed SHA: `app/api/posts/route.ts`, `app/api/scheduling-plans/commit/route.ts`, `lib/server/scheduling-plan-commit.ts`, `lib/server/publications.ts`, post update/delete and media deletion flows, `lib/server/scheduler/tick.ts`, `queue.ts`, `reconcile.ts`. Commit validates locked snapshots/history/slots and persists posts/publications/immutable receipt in one transaction; after commit it mirrors delayed queue changes without invoking a provider. Tick admits only due publications; queue delay is derived from the scheduled timestamp. Cleanup first saves DRAFT, cancelling open publications/removing jobs, before deleting disposable records.

Direct Render PostgreSQL inspection was unavailable because external access is blocked by its current IP allowlist. No allowlist, env, secret or infrastructure change was made. Safety evidence uses the authenticated normal product responses and exact deployed data flow; no direct DB/queue counts or provider telemetry are invented.

Automation deviation: browser `fill` on date inputs changed DOM values without updating React settings; initial read-only preview therefore returned nearer dates. No commit used that preview. A normal keyboard ArrowUp/ArrowDown change reproduced a React update, cleared preview, and the next HTTP preview returned exactly 11 October 10:00/18:00. This was a browser-driver input limitation; no speculative product fix or code change was made.

## PR35 CSS incident closure

Historical stale Render CSS root cause remains **NOT PROVEN / NOT REPRODUCED**. The diagnostic rebuild served correct CSS; this does not prove a cache/compiler mechanism. PR35 is a verification/release guardrail, not a root-cause fix. No speculative runtime, compiler, cache, CSS, env or infrastructure fix was added.

At current merged production SHA `fba293376e3ef502e52a6f8567dc813ed119a532`, Render build log `2026-10-09T10:04:53.849839092Z` emitted `ANALYTICS_CSS_OK`: source CSS SHA256 `64b5bd607270b83d4bf3da8f5cea1c8d1519b222fc46a0a39978486cfa393ef0`; root-linked asset `/_next/static/chunks/2mon2c_vzimn7.css`, 200977 bytes, SHA256 `b9671e3e5ebf8a8159852479b565412d9373e557b5e185f95cbfb9bc109bd657`. All 13 analytics/Phase 9 contract booleans PASS. Production DOM links that same asset; a fresh HTTP 200 read after acceptance produced the identical SHA256 and all 13 checks PASS using the actual release CSS parser/contract. Current build/runtime are healthy, with guardrail active. [Historical investigation](2026-10-09-phase9-release-css-investigation.md).

## Closure boundaries

PR34 release verification and the bounded production acceptance are complete. The historical local desktop/mobile, video and fault/recovery checks below retain their original scope; production acceptance used real UI/API and a new image, without injecting failures or testing provider delivery. This report does not relabel local synthetic recovery/video evidence as production proof.

This closure changes only this report, ROADMAP and AGENTS. Telegram analytics remains HOLD / Phase 8 PARTIALLY ACCEPTED; VK and Instagram remain HOLD; AI REMOVED; CR07/CR08/GAP01 remain not started. Phase 10 requires proven hosting need and separate Owner decision. No new phase, merge/deploy, provider sends, env or infrastructure work is authorized by closure.

## Historical implementation evidence

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

## Historical pre-release gates and deferred work

The release/production gates in the historical checklist below were subsequently completed through PR34/PR35 and the bounded production acceptance above. They describe the earlier implementation checkpoint, not current unfinished PR34 work. Deferred unrelated milestones remain unchanged.

- Independent whole-branch review is complete. It found no Critical issue and two concrete fixes: restored receipts must be labelled historical with application time, and fractional non-slot timestamps must reject before Date loses precision. Both new regression tests were observed RED, then GREEN in 26/26 pure/client tests. Typecheck and focused lint passed. Reviewer follow-up at `94d6908433a038afe4e9003a76429a383d8528cf` confirmed both fixes resolved, with 2/2 targeted tests PASS. Native API/commit/preview rerun passed 24/24 with zero failures/cancellations/skips. Final exact-head CI remains required.
- Exact final-head native CI and Self-host must both succeed, including full suite with zero failures/cancellations/skips, typecheck/lint/build, migration drift and scheduler recovery.
- Desktop/mobile local browser smoke PASS as recorded above. Earlier attachment failures are tool limitations, not UI defects. The new browser fixes require fresh exact-head CI/Self-host; earlier `9038b5e` passed native CI 37901026788 and Self-host 37901026671 before these changes.
- Keep PR34 draft until required verification is complete. Do not declare `READY_FOR_OWNER_MERGE_GATE` while a mandatory check remains unverified.
- Merge/deploy and production migration require separate Owner approval. Exact deployed SHA/health and production UI must then be verified. A real scheduling commit can trigger future provider work; obtain approval for concrete existing drafts, destinations and future times before a bounded provider smoke.
- Telegram analytics remains HOLD; VK/Instagram remain HOLD; CR07/CR08/GAP01 remain deferred. Existing Telegram/MAX publishing, individual content approval, manual flows and free scheduler remain in their accepted scope. Phase 9 adds no direct provider send, automatic approval/retry, recurring automation, AI, secrets/env or infrastructure changes.
