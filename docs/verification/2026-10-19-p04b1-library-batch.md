# P04-B1 — bounded Library consent verification

Status: SOURCE_CRITIC_PASS; final delivery checks are pending. This is source/mock verification, not staging, production or provider acceptance.

Source baseline: `da7ad737a3236f1c161ae46c519386e05869f47a`.
Approved frozen design SHA256: `84b9196f663484dcfba90b655279a5453bb46b500c0158329f66d79e3bddb1de`.
Implementation code checkpoint: `837bc58f75c9f47b10b383f22bc81fe498a0ef3a`.
Exact delivery HEAD and workflow conclusions belong in the Draft PR, after publication and completed checks.

## Delivered boundary

- An eligible USER selects 1–20 personal READY/unlinked Library items, a common set of 1–2 owned verified Telegram/MAX accounts and finite future Moscow slots. ADMIN/shared originals and the configured legacy OWNER cannot create new B1 batches.
- Full ordered text, private media, destinations and times precede one explicit confirmation. No recurring enrollment, publish-now, VK/Instagram, per-target cancellation or synthetic Swipe approval.
- One transaction creates all Posts/targets/media links/publications, changes sources to USED and records immutable consent, or rolls everything back. Redis mirroring occurs after COMMIT; existing Worker/reconciliation remains authoritative for jobs.
- The only extraction from old createPost is insertion of target/media rows after its existing parent insert succeeds. Old replay, Swipe, Phase9, edit/history and queue behavior remain unchanged.

## Recovery and failure semantics

The implemented HTTP contract is:

| Endpoint | Request and successful response |
| --- | --- |
| GET `/api/library/batch-consent/preview` | No query/body identity; returns `{eligible:boolean}` without admitting work. |
| POST `/api/library/batch-consent/preview` | `{sourceIds,accountIds,settings}`; returns ordered display rows/media and either `complete:true` with the immutable intent/hash/snapshot/proof descriptor, or `complete:false,descriptor:null`. |
| POST `/api/library/batch-consent/commit` | `{operationId,intent,snapshotFingerprint,previewProof}`; returns200 `{receipt,replayed}`. Fresh acceptance and exact-key replay use the same response schema and original mapped IDs. |
| GET `/api/library/batch-consent/operations/{operationId}` | Current authenticated owner only; returns200 with the durable receipt,404 if not observed,410 if accepted mapped results were removed. A404 never settles an in-flight POST. |

All responses are private/no-store. POST requires Origin matching configured canonical HTTPS `PLANLY_PUBLIC_ORIGIN`, or the request URL origin when unset; same-origin fetch metadata when present; JSON; and `X-Planly-Library-Batch:1`. Query/header/body owner overrides are rejected. Errors use sanitized codes:401 unauthorized;403 forbidden;400/413/422 invalid input;409 operation conflict or a typed stale/content/account/slot rejection;410 terminal result deletion;503 uncertain. An HTTP status alone never proves rollback. Local `attemptId` is deliberately absent from the server request/receipt contract.

| Event | Required result / exercised proof |
| --- | --- |
| Before every commit POST | Persist a distinct local attempt containing the unchanged server operationId, canonical C, requestHash, S and proof. Failed write/readback prevents dispatch. |
| Typed fresh transaction rejection | The HTTP projection describes only that attempt. It can close only its exact attempt record; it never deletes another uncertain attempt or a provenance-free legacy record. |
| Late rejection A after same-key B committed and lost its response | Native PostgreSQL plus actual helper, two browser pages and real compiled HTTP preserve B; reload GET recovers identical receipt/IDs without new admission. |
| Origin/header/identity/JSON/schema rejection,401,GET404,unknown/503,network loss | No operation-level rollback proof and no automatic new identity. Retain recovery data. BATCH_INVALID never projects rollback. |
| Matching durable receipt | Validate current owner, original C/hash/operation and mapping; acknowledge matching attempts. Cleanup failure retains local records while preserving known success. |
| Accepted source now USED; new valid session, role or binding changed | Historical replay precedes fresh eligibility/state/proof checks. Return the immutable receipt; no new rows or enqueue. Current valid ACTIVE authentication still required. |
| Missing mapped result | Terminal410 with minimal owned IDs, no resurrection or replacement of siblings. |
| COMMIT acknowledgement or Redis mirror lost | Receipt/publications remain durable. Same-key replay does not enqueue; existing startup/periodic reconciliation reconstructs missing jobs with the same publication IDs. |
| Cancellation | Existing whole-Post DRAFT transition is safe only before any publication claim. Claim-winning, AUTH/ambiguous history and partial delivery remain protected; no automatic resend. |

