# VK fallback availability diagnostic

Owner approved checking whether the actual wall-upload response supplies a fallback. Official schema: https://github.com/VKCOM/vk-api-schema/blob/master/photos/objects.json, photos_photo_upload.fallback_upload_url (optional). The actual b4040d1 diagnostic returned HTTP405 / HTML / METHOD_REJECTION / Allow unspecified. A fallback's existence or effectiveness is not established by that rejection.

Scope: add display-only metadata to the existing explicit checkPhoto response processing. No new API method/call, no fallback request or selection, no marker reset and no change to upload transport. Only ABSENT/INVALID/PRESENT, HTTPS boolean, fixed host class and equality with the primary address become visible. Signed URLs, paths, query strings and tokens never enter snapshots or storage. Reset/re-authorization/new check clear the metadata.

TDD: two new tests failed on missing metadata, then passed after implementation. All24 focused controller tests, static build, targeted ESLint and fully intercepted synthetic popup browser passed. Independent read-only review found no actionable issue. Live fallback presence remains NOT_VERIFIED. Deployment and provider reads require separate Owner gates; no real upload authorized by this source change.
