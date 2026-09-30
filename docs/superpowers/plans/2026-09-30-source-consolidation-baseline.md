# Planly Source Consolidation Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the existing local Planly source into `barsikdan-hue/Planly` without redesigning or rewriting it, then produce a verified runnable baseline that future MVP work can safely build on.

**Architecture:** This milestone does not add backend, database, scheduler, providers, AI, or new UI. The existing local project at `C:\Users\EliteSochi\Documents\ChatGPT\SMM Planer` is treated as the authoritative source-code candidate; the active ChatGPT Site is a visual/behavioral reference only because Site projection bytes are not exportable here. The result is a clean Git baseline plus explicit evidence of what builds, what tests pass, what fails, and what still uses demo/localStorage behavior.

**Tech Stack:** Existing project stack only; Windows/PowerShell for source consolidation; Node.js/package manager exactly as detected from the imported project; Git/GitHub.

**Spec:** `docs/superpowers/specs/2026-09-30-mvp-v1-design.md`

## Global Constraints

- Do not rewrite the project from scratch.
- Do not redesign the existing UI.
- Do not add PostgreSQL, Redis, BullMQ, Telegram, MAX, OpenAI, Cloudflare R2, Playwright, or any other MVP dependency in this milestone.
- Do not mix bugfixes, refactoring, or new features into source consolidation.
- Preserve existing filenames and behavior unless a change is strictly required to make the imported baseline build/run.
- Never commit `.env`, API keys, access tokens, refresh tokens, passwords, private keys, cookies, or local secrets.
- Exclude generated/runtime directories such as `node_modules`, `.next`, `dist`, `out`, coverage output, local caches, and editor metadata unless an existing project file proves one is intentionally versioned.
- Do not trust old `VERIFICATION.md` or previous audit claims as current proof. Re-run checks.
- If the imported project contains demo auth, localStorage persistence, demo social connections, or mock analytics, document them; do not “fix” them in this milestone.
- Existing UI is the reference baseline. ChatGPT Site is for comparison only, not a second codebase to reverse-engineer and merge blindly.

## Review Focus

1. **Secret leakage during import** — any `.env`, token, password, credential, private key, or copied local config must remain untracked and absent from Git history. Task 2 verifies this before commit.
2. **Generated artifacts mistaken for source** — `node_modules`, build output, caches, screenshots/traces and local runtime files must not enter the baseline commit. Task 2 verifies tracked-file scope.
3. **Wrong package manager or install command** — dependency installation must be selected from the actual lockfile/package metadata, not guessed from the old audit. Task 3 records the detected package manager before install.
4. **Baseline “fixed” by hidden feature work** — build failures may only receive the smallest source-consolidation fix required to reproduce the previous app; unrelated defects are recorded in `CURRENT_STATE.md`. Task 3 enforces this boundary.
5. **Visual drift from the existing product** — import must not silently replace the current Planly look/flow with a new scaffold. Task 4 compares the runnable app against the active Site reference and records differences instead of redesigning.

---

### Task 1: Inventory the Local Source Before Copying Anything

**Files:**
- Create: `docs/baseline/SOURCE_INVENTORY.md`
- Read-only source: `C:\Users\EliteSochi\Documents\ChatGPT\SMM Planer\**/*`
- Read-only reference: `docs/superpowers/specs/2026-09-30-mvp-v1-design.md`

**Interfaces:**
- Consumes: the known local Planly folder and approved MVP spec.
- Produces: `SOURCE_INVENTORY.md` containing the exact source root, detected package manager/lockfile candidates, top-level tree, known source files, test files, build scripts, env/example files, generated directories, and suspicious secret-bearing files that must not be copied.

- [ ] **Step 1: Verify the local source root exists**

Run in PowerShell:

```powershell
$Source = 'C:\Users\EliteSochi\Documents\ChatGPT\SMM Planer'
if (-not (Test-Path $Source)) { throw "Planly source not found: $Source" }
Get-Item $Source | Format-List FullName,LastWriteTime
```

Expected: the path exists and its resolved full path is recorded. If it does not exist, stop this milestone as `BLOCKED`; do not scaffold a replacement project.

- [ ] **Step 2: Capture the source tree and package metadata without modifying it**

Run:

```powershell
Get-ChildItem $Source -Force | Select-Object Mode,Length,LastWriteTime,Name
Get-ChildItem $Source -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.next\\|\\dist\\|\\out\\|\\coverage\\' } |
  Select-Object FullName,Length,LastWriteTime
Get-ChildItem $Source -File -Force -Include package.json,package-lock.json,pnpm-lock.yaml,yarn.lock,.npmrc,.nvmrc,.node-version
```

