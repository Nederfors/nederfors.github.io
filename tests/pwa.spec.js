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

test('shell defaults to #/index and survives an offline reload after service worker activation', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/index');
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  await expect(page.locator('#lista')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#/index');

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

  const countPdfEntries = () => page.evaluate(async () => {
    const key = (await caches.keys()).find((cacheKey) => cacheKey.endsWith('-pdf'));
    if (!key) return 0;
    return (await caches.open(key)).keys().then((requests) => requests.length);
  });

  await expect.poll(countPdfEntries).toBe(0);

  await page.evaluate(async () => {
    const response = await fetch('pdf/karta.pdf');
    if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);
    await response.arrayBuffer();
  });

  await expect.poll(countPdfEntries).toBe(1);
});
