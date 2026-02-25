(function(window){
  let renderHooked = false;
  let catListenerBound = false;
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

  function updateSearchDatalist() {
    window.globalSearch?.refreshSuggestions?.();
  }

  function applySearchValue(val) {
    const term = String(val || '').trim();
    if (typeof window.navigateToIndexWithFilter === 'function') {
      window.navigateToIndexWithFilter(term);
    }
    const input = getSearchInput();
    if (input) input.value = '';
    sTemp = '';
    window.globalSearch?.hideSuggestions?.();
  }

  function bindSearchHandlers() {
    const input = getSearchInput();
    if (!input || input.dataset.invSearchBound === '1') return;
    input.dataset.invSearchBound = '1';
    input.addEventListener('input', () => {
      sTemp = input.value.trim();
    });
    input.addEventListener('search', () => {
      sTemp = input.value.trim();
      window.globalSearch?.refreshSuggestions?.();
    });
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
