# Swipe Planner inspection — 2026-10-12

Scope: read-only source inspection and local mocked lifecycle tests; no UI/runtime changes, production writes, provider calls or new planner. Source checkout `work/Planly-production-audit`, branch `codex/production-audit-cleanup`, HEAD `da9a2e89cc37119e87952ac56fcf86a1383de3f7`. Read `AGENTS.md` and the approved `docs/superpowers/specs/2026-10-04-swipe-planner-design.md`; applied systematic-debugging and verification-before-completion. Production/device acceptance remains UNPROVEN in this sub-audit.

## Evidence matrix

| Area | CODE | Fresh local TESTED | Production/device limit |
|---|---|---|---|
| Left/right | `pointerDown/pointerUp`, `components/planner/swipe-planner.tsx:107–117`: primary left-button pointer, matching ID, horizontal travel >=80px greater than vertical; right approves, left archives | Threshold, vertical travel, cancellation, secondary button and media exclusion passed | Real touch device/pointer capture not verified |
| Images/video | Ordered media at `:148`; video MIME renders native controls and `playsInline`, image renders alt; whole preview excluded from decision gestures by `interactive` at `:32` and `data-swipe-ignore` | Synthetic media order/image-video rendering passed | Native playback, signed-URL expiry, mobile media scrolling not verified |
| Touch/scroll | `app/globals.css:121` uses `touch-action:pan-y` on card, `auto` on media preview; `:129` media strip `overflow-x:auto`; vertical move cancels candidate at component `:147` | Vertical/cancel callback cases passed | Harness has no DOM/layout/native touch; no assertion of actual mobile scrolling |
| Repeat decision | `decide` synchronous ref lock before await at `:88–89`, blocked busy/pending/working; parent saveLock at `app.tsx:651–673` | Double approval/skip while pending, global busy and pending blocking passed | Concurrent browser sessions/provider sends not verified by these tests |
| Cards | READY/unlinked, oldest creation then ID (`:62–64`); successful decisions finish once (`:98`), skip session-only (`:106`); authoritative source conflicts refresh (`app.tsx:641–648`) | Sorting, session skip, advance, stale approval/rejection refresh passed | Live refresh behavior not verified |
| Network loss | Failed decision keeps card (`:99–104`); durable request before dispatch, original key retained after uncertain failures (`lib/client/pending-creation.ts:40–64`); explicit original-payload retry (`lib/client/swipe-planner.ts:21–24`) | Lost-response byte-identical recovery, no PATCH, storage failure no dispatch, 5xx retention, typed precommit rejection release passed | No real network interruption used |
| Buttons/keyboard | Native buttons (`components/ui/button.tsx`), 44px decision controls CSS; article `tabIndex=0`, aria labels/status; arrows only own focus, no repeat/modifiers (`:119–121`) | Button callbacks and focused arrow guards passed | Screen-reader/native focus movement not verified |

## Proven source UX defect: review body clipped to two lines

**FILE / FUNCTION / CONDITION:** `components/planner/swipe-planner.tsx::SwipePlanner`, line 149 renders the full source text as `<p className="swipe-text">` directly inside `.content-card-body`. `app/globals.css:105`, selector `.content-card-body>p`, applies `overflow:hidden`, `display:-webkit-box`, `-webkit-line-clamp:2`, `-webkit-box-orient:vertical` and `height:44px`. The later `.swipe-text` rule at line 121 sets wrapping/spacing/line-height but does not remove any of those restrictions.

For text exceeding two rendered lines, the review card inherits the publication-list teaser treatment. Its body contains the text but displays only a clipped excerpt. No expand/full-preview control is present in that card; the owner can open the editor, but the displayed card is incomplete at the point of approval. This is **CODE PROVEN**, not a production screenshot or device reproduction. Hook tests never load CSS, so their green result does not cover the defect.

Minimal independent milestone B candidate: a scoped Swipe review-text rule removing the inherited clamp/height, with browser verification for long multiline text and vertical scroll. Keep existing gestures, media controls, API and recovery behavior. A fix is not implemented by this audit.

## Uncertainties and non-findings

- Media-start swipes intentionally do nothing (`interactive` and preview ignore region); this preserves controls and is tested. Do not label this alone a defect or remove protection without device evidence.
- Mobile settings precede the card in one-column layout (`globals.css:122`); usability impact for long settings requires a device/browser observation before classification as a bug.
- Queue approval/rejection callbacks lack the explicit owner-lifetime guards used elsewhere (`app.tsx:629–673`). A synthetic attempt to transition owner during an approval did **not reproduce** late-response contamination: scheduled polling checks `saveLock.current` before dispatch and application (`:415`, `:421`). Therefore that scenario is **NOT PROVEN**, not a known production bug. Captured stale callbacks/unmount deserve a focused reliability test if separately approved.
- If post save succeeds but Library refresh fails, `refreshSourceLibrary` warns and returns (`app.tsx:611–626`); approval still advances (`:637`, Swipe `:98`). Reopening may temporarily show stale READY data until refresh, while source conflict handling protects server creation. Fresh tests do not verify this branch; no duplicate production claim is made.
- Pointer capture retargeting, actual CSS cascade appearance, screen reader behavior, pinch zoom and media strip touch behavior were not browser verified. The pointer-events standard stops panning checks at the nearest inclusive scroll container; do not infer that the card's `pan-y` necessarily blocks the separately scrollable media strip. [W3C Pointer Events](https://www.w3.org/TR/pointerevents4/#determining-supported-direct-manipulation-behavior).

## Fresh verification

Command on the exact source checkout:

```powershell
node --test --test-concurrency=1 --experimental-strip-types tests/swipe-planner-ui.test.mjs tests/swipe-planner-app.test.mjs tests/swipe-planner-recovery.test.ts
```

Node v24.21.0; exit 0; **27 tests, 27 pass, 0 fail, 0 skipped**, duration 121443.586ms. Packages resolved through the existing parent workspace dependency installation; this checkout initially had no own node_modules. The loader transpiles TSX and substitutes a hook harness; fetch/storage/timers are synthetic. No native React DOM/CSS/browser/provider evidence follows from this result. The unsuccessful owner-transition diagnostic was a separate stdin-only synthetic probe (assertion before the intended transition, `1 !== 0`), with no source edit or production request; it is explicitly excluded from the successful suite above.

Only this report is authored by this sub-audit. No fix, deployment or destructive operation was performed.
