# Data-driven derived invalidation for selected-entry removal

## Result

The shared `setCurrentList` removal planner now classifies derived impact as a
separate planning dimension. A removal can be:

- `none`: the planner proves that neither worker-derived nor locally derived
  character values can change;
- `bounded`: registered rules or entry semantics identify an exact set of
  possibly affected domains;
- `unknown`: the proof is incomplete, so the existing conservative derived
  generation and worker path is retained.

The optimized production signature is:

> stable catalog entry + trusted removal baseline + no structural/list-wide/
> linked-state fallback + known rule targets + no worker-derived XP, corruption,
> capacity, toughness, or pain impact

That signature commits the root/store/common state once, performs targeted card
reconciliation, schedules one scoped refresh and one persistence operation, and
does not bump the derived generation or request the worker.

No production decision branches on category or entry name. The entry names in
the tests below select real catalog fixtures only.

## Production-path verification

The representative real controls all enter through the current character or
index selected-entry control and converge on `setCurrentList`:

| Case | Real catalog fixture | Planner result | Derived result |
| --- | --- | --- | --- |
| Simple ability | Akrobatik | incremental | bounded; XP and test-count semantics require normal worker processing |
| Simple boon | Arkivarie | incremental | bounded; XP requires normal worker processing |
| Burden | Impulsiv | incremental | bounded; XP requires normal worker processing |
| Trait changing derived values | Robust | incremental | bounded; XP/trait/combat semantics require normal worker processing |
| Rule-bearing, unchanged worker outputs | Balanserat | incremental | bounded combat/economy domains; no worker generation/request |
| No derived impact | Kortlivad | incremental | none; no worker generation/request |
| Grant/dependent cascade | Hamnskifte | full safe path | grant cleanup and worker processing preserved |
| List-wide rule | Mörkt förflutet | full safe path | `list-wide-rule-dependency` |
| Retained requirement dependency | retained Kortlivad requirement source | incremental reconciliation, conservative derived processing | `derived-impact-retained-requirement-dependency` |
| Unclassified custom entry | custom selected entry | full safe path | `unstable-or-unclassified-entry-source` |

The same no-impact proof is exercised through the real index removal control.
Inventory and linked-state removals remain behind their existing capability and
linked-state safety gates.

## Why derived work previously occurred

Every successful incremental removal previously committed with
`bumpDerived: true`, regardless of the removed entry's rules or semantics.
Character and index controllers then scheduled broad XP/traits/summary/effects
refresh work. XP and trait refreshes called the current-character derived
request path. The new generation could not reuse the prior generation's result,
so the request was queued, the worker recomputed combined effects, corruption,
capacity, toughness, pain and XP, and the result was applied if its version was
still current.

The intrinsically required portions are changes to:

- XP cost or corruption from real entry semantics;
- registered worker targets for corruption, capacity, toughness or pain;
- trait and combat values where the selected entry or a registered target can
  alter them;
- transitive grant/dependent state;
- requirements whose truth can change derived entry cost or effects;
- conditional conflicts and list-wide rules.

The broad generation bump and broad refresh for entries with none of those
effects were conservative orchestration. Worker internals were not changed.

## Evidence used by the proof

The planner reuses the existing normalization and modify-rule dispatch:

- normalized `mal` targets are annotated at their actual `registerMal`
  registration point with semantic domains and whether the worker owns them;
- catalog ERF semantics and explicit static zero-cost overrides identify XP and
  corruption impact;
- explicit trait and test-tag data identify local trait/combat/count impact;
- the trusted reconciliation baseline carries a sparse set of entries with
  removal-sensitive, list-dependent or unknown derived rules;
- existing capability gates continue to reject inventory, linked-state,
  artefact and other structurally unsafe signatures before the derived proof;
- existing grant, dependent, requirement, conflict and list-wide reconciliation
  remains independent of derived classification.

The registered normalized modify targets currently present in `data/all.json`
all resolve through the existing catalog normalization to a registered target
with derived-impact metadata. Unknown targets and ambiguous sources remain
conservative.

The worker-owned registered targets are corruption, capacity/carry, toughness
and pain. Registered combat, defense, attack, trait-selection, trait-maximum,
visibility, permission, price, weight and freeable targets are bounded local
domains; they can scope refresh work without forcing the worker unless another
entry semantic requires it.

## Optimized and conservative signatures

### Worker omitted

- A catalog-backed entry with a trusted baseline, no worker-owned ERF or modify
  target, no retained list/requirement dependency, and no structural fallback
  is classified `none` or non-worker `bounded`.
- `none` omits every derived generation/request.
- non-worker `bounded` omits the worker while refreshing only the affected
  local domains and always invalidating the relevant card/summary/effects
  surfaces.

`Kortlivad` exercises `none`. `Balanserat` exercises a rule-bearing bounded
combat/economy signature.

### Worker retained

