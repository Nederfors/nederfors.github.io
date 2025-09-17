/* ===========================================================
   js/main.js – gemensam logik för index-, character- och notes-vy
   Fungerar ihop med Web Component <shared-toolbar>
   2025-06-20
   =========================================================== */

/* ---------- Back-navigering för menyer & popups ---------- */
(function() {
  const overlayStack = [];
  const openMap = new Map();
  let isPop = false;
  // Count how many history.back() calls we have triggered manually.
  // Using a counter (instead of a boolean) makes rapid open/close
  // sequences robust and prevents desync when multiple popstate
  // events arrive after fast clicks.
  let manualCloseCount = 0;

  let scrollLocked = false;
  let scrollY = 0;

  function lockScroll() {
    if (scrollLocked) return;
    scrollY = window.scrollY || window.pageYOffset;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add('no-scroll');
    scrollLocked = true;
  }

  function unlockScroll() {
    if (!scrollLocked) return;
    document.body.classList.remove('no-scroll');
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
    scrollLocked = false;
  }

  function isOverlay(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.classList.contains('popup') || el.classList.contains('offcanvas')) return true;
    return /Popup$/.test(el.id) || /Panel$/.test(el.id);
  }

  function observe(root) {
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        const el = m.target;
        if (!isOverlay(el)) continue;
        const isOpen = el.classList.contains('open');
        const wasOpen = openMap.get(el) || false;
        if (isOpen && !wasOpen) {
          openMap.set(el, true);
          overlayStack.push(el);
          history.pushState({ overlay: el.id }, '');
        } else if (!isOpen && wasOpen) {
          openMap.set(el, false);
          const idx = overlayStack.lastIndexOf(el);
          if (idx >= 0) overlayStack.splice(idx, 1);
          if (!isPop) {
            manualCloseCount++;
            history.back();
          }
        }
      }
      if (overlayStack.length > 0) {
        lockScroll();
      } else {
        unlockScroll();
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  function initObservers() {
    observe(document.body);
    const bar = document.querySelector('shared-toolbar');
    if (bar && bar.shadowRoot) observe(bar.shadowRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObservers);
  } else {
    initObservers();
  }

  window.addEventListener('popstate', (ev) => {
    if (manualCloseCount > 0) { manualCloseCount--; return; }
    const el = overlayStack[overlayStack.length - 1];
    if (el) {
      isPop = true;
      el.classList.remove('open');
      // Vänta tills MutationObserver hunnit reagera innan flaggan återställs
      setTimeout(() => { isPop = false; });
    }
  });

  // Close open menus/panels with Escape on desktop devices
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Detect desktop by fine pointer (e.g. mouse)
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (overlayStack.length > 0) {
      e.preventDefault();
      history.back();
    }
  });
})();

// Ensure we are at top after a Hoppsan reset reload
try {
  if (sessionStorage.getItem('hoppsanReset')) {
    sessionStorage.removeItem('hoppsanReset');
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // Scroll on next tick to win over any pending layout
    setTimeout(() => window.scrollTo(0, 0), 0);
  }
} catch {}

/* ---------- Grunddata & konstanter ---------- */
const ROLE   = document.body.dataset.role;           // 'index' | 'character' | 'notes'
let   store  = storeHelper.load();                   // Lokal lagring
let   lastActiveChar = store.current || '';

/* ---------- Snabb DOM-access ---------- */
const bar  = document.querySelector('shared-toolbar');
const $T   = id => bar.shadowRoot.getElementById(id);        // shadow-DOM
const dom  = {
  /* toolbar / panel */
  charSel : $T('charSelect'),   delBtn : $T('deleteChar'),
  newBtn  : $T('newCharBtn'),   dupBtn : $T('duplicateChar'),   xpOut  : $T('xpOut'),
  exportBtn: $T('exportChar'),  importBtn: $T('importChar'),
  xpIn    : $T('xpInput'),      xpSum  : $T('xpSummary'),
  xpMinus : $T('xpMinus'),      xpPlus : $T('xpPlus'),
  xpTotal : $T('xpTotal'),      xpUsed : $T('xpUsed'),       xpFree : $T('xpFree'),

  /* inventarie */
  invFormal: $T('invFormal'),   invList : $T('invList'),      invBadge  : $T('invBadge'),
  wtOut   : $T('weightOut'),    slOut     : $T('slotOut'),
  invSearch: $T('invSearch'),
  moneyD  : $T('moneyDaler'),
  moneyS  : $T('moneySkilling'),
  moneyO  : $T('moneyOrtegar'),
  moneySetBtn: $T('moneySetBtn'),
  moneyAddBtn: $T('moneyAddBtn'),
  invTypeSel : $T('invTypeFilter'),
  collapseAllBtn: $T('collapseAllInv'),
  dragToggle: $T('dragToggle'),
  unusedOut: $T('unusedOut'),

  /* smith filter */
  forgeBtn : $T('partySmith'),
  alcBtn  : $T('partyAlchemist'),
  artBtn  : $T('partyArtefacter'),
  defBtn  : $T('forceDefense'),

  /* traits */
  traits  : $T('traits'),       traitsTot: $T('traitsTotal'),
  traitsMax: $T('traitsMax'),
  traitStats: $T('traitStats'),

  /* filterfält */
  catToggle: $T('catToggle'),
  sIn   : $T('searchField'),  typSel : $T('typFilter'),
  searchList: $T('searchAutocomplete'),
  searchSug: $T('searchSuggest'),
  arkSel: $T('arkFilter'),    tstSel : $T('testFilter'),
  folderSel: $T('folderFilter'),
  filterUnion: $T('filterUnion'),
  entryViewToggle: $T('entryViewToggle'),
  infoToggle: $T('infoToggle'),

  /* element i main-DOM */
  active : document.getElementById('activeFilters'),
  lista  : document.getElementById('lista'),       // index-vy
  valda  : document.getElementById('valda'),       // character-vy
  cName  : document.getElementById('charName')
};

// Safari/WebKit exposes showOpenFilePicker but only allows selecting a single file.
// Detect such browsers so we can fall back to the <input type="file" multiple> path.
const shouldBypassShowOpenFilePickerMulti = (() => {
  let cached;
  return () => {
    if (cached !== undefined) return cached;
    let bypass = false;
    try {
      if (typeof navigator !== 'undefined') {
        const nav = navigator;
        if (nav.userAgentData && Array.isArray(nav.userAgentData.brands)) {
          const safariBrand = nav.userAgentData.brands.some(entry => {
            const brand = String((entry && entry.brand) || '').toLowerCase();
            if (!brand) return false;
            const hasSafari = brand.includes('safari');
            const hasChrome = brand.includes('chrome') || brand.includes('chromium');
            return hasSafari && !hasChrome;
          });
          if (safariBrand) bypass = true;
        }
        if (!bypass) {
          const ua = String(nav.userAgent || '');
          const vendor = String(nav.vendor || '');
          const isAppleVendor = /apple/i.test(vendor);
          const hasSafari = /\bSafari\//.test(ua);
          const hasExclude = /\b(Chrome|Chromium|CriOS|FxiOS|OPR|OPiOS|Edg|EdgiOS)\//.test(ua);
          if (isAppleVendor && hasSafari && !hasExclude) bypass = true;
        }
      }
    } catch {}
    cached = bypass;
    return bypass;
  };
})();

/* ===========================================================
   UI-KOMMANDON (sök efter menyknappar och lyft fram dem)
   =========================================================== */
