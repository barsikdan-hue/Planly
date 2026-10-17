# P04-A final staging recovery/release plan — NOT EXECUTED

**Decision: BACKUP_GATE_PENDING; STAGING_RELEASE_NOT_AUTHORIZED; RELEASE_READY=false.** This plan responds to [independent audit6232696490](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6232696490). The source/schema preflight is supported; a fresh complete retained recovery set and practical image rollback are still missing. No command below is current authorization.

## Fixed pre-state and evidence

| Pin | Required value |
| --- | --- |
| Proposed source | `da7ad737a3236f1c161ae46c519386e05869f47a` |
| Existing staging source | `83a0350203d1d37ad0cbbb2e6d61934485b877e1` |
| Existing web and worker image | `sha256:79c1878d12e3fe9cff1dbc68558bbb8c3f15a41d724fb3977ee3a50021194aef` |
| Current durable ledger | 13 entries through0012; preserve every existing raw hash/timestamp |
| Pending migration0013 | LF SHA256 `4046a5c1aff1bbd94e76a05fa506013d9ef0004dd3692458b51d6ee0d663ab10`; timestamp1792213200691 |
| Pending migration0014 | LF SHA256 `649c443272b60e441090444bd5515b61910cc437d6da1ef97ac6a0d2aa9dcaad`; timestamp1792223636894 |

[current-evidence.json](current-evidence.json) records10:21:03UTC read-only state and the prior isolated rehearsal with explicit provenance. Five original container/image/start/mount identities and all22 table fingerprints matched the prior baseline. PostgreSQL17.11; Redis AOF/RDB statusok; MinIO healthy and object-file tree unchanged. Actual all-owner/all-enabled-state Telegram/MAX inventory: duplicateGroups0, aliases0, nullDestinations6; all9accounts disabled/disconnected; publications0; queue active/wait/delayed/prioritized/paused/waiting-children/completed/failed all0; provider configuration absent. These are observations, not permanent guarantees. Recheck before any approved write and stop on drift.

Existing Compose project/env/config references must be discovered from current container labels and privately matched to the retained release context. Do not substitute a newly generated `.env`, rotate credentials or log resolved Compose. PostgreSQL/Redis/MinIO and their named volumes remain running throughout app quiescence, backup and release. No `down -v`, destructive CI/self-host scripts, volume recreation, existing-DB restore or OS reset.

## Permission boundaries

Two independent release decisions are required. **A1 is the immediate backup-only request**. **A2 is a separately explicit image-preparation permission** that the Owner may grant alongside A1 to avoid an extra coordination round. Neither permits a staging migration/deploy. If only A1 is approved, candidate build and compatibility remain blocked. **B is a later exact staging release gate, not issuable with missing proof IDs**. Approving A1/A2 must never be read as approving B.

### A1 — fresh backup/readback only, ready for Owner review

Proposed private bundle ID: `p04a-ledger13-recovery-20261017-r1`. It is **not created**. Stop if the ID/directory already exists; never overwrite a previous attempt. On approval:

1. Acquire one staging operation lock. Record exact container/image/source/Compose/env mappings privately. Recheck the fixed pre-state above, public source/CI, complete current ledger and schema, no competing migration/build/release, zero publication/queue work, absent provider credentials and disabled accounts. Any new AUTH/PUBLISHING/AMBIGUOUS history or external sender requires a new disposition; do not process it as a probe.
2. Quiesce all application admission without changing DNS, proxy configuration, env or secrets: **stop/drain the exact existing web container first**, so HTTP ticks, OWNER bootstrap and READY saves cannot admit work; then gracefully signal/drain the exact existing worker. This web-first alternative deliberately avoids leaving an accessible web sender during worker shutdown. Worker has no web dependency. Keep PostgreSQL/Redis/MinIO running. Signal only validated owned IDs; never stop all services in one unordered command.
3. Do not rely on the Compose60s worker default or on a shutdown log. The worker waits BullMQ current work but does not await a periodic reconciliation already in flight. Next normally waits HTTP connections and may exit143; privately verify its shutdown mode. Use graceful signalling with bounded observation, **no automatic SIGKILL escalation**. If grace exceeds the approved maintenance budget, process remains alive, OOM/kill occurs, locks persist or outcome is uncertain: HOLD, capture safe diagnostics, no backup certification or automatic restart. Only actual process/container exits plus zero other application DB writer transactions and stable empty queue/publication inventories establish the frozen snapshot epoch. Do not stop storage under active work.

   Future command form, **only after A1 approval**, validated immutable IDs and confirmed `unless-stopped` restart policy: `docker container stop --signal SIGTERM --timeout -1 "$WEB_ID"`, then the same command for `"$WORKER_ID"`. Run each as a monitored operation; an observation-budget timeout must not turn into a positive Docker stop timeout or a kill. The Docker daemon's `-1` stop timeout avoids its default forced SIGKILL; manual stop also avoids restart-policy loops. This is the planned manual-stop path, not `docker kill`, a Compose60s default, or an instruction to execute now. See [Docker stop](https://docs.docker.com/reference/cli/docker/container/stop/) and [restart-policy rules](https://docs.docker.com/engine/containers/start-containers-automatically/).
