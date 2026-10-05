# Personal SMM Planner / Planly

CURRENT STATE: Phase 5 Content Library DONE and deployed at owner checkpoint `49a16c977aed425c99e5fa81bcb3705526a5653c`.
CURRENT MILESTONE: Phase 6 Swipe Planner implemented on `codex/phase6-swipe-planner`, pending CI/Self-host and owner merge/deploy gates. [Verification](docs/verification/2026-10-04-swipe-planner.md).
NEXT MILESTONE: close Phase 6 through authorized delivery and production acceptance; additional networks require an explicit decision.

PERMANENT WORKFLOW (2026-10-04): Harness 0–8 — identity → inspect → contract → root cause → plan → minimal implementation → fresh verification → push/CI/PR and owner merge/deploy gates → short report. Remote-first is not remote-only: local tests and browsers support development; final user-facing acceptance uses the existing Render deployment in a browser. Edge is preferred, not mandatory. Full autonomy and human gates: [AGENTS.md](AGENTS.md).

## Approved phases

| Phase | Scope | Status / boundary |
|---|---|---|
| 0 | Foundation: runtime, auth, database and storage | DONE |
| 1 | UI | DONE for MVP; evolves within approved milestones |
| 2 | Content Core | DONE |
| 3 | Scheduler core | DONE for MVP; timing is accepted debt until Phase 10 |
| 4 | Telegram + MAX Functional MVP | DONE; scoped production acceptance below |
| 5 | Content Library | DONE and deployed |
| 6 | Smart Content Queue / Swipe Planner | Implemented; owner merge/deploy gate pending |
| 7 | Additional networks | Only after an explicit owner decision |
| 8 | Analytics | Future |
| 9 | Scheduling automation | Future |
| 10 | Target hosting optimization | Future self-hosted/rented-server deployment and scheduler timing review |

AI is REMOVED from the product roadmap, not deferred or optional.

## Historical Phase 4 acceptance — 2026-10-04

Functional MVP PASS combines the owner-confirmed production UI/media/MAX handoff at the deployed SHA with the final fresh Telegram gate. MAX was not freshly rerun for this gate. Detailed scope and evidence: [Functional MVP production acceptance](docs/verification/2026-10-04-functional-mvp-production-pass.md).

