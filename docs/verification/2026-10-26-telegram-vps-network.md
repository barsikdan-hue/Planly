# Telegram VPS network incident - 26 October 2026

## Confirmed evidence

Source checkout clean at c970c93 before investigation. Staging source1ea423a/image4d952a.
No application, firewall, routes, Docker networks, secrets or provider state changed.
No Telegram HTTP request containing a token and no provider send.

At07:39:19-07:39:22MSK, api.telegram.org resolves149.154.166.110. A scoped
TCP443 probe times out. Read-only tcpdump on ens3 captures4outbound SYN headers
from62.173.149.73 and no inbound packet for that destination/port; zero kernel
capture drops. No payload captured. Route via10.0.0.255 ens3, source62.173.149.73.
Host OUTPUT policy ACCEPT; earlier scoped UFW inspection found outgoing allowed.

Evidence localizes the failing handshake beyond the outgoing host interface or
on the return path. Exact filtering/route location and operator are NOT PROVEN.
This is not evidence of token failure, TLS failure or connector defect; no
speculative code, timeout, proxy, firewall or routing fix is justified.

Public RIPE RDAP record for62.173.149.0/24 names RU-PLANETAHOST. It identifies
network registration, not proof of this owner's billing vendor/account.
https://rdap.db.ripe.net/ip/62.173.149.73
Official support contact: https://planetahost.ru/contacts/
Official cabinet https://bill.planetahost.ru/billmgr is reachable as Guest.
Owner initially authorized one support request, then corrected the billing
provider to NewVPS and supplied the actual VMmanager URL. Authenticated read-only
VMmanager confirms vm1319/id427, IP62.173.149.73, barsikdan.newvps.ru,
Ubuntu24.04,2vCPU/4GB/50GB, Active. This is the actual service authority;
RU-PLANETAHOST remains only the network-registration observation.
No request was sent to PlanetaHost. Official NewVPS FAQ identifies bm.newvps.ru
as the service/support cabinet: https://newvps.ru/faq/lk . Its login is pending
owner input. No ticket had been created or sent at that checkpoint; see the completed send below.

## Support request text - preparation checkpoint

Recipient: NewVPS technical support, existing service vm1319/id427/IP62.173.149.73.
One prepared diagnostic request, within the owner-approved purpose and corrected
actual provider. Prefer authenticated service ticket.

Subject: TCP443 to api.telegram.org unavailable from VPS62.173.149.73

Please investigate reachability from my VPS62.173.149.73 to api.telegram.org,
currently149.154.166.110:443. On26October2026 at07:39MSK, the TCP handshake timed
out from both the host and application container. Host capture on ens3 shows
outgoing SYN packets at07:39:19,20,21,22, with no incoming reply. DNS resolves;
OUTPUT policy ACCEPT, UFW outgoing allowed, route via10.0.0.255 dev ens3.
A fresh26October07:42MSK Windows direct connection to the SAME IPv4 completed
verified TLS1.3. Other outgoing services, including MAX, work from the VPS.

Please check upstream/return routing, network filtering and whether this
service/network supports Telegram Bot API access. Advise the cause and a supported
resolution. This request does not authorize paid services, migration, reinstall,
server reboot, firewall/route changes inside the VPS, or changes to application,
data, disks, credentials or secrets. Please propose any consequential change first.
No bot token, password, database or private content is required for this check.

## Next action

Owner identified actual hosting vendor NewVPS after approving one diagnostic request.
Complete owner login, select the matching existing VPS service and send once;
record ticket ID and provider acknowledgement.
After response, validate the exact proposed root-cause remedy before changing
infrastructure. Resume Telegram native setup and separately bounded live smoke
only after verified TCP/TLS and successful read-only Bot API authentication.

## Actual support handoff - confirmed

Owner corrected the provider to NewVPS, authenticated personally and confirmed
login after the request explicitly stated the same single ticket would go to
actual NewVPS. Billing service Start #1319/IP62.173.149.73 matches VMmanager.
Selected that exact existing service and Technical department. Submitted one
Russian translation of the prepared request, same scope and change exclusions.
No attachments, credentials, bot tokens, DB content or billing details sent.

Provider acknowledgement: request35 registered26October2026 07:45:37MSK.
List readback: exactly one matching request, status Under consideration.
Opened existing ticket; persisted service/text match. No second submission.
Ticket URL: https://bm.newvps.ru/billmgr?startform=clientticket.edit&elid=35
No request sent to PlanetaHost. The single support-message grant is consumed.
Server configuration/application/data unchanged. No payment, reboot or paid
service operation. No support answer or network repair verified at this point.

Current next action: read support response, establish actual failing network
layer and evaluate its specific remedy; preserve original VPS/data and no-send
state. A request for tokens, reboot, migration, paid option or infrastructure
change is not authorized merely by the ticket text. Do not invent a code fix or
proxy while the network remedy is unknown.
