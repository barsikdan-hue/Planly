# Lentaro M2 Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One verified invoice payment grants exactly one calendar month of the paying USER's access.
**Architecture:** An immutable DB invoice binds identity/price/mode. Signed ResultURL and strictly qualified server-status recovery share one transactional confirmation service. UI redirects never activate access.
**Tech Stack:** Existing Node crypto/Zod/Drizzle/PostgreSQL; no payment SDK or new service required.
**Spec:** [Approved design§2,5–6,8–11](../specs/2026-10-21-lentaro-m2-commercial-design.md).

## Global Constraints

All [index constraints/interfaces/lock order](2026-10-21-lentaro-m2-index.md) apply. Price100000 kopeks/RUB, no trial/autopay, calendar month Europe/Moscow/end-exclusive. Depends on Plan1 `readAccountVerification`; source implementation still requires accepted M1 and plan review.

## Review Focus

1. Jan31/leap year/timezone and early renewal → exact end date, no lost remaining days (Task1).
2. Amount six decimals/duplicate fields/foreign invoice → signature checked on raw bytes, then exact amount and identity (Task2).
3. Callback committed but ACK lost → replay acknowledges once, no second period (Task3).
4. Two invoices/callback-status race/block race → serialized user lock, two real payments preserved, BLOCKED not changed (Task3).
5. Official status lacks gross-price/mode proof or TEST status unavailable → UNKNOWN, no entitlement (Task3).

### Task 1: Define access periods, DB constraints and inert configuration

**Files:** create `lib/contracts/billing.ts`, `lib/server/billing/{periods,config,access}.ts`, `tests/billing-periods.test.ts`, `tests/billing-schema.integration.test.ts`; modify `db/schema.ts`, `.env.example`; generate `drizzle/0018_m2_billing.sql` and meta.
**Interfaces:** export from `lib/contracts/billing.ts`: `BillingMode='TEST'|'LIVE'`, `BillingAccess={mode:'OWNER_LEGACY'|'PAID'|'READ_ONLY',paidThrough:string|null,emailVerified:boolean}`, `BillingStatusDto=BillingAccess & {billingMode:BillingMode,setupAvailable:boolean}`. Export server-only `BillingConfig={mode:BillingMode,merchantLogin:string,hashAlgorithm:string,password1:string,password2:string,resultOrigin:string}` from config module; config never crosses a DTO. `nextPaidPeriod(confirmedAt:Date,previousEnd:Date|null):{startsAt:Date,endsAt:Date}`; `readBillingAccess(tx:Tx,userId:string,now:Date,mode:BillingMode):Promise<BillingAccess>`.

- [ ] Write pure RED assertions using Moscow offsets:
  ```ts
  assert.equal(nextPaidPeriod(new Date('2027-01-31T12:00:00+03:00'),null).endsAt.toISOString(),'2027-02-28T09:00:00.000Z');
  assert.equal(nextPaidPeriod(new Date('2028-01-31T12:00:00+03:00'),null).endsAt.toISOString(),'2028-02-29T09:00:00.000Z');
  assert.equal(nextPaidPeriod(new Date('2027-02-01T00:00:00Z'),new Date('2027-02-28T09:00:00Z')).endsAt.toISOString(),'2027-03-28T09:00:00.000Z');
  ```
- [ ] Run `node --test --test-concurrency=1 --experimental-strip-types tests/billing-periods.test.ts`; confirm failure concerns the missing implementation, then implement without local host timezone or30-day approximation.
- [ ] Add `billing_invoices` (userId,mode,globally unique numeric InvId as bigint/string,operationId,requestHash,100000/RUB,tariffVersion1,status); `billing_payments` unique(invoiceId), `billing_periods` unique(paymentId), `billing_entitlements` unique(userId,mode). Constraints bind positive amount, dates and mode; payment history survives routine content deletion. No ACTIVE→paid backfill.
- [ ] Add schema tests including same operationId/different request conflict, TEST/LIVE uniqueness and content preservation; generate `pnpm exec drizzle-kit generate --name=m2_billing`, apply only to disposable DB, verify no drift and tests GREEN. Config requires explicitly approved merchant/hash and separate TEST/LIVE passwords; absent config means unavailable. Commit Task1.

### Task 2: Create immutable checkout and verify callbacks

**Files:** create `lib/server/billing/{invoices,robokassa,http}.ts`; `app/api/billing/{status,invoices}/route.ts`; `tests/billing-provider.test.ts`, `tests/billing-invoices.integration.test.ts`. The Result route is added only in Task3 after its confirmation service exists.
**Interfaces:** `createInvoice(request:Request,operationId:string):Promise<InvoiceDto>`; export `InvoiceDto={id:string,invId:string,mode:BillingMode,status:'PENDING'|'PAID',amountKopeks:100000,currency:'RUB',checkout:{action:string,fields:Record<string,string>}|null}` from contracts, with checkout null for PAID. `VerifiedPaymentProof` is an opaque server-created proof, never parsed directly from browser JSON; `verifyResult(raw:string,config:BillingConfig):VerifiedPaymentProof`; `readOwnBilling(request:Request):Promise<{access:BillingStatusDto,invoices:InvoiceDto[]}>`. setupAvailable is safe configuration availability, not a merchant/live acceptance claim; billingMode comes only from trusted runtime config.

