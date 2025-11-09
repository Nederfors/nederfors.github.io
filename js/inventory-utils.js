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
  const STACKABLE_IDS = ['l1','l11','l27','l6','l12','l13','l28','l30'];
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
  const LEVEL_IDX = { '':0, Novis:1, 'Ges\u00e4ll':2, 'M\u00e4stare':3 };
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
    const allQ = [...baseQ, ...extraQ];
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
    F.typ.forEach(val => {
      tags.push(`<span class="tag removable" data-type="typ" data-val="${escapeHtml(val)}">${escapeHtml(val)} ✕</span>`);
    });
    F.ark.forEach(val => {
      tags.push(`<span class="tag removable" data-type="ark" data-val="${escapeHtml(val)}">${escapeHtml(val)} ✕</span>`);
    });
    F.test.forEach(val => {
      tags.push(`<span class="tag removable" data-type="test" data-val="${escapeHtml(val)}">${escapeHtml(val)} ✕</span>`);
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

  function isHiddenType(tagTyp) {
    const arr = Array.isArray(tagTyp) ? tagTyp : [];
    const primary = arr[0] ? String(arr[0]).toLowerCase() : '';
    return ['artefakt','kuriositet','skatt'].includes(primary);
  }

  function hasArtifactTag(tagTyp) {
    return (Array.isArray(tagTyp) ? tagTyp : [])
      .some(t => String(t || '').trim().toLowerCase() === 'artefakt');
  }

  function needsArtifactListSync(tagTyp) {
    return isHiddenType(tagTyp) || hasArtifactTag(tagTyp);
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

  function addWellEquippedItems(inv) {
    const freebies = [
      { id: 'di12', name: 'Rep, 10 meter', qty: 3 },
      { id: 'di23', name: 'Papper', qty: 1 },
      { id: 'di18', name: 'Kritor', qty: 1 },
      { id: 'di5',  name: 'Fackla', qty: 3 },
      { id: 'i11',  name: 'Signalhorn', qty: 1 },
      { id: 'elix34', name: 'Långfärdsbröd', qty: 3 },
      { id: 'elix43', name: 'Örtkur', qty: 3 }
    ];
    freebies.forEach(it => {
      const row = inv.find(r => r.id === it.id || r.name === it.name);
      const entry = getEntry(it.id || it.name);
      if (row) {
        row.id = entry.id;
        row.name = entry.namn;
        row.qty += it.qty;
        row.gratis = (row.gratis || 0) + it.qty;
        row.perkGratis = (row.perkGratis || 0) + it.qty;
        if (!row.perk) row.perk = 'Välutrustad';
      } else {
        inv.push({ id: entry.id, name: entry.namn, qty: it.qty, gratis: it.qty, gratisKval: [], removedKval: [], perk: 'Välutrustad', perkGratis: it.qty });
      }
    });
  }

  function removeWellEquippedItems(inv) {
    for (let i = inv.length - 1; i >= 0; i--) {
      const row = inv[i];
      if (row.perk === 'Välutrustad') {
        const pg = row.perkGratis || row.gratis || 0;
        const removed = Math.min(pg, row.qty);
        row.qty -= removed;
        row.gratis = Math.max(0, (row.gratis || 0) - removed);
        row.perkGratis = Math.max(0, (row.perkGratis || 0) - removed);
        delete row.perk;
        delete row.perkGratis;
        if (row.qty <= 0) inv.splice(i, 1);
      }
    }
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
      if (r.trait && (entry.bound || r.id === 'l9')) {
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

    const nameMap = makeNameMap(storeHelper.getInventory(store));
    const qualMode = list.every(it => isQual(it));
    const items = qualMode
      ? sortQualsForDisplay(list.map((item, idx) => ({ item, idx })))
      : list.map((item, idx) => ({ item, idx }));
    /* bygg knappar: stöd både namn och name */
    box.innerHTML = items.map(({item, idx}) => {
      const base  = item.namn || item.name;
      const label = nameMap.get(item) || base;
      let cls = 'char-btn';
      if (qualMode) {
        cls += ' quality';
        if (isNegativeQual(base)) cls += ' negative';
        else if (isNeutralQual(base)) cls += ' neutral';
        if (isMysticQual(base)) cls += ' mystic';
      }
      return `<button data-i="${idx}" class="${cls}">${label}</button>`;
    }).join('');

    /* öppna */
    const popInner = pop.querySelector('.popup-inner');

    pop.classList.add('open');
    window.autoResizeAll?.(pop);
    if (popInner) popInner.scrollTop = 0;

    /* local helpers */
    const close = () => {
      pop.classList.remove('open');
      box.removeEventListener('click', onBtn);
      cls.removeEventListener('click', close);
      pop.removeEventListener('click', onOutside);
      box.innerHTML = '';                      // rensa bort gamla knappar
    };
    const onBtn = e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const idx = Number(b.dataset.i);
      close();
      callback(idx);
    };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        close();
        callback(null);
      }
    };

    box.addEventListener('click', onBtn);
    cls.addEventListener('click', close);
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
    const pop    = root.getElementById('customPopup');
    const popInner = pop ? pop.querySelector('.popup-inner') : null;
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

      close();
      callback(entry);
    };

    const onCancel = () => {
      close();
      callback(null);
    };

    const onDelete = () => {
      if (!isEditing) {
        close();
        callback(null);
        return;
      }
      const payload = {
        __delete: true,
        id: existing?.id || '',
        namn: existing?.namn || ''
      };
      close();
      callback(payload);
    };

    const onOutside = e => {
      if (!popInner) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : e.path;
      if (Array.isArray(path) && path.includes(popInner)) return;
      if (popInner.contains(e.target)) return;
      close();
      callback(null);
    };

    function close() {
      pop.classList.remove('open');
      add.removeEventListener('click', onAdd);
      if (del) del.removeEventListener('click', onDelete);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      if (typeAdd) typeAdd.removeEventListener('click', onAddType);
      if (typeTags) typeTags.removeEventListener('click', onTagsClick);
      if (powerAdd) powerAdd.removeEventListener('click', onAddPower);
      if (lvlMode) lvlMode.removeEventListener('change', applyLevelMode);
      if (desc) desc.removeEventListener('input', markDescTouched);
      resetFields();
      if (title) title.textContent = 'Nytt föremål';
      add.textContent = 'Spara';
      if (effBox) effBox.style.display = 'none';
      if (weaponBox) weaponBox.style.display = 'none';
      if (armorBox) armorBox.style.display = 'none';
    }

    pop.classList.add('open');
    window.autoResizeAll?.(pop);
    if (popInner) popInner.scrollTop = 0;
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
    pop.addEventListener('click', onOutside);
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
  }

  function openMoneyPopup() {
    const root = getToolbarRoot();
    if (!root) return;
    const pop   = root.getElementById('moneyPopup');
    const dIn   = root.getElementById('moneyDaler');
    const sIn   = root.getElementById('moneySkilling');
    const oIn   = root.getElementById('moneyOrtegar');
    const balDIn = root.getElementById('moneyBalanceDaler');
    const balSIn = root.getElementById('moneyBalanceSkilling');
    const balOIn = root.getElementById('moneyBalanceOrtegar');
    const setBtn= root.getElementById('moneySetBtn');
    const addBtn= root.getElementById('moneyAddBtn');
    const spendBtn = root.getElementById('moneySpendBtn');
    const cancel = root.getElementById('moneyCancel');
    const statusEl = root.getElementById('moneyStatus');

    // Fälten ska börja tomma oavsett aktuell summa pengar
    [dIn, sIn, oIn, balDIn, balSIn, balOIn].forEach(input => { if (input) input.value = ''; });

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

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

    updateStatus();

    const close = () => {
      pop.classList.remove('open');
      setBtn.removeEventListener('click', onSet);
      addBtn.removeEventListener('click', onAdd);
      if (spendBtn) spendBtn.removeEventListener('click', onSpend);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      [dIn, sIn, oIn, balDIn, balSIn, balOIn].forEach(input => { if (input) input.value = ''; });
      if (statusEl) statusEl.textContent = '';
    };
    const getSpendMoney = () => storeHelper.normalizeMoney({
      daler: Number(dIn?.value) || 0,
      skilling: Number(sIn?.value) || 0,
      'örtegar': Number(oIn?.value) || 0
    });
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
        close();
        openAdvMoneyPopup(() => {
          storeHelper.setPrivMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          fn();
        });
      } else {
        close();
        fn();
      }
    };
    const onSet = () => {
      const money = getBalanceMoney();
      maybeAdv(() => {
        storeHelper.setMoney(store, money);
        renderInventory();
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
      });
    };
    const onSpend = () => {
      const spendMoney = getSpendMoney();
      const spendO = moneyToO(spendMoney);
      if (spendO <= 0) {
        if (dIn) dIn.focus();
        return;
      }
      const pay = () => {
        const curMoney = storeHelper.getMoney(store);
        const remainingO = Math.max(0, moneyToO(curMoney) - spendO);
        storeHelper.setMoney(store, oToMoney(remainingO));
        renderInventory();
      };
      if (typeof maybeAdv === 'function') {
        maybeAdv(pay);
      } else {
        close();
        pay();
      }
    };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)) close();
    };
    setBtn.addEventListener('click', onSet);
    addBtn.addEventListener('click', onAdd);
    if (spendBtn) spendBtn.addEventListener('click', onSpend);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
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
    if (!entry || typeof selectArtifactPayment !== 'function') return false;
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
    const current = target.row.artifactEffect || '';
    const chosen = await selectArtifactPayment(current);
    if (chosen === null) return true;
    target.row.artifactEffect = chosen;
    saveInventory(inv);
    renderInventory();
    if (typeof onSave === 'function') onSave();
    return true;
  }

  function openQtyPopup() {
    const root = getToolbarRoot();
    if (!root) return;
    const pop   = root.getElementById('qtyPopup');
    const inEl  = root.getElementById('qtyInput');
    const list  = root.getElementById('qtyItemList');
    const cancel= root.getElementById('qtyCancel');

    inEl.value = '';
    const inv = storeHelper.getInventory(store);
    const flat = flattenInventoryWithPath(inv);
    const nameMap = makeNameMap(flat.map(f => f.row));
    const vehicles = inv
      .map((row,i)=>({ row, entry:getEntry(row.id || row.name), idx:i }))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));
    const vehIdx = vehicles.map(v => v.idx);
    const regular = flat.filter(obj => !(vehIdx.includes(obj.path[0]) && obj.path.length > 1));
    const vehicleHtml = vehicles.map(v => {
      const items = flattenInventoryWithPath(v.row.contains || [], [v.idx]);
      if (!items.length) return '';
      const icon = VEHICLE_EMOJI[v.entry.namn] || '🛞';
      const inner = items
        .map(o => `<button data-path="${o.path.join('.')}" class="char-btn">${nameMap.get(o.row)}</button>`)
        .join('');
      return `<div class="vehicle-group"><span class="vehicle-icon">${icon}</span>${inner}</div>`;
    }).join('');
    list.innerHTML = regular
      .map(obj => `<button data-path="${obj.path.join('.')}" class="char-btn">${nameMap.get(obj.row)}</button>`)
      .join('') + vehicleHtml;

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      list.removeEventListener('click', onBtn);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      list.innerHTML = '';
      inEl.value = '';
    };
    const onBtn = e => {
      const b = e.target.closest('button[data-path]');
      if (!b) return;
      const qty = parseInt(inEl.value, 10);
      if (!qty || qty <= 0) return;
      const path = b.dataset.path.split('.').map(Number);
      let parentArr = inv;
      let row = null;
      path.forEach((pIdx, i) => {
        row = parentArr[pIdx];
        if (i < path.length - 1) parentArr = row.contains || [];
      });
      if (!row) return;
      const entry = getEntry(row.id || row.name);
      const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
        .some(t => entry.taggar?.typ?.includes(t)) &&
        !STACKABLE_IDS.includes(entry.id) &&
        !['kraft','ritual'].includes(entry.bound);

      const liveEnabled = typeof storeHelper?.getLiveMode === 'function' && storeHelper.getLiveMode(store);
      const livePairs = liveEnabled ? [] : null;

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

      if (livePairs && livePairs.length) applyLiveModePayment(livePairs);
      saveInventory(inv);
      renderInventory();
      close();
    };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    list.addEventListener('click', onBtn);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
  }

  async function buildInventoryRow({ entry, list } = {}) {
    if (!entry) return null;
    const row = { id: entry.id, name: entry.namn, qty: 1, gratis: 0, gratisKval: [], removedKval: [] };
    const tagTyp = entry.taggar?.typ || [];
    const explode = typeof window.explodeTags === 'function' ? window.explodeTags : () => [];
    const curList = Array.isArray(list) ? list : storeHelper.getCurrentList(store);
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const reqYrken = explode(entry.taggar?.ark_trad);
      if (reqYrken.length) {
        const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
        const skillArt = storeHelper.abilityLevel(curList, 'Artefaktmakande');
        const artLevel = Math.max(partyArt, skillArt);
        const lvlName = Object.keys(entry.niv\u00e5er || {}).find(l => l) || '';
        const itemLevel = LEVEL_IDX[lvlName] || 0;
        const hasYrke = reqYrken.some(req => curList.some(it => {
          const nameTags = explode([it.namn]);
          const isJob = typeof window.isYrke === 'function' ? window.isYrke(it) : false;
          const isElite = typeof window.isElityrke === 'function' ? window.isElityrke(it) : false;
          return (isJob || isElite) && nameTags.includes(req);
        }));
        let allowPurchase = hasYrke;
        if (!allowPurchase && artLevel >= itemLevel) {
          allowPurchase = true;
        }
        if (!allowPurchase) {
          const reqTxt = reqYrken.join(', ');
          const msg = `Du har inte r\u00e4tt yrke (kr\u00e4ver: ${reqTxt}); om du \u00e4nd\u00e5 vill ha ${entry.namn} blir det 10x dyrare och traditionens f\u00f6ljare kan komma att ta illa vid sig. L\u00e4gg till \u00e4nd\u00e5?`;
          if (typeof openDialog === 'function') {
            const ok = await openDialog(msg, { cancel: true, cancelText: 'Nej!', okText: 'Ja!' });
            if (!ok) return null;
          } else {
            return null;
          }
          row.priceMult = 10;
        }
      }
    }
    if (tagTyp.includes('Artefakt')) {
      if (typeof selectArtifactPayment === 'function') {
        const val = await selectArtifactPayment();
        if (val === null) return null;
        if (val) row.artifactEffect = val;
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
      const cost = entry ? calcEntryCost(entry) : { daler: 0, skilling: 0, 'örtegar': 0 };
      return storeHelper.normalizeMoney(cost);
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
    const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
      .some(t => tagTyp.includes(t)) &&
      !STACKABLE_IDS.includes(entry.id) &&
      !['kraft','ritual'].includes(entry.bound);

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
    const pop    = root.getElementById('pricePopup');
    const inEl   = root.getElementById('priceFactor');
    const list   = root.getElementById('priceItemList');
    const apply  = root.getElementById('priceApply');
    const cancel = root.getElementById('priceCancel');

    inEl.value = '';
    const inv = storeHelper.getInventory(store);
    const flat = flattenInventoryWithPath(inv);
    const nameMap = makeNameMap(flat.map(f => f.row));
    const vehicles = inv
      .map((row,i)=>({ row, entry:getEntry(row.id || row.name), idx:i }))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));
    const vehIdx = vehicles.map(v => v.idx);
    const regular = flat.filter(obj => !(vehIdx.includes(obj.path[0]) && obj.path.length > 1));
    const vehicleHtml = vehicles.map(v => {
      const items = flattenInventoryWithPath(v.row.contains || [], [v.idx]);
      if (!items.length) return '';
      const icon = VEHICLE_EMOJI[v.entry.namn] || '🛞';
      const inner = items.map(o => `
        <label class="price-item"><span>${nameMap.get(o.row)}</span><input type="checkbox" data-path="${o.path.join('.')}"></label>`).join('');
      return `<div class="vehicle-group"><span class="vehicle-icon">${icon}</span>${inner}</div>`;
    }).join('');
    list.innerHTML = regular
      .map(obj => `
        <label class="price-item"><span>${nameMap.get(obj.row)}</span><input type="checkbox" data-path="${obj.path.join('.')}"></label>`)
      .join('') + vehicleHtml;

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      list.innerHTML = '';
      inEl.value = '';
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
      // Stäng popuppen innan omrendering för snabbare feedback
      close();
      renderInventory();
    };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
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

