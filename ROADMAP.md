# Personal SMM Planner / Planly

CURRENT STATE: Phases 0–6 DONE for MVP. Customer-Ready MVP CLOSED by Owner on 2026-10-06; its acceptance scope remains in the [closure evidence](docs/verification/2026-10-06-customer-ready-closure.md). PR31 and PR32 are merged/deployed. Main and Render LIVE were verified on 2026-10-09 at `2539796a7427175642d5b9e8c351382a4c18954c`; health HTTP 200. Exact PR32 head CI/Self-host succeeded, full suite 976/976 PASS. This does not establish VK authorization or Telegram analytics delivery.
CURRENT MILESTONE: Phase 9 Scheduling automation — Owner requested the transition on 2026-10-09. Discovery only: establish the first product scenario and approve its design before implementation. Phase 8 is PARTIALLY ACCEPTED, not DONE: real MAX collection for two existing posts and analytics styling passed; Telegram analytics is deferred by Owner. [Production acceptance and deferred work](docs/verification/2026-10-09-phase8-partial-acceptance-phase9-transition.md).
DEFERRED: Phase 7A VK — HOLD by Owner on 2026-10-08. Implementation and diagnostic PRs are merged, but the latest real attempt failed at TOKEN_EXCHANGE / INVALID_GRANT; the root cause and publication readiness remain unproven. Stop VK investigation, OAuth attempts, support requests and changes until Owner explicitly resumes VK. Existing code and credentials are retained; HOLD is not production acceptance. [Original approved contract](docs/superpowers/specs/2026-10-07-vk-oauth-design.md).
NEXT STEP: Define Phase 9's first automation scenario using the existing planner and free scheduler. Do not resume Telegram analytics or VK during this work. No Phase 9 product code, provider sends or infrastructure changes are authorized by the transition alone; design and release gates remain. Instagram stays HOLD; CR07 / CR08 / GAP01 remain not started.

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
| 6 | Smart Content Queue / Swipe Planner | DONE; deployed and production accepted by owner |
| 7 | Additional networks | HOLD; VK deferred by Owner, Instagram not started |
| 7A | VK | HOLD by Owner 2026-10-08; implementation merged, live OAuth and publishing unproven |
| 8 | Analytics | PARTIALLY ACCEPTED / TELEGRAM HOLD; MAX two-post collection and CSS verified in production; Telegram deferred by Owner 2026-10-09 |
| 9 | Scheduling automation | DISCOVERY requested by Owner 2026-10-09; first scenario/design not yet approved |
| 10 | Target hosting optimization | Only when proven necessary; separate owner gate for infrastructure changes |

AI is REMOVED from the product roadmap, not deferred or optional.

## Production analytics acceptance and deferred work — 2026-10-09

