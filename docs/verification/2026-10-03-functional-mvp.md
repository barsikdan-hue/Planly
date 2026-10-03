# Functional MVP verification — 2026-10-03

Base/production checkpoint: `3d1fcbad82a5321dce9073fb18b51b7b0319e08f`. Work branch: `codex/functional-mvp`. Merge and production deployment remain human gates. Scheduler trigger timing is accepted temporary debt per ROADMAP.md; no timing or architecture work is included.

## Task 1: content validation

**Root cause:** `createPost` / `updatePost` called `validateRelations`, which checked owner media/account relationships but did not check effective target content. `reconcilePostPublicationsInTx` enqueued any active target with a scheduled time. Connector content checks ran only later, after enqueue. Regression tests reproduced acceptance of Telegram 4097-character text, MAX 4001-character text and incompatible media before the fix.

**Change:** Shared `validatePublicationContent` now checks owned media metadata and `textOverride ?? baseText` for every scheduled target in the save transaction, before any writes or reconciliation. A failure produces actionable HTTP 422 with its validation code. Existing connector guards call the same validator for defense at execution time. Unscheduled drafts remain permissive. Generic client/server presence checks also accept text supplied only in a selected target override.

Current Planly publication subset (does not expand capabilities):

| Capability | Telegram | MAX |
|---|---|---|
| Text without media | 4096 UTF-16 units | 4000 UTF-16 units |
| Text with media | 1024 | 4000 |
| Media | JPEG, PNG, MP4; up to 10 | JPEG, PNG, MP4; up to 12 |
| File size | photos 10 MiB; video 20 MiB | 20 MiB |
| Known image dimensions | width+height <=10000; aspect <=20 | each axis <=7680 |

Rules preserve the existing conservative connector limits. Providers may allow more; this fix deliberately does not expand Planly's storage/formats. Provider references checked during implementation: [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage), [sendPhoto](https://core.telegram.org/bots/api#sendphoto), [sendMediaGroup](https://core.telegram.org/bots/api#sendmediagroup), [MAX messages](https://dev.max.ru/docs-api/methods/POST/messages), [MAX media](https://dev.max.ru/docs-api/use-cases/sending-messages/media).

**Tests:** Red evidence: three persistence failures and two override-only failures before implementation. Focused suite after fix: 88/88, including authenticated API 422, atomic rollback, scheduled-DRAFT bypass, empty override semantics, connector boundaries and terminal VALIDATION through tick and worker paths. Independent review rerun: 12/12 validation unit/integration tests. Typecheck passed. Local tests use a disposable PGlite PostgreSQL-compatible database, not production; real PostgreSQL/Redis CI is still required for complete regression.

**Runtime:** Actual local Next HTTP path returned 422 for incompatible content with post/publication counts unchanged. With synthetic accounts and loopback provider fixtures, TG/MAX requests exercised actual adapter serialization; VALIDATION remained terminal and each target retained its own outcome. This is not a fresh live-provider or production deployment claim.

## Evidence environment and limits

Local evidence is outside the repository in sibling `functional-mvp-evidence/`: red/green test logs and `runtime/http-audit-results.json`. Loopback services: separate UI and destructive-test databases, local storage/provider fixture, synthetic owner credentials. Production data and secrets are not used. PGlite serializes a single backend and cannot prove PostgreSQL lock concurrency. Unsigned object-storage fixture cannot prove private-bucket access policy. A signature-only MP4 fixture proves upload/request handling, not video playback. Browser and final exact-head CI results must be recorded separately below.
