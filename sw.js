const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const SCOPE_CACHE_NAMESPACE = `symbaroum-${encodeURIComponent(scopePath)}`;
const rawBuildId = typeof __PWA_BUILD_ID__ === 'string' ? __PWA_BUILD_ID__.trim() : '';
const PWA_BUILD_ID = (rawBuildId || 'dev').replace(/[^a-z0-9._-]+/gi, '-');
const SW_VERSION = `${SCOPE_CACHE_NAMESPACE}-pwa-v30-${PWA_BUILD_ID}`;
const CORE_CACHE = `${SW_VERSION}-core`;
const JSON_CACHE = `${SW_VERSION}-json`;
const STATIC_CACHE = `${SW_VERSION}-static`;
const IMAGE_CACHE = `${SW_VERSION}-image`;
const DOCUMENT_CACHE = `${SW_VERSION}-documents-v3`;
const OFFLINE_META_CACHE = `${SCOPE_CACHE_NAMESPACE}-offline-meta`;
const OFFLINE_STATUS_KEY = '__offline-status__';
const ACTIVE_GENERATION_KEY = '__active-worker-generation__';
const CURRENT_RULES_CACHE_PREFIX = `${SW_VERSION}-rules-`;
const BUILD_PRECACHE_ENTRIES = self.__WB_MANIFEST || [];
const CORE_PRECACHE_URLS = [
  'index.html',
  'webapp.html',
  'manifest.json',
  'data/index-catalog.json',
  'data/offline-manifest.json',
  'data/legacy-import-map.json',
  'data/pdf-list.json',
];

const toScopedPath = value => new URL(value, self.registration.scope).pathname;
const toScopedUrl = value => new URL(value, self.registration.scope).href;
const INDEX_PATH = toScopedPath('index.html');
const WEBAPP_PATH = toScopedPath('webapp.html');
const PDF_DIR_PATH = toScopedPath('pdf/');
const DATA_DIR_PATH = toScopedPath('data/');
const OFFLINE_STATUS_URL = toScopedUrl(`${OFFLINE_STATUS_KEY}-${PWA_BUILD_ID}`);
const LEGACY_OFFLINE_STATUS_URL = toScopedUrl(OFFLINE_STATUS_KEY);
const ACTIVE_GENERATION_URL = toScopedUrl(ACTIVE_GENERATION_KEY);
const SPA_NAVIGATION_PATHS = new Set([scopePath, INDEX_PATH, WEBAPP_PATH]);
const RULE_WARM_CONCURRENCY = 2;
const RULE_WARM_BATCH_YIELD_MS = 32;
const RULE_WARM_PAUSE_MAX_MS = 2_000;
const RULE_WARM_FOREGROUND_LEASE_DEFAULT_MS = 120_000;
const RULE_WARM_FOREGROUND_LEASE_MAX_MS = 300_000;
let rulesWarmupPromise = null;
let rulesWarmupIsForced = false;
let queuedForcedRulesWarmupPromise = null;
let rulesWarmPausedUntil = 0;
const rulesWarmForegroundLeases = new Map();
const pdfFullFetches = new Map();
let documentCacheGeneration = 0;
let documentCacheMutationQueue = Promise.resolve();

const isSameScope = url => url.origin === self.location.origin && url.pathname.startsWith(scopePath);
const isNavigationRequest = request =>
  request.mode === 'navigate'
  || request.destination === 'document'
  || (request.headers.get('accept') || '').includes('text/html');
const isSpaNavigationRequest = (request, url) =>
  isNavigationRequest(request) && SPA_NAVIGATION_PATHS.has(url.pathname);
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

function isCacheableResponse(response) {
  return response && (response.ok || response.type === 'opaque');
}

function isSuccessfulHtmlResponse(response) {
  const contentType = response?.headers?.get('content-type') || '';
  return response?.status === 200 && contentType.toLowerCase().includes('text/html');
}

function isCompletePdfResponse(response) {
  const contentType = response?.headers?.get('content-type') || '';
  return response?.status === 200 && contentType.toLowerCase().includes('application/pdf');
}

function isRulesCacheName(name) {
  const value = String(name || '');
  return value.startsWith(`${SCOPE_CACHE_NAMESPACE}-`) && value.includes('-rules-');
}

