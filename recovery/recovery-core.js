export const RECOVERY_FORMAT = 'symbapedia-recovery';
export const RECOVERY_FORMAT_VERSION = 1;
export const HANDOFF_TYPE = 'symbapedia-recovery-transfer';
export const HANDOFF_VERSION = 1;
export const DATABASE_NAME = 'symbapedia-app';

const NATIVE_GENERATIONS = new Map([
  [10, 'indexeddb-v1'],
  [20, 'indexeddb-v2'],
  [30, 'indexeddb-v3']
]);

const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])])
  );
}

export function stableStringify(value, space = 0) {
  return JSON.stringify(stableValue(value), null, space);
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function evidence(value) {
  try {
    return clone(value);
  } catch {
    return String(value);
  }
}

function sourceKey(source) {
  return [source.family, source.generation, source.databaseVersion ?? '', source.fileName ?? ''].join(':');
}

function anomaly(code, source, message, rawEvidence, severity = 'warning') {
  return { code, severity, source: clone(source), message, evidence: evidence(rawEvidence) };
}

function normalFolder(folder, source, index, anomalies) {
  if (!isRecord(folder) || !String(folder.id ?? folder.folderId ?? '').trim()) {
    anomalies.push(anomaly('malformed-folder', source, 'A folder row is missing a usable ID.', folder));
    return null;
  }
  const id = String(folder.id ?? folder.folderId).trim();
  return {
    sourceId: id,
    name: String(folder.name ?? folder.folder ?? 'Recovered folder'),
    order: Number.isFinite(Number(folder.order)) ? Number(folder.order) : index,
    system: folder.system === true,
    source: clone(source)
  };
}

function addSnapshotCandidates(snapshot, source, result) {
  if (!isRecord(snapshot)) {
    result.anomalies.push(anomaly('malformed-snapshot', source, 'The storage snapshot is not an object.', snapshot));
    return;
  }
  const material = isRecord(snapshot.meta) ? { ...snapshot, ...snapshot.meta } : snapshot;
  const metadata = Array.isArray(material.characters) ? material.characters : [];
  const data = isRecord(snapshot.data) ? snapshot.data : {};
  const metadataById = new Map();

  if (!Array.isArray(material.characters)) {
    result.anomalies.push(anomaly('malformed-character-metadata', source, 'Character metadata is not an array.', material.characters));
  }
  metadata.forEach((row, index) => {
    const id = isRecord(row) ? String(row.id ?? '').trim() : '';
    if (!id) {
      result.anomalies.push(anomaly('malformed-character-metadata', source, 'A character metadata row is missing a usable ID.', row));
      return;
    }
    if (metadataById.has(id)) {
      result.anomalies.push(anomaly('duplicate-character-metadata', { ...source, sourceId: id }, 'Duplicate character metadata was preserved as anomaly evidence.', [metadataById.get(id), row]));
      return;
    }
    metadataById.set(id, { ...clone(row), _order: index });
  });

  const folderRows = Array.isArray(material.folders) ? material.folders : [];
  if (material.folders !== undefined && !Array.isArray(material.folders)) {
    result.anomalies.push(anomaly('malformed-folder-list', source, 'Folder metadata is not an array.', material.folders));
  }
  const folderById = new Map();
  folderRows.forEach((row, index) => {
    const folder = normalFolder(row, source, index, result.anomalies);
    if (!folder) return;
    folderById.set(folder.sourceId, folder);
    result.folders.push(folder);
  });

  const ids = new Set([...metadataById.keys(), ...Object.keys(data)]);
  [...ids].sort().forEach(id => {
    const meta = metadataById.get(id);
    const state = data[id];
    if (!meta) {
      result.anomalies.push(anomaly('orphan-character-state', { ...source, sourceId: id }, 'Character state has no matching metadata row.', state));
    }
    if (!isRecord(state)) {
      result.anomalies.push(anomaly(
        state === undefined ? 'missing-character-state' : 'malformed-character-state',
        { ...source, sourceId: id },
        state === undefined ? 'Character metadata has no state record.' : 'Character state is not an object.',
        state === undefined ? meta : state
      ));
      return;
    }
    const folderId = String(meta?.folderId ?? '').trim();
    if (folderId && !folderById.has(folderId)) {
      result.anomalies.push(anomaly('orphan-folder-relationship', { ...source, sourceId: id }, 'The character references a folder that is not present in this source.', { folderId, metadata: meta }));
    }
    result.candidates.push({
      sourceId: id,
      name: String(meta?.name ?? `Recovered ${id}`),
      folder: folderId ? { id: folderId, name: folderById.get(folderId)?.name ?? '' } : null,
      data: clone(state),
      source: { ...clone(source), sourceId: id },
      rawEvidence: { metadata: clone(meta), state: clone(state) }
    });
  });
}

function parseJson(raw, source, result, code) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    result.anomalies.push(anomaly(code, source, 'JSON could not be parsed.', { raw, error: String(error?.message || error) }, 'error'));
    return undefined;
  }
}

