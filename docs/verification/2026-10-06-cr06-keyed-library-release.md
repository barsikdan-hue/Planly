# CR06 keyed Library creation — implementation and release evidence

STATUS: Task3 implemented and independently reviewed; Task4 final exact-head results are recorded in PR20 metadata. No merge/deploy authorization consumed. Historical ambiguity/spec/Task1 reports retain their original scope. This report records implementation, prior native checkpoints and the final review repair; readiness requires the published evidence HEAD's native/Docker gates.

Base: `49f9e7b09783ba1f420af3e6914f433abc2133be` (authorized PR18 merge). Task3 runtime candidate: `096d35f99b9de61383c75458887997217fb752a5`. PR20 stays DRAFT until all technical gates and fresh independent review pass. Production/browser/provider acceptance is not inferred from native CI or modeled callbacks.

## Proven root and integration

Original execution: `components/planner/app.tsx / saveLibraryEditor` → `saveLibraryItem` → `lib/client/planly-api.ts / createLibraryItem` unkeyed POST → `app/api/library-items/route.ts / POST` → independent random UUID insert. Native diagnostic proves one visible committed row before the suppressed response; retry persisted two rows and concurrency three. No logical intent survived this boundary.

Task1 supplies `createLibraryItemForIntent`, owner/key/hash mapping and atomic owner → attempt → Library item replay/delete. Task2 supplies the sole durable client creation envelope. Task3 connects them together: authenticated collection POST requires UUID header; client validates explicit key before dispatch and validates acknowledgement ID; App freezes/persists/verifies the envelope before POST. Hydration/polls do not submit, match content or infer IDs. Unknown outcome keeps original body/key/raw; explicit retry resolves that intent before a later explicit PATCH or independent create.

App retains CR11 OwnerLifetime as canonical authority, with PR17 token/revision/operation guards. Current raw readback and exact attempt cleanup are verified. Newer raw and independently changed server DTO retain raw with known ID; replacement never receives the old ID. CREATED/410 replacement resolution returns before new creation. Conflict409 retains old intent. Definite precommit400/404/422 closes only its exact local intent for explicit correction; unknown/network/502/409 retains it. No automatic retry, content deduplication, TTL, generic ledger, scheduler/Post/provider rewrite or second storage model.

## RED → GREEN and oracle continuity

Task1 native race harness root/real PostgreSQL graphs remain in [Task1 evidence](2026-10-06-cr06-task1-native-races.md). Harness repair changes no runtime, original outcome assertion or timeout.

