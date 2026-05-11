const ROLE = document.body?.dataset?.role || '';

const CORE_SCRIPTS = [
  'js/auto-resize.js',
  'js/text-format.js',
  'js/utils.js',
  'js/store.js',
  'js/inventory-utils.js',
  'js/traits-utils.js',
  'js/shared-toolbar.js',
  'js/yrke-panel.js',
  'js/elite-utils.js',
  'js/elite-req.js',
  'js/entry-card.js',
  'js/exceptionellt.js',
  'js/djurmask.js',
  'js/beastform.js',
  'js/kraftval.js',
  'js/artifact-payment.js',
  'js/bloodbond.js',
  'js/monsterlard.js'
];

const ROLE_SCRIPTS = Object.freeze({
  index: [
    'js/entry-xp.js',
    'js/index-view.js',
    'js/elite-add.js'
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
  summary: [
    'js/summary-effects.js'
  ],
  effects: [
    'js/summary-effects.js'
  ],
  traits: []
});

const POST_SCRIPTS = [
  'js/main.js',
  'js/pwa.js'
];

const pendingScripts = new Map();

const toAbsoluteSrc = (src) => new URL(src, document.baseURI).href;

function loadClassicScript(src) {
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

async function loadScriptBatch(sources) {
  for (const src of sources) {
    // Keep execution order deterministic for globals.
    await loadClassicScript(src);
  }
}

function bindToolbarLazyButton(buttonId, ensureFn) {
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

window.ensureScript = loadClassicScript;
window.ensureJsZip = () => loadClassicScript('js/jszip.min.js');
window.ensureCharacterGenerator = async () => {
  await loadClassicScript('js/character-generator.js');
  return window.symbaroumGenerator || null;
};
window.ensureTabellPopup = () => loadClassicScript('js/tabell-popup.js');
window.ensurePdfLibrary = () => loadClassicScript('js/pdf-library.js');

const roleScripts = ROLE_SCRIPTS[ROLE] || [];
const startupScripts = [...CORE_SCRIPTS, ...roleScripts, ...POST_SCRIPTS];
await loadScriptBatch(startupScripts);

bindToolbarLazyButton('pdfLibraryBtn', window.ensurePdfLibrary);
