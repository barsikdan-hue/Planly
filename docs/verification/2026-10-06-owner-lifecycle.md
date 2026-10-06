# CR11 Owner Lifecycle — diagnostic checkpoint

STATUS: IMPLEMENTED_AWAITING_PR17_MERGE_AND_EXACT_HEAD_CI. Option A approved at diagnostic HEAD `075f72896c75fa404293fbdb9d4b07d0b0431a0e`; written plan approved at `31c5a8af01eb556e82cd0f78e40042b9c6e9db1b`, Native execution selected. Runtime App only. Local verification, fresh scoped review and supporting frozen integration completed; PR19 DRAFT, no merge/deploy readiness before dependency/fresh-main/native CI gates.

## Authority and scope

Branch `codex/customer-ready-owner-lifecycle` is stacked on frozen PR17 commit `89111873a6cda4ecceba545102911706eafc386c`, not on main. PR19 targets `codex/customer-ready-library-recovery`; diagnostic `075f728` and plan `31c5a8a` contained tests/docs only. The authorized implementation adds App-only runtime plus focused tests. PR18 stays DRAFT at `f7dd2bb29d9c2a23d3919cda3e83a57fcf099027`. Release dependency: PR17 → CR11 → PR18, with fresh verification after integration.

The completed direct Orchestrator reply requested a separate Owner Lifecycle task, an inventory of owner-scoped App state, systematic diagnosis and an architecture gate before any runtime fix. Its canonical policy requires preserving A recovery under A's key, hydrating only B's own recovery/pending state, invalidating old A callbacks before B data applies, and suppressing A continuation effects/messages in B. No automatic replay or A+B merge. Basic owner isolation does not require another Owner human gate; merge/deploy still do.

## First broken layer

`components/planner/app.tsx::initial load` (215–276) binds `recoveryOwner` to the authenticated profile at line 228 and hydrates that owner's Composer recovery and pending state. `App::scheduled poll` (300–325) compares the incoming profile to `libraryOwner`, invokes only `bindLibraryOwner` at line 314, and then installs B posts/accounts/media/library/name at 315–318. It leaves Composer draft/ref, token/key, recovery owner and pending UI from A intact.

`App::setDraft` (187–197) subsequently writes B's edits through the retained A `recoveryOwner`. Storage helpers already isolate keys by owner; the missing mounted-App transition is the first broken layer. `App::submitEditor` (343–359) also reads that retained owner and lacks a captured owner guard: a captured A save callback after the B poll dispatches an A creation request. This is distinct from a save already in flight, which is protected against poll application by `saveLock`.

`App::upload` (559–575), when used by default MediaLibrary without the optional Library guard, accepts a successful delayed `uploadMediaApi` POST→GET result into B media and emits a success message. `App::updateName` (701–709) accepts delayed A profile success into B name; delayed A error notifies B. These are reproduced client effects, not proof of server cross-owner writes.

## Owner-scoped state inventory

