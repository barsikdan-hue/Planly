# CR11 fresh-main final compatibility

STATUS: FRESH_COMPATIBILITY_PASS. Final `READY_FOR_OWNER_MERGE_GATE` additionally requires SUCCESS on the evidence-only descendant's exact-head checks, recorded in [current PR19 metadata/checks](https://github.com/barsikdan-hue/Planly/pull/19). No merge or deployment is authorized by this report.

## Exact inputs and isolation

- Main: `acbbf8f9222f2496a9c7e93cc4dcc30ebb1c1a82`.
- CR11/PR19 runtime head: `0497094ab66fccd9b61906aefb86e7887dd27fe6`.
- Frozen CR09/PR18: `f7dd2bb29d9c2a23d3919cda3e83a57fcf099027`.
- Combined two-parent head: `24df53be37a93b247939fc6fd7db7d69026f06a2`; parents are exactly the two heads above.
- Combined tree: `98228539ffc529d589301ab30cc2f38fe781e087`. GitHub synthetic merge `00199d312c2eab44faa5552000239df5f8cb9d2d` has the identical tree; `git diff` is empty.
- App blob: `c252187c1e62677acd78f173315379584b1b75c0`; Composer blob: `ce9dac42dd352ee66de38941eebfd6f525abb9f5`.

Authoritative repository: `C:/Users/EliteSochi/Documents/ChatGPT/SMM Planer/work/Planly`, remote `https://github.com/barsikdan-hue/Planly.git`. Primary evidence worktree: sibling `Planly-cr11-finalize`, branch `codex/cr11-finalize-evidence`; disposable combined worktree: sibling `Planly-cr11-finalize-integration`, branch `codex/cr11-pr18-fresh-compatibility`. Existing primary and older QA worktrees were preserved. Manual worktree fallback is necessary because the app tool is bound to the stale/unborn parent repository, as recorded in the previous compatibility report.