The browser journal is local evidence, not a server-wide certificate that every possible request/device has finished. Genuinely uncertain or legacy records may continue blocking a replacement after proof expiry. No abandonment API, reservation/tombstone lifecycle or lease was added. Clearing browser data cannot provide recovery guarantees; the UI directs the user to inspect the calendar.

## Isolation and persistence

Current owner comes from the session cookie. No request owner selector is trusted. Admission locks owner → current session → sources ASC → media ASC → accounts ASC, and rechecks authorization/expiry after waits and before callback completion. Preview signing is local; no provider/storage network IO runs under these locks.

USER A/B and ADMIN-as-nonowner tests cover API/receipt ownership, source/media relation corruption, signed-media issuance, unsigned403 and actual private PNG/MP4 bytes. Existing S3 signed URLs remain expiring bearer capabilities; these checks do not claim that a valid URL becomes bound to a browser cookie.

Native tests exercise all-or-nothing admission, competing keys/source conversion, inverse ordering, session logout/revocation/block/expiry waits, source/media/account lifecycle, exact graph/binding invariants, real COMMIT acknowledgement loss, partial/absent Redis mirror, duplicate/concurrent ensure, actual Worker startup/restart/periodic recovery and both claim/cancel orders. Mock connector handoff is counted; live provider behavior is not inferred.

A separate task-owned PostgreSQL17 and Redis7 process restart/readback retained the same twelve-table synthetic baseline digest, sessions, receipt, result IDs and jobs. This is disposable relational/media-metadata proof; real compiled private-byte tests and Docker Self-host checks are separate evidence.

## Migration

Generated `0015_curvy_blockbuster.sql` adds only the dedicated consent-operation table. It retains canonical intent and receipt IDs without cascading result/source foreign keys. It was applied only to a fresh disposable PostgreSQL database; migration-generation drift was checked. No existing staging/production DB, volume, session or credential was changed. Any future persistent migration/deploy requires its own gate and preservation/rollback preflight.

## RED/GREEN and local evidence

