# T03 / CR08 — WebP dimensions

## Contract and proven root cause

Baseline main `ce46b4a0a5791eb6da75834dce4d7ecc95361938`; production remains `2f13a5acc8a8010bfdc989cc99deb4655b584747`. No production change or publication.

`lib/server/media-validation.ts::webpDimensions` returned null whenever the first chunk was not `VP8X`. `validateMediaUpload` consequently rejected valid simple `VP8 ` / `VP8L` files with `Unable to read image dimensions`, before the common dimension limits. Two genuine RGB 2x3 files generated and decoded with locally installed sharp 0.35.4 reproduce this. Fixtures are inline bytes; tests introduce no dependency.

Minimal plan: reproduce with actual encoded files; add bounded header readers for the two allowed forms; retain VP8X canvas dimensions and all upload/pixel limits; test malformed/truncated headers and unchanged publication validation; independent Critic and exact-head CI before Owner gate.

## Change and boundaries

- Read little-endian RIFF/chunk lengths and reject out-of-bounds/truncated chunks, invalid padding and inconsistent container lengths before dimension access.
- Read VP8 key-frame signature and 14-bit dimensions; reject inter-frame headers. Read VP8L signature, 14-bit one-based dimensions and required version zero; alpha hint does not change dimensions.
- Existing VP8X test fixture now declares the correct RIFF and chunk sizes. No assertion removed or weakened.
- MIME allowlist, signatures, 20 MiB upload cap, 10,000-side and 40M-pixel caps, bytes/checksum/storage and provider-specific validation remain unchanged.
- This is a dimension-header reader, matching the existing validation contract; it does not decode or certify the entire compressed image bitstream. It does not change animation/provider support.

Primary contracts: [WebP container](https://developers.google.com/speed/webp/docs/riff_container), [lossless header](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification), [VP8 RFC6386 section9.1](https://datatracker.ietf.org/doc/html/rfc6386#section-9.1). APPLICABLE to these fields; no external issue assumed causal.

## Verification snapshot

- Before implementation: baseline RED6 FAIL / 8 PASS, including both actual files; existing positive VP8X still passed. The malformed-case rejection also exposed the old unchecked VP8X chunk size.
- After implementation: GREEN, targeted parser/publication-content/MAX connector tests pass; exact counts and CI links recorded in PR/Issue49 after completed checks.
- Native typecheck and independent Critic required; full regression, lint/build/migrations and E2E are verified through actual GitHub CI, plus Self-host. No production or browser upload acceptance claimed before authorized delivery.

Status: implementation verification; Owner merge/deploy gate remains separate.
