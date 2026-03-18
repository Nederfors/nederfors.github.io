import { expect, test } from '@playwright/test';

test('migrates legacy localStorage data into Dexie and reloads from IndexedDB', async ({ page }) => {
  const metaState = {
    current: 'legacy-char',
    characters: [
      { id: 'legacy-char', name: 'Legacy Hero', folderId: 'fd-standard' }
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

  const legacyCharacter = {
    list: [],
    inventory: [],
    custom: [],
    notes: {
      background: 'Imported from localStorage'
    },
    money: { daler: 5, skilling: 0, 'örtegar': 0 }
  };

  const indexViewState = {
    filters: {
      search: ['Legacy Search'],
      typ: [],
      ark: [],
      test: []
    },
    cats: {
      Ras: true
    }
  };

  await page.addInitScript(({ metaState, legacyCharacter, indexViewState }) => {
    if (sessionStorage.getItem('__phase3Seeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(legacyCharacter));
    localStorage.setItem('indexViewState', JSON.stringify(indexViewState));
    sessionStorage.setItem('__phase3Seeded', '1');
  }, { metaState, legacyCharacter, indexViewState });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const firstSnapshot = await page.evaluate(() => ({
    mode: window.symbaroumPersistence?.mode || '',
    store: window.symbaroumPersistence?.getStoreSnapshot?.() || null,
    indexState: window.symbaroumUiPrefs?.getItem?.('indexViewState') || null
  }));

  expect(firstSnapshot.mode).toBe('dexie');
  expect(firstSnapshot.store?.current).toBe('legacy-char');
  expect(firstSnapshot.store?.characters?.[0]?.name).toBe('Legacy Hero');
  expect(firstSnapshot.store?.data?.['legacy-char']?.notes?.background).toBe('Imported from localStorage');
  expect(JSON.parse(firstSnapshot.indexState || '{}')?.filters?.search || []).toEqual(['Legacy Search']);

  await page.evaluate(() => {
    localStorage.clear();
  });

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const secondSnapshot = await page.evaluate(() => ({
    mode: window.symbaroumPersistence?.mode || '',
    store: window.symbaroumPersistence?.getStoreSnapshot?.() || null,
    indexState: window.symbaroumUiPrefs?.getItem?.('indexViewState') || null
  }));

  expect(secondSnapshot.mode).toBe('dexie');
  expect(secondSnapshot.store?.current).toBe('legacy-char');
  expect(secondSnapshot.store?.characters?.[0]?.name).toBe('Legacy Hero');
  expect(secondSnapshot.store?.data?.['legacy-char']?.notes?.background).toBe('Imported from localStorage');
  expect(JSON.parse(secondSnapshot.indexState || '{}')?.filters?.search || []).toEqual(['Legacy Search']);
});