| State / path | Existing binding and transition | Evidence and CR11 disposition |
| --- | --- | --- |
| Authoritative posts, media, name, accounts, Library items | Bootstrap and poll apply snapshots; Library/media revisions protect some same-owner refreshes | Destination snapshot application explicitly checked in every transition probe. Preserve those revision protections. |
| Composer draft, draftRef, editorRevision, source/media IDs | Bootstrap recovery only; stable `setDraft` uses mutable recoveryOwner | Proven raw A→B retention, B edits overwrite A key, old captured A change accepted. In proposed runtime scope. |
| Composer editorToken/editorKey, persistedEditor, recoveryOwner | Token rotates on replacement/clear, owner assigned only at bootstrap | Proven full Composer descriptor key does not rotate at owner change. Cache hydration/persistence context must transition. |
| Recovery notice and warning latch | No owner poll reset | Same root context; old notices must clear before B hydration. Warning behavior under unavailable storage needs focused acceptance before implementation claims. |
| creationPending and durable pending key | Owner-keyed helper; App bootstrap hydrates only initial owner | Proven A pending shown in B and B pending not hydrated. Preserve A durable key. Never automatically retry on transition. |
| Pending creation acknowledgements/helper | Helper captures owner key and token; App Save/Publish/Swipe use saveLock | Existing owner-keyed writes alone are not a helper defect. In-flight save across a poll is NOT PROVEN because poll checks saveLock both before request and before application. No helper change proposed. |
| Controlled Library editor/ref/token, persisted snapshot, owner/generation, operation, busy/error/notice | `bindLibraryOwner` (125–142) invalidates generation before hydration; controlled callbacks (578–642) guard owner/token | PASS: old A change rejected; A/B durable Library recovery isolated through A→B→A. Preserve implementation and protected tests. |
| Shared upload/mediaRevision | Optional guard only for controlled Library | Proven delayed default MediaLibrary upload adds A asset and toast to B. Guard owner generation before dispatch, after awaits and before notifications. |
| Profile response | `updateName` applies after await without owner guard | Proven old success changes B name; old error notifies B. Add guards only after approved design/plan. |
| Delete confirmation, detail selection | App confirm/detail refs survive poll | A media delete confirmation remains open in B: proven. Late DELETE result or detail ID collision behavior NOT PROVEN. Clear proved old confirmation; diagnose other effects before expansion. |
| query, contentTab, reviewing; child-local state | App owner does not key ContentLibrary/SwipePlanner; child local query/presets/skips/results persist by component lifecycle | Inventory hazard only. Actual late child callbacks/previews and visible cross-owner consequences NOT PROVEN; no speculative runtime changes. |
| Library card save/delete, source/conflict refresh | Some async callbacks lack a general owner guard | NOT PROVEN in actual delayed operations. Do not expand from source inspection alone. |
| Post save/publish, queue approval, reschedule | Mostly no general owner guard; save/publish/approval use saveLock | Captured A save *after* B proven; already-in-flight save crossing applied poll NOT PROVEN. Reschedule and other late results NOT PROVEN. |
| Connect/toggle, late delete | General owner context absent | NOT PROVEN. Separate reproduction required before adding these to runtime scope. |
| Load error, save lock/busy, dataRef | Bootstrap mounted guard; poll has local active/busy and checks saveLock | No evidence of independent fault. Preserve active request controls; owner transition ordering must be explicit. |

This inventory does not establish an owner observer without scheduled/pending posts: the current poll is conditional on ready + scheduled/pending posts and document visibility. Broader login/session transitions and server authorization are NOT PROVEN and outside this diagnostic checkpoint.

## Reproduction and results

Run from the CR11 worktree:

```powershell
node --max-old-space-size=512 --test --test-reporter=tap --test-concurrency=1 --experimental-strip-types tests/owner-lifecycle-app.test.mjs
```

The committed 17-case fixture mounts the actual App through the existing PR17 Library fixture, drives real public component callbacks, mutates the fake authenticated HTTP profile, and invokes the actual scheduled polling timer. It does not forge App private owner/token state. Upload probes require a successful POST and delayed successful GET through the real client pipeline. Destination B media/name application is a precondition, avoiding a false result from a poll that never ran.

Actual result: **17 tests / 3 PASS / 14 expected semantic FAIL / 0 skipped**. Passing controls: transition alone preserves A Composer durable cache; old A controlled Library change is rejected; Library recovery remains separately owner-bound through A→B→A. Failing cases: B blank; B recovery priority; Composer key rotation; B writes preserve A cache; captured A change; pending A isolation; B pending hydration; A return restoration; old delete confirmation; late generic upload data; late upload messages; late profile success; late profile error; captured A submit.

Failures are assertions about actual observed values, including test 7's React descriptor-versus-null assertion serialized by the test runner as `ERR_TEST_FAILURE`. The first exploratory log had fixture descriptor lookup errors; it is not product evidence. The corrected expanded run has no fixture lookup failures. Tests with multiple assertions only prove assertions reached: the profile success case first fails on B name; profile error separately proves the message leak; the stale-submit case proves one request, not its later unreached pending-cache assertions.

Protected baseline (same Node flags, serial): `library-editor-recovery.test.mjs`, `library-editor-continuations.test.mjs`, `library-editor-recovery-storage.test.ts`, `content-library-ui.test.mjs`, `editor-recovery-lifecycle.test.mjs`, `post-edit-app-lifecycle.test.mjs`, `pending-creation.test.ts`, `swipe-planner-app.test.mjs`: **128/128 PASS, 0 skipped**. Ignored local logs: `.superpowers/customer-ready/cr11-expanded-red.log` and `cr11-protected-baseline.log`.

Diagnostic checkpoint contained no runtime changes. No provider sends, production mutations, merge, deployment or infrastructure changes. Local fixture results are not browser/Render/live-provider acceptance. PR17's existing native CI is baseline evidence only, not CR11 exact-HEAD CI.

## CI trigger limitation and gate