// Bygg upp en liten kommandokatalog för knappar i toolbar/paneler
// så att sökfältet kan hitta dem oavsett vy.
(function initUICommandSearch(){
  // Normalisera för sökning (gemensam helper finns i utils.js)
  const norm = s => searchNormalize(String(s||'').toLowerCase());

  // Hjälpare för att highlighta ett element i toolbarens shadow DOM
  function highlightToolbarEl(sel, panelId){
    try {
      if (!bar || !bar.shadowRoot) return false;
      if (panelId && typeof bar.open === 'function') bar.open(panelId);
      let el = bar.shadowRoot.querySelector(sel);
      // For dynamic inventory vehicle buttons, fall back to first matching
      if (!el && panelId === 'invPanel' && sel === '[id^="vehicleBtn-"]') {
        el = bar.shadowRoot.querySelector('#invPanel [id^="vehicleBtn-"]');
      }
      // Fallback: allow selecting elements in the main document (outside the toolbar)
      if (!el) {
        el = document.querySelector(sel);
      }
      // Collapse all cards except the one containing the target element (within its panel)
      const isInToolbar = !!(el && bar.shadowRoot && bar.shadowRoot.contains(el));
      if (panelId && el) {
        const panel = bar.shadowRoot.getElementById(panelId);
        const card = el.closest('.card');
        if (panel && card) {
          const allCards = panel.querySelectorAll('.card');
          allCards.forEach(c => {
            const cid = c.id || '';
            const isAlwaysOpen = cid === 'searchFiltersCard' || cid === 'invSearchFilters' || c.classList.contains('help-card');
            if (isAlwaysOpen || c === card) c.classList.remove('compact');
            else c.classList.add('compact');
          });
          // Special handling for inventory entries: also collapse all item cards
          if (panelId === 'invPanel') {
            const invCards = panel.querySelectorAll('#invList .card');
            invCards.forEach(c => { if (c !== card) c.classList.add('compact'); });
          }
          if (panelId === 'filterPanel' && typeof bar.updateFilterCollapseBtn === 'function') {
            bar.updateFilterCollapseBtn();
          }
        }
      }
      if (!el) return false;
      // Blink-animera, fokusera och scrolla in elementet
      el.classList.remove('focus-highlight');
      // Force reflow to restart animation
      void el.offsetWidth;
      el.classList.add('focus-highlight');
      // Global CSS now styles .focus-highlight consistently across toolbar and page
      try { el.focus?.(); } catch {}
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      return true;
    } catch { return false; }
  }

  // Katalog med UI-kommandon: id, visningsnamn, panel och CSS-selector
  const UI_CMDS = [
    // Toppknappar
    { id: 'open-inventory',  label: 'Inventarie',   sel: '#invToggle',    panel: 'invPanel',    emoji: '🎒',
      syn: ['inventarie','inventory','ryggsäck','ryggsack','rygga','inv'] },
    { id: 'open-traits',     label: 'Egenskaper',   sel: '#traitsToggle', panel: 'traitsPanel', emoji: '📊',
      syn: ['egenskaper','traits','drag','karaktärsdrag','karaktarsdrag'] },
    { id: 'open-filter',     label: 'Filter',       sel: '#filterToggle', panel: 'filterPanel', emoji: '⚙️',
      syn: ['filter','verktyg'] },
    // Huvudvyns knappar utanför toolbaren (rollpersonssidan)
    { id: 'open-notes',      label: 'Anteckningar', sel: '#notesLink',    panel: null,          emoji: '📜',
      syn: ['anteckningar','anteckning','notes','noteringar'] },
    { id: 'open-summary',    label: 'Översikt',     sel: '#summaryToggle', panel: null,         emoji: '📋',
      syn: ['översikt','oversikt','sammanfattning','visa översikt','visa oversikt'] },

    // Inställningar 💡 (Filter → Inställningar)
    { id: 'settings-smith',   label: 'Smed i partyt',        sel: '#partySmith',      panel: 'filterPanel', emoji: '⚒️', syn: ['smed','smed i partyt','smed nivå'] },
    { id: 'settings-alch',    label: 'Alkemist i partyt',    sel: '#partyAlchemist',  panel: 'filterPanel', emoji: '⚗️', syn: ['alkemist','alkemist i partyt'] },
    { id: 'settings-art',     label: 'Artefaktmakare i partyt', sel: '#partyArtefacter', panel: 'filterPanel', emoji: '🏺', syn: ['artefaktmakare','artefaktare'] },
    { id: 'settings-union',   label: 'Utvidgad sökning',     sel: '#filterUnion',     panel: 'filterPanel', emoji: '🔭', syn: ['utvidga sökning','or-sökning','union','OR'] },
    { id: 'settings-expand',  label: 'Expandera vy',         sel: '#entryViewToggle', panel: 'filterPanel', emoji: '↕️', syn: ['expandera vy','vy','detaljer','expand'] },
    { id: 'settings-defense', label: 'Tvinga försvar',       sel: '#forceDefense',    panel: 'filterPanel', emoji: '🏃', syn: ['försvar','tvinga försvar','försvarskaraktärsdrag'] },
    { id: 'settings-help',    label: 'Hjälp',                sel: '#infoToggle',      panel: 'filterPanel', emoji: 'ℹ️',
      syn: ['hjälp','info','information','behöver du hjälp','behover du hjalp'] },

    // Inventarie → Verktyg 🧰
    { id: 'inv-new',     label: 'Nytt föremål',         sel: '#addCustomBtn',   panel: 'invPanel', emoji: '🆕', syn: ['nytt föremål','eget föremål','skapa föremål'] },
    { id: 'inv-money',   label: 'Hantera pengar',       sel: '#manageMoneyBtn', panel: 'invPanel', emoji: '💰', syn: ['pengar','hantera pengar','money'] },
    { id: 'inv-multi',   label: 'Multiplicera pris',    sel: '#multiPriceBtn',  panel: 'invPanel', emoji: '💸', syn: ['multiplicera pris','pris'] },
    { id: 'inv-qty',     label: 'Lägg till antal',      sel: '#squareBtn',      panel: 'invPanel', emoji: 'x²', syn: ['antal','lägg till antal'] },
    { id: 'inv-vehicle', label: 'Lasta i',              sel: '[id^="vehicleBtn-"]', panel: 'invPanel', emoji: '🛞', syn: ['lasta','lasta i','färdmedel','fordon'] },
    { id: 'inv-drag',    label: 'Dra & Släpp',          sel: '#dragToggle',     panel: 'invPanel', emoji: '🔀', syn: ['dra och släpp','drag','drag & drop'] },
    { id: 'inv-free',    label: 'Spara & gratismarkera',sel: '#saveFreeBtn',    panel: 'invPanel', emoji: '🔒', syn: ['gratismarkera','spara gratis','gratis'] },
    { id: 'inv-clear',   label: 'Rensa inventarie',     sel: '#clearInvBtn',    panel: 'invPanel', emoji: '🧹', syn: ['töm inventarie','rensa','töm'] },

    // Verktyg inne i Filter → Verktyg
    { id: 'new-character',   label: 'Ny rollperson',       sel: '#newCharBtn',      panel: 'filterPanel', emoji: '➕',
      syn: ['ny rollperson','skapa rollperson','ny','skapa'] },
    { id: 'duplicate-char',  label: 'Kopiera rollperson',  sel: '#duplicateChar',   panel: 'filterPanel', emoji: '🧬',
      syn: ['kopiera rollperson','kopiera','duplicera','dup'] },
    { id: 'rename-char',     label: 'Byt namn',            sel: '#renameChar',      panel: 'filterPanel', emoji: '✏️',
      syn: ['byt namn','byta namn','rename','namn'] },
    { id: 'manage-folders',  label: 'Mapphantering',       sel: '#manageFolders',   panel: 'filterPanel', emoji: '🗂️',
      syn: ['mapphantering','mappar','mapp','hantera mappar','mapphanterare','folder'] },
    { id: 'export-char',     label: 'Exportera',           sel: '#exportChar',      panel: 'filterPanel', emoji: '⬇️',
      syn: ['export','exportera'] },
    { id: 'import-char',     label: 'Importera',           sel: '#importChar',      panel: 'filterPanel', emoji: '⬆️',
      syn: ['import','importera'] },
    { id: 'pdf-library',     label: 'PDF-bank',            sel: '#pdfLibraryBtn',   panel: 'filterPanel', emoji: '📄',
      syn: ['pdf-bank','pdf bank','pdf'] },
    { id: 'delete-char',     label: 'Radera rollperson',   sel: '#deleteChar',      panel: 'filterPanel', emoji: '🗑️',
      syn: ['radera','ta bort','delete','radera rollperson'] },
  ];

  const PHRASE_MAP = new Map(); // norm(str) -> cmd
  for (const c of UI_CMDS) {
    const all = [c.label, ...(c.syn || [])];
    for (const s of all) {
      const n = norm(s);
      if (!PHRASE_MAP.has(n)) PHRASE_MAP.set(n, c);
    }
  }

  function searchUICommands(q){
    const nq = norm(q);
    if (!nq) return [];
    const out = [];
    for (const c of UI_CMDS) {
      const hay = [c.label, ...(c.syn || [])].map(norm).join('\n');
      if (hay.includes(nq)) out.push(c);
    }
    // Sort by label length then label for stable, compact hits
    out.sort((a,b)=> a.label.length - b.label.length || a.label.localeCompare(b.label, 'sv'));
    return out.slice(0, 15);
  }

  function executeUICommand(id){
    const cmd = UI_CMDS.find(c => c.id === id);
    if (!cmd) return false;
    // If this command belongs to character view but we are elsewhere, navigate
    if ((cmd.id === 'open-summary' || cmd.id === 'open-notes') && ROLE !== 'character') {
      try { sessionStorage.setItem('__pendingUICommand', cmd.id); } catch {}
      try { window.location.href = 'character.html'; } catch {}
      return true;
    }
    return highlightToolbarEl(cmd.sel, cmd.panel);
  }

  function tryUICommand(term){
    const t = norm(term);
    if (!t) return false;
    // Exact phrase match first
    const exact = PHRASE_MAP.get(t);
    if (exact) return executeUICommand(exact.id);
    // Otherwise, if only one fuzzy match, execute
    const hits = searchUICommands(t);
    if (hits.length === 1) return executeUICommand(hits[0].id);
    return false;
  }

  // Exponera globalt så vyerna kan använda detta
  window.getUICommandSuggestions = function(q){
    const nq = norm(q || '');
    // Special case: typing "Funktioner" should list all available UI buttons
    if (nq === 'funktioner') {
      return UI_CMDS
        .slice()
        .sort((a,b)=> String(a.label||'').localeCompare(String(b.label||''), 'sv'))
        .map(c => ({ id: c.id, label: c.label, emoji: c.emoji || '' }));
    }
    return searchUICommands(q).map(c => ({ id: c.id, label: c.label, emoji: c.emoji || '' }));
  };
  window.executeUICommand = executeUICommand;
  window.tryUICommand = tryUICommand;

  // If we were redirected here to run a command, execute once on load
  try {
    const pending = sessionStorage.getItem('__pendingUICommand');
    if (pending) {
      sessionStorage.removeItem('__pendingUICommand');
      // Run after a short delay to allow layout to settle
      setTimeout(() => { try { executeUICommand(pending); } catch {} }, 50);
    }
  } catch {}

  // Liten quality-of-life: i Notes-vyn finns ingen egen söklogik,
  // så låt Enter köra UI-kommandon globalt där.
  if (ROLE === 'notes' && dom.sIn) {
    dom.sIn.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const term = (dom.sIn.value || '').trim();
      if (!term) return;
      if (tryUICommand(term)) {
        e.preventDefault();
        const sugEl = dom.searchSug || (document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest'));
        if (sugEl) { sugEl.innerHTML = ''; sugEl.hidden = true; }
        window.__searchBlurGuard = true;
        dom.sIn.value = '';
        dom.sIn.blur();
      }
    });
  }
})();

/* ----- Hantera back-navigering för sökfältet ----- */
let searchFocus = false;
// Guard to prevent blur() from triggering history.back() when a UI command is running
window.__searchBlurGuard = false;
if (dom.sIn) {
  dom.sIn.addEventListener('focus', () => {
    history.pushState({ search: true }, '');
    searchFocus = true;
  });
  dom.sIn.addEventListener('blur', () => {
    setTimeout(() => {
      const sugEl = dom.searchSug || (document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest'));
      if (sugEl) sugEl.hidden = true;
      if (searchFocus) {
        searchFocus = false;
        // Skip history.back when a UI command triggered this blur
        if (window.__searchBlurGuard) {
          window.__searchBlurGuard = false;
          return;
        }
        history.back();
      }
    }, 0);
  });
  dom.sIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') dom.sIn.blur();
    else if (e.key === 'Escape' && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      dom.sIn.blur();
    }
  });
}

