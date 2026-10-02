# Planly: self-host build

The existing Next.js server and standalone BullMQ worker run with PostgreSQL, Redis and private MinIO storage in Docker Compose. No Render worker or GitHub timer is required at runtime. **Telegram publication is implemented; real test-channel verification is tracked in docs/TELEGRAM_TEST.md.** Configure the bot token privately on web and worker and verify a channel through the UI. Without a token the registry keeps its explicit unsupported state. MAX remains unimplemented.

## First local launch

Requirements: Docker Engine + Compose v2; Node.js >=22.13.0 for initialization. From the repository root in Bash:

```bash
read -r -s -p 'Owner password (12+ characters): ' planly_owner_password
printf '\n'
printf '%s' "$planly_owner_password" | node --experimental-strip-types scripts/init-self-host.mjs --email YOUR_EMAIL
unset planly_owner_password
docker compose --env-file .env.self-host up -d --build --wait --wait-timeout 120
```

Without local Node, replace the initialization command with:

```bash
printf '%s' "$planly_owner_password" | docker run --rm -i -v "$PWD:/app" -w /app node:22.13.0-bookworm-slim node --experimental-strip-types scripts/init-self-host.mjs --email YOUR_EMAIL
```

Open http://localhost:3000 with your email/password. Setup writes `.env.self-host` with mode `0600`, stores only a password hash, generates private credentials, prints no secrets and refuses to overwrite existing configuration. Preserve single quotes, especially around the scrypt hash containing `$`.

The first build compiles a pinned security-fixed MinIO release from upstream source and requires internet access. Upstream no longer supplies its prebuilt image. No billing account is required.

## Startup and persistence

- Migrations finish before web/worker start; storage-init creates a private bucket.
- Worker runs `worker/index.ts` through Docker init, with graceful SIGTERM and process restart.
- Redis uses AOF and noeviction; reconciliation repairs missing jobs from PostgreSQL.
- Named volumes preserve PostgreSQL, Redis and media through container recreation. `down` preserves them; **`down --volumes` deletes them** and is used only in disposable CI.
- Web and media API bind to host loopback ports 3000/9000. Database, Redis and storage admin console have no published host ports.

Keep `.env.self-host` with your backups. Do not regenerate it after database initialization: changing an initialization password does not change an existing PostgreSQL volume. Back up PostgreSQL and media before upgrades.

## Later personal-server deployment

Use these same files. Put HTTPS reverse proxies in front of 127.0.0.1:3000 and a separate media hostname in front of 127.0.0.1:9000. Set `S3_PUBLIC_ENDPOINT='https://YOUR_MEDIA_HOST'`. Preserve the original media Host header/path for S3 signatures and allow Planly's upload sizes. Production session cookies require HTTPS.

The upload endpoint stays http://storage:9000 inside Docker; only signed previews use the public endpoint. Existing S3/R2 installations may omit the new variable and keep previous behavior. Secrets stay on the backend.

```bash
docker compose --env-file .env.self-host ps -a
docker compose --env-file .env.self-host logs --tail 50 worker
curl --fail http://localhost:3000/api/health
```

After code updates rerun `up -d --build --wait`; migrations precede updated services. A code rollback does not undo database migrations.

## Tests and artifact

Standard CI runs migrations, typecheck, lint, all unit/integration tests and Next.js build. Self-host build verifies both real Docker images: login/logout, CRUD, invalid media, actual S3 upload/delete, exact signed-preview bytes, unsigned-access denial, full stack recreation, persistent PostgreSQL/media, missing Redis-job recovery and worker execution without fake provider success.

Successful runs upload `planly-build-<commit>` with `planly-build.tgz`: source and verified .next output, without cache, secrets or node_modules. For Node deployment unpack, run `pnpm install --frozen-lockfile`, supply runtime env privately, apply migrations and supervise `pnpm start` + `pnpm worker`. For Docker use the included Compose launch, which rebuilds that exact source.

`tests/self-host-smoke.mjs` requires `PLANLY_SELF_HOST_TEST=isolated-ci` and localhost because it clears Redis and recreates containers. Never run it against personal data. Ordinary HTTP smoke: `tests/foundation-smoke.mjs`.

Known limitations: the app image includes dev dependencies for migrations and historical Sites/Vinext packages; image-size cleanup is deferred. DNS/TLS/backups on the owner's server remain unverified until it is available. Telegram live test-channel delivery is the current gate, then MAX and AI.
