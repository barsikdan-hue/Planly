# CR06 Library creation ambiguity — diagnostic checkpoint

STATUS: ROOT_CAUSE_PROVEN_PLAN_REVIEW_REQUIRED / EXECUTION_BLOCKED_ON_PREREQUISITE_RELEASE. Exact diagnostic/setup/spec heads verified; subsequent plan/evidence changes are docs-only. No runtime implementation or readiness claim.

Authority: `barsikdan-hue/Planly`; fresh main `95f53b7d18e656e0f8ceff5002b4c42af3d12251`; branch `codex/customer-ready-library-idempotency`; worktree `work/Planly-library-idempotency`. Direct Orchestrator `CR06_DIAGNOSTIC_APPROVED` permits diagnostics/spec only. PR12–19 retain frozen heads, bases and gates. No Owner release approval observed; no merge/deploy/provider sends.

## Contract and first broken layer

One logical Library creation whose commit succeeded but response was lost must be distinguishable from a second intentional creation, including identical content. The current client and server have no representation of that distinction. This report diagnoses the gap; it does not select a new request identity or edited-content policy.

Execution: `ContentLibrary::submit` → PR17 parent `PlannerApp::saveLibraryEditor` → `saveLibraryItem(input, undefined)` → `lib/client/planly-api.ts::createLibraryItem` → `request`/`Response.text` → `POST /api/library-items` authenticated owner + content validation → `lib/server/library-items.ts::createLibraryItem` → new `randomUUID()` → PostgreSQL Library/media transaction → DTO acknowledgement. A rejected response read leaves an id-less editor. Explicit Save sends another content-only POST. First broken protocol boundary: creation intent loses its identity at client transport; server receives indistinguishable independent insert requests. Recovery and the mounted operation lock cannot establish a committed creation ID after an unknown outcome.

`library_items` has no creation key/hash or unique owner/request constraint. Existing Post creation already has a separate owner-scoped key/hash contract; it must not be repurposed as Library identity. No scheduler, publication or Post creation operation is involved in the reproduction.

## Main-based native diagnostic

`tests/library-create-ambiguity.integration.test.ts` executes the real client parser, authenticated production POST handler, server validation and PostgreSQL persistence. Only response delivery is suppressed: actual POST returns 201, the committed row is independently observed, then a Response stream throws before the client receives any DTO ID. This is deterministic transport-boundary injection, not a claim of actual network loss or deployed behavior.

Eight predeclared cases: two semantic REDs (postcommit explicit retry, three concurrent client repetitions), six controls/observations (precommit rejection/correction, intentional identical creations, edited content after ambiguity, owner/media isolation, unauthenticated rejection, invalid content). RED expects one persisted item for one logical attempt. Intentional-identical control expects two. Their present wire forms are indistinguishable: that counterexample proves why content matching cannot fix the protocol. These diagnostic assertions are not a premature choice of a new header/schema or a complete future acceptance oracle.

