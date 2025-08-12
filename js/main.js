/* ===========================================================
   js/main.js – gemensam logik för index-, character- och notes-vy
   Fungerar ihop med Web Component <shared-toolbar>
   2025-06-20
   =========================================================== */

/* ---------- Grunddata & konstanter ---------- */
const ROLE   = document.body.dataset.role;           // 'index' | 'character' | 'notes'
let   store  = storeHelper.load();                   // Lokal lagring

// Hook för online-export
window.getCurrentJsonForExport = () =>
  storeHelper.exportCharacterJSON(store, store.current);

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
  invList : $T('invList'),      invBadge  : $T('invBadge'),
  wtOut   : $T('weightOut'),    slOut     : $T('slotOut'),
  moneyD  : $T('moneyDaler'),
  moneyS  : $T('moneySkilling'),
  moneyO  : $T('moneyOrtegar'),
  moneySetBtn: $T('moneySetBtn'),
  moneyAddBtn: $T('moneyAddBtn'),
  invTypeSel : $T('invTypeFilter'),
  collapseAllBtn: $T('collapseAllInv'),
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
  arkSel: $T('arkFilter'),    tstSel : $T('testFilter'),
  filterUnion: $T('filterUnion'),
  entryViewToggle: $T('entryViewToggle'),
  infoToggle: $T('infoToggle'),

  /* element i main-DOM */
  active : document.getElementById('activeFilters'),
  lista  : document.getElementById('lista'),       // index-vy
  valda  : document.getElementById('valda'),       // character-vy
  cName  : document.getElementById('charName')
};

