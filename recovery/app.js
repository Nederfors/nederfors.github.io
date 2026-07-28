import {
  DATABASE_NAME,
  HANDOFF_TYPE,
  HANDOFF_VERSION,
  buildHandoffMessage,
  buildRecoveryEnvelope,
  extractIndexedDb,
  extractLegacyJson,
  extractLocalStorage,
  serializeRecoveryEnvelope
} from './recovery-core.js';

const state = {
  envelope: null,
  serialized: '',
  backupAvailable: false,
  transfer: null
};

const byId = id => document.getElementById(id);
const scanButton = byId('scan-button');
const fileInput = byId('json-files');
const downloadButton = byId('download-button');
const transferSection = byId('transfer-section');
const transferButton = byId('transfer-button');
const status = byId('status');
const sourceList = byId('source-list');
const summary = byId('summary');
const anomalyList = byId('anomaly-list');

function setStatus(message, kind = 'info') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function errorExtraction(code, message, rawEvidence) {
  return {
    inventory: [],
    candidates: [],
    folders: [],
    hostedProvenance: [],
    anomalies: [{
      code,
      severity: 'error',
      source: { family: 'browser', generation: 'safe-scan' },
      message,
      evidence: rawEvidence
    }]
  };
}

function readSupportedLocalStorage() {
  const entries = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== 'rpall' && key !== 'rpall-meta' && !key?.startsWith('rpall-char-')) continue;
      const value = localStorage.getItem(key);
      if (typeof value === 'string') entries[key] = value;
    }
    return extractLocalStorage(entries);
  } catch (error) {
    const result = errorExtraction('localstorage-read-failed', 'Supported localStorage keys could not be read. Nothing was changed.', String(error?.message || error));
    result.inventory.push({ family: 'localStorage', generation: 'supported-keys', detected: null, readable: false });
    return result;
  }
}

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const transactionResult = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
});

async function discoverExistingDatabase() {
  if (!globalThis.indexedDB) {
    return { supported: false, reason: 'IndexedDB is unavailable in this browser.' };
  }
  if (typeof indexedDB.databases !== 'function') {
    return { supported: false, reason: 'This browser cannot safely discover database existence without risking creation.' };
  }
  const databases = await indexedDB.databases();
  const database = databases.find(item => item?.name === DATABASE_NAME);
  return database ? { supported: true, database } : { supported: true, database: null };
}

async function readExistingDatabase() {
  let discovery;
  try {
    discovery = await discoverExistingDatabase();
  } catch (error) {
    const result = errorExtraction('indexeddb-discovery-failed', 'IndexedDB existence/version discovery failed. The database was not opened.', String(error?.message || error));
    result.inventory.push({ family: 'IndexedDB', generation: 'symbapedia-app', detected: null, readable: false });
    return result;
  }
  if (!discovery.supported) {
    const result = errorExtraction('indexeddb-safe-discovery-unsupported', `${discovery.reason} IndexedDB recovery failed closed.`, discovery.reason);
    result.inventory.push({ family: 'IndexedDB', generation: 'symbapedia-app', detected: null, readable: false });
    return result;
  }
  if (!discovery.database) return extractIndexedDb(null);

  let upgradeAttempted = false;
  let database;
  try {
    const openRequest = indexedDB.open(DATABASE_NAME);
    openRequest.onupgradeneeded = () => {
      upgradeAttempted = true;
      openRequest.transaction?.abort();
    };
    database = await requestResult(openRequest);
    if (upgradeAttempted) {
      database?.close();
      throw new Error('The database disappeared during safe discovery; creation was aborted.');
    }
    if (Number(database.version) !== Number(discovery.database.version)) {
      database.close();
      throw new Error('The database version changed during extraction. Retry after closing other tabs.');
    }

    const supportedStores = [
      'characters',
      'characterState',
      'characterFields',
      'folders',
      'uiPrefs',
      'cachedEntries',
      'hostedCharacterProvenance'
    ].filter(name => database.objectStoreNames.contains(name));
    const transaction = database.transaction(supportedStores, 'readonly');
    const transactionDone = transactionResult(transaction);
    const stores = {};
    await Promise.all(supportedStores.map(async name => {
      if (name === 'cachedEntries' || name === 'uiPrefs') {
        stores[name] = { count: await requestResult(transaction.objectStore(name).count()) };
      } else {
        stores[name] = await requestResult(transaction.objectStore(name).getAll());
      }
    }));
    await transactionDone;

    // Catalog and preference contents are intentionally excluded; only their
    // row counts are retained in inventory evidence.
    return extractIndexedDb({ version: database.version, stores });
  } catch (error) {
    const result = errorExtraction('indexeddb-read-failed', 'The existing database could not be read safely. No upgrade or write was attempted.', String(error?.message || error));
    result.inventory.push({
      family: 'IndexedDB',
      generation: 'symbapedia-app',
      detected: true,
      readable: false,
      discoveredVersion: discovery.database?.version ?? null,
      creationAborted: upgradeAttempted
    });
    return result;
  } finally {
    database?.close();
  }
}

async function readJsonFiles() {
  const extractions = [];
  for (const file of fileInput.files ?? []) {
    try {
      extractions.push(extractLegacyJson(await file.text(), file.name));
    } catch (error) {
      extractions.push(errorExtraction('user-json-read-failed', `The selected file ${file.name} could not be read.`, String(error?.message || error)));
    }
  }
  return extractions;
}

