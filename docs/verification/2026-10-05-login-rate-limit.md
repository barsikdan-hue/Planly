# CR-02 login rate-limit identity evidence

STATUS: VERIFYING / native behavioral RED proven, minimal fix implemented. No merge/deploy or production login requests performed.

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

LOCAL_GREEN: fresh typecheck PASS; ESLint0errors/13existingwarnings; protected pure suite277/277PASS/0fail/0skip. Native database tests and standard build remain GitHub CI authority. Independent full-branch adversarial review of tests plus minimal runtime diff found no actionable issue.
NEXT: verify local protected checks, push minimal fix, inspect native full GREEN and Docker runtime, then independent review and exact-final-HEAD evidence. GitHub stores evidence; browser ChatGPT receives gates only.
