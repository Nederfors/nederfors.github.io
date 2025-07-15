(function(window){
function initCharacter() {
  dom.cName.textContent = store.characters.find(c=>c.id===store.current)?.name||'';

  const F = { search:'', typ:[], ark:[], test:[] };
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);

  /* Dropdowns baserat på karaktärslista */
  (()=>{
    const lst = storeHelper.getCurrentList(store).filter(p=>!isInv(p));
    const sets = { typ:new Set(), ark:new Set(), test:new Set() };
    lst.forEach(p=>{
      (p.taggar.typ||[]).forEach(v=>sets.typ.add(v));
      explodeTags(p.taggar.ark_trad).forEach(v=>sets.ark.add(v));
      (p.taggar.test||[]).forEach(v=>sets.test.add(v));
    });
    const fill=(sel,set,lbl)=>sel.innerHTML =
      `<option value="">${lbl} (alla)</option>` +
      [...set].sort().map(v=>`<option>${v}</option>`).join('');
    fill(dom.typSel,sets.typ ,'Typ');
    fill(dom.arkSel,sets.ark ,'Arketyp');
    fill(dom.tstSel,sets.test,'Test');
  })();

  const activeTags = ()=>{
    dom.active.innerHTML='';
    const push=t=>dom.active.insertAdjacentHTML('beforeend',t);
    if(F.search) push(`<span class="tag removable" data-type="search">${F.search} ✕</span>`);
    F.typ .forEach(v=>push(`<span class="tag removable" data-type="typ" data-val="${v}">${v} ✕</span>`));
    F.ark .forEach(v=>push(`<span class="tag removable" data-type="ark" data-val="${v}">${v} ✕</span>`));
    F.test.forEach(v=>push(`<span class="tag removable" data-type="test" data-val="${v}">${v} ✕</span>`));
  };

  const filtered = () => storeHelper.getCurrentList(store)
      .filter(p => !isInv(p))
      .filter(p => {
        const q = F.search.toLowerCase();
        const txt = p.namn.toLowerCase().includes(q) || (p.beskrivning || '').toLowerCase().includes(q);
        const tags = p.taggar || {};
        const selTags = [...F.typ, ...F.ark, ...F.test];
        const itmTags = [
          ...(tags.typ      ?? []),
          ...explodeTags(tags.ark_trad),
          ...(tags.test     ?? [])
        ];
        const tagMatch = !selTags.length ||
          (union ? selTags.some(t => itmTags.includes(t))
                 : selTags.every(t => itmTags.includes(t)));
        return txt && tagMatch;
      })
      .sort(sortByType);

  const renderSkills = arr=>{
    const groups = [];
    arr.forEach(p=>{
      const multi = p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).includes('Fördel') && !p.trait;
      if(multi){
        const g = groups.find(x=>x.entry.namn===p.namn);
        if(g) { g.count++; return; }
        groups.push({entry:p, count:1});
      } else {
        groups.push({entry:p, count:1});
      }
    });
    dom.valda.innerHTML = groups.length ? '' : '<li class="card">Inga träffar.</li>';
    groups.forEach(g=>{
      const p = g.entry;
      const lvlSel=p.nivåer?`<select class="level" data-name="${p.namn}"${p.trait?` data-trait="${p.trait}"`:''}>
        ${LVL.filter(l=>p.nivåer[l]).map(l=>`<option${l===p.nivå?' selected':''}>${l}</option>`).join('')}
      </select>`:'';
      const idx=LVL.indexOf(p.nivå);
      let desc = '';
      const base = formatText(p.beskrivning || '');
      if (isYrke(p) || isElityrke(p) || isRas(p)) {
        desc = base;
      } else if (p.nivåer) {
        const levels = LVL.slice(0, idx + 1)
          .filter(l => p.nivåer[l])
          .map(l => `<strong>${l}</strong><br>${formatText(p.nivåer[l])}`)
          .join('<br>');
        desc = base ? `${base}<br>${levels}` : levels;
      } else {
        desc = base;
      }
      let info = '';
      if (isRas(p)) {
        info = `<button class="char-btn" data-yrke="${p.namn}">Info</button>`;
      } else if (isYrke(p) || isElityrke(p)) {
        info = `<button class="char-btn" data-yrke="${p.namn}">Arketyp</button>`;
      }
      const li=document.createElement('li');li.className='card';li.dataset.name=p.namn;
      if(p.trait) li.dataset.trait=p.trait;
      if(p.trait) li.dataset.trait=p.trait;
      const badge = g.count>1 ? ` <span class="count-badge">×${g.count}</span>` : '';
      const traitInfo = p.trait ? `<br><strong>Karaktärsdrag:</strong> ${p.trait}` : '';
      li.innerHTML = `<div class="card-title">${p.namn}${badge}</div>${lvlSel}
        <div class="card-desc">${desc}${traitInfo}</div>
        ${info}<button class="char-btn danger icon" data-act="rem">🗑</button>`;
      dom.valda.appendChild(li);
    });
  };

  renderSkills(filtered()); activeTags(); updateXP(); renderTraits();

  /* --- filter-events */
  dom.sIn.addEventListener('input', ()=>{F.search=dom.sIn.value; activeTags(); renderSkills(filtered()); renderTraits();});
  [ ['typSel','typ'], ['arkSel','ark'], ['tstSel','test'] ].forEach(([sel,key])=>{
    dom[sel].addEventListener('change',()=>{
      const v=dom[sel].value; if(v&&!F[key].includes(v)) F[key].push(v);
      dom[sel].value=''; activeTags(); renderSkills(filtered()); renderTraits();
    });
  });
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const sec=t.dataset.type,val=t.dataset.val;
    if(sec==='search'){F.search=''; dom.sIn.value='';}
    else F[sec]=F[sec].filter(x=>x!==val);
    activeTags(); renderSkills(filtered()); renderTraits();
  });
  dom.clrBtn.addEventListener('click',()=>{
    F.search='';F.typ=[];F.ark=[];F.test=[];
    dom.sIn.value=''; dom.typSel.value=dom.arkSel.value=dom.tstSel.value='';
    activeTags(); renderSkills(filtered()); renderTraits();
  });
  dom.filterUnion.addEventListener('click', () => {
    union = dom.filterUnion.classList.toggle('active');
    storeHelper.setFilterUnion(store, union);
    renderSkills(filtered());
    renderTraits();
  });

  /* ta bort & nivåbyte */
  dom.valda.addEventListener('click',e=>{
    const info=e.target.closest('button[data-yrke]');
    if(info){
      const name=info.dataset.yrke;
      const p=storeHelper.getCurrentList(store).find(x=>x.namn===name)||DB.find(x=>x.namn===name);
      if(p) yrkePanel.open(p.namn,yrkeInfoHtml(p));
      return;
    }
    if(e.target.dataset.act!=='rem') return;
    const liEl = e.target.closest('li');
    const name = liEl.dataset.name;
    const tr = liEl.dataset.trait || null;
    const before = storeHelper.getCurrentList(store);
    const p = DB.find(x=>x.namn===name) || before.find(x=>x.namn===name);
    let list;
    const multi = p && p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).includes('Fördel') && !tr;
    if(multi){
      let removed=false;
      list=[];
      for(const it of before){
        if(!removed && it.namn===name && !it.trait){
          removed=true; continue;
        }
        list.push(it);
      }
    }else{
      list = before.filter(x => !(x.namn===name && (tr?x.trait===tr:!x.trait)));
    }
    if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
      if(!confirm('Förmågan krävs för ett valt elityrke. Ta bort ändå?'))
        return;
    }
    storeHelper.setCurrentList(store, list);
    renderSkills(filtered());
    updateXP();
    renderTraits();

  });
  dom.valda.addEventListener('change',e=>{
    if(!e.target.matches('select.level')) return;
    const name=e.target.dataset.name;
    const tr=e.target.dataset.trait || e.target.closest('li').dataset.trait || null;
    const list=storeHelper.getCurrentList(store);
    const ent=list.find(x=>x.namn===name && (tr?x.trait===tr:!x.trait));
    if(ent){
      const before=list.map(x=>({...x}));
      const old = ent.nivå;
      ent.nivå=e.target.value;
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        alert('Förmågan krävs för ett valt elityrke och kan inte ändras.');
        ent.nivå = old;
        e.target.value = old;
        return;
      }
      storeHelper.setCurrentList(store,list); updateXP();
    }
    renderSkills(filtered()); renderTraits();
  });
}

  window.initCharacter = initCharacter;
})(window);
