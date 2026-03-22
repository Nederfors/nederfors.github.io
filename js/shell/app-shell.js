export function createAppShell() {
  let mountedRoot = null;

  return {
    mount(root = document.body, role = '') {
      mountedRoot = root || document.body;
      document.documentElement.dataset.appShell = 'daub-pwa';
      document.documentElement.dataset.viewRole = role;
      if (mountedRoot) {
        mountedRoot.classList.add('app-shell');
        mountedRoot.dataset.appRole = role;
      }
      if (typeof DAUB !== 'undefined') {
        DAUB.init();
        DAUB.setFamily('ember');
        DAUB.setScheme('dark');
      }
      return mountedRoot;
    },
    destroy() {
      if (mountedRoot) {
        mountedRoot.classList.remove('app-shell');
        mountedRoot.removeAttribute('data-app-role');
      }
      delete document.documentElement.dataset.viewRole;
      mountedRoot = null;
    }
  };
}
