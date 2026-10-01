# Planly agent instructions

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
