# Planly Harness / DevEx verification — 2026-10-12

Status: IMPLEMENTED / LOCAL AND IMPLEMENTATION-HEAD CI VERIFIED / OWNER REVIEW GATE. This report records the approved process modernization and isolated browser pilot. Local verification is not production acceptance. Evidence below refers to the reviewed implementation HEAD; checks for a subsequent documentation-only HEAD are tracked by the live PR checks and PR body, avoiding a self-referential report commit SHA.

## Authority and scope

- Repository: `barsikdan-hue/Planly`; task checkout `work/Planly-harness-devex`; branch `codex/harness-devex`.
- Inspected main/source baseline: `da9a2e89cc37119e87952ac56fcf86a1383de3f7`. Reviewed implementation HEAD: `06ec26c09ac9b6a48968d2a14feba0d8c8d8840b`.
- Render existing production deploy `dep-db4d2q67bikc73ebm1r0` reports the same SHA. This is deployment metadata, not fresh provider acceptance.
- Baseline GitHub [CI run 37924530453](https://github.com/barsikdan-hue/Planly/actions/runs/37924530453) and [Self-host run 37924530540](https://github.com/barsikdan-hue/Planly/actions/runs/37924530540): SUCCESS. Implementation [Self-host run 38239526313](https://github.com/barsikdan-hue/Planly/actions/runs/38239526313): SUCCESS. Implementation [CI run 38239526429](https://github.com/barsikdan-hue/Planly/actions/runs/38239526429): SUCCESS, including tests/build/E2E. [PR #39](https://github.com/barsikdan-hue/Planly/pull/39).
- Owner [master contract](../harness/2026-10-12-owner-master-contract.md): SHA256 `B729E0302A708CF09F3C391062AECD73000F373E81F7345F6E64AE759ED63A05`. Its approval permits trusted free tool installation, scoped DevEx changes, tests and PR; it does not authorize merge/deploy or production mutation.
- Existing owner/account/auth, Telegram/MAX, credentials, Scheduler, production content and infrastructure are outside the changes. VK/Instagram and Telegram analytics remain HOLD; AI-editor is separate.

Exact-source mapping: Code Review connector returned `headRevision=06ec26c09ac9b6a48968d2a14feba0d8c8d8840b` and check metadata identifies that PR head. Native CI checkout log shows synthetic merge revision `8740abd`, merging this implementation HEAD into baseline main `da9a2e89`; the full synthetic SHA was not read and is not invented here. This distinguishes the reviewed branch SHA from GitHub's tested merge ref.

Native [browser evidence artifact 11742136888](https://github.com/barsikdan-hue/Planly/actions/runs/38239526429/artifacts/11742136888): 602664 bytes, SHA256 `c49cd87e8cc52cdbbb187e6a58645c3cf3618b87d743c541185baf7106b44530`, expires 2026-10-19. Retention expiry limits future artifact access; source/check links remain the authoritative run references.

## Installed and verified inventory

Profile installation and repository dependencies are distinct operations. Existing working installations were retained.

| Tool | Verified state / version | Concrete evidence and boundary |
|---|---|---|
| Superpowers | Existing `6.4.2` | Bootstrap and relevant skills readable; applied debugging, proportionate planning, verification and independent review. No reinstall. |
| Build Web Apps | Installed `0.1.2` | Official plugin skills readable; frontend testing used for the isolated real UI pilot. React/shadcn guidance available. No Stripe, Supabase migration or new product framework. |
| OpenAI Developers | Installed `1.3.6` | Official plugin skills readable. No API key creation or inference. |
| Official Docs MCP | Working, server `1.0.0` | Real initialize and tools/list (5 tools); documentation search returned HTTP 200. This proves Docs access, not paid API execution. |
| Browser | Existing `26.1007.21434`, working | Actual PlannerApp calendar rendered in browser, screenshot captured and error logs inspected without errors. This is isolated UI evidence, not production evidence. |
| Codex Code Review | Existing `26.1007.21434`, available | Connector checks for PR #39 returned the exact implementation HEAD successfully. Independent read-only Critic separately performed diff review; this is not a claim that the plugin reviewed the code. Account auto-review configuration is UNVERIFIED. |
| GitHub connector | Working read access | Actual main, PR and CI sources inspected; baseline and implementation runs linked above. Subsequent docs-only final HEAD checks belong in PR evidence. |
| GitHub CLI | Installed `2.102.0` | Official portable binary; `gh --version` succeeds. No authentication, PATH or global access-policy changes. |
| GitHub Agentic Workflows | Installed pinned `0.89.21` | `gh aw version`, help and compile help succeed. Strict local no-emit validation returned valid=true, errors=[], warnings=[], exit 0. No engine/workflow activation. |
| Playwright MCP | Installed pinned `0.0.83` | Version/help, actual MCP initialize/tools/list (25 tools), isolated headless Edge navigation to `https://example.com` returned title Example Domain. Browser closed and server exited 0. |
| Playwright Test | Repository dependency `1.63.0`, working | Locked version; Chromium build `1243`; final local E2E 6 PASS. Latest `1.64.0` rejected by existing `minimumReleaseAge=10080`; that policy was preserved. |
| Render | Existing read-only connector | Deployed SHA/deploy metadata inspected; no deploy/env/service action. |
| Cloudflare/R2 | NOT_APPLICABLE for this pilot | No media/storage investigation or mutation was required. No bucket/credentials/publicity changes. |
| Goals / subagents / worktrees / hooks | Environment capabilities | Stable Goals supported and current goal actually used; independent research and read-only Critic used under existing delegation rules. Hooks available but not configured; no global interception added. |

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

Fixtures guard API writes, remote requests and WebSockets. Synthetic owner/content data is used; no production auth/data/provider sends are involved. Screenshots support the UI evidence. Independent Critic identified a guard bypass and weak navigation assertions; those findings were repaired before revalidation. Final independent Critic found no remaining actionable findings. Review is evidence about the diff, not a substitute for tests/CI.

## Verification ledger

| Check | Observed result | Final status |
|---|---|---|
| Local browser pilot | Initial 6 PASS, 1.8 minutes; final after WebSocket guard 6 PASS, 1.1 minutes | PASS |
| Typecheck | Fresh final local run after isolated dependency reinstall | PASS |
| Lint | Final local run: 0 errors, 15 baseline warnings | PASS |
| Isolated frozen dependency install | 672 packages, 669 reused, 3 downloaded, 1 minute 15.2 seconds | PASS; exact frozen lock retained |
| Dependency/schema drift check | No drift observed | PASS within inspected scope |
| Local broad tests | 762 total: 748 PASS, 14 FAIL; 13 require missing DATABASE_URL, 1 Windows file-URL/path case | Not full PASS; baseline test unchanged |
| Next production build | Initial external dependency-junction/root failure resolved by isolated frozen install; fresh compile 3.3 minutes, TypeScript stage 4.4 minutes; CSS guard ANALYTICS_CSS_OK | PASS |
| Native GitHub implementation Self-host | HTTP/media/worker/recovery checks PASS at reviewed implementation HEAD; live provider step skipped | SUCCESS |
| Native GitHub implementation CI | 1038 tests: 1038 PASS, 0 FAIL, 0 skipped, 135010.41027 ms; E2E 6 PASS, 11.2 seconds; build/CSS diagnostics/artifact steps successful | SUCCESS |
| Diff whitespace check | Other diff checks clean; original owner contract trailing Markdown spaces intentionally excluded to preserve exact approved byte copy | PASS within stated scope |
| Production / provider acceptance | No release or live-send test performed | NOT_RUN / owner gated |

One E2E attempt started concurrently with the production build hit the unchanged 60000 ms webServer startup timeout before Vite output. A subsequent sequential launch passed with the same configuration, timeout and assertions. The observations are consistent with resource competition; a controlled causal/performance benchmark was not performed, so resource competition is not claimed as proven root cause.

Baseline measured local test selection took **673.5 seconds**; this was not the full native CI suite. There is no comparable completed before/after benchmark, so no percentage speedup is claimed. Ordinary permitted repair iterations required **zero additional Owner questions**. Installation timing is not a product-performance benchmark.

## External diagnosis applicability and limits

- Node Windows file URL versus filesystem path: APPLICABLE to the observed Windows test failure; use the official [fileURLToPath contract](https://nodejs.org/api/url.html#urlfileurltopathurl-options). The existing baseline test is not silently fixed or weakened in this DevEx pilot.
- Next.js root/dependency resolution: APPLICABLE to observed external junction/root build failure; inspect official [Next.js configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js). Isolated frozen dependencies produced a successful final build.
- pnpm upstream [issue #12883](https://github.com/pnpm/pnpm/issues/12883) and [issue #11597](https://github.com/pnpm/pnpm/issues/11597): UNVERIFIED as causal explanations for local metadata timeouts. Exact logs/version and isolation evidence take precedence; no release-age/security weakening or invented upstream root cause.

Account auto-review setup remains Owner-only: follow the freshly checked [official GitHub review setup](https://developers.openai.com/codex/integrations/github), open Codex settings, choose `barsikdan-hue/Planly`, and configure Automatic review under Review code. Personal preferences also has Automatic review and Review trigger. Verify current eligibility and included usage/cost before enabling. No `@codex review` inference cost or automatic-review activation is assumed from connector availability.

No new paid resource, API inference, production modification, publication, merge or deploy occurred. Installation does not prove account auto-review eligibility or free cloud AI execution. Verify the exact final documentation HEAD through live checks on [PR #39](https://github.com/barsikdan-hue/Planly/pull/39); the next safe human action is Owner review of that PR under the merge gate. Owner approval is required for merge/deploy and separately for cloud engine credentials/permissions/cost activation. Do not begin a new product phase or held milestone under this process task.

The earlier authorized read-only Swipe Planner audit can next use this fixture/browser routing to reproduce the existing findings from PR #38 without user content or publications. Any UI fix remains a separate scoped PR after its milestone is approved; it is not started here.
