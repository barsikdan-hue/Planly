# P04-B1-FIX01 — terminal 410 recovery

Status: LOCAL_FIX_PREPARED / CRITIC_PASS, with existing Windows full-suite/build limitations. No remote/source-release acceptance is implied.

## Contract and baseline

Owner-authorized local fix only: a confirmed `410 BATCH_RESULT_DELETED` must retain the original operation's terminal history and prohibit its resubmission, while allowing a different explicitly selected READY batch. Unknown, malformed and conflicting recovery must remain fail closed. No blanket localStorage cleanup, Scheduler/Worker/connector/schema changes, historical teardown repair, merge, deploy, migration or real-provider calls.

Baseline: `53116a42c0c7d560c3eeb804980abce2546e401c`, branch `codex/p04b1-library-batch-consent`; GitHub main/base `da7ad737a3236f1c161ae46c519386e05869f47a`. Local/remote refs matched and the worktree was clean before edits. Changes remain local and uncommitted under this contract.

## Root cause and bounded implementation

`readPendingLibraryBatch` used `entries.length > 0` as a global admission blocker, including known terminal results. Reload preserved the terminal record, and the UI offered no terminal lookup/retry or independent batch selection.

The fix retains terminal records but distinguishes history visibility from fresh-work blocking. Decoding rejects terminal result counts inconsistent with the intent and duplicate result IDs. Before a fresh dispatch, stored terminal intent hashes are validated; the current owner and terminal snapshot are rechecked after asynchronous hashing. The existing exact-operation comparison still rejects a stale caller carrying the pre-terminal pending object. Unresolved/unknown/conflicting entries remain blocking; nothing is blindly deleted.

Changed production files: `lib/library-batch-recovery.ts`, `components/planner/library-batch.tsx`. Regression files: `tests/library-batch-attempts.test.ts`, `tests/e2e/library-batch.spec.ts`. No existing assertions, timeouts or retries were weakened.

## RED / GREEN evidence

| Check | Observed result |
| --- | --- |
| Baseline unit RED: `node --test --experimental-strip-types --test-name-pattern='known terminal deletion permits' tests/library-batch-attempts.test.ts` | 1 test / 1 failure: expected `blocked=false`, actual `true`; source was still unchanged. |
| Baseline browser RED: `node node_modules/@playwright/test/cli.js test tests/e2e/library-batch.spec.ts --grep 'terminal 410 history' --project=desktop --reporter=line` | 1 test / 1 failure: unrelated READY checkbox remained disabled after 410 and reload. Original timeout unchanged. |
| Initial focused GREEN | 26/26 recovery/attempt/client tests; initial full B1 browser regression 40/40. |
| Critic correction RED: `node --test --experimental-strip-types --test-name-pattern='semantically corrupt terminal' tests/library-batch-attempts.test.ts` | 3 failures (`Missing expected rejection`) for wrong result count, duplicate results and inconsistent stored intent hash. No production patch preceded these tests. |
| Corrected focused GREEN: `node --test --experimental-strip-types tests/library-batch-attempts.test.ts tests/library-batch-recovery.test.ts tests/library-batch-client.test.ts` | 29 PASS / 0 FAIL / 0 SKIP. Covers terminal preservation, stale/original rejection, independent dispatch, unknown/corrupt/conflicting history and another owner's unchanged data. |
| Independent Critic | Initial CHANGES_REQUIRED for semantically corrupt terminal exemption; corrected diff PASS after independent 29/29 plus five in-memory state-change probes (owner switch, changed/new terminal, corrupt/new uncertain record), all with zero dispatch. No reviewer edits or external operations. |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 0. Incremental output disabled to preserve tracked `tsconfig.tsbuildinfo`. |
| Full lint | `node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next`: exit 0; 0 errors, 23 existing warnings. |
| Final browser after the corruption guard | Full `tests/e2e/library-batch.spec.ts`: 40 PASS / 0 FAIL, desktop/mobile, retries unchanged at 0; includes 410/reload/new READY regression and existing terminal/no-retry, two-tab, owner-switch, expiry and media cases. |
| Canonical build | `next build` under the existing synthetic test environment: exit 1, unchanged Windows Turbopack limitation: `node_modules` junction points outside the filesystem root. CSS guard was not reached. Vite browser build and full typecheck passed, but this is not canonical Next build PASS. No dependency, config, junction or guard was changed. |
| Full native | 1648 tests: 1647 PASS / 1 FAIL / 0 SKIP on Node v24.21.0. The sole failure is the unchanged Windows self-host initializer pathname issue, not a full-suite PASS. |

The first full-native attempt was deliberately interrupted when Critic found the corruption gap. It is not counted as PASS. A new complete run is required on the corrected source. The existing disposable PostgreSQL `planly_test` at loopback port 55671 was identified by cluster system ID `7697643804497503992`, matching the task's retained fixture baseline. Redis fixture uses loopback port 6387. No migration is needed or authorized.

## Limits and gates

This is local fixture evidence. Existing GitHub CI/Self-host results at `53116a4` predate this working-tree fix and must not be presented as verification of it. No push/CI rerun, merge, environment deploy, migration or real provider operation is performed by this contract. Historical runtime-teardown timeout remains `ROOT_CAUSE_NOT_PROVEN / NO FIX`.

Recovery with a structurally valid but hash-corrupted terminal may still show read-only preview controls; confirmation rejects before any commit/send. Browser storage is not a server-wide in-flight certificate and coherent malicious local modification is not authenticated by a client-only journal.

## Final local verification

Product/test patch fingerprint: `git diff HEAD -- lib/library-batch-recovery.ts components/planner/library-batch.tsx tests/library-batch-attempts.test.ts tests/e2e/library-batch.spec.ts | git hash-object --stdin` → `0ac2dc1132a63163512750915a73255313bdeca5`. This is a patch fingerprint, not a commit or runtime SHA.

Final full-native command: `node .superpowers/sdd/2026-10-17-p04b1-library-batch/run-node.mjs --test --test-concurrency=1 --experimental-strip-types tests/*.test.mjs tests/*.test.ts` under the existing synthetic fixture environment. Exit 1; 1648 tests, 1647 passed, 1 failed, 0 skipped. Failure: `tests/self-host-init.test.mjs:20`, `self-host setup writes private credentials, a usable password hash and literal dollar signs`. Its unchanged `script.pathname` at line 12 yields `MODULE_NOT_FOUND` for a Windows path beginning `C:\C:\...` and retaining `SMM%20Planer`. This is the same documented baseline class; no assertion/skip/path workaround was introduced. All seven added native cases passed.

Local logs are retained in the ignored `.superpowers/sdd/2026-10-17-p04b1-library-batch/` directory: `fix01-full-native-final.log`, `fix01-browser-final.log`, `fix01-lint.log`, `fix01-canonical-build.log`. The interrupted `fix01-full-native.log` is historical partial output only. No secret or real user content is included in this report.

Final `git diff --check` passed. The product/test patch fingerprint above is unchanged after Critic and final verification. Scheduler/Worker/connectors/schema/migrations, self-host initializer and tracked `tsconfig.tsbuildinfo` have no diff. HEAD remains `53116a42c0c7d560c3eeb804980abce2546e401c` with exactly four expected modified product/test files plus this new report.

Next gate: Owner review of this local diff/report, followed by separately scoped commit/push and exact-new-HEAD GitHub CI/Self-host verification if requested. Merge, deploy, persistent migrations and real provider reads/sends remain unauthorized. No new Lentaro phase started.
