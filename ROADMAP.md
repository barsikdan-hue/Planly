# Personal SMM Planner / Planly

## CURRENT PRODUCT TRACK — 17.10.2026 (owner decision; evidence snapshot)

**Source of product truth:** [Issue #54](https://github.com/barsikdan-hue/Planly/issues/54), confirmed 14.10.2026; the independent reliability queue is [Issue #49](https://github.com/barsikdan-hue/Planly/issues/49). This P00–P07 sequence supersedes the *next-step instructions* of the older Phase 0–10 roadmap below, not their historical acceptance evidence. The former roadmap uses **Phase**, the new owner-approved product milestones use **P**. Do not confuse P03 with the old Phase 3 scheduler. This document is a status ledger, **not** permission to implement, merge, deploy, migrate, or perform real provider sends.

**CURRENT CHECKPOINT:** P03-B shared ADMIN library has reported **STAGING_FUNCTIONAL_PASS** in its bounded scope; P04-A Telegram/MAX ownership proof is **SOURCE_MERGED / MOCK_VERIFIED**, not staging/live accepted. **CURRENT GOAL:** independent USER-owned content and channels, followed by explicitly selected, bounded consent-based automation. **P04-B is NOT DELIVERED.** Next actions need their own contract and applicable gates; this documentation update starts no implementation, release or runtime operation.

### Verified boundary / evidence

- **Fresh source check:** GitHub and `origin/main` are `fa81076f77d6162f9c2cfcea5e251cf9ec1598a2`, the [PR #67 merge](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6232112882). Exact source `bde036867e21a1a114d349c8be67668f4af9deae` passed [CI 39019032423](https://github.com/barsikdan-hue/Planly/actions/runs/39019032423) (1560/1560 native, 88 browser PASS / 4 configured skips), [Self-host 39019032434](https://github.com/barsikdan-hue/Planly/actions/runs/39019032434) and [independent mock review](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6232091691). This is source/mock evidence, not a deployment. PR #59 was previously merged at `83a0350203d1d37ad0cbbb2e6d61934485b877e1`.
- **Reported staging acceptance, not a fresh runtime check:** [#63 STAGING_FUNCTIONAL_PASS, 16.10.2026](https://github.com/barsikdan-hue/Planly/issues/63#issuecomment-6218593875) records HTTPS staging `stage.lentaro.ru` / `media-stage.lentaro.ru`, runtime SHA `83a0350203d1d37ad0cbbb2e6d61934485b877e1` and unchanged web/worker image/container/mount identities. ADMIN share → USER A/B independent private copies; exact ordered image/video bytes; signed GET succeeds and unsigned/tampered/foreign access denies; independent edits/unshare, reload/relogin, idempotent recovery and preservation readback passed. The report includes original data/media/ADMIN-session readback, normalized digest and Critic PASS. It excludes source DELETE, copied-media reorder/detach, mixed known/unknown selection, playback/audio/seek, production and real provider publication. Issue #63 remains open for formal Owner disposition. This sync verifies the report/provenance, not private logs or a new VPS login.
- **Migration truth:** `0012` was already reported applied once in the [staging release checkpoint](https://github.com/barsikdan-hue/Planly/issues/63#issuecomment-6215913669); do not follow obsolete instructions to deploy/apply it again. P04-A migrations `0013`/`0014` have only disposable-DB rehearsal evidence and have not been released to existing staging/Render databases in the [#66 checkpoint](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6232112882). Any persistent change requires fresh isolated rehearsal, existing-state readback, rollback and its own gate.
- **Historical production metadata:** the [17.10 independent audit](https://github.com/barsikdan-hue/Planly/pull/62#issuecomment-6232160211) records Render production `2f13a5acc8a8010bfdc989cc99deb4655b584747`, autoDeploy OFF and free PostgreSQL expiry `2026-10-31 06:53:34 UTC` (09:53:34 Moscow). No fresh Render runtime/metadata check is claimed by this documentation task. Recheck source/runtime and Render autoDeploy/trigger on every release. Main or staging acceptance never establishes a Render rollout; production export/restore/cutover remain unverified.
- Historical Telegram/MAX publishing and Phase 9 scheduling have bounded live acceptance on previous production SHAs. This does **not** verify every colleague's independently owned channels, four-provider OAuth, opt-in publication, or current NEWVPS real-provider sends.

### Acceptance labels and required evidence

These labels describe different proof, not an automatic promotion pipeline. Always record the exact source/runtime SHA, environment, date, scope and provenance.

| Label | Required evidence / present boundary |
|---|---|
| **SOURCE_READY** | Reviewed source PR at an exact HEAD with stated scope; record merge separately as SOURCE_MERGED. P04-A is SOURCE_MERGED at `fa81076f`, from source `bde0368`; this does not release migrations or authorize a deploy. |
| **CI_PASS** | Actual exact-HEAD CI and Self-host results, with isolated security/isolation/native race tests, build and browser scope. P04-A source checks above are MOCK_VERIFIED; mock E2E is not provider proof. A new PR62 HEAD needs its own checks. |
| **STAGING_ACCEPTED** | Authorized environment release with runtime/image SHA, HTTPS/browser flow, existing drafts/media/sessions readback and preservation/rollback evidence. P03-B has the bounded historical STAGING_FUNCTIONAL_PASS report above; no blanket acceptance or P04-A staging acceptance is inferred. |
| **PRODUCTION_ACCEPTED** | Explicit production release gate, exact runtime and existing-state/browser readback. A data migration/cutover additionally needs verified private source backup, independent off-VM isolated restore, counts/media consistency, writer/sender freeze and rollback before its separate authorization. New colleague features have no production acceptance. |
| **PROVIDER_VERIFIED** | Separately authorized real provider/account permissions and outcomes, distinguishing read-only proof from counted sends/receipts. P04-A Mini App setup/launch, native browser return, real membership reads and sends are UNVERIFIED. Ambiguous delivery and historical AUTH/receipts must be preserved; never blind resend. |

**Privacy acceptance invariant:** USER A cannot read/change/enqueue/send USER B resources through API, jobs or media URLs. ADMIN user/invitation management and aggregate technical status do not permit access to colleagues' private unpublished posts, private media or secrets without a separate approved rule. Require cross-USER and ADMIN-as-non-owner deny evidence for resources, signed URL issuance and bytes; hiding UI is insufficient.

### Current owner-approved queue

| Task | Status 17.10.2026 | Remaining acceptance / restriction |
|---|---|---|
| P00 Reliability and unresolved gates | **PARTIAL / HOLD; P0 DATA RISK OPEN** | [#49](https://github.com/barsikdan-hue/Planly/issues/49): production BACKUP_UNVERIFIED and staging OFF_VM_RESTORE_UNVERIFIED; CR07/CR08/GAP01 and historical provider questions remain independent. Read-only dispositions/green old PRs are not released fixes. Inspect current evidence before a separate task. |
| P01 Multiuser inspection and decisions | **BASELINE IMPLEMENTED; DOCUMENT ACCEPTANCE NOT FULLY AUDITED** | Invitation-only lifecycle, least-privilege ADMIN/USER, migration/rollback, admin visibility and exact product spec remain the [#54](https://github.com/barsikdan-hue/Planly/issues/54) authority. No public signup is approved. |
| P02 Separate user accounts / isolation | **CODE ON MAIN; REPORTED STAGING BASELINE** | Auth, invitations and ADMIN/USER private guards exist; bounded A/B staging evidence is above. API/job/media cross-USER and ADMIN non-owner isolation is mandatory. Real 2–5-user networks and production migration/acceptance are NOT complete. |
| P03-A Minimal administrator | **CODE ON MAIN; REPORTED STAGING BASELINE** | User list/invitation lifecycle; owned/shared templates and aggregate technical status only. No blanket private-content/media/secret access to colleagues. Wider visibility requires its own Owner-approved rule. |
| P03-B Shared ADMIN library | **SOURCE_MERGED / STAGING_FUNCTIONAL_PASS (reported scope)** | [#63](https://github.com/barsikdan-hue/Planly/issues/63#issuecomment-6218593875): explicit READY sharing, independent private image/video copies, edits, denies, reload and duplicate protection; no automatic publication. `0012` already reported applied once; no repeat deploy/migration. Owner disposition and stated exclusions remain. |
| P04-A USER Telegram/MAX connections | **SOURCE_MERGED / MOCK_VERIFIED** | [#66](https://github.com/barsikdan-hue/Planly/issues/66#issuecomment-6232066381): ownership proof, binding/revision, bounded local AUTH cancellation and OWNER late-ERROR fence. Not staging/production/provider accepted; `0013`/`0014` only rehearsed on disposable DBs. Full ticket/initData relay with the original Planly session remains an accepted residual; not phishing-proof. |
| P04-B Consent-based colleague automation | **NOT DELIVERED / NOT ACCEPTED** | Explicit selected content/networks + bounded single/series schedule → own Post/PostTarget/Job, once-only consent, pause/cancel/idempotency/recovery need a separate contract/implementation/acceptance. No automatic enrollment of future templates or ambiguous resend. P04-A and historical Phase 9 individual approval do not complete this milestone. |
| P04-C Other official networks | **VK PROVIDER HOLD / INSTAGRAM NOT IMPLEMENTED** | Official VK OAuth/token exchange/scopes remain unresolved; Instagram needs separately scoped official Meta eligibility/permissions/implementation. Target product inclusion is not live support. |
| P05 First-run onboarding | **NOT IMPLEMENTED** | Short guide: connect own channels → select shared content → choose time/networks → grant consent → inspect independent outcomes. Desktop/mobile acceptance required. |
| P06 Multiuser end-to-end / real providers | **NOT ACCEPTED** | 2–5 users with distinct channels, authorization isolation, job recovery/retries/cancellation, no duplicates, provider-specific statuses, authorized real sends with exact consent/count. |
| P07 Production preservation and cutover | **PRODUCTION CUTOVER HOLD** | Owner target 25.10.2026 does not waive gates. Verified production source export/readback and independent off-VM restore, media consistency, writer/sender freeze, rollback and separate production/migration/secrets/DNS approvals remain required. No paid DB or assumed free-provider entitlement. |

### P0 preservation and recovery proof

Production source export/readback is **BACKUP_UNVERIFIED**; independent staging recovery is **OFF_VM_RESTORE_UNVERIFIED**. [#65 remains deferred/unresolved](https://github.com/barsikdan-hue/Planly/issues/65#issuecomment-6216748246): backups on the same VM/disk, even with a reported successful on-VM restore/readback, are not independent disaster recovery. Production data export and staging offsite recovery are separate proof and approval boundaries. No destructive data operation or production cutover until a private independent off-VM backup and isolated restore are verified with integrity/readback, counts and media consistency, and the exact action is authorized. Preserve drafts, media, sessions, AUTH/receipts and ambiguous history. This requirement does not authorize moving backups, changing secrets or resuming deferred #64/#65 execution.

### STOP / OWNER GATES

- **DO NOT silently resume:** Telegram analytics receipt/legacy identity/webhook (old Phase 8 HOLD), VK live OAuth/support/provider trials (old Phase 7A HOLD), unverified Instagram capabilities; technical discovery may be scoped under the *new* approved product direction, but external operations and release require explicit gates. Do not infer that product inclusion cancels provider-specific safety holds.
- **Distinct explicit Owner gates:** merge; staging deploy; production deploy; each persistent staging/production migration; secrets/env/infra/DNS; scoped real-provider reads; and scoped counted sends. Specify environment, exact source SHA and migration/operation where applicable. Neither merge nor green main CI permits auto-deploy, migration or provider traffic. Recheck Render autoDeploy/trigger on every release; if enabled or unknown, stop before merge could trigger an unapproved deploy. Do not infer migration/provider permission even from an approved deploy. Continue ordinary commands within an already granted precise gate without repeated requests.
- **Do not replay historical deployment instructions:** PR #59/`0012` are already reported released on staging; P04-A source merge did not deploy `0013`/`0014`. Any new persistent action needs its own preflight/gate. Never combine unrelated bugfix, refactor, documentation synchronization and feature in one implementation PR.
- **DO NOT cut over production**, migrate the production DB, rotate/copy secrets, change Render, DNS, webhook/senders or enable paid resources based on staging tests alone. Production backups are NOT verified; existing backups on the same VPS do not establish offsite disaster recovery.
- **DO NOT send real social posts**, reactions or OAuth operations without exact external-provider owner consent and evidence. **DO NOT** put credentials in logs, committed docs or frontend.
- **DO NOT revive AI:** it is outside Planly core roadmap and requires its own separate product approval.
- **Mobile UX:** main planner has an owner-observed small/clipped-phone-layout concern, not closed by the login form's 320/390 px acceptance. Triage separately with reproducible viewport evidence.

### Historical Phase 0–10 (scope at earlier acceptance)

The phase statuses and evidence below describe the historical single-owner MVP and may retain 09.10-era statements. They are **not** the current execution order and must not override the new P00–P07 owner decision. For every task distinguish source main SHA, branch/PR verification, NEWVPS staging running SHA, Render production SHA and real provider receipts.

## Historical approved phases

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
| 9 | Scheduling automation | DONE / PRODUCTION ACCEPTED 2026-10-09; atomic two-draft production receipt, reload, duplicate 0, provider sends 0 and safe cleanup PASS |
| 10 | Target hosting optimization | Only when proven necessary; separate owner gate for infrastructure changes |
| 11 | Planly Team 100: isolated user accounts and shared content library | FUTURE / CONTENT-SHARING MODEL APPROVED 2026-10-12; design and implementation require separate Owner gates after current product stabilization |

AI is REMOVED from the product roadmap, not deferred or optional.


## Future Phase 11 — Planly Team 100 (decision 2026-10-12)

**Status:** FUTURE / NOT STARTED. Owner approved the **shared-library model**, not the full technical design, implementation, migrations, release or infrastructure changes. This is a planning record only; current milestone and existing HOLD decisions remain unchanged.

**Product goal:** extend the existing single-owner Planly into one private application for up to approximately 100 colleagues, with separate personal workspaces and one centrally maintained library of reusable content. Do not create 100 installations, duplicate sites or a corporate SaaS platform.

**Approved content-sharing behavior:**
- An administrator publishes and periodically refreshes common content selections (for example, one monthly batch). Eligible users see the same shared library entries in a dedicated area.
- Viewing or adding items to the shared library does **not** generate 100 personal posts, drafts or scheduled jobs. No automatic mass publication or automatic posting on a user's behalf.
- Each colleague explicitly selects a shared item to use. Only then is an independent personal draft/snapshot created for editing, per-network adaptation and manual or individually approved scheduling through the existing Planly workflow.
- Updating, withdrawing or versioning shared content must not silently overwrite a user's existing draft, scheduled post, published post or historical metrics. Define precise version/media behavior in the subsequent design before implementation.

**Target capabilities to design (not yet approved for implementation):**
- Invitation/onboarding and account lifecycle for up to 100 users; start with minimal ADMIN and USER access, not teams or complex RBAC.
- Server-enforced isolation of each user's credentials, social connections, posts, drafts, personal library, calendar, schedule/jobs, private media and analytics; no cross-user access through API, URLs, media previews, queue or reporting.
- A lightweight admin dashboard for users, shared content, invitations, and privacy-safe operational status. No blanket access to colleagues' private credentials or unpublished content.
- Reuse the current PostgreSQL, publication connectors, scheduler/worker and media infrastructure where viable; prove multi-user suitability from actual code, not assumptions. No new infrastructure solely because the target is 100 accounts.
- Load and isolation acceptance in progressive cohorts (5 → 20 → 50 → 100 accounts), covering concurrent publishing, provider rate limits, retries, duplicate protection, session security, recovery, backups and resource/cost estimates.

**Design decisions still requiring explicit owner approval:** invitations and account recovery; exactly what administrators can see of personal account health/metrics; shared-library editing/moderation and media/version rights; user-visible content attribution; quotas/retention; deployment capacity and costs; terms/privacy. Do not infer these from approval of the content-sharing model.

**Entry gate:** after the personal Planly core is stable and the Owner selects Phase 11 as the next milestone. Follow AGENTS.md Harness, inspect current auth/schema/API/worker/media paths, write a scoped spec and migration/rollback plan, prove isolation tests and load test hypotheses; obtain separate human gates for product rules, database changes, secrets, infrastructure, merge and deploy.


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

### Swipe Planner 2.0 delivery (owner-approved PR42, 2026-10-13)

- DEVELOPMENT VERIFIED / NOT RELEASED: stacked draft [PR43](https://github.com/barsikdan-hue/Planly/pull/43) → [PR44](https://github.com/barsikdan-hue/Planly/pull/44) → [PR45](https://github.com/barsikdan-hue/Planly/pull/45). Runtime3609eab passed Linux CI1098/1098 and E2E48/48, Self-host and fresh whole-branch Critic (Critical0/Important0). Windows full1097/1098 is LIMITED by one unchanged self-host-init path failure; no assertion/timeout/skip waiver. Actual final documentation-only head/checks are recorded in PR45. Production acceptance, merge/deploy/migration and provider sends remain unapproved.
- Task 1 adds the Dashboard READY queue, origin return, existing Library editor entry, native card motion and owner-generation guards. Local fixture verification is recorded separately; it does not establish deployed acceptance.
- Task 2 replaces new Swipe draft approval with explicit session setup, default next free slot, optional manual time and Moscow time on each card. Networks stay explicitly selected; skip/reject remain available when scheduling is unavailable. New approvals carry an immutable Swipe marker, require a free minute on connected locked accounts and a fresh server cutoff of at least 60 seconds; marked POST originals/replays never run the inline scheduler. Legacy unmarked pending requests retain their original recovery payload and UUID.
- Task 3 adds transactional current feedback and retained receipts, typed deleted-result recovery, durable DISLIKE and private on-demand summary/manual JSON export. Its implementation and local evidence are recorded in [preferences verification](docs/verification/2026-10-13-swipe-planner-2-preferences.md). It depends on the slot-flow branch; pre-receipt Post deletion recovery is limited and no historical feedback is fabricated. [Remote delivery evidence](docs/verification/2026-10-13-swipe-planner-2-remote.md) separates GitHub CI/Critic from local checks and production acceptance. Merge, deploy, production migration and provider sends require the owner gate.

## Later-phase boundaries

- Owner authorized Phase 7A VK on 2026-10-07 and deferred it on 2026-10-08. Instagram remains HOLD until a separate Owner decision; deferring VK does not authorize Instagram or CR07 / CR08 / GAP01.
- Owner authorized moving to Phase 8 Telegram/MAX analytics on 2026-10-08, independently of VK production acceptance. Purpose: compare post performance. Begin with capability verification and an agreed design; metric collection, subscriptions, schema/runtime changes and release require the applicable design and delivery gates.
- Phase 9 may add reusable slots, repeat content, better posting times and scheduling assistance, without AI.
- Phase 10 revisits hosting, a permanent worker, scheduler precision, backups, DNS/TLS and monitoring only when a real need is proven and the owner approves the infrastructure decision.