4. Create a new private root0700 bundle, files0600, same VM only. Read/capture:
   - PostgreSQL17 custom dump, schema, all13 ledger rows, counts/canonical original-row digests and sequence states. This includes existing users, roles/access state, password/token hashes, sessions/epochs, invitations, private posts/targets/media references, account ownership/destinations, receipts and complete AUTH/ambiguous history if any. Any unexpected data drift from approved pre-state stops this attempt.
   - Full recoverable private MinIO archive plus manifest and each referenced object checksum/length; preserve MinIO metadata required for restoration, not merely media IDs.
   - Redis logical key/value/type snapshot with absolute expiration epochs and complete BullMQ job/state inventory, read through nonmutating commands. Do not run SAVE/BGSAVE, FLUSH, repair, reconciliation, queue removal or retry. Two keys/DBSIZE alone are insufficient. Compare TTLs against elapsed server time; expire-only changes and the known worker lease require explicit classification, never a blanket ignore.
   - Exact immutable source/config references and private unchanged **staging-only** auth/env recovery files; no credential rotation. Sensitive recovery copies remain root0600 and never enter GitHub/logs. Preserve SESSION_SECRET and source session rows together; production credentials/data are excluded.
   - Exact current app image and PG/Redis/MinIO dependency IDs plus `docker image save` archives, source/Compose mappings and checksums. Only selected image IDs; no pruning or mutable-tag-only guarantee. Existing-image retention is authorized by A1; candidate build is not.
5. Before certifying the bundle, restore its DB/media/Redis/config into task-owned isolated copies. Never mount live writable volumes or join the live network. Validate every DB table/column projection, schema/ledger/sequence; private session/credential continuity without logging cookies; media bytes/references/order; Redis values/types and expiration semantics/job inventory. Load saved image archives in an isolated Docker image store/daemon, not by changing live tags. Record actual archive hashes, image IDs, restore result, source/epoch and tool exit statuses in a retained private manifest; publish only sanitized proof. A manifest/Toc/checksum alone is not restore proof.
6. Test the retained exactold image against an isolated restored ledger13 copy, external egress blocked; verify health, preserved session/private reads/media and no data loss. No real provider tokens are added. This proves current-state old-image recoverability, not P04 behavior on schema15.
7. A1 includes conditional return to service of the **same stopped old container IDs** only if live ledger13/schema/business/media/config are still exact, no transaction/claim/uncertain handoff survived, recovery capture has not changed live state, and no kill/drift occurred. Start old web, verify health and expected no-send state, then old worker; verify source/data/queue/session continuity. No Compose dependency startup, migration or new image. If any condition fails, remain HOLD and report; no automatic cleanup trap may restart writers. Resume closes the frozen epoch: any later state drift invalidates that snapshot as a release baseline and requires a newly authorized A1 refresh. A1 does not keep staging offline indefinitely while awaiting B.

**A1 downtime scope:** one maintenance window, maximum20minutes from web stop to conditional old-version resume; no forced termination to meet that budget. If it cannot be safely resumed, HOLD and notify immediately. Isolated readback may continue after a safe old-version resume, but bundle certification still requires full proof. No claim of disaster recovery: data and backup remain vulnerable to loss of this VM/disk; off-VM recovery is unverified and #65 remains deferred. Owner must retain that stated residual risk.

### A2 — optional candidate-image and practical rollback preparation only

This permission is separate from literal backup-only A1 and must be explicitly named if granted. No existing DB migration or release.

