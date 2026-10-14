# T02 / CR07: acknowledged account toggle versus late snapshot

Scope: [Issue49/T02](https://github.com/barsikdan-hue/Planly/issues/49). Independent branch from main `ce46b4a0a5791eb6da75834dce4d7ecc95361938`. No dependency on unmerged PR47/PR50, no account/provider API redesign, production mutation or release permission.

## Proven root cause

`components/planner/app.tsx::PlannerApp` scheduled poll captures Library/media revisions before `loadPlanner`, but previously applied `socialAccounts:snapshot.socialAccounts` unconditionally for the same owner. `updateAccount` applies the successful `setAccountEnabledApi` response separately. A bootstrap GET started earlier can finish after the acknowledged PATCH and restore the older `enabled` value. `SchedulingPlan::onSaved` has the same late same-owner account-snapshot assignment.

Actual App callbacks/client HTTP were exercised using the existing lifecycle harness with synthetic transport/timers. Tests observe the successful disabled account before resolving the old GET, then observe its wrongful return to enabled. This is source/callback reproduction, not browser or production proof. No live account toggle occurred.

RED on unchanged baseline: **3 expected FAIL / 1 control PASS** in `tests/account-snapshot-race.test.mjs`. Failures were `true !== false` after late poll, poll begun during a pending PATCH, and late scheduling refresh. The rejected-PATCH control retained authoritative poll behavior. Logs retained locally under `artifacts/issue49/2026-10-14/t02-red.log` outside Git.

## Minimal change

A client `accountRevision` ref advances when the existing non-VK enabled PATCH succeeds. Poll/scheduling refresh capture the revision before starting their GET; after a newer acknowledgement they retain current accounts while still accepting posts and the existing guarded Library/media fields. Fresh GETs remain authoritative; unsuccessful PATCH does not freeze future polls. Owner transition keeps its existing separate snapshot path. The guard does not fix unrelated concurrent mutation ordering or expand old-owner connect/disconnect behavior.

No server DTO/schema, persistence, credentials, connector, scheduling/send operation or VK flow changes. No timer/timeout/skip/assertion weakening. No new polling or provider requests.

## Verification and gate

GREEN **4/4**. Focused regression **52/52**, zero failed/skipped/cancelled: new account races plus existing owner-lifecycle and scheduling-plan UI tests. The account test also verifies that post refresh still applies and a subsequent fresh GET may update accounts. These harness results remain distinct from real React/browser acceptance.

Independent Critic found Critical 0 / Important 0 and independently ran the four race tests. Consult the actual PR checks for fresh exact-head full regression/typecheck/lint/build/E2E/Self-host conclusions; no CI outcome is asserted in this preparation snapshot. Earlier PR50 or production analytics evidence does not substitute for this change's checks. Production remains on `2f13a5a`; T02 reaches READY_FOR_OWNER_GATE only after actual checks, and remains unreleased until an explicit merge/deploy and applicable production acceptance.
