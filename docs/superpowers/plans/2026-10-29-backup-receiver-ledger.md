# Backup receiver execution ledger — 29 October 2026

Spec: 2026-10-29-windows-recurring-backup.md. Source base afd388b on isolated
worktree agent-catalog-decision-loop, feature branch codex/windows-backup-20261029.

Ruling: deliver the existing-snapshot receiver as the first independently testable
source component. The remote producer/watchdog and scheduler remain separate
tasks; a green receiver does not authorize installation or snapshot creation.
Reason: existing one-shot producer has SSH/process-failure and date/config-path
assumptions. Cost: recurring backup remains NOT_INSTALLED until the remaining
components and their failure rehearsals pass. This does not close S6 automation.

Known WIP at start: PROJECT_STATE cleanup checkpoint, VPS cleanup report and draft
recurring-backup design from earlier turns. No reset/stash/cleanup performed.
Existing worktree identity verified; new branch created at the same exact HEAD.

Receiver contract: exact five-file completed source snapshot; strict fixed-host SSH
reads only; private directories/files, bounded transfer, immutable manifest on
resume, per-file hashes, inter-process exclusion, atomic completion and preserved
last_success. No source secret data, network/provider calls or real transfers in tests.

TDD: watched missing-module RED, then functional GREEN; independently found broad
payload ACL and unbounded subprocess-capture risks were each reproduced as RED.
Windows child PowerShell inherited a module path that prevented Set-Acl loading;
direct SID/.NET ACL APIs removed that dependency without weakening checks.
Additional RED proved non-inheritable private directories must be rejected before
metadata writes. New-file ACLs are checked explicitly too.

Independent read-only review: backup_receiver_review identified two P2 issues,
then one residual new-metadata ACL gap. All addressed with regression coverage;
Final independent disposition: no remaining actionable findings within receiver
slice. Fresh Windows Python3.11 suite: 17 tests,16PASS/1POSIX-only symlink skip,
45.771s. Real Windows ACL/inheritance, inter-process locking and noisy subprocess
regressions included. No Linux/runtime/restore claim from this local result.

PR #77 acceptance documentation at afd388b: fresh GitHub readback confirms
CI40817992058 and Self-host40817992057 SUCCESS. That is separate from this branch.
No merge, deploy, server stop, infrastructure change, transfer of real secrets or
new provider operation performed by the receiver implementation work.

Cross-platform CI found a separate Windows creation defect at ab32ad1: Linux
passed, Windows rejected a newly created lock with PRIVATE_ACL_REQUIRED.
Diagnostic-only51b044a proved owner_matches=False, other_allow_grants=False,
exit2 (owner mismatch), unlike local Windows owner_matches=True. New files on
the hosted runner receive a different default owner despite private inherited
DACL. Fix explicitly initializes owner/DACL only on freshly created files before
any data write; pre-existing broad/mismatched files still fail closed. No retries,
skipped assertions, increased limits or access-policy relaxation used.
