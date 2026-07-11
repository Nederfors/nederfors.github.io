const PRELOAD_SCRIPTS = [
  'js/auto-resize.js',
  'js/text-format.js',
  'js/catalog-schema.js',
  'js/utils.js',
  'js/rules-helper.js',
  'js/store.js'
];

const CORE_SCRIPTS = [
  'js/snapshot-helper.js',
  'js/popup-ui.js',
  'js/tools-popup-shell.js',
  'js/inventory-popup-registry.js',
  'js/inventory-utils.js',
  'js/traits-utils.js',
  'js/popup-manager.js',
  'js/shared-toolbar.js',
  'js/yrke-panel.js',
  'js/elite-utils.js',
  'js/elite-req.js',
  'js/entry-card.js',
  'js/entry-card-builder.js',
  'js/choice-popup.js',
  'js/requirement-popup.js',
  'js/exceptionellt.js',
  'js/djurmask.js',
  'js/beastform.js',
  'js/kraftval.js',
  'js/artifact-payment.js',
  'js/bloodbond.js',
  'js/monsterlard.js'
];

const ROUTE_SCRIPTS = Object.freeze({
  index: [
    'js/entry-xp.js',
    'js/index-view.js'
  ],
  character: [
    'js/entry-xp.js',
    'js/character-view.js'
  ],
  inventory: [
    'js/inventory-view.js'
  ],
  notes: [
    'js/notes-view.js'
  ],
  traits: [
    'js/summary-effects.js'
  ]
});

const POST_SCRIPTS = [
  'js/main.js'
];

const BUNDLE_SCRIPTS = Object.freeze({
  shared: 'js/legacy/shared.js',
  index: 'js/legacy/index.js',
  character: 'js/legacy/character.js',
  inventory: 'js/legacy/inventory.js',
  notes: 'js/legacy/notes.js',
  traits: 'js/legacy/traits.js',
  post: 'js/legacy/post.js'
});

const USE_LEGACY_BUNDLES = Boolean(import.meta.env?.PROD)
  && !new URLSearchParams(window.location.search).has('debugSources');

const pendingScripts = new Map();
const loadedRoutes = new Set();
let sharedScriptsPromise = null;
let postScriptsPromise = null;
let jsZipPromise = null;

export function normalizeRole(role = 'index') {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'summary' || value === 'effects') return 'traits';
  return ROUTE_SCRIPTS[value] ? value : 'index';
}

const toAbsoluteSrc = (src) => new URL(src, document.baseURI).href;

function markScriptLoaded(src) {
  pendingScripts.set(toAbsoluteSrc(src), Promise.resolve());
}

export function loadClassicScript(src) {
  const absoluteSrc = toAbsoluteSrc(src);
  const existing = pendingScripts.get(absoluteSrc);
  if (existing) return existing;

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => {
      reject(new Error(`Failed to load script: ${src}`));
    }, { once: true });
    document.head.appendChild(script);
  });

  pendingScripts.set(absoluteSrc, promise);
  return promise;
}

export async function loadScriptBatch(sources = []) {
  for (const src of sources) {
    await loadClassicScript(src);
  }
}

async function loadBundleOrScripts(bundleSrc, sources = []) {
  if (!USE_LEGACY_BUNDLES || !bundleSrc) {
    await loadScriptBatch(sources);
    return;
  }
  try {
    await loadClassicScript(bundleSrc);
    sources.forEach(markScriptLoaded);
  } catch (error) {
    console.warn(`Failed to load ${bundleSrc}; falling back to ordered legacy sources.`, error);
    await loadScriptBatch(sources);
  }
}

export function ensureSharedScripts() {
  if (!sharedScriptsPromise) {
    sharedScriptsPromise = loadBundleOrScripts(
      BUNDLE_SCRIPTS.shared,
      [...PRELOAD_SCRIPTS, ...CORE_SCRIPTS]
    );
  }
  return sharedScriptsPromise;
}

export async function ensureRouteScripts(role = 'index') {
  const normalizedRole = normalizeRole(role);
  await ensureSharedScripts();
  if (loadedRoutes.has(normalizedRole)) return;
  const sources = ROUTE_SCRIPTS[normalizedRole] || [];
  await loadBundleOrScripts(BUNDLE_SCRIPTS[normalizedRole], sources);
  loadedRoutes.add(normalizedRole);
}

export function ensurePostScripts() {
  if (!postScriptsPromise) {
    postScriptsPromise = loadBundleOrScripts(BUNDLE_SCRIPTS.post, POST_SCRIPTS);
  }
  return postScriptsPromise;
}

export async function loadInitialLegacyApp(role = 'index') {
  await ensureSharedScripts();
  await ensureRouteScripts(role);
  await ensurePostScripts();
}

export async function ensureJsZip() {
  if (window.JSZip) return window.JSZip;
  if (!jsZipPromise) {
    jsZipPromise = import('jszip').then((module) => {
      const JSZip = module?.default || module?.JSZip || module;
      window.JSZip = JSZip;
      return JSZip;
    });
  }
  return jsZipPromise;
}

export async function ensureCharacterGenerator() {
  await loadClassicScript('js/character-generator.js');
  return window.symbaroumGenerator || null;
}

export async function ensureEliteAdd() {
  await loadClassicScript('js/elite-add.js');
  return window.eliteAdd || null;
}

export async function ensureTabellPopup() {
  await loadClassicScript('js/tabell-popup.js');
  return window.tabellPopup || null;
}

export async function ensurePdfLibrary() {
  await loadClassicScript('js/pdf-library.js');
  return window.pdfLibrary || null;
}

export function bindToolbarLazyButton(buttonId, ensureFn) {
  const install = () => {
    const toolbar = document.querySelector('shared-toolbar');
    const root = toolbar?.shadowRoot;
    if (!root) return false;
    const button = root.getElementById(buttonId);
    if (!button || button.dataset.lazyScriptBound === '1') {
      return Boolean(button);
    }

    button.dataset.lazyScriptBound = '1';
    button.addEventListener('click', async (event) => {
      if (button.dataset.lazyScriptReady === '1') return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const previousDisabled = button.disabled;
      button.disabled = true;
      try {
        await ensureFn();
        button.dataset.lazyScriptReady = '1';
      } catch (error) {
        console.error(error);
      } finally {
        button.disabled = previousDisabled;
      }

      if (button.dataset.lazyScriptReady === '1') {
        button.click();
      }
    }, { capture: true });
    return true;
  };

  if (install()) return;
  const toolbar = document.querySelector('shared-toolbar');
  if (!toolbar) return;
  toolbar.addEventListener('toolbar-rendered', install);
}

export function exposeLegacyLoaders() {
  window.ensureScript = loadClassicScript;
  window.ensureRouteScripts = ensureRouteScripts;
  window.ensureJsZip = ensureJsZip;
  window.ensureCharacterGenerator = ensureCharacterGenerator;
  window.ensureEliteAdd = ensureEliteAdd;
  window.ensureTabellPopup = ensureTabellPopup;
  window.ensurePdfLibrary = ensurePdfLibrary;
  window.openTablePopup = async (html, title) => {
    await ensureTabellPopup();
    return window.tabellPopup?.open?.(html, title) || null;
  };
}
