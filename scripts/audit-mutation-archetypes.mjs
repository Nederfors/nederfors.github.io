import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'all.json');
const LEGACY_MAP_FILE = path.join(ROOT, 'data', 'legacy-import-map.json');
const RULE_HELPER_FILE = path.join(ROOT, 'js', 'rules-helper.js');
const PERF_ARTIFACTS_DIR = path.join(ROOT, '.artifacts', 'perf');
const DEFAULT_OUTPUT = path.join(ROOT, '.artifacts', 'mutation-archetypes.json');
const SIGNATURE_SCHEMA_VERSION = 1;
const LEDGER_SCHEMA_VERSION = 2;

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const listify = value => Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
const normalize = value => String(value || '').trim().toLocaleLowerCase('sv-SE');
const entryName = entry => String(entry?.name || entry?.namn || '').trim();
const entryTypes = entry => listify(entry?.tags?.types || entry?.taggar?.typ).map(String);
function rulesFor(entry, key) {
  const found = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (value.rules && typeof value.rules === 'object') {
      found.push(...listify(value.rules[key]));
    }
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value).forEach(visit);
  };
  visit(entry);
  return found;
}
const hasRule = (entry, key) => rulesFor(entry, key).length > 0;
const hasType = (entry, wanted) => entryTypes(entry).some(type => wanted.has(normalize(type)));
const walk = (value, visit) => {
  if (!value || typeof value !== 'object') return;
  visit(value);
  if (Array.isArray(value)) value.forEach(item => walk(item, visit));
  else Object.values(value).forEach(item => walk(item, visit));
};

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
};
const signatureId = (prefix, signature) => `${prefix}-${crypto
  .createHash('sha1')
  .update(JSON.stringify(stableValue(signature)))
  .digest('hex')
  .slice(0, 12)}`;
const sortedUnique = values => [...new Set(listify(values).map(value => String(value || '').trim()).filter(Boolean))].sort();

const SCENARIO_LEDGER = Object.freeze([
  ['first-load', 'application-load', 'mapped-with-known-remaining-cost'],
  ['route-change', 'navigation', 'mapped-with-known-remaining-cost'],
  ['open-inventory', 'navigation', 'mapped-with-known-remaining-cost'],
  ['switch-character', 'character-switch', 'correctness-tested-but-not-performance-mapped'],
  ['index-list-add', 'plain-list-add', 'mapped-and-optimized'],
  ['index-popup-add', 'choice-list-add', 'mapped-and-optimized'],
  ['index-inventory-choice-add', 'choice-inventory-add', 'mapped-and-optimized'],
  ['index-inventory-add', 'plain-inventory-add', 'mapped-and-optimized'],
  ['index-conflict-replacement', 'conflict-replacement', 'mapped-and-optimized'],
  ['search-filter', 'catalog-filter', 'mapped-with-known-remaining-cost'],
  ['inventory-buy-multiple', 'quantity-batch', 'mapped-and-optimized'],
  ['inventory-add-quality', 'quality-add', 'mapped-and-optimized'],
  ['inventory-custom-item-create', 'custom-entry-create', 'scenario-does-not-match-real-user-action'],
  ['inventory-custom-item-edit', 'custom-entry-edit', 'scenario-does-not-match-real-user-action'],
  ['inventory-vehicle-load', 'vehicle-load', 'mapped-and-optimized'],
  ['inventory-vehicle-unload', 'vehicle-unload', 'mapped-and-optimized'],
  ['notes-edit', 'field-patch', 'mapped-and-optimized'],
  ['money-edit', 'money-mutation', 'scenario-does-not-match-real-user-action'],
  ['heavy-current-character-save', 'field-patch-large-state', 'scenario-does-not-match-real-user-action'],
  ['character-level-change-fast', 'level-local', 'mapped-and-optimized'],
  ['character-level-change-structural', 'level-structural', 'mapped-with-known-remaining-cost'],
  ['character-list-remove-single', 'list-remove', 'mapped-and-optimized'],
  ['character-list-remove-decrement', 'list-quantity-decrease', 'mapped-and-optimized'],
  ['character-list-remove-all', 'list-stack-remove', 'mapped-and-optimized'],
  ['character-artifact-cascade-remove', 'artifact-cascade-remove', 'mapped-and-optimized'],
  ['character-clear-non-inventory', 'list-clear', 'mapped-and-optimized'],
  ['index-list-remove', 'index-list-remove', 'mapped-and-optimized'],
  ['index-inventory-remove', 'index-inventory-remove', 'mapped-and-optimized'],
  ['index-hidden-artifact-remove', 'hidden-artifact-remove', 'mapped-and-optimized'],
  ['index-list-remove-full-rerender', 'filtered-list-remove', 'mapped-with-known-remaining-cost'],
  ['inventory-row-delete', 'inventory-remove', 'scenario-does-not-match-real-user-action'],
  ['inventory-stack-decrement', 'inventory-quantity-decrease', 'scenario-does-not-match-real-user-action'],
  ['inventory-tag-remove', 'quality-remove', 'scenario-does-not-match-real-user-action'],
  ['inventory-container-delete-all', 'container-delete', 'scenario-does-not-match-real-user-action'],
  ['inventory-container-delete-only', 'container-unwrap', 'scenario-does-not-match-real-user-action'],
  ['inventory-vehicle-unload-remove', 'vehicle-unload', 'scenario-does-not-match-real-user-action'],
  ['inventory-vehicle-money-remove', 'vehicle-money', 'scenario-does-not-match-real-user-action'],
  ['inventory-clear', 'inventory-clear', 'scenario-does-not-match-real-user-action'],
  ['inventory-quantity-add', 'plain-inventory-quantity', 'mapped-and-optimized'],
  ['inventory-quantity-subtract', 'plain-inventory-quantity', 'mapped-and-optimized'],
  ['inventory-metadata-quantity-add', 'metadata-bearing-inventory-quantity', 'mapped-and-optimized'],
  ['inventory-metadata-quantity-subtract', 'metadata-bearing-inventory-quantity', 'mapped-and-optimized'],
  ['inventory-metadata-final-copy-remove', 'metadata-bearing-final-copy-removal', 'mapped-and-optimized'],
  ['inventory-artifact-state-sync', 'artifact-reveal-bind-snapshot', 'unmapped'],
  ['inventory-bundle-removal', 'bundle-structural-removal', 'unmapped'],
  ['inventory-nested-move', 'nested-inventory-move', 'unmapped'],
  ['switch-character-large-specialized', 'large-specialized-character-switch', 'device-gap'],
  ['trait-plus-one', 'trait-value', 'mapped-and-optimized'],
  ['trait-plus-five', 'trait-value', 'mapped-and-optimized'],
  ['trait-minus-one', 'trait-value', 'mapped-and-optimized'],
  ['trait-minus-five', 'trait-value', 'mapped-and-optimized']
]);

