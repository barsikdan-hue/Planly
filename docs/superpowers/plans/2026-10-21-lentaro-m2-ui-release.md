# Lentaro M2 UI and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new USER completes the paid product flow, and the Owner receives a concrete, bounded release package.
**Architecture:** Render real account/billing components against server DTOs, keep existing planner and safe cancellation flows, and extend the isolated browser/compiled HTTP harness. Existing worker hosts the bounded mail-outbox task; no new hosting or sender is created.
**Tech Stack:** Existing React19.2.6/Next16.3.4/Playwright1.63.0, SMTP adapter and billing services from Plans1–3.
**Spec:** [Approved design§1–2,4–11](../specs/2026-10-21-lentaro-m2-commercial-design.md).

## Global Constraints

All [index constraints/interfaces/lock order](2026-10-21-lentaro-m2-index.md) apply. Existing tokens/passwords/card data never enter browser/source/logs. Read-only does not remove own history, payment or cancellation. Playwright stays loopback4318/retries0; real mail/payments/provider sends remain exact external gates. M1 must already be accepted before source execution.

## Review Focus

1. Reload/expired session after checkout or account change → no false activation or cross-USER display (Task1).
2. Link scanner/reset token in URL → POST consumption, token cleared from address, no referrer/leak (Task1).
3. Long Russian errors/320px and inaccessible payment form → readable keyboard/touch controls (Task1).
4. Paid status changes while editor is open → server denial explained, draft retained, no silent retry (Task1).
5. Fresh deployment enables partial flow or duplicate sender/mail task → explicit switches and shutdown/startup evidence (Task2).

### Task 1: Build account/payment/read-only UI with actual components

**Files:** create `app/{register,verify-email,forgot-password,reset-password,billing}/page.tsx`, `components/planner/{account-access,billing-panel}.tsx`, `lib/client/{account-api,billing-api}.ts`, `tests/e2e/{account-access,billing-access}.spec.ts`; modify `app/login/page.tsx`, `components/planner/{app,settings,calendar,shared-feed,user-management}.tsx`, `lib/server/auth/user-management.ts`, `lib/client/planly-api.ts`, `lib/contracts/{planner,billing}.ts`, `app/api/bootstrap/route.ts`, `tests/e2e/{main.tsx,vite.config.ts}`. Reuse existing UI primitives; no application-wide restyle.
**Interfaces:** import `BillingStatusDto`/`InvoiceDto` from Plan2 and `ReviewHeldPublicationInput`/`HoldReviewReceipt` from Plan3; do not redeclare different DTO shapes. bootstrap/PlannerSnapshot adds `billing:BillingStatusDto|null` (null only when enforcement OFF). `loadBilling():Promise<{access:BillingStatusDto,invoices:InvoiceDto[]}>`, `beginInvoice(operationId:string):Promise<InvoiceDto>`, `submitHoldReview(input:ReviewHeldPublicationInput):Promise<HoldReviewReceipt>` wrap the server types. No client userId/paid flag or untyped payment-proof input; TEST billingMode visibly labels a sandbox and cannot grant LIVE access.

- [ ] Write browser RED using real new components and stateful synthetic API: register→verification message→login→empty read-only cabinet→checkout pending→verified synthetic callback state→paid UI. Fake SuccessURL alone remains pending; reload polls server status without new invoice. Two user sessions never share payment/receipt recovery state.
- [ ] Add expiry/renew/review scenario: own draft/media/history stay visible, create controls disabled, cancel/payment remain available; renewed user explicitly reviews old publication; late402 preserves editor draft and does not replay. Test keyboard/form labels,390/320px, long errors, URL-fragment token removal/Referrer-Policy. New account token routes have no external assets/tracking. ADMIN user-management shows only safe verified/paid-through/payment-status aggregates, never tokens, invoice checkout fields or private unpublished text/media; test both the DTO and actual component.
- [ ] Run RED after files exist: `pnpm exec playwright test tests/e2e/account-access.spec.ts tests/e2e/billing-access.spec.ts`; fixture must reject every unexpected API/external request and must not read `.env`. Assert checkout fields/URL without visiting the real provider.
- [ ] Implement declared routes/components/client wrappers and shared DTO mapping. Price displays «1000 ₽ за календарный месяц», «Без автосписаний»; server-confirmed paidThrough controls the message. Use stable operationId for one invoice intent, preserve uncertain pending receipt on reload; generic401 keeps existing session redirect,402 shows payment UI rather than logout. Enrollment/enforcement-OFF does not expose a partly ready M2. Do not clear dirty edits on status refresh.
- [ ] GREEN targeted browser plus existing login/shared-feed/calendar/cancellation pilots and typecheck/lint. Commit Task1.