function inventoryLabel(item) {
  const stateLabel = item.detected === false ? 'not detected' : item.readable === false ? 'detected, not safely readable' : 'detected';
  const version = item.databaseVersion ? ` (native version ${item.databaseVersion})` : '';
  return `${item.family} / ${item.generation}${version}: ${stateLabel}`;
}

function renderEnvelope(envelope) {
  sourceList.replaceChildren(...envelope.sourceInventory.map(item => {
    const row = document.createElement('li');
    row.textContent = inventoryLabel(item);
    return row;
  }));
  const distinctFolderIds = new Set(envelope.folders.map(folder => folder.sourceId));
  summary.textContent = `${envelope.characters.length} recoverable character variant(s), ${distinctFolderIds.size} folder(s), ${envelope.anomalies.length} anomaly/anomalies.`;
  anomalyList.replaceChildren(...envelope.anomalies.map(item => {
    const row = document.createElement('li');
    row.textContent = `${item.code}: ${item.message}`;
    return row;
  }));
  if (!envelope.anomalies.length) {
    const row = document.createElement('li');
    row.textContent = 'No anomalies detected.';
    anomalyList.append(row);
  }
}

async function scan() {
  scanButton.disabled = true;
  downloadButton.disabled = true;
  transferSection.hidden = true;
  state.backupAvailable = false;
  setStatus('Scanning supported storage with read-only APIs…');
  try {
    const extractions = [readSupportedLocalStorage(), await readExistingDatabase(), ...await readJsonFiles()];
    state.envelope = buildRecoveryEnvelope({ sourceOrigin: location.origin, extractions });
    state.serialized = serializeRecoveryEnvelope(state.envelope);
    renderEnvelope(state.envelope);
    downloadButton.disabled = false;
    setStatus('Scan complete. Download the canonical backup before transfer becomes available.', 'success');
    return state.envelope;
  } catch (error) {
    state.envelope = null;
    state.serialized = '';
    setStatus(`Recovery scan failed safely: ${String(error?.message || error)} Nothing in browser storage was changed.`, 'error');
    throw error;
  } finally {
    scanButton.disabled = false;
  }
}

function downloadBackup() {
  if (!state.envelope || !state.serialized) {
    setStatus('Scan storage before downloading a backup.', 'error');
    return false;
  }
  let url = '';
  try {
    const blob = new Blob([state.serialized], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'symbapedia-recovery-v1.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    state.backupAvailable = true;
    transferSection.hidden = false;
    setStatus('Canonical backup download started. Keep the file; transfer is now available.', 'success');
    return true;
  } catch (error) {
    state.backupAvailable = false;
    transferSection.hidden = true;
    setStatus(`Backup could not be created: ${String(error?.message || error)} The scan remains available so you can retry.`, 'error');
    return false;
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function allowedDestinationOrigin(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://symbapedia.se') return url.origin;
    if (['localhost', '127.0.0.1'].includes(location.hostname)
      && ['localhost', '127.0.0.1'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol)) return url.origin;
  } catch {}
  return '';
}

function transferMessage(kind, nonce, extra = {}) {
  return { type: HANDOFF_TYPE, version: HANDOFF_VERSION, kind, nonce, ...extra };
}

function initializeTransferSession() {
  const parameters = new URLSearchParams(location.search);
  if (parameters.get('symbapedia-recovery-transfer') !== 'source' || !window.opener) return null;
  const nonce = parameters.get('transfer-nonce') || '';
  const destinationOrigin = allowedDestinationOrigin(parameters.get('destination-origin') || 'https://symbapedia.se');
  if (!nonce || nonce.length > 200 || !destinationOrigin) return null;
  const session = { nonce, destinationOrigin, requested: false, opener: window.opener };
  window.addEventListener('message', event => {
    if (event.source !== session.opener || event.origin !== session.destinationOrigin) return;
    const message = event.data;
    if (message?.type !== HANDOFF_TYPE || message.version !== HANDOFF_VERSION || message.kind !== 'request' || message.nonce !== nonce) return;
    session.requested = true;
  });
  session.opener.postMessage(transferMessage('ready', nonce, { sourceOrigin: location.origin }), destinationOrigin);
  return session;
}

function transfer() {
  if (!state.backupAvailable || !state.envelope) {
    setStatus('Download the canonical backup before transfer.', 'error');
    return false;
  }
  const session = state.transfer;
  if (!session?.requested || session.opener?.closed) {
    setStatus('No compatible Symbapedia recovery request is connected. Your downloaded backup is safe; return to the destination and retry later.', 'error');
    return false;
  }
  try {
    session.opener.postMessage(buildHandoffMessage(state.envelope, session.nonce, location.origin), session.destinationOrigin);
    setStatus('Canonical recovery handoff sent. This page did not write destination storage.', 'success');
    return true;
  } catch (error) {
    setStatus(`Transfer handoff failed: ${String(error?.message || error)} Your downloaded backup remains usable.`, 'error');
    return false;
  }
}

scanButton.addEventListener('click', () => { scan().catch(() => {}); });
downloadButton.addEventListener('click', downloadBackup);
transferButton.addEventListener('click', transfer);
state.transfer = initializeTransferSession();

window.symbapediaRecovery = Object.freeze({
  scan,
  downloadBackup,
  transfer,
  getEnvelope: () => state.envelope,
  getState: () => ({ backupAvailable: state.backupAvailable, transferRequested: Boolean(state.transfer?.requested) })
});
