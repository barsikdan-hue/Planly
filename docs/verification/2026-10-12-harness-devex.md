# Planly Harness / DevEx verification — 2026-10-12

Status: IMPLEMENTED / FINAL VERIFICATION PENDING. This report records the approved process modernization and isolated browser pilot. Local verification is not production acceptance. Final commit, exact-HEAD CI and PR evidence must be filled after the final rerun; pending fields are not PASS.

## Authority and scope

- Repository: `barsikdan-hue/Planly`; task checkout `work/Planly-harness-devex`; branch `codex/harness-devex`.
- Inspected main/source baseline: `da9a2e89cc37119e87952ac56fcf86a1383de3f7`. Final branch HEAD: PENDING.
- Render existing production deploy `dep-db4d2q67bikc73ebm1r0` reports the same SHA. This is deployment metadata, not fresh provider acceptance.
- Baseline GitHub [CI run 37924530453](https://github.com/barsikdan-hue/Planly/actions/runs/37924530453) and [Self-host run 37924530540](https://github.com/barsikdan-hue/Planly/actions/runs/37924530540): SUCCESS. Branch CI: PENDING; PR: PENDING.
- Owner [master contract](../harness/2026-10-12-owner-master-contract.md): SHA256 `B729E0302A708CF09F3C391062AECD73000F373E81F7345F6E64AE759ED63A05`. Its approval permits trusted free tool installation, scoped DevEx changes, tests and PR; it does not authorize merge/deploy or production mutation.
- Existing owner/account/auth, Telegram/MAX, credentials, Scheduler, production content and infrastructure are outside the changes. VK/Instagram and Telegram analytics remain HOLD; AI-editor is separate.

## Installed and verified inventory

Profile installation and repository dependencies are distinct operations. Existing working installations were retained.

| Tool | Verified state / version | Concrete evidence and boundary |
|---|---|---|
| Superpowers | Existing `6.4.2` | Bootstrap and relevant skills readable; applied debugging, proportionate planning, verification and independent review. No reinstall. |
| Build Web Apps | Installed `0.1.2` | Official plugin skills readable; frontend testing used for the isolated real UI pilot. React/shadcn guidance available. No Stripe, Supabase migration or new product framework. |
| OpenAI Developers | Installed `1.3.6` | Official plugin skills readable. No API key creation or inference. |
| Official Docs MCP | Working, server `1.0.0` | Real initialize and tools/list (5 tools); documentation search returned HTTP 200. This proves Docs access, not paid API execution. |
| Browser | Existing `26.1007.21434`, working | Actual PlannerApp calendar rendered in browser, screenshot captured and error logs inspected without errors. This is isolated UI evidence, not production evidence. |
| Codex Code Review | Existing `26.1007.21434`, available | Independent read-only Critic performed diff review. Account auto-review configuration is UNVERIFIED; no assertion that GitHub auto-review is enabled. |
| GitHub connector | Working read access | Actual main, PR and CI sources inspected. Baseline runs linked above; exact final branch checks remain PENDING. |
| GitHub CLI | Installed `2.102.0` | Official portable binary; `gh --version` succeeds. No authentication, PATH or global access-policy changes. |
| GitHub Agentic Workflows | Installed pinned `0.89.21` | `gh aw version`, help and compile help succeed. Strict local no-emit validation returned valid=true, errors=[], warnings=[], exit 0. No engine/workflow activation. |
| Playwright MCP | Installed pinned `0.0.83` | Version/help, actual MCP initialize/tools/list (25 tools), isolated headless Edge navigation to `https://example.com` returned title Example Domain. Browser closed and server exited 0. |
| Playwright Test | Repository dependency `1.63.0` | Locked version; Chromium build `1243`. Latest `1.64.0` rejected by existing `minimumReleaseAge=10080`; that policy was preserved. Final verification PENDING. |
| Render | Existing read-only connector | Deployed SHA/deploy metadata inspected; no deploy/env/service action. |
| Cloudflare/R2 | NOT_APPLICABLE for this pilot | No media/storage investigation or mutation was required. No bucket/credentials/publicity changes. |
| Goals / subagents / worktrees | Environment capabilities | Independent research and read-only Critic used under existing delegation rules. No global hooks added. |

GitHub CLI executable: `C:/Users/EliteSochi/.codex/tools/gh-2.102.0/bin/gh.exe`. Downloaded official Windows amd64 ZIP SHA256 `ae64e556ecc240b200f7eba60d550e4bb60d78e860e69dd88c449405b86067f4`, verified against both GitHub Release API digest and published checksum file. [Release 2.102.0](https://github.com/cli/cli/releases/tag/v2.102.0) fixes four published security issues.

gh-aw standalone: `C:/Users/EliteSochi/.codex/tools/gh-aw-0.89.21/gh-aw.exe`; standard user extension: `C:/Users/EliteSochi/AppData/Local/GitHub CLI/extensions/gh-aw/gh-aw.exe`. Extension manifest records owner `github`, tag `v0.89.21`, `ispinned: true`. Both binaries SHA256 `91b1f322d17daffde2f7a81b83bc8ca61cb9c09768a369776bd6d62346aa250c`, verified against official release digest/checksums. [Release source](https://github.com/github/gh-aw/releases/tag/v0.89.21). `gh extension list` requires account authentication in this environment; direct extension version/help and local manifest/hash proved installation without authentication.

Playwright MCP installed with `npm.cmd install --prefix C:/Users/EliteSochi/.codex/tools/playwright-mcp --ignore-scripts --no-audit --no-fund --save-exact @playwright/mcp@0.0.83`. Three packages installed in 17 seconds. Lock resolves `https://registry.npmjs.org/@playwright/mcp/-/mcp-0.0.83.tgz`, integrity `sha512-oNcl+Ae2/IAjhfPeP46BfIkSakfmprY+aOtkv5MjrQ4lPav4/yNtPhL0iq8SlIM90oApWgBDUxaNKvktazUKOg==`; runtime reports Playwright `1.64.0-alpha-1790635538000`. This MCP transitive runtime is separate from repository Playwright Test `1.63.0`.

Verified MCP launch: `C:/Program Files/nodejs/node.exe`, arguments `C:/Users/EliteSochi/.codex/tools/playwright-mcp/node_modules/@playwright/mcp/cli.js --headless --isolated --browser msedge --block-service-workers`. No shared user profile, HTTPS-error bypass, unrestricted file access or security-host disabling. MCP protocol initialize `2024-11-05` succeeded; navigation and close used the advertised tool schemas. [Official MCP repository](https://github.com/microsoft/playwright-mcp).

## Permanent routing and autonomous repair

`AGENTS.md` now points to [tool routing and autonomous repair](../harness/tool-routing-contract.md). For every task it requires TASK → GOAL → EXISTING IMPLEMENTATION → RISK → SELECTED TOOLS/SKILLS → exact job → evidence → tests → fallback → human gate, including Trigger/Scope/Action/Deliverable/Boundary/Fallback per chosen tool. The document checks distinct UI, CI and API examples; unused tools remain NOT_APPLICABLE.

The approved loop is reproduce → prove root cause → regression RED → minimal repair → GREEN/relevant checks → independent read-only review → exact-HEAD revalidation. Unclear failures require official docs/changelog/upstream Issues research and explicit applicability classification. A technical failure alone does not require Owner intervention; secrets, costs, production mutation, product/architecture expansion, merge/deploy and provider publications retain gates.

[CI Failure Doctor](../harness/ci-failure-doctor-draft.md) is inactive documentation. Its proposed admission controls deduplicate repository/workflow/HEAD/job/normalized-signature fingerprints, serialize outputs, cap one inference per fingerprint and three investigations/day, and bound logs, timeout and output size. The agent has read permissions; future diagnostic publication uses reviewed mediated safe outputs. No generated lock, trigger, inference, new credential or cloud engine was activated. Current authorized cloud inference budget is zero.

The contract's original upstream CI Doctor file is now 404; [official gallery](https://github.github.com/gh-aw/gallery/ci-failure-investigation/) points to `githubnext/agentics/ci-doctor`. [Safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/) and [published advisories](https://github.com/github/gh-aw/security/advisories) were researched. The HTTPS allowlist advisory contains contradictory affected/patched fields for `0.89.17`; latest CLI installation alone does not prove generated runtime/firewall safety. Before any future activation review compiled pins, permissions, network, engine credentials, billing and Actions usage. Compiler explicitly notes token-based Copilot inference requires centralized organization billing; it was not enabled.

## Bounded real UI pilot and review

The pilot renders the existing PlannerApp through an isolated test entry, using synthetic API fixtures. Browser tests cover three scenarios at desktop `1366×768` and mobile `390×844`:

1. Calendar navigation and actual day/week/month controls, period change, grid contents and page overflow.
2. Unsaved synthetic draft preview and recovery after explicit reload, without saving or sending.
3. Controlled bootstrap HTTP 503, visible failure state and recovery after explicit reload; exactly two bootstrap requests.

Fixtures guard API writes, remote requests and WebSockets. Synthetic owner/content data is used; no production auth/data/provider sends are involved. Screenshots support the UI evidence. Independent Critic identified a guard bypass and weak navigation assertions; those findings were repaired before revalidation. Review is evidence about the diff, not a substitute for tests/CI.

## Verification ledger

| Check | Observed result | Final status |
|---|---|---|
| Local browser pilot, initial successful run | 6 PASS, 1.8 minutes | Final rerun PENDING |
| Typecheck | PASS before final dependency reinstall | Final rerun PENDING |
| Lint | 0 errors, 15 baseline warnings | Final rerun PENDING |
| Dependency/schema drift check | No drift observed | Final check PENDING |
| Local broad tests | 762 total: 748 PASS, 14 FAIL; 13 require missing DATABASE_URL, 1 Windows file-URL/path case | Not full PASS; baseline test unchanged |
| Next production build | Failed with external dependency-junction/root resolution; isolated frozen dependency reinstall in progress | PENDING |
| Native GitHub baseline CI / Self-host | Both SUCCESS at inspected baseline | Branch exact-HEAD CI PENDING |
| Production / provider acceptance | No release or live-send test performed | NOT_RUN / owner gated |

Baseline measured local test selection took **673.5 seconds**; this was not the full native CI suite. There is no comparable completed before/after benchmark, so no percentage speedup is claimed. Ordinary permitted repair iterations required **zero additional Owner questions**. Installation timing is not a product-performance benchmark.

## External diagnosis applicability and limits

- Node Windows file URL versus filesystem path: APPLICABLE to the observed Windows test failure; use the official [fileURLToPath contract](https://nodejs.org/api/url.html#urlfileurltopathurl-options). The existing baseline test is not silently fixed or weakened in this DevEx pilot.
- Next.js root/dependency resolution: APPLICABLE to observed external junction/root build failure; inspect official [Next.js configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js) and reproduce with isolated frozen dependencies. Successful final build remains PENDING.
- Similar pnpm upstream issue reports: UNVERIFIED as a causal explanation for local metadata timeouts. Exact logs/version and isolation evidence take precedence; no release-age/security weakening or invented upstream root cause.

No new paid resource, API inference, production modification, publication, merge or deploy occurred. Installation does not prove account auto-review eligibility or free cloud AI execution. Next safe action is finish isolated final checks, obtain exact branch HEAD CI/Self-host evidence and attach the scoped DevEx PR. Owner approval is required for merge/deploy and separately for cloud engine credentials/permissions/cost activation. Do not begin held product milestones under this process task.
