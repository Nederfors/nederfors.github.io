if ('serviceWorker' in navigator) {
  let reloadOnControllerChange = false;
  window.addEventListener('load', () => {
    const storageKeyPrefix = 'pwa-dismissed:';
    const buildStorageKey = scriptURL => `${storageKeyPrefix}${scriptURL}`;

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

    const clearDismissalsExcept = scriptURL => {
      const keyToKeep = scriptURL ? buildStorageKey(scriptURL) : null;
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

    const clearWorkerDismissal = scriptURL => {
      if (!scriptURL) return;
      const key = buildStorageKey(scriptURL);
      getStorages().forEach(storage => {
        try {
          storage.removeItem(key);
        } catch (error) {
          // Ignore storage errors.
        }
      });
    };

    const clearAllWorkerDismissals = () => {
      clearDismissalsExcept(null);
    };

    const isWorkerDismissed = scriptURL => {
      if (!scriptURL) return false;
      const key = buildStorageKey(scriptURL);
      return getStorages().some(storage => {
        try {
          return storage.getItem(key) === '1';
        } catch (error) {
          return false;
        }
      });
    };

    const markWorkerDismissed = scriptURL => {
      if (!scriptURL) return;
      const key = buildStorageKey(scriptURL);
      getStorages().forEach(storage => {
        try {
          storage.setItem(key, '1');
        } catch (error) {
          // Ignore storage errors.
        }
      });
    };

    navigator.serviceWorker.register('sw.js').then(registration => {
      // Proactively check for updates
      registration.update();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          registration.update();
        }
      });

      // If there's already a waiting worker, prompt immediately
      const promptUserToRefresh = reg => {
        if (!reg) return;
        const waitingWorker = reg.waiting;
        if (!waitingWorker) return;
        const { scriptURL } = waitingWorker;

        clearDismissalsExcept(scriptURL);

        if (!navigator.serviceWorker.controller) {
          return;
        }

        if (scriptURL && isWorkerDismissed(scriptURL)) {
          return;
        }

        const shouldReload = window.confirm('Ny version tillgänglig – Ladda om?');
        if (shouldReload) {
          if (scriptURL) {
            clearWorkerDismissal(scriptURL);
          }
          reloadOnControllerChange = true;
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        } else if (scriptURL) {
          markWorkerDismissed(scriptURL);
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
          newWorker.addEventListener('statechange', () => {
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
