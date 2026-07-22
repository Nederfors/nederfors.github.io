# Index inventory removal convergence

## Scope and architecture

The preceding shared selected-list removal work is present. This change does not
replace or redesign it.

Before this change, the ordinary non-bundle inventory branch in
`js/index-view.js` classified and mutated the inventory itself. It found a row,
spliced it or decremented its quantity, called `saveInventory()`, performed
hidden/artefact coupling, and called the broad `renderInventory()` path. A
forced-safe run confirms the characteristic final-copy pipeline:

- one inventory normalization;
- two inventory scans;
- three flatten operations;
- two artefact scans;
- one full inventory render;
- one derived request and one worker request.

The equivalent inventory-view final-copy control already reached targeted
removal through the inventory mutation architecture. Both surfaces now call
`planInventoryMutation({ kind: "remove" })` and
`commitInventoryMutation()`. The planner owns capability, identity, ownership,
topology, rule, linked-state, aggregate, invalidation, and render-strategy
classification. The common removal commit owns the splice, aggregate delta,
root batch, store write, refresh generation, persistence schedule, and
postconditions. The surface supplies only intent and DOM reconciliation.

Semantic invalidation remains structural:
`inventory.structure`, `inventory.totals`, `summary.economy`, and
`persistence`. That truth does not force a structural render. A proven
inventory-view removal uses `targeted-remove`; the equivalent index action uses
`targeted-none` for inventory plus the existing targeted catalog-card action
reconciliation.

## Enabled signature

The new index convergence is intentionally limited to:

- the real `del`/`rem` catalog control;
- one stable catalog-backed top-level leaf row;
- stack quantity exactly one;
- the final owned copy of that base identity;
- complete versioned inventory capability evidence;
- no rule reconciliation, linked-state transition, snapshot source/record,
  artefact binding, manual override, unsupported topology, or ambiguous
  identity;
- a reusable aggregate snapshot and successful state/DOM postconditions for
  the measured fully targeted shape.

Quantity decrement (`sub`), whole-stack removal when quantity is greater than
one, and partial moves are unchanged. Their parity was not already established
by the final-row removal contract.

## Redundant-path ledger

Partially superseded:

- ordinary index `del`/`rem` for the enabled final-copy signature no longer
  uses the direct splice plus `saveInventory()` and full inventory render;
- the inventory-view final-row handler's former private classifier and commit
  now delegate to the same public planner and removal commit;
- the enabled signature no longer recursively rescans every inventory row for
  each removal proof or repeats the same target-UID scan inside `setInventory()`.
  Those scans remain available only for conservative fallback diagnostics and
  unproven store writes.

Still required:

- index quantity decrement and quantity-greater-than-one whole-stack actions;
- hidden/revealed ownership transitions, including reveal provenance;
- artefact/list coupling, selection mirrors, binding effects, and snapshot
  sources/records;
- bundle expansion/removal through the existing topology planner;
- container, vehicle, nested, unwrap, and unsupported topology actions;
- stack merge and partial-move cases;
- legacy, imported, unclassified, or capability-incomplete custom rows;
- unstable, missing, or duplicate identity;
- active filter membership/order that cannot be proved;
- rule/list-wide reconciliation;
- runtime stale-plan or state/DOM postcondition failure.

The old direct/broad branch remains the conservative fallback for those
callers. No “last copy means hide” rule and no snapshot detach/remove/cancel
semantics were added.

A real one-sample production-control check confirmed this boundary:
hidden removal recorded `hidden-revealed-state` and one full inventory render;
artefact removal recorded instance, snapshot, selection-mirror, binding-effect,
snapshot-source, and linked-state reasons and one full inventory render.

Exact planner or runtime reasons include:

- `forced-safe-path`, `inventory-missing`, `invalid-mutation-intent`,
  `partial-stack-removal-unproven`, `live-payment-required`;
- `catalog-capabilities-missing`, `custom-capabilities-missing`,
  `legacy-capabilities-missing`, `inventory-capabilities-incomplete`,
  `inventory-capability-resolver-missing`, `not-an-inventory-item`,
  `quantity-mode-instance`, `quantity-mode-missing`;
- `inventory-topology-container`, `inventory-topology-vehicle`,
  `inventory-topology-bundle`, `container-topology`, `vehicle-topology`,
  `bundle-expansion`, `nested-inventory-path`, `individual-instance`;
- `missing-row-uid`, `duplicate-row-uid`, `duplicate-base-identity`,
  `unstable-variant-identity`, `inventory-row-not-found`,
  `removal-plan-stale`;
- `currency-row`, `row-state-sync-required`, `manual-override`,
  `rule-reconciliation-required`, `list-wide-dependency`,
  `unknown-modify-target`;