window.addEventListener('popstate', () => {
  if (searchFocus && document.activeElement === dom.sIn) {
    searchFocus = false;
    const sugEl = dom.searchSug || (document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest'));
    if (sugEl) sugEl.hidden = true;
    dom.sIn.blur();
  }
});

/* ---------- Ladda databasen ---------- */
let DB = [];
let DBIndex = {};
window.DB = DB;
window.DBIndex = DBIndex;
const DATA_FILES = [
  'diverse.json',
  'kuriositeter.json',
  'skatter.json',
  'elixir.json',
  'fordel.json',
  'formaga.json',
  'kvalitet.json',
  'mystisk-kraft.json',
  'mystisk-kvalitet.json',
  'neutral-kvalitet.json',
  'negativ-kvalitet.json',
  'nackdel.json',
  'anstallning.json',
  'byggnader.json',
  'yrke.json',
  'ras.json',
  'elityrke.json',
  'fardmedel.json',
  'forvaring.json',
  'gardsdjur.json',
  'instrument.json',
  'klader.json',
  'specialverktyg.json',
  'tjanster.json',
  'ritual.json',
  'rustning.json',
  'vapen.json',
  'mat.json',
  'dryck.json',
  'sardrag.json',
  'monstruost-sardrag.json',
  'artefakter.json',
  'lagre-artefakter.json',
  'fallor.json'
].map(f => `data/${f}`);

const TABELLER_FILE = 'data/tabeller.json';
let TABELLER = [];
fetch(TABELLER_FILE)
  .then(r => r.json())
  .then(arr => {
    TABELLER = arr;
    window.TABELLER = TABELLER;
    if (typeof window.indexViewUpdate === 'function') {
      window.indexViewUpdate();
      if (typeof window.indexViewRefreshFilters === 'function') {
        window.indexViewRefreshFilters();
      }
    }
  });

Promise.all(DATA_FILES.map(f => fetch(f).then(r => r.json())))
  .then(arrays => {
    DB = arrays.flat().sort(sortByType);
    DB.forEach((ent, idx) => {
      if (ent.id === undefined) ent.id = idx;
      DB[ent.id] = ent;
    });
    window.DB = DB;
    DBIndex = {};
    DB.forEach(ent => { DBIndex[ent.namn] = ent; });
    window.DBIndex = DBIndex;
    if (storeHelper.migrateInventoryIds) {
      storeHelper.migrateInventoryIds(store);
      store = storeHelper.load();
    }
    boot();
  });

/* ===========================================================
   HJÄLPFUNKTIONER
   =========================================================== */


function yrkeInfoHtml(p) {
  const extra = p.extra ? formatText(p.extra) : '';
  if (isRas(p)) {
    const trait = p.särdrag
      ? `<strong>Särdrag:</strong> ${p.särdrag}`
      : '';
    const male = (p.namn_man || []).length
      ? `<strong>Mansnamn:</strong> ${p.namn_man.join(', ')}`
      : '';
    const female = (p.namn_kvinna || []).length
      ? `<strong>Kvinnonamn:</strong> ${p.namn_kvinna.join(', ')}`
      : '';
    return [extra, trait, male, female].filter(Boolean).join('<br>');
  }
  if (isElityrke(p)) {
    const req = p.krav_formagor
      ? `<strong>Krav på förmågor (varav minst en på mästarnivå):</strong> ${p.krav_formagor}`
      : '';
    const abil = (p.Elityrkesförmågor || []).length
      ? `<strong>Elityrkesförmågor:</strong> ${p.Elityrkesförmågor.join(', ')}`
      : '';
    const perks = (p.mojliga_fordelar || []).length
      ? `<strong>Möjliga fördelar:</strong> ${p.mojliga_fordelar.join(', ')}`
      : '';
    const cons = (p.tankbara_nackdelar || []).length
      ? `<strong>Tänkbara nackdelar:</strong> ${p.tankbara_nackdelar.join(', ')}`
      : '';
    const attr = p.viktiga_karaktarsdrag
      ? `<strong>Viktiga karaktärsdrag:</strong> ${p.viktiga_karaktarsdrag}`
      : '';
    return [extra, req, abil, perks, cons, attr].filter(Boolean).join('<br>');
  }
  const v = p.viktiga_karaktarsdrag
    ? `<strong>Viktiga karaktärsdrag:</strong> ${p.viktiga_karaktarsdrag}`
    : '';
  const s = p.forslag_pa_slakte
    ? `<strong>Förslag på släkte:</strong> ${Array.isArray(p.forslag_pa_slakte) ? p.forslag_pa_slakte.join(', ') : p.forslag_pa_slakte}`
    : '';
  const f = p.lampliga_formagor
    ? `<strong>Lämpliga förmågor:</strong> ${(p.lampliga_formagor || []).join(', ')}`
    : '';
  return [extra, v, s, f].filter(Boolean).join('<br>');
}

/* ---------- Popup för kvaliteter ---------- */

/* ===========================================================
   GEMENSAM INIT
   =========================================================== */
function boot() {
  if (window.invUtil) {
    invUtil.renderInventory();
    invUtil.bindInv();
    invUtil.bindMoney();
  }
  refreshCharSelect();
  bindToolbar();

  if (dom.traits && typeof renderTraits === 'function') {
    renderTraits();
    if (typeof bindTraits === 'function') bindTraits();
  }
  if (ROLE === 'index')     initIndex();
  if (ROLE === 'character') initCharacter();
  if (ROLE === 'notes')     initNotes();
}

/* ===========================================================
   TOOLBAR-LOGIK
   =========================================================== */
/*
  Central helper to re-sync all character-bound UI without a full reload.
  - Keeps current filters/search UI state intact
  - Re-renders inventory, traits, XP counters, lists, and toolbar widgets
*/
function applyCharacterChange() {
  try {
    // Make sure global store is the latest (in case caller updated localStorage elsewhere)
    try { store = storeHelper.load(); } catch {}

    // Refresh select menus and folder filter + XP counters
    refreshCharSelect();
    const nm = (store.characters || []).find(c => c.id === store.current)?.name || '';

    // Update visible character name (character and notes views)
    if (dom.cName) {
      dom.cName.textContent = nm;
    }

    if (store.current && store.current !== lastActiveChar) {
      if (nm) toast(`${nm} är aktiv`);
      lastActiveChar = store.current;
    }

    // Update toolbar toggles visual state based on current character
    if (dom.forgeBtn) dom.forgeBtn.classList.toggle('active', Boolean(storeHelper.getPartySmith(store)));
    if (dom.alcBtn)   dom.alcBtn.classList.toggle('active',   Boolean(storeHelper.getPartyAlchemist(store)));
    if (dom.artBtn)   dom.artBtn.classList.toggle('active',   Boolean(storeHelper.getPartyArtefacter(store)));
    if (dom.defBtn)   dom.defBtn.classList.toggle('active',   Boolean(storeHelper.getDefenseTrait(store)));

    // Re-render inventory (includes recalculating traits/XP side-effects)
    if (window.invUtil && typeof invUtil.renderInventory === 'function') {
      invUtil.renderInventory();
    }

    // Update XP counters explicitly (safe no-op if already handled above)
    if (typeof window.updateXP === 'function') updateXP();

    // Ensure traits panel reflects the new character regardless of inventory path
    if (typeof window.renderTraits === 'function') renderTraits();

    // Re-render main content depending on view
    if (typeof window.indexViewRefreshFilters === 'function') window.indexViewRefreshFilters();
    if (typeof window.indexViewUpdate === 'function') window.indexViewUpdate();
    if (typeof window.notesUpdate === 'function') window.notesUpdate();
  } catch (err) {
    // As a last resort, fall back to reload to avoid a broken UI
    try { location.reload(); } catch {}
  }
}
// Expose for other modules that want to trigger a full UI sync
window.applyCharacterChange = applyCharacterChange;

function refreshCharSelect() {
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  const map = new Map(); // folderId -> chars
  const none = [];
  for (const c of (store.characters || [])) {
    const fid = c.folderId || '';
    if (!fid || !folders.some(f=>f.id===fid)) none.push(c);
    else {
      if (!map.has(fid)) map.set(fid, []);
      map.get(fid).push(c);
    }
  }
  const renderOpts = (arr) => (arr||[])
    .slice()
    .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'))
    .map(c => `<option value="${c.id}"${c.id===store.current?' selected':''}>${c.name}</option>`)
    .join('');
  const active = storeHelper.getActiveFolder(store);
  let html = '<option value="">Välj rollperson …</option>';
  if (active === 'ALL') {
    for (const f of folders) {
      const arr = map.get(f.id) || [];
      if (!arr.length) continue; // hoppa över tomma mappar
      html += `<optgroup label="${(f.name||'Mapp')}">${renderOpts(arr)}</optgroup>`;
    }
  } else {
    const f = folders.find(x => x.id === active);
    const arr = map.get(active) || [];
    if (f && arr.length) {
      html += `<optgroup label="${(f.name||'Mapp')}">${renderOpts(arr)}</optgroup>`;
    }
  }
  dom.charSel.innerHTML = html;
  updateXP();
  refreshFolderFilter();
}

function refreshFolderFilter() {
  if (!dom.folderSel) return;
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  const active = storeHelper.getActiveFolder(store);
  let html = '';
  html += `<option value="ALL"${active==='ALL'?' selected':''}>Alla</option>`;
  html += folders.map(f => `<option value="${f.id}"${active===f.id?' selected':''}>${f.name}</option>`).join('');
  dom.folderSel.innerHTML = html;
}

/* -----------------------------------------------------------
   TOOLBAR – bindas först när knapparna existerar
----------------------------------------------------------- */
/* -----------------------------------------------------------
   TOOLBAR – delegation inne i shadow-DOM
----------------------------------------------------------- */
function bindToolbar() {
  /* charSelect ligger också i shadow-DOM men går fint att nå direkt */
  dom.charSel.addEventListener('change', () => {
    store.current = dom.charSel.value;
    storeHelper.save(store);
    applyCharacterChange();
  });

  /* Aktiv mapp (folderFilter) */
  if (dom.folderSel) {
    dom.folderSel.addEventListener('change', () => {
      const val = dom.folderSel.value;
      // Sätt aktiv mapp i lagringen
      storeHelper.setActiveFolder(store, val);

      // Om en specifik mapp valts (ej "Alla"), välj första karaktären i den mappen
      if (val && val !== 'ALL') {
        const firstInFolder = (store.characters || [])
          .filter(c => (c.folderId || '') === val)
          .slice()
          .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'))[0];
        if (firstInFolder && store.current !== firstInFolder.id) {
          store.current = firstInFolder.id;
          storeHelper.save(store);
          // Uppdatera visat namn om det finns i denna vy
          if (dom.cName) dom.cName.textContent = firstInFolder.name || '';
          // Uppdatera vyer utan omladdning
          if (ROLE === 'character' || ROLE === 'notes') {
            applyCharacterChange();
            return;
          }
        }
      }

      // Uppdatera menyer och index-vy utan omladdning
      refreshCharSelect();
      if (typeof window.indexViewUpdate === 'function') window.indexViewUpdate();
    });
  }

  /* one–time delegation för alla knappar i toolbar + paneler */
  bar.shadowRoot.addEventListener('click', async e => {
    const id = e.target.closest('button, a')?.id;
    if (!id) return;

    /* Ny rollperson ---------------------------------------- */
    if (id === 'newCharBtn') {
      const active = storeHelper.getActiveFolder(store);
      const charId = (storeHelper.makeCharId ? storeHelper.makeCharId(store) : ('rp' + Date.now()));

      // Visa alltid popupen; förvalt val = aktiv mapp (eller Standard om Alla)
      const res = await openNewCharPopupWithFolder(active);
      if (!res) return; // avbrutet
      const { name, folderId, xp } = res;
      if (!name) return;
      store.characters.push({ id: charId, name, folderId: folderId || '' });
      store.data[charId] = { baseXp: Number(xp) || 0, custom: [] };
      store.current = charId;
      // Om vald mapp skiljer sig från aktiv – växla aktiv mapp till den nya
      const prevActive = storeHelper.getActiveFolder(store);
      if (folderId && prevActive !== folderId) {
        storeHelper.setActiveFolder(store, folderId);
      }
      storeHelper.save(store);
      applyCharacterChange();
    }

    /* Kopiera rollperson ----------------------------------- */
    if (id === 'duplicateChar') {
      if (!store.current && !(await requireCharacter())) return;
      const src = (store.characters || []).find(c => c.id === store.current);
      if (!src) return;
      const defaultName = `${src.name} (kopia)`;
      const defaultFolder = storeHelper.getCharacterFolder(store, store.current);
      const res = await openDuplicateCharPopupWithFolder(defaultFolder, defaultName);
      if (!res) return; // avbrutet
      const { name, folderId } = res;
      if (!name) return;
      const newId = storeHelper.duplicateCharacter(store, store.current);
      if (newId) {
        // Sätt namn och mapp enligt användarens val
        try { storeHelper.renameCharacter(store, newId, name); } catch {}
        try { if (folderId) storeHelper.setCharacterFolder(store, newId, folderId); } catch {}
        // Om vald mapp skiljer sig från aktiv – växla aktiv mapp till den nya
        const prevActive = storeHelper.getActiveFolder(store);
        if (folderId && prevActive !== folderId) {
          storeHelper.setActiveFolder(store, folderId);
        }
        store.current = newId;
        storeHelper.save(store);
        applyCharacterChange();
      }
    }

    /* Byt namn på rollperson -------------------------------- */
    if (id === 'renameChar') {
      if (!store.current && !(await requireCharacter())) return;
      const char = store.characters.find(c => c.id === store.current);
      if (!char) return;
      const curFolder = storeHelper.getCharacterFolder(store, store.current);
      const res = await openRenameCharPopupWithFolder(curFolder, char.name || '');
      if (!res) return;
      const { name, folderId } = res;
      if (!name) return;
      const oldFolder = curFolder || '';
      storeHelper.renameCharacter(store, store.current, name);
      if (folderId && folderId !== oldFolder) {
        storeHelper.setCharacterFolder(store, store.current, folderId);
        // Växla aktiv mapp till den nya
        const prevActive = storeHelper.getActiveFolder(store);
        if (prevActive !== folderId) storeHelper.setActiveFolder(store, folderId);
        storeHelper.save(store);
        applyCharacterChange();
      } else {
        // Endast namn ändrat – uppdatera UI utan reload
        storeHelper.save(store);
        refreshCharSelect();
        if (dom.cName) dom.cName.textContent = name;
        if (typeof window.indexViewUpdate === 'function') window.indexViewUpdate();
      }
    }

    /* Export rollperson --------------------------------- */
    if (id === 'exportChar') {
      if (!store.characters.length) { await alertPopup('Inga rollpersoner att exportera.'); return; }
      openExportPopup(async choice => {
        if (choice === 'all-one') {
          await exportAllCharacters();
        } else if (choice === 'all-separate') {
          await exportAllCharactersSeparate();
        } else if (choice === 'all-zip') {
          await exportAllCharactersZipped();
        } else if (choice === 'folder-active') {
          await exportActiveFolder();
        } else if (choice === 'folder-separate') {
          await exportActiveFolderSeparate();
        } else if (choice === 'folder-zip') {
          await exportActiveFolderZipped();
        } else if (choice) {
          await exportCharacterFile(choice);
        }
      });
    }

    /* Mapphanterare --------------------------------------- */
    if (id === 'manageFolders') {
      openFolderManagerPopup();
    }

    /* Import rollperson -------------------------------- */
    if (id === 'importChar') {
      (async () => {
        try {
          // Steg 1: Välj importmål
          const settings = await openImportPopup();
          if (!settings) return;

          // Steg 2: Välj filer eller mapp
          const pickJsonFilesWithInput = () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'application/json';
            inp.multiple = true;
            return new Promise((resolve, reject) => {
              inp.addEventListener('change', () => {
                const list = inp.files && inp.files.length ? Array.from(inp.files) : null;
                if (!list) return reject(new Error('Ingen fil vald'));
                resolve(list);
              });
              inp.click();
            });
          };
          let files;
          if (window.showDirectoryPicker) {
            const pick = await openDialog('Vad vill du importera?', {
              cancel: true,
              okText: 'Filer',
              extraText: 'Mapp',
              cancelText: 'Avbryt'
            });
            if (pick === 'extra') {
              try {
                const dir = await window.showDirectoryPicker({ mode: 'read' });
                files = await getFilesFromDirectory(dir);
              } catch (err) {
                if (err && err.name === 'AbortError') return;
                throw err;
              }
            } else if (pick === true) {
              const canUseNativePicker = !!(window.showOpenFilePicker && !shouldBypassShowOpenFilePickerMulti());
              if (canUseNativePicker) {
                const handles = await window.showOpenFilePicker({
                  multiple: true,
                  types: [{
                    description: 'JSON',
                    accept: { 'application/json': ['.json'] }
                  }]
                });
                files = await Promise.all(handles.map(h => h.getFile()));
              } else {
                files = await pickJsonFilesWithInput();
              }
            } else {
              return;
            }
          } else {
            files = await pickJsonFilesWithInput();
          }
          // Mappningslogik för mål
          const override = settings.mode === 'choose';
          let targetFolderId = '';
          let targetFolderName = '';
          if (override) {
            try {
              const folders = (storeHelper.getFolders(store) || []);
              targetFolderId = settings.folderId || '';
              let folderRec = folders.find(x => x.id === targetFolderId);
              if (!folderRec) {
                let fallback = '';
                try { fallback = storeHelper.getActiveFolder(store); } catch {}
                if (!fallback || fallback === 'ALL') {
                  const std = folders.find(f => f.system) || folders.find(f => (f.name||'') === 'Standard') || folders[0];
                  if (std) fallback = std.id;
                }
                targetFolderId = fallback || '';
                folderRec = folders.find(x => x.id === targetFolderId);
              }
              targetFolderName = folderRec ? (folderRec.name || '') : '';
            } catch {}
          }

          let imported = 0;
          const usedFolderIds = new Set();
          for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.json')) continue;
            try {
              const text = await file.text();
              const obj = JSON.parse(text);
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  try {
                    const payload = override
                      ? { ...item, folder: targetFolderName, folderId: targetFolderId }
                      : item;
                    const id = storeHelper.importCharacterJSON(store, payload);
                    if (id) {
                      imported++;
                      try {
                        const rec = (store.characters || []).find(c => c && c.id === id);
                        if (rec && rec.folderId) usedFolderIds.add(rec.folderId);
                      } catch {}
                      toast(`${item.name || 'Ny rollperson'} är importerad`);
                    }
                  } catch {}
                }
              } else if (obj && Array.isArray(obj.folders)) {
                for (const folder of obj.folders) {
                  const fname = override ? targetFolderName : (folder.folder || folder.name || '');
                  const fid = override ? targetFolderId : (folder.id || folder.folderId || '');
                  if (Array.isArray(folder.characters)) {
                    for (const item of folder.characters) {
                      try {
                        let payload;
                        if (override) {
                          payload = { ...item, folder: targetFolderName, folderId: targetFolderId };
                        } else {
                          payload = { ...item, folder: fname };
                          if (fid) payload.folderId = fid;
                        }
                        const id = storeHelper.importCharacterJSON(store, payload);
                        if (id) {
                          imported++;
                          try {
                            const rec = (store.characters || []).find(c => c && c.id === id);
                            if (rec && rec.folderId) usedFolderIds.add(rec.folderId);
                          } catch {}
                          toast(`${item.name || 'Ny rollperson'} är importerad`);
                        }
                      } catch {}
                    }
                  }
                }
              } else if (obj && Array.isArray(obj.characters)) {
                for (const item of obj.characters) {
                  try {
                    const payload = override
                      ? { ...item, folder: targetFolderName, folderId: targetFolderId }
                      : item;
                    const id = storeHelper.importCharacterJSON(store, payload);
                    if (id) {
                      imported++;
                      try {
                        const rec = (store.characters || []).find(c => c && c.id === id);
                        if (rec && rec.folderId) usedFolderIds.add(rec.folderId);
                      } catch {}
                      toast(`${item.name || 'Ny rollperson'} är importerad`);
                    }
                  } catch {}
                }
              } else {
                const payload = override
                  ? { ...obj, folder: targetFolderName, folderId: targetFolderId }
                  : obj;
                const res = storeHelper.importCharacterJSON(store, payload);
                if (res) {
                  imported++;
                  try {
                    const rec = (store.characters || []).find(c => c && c.id === res);
                    if (rec && rec.folderId) usedFolderIds.add(rec.folderId);
                  } catch {}
                  toast(`${obj.name || 'Ny rollperson'} är importerad`);
                }
              }
            } catch {
              // ignore and continue to next file
            }
          }
          if (imported > 0) {
            // Växla aktiv mapp om användaren önskat och ett tydligt mål finns
            if (override && settings.makeActive && targetFolderId) {
              try { storeHelper.setActiveFolder(store, targetFolderId); } catch {}
            } else if (!override && settings.makeActive) {
              // Endast för Mappar i fil: välj aktiv mapp om exakt en mapp använts
              try {
                const arr = Array.from(usedFolderIds);
                if (arr.length === 1 && arr[0]) {
                  storeHelper.setActiveFolder(store, arr[0]);
                }
              } catch {}
            }
            applyCharacterChange();
          } else {
            await alertPopup('Felaktig fil.');
          }
        } catch (err) {
          if (err && err.name !== 'AbortError') {
            await alertPopup('Felaktig fil.');
          }
        }
      })();
    }

    /* Ta bort rollperson ----------------------------------- */
    if (id === 'deleteChar') {
      if (!store.current && !(await requireCharacter())) return;
      const char = store.characters.find(c => c.id === store.current);
      if (!(await confirmPopup(`Ta bort “${char.name}”?`))) return;

      const idToDel = store.current;
      const deletedName = char.name;
      storeHelper.deleteCharacter(store, idToDel);
      // Pick a sensible next current character (first in active folder), or none
      let newActiveName = '';
      try {
        const active = storeHelper.getActiveFolder(store);
        const remaining = (store.characters || [])
          .filter(c => !active || active === 'ALL' || (c.folderId || '') === active)
          .slice()
          .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
        store.current = remaining[0]?.id || '';
        newActiveName = remaining[0]?.name || '';
        storeHelper.save(store);
      } catch {}
      lastActiveChar = store.current;
      toast(newActiveName ? `${deletedName} är raderad. ${newActiveName} är aktiv` : `${deletedName} är raderad`);
      applyCharacterChange();
    }

    /* Återställ basegenskaper till 10 ---------------------- */
    if (id === 'resetTraits') {
      if (!store.current && !(await requireCharacter())) return;
      const ok = await confirmPopup('Detta nollställer alla karaktärsdrag till 10. Karaktärsdrag från förmågor och inventarier påverkas inte. Åtgärden kan inte ångras. Vill du fortsätta?');
      if (!ok) return;
      const KEYS = ['Diskret','Kvick','Listig','Stark','Träffsäker','Vaksam','Viljestark','Övertygande'];
      const t = storeHelper.getTraits(store);
      const next = { ...t };
      KEYS.forEach(k => { next[k] = 10; });
      storeHelper.setTraits(store, next);
      if (window.renderTraits) renderTraits();
    }
  });

  /* Ändra total erf direkt när värdet byts */
  dom.xpIn.addEventListener('change', () => {
    const xp = Number(dom.xpIn.value) || 0;
    storeHelper.setBaseXP(store, xp);
    updateXP();
  });

  if (dom.xpPlus) {
    dom.xpPlus.addEventListener('click', () => {
      const xp = storeHelper.getBaseXP(store) + 1;
      storeHelper.setBaseXP(store, xp);
      updateXP();
    });
  }
  if (dom.xpMinus) {
    dom.xpMinus.addEventListener('click', () => {
      const xp = Math.max(0, storeHelper.getBaseXP(store) - 1);
      storeHelper.setBaseXP(store, xp);
      updateXP();
    });
  }

  if (dom.forgeBtn) {
    if (storeHelper.getPartySmith(store)) dom.forgeBtn.classList.add('active');
    dom.forgeBtn.addEventListener('click', () => {
      openSmithPopup(level => {
        if (level === null) return;
        dom.forgeBtn.classList.toggle('active', Boolean(level));
        storeHelper.setPartySmith(store, level);
        invUtil.renderInventory();
        if (window.indexViewUpdate) window.indexViewUpdate();
      });
    });
  }
  if (dom.alcBtn) {
    if (storeHelper.getPartyAlchemist(store)) dom.alcBtn.classList.add('active');
    dom.alcBtn.addEventListener('click', () => {
      openAlchemistPopup(level => {
        if (level === null) return;
        dom.alcBtn.classList.toggle('active', Boolean(level));
        storeHelper.setPartyAlchemist(store, level);
        invUtil.renderInventory();
        if (window.indexViewUpdate) window.indexViewUpdate();
      });
    });
  }
  if (dom.artBtn) {
    if (storeHelper.getPartyArtefacter(store)) dom.artBtn.classList.add('active');
    dom.artBtn.addEventListener('click', () => {
      openArtefacterPopup(level => {
        if (level === null) return;
        dom.artBtn.classList.toggle('active', Boolean(level));
        storeHelper.setPartyArtefacter(store, level);
        invUtil.renderInventory();
        if (window.indexViewUpdate) window.indexViewUpdate();
      });
    });
  }
  if (dom.defBtn) {
    if (storeHelper.getDefenseTrait(store)) dom.defBtn.classList.add('active');
    dom.defBtn.addEventListener('click', () => {
      openDefensePopup(trait => {
        if (trait === null) return;
        dom.defBtn.classList.toggle('active', Boolean(trait));
        storeHelper.setDefenseTrait(store, trait);
        if (window.renderTraits) renderTraits();
      });
    });
  }
  if (dom.filterUnion) {
    if (storeHelper.getFilterUnion(store)) dom.filterUnion.classList.add('active');
    dom.filterUnion.addEventListener('click', () => {
      const val = dom.filterUnion.classList.toggle('active');
      storeHelper.setFilterUnion(store, val);
      if (window.indexViewUpdate) window.indexViewUpdate();
    });
  }
  if (dom.entryViewToggle) {
    if (!storeHelper.getCompactEntries(store)) dom.entryViewToggle.classList.add('active');
    dom.entryViewToggle.addEventListener('click', () => {
      const val = dom.entryViewToggle.classList.toggle('active');
      // "active" betyder nu expanderad/vanlig vy; compact = !active
      storeHelper.setCompactEntries(store, !val);
      if (window.indexViewUpdate) window.indexViewUpdate();
    });
  }
}