Expected: actual files are visible; no assumptions are made from the old audit.

- [ ] **Step 3: Inspect package scripts and existing tests**

Read the actual `package.json` and any discovered test/config files. Record verbatim script names for build, start/dev, lint, typecheck and test. Do not edit them.

- [ ] **Step 4: Identify files that must never be copied**

Search filenames first, without printing secret values:

```powershell
Get-ChildItem $Source -Recurse -File -Force |
  Where-Object {
    $_.Name -match '^\.env($|\.)|secret|credential|token|private.*key|\.pem$|\.p12$|\.pfx$'
  } |
  Select-Object FullName,Name,Length
```

Expected: suspicious paths are listed by filename only in working notes; secret contents are never pasted into `SOURCE_INVENTORY.md`.

- [ ] **Step 5: Write `docs/baseline/SOURCE_INVENTORY.md`**

Required sections:
- source root and timestamp;
- top-level tree;
- detected framework/runtime from actual files;
- detected package manager and lockfile;
- package scripts;
- source/test/config files;
- generated directories excluded from import;
- secret-bearing files excluded from import;
- discrepancies against the old audit, if any.

- [ ] **Step 6: Commit the inventory only**

```bash
git add docs/baseline/SOURCE_INVENTORY.md
git commit -m "docs: inventory existing Planly source"
```

Expected: no application source has been copied yet.

---

### Task 2: Import the Existing Source Without Secrets or Generated Output

**Files:**
- Create/Import: exact application files discovered in Task 1 from `C:\Users\EliteSochi\Documents\ChatGPT\SMM Planer`
- Preserve: `docs/superpowers/specs/2026-09-30-mvp-v1-design.md`
- Preserve: `docs/superpowers/plans/2026-09-30-source-consolidation-baseline.md`
- Modify only if required by the imported project: `.gitignore`

**Interfaces:**
- Consumes: Task 1 inventory and exclusion list.
- Produces: a source-for-source import of the existing Planly project in the repository root, with generated data and secrets excluded.

- [ ] **Step 1: Create a clean execution branch/worktree**

At execution time use `superpowers:using-git-worktrees` and create an isolated branch such as `feat/mvp-v1-baseline` from current `main`.

Expected: all import work happens outside the user’s unrelated working tree.

- [ ] **Step 2: Copy only source/config/assets that belong to the application**

Use the Task 1 inventory as the allow/deny source of truth. Do not blindly copy `.git`, `.env*`, `node_modules`, `.next`, `dist`, `out`, `coverage`, temp files, caches, editor folders, or machine-local credentials.

If using `robocopy`, perform a dry run first with `/L`, review it, then perform the real copy with the same exclusions.

- [ ] **Step 3: Preserve the existing package/lock files exactly**

Do not run dependency upgrades, formatters that rewrite lockfiles, framework migrations, `npm audit fix`, or package-manager conversion.

Expected: lockfile hash after copy matches the local source hash.

- [ ] **Step 4: Verify high-risk files are not tracked**

Run:

```bash
git status --short
git ls-files
```

Then verify tracked filenames contain none of:
- `.env` or `.env.*` except explicitly safe example templates such as `.env.example` with placeholder-only values;
- private keys/certificates;
- `node_modules`;
- `.next`, `dist`, `out`, `coverage`;
- local database files;
- browser/session exports.

Also run a secret scan available in the local environment. If no dedicated scanner exists, stop before commit and use at minimum a repository-wide pattern scan for common token/key assignments while excluding lockfiles and generated fixtures. Never echo matched secret values into logs shared externally.

- [ ] **Step 5: Verify source parity for the known previously-audited files**

If they still exist in the local source, confirm the repository contains the same versions of:
- `package.json`
- `README.md`
- `VERIFICATION.md`
- `app/page.tsx`
- `components/planner.tsx`
- `lib/planner.ts`
- `scripts/serve-static.mjs`
- `scripts/build-static.mjs`
- `scripts/planner.test.mjs`

If the current local source differs from that historical list, document the actual paths instead of recreating missing legacy files.

- [ ] **Step 6: Commit the source import**

```bash
git add -A
git diff --cached --check
git commit -m "chore: import existing Planly source baseline"
```

Expected: one reviewable import commit containing existing source only, not feature work.

---

### Task 3: Prove the Imported Baseline Builds and Runs

