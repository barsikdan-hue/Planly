# VK OAuth permissions — bounded repair, 6 November 2026

**Authorization:** user explicitly resumed checking and fixing after the read-only audit. One native consent check is limited to owned app54809413 and returned safe scope/status fields. No upload/save/post, production/staging mutation, secrets/config change, merge or deploy is included.

**Baseline:** existing isolated branch codex/lentaro-vk-audit-fixes-20261105, HEAD14391ea8adab113f791584bae60b2abc92837dac; known untracked evidence preserved. PR80 remains Draft. Prior exact-SHA CI unit PASS, seven isolated PG17/Redis7 suites88/88PASS, broad suite1970/1971: stale owner-only OAuth expectation in multiuser-auth integration test. Full compiler/lint/build not reached in that job.

**Fresh official evidence:** user supplied complete VK ID API reference; browser read of the exact support link also succeeded on6November. It defines space-separated scope, explicit prompt=consent, exact state roundtrip and service_token for confidential apps. Refresh request without scope inherits the refresh token's scope; this is distinct from absent response.scope. Current code fabricates response scope from prior stored labels and accepts absent response.state. Neither proves the historical live cause; both violate the intended explicit proof contract.

## Execution

- [ ] TDD: require explicit returned scopes on initial and refreshed grants; reject absent/partial metadata, retain UNCERTAIN after uncertain rotation, never silently reuse old refresh credentials.
- [ ] TDD: require returned state equality; update synthetic fixtures to echo the actual requested state, preserving existing rejection assertions.
- [ ] TDD: request explicit consent on user-initiated OAuth without changing client IDs, permission set, PKCE or grant storage.
- [ ] Correct the obsolete multiuser regression expectation for authorized personal VK OAuth; keep Telegram/MAX owner restrictions and cross-user/private credential/zero-send checks.
- [ ] Unit/contract gate first; then exact-source disposable PostgreSQL17/Redis7 seven-suite and full regression/typecheck/lint/build through the existing attested runner. Do not run integration on staging/production.
- [ ] Independently review source and safe evidence; update CURRENT_STATE and a new dated report; push only this task branch and update Draft PR80. No merge/deploy/provider publication.
- [ ] Native app54809413 consent: user observes wall/photos/groups plus phase/code only. No token values; actual successful write-method capability remains a separate proof.

**Tools:** shell/Git for bounded source/TDD; GitHub for existing artifacts, exact CI and Draft PR; public documentation for OAuth contract; existing native Mini App for user consent. Computer-use inability to verify Chrome URL is a tool blocker, not a product defect; no security bypass.
