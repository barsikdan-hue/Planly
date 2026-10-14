# P01-A — publication and Post media isolation guards

Verification checkpoint,14 October2026. **CODE IMPLEMENTED / CRITIC CLEARED / FINAL INTEGRATION PENDING** at preparation. Source commits `4cf3039` and `4b56a6951a472e596533c9bc62c38400466d3c06`; base main `ce46b4a`. Subsequent final run URLs/status are recorded in the Draft PR description. This timestamped checkpoint does not claim production acceptance.

## Change and causality

`scheduler/processor.ts::readPublication → processPublication` previously joined scalar IDs without validating equal publication/post/account owner, target-to-post identity or provider. A/B fixtures demonstrated invalid graphs reaching publication. Media filtering silently dropped foreign attachments. `posts.ts::readOwnedPost` exposed foreign linked media IDs because it lacked the asset owner join. Normal create/update inputs already validate owner relations; a production leak/incident is **NOT PROVEN**.

The processor now validates the complete graph/media before claim and after claim, before storage/connector access. Invalid open work receives permanent `PUBLICATION_SCOPE_MISMATCH` without touching accounts or retrying. The first diagnosis locks and rereads the publication graph so an ordinary committed repair wins. A freshly claimed failure is conditional on that claim's attempt count/status. Terminal history and the existing PUBLISHING→AMBIGUOUS_DELIVERY rule remain. Post DTO joins mediaAssets by requesting owner and preserves ordered owned attachments.

No auth widening, schema migration, credentials, connector feature, shared Library or UI changes. This is a prerequisite; distinct user logins and100-user acceptance are not implemented or claimed.

## TDD and review evidence

| Checkpoint | Actual result |
|---|---|
| First test setup | FK cleanup order error; corrected fixture before treating results as RED |
| Baseline RED |29tests:21PASS/8FAIL/0SKIP; six invalid graphs, foreign DTO media, claim-time corruption failed; valid controls passed |
| Initial GREEN |113targeted PASS/0FAIL/0SKIP |
| Independent Critic,4cf3039 |Critical0/Important2: stale diagnosis after normal repair; postclaim metadata error outside catch |
| Review regression RED |32tests:30PASS/2FAIL/0SKIP; both findings reproduced with native edit lock/transport fixture |
| Intermediate review GREEN |Failed one obsolete UPDATE-text lock observer after guard switched to SELECT FOR UPDATE; replaced observer with actual pg_blocking_pids, unchanged5s bound and receipt assertions |
| Final targeted,4b56a69 |116PASS/0FAIL/0SKIP, native loopbackPG16.15/Redis7.2.16; worker/retry/reconciliation/edit/media/post tests included |
| Typecheck / lint / drift |PASS; lint0errors/15existing warnings; no schema changes |
| Fresh independent Critic,4b56a69 |Critical0/Important0/Minor0; inspected RED and final targeted logs, no DB/provider execution |

Meaningful coverage: initial/QUEUED invalid owners/provider/target/media, whole-send refusal, zero storage/connector calls, unchanged foreign account/post rows, terminal/PUBLISHING preservation, simultaneous claims, postclaim graph change, competing terminal receipt, normal updatePost repair race, one-shot metadata error followed by bounded safe recovery, scoped tick, A/B signing and ordered Post DTO.

## Integration and release boundary

Installed exact frozen lockfile in this worktree. Local host Node24.21/PG16.15; required CI/Self-host use Node22.13/PG17. The preliminary full local suite was intentionally stopped after the two Critic findings because its source required correction; it supplies no full PASS count. Final full suite/build/E2E and native exact-head CI/Self-host are separate pending checks at this checkpoint. No assertions, timeouts or retry budgets relaxed; no skipped tests added.

Source/main and LIVE differ; Render metadata LIVE remains `2f13a5ac`. Fresh health audit timed out. No production bootstrap, SQL/export, credentials, R2 control-plane operations, OAuth, provider sends, merge or deploy. The test fetch trap and fake connectors prevent external transport.

User approved invite-only access, manual identity-checked single-use recovery, minimal admin access-state/aggregate visibility and300s existing media bearer lifetime. Those future auth capabilities remain separate implementation work. After Draft PR evidence is green, next human action is review/merge gate for this foundation; deploy and real multiuser/provider acceptance remain separately gated.
