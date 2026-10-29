# SaaS final staging acceptance and recovery — 26 October 2026

## Environment and authorization

Deployed source466a30e6d5219060c89d5911f3541761e3ff7037, image
sha256:b02921415773c864d1f9ea21ce3d0cbd1562115545a25cbd91e7b7744b9a01d2,
https://stage.lentaro.ru . Main CI40296632864/Self-host40296632868 SUCCESS.
Owner approved final acceptance and restoration rehearsal. Production and new
provider sends excluded. Owner personally logged in for browser checks.

## Real mobile ADMIN lifecycle

Created one nonce-owned empty USER final-mobile-20261026-06606219@example.test;
no original account was used for lifecycle mutations. No channels/posts/media added.

| Check | Evidence |
|---|---|
| Past expiry at320 | UI25Oct10MSK persisted after reload; DB25Oct07Z; owned USER profile200, new library mutation403 |
| Renewal at320 | UI27Oct10MSK saved; DB27Oct07Z, reads200 |
| Block at320 | UI confirmation names exact fixture; stateBLOCKED; old session401 |
| Unlimited while blocked | Expiry null, state remainsBLOCKED |
| Restore at320 | UI confirmation; ACTIVE, new login200; old sessions not revived |
| Password reset | UI produces30minute one-use link; terminal HTTP consumes only fixture token, repeat410, prior session401/new login200 |
| Delete at390 | Wrong email leaves submit disabled; Owner separately approved exact target before irreversible submit |
| Cleanup | USER disappears; fixture sessions/reset tokens/accounts/posts/media/library absent; worker deletion task0; all original4user rows unchanged in full |

Date-field automation initially changed the visible native input without enabling
React's Save control. Ordinary keyboard editing fired the normal change event;
no DOM event injection, app-code patch or disabled-button bypass. This was a tool
interaction limitation; actual UI writes and UTC readbacks agreed afterward.
Reset token/password/cookies and original user-row snapshots remained private,
never printed or committed. Reset consumption was an HTTPS backend check, not a
claim of completing the new-password screen through the mobile browser.
Console warn/error empty; viewport reset after checks.

Screenshots retained outside Git: final-mobile-blocked-unlimited320.png,
final-mobile-delete-confirm390.png, final-mobile-test-deleted390.png.

## Full application restoration rehearsal

Input was the downloaded independent copy saas-20261026-1793002809, transferred
back to a new private rehearsal directory. All manifest SHA256 checks passed.
No working backup, volume or database was restored over existing data.

Four temporary containers reused existing exact images. PostgreSQL had networknone;
web, temporary Redis and MinIO shared only that namespace. No published host ports,
working-volume mounts, provider keys, publication worker or external network.
Data files were tmpfs-only; application credentials were reduced to session,
owner-auth and local storage requirements. Redis started empty without persistence.
The application never connected to working PostgreSQL/Redis/MinIO.

Actual restoration and HTTP probe:
- Restored DB counts users4/posts4/media7/publications3/catalog3/ledger21/nonterminal0.
- Web health200; anonymous private-post request401.
- New synthetic ADMIN login and admin API200 inside the restored copy.
- Test-only sessions in restored DB exercised two unchanged active media owners;
  profile/posts/media reads200, no original owner activated or unblocked.
- Every signed URL pointed only to local restored MinIO;7GETs returned200 and
  exact DB sizes/SHA256, total4,339,718 logical bytes.
- 32 raw copied storage files were hash-verified before MinIO started.
- All4temporary containers removed by exact unique label/ID; remaining0.
- Working container IDs/images/start times/restarts unchanged; final health200.

No native provider consent or provider delivery is inferred from test sessions.
This is a full app/MinIO HTTP restoration rehearsal on the same VPS with independent
backup input, not a complete rebuild on a replacement host. The separate Windows
DB/media restore remains the evidence for independence from the VPS.

## Diagnosed rehearsal failures and minimal corrections

1. PostgreSQL readiness initially observed the entrypoint's temporary Unix-socket
   bootstrap server; restore raced its shutdown. Logs show init incomplete and
   shutdown while restore connected. Actual installed entrypoint starts that server
   without TCP listening. Checking readiness and restoring over127.0.0.1 waits for
   the final server; timeouts unchanged.
2. MinIO returned503 SlowDownRead for a signed object read despite1online drive.
   Before any product/storage patch, raw extracted-file comparison isolated7wrong
   object paths. Python TarInfo.name was changed while its PAX path header retained
   the old media/ prefix. Local RED reproduced exactly7missing+7extra paths;
   removing only that PAX path header yielded32/32matching paths/hashes. The corrected
   transformation then passed real MinIO signed GETs. Original backup bytes and
   working MinIO configuration never changed.

Private container traces were captured before cleanup; raw auth headers, signed
URLs, storage keys and env dumps were not published. Relevant upstream references
used to classify the error/enable diagnostic calls:
https://raw.githubusercontent.com/minio/minio/RELEASE.2025-10-15T17-29-55Z/cmd/api-errors.go
and https://raw.githubusercontent.com/minio/mc/RELEASE.2025-08-13T08-35-41Z/cmd/admin-trace.go .
The causal proof is the local path regression and corrected real restore, not a
similar upstream incident. No speculative timeout/resource/security changes.

## Final readback and remaining delivery

Final staging: users4/posts4/media7/publications3/catalog3/ledger21,
nonterminal0/deletionTasks0, exact deployed imageb0292141, webhealthy,
worker running/restarts0, temporary rehearsal containers0, publichealth200.
Two earlier actual MAX receipts remain; no new sends in this acceptance.

Remaining: configure agreed recurring backup/retention/error handling, Owner final
product acceptance and exact production address/cutover approval. Telegram is
explicitly deferred. Existing payment contract remains manual access extension.
No full production-ready or new-host disaster-recovery claim.

## Read-only continuation — 29 October 2026

Fresh VPS readback confirms source466a30e/imageb0292141 still active; web healthy,
worker running/restarts0, public health200. Counts remain users4/posts4/media7/
publications3/catalog3/ledger21/nonterminal0/deletionTasks0; restore containers0.
No replay of lifecycle/restore, deployment or provider sends. The acceptance above
is dated26October; this check confirms retained runtime state, not fresh delivery.