Full derived processing remains for:

- unknown modify targets or ambiguous rule sources;
- character-dependent conditions whose before/after result is not proven;
- manual ERF/rule overrides;
- XP-bearing ability, boon, burden, ritual and trait semantics;
- mystic/ritual corruption;
- worker-owned corruption, carry/capacity, toughness or pain targets;
- retained requirement dependencies;
- grants, dependents, conditional conflicts and list-wide rules;
- legacy/imported/unclassified custom entries;
- stale or invalid reconciliation baselines;
- linked-state transitions;
- runtime state or DOM postcondition failures.

Grant/dependent and list-wide cases may select the full reconciliation path
before derived classification. This is intentional: derived invalidation does
not replace structural reconciliation.

## Forced-safe correctness parity

Chromium and WebKit execute each newly optimized signature twice from identical
normalized state through the same real removal control:

1. forced-safe removal with normal derived processing;
2. optimized derived-impact removal.

The comparison covers complete selected-list state/order, grants and
suppressions, inventory, dark-past/list/reveal/artefact/snapshot state, total
and used XP, traits, combat setup, effects, summary values, corruption,
capacity, toughness, pain, rendered cards/surfaces, persistence, and post-reload
state.

Results:

- 8/8 derived-invalidation parity cases passed in Chromium and WebKit.
- 8/8 existing selected-list reconciliation/removal parity cases passed in
  Chromium and WebKit.
- Unit suite: 86/86 passed.
- For both optimized no-worker signatures the complete final derived state was
  identical to forced-safe output, while optimized derived generations,
  requests, worker requests and worker applications were all exactly zero.
- Forced-safe executions produced exactly one generation, request, worker
  request and application.
- The genuine derived-changing and cascade controls still produced exactly one
  generation, worker request and application.

## Performance

Measurements use the real character removal control, five samples, a fully
hydrated selected list, Desktop Chromium and Mobile Chromium with 4x CPU
throttling. Times are medians in milliseconds; `p95` is end-to-end duration.
The primary scenario removes the real no-derived-impact `Kortlivad` fixture.

### Desktop Chromium

| Size | Path | Duration | p95 | Visible | Consistent | Proof | Store | Common | UI | Derived/worker | Refresh | Persistence |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | optimized | 49.2 | 65.5 | 11.4 | 12.4 | 0.3 | 1.2 | 0.1 | 0.5 | 0.0 | 0.1 | 1.3 |
| 20 | forced-safe | 165.2 | 166.4 | 122.3 | 126.3 | 0.3 | 11.5 | 0.1 | 0.5 | 2.8 | 3.3 | 1.5 |
| 100 | optimized | 61.7 | 64.7 | 21.3 | 22.5 | 0.4 | 3.6 | 0.1 | 0.9 | 0.0 | 0.1 | 3.4 |
| 100 | forced-safe | 224.8 | 235.5 | 177.3 | 189.9 | 0.3 | 58.7 | 0.1 | 0.9 | 10.8 | 11.6 | 3.0 |
| 250 | optimized | 175.7 | 200.9 | 105.6 | 108.2 | 0.3 | 28.0 | 0.1 | 2.3 | 0.0 | 0.1 | 17.0 |
| 250 | forced-safe | 844.0 | 873.6 | 663.3 | 800.2 | 0.4 | 479.1 | 0.1 | 2.0 | 132.8 | 134.6 | 14.6 |

### Throttled Mobile Chromium

| Size | Path | Duration | p95 | Visible | Consistent | Proof | Store | Common | UI | Derived/worker | Refresh | Persistence |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | optimized | 84.2 | 91.7 | 39.5 | 45.0 | 1.3 | 5.3 | 0.2 | 2.7 | 0.0 | 0.1 | 9.1 |
| 20 | forced-safe | 234.6 | 264.6 | 186.0 | 198.8 | 1.2 | 51.3 | 0.2 | 2.6 | 4.2 | 8.3 | 9.2 |
| 100 | optimized | 148.9 | 176.7 | 91.8 | 102.5 | 1.9 | 16.5 | 0.8 | 4.0 | 0.0 | 0.9 | 16.3 |
| 100 | forced-safe | 485.0 | 527.8 | 423.0 | 446.4 | 1.6 | 241.8 | 0.5 | 3.7 | 13.2 | 17.3 | 15.5 |
| 250 | optimized | 607.0 | 648.9 | 437.4 | 456.1 | 2.2 | 111.9 | 0.4 | 13.0 | 0.0 | 0.2 | 88.4 |
| 250 | forced-safe | 2835.7 | 2872.5 | 2621.1 | 2806.0 | 2.1 | 2189.1 | 0.5 | 10.4 | 169.4 | 180.7 | 5.0 |

The mobile 250 forced-safe persistence-work median is lower because most of its
latency is spent before persistence scheduling in the broad store/derived path;
the end-to-end persistence latency was 2812.0 ms versus 540.9 ms optimized.

