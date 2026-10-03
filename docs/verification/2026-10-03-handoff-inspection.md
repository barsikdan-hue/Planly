# Planly handoff inspection — 2026-10-03

## Source and deployment

- Fresh checkout: `work/Planly`, separate from the older uncommitted local frontend. Initial branch `main`, clean tree.
- GitHub main and handoff both resolved to `3ca04bdce9fc06cd5cb4b98d391d8eaeff03d5a6`.
- Render service `planly` at https://planly-m4zq.onrender.com deployed the same SHA. Deployment `dep-db08oahsrm7s73ei8qig` was live, finished 2026-10-03 08:03:25 Moscow time. Auto deploy was off.
- A read-only GET `/api/health` returned `200 {"status":"ok"}`. Render log inspection was unavailable: HTTP 503 / Loki 502. Health is not publication proof.

## UI root cause

`app/page.tsx: Home` authenticates the owner and renders `PlannerApp`. At the inspected SHA, `components/planner/app.tsx: navigation` still contains both `create` and `socials`; `Navigation` renders every item. `components/ui/sidebar.tsx` uses these same children for mobile and desktop. `PlannerApp` mounts `SocialAccounts` only for the `socials` view; `Settings` receives only profile props and does not render account controls.

The navigation declaration is unchanged since import commit `aba574b9`. The last relevant UI commit `e056983556be84d123e2809f4c6687a04210cf66` changed Telegram/MAX labels, not sidebar entries or settings composition. The requested change is absent from reachable main history. No claim is made about inaccessible prior checkouts or uncommitted work. The matching deployed SHA does not support a stale-deployment explanation.

The same navigation array also validates `navigate()` and initial/hash navigation. Merely deleting entries would break existing create/edit/media/calendar actions. The fix must preserve the editor view and normalize old `#socials` links into Settings.

## Baseline verification

- [CI 37098458070](https://github.com/barsikdan-hue/Planly/actions/runs/37098458070), exact handoff SHA: 150 tests, 150 pass, 0 fail, 0 skip; migration drift, migrations, typecheck, lint and build passed.
- [Self-host build 37098458073](https://github.com/barsikdan-hue/Planly/actions/runs/37098458073), same SHA: passed.
- Windows local: pinned pnpm 11.25.0 frozen install passed; Node 24.21.0 (CI uses 22.13.0). Typecheck and build passed; lint passed with 9 existing warnings.
- Local full test command: 150 tests, 95 pass, 55 fail. 54 failures require unavailable PostgreSQL/Redis configuration. The remaining failure is `self-host-init.test.mjs` using URL.pathname in a Windows child-process path (`C:\C:\...SMM%20Planer...`), which produces MODULE_NOT_FOUND. This is an existing baseline limitation, not caused by UI changes.
- Local service-independent subset: 96 tests, 95 pass, the same one Windows harness failure. No production environment values were used for local testing.

## Historical provider evidence

- **Telegram LIVE VERIFIED historically.** Text and media evidence is retained in the earlier roadmap checkpoint and `2026-10-02-telegram-media.json`. [Run 37099195801](https://github.com/barsikdan-hue/Planly/actions/runs/37099195801) additionally confirms photo/video/album through the API/worker with stored provider IDs and API publication status. This run does not by itself prove text delivery.
- **MAX LIVE VERIFIED historically.** [Run 37098655387](https://github.com/barsikdan-hue/Planly/actions/runs/37098655387), SHA `bdbe9a9e2dddd6db89f34a3453f8ce68d57825bf`, confirmed seven cases: text; image with/without text; video with/without text; album; delayed text. The path was API media → API posts → Redis worker → actual MAX provider. All cases returned remote IDs/URLs. The delayed case checked no early delivery; a deliberately duplicated job preserved remote ID and attempt count.
- The [MAX run comparison](https://github.com/barsikdan-hue/Planly/compare/3ca04bdce9fc06cd5cb4b98d391d8eaeff03d5a6...bdbe9a9e2dddd6db89f34a3453f8ce68d57825bf) adds only a trigger artifact; runtime/test code matches the handoff source. This was an isolated GitHub Actions stack against the real provider, not a fresh walkthrough of Render.
- No new social posts or live-provider tests were sent during this inspection.

## Fix verification

- Branch `codex/sidebar-social-settings` removes the two sidebar entries, retains the functional editor route, normalizes legacy social links, and composes existing account controls inside Settings. API, schema, authentication and provider publishing code are unchanged.
- Before the fix, three actual component-render assertions failed for the two visible menu entries and absent Settings controls; the route regression failed because `socials` did not map to `settings`.
- After the fix: 7/7 targeted tests and 8/8 existing screen render checks passed. Typecheck, lint (the same 9 warnings) and production build passed. Independent source review left no outstanding findings.
- Full local regression: 157 tests, 102 pass, 55 fail, 0 skip. The failure-name set exactly matches the baseline (54 unavailable-service cases and one Windows initialization-test path error); all seven added tests pass. No new failure was introduced.

## Browser acceptance boundary

After temporary connection failures, both browser surfaces became available. The authenticated production Edge tab at `/#settings` reproduced the original defect: both sidebar items were present and Settings contained no account forms. It still runs the inspected main SHA; the fix has not been deployed.

The actual updated components were exercised in the built-in browser through a local Vite preview with safe fixture data and blocked API writes:

- Desktop 1440x960 and mobile 390x844: both unwanted menu entries absent; mobile drawer closes on Settings navigation.
- Settings shows existing Telegram/MAX connection fields and switches under one page heading, with no duplicate social page.
- `#socials` canonicalizes to `#settings`; direct Settings navigation and reload work.
- Dashboard “Новый пост” and Content “Новый пост” open `#create`; the full editor remains visible after a reload.
- Dashboard account-management action opens Settings.
- Screenshots saved locally as `work/inspection-evidence/settings-desktop.jpg` and `sidebar-mobile.jpg` outside the repository. Temporary viewport overrides were reset.

This local browser verification does not establish production persistence or provider delivery. No writes, social connections, draft saves or publications were performed in production. Main merge and manual Render deploy require the owner's explicit approval, followed by a fresh walkthrough of the deployed fix.
