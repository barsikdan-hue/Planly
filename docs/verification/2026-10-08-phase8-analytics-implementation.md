# Phase 8 analytics — implementation and release evidence

Date: 2026-10-08. Owner approved the design, implementation plan and inline execution in this chat. PR: [#31](https://github.com/barsikdan-hue/Planly/pull/31). Base: `124f6d4fceedcbb8a9ef2ba59827a65b1cabe383`. Branch: `codex/phase8-analytics-discovery` in the verified linked `Planly-library-idempotency` worktree.

Status: IMPLEMENTED; final exact-head verification pending. No merge, production deployment, env changes, webhook registration or provider publication was performed. VK remains HOLD.

## Result and acceptance boundaries

- Owner-only analytics GET reads persisted observations without publishing or collecting. Protected POST collects at most 20 MAX publications with concurrency two, 10-second request bounds, a 25-second collection deadline, per-account serialization and a 15-minute cache/cooldown.
- MAX views require an active channel and exact returned message/destination identity. Missing/inaccessible/malformed data is unavailable; a valid observed zero is available. Previous values and timestamps survive collection failures.
- Telegram's separate receiver authenticates a dedicated secret before reading a bounded body, validates anonymous aggregate totals and resolves one owned published channel message. It replaces totals atomically using event time/update ID ordering. No actor/raw payload is persisted. It is unconfigured and inactive in production until the separate activation gate.
- A nullable numeric delivery destination is frozen in the existing successful Telegram/MAX publication persistence write. No send, status, retry, connector result or VK behavior changed. Historical Telegram username URLs alone cannot establish destination identity; strict numeric `/c/` links can. MAX historical identity requires a provider-confirmed recipient.
- Dashboard reads stored data only. Analytics shows provider-specific cumulative rankings for publications from 7/30 Moscow calendar days, actual publication age, observation timestamps, coverage and stale/error states. No daily-growth, saves, engagement deltas or fabricated recommendation remains. Only validated HTTPS provider links reach the UI.
- Period/provider/owner generation guards discard obsolete asynchronous replies. Render-time owner/selection matching hides prior metrics immediately, before effects run.

No production/browser or real MAX count/Telegram event acceptance is claimed. Totals describe observed post metrics, not unique reach or activity during the selected period. Telegram albums measure the first/caption message only. No historical Telegram backfill is inferred.

## Verification record

Implementation task commits: contract `de9cc32`; storage/receipt `df6df55`; MAX `58b9c5c`; Telegram `3d2caea`; owner API/UI `cd497b7`. Each task had a missing-implementation or behavior RED followed by focused GREEN and a task-done ledger entry.

Local fixtures use an isolated native PostgreSQL/Redis stack on loopback ports 56548/56549, synthetic credentials and private scratch data. No production credentials or data were used. Existing native binary files were reused without changing their original data directories.

| Evidence | Result |
|---|---|
| Baseline auth/Telegram/MAX connector checks | 48/48 PASS |
| Contract | 7/7 PASS |
| Repository and publication processor at Task 2 | 18/18 PASS |
| MAX reader/refresh at Task 3 | 17/17 PASS |
| Telegram parser/receiver/ordering at Task 4 | 7/7 PASS |
| Owner API/UI/link/App at Task 5 | 15/15 PASS |
| Fresh install 0000–0007 and existing 0006 upgrade | PASS, isolated PostgreSQL |
| Drizzle generation/drift | PASS, no schema changes/generated drift |
| Initial local full suite | 960/961 PASS, no skips; unchanged Windows self-host path test fails |
| Final focused checks/typecheck/lint/build | Pending final head |
| Final native CI and Self-host | Pending final head |
| Production analytics / MAX real count / Telegram real delivery | NOT PROVEN |

The local full-suite failure is `tests/self-host-init.test.mjs:20`: `URL.pathname` is passed to Node on Windows, producing `C:\C:\...SMM%20Planer...`; `MODULE_NOT_FOUND` precedes the setup script. Its source is unchanged from the base. No assertion was weakened, test skipped or unrelated path fix introduced. Canonical Linux CI remains the full-suite release gate.

The initial local Turbopack build rejected the pre-existing `node_modules` junction pointing outside the worktree. The junction was preserved and dependencies are being installed physically in this worktree; no source/config/build check was relaxed. The initial full local lint was cancelled after prolonged non-completion and is not classified PASS.

## Independent review and one fix pass

Fresh-context whole-branch review used `gpt-6-astra` on `124f6d4..cd497b7`, per executing-plans/requesting-code-review. Reviewer performed read-only checks (20/20 PASS) and no provider/DB mutations. No Critical finding; three Important MAX concurrency/lease findings were accepted:

1. Worker write failure released the advisory lease while its sibling continued. Reproduction failed, then cancellation plus draining both workers before unlock passed.
2. Cache eligibility was read before obtaining the advisory lease. A delayed-lock reproduction failed, then querying eligibility under the lease passed.
3. Failed unlock returned a possibly locked session to the pool. The former test masked production release arguments. The corrected test failed, then destroying the connection on unsuccessful/uncertain lock cleanup passed.

Provider text override preview was regraded Important because ranking could show the wrong copy; a 200-character override test failed, then selecting the effective provider text passed. A first-render owner replacement test independently reproduced visible prior-owner metrics; owner-tagged view state fixed this and the effect lint errors without suppressing rules.

No second reviewer pass is requested. Final full-suite/typecheck/lint/build evidence must cover the fix commit.

Deferred minor: frozen Telegram receipts do not retain destination type. A `-100...` ID cannot distinguish a channel from a supergroup, so the receiver accepts channel events only, but a group row may remain NO_DATA/IDENTITY_UNPROVEN rather than UNSUPPORTED. No values are fabricated or ranked. Establishing trustworthy type metadata is a later design decision; do not infer type, alter connector contracts or make Telegram provider calls in this task.

## Rulings carried from the execution ledger

1. Use installed Git Bash for skill scripts and reuse the verified existing linked worktree/ignored plan workspace. Cost if wrong: loss of workspace isolation.
2. Accept positive and negative canonical MAX numeric destinations, matching the existing validator. Cost if wrong: reject or misclassify a valid destination.
3. Preserve the unchanged Windows self-host test and require canonical Linux full-suite success. Cost if wrong: an actual Windows regression could remain undiscovered.
4. Provider acceptance and webhook activation set aside by review remain deferred to their expressly approved later gates. Cost if wrong: mocked access/receipt evidence could differ from production.
5. Handoff docs and exact-head CI set aside by review are executor release obligations; neither review nor local checks substitute for them. Cost if wrong: releasing an unverified head.

## Owner release and later activation

After final native CI/Self-host SUCCESS for the exact PR head and review fixes, stop for `Подтверждаю merge PR #31 + production deploy`. Verify merged SHA, existing Render LIVE exact SHA, HTTP200 health and production browser behavior after that approval. Never consider health alone analytics acceptance.

MAX acceptance: one minimal read of an already published owned channel post, exact destination/message/count comparison with storage/UI; no test publication.

Telegram activation: separate Owner approval for a distinct private `TELEGRAM_ANALYTICS_WEBHOOK_SECRET` and registration only after endpoint LIVE. First read-only `getWebhookInfo` and confirm any polling/other consumer; foreign consumer stops activation. Preserve required allowed updates, deliberately add `message_reaction_count`, do not discard pending updates or change privileges. Then separately authorize a real aggregate reaction receipt. Registration HTTP200 alone is not delivery proof.
