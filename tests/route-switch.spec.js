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
  await expect.poll(async () => (
    page.locator('#invFormal details.db-accordion__item').count()
  )).toBeGreaterThan(0);
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
