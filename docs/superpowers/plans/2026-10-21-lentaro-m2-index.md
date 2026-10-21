# Lentaro M2 — execution index

Status21Oct2026: PLAN_REVIEW_PENDING; execution method not selected; product implementation NOT_STARTED.

**Approved spec:** [Commercial design](../specs/2026-10-21-lentaro-m2-commercial-design.md), approved by Owner at c541555. Planning base is that commit; source paths were checked against its M1 tree. No production/runtime acceptance is inferred.

## Order and independent deliverables

| Order | Plan | Independently verifiable result |
|---|---|---|
| 0 | Existing M1 recovery/release package | Full recovery PASS → separately authorized M1 release → Owner USER testing. This is still a prerequisite, not completed by these plans. |
| 1 | [Accounts](2026-10-21-lentaro-m2-accounts.md) | Public enrollment/reset and encrypted mail outbox work with local fixtures; enrollment defaults OFF. |
| 2 | [Billing](2026-10-21-lentaro-m2-billing.md) | One verified payment creates exactly one calendar-month period; TEST cannot grant LIVE access. |
| 3 | [Enforcement](2026-10-21-lentaro-m2-enforcement.md) | Every commercial mutation and final provider handoff checks access; holds survive renewal/restart. |
| 4 | [UI and release](2026-10-21-lentaro-m2-ui-release.md) | New USER completes the whole synthetic flow; bounded external release remains a separate gate. |

Plans1–4 execute sequentially after M1 acceptance and plan review. Prefer **Native** execution: one implementer follows the shared interfaces, one fresh Critic reviews the completed source branch, and focused independent reviews cover risky auth/payment/handoff changes. Subagent-driven execution is an alternative the Owner may select; do not start either implicitly.

## Global constraints shared by all plans

- Existing Next16.3.4, React19.2.6, Drizzle0.45.2, BullMQ5.81.5, PostgreSQL17, pnpm11.25.0, Node>=22.13.0. No new runtime/queue/hosting.
- 100000 kopeks/RUB/calendar month/Europe/Moscow, NO trial, NO recurring charges. UTC persistence, end-exclusive access.
- Privacy, current ownership/receipts and uncertain outcomes remain; legacy ADMIN publishing is preserved. ACTIVE is not paid.
- Only disposable loopback `planly_test` DB/Redis, synthetic credentials/mail/payments/provider connectors. Tests assert destination BEFORE database mutation. Serial integration tests, retries0, existing timeouts unchanged.
- Feature switches `LENTARO_ACCOUNT_ENROLLMENT_ENABLED` and `LENTARO_BILLING_ENFORCEMENT_ENABLED` default false. `readM2Features()` in account-config returns LEGACY only for both false and ENFORCED only for both true; invalid or mismatched values are CONFIG_UNAVAILABLE, not a fallback to free public enrollment. New signup/checkout and nonlegacy commercial mutations deny503 in that state; existing authentication/own reads/safe cancellation remain. They isolate source delivery from later approved conversion. Verified M2 tests enable both explicitly; public launch requires both true plus prerequisites.
- Generate migrations against the then-current source journal. At the planning base, next files are0017/0018/0019 below; if the journal drifts, stop assigning numbers, rebase the source plan and pin the actual generated filenames/hashes. Never edit historical SQL or apply by row count; no persistent migration in this work.
- No merge/deploy, SSH/restore, real SMTP/provider/payment, secrets/env/DNS, paid services, user-data conversion or production cutover without exact external scope. Consumed recovery grants remain consumed.

## Shared interfaces and lock order

All DB `Tx` aliases use `Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]`; Date values remain server-side and DTO dates are ISO strings.

Plan1 exports `readAccountVerification(tx,userId):Promise<boolean>` and `MailTransport.send(message:AccountMail):Promise<'ACCEPTED'|'REJECTED'|'UNKNOWN'>`. Plan2 exports `readBillingAccess(tx,userId,now,mode):Promise<BillingAccess>` and `confirmInvoicePayment(proof:VerifiedPaymentProof):Promise<PaymentReceipt>`. Plan3 alone integrates entitlement into existing content and handoff paths; it exports `requireCommercialWrite(tx,userId,now):Promise<void>` and safe hold/review services. Plan4 consumes these interfaces; UI never supplies identity or activation proof.

New transaction order: user row → entitlement row → own invoice/token/outbox → existing account/source/post/publication locks. Invoice lookup BEFORE a transaction may discover userId only; lock/re-read it after the user lock. No callback, reset, cancel or worker path may acquire a user lock while holding a later lock. Existing paths with differing order need the smallest proved adjustment and race tests, not a second nested transaction.

## Verification and handoff

Each task uses RED → minimal source → GREEN → its named regressions → commit. Focused tests below are future commands, not checks already run. Full CI at an actual changed source HEAD includes migrations/drift, native tests, typecheck, lint, canonical build/CSS, compiled HTTP and browser. Report skips and platform limits separately; do not weaken tests to match Windows.

Before execution record the written plan approval/method and M1 acceptance evidence here. Before each later PR rebase/check its real base/head and changed source; do not merge the planning PR or re-execute recovery automatically. Continue approved tasks without asking about individual files; stop only dependent external operations.

Self-review coverage: spec§1–3→all plans/entry gate;§4→Accounts;§5–6→Billing;§7→Enforcement;§8→Accounts/Billing/UI;§9→all task checks;§10→M1 prerequisite;§11→UI/release packet;§12→this review gate. No product tests have been run for this documentation change.

Primary references checked21Oct: [Robokassa callbacks](https://docs.robokassa.ru/ru/notifications-and-redirects), [payment form](https://docs.robokassa.ru/ru/pay-interface), [status API](https://docs.robokassa.ru/ru/xml-interfaces), [Nodemailer SMTP](https://nodemailer.com/smtp). Registry metadata verified Nodemailer10.1.7, Node>=20, bundled declarations; package installation is deferred to execution. Provider merchant/SMTP onboarding is not yet verified.
