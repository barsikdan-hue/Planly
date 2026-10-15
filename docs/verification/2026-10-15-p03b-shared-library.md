# P03-B shared content library verification

Scope: owner-approved P03-B, Issue #54 and PR #41; base `ce688db49143599f8b8a026c2d58903ab213ddc3`, branch `codex/p03-b-shared-library`.

## Implemented boundary

- Explicit ADMIN-owned READY publication via an opaque share ID. No automatic disclosure of existing personal materials.
- Existing private Library/Media APIs retain their ownership checks. Shared DTO contains only selected title/text and ordered signed previews (300 seconds); no private source/media IDs or credentials.
- One or 1–20 selected materials copy atomically into independent USER-owned READY items and private objects. New UUIDs and destination storage keys, bounded internal reads, checksum verification, original media order and metadata. No Post/PostTarget/Schedule/Queue creation.
- Additive `shared_library_items` and owner-scoped durable `shared_library_copy_receipts`. Source deletion removes only share membership; personal copies and receipt survive source changes/deletion. Replay resolves prior result before source revalidation; mismatched inputs409, deleted result410, explicitly new keys allow deliberate additional copies.
- Actor/session lifecycle lock → sorted source locks → sorted media locks. ADMIN publish/unshare and existing edit/delete use the same source boundary. No other source owner's user lock, no nested transaction.
- Register destination keys before PUT, compensate proven rollback including uncertain PUT response, return explicit sanitized cleanup failure. A lost COMMIT response first reconciles the durable receipt under actor lock; unknown outcome preserves bytes and requires the same key. Scoped PUT/DELETE cancellation uses an actual fetch AbortSignal with30,000ms deadline.
- Existing Library UI contains Мои/Общие, ADMIN share/unshare, individual and selected copy buttons. Recovery intent is stored by owner in sessionStorage before mutation; no automatic copy/retry. Lost responses, reload and post-success refresh failures preserve the same key. Departed owner responses are ignored. Personal list/media refresh does not call bootstrap or Scheduler.

## RED/GREEN and local evidence

Ignored logs live under `.sites-runtime/p03b/`; no credentials/session values/signed URL dumps committed.

| Evidence | Observed result |
|---|---|
| Existing Library + creation idempotency baseline |21/21 PASS|
| Initial feature RED |Missing shared routes/component; real compiled HTTP404 vs expected401 before feature build|
| Initial UI recovery/selection |4/4 PASS|
| Existing Library/Composer continuation regression |72/72 PASS after teaching the old external-HTTP fixture that ADMIN permission GET is read-only|
| Backend critical fault RED/GREEN |WebM rejection and committed-media deletion on actual COMMIT response loss reproduced;16/16 GREEN after fixes|
| Storage deadline RED/GREEN |16 PASS/2 intended FAIL before signal support;18/18 GREEN after actual stalled-response cancellation, socket closure, rollback/cleanup and subsequent progress|
| Independent Critic UI finding |Refresh404 after successful copy incorrectly cleared intent; RED reproduced missing replay action, GREEN retains identical key/body|
| Final UI selection/recovery |7/7 PASS, including reload, separate owner, unreadable intent, double click and delayed response|

Sandbox subprocess EPERM and PostgreSQL restricted-token startup were environment limitations after interruption. The existing disposable loopback database was restarted under approved local process execution; automatic recovery completed. No production database was accessed.

## Required final checks

Native full-suite authority is exact-HEAD Linux GitHub CI, including actual PostgreSQL/Redis; Windows targeted evidence is separate. The associated Draft PR records fresh immutable source HEAD, synthetic merge mapping, run URLs, native/browser counts, compiled HTTP and Docker Self-host conclusions after execution. Pending/skipped checks are never PASS. Local typecheck/lint/build and desktop/mobile compiled-runtime results are recorded there when completed.

Independent read-only Critic reviews source/locks/privacy/error recovery; it is not runtime proof. Local and CI fixtures are supporting pre-merge evidence, not deployed product acceptance.

## Owner gate

No merge/deploy, production migrations/writes, secrets/infra changes or real provider sends. Additive migration execution on production requires separate owner approval. Existing paid resources/services and provider business logic were not added or changed.
