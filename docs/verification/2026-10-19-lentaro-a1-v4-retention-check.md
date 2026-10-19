# Prepared A1 V4 — targeted original-error retention check

2026-10-19. A1 remains PAUSED_BY_OWNER / NOT_AUTHORIZED / NOT_EXECUTED. Existing execution package, helper-v2, transport-v2, V4 logger and three original core files were not recreated or edited; their frozen pins below match. This is local diagnostic verification, not restore acceptance. Actual historical cause remains ROOT_CAUSE_NOT_PROVEN.

Reused existing 13 helper/transport checks and 11 V4 checks (including 8 earlier diagnostic regressions rebound to V4). Added only 2 missing tests in test_v4_original_failure_path.py: real runpy loading of the pinned candidate, actual boundary.execute_authorized and original Restore.start_daemon / verify_image_mapping functions, with all operational side effects replaced by mocks. The full collector/gates/reservation/cleanup are mocked here; no operational grant/claim, SSH dispatch, inventory, Docker/server, provider or working-data operation occurs. Process/network calls are explicitly forbidden; only temporary local diagnostic output is written.

Both original guard sites are exercised: OWNED_DAEMON_STORE at candidate line 406 and LOADED_IMAGE_CONFIG_SET at line 232. These are injected synthetic failures, not identified historical causes. The exact original Failure object remains the boundary's problem after a different cleanup exception. The actual V4 run_once writes/fsyncs its sidecar; reading that JSON and projecting it through the unchanged transport retains guard code/class, stage, source-unit alias/line and cleanup status. OWNED_DAEMON_STORE additionally retains four safe condition values. Raw paths/grant text are absent.

Control: replaying the same image-check failure through the previously executed collector-only logger produces no actualFailureCode. The old boundary catches perform exceptions but omits problem details in proof/outcome; that logger observes only preflight frames. This explains the missing diagnostic record, not the restore failure itself.

Result: 26/26 focused local checks PASS, 0 failures/errors; no full M1 test/CI rerun. Known limits are unchanged: only exact allowlisted exception classes/source guard literals are retained; arbitrary error text/class becomes UNKNOWN. No full raw traceback is persisted. A later proof/outcome-write failure can be a separate terminal error; retaining the original perform/cleanup problem does not by itself establish that later failure or its cause. Stage/unit/line remain bounded evidence, not automatic root cause. Raw Docker-root equality is weaker than canonical path equivalence. Runtime/store freshness must still pass the original checks under any future separate one-run approval. Verified recovery remains mandatory before updating the working server.

Product candidate remains b7c331e, with CI39256264337 / Self-host39256264393 SUCCESS. PROJECT_STATE documentation is corrected separately; no product code or CI configuration changes.

| Frozen item | SHA256 |
|---|---|
| a1_continuation_helper_v2.py | `2d3d6824661069968d6355d4a89222812fd394f778293328f4bf37a638cd739c` |
| a1_continuation_transport_v2.py | `2fa74feba4f5180c4c71ddc6576983f121c5de1e446bdfc0a90aaec6ac652733` |
| a1_continuation_entry_diagnostics_v4.py | `53e9e4acef356203ef3a2cda6b7b0d3b5d8154e72be82c122dc7fe0d9fd3c422` |
| candidate-execution-v2.py | `f90cac16eeabd545b761cd7a2b48557a6a3ad3079225d5af669c82cffbeaf8a8` |
| a1_execution_boundary.py | `0ceb63d1ffd4161e9436906b3132a19bfe0fa4c30bd414f2eef506aa1461424b` |
| a1_real_readonly_collector_v2.py | `8e78ecc974dcfeab2bab4828c86d3e15d72b1bc3a2fc4b24c2eae8160ce949a6` |
| test_v4_original_failure_path.py | `5379591d734ce72c64da80b6376acde9b1f14b4b35f2fc7cdcef2c780481c168` |
| v4-retention-targeted-verification.log | `0b389ba5599837092118cb809a36db340bbdc2f7cf81bec43c531cd14b63b03e` |
| Previously executed a1_continuation_entry.py (control) | `9bff226bbd2b0251e4767c3638f016c8c501d15855dcb2973ec9998c2ea00d8e` |
