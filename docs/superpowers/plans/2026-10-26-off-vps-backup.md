# Fresh staging backup outside VPS — prepared operation

Scope: NEWVPS62.173.149.73, /opt/planly-staging only. No production,
provider calls, migrations, image changes, paid resources or old-backup deletion.
Fresh preflight: source37dad64 clean; staging web/worker image4d952a running;
PG imageb0f9560; VPS free14,284,066,816 bytes, local C: free81,893,130,240 bytes.
Existing24October dump predates real-user26October activity and is not a current
recovery point. Local Docker/pg_restore unavailable; WSL command exists but no
restore runtime has been verified. Off-VM restore must not be claimed PASS yet.

## Exact proposed sequence (Owner gate pending)

1. Create timestamped server backup directory /opt/planly-staging/backups/saas-20261026-* mode0700.
2. Record current container IDs/images/start times, database counts/ledger21,
   media manifests and nonterminal publications. Abort if nonterminal is nonzero.
3. Briefly stop only planly-stage-web-1 and planly-stage-worker-1; keep PG,
   Redis and object storage running. Ensure both start again in finally after
   dump/archive success or failure. Do not leave services stopped awaiting input.
4. Produce fresh pg_dump in custom format, capture all referenced media/object
   storage data and required Compose/env/CA/secret configuration privately.
   Never print credentials or raw database rows. Persist consistent media/config
   inventory and image/source identifiers; Redis queue is not restored live.
5. Restart the same web and sole worker, check identity/image/health/nonterminal
   receipts and existing users/catalog. No deploy/recreate or scheduled sends.
6. Transfer over strict-host-key SSH to owner-only ACL directory
   C:/Users/EliteSochi/.codex/private/planly-backups/2026-10-26/ outside Git and
   synced Documents. This includes auth/session data, bot credentials and other
   application secrets; do not send them to cloud storage or third parties.
7. Compare every file size/SHA256 between server and local copy; report only
   aggregate counts and hashes. Keep both copies; never overwrite old backups.
8. Restore from the downloaded dump in an explicitly isolated rehearsal runtime,
   without sender/network access or working volumes. Select/verify that runtime
   before execution; do not install Docker/WSL or transfer copies to another host
   without authorization. Compare table counts/ledger and referenced media bytes.
   File hashes alone prove transfer integrity, not recoverability after VPS loss.

## Acceptance and limits

BACKUP_OFF_VPS_PASS requires current database/media/config outside VPS, restricted
ACLs, matching hashes and unchanged healthy runtime. RESTORE_PASS is separate and
requires actual isolated restoration from that copy. Production remains gated
until independently recoverable backup and exact cutover approval. A restore on
the original VPS can prove dump validity but not independence from VPS loss.

## Fresh off-VPS backup - 26 October 2026

Owner-approved fresh backup completed with brief stop/restart of only web/worker.
Server: /opt/planly-staging/backups/saas-20261026-1793002809.
Owner-only local copy outside Git:
C:/Users/EliteSochi/.codex/private/planly-backups/2026-10-26/saas-20261026-1793002809.
All5 manifest file sizes/SHA256 match after SSH transfer; archive282 files and all32
media-volume files individually hash-verified. Total transferred5,353,508 bytes.
DB counts users4/posts4/media7/publications3/catalog3/ledger21/nonterminal0.
Local ACL grants only current Windows owner. Old backups retained.

Dump SHA25666bb518147fba2e133b5cf872c30ab2395e32110b05d2813b0bd9a48b8738b53;
media/config SHA2569a85c4307156d4e9224e29e6c2e43cf77faa877622d5481098c93b8769955a23.
Same original container IDs/images preserved; web healthy, worker running,
restart counts0, counts unchanged, public health200. No deploy/migration/provider
calls. Redis live queue intentionally not restored. Independent pre-execution
review found no blocker after adding per-container restart handling. A read-only
preflight table-name mismatch was corrected before any service stop.

OFF_VPS_COPY_HASHES_PASS; RESTORE_NOT_VERIFIED. No local Docker/pg_restore runtime
found; WSL invocation returned help/error and did not establish a usable Linux
runtime. No installation performed. Next: choose isolated local restore runtime,
restore this downloaded dump and verify DB/media references without sender access.
Do not equate file integrity with independent recoverability or production acceptance.
