import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const FetchHeaders = globalThis.Headers;
const FetchRequest = globalThis.Request;
const FetchResponse = globalThis.Response;

class MemoryCache {
  constructor() {
    this.entries = new Map();
  }

  key(input) {
    return typeof input === 'string' ? input : input.url;
  }

  async match(input) {
    return this.entries.get(this.key(input))?.clone() || null;
  }

  async put(input, response) {
    this.entries.set(this.key(input), response.clone());
  }

  async delete(input) {
    return this.entries.delete(this.key(input));
  }

  async keys() {
    return [...this.entries.keys()].map(url => new FetchRequest(url));
  }
}

function loadWorker(fetchImplementation, options = {}) {
  const stores = options.stores || new Map();
  const listeners = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    }
  };
  const skipWaiting = vi.fn(async () => {});
  const claim = vi.fn(async () => {});
  const self = {
    __WB_MANIFEST: options.precacheEntries || [],
    registration: { scope: options.scope || 'https://example.test/app/' },
    location: new URL('sw.js', options.scope || 'https://example.test/app/'),
    crypto: globalThis.crypto,
    navigator: {},
    clients: { matchAll: async () => [], claim },
    addEventListener: (type, listener) => listeners.set(type, listener),
    skipWaiting
  };
  const source = readFileSync(path.resolve(process.cwd(), 'sw.js'), 'utf8');
  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImplementation,
    URL,
    Request: FetchRequest,
    Response: FetchResponse,
    Headers: FetchHeaders,
    setTimeout,
    clearTimeout
  });
  if (options.buildId !== undefined) {
    context.__PWA_BUILD_ID__ = options.buildId;
  }
  vm.runInContext(`${source}\nself.__test = {
    SCOPE_CACHE_NAMESPACE,
    PWA_BUILD_ID,
    SW_VERSION,
    CORE_CACHE,
    DOCUMENT_CACHE,
    OFFLINE_META_CACHE,
    OFFLINE_STATUS_URL,
    ACTIVE_GENERATION_URL,
    cleanupOldCaches,
    precacheCore,
    clearDocumentCache,
    createPartialPdfResponse,
    handlePdfRequest,
    navigationStaleWhileRevalidate,
    staleWhileRevalidate,
    rulesAwareJson,
    offlineStatus,
    rulesCacheName,
    warmRulesCache
  };`, context);
  const dispatchExtendable = async type => {
    let lifetime = Promise.resolve();
    listeners.get(type)?.({
      waitUntil(promise) {
        lifetime = Promise.resolve(promise);
      }
    });
    await lifetime;
  };
  const requestVersion = () => {
    let response;
    listeners.get('message')?.({
      data: { type: 'GET_VERSION' },
      ports: [{ postMessage: value => { response = value; } }],
      waitUntil: () => {}
    });
    return response;
  };
  return {
    api: self.__test,
    caches,
    claim,
    dispatchExtendable,
    listeners,
    requestVersion,
    skipWaiting
  };
}

function pdfBytes(length = 256) {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode('%PDF-1.7'));
  for (let index = 8; index < bytes.length; index += 1) bytes[index] = index % 251;
  return bytes;
}

function fullPdfResponse(bytes = pdfBytes()) {
  return new FetchResponse(bytes, {
    status: 200,
    headers: { 'content-type': 'application/pdf' }
  });
}

