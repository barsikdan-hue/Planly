# Independent whole-M1 source review

Date: 2026-10-19. Verdict: **FINDINGS — 1 P1, 2 P2** against immutable candidate `fc26d14fb0b454d578ff850fbc6fc60a46de635d`, baseline PR68 `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`.

Checkout inspected: `work/Planly-lentaro-m1`, branch `codex/lentaro-m1`, remote `https://github.com/barsikdan-hue/Planly.git`. HEAD matched the candidate; status was clean at inspection. No product edits, commits, DB/browser runs, provider operations or external writes were performed by this reviewer. This report is the only owned output. The already completed full PR68 review was not repeated.

## Findings

### M1-R1 — P1: Bind the displayed owner to the durable shared decision

Primary location: `lib/contracts/shared-feed.ts:5–11`; request construction `components/planner/shared-feed.ts:55–60`; dispatch `lib/client/shared-feed-recovery.ts:35–39`; server actor resolution `lib/server/shared-feed.ts:64–78`.

The intent contains a globally shared source and provider names, but no assertion of the owner whose workspace and destinations the person reviewed. `isOwnerCurrent` checks only the current tab's in-memory owner lifetime (`components/planner/app.tsx:120–121`). Its owner poll does not run with no scheduled posts (`app.tsx:456–459`), and cookie changes in another tab do not update that reference. If tab 1 displays A, tab 2 logs out and signs in as B, a decision from tab 1 passes its local guard and is sent with B's current cookie. The service correctly authenticates B, then finds B's accounts by provider and creates B's publication from the A-screen action. The receipt can also be written under A's journal before `onSaved` eventually notices the profile change. Replaying A's uncertain operation under B is equally unsafe because user-scoped deduplication sees a new B operation.

This is a wrong-workspace consent/destination defect in the new shared flow, not a claim that the backend allows access to another actor's private rows. Shared IDs are valid to both actors, so ordinary private-source ownership checks cannot reject this input.

Required correction: persist the displayed owner as part of the exact immutable intent; compare it with the authenticated actor before historical lookup or any mutation, while cookies remain the sole identity authority. A mismatch must preserve A's recoverable intent and create no B receipt, copy, Post or publication. Do not solve this only by an asynchronous profile preflight, which leaves a cookie-switch race.

Missing regression: A-screen fresh submission and same-key pending recovery after cookie switches to B, without the synthetic polling sentinel; assert zero B effects. The existing browser owner-switch test changes owner only after request capture and forces scheduled-post polling, so it does not cover this trigger.

### M1-R2 — P2: Refresh the next-slot preview after manual recovery

Primary location: `components/planner/shared-feed.ts:64–69`; related preview cache `components/planner/swipe-planner.tsx:92–108` and normal-success invalidation `swipe-planner.tsx:132`.

After a LIKE commits but its response is lost, the current SwipePlanner retains its cached preview of that occupied minute. Manual recovery calls `finish` directly, removes the source card, and clears pending/busy. It does not pass through SwipePlanner's normal successful `decide` branch, which clears the preview and increments its refresh generation. The preview effect therefore sees the same query/refresh and returns without loading a new slot. The next card remains pointed at the previous publication's occupied minute; approving it predictably gets `PLANNER_SLOT_CONFLICT`. Refreshing the outer feed alone also does not invalidate that child cache. This breaks continuous calendar filling immediately after successful recovery.

Required correction: invalidate/reload the next-slot preview after a confirmed recovered LIKE, retaining the user's selected networks and scheduling preferences. Only enable the next approval with an authoritative new free slot.

Missing regression: commit first LIKE with lost response, recover in the same mounted feed, then approve the second material. Assert a new slot lookup, a different free scheduled minute and exactly one Post per intended material. Existing lost-ACK browser coverage stops at the recovered first receipt. Reload-before-recovery alone cannot expose the retained-cache variant.

### M1-R3 — P2: Apply copied media and Library state before opening the new publication

Primary location: `components/planner/app.tsx:1137`, the newly added `SharedFeed.onSaved` callback.

Direct LIKE creates a new private Library item and new private media IDs. The callback already receives the complete bootstrap snapshot but applies only `posts` and `socialAccounts`, leaving `data.media` and `data.libraryItems` stale. Immediately selecting “Открыть публикацию” therefore renders a text fallback rather than the approved image: `components/planner/common.tsx:25–29` resolves the Post's new media IDs against that stale array. Opening the manual editor likewise lacks the copied attachment in its media collection, and the private USED item is absent from Library until polling/reload. A later five-second scheduled-post poll can repair this, but the promised immediate result is incomplete.

Required correction: apply the returned private media/Library snapshot using the existing owner and revision fencing, so concurrent uploads/editor work cannot be overwritten. Preserve private copied IDs and ordered bytes; do not substitute the shared preview URL for owned media.

Missing regression: browser fixture with a real shared image and bootstrap containing distinct newly copied private media IDs; immediately open the result and Library before a poll, asserting the image and private USED item. The current browser fixture returns `media: []` and creates result Posts with `mediaIds: []`, masking this integration. The compiled smoke checks the API's private bytes but does not exercise React state propagation.

## Other review observations and evidence limits

- Approved v2 contract, design/plan, PROJECT_STATE and all three M1 verification reports were read. The new navigation, sign-in/invite labels and onboarding route into existing connection settings; existing cancellation and per-network outcome UI remain reused. Default personal SwipePlanner behavior and B1 USER guard are preserved by the changed source. No new sender/scheduler was introduced.
- Journal source retains exact pending input, validates acknowledged receipt identity, fails closed on malformed/unwritable storage, scopes storage by owner, and keeps terminal history. Backend uniqueness protects same-source/revision decisions across distinct operation keys. These positive observations do not resolve M1-R1 or replace an actual two-tab browser acceptance test.
- Server transaction/storage/isolation depth is being independently reviewed by the separate focused reviewer; this report does not duplicate its complete audit. Existing local reports record 28 new server and 83 server regression checks plus 6 recovery/5 navigation and 20 synthetic browser cases. Those are reported local evidence, not tests rerun by this reviewer or live acceptance.
- The new compiled HTTP smoke is wired into CI and covers ADMIN upload/create/share, A/B decisions, receipt isolation, private bytes, bootstrap, unchanged approved copy, and per-network cancellation. Its runtime result was pending at this review; synthetic browser and compiled API tests provide complementary evidence but missed the two UI transitions above.
- Editorial package metadata explicitly identifies 3 accepted local texts/portrait images, original snapshot and review hashes, portable projection/omissions, AI origin, fixed loading keys and zero runtime imports. No new factual or visual assessment was performed here. The parent independently reported four evidence files with Git line-ending normalization risk during this review; preserve exact committed blob bytes and rerun the portable integrity check on the corrected commit. This report does not promote the earlier working-tree hash result to Git/CI byte proof.
- Release documentation correctly keeps source/CI/staging/production/provider outcomes separate and preserves matching migration/restore/rollout grants. PROJECT_STATE and verification reports still describe in-progress review and pending CI; update them after the corrected candidate checks, rather than treating the initial candidate as release-ready. The approved contract's original “prepared for agreement” header is historical and explicitly superseded by the design/entrypoint approval record; it is not a new per-subtask gate.

## Required follow-through

The root agent acknowledged all three findings and has started bounded causal RED→GREEN corrections. This report remains the immutable review of `fc26d14`, not a PASS for those future fixes. Review the resulting focused diff and regressions, then bind final CI/Self-host and release records to the corrected source and actual synthetic-merge/artifact identities. No additional internal Owner approval gate is required for these in-scope fixes. Persistent release and provider operations retain their existing separate gates.
