# Lentaro — current project state

## Fresh off-VPS backup - 26 October 2026

Owner-approved fresh backup completed with brief stop/restart of only web/worker.
Server: /opt/planly-staging/backups/saas-20261026-1793002809.
Owner-only local copy outside Git:
C:/Users/EliteSochi/.codex/private/planly-backups/2026-10-26/saas-20261026-1793002809.
All5 manifest file sizes/SHA256 match after SSH transfer; archive282 files and all32
media-volume files individually hash-verified. Total transferred5,353,508 bytes.
DB counts users4/posts4/media7/publications3/catalog3/ledger21/nonterminal0.
Local ACL grants only current Windows owner. Old backups retained.

Dump SHA25666bb518147fba2e133b5cf872c30ab2395e32110b05d2813b0bd9a48b8738b53;
media/config SHA2569a85c4307156d4e9224e29e6c2e43cf77faa877622d5481098c93b8769955a23.
Same original container IDs/images preserved; web healthy, worker running,
restart counts0, counts unchanged, public health200. No deploy/migration/provider
calls. Redis live queue intentionally not restored. Independent pre-execution
review found no blocker after adding per-container restart handling. A read-only
preflight table-name mismatch was corrected before any service stop.

OFF_VPS_COPY_HASHES_PASS; RESTORE_NOT_VERIFIED. No local Docker/pg_restore runtime
found; WSL invocation returned help/error and did not establish a usable Linux
runtime. No installation performed. Next: choose isolated local restore runtime,
restore this downloaded dump and verify DB/media references without sender access.
Do not equate file integrity with independent recoverability or production acceptance.


## Agent archive lifecycle - 26 October 2026

Real barsikdan staging browser: at320x740, empty archive baseline; shared L03
left/reject with no networks selected (Calendar disabled) created personal archived
copy. Library archive persisted after full reload. Explicit Return from archive
removed it from archive and showed READY; second reload preserved READY with text
and image. Library390 and daily calendar390 checked, both existing MAX publications
visible at07:17/07:36MSK, console warn/error empty; viewport reset.

Fresh read-only VPS DB/runtime after actions: original receipts unchanged
(PUBLISHED2/attempt1 each, CANCELLED1/attempt0), nonterminal0, catalog3;
web healthy, worker running/restarts0, image4d952a unchanged. No new post scheduling,
provider request/send, deletion, deploy or infrastructure mutation. L03 deliberately
retained as user's READY personal copy; no destructive cleanup. This closes the
bounded real-user mobile archive/return/persistence slice, not all S5 or a new
mobile cancellation/send test. Telegram remains deferred by Owner.


## Release checks and handoff - 26 October 2026

Exact 28bd578431ec8f7428bc6c67be946b27bda7dab3 GitHub CI40274571083
and Self-host40274571104 completed SUCCESS, freshly read from GitHub.
No merge/deploy performed. Owner explicitly deferred Telegram pending their own
solution. Remaining real-agent mobile lifecycle acceptance waits for personal
barsikdan login; current owner session was signed out normally, login form ready.
Quick-start draft: docs/saas-quickstart.md; distinguishes real scheduling/sends,
manual access and error handling from remaining production/recovery gates.


## Mobile ADMIN follow-up - 26 October 2026

Staging owner browser at 320x740: mobile menu -> Settings -> Admin -> Users
renders readable controls. Opening Delete agent for barsikdan showed irreversible
warning, email confirmation and disabled submit; Cancel closed confirmation and
agent remained listed. No reset, deletion, access update or invitation issued.
Invitations page readable at 320x740 and 390x844, existing activated invitation
visible; console error/warn list empty. These checks cover presentation/navigation
and safe cancellation, not new password-reset/expiry/deletion execution or native
mobile provider consent.

Found onboarding copy still describing left swipe as hide, contrary to approved
archive behavior. Minimal source-only correction in lentaro-start.tsx changes
that sentence to archive; no handlers/schema/provider changes. Staging still runs
prior image and has not received this copy correction. Telegram work paused by
Owner while independent SaaS acceptance continues.


## Telegram network handoff - 26 October 2026

Fresh host packet capture: SYN leaves ens3 toTelegram149.154.166.110:443,
no inbound reply; Windows same-IP verifiedTLS1.3. Exact dropping operator remains
unproven. Actual provider NewVPS confirmed by Owner and authenticated service
Start#1319/vm1319/IP62.173.149.73. One separately authorized technical ticket35
registered07:45:37MSK, Under consideration. No server/network/code changes,
new provider sends or paid operations. Telegram remains unfinished.
Evidence: [network incident/ticket](docs/verification/2026-10-26-telegram-vps-network.md).

