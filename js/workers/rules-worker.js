import { expose } from '../vendor/comlink.mjs';
import { computeDerivedCharacter, filterEntries } from './rules-runtime.js';

let legacyRuntimePromise = null;

function createStorageShim() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    }
  };
}

function installWorkerGlobals() {
  if (!globalThis.window) {
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true
    });
  }
  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageShim(),
      configurable: true
    });
  }
  if (!globalThis.sessionStorage) {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: createStorageShim(),
      configurable: true
    });
  }
}

async function ensureLegacyRuntime() {
  if (!legacyRuntimePromise) {
    legacyRuntimePromise = (async () => {
      installWorkerGlobals();
      await import('../utils.js');
      await import('../rules-helper.js');
      await import('../store.js');
      return {
        storeHelper: globalThis.storeHelper,
        searchNormalize: globalThis.searchNormalize
      };
    })();
  }
  return legacyRuntimePromise;
}

const api = {
  async ping() {
    await ensureLegacyRuntime();
    return {
      ready: true,
      type: 'rules-worker'
    };
  },

  async computeDerivedCharacter(payload) {
    const runtime = await ensureLegacyRuntime();
    return computeDerivedCharacter(payload, runtime);
  },

  async filterEntries(payload) {
    const runtime = await ensureLegacyRuntime();
    return filterEntries(payload, runtime);
  }
};

expose(api);
