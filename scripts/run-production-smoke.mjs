import { chromium } from '@playwright/test';

const productionUrl = new URL(process.env.PRODUCTION_URL || 'https://nederfors.github.io/');
const expectedDeploymentRevision = String(process.env.EXPECTED_DEPLOY_REVISION || '').trim();
const expectedRoutes = [
  { role: 'index', selector: '#lista' },
  { role: 'character', selector: '#valda' },
  { role: 'inventory', selector: '#invList' },
  { role: 'notes', selector: '#characterForm' },
  { role: 'traits', selector: '#traitsTabPanel' }
];
const pdfPath = 'pdf/karta.pdf';
const FETCH_TIMEOUT_MS = 15_000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForPublishedShell() {
  let lastError = null;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      const cacheBuster = `${Date.now()}-${attempt}`;
      if (expectedDeploymentRevision) {
        const revisionUrl = new URL(`deploy-revision.txt?deploy-smoke=${cacheBuster}`, productionUrl);
        const revisionResponse = await fetchWithTimeout(revisionUrl, {
          cache: 'no-store',
          redirect: 'follow'
        });
        const publishedRevision = revisionResponse.ok ? (await revisionResponse.text()).trim() : '';
        if (publishedRevision !== expectedDeploymentRevision) {
          throw new Error(
            `revision is ${publishedRevision || `HTTP ${revisionResponse.status}`}, expected ${expectedDeploymentRevision}`
          );
        }
      }

      const url = new URL(`index.html?deploy-smoke=${cacheBuster}`, productionUrl);
      const response = await fetchWithTimeout(url, { cache: 'no-store', redirect: 'follow' });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('text/html')) return;
      lastError = new Error(`shell returned ${response.status} ${contentType}`);
    } catch (error) {
      lastError = error;
    }
    await wait(10_000);
  }
  throw new Error(`Published revision and shell did not become ready: ${lastError?.message || 'unknown error'}`);
}

await waitForPublishedShell();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'allow' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

async function waitForRoute(role, selector) {
  await page.waitForFunction(({ expectedRole, expectedSelector }) => {
    const viewRoot = document.getElementById('view-root');
    const fallback = document.getElementById('boot-fallback');
    const fallbackStyle = fallback ? window.getComputedStyle(fallback) : null;
    const fallbackVisible = Boolean(
      fallback
      && !fallback.hidden
      && fallbackStyle?.display !== 'none'
      && fallbackStyle?.visibility !== 'hidden'
    );
    return Boolean(window.__symbaroumBootCompleted)
      && document.body.dataset.role === expectedRole
      && viewRoot?.getAttribute('aria-busy') === 'false'
      && Boolean(viewRoot?.querySelector(expectedSelector))
      && !fallbackVisible;
  }, { expectedRole: role, expectedSelector: selector }, { timeout: 20_000 });
}

async function verifyInstallManifest() {
  const contract = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || link.tagName !== 'LINK') throw new Error('Manifest link is missing.');
    const manifestUrl = new URL(link.href, location.href);
    const manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
    if (!manifestResponse.ok) {
      throw new Error(`Manifest returned HTTP ${manifestResponse.status}.`);
    }
    const manifest = await manifestResponse.json();
    const startUrl = new URL(manifest.start_url, manifestUrl);
    const scopeUrl = new URL(manifest.scope, manifestUrl);
    const startResponse = await fetch(startUrl, { cache: 'no-store' });
    const icons = await Promise.all((manifest.icons || []).map(async icon => {
      const url = new URL(icon.src, manifestUrl);
      const response = await fetch(url, { cache: 'no-store' });
      return {
        url: url.href,
        status: response.status,
        contentType: response.headers.get('content-type') || ''
      };
    }));
    return {
      manifestUrl: manifestUrl.href,
      startUrl: startUrl.href,
      scopeUrl: scopeUrl.href,
      startStatus: startResponse.status,
      startContentType: startResponse.headers.get('content-type') || '',
      icons
    };
  });

  const expectedManifestUrl = new URL('manifest.json', productionUrl).href;
  const expectedAppRoot = new URL('./', productionUrl).href;
  if (contract.manifestUrl !== expectedManifestUrl
      || contract.startUrl !== expectedAppRoot
      || contract.scopeUrl !== expectedAppRoot) {
    throw new Error(`Install manifest resolves outside the hosted app root: ${JSON.stringify(contract)}`);
  }
  if (contract.startStatus !== 200 || !contract.startContentType.includes('text/html')) {
    throw new Error(`Manifest start URL is not the application shell: ${JSON.stringify(contract)}`);
  }
  if (contract.icons.length !== 2
      || contract.icons.some(icon => icon.status !== 200 || !icon.contentType.includes('image/png'))) {
    throw new Error(`Manifest icons are unavailable: ${JSON.stringify(contract.icons)}`);
  }
}

