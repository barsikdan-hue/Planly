# CR-02 login rate-limit identity evidence

STATUS: INVESTIGATING / behavioral native RED pending. No runtime changes, merge/deploy or production login requests performed.

AUTHORITY: barsikdan-hue/Planly; fresh main95f53b7; work/Planly-login-rate-limit; branch codex/customer-ready-login-rate-limit. PR12 a3b8c31 remains READY, frozen, independent of this branch.

BRIDGE: direct gate sent to existing ChatGPT Planly chat; response GATE_ACCEPTED_PENDING_OWNER_APPROVAL. Orchestrator confirmed PR12 evidence and requested Owner approval there; no approval observed. Independent P0/P1 worktree allowed by user and Orchestrator.

ROOT_CAUSE_CANDIDATE: app/api/auth/login/route.ts::loginFingerprint returns `${ip}|${agent}`. checkLoginRateLimit/recordLoginFailure hash this key in PostgreSQL. Changing User-Agent changes bucket despite same address; behavioral native proof still required.

FIRST_TEST_ATTEMPT: test-only467c091 [CI37335958311](https://github.com/barsikdan-hue/Planly/actions/runs/37335958311):447total/446PASS/1loaderFAIL/0skip. Login file did not execute: native Node cannot resolve extensionless next/server. This is NOT behavioral RED. First test-onlybb21c55 [CI37335712691](https://github.com/barsikdan-hue/Planly/actions/runs/37335712691) same loader limitation. Initial connector lookups temporarily returned empty; public REST confirmed both runs.
HARNESS: test-local Node resolver maps only next/server to real next/server.js, then dynamically imports the unchanged production route. No auth/NextResponse/database mocks; production source untouched. Await actual native behavioral RED.
PR: https://github.com/barsikdan-hue/Planly/pull/13 — DRAFT. Eleven native route tests; test-only local/native typecheck PASS.
IMPLEMENTED: no committed/runtime fix. A premature local fingerprint edit was reverted when full logs revealed the loader failure, before any push. Behavioral proof is required first.
EXPECTED: five failed attempts for the same address accumulate across agent changes; sixth returns429 with Retry-After and no session. Existing success/expiry/independent-address behavior stays intact.
SCOPE: fingerprint only if proven; no schema, session, credential, middleware, proxy-trust, concurrent-admission or unrelated changes. Forwarded-header trust and actual production attack are NOT PROVEN here.
REVIEW: test-only review found no blocking issue; added actual session-count and existing forwarded-first/X-Real-IP fallback controls. Rollout limitation: changing hashed fingerprint namespace makes old per-agent counters inaccessible, allowing a one-time fresh failure allowance after upgrade; no schema/migration or cross-version continuity claim. Existing fifteen-minute window remains. Merge/deploy gate must include this limitation.
NEXT: push test-only DRAFT PR, inspect native RED, then minimal fix and full verification/review. GitHub stores evidence; browser ChatGPT receives gates only.
