# VK server receipt diagnostics Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline and an independent whole-diff reviewer.

**Goal:** Preserve the exact closed saved-photo rejection reason through the existing server connector and worker boundary.

**Architecture:** Extend the existing diagnostic type/sanitizer and partition existing guards; reuse processor serialization. No experimental MiniApp dependency or changed guard semantics.

**Tech Stack:** TypeScript, existing Node test runner/Drizzle fixtures, existing attested PostgreSQL/Redis CI.

**Spec:** docs/verification/2026-11-07-vk-server-readiness.md

## Global Constraints

No VK API/OAuth/upload/save/post, live config/env/key/infra/schema change, merge/deploy, production mutation or marker reset. Preserve existing tenant binding, ownership/access-key guards and CAS. Only closed diagnostic enums; no secret/provider payload serialization.

## Review Focus

Dynamic communities and uploader ownership; null/empty/multiple/private receipts; duplicate attachments; unknown/wrong-stage/mutable diagnostic fields; reason survival through real processor logging/DBmessage; terminal/lateoutcomes.

## Task: main-server reason propagation

- [x] Write connector reason table/duplicate and sanitizer/processor serialization regression; observe RED.
- [x] Add typed closed reason, classify existing receipt guards, whitelist only for PHOTO_RECEIPT; observe GREEN without widening acceptance.
- [x] Run targeted and combinedunit gate, relevant lint/typecheck; independent Critic. Preserve exactsource evidence.
- [ ] Include exact PRbase in current audit workflow so unit precedes attested disposable PGRedis/fullchecks; push Draft PR stacked on83, verify exactCI. No unnecessary browser/MiniApp or provider rerun.
- [x] Deliver runtime/config diff and support-ready request alongside source/CI report. Stage/provider action requires its own concrete owner/provider prerequisites.

Ledger:14RED→63targetedPASS,482localunitPASS,lint/typecheck0; independent Criticclear. Current-schema requiredcolumncheck64/64read-only; no migrations. SourceonlyCI follows this checkpoint. Externalstep: owner must send the prepared supportrequest; absence of an answer is not worked around by code or more provider sends.
