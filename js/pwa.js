if ('serviceWorker' in navigator) {
  let reloadOnControllerChange = false;
  let latestRegistration = null;
  const storageKeyPrefix = 'pwa-dismissed:';

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

  const getLatestWorkerVersion = async () => {
    try {
      const response = await fetch('sw.js', { cache: 'no-store' });
      const text = await response.text();
      const match = text.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
      if (match) return match[1];
    } catch (error) {
      // Ignore version lookup errors.
    }
    return null;
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

  const applyWaitingWorker = registration => {
    if (!registration?.waiting) return false;
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

  const postMessageToController = (message, { timeout = 15000 } = {}) =>
    new Promise(resolve => {
      if (typeof MessageChannel === 'undefined') {
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }

      const controller = navigator.serviceWorker.controller;
      if (!controller) {
        resolve({ ok: false, reason: 'no-controller' });
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
        controller.postMessage(message, [channel.port2]);
      } catch (error) {
        finish({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

  const requestCacheRefresh = async () => {
    const response = await postMessageToController({ type: 'FORCE_REFRESH_CACHE' });
    if (response?.ok) {
      return { status: 'refreshed' };
    }

    if (response?.reason === 'no-controller' || response?.reason === 'unsupported') {
      return { status: 'unavailable' };
    }

    const errorMessage = response?.error || response?.reason || 'unknown';
    return { status: 'failed', error: errorMessage };
  };

  const triggerManualUpdate = async options => {
    const { forceReload } = options || {};
    try {
      const registration = latestRegistration || (await navigator.serviceWorker.getRegistration());
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
        applyWaitingWorker(registration);
        status = 'applied';
      } else {
        await registration.update();
        const waiting = await waitForInstallingWorker(registration);
        if (waiting) {
          applyWaitingWorker(registration);
          status = 'applied';
        } else {
          status = 'up-to-date';
        }
      }

      const result = { status };
      if (forceReload) {
        result.cacheRefresh = await requestCacheRefresh();
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

  window.addEventListener('load', () => {

    navigator.serviceWorker.register('sw.js').then(registration => {
      latestRegistration = registration;
      // Proactively check for updates
      registration.update();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          registration.update();
        }
      });

      // If there's already a waiting worker, prompt immediately
      const promptUserToRefresh = async reg => {
        if (!reg) return;
        const waitingWorker = reg.waiting;
        if (!waitingWorker) return;
        const version = await getLatestWorkerVersion();
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
          applyWaitingWorker(reg);
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

    // When the controller changes after SKIP_WAITING, reload once
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      clearAllWorkerDismissals();
      if (refreshing) return;
      if (reloadOnControllerChange) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
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
