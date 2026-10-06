# CR-05 Library unsaved editor recovery evidence

STATUS: IMPLEMENTATION_COMPLETE_REVIEWED_LOCAL_VERIFIED; exact-final-head native/Docker gates pending. PR17 DRAFT. No production/merge/deploy/provider sends.
AUTHORITY: barsikdan-hue/Planly; base main95f53b7d18e656e0f8ceff5002b4c42af3d12251; work/Planly-library-recovery; codex/customer-ready-library-recovery. PR12–16 frozen READY pending Owner gates; campaign not complete.

## Root and RED

ContentLibrary::editor component-local useState(null) → title/text/selectMedia only child → PlannerApp view!==content or reviewing=true unmount → next Library mount editor=null. App bootstrap restores server items, not raw unsaved Library work. First broken layer: editor lifetime/persistence ownership.

Original tests/library-editor-recovery.test.mjs is preserved: actual App+Library callbacks,4total/1same-mountPASS/3expectedFAIL/0skip before implementation. New navigation, same-tab reload and existing-edit remount lose expected title/form. Before transition raw title/text, ordered B→A chips and zero mutations pass. These are actual lifecycle callbacks with the existing non-DOM hook harness, not browser acceptance.

Additional continuation root: child submit/addFiles only clear/attach while mounted; App saveLibraryItem discarded the received DTO ID; child lock resets on remount. Recovery without parent acknowledgements could resurrect confirmed creation or lose uploaded attachments. Truly unknown/lost create response remains CR06.

Storage Task1 capability RED13/13 expected failures before helper existed → storage13+existing Composer recovery12 GREEN25/25. Initial actual continuation matrix24total/1controlPASS/23expectedFAIL; separate closed-old-owner callback and same-owner removed-media poll probes also witnessed RED before their guards. Original protected baseline76/76 before implementation.

## Approval checkpoints

