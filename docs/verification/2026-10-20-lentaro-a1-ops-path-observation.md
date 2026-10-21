# A1 — actual passive OPS path observation

2026-10-20. Owner approved exact passive proposalf9eb5708 via call_0f3604995c1b45b99c449465cd72f9d4. Run0b97ea57-92ed-4be9-9809-bcd769b7d416 completed ONE SSH/exit0/PASSIVE_OBSERVATION_COMPLETE/OBSERVED. Permission is CONSUMED_NO_RETRY; no further server operation followed.

## Current metadata and limits

All four fixed components were observed as directories with rootUID0/GID0, safe modes and matching held/no-follow link checks. No error/recheck/close fields were returned; stderr is empty.

| Alias/index | Device/inode | Mode |
|---|---|---|
| ROOT/0 |64770/2 |0755 |
| OPT/1 |64770/16385 |0755 |
| STAGING/2 |64770/525324 |0700 |
| OPS/3 |64770/1053357 |0700 |

This establishes current path existence/ownership/mode only. No enumeration, file body, source/config/env/backup content, process inventory, working service health, Docker, cleanup or restore was inspected. Application server writes0. The observation does not prove what existed in the earlier5363 session or explain its FileNotFoundError/errno2. At observation time alone its historical failing component/cause were unproven. Subsequent actual-payload local analysis below establishes a transport serialization cause for5363; it does not establish a server directory disappearance. Do not claim a path typo, transient race or runtime fix, create/substitute directories or retry the consumed package.

## Exact evidence

| Artifact | SHA256 |
|---|---|
| Approved proposal | `f9eb5708c7bbf7740dd82ab6b834cd23d48e862aa4aca2802593d26f58de2f00` |
| Readiness review | `76bc6a407c2d43f309e26a8debc15517fc7cb079e2759e6f69c696c4c19a757a` |
| New grant | `7d6258aaf07465d44e8a98780875ca551cb3e4f2a27d91e0a5a22e84c609d818` |
| stdin payload | `26055af944eced6fcbfdbc225ae56af1151913c559007b606588a1cdef3ed2a5` |
| Safe receipt | `19663ede5c7ba6b10e8b9153ce9dd063ea54c7ae5cb2e180258c93f548143b40` |
| Safe stdout | `1e9c8652cbac180e49b08a1a4563cf79bb2d7dfa9dc01d8022a0edb33de9aeaf` |
| Empty stderr | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Local execution freeze | `84be23831ea837553405ead6832d384f3c9ed520ac176f4f2accbe365af48b58` |
| Persistent consumed latch | `0e6aaf3ebcd2e3e5761a64b81dfd98d20ea028d3330f6ee4e0f2cb7c12e86599` |
| Public result | `3ae2adb7d6d5cbee5f47e53973a02885cee45a8889d0b8c3d6404b133fd80bb8` |
| Independent actual-result review | `b28ccd6f33533d3f7c0aaa8a3cbb928180c193e549afc59f5303de14a394e64b` |

Independent review confirms source pins, receipt/stdout/freeze/latch and pure projection. It made no server call or real-grant/key read. The public result is a nonsecret coordinator projection; safe files remain local and all old grants/archives are preserved.

## Local continuation

The proven diagnostic gap in frozen6787 is specific: an exception from the directory-open loop loses its safe ancestor index/context; its embedded close-error path can replace the primary exception. The separately named minimal transport v2 is now frozen/tested/reviewed to retain that context/primary without new diagnostic filesystem queries, changed approved targets/guards/dependency installation policy/941 helper/old49 reservation/history/source83a restore or acceptance. The initial diagnostic-only brief was expanded by one line after the actual input proved a Windows-to-Linux path serialization defect; see the local causal proof below. This does not repair a server directory or explain older49. No new actual grant/latch exists. A new direct owner decision remains required. M1b7/CI/Self-host/release preparation are preserved; recoveryUNVERIFIED/M1NOT_DEPLOYED.

Local grant preparedAtUTC: 2026-10-20T05:05:00.410099+00:00. This is a local preparation bound, not an exact server observation timestamp.


## Subsequent local causal proof — affected5363 only

The actual historical payload was reconstructed from frozen6787 sources and its unchanged local grant; SHA863057ea exactly matches the actual execution freeze. Its header uses `str(helper.OPS)` while the local object is **WindowsPath**. The generated value contains backslashes and yields **one** component under Linux `strip('/').split('/')`, rather than the intended three. Thus payload31 attempted to open one malformed basename under root. A pure mock using the actual frozen open_ops function and that actual header reproduced FileNotFoundError/errno2 with the same operand flow. No server query was used.

