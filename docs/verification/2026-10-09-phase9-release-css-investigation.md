# Phase 9 release CSS investigation

STATUS: VERIFICATION_GUARDRAIL / HISTORICAL_RENDER_ROOT_CAUSE_NOT_PROVEN

Owner authorized one diagnostic Render build of unmerged PR #35 head `57dc00defdedbbaaec83954d5564d0f6e8acec2f`. Deploy `dep-db4beju7bikc73e6vhl0` became LIVE on 2026-10-09 at 09:45:48.903323 UTC; health returned HTTP 200. The diagnostic rebuild now serves correct Phase 9 CSS. Main remains `5a321c99ad7130c1a9d8ec890e496a8304a458a7`, so main and production are temporarily divergent. This report-only update does not authorize another merge/deploy.

PR #35 is a verification/guardrail change, not a root-cause fix. Historical stale Render CSS cause remains UNKNOWN / NOT REPRODUCED. No speculative cache/compiler/runtime fix was added or is justified by this evidence.

## Historical reproduced evidence before the diagnostic rebuild

- Render checkout and build checker report the correct source SHA256: `64b5bd607270b83d4bf3da8f5cea1c8d1519b222fc46a0a39978486cfa393ef0`. Git's LF blob matches; checkout CRLF normalization explains a different local raw-file hash.
- Fresh production HTML links `/_next/static/chunks/2m-l5ei9cku9k.css`. Repeated independent no-cache HTTPS fetch: HTTP 200, 199386 bytes, SHA256 `1aa82fb68d2423ae212b240496a706cd4667f3edcad085bfa469e26bfda9a9dc`, zero `.scheduling-` occurrences.
- Authenticated production desktop: `.scheduling-plan` and `.scheduling-settings` computed `display:block`. Phase 9 component exists, but required styles are missing.
- Main Self-host run [37905056323](https://github.com/barsikdan-hue/Planly/actions/runs/37905056323) packaged the correct source and Next output. Artifact `11604306531`, archive digest `2d1f9dce111bbd56d20c5f486bb3921235ab564d48cfdd8bcffa81971c8180e0`, verified on download.
- Docker artifact CSS `2mon2c_vzimn7.css`: 200977 bytes, SHA256 `b9671e3e5ebf8a8159852479b565412d9373e557b5e185f95cbfb9bc109bd657`, 26 scheduling-selector references. That known asset returned HTTP 404 on the old production deployment.
- Controlled Next 16.3.4 build with pre-Phase-9 CSS from `a2187cd1531e595816a044691ae76ee7930e1162` emits the exact production filename, bytes and SHA256. Production therefore serves output equivalent to processing the old CSS.
- Updating CSS with a retained build cache locally emits correct Phase 9. Restoring the old cache into a new `.next` also emits correct Phase 9. Local support evidence: Windows, Node 24.21; explicit sandbox Turbopack root avoids an existing external dependency junction. This is not proof of Render's cache behavior.

## Real Render build and runtime evidence

- Exact build/LIVE commit: `57dc00defdedbbaaec83954d5564d0f6e8acec2f`; deploy `dep-db4beju7bikc73e6vhl0`, manually selecting this commit without merging PR #35.
- Render logged cache download and exact commit checkout. Cache was not cleared; env, service configuration, build/start commands and infrastructure were not changed.
- Build-exit diagnostic at 09:44:24.520087535 UTC: `ANALYTICS_CSS_OK`; source CSS SHA256 `64b5bd607270b83d4bf3da8f5cea1c8d1519b222fc46a0a39978486cfa393ef0`. Source CSS is unchanged between main and this head.
- Root-linked build asset: `/_next/static/chunks/2mon2c_vzimn7.css`, 200977 bytes, SHA256 `b9671e3e5ebf8a8159852479b565412d9373e557b5e185f95cbfb9bc109bd657`.
- After LIVE, the real authenticated Owner HTML links the same asset. Independent no-cache HTTP fetch at 09:47:13.123 UTC returned HTTP 200, 200977 bytes and the identical SHA256. No session cookie or secret was exported.
- Build and HTTP-runtime checks all passed: 10 Phase 9 checks (`schedulingLayout`, `schedulingSettings`, `schedulingDiscovery`, `schedulingReview`, `schedulingText`, `schedulingImage`, `schedulingVideo`, `schedulingButtons`, `schedulingMobileHeading`, `schedulingMobileSettings`) and the original 3 analytics checks.
- The candidate asset returned 404 at 09:45:18, before the new deploy became LIVE. That transition-period response is not evidence of packaging/delivery loss.
- `FAILING_BOUNDARY = NOT_REPRODUCED`; historical BUILD versus PACKAGING/DELIVERY remains unresolved. Correct output after a rebuild does not prove the mechanism that produced the historical stale output.
- Exactly one diagnostic build/deploy was performed. No second deploy, merge, provider publication or speculative fix followed. This proves the CSS artifact contract, not full scheduling/provider acceptance.

## What is and is not proven

**Proven acceptance defect:** `scripts/verify-analytics-build.mjs` accepts the actual stale CSS fixture, despite the correct current source hash, because `checks` originally covers only analytics. Before change: exit 0 / `ANALYTICS_CSS_OK`. After contract extension: exit 1 / scheduling checks false, analytics checks still true. Targeted RED was observed before implementation.

**Historical Render loss cause: NOT PROVEN.** Historical evidence brackets the loss between correct source and production stylesheet. The new diagnostic build and runtime agree and do not reproduce that loss. These observations cannot distinguish historical Next compilation/manifest output from subsequent packaging/delivery or prove a cache mechanism. No cache/compiler/runtime change is justified.

Next runtime generates stylesheet hrefs from the root client-reference manifest. Its build normally cleans output except cache/dev/lock/trace; simple leftover static files are insufficient to explain the result.

The existing Render free service has no Shell/SSH access; the connector exposes no build-artifact/file download. See [Render shell compatibility](https://render.com/docs/ssh). No plan change or new service was requested.

## Scoped diagnostic change

- Retain the existing analytics/path/orphan/comment checks; add Phase 9 layout, readable full text, image/video, wrapping buttons and mobile media-rule declarations from emitted root stylesheets.
- Print only public asset paths, byte counts, SHA256 and check booleans, alongside the existing source hash.
- Self-host HTTP smoke validates the actual stylesheet links fetched from authenticated HTML after Docker packaging, using the same AST contract.
- Linux CI compares old CSS, current CSS after restoring an old build cache, and a fresh current build. It does not alter production build/runtime configuration.
- No CSS source, scheduling component/logic, API, DB, Docker package contract, environment or hosting settings changed.

## Verification ledger by exact scope

- Targeted build-check tests: 16/16 PASS.
- Exact stale production CSS fixture: correctly rejected by the new checker.
- Previous implementation head `57dc00d`: [CI 37910381489](https://github.com/barsikdan-hue/Planly/actions/runs/37910381489) SUCCESS, 1038/1038 tests with no failed/cancelled/skipped tests; canonical migration drift, typecheck, lint, build and isolated Linux cache diagnostic passed. [Self-host 37910381474](https://github.com/barsikdan-hue/Planly/actions/runs/37910381474) SUCCESS; built/served CSS contract passed. Optional real Telegram job skipped by its publication gate.
- Tested PR merge ref `345234f394eada560fca02efccdf13339cb29cea` had an identical tree to implementation head `57dc00d` and base `5a321c9`.
- Previous isolated browser verification using the downloaded Self-host CSS artifact passed desktop 1366x768 and mobile 390x844. This was supporting fixture evidence, not production scheduling acceptance.
- Local typecheck passed. Local full suite was 1030/1038: seven unavailable-Redis failures and one pre-existing Windows URL-path test failure in unchanged files; canonical Linux suite passed all tests. No tests were weakened or unrelated fixes added.
- Initial local suite without the stopped test DB was aborted and is not counted as PASS; isolated test fixture was started before the verified run.
- New report-only head must receive fresh CI and Self-host SUCCESS before draft removal. Prior-head results alone do not satisfy that gate; final exact-head links/status belong in the PR description after completion.

## Owner merge/deploy gate and required post-deploy verification

Owner now approves finalizing PR #35 as a verification/guardrail change despite the historical root cause remaining unknown. Update only this report and PR description; run exact-head CI and Self-host. If both succeed, remove draft and return `READY_FOR_OWNER_MERGE_GATE`. Do not merge/deploy in this task. No cache/compiler/runtime/CSS/scheduling/env/infra changes are authorized.

Required Owner command: `Подтверждаю merge PR #35 + production deploy`.

After a future approved merge/deploy, require all of the following before production release acceptance:

- Exact merge SHA is LIVE in Render.
- `/api/health` returns HTTP 200.
- Build CSS contract passes for the deployed SHA.
- Real runtime HTML-linked HTTP CSS contract passes.
- Build/runtime asset paths and SHA256 match.

The diagnostic unmerged-head deployment cannot substitute for verification of that future merge SHA. Do not perform provider publications as part of this guardrail release.