## Follow-up acceptance - 26 October 2026

ADMIN real-agent reschedule10:00 to07:36MSK/reload PASS; published fields locked,
private DRAFT excluded. Live ADMIN390/320 and USER review/settings/approval390/320
PASS, console clear, viewport restored. Nearest-free10MSK and next-day advancement
observed. Separately approved scheduled L02 delivered at07:36:01.569MSK,
PUBLISHED/attempt1 and real MAX public text/photo verified. Nonterminal0/catalog3.
No source behavior, deployment, infrastructure or migration changes. Further sends
remain gated; Telegram network blocker persists.
Evidence: [ADMIN/mobile/scheduled](docs/verification/2026-10-26-saas-admin-scheduled-mobile.md).

## Earlier acceptance - 26 October 2026

Real USER staging calendar27Oct10:00MSK retained after reload; Save draft cancelled
its publication with attempt0. USED-source reuse created a second draft. Owner then
approved exactly one real MAX image post; PUBLISHED receipt/attempt1 and actual
public page confirm delivery. Nonterminal publications0, catalog3, runtime unchanged.
Telegram VPS timeout persists. Production and additional sends remain gated.
Evidence: [calendar and real MAX](docs/verification/2026-10-26-saas-calendar-max-live.md).

## Historical staging - 24 October 2026

Owner confirmed the bounded staging release packet. PR75 merged as
`dc7c66a8c3a06e11baafe10f1fcd410b2d3ad55f`; its tree equals tested source1ea423a.
Main CI40087206182 and Self-host40087206247 SUCCESS. Existing VPS staging now runs
image `sha256:4d952a060f2829562004fedc3422777776553004e37c8ccb6bf2fd0862921c6b`,
source1ea423a, one web/one worker. Backup, isolated restored migration rehearsal,
actual migrations0017–0020 once and data/schema/sequence preservation verified.
Ledger21, three approved catalog posts imported/replayed without duplicates.
Public HTTP ADMIN+two USER core acceptance and IAB desktop flows passed. Exact
synthetic actors/files cleaned; prior users/sessions preserved; publications0.
Two bot tokens and supplied bot URLs/public origin wired without exposing values.
Full native connection/send/Owner acceptance is unfinished; no production or send.

A real importer403 behind TLS proxy was reproduced with the existing origin guard;
one runner metadata header fixes it, regression4/4 PASS. Follow-up source branch
`codex/saas-staging-acceptance-20261024` is based on mergedmain, not the old root.
Fresh provider DNS failure proved existing Docker network internal=true; Owner
then explicitly authorized extra egress only for web/worker and read-only checks
of the two named bots/channels. Egress applied, private DB/storage network intact;
Owner also separately approved the verified public MAX CA read-only mount and
NODE_EXTRA_CA_CERTS. Standard Node MAX/me200 confirms bot identity/TLS. Telegram
TCP/TLS fails from host and container, while the owner Windows client verifies TLS
to the same IP. MAX canonical channel -78857616977254 was found in project scripts
and the old authenticated UI; the actual staging connector validates bot rights.
Owner approved one MAX Mini App URL save: the stage /social-connections/miniapp/max
URL persists and the bot remains Published. Real USER invitation/activation,
native MAX consent/return, reload persistence and separately approved enable PASS.
No sends or scheduled publications created; real delivery remains unverified. Follow-up c4e75b CI40105645605 and Self-host40105645580 SUCCESS.

Fresh evidence and remaining gates: [staging release](docs/verification/2026-10-24-saas-staging-release.md).
Queue/decisions: [execution ledger](docs/superpowers/plans/2026-10-24-saas-execution-ledger.md).
The source/runtime tables below are historical and must not override this entry.

Updated 2026-10-19. Read this entrypoint and its environment boundaries before work; check relevant drift and existing code/active PRs. The completed audit is historical evidence, not a task to repeat.

## Product and authorization

Invite-only M1 for practicing real-estate agents: sign in → own Telegram/MAX → ready editorial feed → individual swipe → personal calendar → independent delivery outcomes. External `realty-editorial-v3` prepares content. Billing/public signup and VK/Instagram expansion do not block M1.

Owner approved [contract v2](docs/superpowers/specs/LENTARO_WORKING_VERSION_CONTRACT_v2_2026-10-19.md), ordinary A–F development, additive migration **source**, commit/push and Draft PR. [Design](docs/superpowers/specs/2026-10-19-lentaro-m1-design.md), [plan](docs/superpowers/plans/2026-10-19-lentaro-m1.md). Internal subtasks need no repeated approval. Merge, each environment release, persistent migration, infrastructure/secrets/DNS and provider reads/sends retain exact separate grants. No new costs.

