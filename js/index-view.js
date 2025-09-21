(function(window){
function initIndex() {
  const createEntryCard = window.entryCardFactory.create;
  if (dom.cName) {
    dom.cName.textContent = store.characters.find(c => c.id === store.current)?.name || '';
  }
   const F = { search:[], typ:[], ark:[], test:[] };
   const LEVEL_IDX = { '':0, Novis:1, 'Ges\u00e4ll':2, 'M\u00e4stare':3 };
   let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', !compact);
  let catsMinimized = false;
  let showArtifacts = false;
  let revealedArtifacts = new Set(storeHelper.getRevealedArtifacts(store));
  const SECRET_SEARCH = { 'pajkastare': 'ar86' };
  const SECRET_IDS = new Set(Object.values(SECRET_SEARCH));
  const ONLY_SELECTED_VALUE = '__onlySelected';
  const ONLY_SELECTED_LABEL = 'Endast valda';
  // Open matching categories once after certain actions (search/type select)
  let openCatsOnce = new Set();
  // (Removed) Hoppsan no longer auto-syncs with other categories
  // If set, override filtered list with these entries (from Random:N)
  let fixedRandomEntries = null;

  const STATE_KEY = 'indexViewState';
  let catState = {};
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
    catch { return {}; }
  };
  const saveState = () => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ filters: F, cats: catState })); }
    catch {}
  };
  {
    const saved = loadState();
    if (saved.filters) {
      ['search','typ','ark','test'].forEach(k => {
        if (Array.isArray(saved.filters[k])) F[k] = saved.filters[k];
      });
    }
    catState = saved.cats || {};
  }

  const getEntries = () => {
    const base = DB
      .concat(window.TABELLER || [])
      .concat(storeHelper.getCustomEntries(store));
    if (showArtifacts) return base.filter(p => !SECRET_IDS.has(p.id));
    return base.filter(p => (!isHidden(p) || revealedArtifacts.has(p.id)) && !SECRET_IDS.has(p.id));
  };
  const isArtifact = p => (p.taggar?.typ || []).includes('Artefakt');
  const isHidden = p => {
    const types = p.taggar?.typ || [];
    const primary = types[0] ? String(types[0]).toLowerCase() : '';
    return ['artefakt','kuriositet','skatt'].includes(primary);
  };
  const hasArtifactTag = p => (p.taggar?.typ || [])
    .some(t => String(t || '').trim().toLowerCase() === 'artefakt');

  let hiddenNameIndex = null;
  const getHiddenNameIndex = () => {
    const dbArr = Array.isArray(DB) ? DB : [];
    if (hiddenNameIndex && hiddenNameIndex.size === dbArr.length) {
      return hiddenNameIndex.map;
    }
    const map = new Map();
    dbArr.forEach(ent => {
      if (!isHidden(ent) || SECRET_IDS.has(ent.id)) return;
      const key = searchNormalize(String(ent.namn || '').toLowerCase());
      if (!key) return;
      if (!map.has(key)) map.set(key, ent.id);
    });
    hiddenNameIndex = { map, size: dbArr.length };
    return map;
  };

  const FALT_BUNDLE = ['di10','di11','di12','di13','di14','di15'];
  const STACKABLE_IDS = ['l1','l11','l27','l6','l12','l13','l28','l30'];

  const QUAL_TYPE_MAP = {
    'Vapenkvalitet': 'Vapen',
    'Rustningskvalitet': 'Rustning',
    'Sköldkvalitet': 'Sköld',
    'Allmän kvalitet': 'Allmänt'
  };
  const QUAL_TYPE_KEYS = Object.keys(QUAL_TYPE_MAP);
  const DOCK_TAG_TYPES = new Set(['Fördel','Nackdel','Särdrag','Monstruöst särdrag','Ritual','Mystisk kraft','Förmåga']);

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
    const cols = p.kolumner || [];
    const rows = p.rader || [];

    const head = `<tr>${cols.map(c => `<th>${cap(c)}</th>`).join('')}</tr>`;
    const body = rows
      .map(r => `<tr>${cols.map(c => {
        const v = r[c] ?? '';
        const dl = cap(c);
        return `<td data-label=\"${dl}\">${v}</td>`;
      }).join('')}</tr>`)
      .join('');
    const tableHtml = `<div class=\"table-wrap\"><table class=\"stack-mobile\"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    const extraHtml = p.extra ? `<div class=\"table-notes\">${formatText(p.extra)}</div>` : '';
    return `${tableHtml}${extraHtml}`;
  };

  // Inline highlight (wrap <mark>) for current search terms
  const buildNormMap = (str) => {
    const low = String(str || '').toLowerCase();
    let norm = '';
    const map = [];
    for (let i = 0; i < low.length; i++) {
      const ch = low[i];
      const n = searchNormalize(ch);
      norm += n;
      for (let k = 0; k < n.length; k++) map.push(i);
    }
    return { norm, map };
  };

  const highlightTextNode = (node, termsNorm) => {
    const text = node.nodeValue;
    if (!text || !text.trim()) return;
    const { norm, map } = buildNormMap(text);
    const ranges = [];
    for (const term of termsNorm) {
      if (!term) continue;
      let start = 0;
      while (true) {
        const idx = norm.indexOf(term, start);
        if (idx === -1) break;
        const s = map[idx];
        const e = map[idx + term.length - 1] + 1; // exclusive
        if (s != null && e != null && e > s) ranges.push([s, e]);
        start = idx + Math.max(1, term.length);
      }
    }
    if (!ranges.length) return;
    ranges.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [s,e] of merged) {
      if (pos < s) frag.appendChild(document.createTextNode(text.slice(pos, s)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(s, e);
      frag.appendChild(mark);
      pos = e;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  };

  const highlightInElement = (el, termsNorm) => {
    if (!el || !termsNorm || !termsNorm.length) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = (p.nodeName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'mark') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => highlightTextNode(n, termsNorm));
  };

  /* fyll dropdowns */
  const fillDropdowns = ()=>{
    const set = { typ:new Set(), ark:new Set(), test:new Set() };
    getEntries().forEach(p=>{
      (p.taggar.typ||[])
        .filter(Boolean)
        .forEach(v=>set.typ.add(v));
      const arkTags = explodeTags(p.taggar.ark_trad);
      if (arkTags.length) {
        arkTags.forEach(v => set.ark.add(v));
      } else if (Array.isArray(p.taggar?.ark_trad)) {
        set.ark.add('Traditionslös');
      }
      (p.taggar.test||[])
        .filter(Boolean)
        .forEach(v=>set.test.add(v));
    });
    const fill = (sel, s, label, extra = []) => {
      if (!sel) return;
      const opts = [`<option value="">${label} (alla)</option>`];
      extra.forEach(opt => {
        const text = String(opt?.label || '').trim();
        if (!text) return;
        const value = String(opt?.value ?? '');
        opts.push(`<option value="${value}">${text}</option>`);
      });
      opts.push(...[...s].sort().map(v => `<option>${v}</option>`));
      sel.innerHTML = opts.join('');
    };
    fill(dom.typSel , set.typ ,'Typ', [{ value: ONLY_SELECTED_VALUE, label: ONLY_SELECTED_LABEL }]);
    fill(dom.arkSel , set.ark ,'Arketyp');
    fill(dom.tstSel , set.test,'Test');
  };
  fillDropdowns();

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
    const esc = v => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    // Special suggestions for "[N] random: <kategori>" or "[N] slump: <kategori>"
    {
      const m = q.match(/^\s*(\d+)?\s*(random|slump)\s*:\s*(.*)$/i);
      if (m) {
        const num = (m[1] || '').trim();
        const prefix = m[2];
        const part = searchNormalize((m[3] || '').toLowerCase());
        const seenCat = new Set();
        const cats = [];
        for (const p of getEntries()) {
          for (const t of (p.taggar?.typ || [])) {
            const key = searchNormalize(String(t).toLowerCase());
            if (part && !key.includes(part)) continue;
            if (seenCat.has(t)) continue;
            seenCat.add(t);
            cats.push(t);
          }
        }
        cats.sort((a,b)=>String(a).localeCompare(String(b)));
        if (cats.length) {
          sugEl.innerHTML = cats.map((cat,i)=>{
            const base = prefix.charAt(0).toUpperCase()+prefix.slice(1).toLowerCase();
            const text = `${num ? (num + ' ') : ''}${base}: ${cat}`;
            const disp = text.charAt(0).toUpperCase() + text.slice(1);
            return `<div class="item" data-idx="${i}" data-val="${esc(text)}" data-cat="${esc(cat)}" data-count="${esc(num || '1')}" data-cmd="random">${disp}</div>`;
          }).join('');
          sugEl.hidden = false;
          sugIdx = -1;
          window.updateScrollLock?.();
          return;
        }
        // Fall back to default behavior if no categories matched
      }
    }
    const seen = new Set();
    const MAX = 50;
    const items = [];
    for (const p of getEntries()) {
      const name = String(p.namn || '').trim();
      if (!name) continue;
      const nname = searchNormalize(name.toLowerCase());
      if (!nname.includes(nq)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      items.push(name);
      if (items.length >= MAX) break;
    }
    // UI-kommandoförslag
    let uiHtml = '';
    try {
      if (window.getUICommandSuggestions) {
        const cmds = window.getUICommandSuggestions(q) || [];
        if (cmds.length) {
          const escTxt = v => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;');
          uiHtml = cmds.map((c,i)=>`<div class="item" data-ui="${escTxt(c.id)}" data-idx="ui-${i}">${escTxt((c.emoji||'') + ' ' + c.label)}</div>`).join('');
        }
      }
    } catch {}
    if (!items.length && !uiHtml) {
      sugEl.innerHTML = '';
      sugEl.hidden = true;
      sugIdx = -1;
      window.updateScrollLock?.();
      return;
    }
    const listHtml = items.map((v,i)=>{
      const disp = v.charAt(0).toUpperCase() + v.slice(1);
      return `<div class="item" data-idx="${i}" data-val="${esc(v)}">${disp}</div>`;
    }).join('');
    sugEl.innerHTML = `${uiHtml}${listHtml}`;
    sugEl.hidden = false;
    sugIdx = -1;
    window.updateScrollLock?.();
  };
  updateSearchDatalist();

  /* render helpers */
  const activeTags =()=>{
    dom.active.innerHTML='';
    const push=t=>dom.active.insertAdjacentHTML('beforeend',t);
    if (storeHelper.getOnlySelected(store)) {
      push('<span class="tag removable" data-type="onlySel">Endast valda ✕</span>');
    }
    if (fixedRandomEntries && fixedRandomEntries.length) {
      const cnt = fixedRandomEntries.length;
      const cat = (window.catName ? (fixedRandomInfo?.cat || '') : (fixedRandomInfo?.cat || ''));
      const labelCat = cat ? (window.catName ? catName(cat) : cat) : 'Urval';
      const label = `Random: ${labelCat} ×${cnt}`;
      push(`<span class="tag removable" data-type="random" data-cat="${fixedRandomInfo?.cat || ''}" data-count="${cnt}">${label} ✕</span>`);
    }
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
    let baseEntries = getEntries();
    if (fixedRandomEntries && fixedRandomEntries.length) {
      const allowed = new Set(fixedRandomEntries.map(e => e.namn));
      baseEntries = baseEntries.filter(p => allowed.has(p.namn));
    }
    const nameSet = onlySel
      ? new Set(storeHelper.getCurrentList(store).map(x => x.namn))
      : null;
    if (!fixedRandomEntries && F.typ.length === 0 && F.ark.length === 0 && F.test.length === 0 && F.search.length === 1) {
      const term = terms[0];
      const specialId = SECRET_SEARCH[term];
      if (specialId) {
        const hid = lookupEntry({ id: specialId });
        if (hid) {
          const cat = hid.taggar?.typ?.[0];
          if (cat) openCatsOnce.add(cat);
          return [hid];
        }
      }
      if (!showArtifacts) {
        const hiddenIndex = getHiddenNameIndex();
        const hiddenId = hiddenIndex.get(term);
        const hid = hiddenId !== undefined ? lookupEntry({ id: hiddenId }) : null;
        if (hid) {
          if (!revealedArtifacts.has(hid.id)) {
            revealedArtifacts.add(hid.id);
            storeHelper.addRevealedArtifact(store, hid.id);
            fillDropdowns();
          }
          const cat = hid.taggar?.typ?.[0];
          if (cat) openCatsOnce.add(cat);
          return [hid];
        }
      }
    }
    return baseEntries.filter(p=>{
      const levelText = Object.values(p.nivåer || {}).join(' ');
      const text = searchNormalize(`${p.namn} ${(p.beskrivning||'')} ${levelText}`.toLowerCase());
      const hasTerms = terms.length > 0;
      const txtHit = hasTerms && (
        union ? terms.some(q => text.includes(q))
              : terms.every(q => text.includes(q))
      );
      const tags = p.taggar || {};
      const selTags = [...F.typ, ...F.ark, ...F.test];
      const hasTags = selTags.length > 0;
      const arkTags = explodeTags(tags.ark_trad);
      const itmTags = [
        ...(tags.typ ?? []),
        ...(arkTags.length ? arkTags : (Array.isArray(tags.ark_trad) ? ['Traditionslös'] : [])),
        ...(tags.test ?? [])
      ];
      const tagHit = hasTags && (
        union ? selTags.some(t => itmTags.includes(t))
              : selTags.every(t => itmTags.includes(t))
      );
      const tagOk = !hasTags || tagHit;
      const txtOk  = !hasTerms || txtHit;
      const selOk = !onlySel || nameSet.has(p.namn);
      // In utvidgad (union) läge: tillåt träff om texten ELLER taggarna matchar
      // även om de andra filtret pekar på annan kategori.
      const combinedOk = union
        ? ((hasTags || hasTerms) ? (tagHit || txtHit) : true)
        : (tagOk && txtOk);
      return combinedOk && selOk;
    }).sort(createSearchSorter(terms));
  };

  const entryKeyFor = (entry) => {
    if (!entry) return null;
    if (entry.entryKey) return entry.entryKey;
    const id = entry.id != null && entry.id !== '' ? String(entry.id) : '';
    if (id) return `id:${id}`;
    const name = entry.namn || entry.name || '';
    if (!name) return null;
    return `name:${name}`;
  };

  const resolveEntryRef = (ref, arrById, arrByName) => {
    if (!ref) return null;
    if (typeof ref === 'string') {
      const id = String(ref);
      return arrById.get(id)
        || arrByName.get(ref)
        || lookupEntry({ id: ref, name: ref })
        || null;
    }
    if (ref.id != null || ref.namn) {
      const id = ref.id != null ? String(ref.id) : '';
      if (id && arrById.has(id)) return arrById.get(id);
      if (ref.namn && arrByName.has(ref.namn)) return arrByName.get(ref.namn);
      return ref;
    }
    if (ref.name) {
      return arrByName.get(ref.name) || lookupEntry({ name: ref.name });
    }
    return null;
  };

  let renderState = {
    entryToCat: new Map(),
    catOrder: []
  };

  const patchCardElement = (target, source) => {
    if (!target || !source) return;
    target.className = source.className;
    const srcDataset = source.dataset || {};
    const srcKeys = new Set(Object.keys(srcDataset));
    Object.keys(target.dataset).forEach(key => {
      if (!srcKeys.has(key)) delete target.dataset[key];
    });
    Object.entries(srcDataset).forEach(([key, value]) => {
      if (value == null) delete target.dataset[key];
      else target.dataset[key] = value;
    });
    target.innerHTML = source.innerHTML;
  };

  const ensureCategoryElement = (cat, existing, shouldOpen) => {
    let li = existing;
    let details;
    if (!li) {
      li = document.createElement('li');
      li.className = 'cat-group';
      li.innerHTML = `
        <details data-cat="${cat}"${shouldOpen ? ' open' : ''}>
          <summary>${catName(cat)}</summary>
          <ul class="card-list"></ul>
        </details>`;
      details = li.querySelector('details');
    } else {
      li.className = 'cat-group';
      details = li.querySelector('details');
      if (!details) {
        li.innerHTML = `
          <details data-cat="${cat}"${shouldOpen ? ' open' : ''}>
            <summary>${catName(cat)}</summary>
            <ul class="card-list"></ul>
          </details>`;
        details = li.querySelector('details');
      } else {
        details.dataset.cat = cat;
        const summary = details.querySelector('summary');
        if (summary) summary.textContent = catName(cat);
      }
      if (!details.querySelector('ul')) {
        const ul = document.createElement('ul');
        ul.className = 'card-list';
        details.appendChild(ul);
      }
    }
    details.dataset.cat = cat;
    if (shouldOpen != null && details.open !== shouldOpen) {
      details.open = shouldOpen;
    }
    if (!details.__toggleHandlerBound) {
      details.addEventListener('toggle', (ev) => {
        updateCatToggle();
        if (!ev.isTrusted) return;
        catState[cat] = details.open;
        saveState();
      });
      details.__toggleHandlerBound = true;
    }
    return li;
  };

  const ensureHoppsanCategory = (existing, shouldOpen) => {
    const hopLi = ensureCategoryElement('Hoppsan', existing, shouldOpen);
    const listEl = hopLi.querySelector('ul');
    if (listEl && !listEl.querySelector('.hoppsan-card')) {
      const li = document.createElement('li');
      li.className = 'card compact hoppsan-card';
      li.dataset.name = 'Hoppsan';
      li.innerHTML = `
        <div class="card-title"><span>Hoppsan, här tog det slut.</span></div>
        <div class="inv-controls"><button class="char-btn" data-clear-filters="1">Börja om?</button></div>`;
      listEl.appendChild(li);
    }
    return hopLi;
  };

  const findNextCategoryRef = (catOrder, index, prevCats, currentCats, hopLi) => {
    for (let i = index + 1; i < catOrder.length; i++) {
      const name = catOrder[i];
      if (currentCats.has(name)) return currentCats.get(name);
      if (prevCats.has(name)) return prevCats.get(name);
    }
    return hopLi || null;
  };

  const createEntryListItem = (p, context) => {
    const { charList, invList, compact, terms, searchActive } = context;
    const key = entryKeyFor(p);
    if (!key) return null;
    if (p.kolumner && p.rader) {
      const infoHtml = tabellInfoHtml(p);
      const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoHtml)}" data-tabell="1" aria-label="Visa info">ℹ️</button>`;
      const tagsHtml = (p.taggar?.typ || [])
        .map(t => `<span class="tag">${t}</span>`)
        .join(' ');
      const tagsDiv = tagsHtml ? `<div class="tags entry-tags-block">${tagsHtml}</div>` : '';
      const tagsMobile = tagsHtml ? `<div class="entry-tags entry-tags-mobile">${tagsHtml}</div>` : '';
      const li = document.createElement('li');
      li.className = 'card';
      li.dataset.name = p.namn;
      if (p.id) li.dataset.id = p.id;
      li.dataset.entryKey = key;
      li.innerHTML = `
        <div class="card-title"><span>${p.namn}</span></div>
        ${tagsDiv}
        <div class="inv-controls">${tagsMobile}${infoBtn}</div>`;
      if (searchActive && terms.length) {
        const titleSpan = li.querySelector('.card-title > span');
        if (titleSpan) highlightInElement(titleSpan, terms);
      }
      return { key, element: li };
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
    let cardDesc = desc;
    const infoMeta = [];
    let priceText = '';
    let weightVal = null;
    let capacityVal = null;
    const isVehicle = (p.taggar?.typ || []).includes('Färdmedel');
    let priceLabel = '';
    if (isInv(p)) {
      const statsHtml = itemStatHtml(p);
      desc += statsHtml;
      cardDesc += statsHtml;
      const baseQuals = [
        ...(p.taggar?.kvalitet ?? []),
        ...splitQuals(p.kvalitet)
      ];
      if (baseQuals.length) {
        const qhtml = baseQuals
          .map(q => `<span class="tag">${q}</span>`)
          .join(' ');
        const qualBlock = `<br>Kvalitet:<div class="tags">${qhtml}</div>`;
        desc += qualBlock;
        cardDesc += qualBlock;
      }
      if (p.grundpris) {
        priceText = formatMoney(invUtil.calcEntryCost(p));
        priceLabel = 'Pris:';
      }
      const baseW = p.vikt ?? p.stat?.vikt ?? 0;
      const massCnt = baseQuals.filter(q => q === 'Massivt').length;
      if (baseW || massCnt) {
        const w = baseW + massCnt;
        weightVal = formatWeight(w);
      }
      if (isVehicle) {
        const cap = p.stat?.bärkapacitet ?? null;
        if (cap != null) {
          capacityVal = cap;
        }
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
    if (priceText) {
      infoMeta.push({ label: priceLabel.replace(/:$/, ''), value: priceText });
    }
    if (capacityVal != null) {
      infoMeta.push({ label: 'Bärkapacitet', value: capacityVal });
    }
    if (weightVal != null) {
      infoMeta.push({ label: 'Vikt', value: weightVal });
    }
    const infoBodyExtras = [];
    if (isRas(p) || isYrke(p) || isElityrke(p)) {
      const extra = yrkeInfoHtml(p);
      if (extra) infoBodyExtras.push(extra);
    }
    if (p.namn === 'Blodsband') {
      const races = charList.filter(c => c.namn === 'Blodsband').map(c => c.race).filter(Boolean);
      if (races.length) {
        const str = races.join(', ');
        const block = `<p><strong>Raser:</strong> ${str}</p>`;
        cardDesc += block;
        infoBodyExtras.push(`<div class="info-block info-block-extra">${block}</div>`);
      }
    }
    let spec = null;
    if (p.namn === 'Monsterlärd') {
      spec = charList.find(c => c.namn === 'Monsterlärd')?.trait || null;
      if (spec) {
        const block = `<p><strong>Specialisering:</strong> ${spec}</p>`;
        cardDesc += block;
        infoBodyExtras.push(`<div class="info-block info-block-extra">${block}</div>`);
      }
    }
    let infoBodyHtml = desc;
    if (infoBodyExtras.length) infoBodyHtml += infoBodyExtras.join('');
    const charEntry = charList.find(c => c.namn === p.namn);
    const xpSource = charEntry ? charEntry : { ...p, nivå: curLvl };
    const xpVal = (isInv(p) || isEmployment(p) || isService(p)) ? null : storeHelper.calcEntryXP(xpSource, charList);
    let xpText = xpVal != null ? (xpVal < 0 ? `+${-xpVal}` : xpVal) : '';
    if (isElityrke(p)) xpText = `Minst ${eliteReq.minXP ? eliteReq.minXP(p, charList) : 50}`;
    const xpTag = (xpVal != null || isElityrke(p)) ? `<span class="tag xp-cost">Erf: ${xpText}</span>` : '';
    const renderFilterTag = (tag, extra = '') => `<span class="tag filter-tag" data-section="${tag.section}" data-val="${tag.value}"${extra}>${tag.label}</span>`;
    const filterTagData = [];
    (p.taggar?.typ || [])
      .filter(Boolean)
      .forEach((t, idx) => filterTagData.push({ section: 'typ', value: t, label: QUAL_TYPE_MAP[t] || t, hidden: idx === 0 }));
    const trTags = explodeTags(p.taggar?.ark_trad);
    const arkList = trTags.length ? trTags : (Array.isArray(p.taggar?.ark_trad) ? ['Traditionslös'] : []);
    arkList.forEach(t => filterTagData.push({ section: 'ark', value: t, label: t }));
    (p.taggar?.test || [])
      .filter(Boolean)
      .forEach(t => filterTagData.push({ section: 'test', value: t, label: t }));
    const visibleTagData = filterTagData.filter(tag => !tag.hidden);
    const filterTagHtml = visibleTagData.map(tag => renderFilterTag(tag));
    const infoFilterTagHtml = filterTagData.map(tag => renderFilterTag(tag));
    const tagsHtml = filterTagHtml.join(' ');
    const infoTagsHtml = [xpTag].concat(infoFilterTagHtml).filter(Boolean).join(' ');
    const dockPrimary = (p.taggar?.typ || [])[0] || '';
    const shouldDockTags = DOCK_TAG_TYPES.has(dockPrimary);
    const renderDockedTags = (tags, extraClass = '') => {
      if (!tags.length) return '';
      const cls = ['entry-tags', extraClass].filter(Boolean).join(' ');
      return `<div class="${cls}">${tags.map(tag => renderFilterTag(tag)).join('')}</div>`;
    };
    const dockedTagsHtml = shouldDockTags ? renderDockedTags(visibleTagData) : '';
    const mobileTagsHtml = (!compact && !shouldDockTags && visibleTagData.length)
      ? renderDockedTags(visibleTagData, 'entry-tags-mobile')
      : '';
    const xpHtml = (xpVal != null || isElityrke(p)) ? `<span class="xp-cost">Erf: ${xpText}</span>` : '';
    const lvlBadgeVal = (availLvls.length > 0) ? curLvl : '';
    const lvlShort =
      lvlBadgeVal === 'Mästare' ? 'M'
      : (lvlBadgeVal === 'Gesäll' ? 'G'
      : (lvlBadgeVal === 'Novis' ? 'N' : ''));
    const priceBadgeLabel = (priceLabel || 'Pris').replace(':','');
    const priceBadgeText = priceLabel === 'Dagslön:' ? 'Dagslön' : 'P';
    const badgeParts = [];
    if (isQual(p)) {
      (p.taggar?.typ || [])
        .filter(t => QUAL_TYPE_KEYS.includes(t))
        .map(t => QUAL_TYPE_MAP[t])
        .forEach(lbl => badgeParts.push(`<span class="meta-badge">${lbl}</span>`));
    }
    if (priceText) badgeParts.push(`<span class="meta-badge price-badge" title="${priceBadgeLabel}">${priceBadgeText}: ${priceText}</span>`);
    if (capacityVal != null) badgeParts.push(`<span class="meta-badge capacity-badge" title="Bärkapacitet">BK: ${capacityVal}</span>`);
    if (weightVal != null) badgeParts.push(`<span class="meta-badge weight-badge" title="Vikt">V: ${weightVal}</span>`);
    if (isInv(p) && lvlShort) badgeParts.push(`<span class="meta-badge level-badge" title="${lvlBadgeVal}">${lvlShort}</span>`);
    const metaBadges = badgeParts.length ? `<div class="meta-badges">${badgeParts.join('')}</div>` : '';
    const infoPanelHtml = buildInfoPanelHtml({
      tagsHtml: infoTagsHtml,
      bodyHtml: infoBodyHtml,
      meta: infoMeta
    });
    const infoBtn = `<button class="char-btn" data-info="${encodeURIComponent(infoPanelHtml)}" aria-label="Visa info">ℹ️</button>`;
    const multi = isInv(p) || (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t)));
    let count;
    if (isInv(p)) {
      if (p.id === 'di79') {
        const qtys = FALT_BUNDLE.map(id => invList.find(c => c.id === id)?.qty || 0);
        count = Math.min(...qtys);
      } else {
        count = invList.filter(c => c.id === p.id).reduce((sum,c)=>sum+(c.qty||1),0);
      }
    } else {
      count = charList.filter(c => c.id === p.id && !c.trait).length;
    }
    const limit = isInv(p) ? Infinity : storeHelper.monsterStackLimit(charList, p.namn);
    const badge = multi && count>0 ? ` <span class="count-badge">×${count}</span>` : '';
    const showInfo = compact || hideDetails;
    const canEdit = (p.taggar?.typ || []).includes('Hemmagjort');
    const idAttr = p.id ? ` data-id="${p.id}"` : '';
    const editBtn = canEdit
      ? `<button data-act="editCustom" class="char-btn" data-name="${p.namn}"${idAttr}>✏️</button>`
      : '';
    const eliteBtn = isElityrke(p)
      ? `<button class="char-btn" data-elite-req="${p.namn}">🏋🏻‍♂️</button>`
      : '';
    const allowAdd = !(isService(p) || isEmployment(p));
    const buttonGroupParts = [];
    if (showInfo) buttonGroupParts.push(infoBtn);
    if (editBtn) buttonGroupParts.push(editBtn);
    if (allowAdd) {
      if (multi) {
        if (count > 0) {
          buttonGroupParts.push(`<button data-act="del" class="char-btn danger icon" data-name="${p.namn}">🗑</button>`);
          buttonGroupParts.push(`<button data-act="sub" class="char-btn" data-name="${p.namn}" aria-label="Minska">➖</button>`);
          if (count < limit) buttonGroupParts.push(`<button data-act="add" class="char-btn" data-name="${p.namn}" aria-label="Lägg till">➕</button>`);
        } else {
          buttonGroupParts.push(`<button data-act="add" class="char-btn add-btn" data-name="${p.namn}" aria-label="Lägg till">➕</button>`);
        }
      } else {
        const mainBtn = inChar
          ? `<button data-act="rem" class="char-btn danger icon" data-name="${p.namn}">🗑</button>`
          : `<button data-act="add" class="char-btn add-btn" data-name="${p.namn}" aria-label="Lägg till">➕</button>`;
        buttonGroupParts.push(mainBtn);
      }
    }
    if (eliteBtn) buttonGroupParts.push(eliteBtn);
    const leftSections = [];
    if (metaBadges) leftSections.push(metaBadges);
    if (shouldDockTags && dockedTagsHtml) leftSections.push(dockedTagsHtml);
    else if (mobileTagsHtml) leftSections.push(mobileTagsHtml);
    const dataset = { name: p.namn };
    if (spec) dataset.trait = spec;
    if (xpVal != null) dataset.xp = xpVal;
    if (p.id) dataset.id = p.id;
    dataset.entryKey = key;
    const li = createEntryCard({
      compact,
      dataset,
      nameHtml: `${p.namn}${badge}`,
      xpHtml,
      tagsHtml: (!compact && !shouldDockTags && tagsHtml) ? tagsHtml : '',
      levelHtml: hideDetails ? '' : lvlSel,
      descHtml: (!compact && !hideDetails) ? `<div class="card-desc">${cardDesc}</div>` : '',
      leftSections,
      buttonSections: buttonGroupParts
    });
    li.dataset.entryKey = key;
    if (searchActive && terms.length) {
      const titleSpan = li.querySelector('.card-title > span');
      if (titleSpan) highlightInElement(titleSpan, terms);
      const descEl = li.querySelector('.card-desc');
      if (descEl) highlightInElement(descEl, terms);
    }
    return { key, element: li };
  };

  const updateCategoryEntries = (catLi, entries, context) => {
    if (!catLi) return;
    const listEl = catLi.querySelector('ul');
    if (!listEl) return;
    const existing = new Map();
    [...listEl.children].forEach(node => {
      const key = node.dataset.entryKey;
      if (key) existing.set(key, node);
    });
    const desiredKeys = new Set();
    const orderedNodes = [];
    entries.forEach(entry => {
      const item = createEntryListItem(entry, context);
      if (!item) return;
      desiredKeys.add(item.key);
      let node = existing.get(item.key);
      if (node) {
        patchCardElement(node, item.element);
      } else {
        node = item.element;
      }
      node.dataset.entryKey = item.key;
      orderedNodes.push(node);
    });
    existing.forEach((node, key) => {
      if (!desiredKeys.has(key)) {
        node.remove();
      }
    });
    orderedNodes.forEach(node => {
      if (node.parentNode === listEl) {
        listEl.appendChild(node);
      } else {
        listEl.appendChild(node);
      }
    });
  };

  const computeTargetCats = (options, entryCatMap) => {
    if (!options) return null;
    const target = new Set(options.onlyCats || []);
    if (options.onlyKeys) {
      options.onlyKeys.forEach(key => {
        const cat = entryCatMap.get(key) || renderState.entryToCat.get(key);
        if (cat) target.add(cat);
      });
    }
    return target.size ? target : null;
  };

  const renderList = (arr, options = {}) => {
    const listArr = Array.isArray(arr) ? arr : [];
    const charList = storeHelper.getCurrentList(store);
    const invList  = storeHelper.getInventory(store);
    const compact = storeHelper.getCompactEntries(store);
    const terms = F.search
      .map(t => searchNormalize(t.toLowerCase()));
    const searchActive = terms.length > 0;
    const cats = {};
    const catNameMatch = {};
    const entryCatMap = new Map();
    listArr.forEach(p => {
      const cat = p.taggar?.typ?.[0] || 'Övrigt';
      (cats[cat] ||= []).push(p);
      const key = entryKeyFor(p);
      if (key) entryCatMap.set(key, cat);
      if (searchActive) {
        const name = searchNormalize((p.namn || '').toLowerCase());
        const unionMode = storeHelper.getFilterUnion(store);
        const nameOk = unionMode ? terms.some(q => name.includes(q))
                                 : terms.every(q => name.includes(q));
        if (nameOk) {
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

    const prevCats = new Map();
    const prevOpenCats = new Set();
    dom.lista.querySelectorAll('.cat-group > details').forEach(details => {
      const cat = details.dataset.cat;
      if (!cat) return;
      const li = details.closest('li');
      if (li) prevCats.set(cat, li);
      if (details.open) prevOpenCats.add(cat);
    });
    let hopLi = prevCats.get('Hoppsan') || null;
    if (hopLi) prevCats.delete('Hoppsan');

    const targetCats = computeTargetCats(options, entryCatMap);
    const context = { charList, invList, compact, terms, searchActive };
    const currentCats = new Map();

    catKeys.forEach((cat, idx) => {
      const prevNode = prevCats.get(cat) || null;
      const desiredOpen = openCatsOnce.has(cat)
        ? true
        : (catState[cat] !== undefined ? catState[cat] : prevOpenCats.has(cat));
      const shouldUpdate = (!targetCats || targetCats.has(cat) || !prevNode);
      const openValue = (shouldUpdate || openCatsOnce.has(cat)) ? desiredOpen : null;
      const catLi = ensureCategoryElement(cat, prevNode, openValue);
      if (prevNode) prevCats.delete(cat);
      currentCats.set(cat, catLi);
      if (shouldUpdate) {
        updateCategoryEntries(catLi, cats[cat], context);
      }
      const ref = findNextCategoryRef(catKeys, idx, prevCats, currentCats, hopLi);
      dom.lista.insertBefore(catLi, ref);
    });

    prevCats.forEach(li => {
      li.remove();
    });

    const hopOpen = catState['Hoppsan'] !== undefined
      ? catState['Hoppsan']
      : prevOpenCats.has('Hoppsan');
    hopLi = ensureHoppsanCategory(hopLi, hopOpen);
    dom.lista.appendChild(hopLi);

    renderState = {
      entryToCat: entryCatMap,
      catOrder: catKeys.slice()
    };

    if (openCatsOnce.size) {
      openCatsOnce.forEach(cat => {
        const selector = `.cat-group > details[data-cat="${CSS.escape(cat)}"]`;
        const details = dom.lista.querySelector(selector);
        if (details) details.open = true;
      });
    }

    updateCatToggle();
    openCatsOnce.clear();
    saveState();
  };

  const refreshEntries = (entryRefs) => {
    const arr = filtered();
    if (!entryRefs || !entryRefs.length) {
      renderList(arr);
      return;
    }
    const arrById = new Map();
    const arrByName = new Map();
    arr.forEach(entry => {
      const id = entry.id != null ? String(entry.id) : '';
      if (id) arrById.set(id, entry);
      if (entry.namn) arrByName.set(entry.namn, entry);
    });
    const keys = new Set();
    entryRefs.forEach(ref => {
      const entry = resolveEntryRef(ref, arrById, arrByName);
      if (!entry) return;
      const key = entryKeyFor(entry);
      if (key) keys.add(key);
    });
    if (!keys.size) {
      renderList(arr);
      return;
    }
    renderList(arr, { onlyKeys: keys });
  };


  const updateCatToggle = () => {
    const allDetails = [...document.querySelectorAll('.cat-group > details')];
    const hop = allDetails.find(d => d.dataset.cat === 'Hoppsan');
    const others = allDetails.filter(d => d !== hop);
    catsMinimized = others.length ? others.every(d => !d.open) : true;
    dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
    dom.catToggle.title = catsMinimized
      ? 'Öppna alla kategorier'
      : 'Minimera alla kategorier';
  };

  /* första render */
  renderList(filtered()); activeTags(); updateXP();

  /* expose update function for party toggles */
  window.indexViewUpdate = () => { renderList(filtered()); activeTags(); };
  window.indexViewRefreshFilters = () => { fillDropdowns(); updateSearchDatalist(); };

  /* -------- events -------- */
  dom.sIn.addEventListener('input', () => {
    sTemp = dom.sIn.value.trim();
    updateSearchDatalist();
  });
  {
    const sugEl = document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('searchSuggest');
    if (sugEl) {
      sugEl.addEventListener('mousedown', e => {
        const it = e.target.closest('.item');
        if (!it) return;
        e.preventDefault();
        // UI-kommando via förslag
        if (it.dataset.ui && window.executeUICommand) {
          window.__searchBlurGuard = true;
          dom.sIn.blur();
          window.executeUICommand(it.dataset.ui);
          dom.sIn.value=''; sTemp=''; updateSearchDatalist();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (it.dataset.cmd === 'random') {
          const cat = it.dataset.cat || '';
          const cnt = Math.max(1, parseInt(it.dataset.count || '1', 10) || 1);
          const pool = getEntries().filter(p => (p.taggar?.typ || []).includes(cat));
          if (!pool.length) {
            if (window.alertPopup) alertPopup(`Hittade inga poster i kategorin: ${cat}`);
          } else {
            const n = Math.min(cnt, pool.length);
            const picks = [];
            const idxs = pool.map((_,i)=>i);
            for (let i = 0; i < n; i++) {
              const k = Math.floor(Math.random() * idxs.length);
              const [idx] = idxs.splice(k, 1);
              picks.push(pool[idx]);
            }
            fixedRandomEntries = picks;
            fixedRandomInfo = { cat, count: picks.length };
            const c = cat || picks[0]?.taggar?.typ?.[0];
            if (c) openCatsOnce.add(c);
          }
          dom.sIn.value=''; sTemp=''; updateSearchDatalist();
          activeTags(); renderList(filtered());
          dom.sIn.blur();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        } else {
          const val = (it.dataset.val || '').trim();
          if (val) {
            const union = storeHelper.getFilterUnion(store);
            if (union) {
              if (!F.search.includes(val)) F.search.push(val);
            } else {
              F.search = [val];
            }
          } else {
            F.search = [];
          }
          // If exact name match, open that category once
          if (val) {
            const nval = searchNormalize(val.toLowerCase());
            const match = getEntries().find(p => searchNormalize(String(p.namn || '').toLowerCase()) === nval);
            const cat = match?.taggar?.typ?.[0];
            if (cat) openCatsOnce.add(cat);
          }
          if (val && window.storeHelper?.addRecentSearch) {
            storeHelper.addRecentSearch(store, val);
          }
          dom.sIn.value = '';
          sTemp = '';
          updateSearchDatalist();
          activeTags();
          renderList(filtered());
          dom.sIn.blur();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
      window.__searchBlurGuard = true;
      dom.sIn.blur();
      const termTry = (sTemp || '').trim();
      const term = sTemp.toLowerCase();
        // Ignorera sökförslag på Enter; hantera bara skriven text
        // Command: [N] random: <kategori> — pick N random entries in category
        {
          const m = sTemp.match(/^\s*(\d+)?\s*(random|slump)\s*:\s*(.+)$/i);
        if (m) {
          const cnt = Math.max(1, parseInt((m[1] || '1'), 10) || 1);
          const catInput = (m[3] || '').trim();
          if (catInput) {
            const ncat = searchNormalize(catInput.toLowerCase());
            // Build normalized -> canonical category map from current entries
            const catMap = new Map();
            for (const p of getEntries()) {
              for (const t of (p.taggar?.typ || [])) {
                const nt = searchNormalize(String(t).toLowerCase());
                if (!catMap.has(nt)) catMap.set(nt, t);
              }
            }
            const canonical = catMap.get(ncat);
            if (!canonical) {
              if (window.alertPopup) alertPopup(`Okänd kategori: ${catInput}`);
              dom.sIn.value = ''; sTemp = '';
              updateSearchDatalist();
              return;
            }
            const pool = getEntries().filter(p => (p.taggar?.typ || []).includes(canonical));
            if (!pool.length) {
              if (window.alertPopup) alertPopup(`Hittade inga poster i kategorin: ${catInput}`);
              dom.sIn.value = ''; sTemp = '';
              updateSearchDatalist();
              return;
            }
            const n = Math.min(cnt, pool.length);
            const picks = [];
            const idxs = pool.map((_,i)=>i);
            for (let i = 0; i < n; i++) {
              const k = Math.floor(Math.random() * idxs.length);
              const [idx] = idxs.splice(k, 1);
              picks.push(pool[idx]);
            }
            fixedRandomEntries = picks;
            fixedRandomInfo = { cat: canonical, count: picks.length };
            const cat = canonical || picks[0]?.taggar?.typ?.[0];
            if (cat) openCatsOnce.add(cat);
            dom.sIn.value=''; sTemp='';
            updateSearchDatalist();
            activeTags(); renderList(filtered());
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        }
      }
      // Ignorera aktivt förslag på Enter – välj endast via klick
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
        F.search=[]; F.typ=[];F.ark=[];F.test=[]; sTemp=''; fixedRandomEntries = null; fixedRandomInfo = null;
        dom.sIn.value=''; dom.typSel.value=dom.arkSel.value=dom.tstSel.value='';
        storeHelper.setOnlySelected(store, false);
        storeHelper.clearRevealedArtifacts(store);
        revealedArtifacts = new Set(storeHelper.getRevealedArtifacts(store));
        fillDropdowns();
        activeTags(); renderList(filtered());
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (term === 'molly<3') {
        showArtifacts = true;
        dom.sIn.value=''; sTemp='';
        fillDropdowns();
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
      if (sTemp) {
        const union = storeHelper.getFilterUnion(store);
        if (union) {
          if (!F.search.includes(sTemp)) F.search.push(sTemp);
        } else {
          F.search = [sTemp];
        }
        // If exact name match, open that category once
        const nval = searchNormalize(sTemp.toLowerCase());
        const match = getEntries().find(p => searchNormalize(String(p.namn || '').toLowerCase()) === nval);
        const cat = match?.taggar?.typ?.[0];
        if (cat) openCatsOnce.add(cat);
        if (window.storeHelper?.addRecentSearch) storeHelper.addRecentSearch(store, sTemp);
      } else {
        F.search = [];
      }
      dom.sIn.value=''; sTemp='';
      activeTags(); renderList(filtered());
      updateSearchDatalist();
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
      if (sel === 'typSel' && v === ONLY_SELECTED_VALUE) {
        storeHelper.setOnlySelected(store, true);
        dom[sel].value = '';
        activeTags(); renderList(filtered());
        return;
      }
      if(v && !F[key].includes(v)) F[key].push(v);
      // If selecting a type filter, open that category once
      if (sel === 'typSel' && v) {
        openCatsOnce.add(v);
      }
      dom[sel].value=''; activeTags(); renderList(filtered());
    });
  });
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const section=t.dataset.type, val=t.dataset.val;
    if (section==='random') { fixedRandomEntries = null; fixedRandomInfo = null; activeTags(); renderList(filtered()); return; }
    if(section==='search'){ F.search = F.search.filter(x=>x!==val); }
    else if(section==='onlySel'){ storeHelper.setOnlySelected(store,false); }
    else F[section] = (F[section] || []).filter(x=>x!==val);
    if(section==='test'){ storeHelper.setOnlySelected(store,false); dom.tstSel.value=''; }
    activeTags(); renderList(filtered());
  });

  // Treat clicks on tags anywhere as filter selections
  document.addEventListener('click', e => {
    const tag = e.target.closest('.filter-tag');
    if (!tag) return;
    const sectionMap = { ark_trad: 'ark', ark: 'ark', typ: 'typ', test: 'test' };
    const section = sectionMap[tag.dataset.section];
    if (!section) return;
    const val = tag.dataset.val;
    if (!F[section].includes(val)) F[section].push(val);
    if (section === 'typ') openCatsOnce.add(val);
    activeTags(); renderList(filtered());
  });

  /* lista-knappar */
  dom.lista.addEventListener('click', async e=>{
    if (e.target.closest('.filter-tag')) return;
    // Special clear-filters action inside the Hoppsan category
    const clearBtn = e.target.closest('button[data-clear-filters]');
    if (clearBtn) {
      // Reset all filters and state
      storeHelper.setOnlySelected(store, false);
      storeHelper.clearRevealedArtifacts(store);
      try { localStorage.removeItem(STATE_KEY); sessionStorage.setItem('hoppsanReset', '1'); } catch {}
      // Scroll to top immediately, then refresh the page to restore default state
      window.scrollTo(0, 0);
      location.reload();
      return;
    }
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      let html=decodeURIComponent(infoBtn.dataset.info||'');
      const liEl = infoBtn.closest('li');
      const title=liEl?.querySelector('.card-title > span')?.textContent||'';
      if(infoBtn.dataset.tabell!=null){
        const terms = F.search.map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
        if (terms.length) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          highlightInElement(tmp, terms);
          html = tmp.innerHTML;
        }
        tabellPopup.open(html, title);
        return;
      }
      {
        const terms = F.search.map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
        if (terms.length) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          highlightInElement(tmp, terms);
          html = tmp.innerHTML;
        }
      }
      yrkePanel.open(title, html);
      return;
    }
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (!store.current && !(await requireCharacter())) return;
    const act = btn.dataset.act;
    const li = btn.closest('li');
    if (!li) return;
    const name = btn.dataset.name || li.dataset.name;
    const tr = li.dataset.trait || null;
    const idAttr = btn.dataset.id || li.dataset.id || null;
    const ref = { id: idAttr || undefined, name };
    const entries = getEntries();
    let p = idAttr ? entries.find(x => String(x.id) === String(idAttr)) : null;
    if (!p && name) p = entries.find(x => x.namn === name);
    if (!p) p = lookupEntry(ref);
    if (!p) return;
    const applyRefresh = (refs) => {
      if (refs === true) {
        renderList(filtered());
        return;
      }
      const arrRefs = Array.isArray(refs) ? refs : [refs];
      if (!arrRefs.length) return;
      refreshEntries(arrRefs);
    };
    if (act === 'editCustom') {
      if (!window.invUtil || typeof window.invUtil.editCustomEntry !== 'function') return;
      window.invUtil.editCustomEntry(p, () => {
        if (window.indexViewRefreshFilters) window.indexViewRefreshFilters();
        if (window.indexViewUpdate) window.indexViewUpdate();
        if (window.invUtil && typeof window.invUtil.renderInventory === 'function') {
          window.invUtil.renderInventory();
        }
        if (window.updateXP) updateXP();
      });
      return;
    }
    const lvlSel = li.querySelector('select.level');
    let   lvl = lvlSel ? lvlSel.value : null;
    if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || null;


    /* Lägg till kvalitet direkt */
      if (isQual(p)) {
        const inv = storeHelper.getInventory(store);
        if (!inv.length) { await alertPopup('Ingen utrustning i inventariet.'); return; }
        const qTypes = p.taggar?.typ || [];
        const TYPE_MAP = {
          'Vapenkvalitet': 'Vapen',
          'Rustningskvalitet': 'Rustning',
          'Sköldkvalitet': 'Sköld',
          'Allmän kvalitet': ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt','Lägre Artefakt']
        };
        const allowed = new Set();
        qTypes.forEach(t => {
          const mapped = TYPE_MAP[t];
          if (Array.isArray(mapped)) mapped.forEach(x => allowed.add(x));
          else if (mapped) allowed.add(mapped);
        });
        if (!allowed.size) ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt','Lägre Artefakt'].forEach(x => allowed.add(x));
        const elig = inv.filter(it => {
          const entry = invUtil.getEntry(it.id || it.name);
          if (window.canApplyQuality) return canApplyQuality(entry, p);
          const types = entry?.taggar?.typ || [];
          return types.some(t => allowed.has(t));
        });
        if (!elig.length) { await alertPopup('Ingen lämplig utrustning att förbättra.'); return; }
        invUtil.openQualPopup(elig, iIdx => {
          const row   = elig[iIdx];
          const entry = invUtil.getEntry(row.id || row.name);
          if (window.canApplyQuality && !canApplyQuality(entry, p)) return;
          row.kvaliteter = row.kvaliteter || [];
          const qn = p.namn;
          if (!row.kvaliteter.includes(qn)) row.kvaliteter.push(qn);
          invUtil.saveInventory(inv); invUtil.renderInventory();
          activeTags();
          applyRefresh(p);
        });
        return;
      }

    if (act==='add') {
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        const list = storeHelper.getCurrentList(store);
        if (p.id === 'di79') {
          FALT_BUNDLE.forEach(id => {
            const ent = invUtil.getEntry(id);
            if (!ent.namn) return;
            const indivItem = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
              .some(t=>ent.taggar.typ.includes(t)) && !STACKABLE_IDS.includes(ent.id);
            const existing = inv.find(r => r.id === ent.id);
            if (indivItem || !existing) {
              inv.push({ id: ent.id, name: ent.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] });
            } else {
              existing.qty++;
            }
          });
          invUtil.saveInventory(inv); invUtil.renderInventory();
          const bundleEntries = FALT_BUNDLE
            .map(id => lookupEntry({ id }) || invUtil.getEntry(id))
            .filter(Boolean);
          bundleEntries.push(p);
          applyRefresh(bundleEntries);
          FALT_BUNDLE.forEach(id => {
            const ent = invUtil.getEntry(id);
            const i = inv.findIndex(r => r.id === id);
            const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(ent.namn)}"][data-idx="${i}"]`);
            if (li) {
              li.classList.add('inv-flash');
              setTimeout(() => li.classList.remove('inv-flash'), 1000);
            }
          });
        } else {
          const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
            .some(t=>p.taggar.typ.includes(t)) && !STACKABLE_IDS.includes(p.id);
          const rowBase = { id:p.id, name:p.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
          const tagTyp = p.taggar?.typ || [];
          if (tagTyp.includes('L\u00e4gre Artefakt')) {
            const reqYrken = explodeTags(p.taggar?.ark_trad);
            if (reqYrken.length) {
              const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
              const skillArt = storeHelper.abilityLevel(list, 'Artefaktmakande');
              const artLevel = Math.max(partyArt, skillArt);
              const lvlName = Object.keys(p.niv\u00e5er || {}).find(l=>l) || '';
              const itemLevel = LEVEL_IDX[lvlName] || 0;
              let hasYrke = reqYrken.some(req =>
                list.some(it =>
                (isYrke(it) || isElityrke(it)) && explodeTags([it.namn]).includes(req)
                )
              );
              if (!hasYrke && artLevel >= itemLevel) {
                hasYrke = true;
              }
              if (!hasYrke) {
                const reqTxt = reqYrken.join(', ');
                const msg = `Du har inte r\u00e4tt yrke (kr\u00e4ver: ${reqTxt}); om du \u00e4nd\u00e5 vill ha ${p.namn} blir det 10x dyrare och traditionens f\u00f6ljare kan komma att ta illa vid sig. L\u00e4gg till \u00e4nd\u00e5?`;
                const ok = await openDialog(msg, { cancel: true, cancelText: 'Nej!', okText: 'Ja!' });
                if (!ok) return;
                rowBase.priceMult = 10;
              }
            }
          }
          if (tagTyp.includes('Artefakt')) {
            const val = await selectArtifactPayment();
            if (val === null) return;
            if (val) rowBase.artifactEffect = val;
          } else if (p.artifactEffect) {
            rowBase.artifactEffect = p.artifactEffect;
          }
          const addRow = trait => {
            if (trait) rowBase.trait = trait;
            let flashIdx;
            if (indiv) {
              inv.push(rowBase);
              flashIdx = inv.length - 1;
            } else {
              const match = inv.find(x => x.id===p.id && (!trait || x.trait===trait));
              if (match) {
                match.qty++;
                flashIdx = inv.indexOf(match);
              } else {
                inv.push(rowBase);
                flashIdx = inv.length - 1;
              }
            }
            invUtil.saveInventory(inv); invUtil.renderInventory();
            const hidden = isHidden(p);
            const artifactTagged = hasArtifactTag(p);
            let addedToList = false;
            if (hidden || artifactTagged) {
              const list = storeHelper.getCurrentList(store);
              if (artifactTagged && !list.some(x => x.id === p.id && x.noInv)) {
                list.push({ ...p, noInv: true });
                storeHelper.setCurrentList(store, list);
                addedToList = true;
              }
              if (addedToList || hidden) {
                if (window.updateXP) updateXP();
                if (window.renderTraits) renderTraits();
              }
              if (hidden && p.id) {
                storeHelper.addRevealedArtifact(store, p.id);
              }
            }
            applyRefresh(p);
            const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(p.namn)}"][data-idx="${flashIdx}"]`);
            if (li) {
              li.classList.add('inv-flash');
              setTimeout(() => li.classList.remove('inv-flash'), 1000);
            }
          };
          if (p.traits && window.maskSkill) {
            const used = inv.filter(it => it.id===p.id).map(it=>it.trait).filter(Boolean);
            maskSkill.pickTrait(used, async trait => {
              if(!trait) return;
              if (used.includes(trait) && !(await confirmPopup('Samma karakt\u00e4rsdrag finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(trait);
            });
          } else if (p.bound === 'kraft' && window.powerPicker) {
            const used = inv.filter(it => it.id===p.id).map(it=>it.trait).filter(Boolean);
            powerPicker.pickKraft(used, async val => {
              if(!val) return;
              if (used.includes(val) && !STACKABLE_IDS.includes(p.id) && !(await confirmPopup('Samma formel finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(val);
            });
          } else if (p.bound === 'ritual' && window.powerPicker) {
            const used = inv.filter(it => it.id===p.id).map(it=>it.trait).filter(Boolean);
            powerPicker.pickRitual(used, async val => {
              if(!val) return;
              if (used.includes(val) && !STACKABLE_IDS.includes(p.id) && !(await confirmPopup('Samma ritual finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(val);
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
          if (!(await confirmPopup('Du kan bara välja en ras. Lägga till ändå?'))) return;
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
        // Tidigare blockerades Mörkt förflutet om Jordnära fanns – inte längre.
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
            applyRefresh(p);
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
            applyRefresh(p);
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
            applyRefresh(p);
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
          applyRefresh(p);
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
        let updatedEntries = [p];
        if (p.id === 'di79') {
          const removeCnt = (act === 'del' || act === 'rem')
            ? Math.min(...FALT_BUNDLE.map(id => inv.find(r => r.id === id)?.qty || 0))
            : 1;
          if (removeCnt > 0) {
            FALT_BUNDLE.forEach(id => {
              const idxRow = inv.findIndex(r => r.id === id);
              if (idxRow >= 0) {
                inv[idxRow].qty -= removeCnt;
                if (inv[idxRow].qty < 1) inv.splice(idxRow,1);
              }
            });
          }
          updatedEntries = FALT_BUNDLE
            .map(id => lookupEntry({ id }) || invUtil.getEntry(id))
            .filter(Boolean);
          updatedEntries.push(p);
        } else {
          const idxInv = inv.findIndex(x => x.id===p.id);
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
        const hidden = isHidden(p);
        const artifactTagged = hasArtifactTag(p);
        if (hidden || artifactTagged) {
          const still = inv.some(r => r.id === p.id);
          if (!still) {
            let list = storeHelper.getCurrentList(store).filter(x => !(x.id === p.id && x.noInv));
            storeHelper.setCurrentList(store, list);
            if (window.updateXP) updateXP();
            if (window.renderTraits) renderTraits();
            if (hidden) storeHelper.removeRevealedArtifact(store, p.id);
          }
        }
        applyRefresh(updatedEntries);
      } else {
        const tr = btn.closest('li').dataset.trait || null;
        const before = storeHelper.getCurrentList(store);
        if(p.namn==='Mörkt förflutet' && before.some(x=>x.namn==='Mörkt blod')){
          if(!(await confirmPopup('Mörkt förflutet hänger ihop med Mörkt blod. Ta bort ändå?')))
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
        const affectedRefs = [p, ...remDeps];
        storeHelper.setCurrentList(store,list); updateXP();
        applyRefresh(affectedRefs);
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
            // Soft refresh after deletion: pick next sensible current and re-render
            try {
              const active = storeHelper.getActiveFolder(store);
              const remaining = (store.characters || [])
                .filter(c => !active || active === 'ALL' || (c.folderId || '') === active)
                .slice()
                .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
              store.current = remaining[0]?.id || '';
              storeHelper.save(store);
            } catch {}
            if (window.applyCharacterChange) { applyCharacterChange(); }
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
        const hidden = isHidden(p);
        const artifactTagged = hasArtifactTag(p);
        if (hidden || artifactTagged) {
          const inv = storeHelper.getInventory(store);
          const removeItem = arr => {
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i].id === p.id) arr.splice(i, 1);
              else if (Array.isArray(arr[i].contains)) removeItem(arr[i].contains);
            }
          };
          removeItem(inv);
          invUtil.saveInventory(inv); invUtil.renderInventory();
          if (hidden) storeHelper.removeRevealedArtifact(store, p.id);
        }
      }
    }
    activeTags();
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
      const applyLevelRefresh = (refs) => {
        const arrRefs = Array.isArray(refs) ? refs : [refs];
        refreshEntries(arrRefs);
      };
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
              applyLevelRefresh(name);
              renderTraits();
            });
            return;
          }
        }else if(ent.trait){
          delete ent.trait;
          storeHelper.setCurrentList(store,list); updateXP();
          applyLevelRefresh(name);
          renderTraits();
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
        const affected = new Set([name]);
        toAdd.forEach(n=>{
          const hamName=storeHelper.HAMNSKIFTE_NAMES[n];
          if(!list.some(x=>x.namn===hamName) && !rem.includes(n)){
            const entry=lookupEntry({ id: n, name: n });
            if(entry) list.push({ ...entry, namn:hamName, form:'beast' });
          }
          rem=rem.filter(x=>x!==n);
          if (hamName) affected.add(hamName);
        });
        storeHelper.setHamnskifteRemoved(store, rem);
        toRemove.forEach(n => {
          const hamName = storeHelper.HAMNSKIFTE_NAMES[n];
          if (hamName) affected.add(hamName);
        });
        storeHelper.setCurrentList(store,list); updateXP();
        applyLevelRefresh([...affected]);
        renderTraits();
        flashAdded(name, tr);
        return;
      }
      storeHelper.setCurrentList(store,list); updateXP();
      applyLevelRefresh(name);
      renderTraits();
      flashAdded(name, tr);
      return;
    }

    /* uppdatera pris om förmågan inte lagts till */
    const p = getEntries().find(x=>x.namn===name);
    if(!p) return;
    const lvl = e.target.value;
    const xpVal = (isInv(p) || isEmployment(p) || isService(p))
      ? null
      : storeHelper.calcEntryXP({ ...p, nivå:lvl }, list);
    const xpText = xpVal != null ? (xpVal < 0 ? `+${-xpVal}` : xpVal) : '';
    const liEl = e.target.closest('li');
    if (xpVal != null) liEl.dataset.xp = xpVal; else delete liEl.dataset.xp;
    const xpSpan = liEl.querySelector('.card-title .xp-cost');
    if (xpSpan) xpSpan.textContent = `Erf: ${xpText}`;
    const infoBtn = liEl.querySelector('button[data-info]');
    if (infoBtn?.dataset.info) {
      const infoHtml = decodeURIComponent(infoBtn.dataset.info);
      const newInfo = infoHtml.replace(/(<span class="tag xp-cost">Erf: )[^<]*/, `$1${xpText}`);
      infoBtn.dataset.info = encodeURIComponent(newInfo);
    }
  });
}

  window.initIndex = initIndex;
})(window);
