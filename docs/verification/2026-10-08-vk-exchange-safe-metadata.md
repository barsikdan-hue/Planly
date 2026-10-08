# VK authorization-code exchange: safe diagnostic metadata

## Contract and authority

Owner authorized preparation of a diagnostic PR only, without merge or deployment. Base: GitHub main `8cd26b396642e7ac2cdc81e873330cafd9382ead`, independently fetched before creating `codex/vk-exchange-safe-metadata` in the existing clean linked worktree. Production remains outside this change's acceptance scope.

The OAuth root cause is **NOT PROVEN**. The proven diagnostic gap is `lib/server/vk/diagnostics.ts::vkInvalidGrantReason`: missing, malformed and unrecognized descriptions all become `OTHER_INVALID_GRANT`. `requestVkGrant` discards the original description after classification, so historical logs cannot distinguish those cases.

Existing production evidence at this base contains two events on 2026-10-08 at 09:44:37 and 09:44:48 UTC: `AUTH / TOKEN_EXCHANGE / INVALID_GRANT / OTHER_INVALID_GRANT`. These are historical observations, not a new attempt made for this PR.

The prior read-only Render audit verified expected client ID/callback, a canonical Base64 encryption key decoding to 32 bytes, key-version format and a nonempty trimmed service token. The two secret fields differ; no duplicate VK variables or linked environment groups were found. The Owner privately confirmed service-token equality with app 54809575 and matching VK app settings. Token validity and provider-side grant binding remain unproven; Owner confirmation is distinct from an automated provider verification.

## Implementation

Only an `invalid_grant` response to `grant_type=authorization_code` gains three additional log fields:

| Field | Allowed output |
| --- | --- |
| `providerHttpStatus` | Integer HTTP status, 100 through 599 |
| `providerDescriptionState` | `MISSING`, `NON_STRING`, `EMPTY`, `PRESENT`, `TOO_LONG` |
| `providerDescriptionMentions` | Zero to five fixed enums: `PKCE`, `CODE`, `DEVICE_ID`, `REDIRECT_URI`, `SERVICE_TOKEN` |

Description inspection is limited to 4096 characters. Oversized/non-string/missing/empty descriptions produce no mentions. Word boundaries and case-insensitive matching recognize technical parameter names; PKCE includes `code_verifier` and `code_challenge`. A PKCE parameter does not independently produce a CODE mention. The logger snapshots at most five entries by index, rejects sparse/invalid arrays, rechecks status and enum state, and reconstructs only named safe fields.

**Mentions are lexical signals, not root causes.** Quoted or echoed parameter names can produce mentions. No mention proves a mismatch, invalid token, expired code or request defect. `PRESENT` plus `OTHER_INVALID_GRANT` means the exact reason classifier did not recognize the sentence. Missing or generic provider descriptions may still leave the OAuth root cause unknown after this diagnostic is deployed.

The exact whole-string reason classifier and existing OAuth error categories remain intact. No raw description/body, URL, code, verifier, cookie, key, service/access/refresh token or arbitrary object reaches the diagnostic error or logger. No provider response text is stored. Refresh errors gain no new metadata.

The provider endpoint, form fields/encoding, PKCE, scopes, owner/state/Origin checks, intent consumption, grant parsing, community validation, persistence, refresh and publishing are unchanged. There are no schema/dependency/workflow/env changes.

## Verification and gates

- Baseline focused checks: 48 PASS, 0 FAIL.
- RED for the new file: 15 failures due to missing metadata; two request/refresh invariance checks already passed.
- GREEN focused checks: 65 PASS, 0 FAIL, 0 SKIP.
- New cases cover absence versus malformed/empty/unrecognized text, HTTP 200 with a provider error, multiple/bounded parameter mentions, substring false positives, oversized input, secret-bearing text, exact exchange form protections, unchanged refresh diagnostics and forged/mutated logger metadata.
- Existing invalid-grant tests keep strict full-object assertions, original fixtures, reason expectations and non-disclosure checks; expectations are extended only for the new safe fields.
- Full suite, full lint, typecheck, build and Self-host results must be evaluated on this PR's exact head. Canonical CI supplies isolated PostgreSQL/Redis; the local worktree has neither configured. Actual CI status is recorded on the PR after push, separately from these local checks.
- Independent security/code review found a sparse-array validation gap; a new adversarial fixture reproduced it (RED: one failure). The dense bounded snapshot correction passed the focused 65 checks, and the reviewer independently reran the regression (1 PASS) with no remaining findings.
- Local `pnpm build` failed before application compilation because Turbopack rejects the worktree's existing `node_modules` junction pointing to the sibling `Planly-library-recovery/node_modules` outside the filesystem root. The junction target was independently inspected; build config/dependencies/workflows are unchanged. No alternate build mode, dependency rewiring or retry was used. Local build is **BLOCKED**, not PASS; the exact-head canonical CI build is required.

Real VK requests, new Owner OAuth attempts, publication, secret rotation, VK/Render settings changes, merge and deployment: **NOT RUN**. Stop at the Owner merge/deploy gate after successful exact-head verification. A diagnostic category still requires corroboration before any OAuth fix.
