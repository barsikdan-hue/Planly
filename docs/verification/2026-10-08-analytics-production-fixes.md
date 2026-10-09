# Analytics production acceptance follow-up

Owner authorized fixing the two observed Phase 8 symptoms on 2026-10-08. Source/base and current production: `20caf582d2734ec063db4a52f8505a94f149cd19`, merged PR31, Render `dep-db3r7blg1s2s73bi02t0` LIVE. Working branch: `codex/analytics-production-fixes` in the clean verified linked worktree. No subsequent merge/deploy/env/webhook/provider mutation is authorized by this implementation approval.

## MAX identity: root cause proven and corrected

Normal authenticated Planly bootstrap was observed through browser network events; only derived metadata was output. Both existing owned MAX publications have a present 36-character ID beginning `mid.`, no other dot/comma, accepted by the existing connector and rejected by analytics. No actual IDs, credentials, cookies or raw response body were printed or persisted.

`lib/server/analytics/repository.ts::publicationIdentity` calls `lib/analytics.ts::validMaxMessageId`. Its former `[a-zA-Z0-9_-]{1,256}` regex rejects the prefix separator. `refreshMaxAnalytics` consequently skips the row before its reader; the UI shows IDENTITY_UNPROVEN. This is a Planly validator mismatch, not evidence of invalid tokens or a provider denial. Public URL IDs are different and must never replace stored delivery IDs.

Minimal correction: allow an optional literal `mid.` prefix, retaining the original 256-character total bound and alphanumeric/underscore/hyphen suffix. Do not strip/translate the ID, allow arbitrary dots, infer a destination or alter any receipt. Reader still uses a fixed-host GET and requires exact `body.mid` and `recipient.chat_id` equality before accepting views.

Official MAX docs show the prefix in [message links](https://dev.max.ru/docs-api/methods/PUT/messages) and the optional prefix for [post/comment identifiers](https://dev.max.ru/docs-api/methods/GET/messages/-messageId-/comments/-commentId-). The [single-message endpoint](https://dev.max.ru/docs-api/methods/GET/messages/-messageId-) currently displays a stricter pattern; that does not erase the directly observed provider-issued IDs. Actual provider acceptance of the preserved full ID remains a later production check, not a fixture claim.

Three regression checks cover legacy repository identity, exact prefixed reader URL and response/count validation. They failed against the prior regex and passed after correction. Unsafe paths, punctuation, URL/query/hash/whitespace, empty prefix and overlength IDs remain rejected. Existing connector/publishing behavior is unchanged.

## CSS: missing delivery proven; cause remains unknown

Production CSSOM and downloaded public assets do not contain the analytics layout rules; controls use display:block/padding:0. Merged source contains them. Render build logs confirm checkout of exact `20caf582`, Node22.13.0, restored cache and successful Next16.3.4/Turbopack build. Cache restoration alone is not causal proof.

PR31 Self-host artifact 11559547791 from exact head `bb6a09e` contains both source rules and compiled `3gzq1rqqjtc_e.css`; its dynamic root-route manifest connects that stylesheet. Production instead advertises `0vsnbvh025n78.css`; the CI stylesheet URL returns 404 there. Cold/updated-cache Next probes preserve new styles on both Node24 and exact Node22.13.0. A reused PostCSS context without a source file timestamp change drops added rules, but this artificial case does not prove Render's failure mechanism. No speculative CSS/cache fix was made.

Added a fail-closed build diagnostic after `next build`. It parses emitted CSS connected to the root route's static HTML or dynamic client-reference manifest, without executing manifest JavaScript or fetching external URLs. It requires control layout/button spacing/table spacing; orphan files or commented selectors cannot pass. Assets resolving outside emitted static files are rejected. Diagnostics contain fixed categories, the public source CSS SHA256, stylesheet count and booleans only, never arbitrary errors or provider/environment data.

This guards against promoting another build with missing analytics CSS and identifies the build boundary. It is not a claim that the unexplained Render build/delivery difference is fixed. If the diagnostic fails in Render, stop that deploy and retain the current runtime for investigation; do not weaken it, clear cache automatically or change env.

## Verification and release boundary

- Exact official Node22.13.0 executable checksum verified against official SHASUMS256 before tests/probes.
- MAX/identity/contract/link/connector focused suite: 35/35 PASS on exact Node22; no skips/cancellations.
- Build diagnostic fixtures: 5/5 PASS; static and actual dynamic route shapes covered.
- Diagnostic accepts the actual verified PR31 CI artifact; negative fixtures prove missing styles are rejected. A separate public production capture timed out and is not counted as verification. These are offline artifact checks, not changes to production.
- Local typecheck and focused lint PASS. Generated tsbuildinfo restored; no dependency/workflow/assertion weakening.
- Final exact-head native CI full suite/typecheck/lint/build/migration checks and Self-host must be SUCCESS before the Owner release gate. Actual counts and final head are recorded in the PR body/checks.

No schema, connector, publisher, scheduler, VK, Telegram activation, env, token, permission or production data changes. Real MAX view accuracy and Telegram receipt delivery are not proven. VK remains HOLD. After separately approved release, first inspect build diagnostics and LIVE SHA/health, then run one bounded existing-post MAX collection and inspect the first real boundary. Do not publish test posts or fix a new provider failure automatically.
