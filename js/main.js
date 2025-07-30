/* ===========================================================
   js/main.js – gemensam logik för index- och character-vy
   Fungerar ihop med Web Component <shared-toolbar>
   2025-06-20
   =========================================================== */

/* ---------- Grunddata & konstanter ---------- */
const ROLE   = document.body.dataset.role;           // 'index' | 'character'
let   store  = storeHelper.load();                   // Lokal lagring

/* ---------- Snabb DOM-access ---------- */
const bar  = document.querySelector('shared-toolbar');
const $T   = id => bar.shadowRoot.getElementById(id);        // shadow-DOM
const dom  = {
  /* toolbar / panel */
  charSel : $T('charSelect'),   delBtn : $T('deleteChar'),
  newBtn  : $T('newCharBtn'),   xpOut  : $T('xpOut'),
  exportBtn: $T('exportChar'),  importBtn: $T('importChar'),
  xpIn    : $T('xpInput'),      xpSum  : $T('xpSummary'),
  clrBtn  : $T('clearFilters'),

  /* inventarie */
  invList : $T('invList'),      invBadge  : $T('invBadge'),
  wtOut   : $T('weightOut'),    slOut     : $T('slotOut'),
  moneyD  : $T('moneyDaler'),
  moneyS  : $T('moneySkilling'),
  moneyO  : $T('moneyOrtegar'),
  moneySetBtn: $T('moneySetBtn'),
  moneyAddBtn: $T('moneyAddBtn'),
  manageMoneyBtn: $T('manageMoneyBtn'),
  moneyResetBtn: $T('moneyResetBtn'),
  clearInvBtn : $T('clearInvBtn'),
  invTypeSel : $T('invTypeFilter'),
  unusedOut: $T('unusedOut'),

  /* smith filter */
  forgeBtn : $T('partySmith'),
  alcBtn  : $T('partyAlchemist'),
  artBtn  : $T('partyArtefacter'),

  /* traits */
  traits  : $T('traits'),       traitsTot: $T('traitsTotal'),
  traitStats: $T('traitStats'),

  /* filterfält */
  sIn   : $T('searchField'),  typSel : $T('typFilter'),
  arkSel: $T('arkFilter'),    tstSel : $T('testFilter'),
  filterUnion: $T('filterUnion'),
  entryViewToggle: $T('entryViewToggle'),

  /* element i main-DOM */
  active : document.getElementById('activeFilters'),
  lista  : document.getElementById('lista'),       // index-vy
  valda  : document.getElementById('valda'),       // character-vy
  cName  : document.getElementById('charName')
};

/* ---------- Ladda databasen ---------- */
let DB = [];
window.DB = DB;
const DATA_FILES = [
  'diverse.json',
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
  'lagre-artefakter.json',
  'fallor.json'
].map(f => `data/${f}`);

Promise.all(DATA_FILES.map(f => fetch(f).then(r => r.json())))
  .then(arrays => {
    DB = arrays.flat().sort(sortByType);
    window.DB = DB;
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
      ? `<strong>Krav på förmågor:</strong> ${p.krav_formagor}`
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
  invUtil.sortAllInventories();
  refreshCharSelect();
  bindToolbar();
  invUtil.renderInventory();
  invUtil.bindInv();
  invUtil.bindMoney();

  if (dom.traits) { renderTraits(); bindTraits(); }
  if (ROLE === 'index')     initIndex();
  if (ROLE === 'character') initCharacter();
}

/* ===========================================================
   TOOLBAR-LOGIK
   =========================================================== */
function refreshCharSelect() {
  dom.charSel.innerHTML =
    '<option value="">Välj rollperson …</option>' +
    store.characters.map(c =>
      `<option value="${c.id}"${c.id===store.current?' selected':''}>${c.name}</option>`
    ).join('');
  updateXP();
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
    location.reload();
  });

  /* one–time delegation för alla knappar i toolbar + paneler */
  bar.shadowRoot.addEventListener('click', e => {
    const id = e.target.closest('button, a')?.id;
    if (!id) return;

    /* Ny rollperson ---------------------------------------- */
    if (id === 'newCharBtn') {
      const name = prompt('Namn på ny rollperson?');
      if (!name) return;
      const baseXP = Number(dom.xpIn.value) || 0;
      const charId = 'rp' + Date.now();

      store.characters.push({ id: charId, name });
      store.data[charId] = { baseXp: baseXP, custom: [] };
      store.current = charId;

      storeHelper.save(store);      // sparas nu korrekt
      location.reload();
    }

    /* Exportera rollperson --------------------------------- */
    if (id === 'exportChar') {
      if (!store.current) return alert('Ingen rollperson vald.');
      const code = storeHelper.exportCharacterCode(store, store.current);
      prompt('Kopiera koden nedan:', code);
    }

    /* Importera rollperson -------------------------------- */
    if (id === 'importChar') {
      const code = prompt('Klistra in karakt\u00e4rskoden:');
      if (!code) return;
      const res = storeHelper.importCharacterCode(store, code.trim());
      if (res) {
        location.reload();
      } else {
        alert('Felaktig kod.');
      }
    }

    /* Ta bort rollperson ----------------------------------- */
    if (id === 'deleteChar') {
      if (!store.current) return alert('Ingen rollperson vald.');
      const char = store.characters.find(c => c.id === store.current);
      if (!confirm(`Ta bort “${char.name}”?`)) return;

      const idToDel = store.current;
      storeHelper.deleteCharacter(store, idToDel);
      location.reload();
    }
  });

  /* Ändra total erf direkt när värdet byts */
  dom.xpIn.addEventListener('change', () => {
    const xp = Number(dom.xpIn.value) || 0;
    storeHelper.setBaseXP(store, xp);
    updateXP();
  });

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
  if (dom.filterUnion) {
    if (storeHelper.getFilterUnion(store)) dom.filterUnion.classList.add('active');
    dom.filterUnion.addEventListener('click', () => {
      const val = dom.filterUnion.classList.toggle('active');
      storeHelper.setFilterUnion(store, val);
      if (window.indexViewUpdate) window.indexViewUpdate();
    });
  }
  if (dom.entryViewToggle) {
    if (storeHelper.getCompactEntries(store)) dom.entryViewToggle.classList.add('active');
    dom.entryViewToggle.addEventListener('click', () => {
      const val = dom.entryViewToggle.classList.toggle('active');
      storeHelper.setCompactEntries(store, val);
      if (window.indexViewUpdate) window.indexViewUpdate();
    });
  }
}

function openAlchemistPopup(cb) {
  const pop  = bar.shadowRoot.getElementById('alcPopup');
  const box  = bar.shadowRoot.getElementById('alcOptions');
  const cls  = bar.shadowRoot.getElementById('alcCancel');
  pop.classList.add('open');
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



function updateXP() {
  const list  = storeHelper.getCurrentList(store);
  const base  = storeHelper.getBaseXP(store);
  const effects = storeHelper.getArtifactEffects(store);
  const used  = storeHelper.calcUsedXP(list, effects);
  const total = storeHelper.calcTotalXP(base, list);
  const free  = total - used;
  dom.xpOut.textContent = free;
  dom.xpIn.value = base;
  if (dom.xpSum) dom.xpSum.textContent =
    `Använt: ${used} • Oanvänt: ${free} • Totalt: ${total}`;
}
/* -----------------------------------------------------------
   Synk när annan flik ändrar localStorage
----------------------------------------------------------- */
window.addEventListener('storage', ()=>{
  store=storeHelper.load(); location.reload();
});