- Build source `da7ad737a3236f1c161ae46c519386e05869f47a` from canonical Git blobs (`git -c core.autocrlf=false archive` plus a verified manifest), existing Dockerfile/lock/config; never copy actual `.env` into the build context. Pin OCI/source labels. Do not change source, build config, env, infrastructure, base services or secrets. Use existing build capability only, sequential bounded work with available-resource checks; if enforceable memory limits/resource headroom cannot be established on the4GB host, STOP rather than launch an unbounded build or create a new builder/service. No pruning to make room.
- Record candidate image ID and SQL bytes/hashes; save candidate archive to the same private recovery set without replacing old images/tags. Verify archive load/use in an isolated Docker store. Candidate ID remains **NOT_BUILT** until this actually runs; do not invent it in gate B.
- From a certified A1 bundle, restore independent clone-only DB/Redis/media/auth copies. Run candidate's actual single migrator on the clone (13→15), verify original rows/history/sessions/media unchanged, and run exactcandidate health/assets/private UI and no-provider tests. Rehearse code rollback to exactold image against a **separate migrated copy**, preserving schema15/ledger/evidence; keep old web/worker sender paths blocked. Test interrupted startup/failure with only owned isolated resources. Verify preservation before/after. `docker image inspect` alone is not practical rollback proof.
- Source/schema/image-only rollback success does not make old83a a safe processor for new P04 work: it lacks binding/revision admission, cancellation behavior and OWNER ERROR fencing. A safe B rollback remains conditional on no newly admitted P04 history or on a separately reviewed reconciliation.
- Publish sanitized exact candidate/old image archive IDs, hashes and executed compatibility/rollback proof. No real Mini App setup/read/send, no new staging credential, no existing network/volume changes.

### B — staging migration/release, not requestable yet

A later Owner approval must explicitly name all of the following **actual verified values**, with no placeholders accepted:

1. Target source `da7ad737a3236f1c161ae46c519386e05869f47a`, verified candidate image ID and SQL pins above; existing83a source, ledger13 complete hash/timestamp pin and original app/data container/volume IDs.
2. Certified **current** A1 bundle ID/manifest SHA, frozen epoch, PG/media/Redis/auth/image archive IDs/hashes and successful restore/readback proof; A2 candidate and migrated-schema old-image practical rollback results; immutable public evidence links. None currently exists for a retained full ledger13 bundle.
3. Exact downtime/sender stop/start order and an explicit acceptance of residual **single-VM-loss / OFF_VM_RESTORE_UNVERIFIED** risk. No production cutover/destructive operation is included.
4. Explicit permission for existing staging migrations **0013 and0014 only** and application replacement. No env/secrets, provider setup/reads/sends, Render, DNS, production DB or real publication permissions are implied.
5. Conditional code-only rollback scope, if approved: retain schema15, old/new evidence and data; use exactold image only if no new P04 admission/history can be processed by old web/worker. Restoring a DB over existing state is excluded and needs a separately explicit destructive recovery gate.

After B approval, repeat the A1 read-only drift checks and stop/drain as above. Compare the frozen live state to the certified bundle; if any unclassified change since A1/resume, STOP and obtain a new backup refresh authorization. B must not silently create an unapproved new backup or rely on stale artifacts.

With writers proved absent and data services unchanged, run exactly one candidate `migrate` service with `--rm --no-deps --pull never`, `PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s'`, command `node node_modules/drizzle-kit/bin.cjs migrate`. No implicit migrations via blanket Compose startup. Observe the actual target DB/schema/history afterwards, not just CLI output. PostgreSQL's DDL transaction does not make sequence allocations transactional.

Only after exact15-entry ledger/full schema/original-field/session/media/Redis/config checks PASS: start **candidate web only** (`--no-deps --pull never`), verify source/image/HTTPS/assets/health and private data/session/media/isolation with absent providers. Confirm self-service unavailable/fail-closed; zero READY writes and no OWNER bootstrap as a harmless probe. Then separately start worker after zero sendable work/no-provider checks. Require exact worker image/source and sender inventory; no automatic retries or real provider calls. PostgreSQL/Redis/MinIO identities/volumes remain unchanged throughout. UI acceptance and provider acceptance stay distinct.

## Partial failure / crash dispositions

The pinned drizzle-kit0.31.10→drizzle-orm0.45.2 PostgreSQL migrator wraps **all pending SQL plus their ledger inserts in one transaction**. Ledger setup and the prior last-row read are outside it; no migration-level lock prevents a competing migrator. Enforce one operation/migrator; validate historical raw hashes independently because the tool uses timestamps to select pending work.

