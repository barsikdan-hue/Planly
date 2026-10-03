# Functional MVP verification — 2026-10-03

Base/production checkpoint: `3d1fcbad82a5321dce9073fb18b51b7b0319e08f`. Work branch: `codex/functional-mvp`. Merge and production deployment remain human gates. Scheduler trigger timing is accepted temporary debt per ROADMAP.md; no timing or architecture work is included.

## Task 1: content validation

**Root cause:** `createPost` / `updatePost` called `validateRelations`, which checked owner media/account relationships but did not check effective target content. `reconcilePostPublicationsInTx` enqueued any active target with a scheduled time. Connector content checks ran only later, after enqueue. Regression tests reproduced acceptance of Telegram 4097-character text, MAX 4001-character text and incompatible media before the fix.

**Change:** Shared `validatePublicationContent` now checks owned media metadata and `textOverride ?? baseText` for every scheduled target in the save transaction, before any writes or reconciliation. A failure produces actionable HTTP 422 with its validation code. Existing connector guards call the same validator for defense at execution time. Unscheduled drafts remain permissive. Generic client/server presence checks also accept text supplied only in a selected target override.

Current Planly publication subset (does not expand capabilities):

| Capability | Telegram | MAX |
|---|---|---|
| Text without media | 4096 UTF-16 units | 4000 UTF-16 units |
| Text with media | 1024 | 4000 |
| Media | JPEG, PNG, MP4; up to 10 | JPEG, PNG, MP4; up to 12 |
| File size | photos 10 MiB; video 20 MiB | 20 MiB |
| Known image dimensions | width+height <=10000; aspect <=20 | each axis <=7680 |

Rules preserve the existing conservative connector limits. Providers may allow more; this fix deliberately does not expand Planly's storage/formats. Provider references checked during implementation: [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage), [sendPhoto](https://core.telegram.org/bots/api#sendphoto), [sendMediaGroup](https://core.telegram.org/bots/api#sendmediagroup), [MAX messages](https://dev.max.ru/docs-api/methods/POST/messages), [MAX media](https://dev.max.ru/docs-api/use-cases/sending-messages/media).

**Tests:** Red evidence: three persistence failures and two override-only failures before implementation. Focused suite after fix: 88/88, including authenticated API 422, atomic rollback, scheduled-DRAFT bypass, empty override semantics, connector boundaries and terminal VALIDATION through tick and worker paths. Independent review rerun: 12/12 validation unit/integration tests. Typecheck passed. Local tests use a disposable PGlite PostgreSQL-compatible database, not production; final native PostgreSQL/Redis results appear below.

**Runtime:** Actual local Next HTTP path returned 422 for incompatible content with post/publication counts unchanged. With synthetic accounts and loopback provider fixtures, TG/MAX requests exercised actual adapter serialization; VALIDATION remained terminal and each target retained its own outcome. This is not a fresh live-provider or production deployment claim.