- [PR #32](https://github.com/barsikdan-hue/Planly/pull/32) merged/deployed at `2539796a7427175642d5b9e8c351382a4c18954c`; Render `dep-db46mrm7bikc73aq16d0` LIVE at 07:21:58 Moscow, health 200. Exact head `b7035627c5480744838e074fed81de590e1d2e2b`: native CI 37807602286 and Self-host 37807602264 SUCCESS; 976 tests passed, zero failed/skipped/cancelled.
- One normal MAX refresh read two existing published posts: checked 2, observed 2, unavailable/skipped 0. Following GET returned AVAILABLE views 5 + 5, total 10. Analytics CSS was visually and computationally verified in the production browser. No test publications or env/cache changes.
- Telegram GET returned HTTP 200, eligible 2, observed 0, total null; both historical posts have IDENTITY_UNPROVEN. No zero reaction counts are inferred. The exact identity cause and current webhook configuration are not proven; real reaction receipt is not verified.
- Owner deferred the unfinished Telegram work and requested Phase 9. Retain the receiver/code and existing credentials; no Telegram analytics diagnosis, backfill, webhook/env changes or real reaction probes until explicitly resumed. Existing Telegram publishing remains within its previous accepted scope.
- Return later to: identity proof for legacy Telegram posts; read-only webhook/consumer inventory; separately approved private webhook setup and one real reaction receipt. Do not weaken ownership/identity checks, overwrite a foreign consumer or fabricate historical data.
- Prior CSS omission's mechanism remains unproven. Current build/delivery is verified; investigate the earlier mechanism only if needed or if it recurs. Phase 8 is not fully closed. [Evidence and resume checklist](docs/verification/2026-10-09-phase8-partial-acceptance-phase9-transition.md).

## Historical Customer-Ready production acceptance — 2026-10-06

- CR11 / [PR #19](https://github.com/barsikdan-hue/Planly/pull/19) merged at `4621cfdedef43b98a014a9f4c7e9ad83e9c435ba`; CR09 / [PR #18](https://github.com/barsikdan-hue/Planly/pull/18) merged at `49f9e7b09783ba1f420af3e6914f433abc2133be`. Their approved owner-lifetime/upload/recovery composition is included in current production; this is not a fresh exhaustive production owner-transition/upload fault campaign.
- CR06 / [PR #20](https://github.com/barsikdan-hue/Planly/pull/20) merged at current production/main `a3875c6a52e4921e5d7c2aa3ce5b723388462aa8`. Existing Render deploy `dep-db2ej3ks728c73c5rji0` is live at that exact SHA; migrations through 0005 and build/start succeeded.
- CR06_PRODUCTION_ACCEPTED: normal App CREATE 201; explicit original durable key/payload API retries return the same item ID, including after reload; duplicates 0; changed payload under the same key 409; test-item DELETE 204; original replay 410 before/after reload; resurrection 0. Test item/client raw/attempt cleaned; required terminal history retained. Health 200; provider sends 0.
- Exact-main native CI and Self-host succeeded; native suite 716 PASS / 0 FAIL / 0 SKIP. Historical provider acceptance retains its original scope; no fresh provider send was needed for CR06.
- Temporary compatibility PR21 is superseded and closed without merge. No probe runtime was transferred into main. [Closure audit and scope boundaries](docs/verification/2026-10-06-customer-ready-closure.md).

## Historical production acceptance — 2026-10-05

- [PR #8](https://github.com/barsikdan-hue/Planly/pull/8) is merged at `c1dde2c966705d7f61fcbf4405d177ea3fe6f6c0`: Publish Now triggers immediate processing and the existing scheduler includes owner-scoped catch-up.
- Owner-confirmed deployment and acceptance: Phase 6, Publish Now, Scheduled Publish, Telegram, MAX and `/api/health` PASS. This records the owner's acceptance; it is not a fresh agent provider test.
- Preserve the existing publication pipeline and free scheduler architecture. Customer-ready work does not start Phase 7, add AI or migrate infrastructure.

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

- Known independent P2 findings remain outside the completed approved release scope: CR07 same-owner bootstrap can overwrite a newer acknowledged account toggle; CR08 WebP dimensions support VP8X only and reject valid VP8/VP8L inputs. Neither is repaired or declared accepted technical debt by this closure.
- GAP01 crash/PUBLISHING diagnosis remains unproven. CR11/CR09 exclusions (including already-admitted continuations, child/account/reschedule paths and owner changes without scheduled polling) retain their recorded evidence boundaries. No new blocker is inferred from an unproven path; no defect-free certification is claimed.
- CR07 / CR08 / GAP01 require a separately approved scope and are not started. Closure does not start additional networks, Analytics, AI or infrastructure migration.
- Historical browser file assignment was blocked by tool permission handling; this was an automation limitation, not a Planly defect or localhost gate. Current production media acceptance is recorded in the report above.
- Fresh final provider evidence covers the Telegram PNG and scheduled-text scenarios above; earlier accepted UI/media/MAX evidence retains its original scope.
- Phase 8 is deployed and partially accepted: MAX two-post views and CSS verified; Telegram identity/activation/receipt work is deferred by Owner on 2026-10-09. Its unfinished work is tracked above. AI is excluded.
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

Completed goal: conveniently store content prepared outside Planly. Prepared content, media, search and READY/USED/ARCHIVED lifecycle are implemented. Preserve the approved scope without expanding taxonomy during release polish.

## Phase 6 contract — Smart Content Queue / Swipe Planner

- Swipe left → reject; swipe right → approve.
- Approved content → next free publication slot or manual date/time.
- Preset publication schedule; fill the calendar for a week/month.
- ContentSuggestion remains a suggestion until approval, then becomes a Post.
- Suggestions use non-AI sources. AI is excluded.

## Later-phase boundaries

- Owner authorized Phase 7A VK on 2026-10-07 and deferred it on 2026-10-08. Instagram remains HOLD until a separate Owner decision; deferring VK does not authorize Instagram or CR07 / CR08 / GAP01.
- Owner authorized moving to Phase 8 Telegram/MAX analytics on 2026-10-08, independently of VK production acceptance. Purpose: compare post performance. Begin with capability verification and an agreed design; metric collection, subscriptions, schema/runtime changes and release require the applicable design and delivery gates.
- Phase 9 may add reusable slots, repeat content, better posting times and scheduling assistance, without AI.
- Phase 10 revisits hosting, a permanent worker, scheduler precision, backups, DNS/TLS and monitoring only when a real need is proven and the owner approves the infrastructure decision.
