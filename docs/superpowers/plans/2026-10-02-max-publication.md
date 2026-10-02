# MAX publication implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish real MAX text, photos, MP4 video and ordered media attachments now or on schedule, with confirmed remote IDs and independent Telegram/MAX statuses.

**Architecture:** Add MaxConnector to the existing SocialConnector registry; reuse Publication, BullMQ, owner auth and private object reader. MAX attachment upload/processing belongs inside the connector. Keep provider selection at integration boundaries; do not introduce a second scheduler or hosting service.

**Tech Stack:** Existing TypeScript/Next.js, fetch, PostgreSQL/Drizzle, BullMQ/Redis, private S3-compatible storage; no new product dependencies.

**Spec:** docs/superpowers/specs/2026-09-30-mvp-v1-design.md, section 10 and Milestone 4. User requested the same publication principle as verified Telegram on 2026-10-02.

## Global constraints
- MAX uses the same Publication/Scheduler path as Telegram.
- Telegram success and MAX failure must coexist cleanly for the same Post.
- Retry of MAX must not repeat successful Telegram publication.
- AI endpoints cannot publish directly to Telegram/MAX.
- No paid resources, main merge, timer workaround or final build handoff before online acceptance.
- Runtime MAX_BOT_TOKEN on server/worker only; no token in browser, DB, repository, log or chat.
- Keep TLS verification enabled; any required additional CA must come from a verified official source. Never disable certificate validation.

## Current API evidence
Official sources checked 2026-10-02:
- https://dev.max.ru/docs-api/methods/POST/messages : platform-api2.max.ru; Authorization header; chat_id; text up to4000; attachments; returned Message.
- https://dev.max.ru/docs-api/methods/POST/uploads : separate URL per file; processing rejection attachment.not.ready; bounded delayed retries.
- https://dev.max.ru/docs-api/use-cases/sending-messages/media : distinct image/video upload response contracts.
- https://dev.max.ru/docs-api/methods/GET/chats/-chatId-/members/me : is_admin/is_owner and write/legacy post_edit_delete_message rights.
- GET/chats is retired; do not use it for discovery. Connection initially consumes numeric chat ID; owner may supply a link for identifying the intended destination.

## Review focus
- Upload URL or redirects must not leak bot authorization or enable access to internal hosts.
- A lost publish response must not silently duplicate a message; upload failure before message handoff is different.
- attachment.not.ready must retry safely through existing worker, without marking a post published or resending Telegram.
- MAX chat IDs and returned recipient IDs must be validated without unsafe int64 rounding.
- Missing credentials, wrong chat, insufficient rights and provider failure must preserve honest independent UI status.

## Task 1: MAX connector and provider wire contract
**Files:** Create lib/server/connectors/max.ts; create tests/max-connector.test.ts; modify lib/server/connectors/registry.ts.
**Interfaces:** createMaxConnector({token:string,fetcher?:typeof fetch,timeoutMs?:number}) returns SocialConnector & {validate(destinationId:string):Promise<{ok:true,destinationId:string,displayName:string}|Extract<PublishResult,{ok:false}>>}; reuse PublishInput/PublishResult.
- [ ] Read full current schemas for me, Chat, ChatMember, Message and image/video upload responses; pin fixtures to official complete data. Resolve attachment count from current docs; app cap may be stricter and must be labelled as app policy.
- [ ] Write tests: text preserves literal characters; POST/messages uses raw token only in Authorization; returned mid and matching recipient required; missing/malformed confirmation yields AMBIGUOUS_DELIVERY. Validate bot identity and admin permission for group/channel; reject foreign/non-admin chat and unsafe numeric IDs.
- [ ] Run node --experimental-strip-types --test tests/max-connector.test.ts and observe meaningful RED before implementation.
- [ ] Implement fixed HTTPS API origin platform-api2.max.ru; no token query parameters or raw provider diagnostics; redirects:error and bounded timeout. Text limit4000; app media limit20MiB; initial PNG/JPEG and MP4 only. Private bytes use existing reader, not public URLs.
- [ ] Upload each ordered attachment separately. Accept only documented HTTPS provider upload hosts, no credentials/hash/unexpected ports, reject redirects, never forward bot Authorization to arbitrary upload URLs. Parse image payload/video token by actual documented schema, not guessed shape. Wait/retry only explicit processing rejection; do not retry unknown message handoff. No invented message URL.
- [ ] Write/observe RED then GREEN for private bytes, upload sequence, mixed ordered attachments, unready video, HTTP401/403/429/5xx, prehandoff timeout vs ambiguous posthandoff timeout, malicious URL/redirect and no secret in any result.
- [ ] Verify focused suite and commit connector with tests. Absent MAX token keeps the existing honest unsupported result.

