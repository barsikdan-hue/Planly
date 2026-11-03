# VK server autoposting checkpoint — 2026-11-03

Source baseline: 35e1e7718dc34cfb1de9621f2674f379e9ac936b, branch codex/vk-miniapp-probe-20261029.

## Confirmed defect and minimal repair

The background connector accepted only pu[digits].vk.com. The owner-observed VK upload destination pu.vk.ru was rejected before transport with VK_UPLOAD_URL. A new regression failed with that exact code before the implementation change. The connector now additionally admits only the exact hostname pu.vk.ru; existing HTTPS, credentials, port, fragment, token and control-character checks remain intact. Three lookalike-host regressions remain denied.

84 connector/OAuth/credential tests passed; targeted ESLint passed. Independent review found no actionable issues and independently passed 80 connector tests. These are mocked source checks, not real provider acceptance. This repair does not establish the cause of the separate diagnostic HTTP 405.

## Fresh read-only staging audit

SSH read-only audit of the running web container: all five services running; web/Postgres/Redis/storage healthy. Four VK social account rows are DISCONNECTED and disabled. vk_credentials contains no rows. All five required web environment settings are absent: VK_CLIENT_ID, VK_SERVICE_TOKEN, VK_REDIRECT_URI, VK_CREDENTIAL_ENCRYPTION_KEY, VK_CREDENTIAL_KEY_VERSION. No secret values were read or printed; no database mutation or provider call occurred.

The existing registry already wires VK to encrypted account credentials and the scheduler already resolves registered connectors. Starting background publication now cannot succeed: no connected account, credential or OAuth configuration is present. A community token used in a separate manual wall.post experiment is not a persisted SaaS user credential and does not prove new photo-upload access.

## Remaining release conditions

Verify a supported publishing authorization grant with wall/photos and durable background access before configuring secrets. The existing VK ID OAuth implementation expects a rotating access/refresh pair; Mini App consent alone does not verify that contract. Any alternate credential architecture needs an explicit owner decision. Then prepare the precise environment/secret changes and web/worker release for owner approval, followed by a separately authorized single real new-photo publication and scheduled verification. Do not reuse consumed diagnostic operation markers or publish grants.

This checkpoint performs no build/deploy, infrastructure change, migration, token import or VK request.
