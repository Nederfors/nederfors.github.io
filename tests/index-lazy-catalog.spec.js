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

test('opening an index category hydrates its source chunk and renders every entry', async ({ page }) => {
  const requests = trackDataRequests(page);
  await waitForIndex(page);

  await page.locator('details[data-cat="Förmåga"] > summary').click();
  await page.waitForFunction(() => Boolean(document.querySelector('#lista li.entry-card[data-name="Akrobatik"]')));

  const state = await page.evaluate(() => ({
    mode: window.__symbaroumDatabaseMode,
    cards: document.querySelectorAll('#lista li.entry-card').length,
    categoryEntries: document.querySelectorAll('details[data-cat="Förmåga"] li.entry-card').length,
    hasAkrobatik: Boolean(document.querySelector('#lista li.entry-card[data-name="Akrobatik"] button[data-act="add"]')),
    hasLoadMore: Boolean(document.querySelector('button[data-load-more-cat="Förmåga"]'))
  }));

  expect(state.mode).toBe('partial');
  expect(state.categoryEntries).toBeGreaterThan(12);
  expect(state.hasAkrobatik).toBe(true);
  expect(state.hasLoadMore).toBe(false);
  expect([...new Set(requests)]).toEqual(expect.arrayContaining([
    'data/index-catalog.json',
    'data/formaga.json'
  ]));
  expect([...new Set(requests)]).not.toContain('data/all.json');
});

test('opening a category keeps its heading anchored in the viewport', async ({ page }, testInfo) => {
  await waitForIndex(page);

  const category = testInfo.project.name.startsWith('Mobile') ? 'Förmåga' : 'Diverse';
  const summary = page.locator(`details[data-cat="${category}"] > summary`);
  if (!testInfo.project.name.startsWith('Mobile')) {
    await summary.evaluate(element => {
      const absoluteTop = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, Math.max(0, absoluteTop - (window.innerHeight / 2)));
    });
  }
  await expect(summary).toBeInViewport();
  const before = await summary.evaluate(element => element.getBoundingClientRect().top);

  await summary.click();
  await page.waitForFunction(cat => (
    document.querySelectorAll(`details[data-cat="${cat}"] li.entry-card`).length > 12
  ), category);

  await expect.poll(() => page.locator(`details[data-cat="${category}"] > summary`)
    .evaluate((element, expected) => (
      Math.abs(element.getBoundingClientRect().top - expected)
    ), before)).toBeLessThan(8);
});

test('index category and scroll position survive navigation to another view', async ({ page }, testInfo) => {
  test.slow();
  const mobileProject = testInfo.project.name.startsWith('Mobile');
  await waitForIndex(page);

  const summary = page.locator('details[data-cat="Förmåga"] > summary');
  await summary.click();
  const card = page.locator('details[data-cat="Förmåga"] li.entry-card').nth(20);
  await card.waitFor({ state: 'visible' });
  await card.click();
  await page.evaluate(() => window.dispatchEvent(new window.WheelEvent('wheel')));
  await page.evaluate(() => window.scrollTo(0, 2400));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  const before = await page.evaluate(() => window.scrollY);

  if (mobileProject) {
    await page.evaluate(() => window.appRouter.navigateTo('character'));
  } else {
    await page.locator('shared-toolbar #characterLink').click();
  }
  await page.waitForFunction(() => document.body.dataset.role === 'character');
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem('symbaroumViewScrollPositions') || '{}');
    return Number(saved.index) || 0;
  })).toBe(before);
  if (mobileProject) {
    await page.evaluate(() => window.appRouter.navigateTo('index'));
  } else {
    await page.locator('shared-toolbar #indexLink').click();
  }
  await page.waitForFunction(() => (
    document.body.dataset.role === 'index'
      && document.querySelector('details[data-cat="Förmåga"]')?.open === true
      && document.querySelectorAll('details[data-cat="Förmåga"] li.entry-card').length > 12
  ));

  await expect.poll(() => page.evaluate(expected => (
    Math.abs(window.scrollY - expected)
  ), before)).toBeLessThan(48);
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
  const damageTab = page.locator('#yrkePanel.open .info-tab[data-tab="skadetyp"]');
  await damageTab.click();
  await expect(damageTab).toHaveClass(/active/);

  const damagePanel = page.locator('#yrkePanel.open .skadetyp-panel');
  await expect(damagePanel).toBeVisible();
  await expect(damagePanel).toContainText('Skadetyper och penetrering');
  await expect(damagePanel).toContainText('Rustningar');
  await expect(damagePanel).toContainText('Skyddar');

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
