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
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
