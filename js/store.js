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
          if(store.data[id].nilasPopupShown === undefined){
            store.data[id].nilasPopupShown = false;
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

  function enforceEarthbound(list) {
    if (list.some(x => x.namn === 'Jordnära')) {
      const idx = list.findIndex(x => x.namn === 'Mörkt förflutet');
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  function applyHamnskifteTraits(list) {
    const hamLvl = abilityLevel(list, 'Hamnskifte');
    const extras = [];
    if (hamLvl >= 2) extras.push('Naturligt vapen', 'Pansar');
    if (hamLvl >= 3) extras.push('Robust', 'Regeneration');
    extras.forEach(name => {
      const idx = list.findIndex(it => it.namn === name && it.form === 'beast');
      if (idx < 0) {
        const entry = DB.find(e => e.namn === name);
        if (entry) list.push({ ...entry, form: 'beast' });
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

    if (name === 'Robust') {
      list.forEach(it => {
        if (it.namn === 'R\u00e5styrka') out.push(it.namn);
      });
    }

    if (name === 'Hamnskifte') {
      const extras = ['Naturligt vapen','Pansar','Robust','Regeneration'];
      list.forEach(it => {
        if (extras.includes(it.namn) && it.form === 'beast') out.push(it.namn);
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
    enforceEarthbound(list);
    applyHamnskifteTraits(list);
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

  function getNilasPopupSeen(store) {
    if (!store.current) return false;
    const data = store.data[store.current] || {};
    return Boolean(data.nilasPopupShown);
  }

  function setNilasPopupSeen(store, val) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].nilasPopupShown = Boolean(val);
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
    const ent = list.find(x =>
      x.namn === ability &&
      (x.taggar?.typ || []).some(t => ['Förmåga', 'Mystisk kraft'].includes(t))
    );
    return LEVEL_IDX[ent?.nivå || ''] || 0;
  }

  function hasOtherMonsterAccess(list, trait) {
    const baseRace = list.find(isRas)?.namn;
    const trollTraits = ['Naturligt vapen', 'Pansar', 'Regeneration', 'Robust'];
    const undeadTraits = ['Gravkyla', 'Skräckslå', 'Vandödhet'];
    const bloodvaderTraits = ['Naturligt vapen','Pansar','Regeneration','Robust'];
    if (list.some(x => x.namn === 'Mörkt blod')) return true;
    if (baseRace === 'Troll' && trollTraits.includes(trait)) return true;
    if (baseRace === 'Vandöd' && undeadTraits.includes(trait)) return true;
    if (list.some(x => x.namn === 'Blodvadare') && bloodvaderTraits.includes(trait)) return true;
    return false;
  }

  function hamnskifteNoviceLimit(list, trait, level) {
    const lvl = LEVEL_IDX[level || 'Novis'] || 1;
    if (lvl <= 1) return false;
    const hamlvl = abilityLevel(list, 'Hamnskifte');
    if (['Naturligt vapen', 'Pansar'].includes(trait) && hamlvl >= 2) {
      return !hasOtherMonsterAccess(list, trait);
    }
    if (['Regeneration', 'Robust'].includes(trait) && hamlvl >= 3) {
      return !hasOtherMonsterAccess(list, trait);
    }
    return false;
  }

  function isFreeMonsterTrait(list, item) {
    if (item.form !== 'beast') return false;
    const lvl = LEVEL_IDX[item.nivå || 'Novis'] || 1;
    if (lvl !== 1) return false; // Only Novis level can be free

    const hamnskifte = abilityLevel(list, 'Hamnskifte');

    if (['Naturligt vapen', 'Pansar'].includes(item.namn)) {
      return hamnskifte >= 2;
    }

    if (['Regeneration', 'Robust'].includes(item.namn)) {
      return hamnskifte >= 3;
    }

    return false;
  }

  function monsterTraitDiscount(list, item) {
    if (item.form !== 'beast') return 0;
    const hamnskifte = abilityLevel(list, 'Hamnskifte');

    if (hamnskifte >= 2 && ['Naturligt vapen', 'Pansar'].includes(item.namn)) {
      return 10;
    }

    if (hamnskifte >= 3 && ['Regeneration', 'Robust'].includes(item.namn)) {
      return 10;
    }

    return 0;
  }

  function monsterStackLimit(list, name) {
    const entry = window.DBIndex?.[name];
    if (!entry || !isMonstrousTrait(entry)) return 3;
    const hamlvl = abilityLevel(list, 'Hamnskifte');

    if (['Naturligt vapen', 'Pansar'].includes(name)) {
      return hamlvl >= 2 ? 2 : 1;
    }

    if (['Regeneration', 'Robust'].includes(name)) {
      return hamlvl >= 3 ? 2 : 1;
    }

    return 1;
  }

  function calcPermanentCorruption(list, extra) {
    let cor = 0;
    const isDwarf = list.some(x => x.namn === 'Dvärg' && (x.taggar?.typ || []).includes('Ras'));
    list.forEach(it => {
      const types = it.taggar?.typ || [];
      if (!['Mystisk kraft', 'Ritual'].some(t => types.includes(t))) return;
      if (isDwarf && types.includes('Mystisk kraft') && it.namn === 'Vedergällning') return;
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
        let cost = isFreeMonsterTrait(list, item)
          ? 0
          : (XP_LADDER[item.nivå || 'Novis'] || 0);
        cost = Math.max(0, cost - monsterTraitDiscount(list, item));
        xp += cost;

      } else if (types.includes('monstruöst särdrag')) {
        let cost = isFreeMonsterTrait(list, item) ? 0 : RITUAL_COST;
        cost = Math.max(0, cost - monsterTraitDiscount(list, item));
        xp += cost;
      }
      if (types.includes('fördel')) xp += 5;
      if (types.includes('ritual')) xp += RITUAL_COST;
    });

    xp += extra?.xp || 0;
    return xp;
  }

  function calcEntryXP(entry, list) {
    const types = (entry.taggar?.typ || []).map(t => t.toLowerCase());
    if (types.includes('nackdel')) return -5;
    let xp = 0;
    if (
      entry.nivåer &&
      ['mystisk kraft', 'förmåga', 'särdrag', 'monstruöst särdrag'].some(t => types.includes(t))
    ) {
      let cost = isFreeMonsterTrait(list || [], entry)
        ? 0
        : (XP_LADDER[entry.nivå || 'Novis'] || 0);
      cost = Math.max(0, cost - monsterTraitDiscount(list || [], entry));
      xp += cost;
    } else if (types.includes('monstruöst särdrag')) {
      let cost = isFreeMonsterTrait(list || [], entry) ? 0 : RITUAL_COST;
      cost = Math.max(0, cost - monsterTraitDiscount(list || [], entry));
      xp += cost;
    }
    if (types.includes('fördel')) xp += 5;
    if (types.includes('ritual')) xp += RITUAL_COST;
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

  function calcPainThreshold(strength, list, extra) {
    const painBonus = list.filter(e => e.namn === 'Smärttålig').length;
    const painPenalty = list.filter(e => e.namn === 'Bräcklig').length;
    let pain = Math.ceil(Number(strength || 0) / 2);
    pain += painBonus - painPenalty;
    const perm = calcPermanentCorruption(list, extra);
    if (list.some(e => e.namn === 'Jordnära')) {
      pain -= Math.floor(perm / 2);
    }
    return pain;
  }

  /* ---------- Hjälpfunktioner för export ---------- */

  function toBase64(arr) {
    if (typeof btoa === 'function') {
      let str = '';
      arr.forEach(c => { str += String.fromCharCode(c); });
      return btoa(str);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(arr).toString('base64');
    }
    throw new Error('No base64 encoder available');
  }

  function fromBase64(str) {
    if (typeof atob === 'function') {
      const bin = atob(str);
      return Uint8Array.from(bin, c => c.charCodeAt(0));
    }
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(str, 'base64'));
    }
    throw new Error('No base64 decoder available');
  }

  function stripDefaults(data) {
    const obj = { ...(data || {}) };
    const emptyMoney = defaultMoney();
    const emptyEff = defaultArtifactEffects();

    ['money','bonusMoney','privMoney','possessionMoney'].forEach(k => {
      if (obj[k] && JSON.stringify(obj[k]) === JSON.stringify(emptyMoney)) delete obj[k];
    });
    if (obj.possessionRemoved === 0) delete obj.possessionRemoved;
    if (obj.artifactEffects && JSON.stringify(obj.artifactEffects) === JSON.stringify(emptyEff)) delete obj.artifactEffects;
    ['inventory','list','custom'].forEach(k => {
      if (Array.isArray(obj[k]) && obj[k].length === 0) delete obj[k];
    });
    ['partyAlchemist','partySmith','partyArtefacter'].forEach(k => {
      if (obj[k] === '') delete obj[k];
    });
    if (obj.nilasPopupShown === false) delete obj.nilasPopupShown;
    if (obj.baseXp === 0) delete obj.baseXp;
    if (obj.traits) {
      const def = defaultTraits();
      const t = {};
      let changed = false;
      Object.keys(obj.traits).forEach(key => {
        if (obj.traits[key] !== def[key]) { t[key] = obj.traits[key]; changed = true; }
      });
      obj.traits = changed ? t : undefined;
      if (!changed) delete obj.traits;
    }
    return obj;
  }

  function compressList(list) {
    return (list || []).map(it => {
      if (it && it.namn && window.DBIndex && window.DBIndex[it.namn]) {
        const entry = window.DBIndex[it.namn];
        const row = entry.id !== undefined ? { i: entry.id } : { n: it.namn };
        if (it.nivå) row.l = it.nivå;
        if (it.trait) row.t = it.trait;
        if (it.race) row.r = it.race;
        if (it.form) row.f = it.form;
        return row;
      }
      return it;
    });
  }

  function expandList(list) {
    return (list || []).map(it => {
      if (it && typeof it.i === 'number' && window.DB && window.DB[it.i]) {
        const base = { ...window.DB[it.i] };
        if (it.l) base.nivå = it.l;
        if (it.t) base.trait = it.t;
        if (it.r) base.race = it.r;
        if (it.f) base.form = it.f;
        return base;
      }
      if (it && it.n && window.DBIndex && window.DBIndex[it.n]) {
        const base = { ...window.DBIndex[it.n] };
        if (it.l) base.nivå = it.l;
        if (it.t) base.trait = it.t;
        if (it.r) base.race = it.r;
        if (it.f) base.form = it.f;
        return base;
      }
      return it;
    });
  }

  function compressInventory(inv) {
    return (inv || []).map(row => {
      if (!row || typeof row !== 'object') return row;
      let res;
      if (row.name && window.DBIndex && window.DBIndex[row.name]) {
        const entry = window.DBIndex[row.name];
        res = entry.id !== undefined ? { i: entry.id } : { n: row.name };
      } else {
        res = { n: row.name };
      }
      if (row.qty && row.qty !== 1) res.q = row.qty;
      if (row.gratis) res.g = row.gratis;
      if (row.kvaliteter && row.kvaliteter.length) res.k = row.kvaliteter;
      if (row.gratisKval && row.gratisKval.length) res.gk = row.gratisKval;
      if (row.removedKval && row.removedKval.length) res.rk = row.removedKval;
      if (row.artifactEffect) res.e = row.artifactEffect;
      if (row.nivå) res.l = row.nivå;
      if (row.trait) res.t = row.trait;
      return res;
    });
  }

  function expandInventory(inv) {
    return (inv || []).map(row => {
      if (row && typeof row.i === 'number' && window.DB && window.DB[row.i]) {
        const name = window.DB[row.i].namn;
        return {
          name,
          qty: row.q || 1,
          gratis: row.g || 0,
          kvaliteter: row.k || [],
          gratisKval: row.gk || [],
          removedKval: row.rk || [],
          artifactEffect: row.e || '',
          nivå: row.l,
          trait: row.t
        };
      }
      if (row && row.n) {
        return {
          name: row.n,
          qty: row.q || 1,
          gratis: row.g || 0,
          kvaliteter: row.k || [],
          gratisKval: row.gk || [],
          removedKval: row.rk || [],
          artifactEffect: row.e || '',
          nivå: row.l,
          trait: row.t
        };
      }
      return row;
    });
  }

  /* ---------- 7. Export / Import av karaktärer ---------- */
  function exportCharacterCode(store, id) {
    const charId = id || store.current;
    if (!charId) return '';
    const char = store.characters.find(c => c.id === charId);
    if (!char) return '';
    const data = store.data[charId] || {};
    const obj = {
      name: char.name,
      data: stripDefaults({
        ...data,
        list: compressList(data.list),
        inventory: compressInventory(data.inventory)
      })
    };
    const json = JSON.stringify(obj);
    const bytes = window.LZString.compressToUint8Array(json);
    return toBase64(bytes);
  }

  function importCharacterCode(store, code) {
    try {
      let json;
      try {
        const bytes = fromBase64(code);
        json = window.LZString.decompressFromUint8Array(bytes);
      } catch {
        json = window.LZString.decompressFromEncodedURIComponent(code);
      }
      const obj = JSON.parse(json);
      const id = 'rp' + Date.now();
      store.characters.push({ id, name: obj.name || 'Ny rollperson' });
      const data = obj.data || {};
      data.list = expandList(data.list);
      data.inventory = expandInventory(data.inventory);
      store.data[id] = {
        custom: [],
        artifactEffects: defaultArtifactEffects(),
        bonusMoney: defaultMoney(),
        privMoney: defaultMoney(),
        possessionMoney: defaultMoney(),
        possessionRemoved: 0,
        ...data
      };
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
    getNilasPopupSeen,
    setNilasPopupSeen,
    normalizeMoney,
    getTraits,
    setTraits,
    getBaseXP,
    setBaseXP,
    calcUsedXP,
    calcEntryXP,
    calcTotalXP,
    calcPermanentCorruption,
    calcPainThreshold,
    abilityLevel,
    hamnskifteNoviceLimit,
    isFreeMonsterTrait,
    monsterTraitDiscount,
    monsterStackLimit,
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