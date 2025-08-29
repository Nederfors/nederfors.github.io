(function(window){
function initCharacter() {
  dom.cName.textContent = store.characters.find(c=>c.id===store.current)?.name||'';

  const F = { search:[], typ:[], ark:[], test:[] };
  let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', compact);

  let catsMinimized = false;
  const updateCatToggle = () => {
    catsMinimized = [...document.querySelectorAll('.cat-group > details')]
      .every(d => !d.open);
    dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
    dom.catToggle.title = catsMinimized
      ? 'Öppna alla kategorier'
      : 'Minimera alla kategorier';
  };

  const summaryBtn = document.getElementById('summaryToggle');
  const summaryPanel = document.getElementById('summaryPanel');
  const summaryClose = document.getElementById('summaryClose');
  const summaryContent = document.getElementById('summaryContent');

  const conflictPanel = document.getElementById('conflictPanel');
  const conflictClose = document.getElementById('conflictClose');
  const conflictList = document.getElementById('conflictList');
  const conflictTitle = document.getElementById('conflictTitle');

  const flashAdded = (name, trait) => {
    const selector = `li[data-name="${CSS.escape(name)}"]${trait ? `[data-trait="${CSS.escape(trait)}"]` : ''}`;
    const items = dom.valda?.querySelectorAll(selector);
    const li = items?.[items.length - 1];
    if (li) {
      li.classList.add('inv-flash');
      setTimeout(() => li.classList.remove('inv-flash'), 1000);
    }
  };

  const flashRemoved = li => {
    if (li) {
      li.classList.add('rm-flash');
      setTimeout(() => li.classList.remove('rm-flash'), 1000);
    }
  };

  function conflictEntryHtml(p){
    const compact = storeHelper.getCompactEntries(store);
    const maxIdx = LVL.indexOf(p.nivå || LVL[0]);
    const lvlTags = LVL.filter((l, i) => i <= maxIdx && p.taggar?.handling?.[l]?.includes('Aktiv'));
    const lvlHtml = LVL.filter((_, i) => i <= maxIdx)
      .map(l => p.taggar?.handling?.[l]?.includes('Aktiv')
        ? `<dt>${l}</dt><dd>${formatText(p.nivåer?.[l] || '')}</dd>`
        : '')
      .filter(Boolean)
      .join('');
    const tagHtml = compact && lvlTags.length
      ? `<div class="tags">${lvlTags.map(l=>`<span class="tag">${l}</span>`).join('')}</div>`
      : '';
    const desc = (!compact && lvlHtml)
      ? `<div class="card-desc"><dl class="levels">${lvlHtml}</dl></div>`
      : '';
    return `<li class="card${compact ? ' compact' : ''}"><div class="card-title"><span>${p.namn}</span></div>${tagHtml}${desc}</li>`;
  }

  function renderConflicts(list){
    conflictList.innerHTML = list.length
      ? list.map(conflictEntryHtml).join('')
      : '<li class="card">Inga konflikter.</li>';
  }

  function renderSummary(){
    const list = storeHelper.getCurrentList(store);
    const inv = storeHelper.getInventory(store);
    const traits = storeHelper.getTraits(store);
    const effects = storeHelper.getArtifactEffects(store);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(inv) : {};
    const KEYS = ['Diskret','Kvick','Listig','Stark','Träffsäker','Vaksam','Viljestark','Övertygande'];
    const vals = {};
    KEYS.forEach(k=>{ vals[k] = (traits[k]||0) + (bonus[k]||0) + (maskBonus[k]||0); });

    const hasHardnackad = list.some(p=>p.namn==='Hårdnackad');
    const hasKraftprov = list.some(p=>p.namn==='Kraftprov');
    const valStark = vals['Stark'];
    const capacity = storeHelper.calcCarryCapacity(valStark, list);
    const hardy = hasHardnackad ? 1 : 0;
    const talBase = hasKraftprov ? valStark + 5 : Math.max(10, valStark);
    const tal = talBase + hardy;
    const pain = storeHelper.calcPainThreshold(valStark, list, effects);

    const valWill = vals['Viljestark'];
    const strongGift = list.some(p=>p.namn==='Stark gåva' && ['Gesäll','Mästare'].includes(p.nivå||''));
    const hasSjalastark = list.some(p=>p.namn==='Själastark');
    const resistCount = list.filter(p=>p.namn==='Motståndskraft').length;
    const sensCount = list.filter(p=>p.namn==='Korruptionskänslig').length;
    const hasDarkPast = list.some(p=>p.namn==='Mörkt förflutet');
    const permBase = storeHelper.calcPermanentCorruption(list, effects);
    const hasEarth = list.some(p=>p.namn==='Jordnära');
    const baseMax = strongGift ? valWill * 2 : valWill;
    const threshBase = strongGift ? valWill : Math.ceil(valWill / 2);
    const maxCor = baseMax + (hasSjalastark ? 1 : 0);
    let thresh = threshBase + resistCount - sensCount;
    let perm = hasEarth ? (permBase % 2) : permBase;
    if(hasDarkPast) perm += Math.ceil(thresh / 3);

    const defTrait = getDefenseTraitName(list);
    const kvickForDef = vals[defTrait];
    const defenseList = calcDefense(kvickForDef);
    const defenseHtml = defenseList.map(d=>`<li>Försvar${d.name ? ' ('+d.name+')' : ''}: ${d.value}</li>`).join('');

    const cond = [];
    if(storeHelper.abilityLevel(list,'Fint') >= 1){
      cond.push('Diskret som träffsäker för kort eller precist vapen i närstrid');
    }
    if(storeHelper.abilityLevel(list,'Lönnstöt') >= 1){
      cond.push('Diskret som träffsäker vid attacker med Övertag');
    }
    if(storeHelper.abilityLevel(list,'Taktiker') >= 3){
      cond.push('Listig som träffsäker för allt utom tunga vapen');
    }
    const sjatte = Math.max(
      storeHelper.abilityLevel(list,'Sjätte Sinne'),
      storeHelper.abilityLevel(list,'Sjätte sinne')
    );
    if(sjatte >= 3){
      cond.push('Vaksam som träffsäker');
    } else if(sjatte >= 1){
      cond.push('Vaksam som träffsäker för avståndsattacker');
    }
    if(storeHelper.abilityLevel(list,'Järnnäve') >= 1){
      cond.push('Stark som träffsäker i närstrid');
    }
    if(storeHelper.abilityLevel(list,'Dominera') >= 1){
      cond.push('Övertygande som träffsäker i närstrid');
    }
    if(storeHelper.abilityLevel(list,'Ledare') >= 1){
      cond.push('Övertygande istället för Viljestark vid mystiska förmågor och ritualer');
    }
    if(!cond.length) cond.push('Inga särskilda ersättningar');

    const baseXP = storeHelper.getBaseXP(store);
    const usedXP = storeHelper.calcUsedXP(list, effects);
    const totalXP = storeHelper.calcTotalXP(baseXP, list);
    const freeXP = totalXP - usedXP;

    const data = store.data[store.current] || {};
    const bonusMoney = storeHelper.normalizeMoney(data.bonusMoney);
    const privMoney = storeHelper.normalizeMoney(data.privMoney);
    const posMoney = storeHelper.normalizeMoney(data.possessionMoney);
    const totalMoney = storeHelper.normalizeMoney({
      daler: bonusMoney.daler + privMoney.daler + posMoney.daler,
      skilling: bonusMoney.skilling + privMoney.skilling + posMoney.skilling,
      'örtegar': bonusMoney['örtegar'] + privMoney['örtegar'] + posMoney['örtegar']
    });

    summaryContent.innerHTML = `
      <section class="summary-section">
        <h3>XP</h3>
        <ul>
          <li>Total XP: ${totalXP}</li>
          <li>Använt XP: ${usedXP}</li>
          <li>XP kvar: ${freeXP}</li>
        </ul>
      </section>
      <section class="summary-section">
        <h3>Ekonomi</h3>
        <ul>
          <li>Bonus: ${formatMoney(bonusMoney)}</li>
          <li>Privat: ${formatMoney(privMoney)}</li>
          <li>Egendom: ${formatMoney(posMoney)}</li>
          <li>Totalt: ${formatMoney(totalMoney)}</li>
        </ul>
      </section>
      <section class="summary-section">
        <h3>Försvar</h3>
        <ul>${defenseHtml}</ul>
      </section>
      <section class="summary-section">
        <h3>Korruption</h3>
        <ul>
          <li>Maximal korruption: ${maxCor}</li>
          <li>Permanent korruption: ${perm}</li>
          <li>Korruptionströskel: ${thresh}</li>
        </ul>
      </section>
      <section class="summary-section">
        <h3>Bärkapacitet</h3>
        <ul><li>${formatWeight(capacity)}</li></ul>
      </section>
      <section class="summary-section">
        <h3>Hälsa</h3>
        <ul>
          <li>Tålighet: ${tal}</li>
          <li>Smärtgräns: ${pain}</li>
        </ul>
      </section>
      <section class="summary-section">
        <h3>Träffsäkerhet</h3>
        <ul>${cond.map(c=>`<li>${c}</li>`).join('')}</ul>
      </section>
    `;
  }

  summaryBtn.addEventListener('click',()=>{
    renderSummary();
    const isOpen = summaryPanel.classList.toggle('open');
    if (isOpen) summaryPanel.scrollTop = 0;
  });
  summaryClose.addEventListener('click',()=>summaryPanel.classList.remove('open'));
  document.addEventListener('click',e=>{
    if(!summaryPanel.contains(e.target) && e.target!==summaryBtn){
      summaryPanel.classList.remove('open');
    }
  });

  conflictClose.addEventListener('click',()=>conflictPanel.classList.remove('open'));
  document.addEventListener('click',e=>{
    if(conflictPanel.classList.contains('open') &&
      !conflictPanel.contains(e.target) &&
      !e.target.closest('.conflict-btn')){
      conflictPanel.classList.remove('open');
    }
  });

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
    const onlySel = storeHelper.getOnlySelected(store);
    const terms = F.search
      .map(t => searchNormalize(t.toLowerCase()));
    const base = storeHelper.getCurrentList(store);
    const nameSet = onlySel ? new Set(base.map(x => x.namn)) : null;
    return base
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
        const selOk = !nameSet || nameSet.has(p.namn);
        return txtOk && tagOk && selOk;
      })
      .sort(createSearchSorter(terms));
  };

  const renderSkills = arr=>{
    const groups = [];
    arr.forEach(p=>{
        const multi = (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
        if(multi){
          const g = groups.find(x=>x.entry.namn===p.namn);
          if(g) { g.count++; return; }
          groups.push({entry:p, count:1});
        } else {
          groups.push({entry:p, count:1});
        }
    });
    const compact = storeHelper.getCompactEntries(store);
    const openCats = new Set(
      [...dom.valda.querySelectorAll('.cat-group > details[open]')]
        .map(d => d.dataset.cat)
    );
    dom.valda.innerHTML = '';
    if(!groups.length){ dom.valda.innerHTML = '<li class="card">Inga träffar.</li>'; return; }
    const cats = {};
    const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
      .map(t => searchNormalize(t.toLowerCase()));
    const searchActive = terms.length > 0;
    const catNameMatch = {};
    groups.forEach(g=>{
      const cat = g.entry.taggar?.typ?.[0] || 'Övrigt';
      (cats[cat] ||= []).push(g);
      if (searchActive) {
        const name = searchNormalize((g.entry.namn || '').toLowerCase());
        if (terms.every(q => name.includes(q))) {
          catNameMatch[cat] = true;
        }
      }
    });
    const catKeys = Object.keys(cats);
    catKeys.sort((a,b)=>{
      if (searchActive) {
        const aMatch = catNameMatch[a] ? 1 : 0;
        const bMatch = catNameMatch[b] ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return catComparator(a,b);
    });
    catKeys.forEach(cat=>{
      const catLi=document.createElement('li');
      catLi.className='cat-group';
      catLi.innerHTML=`<details data-cat="${cat}"${openCats.has(cat) ? ' open' : ''}><summary>${catName(cat)}</summary><ul class="card-list"></ul></details>`;
      const detailsEl = catLi.querySelector('details');
      detailsEl.addEventListener('toggle', updateCatToggle);
      const listEl=detailsEl.querySelector('ul');
      cats[cat].forEach(g=>{
        const p = g.entry;
        const availLvls = LVL.filter(l=>p.nivåer?.[l]);
        const lvlSel = availLvls.length>1
          ? `<select class="level" data-name="${p.namn}"${p.trait?` data-trait="${p.trait}"`:''}>
              ${availLvls.map(l=>`<option${l===p.nivå?' selected':''}>${l}</option>`).join('')}
            </select>`
          : '';
        const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
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
        let traitInfo = '';
        if (p.trait) {
          traitInfo = p.namn === 'Monsterlärd'
            ? `<br><strong>Specialisering:</strong> ${p.trait}`
            : `<br><strong>Karaktärsdrag:</strong> ${p.trait}`;
          infoHtml += traitInfo;
        }
        const xpVal = storeHelper.calcEntryXP(p, storeHelper.getCurrentList(store));
        const xpText = xpVal < 0 ? `+${-xpVal}` : xpVal;
        const xpTag = `<span class="tag xp-cost">Erf: ${xpText}</span>`;
        const infoTagsHtml = [xpTag]
          .concat((p.taggar?.typ || []).map(t => `<span class="tag">${t}</span>`))
          .concat(explodeTags(p.taggar?.ark_trad).map(t => `<span class="tag">${t}</span>`))
          .concat((p.taggar?.test || []).map(t => `<span class="tag">${t}</span>`))
          .filter(Boolean)
          .join(' ');
        const tagsHtml = []
          .concat((p.taggar?.typ || []).map(t => `<span class="tag">${t}</span>`))
          .concat(explodeTags(p.taggar?.ark_trad).map(t => `<span class="tag">${t}</span>`))
          .concat((p.taggar?.test || []).map(t => `<span class="tag">${t}</span>`))
          .filter(Boolean)
          .join(' ');
        const xpHtml = `<span class="xp-cost">Erf: ${xpText}</span>`;
        if (infoTagsHtml) {
          infoHtml = `<div class="tags">${infoTagsHtml}</div><br>${infoHtml}`;
        }
        const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml)}">Info</button>`;

        const li=document.createElement('li');
        li.className='card' + (compact ? ' compact' : '');
        li.dataset.name=p.namn;
        if(p.trait) li.dataset.trait=p.trait;
        const multi = (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) && !p.trait;
        const total = storeHelper.getCurrentList(store).filter(x=>x.namn===p.namn && !x.trait).length;
        const limit = storeHelper.monsterStackLimit(storeHelper.getCurrentList(store), p.namn);
        const badge = g.count>1 ? ` <span class="count-badge">×${g.count}</span>` : '';
        const activeLvls = LVL.filter((l, i) => i <= LVL.indexOf(p.nivå || LVL[0]) && p.taggar?.handling?.[l]?.includes('Aktiv'));
        const conflictBtn = activeLvls.length
          ? `<button class="char-btn icon conflict-btn" data-name="${p.namn}" title="Aktiva nivåer: ${activeLvls.join(', ')}">💔</button>`
          : '';
        const showInfo = compact || hideDetails;
        let btn = '';
        if(multi){
          const addBtn = total < limit ? `<button data-act="add" class="char-btn" data-name="${p.namn}">Lägg till</button>` : '';
          const remBtn = total>0 ? `<button data-act="rem" class="char-btn danger${addBtn ? '' : ' icon'}" data-name="${p.namn}">🗑</button>` : '';
          btn = `<div class="inv-controls">${showInfo ? infoBtn : ''}${remBtn}${conflictBtn}${addBtn}</div>`;
        }else{
          btn = `<div class="inv-controls">${showInfo ? infoBtn : ''}<button class="char-btn danger icon" data-act="rem">🗑</button>${conflictBtn}</div>`;
        }
        li.dataset.xp = xpVal;
        const descHtml = (!compact && !hideDetails) ? `<div class="card-desc">${desc}${raceInfo}${traitInfo}</div>` : '';
        const tagsDiv = (!compact && tagsHtml)
          ? `<div class="tags">${tagsHtml}</div>`
          : '';
        li.innerHTML = `<div class="card-title"><span>${p.namn}${badge}</span>${xpHtml}</div>
        ${tagsDiv}
        ${lvlSel}
        ${descHtml}
        ${btn}`;

        listEl.appendChild(li);
      });
      dom.valda.appendChild(catLi);
    });
    updateCatToggle();
  };

  /* custom suggestions above search (entries only, min 2 chars) */
  let sugIdx = -1;
  const updateSearchDatalist = () => {
    const sugEl = dom.searchSug || (document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest'));
    if (!sugEl) return;
    const q = (dom.sIn?.value || '').trim();
    if (q.length < 2) {
      sugEl.innerHTML = '';
      sugEl.hidden = true;
      sugIdx = -1;
      window.updateScrollLock?.();
      return;
    }
    const nq = searchNormalize(q.toLowerCase());
    const seen = new Set();
    const MAX = 50;
    const items = [];
    for (const p of filtered()) {
      const name = String(p.namn || '').trim();
      if (!name) continue;
      const nname = searchNormalize(name.toLowerCase());
      if (!nname.includes(nq)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      items.push(name);
      if (items.length >= MAX) break;
    }
    if (!items.length) {
      sugEl.innerHTML = '';
      sugEl.hidden = true;
      sugIdx = -1;
      window.updateScrollLock?.();
      return;
    }
    sugEl.innerHTML = items.map((v,i)=>`<div class="item" data-idx="${i}" data-val="${v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')}">${v}</div>`).join('');
    sugEl.hidden = false;
    sugIdx = -1;
    window.updateScrollLock?.();
  };

  renderSkills(filtered()); activeTags(); updateXP(); renderTraits(); updateSearchDatalist();
  window.indexViewUpdate = () => { renderSkills(filtered()); renderTraits(); updateSearchDatalist(); };

  dom.catToggle.addEventListener('click', () => {
    const details = document.querySelectorAll('.cat-group > details');
    if (catsMinimized) {
      details.forEach(d => { d.open = true; });
    } else {
      details.forEach(d => { d.open = false; });
    }
    updateCatToggle();
  });

  /* --- filter-events */
  dom.sIn.addEventListener('input', ()=>{
    sTemp = dom.sIn.value.trim();
    updateSearchDatalist();
  });
  {
    const sugEl = document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest');
    if (sugEl) {
      sugEl.addEventListener('click', e => {
        const it = e.target.closest('.item');
        if (!it) return;
        const val = (it.dataset.val || '').trim();
        if (val && !F.search.includes(val)) F.search.push(val);
        if (val && window.storeHelper?.addRecentSearch) {
          storeHelper.addRecentSearch(store, val);
        }
        dom.sIn.value = '';
        sTemp = '';
        updateSearchDatalist();
        activeTags();
        renderSkills(filtered());
        renderTraits();
        dom.sIn.blur();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }
  dom.sIn.addEventListener('keydown',e=>{
    const sugEl = dom.searchSug || (document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest'));
    const items = sugEl && !sugEl.hidden ? [...sugEl.querySelectorAll('.item')] : [];
    if (e.key==='ArrowDown' && items.length) {
      e.preventDefault();
      sugIdx = Math.min(items.length - 1, sugIdx + 1);
      items.forEach((el,i)=>el.classList.toggle('active', i===sugIdx));
      return;
    }
    if (e.key==='ArrowUp' && items.length) {
      e.preventDefault();
      sugIdx = Math.max(-1, sugIdx - 1);
      items.forEach((el,i)=>el.classList.toggle('active', i===sugIdx));
      return;
    }
    if(e.key==='Enter'){
      e.preventDefault();
      dom.sIn.blur();
      const term = sTemp.toLowerCase();
      if (items.length && sugIdx >= 0) {
        const chosen = items[sugIdx]?.dataset?.val || '';
        if (chosen) {
          dom.sIn.value = chosen; sTemp = chosen.trim();
          updateSearchDatalist();
        }
      }
      if (term === 'webapp') {
        const ua = navigator.userAgent.toLowerCase();
        let anchor = 'general';
        if (/iphone|ipad|ipod/.test(ua)) anchor = 'ios';
        else if (/android/.test(ua)) anchor = 'android';
        else if (/edg|edge/.test(ua)) anchor = 'edge';
        else if (/firefox/.test(ua)) anchor = 'firefox';
        else if (/chrome/.test(ua)) anchor = 'chrome';
        window.open(`webapp.html#${anchor}`, '_blank');
        dom.sIn.value = ''; sTemp = '';
        updateSearchDatalist();
        return;
      }
      if (term === 'lol') {
        F.search=[];F.typ=[];F.ark=[];F.test=[]; sTemp='';
        dom.sIn.value=''; dom.typSel.value=dom.arkSel.value=dom.tstSel.value='';
        storeHelper.setOnlySelected(store, false);
        storeHelper.clearRevealedArtifacts(store);
        activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
        return;
      }
      if (tryBomb(sTemp)) {
        dom.sIn.value=''; sTemp='';
        updateSearchDatalist();
        return;
      }
      if (tryNilasPopup(sTemp)) {
        dom.sIn.value=''; sTemp='';
        updateSearchDatalist();
        return;
      }
      if(sTemp && !F.search.includes(sTemp)) F.search.push(sTemp);
      dom.sIn.value=''; sTemp='';
      activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
    }
  });
  [ ['typSel','typ'], ['arkSel','ark'], ['tstSel','test'] ].forEach(([sel,key])=>{
    dom[sel].addEventListener('change',()=>{
      const v=dom[sel].value;
      if (sel === 'tstSel' && !v) {
        F[key] = [];
        storeHelper.setOnlySelected(store, false);
        activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
        return;
      }
      if(v&&!F[key].includes(v)) F[key].push(v);
      dom[sel].value=''; activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
    });
  });
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const sec=t.dataset.type,val=t.dataset.val;
    if(sec==='search'){F.search=F.search.filter(x=>x!==val);}
    else F[sec]=F[sec].filter(x=>x!==val);
    if(sec==='test'){ storeHelper.setOnlySelected(store,false); dom.tstSel.value=''; }
    activeTags(); renderSkills(filtered()); renderTraits(); updateSearchDatalist();
  });

  function formatLevels(list){
    if(list.length===0) return '';
    if(list.length===1) return list[0];
    if(list.length===2) return `${list[0]} och ${list[1]}`;
    return `${list.slice(0,-1).join(', ')} och ${list[list.length-1]}`;
  }

  /* ta bort & nivåbyte */
  dom.valda.addEventListener('click', async e=>{
    const conflictBtn = e.target.closest('.conflict-btn');
    if(conflictBtn){
      const currentName = conflictBtn.dataset.name;
      const current = storeHelper.getCurrentList(store).find(x=>x.namn===currentName);
      const idx = LVL.indexOf(current?.nivå || LVL[0]);
      const curLvls = LVL.filter((l, i) => i <= idx && current?.taggar?.handling?.[l]?.includes('Aktiv'));
      const lvlWord = curLvls.length === 1 ? 'nivån' : 'nivåerna';
      const levelsText = curLvls.length ? ` på ${lvlWord} ${formatLevels(curLvls)}` : '';
      conflictTitle.textContent = `${currentName}${levelsText} kan ej användas samtidigt som:`;
      const others = storeHelper.getCurrentList(store)
        .filter(x => x.namn !== currentName && LVL.some((l, i) =>
          i <= LVL.indexOf(x.nivå || LVL[0]) && x.taggar?.handling?.[l]?.includes('Aktiv')
        ));
      renderConflicts(others);
      conflictPanel.classList.add('open');
      conflictPanel.scrollTop = 0;
      return;
    }
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      const html=decodeURIComponent(infoBtn.dataset.info||'');
      const liEl = infoBtn.closest('li');
      const title = liEl?.querySelector('.card-title > span')?.textContent || '';
      if(infoBtn.dataset.tabell!=null){
        tabellPopup.open(html, title);
        return;
      }
      yrkePanel.open(title, html);
      return;
    }
    const actBtn=e.target.closest('button[data-act]');
    if(!actBtn) return;
    const liEl = actBtn.closest('li');
    const name = liEl.dataset.name;
    const tr = liEl.dataset.trait || null;
    const before = storeHelper.getCurrentList(store);
    const disBefore = storeHelper.countDisadvantages(before);
    const p = DB.find(x=>x.namn===name) || before.find(x=>x.namn===name);
    if(!p) return;
    const multi = (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) && !tr;
    let list;
        if(actBtn.dataset.act==='add'){
          if(name==='Korruptionskänslig' && before.some(x=>x.namn==='Dvärg')){
            await alertPopup('Dvärgar kan inte ta Korruptionskänslig.');
            return;
          }
          if(!multi) return;
          const cnt = before.filter(x=>x.namn===name && !x.trait).length;
          const limit = storeHelper.monsterStackLimit(before, name);
          if(cnt >= limit){
            await alertPopup(`Denna fördel eller nackdel kan bara tas ${limit} gånger.`);
            return;
          }
        const lvlSel = liEl.querySelector('select.level');
        let   lvl = lvlSel ? lvlSel.value : null;
        if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || p.nivå;
        if(isMonstrousTrait(p)){
          const baseName = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
          const baseRace = before.find(isRas)?.namn;
          const trollTraits = ['Naturligt vapen', 'Pansar', 'Regeneration', 'Robust'];
          const undeadTraits = ['Gravkyla', 'Skräckslå', 'Vandödhet'];
          const bloodvaderTraits = ['Naturligt vapen','Pansar','Regeneration','Robust'];
          const hamLvl = storeHelper.abilityLevel(before, 'Hamnskifte');
          const bloodRaces = before.filter(x => x.namn === 'Blodsband' && x.race).map(x => x.race);
          let monsterOk = (p.taggar.typ || []).includes('Elityrkesförmåga') ||
            (before.some(x => x.namn === 'Mörkt blod') && storeHelper.DARK_BLOOD_TRAITS.includes(baseName)) ||
            (baseRace === 'Troll' && trollTraits.includes(baseName)) ||
            (baseRace === 'Vandöd' && undeadTraits.includes(baseName)) ||
            (baseRace === 'Rese' && baseName === 'Robust') ||
            (before.some(x => x.namn === 'Blodvadare') && bloodvaderTraits.includes(baseName)) ||
            ((baseRace === 'Andrik' || bloodRaces.includes('Andrik')) && baseName === 'Diminutiv') ||
            (hamLvl >= 2 && lvl === 'Novis' && ['Naturligt vapen','Pansar'].includes(baseName)) ||
            (hamLvl >= 3 && lvl === 'Novis' && ['Regeneration','Robust'].includes(baseName));
          if(!monsterOk){
            if(!(await confirmPopup('Monstruösa särdrag kan normalt inte väljas. Lägga till ändå?')))
              return;
          }
          if (storeHelper.hamnskifteNoviceLimit(before, p, lvl)) {
            await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
            return;
          }
        }
        if(name==='Råstyrka'){
          const robust=before.find(x=>x.namn==='Robust');
          const hasRobust=!!robust && (robust.nivå===undefined || robust.nivå!=='');
          if(!hasRobust){
            if(!(await confirmPopup('Råstyrka kräver Robust på minst Novis-nivå. Lägga till ändå?')))
              return;
          }
        }
        if(name==='Mörkt förflutet' && before.some(x=>x.namn==='Jordnära')){
          await alertPopup('Jordnära karaktärer kan inte ta Mörkt förflutet.');
          return;
        }
        if(name==='Packåsna' && before.some(x=>x.namn==='Hafspackare')){
          await alertPopup('Karaktärer med Hafspackare kan inte ta Packåsna.');
          return;
        }
        if(name==='Hafspackare' && before.some(x=>x.namn==='Packåsna')){
          await alertPopup('Karaktärer med Packåsna kan inte ta Hafspackare.');
          return;
        }
        list = [...before, { ...p, nivå: lvl }];
        const disAfter = storeHelper.countDisadvantages(list);
        if (disAfter === 5 && disBefore < 5) {
          await alertPopup('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
        }
    }else if(actBtn.dataset.act==='rem'){
      if(name==='Bestialisk' && before.some(x=>x.namn==='Mörkt blod')){
        if(!(await confirmPopup('Bestialisk hänger ihop med Mörkt blod. Ta bort ändå?')))
          return;
      }
      const baseRem = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
      if(isMonstrousTrait(p) && storeHelper.DARK_BLOOD_TRAITS.includes(baseRem) && before.some(x=>x.namn==='Mörkt blod')){
        if(!(await confirmPopup(name+' hänger ihop med Mörkt blod. Ta bort ändå?')))
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
        if(await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)){
          list = list.filter(x => !remDeps.includes(x.namn));
        }
      } else if(remDeps.length){
        if(!(await confirmPopup(`F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${remDeps.join(', ')}. Ta bort \u00e4nd\u00e5?`))) return;
      }
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        const deps = before
          .filter(isElityrke)
          .filter(el => eliteReq.check(el, before).ok && !eliteReq.check(el, list).ok)
          .map(el => el.namn);
        const msg = deps.length
          ? `F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${deps.join(', ')}. Ta bort \u00e4nd\u00e5?`
          : 'F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r ett valt elityrke. Ta bort \u00e4nd\u00e5?';
        if(!(await confirmPopup(msg)))
          return;
      }
      flashRemoved(liEl);
      await new Promise(r => setTimeout(r, 100));
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
        await alertPopup(`Grattis! Din besittning har tjänat dig ${amount} daler!`);
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
    if ((p.taggar?.typ || []).includes('Artefakt')) {
      const inv = storeHelper.getInventory(store);
      const removeItem = arr => {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].name === p.namn) arr.splice(i, 1);
          else if (Array.isArray(arr[i].contains)) removeItem(arr[i].contains);
        }
      };
      removeItem(inv);
      invUtil.saveInventory(inv);
      invUtil.renderInventory();
      storeHelper.removeRevealedArtifact(store, p.namn);
    }
      renderSkills(filtered());
      updateXP();
      renderTraits();
      updateSearchDatalist();
    if (actBtn.dataset.act === 'add') {
      flashAdded(name, tr);
    }

  });
  dom.valda.addEventListener('change', async e=>{
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
        await alertPopup('Förmågan krävs för ett valt elityrke och kan inte ändras.');
        ent.nivå = old;
        e.target.value = old;
        return;
      }
      if (storeHelper.hamnskifteNoviceLimit(list, ent, ent.nivå)) {
        await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
        ent.nivå = old;
        e.target.value = old;
        return;
      }
      if(name==='Monsterlärd'){
        if(['Gesäll','Mästare'].includes(ent.nivå)){
          if(!ent.trait && window.monsterLore){
            monsterLore.pickSpec(spec=>{
              if(!spec){ ent.nivå=old; e.target.value=old; return; }
              ent.trait=spec;
                storeHelper.setCurrentList(store,list); updateXP();
                renderSkills(filtered()); renderTraits(); updateSearchDatalist();
            });
            return;
          }
        }else if(ent.trait){
          delete ent.trait;
          storeHelper.setCurrentList(store,list); updateXP();
          renderSkills(filtered()); renderTraits(); updateSearchDatalist();
          return;
        }
      }
      storeHelper.setCurrentList(store,list); updateXP();
    }
      renderSkills(filtered()); renderTraits(); updateSearchDatalist();
      flashAdded(name, tr);
  });
}

  window.initCharacter = initCharacter;
})(window);