async function offlineResource(url, body) {
  const bytes = new TextEncoder().encode(body);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return {
    resource: { url, revision: `sha256-${hash}`, bytes: bytes.byteLength },
    response: () => new FetchResponse(bytes, {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  };
}

function manifestResponse(manifest) {
  return new FetchResponse(JSON.stringify(manifest), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('service-worker PDF routing', () => {
  it('uses a build-specific cache/version identity with a stable development fallback', () => {
    const first = loadWorker(async () => new FetchResponse('unused'), { buildId: 'build-100' });
    const second = loadWorker(async () => new FetchResponse('unused'), { buildId: 'build-101' });
    const devA = loadWorker(async () => new FetchResponse('unused'));
    const devB = loadWorker(async () => new FetchResponse('unused'));

    expect(first.api.SW_VERSION).not.toBe(second.api.SW_VERSION);
    expect(first.api.CORE_CACHE).toBe(`${first.api.SW_VERSION}-core`);
    expect(first.api.DOCUMENT_CACHE).not.toBe(second.api.DOCUMENT_CACHE);
    expect(first.api.DOCUMENT_CACHE).toBe(`${first.api.SW_VERSION}-documents-v3`);
    expect(first.requestVersion()).toEqual({ ok: true, version: first.api.SW_VERSION });
    expect(second.requestVersion()).toEqual({ ok: true, version: second.api.SW_VERSION });
    expect(devA.api.PWA_BUILD_ID).toBe('dev');
    expect(devA.api.SW_VERSION).toBe(devB.api.SW_VERSION);
  });

  it('fetches revisioned precache entries freshly and stores them under canonical URLs', async () => {
    const requests = [];
    const { api, caches } = loadWorker(async request => {
      requests.push(request);
      const contentType = request.url.includes('.html') ? 'text/html' : 'application/javascript';
      return new FetchResponse(contentType === 'text/html' ? '<!doctype html>' : '/* fresh */', {
        status: 200,
        headers: { 'content-type': contentType }
      });
    }, {
      buildId: 'precache-test',
      precacheEntries: [{ url: 'js/legacy/shared.js', revision: 'raw-content-hash' }]
    });

    await api.precacheCore();

    const revisionedRequest = requests.find(request => request.url.includes('/js/legacy/shared.js'));
    expect(revisionedRequest?.cache).toBe('reload');
    expect(new URL(revisionedRequest.url).searchParams.get('__WB_REVISION__')).toBe('raw-content-hash');

    const core = await caches.open(api.CORE_CACHE);
    expect(await core.match('https://example.test/app/js/legacy/shared.js')).not.toBeNull();
    expect(await core.match(revisionedRequest.url)).toBeNull();
  });

  it('keeps active caches while an update waits, then cleans and claims on activation', async () => {
    const stores = new Map();
    const oldCore = 'symbaroum-%2Fapp%2F-pwa-v30-old-build-core';
    const fetchFresh = async request => new FetchResponse(
      request.url.includes('.html') ? '<!doctype html>' : '{}',
      {
        status: 200,
        headers: {
          'content-type': request.url.includes('.html') ? 'text/html' : 'application/json'
        }
      }
    );
    const worker = loadWorker(fetchFresh, {
      buildId: 'new-build',
      stores
    });
    await worker.caches.open(oldCore);

    await worker.dispatchExtendable('install');
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    expect(await worker.caches.keys()).toContain(oldCore);
    expect(await worker.caches.keys()).toContain(worker.api.CORE_CACHE);

    await worker.dispatchExtendable('activate');
    expect(await worker.caches.keys()).not.toContain(oldCore);
    expect(await worker.caches.keys()).toContain(worker.api.CORE_CACHE);
    expect(worker.claim).toHaveBeenCalledOnce();
  });

  it('never overwrites the canonical HTML shell with a non-HTML refresh', async () => {
    const requests = [];
    const { api, caches } = loadWorker(async (request, init) => {
      requests.push({ request, init });
      return fullPdfResponse();
    });
    const core = await caches.open(api.CORE_CACHE);
    const indexUrl = 'https://example.test/app/index.html';
    await core.put(indexUrl, new FetchResponse('<!doctype html><title>App</title>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    }));

    const navigation = await api.navigationStaleWhileRevalidate(
      new FetchRequest(indexUrl),
      'index.html'
    );
    expect(await navigation.response.text()).toContain('<!doctype html>');
    await navigation.refresh;
    expect(requests[0].init?.cache).toBe('reload');

    const cached = await core.match(indexUrl);
    expect(cached?.headers.get('content-type')).toContain('text/html');
    expect(await cached?.text()).toContain('<!doctype html>');
  });

  it('serves revisioned core bytes before a reload-mode runtime refresh', async () => {
    const requests = [];
    const { api, caches } = loadWorker(async (request, init) => {
      requests.push({ request, init });
      return new FetchResponse('window.runtimeVersion = "fresh-network";', {
        status: 200,
        headers: { 'content-type': 'application/javascript' }
      });
    });
    const scriptUrl = 'https://example.test/app/js/legacy/shared.js';
    const core = await caches.open(api.CORE_CACHE);
    await core.put(scriptUrl, new FetchResponse('window.runtimeVersion = "revisioned-core";', {
      status: 200,
      headers: { 'content-type': 'application/javascript' }
    }));

    const result = await api.staleWhileRevalidate(
      new FetchRequest(scriptUrl),
      `${api.SW_VERSION}-static`,
      [api.CORE_CACHE]
    );

    expect(await result.response.text()).toContain('revisioned-core');
    await result.refresh;
    expect(requests).toHaveLength(1);
    expect(requests[0].init?.cache).toBe('reload');
    const runtime = await caches.open(`${api.SW_VERSION}-static`);
    expect(await (await runtime.match(scriptUrl)).text()).toContain('fresh-network');
  });

  it('falls back to precached static bytes when the deployed URL now returns an error', async () => {
    const { api, caches } = loadWorker(async () => new FetchResponse('not found', {
      status: 404,
      headers: { 'content-type': 'text/plain' }
    }));
    const legacyUrl = 'https://example.test/app/assets/old-lazy-route.js';
    const core = await caches.open(api.CORE_CACHE);
    await core.put(legacyUrl, new FetchResponse('window.oldLazyRoute = true;', {
      status: 200,
      headers: { 'content-type': 'application/javascript' }
    }));

    const result = await api.staleWhileRevalidate(
      new FetchRequest(legacyUrl),
      `${api.SW_VERSION}-static`,
      [api.CORE_CACHE]
    );

    expect(result.response.status).toBe(200);
    expect(await result.response.text()).toContain('oldLazyRoute');
    await result.refresh;
  });

  it('synthesizes valid bounded and unsatisfiable byte ranges from a complete PDF', async () => {
    const { api } = loadWorker(async () => fullPdfResponse());

    const partial = await api.createPartialPdfResponse(fullPdfResponse(), 'bytes=0-99');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 0-99/256');
    expect(partial.headers.get('content-length')).toBe('100');
    expect(partial.headers.get('accept-ranges')).toBe('bytes');
    expect(new Uint8Array(await partial.arrayBuffer())).toHaveLength(100);

    const suffix = await api.createPartialPdfResponse(fullPdfResponse(), 'bytes=-16');
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe('bytes 240-255/256');

    const invalid = await api.createPartialPdfResponse(fullPdfResponse(), 'bytes=500-');
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('content-range')).toBe('bytes */256');

    const multiRange = await api.createPartialPdfResponse(fullPdfResponse(), 'bytes=0-9,20-29');
    expect(multiRange.status).toBe(200);
    expect(multiRange.headers.get('content-range')).toBeNull();
    expect(new Uint8Array(await multiRange.arrayBuffer())).toHaveLength(256);
  });

  it('passes through an upstream 206 and populates only a later complete response', async () => {
    const calls = [];
    const fullBytes = pdfBytes(512);
    const { api, caches } = loadWorker(async request => {
      const range = request.headers.get('range');
      calls.push(range);
      if (range) {
        return new FetchResponse(fullBytes.slice(0, 64), {
          status: 206,
          headers: {
            'content-type': 'application/pdf',
            'content-range': 'bytes 0-63/512'
          }
        });
      }
      return fullPdfResponse(fullBytes);
    });

    const request = new FetchRequest('https://example.test/app/pdf/rules.pdf', {
      headers: { Range: 'bytes=0-63' }
    });
    const result = await api.handlePdfRequest(request);
    expect(result.response.status).toBe(206);
    expect(result.response.headers.get('content-range')).toBe('bytes 0-63/512');
    await result.background;

    expect(calls).toEqual(['bytes=0-63', null]);
    const documentCache = await caches.open(api.DOCUMENT_CACHE);
    const cached = await documentCache.match(request.url);
    expect(cached?.status).toBe(200);
    expect(cached?.headers.get('content-type')).toContain('application/pdf');

    const offlineRange = await api.handlePdfRequest(new FetchRequest(request.url, {
      headers: { Range: 'bytes=100-199' }
    }));
    expect(offlineRange.response.status).toBe(206);
    expect(offlineRange.response.headers.get('content-range')).toBe('bytes 100-199/512');
    expect(calls).toHaveLength(2);
  });

  it('does not repopulate documents when a background full fetch finishes after clear', async () => {
    const fullBytes = pdfBytes(512);
    let releaseFullFetch;
    let markFullFetchStarted;
    const fullFetchGate = new Promise(resolve => { releaseFullFetch = resolve; });
    const fullFetchStarted = new Promise(resolve => { markFullFetchStarted = resolve; });
    const { api, caches } = loadWorker(async request => {
      if (request.headers.get('range')) {
        return new FetchResponse(fullBytes.slice(0, 64), {
          status: 206,
          headers: {
            'content-type': 'application/pdf',
            'content-range': 'bytes 0-63/512'
          }
        });
      }
      markFullFetchStarted();
      await fullFetchGate;
      return fullPdfResponse(fullBytes);
    }, { buildId: 'document-clear-test' });
    const request = new FetchRequest('https://example.test/app/pdf/rules.pdf', {
      headers: { Range: 'bytes=0-63' }
    });

    const result = await api.handlePdfRequest(request);
    await fullFetchStarted;
    await api.clearDocumentCache();
    releaseFullFetch();
    await result.background;

    const documents = await caches.open(api.DOCUMENT_CACHE);
    expect(await documents.keys()).toHaveLength(0);
  });

  it('migrates only complete PDFs into the build-scoped document cache', async () => {
    const stores = new Map();
    const worker = loadWorker(async () => new FetchResponse('unused'), {
      buildId: 'document-migration-test',
      stores
    });
    const legacyName = `${worker.api.SCOPE_CACHE_NAMESPACE}-documents-v2`;
    const legacy = await worker.caches.open(legacyName);
    const fullUrl = 'https://example.test/app/pdf/full.pdf';
    const partialUrl = 'https://example.test/app/pdf/partial.pdf';
    await legacy.put(fullUrl, fullPdfResponse());
    await legacy.put(partialUrl, new FetchResponse(pdfBytes(32), {
      status: 206,
      headers: { 'content-type': 'application/pdf' }
    }));

    await worker.dispatchExtendable('activate');

    const current = await worker.caches.open(worker.api.DOCUMENT_CACHE);
    expect(await current.match(fullUrl)).not.toBeNull();
    expect(await current.match(partialUrl)).toBeNull();
    expect(await worker.caches.keys()).not.toContain(legacyName);
  });

  it('deletes only caches owned by its registration scope', async () => {
    const { api, caches } = loadWorker(async () => new FetchResponse('not used'), {
      scope: 'https://example.test/app-a/'
    });
    const ownObsolete = `${api.SCOPE_CACHE_NAMESPACE}-pwa-v28-core`;
    const sibling = 'symbaroum-%2Fapp-b%2F-pwa-v29-core';
    await caches.open(api.CORE_CACHE);
    await caches.open(ownObsolete);
    await caches.open(sibling);
    await caches.open('unrelated-product-cache');

    await api.cleanupOldCaches();
    const keys = await caches.keys();
    expect(keys).toContain(api.CORE_CACHE);
    expect(keys).not.toContain(ownObsolete);
    expect(keys).toContain(sibling);
    expect(keys).toContain('unrelated-product-cache');
  });

  it('does not serve a prior build rule generation after activation', async () => {
    const stores = new Map();
    const oldFixture = await offlineResource('data/rules.json', '{"version":"old"}');
    const newFixture = await offlineResource('data/rules.json', '{"version":"new"}');
    const oldManifest = {
      revision: 'old-rule-generation',
      resources: [oldFixture.resource],
      totalBytes: oldFixture.resource.bytes
    };
    const newManifest = {
      revision: 'new-rule-generation',
      resources: [newFixture.resource],
      totalBytes: newFixture.resource.bytes
    };
    const oldWorker = loadWorker(async request => (
      request.url.endsWith('/data/offline-manifest.json')
        ? manifestResponse(oldManifest)
        : oldFixture.response()
    ), { buildId: 'old-build', stores });
    await oldWorker.dispatchExtendable('activate');
    await oldWorker.api.warmRulesCache({ force: false });
    expect((await oldWorker.api.offlineStatus()).status).toBe('ready');

    const networkRequests = [];
    const newWorker = loadWorker(async (request, init) => {
      networkRequests.push({ request, init });
      return request.url.endsWith('/data/offline-manifest.json')
        ? manifestResponse(newManifest)
        : newFixture.response();
    }, { buildId: 'new-build', stores });
    const newCore = await newWorker.caches.open(newWorker.api.CORE_CACHE);
    await newCore.put(
      'https://example.test/app/data/offline-manifest.json',
      manifestResponse(newManifest)
    );
    await newWorker.dispatchExtendable('activate');

    const ruleUrl = 'https://example.test/app/data/rules.json';
    const result = await newWorker.api.rulesAwareJson(new FetchRequest(ruleUrl));
    expect(await result.response.text()).toBe('{"version":"new"}');
    expect(networkRequests[0].init?.cache).toBe('reload');
    expect((await newWorker.api.offlineStatus()).status).toBe('missing');
    expect(oldWorker.api.rulesCacheName(oldManifest.revision))
      .not.toBe(newWorker.api.rulesCacheName(newManifest.revision));
  });

  it('migrates a fully verified unchanged rule generation across a UI-only build', async () => {
    const stores = new Map();
    const fixture = await offlineResource('data/rules.json', '{"version":"unchanged"}');
    const manifest = {
      revision: 'unchanged-rule-generation',
      resources: [fixture.resource],
      totalBytes: fixture.resource.bytes
    };
    const oldWorker = loadWorker(async request => (
      request.url.endsWith('/data/offline-manifest.json')
        ? manifestResponse(manifest)
        : fixture.response()
    ), { buildId: 'ui-old', stores });
    await oldWorker.dispatchExtendable('activate');
    await oldWorker.api.warmRulesCache({ force: false });
    const oldRulesName = oldWorker.api.rulesCacheName(manifest.revision);

    const newWorker = loadWorker(async () => {
      throw new Error('Compatible local migration should not fetch rule data.');
    }, { buildId: 'ui-new', stores });
    const newCore = await newWorker.caches.open(newWorker.api.CORE_CACHE);
    await newCore.put(
      'https://example.test/app/data/offline-manifest.json',
      manifestResponse(manifest)
    );
    await newWorker.dispatchExtendable('activate');

    expect((await newWorker.api.offlineStatus()).status).toBe('ready');
    const currentRulesName = newWorker.api.rulesCacheName(manifest.revision);
    const currentRules = await newWorker.caches.open(currentRulesName);
    expect(await (await currentRules.match('https://example.test/app/data/rules.json')).text())
      .toBe('{"version":"unchanged"}');
    expect(await newWorker.caches.keys()).not.toContain(oldRulesName);
  });

  it('fences an obsolete worker from committing or cleaning a newer rule generation', async () => {
    const stores = new Map();
    const oldFixture = await offlineResource('data/rules.json', '{"version":"old"}');
    const newFixture = await offlineResource('data/rules.json', '{"version":"new"}');
    const oldManifest = {
      revision: 'old-overlap',
      resources: [oldFixture.resource],
      totalBytes: oldFixture.resource.bytes
    };
    const newManifest = {
      revision: 'new-overlap',
      resources: [newFixture.resource],
      totalBytes: newFixture.resource.bytes
    };
    let releaseOldResource;
    const oldResourceGate = new Promise(resolve => { releaseOldResource = resolve; });
    let markOldResourceStarted;
    const oldResourceStarted = new Promise(resolve => { markOldResourceStarted = resolve; });
    const oldWorker = loadWorker(async request => {
      if (request.url.endsWith('/data/offline-manifest.json')) return manifestResponse(oldManifest);
      markOldResourceStarted();
      await oldResourceGate;
      return oldFixture.response();
    }, { buildId: 'overlap-old', stores });
    await oldWorker.dispatchExtendable('activate');
    const obsoleteWarm = oldWorker.api.warmRulesCache({ force: false });
    const obsoleteOutcome = obsoleteWarm.then(() => null, error => error);
    await oldResourceStarted;

    const newWorker = loadWorker(async request => (
      request.url.endsWith('/data/offline-manifest.json')
        ? manifestResponse(newManifest)
        : newFixture.response()
    ), { buildId: 'overlap-new', stores });
    await newWorker.dispatchExtendable('activate');
    await newWorker.api.warmRulesCache({ force: false });
    releaseOldResource();

    expect((await obsoleteOutcome)?.message).toMatch(/obsolete service worker generation/i);
    expect((await newWorker.api.offlineStatus()).status).toBe('ready');
    const currentRules = await newWorker.caches.open(newWorker.api.rulesCacheName(newManifest.revision));
    expect(await (await currentRules.match('https://example.test/app/data/rules.json')).text())
      .toBe('{"version":"new"}');
    const oldMeta = await oldWorker.caches.open(oldWorker.api.OFFLINE_META_CACHE);
    expect(await oldMeta.match(oldWorker.api.OFFLINE_STATUS_URL)).toBeNull();
  });

  it('queues a forced rules refresh and overwrites an existing cached response', async () => {
    const fixture = await offlineResource('data/rules.json', '{"entries":[]}');
    const manifest = {
      revision: 'rules-revision-1',
      resources: [fixture.resource],
      totalBytes: fixture.resource.bytes
    };
    let resourceFetches = 0;
    let releaseFirstFetch;
    const firstFetchGate = new Promise(resolve => { releaseFirstFetch = resolve; });
    const { api, caches } = loadWorker(async request => {
      if (request.url.endsWith('/data/offline-manifest.json')) return manifestResponse(manifest);
      if (request.url.endsWith('/data/rules.json')) {
        resourceFetches += 1;
        if (resourceFetches === 1) await firstFetchGate;
        return fixture.response();
      }
      throw new Error(`Unexpected fetch: ${request.url}`);
    });

    const normalWarm = api.warmRulesCache({ force: false });
    await vi.waitFor(() => expect(resourceFetches).toBe(1));
    const forcedWarm = api.warmRulesCache({ force: true });
    releaseFirstFetch();
    await normalWarm;
    await forcedWarm;
    expect(resourceFetches).toBe(2);

    const cacheName = api.rulesCacheName(manifest.revision);
    const cache = await caches.open(cacheName);
    const resourceUrl = 'https://example.test/app/data/rules.json';
    await cache.put(resourceUrl, new FetchResponse('<html>poisoned</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    }));
    await api.warmRulesCache({ force: true });
    expect(resourceFetches).toBe(3);
    const repaired = await cache.match(resourceUrl);
    expect(repaired?.headers.get('content-type')).toContain('application/json');
    expect(repaired?.headers.get('x-symbaroum-revision')).toBe(fixture.resource.revision);
    expect(await repaired?.text()).toBe('{"entries":[]}');
  });

  it('rejects non-JSON and checksum-mismatched rule responses', async () => {
    const expected = await offlineResource('data/rules.json', '{"a":1}');
    const manifest = {
      revision: 'rules-revision-2',
      resources: [expected.resource],
      totalBytes: expected.resource.bytes
    };

    const htmlWorker = loadWorker(async request => (
      request.url.endsWith('/data/offline-manifest.json')
        ? manifestResponse(manifest)
        : new FetchResponse('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
    ));
    await expect(htmlWorker.api.warmRulesCache({ force: true })).rejects.toThrow(/content-type|text\/html/i);

    const checksumWorker = loadWorker(async request => (
      request.url.endsWith('/data/offline-manifest.json')
        ? manifestResponse(manifest)
        : new FetchResponse('{"a":2}', { status: 200, headers: { 'content-type': 'application/json' } })
    ));
    await expect(checksumWorker.api.warmRulesCache({ force: true })).rejects.toThrow(/checksum mismatch/i);
  });

  it('downgrades stale ready metadata when a warmed resource disappears', async () => {
    const fixture = await offlineResource('data/rules.json', '{"entries":[]}');
    const manifest = {
      revision: 'rules-revision-3',
      resources: [fixture.resource],
      totalBytes: fixture.resource.bytes
    };
    const { api, caches } = loadWorker(async request => (
      request.url.endsWith('/data/offline-manifest.json') ? manifestResponse(manifest) : fixture.response()
    ));
    await api.warmRulesCache({ force: false });
    expect((await api.offlineStatus()).status).toBe('ready');

    const rules = await caches.open(api.rulesCacheName(manifest.revision));
    await rules.delete('https://example.test/app/data/rules.json');
    expect((await api.offlineStatus()).status).toBe('missing');
    const meta = await caches.open(api.OFFLINE_META_CACHE);
    expect(await meta.match(api.OFFLINE_STATUS_URL)).toBeNull();
  });
});
