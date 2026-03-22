import Dexie from './vendor/dexie.mjs';

const DB_NAME = 'symbapedia-app';
const DB_VERSION = 2;
const STORE_META_KEY = 'storeMeta';
const MIGRATION_KEY = 'migration:localStorage:v1';
const LEGACY_STORAGE_KEY = 'rpall';
const LEGACY_META_KEY = 'rpall-meta';
const LEGACY_CHAR_PREFIX = 'rpall-char-';
const ENTRY_SORT_DEFAULT = 'alpha-asc';
const WRITE_DEBOUNCE_MS = 150;
const CHARACTER_FIELDS_STORE = 'characterFields';
const MUTATION_FLOW_CONTEXT_KEYS = ['remove-item', 'add-item'];

const UI_PREF_EXACT_KEYS = new Set([
  'indexViewState',
  'filterToolsOpen',
  'filterSettingsOpen',
  'invToolsOpen',
  'invInfoOpen',
  'symbapediaDriveFolder',
  'symbapediaDriveScope'
]);

const UI_PREF_PREFIXES = [
  'charViewState:',
  'notesViewState:',
  'invCatState:'
];

class SymbaroumDexie extends Dexie {
  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      characters: '&id, sortOrder, folderId',
      characterState: '&id',
      folders: '&id, order, system',
      uiPrefs: '&key',
      cachedEntries: '&key, updatedAt'
    });
    this.version(DB_VERSION).stores({
      characters: '&id, sortOrder, folderId',
      characterState: '&id',
      characterFields: '&key, charId, field',
      folders: '&id, order, system',
      uiPrefs: '&key',
      cachedEntries: '&key, updatedAt'
    }).upgrade(async (tx) => {
      const characterFields = tx.table(CHARACTER_FIELDS_STORE);
      const characterState = tx.table('characterState');
      const existingFieldCount = await characterFields.count();
      if (!existingFieldCount) {
        const legacyStates = await characterState.toArray();
        const migratedRows = [];
        (Array.isArray(legacyStates) ? legacyStates : []).forEach((record) => {
          if (!record?.id) return;
          migratedRows.push(...getCharacterFieldRows({ [record.id]: record.state }, new Set([record.id])));
        });
        if (migratedRows.length) {
          await characterFields.bulkPut(migratedRows);
        }
      }
      await characterState.clear();
    });
  }
}

const db = typeof indexedDB !== 'undefined' ? new SymbaroumDexie() : null;

const state = {
  ready: false,
  mode: 'legacy-localstorage',
  storeSnapshot: null,
  uiPrefs: new Map(),
  flushHandlersBound: false,
  writeQueue: {
    meta: null,
    characterReplacements: new Map(),
    characterFieldPatches: new Map(),
    timerId: 0,
    flushPromise: null
  }
};

let initPromise = null;

