# Phase 9 batch scheduling — implementation verification

Status: IMPLEMENTED IN DRAFT PR34; release verification in progress. No production acceptance, merge, deploy, production migration or provider publication has been performed.

Owner approved the specification at `7d2577746a7a35afc5afce8cc3a1a12c511234b6` and the implementation plan at `3217d13a633df27d7d7d8f84c7612571b4118582`, selecting native execution in this chat on 2026-10-09. Repository: `barsikdan-hue/Planly`; branch: `codex/phase9-scheduling-design`; source baseline: `a2187cd1531e595816a044691ae76ee7930e1162`. Last verified production remains `2539796a7427175642d5b9e8c351382a4c18954c` from PR32; this report does not refresh production identity.

Implementation checkpoint: `0c27acfba59cd210ed1673648747bff03e9ba362`. A subsequent test-only lint binding correction is `a72275f5a95c0bcbb9c1c165d68591fe54257797`. Final head and workflow evidence are recorded in [PR34](https://github.com/barsikdan-hue/Planly/pull/34) after checks finish; earlier heads are not evidence for a later head.

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

Local full-suite execution requires Redis, which is unavailable in the isolated Windows fixture; it has not been represented as PASS. Local canonical build was attempted and stopped on the pre-existing external `node_modules` junction: Turbopack reported that the symlink points outside its filesystem root. No dependency layout, build contract, bundler flag, CI rule or timeout was changed to bypass this. Canonical build acceptance must come from exact-head CI/Self-host.

## Findings corrected during integration

1. Static route-test imports initially loaded the real queue before the test loader registration. The owned stuck test processes were stopped; mapper/service imports now occur after the test adapter is registered. No production injection hook was added.
2. A corrupt saved receipt raised a Zod input error and produced a clearable pre-commit response. A native regression test observed HTTP 422 where HTTP 500 was required. Saved receipt validation now raises an internal invariant failure, preserving uncertain operation recovery; original scheduled rows remain intact.
3. A valid JSON preview padded beyond 64 KiB returned HTTP 200. Both routes now use the existing bounded JSON utility, without importing analytics collection runtime; native regression proves safe rejection before preview work.
4. Canonical CI [37898195120](https://github.com/barsikdan-hue/Planly/actions/runs/37898195120) failed at lint on a new test variable named `module`. Migration drift/application and typecheck succeeded; Test and Build did not run. The test binding was renamed; the Next rule and assertions remain enabled. Subsequent exact-head checks must pass before release.

## Remaining gates and deferred work

- Independent whole-branch review is in progress; actionable findings must be resolved and verified.
- Exact final-head native CI and Self-host must both succeed, including full suite with zero failures/cancellations/skips, typecheck/lint/build, migration drift and scheduler recovery.
- Desktop/mobile local browser smoke is NOT VERIFIED. Two CUA webview attachment attempts timed out; opening the synthetic local UI through Codex returned `queued` because this chat was hidden. Owner was asked to open this chat. The fixture prohibits commit requests and contains only synthetic drafts/media/destinations. Behavior tests are not a substitute for visual/keyboard acceptance.
- Keep PR34 draft until required verification is complete. Do not declare `READY_FOR_OWNER_MERGE_GATE` while a mandatory check remains unverified.
- Merge/deploy and production migration require separate Owner approval. Exact deployed SHA/health and production UI must then be verified. A real scheduling commit can trigger future provider work; obtain approval for concrete existing drafts, destinations and future times before a bounded provider smoke.
- Telegram analytics remains HOLD; VK/Instagram remain HOLD; CR07/CR08/GAP01 remain deferred. Existing Telegram/MAX publishing, individual content approval, manual flows and free scheduler remain in their accepted scope. Phase 9 adds no direct provider send, automatic approval/retry, recurring automation, AI, secrets/env or infrastructure changes.
