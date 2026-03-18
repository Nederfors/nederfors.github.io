import perf from './perf.js';
import persistence from './persistence.js';
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
  document.documentElement.classList.add('is-ready');
  document.documentElement.removeAttribute('data-preload');
};

const finishBootMetrics = () => {
  if (bootMetricsFinished) return;
  bootMetricsFinished = true;
  perf?.resolveQueuedScenarios?.({ role: INITIAL_ROLE });
  perf?.scheduleScenarioEnd?.(initialLoadScenario, { role: INITIAL_ROLE });
};

// onBootReady is a no-op; reveal is handled by finishBoot below.
const onBootReady = () => {};

// Don't reveal on page load — wait for symbaroum-view-boot to ensure content is ready.
// Fallback: reveal after 4s if boot stalls.
const revealTimeout = setTimeout(revealApp, 4000);

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
window.symbaroumRulesWorkerReady = rulesWorker.init();

// --- Load the initial route and shared runtime only ---
await persistence.init();
await loadInitialLegacyApp(INITIAL_ROLE);
onBootReady();
perf?.resolveQueuedScenarios?.({ role: INITIAL_ROLE });

bindToolbarLazyButton('pdfLibraryBtn', ensurePdfLibrary);

const { createViewRuntime } = await import('./shell/view-runtime.js');
if (!window.viewRuntime && typeof createViewRuntime === 'function') {
  window.viewRuntime = createViewRuntime();
}

const finishBoot = () => {
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
  revealApp();
  finishBootMetrics();
};

if (window.__symbaroumBootCompleted) {
  finishBoot();
} else {
  window.addEventListener('symbaroum-view-boot', finishBoot, { once: true });
}
