# PR32 build contract and CSS review fixes

Owner explicitly authorized these two corrections without merge/deploy on 2026-10-08. Starting exact head: `273a155814d0caf228b5987694215bed29abf972`; base/current production: `20caf582d2734ec063db4a52f8505a94f149cd19`. Branch: `codex/analytics-production-fixes`; checkout was clean. This report supplements the previous evidence without changing its historical results.

## Proven blockers and minimal corrections

Native CI 37805675582 failed at `verify / Test`: 974/975 passed, one failure, zero cancelled/skipped. `tests/runtime-config.test.mjs:9` expected exactly `next build`, while the proposed package command included the required post-build CSS diagnostic. The Owner approved aligning this contract. The assertion remains strict equality against the complete `next build && node scripts/verify-analytics-build.mjs` command; no substring check, skip or assertion removal. Other runtime-script assertions and the package command remain unchanged.

Independent review reproduced a false success in the supported static HTML branch: a stylesheet link inside an HTML comment connected otherwise orphaned CSS according to the raw link regex. A new multiline/multiple-comment fixture first failed with exit 0 instead of expected exit 1. The scanner now removes closed HTML comments before discovering links. The regression requires rejection, zero stylesheets read and all checks false. Existing real static links and dynamic-root manifest acceptance remain covered.

## Fresh verification

- Local runtime contract before correction: 0/1 PASS, reproduced the exact command conflict.
- CSS fixtures after adding the regression, before implementation: 5/6 PASS, one intended failure on the commented link.
- After corrections, focused runtime/build/MAX identity/reader/contracts/link/connector tests: 42/42 PASS on local Node24.21.0; no skips/cancellations.
- Local typecheck, focused lint and diff check PASS; generated tsbuildinfo restored.
- Final exact-head native Node22.13.0 CI and Self-host results are required separately and recorded in the PR body/checks. Local results are not their substitute.

The CSS diagnostic proves declaration presence in the inspected route-connected assets, not computed layout, CSS cascade or visual acceptance. It does not prove or repair the unexplained Render CSS delivery difference. Real MAX metrics/provider acceptance and production visual acceptance remain unproven. No provider calls, VK changes, env/secrets/cache changes, merge or deploy were performed. Release remains behind a new explicit Owner gate.
