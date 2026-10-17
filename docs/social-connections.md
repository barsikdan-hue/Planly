# Verified USER Telegram/MAX connections — mock implementation

Issue #66 includes the Owner-approved bounded R2 cancellation implementation, with local synthetic verification; **controller review, exact-head CI/Self-host and production acceptance remain pending**. This document describes the implemented scope. Scheduler, Worker and retry behavior are unchanged. Existing OWNER and VK paths retain their existing scope.

## Connection and consent

1. An authenticated USER starts from their own account in Settings, entering a destination. The server checks bot access, resolves the canonical destination and creates a short-lived operation bound to the **original exact Planly session**, user epoch, account generation and configuration revision. Bot access alone grants nothing and reserves no destination.
2. The fixed provider Mini App receives signed launch data containing the operation nonce. Separate Telegram/MAX validators verify the signature, freshness, replay identity and exact human identity. The Mini App shows a masked Planly account hint and destination/human details. It requires a checkbox and a separate trusted click before returning a one-time ticket to Planly.
3. The finish document immediately removes the ticket from the URL, previews consent only in the original session, then requires another explicit confirm click. A different session, including another session of the same user, cannot confirm. Lost, expired or wrong-session context requires restarting from Planly; there is no initiating-browser proof polling endpoint.
4. Confirmation freshly checks the exact human's control of the canonical destination and the bot's identity/posting rights. Destination uniqueness, binding, account state and durable receipt commit together. The result is **verified but disabled**. Settings requires a separate explicit enable action with fresh control verification.

The binding identifies provider, canonical destination, human, bot, owner epoch, configuration and monotonic revision. One provider destination cannot be claimed by another account. An existing binding cannot silently switch to another human or destination: reconnect must prove the same human/destination; changing the destination needs a successful release first. There is no “first bot claim wins” grant or legacy bot-only human backfill.

The approved residual allows a complete launch-data/ticket relay when the original Planly session also participates. This is **not phishing-proof**. Native signed launch context and return into the same external browser/session are **NOT LIVE VERIFIED**.

## Lifecycle and publication limits

- **Pause** disables future use and invalidates pending operations while retaining the destination reservation. **Enable** rechecks the existing human/destination/bot; it creates no publication.
- Settings/bootstrap metadata is read-only and makes no provider calls. Its `checkedAt` is informational; the durable binding does not expire 30 seconds after confirmation.
- **Release** needs a separate confirmation and a queue barrier. Scheduled, queued, publishing, unresolved reconnect-required or ambiguous work, and unfinished active dated targets, prevent release. Only the bounded cancellation receipt described below exempts supported AUTH history. Confirmed published history and ordinary drafts alone do not. Successful release removes the binding/account destination, increments revision/generation and preserves private posts, targets, media, receipts and history. Missing current provider rights do not bypass the barrier.
- New USER Telegram/MAX publication admission captures the current binding revision and destination. Existing work/history is never silently retargeted or granted a fresh pointer after reproof. Before each new provider handoff, the registered processor checks that pointer and current authorization, performs a fresh control read, and rechecks the observed state under local locks. Control must still be within **30 seconds**, including lock waits.
- Provider revocation after the last control read is not instantaneously or atomically observable across systems. A send already admitted may complete after pause/block. Its confirmed or ambiguous outcome is retained; recovery must inspect outcomes and obtain explicit approval for genuinely new work where allowed, without blind resend. A late AUTH result records the old publication outcome but cannot mark a newer binding/generation as failed.

### Bounded R2 cancellation and explicit copy

An owned target can expose **Отменить согласование** in publication details when every same-target historical row proves no provider handoff. Exactly one AUTH is supported: `PERSONAL_PROVIDER_SETUP_REQUIRED` with attemptCount 0 and null lastAttemptAt, or matching `TELEGRAM_DISCONNECTED`/`MAX_DISCONNECTED` with count 1 and present lastAttemptAt. Every other row must be an unattempted SCHEDULED/QUEUED/CANCELLED row with no error/uncertainty or receipt evidence. Provider AUTH, unknown codes, any FAILED row, attempted CANCELLED/open work, extra AUTH, PUBLISHING/PUBLISHED, inconsistent ownership/provider relationships and all ambiguous delivery remain blocked. A later local AUTH never erases a prior attempt's uncertainty. In particular PERSONAL count 1 and DISCONNECTED count 2 are unsupported.

