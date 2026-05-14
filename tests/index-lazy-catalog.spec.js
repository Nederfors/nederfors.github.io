import { expect, test } from '@playwright/test';

const CHAR_ID = 'lazy-index-char';

const metaState = {
  current: CHAR_ID,
  characters: [
    { id: CHAR_ID, name: 'Lazy Index Hero', folderId: 'fd-standard' }
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
  notes: {},
  money: { daler: 10, skilling: 0, 'örtegar': 0 }
};

async function seedProfileStore(page) {
  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });
}

function trackDataRequests(page) {
  const urls = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/data/')) {
      urls.push(url.replace(/^.*\/data\//, 'data/'));
    }
  });
  return urls;
}

async function waitForIndex(page) {
  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#lista').waitFor({ state: 'visible' });
}

test('index initial load uses the lightweight catalog without all.json', async ({ page }) => {
  const requests = trackDataRequests(page);
  await waitForIndex(page);
  await page.waitForTimeout(200);

  const state = await page.evaluate(() => ({
    mode: window.__symbaroumDatabaseMode,
    cards: document.querySelectorAll('#lista li.entry-card').length,
    categories: document.querySelectorAll('#lista .cat-group').length
  }));

  expect(state.mode).toBe('catalog');
  expect(state.categories).toBeGreaterThan(10);
  expect(state.cards).toBeLessThanOrEqual(2);
  expect([...new Set(requests)]).toContain('data/index-catalog.json');
  expect([...new Set(requests)]).not.toContain('data/all.json');
});

test('opening an index category hydrates only that source chunk and renders one batch', async ({ page }) => {
  const requests = trackDataRequests(page);
  await waitForIndex(page);

  await page.locator('details[data-cat="Förmåga"] > summary').click();
  await page.waitForFunction(() => Boolean(document.querySelector('#lista li.entry-card[data-name="Akrobatik"]')));

  const state = await page.evaluate(() => ({
    mode: window.__symbaroumDatabaseMode,
    cards: document.querySelectorAll('#lista li.entry-card').length,
    hasAkrobatik: Boolean(document.querySelector('#lista li.entry-card[data-name="Akrobatik"] button[data-act="add"]'))
  }));

  expect(state.mode).toBe('partial');
  expect(state.cards).toBeLessThanOrEqual(55);
  expect(state.hasAkrobatik).toBe(true);
  expect([...new Set(requests)]).toEqual(expect.arrayContaining([
    'data/index-catalog.json',
    'data/formaga.json'
  ]));
  expect([...new Set(requests)]).not.toContain('data/all.json');
});

test('searching the catalog hydrates matching info without loading all.json', async ({ page }) => {
  const requests = trackDataRequests(page);
  await waitForIndex(page);

  await page.evaluate(() => {
    window.handleIndexSearchTerm?.('Akrobatik', { scroll: false });
  });
  await page.locator('#lista li.entry-card[data-name="Akrobatik"] button[data-info]').click();

  await expect(page.locator('#yrkePanel.open #yrkeTitle')).toHaveText('Akrobatik');

  expect([...new Set(requests)]).toEqual(expect.arrayContaining([
    'data/index-catalog.json',
    'data/formaga.json'
  ]));
  expect([...new Set(requests)]).not.toContain('data/all.json');
});

test('damage type tabs hydrate table data without loading all.json', async ({ page }) => {
  const requests = trackDataRequests(page);
  await waitForIndex(page);

  await page.evaluate(() => {
    window.handleIndexSearchTerm?.('Bärsärk', { scroll: false });
  });
  await page.locator('#lista li.entry-card[data-name="Bärsärk"] button[data-info]').click();
  await page.locator('#yrkePanel.open .info-tab[data-tab="skadetyp"]').click();

  await expect(page.locator('#yrkePanel.open [data-tab-panel="skadetyp"]')).toContainText('Skadetyper och penetrering');
  await expect(page.locator('#yrkePanel.open [data-tab-panel="skadetyp"]')).toContainText('Rustningar');
  await expect(page.locator('#yrkePanel.open [data-tab-panel="skadetyp"]')).toContainText('Skyddar');

  expect([...new Set(requests)]).toEqual(expect.arrayContaining([
    'data/index-catalog.json',
    'data/formaga.json',
    'data/tabeller.json'
  ]));
  expect([...new Set(requests)]).not.toContain('data/all.json');
});

test('hydrated index cards can still add entries without loading all.json', async ({ page }) => {
  await seedProfileStore(page);
  const requests = trackDataRequests(page);
  await waitForIndex(page);

  await page.locator('details[data-cat="Förmåga"] > summary').click();
  await page.locator('#lista li.entry-card[data-name="Akrobatik"] button[data-act="add"]').click();

  await expect.poll(async () => page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return window.storeHelper.getCurrentList(activeStore)
      .some((entry) => entry?.namn === 'Akrobatik');
  })).toBe(true);

  expect([...new Set(requests)]).not.toContain('data/all.json');
});