- `hidden-revealed-state`, `artifact-list-sync`, `snapshot-sync`, and
  `state-link-<link>-unoptimized` for unsupported declared links;
- `active-filter-membership-uncertain`,
  `active-filter-outside-unoptimized`, `target-dom-card-missing`;
- `aggregate-snapshot-unavailable` as a targeted-render degradation that
  rebuilds aggregates;
- `removed-row-still-present`, `inventory-topology-postcondition-failed`,
  `target-card-not-removed`, `unaffected-card-identity-changed`,
  `index-card-postcondition-failed`, and `dom-postcondition-failed`.

## Correctness

The real index production control was run from identical normalized state in
forced-safe and optimized modes in Chromium and WebKit. Both modes produced
the same:

- inventory topology, row/variant identities, quantities, and totals;
- list, reveal, artefact-effect, snapshot, derived, and money state;
- rendered inventory UID order and totals;
- persistence result and post-reload semantic topology.

The optimized index run used one root batch, store mutation, common commit,
refresh generation, persistence schedule, UID validation, removal-evidence
lookup, and aggregate delta. It recorded no fallback. The target catalog card stayed
connected, all unrelated cards stayed connected, and only the six target
action descendants were replaced.

## Batch 2 real-UI benchmark baseline

Five samples per cell. Values are median/p95 milliseconds. “Visible” is first
presented feedback; “consistent” is all-view consistency; “persisted” is the
persistence-flush checkpoint. Mobile Chromium uses 4× CPU throttling.

| Runtime | Rows | Path | Visible | Consistent | Persisted |
|---|---:|---|---:|---:|---:|
| Desktop Chromium | 20 | forced-safe | 54.9/63.6 | 58.6/67.4 | 59.6/68.3 |
| Desktop Chromium | 20 | shared planner | 24.8/25.8 | 26.7/27.5 | 27.5/28.4 |
| Desktop Chromium | 100 | forced-safe | 62.4/83.0 | 67.0/87.6 | 68.3/88.9 |
| Desktop Chromium | 100 | shared planner | 57.8/63.1 | 60.2/64.9 | 62.5/69.1 |
| Desktop Chromium | 250 | forced-safe | 93.7/96.6 | 100.2/103.3 | 101.8/105.4 |
| Desktop Chromium | 250 | shared planner | 27.9/66.8 | 29.5/68.8 | 30.5/71.6 |
| Mobile Chromium (4×) | 20 | forced-safe | 164.6/220.8 | 192.4/250.9 | 194.7/247.7 |
| Mobile Chromium (4×) | 20 | shared planner | 17.8/19.5 | 26.3/29.1 | 40.4/41.7 |
| Mobile Chromium (4×) | 100 | forced-safe | 338.6/938.4 | 359.9/985.0 | 359.8/983.3 |
| Mobile Chromium (4×) | 100 | shared planner | 16.7/17.0 | 26.3/27.7 | 31.7/41.7 |
| Mobile Chromium (4×) | 250 | forced-safe | 711.3/2055.1 | 778.4/2173.0 | 777.6/2172.7 |
| Mobile Chromium (4×) | 250 | shared planner | 26.1/46.3 | 38.5/67.1 | 59.5/90.9 |

The Batch 2 pipeline counters per click were invariant across 20/100/250 rows:

| Counter | Forced-safe | Shared planner | Inventory-view control |
|---|---:|---:|---:|
| removal proof scans | 1 | 1 | 1 |
| inventory normalizations | 1 | 0 | 0 |
| inventory scans | 2 | 0 | 0 |
| flatten operations | 3 | 0 | 0 |
| artefact scans | 2 | 0 | 0 |
| derived/worker requests | 1/1 | 0/0 | 0/0 |
| full inventory renders | 1 | 0 | 0 |
| targeted renders | 0 | 2 | 2 |
| UID target validations | 0 | 1 | 1 |
| aggregate delta applications | 0 | 1 | 1 |
| root/store/common commits | 1/1/1 | 1/1/1 | 1/1/1 |
| refresh generations | 1 | 1 | 1 |
| persistence schedules | 1 | 1 | 1 |
| index cards replaced | 0 | 0 | n/a |
| index descendants replaced | 6 target, 0 unrelated | 6 target, 0 unrelated | n/a |

The retained inventory-view final-copy scenario has the same planner/commit
counter shape. Its absolute scenario duration is not directly comparable
because that harness starts timing before Playwright actionability and ends
after two additional paints; it remains a pipeline-shape control.

## Batch 3: bounded exact-removal validation

