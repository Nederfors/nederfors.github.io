if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(registration => {
      registration.update();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          registration.update();
        }
      });
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
