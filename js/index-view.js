(function(window){
function initIndex() {
  const F = { search:[], typ:[], ark:[], test:[] };
  let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', compact);

  const getEntries = () =>
    DB.concat(storeHelper.getCustomEntries(store));

  /* fyll dropdowns */
  const fillDropdowns = ()=>{
    const set = { typ:new Set(), ark:new Set(), test:new Set() };
    getEntries().forEach(p=>{
      (p.taggar.typ||[])
        .filter(Boolean)
        .forEach(v=>set.typ.add(v));
      explodeTags(p.taggar.ark_trad).forEach(v=>set.ark.add(v));
      (p.taggar.test||[])
        .filter(Boolean)
        .forEach(v=>set.test.add(v));
    });
    const fill=(sel,s,l)=>sel.innerHTML =
      `<option value="">${l} (alla)</option>` + [...s].sort().map(v=>`<option>${v}</option>`).join('');
    fill(dom.typSel , set.typ ,'Typ');
    fill(dom.arkSel , set.ark ,'Arketyp');
    fill(dom.tstSel , set.test,'Test');
  };
  fillDropdowns();

  /* render helpers */
  const activeTags =()=>{
    dom.active.innerHTML='';
    const push=t=>dom.active.insertAdjacentHTML('beforeend',t);
    F.search.forEach(v=>push(`<span class="tag removable" data-type="search" data-val="${v}">${v} ✕</span>`));
    F.typ .forEach(v=>push(`<span class="tag removable" data-type="typ" data-val="${v}">${v} ✕</span>`));
    F.ark .forEach(v=>push(`<span class="tag removable" data-type="ark" data-val="${v}">${v} ✕</span>`));
    F.test.forEach(v=>push(`<span class="tag removable" data-type="test" data-val="${v}">${v} ✕</span>`));
  };

  const filtered = () => {
    union = storeHelper.getFilterUnion(store);
    return getEntries().filter(p=>{
      const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
        .map(t => searchNormalize(t.toLowerCase()));
      const text = searchNormalize(`${p.namn} ${(p.beskrivning||'')}`.toLowerCase());
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
      const tagMatch = hasTags && (
        union ? selTags.some(t => itmTags.includes(t))
              : selTags.every(t => itmTags.includes(t))
      );

      if (union) {
        if (!hasTerms && !hasTags) return true;
        if (hasTerms && hasTags) return txt || tagMatch;
        return hasTerms ? txt : tagMatch;
      }
      const txtOk  = !hasTerms || txt;
      const tagOk  = !hasTags || tagMatch;
      return txtOk && tagOk;
    }).sort(sortByType);
  };

  const renderList = arr=>{
    dom.lista.innerHTML = arr.length ? '' : '<li class="card">Inga träffar.</li>';
    const charList = storeHelper.getCurrentList(store);
    const compact = storeHelper.getCompactEntries(store);
    arr.forEach(p=>{
      const isEx = p.namn === 'Exceptionellt karakt\u00e4rsdrag';
      const inChar = isEx ? false : charList.some(c=>c.namn===p.namn);
      const curLvl = charList.find(c=>c.namn===p.namn)?.nivå
        || LVL.find(l => p.nivåer?.[l]) || 'Novis';
      const availLvls = LVL.filter(l => p.nivåer?.[l]);
      const lvlSel = availLvls.length > 1
        ? `<select class="level" data-name="${p.namn}">
            ${availLvls.map(l=>`<option${l===curLvl?' selected':''}>${l}</option>`).join('')}
          </select>`
        : '';
      const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
      let desc = abilityHtml(p);
      if (isInv(p)) {
        desc += itemStatHtml(p);
        const baseQuals = [
          ...(p.taggar?.kvalitet ?? []),
          ...splitQuals(p.kvalitet)
        ];
        if (baseQuals.length) {
          const qhtml = baseQuals
            .map(q => `<span class="tag">${q}</span>`)
            .join(' ');
          desc += `<br>Kvalitet:<div class="tags">${qhtml}</div>`;
        }
        if (p.grundpris) {
          desc += `<br>Pris: ${formatMoney(invUtil.calcEntryCost(p))}`;
        }
      }
      let infoHtml = desc;
      if (isRas(p) || isYrke(p) || isElityrke(p)) {
        const extra = yrkeInfoHtml(p);
        if (extra) infoHtml += `<br>${extra}`;
      }
      const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml)}">Info</button>`;
      const multi = p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ['Fördel','Nackdel'].includes(t));
      const count = charList.filter(c => c.namn===p.namn && !c.trait).length;
      const badge = multi && count>0 ? ` <span class="count-badge">×${count}</span>` : '';
      let btn = '';
      if(multi){
        const addBtn = count<3 ? `<button data-act="add" class="char-btn" data-name="${p.namn}">+</button>` : '';
        const remBtn = count>0 ? `<button data-act="rem" class="char-btn danger" data-name="${p.namn}">−</button>` : '';
        btn = `<div class="inv-controls">${remBtn}${addBtn}</div>`;
      }else{
        btn = inChar
          ? `<button data-act="rem" class="char-btn danger icon" data-name="${p.namn}">🗑</button>`
          : `<button data-act="add" class="char-btn" data-name="${p.namn}">Lägg till</button>`;
      }
      const eliteBtn = isElityrke(p)
        ? `<button class="char-btn" data-elite-req="${p.namn}">Lägg till med förmågor</button>`
        : '';
      const li=document.createElement('li'); li.className='card' + (compact ? ' compact' : '');
      const tagsHtml = hideDetails ? '' : (p.taggar.typ||[])
        .concat(explodeTags(p.taggar.ark_trad), p.taggar.test||[])
        .map(t=>`<span class="tag">${t}</span>`).join(' ');
      const levelHtml = hideDetails ? '' : lvlSel;
      const descHtml = (!compact && !hideDetails) ? `<div class="card-desc">${desc}</div>` : '';
      li.innerHTML = `
        <div class="card-title">${p.namn}${badge}</div>
        ${tagsHtml}
        ${levelHtml}
        ${descHtml}
        ${infoBtn}${btn}${eliteBtn}`;
      dom.lista.appendChild(li);
    });
  };

  /* första render */
  renderList(filtered()); activeTags(); updateXP();

  /* expose update function for party toggles */
  window.indexViewUpdate = () => renderList(filtered());
  window.indexViewRefreshFilters = () => fillDropdowns();

  /* -------- events -------- */
  dom.sIn.addEventListener('input',()=>{
    sTemp = dom.sIn.value.trim();
    activeTags(); renderList(filtered());
  });
  dom.sIn.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(sTemp && !F.search.includes(sTemp)) F.search.push(sTemp);
      dom.sIn.value=''; sTemp='';
      activeTags(); renderList(filtered());
    }
  });
  [ ['typSel','typ'], ['arkSel','ark'], ['tstSel','test'] ].forEach(([sel,key])=>{
    dom[sel].addEventListener('change',()=>{
      const v = dom[sel].value; if(v && !F[key].includes(v)) F[key].push(v);
      dom[sel].value=''; activeTags(); renderList(filtered());
    });
  });
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const section=t.dataset.type, val=t.dataset.val;
    if(section==='search'){ F.search = F.search.filter(x=>x!==val); }
    else F[section] = F[section].filter(x=>x!==val);
    activeTags(); renderList(filtered());
  });
  dom.clrBtn.addEventListener('click',()=>{
    F.search=[]; F.typ=[];F.ark=[];F.test=[]; sTemp='';
    dom.sIn.value=''; dom.typSel.value=dom.arkSel.value=dom.tstSel.value='';
    activeTags(); renderList(filtered());
  });

  /* lista-knappar */
  dom.lista.addEventListener('click',e=>{
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      const html=decodeURIComponent(infoBtn.dataset.info||'');
      const title=infoBtn.closest('li')?.querySelector('.card-title')?.textContent||'';
      yrkePanel.open(title,html);
      return;
    }
    const btn=e.target.closest('button[data-act]');
    if (!btn) return;
    if (!store.current) {
      alert('Ingen rollperson vald.');
      return;
    }
    const name = btn.dataset.name;
    const p  = getEntries().find(x=>x.namn===name);
    const lvlSel = btn.closest('li').querySelector('select.level');
    let   lvl = lvlSel ? lvlSel.value : null;
    if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || null;


    /* Lägg till kvalitet direkt */
    if (isQual(p)) {
      const inv = storeHelper.getInventory(store);
      if (!inv.length) return alert('Ingen utrustning i inventariet.');
      const elig = inv.filter(it => {
        const tag = (invUtil.getEntry(it.name)?.taggar?.typ) || [];
        return ['Vapen','Rustning'].some(t => tag.includes(t));
      });
 if (!elig.length) return alert('Ingen lämplig utrustning att förbättra.');
 invUtil.openQualPopup(elig, iIdx => {
        inv[iIdx].kvaliteter = inv[iIdx].kvaliteter||[];
        const qn = p.namn;
        if (!inv[iIdx].kvaliteter.includes(qn)) inv[iIdx].kvaliteter.push(qn);
        invUtil.saveInventory(inv); invUtil.renderInventory();
      });
      return;
    }

    if (btn.dataset.act==='add') {
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        const indiv = ['Vapen','Rustning','L\u00e4gre Artefakt'].some(t=>p.taggar.typ.includes(t));
        const rowBase = { name:p.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
        if (p.artifactEffect) rowBase.artifactEffect = p.artifactEffect;
        if (indiv) {
          inv.push(rowBase);
        } else {
          const match = inv.find(x => x.name===p.namn);
          if (match) match.qty++;
          else {
            inv.push(rowBase);
          }
        }
        invUtil.saveInventory(inv); invUtil.renderInventory();
      } else {
        const list = storeHelper.getCurrentList(store);
        if (isRas(p) && list.some(isRas)) {
          alert('Du kan bara välja en ras.');
          return;
        }
        if (isYrke(p) && list.some(isYrke)) {
          if (!confirm('Du kan bara välja ett yrke. Lägga till ändå?')) return;
        }
        if (isElityrke(p) && list.some(isElityrke)) {
          if (!confirm('Du kan bara välja ett elityrke. Lägga till ändå?')) return;
        }
        if (isElityrke(p)) {
          const res = eliteReq.check(p, list);
          if (!res.ok) {
            const msg = 'Krav ej uppfyllda:\n' +
              (res.missing.length ? 'Saknar: ' + res.missing.join(', ') + '\n' : '') +
              (res.master ? '' : 'Ingen av kraven på Mästare-nivå.\n') +
              'Lägga till ändå?';
            if (!confirm(msg)) return;
          }
        }
        if (isEliteSkill(p)) {
          const allowed = explodeTags(p.taggar.ark_trad).some(reqYrke =>
            list.some(item => isElityrke(item) && item.namn === reqYrke)
          );
          if (!allowed) {
            const msg =
              'Förmågan är låst till elityrket ' +
              explodeTags(p.taggar.ark_trad).join(', ') +
              '.\nLägga till ändå?';
            if (!confirm(msg)) return;
          }
        }
        if (isMonstrousTrait(p)) {
          const allowed = (p.taggar.typ || []).includes('Elityrkesförmåga') ||
            list.some(x => x.namn === 'Mörkt blod');
          if (!allowed) {
            if (!confirm('Monstruösa särdrag kan normalt inte väljas. Lägga till ändå?')) return;
          }
        }
        if (p.namn === 'Exceptionellt karakt\u00e4rsdrag' && window.exceptionSkill) {
          const used=list.filter(x=>x.namn===p.namn).map(x=>x.trait).filter(Boolean);
          exceptionSkill.pickTrait(used, trait => {
            if(!trait) return;
            const existing=list.find(x=>x.namn===p.namn && x.trait===trait);
            if(existing){
              existing.nivå=lvl;
            }else{
              list.push({ ...p, nivå:lvl, trait });
            }
            storeHelper.setCurrentList(store,list); updateXP();
            renderList(filtered());
            renderTraits();
          });
          return;
        }
        const multi = p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ['Fördel','Nackdel'].includes(t));
        if(multi){
          const cnt = list.filter(x=>x.namn===p.namn && !x.trait).length;
          if(cnt >= 3){
            alert('Denna fördel eller nackdel kan bara tas tre gånger.');
            return;
          }
        }else if(list.some(x=>x.namn===p.namn && !x.trait)){
          return;
        }
        list.push({ ...p, nivå: lvl });
        storeHelper.setCurrentList(store, list); updateXP();

        if (p.namn === 'Välutrustad') {
          const inv = storeHelper.getInventory(store);
          const freebies = [
            { name: 'Rep, 10 meter', qty: 3 },
            { name: 'Papper', qty: 1 },
            { name: 'Kritor', qty: 1 },
            { name: 'Fackla', qty: 3 },
            { name: 'Signalhorn', qty: 1 }
          ];
          freebies.forEach(it => {
            const row = inv.find(r => r.name === it.name);
            if (row) {
              row.qty += it.qty;
              row.gratis = (row.gratis || 0) + it.qty;
              if (!row.perk) row.perk = 'Välutrustad';
            } else {
              inv.push({ name: it.name, qty: it.qty, gratis: it.qty, gratisKval: [], removedKval: [], perk: 'Välutrustad' });
            }
          });
          invUtil.saveInventory(inv); invUtil.renderInventory();
        }
      }
    } else { /* rem */
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        const idxInv   = inv.findIndex(x => x.name===p.namn);
        if (idxInv >= 0) {
          inv[idxInv].qty--; if(inv[idxInv].qty < 1) inv.splice(idxInv,1);
        }
        invUtil.saveInventory(inv); invUtil.renderInventory();
      } else {
        const tr = btn.closest('li').dataset.trait || null;
        const before = storeHelper.getCurrentList(store);
        if(p.namn==='Bestialisk' && before.some(x=>x.namn==='Mörkt blod')){
          if(!confirm('Bestialisk hänger ihop med Mörkt blod. Ta bort ändå?'))
            return;
        }
        let list;
        const multi = p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ['Fördel','Nackdel'].includes(t));
        if(multi){
          let removed=false;
          list = [];
          for(const it of before){
            if(!removed && it.namn===p.namn && (tr?it.trait===tr:!it.trait)){
              removed=true;
              continue;
            }
            list.push(it);
          }
        }else{
          list = before.filter(x => !(x.namn===p.namn && (tr?x.trait===tr:!x.trait)));
        }
        if(eliteReq.canChange(before) && !eliteReq.canChange(list)) {
          if(!confirm('Förmågan krävs för ett valt elityrke. Ta bort ändå?'))
            return;
        }
        storeHelper.setCurrentList(store,list); updateXP();
        if (p.namn === 'Välutrustad') {
          const inv = storeHelper.getInventory(store);
          inv.forEach(row => { if (row.perk === 'Välutrustad') delete row.perk; });
          invUtil.saveInventory(inv); invUtil.renderInventory();
        }
      }
    }
    renderList(filtered());
    renderTraits();
  });

  /* level-byte i listan */
  dom.lista.addEventListener('change',e=>{
    if(!e.target.matches('select.level')) return;
    const name = e.target.dataset.name;
    const tr = e.target.closest('li').dataset.trait || null;
    const list = storeHelper.getCurrentList(store);
    const ent  = list.find(x=>x.namn===name && (tr?x.trait===tr:!x.trait));
    if (ent){
      const before = list.map(x => ({...x}));
      const old = ent.nivå;
      ent.nivå = e.target.value;
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        alert('Förmågan krävs för ett valt elityrke och kan inte ändras.');
        ent.nivå = old;
        e.target.value = old;
        return;
      }
      storeHelper.setCurrentList(store,list); updateXP();
    }
  });
}

  window.initIndex = initIndex;
})(window);