- [ ] Write RED tests for raw `1000`, `1000.00`, `1000.000000`; reject fractional kopeks, exponent, negative/overflow, duplicate OutSum/InvId/SignatureValue, unknown Shp fields, wrong signature/key/mode, blank/oversized InvId. Assert valid signature over the ORIGINAL amount string, constant-time comparison,16KiB streaming body limit before buffering/decoding, InvId bounded positive decimal string (no unsafe JS number). A chunk crossing the cap cancels further body reads; errors expose neither raw body nor credentials.
- [ ] Add native invoice tests: authenticated identity only; verified ACTIVE USER may create/replay own invoice; foreign selectors/amount override rejected; same intent yields same invoice, changed payload409; invoice history for B excludes A; no raw provider secret in DTO/logs. Missing setup503; disabled enrollment/new-account mode cannot expose partial public checkout.
- [ ] Run RED: `node --test --test-concurrency=1 --experimental-strip-types tests/billing-provider.test.ts tests/billing-invoices.integration.test.ts`.
- [ ] Implement user→entitlement→invoice order. Checkout is POST to fixed `https://auth.robokassa.ru/Merchant/Index.aspx`, OutSum1000.00, explicit IsTest, immutable InvId; add only documented, actually signed fields. Assert no recurring/saved-card parameters are emitted. The algorithm is explicitly read from approved merchant config, validated against supported crypto routines; no guessed merchant default or silent fallback. Ordinary billing routes retain existing session/same-origin checks. Verification binds proof to the stored invoice; browser email/userId does not rebind it. Keep public checkout unavailable while the M2 switches are OFF.
- [ ] Run GREEN and existing auth/isolation regressions, then commit Task2. Vendor fixture signatures are unit evidence, not proof of merchant activation or real checkout.

### Task 3: Confirm atomically, recover uncertainty conservatively

**Files:** create `lib/server/billing/{confirmation,recovery}.ts`, `app/api/billing/robokassa/[mode]/result/route.ts`, `tests/billing-confirmation.integration.test.ts`, `tests/billing-recovery.test.ts`; extend `lib/server/billing/http.ts` to handle the callback. Add a private operator function only, no public manual-paid endpoint.
**Interfaces:** `confirmInvoicePayment(proof:VerifiedPaymentProof):Promise<PaymentReceipt>`; `PaymentReceipt={invoiceId:string,paymentId:string,mode:BillingMode,startsAt:string,endsAt:string,replayed:boolean}`; `recoverInvoiceStatus(invoiceId:string,transport:StatusTransport):Promise<'CONFIRMED'|'PENDING'|'UNKNOWN'>`. Server-only `StatusTransport.query(invoice:{invId:string,mode:BillingMode,amountKopeks:100000,merchantAlias:string}):Promise<{kind:'UNKNOWN'|'PENDING'}|{kind:'PROOF',proof:VerifiedPaymentProof}>`; the production transport constructs PROOF only after all same invoice/mode/amount checks. Status proof uses the SAME constructor/confirmation invariants; no flag grants a period.

- [ ] Write native RED races: two identical callbacks → payments1/periods1; two genuinely different invoices → payments2/consecutive periods2; callback vs status recovery → one payment; payment vs block → blocked unchanged. Simulate COMMIT success/HTTP ACK loss; replay must return existing receipt/`OK{InvId}`. A cancelled browser redirect cannot cancel a real paid invoice.
- [ ] Run RED: `node --test --test-concurrency=1 --experimental-strip-types tests/billing-confirmation.integration.test.ts tests/billing-recovery.test.ts`.
- [ ] Implement initial nonlocking invoice→user lookup, then user→entitlement→invoice locks and re-read/binding checks. Obtain DB confirmation time AFTER lock wait; create period once and extend from max(now,currentEnd). Result route accepts configured POST form transport, skips browser CSRF only for this signed vendor callback, and verifies before invoking confirmation. Transaction rollback returns no successful ACK. `readBillingAccess` grants PAID only for verified ACTIVE USER/current mode/end>now; legacy configured ADMIN owner behavior remains separate. Unknown key/config/value fails closed.
- [ ] Implement fixed-host HTTPS `OpStateExt` status transport only for LIVE under a separately permitted operational invocation: body cap64KiB, deadline10s, no redirect/DTD/external entity, bounded numeric fields. Official Result.Code0 and State.Code100 are necessary but insufficient: duplicate-operation4, missing mode binding or gross-amount proof returns UNKNOWN. Official OutSum is described as merchant credit/net amount; do NOT equate it to1000 or guess fee. TEST returns UNKNOWN without network because this API is LIVE-only. Until verified merchant evidence provides every required invariant, the default adapter never activates from ambiguous status; signed ResultURL remains the working normal path. Preserve pending for support/provider redelivery, no blind new charge.
- [ ] GREEN must include malformed XML, unsigned browser paid screenshot, net999/state100, TEST and duplicate-operation4 → zero period; fully qualified synthetic proof → exactly one period. Commit Task3 after typecheck/lint and focused regressions.

**Acceptance:** exact-once periods proved on native PostgreSQL fixtures; no live read/payment/refund. Public-sales runbook must address unresolved paid/pending invoices and receipt/refund handling before enabling LIVE. References: [callbacks](https://docs.robokassa.ru/ru/notifications-and-redirects), [status semantics](https://docs.robokassa.ru/ru/xml-interfaces), verified21Oct2026.
