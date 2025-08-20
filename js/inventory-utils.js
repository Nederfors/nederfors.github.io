/* ===========================================================
   inventory-utils.js – helper functions for inventory handling
   =========================================================== */

(function(window){
  const F = { typ: '' };
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
  const moneyToO = m => (m.daler||0)*SBASE*OBASE + (m.skilling||0)*OBASE + (m['örtegar']||0);
  let dragIdx = null;
  let dragEl = null;

  const oToMoney = o => {
    const d = Math.floor(o / (SBASE * OBASE)); o %= SBASE * OBASE;
    const s = Math.floor(o / OBASE);           const ø = o % OBASE;
    return { d, s, o: ø };              // <–– returnera d/s/o
  };

  function getEntry(name) {
    const custom = storeHelper.getCustomEntries(store);
    const own = custom.find(x => x.namn === name);
    return own || DB.find(x => x.namn === name) || {};
  }

  function sortInvEntry(a, b) {
    const entA = getEntry(a.name);
    const entB = getEntry(b.name);
    return sortByType(entA, entB);
  }

  function saveInventory(inv) {
    storeHelper.setInventory(store, inv);
    recalcArtifactEffects();
    if (window.updateXP) updateXP();
    if (window.renderTraits) renderTraits();
  }

  function addWellEquippedItems(inv) {
    const freebies = [
      { name: 'Rep, 10 meter', qty: 3 },
      { name: 'Papper', qty: 1 },
      { name: 'Kritor', qty: 1 },
      { name: 'Fackla', qty: 3 },
      { name: 'Signalhorn', qty: 1 },
      { name: 'Långfärdsbröd', qty: 3 },
      { name: 'Örtkur', qty: 3 }
    ];
    freebies.forEach(it => {
      const row = inv.find(r => r.name === it.name);
      if (row) {
        row.qty += it.qty;
        row.gratis = (row.gratis || 0) + it.qty;
        row.perkGratis = (row.perkGratis || 0) + it.qty;
        if (!row.perk) row.perk = 'Välutrustad';
      } else {
        inv.push({ name: it.name, qty: it.qty, gratis: it.qty, gratisKval: [], removedKval: [], perk: 'Välutrustad', perkGratis: it.qty });
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

  function recalcArtifactEffects() {
    const inv = flattenInventory(storeHelper.getInventory(store));
    const effects = inv.reduce((acc, row) => {
      const entry = getEntry(row.name);
      const tagTyp = entry.taggar?.typ || [];
      if (!tagTyp.includes('Artefakter')) return acc;
      const eff = row.artifactEffect || entry.artifactEffect;
      if (eff === 'corruption') acc.corruption += 1;
      else if (eff === 'xp') acc.xp += 1;
      return acc;
    }, { xp:0, corruption:0 });
    storeHelper.setArtifactEffects(store, effects);
  }

  function makeNameMap(inv) {
    const counts = {};
    inv.forEach(r => { counts[r.name] = (counts[r.name] || 0) + 1; });
    const idx = {};
    const map = new Map();
    inv.forEach(r => {
      const n = r.name;
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

  function sortQualsForDisplay(list) {
    return list.slice().sort((a, b) => {
      const nameA = (typeof a === 'object' && a !== null) ? a.q : a;
      const nameB = (typeof b === 'object' && b !== null) ? b.q : b;
      const prio = q => (isNegativeQual(q) || isNeutralQual(q)) ? 0 : 1;
      const pa = prio(nameA); const pb = prio(nameB);
      if (pa !== pb) return pa - pb;
      return String(nameA).localeCompare(String(nameB));
    });
  }

  function countPositiveQuals(list) {
    return list.filter(q => !isNegativeQual(q) && !isNeutralQual(q)).length;
  }

  function openQualPopup(list, callback) {
    const pop  = bar.shadowRoot.getElementById('qualPopup');
    const box  = bar.shadowRoot.getElementById('qualOptions');
    const cls  = bar.shadowRoot.getElementById('qualCancel');

    const nameMap = makeNameMap(storeHelper.getInventory(store));
    /* bygg knappar: stöd både namn och name */
    box.innerHTML = list.map((item,i)=>{
      const base = item.namn || item.name;
      const label = nameMap.get(item) || base;
      const gCnt  = Number(item.gratis || 0);
      const mark  = gCnt ? ` 🆓${gCnt>1?`×${gCnt}`:''}` : '';
      return `<button data-i="${i}" class="char-btn">${label}${mark}</button>`;
    }).join('');

    /* öppna */
    pop.classList.add('open');

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

  function openCustomPopup(callback) {
    const pop   = bar.shadowRoot.getElementById('customPopup');
    const name  = bar.shadowRoot.getElementById('customName');
    const type  = bar.shadowRoot.getElementById('customType');
    const wIn   = bar.shadowRoot.getElementById('customWeight');
    const effBox= bar.shadowRoot.getElementById('customArtifactEffect');
    const effSel= effBox ? effBox.querySelector('select') : null;
    const dIn   = bar.shadowRoot.getElementById('customDaler');
    const sIn   = bar.shadowRoot.getElementById('customSkilling');
    const oIn   = bar.shadowRoot.getElementById('customOrtegar');
    const desc  = bar.shadowRoot.getElementById('customDesc');
    const add   = bar.shadowRoot.getElementById('customAdd');
    const cancel= bar.shadowRoot.getElementById('customCancel');

    const equipOptions = EQUIP
      .slice()
      .sort((a, b) => catName(a).localeCompare(catName(b)))
      .map(t => `<option value="${t}">${catName(t)}</option>`)
      .join('');
    type.innerHTML = equipOptions;

    pop.classList.add('open');
    if (effSel) effSel.value = 'corruption';
    if(effBox) effBox.style.display = type.value === 'Artefakter' ? '' : 'none';

    const onType = () => {
      if (effBox) effBox.style.display = type.value === 'Artefakter' ? '' : 'none';
    };
    type.addEventListener('change', onType);

    const close = () => {
      pop.classList.remove('open');
      add.removeEventListener('click', onAdd);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      name.value = '';
      dIn.value = sIn.value = oIn.value = '';
      wIn.value = '';
      desc.value = '';
      if (effSel) effSel.value = 'corruption';
      if (effBox) effBox.style.display = 'none';
      type.removeEventListener('change', onType);
    };
    const onAdd = () => {
      const entry = {
        namn: name.value.trim(),
        taggar: { typ: [type.value] },
        vikt: Number(wIn.value)||0,
        grundpris: {
          daler: Math.max(0, Number(dIn.value)||0),
          skilling: Math.max(0, Number(sIn.value)||0),
          'örtegar': Math.max(0, Number(oIn.value)||0)
        },
        beskrivning: desc.value.trim(),
        artifactEffect: effSel ? effSel.value : ''
      };
      close();
      callback(entry);
    };
    const onCancel = () => { close(); callback(null); };
    const onOutside = e => {
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        close();
        callback(null);
      }
    };

    add.addEventListener('click', onAdd);
    cancel.addEventListener('click', onCancel);
    pop.addEventListener('click', onOutside);
  }

  function openMoneyPopup() {
    const pop   = bar.shadowRoot.getElementById('moneyPopup');
    const dIn   = bar.shadowRoot.getElementById('moneyDaler');
    const sIn   = bar.shadowRoot.getElementById('moneySkilling');
    const oIn   = bar.shadowRoot.getElementById('moneyOrtegar');
    const setBtn= bar.shadowRoot.getElementById('moneySetBtn');
    const addBtn= bar.shadowRoot.getElementById('moneyAddBtn');
    const cancel= bar.shadowRoot.getElementById('moneyCancel');

    // Fälten ska börja tomma oavsett aktuell summa pengar
    dIn.value = sIn.value = oIn.value = '';

    pop.classList.add('open');

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
    const onSet = () => {
      const money = getInputMoney();
      storeHelper.setMoney(store, money);
      close();
      renderInventory();
    };
    const onAdd = () => {
      const addMoney = getInputMoney();
      const curMoney = storeHelper.getMoney(store);
      const total = storeHelper.normalizeMoney({
        daler: curMoney.daler + addMoney.daler,
        skilling: curMoney.skilling + addMoney.skilling,
        'örtegar': curMoney['örtegar'] + addMoney['örtegar']
      });
      storeHelper.setMoney(store, total);
      close();
      renderInventory();
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

  function openQtyPopup() {
    const pop   = bar.shadowRoot.getElementById('qtyPopup');
    const inEl  = bar.shadowRoot.getElementById('qtyInput');
    const list  = bar.shadowRoot.getElementById('qtyItemList');
    const cancel= bar.shadowRoot.getElementById('qtyCancel');

    inEl.value = '';
    const inv = storeHelper.getInventory(store);
    const nameMap = makeNameMap(inv);
    list.innerHTML = inv.map((row,i)=> `<button data-idx="${i}" class="char-btn">${nameMap.get(row)}</button>`).join('');

    pop.classList.add('open');

    const close = () => {
      pop.classList.remove('open');
      list.removeEventListener('click', onBtn);
      cancel.removeEventListener('click', onCancel);
      pop.removeEventListener('click', onOutside);
      list.innerHTML = '';
      inEl.value = '';
    };
    const onBtn = e => {
      const b = e.target.closest('button[data-idx]');
      if (!b) return;
      const realIdx = Number(b.dataset.idx);
      const qty = parseInt(inEl.value, 10);
      if (!qty || qty <= 0) return;

      const row   = inv[realIdx];
      const entry = getEntry(row.name);
      const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakter','Färdmedel']
        .some(t => entry.taggar?.typ?.includes(t));

      if (indiv) {
        for (let i = 0; i < qty; i++) {
          const clone = JSON.parse(JSON.stringify(row));
          clone.qty = 1;
          inv.push(clone);
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
    const pop    = bar.shadowRoot.getElementById('pricePopup');
    const inEl   = bar.shadowRoot.getElementById('priceFactor');
    const list   = bar.shadowRoot.getElementById('priceItemList');
    const apply  = bar.shadowRoot.getElementById('priceApply');
    const cancel = bar.shadowRoot.getElementById('priceCancel');

    inEl.value = '';
    const inv = storeHelper.getInventory(store);
    const nameMap = makeNameMap(inv);
    list.innerHTML = inv
      .map((row,i) => `
        <label class="price-item"><span>${nameMap.get(row)}</span><input type="checkbox" data-idx="${i}"></label>`)
      .join('');

    pop.classList.add('open');

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
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-idx]:checked')];
      checks.forEach(chk => {
        const idx = Number(chk.dataset.idx);
        const row = inv[idx];
        row.priceMult = (row.priceMult || 1) * factor;
      });
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

  function openVehiclePopup(preselectId) {
    const pop    = bar.shadowRoot.getElementById('vehiclePopup');
    const sel    = bar.shadowRoot.getElementById('vehicleSelect');
    const list   = bar.shadowRoot.getElementById('vehicleItemList');
    const apply  = bar.shadowRoot.getElementById('vehicleApply');
    const cancel = bar.shadowRoot.getElementById('vehicleCancel');

    const inv = storeHelper.getInventory(store);
    const vehicles = inv
      .map((row,i)=>({row, entry:getEntry(row.name), idx:i}))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));
    if (!vehicles.length) return;

    sel.innerHTML = vehicles
      .map(v => `<option value="${v.idx}">${v.entry.namn}</option>`)
      .join('');
    if (preselectId) {
      const found = vehicles.find(v => v.entry.id === preselectId);
      if (found) sel.value = String(found.idx);
    }

    const movable = inv
      .map((row,i)=>({row,i}))
      .filter(v => !(vehicles.some(vh => vh.idx === v.i)));
    const nameMap = makeNameMap(inv);
    list.innerHTML = movable
      .map(m => `<label class="price-item"><span>${nameMap.get(m.row)}</span><input type="checkbox" data-idx="${m.i}"></label>`)
      .join('');

    pop.classList.add('open');

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
      const checks = [...list.querySelectorAll('input[type="checkbox"][data-idx]:checked')]
        .map(ch => Number(ch.dataset.idx))
        .sort((a,b) => b-a);
      checks.forEach(idx => {
        vehicle.contains.push(inv.splice(idx,1)[0]);
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

  function calcRowCost(row, forgeLvl, alcLevel, artLevel) {
    const entry  = getEntry(row.name);
    const tagger = entry.taggar ?? {};
    const tagTyp = tagger.typ ?? [];
    let base = moneyToO(entry.grundpris || {});
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
      if (
        (forgeLvl === 1 && posCnt === 0) ||
        (forgeLvl === 2 && mystCnt === 0 && posCnt <= 1) ||
        (forgeLvl >= 3 && posCnt <= 2)
      ) {
        base = Math.floor(base / 2);
      }
    }
    if (tagTyp.includes('Elixir')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) base = Math.floor(base / 2);
    }
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (artLevel >= req) base = Math.floor(base / 2);
    }
    let price = base;
    allQuals.forEach(q => {
      const qEntry = DB.find(x => x.namn === q) || {};
      const myst  = (qEntry.taggar?.typ || []).includes('Mystisk kvalitet');
      const negat = Boolean(qEntry.negativ);
      const neut  = Boolean(qEntry.neutral);
      const markedFree = (row.gratisKval || []).includes(q);
      if (!markedFree || negat || neut) {
        if (negat)      price /= 5;
        else if (neut)  price *= 1;
        else            price *= myst ? 10 : 5;
      }
    });
    price *= row.priceMult || 1;
    const free = Math.min(Number(row.gratis || 0), row.qty);
    const totalO = Math.max(0, price * row.qty - base * free);
    return oToMoney(totalO);
  }

  function calcRowWeight(row) {
    const entry  = getEntry(row.name);
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
        price = Math.floor(price / 2);
      }
    }
    if (tagTyp.includes('Elixir')) {
      const lvlName = Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) price = Math.floor(price / 2);
    }
    if (tagTyp.includes('L\u00e4gre Artefakt')) {
      const lvlName = Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (artLevel >= req) price = Math.floor(price / 2);
    }

    
    baseQuals.forEach(q => {
      const qEntry = DB.find(x => x.namn === q) || {};
      const myst  = (qEntry.taggar?.typ || []).includes('Mystisk kvalitet');
      const negat = Boolean(qEntry.negativ);
      const neut  = Boolean(qEntry.neutral);
      if (negat)      price /= 5;
      else if (neut)  price *= 1;
      else            price *= myst ? 10 : 5;
    });
    price = Math.max(0, price);
    return oToMoney(price);
  }

  function renderInventory () {
    if (!dom.invList) return;                        // index-sidan saknar listan
    const openKeys = new Set(
      [...dom.invList.querySelectorAll('li.card:not(.compact)')]
        .map(li => li.dataset.special || `${li.dataset.name || ''}|${li.dataset.trait || ''}|${li.dataset.level || ''}`)
    );
    const allInv = storeHelper.getInventory(store);
    const flatInv = flattenInventory(allInv);
    const nameMap = makeNameMap(allInv);
    recalcArtifactEffects();
    if (window.updateXP) updateXP();
    const cash = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));

    const moneyWeight = calcMoneyWeight(cash);
    const usedWeight = allInv.reduce((s, r) => {
      const entry = getEntry(r.name);
      const isVeh = (entry.taggar?.typ || []).includes('F\u00e4rdmedel');
      return s + (isVeh ? 0 : calcRowWeight(r));
    }, 0) + moneyWeight;
    const list = storeHelper.getCurrentList(store);
    const traits = storeHelper.getTraits(store);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(allInv) : {};
    const valStark = (traits['Stark']||0) + (bonus['Stark']||0) + (maskBonus['Stark']||0);
    const baseCap = storeHelper.calcCarryCapacity(valStark, list);
    const maxCapacity = baseCap;
    const remainingCap = maxCapacity - usedWeight;

    const vehicles = allInv
      .map((row,i)=>({ row, entry:getEntry(row.name), idx:i }))
      .filter(v => (v.entry.taggar?.typ || []).includes('Färdmedel'));

    if (dom.invTypeSel) {
      const types = new Set();
      allInv.forEach(row => {
        const entry = getEntry(row.name);
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
        if (!F.typ) return true;
        const entry = getEntry(row.name);
        return (entry.taggar?.typ || []).includes(F.typ);
      });

    /* ---------- summa i pengar ---------- */
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

    const tot = flatInv.reduce((t, row) => {
      const entry = getEntry(row.name);
      const basePrice = moneyToO(entry.grundpris || {});
      let base  = basePrice;
      const tagTyp = entry.taggar?.typ || [];
      const forgeable = ['Vapen','Sköld','Rustning'].some(t => tagTyp.includes(t));
      const baseQuals = [
        ...(entry.taggar?.kvalitet ?? []),
        ...splitQuals(entry.kvalitet)
      ];
      const removedQ = row.removedKval ?? [];
      const allQualsRow = [
        ...baseQuals.filter(q => !removedQ.includes(q)),
        ...(row.kvaliteter || [])
      ];
      if (forgeLvl && forgeable) {
        const posCnt = countPositiveQuals(allQualsRow);
        const mystCnt = allQualsRow.filter(q => !isNegativeQual(q) && !isNeutralQual(q) && isMysticQual(q)).length;
        if (
          (forgeLvl === 1 && posCnt === 0) ||
          (forgeLvl === 2 && mystCnt === 0 && posCnt <= 1) ||
          (forgeLvl >= 3 && posCnt <= 2)
        ) {
          base = Math.floor(base / 2);
        }
      }
      const isElixir = (entry.taggar?.typ || []).includes('Elixir');
      if (isElixir) {
        const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
        const req = LEVEL_IDX[lvlName] || 0;
        if (alcLevel >= req) base = Math.floor(base / 2);
      }
      const isLArtifact = (entry.taggar?.typ || []).includes('L\u00e4gre Artefakt');
      if (isLArtifact) {
        const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
        const req = LEVEL_IDX[lvlName] || 0;
        if (artLevel >= req) base = Math.floor(base / 2);
      }
      let   price = base;                    // startvärde för kvaliteter

      const allQuals = allQualsRow;

      // varje icke-gratis kvalitet justerar priset
      allQuals.forEach((q) => {
        const qEntry = DB.find(x => x.namn === q) || {};
        const myst  = (qEntry.taggar?.typ || []).includes('Mystisk kvalitet');
        const negat = Boolean(qEntry.negativ);
        const neut  = Boolean(qEntry.neutral);
        const markedFree = (row.gratisKval || []).includes(q);
        if (!markedFree || negat || neut) {
          if (negat)      price /= 5;
          else if (neut)  price *= 1;
          else            price *= myst ? 10 : 5;
        }
      });

      const free = Math.min(Number(row.gratis || 0), row.qty);
      const totalO = Math.max(0, price * row.qty - base * free);
      const m = oToMoney(totalO);
      t.d += m.d; t.s += m.s; t.o += m.o;
      return t;
    }, { d: 0, s: 0, o: 0 });

    tot.s += Math.floor(tot.o / OBASE); tot.o %= OBASE;
    tot.d += Math.floor(tot.s / SBASE); tot.s %= SBASE;

    const diffO = moneyToO(cash) - (tot.d * SBASE * OBASE + tot.s * OBASE + tot.o);
    const diff  = oToMoney(Math.abs(diffO));
    const diffText = `${diffO < 0 ? '-' : ''}${diff.d}D ${diff.s}S ${diff.o}Ö`;

    const foodCount = flatInv
      .filter(row => {
        const entry = getEntry(row.name);
        return (entry.taggar?.typ || []).some(t => t.toLowerCase() === 'mat');
      })
      .reduce((sum, row) => sum + (row.qty || 0), 0);

    const moneyRow = moneyWeight
      ? `            <div class="cap-row"><span class="label">Myntvikt:</span><span class="value">${formatWeight(moneyWeight)}</span></div>`
      : '';

    /* ---------- kort för formaliteter (pengar & bärkapacitet) ---------- */
    const formalKey = '__formal__';
    const vehicleBtns = vehicles
      .map(v => `<button id="vehicleBtn-${v.entry.id}" class="char-btn icon" title="Lasta i ${v.entry.namn}">${VEHICLE_EMOJI[v.entry.namn] || '🛞'}</button>`)
      .join('');
    const formalCard = `
      <li class="card${openKeys.has(formalKey) ? '' : ' compact'}" data-special="${formalKey}">
        <div class="card-title"><span><span class="collapse-btn"></span>Formaliteter 🔎</span></div>
        <div class="card-desc">
          <div class="inv-buttons">
            <button id="addCustomBtn" class="char-btn icon" title="Nytt föremål">🆕</button>
            <button id="manageMoneyBtn" class="char-btn icon" title="Hantera pengar">💰</button>
            <button id="multiPriceBtn" class="char-btn icon" title="Multiplicera pris">💸</button>
            <button id="squareBtn" class="char-btn icon" title="x²">x²</button>
            ${vehicleBtns}
            <button id="clearInvBtn" class="char-btn icon danger" title="Rensa inventarie">🧹</button>
          </div>
          <div class="formal-section">
            <div class="formal-title">Pengar
              <div class="money-control">
                <button data-act="moneyMinus" class="char-btn icon">&minus;</button>
                <button data-act="moneyPlus" class="char-btn icon">+</button>
              </div>
            </div>
            <div class="money-line"><span class="label">Kontant:</span><span class="value">${cash.daler}D ${cash.skilling}S ${cash['örtegar']}Ö</span></div>
            <div class="money-line"><span class="label">Oanvänt:</span><span class="value" id="unusedOut">0D 0S 0Ö</span></div>
${moneyRow}
          </div>
          <div class="formal-section ${remainingCap < 0 ? 'cap-neg' : ''}">
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
          const entry   = getEntry(row.name);
          const tagger  = entry.taggar ?? {};
          const tagTyp  = tagger.typ ?? [];
          const isVehicle = tagTyp.includes('F\u00e4rdmedel');
          const baseWeight = row.vikt ?? entry.vikt ?? entry.stat?.vikt ?? 0;
          const rowWeight = calcRowWeight(row);
          const loadWeight = rowWeight - baseWeight * row.qty;
          const capacity = isVehicle ? (entry.stat?.b\u00e4rkapacitet || 0) : 0;
          const remaining = capacity - loadWeight;

          const freeCnt = Number(row.gratis || 0);
          const rowLevel = row.nivå ||
            ([ 'Elixir','L\u00e4gre Artefakt','F\u00e4lla' ].some(t => tagTyp.includes(t))
              ? Object.keys(entry.nivåer || {}).find(l => l)
              : null);
          const dataLevel = rowLevel ? ` data-level="${rowLevel}"` : '';

          /* — beskrivning / taggar / nivå — */
          // Ingen beskrivningstext ska visas i inventariet.
          // "desc" används fortfarande för taggar, nivå och kvaliteter nedan.
          let desc = '';
          const tagList = (tagger.typ || [])
            .concat(explodeTags(tagger.ark_trad), tagger.test || [])
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
          if (tagList.length) {
            desc += `<div class="tags">${tagList.join(' ')}</div>`;
          }
          desc += itemStatHtml(entry, row);
          if (row.trait) {
            desc += `<br><strong>Karakt\u00e4rsdrag:</strong> ${row.trait}`;
          }

          /* — kvaliteter — */
          const removedQ = row.removedKval ?? [];
          const baseQuals = [
            ...(tagger.kvalitet ?? []),
            ...splitQuals(entry.kvalitet)
          ];
          const baseQ = baseQuals.filter(q => !removedQ.includes(q));
          const addQ  = row.kvaliteter ?? [];
          const freeQ = (row.gratisKval ?? []).filter(q => !isNegativeQual(q) && !isNeutralQual(q));
          const all = sortQualsForDisplay([
            ...baseQ.map(q => ({q, base:true})),
            ...addQ.map(q => ({q, base:false}))
          ]);
          if (all.length) {
            const qhtml = all.map(obj => {
              const q = obj.q;
              const cls = `tag removable${isMysticQual(q)?' mystic':''}${isNegativeQual(q)?' negative':''}${isNeutralQual(q)?' neutral':''}${freeQ.includes(q)?' free':''}`;
              const baseAttr = obj.base ? ' data-base="1"' : '';
              return `<span class="${cls}" data-qual="${q}"${baseAttr}>${q} ✕</span>`;
            }).join('');
            desc += `<br>Kvalitet:<div class="tags">${qhtml}</div>`;
          }

          const isArtifact = tagTyp.includes('Artefakter');
          const effectVal = row.artifactEffect || entry.artifactEffect || '';
          if (isArtifact && effectVal) {
            const txt = effectVal === 'corruption'
              ? '+1 permanent korruption'
              : '\u20131 erfarenhet';
            desc += `<br><span class="tag">${txt}</span>`;
          }

          /* — knappar — */
          const isGear = ['Vapen', 'Sköld', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakter', 'Färdmedel'].some(t => tagTyp.includes(t));
          const allowQual = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakter'].some(t => tagTyp.includes(t));
 const btnRow = isGear
  ? `<button data-act="del" class="char-btn danger">🗑</button>`
  : `<button data-act="del" class="char-btn danger">🗑</button>
      <button data-act="sub" class="char-btn">–</button>
      <button data-act="add" class="char-btn">+</button>`;
          const freeBtn = `<button data-act="free" class="char-btn${freeCnt? ' danger':''}">🆓</button>`;
          const freeQBtn = allowQual ? `<button data-act="freeQual" class="char-btn">☭</button>` : '';
          const toggleBtn = isArtifact ? `<button data-act="toggleEffect" class="char-btn">↔</button>` : '';
          const badge = row.qty > 1 ? ` <span class="count-badge">×${row.qty}</span>` : '';

          // rowLevel och dataLevel beräknades tidigare
          const priceText = formatMoney(
            calcRowCost(row, forgeLvl, alcLevel, artLevel)
          );
          const weightText = formatWeight(rowWeight);
          const key = `${row.name}|${row.trait || ''}|${rowLevel || ''}`;
          let vehicleInfo = '';
          let cardClass = '';
          if (isVehicle) {
            vehicleInfo = `<br>B\u00e4rkapacitet: ${formatWeight(capacity)}<br>\u00c5terst\u00e5ende: ${formatWeight(remaining)}`;
            if (remaining < 0) cardClass = ' vehicle-over';
          }

          const sublist = (row.contains && row.contains.length)
            ? `<ul class="card-list vehicle-items">${row.contains.map((c,j)=>{
                const cPrice = formatMoney(calcRowCost(c, forgeLvl, alcLevel, artLevel));
                const cWeight = formatWeight(calcRowWeight(c));
                const cBadge = c.qty > 1 ? ` <span class="count-badge">×${c.qty}</span>` : '';
                return `<li class="card" data-parent="${realIdx}" data-child="${j}" data-name="${c.name}">
                  <div class="card-title"><span><span class="collapse-btn"></span>${c.name}${cBadge}</span></div>
                  <div class="card-desc">Pris: ${cPrice}<br>Vikt: ${cWeight}</div>
                  <div class="inv-controls"><button data-act="vehicleRemove" class="char-btn">⬆️</button></div>
                </li>`;}).join('')}</ul>`
            : '';

          return `
            <li class="card${cardClass}${openKeys.has(key) ? '' : ' compact'}"
                data-idx="${realIdx}"
                data-name="${row.name}"${row.trait?` data-trait="${row.trait}"`:''}${dataLevel}>
              <div class="card-title"><span><span class="collapse-btn"></span>${nameMap.get(row)}${badge}</span></div>
              <div class="card-desc">
                ${desc}<br>Antal: ${row.qty}<br>Pris: ${priceText}<br>Vikt: ${weightText}${vehicleInfo}
              </div>
              <div class="inv-controls">
                ${btnRow}
                ${allowQual ? `<button data-act="addQual" class="char-btn">🔨</button>` : ''}
                ${freeQBtn}
                ${toggleBtn}
                ${freeBtn}
              </div>
              ${sublist}
            </li>`;
      }).join('')
    : '<li class="card">Inga föremål.</li>';

    /* ---------- skriv ut ---------- */
    dom.invList.innerHTML       = formalCard + itemCards;
    if (dom.wtOut) dom.wtOut.textContent = formatWeight(usedWeight);
    if (dom.slOut) dom.slOut.textContent = formatWeight(maxCapacity);
    dom.invBadge.textContent    = allInv.reduce((s, r) => s + r.qty, 0);
    dom.unusedOut = $T('unusedOut');
    if (dom.unusedOut) dom.unusedOut.textContent = diffText;
    if (dom.collapseAllBtn) updateCollapseBtnState();
    bindInv();
    bindMoney();
  }

  function updateCollapseBtnState() {
    if (!dom.collapseAllBtn || !dom.invList) return;
    const cards = [...dom.invList.querySelectorAll('li.card')];
    const anyOpen = cards.some(li => !li.classList.contains('compact'));
    dom.collapseAllBtn.textContent = anyOpen ? '▶' : '▼';
    dom.collapseAllBtn.title = anyOpen ? 'Kollapsa alla' : 'Öppna alla';
  }

  function bindInv() {
    if (dom.invTypeSel) {
      dom.invTypeSel.onchange = () => {
        F.typ = dom.invTypeSel.value;
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
        storeHelper.setCustomEntries(store, list);
        const inv = storeHelper.getInventory(store);
        inv.push({ name: entry.namn, qty:1, gratis:0, gratisKval:[], removedKval:[], artifactEffect: entry.artifactEffect });
        saveInventory(inv);
        renderInventory();
        if (window.indexViewRefreshFilters) window.indexViewRefreshFilters();
        if (window.indexViewUpdate) window.indexViewUpdate();
      });
    };
    if (dom.collapseAllBtn) {
      dom.collapseAllBtn.onclick = () => {
        const cards = [...dom.invList.querySelectorAll('li.card')];
        const anyOpen = cards.some(li => !li.classList.contains('compact'));
        cards.forEach(li => li.classList.toggle('compact', anyOpen));
        updateCollapseBtnState();
      };
    }
    dom.invList.onclick = e => {
      // 1) Klick på kryss för att ta bort en enskild kvalitet eller gratisstatus
      const removeTagBtn = e.target.closest('.tag.removable');
      if (removeTagBtn) {
        const li   = removeTagBtn.closest('li');
        const realIdx  = Number(li.dataset.idx);
        const inv  = storeHelper.getInventory(store);
        if (removeTagBtn.dataset.free) {
          const row = inv[realIdx];
          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          const pg = row.perkGratis || 0;
          if (perkActive && row.perk === 'Välutrustad' && pg > 0) {
            if (!confirm('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?')) return;
          }
          row.gratis = 0;
          if (pg > 0) row.perkGratis = 0;
        } else if (removeTagBtn.dataset.qual) {
          const q    = removeTagBtn.dataset.qual;
          if (removeTagBtn.classList.contains('free')) {
            inv[realIdx].gratisKval = (inv[realIdx].gratisKval || []).filter(x => x !== q);
          } else {
            const isBase = removeTagBtn.dataset.base === '1';
            if (isBase) {
              inv[realIdx].removedKval = inv[realIdx].removedKval || [];
              if (!inv[realIdx].removedKval.includes(q)) inv[realIdx].removedKval.push(q);
            } else if (inv[realIdx]?.kvaliteter) {
              inv[realIdx].kvaliteter = inv[realIdx].kvaliteter.filter(x => x !== q);
            }
            if (inv[realIdx].gratisKval) {
              inv[realIdx].gratisKval = inv[realIdx].gratisKval.filter(x => x !== q);
            }
          }
        } else if (removeTagBtn.dataset.mult) {
          delete inv[realIdx].priceMult;
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

      // 3) Klick på knapp i inventarielistan
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;

        const act = btn.dataset.act;
        if (act === 'vehicleRemove') {
          const parent = Number(btn.closest('li').dataset.parent);
          const child = Number(btn.closest('li').dataset.child);
          const inv = storeHelper.getInventory(store);
          if (!Number.isNaN(parent) && !Number.isNaN(child)) {
            const [moved] = (inv[parent].contains || []).splice(child, 1);
            if (moved) inv.push(moved);
            saveInventory(inv);
            renderInventory();
          }
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
        const li  = btn.closest('li');
        const realIdx = Number(li.dataset.idx);
        const inv = storeHelper.getInventory(store);

      // 3a) Röd soptunna tar bort hela posten
      if (act === 'del') {
        if (realIdx >= 0) {
          const row = inv[realIdx];
          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          const pg = row.perkGratis || 0;
          if (perkActive && row.perk === 'Välutrustad' && pg > 0) {
            if (!confirm('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?')) return;
          }
          inv.splice(realIdx, 1);
          saveInventory(inv);
          renderInventory();
        }
        return;
      }

      // 3b) För + / - / 🔨 behöver vi id
      const itemName = li.dataset.name;
      const entry    = getEntry(itemName);

        // "+" lägger till qty eller en ny instans
        if (act === 'add') {
          if (entry.namn === 'Fältutrustning') {
            const bundle = ['Flinta och stål','Kokkärl','Rep, 10 meter','Sovfäll','Tändved','Vattenskinn'];
            bundle.forEach(namn => {
              const ent = getEntry(namn);
              if (!ent.namn) return;
              const indivItem = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakter','Färdmedel'].some(t => ent.taggar.typ.includes(t));
              const existing = inv.findIndex(r => r.name === ent.namn);
              if (indivItem || existing === -1) {
                inv.push({ name: ent.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] });
              } else {
                inv[existing].qty++;
              }
            });
            saveInventory(inv);
            renderInventory();
          } else {
            const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakter','Färdmedel'].some(t => entry.taggar.typ.includes(t));
            const addRow = trait => {
              const obj = { name: entry.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
              if (trait) obj.trait = trait;
              if (indiv) {
                inv.push(obj);
              } else if (realIdx >= 0 && (!trait || inv[realIdx].trait === trait)) {
                inv[realIdx].qty++;
              } else if (realIdx >= 0 && trait && inv[realIdx].trait !== trait) {
                inv.push(obj);
              } else {
                inv.push(obj);
              }
              saveInventory(inv);
              renderInventory();
            };
            if (entry.traits && window.maskSkill) {
              const used = inv.filter(it => it.name===entry.namn).map(it=>it.trait).filter(Boolean);
              maskSkill.pickTrait(used, trait => {
                if(!trait) return;
                if (used.includes(trait) && !confirm('Samma karakt\u00e4rsdrag finns redan. L\u00e4gga till \u00e4nd\u00e5?')) return;
                addRow(trait);
              });
            } else {
              addRow();
            }
          }
          return;
        }
      // "–" minskar qty eller tar bort posten
      if (act === 'sub') {
        if (realIdx >= 0) {
          const row = inv[realIdx];
          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          const pg = row.perkGratis || 0;
          const removingPerkItem = (row.qty - 1) < pg;
          if (perkActive && row.perk === 'Välutrustad' && removingPerkItem) {
            if (!confirm('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?')) return;
          }
          if (row.qty > 1) {
            row.qty--;
            if (row.gratis > row.qty) row.gratis = row.qty;
            if (removingPerkItem && pg > 0) row.perkGratis = pg - 1;
          } else {
            inv.splice(realIdx, 1);
          }
          saveInventory(inv);
          renderInventory();
        }
        return;
      }

      // "🔨" öppnar popup för att lägga kvalitet
      if (act === 'addQual') {
        const tagTyp = (entry.taggar?.typ || []);
        if (!['Vapen','Sköld','Pil/Lod','Rustning','Artefakter'].some(t => tagTyp.includes(t))) return;
        const qualities = DB.filter(isQual);
        openQualPopup(qualities, qIdx => {
          if (realIdx >= 0 && qualities[qIdx]) {
            inv[realIdx].kvaliteter = inv[realIdx].kvaliteter || [];
            const qn = qualities[qIdx].namn;
            const removed = inv[realIdx].removedKval ?? [];
            const baseQuals = [
              ...(entry.taggar?.kvalitet ?? []),
              ...splitQuals(entry.kvalitet)
            ];
            const baseQ = baseQuals.filter(q => !removed.includes(q));
            const existing = [...baseQ, ...inv[realIdx].kvaliteter];
            if (!existing.includes(qn)) {
              inv[realIdx].kvaliteter.push(qn);
              saveInventory(inv);
              renderInventory();
            }
          }
        });
        return;
      }

      // "freeQual" markerar äldsta icke-gratis kvalitet som gratis
      if (act === 'freeQual') {
        const removed = inv[realIdx].removedKval ?? [];
        const baseQuals = [
          ...(entry.taggar?.kvalitet ?? []),
          ...splitQuals(entry.kvalitet)
        ];
        const baseQ = baseQuals.filter(q => !removed.includes(q));
        const allQ = [...baseQ, ...(inv[realIdx].kvaliteter ?? [])];
        if (!allQ.length) return;
        inv[realIdx].gratisKval = (inv[realIdx].gratisKval || []).filter(q => !isNegativeQual(q) && !isNeutralQual(q));
        const qName = allQ.find(q => !inv[realIdx].gratisKval.includes(q) && !isNegativeQual(q) && !isNeutralQual(q));
        if (!qName) return;                  // alla redan gratis eller ej giltiga
        inv[realIdx].gratisKval.push(qName);
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "toggleEffect" växlar artefaktens effekt
      if (act === 'toggleEffect') {
        const eff = inv[realIdx].artifactEffect || entry.artifactEffect || 'corruption';
        inv[realIdx].artifactEffect = eff === 'corruption' ? 'xp' : 'corruption';
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "free" ökar gratis-räknaren (loopar när den nått max)
      if (act === 'free') {
        if (realIdx >= 0) {
          const row = inv[realIdx];
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
            if (!confirm('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?')) {
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

    const getDragAfterElement = (container, y) => {
      const els = [...container.querySelectorAll('li[data-idx]:not(.dragging)')];
      return els.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    };

      dom.invList.addEventListener('pointerdown', e => {
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
      });
  }

  function bindMoney() {
    const manageBtn = $T('manageMoneyBtn');
    const multiBtn  = $T('multiPriceBtn');
    const resetBtn  = $T('moneyResetBtn');
    const clearBtn  = $T('clearInvBtn');
    if (!manageBtn || !multiBtn || !resetBtn || !clearBtn) return;

    manageBtn.onclick = openMoneyPopup;
    multiBtn.onclick  = openPricePopup;
    resetBtn.onclick = () => {
      storeHelper.setMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
      renderInventory();
    };
    clearBtn.onclick = () => {
      if (confirm('Du håller på att tömma hela inventariet, är du säker?')) {
        saveInventory([]);
        renderInventory();
      }
    };

    const inv = storeHelper.getInventory(store);
    inv
      .map(row => ({row, entry:getEntry(row.name)}))
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
    calcEntryCost,
    makeNameMap,
    filter: F,
    sortQualsForDisplay,
    openQualPopup,
    openCustomPopup,
    openMoneyPopup,
    openQtyPopup,
    openPricePopup,
    openVehiclePopup,
    recalcArtifactEffects,
    addWellEquippedItems,
    removeWellEquippedItems,
    renderInventory,
    bindInv,
    bindMoney
  };
})(window);
