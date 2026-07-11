import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
  expect(legacyRequests).not.toContain('/js/elite-add.js');
  expect(legacyRequests.length).toBeLessThanOrEqual(4);
});

test('rare elite flow is precached but deferred until invoked', async ({ page }) => {
  const swSource = readFileSync(path.join(ROOT, 'dist/sw.js'), 'utf8');
  expect(swSource).toContain('js/elite-add.js');

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
  expect(await page.evaluate(() => Boolean(window.eliteAdd))).toBe(false);

  await page.evaluate(() => window.ensureEliteAdd());
  expect(await page.evaluate(() => Boolean(window.eliteAdd?.handle))).toBe(true);
});

test('production dist excludes unused multi-megabyte texture assets', async () => {
  const forbidden = [
    'dist/icons/background.svg',
    'dist/icons/grain.svg',
    'dist/data/background.svg',
    'dist/icons/icon_DA',
    'dist/node_modules/daub-ui/daub.js',
    'dist/css/shadow.css'
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

  const toolbarCss = path.join(ROOT, 'dist/css/toolbar-shadow.css');
  expect(existsSync(toolbarCss)).toBe(true);
  expect(statSync(toolbarCss).size).toBeLessThan(25 * 1024);

  const indexBundle = path.join(ROOT, 'dist/js/legacy/index.js');
  expect(statSync(indexBundle).size).toBeLessThan(200 * 1024);

  const swSource = readFileSync(path.join(ROOT, 'dist/sw.js'), 'utf8');
  [
    'js/vendor/daub.js',
    'js/legacy/shared.js',
    'js/legacy/index.js',
    'js/legacy/post.js'
  ].forEach(url => {
    const revision = createHash('md5')
      .update(readFileSync(path.join(ROOT, 'dist', url)))
      .digest('hex');
    expect(swSource, `${url} must be revisioned from its final minified bytes`)
      .toContain(`{"revision":"${revision}","url":"${url}"}`);
  });
  const precacheUrls = [...swSource.matchAll(/url:"([^"]+)"/g)]
    .map(([, url]) => url)
    .filter(url => !url.startsWith('http'));
  const precacheBytes = precacheUrls.reduce((total, url) => (
    total + statSync(path.join(ROOT, 'dist', url)).size
  ), 0);
  expect(precacheBytes).toBeLessThan(3.6 * 1024 * 1024);
});

test('production dist ships a deterministic offline rule manifest', async () => {
  const manifestPath = path.join(ROOT, 'dist/data/offline-manifest.json');
  expect(existsSync(manifestPath)).toBe(true);
  const manifest = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(manifestPath, 'utf8')));

  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.resources.length).toBeGreaterThan(0);
  expect(manifest.resources).toEqual(expect.arrayContaining([
    expect.objectContaining({ url: 'data/formaga.json' }),
    expect.objectContaining({ url: 'data/tabeller.json' })
  ]));
  manifest.resources.forEach(resource => {
    const bytes = readFileSync(path.join(ROOT, 'dist', resource.url));
    expect(resource.bytes, resource.url).toBe(bytes.byteLength);
    expect(resource.revision, resource.url).toBe(`sha256-${createHash('sha256').update(bytes).digest('hex')}`);
  });
});
