# Lentaro M1 B — independent focused server review

Date: 2026-10-19. Verdict: **PASS — no actionable P0/P1/P2 findings in the reviewed source diff.**

## Authority and scope

- Reviewed immutable commit `1c0d7df730e59891cf402b19e570a6b6317dde11` against `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0` in `work/Planly-lentaro-m1`.
- Branch observed: `codex/lentaro-m1`; worktree HEAD during review: `f57d20f0654bdb754cb4e172d1a7e04c328a5171`. The parent-owned UI/docs WIP was expected, preserved and excluded. The reviewed server paths were clean, and `git diff 1c0d7df f57d20f -- lib/server lib/contracts db drizzle` was empty.
- Read current AGENTS/PROJECT_STATE, approved `docs/superpowers/specs/2026-10-19-lentaro-m1-design.md`, owner contract v2 and `docs/verification/2026-10-19-lentaro-m1-server.md`.
- All twelve changed files reviewed: shared-feed contract/service/routes, shared-library primitive extraction, schema, migration/journal/snapshot, and the two new test files. Existing auth/session, Post persistence/relations, library deletion, swipe receipts, publication authorization and queue reconciliation were traced where reached by the changed path.
- No product edits, commits, fixture/database mutations, provider requests, runtime changes or GitHub writes. Only this report was written outside the checkout.

## Causal paths checked

| Boundary | Source evidence and result |
|---|---|
| Authentication and isolation | `shared-library.ts:26–48` resolves the request principal, locks its user, checks ACTIVE/authInitialized/sessionVersion/token/expiry, and rechecks the session with a SHARE lock through commit. `shared-feed.ts:25–35,49–56` scopes receipts and mapped private results by the actor. ADMIN has no foreign-result lookup exception. HTTP mutation uses existing session, CSRF and identity-payload rejection. |
| Session invalidation after waits | Fresh decision rechecks after source wait (`shared-feed.ts:72–74`) and after copy, relation creation and replay locks (`97–101`). Historical POST and result GET recheck after result locking (`49–56,68–69`). Existing logout deletes the session, so the final locked read observes deletion or orders commit before logout. |
| Immutable replay and deduplication | Strict normalized intent is hashed (`shared-feed.ts:60–62`). Historical operation lookup/hash check precedes source lookup (`29–35,68–73`); deleted personal results return terminal 410. The actor lock serializes same-user requests; the database primary key and unique user/share/revision index backstop operation identity and first decision. Source/result IDs have no cascading foreign keys that would erase terminal history. |
| Fresh revision and independent bytes | Source is locked and share membership re-read (`shared-library.ts:73–79`); displayed revision is checked under that lock. Copy creates new private item/media identities with owner-scoped paths, preserves source ordering/checksums, applies existing count/size limits and a cancellable aggregate storage deadline (`83–109`). DISLIKE creates only private provenance. |
| Scheduling and account binding | `shared-feed.ts:78–95` locks selected own accounts, checks availability/free minute and lead time, validates existing publication content, creates normal Post/relations/publications, captures existing binding revision and records personal feedback in the same transaction. Existing `capturePublicationBinding` and scheduler authorization remain authoritative; no bypass or second sender was added. |
| Cancellation and handoff | Results use normal `sourceLibraryItemId`, PostTarget and publication relations. Existing Post mutation/reconciliation retains cancellation, unsafe-terminal-history and binding rules. Queue mirroring occurs only after known durable success (`shared-feed.ts:132`); failures leave existing reconciliation able to recover SCHEDULED/QUEUED rows. |
| COMMIT uncertainty and compensation | Prepared flag is set only after final validation (`97–102`). Failure reacquires the actor lock and reads the receipt; unreadable outcome preserves objects and returns explicit uncertainty (`104–123`). A confirmed absent receipt permits cleanup; known committed or terminal deleted results preserve committed bytes. Attempted destinations are registered before PUT, and rollback DELETE calls have separate deadlines (`shared-library.ts:97–102`, `shared-feed.ts:125–129`). |
| Original public-copy behavior | Extraction preserves original requested source order, aggregate admission before IO, independent private identifiers, byte/checksum checks, DTOs, receipt namespace and existing public-copy COMMIT recovery. No public-copy authorization or response shape was changed. |
| Migration | Additive `shared_feed_decisions` only, user FK, user/operation primary key, user/share/revision unique index and LIKE/DISLIKE result-shape constraint. Independent semantic snapshot comparison: previous ID matches; zero existing tables changed; only `public.shared_feed_decisions` added. Journal appends index 16. |

## Verification evidence and limits

Reviewed the actual assertions in the two new test files, including concurrency, source-lock races, session invalidation/expiry, cross-user and ADMIN non-owner lookup, independent USER results/bindings, storage failure/compensation, lost COMMIT acknowledgement, unreadable outcome, known precommit rollback, and queue failure.

The server implementation report records **28 new focused tests PASS** and **83 existing focused regression tests PASS**, plus typecheck, focused lint and migration drift checks. Those are implementer-provided local execution results inspected by this reviewer; this review did not rerun them or represent them as independently executed. No extra fixture run was necessary to substantiate a finding, and the full suite was not repeated.

Fresh reviewer checks: immutable diff inspection; scoped working-tree drift check; `git diff --check 6cf369b 1c0d7df` PASS; semantic migration snapshot comparison PASS.

This is a focused server source-review PASS. Integrated M1 UI/recovery/browser behavior, final exact-head CI/build, deployment, persistent migration and real provider delivery are outside this verdict and retain their separate evidence boundaries.