### Task 2: Prove compiled flow and prepare one external release packet

**Files:** create `tests/m2-commerce-http-smoke.mjs`, `tests/m2-worker-mail.test.mjs`, `docs/verification/2026-10-21-lentaro-m2-release.md`; modify `.github/workflows/{ci,self-host}.yml`, `worker/index.ts`, `lib/server/auth/mail-outbox.ts`, `.env.example`, `PROJECT_STATE.md`.
**Interfaces:** `startAccountMailDispatcher(options:{transport:MailTransport,intervalMs:number,limit:number}):{close():Promise<void>}` from mail-outbox module; interval30000ms,limit10,one in-flight batch, no timer when enrollment/mailer OFF or configuration incomplete. `worker/index.ts` closes this task before DB/Redis shutdown; it does not create another publication sender.

- [ ] Write RED worker tests for OFF/no interval, one in-flight batch, close stops new claims/clears timer and awaits the one already-started bounded SMTP attempt, no secret/body logs. Dispatcher passes an AbortSignal to Plan1's batch function so shutdown cannot start the rest of a limit10 batch. HTTP smoke uses real compiled Next + disposable DB/mail sink/fixture payment signatures; assert loopback/synthetic owner before mutations. New USER pays TEST fixture and cannot obtain LIVE access; duplicate callback and ack loss yield periods1; A/B/ADMIN privacy holds, own media still readable after expiry, old held job not sent on renewal.
- [ ] Run `node --test --test-concurrency=1 --experimental-strip-types tests/m2-worker-mail.test.mjs` RED, then wire the existing worker task and compiled smoke without bypassing production guards. Extend CI after canonical build to execute `node --experimental-strip-types tests/m2-commerce-http-smoke.mjs`; extend isolated Docker Self-host smoke with the same fixture-only guarantees.
- [ ] GREEN: worker tests and compiled HTTP; then `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, relevant full browser suite. Capture actual totals/skips and failures, run migration generation/drift on disposable DB; no fabricated green for platform-limited tests. Commit source, request focused auth/payment/handoff plus final branch Critic, push Draft PR(s) and inspect real exact-head Linux CI/Self-host.
- [ ] Prepare release document with actual source/image, migration filenames+Git-byte hashes/ledger, current switches, worker identity and one-sender proof, protected backup/isolated-restore evidence and rollback compatibility. Existing M1 release is a prerequisite, not something to rerun automatically. Do not renumber/reapply0012 or infer absent migrations from count.
- [ ] Release packet must name the merchant/SMTP origin privately, required key setup, email-domain approval, existing USER verification/paid-cohort conversion, public offer/contact/privacy/refund-and-check-annulment procedure and pending-paid resolution. Neither schema migration nor ACTIVE silently grants periods or withdraws live access. All legacy conversions are shown for Owner review before enforcement ON.
- [ ] Ask once for the concrete external scope only after packet is reviewable: exact environment/image/migrations/settings, bounded real mailbox/merchant TEST checks, any LIVE payment/refund with payer/amount/count, named USER/material/provider counts, preserved-data and fail/rollback limits. No actual external execution until granted. Production/main-domain cutover additionally requires independent off-VM recovery and its separate approval.

**Acceptance:** actual compiled/synthetic flow and exact-head CI prove source only; live merchant activation/SMTP/media/provider outcomes and Owner acceptance remain separately dated. After an authorized release, hand over usable URL/safe access and five steps: register, pay, connect channel, select/schedule material, inspect result/expiry/renewal. No promised deadline or paid-resource purchase is inferred.
