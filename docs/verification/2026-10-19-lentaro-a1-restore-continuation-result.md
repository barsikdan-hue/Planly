# Lentaro A1 — actual separately approved restore continuation

19 October 2026. **CONSUMED / HOLD / RECOVERY_UNVERIFIED / ROOT_CAUSE_NOT_PROVEN / STOP_SERVER_ACTIONS / NO_RETRY**. This is the actual result after the owner approved frozen `A1-restore-continuation-approval.md`, SHA `b7d790da19e92fb6db1337ba7ea909f7bfb5fd7362402f1e634ba17cd6f3032e`, and confirmed no parallel maintenance. The earlier [unified result](2026-10-19-lentaro-a1-unified-result.md) remains a distinct historical attempt.

## Exact execution and outcome

- New authorization `85af5c24-a051-4190-99a7-c78ecca6745f`, run `49f905dd-ab78-48ca-922a-d90ce9ff4fe2`; original window16:04:05–17:04:05 **UTC** (19:04:05–20:04:05 Moscow). One SSH dispatch consumed, same-child observation after waiting timeout, no replay.
- Full approved source/package/review pins matched before dispatch. Helper7708555a, transportd5504c26, derived candidate6797 retained its single `--all` enumeration change. Original f90/boundary/collector/V4/old packages remained unchanged.
- Preparation readback: all three old possible C partial files ABSENT; archiver ABSENT→INSTALLED_VERIFIED. Required core/probe pins matched and helper entry was reached. No speculative overwrite of existing files occurred.
- Old b297 reservation was archived successfully with unchanged SHA `66120c39340fb19c71c9edce6efad5f6001abc72fa8f7b32ffdb7adf677a5fd0`; original entry was attempted once, returned1, original outcome FAIL_HOLD, reported cleanup PASS. Safe receipt aggregate HOLD/SSH1. The new reservation remains consumed; it is not reset or made reusable by failure.

```text
primaryError.class=UNKNOWN
primaryError.code=UNKNOWN
primaryError.sourceUnit=CANDIDATE
primaryError.function=run
primaryError.line=335
```

Line335 in the exact candidate invokes `subprocess.run(..., stdout=PIPE, stderr=PIPE, env=self.env, timeout=timeout)`. This does not establish which command failed, its stage, exception type, timeout or root cause. No timeout increase, image deletion, assertion weakening, runtime repair or further SSH readback followed.

| Saved identity | SHA256 |
|---|---|
| Approved local freeze | `14b31100d39c68dded216a457da64b4deea5aa6d4db9cb8421c422f1d7316b21` |
| New grant envelope | `e05e65acba8d15d3cb08c4f9a6bd9f1c5be84fefc6495b90c887c204a7085a93` |
| Child grant | `4702aab5cf3a14e624fb8a601aff38610eeff4fcce31eacd14b83bbc2fbd618c` |
| Sent payload | `793a9747210175a0408aef493e7c6a3100ffcc92b9859362cae9aae043c63e08` |
| Local safe receipt | `075be4db17a1cf57b4d9b8adb9d8cf3184595b8a0a7cf71dd03cf8ae0b9ba4bd` |
| Public safe result | `392f3451c801a37169d05915de836f7406d49b5c71000e8de8c3acdddebac267` |
| Original outcome, reported hash | `395a31900e9090c6b6c529e2f78e95f5e33856ad708ed8b8384d40119ae15aee` |
| Original restore proof, reported hash | `c8da3df5964803e6e7147af59063ccca8a7b944ffa4311c08dfee144284797e3` |
| Safe stdout | `f8c6be733ef520c3baf4fcf004a8aec575fcf6a734f6d52731aa6dcd3d69e84f` |
| Independent local actual-result review | `492d329cb6aed3848746afc34e0d7f9c2cf47e1dec3df13350a7fba3559ba6a8` |

These are saved transport/operator observations. The full proof, termination, detailed entry/progress/daemon files were not delivered in this session's final safe JSON. Cleanup PASS is the original reported cleanup outcome; no subsequent independent process/socket/live-state check is claimed.

## Proven diagnostic gap; no inferred runtime fix

Local exact source review shows `error_metadata(stage=...)` ignores its supplied stage, and its exact-type/public whitelists omit some standard exceptions, including subprocess.TimeoutExpired. Therefore an exception object was held during cleanup, but these identifying fields were not preserved in the final projection. This proven metadata defect is separate from the actual runtime cause: UNKNOWN cannot be relabelled as TimeoutExpired.

`diagnosticIncomplete=false` only means no recorded diagnostic-write/projection failure. It does not mean semantic completeness; class/code/stage remain UNKNOWN. The safe result and independent review state that caveat explicitly. No frozen executed helper was modified after the run and no new restore logger/run is proposed as the first next step.

## Smallest useful external action

The current local safe stdout/receipt contains no detailed checkpoints/log bodies; rereading it cannot recover missing fields. Prepare one **passive saved-file collection** of this exact consumed run before considering any new restore. Its fixed outcome/proof hashes and child/source/manifest binding must match; read only the seven named saved artifacts and bounded same-run progress/command-error/clone logs. No server writes, daemon, Docker, restore, `/proc`, database/env/config/clone-state reads, old b297 six-file repeat or inventory fallback.

The local proposal is `artifacts/lentaro-m1/2026-10-19/A1-latest-saved-artifacts-approval.md`, SHA `8592b79229a6a7f7613582c8a1d89364e6ed424fdf39d80b8d041a92414f9391`. Collectorbe5e6f1b/transport6161b92a:13/13 focused PASS/compile PASS, including ordered DB checkpoint regression RED→GREEN. New collection grant/latch are absent; this is **NOT AUTHORIZED / NOT EXECUTED**. Original M1 tests are reused, not repeated. Unknown node checkpoint names remain unprojected/countable; collection cannot promise to recover metadata never written. New local readiness does not grant a server session.

M1 b7c331e remains source-ready/CI+Self-host SUCCESS, not deployed or live-accepted. Recovery remains mandatory before the separate complete staging release. Independent release preparation continues in the existing release package; no product implementation, merge, migrations, deploy or provider operations occurred here.


Final passive readiness review SHA256 `fa1ed73c613a23e1af89b5590f6327537d3221db709dbb979e1715e469e37577`: LOCAL_PASSIVE_READ_READINESS_PASS, no unresolved substantive findings, bound to package8592 and13/13 focused checks. New owner authority is still absent; no server collection ran.