This rerun starts from fresh-main-integrated PR19, rather than the old frozen PR17 checkpoint. It supersedes the old compatibility result for this gate; historical reports remain unchanged. The [temporary DRAFT probe PR22](https://github.com/barsikdan-hue/Planly/pull/22) triggers existing main-targeted workflows; it is never to be merged. PR18 receives no commits or metadata changes.

## Composition and observed RED

`git merge --no-commit --no-ff f7dd2bb29d9c2a23d3919cda3e83a57fcf099027` into exact `0497094ab66fccd9b61906aefb86e7887dd27fe6` produced 11 App and 3 Composer conflicts. The [exact resolver](probes/cr11-fresh-main-resolve.mjs) preserves the approved CR09 policies while deriving upload batch owner/generation from CR11's canonical `OwnerLifetime`. It preserves PR14's overlapping-upload/mounted fallback, PR16's controlled mode/durability/recovery precedence, PR17's Library controller/media revision, and PR18's token/batch ordering, submit admission and deleted-media tombstones. Scope does not expand to a new owner authority or recovery schema.

The first disposable composition was **not accepted**: targeted 300 total / 298 PASS / 2 FAIL / 0 SKIP. Both failures were existing frozen assertions `global composer retry entrypoint cannot replay a Post while current editor upload is pending` and its `swipe-planner` counterpart. `PlannerApp` return lost PR18's actual retry-button `disabled={saveBusy || composer.uploadControl.busy}` because resolver case 10 kept the entire PR19 JSX line. Parent retry admission was still blocked; duplicate publication was not established. Restore the existing frozen UI condition only in the probe.

Source review also established that resolver case 5 adapted the error notification guard but missed the success expression containing `added.length`. The [supplemental current-owner control](probes/cr11-pr18-notification-control.test.mjs) exercised actual App `uploadControl`, attached media and released busy state, then failed **0 successes versus 1 expected**. Restoring `permitted() && added.length && (canNotify ? canNotify() : !canApply)` preserves both CR11 owner acceptance and PR18 current-editor notification. Focused corrected run: **41/41 PASS / 0 FAIL / 0 SKIP**, exit 0. Both are explicit resolver omissions in the disposable integration layer; neither proves a new independent source defect in PR19 or frozen PR18. No primary PR19 runtime fix was made.

## Owner-poll probes and protected regressions

The three [owner-poll probes](probes/cr11-pr18-owner-poll.test.mjs) retain the frozen assertions and preconditions: successful old-owner media POST acknowledgement, deferred media GET, actual scheduled profile A→B poll applying B media, then late old-owner GET completion. They assert independently: no A global media in B; A raw recovery unchanged and no old attachment in B; no stale success/error notification. **3/3 PASS / 0 FAIL / 0 SKIP**. The supplemental current-owner control prevents vacuous notification rejection.

Original extracted frozen probe SHA256: `c1e3cb0c84cc982fad5a914f12df5216a1ee8a1d99d822e99b37ba1453b74ac1`. CI copy changes only the fixture import path; SHA256: `38296199f205de119877857445729f43dab47d4170e79bb658a0d5349084ab79`. Resolver SHA256: `e0bc0587355b48afd1c596182f689ca79f4815a3a76ce18ebbd94a141475c5bf`; supplemental control SHA256: `1e9eb5faf8db94dbf17fdf81c0990f09c1b237728f475e5956138a817181cc9c`.

Fresh corrected targeted selection: **301/301 PASS / 0 FAIL / 0 SKIP**, exit 0. It is the previous report's 23-file selection with the CI-path owner-poll file and one supplemental notification-control file, for 24 files. This includes current CR11 **38** (the original expanded 36 plus two fresh-main publish-mode tests), frozen PR18 upload continuation **37**, and merged PR14 upload semantics, PR16 editor publish-mode recovery and PR17 Library recovery. The correction-focused **41** comprises PR18 37 + unchanged owner-poll 3 + current-owner notification control 1. No assertions, timeouts or skip rules were weakened.

Final combined no-incremental typecheck: PASS. ESLint: PASS, 0 errors / 13 existing warnings. The earlier local combined Webpack production build passed before the two resolver corrections; final corrected production build is required in the actual native and Docker workflows below. Local Node 24 hooks/HTTP/storage/timer fixtures support compatibility; native CI uses Node 22.13, PostgreSQL 17 and Redis 7. Missing local native DB/Docker tools are not used to infer product failures or native PASS.

## Actual CI and Docker

- Original PR19 exact `0497094...`: [native CI](https://github.com/barsikdan-hue/Planly/actions/runs/37421722837), job `112132334101`: SUCCESS, **615/615 PASS / 0 FAIL / 0 SKIP**; migration drift/apply, typecheck, lint and production build passed. [Self-host](https://github.com/barsikdan-hue/Planly/actions/runs/37421722988), job `112132334390`: SUCCESS.
- Combined exact `24df53b...`: [native CI](https://github.com/barsikdan-hue/Planly/actions/runs/37431843160), job `112164280166`: SUCCESS, **656/656 PASS / 0 FAIL / 0 SKIP / 0 cancelled / 0 todo**. Migration drift/apply, typecheck, lint and corrected production build passed.
- Combined exact `24df53b...`: [Self-host](https://github.com/barsikdan-hue/Planly/actions/runs/37431843253), Docker job `112164280946`: SUCCESS. Logs confirm foundation smoke, actual worker/private object bytes, stack recreation, PostgreSQL/media persistence, Redis-loss reconciliation and honest unsupported-provider result.

The existing Self-host job builds the application/private object storage, starts migrated web and worker, and verifies HTTP, authenticated media, persistence and scheduler recovery in an isolated stack. `telegram-live` and failure-only diagnostics are intentionally conditional; these workflow skips are distinct from test-suite SKIP. No provider send or production mutation is authorized or performed.

## Review, limitations and final handoff

Independent read-only review covered fresh-main→PR19 and the full combined conflict resolution. Reviewer confirmed both corrections in committed App/Composer blobs, exact parents, identical GitHub synthetic merge tree and clean probe. No remaining Critical/Important/Minor finding in the approved inspected paths. Initial findings and RED evidence are retained above.

This certifies the approved CR11 observer/admission/upload/profile/media-confirmation paths and the inspected PR18 composition. Already-admitted save/publish/Swipe responses, account/reschedule/late-delete continuations, child-local behavior and owner changes without scheduled-publication polling remain excluded/unproven under the approved CR11 spec. Modeled callbacks are not actual React/browser/Render/provider proof. No production acceptance is claimed.

Final PR19 addition is evidence only: this report and three reproduction artifacts outside `tests/`. Final source/tests/package/workflows must remain byte-identical to `0497094...`. After pushing that evidence descendant, its exact-head native CI and Self-host must also succeed; the final PR19 metadata records that final SHA and terminal checks. Then require clean/pushed head, base `main` at the stated fresh SHA, behind 0 and mergeable before `READY_FOR_OWNER_MERGE_GATE`.

Reproduction: create a new disposable worktree at exact `0497094ab66fccd9b61906aefb86e7887dd27fe6` and use its root as cwd. The artifacts live on the evidence descendant, so invoke the saved resolver by its absolute path rather than looking for it in the runtime checkpoint:

```powershell
git merge --no-commit --no-ff f7dd2bb29d9c2a23d3919cda3e83a57fcf099027
# The expected merge conflict is the resolver input; verify 11 App / 3 Composer conflicts.
$evidenceArtifacts = 'C:/Users/EliteSochi/Documents/ChatGPT/SMM Planer/work/Planly-cr11-finalize/docs/verification/probes'
node "$evidenceArtifacts/cr11-fresh-main-resolve.mjs"
Copy-Item -LiteralPath "$evidenceArtifacts/cr11-pr18-owner-poll.test.mjs" -Destination tests/cr11-pr18-owner-poll.test.mjs
Copy-Item -LiteralPath "$evidenceArtifacts/cr11-pr18-notification-control.test.mjs" -Destination tests/cr11-pr18-notification-control.test.mjs
```

The copied tests' fixture imports intentionally target `tests/`. Use the earlier compatibility report's 23-file selection, replacing `.superpowers/customer-ready/cr11-pr18-owner-poll.test.mjs` with `tests/cr11-pr18-owner-poll.test.mjs`, and add `tests/cr11-pr18-notification-control.test.mjs` (24 files). Run Node with `--max-old-space-size=512 --test --test-reporter=tap --test-concurrency=1 --experimental-strip-types`. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` in the native isolated environment. Existing main-targeted workflows provide actual native and Docker verification without changing CI/infra. Never run the merge resolver on the primary source worktree.

NEXT_ACTION: Owner merge decision for PR19 only after its current exact-head terminal checks succeed. No merge/deploy, PR18 mutation or new milestone.
