(function(window){
function initIndex() {
  if (dom.cName) {
    dom.cName.textContent = store.characters.find(c => c.id === store.current)?.name || '';
  }
  const F = { search:[], typ:[], ark:[], test:[] };
  let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', compact);
  let catsMinimized = false;

  const getEntries = () =>
    DB
      .concat(window.TABELLER || [])
      .concat(storeHelper.getCustomEntries(store));

  const FALT_BUNDLE = ['Flinta och stål','Kokkärl','Rep, 10 meter','Sovfäll','Tändved','Vattenskinn'];

  const flashAdded = (name, trait) => {
    const selector = `li[data-name="${CSS.escape(name)}"]${trait ? `[data-trait="${CSS.escape(trait)}"]` : ''}`;
    const root = dom.lista || document;
    const items = root.querySelectorAll(selector);
    const li = items?.[items.length - 1];
    if (li) {
      li.classList.add('inv-flash');
      setTimeout(() => li.classList.remove('inv-flash'), 1000);
    }
  };

  const flashRemoved = (name, trait) => {
    const selector = `li[data-name="${CSS.escape(name)}"]${trait ? `[data-trait="${CSS.escape(trait)}"]` : ''}`;
    const root = dom.lista || document;
    const items = root.querySelectorAll(selector);
    const li = items?.[items.length - 1];
    if (li) {
      li.classList.add('rm-flash');
      setTimeout(() => li.classList.remove('rm-flash'), 1000);
    }
  };

  const tabellInfoHtml = p => {
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const head = `<tr>${p.kolumner.map(c => `<th>${cap(c)}</th>`).join('')}</tr>`;
    const body = p.rader
      .map(r => `<tr>${p.kolumner.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`)
      .join('');
    return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  };

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
    if (storeHelper.getOnlySelected(store)) {
      push('<span class="tag removable" data-type="onlySel">Endast valda ✕</span>');
    }
    F.search.forEach(v=>push(`<span class="tag removable" data-type="search" data-val="${v}">${v} ✕</span>`));
    F.typ .forEach(v=>push(`<span class="tag removable" data-type="typ" data-val="${v}">${v} ✕</span>`));
    F.ark .forEach(v=>push(`<span class="tag removable" data-type="ark" data-val="${v}">${v} ✕</span>`));
    F.test.forEach(v=>push(`<span class="tag removable" data-type="test" data-val="${v}">${v} ✕</span>`));
  };

  const filtered = () => {
    union = storeHelper.getFilterUnion(store);
    const onlySel = storeHelper.getOnlySelected(store);
    const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
      .map(t => searchNormalize(t.toLowerCase()));
    const nameSet = onlySel
      ? new Set(storeHelper.getCurrentList(store).map(x => x.namn))
      : null;
    return getEntries().filter(p=>{
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
      const tagOk = !hasTags || (
        union ? selTags.some(t => itmTags.includes(t))
              : selTags.every(t => itmTags.includes(t))
      );
      const txtOk  = !hasTerms || txt;
      const selOk = !onlySel || nameSet.has(p.namn);
      return tagOk && txtOk && selOk;
    }).sort(createSearchSorter(terms));
  };

  const renderList = arr=>{
    const openCats = new Set(
      [...dom.lista.querySelectorAll('.cat-group > details[open]')]
        .map(d => d.dataset.cat)
    );
    dom.lista.innerHTML = '';
    if(!arr.length){ dom.lista.innerHTML = '<li class="card">Inga träffar.</li>'; return; }
    const charList = storeHelper.getCurrentList(store);
    const invList  = storeHelper.getInventory(store);
    const compact = storeHelper.getCompactEntries(store);
    const cats = {};
    const terms = [...F.search, ...(sTemp ? [sTemp] : [])]
      .map(t => searchNormalize(t.toLowerCase()));
    const searchActive = terms.length > 0;
    const catNameMatch = {};
    arr.forEach(p=>{
      const cat = p.taggar?.typ?.[0] || 'Övrigt';
      (cats[cat] ||= []).push(p);
      if (searchActive) {
        const name = searchNormalize((p.namn || '').toLowerCase());
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
      const listEl=catLi.querySelector('ul');
      detailsEl.addEventListener('toggle', updateCatToggle);
      cats[cat].forEach(p=>{
        if (p.kolumner && p.rader) {
          const infoHtml = tabellInfoHtml(p);
          const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml)}" data-tabell="1">Info</button>`;
          const tagsHtml = (p.taggar?.typ || [])
            .map(t => `<span class="tag">${t}</span>`)
            .join(' ');
          const tagsDiv = tagsHtml ? `<div class="tags">${tagsHtml}</div>` : '';
        const li = document.createElement('li');
        li.className = 'card';
        li.dataset.name = p.namn;
        li.innerHTML = `
            <div class="card-title"><span>${p.namn}</span></div>
            ${tagsDiv}
            <div class="inv-controls">${infoBtn}</div>`;
        listEl.appendChild(li);
        return;
        }
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
        let priceText = '';
        let weightText = '';
        let priceLabel = '';
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
            priceText = formatMoney(invUtil.calcEntryCost(p));
            priceLabel = 'Pris:';
          }
          const baseW = p.vikt ?? p.stat?.vikt ?? 0;
          const massCnt = baseQuals.filter(q => q === 'Massivt').length;
          if (baseW || massCnt) {
            const w = baseW + massCnt;
            weightText = `<br>Vikt: ${formatWeight(w)}`;
          }
        } else if (isEmployment(p)) {
          if (p.grundpris) {
            priceText = formatMoney(p.grundpris);
            priceLabel = 'Dagslön:';
          }
        } else if (isService(p)) {
          if (p.grundpris) {
            priceText = formatMoney(p.grundpris);
            priceLabel = 'Pris:';
          }
        }
        let infoHtml = priceText ? `${desc}<br>${priceLabel} ${priceText}${weightText}` : `${desc}${weightText}`;
        if (isRas(p) || isYrke(p) || isElityrke(p)) {
          const extra = yrkeInfoHtml(p);
          if (extra) infoHtml += `<br>${extra}`;
        }
        if (p.namn === 'Blodsband') {
          const races = charList.filter(c => c.namn === 'Blodsband').map(c => c.race).filter(Boolean);
          if (races.length) {
            const str = races.join(', ');
            desc += `<br><strong>Raser:</strong> ${str}`;
            infoHtml += `<br><strong>Raser:</strong> ${str}`;
          }
        }
        let spec = null;
        if (p.namn === 'Monsterlärd') {
          spec = charList.find(c => c.namn === 'Monsterlärd')?.trait || null;
          if (spec) {
            const t = `<br><strong>Specialisering:</strong> ${spec}`;
            desc += t;
            infoHtml += t;
          }
        }
        const tagsHtml = (p.taggar?.typ || [])
          .concat(explodeTags(p.taggar?.ark_trad), p.taggar?.test || [])
          .map(t=>`<span class="tag">${t}</span>`).join(' ');
        if (tagsHtml) {
          infoHtml = `<div class="tags">${tagsHtml}</div><br>${infoHtml}`;
        }
        const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml)}">Info</button>`;
        const multi = isInv(p) || (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t)));
        let count;
        if (isInv(p)) {
          if (p.namn === 'Fältutrustning') {
            const qtys = FALT_BUNDLE.map(n => invList.find(c => c.name === n)?.qty || 0);
            count = Math.min(...qtys);
          } else {
            count = invList.filter(c => c.name===p.namn).reduce((sum,c)=>sum+(c.qty||1),0);
          }
        } else {
          count = charList.filter(c => c.namn===p.namn && !c.trait).length;
        }
        const limit = isInv(p) ? Infinity : storeHelper.monsterStackLimit(charList, p.namn);
        const badge = multi && count>0 ? ` <span class="count-badge">×${count}</span>` : '';
        const xpVal = (isInv(p) || isEmployment(p) || isService(p)) ? null : storeHelper.calcEntryXP(p, charList);
        const xpText = xpVal != null ? (xpVal < 0 ? `+${-xpVal}` : xpVal) : '';
        const xpHtml = xpVal != null ? `<span class="xp-cost">Erf: ${xpText}</span>` : '';
        const titleActions = xpHtml ? `<span class="title-actions">${xpHtml}</span>` : '';
        const showInfo = compact || hideDetails;
        const eliteBtn = isElityrke(p)
          ? `<button class="char-btn" data-elite-req="${p.namn}">Lägg till med förmågor</button>`
          : '';
        const allowAdd = !(isService(p) || isEmployment(p));
        let btn = '';
        if (allowAdd) {
          if(multi){
            if(count>0){
              const delBtn = `<button data-act="del" class="char-btn danger" data-name="${p.namn}">🗑</button>`;
              const subBtn = `<button data-act="sub" class="char-btn" data-name="${p.namn}">–</button>`;
              const addBtn = count < limit ? `<button data-act="add" class="char-btn" data-name="${p.namn}">+</button>` : '';
              btn = `<div class="inv-controls">${showInfo ? infoBtn : ''}${delBtn}${subBtn}${addBtn}${eliteBtn}</div>`;
            }else{
              const addBtn = `<button data-act="add" class="char-btn" data-name="${p.namn}">Lägg till</button>`;
              btn = `<div class="inv-controls">${showInfo ? infoBtn : ''}${addBtn}${eliteBtn}</div>`;
            }
          }else{
            const mainBtn = inChar
              ? `<button data-act="rem" class="char-btn danger icon" data-name="${p.namn}">🗑</button>`
              : `<button data-act="add" class="char-btn" data-name="${p.namn}">Lägg till</button>`;
            btn = `<div class="inv-controls">${showInfo ? infoBtn : ''}${mainBtn}${eliteBtn}</div>`;
          }
        } else {
          btn = `<div class="inv-controls">${showInfo ? infoBtn : ''}</div>`;
        }
        const li=document.createElement('li');
        li.className='card' + (compact ? ' compact' : '');
        li.dataset.name = p.namn;
        if (spec) li.dataset.trait = spec;
        if (xpVal != null) li.dataset.xp = xpVal;
        const tagsDiv = (!compact && tagsHtml)
          ? `<div class="tags">${tagsHtml}</div>`
          : '';
        const levelHtml = hideDetails ? '' : lvlSel;
        const descHtml = (!compact && !hideDetails) ? `<div class="card-desc">${desc}</div>` : '';
        const priceHtml = priceText ? `<div class="card-price">${priceLabel} ${priceText}</div>` : '';
        li.innerHTML = `
          <div class="card-title"><span>${p.namn}${badge}</span>${titleActions}</div>
          ${tagsDiv}
          ${levelHtml}
          ${descHtml}
          ${priceHtml}
          ${btn}`;
        listEl.appendChild(li);
      });
      dom.lista.appendChild(catLi);
    });
    updateCatToggle();
  };

  const updateCatToggle = () => {
    catsMinimized = [...document.querySelectorAll('.cat-group > details')]
      .every(d => !d.open);
    dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
    dom.catToggle.title = catsMinimized
      ? 'Öppna alla kategorier'
      : 'Minimera alla kategorier';
  };

  /* första render */
  renderList(filtered()); activeTags(); updateXP();

  /* expose update function for party toggles */
  window.indexViewUpdate = () => { renderList(filtered()); activeTags(); };
  window.indexViewRefreshFilters = () => fillDropdowns();

  /* -------- events -------- */
  dom.sIn.addEventListener('input',()=>{
    sTemp = dom.sIn.value.trim();
    activeTags(); renderList(filtered());
  });
  dom.sIn.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const term = sTemp.toLowerCase();
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
        return;
      }
      if (term === 'lol') {
        F.search=[]; F.typ=[];F.ark=[];F.test=[]; sTemp='';
        dom.sIn.value=''; dom.typSel.value=dom.arkSel.value=dom.tstSel.value='';
        storeHelper.setOnlySelected(store, false);
        activeTags(); renderList(filtered());
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
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
      activeTags(); renderList(filtered());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  dom.catToggle.addEventListener('click', () => {
    const details = document.querySelectorAll('.cat-group > details');
    if (catsMinimized) {
      details.forEach(d => { d.open = true; });
    } else {
      details.forEach(d => { d.open = false; });
    }
    updateCatToggle();
  });
  [ ['typSel','typ'], ['arkSel','ark'], ['tstSel','test'] ].forEach(([sel,key])=>{
    dom[sel].addEventListener('change',()=>{
      const v = dom[sel].value;
      if (sel === 'tstSel' && !v) {
        F[key] = [];
        storeHelper.setOnlySelected(store, false);
        activeTags(); renderList(filtered());
        return;
      }
      if(v && !F[key].includes(v)) F[key].push(v);
      dom[sel].value=''; activeTags(); renderList(filtered());
    });
  });
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const section=t.dataset.type, val=t.dataset.val;
    if(section==='search'){ F.search = F.search.filter(x=>x!==val); }
    else if(section==='onlySel'){ storeHelper.setOnlySelected(store,false); }
    else F[section] = F[section].filter(x=>x!==val);
    if(section==='test'){ storeHelper.setOnlySelected(store,false); dom.tstSel.value=''; }
    activeTags(); renderList(filtered());
  });

  /* lista-knappar */
  dom.lista.addEventListener('click', async e=>{
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      const html=decodeURIComponent(infoBtn.dataset.info||'');
      const liEl = infoBtn.closest('li');
      const title=liEl?.querySelector('.card-title > span')?.textContent||'';
      if(infoBtn.dataset.tabell!=null){
        tabellPopup.open(html, title);
        return;
      }
      const xpVal = liEl?.dataset.xp != null ? Number(liEl.dataset.xp) : undefined;
      yrkePanel.open(title,html,xpVal);
      return;
    }
    const btn=e.target.closest('button[data-act]');
    if (!btn) return;
    if (!store.current) {
      await alertPopup('Ingen rollperson vald.');
      return;
    }
    const name = btn.dataset.name;
    const tr = btn.closest('li').dataset.trait || null;
    const p  = getEntries().find(x=>x.namn===name);
    const act = btn.dataset.act;
    const lvlSel = btn.closest('li').querySelector('select.level');
    let   lvl = lvlSel ? lvlSel.value : null;
    if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || null;


    /* Lägg till kvalitet direkt */
    if (isQual(p)) {
      const inv = storeHelper.getInventory(store);
      if (!inv.length) { await alertPopup('Ingen utrustning i inventariet.'); return; }
      const elig = inv.filter(it => {
        const tag = (invUtil.getEntry(it.name)?.taggar?.typ) || [];
        return ['Vapen','Sköld','Rustning'].some(t => tag.includes(t));
      });
 if (!elig.length) { await alertPopup('Ingen lämplig utrustning att förbättra.'); return; }
 invUtil.openQualPopup(elig, iIdx => {
        elig[iIdx].kvaliteter = elig[iIdx].kvaliteter||[];
        const qn = p.namn;
        if (!elig[iIdx].kvaliteter.includes(qn)) elig[iIdx].kvaliteter.push(qn);
        invUtil.saveInventory(inv); invUtil.renderInventory();
        renderList(filtered());
      });
      return;
    }

    if (act==='add') {
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        if (p.namn === 'Fältutrustning') {
          FALT_BUNDLE.forEach(namn => {
            const ent = invUtil.getEntry(namn);
            if (!ent.namn) return;
            const indivItem = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakter','Färdmedel']
              .some(t=>ent.taggar.typ.includes(t));
            const existing = inv.find(r => r.name === ent.namn);
            if (indivItem || !existing) {
              inv.push({ name: ent.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] });
            } else {
              existing.qty++;
            }
          });
          invUtil.saveInventory(inv); invUtil.renderInventory();
          renderList(filtered());
          FALT_BUNDLE.forEach(namn => {
            const i = inv.findIndex(r => r.name === namn);
            const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(namn)}"][data-idx="${i}"]`);
            if (li) {
              li.classList.add('inv-flash');
              setTimeout(() => li.classList.remove('inv-flash'), 1000);
            }
          });
        } else {
          const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Färdmedel'].some(t=>p.taggar.typ.includes(t));
          const rowBase = { name:p.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
          if (p.artifactEffect) rowBase.artifactEffect = p.artifactEffect;
          const addRow = trait => {
            if (trait) rowBase.trait = trait;
            let flashIdx;
            if (indiv) {
              inv.push(rowBase);
              flashIdx = inv.length - 1;
            } else {
              const match = inv.find(x => x.name===p.namn && (!trait || x.trait===trait));
              if (match) {
                match.qty++;
                flashIdx = inv.indexOf(match);
              } else {
                inv.push(rowBase);
                flashIdx = inv.length - 1;
              }
            }
            invUtil.saveInventory(inv); invUtil.renderInventory();
            renderList(filtered());
            const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(p.namn)}"][data-idx="${flashIdx}"]`);
            if (li) {
              li.classList.add('inv-flash');
              setTimeout(() => li.classList.remove('inv-flash'), 1000);
            }
          };
          if (p.traits && window.maskSkill) {
            const used = inv.filter(it => it.name===p.namn).map(it=>it.trait).filter(Boolean);
            maskSkill.pickTrait(used, async trait => {
              if(!trait) return;
              if (used.includes(trait) && !(await confirmPopup('Samma karakt\u00e4rsdrag finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(trait);
            });
          } else {
            addRow();
          }
        }
      } else {
        const list = storeHelper.getCurrentList(store);
        const disBefore = storeHelper.countDisadvantages(list);
        const checkDisadvWarning = async () => {
          if (storeHelper.countDisadvantages(list) === 5 && disBefore < 5) {
            await alertPopup('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
          }
        };
        if (p.namn === 'Korruptionskänslig' && list.some(x => x.namn === 'Dvärg')) {
          await alertPopup('Dvärgar kan inte ta Korruptionskänslig.');
          return;
        }
        if (isRas(p) && list.some(isRas)) {
          await alertPopup('Du kan bara välja en ras.');
          return;
        }
        if (p.namn === 'Dvärg') {
          const hasKorrupt = list.some(x => x.namn === 'Korruptionskänslig');
          if (hasKorrupt) {
            if (!(await confirmPopup('Du har korruptionskänslig, om du väljer till rasen Dvärg så kommer den nackdelen tas bort. Fortsätt?'))) return;
            for (let i = list.length - 1; i >= 0; i--) {
              if (list[i].namn === 'Korruptionskänslig') list.splice(i, 1);
            }
          }
        }
        if (isYrke(p) && list.some(isYrke)) {
          if (!(await confirmPopup('Du kan bara välja ett yrke. Lägga till ändå?'))) return;
        }
        if (isElityrke(p) && list.some(isElityrke)) {
          if (!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
        }
        if (isElityrke(p)) {
          const res = eliteReq.check(p, list);
          if (!res.ok) {
            const msg = 'Krav ej uppfyllda:\n' +
              (res.missing.length ? 'Saknar: ' + res.missing.join(', ') + '\n' : '') +
              (res.master ? '' : 'Ingen av kraven på Mästare-nivå.\n') +
              'Lägga till ändå?';
            if (!(await confirmPopup(msg))) return;
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
            if (!(await confirmPopup(msg))) return;
          }
        }
        let monsterOk = false;
        if (isMonstrousTrait(p)) {
          const baseName = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
          const baseRace = list.find(isRas)?.namn;
          const trollTraits = ['Naturligt vapen', 'Pansar', 'Regeneration', 'Robust'];
          const undeadTraits = ['Gravkyla', 'Skräckslå', 'Vandödhet'];
          const bloodvaderTraits = ['Naturligt vapen','Pansar','Regeneration','Robust'];
          const hamLvl = storeHelper.abilityLevel(list, 'Hamnskifte');
          const bloodRaces = list.filter(x => x.namn === 'Blodsband' && x.race).map(x => x.race);
          monsterOk = (p.taggar.typ || []).includes('Elityrkesförmåga') ||
            (list.some(x => x.namn === 'Mörkt blod') && storeHelper.DARK_BLOOD_TRAITS.includes(baseName)) ||
            (baseRace === 'Troll' && trollTraits.includes(baseName)) ||
            (baseRace === 'Vandöd' && undeadTraits.includes(baseName)) ||
            (baseRace === 'Rese' && baseName === 'Robust') ||
            (list.some(x => x.namn === 'Blodvadare') && bloodvaderTraits.includes(baseName)) ||
            ((baseRace === 'Andrik' || bloodRaces.includes('Andrik')) && baseName === 'Diminutiv') ||
            (hamLvl >= 2 && lvl === 'Novis' && ['Naturligt vapen','Pansar'].includes(baseName)) ||
            (hamLvl >= 3 && lvl === 'Novis' && ['Regeneration','Robust'].includes(baseName));
          if (!monsterOk) {
            if (!(await confirmPopup('Monstruösa särdrag kan normalt inte väljas. Lägga till ändå?'))) return;
          }
          if (storeHelper.hamnskifteNoviceLimit(list, p, lvl)) {
            await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
            return;
          }
        }
        if (storeHelper.HAMNSKIFTE_BASE[p.namn] ? storeHelper.HAMNSKIFTE_BASE[p.namn] === 'Robust' : p.namn === 'Robust') {
          const hamLvl = storeHelper.abilityLevel(list, 'Hamnskifte');
          const robustOk = monsterOk || (hamLvl >= 3 && lvl === 'Novis');
          if (!robustOk) {
            if (!(await confirmPopup('Robust kan normalt inte väljas. Lägga till ändå?'))) return;
          }
        }
        if (p.namn === 'Råstyrka') {
          const robust = list.find(x => x.namn === 'Robust');
          const hasRobust = !!robust && (robust.nivå === undefined || robust.nivå !== '');
          if (!hasRobust) {
            if (!(await confirmPopup('Råstyrka kräver Robust på minst Novis-nivå. Lägga till ändå?'))) return;
          }
        }
        if (p.namn === 'Mörkt förflutet' && list.some(x => x.namn === 'Jordnära')) {
          await alertPopup('Jordnära karaktärer kan inte ta Mörkt förflutet.');
          return;
        }
        if (isSardrag(p) && (p.taggar.ras || []).length && !(isMonstrousTrait(p) && monsterOk)) {
          const races = [];
          const base = list.find(isRas)?.namn;
          if (base) races.push(base);
          list.forEach(it => { if (it.namn === 'Blodsband' && it.race) races.push(it.race); });
          const ok = races.some(r => p.taggar.ras.includes(r));
          if (!ok) {
            const msg = 'Särdraget är bundet till rasen ' + p.taggar.ras.join(', ') + '.\nLägga till ändå?';
            if (!(await confirmPopup(msg))) return;
          }
        }
        if (p.namn === 'Blodsband' && window.bloodBond) {
          const used=list.filter(x=>x.namn===p.namn).map(x=>x.race).filter(Boolean);
          bloodBond.pickRace(used, async race => {
            if(!race) return;
            const added = { ...p, race };
            list.push(added);
            await checkDisadvWarning();
            storeHelper.setCurrentList(store,list); updateXP();
            renderList(filtered());
            renderTraits();
            flashAdded(added.namn, added.trait);
          });
          return;
        }
        if (p.namn === 'Monsterlärd' && ['Gesäll','Mästare'].includes(lvl) && window.monsterLore) {
          monsterLore.pickSpec(async spec => {
            if(!spec) return;
            const added = { ...p, nivå: lvl, trait: spec };
            list.push(added);
            await checkDisadvWarning();
            storeHelper.setCurrentList(store,list); updateXP();
            renderList(filtered());
            renderTraits();
            flashAdded(added.namn, added.trait);
          });
          return;
        }
        if (p.namn === 'Exceptionellt karakt\u00e4rsdrag' && window.exceptionSkill) {
          const used=list.filter(x=>x.namn===p.namn).map(x=>x.trait).filter(Boolean);
          exceptionSkill.pickTrait(used, async trait => {
            if(!trait) return;
            const existing=list.find(x=>x.namn===p.namn && x.trait===trait);
            let added;
            if(existing){
              existing.nivå=lvl;
              added = existing;
            }else{
              added = { ...p, nivå:lvl, trait };
              list.push(added);
            }
            await checkDisadvWarning();
            storeHelper.setCurrentList(store,list); updateXP();
            renderList(filtered());
            renderTraits();
            flashAdded(added.namn, added.trait);
          });
          return;
        }
        const multi = (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t)));
        if(multi){
          const cnt = list.filter(x=>x.namn===p.namn && !x.trait).length;
          const limit = storeHelper.monsterStackLimit(list, p.namn);
          if(p.namn !== 'Blodsband' && cnt >= limit){
            await alertPopup(`Denna fördel eller nackdel kan bara tas ${limit} gånger.`);
            return;
          }
        }else if(list.some(x=>x.namn===p.namn && !x.trait)){
          return;
        }
        let form = 'normal';
        const finishAdd = async added => {
          await checkDisadvWarning();
          storeHelper.setCurrentList(store, list); updateXP();
          if (p.namn === 'Privilegierad') {
            invUtil.renderInventory();
          }
          if (p.namn === 'Besittning') {
            const amount = Math.floor(Math.random() * 10) + 11;
            storeHelper.setPossessionMoney(store, { daler: amount, skilling: 0, 'örtegar': 0 });
            await alertPopup(`Grattis! Din besittning har tjänat dig ${amount} daler!`);
            invUtil.renderInventory();
          }
          if (p.namn === 'Välutrustad') {
            const inv = storeHelper.getInventory(store);
            invUtil.addWellEquippedItems(inv);
            invUtil.saveInventory(inv); invUtil.renderInventory();
          }
          renderList(filtered());
          renderTraits();
          flashAdded(added.namn, added.trait);
        };
        if (isMonstrousTrait(p)) {
          const test = { ...p, nivå: lvl, form: 'beast' };
          if (storeHelper.isFreeMonsterTrait(list, test) && window.beastForm) {
            beastForm.pickForm(async res => {
              if(!res) return;
              const added = { ...p, nivå: lvl, form: res };
              list.push(added);
              await finishAdd(added);
            });
            return;
          }
        }
        const added = { ...p, nivå: lvl, form };
        list.push(added);
        await finishAdd(added);
      }
    } else if (act==='sub' || act==='del' || act==='rem') {
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        if (p.namn === 'Fältutrustning') {
          const removeCnt = (act === 'del' || act === 'rem')
            ? Math.min(...FALT_BUNDLE.map(n => inv.find(r => r.name === n)?.qty || 0))
            : 1;
          if (removeCnt > 0) {
            FALT_BUNDLE.forEach(n => {
              const idxRow = inv.findIndex(r => r.name === n);
              if (idxRow >= 0) {
                inv[idxRow].qty -= removeCnt;
                if (inv[idxRow].qty < 1) inv.splice(idxRow,1);
              }
            });
          }
        } else {
          const idxInv = inv.findIndex(x => x.name===p.namn);
          if (idxInv >= 0) {
            if (act === 'del' || act === 'rem') {
              inv.splice(idxInv,1);
            } else {
              inv[idxInv].qty--;
              if (inv[idxInv].qty < 1) inv.splice(idxInv,1);
            }
          }
        }
        invUtil.saveInventory(inv); invUtil.renderInventory();
        renderList(filtered());
      } else {
        const tr = btn.closest('li').dataset.trait || null;
        const before = storeHelper.getCurrentList(store);
        if(p.namn==='Bestialisk' && before.some(x=>x.namn==='Mörkt blod')){
          if(!(await confirmPopup('Bestialisk hänger ihop med Mörkt blod. Ta bort ändå?')))
            return;
        }
        const baseRem = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
        if(isMonstrousTrait(p) && storeHelper.DARK_BLOOD_TRAITS.includes(baseRem) && before.some(x=>x.namn==='Mörkt blod')){
          if(!(await confirmPopup(p.namn+' hänger ihop med Mörkt blod. Ta bort ändå?')))
            return;
        }
        if(storeHelper.HAMNSKIFTE_BASE[p.namn] && before.some(x=>x.namn==='Hamnskifte')){
          if(!(await confirmPopup(p.namn+' hänger ihop med Hamnskifte. Ta bort ändå?')))
            return;
          const rem=storeHelper.getHamnskifteRemoved(store);
          const base=storeHelper.HAMNSKIFTE_BASE[p.namn];
          if(!rem.includes(base)){
            rem.push(base);
            storeHelper.setHamnskifteRemoved(store, rem);
          }
        }
        let list;
        if(act === 'del' || act === 'rem'){
          list = before.filter(x => !(x.namn===p.namn && (tr?x.trait===tr:!x.trait)));
        }else{
          let removed=false;
          list = [];
          for(const it of before){
            if(!removed && it.namn===p.namn && (tr?it.trait===tr:!it.trait)){
              removed=true;
              continue;
            }
            list.push(it);
          }
        }
        const removed = before.find(it => it.namn===p.namn && (tr?it.trait===tr:!it.trait));
        const remDeps = storeHelper.getDependents(before, removed);
        if(p.namn==='Mörkt blod' && remDeps.length){
          if(await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)){
            list = list.filter(x => !remDeps.includes(x.namn));
          }
        } else if(p.namn==='Hamnskifte' && remDeps.length){
          if(await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)){
            list = list.filter(x => !remDeps.includes(x.namn));
            storeHelper.setHamnskifteRemoved(store, []);
          }
        } else if(remDeps.length){
          if(!(await confirmPopup(`F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${remDeps.join(', ')}. Ta bort \u00e4nd\u00e5?`))) return;
        }
        if(eliteReq.canChange(before) && !eliteReq.canChange(list)) {
          const deps = before
            .filter(isElityrke)
            .filter(el => eliteReq.check(el, before).ok && !eliteReq.check(el, list).ok)
            .map(el => el.namn);
        const msg = deps.length
            ? `Förmågan krävs för: ${deps.join(', ')}. Ta bort ändå?`
            : 'Förmågan krävs för ett valt elityrke. Ta bort ändå?';
          if(!(await confirmPopup(msg)))
            return;
        }
        storeHelper.setCurrentList(store,list); updateXP();
        if (p.namn === 'Privilegierad') {
          invUtil.renderInventory();
        }
        if (p.namn === 'Besittning') {
          storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          const cnt = storeHelper.incrementPossessionRemoved(store);
          if (cnt >= 3) {
            const id = store.current;
            await alertPopup('Karaktären raderas på grund av misstänkt fusk.');
            storeHelper.deleteCharacter(store, id);
            location.reload();
            return;
          } else if (cnt === 2) {
            await alertPopup('Misstänkt fusk: lägger du till och tar bort denna fördel igen raderas karaktären omedelbart');
          }
          invUtil.renderInventory();
        }
          if (p.namn === 'Välutrustad') {
            const inv = storeHelper.getInventory(store);
            invUtil.removeWellEquippedItems(inv);
            invUtil.saveInventory(inv); invUtil.renderInventory();
          }
      }
    }
    renderList(filtered());
    renderTraits();
    if (act==='add') {
      flashAdded(name, tr);
    } else if (act==='sub' || act==='del' || act==='rem') {
      flashRemoved(name, tr);
    }
  });

  /* level-byte i listan */
  dom.lista.addEventListener('change', async e=>{
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
              renderList(filtered()); renderTraits();
            });
            return;
          }
        }else if(ent.trait){
          delete ent.trait;
          storeHelper.setCurrentList(store,list); updateXP();
          renderList(filtered()); renderTraits();
          return;
        }
      }
      if(name==='Hamnskifte'){
        const lvlMap={"":0,Novis:1, Gesäll:2, Mästare:3};
        const oldIdx=lvlMap[old]||0;
        const newIdx=lvlMap[ent.nivå]||0;
        let toRemove=[];
        if(oldIdx>=3 && newIdx<3) toRemove.push('Robust','Regeneration');
        if(oldIdx>=2 && newIdx<2) toRemove.push('Naturligt vapen','Pansar');
        toRemove=toRemove.filter(n=>list.some(x=>x.namn===storeHelper.HAMNSKIFTE_NAMES[n]));
        if(toRemove.length){
          const dispNames=toRemove.map(n=>storeHelper.HAMNSKIFTE_NAMES[n]);
          if(!(await confirmPopup(`Ta bort även: ${dispNames.join(', ')}?`))){
            ent.nivå=old; e.target.value=old; return;
          }
          for(let i=list.length-1;i>=0;i--){
            const base=storeHelper.HAMNSKIFTE_BASE[list[i].namn];
            if(base && toRemove.includes(base)) list.splice(i,1);
          }
          const rem=storeHelper.getHamnskifteRemoved(store).filter(x=>!toRemove.includes(x));
          storeHelper.setHamnskifteRemoved(store, rem);
        }
        const toAdd=[];
        if(newIdx>=2 && oldIdx<2) toAdd.push('Naturligt vapen','Pansar');
        if(newIdx>=3 && oldIdx<3) toAdd.push('Robust','Regeneration');
        let rem=storeHelper.getHamnskifteRemoved(store);
        toAdd.forEach(n=>{
          const hamName=storeHelper.HAMNSKIFTE_NAMES[n];
          if(!list.some(x=>x.namn===hamName) && !rem.includes(n)){
            const entry=window.DBIndex?.[n];
            if(entry) list.push({ ...entry, namn:hamName, form:'beast' });
          }
          rem=rem.filter(x=>x!==n);
        });
        storeHelper.setHamnskifteRemoved(store, rem);
      }
      storeHelper.setCurrentList(store,list); updateXP();
    }
    renderList(filtered()); renderTraits();
    flashAdded(name, tr);
  });
}

  window.initIndex = initIndex;
})(window);