function markActiveMutationCheckpoint(name, detail = {}) {
  try {
    const perf = window.symbaroumPerf;
    const scenarioId = MUTATION_FLOW_CONTEXT_KEYS
      .map((key) => perf?.getFlowContext?.(key))
      .find(Boolean);
    if (!scenarioId) return;
    perf.markScenario?.(scenarioId, name, detail);
  } catch {}
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function emptyStoreSnapshot() {
  return {
    current: '',
    characters: [],
    data: {},
    folders: [],
    activeFolder: 'ALL',
    filterUnion: false,
    compactEntries: true,
    onlySelected: false,
    recentSearches: [],
    liveMode: false,
    entrySort: ENTRY_SORT_DEFAULT
  };
}

function normalizeStoreMeta(meta = {}) {
  return {
    current: typeof meta.current === 'string' ? meta.current : '',
    activeFolder: typeof meta.activeFolder === 'string' && meta.activeFolder ? meta.activeFolder : 'ALL',
    filterUnion: Boolean(meta.filterUnion),
    compactEntries: Object.prototype.hasOwnProperty.call(meta || {}, 'compactEntries')
      ? Boolean(meta.compactEntries)
      : true,
    onlySelected: Boolean(meta.onlySelected),
    recentSearches: Array.isArray(meta.recentSearches) ? cloneValue(meta.recentSearches) : [],
    liveMode: Boolean(meta.liveMode),
    entrySort: typeof meta.entrySort === 'string' && meta.entrySort ? meta.entrySort : ENTRY_SORT_DEFAULT
  };
}

function extractMeta(snapshot = {}) {
  return normalizeStoreMeta({
    current: snapshot.current,
    activeFolder: snapshot.activeFolder,
    filterUnion: snapshot.filterUnion,
    compactEntries: snapshot.compactEntries,
    onlySelected: snapshot.onlySelected,
    recentSearches: snapshot.recentSearches,
    liveMode: snapshot.liveMode,
    entrySort: snapshot.entrySort
  });
}

function buildStoreSnapshot(snapshot = {}) {
  const metaSource = snapshot?.meta && typeof snapshot.meta === 'object'
    ? { ...snapshot, ...snapshot.meta }
    : snapshot;
  return {
    ...emptyStoreSnapshot(),
    ...normalizeStoreMeta(metaSource),
    characters: cloneValue(snapshot?.characters) || [],
    folders: cloneValue(snapshot?.folders) || [],
    data: cloneValue(snapshot?.data) || {}
  };
}

function buildQueuedSnapshotBase() {
  const snapshot = state.storeSnapshot || emptyStoreSnapshot();
  return {
    ...emptyStoreSnapshot(),
    ...normalizeStoreMeta(snapshot),
    characters: Array.isArray(snapshot?.characters) ? snapshot.characters.slice() : [],
    folders: Array.isArray(snapshot?.folders) ? snapshot.folders.slice() : [],
    data: snapshot?.data && typeof snapshot.data === 'object'
      ? { ...snapshot.data }
      : {}
  };
}

function getCharacterFieldKey(charId, field) {
  return `${String(charId || '').trim()}:${String(field || '').trim()}`;
}

function getCharacterRows(characters = []) {
  return (Array.isArray(characters) ? characters : [])
    .filter((char) => char && char.id)
    .map((char, index) => ({
      ...cloneValue(char),
      sortOrder: index
    }));
}

function getFolderRows(folders = []) {
  return (Array.isArray(folders) ? folders : [])
    .filter((folder) => folder && folder.id)
    .map((folder, index) => ({
      ...cloneValue(folder),
      order: Number.isFinite(Number(folder.order)) ? Number(folder.order) : index
    }));
}

function getCharacterStateRows(data = {}, allowedIds = null) {
  return Object.entries(data && typeof data === 'object' ? data : {})
    .filter(([id, value]) => id && value && (!allowedIds || allowedIds.has(id)))
    .map(([id, value]) => ({
      id,
      state: cloneValue(value)
    }));
}

function getCharacterFieldRows(data = {}, allowedIds = null) {
  return Object.entries(data && typeof data === 'object' ? data : {})
    .filter(([id, value]) => id && value && typeof value === 'object' && (!allowedIds || allowedIds.has(id)))
    .flatMap(([id, value]) => (
      Object.entries(value)
        .filter(([field, fieldValue]) => field && fieldValue !== undefined)
        .map(([field, fieldValue]) => ({
          key: getCharacterFieldKey(id, field),
          charId: id,
          field,
          value: cloneValue(fieldValue)
        }))
    ));
}

function composeCharacterData(fieldRows = [], allowedIds = null, fallbackStates = []) {
  const data = {};
  const charIdsWithFieldRows = new Set();

  (Array.isArray(fieldRows) ? fieldRows : []).forEach((record) => {
    const charId = String(record?.charId || '').trim();
    const field = String(record?.field || '').trim();
    if (!charId || !field) return;
    if (allowedIds && !allowedIds.has(charId)) return;
    if (!data[charId] || typeof data[charId] !== 'object') {
      data[charId] = {};
    }
    data[charId][field] = cloneValue(record.value);
    charIdsWithFieldRows.add(charId);
  });

  (Array.isArray(fallbackStates) ? fallbackStates : []).forEach((record) => {
    const charId = String(record?.id || '').trim();
    if (!charId || charIdsWithFieldRows.has(charId)) return;
    if (allowedIds && !allowedIds.has(charId)) return;
    data[charId] = cloneValue(record.state) || {};
  });

  return data;
}

function getUiPrefRows(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.key === 'string')
    .map((entry) => ({
      key: entry.key,
      value: typeof entry.value === 'string' ? entry.value : String(entry.value ?? '')
    }));
}

