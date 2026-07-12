import fs from 'fs';
import { execFileSync } from 'child_process';

const CONFIG_KEYS = Object.freeze([
  'kraver_logik',
  'krav_logik',
  'kraver_typ_och_entry',
  'krav_typ_och_entry',
  'ignorera_typ_kraver',
  'ignorera_krav_popup',
  'skip_requirement_popup'
]);
const RULE_FAMILY_KEYS = Object.freeze([
  'andrar',
  'kraver',
  'krockar',
  'ger',
  'val',
  'modify',
  'require',
  'conflict',
  'grant',
  'choice'
]);
const LEGACY_RULE_FAMILIES = Object.freeze(['andrar', 'kraver', 'krockar', 'ger', 'val']);
const ENGLISH_RULE_FAMILY = Object.freeze({
  andrar: 'modify',
  kraver: 'require',
  krockar: 'conflict',
  ger: 'grant',
  val: 'choice'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!isObject(value)) return value;
  const out = {};
  Object.keys(value).forEach((key) => {
    out[key] = clone(value[key]);
  });
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readHeadJson(filePath) {
  const text = execFileSync('git', ['show', `HEAD:${filePath}`], { encoding: 'utf8' });
  return JSON.parse(text);
}

function getPayloadEntries(payload) {
  return Array.isArray(payload?.entries) ? payload.entries : [];
}

function getPayloadTypeRules(payload) {
  const typeRules = payload?.type_rules ?? payload?.typ_regler;
  return isObject(typeRules) ? typeRules : {};
}

function getTopRuleBlock(entry) {
  if (!isObject(entry)) return null;
  if (isObject(entry.rules)) return entry.rules;
  if (isObject(entry.regler)) return entry.regler;
  if (isObject(entry.tags?.rules)) return entry.tags.rules;
  if (isObject(entry.taggar?.regler)) return entry.taggar.regler;
  if (
    CONFIG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(entry, key))
    || RULE_FAMILY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(entry, key))
  ) {
    return entry;
  }
  return null;
}

function ensureTopRuleBlock(entry) {
  if (!isObject(entry)) return null;
  if (!isObject(entry.rules)) entry.rules = {};
  return entry.rules;
}

function getLevelMap(entry) {
  if (!isObject(entry)) return {};
  if (isObject(entry.levels)) return entry.levels;
  if (isObject(entry.nivåer)) return entry.nivåer;
  if (isObject(entry.nivaer)) return entry.nivaer;
  return {};
}

function getLegacyLevelMap(entry) {
  if (!isObject(entry)) return {};
  const fromTags = entry.taggar?.nivå_data ?? entry.taggar?.niva_data;
  if (isObject(fromTags)) return fromTags;
  return getLevelMap(entry);
}

function getLevelRuleBlock(levelValue) {
  if (!isObject(levelValue)) return null;
  if (isObject(levelValue.rules)) return levelValue.rules;
  if (isObject(levelValue.regler)) return levelValue.regler;
  return null;
}

function ensureLevelRuleBlock(levelValue) {
  if (!isObject(levelValue)) return null;
  if (!isObject(levelValue.rules)) levelValue.rules = {};
  return levelValue.rules;
}

function copyConfig(oldBlock, currentBlock) {
  if (!isObject(oldBlock) || !isObject(currentBlock)) return false;
  let changed = false;
  CONFIG_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(oldBlock, key)) return;
    const nextValue = oldBlock[key];
    if (nextValue === undefined) return;
    if (Object.prototype.hasOwnProperty.call(currentBlock, key)) return;
    currentBlock[key] = clone(nextValue);
    changed = true;
  });
  return changed;
}

function getRuleList(block, legacyFamily) {
  if (!isObject(block)) return [];
  const englishFamily = ENGLISH_RULE_FAMILY[legacyFamily];
  if (Array.isArray(block[legacyFamily])) return block[legacyFamily];
  if (englishFamily && Array.isArray(block[englishFamily])) return block[englishFamily];
  return [];
}

function copyRuleExtras(oldBlock, currentBlock) {
  if (!isObject(oldBlock) || !isObject(currentBlock)) return false;
  let changed = false;
  LEGACY_RULE_FAMILIES.forEach((legacyFamily) => {
    const oldList = getRuleList(oldBlock, legacyFamily);
    const currentList = getRuleList(currentBlock, legacyFamily);
    const len = Math.min(oldList.length, currentList.length);
    for (let index = 0; index < len; index += 1) {
      const oldRule = oldList[index];
      const currentRule = currentList[index];
      if (!isObject(oldRule) || !isObject(currentRule)) continue;
      if (oldRule.id !== undefined && currentRule.id === undefined) {
        currentRule.id = clone(oldRule.id);
        changed = true;
      }
    }
  });
  return changed;
}

function entryKey(entry) {
  if (!isObject(entry)) return '';
  const id = String(entry.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(entry.name ?? entry.namn ?? '').trim();
  return name ? `name:${name}` : '';
}

function mergeEntryConfig(oldEntry, currentEntry) {
  let changed = false;
  const oldTopBlock = getTopRuleBlock(oldEntry);
  const currentTopBlock = ensureTopRuleBlock(currentEntry);
  changed = copyConfig(oldTopBlock, currentTopBlock) || changed;
  changed = copyRuleExtras(oldTopBlock, currentTopBlock) || changed;

  const oldLevels = getLegacyLevelMap(oldEntry);
  const currentLevels = getLevelMap(currentEntry);
  Object.keys(oldLevels).forEach((levelName) => {
    const oldLevel = oldLevels[levelName];
    const currentLevel = currentLevels[levelName];
    if (!isObject(oldLevel) || !isObject(currentLevel)) return;
    const oldLevelBlock = getLevelRuleBlock(oldLevel);
    const currentLevelBlock = ensureLevelRuleBlock(currentLevel);
    changed = copyConfig(oldLevelBlock, currentLevelBlock) || changed;
    changed = copyRuleExtras(oldLevelBlock, currentLevelBlock) || changed;
  });

  return changed;
}

function mergePayload(oldPayload, currentPayload) {
  let changed = false;

  const oldTypeRules = getPayloadTypeRules(oldPayload);
  const currentTypeRules = getPayloadTypeRules(currentPayload);
  Object.keys(oldTypeRules).forEach((typeName) => {
    if (!isObject(currentTypeRules[typeName])) return;
    changed = mergeEntryConfig(oldTypeRules[typeName], currentTypeRules[typeName]) || changed;
  });

  const oldEntryMap = new Map();
  getPayloadEntries(oldPayload).forEach((entry) => {
    const key = entryKey(entry);
    if (key) oldEntryMap.set(key, entry);
  });

  getPayloadEntries(currentPayload).forEach((entry) => {
    const key = entryKey(entry);
    if (!key || !oldEntryMap.has(key)) return;
    changed = mergeEntryConfig(oldEntryMap.get(key), entry) || changed;
  });

  return changed;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/restore_rule_block_config_from_head.mjs <file> [more files]');
  process.exit(1);
}

let changedFiles = 0;
files.forEach((filePath) => {
  const currentPayload = readJson(filePath);
  const oldPayload = readHeadJson(filePath);
  if (!mergePayload(oldPayload, currentPayload)) return;
  writeJson(filePath, currentPayload);
  changedFiles += 1;
  console.log(`restored config: ${filePath}`);
});

if (!changedFiles) {
  console.log('no config changes restored');
}
