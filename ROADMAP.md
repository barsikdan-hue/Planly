# Personal SMM Planner / Planly

CURRENT PHASE: 4 — Telegram production slice.
CURRENT GOAL: continue Telegram implementation and verify real test-channel publication online before handing off the final build for the owner's server. No paid Render resources.

DONE
- Next.js UI, owner auth/session, PostgreSQL/Drizzle Foundation and Content Core.
- Server-authoritative posts/targets, private S3 media and real API persistence.
- BullMQ worker, bounded retry, duplicate protection and restart reconciliation.
- Docker Compose: web + worker + PostgreSQL + Redis + private media, migrations and bucket setup.
- Optional public S3 preview endpoint; existing S3/R2 behavior is preserved.

TESTED
- Upstream main 37b1b418: standard CI passed.
- GitHub standard CI on 8503e4f: 78 PASS, migrations/typecheck/lint/build passed. Local dependency limitations were not reproduced on the runner.
- Self-host CI on 26fe369e passed: real Docker images, migrations, web/worker boot, authenticated HTTP and private media, full stack recreation with persistent data, Redis-loss reconciliation and honest unsupported-provider failure. Bucket initialization uses writable /tmp/planly-mc for its non-root client.
- Verified source + compiled Next.js build artifact was emitted after the successful container smoke. Latest branch CI artifacts provide the exact tested commit. Initialization also rejects malformed emails containing backslashes to preserve dotenv quoting.

KNOWN ISSUES
- Telegram text/photo/video/album connector is implemented and wired to the existing queue and UI; real test-channel verification is still pending. MAX remains unimplemented.
- AI and real analytics remain later phases.
- Owner-server DNS/TLS and backups have not yet been deployed.

TECH DEBT
- Historical Sites/Vinext dependencies increase image size; removal is outside this task.
- Ambiguous provider-handoff delivery requires review, never blind resend.
- Historical baseline files describe earlier checkpoints; current code/CI supersede their runtime statements.

BLOCKER for Phase 4 completion: privately configured bot token, verified channel posting rights and real test-channel end-to-end confirmation.
ACTIVE MILESTONE: Phase 4 — Telegram validation, text/media delivery and end-to-end verification.
USER DECISION (2026-10-01): resume the roadmap at Telegram publication tests; online verification precedes downloading the final working build. Packaging is not a substitute for completing this phase.
IMPLEMENTATION PLAN: docs/superpowers/plans/2026-10-01-telegram-publication.md.
CURRENT CHECKPOINT: Telegram connector has 13 wire tests; integration regressions for media/permissions/retry delay/UI were reproduced and implemented. Full final CI and live Telegram gate remain to verify.
LIVE TARGET: @danil_sochi_realty (owner-supplied); instructions: docs/TELEGRAM_TEST.md.
NEXT PHASE: MAX after Telegram stability; AI after reliable publication.
