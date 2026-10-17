# P04-A staging preflight: public evidence summary

**Status: SOURCE_SCHEMA_PREFLIGHT_SUPPORTED; STAGING_RELEASE_GATE_CHANGES_REQUIRED. RELEASE_READY: false.**

This is a sanitized summary of the **prior Codex-run observations on 2026-10-17**, with the isolated rehearsal recorded at **10:04:25 UTC** and the final read-only staging check at **10:06:04 UTC**. It records historical evidence, not a fresh current-state attestation, deployment approval, staging feature acceptance, or provider acceptance. Fresh read-only drift evidence and the proposed release/recovery sequence are separate artifacts.

## Provenance and source pins

The local report and rehearsal log are the source for the VPS observations below. This publication does not turn those observations into an independent VPS review. The [independent gate review](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6232696490), published at 10:14:02 UTC, independently checked GitHub source and workflow success; it explicitly did **not** inspect the local report, raw backup evidence, or staging database readback. Its decision remains CHANGES_REQUIRED with no deployment or migration authorization.

| Public code/image pin | Recorded value |
| --- | --- |
| Exact proposed source | `da7ad737a3236f1c161ae46c519386e05869f47a` |
| Prior observed staging source | `83a0350203d1d37ad0cbbb2e6d61934485b877e1` |
| Prior observed web/worker image | `sha256:79c1878d12e3fe9cff1dbc68558bbb8c3f15a41d724fb3977ee3a50021194aef` |
| Prior staging migration ledger | 13 applied entries, through 0012; 0013/0014 absent |

The prior report recorded that all 606 tracked deployed release files matched the staging source pin. These historical pins must be rechecked before a future runtime write.

