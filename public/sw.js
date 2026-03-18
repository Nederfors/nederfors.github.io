const SW_VERSION = 'symbaroum-pwa-v24';
const CORE_CACHE = `${SW_VERSION}-core`;
const JSON_CACHE = `${SW_VERSION}-json`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const PDF_CACHE = `${SW_VERSION}-pdf`;
const IMAGE_CACHE = `${SW_VERSION}-image`;
const BUILD_PRECACHE_ENTRIES = self.__WB_MANIFEST || [];
const BUILD_PRECACHE_URLS = BUILD_PRECACHE_ENTRIES
  .map(entry => (typeof entry === 'string' ? entry : entry?.url))
  .filter(Boolean);
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const CORE_PRECACHE_URLS = [
  'index.html',
  'webapp.html',
  'manifest.json',
  'css/app-shell.css',
  'css/daub-overrides.css',
  'css/daub-theme.css',
  'css/motion.css',
  'css/style.css',
  'css/style.legacy.css',
  'data/all.json',
  'data/pdf-list.json',
];
const CORE_REFRESH_TARGETS = [
  { url: 'index.html', cacheName: CORE_CACHE },
  { url: 'webapp.html', cacheName: CORE_CACHE },
  { url: 'manifest.json', cacheName: CORE_CACHE },
  { url: 'data/pdf-list.json', cacheName: JSON_CACHE },
  { url: 'data/all.json', cacheName: JSON_CACHE }
];

const toScopedPath = value => new URL(value, self.registration.scope).pathname;
const toScopedUrl = value => new URL(value, self.registration.scope).href;
const INDEX_PATH = toScopedPath('index.html');
const WEBAPP_PATH = toScopedPath('webapp.html');
const PDF_DIR_PATH = toScopedPath('pdf/');
const DATA_DIR_PATH = toScopedPath('data/');

const isSameScope = url => url.origin === self.location.origin && url.pathname.startsWith(scopePath);
const isNavigationRequest = request =>
  request.mode === 'navigate'
  || request.destination === 'document'
  || (request.headers.get('accept') || '').includes('text/html');
const isJsonRequest = (request, url) =>
  url.pathname.startsWith(DATA_DIR_PATH) && url.pathname.endsWith('.json')
  || (request.headers.get('accept') || '').includes('application/json');
const isPdfRequest = url =>
  url.pathname.startsWith(PDF_DIR_PATH) && url.pathname.toLowerCase().endsWith('.pdf');
const isStaticAssetRequest = (request, url) =>
  request.destination === 'script'
  || request.destination === 'style'
  || request.destination === 'worker'
  || request.destination === 'font'
  || request.destination === 'image'
  || url.pathname.endsWith('.svg')
  || url.pathname.endsWith('.ico');

async function precacheCore() {
  const cache = await caches.open(CORE_CACHE);
  const urlsToCache = [...new Set([...CORE_PRECACHE_URLS, ...BUILD_PRECACHE_URLS])];
  await cache.addAll(
    urlsToCache.map(url => new Request(url, { cache: 'reload' }))
  );
}

async function cleanupOldCaches() {
  const valid = new Set([CORE_CACHE, JSON_CACHE, STATIC_CACHE, PDF_CACHE, IMAGE_CACHE]);
  const keys = await caches.keys();
  await Promise.all(
    keys.map(key => (valid.has(key) ? Promise.resolve() : caches.delete(key)))
  );
}

async function networkFirst(request, cacheName, fallbackUrl = '') {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      if (fallbackUrl) {
        await cache.put(fallbackUrl, response.clone());
      }
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request) || (fallbackUrl ? await cache.match(fallbackUrl) : null);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName, fallbackCacheNames = []) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request, { cache: 'reload' })
    .then(async response => {
      if (response && (response.ok || response.type === 'opaque')) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const response = await networkPromise;
  if (response) return response;
  for (const fallbackCacheName of fallbackCacheNames) {
    const fallbackCache = await caches.open(fallbackCacheName);
    const fallbackResponse = await fallbackCache.match(request);
    if (fallbackResponse) return fallbackResponse;
  }
  throw new Error(`Offline and uncached: ${request.url}`);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request, { cache: 'reload' });
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function refreshRuntimeCaches() {
  // Nuclear option: delete ALL caches so the next page load fetches everything fresh.
  const keys = await caches.keys();
  await Promise.all(keys.map(key => caches.delete(key)));
  // Re-precache only the core shell so the reload doesn't hit a blank page.
  await precacheCore();
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(precacheCore());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await cleanupOldCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameScope(url)) return;

  if (isNavigationRequest(request)) {
    if (url.pathname === WEBAPP_PATH) {
      event.respondWith(networkFirst(request, CORE_CACHE, 'webapp.html'));
      return;
    }
    event.respondWith(networkFirst(request, CORE_CACHE, 'index.html'));
    return;
  }

  if (isJsonRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, JSON_CACHE, [CORE_CACHE]));
    return;
  }

  if (isPdfRequest(url)) {
    event.respondWith(cacheFirst(request, PDF_CACHE));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    const cacheName = request.destination === 'image' || url.pathname.endsWith('.svg') || url.pathname.endsWith('.ico')
      ? IMAGE_CACHE
      : STATIC_CACHE;
    event.respondWith(staleWhileRevalidate(request, cacheName, [CORE_CACHE]));
  }
});

self.addEventListener('message', event => {
  if (!event.data) return;

  const respond = message => {
    if (event.ports && event.ports[0]) {
      try {
        event.ports[0].postMessage(message);
      } catch {
        // Ignore response channel failures.
      }
    }
  };

  if (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'GET_VERSION') {
    respond({ ok: true, version: SW_VERSION });
    return;
  }

  if (event.data.type === 'FORCE_REFRESH_CACHE') {
    event.waitUntil((async () => {
      try {
        await refreshRuntimeCaches();
        respond({ ok: true });
      } catch (error) {
        respond({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })());
  }
});
