import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const ENTRY_ASSET = /\/assets\/index-[^/]+\.js(?:\?.*)?$/;

async function waitForBoot(page) {
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await expect(page.locator('#boot-fallback')).toBeHidden();
}

async function expectRecoverableLoadError(page, message) {
  const fallback = page.locator('#boot-fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute('role', 'alertdialog');
  await expect(fallback).toHaveAttribute('aria-modal', 'true');
  await expect(fallback.locator('#boot-message')).toContainText(message);
  const reload = fallback.getByRole('button', { name: 'Ladda om' });
  await expect(reload).toBeVisible();
  await expect(reload).toBeFocused();
  await expect(page.locator('#view-root')).toHaveAttribute('inert', '');
  await expect(page.locator('shared-toolbar')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab');
  await expect(reload).toBeFocused();
}

async function expectRecoveredView(page, role, selector) {
  await waitForBoot(page);
  await page.waitForFunction(expectedRole => (
    document.body.dataset.role === expectedRole
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
  ), role);
  await expect(page.locator(selector)).toBeVisible();
  await expect(page.locator('#view-root')).not.toHaveAttribute('inert', '');
  await expect(page.locator('shared-toolbar')).not.toHaveAttribute('inert', '');
}

test('the branded loading shell is visible immediately while bootstrap is pending', async ({ page }) => {
  let releaseEntry;
  const entryGate = new Promise(resolve => {
    releaseEntry = resolve;
  });

  await page.route(ENTRY_ASSET, async route => {
    await entryGate;
    await route.continue();
  });

  try {
    await page.goto('/#/index', { waitUntil: 'commit' });
    const fallback = page.locator('#boot-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute('role', 'status');
    await expect(fallback.locator('#boot-message')).toContainText('Laddar Symbapedia');
    await expect(fallback.locator('#boot-retry')).toBeHidden();
  } finally {
    releaseEntry();
  }

  await waitForBoot(page);
});

test('a stalled bootstrap becomes a recoverable alert after eight seconds', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('__acceleratedBootWatchdog') === '1') return;
    window.sessionStorage.setItem('__acceleratedBootWatchdog', '1');
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => (
      nativeSetTimeout(callback, Number(delay) === 8000 ? 50 : delay, ...args)
    );
  });

  const failEntry = route => route.abort('failed');
  await page.route(ENTRY_ASSET, failEntry);
  await page.goto('/#/index');

  await expectRecoverableLoadError(page, 'Symbapedia kunde inte starta');

  await page.unroute(ENTRY_ASSET, failEntry);
  await page.getByRole('button', { name: 'Ladda om' }).click();
  await waitForBoot(page);
});

test('a stalled stylesheet still errors after legacy boot completes', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => (
      nativeSetTimeout(callback, Number(delay) === 8000 ? 100 : delay, ...args)
    );
  });

  let releaseStyles;
  const stylesGate = new Promise(resolve => { releaseStyles = resolve; });
  await page.route(/\/assets\/app-styles-[^/]+\.css(?:\?.*)?$/, async route => {
    await stylesGate;
    await route.continue();
  });

  try {
    await page.goto('/#/index', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
    await expectRecoverableLoadError(page, 'Symbapedia kunde inte starta');
  } finally {
    releaseStyles();
  }
});

test('a rejected route module recovers after the visible Reload action', async ({ page }) => {
  await page.goto('/#/index');
  await waitForBoot(page);

  const inventoryAsset = /\/assets\/inventory-[^/]+\.js(?:\?.*)?$/;
  const rejectInventoryRoute = route => (
    route.fulfill({ status: 503, contentType: 'text/javascript', body: '' })
  );
  await page.route(inventoryAsset, rejectInventoryRoute);
  await page.evaluate(() => {
    window.location.hash = '#/inventory';
  });

  await expectRecoverableLoadError(page, 'Den valda vyn kunde inte laddas');
  await page.unroute(inventoryAsset, rejectInventoryRoute);
  await page.getByRole('button', { name: 'Ladda om' }).click();
  await expectRecoveredView(page, 'inventory', '#invList');
});

test('rejected lazy catalog data recovers after the visible Reload action', async ({ page }) => {
  await page.goto('/#/index');
  await waitForBoot(page);

  const dataPattern = '**/data/*.json';
  const rejectCatalogData = route => (
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' })
  );
  await page.route(dataPattern, rejectCatalogData);
  await page.evaluate(() => {
    window.location.hash = '#/traits';
  });

  await expectRecoverableLoadError(page, 'Vyns data kunde inte laddas');
  await page.unroute(dataPattern, rejectCatalogData);
  await page.getByRole('button', { name: 'Ladda om' }).click();
  await expectRecoveredView(page, 'traits', '#traitsTabPanel');
});
