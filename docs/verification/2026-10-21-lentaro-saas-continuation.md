# Lentaro SaaS вЂ” standing authorization and recovery continuation

Owner's later direct instruction21Oct2026: В«Р Р°Р·СЂРµС€Р°СЋ РІРѕРѕР±С‰Рµ РІСЃРµ Рё РѕРґР°Р±СЂСЏРІР°СЋ РІСЃРµ РґРµР№СЃС‚РІРёСЏ РїРѕРєР° РЅРµ Р±СѓРґРµС‚ РіРѕС‚РѕРІ saas РїРѕР»РЅРѕСЃС‚СЊСЋВ». Necessary development, investigation and release now continue under that standing authority without repeated command approvals. Historical one-use grants/latches remain consumed; no historical result is rewritten or replayed. Data/privacy/isolation and proved ownership remain mandatory. Approved1000RUB/calendar month, no trial/autopay and manual renewal are unchanged.

## Established residual ownership

Read-only pinned SSH08978b79 observed exactly one remaining container in the isolated recovery store (device64770/inode1481483; containers inode1481503):

| Field | Observed value |
|---|---|
| Container | 3e2baf1b0045e4528cfd14e65aab370197d500d9d08ed363a662d790443452b3 |
| Name | /planly-a1-node-f17c32ff-d8db-4254-b7cd-92aaa4dcc837 |
| Recovery scope/run labels | p04a-a1-isolated-restore / f17c32ff-d8db-4254-b7cd-92aaa4dcc837 |
| State | Running/Paused/Restarting/Dead false; PID0 |
| Native image | sha256:40eab86dcef61d7cffa51b3f959fb81cc82b50a1a08f72eb2ad204876ce203e5 |
| Config | 5123B / b880276434b9974ee0885a60b8a366381bc7bf180479a3c844a354fa7341ddca |
| Processes | 128 enumerated; no selected isolated-store/recovery-runtime daemon |

This establishes the owned residual that caused run68a0's CURRENT_STORE_NOT_EMPTY. It does not establish why the original Node create took longer than60 seconds. Env values/arbitrary config were not forwarded.

## Controlled retirement source and checks