export function extractLocalStorage(entries = {}) {
  const result = { inventory: [], candidates: [], folders: [], hostedProvenance: [], anomalies: [] };
  const keys = Object.keys(entries).sort();

  if (Object.prototype.hasOwnProperty.call(entries, 'rpall')) {
    const source = { family: 'localStorage', generation: 'combined-rpall' };
    const parsed = parseJson(entries.rpall, source, result, 'malformed-combined-json');
    result.inventory.push({ ...source, detected: true, readable: parsed !== undefined, keys: ['rpall'] });
    if (parsed !== undefined) addSnapshotCandidates(parsed, source, result);
  } else {
    result.inventory.push({ family: 'localStorage', generation: 'combined-rpall', detected: false, readable: true, keys: [] });
  }

  const splitKeys = keys.filter(key => key === 'rpall-meta' || key.startsWith('rpall-char-'));
  if (splitKeys.length) {
    const source = { family: 'localStorage', generation: 'split-rpall' };
    const meta = Object.prototype.hasOwnProperty.call(entries, 'rpall-meta')
      ? parseJson(entries['rpall-meta'], source, result, 'malformed-split-meta-json')
      : {};
    if (!Object.prototype.hasOwnProperty.call(entries, 'rpall-meta')) {
      result.anomalies.push(anomaly('missing-split-meta', source, 'Split character keys exist without rpall-meta.', splitKeys));
    }
    const snapshot = isRecord(meta) ? { ...meta, data: {} } : { data: {} };
    for (const key of splitKeys.filter(key => key.startsWith('rpall-char-'))) {
      const id = key.slice('rpall-char-'.length);
      if (!id) {
        result.anomalies.push(anomaly('malformed-split-key', source, 'A split character key has no character ID.', { key, raw: entries[key] }));
        continue;
      }
      const parsed = parseJson(entries[key], { ...source, sourceId: id, key }, result, 'malformed-split-character-json');
      if (parsed !== undefined) snapshot.data[id] = parsed;
    }
    result.inventory.push({ ...source, detected: true, readable: true, keys: splitKeys });
    addSnapshotCandidates(snapshot, source, result);
  } else {
    result.inventory.push({ family: 'localStorage', generation: 'split-rpall', detected: false, readable: true, keys: [] });
  }
  return result;
}

function distinctValues(rows, selector) {
  const byValue = new Map();
  rows.forEach(row => {
    const value = selector(row);
    const key = stableStringify(value);
    if (!byValue.has(key)) byValue.set(key, value);
  });
  return [...byValue.values()];
}

