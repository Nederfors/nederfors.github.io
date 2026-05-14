import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');

const SKIP_FILES = new Set([
  'all.json',
  'struktur.json',
  'ai-plugin.json',
  'legacy-import-map.json',
  'pdf-list.json',
  'tabeller.json'
]);

const ROOT_FIELD_ORDER = [
  'id',
  'name',
  'description',
  'tags',
  'levels',
  'rules',
  'elite_requirements',
  'key_traits',
  'elite_abilities',
  'possible_benefits',
  'possible_drawbacks',
  'requirement_abilities',
  'suggested_races',
  'suggested_abilities',
  'female_names',
  'male_names',
  'trait_summary',
  'stats',
  'base_price',
  'max_price',
  'qualities',
  'corruption',
  'effect',
  'negative'
];

const TAG_FIELD_ORDER = [
  'types',
  'traditions',
  'tests',
  'qualities',
  'max_count',
  'hidden',
  'race',
  'artifact_binding',
  'xp'
];

const LEVEL_FIELD_ORDER = [
  'description',
  'actions',
  'tests',
  'damage_type',
  'xp',
  'rules'
];

const RULE_FIELD_ORDER = [
  'rule_id',
  'message',
  'when',
  'target',
  'op',
  'value',
  'formula',
  'name',
  'min_level',
  'on_fail',
  'on_pass',
  'source'
];

const ENGLISH_RULE_FAMILIES = ['modify', 'require', 'conflict', 'grant', 'choice'];

const ROOT_SKIP_KEYS = new Set([
  'name', 'namn',
  'description', 'beskrivning',
  'tags', 'taggar',
  'levels', 'nivåer', 'nivaer',
  'rules', 'regler',
  'elite_requirements', 'krav',
  'key_traits', 'viktiga_karaktarsdrag',
  'elite_abilities', 'Elityrkesförmågor',
  'possible_benefits', 'mojliga_fordelar',
  'possible_drawbacks', 'tankbara_nackdelar',
  'requirement_abilities', 'krav_formagor',
  'suggested_races', 'forslag_pa_slakte',
  'suggested_abilities', 'lampliga_formagor',
  'female_names', 'namn_kvinna',
  'male_names', 'namn_man',
  'trait_summary', 'sardrag', 'särdrag', 'sardrag,särdrag',
  'stats', 'stat',
  'base_price', 'grundpris',
  'max_price', 'maxpris',
  'qualities', 'kvalitet',
  'corruption', 'korruption',
  'negative', 'negativ',
  'effect', 'effekt'
]);

const TAG_SKIP_KEYS = new Set([
  'types', 'typ',
  'traditions', 'ark_trad',
  'tests', 'test',
  'qualities', 'kvalitet',
  'max_count', 'max_antal',
  'hidden', 'dold',
  'race', 'ras',
  'artifact_binding', 'artefakt_bindning',
  'xp', 'erf',
  'actions', 'handling',
  'rules', 'regler',
  'nivå_data', 'niva_data'
]);

const LEVEL_SKIP_KEYS = new Set([
  'description', 'beskrivning',
  'actions', 'handling',
  'tests', 'test',
  'damage_type', 'skadetyp',
  'xp', 'erf',
  'rules', 'regler'
]);

const RULE_SKIP_KEYS = new Set([
  'rule_id', 'regel_id',
  'message', 'meddelande',
  'when', 'nar',
  'target', 'mal',
  'op', 'satt', 'operation',
  'value', 'varde',
  'formula', 'formel',
  'name', 'namn',
  'min_level', 'nivå_minst', 'niva_minst', 'level_min', 'levelMin',
  'on_fail', 'else',
  'on_pass', 'vid_uppfyllt',
  'source'
]);

function stripArtifactBinding(rawBinding) {
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) return clone(rawBinding);
  const out = {};
  Object.keys(rawBinding).forEach((key) => {
    if (key === 'options' && Array.isArray(rawBinding.options)) {
      out.options = rawBinding.options.map((option) => {
        if (!option || typeof option !== 'object' || Array.isArray(option)) return clone(option);
        const next = {};
        Object.keys(option).forEach((optionKey) => {
          if (optionKey === 'regler') return;
          next[optionKey] = clone(option[optionKey]);
        });
        const rules = stripRuleBlock(option.rules || option.regler);
        if (rules) next.rules = rules;
        return sortKeys(next, ['value', 'label', 'effects', 'rules']);
      });
      return;
    }
    if (key === 'regler') return;
    out[key] = clone(rawBinding[key]);
  });
  return sortKeys(out, ['options']);
}

function loadCatalogSchema() {
  const schemaPath = path.join(repoRoot, 'js', 'catalog-schema.js');
  const source = fs.readFileSync(schemaPath, 'utf8');
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: schemaPath });
  return sandbox.catalogSchema || sandbox.window.catalogSchema;
}

