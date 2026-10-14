# P02-A targeted PUBLISHING correction

Scope: the owner's targeted correction in existing Draft PR56. Starting HEAD395b9f7bb1bff254901801ea0f67a0ac653b7516, branch codex/p02-a-multiuser-auth, main ce46b4a. No new PR/features, Scheduler redesign, production operations or provider sends.

Contract and plan: reproduce real default-transport PUBLISHING for a user without provider access; retain existing AMBIGUOUS_DELIVERY normalization and persisted receipt; prove no repeat send. Move only the proven guard ordering, then targeted/full native regression, typecheck/lint/build/compiled HTTP, independent read-only Critic, push and exact-head CI/Self-host. Use systematic-debugging/TDD/verification with native loopback PostgreSQL/Redis and GitHub checks; no production fallback.

ROOT_CAUSE: lib/server/scheduler/processor.ts / processPublication. After terminal-state checks, the new hasOwnerProviderAccess guard ran before existing PUBLISHING uncertainty handling. On access denial its conditional update only matched SCHEDULED/QUEUED, leaving PUBLISHING untouched, then returned early. The existing markFailure(PERMANENT, AMBIGUOUS_DELIVERY) was unreachable. Older processor tests injected a resolver and bypassed the real-transport guard.

RED at395b9f7: new native cases for ACTIVE USER and initialized BLOCKED legacy ADMIN, both using the actual default resolver, failed with providerErrorCode null instead of AMBIGUOUS_DELIVERY. Auth file16/18, two intended failures, zero skips. This proves the ordering defect rather than a missing provider configuration or a transport failure.

Minimal correction: existing PUBLISHING branch precedes provider-access denial. Terminal states and SCHEDULED/QUEUED provider gating remain in their existing order. No changes to claim, retry, account mutation, media preparation or connector business logic.

GREEN: targeted81/81, zero failures/skips. Native cases assert FAILED/PERMANENT/AMBIGUOUS_DELIVERY, nextRetryAt null; unchanged remote ID/URL/destination/publishedAt/lastAttemptAt/attemptCount; unchanged connected account; second processor invocation returns terminal FAILED/skipped and leaves the complete row unchanged; network calls zero. Coverage includes old processor/receipt, non-ready publication, retry race, publication APIs and scheduler worker/tick/reconcile.

One initial GREEN command had an incorrectly set NODE_TEST_CONTEXT and executed no tests; it was discarded, not counted as verification. The fresh standard native invocation produced81/81 above.

Fresh local full/native Windows run:1127/1128, zero skips; sole failure is unchanged tests/self-host-init.test.mjs baseline path conversion (`C:\\C:\\...SMM%20Planer...`, MODULE_NOT_FOUND), not hidden or repaired in this targeted change. Typecheck/lint/build/compiled Next ADMIN/A/B HTTP exit0; lint has16 pre-existing warnings, zero errors. Build's ANALYTICS_CSS_OK guard passed. Native Linux full CI and Docker Self-host must verify the pushed correction; their exact-head results are recorded in PR56. Local evidence remains distinct from production/provider acceptance.

Independent read-only Critic cleared the bounded source/test delta:0 P0/0 P1/0 P2. It independently checked the real-resolver coverage, unchanged receipt/attempt/account, repeat-call stability, RED16/18 and GREEN81/81, and noted that the fix restores existing behavior without adding concurrency/revocation semantics. Remaining full/release checks are not inferred from this source clearance.

DEPENDENCY / OWNER_GATE: PR55fe58221 remains Draft/unmerged at inspection. No P01 code copied. After its authorized acceptance/merge, integrate current main and repeat native CI/compiled HTTP/Self-host. Merge/deploy, production migration/DB, secrets/infrastructure and real provider sends remain gated and were not performed.
