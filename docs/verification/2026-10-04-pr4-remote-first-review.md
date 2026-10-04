# PR #4 — owner review and Render acceptance

Owner decision: 2026-10-04, Europe/Moscow. Permanent remote-first rules are in [AGENTS.md](../../AGENTS.md). Internal [branch evidence](2026-10-03-functional-mvp.md) supports review; it does not establish final user-facing PASS.

## Preflight verified remotely

- GitHub PR [#4](https://github.com/barsikdan-hue/Planly/pull/4): open, unmerged, no conflicts at preflight head `66ade08f00b3bab602f935ae4513b9d0f7dda4a6`. Functional code is `2ab4b4b`; later changes document evidence/workflow only.
- [CI 37134730182](https://github.com/barsikdan-hue/Planly/actions/runs/37134730182): success, 243/243, zero skips. [Self-host 37134730172](https://github.com/barsikdan-hue/Planly/actions/runs/37134730172): success; actual Docker web/worker/private-media/persistence smoke. The live-provider job was skipped. These check results were reread from GitHub for this preflight; subsequent workflow/documentation commits need their own green checks.
- GitHub main and Render live deployment both match `3d1fcbad82a5321dce9073fb18b51b7b0319e08f`.
- Existing service `srv-dav07le0tbcc73d0gfi0`, workspace `tea-daqajuqd0e5s739t0fp0`, [Planly](https://planly-m4zq.onrender.com): live deploy `dep-db0fbvfavr4c73fequ0g`; `/api/health` returned HTTP 200, `status: ok`.
- Render autoDeploy is off. Specific owner approval must cover PR merge and the manual deploy on this existing service. No configuration change is needed to enable autoDeploy.

## Change and risks

- Scheduled Telegram/MAX content is validated before transactional writes/enqueue; unscheduled drafts remain permissive and VALIDATION remains terminal. Existing conservative capabilities are shared with the connectors.
- Same-tab unfinished editor recovery uses sessionStorage; it does not save automatically to the server and does not guarantee recovery after tab/browser closure.
- Media preview follows selected media order.
- Exact creation payload/key persists before POST; same-key replay resolves one original post. Uncertain creation must be resolved before replacing the editor. Hard deletion ends that post's key guarantee.
- Published, sending, reconnect-required or ambiguous originals reject changed content with 409; users create a separate draft copy. Draft/unexecuted schedule editing remains supported. Native processor/edit and concurrent-creation races passed in CI.
- Migration `drizzle/0003_clear_groot.sql`: nullable `posts.creation_key`, nullable `posts.creation_input_hash`, unique B-tree index `(user_id, creation_key)`. No rows/columns/tables are removed. Existing null keys remain valid. Index creation takes a database lock; the existing Render build runs `pnpm db:migrate` before build. If a later build fails, keep the additive migration and inspect the failed deployment rather than deleting columns.
- No new env/secrets, service, paid resource or scheduler architecture. The main risks to verify are stricter validation in the real UI, editor save/reload identity, and published/copy behavior with real provider receipts.

**Merge readiness:** technically ready for owner review once the latest pushed documentation/workflow commit is green. There is no mandatory localhost chooser gate. Final online acceptance remains pending the authorized deployment.

## After specific owner merge + deploy approval

1. Merge the reviewed PR head, capture GitHub main SHA, deploy that commit on the existing Render service, wait for live and match deployed SHA; check health and bounded error logs. Continue without another approval stop between these authorized steps.
2. Production browser walkthrough: Dashboard → Create Post (common/target text, Telegram/MAX, date/time, preview) → draft/save/reload/reopen/edit → Content → Calendar → Media → Settings. Confirm independent target statuses and protected original/draft-copy semantics. Use marked disposable test content; do not edit/delete unrelated owner content or published provider messages.
3. Actual Render media upload: select a small PNG and MP4 using a supported browser mechanism or manual production file selection if the tool cannot assign files. Verify saved assets, signed preview/video playback, selected order and reload. Record tool limitations separately from product outcomes.
4. Provider validation is affected, so a minimal safe live smoke is appropriate: one marked valid media post to both existing owner-confirmed destinations and one marked scheduled text post to both; use current capabilities and record actual remote receipts/statuses. Confirm no early send, then eventual delivery; trigger-time delay is accepted debt, not an interval investigation. Prefer these two posts to rerunning the historical full media matrix.
5. Try incompatible scheduled content in production without submitting it to providers; verify actionable validation and no enqueue. Check duplicate-request recovery against a disposable draft rather than deliberately risking duplicate live sends. Record any provider/network errors that occur; branch fault injection remains internal evidence and need not be replayed against real providers.
6. Report final PASS per function only after its production/provider evidence. If manual file selection or safe provider destination verification still needs the owner, identify that specific missing step without inventing a product bug or imposing localhost acceptance.

Scheduler timing remains accepted TECH DEBT; no VK, AI, analytics, Swipe Planner, scheduler redesign or paid Render resources in this milestone. SMART CONTENT QUEUE / SWIPE PLANNER remains in ROADMAP for later implementation.