const catalogSchema = loadCatalogSchema();

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sortKeys(source, preferred = []) {
  const out = {};
  const seen = new Set();
  preferred.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return;
    out[key] = source[key];
    seen.add(key);
  });
  Object.keys(source)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .forEach((key) => {
      out[key] = source[key];
    });
  return out;
}

function stripSourceConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clone(raw);
  const out = {};
  if (raw.types !== undefined || raw.typ !== undefined) out.types = clone(raw.types ?? raw.typ);
  if (raw.when !== undefined) out.when = clone(raw.when);
  Object.keys(raw).forEach((key) => {
    if (key === 'types' || key === 'typ' || key === 'when' || key === 'nar') return;
    out[key] = clone(raw[key]);
  });
  return sortKeys(out, ['types', 'when']);
}

function stripRule(rule, family = '') {
  const out = {};
  const rawTarget = clone(rule.target);
  const rawValue = clone(rule.value);
  const rawOp = clone(rule.op);
  const legacyOperation = catalogSchema.normalizeRuleOp(rule.operation || '');
  const legacySetter = catalogSchema.normalizeRuleOp(rule.satt || '');

  if (rule.rule_id !== undefined) out.rule_id = clone(rule.rule_id);
  if (rule.message !== undefined) out.message = clone(rule.message);
  if (rule.when !== undefined) out.when = clone(rule.when);
  if (rawTarget !== undefined) out.target = rawTarget;

  if (rawTarget === 'price.factor' && legacySetter === 'set' && typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    if (legacyOperation === 'divide' && rawValue !== 0) {
      out.op = 'set';
      out.value = 1 / rawValue;
    } else if (legacyOperation === 'multiply') {
      out.op = 'set';
      out.value = rawValue;
    } else {
      if (rawOp !== undefined) out.op = rawOp;
      if (rawValue !== undefined) out.value = rawValue;
    }
  } else {
    if (rawOp !== undefined) out.op = rawOp;
    if (rawValue !== undefined) out.value = rawValue;
  }

  if (rule.formula !== undefined) out.formula = clone(rule.formula);
  if (family !== 'require' && rule.name !== undefined) out.name = clone(rule.name);
  if (family !== 'require' && rule.min_level !== undefined) out.min_level = clone(rule.min_level);
  if (rule.on_fail !== undefined) out.on_fail = clone(rule.on_fail);
  if (rule.on_pass !== undefined) out.on_pass = clone(rule.on_pass);
  if (rule.source !== undefined) out.source = stripSourceConfig(rule.source);

  Object.keys(rule).forEach((key) => {
    if (RULE_SKIP_KEYS.has(key)) return;
    if (family === 'require' && (key === 'grupp' || key === 'grupp_logik')) return;
    if (key.startsWith('__')) return;
    if (key.startsWith('sourceEntry')) return;
    if (key === 'sourceEntry') return;
    out[key] = clone(rule[key]);
  });

  return sortKeys(out, RULE_FIELD_ORDER);
}

function stripRuleBlock(rawBlock) {
  if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return undefined;
  const out = {};
  const ignoredFamilyKeys = new Set([
    ...ENGLISH_RULE_FAMILIES,
    ...(Array.isArray(catalogSchema.LEGACY_RULE_KEYS) ? catalogSchema.LEGACY_RULE_KEYS : [])
  ]);
  ENGLISH_RULE_FAMILIES.forEach((family) => {
    const list = Array.isArray(rawBlock[family]) ? rawBlock[family] : [];
    if (!list.length) return;
    out[family] = list.map((rule) => stripRule(rule, family));
  });
  Object.keys(rawBlock).forEach((key) => {
    if (ignoredFamilyKeys.has(key)) return;
    out[key] = clone(rawBlock[key]);
  });
  return Object.keys(out).length ? out : undefined;
}

function stripLevel(level) {
  if (typeof level === 'string') return level;
  if (!level || typeof level !== 'object' || Array.isArray(level)) return undefined;
  const out = {};
  if (level.description !== undefined) out.description = clone(level.description);
  if (level.actions !== undefined) out.actions = clone(level.actions);
  if (level.tests !== undefined) out.tests = clone(level.tests);
  if (level.damage_type !== undefined) out.damage_type = clone(level.damage_type);
  if (level.xp !== undefined) out.xp = clone(level.xp);
  const rules = stripRuleBlock(level.rules);
  if (rules) out.rules = rules;

  Object.keys(level).forEach((key) => {
    if (LEVEL_SKIP_KEYS.has(key)) return;
    out[key] = clone(level[key]);
  });

  return sortKeys(out, LEVEL_FIELD_ORDER);
}

function stripLevels(levels) {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels)) return undefined;
  const out = {};
  Object.keys(levels).forEach((levelName) => {
    const stripped = stripLevel(levels[levelName]);
    if (stripped === undefined) return;
    out[levelName] = stripped;
  });
  return Object.keys(out).length ? out : undefined;
}