**Files:**
- Create: `docs/baseline/CURRENT_STATE.md`
- Modify application source only when strictly necessary to make the imported app reproduce its existing behavior; every such change must be listed in `CURRENT_STATE.md` with root cause and exact file.
- Read: actual `package.json`, lockfile, README and test configs imported in Task 2.

**Interfaces:**
- Consumes: imported source from Task 2.
- Produces: reproducible commands, exit results, a runnable baseline or an explicit failure state, plus a factual defect list for the next milestone.

- [ ] **Step 1: Detect the package manager from actual files**

Decision order:
- `package-lock.json` -> npm;
- `pnpm-lock.yaml` -> pnpm via Corepack/current project requirement;
- `yarn.lock` -> Yarn according to project metadata;
- multiple lockfiles -> mark `BLOCKED` until the actual source history/package metadata identifies the intended manager; do not guess.

Record the decision in `CURRENT_STATE.md`.

- [ ] **Step 2: Record Node/runtime requirements from actual project metadata**

Check `package.json#engines`, `.nvmrc`, `.node-version`, README, and package-manager metadata. Compare the current Node version with the detected requirement.

Expected: the command and version are recorded. Do not silently change the project’s runtime requirement.

- [ ] **Step 3: Install dependencies reproducibly**

Use exactly one command based on Step 1:
- npm: `npm ci`;
- pnpm: `pnpm install --frozen-lockfile`;
- Yarn: the project’s immutable/frozen install mode.

Expected: exit code recorded. A dependency-install failure is documented before any attempted source edit.

- [ ] **Step 4: Run the existing verification scripts without inventing new ones**

Run every relevant script that actually exists in `package.json`, in this order where present:
1. typecheck;
2. lint;
3. test;
4. build.

For every command record:
- exact command;
- exit code;
- PASS/FAIL/BLOCKED;
- first actionable root-cause summary for failures.

Do not call a missing script a failure; mark it `NOT_APPLICABLE`.

- [ ] **Step 5: Run the application using its existing documented start/dev/preview path**

Expected:
- process starts without immediate crash;
- the main page returns successfully;
- the existing dashboard/composer can be opened;
- browser remains a client only; this milestone does not prove real publishing.

If start requires old static scripts, use them as-is first. Do not replace the runtime architecture merely because a different command would be prettier.

- [ ] **Step 6: Apply only minimal baseline-reproduction fixes if required**

Allowed examples:
- path/import case mismatch introduced by the copy;
- missing ignored directory creation required at runtime;
- stale local absolute path that prevents startup after repository relocation.

Not allowed:
- replacing localStorage with a DB;
- rewriting components;
- adding provider APIs;
- dependency upgrades unrelated to the proven failure;
- cosmetic cleanup/refactor.

For each allowed fix: document root cause first, make the smallest change, rerun the failing command, and commit separately with `fix: restore imported Planly baseline`.

- [ ] **Step 7: Write `docs/baseline/CURRENT_STATE.md`**

Required sections:
- commit SHA tested;
- OS/Node/package-manager versions;
- install result;
- typecheck/lint/test/build results;
- run/start result;
- existing storage/auth/social behavior observed;
- known failures with root cause evidence;
- minimal fixes made, if any;
- explicit statement that real Telegram/MAX/OpenAI publishing is not part of this milestone.

- [ ] **Step 8: Commit the baseline report**

```bash
git add docs/baseline/CURRENT_STATE.md
git commit -m "docs: record verified Planly baseline"
```

Expected: the repository now has evidence, not optimism.

---

### Task 4: Compare the Runnable Baseline With the Existing Planly Site

**Files:**
- Modify: `docs/baseline/CURRENT_STATE.md`
- Read-only reference: active Planly Site identified in the project/library context.
- Read-only app: locally running imported Planly baseline.

**Interfaces:**
- Consumes: runnable baseline from Task 3 and the existing Planly Site as a visual/behavioral reference.
- Produces: a concise parity section that tells the next milestone what UI already exists and what is genuinely missing, without implementing those gaps now.

- [ ] **Step 1: Check the primary visible surfaces**

Compare, where present:
- Dashboard;
- Create Post / quick composer;
- Calendar;
- Content;
- Media;
- Social Accounts;
- Settings;
- demo analytics state;
- owner/login screen if present.

Record `MATCH`, `LOCAL_NEWER`, `SITE_NEWER`, or `NOT_PRESENT` for each surface.

- [ ] **Step 2: Check the primary demo flow without changing data architecture**

