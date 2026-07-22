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

const VIEW_SCROLL_STORAGE_KEY = 'symbaroumViewScrollPositions';

function loadViewScrollPositions() {
  try {
    const saved = JSON.parse(window.sessionStorage?.getItem(VIEW_SCROLL_STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

export function createViewRuntime() {
  const shell = createAppShell();
  const viewScrollPositions = loadViewScrollPositions();
  const observedScrollPositions = {};
  let currentRole = '';
  let activeView = null;
  let routeUnsubscribe = null;
  let routeSequence = 0;
  let navigationScrollCapture = null;
  let scrollObservationFrame = 0;

  function rememberScrollPosition(role = currentRole) {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) return;
    viewScrollPositions[normalizedRole] = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
    try {
      window.sessionStorage?.setItem(VIEW_SCROLL_STORAGE_KEY, JSON.stringify(viewScrollPositions));
    } catch {}
  }

  function observeCurrentScroll() {
    if (!currentRole || normalizeRole(router.parseHash().role) !== currentRole) return;
    const top = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
    if (observedScrollPositions[currentRole] === top) return;
    observedScrollPositions[currentRole] = top;
    viewScrollPositions[currentRole] = top;
  }

  window.addEventListener('scroll', observeCurrentScroll, { passive: true });
  const observeScrollFrame = () => {
    observeCurrentScroll();
    scrollObservationFrame = window.requestAnimationFrame(observeScrollFrame);
  };
  scrollObservationFrame = window.requestAnimationFrame(observeScrollFrame);

  function captureRouteLinkScroll(event) {
    const routeLink = event.composedPath?.().find(node => (
      node?.tagName === 'A'
      && String(node.getAttribute?.('href') || '').startsWith('#/')
    ));
    if (!routeLink || !currentRole) return;
    const top = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
    navigationScrollCapture = { role: currentRole, top };
    viewScrollPositions[currentRole] = top;
    try {
      window.sessionStorage?.setItem(VIEW_SCROLL_STORAGE_KEY, JSON.stringify(viewScrollPositions));
    } catch {}
  }

  const routeCaptureEvents = ['pointerdown', 'touchstart', 'click'];
  routeCaptureEvents.forEach(type => window.addEventListener(type, captureRouteLinkScroll, true));
  const captureRouterScroll = () => {
    observeCurrentScroll();
    if (currentRole) rememberScrollPosition(currentRole);
  };
  window.addEventListener('symbaroum-before-route-change', captureRouterScroll);

  function afterLayout() {
    return new Promise(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }

  async function waitForRoleLayout(role) {
    if (role === 'index') {
      const firstRender = window.__symbaroumIndexFirstRender;
      if (firstRender && typeof firstRender.then === 'function') {
        let timeoutId = 0;
        try {
          await Promise.race([
            firstRender,
            new Promise(resolve => {
              timeoutId = window.setTimeout(resolve, 4000);
            })
          ]);
        } finally {
          if (timeoutId) window.clearTimeout(timeoutId);
        }
      }
    }
    await afterLayout();
  }

  async function restoreScrollPosition(role, savedPosition = viewScrollPositions[role]) {
    const saved = Number(savedPosition);
    const top = Number.isFinite(saved) && saved > 0 ? saved : 0;
    await waitForRoleLayout(role);
    const cancelEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    let cancelled = false;
    let remainingFrames = 45;
    const cancel = () => {
      cancelled = true;
      cancelEvents.forEach(type => window.removeEventListener(type, cancel));
    };
    const keepPosition = () => {
      if (cancelled) return;
      window.scrollTo(0, top);
      remainingFrames -= 1;
      if (remainingFrames > 0) {
        window.requestAnimationFrame(keepPosition);
      } else {
        cancel();
      }
    };
    cancelEvents.forEach(type => window.addEventListener(type, cancel, { once: true, passive: true }));
    keepPosition();
  }

  function getViewRoot() {
    return document.getElementById('view-root') || document.body;
  }

  function setViewBusy(isBusy) {
    const viewRoot = getViewRoot();
    if (viewRoot && viewRoot !== document.body) {
      viewRoot.setAttribute('aria-busy', String(Boolean(isBusy)));
    }
  }

  function focusViewRoot() {
    const viewRoot = getViewRoot();
    if (!viewRoot || viewRoot === document.body) return;
    window.requestAnimationFrame(() => {
      try { viewRoot.focus({ preventScroll: true }); } catch { viewRoot.focus?.(); }
    });
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
    const targetScrollPosition = viewScrollPositions[normalizedRole];
    const sameRole = currentRole === normalizedRole;

    // Route transitions own the timing of teardown; popupManager owns every
    // overlay state mutation and cleanup performed by that teardown.
    window.popupManager?.closeAll?.('route-change', { suppressFocus: true });

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
    if (prev) {
      if (Object.prototype.hasOwnProperty.call(observedScrollPositions, prev)) {
        viewScrollPositions[prev] = observedScrollPositions[prev];
        try {
          window.sessionStorage?.setItem(VIEW_SCROLL_STORAGE_KEY, JSON.stringify(viewScrollPositions));
        } catch {}
        navigationScrollCapture = null;
      } else if (navigationScrollCapture?.role === prev) {
        viewScrollPositions[prev] = navigationScrollCapture.top;
        navigationScrollCapture = null;
      } else {
        rememberScrollPosition(prev);
      }
    }
    setViewBusy(true);
    let nextView;
    try {
      nextView = await loadView(normalizedRole);
    } catch (error) {
      if (sequence !== routeSequence) return;
      setViewBusy(false);
      window.__symbaroumShowLoadError?.('Den valda vyn kunde inte laddas. Kontrollera anslutningen och försök igen.');
      throw error;
    }
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
    try {
      await activeView?.mount?.(document.body, {
        role: normalizedRole,
        previousRole: prev,
        tab
      });
    } catch (error) {
      if (sequence !== routeSequence) return;
      setViewBusy(false);
      window.__symbaroumShowLoadError?.('Vyns data kunde inte laddas. Kontrollera anslutningen och försök igen.');
      throw error;
    }
    if (sequence !== routeSequence) return;

    // 6. Activate traits tab if entering via summary/effects alias
    if (normalizedRole === 'traits' && tab && window.summaryEffects?.activateTraitsTab) {
      window.summaryEffects.activateTraitsTab(tab);
    }

    // 7. Restore each view's last position after its layout is ready
    if (prev && prev !== normalizedRole) {
      focusViewRoot();
      await restoreScrollPosition(normalizedRole, targetScrollPosition);
      if (sequence !== routeSequence) return;
    }

    // 8. Update toolbar active link
    const toolbar = document.querySelector('shared-toolbar');
    if (toolbar?.updateToolbarLinks) {
      toolbar.updateToolbarLinks();
    }

    resolveNavigationPerf(normalizedRole);
    setViewBusy(false);
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
      void restoreScrollPosition(currentRole);
    },

    mountRoute(role, tab) {
      return mountRole(role, tab);
    },

    destroyCurrentView() {
      window.popupManager?.closeAll?.('view-destroy', { suppressFocus: true });
      rememberScrollPosition();
      window.removeEventListener('scroll', observeCurrentScroll);
      if (scrollObservationFrame) window.cancelAnimationFrame(scrollObservationFrame);
      routeCaptureEvents.forEach(type => window.removeEventListener(type, captureRouteLinkScroll, true));
      window.removeEventListener('symbaroum-before-route-change', captureRouterScroll);
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