## Source and environments

| Object | Latest established identity / scope |
|---|---|
| main at M1 start | `da7ad737a3236f1c161ae46c519386e05869f47a` |
| [PR #68](https://github.com/barsikdan-hue/Planly/pull/68) | OPEN/unmerged at start; source `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`; independent complete source review PASS, no actionable P0/P1/P2 |
| Active source | `codex/lentaro-m1`, Draft PR #69; verified core RC `22f7bad`, small Mini App display-label follow-up in progress; not released |
| Existing VPS staging | `https://stage.lentaro.ru`, media `media-stage.lentaro.ru`; fresh preflight 2026-10-19 09:57 UTC source `83a0350203d1d37ad0cbbb2e6d61934485b877e1`, web/worker/PostgreSQL/Redis/MinIO; ledger **13 rows**, not migration number |
| Existing Render | Separate older runtime `2f13a5acc8a8010bfdc989cc99deb4655b584747`, autoDeploy disabled at audit. Preserve it; do not recreate or choose hosting from old docs |

VPS rows are confirmed by the narrow [09:57 UTC read-only release preflight](docs/verification/2026-10-19-lentaro-m1-preflight.md); Render rows retain the completed audit scope. No release occurred. Source, CI, staging, production and provider acceptance remain distinct. Owner Telegram/MAX delivery already works within its established scope. New USER binding/delivery and M1 flow are not yet live accepted.

## Current work

- A complete: #68 source reuse/review; original uncommitted reviews and all other checkouts preserved. No later A1 execution result found in inspected comments; no claim about unavailable private results.
- B source ready (`1c0d7df`), independent server review PASS: durable source/revision/intent receipt and atomic private copy/Post/publications through existing storage/scheduler paths. B1 USER-only guard unchanged.
- C source ready (`8539381`): ready-content navigation, onboarding, Lentaro labels, owner-fenced exact-intent recovery. Seven recovery checks, navigation, TypeScript/scoped lint and 28 desktop/mobile shared-feed browser cases passed. Corrected source review PASS; current full validation is recorded in PR #69.
- D: three real texts/images independently factual/editorial/visual READY for exact frozen revision. Portable package committed (`628f422`), ACCEPTED_LOCAL 3/3, integrity 112/112 plus cross-platform byte check; no runtime upload.
- E: Draft [PR #69](https://github.com/barsikdan-hue/Planly/pull/69) includes unmerged #68. Core RC `22f7badfa7c383f69309ad3554eab7323cb27a74` has independent corrective review PASS, CI39234466495 SUCCESS (1690 native, 162 browser PASS / 4 configured SKIP, all6 compiled HTTP smokes) and Self-host39234466380 SUCCESS; source and tested synthetic merge574d5938 have identical treee512dfb2. Current Mini App label-only follow-up has focused checks; its exact-head CI is maintained in PR #69. Earlier failures and fixes remain in the dated verification reports.
- F: no M1 deployment. Exact migrations0013–0016 and five USER setup flags remain missing in the dated preflight. Latest A1 attempt ended FAIL_HOLD with recorded cleanup PASS; the caught perform error was not retained, so ROOT_CAUSE_NOT_PROVEN. On19October the owner PAUSED NEW A1 ATTEMPTS, asked for a retained-log explanation and continuation of independent M1 work. No new A1 approval is pending. Verified recovery remains mandatory before updating the working server. [Release package](docs/verification/2026-10-19-lentaro-m1-release.md); actual A1 receipts and pause are indexed outside checkout in artifacts/lentaro-m1/2026-10-19/M1_RC_HANDOFF.md.

## Release constraints and next action

Recorded A1 backup is same-VM. The original OCI failure, later preflight HOLD and latest post-daemon FAIL_HOLD are distinct attempts; no successful restore is established. Latest selected proof/termination readback confirms graceful owned cleanup, not restore acceptance or a full post-attempt data baseline. New A1 attempts are PAUSED BY OWNER. Do not replay them, resume off-VM #64/#65, or update the working server before verified recovery and the matching release/migration/setup grants.

Next independent step: finish the existing Mini App Lentaro display labels, focused review and exact-candidate CI on PR #69. Preserve core RC22f7bad and its immutable archive. Keep A1 paused and runtime release gated; current provider successes of the owner retain their existing scope.

Immutable audit outside checkout: `artifacts/lentaro-audit/2026-10-19`, ZIP SHA256 `c8fd1b3e165e7da66d016d16682c3d6994e896987ba474cb09ab671bf5542477`. New detailed evidence belongs in `docs/verification`; update this entrypoint after completed stages.
