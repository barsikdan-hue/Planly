# Planly agent instructions

## Permanent development workflow — owner decision 2026-10-04

- Use the permanent Harness stages 0–8 for each approved milestone:
  0. Confirm checkout, branch, HEAD, worktree status and GitHub identity; distinguish source SHA from deployed SHA.
  1. Inspect the current execution path and available evidence.
  2. Establish a concise task contract: problem, expected behavior, scope, exclusions, evidence, tests and human gates.
  3. Find the root cause before a bug fix; for planned work, confirm the existing behavior and gap.
  4. Write a proportionate implementation plan using the applicable Superpowers workflow.
  5. Implement the smallest change within the approved contract.
  6. Run fresh focused/regression verification and required typecheck, lint and build; keep local, CI, production and provider evidence separate.
  7. Push the branch, inspect actual GitHub CI, create/update the PR, then respect the owner merge/deploy gates and verify production after authorized delivery.
  8. Report the result, evidence, limitations, commit/PR and next action briefly.
- Continue ordinary work autonomously within the approved milestone. Stop for unexpected dirty-tree changes, a regression, secrets risk, a large refactor or a decision outside the contract. Use independent subagents when useful, with clean ownership of files and no conflicting edits.
- One task solves one problem. Do not combine an unrelated bug fix, refactor and feature; ROOT_CAUSE_NOT_PROVEN means NO FIX.
- Use remote-first delivery: feature/fix branch → GitHub push → actual CI results → PR → owner merge gate → main → existing Render service → production browser verification → minimal real Telegram/MAX verification when affected provider behavior needs it.
- Remote-first is not remote-only. Use local/Codex workspace and local browsers for development, inspection, root-cause investigation, unit/integration tests, targeted regression, typecheck, lint, build and quick internal smoke checks. Localhost supports acceptance; final user-facing acceptance is on the existing Render deployment in a browser. Edge is preferred, not mandatory.
- Use GitHub as the authority for branch, commit, PR and CI state. Push completed work and create/update its PR; do not leave completed changes only locally.
- For user-facing features, final PASS requires verification on the existing Render deployment after an authorized merge/deploy. For upload, publication, Telegram/MAX, scheduling and provider statuses, production/live evidence has more weight than localhost. Do not override proven production behavior with localhost observations without a proven root cause.
- Evidence priority: current code → tests → GitHub CI → Render runtime → real provider behavior → docs → localhost observations. Keep branch/CI evidence distinct from deployed-function acceptance.
- Existing Render Planly service only. Service state, deploy history, logs, health, deployed-SHA comparison and read-only production inspection need no extra approval.
- Human gates: product or architecture decisions beyond the approved contract; starting a new milestone; PR merge to main; deployment of a new production commit when not automatic after an approved merge; env/secrets or infrastructure changes; destructive actions/migrations; service creation/deletion; any paid resource. A specific owner approval for merge + deploy authorizes continuing through production verification without another stop between those steps.
- Browser/OS chooser limitations are tool limitations, not Planly bugs. Use a supported browser upload mechanism or production/manual acceptance after deploy. Never require an owner localhost chooser check as a prerequisite when the scenario can be verified on Render.
- Historical Telegram/MAX live E2E remains evidence within its recorded scope. Do not send test publications after every UI fix. After an approved production deploy, use the smallest safe live smoke when changes to connectors, media transport, publication processor, scheduling, PostTarget lifecycle or provider validation make it necessary.
- Current state: Phases 0–6 are DONE for MVP; the 2026-10-06 Customer-Ready closure retains its recorded acceptance scope. Current main/Render LIVE were verified on 2026-10-08 at `124f6d4fceedcbb8a9ef2ba59827a65b1cabe383` after PR30, health HTTP 200; this does not prove new provider acceptance. Owner deferred Phase 7A VK on 2026-10-08 after the real TOKEN_EXCHANGE / INVALID_GRANT failure; root cause, OAuth success and VK publishing remain unproven. VK is HOLD: no further investigation, OAuth attempts, support requests, code/env/VK changes or provider sends until Owner explicitly resumes it. Preserve its existing implementation and credentials. Owner approved Phase 8 Telegram/MAX analytics design, implementation plan and inline implementation on 2026-10-08. Tasks 1–5 are implemented on PR31; canonical verification, independent review and explicit merge/deploy approval remain. Telegram webhook activation needs a separate private configuration gate. Provider/production analytics acceptance is NOT PROVEN. Instagram remains HOLD; CR07/CR08/GAP01 are not started. See [ROADMAP.md](ROADMAP.md), [transition evidence](docs/verification/2026-10-08-vk-hold-phase8-discovery.md) and [closure evidence](docs/verification/2026-10-06-customer-ready-closure.md). Preserve the free scheduler architecture; timing remains accepted debt and infrastructure changes require a proven need and owner approval.
- AI is removed from the product roadmap, not deferred or optional. Additional networks require an explicit owner decision; do not add them through incidental work.
- Phase 6 uses existing Library items: skip stays READY, reject archives without creating a Post, explicit approve creates a draft or manual/next-slot scheduled Post through existing creation and scheduler paths. Each item requires approval; presets are session-only. Follow the [approved spec](docs/superpowers/specs/2026-10-04-swipe-planner-design.md). No AI.
- Never expose tokens, passwords, session secrets, keys or other security values in chat, logs, frontend code or committed files. Historical verification documents remain unchanged; record new evidence in a new report with its exact scope.
- Telegram/MAX tokens remain server-env-only. Owner approved a narrow rotating-OAuth exception on 2026-10-07: VK access/refresh credentials and PKCE intents may live in PostgreSQL only as AES-256-GCM authenticated encrypted envelopes. Static VK app credentials and the 256-bit encryption key remain server-only Render env. No plaintext credentials in PostgreSQL, frontend/DTOs, logs, Git or reports; no new vault/service/infrastructure. Refresh must serialize per account through encrypted-pair commit and fail closed after uncertain rotation/persistence. Disconnect removes only that owned VK account's encrypted credentials/intents. Preserve private media and trusted MAX root CA configuration.
- Superpowers: bug → systematic-debugging (root cause before fix); feature → brainstorming → writing-plans → test-driven-development; before DONE → verification-before-completion. User authorization takes precedence over inferred extra gates.
- Keep logs/diffs and replies compact. Report STATUS / ROOT_CAUSE / CHANGED / CI / PR / PRODUCTION / LIVE_PROVIDER / COMMIT / NEXT_ACTION.

## Cloudflare

- For Cloudflare account operations, use the official Cloudflare MCP server when available: `https://mcp.cloudflare.com/mcp`.
- Prefer the Cloudflare plugin/Skills in Codex so Cloudflare-specific guidance and MCP servers are loaded automatically.
- For this project, Cloudflare is used for object storage (R2) only unless the roadmap is explicitly changed.
- Do not migrate Planly hosting, PostgreSQL, or auth from Render to Cloudflare without a separate approved task.
- For media storage, use the existing private S3-compatible R2 path and these server-only environment variables: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Keep the R2 bucket private; previews must use signed URLs.
- Never commit Cloudflare credentials, access keys, API tokens, or generated secret values to the repository or expose them to frontend code.
- When provisioning R2 for Planly, scope credentials to the single media bucket and grant only the permissions required for object read/write.
- Use current Cloudflare documentation or the Cloudflare docs/MCP server for product-specific details instead of relying on stale assumptions.