function isCurrentGenerationRulesCacheName(name) {
  return String(name || '').startsWith(CURRENT_RULES_CACHE_PREFIX);
}

function isCurrentScopeCacheName(name) {
  return String(name || '').startsWith(`${SCOPE_CACHE_NAMESPACE}-`);
}

function isLegacyRootCacheName(name) {
  if (scopePath !== '/') return false;
  const value = String(name || '');
  if (['symbaroum-documents', 'symbaroum-documents-v2', 'symbaroum-offline-meta'].includes(value)) return true;
  return /^symbaroum-pwa-v\d+-(?:core|json|static|image|pdf)$/.test(value);
}

function rulesCacheName(revision) {
  return `${CURRENT_RULES_CACHE_PREFIX}${String(revision || '').slice(0, 20)}`;
}

function respondToPort(event, message) {
  if (!event.ports?.[0]) return;
  try {
    event.ports[0].postMessage(message);
  } catch {
    // The request has already gone away.
  }
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage(message));
}

async function readActiveGeneration() {
  const cache = await caches.open(OFFLINE_META_CACHE);
  const response = await cache.match(ACTIVE_GENERATION_URL);
  return response ? response.text() : null;
}

async function writeActiveGeneration() {
  const cache = await caches.open(OFFLINE_META_CACHE);
  await cache.put(ACTIVE_GENERATION_URL, new Response(SW_VERSION, {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  }));
}

async function assertCurrentWorkerGeneration() {
  const activeGeneration = await readActiveGeneration();
  if (activeGeneration && activeGeneration !== SW_VERSION) {
    throw new Error(`Obsolete service worker generation: ${SW_VERSION}`);
  }
}

function isOfflineStatusRequest(request) {
  const url = new URL(request.url);
  return request.url === LEGACY_OFFLINE_STATUS_URL
    || url.pathname.includes(`/${OFFLINE_STATUS_KEY}-`);
}

async function cleanupOldOfflineMetadata() {
  const cache = await caches.open(OFFLINE_META_CACHE);
  const requests = await cache.keys();
  await Promise.all(requests.map(request => {
    return isOfflineStatusRequest(request) && request.url !== OFFLINE_STATUS_URL
      ? cache.delete(request)
      : Promise.resolve();
  }));
}

function precacheDescriptors() {
  const descriptors = new Map();
  CORE_PRECACHE_URLS.forEach(url => {
    descriptors.set(toScopedUrl(url), { url, revision: null });
  });
  BUILD_PRECACHE_ENTRIES.forEach(entry => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!url) return;
    descriptors.set(toScopedUrl(url), {
      url,
      revision: typeof entry === 'object' && entry?.revision
        ? String(entry.revision)
        : null
    });
  });
  return [...descriptors.values()];
}

function createPrecacheRequests(entry) {
  const canonicalUrl = toScopedUrl(entry.url);
  const networkUrl = new URL(canonicalUrl);
  if (entry.revision) {
    networkUrl.searchParams.set('__WB_REVISION__', entry.revision);
  }
  return {
    cacheRequest: new Request(canonicalUrl, { credentials: 'same-origin' }),
    networkRequest: new Request(networkUrl.href, {
      cache: 'reload',
      credentials: 'same-origin'
    })
  };
}

async function precacheCore() {
  const cache = await caches.open(CORE_CACHE);
  const entries = await Promise.all(precacheDescriptors().map(async descriptor => {
    const { cacheRequest, networkRequest } = createPrecacheRequests(descriptor);
    const response = await fetch(networkRequest);
    if (!isCacheableResponse(response)) {
      throw new Error(`Unable to precache ${cacheRequest.url} (${response.status})`);
    }
    const path = new URL(cacheRequest.url).pathname;
    if ((path === INDEX_PATH || path === WEBAPP_PATH) && !isSuccessfulHtmlResponse(response)) {
      throw new Error(`Refusing non-HTML shell response for ${cacheRequest.url}`);
    }
    return { request: cacheRequest, response };
  }));
  await Promise.all(entries.map(({ request, response }) => cache.put(request, response)));
}

