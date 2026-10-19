# Independent focused follow-up of whole-M1 findings

Date: 2026-10-19. **SOURCE REVIEW PASS** for the three findings in `E-final-review.md`, against immutable source `0f687394acb0381a7ca6a40d8da2d605ceadcee7`. No new actionable P0/P1/P2 found in the scoped corrective diff from `fc26d14fb0b454d578ff850fbc6fc60a46de635d`.

This is a source-review disposition, not CI_PASS, staging/production acceptance, provider verification or release permission. The original report remains the record of defects in the earlier candidate.

## Scope and authority

- Verified HEAD `0f687394acb0381a7ca6a40d8da2d605ceadcee7` and clean worktree in `work/Planly-lentaro-m1`.
- Inspected the corrective contract/server/client/UI diff, new native/browser/recovery tests, updated compiled HTTP smoke, editorial Git-index integrity test and correction evidence reports. No full baseline/PR68 audit was repeated.
- No product files changed, no runtime/DB/browser/full-suite runs, no provider or external writes. This report is the only owned output of the follow-up.

## Disposition

### M1-R1 (P1) - CLOSED in source

`lib/contracts/shared-feed.ts` now requires `expectedActorId` on LIKE and DISLIKE. `components/planner/shared-feed.tsx` takes it from the displayed `ownerContext.id`; `lib/client/shared-feed-recovery.ts` persists it in the immutable intent, checks equality with the journal owner both on submission and read, and retains pending state after `409 SHARED_FEED_ACTOR_CHANGED`.

`lib/server/shared-feed.ts` compares the precondition with the authenticated transaction actor as the first callback operation, before historical receipt lookup, source access, copying or Post creation. The uncertain-COMMIT reconciliation callback applies the same comparison before its receipt lookup. Cookies and the existing actor/session transaction remain the authority; the client field cannot select another user. A mismatch cannot acknowledge or mutate another actor's operation. The request hash includes the assertion, while receipt and DB shapes remain unchanged.

Regression coverage is causal and matches the finding: native stale-A LIKE and DISLIKE under B cookie assert zero copies/Posts/publications/receipts/bytes/queue effects; a historical same-key test ensures the actor precondition wins before replay; native HTTP covers 409 mismatch, 422 missing assertion, and matching-context 201. Browser cases exercise fresh and uncertain stale-A requests under B without sentinel polling and retain the exact A journal. Recovery unit coverage rejects a mismatched journal owner before network and preserves the original pending input on ACTOR_CHANGED. The compiled HTTP smoke now supplies the field and checks cross-cookie 409/zero B Posts.

The prior candidate was not deployed; requiring the new field without upgrading old experimental journals is therefore not a released-client compatibility blocker. Malformed/old journals fail closed rather than being silently rekeyed.

### M1-R2 (P2) - CLOSED in source

SharedFeed increments its `slotRevision` only after a confirmed recovered LIKE and passes it to SwipePlanner. The optional prop defaults to zero for existing consumers. SwipePlanner includes the revision in both its request-attempt cache and preview result, and requires revision equality before considering a preview usable. Consequently the old occupied minute becomes unusable immediately, a new preview is fetched after pending/busy clear, and stale preview responses are fenced by effect cleanup. Selected providers and scheduling settings remain mounted and intact.

The new browser regression recovers the first LIKE in the same mounted feed, then approves a second material at the new fixture slot. It asserts byte-identical replay of the first intent, exactly two resulting Posts, three total requests and distinct intended scheduled minutes. This covers the retained-cache trigger rather than relying on remount/reload.

### M1-R3 (P2) - CLOSED in source

The added `refreshSharedFeed` in `components/planner/app.tsx:453` reads one complete bootstrap, checks the captured owner lifetime and returned profile, retries if media/Library revisions changed during the read, and applies posts, accounts, Library and private media together. It then increments both revisions to invalidate older competing snapshots. SharedFeed now awaits this function before returning its confirmed publication result.

