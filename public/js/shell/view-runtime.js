import { createAppShell } from './app-shell.js';
import { VIEW_TEMPLATES, getViewTitle } from './view-templates.js';
import { normalizeRole } from './legacy-loader.js';
import router from './router.js';

const VIEW_MODULE_LOADERS = Object.freeze({
  index: () => import('../views/index.js'),
  character: () => import('../views/character.js'),
  inventory: () => import('../views/inventory.js'),
  notes: () => import('../views/notes.js'),
  traits: () => import('../views/traits.js')
});

export function createViewRuntime() {
  const shell = createAppShell();
  let currentRole = '';
  let activeView = null;
  let routeUnsubscribe = null;
  let routeSequence = 0;

  function getViewRoot() {
    return document.getElementById('view-root') || document.body;
  }

  function syncDocumentTitle(role, tab = null) {
    document.title = getViewTitle(role, tab);
  }

  function swapViewDOM(role, tab = null) {
    const viewRoot = getViewRoot();
    const template = VIEW_TEMPLATES[role];
    if (template && viewRoot) {
      viewRoot.innerHTML = template;
    }
    // Update body data-role for legacy code
    document.body.dataset.role = role;
    // Update document title
    syncDocumentTitle(role, tab);
  }

  function refreshLegacyDom() {
    if (typeof window.refreshDomReferences === 'function') {
      window.refreshDomReferences();
    }
  }

  function syncPerfContext(role) {
    window.symbaroumPerf?.setContext?.({ role });
  }

  function resolveNavigationPerf(role) {
    const perf = window.symbaroumPerf;
    if (!perf) return;
    perf.setContext?.({ role });
    perf.resolveQueuedScenarios?.({ role });
  }

  /**
   * Synchronous view swap. All legacy init functions are already loaded
   * as classic scripts, so we call mountLegacyViewByRole directly
   * instead of going through async dynamic imports.
   */
  async function loadView(role) {
    const normalizedRole = normalizeRole(role);
    const loader = VIEW_MODULE_LOADERS[normalizedRole] || VIEW_MODULE_LOADERS.index;
    const module = await loader();
    return module?.default || null;
  }

  async function mountRole(role, tab) {
    const normalizedRole = normalizeRole(role);
    const sameRole = currentRole === normalizedRole;

    // Tab-only change within same role (e.g. traits ↔ summary ↔ effects)
    if (sameRole) {
      syncDocumentTitle(normalizedRole, tab);
      syncPerfContext(normalizedRole);
      if (normalizedRole === 'traits' && tab && window.summaryEffects?.activateTraitsTab) {
        window.summaryEffects.activateTraitsTab(tab);
      }
      const toolbar = document.querySelector('shared-toolbar');
      if (toolbar?.updateToolbarLinks) toolbar.updateToolbarLinks();
      return;
    }

    const sequence = ++routeSequence;
    const prev = currentRole;
    const nextView = await loadView(normalizedRole);
    if (sequence !== routeSequence) return;

    // Flush pending writes in the background — don't block the swap
    if (prev) {
      try {
        window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'route-change' });
      } catch {}
    }

    // --- Synchronous swap: no gaps, no flashes ---
    currentRole = normalizedRole;

    // 1. Replace view DOM
    swapViewDOM(normalizedRole, tab);

    // 2. Update shell attributes (keeps app-shell class, updates data-viewRole etc.)
    shell.mount(document.body, normalizedRole);

    // 3. Refresh main.js DOM references so they point to the new elements
    refreshLegacyDom();

    // 4. Auto-resize textareas in the new view
    window.autoResizeAll?.(document);

    // 5. Mount the route view via the module entrypoint
    if (activeView?.destroy) {
      activeView.destroy();
    }
    activeView = nextView;
    await activeView?.mount?.(document.body, {
      role: normalizedRole,
      previousRole: prev,
      tab
    });
    if (sequence !== routeSequence) return;

    // 6. Activate traits tab if entering via summary/effects alias
    if (normalizedRole === 'traits' && tab && window.summaryEffects?.activateTraitsTab) {
      window.summaryEffects.activateTraitsTab(tab);
    }

    // 7. Scroll to top on cross-view navigation
    if (prev && prev !== normalizedRole) {
      window.scrollTo(0, 0);
    }

    // 8. Update toolbar active link
    const toolbar = document.querySelector('shared-toolbar');
    if (toolbar?.updateToolbarLinks) {
      toolbar.updateToolbarLinks();
    }

    // 9. Re-register overlay observers for new DOM elements
    if (typeof window.registerOverlayElement === 'function') {
      const viewRoot = getViewRoot();
      viewRoot?.querySelectorAll?.('.popup, .offcanvas')?.forEach(el => {
        window.registerOverlayElement(el);
      });
    }

    resolveNavigationPerf(normalizedRole);
  }

  return {
    mountCurrentView({ role = document.body?.dataset?.role || '', root = document.body } = {}) {
      const nextRole = String(role || '').trim();
      // If already mounted for this role, skip
      if (currentRole === nextRole) {
        syncDocumentTitle(nextRole, router.currentTab);
        return;
      }

      // For initial mount, don't swap DOM (already injected by bootstrap)
      currentRole = nextRole;
      shell.mount(root, currentRole);
      syncDocumentTitle(currentRole, router.currentTab);
      syncPerfContext(currentRole);
    },

    mountRoute(role, tab) {
      return mountRole(role, tab);
    },

    destroyCurrentView() {
      currentRole = '';
      activeView?.destroy?.();
      activeView = null;
      shell.destroy();
    },

    startRouting() {
      if (routeUnsubscribe) return;
      routeUnsubscribe = router.onRouteChange((next) => {
        void mountRole(next.role, next.tab);
      });
    },

    stopRouting() {
      if (routeUnsubscribe) {
        routeUnsubscribe();
        routeUnsubscribe = null;
      }
    },

    get currentRole() { return currentRole; }
  };
}
