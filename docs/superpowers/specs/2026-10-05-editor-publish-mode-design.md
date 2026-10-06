# CR-10 editor publish mode representation — review candidate

STATUS: IMPLEMENTED; representation APPROVE_OPTION_A_WITH_GUARDS and plan IMPLEMENTATION_APPROVED received through direct Orchestrator bridge. Runtime0dd4b17 and evidence-head d93d2e6 native/Docker GREEN. Final-head verification remains required after recording oracle decision. PR12–15 frozen READY, pending Owner gates.

## Intent and evidence

Keep the user's Now/Scheduled choice when the same editor remounts or the same tab reloads. Preserve text, media, date/time and existing server publication authority. Switching a tab is UI intent, not saving or changing a Post lifecycle.

Fresh source: main95f53b7, work/Planly-editor-mode, codex/customer-ready-editor-mode. PR15 fixes initial Calendar mode separately; CR10 does not depend on merging it to reproduce mode loss.

Actual Composer Tabs.onValueChange changes component-local publishMode only. PlannerApp never receives this change, never increments editorRevision and never persists it. writeRecovery projects Post into EditorFields without status/mode; restoreRecovery uses current server Post or blankPost. Two independent observable controls prove the same UI persistence layer: unsaved Draft → choose Scheduled → reload becomes Now; server Scheduled → choose Now → reload becomes Scheduled. No POST. Generic recovered Draft stays Now.

The original Calendar reload oracle is preserved unchanged in PR15 tests/known-gaps/editor-mode-recovery.red.mjs. Orchestrator APPROVE_OPTION_A explicitly supersedes only its lifecycle-as-UI assertion after CR10: unsaved lifecycle Draft, UI Scheduled, preserved date/time, Scheduled controls, zero mutation. New CR10 tests isolate real tab callbacks from Calendar's initial-mode defect; an active real-Composer SSR oracle preserves the original visible-control protections. Neither is production/browser acceptance.

## Options

A (recommended): parent-controlled UI intent, stored as optional metadata in the same recovery envelope as editor content. If recovery is absent, pending creation can carry separate optional UI metadata for its own editor identity. Exclude UI intent from server content/payload equality.

B: keep component-local mode and store it under a separate browser key. Smaller callback change but introduces non-atomic content/mode writes, stale-editor association and cleanup races. Not recommended.

C: serialize Post.status in EditorFields. Confuses local tab selection with authoritative lifecycle, alters shared pending-request content comparison and risks replaying a modified publish-now payload. Rejected architectural direction.

## Proposed representation and ownership

- EditorUiIntent = { publishMode: 'now' | 'scheduled' }. PlannerApp owns current UI state/ref; Composer receives publishMode/onPublishModeChange. Keep preview/text-variant/picker state local.
- Post, Post.status, EditorFields and editorFieldsSchema retain their current roles. API Save/Publish DTOs never include UI metadata.
- Recovery v1 keeps the existing owner-scoped session key and editor projection; add optional envelope `ui`. Content and UI are written together. Extend read result with optional validated UI intent; legacy records omit it and use the existing lifecycle-derived initial default. Date/time never determine mode.
- Pending v1 may add optional `editorUi` separately from `editor`; capture it once for a new Composer request, omit it for Swipe origin. Preserve key, frozen input, CreationIntent, tokens and origin. Mode-only changes never alter pending.intent/input/key. UI metadata must not enter canonicalCreationInput or the editorFields equality used by submitPendingCreation. Existing pending requests remain readable and replay their original key/body/time.
- Malformed optional UI metadata is ignored with a safe initial default while valid text/media are retained. Malformed optional pending.editorUi also must not invalidate a good durable key/input/intent. Malformed content or unsupported envelope versions retain existing rejection. Existing size/owner/tab constraints remain.

## State transitions and guards

New generic/Library/media/copy editors initialize Now. Edit initializes from current server lifecycle; explicit stored UI then takes precedence when restoring that same editor. Calendar remains Scheduled after the separately reviewed PR15 initial fix. Quick Composer retains both explicit actions and existing timing controls; expanding the same editor uses the parent's intent.

Mode change updates only UI, increments editorRevision and persists the content/UI pair. Mode-only selection does not change the existing replacement-confirmation policy: guards still judge current substantive content, and a replacement resets its own UI intent. No network request occurs from choosing/restoring UI mode.

Navigation/remount preserves the same parent intent. Recovery restores valid explicit UI even if the restored unsaved Post is Draft or current server Post is Scheduled; server status/targets/edit-blocked reasons still come from server. Missing Post/media behavior keeps existing content restoration/filtering; UI metadata never resurrects publication rights. Copy/new identity resets Now.

Unchanged successful save clears content/UI together and resets the next editor to Now. A mode-only change during an in-flight request counts as a newer editor revision, so acknowledgement must retain the newer intent and attach an acknowledged ID using existing lifecycle rules rather than discard that choice. Persisted UI acknowledgement must participate in durability checks without entering server content equality. Storage failures keep existing warnings and must not falsely declare the newer editor durable or clear its pending record.

In acknowledgeEditor, the existing persistedEditor.id === saved.id shortcut is insufficient for the new contract: cleanup requires the full current content+UI pair to be durable. Identity alone cannot prove that a newer mode was written successfully. This does not change submission-content comparison.

Hydration precedence: recovery content+UI first; pending editor+its optional UI only for the existing matching-token fallback when recovery is absent. A pending record never overwrites a newer recovered choice. Acknowledged ID attachment preserves current UI. Swipe-planner origin does not capture or overwrite Composer intent.

Draft save still submits DRAFT with null scheduledAt regardless of selected tab. Scheduled action retains future-time validation. Publish Now remains an explicit command. A mode-only change after a lost publish-now response must not recompute the frozen request timestamp or add a PATCH; the selected tab itself is not a submission.

## Proposed scope and verification

Expected bounded runtime areas after approval: Composer controlled-mode props/callback; PlannerApp UI/revision/persistence/reset/acknowledgement transitions; editor-recovery optional UI envelope; pending-creation optional fallback UI metadata excluded from content comparison. Tests and report. No server contracts, DB/migrations, auth, scheduler/connectors, new product flow, infrastructure or provider messages.

RED now: real App+Composer mode callbacks, reload, both directions, generic default control. Required GREEN coverage also includes navigation/remount, Calendar compatibility after fresh-main merge recheck, Library/copy/media defaults, server authority/read-only/missing media, legacy/corrupt metadata and owner/tab isolation, Save Draft vs Schedule, UI change during save, lost-response unchanged retry key/body/time/no PATCH, pending fallback/cache precedence/swipe origin and storage failure durability.

Run focused/protected/full native PostgreSQL/Redis suite, typecheck/lint/build, Docker smoke and independent adversarial review. Push/report exact HEAD before any READY gate. Render/browser acceptance requires authorized delivery; no local lifecycle claim substitutes it.

## Review question

Option A approved with the guards above. Next direct PLAN_REVIEW of the written implementation plan; runtime remains prohibited until IMPLEMENTATION_APPROVED. Owner merge/deploy remains separate.