const IMPORTANT_TESTS = Object.freeze([
  ['tests/mutation-pipeline.spec.js', 'mutation batching, real quantity UI, structural reconciliation', 'mapped-and-optimized'],
  ['tests/list-reconciliation-parity.spec.js', 'incremental/full reconciliation parity', 'mapped-and-optimized'],
  ['tests/add-profile.spec.js', 'catalog add performance controls', 'mapped-and-optimized'],
  ['tests/performance-budget.spec.js', 'mobile interaction budgets', 'mapped-and-optimized'],
  ['tests/write-queue.spec.js', 'persistence scheduling and field patches', 'mapped-and-optimized'],
  ['tests/rules-worker.spec.js', 'worker/local derived parity', 'mapped-and-optimized'],
  ['tests/mobile-layout.spec.js', 'mobile layout correctness', 'device-gap'],
  ['tests/pwa.spec.js', 'PWA correctness', 'device-gap'],
  ['tests/inventory-mutation-parity.spec.js', 'safe/optimized inventory mutation parity and reload', 'mapped-and-optimized'],
  ['tests/inventory-topology-parity.spec.js', 'pure topology plans, targeted vehicle moves, safe/reload/mobile parity', 'mapped-and-optimized']
]);

const HIDDEN_TYPES = new Set(['artefakt', 'kuriositet', 'skatt']);
const CONTAINER_TYPES = new Set(['förvaring']);
const VEHICLE_TYPES = new Set(['färdmedel']);
const INDIVIDUAL_TYPES = new Set([
  'närstridsvapen', 'avståndsvapen', 'vapen', 'sköld', 'rustning',
  'lägre artefakt', 'artefakt', 'färdmedel'
]);
const QUALITY_BEARING_TYPES = new Set([
  'närstridsvapen', 'avståndsvapen', 'vapen', 'sköld', 'rustning'
]);
const INVENTORY_TYPES = new Set([
  'närstridsvapen', 'avståndsvapen', 'vapen', 'sköld', 'pil/lod', 'rustning',
  'kuriositet', 'skatt', 'diverse', 'elixir', 'mat', 'dryck', 'lägre artefakt',
  'artefakt', 'kläder', 'musikinstrument', 'färdmedel', 'förvaring', 'gårdsdjur',
  'byggnad', 'specialverktyg', 'fälla'
]);
const DERIVED_TARGET_PREFIXES = [
  'traits.', 'combat.', 'effects.', 'capacity.', 'pain.', 'corruption.',
  'toughness.', 'defense.', 'damage.', 'armor.'
];

function grantRefs(entry) {
  return rulesFor(entry, 'grant').flatMap(rule => {
    const target = normalize(rule?.target);
    if (target === 'item') return listify(rule?.foremal || rule?.items);
    if (target === 'entry') return listify(rule?.name || rule?.namn || rule?.id);
    return [];
  });
}

function hasSnapshot(entry) {
  let found = false;
  walk(entry, node => {
    if (node?.snapshot === true) found = true;
  });
  return found;
}

function hasHiddenRule(entry) {
  return rulesFor(entry, 'modify').some(rule => normalize(rule?.target) === 'hidden' && Boolean(rule?.value));
}

function isHidden(entry) {
  return hasType(entry, HIDDEN_TYPES) || hasHiddenRule(entry);
}

function isStackableChoice(entry) {
  return hasRule(entry, 'choice') && entry?.tags?.inventory?.stackbar === true;
}

function isIndividual(entry) {
  if (!hasType(entry, INDIVIDUAL_TYPES)) return false;
  if (entry?.tags?.inventory?.stackbar === true) return false;
  return !['kraft', 'ritual'].includes(normalize(entry?.bound));
}

function isBundle(entry) {
  return rulesFor(entry, 'grant').some(rule => (
    normalize(rule?.target) === 'item' && listify(rule?.foremal || rule?.items).length > 0
  ));
}

function hasDerivedImpact(entry) {
  return rulesFor(entry, 'modify').some(rule => {
    const target = normalize(rule?.target);
    return DERIVED_TARGET_PREFIXES.some(prefix => target.startsWith(prefix));
  });
}

