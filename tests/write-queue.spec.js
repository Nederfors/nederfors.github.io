import { expect, test } from '@playwright/test';

async function readCharacterState(page, charId) {
  return page.evaluate(async (id) => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('symbapedia-app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const db = await openDb();
    const tx = db.transaction(['characterFields', 'characterState'], 'readonly');
    const fieldsStore = tx.objectStore('characterFields');
    const fieldRows = await new Promise((resolve, reject) => {
      const request = fieldsStore.index('charId').getAll(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
    if (Array.isArray(fieldRows) && fieldRows.length) {
      db.close();
      return fieldRows.reduce((acc, row) => {
        if (!row?.field) return acc;
        acc[row.field] = row.value;
        return acc;
      }, {});
    }
    const legacyStore = tx.objectStore('characterState');
    const record = await new Promise((resolve, reject) => {
      const request = legacyStore.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
    db.close();
    return record?.state || null;
  }, charId);
}

async function readCharacterFieldRows(page, charId) {
  return page.evaluate(async (id) => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('symbapedia-app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('characterFields', 'readonly');
      const store = tx.objectStore('characterFields');
      const request = store.index('charId').getAll(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
    db.close();
    return rows;
  }, charId);
}

async function readStoreMeta(page) {
  return page.evaluate(async () => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('symbapedia-app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('uiPrefs', 'readonly');
      const store = tx.objectStore('uiPrefs');
      const request = store.get('storeMeta');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
    db.close();
    return record?.value || null;
  });
}

test('debounces writes and flushes on explicit boundaries', async ({ page }) => {
  const metaState = {
    current: 'queue-char-a',
    characters: [
      { id: 'queue-char-a', name: 'Queue Alpha', folderId: 'fd-standard' },
      { id: 'queue-char-b', name: 'Queue Beta', folderId: 'fd-standard' }
    ],
    folders: [
      { id: 'fd-standard', name: 'Standard', order: 0, system: true }
    ],
    activeFolder: 'ALL',
    filterUnion: false,
    compactEntries: true,
    onlySelected: false,
    recentSearches: [],
    liveMode: false,
    entrySort: 'alpha-asc'
  };

  const baseCharacter = (background) => ({
    list: [],
    inventory: [],
    custom: [],
    notes: { background },
    money: { daler: 1, skilling: 0, 'örtegar': 0 }
  });

  await page.addInitScript(({ metaState, baseCharacter }) => {
    if (sessionStorage.getItem('__phase4Seeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem('rpall-char-queue-char-a', JSON.stringify(baseCharacter('Original A')));
    localStorage.setItem('rpall-char-queue-char-b', JSON.stringify(baseCharacter('Original B')));
    sessionStorage.setItem('__phase4Seeded', '1');
  }, { metaState, baseCharacter });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const baselineRecord = await readCharacterState(page, 'queue-char-a');
  const baselineBackground = baselineRecord?.notes?.background || '';

  await page.evaluate(() => {
    const store = window.storeHelper.load();
    window.storeHelper.setNotes(store, { ...window.storeHelper.getNotes(store), background: 'Debounced write' });
  });

  const immediateRecord = await readCharacterState(page, 'queue-char-a');
  expect(immediateRecord?.notes?.background || '').toBe(baselineBackground);

  await expect.poll(async () => (
    (await readCharacterState(page, 'queue-char-a'))?.notes?.background || ''
  )).toBe('Debounced write');

  await page.evaluate(() => {
    const store = window.storeHelper.load();
    window.storeHelper.setNotes(store, { ...window.storeHelper.getNotes(store), background: 'Switch flush' });
  });
  await page.locator('shared-toolbar').locator('#charSelect').selectOption('queue-char-b');
  await expect.poll(async () => (
    (await readCharacterState(page, 'queue-char-a'))?.notes?.background || ''
  )).toBe('Switch flush');
  await expect.poll(async () => (
    (await readStoreMeta(page))?.current || ''
  )).toBe('queue-char-b');

  await page.evaluate(async () => {
    const store = window.storeHelper.load();
    store.current = 'queue-char-b';
    window.storeHelper.setNotes(store, { ...window.storeHelper.getNotes(store), background: 'Pagehide flush' });
    window.dispatchEvent(new Event('pagehide'));
  });
  await expect.poll(async () => (
    (await readCharacterState(page, 'queue-char-b'))?.notes?.background || ''
  )).toBe('Pagehide flush');

  await page.evaluate(async () => {
    const store = window.storeHelper.load();
    store.current = 'queue-char-b';
    window.storeHelper.setNotes(store, { ...window.storeHelper.getNotes(store), background: 'Explicit flush' });
    await window.symbaroumPersistence.flushPendingWrites();
  });
  await expect.poll(async () => (
    (await readCharacterState(page, 'queue-char-b'))?.notes?.background || ''
  )).toBe('Explicit flush');

  await page.evaluate(async () => {
    const store = window.storeHelper.load();
    store.current = 'queue-char-b';
    window.storeHelper.setMoney(store, {
      daler: 9,
      skilling: 1,
      'örtegar': 2
    });
    await window.symbaroumPersistence.flushPendingWrites();
  });
  await expect.poll(async () => (
    (await readCharacterState(page, 'queue-char-b'))?.money || null
  )).toEqual({
    daler: 9,
    skilling: 1,
    'örtegar': 2
  });
});

test('migrates legacy character snapshots into characterFields on startup', async ({ page }) => {
  const metaState = {
    current: 'migrate-char',
    characters: [
      { id: 'migrate-char', name: 'Migrate Hero', folderId: 'fd-standard' }
    ],
    folders: [
      { id: 'fd-standard', name: 'Standard', order: 0, system: true }
    ],
    activeFolder: 'ALL',
    filterUnion: false,
    compactEntries: true,
    onlySelected: false,
    recentSearches: [],
    liveMode: false,
    entrySort: 'alpha-asc'
  };
  const characterState = {
    list: [{ namn: 'Akrobatik', nivå: 'Novis', taggar: { typ: ['Förmåga'] } }],
    inventory: [],
    custom: [],
    revealedArtifacts: ['artifact-1'],
    notes: { background: 'Migrated note' },
    money: { daler: 2, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const rows = await readCharacterFieldRows(page, 'migrate-char');
  const fieldNames = rows.map((row) => row.field).sort();
  expect(fieldNames).toEqual(expect.arrayContaining(['list', 'notes', 'money', 'revealedArtifacts']));
  await expect.poll(async () => (
    (await readCharacterState(page, 'migrate-char'))?.notes?.background || ''
  )).toBe('Migrated note');
});

test('batched current-character mutations persist once and keep the final state', async ({ page }) => {
  const metaState = {
    current: 'batch-char',
    characters: [
      { id: 'batch-char', name: 'Batch Hero', folderId: 'fd-standard' }
    ],
    folders: [
      { id: 'fd-standard', name: 'Standard', order: 0, system: true }
    ],
    activeFolder: 'ALL',
    filterUnion: false,
    compactEntries: true,
    onlySelected: false,
    recentSearches: [],
    liveMode: false,
    entrySort: 'alpha-asc'
  };
  const characterState = {
    list: [{ id: 'artifact-1', namn: 'Akrobatik', nivå: 'Novis', taggar: { typ: ['Förmåga'] } }],
    inventory: [{ id: 'artifact-1', name: 'Akrobatik', qty: 1 }],
    custom: [],
    revealedArtifacts: ['artifact-1'],
    notes: { background: 'Before batch' },
    money: { daler: 1, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  await page.evaluate(async () => {
    const persistence = window.symbaroumPersistence;
    if (!persistence.__testWrapped) {
      const original = persistence.saveCharacterFields.bind(persistence);
      window.__saveCharacterFieldsCalls = 0;
      persistence.saveCharacterFields = (...args) => {
        window.__saveCharacterFieldsCalls += 1;
        return original(...args);
      };
      persistence.__testWrapped = true;
    }
    const store = window.storeHelper.load();
    window.storeHelper.batchCurrentCharacterMutation(store, {}, () => {
      window.storeHelper.setCurrentList(store, []);
      window.storeHelper.setInventory(store, []);
      window.storeHelper.removeRevealedArtifact(store, 'artifact-1');
      window.storeHelper.setNotes(store, { ...window.storeHelper.getNotes(store), background: 'After batch' });
    });
    await persistence.flushPendingWrites();
  });

  await expect.poll(async () => (
    await page.evaluate(() => window.__saveCharacterFieldsCalls || 0)
  )).toBe(1);
  await expect.poll(async () => (
    await readCharacterState(page, 'batch-char')
  )).toMatchObject({
    list: [],
    inventory: [],
    revealedArtifacts: [],
    notes: { background: 'After batch' }
  });
});
