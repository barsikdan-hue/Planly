# CR09 Composer upload continuation evidence

STATUS: ROOT_PROVEN_REPRESENTATION_REVIEW_PENDING; test/spec/report only, no runtime implementation.
AUTHORITY: barsikdan-hue/Planly; fresh fetched main95f53b7d18e656e0f8ceff5002b4c42af3d12251; work/Planly-composer-continuation; codex/customer-ready-composer-continuation. PR12–16 frozen READY; PR17 implementation89111873a6cda4ecceba545102911706eafc386c native492/492PASS but Docker still queued at this checkpoint, not READY yet. No merge/deploy/provider sends.

ROOT_CAUSE: App owns the surviving draft. Dashboard quick Composer's expand navigates to create, replacing the child with full Composer. Composer::addFiles stores lock and continuation locally, applies returned IDs only if mounted.current. App::upload completes actual POST->GET media lookup and updates global Media, but lacks editor-owned attachment continuation/busy. Child replacement releases the lock and rejects same-editor attachment.

RED: tests/composer-upload-continuation.test.mjs and new helper hook loader execute real App/Dashboard/Composer and actual input/expand callbacks. External HTTP/sessionStorage only are fakes; no private hook access or invented editor ID. Corrected valid root probe3total/1same-mountPASS/2expectedFAIL/0skip: pending full publish enabled; completed asset globally visible while same raw draft and recovery have no selected ID. No Post/publication mutation. Ignored log .superpowers/customer-ready/cr09-root-red.log.

FIXTURE_CORRECTION: first probe omitted actual uploadMedia GET lookup after POST and traversal into Card action, causing false failures. Corrected fixture performs server GET and actual expand callback before the recorded valid RED. Those preliminary fixture failures are not product evidence.

PROTECTED_BASELINE: Composer UI/raw recovery/pending creation/Post-edit App/standalone Library69/69PASS/0fail/0skip, serial log .superpowers/customer-ready/cr09-protected-baseline.log. Native DB/runtime excluded locally; no predicted native totals claimed.

PROPOSAL: [representation options/guards](../superpowers/specs/2026-10-05-composer-upload-continuation-design.md). Recommend Option A parent editor upload batches with owner/token/App generation guards, optional Composer control and preserved fallback. Architecture decision and implementation plan approval pending; no runtime code modified. Unknown Library POST idempotency remains independent CR06; UI mode/pending/Library recovery contracts stay frozen.

NEXT: push root checkpoint, create DRAFT PR and inspect actual declared-RED native/Docker results. Direct Orchestrator ARCHITECTURE_DECISION with GitHub evidence; wait/read/verify answer before plan/runtime. PR17 Docker and gate remain independently tracked. Production/browser/live behavior NOT PROVEN for CR09.