function shouldMigrateUiPrefKey(key) {
  if (!key) return false;
  if (UI_PREF_EXACT_KEYS.has(key)) return true;
  return UI_PREF_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function loadLegacyUiPrefEntries() {
  const results = [];
  try {
    if (!window.localStorage) return results;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!shouldMigrateUiPrefKey(key)) continue;
      const value = window.localStorage.getItem(key);
      if (typeof value === 'string') {
        results.push({ key, value });
      }
    }
  } catch {}
  return results;
}

function hasLegacyStorageData() {
  try {
    if (!window.localStorage) return false;
    return Boolean(
      window.localStorage.getItem(LEGACY_META_KEY)
      || window.localStorage.getItem(LEGACY_STORAGE_KEY)
    );
  } catch {
    return false;
  }
}

function loadLegacyStoreSnapshotFallback() {
  try {
    if (!window.localStorage) return emptyStoreSnapshot();

    const metaRaw = window.localStorage.getItem(LEGACY_META_KEY);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) || {};
      const snapshot = buildStoreSnapshot({
        ...meta,
        data: {}
      });
      const characters = Array.isArray(snapshot.characters) ? snapshot.characters : [];
      characters.forEach((char) => {
        if (!char?.id) return;
        try {
          const charRaw = window.localStorage.getItem(`${LEGACY_CHAR_PREFIX}${char.id}`);
          snapshot.data[char.id] = charRaw ? JSON.parse(charRaw) || {} : {};
        } catch {
          snapshot.data[char.id] = {};
        }
      });
      return snapshot;
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      return buildStoreSnapshot(JSON.parse(legacyRaw) || {});
    }
  } catch {}

  return emptyStoreSnapshot();
}

function syncUiPrefCache(rows = []) {
  const cache = new Map();
  getUiPrefRows(rows).forEach((entry) => {
    cache.set(entry.key, entry.value);
  });
  state.uiPrefs = cache;
}

function clearScheduledFlush() {
  if (!state.writeQueue.timerId) return;
  window.clearTimeout(state.writeQueue.timerId);
  state.writeQueue.timerId = 0;
}

function hasPendingWrites() {
  return Boolean(state.writeQueue.meta)
    || state.writeQueue.characterReplacements.size > 0
    || state.writeQueue.characterFieldPatches.size > 0;
}

function scheduleFlush(delay = WRITE_DEBOUNCE_MS) {
  if (state.mode !== 'dexie' || !db) return;
  clearScheduledFlush();
  state.writeQueue.timerId = window.setTimeout(() => {
    state.writeQueue.timerId = 0;
    flushPendingWrites({ reason: 'debounce' }).catch((error) => {
      console.error('Failed to flush debounced writes', error);
    });
  }, Math.max(0, Number(delay) || 0));
  markActiveMutationCheckpoint('dexie-flush-scheduled', {
    delayMs: Math.max(0, Number(delay) || 0)
  });
}

function registerFlushHandlers() {
  if (state.flushHandlersBound || typeof window === 'undefined') return;
  state.flushHandlersBound = true;

  const triggerFlush = (reason) => {
    flushPendingWrites({ reason }).catch((error) => {
      console.error(`Failed to flush pending writes on ${reason}`, error);
    });
  };

  window.addEventListener('pagehide', () => triggerFlush('pagehide'));
  window.addEventListener('beforeunload', () => triggerFlush('beforeunload'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      triggerFlush('visibilitychange');
    }
  });
}