// ---------- Popup: Mapphanterare ----------
function openFolderManagerPopup() {
  const pop  = bar.shadowRoot.getElementById('folderManagerPopup');
  const list = bar.shadowRoot.getElementById('folderList');
  const closeBtn = bar.shadowRoot.getElementById('folderManagerDone');
  const closeX   = bar.shadowRoot.getElementById('folderManagerCloseX');
  const addBtn = bar.shadowRoot.getElementById('addFolderBtn');
  const nameIn = bar.shadowRoot.getElementById('newFolderName');
  const moveGroup = bar.shadowRoot.getElementById('folderMoveGroup');
  const moveSel   = bar.shadowRoot.getElementById('folderMoveSelect');
  const moveApply = bar.shadowRoot.getElementById('folderMoveApply');
  const charList  = bar.shadowRoot.getElementById('folderCharList');
  const renamePop    = bar.shadowRoot.getElementById('renameFolderPopup');
  const renameInput  = bar.shadowRoot.getElementById('renameFolderName');
  const renameCancel = bar.shadowRoot.getElementById('renameFolderCancel');
  const renameApply  = bar.shadowRoot.getElementById('renameFolderApply');
  const inner        = pop.querySelector('.popup-inner');
  let cancelRename = null;
  let innerClickStop = null;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, m => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;'
    }[m]));
  }

  function render() {
    const folders = (storeHelper.getFolders(store) || []).slice()
      .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
    // build character count per folder
    const charMap = new Map(); // folderId -> count
    for (const c of (store.characters || [])) {
      const fid = c.folderId || '';
      if (!fid) continue;
      charMap.set(fid, (charMap.get(fid) || 0) + 1);
    }
    // Character multi-select list
    const chars = (store.characters || []).slice()
      .sort((a,b)=>{
        const fa = (store.folders || []).find(f=>f.id===(a.folderId||''))?.name || '';
        const fb = (store.folders || []).find(f=>f.id===(b.folderId||''))?.name || '';
        return fa.localeCompare(fb,'sv') || String(a.name||'').localeCompare(String(b.name||''),'sv');
      });
    if (charList) {
      const selectAll = '<label class="price-item"><span>Välj alla</span><input type="checkbox" data-action="select-all"></label>';
      charList.innerHTML = selectAll + chars.map(c => {
        const fid = c.folderId || '';
        const fname = fid ? ((store.folders||[]).find(f=>f.id===fid)?.name || '') : '';
        const suffix = fname ? ` <span class="sub">(${escapeHtml(fname)})</span>` : '';
        // Ingen karaktär ska vara förvald i Mappar-menyn
        return `<label class="price-item"><span>${escapeHtml(c.name)}${suffix}</span><input type="checkbox" data-charid="${c.id}"></label>`;
      }).join('');
    }
    // Destination folder select
    if (moveSel) {
      const curFolder = store.current ? (storeHelper.getCharacterFolder(store, store.current) || '') : '';
      moveSel.innerHTML = folders.map(f=>`<option value="${f.id}"${f.id===curFolder?' selected':''}>${f.name}</option>`).join('');
    }
    if (!folders.length) {
      list.innerHTML = '<p>Inga mappar ännu.</p>';
      return;
    }
    list.innerHTML = folders.map((f, idx) => {
      const cnt = charMap.get(f.id) || 0;
      const esc = s => String(s || '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
      const delBtn = f.system ? '' : `<button class="mini-btn danger" data-action="delete" title="Ta bort">🗑</button>`;
      const upDisabled = idx === 0 ? ' disabled' : '';
      const downDisabled = idx === folders.length - 1 ? ' disabled' : '';
      return (
        `<div class="folder-row" data-id="${f.id}">
          <div class="folder-name">${esc(f.name)} <span class="count-badge">${cnt}</span></div>
          <div class="folder-actions">
            <button class="mini-btn" data-action="move-up" title="Flytta upp"${upDisabled}>▲</button>
            <button class="mini-btn" data-action="move-down" title="Flytta ned"${downDisabled}>▼</button>
            <button class="mini-btn" data-action="rename" title="Byt namn">✏️</button>
            <button class="mini-btn danger" data-action="clear" title="Töm mapp">🧹</button>
            ${delBtn}
          </div>
        </div>`
      );
    }).join('');
  }

  async function showRenamePopup(currentName) {
    if (!renamePop || !renameInput || !renameApply || !renameCancel) {
      const fallback = prompt('Nytt mappnamn?', currentName || '');
      const trimmed = String(fallback || '').trim();
      return trimmed || null;
    }
    renameInput.value = String(currentName || '').trim();
    renamePop.classList.add('open');
    renamePop.querySelector('.popup-inner').scrollTop = 0;
    setTimeout(() => renameInput.focus(), 0);

    return await new Promise(resolve => {
      let done = false;
      const renameInner = renamePop.querySelector('.popup-inner');
      const stopBubble = e => e.stopPropagation();
      renameInner?.addEventListener('click', stopBubble);
      function finish(result) {
        if (done) return;
        done = true;
        renamePop.classList.remove('open');
        renameApply.removeEventListener('click', onApply);
        renameCancel.removeEventListener('click', onCancel);
        renamePop.removeEventListener('click', onOutside);
        document.removeEventListener('keydown', onKey);
        renameInner?.removeEventListener('click', stopBubble);
        cancelRename = null;
        resolve(result);
      }
      function onApply() {
        const val = String(renameInput.value || '').trim();
        if (!val) { renameInput.focus(); return; }
        finish(val);
      }
      function onCancel() { finish(null); }
      function onOutside(e) {
        if (!renamePop.querySelector('.popup-inner').contains(e.target)) finish(null);
      }
      function onKey(e) {
        if (e.key === 'Escape') finish(null);
        else if (e.key === 'Enter') onApply();
      }
      renameApply.addEventListener('click', onApply);
      renameCancel.addEventListener('click', onCancel);
      renamePop.addEventListener('click', onOutside);
      document.addEventListener('keydown', onKey);
      cancelRename = () => finish(null);
    });
  }

  async function onListClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const row = e.target.closest('[data-id]');
    if (!row) return;
    if (el.disabled || el.matches('[disabled]')) return;
    e.stopPropagation();
    const id = row.getAttribute('data-id');
    const action = el.getAttribute('data-action');
    if (action === 'rename') {
      const folders = storeHelper.getFolders(store) || [];
      const f = folders.find(x=>x.id===id);
      const nm = await showRenamePopup(f ? f.name : '');
      if (!nm) return;
      storeHelper.renameFolder(store, id, nm);
      render();
      refreshCharSelect();
    } else if (action === 'clear') {
      const folders = storeHelper.getFolders(store) || [];
      const f = folders.find(x=>x.id===id);
      const cnt = (store.characters || []).filter(c => (c.folderId || '') === id).length;
      if (!cnt) { await alertPopup('Mappen är tom.'); return; }
      const name = f ? (f.name || 'Mapp') : 'Mapp';
      const ok = await confirmPopup(`Töm mapp “${name}”? Detta raderar ${cnt} karaktärer permanent.`);
      if (!ok) return;
      if (storeHelper.deleteCharactersInFolder) {
        storeHelper.deleteCharactersInFolder(store, id);
      } else {
        const ids = (store.characters || []).filter(c => (c.folderId || '') === id).map(c => c.id);
        ids.forEach(cid => storeHelper.deleteCharacter(store, cid));
      }
      refreshCharSelect();
      render();
      applyCharacterChange();
    } else if (action === 'delete') {
      const folders = storeHelper.getFolders(store) || [];
      const f = folders.find(x=>x.id===id);
      if (f && f.system) { await alertPopup('Systemmappen “Standard” kan inte tas bort.'); return; }
      if (!(await confirmPopup('Ta bort mapp? Karaktärer flyttas till “Standard”.'))) return;
      storeHelper.deleteFolder(store, id);
      render();
      refreshCharSelect();
    } else if (action === 'move-up' || action === 'move-down') {
      const offset = action === 'move-up' ? -1 : 1;
      storeHelper.moveFolder(store, id, offset);
      render();
      refreshCharSelect();
    }
  }

  function onAdd() {
    const nm = String(nameIn.value || '').trim();
    if (!nm) return;
    storeHelper.addFolder(store, nm);
    nameIn.value = '';
    render();
    refreshCharSelect();
  }

  function close() {
    pop.classList.remove('open');
    list.removeEventListener('click', onListClick);
    closeBtn?.removeEventListener('click', onClose);
    closeX?.removeEventListener('click', onClose);
    addBtn.removeEventListener('click', onAdd);
    moveApply?.removeEventListener('click', onMoveApply);
    charList?.removeEventListener('change', onCharListChange);
    cancelRename?.();
    pop.removeEventListener('click', onOutside);
    if (inner && innerClickStop) inner.removeEventListener('click', innerClickStop);
    innerClickStop = null;
  }
  function onClose() { close(); }
  function onOutside(e) {
    const inner = pop.querySelector('.popup-inner');
    if (inner?.contains(e.target)) return;
    if (renamePop?.classList.contains('open')) {
      const renameInner = renamePop.querySelector('.popup-inner');
      if (renameInner?.contains(e.target)) return;
    }
    close();
  }
  function onMoveApply() {
    const dest = (moveSel && moveSel.value) || '';
    if (!charList) return;
    const ids = [...charList.querySelectorAll('input[type="checkbox"][data-charid]:checked')]
      .map(ch => ch.dataset.charid);
    if (!ids.length) return;
    if (storeHelper.setCharactersFolderBulk) {
      storeHelper.setCharactersFolderBulk(store, ids, dest || '');
    } else {
      ids.forEach(id => storeHelper.setCharacterFolder(store, id, dest || ''));
    }
    refreshCharSelect();
    render();
    // Keep popup open after moving characters
  }

  function onCharListChange(e) {
    const el = e.target;
    if (el.matches('input[type="checkbox"][data-action="select-all"]')) {
      const checked = el.checked;
      charList.querySelectorAll('input[type="checkbox"][data-charid]').forEach(cb => {
        cb.checked = checked;
      });
    } else if (el.matches('input[type="checkbox"][data-charid]')) {
      const allBox = charList.querySelector('input[type="checkbox"][data-action="select-all"]');
      if (!allBox) return;
      if (!el.checked) {
        allBox.checked = false;
      } else {
        const allChecked = [...charList.querySelectorAll('input[type="checkbox"][data-charid]')].every(cb => cb.checked);
        allBox.checked = allChecked;
      }
    }
  }

  render();
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  list.addEventListener('click', onListClick);
  closeBtn?.addEventListener('click', onClose);
  closeX?.addEventListener('click', onClose);
  addBtn.addEventListener('click', onAdd);
  moveApply?.addEventListener('click', onMoveApply);
  charList?.addEventListener('change', onCharListChange);
  pop.addEventListener('click', onOutside);
  if (inner) {
    innerClickStop = e => e.stopPropagation();
    inner.addEventListener('click', innerClickStop);
  }
}

