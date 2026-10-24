# Planly SaaS candidate — 24 October 2026

Source candidate: Draft PR75, branch `codex/agent-catalog-decision-loop-20261024`,
base `4fc764aa1a7c7185eef1a3712dc6c8b6c59c2525`. This document records source
work and a release checklist; it is not a deployment or provider-send grant.

## Requirement → path → acceptance

| Requirement | Existing path plus minimal change | Acceptance |
|---|---|---|
| ADMIN schedule | managed-user posts API/UI; explicit projection, MSK input, locked reschedule | No private drafts/media/account IDs; published409; valid USER proof required |
| Reset | ADMIN lifecycle → hashed30-minute capability → public reset form | IP+token429 before KDF; single use; revoke sessions; preserve role/block/expiry; no automatic login |
| Manual access | nullable `users.access_expires_at`; existing auth and final handoff gates | Existing users stay unlimited; deadline exclusive; own reads/safe cancellation remain; unlimited never unblocks |
| Complete deletion | exact email confirmation; USER lifecycle lock; durable external cleanup task | ADMIN/owner protected; in-flight/ambiguous sends and pending uploads block; no other USER data removed |
| Media safety | durable pre-PUT intent; authoritative metadata readback before compensation | Unknown PUT/DB outcome held; committed media never deleted after lost COMMIT acknowledgement |
| Swipe/archive/reuse | existing decision receipts, independent shared copy, existing Post/scheduler | Left → private archive/no Post; right after10MSK → next free10MSK; replay same receipt; USED remains selectable |
| Catalog | existing media/Library/share APIs plus bounded journal runner | Offline byte/hash validation; repeat import no duplicate; unknown upload held; no Post/send calls |

## Source migrations, never inferred from ledger count

- `0017_demonic_rocket_raccoon.sql`: remove old unique source-Post constraint.
- `0018_real_tinkerer.sql`: nullable expiry, reset capabilities, account cleanup.
  Null preserves existing access; no mass-expiration/backfill job.
- `0019_robust_microbe.sql`: new archive-copy DISLIKE receipts; historical null
  receipts remain valid. No receipt/history deletion.
- `0020_chubby_jack_murdock.sql`: durable upload intent and cleanup eligibility.

No persistent migration has been executed for this candidate. Read the target's
actual migration hashes and candidate files, rehearse only actually missing
migrations on an authorized disposable restored clone, then verify schema and
data preservation. Do not replay0012 or assume0013–0016 are missing.

## Error handling and operational holds

- Expired queued publication: `ACCESS_EXPIRED`, no automatic retry on renewal.
  Competing PUBLISHING/PUBLISHED results are preserved. Inspect before rescheduling.
- Reset429: observe Retry-After; expired/used capability: request a new link.
  Links use URL fragments, are cleared from browser history, never logged/reported.
- Pending upload: deletion409. `cleanup_ready=true` means PUT completed and
  metadata absence was confirmed; worker retries object cleanup idempotently.
  `false` is an unresolved or active operation. Read back that specific operation
  under a separate storage/DB grant; never clear its marker or resend blindly.
- Account deletion: DB/session removal is distinct from external cleanup. UI shows
  pending cleanup count; worker retains the task until every object/job is gone.
  Do not claim full completion while a task remains.
- Catalog failure: use the same private journal; unknown upload stays PENDING.
  See `docs/editorial/catalog-import.md`. Original reviewed package unchanged.

## Release gate and remaining user acceptance

1. Pin PR head and CI-tested merge SHA; all required CI/self-host checks must pass
   for that exact candidate. Check independent review corrections, not a stale PASS.
2. Read-only target preflight: existing VPS `stage.lentaro.ru`, exact web/worker
   image/source, DB migration hashes, storage/bucket, queue and sender ownership.
   Older PROJECT_STATE runtime rows are historical. Render remains separate.
3. Locate the existing recovery PASS; establish current recoverable backup and
   authorized restore rehearsal. Same-VM checksum alone is insufficient.
4. Request bounded approval for this exact merge/staging release and missing
   migrations. No production, secrets, infra, DNS or provider sends are implied.
5. Roll out one immutable verified image to web and the single sender; retain old
   identities and DB/media. Rollback only to a schema-compatible image. An old
   sender that ignores expiry must not be resumed blindly. No guessed down SQL.
6. Authenticated ADMIN plus two nonce-owned USER acceptance: invitation/login,
   own connections, byte-isolated media, feed/archive/calendar/reuse/cancel,
   deadline/reset/deletion confirmation, reload, desktop and mobile390/320, errors/console.
   Temporary actor/content creation and cleanup require the named runtime scope.
7. Approved starter package currently contains three image posts. Offline dry-run
   does not prove runtime import, an approved video or monthly content volume.
8. Separately obtain native USER provider consent and exact test destinations,
   approved material and send limit. Minimum suggested scope: one USER, one send
   per selected Telegram/MAX destination, maximum two. UNKNOWN → readback, no retry.
9. Record actual links/results/version and the owner's actual acceptance. Until
   those checks are complete, the full working SaaS result remains unfinished.

User handoff after release: open staging URL, sign in, connect own channels,
choose networks, swipe one item to calendar and one to archive, reload, cancel
and reuse. Owner performs no local commands or SQL. This sequence is prepared,
not a claim that this candidate is currently deployed.