The strict authenticated same-origin POST `/api/posts/[id]/targets/[targetId]/cancel-approval` accepts only `expectedPublicationId`, `expectedPublicationUpdatedAt`, `expectedTargetUpdatedAt`, `expectedBindingRevision`. ACTIVE current ownership is checked under the owner → Post → complete publication history → target locks, followed by owned account/session checks. The selected target date is cleared and `approvalCancelledAt`/target.updatedAt receive one server timestamp. Only safe open sibling rows become CANCELLED; their retry time is cleared. Post content/media, target identity/account/active/text override and every terminal AUTH field remain unchanged. Queue removal is best effort after commit; terminal DB state fences stale or active jobs even when removal fails. Cancellation makes no provider request and needs no current provider rights.

Exact replay checks the immutable AUTH/version and complete history again. A marker with null schedule, matching target.updatedAt and no open work returns the original timestamp before first-mutation target/binding freshness checks. This permits lost-response replay after release/rebind without mutating the newer connection. Changed outcomes/history, invalid marker state and foreign/blocked/revoked sessions fail closed. Timestamp comparisons are additional freshness checks, not collision-proof revisions.

The narrow release exception requires that intact marker and the same full conservative classifier. Release remains a separate explicit operation and still checks every other target. Historical destination is read only from the exact AUTH publication; missing legacy pointers display **Историческое назначение неизвестно.** The current live account destination never substitutes for it.

The original Post stays immutable, including when another target is already published. To send new work, explicitly open **Дублировать в черновик**: it creates an unsaved editor with blank ID, empty target history and preserved content/media. Explicitly save a new draft, then separately approve publication. Persisted Post/target/publication IDs are new, and fresh admission captures the current binding pointer. Copy/cancel/release never silently resend or retarget old work.

Abandoned-owner reclaim is a separate operator/Owner gate requiring an authorized inventory, queue/outcome reconciliation, barrier, audit and fresh proof. There is no bypass endpoint, timeout takeover or automatic reassignment.

## Optional server configuration and future setup gate

No configuration or provider setup was performed for this slice. These are server-only names read by the implementation; never use `NEXT_PUBLIC_` variants or expose values in DTOs/logs.

| Name | Implemented readiness contract |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Existing bot credential; positive numeric ID, colon and at least 20 URL-safe token characters; total at most 4096 characters. |
| `TELEGRAM_MINI_APP_URL` | Exactly `https://t.me/<bot_handle>`; handle starts with a letter and has 5–64 letters/digits/underscores. No trailing slash, extra path, query, fragment or credentials. |
| `MAX_BOT_TOKEN` | Existing bot credential; 16–4096 printable non-whitespace ASCII characters. |
| `MAX_MINI_APP_URL` | Exactly `https://max.ru/<bot_handle>`; handle starts with a letter and has 3–64 letters/digits/underscores/hyphens. No trailing slash, extra path, query, fragment or credentials. |
| `PLANLY_PUBLIC_ORIGIN` | Optional exact HTTPS origin, with no path/trailing slash/query/fragment/credentials. If absent, the request URL origin is used; Host/forwarded headers are not trusted. Invalid configured origin fails closed. |

Each provider needs its valid token and fixed Mini App URL for readiness. Missing/invalid setup returns an actionable unavailable state before provider validation or operation creation. Readiness only validates configuration shape; it does not prove provider registration, launch or connectivity. The internally derived configuration revision invalidates stale operations/bindings after token/app URL changes.

The launch URL appends only `?startapp=<operation nonce>`. Provider-side setup must make that approved launch deliver the signed nonce to the matching Planly document, `/social-connections/miniapp/telegram` or `/social-connections/miniapp/max`. The document uses only `Telegram.WebApp` or `window.WebApp` raw `initData` and, when needed, the fixed SDK URL `https://telegram.org/js/telegram-web-app.js` or `https://st.max.ru/js/max-web-app.js`. It opens the current-origin `/social-connections/finish` through the provider bridge after explicit consent. Unconfigured documents load neither SDK nor proof request. Real registration, hosting/proxy origin behavior, bridge context and same-browser/session return require a separate Owner setup/provider gate; syntax readiness cannot establish them.

## Migration and rollout gate

`drizzle/0013_gorgeous_iron_lad.sql` adds binding/intent/receipt/rate-limit tables, account state and nullable publication pointers. Historical migration 0012 is unchanged. Before schema changes, 0013 stops on duplicate legacy numeric identities or casefolded raw aliases; it chooses no winner, deletes nothing and infers no human proof. Existing legacy rows remain protected. An unresolved foreign legacy alias conservatively blocks a new claim rather than reading another owner's provider destination or assigning it.

