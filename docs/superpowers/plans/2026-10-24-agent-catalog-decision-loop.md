# Agent catalog decision loop

## Contract

The agent reviews the server-owned library, archives a card with a left swipe,
can restore an archived card manually, and can schedule the same library item
more than once. A right swipe uses the first free Moscow-time slot at 10:00
when the default queue is used. Cancellation of an approval remains in the
existing post-target flow and must not delete the source library item.

## Minimal scope

- Remove the one-post-per-library-item database constraint.
- Allow server-side swipe approval from `READY` and `USED` items.
- Keep `ARCHIVED` unavailable until explicitly restored to `READY`.
- Keep `ADMIN`/`USER` and existing lifecycle enum values unchanged.
- Include reusable `USED` items in the agent review/catalog actions.

## Acceptance checks

- Two distinct scheduled Posts can reference one library item.
- The source remains `USED` after repeated approval.
- An archived item cannot be approved until restored, and restoration is
  server-authoritative.
- Existing cancellation returns the original source to the selectable queue.
- Targeted regression tests, typecheck and lint pass; runtime/provider proof is
  separate and is not claimed by local checks.

## Exclusions

No admin cabinet, invitation email, catalog ingestion, provider send, deploy,
merge, secrets, or production migration.