- Exact-main CI [37185070550](https://github.com/barsikdan-hue/Planly/actions/runs/37185070550) succeeded: 243 passed, 0 failed/skipped; migrations, typecheck, lint and build passed. [Self-host 37185070546](https://github.com/barsikdan-hue/Planly/actions/runs/37185070546) succeeded. Existing GitHub results were freshly checked.
- Telegram `getMe` / `getChat` / `getChatMember` confirmed identity, destination and posting permissions; the account is enabled and CONNECTED at canonical chat `-1004390954741`.
- PNG upload and preview followed by publication: marker `TGFINAL-M-0854`, post `15ed2d66-202b-4417-b3a0-8841974e8d65`, PUBLISHED with [Telegram receipt 31](https://t.me/danil_sochi_realty/31).
- Scheduled plain text at 12:02 MSK / 09:02 UTC: marker `TGFINAL-S-0854`, post `772c5d1c-e8da-4882-954a-f6cded1d460e`, PUBLISHED with [Telegram receipt 32](https://t.me/danil_sochi_realty/32).
- Fresh public Telegram DOM confirmed one message per marker and PNG only on the media message. Scheduler dispatches `37190611775` and `37190878155` each processed 1 / published 1 / failed 0; repeat `37190962756` scanned 0 / published 0 / failed 0.
- Health returned HTTP 200; Render had zero error logs in the checked 08:53:37–09:04:44 UTC window.

## Implemented and deployed

- Next.js UI, owner auth/session, PostgreSQL/Drizzle Foundation and Content Core.
- Server-authoritative posts/targets, private S3 media and real API persistence.
- BullMQ worker, bounded retry, duplicate protection and restart reconciliation.
- Docker Compose: web + worker + PostgreSQL + Redis + private media, migrations and bucket setup.
- Optional public S3 preview endpoint; existing S3/R2 behavior is preserved.
- Telegram and MAX text/media connectors are implemented and wired to the publication processor.
- Sidebar/settings fix deployed at 3d1fcbad82a5321dce9073fb18b51b7b0319e08f: editor remains reachable, legacy social links open Settings. Fresh read-only production walkthrough confirmed the change on 2026-10-03.
- Functional fixes are deployed at `af628854`: pre-enqueue content validation with terminal VALIDATION, same-tab editor recovery, selected media preview order, durable same-key creation retry after lost responses, and immutable published/uncertain originals with a separate draft-copy action.

## Historical branch and local evidence

- Source head 2ab4b4b: [CI 37132808635](https://github.com/barsikdan-hue/Planly/actions/runs/37132808635) passed 243/243 tests with zero failed/skipped, including native PostgreSQL creation races and edit/processor locking, plus migrations/typecheck/lint/build. [Self-host 37132808641](https://github.com/barsikdan-hue/Planly/actions/runs/37132808641) passed Docker runtime, private media, restart persistence and Redis-loss recovery. Both tested synthetic PR merge 16667c9 against production checkpoint 3d1fcba; this was not a merge to main. The live-provider job was skipped.
- Final compiled Next.js local production runtime at 127.0.0.1:3100: HTTP audit 10/10 and boundary audit 5/5 passed, covering validation rollback, media transport, independent provider outcomes, retry deadlines, same-key creation and immutable published content. Provider/storage transport used loopback fixtures.
- Local Edge verified all sections, editor field/media recovery after reload, selected media order, two-second video playback, visible Telegram 4097/MAX 4001 validation, saved editing/scheduling, all three calendar views and slot selection, independent Telegram-published/MAX-failed outcomes, draft copying and deletion. Calendar dragging is not claimed as interactive proof.
- Local Edge fault checks: POST response replaced by 503 after commit, then reload caused no automatic POST; manual retry resolved the same ID with one post and one fixture send. A failed existing-post PATCH also preserved local text through reload and subsequent save. Detailed evidence and limits: docs/verification/2026-10-03-functional-mvp.md.

## Historical production and provider evidence

- Historical production checkpoint 3d1fcba: CI 37122967582 passed 157/157 tests; Self-host build 37122967583 passed. Render deploy matched this SHA and health returned 200. Authorized Edge read-only walkthrough covered Dashboard, Create Post, Content, Calendar, Media and Settings, including mobile Settings. No fresh provider sends were made during that audit.
- At this checkpoint local Windows verification was 102/157 passing: 54 checks needed isolated database services and one self-host-init test used a nonportable URL.pathname. Typecheck/lint/build passed. These local limitations do not supersede exact-SHA Linux CI.
- Handoff baseline main 3ca04bdce9fc06cd5cb4b98d391d8eaeff03d5a6: CI 37098458070 passed 150/150 tests, migrations, typecheck, lint and build; Self-host build 37098458073 passed.
- Telegram LIVE VERIFIED historically: text/photo/video/album evidence below and media run 37099195801. MAX LIVE VERIFIED historically: run 37098655387 confirmed text, image/video with and without captions, album, delayed publication and duplicate skip through a GitHub Actions Planly stack against the real provider. This does not establish a fresh Render browser publishing test.
- At the earlier handoff, Render matched its handoff SHA and /api/health returned HTTP 200 with status ok. Details and local verification limits: docs/verification/2026-10-03-handoff-inspection.md.
- Upstream main 37b1b418: standard CI passed.
- GitHub standard CI on 8503e4f: 78 PASS, migrations/typecheck/lint/build passed. Local dependency limitations were not reproduced on the runner.
- Self-host CI on 26fe369e passed: real Docker images, migrations, web/worker boot, authenticated HTTP and private media, full stack recreation with persistent data, Redis-loss reconciliation and honest unsupported-provider failure. Bucket initialization uses writable /tmp/planly-mc for its non-root client.
- Verified source + compiled Next.js build artifact was emitted after the successful container smoke. Latest branch CI artifacts provide the exact tested commit. Initialization also rejects malformed emails containing backslashes to preserve dotenv quoting.

## Remaining limits

- Historical browser file assignment was blocked by tool permission handling; this was an automation limitation, not a Planly defect or localhost gate. Current production media acceptance is recorded in the report above.
- Fresh final provider evidence covers the Telegram PNG and scheduled-text scenarios above; earlier accepted UI/media/MAX evidence retains its original scope.
- Real analytics remains Phase 8. AI is excluded.
- Owner-server DNS/TLS and backups have not yet been deployed.

## Accepted technical debt

- GitHub Actions scheduler trigger is not timing-reliable enough for production SLA. Final scheduler runtime will be revisited during self-host deployment.
- Scheduler timing is an accepted limitation of the temporary test deployment, not a blocker for this functional MVP milestone. Do not investigate trigger intervals or redesign the scheduler in this milestone.
- Historical Sites/Vinext dependencies increase image size; removal is outside this task.
- Ambiguous provider-handoff delivery requires review, never blind resend.
- Historical baseline files describe earlier checkpoints; current code/CI supersede their runtime statements.

## Historical milestone decisions and references

USER DECISION (2026-10-01): resume the roadmap at Telegram publication tests; online verification precedes downloading the final working build. Packaging is not a substitute for completing this phase.
HISTORICAL IMPLEMENTATION PLAN: docs/superpowers/plans/2026-10-01-telegram-publication.md.
HISTORICAL CHECKPOINT (2026-10-02): 114 tests, typecheck, lint, migrations and build passed. Actual Docker runtime including worker private-media reads and restart passed. Text live verification: run36971050067. Photo/video/delayed album live verification: run36971756220, commit b931a7a4. Safe media remote IDs/links: docs/verification/2026-10-02-telegram-media.json.
LIVE TARGET: @danil_sochi_realty (owner’s group), sender @danil_sochi_realty_bot; instructions: docs/TELEGRAM_TEST.md.
HISTORICAL IMPLEMENTATION PLAN: docs/superpowers/plans/2026-10-03-functional-mvp.md.

## Phase 5 contract — Content Library

Goal: conveniently store content prepared outside Planly. Inspect the existing implementation before choosing exact scope: prepared posts and media, search, useful filters/categories and simple import/add content. Introduce ready/scheduled/used/rejected states only where the UX requires them; do not over-engineer taxonomy. Implementation starts separately after documentation closure.

## Phase 6 contract — Smart Content Queue / Swipe Planner

- Swipe left → reject; swipe right → approve.
- Approved content → next free publication slot or manual date/time.
- Preset publication schedule; fill the calendar for a week/month.
- ContentSuggestion remains a suggestion until approval, then becomes a Post.
- Suggestions use non-AI sources. AI is excluded.

## Later-phase boundaries

- Phase 7 networks require an explicit owner decision; VK/Instagram are not automatic next work.
- Phase 8 analytics follows a stable core product.
- Phase 9 may add reusable slots, repeat content, better posting times and scheduling assistance, without AI.
- Phase 10 moves to rented/self-hosted hosting, then revisits a permanent worker, Redis/BullMQ runtime, scheduler precision, backups, DNS/TLS and monitoring.
