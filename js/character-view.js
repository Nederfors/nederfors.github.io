(function(window){
function initCharacter() {
  dom.cName.textContent = store.characters.find(c=>c.id===store.current)?.name||'';

  const F = { search:[], typ:[], ark:[], test:[] };
  let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', compact);

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
    F.search.forEach(v=>push(`<span class="tag removable" data-type="search" data-val="${v}">${v} ✕</span>`));
    F.typ .forEach(v=>push(`<span class="tag removable" data-type="typ" data-val="${v}">${v} ✕</span>`));
    F.ark .forEach(v=>push(`<span class="tag removable" data-type="ark" data-val="${v}">${v} ✕</span>`));
    F.test.forEach(v=>push(`<span class="tag removable" data-type="test" data-val="${v}">${v} ✕</span>`));
  };

  const filtered = () => {
    union = storeHelper.getFilterUnion(store);
    return storeHelper.getCurrentList(store)
      .filter(p => !isInv(p))
      .filter(p => {
        const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
          .map(t => searchNormalize(t.toLowerCase()));
        const text = searchNormalize(`${p.namn} ${(p.beskrivning || '')}`.toLowerCase());
        const txt = !terms.length || terms.every(q => text.includes(q));
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
        return union ? (txt || tagMatch) : (txt && tagMatch);
      })
      .sort(sortByType);
  };

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
    const compact = storeHelper.getCompactEntries(store);
    dom.valda.innerHTML = groups.length ? '' : '<li class="card">Inga träffar.</li>';
    groups.forEach(g=>{
      const p = g.entry;
      const availLvls = LVL.filter(l=>p.nivåer?.[l]);
      const lvlSel = availLvls.length>1
        ? `<select class="level" data-name="${p.namn}"${p.trait?` data-trait="${p.trait}"`:''}>
            ${availLvls.map(l=>`<option${l===p.nivå?' selected':''}>${l}</option>`).join('')}
          </select>`
        : '';
      const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
      const idx=LVL.indexOf(p.nivå);
      let desc = abilityHtml(p, p.nivå);
      let infoHtml = desc;
      if (isRas(p) || isYrke(p) || isElityrke(p)) {
        const extra = yrkeInfoHtml(p);
        if (extra) infoHtml += `<br>${extra}`;
      }
      const traitInfo = p.trait ? `<br><strong>Karaktärsdrag:</strong> ${p.trait}` : '';
      const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml + traitInfo)}">Info</button>`;

      const li=document.createElement('li');
      li.className='card' + (compact ? ' compact' : '');
      li.dataset.name=p.namn;
      if(p.trait) li.dataset.trait=p.trait;
      if(p.trait) li.dataset.trait=p.trait;
      const multi = p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).includes('Fördel') && !p.trait;
      const badge = g.count>1 ? ` <span class="count-badge">×${g.count}</span>` : '';
      let btn = '';
      if(multi){
        const addBtn = g.count < 3 ? `<button data-act="add" class="char-btn" data-name="${p.namn}">+</button>` : '';
        const remBtn = `<button data-act="rem" class="char-btn danger${addBtn ? '' : ' icon'}" data-name="${p.namn}">${addBtn ? '−' : '🗑'}</button>`;
        btn = `<div class="inv-controls">${remBtn}${addBtn}</div>`;
      }else{
        btn = `<button class="char-btn danger icon" data-act="rem">🗑</button>`;
      }
      const showInfo = compact || hideDetails;
      const descHtml = (!compact && !hideDetails) ? `<div class="card-desc">${desc}${traitInfo}</div>` : '';
      li.innerHTML = `<div class="card-title">${p.namn}${badge}</div>${lvlSel}

        ${descHtml}
        ${showInfo ? infoBtn : ''}${btn}`;

      dom.valda.appendChild(li);
    });
  };

  renderSkills(filtered()); activeTags(); updateXP(); renderTraits();
  window.indexViewUpdate = () => { renderSkills(filtered()); renderTraits(); };

  /* --- filter-events */
  dom.sIn.addEventListener('input', ()=>{sTemp=dom.sIn.value.trim(); activeTags(); renderSkills(filtered()); renderTraits();});
  dom.sIn.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(sTemp && !F.search.includes(sTemp)) F.search.push(sTemp);
      dom.sIn.value=''; sTemp='';
      activeTags(); renderSkills(filtered()); renderTraits();
    }
  });
  [ ['typSel','typ'], ['arkSel','ark'], ['tstSel','test'] ].forEach(([sel,key])=>{
    dom[sel].addEventListener('change',()=>{
      const v=dom[sel].value; if(v&&!F[key].includes(v)) F[key].push(v);
      dom[sel].value=''; activeTags(); renderSkills(filtered()); renderTraits();
    });
  });
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const sec=t.dataset.type,val=t.dataset.val;
    if(sec==='search'){F.search=F.search.filter(x=>x!==val);} 
    else F[sec]=F[sec].filter(x=>x!==val);
    activeTags(); renderSkills(filtered()); renderTraits();
  });
  dom.clrBtn.addEventListener('click',()=>{
    F.search=[];F.typ=[];F.ark=[];F.test=[]; sTemp='';
    dom.sIn.value=''; dom.typSel.value=dom.arkSel.value=dom.tstSel.value='';
    activeTags(); renderSkills(filtered()); renderTraits();
  });

  /* ta bort & nivåbyte */
  dom.valda.addEventListener('click',e=>{
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      const html=decodeURIComponent(infoBtn.dataset.info||'');
      const title=infoBtn.closest('li')?.querySelector('.card-title')?.textContent||'';
      yrkePanel.open(title,html);
      return;
    }
    const actBtn=e.target.closest('button[data-act]');
    if(!actBtn) return;
    const liEl = actBtn.closest('li');
    const name = liEl.dataset.name;
    const tr = liEl.dataset.trait || null;
    const before = storeHelper.getCurrentList(store);
    const p = DB.find(x=>x.namn===name) || before.find(x=>x.namn===name);
    if(!p) return;
    const multi = p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).includes('Fördel') && !tr;
    let list;
    if(actBtn.dataset.act==='add'){
      if(!multi) return;
      const cnt = before.filter(x=>x.namn===name && !x.trait).length;
      if(cnt >= 3){
        alert('Denna fördel kan bara tas tre gånger.');
        return;
      }
      const lvlSel = liEl.querySelector('select.level');
      let   lvl = lvlSel ? lvlSel.value : null;
      if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || p.nivå;
      list = [...before, { ...p, nivå: lvl }];
    }else if(actBtn.dataset.act==='rem'){
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
    } else {
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
