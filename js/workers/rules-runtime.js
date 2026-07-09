const DEFAULT_TRAIT_VALUES = Object.freeze({
  Diskret: 0,
  Kvick: 0,
  Listig: 0,
  Stark: 0,
  Träffsäker: 0,
  Vaksam: 0,
  Viljestark: 0,
  Övertygande: 0
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStoreHelper(options = {}) {
  const helper = options.storeHelper;
  if (!helper || typeof helper.calcUsedXP !== 'function') {
    throw new Error('storeHelper is not available for worker calculations');
  }
  return helper;
}

function getSearchNormalize(options = {}) {
  if (typeof options.searchNormalize === 'function') {
    return options.searchNormalize;
  }
  return (value) => String(value || '')
    .replace(/\u00e5/g, '__ao__')
    .replace(/\u00e4/g, '__ae__')
    .replace(/\u00f6/g, '__oe__')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/__ao__/g, '\u00e5')
    .replace(/__ae__/g, '\u00e4')
    .replace(/__oe__/g, '\u00f6')
    .toLowerCase()
    .trim();
}

function buildSearchKey(entry, fields, normalize) {
  const direct = typeof entry?.searchKey === 'string'
    ? entry.searchKey
    : '';
  if (direct) return normalize(direct.toLowerCase());

  const selectedFields = Array.isArray(fields) && fields.length
    ? fields
    : ['namn', 'name', 'label', 'text', 'description'];
  const haystack = selectedFields
    .map(field => entry?.[field])
    .filter(value => value !== undefined && value !== null)
    .join(' ');
  return normalize(String(haystack || '').toLowerCase());
}

const TYPE_PRIORITIES = Object.freeze({ Ras: 0, Yrke: 1, Elityrke: 2 });
const LEVEL_ORDER = ['Novis', 'Gesäll', 'Mästare'];

let indexCatalogRows = [];

function compareSv(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'sv', {
    sensitivity: 'base',
    numeric: true
  });
}

function compareTypeRows(a, b) {
  const ta = a.primaryType || '';
  const tb = b.primaryType || '';
  const pa = Object.prototype.hasOwnProperty.call(TYPE_PRIORITIES, ta) ? TYPE_PRIORITIES[ta] : 99;
  const pb = Object.prototype.hasOwnProperty.call(TYPE_PRIORITIES, tb) ? TYPE_PRIORITIES[tb] : 99;
  if (pa !== pb) return pa - pb;
  const typeCompare = compareSv(a.typeKey, b.typeKey);
  if (typeCompare) return typeCompare;
  if ((a.sameLevelSort || b.sameLevelSort) && a.levelIndex !== b.levelIndex) {
    return a.levelIndex - b.levelIndex;
  }
  return compareSv(a.name, b.name);
}

function normalizeCatalogRow(row, index) {
  const typeList = Array.isArray(row?.typList) ? row.typList.map(String) : [];
  const primaryType = row?.primaryType || typeList[0] || 'Övrigt';
  const level = row?.level || '';
  return {
    key: String(row?.key ?? index),
    index,
    name: String(row?.name || ''),
    normName: String(row?.normName || ''),
    normText: String(row?.normText || ''),
    allTags: Array.isArray(row?.allTags) ? row.allTags.map(String) : [],
    hidden: Boolean(row?.hidden),
    primaryType,
    typeKey: typeList.join(','),
    level,
    levelIndex: LEVEL_ORDER.includes(level) ? LEVEL_ORDER.indexOf(level) : 99,
    sameLevelSort: typeList.includes('Elixir') || typeList.includes('Lägre Artefakt')
  };
}

export function initIndexCatalog(payload = {}) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  indexCatalogRows = entries.map(normalizeCatalogRow);
  return {
    total: indexCatalogRows.length
  };
}

