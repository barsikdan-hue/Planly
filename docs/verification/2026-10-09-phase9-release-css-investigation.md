# Phase 9 release CSS investigation

STATUS: DIAGNOSTIC_PR / RENDER_LOSS_ROOT_CAUSE_NOT_PROVEN

Production remains `5a321c99ad7130c1a9d8ec890e496a8304a458a7` (Render deploy `dep-db4ab2rncjis73cc1e50`, LIVE). No merge/deploy/env/infra/provider actions in this investigation.

## Reproduced evidence

- Render checkout and build checker report the correct source SHA256: `64b5bd607270b83d4bf3da8f5cea1c8d1519b222fc46a0a39978486cfa393ef0`. Git's LF blob matches; checkout CRLF normalization explains a different local raw-file hash.
- Fresh production HTML links `/_next/static/chunks/2m-l5ei9cku9k.css`. Repeated independent no-cache HTTPS fetch: HTTP 200, 199386 bytes, SHA256 `1aa82fb68d2423ae212b240496a706cd4667f3edcad085bfa469e26bfda9a9dc`, zero `.scheduling-` occurrences.
- Authenticated production desktop: `.scheduling-plan` and `.scheduling-settings` computed `display:block`. Phase 9 component exists, but required styles are missing.
- Main Self-host run [37905056323](https://github.com/barsikdan-hue/Planly/actions/runs/37905056323) packaged the correct source and Next output. Artifact `11604306531`, archive digest `2d1f9dce111bbd56d20c5f486bb3921235ab564d48cfdd8bcffa81971c8180e0`, verified on download.
- Docker artifact CSS `2mon2c_vzimn7.css`: 200977 bytes, SHA256 `b9671e3e5ebf8a8159852479b565412d9373e557b5e185f95cbfb9bc109bd657`, 26 scheduling-selector references. That known asset returns HTTP 404 on production.
- Controlled Next 16.3.4 build with pre-Phase-9 CSS from `a2187cd1531e595816a044691ae76ee7930e1162` emits the exact production filename, bytes and SHA256. Production therefore serves output equivalent to processing the old CSS.
- Updating CSS with a retained build cache locally emits correct Phase 9. Restoring the old cache into a new `.next` also emits correct Phase 9. Local support evidence: Windows, Node 24.21; explicit sandbox Turbopack root avoids an existing external dependency junction. This is not proof of Render's cache behavior.

## What is and is not proven

**Proven acceptance defect:** `scripts/verify-analytics-build.mjs` accepts the actual stale CSS fixture, despite the correct current source hash, because `checks` originally covers only analytics. Before change: exit 0 / `ANALYTICS_CSS_OK`. After contract extension: exit 1 / scheduling checks false, analytics checks still true. Targeted RED was observed before implementation.

**Underlying Render loss cause: NOT PROVEN.** Evidence brackets the loss between correct source and production stylesheet. It does not yet distinguish Next compilation/manifest output from subsequent Render packaging/delivery. No compiler/cache configuration change is justified by the local experiments.

Next runtime generates stylesheet hrefs from the root client-reference manifest. Its build normally cleans output except cache/dev/lock/trace; simple leftover static files are insufficient to explain the result.

The existing Render free service has no Shell/SSH access; the connector exposes no build-artifact/file download. See [Render shell compatibility](https://render.com/docs/ssh). No plan change or new service was requested.

## Scoped diagnostic change

- Retain the existing analytics/path/orphan/comment checks; add Phase 9 layout, readable full text, image/video, wrapping buttons and mobile media-rule declarations from emitted root stylesheets.
- Print only public asset paths, byte counts, SHA256 and check booleans, alongside the existing source hash.
- Self-host HTTP smoke validates the actual stylesheet links fetched from authenticated HTML after Docker packaging, using the same AST contract.
- Linux CI compares old CSS, current CSS after restoring an old build cache, and a fresh current build. It does not alter production build/runtime configuration.
- No CSS source, scheduling component/logic, API, DB, Docker package contract, environment or hosting settings changed.

## Verification ledger

- Targeted build-check tests: 16/16 PASS.
- Exact stale production CSS fixture: correctly rejected by the new checker.
- Local typecheck: PASS. Full suite / lint / exact-head CI / Self-host / built-CSS browser evidence are pending at this checkpoint.
- Initial local suite without the stopped test DB was aborted and is not counted as PASS; isolated test fixture was started before the verified run.

## Next decisive evidence / gate

If Linux does not reproduce the loss, capture these new diagnostic fields from an Owner-authorized Render build and compare with actual runtime HTML/CSS: source hash, root-linked stylesheet names/hashes, Phase 9 checks. Incorrect CSS at build exit proves a compiler boundary; correct CSS at build exit with incorrect runtime assets proves a later boundary.

This draft is not a proven fix for the stale production CSS. Do not mark READY_FOR_OWNER_MERGE_GATE until the actual loss cause and intended release path are resolved. No diagnostic deployment is authorized by the current task.
