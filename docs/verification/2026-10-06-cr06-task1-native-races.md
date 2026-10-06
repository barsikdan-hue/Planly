# CR06 Task1 native race verification

STATUS: TASK1_ACCEPTED. This is a task gate, not PR20 release readiness. User Library create remains unkeyed until the approved atomic Task3 cutover. No merge/deploy.

Runtime checkpoint: `bf01f24c458a9760889568936adaa6eeb9e00641`; fresh main `49f9e7b09783ba1f420af3e6914f433abc2133be`. Direct Orchestrator ruling authorized native graph/orchestration/observation repair only, preserving architecture, outcomes, assertions, timeouts and the two original declared RED diagnostics.

## Real native RED and first broken layer

Instrumentation-only head `b3a40c1f7d10a3ed97c2858f37d423c6400a9650`, [CI37445783831](https://github.com/barsikdan-hue/Planly/actions/runs/37445783831)/job112210142263: **678total/673PASS/5FAIL/0SKIP**. The same three race assertions and original two semantic diagnostics fail. Runtime delta against bf01f24 is empty.

Actual PostgreSQL `pg_stat_activity`, `pg_blocking_pids` and `pg_locks` are preserved in [RED graph](probes/cr06-task1-native-blocking-graph-red.json). Test-only parameterized SQL and PIDs/resources are recorded; no credentials, production DB or provider is involved. Node TAP doubles backslashes in console diagnostic lines; evidence decoding removes that one TAP escape layer before parsing the JSON.

| Actual ordering | Operation1 | Operation2 | Source gate | Blocking path |
|---|---|---|---|---|
| delete first | PID157: Library SELECT FOR UPDATE, holds owner transaction1009 | PID159: users SELECT FOR UPDATE, waits transaction1009 | PID165 holds source transaction1008 | 159→157→165 |
| conversion first | PID159: Library SELECT FOR UPDATE, holds owner transaction1017 | PID157: users SELECT FOR UPDATE, waits transaction1017 | PID173 holds source transaction1016 | 157→159→173 |
| queue/delete first | PID157: Library SELECT FOR UPDATE, holds owner transaction1044 | PID159: users SELECT FOR UPDATE, waits transaction1044 | PID184 holds source transaction1043 | 159→157→184 |

Operation1's ungranted ShareLock on the source gate's transaction and operation2's ungranted ShareLock on operation1's transaction corroborate the query/blocker graph. `deleteLibraryItem` and conversion follow owner-first locking; the old `orderedRace` query and graph filtered exclusively to Library SELECT waiters. That removed the users node and incorrectly required operation2 already reach the source. This is a proved verification-harness incompatibility; no incorrect product outcome was established by those old precondition failures.

## Minimal observation repair

Harness head `6291d644d4ed9946934ca9d9d59d9392be9defc1` changes only the test harness and graph evidence relative to bf01f24. Runtime/API/client/App/schema/migrations/workflows remain identical. Every original `assert.*` line and all product expectation blocks are unchanged; 5-second observation deadlines, 20-second test bounds and polling interval are unchanged. Original diagnostic blob remains `775270d3782a525d7b09e8469498905ced3d1dd6`, identical to frozen4733405.

The gate still locks the actual Library source row. First operation must be a real source SELECT FOR UPDATE waiter reaching that gate; its concrete backend PID is retained. Only then is operation2 admitted and observed. Operation2 must be either another source SELECT waiter reaching the same gate, or a users SELECT FOR UPDATE waiter with a transitive blocking path through that specific operation1 source PID. Operation1 must still be observed at the source. Unrelated owner waits, FK/INSERT waits, disconnected chains and cycles cannot satisfy the handshake. Releasing the real source gate lets owner/source serialization complete; original final assertions run afterwards.

## Fresh GREEN evidence and product outcomes

[Native CI37446314081](https://github.com/barsikdan-hue/Planly/actions/runs/37446314081)/job112211885747: **678total/676PASS/2FAIL/0SKIP**, migrations/drift/typecheck/lint PASS. Lint retains13 existing warnings. Overall workflow is FAILURE because the two original deliberate semantic REDs remain active; standard build is intentionally skipped after Test failure. Do not label the workflow SUCCESS.

All **19/19 protected Library conversion/queue/delete tests PASS**, including the three repaired races. [GREEN graph](probes/cr06-task1-native-blocking-graph-green.json) captures the same users→operation1→source hierarchy. All original final outcomes execute unchanged:

- Delete first: conversion rejects; Library empty; no source Post/publication/mirror.
- Conversion first: exactly one source Post/publication/mirror; later delete empties Library and detaches source provenance without deleting that Post.
- Earlier queue delete: approval rejects with LibrarySourceStaleError; no Post/publication; Library empty.

All12 Task1 native service cases +2pure contract cases PASS. No new failure or skip exists. The only failures are original committed lost-response retry (2items) and concurrent unkeyed repetitions (3items). Those belong to Task3 transport/App boundary and were not fixed, skipped, weakened or archived during this harness repair.

Task1 gate complete; ordinary authorized continuation is Task2 pure durable attempt helper. Its source/verification is separately recorded; Task1 runtime immutability claims concern this race repair only. Browser/React/provider/production acceptance is not inferred from native or modeled fixtures.