export function queryIndexCatalog(payload = {}) {
  const normalize = getSearchNormalize(payload);
  const terms = (Array.isArray(payload.terms) ? payload.terms : [])
    .map(term => normalize(String(term || '').toLowerCase()))
    .filter(Boolean);
  const combinedFilters = (Array.isArray(payload.combinedFilters) ? payload.combinedFilters : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const selectedNames = Array.isArray(payload.selectedNames) && payload.selectedNames.length
    ? new Set(payload.selectedNames)
    : null;
  const randomNames = Array.isArray(payload.randomNames) && payload.randomNames.length
    ? new Set(payload.randomNames)
    : null;
  const union = Boolean(payload.union);
  const hasTerms = terms.length > 0;
  const hasFilterTags = combinedFilters.length > 0;

  const rows = indexCatalogRows.filter(row => {
    if (randomNames && !randomNames.has(row.name)) return false;
    if (row.hidden && !hasTerms) return false;
    const txtHit = hasTerms && (
      union ? terms.some(q => row.normText.includes(q))
        : terms.every(q => row.normText.includes(q))
    );
    const tagHit = hasFilterTags && (
      union
        ? combinedFilters.some(tag => row.allTags.includes(tag))
        : combinedFilters.every(tag => row.allTags.includes(tag))
    );
    const tagOk = !hasFilterTags || tagHit;
    const txtOk = !hasTerms || txtHit;
    const selOk = !selectedNames || selectedNames.has(row.name);
    const combinedOk = union
      ? ((hasFilterTags || hasTerms) ? (tagHit || txtHit) : true)
      : (tagOk && txtOk);
    return combinedOk && selOk;
  });

  rows.sort((a, b) => {
    if (terms.length) {
      const aMatch = terms.every(q => a.normName.includes(q));
      const bMatch = terms.every(q => b.normName.includes(q));
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
    }
    return compareTypeRows(a, b);
  });

  return {
    keys: rows.map(row => row.key),
    indexes: rows.map(row => row.index),
    total: indexCatalogRows.length,
    matched: rows.length
  };
}

export function computeDerivedCharacter(payload = {}, options = {}) {
  const storeHelper = getStoreHelper(options);
  const list = Array.isArray(payload.list) ? payload.list : [];
  const traitValues = {
    ...DEFAULT_TRAIT_VALUES,
    ...(payload.traitValues && typeof payload.traitValues === 'object'
      ? payload.traitValues
      : {})
  };
  const baseXp = toNumber(payload.baseXp, 0);
  const artifactEffects = payload.artifactEffects && typeof payload.artifactEffects === 'object'
    ? payload.artifactEffects
    : {};
  const manualAdjust = payload.manualAdjust && typeof payload.manualAdjust === 'object'
    ? payload.manualAdjust
    : {};
  const combinedEffects = {
    xp: toNumber(artifactEffects.xp, 0) + toNumber(manualAdjust.xp, 0),
    corruption: toNumber(artifactEffects.corruption, 0) + toNumber(manualAdjust.corruption, 0)
  };
  const strength = toNumber(traitValues.Stark, 0);
  const willpower = toNumber(traitValues.Viljestark, 0);
  const corruptionStats = storeHelper.calcCorruptionTrackStats(list, willpower);
  const corruptionEffects = {
    ...combinedEffects,
    korruptionstroskel: toNumber(corruptionStats?.korruptionstroskel, 0)
  };
  const usedXp = storeHelper.calcUsedXP(list, combinedEffects);
  const totalXp = storeHelper.calcTotalXP(baseXp, list);

  return {
    combinedEffects,
    corruptionEffects,
    corruptionStats,
    carryCapacity: storeHelper.calcCarryCapacity(strength, list)
      + toNumber(artifactEffects.capacity, 0)
      + toNumber(manualAdjust.capacity, 0),
    toughness: storeHelper.calcToughness(strength, list)
      + toNumber(artifactEffects.toughness, 0)
      + toNumber(manualAdjust.toughness, 0),
    painThreshold: storeHelper.calcPainThreshold(strength, list, corruptionEffects)
      + toNumber(artifactEffects.pain, 0)
      + toNumber(manualAdjust.pain, 0),
    permanentCorruption: storeHelper.calcPermanentCorruption(list, corruptionEffects),
    totalXp,
    usedXp,
    freeXp: totalXp - usedXp
  };
}

export function filterEntries(payload = {}, options = {}) {
  const normalize = getSearchNormalize(options);
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const termsInput = Array.isArray(payload.searchTerms)
    ? payload.searchTerms
    : (payload.searchTerm === undefined || payload.searchTerm === null
      ? []
      : [payload.searchTerm]);
  const terms = termsInput
    .map(term => normalize(String(term || '').toLowerCase()))
    .filter(Boolean);
  const union = Boolean(payload.union);
  const fields = Array.isArray(payload.fields) ? payload.fields : null;

  const rows = entries.map((entry, index) => ({
    entry,
    index,
    searchKey: buildSearchKey(entry, fields, normalize)
  }));

  const filteredRows = terms.length
    ? rows.filter(row => (
      union
        ? terms.some(term => row.searchKey.includes(term))
        : terms.every(term => row.searchKey.includes(term))
    ))
    : rows;

  return {
    indexes: filteredRows.map(row => row.index),
    entries: filteredRows.map(row => row.entry),
    searchKeys: filteredRows.map(row => row.searchKey),
    terms,
    total: entries.length
  };
}
