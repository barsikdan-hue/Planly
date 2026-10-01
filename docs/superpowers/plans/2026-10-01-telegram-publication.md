# Telegram publication implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with TDD and a final independent review.

**Goal:** Continue approved MVP Milestone 3: real Telegram text/photo/video/album delivery through the existing scheduler, with confirmed remote IDs and honest UI status.
**Architecture:** Keep PostgreSQL/BullMQ and existing owner auth. One server-only TELEGRAM_BOT_TOKEN configures the single owner's bot; no token is persisted in browser or database. Verify a channel and bot posting permissions before connecting; canonical chat ID is stored in SocialAccount. Download private media inside worker and upload multipart bytes, so Telegram need not reach private storage.
**Tech Stack:** Existing Node 22, TypeScript, fetch/FormData, Next.js, Drizzle and BullMQ; no new product dependency.
**Spec:** docs/superpowers/specs/2026-09-30-mvp-v1-design.md, sections 7–9 and Milestone 3.

## Global constraints
- Secrets remain server-only; no paid resources, scheduler timers as substitutes, hosting migration, MAX implementation or main merge.
- Real external posts only to an explicitly identified test channel; live smoke is opt-in.
- PUBLISHED requires Telegram confirmation and database remote-ID persistence.
- Existing queue remains the single publishing path; ambiguous delivery is never blindly resent.

## Review focus
- Timeout after Telegram acceptance: ambiguous terminal result, no duplicate retry.
- Revoked token/removed channel permissions: reconnect state and no exposed token.
- Albums with caption/count/unsupported-format limits: reject before sending any item.
- Changed channel during queued work: use current canonical destination, owner scoped.
- Rate limiting: honour retry_after with bounded retries; published target never resent.

### Task 1: Telegram connector wire tests and implementation
**Files:** Create lib/server/connectors/telegram.ts and tests/telegram-connector.test.ts; extend lib/server/connectors/types.ts.
**Interfaces:** createTelegramConnector({token, fetcher?, timeoutMs?}) returns SocialConnector plus validate(destinationId); PublishInput media optionally contains {name,mimeType,bytes,width?,height?}; error result optionally carries retryAfterMs.
- [ ] RED: run connector tests against a missing implementation (module import alone is not accepted as RED); test text payload/remote IDs, photo/video/album multipart bytes, channel rights, invalid token/destination/limits, 429 delay, rejection, missing IDs, malformed response and ambiguous network failure; reject before HTTP for local invalid input.
- [ ] GREEN: native fetch to fixed HTTPS Telegram origin; stable sanitized errors, single mutation per publication, no paid broadcast or automatic content splitting.
- [ ] Verify focused tests and commit.

### Task 2: Worker media and bounded retry integration
**Files:** Modify lib/server/storage.ts, lib/server/scheduler/processor.ts, lib/server/scheduler/worker.ts and registry.ts; add/extend storage and processor integration tests.
**Interfaces:** readMediaObjectBytes(key,expectedSize) returns bounded private object bytes; connector results forward retryAfterMs to worker's existing retry budget.
- [ ] RED: ordered owner-scoped postMedia becomes actual connector input, successful Telegram IDs persist, duplicate PUBLISHED is skipped, provider rate-limit delay is minimum nextRetryAt.
- [ ] GREEN: resolve Telegram only using server env token; retain MAX placeholder; safe generic failure messages; fetch media before Telegram mutation.
- [ ] Verify full CI and disposable Docker smoke, keeping default unconfigured-provider behavior.

### Task 3: Verified connection and real status UI
**Files:** Modify social-accounts.ts, account route, planly-api.ts, settings.tsx/app.tsx, planner contracts/posts/planner adapter; extend account/API/adapter tests.
**Interfaces:** owner-only POST account connection accepts destinationId, calls validate, stores canonical ID/CONNECTED; target DTO optionally includes latest Publication state/remote ID/URL/safe error.
- [ ] RED: channel permission verification gates connection; foreign account fails; token absent in response; Telegram PUBLISHED and MAX FAILED remain independent.
- [ ] GREEN: channel input and connect action, polling bootstrap while scheduled work exists, show confirmed publication status/errors/links, no mock success.
- [ ] Verify typecheck/lint/full tests/build and commit.

### Task 4: Real test-channel gate
**Files:** Add opt-in Telegram smoke and docs/TELEGRAM_TEST.md; update ROADMAP.md and env/Compose docs.
- [ ] Create owner UI/API -> Publication -> real worker -> Telegram smoke with explicit disposable test-channel gate; inspect stored IDs and final bootstrap status; do not delete external messages automatically.
- [ ] Configure token privately and use the owner's explicitly designated test channel. Without those, report live smoke pending and preserve implementation progress.
- [ ] Run final standard CI, Docker runtime tests, independent review and fix verified important issues. Save changes in separate GitHub branch; provide online evidence before final download.