The forced-safe worker phase separates as follows. Request build and queue wait
occur before worker dispatch; worker round-trip covers transfer and worker
computation; total derived time includes result validation/application. The
application column is a count because its main-thread bookkeeping is below the
timer resolution or represented by the difference between total and
round-trip. Every optimized row is `0/0/0/0/0` for these five columns.

| Runtime | Size | Request build ms | Queue wait ms | Worker round-trip ms | Total derived ms | Applications |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 20 | 0.0 | 0.1 | 2.7 | 2.8 | 1 |
| Desktop | 100 | 0.0 | 0.6 | 10.7 | 10.8 | 1 |
| Desktop | 250 | 0.0 | 1.0 | 132.7 | 132.8 | 1 |
| Mobile 4x | 20 | 0.0 | 2.2 | 4.0 | 4.2 | 1 |
| Mobile 4x | 100 | 0.1 | 3.1 | 13.2 | 13.2 | 1 |
| Mobile 4x | 250 | 0.1 | 7.9 | 169.4 | 169.4 | 1 |

The bounded rule-bearing `Balanserat` signature also used five samples:

| Runtime | Path | Duration | p95 | Visible | Consistent | Proof | Derived/worker |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | optimized | 50.3 | 67.1 | 11.8 | 13.2 | 0.3 | 0.0 |
| Desktop | forced-safe | 157.0 | 164.0 | 121.7 | 126.3 | 0.3 | 2.9 |
| Mobile 4x | optimized | 82.5 | 105.9 | 44.1 | 50.2 | 1.6 | 0.0 |
| Mobile 4x | forced-safe | 237.5 | 250.4 | 192.2 | 203.4 | 1.6 | 4.9 |

### Work counters and controls

For the optimized no-impact scenario at every 20/100/250 size:

- derived generations/requests/worker requests/worker applications: `0/0/0/0`;
- forced-safe: `1/1/1/1`;
- root batches/common commits/refresh generations/persistence schedules:
  `1/1/1/1` for both paths;
- targeted card renders: `1`; full character renders: `0`;
- derived-impact proof operations: exactly `3`;
- rule-helper calls: exactly `5`, compared with forced-safe
  `100/500/1250`;
- rule-source cache lookups: `25/105/255`, compared with forced-safe
  `255/1295/3245`;
- requirement evaluations: `0`;
- grant and requirement discovery passes: one each as part of the existing
  shared removal proof.

The real index no-impact control likewise produced zero derived generations,
worker requests and worker applications optimized, versus one of each
forced-safe.

The derived-changing Akrobatik control at 250 Desktop entries retained one
generation/request/application and spent 156.5 ms in derived computation.
The Hamnskifte cascade retained one generation/request/application and selected
the full `grant-cleanup-required` reconciliation path. Mobile controls showed
the same required-worker behavior. Boon, burden and trait controls likewise
retained one generation/request/application.

## Scaling

The new proof does not replace the old work with a selected-list scan:

- proof operations remain exactly 3 at 20, 100 and 250 entries;
- Desktop proof time is 0.3/0.4/0.3 ms;
- throttled Mobile proof time is 1.3/1.9/2.2 ms.

It uses sparse baseline/index data constructed during the existing
reconciliation scan. The remaining exact list delta and postcondition work
still scales with unrelated list size: at 250 entries the optimized Desktop
store work is 28.0 ms and Mobile store work is 111.9 ms, with list delta/post
work contributing materially. That is intentionally left for the planned
removal-token/exact-proof validation follow-up.

## New canonical derived-impact fallback reasons

- `derived-impact-not-proven`
- `derived-impact-retained-list-rule-dependency`
- `derived-impact-retained-requirement-dependency`
- `derived-impact-ambiguous-erf-source`
- `derived-impact-erf-helper-missing`
- `derived-impact-manual-erf-state-unknown`
- `derived-impact-manual-erf-override`
- `derived-impact-modify-classifier-missing`
- `derived-impact-ambiguous-rule-source`
- `derived-impact-unknown-modify-target`
- `derived-impact-character-dependent-rule-unproven`
- `derived-impact-invalid-entry`

Existing structural, linked-state, baseline, forced-safe and runtime
postcondition fallback reasons are unchanged.

## Superseded invalidation and next priority

The unconditional incremental `bumpDerived: true` and unconditional broad
XP/traits/summary/effects refresh are now partially superseded by planner-owned
derived impact. They remain the conservative behavior for unknown/full plans.
The worker request, queue, computation and application machinery itself is
unchanged.

The measurements demonstrate that the next priority should be **cheaper exact
removal-proof validation**. The new derived proof is constant-work and worker
avoidance is effective, while the remaining optimized 250-entry cost is
dominated by existing exact list/store validation rather than repeated derived
classification. Linked-state Projection Core remains a separate later phase.
