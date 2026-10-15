# PR59 aggregate-copy reliability correction

Owner-approved correction on the existing P03-B branch, baseline `da80d5e943bb79c59bae190073925849339d7e5b`. No new PR, migration, worker, scheduler, authorization or publishing changes.

## Cause and approved behavior

`copySharedLibrary` held actor/source/media locks throughout sequential private storage GET/PUT. The old per-item bounds admitted 400 attachment copies / 7.8125 GiB source bytes, with a fresh 30s GET and PUT timeout for every occurrence. The preceding isolated latency probe demonstrated a transaction still holding locks after 30.858s and blocking another user's catalog and a source edit.

The approved guard now counts all attachment occurrences after locked ownership/media validation and rejects more than 20 files or 100 MiB with sanitized HTTP422 before any destination INSERT/GET/PUT. The existing 20 selected-item limit is unchanged. Reused source assets count once per copy occurrence. Exact limits remain inclusive. Receipt replay still precedes source/admission checks.

One 60s AbortSignal deadline covers forward GET/PUT for the batch. The existing storage reader accepts an optional external signal combined with its 30s timeout; PUT likewise combines the shared deadline with its existing 30s limit. Every new GET/PUT checks cancellation first. No Promise.race is used to abandon live production I/O. Rollback compensation keeps independent 30s DELETE limits. An expired forward deadline returns sanitized HTTP504 after rollback/cleanup; cleanup failure keeps its existing explicit error. Uncertain COMMIT still reconciles the durable receipt before deleting any objects; unresolved outcomes preserve objects and require the same key.

This is not a hard 60s HTTP/transaction bound: pool/SQL/locks, finalization, cleanup and reconciliation are outside the forward-storage deadline. Real storage behavior after transport cancellation is not production-verified.

The UI maps only recognized error codes to fixed Russian messages; it never renders upstream error text or storage keys. It explains both aggregate limits, including the case of one oversized material. Timeout/ambiguous failure retains the original intent/key; no automatic new copy or partial text-only fallback.

## RED/GREEN evidence

Command: `.sites-runtime/p02/run.ps1 -Mode test -Files tests/shared-library.integration.test.ts,tests/shared-library-ui.test.mjs` (PowerShell passes the two paths as an array).

- RED: 26/33 pass; seven expected failures: 21 files incorrectly returned201, excess bytes reached storage and returned502, cumulative deadline did not cancel stalled GET headers/body or PUT, and UI had no specific messages.
- GREEN: 33/33 pass, fail0/skip0, including actual 100 MiB transfer in 20 independent files across two selected materials; both oversize failures assert zero GET/PUT/DELETE and no personal rows/receipt; deterministic cumulative-clock transport faults assert real network cancellation, DB rollback, compensation, no publication creation and same-key retry after confirmed rollback.
- Existing coverage remains: individual30s PUT/DELETE cancellation, storage/cleanup failures, genuine lost-COMMIT response and unreadable reconciliation, concurrent same-key replay, unshare/edit/delete races, native ADMIN/A/B ownership and expired/blocked sessions. The individual-timeout observer was adapted to composed signals and still asserts actual transport cancellation at30s.
- The initial local attempt used a fixture PostgreSQL started accidentally on5432 rather than55631; it is not product RED evidence. That owned fixture was stopped and restarted on55631 before the recorded RED/GREEN. No production database was used.
- Independent read-only Critic reviewed code/tests and the RED/GREEN logs: no actionable findings. Critic did not run services and does not authorize release.

Focused logs are retained under ignored `.sites-runtime/p03b/reliability-red-local.log` and `reliability-green-2.log`.

## Final verification

Full native regression, typecheck/lint/build, compiled HTTP, desktop/mobile E2E, exact-source-HEAD CI and Docker Self-host results are recorded in Draft PR59 against its current source HEAD. Pending checks are not PASS. No merge, deploy, production migration0012, production data/secret/infra change or real provider send is authorized by this correction.
