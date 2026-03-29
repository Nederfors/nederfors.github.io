(function(window){
  if (window.inventoryPopupRegistry) return;

  const REGISTRY = [
    {
      id: 'inventoryItemsPopup',
      title: 'Hantera föremål',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'items',
      popupType: 'form',
      kind: 'manager',
      closeId: 'inventoryItemsClose',
      optionsId: 'inventoryItemsOptions'
    },
    {
      id: 'inventoryEconomyPopup',
      title: 'Hantera ekonomi',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'economy',
      popupType: 'form',
      kind: 'manager',
      closeId: 'inventoryEconomyClose',
      optionsId: 'inventoryEconomyOptions'
    },
    {
      id: 'customPopup',
      title: 'Nytt föremål',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'items',
      popupType: 'form',
      kind: 'view',
      tabId: 'custom-item'
    },
    {
      id: 'qtyPopup',
      title: 'Mängdköp',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'items',
      popupType: 'form',
      kind: 'view',
      tabId: 'bulk-qty'
    },
    {
      id: 'vehiclePopup',
      title: 'Lasta i färdmedel',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'items',
      popupType: 'form',
      kind: 'view',
      tabId: 'vehicle-load'
    },
    {
      id: 'vehicleRemovePopup',
      title: 'Lasta ur färdmedel',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'items',
      popupType: 'form',
      kind: 'view',
      tabId: 'vehicle-unload'
    },
    {
      id: 'moneyPopup',
      title: 'Saldo',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'economy',
      popupType: 'form',
      kind: 'view',
      tabId: 'money'
    },
    {
      id: 'pricePopup',
      title: 'Multiplicera pris',
      shellFamily: 'tools-popup-lg',
      size: 'lg',
      tabGroup: 'economy',
      popupType: 'form',
      kind: 'view',
      tabId: 'bulk-price'
    },
    {
      id: 'liveBuyPopup',
      title: 'Köp i live-läge',
      shellFamily: 'modal',
      size: 'md',
      tabGroup: null,
      popupType: 'picker',
      kind: 'dialog'
    },
    {
      id: 'buyMultiplePopup',
      title: 'Köp flera',
      shellFamily: 'modal',
      size: 'sm',
      tabGroup: null,
      popupType: 'picker',
      kind: 'dialog'
    },
    {
      id: 'rowPricePopup',
      title: 'Snabb prisjustering',
      shellFamily: 'modal',
      size: 'md',
      tabGroup: null,
      popupType: 'picker',
      kind: 'dialog'
    },
    {
      id: 'vehicleQtyPopup',
      title: 'Välj antal',
      shellFamily: 'modal',
      size: 'sm',
      tabGroup: null,
      popupType: 'picker',
      kind: 'dialog'
    },
    {
      id: 'vehicleMoneyPopup',
      title: 'Ta ut pengar',
      shellFamily: 'modal',
      size: 'sm',
      tabGroup: null,
      popupType: 'picker',
      kind: 'dialog'
    },
    {
      id: 'saveFreePopup',
      title: 'Spara och gratismarkera',
      shellFamily: 'modal',
      size: 'sm',
      tabGroup: null,
      popupType: 'dialog',
      kind: 'dialog'
    },
    {
      id: 'advMoneyPopup',
      title: 'Fördelspengar',
      shellFamily: 'modal',
      size: 'sm',
      tabGroup: null,
      popupType: 'dialog',
      kind: 'dialog'
    },
    {
      id: 'deleteContainerPopup',
      title: 'Ta bort föremål med innehåll',
      shellFamily: 'modal',
      size: 'md',
      tabGroup: null,
      popupType: 'dialog',
      kind: 'dialog'
    }
  ];

  const byId = new Map(REGISTRY.map(entry => [entry.id, { ...entry, openHandler: null }]));

  function cloneEntry(entry) {
    return entry ? { ...entry } : null;
  }

  function get(id) {
    return cloneEntry(byId.get(String(id || '').trim()));
  }

  function list() {
    return Array.from(byId.values()).map(cloneEntry);
  }

  function listByTabGroup(group) {
    const wanted = String(group || '').trim();
    return list().filter(entry => entry.kind === 'view' && entry.tabGroup === wanted);
  }

  function listManagers() {
    return list().filter(entry => entry.kind === 'manager');
  }

  function getManagerByTabGroup(group) {
    const wanted = String(group || '').trim();
    return list().find(entry => entry.kind === 'manager' && entry.tabGroup === wanted) || null;
  }

  function findByTabId(tabId) {
    const wanted = String(tabId || '').trim();
    return list().find(entry => entry.kind === 'view' && entry.tabId === wanted) || null;
  }

  function setOpenHandler(id, handler) {
    const key = String(id || '').trim();
    const existing = byId.get(key);
    if (!existing) return null;
    existing.openHandler = typeof handler === 'function' ? handler : null;
    return cloneEntry(existing);
  }

  function setOpenHandlers(handlers = {}) {
    Object.entries(handlers).forEach(([id, handler]) => setOpenHandler(id, handler));
  }

  function open(id, ...args) {
    const entry = byId.get(String(id || '').trim());
    if (!entry || typeof entry.openHandler !== 'function') return null;
    return entry.openHandler(...args);
  }

  function getPopupMetaById() {
    const metaById = {};
    byId.forEach((entry, id) => {
      const isSmallDialog = entry.kind === 'dialog' && entry.size === 'sm';
      metaById[id] = Object.freeze({
        type: entry.popupType || (entry.kind === 'dialog' ? 'dialog' : 'form'),
        size: entry.size || '',
        layoutFamily: entry.shellFamily || 'modal',
        mobileMode: isSmallDialog ? 'sheet' : 'center',
        touchProfile: isSmallDialog ? 'sheet-down' : 'none'
      });
    });
    return Object.freeze(metaById);
  }

  window.inventoryPopupRegistry = {
    get,
    list,
    listByTabGroup,
    listManagers,
    getManagerByTabGroup,
    findByTabId,
    setOpenHandler,
    setOpenHandlers,
    open,
    getPopupMetaById
  };
})(window);