**Commit:** `09dfd22`. [CI 37128816051](https://github.com/barsikdan-hue/Planly/actions/runs/37128816051) passed 171/171 on PostgreSQL/Redis, migrations, typecheck, lint and build. [Self-host 37128816093](https://github.com/barsikdan-hue/Planly/actions/runs/37128816093) passed. These runs validate the PR merge tree for this head; later commits need fresh CI.

## Task 2: unfinished editor reload recovery

**Root cause:** `PlannerApp` initialized its editor with `useState(blankPost)`. Bootstrap restored the saved server list but not the unfinished editor. Three failing lifecycle tests reproduced reload loss, failed-save/reload loss, and an older successful request clearing newer editor work.

**Change:** One owner-scoped sessionStorage record stores editable fields after authenticated bootstrap. No autosave requests, background publication, new storage service or database table. Current server statuses and fresh media URLs remain authoritative. Missing posts recover as new drafts with notice; missing media IDs are pruned. New/Edit/Copy/Media replacements share a confirmation for meaningful unsaved content; date/time/network-only selections in an otherwise empty new draft do not prompt. Closing the tab/browser is outside the recovery guarantee.

All editor changes advance a revision. Confirmed save resets/clears only the submitted revision, using the last successful cache snapshot so a later quota error cannot resurrect older text after saving. Recovery accepts unfinished input beyond submission limits (for example 21 attached files), while refusing unreadable or oversized cache writes before replacing the prior copy. Read/write/remove failures report recovery unavailability and keep the editor usable.

**Review and tests:** Independent review found and reproduced two additional edge cases: own-written over-limit editor cache was unreadable, and a failed cache write followed by successful server save revived older content. Both were fixed with regressions. Final focused suite: 33/33; independent recovery rerun: 19/19; final typecheck passed. Tests execute helper functions and actual PlannerApp callbacks/effects through an explicitly scoped hook harness; they do not establish React renderer or browser acceptance.

**Runtime:** Final Edge acceptance on the compiled local branch restored text, selected targets, per-target text, date/time and ordered media after reload. A failed existing-post PATCH followed by reload retained the edited text and saved successfully on the next explicit request. The current branch has not been deployed; this does not establish production acceptance.

**Commit:** `1639947`. [CI 37130017047](https://github.com/barsikdan-hue/Planly/actions/runs/37130017047) passed 192/192 on PostgreSQL/Redis, with zero failed/skipped, plus migration drift, typecheck, lint and build. [Self-host 37130017046](https://github.com/barsikdan-hue/Planly/actions/runs/37130017046) passed. These runs validate this commit's PR merge tree, not later changes or production.

## Functional audit fix: media preview order

**Root cause:** Composer used `media.filter` and Poster used `media.find`, both preserving library order instead of selected `post.mediaIds` order. Real React static rendering reproduced selected `[B video, A image]` appearing `[A, B]` with the wrong cover.

**Change:** Both components use a small ordered media lookup. Missing assets are skipped and the text cover remains when none exist. Storage URLs and publication/media persistence are unchanged by this fix.

**Tests/runtime:** Two rendered SSR regressions failed before the fix; eight focused render/navigation checks passed after it, including library permutations and missing media. Focused lint passed with four existing image warnings. These are real React static renders, not interactive browser proof. Signed URL expiry failure is still not reproduced; it is deliberately outside this ordering fix.

**Commit:** `a621160`. Independent diff review found no must-fix findings; root reran the five media render checks successfully before this separate commit.

## Functional HTTP audit before remaining fixes

The actual Next HTTP/Drizzle/connector path passed ten local test groups: authentication and health; profile/account settings; upload and preview byte transport; draft create/edit/delete; pre-enqueue validation rollback; future/due scheduling; independent provider outcomes; rate-limit retry deadlines; ambiguous delivery without automatic resend; and photo/video/album serialization. Provider transport and storage were loopback fixtures, not live Telegram/MAX or production R2.

Two additional failing cases were reproduced separately in `runtime/retry-post-audit-results.json`:

- Two identical `POST /api/posts` requests with the same Idempotency-Key returned different post IDs and produced two Telegram sends in the fixture. The route ignored the key and `createPost` generated a new ID each time. The separate idempotent creation fix is described below.
- Editing published text returned success while retaining the original provider receipt; the edited text was never sent. `updatePost` changed content before reconciliation skipped terminal publication history. The separate edit guard and its verification are described below.

These are functional defects, unrelated to the accepted GitHub scheduler trigger timing debt.

## Functional audit fix: duplicate creation after lost response

**Root cause:** `POST /api/posts` ignored the caller's creation identity, and every `createPost` invocation generated a new random post ID. The browser also regenerated an immediate-publication timestamp on retry and had no durable pending request after reload. The local HTTP red case created two posts and two fixture sends from an identical request/key.

**Change:** Migration `0003` adds an immutable creation key and original input hash on the post, uniquely scoped to its owner. Same-key/same-input replay returns the existing post without enqueue/reconciliation/mirror work; different input conflicts with HTTP 409. Ordered media is part of the identity, target order is normalized, and later post edits do not replace the original hash. No new service or request ledger table.

The browser persists the exact request and UUID in owner-scoped sessionStorage before dispatch. Reload never submits automatically. A manual retry first retrieves the original result and then applies valid newer edits to the acknowledged ID. Invalid newer date/text or a failed follow-up PATCH retains the local edits and ID. A missing/malformed acknowledgement keeps the original request replayable. New/Edit/Copy/Media replacement is temporarily blocked until the uncertain creation is resolved, preventing editor identity loss after a cache failure. If the initial durable write fails, no new POST is dispatched; the text remains editable.

**Tests:** Root rerun: 35 PASS, 0 FAIL, 1 explicit local PGlite concurrency SKIP across authenticated creation integration, pending-request helpers and actual PlannerApp lifecycle callbacks. Native PostgreSQL CI runs that concurrency case by default. Independent review reproduced and verified fixes for invalid-date retries and replacement/cache-failure duplicate creation; final targeted review checks passed. Serialized-size checks prevent an own-written pending request from becoming unreadable, and an acknowledged ID alone does not regenerate publish-now time.

**Limits/runtime:** Final Edge acceptance below proves retained request recovery after reload, without automatic submission, and a manual retry returning the same already-published post with one fixture send. Guarantee lasts while the post row exists: hard deletion removes its creation key, so a much later raw replay after deletion can create again. This is not a universal exactly-once guarantee or a new scheduler design. sessionStorage recovery is limited to the same tab; closing it is outside the guarantee.

**Follow-up regression:** Independent cross-feature review reproduced an unnecessary PATCH after reloading an unchanged pending request: schema parsing changed JSON property order. `3e9df84` canonicalizes both editor snapshots. The strengthened helper test first failed and then passed (3/3 helper checks); two real PlannerApp callback regressions independently passed for a published acknowledged ID with failed cache cleanup. `d59ea9b` also closes Redis handles in the authenticated creation tests so a connected CI Redis client cannot keep the test process alive.

**CI:** At `3e9df84`, [CI 37132493988](https://github.com/barsikdan-hue/Planly/actions/runs/37132493988) passed 212/212 with zero skipped, including the native PostgreSQL duplicate-request race, and migrations/typecheck/lint/build. [Self-host 37132494043](https://github.com/barsikdan-hue/Planly/actions/runs/37132494043) passed. Later edit-guard changes require their own CI.

## Functional audit fix: protect content with publication history

**Root cause:** `updatePost` changed the shared post/targets/media before `reconcilePostPublicationsInTx` skipped completed or uncertain publication history. A local HTTP reproduction returned 200 for changed text while retaining the old Telegram receipt, and another tick sent nothing for that changed text.

**Change:** The save transaction locks the owned post and its complete publication history before any change. A changed payload with published, publishing, reconnect-required or ambiguous-delivery history returns HTTP 409 (`POST_EDIT_BLOCKED`); an exact normalized no-op succeeds without writes or queue work. Ordinary drafts and unexecuted schedules remain editable. A processor claim and an edit contend on the same publication rows, preventing content changes after the claim wins.

The server exposes an edit-block reason from all history, including inactive targets. Content details and restored/open editors show the original read-only; copying uses the current local text and clears publication identity. Calendar drag and direct submission are guarded. A retained pending creation can still be resolved through the global retry control after its original was published. Delete copy explicitly says that the Planly record is removed and already published provider messages remain.

**Tests:** Backend RED: 16 assertion failures before implementation. Backend focused/protected GREEN: 51 PASS, 0 FAIL, 2 explicit local PGlite native-concurrency SKIP (creation and edit/claim); both passed in native PostgreSQL CI. Final client/recovery/planner/render batch: 54/54. Typecheck passed; focused lint has zero errors and five image warnings. Independent review found no remaining must-fix after the canonical pending fix; its two retained-pending callback checks passed. Native locks, production build and browser read-only/copy behavior are recorded below.

**Commit:** `2ab4b4b`.

## Evidence environment and limits

Local evidence is outside the repository in sibling `functional-mvp-evidence/`: red/green test logs, `final-ci.json`, `final-production-build.log`, `runtime/final-http-audit-results.json`, `runtime/final-boundary-results.json`, `runtime/edge-proxy-after-reload.json`, `runtime/edge-post-save-evidence.json` and `edge-independent-statuses.png`. Loopback services use separate UI and destructive-test databases, local storage/provider fixtures and synthetic owner credentials. Production data and secrets are not used. PGlite cannot prove native PostgreSQL lock concurrency; CI supplies that evidence. Unsigned local object storage cannot prove private-bucket policy; the separate Docker smoke uses private storage. Earlier HTTP evidence used a signature-only MP4; the final audit uploaded valid PNG and playable H.264 MP4 bytes, and Edge played the two-second video to completion (640×360, no media error).

## Final branch acceptance — source head `2ab4b4b`

**STATUS:** Code and compiled build are ready for review. Functional acceptance is **partial**, because upload through the browser file chooser is not proven and this branch has no fresh deployed/live-provider acceptance. Do not mark the entire milestone complete from local/fixture results.

**ROOT_CAUSE:** Independently reproduced defects were missing pre-enqueue validation, volatile editor state, preview ordering, duplicate creation and unsafe editing of publication history. Each implementation and regression is recorded above; no scheduler timing cause was investigated.

**CHANGED / COMMIT:** `09dfd22` validation; `1639947` recovery; `a621160` media ordering; `d1701a6` creation identity; `d59ea9b` test connection cleanup; `3e9df84` canonical pending comparison; `2ab4b4b` publication-history guard. Migration `0003` is additive and required with this branch. Documentation is committed separately after this source checkpoint.

**TESTS:** [CI 37132808635](https://github.com/barsikdan-hue/Planly/actions/runs/37132808635) passed **243/243, zero failures/skips**, migrations/drift, typecheck, lint and production build. Both concurrent creation and real processor/edit-lock contention ran on native PostgreSQL. [Self-host 37132808641](https://github.com/barsikdan-hue/Planly/actions/runs/37132808641) passed Docker boot, authenticated HTTP, actual worker private-media reads, stack recreation/persistence and Redis-loss reconciliation. These PR workflows checked out synthetic merge `16667c997fb039d818c0504f04147da2572e8fb0` (source head `2ab4b4bda65cfa2f86007a23684bb9059b1b2a23` + unchanged main `3d1fcbad82a5321dce9073fb18b51b7b0319e08f`). The verified compiled/source artifact is `planly-build-16667c997fb039d818c0504f04147da2572e8fb0`, artifact ID `11276539916`. Local Windows production build also exited 0, then the compiled Next server was used for final Edge acceptance.

**RUNTIME:** Final actual HTTP audit **10/10 PASS**, boundary audit **5/5 PASS**, with real app routes, database transactions and adapters; provider transport is loopback. No fresh Telegram/MAX messages were sent to external recipients. The optional `telegram-live` job was skipped.

| Flow | Result and evidence boundary |
|---|---|
| Dashboard | PASS in authenticated Edge: loaded cards and quick text transferred into Create Post. |
| Create Post / preview | PASS: common text, target overrides, Telegram/MAX selection, native date/time, ordered MP4→PNG preview; actual video playback completed. |
| Validation | PASS: visible TG 4097 / MAX 4001 errors retained editor input; HTTP audit proved 422 and atomic no-enqueue rollback. VALIDATION terminal behavior is covered by regression tests. |
| Reload recovery | PASS: same-tab unfinished fields survived reload; server-saved draft reopened with text/override/media order. Unscheduled saved drafts intentionally have no schedule and reopen with the default suggested date/time. |
| Content | PASS: draft filter/search, saved draft reopen/edit, future schedule, published details, clone into independent draft, deletion of the disposable copy. |
| Calendar | PASS: day/week/month, next period, scheduled item, slot→new editor with the correct date/time. Drag itself was not manually exercised; guard/callback and API behavior are tested. |
| Media | PASS: API upload/readback of actual bytes, library video filter/search, picker and “В пост”, preview/playback. File chooser UI upload is NOT PROVEN; see blocker below. |
| Settings | PASS: profile save/reload, TG/MAX connection checks against local transports, MAX enable/disable/reload. |
| Immediate publication / independent targets | PASS: browser publish-now, authenticated local tick, then one card displayed Telegram published and MAX terminal provider error independently. Screenshot retained. |
| Scheduled publication | PASS: UI future schedule saved and appeared in Calendar; HTTP audit proved future target withheld, then due target executed through actual processor. Exact GitHub trigger timing remains accepted debt. |
| Published original / copy | PASS: original details offered copy instead of edit; copied draft had fresh identity and draft target statuses. Direct changed PATCH returned 409; exact no-op returned 200 without resend. |
| Provider failures | PASS in fixture runtime: terminal provider rejection, temporary 429/retry deadline, ambiguous-delivery no automatic resend. These are deterministic transport responses, not live outages. |
| Network failure during edit | PASS in Edge: local proxy returned 503 for existing-post PATCH; text survived reload and subsequent explicit save succeeded. |
| Duplicate / lost acknowledgement | PASS in Edge + server evidence: a socket-drop caused a transparent browser replay without duplicate creation. A second case replaced committed 201 with 503; reload issued no POST, manual retry recovered original published ID `7d31249e-fbb4-44d0-af08-d31919e3da8e`, exactly one row and one Telegram fixture send. |
| Production / live providers for this branch | NOT RUN: production remains the `3d1fcba` checkpoint; merge/deploy remain human gates. Historical provider proof is separately labelled in ROADMAP. |

**File chooser blocker:** The user enabled file URL access and reconnected Edge. The browser tool still rejected `fileChooser.setFiles` before assigning files or calling Planly. Read-only inspection of `edge://extensions/` was also refused by browser URL policy. This is a tool permission blocker, not evidence of a Planly upload failure. No alternate internal-page or security-policy bypass was attempted. A manual file selection/upload through the compiled preview is still needed to close this acceptance row.

**NEXT_ACTION:** Complete the manual chooser/upload check, review [draft PR #4](https://github.com/barsikdan-hue/Planly/pull/4), then obtain explicit owner approval before main merge and production deployment. After an approved deployment, perform fresh production walkthrough and provider acceptance. No VK, AI, analytics, paid Render, broad refactor or scheduler architecture changes are included.