async function hydrateFromDexie() {
  const [metaRecord, characterRows, folderRows, characterFieldRows, legacyCharacterStates, uiPrefRows] = await Promise.all([
    db.uiPrefs.get(STORE_META_KEY),
    db.characters.orderBy('sortOrder').toArray(),
    db.folders.orderBy('order').toArray(),
    db.characterFields.toArray(),
    db.characterState.toArray(),
    db.uiPrefs.toArray()
  ]);

  const meta = normalizeStoreMeta(metaRecord?.value || {});
  const characters = (Array.isArray(characterRows) ? characterRows : [])
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .map(({ sortOrder, ...char }) => cloneValue(char));
  const folders = (Array.isArray(folderRows) ? folderRows : [])
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((folder) => cloneValue(folder));
  const allowedIds = new Set(characters.map((char) => char.id));
  const data = composeCharacterData(characterFieldRows, allowedIds, legacyCharacterStates);

  state.storeSnapshot = buildStoreSnapshot({ meta, characters, folders, data });
  syncUiPrefCache((Array.isArray(uiPrefRows) ? uiPrefRows : []).filter((record) => (
    record?.key && record.key !== STORE_META_KEY && record.key !== MIGRATION_KEY
  )));
  state.mode = 'dexie';
  state.ready = true;
}

async function writeStoreSnapshot(snapshot, options = {}) {
  const includeMigrationMarker = Boolean(options.includeMigrationMarker);
  const uiPrefRows = getUiPrefRows(options.uiPrefs || []);
  const storeSnapshot = buildStoreSnapshot(snapshot);
  const meta = extractMeta(storeSnapshot);
  const characters = getCharacterRows(storeSnapshot.characters);
  const folders = getFolderRows(storeSnapshot.folders);
  const characterIds = new Set(characters.map((char) => char.id));
  const characterFields = getCharacterFieldRows(storeSnapshot.data, characterIds);

  await db.transaction('rw', db.characters, db.characterFields, db.characterState, db.folders, db.uiPrefs, async () => {
    await db.characters.clear();
    if (characters.length) await db.characters.bulkPut(characters);

    await db.folders.clear();
    if (folders.length) await db.folders.bulkPut(folders);

    await db.characterFields.clear();
    if (characterFields.length) await db.characterFields.bulkPut(characterFields);
    await db.characterState.clear();

    await db.uiPrefs.put({ key: STORE_META_KEY, value: meta });
    if (includeMigrationMarker) {
      await db.uiPrefs.put({ key: MIGRATION_KEY, value: '1' });
    }
    if (uiPrefRows.length) {
      await db.uiPrefs.bulkPut(uiPrefRows);
    }
  });

  state.storeSnapshot = storeSnapshot;
  if (uiPrefRows.length || includeMigrationMarker) {
    await hydrateFromDexie();
  }
}

function queueMetaWrite(payload = {}) {
  const meta = normalizeStoreMeta(payload.meta || {});
  const characters = cloneValue(payload.characters || []);
  const folders = cloneValue(payload.folders || []);
  const snapshot = buildQueuedSnapshotBase();
  snapshot.current = meta.current;
  snapshot.activeFolder = meta.activeFolder;
  snapshot.filterUnion = meta.filterUnion;
  snapshot.compactEntries = meta.compactEntries;
  snapshot.onlySelected = meta.onlySelected;
  snapshot.recentSearches = cloneValue(meta.recentSearches) || [];
  snapshot.liveMode = meta.liveMode;
  snapshot.entrySort = meta.entrySort;
  snapshot.characters = characters;
  snapshot.folders = folders;
  state.storeSnapshot = snapshot;
  state.writeQueue.meta = { meta, characters, folders };
  scheduleFlush();
}

