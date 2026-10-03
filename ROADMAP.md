# Personal SMM Planner / Planly

CURRENT PHASE: 4 — Telegram/MAX publication and UI completion.
CURRENT GOAL: remove duplicate sidebar entry points and place social-account management in Settings while preserving the create/publish flow. No AI generation or paid Render resources.

DONE
- Next.js UI, owner auth/session, PostgreSQL/Drizzle Foundation and Content Core.
- Server-authoritative posts/targets, private S3 media and real API persistence.
- BullMQ worker, bounded retry, duplicate protection and restart reconciliation.
- Docker Compose: web + worker + PostgreSQL + Redis + private media, migrations and bucket setup.
- Optional public S3 preview endpoint; existing S3/R2 behavior is preserved.
- Telegram and MAX text/media connectors are implemented and wired to the publication processor.
- Sidebar/settings fix implemented on codex/sidebar-social-settings: editor remains reachable, legacy social links open Settings. Merge and production deployment remain gated.

TESTED
- UI fix: 7/7 targeted tests, 8/8 screen renders, typecheck/lint/build passed. Local full regression is 102/157 passing with the same 55 baseline environment/platform failures. Desktop/mobile local browser navigation and Settings passed; production still shows the original defect pending approved deployment.
- Handoff baseline main 3ca04bdce9fc06cd5cb4b98d391d8eaeff03d5a6: CI 37098458070 passed 150/150 tests, migrations, typecheck, lint and build; Self-host build 37098458073 passed.
- Telegram LIVE VERIFIED historically: text/photo/video/album evidence below and media run 37099195801. MAX LIVE VERIFIED historically: run 37098655387 confirmed text, image/video with and without captions, album, delayed publication and duplicate skip through a GitHub Actions Planly stack against the real provider. This does not establish a fresh Render browser publishing test.
- Current Render deployment matched the handoff SHA and /api/health returned HTTP 200 with status ok. Details and local verification limits: docs/verification/2026-10-03-handoff-inspection.md.
- Upstream main 37b1b418: standard CI passed.
- GitHub standard CI on 8503e4f: 78 PASS, migrations/typecheck/lint/build passed. Local dependency limitations were not reproduced on the runner.
- Self-host CI on 26fe369e passed: real Docker images, migrations, web/worker boot, authenticated HTTP and private media, full stack recreation with persistent data, Redis-loss reconciliation and honest unsupported-provider failure. Bucket initialization uses writable /tmp/planly-mc for its non-root client.
- Verified source + compiled Next.js build artifact was emitted after the successful container smoke. Latest branch CI artifacts provide the exact tested commit. Initialization also rejects malformed emails containing backslashes to preserve dotenv quoting.

KNOWN ISSUES
- The requested sidebar/settings change was absent from deployed main at handoff. The local replacement UI is verified; a fresh production walkthrough remains required after approved deployment.
- Local Windows baseline: PostgreSQL/Redis integration services are unavailable; self-host-init.test.mjs has an existing URL.pathname/Windows path failure. The same baseline passes all 150 tests in Linux CI.
- AI and real analytics remain later phases.
- Owner-server DNS/TLS and backups have not yet been deployed.

TECH DEBT
- Historical Sites/Vinext dependencies increase image size; removal is outside this task.
- Ambiguous provider-handoff delivery requires review, never blind resend.
- Historical baseline files describe earlier checkpoints; current code/CI supersede their runtime statements.

REMAINING GATE before final build handoff: green fix-branch CI, explicit owner approval for main merge and manual production deployment, then a fresh browser walkthrough on Render. Prior provider verification does not replace this UI gate.
ACTIVE MILESTONE: Phase 4 — finish the sidebar/settings UI and preserve publication reliability.
USER DECISION (2026-10-01): resume the roadmap at Telegram publication tests; online verification precedes downloading the final working build. Packaging is not a substitute for completing this phase.
IMPLEMENTATION PLAN: docs/superpowers/plans/2026-10-01-telegram-publication.md.
HISTORICAL CHECKPOINT (2026-10-02): 114 tests, typecheck, lint, migrations and build passed. Actual Docker runtime including worker private-media reads and restart passed. Text live verification: run36971050067. Photo/video/delayed album live verification: run36971756220, commit b931a7a4. Safe media remote IDs/links: docs/verification/2026-10-02-telegram-media.json.
LIVE TARGET: @danil_sochi_realty (owner’s group), sender @danil_sochi_realty_bot; instructions: docs/TELEGRAM_TEST.md.
NEXT MILESTONE: complete browser acceptance and the approved delivery of this UI change. AI remains deferred until the owner explicitly resumes it.