function openVehiclePopup(preselectValue, precheckedPaths) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('vehiclePopup');
    const sel    = root.getElementById('vehicleSelect');
    const list   = root.getElementById('vehicleItemList');
    const apply  = root.getElementById('vehicleApply');
    const cancel = root.getElementById('vehicleCancel');

    const inv = storeHelper.getInventory(store);
    const vehicles = inv
      .map((row,i)=>({row, entry:getEntry(row.id || row.name), idx:i}))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));
    if (!vehicles.length) return;

    sel.innerHTML = vehicles
      .map(v => `<option value="${v.idx}">${v.entry.namn}</option>`)
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

    const flat = flattenInventoryWithPath(inv);
    const nameMap = makeNameMap(flat.map(f => f.row));
    const vehIdx = vehicles.map(v => v.idx);
    const movable = flat.filter(obj => !(vehIdx.includes(obj.path[0]) && obj.path.length === 1));
    const outside = movable.filter(obj => !vehIdx.includes(obj.path[0]));
    const vehicleHtml = vehicles.map(v => {
      const items = movable.filter(o => o.path[0] === v.idx);
      if (!items.length) return '';
      const icon = VEHICLE_EMOJI[v.entry.namn] || '🛞';
      const inner = items.map(o => `<label class="price-item"><span>${nameMap.get(o.row)}</span><input type="checkbox" data-path="${o.path.join('.')}" ></label>`).join('');
      return `<div class="vehicle-group"><span class="vehicle-icon">${icon}</span>${inner}</div>`;
    }).join('');
    list.innerHTML = outside
      .map(o => `<label class="price-item"><span>${nameMap.get(o.row)}</span><input type="checkbox" data-path="${o.path.join('.')}" ></label>`)
      .join('') + vehicleHtml;
    if (Array.isArray(precheckedPaths) && precheckedPaths.length) {
      const set = new Set(precheckedPaths.map(String));
      [...list.querySelectorAll('input[type="checkbox"][data-path]')]
        .forEach(ch => { if (set.has(ch.dataset.path)) ch.checked = true; });
    }

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      sel.innerHTML = '';
      list.innerHTML = '';
    };
    const onApply = () => {
      const vIdx = Number(sel.value);
      if (Number.isNaN(vIdx)) return;
      const vehicle = inv[vIdx];
      vehicle.contains = vehicle.contains || [];
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-path]:checked')]
        .map(ch => ch.dataset.path.split('.').map(Number))
        .sort((a,b)=>{
          for (let i=0; i<Math.max(a.length,b.length); i++) {
            const av=a[i], bv=b[i];
            if (av===undefined) return 1;
            if (bv===undefined) return -1;
            if (av!==bv) return bv-av;
          }
          return 0;
        });
      checks.forEach(path => {
        if (path[0] === vIdx) return;
        let arr = inv;
        for (let i = 0; i < path.length - 1; i++) {
          arr = arr[path[i]].contains || [];
        }
        const item = arr.splice(path[path.length - 1], 1)[0];
        vehicle.contains.push(item);
      });
      vehicle.contains.sort(sortInvEntry);
      saveInventory(inv);
      renderInventory();
      close();
    };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
}

  function openVehicleRemovePopup(preselectIdx, precheckedPaths) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('vehicleRemovePopup');
    const sel    = root.getElementById('vehicleRemoveSelect');
    const list   = root.getElementById('vehicleRemoveItemList');
    const apply  = root.getElementById('vehicleRemoveApply');
    const cancel = root.getElementById('vehicleRemoveCancel');

    const inv = storeHelper.getInventory(store);
    const vehicles = inv
      .map((row,i)=>({row, entry:getEntry(row.id || row.name), idx:i}))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));
    if (!vehicles.length) return;

    sel.innerHTML = vehicles
      .map(v => `<option value="${v.idx}">${v.entry.namn}</option>`)
      .join('');
    if (typeof preselectIdx === 'number') sel.value = String(preselectIdx);

    const fillList = () => {
      const vIdx = Number(sel.value);
      const vehicle = inv[vIdx];
      if (!vehicle || !Array.isArray(vehicle.contains)) {
        list.innerHTML = '';
        return;
      }
      const items = flattenInventoryWithPath(vehicle.contains, [vIdx]);
      const nameMap = makeNameMap(items.map(i => i.row));
      list.innerHTML = items
        .map(o => `<label class="price-item"><span>${nameMap.get(o.row)}</span><input type="checkbox" data-path="${o.path.join('.')}"></label>`)
        .join('');
      if (Array.isArray(precheckedPaths) && precheckedPaths.length) {
        const set = new Set(precheckedPaths.map(String));
        [...list.querySelectorAll('input[type="checkbox"][data-path]')]
          .forEach(ch => { if (set.has(ch.dataset.path)) ch.checked = true; });
      }
    };

    fillList();

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      apply.removeEventListener('click', onApply);
      cancel.removeEventListener('click', onCancel);
      sel.removeEventListener('change', fillList);
      pop.removeEventListener('click', onOutside);
      sel.innerHTML = '';
      list.innerHTML = '';
    };
    const onApply = () => {
      const vIdx = Number(sel.value);
      const vehicle = inv[vIdx];
      if (!vehicle) return;
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-path]:checked')]
        .map(ch => ch.dataset.path.split('.').map(Number))
        .sort((a,b)=>{
          for (let i=0;i<Math.max(a.length,b.length);i++) {
            const av=a[i], bv=b[i];
            if (av===undefined) return 1;
            if (bv===undefined) return -1;
            if (av!==bv) return bv-av;
          }
          return 0;
        });
      checks.forEach(path => {
        let arr = inv;
        for (let i=0; i<path.length-1; i++) {
          arr = arr[path[i]].contains || [];
        }
        const item = arr.splice(path[path.length-1],1)[0];
        if (item) inv.push(item);
      });
      saveInventory(inv);
      renderInventory();
      close();
    };
    const onCancel = () => { close(); };
    const onOutside = e => {
      if (!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    sel.addEventListener('change', fillList);
    pop.addEventListener('click', onOutside);
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
      const allQ = [...baseQ, ...(row.kvaliteter || [])];
      row.gratisKval = allQ.filter(q => !isNegativeQual(q) && !isNeutralQual(q));
      // remove any price multiplier when everything is made free
      delete row.priceMult;
    });

    saveInventory(allInv);
    renderInventory();
  }

  function calcRowCost(row, forgeLvl, alcLevel, artLevel) {
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
    const allQuals = [
      ...baseQuals.filter(q => !removedQ.includes(q)),
      ...(row.kvaliteter || [])
    ];
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
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (artLevel >= req) {
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

    const mult = row.priceMult || 1;
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

  function calcRowWeight(row) {
    const entry  = getEntry(row.id || row.name);
    const base   = row.vikt ?? entry.vikt ?? entry.stat?.vikt ?? 0;
    const removed = row.removedKval ?? [];
    const baseQuals = [
      ...(entry.taggar?.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    const allQuals = [
      ...baseQuals.filter(q => !removed.includes(q)),
      ...(row.kvaliteter || [])
    ];
    const massCnt = allQuals.filter(q => q === 'Massivt').length;
    const sub = Array.isArray(row.contains)
      ? row.contains.reduce((s, r) => s + calcRowWeight(r), 0)
      : 0;
    return (base + massCnt) * row.qty + sub;
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
    const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
    const skillArt = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Artefaktmakande');
    const artLevel = Math.max(partyArt, skillArt);

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
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const lvlName = Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (artLevel >= req) price = dividePrice(price, 2);
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
    (tagger.typ ?? []).forEach(t => {
      const txt = String(t || '').trim();
      if (txt) infoTagParts.push(`<span class="tag">${escapeHtml(txt)}</span>`);
    });
    if (!isArtifact || isLArtifact) {
      const ability = abilityHtml(entry, rowLevel);
      if (ability) {
        desc += ability;
        infoBody += ability;
      }
    }
    const arkTags = explodeTags(tagger.ark_trad);
    const infoTags = (arkTags.length ? arkTags : (Array.isArray(tagger.ark_trad) ? ['Traditionslös'] : []))
      .concat(tagger.test || []);
    const tagList = infoTags.map(t => `<span class="tag">${t}</span>`);
    infoTags.forEach(t => {
      const txt = String(t || '').trim();
      if (txt) infoTagParts.push(`<span class="tag">${escapeHtml(txt)}</span>`);
    });
    if (rowLevel) {
      tagList.push(`<span class="tag level">${rowLevel}</span>`);
      infoTagParts.push(`<span class="tag level">${escapeHtml(rowLevel)}</span>`);
    }
    if (freeCnt) {
      const freeTxt = `Gratis${freeCnt>1?`×${freeCnt}`:''}`;
      tagList.push(`<span class="tag free removable" data-free="1">${freeTxt} ✕</span>`);
      infoTagParts.push(`<span class="tag free">${escapeHtml(freeTxt)}</span>`);
    }
    const priceMult = row.priceMult;
    let priceMultTag = '';
    if (priceMult && Math.abs(priceMult - 1) > 0.001) {
      const mTxt = Number.isInteger(priceMult)
        ? priceMult
        : priceMult.toFixed(2).replace(/\.?0+$/, '');
      const safeMult = escapeHtml(String(mTxt));
      priceMultTag = `<span class="tag price-mult removable" data-mult="1">×${safeMult} ✕</span>`;
      infoTagParts.push(`<span class="tag price-mult">×${safeMult}</span>`);
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
    if (row.trait && !entry.bound && row.id !== 'l9') {
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
    const freeQ = (row.gratisKval ?? []).filter(q => !isNegativeQual(q) && !isNeutralQual(q));
    const all = [
      ...baseQ.map(q => ({ q, base: true })),
      ...addQ.map(q => ({ q, base: false }))
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
    return { desc, rowLevel, freeCnt, qualityHtml, infoBody, infoTagParts, priceMultTag };
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
      const allQualsRow = [
        ...baseQuals.filter(q => !removedQ.includes(q)),
        ...(row.kvaliteter || [])
      ];
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
      return s + (isVeh ? 0 : calcRowWeight(r));
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
      const arkTags = explodeTags(arkRaw);
      const arkList = arkTags.length ? arkTags : (Array.isArray(arkRaw) ? ['Traditionslös'] : []);
      const testTags = entry.taggar?.test || [];
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

    const baseFunctionButtons = [
      '<button id="addCustomBtn" class="char-btn">Nytt föremål</button>',
      '<button id="manageMoneyBtn" class="char-btn">Hantera pengar</button>',
      '<button id="multiPriceBtn" class="char-btn">Multiplicera pris</button>',
      '<button id="squareBtn" class="char-btn" aria-label="Lägg till antal" title="Lägg till antal">Lägg till antal</button>'
    ];
    const vehicleButtons = vehicles
      .map(v => {
        const vehId = v.entry?.id ?? '';
        return `<button id="vehicleBtn-${v.idx}" data-vehicle-idx="${v.idx}" data-vehicle-id="${vehId}" class="char-btn">Lasta i ${v.entry.namn}</button>`;
      });
    const trailingFunctionButtons = [
      '<button id="saveFreeBtn" class="char-btn">Spara & gratismarkera</button>',
      '<button id="clearInvBtn" class="char-btn danger">Rensa inventarie</button>'
    ];
    const allFunctionButtons = [...baseFunctionButtons, ...vehicleButtons, ...trailingFunctionButtons];
    const functionsState = localStorage.getItem(INV_TOOLS_KEY);
    const functionsOpen = functionsState === null ? true : functionsState === '1';
    if (functionsState === null) localStorage.setItem(INV_TOOLS_KEY, '1');
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
      descHtml: `<div class="card-desc"><div class="inv-buttons">${allFunctionButtons.join('')}</div>${liveToggleHtml}</div>`,
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
      const rowWeight = calcRowWeight(row);
      const loadWeight = rowWeight - baseWeight * (row.qty || 0);
      const capacity = isVehicle ? (entry.stat?.b\u00e4rkapacitet || 0) : 0;
      const remaining = capacity - loadWeight;

      const { desc, rowLevel, freeCnt, qualityHtml, infoBody, infoTagParts, priceMultTag } = buildRowDesc(entry, row);
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
      const priceText = formatMoney(calcRowCost(row, forgeLvl, alcLevel, artLevel));
      const priceLabel = tagTyp.includes('Anställning') ? 'Dagslön' : 'Pris';
      const priceDisplay = `${priceLabel}: ${priceText}`.trim();
      const weightText = formatWeight(rowWeight);
      const weightClass = isVehicle ? capClassOf(loadWeight, capacity) : charCapClass;
      const cardKey = `${row.id || row.name}|${row.trait || ''}|${rowLevel || ''}`;

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
        infoMeta.push({ label: 'Bärkapacitet', value: formatWeight(capacity) });
        infoMeta.push({ label: 'Återstående kapacitet', value: formatWeight(remaining) });
      }

      const buildInfoButton = ({ bodyHtml = '', tags = [], meta = [] } = {}) => {
        const tagsHtml = Array.isArray(tags) ? tags.filter(Boolean).join(' ') : String(tags || '');
        const metaItems = Array.isArray(meta)
          ? meta.filter(item => {
              if (!item) return false;
              const value = item.value;
              return !(value === undefined || value === null || value === '');
            })
          : [];
        const bodyStr = typeof bodyHtml === 'string' ? bodyHtml : String(bodyHtml || '');
        if (!tagsHtml.trim() && !metaItems.length && !bodyStr.trim()) return '';
        const infoPanelHtml = buildInfoPanelHtml({ tagsHtml, bodyHtml: bodyStr, meta: metaItems });
        return `<button class="char-btn icon icon-only info-btn" data-info="${encodeURIComponent(infoPanelHtml)}" aria-label="Visa info">${icon('info')}</button>`;
      };

      const infoBtnHtml = buildInfoButton({
        bodyHtml: infoBody,
        tags: infoTagParts,
        meta: infoMeta
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
      const baseName = (row.id === 'l9' && row.trait)
        ? `${displayName}: ${row.trait}`
        : `${displayName}`;

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
      const children = Array.isArray(row.contains) ? row.contains : [];
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

        const { desc: cDesc, rowLevel: cRowLevel, freeCnt: cFreeCnt, qualityHtml: cQualityHtml, infoBody: cInfoBody, infoTagParts: cInfoTagParts } = buildRowDesc(centry, childRow);
        cButtons.push(`<button data-act="free" class="char-btn${cFreeCnt ? ' danger' : ''}" title="Gör föremål gratis (Shift-klick rensar)">${icon('free')}</button>`);

        const cBadge = childRow.qty > 1 ? `<span class="count-badge">×${childRow.qty}</span>` : '';
        const cPriceText = formatMoney(calcRowCost(childRow, forgeLvl, alcLevel, artLevel));
        const cPriceLabel = cTagTyp.includes('Anställning') ? 'Dagslön' : 'Pris';
        const cPriceDisplay = `${cPriceLabel}: ${cPriceText}`.trim();
        const cWeightText = formatWeight(calcRowWeight(childRow));
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
          meta: cInfoMeta
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
        const childBaseName = (childRow.id === 'l9' && childRow.trait)
          ? `${childName}: ${childRow.trait}`
          : childName;

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
          detailsHost.appendChild(sublistEl);
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
    const squareBtn = getEl('squareBtn');
    if (squareBtn) squareBtn.onclick = openQtyPopup;
    const customBtn = getEl('addCustomBtn');
    if (customBtn) customBtn.onclick = () => {
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
    };
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
            const perkActive = storeHelper.getCurrentList(store)
              .some(x => x.namn === 'Välutrustad');
            const pg = row.perkGratis || 0;
            if (perkActive && row.perk === 'Välutrustad' && pg > 0) {
              if (!(await confirmPopup('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?'))) return;
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
          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          const pg = row.perkGratis || 0;
          if (perkActive && row.perk === 'Välutrustad' && pg > 0) {
            if (!(await confirmPopup('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?'))) return;
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
            const hidden = isHiddenType(tagTyp);
            if (needsArtifactListSync(tagTyp)) {
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
          if (entry.id === 'di79') {
            const bundle = ['di10','di11','di12','di13','di14','di15'];
            bundle.forEach(id => {
              const ent = getEntry(id);
              if (!ent.namn) return;
              const indivItem = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
                .some(t => ent.taggar.typ.includes(t)) &&
                !STACKABLE_IDS.includes(ent.id) &&
                !['kraft','ritual'].includes(ent.bound);
              const existing = inv.findIndex(r => r.id === ent.id);
              if (indivItem || existing === -1) {
                const obj = { id: ent.id, name: ent.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
                inv.push(obj);
                if (livePairs) livePairs.push({ prev: null, next: obj });
              } else {
                const target = inv[existing];
                const prevState = livePairs ? cloneRow(target) : null;
                target.qty++;
                if (livePairs) livePairs.push({ prev: prevState, next: target });
              }
            });
            if (livePairs && livePairs.length) {
              applyLiveModePayment(livePairs);
              livePairs.length = 0;
            }
            saveInventory(inv);
            renderInventory();
            bundle.forEach(id => {
              const ent = getEntry(id);
              const i = inv.findIndex(r => r.id === id);
              const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(ent.namn)}"][data-idx="${i}"]`);
              if (li) {
                li.classList.add('inv-flash');
                setTimeout(() => li.classList.remove('inv-flash'), 600);
              }
            });
          } else {
            if (liveEnabled) {
              purchase = await openLiveBuyPopup(entry, row);
              if (!purchase) return;
            }
            const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
              .some(t => entry.taggar.typ.includes(t)) &&
              !STACKABLE_IDS.includes(entry.id) &&
              !['kraft','ritual'].includes(entry.bound);
            const tagTyp = entry.taggar?.typ || [];
            let artifactEffect = '';
            if (tagTyp.includes('Artefakt')) {
              const val = await selectArtifactPayment();
              if (val === null) return;
              artifactEffect = val;
            }
            const addRow = trait => {
              const qtyToAdd = Math.max(1, purchase?.qty || 1);
              const priceMoney = purchase ? purchase.pricePerUnit : null;
              const applyLiveBase = target => {
                if (!priceMoney || !target) return;
                target.basePrice = {
                  daler: priceMoney.daler,
                  skilling: priceMoney.skilling,
                  'örtegar': priceMoney['örtegar']
                };
                target.basePriceSource = 'live';
              };
              let flashIdx;
              if (indiv) {
                for (let iAdd = 0; iAdd < qtyToAdd; iAdd++) {
                  const obj = { id: entry.id, name: entry.namn, qty: 1, gratis: 0, gratisKval: [], removedKval: [] };
                  if (artifactEffect) obj.artifactEffect = artifactEffect;
                  if (trait) obj.trait = trait;
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
                applyLiveBase(obj);
                parentArr.push(obj);
                flashIdx = parentArr.length - 1;
                if (livePairs) livePairs.push({ prev: null, next: obj });
              } else {
                const obj = { id: entry.id, name: entry.namn, qty: qtyToAdd, gratis:0, gratisKval:[], removedKval:[] };
                if (artifactEffect) obj.artifactEffect = artifactEffect;
                if (trait) obj.trait = trait;
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
              const hidden = isHiddenType(tagTyp);
              let addedToList = false;
              if (needsArtifactListSync(tagTyp)) {
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
            if (['kraft','ritual'].includes(entry.bound) && row?.trait) {
              addRow(row.trait);
            } else if (entry.traits && window.maskSkill) {
              const used = inv.filter(it => it.id === entry.id).map(it=>it.trait).filter(Boolean);
              maskSkill.pickTrait(used, async trait => {
                if(!trait) return;
                if (used.includes(trait) && !(await confirmPopup('Samma karakt\u00e4rsdrag finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
                addRow(trait);
              });
            } else if (entry.bound === 'kraft' && window.powerPicker) {
              const used = inv.filter(it => it.id === entry.id).map(it=>it.trait).filter(Boolean);
              powerPicker.pickKraft(used, async val => {
                if(!val) return;
                if (used.includes(val) && !STACKABLE_IDS.includes(entry.id) && !(await confirmPopup('Samma formel finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
                addRow(val);
              });
            } else if (entry.bound === 'ritual' && window.powerPicker) {
              const used = inv.filter(it => it.id === entry.id).map(it=>it.trait).filter(Boolean);
              powerPicker.pickRitual(used, async val => {
                if(!val) return;
                if (used.includes(val) && !STACKABLE_IDS.includes(entry.id) && !(await confirmPopup('Samma ritual finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
                addRow(val);
              });
            } else {
              addRow();
            }
          }
          return;
        }
      // "–" minskar qty eller tar bort posten
      if (act === 'sub') {
        if (row) {
          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          const pg = row.perkGratis || 0;
          const removingPerkItem = (row.qty - 1) < pg;
          if (perkActive && row.perk === 'Välutrustad' && removingPerkItem) {
            if (!(await confirmPopup('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?'))) return;
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
          const hidden = isHiddenType(tagTyp);
          if (needsArtifactListSync(tagTyp)) {
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
        const qualities = DB.filter(isQual).filter(q => window.canApplyQuality ? canApplyQuality(entry, q) : true);
        if (!qualities.length) {
          if (window.alertPopup) await alertPopup('Inga passande kvaliteter för detta föremål.');
          return;
        }
        openQualPopup(qualities, qIdx => {
          if (row && qualities[qIdx]) {
            row.kvaliteter = row.kvaliteter || [];
            const qn = qualities[qIdx].namn;
            const removed = row.removedKval ?? [];
            const baseQuals = [
              ...(entry.taggar?.kvalitet ?? []),
              ...splitQuals(entry.kvalitet)
            ];
            const baseQ = baseQuals.filter(q => !removed.includes(q));
            const existing = [...baseQ, ...row.kvaliteter];
            if (!existing.includes(qn)) {
              row.kvaliteter.push(qn);
              saveInventory(inv);
              renderInventory();
            }
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
        const allQ = [...baseQ, ...(row.kvaliteter ?? [])];
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
        const val = await selectArtifactPayment(row.artifactEffect);
        if (val === null) return;
        row.artifactEffect = val;
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

          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          if (
            perkActive &&
            row.perk === 'Välutrustad' &&
            newGratis < currentGratis &&
            newGratis < (row.perkGratis || 0)
          ) {
            if (!(await confirmPopup('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?'))) {
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
    const manageBtn = getEl('manageMoneyBtn');
    const multiBtn  = getEl('multiPriceBtn');
    const resetBtn  = getEl('moneyResetBtn');
    const clearBtn  = getEl('clearInvBtn');
    const saveFreeBtn = getEl('saveFreeBtn');
    // Bind existing buttons if present
    if (manageBtn) manageBtn.onclick = openMoneyPopup;
    if (multiBtn)  multiBtn.onclick  = openPricePopup;
    if (saveFreeBtn) saveFreeBtn.onclick = openSaveFreePopup;
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


    const inv = storeHelper.getInventory(store);
    inv
      .map((row, idx) => ({row, entry:getEntry(row.id || row.name), idx}))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'))
      .forEach(v => {
        const btnId = `vehicleBtn-${v.idx}`;
        const b = getEl(btnId);
        if (b) {
          const datasetIdx = Number(b.dataset?.vehicleIdx);
          const targetIdx = Number.isNaN(datasetIdx) ? v.idx : datasetIdx;
          b.onclick = () => openVehiclePopup(targetIdx);
        }
      });
  }

  window.invUtil = {
    moneyToO,
    oToMoney,
    sortInvEntry,
    saveInventory,
    sortAllInventories,
    getEntry,
    calcRowCost,
    calcRowWeight,
    calcEntryCost,
    makeNameMap,
    filter: F,
    sortQualsForDisplay,
    openQualPopup,
    openCustomPopup,
    editCustomEntry,
    editArtifactEntry,
    openMoneyPopup,
    openQtyPopup,
    applyLiveModePayment,
    openLiveBuyPopup,
    openPricePopup,
    openVehiclePopup,
    openVehicleRemovePopup,
    openRowPricePopup,
    openSaveFreePopup,
    buildInventoryRow,
    openBuyMultiplePopup,
    massFreeAndSave,
    recalcArtifactEffects,
    addWellEquippedItems,
    removeWellEquippedItems,
    renderInventory,
    bindInv,
    bindMoney
  };
})(window);
