# SaaS execution ledger — master prompt 24 October 2026

Authority: direct Owner acceptance of the master prompt in this chat. Source work,
tests, commit/push and Draft PR updates are authorized; merge, persistent migrations,
deploy, secrets/infra and real provider operations retain separate gates.

Workspace: existing linked worktree `agent-catalog-decision-loop`, branch
`codex/agent-catalog-decision-loop-20261024`, base `4fc764a`, initial HEAD `5a8a679`.
PR75 exists; tree clean before this work. Root prototype is not the implementation base.

## Owner decisions

- After today's 10:00 MSK use the next free day at 10:00; never schedule in the past.
- Agent deletion means complete account/data removal after separate confirmation
  of the specific operation. Implementation/tests do not authorize deleting real users.
- ADMIN can inspect/reschedule agent scheduled/published posts; private drafts,
  private media and secrets remain outside that permission.

## Queue

| ID | Result | Status | Evidence / next action |
|---|---|---|---|
| S0 | Confirm source/runtime and avoid rebuilding | IN_PROGRESS | GitHub/local HEAD5a8a679, PR75; CI40068862698 has one failure, Self-host PASS. Runtime release separate. |
| S1a | Repair admin schedule privacy/time/status and fixture | IN_PROGRESS | CI1695PASS/1FAIL: valid USER binding missing in fixture; UTC/local conversion reproduced. Add focused RED checks. |
| S1b | Safe password reset | TODO | Reuse server auth, one-time expiry/revocation; inspect existing invitation infrastructure. |
| S1c | Manual expiry/unlimited access | TODO | Additive model preserving existing users; enforce server mutations/handoffs. |
| S1d | Confirmed complete deletion | TODO | Preserve uncertain/in-flight sends; prepare explicit confirmation and durable media cleanup. No real deletion here. |
| S2 | Archive/cancel/reuse/MSK | IN_PROGRESS | Reuse source already in PR75; inspect shared-feed cancellation and verify after10 policy. |
| S3 | Catalog/update pipeline | TODO | Inspect existing import and accepted content; do not invent media. |
| S4 | Delivery | TODO | Fixture checks first; actual USER consent/sends remain gated. |
| S5 | Security and browser acceptance | TODO | Independent branch Critic, authenticated isolated fixtures then released runtime. |
| S6 | Release and handoff | TODO | Concrete candidate/rollback; no implied merge/deploy. |
| S7 | Commercial payment launch | OUT_OF_SCOPE | Current contract uses manual access. |

Pre-flight: S1c access checks must feed both content mutations and provider handoffs;
S1b revokes sessions and must preserve existing channel binding safety; S1d must not
erase uncertain delivery before outcome handling. No new auth or scheduler.

## Evidence

- CI40068862698: admin reschedule returned403 instead of200;1695PASS/1FAIL. Existing
  fixture creates an initialized USER/account but no verified social binding/config.
- UI reproduction in Moscow:07:00Z→datetime-local07:00→04:00Z. This is a code defect.
- GET spreads PostDto and lists drafts, exposing private draft text/media IDs.
- Published guard throws plain Error→500, although the contract/test requires409.

Product rules are decided above; no speculative timeout/security bypass or test weakening.