function entryInventoryMeta(entry) {
  return entry?.tags?.inventory || entry?.taggar?.inventory || {};
}

function ruleTarget(rule) {
  return normalize(rule?.target ?? rule?.mal ?? rule?.mål);
}

function extractKnownModifyTargets(source) {
  const targets = new Set();
  // registerMal is the runtime dispatch table. Literal `mal` filters elsewhere
  // include queries, comments and template strings, so treating them as handled
  // targets both overstates support and can capture unrelated source fragments.
  for (const match of source.matchAll(/registerMal\(\s*['"]([A-Za-z0-9_]+)['"]/g)) {
    targets.add(normalize(match[1]));
  }
  return targets;
}

function impactDomainForTarget(target) {
  const value = normalize(target);
  if (!value) return 'unknown';
  if (value === 'hidden') return 'visibility';
  if (value.startsWith('vikt_') || value.startsWith('pris_')) return 'economy';
  if (value.includes('kapacitet') || value.includes('capacity')) return 'capacity';
  if (value.includes('korruption') || value.includes('corruption')) return 'corruption';
  if (value.includes('smart') || value.includes('stark') || value.includes('diskret')
      || value.includes('kvick') || value.includes('viljestark') || value.includes('traffsaker')
      || value.includes('övertygande') || value.includes('overtygande') || value.includes('vaksam')) {
    return 'traits';
  }
  if (value.includes('forsvar') || value.includes('försvar') || value.includes('rustning')
      || value.includes('skada') || value.includes('anfall')) return 'combat';
  if (value.includes('smartgrans') || value.includes('toughness') || value.includes('pain')) return 'derived';
  return 'effects';
}

function buildEntrySignature(entry, knownModifyTargets) {
  const types = sortedUnique(entryTypes(entry).map(normalize));
  const inventory = entryInventoryMeta(entry);
  const choices = rulesFor(entry, 'choice');
  const modifies = rulesFor(entry, 'modify');
  const grants = rulesFor(entry, 'grant');
  const conflicts = rulesFor(entry, 'conflict');
  const requirements = rulesFor(entry, 'require');
  const modifyTargets = sortedUnique(modifies.map(ruleTarget));
  const choiceFields = sortedUnique(choices.map(rule => normalize(rule?.field ?? rule?.falt ?? rule?.fält)));
  const duplicatePolicies = sortedUnique(choices.map(rule => normalize(
    rule?.duplicate_policy ?? rule?.duplicatePolicy ?? rule?.duplicates ?? rule?.policy
  )));
  const serializedRules = JSON.stringify({ choices, modifies, grants, conflicts, requirements }).toLowerCase();
  const isContainer = hasType(entry, CONTAINER_TYPES);
  const isVehicle = hasType(entry, VEHICLE_TYPES);
  const bundle = isBundle(entry);
  const artifact = types.some(type => ['artefakt', 'lägre artefakt'].includes(type));
  const qualityBearing = hasType(entry, QUALITY_BEARING_TYPES)
    || listify(entry?.qualities || entry?.tags?.qualities || entry?.taggar?.kvalitet || entry?.kvalitet).length > 0;
  const unknownModifyTargets = modifyTargets.filter(target => !knownModifyTargets.has(target));
  const expectedImpact = new Set(['persistence']);
  if (types.some(type => INVENTORY_TYPES.has(type)) || Object.keys(inventory).length || isContainer || isVehicle || bundle || isIndividual(entry)) {
    expectedImpact.add('inventory');
    expectedImpact.add('economy');
  } else {
    expectedImpact.add('list');
  }
  grants.forEach(rule => {
    const target = ruleTarget(rule);
    if (target === 'item') expectedImpact.add('inventory');
    else if (target === 'money') expectedImpact.add('economy');
    else expectedImpact.add('list');
  });
  modifyTargets.forEach(target => expectedImpact.add(impactDomainForTarget(target)));
  if (artifact) expectedImpact.add('artifacts');
  if (hasSnapshot(entry)) expectedImpact.add('snapshots');
  if (isHidden(entry)) expectedImpact.add('visibility');

  return stableValue({
    structure: {
      catalogTypes: types,
      stackable: inventory.stackbar === true,
      individual: isIndividual(entry),
      topLevel: true,
      container: isContainer,
      vehicle: isVehicle,
      bundle,
      catalogEntry: Boolean(entry?.id),
      stableId: Boolean(entry?.id),
      stableUidAtRuntime: 'required'
    },
    variant: {
      choice: choices.length > 0,
      choiceFields,
      duplicatePolicies,
      bound: normalize(entry?.bound),
      qualityBearing,
      artifactBinding: Boolean(entry?.tags?.artifact_binding || entry?.taggar?.artifact_binding),
      snapshot: hasSnapshot(entry),
      hiddenOrRevealed: isHidden(entry)
    },
    rules: {
      requirements: requirements.length > 0,
      grants: grants.length > 0,
      conflicts: conflicts.length > 0,
      modifies: modifies.length > 0,
      modifyTargets,
      unknownModifyTargets,
      listWideDependencies: /list[_-]?wide|reconcile[_-]?all|selected\.|list\.|har_namn|saknar_namn|nagon_av_namn/.test(serializedRules),
      inventoryGrants: grants.some(rule => ruleTarget(rule) === 'item'),
      moneyGrants: grants.some(rule => ruleTarget(rule) === 'money')
    },
    expectedImpact: [...expectedImpact].sort()
  });
}

function mutationActionsForSignature(signature) {
  const actions = new Set(['add', 'removal', 'persistence-reload']);
  const structure = signature.structure || {};
  const variant = signature.variant || {};
  const rules = signature.rules || {};
  if (signature.expectedImpact?.includes('inventory')) {
    actions.add('quantity-increase');
    actions.add('quantity-decrease');
    actions.add('complete-stack-removal');
  }
  if (variant.qualityBearing) {
    actions.add('quality-add');
    actions.add('quality-remove');
  }
  if (variant.hiddenOrRevealed) actions.add('reveal-hide');
  if (variant.snapshot) actions.add('snapshot-synchronization');
  if (structure.container) actions.add('move-nested');
  if (structure.vehicle) {
    actions.add('vehicle-load');
    actions.add('vehicle-unload');
  }
  if (structure.bundle) actions.add('bundle-expansion-removal');
  if (rules.grants || rules.conflicts || rules.requirements || rules.modifies) actions.add('level-change');
  return [...actions].sort();
}

function signatureRepresentatives(items) {
  const sorted = [...items].sort((left, right) => entryName(left.entry).localeCompare(entryName(right.entry), 'sv'));
  const stateHeavy = [...items].sort((left, right) => {
    const score = item => ['choice', 'grant', 'conflict', 'require', 'modify']
      .reduce((sum, key) => sum + rulesFor(item.entry, key).length, 0);
    return score(right) - score(left) || entryName(left.entry).localeCompare(entryName(right.entry), 'sv');
  })[0];
  const edge = [...items].sort((left, right) => {
    const score = item => Number(!item.entry?.id) * 8
      + Number(hasSnapshot(item.entry)) * 4
      + Number(isHidden(item.entry)) * 2
      + Number(isBundle(item.entry));
    return score(right) - score(left) || entryName(left.entry).localeCompare(entryName(right.entry), 'sv');
  })[0];
  const describe = item => item ? ({ id: item.entry?.id || null, name: entryName(item.entry), file: item.file }) : null;
  return {
    common: describe(sorted[0]),
    stateHeavy: describe(stateHeavy),
    edgeCase: describe(edge),
    observedOutlier: null
  };
}

async function findPerfSummaries(root) {
  const results = [];
  const visit = async directory => {
    let children = [];
    try {
      children = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(children.map(async child => {
      const file = path.join(directory, child.name);
      if (child.isDirectory()) return visit(file);
      if (child.isFile() && child.name === 'summary.json' && path.basename(directory) === 'scenarios') {
        try {
          results.push({ file, value: await readJson(file) });
        } catch {}
      }
    }));
  };
  await visit(root);
  return results;
}

function buildCoverageMap(summaries) {
  const coverage = new Map();
  summaries.forEach(({ file, value }) => {
    const runtime = String(value?.runtime?.name || 'legacy-unknown');
    Object.values(value?.scenarios || {}).forEach(scenario => {
      const name = scenario?.name;
      if (!name) return;
      if (!coverage.has(name)) coverage.set(name, []);
      coverage.get(name).push({
        runtime,
        iterations: Number(scenario.iterations || 0),
        hasAttribution: Object.keys(scenario.stages || {}).length > 0,
        file: path.relative(ROOT, file)
      });
    });
  });
  return coverage;
}

function buildKnowledgeLedger(perfCoverage) {
  const scenarios = SCENARIO_LEDGER.map(([name, behaviorClass, status]) => {
    const samples = perfCoverage.get(name) || [];
    const hasRuntime = matcher => samples.some(sample => matcher(sample.runtime));
    const synthetic = status === 'scenario-does-not-match-real-user-action';
    return {
      kind: 'scenario',
      id: name,
      userAction: name.replaceAll('-', ' '),
      uiControl: synthetic ? 'direct state mutation in harness' : 'production UI control or navigation',
      behaviorClass,
      coverage: {
        desktop: hasRuntime(runtime => runtime === 'desktop-chromium' || runtime === 'legacy-unknown'),
        mobileChromium: hasRuntime(runtime => runtime === 'mobile-chromium'),
        mobileWebKit: hasRuntime(runtime => runtime === 'mobile-webkit'),
        pwa: hasRuntime(runtime => runtime.startsWith('pwa-'))
      },
      correctnessCoverage: true,
      performanceAttribution: samples.some(sample => sample.hasAttribution),
      knownOptimization: status === 'mapped-and-optimized',
      knownFallback: status.includes('remaining-cost') || synthetic,
      rootCauseUnderstood: ['mapped-and-optimized', 'mapped-with-known-remaining-cost'].includes(status),
      status,
      evidence: samples
    };
  });
  const tests = IMPORTANT_TESTS.map(([file, behaviorClass, status]) => ({
    kind: 'test',
    id: file,
    userAction: behaviorClass,
    uiControl: 'test coverage',
    behaviorClass,
    coverage: {
      desktop: true,
      mobileChromium: file.includes('mobile') || file.includes('performance-budget'),
      mobileWebKit: file.includes('mobile'),
      pwa: file.includes('pwa')
    },
    correctnessCoverage: true,
    performanceAttribution: file.includes('profile') || file.includes('performance-budget'),
    knownOptimization: status === 'mapped-and-optimized',
    knownFallback: false,
    rootCauseUnderstood: status === 'mapped-and-optimized',
    status,
    evidence: []
  }));
  return [...scenarios, ...tests];
}

const ATTRIBUTION_COUNTERS = Object.freeze([
  'ruleHelperCalls', 'ruleCacheLookups', 'ruleCacheHits', 'ruleCacheMisses',
  'ruleNormalizations', 'requirementEvaluationCalls', 'requirementEvaluationMs',
  'conflictEvaluationCalls', 'conflictEvaluationMs', 'grantPlanningCalls', 'grantPlanningMs',
  'grantDependentDiscoveryCalls', 'grantDependentDiscoveryMs',
  'requirementDependentDiscoveryCalls', 'requirementDependentDiscoveryMs',
  'listWideDependencyChecks', 'listWideDependencyMs',
  'inventoryNormalizations', 'inventoryScans',
  'inventoryUidFullNormalizations', 'inventoryUidTargetValidations',
  'inventoryFlattenCalls', 'artifactEffectScans', 'derivedRequests',
  'workerRequests', 'fullInventoryRenders', 'targetedRenders',
  'domNodesCreated', 'domNodesReplaced', 'hiddenSurfaceRefreshes', 'aggregateRebuilds',
  'aggregateDeltaApplications', 'refreshGenerations', 'persistenceSchedules'
]);

function medianOf(summary) {
  const value = Number(summary?.medianMs);
  return Number.isFinite(value) ? value : null;
}

function buildPerformanceFindings(summaries) {
  const records = [];
  summaries.forEach(({ file, value }) => {
    const runtime = String(value?.runtime?.name || 'legacy-unknown');
    Object.values(value?.scenarios || {}).forEach(scenario => {
      if (!scenario?.name) return;
      const dominantStages = Object.entries(scenario.stages || {})
        .map(([name, stage]) => ({
          name,
          calls: Number(stage?.callCount || 0),
          avgMs: Number(stage?.avgMs || 0),
          medianMs: medianOf(stage),
          p95Ms: Number(stage?.sampleCount || 0) >= 5 ? Number(stage?.p95Ms) : null
        }))
        .sort((left, right) => right.avgMs - left.avgMs)
        .slice(0, 8);
      const counters = Object.fromEntries(ATTRIBUTION_COUNTERS
        .filter(name => scenario.counters?.[name])
        .map(name => [name, Number(scenario.counters[name]?.avgMs || 0)]));
      const fallbacks = Object.fromEntries(Object.entries(scenario.fallbacks || {}).map(([reason, data]) => [
        reason,
        Number(data?.count || 0)
      ]));
      const detail = scenario.detail || scenario.samples?.[0]?.detail || {};
      const visibleMedian = medianOf(scenario.latency?.visibleResponse);
      const consistencyMedian = medianOf(scenario.latency?.completeConsistency);
      const mainThreadMedian = dominantStages
        .filter(stage => !['worker-round-trip', 'indexeddb-transaction', 'persistence-flush'].includes(stage.name))
        .reduce((sum, stage) => sum + Number(stage.medianMs || 0), 0);
      const mobileMultiplier = runtime === 'mobile-chromium' || runtime === 'mobile-webkit' ? 2 : 1;
      records.push({
        generatedAt: value?.generatedAt || null,
        file: path.relative(ROOT, file),
        name: scenario.name,
        runtime,
        iterations: Number(scenario.iterations || 0),
        behaviorSignature: detail.behaviorSignature || null,
        pathMode: detail.pathMode || null,
        stateSize: Number.isFinite(Number(detail.stateSize)) ? Number(detail.stateSize) : null,
        aggregateState: detail.aggregateState || null,
        activeFilters: detail.activeFilters === true,
        visibleMedianMs: visibleMedian,
        visibleP95Ms: Number(scenario.latency?.visibleResponse?.sampleCount || 0) >= 5
          ? Number(scenario.latency?.visibleResponse?.p95Ms)
          : null,
        consistencyMedianMs: consistencyMedian,
        consistencyP95Ms: Number(scenario.latency?.completeConsistency?.sampleCount || 0) >= 5
          ? Number(scenario.latency?.completeConsistency?.p95Ms)
          : null,
        mainThreadAttributedMedianMs: mainThreadMedian,
        fullRenderCount: Number(scenario.fullCatalogRenderCount || 0),
        dominantStages,
        counters,
        fallbacks,
        priorityScore: mobileMultiplier * Number(visibleMedian || 0)
          + Number(consistencyMedian || 0)
          + mainThreadMedian
          + (Number(scenario.fullCatalogRenderCount || 0) > 0 ? 50 : 0)
      });
    });
  });

  const latestByScenarioRuntime = new Map();
  records
    .sort((left, right) => String(left.generatedAt).localeCompare(String(right.generatedAt)))
    .forEach(record => latestByScenarioRuntime.set([
      record.name,
      record.runtime,
      record.pathMode || 'unspecified',
      record.stateSize ?? 'unspecified',
      record.aggregateState || 'unspecified',
      record.activeFilters ? 'filtered' : 'unfiltered'
    ].join('|'), record));
  const latestMeasurements = [...latestByScenarioRuntime.values()]
    .sort((left, right) => right.priorityScore - left.priorityScore);
  const fallbackMap = new Map();
  latestMeasurements.forEach(record => Object.entries(record.fallbacks).forEach(([reason, count]) => {
    if (!fallbackMap.has(reason)) {
      fallbackMap.set(reason, { reason, count: 0, scenarios: new Set(), runtimes: new Set() });
    }
    const item = fallbackMap.get(reason);
    item.count += count;
    item.scenarios.add(record.name);
    item.runtimes.add(record.runtime);
  }));
  return {
    latestMeasurements,
    fallbackRankings: [...fallbackMap.values()]
      .map(item => ({
        reason: item.reason,
        count: item.count,
        scenarioCount: item.scenarios.size,
        scenarios: [...item.scenarios].sort(),
        runtimes: [...item.runtimes].sort()
      }))
      .sort((left, right) => right.count - left.count || right.scenarioCount - left.scenarioCount)
  };
}

function describeClass({ id, title, predicate, entries, pathInfo, preferredExamples = [] }) {
  const matches = entries.filter(item => predicate(item.entry, item));
  const preferred = preferredExamples
    .map(name => matches.find(item => normalize(entryName(item.entry)) === normalize(name)))
    .filter(Boolean);
  const examples = [...preferred, ...matches]
    .filter((item, index, list) => list.findIndex(candidate => candidate.entry.id === item.entry.id) === index)
    .slice(0, 8)
    .map(item => ({ id: item.entry.id || null, name: entryName(item.entry), file: item.file }));
  return {
    id,
    title,
    count: matches.length,
    files: [...new Set(matches.map(item => item.file))].sort(),
    examples,
    ...pathInfo
  };
}

async function main() {
  const all = await readJson(DATA_FILE);
  const ruleHelperSource = await fs.readFile(RULE_HELPER_FILE, 'utf8');
  const knownModifyTargets = extractKnownModifyTargets(ruleHelperSource);
  const perfSummaries = await findPerfSummaries(PERF_ARTIFACTS_DIR);
  const perfCoverage = buildCoverageMap(perfSummaries);
  const entries = all.sourcePayloads.flatMap((payload, sourceIndex) => (
    listify(payload?.entries).map(entry => ({ entry, file: all.sources[sourceIndex]?.file || 'unknown' }))
  ));
  let legacyImportMappings = 0;
  try {
    const legacyMap = await readJson(LEGACY_MAP_FILE);
    legacyImportMappings = Object.values(legacyMap)
      .filter(value => value && typeof value === 'object' && !Array.isArray(value))
      .reduce((sum, value) => sum + Object.keys(value).length, 0);
  } catch {
    legacyImportMappings = 0;
  }

  const special = entry => (
    ['choice', 'grant', 'conflict', 'require', 'modify'].some(key => hasRule(entry, key))
    || hasSnapshot(entry)
    || isHidden(entry)
    || isBundle(entry)
    || hasType(entry, CONTAINER_TYPES)
    || hasType(entry, VEHICLE_TYPES)
  );

  const classes = [
    describeClass({
      id: 'A',
      title: 'Enkel lokal mutation (kontrollgrupp)',
      entries,
      predicate: entry => !special(entry),
      preferredExamples: ['Bandage', 'Fackla'],
      pathInfo: {
        mutationPath: 'Direkt inventory-/trait-/listdelta i befintlig store-batch.',
        renderingPath: 'Befintlig riktad row/value-patch; full väg endast vid ändrad topologi.',
        commitShape: 'En root batch, en common commit, normalt ingen derived-version för metadata/quantity.',
        reconciliation: 'Nej.',
        invalidates: ['inventory.row eller list.entry', 'inventory.totals vid inventory', 'summary.economy vid pris/vikt'],
        observers: ['En scheduleCharacterRefresh', 'högst en AutoAnimate-pass vid strukturell insertion'],
        fastPath: 'Ja, kontrollgrupp.',
        fallback: ['saknad stabil identitet', 'okänd topologi', 'filter-/sortmedlemskap kan inte bevisas']
      }
    }),
    describeClass({
      id: 'B',
      title: 'Choice-bunden mutation',
      entries,
      predicate: entry => hasRule(entry, 'choice'),
      preferredExamples: ['Formelsigill (Novis)', 'Djurmask', 'Ritualsigill'],
      pathInfo: {
        mutationPath: 'Choice/duplicate-validering före mutation, därefter addInventoryVariant eller listplan.',
        renderingPath: 'Riktad variant-row/list-patch när impact och identitet är kända.',
        commitShape: 'Choice cancellation: noll commits. Bekräftad add: en root batch/common commit.',
        reconciliation: 'Endast när valets entry också har grants/conflicts/requirements.',
        invalidates: ['inventory.row/structure', 'inventory.totals', 'endast deklarerade derived-domäner'],
        observers: ['choice-popup', 'duplicate-confirmation', 'en refreshgeneration'],
        fastPath: 'Ja för känd choice och stabil variantidentitet.',
        fallback: ['okänd/custom choice-data', 'hidden/artifactkoppling', 'regelreconciliation krävs']
      }
    }),
    describeClass({
      id: 'C',
      title: 'Variantmutation',
      entries,
      predicate: entry => (
        hasRule(entry, 'choice')
        || hasType(entry, QUALITY_BEARING_TYPES)
        || Boolean(entry?.tags?.artifact_binding)
        || Boolean(entry?.bound)
      ),
      preferredExamples: ['Formelsigill (Novis)', 'Djurmask', 'Dubbel ringbrynja', 'Skymningsvatten'],
      pathInfo: {
        mutationPath: 'Central base-/variant-/instance-identitet; identisk stackbar variant får quantityDelta.',
        renderingPath: 'Quantity/value-patch för befintlig variant, strukturell insertion för ny variant.',
        commitShape: 'En commit per logisk batch; antal exemplar kollapsas till antal unika varianter.',
        reconciliation: 'Nej för ren metadata; ja för artifact/snapshot/rule-coupling.',
        invalidates: ['inventory.row/structure', 'inventory.totals', 'effects/combat endast från regelimpact'],
        observers: ['en refreshgeneration', 'en samlad animationspass vid insertion'],
        fastPath: 'Ja för kompatibel katalogdata och stabil variantnyckel.',
        fallback: ['artifact snapshot/binding', 'legacy metadata som inte kan klassificeras', 'komplex individuell post']
      }
    }),
    describeClass({
      id: 'D',
      title: 'Batch- eller multimutation',
      entries,
      predicate: entry => grantRefs(entry).length > 1 || isBundle(entry) || isStackableChoice(entry),
      preferredExamples: ['Välutrustad', 'Fältutrustning', 'Hamnskifte', 'Formelsigill (Novis)'],
      pathInfo: {
        mutationPath: 'Planera alla operationer, unionera invalidationer och applicera i en store-batch.',
        renderingPath: 'Batched row-patches/DocumentFragment; stabil quantity-batch patchar befintliga kort.',
        commitShape: 'En root batch/common commit/persistensschedule för en användarhandling.',
        reconciliation: 'En gång för hela listbatchen när grants ingår.',
        invalidates: ['union av operationernas list/inventory/money/derived-domäner'],
        observers: ['en refreshgeneration', 'högst en AutoAnimate-pass per kategori'],
        fastPath: 'Ja för stabil quantity-/choice-/grantbatch med känd topologi.',
        fallback: ['bundle med okänd medlems-/topologiförändring', 'mixed custom/legacy operations', 'sen valideringsosäkerhet']
      }
    }),
    describeClass({
      id: 'E',
      title: 'Regel- och reconciliationmutation',
      entries,
      predicate: entry => (
        ['grant', 'conflict', 'require'].some(key => hasRule(entry, key))
        || hasSnapshot(entry)
        || isHidden(entry)
      ),
      preferredExamples: ['Hamnskifte', 'Dvärg', 'Packåsna', 'Skymningsvatten'],
      pathInfo: {
        mutationPath: 'Regelkontroll och conflict/removal/grant-plan först; setCurrentList applicerar planen atomärt.',
        renderingPath: 'Riktad listreconciliation för stabil kategori; full katalog/listväg vid osäker postcondition.',
        commitShape: 'En root batch/common commit; en derived-version när regler påverkar derived state.',
        reconciliation: 'Incrementell för säkra single-append; level/removal använder fortfarande en atomär full regelreconciliation, med indexerade konfliktkällor.',
        invalidates: ['list.structure/entry', 'requirements', 'snapshots', 'faktiska grant-domäner', 'persistence'],
        observers: ['conflict/requirement-dialog', 'en refreshgeneration', 'en workerrequest vid derived-impact'],
        fastPath: 'Ja för rena replacements och stabila grant/cascade-planer.',
        fallback: ['manuella overrides', 'list-wide rules', 'hidden/revealed eller snapshot vars impact inte kan bevisas']
      }
    }),
    describeClass({
      id: 'F',
      title: 'Kopplad list- och inventorymutation',
      entries,
      predicate: entry => (
        isBundle(entry)
        || hasType(entry, new Set(['artefakt']))
        || hasDerivedImpact(entry)
        || rulesFor(entry, 'grant').some(rule => ['item', 'money'].includes(normalize(rule?.target)))
      ),
      preferredExamples: ['Fältutrustning', 'Välutrustad', 'Djurmask', 'Skymningsvatten'],
      pathInfo: {
        mutationPath: 'En gemensam list/store-batch samlar inventorygrants, money, snapshots och derived-impact.',
        renderingPath: 'Riktade list- och inventorydomäner körs en gång vardera när impact är exakt.',
        commitShape: 'En common commit; derived-version endast om den kopplade regeln kräver det.',
        reconciliation: 'En samlad reconciliation, aldrig en per grant.',
        invalidates: ['list.*', 'inventory.*', 'money', 'traits/combat/effects enligt summary'],
        observers: ['en secondary refresh', 'en workerrequest när derived påverkas'],
        fastPath: 'Delvis: grants och kända inventoryvarianter; artifact/snapshot behåller fallback.',
        fallback: ['artifact-list sync', 'snapshot binding', 'okänd grant target']
      }
    }),
    describeClass({
      id: 'G',
      title: 'Komplex inventorytopologi',
      entries,
      predicate: entry => (
        hasType(entry, CONTAINER_TYPES)
        || hasType(entry, VEHICLE_TYPES)
        || isBundle(entry)
        || isIndividual(entry)
      ),
      preferredExamples: ['Fältutrustning', 'Packåsna'],
      pathInfo: {
        mutationPath: 'Ren topologiplan före mutation; direkt top-level↔vehicle-flytt appliceras atomärt när identitet och postcondition är bevisbara.',
        renderingPath: 'Riktad node-preserving move för säker vehicle load/unload; full inventoryrender för övrig container-/nested-/bundletopologi.',
        commitShape: 'Säker vehicle-flytt gör en storemutation/common commit/refresh/persistensschedule; övriga planer faller tillbaka.',
        reconciliation: 'Endast om posten också har listregler.',
        invalidates: ['inventory.structure', 'inventory.totals', 'capacity', 'summary.economy', 'persistence'],
        observers: ['lokal motion-rebind på berörda listor', 'verifierad DOM-/tree-postcondition'],
        fastPath: 'Ja för en hel stabil katalograd direkt mellan top-level och vehicle; inte generell topology mutation.',
        fallback: ['container/nested path', 'bundle expansion', 'partial/multi-row', 'artifact/snapshot/custom/legacy', 'misslyckad DOM-postcondition']
      }
    }),
    describeClass({
      id: 'H',
      title: 'Custom, äldre eller okänd data',
      entries,
      predicate: entry => !entry?.id,
      preferredExamples: [],
      pathInfo: {
        mutationPath: 'Sanering/UID-expansion och befintlig konservativ storeväg.',
        renderingPath: 'Full fallback tills stabil identitet, schema och impact kan bevisas.',
        commitShape: 'Varierar med importformat; ingen snabbväg antas.',
        reconciliation: 'Konservativ full reconciliation vid okända regelfält.',
        invalidates: ['full säker domänmängd'],
        observers: ['full render observers'],
        fastPath: 'Nej som standard.',
        fallback: ['saknat UID/id', 'okänt schema', 'custom metadata', 'importerad legacystruktur'],
        legacyImportMappings
      }
    })
  ];

  const signedEntries = entries.map(item => {
    const signature = buildEntrySignature(item.entry, knownModifyTargets);
    return {
      ...item,
      signature,
      signatureId: signatureId('entry', signature)
    };
  });
  const entryGroupsMap = new Map();
  signedEntries.forEach(item => {
    if (!entryGroupsMap.has(item.signatureId)) entryGroupsMap.set(item.signatureId, []);
    entryGroupsMap.get(item.signatureId).push(item);
  });
  const entrySignatureGroups = [...entryGroupsMap.entries()]
    .map(([id, items]) => ({
      id,
      entryCount: items.length,
      actionCount: items.reduce((sum, item) => sum + mutationActionsForSignature(item.signature).length, 0),
      signature: items[0].signature,
      representatives: signatureRepresentatives(items)
    }))
    .sort((left, right) => right.entryCount - left.entryCount || left.id.localeCompare(right.id));
  const actionGroupsMap = new Map();
  signedEntries.forEach(item => {
    mutationActionsForSignature(item.signature).forEach(action => {
      const actionSignature = stableValue({
        entrySignatureId: item.signatureId,
        mutation: action,
        expectedImpact: item.signature.expectedImpact
      });
      const id = signatureId('action', actionSignature);
      if (!actionGroupsMap.has(id)) actionGroupsMap.set(id, { id, signature: actionSignature, items: [] });
      actionGroupsMap.get(id).items.push(item);
    });
  });
  const actionSignatureGroups = [...actionGroupsMap.values()]
    .map(group => ({
      id: group.id,
      actionCount: group.items.length,
      signature: group.signature,
      representatives: signatureRepresentatives(group.items)
    }))
    .sort((left, right) => right.actionCount - left.actionCount || left.id.localeCompare(right.id));
  const knowledgeLedger = buildKnowledgeLedger(perfCoverage);
  const performanceFindings = buildPerformanceFindings(perfSummaries);

  const report = {
    generatedAt: new Date().toISOString(),
    schemaVersions: {
      behaviorSignatures: SIGNATURE_SCHEMA_VERSION,
      knowledgeLedger: LEDGER_SCHEMA_VERSION
    },
    source: path.relative(ROOT, DATA_FILE),
    totalEntries: entries.length,
    sourceFileCount: new Set(entries.map(item => item.file)).size,
    ruleCounts: Object.fromEntries(['choice', 'grant', 'conflict', 'require', 'modify'].map(key => [
      key,
      entries.filter(item => hasRule(item.entry, key)).length
    ])),
    specialCounts: {
      stackableChoice: entries.filter(item => isStackableChoice(item.entry)).length,
      snapshot: entries.filter(item => hasSnapshot(item.entry)).length,
      hiddenOrRevealed: entries.filter(item => isHidden(item.entry)).length,
      inventoryBundle: entries.filter(item => isBundle(item.entry)).length,
      vehicle: entries.filter(item => hasType(item.entry, VEHICLE_TYPES)).length,
      container: entries.filter(item => hasType(item.entry, CONTAINER_TYPES)).length,
      individual: entries.filter(item => isIndividual(item.entry)).length,
      missingId: entries.filter(item => !item.entry?.id).length,
      legacyImportMappings
    },
    note: 'Klasserna överlappar avsiktligt: en post kan till exempel vara choice-, variant-, batch- och reconciliationbunden.',
    classes,
    behaviorSignatures: {
      definition: {
        entry: ['structure', 'variant', 'rules', 'expectedImpact'],
        action: ['entrySignatureId', 'mutation', 'expectedImpact'],
        catalogCacheLifecycle: 'current catalog reference and __entryDataVersions.db generation only'
      },
      knownModifyTargets: [...knownModifyTargets].sort(),
      entrySignatureCount: entrySignatureGroups.length,
      actionSignatureCount: actionSignatureGroups.length,
      entrySignatureGroups,
      actionSignatureGroups
    },
    knowledgeLedger: {
      statuses: [
        'mapped-and-optimized',
        'mapped-with-known-remaining-cost',
        'correctness-tested-but-not-performance-mapped',
        'scenario-does-not-match-real-user-action',
        'unmapped',
        'device-gap',
        'fallback-reason-too-broad'
      ],
      retainedPerformanceSummaryCount: perfSummaries.length,
      entries: knowledgeLedger
    },
    performanceFindings
  };

  const output = process.env.MUTATION_AUDIT_OUTPUT
    ? path.resolve(ROOT, process.env.MUTATION_AUDIT_OUTPUT)
    : DEFAULT_OUTPUT;
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!/^(1|true|yes)$/i.test(String(process.env.MUTATION_AUDIT_QUIET || ''))) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

await main();
