/* ===========================================================
   inventory-utils.js – helper functions for inventory handling
   =========================================================== */

(function(window){
  const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';
  const F = { invTxt: '', typ: [], ark: [], test: [] };
  // Bring shared currency bases into local scope
  const SBASE = window.SBASE;
  const OBASE = window.OBASE;
  const moneyToO = window.moneyToO;
  const oToMoney = window.oToMoney;
  const INV_TOOLS_KEY = 'invToolsOpen';
  const INV_INFO_KEY  = 'invInfoOpen';
  const INV_CAT_STATE_PREFIX = 'invCatState:';
  let cachedCatState = { key: '', state: {} };
  const INDIVIDUAL_TYPES = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel'];
  const LEGACY_STACKABLE_ID_SET = new Set(['l1', 'l11', 'l27', 'l6', 'l12', 'l13', 'l28', 'l30']);
  const LEGACY_BUNDLE_BY_ENTRY_ID = Object.freeze({
    di79: [
      { id: 'di10', qty: 1 },
      { id: 'di11', qty: 1 },
      { id: 'di12', qty: 1 },
      { id: 'di13', qty: 1 },
      { id: 'di14', qty: 1 },
      { id: 'di15', qty: 1 }
    ]
  });
  // Local helper to safely access the toolbar shadow root without relying on main.js scope
  const getToolbarRoot = () => {
    const el = document.querySelector('shared-toolbar');
    return el && el.shadowRoot ? el.shadowRoot : null;
  };
  // Local $T that queries inside the toolbar shadow root (falls back to null if unavailable)
  const $T = (id) => {
    const root = getToolbarRoot();
    return root ? root.getElementById(id) : null;
  };
  const getEl = (id) => document.getElementById(id) || $T(id);
  const INVENTORY_HUB_DEFS = {
    items: {
      popupId: 'inventoryItemsPopup',
      closeId: 'inventoryItemsClose',
      defaultTab: 'custom-item',
      tabs: ['custom-item', 'bulk-qty', 'vehicle-load', 'vehicle-unload'],
      sectionTabIds: {
        customPopup: 'custom-item',
        qtyPopup: 'bulk-qty',
        vehiclePopup: 'vehicle-load',
        vehicleRemovePopup: 'vehicle-unload'
      },
      stackIds: {
        'custom-item': 'inventoryItemsCustomItemStack',
        'bulk-qty': 'inventoryItemsBulkQtyStack',
        'vehicle-load': 'inventoryItemsVehicleLoadStack',
        'vehicle-unload': 'inventoryItemsVehicleUnloadStack'
      },
      emptyIds: ['inventoryItemsVehicleLoadEmpty', 'inventoryItemsVehicleUnloadEmpty']
    },
    economy: {
      popupId: 'inventoryEconomyPopup',
      closeId: 'inventoryEconomyClose',
      saveFreeBtnId: 'inventoryEconomySaveFreeBtn',
      massActionsId: 'inventoryEconomyMassActions',
      defaultTab: 'money',
      tabs: ['money', 'bulk-price'],
      sectionTabIds: {
        moneyPopup: 'money',
        pricePopup: 'bulk-price'
      },
      stackIds: {
        money: 'inventoryEconomyMoneyStack',
        'bulk-price': 'inventoryEconomyPriceStack'
      }
    }
  };
  const INVENTORY_HUB_FOCUS_TARGETS = {
    'custom-item': 'customPopup',
    'bulk-qty': 'qtyPopup',
    money: 'moneyPopup',
    'quick-spend': 'moneyPopup',
    'bulk-price': 'pricePopup',
    'mass-actions': 'inventoryEconomyMassActions',
    'vehicle-load': 'vehiclePopup',
    'vehicle-unload': 'vehicleRemovePopup'
  };
  const INVENTORY_HUB_FOCUS_TABS = {
    'custom-item': 'custom-item',
    'bulk-qty': 'bulk-qty',
    money: 'money',
    'quick-spend': 'money',
    'bulk-price': 'bulk-price',
    'mass-actions': 'money',
    'vehicle-load': 'vehicle-load',
    'vehicle-unload': 'vehicle-unload'
  };
  const INVENTORY_HUB_SECTION_IDS = Array.from(new Set(
    Object.values(INVENTORY_HUB_DEFS).flatMap(def => Object.keys(def.sectionTabIds))
  ));
  const LEVEL_IDX = { '':0, Novis:1, 'Ges\u00e4ll':2, 'M\u00e4stare':3 };
  const LOWER_ARTIFACT_PRICE_MULT = 10;
  const VEHICLE_EMOJI = {
    'Vagn': '🚚',
    'Släde': '🛷',
    'Roddbåt': '🚣',
    'Ridhäst, lätt': '🐎',
    'Ridhäst, tung': '🐴',
    'Mulåsna': '🫏',
    'Kärra': '🛒',
    'Kanot': '🛶',
    'Galär': '⛵',
    'Flodbåt': '🛥️'
  };
  const cloneRow = (row) => (row ? JSON.parse(JSON.stringify(row)) : null);
  const sanitizeArmorQualities = (entry, qualities) => {
    const fn = window.enforceArmorQualityExclusion;
    if (typeof fn === 'function') return fn(entry, qualities);
    return Array.isArray(qualities) ? qualities.filter(Boolean) : [];
  };
  const normalizeShieldQualityName = (entry, qualityName) => {
    const isShield = Array.isArray(entry?.taggar?.typ) && entry.taggar.typ.includes('Sköld');
    if (!isShield) return qualityName;
    const txt = String(qualityName || '').toLowerCase();
    if (txt.startsWith('smidig')) return 'Armfäst';
    return qualityName;
  };
  const splitArkTags = (value) => {
    if (typeof window.splitTags === 'function') return window.splitTags(value);
    const source = Array.isArray(value)
      ? value
      : ((value === undefined || value === null) ? [] : [value]);
    return source
      .flatMap(v => String(v ?? '').split(',').map(t => t.trim()))
      .filter(Boolean);
  };
  const getEntryPrimaryLevelName = (entry) => {
    if (!entry || typeof entry !== 'object') return '';
    const ownLevel = typeof entry.niv\u00e5 === 'string' ? entry.niv\u00e5.trim() : '';
    if (ownLevel) return ownLevel;
    const levelKeys = Object.keys(entry.niv\u00e5er || {});
    return levelKeys.find(key => String(key || '').trim()) || '';
  };
  const normalizeMultiplierValue = (value, fallback = 1) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return numeric;
  };
  const formatMultiplierLabel = (value) => {
    const mult = normalizeMultiplierValue(value, 1);
    if (Math.abs(mult - Math.round(mult)) < 0.001) return String(Math.round(mult));
    return mult.toFixed(2).replace(/\.?0+$/, '');
  };
  const checkLowerArtifactKraver = (entry, list) => {
    const entries = Array.isArray(list) ? list : [];
    const levelName = getEntryPrimaryLevelName(entry);
    const candidate = levelName
      ? { ...entry, niv\u00e5: levelName }
      : { ...entry };
    const helper = window.rulesHelper;
    const requirementEffects = (helper && typeof helper.getRequirementEffectsForCandidate === 'function')
      ? helper.getRequirementEffectsForCandidate(candidate, entries, { level: levelName || candidate.niv\u00e5 || '' })
      : null;
    const explicitRequirementReasons = Array.isArray(requirementEffects?.missingReasons)
      ? requirementEffects.missingReasons
      : ((helper && typeof helper.getMissingRequirementReasonsForCandidate === 'function')
        ? helper.getMissingRequirementReasonsForCandidate(candidate, entries, { level: levelName || candidate.niv\u00e5 || '' })
        : []);
    const explicitMessages = (helper && typeof helper.formatEntryStopMessages === 'function')
      ? helper.formatEntryStopMessages(entry?.namn || '', { requirementReasons: explicitRequirementReasons })
      : [];
    let moneyMultiplier = normalizeMultiplierValue(requirementEffects?.moneyMultiplier, 1);
    const erfMultiplier = normalizeMultiplierValue(requirementEffects?.erfMultiplier, 1);
    if (explicitRequirementReasons.length && Math.abs(moneyMultiplier - 1) < 0.001) {
      moneyMultiplier = LOWER_ARTIFACT_PRICE_MULT;
    }

    return {
      ok: explicitRequirementReasons.length === 0,
      explicitMessages,
      moneyMultiplier,
      erfMultiplier
    };
  };
  const mapRowQualityArray = (entry, list) => {
    if (!Array.isArray(list)) return list;
    const out = [];
    const seen = new Set();
    list.forEach(q => {
      const mapped = normalizeShieldQualityName(entry, q);
      if (!mapped) return;
      const key = String(mapped);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(mapped);
    });
    return out;
  };
  const getRowQualityState = (entry, row) => {
    const removed = Array.isArray(row?.removedKval) ? row.removedKval : [];
    const baseQuals = [
      ...(entry?.taggar?.kvalitet ?? []),
      ...splitQuals(entry?.kvalitet)
    ];
    const baseQ = baseQuals.filter(q => !removed.includes(q));
    const addedQ = Array.isArray(row?.kvaliteter) ? row.kvaliteter.filter(Boolean) : [];
    return { baseQ, addedQ };
  };
  const isQualityAllowedByRules = (entry, row, qualityName) => {
    if (!entry || !qualityName) return true;
    const { baseQ, addedQ } = getRowQualityState(entry, row);
    if ([...baseQ, ...addedQ].includes(qualityName)) return true;
    const next = sanitizeArmorQualities(entry, [...baseQ, ...addedQ, qualityName]);
    return next.includes(qualityName);
  };
  const normalizeRowQualities = (row) => {
    if (!row || typeof row !== 'object') return;
    const entry = getEntry(row.id || row.name);
    if (entry) {
      if (Array.isArray(row.kvaliteter)) row.kvaliteter = mapRowQualityArray(entry, row.kvaliteter);
      if (Array.isArray(row.gratisKval)) row.gratisKval = mapRowQualityArray(entry, row.gratisKval);
      if (Array.isArray(row.removedKval)) row.removedKval = mapRowQualityArray(entry, row.removedKval);
      if (Array.isArray(row.manualQualityOverride)) row.manualQualityOverride = mapRowQualityArray(entry, row.manualQualityOverride);
      const { baseQ, addedQ } = getRowQualityState(entry, row);
      const allowedAll = sanitizeArmorQualities(entry, [...baseQ, ...addedQ]);
      const allowance = new Map();
      allowedAll.forEach(q => allowance.set(q, (allowance.get(q) || 0) + 1));
      baseQ.forEach(q => {
        const count = allowance.get(q) || 0;
        if (count > 0) allowance.set(q, count - 1);
      });
      const manualOverrides = Array.isArray(row.manualQualityOverride)
        ? row.manualQualityOverride.filter(Boolean)
        : [];
      const manualSet = new Set(manualOverrides);
      if (Array.isArray(row.kvaliteter)) {
        row.kvaliteter = addedQ.filter(q => {
          if (manualSet.has(q)) return true;
          const count = allowance.get(q) || 0;
          if (count <= 0) return false;
          allowance.set(q, count - 1);
          return true;
        });
      }
      if (manualOverrides.length) {
        const current = new Set(Array.isArray(row.kvaliteter) ? row.kvaliteter : []);
        row.manualQualityOverride = manualOverrides.filter(q => current.has(q));
        if (!row.manualQualityOverride.length) delete row.manualQualityOverride;
      } else if (row.manualQualityOverride) {
        delete row.manualQualityOverride;
      }
      if (Array.isArray(row.gratisKval)) {
        const allowedSet = new Set(allowedAll);
        row.gratisKval = row.gratisKval.filter(q => allowedSet.has(q));
      }
    }
    if (Array.isArray(row.contains)) {
      row.contains.forEach(child => normalizeRowQualities(child));
    }
  };
  const normalizeInventoryQualities = (inv) => {
    if (!Array.isArray(inv)) return;
    inv.forEach(row => normalizeRowQualities(row));
  };

  function getInventoryHubKeyForTab(tabId) {
    return Object.entries(INVENTORY_HUB_DEFS).find(([, def]) => def.tabs.includes(tabId))?.[0] || '';
  }

  function setInventoryHubTab(hubKey, tabId) {
    const root = getToolbarRoot();
    if (!root) return;
    const def = INVENTORY_HUB_DEFS[hubKey];
    if (!def) return;
    const hub = root.getElementById(def.popupId);
    if (!hub) return;
    const wanted = def.tabs.includes(tabId) ? tabId : def.defaultTab;
    hub.dataset.activeTab = wanted;
    hub.querySelectorAll('.inventory-hub-tab').forEach(btn => {
      const active = btn.dataset.tab === wanted;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
    hub.querySelectorAll('.inventory-hub-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.tabPanel === wanted);
    });
  }

  function clearInventoryHubHighlight(root) {
    if (!root) return;
    root.querySelectorAll('.inventory-hub-popup [data-hub-active="true"]').forEach(el => {
      el.removeAttribute('data-hub-active');
      el.classList.remove('is-active');
      if (el.__hubHighlightTimer) {
        clearTimeout(el.__hubHighlightTimer);
        delete el.__hubHighlightTimer;
      }
    });
  }

  function highlightInventoryHubSection(focusSection) {
    const root = getToolbarRoot();
    if (!root) return;
    clearInventoryHubHighlight(root);
    const targetId = INVENTORY_HUB_FOCUS_TARGETS[focusSection];
    if (!targetId) return;
    const target = root.getElementById(targetId);
    if (!target) return;
    target.dataset.hubActive = 'true';
    target.classList.add('is-active');
    target.__hubHighlightTimer = setTimeout(() => {
      target.removeAttribute('data-hub-active');
      target.classList.remove('is-active');
      delete target.__hubHighlightTimer;
    }, 1800);
    requestAnimationFrame(() => {
      const field = target.querySelector('input, select, textarea, button');
      if (field && typeof field.focus === 'function') {
        try { field.focus({ preventScroll: true }); } catch { field.focus(); }
      }
    });
  }

  function cleanupInventoryHubSections(exceptId) {
    const root = getToolbarRoot();
    if (!root) return;
    INVENTORY_HUB_SECTION_IDS.forEach(sectionId => {
      if (sectionId === exceptId) return;
      const section = root.getElementById(sectionId);
      if (!section || typeof section.__hubCleanup !== 'function') return;
      const cleanup = section.__hubCleanup;
      section.__hubCleanup = null;
      try { cleanup({ switching: true }); } catch {}
    });
  }

  function ensureInventoryHubMounted(hubKey) {
    const root = getToolbarRoot();
    if (!root) return null;
    const def = INVENTORY_HUB_DEFS[hubKey];
    if (!def) return null;
    const hub = root.getElementById(def.popupId);
    if (!hub) return null;

    Object.entries(def.sectionTabIds).forEach(([sectionId, tabId]) => {
      const stackId = def.stackIds[tabId];
      const stack = root.getElementById(stackId);
      if (!stack) return;
      const section = root.getElementById(sectionId);
      if (!section || section.parentElement === stack) return;
      section.classList.add('inventory-hub-section');
      section.setAttribute('data-hub-tab', tabId);
      if (hubKey === 'economy' && tabId === 'money') {
        const massActions = def.massActionsId ? root.getElementById(def.massActionsId) : null;
        if (massActions && massActions.parentElement === stack) {
          stack.insertBefore(section, massActions);
          return;
        }
      }
      stack.appendChild(section);
    });

    if (hub.dataset.bound === '1') return hub;

    const closeBtn = root.getElementById(def.closeId);
    const saveFreeBtn = def.saveFreeBtnId ? root.getElementById(def.saveFreeBtnId) : null;
    closeBtn?.addEventListener('click', () => closeInventoryHub(hubKey));
    saveFreeBtn?.addEventListener('click', () => openSaveFreePopup());
    hub.addEventListener('click', event => {
      const inner = hub.querySelector('.popup-inner.inventory-hub-ui');
      if (!hub.classList.contains('open') || !inner) return;
      if (!inner.contains(event.target)) {
        closeInventoryHub(hubKey);
      }
    });
    hub.querySelectorAll('.inventory-hub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        openInventoryHubTab(btn.dataset.tab || 'custom-item');
      });
    });

    hub.dataset.bound = '1';
    return hub;
  }

  function syncInventoryHubState() {
    const root = getToolbarRoot();
    if (!root) return;
    const inv = Array.isArray(storeHelper.getInventory(store)) ? storeHelper.getInventory(store) : [];
    const hasVehicle = inv.some(row => {
      const entry = getEntry(row?.id || row?.name);
      return (entry?.taggar?.typ || []).includes('Färdmedel');
    });
    (INVENTORY_HUB_DEFS.items.emptyIds || []).forEach(id => {
      const emptyState = root.getElementById(id);
      if (emptyState) emptyState.hidden = hasVehicle;
    });
    const vehicleLoadSection = root.getElementById('vehiclePopup');
    const vehicleUnloadSection = root.getElementById('vehicleRemovePopup');
    if (vehicleLoadSection) vehicleLoadSection.hidden = !hasVehicle;
    if (vehicleUnloadSection) vehicleUnloadSection.hidden = !hasVehicle;
  }

  function closeInventoryHub(target = 'all', options = {}) {
    if (target && typeof target === 'object') {
      options = target;
      target = 'all';
    }
    const root = getToolbarRoot();
    if (!root) return;
    const skipSection = options.skipSection || '';
    const keys = target === 'all' ? Object.keys(INVENTORY_HUB_DEFS) : [target];
    keys.forEach(hubKey => {
      const def = INVENTORY_HUB_DEFS[hubKey];
      if (!def) return;
      Object.keys(def.sectionTabIds).forEach(sectionId => {
        if (sectionId === skipSection) return;
        const section = root.getElementById(sectionId);
        if (!section || typeof section.__hubCleanup !== 'function') return;
        const cleanup = section.__hubCleanup;
        section.__hubCleanup = null;
        try { cleanup({ viaHubClose: true }); } catch {}
      });
      const popup = root.getElementById(def.popupId);
      if (popup) popup.classList.remove('open');
    });
    clearInventoryHubHighlight(root);
    window.updateScrollLock?.();
  }

  function openInventoryHub(target = 'items', options = {}) {
    const focusSection = options && typeof options === 'object' ? options.focusSection : '';
    let hubKey = Object.prototype.hasOwnProperty.call(INVENTORY_HUB_DEFS, target) ? target : '';
    let resolvedTab = getInventoryHubKeyForTab(target) ? target : '';
    if (!resolvedTab && focusSection) {
      resolvedTab = INVENTORY_HUB_FOCUS_TABS[focusSection] || '';
    }
    if (!resolvedTab && target === 'vehicles') {
      resolvedTab = 'vehicle-load';
    }
    if (!hubKey) hubKey = getInventoryHubKeyForTab(resolvedTab) || 'items';
    const def = INVENTORY_HUB_DEFS[hubKey];
    if (!def) return null;
    if (!resolvedTab || !def.tabs.includes(resolvedTab)) resolvedTab = def.defaultTab;
    const hub = ensureInventoryHubMounted(hubKey);
    if (!hub) return null;
    Object.keys(INVENTORY_HUB_DEFS).forEach(key => {
      if (key !== hubKey) closeInventoryHub(key);
    });
    syncInventoryHubState();
    setInventoryHubTab(hubKey, resolvedTab);
    hub.classList.add('open');
    const inner = hub.querySelector('.popup-inner.inventory-hub-ui');
    if (inner) inner.scrollTop = 0;
    window.updateScrollLock?.();
    if (focusSection) {
      requestAnimationFrame(() => highlightInventoryHubSection(focusSection));
    }
    return hub;
  }

  function openInventoryItemsHub(tabId = 'custom-item', options = {}) {
    return openInventoryHub(tabId || 'items', options);
  }

  function openInventoryEconomyHub(tabId = 'money', options = {}) {
    return openInventoryHub(tabId || 'economy', options);
  }

  function openInventoryCustomItemManager() {
    openCustomPopup(entry => {
      if (!entry) return;
      const list = storeHelper.getCustomEntries(store);
      list.push(entry);
      const result = storeHelper.setCustomEntries(store, list);
      if (result && result.idMap) {
        const mappedId = result.idMap.get(entry.id);
        if (mappedId) entry.id = mappedId;
      }
      if (result && Array.isArray(result.entries)) {
        const persisted = result.entries.find(e => e.id === entry.id);
        if (persisted) {
          entry.namn = persisted.namn;
          entry.artifactEffect = persisted.artifactEffect;
        }
      }
      const inv = storeHelper.getInventory(store);
      inv.push({ id: entry.id, name: entry.namn, qty:1, gratis:0, gratisKval:[], removedKval:[], artifactEffect: entry.artifactEffect });
      saveInventory(inv);
      renderInventory();
      if (window.indexViewRefreshFilters) window.indexViewRefreshFilters();
      if (window.indexViewUpdate) window.indexViewUpdate();
    });
  }

  function openInventoryHubTab(tabId) {
    if (tabId === 'custom-item') {
      openInventoryCustomItemManager();
      return;
    }
    if (tabId === 'bulk-qty') {
      openQtyPopup();
      return;
    }
    if (tabId === 'money') {
      openMoneyPopup();
      return;
    }
    if (tabId === 'bulk-price') {
      openPricePopup();
      return;
    }
    if (tabId === 'vehicle-load') {
      openVehiclePopup();
      return;
    }
    if (tabId === 'vehicle-unload') {
      openVehicleRemovePopup();
    }
  }

  function spendInventoryMoney(spendMoney, options = {}) {
    const normalized = storeHelper.normalizeMoney(spendMoney || {});
    const spendO = moneyToO(normalized);
    if (spendO <= 0) return false;
    const finish = () => {
      const curMoney = storeHelper.getMoney(store);
      const remainingO = Math.max(0, moneyToO(curMoney) - spendO);
      storeHelper.setMoney(store, oToMoney(remainingO));
      renderInventory();
    };
    const priv = storeHelper.getPrivMoney(store);
    const pos  = storeHelper.getPossessionMoney(store);
    const hasAdv = priv.daler || priv.skilling || priv['örtegar'] || pos.daler || pos.skilling || pos['örtegar'];
    if (hasAdv) {
      openAdvMoneyPopup(() => {
        storeHelper.setPrivMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
        storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
        finish();
        if (typeof options.onComplete === 'function') options.onComplete(true);
      });
      return true;
    }
    finish();
    if (typeof options.onComplete === 'function') options.onComplete(true);
    return true;
  }

  function getCraftLevels() {
    const list = storeHelper.getCurrentList(store);
    const partyForge = LEVEL_IDX[storeHelper.getPartySmith(store) || ''] || 0;
    const skillForge = storeHelper.abilityLevel(list, 'Smideskonst');
    const forgeLvl = Math.max(partyForge, skillForge);
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(list, 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
    const skillArt = storeHelper.abilityLevel(list, 'Artefaktmakande');
    const artLevel = Math.max(partyArt, skillArt);
    return { forgeLvl, alcLevel, artLevel };
  }

  function calcRowCostOWithLevels(row, levels) {
    if (!row) return 0;
    return moneyToO(calcRowCost(row, levels.forgeLvl, levels.alcLevel, levels.artLevel));
  }

  function markRowFree(row) {
    if (!row) return;
    const qty = Math.max(0, Number(row.qty) || 0);
    row.gratis = qty;
    const entry = getEntry(row.id || row.name);
    const removed = Array.isArray(row.removedKval) ? row.removedKval : [];
    const baseQuals = [
      ...(entry.taggar?.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    const baseQ = baseQuals.filter(q => !removed.includes(q));
    const extraQ = Array.isArray(row.kvaliteter) ? row.kvaliteter : [];
    const allQ = sanitizeArmorQualities(entry, [...baseQ, ...extraQ]);
    const positives = allQ.filter(q => !isNegativeQual(q) && !isNeutralQual(q));
    row.gratisKval = [...new Set(positives)];
  }

  function applyLiveModePayment(pairs, opts) {
    if (!Array.isArray(pairs) || !pairs.length) return;
    if (typeof storeHelper?.getLiveMode !== 'function') return;
    if (!storeHelper.getLiveMode(store)) return;
    const levels = getCraftLevels();
    const override = opts && Number.isFinite(opts.overrideO) ? Math.max(0, Math.floor(opts.overrideO)) : null;
    let deltaO = 0;
    if (override != null) {
      deltaO = override;
    } else {
      pairs.forEach(({ prev, next }) => {
        if (!next) return;
        const prevO = prev ? calcRowCostOWithLevels(prev, levels) : 0;
        const nextO = calcRowCostOWithLevels(next, levels);
        const diff = Math.max(0, nextO - prevO);
        if (diff > 0) deltaO += diff;
      });
    }
    if (deltaO > 0) {
      const money = storeHelper.getMoney(store);
      const remainingO = Math.max(0, moneyToO(money) - deltaO);
      storeHelper.setMoney(store, oToMoney(remainingO));
    }
    pairs.forEach(({ next }) => {
      if (next) markRowFree(next);
    });
  }
  const createEntryCard = (options) => {
    const factory = window.entryCardFactory?.create;
    if (typeof factory !== 'function') {
      throw new Error('entryCardFactory not initialized');
    }
    return factory(options);
  };
  function getCatStateKey() {
    const charId = store?.current || 'default';
    return `${INV_CAT_STATE_PREFIX}${charId}`;
  }

  function loadInvCatState() {
    const key = getCatStateKey();
    if (cachedCatState.key === key) return cachedCatState.state;
    let state = {};
    try {
      const raw = localStorage.getItem(key);
      if (raw) state = JSON.parse(raw) || {};
    } catch {}
    cachedCatState = { key, state };
    return state;
  }

  function saveInvCatState(state) {
    const key = getCatStateKey();
    cachedCatState = { key, state };
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);

  function renderActiveFilters() {
    if (!dom.active) return;
    const tags = [];
    const text = (F.invTxt || '').trim();
    if (text) {
      tags.push(`<span class="tag removable" data-type="text">${escapeHtml(text)} ✕</span>`);
    }
    F.test.forEach(val => {
      tags.push(`<span class="tag removable" data-type="test" data-val="${escapeHtml(val)}">${escapeHtml(val)} ✕</span>`);
    });
    F.typ.forEach(val => {
      tags.push(`<span class="tag removable" data-type="typ" data-val="${escapeHtml(val)}">${escapeHtml(val)} ✕</span>`);
    });
    F.ark.forEach(val => {
      tags.push(`<span class="tag removable" data-type="ark" data-val="${escapeHtml(val)}">${escapeHtml(val)} ✕</span>`);
    });
    dom.active.innerHTML = tags.join('');
  }

  const dividePrice = (amt, divisor) => {
    const o = typeof amt === 'number' ? amt : moneyToO(amt || {});
    return Math.floor(o / divisor);
  };

  function parseRef(ref) {
    if (ref && typeof ref === 'object') {
      const id = ref.id !== undefined && ref.id !== null ? String(ref.id).trim() : undefined;
      const name = typeof ref.namn === 'string' && ref.namn.trim()
        ? ref.namn.trim()
        : (typeof ref.name === 'string' && ref.name.trim() ? ref.name.trim() : undefined);
      return { id: id || undefined, name };
    }
    if (ref === undefined || ref === null) return { id: undefined, name: undefined };
    if (typeof ref === 'string') {
      const trimmed = ref.trim();
      if (!trimmed) return { id: undefined, name: undefined };
      return { id: trimmed, name: trimmed };
    }
    if (typeof ref === 'number') {
      return { id: String(ref), name: undefined };
    }
    return { id: undefined, name: undefined };
  }

  function getEntry(ref) {
    const { id, name } = parseRef(ref);
    const custom = storeHelper.getCustomEntries(store);
    const own = custom.find(x => (id && x.id === id) || (name && x.namn === name));
    if (own) return own;
    if (typeof window.lookupEntry === 'function') {
      const hit = window.lookupEntry({ id, name }, { explicitName: name });
      if (hit) return hit;
    }
    if (id !== undefined && DB && DB[id]) return DB[id];
    if (Array.isArray(DB) && id !== undefined) {
      const byId = DB.find(ent => String(ent?.id ?? '') === id);
      if (byId) return byId;
    }
    return {};
  }

  function isSameChoiceSource(left, right) {
    if (!left || !right) return false;
    const leftId = left.id === undefined || left.id === null ? '' : String(left.id).trim();
    const rightId = right.id === undefined || right.id === null ? '' : String(right.id).trim();
    if (leftId && rightId) return leftId === rightId;
    const leftName = String(left.namn || left.name || '').trim();
    const rightName = String(right.namn || right.name || '').trim();
    return Boolean(leftName && rightName && leftName === rightName);
  }

  function getInventoryChoiceUsedValues(inv, entry, field, excludeRow = null) {
    if (!field) return [];
    return flattenInventory(Array.isArray(inv) ? inv : [])
      .filter(row => row && row !== excludeRow && isSameChoiceSource(row, entry))
      .map(row => row?.[field])
      .filter(value => value !== undefined && value !== null && String(value).trim() !== '');
  }

  async function pickInventoryEntryChoice(options = {}) {
    const picker = window.choicePopup;
    if (!picker || typeof picker.getChoiceRule !== 'function' || typeof picker.pickForEntry !== 'function') {
      return { hasChoice: false, cancelled: false };
    }

    const entry = options.entry;
    if (!entry || typeof entry !== 'object') return { hasChoice: false, cancelled: false };
    const fieldFilter = String(options.field || '').trim();
    const list = Array.isArray(options.list) ? options.list : [];
    const inv = Array.isArray(options.inv) ? options.inv : [];
    const row = options.row && typeof options.row === 'object' ? options.row : null;
    const context = {
      list,
      inventory: inv,
      row,
      entry,
      sourceEntry: entry,
      field: fieldFilter,
      level: typeof options.level === 'string' ? options.level : (entry.nivå || ''),
      sourceLevel: typeof options.level === 'string' ? options.level : (entry.nivå || '')
    };
    const rule = picker.getChoiceRule(entry, context, { fallbackLegacy: true });
    if (!rule) return { hasChoice: false, cancelled: false };

    const usedValues = Array.isArray(options.usedValues)
      ? options.usedValues
      : getInventoryChoiceUsedValues(inv, entry, rule.field, row);
    const picked = await picker.pickForEntry({
      entry,
      context,
      rule,
      usedValues,
      currentValue: options.currentValue,
      fallbackLegacy: true
    });
    if (!picked?.hasChoice) return { hasChoice: false, cancelled: false };
    if (picked.cancelled) {
      return {
        hasChoice: true,
        cancelled: true,
        noOptions: Boolean(picked.noOptions),
        rule,
        usedValues
      };
    }

    const duplicate = await picker.enforceDuplicatePolicy({
      rule,
      value: picked.value,
      usedValues,
      label: picked.value
    });
    if (!duplicate.ok) {
      return {
        hasChoice: true,
        cancelled: true,
        duplicateRejected: true,
        rule,
        usedValues
      };
    }

    return {
      hasChoice: true,
      cancelled: false,
      rule,
      value: picked.value,
      usedValues,
      duplicate
    };
  }

  function normalizePositiveInt(value, fallback = 1) {
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, num);
  }

  function listify(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  }

  function getInventoryMeta(entry) {
    const invTag = entry?.taggar?.inventory;
    return (invTag && typeof invTag === 'object' && !Array.isArray(invTag))
      ? invTag
      : {};
  }

  function isEntryStackable(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const invMeta = getInventoryMeta(entry);
    if (typeof invMeta.stackbar === 'boolean') return invMeta.stackbar;
    const id = entry.id === undefined || entry.id === null ? '' : String(entry.id).trim();
    return id ? LEGACY_STACKABLE_ID_SET.has(id) : false;
  }

  function isTraitBoundInventoryEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.bound) return true;
    if (Array.isArray(entry.traits) && entry.traits.filter(Boolean).length > 0) return true;
    const invMeta = getInventoryMeta(entry);
    return invMeta.traitbunden === true || invMeta.traitBound === true;
  }

  function shouldShowRowTraitInName(row, entry) {
    if (!row || !row.trait) return false;
    return isTraitBoundInventoryEntry(entry);
  }

  function getEntryRuleListWithFallback(entry, key, options = {}) {
    const helper = window.rulesHelper;
    if (helper && typeof helper.getRuleList === 'function') {
      try {
        const rules = helper.getRuleList(entry, key, options);
        if (Array.isArray(rules)) return rules;
      } catch (_) {
        // Ignore malformed rules and fall through to empty.
      }
    }
    return [];
  }

  function normalizeBundleRuleRef(raw) {
    if (raw === undefined || raw === null) return null;
    let id = '';
    let name = '';
    let qty = 1;

    if (typeof raw === 'string' || typeof raw === 'number') {
      const txt = String(raw).trim();
      if (!txt) return null;
      id = txt;
    } else if (raw && typeof raw === 'object') {
      id = raw.id === undefined || raw.id === null ? '' : String(raw.id).trim();
      name = typeof raw.namn === 'string'
        ? raw.namn.trim()
        : (typeof raw.name === 'string' ? raw.name.trim() : '');
      qty = normalizePositiveInt(raw.antal ?? raw.qty ?? raw.varde, 1);
    }

    if (!id && !name) return null;
    if (!qty) return null;
    return { id, name, qty };
  }

  function getLegacyBundleRefs(entry) {
    const id = entry?.id === undefined || entry?.id === null ? '' : String(entry.id).trim();
    const legacy = id ? LEGACY_BUNDLE_BY_ENTRY_ID[id] : null;
    if (!Array.isArray(legacy)) return [];
    return legacy.map(item => ({
      id: String(item?.id || '').trim(),
      name: String(item?.name || '').trim(),
      qty: normalizePositiveInt(item?.qty ?? item?.antal, 1)
    })).filter(item => (item.id || item.name) && item.qty > 0);
  }

  function getInventoryBundleItems(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return [];
    const level = options?.level ?? entry.nivå;
    const rules = getEntryRuleListWithFallback(entry, 'ger', level ? { level } : {});
    const aggregate = new Map();

    rules.forEach(rule => {
      if (String(rule?.mal || '').trim() !== 'foremal') return;
      listify(rule?.foremal).forEach(raw => {
        const parsed = normalizeBundleRuleRef(raw);
        if (!parsed) return;
        const resolved = getEntry(parsed.id || parsed.name);
        const resolvedId = resolved?.id === undefined || resolved?.id === null
          ? parsed.id
          : String(resolved.id).trim();
        const resolvedName = typeof resolved?.namn === 'string' && resolved.namn.trim()
          ? resolved.namn.trim()
          : parsed.name;
        if (!resolvedId && !resolvedName) return;
        const key = resolvedId ? `id:${resolvedId}` : `name:${resolvedName.toLowerCase()}`;
        if (!aggregate.has(key)) {
          aggregate.set(key, {
            id: resolvedId || undefined,
            name: resolvedName,
            qty: 0,
            entry: resolved && resolved.namn ? resolved : null
          });
        }
        aggregate.get(key).qty += parsed.qty;
      });
    });

    const fromRules = Array.from(aggregate.values()).filter(item => item.qty > 0);
    if (fromRules.length) return fromRules;

    return getLegacyBundleRefs(entry).map(item => {
      const resolved = getEntry(item.id || item.name);
      return {
        id: resolved?.id ? String(resolved.id).trim() : (item.id || undefined),
        name: (resolved?.namn && String(resolved.namn).trim()) || item.name,
        qty: item.qty,
        entry: resolved && resolved.namn ? resolved : null
      };
    }).filter(item => (item.id || item.name) && item.qty > 0);
  }

  function isInventoryBundleEntry(entry, options = {}) {
    return getInventoryBundleItems(entry, options).length > 0;
  }

  function getRowQuantityValue(row) {
    if (!row || typeof row !== 'object') return 0;
    if (row.qty === undefined || row.qty === null || row.qty === '') return 1;
    return normalizePositiveInt(row.qty, 0);
  }

  function rowMatchesInventoryRef(row, ref) {
    if (!row || !ref) return false;
    const rowId = row.id === undefined || row.id === null ? '' : String(row.id).trim();
    const refId = ref.id === undefined || ref.id === null ? '' : String(ref.id).trim();
    if (refId) {
      if (rowId) return rowId === refId;
      const refName = ref.name === undefined || ref.name === null ? '' : String(ref.name).trim();
      return refName && String(row.name || '').trim() === refName;
    }
    const refName = ref.name === undefined || ref.name === null ? '' : String(ref.name).trim();
    if (!refName) return false;
    return String(row.name || '').trim() === refName;
  }

  function getInventoryRefQuantity(inv, ref) {
    return (Array.isArray(inv) ? inv : []).reduce((sum, row) => {
      if (!rowMatchesInventoryRef(row, ref)) return sum;
      return sum + getRowQuantityValue(row);
    }, 0);
  }

  function buildBasicInventoryRow(entry, qty = 1) {
    return {
      id: entry.id,
      name: entry.namn,
      qty: normalizePositiveInt(qty, 1) || 1,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    };
  }

  function addInventoryEntryQuantity(inv, entry, qty, options = {}) {
    if (!Array.isArray(inv) || !entry || !entry.namn) return false;
    const amount = normalizePositiveInt(qty, 0);
    if (!amount) return false;
    const livePairs = Array.isArray(options.livePairs) ? options.livePairs : null;
    const ref = { id: entry.id, name: entry.namn };
    if (isIndividualItem(entry)) {
      for (let i = 0; i < amount; i++) {
        const row = buildBasicInventoryRow(entry, 1);
        inv.push(row);
        if (livePairs) livePairs.push({ prev: null, next: row });
      }
      return true;
    }

    const idx = inv.findIndex(row => rowMatchesInventoryRef(row, ref));
    if (idx === -1) {
      const row = buildBasicInventoryRow(entry, amount);
      inv.push(row);
      if (livePairs) livePairs.push({ prev: null, next: row });
      return true;
    }

    const target = inv[idx];
    const prevState = livePairs ? cloneRow(target) : null;
    const curQty = getRowQuantityValue(target);
    target.qty = curQty + amount;
    if (livePairs) livePairs.push({ prev: prevState, next: target });
    return true;
  }

  function addInventoryBundle(inv, entry, options = {}) {
    const units = normalizePositiveInt(options?.units ?? 1, 1);
    if (!units) return [];
    const bundleItems = getInventoryBundleItems(entry, options);
    if (!bundleItems.length) return [];
    const livePairs = Array.isArray(options.livePairs) ? options.livePairs : null;
    const refs = [];

    bundleItems.forEach(item => {
      const resolvedEntry = item.entry && item.entry.namn ? item.entry : getEntry(item.id || item.name);
      if (!resolvedEntry || !resolvedEntry.namn) return;
      const qty = item.qty * units;
      const changed = addInventoryEntryQuantity(inv, resolvedEntry, qty, { livePairs });
      if (!changed) return;
      refs.push({
        id: resolvedEntry.id === undefined || resolvedEntry.id === null ? undefined : String(resolvedEntry.id).trim(),
        name: resolvedEntry.namn
      });
    });

    const seen = new Set();
    return refs.filter(ref => {
      const key = ref.id ? `id:${ref.id}` : `name:${String(ref.name || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function removeInventoryRefQuantity(inv, ref, qty) {
    if (!Array.isArray(inv)) return 0;
    let remaining = normalizePositiveInt(qty, 0);
    if (!remaining) return 0;
    let removed = 0;
    for (let i = 0; i < inv.length && remaining > 0;) {
      const row = inv[i];
      if (!rowMatchesInventoryRef(row, ref)) {
        i += 1;
        continue;
      }
      const rowQty = getRowQuantityValue(row);
      if (rowQty <= remaining) {
        remaining -= rowQty;
        removed += rowQty;
        inv.splice(i, 1);
        continue;
      }
      row.qty = rowQty - remaining;
      removed += remaining;
      remaining = 0;
      i += 1;
    }
    return removed;
  }

  function removeInventoryBundle(inv, entry, units = 1, options = {}) {
    const removeUnits = normalizePositiveInt(units, 0);
    if (!removeUnits) return false;
    const bundleItems = getInventoryBundleItems(entry, options);
    if (!bundleItems.length) return false;
    let changed = false;
    bundleItems.forEach(item => {
      const targetQty = item.qty * removeUnits;
      if (!targetQty) return;
      const removed = removeInventoryRefQuantity(inv, { id: item.id, name: item.name }, targetQty);
      if (removed > 0) changed = true;
    });
    return changed;
  }

  function getInventoryBundleCount(inv, entry, options = {}) {
    const bundleItems = getInventoryBundleItems(entry, options);
    if (!bundleItems.length) return null;
    const counts = bundleItems.map(item => {
      const available = getInventoryRefQuantity(inv, { id: item.id, name: item.name });
      return Math.floor(available / item.qty);
    });
    if (!counts.length) return 0;
    return Math.max(0, Math.min(...counts));
  }

  function isHiddenType(entryOrTagTyp) {
    const entry = entryOrTagTyp && typeof entryOrTagTyp === 'object' && !Array.isArray(entryOrTagTyp)
      ? entryOrTagTyp
      : null;
    if (entry && typeof storeHelper?.isSearchHiddenEntry === 'function') {
      try { return !!storeHelper.isSearchHiddenEntry(entry); }
      catch { /* ignore and use legacy fallback */ }
    }
    const arr = Array.isArray(entryOrTagTyp)
      ? entryOrTagTyp
      : (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []);
    const primary = arr[0] ? String(arr[0]).toLowerCase() : '';
    return ['artefakt','kuriositet','skatt'].includes(primary);
  }

  function hasArtifactTag(entryOrTagTyp) {
    const arr = Array.isArray(entryOrTagTyp)
      ? entryOrTagTyp
      : (Array.isArray(entryOrTagTyp?.taggar?.typ) ? entryOrTagTyp.taggar.typ : []);
    return arr
      .some(t => String(t || '').trim().toLowerCase() === 'artefakt');
  }

  function needsArtifactListSync(entryOrTagTyp) {
    return isHiddenType(entryOrTagTyp) || hasArtifactTag(entryOrTagTyp);
  }

  const LEVEL_MARKERS = new Map([
    ['Novis', 'N'],
    ['Ges\u00e4ll', 'G'],
    ['M\u00e4stare', 'M']
  ]);

  const levelMarker = (level) => {
    if (!level) return '';
    const key = String(level).trim();
    if (!key) return '';
    if (LEVEL_MARKERS.has(key)) return LEVEL_MARKERS.get(key);
    const first = key[0];
    return first ? first.toUpperCase() : '';
  };

  const hasSingleLevel = (entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const keys = Object.keys(entry.nivåer || {})
      .map(k => String(k || '').trim())
      .filter(Boolean);
    return keys.length === 1;
  };

  function sortInvEntry(a, b) {
    const entA = getEntry(a.id || a.name);
    const entB = getEntry(b.id || b.name);
    const isVehA = (entA.taggar?.typ || []).includes('F\u00e4rdmedel');
    const isVehB = (entB.taggar?.typ || []).includes('F\u00e4rdmedel');
    if (isVehA && !isVehB) return 1;
    if (!isVehA && isVehB) return -1;
    return sortByType(entA, entB);
  }

  function saveInventory(inv) {
    normalizeInventoryQualities(inv);
    const nonVeh = [];
    const veh = [];
    inv.forEach(row => {
      const entry = getEntry(row.id || row.name);
      if ((entry.taggar?.typ || []).includes('F\u00e4rdmedel')) veh.push(row);
      else nonVeh.push(row);
    });
    inv.splice(0, inv.length, ...nonVeh, ...veh);
    storeHelper.setInventory(store, inv);
    recalcArtifactEffects();
    if (window.updateXP) updateXP();
    if (window.renderTraits) renderTraits();
    if (window.indexViewUpdate) window.indexViewUpdate();
  }

  function getGrantSourceName(value) {
    return String(value || '').trim();
  }

  function isGrantSourceActive(sourceName) {
    const source = getGrantSourceName(sourceName);
    if (!source) return false;
    return storeHelper.getCurrentList(store).some(entry => entry?.namn === source);
  }

  function getGrantRemovalMessage(sourceName) {
    const source = getGrantSourceName(sourceName);
    if (!source) return 'Utrustningen kommer från en regelstyrd källa. Ta bort ändå?';
    return `Utrustningen kommer från fördelen “${source}”. Ta bort ändå?`;
  }

  async function confirmGrantRemoval(sourceName) {
    const source = getGrantSourceName(sourceName);
    if (!source) return true;
    if (!isGrantSourceActive(source)) return true;
    return confirmPopup(getGrantRemovalMessage(source));
  }

  function flattenInventory(arr) {
    return arr.reduce((acc, row) => {
      acc.push(row);
      if (Array.isArray(row.contains)) acc.push(...flattenInventory(row.contains));
      return acc;
    }, []);
  }

  function flattenInventoryWithPath(arr, prefix = []) {
    return arr.reduce((acc, row, idx) => {
      const path = [...prefix, idx];
      acc.push({ row, path });
      if (Array.isArray(row.contains)) {
        acc.push(...flattenInventoryWithPath(row.contains, path));
      }
      return acc;
    }, []);
  }

  function getRowByPath(inv, path) {
    let arr = inv;
    let row = null;
    for (let i = 0; i < path.length; i++) {
      const idx = path[i];
      row = arr[idx];
      if (!row) return { row: null, parentArr: null, idx: -1 };
      if (i < path.length - 1) arr = row.contains || [];
    }
    return { row, parentArr: arr, idx: path[path.length - 1] };
  }

  function splitStackRow(row, qty) {
    if (!row) return { movedRow: null, remainingQty: 0 };
    const currentQtyRaw = Number(row.qty);
    const currentQty = Number.isFinite(currentQtyRaw) && currentQtyRaw > 0
      ? Math.floor(currentQtyRaw)
      : 0;
    const amountRaw = Number(qty);
    const amount = Math.min(
      currentQty,
      Math.max(1, Number.isFinite(amountRaw) ? Math.floor(amountRaw) : 0)
    );
    if (!currentQty || !amount) {
      return { movedRow: null, remainingQty: currentQty };
    }
    const movedRow = cloneRow(row);
    if (!movedRow) return { movedRow: null, remainingQty: currentQty };
    movedRow.qty = amount;
    const adjustCountField = field => {
      const originalRaw = Number(row[field]);
      const original = Number.isFinite(originalRaw) && originalRaw > 0
        ? Math.floor(originalRaw)
        : 0;
      if (!original) {
        delete movedRow[field];
        delete row[field];
        return;
      }
      const moveVal = Math.min(original, amount);
      if (moveVal > 0) movedRow[field] = moveVal;
      else delete movedRow[field];
      const remain = original - moveVal;
      if (remain > 0) {
        row[field] = remain;
      } else {
        delete row[field];
      }
    };
    adjustCountField('gratis');
    adjustCountField('perkGratis');
    row.qty = currentQty - amount;
    if (row.qty <= 0) {
      delete row.qty;
      delete row.gratis;
      delete row.perkGratis;
    } else {
      if (Number(row.gratis) > row.qty) row.gratis = row.qty;
      if (Number(row.perkGratis) > row.qty) row.perkGratis = row.qty;
    }
    if (Number(movedRow.gratis) > movedRow.qty) movedRow.gratis = movedRow.qty;
    if (Number(movedRow.perkGratis) > movedRow.qty) movedRow.perkGratis = movedRow.qty;
    return { movedRow, remainingQty: row.qty || 0 };
  }

  function isIndividualItem(entry) {
    if (!entry) return false;
    const tagTyp = entry.taggar?.typ || [];
    const indivType = INDIVIDUAL_TYPES.some(t => tagTyp.includes(t));
    if (!indivType) return false;
    if (isEntryStackable(entry)) return false;
    if (['kraft', 'ritual'].includes(entry.bound)) return false;
    return true;
  }

  function mergeStackRows(target, source) {
    if (!target || !source) return;
    const addCount = (field) => {
      const srcRaw = Number(source[field]);
      const srcVal = Number.isFinite(srcRaw) && srcRaw > 0 ? Math.floor(srcRaw) : 0;
      if (!srcVal) return;
      const tgtRaw = Number(target[field]);
      const tgtVal = Number.isFinite(tgtRaw) && tgtRaw > 0 ? Math.floor(tgtRaw) : 0;
      target[field] = tgtVal + srcVal;
    };

    const qtyRaw = Number(source.qty);
    const qtyVal = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 0;
    if (qtyVal) {
      const tgtQtyRaw = Number(target.qty);
      const tgtQtyVal = Number.isFinite(tgtQtyRaw) && tgtQtyRaw > 0 ? Math.floor(tgtQtyRaw) : 0;
      target.qty = tgtQtyVal + qtyVal;
    }

    addCount('gratis');
    addCount('perkGratis');

    if (Array.isArray(source.gratisKval) && source.gratisKval.length) {
      const set = new Set([...(target.gratisKval || []), ...source.gratisKval]);
      target.gratisKval = [...set];
    }
    if (Array.isArray(source.removedKval) && source.removedKval.length) {
      const set = new Set([...(target.removedKval || []), ...source.removedKval]);
      target.removedKval = [...set];
    }
    if (Array.isArray(source.manualQualityOverride) && source.manualQualityOverride.length) {
      const set = new Set([...(target.manualQualityOverride || []), ...source.manualQualityOverride]);
      target.manualQualityOverride = [...set];
    }

    if (!target.basePrice && source.basePrice) {
      target.basePrice = { ...source.basePrice };
    }
    if (!target.basePriceSource && source.basePriceSource) {
      target.basePriceSource = source.basePriceSource;
    }
    if (source.priceMult && !target.priceMult) {
      target.priceMult = source.priceMult;
    }

    if (Number(target.gratis) > Number(target.qty)) target.gratis = Number(target.qty) || 0;
    if (Number(target.perkGratis) > Number(target.qty)) target.perkGratis = Number(target.qty) || 0;
  }

  function canStackRows(target, source, entry) {
    if (!target || !source) return false;
    if (Array.isArray(target.contains)) return false;
    if (Array.isArray(source.contains)) return false;

    const entryName = entry?.namn || '';
    const targetEntry = getEntry(target.id || target.name);
    const targetEntryName = targetEntry?.namn || '';
    if (source.id) {
      if (target.id !== source.id) return false;
    } else if (target.id) {
      return false;
    } else {
      const sourceName = entryName || source.name || '';
      const targetName = targetEntryName || target.name || '';
      if (sourceName !== targetName) {
        if (!entryName && !targetEntryName) return false;
        const normalize = val => String(val || '').replace(/\s+\d+$/, '');
        if (normalize(sourceName) !== normalize(targetName)) return false;
      }
    }

    const targetTrait = target.trait || '';
    const sourceTrait = source.trait || '';
    if (targetTrait !== sourceTrait) return false;

    const targetEffect = target.artifactEffect || '';
    const sourceEffect = source.artifactEffect || '';
    if (targetEffect !== sourceEffect) return false;

    return true;
  }

  function addToInventory(inv, row) {
    if (!row || !Array.isArray(inv)) return;
    const entry = getEntry(row.id || row.name);
    if (isIndividualItem(entry)) {
      inv.push(row);
      return;
    }
    const target = inv.find(existing => canStackRows(existing, row, entry));
    if (target) {
      mergeStackRows(target, row);
    } else {
      if (!Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0) {
        row.qty = 1;
      }
      if (!Array.isArray(row.gratisKval)) row.gratisKval = row.gratisKval ? [row.gratisKval] : [];
      if (!Array.isArray(row.removedKval)) row.removedKval = row.removedKval ? [row.removedKval] : [];
      if (!Array.isArray(row.manualQualityOverride)) {
        row.manualQualityOverride = row.manualQualityOverride ? [row.manualQualityOverride] : [];
      }
      if (Number(row.gratis) > Number(row.qty)) row.gratis = Number(row.qty) || 0;
      if (Number(row.perkGratis) > Number(row.qty)) row.perkGratis = Number(row.qty) || 0;
      inv.push(row);
    }
  }

  function parsePathStr(str) {
    return str.split('.').map(n => Number(n)).filter(n => !Number.isNaN(n));
  }

  function sortPathsDesc(pathStrs) {
    return [...pathStrs]
      .map(s => ({ s, a: parsePathStr(s) }))
      .sort((x, y) => {
        const a = x.a, b = y.a;
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          const av = a[i], bv = b[i];
          if (av === undefined) return 1;
          if (bv === undefined) return -1;
          if (av !== bv) return bv - av;
        }
        return 0;
      })
      .map(o => o.s);
  }

  function recalcArtifactEffects() {
    const inv = flattenInventory(storeHelper.getInventory(store));
    const effects = inv.reduce((acc, row) => {
      const entry = getEntry(row.id || row.name);
      const tagTyp = entry.taggar?.typ || [];
      if (!tagTyp.includes('Artefakt')) return acc;
      const eff = row.artifactEffect;
      if (eff === 'corruption') acc.corruption += 1;
      else if (eff === 'xp') acc.xp += 1;
      return acc;
    }, { xp:0, corruption:0 });
    storeHelper.setArtifactEffects(store, effects);
  }

  function makeNameMap(inv) {
    const counts = {};
    const baseNames = new Map();
    inv.forEach(r => {
      const entry = getEntry(r.id || r.name);
      let n = r.name;
      if (shouldShowRowTraitInName(r, entry)) {
        n += `: ${r.trait}`;
      }
      baseNames.set(r, n);
      counts[n] = (counts[n] || 0) + 1;
    });
    const idx = {};
    const map = new Map();
    inv.forEach(r => {
      const n = baseNames.get(r);
      if (counts[n] > 1) {
        idx[n] = (idx[n] || 0) + 1;
        map.set(r, `${n} ${idx[n]}`);
      } else {
        map.set(r, n);
      }
    });
    return map;
  }

  function getInventoryVehicleContext(inv) {
    const inventory = Array.isArray(inv) ? inv : [];
    const vehicles = inventory
      .map((row, idx) => ({ row, entry: getEntry(row?.id || row?.name), idx }))
      .filter(({ entry }) => (entry?.taggar?.typ || []).includes('Färdmedel'));
    const flat = flattenInventoryWithPath(inventory);
    const nameMap = makeNameMap(flat.map(item => item.row));
    const vehicleNameMap = makeNameMap(vehicles.map(item => item.row));
    const vehicleNames = new Map(
      vehicles.map(({ row, entry, idx }) => [idx, vehicleNameMap.get(row) || entry?.namn || row?.name || 'Färdmedel'])
    );
    const vehicleIndexes = vehicles.map(item => item.idx);
    return { vehicles, flat, nameMap, vehicleNames, vehicleIndexes };
  }

  function buildInventoryBatchCheckboxRow(label, path, meta = '') {
    const safeLabel = escapeHtml(label || 'Okänt föremål');
    const safeMeta = meta ? `<span class="inventory-batch-item-meta">${escapeHtml(meta)}</span>` : '';
    return `
      <label class="price-item inventory-batch-item">
        <span class="inventory-batch-item-copy">
          <span class="inventory-batch-item-label">${safeLabel}</span>
          ${safeMeta}
        </span>
        <input type="checkbox" data-path="${path}">
      </label>
    `;
  }

  function buildInventoryBatchActionRow(label, actionLabel, path, meta = '') {
    const safeLabel = escapeHtml(label || 'Okänt föremål');
    const safeAction = escapeHtml(actionLabel || 'Verkställ');
    const safeMeta = meta ? `<span class="inventory-batch-item-meta">${escapeHtml(meta)}</span>` : '';
    return `
      <div class="price-item inventory-batch-item inventory-batch-item-action">
        <span class="inventory-batch-item-copy">
          <span class="inventory-batch-item-label">${safeLabel}</span>
          ${safeMeta}
        </span>
        <button type="button" class="char-btn vehicle-money-action" data-path="${path}">${safeAction}</button>
      </div>
    `;
  }

  function getCharacterCarrySummary(inv) {
    const inventory = Array.isArray(inv) ? inv : (storeHelper.getInventory(store) || []);
    const allInv = flattenInventory(inventory);
    const levels = getCraftLevels();
    const totalCostO = allInv.reduce((sum, row) => sum + calcRowCostOWithLevels(row, levels), 0);
    const totalMoney = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));
    const diffO = moneyToO(totalMoney) - totalCostO;
    const unusedMoney = oToMoney(Math.max(0, diffO));
    const moneyWeight = calcMoneyWeight(unusedMoney);
    const list = storeHelper.getCurrentList(store);
    const usedWeight = allInv.reduce((sum, row) => {
      const entry = getEntry(row.id || row.name);
      const isVehicle = (entry.taggar?.typ || []).includes('Färdmedel');
      return sum + (isVehicle ? 0 : calcRowWeight(row, list));
    }, 0) + moneyWeight;
    const traits = storeHelper.getTraits(store);
    const manualAdjust = storeHelper.getManualAdjustments(store) || {};
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(allInv) : {};
    const valStark = (traits['Stark'] || 0) + (bonus['Stark'] || 0) + (maskBonus['Stark'] || 0);
    const maxCapacity = storeHelper.calcCarryCapacity(valStark, list) + Number(manualAdjust.capacity || 0);
    return { usedWeight, maxCapacity };
  }

  function getVehicleCarrySummary(row) {
    const entry = getEntry(row?.id || row?.name);
    const qtyRaw = Number(row?.qty);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    const baseWeight = row?.vikt ?? entry?.vikt ?? entry?.stat?.vikt ?? 0;
    const totalWeight = calcRowWeight(row || {});
    const usedWeight = Math.max(0, totalWeight - (baseWeight * qty));
    const maxCapacity = Number(entry?.stat?.bärkapacitet || 0);
    return { usedWeight, maxCapacity, entry };
  }

  function formatBatchCapacityText(usedWeight, maxCapacity) {
    const fmt = value => typeof formatWeight === 'function'
      ? formatWeight(value)
      : String(Math.round((Number(value) || 0) * 100) / 100);
    return `Bärkapacitet: ${fmt(usedWeight)}/${fmt(maxCapacity)}`;
  }

  function buildInventoryBatchGroup({ title, subtitle = '', metaText = '', icon = '', count = '', itemsHtml = '', emptyText = '' }) {
    const safeTitle = escapeHtml(title || 'Grupp');
    const subtitleHtml = subtitle
      ? `<span class="inventory-batch-group-subtitle">${escapeHtml(subtitle)}</span>`
      : '';
    const metaHtml = metaText
      ? `<span class="inventory-batch-group-meta">${escapeHtml(metaText)}</span>`
      : '';
    const countText = count === '' || count === null || count === undefined
      ? ''
      : String(count);
    const countHtml = countText
      ? `<span class="inventory-batch-group-count">${escapeHtml(countText)}</span>`
      : '';
    const iconHtml = icon
      ? `<span class="inventory-batch-group-icon" aria-hidden="true">${icon}</span>`
      : '';
    const content = itemsHtml || `<p class="inventory-batch-empty">${escapeHtml(emptyText || 'Inga valbara poster.')}</p>`;
    return `
      <section class="vehicle-group inventory-batch-group">
        <header class="inventory-batch-group-header">
          <span class="inventory-batch-group-title-wrap">
            ${iconHtml}
            <span class="inventory-batch-group-copy">
              <span class="inventory-batch-group-title">${safeTitle}</span>
              ${subtitleHtml}
              ${metaHtml}
            </span>
          </span>
          ${countHtml}
        </header>
        <div class="inventory-batch-group-items">
          ${content}
        </div>
      </section>
    `;
  }

  function sortAllInventories() {
    const sortRec = arr => {
      if (!Array.isArray(arr)) return;
      arr.sort(sortInvEntry);
      arr.forEach(r => sortRec(r.contains));
    };
    Object.keys(store.data || {}).forEach(id => {
      const arr = store.data[id]?.inventory;
      sortRec(arr);
    });
    storeHelper.save(store, { allCharacters: true });
  }

  function rowMatchesText(row, txt) {
    if (!txt) return true;
    const t = String(txt).toLowerCase();
    const name = String(row.name || '').toLowerCase();
    if (name.includes(t)) return true;
    if (row.trait && String(row.trait).toLowerCase().includes(t)) return true;
    if (Array.isArray(row.contains)) {
      return row.contains.some(ch => rowMatchesText(ch, t));
    }
    return false;
  }

  function sortQualsForDisplay(list) {
    const arr = list.slice();
    const getName = obj => {
      if (obj.q) return obj.q;
      if (obj.namn) return obj.namn;
      if (obj.name) return obj.name;
      if (obj.item) return getName(obj.item);
      return obj;
    };
    const rank = n =>
      isNegativeQual(n) ? 3 :
      isMysticQual(n)   ? 2 :
      isNeutralQual(n)  ? 1 :
      0;
    arr.sort((a, b) => {
      const na = getName(a);
      const nb = getName(b);
      const ra = rank(na);
      const rb = rank(nb);
      if (ra !== rb) return ra - rb;
      return String(na).localeCompare(String(nb));
    });
    return arr;
  }

  function countPositiveQuals(list) {
    return list.filter(q => !isNegativeQual(q) && !isNeutralQual(q)).length;
  }

  function openQualPopup(list, callback) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop  = root.getElementById('qualPopup');
    const box  = root.getElementById('qualOptions');
    const cls  = root.getElementById('qualCancel');
    const closeBtn = root.getElementById('qualClose');
    const applyBtn = root.getElementById('qualApply');
    const titleEl = root.getElementById('qualTitle');
    const subtitleEl = root.getElementById('qualSubtitle');
    const legendEl = root.getElementById('qualLegend');
    const searchEl = root.getElementById('qualSearch');
    const countEl = root.getElementById('qualCount');
    const emptyEl = root.getElementById('qualEmpty');
    if (!pop || !box || !cls || !searchEl || !countEl || !emptyEl || !applyBtn) return;

    const done = typeof callback === 'function' ? callback : () => {};
    const nameMap = makeNameMap(storeHelper.getInventory(store));
    const qualMode = list.every(it => isQual(it));
    const selected = new Set();
    const categoryOrder = ['positive', 'neutral', 'negative', 'mystic'];
    const categoryLabel = {
      positive: 'Positiva',
      neutral: 'Neutrala',
      negative: 'Negativa',
      mystic: 'Mystiska'
    };
    const qualityCategory = (name) => {
      if (isMysticQual(name)) return 'mystic';
      if (isNegativeQual(name)) return 'negative';
      if (isNeutralQual(name)) return 'neutral';
      return 'positive';
    };
    const normalizeText = (value) => {
      const source = String(value || '').trim().toLowerCase();
      if (!source) return '';
      if (typeof window.searchNormalize === 'function') return window.searchNormalize(source);
      if (typeof source.normalize === 'function') {
        return source.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      return source;
    };
    const items = (qualMode
      ? sortQualsForDisplay(list.map((item, idx) => ({ item, idx })))
      : list.map((item, idx) => ({ item, idx })))
      .map(({ item, idx }) => {
        const base = String(item?.namn || item?.name || '');
        const label = nameMap.get(item) || base;
        const types = Array.isArray(item?.taggar?.typ) ? item.taggar.typ.join(' ') : '';
        let btnClass = 'char-btn';
        if (qualMode) {
          btnClass += ' quality';
          if (isNegativeQual(base)) btnClass += ' negative';
          else if (isNeutralQual(base)) btnClass += ' neutral';
          if (isMysticQual(base)) btnClass += ' mystic';
        }
        return {
          idx,
          label,
          btnClass,
          category: qualMode ? qualityCategory(base) : 'all',
          searchKey: normalizeText(`${label} ${base} ${types}`)
        };
      });
    let filtered = items.slice();

    if (titleEl) {
      titleEl.textContent = qualMode ? 'Lägg till kvalitet' : 'Välj föremål';
    }
    if (subtitleEl) {
      subtitleEl.textContent = qualMode
        ? 'Välj en eller flera kvaliteter att lägga på föremålet.'
        : 'Välj vilket föremål som ska få kvaliteten.';
    }
    if (legendEl) legendEl.hidden = !qualMode;
    searchEl.placeholder = qualMode ? 'Sök kvalitet...' : 'Sök föremål...';
    searchEl.value = '';
    applyBtn.hidden = !qualMode;
    applyBtn.disabled = true;
    applyBtn.textContent = 'Lägg till valda';

    const updateApplyState = () => {
      if (!qualMode) return;
      const cnt = selected.size;
      applyBtn.disabled = cnt <= 0;
      applyBtn.textContent = cnt > 0 ? `Lägg till valda (${cnt})` : 'Lägg till valda';
    };
    const renderGroups = (rows) => categoryOrder
      .map(key => ({
        key,
        rows: rows.filter(it => it.category === key)
      }))
      .filter(group => group.rows.length > 0)
      .map(group => `
        <section class="qual-popup-group" data-group="${group.key}">
          <header class="qual-popup-group-head">
            <span class="qual-popup-group-title">${categoryLabel[group.key] || group.key}</span>
            <span class="qual-popup-group-count">${group.rows.length}</span>
          </header>
          <div class="qual-popup-group-list">
            ${group.rows.map(it => {
              const isSelected = selected.has(it.idx);
              const stateCls = isSelected ? ' is-selected' : '';
              const ariaPressed = isSelected ? 'true' : 'false';
              return `<button data-i="${it.idx}" class="${it.btnClass}${stateCls}" type="button" aria-pressed="${ariaPressed}">${escapeHtml(it.label)}</button>`;
            }).join('')}
          </div>
        </section>
      `).join('');

    const render = () => {
      const term = normalizeText(searchEl.value);
      filtered = term
        ? items.filter(it => it.searchKey.includes(term))
        : items.slice();
      if (qualMode) {
        box.innerHTML = renderGroups(filtered);
      } else {
        box.innerHTML = filtered
          .map(it => `<button data-i="${it.idx}" class="${it.btnClass}" type="button">${escapeHtml(it.label)}</button>`)
          .join('');
      }
      if (qualMode) {
        const selectedTxt = `${selected.size} valda`;
        countEl.textContent = term
          ? `${filtered.length} av ${items.length} kvaliteter • ${selectedTxt}`
          : `${items.length} kvaliteter • ${selectedTxt}`;
      } else {
        countEl.textContent = term
          ? `${filtered.length} av ${items.length} föremål`
          : `${items.length} föremål`;
      }
      if (!filtered.length) {
        const q = searchEl.value.trim();
        emptyEl.textContent = q
          ? `Inga träffar för "${q}".`
          : qualMode ? 'Inga kvaliteter matchar sökningen.' : 'Inga alternativ matchar sökningen.';
        emptyEl.hidden = false;
      } else {
        emptyEl.hidden = true;
      }
      updateApplyState();
    };
    const applySelection = () => {
      if (!qualMode || !selected.size) return;
      const chosen = Array.from(selected)
        .map(Number)
        .filter(idx => Number.isInteger(idx) && idx >= 0)
        .sort((a, b) => a - b);
      if (!chosen.length) return;
      close();
      done(chosen);
    };

    const popInner = pop.querySelector('.popup-inner');
    pop.classList.add('open');
    window.autoResizeAll?.(pop);
    if (popInner) popInner.scrollTop = 0;
    render();
    requestAnimationFrame(() => {
      if (typeof searchEl.focus === 'function') {
        try { searchEl.focus({ preventScroll: true }); } catch { searchEl.focus(); }
      }
    });

    const close = () => {
      pop.classList.remove('open');
      box.removeEventListener('click', onBtn);
      cls.removeEventListener('click', close);
      if (closeBtn) closeBtn.removeEventListener('click', close);
      applyBtn.removeEventListener('click', onApply);
      pop.removeEventListener('click', onOutside);
      searchEl.removeEventListener('input', onSearch);
      searchEl.removeEventListener('keydown', onSearchKeydown);
      box.innerHTML = '';
      searchEl.value = '';
      countEl.textContent = '';
      emptyEl.hidden = true;
      selected.clear();
      applyBtn.hidden = true;
      applyBtn.disabled = true;
      applyBtn.textContent = 'Lägg till valda';
      if (legendEl) legendEl.hidden = true;
    };
    const onBtn = e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      e.stopPropagation();
      const idx = Number(b.dataset.i);
      if (!Number.isInteger(idx)) return;
      if (qualMode) {
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
        render();
        return;
      }
      close();
      done(idx);
    };
    const onSearch = () => render();
    const onSearchKeydown = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (qualMode) {
          if (selected.size > 0) {
            applySelection();
            return;
          }
          if (filtered.length === 1) {
            const idx = Number(filtered[0]?.idx);
            if (!Number.isInteger(idx)) return;
            if (selected.has(idx)) selected.delete(idx);
            else selected.add(idx);
            render();
          }
          return;
        }
        if (filtered.length !== 1) return;
        const idx = Number(filtered[0]?.idx);
        if (!Number.isInteger(idx)) return;
        close();
        done(idx);
      }
    };
    const onApply = () => applySelection();
    const onOutside = e => {
      if (popInner && !popInner.contains(e.target)) {
        close();
      }
    };

    box.addEventListener('click', onBtn);
    cls.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);
    applyBtn.addEventListener('click', onApply);
    searchEl.addEventListener('input', onSearch);
    searchEl.addEventListener('keydown', onSearchKeydown);
    pop.addEventListener('click', onOutside);
  }

  function openCustomPopup(arg1, arg2) {
    let existing = null;
    let callback = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof arg1 === 'object' && arg1) {
      existing = arg1;
    }
    if (typeof callback !== 'function') callback = () => {};

    const root = getToolbarRoot();
    if (!root) return;
    cleanupInventoryHubSections('customPopup');
    const hub = openInventoryItemsHub('custom-item', { focusSection: 'custom-item' });
    const section = root.getElementById('customPopup');
    const popInner = section ? section.querySelector('.popup-inner') : null;
    const title  = root.getElementById('customTitle');
    const name   = root.getElementById('customName');
    const typeSel= root.getElementById('customType');
    const typeAdd= root.getElementById('customTypeAdd');
    const typeTags = root.getElementById('customTypeTags');
    const wIn    = root.getElementById('customWeight');
    const effBox = root.getElementById('customArtifactEffect');
    const effSel = effBox ? effBox.querySelector('select') : null;
    const weaponBox = root.getElementById('customWeaponFields');
    const vehicleBox = root.getElementById('customVehicleFields');
    const armorBox  = root.getElementById('customArmorFields');
    const levelBox = root.getElementById('customLevelFields');
    const lvlNovis = root.getElementById('customLevelNovis');
    const lvlGes   = root.getElementById('customLevelGesall');
    const lvlMas   = root.getElementById('customLevelMastare');
    const lvlMode  = root.getElementById('customLevelMode');
    const powerBox = root.getElementById('customPowerFields');
    const powerList = root.getElementById('customPowerList');
    const powerAdd  = root.getElementById('customPowerAdd');
    const boundBox  = root.getElementById('customBoundFields');
    const boundSel  = root.getElementById('customBoundType');
    const boundLbl  = root.getElementById('customBoundLabel');
    const dmgIn  = root.getElementById('customDamage');
    const capIn  = root.getElementById('customCapacity');
    const protIn = root.getElementById('customProtection');
    const restIn = root.getElementById('customRestriction');
    const dIn    = root.getElementById('customDaler');
    const sIn    = root.getElementById('customSkilling');
    const oIn    = root.getElementById('customOrtegar');
    const desc   = root.getElementById('customDesc');
    const add    = root.getElementById('customAdd');
    const del    = root.getElementById('customDelete');
    const cancel = root.getElementById('customCancel');

    let originalDesc = '';

    // Hämta vapentyper och rustningssubtyper från DB (fallback till hårdkodade)
    const deriveSubtypes = () => {
      try {
        const db = window.DB || [];
        const wSet = new Set();
        const rSet = new Set();
        const skip = new Set(['artefakt','lägre artefakt','kuriositet','skatt','hemmagjort']);
        for (const e of db) {
          const typs = (e.taggar?.typ) || [];
          if (typs.includes('Vapen')) {
            for (const t of typs) {
              if (t === 'Vapen' || t === 'Sköld') continue;
              const key = typeof t === 'string' ? t.trim().toLowerCase() : '';
              if (!key || skip.has(key)) continue;
              wSet.add(t);
            }
          }
          if (typs.includes('Rustning')) {
            for (const t of typs) {
              if (t === 'Rustning') continue;
              const key = typeof t === 'string' ? t.trim().toLowerCase() : '';
              if (!key || skip.has(key)) continue;
              rSet.add(t);
            }
          }
        }
        return {
          weapon: Array.from(wSet),
          armor : Array.from(rSet)
        };
      } catch {
        return {
          weapon: ['Enhandsvapen','Korta vapen','Långa vapen','Tunga vapen','Obeväpnad attack','Projektilvapen','Belägringsvapen'],
          armor : ['Lätt Rustning','Medeltung Rustning','Tung Rustning']
        };
      }
    };
    const SUB = deriveSubtypes();

    const allTypes = Array.from(new Set([
      'Hemmagjort',
      ...EQUIP,
      ...SUB.weapon,
      ...SUB.armor
    ]));
    const equipOptions = allTypes
      .slice()
      .sort((a, b) => catName(a).localeCompare(catName(b)))
      .map(t => `<option value="${t}">${catName(t)}</option>`)
      .join('');
    typeSel.innerHTML = equipOptions;

    const selectedTypes = new Set(['Hemmagjort']);

    const ensureBaseTypes = (val) => {
      if (SUB.weapon.includes(val)) selectedTypes.add('Vapen');
      if (SUB.armor.includes(val)) selectedTypes.add('Rustning');
    };

    const addType = (raw) => {
      const val = String(raw || '').trim();
      if (!val) return;
      if (val === 'Hemmagjort') {
        selectedTypes.add('Hemmagjort');
        return;
      }
      ensureBaseTypes(val);
      selectedTypes.add(val);
    };

    const removeType = (raw) => {
      const val = String(raw || '').trim();
      if (!val || val === 'Hemmagjort') return;
      selectedTypes.delete(val);
    };

    const orderedTypes = () => {
      const arr = Array.from(selectedTypes).filter(Boolean);
      if (!arr.includes('Hemmagjort')) arr.unshift('Hemmagjort');
      const rest = arr.filter(t => t !== 'Hemmagjort');
      return ['Hemmagjort', ...rest];
    };

    const renderTypeTags = () => {
      if (!typeTags) return;
      const tags = orderedTypes().map(t => {
        const label = catName(t);
        if (t === 'Hemmagjort') {
          return `<span class="tag">${label}</span>`;
        }
        return `<span class="tag removable" data-type="${t}">${label} ✕</span>`;
      }).join('');
      typeTags.innerHTML = tags;
    };

    const hasType = t => orderedTypes().includes(t);
    const getLevelMode = () => {
      const val = lvlMode?.value || 'novis';
      return ['novis', 'gesall', 'mastare', 'triple'].includes(val) ? val : 'novis';
    };

    const toggleLevelField = (el, show) => {
      if (!el) return;
      el.style.display = show ? '' : 'none';
    };

    const applyLevelMode = () => {
      const mode = getLevelMode();
      const showNovis = mode === 'novis' || mode === 'triple';
      const showGes   = mode === 'gesall' || mode === 'triple';
      const showMas   = mode === 'mastare' || mode === 'triple';
      toggleLevelField(lvlNovis, showNovis);
      toggleLevelField(lvlGes, showGes);
      toggleLevelField(lvlMas, showMas);
    };

    const updateTypeFields = () => {
      const selected = orderedTypes();
      const hasArtifact = selected.includes('Artefakt');
      const hasWeapon = selected.includes('Vapen') || selected.includes('Sköld') || selected.includes('Pil/Lod') || selected.some(t => SUB.weapon.includes(t));
      const hasArmor = selected.includes('Rustning') || selected.some(t => SUB.armor.includes(t));
      const hasVehicle = selected.includes('F\u00e4rdmedel');
      const hasLevels = selected.includes('Elixir') || selected.includes('L\u00e4gre Artefakt') || selected.includes('F\u00e4lla');
      const hasPowers = selected.includes('Artefakt');
      const hasBound = selected.includes('L\u00e4gre Artefakt');
      if (effBox) effBox.style.display = hasArtifact ? '' : 'none';
      if (weaponBox) weaponBox.style.display = hasWeapon ? '' : 'none';
      if (vehicleBox) vehicleBox.style.display = hasVehicle ? '' : 'none';
      if (armorBox) armorBox.style.display = hasArmor ? '' : 'none';
      if (levelBox) {
        levelBox.style.display = hasLevels ? '' : 'none';
        if (hasLevels) applyLevelMode();
      }
      if (powerBox) powerBox.style.display = hasPowers ? '' : 'none';
      if (boundBox) {
        boundBox.style.display = hasBound ? '' : 'none';
        if (!hasBound) {
          if (boundSel) boundSel.value = '';
          if (boundLbl) boundLbl.value = '';
        }
      }
      renderTypeTags();
    };

    const resetFields = () => {
      name.value = '';
      wIn.value = '';
      if (wIn) {
        wIn.readOnly = false;
        wIn.title = '';
      }
      dIn.value = sIn.value = oIn.value = '';
      if (desc) {
        desc.value = '';
        delete desc.dataset.touched;
      }
      originalDesc = '';
      if (effSel) effSel.value = '';
      if (dmgIn) dmgIn.value = '';
      if (lvlNovis) lvlNovis.value = '';
      if (lvlGes)   lvlGes.value = '';
      if (lvlMas)   lvlMas.value = '';
      if (lvlMode) lvlMode.value = 'novis';
      if (powerList) powerList.innerHTML = '';
      if (capIn) capIn.value = '';
      if (protIn) protIn.value = '';
      if (restIn) restIn.value = '';
      if (boundSel) boundSel.value = '';
      if (boundLbl) boundLbl.value = '';
      selectedTypes.clear();
      selectedTypes.add('Hemmagjort');
      updateTypeFields();
      applyLevelMode();
      if (del) {
        del.style.display = 'none';
        del.disabled = true;
      }
    };

    resetFields();

    let isEditing = false;

    if (existing) {
      isEditing = true;
      if (title) title.textContent = 'Redigera föremål';
      add.textContent = 'Uppdatera';
      name.value = existing.namn || '';
      const price = existing.grundpris || {};
      dIn.value = price.daler ?? '';
      sIn.value = price.skilling ?? '';
      oIn.value = price['örtegar'] ?? '';
      wIn.value = existing.vikt ?? '';
      const legacyDesc = existing.beskrivning
        || existing.beskrivningHtml
        || existing.text
        || existing.description
        || '';
      if (desc) {
        desc.value = legacyDesc;
        desc.dataset.touched = '';
      }
      originalDesc = legacyDesc;
      if (effSel) effSel.value = existing.artifactEffect || '';
      if (Array.isArray(existing.taggar?.typ)) {
        existing.taggar.typ.forEach(t => addType(t));
      }
      if (existing.niv\u00e5er) {
        const keys = Object.keys(existing.niv\u00e5er || {});
        const std = ['Novis','Ges\u00e4ll','M\u00e4stare'];
        const recognized = keys.filter(k => std.includes(k));
        if (recognized.length) {
          if (lvlNovis) lvlNovis.value = existing.niv\u00e5er['Novis'] || '';
          if (lvlGes)   lvlGes.value   = existing.niv\u00e5er['Ges\u00e4ll'] || '';
          if (lvlMas)   lvlMas.value   = existing.niv\u00e5er['M\u00e4stare'] || '';
          if (lvlMode) {
            if (recognized.length === 1) {
              const key = recognized[0];
              if (key === 'Novis') lvlMode.value = 'novis';
              else if (key === 'Ges\u00e4ll') lvlMode.value = 'gesall';
              else if (key === 'M\u00e4stare') lvlMode.value = 'mastare';
            } else {
              lvlMode.value = 'triple';
            }
          }
          if (levelBox) levelBox.style.display = '';
          applyLevelMode();
        } else if (powerBox && powerList) {
          powerList.innerHTML = '';
          keys.forEach(k => {
            const row = document.createElement('div');
            row.className = 'power-row';
            row.innerHTML = `
              <input class=\"power-name\" placeholder=\"Förmågans namn\" value=\"${k.replace(/\"/g,'&quot;')}\">\n              <textarea class=\"power-desc auto-resize\" placeholder=\"Beskrivning\">${existing.niv\u00e5er[k] ? String(existing.niv\u00e5er[k]) : ''}</textarea>\n              <button class=\"char-btn danger power-del\" type=\"button\">✕</button>
            `;
            powerList.appendChild(row);
            const descField = row.querySelector('.power-desc');
            if (descField) window.autoResize?.(descField);
            row.querySelector('.power-del').addEventListener('click', ev => {
              ev.preventDefault();
              ev.stopPropagation();
              row.remove();
            });
          });
        powerBox.style.display = '';
      }
      }
      if (existing.stat) {
        if (dmgIn && existing.stat.skada !== undefined) dmgIn.value = existing.stat.skada;
        if (capIn && existing.stat['b\u00e4rkapacitet'] !== undefined) capIn.value = existing.stat['b\u00e4rkapacitet'];
        if (protIn && existing.stat.skydd !== undefined) protIn.value = existing.stat.skydd;
        if (restIn && existing.stat['begränsning'] !== undefined) {
          restIn.value = existing.stat['begränsning'];
        }
      }
      if (boundSel) boundSel.value = (existing.bound === 'kraft' || existing.bound === 'ritual') ? existing.bound : '';
      if (boundLbl) boundLbl.value = existing.boundLabel || '';
    } else {
      if (title) title.textContent = 'Nytt föremål';
      add.textContent = 'Spara';
      if (effSel) effSel.value = 'corruption';
    }

    updateTypeFields();
    if (lvlMode) lvlMode.addEventListener('change', applyLevelMode);

    const onAddType = e => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      addType(typeSel.value);
      updateTypeFields();
    };

    const onTagsClick = e => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const tag = e.target.closest('.tag.removable');
      if (!tag) return;
      const t = tag.dataset.type;
      removeType(t);
      updateTypeFields();
    };

    const cleanup = () => {
      add.removeEventListener('click', onAdd);
      if (del) del.removeEventListener('click', onDelete);
      cancel.removeEventListener('click', onCancel);
      if (typeAdd) typeAdd.removeEventListener('click', onAddType);
      if (typeTags) typeTags.removeEventListener('click', onTagsClick);
      if (powerAdd) powerAdd.removeEventListener('click', onAddPower);
      if (lvlMode) lvlMode.removeEventListener('change', applyLevelMode);
      if (desc) desc.removeEventListener('input', markDescTouched);
      if (section) section.__hubCleanup = null;
      resetFields();
      if (title) title.textContent = 'Nytt föremål';
      add.textContent = 'Spara';
      if (effBox) effBox.style.display = 'none';
      if (weaponBox) weaponBox.style.display = 'none';
      if (armorBox) armorBox.style.display = 'none';
    };

    const close = (result) => {
      cleanup();
      closeInventoryHub({ skipSection: 'customPopup' });
      callback(result);
    };

    const switchToCreateMode = () => {
      existing = null;
      isEditing = false;
      resetFields();
      if (title) title.textContent = 'Nytt föremål';
      add.textContent = 'Spara';
      if (effSel) effSel.value = 'corruption';
      if (del) {
        del.style.display = 'none';
        del.disabled = true;
      }
      updateTypeFields();
      requestAnimationFrame(() => name?.focus());
    };

    const onAdd = () => {
      const nameVal = name.value.trim();
      const types = orderedTypes();
      const hasWeapon = types.includes('Vapen') || types.includes('Sköld') || types.includes('Pil/Lod') || types.some(t => SUB.weapon.includes(t));
      const hasArmor = types.includes('Rustning') || types.some(t => SUB.armor.includes(t));
      const hasVehicle = types.includes('F\u00e4rdmedel');
      const hasBound = types.includes('L\u00e4gre Artefakt');
      const entry = {
        id: existing?.id || (storeHelper.genId ? storeHelper.genId() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
        namn: nameVal,
        taggar: { typ: types },
        grundpris: {
          daler: Math.max(0, Number(dIn.value) || 0),
          skilling: Math.max(0, Number(sIn.value) || 0),
          'örtegar': Math.max(0, Number(oIn.value) || 0)
        },
        beskrivning: '',
        artifactEffect: (effSel && types.includes('Artefakt')) ? effSel.value : ''
      };
      const rawDesc = desc ? desc.value : '';
      const trimmedDesc = rawDesc.trim();
      const keepLegacyDesc = Boolean(isEditing && originalDesc && (!desc || !desc.dataset.touched) && !trimmedDesc);
      entry.beskrivning = keepLegacyDesc ? originalDesc : trimmedDesc;
      entry.vikt = Math.max(0, Number(wIn.value) || 0);
      const stat = {};
      if (hasWeapon && dmgIn) {
        const dmgVal = dmgIn.value.trim();
        if (dmgVal) stat.skada = dmgVal;
      }
      if (hasVehicle && capIn) {
        const capVal = Number(capIn.value);
        if (Number.isFinite(capVal) && capVal > 0) stat['b\u00e4rkapacitet'] = Math.floor(capVal);
      }
      if (hasArmor && protIn) {
        const protVal = protIn.value.trim();
        if (protVal) stat.skydd = protVal;
      }
      if (restIn && restIn.value !== '') {
        const restVal = Number(restIn.value);
        if (Number.isFinite(restVal)) stat['begränsning'] = restVal;
      }
      if (Object.keys(stat).length) entry.stat = stat;

      // Spara nivåer om angivna
      const niv = {};
      if (levelBox && levelBox.style.display !== 'none') {
        const mode = getLevelMode();
        const novisTxt = (lvlNovis?.value || '').trim();
        const gesTxt   = (lvlGes?.value   || '').trim();
        const masTxt   = (lvlMas?.value   || '').trim();
        if (mode === 'triple') {
          if (novisTxt) niv['Novis'] = novisTxt;
          if (gesTxt)   niv['Ges\u00e4ll'] = gesTxt;
          if (masTxt)   niv['M\u00e4stare'] = masTxt;
        } else if (mode === 'novis') {
          if (novisTxt) niv['Novis'] = novisTxt;
        } else if (mode === 'gesall') {
          if (gesTxt) niv['Ges\u00e4ll'] = gesTxt;
        } else if (mode === 'mastare') {
          if (masTxt) niv['M\u00e4stare'] = masTxt;
        }
      }
      if (powerBox && powerBox.style.display !== 'none' && powerList) {
        [...powerList.querySelectorAll('.power-row')].forEach(r => {
          const nm = r.querySelector('.power-name')?.value?.trim();
          const ds = r.querySelector('.power-desc')?.value?.trim();
          if (nm && ds) niv[nm] = ds;
        });
      }
      if (Object.keys(niv).length) entry.nivåer = niv; else delete entry.nivåer;

      if (hasBound && boundSel) {
        const boundType = boundSel.value === 'kraft' || boundSel.value === 'ritual' ? boundSel.value : '';
        if (boundType) {
          entry.bound = boundType;
          const rawLabel = (boundLbl?.value || '').trim();
          entry.boundLabel = rawLabel || (boundType === 'kraft' ? 'Formel' : 'Ritual');
        }
      }

      callback(entry);
      if (isEditing) {
        existing = entry;
        originalDesc = entry.beskrivning || '';
      } else {
        switchToCreateMode();
      }
    };

    const onCancel = () => {
      close(null);
    };

    const onDelete = () => {
      if (!isEditing) {
        close(null);
        return;
      }
      const payload = {
        __delete: true,
        id: existing?.id || '',
        namn: existing?.namn || ''
      };
      callback(payload);
      switchToCreateMode();
    };

    window.autoResizeAll?.(section || hub);
    if (popInner) {
      popInner.scrollTop = 0;
    }
    const markDescTouched = () => {
      if (desc) desc.dataset.touched = '1';
    };
    if (desc) desc.addEventListener('input', markDescTouched);
    if (typeAdd) typeAdd.addEventListener('click', onAddType);
    if (typeTags) typeTags.addEventListener('click', onTagsClick);
    add.addEventListener('click', onAdd);
    if (del) {
      if (isEditing) {
        del.style.display = '';
        del.disabled = false;
        del.addEventListener('click', onDelete);
      } else {
        del.style.display = 'none';
        del.disabled = true;
      }
    }
    cancel.addEventListener('click', onCancel);
    const onAddPower = e => {
      e?.preventDefault();
      const row = document.createElement('div');
      row.className = 'power-row';
      row.innerHTML = `
        <input class="power-name" placeholder="Förmågans namn">
        <textarea class="power-desc auto-resize" placeholder="Beskrivning"></textarea>
        <button class="char-btn danger power-del" type="button">✕</button>
      `;
      powerList.appendChild(row);
      const descField = row.querySelector('.power-desc');
      if (descField) window.autoResize?.(descField);
      row.querySelector('.power-del').addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        row.remove();
      });
    };
    if (powerAdd) powerAdd.addEventListener('click', onAddPower);
    if (section) {
      section.__hubCleanup = () => {
        cleanup();
        callback(null);
      };
    }
  }

  function openMoneyPopup() {
    const root = getToolbarRoot();
    if (!root) return;
    cleanupInventoryHubSections('moneyPopup');
    openInventoryEconomyHub('money', { focusSection: 'money' });
    const section = root.getElementById('moneyPopup');
    const balDIn = root.getElementById('moneyBalanceDaler');
    const balSIn = root.getElementById('moneyBalanceSkilling');
    const balOIn = root.getElementById('moneyBalanceOrtegar');
    const setBtn= root.getElementById('moneySetBtn');
    const addBtn= root.getElementById('moneyAddBtn');
    const cancel = root.getElementById('moneyCancel');
    const statusEl = root.getElementById('moneyStatus');

    // Fälten ska börja tomma oavsett aktuell summa pengar
    [balDIn, balSIn, balOIn].forEach(input => { if (input) input.value = ''; });
    const sectionInner = section?.querySelector('.popup-inner');
    if (sectionInner) {
      sectionInner.scrollTop = 0;
    }

    const updateStatus = () => {
      if (!statusEl || typeof formatMoney !== 'function') return;
      const cash = storeHelper.normalizeMoney(storeHelper.getMoney(store));
      const allInv = storeHelper.getInventory(store) || [];
      const flat = flattenInventory(allInv);
      const levels = getCraftLevels();
      const totalCostO = flat.reduce((sum, row) => sum + calcRowCostOWithLevels(row, levels), 0);
      const totalMoney = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));
      const diffO = moneyToO(totalMoney) - totalCostO;
      const diff = oToMoney(Math.abs(diffO));
      const diffText = `${diffO < 0 ? '-' : ''}${formatMoney(diff)}`;
      statusEl.textContent = `Kontant: ${formatMoney(cash)} · Oanvänt: ${diffText}`;
    };

    const clearBalanceInputs = ({ focus = false } = {}) => {
      [balDIn, balSIn, balOIn].forEach(input => { if (input) input.value = ''; });
      if (focus && typeof balDIn?.focus === 'function') {
        balDIn.focus();
      }
    };

    updateStatus();

    const cleanup = () => {
      setBtn.removeEventListener('click', onSet);
      addBtn.removeEventListener('click', onAdd);
      cancel.removeEventListener('click', onCancel);
      clearBalanceInputs();
      if (statusEl) statusEl.textContent = '';
      if (section) section.__hubCleanup = null;
    };
    const close = () => {
      cleanup();
      closeInventoryHub({ skipSection: 'moneyPopup' });
    };
    const getBalanceMoney = () => storeHelper.normalizeMoney({
      daler: Number(balDIn?.value) || 0,
      skilling: Number(balSIn?.value) || 0,
      'örtegar': Number(balOIn?.value) || 0
    });
    const maybeAdv = fn => {
      const priv = storeHelper.getPrivMoney(store);
      const pos  = storeHelper.getPossessionMoney(store);
      const hasAdv = priv.daler || priv.skilling || priv['örtegar'] || pos.daler || pos.skilling || pos['örtegar'];
      if (hasAdv) {
        openAdvMoneyPopup(() => {
          storeHelper.setPrivMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          fn();
          updateStatus();
        });
      } else {
        fn();
        updateStatus();
      }
    };
    const onSet = () => {
      const money = getBalanceMoney();
      maybeAdv(() => {
        storeHelper.setMoney(store, money);
        renderInventory();
        clearBalanceInputs({ focus: true });
      });
    };
    const onAdd = () => {
      const addMoney = getBalanceMoney();
      const curMoney = storeHelper.getMoney(store);
      const total = storeHelper.normalizeMoney({
        daler: curMoney.daler + addMoney.daler,
        skilling: curMoney.skilling + addMoney.skilling,
        'örtegar': curMoney['örtegar'] + addMoney['örtegar']
      });
      maybeAdv(() => {
        storeHelper.setMoney(store, total);
        renderInventory();
        clearBalanceInputs({ focus: true });
      });
    };
    const onCancel = () => { close(); };
    setBtn.addEventListener('click', onSet);
    addBtn.addEventListener('click', onAdd);
    cancel.addEventListener('click', onCancel);
    if (section) section.__hubCleanup = cleanup;
  }

  function removeCustomEntryFromInventory(arr, targetId, targetName) {
    if (!Array.isArray(arr)) return false;
    let changed = false;
    for (let i = arr.length - 1; i >= 0; i--) {
      const row = arr[i];
      if (!row || typeof row !== 'object') continue;
      const nestedChanged = removeCustomEntryFromInventory(row.contains, targetId, targetName);
      if (nestedChanged && Array.isArray(row.contains) && !row.contains.length) {
        delete row.contains;
      }
      const rowId = row.id ?? row.i;
      const rowName = row.name ?? row.n ?? row.namn;
      const idMatch = targetId != null && rowId === targetId;
      const nameMatch = targetName ? rowName === targetName : false;
      if (idMatch || nameMatch) {
        arr.splice(i, 1);
        changed = true;
        continue;
      }
      if (nestedChanged) changed = true;
    }
    return changed;
  }

  function editCustomEntry(entry, onSave) {
    if (!entry || !(entry.taggar?.typ || []).includes('Hemmagjort')) return false;
    if (!getToolbarRoot()) return false;
    const customs = storeHelper.getCustomEntries(store);
    const original = (entry.id && customs.find(c => c.id === entry.id))
      || customs.find(c => c.namn === entry.namn);
    if (!original) return false;
    const originalId = original.id;
    openCustomPopup({ ...original }, updated => {
      if (!updated) return;
      const list = storeHelper.getCustomEntries(store);
      const idx = list.findIndex(c => c.id === originalId || (!originalId && c.namn === original.namn));
      if (idx < 0) return;
      if (updated.__delete) {
        list.splice(idx, 1);
        storeHelper.setCustomEntries(store, list);
        const inv = storeHelper.getInventory(store);
        const removed = removeCustomEntryFromInventory(inv, originalId, original.namn);
        if (removed) {
          saveInventory(inv);
        } else {
          renderInventory();
        }
        if (typeof onSave === 'function') onSave();
        return;
      }
      const merged = { ...list[idx], ...updated };
      merged.id = merged.id || list[idx].id;
      list[idx] = merged;
      storeHelper.setCustomEntries(store, list);
      if (typeof onSave === 'function') onSave();
    });
    return true;
  }

  async function editArtifactEntry(entry, opts, onSave) {
    if (!entry) return false;
    const options = opts && typeof opts === 'object' ? opts : {};
    const trait = options.trait ?? null;
    const inv = storeHelper.getInventory(store);
    const flat = flattenInventoryWithPath(inv);
    const entryId = entry.id;
    const entryName = entry.namn || entry.name || '';
    const matches = flat.filter(({ row }) => {
      if (!row) return false;
      const idMatch = entryId !== undefined && entryId !== null
        ? row.id === entryId
        : row.name === entryName;
      if (!idMatch) return false;
      if (trait != null) return row.trait === trait;
      return true;
    });
    if (!matches.length) return false;
    let target = matches[0];
    if (trait == null && matches.length > 1) {
      const withoutTrait = matches.find(({ row }) => row && !row.trait);
      if (withoutTrait) target = withoutTrait;
    }
    const choice = await pickInventoryEntryChoice({
      entry,
      row: target.row,
      list: storeHelper.getCurrentList(store),
      inv,
      field: 'artifactEffect',
      currentValue: target.row.artifactEffect || '',
      usedValues: []
    });
    if (choice.hasChoice) {
      if (choice.cancelled) return true;
      target.row.artifactEffect = choice.value || '';
    } else {
      return true;
    }
    saveInventory(inv);
    renderInventory();
    if (typeof onSave === 'function') onSave();
    return true;
  }

  function openQtyPopup() {
    const root = getToolbarRoot();
    if (!root) return;
    cleanupInventoryHubSections('qtyPopup');
    openInventoryItemsHub('bulk-qty', { focusSection: 'bulk-qty' });
    const section = root.getElementById('qtyPopup');
    const inEl  = root.getElementById('qtyInput');
    const list  = root.getElementById('qtyItemList');
    const apply = root.getElementById('qtyApply');
    const cancel= root.getElementById('qtyCancel');

    inEl.value = '';
    const inv = storeHelper.getInventory(store);
    const charCarry = getCharacterCarrySummary(inv);
    const { vehicles, flat, nameMap, vehicleNames, vehicleIndexes } = getInventoryVehicleContext(inv);
    const regular = flat.filter(obj => !(vehicleIndexes.includes(obj.path[0]) && obj.path.length > 1));
    const sections = [];
    if (regular.length) {
      const regularHtml = regular
        .map(obj => buildInventoryBatchCheckboxRow(nameMap.get(obj.row), obj.path.join('.')))
        .join('');
      sections.push(buildInventoryBatchGroup({
        title: 'Huvudinventarie',
        metaText: formatBatchCapacityText(charCarry.usedWeight, charCarry.maxCapacity),
        icon: '🎒',
        count: regular.length,
        itemsHtml: regularHtml
      }));
    }
    vehicles.forEach(vehicle => {
      const items = flattenInventoryWithPath(vehicle.row.contains || [], [vehicle.idx]);
      if (!items.length) return;
      const vehicleCarry = getVehicleCarrySummary(vehicle.row);
      const itemsHtml = items
        .map(item => buildInventoryBatchCheckboxRow(nameMap.get(item.row), item.path.join('.')))
        .join('');
      sections.push(buildInventoryBatchGroup({
        title: 'Färdmedel',
        subtitle: vehicleNames.get(vehicle.idx),
        metaText: formatBatchCapacityText(vehicleCarry.usedWeight, vehicleCarry.maxCapacity),
        icon: VEHICLE_EMOJI[vehicle.entry?.namn] || '🛞',
        count: items.length,
        itemsHtml
      }));
    });
    list.innerHTML = sections.join('') || '<p class="inventory-batch-empty">Det finns inga poster att mängdköpa just nu.</p>';
    const sectionInner = section?.querySelector('.popup-inner');
    if (sectionInner) {
      sectionInner.scrollTop = 0;
    }

    const cleanup = () => {
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      list.innerHTML = '';
      inEl.value = '';
      if (section) section.__hubCleanup = null;
    };
    const close = () => {
      cleanup();
      closeInventoryHub({ skipSection: 'qtyPopup' });
    };
    const onApply = () => {
      const qty = parseInt(inEl.value, 10);
      if (!qty || qty <= 0) return;
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-path]:checked')]
        .map(ch => ch.dataset.path.split('.').map(Number));
      if (!checks.length) return;
      const liveEnabled = typeof storeHelper?.getLiveMode === 'function' && storeHelper.getLiveMode(store);
      const livePairs = liveEnabled ? [] : null;
      checks.forEach(path => {
        let parentArr = inv;
        let row = null;
        path.forEach((pIdx, i) => {
          row = parentArr[pIdx];
          if (i < path.length - 1) parentArr = row.contains || [];
        });
        if (!row) return;
        const entry = getEntry(row.id || row.name);
        const indiv = isIndividualItem(entry);

        if (indiv) {
          for (let i = 0; i < qty; i++) {
            const clone = JSON.parse(JSON.stringify(row));
            clone.qty = 1;
            parentArr.push(clone);
            if (livePairs) livePairs.push({ prev: null, next: clone });
          }
        } else {
          const prevState = livePairs ? cloneRow(row) : null;
          row.qty += qty;
          if (livePairs) livePairs.push({ prev: prevState, next: row });
        }
      });

      if (livePairs && livePairs.length) applyLiveModePayment(livePairs);
      saveInventory(inv);
      renderInventory();
      cleanup();
      openQtyPopup();
    };
    const onCancel = () => { close(); };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    if (section) section.__hubCleanup = cleanup;
  }

  async function buildInventoryRow({ entry, list } = {}) {
    if (!entry) return null;
    const row = { id: entry.id, name: entry.namn, qty: 1, gratis: 0, gratisKval: [], removedKval: [] };
    const tagTyp = entry.taggar?.typ || [];
    const curList = Array.isArray(list) ? list : storeHelper.getCurrentList(store);
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const requirementCheck = checkLowerArtifactKraver(entry, curList);
      const moneyMult = normalizeMultiplierValue(requirementCheck.moneyMultiplier, 1);
      if (!requirementCheck.ok) {
        const bullets = [];
        (Array.isArray(requirementCheck.explicitMessages) ? requirementCheck.explicitMessages : [])
          .map(msg => String(msg || '').trim())
          .filter(Boolean)
          .forEach(msg => bullets.push(`- ${msg}`));
        if (!bullets.length) bullets.push('- Krav: Förkunskaper saknas');
        const requirementBlock = bullets.length
          ? `Krav:\n${bullets.join('\n')}\n\n`
          : '';
        const msg = `${entry.namn}: kraven uppfylls inte.\n\n${requirementBlock}Priset \u00e4r f\u00f6rh\u00f6jt (\u00d7${formatMultiplierLabel(moneyMult)}) och ut\u00f6vare av traditionen kan ta illa vid sig.\nL\u00e4gg till \u00e4nd\u00e5?`;
        if (typeof openDialog === 'function') {
          const ok = await openDialog(msg, { cancel: true, cancelText: 'Nej!', okText: 'Ja!' });
          if (!ok) return null;
        } else {
          return null;
        }
      }
      if (Math.abs(moneyMult - 1) > 0.001) row.priceMult = moneyMult;
    }
    if (tagTyp.includes('Artefakt')) {
      const choice = await pickInventoryEntryChoice({
        entry,
        list: curList,
        inv: storeHelper.getInventory(store),
        field: 'artifactEffect',
        currentValue: entry.artifactEffect || '',
        usedValues: []
      });
      if (choice.hasChoice) {
        if (choice.cancelled) return null;
        row.artifactEffect = choice.value || '';
      } else if (entry.artifactEffect) {
        row.artifactEffect = entry.artifactEffect;
      }
    } else if (entry.artifactEffect) {
      row.artifactEffect = entry.artifactEffect;
    }
    return row;
  }

  function openLiveBuyPopup(entry, existingRow) {
    const root = getToolbarRoot();
    if (!root) return null;
    const pop    = root.getElementById('liveBuyPopup');
    const inner  = pop ? pop.querySelector('.popup-inner') : null;
    const nameEl = root.getElementById('liveBuyItemName');
    const qtyEl  = root.getElementById('liveBuyQty');
    const dEl    = root.getElementById('liveBuyPriceDaler');
    const sEl    = root.getElementById('liveBuyPriceSkilling');
    const oEl    = root.getElementById('liveBuyPriceOrtegar');
    const confirm= root.getElementById('liveBuyConfirm');
    const cancel = root.getElementById('liveBuyCancel');
    if (!pop || !qtyEl || !dEl || !sEl || !oEl || !confirm || !cancel) return null;

    const resolveName = () => {
      if (existingRow?.name) return existingRow.name;
      if (entry?.namn) return entry.namn;
      if (entry?.name) return entry.name;
      return '';
    };

    const defaultPrice = () => {
      const src = (existingRow?.basePriceSource || '').toLowerCase();
      if (existingRow?.basePrice && src === 'live') {
        return storeHelper.normalizeMoney(existingRow.basePrice);
      }
      const baseCost = entry ? calcEntryCost(entry) : { daler: 0, skilling: 0, 'örtegar': 0 };
      const mult = normalizeMultiplierValue(existingRow?.priceMult, 1);
      if (Math.abs(mult - 1) < 0.001) {
        return storeHelper.normalizeMoney(baseCost);
      }
      const totalO = Math.max(0, moneyToO(baseCost) * mult);
      return storeHelper.normalizeMoney(oToMoney(totalO));
    };

    const fillPriceFields = money => {
      dEl.value = money.daler ? String(money.daler) : '';
      sEl.value = money.skilling ? String(money.skilling) : '';
      oEl.value = money['örtegar'] ? String(money['örtegar']) : '';
    };

    qtyEl.value = '1';
    fillPriceFields(defaultPrice());
    const label = resolveName();
    if (nameEl) {
      if (label) {
        nameEl.textContent = label;
        nameEl.hidden = false;
      } else {
        nameEl.hidden = true;
        nameEl.textContent = '';
      }
    }

    pop.classList.add('open');
    if (inner) inner.scrollTop = 0;
    setTimeout(() => qtyEl.focus(), 50);

    return new Promise(resolve => {
      let closed = false;
      const cleanup = () => {
        confirm.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
        pop.removeEventListener('click', onOutside);
        qtyEl.removeEventListener('keydown', onKey);
        dEl.removeEventListener('keydown', onKey);
        sEl.removeEventListener('keydown', onKey);
        oEl.removeEventListener('keydown', onKey);
      };
      const close = result => {
        if (closed) return;
        closed = true;
        cleanup();
        qtyEl.value = '';
        dEl.value = '';
        sEl.value = '';
        oEl.value = '';
        if (nameEl) {
          nameEl.textContent = '';
          nameEl.hidden = true;
        }
        pop.classList.remove('open');
        resolve(result);
      };

      const parseMoney = () => {
        const daler = parseInt(dEl.value, 10) || 0;
        const skilling = parseInt(sEl.value, 10) || 0;
        const ort = parseInt(oEl.value, 10) || 0;
        return storeHelper.normalizeMoney({ daler, skilling, 'örtegar': ort });
      };

      const onConfirm = e => {
        e?.preventDefault();
        const qty = parseInt(qtyEl.value, 10);
        if (!Number.isFinite(qty) || qty <= 0) {
          qtyEl.focus();
          return;
        }
        const pricePerUnit = parseMoney();
        const pricePerUnitO = Math.max(0, moneyToO(pricePerUnit));
        const totalO = pricePerUnitO * qty;
        close({ qty, pricePerUnit, pricePerUnitO, totalO });
      };
      const onCancel = e => {
        e?.preventDefault();
        close(null);
      };
      const onOutside = e => {
        if (!inner || inner.contains(e.target)) return;
        close(null);
      };
      const onKey = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm(e);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel(e);
        }
      };

      confirm.addEventListener('click', onConfirm);
      cancel.addEventListener('click', onCancel);
      pop.addEventListener('click', onOutside);
      qtyEl.addEventListener('keydown', onKey);
      dEl.addEventListener('keydown', onKey);
      sEl.addEventListener('keydown', onKey);
      oEl.addEventListener('keydown', onKey);
    });
  }

  async function openBuyMultiplePopup({ row, entry, inv, li, parentArr, idx, onCancel: cancelCb, onConfirm: confirmCb, isNewRow = false }) {
    const liveEnabled = typeof storeHelper?.getLiveMode === 'function' && storeHelper.getLiveMode(store);
    const tagTyp = entry.taggar?.typ || [];
    const indiv = isIndividualItem(entry);

    const referenceId = row.id || entry?.id || null;
    const referenceName = row.name || entry?.namn || null;
    const isSameItem = other => {
      if (!other) return false;
      if (referenceId && other.id) {
        return other.id === referenceId;
      }
      if (referenceName && other.name) {
        return other.name === referenceName;
      }
      return other === row;
    };

    const processQty = ({ qty, purchase, mode = 'add' }) => {
      const remove = mode === 'remove';
      const result = { qty, highlightIdx: idx, indiv, isNewRow, mode };
      const livePairs = !remove && liveEnabled ? [] : null;
      const overrideO = !remove && purchase ? purchase.totalO : null;
      const priceMoney = !remove && purchase ? purchase.pricePerUnit : null;
      const assignPrice = target => {
        if (!priceMoney || !target) return;
        target.basePrice = { daler: priceMoney.daler, skilling: priceMoney.skilling, 'örtegar': priceMoney['örtegar'] };
        target.basePriceSource = 'live';
      };

      if (remove) {
        if (indiv && parentArr) {
          const matching = parentArr
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => isSameItem(item));
          const removeCount = Math.min(qty, matching.length);
          const removeTargets = matching.slice(-removeCount).map(obj => obj.index).sort((a, b) => b - a);
          removeTargets.forEach(i => parentArr.splice(i, 1));
          const remaining = parentArr
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => isSameItem(item));
          if (remaining.length) {
            result.highlightIdx = remaining[remaining.length - 1].index;
          } else if (parentArr.length) {
            const fallbackIdx = Math.min(idx, parentArr.length - 1);
            result.highlightIdx = fallbackIdx >= 0 ? fallbackIdx : null;
          } else {
            result.highlightIdx = null;
          }
        } else {
          const currentQty = Number(row.qty) || 0;
          const newQty = currentQty - qty;
          if (newQty > 0) {
            row.qty = newQty;
            if (parentArr) {
              const indexInParent = parentArr.indexOf(row);
              if (indexInParent >= 0) result.highlightIdx = indexInParent;
            }
          } else {
            if (parentArr) {
              const indexInParent = parentArr.indexOf(row);
              if (indexInParent >= 0) {
                parentArr.splice(indexInParent, 1);
                const fallbackIdx = Math.min(indexInParent, parentArr.length - 1);
                result.highlightIdx = fallbackIdx >= 0 ? fallbackIdx : null;
              } else {
                result.highlightIdx = null;
              }
            } else {
              row.qty = 0;
              result.highlightIdx = null;
            }
          }
        }
      } else if (indiv && parentArr) {
        if (isNewRow) {
          let baseIndex = parentArr.indexOf(row);
          if (baseIndex < 0) {
            parentArr.push(row);
            baseIndex = parentArr.length - 1;
          }
          if (qty >= 1) {
            row.qty = 1;
            if (priceMoney) assignPrice(row);
            if (livePairs) livePairs.push({ prev: null, next: row });
          }
          result.highlightIdx = baseIndex;
          for (let i = 1; i < qty; i++) {
            const clone = JSON.parse(JSON.stringify(row));
            clone.qty = 1;
            if (priceMoney) assignPrice(clone);
            parentArr.push(clone);
            result.highlightIdx = parentArr.length - 1;
            if (livePairs) livePairs.push({ prev: null, next: clone });
          }
        } else {
          for (let i = 0; i < qty; i++) {
            const clone = JSON.parse(JSON.stringify(row));
            clone.qty = 1;
            if (priceMoney) assignPrice(clone);
            parentArr.push(clone);
            if (livePairs) livePairs.push({ prev: null, next: clone });
          }
          result.highlightIdx = parentArr.length - 1;
        }
      } else {
        if (isNewRow) {
          row.qty = qty;
          if (priceMoney) assignPrice(row);
          if (parentArr) result.highlightIdx = parentArr.indexOf(row);
          if (livePairs) livePairs.push({ prev: null, next: row });
        } else {
          const prevState = livePairs ? cloneRow(row) : null;
          row.qty = (Number(row.qty) || 0) + qty;
          if (priceMoney) assignPrice(row);
          if (livePairs) livePairs.push({ prev: prevState, next: row });
        }
      }

      if (livePairs && livePairs.length) {
        applyLiveModePayment(livePairs, overrideO != null ? { overrideO } : undefined);
      }
      saveInventory(inv);
      renderInventory();
      if (typeof confirmCb === 'function') {
        confirmCb(result);
      }
      const parentIdx = Number(li?.dataset.parent);
      const baseName = row.name || entry?.namn || '';
      const flashIdx = typeof result.highlightIdx === 'number' && result.highlightIdx >= 0
        ? result.highlightIdx
        : null;
      if (li && baseName && flashIdx != null) {
        const selector = !Number.isNaN(parentIdx)
          ? `li[data-name="${CSS.escape(baseName)}"][data-parent="${parentIdx}"][data-child="${flashIdx}"]`
          : `li[data-name="${CSS.escape(baseName)}"][data-idx="${flashIdx}"]`;
        const flashEl = dom.invList?.querySelector(selector);
        if (flashEl) {
          flashEl.classList.add('inv-flash');
          setTimeout(() => flashEl.classList.remove('inv-flash'), 600);
        }
      }
    };

    if (liveEnabled) {
      const purchase = await openLiveBuyPopup(entry, row);
      if (!purchase) {
        if (typeof cancelCb === 'function') cancelCb();
        return;
      }
      processQty({ qty: purchase.qty, purchase });
      return;
    }

    const root = getToolbarRoot();
    if (!root) return;
    const pop       = root.getElementById('buyMultiplePopup');
    const inner     = pop ? pop.querySelector('.popup-inner') : null;
    const labelEl   = root.getElementById('buyMultipleItemName');
    const input     = root.getElementById('buyMultipleInput');
    const confirm   = root.getElementById('buyMultipleConfirm');
    const cancelBtn = root.getElementById('buyMultipleCancel');
    const removeBtn = root.getElementById('buyMultipleRemove');
    if (!pop || !input || !confirm || !cancelBtn || !removeBtn) return;

    const nameMap = makeNameMap(flattenInventory(inv));
    const displayName = nameMap.get(row) || row.name || entry?.namn || '';
    if (labelEl) {
      labelEl.textContent = displayName;
      labelEl.hidden = !displayName;
    }

    const getAvailableQty = () => {
      if (indiv && parentArr) {
        return parentArr.reduce((count, item) => count + (isSameItem(item) ? 1 : 0), 0);
      }
      const current = Number(row.qty) || 0;
      return current > 0 ? current : 0;
    };

    const clearInputValidity = () => {
      if (typeof input.setCustomValidity === 'function') {
        input.setCustomValidity('');
      }
    };

    input.value = '';
    clearInputValidity();
    pop.classList.add('open');
    if (inner) inner.scrollTop = 0;
    setTimeout(() => input.focus(), 50);

    let closed = false;
    const close = (reason = 'cancel') => {
      if (closed) return;
      closed = true;
      pop.classList.remove('open');
      confirm.removeEventListener('click', apply);
      cancelBtn.removeEventListener('click', handleCancel);
      removeBtn.removeEventListener('click', handleRemove);
      pop.removeEventListener('click', onOutside);
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('input', onInput);
      input.value = '';
      clearInputValidity();
      if (reason !== 'confirm' && typeof cancelCb === 'function') {
        cancelCb();
      }
    };

    const apply = () => {
      clearInputValidity();
      const qty = parseInt(input.value, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        input.focus();
        return;
      }
      processQty({ qty });
      close('confirm');
    };

    const handleRemove = () => {
      clearInputValidity();
      const qty = parseInt(input.value, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        input.focus();
        return;
      }
      const available = getAvailableQty();
      if (qty > available) {
        if (typeof input.setCustomValidity === 'function') {
          const message = available <= 0
            ? 'Det finns inget att ta bort.'
            : `Du kan som mest ta bort ${available}.`;
          input.setCustomValidity(message);
          input.reportValidity();
        }
        input.focus();
        if (typeof input.select === 'function') input.select();
        return;
      }
      processQty({ qty, mode: 'remove' });
      close('confirm');
    };

    const onOutside = e => {
      if (!inner || inner.contains(e.target)) return;
      close('cancel');
    };

    const onKey = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close('cancel');
      }
    };

    const onInput = () => clearInputValidity();

    confirm.addEventListener('click', apply);
    const handleCancel = () => close('cancel');
    cancelBtn.addEventListener('click', handleCancel);
    removeBtn.addEventListener('click', handleRemove);
    pop.addEventListener('click', onOutside);
    input.addEventListener('keydown', onKey);
    input.addEventListener('input', onInput);
  }

  function openPricePopup() {
    const root    = getToolbarRoot();
    if (!root) return;
    cleanupInventoryHubSections('pricePopup');
    openInventoryEconomyHub('bulk-price', { focusSection: 'bulk-price' });
    const section = root.getElementById('pricePopup');
    const inEl   = root.getElementById('priceFactor');
    const list   = root.getElementById('priceItemList');
    const apply  = root.getElementById('priceApply');
    const cancel = root.getElementById('priceCancel');

    inEl.value = '';
    const inv = storeHelper.getInventory(store);
    const charCarry = getCharacterCarrySummary(inv);
    const { vehicles, flat, nameMap, vehicleNames, vehicleIndexes } = getInventoryVehicleContext(inv);
    const regular = flat.filter(obj => !(vehicleIndexes.includes(obj.path[0]) && obj.path.length > 1));
    const sections = [];
    if (regular.length) {
      const regularHtml = regular
        .map(obj => buildInventoryBatchCheckboxRow(nameMap.get(obj.row), obj.path.join('.')))
        .join('');
      sections.push(buildInventoryBatchGroup({
        title: 'Huvudinventarie',
        metaText: formatBatchCapacityText(charCarry.usedWeight, charCarry.maxCapacity),
        icon: '🎒',
        count: regular.length,
        itemsHtml: regularHtml
      }));
    }
    vehicles.forEach(vehicle => {
      const items = flattenInventoryWithPath(vehicle.row.contains || [], [vehicle.idx]);
      if (!items.length) return;
      const vehicleCarry = getVehicleCarrySummary(vehicle.row);
      const itemsHtml = items
        .map(item => buildInventoryBatchCheckboxRow(nameMap.get(item.row), item.path.join('.')))
        .join('');
      sections.push(buildInventoryBatchGroup({
        title: 'Färdmedel',
        subtitle: vehicleNames.get(vehicle.idx),
        metaText: formatBatchCapacityText(vehicleCarry.usedWeight, vehicleCarry.maxCapacity),
        icon: VEHICLE_EMOJI[vehicle.entry?.namn] || '🛞',
        count: items.length,
        itemsHtml
      }));
    });
    list.innerHTML = sections.join('') || '<p class="inventory-batch-empty">Det finns inga poster att prisjustera.</p>';
    const sectionInner = section?.querySelector('.popup-inner');
    if (sectionInner) {
      sectionInner.scrollTop = 0;
    }

    const cleanup = () => {
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      list.innerHTML = '';
      inEl.value = '';
      if (section) section.__hubCleanup = null;
    };
    const close = () => {
      cleanup();
      closeInventoryHub({ skipSection: 'pricePopup' });
    };
    const onApply = () => {
      const factor = parseFloat(inEl.value);
      if (Number.isNaN(factor)) return;
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-path]:checked')];
      checks.forEach(chk => {
        const path = chk.dataset.path.split('.').map(Number);
        let arr = inv;
        let row = null;
        path.forEach((idx, i) => {
          row = arr[idx];
          if (i < path.length - 1) arr = row.contains || [];
        });
        if (row) row.priceMult = (row.priceMult || 1) * factor;
      });
      saveInventory(inv);
      renderInventory();
      inEl.value = '';
      [...list.querySelectorAll('input[type="checkbox"][data-path]')].forEach(chk => { chk.checked = false; });
      if (typeof inEl.focus === 'function') inEl.focus();
    };
    const onCancel = () => { close(); };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    if (section) section.__hubCleanup = cleanup;
  }

  function openRowPricePopup(row) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('rowPricePopup');
    const cancel = root.getElementById('rowPriceCancel');
    const presets= root.getElementById('rowPricePresets');
    const inEl   = root.getElementById('rowPriceFactor');
    const apply  = root.getElementById('rowPriceApply');
    if (!pop || !presets) return;

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      presets.removeEventListener('click', onPreset);
      apply?.removeEventListener('click', onApply);
      inEl?.removeEventListener('keydown', onKey);
      setBtn?.removeEventListener('click', onSet);
      dEl?.removeEventListener('keydown', onBaseKey);
      sEl?.removeEventListener('keydown', onBaseKey);
      oEl?.removeEventListener('keydown', onBaseKey);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      if (inEl) inEl.value = '';
    };
    const onPreset = e => {
      e.stopPropagation();
      const b = e.target.closest('button[data-factor]');
      if (!b) return;
      const factor = parseFloat(b.dataset.factor);
      if (Number.isNaN(factor)) return;
      if (Math.abs(factor - 1) < 1e-9) {
        row.priceMult = 1;
      } else {
        row.priceMult = (row.priceMult || 1) * factor;
      }
      const inv = storeHelper.getInventory(store);
      saveInventory(inv);
      // Stäng popuppen direkt för snabbare UI-feedback
      close();
      // Rendera om inventariet efter att popuppen stängts
      renderInventory();
    };
    const onApply = e => {
      e?.stopPropagation();
      const factor = parseFloat(inEl?.value ?? '');
      if (Number.isNaN(factor)) return;
      if (Math.abs(factor - 1) < 1e-9) {
        row.priceMult = 1;
      } else {
        row.priceMult = (row.priceMult || 1) * factor;
      }
      const inv = storeHelper.getInventory(store);
      saveInventory(inv);
      close();
      renderInventory();
    };
    const onKey = e => {
      if (e.key === 'Enter') onApply(e);
      e.stopPropagation();
    };
    const dEl    = root.getElementById('rowBaseDaler');
    const sEl    = root.getElementById('rowBaseSkilling');
    const oEl    = root.getElementById('rowBaseOrtegar');
    const setBtn = root.getElementById('rowBaseApply');

    // Förifyll om grundpris finns
    if (row.basePrice) {
      dEl && (dEl.value = String(row.basePrice.daler ?? row.basePrice.d ?? 0));
      sEl && (sEl.value = String(row.basePrice.skilling ?? row.basePrice.s ?? 0));
      oEl && (oEl.value = String(row.basePrice['örtegar'] ?? row.basePrice.o ?? 0));
    } else {
      if (dEl) dEl.value = '';
      if (sEl) sEl.value = '';
      if (oEl) oEl.value = '';
    }

    const onCancel = (e) => { if (e) e.stopPropagation(); close(); };
    const onOutside = e => {
      e.stopPropagation();
      if(!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    const onSet = e => {
      e?.stopPropagation();
      const d = parseInt(dEl?.value || '0', 10) || 0;
      const s = parseInt(sEl?.value || '0', 10) || 0;
      const o = parseInt(oEl?.value || '0', 10) || 0;
      if (d === 0 && s === 0 && o === 0) {
        delete row.basePrice;
        delete row.basePriceSource;
      } else {
        row.basePrice = { daler: d, skilling: s, 'örtegar': o };
        row.basePriceSource = 'manual';
      }
      const inv = storeHelper.getInventory(store);
      saveInventory(inv);
      close();
      renderInventory();
    };
    const onBaseKey = e => {
      if (e.key === 'Enter') onSet(e);
      e.stopPropagation();
    };

    presets.addEventListener('click', onPreset);
    apply?.addEventListener('click', onApply);
    inEl?.addEventListener('keydown', onKey);
    setBtn?.addEventListener('click', onSet);
    dEl?.addEventListener('keydown', onBaseKey);
    sEl?.addEventListener('keydown', onBaseKey);
    oEl?.addEventListener('keydown', onBaseKey);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
  }

  function openVehicleQtyPrompt({ maxQty, itemName, mode, vehicleName }) {
    const maxRaw = Number(maxQty);
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 0;
    const fallback = max > 0 ? max : 1;
    if (max <= 1) return Promise.resolve(fallback);
    const root = getToolbarRoot();
    if (!root) return Promise.resolve(fallback);
    const pop     = root.getElementById('vehicleQtyPopup');
    const input   = root.getElementById('vehicleQtyInput');
    const confirm = root.getElementById('vehicleQtyConfirm');
    const cancel  = root.getElementById('vehicleQtyCancel');
    const message = root.getElementById('vehicleQtyMessage');
    const hint    = root.getElementById('vehicleQtyHint');
    const title   = root.getElementById('vehicleQtyTitle');
    if (!pop || !input || !confirm || !cancel) return Promise.resolve(fallback);
    const inner   = pop.querySelector('.popup-inner');
    const safeName = itemName || 'föremål';
    const actionText = mode === 'unload' ? 'lasta ur' : 'lasta i';
    const vehiclePreposition = mode === 'unload' ? 'från' : 'i';
    if (title) title.textContent = vehicleName ? `Välj antal (${vehicleName})` : 'Välj antal';
    if (message) {
      const vehiclePart = vehicleName ? ` ${vehiclePreposition} ${vehicleName}` : '';
      message.textContent = `Hur många ”${safeName}” vill du ${actionText}${vehiclePart}?`;
    }
    if (hint) hint.textContent = max ? `Max: ${max}` : '';
    input.value = String(max);
    input.min = '1';
    input.step = '1';
    input.max = String(max);
    if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
    pop.classList.add('open');
    if (inner) inner.scrollTop = 0;
    setTimeout(() => { if (typeof input.focus === 'function') input.focus(); if (typeof input.select === 'function') input.select(); }, 40);
    return new Promise(resolve => {
      let closed = false;
      const clearValidity = () => {
        if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
      };
      const close = result => {
        if (closed) return;
        closed = true;
        pop.classList.remove('open');
        confirm.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
        pop.removeEventListener('click', onOutside);
        input.removeEventListener('keydown', onKey);
        input.removeEventListener('input', clearValidity);
        if (hint) hint.textContent = '';
        if (message) message.textContent = '';
        input.value = '';
        clearValidity();
        resolve(result);
      };
      const onConfirm = () => {
        clearValidity();
        const value = parseInt(input.value, 10);
        if (!Number.isFinite(value) || value <= 0) {
          input.focus();
          return;
        }
        if (value > max) {
          if (typeof input.setCustomValidity === 'function') {
            input.setCustomValidity(`Du kan som mest välja ${max}.`);
            input.reportValidity();
          }
          input.focus();
          return;
        }
        close(value);
      };
      const onCancel = () => close(null);
      const onOutside = e => {
        if (!inner || inner.contains(e.target)) return;
        close(null);
      };
      const onKey = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };
      confirm.addEventListener('click', onConfirm);
      cancel.addEventListener('click', onCancel);
      pop.addEventListener('click', onOutside);
      input.addEventListener('keydown', onKey);
      input.addEventListener('input', clearValidity);
    });
  }

  function openVehicleMoneyPrompt({ maxMoney, vehicleName, itemName }) {
    const maxNormalized = storeHelper.normalizeMoney(maxMoney || {});
    const maxTotalO = moneyToO(maxNormalized);
    if (!maxTotalO) return Promise.resolve(null);
    const root = getToolbarRoot();
    if (!root) return Promise.resolve(null);
    const pop      = root.getElementById('vehicleMoneyPopup');
    const title    = root.getElementById('vehicleMoneyTitle');
    const message  = root.getElementById('vehicleMoneyMessage');
    const hint     = root.getElementById('vehicleMoneyHint');
    const errorEl  = root.getElementById('vehicleMoneyError');
    const dInput   = root.getElementById('vehicleMoneyDalerRemove');
    const sInput   = root.getElementById('vehicleMoneySkillingRemove');
    const oInput   = root.getElementById('vehicleMoneyOrtegarRemove');
    const confirm  = root.getElementById('vehicleMoneyConfirm');
    const cancel   = root.getElementById('vehicleMoneyCancel');
    if (!pop || !confirm || !cancel) return Promise.resolve(null);
    const inner    = pop.querySelector('.popup-inner');
    const displayName = itemName || 'Pengar';
    if (title) title.textContent = 'Ta ut pengar';
    if (message) {
      const vehiclePart = vehicleName ? ` från ${vehicleName}` : '';
      message.textContent = `Hur mycket av ”${displayName}” vill du ta ut${vehiclePart}?`;
    }
    if (hint && typeof formatMoney === 'function') {
      hint.textContent = `Max: ${formatMoney(maxNormalized)}`;
    }
    [dInput, sInput, oInput].forEach(inp => { if (inp) inp.value = ''; });
    if (errorEl) errorEl.textContent = '';
    pop.classList.add('open');
    if (inner) inner.scrollTop = 0;
    setTimeout(() => { if (typeof dInput?.focus === 'function') dInput.focus(); }, 40);

    return new Promise(resolve => {
      let closed = false;
      const close = result => {
        if (closed) return;
        closed = true;
        pop.classList.remove('open');
        confirm.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
        pop.removeEventListener('click', onOutside);
        [dInput, sInput, oInput].forEach(inp => { if (inp) inp.removeEventListener('keydown', onKey); });
        if (hint) hint.textContent = '';
        if (message) message.textContent = '';
        [dInput, sInput, oInput].forEach(inp => { if (inp) inp.value = ''; if (typeof inp?.setCustomValidity === 'function') inp.setCustomValidity(''); });
        if (errorEl) errorEl.textContent = '';
        resolve(result);
      };
      const parseNonNegInt = input => {
        if (!input) return 0;
        const val = input.value;
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
        if (typeof input.setCustomValidity === 'function') input.setCustomValidity('');
        return num;
      };
      const showError = msg => { if (errorEl) errorEl.textContent = msg || ''; };
      const onConfirm = () => {
        const d = parseNonNegInt(dInput);
        const s = parseNonNegInt(sInput);
        const o = parseNonNegInt(oInput);
        if (d === null || s === null || o === null) {
          showError('Beloppen måste vara heltal och får inte vara negativa.');
          return;
        }
        const bundle = storeHelper.normalizeMoney({ daler: d, skilling: s, 'örtegar': o });
        const total = moneyToO(bundle);
        if (total <= 0) {
          showError('Ange ett belopp att ta ut.');
          (dInput || sInput || oInput)?.focus();
          return;
        }
        if (total > maxTotalO) {
          showError('Beloppet överskrider summan i färdmedlet.');
          return;
        }
        showError('');
        close(bundle);
      };
      const onCancel = () => close(null);
      const onOutside = e => { if (!inner || inner.contains(e.target)) return; close(null); };
      const onKey = e => {
        if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      };
      confirm.addEventListener('click', onConfirm);
      cancel.addEventListener('click', onCancel);
      pop.addEventListener('click', onOutside);
      [dInput, sInput, oInput].forEach(inp => inp?.addEventListener('keydown', onKey));
    });
  }

  function addMoneyToVehicle(vehicle, moneyBundle, opts = {}) {
    const {
      skipSave = false,
      skipRender = false,
      deductFromWallet = true
    } = opts || {};
    const inv = storeHelper.getInventory(store);
    if (!vehicle || !Array.isArray(inv) || !inv.includes(vehicle)) {
      return { success: false, error: 'Ogiltigt färdmedel.' };
    }
    const parseNonNegInt = (val) => {
      if (val === undefined || val === null || val === '') return 0;
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
      return num;
    };
    const daler = parseNonNegInt(moneyBundle?.daler ?? moneyBundle?.d);
    const skilling = parseNonNegInt(moneyBundle?.skilling ?? moneyBundle?.s);
    const ortegar = parseNonNegInt(
      moneyBundle?.ortegar ?? moneyBundle?.['örtegar'] ?? moneyBundle?.o
    );
    if (daler === null || skilling === null || ortegar === null) {
      return { success: false, error: 'Beloppet måste vara ett heltal och får inte vara negativt.' };
    }
    const money = storeHelper.normalizeMoney({ daler, skilling, 'örtegar': ortegar });
    const moneyO = moneyToO(money);
    if (moneyO <= 0) {
      return { success: false, error: 'Beloppet måste vara större än noll.' };
    }
    if (deductFromWallet) {
      const wallet = storeHelper.normalizeMoney(storeHelper.getMoney(store));
      const walletO = moneyToO(wallet);
      if (moneyO > walletO) {
        return { success: false, error: 'Du har inte så mycket pengar i bältesbörsen.' };
      }
      const remainingWallet = oToMoney(walletO - moneyO);
      storeHelper.setMoney(store, remainingWallet);
    }
    vehicle.contains = vehicle.contains || [];
    const existing = vehicle.contains.find(r => r?.typ === 'currency' && r.money);
    let row = existing;
    if (existing) {
      const currentO = moneyToO(storeHelper.normalizeMoney(existing.money));
      row.money = storeHelper.normalizeMoney(oToMoney(currentO + moneyO));
      row.qty = 1;
      row.typ = 'currency';
    } else {
      row = {
        name: 'Pengar',
        typ: 'currency',
        money,
        qty: 1
      };
      vehicle.contains.push(row);
    }
    vehicle.contains.sort(sortInvEntry);
    if (!skipSave) saveInventory(inv);
    if (!skipRender) renderInventory();
    return { success: true, row, added: money, total: row.money || money };
  }

  function removeMoneyFromVehicle(vehicle, path, removeBundle, opts = {}) {
    const { addToWallet = true } = opts || {};
    const inv = storeHelper.getInventory(store);
    if (!vehicle || !Array.isArray(inv) || !inv.includes(vehicle)) {
      return { success: false, error: 'Ogiltigt färdmedel.' };
    }
    const { row, parentArr, idx } = getRowByPath(inv, path);
    if (!row || !Array.isArray(parentArr) || idx < 0) {
      return { success: false, error: 'Kunde inte hitta pengarna i färdmedlet.' };
    }
    const parseNonNegInt = val => {
      if (val === undefined || val === null || val === '') return 0;
      const num = Number(val);
      if (!Number.isFinite(num) || num < 0) return null;
      return Math.floor(num);
    };
    const daler = parseNonNegInt(removeBundle?.daler);
    const skilling = parseNonNegInt(removeBundle?.skilling);
    const ortegar = parseNonNegInt(removeBundle?.ortegar ?? removeBundle?.['örtegar']);
    if (daler === null || skilling === null || ortegar === null) {
      return { success: false, error: 'Beloppet måste vara ett heltal och får inte vara negativt.' };
    }
    const toRemove = storeHelper.normalizeMoney({ daler, skilling, 'örtegar': ortegar });
    const removeTotalO = moneyToO(toRemove);
    if (removeTotalO <= 0) {
      return { success: false, error: 'Beloppet måste vara större än noll.' };
    }
    const current = storeHelper.normalizeMoney(row.money || {});
    const currentO = moneyToO(current);
    if (removeTotalO > currentO) {
      return { success: false, error: 'Beloppet är större än summan i färdmedlet.' };
    }
    const remaining = oToMoney(currentO - removeTotalO);
    if (addToWallet) {
      const wallet = storeHelper.normalizeMoney(storeHelper.getMoney(store));
      const walletO = moneyToO(wallet);
      storeHelper.setMoney(store, oToMoney(walletO + removeTotalO));
    }
    if (moneyToO(remaining) <= 0) {
      parentArr.splice(idx, 1);
    } else {
      row.money = remaining;
      row.qty = 1;
    }
    saveInventory(inv);
    renderInventory();
    return { success: true, remaining };
  }

  function openVehiclePopup(preselectValue, precheckedPaths) {
    const root = getToolbarRoot();
    if (!root) return;
    cleanupInventoryHubSections('vehiclePopup');
    openInventoryItemsHub('vehicle-load', { focusSection: 'vehicle-load' });
    const section = root.getElementById('vehiclePopup');
    const sel    = root.getElementById('vehicleSelect');
    const list   = root.getElementById('vehicleItemList');
    const apply  = root.getElementById('vehicleApply');
    const cancel = root.getElementById('vehicleCancel');

    const inv = storeHelper.getInventory(store);
    const charCarry = getCharacterCarrySummary(inv);
    const { vehicles, flat, nameMap, vehicleNames, vehicleIndexes } = getInventoryVehicleContext(inv);
    if (!vehicles.length) return;

    sel.innerHTML = vehicles
      .map(v => `<option value="${v.idx}">${vehicleNames.get(v.idx)}</option>`)
      .join('');

    const resolvePreselectIdx = value => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'number' && !Number.isNaN(value) && inv[value]) return value;
      const asNum = Number(value);
      if (!Number.isNaN(asNum) && inv[asNum]) return asNum;
      const found = vehicles.find(v => v.entry.id === value || v.entry.namn === value);
      return found ? found.idx : null;
    };

    const initialIdx = resolvePreselectIdx(preselectValue);
    if (initialIdx !== null) sel.value = String(initialIdx);

    const movable = flat.filter(obj => !(vehicleIndexes.includes(obj.path[0]) && obj.path.length === 1));
    const outside = movable.filter(obj => !vehicleIndexes.includes(obj.path[0]));
    const moneyRowHtml = `
      <div class="vehicle-money-row">
        <span>Lägg till pengar</span>
        <div class="vehicle-money-inputs">
          <input id="vehicleMoneyDaler" type="number" min="0" step="1" placeholder="Daler">
          <input id="vehicleMoneySkilling" type="number" min="0" step="1" placeholder="Skilling">
          <input id="vehicleMoneyOrtegar" type="number" min="0" step="1" placeholder="Örtegar">
        </div>
      </div>`;
    const sections = [
      buildInventoryBatchGroup({
        title: 'Bältesbörs',
        subtitle: 'Lägg pengar i valt färdmedel',
        icon: '💰',
        itemsHtml: moneyRowHtml
      })
    ];
    if (outside.length) {
      sections.push(buildInventoryBatchGroup({
        title: 'Huvudinventarie',
        metaText: formatBatchCapacityText(charCarry.usedWeight, charCarry.maxCapacity),
        icon: '🎒',
        count: outside.length,
        itemsHtml: outside
          .map(item => buildInventoryBatchCheckboxRow(nameMap.get(item.row), item.path.join('.')))
          .join('')
      }));
    }
    vehicles.forEach(vehicle => {
      const items = movable.filter(item => item.path[0] === vehicle.idx);
      if (!items.length) return;
      const vehicleCarry = getVehicleCarrySummary(vehicle.row);
      sections.push(buildInventoryBatchGroup({
        title: 'Färdmedel',
        subtitle: vehicleNames.get(vehicle.idx),
        metaText: formatBatchCapacityText(vehicleCarry.usedWeight, vehicleCarry.maxCapacity),
        icon: VEHICLE_EMOJI[vehicle.entry?.namn] || '🛞',
        count: items.length,
        itemsHtml: items
          .map(item => buildInventoryBatchCheckboxRow(nameMap.get(item.row), item.path.join('.')))
          .join('')
      }));
    });
    list.innerHTML = sections.join('');
    const dalerInput = root.getElementById('vehicleMoneyDaler');
    const skillingInput = root.getElementById('vehicleMoneySkilling');
    const ortegarInput = root.getElementById('vehicleMoneyOrtegar');
    if (Array.isArray(precheckedPaths) && precheckedPaths.length) {
      const set = new Set(precheckedPaths.map(String));
      [...list.querySelectorAll('input[type="checkbox"][data-path]')]
        .forEach(ch => { if (set.has(ch.dataset.path)) ch.checked = true; });
    }
    const sectionInner = section?.querySelector('.popup-inner');
    if (sectionInner) {
      sectionInner.scrollTop = 0;
    }

    const clearMoneyInputs = () => {
      [dalerInput, skillingInput, ortegarInput].forEach(inp => {
        if (inp) {
          inp.value = '';
          inp.setCustomValidity('');
        }
      });
    };
    const cleanup = () => {
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      clearMoneyInputs();
      sel.innerHTML = '';
      list.innerHTML = '';
      if (section) section.__hubCleanup = null;
    };
    const close = () => {
      cleanup();
      closeInventoryHub({ skipSection: 'vehiclePopup' });
    };
    const onApply = async () => {
      const vIdx = Number(sel.value);
      if (Number.isNaN(vIdx)) return;
      const vehicle = inv[vIdx];
      if (!vehicle) return;
      vehicle.contains = vehicle.contains || [];
      const vehicleName = vehicleNames.get(vIdx);
      const parseNonNegInt = (input) => {
        if (!input) return 0;
        const val = input.value;
        if (val === undefined || val === null || val === '') {
          input.setCustomValidity('');
          return 0;
        }
        const num = Number(val);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          input.setCustomValidity('Beloppet måste vara ett heltal och får inte vara negativt.');
          return null;
        }
        input.setCustomValidity('');
        return num;
      };
      const amounts = [
        { key: 'daler', input: dalerInput },
        { key: 'skilling', input: skillingInput },
        { key: 'örtegar', input: ortegarInput }
      ];
      const moneyBundle = {};
      for (const { key, input } of amounts) {
        const parsed = parseNonNegInt(input);
        if (parsed === null) {
          input?.reportValidity();
          return;
        }
        moneyBundle[key] = parsed;
      }
      const normalizedMoney = storeHelper.normalizeMoney(moneyBundle);
      const totalMoneyO = moneyToO(normalizedMoney);
      if (totalMoneyO > 0) {
        const addResult = addMoneyToVehicle(vehicle, normalizedMoney, { skipSave: true, skipRender: true });
        if (!addResult?.success) {
          if (addResult?.error) alert(addResult.error);
          return;
        }
      }
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-path]:checked')]
        .map(ch => ch.dataset.path.split('.').map(Number))
        .sort((a, b) => {
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const av = a[i], bv = b[i];
            if (av === undefined) return 1;
            if (bv === undefined) return -1;
            if (av !== bv) return bv - av;
          }
          return 0;
        });
      const operations = [];
      for (const path of checks) {
        if (!Array.isArray(path) || !path.length) continue;
        if (path[0] === vIdx && path.length === 1) continue;
        const { row, parentArr, idx } = getRowByPath(inv, path);
        if (!row || !Array.isArray(parentArr) || idx < 0) continue;
        const qtyRaw = Number(row.qty);
        const totalQty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;
        let moveQty = totalQty;
        if (totalQty > 1) {
          const entry = getEntry(row.id || row.name) || {};
          const displayName = nameMap.get(row) || row.name || entry.namn || 'föremål';
          const chosen = await openVehicleQtyPrompt({ maxQty: totalQty, itemName: displayName, mode: 'load', vehicleName });
          if (!chosen) return;
          moveQty = Math.min(totalQty, Math.max(1, Math.floor(chosen)));
        }
        operations.push({ parentArr, idx, row, moveQty, totalQty });
      }
      operations.forEach(({ parentArr, idx, row, moveQty, totalQty }) => {
        if (!Array.isArray(parentArr) || !row || !Number.isFinite(moveQty) || moveQty <= 0) return;
        if (totalQty > 1 && moveQty < totalQty) {
          const { movedRow } = splitStackRow(row, moveQty);
          if (movedRow) vehicle.contains.push(movedRow);
          const remaining = Number(row.qty);
          if (!Number.isFinite(remaining) || remaining <= 0) parentArr.splice(idx, 1);
        } else {
          const [item] = parentArr.splice(idx, 1);
          if (item) vehicle.contains.push(item);
        }
      });
      vehicle.contains.sort(sortInvEntry);
      saveInventory(inv);
      renderInventory();
      const keepValue = vIdx;
      cleanup();
      openVehiclePopup(keepValue);
    };
    const onCancel = () => { close(); };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    if (section) section.__hubCleanup = cleanup;
}

  function openVehicleRemovePopup(preselectIdx, precheckedPaths) {
    const root = getToolbarRoot();
    if (!root) return;
    cleanupInventoryHubSections('vehicleRemovePopup');
    openInventoryItemsHub('vehicle-unload', { focusSection: 'vehicle-unload' });
    const section = root.getElementById('vehicleRemovePopup');
    const sel    = root.getElementById('vehicleRemoveSelect');
    const list   = root.getElementById('vehicleRemoveItemList');
    const apply  = root.getElementById('vehicleRemoveApply');
    const cancel = root.getElementById('vehicleRemoveCancel');

    const inv = storeHelper.getInventory(store);
    const { vehicles, vehicleNames } = getInventoryVehicleContext(inv);
    if (!vehicles.length) return;

    sel.innerHTML = vehicles
      .map(v => `<option value="${v.idx}">${vehicleNames.get(v.idx)}</option>`)
      .join('');
    if (typeof preselectIdx === 'number') sel.value = String(preselectIdx);

    const isMoneyRow = row => row && row.typ === 'currency' && row.money;
    const fillList = () => {
      const vIdx = Number(sel.value);
      const vehicle = inv[vIdx];
      const vehicleName = vehicleNames.get(vIdx);
      if (!vehicle || !Array.isArray(vehicle.contains)) {
        list.innerHTML = '';
        return;
      }
      const items = flattenInventoryWithPath(vehicle.contains, [vIdx]);
      const nameMap = makeNameMap(items.map(i => i.row));
      const vehicleCarry = getVehicleCarrySummary(vehicle);
      const parts = items.map(o => {
        const pathStr = o.path.join('.');
        if (isMoneyRow(o.row)) {
          const normalized = storeHelper.normalizeMoney(o.row.money || {});
          const amountText = typeof formatMoney === 'function' ? formatMoney(normalized) : nameMap.get(o.row);
          const label = nameMap.get(o.row) || 'Pengar';
          return buildInventoryBatchActionRow(label, 'Ta ut pengar', pathStr, `Tillgängligt: ${amountText}`);
        }
        return buildInventoryBatchCheckboxRow(nameMap.get(o.row), pathStr);
      });
      list.innerHTML = buildInventoryBatchGroup({
        title: 'Färdmedel',
        subtitle: vehicleName || 'Färdmedel',
        metaText: formatBatchCapacityText(vehicleCarry.usedWeight, vehicleCarry.maxCapacity),
        icon: VEHICLE_EMOJI[getEntry(vehicle.id || vehicle.name)?.namn] || '🛞',
        count: items.length,
        itemsHtml: parts.join(''),
        emptyText: 'Det valda färdmedlet är tomt.'
      });
      if (Array.isArray(precheckedPaths) && precheckedPaths.length) {
        const set = new Set(precheckedPaths.map(String));
        [...list.querySelectorAll('input[type="checkbox"][data-path]')]
          .forEach(ch => { if (set.has(ch.dataset.path)) ch.checked = true; });
      }
      [...list.querySelectorAll('.vehicle-money-action[data-path]')].forEach(btn => {
        btn.addEventListener('click', async () => {
          const path = btn.dataset.path?.split('.').map(Number);
          const { row } = getRowByPath(inv, path || []);
          if (!row || !isMoneyRow(row)) return;
          const maxMoney = storeHelper.normalizeMoney(row.money || {});
          if (moneyToO(maxMoney) <= 0) return;
          const promptRes = await openVehicleMoneyPrompt({ maxMoney, vehicleName, itemName: nameMap.get(row) });
          if (!promptRes) return;
          const result = removeMoneyFromVehicle(vehicle, path, promptRes);
          if (!result?.success) {
            if (result?.error) alert(result.error);
            return;
          }
          fillList();
        });
      });
    };

    fillList();
    const sectionInner = section?.querySelector('.popup-inner');
    if (sectionInner) {
      sectionInner.scrollTop = 0;
    }

    const cleanup = () => {
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      sel.removeEventListener('change', fillList);
      sel.innerHTML = '';
      list.innerHTML = '';
      if (section) section.__hubCleanup = null;
    };
    const close = () => {
      cleanup();
      closeInventoryHub({ skipSection: 'vehicleRemovePopup' });
    };
    const onApply = async () => {
      const vIdx = Number(sel.value);
      const vehicle = inv[vIdx];
      if (!vehicle) return;
      const vehicleName = vehicleNames.get(vIdx);
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-path]:checked')]
        .map(ch => ch.dataset.path.split('.').map(Number))
        .sort((a, b) => {
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const av = a[i], bv = b[i];
            if (av === undefined) return 1;
            if (bv === undefined) return -1;
            if (av !== bv) return bv - av;
          }
          return 0;
        });
      const nameMapAll = makeNameMap(flattenInventoryWithPath(inv).map(f => f.row));
      const operations = [];
      for (const path of checks) {
        if (!Array.isArray(path) || !path.length) continue;
        if (path[0] !== vIdx) continue;
        const { row, parentArr, idx } = getRowByPath(inv, path);
        if (!row || !Array.isArray(parentArr) || idx < 0) continue;
        const qtyRaw = Number(row.qty);
        const totalQty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;
        let moveQty = totalQty;
        if (totalQty > 1) {
          const entry = getEntry(row.id || row.name) || {};
          const displayName = nameMapAll.get(row) || row.name || entry.namn || 'föremål';
          const chosen = await openVehicleQtyPrompt({ maxQty: totalQty, itemName: displayName, mode: 'unload', vehicleName });
          if (!chosen) return;
          moveQty = Math.min(totalQty, Math.max(1, Math.floor(chosen)));
        }
        operations.push({ parentArr, idx, row, moveQty, totalQty });
      }
      operations.forEach(({ parentArr, idx, row, moveQty, totalQty }) => {
        if (!Array.isArray(parentArr) || !row || !Number.isFinite(moveQty) || moveQty <= 0) return;
        if (totalQty > 1 && moveQty < totalQty) {
          const { movedRow } = splitStackRow(row, moveQty);
          if (movedRow) addToInventory(inv, movedRow);
          const remaining = Number(row.qty);
          if (!Number.isFinite(remaining) || remaining <= 0) parentArr.splice(idx, 1);
        } else {
          const [item] = parentArr.splice(idx, 1);
          if (item) addToInventory(inv, item);
        }
      });
      saveInventory(inv);
      renderInventory();
      const keepValue = vIdx;
      cleanup();
      openVehicleRemovePopup(keepValue);
    };
    const onCancel = () => { close(); };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    sel.addEventListener('change', fillList);
    if (section) section.__hubCleanup = cleanup;
  }

  function openDeleteContainerPopup(removeAll, removeOnly, options = {}) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('deleteContainerPopup');
    const allBtn = root.getElementById('deleteContainerAll');
    const onlyBtn= root.getElementById('deleteContainerOnly');
    const cancel = root.getElementById('deleteContainerCancel');
    const textEl = root.getElementById('deleteContainerText');

    const defaultText = textEl ? textEl.textContent : '';
    const defaultAll  = allBtn ? allBtn.textContent : '';
    const defaultOnly = onlyBtn ? onlyBtn.textContent : '';

    const { message, allLabel, onlyLabel } = options || {};

    if (textEl && message) textEl.textContent = message;
    if (allBtn && allLabel) allBtn.textContent = allLabel;
    if (onlyBtn && onlyLabel) onlyBtn.textContent = onlyLabel;

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      allBtn.removeEventListener('click', onAll);
      onlyBtn.removeEventListener('click', onOnly);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      if (textEl) textEl.textContent = defaultText;
      if (allBtn) allBtn.textContent = defaultAll;
      if (onlyBtn) onlyBtn.textContent = defaultOnly;
    };
    const onAll = () => { removeAll(); close(); };
    const onOnly = () => { removeOnly(); close(); };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    allBtn.addEventListener('click', onAll);
    onlyBtn.addEventListener('click', onOnly);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
  }

  function openAdvMoneyPopup(onConfirm) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('advMoneyPopup');
    const cancel = root.getElementById('advMoneyCancel');
    const confirm= root.getElementById('advMoneyConfirm');

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      cancel.removeEventListener('click', onCancel);
      confirm.removeEventListener('click', onConf);
      pop.removeEventListener('click', onOutside);
    };
    const onConf = () => { onConfirm(); close(); };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    cancel.addEventListener('click', onCancel);
    confirm.addEventListener('click', onConf);
    pop.addEventListener('click', onOutside);
  }

  function openSaveFreePopup() {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('saveFreePopup');
    const cancel = root.getElementById('saveFreeCancel');
    const confirm= root.getElementById('saveFreeConfirm');

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      cancel.removeEventListener('click', onCancel);
      confirm.removeEventListener('click', onConfirm);
      pop.removeEventListener('click', onOutside);
    };
    const onConfirm = () => {
      const priv = storeHelper.getPrivMoney(store);
      const pos  = storeHelper.getPossessionMoney(store);
      const hasAdv = priv.daler || priv.skilling || priv['örtegar'] || pos.daler || pos.skilling || pos['örtegar'];
      if (hasAdv) {
        close();
        openAdvMoneyPopup(() => { massFreeAndSave(); });
      } else {
        massFreeAndSave();
        close();
      }
    };
    const onCancel  = () => { close(); };
    const onOutside = e => {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    cancel.addEventListener('click', onCancel);
    confirm.addEventListener('click', onConfirm);
    pop.addEventListener('click', onOutside);
  }

  function massFreeAndSave() {
    const allInv = storeHelper.getInventory(store);
    const flat   = flattenInventory(allInv);
    const cash   = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));

    const partyForge = LEVEL_IDX[storeHelper.getPartySmith(store) || ''] || 0;
    const skillForge = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Smideskonst');
    const forgeLvl = Math.max(partyForge, skillForge);
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
    const skillArt = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Artefaktmakande');
    const artLevel = Math.max(partyArt, skillArt);

    const tot = flat.reduce((t, row) => {
      const m = calcRowCost(row, forgeLvl, alcLevel, artLevel);
      t.d += m.d; t.s += m.s; t.o += m.o;
      return t;
    }, { d:0, s:0, o:0 });
    tot.s += Math.floor(tot.o / OBASE); tot.o %= OBASE;
    tot.d += Math.floor(tot.s / SBASE); tot.s %= SBASE;
    const diffO = moneyToO(cash) - (tot.d * SBASE * OBASE + tot.s * OBASE + tot.o);
    const diff  = oToMoney(Math.max(0, diffO));
    storeHelper.setSavedUnusedMoney(store, diff);
    storeHelper.setPrivMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
    storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
    storeHelper.setMoney(store, {
      daler: diff.d,
      skilling: diff.s,
      'örtegar': diff.o
    });

    flat.forEach(row => {
      row.basePrice = { daler: 0, skilling: 0, 'örtegar': 0 };
      row.basePriceSource = 'manual';
      row.gratis = row.qty;
      const entry = getEntry(row.id || row.name);
      const removed = row.removedKval ?? [];
      const baseQuals = [
        ...(entry.taggar?.kvalitet ?? []),
        ...splitQuals(entry.kvalitet)
      ];
      const baseQ = baseQuals.filter(q => !removed.includes(q));
      const allQ = sanitizeArmorQualities(entry, [...baseQ, ...(row.kvaliteter || [])]);
      row.gratisKval = allQ.filter(q => !isNegativeQual(q) && !isNeutralQual(q));
      // remove any price multiplier when everything is made free
      delete row.priceMult;
    });

    saveInventory(allInv);
    renderInventory();
  }

  function calcRowCost(row, forgeLvl, alcLevel, _artLevel) {
    const entry  = getEntry(row.id || row.name);
    const tagger = entry.taggar ?? {};
    const tagTyp = tagger.typ ?? [];
    const entryBase = moneyToO(entry.grundpris || {});
    const qtyNum = Math.max(0, Number(row.qty) || 0);
    const gratisNum = Math.max(0, Number(row.gratis) || 0);
    const srcRaw = typeof row.basePriceSource === 'string' ? row.basePriceSource.toLowerCase() : '';
    let baseSource = srcRaw;
    if (!baseSource && row.basePrice != null && qtyNum > 0 && gratisNum >= qtyNum) {
      baseSource = 'live';
    }
    const hasBaseOverride = row.basePrice != null && baseSource !== 'live';
    const overrideBase = hasBaseOverride ? moneyToO(row.basePrice || {}) : null;
    let base = hasBaseOverride ? overrideBase : entryBase;
    let fallbackBase = entryBase;
    const forgeable = ['Vapen','Sköld','Rustning'].some(t => tagTyp.includes(t));
    const baseQuals = [
      ...(tagger.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    const removedQ = row.removedKval ?? [];
    const allQuals = sanitizeArmorQualities(entry, [
      ...baseQuals.filter(q => !removedQ.includes(q)),
      ...(row.kvaliteter || [])
    ]);
    if (forgeLvl && forgeable) {
      const posCnt = countPositiveQuals(allQuals);
      const mystCnt = allQuals.filter(q => !isNegativeQual(q) && !isNeutralQual(q) && isMysticQual(q)).length;
      const qualifies =
        (forgeLvl >= 1 && posCnt === 0) ||
        (forgeLvl >= 2 && posCnt === 1 && mystCnt === 0) ||
        (forgeLvl >= 3 && posCnt === 2 && mystCnt <= 1);
      if (qualifies) {
        base = dividePrice(base, 2);
        fallbackBase = dividePrice(fallbackBase, 2);
      }
    }
    if (tagTyp.includes('Elixir')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) {
        base = dividePrice(base, 2);
        fallbackBase = dividePrice(fallbackBase, 2);
      }
    }
    // Build price chain and track before/after for each quality
    const priceBase = base > 0 ? base : fallbackBase; // ensures qualities still cost after mark-free flows
    let price = priceBase;
    const steps = [];
    const posQuals = allQuals.filter(q => !isNegativeQual(q));
    const negQuals = allQuals.filter(q => isNegativeQual(q));
    posQuals.forEach(q => {
      const qEntry = getEntry(q);
      const myst  = (qEntry.taggar?.typ || []).includes('Mystisk kvalitet');
      const negat = false;
      const neut  = Boolean(qEntry.neutral);
      const before = price;
      if (neut)  price *= 1;
      else       price *= myst ? 10 : 5;
      const after = price;
      steps.push({ name: q, before, after, negat, neut });
    });

    const rowMultRaw = Number(row.priceMult || 1);
    const rowMult = Number.isFinite(rowMultRaw) && rowMultRaw > 0 ? rowMultRaw : 1;
    const mult = rowMult;
    const qty = qtyNum || 1;
    const baseOverrideZero = hasBaseOverride && overrideBase === 0;
    const rawFreeBase = Math.min(gratisNum, qty);
    const freeBase = baseOverrideZero ? qty : rawFreeBase;

    // Full price before adjustments
    const fullPerUnit = price * mult;
    let total = fullPerUnit * qty;

    // Adjustment for free base price
    total -= priceBase * mult * freeBase;

    // Adjustment for free qualities (left to right)
    const freeNames = (row.gratisKval || []).filter(q => {
      const qEntry = getEntry(q);
      return !qEntry.negativ && !qEntry.neutral;
    });
    const remaining = [...freeNames];
    let qualAdjust = 0;
    steps.forEach(s => {
      const idx = remaining.indexOf(s.name);
      if (idx !== -1) {
        qualAdjust += (s.after - s.before);
        remaining.splice(idx, 1); // consume to enforce left-to-right
      }
    });
    total -= qualAdjust * mult * qty;

    // Apply negative quality discount after all other adjustments
    total = dividePrice(total, Math.pow(5, negQuals.length));

    const totalO = Math.max(0, total);
    return oToMoney(totalO);
  }

  function calcRowWeight(row, list) {
    const entry  = getEntry(row.id || row.name);
    if (row.typ === 'currency' && row.money) {
      return calcMoneyWeight(storeHelper.normalizeMoney(row.money));
    }
    const base   = row.vikt ?? entry.vikt ?? entry.stat?.vikt ?? 0;
    const removed = row.removedKval ?? [];
    const baseQuals = [
      ...(entry.taggar?.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    const allQuals = sanitizeArmorQualities(entry, [
      ...baseQuals.filter(q => !removed.includes(q)),
      ...(row.kvaliteter || [])
    ]);
    const massCnt = allQuals.filter(q => q === 'Massivt').length;
    const sub = Array.isArray(row.contains)
      ? row.contains.reduce((s, r) => s + calcRowWeight(r, list), 0)
      : 0;
    const wMod = Array.isArray(list) && list.length && window.rulesHelper
      ? window.rulesHelper.getItemWeightModifiers(list, entry)
      : { faktor: 1, tillagg: 0 };
    return ((base + massCnt) * wMod.faktor + wMod.tillagg) * row.qty + sub;
  }

  function calcMoneyWeight(money) {
    const d = money.daler    || 0;
    const s = money.skilling || 0;
    const o = money['örtegar'] || 0;
    return (d + s + o) * 0.02;
  }

  function calcEntryCost(entry) {
    const tagger = entry.taggar ?? {};
    const tagTyp = tagger.typ ?? [];
    let price = moneyToO(entry.grundpris || {});

    const partyForge = LEVEL_IDX[storeHelper.getPartySmith(store) || ''] || 0;
    const skillForge = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Smideskonst');
    const forgeLevel = Math.max(partyForge, skillForge);
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const forgeable = ['Vapen','Sköld','Rustning'].some(t => tagTyp.includes(t));
    const baseQuals = [
      ...(tagger.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    if (forgeLevel && forgeable) {
      const posCnt = countPositiveQuals(baseQuals);
      const mystCnt = baseQuals.filter(q => !isNegativeQual(q) && !isNeutralQual(q) && isMysticQual(q)).length;
      if (
        (forgeLevel === 1 && posCnt === 0) ||
        (forgeLevel === 2 && mystCnt === 0 && posCnt <= 1) ||
        (forgeLevel >= 3 && posCnt <= 2)
      ) {
        price = dividePrice(price, 2);
      }
    }
    if (tagTyp.includes('Elixir')) {
      const lvlName = Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) price = dividePrice(price, 2);
    }
    const posBaseQuals = baseQuals.filter(q => !isNegativeQual(q));
    const negBaseQuals = baseQuals.filter(q => isNegativeQual(q));
    posBaseQuals.forEach(q => {
      const qEntry = getEntry(q);
      const myst  = (qEntry.taggar?.typ || []).includes('Mystisk kvalitet');
      const neut  = Boolean(qEntry.neutral);
      if (neut) price *= 1;
      else      price *= myst ? 10 : 5;
    });
    price = dividePrice(price, Math.pow(5, negBaseQuals.length));
    price = Math.max(0, price);
    return oToMoney(price);
  }

  function buildQualityInfoSections(qualities, freeQualities) {
    const list = Array.isArray(qualities) ? qualities : [];
    if (!list.length) return [];
    const freeSet = new Set(Array.isArray(freeQualities) ? freeQualities.filter(Boolean) : []);
    const blocks = list.map(({ q, base }) => {
      const name = String(q || '').trim();
      if (!name) return '';
      const qEntry = getEntry(name) || {};
      const tagParts = [`<span class="tag">${base ? 'Grund' : 'Tillagd'}</span>`];
      if (freeSet.has(name)) tagParts.push('<span class="tag free">Gratis</span>');
      if (isMysticQual(name)) tagParts.push('<span class="tag mystic">Mystisk</span>');
      if (isNegativeQual(name)) tagParts.push('<span class="tag negative">Negativ</span>');
      else if (isNeutralQual(name)) tagParts.push('<span class="tag neutral">Neutral</span>');

      const descHtml = abilityHtml(qEntry);
      const effectText = typeof qEntry.effekt === 'string' ? qEntry.effekt.trim() : '';
      const effectHtml = effectText
        ? `<p><strong>Effekt:</strong> ${escapeHtml(effectText)}</p>`
        : '';
      const bodyHtml = `${descHtml || ''}${effectHtml}`;
      const tagsHtml = tagParts.length ? `<div class="tags">${tagParts.join(' ')}</div>` : '';
      return `
        <div class="info-block">
          <p><strong>${escapeHtml(name)}</strong></p>
          ${tagsHtml}
          ${bodyHtml}
        </div>
      `;
    }).filter(Boolean);
    if (!blocks.length) return [];
    return [{
      title: 'Kvaliteter',
      className: 'info-panel-qualities',
      content: blocks.join('')
    }];
  }

  function buildRowDesc(entry, row) {
    const tagger = entry.taggar ?? {};
    const tagTyp = tagger.typ ?? [];
    const isArtifact = tagTyp.includes('Artefakt');
    const isLArtifact = tagTyp.includes('L\u00e4gre Artefakt');
    const freeCnt = Number(row.gratis || 0);
    const levelKeys = Object.keys(entry.nivåer || {});
    const rowLevel = row.nivå || (levelKeys.length ? levelKeys[0] : null);
    let desc = '';
    let infoBody = '';
    const infoTagParts = [];
    const typeTagParts = [];
    (tagger.typ ?? []).forEach(t => {
      const txt = String(t || '').trim();
      if (txt) typeTagParts.push(`<span class="tag">${escapeHtml(txt)}</span>`);
    });
    if (!isArtifact || isLArtifact) {
      const ability = abilityHtml(entry, rowLevel);
      if (ability) {
        desc += ability;
        infoBody += ability;
      }
    }
    const arkTags = splitArkTags(tagger.ark_trad);
    const testTags = typeof window.getEntryTestTags === 'function'
      ? window.getEntryTestTags(entry, { level: rowLevel || row?.nivå })
      : (Array.isArray(tagger.test) ? tagger.test : []);
    const infoTags = testTags.concat(
      arkTags.length ? arkTags : (Array.isArray(tagger.ark_trad) ? ['Traditionslös'] : [])
    );
    const tagList = infoTags.map(t => `<span class="tag">${t}</span>`);
    infoTags.forEach(t => {
      const txt = String(t || '').trim();
      if (txt) infoTagParts.push(`<span class="tag">${escapeHtml(txt)}</span>`);
    });
    infoTagParts.push(...typeTagParts);
    if (rowLevel) {
      tagList.push(`<span class="tag level">${rowLevel}</span>`);
      infoTagParts.push(`<span class="tag level">${escapeHtml(rowLevel)}</span>`);
    }
    if (freeCnt) {
      const freeTxt = `Gratis${freeCnt>1?`×${freeCnt}`:''}`;
      tagList.push(`<span class="tag free removable" data-free="1">${freeTxt} ✕</span>`);
      infoTagParts.push(`<span class="tag free">${escapeHtml(freeTxt)}</span>`);
    }
    const rowPriceMult = Number(row.priceMult || 1);
    const extraMult = Number.isFinite(rowPriceMult) && rowPriceMult > 0 ? rowPriceMult : 1;
    let priceMultTag = '';
    if (Math.abs(extraMult - 1) > 0.001) {
      const extraTxt = Number.isInteger(extraMult)
        ? extraMult
        : extraMult.toFixed(2).replace(/\.?0+$/, '');
      const safeExtra = escapeHtml(String(extraTxt));
      const extraTag = `<span class="tag price-mult removable" data-mult="1">×${safeExtra} ✕</span>`;
      priceMultTag += extraTag;
      infoTagParts.push(`<span class="tag price-mult">×${safeExtra}</span>`);
    }
    if (row.basePrice) {
      const basePriceTxt = formatMoney(row.basePrice);
      const baseLabelRaw = (row.basePriceSource || '').toLowerCase() === 'live'
        ? 'Köpt för'
        : 'Grundpris';
      const baseLabel = escapeHtml(baseLabelRaw);
      tagList.push(`<span class="tag price-base removable" data-price="1">${baseLabelRaw}: ${basePriceTxt} ✕</span>`);
      infoTagParts.push(`<span class="tag price-base">${baseLabel}: ${escapeHtml(basePriceTxt)}</span>`);
    }
    if (tagList.length) {
      desc += `<div class="tags info-tags">${tagList.join(' ')}</div>`;
    }
    const statsHtml = itemStatHtml(entry, row);
    if (statsHtml) {
      desc += statsHtml;
      infoBody += statsHtml;
    }
    if (row.trait && !shouldShowRowTraitInName(row, entry)) {
      const label = entry.boundLabel || 'Karaktärsdrag';
      const traitHtml = `<br><strong>${label}:</strong> ${row.trait}`;
      desc += traitHtml;
      infoBody += traitHtml;
    }

    const removedQ = row.removedKval ?? [];
    const baseQuals = [
      ...(tagger.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    const baseQ = baseQuals.filter(q => !removedQ.includes(q));
    const addQ  = row.kvaliteter ?? [];
    const allowedQuals = sanitizeArmorQualities(entry, [...baseQ, ...addQ]);
    const allowance = new Map();
    allowedQuals.forEach(q => allowance.set(q, (allowance.get(q) || 0) + 1));
    const consumeAllowed = q => {
      const count = allowance.get(q) || 0;
      if (count <= 0) return false;
      allowance.set(q, count - 1);
      return true;
    };
    const visibleBaseQ = baseQ.filter(consumeAllowed);
    const visibleAddQ = addQ.filter(consumeAllowed);
    const allowedSet = new Set(allowedQuals);
    const freeQ = (row.gratisKval ?? [])
      .filter(q => !isNegativeQual(q) && !isNeutralQual(q))
      .filter(q => allowedSet.has(q));
    const all = [
      ...visibleBaseQ.map(q => ({ q, base: true })),
      ...visibleAddQ.map(q => ({ q, base: false }))
    ];
    let qualityHtml = '';
    if (all.length) {
      const qhtml = all.map(obj => {
        const q = obj.q;
        const cls = `tag removable quality${isMysticQual(q)?' mystic':''}${isNegativeQual(q)?' negative':''}${isNeutralQual(q)?' neutral':''}${freeQ.includes(q)?' free':''}`;
        const baseAttr = obj.base ? ' data-base="1"' : '';
        return `<span class="${cls}" data-qual="${q}"${baseAttr}>${q} ✕</span>`;
      }).join('');
      qualityHtml = `<div class="quality-tags tags">${qhtml}</div>`;
    }
    const qualityInfoSections = buildQualityInfoSections(all, freeQ);

    const effectVal = row.artifactEffect ?? entry.artifactEffect ?? '';
    if (isArtifact) {
      let txt, cls = 'tag';
      if (effectVal === 'corruption') {
        txt = '+1 Permanent korruption';
      } else if (effectVal === 'xp') {
        txt = '–1 Erfarenhetspoäng';
      } else {
        txt = 'Obunden';
        cls += ' unbound';
      }
      const effectHtml = `<br><span class="${cls}">${txt}</span>`;
      desc += effectHtml;
      infoBody += effectHtml;
    }
    return { desc, rowLevel, freeCnt, qualityHtml, qualityInfoSections, infoBody, infoTagParts, priceMultTag };
  }

  function renderInventory () {
    const listEl = dom.invList;
    const openKeys = new Set(
      listEl
        ? [...listEl.querySelectorAll('li.card.entry-card:not(.compact)')]
            .map(li => li.dataset.special || `${li.dataset.id || ''}|${li.dataset.trait || ''}|${li.dataset.level || ''}`)
        : []
    );
    const compactKeys = new Set(
      listEl
        ? [...listEl.querySelectorAll('li.card.entry-card.compact')]
            .map(li => li.dataset.special || `${li.dataset.id || ''}|${li.dataset.trait || ''}|${li.dataset.level || ''}`)
        : []
    );
    if (dom.invFormal) {
      [...dom.invFormal.querySelectorAll('li.card')].forEach(li => {
        if (!li.classList.contains('compact') && li.dataset.special) {
          openKeys.add(li.dataset.special);
        }
      });

      dom.invFormal.onclick = async e => {
        if (e.target.closest('.entry-collapse-btn')) return;
        const header = e.target.closest('.card-header');
        if (header && !e.target.closest('button, a, select, input, textarea, [contenteditable="true"], [role="button"]')) {
          return;
        }

        // Handle money +/- inside formal card
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'moneyPlus' || act === 'moneyMinus') {
          const cur = storeHelper.getMoney(store);
          const delta = act === 'moneyPlus' ? 1 : -1;
          const newD = (cur.daler || 0) + delta;
          if (newD < 0) {
            storeHelper.setMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          } else {
            storeHelper.setMoney(store, { ...cur, daler: newD });
          }
          renderInventory();
          return;
        }
        if (act === 'moneySkillingPlus' || act === 'moneySkillingMinus') {
          const cur = storeHelper.getMoney(store);
          const delta = act === 'moneySkillingPlus' ? 1 : -1;
          const newS = (cur.skilling || 0) + delta;
          if (newS < 0) {
            const newD = Math.max(0, (cur.daler || 0) - 1);
            const newSkilling = 3 + newS;
            storeHelper.setMoney(store, { daler: newD, skilling: newSkilling, 'örtegar': 0 });
          } else if (newS >= 4) {
            storeHelper.setMoney(store, { ...cur, daler: (cur.daler || 0) + 1, skilling: newS - 4 });
          } else {
            storeHelper.setMoney(store, { ...cur, skilling: newS });
          }
          renderInventory();
          return;
        }
        if (act === 'moneyOrtegarPlus' || act === 'moneyOrtegarMinus') {
          const cur = storeHelper.getMoney(store);
          const delta = act === 'moneyOrtegarPlus' ? 1 : -1;
          const newO = (cur['örtegar'] || 0) + delta;
          if (newO < 0) {
            const newSkilling = Math.max(0, (cur.skilling || 0) - 1);
            const newOrtegar = 8 + newO;
            const newDaler = newSkilling < (cur.skilling || 0) ? Math.max(0, (cur.daler || 0) - 1) : (cur.daler || 0);
            storeHelper.setMoney(store, { daler: newDaler, skilling: newSkilling, 'örtegar': newOrtegar });
          } else if (newO >= 8) {
            storeHelper.setMoney(store, { ...cur, skilling: (cur.skilling || 0) + 1, 'örtegar': newO - 8 });
          } else {
            storeHelper.setMoney(store, { ...cur, 'örtegar': newO });
          }
          renderInventory();
          return;
        }
      };

      if (!dom.invFormal.dataset.toggleBound) {
        dom.invFormal.addEventListener('entry-card-toggle', e => {
          updateCollapseBtnState();
          const card = e.detail?.card;
          if (!card) return;
          const expanded = Boolean(e.detail?.expanded);
          if (card.dataset.special === '__info__') {
            localStorage.setItem(INV_INFO_KEY, expanded ? '1' : '0');
          } else if (card.dataset.special === '__invfunc__') {
            localStorage.setItem(INV_TOOLS_KEY, expanded ? '1' : '0');
          }
        });
        dom.invFormal.dataset.toggleBound = '1';
      }
    }

    const allInv = storeHelper.getInventory(store);
    const flatInv = flattenInventory(allInv);
    const nameMap = makeNameMap(allInv);
    recalcArtifactEffects();
    if (window.updateXP) updateXP();
    const cash = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));
    const list = storeHelper.getCurrentList(store);

    const partyForge = LEVEL_IDX[storeHelper.getPartySmith(store) || ''] || 0;
    const skillForge = storeHelper.abilityLevel(list, 'Smideskonst');
    const forgeLvl = Math.max(partyForge, skillForge);
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(list, 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
    const skillArt = storeHelper.abilityLevel(list, 'Artefaktmakande');
    const artLevel = Math.max(partyArt, skillArt);

    const tot = flatInv.reduce((t, row) => {
      const entry = getEntry(row.id || row.name);
      const baseQuals = [
        ...(entry.taggar?.kvalitet ?? []),
        ...splitQuals(entry.kvalitet)
      ];
      const removedQ = row.removedKval ?? [];
      const allQualsRow = sanitizeArmorQualities(entry, [
        ...baseQuals.filter(q => !removedQ.includes(q)),
        ...(row.kvaliteter || [])
      ]);
      row.posQualCnt = countPositiveQuals(allQualsRow);
      const m = calcRowCost(row, forgeLvl, alcLevel, artLevel);
      t.d += m.d; t.s += m.s; t.o += m.o;
      return t;
    }, { d: 0, s: 0, o: 0 });

    tot.s += Math.floor(tot.o / OBASE); tot.o %= OBASE;
    tot.d += Math.floor(tot.s / SBASE); tot.s %= SBASE;

    const diffO = moneyToO(cash) - (tot.d * SBASE * OBASE + tot.s * OBASE + tot.o);
    const diff  = oToMoney(Math.abs(diffO));
    const diffText = `${diffO < 0 ? '-' : ''}${diff.d}D ${diff.s}S ${diff.o}Ö`;
    const unusedMoney = oToMoney(Math.max(0, diffO));
    const moneyWeight = calcMoneyWeight(unusedMoney);

    const usedWeight = allInv.reduce((s, r) => {
      const entry = getEntry(r.id || r.name);
      const isVeh = (entry.taggar?.typ || []).includes('F\u00e4rdmedel');
      return s + (isVeh ? 0 : calcRowWeight(r, list));
    }, 0) + moneyWeight;
    const traits = storeHelper.getTraits(store);
    const manualAdjust = storeHelper.getManualAdjustments(store) || {};
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(allInv) : {};
    const valStark = (traits['Stark']||0) + (bonus['Stark']||0) + (maskBonus['Stark']||0);
    const manualCapacity = Number(manualAdjust.capacity || 0);
    const baseCap = storeHelper.calcCarryCapacity(valStark, list);
    const maxCapacity = baseCap + manualCapacity;
    const remainingCap = maxCapacity - usedWeight;

    const capClassOf = (used, max) => {
      if (!max || max <= 0) return '';
      const ratio = used / max;
      if (ratio > 1.0) return 'cap-neg';
      if (ratio >= 0.95) return 'cap-crit';
      if (ratio >= 0.80) return 'cap-warn';
      return '';
    };
    const charCapClass = capClassOf(usedWeight, maxCapacity);

    const vehicles = allInv
      .map((row,i)=>({ row, entry:getEntry(row.id || row.name), idx:i }))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));
    const vehicleNameMap = makeNameMap(vehicles.map(v => v.row));
    const sumVehicleMoneyO = (vehRow) => {
      let totalO = 0;
      const stack = Array.isArray(vehRow?.contains) ? [...vehRow.contains] : [];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') continue;
        if (node.typ === 'currency' && node.money) {
          totalO += moneyToO(storeHelper.normalizeMoney(node.money));
        }
        if (Array.isArray(node.contains)) stack.push(...node.contains);
      }
      return totalO;
    };
    const vehicleMoneyLines = vehicles
      .map(v => {
        const moneyO = sumVehicleMoneyO(v.row);
        return moneyO > 0 ? { name: vehicleNameMap.get(v.row) || v.entry.namn || v.row.name || 'Färdmedel', money: formatMoney(oToMoney(moneyO)) } : null;
      })
      .filter(Boolean);

    const searchTerm = (F.invTxt || '').trim().toLowerCase();
    const hasSearch = Boolean(searchTerm);
    const union = storeHelper.getFilterUnion(store);
    const selectedTags = Array.from(new Set([...F.typ, ...F.ark, ...F.test]));
    const hasTagFilters = selectedTags.length > 0;
    const forcedCatOpen = new Set(F.typ);
    const compactDefault = storeHelper.getCompactEntries(store);
    const filteredRows = [];
    for (let idx = 0; idx < allInv.length; idx++) {
      const row = allInv[idx];
      const entry = getEntry(row.id || row.name);
      const typTags = entry.taggar?.typ || [];
      const arkRaw = entry.taggar?.ark_trad;
      const arkTags = splitArkTags(arkRaw);
      const arkList = arkTags.length ? arkTags : (Array.isArray(arkRaw) ? ['Traditionslös'] : []);
      const testTags = typeof window.getEntryTestTags === 'function'
        ? window.getEntryTestTags(entry)
        : (Array.isArray(entry.taggar?.nivå_data?.Enkel?.test)
          ? entry.taggar.nivå_data.Enkel.test
          : (Array.isArray(entry.taggar?.niva_data?.Enkel?.test)
            ? entry.taggar.niva_data.Enkel.test
            : (entry.taggar?.test || [])));
      const itemTags = [...typTags, ...arkList, ...testTags];

      const tagHit = hasTagFilters && (
        union
          ? selectedTags.some(tag => itemTags.includes(tag))
          : selectedTags.every(tag => itemTags.includes(tag))
      );

      const textHit = hasSearch ? rowMatchesText(row, searchTerm) : false;

      let passes = true;
      if (hasTagFilters || hasSearch) {
        if (union) {
          passes = (hasTagFilters && tagHit) || (hasSearch && textHit);
        } else {
          if (hasTagFilters && !tagHit) passes = false;
          if (hasSearch && !textHit) passes = false;
        }
      }

      if (!passes) continue;
      filteredRows.push({ row, idx, entry });
    }

    const foodCount = flatInv
      .filter(row => {
        const entry = getEntry(row.id || row.name);
        return (entry.taggar?.typ || []).some(t => t.toLowerCase() === 'mat');
      })
      .reduce((sum, row) => sum + (row.qty || 0), 0);

    const moneyRow = moneyWeight
      ? `<div class="cap-row"><span class="label">Myntvikt:</span><span class="value">${formatWeight(moneyWeight)}</span></div>`
      : '';

    const allFunctionButtons = [
      '<button id="manageItemsBtn" class="char-btn">Hantera föremål</button>',
      '<button id="manageEconomyBtn" class="char-btn">Hantera ekonomi</button>'
    ];
    const functionsState = localStorage.getItem(INV_TOOLS_KEY);
    const functionsOpen = functionsState === null ? true : functionsState === '1';
    if (functionsState === null) localStorage.setItem(INV_TOOLS_KEY, '1');
    const quickSpendHtml = `
      <div class="inv-live-toggle inventory-quick-spend">
        <div class="inventory-quick-spend-copy">
          <span class="inventory-quick-spend-title">Snabbspendera</span>
          <span class="inventory-quick-spend-sub">Betala direkt utan att spara köpet som inventariepost</span>
        </div>
        <div class="money-row inventory-quick-spend-row">
          <input id="inventoryQuickSpendDaler" type="number" min="0" step="1" placeholder="Daler" aria-label="Snabbspendera daler">
          <input id="inventoryQuickSpendSkilling" type="number" min="0" step="1" placeholder="Skilling" aria-label="Snabbspendera skilling">
          <input id="inventoryQuickSpendOrtegar" type="number" min="0" step="1" placeholder="Örtegar" aria-label="Snabbspendera örtegar">
        </div>
        <button id="inventoryQuickSpendBtn" class="char-btn" type="button">Betala</button>
      </div>`;
    const liveModeEnabled = typeof storeHelper?.getLiveMode === 'function' && storeHelper.getLiveMode(store);
    const liveToggleHtml = `
      <div class="inv-live-toggle">
        <label class="toggle-switch">
          <input id="inventoryLiveToggle" type="checkbox" aria-label="Slå på eller av live-läge"${liveModeEnabled ? ' checked' : ''}>
          <span class="toggle-switch-track" aria-hidden="true"></span>
          <div class="toggle-switch-copy">
            <span class="toggle-switch-title">Live-läge</span>
            <span class="toggle-switch-sub">Dra pengar direkt och markera inköp som gratis</span>
          </div>
        </label>
      </div>`;
    const functionsCard = createEntryCard({
      compact: !functionsOpen,
      dataset: { special: '__invfunc__' },
      nameHtml: 'Inventarie',
      titleSuffixHtml: icon('basket', { className: 'title-icon', alt: 'Inventarie' }),
      descHtml: `<div class="card-desc"><div class="inv-buttons">${allFunctionButtons.join('')}</div>${quickSpendHtml}${liveToggleHtml}</div>`,
      collapsible: true
    });

    const infoKey  = '__info__';
    const infoState = localStorage.getItem(INV_INFO_KEY);
    const infoOpen  = infoState === null ? true : infoState === '1';
    if (infoState === null) localStorage.setItem(INV_INFO_KEY, '1');

    const infoCardDesc = `
          <div class="formal-section">
            <div class="formal-title">Pengar
              <div class="money-control">
                <button id="moneyMinusBtn" data-act="moneyMinus" class="char-btn icon icon-only" aria-label="Minska mynt" title="Minska mynt">${icon('minus')}</button>
                <button id="moneyPlusBtn" data-act="moneyPlus" class="char-btn icon icon-only" aria-label="Öka mynt" title="Öka mynt">${icon('plus')}</button>
              </div>
            </div>
            <div class="money-line"><span class="label">Kontant:</span><span class="value">${cash.daler}D ${cash.skilling}S ${cash['örtegar']}Ö</span></div>
            <div class="money-line"><span class="label">Oanvänt:</span><span class="value" id="unusedOut">0D 0S 0Ö</span></div>
            ${moneyRow}
            ${vehicleMoneyLines.map(v => `<div class="money-line"><span class="label">Pengar på ${escapeHtml(v.name)}:</span><span class="value">${v.money}</span></div>`).join('')}
          </div>
          <div class="formal-section ${charCapClass}">
            <div class="formal-title">Bärkapacitet</div>
            <div class="cap-row"><span class="label">Max:</span><span class="value">${formatWeight(maxCapacity)}</span></div>
            <div class="cap-row"><span class="label">Återstående:</span><span class="value">${formatWeight(remainingCap)}</span></div>
            <div class="cap-row cap-food"><span class="label">Proviant:</span><span class="value">${foodCount}</span></div>
          </div>`;
    const infoCard = createEntryCard({
      compact: !infoOpen,
      dataset: { special: infoKey },
      nameHtml: 'Information',
      titleSuffixHtml: icon('money-bag', { className: 'title-icon', alt: 'Information' }),
      descHtml: `<div class="card-desc">${infoCardDesc}</div>`,
      collapsible: true
    });

    const renderRowCard = (row, realIdx, entryOverride) => {
      const entry = entryOverride || getEntry(row.id || row.name);
      const tagTyp = entry.taggar?.typ ?? [];
      const isVehicle = tagTyp.includes('F\u00e4rdmedel');
      const baseWeight = row.vikt ?? entry.vikt ?? entry.stat?.vikt ?? 0;
      const rowWeight = calcRowWeight(row, list);
      const loadWeight = rowWeight - baseWeight * (row.qty || 0);
      const capacity = isVehicle ? (entry.stat?.b\u00e4rkapacitet || 0) : 0;
      const remaining = capacity - loadWeight;

      const { desc, rowLevel, freeCnt, qualityHtml, qualityInfoSections, infoBody, infoTagParts, priceMultTag } = buildRowDesc(entry, row);
      const dataset = {
        idx: String(realIdx),
        id: row.id || row.name,
        name: row.name
      };
      if (row.trait) dataset.trait = row.trait;
      if (rowLevel) dataset.level = rowLevel;

      const isArtifact = tagTyp.includes('Artefakt');
      const isCustom = tagTyp.includes('Hemmagjort');
      const isGear = ['Vapen', 'Sköld', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakt', 'Färdmedel'].some(t => tagTyp.includes(t));
      const allowQual = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt'].some(t => tagTyp.includes(t));
      const canStack = ['kraft','ritual'].includes(entry.bound);
      const isCurrency = row.typ === 'currency' && row.money;
      const moneyAmount = (isCurrency && typeof formatMoney === 'function')
        ? formatMoney(storeHelper.normalizeMoney(row.money))
        : '';
      const buttonParts = [];
      if (isGear && !canStack) {
        buttonParts.push(`<button data-act="del" class="char-btn danger icon icon-only">${icon('remove')}</button>`);
      } else {
        buttonParts.push(
          `<button data-act="del" class="char-btn danger icon icon-only">${icon('remove')}</button>`,
          `<button data-act="sub" class="char-btn icon icon-only" aria-label="Minska">${icon('minus')}</button>`,
          `<button data-act="add" class="char-btn icon icon-only" aria-label="Lägg till">${icon('plus')}</button>`,
          `<button data-act="buyMulti" class="char-btn icon icon-only" aria-label="Köp flera">${icon('buymultiple')}</button>`
        );
      }
      if (isCustom) buttonParts.push('<button data-act="editCustom" class="char-btn">✏️</button>');
      if (allowQual) buttonParts.push(`<button data-act="addQual" class="char-btn">${icon('addqual')}</button>`);
      if (allowQual) buttonParts.push(`<button data-act="freeQual" class="char-btn">${icon('qualfree')}</button>`);
      if (isArtifact) buttonParts.push('<button data-act="toggleEffect" class="char-btn">↔</button>');
      buttonParts.push(`<button data-act="free" class="char-btn${freeCnt ? ' danger' : ''}" title="Gör föremål gratis (Shift-klick rensar)">${icon('free')}</button>`);
      if (isVehicle) {
        buttonParts.push(
          `<button data-act="vehicleLoad" class="char-btn icon icon-only" aria-label="Lasta i fordon">${icon('arrow-down')}</button>`,
          `<button data-act="vehicleUnload" class="char-btn icon icon-only" aria-label="Ta ur fordon">${icon('arrow-up')}</button>`
        );
      }

      const badge = row.qty > 1 ? `<span class="count-badge">×${row.qty}</span>` : '';
      const priceText = isCurrency
        ? moneyAmount
        : formatMoney(calcRowCost(row, forgeLvl, alcLevel, artLevel));
      const priceLabel = isCurrency
        ? 'Belopp'
        : (tagTyp.includes('Anställning') ? 'Dagslön' : 'Pris');
      const priceDisplay = `${priceLabel}: ${priceText}`.trim();
      const weightText = formatWeight(rowWeight);
      const weightClass = isVehicle ? capClassOf(loadWeight, capacity) : charCapClass;
      const cardKey = `${row.id || row.name}|${row.trait || ''}|${rowLevel || ''}`;
      const children = Array.isArray(row.contains) ? row.contains : [];
      const vehicleMoneyO = isVehicle
        ? children.reduce((sum, child) => {
            if (child?.typ === 'currency' && child.money) {
              return sum + moneyToO(storeHelper.normalizeMoney(child.money));
            }
            return sum;
          }, 0)
        : 0;
      const vehicleMoneyText = vehicleMoneyO > 0 && typeof formatMoney === 'function'
        ? formatMoney(oToMoney(vehicleMoneyO))
        : '';

      let isCompact = compactDefault;
      if (openKeys.has(cardKey)) isCompact = false;
      else if (compactKeys.has(cardKey)) isCompact = true;

      const infoFacts = [];

      const singleLevel = hasSingleLevel(entry);
      const levelMark = singleLevel && rowLevel ? levelMarker(rowLevel) : '';
      if (levelMark) {
        const levelTitle = escapeHtml(rowLevel);
        infoFacts.push(`<div class="card-info-fact level-marker" title="${levelTitle}"><span class="card-info-fact-value" aria-label="${levelTitle}">${levelMark}</span></div>`);
      }

      infoFacts.push(`<div class="card-info-fact"><span class="card-info-fact-label">Vikt</span><span class="card-info-fact-value">${weightText}</span></div>`);
      if (isVehicle && vehicleMoneyText) {
        infoFacts.push(`<div class="card-info-fact"><span class="card-info-fact-label">Pengar</span><span class="card-info-fact-value">${vehicleMoneyText}</span></div>`);
      }

      const priceTitle = escapeHtml(priceLabel);
      const priceValue = escapeHtml(priceDisplay);
      const priceBtnHtml = `<button type="button" class="price-click" data-act="priceQuick" title="${priceTitle}" aria-label="${priceValue}">${priceValue}</button>`;
      const priceFactParts = [
        '<div class="card-info-fact card-info-price">',
        `<span class="card-info-fact-value">${priceBtnHtml}</span>`
      ];
      if (priceMultTag) priceFactParts.push(priceMultTag);
      priceFactParts.push('</div>');
      const priceFactHtml = priceFactParts.join('');
      if (isVehicle) {
        infoFacts.push(`<div class="card-info-fact"><span class="card-info-fact-label">Kapacitet</span><span class="card-info-fact-value"><span class="${capClassOf(loadWeight, capacity)}">${formatWeight(remaining)}</span></span></div>`);
      }
      infoFacts.push(priceFactHtml);
      const infoBoxHtml = `<div class="card-info-box"><div class="card-info-inline"><div class="card-info-facts">${infoFacts.join('')}</div></div></div>`;

      const infoMeta = [];
      if (priceText) infoMeta.push({ label: priceLabel, value: priceText });
      if (weightText) infoMeta.push({ label: 'Vikt', value: weightText });
      if (isVehicle) {
        if (vehicleMoneyText) infoMeta.push({ label: 'Pengar', value: vehicleMoneyText });
        infoMeta.push({ label: 'Bärkapacitet', value: formatWeight(capacity) });
        infoMeta.push({ label: 'Återstående kapacitet', value: formatWeight(remaining) });
      }

      const buildInfoButton = ({ bodyHtml = '', tags = [], meta = [], sections = [] } = {}) => {
        const tagsHtml = Array.isArray(tags) ? tags.filter(Boolean).join(' ') : String(tags || '');
        const metaItems = Array.isArray(meta)
          ? meta.filter(item => {
              if (!item) return false;
              const value = item.value;
              return !(value === undefined || value === null || value === '');
            })
          : [];
        const sectionItems = Array.isArray(sections)
          ? sections.filter(item => item && String(item.content || '').trim())
          : [];
        const bodyStr = typeof bodyHtml === 'string' ? bodyHtml : String(bodyHtml || '');
        if (!tagsHtml.trim() && !metaItems.length && !bodyStr.trim() && !sectionItems.length) return '';
        const infoPanelHtml = buildInfoPanelHtml({ tagsHtml, bodyHtml: bodyStr, meta: metaItems, sections: sectionItems });
        return `<button class="char-btn icon icon-only info-btn" data-info="${encodeURIComponent(infoPanelHtml)}" aria-label="Visa info">${icon('info')}</button>`;
      };

      const infoBtnHtml = buildInfoButton({
        bodyHtml: infoBody,
        tags: infoTagParts,
        meta: infoMeta,
        sections: qualityInfoSections
      });

      const badgeParts = [];
      badgeParts.push(`<span class="meta-badge weight-badge${weightClass ? ` ${weightClass}` : ''}" title="Vikt">V: ${weightText}</span>`);
      if (isVehicle) {
        badgeParts.push(`<span class="meta-badge capacity-badge" title="Bärkapacitet">BK: ${formatWeight(capacity)}</span>`);
        badgeParts.push(`<span class="meta-badge remaining-badge${remaining < 0 ? ' cap-neg' : ''}" title="Återstående">ÅK: ${formatWeight(remaining)}</span>`);
      }
      const leftSections = badgeParts.length ? [`<div class="meta-badges">${badgeParts.join('')}</div>`] : [];

      const descHtml = desc ? `<div class="card-desc">${desc}</div>` : '';
      const classes = [];
      if (isVehicle && remaining < 0) classes.push('vehicle-over');

      const displayName = nameMap.get(row) || row.name;
      const baseName = `${displayName}`;

      const li = createEntryCard({
        compact: isCompact,
        classes,
        dataset,
        nameHtml: baseName,
        titleSuffixHtml: badge,
        infoBox: infoBoxHtml,
        descHtml,
        qualityHtml,
        leftSections,
        titleActions: infoBtnHtml ? [infoBtnHtml] : [],
        buttonSections: buttonParts,
        collapsible: true
      });

      const txt = (F.invTxt || '').toLowerCase();
      const filteredChildren = (() => {
        if (!children.length) return [];
        if (!isVehicle) return children.map((c, j) => ({ c, j }));
        const pairs = children.map((c, j) => ({ c, j }));
        if (!txt) return pairs;
        const selfMatch = String(row.name || '').toLowerCase().includes(txt);
        if (selfMatch) return pairs;
        return pairs.filter(({ c }) => rowMatchesText(c, txt));
      })();

      const renderChildCard = (childRow, childIdx) => {
        const centry = getEntry(childRow.name);
        const cTagTyp = centry.taggar?.typ ?? [];
        const cIsArtifact = cTagTyp.includes('Artefakt');
        const cIsCustom = cTagTyp.includes('Hemmagjort');
        const cIsGear = ['Vapen', 'Sköld', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakt'].some(t => cTagTyp.includes(t));
        const cAllowQual = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt'].some(t => cTagTyp.includes(t));
        const cCanStack = ['kraft','ritual'].includes(centry.bound);
        const cButtons = [];
        if (cIsGear && !cCanStack) {
          cButtons.push(`<button data-act="del" class="char-btn danger icon icon-only">${icon('remove')}</button>`);
        } else {
          cButtons.push(
            `<button data-act="del" class="char-btn danger icon icon-only">${icon('remove')}</button>`,
            `<button data-act="sub" class="char-btn icon icon-only" aria-label="Minska">${icon('minus')}</button>`,
            `<button data-act="add" class="char-btn icon icon-only" aria-label="Lägg till">${icon('plus')}</button>`,
            `<button data-act="buyMulti" class="char-btn icon icon-only" aria-label="Köp flera">${icon('buymultiple')}</button>`
          );
        }
        if (cTagTyp.includes('Hemmagjort')) cButtons.push('<button data-act="editCustom" class="char-btn">✏️</button>');
        if (cAllowQual) cButtons.push(`<button data-act="addQual" class="char-btn">${icon('addqual')}</button>`);
        if (cAllowQual) cButtons.push(`<button data-act="freeQual" class="char-btn">${icon('qualfree')}</button>`);
        if (cIsArtifact) cButtons.push('<button data-act="toggleEffect" class="char-btn">↔</button>');

        const { desc: cDesc, rowLevel: cRowLevel, freeCnt: cFreeCnt, qualityHtml: cQualityHtml, qualityInfoSections: cQualityInfoSections, infoBody: cInfoBody, infoTagParts: cInfoTagParts } = buildRowDesc(centry, childRow);
        cButtons.push(`<button data-act="free" class="char-btn${cFreeCnt ? ' danger' : ''}" title="Gör föremål gratis (Shift-klick rensar)">${icon('free')}</button>`);

        const cIsCurrency = childRow.typ === 'currency' && childRow.money;
        const cMoneyAmount = cIsCurrency && typeof formatMoney === 'function'
          ? formatMoney(storeHelper.normalizeMoney(childRow.money))
          : '';
        const cBadge = childRow.qty > 1 ? `<span class="count-badge">×${childRow.qty}</span>` : '';
        const cPriceText = cIsCurrency && cMoneyAmount
          ? cMoneyAmount
          : formatMoney(calcRowCost(childRow, forgeLvl, alcLevel, artLevel));
        const cPriceLabel = cIsCurrency
          ? 'Belopp'
          : (cTagTyp.includes('Anställning') ? 'Dagslön' : 'Pris');
        const cPriceDisplay = `${cPriceLabel}: ${cPriceText}`.trim();
        const cWeightText = formatWeight(calcRowWeight(childRow, list));
        const cWeightClass = capClassOf(loadWeight, capacity);
        const cKey = `${childRow.id || childRow.name}|${childRow.trait || ''}|${cRowLevel || ''}`;

        let childCompact = compactDefault;
        if (openKeys.has(cKey)) childCompact = false;
        else if (compactKeys.has(cKey)) childCompact = true;

        const cInfoFacts = [];

        const cSingleLevel = hasSingleLevel(centry);
        const cLevelMark = cSingleLevel && cRowLevel ? levelMarker(cRowLevel) : '';
        if (cLevelMark) {
          const cLevelTitle = escapeHtml(cRowLevel);
          cInfoFacts.push(`<div class="card-info-fact level-marker" title="${cLevelTitle}"><span class="card-info-fact-value" aria-label="${cLevelTitle}">${cLevelMark}</span></div>`);
        }

        cInfoFacts.push(`<div class="card-info-fact"><span class="card-info-fact-label">Vikt</span><span class="card-info-fact-value">${cWeightText}</span></div>`);

        const cPriceTitle = escapeHtml(cPriceLabel);
        const cPriceValue = escapeHtml(cPriceDisplay);
        cInfoFacts.push(`<div class="card-info-fact card-info-price"><span class="card-info-fact-value"><button type="button" class="price-click" data-act="priceQuick" title="${cPriceTitle}" aria-label="${cPriceValue}">${cPriceValue}</button></span></div>`);
        const cInfoBox = `<div class="card-info-box"><div class="card-info-inline"><div class="card-info-facts">${cInfoFacts.join('')}</div></div></div>`;

        const cInfoMeta = [];
        if (cPriceText) cInfoMeta.push({ label: cPriceLabel, value: cPriceText });
        if (cWeightText) cInfoMeta.push({ label: 'Vikt', value: cWeightText });

        const cInfoBtnHtml = buildInfoButton({
          bodyHtml: cInfoBody,
          tags: cInfoTagParts,
          meta: cInfoMeta,
          sections: cQualityInfoSections
        });

        const cBadgeParts = [
          `<span class="meta-badge weight-badge${cWeightClass ? ` ${cWeightClass}` : ''}" title="Vikt">V: ${cWeightText}</span>`
        ];
        const cLeftSections = cBadgeParts.length ? [`<div class="meta-badges">${cBadgeParts.join('')}</div>`] : [];

        const childDataset = {
          parent: String(realIdx),
          child: String(childIdx),
          id: childRow.id || childRow.name,
          name: childRow.name
        };
        if (childRow.trait) childDataset.trait = childRow.trait;
        if (cRowLevel) childDataset.level = cRowLevel;

        const childClasses = [];
        if (remaining < 0) childClasses.push('vehicle-over');

        const childName = nameMap.get(childRow) || childRow.name;
        const childDisplayName = (cIsCurrency && cPriceText)
          ? `${childName} (${cPriceText})`
          : childName;
        const childBaseName = childDisplayName;

        const childLi = createEntryCard({
          compact: childCompact,
          classes: childClasses,
          dataset: childDataset,
          nameHtml: childBaseName,
          titleSuffixHtml: cBadge,
          infoBox: cInfoBox,
          descHtml: cDesc ? `<div class="card-desc">${cDesc}</div>` : '',
          qualityHtml: cQualityHtml,
          leftSections: cLeftSections,
          titleActions: cInfoBtnHtml ? [cInfoBtnHtml] : [],
          buttonSections: cButtons,
          collapsible: true
        });

        return childLi;
      };

      if (filteredChildren.length) {
        const sublistEl = document.createElement('ul');
        sublistEl.className = 'card-list vehicle-items entry-card-list';
        filteredChildren.forEach(({ c, j }) => {
          const childLi = renderChildCard(c, j);
          if (childLi) sublistEl.appendChild(childLi);
        });
        if (sublistEl.childElementCount) {
          const detailsHost = li.querySelector('.entry-card-details') || li;
          const shellEl = document.createElement('div');
          shellEl.className = 'vehicle-items-shell';
          const headerEl = document.createElement('div');
          headerEl.className = 'vehicle-items-header';
          const titleEl = document.createElement('span');
          titleEl.className = 'vehicle-items-title';
          titleEl.textContent = `Innehåll i ${displayName}`;
          const countEl = document.createElement('span');
          countEl.className = 'vehicle-items-count';
          countEl.textContent = String(filteredChildren.length);
          headerEl.appendChild(titleEl);
          headerEl.appendChild(countEl);
          shellEl.appendChild(headerEl);
          shellEl.appendChild(sublistEl);
          detailsHost.appendChild(shellEl);
        }
      }

      return li;
    };
    if (dom.invFormal) {
      dom.invFormal.innerHTML = '';
      dom.invFormal.appendChild(functionsCard);
      dom.invFormal.appendChild(infoCard);
    }

    if (listEl) {
      listEl.innerHTML = '';
      if (filteredRows.length) {
        const categories = new Map();
        filteredRows.forEach(({ row, idx, entry }) => {
          const cat = (entry.taggar?.typ || [])[0] || 'Övrigt';
          const cardEl = renderRowCard(row, idx, entry);
          if (!categories.has(cat)) categories.set(cat, []);
          categories.get(cat).push(cardEl);
        });
        const catState = loadInvCatState();
        const catKeys = [...categories.keys()].sort(catComparator);
        const fragment = document.createDocumentFragment();
        catKeys.forEach(cat => {
          const shouldOpen = hasSearch
            ? true
            : (forcedCatOpen.has(cat)
                ? true
                : (catState[cat] !== undefined ? catState[cat] : true));
          const catLi = document.createElement('li');
          catLi.className = 'cat-group';
          const detailsEl = document.createElement('details');
          detailsEl.dataset.cat = cat;
          if (shouldOpen) detailsEl.open = true;
          const summaryEl = document.createElement('summary');
          summaryEl.textContent = catName(cat);
          detailsEl.appendChild(summaryEl);
          const innerUl = document.createElement('ul');
          innerUl.className = 'card-list entry-card-list';
          innerUl.dataset.cat = cat;
          categories.get(cat).forEach(card => innerUl.appendChild(card));
          detailsEl.appendChild(innerUl);
          catLi.appendChild(detailsEl);
          fragment.appendChild(catLi);
        });
        listEl.appendChild(fragment);

        listEl.querySelectorAll('.cat-group > details').forEach(detailsEl => {
          detailsEl.addEventListener('toggle', ev => {
            if (!ev.isTrusted) return;
            const cat = detailsEl.dataset.cat;
            catState[cat] = detailsEl.open;
            saveInvCatState(catState);
            if (typeof window.inventorySyncCats === 'function') window.inventorySyncCats();
          });
        });
        if (typeof window.inventorySyncCats === 'function') window.inventorySyncCats();
      } else {
        const emptyCard = createEntryCard({
          classes: ['empty'],
          nameHtml: 'Inga föremål.',
          collapsible: false
        });
        listEl.appendChild(emptyCard);
        if (typeof window.inventorySyncCats === 'function') window.inventorySyncCats();
      }
    } else if (typeof window.inventorySyncCats === 'function') {
      window.inventorySyncCats();
    }


    renderActiveFilters();

    if (dom.wtOut) dom.wtOut.textContent = formatWeight(usedWeight);
    if (dom.slOut) dom.slOut.textContent = formatWeight(maxCapacity);
    dom.unusedOut = getEl('unusedOut');
    if (dom.unusedOut) dom.unusedOut.textContent = diffText;
    bindInv();
    bindMoney();
    if (typeof window.refreshEffectsPanel === 'function') {
      window.refreshEffectsPanel();
    }
  }


  function getInvCards() {
    const formalCards = dom.invFormal ? [...dom.invFormal.querySelectorAll('li.card')] : [];
    const listCards   = dom.invList   ? [...dom.invList.querySelectorAll('li.card')]   : [];
    return [...formalCards, ...listCards];
  }

  function updateCollapseBtnState() {
    if (!dom.collapseAllBtn) return;
    const cards = getInvCards();
    if (!cards.length) return;
    // Follow same pattern as taskbar: ▶ when all collapsed, ▼ when any open
    const allCollapsed = cards.every(li => li.classList.contains('compact'));
    dom.collapseAllBtn.textContent = allCollapsed ? '▶' : '▼';
    dom.collapseAllBtn.title = allCollapsed ? 'Öppna alla' : 'Kollapsa alla';
  }

  function bindInv() {
    const role = document.body?.dataset?.role;
    if (role !== 'inventory') {
      // Shared toolbar exists on every page; avoid binding inventory-only filters elsewhere.
      return;
    }

    const listEl = dom.invList;
    const searchEl = dom.sIn || getEl('searchField');
    const bindFilterSelect = (el, key) => {
      if (!el || el.dataset.invBound) return;
      el.dataset.invBound = '1';
      el.addEventListener('change', () => {
        const val = el.value;
        if (!val) return;
        if (key === 'typ' && val === '__onlySelected') {
          el.value = '';
          return;
        }
        if (!F[key].includes(val)) F[key].push(val);
        el.value = '';
        renderInventory();
      });
    };
    bindFilterSelect(dom.typSel, 'typ');
    bindFilterSelect(dom.arkSel, 'ark');
    bindFilterSelect(dom.tstSel, 'test');
    if (dom.active && !dom.active.dataset.invBound) {
      dom.active.dataset.invBound = '1';
      dom.active.addEventListener('click', e => {
        const tag = e.target.closest('.tag.removable');
        if (!tag) return;
        const type = tag.dataset.type;
        if (type === 'text') {
          F.invTxt = '';
          if (searchEl) searchEl.value = '';
        } else if (type === 'typ' || type === 'ark' || type === 'test') {
          const val = tag.dataset.val;
          F[type] = F[type].filter(item => item !== val);
        }
        renderInventory();
      });
    }
    const manageItemsBtn = getEl('manageItemsBtn');
    if (manageItemsBtn) {
      manageItemsBtn.onclick = () => openInventoryCustomItemManager();
    }
    if (dom.collapseAllBtn) {
      dom.collapseAllBtn.onclick = () => {
        const cards = getInvCards();
        const anyOpen = cards.some(li => !li.classList.contains('compact'));
        cards.forEach(li => {
          li.classList.toggle('compact', anyOpen);
          window.entryCardFactory?.syncCollapse?.(li);
          if (li.dataset.special === '__invfunc__') {
            localStorage.setItem(INV_TOOLS_KEY, anyOpen ? '0' : '1');
          } else if (li.dataset.special === '__info__') {
            localStorage.setItem(INV_INFO_KEY, anyOpen ? '0' : '1');
          }
        });
        updateCollapseBtnState();
      };

      listEl.addEventListener('entry-card-toggle', e => {
        updateCollapseBtnState();
        const detail = e.detail || {};
        const card = detail.card;
        if (!card) return;
        const expanded = Boolean(detail.expanded);
        if (card.dataset.special === '__invfunc__') {
          localStorage.setItem(INV_TOOLS_KEY, expanded ? '1' : '0');
        } else if (card.dataset.special === '__info__') {
          localStorage.setItem(INV_INFO_KEY, expanded ? '1' : '0');
        }
      });
    }
    const getRowInfo = (inv, li) => {
      const idx = Number(li.dataset.idx);
      if (!Number.isNaN(idx)) return { row: inv[idx], parentArr: inv, idx };
      const p = Number(li.dataset.parent);
      const c = Number(li.dataset.child);
      if (!Number.isNaN(p) && !Number.isNaN(c)) {
        const arr = inv[p].contains || [];
        return { row: arr[c], parentArr: arr, idx: c };
      }
      return { row: null, parentArr: inv, idx: -1 };
    };
    if (listEl) {
      listEl.onclick = async e => {
        const infoBtn = e.target.closest('button[data-info]');
        if (infoBtn) {
          let infoHtml = infoBtn.dataset.info || '';
          try {
            infoHtml = decodeURIComponent(infoHtml);
          } catch {}
          const li = infoBtn.closest('li');
          const title = li?.querySelector('.card-title .entry-title-main')?.textContent || '';
          if (typeof window.yrkePanel?.open === 'function') {
            window.yrkePanel.open(title, infoHtml);
          }
          return;
        }
        // 1) Klick på kryss för att ta bort en enskild kvalitet eller gratisstatus
        const removeTagBtn = e.target.closest('.tag.removable');
        if (removeTagBtn) {
          const li   = removeTagBtn.closest('li');
          const inv  = storeHelper.getInventory(store);
          const { row } = getRowInfo(inv, li);
          if (!row) return;
          if (removeTagBtn.dataset.free) {
            const pg = row.perkGratis || 0;
            if (pg > 0 && !(await confirmGrantRemoval(row.perk))) {
              return;
            }
            row.gratis = 0;
            if (pg > 0) row.perkGratis = 0;
          } else if (removeTagBtn.dataset.qual) {
            const q    = removeTagBtn.dataset.qual;
            const isBase = removeTagBtn.dataset.base === '1';
            if (removeTagBtn.classList.contains('free')) {
              row.gratisKval = (row.gratisKval || []).filter(x => x !== q);
              row.kvaliteter = row.kvaliteter || [];
              if (isBase) {
                row.removedKval = row.removedKval || [];
                if (!row.removedKval.includes(q)) row.removedKval.push(q);
              } else {
                row.kvaliteter = row.kvaliteter.filter(x => x !== q);
              }
              row.kvaliteter.push(q);
            } else {
              if (isBase) {
                row.removedKval = row.removedKval || [];
                if (!row.removedKval.includes(q)) row.removedKval.push(q);
              } else if (row?.kvaliteter) {
                row.kvaliteter = row.kvaliteter.filter(x => x !== q);
              }
              if (row.gratisKval) {
                row.gratisKval = row.gratisKval.filter(x => x !== q);
              }
            }
            if (Array.isArray(row.manualQualityOverride)) {
              const keep = row.manualQualityOverride.filter(x => (row.kvaliteter || []).includes(x));
              if (keep.length) row.manualQualityOverride = keep;
              else delete row.manualQualityOverride;
            }
          } else if (removeTagBtn.dataset.mult) {
            delete row.priceMult;
          } else if (removeTagBtn.dataset.price) {
            delete row.basePrice;
            delete row.basePriceSource;
          }
          saveInventory(inv);
          renderInventory();
          return;
        }

      const collapseBtn = e.target.closest('.entry-collapse-btn');
      if (collapseBtn) return;

      const header = e.target.closest('.card-header');
      if (header && !e.target.closest('button, a, select, input, textarea, [contenteditable="true"], [role="button"]')) {
        return;
      }

      // 2b) Klick på Pris: öppnar snabbpris-popup för aktuell rad
      const priceQuick = e.target.closest('[data-act="priceQuick"]');
      if (priceQuick) {
        const li = priceQuick.closest('li');
        const inv = storeHelper.getInventory(store);
        const { row } = getRowInfo(inv, li);
        if (row) openRowPricePopup(row);
        return;
      }

      // 2c) Klick på nivåtaggen: cykla mellan tillgängliga nivåer
      const lvlTag = e.target.closest('.tag.level');
      if (lvlTag) {
        const li = lvlTag.closest('li');
        const inv = storeHelper.getInventory(store);
        const { row } = getRowInfo(inv, li);
        if (!row) return;
        const entry = getEntry(row.id || row.name);
        const levels = Object.keys(entry.nivåer || {});
        if (!levels.length) return;
        const cur = row.nivå || '';
        const idx = levels.indexOf(cur);
        const next = idx === -1 ? levels[0] : (idx < levels.length - 1 ? levels[idx+1] : levels[0]);
        row.nivå = next;
        saveInventory(inv);
        renderInventory();
        return;
      }

      // 3) Klick på knapp i inventarielistan
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;

      const act = btn.dataset.act;
      const li  = btn.closest('li');
      const inv = storeHelper.getInventory(store);
      const { row, parentArr, idx } = getRowInfo(inv, li);
      if (act === 'editCustom') {
        if (!row) return;
        const entry = getEntry(row.id || row.name);
        if (!entry) return;
        editCustomEntry(entry, () => {
          renderInventory();
          if (window.indexViewRefreshFilters) window.indexViewRefreshFilters();
          if (window.indexViewUpdate) window.indexViewUpdate();
        });
        return;
      }
      if (act === 'vehicleLoad') {
        const entry = getEntry(row.id || row.name);
        const rootIdx = Number(li?.dataset?.idx);
        if (!Number.isNaN(rootIdx)) openVehiclePopup(rootIdx);
        else if (entry?.id) openVehiclePopup(entry.id);
        else openVehiclePopup();
        return;
      }
      if (act === 'vehicleUnload') {
        openVehicleRemovePopup(idx);
        return;
      }
      if (act === 'moneyPlus' || act === 'moneyMinus') {
        const cur = storeHelper.getMoney(store);
        const delta = act === 'moneyPlus' ? 1 : -1;
        const newD = (cur.daler || 0) + delta;
        if (newD < 0) {
          storeHelper.setMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
        } else {
          storeHelper.setMoney(store, { ...cur, daler: newD });
        }
        renderInventory();
        return;
      }

      // 3a) Röd soptunna tar bort hela posten
      if (act === 'del') {
        if (row) {
          const pg = row.perkGratis || 0;
          if (pg > 0 && !(await confirmGrantRemoval(row.perk))) {
            return;
          }
          const entry  = getEntry(row.id || row.name);
          const tagTyp = entry.taggar?.typ || [];
          const isVeh  = tagTyp.includes('F\u00e4rdmedel');
          const hasStuff = Array.isArray(row.contains) && row.contains.length > 0;
          li.classList.add('rm-flash');
          await new Promise(r => setTimeout(r, 100));
          if (isVeh && hasStuff) {
            openDeleteContainerPopup(
              () => {
                parentArr.splice(idx, 1);
                saveInventory(inv);
                renderInventory();
              },
              () => {
                parentArr.splice(idx, 1, ...(row.contains || []));
                saveInventory(inv);
                renderInventory();
              },
              {
                message: 'Du håller på att ta bort ett färdmedel som innehåller föremål. Vill du ta bort föremålen i färdmedlet?',
                onlyLabel: 'Ta bara bort färdmedlet'
              }
            );
          } else {
            parentArr.splice(idx, 1);
            saveInventory(inv);
            renderInventory();
            const hidden = isHiddenType(entry);
            if (needsArtifactListSync(entry)) {
              const still = flattenInventory(inv).some(r => (r.id ? r.id === row.id : r.name === row.name));
              if (!still) {
                let list = storeHelper.getCurrentList(store).filter(x => !(x.id === row.id && x.noInv));
                storeHelper.setCurrentList(store, list);
                if (window.updateXP) updateXP();
                if (window.renderTraits) renderTraits();
                if (hidden) storeHelper.removeRevealedArtifact(store, row.id || row.name);
              }
            }
          }
        }
        return;
      }

      // 3b) För + / - / 🔨 behöver vi id
      const itemName = li.dataset.name;
      const entry    = getEntry(itemName);
      const tagTyp   = entry.taggar?.typ || [];

      if (act === 'buyMulti') {
        if (!row || !entry) return;
        openBuyMultiplePopup({ row, entry, inv, li, parentArr, idx });
        return;
      }

        // "+" lägger till qty eller en ny instans
        if (act === 'add') {
          const liveEnabled = typeof storeHelper?.getLiveMode === 'function' && storeHelper.getLiveMode(store);
          const livePairs = liveEnabled ? [] : null;
          let purchase = null;
          const bundleRefs = addInventoryBundle(inv, entry, { livePairs });
          if (bundleRefs.length) {
            if (livePairs && livePairs.length) {
              applyLiveModePayment(livePairs);
              livePairs.length = 0;
            }
            saveInventory(inv);
            renderInventory();
            bundleRefs.forEach(ref => {
              const refName = String(ref?.name || '').trim();
              if (!refName) return;
              const i = inv.findIndex(r => rowMatchesInventoryRef(r, ref));
              if (i < 0) return;
              const flashLi = dom.invList?.querySelector(`li[data-name="${CSS.escape(refName)}"][data-idx="${i}"]`);
              if (flashLi) {
                flashLi.classList.add('inv-flash');
                setTimeout(() => flashLi.classList.remove('inv-flash'), 600);
              }
            });
          } else {
            if (liveEnabled) {
              purchase = await openLiveBuyPopup(entry, row);
              if (!purchase) return;
            }
            const indiv = isIndividualItem(entry);
            const tagTyp = entry.taggar?.typ || [];
            let artifactEffect = '';
            if (tagTyp.includes('Artefakt')) {
              const artifactChoice = await pickInventoryEntryChoice({
                entry,
                row,
                list: storeHelper.getCurrentList(store),
                inv,
                field: 'artifactEffect',
                currentValue: row?.artifactEffect || '',
                usedValues: []
              });
              if (artifactChoice.hasChoice) {
                if (artifactChoice.cancelled) return;
                artifactEffect = artifactChoice.value || '';
              }
            }
            const addRow = trait => {
              const qtyToAdd = Math.max(1, purchase?.qty || 1);
              const priceMoney = purchase ? purchase.pricePerUnit : null;
              const inheritedPriceMult = normalizeMultiplierValue(row?.priceMult, 1);
              const applyLiveBase = target => {
                if (!priceMoney || !target) return;
                target.basePrice = {
                  daler: priceMoney.daler,
                  skilling: priceMoney.skilling,
                  'örtegar': priceMoney['örtegar']
                };
                target.basePriceSource = 'live';
              };
              const applyInheritedMultipliers = target => {
                if (!target || typeof target !== 'object') return;
                if (Math.abs(inheritedPriceMult - 1) > 0.001) target.priceMult = inheritedPriceMult;
              };
              let flashIdx;
              if (indiv) {
                for (let iAdd = 0; iAdd < qtyToAdd; iAdd++) {
                  const obj = { id: entry.id, name: entry.namn, qty: 1, gratis: 0, gratisKval: [], removedKval: [] };
                  if (artifactEffect) obj.artifactEffect = artifactEffect;
                  if (trait) obj.trait = trait;
                  applyInheritedMultipliers(obj);
                  applyLiveBase(obj);
                  parentArr.push(obj);
                  flashIdx = parentArr.length - 1;
                  if (livePairs) livePairs.push({ prev: null, next: obj });
                }
              } else if (row && (!trait || row.trait === trait)) {
                const prevState = livePairs ? cloneRow(row) : null;
                row.qty = (Number(row.qty) || 0) + qtyToAdd;
                applyLiveBase(row);
                flashIdx = idx;
                if (livePairs) livePairs.push({ prev: prevState, next: row });
              } else if (row && trait && row.trait !== trait) {
                const obj = { id: entry.id, name: entry.namn, qty: qtyToAdd, gratis:0, gratisKval:[], removedKval:[] };
                if (artifactEffect) obj.artifactEffect = artifactEffect;
                obj.trait = trait;
                applyInheritedMultipliers(obj);
                applyLiveBase(obj);
                parentArr.push(obj);
                flashIdx = parentArr.length - 1;
                if (livePairs) livePairs.push({ prev: null, next: obj });
              } else {
                const obj = { id: entry.id, name: entry.namn, qty: qtyToAdd, gratis:0, gratisKval:[], removedKval:[] };
                if (artifactEffect) obj.artifactEffect = artifactEffect;
                if (trait) obj.trait = trait;
                applyInheritedMultipliers(obj);
                applyLiveBase(obj);
                parentArr.push(obj);
                flashIdx = parentArr.length - 1;
                if (livePairs) livePairs.push({ prev: null, next: obj });
              }
              if (livePairs && livePairs.length) {
                applyLiveModePayment(livePairs, purchase ? { overrideO: purchase.totalO } : undefined);
                livePairs.length = 0;
              }
              const parentIdx = Number(li.dataset.parent);
              saveInventory(inv);
              renderInventory();
              const hidden = isHiddenType(entry);
              let addedToList = false;
              if (needsArtifactListSync(entry)) {
                const list = storeHelper.getCurrentList(store);
                if ((entry.taggar?.typ || []).includes('Artefakt')) {
                  if (!entry.id && storeHelper.genId) {
                    const provisionalId = storeHelper.genId();
                    entry.id = provisionalId;
                    const customs = storeHelper.getCustomEntries(store);
                    const cIdx = customs.findIndex(c => c.namn === entry.namn && !c.id);
                    if (cIdx >= 0) {
                      customs[cIdx].id = provisionalId;
                      const result = storeHelper.setCustomEntries(store, customs);
                      if (result && result.idMap) {
                        const mapped = result.idMap.get(provisionalId);
                        if (mapped) entry.id = mapped;
                      }
                      if (result && Array.isArray(result.entries)) {
                        const persisted = result.entries.find(e => e.id === entry.id);
                        if (persisted) entry.namn = persisted.namn;
                      }
                    }
                  }
                  if (entry.id && !list.some(x => x.id === entry.id && x.noInv)) {
                    list.push({ ...entry, noInv: true });
                    storeHelper.setCurrentList(store, list);
                    addedToList = true;
                  }
                }
              }
              if ((addedToList || hidden)) {
                if (window.updateXP) updateXP();
                if (window.renderTraits) renderTraits();
              }
              if (hidden && entry.id) {
                storeHelper.addRevealedArtifact(store, entry.id);
              }
              const selector = !Number.isNaN(parentIdx)
                ? `li[data-name="${CSS.escape(entry.namn)}"][data-parent="${parentIdx}"][data-child="${flashIdx}"]`
                : `li[data-name="${CSS.escape(entry.namn)}"][data-idx="${flashIdx}"]`;
              const flashEl = dom.invList?.querySelector(selector);
              if (flashEl) {
                flashEl.classList.add('inv-flash');
                setTimeout(() => flashEl.classList.remove('inv-flash'), 600);
              }
            };
            if (['kraft', 'ritual'].includes(entry.bound) && row?.trait) {
              addRow(row.trait);
            } else {
              const traitChoice = await pickInventoryEntryChoice({
                entry,
                row,
                list: storeHelper.getCurrentList(store),
                inv,
                field: 'trait',
                currentValue: row?.trait || '',
                usedValues: isEntryStackable(entry) ? [] : undefined
              });
              if (traitChoice.hasChoice) {
                if (traitChoice.cancelled) {
                  if (traitChoice.noOptions) {
                    await alertPopup('Inga val kvar för den här posten.');
                  }
                  return;
                }
                if (traitChoice.rule?.field === 'trait') {
                  addRow(traitChoice.value);
                  return;
                }
              }
              addRow();
            }
          }
          return;
        }
      // "–" minskar qty eller tar bort posten
      if (act === 'sub') {
        if (row) {
          const pg = row.perkGratis || 0;
          const removingPerkItem = (row.qty - 1) < pg;
          if (removingPerkItem && !(await confirmGrantRemoval(row.perk))) {
            return;
          }
          if (row.qty > 1) {
            row.qty--;
            if (row.gratis > row.qty) row.gratis = row.qty;
            if (removingPerkItem && pg > 0) row.perkGratis = pg - 1;
          } else {
            parentArr.splice(idx, 1);
          }
          const parentIdx = Number(li.dataset.parent);
          saveInventory(inv);
          renderInventory();
          const hidden = isHiddenType(entry);
          if (needsArtifactListSync(entry)) {
            const still = flattenInventory(inv).some(r => (r.id ? r.id === row.id : r.name === row.name));
            if (!still) {
              let list = storeHelper.getCurrentList(store).filter(x => !(x.id === row.id && x.noInv));
              storeHelper.setCurrentList(store, list);
              if (window.updateXP) updateXP();
              if (window.renderTraits) renderTraits();
              if (hidden) storeHelper.removeRevealedArtifact(store, row.id || row.name);
            }
          }
          const selector = !Number.isNaN(parentIdx)
            ? `li[data-name="${CSS.escape(itemName)}"][data-parent="${parentIdx}"][data-child="${idx}"]`
            : `li[data-name="${CSS.escape(itemName)}"][data-idx="${idx}"]`;
          const flashEl = dom.invList?.querySelector(selector);
          if (flashEl) {
            flashEl.classList.add('rm-flash');
            setTimeout(() => flashEl.classList.remove('rm-flash'), 600);
          }
        }
        return;
      }

      // "🔨" öppnar popup för att lägga kvalitet
      if (act === 'addQual') {
        const tagTyp = (entry.taggar?.typ || []);
        if (!['Vapen','Sköld','Pil/Lod','Rustning','Artefakt'].some(t => tagTyp.includes(t))) return;
        const qualities = DB
          .filter(isQual)
          .filter(q => window.canApplyQuality ? canApplyQuality(entry, q) : true);
        if (!qualities.length) {
          if (window.alertPopup) await alertPopup('Inga passande kvaliteter för detta föremål.');
          return;
        }
        openQualPopup(qualities, async qSelection => {
          if (!row) return;
          const indices = Array.isArray(qSelection) ? qSelection : [qSelection];
          const chosen = Array.from(new Set(
            indices
              .map(val => Number(val))
              .filter(idx => Number.isInteger(idx) && qualities[idx])
          )).map(idx => qualities[idx]);
          if (!chosen.length) return;

          row.kvaliteter = row.kvaliteter || [];
          const removed = row.removedKval ?? [];
          const baseQuals = [
            ...(entry.taggar?.kvalitet ?? []),
            ...splitQuals(entry.kvalitet)
          ];
          const baseQ = baseQuals.filter(q => !removed.includes(q));

          let addedCount = 0;
          const blockedNames = [];
          chosen.forEach(quality => {
            const qn = quality?.namn || quality?.name;
            if (!qn) return;
            const existing = [...baseQ, ...(row.kvaliteter || [])];
            if (existing.includes(qn)) return;
            if (!isQualityAllowedByRules(entry, row, qn)) {
              blockedNames.push(qn);
              return;
            }
            row.kvaliteter.push(qn);
            addedCount++;
          });

          if (blockedNames.length) {
            const hardStops = blockedNames.map(name => ({
              code: `quality_blocked_${String(name || '').toLowerCase()}`,
              message: `Kvalitet: ${name}`
            }));
            const stopResult = {
              requirementReasons: [],
              blockingConflicts: [],
              replaceTargetNames: [],
              grantedLevelStop: null,
              hardStops,
              hasStops: true
            };
            const messages = typeof window.rulesHelper?.formatEntryStopMessages === 'function'
              ? window.rulesHelper.formatEntryStopMessages(entry?.namn || row?.name || 'föremålet', stopResult)
              : hardStops.map(stop => stop.message);
            const label = `“${String(entry?.namn || row?.name || 'föremålet').trim()}”`;
            const text = `Karaktären möter inte följande krav:\n- ${messages.join('\n- ')}\n\nVill du lägga till blockerade kvaliteter på ${label} ändå?`;
            const forceOverride = !!(await confirmPopup(text));
            if (forceOverride) {
              row.manualQualityOverride = Array.isArray(row.manualQualityOverride) ? row.manualQualityOverride : [];
              blockedNames.forEach(qn => {
                if (!row.kvaliteter.includes(qn)) {
                  row.kvaliteter.push(qn);
                  addedCount++;
                }
                if (!row.manualQualityOverride.includes(qn)) {
                  row.manualQualityOverride.push(qn);
                }
              });
            }
          }

          if (addedCount > 0) {
            saveInventory(inv);
            renderInventory();
          }
        });
        return;
      }

      // "freeQual" markerar första icke-gratis kvaliteten från vänster som gratis
      if (act === 'freeQual') {
        const removed = row.removedKval ?? [];
        const baseQuals = [
          ...(entry.taggar?.kvalitet ?? []),
          ...splitQuals(entry.kvalitet)
        ];
        const baseQ = baseQuals.filter(q => !removed.includes(q));
        const allQ = sanitizeArmorQualities(entry, [...baseQ, ...(row.kvaliteter ?? [])]);
        if (!allQ.length) return;

        // Behåll endast positiva/mystiska gratis-kvaliteter
        row.gratisKval = (row.gratisKval || []).filter(q => !isNegativeQual(q) && !isNeutralQual(q));
        const existing = row.gratisKval.slice();
        const candidates = allQ.filter(q => !existing.includes(q) && !isNegativeQual(q) && !isNeutralQual(q));
        if (!candidates.length) return;

        row.gratisKval.push(candidates[0]);
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "toggleEffect" växlar artefaktens effekt
      if (act === 'toggleEffect') {
        const effectChoice = await pickInventoryEntryChoice({
          entry,
          row,
          list: storeHelper.getCurrentList(store),
          inv,
          field: 'artifactEffect',
          currentValue: row?.artifactEffect || '',
          usedValues: []
        });
        if (!effectChoice.hasChoice || effectChoice.cancelled) return;
        row.artifactEffect = effectChoice.value || '';
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "free" ökar gratis-räknaren (loopar när den nått max)
      if (act === 'free') {
        if (row) {
          const shouldClearGratis = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
          const currentGratis = Number(row.gratis || 0);
          let newGratis;

          if (shouldClearGratis) {
            if (!currentGratis) return;
            newGratis = 0;
          } else {
            newGratis = currentGratis + 1;
            if (newGratis > row.qty) newGratis = 0;
          }

          if (
            newGratis < currentGratis &&
            newGratis < (row.perkGratis || 0)
          ) {
            if (!(await confirmGrantRemoval(row.perk))) {
              return;
            }
          }

          row.gratis = newGratis;
          saveInventory(inv);
          renderInventory();
        }
        return;
      }
    };
    }

    // Bind clicks within the Formaliteter card when it is outside invList
    if (dom.invFormal) {
      dom.invFormal.onclick = async e => {
        if (e.target.closest('.entry-collapse-btn')) return;
        const header = e.target.closest('.card-header');
        if (header && !e.target.closest('button, a, select, input, textarea, [contenteditable="true"], [role="button"]')) {
          return;
        }

        // Handle money +/- inside formal card
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'moneyPlus' || act === 'moneyMinus') {
          const cur = storeHelper.getMoney(store);
          const delta = act === 'moneyPlus' ? 1 : -1;
          const newD = (cur.daler || 0) + delta;
          if (newD < 0) {
            storeHelper.setMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          } else {
            storeHelper.setMoney(store, { ...cur, daler: newD });
          }
          renderInventory();
          return;
        }
        if (act === 'moneySkillingPlus' || act === 'moneySkillingMinus') {
          const cur = storeHelper.getMoney(store);
          const delta = act === 'moneySkillingPlus' ? 1 : -1;
          const newS = (cur.skilling || 0) + delta;
          if (newS < 0) {
            const newD = Math.max(0, (cur.daler || 0) - 1);
            const newSkilling = 3 + newS;
            storeHelper.setMoney(store, { daler: newD, skilling: newSkilling, 'örtegar': 0 });
          } else if (newS >= 4) {
            storeHelper.setMoney(store, { ...cur, daler: (cur.daler || 0) + 1, skilling: newS - 4 });
          } else {
            storeHelper.setMoney(store, { ...cur, skilling: newS });
          }
          renderInventory();
          return;
        }
        if (act === 'moneyOrtegarPlus' || act === 'moneyOrtegarMinus') {
          const cur = storeHelper.getMoney(store);
          const delta = act === 'moneyOrtegarPlus' ? 1 : -1;
          const newO = (cur['örtegar'] || 0) + delta;
          if (newO < 0) {
            const newSkilling = Math.max(0, (cur.skilling || 0) - 1);
            const newOrtegar = 8 + newO;
            const newDaler = newSkilling < (cur.skilling || 0) ? Math.max(0, (cur.daler || 0) - 1) : (cur.daler || 0);
            storeHelper.setMoney(store, { daler: newDaler, skilling: newSkilling, 'örtegar': newOrtegar });
          } else if (newO >= 8) {
            storeHelper.setMoney(store, { ...cur, skilling: (cur.skilling || 0) + 1, 'örtegar': newO - 8 });
          } else {
            storeHelper.setMoney(store, { ...cur, 'örtegar': newO });
          }
          renderInventory();
          return;
        }
      };

      dom.invFormal.addEventListener('entry-card-toggle', e => {
        updateCollapseBtnState();
        const expanded = Boolean(e.detail?.expanded);
        localStorage.setItem(INV_INFO_KEY, expanded ? '1' : '0');
      });
    }

  }

  function bindMoney() {
    const manageItemsBtn = getEl('manageItemsBtn');
    const manageEconomyBtn = getEl('manageEconomyBtn');
    const quickSpendBtn = getEl('inventoryQuickSpendBtn');
    const quickSpendDaler = getEl('inventoryQuickSpendDaler');
    const quickSpendSkilling = getEl('inventoryQuickSpendSkilling');
    const quickSpendOrtegar = getEl('inventoryQuickSpendOrtegar');
    const resetBtn  = getEl('moneyResetBtn');
    const clearBtn  = getEl('clearInvBtn');
    if (manageItemsBtn) manageItemsBtn.onclick = () => openInventoryCustomItemManager();
    if (manageEconomyBtn) manageEconomyBtn.onclick = () => openMoneyPopup();
    const runQuickSpend = () => {
      const spendMoney = {
        daler: Number(quickSpendDaler?.value) || 0,
        skilling: Number(quickSpendSkilling?.value) || 0,
        'örtegar': Number(quickSpendOrtegar?.value) || 0
      };
      const spendO = moneyToO(storeHelper.normalizeMoney(spendMoney));
      if (spendO <= 0) {
        quickSpendDaler?.focus();
        return;
      }
      spendInventoryMoney(spendMoney, {
        onComplete: () => {
          [quickSpendDaler, quickSpendSkilling, quickSpendOrtegar].forEach(input => {
            if (input) input.value = '';
          });
        }
      });
    };
    if (quickSpendBtn) quickSpendBtn.onclick = runQuickSpend;
    [quickSpendDaler, quickSpendSkilling, quickSpendOrtegar].forEach(input => {
      if (!input) return;
      input.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runQuickSpend();
        }
      };
    });
    if (resetBtn) resetBtn.onclick = () => {
      const doReset = () => {
        storeHelper.setPrivMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
        storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
        storeHelper.setMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
        renderInventory();
      };
      const priv = storeHelper.getPrivMoney(store);
      const pos  = storeHelper.getPossessionMoney(store);
      const hasAdv = priv.daler || priv.skilling || priv['örtegar'] || pos.daler || pos.skilling || pos['örtegar'];
      if (hasAdv) openAdvMoneyPopup(doReset); else doReset();
    };
    if (clearBtn) clearBtn.onclick = async () => {
      if (await confirmPopup('Du håller på att tömma hela inventariet, är du säker?')) {
        saveInventory([]);
        renderInventory();
      }
    };

    const liveToggle = getEl('inventoryLiveToggle');
    if (liveToggle) {
      const current = typeof storeHelper?.getLiveMode === 'function' && storeHelper.getLiveMode(store);
      liveToggle.checked = Boolean(current);
      liveToggle.onchange = () => {
        if (typeof storeHelper?.setLiveMode === 'function') {
          storeHelper.setLiveMode(store, Boolean(liveToggle.checked));
          renderInventory();
        }
      };
    }
  }

  window.invUtil = {
    moneyToO,
    oToMoney,
    sortInvEntry,
    saveInventory,
    sortAllInventories,
    getEntry,
    isEntryStackable,
    isTraitBoundInventoryEntry,
    shouldShowRowTraitInName,
    isInventoryBundleEntry,
    getInventoryBundleItems,
    getInventoryBundleCount,
    addInventoryBundle,
    removeInventoryBundle,
    isIndividualItem,
    calcRowCost,
    calcRowWeight,
    calcEntryCost,
    makeNameMap,
    filter: F,
    sortQualsForDisplay,
    openQualPopup,
    openCustomPopup,
    openInventoryHub,
    openInventoryItemsHub,
    openInventoryEconomyHub,
    editCustomEntry,
    editArtifactEntry,
    openMoneyPopup,
    openQtyPopup,
    spendInventoryMoney,
    applyLiveModePayment,
    openLiveBuyPopup,
    openPricePopup,
    addMoneyToVehicle,
    openVehiclePopup,
    openVehicleRemovePopup,
    openVehicleMoneyPrompt,
    removeMoneyFromVehicle,
    openRowPricePopup,
    openSaveFreePopup,
    buildInventoryRow,
    openBuyMultiplePopup,
    massFreeAndSave,
    recalcArtifactEffects,
    renderInventory,
    bindInv,
    bindMoney
  };
  window.openInventoryHub = openInventoryHub;
  window.openInventoryItemsHub = openInventoryItemsHub;
  window.openInventoryEconomyHub = openInventoryEconomyHub;
})(window);
