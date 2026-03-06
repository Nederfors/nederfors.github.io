const CACHE_NAME = 'symbaroum-pwa-v16';
const PDF_DIR = 'pdf/';
const URLS_TO_CACHE = [
  // build-sw-cache:start
  // Core pages and styles
  'character.html',
  'effects.html',
  'index.html',
  'inventory.html',
  'notes.html',
  'summary.html',
  'traits.html',
  'webapp.html',
  'css/style.css',
  'manifest.json',

  // Icons
  'icons/active.svg',
  'icons/addqual.svg',
  'icons/adjust.svg',
  'icons/alkemi.svg',
  'icons/andrik.svg',
  'icons/anteckningar.svg',
  'icons/arrow-down.svg',
  'icons/arrow-up.svg',
  'icons/artefakt.svg',
  'icons/basket.svg',
  'icons/broom.svg',
  'icons/buymultiple.svg',
  'icons/character.svg',
  'icons/cross.svg',
  'icons/effects.svg',
  'icons/egenskaper.svg',
  'icons/elityrke.svg',
  'icons/expand.svg',
  'icons/extend.svg',
  'icons/forsvar.svg',
  'icons/free.svg',
  'icons/icon_DA',
  'icons/index.svg',
  'icons/info.svg',
  'icons/inventarie.svg',
  'icons/lamp.svg',
  'icons/minus.svg',
  'icons/money-bag.svg',
  'icons/overview.svg',
  'icons/pen.svg',
  'icons/plus.svg',
  'icons/qualfree.svg',
  'icons/remove.svg',
  'icons/settings.svg',
  'icons/skadetyp.svg',
  'icons/smithing.svg',
  'icons/sort.svg',
  'icons/tool-box.svg',

  // JavaScript
  'js/artifact-payment.js',
  'js/auto-resize.js',
  'js/beastform.js',
  'js/bloodbond.js',
  'js/character-generator.js',
  'js/character-view.js',
  'js/djurmask.js',
  'js/elite-add.js',
  'js/elite-req.js',
  'js/elite-utils.js',
  'js/entry-card.js',
  'js/entry-xp.js',
  'js/exceptionellt.js',
  'js/index-view.js',
  'js/inventory-utils.js',
  'js/inventory-view.js',
  'js/jszip.min.js',
  'js/kraftval.js',
  'js/main.js',
  'js/monsterlard.js',
  'js/notes-view.js',
  'js/pdf-library.js',
  'js/pwa.js',
  'js/rules-helper.js',
  'js/shared-toolbar.js',
  'js/store.js',
  'js/summary-effects.js',
  'js/tabell-popup.js',
  'js/text-format.js',
  'js/traits-utils.js',
  'js/utils.js',
  'js/yrke-panel.js',

  // Data JSON
  'data/diverse.json',
  'data/kuriositeter.json',
  'data/skatter.json',
  'data/elixir.json',
  'data/fordel.json',
  'data/formaga.json',
  'data/basformagor.json',
  'data/kvalitet.json',
  'data/mystisk-kraft.json',
  'data/mystisk-kvalitet.json',
  'data/neutral-kvalitet.json',
  'data/negativ-kvalitet.json',
  'data/nackdel.json',
  'data/anstallning.json',
  'data/byggnader.json',
  'data/yrke.json',
  'data/ras.json',
  'data/elityrke.json',
  'data/fardmedel.json',
  'data/forvaring.json',
  'data/gardsdjur.json',
  'data/instrument.json',
  'data/klader.json',
  'data/specialverktyg.json',
  'data/tjanster.json',
  'data/ritual.json',
  'data/rustning.json',
  'data/vapen.json',
  'data/mat.json',
  'data/dryck.json',
  'data/sardrag.json',
  'data/monstruost-sardrag.json',
  'data/artefakter.json',
  'data/lagre-artefakter.json',
  'data/fallor.json',
  'data/pdf-list.json',
  'data/tabeller.json',
  // build-sw-cache:end
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
        const file = normalizePdfPath(item.file);
        if (!file) return;
        fileRequests.push(new Request(file, { cache: 'reload' }));
      });
    });
    if (fileRequests.length) {
      await Promise.allSettled(
        fileRequests.map(request => cache.add(request))
      );
    }
  } catch (error) {
    // Ignore invalid PDF list entries; they will be fetched on demand.
  }
}

function normalizePdfPath(file) {
  if (typeof file !== 'string') return '';
  const trimmed = file.trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith(PDF_DIR)) return trimmed;
  if (trimmed.startsWith('data/')) {
    return `${PDF_DIR}${trimmed.slice('data/'.length)}`;
  }
  return `${PDF_DIR}${trimmed.replace(/^\/+/, '')}`;
}

async function forceRefreshCaches() {
  const cache = await caches.open(CACHE_NAME);
  await precacheResources(cache);

  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key))
  );
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
