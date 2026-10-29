# Existing snapshot receiver (first recurring-backup component)

`pull_snapshot.py` copies **one already completed** staging snapshot. It does not
create a backup, stop services, install a scheduled task, select the latest backup,
delete old copies, restore data or call providers. It is not yet the complete
recurring-backup implementation. Requires Python 3.11+ and OpenSSH client.

The receiver accepts only fixed `saas-YYYYMMDD-<10 digit epoch>` snapshot names under
`/opt/planly-staging/backups` on the existing staging host. Each snapshot must have
a `FRESH_BACKUP_READY` manifest naming exactly the five files from the proven
26 October operation. The new server-side producer must preserve this contract.
Manifest bytes are pinned across retries; changed manifests fail closed.

Source data includes secrets. Destination must be outside Git/synced Documents,
with owner-only access. Windows uses SID-based .NET ACL checks; existing broad
permissions are rejected rather than silently changed. New directories receive
owner-only inheritable FullControl. Every accepted/new secret-bearing file is
checked before reading/writing. POSIX checks ownership and private mode bits.
Symlinks, junctions, reparse points and hardlinked files are rejected. An owner-only
directory does not defend against the same owner, administrator or root.

No actual transfer/secret access is activated by this source document. After the
separate transfer gate, an operator supplies:

```text
python -B scripts/backup/pull_snapshot.py
  --snapshot saas-YYYYMMDD-EEEEEEEEEE
  --destination <approved-private-directory>
  --key <existing-private-ssh-key-path>
  --known-hosts <verified-known-hosts-path>
```

Use one command line; placeholders are intentionally not executable defaults.
Strict host-key checking, batch mode and the existing fixed host are mandatory.
The only remote command is a bounded `head` read, not Docker/service control.
Output is also bounded locally; SSH stderr is discarded. Each file has a fixed
120-second transport bound; timeout/failure is reported without increasing it.

An OS file lock prevents parallel receivers and is released on process exit.
Files go to a private `<snapshot>.partial` directory, are individually fsynced and
verified by byte size and SHA256, then renamed into place. Interruption leaves a
partial copy, not a success marker. A later invocation resumes this same snapshot;
it never starts a second server snapshot. Unexpected corrupt completed files are
reported, never overwritten. Successful snapshots are not pruned.

`status.json` contains `last_attempt`, sanitized error/status, and `last_success`.
Failures preserve the previous successful record. Use `snapshot_created_at` to
judge recovery-point age, not `verified_at`: rechecking an old copy is not a new
backup. `COPY_VERIFIED` means transfer integrity only, not restore acceptance or
production readiness. Local success rename/status writes are atomic on the same
filesystem; sudden storage/hardware failure still requires restore testing.

Offline tests (synthetic data only):

```text
python -B -m unittest discover -s tests/backup -v
```

Windows runs real owner-SID ACL and inheritance regressions; Linux runs real
symlink checks. Both run real inter-process lock and noisy subprocess tests,
corruption/interruption/resume checks, and previous-success preservation tests.
GitHub `Backup receiver` workflow runs both OS lanes without server credentials.

Remaining recurring-backup components: detached server controller with independent
restart watchdog, disposable failure rehearsal, scheduler/status integration,
first authorized staging copy and independent restore. Do not install the old
one-shot `backup26_create.py` as an unattended job. Its service `finally` cannot
protect against loss of the SSH/controller process. The conservative producer
design also needs a separate resolution for normal calendars containing future
publications before this is suitable for a continuously used production service.
