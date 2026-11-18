# VK saved-photo optional access key — 2026-11-16

## Contract and evidence
Owner approved investigation/minimal fix after JPEG operation02 stopped at PHOTO_ACCESS_KEY_PRESENT. Actual result proves save response passed photo count, ID, owner validity and exact destination/authenticated uploader ownership; wall.post was not invoked. No retry or new provider send authorized by this source change.

Primary schema fetched 2026-11-16: https://github.com/VKCOM/vk-api-schema/blob/master/photos/objects.json defines photos_photo.access_key as optional string. https://github.com/VKCOM/vk-api-schema/blob/master/photos/responses.json defines photos_saveWallPhoto_response.response items as photos_photo. wall/methods.json documents owner/id photo attachment form. Presence alone is not invalid ownership or a failed save. The previous unconditional presence rejection is the proven local defect.

## Minimal plan
1. RED contract tests for verified community/uploader photo with optional string access_key.
2. Validate bounded nonempty control/space-free string if present; retain malformed-field denial and all existing ID/owner/duplicate checks. Discard key; use original owner/id attachment, never append or persist key.
3. GREEN focused/unit contracts, independent review, then existing isolated PG/Redis CI lane after unit gate. Record exact SHA/checks in PR86.
4. No deployment, marker reset, OAuth, upload or publication in this change. Existing PNG/JPEG attempts remain consumed. This source fix does not prove VK will accept wall.post without a key; a denial remains a normal explicit provider outcome, without guessed private-photo access semantics.

## Tests
Two initial RED tests reproduced current false rejection for community and authenticated uploader owner. Existing tests that assumed any access_key means private/invalid were corrected to malformed-object cases; foreign owners remain denied even with a well-formed key. Focused 161/161 PASS after minimal change; full unit/CI evidence follows.
