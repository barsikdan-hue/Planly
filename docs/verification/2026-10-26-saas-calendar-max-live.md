# Staging calendar and MAX delivery - 26 October 2026

## Authority and fresh baseline

Clean branch codex/saas-staging-acceptance-20261024, source f87c5c0.
Exact-head CI40108387901 and Self-host40108387917 SUCCESS.
Staging image4d952a retained; web healthy/worker running, restart0; ledger21,
shared catalog3, no outstanding prior publication. No deployment or migrations.
Telegram host TCP still times out. Actual app MAX/me200 with configured CA.
Raw host Python does not load the app CA; its MAX trust failure is not app proof.

## Real USER calendar and cancellation

Owner signed into the existing ordinary agent account. On the actual staging UI,
selected MAX only, manual27October10:00MSK, approved catalog material L01-r1
(20 nights / two balances), unchanged text and portrait image. One approval
created the personal scheduled post. The calendar and post detail retained the
correct date/time/network after full reload.

Before the scheduled time, used the existing editor Save draft action. UI showed
Scheduled0/Draft1; DB receipt CANCELLED, attempt_count0, no remote ID or URL.
Text/media preserved. Source remains USED and still exposes Create publication;
created a second DRAFT from that same source successfully. This proves reuse
from USED, not a transition back to READY. No destructive deletion performed.
Nearest-free-slot and ADMIN reschedule target cases remain separate acceptance.

## Exactly one approved real MAX publication

Owner explicitly approved one staging-agent publication to canonical MAX channel
-78857616977254: unchanged L01-r1 text and one L01-r1-portrait.jpg. No Telegram,
no automatic retry after unknown result, no deletion or further publication.
Clicked Publish now exactly once on the existing draft, MAX alone selected.
UI progressed through queue acknowledgement to Published. Actual public MAX
page independently displays the approved full text and photo:
https://max.ru/channel_danil_sochi_realty/AaF2baXMS54

Read-only DB receipt: PUBLISHED / MAX / attempt_count1,
provider_remote_id mid.ffffb84787c0929a01a1766da5cc4b9e,
published_at2026-10-26T04:17:39.823Z (07:17:39 MSK), matching provider URL.
Earlier cancelled receipt remains CANCELLED/attempt_count0/no remote outcome.
Nonterminal publications0; catalog3; web/worker unchanged and restart0.
A remaining private draft is preserved for the owner. No cleanup of real data.

## Boundaries and next work

PASS applies to this real USER on VPS staging: native MAX connection (24Oct),
manual calendar/reload, schedule cancellation, USED-source reuse and one
immediate image publication. Scheduled provider delivery, Telegram, live mobile,
ADMIN reschedule/published protection and production are not proven by this run.
The single MAX-send grant is consumed. Any further send needs a new exact grant.