## Task 2: Owner connection, common media worker and UI
**Files:** Modify lib/server/social-accounts.ts; app/api/social-accounts/[id]/route.ts; lib/client/planly-api.ts; components/planner/settings.tsx; lib/server/scheduler/processor.ts; compose.yaml; .env.example; existing relevant connection/processor/deployment tests.
**Interfaces:** Introduce connectSocialAccount(userId:string,accountId:string,destinationId:string) with the same return contract as connectTelegramAccount. Preserve the old function export as compatibility wrapper if existing callers/tests require it. Add connectSocialAccount client helper; keep existing Telegram helper compatible. Provider comes from owner-scoped account, never from client-controlled dispatch.
- [ ] Write RED connection tests: owner before external calls; MAX admin verified and canonical chat stored; invalid input/foreign account/permission failure never becomes CONNECTED. Telegram behavior remains passing.
- [ ] Extend owner-only PATCH destination schema for numeric MAX IDs; connector performs provider-specific validation. Keep PATCH enabled boolean behavior.
- [ ] Registry resolves configured MAX connector. Common worker loads ordered owner-scoped media for both implemented providers and enforces connected/enabled accounts; unconfigured providers retain unsupported state. Reuse existing auth-error/retry/ambiguity mechanisms.
- [ ] Settings UI keeps independent destination input/loading state per account, unique label IDs, supports MAX connection without frontend token. No shared input state accidentally connecting the wrong account.
- [ ] Add server/worker MAX_BOT_TOKEN configuration and update required env fixture. Internal S3 access remains on worker.
- [ ] Write RED then GREEN regressions for MAX media, independent mixed target statuses and MAX retry without resending published Telegram; run full CI types/lint/migrations/tests/build and real Docker smoke. Commit integration and tests.

## Task 3: Explicit live MAX acceptance and checkpoint
**Files:** Create tests/max-live-smoke.mjs; modify .github/workflows/self-host.yml; create docs/MAX_TEST.md; update ROADMAP.md only with observed outcomes.
**Interfaces:** MAX-only test guard, localhost fresh Compose stack, owner session, explicit numeric test destination and runtime secret. Fresh push label [max-live], run_attempt1 only; ordinary CI and workflow reruns never publish. No Telegram live trigger label.
- [ ] Owner configures repository secret MAX_BOT_TOKEN and supplies test group/channel with bot rights. Never request token in chat. Resolve numeric chat_id by official supported read-only method; no webhook registration or consuming existing bot updates without explicit need/authorization.
- [ ] Live tests connect through owner API and publish marked text/photo/video/ordered attachments, including a delayed post, through actual worker; ensure accepted capabilities match Task1 docs. Save partial safe evidence after each success and safe error codes on failure. Avoid repeating successful cases during diagnostics.
- [ ] Check final Message mid, recipient, persisted Publication and UI adapter state, not just HTTP200. Upload safe artifact only, no token/cookie/upload URL/S3 signature. Destroy disposable CI resources; keep test posts for owner review.
- [ ] Run focused and full CI, independent final branch review, Docker smoke and opt-in live acceptance. If credential/TLS/destination blocked, report exact safe cause; do not claim live pass.
- [ ] Record exact tested code SHA, run IDs and confirmed remote evidence in Git docs. Keep browser walkthrough and final self-host build handoff as explicit remaining gates if not verified.

## Execution
Use the same native implementation method as Telegram: implement in this session with TDD and a final independent review. Plan review is required before implementation. The destination and private credential are live-test inputs; connector tests do not depend on receiving them.
