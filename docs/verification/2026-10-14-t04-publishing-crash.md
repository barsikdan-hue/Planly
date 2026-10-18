# T04 / GAP01 — isolated crash characterization

## Scope and authority

Source main `ce46b4a0a5791eb6da75834dce4d7ecc95361938`; Render remains LIVE `2f13a5acc8a8010bfdc989cc99deb4655b584747`. No production DB access/write, provider calls, retries, publication, deployment or infrastructure change. Isolated native PostgreSQL17.11 and Redis7.2.16 bind only loopback; existing migrations apply only to `planly_test`.

Contract/plan: inspect durable claim, worker/tick/reconciliation and retry filters; terminate a dedicated child at two exact boundaries using a fake connector; read persisted state and exercise recovery entrypoints in isolation; retain fail-closed no-resend behavior; record evidence before any runtime repair.

## Proven source flow and reproduction

1. `processor.ts::processPublication` atomically changes SCHEDULED/QUEUED to PUBLISHING and increments attemptCount before media/provider handoff. Provider handoff and receipt persistence occur later; local `handedOff` only helps catch exceptions while that process survives.
2. `tests/helpers/publication-crash-child.ts` exits with code70 without unwinding, either inside the connector resolver before handoff, or after IPC-reported fake acceptance inside `publish`, before returning a receipt. No real network connector is selected; child fetch is blocked and env contains only loopback test DB plus OS runtime variables. Parent verifies child exit and fake-acceptance IPC evidence.
3. Both cases persist PUBLISHING, attemptCount1, lastAttemptAt present, remoteId/error fields null. The zero-send and one-fake-acceptance outcomes are indistinguishable in the persisted receipt.
4. `tick.ts::runDuePublications` and `reconcile.ts::reconcileScheduledJobs` select only SCHEDULED/QUEUED. A tick scans0 for this fixture, reconciliation does not enqueue it, and the persisted row stays PUBLISHING. Temporary retry preparation refuses it.
5. Explicit re-entry into `processPublication` recognizes PUBLISHING and changes it to FAILED/PERMANENT/AMBIGUOUS_DELIVERY. Connector calls0, attemptCount remains1, nextRetryAt null; subsequent retry and processor re-entry remain no-send.

**PROVEN_SYNTHETIC_GAP:** a claimed row without a retained queue redelivery is not rediscovered or diagnosed by web tick / DB queue reconstruction. This is not evidence that every crashed BullMQ job is lost: retained stalled-job recovery may re-enter the existing ambiguity path. The test does not claim to verify BullMQ hard-crash lock expiry/recovery.

**HISTORICAL_ROOT_CAUSE_NOT_PROVEN:** no retained historical crash/worker/queue/receipt evidence links the old GAP01 observation to these boundaries. Existing tests already prove direct stale-PUBLISHING no-resend and graceful worker restart before due time; they did not establish this process-loss path.

## Decision and verification

- No runtime fix. Blind retry is unsafe: durable state cannot distinguish a pre-handoff crash from provider acceptance without a stored receipt. Do not turn PUBLISHING into a retryable state or invent a timeout cutoff.
- Smallest follow-up Owner design decision: whether to add stale-claim diagnostics, with an explicit liveness/lease or quiescence rule that cannot label an active publish as dead. Keep ambiguous outcomes non-retryable; provider reconciliation remains a separately authorized action. This report does not authorize Phase10 hosting/worker provisioning.
- New characterization tests2/2 PASS on unchanged runtime; no RED/GREEN bugfix claim. Targeted processor/tick/reconciliation/worker regression29/29 PASS plus publication retry/edit/duplicate race regression20/20 PASS,0fail/skip/cancel. Simulated provider outcomes only.
- Native typecheck, independent Critic and actual exact-head CI/Self-host are recorded in the PR and Issue49 after completion. Full CI covers existing regression/typecheck/lint/build/migrations/E2E; no production recovery acceptance is claimed.

Status: INVESTIGATED / historical root cause NOT PROVEN / NO RUNTIME FIX. Owner diagnostics-design gate; do not close GAP01 as fixed.
