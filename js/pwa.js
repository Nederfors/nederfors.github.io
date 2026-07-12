if ('serviceWorker' in navigator) {
  let reloadOnControllerChange = false;
  let latestRegistration = null;
  let registrationStarted = false;
  let lastUpdateCheckAt = 0;
  const storageKeyPrefix = 'pwa-dismissed:';
  const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
  const REGISTRATION_IDLE_TIMEOUT_MS = 4000;
  const REGISTRATION_START_DELAY_MS = 2500;
  const APP_READY_TIMEOUT_MS = 6000;

  const buildStorageKey = id => (id ? `${storageKeyPrefix}${id}` : null);

  const getStorages = () => {
    const storages = [];
    try {
      if (window.sessionStorage) {
        storages.push(window.sessionStorage);
      }
    } catch (error) {
      // Access to sessionStorage may be blocked; ignore.
    }
    try {
      if (window.localStorage) {
        storages.push(window.localStorage);
      }
    } catch (error) {
      // Access to localStorage may be blocked; ignore.
    }
    return storages;
  };

  const clearDismissalsExcept = id => {
    const keyToKeep = buildStorageKey(id);
    getStorages().forEach(storage => {
      try {
        for (let i = storage.length - 1; i >= 0; i -= 1) {
          const key = storage.key(i);
          if (key && key.startsWith(storageKeyPrefix) && key !== keyToKeep) {
            storage.removeItem(key);
          }
        }
      } catch (error) {
        // Ignore storage errors.
      }
    });
  };

  const clearWorkerDismissal = id => {
    if (!id) return;
    const key = buildStorageKey(id);
    getStorages().forEach(storage => {
      try {
        storage.removeItem(key);
      } catch (error) {
        // Ignore storage errors.
      }
    });
  };

  const markWorkerDismissed = id => {
    if (!id) return;
    const key = buildStorageKey(id);
    getStorages().forEach(storage => {
      try {
        storage.setItem(key, '1');
      } catch (error) {
        // Ignore storage errors.
      }
    });
  };

  const isWorkerDismissed = id => {
    if (!id) return false;
    const key = buildStorageKey(id);
    return getStorages().some(storage => {
      try {
        return storage.getItem(key) === '1';
      } catch (error) {
        return false;
      }
    });
  };

  const clearAllWorkerDismissals = () => {
    clearDismissalsExcept(null);
  };

  const runWhenIdle = callback => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(callback, { timeout: REGISTRATION_IDLE_TIMEOUT_MS });
      return;
    }
    window.setTimeout(callback, 800);
  };

  const waitForAppReady = () => new Promise(resolve => {
    if (window.__symbaroumBootCompleted || !document.documentElement.hasAttribute('data-preload')) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('symbaroum-view-boot', finish);
      resolve();
    };
    window.addEventListener('symbaroum-view-boot', finish, { once: true });
    window.setTimeout(finish, APP_READY_TIMEOUT_MS);
  });

  const maybeUpdateRegistration = async (registration, { force = false } = {}) => {
    if (!registration || typeof registration.update !== 'function') return null;
    const now = Date.now();
    if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) {
      return null;
    }
    lastUpdateCheckAt = now;
    try {
      return await registration.update();
    } catch (error) {
      console.warn('Service worker update check failed', error);
      return null;
    }
  };

  const flushPendingWrites = async reason => {
    try {
      await window.symbaroumPersistence?.flushPendingWrites?.({ reason });
    } catch (error) {
      console.error(`Failed to flush pending writes for ${reason}`, error);
    }
  };

  const applyWaitingWorker = async registration => {
    if (!registration?.waiting) return false;
    await flushPendingWrites('pwa-update');
    reloadOnControllerChange = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  };

  const waitForInstallingWorker = registration =>
    new Promise(resolve => {
      const installing = registration.installing;
      if (!installing) {
        resolve(registration.waiting || null);
        return;
      }

      let settled = false;
      let timeoutId;
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const onStateChange = () => {
        if (installing.state === 'installed' || installing.state === 'redundant') {
          finish(registration.waiting || null);
        }
      };

      const onUpdateFound = () => {
        const newWorker = registration.installing;
        if (!newWorker || newWorker === installing) return;
        newWorker.addEventListener('statechange', onStateChange);
      };

      const cleanup = () => {
        installing.removeEventListener('statechange', onStateChange);
        registration.removeEventListener('updatefound', onUpdateFound);
        if (timeoutId) clearTimeout(timeoutId);
      };

      registration.addEventListener('updatefound', onUpdateFound);
      installing.addEventListener('statechange', onStateChange);

      timeoutId = setTimeout(() => {
        finish(registration.waiting || null);
      }, 10000);

      if (installing.state === 'installed') {
        finish(registration.waiting || null);
      }
    });

  const postMessageToWorker = (worker, message, { timeout = 15000 } = {}) =>
    new Promise(resolve => {
      if (typeof MessageChannel === 'undefined') {
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }

      if (!worker || typeof worker.postMessage !== 'function') {
        resolve({ ok: false, reason: 'no-worker' });
        return;
      }

      const channel = new MessageChannel();
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        try {
          channel.port1.close();
        } catch (error) {
          // Ignore close errors.
        }
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        finish({ ok: false, reason: 'timeout' });
      }, timeout);

      channel.port1.onmessage = event => {
        finish(event.data);
      };

      try {
        worker.postMessage(message, [channel.port2]);
      } catch (error) {
        finish({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

  const getLatestWorkerVersion = async registration => {
    const worker = registration?.waiting
      || registration?.installing
      || registration?.active
      || navigator.serviceWorker.controller
      || null;
    const response = await postMessageToWorker(
      worker,
      { type: 'GET_VERSION' },
      { timeout: 3000 }
    );
    if (response?.ok && response?.version) {
      return response.version;
    }
    return worker?.scriptURL || 'sw.js';
  };

  const resolveCacheRefreshWorker = registration =>
    navigator.serviceWorker.controller
    || registration?.active
    || registration?.waiting
    || registration?.installing
    || null;

  const requestCacheRefresh = async registration => {
    const worker = resolveCacheRefreshWorker(registration);
    const response = await postMessageToWorker(
      worker,
      { type: 'FORCE_REFRESH_CACHE' },
      { timeout: 45000 }
    );
    if (response?.ok) {
      return { status: 'refreshed' };
    }

    if (response?.reason === 'no-worker' || response?.reason === 'unsupported') {
      return { status: 'unavailable' };
    }

    const errorMessage = response?.error || response?.reason || 'unknown';
    return { status: 'failed', error: errorMessage };
  };

  const triggerManualUpdate = async options => {
    const { forceReload } = options || {};
    try {
      if (forceReload) {
        await flushPendingWrites('pwa-update-check');
      }
      let registration = latestRegistration || (await navigator.serviceWorker.getRegistration());
      if (!registration) {
        try {
          registration = await navigator.serviceWorker.ready;
        } catch {
          registration = null;
        }
      }
      if (!registration) {
        const result = { status: 'missing' };
        if (forceReload) {
          result.cacheRefresh = { status: 'unavailable' };
        }
        return result;
      }
      latestRegistration = registration;

      let status;
      if (registration.waiting) {
        await applyWaitingWorker(registration);
        status = 'applied';
      } else {
        await maybeUpdateRegistration(registration, { force: true });
        const waiting = await waitForInstallingWorker(registration);
        if (waiting) {
          await applyWaitingWorker(registration);
          status = 'applied';
        } else {
          status = 'up-to-date';
        }
      }

      const result = { status };
      if (forceReload) {
        result.cacheRefresh = await requestCacheRefresh(registration);
      }

      return result;
    } catch (error) {
      const result = { status: 'error', error };
      if (forceReload) {
        result.cacheRefresh = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }
      return result;
    }
  };

  window.requestPwaUpdate = triggerManualUpdate;

  const onControllerChange = () => {
    clearAllWorkerDismissals();
    if (onControllerChange.refreshing) return;
    if (reloadOnControllerChange) {
      onControllerChange.refreshing = true;
      window.location.reload();
    }
  };
  onControllerChange.refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  const startServiceWorkerRegistration = () => {
    if (registrationStarted) return;
    registrationStarted = true;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(registration => {
      latestRegistration = registration;
      // Check for updates, but do not do it on every foreground transition.
      maybeUpdateRegistration(registration);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          maybeUpdateRegistration(registration);
        }
      });

      // If there's already a waiting worker, prompt immediately
      const promptUserToRefresh = async reg => {
        if (!reg) return;
        const waitingWorker = reg.waiting;
        if (!waitingWorker) return;
        const version = await getLatestWorkerVersion(reg);
        const dismissId = version || waitingWorker.scriptURL;

        clearDismissalsExcept(dismissId);

        if (!navigator.serviceWorker.controller) {
          return;
        }

        if (dismissId && isWorkerDismissed(dismissId)) {
          return;
        }

        const shouldReload = window.confirm('Ny version tillgänglig – Ladda om?');
        if (shouldReload) {
          if (dismissId) {
            clearWorkerDismissal(dismissId);
          }
          await applyWaitingWorker(reg);
        } else if (dismissId) {
          markWorkerDismissed(dismissId);
        }
      };

      const listenForWaitingServiceWorker = reg => {
        if (!reg) return;
        if (reg.waiting) {
          // An update is ready
          promptUserToRefresh(reg);
          return;
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', async () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New update installed and waiting
              promptUserToRefresh(reg);
            }
          });
        });
      };

      listenForWaitingServiceWorker(registration);
    });
  };

  const scheduleServiceWorkerRegistration = () => {
    waitForAppReady().then(() => {
      window.setTimeout(() => {
        runWhenIdle(startServiceWorkerRegistration);
      }, REGISTRATION_START_DELAY_MS);
    });
  };

  if (document.readyState === 'complete') {
    scheduleServiceWorkerRegistration();
  } else {
    window.addEventListener('load', scheduleServiceWorkerRegistration, { once: true });
  }
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  window.deferredPrompt = deferredPrompt;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  window.deferredPrompt = null;
});