Actual native source checkpoint `ad737b3a0253f92965735f36abe8f422c86f4b9c`: [CI37414137377](https://github.com/barsikdan-hue/Planly/actions/runs/37414137377), job112108893973, **454 total /452 PASS /2 declared semantic FAIL /0 skip**, completed failure as expected. Postcommit RED reached two rows and a different retry ID; concurrent RED reached three rows/three DTO IDs. All six new controls and all446 baseline tests passed. Drift, migrations, typecheck and lint passed; CI Build skipped after the declared Test failure. No local PostgreSQL/Redis/Docker is available; missing setup is not counted as behavioral RED. No skip is added. Final follow-up changes only evidence and disposable fixture isolation, not any runtime or diagnostic assertion; fresh exact-head results remain required before citing that new head.

## Frozen PR17 client evidence

Disposable `work/Planly-library-idempotency-pr17-probe`, detached `89111873a6cda4ecceba545102911706eafc386c`. Tracked PR17 runtime remains unchanged. Probe invokes actual App/Library callbacks; HTTP commits are modeled here and cannot substitute for the native suite.

Fresh baseline: main Library/UI/client selection **68/68 PASS**, PR17 recovery/storage/continuations **46/46 PASS**, all zero skips. Primary no-incremental typecheck PASS.

Main command: `node --max-old-space-size=512 --test --test-concurrency=1 --experimental-strip-types tests/library-contract.test.ts tests/content-library-ui.test.mjs tests/planly-api.test.ts`. PR17 baseline command uses `tests/library-editor-recovery.test.mjs tests/library-editor-recovery-storage.test.ts tests/library-editor-continuations.test.mjs` with the same Node flags. Local full ESLint:0errors/13unchangedwarnings; focused native/probe lint PASS. Local Node24.21.0; native CI uses22.13.0.

Probe **7 total /4 PASS /3 declared semantic FAIL /0 skip**, exit1. Same mount, navigation/remount and same-tab App reload each reach `2 !== 1` after an explicit second Save. Before retry: initial modeled commit exists, raw text/title and token survive, ID remains absent, operation unlocks, no automatic POST occurs. On reload even bootstrap containing the original committed item does not guess an ID or close the raw editor. This is correct recovery behavior; missing creation intent is CR06.

Edited-content observation: same recovery token, changed title/text/ordered media, next Save sends changed POST and creates a second item. This records current behavior without assigning future semantics. Precommit failure then explicit retry produces one item; a successful first save followed by intentionally opening another editor with identical content produces two with distinct editor tokens. Owner A ambiguity does not hydrate B; return to A restores raw work without a request.

Reproduce: create a disposable detached worktree at exact PR17, provide its existing dependencies, copy `docs/verification/probes/cr06-pr17-client-probe.mjs` from this diagnostic branch to `.superpowers/cr06/library-create-client-probe.test.mjs` in that tree, then run:

```powershell
node --max-old-space-size=512 --test --test-concurrency=1 --experimental-strip-types .superpowers/cr06/library-create-client-probe.test.mjs
```

The source is preserved outside main's normal test glob because the PR17 fixture is absent on main. Relative import intentionally targets the stated disposable location. Existing frozen integration artifacts are preserved; native app worktree creation failed because the chat's stale/unborn SMM root lacks the requested commit, so verified authoritative Git worktree fallback was used.

Executed/copy probe SHA256: `F87F8291469061649587FC5789E9A996C8E56CE05A10E3F33E70A7F6C680DFAE`.

## Independent review and explicit rulings

Fresh whole-diff read-only review: no Critical/Important, one Minor fixture-isolation caveat. Existing targeted auth tests can leave global OWNER_EMAIL occupied; native fixture now follows the established Library tests by clearing only the disposable test database's users before seeding. No runtime change or assertion waiver. Fresh exact-head native rerun is required for that correction.

Reviewer declined-to-judge rulings:
- Native outcomes: controller separately retrieved actual job logs and confirmed the exact two failures and454/452/2/0 counts; reviewer source reasoning alone is not native proof.
- Browser reload/network loss: remains NOT PROVEN. Callback/response-stream injection is the explicit diagnostic scope; cost if generalized is a false browser acceptance claim.
- Docker/provider/production: Docker source checkpoint is tracked separately, production/provider NOT RUN; no live claim or provider send is inferred.
- Identity/deletion/edited-raw policy: remains unapproved architecture options. Cost if silently selected is lost newer raw work or duplicate resurrection.
- Concurrent mounted UI Save: not claimed. Native concurrent transport repetitions do not imply a PR17 operation-lock bypass; cost if conflated is a wrong client root cause.

## Boundaries and next gate

Runtime/API/contracts/schema/migrations/workflows unchanged. Primary diff contains diagnostic tests, reproducible probe source, report and architecture options only. Build/Docker/provider/production proof is not inferred from callback tests. CR07/CR08/GAP01 remain separate; release train and CR11/CR09 dependencies remain unchanged.

Completed direct architecture decision: `APPROVE_OPTION_B_WITH_EXPLICIT_TERMINAL_SEMANTICS`, Library-specific durable attempt, atomic mapping/create,409changedpayload,410deleted/noexpiry, owner-scoped separate frozen envelope, fail-closed CREATE storage admission, no automatic replay/PATCH, resolved ID with newer raw then separate explicit Save. Only complete written spec authorized; implementation-plan/runtime prohibited.

Fresh exact diagnostic/setup head `47334055ee49a55e5cae278ac62411dc65c8980a`: [CI37414483040](https://github.com/barsikdan-hue/Planly/actions/runs/37414483040), job112109949733,454total/452PASS/2same semanticFAIL/0skip,446baseline+6controlsPASS. Drift/migrations/type/lintPASS; standardCIbuildSKIPPED. [Self-host37414483079](https://github.com/barsikdan-hue/Planly/actions/runs/37414483079), job112109949937, completedSUCCESS for required build/HTTP/private-worker/persistence/Redis-recovery/package steps; liveSKIPPED. New written spec/evidence commits do not alter the tested diagnostic blob or runtime; their workflows are tracked separately, never inferredPASS.

Completed direct SPEC_REVIEW: `SPEC_APPROVED_WITH_GUARDS → WRITING_PLAN_AUTHORIZED`. Mandatory guards incorporated: literal parsed canonical hash projection, and visible owner-scoped unresolved-attempt notice after Cancel/replacement. Runtime execution explicitly requires actual verified PR12–17 plus merged verified CR11/#19, followed by fresh-main reinspection; no synthetic future baseline. Written plan `docs/superpowers/plans/2026-10-06-library-create-idempotency.md` awaits direct PLAN_REVIEW.

Exact docs-only spec head `6e715983c3595a1e2ea8d632a803180c9a75898f`: nativeCI37415492425/job112113074874 again454total/452PASS/2same declaredsemanticFAIL/0skip; drift/migrations/types/lintPASS and standardBuildSKIPPED. Self-host37415492382 completedSUCCESS; liveSKIPPED. Diagnostic/runtime blobs unchanged.

Next: direct `PLAN_REVIEW / CR06 LIBRARY CREATE IDEMPOTENCY`. Release gate remains Owner approval; PR12–19 unchanged. No runtime fix before reviewed plan AND prerequisite release.
