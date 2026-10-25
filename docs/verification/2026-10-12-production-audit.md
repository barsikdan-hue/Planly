# Planly Task 01 — production audit and cleanup preparation

Date: 2026-10-12, Europe/Moscow. Repository: `barsikdan-hue/Planly`.

**STATUS: AUDIT_PREPARED / PRODUCTION_INVENTORY_BLOCKED. CLEANUP_SAFE: NOT ESTABLISHED.**
Source, CI, Render metadata, deletion paths and Swipe code were inspected. Exact-count production inventory and an execution-ready cleanup manifest are unavailable. The user's Definition of Done is therefore **NOT MET**. This report grants no deletion, merge, deploy, provider send or infrastructure permission.

## Contract and authority

Read-only production audit; documentation and a draft PR only. No runtime/UI/test/schema/workflow change. Preserve users/accounts/auth, Telegram/MAX connections, credentials/env, scheduler configuration and existing infrastructure. Leave published social messages intact. VK/Instagram HOLD; AI newsroom is an independent initiative, outside this audit and existing product roadmap.

The initial chat root is an older untracked checkout, not repository authority. `work/Planly` has verified origin `https://github.com/barsikdan-hue/Planly.git`, branch `codex/docs-product-rules`, HEAD `d720802fd4c53370fe30334b25b2b6af2ad67397`, clean. No changes were made there. A separate local shared clone `work/Planly-production-audit` was created; branch `codex/production-audit-cleanup` starts at verified remote main `da9a2e89cc37119e87952ac56fcf86a1383de3f7`, initially clean. Both source and current main AGENTS were read; GitHub connector identifies `barsikdan-hue`. No AI-COPILOT work is involved.

Superpowers systematic-debugging, writing-plans and verification-before-completion were applied. The repository explicitly permits independent subagents; two audited exclusively the new cleanup and Swipe reports. Source SHA, test results and production acceptance remain separate.

## Fresh external evidence

