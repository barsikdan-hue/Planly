# VK autopublishing audit fixes

**Goal:** repair the six requested VK scenarios in the existing integration, with reproducible evidence and no production changes.

**Source:** user request and `LENTARO_VK_AUDIT_2026-11-05.md` (static findings, not deployed proof). Base `8ebf6a47d53287c788393891aab0c3b2b012a3c1`; isolated branch `codex/lentaro-vk-audit-fixes-20261105`. Existing dirty worktree is preserved. Native worktree creation rejected the nested sourceRoot; manual Git worktree used as fallback.

**Fresh runtime:** 2026-11-05 staging readback: web 8ebf6a4 / image 92027009; worker 466a30e / image b0292141. No VK configuration in either, zero VK credentials, zero nonterminal publications. Therefore persistent publishing stops before VK API. Historical transient upload failure remains unproven; no live send is authorized by this plan.

**Architecture:** retain encrypted OAuth credentials, account lifecycle and existing publication pointers. Extend the user-scoped proof path for VK; preserve generation/session/destination/revocation checks. Keep upload allowlists and unknown mutation outcomes fail-closed. Fence scheduler outcomes by publication state and claimed attempt.

## Tasks and evidence

- [ ] Reproduce connector defects with unit/contract tests before code: explicit 1051/27/15, positive authenticated photo owner with negative wall owner, foreign/private/malformed receipts, HTTP405 redaction, safe primary/fallback budget and ambiguous no-retry.
- [ ] Patch only connector/error metadata and tests; maintain no tokens/URLs/raw errors in results. Fallback only to a VK-returned allowlisted URL after an explicit eligible HTTP rejection, never after unknown upload outcome, redirect or save/post mutation.
- [ ] Reproduce VK personal authorization exclusions with contract tests; implement owned OAuth binding capture and final handoff with lifecycle revalidation, revoke/reconnect/session/destination fencing and no cross-user credential use. No foreign client IDs or provider permission bypass.
- [ ] Reproduce duplicate and late scheduler outcome races with contract tests; guard failure, success and catch transitions by PUBLISHING + claimed attempt. Duplicate live jobs must not defeat an active sender or cause a blind resend.
- [ ] Only after unit/contract phase, run real isolated PostgreSQL17/Redis7 integration suites with synthetic credentials and provider fixtures. Separate unique DB/Redis namespace; no staging/production DSNs or real-provider access. Record unavailable prerequisites honestly.
- [ ] Run relevant regression, typecheck/lint/build; independent read-only review; report exact commands/results and limitations. Update CURRENT_STATE and push a task branch/Draft PR if verification supports it. No merge/deploy/migration/provider call without its separate gate.

**Routing:** shell/Git for source and deterministic tests; GitHub connector for PR/CI identity; SSH for narrowly scoped read-only staging metadata; official VK schema for external contracts. Production and live VK behavior remain separate from fixture/integration PASS.