**FILE + FUNCTION + DATA FLOW:** frozen `a1_single_entry_reconcile_transport.py` / `build_payload` / WindowsPath str → SSH headerOPS with backslashes → Linux open_ops one-component lookup → errno2. This establishes the cause of5363's OPEN_OPS failure. It supersedes earlier provisional ROOT_CAUSE_NOT_PROVEN for that failure alone; older49's subprocess cause remains unproven. Static comparison of source literals had missed their Windows runtime conversion, which is why the earlier local check did not expose this defect.

The minimal separately named v2 fix exports `helper.OPS.as_posix()`; intended Linux target, source83a, source files, helpers, all original guards and actions are unchanged. A PureWindowsPath regression must watch RED on original/pre-fix v2 and GREEN on this exact POSIX export. The close-error retention/context delta remains diagnostic only. No server directory is created/substituted, no recovery acceptance is claimed and no existing grant is reused. The root's local diagnostic-only brief was explicitly expanded to this one-line causal fix under the owner's existing authorization for minimal proved restoration-tool fixes.

## Exact local continuation readiness

All artifact names below resolve in existing `artifacts/lentaro-m1/2026-10-19`; private code remains excluded from Git/public transfer.

| Artifact | SHA256 |
|---|---|
| A1-path-serialization-causal-proof.json | `e2666cc05bf1f48b4de511028e8b9fc45029d095fcff1a661341f85f63df95e1` |
| A1-path-context-continuation-approval.md | `75e08d7f5cfcbaf13fe28f1ce8312b368e54b0432c8f8e4e2cdbbf1657ab67a0` |
| A1-path-context-continuation-review.md | `7ccacf0a30dd9434fbc5b6df065c537d4e4bd9a44d6b1d468048c0f27f65d110` |
| a1_single_entry_reconcile_transport_v2.py | `29da3ed6eabf31cc09933bbe3d39379c3a36166c305199a13a5ed55a6461b613` |
| test_a1_single_entry_reconcile_transport_v2.py | `580e22aad267e84e7e4db46125266b15a01035cfea6725ef5b2b7cccff62a896` |
| path-context-focused.log | `81780e16f4ca34d228b5d2e55386ebe8e9ca23ff349322f16cd6cf909e4ef3bd` |
| path-context-red.log | `10af4f4eb344aa51fa60c9aba7fc57953c7e226079d0116b88162e0c806325b4` |
| path-serialization-red.log | `6219b0dfaca735c7d4c62dce1afdd3f5009683d71f0aa2c287a6ca93bc0d9c9f` |
| path-context-transport.diff | `1ae77ed3d8d9c2f0989f53f9f599b8e6e7a91139cdfbaf845c1b43d58cb14582` |
| path-context-freeze.json | `f74aac974f11f3ef5987c3ff1ebb2ba3d653b765c3c4c44aa98e1a692d84d675` |

Observed14/14 author focused mocks; root14/14 exit0 (1.392s); independent14/14 exit0 (1.438s), four optimize0/1 compiles and nine frozen pins. Prior33 unchanged core checks retained without rerun; no M1 suite/audit repeated. RED→GREEN covers Windows serialization and primary-exception loss through close. Intended valid POSIX chain open/fstat traces match frozen flow; correcting the malformed historical Windows header naturally reaches its intended three components. Context identifies first failed OPEN/FSTAT/CHECK_META alias/index, with aggregate CHECK_CHAIN alias/index null. Trusted exception/type/errno/frame and separate close failures survive later save/close errors into the bounded safe receipt. No raw messages/paths/config/Env/argv/locals are exported.

Independent review is LOCAL_DELTA_READINESS_PASS/zero substantive findings, not runtime acceptance. ONE new full scope retains bounded attribution (max3 RAM bodies), max1 separate cleanup daemon/1 native unforced rm only after proven stopped-owned profile, then only after verified empty/daemon stop/fresh original quiescence max1 unchanged244a old83a restore in the same SSH. The package explicitly names original read-only working Docker/DB/config baseline and bounded root-private original error streams. Unknown native state stops without rm/restore/unconditional signal and may leave an isolated daemon with cleanupUNKNOWN. Any dispatched FAIL/HOLD/UNKNOWN consumes the whole attempt; same-session diagnostics then STOP, no retry/additional SSH. Old49 history/reservation archive is no-overwrite; live services/data/env/providers/migrations/deploy/off-VM excluded. All five new local grant/latch/output names are absent. No new UUID/window/grant, server read or execution was created during preparation. Successful same-VM old83a restore remains mandatory before ONE later M1 release approval.