| Scope | Evidence at code checkpoints |
| --- | --- |
| Contract/proof/schema | Behavioral RED before implementation; pure contracts10/10 and related17/17; generated migration/drift verified. |
| Atomic service / native races | Native46/46 plus contracts10/10; related Post/Swipe/Phase9/auth/publication regressions294/294. Independent Task2 review and supplemental claim-boundary review passed. |
| Client/UI | Missing behavior RED, minimal actual DTO/historical-S mismatch RED, expiry and cleanup RED; fixes retain legacy behavior. |
| Different-operation tabs / closed preview | Actual-helper Worker overwrite and real UI stuck-loading reproduced RED, corrected and independently reviewed. |
| Same-operation delayed rollback | Native causal reproduction and four client RED cases; local-attempt correction, INVALID422 defense, final focused21/21, related105/105, mock UI38/38 and final two-page390/320 checks4/4. Independent exact-73c1b01 review repeated22/22 and native recovery. |
| HTTP | Native3/3; unsafe pre-service rollback projection mutation produced RED, restored defense GREEN. Compiled smoke tests actual routes/auth/media and accepted-receipt recovery. |
| Compiled browser | Real Next login/PNG+MP4 decode/play, consent, actual delayed409/same-key200 lost/reload GET, identical IDs and no extra admission at1366/390/320:3/3. |
| Types/lint | Final Task4 typecheck and targeted lint exit0. No check disabled or dependency/config/secret file changed. |
| Complete native suite | Exact code checkpoint `837bc58`: 1641 tests, 1640 passed, 1 existing Windows self-host-init pathname failure, 654.5s. No additional failure against the pre-feature baseline. |
| Complete browser, first run | Exact `837bc58`: 136 cases, 86 passed, 46 failed, 4 preexisting configured skips. All 38 B1 client cases and 6 actual compiled HTTP cases passed. Failures are detailed below rather than hidden by retries. |
| Affected browser regression after fixture corrections | 54/54 passed, no retries: 10 approval/cancellation, 42 Swipe, 2 compiled shared-library cases across desktop/mobile. The original full-run RED output was preserved separately. |
| Independent whole-branch Critic | PASS on `837bc58` against `da7ad737`; whole source/schema/UI/HTTP/test diff inspected and 32 pure tests independently passed. Native/browser logs reviewed, not represented as an independent rerun. |
| Scoped final Critic | The three fixture corrections and this report passed a separate read-only review; unexpected-request and mutation guards, original assertions and timeouts were preserved. |
| Resumed verification | Full typecheck and full lint passed after the fixture edits (lint: 0 errors, 23 warnings). The first parallel lint invocation was deliberately interrupted for local memory pressure and is not counted as success; the subsequent sequential invocation exited0. Exact-HEAD Linux CI/Self-host remain pending at report creation. |

The original local complete-suite baseline had one existing Windows `self-host-init` failure from URL.pathname/drive escaping; it is not patched or skipped by this feature. Final native results contain only this same failure.

The complete browser run exposed 44 legacy mock failures because two strict fixtures rejected the new read-only eligibility GET. Their compatibility correction accepts only the exact path, GET method and empty query and answers `eligible:false`; all unexpected-request assertions remain. One existing shared-library test also navigated to the content hash before the new user's planner hydration completed. Its correction waits for the expected fixture owner before navigating; original data/media/isolation assertions remain. These are test-only corrections; no product, Scheduler, Worker or retry code changed.

One desktop invitation fixture exited early with an unclassified startup failure; its unchanged mobile case passed in the same run. A bounded, read-only diagnostic using its same compiled-server startup/health sequence then reached ready in 3116ms with no classified error. The first cause is ROOT_CAUSE_NOT_PROVEN; no speculative fix, timeout increase or automatic retry was added. Exact Linux CI remains required, and this local failure is retained in evidence.

Local canonical Turbopack cannot resolve the preexisting node_modules junction outside the project root. Supported `--webpack` compilation and TypeScript passed. The unchanged CSS guard cannot select Windows backslash manifest keys and reported zero stylesheets. A separate read-only in-memory diagnostic of actual compiled CSS passed all13 existing checks; this is **LOCAL_WINDOWS_BUILD_GUARD_LIMITED**, not canonical build PASS. No guard, manifest, configuration or generated asset was edited to turn it green. Exact Linux CI must run the normal `pnpm build` and its unchanged guard.

Browser traces/automatic auth artifacts are disabled; explicit screenshots contain synthetic post-login UI only. Local RED/GREEN logs remain private in the task evidence workspace; committed tests and exact workflow logs provide reproducible public evidence. No passwords, cookies, tokens, preview proofs or real private media are included in this report.

## Delivery gates

Exact-HEAD GitHub CI and Docker Self-host are mandatory before source readiness. The live Telegram job is excluded on PR events. Read-only Render metadata showed Planly main autoDeploy/trigger OFF and preview generation OFF before delivery; no service changes were made.

SOURCE_READY / CI_PASS do not imply STAGING_ACCEPTED, PRODUCTION_ACCEPTED or PROVIDER_VERIFIED. Merge, each environment deploy, persistent migration, secrets/env/infra/DNS and real provider reads/sends retain separate Owner gates. No such action is part of this branch.
