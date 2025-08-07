/* ===========================================================
   inventory-utils.js – helper functions for inventory handling
   =========================================================== */

(function(window){
  const F = { typ: '' };
  const LEVEL_IDX = { '':0, Novis:1, 'Ges\u00e4ll':2, 'M\u00e4stare':3 };
  const moneyToO = m => (m.daler||0)*SBASE*OBASE + (m.skilling||0)*OBASE + (m['örtegar']||0);

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
    inv.sort(sortInvEntry);
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

  function recalcArtifactEffects() {
    const inv = storeHelper.getInventory(store);
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

  function sortAllInventories() {
    Object.keys(store.data || {}).forEach(id => {
      const arr = store.data[id]?.inventory;
      if (Array.isArray(arr)) arr.sort(sortInvEntry);
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

    /* bygg knappar: stöd både namn och name */
    box.innerHTML = list.map((item,i)=>{
      const label = item.namn || item.name;
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
      desc.value = '';
      if (effSel) effSel.value = 'corruption';
      if (effBox) effBox.style.display = 'none';
      type.removeEventListener('change', onType);
    };
    const onAdd = () => {
      const entry = {
        namn: name.value.trim(),
        taggar: { typ: [type.value] },
        grundpris: {
          daler: Number(dIn.value)||0,
          skilling: Number(sIn.value)||0,
          'örtegar': Number(oIn.value)||0
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
    const free = Math.min(Number(row.gratis || 0), row.qty);
    const totalO = price * row.qty - base * free;
    return oToMoney(totalO);
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
    return oToMoney(price);
  }

  function renderInventory () {
    if (!dom.invList) return;                        // index-sidan saknar listan
    const allInv = storeHelper.getInventory(store);
    recalcArtifactEffects();
    if (window.updateXP) updateXP();
    const cash = storeHelper.normalizeMoney(storeHelper.getTotalMoney(store));

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
      })
      .sort(sortInvEntry);

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

    const tot = allInv.reduce((t, row) => {
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
      const totalO = price * row.qty - base * free;
      const m = oToMoney(totalO);
      t.d += m.d; t.s += m.s; t.o += m.o;
      return t;
    }, { d: 0, s: 0, o: 0 });

    tot.s += Math.floor(tot.o / OBASE); tot.o %= OBASE;
    tot.d += Math.floor(tot.s / SBASE); tot.s %= SBASE;

    const diffO = moneyToO(cash) - (tot.d * SBASE * OBASE + tot.s * OBASE + tot.o);
    const diff  = oToMoney(Math.abs(diffO));
    const diffText = `${diffO < 0 ? '-' : ''}${diff.d}D ${diff.s}S ${diff.o}Ö`;

    /* ---------- kort för pengar ---------- */
    const moneyCard = `
      <li class="card">
        <div class="card-title">Pengar</div>
        <div class="card-desc">
          Kontant: ${cash.daler}D ${cash.skilling}S ${cash['örtegar']}Ö
          <br>Kostnad: ${tot.d}D ${tot.s}S ${tot.o}Ö
          <br>Oanvänt: <span id="unusedOut">0D 0S 0Ö</span>
        </div>
      </li>`;

    /* ---------- kort för varje föremål ---------- */
    const itemCards = inv.length
      ? inv.map((row, idx) => {
          const entry   = getEntry(row.name);
          const tagger  = entry.taggar ?? {};
          const tagTyp  = tagger.typ ?? [];

          /* — beskrivning / taggar / nivå — */
          // Ingen beskrivningstext ska visas i inventariet.
          // "desc" används fortfarande för taggar, nivå och kvaliteter nedan.
          let desc = '';
          const tags = (tagger.typ || [])
            .concat(explodeTags(tagger.ark_trad), tagger.test || []);
          if (tags.length) {
            const html = tags.map(t => `<span class="tag">${t}</span>`).join(' ');
            desc += `<div class="tags">${html}</div>`;
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
          const isGear = ['Vapen', 'Sköld', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakter'].some(t => tagTyp.includes(t));
          const allowQual = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakter'].some(t => tagTyp.includes(t));
 const btnRow = isGear
  ? `<button data-act="del" class="char-btn danger">🗑</button>`
  : `<button data-act="del" class="char-btn danger">🗑</button>
      <button data-act="sub" class="char-btn">–</button>
      <button data-act="add" class="char-btn">+</button>`;
          const freeCnt = Number(row.gratis || 0);
          const freeBtn = `<button data-act="free" class="char-btn${freeCnt? ' danger':''}">🆓</button>`;
          const freeQBtn = allowQual ? `<button data-act="freeQual" class="char-btn">☭</button>` : '';
          const toggleBtn = isArtifact ? `<button data-act="toggleEffect" class="char-btn">↔</button>` : '';

          const rowLevel = row.nivå ||
            (['Elixir','L\u00e4gre Artefakt','F\u00e4lla'].some(t => tagTyp.includes(t))
              ? Object.keys(entry.nivåer || {}).find(l => l)
              : null);
          const lvlInfo = rowLevel ? ` <span class="tag level">${rowLevel}</span>` : '';
          const dataLevel = rowLevel ? ` data-level="${rowLevel}"` : '';
          const priceText = formatMoney(
            calcRowCost(row, forgeLvl, alcLevel, artLevel)
          );

          return `
            <li class="card"
                data-idx="${idx}"
                data-name="${row.name}"${row.trait?` data-trait="${row.trait}"`:''}${dataLevel}>
              <div class="card-title">${row.name}</div>
              <div class="card-desc">
                ${desc}${freeCnt ? ` <span class="tag free">Gratis${freeCnt>1? '×'+freeCnt:''}</span>` : ''}${lvlInfo}<br>Antal: ${row.qty}<br>Pris: ${priceText}
              </div>
              <div class="inv-controls">
                ${btnRow}
 ${allowQual ? `<button data-act="addQual" class="char-btn">🔨</button>` : ''}
                ${freeQBtn}
                ${toggleBtn}
                ${freeBtn}
              </div>
            </li>`;
      }).join('')
    : '<li class="card">Inga föremål.</li>';

    /* ---------- skriv ut ---------- */
    dom.invList.innerHTML       = moneyCard + itemCards;
    if (dom.wtOut) dom.wtOut.textContent = allInv.reduce((s, r) => s + (r.vikt || 0) * r.qty, 0);
    if (dom.slOut) dom.slOut.textContent = allInv.reduce((s, r) => s + r.qty, 0);
    dom.invBadge.textContent    = allInv.reduce((s, r) => s + r.qty, 0);
    dom.unusedOut = $T('unusedOut');
    if (dom.unusedOut) dom.unusedOut.textContent = diffText;
  }

  function bindInv() {
    if (dom.invTypeSel) {
      dom.invTypeSel.addEventListener('change', () => {
        F.typ = dom.invTypeSel.value;
        renderInventory();
      });
    }
    const customBtn = $T('addCustomBtn');
    if (customBtn) customBtn.addEventListener('click', () => {
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
    });
    dom.invList.addEventListener('click', e => {
      // 1) Klick på kryss för att ta bort en enskild kvalitet
      const removeTagBtn = e.target.closest('.tag.removable[data-qual]');
      if (removeTagBtn) {
        const li   = removeTagBtn.closest('li');
        const idx  = Number(li.dataset.idx);
        const q    = removeTagBtn.dataset.qual;
        const inv  = storeHelper.getInventory(store);
        const isBase = removeTagBtn.dataset.base === '1';
        if (isBase) {
          inv[idx].removedKval = inv[idx].removedKval || [];
          if (!inv[idx].removedKval.includes(q)) inv[idx].removedKval.push(q);
          if (inv[idx].gratisKval) {
            inv[idx].gratisKval = inv[idx].gratisKval.filter(x => x !== q);
          }
        } else if (inv[idx]?.kvaliteter) {
          inv[idx].kvaliteter = inv[idx].kvaliteter.filter(x => x !== q);
          if (inv[idx].gratisKval) {
            inv[idx].gratisKval = inv[idx].gratisKval.filter(x => x !== q);
          }
        }
        saveInventory(inv);
        renderInventory();
        return;
      }

      // 2) Klick på knapp i inventarielistan
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;

      const act = btn.dataset.act;
      const li  = btn.closest('li');
      const idx = Number(li.dataset.idx);
      const inv = storeHelper.getInventory(store);

      // 2a) Röd soptunna tar bort hela posten
      if (act === 'del') {
        if (idx >= 0) {
          const row = inv[idx];
          const perkActive = storeHelper.getCurrentList(store)
            .some(x => x.namn === 'Välutrustad');
          const pg = row.perkGratis || 0;
          if (perkActive && row.perk === 'Välutrustad' && pg > 0) {
            if (!confirm('Utrustningen kommer från fördelen “Välutrustad”. Ta bort ändå?')) return;
          }
          inv.splice(idx, 1);
          saveInventory(inv);
          renderInventory();
        }
        return;
      }

      // 2b) För + / - / 🔨 behöver vi id
      const itemName = li.dataset.name;
      const entry    = getEntry(itemName);

        // "+" lägger till qty eller en ny instans
        if (act === 'add') {
          if (entry.namn === 'Fältutrustning') {
            const bundle = ['Flinta och stål','Kokkärl','Rep, 10 meter','Sovfäll','Tändved','Vattenskinn'];
            bundle.forEach(namn => {
              const ent = getEntry(namn);
              if (!ent.namn) return;
              const indivItem = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakter'].some(t => ent.taggar.typ.includes(t));
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
            const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakter'].some(t => entry.taggar.typ.includes(t));
            const addRow = trait => {
              const obj = { name: entry.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] };
              if (trait) obj.trait = trait;
              if (indiv) {
                inv.push(obj);
              } else if (idx >= 0 && (!trait || inv[idx].trait === trait)) {
                inv[idx].qty++;
              } else if (idx >= 0 && trait && inv[idx].trait !== trait) {
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
        if (idx >= 0) {
          const row = inv[idx];
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
            inv.splice(idx, 1);
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
          if (idx >= 0 && qualities[qIdx]) {
            inv[idx].kvaliteter = inv[idx].kvaliteter || [];
            const qn = qualities[qIdx].namn;
            const removed = inv[idx].removedKval ?? [];
            const baseQuals = [
              ...(entry.taggar?.kvalitet ?? []),
              ...splitQuals(entry.kvalitet)
            ];
            const baseQ = baseQuals.filter(q => !removed.includes(q));
            const existing = [...baseQ, ...inv[idx].kvaliteter];
            if (!existing.includes(qn)) {
              inv[idx].kvaliteter.push(qn);
              saveInventory(inv);
              renderInventory();
            }
          }
        });
        return;
      }

      // "freeQual" markerar äldsta icke-gratis kvalitet som gratis
      if (act === 'freeQual') {
        const removed = inv[idx].removedKval ?? [];
        const baseQuals = [
          ...(entry.taggar?.kvalitet ?? []),
          ...splitQuals(entry.kvalitet)
        ];
        const baseQ = baseQuals.filter(q => !removed.includes(q));
        const allQ = [...baseQ, ...(inv[idx].kvaliteter ?? [])];
        if (!allQ.length) return;
        inv[idx].gratisKval = (inv[idx].gratisKval || []).filter(q => !isNegativeQual(q) && !isNeutralQual(q));
        const qName = allQ.find(q => !inv[idx].gratisKval.includes(q) && !isNegativeQual(q) && !isNeutralQual(q));
        if (!qName) return;                  // alla redan gratis eller ej giltiga
        inv[idx].gratisKval.push(qName);
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "toggleEffect" växlar artefaktens effekt
      if (act === 'toggleEffect') {
        const eff = inv[idx].artifactEffect || entry.artifactEffect || 'corruption';
        inv[idx].artifactEffect = eff === 'corruption' ? 'xp' : 'corruption';
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "free" ökar gratis-räknaren (loopar när den nått max)
      if (act === 'free') {
        if (idx >= 0) {
          const row = inv[idx];
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
    });
  }

  function bindMoney() {
    if (!dom.manageMoneyBtn || !dom.moneyResetBtn || !dom.clearInvBtn) return;

    dom.manageMoneyBtn.addEventListener('click', openMoneyPopup);
    dom.moneyResetBtn.addEventListener('click', () => {
      storeHelper.setMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
      renderInventory();
    });
    if (dom.clearInvBtn) dom.clearInvBtn.addEventListener('click', () => {
      saveInventory([]);
      renderInventory();
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
    filter: F,
    sortQualsForDisplay,
    openQualPopup,
    openCustomPopup,
    openMoneyPopup,
    recalcArtifactEffects,
    addWellEquippedItems,
    removeWellEquippedItems,
    renderInventory,
    bindInv,
    bindMoney
  };
})(window);
