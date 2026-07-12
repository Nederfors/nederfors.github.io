import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

async function waitForServiceWorker(page) {
  await expect.poll(async () => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    const cacheKeys = await caches.keys();
    return Boolean(registration?.active)
      && Boolean(navigator.serviceWorker.controller)
      && cacheKeys.some((key) => key.endsWith('-core'));
  }), {
    timeout: 30000
  }).toBe(true);
}

async function waitForOfflineRules(page) {
  const expectedTotal = await page.evaluate(async () => {
    const response = await fetch('data/offline-manifest.json', { cache: 'no-store' });
    const manifest = await response.json();
    return manifest.resources.length;
  });
  await expect.poll(async () => page.evaluate(async () => {
    const status = await window.symbaroumOffline?.getStatus?.();
    return status?.status === 'ready' ? status?.rules?.total : null;
  }), {
    timeout: 45_000
  }).toBe(expectedTotal);
  return expectedTotal;
}

async function waitForRouteReady(page, route, selector) {
  const expectedHash = route.slice(route.indexOf('#'));
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe(expectedHash);
  await expect(page.locator(selector)).toBeAttached();
  await expect(page.locator('#view-root')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#boot-fallback')).toBeHidden();
}

async function documentCacheEntries(page) {
  return page.evaluate(async () => {
    const keys = (await caches.keys()).filter(cacheKey => cacheKey.endsWith('-documents-v3'));
    if (keys.length !== 1) return -1;
    return (await caches.open(keys[0])).keys().then(requests => requests.length);
  });
}

async function readCachedIndexShell(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheName = (await caches.keys()).find(key => key.endsWith('-core'));
    const cache = cacheName ? await caches.open(cacheName) : null;
    const response = cache
      ? await cache.match(new URL('index.html', registration.scope).href)
      : null;
    return response ? {
      contentType: response.headers.get('content-type') || '',
      prefix: (await response.clone().text()).slice(0, 80).toLowerCase()
    } : null;
  });
}

test('install manifest stays at the hosted app root on both entry pages', async ({ page }) => {
  const manifestUrls = [];
  for (const entryPath of ['/', '/webapp.html#android']) {
    await page.goto(entryPath);
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.json');
    manifestUrls.push(new URL(manifestHref, page.url()).href);
  }

  expect(new Set(manifestUrls).size).toBe(1);
  const manifestUrl = new URL(manifestUrls[0]);
  expect(manifestUrl.pathname).toBe('/manifest.json');

  const manifestResponse = await page.request.get(manifestUrl.href);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()['content-type']).toContain('application/json');
  const manifest = await manifestResponse.json();
  const startUrl = new URL(manifest.start_url, manifestUrl);
  const scopeUrl = new URL(manifest.scope, manifestUrl);
  expect(startUrl.origin).toBe(manifestUrl.origin);
  expect(startUrl.pathname).toBe('/');
  expect(scopeUrl.href).toBe(`${manifestUrl.origin}/`);

  const startResponse = await page.request.get(startUrl.href);
  expect(startResponse.ok()).toBe(true);
  expect(startResponse.headers()['content-type']).toContain('text/html');

  expect(manifest.icons).toHaveLength(2);
  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, manifestUrl);
    expect(iconUrl.origin).toBe(manifestUrl.origin);
    expect(iconUrl.pathname.startsWith('/icons/')).toBe(true);
    const iconResponse = await page.request.get(iconUrl.href);
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }
});

test('active worker reports the same build-specific identity used by its core cache', async ({ page }) => {
  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await waitForServiceWorker(page);

  const identity = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const version = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error('GET_VERSION timed out')), 5000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        resolve(event.data?.version || null);
      };
      registration.active.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
    return { version, cacheKeys: await caches.keys() };
  });

  expect(identity.version).toMatch(/-pwa-v30-(?!dev(?:-|$))[^/]+$/);
  expect(identity.cacheKeys).toContain(`${identity.version}-core`);
});

test('shell defaults to #/index and survives an offline reload after service worker activation', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/index');
  await waitForServiceWorker(page);
  await waitForOfflineRules(page);

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await expect(page.locator('#lista')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/index');

  await context.setOffline(false);
});

test('all rule views remain available after the rule cache is prepared', async ({ page, context }) => {
  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await waitForServiceWorker(page);
  const expectedRuleCount = await waitForOfflineRules(page);

  const ruleCache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const name = keys.find(key => key.includes('-rules-'));
    const cache = name ? await caches.open(name) : null;
    return cache ? (await cache.keys()).length : 0;
  });
  expect(ruleCache).toBe(expectedRuleCount);

  await context.setOffline(true);
  const offlineRoutes = [
    ['/#/character', '#valda'],
    ['/#/inventory', '#invList'],
    ['/#/notes', '#background'],
    ['/#/traits', '#traits']
  ];
  for (const [route, selector] of offlineRoutes) {
    await page.goto(route);
    await waitForRouteReady(page, route, selector);
  }

  await page.goto('/#/index');
  await waitForRouteReady(page, '/#/index', '#lista');
  await page.locator('details[data-cat="Förmåga"] > summary').click();
  await expect(page.locator('#lista li.entry-card[data-name="Akrobatik"]')).toBeVisible();
  await page.locator('#lista li.entry-card[data-name="Akrobatik"] button[data-info]').click();
  await expect(page.locator('#yrkePanel.open')).toBeVisible();
  await context.setOffline(false);
});

