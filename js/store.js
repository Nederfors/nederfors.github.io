/* ===========================================================
   js/store.js
   • Ett enda, centralt hjälpbibliotek för data­lagring
   • Hanterar roll­personer, valda förmågor, inventarie
   • XP-beräkning enligt dina regler
   =========================================================== */
(function (global) {
  const STORAGE_KEY = 'rpall';

  /* ---------- 1. Grund­struktur ---------- */
  function emptyStore() {
    return {
      current: '',          // id för vald karaktär
      characters: [],       // [{ id, name }]
      data: {},             // { [charId]: { list: [...], inventory: [], custom: [], artifactEffects:{xp:0,corruption:0} } }
      filterUnion: false,
      compactEntries: false
    };
  }

  /* ---------- 2. Load / Save ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : emptyStore();
      const store = { ...emptyStore(), ...parsed };
      if (store.data && typeof store.data === 'object') {
        Object.keys(store.data).forEach(id => {
          const cur = store.data[id] || {};
          if (typeof cur.partyAlchemist === 'boolean') {
            cur.partyAlchemist = cur.partyAlchemist ? 'Mästare' : '';
          }
          if (typeof cur.partySmith === 'boolean') {
            cur.partySmith = cur.partySmith ? 'Mästare' : '';
          }
          if (typeof cur.partyArtefacter === 'boolean') {
            cur.partyArtefacter = cur.partyArtefacter ? 'Mästare' : '';
          }
          store.data[id] = {
            custom: [],
            artifactEffects: { xp:0, corruption:0 },
            bonusMoney: defaultMoney(),
            privMoney: defaultMoney(),
            possessionMoney: defaultMoney(),
            possessionRemoved: 0,
            ...cur
          };
          if(!store.data[id].artifactEffects){
            store.data[id].artifactEffects = { xp:0, corruption:0 };
          }
          if(!store.data[id].bonusMoney){
            store.data[id].bonusMoney = defaultMoney();
          }
          if(!store.data[id].privMoney){
            store.data[id].privMoney = defaultMoney();
          }
          if(!store.data[id].possessionMoney){
            store.data[id].possessionMoney = defaultMoney();
          }
          if(!store.data[id].possessionRemoved){
            store.data[id].possessionRemoved = 0;
          }
        });
      }
      return store;
    } catch {
      return emptyStore();
    }
  }

  function save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  /* ---------- 3. Förmåge­lista per karaktär ---------- */
  function getCurrentList(store) {
    return store.current
      ? (store.data[store.current]?.list || [])
      : [];
  }

  function applyDarkBloodEffects(list) {
    const hasDark = list.some(x => x.namn === 'Mörkt blod');
    const idxBest = list.findIndex(x => x.namn === 'Bestialisk');
    const extra = ['Naturligt vapen', 'Pansar', 'Robust', 'Regeneration', 'Vingar'];

    if (hasDark) {
      if (idxBest < 0) {
        const entry = DB.find(x => x.namn === 'Bestialisk');
        if (entry) list.push({ ...entry });
      }
    } else {
      if (idxBest >= 0) list.splice(idxBest, 1);
      for (let i = list.length - 1; i >= 0; i--) {
        if (extra.includes(list[i].namn)) list.splice(i, 1);
      }
    }
  }

  function applyRaceTraits(list) {
    const races = [];
    const main = list.find(isRas)?.namn || null;
    if (main) races.push(main);
    list.forEach(it => {
      if (it.namn === 'Blodsband' && it.race) races.push(it.race);
    });
    DB.forEach(ent => {
      if (!((ent.taggar?.typ || []).includes('S\u00e4rdrag'))) return;
      const ras = ent.taggar?.ras;
      if (!ras || !Array.isArray(ras)) return;
      if (ent.niv\u00e5er) return;
      const idx = list.findIndex(x => x.namn === ent.namn);
      const allowed = races.some(r => ras.includes(r));
      if (allowed) {
        if (idx < 0) list.push({ ...ent });
      } else if (idx >= 0) {
        list.splice(idx, 1);
      }
    });
  }

  function getDependents(list, entry) {
    if (!entry) return [];
    const name = entry.namn || entry;
    const ent = typeof entry === 'string' ? DB.find(x => x.namn === name) : entry;
    if (!ent) return [];
    const out = [];

    if (isElityrke(ent)) {
      list.forEach(it => {
        if (isEliteSkill(it) && explodeTags(it.taggar?.ark_trad).includes(name)) {
          out.push(it.namn);
        }
      });
    }

    if (name === 'M\u00f6rkt blod') {
      const extras = ['Naturligt vapen','Pansar','Robust','Regeneration','Vingar'];
      list.forEach(it => {
        if (isMonstrousTrait(it) || it.namn === 'Bestialisk' || extras.includes(it.namn)) {
          if (it.namn !== name) out.push(it.namn);
        }
      });
    }

    if (isRas(ent)) {
      const race = name;
      list.forEach(it => {
        const ras = it.taggar?.ras || [];
        if (ras.includes(race)) out.push(it.namn);
      });
    }

    if (name === 'Blodsband' && entry.race) {
      const race = entry.race;
      list.forEach(it => {
        const ras = it.taggar?.ras || [];
        if (ras.includes(race)) out.push(it.namn);
      });
    }

    return Array.from(new Set(out));
  }

  function setCurrentList(store, list) {
    if (!store.current) return;
    applyDarkBloodEffects(list);
    applyRaceTraits(list);
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].list = list;
    const hasPriv = list.some(x => x.namn === 'Privilegierad');
    const hasPos  = list.some(x => x.namn === 'Besittning');

    const priv = store.data[store.current].privMoney || defaultMoney();
    const pos  = store.data[store.current].possessionMoney || defaultMoney();

    const privHas = priv.daler || priv.skilling || priv['örtegar'];
    if (hasPriv && !privHas) {
      store.data[store.current].privMoney = { daler: 50, skilling: 0, 'örtegar': 0 };
    } else if (!hasPriv && privHas) {
      store.data[store.current].privMoney = defaultMoney();
    }

    if (!hasPos && (pos.daler || pos.skilling || pos['örtegar'])) {
      store.data[store.current].possessionMoney = defaultMoney();
    }

    const total = normalizeMoney({
      daler: store.data[store.current].privMoney.daler + store.data[store.current].possessionMoney.daler,
      skilling: store.data[store.current].privMoney.skilling + store.data[store.current].possessionMoney.skilling,
      'örtegar': store.data[store.current].privMoney['örtegar'] + store.data[store.current].possessionMoney['örtegar']
    });
    store.data[store.current].bonusMoney = total;

   save(store);
  }

  /* ---------- 4. Inventarie­funktioner ---------- */
  function getInventory(store) {
    return store.current
      ? (store.data[store.current]?.inventory || [])
      : [];
  }

  function setInventory(store, inv) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].inventory = inv;
    save(store);
  }

  function getCustomEntries(store) {
    return store.current
      ? (store.data[store.current]?.custom || [])
      : [];
  }

  function setCustomEntries(store, list) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].custom = list;
    save(store);
  }

  /* ---------- 5. Pengahantering ---------- */
  function defaultMoney() {
    return { "örtegar": 0, skilling: 0, daler: 0 };
  }

  function defaultArtifactEffects() {
    return { xp: 0, corruption: 0 };
  }

  function getMoney(store) {
    if (!store.current) return defaultMoney();
    const data = store.data[store.current] || {};
    return { ...defaultMoney(), ...(data.money || {}) };
  }

  function setMoney(store, money) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].money = { ...defaultMoney(), ...money };
    save(store);
  }

  function getBonusMoney(store) {
    if (!store.current) return defaultMoney();
    const data = store.data[store.current] || {};
    return { ...defaultMoney(), ...(data.bonusMoney || {}) };
  }

  function setBonusMoney(store, money) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].bonusMoney = { ...defaultMoney(), ...money };
    save(store);
  }

  function getPossessionMoney(store) {
    if (!store.current) return defaultMoney();
    const data = store.data[store.current] || {};
    return { ...defaultMoney(), ...(data.possessionMoney || {}) };
  }

  function setPossessionMoney(store, money) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].possessionMoney = { ...defaultMoney(), ...money };
    const total = normalizeMoney({
      daler: (store.data[store.current].privMoney || {}).daler + (money.daler || 0),
      skilling: (store.data[store.current].privMoney || {}).skilling + (money.skilling || 0),
      'örtegar': (store.data[store.current].privMoney || {})['örtegar'] + (money['örtegar'] || 0)
    });
    store.data[store.current].bonusMoney = total;
    save(store);
  }

  function incrementPossessionRemoved(store) {
    if (!store.current) return 0;
    store.data[store.current] = store.data[store.current] || {};
    const cur = Number(store.data[store.current].possessionRemoved || 0) + 1;
    store.data[store.current].possessionRemoved = cur;
    save(store);
    return cur;
  }

  function resetPossessionRemoved(store) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].possessionRemoved = 0;
    save(store);
  }

  function deleteCharacter(store, charId) {
    if (!charId) return;
    store.characters = store.characters.filter(c => c.id !== charId);
    delete store.data[charId];
    if (store.current === charId) store.current = '';
    save(store);
  }

  function getTotalMoney(store) {
    const base = getMoney(store);
    const bonus = getBonusMoney(store);
    return normalizeMoney({
      daler: base.daler + bonus.daler,
      skilling: base.skilling + bonus.skilling,
      'örtegar': base['örtegar'] + bonus['örtegar']
    });
  }

  function getPartySmith(store) {
    if (!store.current) return '';
    const data = store.data[store.current] || {};
    const val = data.partySmith;
    if (typeof val === 'string') return val;
    return val ? 'Mästare' : '';
  }

  function setPartySmith(store, level) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].partySmith = level || '';
    save(store);
  }

  function getPartyAlchemist(store) {
    if (!store.current) return '';
    const data = store.data[store.current] || {};
    const val = data.partyAlchemist;
    if (typeof val === 'string') return val;
    return val ? 'Mästare' : '';
  }

  function setPartyAlchemist(store, level) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].partyAlchemist = level || '';
    save(store);
  }

  function getPartyArtefacter(store) {
    if (!store.current) return '';
    const data = store.data[store.current] || {};
    const val = data.partyArtefacter;
    if (typeof val === 'string') return val;
    return val ? 'Mästare' : '';
  }

  function setPartyArtefacter(store, level) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].partyArtefacter = level || '';
    save(store);
  }

  function getArtifactEffects(store) {
    if (!store.current) return defaultArtifactEffects();
    const data = store.data[store.current] || {};
    return { ...defaultArtifactEffects(), ...(data.artifactEffects || {}) };
  }

  function setArtifactEffects(store, eff) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].artifactEffects = { ...defaultArtifactEffects(), ...(eff || {}) };
    save(store);
  }

  function getFilterUnion(store) {
    return Boolean(store.filterUnion);
  }

  function setFilterUnion(store, val) {
    store.filterUnion = Boolean(val);
    save(store);
  }

  function getCompactEntries(store) {
    return Boolean(store.compactEntries);
  }

  function setCompactEntries(store, val) {
    store.compactEntries = Boolean(val);
    save(store);
  }

  function normalizeMoney(m) {
    const res = { ...defaultMoney(), ...(m || {}) };
    res.skilling += Math.floor(res["örtegar"] / 10);
    res["örtegar"] %= 10;
    res.daler += Math.floor(res.skilling / 10);
    res.skilling %= 10;
    return res;
  }

  /* ---------- 6a. Karaktärsdrag ---------- */
  const TRAIT_KEYS = [
    'Diskret', 'Kvick', 'Listig', 'Stark',
    'Träffsäker', 'Vaksam', 'Viljestark', 'Övertygande'
  ];

