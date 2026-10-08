# VK OAuth callback diagnostics

Date: 2026-10-08. Owner approved safe callback diagnostics and preparation of a publishing-access request. **Diagnostic improvement only; actual VK publishing readiness is NOT PROVEN.**

## Authority and proven problem

- Repository: `barsikdan-hue/Planly`; source baseline/main `ed96db9d1cd01e84d8c978b58457ec0b6bed78f6`.
- Linked checkout: `work/Planly-library-idempotency`, initially clean and detached at that exact SHA; implementation branch `codex/vk-oauth-diagnostics`.
- Read-only Render verification found live deploy `dep-db3jfgmgekts73f21so0` on the same SHA; public health returned `status: ok`. No deployment was triggered.
- The original `requestVkGrant` discarded the exchange/parse cause as generic AUTH. The callback then redirected all authenticated failures to `/?vk=reconnect#settings` without a safe stage diagnostic. Available app logs did not identify the production failure.
- Synthetic direct execution proved that an otherwise complete rotating grant with `vkid.personal_info email phone` is rejected before community validation and credential writes; a synthetic wall/photos grant reaches both. This does not establish which response VK actually sent in production.
- Removing only the parser's scope check would still fail credential reads at `credentials.ts::credentialPayload`; a hypothetically persisted basic grant yields `VK_RECONNECT_REQUIRED` before provider publication calls. Scope checks remain intact.

## Implementation and execution flow

`authenticated callback -> explicit provider denial OR completeVkOAuth -> one-use encrypted intent -> code exchange -> grant validation -> community authority -> encrypted credential commit -> CONNECTED`.

- `callback/route.ts::GET`: owner authentication remains first. An explicit provider callback error is normalized and stops before DB lookup/token exchange. Authenticated failures produce one server-only diagnostic; the browser still receives the generic marker, no diagnostic fields.
- `oauth.ts::requestVkGrant`: normalize recognized provider error categories, including JSON HTTP 400 errors; distinguish HTTP rejection, invalid response, transport failure and state mismatch. Never retain raw provider errors/descriptions or a cause. Preserve parser diagnostics instead of overwriting them.
- `oauth.ts::parseVkGrant`: distinguish invalid grant shape and missing publishing scopes while still requiring a complete rotating pair and both wall/photos scopes.
- `oauth.ts::completeVkOAuth`: preserve the failing intent/exchange/grant/community/persistence stage through the existing advisory-lock wrapper. There is no added retry and no change to transaction/rotation semantics.
- `diagnostics.ts::logVkOAuthFailure`: project only a fixed event and allowlisted code, stage and reason. Revalidate mutable properties before logging. Never output tokens, authorization codes, state, device IDs, account/community IDs, URLs, scopes, raw exceptions, provider messages or response bodies.

Example sanitized events (examples only, not observed production failures):

```json
{"event":"VK_OAUTH_FAILURE","code":"AUTH","stage":"TOKEN_EXCHANGE","reason":"INVALID_SCOPE"}
{"event":"VK_OAUTH_FAILURE","code":"AUTH","stage":"GRANT_VALIDATION","reason":"MISSING_PUBLISHING_SCOPES"}
{"event":"VK_OAUTH_FAILURE","code":"AUTH","stage":"COMMUNITY_VALIDATION","reason":"FAILED"}
```

Stage is evidence of the first failing local boundary. A normalized provider error category is not proof of app eligibility or the provider's broader policy. `FAILED` carries no raw exception detail.

## Verification

- Clean baseline targeted VK set: **92 PASS / 0 FAIL / 0 SKIP**, before edits.
- TDD: **21 new RED** cases reproduced absent metadata/logging and callback denial continuing to DB lookup; **21 GREEN** after the minimal implementation. No existing expectations changed.
- Supporting local Node 24.21.0 protected set: **169 PASS / 0 FAIL / 0 SKIP**. Includes new diagnostics, existing OAuth/routes/crypto/connector/contracts, VK Settings owner lifecycle and Telegram/MAX connectors.
- New tests execute the real parser, exchange, callback, owner authentication, encrypted intent/completion and logging. Only external HTTP/DB boundaries are replaced. They verify basic scope rejection, explicit refresh downgrade rejection, omitted unchanged refresh permissions, distinct safe stages, zero CONNECTED writes after failure, no exchange after provider denial, forged/mutated error sanitization and generated-secret exclusion.
- Local `pnpm typecheck`: PASS. Generated `tsconfig.tsbuildinfo` is excluded from the change.
- Scoped ESLint for every changed runtime/test file and `git diff --check`: PASS.
- Independent read-only security/code review: no actionable findings; scope gates, owner authentication, log projection and fixture cleanup reviewed.
- Full native PostgreSQL/Redis suite, full lint, build, migrations and Docker/Self-host: require fresh exact-head GitHub PR CI. Local `DATABASE_URL` is missing; no production/unknown database is used as a test substitute.

## Provider and release gates

[Prepared support request](2026-10-08-vk-publishing-access-request.md) is **NOT SENT**. It asks VK to confirm exact app eligibility, wall/photo method permissions, community authority validation and supported OAuth/refresh behavior. The app's actual publishing grant and current provider approval procedure remain unproven.

No existing credentials, env values, VK settings, Render configuration, schema or publishing connector were changed. No provider post/photo upload, merge or deployment occurred. No legacy OAuth substitution was introduced.

Next after draft PR verification: Owner reviews merge/deploy separately. After authorized delivery, a fresh Owner OAuth attempt can expose its safe failure stage in Render logs. If VK permissions/approval are required, stop for the provider/Owner gate before choosing any further authentication implementation. Only a separately authorized real text/photo smoke can establish publishing acceptance.
