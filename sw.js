const CACHE_NAME = 'symbaroum-pwa-v5';
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
  'js/beastform.js',
  'js/bloodbond.js',
  'js/character-view.js',
  'js/djurmask.js',
  'js/elite-add.js',
  'js/elite-req.js',
  'js/exceptionellt.js',
  'js/index-view.js',
  'js/inventory-utils.js',
  'js/main.js',
  'js/monsterlard.js',
  'js/notes-view.js',
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
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(URLS_TO_CACHE))
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
