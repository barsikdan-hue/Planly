# CI Failure Doctor — inactive design draft

Status: DRAFT / NOT ACTIVATED. This is documentation, not runnable workflow configuration. No `.github/workflows` agent workflow, generated lock, AI engine, credential, account permission, paid resource or trigger is added by this draft. Installing the gh-aw CLI does not activate GitHub inference. Ordinary deterministic CI and Self-host build remain authoritative.

## Current execution and source checks

At the inspected baseline `da9a2e89cc37119e87952ac56fcf86a1383de3f7`, `.github/workflows/ci.yml` names `CI` and `.github/workflows/self-host.yml` names `Self-host build`. Both run for PRs against main; their push branch allowlists do not include a new arbitrary `codex/*` branch. Check PR-triggered runs rather than treating an empty push-run list as PASS. Standard tests retain `--test-concurrency=1`.

Official sources checked on 2026-10-12:

- [gh-aw documentation](https://github.github.com/gh-aw/): APPLICABLE as the upstream design entrypoint; chosen engine runs in GitHub Actions, not the desktop session.
- [Safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/): APPLICABLE to separating read-only diagnosis from mediated output permissions.
- [Triggers](https://github.github.com/gh-aw/reference/triggers/): APPLICABLE when authoring and validating a future trigger.
- The contract's [ci-doctor.md example](https://github.com/github/gh-aw/blob/main/.github/workflows/ci-doctor.md): UNVERIFIED as a usable template; its raw main path returned HTTP 404 during this audit. Recheck the current upstream gallery before implementation; do not copy an assumed demo or claim it compiled.

The policy below is Planly's proposed design, not a claim of valid gh-aw syntax or already enforced controls. Validate every setting against the then-pinned CLI/schema and inspect generated YAML before any activation.

## Proposed flow and constraints

| Stage | Exact responsibility |
|---|---|
| Admission | Future `workflow_run` completed event for allowlisted `CI` and `Self-host build`, conclusion failure/timed_out only; repository barsikdan-hue/Planly, trusted same-repository branch/PR, current associated source SHA. Exclude fork/untrusted PRs, provider workflows, scheduler and the doctor itself. Cancelled/skipped/pending are reported without model inference |
| Identity | Record run ID/attempt, workflow ID/name, failed job ID/name, source HEAD and check SHA. Reject stale PR source SHA and unrelated repositories. Do not checkout/run PR code under a privileged workflow_run token |
| Read | Fetch bounded failed-job metadata and failing-step log excerpts; inspect relevant source by immutable SHA through read-only API. No download/execute of untrusted artifacts; no shell instructions from logs/issues |
| Classify | Product/test assertion, runner/dependency, database/queue fixture, flaky only with evidence, tool limitation, missing evidence or Owner gate. Include ROOT_CAUSE_PROVEN with causal path or ROOT_CAUSE_NOT_PROVEN; uncertainty must stay visible |
| Research | Exact error/version search in allowlisted official docs/upstream Issues; return 1–3 sources with applicability. Internet similarity does not prove Planly causality |
| Propose | Redacted diagnosis, reproducer and minimal next-action contract for the existing Codex Fixer. No code edits, commits, automatic PRs, CI reruns, provider dispatches or deploy |
| Output | Initially local diagnostic artifact / staged output only. After separately approved write policy: one diagnostic comment on the associated PR, or one Issue for main failure. Mediated safe-output job verifies target repo/PR, source SHA, fingerprint and sanitization; agent has no write token |

## Deduplication and execution limits

Before model execution, compute SHA-256 over a normalized tuple: repository + source HEAD + workflow ID + failed job name + failed step + canonical error signature + relevant tool version. Normalize ephemeral timestamps/paths/run IDs, retain causal error text; redact private values first. Include source HEAD so independent revisions are not accidentally collapsed. Keep run ID/attempt as provenance, not fingerprint input.

Use a machine-readable marker `planly-ci-doctor:<fingerprint>` and target only records created by this doctor. One active investigation per fingerprint; exact repeats stop before inference and only record the additional run URL in the permitted ledger. Serialize the final existence check and output to prevent duplicate comments/issues under concurrent events. Different SHAs may cross-reference an earlier signature, never silently reuse its diagnosis. Do not modify unrelated human comments/issues.

Proposed ceilings, enforced by deterministic admission/runner controls rather than prompt alone:

- At most one inference attempt per unique fingerprint, zero automatic inference retries; one active doctor run per repository, at most three admitted investigations per day.
- Ten-minute runner timeout; inspect at most three failed jobs, 200 redacted log lines per job, 100 KiB total input logs and three official research pages. Truncation must be labeled and relevant missing evidence reported.
- At most one mediated output per run, 8 KiB diagnosis; seven-day retention for sanitized temporary artifacts. Never upload raw logs/trace/environment dumps containing private content.
- Current cloud-inference budget is **zero**: no run is authorized. Before activation Owner supplies engine/model, actual billing basis, token ceiling, daily currency ceiling and Actions-minute/storage limits. If enforcement or cost visibility is unavailable, remain inactive and use existing desktop Codex on the CI URL.

## Permissions and trust boundary

Proposed diagnosis permissions: `contents: read`, `actions: read`, `pull-requests: read`, `issues: read`; all other permissions absent. No secrets/id-token, contents write, Actions write, packages write, workflow dispatch, repository administration or production access. Runtime engine credentials, if later approved, stay isolated from the agent/logs and never belong to Planly app env.

The separate safe-output job gets only the necessary target write permission (`pull-requests: write` for an approved PR comment, or `issues: write` for an approved Issue), plus reads needed to validate admission/deduplication. No direct shell GitHub writes from the agent. A diagnostic comment/Issue is an external write, so read-only means investigation is read-only; output publication needs its own explicit approved policy. Staged outputs can preview behavior but do not prove free engine execution.

Do not use `pull_request_target` to execute PR code or fetch/run mutable branch artifacts. Treat logs, code comments and issue content as untrusted data. Network allowlist: GitHub read API and specific official documentation hosts needed for the investigation. No provider/Render/R2 mutation endpoints, arbitrary outbound access, host-security bypass or app database credentials.

## Owner activation checklist — do not execute now

1. Confirm trusted current gh-aw release/advisories and installed CLI on the intended surface; verify future schema, workflow/lock generation and pinned actions locally without cloud execution.
2. Approve a named engine/model, credential ownership and isolation, documented pricing, hard inference/Actions budgets and repository Actions usage. Codex Pro does not establish free GitHub Actions inference.
3. Review proposed trigger, fork/stale-SHA exclusions, network, generated lock permissions and injection/output protections. Explicitly approve only the diagnostic output policy; no Fixer write permissions.
4. Review deterministic deduplication/admission/budget tests using synthetic sanitized failed-job metadata. Prove duplicates/stale/fork/provider events generate no inference or outputs.
5. Approve activation separately, then perform one staged bounded synthetic failure run. Verify actual billing/permissions/output redaction before any diagnostic publication policy is enabled. A PR merge alone does not waive the engine/cost gate.

## Safe fallback available now

Read existing failed CI with GitHub/gh, capture SHA and redacted logs, route to the current Codex session using [the autonomous repair contract](tool-routing-contract.md). Diagnose, make a scoped minimal fix, obtain independent read-only review and run deterministic checks/CI. No cloud doctor, new credentials or paid inference is needed for that path. Record missing evidence precisely and continue independent approved work.