function defaultTraits() {
  const obj = {};
  TRAIT_KEYS.forEach(k => { obj[k] = 10; });   // 8×10 = 80 poäng från start
  return obj;
}


  function getTraits(store) {
    if (!store.current) return defaultTraits();
    const data = store.data[store.current] || {};
    return { ...defaultTraits(), ...(data.traits || {}) };
  }

  function setTraits(store, traits) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].traits = { ...defaultTraits(), ...traits };
    save(store);
  }

  /* ---------- 6. XP-hantering ---------- */
  const XP_LADDER = { Novis: 10, Gesäll: 30, Mästare: 60 };

  function getBaseXP(store) {
    if (!store.current) return 0;
    const data = store.data[store.current] || {};
    return Number(data.baseXp || 0);
  }

  function setBaseXP(store, xp) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].baseXp = Number(xp) || 0;
    save(store);
  }

  const RITUAL_COST = 10;

  const TRAD_TO_SKILL = {
    'Häxkonst': 'Häxkonster',
    'Ordensmagi': 'Ordensmagi',
    'Stavmagiker': 'Stavmagi',
    'Teurgi': 'Teurgi',
    'Trollsång': 'Trollsång',
    'Symbolism': 'Symbolism'
  };

  const LEVEL_IDX = { '': 0, Novis: 1, Gesäll: 2, Mästare: 3 };

  function abilityLevel(list, ability) {
    const ent = list.find(x => x.namn === ability && (x.taggar?.typ || []).includes('Förmåga'));
    return LEVEL_IDX[ent?.nivå || ''] || 0;
  }

  function calcPermanentCorruption(list, extra) {
    let cor = 0;
    list.forEach(it => {
      const types = it.taggar?.typ || [];
      if (!['Mystisk kraft', 'Ritual'].some(t => types.includes(t))) return;
      const trads = explodeTags(it.taggar?.ark_trad);
      let lvl = 0;
      trads.forEach(tr => {
        const a = TRAD_TO_SKILL[tr];
        if (a) lvl = Math.max(lvl, abilityLevel(list, a));
      });
      if (types.includes('Mystisk kraft')) {
        const plvl = LEVEL_IDX[it.nivå || 'Novis'] || 1;
        if (plvl > lvl) cor += (plvl - lvl);
      } else if (types.includes('Ritual')) {
        if (lvl < 1) cor++;
      }
    });
    cor += extra?.corruption || 0;
    return cor;
  }

  function calcUsedXP(list, extra) {
    let xp = 0;

    list.forEach(item => {
      const types = (item.taggar?.typ || []).map(t => t.toLowerCase());

      if (item.nivåer && ['mystisk kraft','förmåga','särdrag','monstruöst särdrag']
          .some(t => types.includes(t))) {
        xp += XP_LADDER[item.nivå || 'Novis'] || 0;
      } else if (types.includes('monstruöst särdrag')) {
        xp += RITUAL_COST;
      }
      if (types.includes('fördel')) xp += 5;
      if (types.includes('ritual')) xp += RITUAL_COST;
    });

    xp += extra?.xp || 0;
    return xp;
  }

  function countDisadvantages(list) {
    const hasDark = list.some(x => x.namn === 'Mörkt blod');
    return list.filter(item => {
      const isDis = (item.taggar?.typ || [])
        .map(t => t.toLowerCase())
        .includes('nackdel');
      if (!isDis) return false;
      if (hasDark && item.namn === 'Bestialisk') return false;
      return true;
    }).length;
  }

  function calcTotalXP(baseXp, list) {
    return Number(baseXp || 0) + countDisadvantages(list) * 5;
  }

  /* ---------- 7. Export / Import av karaktärer ---------- */
  function exportCharacterCode(store, id) {
    const charId = id || store.current;
    if (!charId) return '';
    const char = store.characters.find(c => c.id === charId);
    if (!char) return '';
    const obj = { name: char.name, data: store.data[charId] || {} };
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)));
  }

  function importCharacterCode(store, code) {
    try {
      const json = decodeURIComponent(escape(atob(code)));
      const obj = JSON.parse(json);
      const id = 'rp' + Date.now();
      store.characters.push({ id, name: obj.name || 'Ny rollperson' });
      store.data[id] = obj.data || {};
      store.current = id;
      save(store);
      return id;
    } catch {
      return null;
    }
  }

  /* ---------- 7. Exportera ---------- */
  global.storeHelper = {
    load,
    save,
    getCurrentList,
    setCurrentList,
    getInventory,
    setInventory,
    getCustomEntries,
    setCustomEntries,
    getMoney,
    setMoney,
    getBonusMoney,
    setBonusMoney,
    getTotalMoney,
    getPartySmith,
    setPartySmith,
    getPartyAlchemist,
    setPartyAlchemist,
    getPartyArtefacter,
    setPartyArtefacter,
    getArtifactEffects,
    setArtifactEffects,
    getFilterUnion,
    setFilterUnion,
    getCompactEntries,
    setCompactEntries,
    normalizeMoney,
    getTraits,
    setTraits,
    getBaseXP,
    setBaseXP,
    calcUsedXP,
    calcTotalXP,
    calcPermanentCorruption,
    abilityLevel,
    exportCharacterCode,
    importCharacterCode,
    getPossessionMoney,
    setPossessionMoney,
    incrementPossessionRemoved,
    resetPossessionRemoved,
    deleteCharacter,
    getDependents
  };
})(window);