try {
  for (const { role, selector } of expectedRoutes) {
    const target = new URL(`#/` + role, productionUrl).href;
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await waitForRoute(role, selector);
    const state = await page.evaluate((expectedSelector) => ({
      ready: document.documentElement.classList.contains('is-ready'),
      fallbackVisible: !document.getElementById('boot-fallback')?.hidden,
      role: document.body.dataset.role || '',
      busy: document.getElementById('view-root')?.getAttribute('aria-busy'),
      routeContent: Boolean(document.querySelector(`#view-root ${expectedSelector}`))
    }), selector);
    if (!state.ready || state.fallbackVisible || state.role !== role || state.busy !== 'false' || !state.routeContent) {
      throw new Error(`Route ${role} failed smoke state: ${JSON.stringify(state)}`);
    }
  }

  await page.goto(new URL('#/index', productionUrl).href, { waitUntil: 'domcontentloaded' });
  await waitForRoute('index', '#lista');
  await verifyInstallManifest();

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(navigator.serviceWorker.controller), null, {
    timeout: 20_000
  });

  const workerIdentity = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const version = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error('GET_VERSION timed out')), 5000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        resolve(event.data?.version || '');
      };
      registration.active?.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    });
    return { version, cacheKeys: await caches.keys() };
  });
  if (expectedDeploymentRevision && !workerIdentity.version.endsWith(`-${expectedDeploymentRevision}`)) {
    throw new Error(`Active worker ${workerIdentity.version || '(missing)'} does not match ${expectedDeploymentRevision}`);
  }
  if (!workerIdentity.cacheKeys.includes(`${workerIdentity.version}-core`)) {
    throw new Error(`Active worker core cache is missing: ${workerIdentity.version}-core`);
  }

  const rangeResult = await page.evaluate(async (path) => {
    const response = await fetch(path, { headers: { Range: 'bytes=0-31' } });
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      contentRange: response.headers.get('content-range') || '',
      byteLength: (await response.arrayBuffer()).byteLength
    };
  }, pdfPath);
  if (rangeResult.status !== 206
      || !rangeResult.contentType.includes('application/pdf')
      || rangeResult.byteLength !== 32) {
    throw new Error(`PDF Range smoke failed: ${JSON.stringify(rangeResult)}`);
  }
  if (!rangeResult.contentRange.startsWith('bytes 0-31/')) {
    throw new Error(`PDF Content-Range is invalid: ${rangeResult.contentRange}`);
  }

  const popupPromise = page.waitForEvent('popup');
  await page.evaluate((path) => window.open(path, '_blank'), pdfPath);
  const pdfPage = await popupPromise;
  await pdfPage.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {});
  if (!decodeURI(pdfPage.url()).endsWith('/pdf/karta.pdf')) {
    throw new Error(`PDF popup navigated to the wrong URL: ${pdfPage.url()}`);
  }
  await pdfPage.close();

  const shellCacheType = await page.evaluate(async () => {
    const candidates = ['index.html', './index.html', '/index.html'];
    for (const candidate of candidates) {
      const response = await caches.match(candidate);
      if (response) return response.headers.get('content-type') || '';
    }
    return '';
  });
  if (shellCacheType && !shellCacheType.includes('text/html')) {
    throw new Error(`Cached shell is not HTML after PDF use: ${shellCacheType}`);
  }

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForRoute('index', '#lista');
  const offlineState = await page.evaluate(() => ({
    controlled: Boolean(navigator.serviceWorker?.controller),
    online: navigator.onLine,
    role: document.body.dataset.role || '',
    busy: document.getElementById('view-root')?.getAttribute('aria-busy'),
    fallbackVisible: !document.getElementById('boot-fallback')?.hidden,
    routeContent: Boolean(document.querySelector('#view-root #lista'))
  }));
  if (!offlineState.controlled
      || offlineState.online
      || offlineState.role !== 'index'
      || offlineState.busy !== 'false'
      || offlineState.fallbackVisible
      || !offlineState.routeContent) {
    throw new Error(`Offline shell smoke failed: ${JSON.stringify(offlineState)}`);
  }
  await context.setOffline(false);

  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);

  console.log(`Production smoke passed for ${productionUrl.href}`);
} finally {
  await context.close();
  await browser.close();
}
