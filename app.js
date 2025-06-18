/* ===========================================================
   js/app.js – delas av index.html & character.html
   =========================================================== */

/* eslint-disable no-alert */

/* ---------- hjälp ---------- */
const $       = id => document.getElementById(id);
const LEVELS  = ['Novis', 'Gesäll', 'Mästare'];
const EQUIP_T = ['Vapen', 'Rustning', 'Diverse', 'Elixir'];
const isInv   = p => (p.taggar?.typ || []).some(t => EQUIP_T.includes(t));

/* ---------- start ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  /* data */
  let store = storeHelper.load();
  const ALL = await fetch('data/entries.json').then(r => r.json());

  /* gemensam dom */
  const role        = document.body.dataset.role;           // "index" | "character"
  const charSel     = $('charSelect');
  const newBtn      = $('newCharBtn');
  const delBtn      = $('deleteChar');
  const expOut      = role === 'index' ? $('expPointsIndex') : $('expPoints');

  /* panel-element */
  const invToggle   = $('invToggle');
  const invPanel    = $('invPanel');
  const invClose    = $('invClose');

  const filterToggle= $('filterToggle');
  const filterPanel = $('filterPanel');
  const filterClose = $('filterClose');

  /* inventarie-lista */
  const invList   = $('invList');
  const invBadge  = $('invBadge');
  const weightOut = $('weightOut');
  const slotOut   = $('slotOut');

  /* ---------- gemensamma uppdaterare ---------- */
  const refreshChars = () => {
    charSel.innerHTML =
      '<option value="">Välj rollperson …</option>' +
      store.characters
        .map(c => `<option value="${c.id}"${c.id===store.current?' selected':''}>${c.name}</option>`)
        .join('');
  };

  const updateXP = () => {
    if (expOut) {
      expOut.textContent = storeHelper.calcXP(storeHelper.getCurrentList(store));
    }
  };

  const renderInv = () => {
    if (!invList) return;
    const inv = storeHelper.getInventory(store);

    invList.innerHTML = inv.length
      ? inv.map(it => {
          const entry = ALL.find(e => e.id === it.itemId) || {};
          let desc = entry.beskrivning || '';
          if (entry.taggar?.typ?.includes('Elixir') && entry.nivåer) {
            desc += '<br>' + Object.entries(entry.nivåer)
              .map(([lvl,txt]) => `${lvl}: ${txt}`).join('<br>');
          } else if (entry.stat) {
            desc += '<br>' + Object.entries(entry.stat)
              .map(([k,v]) => `${k}: ${v}`).join(', ');
          }
          return `
            <li class="card" data-id="${it.itemId}" data-level="${it.level}">
              <div class="card-title">${it.name}</div>
              <div class="card-desc">${desc}<br>Nivå: ${it.level}<br>Antal: ${it.qty}</div>
              <div class="inv-controls">
                <button data-act="add">+</button>
                <button data-act="sub">–</button>
              </div>
            </li>`;
        }).join('')
      : '<li class="card">Inga föremål.</li>';

    const w = inv.reduce((s,i)=>s+(i.vikt||0)*i.qty,0);
    const s = inv.reduce((a,i)=>a+i.qty,0);
    if (weightOut) weightOut.textContent = w;
    if (slotOut)   slotOut.textContent   = s;
    if (invBadge)  invBadge.textContent  = s;
  };

  /* ---------- panel-lyssnare ---------- */
  if (invToggle && invPanel && invClose) {
    invToggle.addEventListener('click', () => invPanel.classList.toggle('open'));
    invClose .addEventListener('click', () => invPanel.classList.remove('open'));
  }
  if (filterToggle && filterPanel && filterClose) {
    filterToggle.addEventListener('click', () => filterPanel.classList.toggle('open'));
    filterClose .addEventListener('click', () => filterPanel.classList.remove('open'));
  }

  /* ---------- index-specifik logik ---------- */
  if (role === 'index') {
    const lista    = $('lista');
    const searchIn = $('sökfält');
    const typSel   = $('typFilter');
    const arkSel   = $('arkFilter');
    const testSel  = $('testFilter');

    /* fyll filter-dropdowns */
    (() => {
      const sets = { typ:new Set(), ark:new Set(), test:new Set() };
      ALL.forEach(p => {
        (p.taggar?.typ      || []).forEach(v => sets.typ .add(v));
        (p.taggar?.ark_trad || []).forEach(v => sets.ark .add(v));
        (p.taggar?.test     || []).forEach(v => sets.test.add(v));
      });
      const fill = (sel,set,lbl) => {
        sel.innerHTML = `<option value="">${lbl} (alla)</option>` +
          [...set].sort((a,b)=>a.localeCompare(b,'sv'))
            .map(v => `<option>${v}</option>`).join('');
      };
      fill(typSel , sets.typ , 'Typ');
      fill(arkSel , sets.ark , 'Arketyp');
      fill(testSel, sets.test, 'Test');
    })();

    const filtered = () => {
      const q  = searchIn.value.toLowerCase();
      const tF = typSel.value, aF = arkSel.value, xF = testSel.value;
      return ALL.filter(p => {
        const txt = p.namn.toLowerCase().includes(q) ||
          (p.beskrivning || '').toLowerCase().includes(q) ||
          (p.nivåer ? Object.values(p.nivåer).join(' ').toLowerCase().includes(q) : false);
        const tOK = !tF || (p.taggar?.typ      || []).includes(tF);
        const aOK = !aF || (p.taggar?.ark_trad || []).includes(aF);
        const xOK = !xF || (p.taggar?.test     || []).includes(xF);
        return txt && tOK && aOK && xOK;
      });
    };

    const renderList = arr => {
      lista.innerHTML = arr.length ? '' : '<li class="card">Inga träffar.</li>';
      const charList = storeHelper.getCurrentList(store);

      arr.forEach(p => {
        const inChar = charList.some(x => x.id === p.id);
        const curLvl = charList.find(x => x.id === p.id)?.nivå || 'Novis';
        const lvlSel = p.nivåer ? `
          <select class="level" data-id="${p.id}">
            ${LEVELS.filter(l=>p.nivåer[l]).map(l=>`<option${l===curLvl?' selected':''}>${l}</option>`).join('')}
          </select>` : '';
        const desc = p.nivåer
          ? Object.entries(p.nivåer).map(([l,t])=>`${l}: ${t}`).join('<br>')
          : (p.beskrivning || '');
        const btn  = inChar
          ? `<button data-act="rem" data-id="${p.id}" class="char-btn danger icon">🗑</button>`
          : `<button data-act="add" data-id="${p.id}" class="char-btn">Lägg till</button>`;
        const li   = document.createElement('li');
        li.className = 'card';
        li.innerHTML = `
          <div class="card-title">${p.namn}</div>
          ${(p.taggar?.typ||[]).concat(p.taggar?.ark_trad||[], p.taggar?.test||[])
            .map(t=>`<span class="tag">${t}</span>`).join(' ')}
          ${lvlSel}
          <div class="card-desc">${desc}</div>
          ${btn}`;
        lista.appendChild(li);
      });
    };

    const refreshList = () => renderList(filtered());
    [searchIn, typSel, arkSel, testSel].forEach(el => el.addEventListener('input', refreshList));

    lista.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn || !store.current) return;
      const id   = Number(btn.dataset.id);
      const entry= ALL.find(x => x.id === id);
      const li   = btn.closest('li');
      const lvl  = li.querySelector('select.level')?.value || 'Novis';

      if (btn.dataset.act === 'add') {
        if (isInv(entry)) {
          const inv = storeHelper.getInventory(store);
          const idx = inv.findIndex(x=>x.itemId===id && x.level===lvl);
          idx>=0 ? inv[idx].qty++ : inv.push({itemId:id,name:entry.namn,qty:1,level:lvl});
          storeHelper.setInventory(store,inv); renderInv();
        } else {
          const list = storeHelper.getCurrentList(store);
          list.push({ ...entry, nivå:lvl });
          storeHelper.setCurrentList(store, list); updateXP();
        }
      } else {
        if (isInv(entry)) {
          const inv = storeHelper.getInventory(store);
          const idx = inv.findIndex(x=>x.itemId===id && x.level===lvl);
          if (idx>=0){ inv[idx].qty--; if(inv[idx].qty<1) inv.splice(idx,1); }
          storeHelper.setInventory(store,inv); renderInv();
        } else {
          const list = storeHelper.getCurrentList(store).filter(x=>x.id!==id);
          storeHelper.setCurrentList(store, list); updateXP();
        }
      }
      refreshList();
    });

    lista.addEventListener('change', e => {
      if (!e.target.matches('select.level')) return;
      const id   = Number(e.target.dataset.id);
      const list = storeHelper.getCurrentList(store);
      const ent  = list.find(x => x.id === id);
      if (ent) { ent.nivå = e.target.value; storeHelper.setCurrentList(store, list); updateXP(); }
    });

    /* init index */
    refreshChars(); renderInv(); updateXP(); refreshList();
  }

  /* ---------- character-specifik logik ---------- */
  if (role === 'character') {
    const charName = $('charName');
    const valdaList= $('valda');
    const searchIn = $('sökfält');
    const typSel   = $('typFilter');
    const arkSel   = $('arkFilter');
    const testSel  = $('testFilter');

    /* fyll dropdowns från aktuell karaktär */
    const fillFilters = () => {
      const list = storeHelper.getCurrentList(store).filter(p=>!isInv(p));
      const sets = { typ:new Set(), ark:new Set(), test:new Set() };
      list.forEach(p => {
        (p.taggar?.typ      || []).forEach(v=>sets.typ .add(v));
        (p.taggar?.ark_trad || []).forEach(v=>sets.ark .add(v));
        (p.taggar?.test     || []).forEach(v=>sets.test.add(v));
      });
      const fill = (sel,set,lbl) => {
        sel.innerHTML = `<option value="">${lbl} (alla)</option>` +
          [...set].sort((a,b)=>a.localeCompare(b,'sv')).map(v=>`<option>${v}</option>`).join('');
      };
      fill(typSel , sets.typ , 'Typ');
      fill(arkSel , sets.ark , 'Arketyp');
      fill(testSel, sets.test, 'Test');
    };

    const filtered = () => {
      const q  = searchIn.value.toLowerCase();
      const tF = typSel.value, aF = arkSel.value, xF = testSel.value;
      return storeHelper.getCurrentList(store)
        .filter(p=>!isInv(p))
        .filter(p=>{
          const txt = p.namn.toLowerCase().includes(q) || (p.beskrivning||'').toLowerCase().includes(q);
          const tOK=!tF||(p.taggar?.typ      || []).includes(tF);
          const aOK=!aF||(p.taggar?.ark_trad || []).includes(aF);
          const xOK=!xF||(p.taggar?.test     || []).includes(xF);
          return txt&&tOK&&aOK&&xOK;
        });
    };

    const renderSkills = arr => {
      valdaList.innerHTML = arr.length ? '' : '<li class="card">Inga träffar.</li>';
      arr.forEach(p=>{
        const lvlSel = p.nivåer ? `
          <select class="level" data-id="${p.id}">
            ${LEVELS.filter(l=>p.nivåer[l]).map(l=>`<option${l===p.nivå?' selected':''}>${l}</option>`).join('')}
          </select>` : '';
        const idx  = LEVELS.indexOf(p.nivå);
        const desc = p.nivåer
          ? LEVELS.slice(0,idx+1).filter(l=>p.nivåer[l]).map(l=>`${l}: ${p.nivåer[l]}`).join('<br>')
          : (p.beskrivning || '');
        const li=document.createElement('li');
        li.className='card'; li.dataset.id=p.id;
        li.innerHTML = `
          <div class="card-title">${p.namn}</div>
          ${lvlSel}
          <div class="card-desc">${desc}</div>
          <button class="char-btn danger icon" data-act="rem">🗑</button>`;
        valdaList.appendChild(li);
      });
    };

    const refreshCharPage = () => {
      charName.textContent = store.characters.find(c=>c.id===store.current)?.name || '';
      fillFilters(); renderSkills(filtered()); updateXP(); renderInv();
    };

    valdaList.addEventListener('click', e => {
      if(!e.target.dataset.act) return;
      const id = Number(e.target.closest('li').dataset.id);
      const list = storeHelper.getCurrentList(store).filter(x=>x.id!==id);
      storeHelper.setCurrentList(store, list); refreshCharPage();
    });

    valdaList.addEventListener('change', e => {
      if(!e.target.matches('select.level')) return;
      const id = Number(e.target.dataset.id);
      const list = storeHelper.getCurrentList(store);
      const ent = list.find(x=>x.id===id);
      if(ent){ ent.nivå=e.target.value; storeHelper.setCurrentList(store, list); }
      refreshCharPage();
    });

    [searchIn, typSel, arkSel, testSel].forEach(el => el.addEventListener('input', () => renderSkills(filtered())));

    refreshChars(); refreshCharPage();
  }

  /* ---------- karaktärshantering ---------- */
  const fullSwitch = () => {
    store.current = charSel.value;
    storeHelper.save(store);
    refreshChars(); renderInv(); updateXP();
    if (role === 'index')     { typeof refreshList    === 'function' && refreshList(); }
    if (role === 'character') { typeof refreshCharPage=== 'function' && refreshCharPage(); }
  };
 charSel.addEventListener('change', () => {
  // Spara det nya valet
  store.current = charSel.value;
  storeHelper.save(store);
  // Ladda om sidan för att rita om allt
  window.location.reload();
});

  newBtn.addEventListener('click', () => {
    const name = prompt('Namn på ny rollperson?'); if (!name) return;
    const id = 'rp' + Date.now();
    store.characters.push({ id, name }); store.data[id] = {}; store.current = id;
    storeHelper.save(store); fullSwitch();
  });

  delBtn.addEventListener('click', () => {
    if (!store.current) return alert('Ingen rollperson vald.');
    const k = store.characters.find(c=>c.id===store.current);
    if (!confirm(`Ta bort “${k.name}”?`)) return;
    store.characters = store.characters.filter(c=>c.id!==store.current);
    delete store.data[store.current]; store.current = '';
    storeHelper.save(store); fullSwitch();
  });

  /* sync mellan flikar */
  window.addEventListener('storage', () => { store = storeHelper.load(); fullSwitch(); });
});