function openAlchemistPopup(cb) {
  const pop  = bar.shadowRoot.getElementById('alcPopup');
  const box  = bar.shadowRoot.getElementById('alcOptions');
  const cls  = bar.shadowRoot.getElementById('alcCancel');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    box.removeEventListener('click', onBtn);
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
  }
  function onBtn(e) {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    const lvl = b.dataset.level;
    close();
    cb(lvl);
  }
  function onCancel() { close(); cb(null); }
  function onOutside(e) {
    if(!pop.querySelector('.popup-inner').contains(e.target)){
      close();
      cb(null);
    }
  }
  box.addEventListener('click', onBtn);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
}

function openSmithPopup(cb) {
  const pop  = bar.shadowRoot.getElementById('smithPopup');
  const box  = bar.shadowRoot.getElementById('smithOptions');
  const cls  = bar.shadowRoot.getElementById('smithCancel');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    box.removeEventListener('click', onBtn);
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
  }
  function onBtn(e) {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    const lvl = b.dataset.level;
    close();
    cb(lvl);
  }
  function onCancel() { close(); cb(null); }
  function onOutside(e) {
    if(!pop.querySelector('.popup-inner').contains(e.target)){
      close();
      cb(null);
    }
  }
  box.addEventListener('click', onBtn);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
}

