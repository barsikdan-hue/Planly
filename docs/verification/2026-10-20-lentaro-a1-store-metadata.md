# A1 — actual passive retained-store metadata observation

2026-10-20. Owner-approved proposal2cb96 was executed once, not extended to attribution, repair or restore. Productb7, all frozen executed sources and current working-server components were outside this read's mutation path. No further SSH or other server operation followed the collection.

## Exact result

Run `348eafdc-eaed-4b94-bfec-8ca8cef14e74`, one SSH/exit0, PASSIVE_OBSERVATION_COMPLETE/OBSERVED. Store identity device64770/inode1481483 matched. Immediate containers directory device64770/inode1481503, root UID0/GID0, mode456decimal=`0710`, directory. Its metadata/held-link identity checks completed. Exactly one immediate entry was observed: directory ENTRY_01, device64770/inode1482887, root:root0710, basename SHA `70601e3d105ec03fb1a9b9097fdcf76ea9077a5108443962f1e19fcd42ac7a80`. No raw basename or file body is exported.

The separate current predicates are uidRoot=true/gidRoot=true/noGroupOtherWrite=true/**empty=false**. Thus the currently reproduced store precondition is nonemptiness, not ownership/mode failure. The earlier run4423 did not retain individual operands; this later observation must not be retroactively called its atomic snapshot. Directory entries do not prove running containers, stopped state, ownership by a particular restore run or deletion authority.

Server writes0/file bodies0/Docker and daemon/container operations0/process scan0/restore0. Only fixed ancestors/store/immediate containers and one nonrecursive lstat were inspected, with read-only/no-follow/no-atime FD binding. No config/state/env/log/backup body was read. No provider, migration, deploy, merge, image removal or cleanup occurred. This read's single permission is **CONSUMED_NO_RETRY**, even while its clock window remains.

| Artifact | SHA256 |
|---|---|
| Approved proposal | `2cb96fdfba011d12970311fe9d4bdeef7449dbd40ec8f4e20d5b8c5d9e174892` |
| Readiness review | `09e3c0429a0eb69bbc646c043185d82a150f0ae73fd453db08b699d2d86baf94` |
| Grant | `a51066316fdda515c4101df2e4d72c72eb40cf922e9fce5c97b222490226a9e6` |
| stdin payload | `404999e9d4664311b3616c0198b233eaf794e50d807bfbcc593a926e52348b8c` |
| Safe receipt | `f3b6b5147241ecb8a4032ca33aa043250135722ff779a7719dcce150eed86a1c` |
| Safe stdout | `ba72936c544215567d26777ce13cc2fcda845990915a04ec6237102600123c43` |
| Empty stderr | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Public `A1-store-metadata-read-result.json` | `00420e32bba3691c3bee81299634d69679d2b9dcc70fe08e54b16dcf0159f068` |

## What is still unknown and safe continuation

The entry's exact original identity, labels, image, state, prior run and operational provenance are UNKNOWN (POSIX ownership is known UID0/GID0); no body was read under this authority. A bounded local search of209 existing task-private text/JSON/log/source files, up to2MiB/file, found no raw64hex token whose SHA matches that basename. Tokens were never printed. This local absence is not evidence of a foreign or unsafe object; it only prevents proving attribution from retained local material.

Oldrun49's subprocess command/type/stage/cause remains ROOT_CAUSE_NOT_PROVEN. One possible source-only path is that Restore.create appends an owned CID only after the create command returns; an unsuccessful reply can leave an unregistered daemon-side object. This is a conditional code-path hypothesis, **not a diagnosis of this entry or run49**. No speculative source/runtime fix was made.

The next work is local feasibility of one consolidated candidate: bounded attribution of only this exact object; a separately approved cleanup only if strict old-run ownership/stopped/isolation/security checks prove it is a prior owned clone, followed by original strict quiescence and one diagnostic restore. Unknown/mismatched/active objects must stop without mutation. No cleanup, daemon start or restore is currently authorized. Preserve retained images/store/backups/history and the failed equality/quiescence guards. Do not repeat this metadata collection or the old saved-log/image collection merely to retrieve IDs. Recovery and M1 deployment remain UNVERIFIED/NOT_DEPLOYED.

Independent actual-result review `172f06c8cccb8f6a858b1c17dc7e8b973caeafc1933b586bcdc0fb6870863c47` confirms the public/receipt hashes and current metadata projection. The209-file local token search is a coordinator annotation, not an independently repeated filesystem search. No new test or server operation was part of that review.

## Boundary found during local continuation preparation

Source inspection of frozen collector8e78 shows that its complete `collect_preflight()` includes `collect_full_baseline()`. After the original empty-store guard passes, that baseline invokes allowlisted working-Docker `inspect` for the five existing components and read-only `exec` commands: PostgreSQL SELECTs in READ ONLY transactions with statement/lock limits, schema-only pg_dump and the existing Redis logical-state reader in web. It also compares retained backup artifacts, source606 files, media metadata and private authentication/configuration/credential hashes in memory. It does not authorize writes to live data/configuration or provider calls.

Earlier generic package wording excluding all working-Docker/DB/env access is inconsistent with these inherited read-only baseline operations. A new cohesive approval must explicitly list them if the unchanged original complete recovery preflight is retained. They are not covered by the consumed passive metadata permission and have not been executed in this continuation. The pre-cleanup stage cannot call full `collect_preflight()` because the strict nonempty-container guard correctly rejects the current store; it must use separately described ancestry/source/preservation/process/resource checks, without claiming a complete recovery preflight or suppressing that guard.

Subsequent local preparation is now complete: [one cohesive conditional package](2026-10-20-lentaro-a1-single-entry-package.md), proposal3ef1b768/review528ea09c/33 focused checks. This adds no actual attribution/deletion/daemon/restore permission or runtime proof; passive348e remains the last server action.
