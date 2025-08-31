if ('serviceWorker' in navigator) {
  let reloadOnControllerChange = false;
  window.addEventListener('load', () => {
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
        const shouldReload = window.confirm('Ny version tillgänglig – Ladda om?');
        if (shouldReload) {
          reloadOnControllerChange = true;
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
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
