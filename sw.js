const CACHE_NAME = 'symbaroum-pwa-v15';
const URLS_TO_CACHE = [
  // Core pages and styles
  'index.html',
  'character.html',
  'notes.html',
  'inventory.html',
  'traits.html',
  'summary.html',
  'effects.html',
  'webapp.html',
  'css/style.css',
  'manifest.json',
  // Icons
  'icons/icon_DA',
  // JavaScript
  'js/app-bootstrap.js',
  'js/auto-resize.js',
  'js/artifact-payment.js',
  'js/beastform.js',
  'js/bloodbond.js',
  'js/character-generator.js',
  'js/character-view.js',
  'js/djurmask.js',
  'js/elite-add.js',
  'js/elite-utils.js',
  'js/elite-req.js',
  'js/entry-card.js',
  'js/entry-xp.js',
  'js/exceptionellt.js',
  'js/index-view.js',
  'js/inventory-view.js',
  'js/jszip.min.js',
  'js/inventory-utils.js',
  'js/summary-effects.js',
  'js/main.js',
  'js/monsterlard.js',
  'js/notes-view.js',
  'js/pdf-library.js',
  'js/pwa.js',
  'js/shared-toolbar.js',
  'js/store.js',
  'js/tabell-popup.js',
  'js/text-format.js',
  'js/traits-utils.js',
  'js/utils.js',
  'js/yrke-panel.js',
  // Bundled database
  'data/all.json'
];

async function precacheResources(cache) {
  const precacheRequests = URLS_TO_CACHE
    .filter(Boolean)
    .map(url => new Request(url, { cache: 'reload' }));
  await cache.addAll(precacheRequests);
}

async function forceRefreshCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key))
  );

  await caches.delete(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  await precacheResources(cache);
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await precacheResources(cache);
    })()
  );
});

const isNavigationRequest = request =>
  request.mode === 'navigate' ||
  request.destination === 'document' ||
  (request.headers.get('accept') || '').includes('text/html');

const isJsonRequest = request => {
  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/json')) {
    return true;
  }
  try {
    const { pathname } = new URL(request.url);
    return pathname.endsWith('.json');
  } catch (error) {
    return false;
  }
};

const isPdfRequest = request => {
  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/pdf')) {
    return true;
  }
  try {
    const { pathname } = new URL(request.url);
    return pathname.toLowerCase().endsWith('.pdf');
  } catch (error) {
    return false;
  }
};

const shouldNetworkFirst = request =>
  isNavigationRequest(request) ||
  request.destination === 'style' ||
  request.destination === 'script' ||
  isJsonRequest(request);

self.addEventListener('fetch', event => {
  const { request } = event;
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (isPdfRequest(request)) {
    event.respondWith(cachePdfOnDemand(request));
    return;
  }

  if (shouldNetworkFirst(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        event.waitUntil(refreshCache(request));
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request, { cache: 'reload' });
        const cache = await caches.open(CACHE_NAME);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        throw error;
      }
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request, { cache: 'reload' });
    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function cachePdfOnDemand(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request, { cache: 'reload' });
  if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
    await cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function refreshCache(request) {
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response && (response.ok || response.type === 'opaque')) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
  } catch (error) {
    // Ignore refresh errors; the cached response has already been served.
  }
}

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.map(key => {
            if (!cacheWhitelist.includes(key)) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Allow the page to trigger activation of a waiting SW immediately
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data === 'SKIP_WAITING' || (event.data.type && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'FORCE_REFRESH_CACHE') {
    const respond = message => {
      if (event.ports && event.ports[0]) {
        try {
          event.ports[0].postMessage(message);
        } catch (error) {
          // Unable to communicate back to the page; ignore.
        }
      }
    };

    event.waitUntil(
      (async () => {
        try {
          await forceRefreshCaches();
          respond({ ok: true });
        } catch (error) {
          respond({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })()
    );
  }
});