Verify only existing prototype behavior:
- enter/edit post text;
- choose social targets shown by the current UI;
- save/schedule using current demo mechanism if available;
- reload and observe existing persistence behavior;
- open media/social settings screens.

Expected: discrepancies are documented, not fixed unless they are import regressions introduced by Tasks 1–3.

- [ ] **Step 3: Add a `UI parity` section to `docs/baseline/CURRENT_STATE.md`**

Include:
- which implementation is treated as the working baseline;
- Site-vs-local differences;
- any duplicated/obsolete prototype paths;
- which UI must be preserved when backend work starts;
- screenshots/trace paths only if the existing toolchain already supports them; do not add a new test framework just for this task.

- [ ] **Step 4: Re-run the baseline build/tests after any import-regression fix**

Expected: results remain at least as good as Task 3. Any regression stops completion.

- [ ] **Step 5: Commit the parity report update**

```bash
git add docs/baseline/CURRENT_STATE.md
git commit -m "docs: compare imported Planly with current prototype"
```

---

### Task 5: Milestone 0 Completion Gate

**Files:**
- Read: `docs/baseline/SOURCE_INVENTORY.md`
- Read: `docs/baseline/CURRENT_STATE.md`
- Read: Git history for the execution branch.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: a yes/no decision on whether Foundation/Content Core planning can begin, plus the exact factual inputs needed for the next implementation plan.

- [ ] **Step 1: Verify repository cleanliness and commit boundaries**

Run:

```bash
git status --short
git log --oneline --decorate -n 10
```

Expected:
- no unintended untracked/generated files;
- import, fixes and reports are distinguishable commits;
- no unrelated code changes.

- [ ] **Step 2: Verify the baseline completion checklist**

Milestone 0 is `PASS` only if all are true:
- existing local source was found and inventoried;
- source was imported without secrets/generated output;
- intended package manager/runtime were detected from actual files;
- dependency install result is known;
- build result is known;
- existing tests/lint/typecheck results are known where scripts exist;
- application startup result is known;
- Site/local parity is documented;
- demo/localStorage/provider limitations are documented instead of mistaken for working MVP features.

If the app still cannot build/run, Milestone 0 may be committed as `FAIL` with root cause evidence, but Milestone 1 must not pretend Foundation work starts from a healthy baseline.

- [ ] **Step 3: Produce the handoff summary for the next plan**

The handoff must state exactly:
- actual framework and version;
- package manager;
- actual source layout;
- actual test framework/scripts;
- current state-management/persistence implementation;
- current auth implementation;
- current media implementation;
- current social-account implementation;
- build/run blockers;
- files that Foundation/Content Core will actually need to modify.

This handoff becomes the source of truth for the next implementation plan: `Milestone 1 — Foundation + Content Core`.

- [ ] **Step 4: Run final verification**

Re-run the exact successful install-independent verification set from Task 3 (typecheck/lint/test/build as available) on the final branch state.

Expected: no regression from the verified baseline.

- [ ] **Step 5: Commit any final documentation-only corrections**

```bash
git add docs/baseline/SOURCE_INVENTORY.md docs/baseline/CURRENT_STATE.md
git commit -m "docs: finalize Planly baseline handoff"
```

Skip this commit if there are no final documentation changes.

---

## Plan Self-Review Result

- **Spec coverage:** This plan intentionally covers only MVP v1 Milestone 0 from the approved spec. Backend, DB, auth replacement, media storage, scheduler, Telegram, MAX and AI are deferred to separate plans because their exact files/interfaces cannot be responsibly named until the real source tree is imported and verified.
- **Step scan:** No product-code body is prescribed. Every operational step has a concrete command/result or a bounded deliverable.
- **Type consistency:** Not applicable yet because this milestone introduces no new product interfaces.
- **Review Focus:** Secret leakage, generated artifacts, package-manager mismatch, hidden feature work and UI drift are each pinned to a specific verification task.
- **Proportion:** The plan is deliberately narrower than the full MVP spec to avoid inventing architecture against an unavailable codebase.

## Completion Output

When this plan is complete, report:

**DONE**
- source inventory;
- source import;
- verified baseline;
- UI parity record.

**TESTED**
- exact install/build/typecheck/lint/test/start commands and results.

**KNOWN ISSUES**
- existing prototype defects and blockers only, with evidence.

**TECH DEBT**
- demo/localStorage/provider limitations that belong to later milestones.

**NEXT PLAN**
- Milestone 1 — Foundation + Content Core, written from the now-real repository structure.
