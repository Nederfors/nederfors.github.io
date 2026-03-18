import * as Comlink from '../vendor/comlink.mjs';
import { computeDerivedCharacter, filterEntries } from './rules-runtime.js';

let workerInstance = null;
let workerProxyPromise = null;
let initError = null;

function getRuntimeOptions() {
  return {
    storeHelper: window.storeHelper || null,
    searchNormalize: window.searchNormalize || null
  };
}

async function createWorkerProxy() {
  const worker = new Worker(new URL('./rules-worker.js', import.meta.url), {
    type: 'module',
    name: 'symbaroum-rules-worker'
  });
  workerInstance = worker;
  const proxy = Comlink.wrap(worker);
  await proxy.ping();
  return proxy;
}

async function ensureWorkerProxy() {
  if (!workerProxyPromise) {
    workerProxyPromise = createWorkerProxy().catch(error => {
      initError = error;
      workerProxyPromise = null;
      if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
      }
      throw error;
    });
  }
  return workerProxyPromise;
}

const rulesClient = {
  mode: 'worker',
  ready: false,

  async init() {
    try {
      await ensureWorkerProxy();
      this.mode = 'worker';
      this.ready = true;
      initError = null;
      return true;
    } catch (error) {
      initError = error;
      this.mode = 'fallback';
      this.ready = true;
      console.error('Failed to start rules worker, falling back to main thread', error);
      return false;
    }
  },

  computeDerivedCharacterSync(payload) {
    return computeDerivedCharacter(payload, getRuntimeOptions());
  },

  filterEntriesSync(payload) {
    return filterEntries(payload, getRuntimeOptions());
  },

  async computeDerivedCharacter(payload) {
    try {
      const proxy = await ensureWorkerProxy();
      this.mode = 'worker';
      this.ready = true;
      return await proxy.computeDerivedCharacter(payload);
    } catch (error) {
      initError = error;
      this.mode = 'fallback';
      this.ready = true;
      return this.computeDerivedCharacterSync(payload);
    }
  },

  async filterEntries(payload) {
    try {
      const proxy = await ensureWorkerProxy();
      this.mode = 'worker';
      this.ready = true;
      return await proxy.filterEntries(payload);
    } catch (error) {
      initError = error;
      this.mode = 'fallback';
      this.ready = true;
      return this.filterEntriesSync(payload);
    }
  },

  getLastError() {
    return initError;
  },

  terminate() {
    if (workerInstance) {
      workerInstance.terminate();
      workerInstance = null;
    }
    workerProxyPromise = null;
    initError = null;
    this.mode = 'worker';
    this.ready = false;
  }
};

window.symbaroumRulesWorker = rulesClient;

export default rulesClient;