export function extractIndexedDb(snapshot) {
  const result = { inventory: [], candidates: [], folders: [], hostedProvenance: [], anomalies: [] };
  if (!snapshot) {
    result.inventory.push({ family: 'IndexedDB', generation: 'symbapedia-app', detected: false, readable: true });
    return result;
  }
  const version = Number(snapshot.version);
  const generation = NATIVE_GENERATIONS.get(version);
  const baseSource = { family: 'IndexedDB', generation: generation ?? 'unsupported', databaseName: DATABASE_NAME, databaseVersion: version };
  const stores = isRecord(snapshot.stores) ? snapshot.stores : {};
  const counts = Object.fromEntries(Object.keys(stores).sort().map(name => [
    name,
    Array.isArray(stores[name]) ? stores[name].length : Number.isFinite(Number(stores[name]?.count)) ? Number(stores[name].count) : null
  ]));
  result.inventory.push({ ...baseSource, detected: true, readable: Boolean(generation), stores: counts, excludedFromRecovery: ['cachedEntries', 'uiPrefs'] });
  if (!generation) {
    result.anomalies.push(anomaly('unsupported-indexeddb-version', baseSource, 'The existing database version is not an established recoverable generation.', { version, stores: Object.keys(stores) }, 'error'));
    return result;
  }

  const rows = name => Array.isArray(stores[name]) ? stores[name] : [];
  const characters = new Map();
  rows('characters').forEach(row => {
    const id = isRecord(row) ? String(row.id ?? '').trim() : '';
    if (!id) {
      result.anomalies.push(anomaly('malformed-indexeddb-character', baseSource, 'An IndexedDB character row is missing a usable ID.', row));
      return;
    }
    if (characters.has(id)) {
      result.anomalies.push(anomaly('duplicate-indexeddb-character', { ...baseSource, sourceId: id }, 'Duplicate character rows were found.', [characters.get(id), row]));
      return;
    }
    characters.set(id, clone(row));
  });

  const folderById = new Map();
  rows('folders').forEach((row, index) => {
    const folder = normalFolder(row, baseSource, index, result.anomalies);
    if (!folder) return;
    folderById.set(folder.sourceId, folder);
    result.folders.push(folder);
  });

  const states = new Map();
  rows('characterState').forEach(row => {
    const id = isRecord(row) ? String(row.id ?? '').trim() : '';
    if (!id || !isRecord(row.state)) {
      result.anomalies.push(anomaly('malformed-indexeddb-state', { ...baseSource, sourceId: id || undefined }, 'A v1 state row is missing an ID or object state.', row));
      return;
    }
    if (!states.has(id)) states.set(id, []);
    states.get(id).push(clone(row));
  });

  const fields = new Map();
  rows('characterFields').forEach(row => {
    const id = isRecord(row) ? String(row.charId ?? '').trim() : '';
    const field = isRecord(row) ? String(row.field ?? '').trim() : '';
    if (!id || !field || row.value === undefined) {
      result.anomalies.push(anomaly('malformed-indexeddb-field', { ...baseSource, sourceId: id || undefined }, 'A v2 field row is missing charId, field, or value.', row));
      return;
    }
    if (!fields.has(id)) fields.set(id, new Map());
    if (!fields.get(id).has(field)) fields.get(id).set(field, []);
    fields.get(id).get(field).push(clone(row));
  });

  const ids = new Set([...characters.keys(), ...states.keys(), ...fields.keys()]);
  [...ids].sort().forEach(id => {
    const source = { ...baseSource, sourceId: id };
    const meta = characters.get(id);
    const stateRows = states.get(id) ?? [];
    const fieldGroups = fields.get(id) ?? new Map();
    if (!meta) {
      result.anomalies.push(anomaly('orphan-indexeddb-state', source, 'State or field rows have no matching character metadata.', { states: stateRows, fields: [...fieldGroups.values()].flat() }));
    }
    const baseStates = distinctValues(stateRows, row => row.state);
    if (baseStates.length > 1) {
      result.anomalies.push(anomaly('conflicting-indexeddb-states', source, 'Multiple materially different v1 states were found.', stateRows));
    }
    let variants = baseStates.length ? baseStates.map(clone) : [{}];
    if (!baseStates.length && fieldGroups.size) {
      result.anomalies.push(anomaly('missing-indexeddb-base-state', source, 'v2 fields exist without a v1 base state; available fields remain recoverable.', [...fieldGroups.values()].flat()));
    }
    for (const [field, fieldRows] of [...fieldGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const values = distinctValues(fieldRows, row => row.value);
      if (values.length > 1) {
        result.anomalies.push(anomaly('conflicting-indexeddb-fields', source, `Multiple materially different values exist for field ${field}.`, fieldRows));
      }
      variants = variants.flatMap(base => values.map(value => ({ ...clone(base), [field]: clone(value) })));
      if (variants.length > 128) {
        result.anomalies.push(anomaly('indexeddb-variant-limit', source, 'Conflicting field combinations exceeded the safe recovery limit.', { field, variantCount: variants.length }, 'error'));
        variants = [];
        break;
      }
    }
    if (!stateRows.length && !fieldGroups.size) {
      result.anomalies.push(anomaly('missing-indexeddb-character-state', source, 'Character metadata has neither v1 state nor v2 fields.', meta));
      return;
    }
    const folderId = String(meta?.folderId ?? '').trim();
    if (folderId && !folderById.has(folderId)) {
      result.anomalies.push(anomaly('orphan-folder-relationship', source, 'The character references a missing IndexedDB folder.', { folderId, metadata: meta }));
    }
    variants.forEach((data, index) => {
      result.candidates.push({
        sourceId: id,
        name: String(meta?.name ?? `Recovered ${id}`),
        folder: folderId ? { id: folderId, name: folderById.get(folderId)?.name ?? '' } : null,
        data,
        source,
        rawEvidence: { metadata: clone(meta), states: clone(stateRows), fields: clone([...fieldGroups.values()].flat()), internalVariant: index + 1 }
      });
    });
  });

  rows('hostedCharacterProvenance').forEach(row => {
    if (!isRecord(row) || !String(row.accountId ?? '').trim() || !String(row.characterId ?? '').trim()) {
      result.anomalies.push(anomaly('malformed-hosted-provenance', baseSource, 'A hosted provenance row is missing accountId or characterId.', row));
      return;
    }
    if (!characters.has(String(row.characterId))) {
      result.anomalies.push(anomaly('orphan-hosted-provenance', { ...baseSource, sourceId: String(row.characterId) }, 'Hosted provenance references a character not present in metadata.', row));
    }
    result.hostedProvenance.push({ source: clone(baseSource), record: clone(row), recoveryProvenance: false });
  });
  return result;
}

function normalizeJsonCharacter(item, context, result) {
  if (!isRecord(item)) {
    result.anomalies.push(anomaly('malformed-json-character', context.source, 'A JSON character entry is not an object.', item));
    return;
  }
  const format = String(item.format ?? '').trim();
  const version = Number(item.formatVersion);
  if (format && (format !== 'symbapedia-character' || ![1, 2].includes(version))) {
    result.anomalies.push(anomaly('unsupported-json-character-format', context.source, 'The JSON character format/version is not supported by the R1A contract.', { format, formatVersion: item.formatVersion, item }, 'error'));
    return;
  }
  if (!isRecord(item.data)) {
    result.anomalies.push(anomaly('malformed-json-character-data', context.source, 'A JSON character has no object data payload.', item));
    return;
  }
  const explicitId = String(item.sourceId ?? item.characterId ?? item.id ?? '').trim();
  const sourceId = explicitId || `json:${context.fileName}:${context.path}`;
  const folderId = String(item.folderId ?? context.folderId ?? '').trim();
  const folderName = String(item.folder ?? context.folderName ?? '').trim();
  result.candidates.push({
    sourceId,
    name: String(item.name ?? `Recovered ${sourceId}`),
    folder: folderId || folderName ? { id: folderId || `json-folder:${context.path}`, name: folderName } : null,
    data: clone(item.data),
    source: { ...clone(context.source), sourceId, generation: format ? `symbapedia-character-v${version}` : 'unversioned-character' },
    rawEvidence: clone(item)
  });
}

export function extractLegacyJson(text, fileName = 'recovery.json') {
  const baseSource = { family: 'user-json', generation: 'legacy-json', fileName };
  const result = { inventory: [{ ...baseSource, detected: true, readable: false }], candidates: [], folders: [], hostedProvenance: [], anomalies: [] };
  const parsed = parseJson(text, baseSource, result, 'malformed-user-json');
  if (parsed === undefined) return result;
  result.inventory[0].readable = true;

  const addList = (list, path, folder = {}) => list.forEach((item, index) => normalizeJsonCharacter(item, {
    source: baseSource,
    fileName,
    path: `${path}[${index}]`,
    folderId: folder.id,
    folderName: folder.name
  }, result));

  if (Array.isArray(parsed)) {
    addList(parsed, '$');
  } else if (isRecord(parsed) && Array.isArray(parsed.folders)) {
    parsed.folders.forEach((folder, index) => {
      const id = String(folder?.id ?? folder?.folderId ?? `json-folder:${index}`);
      const name = String(folder?.name ?? folder?.folder ?? 'Recovered folder');
      result.folders.push({ sourceId: id, name, order: index, system: folder?.system === true, source: clone(baseSource) });
      if (!Array.isArray(folder?.characters)) {
        result.anomalies.push(anomaly('malformed-json-folder', baseSource, 'A JSON folder has no characters array.', folder));
        return;
      }
      addList(folder.characters, `$.folders[${index}].characters`, { id, name });
    });
  } else if (isRecord(parsed) && Array.isArray(parsed.characters)) {
    addList(parsed.characters, '$.characters');
  } else {
    normalizeJsonCharacter(parsed, { source: baseSource, fileName, path: '$' }, result);
  }
  return result;
}

function mergeFolders(folders) {
  const merged = new Map();
  folders.forEach(folder => {
    const content = { sourceId: folder.sourceId, name: folder.name, order: folder.order, system: folder.system };
    const key = stableStringify(content);
    if (!merged.has(key)) merged.set(key, { ...content, sources: [] });
    merged.get(key).sources.push(clone(folder.source));
  });
  return [...merged.values()]
    .map(folder => ({ ...folder, sources: folder.sources.sort((a, b) => sourceKey(a).localeCompare(sourceKey(b))) }))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

export function buildRecoveryEnvelope({ sourceOrigin, extractions }) {
  const candidates = extractions.flatMap(item => item.candidates ?? []);
  const anomalies = extractions.flatMap(item => item.anomalies ?? []);
  const deduplicated = new Map();

  candidates.forEach(candidate => {
    const canonicalContent = {
      sourceId: candidate.sourceId,
      name: candidate.name,
      folder: candidate.folder,
      data: candidate.data
    };
    const canonicalString = stableStringify(canonicalContent);
    const key = `${candidate.sourceId}\n${canonicalString}`;
    if (!deduplicated.has(key)) {
      deduplicated.set(key, {
        sourceId: candidate.sourceId,
        name: candidate.name,
        folder: clone(candidate.folder),
        data: clone(candidate.data),
        stableContentKey: `fnv1a64:${fnv1a64(canonicalString)}`,
        sources: [],
        evidence: []
      });
    }
    deduplicated.get(key).sources.push(clone(candidate.source));
    deduplicated.get(key).evidence.push(clone(candidate.rawEvidence));
  });

  const characters = [...deduplicated.values()];
  const bySourceId = new Map();
  characters.forEach(character => {
    if (!bySourceId.has(character.sourceId)) bySourceId.set(character.sourceId, []);
    bySourceId.get(character.sourceId).push(character);
  });
  for (const [sourceId, variants] of bySourceId) {
    variants.sort((a, b) => a.stableContentKey.localeCompare(b.stableContentKey));
    if (variants.length > 1) {
      anomalies.push(anomaly('same-source-id-conflict', { family: 'cross-generation', generation: 'canonicalization', sourceId }, 'Materially different candidates share a source ID; every labeled variant is preserved.', variants.map(value => ({ stableContentKey: value.stableContentKey, sources: value.sources }))));
    }
    variants.forEach((variant, index) => {
      variant.variant = { index: index + 1, count: variants.length, label: variants.length > 1 ? `Variant ${index + 1} of ${variants.length}` : 'Exact canonical candidate' };
      variant.sources.sort((a, b) => sourceKey(a).localeCompare(sourceKey(b)));
    });
  }
  characters.sort((a, b) => `${a.sourceId}:${a.stableContentKey}`.localeCompare(`${b.sourceId}:${b.stableContentKey}`));

  const normalizedAnomalies = anomalies
    .map(item => ({ ...item, stableAnomalyKey: `fnv1a64:${fnv1a64(stableStringify(item))}` }))
    .sort((a, b) => `${a.code}:${a.stableAnomalyKey}`.localeCompare(`${b.code}:${b.stableAnomalyKey}`));

  return {
    recoveryFormat: RECOVERY_FORMAT,
    formatVersion: RECOVERY_FORMAT_VERSION,
    sourceOrigin: String(sourceOrigin || ''),
    sourceInventory: extractions.flatMap(item => item.inventory ?? []).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    characters,
    folders: mergeFolders(extractions.flatMap(item => item.folders ?? [])),
    hostedProvenanceArchive: extractions.flatMap(item => item.hostedProvenance ?? []).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    anomalies: normalizedAnomalies,
    fingerprintMaterial: {
      algorithm: 'canonical-json-v1',
      note: 'R1C may hash each character canonical content with SHA-256; this bridge does not allocate destination IDs or write recovery provenance.'
    }
  };
}

export function serializeRecoveryEnvelope(envelope) {
  return `${stableStringify(envelope, 2)}\n`;
}

export function buildCharacterExports(envelope) {
  return envelope.characters.map((character, index) => {
    // Version 1 keeps these legacy fields on the destination's migration path.
    const payload = {
      format: 'symbapedia-character',
      formatVersion: 1,
      name: character.name,
      data: character.data
    };
    if (character.folder) {
      payload.folderId = character.folder.id;
      payload.folder = character.folder.name;
    }
    const name = String(character.name || 'Recovered character')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 100) || 'Recovered-character';
    const variant = character.variant.count > 1 ? `-variant-${character.variant.index}` : '';
    return {
      filename: `${String(index + 1).padStart(3, '0')}-${name}${variant}.json`,
      serialized: `${stableStringify(payload, 2)}\n`
    };
  });
}

export function buildHandoffMessage(envelope, nonce, sourceOrigin) {
  return {
    type: HANDOFF_TYPE,
    version: HANDOFF_VERSION,
    kind: 'payload',
    nonce,
    sourceOrigin,
    recovery: clone(envelope)
  };
}