function queueCharacterWrite(charId, payload) {
  if (!charId) return;
  const snapshot = buildQueuedSnapshotBase();
  if (payload === null || payload === undefined) {
    delete snapshot.data[charId];
    state.writeQueue.characterReplacements.set(charId, null);
    state.writeQueue.characterFieldPatches.delete(charId);
  } else {
    const nextValue = cloneValue(payload);
    snapshot.data[charId] = nextValue;
    state.writeQueue.characterReplacements.set(charId, nextValue);
    state.writeQueue.characterFieldPatches.delete(charId);
  }
  state.storeSnapshot = snapshot;
  scheduleFlush();
}

function queueCharacterFieldWrite(charId, patch = {}) {
  if (!charId || !patch || typeof patch !== 'object') return;
  const entries = Object.entries(patch)
    .map(([field, value]) => [String(field || '').trim(), value])
    .filter(([field]) => field);
  if (!entries.length) return;

  const snapshot = buildQueuedSnapshotBase();
  const nextCharacter = snapshot.data?.[charId] && typeof snapshot.data[charId] === 'object'
    ? cloneValue(snapshot.data[charId]) || {}
    : {};

  entries.forEach(([field, value]) => {
    if (value === undefined) {
      delete nextCharacter[field];
      return;
    }
    nextCharacter[field] = cloneValue(value);
  });
  snapshot.data[charId] = nextCharacter;
  state.storeSnapshot = snapshot;

  if (state.writeQueue.characterReplacements.has(charId)) {
    const replacement = state.writeQueue.characterReplacements.get(charId);
    if (replacement && typeof replacement === 'object') {
      const nextReplacement = cloneValue(replacement) || {};
      entries.forEach(([field, value]) => {
        if (value === undefined) {
          delete nextReplacement[field];
          return;
        }
        nextReplacement[field] = cloneValue(value);
      });
      state.writeQueue.characterReplacements.set(charId, nextReplacement);
    }
    scheduleFlush();
    return;
  }

  const patchMap = state.writeQueue.characterFieldPatches.get(charId) || new Map();
  entries.forEach(([field, value]) => {
    patchMap.set(field, value === undefined
      ? { delete: true }
      : { value: cloneValue(value) });
  });
  state.writeQueue.characterFieldPatches.set(charId, patchMap);
  scheduleFlush();
}

function takePendingWrites() {
  clearScheduledFlush();
  const batch = {
    meta: state.writeQueue.meta
      ? {
          meta: state.writeQueue.meta.meta,
          characters: state.writeQueue.meta.characters,
          folders: state.writeQueue.meta.folders
        }
      : null,
    characterReplacements: new Map(state.writeQueue.characterReplacements),
    characterFieldPatches: new Map(
      Array.from(state.writeQueue.characterFieldPatches.entries()).map(([charId, patchMap]) => [
        charId,
        new Map(
          Array.from(patchMap.entries()).map(([field, operation]) => [
            field,
            operation?.delete ? { delete: true } : { value: cloneValue(operation?.value) }
          ])
        )
      ])
    )
  };
  state.writeQueue.meta = null;
  state.writeQueue.characterReplacements.clear();
  state.writeQueue.characterFieldPatches.clear();
  return batch;
}

async function deleteCharacterFieldRows(charIds = []) {
  const ids = [...new Set((Array.isArray(charIds) ? charIds : []).filter(Boolean))];
  if (!ids.length) return;
  if (ids.length === 1) {
    await db.characterFields.where('charId').equals(ids[0]).delete();
    return;
  }
  await db.characterFields.where('charId').anyOf(ids).delete();
}

function buildCharacterFieldRowsForPayload(charId, payload) {
  if (!charId || !payload || typeof payload !== 'object') return [];
  return Object.entries(payload)
    .filter(([field, value]) => field && value !== undefined)
    .map(([field, value]) => ({
      key: getCharacterFieldKey(charId, field),
      charId,
      field,
      value: cloneValue(value)
    }));
}

