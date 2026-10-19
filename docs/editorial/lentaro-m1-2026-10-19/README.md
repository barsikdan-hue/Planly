# Lentaro · approved local editorial pilot

**ACCEPTED_LOCAL: 3/3, r1, 19.10.2026.** Three Russian texts and three matching JPEG portraits are ready for the existing loading path. Independent fact-checker and critic returned READY for the exact reviewed revision, with no mandatory findings. Decision and exact report/text/image hashes: `acceptance-ledger.json`.

| Material | Text length (UTF-16) | Primary asset |
|---|---:|---|
| L01 — 20 ночей — два разных остатка | 781 | `assets/final/L01-r1-portrait.jpg` |
| L02 — Поместилась кровать. А вы? | 883 | `assets/final/L02-r1-portrait.jpg` |
| L03 — Парк рядом. А с собакой куда? | 855 | `assets/final/L03-r1-portrait.jpg` |

Use the exact `.txt` files in `materials/`. Each already includes title, qualifying conditions, source where required and the AI-origin caption. Do not prepend the title again. Every included JPEG is 1080×1350, under 1 MiB, text-free and byte-identical to its reviewed primary asset. L01 and L03 are declared adaptations of issue02, L02 is original to this pilot; three new research angles or global originality are not claimed.

`snapshot.portable.json` is a **privacy projection**, not the original hashed snapshot. Four machine-specific locators were replaced; public text, captions, alt, prompts, context, durable IDs and asset hashes remain unchanged. Original reviewed snapshot SHA256: `20a88854db86330940ed164ac58b1389abcee05d215fc6a09f620eeb10b40c56`. The original stays intact in external authoring evidence. `source-proof.json` records both snapshot hashes, exact unchanged copies and omitted assets. Original review JSON/Markdown are copied without rewriting and retain their original SHA references. Pre-review status fields inside the frozen projection are historical; the acceptance ledger records the current decision.

Full PNG generator originals and nine unused square/mobile exports are retained externally, with hashes here. Independent reports record actual fileview of all twelve final exports. The compact bundle intentionally includes only the three selected portraits; it is complete for loading this selection, not a copy of all authoring media. General OpenAI output-allocation terms and limitations are in `evidence/sources.json` and `provenance.json`; exclusivity, copyright protection and blanket legal clearance are not promised.

`api-package.json`, `LOADING.md` and `loading-journal-template.json` describe the existing per-file upload, idempotent Library creation and ADMIN sharing flow, inspected at source `6cf369bff8b284f8b3c166ce2dfa531e9f449ea0`. They are not a batch importer and have not been executed. Unknown media upload outcome requires reconciliation before any reupload. Library retries retain the supplied fixed creation key and identical canonical payload. No real media/library IDs, account identifiers or credentials are prefilled.

**Remaining data/release gate:** authorization for ADMIN import/share in a named environment and release source; actual account/channel and placement checks; source refresh for L03 before later use. `schedule_eligibility=NOT_EVALUATED`; imports 0, publications 0. This local acceptance does not grant merge/deploy, data writes, scheduling or provider sends. Current source/placement changes invalidate affected conclusions and require a new revision or review.

Run `pwsh -NoProfile -File ./verify-bundle.ps1` from this directory (or supply its path). It performs local file/hash/text/report-binding checks only and writes `qa/portable-integrity.json`. Historical 76/76 checks refer to the larger original authoring package. No runtime, account, provider or audience proof is implied.