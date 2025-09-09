/* ===========================================================
   js/store.js
   • Ett enda, centralt hjälpbibliotek för data­lagring
   • Hanterar roll­personer, valda förmågor, inventarie
   • XP-beräkning enligt dina regler
   =========================================================== */
(function (global) {
  const STORAGE_KEY = 'rpall';

  const HAMNSKIFTE_NAMES = {
    'Naturligt vapen': 'Naturligt vapen: Hamnskifte',
    'Pansar': 'Pansar: Hamnskifte',
    'Robust': 'Robust: Hamnskifte',
    'Regeneration': 'Regeneration: Hamnskifte'
  };

  const HAMNSKIFTE_BASE = Object.fromEntries(
    Object.entries(HAMNSKIFTE_NAMES).map(([k,v]) => [v,k])
  );

  const DARK_BLOOD_TRAITS = ['Naturligt vapen', 'Pansar', 'Robust', 'Regeneration', 'Vingar'];

  /* ---------- 1. Grund­struktur ---------- */
  function emptyStore() {
    return {
      current: '',          // id för vald karaktär
      characters: [],       // [{ id, name }]
      data: {},             // { [charId]: { list: [...], inventory: [], custom: [], artifactEffects:{xp:0,corruption:0} } }
      folders: [],          // [{ id, name, order }]
      activeFolder: 'ALL',  // 'ALL' | folderId ("Utan mapp" ej tillåtet)
      filterUnion: false,
      compactEntries: true,
      onlySelected: false,
      recentSearches: []
    };
  }

  /* ---------- 2. Load / Save ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : emptyStore();
      const store = { ...emptyStore(), ...parsed };
      // Säkerställ att folders alltid finns
      if (!Array.isArray(store.folders)) store.folders = [];
      // Säkerställ systemmapp "Standard" och migrera ev. karaktärer
      ensureSystemFolderAndMigrate(store);
      // default aktiv mapp
      if (!store.activeFolder || store.activeFolder === '') store.activeFolder = 'ALL';
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
            hamnskifteRemoved: [],
            forcedDefense: '',
            notes: defaultNotes(),
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
          if(!Array.isArray(store.data[id].hamnskifteRemoved)){
            store.data[id].hamnskifteRemoved = [];
          }
          if(!store.data[id].notes){
            store.data[id].notes = defaultNotes();
          }
          if(store.data[id].forcedDefense === undefined){
            store.data[id].forcedDefense = '';
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

  // Skapa/finn systemmappen "Standard" och migrera karaktärer utan giltig mapp
  function ensureSystemFolderAndMigrate(store){
    try {
      store.folders = Array.isArray(store.folders) ? store.folders : [];
      // Hitta befintlig systemmapp eller mapp med namnet "Standard"
      let standard = store.folders.find(f => f && (f.system === true));
      if (!standard) {
        standard = store.folders.find(f => (f?.name === 'Standard'));
      }
      if (!standard) {
        // Skapa ny systemmapp
        const id = 'fd-standard-' + Math.floor(Math.random()*1000000);
        standard = { id, name: 'Standard', order: 0, system: true };
        store.folders.unshift(standard);
      } else {
        // Markera som systemmapp om den inte redan är det
        standard.system = true;
        if (standard.order === undefined) standard.order = 0;
      }
      // Migrera karaktärer som saknar giltig mapp till Standard
      const folderIds = new Set(store.folders.map(f => f.id));
      store.characters = (store.characters || []).map(c => {
        const fid = c?.folderId || '';
        if (!fid || !folderIds.has(fid)) {
          return { ...c, folderId: standard.id };
        }
        return c;
      });
      // Spara direkt så att UI ser korrekta data
      save(store);
    } catch {}
  }

  function save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  /* ---------- 2b. Senaste sökningar ---------- */
  const MAX_RECENT_SEARCHES = 10;

  function getRecentSearches(store) {
    try {
      const arr = Array.isArray(store.recentSearches) ? store.recentSearches : [];
      return arr.slice(0, MAX_RECENT_SEARCHES);
    } catch {
      return [];
    }
  }

  function addRecentSearch(store, term) {
    const t = String(term || '').trim();
    if (!t) return;
    // Ignorera interna kommandon
    const blocked = ['webapp','lol','molly<3'];
    if (blocked.includes(t.toLowerCase())) return;
    const cur = Array.isArray(store.recentSearches) ? store.recentSearches : [];
    const filtered = cur.filter(x => String(x || '').toLowerCase() !== t.toLowerCase());
    filtered.unshift(t);
    store.recentSearches = filtered.slice(0, MAX_RECENT_SEARCHES);
    save(store);
  }

  /* ---------- 3. Förmåge­lista per karaktär ---------- */
  function getCurrentList(store) {
    if (!store.current) return [];
    const list = store.data[store.current]?.list || [];
    return list.map(x => ({ ...x }));
  }

  function applyDarkBloodEffects(list) {
    const hasDark = list.some(x => x.namn === 'Mörkt blod');
    const idxBest = list.findIndex(x => x.namn === 'Mörkt förflutet');

    if (hasDark) {
      if (idxBest < 0) {
        const entry = DB.find(x => x.namn === 'Mörkt förflutet');
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
    // Tidigare blockerades "Mörkt förflutet" av "Jordnära".
    // Ny regel: tillåtet – ingen borttagning här.
  }

  function enforceDwarf(list) {
    if (list.some(x => x.namn === 'Dvärg')) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].namn === 'Korruptionskänslig') list.splice(i, 1);
      }
    }
  }

  function enforcePackAnimal(list) {
    const packIdx = list.findIndex(x => x.namn === 'Packåsna');
    const hafsIdx = list.findIndex(x => x.namn === 'Hafspackare');
    if (packIdx >= 0 && hafsIdx >= 0) {
      if (packIdx > hafsIdx) {
        list.splice(packIdx, 1);
      } else {
        list.splice(hafsIdx, 1);
      }
    }
  }

  function applyHamnskifteTraits(store, list) {
    if (!store.current) return;
    const data = store.data[store.current] || {};
    const removed = Array.isArray(data.hamnskifteRemoved) ? data.hamnskifteRemoved : [];

    const hamLvl = abilityLevel(list, 'Hamnskifte');
    const needed = [];
    if (hamLvl >= 2) needed.push('Naturligt vapen', 'Pansar');
    if (hamLvl >= 3) needed.push('Robust', 'Regeneration');

    const all = Object.keys(HAMNSKIFTE_NAMES);
    const hamNames = HAMNSKIFTE_NAMES;
    const allHamNames = Object.values(hamNames);

    let customs = getCustomEntries(store).filter(e => !allHamNames.includes(e.namn));

    all.forEach(base => {
      const hamName = hamNames[base];
      if (!needed.includes(base)) {
        for (let i=list.length-1;i>=0;i--) {
          if (list[i].namn === hamName) {
            list.splice(i,1);
            const idx = removed.indexOf(base);
            if (idx >= 0) removed.splice(idx,1);
          }
        }
        customs = customs.filter(c => c.namn !== hamName);
      }
    });

    needed.forEach(base => {
      const hamName = hamNames[base];
      if (!customs.some(c => c.namn === hamName)) {
        const entry = DB.find(e => e.namn === base);
        if (entry) customs.push({ ...entry, namn: hamName, form: 'beast' });
      }
      const idx = list.findIndex(it => it.namn === hamName);
      if (idx < 0 && !removed.includes(base)) {
        const entry = customs.find(e => e.namn === hamName);
        if (entry) list.push({ ...entry, nivå: 'Novis' });
      }
    });

    setCustomEntries(store, customs);
    store.data[store.current].hamnskifteRemoved = removed;
  }

  function getDependents(list, entry) {
    if (!entry) return [];
    let name = entry.namn || entry;
    name = HAMNSKIFTE_BASE[name] || name;
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
      list.forEach(it => {
        const base = HAMNSKIFTE_BASE[it.namn] || it.namn;
        if (it.namn === 'Mörkt förflutet' || DARK_BLOOD_TRAITS.includes(base)) {
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
      const extras = Object.values(HAMNSKIFTE_NAMES);
      list.forEach(it => {
        if (extras.includes(it.namn)) out.push(it.namn);
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
    enforceDwarf(list);
    enforcePackAnimal(list);
    applyHamnskifteTraits(store, list);
    const prev = store.data[store.current]?.list || [];
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].list = list;
    const hadPriv = prev.some(x => x.namn === 'Privilegierad');
    const hasPriv = list.some(x => x.namn === 'Privilegierad');
    const hasPos  = list.some(x => x.namn === 'Besittning');

    const priv = store.data[store.current].privMoney || defaultMoney();
    const pos  = store.data[store.current].possessionMoney || defaultMoney();

    const privHas = priv.daler || priv.skilling || priv['örtegar'];
    if (hasPriv && !hadPriv) {
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

  function getPrivMoney(store) {
    if (!store.current) return defaultMoney();
    const data = store.data[store.current] || {};
    return { ...defaultMoney(), ...(data.privMoney || {}) };
  }

  function setPrivMoney(store, money) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].privMoney = { ...defaultMoney(), ...money };
    const total = normalizeMoney({
      daler: (money.daler || 0) + ((store.data[store.current].possessionMoney || {}).daler || 0),
      skilling: (money.skilling || 0) + ((store.data[store.current].possessionMoney || {}).skilling || 0),
      'örtegar': (money['örtegar'] || 0) + ((store.data[store.current].possessionMoney || {})['örtegar'] || 0)
    });
    store.data[store.current].bonusMoney = total;
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

  function getHamnskifteRemoved(store) {
    if (!store.current) return [];
    const data = store.data[store.current] || {};
    return Array.isArray(data.hamnskifteRemoved) ? data.hamnskifteRemoved : [];
  }

  function setHamnskifteRemoved(store, arr) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].hamnskifteRemoved = arr;
    save(store);
  }

  function duplicateCharacter(store, sourceId) {
    if (!sourceId) return null;
    const char = store.characters.find(c => c.id === sourceId);
    if (!char) return null;
    const newId = makeCharId(store);
    store.characters.push({ id: newId, name: `${char.name} (kopia)`, folderId: char.folderId || '' });
    const data = store.data[sourceId] ? JSON.parse(JSON.stringify(store.data[sourceId])) : {};
    store.data[newId] = data;
    save(store);
    return newId;
  }

  function renameCharacter(store, charId, newName) {
    if (!charId || !newName) return;
    const char = store.characters.find(c => c.id === charId);
    if (!char) return;
    char.name = newName;
    save(store);
  }

  function deleteCharacter(store, charId) {
    if (!charId) return;
    store.characters = store.characters.filter(c => c.id !== charId);
    delete store.data[charId];
    if (store.current === charId) store.current = '';
    save(store);
  }

  function deleteAllCharacters(store) {
    store.characters = [];
    store.data = {};
    store.current = '';
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

  function getDefenseTrait(store) {
    if (!store.current) return '';
    const data = store.data[store.current] || {};
    return data.forcedDefense || '';
  }

  function setDefenseTrait(store, trait) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].forcedDefense = trait || '';
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

  function getOnlySelected(store) {
    return Boolean(store.onlySelected);
  }

  function setOnlySelected(store, val) {
    store.onlySelected = Boolean(val);
    save(store);
  }

  function getRevealedArtifacts(store) {
    if (!store.current) return [];
    const data = store.data[store.current] || {};
    return data.revealedArtifacts || [];
  }

  function addRevealedArtifact(store, name) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const set = new Set(store.data[store.current].revealedArtifacts || []);
    set.add(name);
    store.data[store.current].revealedArtifacts = [...set];
    save(store);
  }

  function removeRevealedArtifact(store, name) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const list = store.data[store.current].revealedArtifacts || [];
    store.data[store.current].revealedArtifacts = list.filter(n => n !== name);
    save(store);
  }

  function clearRevealedArtifacts(store) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};

    const keep = new Set();

    const isHiddenTags = (tagTyp) => {
      const arr = Array.isArray(tagTyp) ? tagTyp : [];
      return arr.some(t => ['Artefakt', 'Kuriositet', 'Skatt'].includes(String(t)));
    };

    // Keep any currently selected entries that are hidden types
    getCurrentList(store).forEach(it => {
      const tagTyp = it.taggar?.typ || [];
      if (isHiddenTags(tagTyp)) keep.add(it.namn);
    });

    // Keep any hidden items that still exist in the inventory (recursively)
    const collect = arr => {
      arr.forEach(row => {
        const entry = (getCustomEntries(store).find(e => e.namn === row.name))
          || (global.DB || []).find(e => e.namn === row.name) || {};
        const tagTyp = entry.taggar?.typ || [];
        if (isHiddenTags(tagTyp)) keep.add(entry.namn);
        if (Array.isArray(row.contains)) collect(row.contains);
      });
    };
    collect(getInventory(store));

    const cur = getRevealedArtifacts(store);
    store.data[store.current].revealedArtifacts = cur.filter(n => keep.has(n));
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

  /* ---------- 6b. Anteckningar ---------- */
  function defaultNotes() {
    return {
      shadow: '',
      age: '',
      appearance: '',
      manner: '',
      faction: '',
      quote: '',
      goal: '',
      drives: '',
      loyalties: '',
      likes: '',
      hates: '',
      background: ''
    };
  }

  function getNotes(store) {
    if (!store.current) return defaultNotes();
    const data = store.data[store.current] || {};
    return { ...defaultNotes(), ...(data.notes || {}) };
  }

  function setNotes(store, notes) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].notes = { ...defaultNotes(), ...notes };
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

  function hamnskifteNoviceLimit(list, item, level) {
    const lvl = LEVEL_IDX[level || 'Novis'] || 1;
    if (lvl <= 1) return false;
    const base = HAMNSKIFTE_BASE[item.namn];
    if (!base) return false;
    const hamlvl = abilityLevel(list, 'Hamnskifte');
    const hasBloodvader = list.some(x => x.namn === 'Blodvadare');
    if (hasBloodvader) return false;
    if (['Naturligt vapen', 'Pansar'].includes(base) && hamlvl >= 2) {
      return true;
    }
    if (['Regeneration', 'Robust'].includes(base) && hamlvl >= 3) {
      return true;
    }
    return false;
  }

  function isFreeMonsterTrait(list, item) {
    const base = HAMNSKIFTE_BASE[item.namn];
    if (!base) return false;
    const lvl = LEVEL_IDX[item.nivå || 'Novis'] || 1;
    if (lvl !== 1) return false; // Only Novis level can be free

    const hamnskifte = abilityLevel(list, 'Hamnskifte');

    if (['Naturligt vapen', 'Pansar'].includes(base)) {
      return hamnskifte >= 2;
    }

    if (['Regeneration', 'Robust'].includes(base)) {
      return hamnskifte >= 3;
    }

    return false;
  }

  function monsterTraitDiscount(list, item) {
    const base = HAMNSKIFTE_BASE[item.namn];
    if (!base) return 0;
    const hamnskifte = abilityLevel(list, 'Hamnskifte');

    if (hamnskifte >= 2 && ['Naturligt vapen', 'Pansar'].includes(base)) {
      return 10;
    }

    if (hamnskifte >= 3 && ['Regeneration', 'Robust'].includes(base)) {
      return 10;
    }

    return 0;
  }

  function monsterStackLimit(list, name) {
    const base = HAMNSKIFTE_BASE[name] || name;
    const entry = window.DBIndex?.[base];
    if (!entry || !isMonstrousTrait(entry)) return 3;
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

  function calcDarkPastTemporaryCorruption(list, thresh) {
    if (!Array.isArray(list)) return 0;
    if (!list.some(e => e.namn === 'Mörkt förflutet')) return 0;
    return Math.ceil((Number(thresh) || 0) / 4);
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

  function getDisadvantages(list) {
    const hasDark = list.some(x => x.namn === 'Mörkt blod');
    return list.filter(item => {
      const isDis = (item.taggar?.typ || [])
        .map(t => t.toLowerCase())
        .includes('nackdel');
      if (!isDis) return false;
      if (hasDark && item.namn === 'Mörkt förflutet') return false;
      return true;
    });
  }

  function countDisadvantages(list) {
    return getDisadvantages(list).length;
  }

  function disadvantagesWithXP(list) {
    return getDisadvantages(list).slice(0,5);
  }

  function calcEntryXP(entry, list) {
    const types = (entry.taggar?.typ || []).map(t => t.toLowerCase());
    if (types.includes('nackdel')) {
      const hasDark = (list || []).some(x => x.namn === 'Mörkt blod');
      if (entry.namn === 'Mörkt förflutet' && hasDark) return 0;
      const disXp = disadvantagesWithXP(list || []);
      if ((list || []).includes(entry)) {
        return disXp.includes(entry) ? -5 : 0;
      }
      return disXp.length < 5 ? -5 : 0;
    }
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

  function calcTotalXP(baseXp, list) {
    return Number(baseXp || 0) + disadvantagesWithXP(list).length * 5;
  }

  function calcCarryCapacity(strength, list) {
    const str = Number(strength || 0);
    let base = str + 3;
    if (Array.isArray(list)) {
      if (list.some(e => e.namn === 'Packåsna')) {
        base = Math.ceil(str * 1.5) + 3;
      } else if (list.some(e => e.namn === 'Hafspackare')) {
        base = Math.ceil(str * 0.5) + 3;
      }
    }
    return base;
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
    // Ny regel: Jordnära + Mörkt förflutet ger ytterligare - (smärtgräns / 4)
    if (list.some(e => e.namn === 'Jordnära') && list.some(e => e.namn === 'Mörkt förflutet')) {
      const extraPenalty = Math.floor(pain / 4);
      pain -= extraPenalty;
    }
    return pain;
  }

  /* ---------- Hjälpfunktioner för export/import ---------- */

  function stripDefaults(data) {
    const obj = { ...(data || {}) };
    const emptyMoney = defaultMoney();
    const emptyEff = defaultArtifactEffects();

    ['money','bonusMoney','privMoney','possessionMoney'].forEach(k => {
      if (obj[k] && JSON.stringify(obj[k]) === JSON.stringify(emptyMoney)) delete obj[k];
    });
    if (obj.possessionRemoved === 0) delete obj.possessionRemoved;
    if (Array.isArray(obj.hamnskifteRemoved) && obj.hamnskifteRemoved.length === 0) delete obj.hamnskifteRemoved;
    if (obj.artifactEffects && JSON.stringify(obj.artifactEffects) === JSON.stringify(emptyEff)) delete obj.artifactEffects;
    ['inventory','list','custom'].forEach(k => {
      if (Array.isArray(obj[k]) && obj[k].length === 0) delete obj[k];
    });
    ['partyAlchemist','partySmith','partyArtefacter'].forEach(k => {
      if (obj[k] === '') delete obj[k];
    });
    if (obj.nilasPopupShown === false) delete obj.nilasPopupShown;
    if (obj.baseXp === 0) delete obj.baseXp;
    if (obj.notes) {
      const def = defaultNotes();
      const allEmpty = Object.keys(def).every(key => !obj.notes[key]);
      if (allEmpty) delete obj.notes;
    }
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
      if (it && it.i !== undefined && window.DB && window.DB[it.i]) {
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
      if (row.artifactEffect === 'xp' || row.artifactEffect === 'corruption') res.e = row.artifactEffect;
      if (row.nivå) res.l = row.nivå;
      if (row.trait) res.t = row.trait;
      return res;
    });
  }

  function expandInventory(inv) {
    return (inv || []).map(row => {
      if (row && row.i !== undefined && window.DB && window.DB[row.i]) {
        const name = window.DB[row.i].namn;
        return {
          name,
          qty: row.q || 1,
          gratis: row.g || 0,
          kvaliteter: row.k || [],
          gratisKval: row.gk || [],
          removedKval: row.rk || [],
          artifactEffect: row.e === 'xp' || row.e === 'corruption' ? row.e : '',
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
          artifactEffect: row.e === 'xp' || row.e === 'corruption' ? row.e : '',
          nivå: row.l,
          trait: row.t
        };
      }
      return row;
    });
  }

  /* ---------- 7. Export / Import av karaktärer ---------- */
  function exportCharacterJSON(store, id, includeFolder = true) {
    const charId = id || store.current;
    if (!charId) return null;
    const char = store.characters.find(c => c.id === charId);
    if (!char) return null;
    const data = store.data[charId] || {};
    // Hitta mappnamn om karaktären ligger i mapp
    let folderName;
    try {
      const fid = char.folderId || '';
      if (fid) {
        const f = (store.folders || []).find(x => x.id === fid);
        folderName = f ? f.name : undefined;
      }
    } catch {}
    return {
      name: char.name,
      ...(includeFolder && folderName ? { folder: folderName } : {}),
      data: stripDefaults({
        ...data,
        list: compressList(data.list),
        inventory: compressInventory(data.inventory),
        notes: data.notes
      })
    };
  }

  function importCharacterJSON(store, obj) {
    try {
      const id = makeCharId(store);
      // Mapp: skapa eller återanvänd efter namn om finns
      let folderId = '';
      try {
        const folderName = String(obj.folder || '').trim();
        if (folderName) {
          const existing = (store.folders || []).find(f => f.name === folderName);
          if (existing) {
            folderId = existing.id;
          } else {
            // skapa ny mapp med sekvensordning sist
            const order = Array.isArray(store.folders) ? store.folders.length : 0;
            const newId = 'fd' + Date.now();
            (store.folders ||= []).push({ id: newId, name: folderName, order });
            folderId = newId;
          }
        } else {
          // Ingen mapp i filen: lägg i systemmappen "Standard"
          const standard = (store.folders || []).find(f => f.system) || (store.folders || []).find(f => f.name === 'Standard');
          if (standard) folderId = standard.id;
        }
      } catch {}
      store.characters.push({ id, name: obj.name || 'Ny rollperson', folderId });
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
        notes: defaultNotes(),
        ...data
      };
      if (!store.data[id].notes) {
        store.data[id].notes = defaultNotes();
      }
      store.current = id;
      save(store);
      return id;
    } catch {
      return null;
    }
  }

  // Skapa unikt ID för nya karaktärer utan kollisioner.
  function makeCharId(store) {
    try {
      const used = new Set((store.characters || []).map(c => c && c.id).filter(Boolean));
      // För att undvika krockar vid snabba loopar (t.ex. import) lägg till slump-suffix
      // och loopa tills ett oanvänt ID hittas.
      let attempt = 0;
      while (attempt < 1000) {
        const base = Date.now().toString(36);
        const rand = Math.floor(Math.random() * 1e9).toString(36).slice(0, 5);
        const id = `rp${base}-${rand}`;
        if (!used.has(id)) return id;
        attempt++;
      }
      // Extremt osannolikt – men fall tillbaka på ett enklare slump-ID
      return 'rp-' + Math.random().toString(36).slice(2, 12);
    } catch {
      return 'rp-' + Math.random().toString(36).slice(2, 12);
    }
  }

  /* ---------- 7. Export ---------- */
  global.storeHelper = {
    load,
    save,
    makeCharId,
    // Aktiv mapp
    getActiveFolder: (store) => {
      try {
        const val = store && store.activeFolder ? String(store.activeFolder) : 'ALL';
        if (val === 'ALL') return 'ALL';
        if (val === '') return 'ALL';
        const folders = Array.isArray(store.folders) ? store.folders : [];
        const exists = folders.some(f => f.id === val);
        return exists ? val : 'ALL';
      } catch { return 'ALL'; }
    },
    setActiveFolder: (store, folderId) => {
      try {
        const val = (folderId === '' || folderId === 'ALL') ? folderId : String(folderId || 'ALL');
        store.activeFolder = val;
        save(store);
      } catch {}
    },
    // Mapphantering
    getFolders: (store) => Array.isArray(store.folders) ? store.folders : [],
    addFolder: (store, name) => {
      const nm = String(name || '').trim();
      if (!nm) return null;
      store.folders = Array.isArray(store.folders) ? store.folders : [];
      // tillåt dubbletter i namn – identitet via id
      const order = store.folders.length;
      const id = 'fd' + Date.now() + '-' + Math.floor(Math.random()*10000);
      store.folders.push({ id, name: nm, order });
      save(store);
      return id;
    },
    renameFolder: (store, id, name) => {
      if (!id) return;
      const nm = String(name || '').trim();
      if (!nm) return;
      const f = (store.folders || []).find(x => x.id === id);
      if (!f) return;
      f.name = nm;
      save(store);
    },
    deleteFolder: (store, id) => {
      if (!id) return;
      const folders = Array.isArray(store.folders) ? store.folders : [];
      const exists = folders.some(f => f.id === id);
      if (!exists) return;
      // Tillåt inte borttagning av systemmapp
      const target = folders.find(f => f.id === id);
      if (target && target.system) return;
      // Hitta systemmapp för att flytta karaktärer
      const standard = folders.find(f => f.system) || folders.find(f => f.name === 'Standard');
      store.folders = folders.filter(f => f.id !== id);
      // flytta karaktärer till systemmappen "Standard"
      const destId = standard ? standard.id : '';
      store.characters = (store.characters || []).map(c => (
        c && c.folderId === id ? { ...c, folderId: destId } : c
      ));
      save(store);
    },
    getCharacterFolder: (store, charId) => {
      if (!charId) return '';
      const c = (store.characters || []).find(x => x.id === charId);
      return c && c.folderId ? c.folderId : '';
    },
    setCharacterFolder: (store, charId, folderId) => {
      if (!charId) return;
      const c = (store.characters || []).find(x => x.id === charId);
      if (!c) return;
      // Förhindra placering i "Utan mapp": mappa tomt till systemmappen
      let dest = folderId || '';
      if (!dest) {
        const folders = Array.isArray(store.folders) ? store.folders : [];
        const standard = folders.find(f => f.system) || folders.find(f => f.name === 'Standard');
        if (standard) dest = standard.id;
      }
      c.folderId = dest;
      save(store);
    },
    // Flytta flera karaktärer på en gång (sparar endast en gång)
    setCharactersFolderBulk: (store, charIds, folderId) => {
      try {
        const ids = Array.isArray(charIds) ? charIds.filter(Boolean) : [];
        if (!ids.length) return;
        // Mappar tom destination till systemmappen "Standard"
        let dest = folderId || '';
        if (!dest) {
          const folders = Array.isArray(store.folders) ? store.folders : [];
          const standard = folders.find(f => f.system) || folders.find(f => f.name === 'Standard');
          if (standard) dest = standard.id;
        }
        const idSet = new Set(ids);
        (store.characters || []).forEach(c => {
          if (c && idSet.has(c.id)) c.folderId = dest;
        });
        save(store);
      } catch {}
    },
    getRecentSearches,
    addRecentSearch,
    getCurrentList,
    setCurrentList,
    getInventory,
    setInventory,
    getCustomEntries,
    setCustomEntries,
    getNotes,
    setNotes,
    getMoney,
    setMoney,
    getBonusMoney,
    setBonusMoney,
    getPrivMoney,
    setPrivMoney,
    getTotalMoney,
    getPartySmith,
    setPartySmith,
    getPartyAlchemist,
    setPartyAlchemist,
    getPartyArtefacter,
    setPartyArtefacter,
    getDefenseTrait,
    setDefenseTrait,
    getArtifactEffects,
    setArtifactEffects,
    getFilterUnion,
    setFilterUnion,
    getCompactEntries,
    setCompactEntries,
    getOnlySelected,
    setOnlySelected,
    getRevealedArtifacts,
    addRevealedArtifact,
    removeRevealedArtifact,
    clearRevealedArtifacts,
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
    countDisadvantages,
    calcPermanentCorruption,
    calcDarkPastTemporaryCorruption,
    calcCarryCapacity,
    calcPainThreshold,
    abilityLevel,
    hamnskifteNoviceLimit,
    isFreeMonsterTrait,
    monsterTraitDiscount,
    monsterStackLimit,
    exportCharacterJSON,
    importCharacterJSON,
    getPossessionMoney,
    setPossessionMoney,
    incrementPossessionRemoved,
    resetPossessionRemoved,
    getHamnskifteRemoved,
    setHamnskifteRemoved,
    duplicateCharacter,
    renameCharacter,
    deleteCharacter,
    deleteAllCharacters,
    getDependents,
    HAMNSKIFTE_NAMES,
    HAMNSKIFTE_BASE,
    DARK_BLOOD_TRAITS
  };
})(window);
