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
      (p.taggar.typ||[])
        .filter(Boolean)
        .forEach(v=>sets.typ.add(v));
      explodeTags(p.taggar.ark_trad).forEach(v=>sets.ark.add(v));
      (p.taggar.test||[])
        .filter(Boolean)
        .forEach(v=>sets.test.add(v));
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
    const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
      .map(t => searchNormalize(t.toLowerCase()));
    return storeHelper.getCurrentList(store)
      .filter(p => !isInv(p))
      .filter(p => {
        const text = searchNormalize(`${p.namn} ${(p.beskrivning || '')}`.toLowerCase());
        const hasTerms = terms.length > 0;
        const txt = hasTerms && terms.every(q => text.includes(q));
        const tags = p.taggar || {};
        const selTags = [...F.typ, ...F.ark, ...F.test];
        const hasTags = selTags.length > 0;
        const itmTags = [
          ...(tags.typ      ?? []),
          ...explodeTags(tags.ark_trad),
          ...(tags.test     ?? [])
        ];
        const tagOk = !hasTags || (
          union ? selTags.some(t => itmTags.includes(t))
                : selTags.every(t => itmTags.includes(t))
        );
        const txtOk = !hasTerms || txt;
        return txtOk && tagOk;
      })
      .sort(createSearchSorter(terms));
  };

  const renderSkills = arr=>{
    const groups = [];
    arr.forEach(p=>{
        const multi = isMonstrousTrait(p) || (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
        if(multi && !['Naturligt vapen','Pansar','Regeneration','Robust'].includes(p.namn)){
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
      let raceInfo = '';
      if (p.namn === 'Blodsband' && p.race) {
        raceInfo = `<br><strong>Ras:</strong> ${p.race}`;
        infoHtml += raceInfo;
      }
      const traitInfo = p.trait ? `<br><strong>Karaktärsdrag:</strong> ${p.trait}` : '';
      const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml + traitInfo)}">Info</button>`;

      const li=document.createElement('li');
      li.className='card' + (compact ? ' compact' : '');
      li.dataset.name=p.namn;
      if(p.trait) li.dataset.trait=p.trait;
      if(p.trait) li.dataset.trait=p.trait;
      const multi = isMonstrousTrait(p) || (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
        const total = storeHelper.getCurrentList(store).filter(x=>x.namn===p.namn && !x.trait).length;
        const limit = storeHelper.monsterStackLimit(storeHelper.getCurrentList(store), p.namn);
        const badge = g.count>1 ? ` <span class="count-badge">×${g.count}</span>` : '';
        let btn = '';
        if(multi){
          const addBtn = total < limit ? `<button data-act="add" class="char-btn" data-name="${p.namn}">Lägg till</button>` : '';
          const remBtn = total>0 ? `<button data-act="rem" class="char-btn danger${addBtn ? '' : ' icon'}" data-name="${p.namn}">🗑</button>` : '';
          btn = `<div class="inv-controls">${remBtn}${addBtn}</div>`;
      }else{
        btn = `<button class="char-btn danger icon" data-act="rem">🗑</button>`;
      }
      const tagsHtml = (p.taggar?.typ || [])
        .concat(explodeTags(p.taggar?.ark_trad), p.taggar?.test || [])
        .map(t => `<span class="tag">${t}</span>`).join(' ');
      const xpVal = storeHelper.calcEntryXP(p, storeHelper.getCurrentList(store));
      const xpText = xpVal < 0 ? `+${-xpVal}` : xpVal;
      const xpHtml = `<span class="xp-cost">Erf: ${xpText}</span>`;
      li.dataset.xp = xpVal;
      const showInfo = compact || hideDetails;
      const descHtml = (!compact && !hideDetails) ? `<div class="card-desc">${desc}${raceInfo}${traitInfo}</div>` : '';
      li.innerHTML = `<div class="card-title"><span>${p.form === "beast" ? `${p.namn}: Hamnskifte` : p.namn}${badge}</span>${xpHtml}</div>
        <div class="tags">${tagsHtml}</div>
        ${lvlSel}
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
      if (tryBomb(sTemp)) {
        dom.sIn.value=''; sTemp='';
        return;
      }
      if (tryNilasPopup(sTemp)) {
        dom.sIn.value=''; sTemp='';
        return;
      }
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
      const liEl = infoBtn.closest('li');
      const title = liEl?.querySelector('.card-title > span')?.textContent || '';
      const xpVal = liEl?.dataset.xp ? Number(liEl.dataset.xp) : undefined;
      yrkePanel.open(title, html, xpVal);
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
    const multi = isMonstrousTrait(p) || (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) && !tr;
    let list;
        if(actBtn.dataset.act==='add'){
          if(!multi) return;
          const cnt = before.filter(x=>x.namn===name && !x.trait).length;
          const limit = storeHelper.monsterStackLimit(before, name);
          if(cnt >= limit){
            alert(`Denna fördel eller nackdel kan bara tas ${limit} gånger.`);
            return;
          }
        const lvlSel = liEl.querySelector('select.level');
        let   lvl = lvlSel ? lvlSel.value : null;
        if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || p.nivå;
        if(name==='Råstyrka'){
          const robust=before.find(x=>x.namn==='Robust');
          const hasRobust=!!robust && (robust.nivå===undefined || robust.nivå!=='');
          if(!hasRobust){
            if(!confirm('Råstyrka kräver Robust på minst Novis-nivå. Lägga till ändå?'))
              return;
          }
        }
        if(name==='Mörkt förflutet' && before.some(x=>x.namn==='Jordnära')){
          alert('Jordnära karaktärer kan inte ta Mörkt förflutet.');
          return;
        }
        list = [...before, { ...p, nivå: lvl }];
    }else if(actBtn.dataset.act==='rem'){
      if(name==='Bestialisk' && before.some(x=>x.namn==='Mörkt blod')){
        if(!confirm('Bestialisk hänger ihop med Mörkt blod. Ta bort ändå?'))
          return;
      }
      if(isMonstrousTrait(p) && before.some(x=>x.namn==='Mörkt blod')){
        if(!confirm(name+' hänger ihop med Mörkt blod. Ta bort ändå?'))
          return;
      }
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
      const removed = before.find(it => it.namn===name && (tr?it.trait===tr:!it.trait));
      const remDeps = storeHelper.getDependents(before, removed);
      if(name==='Mörkt blod' && remDeps.length){
        if(confirm(`Ta bort även: ${remDeps.join(', ')}?`)){
          list = list.filter(x => !remDeps.includes(x.namn));
        }
      } else if(remDeps.length){
        if(!confirm(`F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${remDeps.join(', ')}. Ta bort \u00e4nd\u00e5?`)) return;
      }
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        const deps = before
          .filter(isElityrke)
          .filter(el => eliteReq.check(el, before).ok && !eliteReq.check(el, list).ok)
          .map(el => el.namn);
        const msg = deps.length
          ? `F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${deps.join(', ')}. Ta bort \u00e4nd\u00e5?`
          : 'F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r ett valt elityrke. Ta bort \u00e4nd\u00e5?';
        if(!confirm(msg))
          return;
      }
    } else {
      return;
    }
    storeHelper.setCurrentList(store, list);
    if (p.namn === 'Privilegierad') {
      invUtil.renderInventory();
    }
    if (p.namn === 'Besittning') {
      if (actBtn.dataset.act === 'add') {
        const amount = Math.floor(Math.random() * 10) + 11;
        storeHelper.setPossessionMoney(store, { daler: amount, skilling: 0, 'örtegar': 0 });
        alert(`Grattis! Din besittning har tjänat dig ${amount} daler!`);
      } else {
        storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
      }
      invUtil.renderInventory();
    }
    if (p.namn === 'Välutrustad') {
      const inv = storeHelper.getInventory(store);
      if (actBtn.dataset.act === 'add') {
        invUtil.addWellEquippedItems(inv);
      } else {
        invUtil.removeWellEquippedItems(inv);
      }
      invUtil.saveInventory(inv);
      invUtil.renderInventory();
    }
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
      if (storeHelper.hamnskifteNoviceLimit(list, ent, ent.nivå)) {
        alert('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
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