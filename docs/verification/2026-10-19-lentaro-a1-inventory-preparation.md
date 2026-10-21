# A1 — inventory and unified recovery preparation

19 October 2026. **LOCAL ONLY / NOT AUTHORIZED / NOT EXECUTED.** Current state remains in [PROJECT_STATE](../../PROJECT_STATE.md); the completed audit and unchanged M1 validation were not repeated.

## Proven evidence gap

The consumed b29737a7 run retained `LOADED_IMAGE_CONFIG_SET` in the original `verify_image_mapping`, before its next success checkpoint. Logger V4 saved the original failure class/code/location. Successful Docker listing/inspect stdout was not durably retained by that path, so it did not preserve the actual complete ID set. The later six-file read is consumed and insufficient; it is not repeated here. Four expected native config IDs are available from pinned archive metadata. Actual runtime IDs and underlying cause remain UNKNOWN / ROOT_CAUSE_NOT_PROVEN. No image correction or restore fix is claimed.

## Prepared diagnostic boundary

A new separately named private probe uses the unchanged pinned collector, boundary, Restore constructor/start/cleanup and original strict archive verifier. One fresh exclusive inventory claim precedes preflight/start; the consumed legacy restore reservation is preserved during inventory. Only its own isolated retained-store daemon is queried. No clone creation, restore entrypoint, image mutation or working Docker socket is permitted in the probe.

The diagnostic captures default and `--all` raw IDs, inspect config IDs, expected native config/OCI index/platform manifest identities, complete missing/extra sets, identifier types, Docker client/server/API version and platform. Progress is persisted before each next query. Original raw-default verification and full canonical verification remain distinct; no extra image is filtered or removed to obtain PASS. Incomplete/unknown results and unsafe cleanup prohibit continuation. Errors are recorded before cleanup using safe static metadata; cleanup/persistence failures cannot replace the original failure.

The new one-shot transport requires a future explicit parent approval and complete pins before dispatch, an exclusive persistent local latch, pinned SSH identity, one stdin payload and private receipts. Missing approval cannot cause an SSH action. A local observation timeout observes only the same child and never resends. No approval grant or dispatch is created by this preparation.

## One future decision, then a separate release

The outside-Git `artifacts/lentaro-m1/2026-10-19/A1-unified-recovery-approval.md` defines one bounded operational window: at most one inventory daemon, one locally proven correction revision if eligible, and one isolated old-source83a restore validation; at most two SSH dispatches. It enumerates service-file writes, conditional current-reservation preservation without overwrite, fresh gates, stop and owned graceful cleanup. Unknown causes remain NO FIX. Frozen A1-next package/logger V4 are preserved. No working-service/data/env change, migration, deploy, provider operation, Render recreation or off-VM work is included.

Recovery PASS is required before the separate [M1 release](2026-10-19-lentaro-m1-release.md). Product candidate remains b7c331e with its existing successful CI/Self-host. No M1 live-site acceptance follows from local tool tests.

## Verification freeze

Root final fresh focused command passed **69/69,0 failures,0 skips**, exit0,2.147s:24 new probe tests,16 new transport tests and29 selected existing identity/ownership/freshness/cleanup checks. Four new Python files compile PASS. Original six operational source hashes and the frozen next-package/logger V4 remain unchanged. Parent approval file and new phaseA dispatch latch are absent. No unchanged M1 test suite or server action was performed.

| File / record | SHA256 |
|---|---|
| New private probe | `69bd0ea2c1bfd5d6dfc0dd31761feb0d2bfad3723fa5c32dde23e29118e5d0fa` |
| Probe tests | `dac56a5411341c1a65f2d77b32c74ede124b66c59e6a3f8a86bcc752776388ee` |
| New private transport | `86bcf43b98ca3fb23faf53c561d898cddafcae07c72b2cda4be41d5b6ef1418e` |
| Transport tests | `0423ecfb18235892c903c4508df502d20763f4d5b007d9375c26a791a0bf997c` |
| Final69-test log | `4e51078c1f3a07b67c564ea01ff428b62e5acaf11ebfd444bc48c2c5ddca327b` |
| Unified approval document | `ed6d7874cf0a2152c20113465a2a50e547b66f5d574258dc45f5a7d3cbcf382f` |

The final independent read-only review is `artifacts/lentaro-m1/2026-10-19/A1-image-inventory-readiness-review.md`, bound to that exact document and code/log pins. Preparation evidence does not prove the VPS ID set or recovery. The diagnostic can identify a current proven keying/enumeration defect; it cannot reconstruct the missing ID set of the historical failed run. PhaseB/C executables are conditional on fresh proof and their own local tests/review/pins within the one proposed scope. Only the new explicit owner decision can authorize execution.

Independent verdict: **LOCAL_PHASE_A_READINESS_PASS / NOT_AUTHORIZED / NOT_EXECUTED**,0 unresolved findings. Review SHA256 `04ab4291652cb8ed16973217ff26c5fb0cb1dd9a05ab7cb3bd0379aa6f62510e`. The reviewer inspected the final code, contract and root's exact69-test log; tests were not duplicated for the review. Known source-recheck, original-error/finalization/collector retention and SSH pin-binding findings are closed. No runtime acceptance is inferred.
