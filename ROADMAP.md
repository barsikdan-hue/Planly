# Personal SMM Planner / Planly

CURRENT PHASE: 4 — Telegram/MAX publication and UI completion.
CURRENT GOAL: finish the remaining acceptance and owner gates for the verified functional branch. Source head: 2ab4b4b on codex/functional-mvp. Production remains at 3d1fcba; no merge or deployment was performed. No VK, AI, analytics, scheduler redesign or paid Render resources.

DONE
- Next.js UI, owner auth/session, PostgreSQL/Drizzle Foundation and Content Core.
- Server-authoritative posts/targets, private S3 media and real API persistence.
- BullMQ worker, bounded retry, duplicate protection and restart reconciliation.
- Docker Compose: web + worker + PostgreSQL + Redis + private media, migrations and bucket setup.
- Optional public S3 preview endpoint; existing S3/R2 behavior is preserved.
- Telegram and MAX text/media connectors are implemented and wired to the publication processor.
- Sidebar/settings fix deployed at 3d1fcbad82a5321dce9073fb18b51b7b0319e08f: editor remains reachable, legacy social links open Settings. Fresh read-only production walkthrough confirmed the change on 2026-10-03.
- Completed on the functional branch: pre-enqueue content validation with terminal VALIDATION, same-tab editor recovery, selected media preview order, durable same-key creation retry after lost responses, and immutable published/uncertain originals with a separate draft-copy action.

TESTED
- Source head 2ab4b4b: [CI 37132808635](https://github.com/barsikdan-hue/Planly/actions/runs/37132808635) passed 243/243 tests with zero failed/skipped, including native PostgreSQL creation races and edit/processor locking, plus migrations/typecheck/lint/build. [Self-host 37132808641](https://github.com/barsikdan-hue/Planly/actions/runs/37132808641) passed Docker runtime, private media, restart persistence and Redis-loss recovery. Both tested synthetic PR merge 16667c9 against production checkpoint 3d1fcba; this was not a merge to main. The live-provider job was skipped.
- Final compiled Next.js local production runtime at 127.0.0.1:3100: HTTP audit 10/10 and boundary audit 5/5 passed, covering validation rollback, media transport, independent provider outcomes, retry deadlines, same-key creation and immutable published content. Provider/storage transport used loopback fixtures.
- Local Edge verified all sections, editor field/media recovery after reload, selected media order, two-second video playback, visible Telegram 4097/MAX 4001 validation, saved editing/scheduling, all three calendar views and slot selection, independent Telegram-published/MAX-failed outcomes, draft copying and deletion. Calendar dragging is not claimed as interactive proof.
- Local Edge fault checks: POST response replaced by 503 after commit, then reload caused no automatic POST; manual retry resolved the same ID with one post and one fixture send. A failed existing-post PATCH also preserved local text through reload and subsequent save. Detailed evidence and limits: docs/verification/2026-10-03-functional-mvp.md.

HISTORICAL EVIDENCE
- Current production checkpoint 3d1fcba: CI 37122967582 passed 157/157 tests; Self-host build 37122967583 passed. Render deploy matches this SHA and health returned 200. Authorized Edge read-only walkthrough covered Dashboard, Create Post, Content, Calendar, Media and Settings, including mobile Settings. No fresh provider sends were made during that audit.
- At this checkpoint local Windows verification was 102/157 passing: 54 checks needed isolated database services and one self-host-init test used a nonportable URL.pathname. Typecheck/lint/build passed. These local limitations do not supersede exact-SHA Linux CI.
- Handoff baseline main 3ca04bdce9fc06cd5cb4b98d391d8eaeff03d5a6: CI 37098458070 passed 150/150 tests, migrations, typecheck, lint and build; Self-host build 37098458073 passed.
- Telegram LIVE VERIFIED historically: text/photo/video/album evidence below and media run 37099195801. MAX LIVE VERIFIED historically: run 37098655387 confirmed text, image/video with and without captions, album, delayed publication and duplicate skip through a GitHub Actions Planly stack against the real provider. This does not establish a fresh Render browser publishing test.
- At the earlier handoff, Render matched its handoff SHA and /api/health returned HTTP 200 with status ok. Details and local verification limits: docs/verification/2026-10-03-handoff-inspection.md.
- Upstream main 37b1b418: standard CI passed.
- GitHub standard CI on 8503e4f: 78 PASS, migrations/typecheck/lint/build passed. Local dependency limitations were not reproduced on the runner.
- Self-host CI on 26fe369e passed: real Docker images, migrations, web/worker boot, authenticated HTTP and private media, full stack recreation with persistent data, Redis-loss reconciliation and honest unsupported-provider failure. Bucket initialization uses writable /tmp/planly-mc for its non-root client.
- Verified source + compiled Next.js build artifact was emitted after the successful container smoke. Latest branch CI artifacts provide the exact tested commit. Initialization also rejects malformed emails containing backslashes to preserve dotenv quoting.

KNOWN ISSUES / ACCEPTANCE LIMITS
- UI file-chooser upload is NOT PROVEN: the browser tool stopped before assigning files despite enabled permission and reconnection. HTTP PNG/MP4 upload passed; this does not close the chooser interaction gap.
- The functional branch has not been deployed to production. Fresh production walkthrough and live-provider acceptance remain gated; historical live sends and synthetic local outcomes do not establish those results.
- AI and real analytics remain later phases.
- Owner-server DNS/TLS and backups have not yet been deployed.

TECH DEBT
- GitHub Actions scheduler trigger is not timing-reliable enough for production SLA. Final scheduler runtime will be revisited during self-host deployment.
- Scheduler timing is an accepted limitation of the temporary test deployment, not a blocker for this functional MVP milestone. Do not investigate trigger intervals or redesign the scheduler in this milestone.
- Historical Sites/Vinext dependencies increase image size; removal is outside this task.
- Ambiguous provider-handoff delivery requires review, never blind resend.
- Historical baseline files describe earlier checkpoints; current code/CI supersede their runtime statements.

REMAINING GATE before final build handoff: close or explicitly accept the UI upload verification gap, obtain owner approval for main merge and manual production deployment, then perform the separately authorized fresh production/browser and live-provider acceptance. Branch CI is green; prior provider verification does not replace these gates.
ACTIVE MILESTONE: Phase 4 — functional fixes and branch verification complete, with the acceptance limits above. Each fix has its own root-cause evidence, tests and commit. Merge to main and production deployment remain explicit human gates.
USER DECISION (2026-10-01): resume the roadmap at Telegram publication tests; online verification precedes downloading the final working build. Packaging is not a substitute for completing this phase.
IMPLEMENTATION PLAN: docs/superpowers/plans/2026-10-01-telegram-publication.md.
HISTORICAL CHECKPOINT (2026-10-02): 114 tests, typecheck, lint, migrations and build passed. Actual Docker runtime including worker private-media reads and restart passed. Text live verification: run36971050067. Photo/video/delayed album live verification: run36971756220, commit b931a7a4. Safe media remote IDs/links: docs/verification/2026-10-02-telegram-media.json.
LIVE TARGET: @danil_sochi_realty (owner’s group), sender @danil_sochi_realty_bot; instructions: docs/TELEGRAM_TEST.md.
CURRENT IMPLEMENTATION PLAN: docs/superpowers/plans/2026-10-03-functional-mvp.md.
NEXT MILESTONE: after functional verification and approved deployment, move the app to the target self-hosted server and revisit scheduler runtime there. AI remains deferred.
