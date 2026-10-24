# SaaS staging release — 24 October 2026

Status: STAGING_RELEASE_PASS / HTTP_CORE_ACCEPTANCE_PASS / DESKTOP_BROWSER_PASS.
Full provider delivery and Owner product acceptance remain unfinished.

## Exact authority and source

Owner confirmed the exact packet in this chat: merge PR75 at1ea423a, existing VPS
backup/isolated rehearsal, migrations0017–0020 and staging deploy, private export
of old Render settings to transfer only two bot tokens, Mini App/origin setup,
three approved catalog posts and synthetic ADMIN plus two USER acceptance.
Production and real provider sends remain separate gates. No real user deletion.

PR75 merged as dc7c66a8c3a06e11baafe10f1fcd410b2d3ad55f. Its Git tree
`daef4c6ff706e6699605f11142b86ff508f15fe9` equals tested1ea423a.
Main [CI40087206182](https://github.com/barsikdan-hue/Planly/actions/runs/40087206182)
and [Self-host40087206247](https://github.com/barsikdan-hue/Planly/actions/runs/40087206247)
both SUCCESS. Candidate CI proof remains in PR75 and the candidate report.

## Preservation and immutable runtime

Fresh preflight: existing sourceb7c331e, all five components running/restarts0;
14,517,211,136 available filesystem bytes. No pruning or old recovery replay.
Backup `/opt/planly-staging/backups/saas-20261024-1792838834`:
- pg_dump75,955bytes SHA2561bc594af36bc4e48ac29796938b61e662d5441e81cb903c27a56bd509884512c;
- media/config/Redis archive2,433,815bytes SHA2560022b3db455b6f42ac9902ecd9db517b1f881ee80fb51922cf288f40e3382e97;
- private original runtime/Compose records retained mode0600.
An additional stopped-app DB dump closes the authoring window before migration.
Off-VM disaster recovery remains unverified and is a production prerequisite.

Verified CI archive ZIP98b1b5096f6c5172ec67edd62de5ee4ab09ad4d7defcbc045332ac6daa1e258f,
TGZbec7d057b2de1ffc975440df348ddf3f9e45b687d8aab3a569558c5a14ee5c5e.
Reviewed helper reuses exact unchanged installed dependencies, local Docker builder,
network-disabled build and no image pull. Build5e744c62-0eb6-418a-a9b9-e4592b0703f3
PASS, original runtime unchanged.

New image `sha256:4d952a060f2829562004fedc3422777776553004e37c8ccb6bf2fd0862921c6b`
contains source1ea423a. Source pointer is that exact candidate; main merge has the
same tree. Old image6bc0f783 and backups retained, no guessed down migration.
Do not resume an old sender ignoring expiry after access data adoption.

Rehearsal restores the fresh dump into an isolated, networknone/tmpfs PostgreSQL;
only candidate Node shares that isolated namespace. No working volume, provider
credential or sender. Actual Drizzle migration28→31tables,17→21ledger; old row
projections, original17ledger entries and sequences preserved, new tables empty,
four exact new hashes matched. Owned containers removed, working runtime unchanged.
Initial rehearsal failed before SQL because root-owned tmpfs prevented postgresUID70
chmod; diagnostic reproduction proved it, explicit tmpfsuid/gid70 corrected it.
No timeout increase. No persistent migration had started on that failure.

Reviewed rollout stopped exact old worker/web, dumped DB, applied only actually
missing0017–0020 once, verified rows/schema/ledger/sequences, then healthy web and
one worker. Worker startup log plus stable restart0 verification were required.
PostgreSQL/Redis/storage identities, mounts and start times preserved.

## Configuration and catalog

Authorized private Render download was parsed without printing values; only
TELEGRAM_BOT_TOKEN/MAX_BOT_TOKEN transferred to staging mode0600. Downloaded full
export removed. No Render edit/deploy, no DB/session/storage secret copied across.
PLANLY_PUBLIC_ORIGIN=https://stage.lentaro.ru. Owner supplied bot URLs, now wired
to web and worker: https://t.me/danil_sochi_realty_bot and
https://max.ru/se14310498_bot. Five readiness flags true; validity/native setup
is not inferred. Mini App registration in provider-owned cabinets is pending.

Three reviewed image posts imported under the existing ADMIN with a15minute
session, then revoked. Same private journal replay PASS,3complete, no duplicate.
No Post/scheduler/provider endpoint invoked by importer. Catalog stays persistent.
Initial media403 was before form/PUT: reverse proxy internal URL differs from
external Origin and importer lacked existing same-origin fetch metadata.
Actual-guard regression RED403 then GREEN4/4 after a one-header runner correction.
Server authentication/CSRF guards and redirect prohibition unchanged. Independent
read-only review found no actionable issue. Readback confirmed no new media/intent
and no items after that403; failed journal preserved and only proven pre-upload
PENDING reconciled in the same journal before resume. Unknown PUT rules unchanged.

## Actual acceptance and cleanup

Public HTTPS HTTP acceptance used nonce-owned synthetic ADMIN and two USERs:
- invitations/real enrollment/session cookies; USER/anonymous ADMIN denial;
- exact three approved entries independently visible to A/B;
- left decision creates private archived copy, stable replay, no Post, B unchanged;
- copied private image downloads; foreign USER and ADMIN delete return404;
- manual expiry blocks writes while reads remain; explicit unlimited restores;
- reset once, token replay410, previous session401 and new password login;
- wrong deletion email403; all pre-existing user rows/sessions preserved.

IAB desktop1265x712: USER login after reset, catalog/card/image, button rejection,
reload→persistent private archive, explicit return from archive, settings, ADMIN
users/access/reset/delete-confirmation cancellation and empty agent schedule.
No blank page/framework overlay or console errors/warnings. Screenshots retained
outside Git. Live320/390 viewport and native messenger/browser return not verified;
prior source CI mobile checks remain separate evidence.

Exact disposable run saas-stage-20261024-c6b18247: A/B deleted using exact-email
API confirmation; real worker removed both durable external cleanup tasks. Synthetic
ADMIN removed by exact ID/email only. Final fresh SQL: fixtureUsers0,fixtureCleanup0,
sharedCatalog3,ledger21,publications0. Browser reload revoked fixture access→login.
The cleanup helper's final catalog assertion used nonexistent isShared field;
its0-versus3 failure occurred after cleanup. Independent read-only query of actual
shared_library_items proved3. No mutation replay to make that assertion green.

Pre-egress web a2538504cc82f63f06700018d6e9084db63646486393dfb080cf6a986892afd5;
worker90fbaecdf0efd68c84026139ca265ce21b25ba9eb6c1ec76cb61721133138114;
both exact4d952a image/running/restarts0, webhealthy. Publichealth/login200.

## Provider network diagnosis and approved correction

Fresh read-only network inspection: web/worker attached only planly-stage_default,
bridge internal=true. Host resolves api.telegram.org/platform-api.max.ru; actual
web DNS yields EAI_AGAIN for both. Thus native connection/send cannot work under
current network isolation. No credential failure is inferred, no provider HTTP
call/send performed. Do not raise timeouts or rotate tokens to mask this cause.

Prepared narrow proposal: additional bridge network planly-stage_provider-egress,
internal=false, attached only web+worker with gw_priority1. Keep existing private
network and all DB/Redis/storage attachments/volumes/ports; add no public ports,
no costs, no second worker or app rebuild. Validate resolved Compose/env identities,
restart same exact image, verify web/one-worker health and DNS/TLS. At that proposal checkpoint the network change awaited an infrastructure decision;
the later approved operation and readback are recorded below.

Owner supplied test channels https://t.me/danil_sochi_realty and
https://max.ru/channel_danil_sochi_realty for connection verification. Current native
Mini App URLs still need readback before any overwrite. Intended provider documents:
https://stage.lentaro.ru/social-connections/miniapp/telegram and
https://stage.lentaro.ru/social-connections/miniapp/max. Register through BotFather
Main Mini App / MAX partner cabinet, preserving any old working URL first.
Native USER consent must happen in the original Planly session. Never forge it.
Only after connection/enable plus exact separate real-send approval should the
minimum material/destination-bounded send smoke proceed. Production untouched.

Owner subsequently explicitly approved the proposed egress and named-provider
read-only checks, without sends. Fresh preflight publications0/connectedAccounts0
and BullMQ wait/delayed/active/prioritized/waiting-children all0. Resolved Compose
validation passed; worker default null versus empty mapping is semantic only.
Network added only to web/worker, gw_priority1, private DB/Redis/storage network
preserved. Web/worker healthy/running/restarts0, image and env values/ports equal.
An initial post-check HOLD compared Config.Env arrays by order; independent
readback proved maps exactly equal, no value changes and no mutation replay.
Latest egress web8604c83899fbb3bc041dc00662727530850420701b7ef9402f20b2a416bfa128;
workere37afa1dbb124f272deeaa1125da4f30d833cba0b911022b52d854f3f559bd58.

Official native setup references: [Telegram Main Mini App](https://core.telegram.org/bots/webapps#launching-the-main-mini-app),
[MAX partner Mini App setup](https://dev.max.ru/docs/webapps/introduction).
MAX API uses platform-api2.max.ru; named-channel lookup is the documented
[public channel-link endpoint](https://dev.max.ru/docs-api/methods/GET/chats/-chatLink-).
No broad chat listing, subscriptions, uploads or message endpoints used.

## Final provider readback and remaining external inputs

Actual provider checks after egress: Telegram GET_ME failed CONNECT_TIMEOUT;
MAX GET_ME failed UNABLE_TO_GET_ISSUER_CERT_LOCALLY. Scoped TLS diagnostics found
TelegramIPv4 149.154.166.110 TCP/TLS timeout and IPv6 ENETUNREACH. A separate host
probe also cannot connect to TelegramIPv4, while MAXTCP connects. Host OUTPUT
policy ACCEPT, UFW outgoing allow/no user-output rules, normal default route.
This localizes the Telegram failure outside the app to the VPS→provider path;
its exact upstream cause remains unproven. No app retry/timeout/token change,
new proxy, firewall change or routing workaround was applied.

Existing project public CA matches a fresh verified-HTTPS official download
https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt. File SHA256
936a43fea6e8e525bcc0f81acd9c3d21b4fc4b9b68acea7906d698005afc6504;
certificate SHA256D26D2D0231B7C39F92CC738512BA54103519E4405D68B5BD703E9788CA8ECF31,
valid through27February2032. Scoped read-only probe with this root confirmed
MAXse14310498_bot via HTTP200. This did not mutate application trust.

Owner then separately authorized connecting that verified public CA read-only to
web/worker using NODE_EXTRA_CA_CERTS. Resolved Compose proposal PASS; no image,
port, network or secret value changes. Fresh DB/queue no-send preconditions all0.
Actual rollout VERIFIED_CA_APPLIED_PASS: readonly certificate mount only,
TLSverification never disabled; stable web/worker/restart0 and infrastructure
preserved. Standard unmodified Node fetch from the actual configured web container
then returned MAX /me200, is_bot/username match. This is MAX bot authentication
and TLS evidence, not USER/channel/native/send acceptance.

Latest web913bdf5ba9c19cc6a40e4985897088bd8608bc00cb0145e2566e09d8a5d6b42a;
worker553251bd8a4a27f2555d2ffa1ff11e5fab1029e38824b279ffc2bf6fe0767e3f.
Both retain exact4d952a image. No provider sends, uploads or subscription mutations.
MAX public-link probes with/without@ returned404; this was resolved using the
canonical numeric channel ID rather than changing the connector. Project scripts
scripts/max-live-planly-e2e.mjs:24, max-live-text.mjs:5 and max-live-media.mjs:6
contain -78857616977254. These send scripts were only read, never executed.
The old authenticated Planly settings independently show this MAX channel and
Telegram -1004390954741. Actual staging createMaxConnector.validate against
-78857616977254 returned ok:true and the expected channel display name. This
confirms bot/channel rights, not native human consent or message delivery.

MAX business cabinet initially showed an empty Mini App URL and warned that
changes require repeat moderation. Owner explicitly approved ONE save of
https://stage.lentaro.ru/social-connections/miniapp/max. Save was clicked exactly
once. Reload/reopening settings confirms the exact URL, disabled Save and bot
status Published. Existing button/group-invite settings retained. No token,
webhook, subscription, role or message changes. Native signed launch/consent/
return in the original Planly session remains unverified.

An independent owner Windows TLS connection to the same Telegram IPv4
149.154.166.110 succeeded with certificate verification. VPS host/container fail
to connect to this IP. Exact upstream cause remains unproven; no speculative
proxy, firewall, timeout or application change was made.

Follow-up source c4e75b: CI40105645605 and Self-host40105645580 SUCCESS.
This later report update changes evidence only; exact-head CI is tracked on PR76.

Remaining: approved working VPS-to-Telegram connectivity; original-session
native USER consent/enable and return; Telegram cabinet registration readback.
Real sends remain a later exact destination/material/limit gate. Live mobile and
production acceptance are still not claimed.
