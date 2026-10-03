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

**Tests:** Red evidence: three persistence failures and two override-only failures before implementation. Focused suite after fix: 88/88, including authenticated API 422, atomic rollback, scheduled-DRAFT bypass, empty override semantics, connector boundaries and terminal VALIDATION through tick and worker paths. Independent review rerun: 12/12 validation unit/integration tests. Typecheck passed. Local tests use a disposable PGlite PostgreSQL-compatible database, not production; real PostgreSQL/Redis CI is still required for complete regression.

**Runtime:** Actual local Next HTTP path returned 422 for incompatible content with post/publication counts unchanged. With synthetic accounts and loopback provider fixtures, TG/MAX requests exercised actual adapter serialization; VALIDATION remained terminal and each target retained its own outcome. This is not a fresh live-provider or production deployment claim.

**Commit:** `09dfd22`. [CI 37128816051](https://github.com/barsikdan-hue/Planly/actions/runs/37128816051) passed 171/171 on PostgreSQL/Redis, migrations, typecheck, lint and build. [Self-host 37128816093](https://github.com/barsikdan-hue/Planly/actions/runs/37128816093) passed. These runs validate the PR merge tree for this head; later commits need fresh CI.

## Task 2: unfinished editor reload recovery

**Root cause:** `PlannerApp` initialized its editor with `useState(blankPost)`. Bootstrap restored the saved server list but not the unfinished editor. Three failing lifecycle tests reproduced reload loss, failed-save/reload loss, and an older successful request clearing newer editor work.

**Change:** One owner-scoped sessionStorage record stores editable fields after authenticated bootstrap. No autosave requests, background publication, new storage service or database table. Current server statuses and fresh media URLs remain authoritative. Missing posts recover as new drafts with notice; missing media IDs are pruned. New/Edit/Copy/Media replacements share a confirmation for meaningful unsaved content; date/time/network-only selections in an otherwise empty new draft do not prompt. Closing the tab/browser is outside the recovery guarantee.

All editor changes advance a revision. Confirmed save resets/clears only the submitted revision, using the last successful cache snapshot so a later quota error cannot resurrect older text after saving. Recovery accepts unfinished input beyond submission limits (for example 21 attached files), while refusing unreadable or oversized cache writes before replacing the prior copy. Read/write/remove failures report recovery unavailability and keep the editor usable.

**Review and tests:** Independent review found and reproduced two additional edge cases: own-written over-limit editor cache was unreadable, and a failed cache write followed by successful server save revived older content. Both were fixed with regressions. Final focused suite: 33/33; independent recovery rerun: 19/19; final typecheck passed. Tests execute helper functions and actual PlannerApp callbacks/effects through an explicitly scoped hook harness; they do not establish React renderer or browser acceptance.

**Runtime boundary:** Fresh browser reload acceptance remains pending browser connectivity. Previous production walkthrough reproduced the original loss; the current branch has not been deployed. Full functional browser acceptance and fresh exact-head CI remain milestone requirements.

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
- Editing published text returned success while retaining the original provider receipt; the edited text was never sent. `updatePost` changed content before reconciliation skipped terminal publication history. An edit guard is being prepared separately.

These are functional defects, unrelated to the accepted GitHub scheduler trigger timing debt.

## Functional audit fix: duplicate creation after lost response

**Root cause:** `POST /api/posts` ignored the caller's creation identity, and every `createPost` invocation generated a new random post ID. The browser also regenerated an immediate-publication timestamp on retry and had no durable pending request after reload. The local HTTP red case created two posts and two fixture sends from an identical request/key.

**Change:** Migration `0003` adds an immutable creation key and original input hash on the post, uniquely scoped to its owner. Same-key/same-input replay returns the existing post without enqueue/reconciliation/mirror work; different input conflicts with HTTP 409. Ordered media is part of the identity, target order is normalized, and later post edits do not replace the original hash. No new service or request ledger table.

The browser persists the exact request and UUID in owner-scoped sessionStorage before dispatch. Reload never submits automatically. A manual retry first retrieves the original result and then applies valid newer edits to the acknowledged ID. Invalid newer date/text or a failed follow-up PATCH retains the local edits and ID. A missing/malformed acknowledgement keeps the original request replayable. New/Edit/Copy/Media replacement is temporarily blocked until the uncertain creation is resolved, preventing editor identity loss after a cache failure. If the initial durable write fails, no new POST is dispatched; the text remains editable.

**Tests:** Root rerun: 35 PASS, 0 FAIL, 1 explicit local PGlite concurrency SKIP across authenticated creation integration, pending-request helpers and actual PlannerApp lifecycle callbacks. Native PostgreSQL CI runs that concurrency case by default. Independent review reproduced and verified fixes for invalid-date retries and replacement/cache-failure duplicate creation; final targeted review checks passed. Serialized-size checks prevent an own-written pending request from becoming unreadable, and an acknowledged ID alone does not regenerate publish-now time.

**Limits/runtime:** Browser lost-response acceptance remains pending the final local runtime. Guarantee lasts while the post row exists: hard deletion removes its creation key, so a much later raw replay after deletion can create again. This is not a universal exactly-once guarantee or a new scheduler design. sessionStorage recovery is limited to the same tab; closing it is outside the guarantee.

## Evidence environment and limits

Local evidence is outside the repository in sibling `functional-mvp-evidence/`: red/green test logs and `runtime/http-audit-results.json`. Loopback services: separate UI and destructive-test databases, local storage/provider fixture, synthetic owner credentials. Production data and secrets are not used. PGlite serializes a single backend and cannot prove PostgreSQL lock concurrency. Unsigned object-storage fixture cannot prove private-bucket access policy. A signature-only MP4 fixture proves upload/request handling, not video playback. Browser and final exact-head CI results must be recorded separately below.