test('webapp installation page survives an offline reload after service worker activation', async ({ page, context }) => {
  await page.goto('/webapp.html#android');
  await expect(page.locator('#android')).toBeVisible();
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#android')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#android');

  await context.setOffline(false);
});

test('pdf cache stays empty until a pdf is opened', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await waitForServiceWorker(page);
  await waitForOfflineRules(page);

  const countPdfEntries = () => documentCacheEntries(page);

  await expect.poll(countPdfEntries).toBe(0);

  await page.evaluate(async () => {
    const response = await fetch('pdf/karta.pdf');
    if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);
    await response.arrayBuffer();
  });

  await expect.poll(countPdfEntries).toBe(1);

  const refresh = await page.evaluate(() => window.requestPwaUpdate({ forceReload: true }));
  expect(refresh.cacheRefresh?.status).toBe('refreshed');
  await expect.poll(countPdfEntries).toBe(1);
  await expect.poll(async () => page.evaluate(async () => {
    const status = await window.symbaroumOffline.getStatus();
    return status.status === 'ready' ? status.rules?.total : null;
  })).toBe(await page.evaluate(async () => (
    await fetch('data/offline-manifest.json', { cache: 'no-store' }).then(response => response.json())
  ).resources.length));

  await page.evaluate(() => window.symbaroumOffline.clearDocuments());
  await expect.poll(countPdfEntries).toBe(0);
});

test('a real PDF window cannot replace the cached application shell', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'The headless PDF viewer is Chromium-specific.');

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await waitForServiceWorker(page);
  await page.evaluate(() => window.symbaroumOffline.clearDocuments());
  await expect.poll(() => documentCacheEntries(page)).toBe(0);

  const shellBefore = await readCachedIndexShell(page);
  expect(shellBefore?.contentType).toContain('text/html');
  expect(shellBefore?.prefix).toContain('<!doctype html');

  const pdfUrl = await page.evaluate(() => new URL('pdf/karta.pdf', location.href).href);
  const responsePromise = context.waitForEvent('response', {
    predicate: response => response.url() === pdfUrl && response.request().isNavigationRequest(),
    timeout: 30_000
  });
  const popupPromise = context.waitForEvent('page', { timeout: 30_000 });
  await page.evaluate(url => window.open(url, '_blank', 'noopener'), pdfUrl);
  const [popup, pdfResponse] = await Promise.all([popupPromise, responsePromise]);

  expect([200, 206]).toContain(pdfResponse.status());
  expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
  await popup.close();
  await expect.poll(() => documentCacheEntries(page)).toBe(1);

  const shellAfter = await readCachedIndexShell(page);
  expect(shellAfter?.contentType).toContain('text/html');
  expect(shellAfter?.prefix).toContain('<!doctype html');
  expect(shellAfter?.prefix).not.toContain('%pdf');
});

test('PDF byte ranges are valid online and remain readable offline', async ({ page, context }) => {
  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await waitForServiceWorker(page);
  await page.evaluate(() => window.symbaroumOffline.clearDocuments());
  await expect.poll(() => documentCacheEntries(page)).toBe(0);

  const pdfUrl = `pdf/karta.pdf?range-test=${Date.now()}`;
  const requestRange = (range) => page.evaluate(async ({ url, value }) => {
    const response = await fetch(url, { headers: { Range: value } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      contentRange: response.headers.get('content-range'),
      acceptRanges: response.headers.get('accept-ranges'),
      length: bytes.byteLength,
      prefix: String.fromCharCode(...bytes.slice(0, 5))
    };
  }, { url: pdfUrl, value: range });

  const online = await requestRange('bytes=0-99');
  expect(online).toMatchObject({
    status: 206,
    acceptRanges: 'bytes',
    length: 100,
    prefix: '%PDF-'
  });
  expect(online.contentRange).toMatch(/^bytes 0-99\/\d+$/);
  await expect.poll(() => documentCacheEntries(page)).toBe(1);

  await context.setOffline(true);
  try {
    const offline = await requestRange('bytes=100-199');
    expect(offline).toMatchObject({
      status: 206,
      acceptRanges: 'bytes',
      length: 100
    });
    expect(offline.contentRange).toMatch(/^bytes 100-199\/\d+$/);

    const invalid = await requestRange('bytes=999999999-');
    expect(invalid.status).toBe(416);
    expect(invalid.length).toBe(0);
    expect(invalid.contentRange).toMatch(/^bytes \*\/\d+$/);
  } finally {
    await context.setOffline(false);
  }
});
