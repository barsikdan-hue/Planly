# P02-A integration after P01-A merge

Contract: integrate verified current main249830b7a484743bd19b7d356633a2c0cd36e457 into existing codex/p02-a-multiuser-auth / Draft PR56, starting30afae0c9f27147677596771a734f94a2c2de3e5. GitHub confirms PR55fe58221 merged as249830b7. No new feature/PR, PR merge/deploy, production migration or real provider sends.

Plan: resolve the processor conflict preserving both security foundations; verify the integrated A/B/ADMIN, ownership/media, uncertainty/duplicate-send and native lock paths; run migration drift/typecheck/lint/build/compiled HTTP, full native GitHub CI/browser and Docker Self-host; independent read-only integration Critic; publish exact-head evidence in PR56.

Integration: one textual conflict in lib/server/scheduler/processor.ts. Existing P01 posts/media changes and tests merge unchanged. Processor order is terminal states → existing PUBLISHING/AMBIGUOUS_DELIVERY → P01 readScopedMedia/markScopeFailure → P02 owner-provider-access → claim → P01 post-claim scope recheck → existing transport. No claim/retry/provider redesign.

Ruling: retain P01 integrity diagnosis before P02 transport-access denial for SCHEDULED/QUEUED — a foreign graph must keep its approved PERMANENT/PUBLICATION_SCOPE_MISMATCH refusal even when the user lacks provider enrollment. Terminal history and uncertain PUBLISHING still take precedence. Wrong ordering would hide corrupt relations under an AUTH denial; integration regressions distinguish these outcomes.

Added real-default-resolver native cases for SCHEDULED/foreign account, QUEUED/foreign media and PUBLISHING/foreign media under USER. They require the existing P01 scope error or AMBIGUOUS_DELIVERY respectively, retained receipt/attempt, terminal replay stability, unchanged accounts/media and zero network calls. Existing ADMIN/A/B auth, suspended-owner uncertainty and P01 graph/lock/duplicate-claim cases remain intact.

Fresh local native regression125/125, zero failures/skips, on disposable loopback PostgreSQL16/Redis7. It includes auth/schema, all P01 graph/terminal/lock/duplicate-claim cases, processor/retry/publication/scheduler APIs, posts/media and synthetic provider integration. Migration generation reports no schema changes. Typecheck/lint/build/compiled Next ADMIN/A/B HTTP exit0; lint16 existing warnings/0 errors; ANALYTICS_CSS_OK passed. Full native PostgreSQL17 CI, desktop/mobile browser and Docker Self-host must verify the integrated pushed candidate. Exact-head verification and independent review results are recorded in PR56, distinct from production/provider acceptance. Historical reports at their original HEADs are not rewritten.

OWNER_GATE: P01-A dependency is satisfied by the verified merge and this integration, subject to passing integrated checks. P02-A PR56 remains Draft/unmerged until owner authorization. Production migrations/DB, secrets/infrastructure, deploy and real provider sends remain gated.
