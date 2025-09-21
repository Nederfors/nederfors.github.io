const CACHE_NAME = 'symbaroum-pwa-v9';
const URLS_TO_CACHE = [
  // Core pages and styles
  'index.html',
  'character.html',
  'notes.html',
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
  'data/db.json',
  'data/pdf-list.json',
  'data/tabeller.json'
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
    fetch(event.request)
      .then(fetchResponse =>
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        })
      )
      .catch(() => caches.match(event.request))
  );
});

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
