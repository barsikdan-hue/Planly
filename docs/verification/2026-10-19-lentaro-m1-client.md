# Lentaro M1 C/D — local candidate evidence

2026-10-19. Client source `85393815dd917d78de77b8dc7fdbf980ffc00388`; content `628f42255446ba7cfeaa8069839761566588d2e8`; portable byte protection/test `59d1589`. Baseline is #68 `6cf369b`, server source `1c0d7df`; [server report](2026-10-19-lentaro-m1-server.md). Local candidate evidence, not live acceptance.

UI reuses SwipePlanner, existing connected-account/slot API and personal Post details/cancellation. New `#feed` consumes one atomic shared decision endpoint; it does not invoke public copy then create. Onboarding/navigation/login/invite/settings carry Lentaro labels; existing personal Library/manual editor/B1 stay available. Shared UI exposes Telegram/MAX only; independent outcomes remain existing per-target state.

Recovery stores exact input before network, scopes keys to the owner and operation, verifies storage readback, validates response identity and keeps uncertain operations for explicit same-key replay. Unknown/auth/access failures remain recoverable. Recognized stale/source/slot rejection retains refused history. Terminal 410 retains history and permits independent future work; no resurrection. Old-owner responses cannot announce success. Corrupt or unwritable journals fail closed.

## Focused checks

- New recovery tests observed initial RED 5/5 before implementation, then GREEN. Additional access-loss/unknown-conflict regression observed RED before tightening refusal classification, then GREEN. Final recovery 6/6; navigation 5/5; combined 11 PASS / 0 FAIL / 0 SKIP.
- TypeScript whole-worktree `tsc --noEmit`: exit 0. Initial attempt died from local allocation failure with only ~320 MiB free commit; no code defect inferred. After memory availability changed, completed typechecking exposed the outcome-union narrowing error; splitting distinct status variants fixed it and subsequent checks passed.
- Focused ESLint of changed/new UI/recovery: exit 0 after removing synchronous effect state updates and correcting one const declaration. Existing Next navigation/img warnings remain warnings, no rule disabled.
- `node node_modules/@playwright/test/cli.js test tests/e2e/shared-feed.spec.ts --reporter=line`: **20 PASS**, 10 scenarios across desktop/mobile projects, ~1.5 minutes; 390/320 width coverage. API fixture rejects external/unexpected operations and validates persisted exact POST payload. Tests cover direct LIKE/calendar without copy API, private DISLIKE/A-B, lost reply/reload/same key, terminal410, stale409, no slot, full text, keyboard/touch gesture, direct deep link and owner switch while awaiting reply.
- Browser test development corrected fixture selectors, preserved existing selected-button state and bounded stale-source test ordering. These were test-authoring errors, not product RED; no retrospective implementation RED is claimed. Single-file browser ESLint passed; retries/timeouts/assertions were not weakened.
- Vite build is a synthetic frontend harness, not canonical Next compilation or staging. Local dependency install was unavailable (offline policy metadata, then slow/erroring locked registry access). Reused verified dependency junction supports local tests; canonical Windows Next/Turbopack has the known outside-root junction limitation. Linux CI/Self-host canonical builds remain required.

## Editorial issue

[Portable approved issue](../editorial/lentaro-m1-2026-10-19/README.md): 3 exact Russian texts and 3 selected JPEG portraits, independent fact-checker and editorial/visual critic READY bound to frozen snapshot `20a88854db86330940ed164ac58b1389abcee05d215fc6a09f620eeb10b40c56`. ACCEPTED_LOCAL 3/3; original standalone package check 76/76, portable check 112/112. Original PNGs and unused mobile/square exports remain external; compact metadata explicitly describes this projection. No runtime upload or schedule/provider entitlement was inferred.

`tests/editorial-pilot.test.ts` checks every portable manifest byte/hash and exactly three payload texts/images; PASS. `.gitattributes` prevents checkout line-ending conversion from invalidating reviewed byte identity. Existing upload/create/share APIs are retained; new compiled `shared-feed-http-smoke.mjs` exercises a synthetic ADMIN upload → idempotent Library create → share → USER A/B decisions → private calendar/media/cancellation, worker-free. Its canonical compiled execution is required in CI and was not yet run at this document capture.

## Candidate gates

Final integrated native/typecheck/lint/canonical build/compiled HTTP/browser CI, Self-host and independent whole-M1 review remain required. Track exact source versus GitHub synthetic-merge runtime tree in the Draft PR; this report does not predict PASS. [Bounded release package](2026-10-19-lentaro-m1-release.md) holds separate staging/data/provider gates. Real external provider calls/sends during these checks: 0.
