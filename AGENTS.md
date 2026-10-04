# Planly agent instructions

## Permanent development workflow — owner decision 2026-10-04

- Use remote-first delivery: feature/fix branch → GitHub push → actual CI results → PR → owner merge gate → main → existing Render service → production browser verification → minimal real Telegram/MAX verification when affected provider behavior needs it.
- Use local/Codex workspace for inspection, root-cause investigation, unit/integration tests, targeted regression, typecheck, lint, build and quick internal smoke checks. Localhost is supporting evidence, not the primary acceptance environment.
- Use GitHub as the authority for branch, commit, PR and CI state. Push completed work and create/update its PR; do not leave completed changes only locally.
- For user-facing features, final PASS requires verification on the existing Render deployment after an authorized merge/deploy. For upload, publication, Telegram/MAX, scheduling and provider statuses, production/live evidence has more weight than localhost. Do not override proven production behavior with localhost observations without a proven root cause.
- Evidence priority: current code → tests → GitHub CI → Render runtime → real provider behavior → docs → localhost observations. Keep branch/CI evidence distinct from deployed-function acceptance.
- Existing Render Planly service only. Service state, deploy history, logs, health, deployed-SHA comparison and read-only production inspection need no extra approval.
- Human gates: PR merge to main; deployment of a new production commit when not automatic after an approved merge; env/secrets changes; destructive database migrations; service creation/deletion; any paid resource. A specific owner approval for merge + deploy authorizes continuing through production verification without another stop between those steps.
- Browser/OS chooser limitations are tool limitations, not Planly bugs. Use a supported browser upload mechanism or production/manual acceptance after deploy. Never require an owner localhost chooser check as a prerequisite when the scenario can be verified on Render.
- Historical Telegram/MAX live E2E remains evidence within its recorded scope. Do not send test publications after every UI fix. After an approved production deploy, use the smallest safe live smoke when changes to connectors, media transport, publication processor, scheduling, PostTarget lifecycle or provider validation make it necessary.
- Current priority: finish functional MVP on online Planly. Do not implement VK, AI, analytics, Swipe Planner, scheduler redesign or paid Render resources. Preserve scheduler timing as accepted debt until target self-hosted/rented-server deployment.
- Preserve SMART CONTENT QUEUE / SWIPE PLANNER as a future roadmap item, without implementation: left reject, right approve, approved content to next free slot or manual date/time, preset schedules, week/month filling; ContentSuggestion becomes Post only on approval, and suggestions need not come from AI.
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