Current native CI and self-host workflows restrict pull_request targets to main; CR11 must target the frozen PR17 branch to keep its diff separate. Do not widen workflow triggers or retarget this diagnostic PR to main silently. The PR body records the actual exact-HEAD run lookup and local lint outcome. Missing runs mean NOT_TRIGGERED, not PASS. The architecture gate can review reproduced diagnostics; implementation/merge readiness still requires actual appropriate CI after the approved integration path.

Completed Orchestrator decision: APPROVE_OPTION_A_WITH_GUARDS. Canonical authenticated owner ID + unique generation is the App lifetime authority; invalidate A before B data; preserve A durable keys; use exact bootstrap B recovery/pending precedence; A→B→A never revives the first A callback. Proved-only scope approved, including captured Composer change/save/publish/retry; no reset-everything or whole-interface remount, no unproved state changes or helper/saveLock rewrites.

Orchestrator accepts NOT_TRIGGERED at this stacked diagnostic stage and forbids workflow changes for it. Before READY: Owner-approved PR17 merge → PR19 fresh-main rebase → ordinary exact-HEAD native CI + Docker → PR18 fresh integration recheck. Neither absent runs nor supporting compatibility replaces that requirement.

Approved architecture/options are in `docs/superpowers/specs/2026-10-06-owner-lifecycle-design.md`. Written plan: `docs/superpowers/plans/2026-10-06-owner-lifecycle.md`. Completed PLAN_REVIEW: IMPLEMENTATION_APPROVED, Native / executing-plans selected. Runtime scope is strictly App only; any other runtime file requires STOP_SPLIT. Full local checks, fresh review and isolated PR18 compatibility are required before publishing the implemented-awaiting-dependency status.

## Task 1 implementation checkpoint

`App::transitionOwner` invalidates the old canonical lifetime, clears proved Composer/cache-reference/pending/notice/warning/media-confirmation state, creates a new ID/generation, installs the destination snapshot, hydrates Composer with extracted bootstrap precedence, then binds the existing Library lifecycle. Same-owner poll does not transition or rotate identity. A keys are not deleted or migrated. The separate Composer recoveryOwner ref is removed; existing helper calls read canonical owner identity. No recovery/pending schema or saveLock changes.

Exposed Composer `setDraft`, save, publish and retry reject stale lifetime before storage/validation/dispatch. Default shared upload combines owner lifetime with Library's existing optional predicate; rejects before files and after successful/failing awaits, suppressing old messages. Profile success/error uses captured lifetime. Unmount invalidates canonical acceptance. Only proved media confirmation is cleared; unproved post confirmation/detail/review/query/card/account/child states are not silently reset.

Expanded acceptance preserves the original 17 and adds 19 lifetime/storage/precedence/control cases. Actual unchanged-runtime RED: **36 tests / 6 PASS / 30 semantic FAIL / 0 skipped** (`cr11-plan-red.log`). First implementation GREEN: **36/36 PASS / 0 skipped** (`cr11-first-green.log`). After hydration formatting/effect-dependency cleanup, combined focused/protected run: **164/164 PASS / 0 skipped**, comprising expanded 36 and existing protected 128 (`cr11-focused-protected-green.log`). No-incremental typecheck PASS and focused ESLint PASS. All results are local callback/fixture evidence.

New controls cover same-owner poll, same-owner upload success/error, B recovery-plus-pending bootstrap precedence, acknowledged-ID token match/mismatch, Swipe pending, corrupted/read-failed B storage, captured actual retry, first-A callbacks after round trip, old upload failure stopping next file, and upload/profile acknowledgements after unmount. Original multi-assertion caveats still describe the diagnostic RED; GREEN reaches every assertion. Full verification, independent review and PR18 isolated integration remain Task2, not inferred from Task1.

## Task 2 verification and fresh review

Pure37-file selection: **359/359 PASS /0 skipped**. Full no-incremental typecheck PASS; full ESLint0errors/13existingwarnings; local Webpackbuild PASS with existing optional BullMQ valkey-glide module warning. Own generated tsconfig.tsbuildinfo restored.

Additional package whole-project test selection: **531 tests /360PASS /171FAIL /0skip**, exit1 without DATABASE_URL/REDIS_URL. Classified all171 records:169 missing required DATABASE_URL setup failures; health503 without database; one unchanged Windows self-host URL-path module-not-found. [Every failure name and exact scope](2026-10-06-owner-lifecycle-local-full-suite.md). These declared local environment/platform limits are not native PASS or a new scoped App regression; API/native/health/self-host paths are unchanged. Actual native CI remains mandatory before READY.

One fresh whole-branch gpt-6-astra review at915f4fe against frozen891: no Critical/Important/Minor finding in approved scope; independent focused36/36/0skip and clean HEAD/diff check confirmed from reviewer log. No mandatory fix pass. Reviewer explicitly distinguishes fixture logic from actual React reconciliation/browser/server/production.

