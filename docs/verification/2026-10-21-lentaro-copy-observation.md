# M1 copy observation — local feasibility component

Owner approved the M2 plans and Native execution on21Oct. Their prerequisite remains M1 recovery/release/Owner testing. This change checks one proposed measurement mechanism; it does not execute or authorize a recovery attempt.

## Observed gap and bounded deliverable

Saved f17 evidence identifies the VFS copying path during the timed-out Node create, but contains no time series of its file progress. Root cause remains NOT_PROVEN. Frozen executed recovery helpers and their retained files are unchanged.

`scripts/recovery/copy_observation.py` reads metadata for two explicitly selected open FDs of an independently verified process. It checks process start ticks before/after, regular-file identity around each read, bounded proc-file input and monotonic sample brackets. Its comparison rejects process/file changes, source-size changes, shrinking destination, incompatible/negative offsets, overlapping samples and observations outside a request window of at most60s. Positive matching offset deltas mean only PAIR_OFFSETS_ADVANCED; zero means only NO_OFFSET_ADVANCE_OBSERVED. Every result retains rootCause=NOT_PROVEN.

The observer never selects a PID, discovers a daemon, reads file contents, sends a signal, connects to Docker/SSH, generates permission, changes timeouts or launches a restore. Its ownership callback is a required integration boundary, not a replacement for the existing ownership gates. Proc metadata reads are non-atomic and are not forcibly interruptible by this component.

## Verification

Meaningful RED: comparison/parser tests failed because their implementation was absent; after minimal implementation,5/5 passed. The metadata-observer fixture then failed because observe was absent; after implementation, Windows6/6 passed with one explicit Linux-only skip. The dedicated GitHub workflow runs the whole isolated Python component suite and a real copy_file_range/real procfs test using only its own process and temporary files.

Exact source859da3713a84af3e52efd78e26f21e5e53a1d1a8: [push CI39550108148](https://github.com/barsikdan-hue/Planly/actions/runs/39550108148) and [PR CI39550112479](https://github.com/barsikdan-hue/Planly/actions/runs/39550112479) SUCCESS. Parent directly inspected job119057111173 log:7 tests,0 skips,OK, including real Linux copy/procfs. This is a tiny synthetic component test, not M1 application CI or VPS acceptance. Checkout@v4 emitted a Node20 deprecation warning while GitHub forced its execution on Node24; no test failed.

One fresh independent Critic reviewed all four original changed files at4e7cbb5…859da37: no Critical/Important findings. One Minor deferred: extremely large synthetic integers can raise OverflowError/ValueError instead of conservative result/Incomplete; real procfs counters do not have those sizes. The component remains NOT_DISPATCHABLE. Later evidence/state-only additions were self-reviewed by the parent; a second independent review is not claimed.

The Linux test measures two snapshots between controlled copy calls. It does not reproduce the VPS failure, prove observation during one long syscall, or validate a Docker integration. Upstream Linux [copy_file_range syscall implementation](https://code.googlesource.com/linux/torvalds/linux/+/1e2f2d31997a9496f99e2b43255d6a48b06fbcc2/fs/read_write.c) updates file positions after vfs_copy_file_range returns. Therefore unchanged offsets cannot rule out work inside that call. This is a feasibility limit of the proposed measurement, not a verified fact about the VPS kernel build. Existing M1 application source/build/tests are unchanged and were not repeated.

## Feasibility decision and remaining gate

This is a component, **NOT_DISPATCHABLE** as a recovery package. A future caller still has to prove request attribution and source/destination FD lifecycle, use the actual pinned daemon copy implementation, preserve the absolute60s deadline, collect aggregate workload and simultaneous owned-process/device measurements, and retain failures before validation. Same inode reopened between samples, a single long syscall, rapidly closed FDs or no observable advance must stay inconclusive. No kernel-stall, disk-pressure or overall copy-throughput conclusion follows from these offsets alone.

Only after that cohesive integration and independent review can a concrete new restore scope be proposed. Old server grants remain consumed; no new server command or restore was issued for this work.

Primary references checked21Oct: Linux [procfs FD offsets](https://www.kernel.org/doc/html/v6.8/filesystems/proc.html) and upstream [fsutil copy_file_range implementation](https://github.com/tonistiigi/fsutil/blob/master/copy/copy_linux.go). The upstream implementation uses implicit FD offsets; the exact version inside the saved VPS daemon has not been established by this change.