async function commitPendingWrites(batch) {
  const metaPayload = batch?.meta || null;
  const characterReplacements = Array.from(batch?.characterReplacements?.entries?.() || []);
  const characterFieldPatches = new Map(batch?.characterFieldPatches || []);
  if (!metaPayload && !characterReplacements.length && !characterFieldPatches.size) return;

  const replacementDeletes = characterReplacements
    .filter(([, value]) => value === null || value === undefined)
    .map(([id]) => id);
  const replacementPuts = characterReplacements
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([id, value]) => ({
      charId: id,
      rows: buildCharacterFieldRowsForPayload(id, value)
    }));

  const patchDeleteKeys = [];
  const patchPutRows = [];
  characterFieldPatches.forEach((patchMap, charId) => {
    if (!charId || !(patchMap instanceof Map)) return;
    patchMap.forEach((operation, field) => {
      const normalizedField = String(field || '').trim();
      if (!normalizedField) return;
      if (operation?.delete) {
        patchDeleteKeys.push(getCharacterFieldKey(charId, normalizedField));
        return;
      }
      patchPutRows.push({
        key: getCharacterFieldKey(charId, normalizedField),
        charId,
        field: normalizedField,
        value: cloneValue(operation?.value)
      });
    });
  });

  const applyCharacterWrites = async (allowedIds = null) => {
    const deleteSet = new Set(replacementDeletes);
    replacementPuts.forEach(({ charId }) => {
      if (!charId) return;
      if (allowedIds && !allowedIds.has(charId)) return;
      deleteSet.add(charId);
    });
    if (deleteSet.size) {
      await deleteCharacterFieldRows([...deleteSet]);
    }
    if (patchDeleteKeys.length) {
      await db.characterFields.bulkDelete(patchDeleteKeys);
    }
    if (replacementPuts.length) {
      const rows = replacementPuts
        .filter(({ charId }) => !allowedIds || allowedIds.has(charId))
        .flatMap(({ rows }) => rows);
      if (rows.length) {
        await db.characterFields.bulkPut(rows);
      }
    }
    if (patchPutRows.length) {
      const rows = patchPutRows.filter((row) => !allowedIds || allowedIds.has(row.charId));
      if (rows.length) {
        await db.characterFields.bulkPut(rows);
      }
    }
  };

  if (!metaPayload) {
    await db.transaction('rw', db.characterFields, async () => {
      await applyCharacterWrites();
    });
    return;
  }

  const meta = normalizeStoreMeta(metaPayload.meta || {});
  const characters = getCharacterRows(metaPayload.characters || []);
  const folders = getFolderRows(metaPayload.folders || []);
  const characterIds = new Set(characters.map((char) => char.id));

  await db.transaction('rw', db.characters, db.characterFields, db.characterState, db.folders, db.uiPrefs, async () => {
    await db.characters.clear();
    if (characters.length) await db.characters.bulkPut(characters);

    await db.folders.clear();
    if (folders.length) await db.folders.bulkPut(folders);

    const existingFieldRows = await db.characterFields.toArray();
    const removedIds = [...new Set(
      existingFieldRows
        .map((record) => String(record?.charId || '').trim())
        .filter((id) => id && !characterIds.has(id))
    )];
    if (removedIds.length) {
      await deleteCharacterFieldRows(removedIds);
    }

    await applyCharacterWrites(characterIds);
    await db.characterState.clear();
    await db.uiPrefs.put({ key: STORE_META_KEY, value: meta });
  });
}

async function runMigrationIfNeeded() {
  const [metaRecord, migrationRecord, characterCount, fieldCount, stateCount] = await Promise.all([
    db.uiPrefs.get(STORE_META_KEY),
    db.uiPrefs.get(MIGRATION_KEY),
    db.characters.count(),
    db.characterFields.count(),
    db.characterState.count()
  ]);

  const hasDexieData = Boolean(metaRecord) || characterCount > 0 || fieldCount > 0 || stateCount > 0;
  const legacyDataAvailable = hasLegacyStorageData();
  if (hasDexieData) return;
  if (migrationRecord && !legacyDataAvailable) return;

  const legacyLoader = window.storeHelper?.loadLegacyStorage;
  const legacySnapshot = typeof legacyLoader === 'function'
    ? legacyLoader({ persistChanges: false })
    : loadLegacyStoreSnapshotFallback();
  const uiPrefs = loadLegacyUiPrefEntries();

  if (!legacyDataAvailable && !uiPrefs.length) {
    if (migrationRecord) {
      await db.uiPrefs.put({ key: MIGRATION_KEY, value: '1' });
    }
    return;
  }

  await writeStoreSnapshot(legacySnapshot, {
    includeMigrationMarker: true,
    uiPrefs
  });
}