### Exhaustive rulings on reviewer exclusions

- Conditional owner observer (no scheduled/pending posts or hidden document): keep existing observer; no generalized auth lifecycle proved. Cost if wrong: an unobserved session change may retain old UI until an authoritative snapshot applies.
- Logout/login outside an applied snapshot: no auth/server change admitted. Cost if wrong: that distinct transition remains unverified.
- Server authorization/session ownership of already sent requests: client fixtures establish no server write isolation. Cost if wrong: server cross-owner effect remains undetected until separate server/live verification.
- Physical upload cancellation/internal POST-to-GET: permit sent work to finish, suppress stale App effects. Cost if wrong: an unused uploaded asset can remain server-side; no cancellation claim.
- Already-in-flight Save/Publish/Swipe including unmount continuations: no applied-poll crossing proved due saveLock; do not rewrite lifecycle. Cost if wrong: separate old-result/cache/message behavior may remain; no acceptance claimed.
- Pending helper writes captured under A: preserve correct owner-keyed persistence, no helper defect proved. Cost if wrong: unproved pending-helper race requires a separate RED.
- Captured duplicate/create/edit/media-use/navigation callbacks outside admitted change/save/publish/retry: keep unchanged without actual delayed-path reproduction. Cost if wrong: other callbacks may transfer old work; scoped approval is not complete App isolation.
- Settings/quick Composer/picker/busy/preview and other child-local state: no child reset/remount authorized. Cost if wrong: rendered child consequences remain unverified.
- Swipe selections/presets/skips/results/preview continuations: inventoried, no RED. Cost if wrong: old review state may survive; no child-lifecycle PASS.
- Search/query/contentTab/review/detail/post confirmation: explicitly retained, only proved media confirmation cleared. Cost if wrong: unproved selection/confirmation leakage remains.
- Account connect/toggle: no independent transition RED. Cost if wrong: stale account effects/messages may remain.
- Late DELETE/reschedule: clearing unsubmitted media confirmation does not prove already sent deletion isolation. Cost if wrong: separate late mutation effects may remain.
- Library card save/delete/source/conflict refresh outside controlled editor: no expanded acceptance. Cost if wrong: old card continuations may apply; controlled editor PASS does not cover them.
- Same-owner concurrent profile/upload ordering beyond existing revisions: independent, unchanged, no reproduction. Cost if wrong: same-owner ordering issue remains.
- Strict Mode/concurrent React/keyed Composer remount: custom hook fixture cannot prove real reconciliation. Cost if wrong: browser-only lifecycle fault remains; production acceptance still required.
- Cross-tab/device/cache repair UX/non-durable A recovery: no cross-tab protocol/migration/repair authorized; owner boundary outranks carrying non-durable A into B. Cost if wrong: non-durable A work is not recoverable; explicit accepted safety policy.
- PR18 fresh integration/native PostgreSQL-Redis/Docker: supporting probe evidence only; fresh-main exact-head gates remain required. Cost if wrong: integration/native regression may remain before those gates.
- Render/browser/provider/deployment: no execution or acceptance inferred. Cost if wrong: production behavior remains unproven until authorized delivery.

No deferred minors. Windows lacks Bash/Git Bash, so native PowerShell brief/ledger/test capture replaces skill scripts; cost is script bookkeeping parity, mitigated by explicit BASE/commands/results. Original diagnostic ledger was preserved in a separate directory. The execution ledger stays because fresh-main/CI/dependency work is unfinished.

## Completed supporting compatibility / current delivery status

[Exact frozen inputs,11 conflict resolutions, resolver source, hashes,23-file selection and independent owner-poll evidence](2026-10-06-owner-lifecycle-compatibility.md): PR18 causal matrix3/3GREEN; CR1136/36 in combined tree;39/39focused and298/298compatibility, all0skip; integrationtypecheck/diffchecksPASS. The original RED probe and frozen branches remain unchanged.

STATUS: **IMPLEMENTED_AWAITING_PR17_MERGE_AND_EXACT_HEAD_CI**. This completes the approved stacked implementation/verification stage, not Task2's dependent fresh-main delivery steps. PR19 remains DRAFT, not READY. GitHub confirms PR17 frozen891 open/unmerged, native37371678618 and Docker37371678746 completedSUCCESS; PR18 frozenf7 open DRAFT. Actual Owner merge/deploy approval has not been observed. Direct Orchestrator dependency gate follows publication of this report.
