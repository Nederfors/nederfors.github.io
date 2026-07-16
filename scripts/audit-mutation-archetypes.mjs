import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'all.json');
const LEGACY_MAP_FILE = path.join(ROOT, 'data', 'legacy-import-map.json');
const DEFAULT_OUTPUT = path.join(ROOT, '.artifacts', 'mutation-archetypes.json');

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
        mutationPath: 'Befintlig inventorypipeline; flytt/load/unload/bundle planeras där möjligt.',
        renderingPath: 'Full inventoryrender är kvar som säker standard för container-/vehicle-/bundletopologi.',
        commitShape: 'Batchning bevaras, men strukturell fallback kan göra dyrare DOM-arbete.',
        reconciliation: 'Endast om posten också har listregler.',
        invalidates: ['inventory.structure', 'inventory.totals', 'summary.economy', 'persistence'],
        observers: ['AutoAnimate efter full struktur', 'inventory observers'],
        fastPath: 'Endast stabil top-level quantity; inte topology mutation.',
        fallback: ['contains-tree', 'vehicle category', 'bundle expansion', 'individuell instans']
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

  const report = {
    generatedAt: new Date().toISOString(),
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
    classes
  };

  const output = process.env.MUTATION_AUDIT_OUTPUT
    ? path.resolve(ROOT, process.env.MUTATION_AUDIT_OUTPUT)
    : DEFAULT_OUTPUT;
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