The measured exact proof was expensive because it recursively walked every
inventory row, resolved each unrelated row and base identity, rebuilt UID and
owned-quantity maps, and then `setInventory()` recursively scanned the target
UID again. Normalization, flattening, rendering, refresh, and persistence were
not part of that proof stage. The retained final state postcondition separately
checks that the target UID is absent and that every unaffected top-level row is
still the same object.

The full inventory/aggregate pass now builds narrowly scoped removal evidence
while it already has each flattened row and resolved entry available. The
evidence contains the inventory reference and version, top-level row/index
mapping, row-reference and UID cardinalities, and owned base quantities. The
planner reuses the already-resolved capabilities and accepts the optimized
signature only when that evidence exactly matches the active character,
inventory object, version, target row/UID/index, unique identities, and final
owned quantity. It then mints a module-private, single-use store-validation
token. The common commit rechecks token freshness before the splice;
`setInventory()` consumes it only for that exact resulting array and advances
the inventory version. Nothing is cached across mutations.

Missing evidence retains `removal-proof-missing`; changed inventory/version or
a reused/invalid token retains `removal-plan-stale`. Unsupported topology,
linked or rule/list-wide dependencies, incomplete capabilities, unstable or
duplicate identity, and all existing state/DOM postcondition failures keep
their existing reasons and conservative paths. A diagnostic full proof scan is
allowed only after the optimized proof has already failed closed, so it can
preserve the existing fallback-reason vocabulary without authorizing a fast
commit. The final state and DOM postconditions remain mandatory.

Five-sample, 250-row measurements used the same `index-inventory-remove`
scenario, fixtures, warm-up, Chromium runtimes, and mutation ledger before and
after. Values are median/p95 milliseconds; mobile uses the existing Pixel 7
profile and 4x CPU throttle.

| Runtime | Stage | Before | After |
|---|---|---:|---:|
| Desktop Chromium | removal proof | 0.20/0.30 | 0.10/0.30 |
| Desktop Chromium | duplicate store UID proof | 0.10/0.10 | 0.00/0.10 |
| Desktop Chromium | exact proof + store UID proof | 0.30/0.40 | 0.10/0.40 |
| Desktop Chromium | retained state postcondition | 0.10/0.20 | 0.10/0.20 |
| Mobile Chromium (4x) | removal proof | 1.30/2.00 | 0.40/0.80 |
| Mobile Chromium (4x) | duplicate store UID proof | 0.40/0.70 | 0.00/0.10 |
| Mobile Chromium (4x) | exact proof + store UID proof | 1.70/2.70 | 0.40/0.90 |
| Mobile Chromium (4x) | retained state postcondition | 0.20/0.50 | 0.80/0.90 |

The targeted pre-commit proof median fell 67% on desktop and 76% on throttled
mobile. The mobile planner checkpoint stayed effectively flat at 7.4/11.0 to
7.5/8.6 ms and the store checkpoint moved from 9.7/14.7 to 9.3/10.8 ms, so the
removed scan was not shifted into another measured pre-commit stage. Desktop
planner/store checkpoints were 1.6/1.6 and 2.0/2.0 before versus 2.1/3.9 and
2.6/4.6 after; at sub-millisecond proof scale that five-sample checkpoint
variation is not evidence of an end-to-end improvement.

Visible/consistent/persisted latency was 54.3/55.2, 55.9/57.0, and 57.6/58.7
before versus 29.5/42.6, 32.0/46.3, and 34.3/49.1 after on desktop. On mobile it
was 19.3/30.5, 30.4/42.0, and 46.5/65.0 before versus 22.0/26.0, 35.8/38.0, and
54.5/59.7 after. These absolute samples move with unrelated derived-refresh
work (desktop refresh median 52.9 to 27.7 ms; mobile 14.2 to 17.5 ms), so no
visible, consistent, or persisted latency improvement is attributed to Batch 3.

The supported scenario changed from one removal-proof scan to one bounded
evidence lookup, with zero fallback diagnostic scans and zero fallbacks. Root,
store, common-commit, refresh, and persistence counters remain one per click;
targeted renders remain two and full renders remain zero. Reusing planner
capabilities also reduced rule-helper/cache lookups from 15/16 to 11/12.

## Next decision gate

Do not extend removal mutation architecture at this gate. Start the
hosting/backend decision at the persistence adapter boundary in
`js/persistence.js`: preserve the current `saveCharacterFields()` contract and
evaluate the queued `flushPendingWrites()` -> `commitPendingWrites()` sink as
the replaceable local-Dexie/backend seam. Mutation planners, proof tokens, store
semantics, and postconditions should remain frontend invariants while that
decision is made. Linked-state Projection Core, No-change Acceptance, and new
mutation signatures remain separate later work.