function openArtefacterPopup(cb) {
  const pop  = bar.shadowRoot.getElementById('artPopup');
  const box  = bar.shadowRoot.getElementById('artOptions');
  const cls  = bar.shadowRoot.getElementById('artCancel');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    box.removeEventListener('click', onBtn);
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
  }
  function onBtn(e) {
    const b = e.target.closest('button[data-level]');
    if (!b) return;
    const lvl = b.dataset.level;
    close();
    cb(lvl);
  }
  function onCancel() { close(); cb(null); }
  function onOutside(e) {
    if(!pop.querySelector('.popup-inner').contains(e.target)){
      close();
      cb(null);
    }
  }
  box.addEventListener('click', onBtn);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
}

function openDefensePopup(cb) {
  const pop  = bar.shadowRoot.getElementById('defensePopup');
  const box  = bar.shadowRoot.getElementById('defenseOptions');
  const cls  = bar.shadowRoot.getElementById('defenseCancel');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    box.removeEventListener('click', onBtn);
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
  }
  function onBtn(e) {
    const b = e.target.closest('button[data-trait]');
    if (!b) return;
    const tr = b.dataset.trait;
    close();
    cb(tr);
  }
  function onCancel() { close(); cb(null); }
  function onOutside(e) {
    if(!pop.querySelector('.popup-inner').contains(e.target)){
      close();
      cb(null);
    }
  }
  box.addEventListener('click', onBtn);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
}

async function saveJsonFile(jsonText, suggested) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{
          description: 'JSON',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonText);
      await writable.close();
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        await alertPopup('Sparande misslyckades');
      }
    }
  } else {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggested;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function sanitizeFilename(name) {
  try {
    let s = String(name || '').normalize('NFC');
    // Replace invalid characters for Windows/macOS/Linux
    s = s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    // Remove trailing dots and spaces (Windows)
    s = s.replace(/[\.\s]+$/g, '');
    // Avoid reserved device names on Windows
    const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    if (reserved.test(s)) s = '_' + s;
    if (!s) s = 'fil';
    // Guard length
    if (s.length > 150) s = s.slice(0, 150);
    return s;
  } catch {
    return 'fil';
  }
}

async function exportCharacterFile(id) {
  const data = storeHelper.exportCharacterJSON(store, id);
  if (!data) return;
  const jsonText = JSON.stringify(data, null, 2);
  const suggested = `${sanitizeFilename(data.name || 'rollperson')}.json`;
  await saveJsonFile(jsonText, suggested);
}

async function exportAllCharacters() {
  // Export all characters into a single JSON file
  const all = store.characters
    .map(c => storeHelper.exportCharacterJSON(store, c.id, false))
    .filter(Boolean);
  const jsonText = JSON.stringify(all, null, 2);
  const suggested = 'Rollpersoner.json';
  await saveJsonFile(jsonText, suggested);
}

async function exportAllCharactersSeparate() {
  const all = store.characters
    .map(c => storeHelper.exportCharacterJSON(store, c.id))
    .filter(Boolean);
  if (!all.length) return;

  // Prefer directory picker when available for a nicer UX
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const data of all) {
        const name = (data && data.name) ? data.name : 'rollperson';
        const fileName = `${sanitizeFilename(name)}.json`;
        try {
          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(data, null, 2));
          await writable.close();
        } catch (err) {
          // Skip file on error (e.g., permission denied for overwrite)
        }
      }
      return;
    } catch (err) {
      // If user cancels or API fails, fall back to download approach
      if (err && err.name === 'AbortError') return;
    }
  }

  // Fallback: trigger one download per character
  for (const data of all) {
    const name = (data && data.name) ? data.name : 'rollperson';
    const jsonText = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sanitizeFilename(name)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await new Promise(r => setTimeout(r, 100));
  }
}