`drizzle/0014_approval_cancellation.sql` adds only nullable `post_targets.approval_cancelled_at` (timestamptz), with no default or backfill. Fresh disposable PostgreSQL rehearsal preserves original target dates and AUTH rows while leaving the marker null. This is not authorization to migrate any existing database.

Future rollout requires an **authorized legacy canonical inventory/preflight and an isolated migration rehearsal** on representative data. Resolve duplicates and unresolved aliases through an Owner-approved plan before attempting rollout. Fresh synthetic database tests do not promise migration safety on actual staging/production data. No existing database migration, legacy reassignment, setup, provider call, send, merge or deploy is authorized by this document.

## Supporting evidence and remaining gates

Recorded slice evidence is local Windows **Node v24.21.0** with synthetic identities, fake provider transport and task-owned PostgreSQL 17/Redis. It is distinct from the required Linux CI runtime **Node 22.13.0** in `.github/workflows/ci.yml`. Counts below describe recorded task runs, not a sum of unique whole-branch tests.

| Scope | Recorded supporting evidence |
| --- | --- |
| E1 signed proof/control | 66 focused tests; 113/113 including preserved connector/queue regressions. |
| E2 binding/legacy | 39/39 covering session/ticket/claim races and legacy protections; migration test 1/1 covering four fresh-database preservation/duplicate-STOP scenarios. An E3 lock-observation failure was diagnosed in a separate root task; later E4 covering run includes E2. |
| E3 HTTP/documents | 21/21 focused native HTTP and actual emitted-script VM tests: strict requests, no automatic grant, URL clearing, consent, same-session denial and late-response fences. VM execution does not prove browser CSP or native return. |
| E4 lifecycle/publication | 188/188 covering regressions; final strengthened lifecycle/publication 52/52, including actual PostgreSQL lock barriers, fake registered connectors and admitted-outcome preservation. R2 remains outside this acceptance. |
| E5 Settings/client | Metadata 13/13, client/App 42/42, covering regressions 116/116. Local Playwright 9 passed / 3 intentional duplicate-project skips: explicit Settings 1366/390/320 layouts and representative production document builders/headers, external HTTP/WS denied. |
| Independent document browser QA | 22 unique completed cases, 953 assertions, 33 screenshots using unchanged production builders. CSP, privacy, explicit gestures, responsive output and terminal/late-result behavior covered. Native bfcache was **not reproduced** (`persisted=false`); no speculative fix or bfcache PASS. |
| E6 evidence/readability | E2 covering 39/39; selected saved private Telegram/MAX draft survives all five metadata states (5/5) with actual Composer SSR checkboxes still selected. Typecheck/focused lint exit 0. Parsed token comparison confirms service/state formatting preserves tokens, await/check order and clocks; focused commands below. |
| R2 bounded cancellation | Native service/HTTP/history/rollback tests, actual PostgreSQL claim/release races, actual BullMQ active removal failure/completion and registered fake-transport USER copy/rebind flow. Actual-source UI fixtures cover 1366/390/320, confirmation, historical identity, conflict, owner departure and explicit draft save. Full counters and exact revision belong in the task/controller report; these are local synthetic checks, not live provider evidence. |
| Final exact-head CI / Self-host / full suite / build | **PENDING controller verification**; final exact-SHA run links belong in the PR/final verification report. No green result or deployed SHA is inferred here. |
| Production / live provider / native return | **UNVERIFIED** for this feature; separate Owner merge/deploy/setup/provider gates remain. |

Representative committed checks, run serially against an isolated synthetic test environment only (never load a real `.env`):

```sh
node --test --test-concurrency=1 --experimental-strip-types tests/social-connection-binding.integration.test.ts tests/social-connection-legacy.integration.test.ts tests/social-accounts.integration.test.ts
node --test --test-name-pattern='actual Composer usability' --experimental-strip-types tests/social-connection-settings-ui.test.mjs
node --test --test-concurrency=1 --experimental-strip-types tests/social-connection-http.integration.test.ts tests/social-connection-documents.test.mjs
node node_modules/@playwright/test/cli.js test social-connections
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js lib/server/social-connections/service.ts lib/server/social-connections/state.ts tests/social-connection-settings-ui.test.mjs
git diff --check
```

The E5 recorded browser run used an ignored local preview configuration after a separately successful fixture build because the first normal webServer start timed out. It retained project cases, assertions, test timeouts and retries; committed browser configuration/workflow remained unchanged. Four pre-existing broader lint warnings and runner color noise were recorded, not suppressed. Committed representative browser tests attach screenshots to the existing `planly-browser-pilot` CI artifact; private local logs/screenshots are not copied into source. Root verification must establish final exact-head CI/Self-host results and keep them separate from live acceptance.