| Source | Result and boundary |
| --- | --- |
| Git remote | `git ls-remote origin refs/heads/main`: `da9a2e89cc37119e87952ac56fcf86a1383de3f7`; fetched and inspected this exact tree. |
| GitHub native CI | [37924530453](https://github.com/barsikdan-hue/Planly/actions/runs/37924530453), exact main SHA, completed SUCCESS. REST job `verify` SUCCESS, no failed steps; configured migration drift/migrations/typecheck/lint/test/build checks inspected in `.github/workflows/ci.yml`. Exact suite count not extracted from logs. |
| GitHub Self-host | [37924530540](https://github.com/barsikdan-hue/Planly/actions/runs/37924530540), exact main SHA, completed SUCCESS; `docker-runtime` SUCCESS, `telegram-live` SKIPPED. Skipped provider job is not live proof. |
| Scheduler workflow | Latest observed [38224916725](https://github.com/barsikdan-hue/Planly/actions/runs/38224916725), 2026-10-12 11:39:34 Moscow, exact main SHA, tick job SUCCESS. No workflow dispatch performed. Success does not expose active-job counts or establish SLA. |
| GitHub connector caveat | `fetch_commit_workflow_runs` returned `[]` because its documented wrapper filters to PR-triggered runs. Public GitHub REST all-event lookup confirmed the push runs above; `[]` was not treated as PASS or absent CI. |
| Existing PRs | Connector search `repo:barsikdan-hue/Planly is:open` returned #37, VK documentation investigation only. [PR37](https://github.com/barsikdan-hue/Planly/pull/37) is not a cleanup/Swipe fix and does not establish provider readiness. |
| Render deployment | Existing `planly`, `srv-dav07le0tbcc73d0gfi0`, main, free web service, not suspended, one instance, autoDeploy OFF. Latest deploy `dep-db4d2q67bikc73ebm1r0` LIVE, exact `da9a2e89`, completed 2026-10-09 14:37:44 Moscow. This confirms deployed commit metadata, not every feature's runtime behavior. |
| Render database | `planly-db`, `dpg-dav06rk1nsns7380jvv0-a`, PostgreSQL 17, available, free, expiresAt 2026-10-31 09:53:34 Moscow. Backup/recovery readiness not verified. No lifecycle/plan change performed. |
| Render Redis | `planly-redis`, `red-dav69el9fdbs73bgh6tg`, available, free, noeviction, persistence OFF. Connection/job data not read. Separate Render Planly worker was not present in returned services; this does not prove absence of external workers or in-flight HTTP ticks. |
| Render error logs | Bounded `level=error` query from 2026-10-12 00:00 UTC through returned end 09:04:25 UTC: logs `[]`, hasMore false. No private log content included. Other levels, earlier periods and unlogged failures remain outside this observation. |
| Public health | Fresh direct `/api/health` request timed out at 20 seconds. HTTP 200 is **UNVERIFIED in this audit**; a LIVE deploy and empty error query do not substitute. No runtime defect/root cause inferred from the client timeout. |
| Browser | Browser inventory contained no existing Planly/authenticated tab. Production app was not opened: its bootstrap can send publications (see below). Browser acceptance is NOT RUN. |
| Cloudflare | No callable Cloudflare namespace; plugin discovery `Cloudflare` returned no plugin. R2 read-only inventory was unavailable; no credentials requested or printed. |

Workspace was confirmed by the owner as `My Workspace` before Render reads. No env variable or connection-string endpoint was fetched.

## Functional status by evidence class

| Capability | CODE / TESTED | PRODUCTION VERIFIED / UNPROVEN |
| --- | --- | --- |
| Owner auth/session, Content Core, media | Existing server persistence, owner scoping, private storage, target/publication model; exact-main CI/Self-host succeeded. | Deployment present. Historical production acceptance recorded in roadmap; fresh authenticated data flow not verified. |
| Telegram/MAX publishing | Existing connectors, immediate processing and free HTTP tick; BullMQ worker implementation also present. | Owner acceptance from 2026-10-05 and older live evidence retain their scope. No fresh send authorized or performed. Latest scheduler job succeeded; jobs/outputs not inventoried. |
| Content Library / Swipe | READY/USED/ARCHIVED library, atomic source conversion, durable intents, existing gestures/buttons/slots. Swipe focused local 27/27 passed. | Historical owner acceptance; current mobile/CSS/media playback not production tested. CSS review text defect traced below. |
| Phase 9 batch scheduling | Existing per-row review, <=20 drafts, owner locks, fingerprint/slot checks, atomic receipt, recovery and replay. Local pure scheduling checks passed within bounded set. | Historical 2026-10-09 two-draft acceptance preserved, sends 0 in that probe. No new batch scheduling/cancellation performed. |
| Analytics | Code/UI/MAX collection and Telegram webhook receiver present. | Phase 8 PARTIAL: historical MAX two-post views/CSS accepted; Telegram legacy identity/webhook/reaction receipt HOLD/UNPROVEN. No refresh/provider read/webhook probe performed. |
| VK / Instagram | VK implementation retained; PR37 docs inspected only. Instagram runtime readiness not claimed. | HOLD. No OAuth/diagnosis/support/publication resumed. |
| Cleanup | Individual cancellation/delete APIs exist; dependency graph inspected. | Complete cleanup safety NOT ESTABLISHED. No cleanup dry-run with actual counts or deletion performed. |

Historical reports are inspected evidence with their original dates and scope, not fresh production re-verification. CI fixtures and mocked hooks are not browser/provider evidence.

## Proven code findings and unproven production occurrence

1. **READ-ONLY TRAP:** `app/api/bootstrap/route.ts:12`, GET → `ensureOwnerSocialAccounts` and `runDuePublications({userId,limit:10})` → processor → provider handoff. `PlannerApp` loading and 5-second scheduled polling call that bootstrap. Authenticated navigation/refresh/polling can write accounts and publish due content. GET is not a safe inventory mechanism. This is an intentional existing catch-up behavior, not a newly demonstrated production bug. Avoid login too: owner/session bootstrap writes state.
2. **CR07, CODE:** `components/planner/app.tsx:423` same-owner poll copies `snapshot.socialAccounts` without account revision protection; `updateAccount:930` acknowledges a toggle independently. A poll admitted before the toggle can later overwrite its newer UI acknowledgement. Historical P2 remains; current production occurrence UNPROVEN.
3. **CR08, CODE:** `lib/server/media-validation.ts:57`, `webpDimensions` accepts only VP8X. `validateMediaUpload:84–89` rejects dimension-null RIFF/WEBP VP8/VP8L. Existing local fixtures test VP8X only; current valid-upload browser reproduction not run. No fix made.
4. **SWIPE, CODE:** review paragraph inherits the two-line/44px card clamp; it has no expand control. Full text cannot be reviewed in-place before approval. [Trace and coverage](2026-10-12-swipe-inspection.md). Physical touch/scroll/keyboard/video operation remains UNPROVEN in a real device/browser.
5. **CLEANUP, CODE:** Post DELETE without lifecycle guard can race a claimed provider send; mixed terminal/pending history blocks normal DRAFT cancellation; DB-first media DELETE swallows R2 failure; ordinary Post deletion loses creation dedupe; Post cascade leaves Redis jobs. [Functions, conditions and sequence](2026-10-12-cleanup-code-audit.md). These paths are safety blockers, not claims that production already lost data or sent duplicates.
6. **GAP01:** historical crash/PUBLISHING hypothesis remains NOT PROVEN. Existing code fails closed on ambiguous delivery; do not classify a new production incident or implement an assumed fix.

## Production inventory — no fabricated counts

| Item | Current value | Why / next safe evidence |
| --- | --- | --- |
| Posts by DRAFT/READY/ARCHIVED | UNVERIFIED | Render SQL attempted; rejected by database external IP allowlist. |
| PostTargets | UNVERIFIED | Model has active/scheduled_at, no status column; aggregate separately from Publications. |
| Publications by status, retries, PUBLISHING, due work | UNVERIFIED | Same SQL access blocker. |
| Library by READY/USED/ARCHIVED | UNVERIFIED | Same SQL access blocker. |
| Media count / declared bytes / post/library links | UNVERIFIED | Same SQL access blocker. DB bytes would not equal R2 usage. |
| R2 count / usage / missing objects / orphans | UNVERIFIED | No safe R2 List/Head tool/connection. No speculative values. |
| Redis waiting/active/delayed/retry/failed jobs | UNVERIFIED | Resource metadata is not queue data; no safe queue inventory tool. |
| Scheduling receipts / Library tombstones | UNVERIFIED | Retain these tables; counts require SQL. |
| Analytics/history affected by deletion | UNVERIFIED | Schema proves cascade, cardinalities require SQL. |
| Browser recovery / pending create / pending scheduling | UNVERIFIED | No authenticated tabs; cross-device/per-tab sessionStorage cannot be certified remotely. |

Render SQL returned: database blocks external connections because its IP allowlist is empty; hosted MCP has no stable allowlist IP. No allowlist/network/security change attempted. Safest follow-up is an already authorized internal or local read-only aggregate connection, not public network exposure or runtime instrumentation/deployment. The [SQL inventory artifact](2026-10-12-production-inventory.sql) emits aggregates only in a READ ONLY / REPEATABLE READ snapshot. It is source-reviewed, not production-executed or SQL-runtime-validated. Privately bind the canonical owner, require owner_matches=1, and refresh the counts immediately before execution.

## Cleanup decision and dry-run deliverables

Full conditional sequence, API payload constraints, failure checkpoints and irreversible losses are in the [cleanup report](2026-10-12-cleanup-code-audit.md). Public count manifest currently has **UNVERIFIED in every affected content/storage/job field**; none is zero. It cannot be approved for execution yet.

Required order: quiesce new writes/retries/uploads → normal DRAFT cancellation where editable → prove all worker/tick/immediate handoffs drained → scoped queue reconciliation → individual Post deletion → Library deletion → only free media deletion → independent PostgreSQL/Redis/R2 comparison → owner-scoped browser recovery discard and non-resurrection proof. An instantaneous zero PUBLISHING count is insufficient to prove a barrier against future claims. Mixed target history or unknown handoff blocks deletion.

Irreversible effects: delete Post text/targets/times/publication receipts/provider IDs/history/analytics and creation-key identity; delete all Library content and associations; delete media metadata/private R2 bytes; discard unsaved editor/pending work on approved tabs/devices. No restore guarantee is established. Social messages stay published. Retain owner/auth/accounts/connections/env/services/scheduler configuration, `library_creation_attempts` terminal tombstones and `scheduling_plan_operations` replay receipts. These receipts intentionally retain historical IDs; purging them is outside safe cleanup.

OWNER GATE alone is insufficient: exact counts, sender barrier, R2 reconciliation and recovery discard must be reviewable first. No batch DELETE command, broad database wipe, Redis flush or bucket purge is supplied.

## Remaining debt and stale documentation

- Accepted scheduler timing debt remains: GitHub cron is not SLA-grade; no precision redesign, new worker/service or infrastructure migration started.
- Redis persistence is OFF; existing SQL reconciliation is material to restart recovery. Actual production crash/restart behavior not freshly verified.
- No durable R2 deletion retry/receipt; no complete cleanup sender barrier; ordinary Post tombstones absent. These are independent safety gaps, not silently accepted debt.
- Owner-server backup/DNS/TLS readiness remains unverified; Render reports a free PostgreSQL expiry of 2026-10-31. This records existing resource lifecycle only, not permission to upgrade/migrate.
- `ROADMAP.md:3` and AGENTS current-state paragraph describe main/LIVE at `fba2933`; current main and deploy are `da9a2e89`. The former is valid historical acceptance SHA, stale as current authority.
- `ROADMAP.md:6` still says review/merge/deploy Phase 9 closure; PR36 is already merged and its SHA LIVE. Next-step text is stale.
- Historical “BullMQ worker implemented/deployed” text does not establish a running Render worker: current service inventory shows a web service and the configured GitHub HTTP scheduler; external runtime remains unverified.
- Phase 5/6 are correctly DONE in current roadmap; the old local checkout's “Phase 5 next / Swipe future” wording must not be used as current evidence.
- Later Phase 9 future-options paragraph is an expansion wishlist, not evidence that repeating content/best-time automation exists. AI product exclusion remains; separate AI newsroom work is not started here.

Historical docs/ROADMAP/AGENTS were not rewritten. New evidence is kept in this report.

## Fresh local verification

- Swipe: `node --test --test-concurrency=1 --experimental-strip-types tests/swipe-planner-ui.test.mjs tests/swipe-planner-app.test.mjs tests/swipe-planner-recovery.test.ts`: **27 PASS / 0 FAIL / 0 SKIP**, exit 0, mocked lifecycle/pure recovery only.
- Bounded audit set: media-validation, scheduler-queue, scheduling-plan, scheduling-plan-recovery, library-creation-attempt, library-editor-recovery-storage, analytics-identity: **42 PASS / 2 FAIL / 0 SKIP**. Two test files failed import (`bullmq`, `pg` absent); no assertion regression/root cause is inferred. Preserve both failures, do not describe this run as green or weaken its selection.
- Frozen-lockfile dependency install with scripts disabled encountered registry download/timeouts and was stopped; no package/lockfile changed. Root ancestor dependencies resolved some imports; local Node 24.21.0 differs from CI 22.13.0. Full local typecheck/lint/build/native integration not performed. No migration/test DB against production.
- Documentation diff/secret/scope review performed before commit; draft PR CI tracked separately in chat. Main CI does not certify this new documentation as complete or cleanup as safe.

## Next milestones and completion checklist

[Independent A–D task contracts and checks](../superpowers/plans/2026-10-12-audit-next-milestones.md). None has started implementation or received cleanup approval.

- [x] Verify exact source checkout/main and Render deploy, PR and CI sources.
- [x] Inspect current code/tests/roadmap/deletion/scheduler/recovery/Swipe paths.
- [x] Separate CODE, local TESTED, dated PRODUCTION VERIFIED, and UNPROVEN.
- [x] Prepare safe aggregate-only inventory and conditional cleanup sequence.
- [x] Identify irreversible consequences, preservation invariants and independent milestones.
- [ ] Obtain exact production PostgreSQL/Redis/R2/browser inventory.
- [ ] Prove sender barrier, resolve mixed cancellation/R2/pending-recreation blockers.
- [ ] Produce exact-count reviewable dry-run manifest; only then request separate execution OWNER GATE.

Final Task 01 status remains inventory-blocked, not audit-complete or CLEANUP_SAFE=YES.