async function exportAllCharactersZipped() {
  const all = store.characters
    .map(c => storeHelper.exportCharacterJSON(store, c.id, false))
    .filter(Boolean);
  if (!all.length) return;

  if (!window.JSZip) {
    // Fallback to separate if JSZip not loaded
    await exportAllCharactersSeparate();
    return;
  }

  const zip = new JSZip();
  for (const data of all) {
    const name = sanitizeFilename((data && data.name) ? data.name : 'rollperson');
    zip.file(`${name}.json`, JSON.stringify(data, null, 2));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  await saveBlobFile(blob, 'Rollpersoner.zip');
}


async function saveBlobFile(blob, suggested) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggested;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportActiveFolder() {
  try {
    const activeId = storeHelper.getActiveFolder(store);
    if (!activeId || activeId === 'ALL') {
      await alertPopup('Ingen aktiv mapp vald.');
      return;
    }
    const folders = storeHelper.getFolders(store) || [];
    const folder = folders.find(f => f.id === activeId);
    if (!folder) {
      await alertPopup('Kunde inte hitta aktiv mapp.');
      return;
    }
    const chars = (store.characters || [])
      .filter(c => (c.folderId || '') === activeId)
      .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
    if (!chars.length) {
      await alertPopup('Mappen är tom.');
      return;
    }
    const exported = chars
      .map(c => storeHelper.exportCharacterJSON(store, c.id, false))
      .filter(Boolean);
    const payload = {
      folders: [
        {
          folder: folder.name || 'Mapp',
          folderId: folder.id,
          id: folder.id,
          characters: exported
        }
      ]
    };
    const jsonText = JSON.stringify(payload, null, 2);
    const suggested = `Mapp - ${sanitizeFilename(folder.name || 'Mapp')}.json`;
    await saveJsonFile(jsonText, suggested);
  } catch (err) {
    await alertPopup('Export av mapp misslyckades.');
  }
}

async function exportActiveFolderSeparate() {
  try {
    const activeId = storeHelper.getActiveFolder(store);
    if (!activeId || activeId === 'ALL') { await alertPopup('Ingen aktiv mapp vald.'); return; }
    const folders = storeHelper.getFolders(store) || [];
    const folder = folders.find(f => f.id === activeId);
    if (!folder) { await alertPopup('Kunde inte hitta aktiv mapp.'); return; }

    const chars = (store.characters || [])
      .filter(c => (c.folderId || '') === activeId)
      .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
    if (!chars.length) { await alertPopup('Mappen är tom.'); return; }

    const all = chars
      .map(c => storeHelper.exportCharacterJSON(store, c.id, true))
      .filter(Boolean);

    // Prefer directory picker
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        for (const data of all) {
          const name = (data && data.name) ? data.name : 'rollperson';
          const fileName = `${sanitizeFilename(name)}.json`;
          try {
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();
          } catch {}
        }
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    // Fallback: one download per character
    for (const data of all) {
      const name = (data && data.name) ? data.name : 'rollperson';
      const jsonText = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${sanitizeFilename(name)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      await new Promise(r => setTimeout(r, 100));
    }
  } catch {
    await alertPopup('Export av mapp misslyckades.');
  }
}

async function exportActiveFolderZipped() {
  try {
    const activeId = storeHelper.getActiveFolder(store);
    if (!activeId || activeId === 'ALL') { await alertPopup('Ingen aktiv mapp vald.'); return; }
    const folders = storeHelper.getFolders(store) || [];
    const folder = folders.find(f => f.id === activeId);
    if (!folder) { await alertPopup('Kunde inte hitta aktiv mapp.'); return; }

    const chars = (store.characters || [])
      .filter(c => (c.folderId || '') === activeId)
      .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
    if (!chars.length) { await alertPopup('Mappen är tom.'); return; }

    if (!window.JSZip) { await exportActiveFolderSeparate(); return; }

    const zip = new JSZip();
    for (const c of chars) {
      const data = storeHelper.exportCharacterJSON(store, c.id, true);
      if (!data) continue;
      const name = sanitizeFilename((data && data.name) ? data.name : 'rollperson');
      zip.file(`${name}.json`, JSON.stringify(data, null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const suggested = `Mapp - ${sanitizeFilename(folder.name || 'Mapp')}.zip`;
    await saveBlobFile(blob, suggested);
  } catch {
    await alertPopup('Export av mapp misslyckades.');
  }
}
function openChoicePopup(build, cb) {
  const pop  = bar.shadowRoot.getElementById('exportPopup');
  const opts = bar.shadowRoot.getElementById('exportOptions');
  const cls  = bar.shadowRoot.getElementById('exportCancel');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
    opts.innerHTML = '';
  }
  function onCancel() { close(); cb(null); }
  function onOutside(e) {
    if (!pop.querySelector('.popup-inner').contains(e.target)) {
      close();
      cb(null);
    }
  }
  opts.innerHTML = '';
  const select = value => { close(); cb(value); };
  build(opts, select);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
}

function openExportPopup(cb) {
  openChoicePopup((opts, select) => {
    const make = (tag, cls, text) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text != null) el.textContent = text;
      return el;
    };

    // Wrapper for sections
    const wrap = make('div', 'export-sections');

    // Section: Backups (All / Active folder)
    const backupsCard = make('div', 'card export-card');
    backupsCard.appendChild(make('div', 'card-title', 'Säkerhetskopior'));
    const backups = make('div', 'export-section');

    const addRow = (label, scope, enabled = true) => {
      const row = make('div', 'export-row');
      row.appendChild(make('div', 'row-title', label));
      const actions = make('div', 'row-actions');
      const addMini = (txt, value) => {
        const b = make('button', 'char-btn mini', txt);
        if (enabled) {
          b.addEventListener('click', () => select(value));
        } else {
          b.disabled = true;
          b.title = 'Välj aktiv mapp i Filter-menyn först';
        }
        actions.appendChild(b);
      };
      if (scope === 'all') {
        addMini('En fil', 'all-one');
        addMini('Isär', 'all-separate');
        addMini('Zip', 'all-zip');
      } else if (scope === 'folder') {
        addMini('En fil', 'folder-active');
        addMini('Isär', 'folder-separate');
        addMini('Zip', 'folder-zip');
      }
      row.appendChild(actions);
      backups.appendChild(row);
    };
    addRow('Alla rollpersoner', 'all', true);

    // Active folder actions (if any)
    try {
      const activeId = storeHelper.getActiveFolder(store);
      if (activeId && activeId !== 'ALL') {
        const folders = storeHelper.getFolders(store) || [];
        const folder = folders.find(f => f.id === activeId);
        if (folder) {
          addRow(`Aktiv mapp: ${folder.name}`, 'folder', true);
        }
      }
      // If no active folder is selected, do not render the row
    } catch {}

    backupsCard.appendChild(backups);
    wrap.appendChild(backupsCard);

    // Section: Single character export
    const singlesCard = make('div', 'card export-card');
    singlesCard.appendChild(make('div', 'card-title', 'Enskild rollperson'));
    const singles = make('div', 'export-section');

    // Current character shortcut
    const currentId = store.current;
    if (currentId) {
      const curChar = store.characters.find(c => c.id === currentId);
      if (curChar) {
        const btn = make('button', 'char-btn primary', `Aktuell: ${curChar.name || 'Namnlös'}`);
        btn.addEventListener('click', () => select(curChar.id));
        singles.appendChild(btn);
      }
    }

    // Search field
    const searchWrap = make('div', 'export-search');
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Filtrera namn…';
    search.autocomplete = 'off';
    searchWrap.appendChild(search);
    singles.appendChild(searchWrap);

    // Character list grouped by folder
    const listWrap = make('div', 'export-list');

    const folders = (storeHelper.getFolders(store) || []).slice()
      .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
    const map = new Map();
    for (const c of (store.characters || [])) {
      const fid = c.folderId || '';
      if (!map.has(fid)) map.set(fid, []);
      map.get(fid).push(c);
    }

    const groupEls = [];
    const seen = new Set();
    for (const f of folders) {
      const arr = (map.get(f.id) || []).slice()
        .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
      if (!arr.length) continue;
      const grp = make('div', 'export-group');
      grp.appendChild(make('div', 'group-title', f.name || 'Mapp'));
      const gl = make('div', 'group-list');
      for (const c of arr) {
        const b = make('button', 'char-btn small', c.name || 'Namnlös');
        b.dataset.value = c.id;
        b.addEventListener('click', () => select(c.id));
        gl.appendChild(b);
      }
      grp.appendChild(gl);
      listWrap.appendChild(grp);
      groupEls.push(grp);
      seen.add(f.id);
    }

    // Any characters in unknown/no folder
    const rest = [];
    for (const [fid, arr] of map.entries()) {
      if (seen.has(fid)) continue;
      rest.push(...arr);
    }
    if (rest.length) {
      const arr = rest.slice().sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
      const grp = make('div', 'export-group');
      grp.appendChild(make('div', 'group-title', 'Övrigt'));
      const gl = make('div', 'group-list');
      for (const c of arr) {
        const b = make('button', 'char-btn small', c.name || 'Namnlös');
        b.dataset.value = c.id;
        b.addEventListener('click', () => select(c.id));
        gl.appendChild(b);
      }
      grp.appendChild(gl);
      listWrap.appendChild(grp);
      groupEls.push(grp);
    }

    singles.appendChild(listWrap);
    singlesCard.appendChild(singles);
    wrap.appendChild(singlesCard);
    opts.appendChild(wrap);

    // Filtering
    const normalize = s => String(s || '').toLocaleLowerCase('sv');
    search.addEventListener('input', () => {
      const q = normalize(search.value);
      for (const grp of groupEls) {
        let visibleCount = 0;
        const buttons = grp.querySelectorAll('.group-list .char-btn');
        buttons.forEach(b => {
          const show = !q || normalize(b.textContent).includes(q);
          b.style.display = show ? '' : 'none';
          if (show) visibleCount++;
        });
        grp.style.display = visibleCount ? '' : 'none';
      }
    });
  }, cb);
}

// Popup: Importera – välj mål för import via två knappar
// Returnerar { mode: 'choose'|'fromFile', folderId?: string, makeActive: boolean }
async function openImportPopup() {
  const pop = bar?.shadowRoot?.getElementById('importPopup');
  if (!pop) return null;

  const btnChoose= bar.shadowRoot.getElementById('importBtnChoose');
  const btnFrom  = bar.shadowRoot.getElementById('importBtnFromFile');
  const folderEl = bar.shadowRoot.getElementById('importFolderSelect');
  const makeActChoose = bar.shadowRoot.getElementById('importMakeActiveChoose');
  const makeActFrom   = bar.shadowRoot.getElementById('importMakeActiveFromDir');
  const cancel   = bar.shadowRoot.getElementById('importCancel');

  if (!btnChoose || !btnFrom || !folderEl || !cancel) return null;

  // Fyll mapp-listan
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  folderEl.innerHTML = folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

  // Aktiv mapp – sätt förval i dropdown
  let activeId = 'ALL';
  try { activeId = storeHelper.getActiveFolder(store); } catch {}
  const activeFolder = folders.find(f => f.id === activeId);
  let defaultFolderId = '';
  if (activeFolder && activeId && activeId !== 'ALL') {
    defaultFolderId = activeFolder.id;
  } else {
    const std = folders.find(f => f.system) || folders.find(f => (f.name||'') === 'Standard') || folders[0];
    if (std) defaultFolderId = std.id;
  }
  if (defaultFolderId && folderEl) folderEl.value = defaultFolderId;

  // Återställ kryssrutor (standard: av)
  if (makeActChoose) makeActChoose.checked = false;
  if (makeActFrom)   makeActFrom.checked = false;

  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;

  return await new Promise(resolve => {
    function close(res) {
      pop.classList.remove('open');
      cancel.removeEventListener('click', onCancel);
      btnChoose?.removeEventListener('click', onChoose);
      btnFrom?.removeEventListener('click', onFrom);
      pop.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
      resolve(res);
    }
    function onCancel() { close(null); }
    function onOutside(e) {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
    }
    function onChoose() {
      const folderId = folderEl.value || '';
      if (!folderId) return;
      close({ mode: 'choose', folderId, makeActive: !!makeActChoose?.checked });
    }
    function onFrom() {
      close({ mode: 'fromFile', makeActive: !!makeActFrom?.checked });
    }
    cancel.addEventListener('click', onCancel);
    btnChoose?.addEventListener('click', onChoose);
    btnFrom?.addEventListener('click', onFrom);
    pop.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
  });
}

async function chooseSeparateExportMode() {
  const res = await openDialog('Välj exportformat', {
    cancel: true,
    okText: 'Separat',
    extraText: 'Zippade',
    cancelText: 'Avbryt'
  });
  if (res === 'extra') return 'zip';
  if (res === true) return 'separate';
  return null;
}

async function getFilesFromDirectory(dirHandle) {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      if (name.toLowerCase().endsWith('.json')) {
        try { files.push(await handle.getFile()); } catch {}
      }
    } else if (handle.kind === 'directory') {
      try {
        const nested = await getFilesFromDirectory(handle);
        files.push(...nested);
      } catch {}
    }
  }
  return files;
}

function openNilasPopup(cb) {
  const pop = bar.shadowRoot.getElementById('nilasPopup');
  const yes = bar.shadowRoot.getElementById('nilasYes');
  const no  = bar.shadowRoot.getElementById('nilasNo');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    yes.removeEventListener('click', onYes);
    no.removeEventListener('click', onNo);
    pop.removeEventListener('click', onOutside);
  }
  function onYes() { close(); cb(true); }
  function onNo()  { close(); cb(false); }
  function onOutside(e) {
    if (!pop.querySelector('.popup-inner').contains(e.target)) {
      close();
      cb(false);
    }
  }
  yes.addEventListener('click', onYes);
  no.addEventListener('click', onNo);
  pop.addEventListener('click', onOutside);
}

function tryNilasPopup(term) {
  if (term.toLowerCase() !== 'nilas') return false;
  if (storeHelper.getNilasPopupSeen(store)) return false;
  openNilasPopup(agree => {
    if (agree) {
      const xp = storeHelper.getBaseXP(store) + 1;
      storeHelper.setBaseXP(store, xp);
      updateXP();
    }
    storeHelper.setNilasPopupSeen(store, true);
  });
  return true;
}

function tryBomb(term) {
  if (term !== 'BOMB!') return false;
  storeHelper.deleteAllCharacters(store);
  location.reload();
  return true;
}

