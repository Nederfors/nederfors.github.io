const CACHE_NAME = 'symbaroum-pwa-v12';
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
  'js/auto-resize.js',
  'js/artifact-payment.js',
  'js/beastform.js',
  'js/bloodbond.js',
  'js/character-view.js',
  'js/djurmask.js',
  'js/elite-add.js',
  'js/elite-req.js',
  'js/entry-card.js',
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
  // Data JSON
  'data/anstallning.json',
  'data/artefakter.json',
  'data/byggnader.json',
  'data/diverse.json',
  'data/dryck.json',
  'data/elityrke.json',
  'data/elixir.json',
  'data/kuriositeter.json',
  'data/skatter.json',
  'data/fallor.json',
  'data/fardmedel.json',
  'data/fordel.json',
  'data/formaga.json',
  'data/forvaring.json',
  'data/gardsdjur.json',
  'data/instrument.json',
  'data/klader.json',
  'data/kvalitet.json',
  'data/lagre-artefakter.json',
  'data/mat.json',
  'data/monstruost-sardrag.json',
  'data/mystisk-kraft.json',
  'data/mystisk-kvalitet.json',
  'data/nackdel.json',
  'data/negativ-kvalitet.json',
  'data/neutral-kvalitet.json',
  'data/pdf-list.json',
  'data/ras.json',
  'data/ritual.json',
  'data/rustning.json',
  'data/sardrag.json',
  'data/specialverktyg.json',
  'data/tabeller.json',
  'data/tjanster.json',
  'data/vapen.json',
  'data/yrke.json'
];

async function precacheResources(cache) {
  const precacheRequests = URLS_TO_CACHE
    .filter(Boolean)
    .map(url => new Request(url, { cache: 'reload' }));
  await cache.addAll(precacheRequests);

  const response = await cache.match('data/pdf-list.json');
  if (!response) {
    return;
  }

  try {
    const pdfs = await response.json();
    const fileRequests = [];
    (Array.isArray(pdfs) ? pdfs : []).forEach(collection => {
      if (!collection || !Array.isArray(collection.items)) return;
      collection.items.forEach(item => {
        if (!item || !item.file) return;
        fileRequests.push(new Request(item.file, { cache: 'reload' }));
      });
    });
    if (fileRequests.length) {
      await cache.addAll(fileRequests);
    }
  } catch (error) {
    // Ignore invalid PDF list entries; they will be fetched on demand.
  }
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

const shouldNetworkFirst = request =>
  isNavigationRequest(request) ||
  request.destination === 'style' ||
  request.destination === 'script';

self.addEventListener('fetch', event => {
  const { request } = event;
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(fetch(request));
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
