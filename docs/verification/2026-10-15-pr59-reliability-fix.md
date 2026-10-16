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

### Canonical Node22 cancellation follow-up

Additional review compared the composed signals with the project's historical Node22 deadline issue. A DB-free probe of the actual helpers was first green on Node24.21, but reproduced a defect on the exact CI runtime Node22.13.0 (official executable SHA256 verified against nodejs.org): without GC, GET headers/body and PUT cancelled at the scaled150ms individual limit; with forced GC, GET body remained pending after the shared1500ms parent aborted and required an independent2200ms fixture watchdog, while PUT fell back to the parent instead of its individual timeout.

`tests/storage-deadline.test.mjs` executes real loopback HTTP/storage helpers in a forced-GC child process, without retaining timeout sources in observers. Its12 cases exercise individual-vs-shared budget precedence for GET headers/body/PUT both with and without GC. Production30s/60s constants are unchanged; only the fixture's native timer clock is scaled. The independent watchdog is a test diagnostic, never production Promise.race.

RED on Node22 confirmed missing body cancellation. Merely keeping timeout sources live after await was insufficient for GET body, so that intermediate failed run was retained. Final GREEN explicitly cancels the actual response reader on signal abort, checks cancellation after reads (preventing a false successful done), removes the listener and drains cancellation in finally. Both individual timeout and composed transport signal stay live through I/O. Shared-copy PUT passes its shared budget into the existing adapter, which adds and retains the individual30s timeout only when an external signal is supplied; existing no-signal uploads retain their previous behavior. Scheduler/business logic is unchanged.

Canonical GREEN:12/12 transport variants in one passing subprocess regression (`reliability-gc-green-2.log`). Strengthened final coverage also asserts real HTTP response close BEFORE fixture cleanup destroys the response, with literal coverage of all12 variants (`reliability-gc-transport-green.log`). Targeted native/API/UI/storage regression35/35 PASS. Independent read-only Critic rechecked the final code and cancellation observer: no actionable findings. Earlier green CI on source8a690ca is historical evidence and does not verify this follow-up; final CI/Self-host must cover the resulting current PR HEAD.

Full native regression, typecheck/lint/build, compiled HTTP, desktop/mobile E2E, exact-source-HEAD CI and Docker Self-host results are recorded in Draft PR59 against its current source HEAD. Pending checks are not PASS. No merge, deploy, production migration0012, production data/secret/infra change or real provider send is authorized by this correction.