// Popup: Ny rollperson med mappval
// preferredFolderId: välj denna som default om giltig; om 'ALL' → Standard
async function openNewCharPopupWithFolder(preferredFolderId) {
  const pop = bar?.shadowRoot?.getElementById('newCharPopup');
  if (!pop) return null;
  const nameIn   = bar.shadowRoot.getElementById('newCharName');
  const folderEl = bar.shadowRoot.getElementById('newCharFolder');
  const xpIn     = bar.shadowRoot.getElementById('newCharXp');
  const create   = bar.shadowRoot.getElementById('newCharCreate');
  const cancel   = bar.shadowRoot.getElementById('newCharCancel');

  // Fyll mapp-listan
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  let html = '';
  for (const f of folders) html += `<option value="${f.id}">${f.name}</option>`;
  folderEl.innerHTML = html;
  // Förvald mapp: aktuell aktiv om satt och giltig; annars system (Standard)
  const std = folders.find(f => f.system) || folders.find(f => (f.name||'') === 'Standard');
  const validPref = preferredFolderId && preferredFolderId !== 'ALL' && folders.some(f => f.id === preferredFolderId);
  if (validPref) folderEl.value = preferredFolderId;
  else if (std) folderEl.value = std.id;
  else if (folders[0]) folderEl.value = folders[0].id;

  nameIn.value = '';
  if (xpIn) xpIn.value = 0;

  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  setTimeout(()=> nameIn.focus(), 0);

  return await new Promise(resolve => {
    function close(res) {
      pop.classList.remove('open');
      create.removeEventListener('click', onCreate);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
      resolve(res);
    }
    function onCreate() {
      const name = String(nameIn.value||'').trim();
      if (!name) { nameIn.focus(); return; }
      const folderId = folderEl.value || '';
      const xp = Number(xpIn?.value || 0) || 0;
      close({ name, folderId, xp });
    }
    function onCancel() { close(null); }
    function onOutside(e) {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') onCreate();
    }
    create.addEventListener('click', onCreate);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
  });
}

// Popup: Byt namn med mappval
// preferredFolderId: välj denna som default om giltig; om 'ALL' → Standard
// defaultName: förifyllt namn
async function openRenameCharPopupWithFolder(preferredFolderId, defaultName) {
  const pop = bar?.shadowRoot?.getElementById('renameCharPopup');
  if (!pop) return null;
  const nameIn   = bar.shadowRoot.getElementById('renameCharName');
  const folderEl = bar.shadowRoot.getElementById('renameCharFolder');
  const applyBtn = bar.shadowRoot.getElementById('renameCharApply');
  const cancel   = bar.shadowRoot.getElementById('renameCharCancel');

  // Fyll mapp-listan
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  let html = '';
  for (const f of folders) html += `<option value="${f.id}">${f.name}</option>`;
  folderEl.innerHTML = html;
  // Förvald mapp
  const std = folders.find(f => f.system) || folders.find(f => (f.name||'') === 'Standard');
  const validPref = preferredFolderId && preferredFolderId !== 'ALL' && folders.some(f => f.id === preferredFolderId);
  if (validPref) folderEl.value = preferredFolderId;
  else if (std) folderEl.value = std.id;
  else if (folders[0]) folderEl.value = folders[0].id;

  nameIn.value = String(defaultName || '').trim();

  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  setTimeout(()=> nameIn.focus(), 0);

  return await new Promise(resolve => {
    function close(res) {
      pop.classList.remove('open');
      applyBtn.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
      resolve(res);
    }
    function onApply() {
      const name = String(nameIn.value||'').trim();
      if (!name) { nameIn.focus(); return; }
      const folderId = folderEl.value || '';
      close({ name, folderId });
    }
    function onCancel() { close(null); }
    function onOutside(e) {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') onApply();
    }
    applyBtn.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
  });
}

// Popup: Kopiera rollperson med mappval
// preferredFolderId: välj denna som default om giltig; om 'ALL' → Standard
// defaultName: förifyllt namn (t.ex. "<namn> (kopia)")
async function openDuplicateCharPopupWithFolder(preferredFolderId, defaultName) {
  const pop = bar?.shadowRoot?.getElementById('dupCharPopup');
  if (!pop) return null;
  const nameIn   = bar.shadowRoot.getElementById('dupCharName');
  const folderEl = bar.shadowRoot.getElementById('dupCharFolder');
  const create   = bar.shadowRoot.getElementById('dupCharCreate');
  const cancel   = bar.shadowRoot.getElementById('dupCharCancel');

  // Fyll mapp-listan
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  let html = '';
  for (const f of folders) html += `<option value="${f.id}">${f.name}</option>`;
  folderEl.innerHTML = html;
  // Förvald mapp
  const std = folders.find(f => f.system) || folders.find(f => (f.name||'') === 'Standard');
  const validPref = preferredFolderId && preferredFolderId !== 'ALL' && folders.some(f => f.id === preferredFolderId);
  if (validPref) folderEl.value = preferredFolderId;
  else if (std) folderEl.value = std.id;
  else if (folders[0]) folderEl.value = folders[0].id;

  nameIn.value = String(defaultName || '').trim();

  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  setTimeout(()=> nameIn.focus(), 0);

  return await new Promise(resolve => {
    function close(res) {
      pop.classList.remove('open');
      create.removeEventListener('click', onCreate);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
      resolve(res);
    }
    function onCreate() {
      const name = String(nameIn.value||'').trim();
      if (!name) { nameIn.focus(); return; }
      const folderId = folderEl.value || '';
      close({ name, folderId });
    }
    function onCancel() { close(null); }
    function onOutside(e) {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') onCreate();
    }
    create.addEventListener('click', onCreate);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
  });
}

async function requireCharacter() {
  if (store.current) return true;
  let pop = document.getElementById('charPopup');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'charPopup';
    pop.className = 'popup';
    pop.innerHTML = `
      <div class="popup-inner">
        <p>Handlingen kräver att du har en aktiv karaktär</p>
        <div class="button-row">
          <button id="charReqCancel" class="char-btn danger">Avbryt</button>
          <button id="charReqChoose" class="char-btn">Välj karaktär</button>
          <button id="charReqNew" class="char-btn">Skapa karaktär?</button>
        </div>
        <div id="charPopupContent" style="display:none;">
          <select id="charReqSelect"></select>
        </div>
      </div>`;
    document.body.appendChild(pop);
  }

  const wrap   = pop.querySelector('#charPopupContent');
  const select = pop.querySelector('#charReqSelect');
  const btnChoose = pop.querySelector('#charReqChoose');
  const btnNew    = pop.querySelector('#charReqNew');
  const btnCancel = pop.querySelector('#charReqCancel');

  renderCharOptions(select);
  wrap.style.display = 'none';

  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;

  return await new Promise(resolve => {
    function close(res) {
      pop.classList.remove('open');
      btnChoose.removeEventListener('click', onChoose);
      btnNew.removeEventListener('click', onNew);
      btnCancel.removeEventListener('click', onCancel);
      select.removeEventListener('change', onSelect);
      pop.removeEventListener('click', onClickOut);
      document.removeEventListener('keydown', onKey);
      resolve(res);
    }
    function onClickOut(e) {
      if (e.target === pop) close(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
    }
    function onChoose() {
      wrap.style.display = '';
      select.focus();
    }
    function onSelect() {
      const val = select.value;
      if (!val) return;
      store.current = val;
      storeHelper.save(store);
      refreshCharSelect();
      if (dom.cName) dom.cName.textContent = store.characters.find(c=>c.id===val)?.name||'';
      close(true);
      applyCharacterChange();
    }
    async function onNew() {
      const active = storeHelper.getActiveFolder(store);
      const res = await openNewCharPopupWithFolder(active);
      if (!res) return;
      const { name, folderId, xp } = res;
      if (!name) return;
      const charId = (storeHelper.makeCharId ? storeHelper.makeCharId(store) : ('rp' + Date.now()));
      store.characters.push({ id: charId, name, folderId: folderId || '' });
      store.data[charId] = { baseXp: Number(xp) || 0, custom: [] };
      store.current = charId;
      // Om vald mapp skiljer sig från aktiv – växla aktiv mapp till den nya
      const prevActive = storeHelper.getActiveFolder(store);
      if (folderId && prevActive !== folderId) {
        storeHelper.setActiveFolder(store, folderId);
      }
      storeHelper.save(store);
      refreshCharSelect();
      if (dom.cName) dom.cName.textContent = name;
      close(true);
      applyCharacterChange();
    }
    function onCancel() { close(false); }

    btnChoose.addEventListener('click', onChoose);
    btnNew.addEventListener('click', onNew);
    btnCancel.addEventListener('click', onCancel);
    select.addEventListener('change', onSelect);
    pop.addEventListener('click', onClickOut);
    document.addEventListener('keydown', onKey);
  });
}

function renderCharOptions(sel) {
  const folders = (storeHelper.getFolders(store) || []).slice()
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0) || String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  const map = new Map();
  for (const c of (store.characters || [])) {
    const fid = c.folderId || '';
    if (!map.has(fid)) map.set(fid, []);
    map.get(fid).push(c);
  }
  const renderOpts = arr => (arr||[])
    .slice()
    .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'))
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join('');
  let html = '<option value="">Välj rollperson …</option>';
  for (const f of folders) {
    const arr = map.get(f.id) || [];
    if (!arr.length) continue;
    html += `<optgroup label="${f.name}">${renderOpts(arr)}</optgroup>`;
  }
  sel.innerHTML = html;
}



function updateXP() {
  const list  = storeHelper.getCurrentList(store);
  const base  = storeHelper.getBaseXP(store);
  const effects = storeHelper.getArtifactEffects(store);
  const used  = storeHelper.calcUsedXP(list, effects);
  const total = storeHelper.calcTotalXP(base, list);
  const free  = total - used;
  dom.xpOut.textContent = free;
  dom.xpIn.value = base;
  const xpContainer = dom.xpOut.closest('.exp-counter');
  if (xpContainer) xpContainer.classList.toggle('under', free < 0);
  if (dom.xpTotal) dom.xpTotal.textContent = total;
  if (dom.xpUsed)  dom.xpUsed.textContent  = used;
  if (dom.xpFree)  dom.xpFree.textContent  = free;
  if (dom.xpSum)   dom.xpSum.classList.toggle('under', free < 0);
}
/* -----------------------------------------------------------
   Synk mellan flikar – endast när AKTUELLA rollpersonen ändras
   Detta låter två flikar ha olika rollpersoner öppna samtidigt
   utan att tvinga varandra att reloada.
------------------------------------------------------------ */
window.addEventListener('storage', (e)=>{
  try {
    if (e && e.key && e.key !== 'rpall') return; // vi bryr oss bara om vår store

    // Om ingen rollperson är vald i denna flik – följ med på ändringar
    if (!store || !store.current) {
      store = storeHelper.load();
      applyCharacterChange();
      return;
    }

    // Jämför bara data för den rollperson som är aktiv i denna flik
    const incoming = e && typeof e.newValue === 'string' ? JSON.parse(e.newValue) : storeHelper.load();
    const curId = store.current;

    const curDataOld = (store.data && store.data[curId]) || null;
    const curDataNew = (incoming && incoming.data && incoming.data[curId]) || null;

    // Ändrat namn på aktuell rollperson?
    const findName = (s) => {
      try { return (s.characters || []).find(c => c.id === curId)?.name || null; } catch { return null; }
    };
    const nameOld = findName(store);
    const nameNew = findName(incoming);

  const changedCurrent = (
      JSON.stringify(curDataOld ?? null) !== JSON.stringify(curDataNew ?? null)
    ) || (nameOld !== nameNew);

    if (changedCurrent) {
      store = storeHelper.load();
      applyCharacterChange();
    }
    // I övriga fall (t.ex. annan flik byter current, eller ändrar annan rollperson)
    // gör vi inget – denna flik fortsätter ostört.
  } catch {
    // Vid minsta fel, falla tillbaka till tidigare beteende för säkerhet
    try { store = storeHelper.load(); applyCharacterChange(); } catch {}
  }
});