Task3 test-only `698a972dc355639c20a7f8c8a3f72c3c4b9e280c`: [native CI37454226900](https://github.com/barsikdan-hue/Planly/actions/runs/37454226900), job112237766876, **714total/688PASS/26FAIL/0SKIP**. Two original one-item REDs plus24 native/client/App contract REDs; all baseline protections pass. Local actual App/client:26total/4PASS/22RED/0SKIP before runtime, then26/26GREEN. Types and focused lint pass locally.

The two original declared-RED test names and one-item/identity/visible-commit outcome assertions remain active; they are neither removed, skipped, renamed nor weakened. Their fixture now carries explicit approved key and forwards the actual client header to the authenticated route. Historical duplicate-on-edited-body observation is archived and active acceptance checks frozen retry then a separate explicit PATCH.

Archive: `probes/cr06-main-95f53b7-library-create-ambiguity.integration.test.ts.txt`. Git blob equals original4733405: `775270d3782a525d7b09e8469498905ced3d1dd6`. SHA256 of both exact Git blobs: `d00d54ca8b8dc447c9349a9b751f092c394940607789f34b5183fb554af81c05`. `.ts.txt` is outside active test/TypeScript globs.

Frozen-source reproduction, only in an isolated checkout with a disposable native PostgreSQL database and test auth configuration:

```powershell
git worktree add --detach <isolated-directory> 47334055ee49a55e5cae278ac62411dc65c8980a
# Run from that exact checkout; install its frozen lockfile and point DATABASE_URL at disposable PostgreSQL.
pnpm install --frozen-lockfile
pnpm db:migrate
node --test --test-concurrency=1 --experimental-strip-types tests/library-create-ambiguity.integration.test.ts
```

The historical callback probe is also frozen evidence against PR17, not an active oracle for the new keyed server. New actual App callback tests model HTTP; native collection tests independently prove real commit/lost stream and keyed concurrency.

## Protected fixture alignment

Six local protected failures were traced to changed representation rather than incorrect product outcomes: two tests called generic unkeyed creation directly instead of the parent durable editor; two acknowledgement fixtures returned unrelated Server text; a global raw-write failure also disabled the now-required intent write; the old concurrent CREATE replacement test expected replacement cleanup contrary to approved resolution-only semantics. Tests now enter actual editor create, return submitted DTO fields, isolate raw-only storage failure and exercise ordinary known-item PATCH replacement respectively. Original list/error/lock/stale-callback guards remain; dedicated CR06 replacement tests cover unresolved CREATE resolution-only. Adapted68/68PASS;105 unchanged protected cases pass on the same runtime. Exact full native results below govern release, not that split local aggregate.

## Task4 gate ledger

Runtime candidate native: [CI37455553439](https://github.com/barsikdan-hue/Planly/actions/runs/37455553439), job112242154988 — **SUCCESS,714/714PASS,0FAIL/0SKIP**. Both original active declared-RED names now PASS at tests237/238; visible commit before response loss, one row and same ID remain asserted. Migration drift/apply, typecheck, lint and production build PASS. Lint retains13 existing warnings; no new lint warning in final runtime candidate.
Runtime candidate Docker: [Self-host37455553431](https://github.com/barsikdan-hue/Planly/actions/runs/37455553431), job112242154379 — **SUCCESS**. Same-key replay and terminal410 before/after full stack recreation PASS; existing private bytes, worker, scheduler and Redis-loss checks remain and PASS.

All current native Library/source/conversion protections, PR17 Library recovery/storage/continuations, CR11 owner-lifecycle and PR18 owner/upload/recovery compatibility pass in that714/714 full suite. Diff contains only CR06 paths, tests and evidence; workflows, dependency lockfile and deployment/infra configuration unchanged. Client bundle consumes contracts and the pure envelope, never server hash/DB/session credentials.

Final exact-head CI/Docker and release status are linked in [PR20 metadata](https://github.com/barsikdan-hue/Planly/pull/20) after evidence publication to avoid a circular SHA/report commit. The 096d35f checkpoint above precedes the final review repair; it is not the final release-head proof. No ready-for-merge claim until the resulting exact-head gates. Live-provider job is intentionally not requested; no production deploy/provider send/secrets/infra/destructive production DB actions.

## Independent whole-branch review and one fix pass

Fresh read-only reviewer inspected base49f9e7b..096d35f, spec/plan, ledger, five Review Focus lines, native/Docker evidence and the working-tree exact POST URL/method assertion refinement. Critical: none. Important: one. Minor: none requiring a separate change. Original verdict: not ready until the demonstrated replacement branch is repaired.

Proven trigger: unknown create A → Cancel → edit existing item B → Save. `saveLibraryEditor` filtered out A's valid durable envelope when B had an ID and different token; actual App sent PATCH B and cleared its raw, bypassing the resolution-only branch. Both CREATED and DELETED existing-item replacement tests reproduced RED (2total/0PASS/2FAIL/0SKIP; actual PATCH, expected POST). This is the same Task3 replacement root, not an independent product/architecture change.

Minimal repair consumes any valid owner-scoped pending envelope before saving either replacement form. Existing exact cleanup/raw/owner/operation guards are unchanged. First Save replays A's frozen POST/key; B retains its own raw/ID; next separate Save PATCHes B. Known-item PATCH remains permitted when no valid envelope is readable, including corrupt/unavailable storage. Actual App/client targeted GREEN: **28/28,0FAIL/0SKIP**. Both new tests require unchanged B raw/ID and original key/body, exact cleanup, then the separate PATCH; the existing corrupt/unavailable PATCH control also passes. No original assertion, timeout, skip or declared-RED name changed. One focused fix pass; no repeated independent review loop.

Review Focus: same-normalized raw revision, current replay DTO/media, storage readback and A→B→A/captured callbacks satisfied; Cancel/replacement required the repair above. Server lock/hash/current DTO replay, additive migration isolation, original diagnostic continuity and owner guards otherwise reviewed as coherent.

Reviewer declined to judge (exhaustive): production browser/network/provider acceptance; independent native/Docker reruns (used executor's exact checkpoint evidence); future evidence-commit readiness; pre-existing unkeyed internal CRUD and non-keyed list/PATCH read races; allowed known-item PATCH with no readable pending envelope; empty DTO produced by direct DB removal of attached media (no supported trigger); arbitrary lying/reentrant storage or total failure after successful removal (outside proven browser fault matrix); cross-tab coordination/TTL/automatic replay/old-client rollback reliability (outside approved design); owner-controlled merge/production migration/deploy/provider sends. These boundaries do not become production acceptance claims. Final exact-head native/Docker runs by the executor are mandatory after this repair.

## Executor rulings

- Native Windows bookkeeping replaces unavailable Bash ledger scripts; cost: bookkeeping only, actual commits/test logs preserved.
- Local native DB/Docker unavailable: publish verification checkpoints to existing actual CI, with no premature readiness; cost: checkpoint noise, never production mutation.
- Latest user requires both original REDs stay active and go GREEN: archive original bytes and adapt explicit identity only; cost: representation fixture, mitigated original native outcome assertions.
- Protected fixture alignment above follows approved keyed/DTO/replacement semantics; cost: masking risk, mitigated separate native and actual callback contract matrix.
- App verifies PR17 raw readback using its existing storage reader; cost if wrong: warning and retained safe envelope, not duplicate admission.

- Valid envelope precedence for known-item replacement follows the same approved resolution-only policy; cost if wrong: delaying an ordinary PATCH by one explicit resolution Save, mitigated both CREATED/410 RED→GREEN and no-readable-envelope PATCH control.
- The original POST bridge retains exact collection URL/method preconditions while a separate explicit PATCH branch validates its item URL; cost: fixture adaptation only, no original product outcome weakening.
- Owner already selected pushed PR plus merge gate; finishing-a-development-branch retains branch/worktree and does not reopen an integration menu or merge/deploy.

All executor rulings, independent findings and declined-to-judge boundaries are recorded above. No unrelated milestone is included. The final exact-head CI/mergeability/behind/clean-tree checks live in PR20 metadata; production remains a separate unconsumed gate.
