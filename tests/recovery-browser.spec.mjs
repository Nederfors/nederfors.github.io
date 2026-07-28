import { expect, test } from '@playwright/test';

const DB_NAME = 'symbapedia-app';

async function deleteDatabase(page) {
  await page.evaluate(async name => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('delete blocked'));
    });
  }, DB_NAME);
}

async function seedDatabase(page, version) {
  await deleteDatabase(page);
  await page.evaluate(async ({ name, version }) => {
    const requestResult = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transactionResult = transaction => new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const openRequest = indexedDB.open(name, version);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      const characters = database.createObjectStore('characters', { keyPath: 'id' });
      characters.createIndex('sortOrder', 'sortOrder');
      characters.createIndex('folderId', 'folderId');
      database.createObjectStore('characterState', { keyPath: 'id' });
      if (version >= 20) {
        const fields = database.createObjectStore('characterFields', { keyPath: 'key' });
        fields.createIndex('charId', 'charId');
        fields.createIndex('field', 'field');
      }
      const folders = database.createObjectStore('folders', { keyPath: 'id' });
      folders.createIndex('order', 'order');
      folders.createIndex('system', 'system');
      database.createObjectStore('uiPrefs', { keyPath: 'key' });
      const cache = database.createObjectStore('cachedEntries', { keyPath: 'key' });
      cache.createIndex('updatedAt', 'updatedAt');
      if (version >= 30) {
        const provenance = database.createObjectStore('hostedCharacterProvenance', { keyPath: ['accountId', 'characterId'] });
        provenance.createIndex('accountId', 'accountId');
      }
    };
    const database = await requestResult(openRequest);
    const stores = Array.from(database.objectStoreNames);
    const transaction = database.transaction(stores, 'readwrite');
    transaction.objectStore('characters').put({ id: 'idb-one', name: 'IDB One', sortOrder: 0, folderId: 'folder-one' });
    transaction.objectStore('characters').put({ id: 'idb-two', name: 'IDB Two', sortOrder: 1, folderId: 'folder-two' });
    transaction.objectStore('characterState').put({
      id: 'idb-one',
      state: { notes: { background: 'v1 base' }, money: { daler: 4 }, list: [{ id: 'keep-me' }] }
    });
    transaction.objectStore('characterState').put({ id: 'idb-two', state: { notes: { background: 'second' } } });
    transaction.objectStore('folders').put({ id: 'folder-one', name: 'First folder', order: 0, system: false });
    transaction.objectStore('folders').put({ id: 'folder-two', name: 'Second folder', order: 1, system: false });
    transaction.objectStore('uiPrefs').put({ key: 'indexViewState', value: 'preference-marker' });
    transaction.objectStore('cachedEntries').put({ key: 'catalog-row', updatedAt: 123, value: { privateCatalogMarker: 'must-not-export' } });
    if (version >= 20) {
      transaction.objectStore('characterFields').put({
        key: 'idb-one:notes',
        charId: 'idb-one',
        field: 'notes',
        value: { background: 'v2 overlay' }
      });
    }
    if (version >= 30) {
      transaction.objectStore('hostedCharacterProvenance').put({
        accountId: 'account-one',
        characterId: 'idb-one',
        kind: 'revision',
        revision: 'hosted-r1'
      });
    }
    await transactionResult(transaction);
    database.close();
  }, { name: DB_NAME, version });
}

