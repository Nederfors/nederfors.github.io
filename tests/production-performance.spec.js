import { expect, test } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

test('production boot uses legacy bundles instead of the source-script waterfall', async ({ page }) => {
  const jsRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.js')) {
      jsRequests.push(url.pathname);
    }
  });

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));

  const legacyRequests = jsRequests.filter(item => item.startsWith('/js/'));
  expect(legacyRequests).toEqual(expect.arrayContaining([
    '/js/legacy/shared.js',
    '/js/legacy/index.js',
    '/js/legacy/post.js'
  ]));
  expect(legacyRequests).not.toContain('/js/main.js');
  expect(legacyRequests).not.toContain('/js/index-view.js');
  expect(legacyRequests.length).toBeLessThanOrEqual(4);
});

test('production dist excludes unused multi-megabyte texture assets', async () => {
  const forbidden = [
    'dist/icons/background.svg',
    'dist/icons/grain.svg',
    'dist/data/background.svg',
    'dist/icons/icon_DA',
    'dist/node_modules/daub-ui/daub.js'
  ];

  forbidden.forEach(relativePath => {
    expect(existsSync(path.join(ROOT, relativePath)), relativePath).toBe(false);
  });

  const icon192 = path.join(ROOT, 'dist/icons/icon-192.png');
  const icon512 = path.join(ROOT, 'dist/icons/icon-512.png');
  expect(existsSync(icon192)).toBe(true);
  expect(existsSync(icon512)).toBe(true);
  expect(statSync(icon192).size).toBeLessThan(100 * 1024);
  expect(statSync(icon512).size).toBeLessThan(300 * 1024);
});
