import { expect, test } from '@playwright/test';

test('inventory and traits render after in-app route changes', async ({ page }) => {
  const metaState = {
    current: 'route-char',
    characters: [
      { id: 'route-char', name: 'Route Hero', folderId: 'fd-standard' }
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
    list: [],
    inventory: [],
    custom: [],
    traits: {
      Diskret: 5,
      Kvick: 7,
      Listig: 9,
      Stark: 11,
      Träffsäker: 13,
      Vaksam: 15,
      Viljestark: 10,
      Övertygande: 8
    },
    notes: { background: 'Route test' },
    money: { daler: 3, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__routeSwitchSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__routeSwitchSeeded', '1');
  }, { metaState, characterState });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  await page.evaluate(() => {
    window.location.hash = '#/inventory';
  });
  await page.waitForFunction(() => document.body.dataset.role === 'inventory');
  // Dashboard content now lives in the toolbar shadow DOM; verify inventory view loaded
  await expect(page.locator('.inventory-panel')).toBeVisible();
  await expect(page.locator('#charName')).toContainText('Route Hero');

  await page.evaluate(() => {
    window.location.hash = '#/traits';
  });
  await page.waitForFunction(() => document.body.dataset.role === 'traits');
  await expect.poll(async () => (
    page.locator('#traits .trait').count()
  )).toBe(8);
  await expect(page.locator('#charName')).toContainText('Route Hero');
});

test('trait count opens index with only-selected and trait filters', async ({ page }) => {
  const metaState = {
    current: 'trait-filter-char',
    characters: [
      { id: 'trait-filter-char', name: 'Trait Filter Hero', folderId: 'fd-standard' }
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
    list: [],
    inventory: [],
    custom: [],
    traits: {
      Diskret: 5,
      Kvick: 7,
      Listig: 9,
      Stark: 11,
      Träffsäker: 13,
      Vaksam: 15,
      Viljestark: 10,
      Övertygande: 8
    },
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = window.lookupEntry?.({ name: 'Alkemist' });
    if (!entry) throw new Error('Missing Listig test entry.');
    window.storeHelper.setCurrentList(activeStore, [{ ...JSON.parse(JSON.stringify(entry)), nivå: 'Novis' }]);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-trait-filter' });
  });

  await page.evaluate(() => {
    window.location.hash = '#/traits';
  });
  await page.waitForFunction(() => document.body.dataset.role === 'traits');
  await expect(page.locator('.trait[data-key="Listig"] .trait-count')).toContainText('Förmågor: 1');

  await page.locator('.trait[data-key="Listig"] .trait-count').click();
  await page.waitForFunction(() => document.body.dataset.role === 'index');
  await expect(page.locator('#activeFilters')).toContainText('Endast valda');
  await expect(page.locator('#activeFilters')).toContainText('Karaktärsdrag: Listig');
});
