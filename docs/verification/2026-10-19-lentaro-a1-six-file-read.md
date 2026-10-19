# A1 — authorized six-file passive read result

2026-10-19. Owner authorized ONE SSH session for exactly the six existing failed-run artifacts in the prepared plan; no server writes, daemon, restore, image changes, live Docker or image-inventory-only fallback. The session is now **CONSUMED / INSUFFICIENT_DATA_STOP / NO_RETRY**. All server actions stopped on insufficient data.

All six files read, 5915bytes, SSH exit0. Private ancestry/openat no-follow/no-atime, stable fstat and2MiB/file/8MiB total limits enforced. No store/proc/inventory/other-run/config data reads, project-helper import or server helper installation. Safe projections only; no raw bodies, secrets, IP, PID or argv export.

The pinned diagnostic `1166beb68f10b42be2da6edd94ddb1d985d057f466c0dceec9b6c18f56b4722f` and proof `9833839c5737300f5756d3c47d188740538afaa8681b53040ac409abdaac3a56` matched. They retain Failure LOADED_IMAGE_CONFIG_SET, EXISTING_STORE_IMAGE_CHAIN_VERIFY, candidate line232; proof FAIL_HOLD and only RETAINED_CONFIG_SAFE_MATERIALIZATION. Source83a/manifest match. Actual image-ls IDs, missing/extra identities and underlying cause remain **UNKNOWN / ROOT_CAUSE_NOT_PROVEN**. The four expected native IDs were already recovered locally in the [local-first evidence](2026-10-19-lentaro-a1-image-id-local.md).

Stored termination record for run b29737a7 now read directly: SHA256 `48f6a5ee1ab3a367b87c72397899f99a7acd26fdcf294484d1d6c439d8f74ab4`, statusPASS/graceful true/daemon exit0/remaining0/beforeCount1. This verifies the saved termination record, not current process/socket/live-component state or data equality. Those checks were outside scope and not performed.

The safe stdout/stderr/daemon-log projection returned no typed digest references or complete image-ls set. Raw bodies were not exported; absence of a full set in this limited projection is not a universal claim about arbitrary digest text in all raw logs. Do not treat partial references or historical VFS configs as the failed CLI response. Preserve exact set equality and all images; no speculative fix/delete/filter/retry. Verified recovery remains mandatory before updating the working server; M1 b7c331e preserved.

Collector `3c4fa1484a34ecfe138b390d7c85968fdfee5377cbace5afc4525774b8b60be8`, transport `168704db30be4fe701a80bad761e4c83c4afc84a4864e7de42940f35a134a4db`; bounded pre-dispatch review PASS,11 focused local checks PASS (10 collector +1 mocked transport, not SSH). No full unchanged-M1 rerun. Original six frozen operational sources and execution package verified unchanged locally.

Detailed safe evidence remains outside Git in existing artifacts/lentaro-m1/2026-10-19: A1-six-file-collection-result.md/json and A1-six-file-collector-review.md. Result JSON SHA256 `6b30637cfeb966024290470e3d2d28cf7060a95d7e2ae8143700bae12fb27f9b`; safe receipt `5059d5b64fc1e96d4144794ef9a839bf6a51ebf041f42f95e036895b09127c61`. No further action is authorized by this result.

Separate local-only result review PASS: A1-six-file-result-review.md checks receipt/hash/size agreement, stored-record versus current-state distinction and limited-projection/unknown-ID claims. No tests, network, server action or fallback preparation for that review.