Public inert controller73-test source660daafd81e16117bb699b7a4ef6abc223e7fe8d; [Linux CI39584186256](https://github.com/barsikdan-hue/Planly/actions/runs/39584186256), direct logs:73/73 standard,5/5 own-process root fixtures, fixed100cases0fail/no skips. Windows45PASS/28Linuxskips. Complete application checks were unchanged and not repeated.

Private IO/transport tests16/16 PASS. Independent targeted Critic found0Critical/3Important/0Minor in IO/controller; an additional review covered only the previously uncovered assembly/entry surface and found2Important. All five were reproduced and corrected in one Native pass: cleanup independent of failed/expired admission, partial direct-child acquisition cleanup, complete held-link ancestry plus config/hostconfig spawn fences, source verification before execution/assembly, and closed response projection rejecting private/unsupported PASS fields. Corrected bytes have regression/suite proof, not a second independent PASS.

Preservation precedes daemon start; native identity/stopped/no-restart checks repeat immediately before one non-force rm. Four native image identities must remain unchanged. Only a new owned daemon/private socket/isolated store may be used; no working Docker endpoint. Cleanup sends at most one TERM to its owned pidfd and waits. If pidfd acquisition itself fails after direct Popen, bounded cleanup may use only that unreaped direct child reference; never a scanned/adopted PID. This avoids an introduced orphan; the risk of a wrong ownership assumption is a foreign signal, bounded by sole direct-child ownership/single-thread parent/no external wait.

## Actual execution and unexplained startup observation

First retirement905ace8a stopped at START/EXACT_OWN_DAEMON_ARGUMENTS before any native command or rm. Config/hostconfig were privately preserved. Its own TERM occurred, but exit was not retained and cleanup remained UNKNOWN. Subsequent passive read6fddf0 established that PID/socket/pidfile absent, daemon log empty, installed root-owned ELF /usr/bin/dockerd reports29.9.1/b26fb77. This absence does not reconstruct its lost exit status.

Finite characterization, not retry-to-green: ten own --version commands had exact argv (no daemon starts); one EMPTY isolated daemon78e121 had five exact argv observations, TERM1/exit0/endpoints absent, no recovery-store touch. One controlled start through the exact IO on the retained store be7fa132 had info1, four exact argv observations, TERM1/exit0, rm0. Original905 argument mismatch NOT_REPRODUCED / cause NOT_PROVEN / NO FIX. No equality, timeout or driver predicate was relaxed. Separate v2 files add bounded argv size/hash and actual exit-code retention, with causal missing-evidence REDв†’GREEN tests. Executed84af3b15/c21cab68 source bytes remain preserved exactly.

## Owned residual removed вЂ” actual PASS

New conditional retirement **dfee7a0f-b2d1-4060-99b4-7d3fa3556113**, wrapperd4f89f44591bf97e5746b1f341d10d35d12d4ee2760210eb3e8153ebea789252; IOdc33715062dd6cb3720a93c83651c5fe610634efd8e26ca8f484e5f497eb9534; unchanged controller196acbf3вЂ¦. One SSH/exit0; native commands9, one rm/no force; own TERM1/daemon exit0; final process/endpoint/empty-store checks PASS. Four native image config identities before/after equal. Config backup5123B/b8802764вЂ¦, hostconfig backup2462B/4904273dвЂ¦; both privately saved/read back on VM before start. No working data or provider operation changed.

Actual argv878B before the last guarded native operation exactly matched expected SHA b774c65d4fe1b5f4f51fd61c5a048c397978d3bc1ed720355fa5762d61ea60d3. Response1079B/SHAfd3b0686a48797d8634845677338e1cdf16dd84444139d6fdeb52935b9eaa040 and stderr0 retained before validation in ciphertext1334B/SHAd7ef8755374cd7c08589cf773612534299ebd8261dd21da17065742250e0e29e. RAM-only unseal, exact hashes and closed response/source/target bindings verified. Technical retention is not an independent off-VM backup.

## Fresh complete recovery

New run **9281b595-86f1-40c1-83ca-8e3ff7841788**, authorization29853696-4877-44fc-b04f-5fa2958fe6d3, started through unchanged helper921ccfda/transport97a9f6dc and all18 frozen dependencies/13 diagnostic modules. Fresh separate local grant/latch/cipher/receipt and time window derive from standing Owner authority; consumed68a0 files remain immutable. Full C5 absence/preservation, both current-f17 history passes, strict four native image sets and original Node60s/profile45s3s remain intact. No automatic retry.

Status at this report: IN_PROGRESS; full recovery UNVERIFIED. Product M1 b7c331e NOT_DEPLOYED; M2 implementation NOT_STARTED. An actual final recovery result supersedes this in-progress status; no future PASS is inferred.


Current928 completed: SEALED_HOLD / response VALID, stdout23205 bytes/c727d2390c15979f8d9b3de813da326142f2427ee6102ecfbfe21ead331a644b, ciphertext23462 bytes/f68fe291e9ffd997f3e92a27a9469e1c1ed5b68edea0b269cd85deb08c9d68c2. PostgreSQL13/schema/rows/sequences, MinIO archived bytes and exact four-image set passed. New diagnostics called version through the immutable dispatcher whose allowlist excludes version: REUSE_COMMAND_SCOPE before any Node-create execution. Inner cleanup PASS, daemon exit0, remaining0. This proves an integration defect, not the original Node-copy slowness. Fixed exact native version read uses held private socket/daemon identity, one read/3s and unexpired authority; dispatcher unchanged. Updated regression failed with that exact error before fix; local recovery73 tests:45 passed/28 Linux skips. Executed old13 diagnostic sources/helper/transport snapshotted privately before changes. Current928 records collected read-only in555dc84c:12 present/STACK explicitly absent,41326 bytes; no raw material published. Full recovery/M1 deployment remain UNVERIFIED/NOT_DEPLOYED.
