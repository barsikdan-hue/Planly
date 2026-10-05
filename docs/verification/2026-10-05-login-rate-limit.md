# CR-02 login rate-limit identity evidence

STATUS: INVESTIGATING / native RED pending. No runtime fix, merge/deploy or production login requests performed.

AUTHORITY: barsikdan-hue/Planly; fresh main95f53b7; work/Planly-login-rate-limit; branch codex/customer-ready-login-rate-limit. PR12 a3b8c31 remains READY, frozen, independent of this branch.

BRIDGE: direct gate sent to existing ChatGPT Planly chat; response GATE_ACCEPTED_PENDING_OWNER_APPROVAL. Orchestrator confirmed PR12 evidence and requested Owner approval there; no approval observed. Independent P0/P1 worktree allowed by user and Orchestrator.

ROOT_CAUSE_CANDIDATE: app/api/auth/login/route.ts::loginFingerprint returns `${ip}|${agent}`. checkLoginRateLimit/recordLoginFailure hash this key in PostgreSQL. Changing User-Agent changes bucket despite same address, defeating the existing per-client failure limit.

RED: pending actual native POST-handler tests, not a mocked fingerprint or production attack.
EXPECTED: five failed attempts for the same address accumulate across agent changes; sixth returns429 with Retry-After and no session. Existing success/expiry/independent-address behavior stays intact.
SCOPE: fingerprint only if proven; no schema, session, credential, middleware, proxy-trust, concurrent-admission or unrelated changes. Forwarded-header trust and actual production attack are NOT PROVEN here.
NEXT: push test-only DRAFT PR, inspect native RED, then minimal fix and full verification/review. GitHub stores evidence; browser ChatGPT receives gates only.
