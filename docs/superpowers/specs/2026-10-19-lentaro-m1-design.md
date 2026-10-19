# Lentaro M1 approved execution design — 19.10.2026

Owner approved contract v2 and A–F autonomous development, task branches/commit/push/Draft PR in this chat. Contract source: LENTARO_WORKING_VERSION_CONTRACT_v2_2026-10-19.md (copy alongside this spec). No additional subtask/design approval is needed. Runtime release, persistent data/infra/secrets/DNS and provider calls remain exact gates. Immutable audit lives outside this checkout.

Goal: invite-only pilot, coherent ready editorial feed → networks/time → per-card swipe → personal calendar → independent outcome. Existing manual editor, Library, B1, provider/scheduler architecture retained. Billing/public signup/VK/Instagram not M1.

## Baseline / reuse
- Main da7ad737a3236f1c161ae46c519386e05869f47a; PR68 source6cf369bff8b284f8b3c166ce2dfa531e9f449ea0 remains separate/unmerged.
- M1 branch codex/lentaro-m1 starts at6cf; no edits in old worktrees. PR68 independent whole-source review A has no actionable P0/P1/P2.
- Staging last actual83a, ledger13rows. Render2f13 and autoDeploy off are dated audit facts. No rollout from this design.
- Native App worktree creation failed because outer unborn checkout lacked source object. Manual linked worktree from verified p04 common Git database is isolated fallback.
- Existing exact-tree CI baseline reused; no baseline full-suite rerun. New focused tests RED→GREEN; candidate full CI/Self-host/browser required.

## B durable direct shared decision
Add one additive shared_feed_decisions table. Preserve original copy API/DTO behavior and B1 contracts. User-scoped immutable receipt: userId+operationId, inputHash, opaque shareId, sourceRevision, decision LIKE/DISLIKE, personalItemId/postId/scheduledAt nullable, createdAt. Unique user+share+revision prevents accidental separate-tab duplicate decisions; explicit repeat mode is outside M1. Retain receipt without source/result cascading FKs so deletions remain terminal410.

API:
- GET /api/shared-feed returns {items: SharedLibraryItemDto[]} filtered by this actor's already decided share/revision; current shared catalog remains unchanged.
- POST /api/shared-feed/decisions body {operationId,shareId,sourceRevision,decision:'LIKE'|'DISLIKE',approval?:{providers:('telegram'|'max')[],scheduledAt:string,inputMethod:'button'|'gesture'|'keyboard'}}. Strict parse; LIKE requires approval, DISLIKE forbids it.
- GET /api/shared-feed/decisions/[operationId] returns {receipt: SharedFeedDecisionReceipt,replayed:boolean}; same shape for POST. Receipt has operationId/shareId/sourceRevision/decision/personalItemId/postId/scheduledAt.
- Historical operation lookup before current source checks; same operation+different input409; foreign/missing opaque source404; stale source409; deleted mapped result410, no recreation. Unknown COMMIT remains uncertain and same-key recoverable. Current actor/session/access checks never bypassed by replay.
- LIKE atomically copies an independent personal item/media AND creates existing Post/relations/publications + personal swipe receipt + shared provenance receipt, marks own item USED; queue mirrored only after COMMIT. Reuse existing copy storage limit/cancellation/cleanup/unknown-commit protection with narrow internal hook in shared-library.ts and existing validatePostRelations/insertPostRelations/reconcile/captureSwipeSource/recordSwipeDecision. Do not orchestrate two independent public POSTs or start a new engine.
- Require exact displayed revision under source lock, selected owned enabled connected TG/MAX accounts, free identical minute≥now+60s, strict existing content validation and binding capture. Revalidate current session after waits/storage and before commit. Configured OWNER/ADMIN may use existing individual approval authorization, never remove B1 USER-only guard or grant another USER's rights.
- DISLIKE stores a private decision only, no shared mutation, no copy/Post/job. Skip is ephemeral client-only.
- Existing public copy behavior must remain byte/ID/idempotency equivalent. Storage rollback cleanup must not delete committed media after lost COMMIT ack.

## C user journey
Reuse SwipePlanner with optional presentation/provider props (legacy defaults unchanged). New SharedFeed uses opaque source IDs/revisions and signed previews, no mandatory copy UI. Owner-scoped versioned browser journal persists exact request before POST; uncertain outcome never rekeys; manual same-operation recovery via own result GET/retry. No success/card exit before server acknowledgement. Owner switch abort/fence; corrupt or conflicting journal fails closed. Terminal410 retains history while independent new item may proceed safely.
Add visible Ready content entry/navigation and first-run steps; retain dashboard/manual editor/Library. Product name Lentaro on login/layout/navigation only, no storage/cookie/env rename. Full text, reduced motion, keyboard/mobile320/390. State labels Ready content, Calendar, Published/independent errors without inventing delivery.

## D / E / F
Prepare3 real editorial materials with actual images, current sources and QA sidecar via existing external skill; fixture content labelled synthetic and separated. Inspect existing media/Library API and demonstrate fixture ADMIN upload→share in isolated compiled runtime; no new batch importer unless a proven need.
Final candidate: native/security/race tests, typecheck/lint/canonical build, compiled HTTP and browser/self-host CI. Independent focused server review and final M1 review. Preserve historical teardown root-cause UNKNOWN.
Prepare exact source/migration rollout/rollback and safe account handoff package. Find A1 result without replaying maintenance; persistent staging release stays blocked where restore/grant missing. Continue source/content regardless. F is released only under explicit matching release/provider grants; otherwise deliver reviewable package with exact remaining operations, not falsely a live M1 link.

