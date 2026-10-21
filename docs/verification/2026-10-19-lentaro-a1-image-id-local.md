# A1 image-ID mismatch — local evidence first

2026-10-19. Local inspection only; **SSH0 / daemonStarts0 / restore0 / image mutations0**. No product, frozen helper/logger/transport or equality-guard changes. No extra image is established; do not delete or filter images to obtain PASS.

Recovered the expected native linux/amd64 config IDs from the retained `A1-readonly-feasibility.jsonl` snapshot (19October10:46UTC):

| Service | Native config ID |
|---|---|
| app | `sha256:40eab86dcef61d7cffa51b3f959fb81cc82b50a1a08f72eb2ad204876ce203e5` |
| postgres | `sha256:79bd7c99e923138f136f8009d6bffa66e21e9d4fda5c0c561b00fc9c90cfe537` |
| redis | `sha256:f84b0c4678011602b9b98c227a4dcd5468bf8b088b02fdd4165cb7758bad8058` |
| storage | `sha256:7f83e629265eb971e0c4dfb2ed1aabfd6ed90e4ec024fbbe5305019a4750de1d` |

The snapshot pins images.tar SHA256 `3fdc4e75a5f5d4e25136b3ebcac335d7280b0840014e20e98402118652f1d544`, manifest `4daa31368d1789534d25a173905319c1c6bd42173c0e9229d2fee589450c553c`. These four IDs agree with the older17October saved VFS config set/per-service mapping. Saved OCI index IDs are different identities and are recorded separately. This is historical expected/archive/VFS evidence, not the last failed daemon's image-ls output.

Inspected current task-private metadata/logs, M1 artifacts19October and the related p04a A1 resume/recovery artifact logs17October. The last run's local stdout1165bytes and safe receipt1524bytes retain the Failure/code/stage but neither actual_ids nor loaded/mapped sets. The older image-identity report explicitly records runtimeImageLsOutputRetained=false. No full backup image archive or last dockerd log copy was found in the inspected task/artifact trees; no claim about all disks/chats or server-only records.

Pinned candidate Restore.run persists stdout/stderr only on a nonzero command exit. Successful image ls/inspect at606–608 stay in memory; mapping checkpoint613 follows failed guard232. V4's bounded projection omits both sets. Re-reading the same receipt cannot recover missing stdout. The original check remains `set(loaded) == set(mapped.values())`. Missing/extra last-run IDs and underlying cause remain **ROOT_CAUSE_NOT_PROVEN → NO FIX**; the known expected set reduces the evidence gap to the actual daemon response and its context.

Prepared a concrete **passive file-only collection plan**, outside Git at existing `artifacts/lentaro-m1/2026-10-19/A1-image-id-collection-plan.md`. It proposes one separately authorized pinned SSH session reading only the failed run's already saved stdout/stderr/diagnostic/proof/termination/dockerd log, under private ancestry/hash/stability gates. No daemon, Docker CLI, image changes, helper install, reservation/history writes, restore, live data/env or provider operations. Full private bodies/config/Env are not exported; incomplete evidence remains UNKNOWN. Existing VFS configs and individual log references must not be labeled as the complete failed-run image-ls set.

Current stopped-store reads and the broader /proc/daemon-config inventory are excluded from this minimal plan because they cannot recover the past CLI response. If passive server files lack the past CLI output, that historical response cannot be reconstructed reliably. Stop the passive collection; any later short daemon image-inventory-only action requires its own reviewed scope because daemon startup may write its store. No executable fallback helper or new restore attempt is prepared or authorized. Never replay the consumed A1 package to obtain IDs. Verified recovery remains mandatory before updating the working server; M1 candidate b7c331e is preserved.

Outside-Git evidence: `A1-image-id-local-findings.json` SHA256 `d565ecb867c02cd3d843e32ed4eefa1a54469cd1e65728d86767c2ac8da73417`; source feasibility JSONL `61a2e03b0df078f92c6e78f3826a597274108251535df5cf9086c6828d289b9b`; older08b log `c2a7fbb0d05fcfb3af84dc6b276e5a7f0800ec0785dfe6152d56f20eb9651ad2`. No full unchanged-M1 tests repeated.

Independent local-only findings/proposal review PASS is retained outside Git as `A1-image-id-local-review.md`. It independently checks historical hashes/native-ID mappings and the passive scope limits; no tests, network or server action by the reviewer.
