/* ===========================================================
   inventory-utils.js – helper functions for inventory handling
   =========================================================== */

(function(window){
  const F = { typ: '', invTxt: '' };
  // Bring shared currency bases into local scope
  const SBASE = window.SBASE;
  const OBASE = window.OBASE;
  const moneyToO = window.moneyToO;
  const oToMoney = window.oToMoney;
  const iconHtml = window.iconHtml;
  const INV_TOOLS_KEY = 'invToolsOpen';
  const INV_INFO_KEY  = 'invInfoOpen';
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
  let dragIdx = null;
  let dragEl = null;
  let dragEnabled = false;

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
    storeHelper.save(store);
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
      desc.value = '';
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
      desc.value = existing.beskrivning || '';
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
              <input class=\"power-name\" placeholder=\"Förmågans namn\" value=\"${k.replace(/\"/g,'&quot;')}\">\n              <textarea class=\"power-desc\" placeholder=\"Beskrivning\">${existing.niv\u00e5er[k] ? String(existing.niv\u00e5er[k]) : ''}</textarea>\n              <button class=\"char-btn danger power-del\" type=\"button\">✕</button>
            `;
            powerList.appendChild(row);
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
        beskrivning: desc.value.trim(),
        artifactEffect: (effSel && types.includes('Artefakt')) ? effSel.value : ''
      };
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
      resetFields();
      if (title) title.textContent = 'Nytt föremål';
      add.textContent = 'Spara';
      if (effBox) effBox.style.display = 'none';
      if (weaponBox) weaponBox.style.display = 'none';
      if (armorBox) armorBox.style.display = 'none';
    }

    pop.classList.add('open');
    if (popInner) popInner.scrollTop = 0;
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
        <textarea class="power-desc" placeholder="Beskrivning"></textarea>
        <button class="char-btn danger power-del" type="button">✕</button>
      `;
      powerList.appendChild(row);
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
    const setBtn= root.getElementById('moneySetBtn');
    const addBtn= root.getElementById('moneyAddBtn');
    const cancel= root.getElementById('moneyCancel');

    // Fälten ska börja tomma oavsett aktuell summa pengar
    dIn.value = sIn.value = oIn.value = '';

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      setBtn.removeEventListener('click', onSet);
      addBtn.removeEventListener('click', onAdd);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      dIn.value = sIn.value = oIn.value = '';
    };
    const getInputMoney = () => storeHelper.normalizeMoney({
      daler: Number(dIn.value)||0,
      skilling: Number(sIn.value)||0,
      'örtegar': Number(oIn.value)||0
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
      const money = getInputMoney();
      maybeAdv(() => {
        storeHelper.setMoney(store, money);
        renderInventory();
      });
    };
    const onAdd = () => {
      const addMoney = getInputMoney();
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
    const onCancel = () => { close(); };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)) close();
    };

    setBtn.addEventListener('click', onSet);
    addBtn.addEventListener('click', onAdd);
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

      if (indiv) {
        for (let i = 0; i < qty; i++) {
          const clone = JSON.parse(JSON.stringify(row));
          clone.qty = 1;
          parentArr.push(clone);
        }
      } else {
        row.qty += qty;
      }

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
      } else {
        row.basePrice = { daler: d, skilling: s, 'örtegar': o };
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

function openVehiclePopup(preselectId, precheckedPaths) {
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
    if (preselectId) {
      const found = vehicles.find(v => v.entry.id === preselectId);
      if (found) sel.value = String(found.idx);
    }

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

  function openDeleteContainerPopup(removeAll, removeOnly) {
    const root = getToolbarRoot();
    if (!root) return;
    const pop    = root.getElementById('deleteContainerPopup');
    const allBtn = root.getElementById('deleteContainerAll');
    const onlyBtn= root.getElementById('deleteContainerOnly');
    const cancel = root.getElementById('deleteContainerCancel');

    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;

    const close = () => {
      pop.classList.remove('open');
      allBtn.removeEventListener('click', onAll);
      onlyBtn.removeEventListener('click', onOnly);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
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
    storeHelper.setPrivMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
    storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
    storeHelper.setMoney(store, {
      daler: diff.d,
      skilling: diff.s,
      'örtegar': diff.o
    });

    flat.forEach(row => {
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
    let base = moneyToO(row.basePrice || entry.grundpris || {});
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
      }
    }
    if (tagTyp.includes('Elixir')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) base = dividePrice(base, 2);
    }
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (artLevel >= req) base = dividePrice(base, 2);
    }
    // Build price chain and track before/after for each quality
    let price = base;
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
    const qty = row.qty || 1;
    const freeBase = Math.min(Number(row.gratis || 0), qty);

    // Full price before adjustments
    const fullPerUnit = price * mult;
    let total = fullPerUnit * qty;

    // Adjustment for free base price
    total -= base * mult * freeBase;

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
    if (!isArtifact || isLArtifact) {
      desc += abilityHtml(entry, rowLevel);
    }
    const arkTags = explodeTags(tagger.ark_trad);
    const tagList = (tagger.typ || [])
      .concat(arkTags.length ? arkTags : (Array.isArray(tagger.ark_trad) ? ['Traditionslös'] : []), tagger.test || [])
      .map(t => `<span class="tag">${t}</span>`);
    if (rowLevel) tagList.push(`<span class="tag level">${rowLevel}</span>`);
    if (freeCnt) tagList.push(`<span class="tag free removable" data-free="1">Gratis${freeCnt>1?`×${freeCnt}`:''} ✕</span>`);
    const priceMult = row.priceMult;
    if (priceMult && Math.abs(priceMult - 1) > 0.001) {
      const mTxt = Number.isInteger(priceMult)
        ? priceMult
        : priceMult.toFixed(2).replace(/\.?0+$/, '');
      tagList.push(`<span class="tag price-mult removable" data-mult="1">×${mTxt} ✕</span>`);
    }
    if (row.basePrice) {
      const t = formatMoney(row.basePrice);
      tagList.push(`<span class="tag price-base removable" data-price="1">Grundpris: ${t} ✕</span>`);
    }
    if (tagList.length) {
      desc += `<div class="tags">${tagList.join(' ')}</div>`;
    }
    desc += itemStatHtml(entry, row);
    if (row.trait && !entry.bound && row.id !== 'l9') {
      const label = entry.boundLabel || 'Karakt\u00e4rsdrag';
      desc += `<br><strong>${label}:</strong> ${row.trait}`;
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
    if (all.length) {
      const qhtml = all.map(obj => {
        const q = obj.q;
        const cls = `tag removable quality${isMysticQual(q)?' mystic':''}${isNegativeQual(q)?' negative':''}${isNeutralQual(q)?' neutral':''}${freeQ.includes(q)?' free':''}`;
        const baseAttr = obj.base ? ' data-base="1"' : '';
        return `<span class="${cls}" data-qual="${q}"${baseAttr}>${q} ✕</span>`;
      }).join('');
      desc += `<br>Kvalitet:<div class="tags">${qhtml}</div>`;
    }

    const effectVal = row.artifactEffect ?? entry.artifactEffect ?? '';
    if (isArtifact) {
      let txt, cls = 'tag';
      if (effectVal === 'corruption') {
        txt = '+1 Permanent korruption';
      } else if (effectVal === 'xp') {
        txt = '\u20131 Erfarenhetspo\u00e4ng';
      } else {
        txt = 'Obunden';
        cls += ' unbound';
      }
      desc += `<br><span class="${cls}">${txt}</span>`;
    }
    return { desc, rowLevel, freeCnt };
  }

  function renderInventory () {
    if (!dom.invList) return;                        // index-sidan saknar listan
    const openKeys = new Set(
      [...dom.invList.querySelectorAll('li.card:not(.compact)')]
        .map(li => li.dataset.special || `${li.dataset.id || ''}|${li.dataset.trait || ''}|${li.dataset.level || ''}`)
    );
    // Preserve open state for Formaliteter cards (now split into tools/info)
    if (dom.invFormal) {
      [...dom.invFormal.querySelectorAll('li.card')].forEach(li => {
        if (!li.classList.contains('compact') && li.dataset.special) {
          openKeys.add(li.dataset.special);
        }
      });
    }
    const allInv = storeHelper.getInventory(store);
    const flatInv = flattenInventory(allInv);
    const nameMap = makeNameMap(allInv);
    recalcArtifactEffects();
    if (window.updateXP) updateXP();
    const cash = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));
    const list = storeHelper.getCurrentList(store);

    /* ---------- summa i pengar ---------- */
    const partyForge = LEVEL_IDX[storeHelper.getPartySmith(store) || ''] || 0;
    const skillForge = storeHelper.abilityLevel(
      list, 'Smideskonst');
    const forgeLvl = Math.max(partyForge, skillForge);
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(
      list, 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const partyArt = LEVEL_IDX[storeHelper.getPartyArtefacter(store) || ''] || 0;
    const skillArt = storeHelper.abilityLevel(
      list, 'Artefaktmakande');
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
      const entry = getEntry(r.name);
      const isVeh = (entry.taggar?.typ || []).includes('F\u00e4rdmedel');
      return s + (isVeh ? 0 : calcRowWeight(r));
    }, 0) + moneyWeight;
    const traits = storeHelper.getTraits(store);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(allInv) : {};
    const valStark = (traits['Stark']||0) + (bonus['Stark']||0) + (maskBonus['Stark']||0);
    const baseCap = storeHelper.calcCarryCapacity(valStark, list);
    const maxCapacity = baseCap;
    const remainingCap = maxCapacity - usedWeight;

    // Capacity color helper: based on used/max ratio
    const capClassOf = (used, max) => {
      if (!max || max <= 0) return '';
      const ratio = used / max;
      if (ratio > 1.0) return 'cap-neg';    // överlast: över maxkapacitet
      if (ratio >= 0.95) return 'cap-crit'; // nära max
      if (ratio >= 0.80) return 'cap-warn'; // närmar sig
      return '';
    };
    const charCapClass = capClassOf(usedWeight, maxCapacity);

    const vehicles = allInv
      .map((row,i)=>({ row, entry:getEntry(row.id || row.name), idx:i }))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));

    if (dom.invTypeSel) {
      const types = new Set();
      allInv.forEach(row => {
        const entry = getEntry(row.id || row.name);
        (entry.taggar?.typ || [])
          .filter(Boolean)
          .forEach(t => types.add(t));
      });
      dom.invTypeSel.innerHTML =
        '<option value="">Kategori (alla)</option>' +
        [...types]
          .sort((a, b) => catName(a).localeCompare(catName(b)))
          .map(t =>
            `<option value="${t}"${t===F.typ?' selected':''}>${catName(t)}</option>`)
          .join('');
    }

    const inv = allInv
      .filter(row => {
        if (F.typ) {
          const entry = getEntry(row.id || row.name);
          if (!(entry.taggar?.typ || []).includes(F.typ)) return false;
        }
        if (F.invTxt && !rowMatchesText(row, F.invTxt)) return false;
        return true;
      });

    const foodCount = flatInv
      .filter(row => {
        const entry = getEntry(row.id || row.name);
        return (entry.taggar?.typ || []).some(t => t.toLowerCase() === 'mat');
      })
      .reduce((sum, row) => sum + (row.qty || 0), 0);

    const moneyRow = moneyWeight
      ? `            <div class="cap-row"><span class="label">Myntvikt:</span><span class="value">${formatWeight(moneyWeight)}</span></div>`
      : '';

    /* ---------- kort för formaliteter (uppdelat: verktyg & information) ---------- */
    const toolsKey = '__tools__';
    const infoKey  = '__info__';
    const toolsLS = localStorage.getItem(INV_TOOLS_KEY) === '1';
    const infoLS  = localStorage.getItem(INV_INFO_KEY) === '1';
    if (toolsLS) openKeys.add(toolsKey); else openKeys.delete(toolsKey);
    if (infoLS)  openKeys.add(infoKey);  else openKeys.delete(infoKey);
    const vehicleBtns = vehicles
      .map(v => `<button id="vehicleBtn-${v.entry.id}" class="char-btn">Lasta i ${v.entry.namn}</button>`)
      .join('');

    const toolsCard = `
      <li class="card${openKeys.has(toolsKey) ? '' : ' compact'}" data-special="${toolsKey}">
        <div class="card-title"><span><span class="collapse-btn"></span>Verktyg 🧰</span></div>
        <div class="card-desc">
          <div class="inv-buttons">
            <button id="addCustomBtn" class="char-btn">Nytt föremål</button>
            <button id="manageMoneyBtn" class="char-btn">Hantera pengar</button>
            <button id="multiPriceBtn" class="char-btn">Multiplicera pris</button>
            <button id="squareBtn" class="char-btn" aria-label="Lägg till antal" title="Lägg till antal">Lägg till antal</button>
            ${vehicleBtns}
            <button id="dragToggle" class="char-btn">Dra & Släpp</button>
            <button id="saveFreeBtn" class="char-btn">Spara & gratismarkera</button>
            <button id="clearInvBtn" class="char-btn danger">Rensa inventarie</button>
          </div>
        </div>
      </li>`;

    const infoCard = `
      <li class="card${openKeys.has(infoKey) ? '' : ' compact'}" data-special="${infoKey}">
        <div class="card-title"><span><span class="collapse-btn"></span>Information 🔎</span></div>
        <div class="card-desc">
          <div class="formal-section">
            <div class="formal-title">Pengar
              <div class="money-control">
                <button id="moneyMinusBtn" data-act="moneyMinus" class="char-btn icon" aria-label="Minska mynt" title="Minska mynt">${iconHtml('minus')}</button>
                <button id="moneyPlusBtn" data-act="moneyPlus" class="char-btn icon" aria-label="Öka mynt" title="Öka mynt">${iconHtml('plus')}</button>
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
          </div>
        </div>
      </li>`;

    /* ---------- kort för varje föremål ---------- */
    const itemCards = inv.length
      ? inv.map((row) => {
          const realIdx = allInv.indexOf(row);
          const entry   = getEntry(row.id || row.name);
          const tagTyp  = entry.taggar?.typ ?? [];
          const isVehicle = tagTyp.includes('F\u00e4rdmedel');
          const baseWeight = row.vikt ?? entry.vikt ?? entry.stat?.vikt ?? 0;
          const rowWeight = calcRowWeight(row);
          const loadWeight = rowWeight - baseWeight * row.qty;
          const capacity = isVehicle ? (entry.stat?.b\u00e4rkapacitet || 0) : 0;
          const remaining = capacity - loadWeight;

          const { desc, rowLevel, freeCnt } = buildRowDesc(entry, row);
          const dataLevel = rowLevel ? ` data-level="${rowLevel}"` : '';

          const isArtifact = tagTyp.includes('Artefakt');
          const isCustom = tagTyp.includes('Hemmagjort');

          /* — knappar — */
          const isGear = ['Vapen', 'Sköld', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakt', 'Färdmedel'].some(t => tagTyp.includes(t));
          const allowQual = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt'].some(t => tagTyp.includes(t));
          const canStack = ['kraft','ritual'].includes(entry.bound);
          const btnRow = (isGear && !canStack)
            ? `<button data-act="del" class="char-btn danger icon" aria-label="Ta bort">${iconHtml('remove')}</button>`
            : `<button data-act="del" class="char-btn danger icon" aria-label="Ta bort">${iconHtml('remove')}</button>
               <button data-act="sub" class="char-btn" aria-label="Minska">${iconHtml('minus')}</button>
               <button data-act="add" class="char-btn" aria-label="Lägg till">${iconHtml('plus')}</button>`;
          const freeBtn = `<button data-act="free" class="char-btn${freeCnt? ' danger':''}">🆓</button>`;
          const editBtn = isCustom ? `<button data-act="editCustom" class="char-btn">✏️</button>` : '';
          const freeQBtn = allowQual ? `<button data-act="freeQual" class="char-btn">☭</button>` : '';
          const toggleBtn = isArtifact ? `<button data-act="toggleEffect" class="char-btn">↔</button>` : '';
          const badge = row.qty > 1 ? ` <span class="count-badge">×${row.qty}</span>` : '';

          // rowLevel och dataLevel beräknades tidigare
          const priceText = formatMoney(
            calcRowCost(row, forgeLvl, alcLevel, artLevel)
          );
          const priceLabel = tagTyp.includes('Anställning') ? 'Dagslön:' : 'Pris:';
          const weightText = formatWeight(rowWeight);
          const key = `${row.id || row.name}|${row.trait || ''}|${rowLevel || ''}`;
          let vehicleInfo = '';
          let cardClass = '';
          if (isVehicle) {
            const vClass = capClassOf(loadWeight, capacity);
            vehicleInfo = `<br><span class="${vClass}">B\u00e4rkapacitet: ${formatWeight(capacity)}<br>\u00c5terst\u00e5ende: ${formatWeight(remaining)}</span>`;
            if (remaining < 0) cardClass = ' vehicle-over';
          }

          const txt = (F.invTxt || '').toLowerCase();
          const showChildrenPairs = (() => {
            const children = (row.contains || []).map((c,j)=>({ c, j }));
            if (!isVehicle) return children;
            if (!txt) return children;
            const selfMatch = String(row.name || '').toLowerCase().includes(txt);
            if (selfMatch) return children;
            return children.filter(({c}) => rowMatchesText(c, txt));
          })();

          const sublist = (row.contains && row.contains.length)
            ? `<ul class="card-list vehicle-items">${showChildrenPairs.map(({c,j})=>{
                const centry = getEntry(c.name);
                const ctagTyp = centry.taggar?.typ ?? [];
                const cPrice = formatMoney(calcRowCost(c, forgeLvl, alcLevel, artLevel));
                const cPriceLabel = ctagTyp.includes('Anställning') ? 'Dagslön:' : 'Pris:';
                const cWeight = formatWeight(calcRowWeight(c));
                const vClass = capClassOf(loadWeight, capacity);
                const cBadge = c.qty > 1 ? ` <span class="count-badge">×${c.qty}</span>` : '';
                const cIsGear = ['Vapen', 'Sköld', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakt'].some(t => ctagTyp.includes(t));
                const cAllowQual = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt'].some(t => ctagTyp.includes(t));
                const cCanStack = ['kraft','ritual'].includes(centry.bound);
                const cBtnRow = (cIsGear && !cCanStack)
                  ? `<button data-act="del" class="char-btn danger icon" aria-label="Ta bort">${iconHtml('remove')}</button>`
                  : `<button data-act="del" class="char-btn danger icon" aria-label="Ta bort">${iconHtml('remove')}</button>
                     <button data-act="sub" class="char-btn" aria-label="Minska">${iconHtml('minus')}</button>
                     <button data-act="add" class="char-btn" aria-label="Lägg till">${iconHtml('plus')}</button>`;
                const { desc: cDesc, rowLevel: cRowLevel, freeCnt: cFreeCnt } = buildRowDesc(centry, c);
                const cDataLevel = cRowLevel ? ` data-level="${cRowLevel}"` : '';
                const cKey = `${c.id || c.name}|${c.trait || ''}|${cRowLevel || ''}`;
                const cFreeBtn = `<button data-act="free" class="char-btn${cFreeCnt? ' danger':''}">🆓</button>`;
                const cFreeQBtn = cAllowQual ? `<button data-act="freeQual" class="char-btn">☭</button>` : '';
                const cToggleBtn = ctagTyp.includes('Artefakt') ? `<button data-act="toggleEffect" class="char-btn">↔</button>` : '';
                const cEditBtn = ctagTyp.includes('Hemmagjort') ? `<button data-act="editCustom" class="char-btn">✏️</button>` : '';
                const cPath = `${realIdx}.${j}`;
                const cTitle = nameMap.get(c) || c.name;
                return `<li class="card${remaining < 0 ? ' vehicle-over' : ''}${openKeys.has(cKey) ? '' : ' compact'}" data-parent="${realIdx}" data-child="${j}" data-id="${c.id || c.name}" data-name="${c.name}"${c.trait?` data-trait="${c.trait}"`:''}${cDataLevel}>
                  <div class="card-title"><span><span class="collapse-btn"></span>${(c.id === 'l9' && c.trait) ? `${cTitle}: ${c.trait}` : cTitle}${cBadge}</span></div>
                  <div class="card-desc">${cDesc}<br>Antal: ${c.qty}<br><span class="price-click" data-act="priceQuick">${cPriceLabel} ${cPrice}</span><br><span class="${vClass}">Vikt: ${cWeight}</span></div>
                  <div class="inv-controls">
                    ${cBtnRow}
                    ${cEditBtn}
                    ${cAllowQual ? `<button data-act="addQual" class="char-btn">🔨</button>` : ''}
                    ${cFreeQBtn}
                    ${cToggleBtn}
                    ${cFreeBtn}
                  </div>
                </li>`;}).join('')}</ul>`
            : '';

          return `
            <li class="card${cardClass}${openKeys.has(key) ? '' : ' compact'}"
                data-idx="${realIdx}"
                data-id="${row.id || row.name}"
                data-name="${row.name}"${row.trait?` data-trait="${row.trait}"`:''}${dataLevel}>
              <div class="card-title"><span><span class="collapse-btn"></span>${(row.id === 'l9' && row.trait) ? `${nameMap.get(row)}: ${row.trait}` : nameMap.get(row)}${badge}</span></div>
              <div class="card-desc">
                ${desc}<br>Antal: ${row.qty}<br><span class="price-click" data-act="priceQuick">${priceLabel} ${priceText}</span><br><span class="${isVehicle ? capClassOf(loadWeight, capacity) : charCapClass}">Vikt: ${weightText}</span>${vehicleInfo}
              </div>
              <div class="inv-controls">
                ${btnRow}
                ${editBtn}
                ${allowQual ? `<button data-act="addQual" class="char-btn">🔨</button>` : ''}
                ${freeQBtn}
                ${toggleBtn}
                ${freeBtn}
                ${isVehicle ? `<button data-act="vehicleLoad" class="char-btn">⬇️</button><button data-act="vehicleUnload" class="char-btn">⬆️</button>` : ''}
              </div>
              ${sublist}
            </li>`;
      }).join('')
    : '<li class="card">Inga föremål.</li>';

    /* ---------- skriv ut ---------- */
    if (dom.invFormal) {
      dom.invFormal.innerHTML = toolsCard + infoCard;
      localStorage.setItem(INV_TOOLS_KEY, openKeys.has(toolsKey) ? '1' : '0');
      localStorage.setItem(INV_INFO_KEY,  openKeys.has(infoKey) ? '1' : '0');
    }
    dom.invList.innerHTML       = itemCards;
    if (dom.wtOut) dom.wtOut.textContent = formatWeight(usedWeight);
    if (dom.slOut) dom.slOut.textContent = formatWeight(maxCapacity);
    dom.invBadge.textContent    = flatInv.reduce((s, r) => s + r.qty, 0);
    dom.invBadge.classList.add('badge-pulse');
    setTimeout(() => dom.invBadge.classList.remove('badge-pulse'), 600);
    dom.unusedOut = $T('unusedOut');
    dom.dragToggle = $T('dragToggle');
    if (dom.unusedOut) dom.unusedOut.textContent = diffText;
    if (dom.collapseAllBtn) updateCollapseBtnState();
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
    if (dom.invTypeSel) {
      dom.invTypeSel.onchange = () => {
        F.typ = dom.invTypeSel.value;
        renderInventory();
      };
    }
    const invSearch = $T('invSearch');
    if (invSearch) {
      invSearch.value = F.invTxt || '';
      invSearch.oninput = () => {
        F.invTxt = (invSearch.value || '').trim().toLowerCase();
        renderInventory();
      };
    }
    const squareBtn = $T('squareBtn');
    if (squareBtn) squareBtn.onclick = openQtyPopup;
    const customBtn = $T('addCustomBtn');
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
          if (li.dataset.special === '__tools__') {
            localStorage.setItem(INV_TOOLS_KEY, anyOpen ? '0' : '1');
          } else if (li.dataset.special === '__info__') {
            localStorage.setItem(INV_INFO_KEY, anyOpen ? '0' : '1');
          }
        });
        updateCollapseBtnState();
      };
    }
    if (dom.dragToggle) {
      dom.dragToggle.classList.toggle('danger', dragEnabled);
      if (dom.invList) dom.invList.classList.toggle('drag-mode', dragEnabled);
      dom.dragToggle.onclick = () => {
        dragEnabled = !dragEnabled;
        dom.dragToggle.classList.toggle('danger', dragEnabled);
        if (dom.invList) dom.invList.classList.toggle('drag-mode', dragEnabled);
      };
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
    dom.invList.onclick = async e => {
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
        }
        saveInventory(inv);
        renderInventory();
        return;
      }

      // 2) Klick på titeln för att expandera/kollapsa posten
      const cardTitle = e.target.closest('.card-title');
      if (cardTitle) {
        const li = cardTitle.closest('li.card');
        li.classList.toggle('compact');
        updateCollapseBtnState();
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
        if (entry?.id) openVehiclePopup(entry.id);
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

        // "+" lägger till qty eller en ny instans
        if (act === 'add') {
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
                inv.push({ id: ent.id, name: ent.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] });
              } else {
                inv[existing].qty++;
              }
            });
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
              const obj = { id: entry.id, name: entry.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
              if (artifactEffect) obj.artifactEffect = artifactEffect;
              if (trait) obj.trait = trait;
              let flashIdx;
              if (indiv) {
                parentArr.push(obj);
                flashIdx = parentArr.length - 1;
              } else if (row && (!trait || row.trait === trait)) {
                row.qty++;
                flashIdx = idx;
              } else if (row && trait && row.trait !== trait) {
                parentArr.push(obj);
                flashIdx = parentArr.length - 1;
              } else {
                parentArr.push(obj);
                flashIdx = parentArr.length - 1;
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
          let newGratis = Number(row.gratis || 0) + 1;
          if (newGratis > row.qty) newGratis = 0;

          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          if (
            perkActive &&
            row.perk === 'Välutrustad' &&
            newGratis < (row.gratis || 0) &&
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

    // Bind clicks within the Formaliteter card when it is outside invList
    if (dom.invFormal) {
      dom.invFormal.onclick = async e => {
        // Toggle expand/collapse on title
        const cardTitle = e.target.closest('.card-title');
        if (cardTitle) {
          const li = cardTitle.closest('li.card');
          if (li) {
            const isCompact = li.classList.toggle('compact');
            updateCollapseBtnState();
            const key = li.dataset.special === '__tools__' ? INV_TOOLS_KEY : INV_INFO_KEY;
            localStorage.setItem(key, isCompact ? '0' : '1');
          }
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
      };
    }

    if (dom.invList) {
      dom.invList.removeEventListener('pointerdown', handlePointerDown);
      dom.invList.addEventListener('pointerdown', handlePointerDown);
    }
  }

  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('li[data-idx]:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function handlePointerDown(e) {
    if (!dragEnabled) return;
    const li = e.target.closest('li[data-idx]');
    if (!li || e.target.closest('button')) return;

    let pressTimer;

    const onMove = ev => {
      if (!dragEl) return;
      ev.preventDefault();
      const after = getDragAfterElement(dom.invList, ev.clientY);
      if (after == null) {
        dom.invList.appendChild(dragEl);
      } else {
        dom.invList.insertBefore(dragEl, after);
      }
    };

    const startDrag = () => {
      dragIdx = Number(li.dataset.idx);
      dragEl = li;
      li.classList.add('dragging');
      li.setPointerCapture(e.pointerId);
      window.addEventListener('pointermove', onMove);
    };

    const onUp = ev => {
      clearTimeout(pressTimer);
      if (!dragEl) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        return;
      }
      onMove(ev);
      dragEl.classList.remove('dragging');
      dragEl.releasePointerCapture(ev.pointerId);
      const inv = storeHelper.getInventory(store);
      if (dragIdx !== null && inv) {
        const items = [...dom.invList.querySelectorAll('li[data-idx]')];
        const dropIdx = items.indexOf(dragEl);
        const [moved] = inv.splice(dragIdx, 1);
        inv.splice(dropIdx, 0, moved);
        saveInventory(inv);
        renderInventory();
      }
      dragIdx = null;
      dragEl = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    // Require a slightly longer press before drag to avoid
    // accidental drags when scrolling on touch devices
    pressTimer = setTimeout(startDrag, 400);

    window.addEventListener('pointerup', onUp);
  }

  function bindMoney() {
    const manageBtn = $T('manageMoneyBtn');
    const multiBtn  = $T('multiPriceBtn');
    const resetBtn  = $T('moneyResetBtn');
    const clearBtn  = $T('clearInvBtn');
    const saveFreeBtn = $T('saveFreeBtn');
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


    const inv = storeHelper.getInventory(store);
    inv
      .map(row => ({row, entry:getEntry(row.id || row.name)}))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'))
      .forEach(v => {
        const b = $T(`vehicleBtn-${v.entry.id}`);
        if (b) b.onclick = () => openVehiclePopup(v.entry.id);
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
    openPricePopup,
    openVehiclePopup,
    openVehicleRemovePopup,
    openRowPricePopup,
    openSaveFreePopup,
    massFreeAndSave,
    recalcArtifactEffects,
    addWellEquippedItems,
    removeWellEquippedItems,
    renderInventory,
    bindInv,
    bindMoney
  };
})(window);
