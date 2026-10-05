# Stable login rate-limit identity — CR-02

Use systematic-debugging, executing-plans, TDD, independent review and verification-before-completion.

Base: main95f53b7. Separate worktree/branch codex/customer-ready-login-rate-limit. PR12 remains frozen READY at a3b8c31; this task has no retry/scheduler dependency.

Contract: a caller must not gain another login failure allowance just by changing/removing User-Agent. Preserve the existing five failures / fifteen minutes, success reset, expiry, response/cookie contract, client-address separation and PostgreSQL persistence.

Execution: login route derives fingerprint → checkLoginRateLimit hashes key → credential verification → record failure/clear success. First candidate broken layer is loginFingerprint including client-controlled User-Agent in durable bucket identity.

Scope: login fingerprint only if native route RED proves the bypass; existing DB schema/rate-limit algorithm retained. Exclude proxy trust changes, IP header spoofing assumptions, concurrent admission redesign, auth credentials/secrets, middleware/session changes, UI, PR12 and infrastructure. Production/proxy exploitability is NOT PROVEN by synthetic route headers.

- [ ] Native actual POST handler regressions for rotating/removing agent and reconnection, with normal expiry/success/independent-client controls; push test-only DRAFT PR and inspect RED.
- [ ] Minimal stable identity fix, with no client-controlled User-Agent component.
- [ ] Native full suite/typecheck/lint13knownwarnings/standard build and Docker HTTP/login/private-media/persistence/recovery. Verify exact final HEAD.
- [ ] Independent adversarial review, bounded diff/clean tree, report/PR updated, ready only after full GREEN.
- [ ] Send merge gate through existing ChatGPT browser bridge, read response. Merge/deploy require direct Owner approval there; continue independent campaign tasks separately.

Human gates: merge/deploy, secrets/infra, schema/product/architecture outside this contract. A distinct proven root requires a separate task; ambiguous policy requires Orchestrator decision, never silently expand scope.