/* ---------- Ladda databasen ---------- */
let DB = [];
let DBIndex = {};
window.DB = DB;
window.DBIndex = DBIndex;
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
    DB.forEach((ent, idx) => {
      if (ent.id === undefined) ent.id = idx;
      DB[ent.id] = ent;
    });
    window.DB = DB;
    DBIndex = {};
    DB.forEach(ent => { DBIndex[ent.namn] = ent; });
    window.DBIndex = DBIndex;
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
  ensureCharacterSelected();
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
      const baseXP = 0;  // nystartade rollpersoner har alltid 0 XP
      const charId = 'rp' + Date.now();

      store.characters.push({ id: charId, name });
      store.data[charId] = { baseXp: baseXP, custom: [] };
      store.current = charId;

      storeHelper.save(store);      // sparas nu korrekt
      location.reload();
    }

    /* Kopiera rollperson ----------------------------------- */
    if (id === 'duplicateChar') {
      if (!store.current) return alert('Ingen rollperson vald.');
      const newId = storeHelper.duplicateCharacter(store, store.current);
      if (newId) {
        store.current = newId;
        storeHelper.save(store);
        location.reload();
      }
    }

    /* Byt namn på rollperson -------------------------------- */
    if (id === 'renameChar') {
      if (!store.current) return alert('Ingen rollperson vald.');
      const char = store.characters.find(c => c.id === store.current);
      const newName = prompt('Nytt namn?', char ? char.name : '');
      if (!newName) return;
      storeHelper.renameCharacter(store, store.current, newName);
      refreshCharSelect();
      if (dom.cName) dom.cName.textContent = newName;
    }

    /* Exportera rollperson --------------------------------- */
    if (id === 'exportChar') {
      if (!store.characters.length) return alert('Inga rollpersoner att exportera.');
      openExportPopup(async choice => {
        if (choice === 'all') {
          await exportAllCharacters();
        } else if (choice) {
          await exportCharacterFile(choice);
        }
      });
    }

    /* Importera rollperson -------------------------------- */
    if (id === 'importChar') {
      (async () => {
        try {
          let files;
          if (window.showOpenFilePicker) {
            const handles = await window.showOpenFilePicker({
              multiple: true,
              types: [{
                description: 'JSON',
                accept: { 'application/json': ['.json'] }
              }]
            });
            files = await Promise.all(handles.map(h => h.getFile()));
          } else {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = 'application/json';
            inp.multiple = true;
            files = await new Promise((resolve, reject) => {
              inp.addEventListener('change', () => {
                const list = inp.files && inp.files.length ? Array.from(inp.files) : null;
                if (!list) return reject(new Error('Ingen fil vald'));
                resolve(list);
              });
              inp.click();
            });
          }
          let ok = false;
          for (const file of files) {
            try {
              const text = await file.text();
              const obj = JSON.parse(text);
              const res = storeHelper.importCharacterJSON(store, obj);
              if (res) {
                ok = true;
              } else {
                alert('Felaktig fil.');
              }
            } catch {
              alert('Felaktig fil.');
            }
          }
          if (ok) {
            location.reload();
          }
        } catch (err) {
          if (err && err.name !== 'AbortError') {
            alert('Felaktig fil.');
          }
        }
      })();
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

function openDefensePopup(cb) {
  const pop  = bar.shadowRoot.getElementById('defensePopup');
  const box  = bar.shadowRoot.getElementById('defenseOptions');
  const cls  = bar.shadowRoot.getElementById('defenseCancel');
  pop.classList.add('open');
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
        alert('Sparande misslyckades');
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

async function exportCharacterFile(id) {
  const data = storeHelper.exportCharacterJSON(store, id);
  if (!data) return;
  const jsonText = JSON.stringify(data, null, 2);
  const suggested = `${data.name || 'rollperson'}.json`;
  await saveJsonFile(jsonText, suggested);
}

async function exportAllCharacters() {
  for (const c of store.characters) {
    await exportCharacterFile(c.id);
  }
}

function openExportPopup(cb) {
  const pop  = bar.shadowRoot.getElementById('exportPopup');
  const opts = bar.shadowRoot.getElementById('exportOptions');
  const cls  = bar.shadowRoot.getElementById('exportCancel');
  pop.classList.add('open');
  function close() {
    pop.classList.remove('open');
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
    opts.innerHTML = '';
  }
  function onCancel() { close(); cb(null); }
  function onOutside(e) {
    if(!pop.querySelector('.popup-inner').contains(e.target)){
      close();
      cb(null);
    }
  }
  opts.innerHTML = '';
  const addBtn = (label, value) => {
    const b = document.createElement('button');
    b.className = 'char-btn';
    b.textContent = label;
    b.addEventListener('click', () => { close(); cb(value); });
    opts.appendChild(b);
  };
  addBtn('Alla rollpersoner', 'all');
  const currentId = store.current;
  if (currentId) {
    const curChar = store.characters.find(c => c.id === currentId);
    if (curChar) addBtn(curChar.name || 'Namnlös', curChar.id);
  }
  for (const c of store.characters) {
    if (c.id === currentId) continue;
    addBtn(c.name || 'Namnlös', c.id);
  }
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
}

function openNilasPopup(cb) {
  const pop = bar.shadowRoot.getElementById('nilasPopup');
  const yes = bar.shadowRoot.getElementById('nilasYes');
  const no  = bar.shadowRoot.getElementById('nilasNo');
  pop.classList.add('open');
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

function ensureCharacterSelected() {
  if (store.current) return;
  const pop = document.createElement('div');
  pop.id = 'charPopup';
  pop.innerHTML = '<div class="popup-inner"><p id="charPopupMsg"></p><div id="charPopupContent"></div></div>';
  document.body.appendChild(pop);
  const msg = pop.querySelector('#charPopupMsg');
  const content = pop.querySelector('#charPopupContent');
  if (store.characters.length) {
    msg.textContent = 'Oj då, denna hemsida är bajs utan någon karaktär så det är bäst att du väljer en!';
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="">Välj rollperson…</option>' +
      store.characters.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      store.current = sel.value;
      storeHelper.save(store);
      location.reload();
    });
    content.appendChild(sel);
  } else {
    msg.textContent = 'Oj då, denna hemsida är bajs utan någon karaktär så det är bäst att du skapar eller importerar en!';

    const importBtn = document.createElement('button');
    importBtn.className = 'char-btn';
    importBtn.textContent = 'Importera rollperson';
    importBtn.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json';
      inp.multiple = true;
      inp.addEventListener('change', async () => {
        const files = inp.files ? Array.from(inp.files) : [];
        if (!files.length) return;
        let ok = false;
        for (const file of files) {
          try {
            const text = await file.text();
            const obj = JSON.parse(text);
            const res = storeHelper.importCharacterJSON(store, obj);
            if (res) {
              ok = true;
            } else {
              alert('Felaktig fil.');
            }
          } catch {
            alert('Felaktig fil.');
          }
        }
        if (ok) {
          location.reload();
        }
      });
      inp.click();
    });

    const btnNew = document.createElement('button');
    btnNew.className = 'char-btn';
    btnNew.textContent = 'Ny rollperson';
    btnNew.addEventListener('click', () => {
      const name = prompt('Namn p\u00e5 ny rollperson?');
      if (!name) return;
      const baseXP = 0;
      const charId = 'rp' + Date.now();
      store.characters.push({ id: charId, name });
      store.data[charId] = { baseXp: baseXP, custom: [] };
      store.current = charId;
      storeHelper.save(store);
      location.reload();
    });

    content.append(importBtn, btnNew);
  }
  setTimeout(() => pop.classList.add('open'), 0);
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
   Synk när annan flik ändrar localStorage
----------------------------------------------------------- */
window.addEventListener('storage', ()=>{
  store=storeHelper.load(); location.reload();
});
