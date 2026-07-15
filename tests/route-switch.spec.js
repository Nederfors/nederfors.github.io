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

test('trait controls apply each increment once after traits view initialization', async ({ page }) => {
  const metaState = {
    current: 'trait-increment-char',
    characters: [
      { id: 'trait-increment-char', name: 'Trait Increment Hero', folderId: 'fd-standard' }
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
      Vaksam: 14,
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

  await page.goto('/#/traits');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const trait = page.locator('.trait[data-key="Diskret"]');
  await expect(trait.locator('.trait-label')).toHaveText('Diskret: 5');
  await trait.locator('.trait-btn[data-d="1"]').click();
  await expect(trait.locator('.trait-label')).toHaveText('Diskret: 6');
  await trait.locator('.trait-btn[data-d="5"]').click();
  await expect(trait.locator('.trait-label')).toHaveText('Diskret: 11');
});

test('rule override dialog cancels or continues and is remembered for the character', async ({ page }) => {
  const metaState = {
    current: 'trait-override-char',
    characters: [
      { id: 'trait-override-char', name: 'Trait Override Hero', folderId: 'fd-standard' }
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
      Diskret: 15,
      Kvick: 14,
      Listig: 14,
      Stark: 10,
      Träffsäker: 10,
      Vaksam: 10,
      Viljestark: 10,
      Övertygande: 10
    },
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__ruleOverrideSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__ruleOverrideSeeded', '1');
  }, { metaState, characterState });

  await page.goto('/#/traits');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const kvick = page.locator('.trait[data-key="Kvick"]');
  await kvick.locator('.trait-btn[data-d="1"]').click();

  const dialog = page.locator('#daub-dialog-modal');
  const cancel = dialog.locator('[data-dialog-action="cancel"]');
  const proceed = dialog.locator('[data-dialog-action="ok"]');
  await expect(dialog).toBeVisible();
  await expect(cancel).toHaveText('Avbryt');
  await expect(proceed).toHaveText('Fortsätt');
  const cancelBox = await cancel.boundingBox();
  const proceedBox = await proceed.boundingBox();
  expect(cancelBox?.x).toBeLessThan(proceedBox?.x ?? 0);

  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(kvick.locator('.trait-label')).toHaveText('Kvick: 14');

  await kvick.locator('.trait-btn[data-d="1"]').click();
  await proceed.click();
  await expect(dialog).toBeHidden();
  await expect(kvick.locator('.trait-label')).toHaveText('Kvick: 15');
  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-rule-override' }));
  await expect.poll(() => page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return window.storeHelper.getRuleOverrides(activeStore);
  })).toContain('trait:multiple-base-values-15');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const listig = page.locator('.trait[data-key="Listig"]');
  await listig.locator('.trait-btn[data-d="1"]').click();
  await expect(listig.locator('.trait-label')).toHaveText('Listig: 15');
  await expect(dialog).toBeHidden();
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