Representation exactc74636bd5798d2f036ddd3bd1773d4a4515b37d9:
- [native37362630026](https://github.com/barsikdan-hue/Planly/actions/runs/37362630026), job111940627991:450total/447PASS/3declared Library RED/0skip. All446 baseline+new control PASS; migrations/drift/type/lint PASS; build skipped after expected RED.
- [Docker37362630134](https://github.com/barsikdan-hue/Planly/actions/runs/37362630134), job111940628446:completed SUCCESS, HTTP/private media, actual worker bytes, stack persistence, Redis recovery, worker result and packaging. Telegram live SKIPPED.
- Direct Orchestrator APPROVE_OPTION_A_WITH_GUARDS: parent ownership, separate raw owner recovery, missing existing ID remains conflict/noPOST, missing media filters only absent IDs with notice, failed durable Cancel retains form.

Plan exact3b2e9a1722fb6ac0988fd9c278d32ebdfb90361e:
- [native37365883893](https://github.com/barsikdan-hue/Planly/actions/runs/37365883893), job111950805049:450/447PASS/3same declared RED/0skip. Plan commit changed docs only.
- Direct completed PLAN_REVIEW: IMPLEMENTATION_APPROVED. Sequential executing-plans→TDD→independent final review→verification. Operation generation rejects stale cleanup/unlock/messages; known ID attaches to newer same-token work; CR06 stays separate. Three runtime areas only, fourth area would require STOP_SPLIT.

## Implementation execution

Runtime files only:
- lib/client/library-editor-recovery.ts: new separate owner/sessionStorage key planly:library-editor:v1:<encodedowner>; raw fields, UUID token/revision, bounded valid envelope. Projection excludes lifecycle/provenance/timestamps/File/Blob. Saved-clear rereads exact full snapshot; explicit Cancel discards matching token even when older cache remains after write failure, never foreign/invalid record. Missing source ID is retained; missing media alone are filtered in order.
- components/planner/app.tsx: owns editor snapshot/state, durable proof, operation lock/error/notice and owner/App generation. All field writes occur outside React updater functions; failed write invalidates current durability. Bootstrap binds owner; poll updates server authority without replacing raw editor. Current source existence/status controls Save. Received DTO updates active-owner server list; untouched exact durable editor may clear. Newer work/failed clear keeps fields and known ID, so next Save PATCHes. Different token/owner/unmounted App cannot write/clear editor/cache or unlock newer operation.
- components/planner/content-library.tsx: optional internal controlled interface delegates editor fields/Save/upload/Cancel to parent; unconditional local hooks retain standalone CRUD/media fallback. Generic Archive/Restore/Delete never clear open editor. Missing-source Save disabled and callback also blocks it; notices use existing styling.

Existing upload pipeline receives only an optional Library owner/generation apply guard. Same-owner assets still enter Media after editor cancellation/replacement; attachment merge and messages belong only to originating token. Other owner/App-unmount rejects updates. Default Composer/Media callers retain API/upload behavior.

Task2 ruling: apply server Media from poll only if captured mediaRevision is current; existing upload/delete acknowledgements advance it. Approved fresh media authority must filter external removal without rolling back known local assets. Cost if wrong: shared Media display could become stale. Actual external-removal and older-poll upload controls plus original stale Library polling test GREEN3/3. No new endpoint or mutation pipeline.

Within-root verification corrections: normalized field projection prevents property-order-only Save rejection after known ID attachment; descriptor owner/generation in state rejects stale closed-editor callbacks; partial polling fixtures without new profile/media fields retain the existing Post polling path; ref synchronization occurs in effects. All covered by real callbacks/fresh checks.

## Local verification at implementation checkpoint

- Serial pure suite323/323PASS/0fail/0skip, including original4 recovery probes, new13 storage cases,29 actual App+Library acceptance cases and all existing protected Library/Composer/Post-edit/Swipe cases. Native DB/current-worker tests are excluded from this local command and remain required in CI.
- Typecheck PASS. Full lint PASS0errors/13existingwarnings.
- Local Webpack production build PASS; existing optional BullMQ valkey-glide warning remains supporting local platform evidence. Standard native CI build still required. Ignored node_modules Junction uses the existing absolute runtime; Turbopack Windows/Junction limitation is not a product acceptance claim.
- Logs: ignored .superpowers/customer-ready/cr05-storage-red.log, cr05-storage-green.log, cr05-continuations-red.log, cr05-refinement-red.log/green.log, cr05-owner-media-red.log, cr05-media-poll-red.log/green.log, cr05-pure-final.log, cr05-typecheck.log, cr05-lint.log, cr05-build.log.
- Independent whole-branch review at4deb1bffd0c44ef5bbf4b9e95cba0dbd53fc3e48: no Critical/Important/Minor findings; technical readiness conditional on exact-final-head CI. Additional read-only actual-callback probes PASS for owner replacement during multi-file upload and successful old-token Save preserving a replacement editor. Exact-final-head PostgreSQL/Redis native0FAIL/0SKIP and Docker SUCCESS remain required. Generated tsconfig.tsbuildinfo restored; runtime checkpoint clean/pushed.

## Scope and limitations

No Composer/CR10 recovery, pending creation, API/DB/shared contracts, scheduler/providers/auth/infra changes; no autosave or new product flow. Explicit Save remains the only Library content submission. lib/server/library-items::updateLibraryItem retains USED; current ARCHIVED sends ARCHIVED, other existing Save READY. Recovery never replays cached lifecycle/provenance. Actual client request after recovery proves existing identity via PATCH, not heading alone.

Storage write/remove failure retains visible work/error and cannot claim reload safety. Known acknowledged ID is retained in memory and persisted when storage succeeds. Unknown/lost POST response has no guessed ID or automatic retry; duplicate prevention after explicit retry remains CR06. Full App unmount invalidates old continuation, not a new durable idempotency pipeline.

Production/browser acceptance and live-provider behavior NOT PROVEN for this branch before authorized delivery. No provider changes/sends. Remaining campaign CR06/CR09 P1, P2 account/media parser and unproven publication-crash diagnosis are independent.

NEXT: push this evidence checkpoint; require exact-final-head native/Docker gates before READY and direct Orchestrator MERGE_DEPLOY. Implementation checkpoint4deb native37370570554 and Docker37370570582 were queued at the last checked snapshot, not PASS. Final results belong in the PR evidence body with their exact SHA/run/job/counts. Fresh-main release compatibility recheck remains mandatory; no edit to frozen PR12–16 and no merge/deploy without real Owner gate.

## Isolated compatibility and final rulings

Supporting uncommitted integration on frozen PR16 ac4f66328014d9b820e2e4dfaaaa4e1e5d078453 plus PR17 implementation4deb1bffd0c44ef5bbf4b9e95cba0dbd53fc3e48: actual combined Library/Composer recovery suites85/85PASS/0fail/0skip and typecheck PASS. Only overlapping App imports/bootstrap dependency list needed reconciliation; both editor namespaces and their behavior retained. Probe checkout work/Planly-library-recovery-integration is detached/uncommitted and was not pushed or merged into a release branch. This is supporting compatibility, not a deployed or authoritative combined SHA. Fresh-main release recheck remains mandatory.

Final review declined native/Docker, production/provider, unknown-response idempotency and unavailable-storage durability claims; rulings:
- Native/Docker acceptance is not waived by review; actual final-head results are mandatory. Cost if wrong: false readiness.
- Production/browser/provider acceptance remains after authorized delivery. Cost if wrong: production-only issues undiscovered.
- Unknown/lost Library POST idempotency remains CR06; no auto-retry/guessed ID/duplicate-proof claim. Cost if wrong: explicit retry can duplicate until separately fixed.
- Reload safety under storage failure remains unproven; keep visible work and warning. Cost if wrong: unsaved work can be lost on refresh.
Task2 Media revision ruling and its GREEN3/3 controls are recorded above. No deferred review findings.