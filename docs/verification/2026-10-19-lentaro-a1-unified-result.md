# Lentaro A1 — actual unified recovery result

19 October 2026. **PHASE_A_DIAGNOSED / PHASE_C_PREPARATION_HOLD / RECOVERY_UNVERIFIED / STOP_SERVER_ACTIONS / NO_RETRY**. This records the owner's direct approval of the frozen unified package `ed6d7874cf0a2152c20113465a2a50e547b66f5d574258dc45f5a7d3cbcf382f`, including no parallel maintenance. Both permitted SSH dispatches are consumed. No M1 release, migrations or provider operations occurred.

## Actual Phase A

Parent authorization `4208dc1d-8782-408f-8475-1f651f49b3d2`, run `ac1f7e69-3bc6-4daf-918f-6fbab72bdcd8`, issued15:22:56UTC, original expiry16:22:56UTC. Parent SHA `0686cc54a56f68fe7d3c3255d55e0b563f50075d3f43606d25128973506feeb0`. One inventory-only daemon/SSH completed with exit0, DIAGNOSED_ALLOWED, cleanup PASS and complete safe evidence. Observation timeout watched the same child; there was no replay.

Docker client/server29.9.1, API1.56, linux/amd64. `image ls --quiet --no-trunc` returned an empty set; `image ls --all --quiet --no-trunc` returned exactly the following four native config IDs, equal to inspect.Id and the archive's expected mapping:

| Service | Native config ID |
|---|---|
| app | `sha256:40eab86dcef61d7cffa51b3f959fb81cc82b50a1a08f72eb2ad204876ce203e5` |
| postgres | `sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537` |
| redis | `sha256:f84b0c4678011602b9b98c227a4dcd5468bf8b088b02fdd4165cb7758bad8058` |
| storage | `sha256:7f83e629265eb971e0c4dfb2ed1aabfd6ed90e4ec024fbbe5305019a4750de1d` |

Canonical missing/extra0/0. Identifier classes EXPECTED_CONFIG; original canonical archive/platform/rootfs/layers/source verification PASS. The unmodified default verifier reproduced Failure/LOADED_IMAGE_CONFIG_SET/CANDIDATE.verify_image_mapping/line232. App source83a matches; supporting images are not required to carry the app's source label. No image removal/filtering/loading occurred. Historical b297 actual IDs remain UNKNOWN: current causal evidence does not reconstruct the missing old listing.

Phase A also bound the current consumed b297 reservation: SHA `66120c39340fb19c71c9edce6efad5f6001abc72fa8f7b32ffdb7adf677a5fd0`, device64770/inode1361328/555bytes. It did not archive it. Safe receipt SHA `468afb01167f3f01dcab5f3170afba11d2f7ae3caf20d57c9f942e52c73c4f3b`; canonical projected outcome `5a70be8e79c71591a66d31978070dd3c620cee908dbff000b7cc9e668f069a5b`.

## Local correction and actual Phase C

The derived candidate `6797b2eac5c7be8186424678b2cdd3da244207b4bf6b40b786fd40450edbaf3f` differs from original f90 by exactly one addition, `--all` in image enumeration. Original verify_image_mapping and every restore/identity/isolation/cleanup predicate remain unchanged. Causal RED→GREEN, original failure/pre-constructor/archiver diagnostics and focused checks:56/56 PASS, compile PASS. Independent review `e1dbb13eda7a88d6b8234fd3b4e8ce434b3e020ce3a6ca09a017f8b8da26084e` accepted local readiness, not runtime recovery.

Phase C run `32258178-9c7e-4aac-bc22-558fddfad465` was frozen at15:46:37UTC and dispatched once within the same window. Helperd54ff, transport8a5f, source/test/review/package pins matched. Actual SSH exit1 and safe receipt:

```text
status=HOLD
transportCode=PRIVATE_REMOTE_PREPARATION_OR_INVENTORY_FAILURE
primaryTransportError.class=FileNotFoundError
primaryTransportError.errno=2
primaryTransportError.code=UNKNOWN
primaryTransportError.sourceUnit=PHASE_C_STDIN_PAYLOAD
primaryTransportError.function=read_at
primaryTransportError.line=61
```

Safe receipt SHA `e46860e6ed8d3c39ed7baaefc79ee4478411dc22428569278c804d047a962b36`; stdout SHA `c88a1f9ba47e5d898e434976179105edda16b82d4b681e11941322067a285f3a`; stderr empty. Exact payload SHA `3d9900b3497b39e317eedab622aba5fee4dc2f0f1ac094916807ee77a37169af` agrees with the persistent latch and freeze. Restore helper entry, archiving, restore entry and daemon were not reached. **Preparation writes UNKNOWN0..3**, because read_at is shared by initial checks, exclusive-write readback and post-install checks. Initial local zero-write interpretation was corrected in the append-only event ledger and unfrozen safe result; it is not a runtime fact.

Local postmortem proves a delivery dependency defect: C requires old archiver2d3 as an on-disk source but delivers only derived candidate/new helper/envelope; prior transport-v2 executed archiver bytes in memory. This failure mode is reproduced with actual frozen remote_run in a file-boundary fixture. Other missing PINS produce the same deepest-frame receipt, so the exact missing remote filename remains **UNKNOWN / ROOT_CAUSE_NOT_PROVEN**. No speculative repair or extra SSH readback followed. The server budget is exhausted even though the restore daemon never started.

## Prepared next action, separately gated

The existing Phase A evidence and one-line candidate are retained. New local continuation files close the proven dependency-delivery gap and preserve allowlisted dependencyName/stage/completed-unit context for preparation failures. Before writes they check original core/probe, exactly three possible partial C records and the archiver. Missing core/drift stops; only an absent exact archiver2d3 may be installed O_EXCL under a new grant. Matching old sources are preserved. One new direct authorization/window, one SSH/restore maximum, fresh original preflight and all restoration predicates remain mandatory; there is no repeated inventory daemon or old-budget renewal.

New helper differs from d54ff only in validate_gate: old parent is exact historical provenance; the new explicit continuation authorization alone admits current execution. All other operational-function ASTs are identical. New targeted continuation checks27/27 PASS/compile PASS; original M1 tests were not repeated. Independent postmortem fixture4/4 PASS. Full pins, exclusions and proposed decision are in the local `artifacts/lentaro-m1/2026-10-19/A1-restore-continuation-approval.md`; no new grant/latch/dispatch exists. Existing frozen A1-next package/logger V4 and all failed/successful historical evidence remain unchanged.

M1 remains b7c331e, PR69 Draft/unmerged, CI/Self-host SUCCESS; PR68/69/70 freshly GET-checked OPEN/unmerged. The existing release package retains exact migration/content hashes and unresolved deliverable image/private provider setup/access/single-sender/rollback requirements. Verified restoration and one separate concrete M1 release approval remain required before updating the working server. Green source is not a deployed M1 site.


Final continuation freeze: package SHA256 `b7d790da19e92fb6db1337ba7ea909f7bfb5fd7362402f1e634ba17cd6f3032e`; independent `A1-restore-continuation-review.md` SHA256 `024f794db85c79e53f288f8882976b251f6dc831cfcd247d04d0172325e48429`, LOCAL_CONTINUATION_READINESS_PASS/0 unresolved substantive findings. This local readiness does not authorize a new dispatch.