- Exact-source [CI 39022298851](https://github.com/barsikdan-hue/Planly/actions/runs/39022298851) succeeded on attempt 1. The prior controller reported reading the original job log: native 1560/1560; browser 88 passed with 4 configured duplicate-project skips; lint 0 errors/22 existing warnings; typecheck, build, migration drift and compiled HTTP checks passed.
- Exact-source [Self-host 39022299088](https://github.com/barsikdan-hue/Planly/actions/runs/39022299088) succeeded on attempt 1. The prior report recorded private-media, stack recreation, PostgreSQL/media persistence, Redis-loss reconciliation and compiled HTTP checks passing. The separate Telegram-live job was skipped.

The public gate review independently confirmed both workflow successes. This drafting pass read that review; it did not rerun workflows or independently re-read their original job logs. CI and Self-host evidence do not establish live provider or staging feature acceptance.

## Prior isolated schema rehearsal

Only disposable, task-owned PostgreSQL copies were migrated and restored. The prior report describes an isolated PostgreSQL 17 container with no external network, published ports, or existing data mounts; temporary data storage; and the actual pinned migrator running canonical source SQL. No application web/worker was started for the rehearsal. Existing staging remained read only. Temporary memory storage could swap; this is not a claim of unswappable data handling.

| Incoming canonical Git LF migration | SHA-256 | Journal timestamp | Bytes |
| --- | --- | --- | --- |
| `0013_gorgeous_iron_lad.sql` | `4046a5c1aff1bbd94e76a05fa506013d9ef0004dd3692458b51d6ee0d663ab10` | 1792213200691 | 6328 |
| `0014_approval_cancellation.sql` | `649c443272b60e441090444bd5515b61910cc437d6da1ef97ac6a0d2aa9dcaad` | 1792223636894 | 87 |

The prior controller reported independently comparing canonical Git bytes with an LF archive. The existing 13 ledger entries corresponded to the historical CRLF release archive; their raw values and timestamps were preserved. No deployed migration, existing ledger hash, or source encoding was rewritten.

1. A fresh, read-only staging snapshot was restored into an isolated copy. All 22 original table comparisons, schema and sequence state matched.
2. A forced lock failure in 0014, after 0013 DDL, produced PostgreSQL `55P03`. Business rows, schema and ledger rows rolled back unchanged. Only the disposable ledger sequence advanced from 13 to 14, as expected for nontransactional sequence allocation; it was not reset. The live sequence did not change.
3. The normal actual migrator completed 0013 then 0014. **Ledger 13 to 15 occurred only in the isolated copy.** The original 13 ledger rows/hashes/timestamps remained unchanged; the two additions matched canonical source. All original business fields compared equal under projection onto the original schema. Four new tables were empty; all 9 account counters were zero with null windows; both target cancellation markers were null, nullable `timestamptz`, without a default. Staging had zero publications, so nonempty publication-pointer preservation was not demonstrated by this dataset.
4. A second migrator run completed with identical data, schema and ledger. A separate isolated restore of the fresh pre-migration snapshot matched original rows, sessions, schema and sequences.
5. Two separate synthetic collision fixtures covered numeric destination normalization and case/space alias collisions. Both rejected with `SOCIAL_CONNECTION_LEGACY_DUPLICATES` before DDL, preserving rows, schema and the 13-entry ledger.

Actual staging inventory was a separate prior read-only observation: **0 canonical Telegram/MAX duplicate groups, 0 unresolved aliases, and 6 null Telegram/MAX destinations**. Synthetic rejection tests do not substitute for that inventory or a fresh current duplicate/drift check. No winner selection, ownership proof, or legacy ownership backfill was inferred or performed.

## Preservation observations and their limits

The prior report recorded projected preservation across all 22 original tables, including these aggregates:

| Original staging data | Prior aggregate |
| --- | --- |
| Users / sessions | 3 / 3 |
| Draft posts / active targets | 1 / 2 |
| Media assets / post-media associations | 1 / 1 |
| Social accounts | 9; all disabled and disconnected |
| Publications | 0 |

The prior report recorded unchanged original row values, account ownership/status/destinations, media references and metadata. The media file tree was compared locally without exporting media. All five original containers were retained, with the same images and mounts; configured healthchecks were healthy. The worker had no healthcheck. The final prior read-only check recorded ledger 13, no 0013/0014 additions, zero disposable containers remaining, and HTTPS 200.

These observations do not prove post-release cookie/session validity, signed media playback, preservation of nonempty historical AUTH/ambiguous publication outcomes, or a logical Redis restore. The prior report recorded Redis unchanged; Redis snapshot/readback and queue reconciliation were not rehearsed here.

## Recovery and acceptance gates remain open

- **CURRENT_DURABLE_BACKUP_NOT_PROVEN.** The older retained same-VM archive was restored and read back in isolation, and its required manifest checks passed. It contains ledger **12**, while the observed staging state had ledger **13**. It is archived historical recovery evidence, not a current staging rollback baseline. The fresh rehearsal snapshot was temporary and removed. No current complete, durable PostgreSQL/Redis/MinIO/session/media recovery set has been demonstrated.
- **PRACTICAL_IMAGE_ROLLBACK_UNTESTED.** No exact candidate image was built or exercised here. The known staging image digest is not proof of a safe rollback image. Old-image behavior on migrated data, sender fencing, partial-migration recovery and an executable practical code rollback remain release prerequisites. Snapshot restoration was tested only on disposable copies, never over staging. An old worker must not process newly admitted P04 work; historical receipts and AUTH/ambiguous outcomes must remain immutable.
- **OFF_VM_RESTORE_UNVERIFIED.** Same-VM archive and readback do not establish disaster recovery. Independent off-VM copy/restore remains unverified and the separate recovery issue remains Owner-deferred. Loss of the single VM can therefore still lose application state and retained backups together.
- **PROVIDER_UNVERIFIED.** The prior report recorded absent Telegram/MAX credentials and Mini App URLs. Native registration/eligibility, signed launch validation, bot/human membership, MAX TLS trust, return to the original browser/session, provider reads and counted sends remain unverified. Missing configuration cannot establish functional acceptance; any future schema-only release proposal must separately show self-service fails closed. Provider configuration, real provider calls and sends require their own gates.

The separate release plan must retain the exact source/staging pins, a fresh current duplicate/drift check, current retainable recovery artifacts and restore proof, candidate/rollback image evidence, downtime/sender ordering, crash/partial-migration recovery, and explicit stop conditions. A backup-only Owner gate must precede backup creation when required by the authorized scope. Persistent 0013/0014 migration and staging deployment require a later exact Owner approval after those proofs.

This report's preparation performed no SSH or application commands, runtime/build actions, GitHub mutation, branch change, provider call, or secret/configuration change. Public content is limited to aggregate observations, code/image/SQL pins and public evidence links; private records and raw recovery artifacts are not included.
