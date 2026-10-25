# T01: preserve Planly data before Render PostgreSQL expiry

Status: **OWNER_INFRA_DECISION_REQUIRED**. This is the read-only decision deliverable for [Issue #49 / T01](https://github.com/barsikdan-hue/Planly/issues/49), not backup execution, migration or production acceptance. No dump, data download, secret retrieval, access change, upgrade, service creation or deploy occurred. Historical backup/TLS investigations and PR38 remain unchanged.

## Current evidence

Checked 2026-10-14: GitHub main `ce46b4a0a5791eb6da75834dce4d7ecc95361938`; Render LIVE remains `2f13a5acc8a8010bfdc989cc99deb4655b584747`. The difference is PR48's test fixture, not a database/runtime migration.

Read-only Render metadata for `dpg-dav06rk1nsns7380jvv0-a`: PostgreSQL 17, Free, status available, HA disabled, external `ipAllowList=[]`. Exact expiry: **2026-10-31T06:53:34.087713Z = 31 October 09:53:34 Moscow**. Latest active-connection sample returned 1 at 06:49:07.078UTC; sampled hour range 1–6. This establishes connection activity, not row counts, archive existence or recovery readiness.

Owner/Codex reported two published posts and AVAILABLE analytics observations in the separately authorized 14 October test; see the [scoped live report in PR47](https://github.com/barsikdan-hue/Planly/blob/f5b12f7206e707a7f12eb4447f806790c8136e2d/docs/verification/2026-10-14-phase8-live-telegram-max-acceptance.md). The retained local JSON was read by the Driver, but current raw production DB rows were not independently inspected. These reported new records must be preserved; the earlier Owner waiver of a mandatory pre-Swipe backup does not establish permission to discard today's data. Whole-database size, table counts, R2 object inventory and any privately retained backup are UNKNOWN.

Fresh [Render Free documentation](https://render.com/docs/free#free-postgres) confirms expiry/inaccessibility and a subsequent 14-day grace period before deletion. The grace period is not a working database or a migration window to rely on. Free has no managed backup/recovery; the [recovery documentation](https://render.com/docs/postgresql-backups) excludes Free. Free web services lack Shell/one-off jobs, so do not invent an existing internal export runtime. MCP metadata/metrics are available, but SQL access is externally blocked; its read-only SELECT tool is not a restorable archive exporter. No new SQL/TLS attempt was needed.

**BACKUP_EXISTS=UNVERIFIED; RESTORE_TESTED=NO; NO_DATA_LOSS=NOT_PROVEN.** Published provider messages are not a backup of Planly's identity, media, ledger or account data. Git and successful CI contain source/synthetic fixtures, not current production records.

## Persistence that must survive

| Source of truth | Preserve / verify |
|---|---|
| PostgreSQL `db/schema.ts` and migration journal | Owner/account relationships, posts/targets, publications and primary/frozen destinations, metrics, Library/media links, creation attempts, scheduling operation receipts, Swipe receipts/current feedback; retain all idempotency and ambiguous-delivery history |
| Private S3/R2 objects | `media_assets.storage_key` refers to bytes outside PostgreSQL; dump includes metadata only. Preserve bucket/object keys and bytes, private access and signed-preview semantics. Inventory/readback is separately authorized; do not delete objects |
| Server-only configuration | Secure continuity of owner/session, provider credentials, S3 access and VK encryption key versions. Record names/presence only; an encrypted VK envelope without its key is not recoverable. No secrets in dumps' public logs, Git, chat or helper URL |
| Redis/BullMQ | Queues are subordinate to durable publication state. Reconstruction must preserve retry deadlines and never resend PUBLISHED or reset uncertain PUBLISHING. Do not treat Redis restoration as authorization to send |

`render.yaml` ties DATABASE_URL to the existing database; build automatically runs `db:migrate`. `compose.yaml` supplies isolated PostgreSQL 17/Redis/media volumes, useful for a future restore drill only. Existing bootstrap performs publication catch-up and worker startup can enqueue/send: neither is a read-only restore-validation endpoint.

## Decision options (all unexecuted)

| Option | Concrete benefit | Gates / limits |
|---|---|---|
| A: upgrade the existing Render DB before expiry | Lowest cutover complexity; retains the existing database and gains supported paid recovery going forward | Explicit Owner budget/plan approval and infrastructure operation. Paid recovery does not retroactively prove a backup or today's restore. Expected downtime and recovery availability must be checked privately before execution |
| B: verified export, then migrate to Owner-selected PostgreSQL 17 host (including Selectel) | Durable archive and tested recovery before hosting switch | Owner approval for credentials/network, archive destination, restore environment/cost and later cutover. Target quotas/compatibility and actual access are UNVERIFIED. A clean empty target requires a separate intentional data-reset decision; it is not data-preserving migration |
| C: temporary constrained internal export helper if the direct route remains blocked | Conditional way to use Render private DB connectivity | Existing historical helper design is not implemented/accepted. Separate infra/design approval, quota/cost proof, synthetic tests, manual one-shot claim, public-key encryption, narrow upload capability and cleanup gate. Never dump on startup or give the helper Planly master credentials. No guaranteed zero cost |

Recommended Owner decision: choose A as a deadline bridge if preserving data urgently outweighs cost, or B only when verified export/restore and a concrete cutover window can finish before expiry. C is a fallback proposal, not the default implementation. No option is selected automatically.

## Minimal backup and verification contract

After a separate backup/access gate, use the already available PostgreSQL 17 tools and existing private credential path. Do not put passwords in argv/URLs/output. If choosing external access, approve only an exact temporary source `/32`, privately verify network/TLS once, and restore the closed allowlist even on failure. Do not repeat the earlier failed TLS experiment or disable certificate validation by inference.

1. Obtain read-only inventory: source/version, extensions, database size, migration journal and per-table counts; capture identity/ownership, FK and durable receipt invariants without content/credential dumps in reports. Inventory media keys and an approved byte-check sample separately.
2. Produce one consistent custom-format archive using `pg_dump -Fc` (PostgreSQL 17) to an Owner-approved durable private destination. PostgreSQL documents consistent snapshots without blocking ordinary writers, but a successful dump covers only its snapshot; it does not include subsequent writes. See [pg_dump17](https://www.postgresql.org/docs/17/app-pgdump.html).
3. Close temporary external access; independently read back closure. Verify nonzero artifact size, SHA256 of retained bytes, secure retention/access and `pg_restore --list`. These checks alone do not prove successful recovery.
4. Restore into a fresh isolated PostgreSQL 17 database only after its separate resource/write gate, with strict error handling and compatible extensions. Compare journal/table counts, ownership/FKs, receipt identities, metrics, media references and selected media bytes against the source snapshot. Do not point production at this drill.
5. Validate Planly using synthetic credentials and blocked provider transport/scheduler. Never use the production owner bootstrap or real bots to prove restore. An independently reviewed manifest plus successful isolated restore is the minimum **VERIFIED_BACKUP** evidence.

Failed/partial/unknown archive or lost upload acknowledgement => STOP and inspect the original artifact/claim; never label it backup or launch a duplicate helper automatically. Preserve every source resource. Dump restore/security/cost assertions remain unverified until these steps actually run.

## No-data-loss cutover and rollback

A consistent preliminary dump is not a no-data-loss cutover. Before a final export, Owner must approve an enforceable write/dispatch freeze covering UI/API writes, scheduler tick/worker sends and webhook metric writes. Drain known in-flight operations; unknown provider handoffs require reconciliation, not reset/retry. An existing maintenance freeze has not been proven and must not be assumed. If freeze cannot be enforced, do not claim zero RPO; use a separately designed migration/replication strategy or option A.

After freeze, take/verify the final snapshot and restore it to the approved target. Record the final source manifest and stop writing to the old database. Separately approve DATABASE_URL/runtime changes; account for Render build's automatic migration command and inspect expected migration drift before applying it. Verify owner login, read-only identities/media/metrics and durable ledgers with provider transport stopped. Only Owner authorizes resuming the one active writer/dispatcher.

Rollback is a connection/runtime return to the still-retained original database **only** if it is available and no newer target writes would be lost; never drop/rollback schema. Once target writes occur, reconcile/export those changes before any return. After expiry, original DB availability cannot be assumed; recovery must use verified retained bytes. Keep original DB and archives until explicit release/retention approval; no automatic deletion.

## Dates and smallest Owner action

Proposed planning deadlines, Moscow time; no automation created:

- **16 October:** Owner chooses A/B (or explicitly reviews C), approves the exact budget/access/export scope and names the operator/durable destination. No silent continuation past this decision.
- **20 October:** first archive and isolated restore drill verified, or A completed with paid recovery availability confirmed and an independent export still planned.
- **24 October:** approved final cutover completed and verified, if choosing B; otherwise confirm bridge remains valid. Leave several days for defects/rollback.
- **27 October:** final independent recovery/retention check. Do not schedule first export on31 October.

The hard platform deadline remains31 October 09:53:34 MSK; these earlier dates are proposals, not an Owner promise or permission to spend.

Smallest current action: **Owner select and authorize one preservation route with an explicit cost/access boundary**. T01 stops at OWNER_INFRA_DECISION_REQUIRED. T07 infrastructure implementation/design remains gated; independent approved T02 may proceed. This plan neither asserts data-loss permission nor silently replaces the earlier Selectel intent.
