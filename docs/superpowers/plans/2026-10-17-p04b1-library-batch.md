# P04-B1 Library Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One explicit finite USER consent atomically creates owned scheduled Posts from selected personal Library copies, with durable safe recovery.

**Architecture:** New preview/commit/result contract plus immutable batch receipt; retain existing publications/reconciliation/Worker. Reuse only target/media insert blocks of createPost, preserve its old public behavior. Current-session locks and fresh-only snapshot validation are separate from historical replay.

**Tech Stack:** Existing Next16/React19, Zod, Drizzle, PostgreSQL17, Redis7/BullMQ, Node>=22.13, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-17-p04b1-library-batch-design-v2.md`, approved SHA256 `84b9196f663484dcfba90b655279a5453bb46b500c0158329f66d79e3bddb1de`.

## Global Constraints

- Source baseline da7ad737a3236f1c161ae46c519386e05869f47a. Fresh admission role USER and not configured OWNER; historical own receipt may replay after role/session change.
- 1–20 own READY copies, common own TG/MAX set, <=40 targets; existing finite Moscow slot rules, future times only. No publish-now or future enrollment.
- One transaction, immutable canonical intent/requestHash, separate snapshotFingerprint, purpose-separated existing-key preview MAC TTL10min, one receipt.
- Owner→current session→sources ASC→media ASC→accounts ASC; expiry after waits; replay before fresh eligibility. No external IO under DB locks.
- Helper inserts only PostTarget/postMedia after successful parent insert. No Scheduler/Worker/retry/Phase9 rewrite.
- Cancellation whole Post before any claim only; AUTH/ambiguous history retained, no blind resend.
- Disposable local fixtures and mocked provider IO only. No merge/deploy/live migrations/secrets/env/infra/DNS or real provider calls.

## Review Focus

1. Old proof expiry/new session/USED after accepted intent must not prevent historical recovery (Task2).
2. Response loss and partial Redis mirror must never rekey or recreate publications (Tasks2/3/4).
3. Revocation or expiry while waiting for a lock must deny admission/replay (Task2).
4. Foreign ID through relation/media/receipt and ADMIN-as-nonowner must fail closed (Tasks2/4).
5. A claim winning cancellation, or another target already published, must never be represented as cancel success (Tasks2/3).

## Routing and execution

GitHub: current refs/CI and final Draft PR. Shell: isolated checkout, synthetic disposable PG/Redis, tests/build. Playwright: local synthetic fixture browser only. Independent agents: bounded implementation file ownership and read-only reviews, permitted by AGENTS. Existing runtime/Render/provider state is outside this implementation. Missing native proof is a blocker, not a mock PASS. Owner explicitly authorized autonomous plan execution, so no extra plan approval pause.

### Task 1: Contracts, hashing/proof and durable schema

**Files:** Create `lib/contracts/library-batch.ts`, `lib/library-batch.ts`, `lib/server/library-batch-hash.ts`, `lib/server/library-batch-proof.ts`, `tests/library-batch.test.ts`; modify `db/schema.ts`, generated next `drizzle/0015_*` and metadata.

**Interfaces:** strict preview `{sourceIds,accountIds,settings}`; intent C/commit/receipt exactly from spec. Export LibraryBatchIntent/PreviewInput/CommitInput/Receipt/CommitResult/Preview. Preview has complete flag, own items/accounts/media DTOs and complete descriptor `{intent,requestHash,snapshotFingerprint,previewProof}` (null only when incomplete). Export canonicalLibraryBatchIntent, libraryBatchRequestHash, libraryBatchContentHash, libraryBatchSnapshotHash and sign/verifyLibraryBatchPreview. Export libraryBatchConsentOperations table, receipt retained without cascading result FKs.

- [ ] RED: strict bounds/duplicate/precision/identity rejection; same frozen intent canonicalizes; changed version/destination/time changes request hash; session/state are absent from immutable intent; proof owner/hash/snapshot/TTL/tamper rejection.
- [ ] Run `node --test --experimental-strip-types tests/library-batch.test.ts`, capture behavior RED before implementation.
- [ ] Implement minimal strict contracts/canonicalization/server hashes/proof and table; generate migration using drizzle-kit, not hand-edit snapshot.
- [ ] GREEN pure tests; apply only to new disposable planly_test; verify migration generation drift clean. Commit owned files after review.

### Task 2: Atomic admission and native recovery/race proof

**Files:** Create `lib/server/library-batch.ts` plus focused session/snapshot modules if needed, `lib/server/post-relations-insert.ts`, `tests/library-batch.integration.test.ts`, `tests/helpers/library-batch-db.ts`; modify only insertion blocks in `lib/server/posts.ts`.

**Interfaces:** `previewLibraryBatch(rawToken, input, options?)`, `commitLibraryBatch(rawToken,input,options?)`, `readLibraryBatchOperation(rawToken,operationId,options?)`. Options use injected fresh clock/storage signer/mirror only; no production-only test synchronization hooks. Export typed LibraryBatchError with safe code/status. Use Task1 schemas/table; return contract Preview/CommitResult. No DB suites concurrently sharing fixture DB.

- [ ] RED native assertions: preview creates zero Post/publication; two sources/two targets produce 2 Posts/4 targets/4 publications/one receipt; invalid second source rolls all back; USER A/B/ADMIN/OWNER deny; opposite-order input/concurrent same and conflicting keys; fresh stale source/account/slot rejects without reallocating.
- [ ] RED recovery: real COMMIT then mirror throws, replay same IDs after USED/new session/binding change/proof expiry, deleted result410; original C kept. DB→Redis repeated/concurrent reconcile yields one live job per eligible publication, no extra DB rows.
- [ ] RED deterministic barriers on separate PG clients: logout/revoke/expiry during owner/source lock waits for commit/replay; lifecycle/media/source races; cancellation vs claim both orders; partial publication cancellation refused. Mock connectors only.
- [ ] Implement owner/session lock/revalidation, signed snapshot preview, historical replay first, one outer admission tx, existing publication reconciliation and postcommit mirror. Extract only relation inserts; preserve old createPost semantics.
- [ ] GREEN Task2 suite and related Post/Swipe/Phase9/auth/publication regressions. Independent task review and bounded fixes. Commit owned files.

### Task 3: Minimal USER Library consent UI and persistent recovery

**Files:** Create `components/planner/library-batch.tsx`, `lib/library-batch-recovery.ts` and corresponding tests/e2e; modify `components/planner/app.tsx` and bounded Library/CSS wiring. Inspect existing library tab and Phase9 patterns first.

**Interfaces:** dialog accepts own Library/accounts/media and owner identity, invokes new endpoint family, reports saved result and triggers existing refresh. Existing single-post/Swipe/shared copy UI unchanged. Existing safe Post cancellation remains sole path.

- [ ] RED behavior: finite owned selection/common TG/MAX, preview count/content/time, one button commits, no preconsent write, incomplete/stale disable; double click/lost response/reload preserve exact owner-scoped intent/key, never rekey uncertain404; logout discards stale callbacks; role USER-only.
- [ ] Implement strict complete descriptor handling, owner-scoped recovery, keyboard/mobile accessible bounded dialog; no editable text overrides, publish-now or partial-target cancellation claims.
- [ ] GREEN UI/recovery tests; browser E2E desktop/390/320 with no horizontal overflow, keyboard and reload/network ambiguity. Independent task review; commit owned files.

### Task 4: HTTP integration and exact-head delivery

**Files:** Create new `app/api/library/batch-consent/{preview,commit}/route.ts`, `operations/[operationId]/route.ts`, focused HTTP wrapper/test/smoke; modify CI/self-host fixture smoke only if needed for actual boundary proof; add verification report.

**Interfaces:** HTTP routes call Task2 service with current raw session cookie; same-origin mutation and identity selector safeguards; private/no-store responses; safe typed401/403/404/409/410/422/uncertain503. No error logging of DB/raw payload/proofs.

- [ ] RED real handler/compiled HTTP tests for no login/foreign ownership/media bytes denial, fresh role guards, all-or-nothing consent/replay and safe uncertainty projection.
- [ ] Implement narrow routes/wrapper and compiled fixture probe. GREEN targeted tests, full suite, typecheck/lint/build, disposable migration drift and real PG/Redis/Worker recovery checks.
- [ ] Run full browser E2E and desktop/390/320 evidence. Record Windows-only baseline limitations without weakening existing checks; authoritative exact Linux CI required.
- [ ] Independent whole-branch read-only Critic, fix proven in-scope findings RED→GREEN and reverify. Preserve RED/GREEN/critic evidence in sanitized report.
- [ ] Push task branch; create one Draft PR, attach it, observe exact HEAD GitHub CI/Self-host through final completion. Workflow currently triggers on PR, so Draft creation may be necessary before checks start. No runtime release/provider work.
- [ ] STOP at READY_FOR_OWNER_MERGE_GATE only after required checks pass; otherwise honest Draft BLOCKED with precise evidence and safe continuation.