async function migrateLegacyDocumentCaches() {
  const keys = await caches.keys();
  const legacyKeys = keys.filter(key => (
    key !== DOCUMENT_CACHE
    && (
      (key.startsWith(`${SCOPE_CACHE_NAMESPACE}-`) && (
        key.includes('-documents-v2')
        || key.endsWith('-documents-v3')
      ))
      || (scopePath === '/' && (
        key === 'symbaroum-documents'
        || key === 'symbaroum-documents-v2'
        || /^symbaroum-pwa-v\d+-pdf$/.test(key)
      ))
    )
  ));
  if (!legacyKeys.length) return;

  const target = await caches.open(DOCUMENT_CACHE);
  await Promise.all(legacyKeys.map(async key => {
    const source = await caches.open(key);
    const requests = await source.keys();
    await Promise.all(requests.map(async request => {
      const alreadyCached = await target.match(request.url, { ignoreVary: true });
      if (alreadyCached) return;
      const response = await source.match(request);
      if (!isCompletePdfResponse(response)) return;
      try {
        await target.put(new Request(request.url), response);
      } catch {
        // Ignore malformed legacy entries; they will be deleted with the old cache.
      }
    }));
  }));
}

async function cleanupOldCaches() {
  await migrateLegacyDocumentCaches();
  await cleanupOldOfflineMetadata();
  const valid = new Set([
    CORE_CACHE,
    JSON_CACHE,
    STATIC_CACHE,
    IMAGE_CACHE,
    DOCUMENT_CACHE,
    OFFLINE_META_CACHE
  ]);
  const keys = await caches.keys();
  await Promise.all(keys.map(key => {
    if (valid.has(key) || isCurrentGenerationRulesCacheName(key)) return Promise.resolve();
    if (isCurrentScopeCacheName(key) || isLegacyRootCacheName(key)) return caches.delete(key);
    return Promise.resolve();
  }));
}

async function readOfflineState() {
  const cache = await caches.open(OFFLINE_META_CACHE);
  const response = await cache.match(OFFLINE_STATUS_URL);
  if (!response) return null;
  try {
    const state = await response.json();
    return state?.cacheName
      && state?.revision
      && state?.workerVersion === SW_VERSION
      && isRulesCacheName(state.cacheName)
      && isCurrentGenerationRulesCacheName(state.cacheName)
      && Array.isArray(state.resources)
      ? state
      : null;
  } catch {
    return null;
  }
}

async function deleteOfflineState() {
  const cache = await caches.open(OFFLINE_META_CACHE);
  await cache.delete(OFFLINE_STATUS_URL);
}

async function writeOfflineState(state) {
  const cache = await caches.open(OFFLINE_META_CACHE);
  await cache.put(
    OFFLINE_STATUS_URL,
    new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json' }
    })
  );
  return state;
}

function parseOfflineManifest(manifest) {
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
  if (!manifest?.revision || !resources.length) {
    throw new Error('Offline manifest is invalid.');
  }
  resources.forEach((item, index) => {
    const validUrl = typeof item?.url === 'string'
      && item.url.startsWith('data/')
      && !item.url.includes('..');
    const validRevision = /^sha256-[a-f0-9]{64}$/i.test(String(item?.revision || ''));
    const validBytes = Number.isSafeInteger(item?.bytes) && item.bytes >= 0;
    if (!validUrl || !validRevision || !validBytes) {
      throw new Error(`Offline manifest resource ${index} is invalid.`);
    }
  });
  return {
    revision: String(manifest.revision),
    resources,
    totalBytes: Number(manifest.totalBytes) || 0
  };
}

async function loadOfflineManifest() {
  const request = new Request(toScopedUrl('data/offline-manifest.json'), { cache: 'no-store' });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`offline-manifest.json (${response.status})`);
  return parseOfflineManifest(await response.json());
}

function cachedRuleResponseMatches(response, resource) {
  const contentType = response?.headers?.get('content-type') || '';
  return response?.status === 200
    && contentType.toLowerCase().includes('application/json')
    && response.headers.get('x-symbaroum-revision') === String(resource.revision)
    && response.headers.get('x-symbaroum-bytes') === String(resource.bytes);
}

function digestToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function validateRuleResourceResponse(response, resource) {
  const contentType = response?.headers?.get('content-type') || '';
  if (response?.status !== 200 || !contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${resource.url} returned ${response?.status || 0} ${contentType || 'without content-type'}`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength !== resource.bytes) {
    throw new Error(`${resource.url} byte count mismatch (${body.byteLength} != ${resource.bytes})`);
  }
  const digest = await self.crypto.subtle.digest('SHA-256', body);
  const actualRevision = `sha256-${digestToHex(digest)}`;
  if (actualRevision.toLowerCase() !== String(resource.revision).toLowerCase()) {
    throw new Error(`${resource.url} checksum mismatch`);
  }

  const headers = new Headers(response.headers);
  headers.set('content-length', String(body.byteLength));
  headers.set('x-symbaroum-revision', String(resource.revision));
  headers.set('x-symbaroum-bytes', String(resource.bytes));
  return new Response(body, {
    status: 200,
    statusText: response.statusText,
    headers
  });
}

async function hasAllRuleResources(cacheName, resources) {
  if (!cacheName || !resources.length) return false;
  const cache = await caches.open(cacheName);
  for (const item of resources) {
    const response = await cache.match(toScopedUrl(item.url));
    if (!cachedRuleResponseMatches(response, item)) return false;
  }
  return true;
}

async function readBuildOfflineManifest() {
  const core = await caches.open(CORE_CACHE);
  const response = await core.match(toScopedUrl('data/offline-manifest.json'));
  if (!response) return null;
  try {
    return parseOfflineManifest(await response.json());
  } catch {
    return null;
  }
}

async function findCompatiblePreviousRulesState(manifest) {
  const metadata = await caches.open(OFFLINE_META_CACHE);
  const requests = await metadata.keys();
  for (const request of requests) {
    if (request.url === OFFLINE_STATUS_URL || !isOfflineStatusRequest(request)) continue;
    const response = await metadata.match(request);
    if (!response) continue;
    try {
      const state = await response.json();
      if (state?.revision !== manifest.revision
        || !isRulesCacheName(state?.cacheName)
        || !await hasAllRuleResources(state.cacheName, manifest.resources)) {
        continue;
      }
      return state;
    } catch {
      // Ignore malformed or incomplete metadata from a previous generation.
    }
  }
  return null;
}

async function migrateCompatibleRulesCache() {
  try {
    const manifest = await readBuildOfflineManifest();
    if (!manifest) return false;
    const previous = await findCompatiblePreviousRulesState(manifest);
    if (!previous) return false;
    await assertCurrentWorkerGeneration();

    const source = await caches.open(previous.cacheName);
    const cacheName = rulesCacheName(manifest.revision);
    const target = await caches.open(cacheName);
    for (const resource of manifest.resources) {
      const request = new Request(toScopedUrl(resource.url));
      const response = await source.match(request);
      if (!cachedRuleResponseMatches(response, resource)) return false;
      await target.put(request, response);
    }

    await assertCurrentWorkerGeneration();
    await writeOfflineState({
      workerVersion: SW_VERSION,
      revision: manifest.revision,
      cacheName,
      total: manifest.resources.length,
      totalBytes: manifest.totalBytes,
      resources: manifest.resources.map(resource => ({
        url: resource.url,
        revision: resource.revision,
        bytes: resource.bytes
      })),
      updatedAt: previous.updatedAt || new Date().toISOString()
    });
    return true;
  } catch {
    return false;
  }
}

async function cleanupSupersededRulesCaches(activeName) {
  const keys = await caches.keys();
  await Promise.all(keys.map(key => (
    isCurrentGenerationRulesCacheName(key) && key !== activeName
      ? caches.delete(key)
      : Promise.resolve()
  )));
}

function normalizeRulesWarmTokenId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 256) : '';
}

function pruneExpiredRulesWarmForegroundLeases(now = Date.now()) {
  rulesWarmForegroundLeases.forEach((expiresAt, tokenId) => {
    if (expiresAt <= now) rulesWarmForegroundLeases.delete(tokenId);
  });
}

function rulesWarmPauseState(now = Date.now()) {
  pruneExpiredRulesWarmForegroundLeases(now);
  let until = rulesWarmPausedUntil;
  rulesWarmForegroundLeases.forEach(expiresAt => {
    if (expiresAt > until) until = expiresAt;
  });
  return {
    paused: until > now,
    until,
    remaining: Math.max(0, until - now),
    activeTokens: rulesWarmForegroundLeases.size
  };
}

function pauseRulesWarmup(durationMs = 750, tokenIdValue = '') {
  const tokenId = normalizeRulesWarmTokenId(tokenIdValue);
  const now = Date.now();
  if (tokenId) {
    const requestedDuration = Number(durationMs) || RULE_WARM_FOREGROUND_LEASE_DEFAULT_MS;
    const boundedDuration = Math.max(
      1_000,
      Math.min(requestedDuration, RULE_WARM_FOREGROUND_LEASE_MAX_MS)
    );
    const expiresAt = now + boundedDuration;
    rulesWarmForegroundLeases.set(
      tokenId,
      Math.max(rulesWarmForegroundLeases.get(tokenId) || 0, expiresAt)
    );
  } else {
    const boundedDuration = Math.max(0, Math.min(Number(durationMs) || 0, RULE_WARM_PAUSE_MAX_MS));
    rulesWarmPausedUntil = Math.max(rulesWarmPausedUntil, now + boundedDuration);
  }
  return rulesWarmPauseState(now);
}

function resumeRulesWarmup(tokenIdValue) {
  const tokenId = normalizeRulesWarmTokenId(tokenIdValue);
  if (tokenId) rulesWarmForegroundLeases.delete(tokenId);
  return rulesWarmPauseState();
}

async function waitForRulesWarmupTurn() {
  const scheduling = self.navigator?.scheduling;
  while (true) {
    let pauseState = rulesWarmPauseState();
    while (pauseState.paused || scheduling?.isInputPending?.()) {
      const remaining = pauseState.remaining;
      await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(remaining, 50), 250)));
      pauseState = rulesWarmPauseState();
    }
    // Keep warming measurably lower priority even on a zero-latency local
    // origin, and re-check input after the yield before starting the batch.
    await new Promise(resolve => setTimeout(resolve, RULE_WARM_BATCH_YIELD_MS));
    if (!rulesWarmPauseState().paused && !scheduling?.isInputPending?.()) return;
  }
}

function mutateDocumentCache(work) {
  const task = documentCacheMutationQueue.then(work, work);
  documentCacheMutationQueue = task.catch(() => null);
  return task;
}

async function documentCacheCount() {
  const cache = await caches.open(DOCUMENT_CACHE);
  return (await cache.keys()).length;
}

async function offlineStatus() {
  let state = await readOfflineState();
  if (state && !await hasAllRuleResources(state.cacheName, state.resources)) {
    await deleteOfflineState();
    state = null;
  }
  return {
    ok: true,
    status: state ? 'ready' : 'missing',
    rules: state ? {
      revision: state.revision,
      total: state.total,
      totalBytes: state.totalBytes,
      updatedAt: state.updatedAt
    } : null,
    documents: await documentCacheCount()
  };
}

async function warmRulesCacheInternal({ force = false } = {}) {
  await assertCurrentWorkerGeneration();
  const manifest = await loadOfflineManifest();
  const current = await readOfflineState();
  const cacheName = rulesCacheName(manifest.revision);

  if (!force
    && current?.revision === manifest.revision
    && current?.cacheName === cacheName
    && await hasAllRuleResources(cacheName, manifest.resources)) {
    const status = await offlineStatus();
    await broadcast({ type: 'OFFLINE_RULES_COMPLETE', ...status });
    return status;
  }

  const cache = await caches.open(cacheName);
  let completed = 0;
  try {
    for (let offset = 0; offset < manifest.resources.length; offset += RULE_WARM_CONCURRENCY) {
      await assertCurrentWorkerGeneration();
      await waitForRulesWarmupTurn();
      await assertCurrentWorkerGeneration();
      const batch = manifest.resources.slice(offset, offset + RULE_WARM_CONCURRENCY);
      await Promise.all(batch.map(async resource => {
        const request = new Request(toScopedUrl(resource.url));
        const cached = force ? null : await cache.match(request);
        if (!cachedRuleResponseMatches(cached, resource)) {
          const response = await fetch(new Request(request, { cache: 'no-store' }));
          const validated = await validateRuleResourceResponse(response, resource);
          await cache.put(request, validated);
        }
      }));
      for (const resource of batch) {
        completed += 1;
        await broadcast({
          type: 'OFFLINE_RULES_PROGRESS',
          status: 'warming',
          completed,
          total: manifest.resources.length,
          resource: resource.url
        });
      }
    }

    await assertCurrentWorkerGeneration();
    await writeOfflineState({
      workerVersion: SW_VERSION,
      revision: manifest.revision,
      cacheName,
      total: manifest.resources.length,
      totalBytes: manifest.totalBytes,
      resources: manifest.resources.map(resource => ({
        url: resource.url,
        revision: resource.revision,
        bytes: resource.bytes
      })),
      updatedAt: new Date().toISOString()
    });
    await assertCurrentWorkerGeneration();
    await cleanupSupersededRulesCaches(cacheName);
    const status = await offlineStatus();
    await broadcast({ type: 'OFFLINE_RULES_COMPLETE', ...status });
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const activeGeneration = await readActiveGeneration().catch(() => null);
    if (activeGeneration && activeGeneration !== SW_VERSION) {
      await Promise.all([
        caches.delete(cacheName),
        deleteOfflineState()
      ]);
    } else {
      await broadcast({
        type: 'OFFLINE_RULES_ERROR',
        status: 'error',
        completed,
        total: manifest.resources.length,
        error: message
      });
    }
    throw error;
  }
}

function startRulesWarmup(options = {}) {
  const force = Boolean(options.force);
  let promise;
  rulesWarmupIsForced = force;
  promise = warmRulesCacheInternal({ force })
    .finally(() => {
      if (rulesWarmupPromise === promise) {
        rulesWarmupPromise = null;
        rulesWarmupIsForced = false;
      }
    });
  rulesWarmupPromise = promise;
  return promise;
}

function warmRulesCache(options = {}) {
  const force = Boolean(options.force);
  if (!rulesWarmupPromise) return startRulesWarmup({ force });
  if (!force || rulesWarmupIsForced) return rulesWarmupPromise;

  if (!queuedForcedRulesWarmupPromise) {
    queuedForcedRulesWarmupPromise = rulesWarmupPromise
      .catch(() => null)
      .then(() => startRulesWarmup({ force: true }))
      .finally(() => {
        queuedForcedRulesWarmupPromise = null;
      });
  }
  return queuedForcedRulesWarmupPromise;
}

async function clearDocumentCache() {
  documentCacheGeneration += 1;
  await mutateDocumentCache(async () => {
    await caches.delete(DOCUMENT_CACHE);
    await caches.open(DOCUMENT_CACHE);
  });
  const status = await offlineStatus();
  await broadcast({ type: 'OFFLINE_DOCUMENTS_CLEARED', ...status });
  return status;
}

async function refreshSpaNavigation(request, fallbackUrl) {
  const cache = await caches.open(CORE_CACHE);
  const response = await fetch(request, { cache: 'reload' });
  if (!isSuccessfulHtmlResponse(response)) return null;
  await cache.put(request, response.clone());
  await cache.put(toScopedUrl(fallbackUrl), response.clone());
  return response;
}

async function navigationStaleWhileRevalidate(request, fallbackUrl) {
  const cache = await caches.open(CORE_CACHE);
  const fallbackRequest = toScopedUrl(fallbackUrl);
  let cached = await cache.match(request) || await cache.match(fallbackRequest);
  if (cached && !isSuccessfulHtmlResponse(cached)) {
    await Promise.all([cache.delete(request), cache.delete(fallbackRequest)]);
    cached = null;
  }
  const refresh = refreshSpaNavigation(request, fallbackUrl).catch(() => null);
  if (cached) return { response: cached, refresh };
  const response = await refresh;
  if (response) return { response, refresh: Promise.resolve(response) };
  throw new Error(`Offline and uncached navigation: ${request.url}`);
}

function resolveByteRange(rangeHeader, size) {
  const value = String(rangeHeader || '').trim();
  if (value.includes(',')) return { kind: 'ignore' };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match) return { kind: 'ignore' };
  if (size <= 0 || (!match[1] && !match[2])) return { kind: 'unsatisfiable' };

  const startValue = match[1] ? Number(match[1]) : null;
  const endValue = match[2] ? Number(match[2]) : null;
  if ((startValue !== null && !Number.isSafeInteger(startValue))
    || (endValue !== null && !Number.isSafeInteger(endValue))) {
    return { kind: 'unsatisfiable' };
  }

  if (startValue === null) {
    if (endValue <= 0) return { kind: 'unsatisfiable' };
    const length = Math.min(endValue, size);
    return { kind: 'range', start: size - length, end: size - 1 };
  }

  if (startValue >= size) return { kind: 'unsatisfiable' };
  const end = endValue === null ? size - 1 : Math.min(endValue, size - 1);
  if (end < startValue) return { kind: 'unsatisfiable' };
  return { kind: 'range', start: startValue, end };
}

async function createPartialPdfResponse(response, rangeHeader) {
  const bytes = await response.arrayBuffer();
  const range = resolveByteRange(rangeHeader, bytes.byteLength);
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  headers.delete('content-encoding');

  if (range.kind === 'ignore') {
    headers.delete('content-range');
    headers.set('content-length', String(bytes.byteLength));
    return new Response(bytes, { status: 200, statusText: 'OK', headers });
  }

  if (range.kind === 'unsatisfiable') {
    headers.set('content-range', `bytes */${bytes.byteLength}`);
    headers.set('content-length', '0');
    return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers });
  }

  const body = bytes.slice(range.start, range.end + 1);
  headers.set('content-range', `bytes ${range.start}-${range.end}/${bytes.byteLength}`);
  headers.set('content-length', String(body.byteLength));
  return new Response(body, { status: 206, statusText: 'Partial Content', headers });
}

function canonicalPdfRequest(request) {
  return new Request(request.url, { credentials: request.credentials });
}

function normalizedPdfCacheResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function storeCompletePdf(request, response, generation = documentCacheGeneration) {
  if (!isCompletePdfResponse(response)) return false;
  const cacheRequest = canonicalPdfRequest(request);
  const cacheResponse = normalizedPdfCacheResponse(response.clone());
  return mutateDocumentCache(async () => {
    if (generation !== documentCacheGeneration) return false;
    const cache = await caches.open(DOCUMENT_CACHE);
    if (generation !== documentCacheGeneration) return false;
    await cache.put(cacheRequest, cacheResponse);
    const activeGeneration = await readActiveGeneration();
    if (activeGeneration && activeGeneration !== SW_VERSION) {
      await caches.delete(DOCUMENT_CACHE);
      return false;
    }
    return true;
  });
}

function createFullPdfRequest(request) {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  return new Request(request.url, {
    method: 'GET',
    headers,
    credentials: request.credentials,
    cache: 'no-store',
    redirect: 'follow',
    priority: 'low'
  });
}

function scheduleFullPdfFetch(request, generation) {
  const fetchKey = `${generation}:${request.url}`;
  if (pdfFullFetches.has(fetchKey)) return pdfFullFetches.get(fetchKey);
  const fullFetch = (async () => {
    const response = await fetch(createFullPdfRequest(request));
    await storeCompletePdf(request, response, generation);
  })().finally(() => {
    pdfFullFetches.delete(fetchKey);
  });
  pdfFullFetches.set(fetchKey, fullFetch);
  return fullFetch;
}

async function handlePdfRequest(request) {
  const generation = documentCacheGeneration;
  const cache = await caches.open(DOCUMENT_CACHE);
  let cached = await cache.match(request.url, { ignoreVary: true });
  if (cached && !isCompletePdfResponse(cached)) {
    await cache.delete(request.url, { ignoreVary: true });
    cached = null;
  }

  const rangeHeader = request.headers.get('range');
  if (cached) {
    return {
      response: rangeHeader ? await createPartialPdfResponse(cached, rangeHeader) : cached,
      background: Promise.resolve()
    };
  }

  const networkResponse = await fetch(request);
  if (isCompletePdfResponse(networkResponse)) {
    await storeCompletePdf(request, networkResponse, generation);
    return {
      response: rangeHeader
        ? await createPartialPdfResponse(networkResponse.clone(), rangeHeader)
        : networkResponse,
      background: Promise.resolve()
    };
  }

  return {
    response: networkResponse,
    background: networkResponse.status === 206
      ? scheduleFullPdfFetch(request, generation).catch(() => null)
      : Promise.resolve()
  };
}

async function staleWhileRevalidate(request, cacheName, fallbackCacheNames = []) {
  const cache = await caches.open(cacheName);
  let cached = await cache.match(request);
  if (!cached) {
    for (const fallbackCacheName of fallbackCacheNames) {
      const fallbackCache = await caches.open(fallbackCacheName);
      cached = await fallbackCache.match(request);
      if (cached) break;
    }
  }
  const networkPromise = fetch(request, { cache: 'reload' })
    .then(async response => {
      if (!isCacheableResponse(response)) return null;
      await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return { response: cached, refresh: networkPromise };
  const response = await networkPromise;
  if (response) return { response, refresh: Promise.resolve(response) };
  throw new Error(`Offline and uncached: ${request.url}`);
}

async function rulesAwareJson(request) {
  const state = await readOfflineState();
  if (state?.cacheName) {
    const cache = await caches.open(state.cacheName);
    const cached = await cache.match(request);
    if (cached) return { response: cached, refresh: Promise.resolve(cached) };
  }
  return staleWhileRevalidate(request, JSON_CACHE, [CORE_CACHE]);
}

async function refreshRuntimeCaches() {
  await precacheCore();
  const rules = await warmRulesCache({ force: true });
  return { rules };
}

self.addEventListener('install', event => {
  event.waitUntil(precacheCore());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await writeActiveGeneration();
    await migrateCompatibleRulesCache();
    await cleanupOldCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameScope(url)) return;

  if (isPdfRequest(url)) {
    const pdfPromise = handlePdfRequest(request);
    event.respondWith(pdfPromise.then(result => result.response));
    event.waitUntil(pdfPromise.then(result => result.background).catch(() => null));
    return;
  }

  if (isSpaNavigationRequest(request, url)) {
    const fallbackUrl = url.pathname === WEBAPP_PATH ? 'webapp.html' : 'index.html';
    const navigationPromise = navigationStaleWhileRevalidate(request, fallbackUrl);
    event.respondWith(navigationPromise.then(result => result.response));
    event.waitUntil(navigationPromise.then(result => result.refresh).catch(() => null));
    return;
  }

  if (isJsonRequest(request, url)) {
    const jsonPromise = rulesAwareJson(request);
    event.respondWith(jsonPromise.then(result => result.response));
    event.waitUntil(jsonPromise.then(result => result.refresh).catch(() => null));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    const cacheName = request.destination === 'image' || url.pathname.endsWith('.svg') || url.pathname.endsWith('.ico')
      ? IMAGE_CACHE
      : STATIC_CACHE;
    const assetPromise = staleWhileRevalidate(request, cacheName, [CORE_CACHE]);
    event.respondWith(assetPromise.then(result => result.response));
    event.waitUntil(assetPromise.then(result => result.refresh).catch(() => null));
  }
});

self.addEventListener('message', event => {
  const data = event.data || {};
  const type = typeof data === 'string' ? data : data.type;
  if (!type) return;

  if (type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (type === 'GET_VERSION') {
    respondToPort(event, { ok: true, version: SW_VERSION });
    return;
  }

  if (type === 'PAUSE_RULES_CACHE') {
    const pauseState = pauseRulesWarmup(data.durationMs, data.tokenId);
    respondToPort(event, { ok: true, status: 'paused', ...pauseState });
    return;
  }

  if (type === 'RESUME_RULES_CACHE') {
    const pauseState = resumeRulesWarmup(data.tokenId);
    respondToPort(event, {
      ok: true,
      status: pauseState.paused ? 'paused' : 'resumed',
      ...pauseState
    });
    return;
  }

  const work = (async () => {
    try {
      if (type === 'GET_OFFLINE_STATUS') {
        respondToPort(event, await offlineStatus());
        return;
      }
      if (type === 'WARM_RULES_CACHE') {
        respondToPort(event, await warmRulesCache({ force: false }));
        return;
      }
      if (type === 'UPDATE_RULES_CACHE') {
        respondToPort(event, await warmRulesCache({ force: true }));
        return;
      }
      if (type === 'CLEAR_DOCUMENT_CACHE') {
        respondToPort(event, await clearDocumentCache());
        return;
      }
      if (type === 'FORCE_REFRESH_CACHE') {
        const result = await refreshRuntimeCaches();
        respondToPort(event, { ok: true, ...result });
      }
    } catch (error) {
      respondToPort(event, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  })();
  event.waitUntil(work);
});
