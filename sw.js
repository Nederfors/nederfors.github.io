const CACHE_NAME = 'symbaroum-pwa-v9';
const URLS_TO_CACHE = [
  // Core pages and styles
  'index.html',
  'character.html',
  'notes.html',
  'inventory.html',
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
  'js/exceptionellt.js',
  'js/index-view.js',
  'js/inventory-view.js',
  'js/jszip.min.js',
  'js/inventory-utils.js',
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

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(URLS_TO_CACHE);
      const response = await cache.match('data/pdf-list.json');
      if (response) {
        const pdfs = await response.json();
        const files = pdfs.flatMap(c => c.items.map(p => p.file));
        await cache.addAll(files);
      }
    })()
  );
});

self.addEventListener('fetch', event => {
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.location.origin)
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        event.waitUntil(refreshCache(event.request));
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        throw error;
      }
    })()
  );
});

async function refreshCache(request) {
  try {
    const response = await fetch(request);
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
  }
});