The image regression uses distinct shared/private media references and a paused clock so scheduled polling cannot hide a missing update. It opens the saved publication immediately, verifies the owned image URL and decoded dimensions, and confirms a private image fetch. The fixture supplies the created private USED Library row in the same bootstrap. The UI assertion focuses on the image, while inspection directly confirms that Library rows are applied in the same guarded state update. No shared-preview URL is substituted for owned media.

## Verification provenance and remaining gates

- Inspected reports record causal native RED followed by 33/33 server GREEN; the two UI regressions RED followed by 8/8 focused browser GREEN; complete current shared-feed browser spec 28/28 GREEN; recovery 7/7; editorial working-tree/Git-index integrity 2/2; TypeScript and scoped ESLint PASS. These are coordinating/implementing agents' recorded local results, not reruns by this reviewer.
- The editorial correction restores reviewed bytes in Git blobs and adds a Git-index hash test, preventing a working-tree-only PASS from hiding checkout conversion. The test inspects actual `git show :path` bytes. It does not replace fresh Linux CI.
- Default `git diff --check fc26d14 0f687394` reports trailing-whitespace diagnostics on intentionally preserved CRLF evidence files. That is a byte-preservation consequence, not a product defect or a reason to rewrite reviewed evidence. A claim of diff-check PASS must identify its actual scoped command/configuration; the whole range's default check is not clean.
- Initial candidate CI had the documented packaging failure; it is not evidence against this corrected tree, nor a PASS for it. Fresh exact-source CI, canonical compiled HTTP smoke, full browser/build checks and Self-host remain necessary. Bind results to the source and actual synthetic-merge/artifact SHAs.
- No M1 live/staging/production/provider acceptance is established here. Existing exact merge, release, persistent migration, recovery and provider gates remain in force. No additional internal Owner approval gate is introduced by this review.

## Follow-up: compiled HTTP cancellation test correction

Date: 2026-10-19. **TEST CORRECTION SOURCE REVIEW PASS** for the sole worktree diff in `tests/shared-feed-http-smoke.mjs` against HEAD `0f687394acb0381a7ca6a40d8da2d605ceadcee7`. Reviewed Git blob identity of the corrected test: `d43e09e300fcd2cc97eb43ebb57a43c93a0909d0`. No new actionable P0/P1/P2 or remaining incorrect cancellation-path assumption found in this scoped correction. Product source is unchanged.

The failed assertion had conflated two existing operations. `publication-approval-history.ts:11-35` makes the special target cancel-approval action available only for a bounded safe AUTH / REQUIRES_RECONNECT history. A fresh future SCHEDULED publication has no such AUTH row, so UNSUPPORTED_HISTORY is the correct preview. The new assertion explicitly retains that boundary instead of bypassing it.

The corrected smoke sends the normal existing editor PATCH: status DRAFT, unchanged title/text/media, same providers/text overrides, all scheduledAt values null. This matches the existing `cancelInput` and whole-Post cancellation regression in `tests/library-batch.integration.test.ts:124-130`. `publications.ts:68-77` cancels open publications when the Post ceases to be READY or its target schedule is removed. Existing adjacent regression coverage rejects cancellation after a claim/partial publication and prevents a stale job from sending after successful cancellation; none of those product rules were changed.

The smoke now checks actual HTTP success, returned DRAFT with unchanged base text and media IDs, cleared target dates and CANCELLED target outcomes, plus exactly two durable CANCELLED publication rows with zero attempts and null remote IDs. Receipt count and private USED source checks remain. The PASS message accurately says pre-send draft cancellation instead of per-network cancellation. This is a correction to the test's selected operation, not a conditional skip, weakened expected state or product behavior change.

CI `39233344061` results supplied by the coordinator (1690 native PASS, typecheck/lint/build and five earlier compiled smokes PASS, followed by the incorrect eligibility assertion) were not independently fetched here. No local compiled runtime, DB, provider call or tests were run for this review. Fresh canonical CI must execute the corrected smoke before claiming CI_PASS. Update release/client evidence wording wherever it still describes this particular smoke as generic per-network cancellation; independent outcome display and the existing AUTH-specific cancellation remain separate supported scopes.