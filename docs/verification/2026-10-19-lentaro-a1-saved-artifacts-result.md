# Lentaro A1 — actual passive saved-artifact collection

19 October 2026, collection captured16:28:11 UTC (19:28:11 Moscow). **PASSIVE_COLLECTION_COMPLETE / RESTORE_FAIL_HOLD / RECOVERY_UNVERIFIED / ROOT_CAUSE_NOT_PROVEN.** The owner approved only passive collection under frozen package8592. This report supersedes pending-read statements in the earlier dated continuation report; that report and all consumed attempts remain preserved.

## Actual scope and evidence

One authorized SSH session completed exit0;18 files/40117bytes, within36files/16MiB. Seven fixed latest-run49 artifacts, eight progress files and three clone-log summaries were read. No server writes, daemon, Docker, restore, live database/env/config/state query, retry or fallback occurred. Raw log bodies, arguments, IPs, credentials and private data were not exported. The grant/latch are consumed, even if their original clock window has not expired.

| Identity | SHA256 |
|---|---|
| Approved passive package | `8592b79229a6a7f7613582c8a1d89364e6ed424fdf39d80b8d041a92414f9391` |
| Passive collector | `be5e6f1b07f69043803132c7b7072e3f33c660569547564d0c56b08b3356a2cb` |
| Passive transport | `6161b92adcee07b8e03511f14e4447460472a3b56c12f32b976dd99ae1e4a667` |
| Public result `A1-latest-saved-artifacts-result.json` | `0d1d64e7887d5d0c9b5c53cd2481f3ca047c902259b36d11bd3552f691033525` |
| Safe receipt | `3695b336cea6832e81a6a2dff2ce53afd8f0ec1b15c0c96e16d34c964e2224cf` |
| Safe stdout | `84801dbc8797a88f3b4488d872b80313834447a4c3efe50fa8a7fd9184709814` |
| Original outcome, matched | `395a31900e9090c6b6c529e2f78e95f5e33856ad708ed8b8384d40119ae15aee` |
| Original proof, matched | `c8da3df5964803e6e7147af59063ccca8a7b944ffa4311c08dfee144284797e3` |
| Saved termination record | `f217330a6587f2db6269ee95967c840ef7a18305502e92ff54a5393ada88eb69` |
| Independent actual-result review | `2bea18f87ca755eed61cc98dd5ee9e2f6e8465910b334d57d918f1d771552526` |

Public artifacts/review are in the existing external transfer folder `artifacts/lentaro-m1/2026-10-19`; operational code/receipts remain private and excluded from the handoff archive. Independent review used the saved local projection and narrow source, not another server session. Existing collector13/13 preparation evidence is reused; unchanged M1 product tests were not repeated.

## What the failed restore actually completed

Original run `49f905dd-ab78-48ca-922a-d90ce9ff4fe2`; proof source83a/manifest and both outcome/proof child-grant bindings match. Entry stdout and proof agree on four ordered PASS checkpoints:

1. `RETAINED_CONFIG_SAFE_MATERIALIZATION`.
2. `RETAINED_IMAGES_VERIFIED_IN_REUSED_STORE`.
3. `POSTGRES_ALL_ROWS_SCHEMA_LEDGER13_SEQUENCE_READBACK`.
4. `MINIO_ALL_ARCHIVED_FILES_RESTORED_BEFORE_SERVER_START`.

Saved image listing contains all four expected native config IDs, duplicates0/missing0/extra0; four inspect summaries match expected linux/amd64 configs. The original image acceptance checkpoint includes its original stronger guards; the reduced projections do not independently reproduce those guards. The strict image-set check remains enabled. Saved termination reports graceful shutdown, daemon exit0, remaining0 and cleanup PASS; beforeCount12 is a process count, not a container count. This is historical cleanup evidence, not a current process inventory.

In exact candidate6797, the last checkpoint is line632. Lines633–635 inspect the MinIO clone, signal readiness and wait for health; line641 creates/validates/starts node; line642 calls the first Redis helper. A successful first helper would append nonempty PASS records to the proof. **Source-path inference:** failure occurred after632 and before successful completion of642. It may concern a MinIO operation, a node-creation command or that Redis helper; the command is not identified. Later media helper/web/app/audit/final recovery readbacks did not complete in the unchanged sequential path. Earlier DB/media PASS does not imply complete recovery.

## Missing diagnostics and local preparation

Both saved primary/terminal error records retain UNKNOWN class/code/stage, CANDIDATE.run335. One daemon TIMEOUT_TEXT marker and one unlabelled clone-log PERMISSION_DENIED marker do not identify a component or primary cause. Clone aliases have no exported service mapping. No command-error file was selected; the original writer creates those files only after a command returns nonzero, not when subprocess.run itself raises. Absence therefore does not establish TimeoutExpired.

The frozen helper demonstrably ignores supplied stage and maps unlisted exact exception types to UNKNOWN. Local causal fixtures reproduce those defects at the real frozen candidate.run335 call using a synthetic TimeoutExpired and a mocked subprocess boundary: no command or server is started. A separate unused pure component addresses only metadata retention: allowlisted stage, known exact class, numeric errno/returncode/timeout where applicable and trusted code-identity caller frames. It never formats messages/args or exports paths/locals/stdout/stderr, and marks unknown/truncated fields incomplete independently of persistence. This is diagnostic preparation, not proof that the actual incident was a timeout and not a runtime fix.

Local component SHA `e66c6dd455e55fcac71d10a4b67946edb06c237f98710b7444c617fcb48d52ca`; tests `ffc21f2bc5afdd5c5b324e5dfe1d7cfdffc32c7391c05e984827507a8ad15a96`. Recorded RED:3 assertion failures/6 missing-field errors/1 baseline PASS; GREEN10/10. Independent focused10/10 plus two in-memory compile checks PASS; review `A1-error-retention-local-review.md`, SHA `c1963864913dc06dc77bb2eb7ad006b0a8b9ac801ab8605abb8c21610a922072`, verdict LOCAL_COMPONENT_REVIEW_PASS / NOT_INTEGRATED / NO_SERVER_AUTHORITY. Missing-field errors in RED are stated explicitly, not counted as pure assertion failures.

Frozen helper7708/transportd550, original A1-next package/logger V4 and all prior grants/reservations/outcomes/archives remain unchanged. The new component is not integrated into a complete reviewed continuation package and carries no server authority. A later package must bind current consumed49 evidence/reservation, retain history without replacement, preserve all original checks and return sufficient primary/cleanup/finalization evidence in its one session. No additional server read or restore is authorized now.

M1 remains b7c331e / existing CI and Self-host SUCCESS / NOT_DEPLOYED. Recovery remains mandatory before working-server update; same-VM recovery is not independent off-VM disaster recovery. The existing release package and remaining private setup/single-sender prerequisites continue independently. No merge, migration, deployment, provider call or product change occurred in this stage.
