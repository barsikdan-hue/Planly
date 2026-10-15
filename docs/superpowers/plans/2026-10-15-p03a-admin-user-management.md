# P03-A admin user management implementation plan

> Execute the approved user request autonomously, with TDD and an independent read-only Critic. No further product gate is needed within this scope.

**Goal:** Settings → Users lets ADMIN block/restore registered USER colleagues without exposing their private data.
**Architecture:** Reuse verified sessions, existing user lifecycle/version invalidation and PostgreSQL row locks. Extract invitation ADMIN admission unchanged for reuse. Actor ADMIN lock precedes target USER lock; perform lifecycle updates in that same transaction, with no nested transaction. Preserve existing scheduler/handoff behavior.
**Tech stack:** Next.js, React, Drizzle/PostgreSQL, existing scrypt and opaque sessions. No migration/dependency/infrastructure changes.
**Spec:** Approved P03-A request and `docs/superpowers/specs/2026-10-14-p01-multiuser-foundation-design.md`.

## Constraints and review focus

- ADMIN controls only initialized USER accounts; self, any ADMIN and configured owner email are immutable here. Roles/passwords/content never returned or changed.
- List DTO is exactly id/email/displayName/accessState/createdAt. Path id selects the target, never the actor; strict mutation body is `{action:'block'|'restore'}`. Reject forged identity/role/accessState and cross-origin mutations.
- Actor session is rechecked after obtaining its lock; target eligibility is rechecked while locked. Concurrent same-state requests are idempotent; block→restore never revives old sessions.
- Blocking before provider admission prevents handoff; already-started deliveries retain receipts/AMBIGUOUS_DELIVERY and cannot be sent again.
- UI explicitly confirms one colleague/action, shows errors/success, refreshes list in place; expiry redirects safely. Desktop/mobile, no secret-bearing failure artifacts.
- Production DB/secrets/infra, merge/deploy and real provider sends remain Owner gates.

## Task 1: real backend admission and lifecycle

- [x] RED: real ADMIN/A/B sessions against missing `/api/admin/users` GET and `/api/admin/users/[id]` POST. Cover strict DTO, unauthorized/USER/expired/revoked actors, CSRF/forged inputs, self/owner/ADMIN targets, nonexistent IDs, idempotence/concurrent block+restore, old-cookie invalidation and private-resource denial.
- [x] Implement `lib/server/auth/admin.ts` reusable admission; `user-management.ts` list/change services and minimal route error mapping. Share existing access-state update inside the current transaction; invitation behavior remains unchanged.
- [x] GREEN: native management tests plus invitation/auth/schema/worker regressions, including session issuance race and admission/receipt ordering. No skips, retries or altered assertions.

## Task 2: one-screen UI and runtime proof

- [x] RED: compiled HTTP management scenario and desktop/mobile Settings → Users → confirmation → block → restore → old token still denied → new login succeeds; USER SSR/API admission denied.
- [x] Implement `/admin/users`, scoped styles, management component and ADMIN-only Settings entry, preserving existing invitations and Settings render.
- [x] GREEN: real compiled API/browser tests; wire management HTTP into existing native CI and Docker Self-host. Existing providers remain fixtures only.

## Task 3: review and delivery

- [ ] Targeted and full native tests; typecheck/lint/build; compiled HTTP; desktop/mobile E2E. Distinguish local Windows limitations from Linux checks; no speculative unrelated fixes.
- [x] Independent read-only Critic reviews the entire diff and concurrency/visibility boundaries; repair proven findings with RED/GREEN.
- [ ] Commit/push `codex/p03-a-admin-users`; create one Draft PR; verify exact source HEAD CI and Docker Self-host; report evidence and Owner release gate. Never merge/deploy.