function stripTags(tags) {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return undefined;
  const out = {};
  TAG_FIELD_ORDER.forEach((key) => {
    if (tags[key] === undefined) return;
    out[key] = key === 'artifact_binding' ? stripArtifactBinding(tags[key]) : clone(tags[key]);
  });

  Object.keys(tags).forEach((key) => {
    if (TAG_SKIP_KEYS.has(key)) return;
    out[key] = clone(tags[key]);
  });

  return Object.keys(out).length ? sortKeys(out, TAG_FIELD_ORDER) : undefined;
}

function stripEliteRequirements(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  if (raw.total_xp !== undefined) out.total_xp = clone(raw.total_xp);
  if (Array.isArray(raw.stages)) out.stages = clone(raw.stages);
  Object.keys(raw).forEach((key) => {
    if (key === 'total_xp' || key === 'stages') return;
    out[key] = clone(raw[key]);
  });
  return Object.keys(out).length ? sortKeys(out, ['total_xp', 'stages']) : undefined;
}

function stripEntry(entry) {
  const normalized = catalogSchema.normalizeEntry(entry);
  const out = {};

  if (normalized.id !== undefined) out.id = clone(normalized.id);
  if (normalized.name !== undefined) out.name = clone(normalized.name);
  if (normalized.description !== undefined) out.description = clone(normalized.description);

  const tags = stripTags(normalized.tags);
  if (tags) out.tags = tags;

  const levels = stripLevels(normalized.levels);
  if (levels) out.levels = levels;

  const rules = stripRuleBlock(normalized.rules);
  if (rules) out.rules = rules;

  const eliteRequirements = stripEliteRequirements(normalized.elite_requirements);
  if (eliteRequirements) out.elite_requirements = eliteRequirements;

  ROOT_FIELD_ORDER.forEach((key) => {
    if (normalized[key] !== undefined && out[key] === undefined) {
      out[key] = clone(normalized[key]);
    }
  });

  Object.keys(normalized).forEach((key) => {
    if (ROOT_SKIP_KEYS.has(key)) return;
    if (key.startsWith('__')) return;
    out[key] = clone(normalized[key]);
  });

  return sortKeys(out, ROOT_FIELD_ORDER);
}

function stripTypeTemplate(template) {
  const normalized = catalogSchema.normalizeEntry(template);
  const out = {};
  const tags = stripTags(normalized.tags);
  if (tags) out.tags = tags;
  const levels = stripLevels(normalized.levels);
  if (levels) out.levels = levels;
  const rules = stripRuleBlock(normalized.rules);
  if (rules) out.rules = rules;
  return sortKeys(out, ['tags', 'levels', 'rules']);
}

function migratePayload(payload) {
  const normalized = catalogSchema.normalizePayload(payload);
  const out = {
    schema_version: 3,
    type_rules: {},
    entries: normalized.entries.map(stripEntry)
  };

  Object.keys(normalized.typeRules || {}).forEach((typeName) => {
    out.type_rules[typeName] = stripTypeTemplate(normalized.typeRules[typeName]);
  });

  Object.keys(normalized.extra || {})
    .sort((a, b) => a.localeCompare(b, 'en'))
    .forEach((key) => {
      out[key] = clone(normalized.extra[key]);
    });

  if (!Object.keys(out.type_rules).length) delete out.type_rules;
  return sortKeys(out, ['schema_version', 'type_rules', 'entries']);
}

function getTargetFiles(args) {
  const requested = args.filter(Boolean);
  if (requested.length) {
    return requested.map((name) => {
      if (path.isAbsolute(name)) return name;
      const normalized = String(name).startsWith('data/') ? String(name).slice(5) : String(name);
      return path.join(dataDir, normalized);
    });
  }
  return fs.readdirSync(dataDir)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !SKIP_FILES.has(name))
    .map((name) => path.join(dataDir, name));
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const files = getTargetFiles(args.filter((arg) => arg !== '--check'));
  const changed = [];

  files.forEach((fullPath) => {
    const source = fs.readFileSync(fullPath, 'utf8');
    const raw = JSON.parse(source);
    const migrated = migratePayload(raw);
    const next = `${JSON.stringify(migrated, null, 2)}\n`;
    if (next === source) return;
    changed.push(path.relative(repoRoot, fullPath));
    if (!checkOnly) {
      fs.writeFileSync(fullPath, next, 'utf8');
    }
  });

  if (changed.length) {
    const prefix = checkOnly ? 'Would migrate' : 'Migrated';
    console.log(`${prefix} ${changed.length} file(s):`);
    changed.forEach((name) => console.log(`- ${name}`));
    if (checkOnly) process.exitCode = 1;
    return;
  }

  console.log(checkOnly ? 'No files need migration.' : 'No files changed.');
}

main();