async function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!db) {
      state.ready = true;
      state.mode = 'legacy-localstorage';
      return state;
    }

    try {
      await db.open();
      await runMigrationIfNeeded();
      await hydrateFromDexie();
      registerFlushHandlers();
    } catch (error) {
      console.error('Failed to initialize Dexie persistence', error);
      state.ready = true;
      state.mode = 'legacy-localstorage';
      state.storeSnapshot = null;
      state.uiPrefs = new Map();
    }

    return state;
  })();

  return initPromise;
}

async function saveMeta(payload = {}) {
  if (state.mode !== 'dexie' || !db) return;
  queueMetaWrite(payload);
}

async function saveCharacter(charId, payload) {
  if (state.mode !== 'dexie' || !db || !charId) return;
  queueCharacterWrite(charId, payload);
}

async function saveCharacterFields(charId, patch = {}) {
  if (state.mode !== 'dexie' || !db || !charId) return;
  queueCharacterFieldWrite(charId, patch);
}

async function flushPendingWrites() {
  if (state.mode !== 'dexie' || !db) return;

  if (state.writeQueue.flushPromise) {
    await state.writeQueue.flushPromise;
    if (!hasPendingWrites()) return;
  } else if (!hasPendingWrites()) {
    return;
  }

  const promise = (async () => {
    while (hasPendingWrites()) {
      const batch = takePendingWrites();
      await commitPendingWrites(batch);
    }
  })();

  state.writeQueue.flushPromise = promise;
  try {
    await promise;
  } finally {
    if (state.writeQueue.flushPromise === promise) {
      state.writeQueue.flushPromise = null;
    }
  }
}

function getStoreSnapshot() {
  if (state.mode !== 'dexie') return null;
  return cloneValue(state.storeSnapshot);
}

function getUiPref(key) {
  if (!key) return null;
  if (state.mode === 'dexie') {
    return state.uiPrefs.has(key) ? state.uiPrefs.get(key) : null;
  }
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setUiPref(key, value) {
  if (!key) return;
  const storedValue = value === null || value === undefined ? null : String(value);

  if (state.mode === 'dexie' && db) {
    if (storedValue === null) {
      state.uiPrefs.delete(key);
      db.uiPrefs.delete(key).catch((error) => {
        console.error(`Failed to remove UI preference "${key}"`, error);
      });
      return;
    }

    state.uiPrefs.set(key, storedValue);
    db.uiPrefs.put({ key, value: storedValue }).catch((error) => {
      console.error(`Failed to save UI preference "${key}"`, error);
    });
    return;
  }

  try {
    if (storedValue === null) {
      window.localStorage?.removeItem(key);
      return;
    }
    window.localStorage?.setItem(key, storedValue);
  } catch {}
}

function removeUiPref(key) {
  setUiPref(key, null);
}

const persistenceApi = {
  get mode() {
    return state.mode;
  },
  get ready() {
    return state.ready;
  },
  init,
  saveMeta,
  saveCharacter,
  saveCharacterFields,
  flushPendingWrites,
  getStoreSnapshot,
  getUiPref
};

const uiPrefApi = {
  getItem(key) {
    return getUiPref(key);
  },
  setItem(key, value) {
    setUiPref(key, value);
  },
  removeItem(key) {
    removeUiPref(key);
  }
};

window.symbaroumPersistence = persistenceApi;
window.symbaroumUiPrefs = uiPrefApi;

export default persistenceApi;
