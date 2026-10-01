# Personal SMM Planner / Planly

CURRENT PHASE: 3 — Scheduler and self-host build verification.
CURRENT GOAL: a transferable tested build for the owner's server without paid Render resources.

DONE
- Next.js UI, owner auth/session, PostgreSQL/Drizzle Foundation and Content Core.
- Server-authoritative posts/targets, private S3 media and real API persistence.
- BullMQ worker, bounded retry, duplicate protection and restart reconciliation.
- Docker Compose: web + worker + PostgreSQL + Redis + private media, migrations and bucket setup.
- Optional public S3 preview endpoint; existing S3/R2 behavior is preserved.

TESTED
- Upstream main 37b1b418: standard CI passed.
- GitHub standard CI on 8503e4f: 78 PASS, migrations/typecheck/lint/build passed. Local dependency limitations were not reproduced on the runner.
- Docker images built successfully. First runtime probe found a non-root mc configuration-directory permission error; bucket initialization now uses /tmp/planly-mc. Full runtime smoke is pending the fix verification.
- A build artifact is emitted only after container smoke passes; no verified self-host build artifact exists yet.

KNOWN ISSUES
- Telegram/MAX remain unimplemented; no real delivery is claimed.
- AI and real analytics remain later phases.
- Owner-server DNS/TLS and backups have not yet been deployed.

TECH DEBT
- Historical Sites/Vinext dependencies increase image size; removal is outside this task.
- Ambiguous provider-handoff delivery requires review, never blind resend.
- Historical baseline files describe earlier checkpoints; current code/CI supersede their runtime statements.

BLOCKER for real publishing: Telegram implementation and real test-channel verification.
NEXT MILESTONE: Phase 4 — Telegram validation, text/media delivery and end-to-end verification.
NEXT PHASE: MAX after Telegram stability; AI after reliable publication.
