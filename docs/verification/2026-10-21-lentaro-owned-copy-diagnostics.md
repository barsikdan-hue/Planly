# M1 owned-copy diagnostics — source integration

Updated 2026-10-21. Draft PR [73](https://github.com/barsikdan-hue/Planly/pull/73), stacked on PR72. This report concerns diagnostic tools only. Product source b7c331e remains NOT_DEPLOYED; full recovery UNVERIFIED; M2 implementation NOT_STARTED.

## Current decision

SOURCE_PREPARED / ONE_APPROVED_DISPATCH_CONSUMED_HOLD. Source preparation itself had zero server actions. The subsequent exact Owner approval was consumed by the single execution recorded below; it does not permit another SSH or cleanup. Full recovery remains UNVERIFIED.

The retained f17 evidence establishes a Node Docker-create timeout after 60 seconds and a 45-second profile in VFS layer copying. It does not establish why copying exceeded the deadline. ROOT_CAUSE_NOT_PROVEN → NO FIX: no timeout increase, driver change or image-equality bypass.

## Actual approved execution — 21 October

Owner call_6b384ab211cc4588bb2ea0819e177124 approved the exact proposal6f8e18babb1b and confirmed no competing maintenance. A repeated confirmation referred to this same single execution, not another attempt. New run **68a0aac9-8e4d-48f4-af14-112e1c34417b**, authorization668b14ac-f162-49cf-b285-28441aa01c24; one SSH, exit1; zero original restore invocations. Grant5376a779f838… and payload964775B/SHA0c778b712085… bind the approved source unchanged.

Result **SEALED_HOLD / VALID / CONSUMED_STOP**. Original native error: Hold / **CURRENT_STORE_NOT_EMPTY**, phase ABSENCE. The fixed isolated recovery-store `containers` directory was observed nonempty (`persistedEmpty=false`, last complete read CONTAINERS/SCANDIR_NEXT). The frozen source `a1_posttermination_proc_nlink.py:239–251`, Native.empty, reads the first directory entry and refuses when it exists; `a1_c5_posttermination_absence.py:228–233`, Native.setup_absence, invokes this before either ready pass/original restore. This proves the stop condition, not the identity, number, ownership or origin of the remaining entries.

Capability probe, source scan, Node command/profile/copy sampling and both current-f17 preservation passes were NOT_REACHED. No new recovery daemon, adoption, pre-entry rm, daemon signals or config-body reads (all reported counters0). The complete absence/ready process was not finished; cleanup and current runtime health remain UNKNOWN. No destructive remedy or permission weakening follows from the nonempty-directory fact.

Both received streams were retained before validation: stdout4967B/SHAa7c21708e24219d786b8c780f087bba14dc017beebb234f22fa296c8898a4991, stderr0; CurrentUser DPAPI ciphertext5222B/SHA57ecfa6983d890b3b34f2a1f54f8a2cbdae073d41a477814debcb70866b1f2f9. RAM-only unseal and closed-envelope revalidation passed **25/25 scoped integrity checks** across grant/proposal/source/preparation/latch/receipt/ciphertext/streams, with no plaintext raw file. This proves retention and the reported pre-entry HOLD, not recovery PASS. No additional SSH, retry, deployment, provider or payment action occurred.

Safe actual `A1-owned-copy-result.json`:4918B/SHA256 **3e042d81a4e454435dc6bae7c2e9c644d6e9712b9db1c839a2cd214714d97f60**. Private grants/receipt/ciphertext and raw envelope remain excluded from Git. The safe source manifest is the immutable pre-approval snapshot; its absent-grant/zero-server-action fields are dated preparation evidence, superseded only by this actual execution record.

Next evidence needed: identify the remaining isolated-store entries and establish ownership against retained recovery records through a separately scoped read-only operation. This consumed run does not authorize that read, rm, starting a cleanup daemon or another restore. The cause of the earlier Node timeout remains NOT_PROVEN.

## What the package adds

- Metadata-only retention of at most one pair of open-file descriptions, explicit own-process identity and refusal on missing pidfd capability. No reads/writes/seeks on retained data descriptors. Retention can delay final release of a file until the pair closes.
- A separately interruptible observer, bounded source-workload metadata and native/init/RW directory attribution, process/task/device counters, seven scheduled observations inside the original Node-create window. Missing, late or catch-up observations remain INCOMPLETE/HOLD. Target-FD continuity and root cause remain NOT_ESTABLISHED/NOT_PROVEN.
- A fresh wrapper around the complete frozen C5 recovery chain: 18 unchanged source dependencies, 13 current-f17 records checked before and after entry, owned capability probe before reservation archival/original restore entry, strict four-image/config equality unchanged.
- A closed, bounded envelope. Available stdout and stderr are framed, encrypted with local CurrentUser DPAPI and durably retained before parsing. Native failure class/code/errno and partial observations survive diagnostic failure where the storage/crypto operation itself succeeds. A local crypto/storage failure has no plaintext fallback and remains HOLD.
- One bounded copy-only private record on the VM, in addition to unchanged original recovery artifacts, so a failed reply transport does not inherently discard the new observations. Failure to save this record remains HOLD.

The public modules are inert on import and have no application imports. Private helpers, actual grants, raw logs, ciphertext and source bodies are excluded from Git. The [safe source manifest](2026-10-21-lentaro-owned-copy-source-manifest.json) binds the implementation, private test bytes, immutable dependencies and evidence scope. The reviewed snapshot and the corrected private bytes are distinguished; corrected bytes have regression/suite proof, not an invented second independent PASS.

## Verification

Public source commit **fc4592c19aa943322d449fb5e1ecc5e98e535226**, [CI39575739006](https://github.com/barsikdan-hue/Planly/actions/runs/39575739006), actual job log inspected:

| Evidence | Result and limit |
|---|---|
| Linux standalone suite | 66/66 PASS, no skips |
| Existing-sudo ephemeral root fixtures | 5/5 PASS: own sibling descriptors, packaged sampler, own capability/admission and architecture refusal; no host-policy changes |
| Fixed comparison characterization | 100 cases, zero failures/skips; no retry-to-green |
| Windows public suite | 38 PASS / 28 Linux skips; not Linux authority |
| Private bridge/transport | 19/19 PASS on Windows in 61.355s, exit0 after all three review corrections; real CurrentUser DPAPI, synthetic process/IO boundaries; not an actual Linux private recovery |
| Application type/lint/build/browser/provider | Unchanged application checks not repeated; retained evidence in PROJECT_STATE.md |
| VPS capability/full restore/current health | NOT_VERIFIED / UNVERIFIED / UNKNOWN; no server inspection in this scope |

The earlier task2 Critic's Important finding (silent/late observations accepted as complete) was reproduced and corrected at c3e3342; exact Linux CI39562966545 passed 55/55 plus topology and characterization. That review does not cover the subsequently added private bridge/transport.

The fresh whole-package Critic checked fc4592c plus the private review-manifest-v1 snapshot: all 35/35 implementation hashes matched; 0 Critical, 3 Important, 0 new Minor; assessment NOT_READY. The Native correction pass reproduced all three and changed only the new private helper/transport/tests:

1. Receipt persistence failure left fullRecovery PASS and CLI exit0. Regression observed PASS instead of UNVERIFIED. Correction removes overall PASS, retains the separate received server observation and requires consistent success fields for exit0.
2. An outer FD-close failure replaced the ready full reply/first error and stopped later closes. Regression observed OSError replacing both the available reply and a pre-envelope ValueError. Correction attempts every owned chain close, adds closed secondary CLEANUP metadata to an available envelope and preserves its entries/first failure. A pre-envelope original exception remains primary.
3. Validator AttributeError/Hold lost class/code despite successful encrypted retention. Three regression variants observed UNKNOWN. Correction captures the first exception at the private validator callback and applies its closed safe class/code/errno projection after retention, analogous to the existing crypto callback. The inert generic retainer and public implementation bytes remain unchanged.

Verification is by the causal regression tests and the complete affected private suite (19/19 PASS, exit0); there is no second independent review/PASS claim for the corrected bytes. Public implementation hashes remain exactly equal to the Linux-tested commit. All 18 frozen dependency hashes were rechecked unchanged.

## Native decisions and deferred minor

1. Use only exported, permitted libc pidfd_getfd, without syscall-number or policy-change fallback. Missing capability means NO_GO. Cost if wrong: no usable observer on the target host.
2. Permit existing sudo solely for ephemeral own-process CI topology fixtures; this does not authorize host policy changes or prove VPS permission. Cost if generalized incorrectly: a false target-host capability assumption.
3. Retain the complete 18-file frozen chain and both current-f17 preservation passes rather than wrapping only the older profile helper. Cost if wrong: unsafe admission or incorrect historical binding.
4. Move the own capability probe before reservation archival/original restore entry, and require its successful prechecked state at perform. Cost if wrong: incorrect admission/cleanup ordering. The ordering regression was observed failing before the repair.

Deferred Minor, carried from the earlier component review: extremely large synthetic integers can overflow comparison arithmetic; actual bounded kernel metadata paths do not supply that input. No new Minor was found by the final Critic.

## Preserved boundaries and next gate

Source preparation is not a deploy, recovery acceptance, root-cause proof or independent off-VM backup. Existing recovery logic still owns its separately bounded daemon/clones and cleanup; observer-only signal limits must not be described as limits for the whole frozen recovery.

Before a possible new dispatch, the complete reviewed package, exact host/source/hash bindings, one SSH/at most one original isolated recovery, no competing maintenance, retention limits and STOP rules must receive one explicit Owner authorization. Only then may a fresh window/identities/grant/latch be prepared. Any failed prerequisite is NO_GO; unknown cleanup is STOP; no automatic retry, adoption, foreign signals or working-data changes.

The specific proposal below was subsequently approved and consumed by run68a0 above. This paragraph preserves the original source-preparation boundary; it is not a new approval request or reusable permission.

Concrete local proposal: `A1-owned-copy-approval.md`, 11173 bytes, SHA256 **6f8e18babb1ba4eca07c4bd5c22435da61298ae430a8d358b5028c0a1c4b8bb6**. It binds safe manifest SHA256 **72b36a6c5f91f7a65799ea70d4deab49f0792eedb61fd8e4ace4c166367a0b5e** and the corrected helper/transport hashes. Proposal preparation is not authorization. The exact external gate derives from AGENTS.md distinct Owner gates and the approved contract; it is not an inferred per-document skill approval.

After an actual full recovery PASS: separate consolidated M1 release gate → staging USER scenario → Owner M1 test → M2. Merge/deploy/migrations/providers/payments remain separate actions.
