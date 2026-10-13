# Swipe Planner 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task. Steps use checkbox tracking; every stage ends with read-only Critic and fresh verification.

**Goal:** Finish owner-approved Dashboard review, safe slot creation and exactly-once preferences/export as three dependent draft PRs.

**Architecture:** Reuse current Library/Post transactions, owner lifetime and durable pending envelopes. Add native pointer motion; a scoped Swipe creation marker; owner-scoped feedback/receipt tables with transactional hooks in create/archive. Preserve ordinary Composer and Scheduler semantics.

**Tech Stack:** Existing React19/Next16, TypeScript, CSS/Pointer Events, Zod, Drizzle/PostgreSQL, Node test and Playwright; no new animation dependency or service.

**Spec:** ../specs/2026-10-12-swipe-planner-2-design.md (exact PR42 commit950abc1d copy). Owner approval and implementation authorization: https://github.com/barsikdan-hue/Planly/pull/42#issuecomment-6139059591. Review amendments: https://github.com/barsikdan-hue/Planly/pull/42#issuecomment-6139044486. Owner explicitly requests autonomous plan→implementation; no additional plan approval gate within scope.

## Global Constraints

- main baseline30374c8dbc6d137da2d393d42bdee5389f34564e; separate branches codex/swipe-planner-2-ui → codex/swipe-planner-2-slots → codex/swipe-planner-2-preferences, stacked bases declared in PRs.
- Desktop1366×768/mobile390×844; reduced motion; full text/photo/video preserved.
- READY without sourcePostId only; skip0 mutation/weight; no generated production content.
- Explicit networks; next-slot default after setup; manual occupied minute prohibited; no silent reschedule on409.
- Future Swipe slot >= fresh server now+60000ms after lock waits; no inline Scheduler tick from Swipe route.
- owner/source/selected-account deterministic locks; confirmed replay before new-intent checks; immutable UUID/hash; no blind retry.
- One latest vote per owner/source, explicit replacement, retained metadata/history after content deletion; no text/title/URLs/credentials in receipts/export, no inferred themes.
- Typed410 terminal recovery resolves only captured owner+UUID, no new creation/count.
- Production writes/migrations/deploy/merge/secrets/infra/provider sends/paid resources prohibited. Preserve unresolved cleanup as separate task.

## Review Focus

1. OwnerA→B late response cannot clear B pending, apply A cards or release B busy; tests Task1/3.
2. Vertical touch scroll/selection/media controls never commit a horizontal decision; native browser-emulated touch in Task1 E2E.
3. Lock waits move clock or disconnect accounts: reject new intent after locks; successful replay bypasses those checks; Task2/3 DB tests.
4. Lost committed response followed by result deletion returns terminal410 and cannot resurrect or duplicate; LIKE result is its Post, DISLIKE result is its Library item. Source-only LIKE deletion with a surviving Post replays that owned Post without a new vote; Task3 integration/recovery tests.
5. Opposite concurrent votes and restored source replacement change one latest aggregate; private export retains deletion flags without leaking other owner content; Task3.

## Task 1 — Dashboard entry, native motion and owner safety

**Files:** components/planner/dashboard.tsx, app.tsx, swipe-planner.tsx; app/globals.css; new lib/client/swipe-motion.ts (pure state helpers) and/or components/planner/use-swipe-motion.ts; tests/swipe-planner-ui.test.mjs, swipe-planner-app.test.mjs, new tests/swipe-motion.test.ts, tests/e2e/swipe-review.spec.ts and new swipe-motion.spec.ts with synthetic fixture helper. ROADMAP/documentation. Controller owns CI branch-filter changes and this plan/spec; implementer owns runtime/test edits.

**Interfaces:** Dashboard receives ready count/startReview/startLibraryEditor callbacks. Review has origin dashboard|content and onAddItem. Shared ReviewInputMethod='gesture'|'button'|'keyboard' may be added to current SwipeApproval as optional metadata, ignored by legacy transport until Task2. decide(action,inputMethod) uses one lock. Pure gesture classifier accepts dx/dy/cancel and outputs pending/horizontal/vertical/decision; component owns lifecycle/capture and response-confirmed exit. All parent mutation callbacks capture existing OwnerContext and check isOwnerCurrent after awaits including finally; acknowledgeQueue receives captured context explicitly.