async function browserStorageSnapshot(page) {
  return page.evaluate(async name => {
    const local = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      local[key] = localStorage.getItem(key);
    }
    const databases = (await indexedDB.databases())
      .map(item => ({ name: item.name, version: item.version }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
    const known = databases.find(item => item.name === name);
    if (!known) return { local, databases, database: null };
    const requestResult = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transactionResult = transaction => new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const database = await requestResult(indexedDB.open(name));
    const storeNames = Array.from(database.objectStoreNames);
    const transaction = database.transaction(storeNames, 'readonly');
    const transactionDone = transactionResult(transaction);
    const stores = {};
    await Promise.all(storeNames.map(async storeName => {
      stores[storeName] = await requestResult(transaction.objectStore(storeName).getAll());
    }));
    await transactionDone;
    const snapshot = { version: database.version, storeNames, stores };
    database.close();
    return { local, databases, database: snapshot };
  }, DB_NAME);
}

test('combined, split, and approved user JSON are recovered together without localStorage mutation', async ({ page }) => {
  await page.goto('/recovery/');
  await page.evaluate(() => {
    const folder = { id: 'local-folder', name: 'Local folder', order: 0 };
    localStorage.setItem('unrelated-key', 'leave-me-alone');
    localStorage.setItem('rpall', JSON.stringify({
      characters: [
        { id: 'duplicate', name: 'Duplicate', folderId: folder.id },
        { id: 'conflict', name: 'Combined conflict', folderId: folder.id }
      ],
      folders: [folder],
      data: {
        duplicate: { notes: { background: 'same' } },
        conflict: { notes: { background: 'combined' } }
      }
    }));
    localStorage.setItem('rpall-meta', JSON.stringify({
      characters: [
        { id: 'duplicate', name: 'Duplicate', folderId: folder.id },
        { id: 'conflict', name: 'Split conflict', folderId: folder.id }
      ],
      folders: [folder]
    }));
    localStorage.setItem('rpall-char-duplicate', JSON.stringify({ notes: { background: 'same' } }));
    localStorage.setItem('rpall-char-conflict', JSON.stringify({ notes: { background: 'split' } }));
    localStorage.setItem('rpall-char-orphan', JSON.stringify({ notes: { background: 'orphan survives' } }));
  });
  await page.locator('#json-files').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      folders: [{ id: 'json-folder', name: 'JSON folder', characters: [{
        format: 'symbapedia-character', formatVersion: 1, name: 'JSON Hero', data: { money: { daler: 7 } }
      }] }]
    }))
  });
  const before = await browserStorageSnapshot(page);
  await page.locator('#scan-button').click();
  await expect(page.locator('#status')).toContainText('Scan complete');
  const envelope = await page.evaluate(() => window.symbapediaRecovery.getEnvelope());
  const after = await browserStorageSnapshot(page);

  expect(after).toEqual(before);
  expect(envelope.characters.filter(row => row.sourceId === 'duplicate')).toHaveLength(1);
  expect(envelope.characters.filter(row => row.sourceId === 'conflict')).toHaveLength(2);
  expect(envelope.characters.some(row => row.sourceId === 'orphan')).toBe(true);
  expect(envelope.characters.some(row => row.name === 'JSON Hero')).toBe(true);
  expect(envelope.anomalies.some(row => row.code === 'same-source-id-conflict')).toBe(true);
  expect(envelope.anomalies.some(row => row.code === 'orphan-character-state')).toBe(true);
  expect(envelope.sourceInventory.some(row => row.generation === 'combined-rpall' && row.detected)).toBe(true);
  expect(envelope.sourceInventory.some(row => row.generation === 'split-rpall' && row.detected)).toBe(true);
});

for (const version of [10, 20, 30]) {
  test(`native IndexedDB version ${version} is reconstructed with exact before/after schema and content`, async ({ page }) => {
    await page.goto('/recovery/');
    await seedDatabase(page, version);
    const before = await browserStorageSnapshot(page);

    await page.locator('#scan-button').click();
    await expect(page.locator('#status')).toContainText('Scan complete');
    const envelope = await page.evaluate(() => window.symbapediaRecovery.getEnvelope());
    const after = await browserStorageSnapshot(page);

    expect(after).toEqual(before);
    expect(after.database.version).toBe(version);
    expect(envelope.characters).toHaveLength(2);
    expect(envelope.folders.map(row => row.name).sort()).toEqual(['First folder', 'Second folder']);
    const first = envelope.characters.find(row => row.sourceId === 'idb-one');
    if (version >= 20) {
      expect(first.data.notes.background).toBe('v2 overlay');
      expect(first.data.money.daler).toBe(4);
      expect(first.data.list).toEqual([{ id: 'keep-me' }]);
    } else {
      expect(first.data.notes.background).toBe('v1 base');
    }
    if (version === 30) {
      expect(envelope.hostedProvenanceArchive).toHaveLength(1);
      expect(envelope.hostedProvenanceArchive[0].recoveryProvenance).toBe(false);
    } else {
      expect(envelope.hostedProvenanceArchive).toHaveLength(0);
    }
    expect(JSON.stringify(envelope)).not.toContain('must-not-export');
    expect(envelope.sourceInventory.find(row => row.family === 'IndexedDB').stores.cachedEntries).toBe(1);
  });
}

test('safe existence discovery fails closed and never falls through to indexedDB.open', async ({ page }) => {
  await page.goto('/recovery/');
  await page.evaluate(() => {
    Object.defineProperty(indexedDB, 'databases', { configurable: true, value: undefined });
    window.__openCalls = 0;
    const original = indexedDB.open.bind(indexedDB);
    Object.defineProperty(indexedDB, 'open', {
      configurable: true,
      value: (...args) => {
        window.__openCalls += 1;
        return original(...args);
      }
    });
  });
  await page.locator('#scan-button').click();
  const result = await page.evaluate(() => ({
    envelope: window.symbapediaRecovery.getEnvelope(),
    openCalls: window.__openCalls
  }));
  expect(result.openCalls).toBe(0);
  expect(result.envelope.anomalies.some(row => row.code === 'indexeddb-safe-discovery-unsupported')).toBe(true);
});

