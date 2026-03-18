import { expect, test } from '@playwright/test';

async function readCharacterState(page, charId) {
  return page.evaluate(async (id) => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('symbapedia-app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('characterState', 'readonly');
      const store = tx.objectStore('characterState');
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
    db.close();
    return record?.state || null;
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
});
