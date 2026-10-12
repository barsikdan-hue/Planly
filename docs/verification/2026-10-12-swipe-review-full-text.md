# Swipe review full text — bounded P2 fix

Baseline: `main` / `c06f0a66892d8a15bbc1481e84b821bb6e886a05`.
Branch: `codex/swipe-review-full-text`. Merge/deploy require a separate Owner gate.

## Contract and routing

Only remove the Swipe review text clipping. Production change: CSS only; no JSX,
gesture handlers, API, scheduling, PostTarget, provider or infrastructure changes.

- Systematic debugging: prove the inherited dimensions and exclude other height limits.
- TDD / Playwright Test: permanent failing painted-last-line assertion, then desktop
  1366×768 and mobile 390×844 GREEN with native wheel/CDP touch input.
- Playwright MCP: isolated visual and keyboard inspection using installed Chromium.
- Independent read-only Critic: CSS scope, fixture isolation, unchanged assertions
  and mobile scrolling/gestures. Codex verifies actual outputs and exact Git/CI state.
- GitHub: isolated branch, draft PR and exact-head checks; no merge/deploy.

## Root cause and minimal change

`components/planner/swipe-planner.tsx` renders `p.swipe-text` inside
`.content-card-body`. The shared `.content-card-body > p` selector in
`app/globals.css` applies height 44px, hidden overflow and a two-line clamp.
Its specificity wins over the existing `.swipe-text` rule. Card ancestors have
no other fixed height: the long body exists but its last lines cannot be read.

Scoped `.swipe-card .swipe-text` now uses block display, automatic height,
`max-height: min(60vh, 28rem)`, scrolling overflow and no line clamp. Existing
pre-wrap and overflow-wrap:anywhere preserve newlines and long words. Library
and ordinary publication teasers retain their existing 44px / two-line display.

Adding a scroll container initially cancelled horizontal mobile pointers:
native touch produced pointerdown on the paragraph, then pointercancel on the
card. Changing only the paragraph's touch-action to pan-y in an isolated probe
produced pointerup and advanced the card. The final scoped CSS therefore keeps
pan-y on the paragraph, matching the existing card gesture contract. No handler
was changed. This agrees with the [W3C supported direct manipulation rules](https://www.w3.org/TR/pointerevents3/#determining-supported-direct-manipulation-behavior),
which consider ancestors through the nearest inclusive scroll container.

## Evidence

- RED before CSS: both desktop/mobile full-reading tests failed at the painted
  final-line assertion; ordinary teaser checks already passed. Trace archives
  preserved locally under ignored `.sites-runtime/swipe-review-full-text/red/`.
- Initial GREEN attempt: desktop passed; mobile exposed the above pointer-cancel
  regression and insufficient fixed input coverage. Native touch scroll range was
  1985px; the permanent test now derives its bounded input count from actual range.
  Assertions, timeouts and retries were not weakened or increased.
- Final `pnpm test:e2e`: **10/10 PASS** (four new Swipe checks plus six existing
  Harness checks), retries zero. Tests verify painted last line, no horizontal
  overflow, zero decisions while reading, complete editor text, right/left gestures,
  approve/reject buttons, card advancement and unchanged ordinary teasers.
- Browser fixture blocks external requests, WebSockets and unexpected API calls;
  mock mutations operate only on synthetic in-memory data. No production bootstrap,
  database, queue, storage or provider calls occur.
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0, 0 errors / 15 existing warnings.
- Existing Swipe unit/UI/app regression tests: **27/27 PASS**.
- Full local `pnpm test` is running at PR preparation; native database integration
  failures already observed. Full-suite acceptance requires the PR CI environment
  with its disposable PostgreSQL/Redis services; do not interpret focused PASS as
  a full local suite PASS. See exact-head GitHub check results before approval.
- `pnpm build`: exit 0, ANALYTICS_CSS_OK including scheduling layout checks.
- Independent read-only Critic: no actionable findings; final scoped pan-y and
  range-derived input coverage accepted without expanded JSX scope.
- Actual Playwright MCP visual probe: desktop tail visible; native Tab focuses
  the paragraph and End reaches scrollTop 653/653 with zero mock decisions.
  Mobile touch reaches scrollTop 1985/1985 (448px viewport, 2433px text), no
  horizontal overflow; subsequent right swipe and reject button complete both
  synthetic cards. Screenshots inspected locally under the ignored evidence folder.
  An earlier combined MCP call timed out; separated navigation/probe calls passed.

Local and CI evidence establish review readiness, not production acceptance.
Physical-device touch and deployed UI remain unverified until an authorized delivery.
