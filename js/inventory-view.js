(function(window){
  let renderHooked = false;
  let catListenerBound = false;
  let sugIdx = -1;
  let sTemp = '';

  const getToolbarRoot = () => document.querySelector('shared-toolbar')?.shadowRoot || null;
  const getSearchInput = () => dom?.sIn || getToolbarRoot()?.getElementById('searchField') || null;
  const getSuggestEl = () => dom?.searchSug || getToolbarRoot()?.getElementById('searchSuggest') || null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);

  function syncCatToggle() {
    if (!dom?.catToggle) return;
    const catDetails = dom?.invList ? [...dom.invList.querySelectorAll('.cat-group > details')] : [];
    if (catDetails.length) {
      const catsMinimized = catDetails.every(det => !det.open);
      dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
      dom.catToggle.title = catsMinimized
        ? 'Öppna alla kategorier'
        : 'Minimera alla kategorier';
      return;
    }
    const cards = [];
    if (dom?.invFormal) cards.push(...dom.invFormal.querySelectorAll('li.card'));
    if (dom?.invList)   cards.push(...dom.invList.querySelectorAll('li.card'));
    const allCollapsed = cards.length > 0 && cards.every(card => card.classList.contains('compact'));
    dom.catToggle.textContent = allCollapsed ? '▶' : '▼';
    dom.catToggle.title = allCollapsed
      ? 'Öppna alla inventariekort'
      : 'Minimera alla inventariekort';
  }

  function manualToggleAll() {
    const catDetails = dom?.invList ? [...dom.invList.querySelectorAll('.cat-group > details')] : [];
    if (catDetails.length) {
      const shouldOpenCats = catDetails.every(det => !det.open);
      catDetails.forEach(det => { det.open = shouldOpenCats; });
      syncCatToggle();
      return;
    }
    const cards = [];
    if (dom?.invFormal) cards.push(...dom.invFormal.querySelectorAll('li.card'));
    if (dom?.invList)   cards.push(...dom.invList.querySelectorAll('li.card'));
    if (!cards.length) return;
    const shouldOpen = cards.every(card => card.classList.contains('compact'));
    cards.forEach(card => {
      card.classList.toggle('compact', !shouldOpen);
      window.entryCardFactory?.syncCollapse?.(card);
    });
    syncCatToggle();
  }

  function onCatToggle() {
    manualToggleAll();
  }

  function flattenRows(list, out = []) {
    if (!Array.isArray(list)) return out;
    list.forEach(row => {
      if (!row) return;
      out.push(row);
      if (Array.isArray(row.contains)) flattenRows(row.contains, out);
    });
    return out;
  }

  function inventorySearchItems() {
    if (typeof store === 'undefined') return [];
    if (!window.storeHelper || typeof storeHelper.getInventory !== 'function') return [];
    const inv = storeHelper.getInventory(store) || [];
    const rows = flattenRows(inv, []);
    const getEntry = typeof window.invUtil?.getEntry === 'function' ? window.invUtil.getEntry : null;
    return rows.map(row => {
      const entry = getEntry ? getEntry(row.id || row.name) : null;
      const base = String(entry?.namn || row?.name || '').trim();
      const trait = String(row?.trait || '').trim();
      const display = trait ? `${base}: ${trait}` : base;
      const searchTxt = trait ? `${base} ${trait}` : base;
      return { base, display: display || searchTxt, searchTxt, entry };
    }).filter(item => item.base || item.searchTxt);
  }

  function updateSearchDatalist() {
    const input = getSearchInput();
    const sugEl = getSuggestEl();
    if (!input || !sugEl) return;
    if (typeof searchNormalize !== 'function') return;
    const q = (input.value || '').trim();
    if (q.length < 2) {
      sugEl.innerHTML = '';
      sugEl.hidden = true;
      sugIdx = -1;
      window.updateScrollLock?.();
      return;
    }
    const nq = searchNormalize(q.toLowerCase());
    const esc = v => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    const items = [];
    const seen = new Set();
    for (const item of inventorySearchItems()) {
      const searchBody = searchNormalize(String(item.searchTxt || '').toLowerCase());
      const baseBody = searchNormalize(String(item.base || '').toLowerCase());
      if (!searchBody.includes(nq) && !baseBody.includes(nq)) continue;
      const key = (item.base || item.display || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const disp = item.display || item.base || item.searchTxt;
      const value = item.base || item.searchTxt;
      if (!value) continue;
      items.push({ disp, value });
      if (items.length >= 50) break;
    }
    let uiHtml = '';
    try {
      if (window.getUICommandSuggestions) {
        const cmds = window.getUICommandSuggestions(q) || [];
        if (cmds.length) {
          const escTxt = v => v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\"/g,'&quot;');
          uiHtml = cmds.map((c,i)=>{
            const iconPart = (() => {
              if (c.icon && window.iconHtml) {
                const html = window.iconHtml(c.icon, { className: 'suggest-icon-img' });
                if (html) return `<span class="suggest-icon">${html}</span>`;
              }
              const emoji = (c.emoji || '').trim();
              return emoji ? `<span class="suggest-emoji">${escTxt(emoji)}</span>` : '';
            })();
            const label = `<span class="suggest-label">${escTxt(c.label || '')}</span>`;
            return `<div class="item" data-ui="${escTxt(c.id)}" data-idx="ui-${i}">${iconPart}${label}</div>`;
          }).join('');
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
    const listHtml = items.map((itm,i)=>{
      const disp = itm.disp ? itm.disp.charAt(0).toUpperCase() + itm.disp.slice(1) : itm.value;
      return `<div class="item" data-idx="${i}" data-val="${esc(itm.value)}">${esc(disp)}</div>`;
    }).join('');
    sugEl.innerHTML = `${uiHtml}${listHtml}`;
    sugEl.hidden = false;
    sugIdx = -1;
    window.updateScrollLock?.();
  }

  function applySearchValue(val) {
    if (!window.invUtil || !invUtil.filter) return;
    invUtil.filter.invTxt = val;
    if (val && window.storeHelper?.addRecentSearch) {
      try { storeHelper.addRecentSearch(store, val); } catch {}
    }
    const input = getSearchInput();
    if (input) input.value = '';
    sTemp = '';
    updateSearchDatalist();
    if (typeof invUtil.renderInventory === 'function') invUtil.renderInventory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSuggestionClick(e) {
    const it = e.target.closest('.item');
    if (!it) return;
    e.preventDefault();
    const input = getSearchInput();
    if (it.dataset.ui && window.executeUICommand) {
      window.__searchBlurGuard = true;
      if (input) input.blur();
      window.executeUICommand(it.dataset.ui);
      if (input) input.value = '';
      sTemp = '';
      updateSearchDatalist();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const val = (it.dataset.val || '').trim();
    window.__searchBlurGuard = true;
    if (input) input.blur();
    applySearchValue(val);
  }

  function bindSearchHandlers() {
    const input = getSearchInput();
    if (!input || input.dataset.invSearchBound === '1') return;
    input.dataset.invSearchBound = '1';
    input.addEventListener('input', () => {
      sTemp = input.value.trim();
      updateSearchDatalist();
    });
    input.addEventListener('search', () => {
      sTemp = input.value.trim();
      updateSearchDatalist();
    });
    input.addEventListener('keydown', e => {
      const sugEl = getSuggestEl();
      const items = sugEl && !sugEl.hidden ? [...sugEl.querySelectorAll('.item')] : [];
      if (e.key === 'ArrowDown' && items.length) {
        e.preventDefault();
        sugIdx = Math.min(items.length - 1, sugIdx + 1);
        items.forEach((el,i)=>el.classList.toggle('active', i===sugIdx));
        return;
      }
      if (e.key === 'ArrowUp' && items.length) {
        e.preventDefault();
        sugIdx = Math.max(-1, sugIdx - 1);
        items.forEach((el,i)=>el.classList.toggle('active', i===sugIdx));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        window.__searchBlurGuard = true;
        input.blur();
        const termTry = (sTemp || '').trim();
        const term = termTry.toLowerCase();
        if (termTry && window.tryUICommand && window.tryUICommand(termTry)) {
          if (input) input.value = '';
          sTemp = '';
          updateSearchDatalist();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
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
          if (input) input.value = '';
          sTemp = '';
          updateSearchDatalist();
          return;
        }
        if (term === 'lol') {
          if (window.invUtil && invUtil.filter) {
            invUtil.filter.invTxt = '';
            invUtil.filter.typ = [];
            invUtil.filter.ark = [];
            invUtil.filter.test = [];
          }
          if (dom?.typSel) dom.typSel.value = '';
          if (dom?.arkSel) dom.arkSel.value = '';
          if (dom?.tstSel) dom.tstSel.value = '';
          if (typeof invUtil?.renderInventory === 'function') invUtil.renderInventory();
          if (input) input.value = '';
          sTemp = '';
          updateSearchDatalist();
          return;
        }
        if (typeof window.tryBomb === 'function' && window.tryBomb(sTemp)) {
          if (input) input.value = '';
          sTemp = '';
          updateSearchDatalist();
          return;
        }
        if (typeof window.tryNilasPopup === 'function' && window.tryNilasPopup(sTemp)) {
          if (input) input.value = '';
          sTemp = '';
          updateSearchDatalist();
          return;
        }
        if (termTry) {
          applySearchValue(termTry);
        } else {
          applySearchValue('');
        }
      }
    });
    const sugEl = getSuggestEl();
    if (sugEl && !sugEl.dataset.invSuggestBound) {
      sugEl.dataset.invSuggestBound = '1';
      sugEl.addEventListener('mousedown', handleSuggestionClick);
    }
  }

  function refreshInventoryFilters() {
    const getEntry = typeof window.invUtil?.getEntry === 'function'
      ? window.invUtil.getEntry
      : (typeof window.lookupEntry === 'function'
        ? (row => {
          if (!row) return null;
          const id = row.id;
          const rawName = row.name ?? row.namn;
          const name = typeof rawName === 'string' ? rawName.trim() : '';
          try {
            return window.lookupEntry(id !== undefined ? { id, namn: name || undefined } : (name || row), { explicitName: name || undefined });
          } catch {
            return null;
          }
        })
        : null);
    const explode = typeof window.explodeTags === 'function' ? window.explodeTags : null;
    const baseInventory = typeof storeHelper?.getInventory === 'function'
      ? storeHelper.getInventory(store)
      : [];
    const inventory = Array.isArray(baseInventory) ? baseInventory : [];
    const sets = {
      typ : new Set(),
      ark : new Set(),
      test: new Set()
    };
    if (typeof getEntry === 'function') {
      inventory.forEach(row => {
        if (!row) return;
        const entry = getEntry(row);
        if (!entry) return;
        const tags = entry.taggar || {};
        const typTags = Array.isArray(tags.typ) ? tags.typ : [];
        typTags.filter(Boolean).forEach(val => sets.typ.add(val));
        const arkSource = tags.ark_trad;
        let arkTags = [];
        if (explode) {
          try { arkTags = explode(arkSource); }
          catch { arkTags = []; }
        }
        if (arkTags.length) {
          arkTags.filter(Boolean).forEach(val => sets.ark.add(val));
        } else if (Array.isArray(arkSource)) {
          const hasValue = arkSource.some(v => String(v || '').trim());
          if (hasValue) sets.ark.add('Traditionslös');
        }
        const testTags = Array.isArray(tags.test) ? tags.test : [];
        testTags.filter(Boolean).forEach(val => sets.test.add(val));
      });
    }

    const fill = (sel, values, label) => {
      if (!sel) return;
      const opts = [`<option value="">${label} (alla)</option>`];
      const sorted = Array.from(values)
        .map(val => String(val || ''))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'sv'));
      sorted.forEach(val => opts.push(`<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`));
      sel.innerHTML = opts.join('');
    };

    fill(dom?.typSel, sets.typ, 'Typ');
    fill(dom?.arkSel, sets.ark, 'Arketyp');
    fill(dom?.tstSel, sets.test, 'Test');
  }

  function hookRender() {
    if (renderHooked || !window.invUtil || typeof invUtil.renderInventory !== 'function') return;
    const original = invUtil.renderInventory.bind(invUtil);
    invUtil.renderInventory = function hookedRender(...args) {
      original(...args);
      refreshInventoryFilters();
      syncCatToggle();
      bindSearchHandlers();
      const input = getSearchInput();
      sTemp = input ? input.value.trim() : '';
      updateSearchDatalist();
    };
    renderHooked = true;
  }

  function updateCharName() {
    if (!dom?.cName) return;
    const current = store.characters?.find(c => c.id === store.current);
    dom.cName.textContent = current?.name || '';
  }

  function initInventory() {
    hookRender();
    refreshInventoryFilters();
    updateCharName();
    syncCatToggle();

    if (dom?.catToggle && !catListenerBound) {
      dom.catToggle.addEventListener('click', onCatToggle);
      catListenerBound = true;
    }

    bindSearchHandlers();
    updateSearchDatalist();

    window.indexViewRefreshFilters = refreshInventoryFilters;
    window.indexViewUpdate = () => {
      if (window.invUtil && typeof invUtil.renderInventory === 'function') {
        invUtil.renderInventory();
      } else {
        updateSearchDatalist();
      }
    };

    window.inventoryViewUpdate = function inventoryViewUpdate() {
      updateCharName();
      if (window.invUtil && typeof invUtil.renderInventory === 'function') {
        invUtil.renderInventory();
      } else {
        refreshInventoryFilters();
        syncCatToggle();
        updateSearchDatalist();
      }
    };

    window.inventorySyncCats = syncCatToggle;
  }

  window.initInventory = initInventory;
})(window);
