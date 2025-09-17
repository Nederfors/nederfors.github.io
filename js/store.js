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

  function moneyToO(...args) {
    const fn = global.moneyToO;
    if (typeof fn !== 'function') {
      throw new Error('moneyToO is not available');
    }
    return fn(...args);
  }

  function oToMoney(...args) {
    const fn = global.oToMoney;
    if (typeof fn !== 'function') {
      throw new Error('oToMoney is not available');
    }
    return fn(...args);
  }

  function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function sanitizeMoneyStruct(obj) {
    const src = (obj && typeof obj === 'object') ? obj : {};
    const base = defaultMoney();
    return {
      daler: Math.max(0, Math.floor(toNumber(src.daler, base.daler))),
      skilling: Math.max(0, Math.floor(toNumber(src.skilling, base.skilling))),
      'örtegar': Math.max(0, Math.floor(toNumber(src['örtegar'], base['örtegar'])))
    };
  }

  function makeCustomIdPrefix(name, fallback = '') {
    const primary = typeof name === 'string' ? name.trim() : '';
    const fallbackStr = String(fallback || '').trim();
    const cleaned = (primary || fallbackStr || 'Custom')
      .replace(/\s+/g, '');
    return `Custom${cleaned || 'Unnamed'}`;
  }

  const FALLBACK_WEAPON_TYPES = ['Enhandsvapen','Korta vapen','Långa vapen','Tunga vapen','Obeväpnad attack','Projektilvapen','Belägringsvapen'];
  const FALLBACK_ARMOR_TYPES  = ['Lätt Rustning','Medeltung Rustning','Tung Rustning'];

  function getSubtypeSets() {
    const weapon = new Set();
    const armor  = new Set();
    try {
      const db = global.DB || [];
      db.forEach(e => {
        const typs = e?.taggar?.typ || [];
        if (typs.includes('Vapen')) {
          typs.forEach(t => {
            if (t !== 'Vapen' && t !== 'Sköld') weapon.add(String(t));
          });
        }
        if (typs.includes('Rustning')) {
          typs.forEach(t => {
            if (t !== 'Rustning') armor.add(String(t));
          });
        }
      });
    } catch {}
    if (!weapon.size) FALLBACK_WEAPON_TYPES.forEach(t => weapon.add(t));
    if (!armor.size) FALLBACK_ARMOR_TYPES.forEach(t => armor.add(t));
    return { weapon, armor };
  }

  function sanitizeCustomEntries(list, options = {}) {
    const arr = Array.isArray(list) ? list : [];
    const { usedIds, prefix } = options || {};
    const basePrefix = typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'Custom';
    const globalIds = usedIds instanceof Set ? usedIds : null;
    const localIds = new Set();
    const idMap = new Map();
    const { weapon: weaponSubs, armor: armorSubs } = getSubtypeSets();
    let counter = 1;

    const isTaken = (id) => localIds.has(id) || (globalIds && globalIds.has(id));
    const nextId = () => {
      let id;
      do { id = `${basePrefix}${counter++}`; } while (isTaken(id));
      return id;
    };

    const sanitized = arr.map(raw => {
      const entry = (raw && typeof raw === 'object') ? { ...raw } : {};

      // Preserve stable, unique IDs; only generate when missing/colliding
      const originalId = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : undefined;
      let finalId = originalId;
      if (!finalId || isTaken(finalId)) {
        finalId = nextId();
        if (originalId && originalId !== finalId) idMap.set(originalId, finalId);
      }
      entry.id = finalId;
      localIds.add(finalId);
      if (globalIds) globalIds.add(finalId);

      // Core fields
      entry.namn = typeof entry.namn === 'string' ? entry.namn.trim() : '';
      const weight = toNumber(entry.vikt, 0);
      entry.vikt = Number.isFinite(weight) && weight >= 0 ? weight : 0;
      entry.grundpris = sanitizeMoneyStruct(entry.grundpris);

      // Tags: ensure Hemmagjort baseline; inject base types for subtypes; treat Sköld as weapon
      const taggar = (entry.taggar && typeof entry.taggar === 'object') ? { ...entry.taggar } : {};
      const normalizeTypes = (vals) => {
        const extras = new Set((vals || []).map(v => String(v).trim()).filter(Boolean));
        extras.delete('Hemmagjort');
        const hasWeapon = extras.has('Vapen') || extras.has('Sköld') || [...extras].some(t => weaponSubs.has(t));
        const hasArmor  = extras.has('Rustning') || [...extras].some(t => armorSubs.has(t));
        if (hasWeapon) extras.add('Vapen');
        if (hasArmor) extras.add('Rustning');
        const ordered = ['Hemmagjort'];
        if (extras.has('Vapen')) ordered.push('Vapen');
        if (extras.has('Rustning')) ordered.push('Rustning');
        extras.forEach(t => { if (t !== 'Vapen' && t !== 'Rustning') ordered.push(t); });
        return ordered;
      };
      if (Array.isArray(taggar.typ)) {
        taggar.typ = normalizeTypes(taggar.typ);
      } else if (typeof taggar.typ === 'string' && taggar.typ.trim()) {
        taggar.typ = normalizeTypes([taggar.typ.trim()]);
      } else {
        taggar.typ = ['Hemmagjort'];
      }
      entry.taggar = taggar;

      entry.beskrivning = typeof entry.beskrivning === 'string' ? entry.beskrivning.trim() : '';
      entry.artifactEffect = entry.artifactEffect === 'xp' || entry.artifactEffect === 'corruption' ? entry.artifactEffect : '';

      if (entry.bound === 'kraft' || entry.bound === 'ritual') {
        const rawLabel = typeof entry.boundLabel === 'string' ? entry.boundLabel.trim() : '';
        entry.boundLabel = rawLabel || (entry.bound === 'kraft' ? 'Formel' : 'Ritual');
      } else {
        delete entry.bound;
        delete entry.boundLabel;
      }

      // Stats
      const rawStat = entry.stat && typeof entry.stat === 'object' ? entry.stat : {};
      const stat = {};
      if (rawStat.skada !== undefined) {
        const val = String(rawStat.skada).trim();
        if (val) stat.skada = val;
      }
      if (rawStat['b\u00e4rkapacitet'] !== undefined) {
        const num = Number(rawStat['b\u00e4rkapacitet']);
        if (Number.isFinite(num) && num >= 0) stat['b\u00e4rkapacitet'] = Math.floor(num);
      }
      if (rawStat.skydd !== undefined) {
        const val = String(rawStat.skydd).trim();
        if (val) stat.skydd = val;
      }
      const rawRestr = rawStat['begränsning'] ?? rawStat.begränsning;
      if (rawRestr !== undefined && rawRestr !== null && rawRestr !== '') {
        const num = Number(rawRestr);
        if (Number.isFinite(num)) stat['begränsning'] = num;
      }
      if (Object.keys(stat).length) entry.stat = stat; else delete entry.stat;

      return entry;
    });

    return { entries: sanitized, idMap };
  }

  function collectUsedCustomIds(store, excludeId) {
    const set = new Set();
    if (!store || !store.data || typeof store.data !== 'object') return set;
    Object.keys(store.data).forEach(id => {
      if (excludeId && id === excludeId) return;
      const customs = store.data[id]?.custom || [];
      customs.forEach(ent => {
        if (ent && typeof ent.id === 'string') set.add(ent.id);
      });
    });
    return set;
  }

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
        let mutated = false;
        const usedCustomIds = new Set();
        const chars = Array.isArray(store.characters) ? store.characters : [];
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
          const data = {
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
          if(!data.artifactEffects){
            data.artifactEffects = { xp:0, corruption:0 };
          }
          if(!data.bonusMoney){
            data.bonusMoney = defaultMoney();
          }
          if(!data.privMoney){
            data.privMoney = defaultMoney();
          }
          if(!data.possessionMoney){
            data.possessionMoney = defaultMoney();
          }
          if(!data.possessionRemoved){
            data.possessionRemoved = 0;
          }
          if(!Array.isArray(data.hamnskifteRemoved)){
            data.hamnskifteRemoved = [];
          }
          if(data.darkPastSuppressed === undefined){
            data.darkPastSuppressed = false;
          }
          if(!data.notes){
            data.notes = defaultNotes();
          }
          if(data.forcedDefense === undefined){
            data.forcedDefense = '';
          }
          if(data.nilasPopupShown === undefined){
            data.nilasPopupShown = false;
          }
          const charMeta = chars.find(c => c && c.id === id);
          const prefix = makeCustomIdPrefix(charMeta?.name, id);
          const { entries: sanitizedCustom, idMap } = sanitizeCustomEntries(data.custom, { usedIds: usedCustomIds, prefix });
          if (JSON.stringify(sanitizedCustom) !== JSON.stringify(data.custom || [])) {
            mutated = true;
          }
          data.custom = sanitizedCustom;
          const expandedInventory = expandInventory(data.inventory, data.custom, idMap);
          if (JSON.stringify(expandedInventory) !== JSON.stringify(data.inventory || [])) {
            mutated = true;
          }
          data.inventory = expandedInventory;
          if (idMap.size && Array.isArray(data.revealedArtifacts)) {
            const updatedArtifacts = data.revealedArtifacts.map(n => idMap.get(n) || n);
            if (JSON.stringify(updatedArtifacts) !== JSON.stringify(data.revealedArtifacts)) {
              data.revealedArtifacts = [...new Set(updatedArtifacts)];
              mutated = true;
            }
          }
          store.data[id] = data;
        });
        if (mutated) save(store);
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

  function genId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch {}
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function migrateInventoryIds(store) {
    try {
      if (!store.data || typeof store.data !== 'object') return;
      let changed = false;
      Object.values(store.data).forEach(data => {
        const custom = data.custom || [];
        custom.forEach(c => { if (!c.id) { c.id = genId(); changed = true; } });
        const migrateRow = row => {
          if (!row || typeof row !== 'object') return;
          const entry = custom.find(e => e.id === row.id || e.namn === row.name)
            || (global.DB || []).find(e => e.id === row.id || e.namn === row.name);
          if (entry) {
            if (row.id !== entry.id) { row.id = entry.id; changed = true; }
            if (row.name !== entry.namn) { row.name = entry.namn; changed = true; }
          }
          if (Array.isArray(row.contains)) row.contains.forEach(migrateRow);
        };
        (data.inventory || []).forEach(migrateRow);
        if (Array.isArray(data.revealedArtifacts)) {
          const updated = data.revealedArtifacts.map(n => {
            const ent = custom.find(e => e.id === n || e.namn === n)
              || (global.DBIndex && global.DBIndex[n])
              || (global.DB && global.DB[n]);
            return ent?.id || n;
          });
          if (JSON.stringify(updated) !== JSON.stringify(data.revealedArtifacts)) {
            data.revealedArtifacts = [...new Set(updated)];
            changed = true;
          }
        }
      });
      if (changed) save(store);
    } catch {}
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

  function applyDarkBloodEffects(store, list) {
    const hasDark = list.some(x => x.namn === 'Mörkt blod');
    const idxBest = list.findIndex(x => x.namn === 'Mörkt förflutet');
    const data = store.data[store.current] || {};
    const suppressed = !!data.darkPastSuppressed;

    if (hasDark) {
      if (idxBest < 0 && !suppressed) {
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
    const prev = store.data[store.current]?.list || [];
    // Hantera undertryckning av Mörkt förflutet när Mörkt blod finns kvar
    try {
      const hadDark = prev.some(x => x.namn === 'Mörkt blod');
      const hasDark = list.some(x => x.namn === 'Mörkt blod');
      const hadPast = prev.some(x => x.namn === 'Mörkt förflutet');
      const hasPast = list.some(x => x.namn === 'Mörkt förflutet');
      store.data[store.current] = store.data[store.current] || {};
      if (!hasDark) {
        // Om Mörkt blod tagits bort: återställ suppression så att förflutet kan auto-läggas igen vid nytt val
        store.data[store.current].darkPastSuppressed = false;
      } else if (hadDark && hadPast && !hasPast) {
        // Om användaren tog bort Mörkt förflutet medan Mörkt blod är kvar: undertryck auto-återläggning
        store.data[store.current].darkPastSuppressed = true;
      }
    } catch {}

    applyDarkBloodEffects(store, list);
    applyRaceTraits(list);
    enforceEarthbound(list);
    enforceDwarf(list);
    enforcePackAnimal(list);
    applyHamnskifteTraits(store, list);
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
    const usedIds = collectUsedCustomIds(store, store.current);
    const char = (store.characters || []).find(c => c.id === store.current);
    const prefix = makeCustomIdPrefix(char?.name, store.current);
    const { entries: sanitized, idMap } = sanitizeCustomEntries(list, { usedIds, prefix });
    store.data[store.current].custom = sanitized;
    store.data[store.current].inventory = expandInventory(
      store.data[store.current].inventory,
      sanitized,
      idMap
    );
    if (idMap.size && Array.isArray(store.data[store.current].revealedArtifacts)) {
      store.data[store.current].revealedArtifacts = [...new Set(
        store.data[store.current].revealedArtifacts.map(n => idMap.get(n) || n)
      )];
    }
    save(store);
    return { entries: sanitized, idMap };
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
    const newName = `${char.name} (kopia)`;
    store.characters.push({ id: newId, name: newName, folderId: char.folderId || '' });
    const data = store.data[sourceId] ? JSON.parse(JSON.stringify(store.data[sourceId])) : {};
    const usedIds = collectUsedCustomIds(store, newId);
    const prefix = makeCustomIdPrefix(newName, newId);
    const { entries: custom, idMap } = sanitizeCustomEntries(data.custom, { usedIds, prefix });
    data.custom = custom;
    data.inventory = expandInventory(data.inventory, custom, idMap);
    if (idMap.size && Array.isArray(data.revealedArtifacts)) {
      data.revealedArtifacts = [...new Set(data.revealedArtifacts.map(n => idMap.get(n) || n))];
    }
    store.data[newId] = data;
    save(store);
    return newId;
  }

  function renameCharacter(store, charId, newName) {
    if (!charId || !newName) return;
    const char = store.characters.find(c => c.id === charId);
    if (!char) return;
    char.name = newName;
    const data = store.data?.[charId];
    if (data) {
      const usedIds = collectUsedCustomIds(store, charId);
      const prefix = makeCustomIdPrefix(newName, charId);
      const { entries: custom, idMap } = sanitizeCustomEntries(data.custom, { usedIds, prefix });
      data.custom = custom;
      data.inventory = expandInventory(data.inventory, custom, idMap);
      if (idMap.size && Array.isArray(data.revealedArtifacts)) {
        data.revealedArtifacts = [...new Set(data.revealedArtifacts.map(n => idMap.get(n) || n))];
      }
    }
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

  // Radera alla karaktärer i en specifik mapp
  function deleteCharactersInFolder(store, folderId) {
    try {
      const fid = String(folderId || '');
      const toDelete = (store.characters || [])
        .filter(c => (c && (c.folderId || '')) === fid)
        .map(c => c.id);
      if (!toDelete.length) return 0;
      const idSet = new Set(toDelete);
      // Ta bort poster från listan och datat
      store.characters = (store.characters || []).filter(c => c && !idSet.has(c.id));
      toDelete.forEach(id => { try { delete store.data[id]; } catch {} });
      if (store.current && idSet.has(store.current)) store.current = '';
      save(store);
      return toDelete.length;
    } catch {
      return 0;
    }
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

  function addRevealedArtifact(store, id) {
    if (!store.current || !id) return;
    store.data[store.current] = store.data[store.current] || {};
    const set = new Set(store.data[store.current].revealedArtifacts || []);
    set.add(id);
    store.data[store.current].revealedArtifacts = [...set];
    save(store);
  }

  function removeRevealedArtifact(store, id) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const list = store.data[store.current].revealedArtifacts || [];
    store.data[store.current].revealedArtifacts = list.filter(n => n !== id);
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
      if (isHiddenTags(tagTyp) && it.id) keep.add(it.id);
    });

    // Keep any hidden items that still exist in the inventory (recursively)
    const collect = arr => {
        arr.forEach(row => {
          const entry = (getCustomEntries(store).find(e => e.id === row.id || e.namn === row.name))
            || (global.DB || []).find(e => e.id === row.id || e.namn === row.name) || {};
          const tagTyp = entry.taggar?.typ || [];
          if (isHiddenTags(tagTyp) && entry.id) keep.add(entry.id);
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
    return oToMoney(moneyToO(res));
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

  function calcDarkPastPermanentCorruption(list, thresh) {
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
    if (obj.darkPastSuppressed === false) delete obj.darkPastSuppressed;
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
    if (!Array.isArray(inv)) return [];
    return inv.map(row => {
      if (!row || typeof row !== 'object') return row;
      const res = {};
      if (row.id !== undefined) res.i = row.id;
      const entryName = row.name || (row.id !== undefined && window.DB && window.DB[row.id]?.namn) || '';
      if (entryName) res.n = entryName;
      if (row.qty && row.qty !== 1) res.q = row.qty;
      if (row.gratis) res.g = row.gratis;
      if (row.kvaliteter && row.kvaliteter.length) res.k = row.kvaliteter;
      if (row.gratisKval && row.gratisKval.length) res.gk = row.gratisKval;
      if (row.removedKval && row.removedKval.length) res.rk = row.removedKval;
      if (row.artifactEffect === 'xp' || row.artifactEffect === 'corruption') res.e = row.artifactEffect;
      if (row.nivå) res.l = row.nivå;
      if (row.trait) res.t = row.trait;
      if (row.perk) res.pk = row.perk;
      if (row.perkGratis) res.pg = row.perkGratis;
      if (row.vikt !== undefined) {
        const weight = Number(row.vikt);
        if (Number.isFinite(weight)) res.w = weight;
      }
      if (row.basePrice && typeof row.basePrice === 'object') {
        const src = {
          daler: row.basePrice.daler ?? row.basePrice.d,
          skilling: row.basePrice.skilling ?? row.basePrice.s,
          'örtegar': row.basePrice['örtegar'] ?? row.basePrice.o
        };
        if (['daler','skilling','örtegar','d','s','o'].some(k => row.basePrice[k] !== undefined)) {
          res.bp = sanitizeMoneyStruct(src);
        }
      }
      if (row.priceMult !== undefined) {
        const mult = Number(row.priceMult);
        if (Number.isFinite(mult) && mult !== 1) res.pm = mult;
      }
      if (Array.isArray(row.contains) && row.contains.length) {
        res.c = compressInventory(row.contains);
      }
      return res;
    });
  }

  function expandInventory(inv, customEntries = [], idMap = null) {
    const customs = Array.isArray(customEntries) ? customEntries : [];
    const customById = new Map();
    const customByName = new Map();
    customs.forEach(ent => {
      if (!ent || typeof ent !== 'object') return;
      if (ent.id) customById.set(ent.id, ent);
      if (ent.namn) customByName.set(ent.namn, ent);
    });
    const sanitizeCount = (value, fallback) => {
      const num = Math.floor(Number(value));
      if (!Number.isFinite(num)) return fallback;
      if (fallback === 1) return num > 0 ? num : 1;
      return num >= 0 ? num : fallback;
    };
    const expandRows = rows => {
      if (!Array.isArray(rows)) return [];
      return rows.map(row => {
        if (!row || typeof row !== 'object') {
          return { id: undefined, name: '', qty: 1, gratis: 0, kvaliteter: [], gratisKval: [], removedKval: [] };
        }
        // Determine matching entry from DB or custom definitions
        const rawId = row.id !== undefined ? row.id : row.i;
        const mappedId = (idMap && rawId !== undefined) ? idMap.get(rawId) : undefined;
        const effectiveId = mappedId !== undefined ? mappedId : rawId;
        const rawName = row.name || row.n || '';
        const entry = (effectiveId !== undefined && ((window.DB && window.DB[effectiveId]) || customById.get(effectiveId)))
          || (rawName ? ((window.DBIndex && window.DBIndex[rawName]) || customByName.get(rawName)) : undefined);
        const resolvedId = entry?.id !== undefined ? entry.id : (effectiveId !== undefined ? effectiveId : undefined);
        const resolvedName = entry?.namn || rawName || '';
        const qty = sanitizeCount(row.qty ?? row.q, 1);
        const gratis = sanitizeCount(row.gratis ?? row.g, 0);
        const kvaliteter = Array.isArray(row.kvaliteter ?? row.k)
          ? [...(row.kvaliteter ?? row.k)]
          : [];
        const gratisKval = Array.isArray(row.gratisKval ?? row.gk)
          ? [...(row.gratisKval ?? row.gk)]
          : [];
        const removedKval = Array.isArray(row.removedKval ?? row.rk)
          ? [...(row.removedKval ?? row.rk)]
          : [];
        const artifactEffectRaw = row.artifactEffect ?? row.e ?? entry?.artifactEffect ?? '';
        const artifactEffect = artifactEffectRaw === 'xp' || artifactEffectRaw === 'corruption'
          ? artifactEffectRaw
          : '';
        const expanded = {
          id: resolvedId,
          name: resolvedName,
          qty,
          gratis,
          kvaliteter,
          gratisKval,
          removedKval,
          artifactEffect
        };
        const nivå = row.nivå ?? row.l;
        if (nivå !== undefined) expanded.nivå = nivå;
        const trait = row.trait ?? row.t;
        if (trait !== undefined) expanded.trait = trait;
        const perk = row.perk ?? row.pk;
        if (perk) expanded.perk = perk;
        const perkGratis = sanitizeCount(row.perkGratis ?? row.pg, 0);
        if (perkGratis) expanded.perkGratis = perkGratis;
        const weightRaw = row.vikt ?? row.w;
        if (weightRaw !== undefined) {
          const weightNum = Number(weightRaw);
          if (Number.isFinite(weightNum)) expanded.vikt = weightNum;
        }
        const basePriceRaw = row.basePrice ?? row.bp;
        if (basePriceRaw && typeof basePriceRaw === 'object') {
          const src = {
            daler: basePriceRaw.daler ?? basePriceRaw.d,
            skilling: basePriceRaw.skilling ?? basePriceRaw.s,
            'örtegar': basePriceRaw['örtegar'] ?? basePriceRaw.o
          };
          if (['daler','skilling','örtegar','d','s','o'].some(k => basePriceRaw[k] !== undefined)) {
            expanded.basePrice = sanitizeMoneyStruct(src);
          }
        }
        const priceMultRaw = row.priceMult ?? row.pm;
        if (priceMultRaw !== undefined) {
          const mult = Number(priceMultRaw);
          if (Number.isFinite(mult) && mult !== 1) {
            expanded.priceMult = mult;
          }
        }
        const contains = row.contains ?? row.c;
        if (Array.isArray(contains) && contains.length) {
          expanded.contains = expandRows(contains);
        }
        return expanded;
      });
    };
    return expandRows(inv);
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
      const usedIds = collectUsedCustomIds(store);
      const prefix = makeCustomIdPrefix(obj.name || '', id);
      const { entries: custom, idMap } = sanitizeCustomEntries(data.custom, { usedIds, prefix });
      data.list = expandList(data.list);
      data.inventory = expandInventory(data.inventory, custom, idMap);
      if (idMap.size && Array.isArray(data.revealedArtifacts)) {
        data.revealedArtifacts = [...new Set(data.revealedArtifacts.map(n => idMap.get(n) || n))];
      }
      store.data[id] = {
        custom: [],
        artifactEffects: defaultArtifactEffects(),
        bonusMoney: defaultMoney(),
        privMoney: defaultMoney(),
        possessionMoney: defaultMoney(),
        possessionRemoved: 0,
        notes: defaultNotes(),
        ...data,
        custom,
        inventory: data.inventory
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

  function sortFoldersForOrder(folders) {
    return (Array.isArray(folders) ? folders.slice() : [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || '').localeCompare(String(b.name || ''), 'sv'));
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
      const remaining = folders.filter(f => f.id !== id);
      const normalized = sortFoldersForOrder(remaining);
      normalized.forEach((f, idx) => { f.order = idx; });
      store.folders = normalized;
      // flytta karaktärer till systemmappen "Standard"
      const destId = standard ? standard.id : '';
      store.characters = (store.characters || []).map(c => (
        c && c.folderId === id ? { ...c, folderId: destId } : c
      ));
      save(store);
    },
    moveFolder: (store, id, offset) => {
      try {
        if (!id) return;
        const step = Number(offset) || 0;
        if (!step) return;
        const folders = Array.isArray(store.folders) ? store.folders : [];
        if (!folders.length) return;
        const ordered = sortFoldersForOrder(folders);
        const index = ordered.findIndex(f => f.id === id);
        if (index < 0) return;
        const targetIndex = index + step;
        if (targetIndex < 0 || targetIndex >= ordered.length) return;
        const [item] = ordered.splice(index, 1);
        ordered.splice(targetIndex, 0, item);
        ordered.forEach((f, idx) => { f.order = idx; });
        store.folders = ordered;
        save(store);
      } catch {}
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
    migrateInventoryIds,
    genId,
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
    calcDarkPastPermanentCorruption,
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
    deleteCharactersInFolder,
    deleteAllCharacters,
    getDependents,
    HAMNSKIFTE_NAMES,
    HAMNSKIFTE_BASE,
    DARK_BLOOD_TRAITS
  };
})(window);