- [ ] RED: Dashboard click opens Review in Dashboard; return restores origin; empty Add opens Library editor with0 writes. Native gesture test asserts 79px no dispatch,80px horizontal one action,12px vertical cancels, rotation bounded8deg; error retains source, pending blocks duplicate. OwnerA delayed approve/reject/ack/finally after B must leave B state/storage unchanged.
- [ ] Run focused Node and desktop/mobile Playwright tests; save failure showing missing requested behavior rather than setup error.
- [ ] Implement minimal UI/hook/CSS, touch-action pan-y pinch-zoom, 220ms spring-back/180ms confirmed exit/160ms next, reduced-motion0; cancel/lost capture/interactive selection safe. Buttons «Не нравится», «Позже», positive label matches actual intermediate mode (DRAFT is «В черновики», scheduled is «В календарь»). Show success only on response; clear «Не нравится · в архиве» result. Keep current draft/manual/next business modes in this intermediate PR.
- [ ] GREEN focused; E2E long tail/horizontal bounds/touch scroll/native gesture/keyboard/reduced-motion/photo-video controls/delayed success/API failure/duplicate/owner switch. Extend ONLY synthetic loopback responses as needed; deny non-loopback/provider calls and unexpected writes.
- [ ] Full pnpm test, typecheck, lint, build, test:e2e; record counts and warnings, no skips or weakened assertions. Read-only Critic, fix proven important regressions using RED→GREEN, commit and push draft PR against main.

## Task 2 — Explicit setup and scoped safe slot flow

**Files:** swipe-planner.tsx (or focused setup component), lib/client/swipe-planner.ts, lib/client/pending-creation.ts, lib/post-creation.ts, lib/contracts/planner.ts/swipe-planner.ts; app/api/posts/route.ts; lib/server/posts.ts/planner-slots.ts. Existing and new tests/swipe-slot-flow.test.ts, swipe-planner-recovery.test.ts, planner-slots.integration.test.ts, API route harness tests, E2E. No provider/Scheduler redesign.

**Interfaces:** Extend createPostSourceSchema and canonicalCreationInput with optional swipeReview:{inputMethod}. Marker requires sourceLibraryItemId/revision, requireFreeSlot=true, READY and nonnull future independent targets; it travels unchanged through pending input/hash and POST options. Legacy callers with no marker keep behavior. buildSwipeApproval rejects draft for new Swipe flow, requests same scheduled time for chosen providers, requireFreeSlot for manual and next. Existing slot preview receives an optional scoped Swipe cutoff or dedicated client/server preview mode with now+60000ms without changing ordinary preview semantics. New creation returns known same-key result before live validations. Selected account rows locked FOR UPDATE sorted by ID under owner/source lock. POST route never invokes runDuePublications when marker set, including replay.

- [ ] RED: setup requires explicit networks and valid schedule, Next default, card has future Moscow time; disconnected/no-slot/right gesture does0 writes. Manual occupied minute returns409. New marked slot now+59000 rejected, now+60000 accepted under fixed clock; lock wait advances cutoff and rejects. Route test proves no scheduler call for marked future/replay while ordinary immediate Composer still calls it.
- [ ] Run focused tests to expected failure. Add isolated PostgreSQL race test: disable account while approval waits, then ensure no commit; sorted locks and two same slot contenders create at most one Post.
- [ ] Implement marker validations, canonical hash/pending preservation, post-lock clock/account checks and scoped no-inline route. Config→review and Change schedule; stale/error leaves card and original pending; retry uses original slot/UUID rather than latest preview. Clear pending only known precommit typed rejection.
- [ ] GREEN recovery lost response/reload/no new key; callback result «В календаре · дата/время МСК»; manual conflict does not assign a different time. Full regression/typecheck/lint/build/E2E and read-only Critic. Commit/push stacked draft PR against UI branch; map actual CI source-head and synthetic merge SHA.

## Task 3 — Transactional feedback, private summary/export and durable DISLIKE