test('a database disappearing after discovery is not recreated by the probe', async ({ page }) => {
  await page.goto('/recovery/');
  await deleteDatabase(page);
  await page.evaluate(name => {
    window.__realDatabases = indexedDB.databases.bind(indexedDB);
    let firstCall = true;
    Object.defineProperty(indexedDB, 'databases', {
      configurable: true,
      value: async () => {
        if (firstCall) {
          firstCall = false;
          return [{ name, version: 10 }];
        }
        return window.__realDatabases();
      }
    });
  }, DB_NAME);
  await page.locator('#scan-button').click();
  await expect(page.locator('#status')).toContainText('Scan complete');
  const result = await page.evaluate(async name => ({
    databases: await window.__realDatabases(),
    envelope: window.symbapediaRecovery.getEnvelope(),
    name
  }), DB_NAME);
  expect(result.databases.some(item => item.name === DB_NAME)).toBe(false);
  expect(result.envelope.anomalies.some(row => row.code === 'indexeddb-read-failed')).toBe(true);
  expect(result.envelope.sourceInventory.some(row => row.creationAborted === true)).toBe(true);
});

test('backup gates transfer, backup failure is recoverable, and disconnected transfer preserves the backup', async ({ page }) => {
  await page.goto('/recovery/');
  await page.locator('#scan-button').click();
  await expect(page.locator('#status')).toContainText('Scan complete');
  await expect(page.locator('#transfer-section')).toBeHidden();

  await page.evaluate(() => {
    window.__originalCreateObjectUrl = URL.createObjectURL;
    URL.createObjectURL = () => { throw new Error('forced-backup-failure'); };
  });
  await page.locator('#download-button').click();
  await expect(page.locator('#status')).toContainText('forced-backup-failure');
  await expect(page.locator('#transfer-section')).toBeHidden();
  expect(await page.evaluate(() => window.symbapediaRecovery.getState().backupAvailable)).toBe(false);

  await page.evaluate(() => { URL.createObjectURL = window.__originalCreateObjectUrl; });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('symbapedia-recovery-v1.json');
  await expect(page.locator('#transfer-section')).toBeVisible();
  await page.locator('#transfer-button').click();
  await expect(page.locator('#status')).toContainText('No compatible Symbapedia recovery request');
  expect(await page.evaluate(() => window.symbapediaRecovery.getState().backupAvailable)).toBe(true);
});

test('canonical postMessage handoff is sent only after backup download', async ({ page }) => {
  await page.goto('http://127.0.0.1:4178/recovery/');
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => {
    window.__handoffMessages = [];
    window.addEventListener('message', event => {
      const message = event.data;
      if (message?.type !== 'symbapedia-recovery-transfer' || message.nonce !== 'browser-nonce') return;
      window.__handoffMessages.push(message);
      if (message.kind === 'ready') {
        event.source.postMessage({
          type: 'symbapedia-recovery-transfer',
          version: 1,
          kind: 'request',
          nonce: 'browser-nonce'
        }, event.origin);
      }
    });
    window.open(
      'http://localhost:4178/recovery/?symbapedia-recovery-transfer=source&transfer-nonce=browser-nonce&destination-origin=http%3A%2F%2F127.0.0.1%3A4178',
      'recovery-test'
    );
  });
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect.poll(() => page.evaluate(() => window.__handoffMessages.some(message => message.kind === 'ready'))).toBe(true);
  await popup.locator('#scan-button').click();
  await expect(popup.locator('#status')).toContainText('Scan complete');
  await expect.poll(() => popup.evaluate(() => window.symbapediaRecovery.getState().transferRequested)).toBe(true);
  await expect(popup.locator('#transfer-section')).toBeHidden();
  const downloadPromise = popup.waitForEvent('download');
  await popup.locator('#download-button').click();
  await downloadPromise;
  await popup.locator('#transfer-button').click();

  await expect.poll(() => page.evaluate(() => window.__handoffMessages.some(message => message.kind === 'payload'))).toBe(true);
  const payload = await page.evaluate(() => window.__handoffMessages.find(message => message.kind === 'payload'));
  expect(payload.version).toBe(1);
  expect(payload.sourceOrigin).toBe('http://localhost:4178');
  expect(payload.recovery.recoveryFormat).toBe('symbapedia-recovery');
  expect(payload.recovery.formatVersion).toBe(1);
});

test('the recovery page loads only its standalone assets and registers no service worker', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/recovery/');
  await expect(page.locator('h1')).toContainText('Recover legacy Symbapedia characters');
  const registrations = await page.evaluate(async () => navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0);
  expect(registrations).toBe(0);
  expect([...new Set(requests)].sort()).toEqual([
    '/recovery/',
    '/recovery/app.js',
    '/recovery/recovery-core.js',
    '/recovery/styles.css'
  ]);
});
