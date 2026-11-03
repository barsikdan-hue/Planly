# Curl HTTP200 classification repair

## Proven source defect

The actual separately authorized curl test returned HTTP200/OTHER, not UPLOAD_CONFIRMED. The old classifier mapped API JSON errors, empty photos, incomplete receipts and non-JSON bodies to the same OTHER result. Its raw response was discarded; this repair cannot reconstruct that body and does not establish the cause of the upload failure.

## Minimal change

Only standalone helper/receiver response handling changes. Closed classifications distinguish JSON error (optional bounded numeric code), empty photo, invalid photo data, incomplete receipt, wrapped JSON, JSON non-object, malformed/non-JSON/empty/encoded/oversized body and confirmed receipt. Confirmation requires 2xx, positive integer server, nonempty parsed photo array and bounded nonempty hash. No raw photo/hash, URL, response text, error description, token or cookie returned. Local receiver reuses the same sanitizer, not a divergent whitelist.

Request method, multipart, DNS/TLS policy, time limits, no-proxy/no-redirect/no-retry behavior, paths and operation IDs remain unchanged. Consumed markers are preserved; this version does not authorize or enable a fresh live attempt.

## Verification and boundary

Two regressions failed with old OTHER classification and passed after repair. Nine offline Python tests PASS, including privacy/bounds, URL admission, consumed marker and unknown-outcome no retry. Independent read-only review: no actionable findings, nine tests independently PASS. No new provider calls, secret read/export, VPS helper upload, application deployment, image build, save or publication performed by this repair. Current live application remains d542d86. Real photo publication remains unverified.
