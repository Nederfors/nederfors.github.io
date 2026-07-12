import perf from './perf.js';
import persistence from './persistence.js';
import offlineContent from './offline-content.js';
import './pwa.js';
import rulesWorker from './workers/rules-client.js';
import router from './shell/router.js';
import { VIEW_TEMPLATES, getViewTitle } from './shell/view-templates.js';
import './shell/view-bridge.js';
import {
  bindToolbarLazyButton,
  ensurePdfLibrary,
  exposeLegacyLoaders,
  loadInitialLegacyApp
} from './shell/legacy-loader.js';

window.__symbaroumAssetMode = import.meta.env?.PROD ? 'production' : 'development';

const runWhenIdle = (callback, timeout = 10000) => new Promise(resolve => {
  const run = () => {
    Promise.resolve()
      .then(callback)
      .then(resolve)
      .catch(error => {
        console.error('Deferred bootstrap task failed', error);
        resolve(false);
      });
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout });
    return;
  }

  window.setTimeout(run, Math.min(timeout, 1200));
});

const RULES_WORKER_WARMUP_DELAY_MS = 3000;
let rulesWorkerWarmupStarted = false;
const warmRulesWorker = () => {
  if (!rulesWorkerWarmupStarted) {
    rulesWorkerWarmupStarted = true;
    window.symbaroumRulesWorkerReady = new Promise(resolve => {
      window.setTimeout(() => {
        runWhenIdle(() => rulesWorker.init(), 10000).then(resolve);
      }, RULES_WORKER_WARMUP_DELAY_MS);
    });
  }
  return window.symbaroumRulesWorkerReady;
};

window.symbaroumRulesWorkerReady = null;
window.ensureSymbaroumRulesWorkerReady = warmRulesWorker;

// --- Router init (sets hash default, parses initial route) ---
router.init();
const INITIAL_ROLE = router.currentRole;
const INITIAL_TAB = router.currentTab;

// Set body data-role for legacy code that reads it at init time
document.body.dataset.role = INITIAL_ROLE;

// Inject initial view template into #view-root
const viewRoot = document.getElementById('view-root');
if (viewRoot && VIEW_TEMPLATES[INITIAL_ROLE]) {
  viewRoot.innerHTML = VIEW_TEMPLATES[INITIAL_ROLE];
}
document.title = getViewTitle(INITIAL_ROLE, INITIAL_TAB);

// --- Perf ---
perf?.setContext?.({ role: INITIAL_ROLE });
const initialLoadScenario = perf?.startScenario?.('first-load', { role: INITIAL_ROLE });
let bootMetricsFinished = false;

const revealApp = () => {
  if (window.__symbaroumBootWatchdog) {
    window.clearTimeout(window.__symbaroumBootWatchdog);
    window.__symbaroumBootWatchdog = null;
  }
  document.documentElement.classList.add('is-ready');
  document.documentElement.removeAttribute('data-preload');
  const fallback = document.getElementById('boot-fallback');
  if (fallback) {
    fallback.hidden = true;
    fallback.setAttribute('aria-hidden', 'true');
    fallback.setAttribute('inert', '');
    fallback.classList.remove('is-error');
    fallback.setAttribute('role', 'status');
    fallback.removeAttribute('aria-modal');
  }
  document.getElementById('skip-links-root')?.removeAttribute('inert');
  document.querySelector('shared-toolbar')?.removeAttribute('inert');
  viewRoot?.removeAttribute('inert');
  if (viewRoot) viewRoot.setAttribute('aria-busy', 'false');
};

const finishBootMetrics = () => {
  if (bootMetricsFinished) return;
  bootMetricsFinished = true;
  perf?.resolveQueuedScenarios?.({ role: INITIAL_ROLE });
  perf?.scheduleScenarioEnd?.(initialLoadScenario, { role: INITIAL_ROLE });
};

// onBootReady is a no-op; reveal is handled by finishBoot below.
const onBootReady = () => {};

// Keep the visible loading shell in place until the mounted view is usable.
// The document-level eight-second watchdog turns it into a recoverable error.
const revealTimeout = setTimeout(() => {}, 8000);

// --- Motion layer ---
const FALLBACK_DAUB_MOTION = Object.freeze({
  isTouchUi: () => false,
  prefersReducedMotion: () => false,
  defaultTouchProfile(type = '') {
    return String(type || '').trim().toLowerCase() === 'dialog' ? 'none' : 'sheet-down';
  },
  bindAutoAnimate: () => null,
  destroyAutoAnimate: () => false,
  bindSwipeTabs: () => null,
  destroySwipeTabs: () => false,
  slideTabsTo: () => false,
  refreshSwipeTabs: () => false,
  hasSwipeTabs: () => false
});

try {
  await import('./motion/daub-motion.js');
} catch (error) {
  console.error('Failed to load motion layer', error);
  if (!window.daubMotion) window.daubMotion = FALLBACK_DAUB_MOTION;
}

// --- Expose router globally for legacy scripts ---
window.appRouter = router;
exposeLegacyLoaders();

// --- Load the initial route and shared runtime only ---
await Promise.all([
  persistence.init(),
  Promise.resolve(window.__symbaroumDaubReady)
]);
await loadInitialLegacyApp(INITIAL_ROLE);
onBootReady();
perf?.resolveQueuedScenarios?.({ role: INITIAL_ROLE });

bindToolbarLazyButton('pdfLibraryBtn', ensurePdfLibrary);

const { createViewRuntime } = await import('./shell/view-runtime.js');
if (!window.viewRuntime && typeof createViewRuntime === 'function') {
  window.viewRuntime = createViewRuntime();
}

let finishBootStarted = false;

const afterStableLayout = () => new Promise(resolve => {
  window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
});

const finishBoot = () => {
  if (finishBootStarted) return;
  finishBootStarted = true;
  clearTimeout(revealTimeout);
  window.viewRuntime?.mountCurrentView?.({ role: INITIAL_ROLE, root: document.body });
  // Activate the correct traits tab if entering via #/summary or #/effects
  if (INITIAL_TAB && window.summaryEffects?.activateTraitsTab) {
    window.summaryEffects.activateTraitsTab(INITIAL_TAB);
  }
  // Start hash-based routing only after initial view is mounted
  if (window.viewRuntime?.startRouting) {
    window.viewRuntime.startRouting();
  }
  Promise.resolve(window.__symbaroumStylesReady)
    .then(stylesReady => {
      if (stylesReady === false) {
        throw new Error('The application stylesheet did not load.');
      }
      return afterStableLayout();
    })
    .then(() => {
      revealApp();
      finishBootMetrics();
      warmRulesWorker();
      offlineContent.scheduleWarmRules();
    })
    .catch(error => {
      console.error('Symbapedia presentation failed to initialize', error);
      window.__symbaroumShowLoadError?.(
        'Symbapedia kunde inte visa gränssnittet. Kontrollera anslutningen och försök igen.'
      );
    });
};

document.getElementById('skip-to-content')?.addEventListener('click', event => {
  event.preventDefault();
  try { viewRoot?.focus?.({ preventScroll: true }); } catch { viewRoot?.focus?.(); }
});

document.getElementById('skip-to-search')?.addEventListener('click', event => {
  event.preventDefault();
  const search = document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchField');
  try { search?.focus?.({ preventScroll: true }); } catch { search?.focus?.(); }
});

if (window.__symbaroumBootCompleted) {
  finishBoot();
} else {
  window.addEventListener('symbaroum-view-boot', finishBoot, { once: true });
}