| Durable observed state | Permitted recovery within a separately granted scope |
| --- | --- |
| Backup interrupted before all files/proofs complete | Mark attempt incomplete; keep prior artifacts; no migration or release. No partial directory becomes a certified backup. Conditional old resume only after all live-state/no-send checks pass and A1 permits it. |
| Drain timeout/kill, active writer or uncertain handoff | HOLD. Keep data services available, preserve history; no forced restart/retry/cancel/restore. Obtain specific disposition. |
| Migrator failed/disconnected; exact original13 ledger, no0013/14 schema, original business projection intact | No durable migration commit observed. Sequence gaps are possible; do not reset them. Diagnose failure before any retry; conditional exactold resume only if included in gate and proved safe. |
| Lost/failed CLI acknowledgement; exact15 ledger and complete0013+14 schema, old fields intact | Commit may already have succeeded. Fully verify and continue only within the granted gate; never rerun as though schema13 or restore old data. |
| Ledger14, partial DDL, mixed/unexpected hashes or old-field drift | Unexpected for a single transactional invocation. HOLD with writers stopped. Investigate concurrency, bytes, target DB and interruption; no ledger edit/down migration/blind retry. |
| PostgreSQL recovering, migrator may still be running or durable outcome unreadable | Keep application writers stopped. Wait/read durable recovery and check all migrator/backend identities; no new migrator, restore or restart as a probe. |
| New web fails before any P04 admission; old-image-on-schema15 proof valid | Only explicitly approved code rollback may be used; retain schema15/journal/data. Validate before web, then worker. No dependency recreation. |
| New binding/receipt/cancellation/AUTH/ambiguous/publication history exists | Freeze relevant writers and reconcile. Old web bootstrap/READY paths and old worker must not process it. No old DB replay or automatic resends. |

No cleanup trap may infer success, auto-retry, restart writers or restore data. Exact attempt/source/image/schema state and private phase evidence must survive a failed controller/SSH session; reread durable state before deciding. A writable phase marker is operational bookkeeping, never a substitute for DB/image/data proof. Current task created no such file on the VM.

## Source proof for ordering and limitations

- [Worker signal hooks](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/worker/index.ts#L9-L26): close worker→queue→Redis→DB.
- [Worker runtime/reconcile](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/lib/server/scheduler/worker.ts#L36-L70): a periodic reconciliation may remain in flight at shutdown.
- [Compose worker grace](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/compose.yaml#L115-L134):60s is not a whole-job deadline.
- [OWNER bootstrap](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/app/api/bootstrap/route.ts#L11-L18), [READY creation](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/lib/server/create-post-handler.ts#L30-L35) and [tick endpoint](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/app/api/scheduler/tick/route.ts#L22-L25) show why web is a sender/admission path.
- [Nullable0014](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/drizzle/0014_approval_cancellation.sql), [0013](https://github.com/barsikdan-hue/Planly/blob/da7ad737a3236f1c161ae46c519386e05869f47a/drizzle/0013_gorgeous_iron_lad.sql) and existing isolated failure proof support schema preparation, not permission for a persistent migration.

## Exact Owner wording to choose explicitly

**A1 only, immediate request:** “Разрешаю только создание и изолированную проверку свежего полного staging backup `p04a-ledger13-recovery-20261017-r1` при pre-state `83a0350203d1d37ad0cbbb2e6d61934485b877e1` / ledger13, включая одну maintenance-паузу до20минут, сохранение старых image artifacts и условный запуск тех же старых контейнеров по разделуA1. При drift/небезопасном shutdown — HOLD. Off-VM recovery не доказана, риск потери VM сохраняется. Не разрешаю candidate build, staging migration/deploy, live restore, изменения secrets/env, provider calls, Render или DNS.”

**A2 optional, requires separate explicit words even if in same reply:** “Дополнительно разрешаю только изолированную сборку exactsource da7ad737a3236f1c161ae46c519386e05869f47a, сохранение candidate image и clone-only candidate/old-image rollback rehearsal поA2. Не разрешаю подключать их к действующим staging данным или выполнять staging release.”

**B later:** Not submitted for approval. Fill every actual recovery/candidate/proof field listed above after A1/A2. Then issue a new exact Owner request naming persistent0013/0014 and staging deploy. No broad “approve release plan” answer closes B automatically.