**Files:** db/schema.ts plus generated additive migration/meta; new lib/contracts/swipe-feedback.ts, lib/server/swipe-feedback.ts (or focused receipt/summary files), lib/client/swipe-feedback.ts; createPost and archiveLibraryItem transaction integration, archive PATCH route/http typed errors, new GET app/api/swipe-feedback/route.ts and export/route.ts; planner-api/client pending/owner recovery, focused preferences summary UI accessible from Review. tests/swipe-feedback.test.ts, swipe-feedback.integration.test.ts, swipe-feedback-recovery.test.ts, swipe-feedback-api.test.ts, E2E. Update ROADMAP/verification docs only with actual states.

**Interfaces:** SwipeReceipt lookup(ownerId,UUID,canonical hash) precedes source/live validation in the existing transaction. Receipt contains operation/source/fingerprint/confirmedAt/decision/inputMethod/provider/schedule/result-ID metadata, no raw text/title/URLs. current feedback primary(owner,source) replaced only by a new successful explicit decision. LIKE hooks into same create transaction after existing replay/source-used checks; DISLIKE same archive transaction, UUID/method supplied through PATCH body/header only for new review transport. Normal Library archive unchanged. sourceAlreadyConverted is typed409, never fabricated LIKE/backfill. Result lookup absent returns typed DECISION_RESULT_DELETED410 from retained receipt without mutation. Export/summary use consistent read-only transaction, authenticated owner only, no-store and versioned JSON; manual download guard after every await.

- [ ] RED: LIKE commit produces one Post/one current vote/one receipt; intentional feedback insert failure rolls back Post/USED; DISLIKE feedback failure rolls back archive; concurrent opposite decisions one success; replay same UUID after time/disconnect is same result; changed payload409; legacy conversion yields no vote; same source restored DISLIKE→LIKE replaces aggregate (likes1/dislikes0/total1).
- [ ] RED deletion/recovery: delete the LIKE Post or DISLIKE Library result in isolated DB then original UUID yields typed410 with0 recreated objects/votes; delete only a LIKE source while its Post survives, replay returns that Post with sourceDeleted=true/resultDeleted=false and unchanged votes; reload pending410 clears only captured owner/key with no count; unknown5xx persists. OwnerB summary/export sees0 A rows; stale A download does not happen. total0 yields ratio null, no topic labels. Metadata survives deleted source/result with explicit flags.
- [ ] Implement additive schema and durable transaction helpers; metadata fingerprint describes acknowledged snapshot, not later source edits. No unsafe FK cascade to result/source; users FK cascade only. Source metadata deletion flags derived by consistent joined read. GET export rejects owner-selector parameters; no automatic third-party transfer; no production export files in repository.
- [ ] GREEN disposable DB integrations serially with TEST-only URL/provider resolver, client recovery and desktop/mobile E2E. Generate migration and validate drift; no production migrate. Full suite/typecheck/lint/build/E2E and independent concurrency/privacy Critic. Commit/push stacked draft PR against slot branch.

## Execution ledger and CI

Store RED/GREEN command outputs, review findings, rulings and stage base/head SHA in git-ignored .superpowers/sdd/swipe-planner-2/; concise public evidence in docs/verification. No tokens, private production content or actual exports.

Existing CI/Self-host pull_request filters cover main only. A minimal filter extension for codex/swipe-planner-2-* in those TWO existing workflows (controller-owned Task1) allows genuine CI on stacked PRs, with identical free jobs/env and no new workflow/service. Do not dispatch live workflows, add trigger labels, alter scheduler-tick, activate CI Doctor or merge branches. Actual GitHub results—not local tests—prove each PR checks. For blocked runner/DB resources record exact failure and continue permitted diagnostics, not assume PASS.

Self-review: Task1→2 shares inputMethod and Review callbacks; optional metadata ensures intermediate compatibility. Task2→3 shares marker/canonical hash/create tx; same immutable intent required. Task1→3 shares captured owner guards. Every task has actual observable RED assertions and full gate, staged limitations disclosed. All approved design/review requirements mapped; no new product/privacy reset decision.

Final OWNER GATE after all three draft PRs: merging any PR (including42), production deploy/migration and real provider sends remain unapproved. Report IMPLEMENTED/TESTED/CI/CRITIC/PR/BLOCKERS/OWNER_GATE separately, with stacked dependencies and no production acceptance claim.
