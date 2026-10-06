# CR06 Library creation ambiguity — diagnostic checkpoint

STATUS: DIAGNOSTIC_ONLY_NATIVE_RED_PENDING. No runtime implementation or readiness claim.

Authority: `barsikdan-hue/Planly`; fresh main `95f53b7d18e656e0f8ceff5002b4c42af3d12251`; branch `codex/customer-ready-library-idempotency`; worktree `work/Planly-library-idempotency`. Direct Orchestrator `CR06_DIAGNOSTIC_APPROVED` permits diagnostics/spec only. PR12–19 retain frozen heads, bases and gates. No Owner release approval observed; no merge/deploy/provider sends.

## Contract and first broken layer

One logical Library creation whose commit succeeded but response was lost must be distinguishable from a second intentional creation, including identical content. The current client and server have no representation of that distinction. This report diagnoses the gap; it does not select a new request identity or edited-content policy.

Execution: `ContentLibrary::submit` → PR17 parent `PlannerApp::saveLibraryEditor` → `saveLibraryItem(input, undefined)` → `lib/client/planly-api.ts::createLibraryItem` → `request`/`Response.text` → `POST /api/library-items` authenticated owner + content validation → `lib/server/library-items.ts::createLibraryItem` → new `randomUUID()` → PostgreSQL Library/media transaction → DTO acknowledgement. A rejected response read leaves an id-less editor. Explicit Save sends another content-only POST. First broken protocol boundary: creation intent loses its identity at client transport; server receives indistinguishable independent insert requests. Recovery and the mounted operation lock cannot establish a committed creation ID after an unknown outcome.

`library_items` has no creation key/hash or unique owner/request constraint. Existing Post creation already has a separate owner-scoped key/hash contract; it must not be repurposed as Library identity. No scheduler, publication or Post creation operation is involved in the reproduction.

## Main-based native diagnostic

`tests/library-create-ambiguity.integration.test.ts` executes the real client parser, authenticated production POST handler, server validation and PostgreSQL persistence. Only response delivery is suppressed: actual POST returns 201, the committed row is independently observed, then a Response stream throws before the client receives any DTO ID. This is deterministic transport-boundary injection, not a claim of actual network loss or deployed behavior.

Eight predeclared cases: two semantic REDs (postcommit explicit retry, three concurrent client repetitions), six controls/observations (precommit rejection/correction, intentional identical creations, edited content after ambiguity, owner/media isolation, unauthenticated rejection, invalid content). RED expects one persisted item for one logical attempt. Intentional-identical control expects two. Their present wire forms are indistinguishable: that counterexample proves why content matching cannot fix the protocol. These diagnostic assertions are not a premature choice of a new header/schema or a complete future acceptance oracle.

Native results will be recorded from actual GitHub jobs. No local PostgreSQL/Redis/Docker is available; missing setup is not counted as behavioral RED. No skip is added.

## Frozen PR17 client evidence

Disposable `work/Planly-library-idempotency-pr17-probe`, detached `89111873a6cda4ecceba545102911706eafc386c`. Tracked PR17 runtime remains unchanged. Probe invokes actual App/Library callbacks; HTTP commits are modeled here and cannot substitute for the native suite.

Fresh baseline: main Library/UI/client selection **68/68 PASS**, PR17 recovery/storage/continuations **46/46 PASS**, all zero skips. Primary no-incremental typecheck PASS.

Probe **7 total /4 PASS /3 declared semantic FAIL /0 skip**, exit1. Same mount, navigation/remount and same-tab App reload each reach `2 !== 1` after an explicit second Save. Before retry: initial modeled commit exists, raw text/title and token survive, ID remains absent, operation unlocks, no automatic POST occurs. On reload even bootstrap containing the original committed item does not guess an ID or close the raw editor. This is correct recovery behavior; missing creation intent is CR06.

Edited-content observation: same recovery token, changed title/text/ordered media, next Save sends changed POST and creates a second item. This records current behavior without assigning future semantics. Precommit failure then explicit retry produces one item; a successful first save followed by intentionally opening another editor with identical content produces two with distinct editor tokens. Owner A ambiguity does not hydrate B; return to A restores raw work without a request.

Reproduce: create a disposable detached worktree at exact PR17, provide its existing dependencies, copy `docs/verification/probes/cr06-pr17-client-probe.mjs` from this diagnostic branch to `.superpowers/cr06/library-create-client-probe.test.mjs` in that tree, then run:

```powershell
node --max-old-space-size=512 --test --test-concurrency=1 --experimental-strip-types .superpowers/cr06/library-create-client-probe.test.mjs
```

The source is preserved outside main's normal test glob because the PR17 fixture is absent on main. Relative import intentionally targets the stated disposable location. Existing frozen integration artifacts are preserved; native app worktree creation failed because the chat's stale/unborn SMM root lacks the requested commit, so verified authoritative Git worktree fallback was used.

## Boundaries and next gate

Runtime/API/contracts/schema/migrations/workflows unchanged. Primary diff contains diagnostic tests, reproducible probe source, report and architecture options only. Build/Docker/provider/production proof is not inferred from callback tests. CR07/CR08/GAP01 remain separate; release train and CR11/CR09 dependencies remain unchanged.

Next: obtain native semantic RED with all baseline tests passing, record exact jobs/counts, then direct `ARCHITECTURE_DECISION / CR06 LIBRARY CREATE IDEMPOTENCY`. No runtime fix before representation approval and subsequent written-plan approval.
