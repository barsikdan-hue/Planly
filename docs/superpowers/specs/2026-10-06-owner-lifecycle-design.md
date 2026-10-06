# CR11 Owner Lifecycle — proposed architecture

Status: APPROVE_OPTION_A_WITH_GUARDS — completed direct Orchestrator review of diagnostic HEAD `075f72896c75fa404293fbdb9d4b07d0b0431a0e`. Completed PLAN_REVIEW at `31c5a8af01eb556e82cd0f78e40042b9c6e9db1b`: IMPLEMENTATION_APPROVED, Native / executing-plans selected; App-only runtime authorized. Owner approval remains required for merge/deploy.

## Intent and contract

The same mounted Planly App can receive an authenticated snapshot whose profile changes from A to B. B must see only B's server data, editor recovery and pending work. A's durable work remains stored under A for a later return. Old A callbacks and physical operations may complete but cannot change B data, editor/cache/pending state or messages. No automatic replay, A+B merge, migration or deletion of A recovery.

This follows the completed Orchestrator CR11 split decision. PR17 remains frozen; PR18 remains DRAFT and will need a fresh owner-poll compatibility GREEN after CR11 integration. See the diagnostic report for actual traces, all owner-state inventory and proven versus unproven cases.

## Options

**A — explicit App owner context and transition (recommended).** Keep the existing App and PR17 Library interface. Introduce one canonical authenticated owner plus a generation/lifetime identity. All admitted owner-scoped effects capture that identity and reject after an owner transition or unmount. A single transition path invalidates A before installing B data, clears old active editor/pending/confirmed intent, rotates Composer identity, binds existing Library recovery and hydrates B Composer recovery/pending through the existing owner-keyed storage helpers. Advantage: localized change and existing revision/saveLock behavior survives. Cost: audited effect/callback guards are explicit, so new admitted paths need a corresponding regression.

**B — owner-keyed App subtree with lifted snapshot observer.** Move authenticated snapshot ownership/polling outside the owner UI and remount the entire subtree on profile change. Child local UI state naturally resets. This changes component boundaries and still requires guards for late physical operations and durable writes. Its larger interface change is not justified by the currently proven App failures; child-local consequences are still NOT PROVEN.

**C — reload on owner change.** A full navigation reboots owner recovery. It discards active UI and requires reliable persistence despite storage errors and pending operations. It introduces navigation behavior and still needs late-ack policy. It is a mitigation rather than the preferred controlled lifecycle; do not implement without a separate product decision.

## Proposed option A boundaries

Canonical context belongs in App, where bootstrap and scheduled poll already receive the authoritative profile. Retain separate Library editor tokens and revisions; owner generation and editor token answer different questions. At A→B: invalidate old owner lifetime synchronously before applying B snapshot; clear old Composer active refs, pending UI and proved delete confirmation; establish B owner; apply B authoritative server data; hydrate only B recovery/pending through the existing bootstrap algorithm; bind existing Library lifecycle and expose fresh rendered context/Composer identity. These synchronous updates belong to one transition. B pending prevents new creation and never causes an automatic network replay. A's storage remains untouched during this transition. A return creates a new generation, then rehydrates A's existing durable work. A callback from the first A lifetime stays stale forever, even if a pending cache restores an earlier editor token.

Same-owner polls keep current raw editor, token, revision and in-flight operation behavior. They must retain PR17 media/Library revision protections. Cache parsing, missing-media filtering and warning semantics reuse existing helpers. Recovery/pending precedence is exactly current bootstrap: valid B recovery first; pending editor fills only when recovery absent and existing origin/token conditions hold; acknowledged ID follows existing token rules; no automatic retry. Storage unavailable/corrupt must never fall back to A data and must retain current safe blocking/warning behavior for B; safety of the owner boundary takes priority over carrying non-durable A raw work into B.

Captured Composer mutation/save/publish/retry interfaces must refuse old owner lifetimes before dispatch or durable writes. Do not make identity checks inside React state updater functions with storage side effects. Accepted default uploads and profile saves capture the admitted context; check it before any subsequent file dispatch, after every awaited response and before data/message application. A file already sent may complete server-side; no claim of physical cancellation. Library's existing optional token/generation guards remain additional constraints.

Only proven paths are admitted initially: Composer raw/recovery/pending owner transition, captured change/submit rejection, generic upload continuation, profile continuation and old media confirmation. Pending helpers are not changed merely because they capture owner A: existing captured A-key writes are correct. Save/Publish/Swipe saveLock must remain intact. Unproven child local state, account/connect/delete/reschedule/card continuations and observer paths without scheduled posts require separate RED/root-cause evidence before scope grows. Do not key/remount every child incidentally under option A.

## Acceptance and exclusions

All 17 committed diagnostic cases must become GREEN without weakening their independent owner-policy assertions. Add focused cases for B storage failure/corruption, B pending priority over recovery, repeated A→B→A lifetimes (old A callback must not regain validity), upload failure messages and stale retry/publish callbacks before claiming these guards. Preserve the 128-case protected baseline, existing Library tests and required typecheck/lint/build. Native PostgreSQL/Redis CI must be recorded with actual zero-skip counts when the approved branch integration path can trigger it.

After CR11 approval/integration, rerun PR18's three independent owner-poll assertions for global media, A recovery and old messages plus the frozen compatibility matrix. Ordinary same-owner upload/recovery tests passing cannot waive owner-transition failures.

No auth/server/schema changes, new owner-switch UI, account/network expansion, scheduler/infrastructure work, AI, automatic publishing, provider messages or unrelated refactor. Server cross-owner authorization and live production behavior are not established by these fixtures. Merge/deploy remain Owner gates.

## Decision requested

Option A and proved-only scope are approved. Next gate is PLAN_REVIEW / CR11 OWNER_LIFECYCLE. Runtime starts only after written plan review and execution selection. Orchestrator accepts exact-HEAD empty workflow runs as NOT_TRIGGERED at this diagnostic stage and forbids workflow changes for the stacked PR. Before READY: Owner-approved PR17 merge → PR19 rebase onto fresh main → exact-HEAD native CI + Docker → PR18 fresh integration recheck. No copied PR17 diff or premature retarget merely to trigger CI.
