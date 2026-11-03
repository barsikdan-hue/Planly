# VK autoposting repair: next diagnostic operation

## Scope and proven blockers

Owner requested repairing VK image autoposting in this chat and accepted possible test duplicates. This permits source preparation; exact image build, staging deployment, configuration/secrets changes and counted provider operations remain distinct gates under AGENTS.md. No production change or background credential import is included.

Fresh read-only checks on 3 November 2026 confirm staging web source/label ee72a47ab1e3ca5aef4e4553142fb9b44aceb6ba, image sha256:3ef089af49beafe399fd53d1f66fd4d3fadd252046cbaa89592d7fbc6a1e4d8e, healthy/restarts0. Worker remains source466a30e imageb0292141; other services are running. Public vk-user-upload-core.mjs matches ee72a47 exactly, differs from eaba057; the new diagnostic module returns404. Existing VK configuration values are absent (presence booleans only), vk_credentials rows0. Counts users4/posts4/media7/publications3/nonterminal0/catalog3/ledger21. Redis has one old transient attempt marker and no marker for the new diagnostic operation. No provider calls or runtime/configuration/data changes were made by these checks.

GitHub PR79 is Draft/open at eaba057957af0f24226765b5e9bd72b1638ff6d5. CI41630278503, Self-host41630278475 and VK Mini App41630278481 freshly returned success. The already implemented diagnostic repair is not deployed. The original real provider/upload failure remains ROOT_CAUSE_NOT_PROVEN: ee72a47 discarded its stage/error metadata. Do not infer the actual error from synthetic code27 fixtures or from HTTP200 returned by Planly.

## Minimal source preparation

Use distinct operation vk-user-upload-diagnostic-20261103-02 through the existing shared protocol. Do not delete/reset/reuse vk-user-upload-20261103-01 or any earlier marker. Exact READY/HELLO operation matching, owner authorization, trusted confirmation, CSRF/origin checks, fixed group242095689/PNG, token-in-request-memory only and atomic once-only Redis admission stay unchanged. No automatic request, saveWallPhoto, wall.post, retry, credential persistence or worker enabling is added.

This change makes a future explicitly authorized diagnostic attempt possible with the eaba057 stage/reason classifier; it is not a fix or proof of successful VK delivery. New tests reject the old HTTP operation before authorization/claim, reject the old window handshake, retain its consumed marker and allow only one new dispatch. TDD RED observed the old header being admitted and the old operation identity; GREEN passed149 focused tests after the one-line protocol update.

## Verification

- Focused connector/controller/server/window/sender/document tests149 PASS.
- Static Mini App build and fully intercepted synthetic browser PASS; providerCalls0, trusted consent, token not rendered/stored and replay denial verified.
- Targeted ESLint PASS, exit0.
- Independent read-only Critic: no actionable findings;42 relevant tests independently PASS.
- Standalone typecheck (`tsc --noEmit --incremental false`) and full Next production build PASS, exit0.
- Full local DB-dependent suite not repeated against staging: real staging is not a test fixture. Exact-head GitHub CI supplies the isolated PostgreSQL/Redis regression lane.
- Final source SHA and exact-head CI: recorded after push.

## Next external decision

Prepare and pin the exact new-source Linux CI build and static artifact, then request the concrete build/deploy decision with existing image3ef089af rollback. Deploy web/static only; preserve worker/Postgres/Redis/storage, all environment/configuration, Nginx, counts and old markers. No migration or permanent VK configuration is required for this bounded test.

After successful deployment and fresh owner Mini App consent, separately authorize at most one groups.get, one photos.getWallUploadServer and one fixed PNG upload under the new operation. Capture only closed stage/reason, numeric VK code and observed HTTP status. A confirmed upload is required before preparing save/post and durable scheduling. The owner's requested final result remains a real post with a new image and proven scheduled delivery, both still unverified.

Existing documentation WIP from the earlier chat was preserved and is excluded from this source commit.
