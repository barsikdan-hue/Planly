# CR-02 login rate-limit identity evidence

STATUS: implementation verified; exact final documentation HEAD checks and Orchestrator merge gate follow in PR13. No merge/deploy or production login requests performed.

AUTHORITY: barsikdan-hue/Planly; fresh main95f53b7; work/Planly-login-rate-limit; branch codex/customer-ready-login-rate-limit. PR12 a3b8c31 remains READY, frozen, independent of this branch.

BRIDGE: direct gate sent to existing ChatGPT Planly chat; response GATE_ACCEPTED_PENDING_OWNER_APPROVAL. Orchestrator confirmed PR12 evidence and requested Owner approval there; no approval observed. Independent P0/P1 worktree allowed by user and Orchestrator.

ROOT_CAUSE: app/api/auth/login/route.ts::loginFingerprint returned `${ip}|${agent}`. checkLoginRateLimit/recordLoginFailure hash this key in PostgreSQL. Changing User-Agent changes the durable bucket despite the same address. The actual POST handler reproduced the bypass in native PostgreSQL CI.

BEHAVIORAL_RED: test-only0e44d38 [CI37336647464](https://github.com/barsikdan-hue/Planly/actions/runs/37336647464), job111853010546:457total/452PASS/5expectedFAIL/0skip. All446 baseline cases and six new controls passed. Five failures returned401 instead of429: rotating agent, changed/removed agent after exhaustion, unknown-address fallback, X-Real-IP fallback, and database reconnection across agent changes. No loader/setup failure; actual route, credential verification and PostgreSQL executed.

FIRST_TEST_ATTEMPT: test-only467c091 [CI37335958311](https://github.com/barsikdan-hue/Planly/actions/runs/37335958311):447total/446PASS/1loaderFAIL/0skip. Login file did not execute: native Node cannot resolve extensionless next/server. This is NOT behavioral RED. First test-onlybb21c55 [CI37335712691](https://github.com/barsikdan-hue/Planly/actions/runs/37335712691) same loader limitation. Initial connector lookups temporarily returned empty; public REST confirmed both runs.
HARNESS: test-local Node resolver maps only next/server to real next/server.js, then dynamically imports the actual production route. No auth/NextResponse/database mocks; production import unchanged. Independent review confirmed resolver fidelity and test-file isolation.
PR: https://github.com/barsikdan-hue/Planly/pull/13 — DRAFT. Eleven native route tests; test-only local/native typecheck PASS.
IMPLEMENTED: loginFingerprint now returns the existing selected client address without User-Agent. No rate-limit algorithm or address-selection changes. A premature local fingerprint edit was reverted when first-attempt logs revealed the loader failure, before any push; the committed implementation follows the real behavioral RED above.
EXPECTED: five failed attempts for the same address accumulate across agent changes; sixth returns429 with Retry-After and no session. Existing success/expiry/independent-address behavior stays intact.
SCOPE: fingerprint only if proven; no schema, session, credential, middleware, proxy-trust, concurrent-admission or unrelated changes. Forwarded-header trust and actual production attack are NOT PROVEN here.
REVIEW: test-only review found no blocking issue; added actual session-count and existing forwarded-first/X-Real-IP fallback controls. Rollout limitation: changing hashed fingerprint namespace makes old per-agent counters inaccessible, allowing a one-time fresh failure allowance after upgrade; no schema/migration or cross-version continuity claim. Existing fifteen-minute window remains. Merge/deploy gate must include this limitation.

LOCAL_GREEN: fresh typecheck PASS; ESLint0errors/13existingwarnings; protected pure suite277/277PASS/0fail/0skip; webpack production build PASS. Native database tests and standard build remain GitHub CI authority. Independent full-branch adversarial review of tests plus minimal runtime diff found no actionable issue.

NATIVE_GREEN: implementation HEADbd4dc04e7b8a6203604c21d69bbcecaf29a7f703 [CI37338319814](https://github.com/barsikdan-hue/Planly/actions/runs/37338319814), job111858654729 completed SUCCESS:457/457PASS/0fail/0skip, targeted login11/11 within full suite; migration drift/apply, typecheck, lint0errors/13knownwarnings and standard production build PASS.

RUNTIME_GREEN: same implementation HEAD [Self-host37338319497](https://github.com/barsikdan-hue/Planly/actions/runs/37338319497), job111858652723 completed SUCCESS. Docker web/worker, foundation HTTP/login/private media smoke, actual worker private bytes, stack recreation with PostgreSQL/media persistence, Redis-loss reconciliation, unsupported-provider result and packaged Next.js artifact PASS. Telegram-live job intentionally skipped; no provider messages. This is isolated self-host evidence, not Render/production acceptance.

DELIVERY: one runtime file (login route), one integration test file, plan and this report. Clean tree after restoring generated tsconfig.tsbuildinfo; remote main95f53b7 and PR12a3b8c31 unchanged. Final docs commit repeats exact-HEAD native/Docker checks; links/results live in canonical PR13 body before READY. Production remains NOT PROVEN for this patch until Owner-approved merge/deploy and browser verification.
NEXT: freeze PR13 READY only after exact final HEAD checks pass, send MERGE_DEPLOY gate through existing ChatGPT chat and read response. Owner must approve there before any gated operation. Continue independent P0/P1 separately; no additional production login testing or provider sends to prove this pre-merge fix.
