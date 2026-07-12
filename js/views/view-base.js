import { ensureRouteScripts, normalizeRole } from '../shell/legacy-loader.js';
import viewBridge from '../shell/view-bridge.js';

export function createLegacyView(role) {
  let mountedRoot = null;
  const normalizedRole = normalizeRole(role);

  return {
    async mount(root = document.body, detail = {}) {
      mountedRoot = root || document.body;
      if (mountedRoot) {
        mountedRoot.dataset.activeView = normalizedRole;
      }
      if (normalizedRole !== 'index' && typeof window.ensureFullDatabase === 'function') {
        await window.ensureFullDatabase();
      }
      await ensureRouteScripts(normalizedRole);
      viewBridge.mount(normalizedRole, detail);
      return mountedRoot;
    },
    destroy() {
      if (mountedRoot?.dataset?.activeView === normalizedRole) {
        mountedRoot.removeAttribute('data-active-view');
      }
      mountedRoot = null;
    }
  };
}
