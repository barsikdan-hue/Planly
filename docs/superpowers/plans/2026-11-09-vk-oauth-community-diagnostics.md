# Preserve the first VK community OAuth failure

**Goal:** Retain the connector's closed community-validation diagnosis through the OAuth callback, without changing which accounts/groups/grants are accepted.

**Contract/evidence:** Deployed staging d297890/image9bd9c95b recorded three owner attempts on 9 November07:37:52/07:38:05/07:39:14UTC as AUTH/COMMUNITY_VALIDATION/FAILED. requestVkGrant already validated returned state, access/refresh token fields, expiry and wall/photos before reaching that stage. Credentials remain0. The exact underlying group rejection is UNKNOWN: completeVkOAuth catches and discards VkCommunityValidationError. DNS/TLS probes without HTTP/API calls passed07:43UTC; official schema5.199 matches current expected response types. Neither result justifies relaxing group authority checks or changing domains.

**Architecture:** Add optional closed metadata to VkOAuthError; map only the existing typed community error and revalidate at the log boundary. Foreign errors retain the generic result. Never retain/log provider messages, response bodies, IDs, URLs, state, code, tokens or arbitrary enumerable properties. Metadata must be emitted only for COMMUNITY_VALIDATION.

**Scope:** lib/server/vk/oauth.ts, config.ts, diagnostics.ts; focused pure unit and actual OAuth transaction integration regressions. Workflow only adds the exact stacked PR base and exports the verified image after existing ordered unit→attested disposable PG/Redis gates. Existing image export makes no deployment or provider call. No connector acceptance, grant/state/owner/session binding, schema, retry, photo, status or publication behavior changes.

**Steps:**

1. Reproduce current loss with failing unit/contract assertions; add closed-code/network/API metadata privacy regressions.
2. Implement the smallest typed propagation and logger allowlist; focused units first. Integration regression must exercise the actual catch after a valid grant and confirm credentials are not persisted on rejection.
3. Independent read-only Critic; source/provenance/privacy review, focused regression and typecheck. Commit/push task branch; create Draft PR against codex/vk-server-readiness-20261107.
4. Verify exact clean-source GitHub unit job, then only attested isolated PostgreSQL/Redis integration/full checks, then immutable Linux image artifact. Do not run integration against current staging DB/Redis.
5. Prepare concrete staging-only web update/rollback. Keep existing gateway deny, worker stopped and queue paused. A code deployment and another owner OAuth attempt require the applicable existing/exact owner gate; do not infer them from CI or publishing eligibility. No production/main mutation and no upload/save/post.

**Done for this change:** meaningful reproducer, sanitized fields survive actual OAuth catch, unknown/untrusted error data is discarded, focused and isolated checks pass at the PR SHA, review clear, artifact/evidence available. This is diagnostic readiness, not a fix claim for the still-unknown provider/group failure and not proof of background publishing.
