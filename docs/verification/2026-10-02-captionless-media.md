# Captionless media in the Planly editor

Scope: unblock the existing draft, immediate publication and scheduled publication paths for a photo/video/album without a caption. Continue from `a645943` on `feat/self-host-build`.

Root cause: `validatePost`, `savePostInputSchema` and the Telegram connector required nonempty text for media posts. MAX already accepted captionless media. The existing database column supports an empty string; no migration is required.

Change: require text **or** at least one media reference. Keep duplicate/count validation and existing owner-scoped media lookup. Removing the last attachment from a blank post is rejected before altering saved data. Target status, retry and duplicate protection continue through the existing publication path.

Verification:

- RED: four validator tests failed on the original implementation's text requirement; independent code review found the Telegram connector guard, and three photo/video/album wire tests reproduced that failure before the guard was fixed.
- GREEN: 59 focused planner, input-contract and Telegram/MAX connector tests passed.
- API regressions cover captionless draft creation, scheduling for both providers, reload, removal of the final attachment, and foreign/missing media rejection.
- Processor regressions check empty captions and ordered private bytes for both providers.
- Full PostgreSQL/Redis integration, typecheck, lint and build are checked by the `CI` workflow on `feat/telegram-max-ui-validation`.

This change does not close Phase 4. Remaining acceptance includes a browser walkthrough and MAX publication through the deployed owner API/private storage/worker path. Existing direct MAX connector live tests do not prove that full path. Production MAX TLS trust still needs the scoped CA solution recorded in the MAX checkpoint. Existing provider-specific MIME/count/caption limits remain in force.
