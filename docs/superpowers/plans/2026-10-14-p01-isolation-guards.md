# P01-A Isolation Guards Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans and TDD; an independent read-only Critic reviews the whole branch. Steps use checkbox syntax for tracking. The user approved the spec and immediate implementation; no additional plan approval is introduced.

**Goal:** Prevent inconsistent cross-user relationships from exposing media IDs or reaching storage/provider handoff.

**Architecture:** Keep existing repositories, scheduler claim and connector interfaces. Validate the complete persisted publication graph before claim and after claim, quarantine only still-open rows with a bounded permanent integrity failure, and join media ownership when building a Post DTO.

**Tech Stack:** Next16.3.4, TypeScript5.9.3, Drizzle0.45.2, native PostgreSQL17 and Redis fixtures, Node tests and existing Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-14-p01-multiuser-foundation-design.md`, approved P01-A only.

## Global Constraints

- No auth widening, schema change, Library product change, new dependencies or provider credentials.
- No production DB/provider calls, merge, deploy, secrets or infrastructure changes.
- Preserve terminal receipts, ambiguous delivery, claim races, valid media order and foreign accounts.
- Run DB tests serially against proven disposable loopback services. Keep RED and GREEN evidence.

## Review Focus

- Graph changes between initial read and claim must be detected on the second read.
- A foreign attachment must reject the whole send rather than silently omit media.
- Integrity diagnosis must not overwrite a terminal outcome won by a concurrent processor.
- Corrupt terminal graphs must preserve receipts and PUBLISHING must retain ambiguous diagnosis.
- A user-scoped tick and preview signer must never process/sign another user's row.

### Task 1: Publication graph guard and scoped Post media

**Files:** modify `lib/server/scheduler/processor.ts`, `lib/server/posts.ts`; create `tests/publication-isolation.integration.test.ts`; extend `tests/posts.integration.test.ts` and `tests/media.integration.test.ts`.

**Interfaces:** Preserve `processPublication(publicationId: string, resolveConnector?: ConnectorResolver): Promise<ProcessPublicationResult>` and `listPlannerPosts(userId: string): Promise<PostDto[]>`. Internal graph reader returns the existing joined row plus ordered attachment metadata. No public interface added.

- [ ] Write A/B DB fixtures for mismatched publication/post/account user, target.postId, provider and attached media. Fake connector records dispatch and a fetch trap records storage access; both must remain zero. Assert permanent failure, no retry, no foreign row changes.
- [ ] Add corrupt-terminal/PUBLISHING cases, valid send control, same-id duplicate claim, user-scoped due scan, A/B signing spy and media DTO ordering test. Add a controlled DB-call interleaving to change graph after the first read, before claim.
- [ ] Run new tests against unchanged source; expected isolation failures with a successful valid control. Record root cause and exact RED output.
- [ ] Add private scope check and conditional open-row integrity failure in processor. Check initial graph after terminal branches and check fresh graph after claim before storage/connector. Use permanent failure code `PUBLICATION_SCOPE_MISMATCH`; avoid AUTH/account writes. Claim-loser retains existing skip behavior. Validate media with left join so missing/foreign references cannot disappear.
- [ ] Join mediaAssets and owner filter in `readOwnedPost`, keeping attachment position ordering. Do not alter unrelated post mutation behavior.
- [ ] Run targeted isolation/processor/media/posts/tick/retry/edit/queue tests; expected all pass with unchanged bounds/assertions.
- [ ] Commit test+minimal implementation with RED/GREEN evidence.

### Task 2: Review, integration evidence and Draft PR

**Files:** verification report only; runtime files change only for a proven review finding.

**Interfaces:** Consume Task1's unchanged public interfaces; produce exact tested HEAD and Draft PR.

- [ ] Run full native `pnpm test`, migration drift, typecheck, lint, build and existing desktop/mobile fixture E2E; retain exact failing names if Windows limitations recur.
- [ ] Dispatch fresh read-only Critic over source/diff/tests and Review Focus. Resolve valid findings with RED/GREEN, rerun affected verification.
- [ ] Push this isolated branch; create Draft PR targeting main, attach it to the chat. Inspect actual exact-head CI and Self-host, never report skipped live job as provider PASS.
- [ ] Report CODE/LOCAL/CI/SELF_HOST/PRODUCTION separately and stop at Owner merge gate. Auth PR depends on accepting this slice and remains a separate implementation contract.
