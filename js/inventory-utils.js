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

    type.innerHTML = EQUIP.map(t=>`<option>${t}</option>`).join('');

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

  function calcRowCost(row, hasForge, alcLevel, hasArtefacter) {
    const entry  = getEntry(row.name);
    const tagger = entry.taggar ?? {};
    const tagTyp = tagger.typ ?? [];
    let base = moneyToO(entry.grundpris || {});
    const forgeable = ['Vapen','Rustning'].some(t => tagTyp.includes(t));
    if (hasForge && forgeable) base = Math.floor(base / 2);
    if (tagTyp.includes('Elixir')) {
      const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) base = Math.floor(base / 2);
    }
    if (tagTyp.includes('L\u00e4gre Artefakt') && hasArtefacter) base = Math.floor(base / 2);
    let price = base;
    const baseQuals = [
      ...(tagger.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
    const removedQ = row.removedKval ?? [];
    const allQuals = [
      ...baseQuals.filter(q => !removedQ.includes(q)),
      ...(row.kvaliteter || [])
    ];
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

    const hasForge = storeHelper.getPartySmith(store) ||
      storeHelper.getCurrentList(store).some(x => x.namn === 'Smideskonst');
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const hasArtefacter = storeHelper.getPartyArtefacter(store) ||
      storeHelper.getCurrentList(store).some(x => x.namn === 'Artefaktmakande');

    const forgeable = ['Vapen','Rustning'].some(t => tagTyp.includes(t));
    if (hasForge && forgeable) price = Math.floor(price / 2);
    if (tagTyp.includes('Elixir')) {
      const lvlName = Object.keys(entry.nivåer || {}).find(l=>l) || '';
      const req = LEVEL_IDX[lvlName] || 0;
      if (alcLevel >= req) price = Math.floor(price / 2);
    }
    if (tagTyp.includes('L\u00e4gre Artefakt') && hasArtefacter) price = Math.floor(price / 2);

    const baseQuals = [
      ...(tagger.kvalitet ?? []),
      ...splitQuals(entry.kvalitet)
    ];
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
    const cash = storeHelper.normalizeMoney(storeHelper.getMoney(store));

    if (dom.invTypeSel) {
      const types = new Set();
      allInv.forEach(row => {
        const entry = getEntry(row.name);
        (entry.taggar?.typ || []).forEach(t => types.add(t));
      });
      dom.invTypeSel.innerHTML =
        '<option value="">Kategori (alla)</option>' +
        [...types].sort().map(t =>
          `<option${t===F.typ?' selected':''}>${t}</option>`).join('');
    }

    const inv = allInv
      .filter(row => {
        if (!F.typ) return true;
        const entry = getEntry(row.name);
        return (entry.taggar?.typ || []).includes(F.typ);
      })
      .sort(sortInvEntry);

    /* ---------- summa i pengar ---------- */
    const hasForge = storeHelper.getPartySmith(store) ||
      storeHelper.getCurrentList(store).some(x => x.namn === 'Smideskonst');
    const partyAlc = LEVEL_IDX[storeHelper.getPartyAlchemist(store) || ''] || 0;
    const skillAlc = storeHelper.abilityLevel(
      storeHelper.getCurrentList(store), 'Alkemist');
    const alcLevel = Math.max(partyAlc, skillAlc);
    const hasArtefacter = storeHelper.getPartyArtefacter(store) ||
      storeHelper.getCurrentList(store).some(x => x.namn === 'Artefaktmakande');

    const tot = allInv.reduce((t, row) => {
      const entry = getEntry(row.name);
      const basePrice = moneyToO(entry.grundpris || {});
      let base  = basePrice;
      const tagTyp = entry.taggar?.typ || [];
      const forgeable = ['Vapen','Rustning'].some(t => tagTyp.includes(t));
      if (hasForge && forgeable) base = Math.floor(base / 2);
      const isElixir = (entry.taggar?.typ || []).includes('Elixir');
      if (isElixir) {
        const lvlName = row.nivå || Object.keys(entry.nivåer || {}).find(l=>l) || '';
        const req = LEVEL_IDX[lvlName] || 0;
        if (alcLevel >= req) base = Math.floor(base / 2);
      }
      const isArtifact = (entry.taggar?.typ || []).includes('Artefakter');
      if (isArtifact && hasArtefacter) base = Math.floor(base / 2);
      let   price = base;                    // startvärde för kvaliteter

      const baseQuals = [
        ...(entry.taggar?.kvalitet ?? []),
        ...splitQuals(entry.kvalitet)
      ];
      const removedQ = row.removedKval ?? [];
      const allQuals = [
        ...baseQuals.filter(q => !removedQ.includes(q)),
        ...(row.kvaliteter || [])
      ];

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
          ${cash.daler} daler, ${cash.skilling} skilling, ${cash['örtegar']} örtegar
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
          desc += itemStatHtml(entry);

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
          const isGear = ['Vapen', 'Rustning', 'L\u00e4gre Artefakt', 'Artefakter'].some(t => tagTyp.includes(t));
          const allowQual = ['Vapen','Pil/Lod','Rustning','Artefakter'].some(t => tagTyp.includes(t));
 const btnRow = isGear
  ? `<button data-act="del" class="char-btn danger">🗑</button>`
  : `<button data-act="del" class="char-btn danger">🗑</button>
      <button data-act="sub" class="char-btn">–</button>
      <button data-act="add" class="char-btn">+</button>`;
          const freeCnt = Number(row.gratis || 0);
          const freeBtn = `<button data-act="free" class="char-btn${freeCnt? ' danger':''}">🆓</button>`;
          const freeQBtn = allowQual ? `<button data-act="freeQual" class="char-btn">K🆓</button>` : '';
          const toggleBtn = isArtifact ? `<button data-act="toggleEffect" class="char-btn">↔</button>` : '';

          const rowLevel = row.nivå ||
            (tagTyp.includes('Elixir')
              ? Object.keys(entry.nivåer || {}).find(l => l)
              : null);
          const lvlInfo = rowLevel ? ` <span class="tag level">${rowLevel}</span>` : '';
          const dataLevel = rowLevel ? ` data-level="${rowLevel}"` : '';
          const priceText = formatMoney(
            calcRowCost(row, hasForge, alcLevel, hasArtefacter)
          );

          return `
            <li class="card"
                data-idx="${idx}"
                data-name="${row.name}"${dataLevel}>
              <div class="card-title">${row.name}</div>
              <div class="card-desc">
                ${desc}${freeCnt ? ` <span class="tag free">Gratis${freeCnt>1? '×'+freeCnt:''}</span>` : ''}${lvlInfo}<br>Antal: ${row.qty}<br>Pris: ${priceText}
              </div>
              <div class="inv-controls">
                ${btnRow}
 ${allowQual ? `<button data-act="addQual" class="char-btn">K+</button>` : ''}
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
          inv.splice(idx, 1);
          saveInventory(inv);
          renderInventory();
        }
        return;
      }

      // 2b) För + / - / K+ behöver vi id
      const itemName = li.dataset.name;
      const entry    = getEntry(itemName);

      // "+" lägger till qty eller en ny instans
      if (act === 'add') {
        const indiv = ['Vapen','Rustning','L\u00e4gre Artefakt','Artefakter'].some(t => entry.taggar.typ.includes(t));
        if (indiv) {
          inv.push({ name: entry.namn, qty: 1, gratis:0, gratisKval:[], removedKval:[] });
        } else if (idx >= 0) {
          inv[idx].qty++;
        } else {
          inv.push({ name: entry.namn, qty: 1, gratis:0, gratisKval:[], removedKval:[] });
        }
        saveInventory(inv);
        renderInventory();
        return;
      }

      // "–" minskar qty eller tar bort posten
      if (act === 'sub') {
        if (idx >= 0) {
          if (inv[idx].qty > 1) {
            inv[idx].qty--;
            if (inv[idx].gratis > inv[idx].qty) inv[idx].gratis = inv[idx].qty;
          } else {
            inv.splice(idx, 1);
          }
          saveInventory(inv);
          renderInventory();
        }
        return;
      }

      // "K+" öppnar popup för att lägga kvalitet
      if (act === 'addQual') {
        const tagTyp = (entry.taggar?.typ || []);
        if (!['Vapen','Pil/Lod','Rustning','Artefakter'].some(t => tagTyp.includes(t))) return;
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
          row.gratis = Number(row.gratis || 0) + 1;
          if (row.gratis > row.qty) row.gratis = 0;
          saveInventory(inv);
          renderInventory();
        }
        return;
      }
    });
  }

  function bindMoney() {
    if (!dom.moneyDBtn || !dom.moneySBtn || !dom.moneyOBtn || !dom.moneyResetBtn || !dom.clearInvBtn) return;

    const add = (field, key) => {
      const val = Number(field.value) || 0;
      if (!val) return;
      const cur = storeHelper.getMoney(store);
      cur[key] = (cur[key] || 0) + val;
      const total = storeHelper.normalizeMoney(cur);
      storeHelper.setMoney(store, total);
      field.value = '';
      renderInventory();
    };

    dom.moneyDBtn.addEventListener('click', () => add(dom.moneyD, 'daler'));
    dom.moneySBtn.addEventListener('click', () => add(dom.moneyS, 'skilling'));
    dom.moneyOBtn.addEventListener('click', () => add(dom.moneyO, 'örtegar'));
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
    recalcArtifactEffects,
    renderInventory,
    bindInv,
    bindMoney
  };
})(window);
