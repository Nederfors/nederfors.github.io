/* ===========================================================
   js/store.js
   • Ett enda, centralt hjälpbibliotek för data­lagring
   • Hanterar roll­personer, valda förmågor, inventarie
   • XP-beräkning enligt dina regler
   =========================================================== */
(function (global) {
  const STORAGE_KEY = 'rpall';
  const STORAGE_META_KEY = 'rpall-meta';
  const STORAGE_CHAR_PREFIX = 'rpall-char-';

  const charStorageKey = (id) => `${STORAGE_CHAR_PREFIX}${id}`;

  const runtimeVersions = {
    custom: 0,
    revealed: 0
  };

  const bumpRuntimeVersion = (key) => {
    if (!Object.prototype.hasOwnProperty.call(runtimeVersions, key)) {
      runtimeVersions[key] = 0;
    }
    runtimeVersions[key] += 1;
  };

  const getRuntimeVersion = (key) => runtimeVersions[key] || 0;

  const getCustomEntriesVersionMeta = () => getRuntimeVersion('custom');
  const getRevealedArtifactsVersionMeta = () => getRuntimeVersion('revealed');

  const extractMeta = (store) => ({
    current: store.current || '',
    characters: Array.isArray(store.characters) ? store.characters : [],
    folders: Array.isArray(store.folders) ? store.folders : [],
    activeFolder: store.activeFolder || 'ALL',
    filterUnion: Boolean(store.filterUnion),
    compactEntries: Boolean(store.compactEntries),
    onlySelected: Boolean(store.onlySelected),
    recentSearches: Array.isArray(store.recentSearches) ? store.recentSearches.slice(0, MAX_RECENT_SEARCHES) : []
  });

  function persistMeta(store) {
    try {
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(extractMeta(store)));
    } catch {}
  }

  function persistCharacter(store, charId) {
    if (!charId) return;
    const data = store.data?.[charId];
    const key = charStorageKey(charId);
    try {
      if (!data) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }

  const persistCurrentCharacter = (store) => {
    if (store.current) persistCharacter(store, store.current);
  };

  const MAX_RECENT_SEARCHES = 10;

  function save(store, options = {}) {
    const { meta = true, charIds, allCharacters = false } = options || {};
    if (meta) persistMeta(store);
    if (allCharacters) {
      Object.keys(store?.data || {}).forEach(id => persistCharacter(store, id));
      return;
    }
    if (Array.isArray(charIds) && charIds.length) {
      charIds.forEach(id => persistCharacter(store, id));
      return;
    }
    persistCurrentCharacter(store);
  }

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
    const skip = new Set(['artefakt','lägre artefakt','kuriositet','skatt','hemmagjort']);
    const normalize = (value) => {
      if (typeof value !== 'string') return '';
      return value.trim().toLowerCase();
    };
    try {
      const db = global.DB || [];
      db.forEach(e => {
        const typs = e?.taggar?.typ || [];
        if (typs.includes('Vapen')) {
          typs.forEach(t => {
            const key = normalize(t);
            if (!key || key === 'vapen' || key === 'sköld' || skip.has(key)) return;
            const label = String(t).trim();
            if (label) weapon.add(label);
          });
        }
        if (typs.includes('Rustning')) {
          typs.forEach(t => {
            const key = normalize(t);
            if (!key || key === 'rustning' || skip.has(key)) return;
            const label = String(t).trim();
            if (label) armor.add(label);
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

  function normalizeCharacterData(store, id, source, charMeta, usedCustomIds) {
    const base = (source && typeof source === 'object') ? { ...source } : {};
    if (typeof base.partyAlchemist === 'boolean') {
      base.partyAlchemist = base.partyAlchemist ? 'Mästare' : '';
    }
    if (typeof base.partySmith === 'boolean') {
      base.partySmith = base.partySmith ? 'Mästare' : '';
    }
    if (typeof base.partyArtefacter === 'boolean') {
      base.partyArtefacter = base.partyArtefacter ? 'Mästare' : '';
    }

    const data = {
      custom: [],
      artifactEffects: { xp: 0, corruption: 0 },
      bonusMoney: defaultMoney(),
      privMoney: defaultMoney(),
      possessionMoney: defaultMoney(),
      possessionRemoved: 0,
      hamnskifteRemoved: [],
      forcedDefense: '',
      notes: defaultNotes(),
      darkPastSuppressed: false,
      nilasPopupShown: false,
      ...base
    };

    let mutated = false;

    if (!data.artifactEffects) {
      data.artifactEffects = { xp: 0, corruption: 0 };
      mutated = true;
    }
    if (!data.bonusMoney) {
      data.bonusMoney = defaultMoney();
      mutated = true;
    }
    if (!data.privMoney) {
      data.privMoney = defaultMoney();
      mutated = true;
    }
    if (!data.possessionMoney) {
      data.possessionMoney = defaultMoney();
      mutated = true;
    }
    if (!data.possessionRemoved) {
      data.possessionRemoved = 0;
    }
    if (!Array.isArray(data.hamnskifteRemoved)) {
      data.hamnskifteRemoved = [];
      mutated = true;
    }
    if (data.darkPastSuppressed === undefined) {
      data.darkPastSuppressed = false;
      mutated = true;
    }
    if (!data.notes) {
      data.notes = defaultNotes();
      mutated = true;
    }
    if (data.forcedDefense === undefined) {
      data.forcedDefense = '';
      mutated = true;
    }
    if (data.nilasPopupShown === undefined) {
      data.nilasPopupShown = false;
      mutated = true;
    }

    const chars = Array.isArray(store.characters) ? store.characters : [];
    const charInfo = charMeta || chars.find(c => c && c.id === id) || null;
    const prefix = makeCustomIdPrefix(charInfo?.name, id);
    const beforeCustom = JSON.stringify(data.custom || []);
    const { entries: sanitizedCustom, idMap } = sanitizeCustomEntries(data.custom, { usedIds: usedCustomIds, prefix });
    if (JSON.stringify(sanitizedCustom) !== beforeCustom) {
      mutated = true;
    }
    data.custom = sanitizedCustom;

    const beforeInventory = JSON.stringify(data.inventory || []);
    const expandedInventory = expandInventory(data.inventory, data.custom, idMap);
    if (JSON.stringify(expandedInventory) !== beforeInventory) {
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

    return { data, mutated };
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
      const metaRaw = localStorage.getItem(STORAGE_META_KEY);
      const legacyRaw = localStorage.getItem(STORAGE_KEY);

      if (metaRaw) {
        const metaParsed = JSON.parse(metaRaw);
        const store = { ...emptyStore(), ...metaParsed };
        store.data = {};
        const chars = Array.isArray(store.characters) ? store.characters : [];
        const usedCustomIds = new Set();
        const mutatedIds = new Set();
        chars.forEach(char => {
          if (!char || !char.id) return;
          let charData = {};
          try {
            const raw = localStorage.getItem(charStorageKey(char.id));
            charData = raw ? JSON.parse(raw) : {};
          } catch {}
          const { data, mutated } = normalizeCharacterData(store, char.id, charData, char, usedCustomIds);
          store.data[char.id] = data;
          if (mutated) mutatedIds.add(char.id);
        });

        let metaMutated = false;
        if (!Array.isArray(store.folders)) {
          store.folders = [];
          metaMutated = true;
        }
        if (!store.activeFolder || store.activeFolder === '') {
          store.activeFolder = 'ALL';
          metaMutated = true;
        }
        metaMutated = ensureSystemFolderAndMigrate(store) || metaMutated;

        if (metaMutated) persistMeta(store);
        mutatedIds.forEach(id => persistCharacter(store, id));
        return store;
      }

      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) || emptyStore();
        const store = { ...emptyStore(), ...parsed };
        if (!store.data || typeof store.data !== 'object') store.data = {};
        const chars = Array.isArray(store.characters) ? store.characters : [];
        const usedCustomIds = new Set();
        Object.keys(store.data).forEach(id => {
          const meta = chars.find(c => c && c.id === id) || null;
          const { data } = normalizeCharacterData(store, id, store.data[id] || {}, meta, usedCustomIds);
          store.data[id] = data;
        });
        if (!Array.isArray(store.folders)) store.folders = [];
        if (!store.activeFolder || store.activeFolder === '') store.activeFolder = 'ALL';
        ensureSystemFolderAndMigrate(store);
        persistMeta(store);
        Object.keys(store.data).forEach(id => persistCharacter(store, id));
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        return store;
      }

      const store = emptyStore();
      persistMeta(store);
      return store;
    } catch {
      return emptyStore();
    }
  }

  // Skapa/finn systemmappen "Standard" och migrera karaktärer utan giltig mapp
  function ensureSystemFolderAndMigrate(store){
    let mutated = false;
    try {
      const beforeFolders = JSON.stringify(Array.isArray(store.folders) ? store.folders : []);
      const beforeChars = JSON.stringify(Array.isArray(store.characters) ? store.characters : []);

      store.folders = Array.isArray(store.folders) ? [...store.folders] : [];

      let standard = store.folders.find(f => f && (f.system === true));
      if (!standard) {
        standard = store.folders.find(f => (f?.name === 'Standard'));
      }
      if (!standard) {
        const id = 'fd-standard-' + Math.floor(Math.random() * 1000000);
        standard = { id, name: 'Standard', order: 0, system: true };
        store.folders.unshift(standard);
      } else {
        if (!standard.system) {
          standard.system = true;
        }
        if (standard.order === undefined) standard.order = 0;
      }

      const folderIds = new Set(store.folders.map(f => f.id));
      const chars = Array.isArray(store.characters) ? store.characters : [];
      const migratedChars = chars.map(c => {
        if (!c || !c.id) return c;
        const fid = c.folderId || '';
        if (!fid || !folderIds.has(fid)) {
          return { ...c, folderId: standard.id };
        }
        return c;
      });
      store.characters = migratedChars;

      const afterFolders = JSON.stringify(store.folders);
      const afterChars = JSON.stringify(store.characters);
      mutated = mutated || afterFolders !== beforeFolders || afterChars !== beforeChars;
    } catch {}
    return mutated;
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
      const changedIds = new Set();
      Object.entries(store.data).forEach(([id, data]) => {
        const custom = data.custom || [];
        custom.forEach(c => {
          if (!c.id) {
            c.id = genId();
            changedIds.add(id);
          }
        });
        const migrateRow = row => {
          if (!row || typeof row !== 'object') return;
          const entry = custom.find(e => e.id === row.id || e.namn === row.name)
            || (typeof global.lookupEntry === 'function'
              ? global.lookupEntry({ id: row.id, name: row.name })
              : null);
          if (entry) {
            if (row.id !== entry.id) { row.id = entry.id; changedIds.add(id); }
            if (row.name !== entry.namn) { row.name = entry.namn; changedIds.add(id); }
          }
          if (Array.isArray(row.contains)) row.contains.forEach(migrateRow);
        };
        (data.inventory || []).forEach(migrateRow);
        if (Array.isArray(data.revealedArtifacts)) {
          const updated = data.revealedArtifacts.map(n => {
            const ent = custom.find(e => e.id === n || e.namn === n)
              || (typeof global.lookupEntry === 'function'
                ? global.lookupEntry({ id: n, name: n })
                : null);
            return ent?.id || n;
          });
          if (JSON.stringify(updated) !== JSON.stringify(data.revealedArtifacts)) {
            data.revealedArtifacts = [...new Set(updated)];
            changedIds.add(id);
          }
        }
      });
      changedIds.forEach(charId => persistCharacter(store, charId));
    } catch {}
  }

  /* ---------- 2b. Senaste sökningar ---------- */
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
    persistMeta(store);
  }

  /* ---------- 3. Förmåge­lista per karaktär ---------- */
  function getCurrentList(store) {
    if (!store.current) return [];
    const list = store.data[store.current]?.list || [];
    return list.map(x => ({ ...x }));
  }

  function normalizeRaceName(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed || '';
  }

  function getCharacterRaces(store) {
    if (!store || !store.current) return { base: '', blood: [] };
    const data = store.data?.[store.current] || {};
    const list = Array.isArray(data.list) ? data.list : [];
    const baseEntry = list.find(entry => Array.isArray(entry?.taggar?.typ) && entry.taggar.typ.includes('Ras'));
    const base = normalizeRaceName(baseEntry?.namn);
    const blood = Array.from(new Set(list
      .filter(entry => entry && entry.namn === 'Blodsband' && entry.race)
      .map(entry => normalizeRaceName(entry.race))
      .filter(Boolean)
    ));
    return { base, blood };
  }

  function applyDarkBloodEffects(store, list) {
    const hasDark = list.some(x => x.namn === 'Mörkt blod');
    const idxBest = list.findIndex(x => x.namn === 'Mörkt förflutet');
    const data = store.data[store.current] || {};
    const suppressed = !!data.darkPastSuppressed;

    if (hasDark) {
      if (idxBest < 0 && !suppressed) {
        const entry = lookupEntry({ name: 'Mörkt förflutet' });
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
        const entry = lookupEntry({ id: base, name: base });
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
    const ent = typeof entry === 'string' ? lookupEntry({ id: entry, name }) : entry;
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

    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    bumpRuntimeVersion('custom');
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
    if (idMap.size) bumpRuntimeVersion('revealed');
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
  }

  function incrementPossessionRemoved(store) {
    if (!store.current) return 0;
    store.data[store.current] = store.data[store.current] || {};
    const cur = Number(store.data[store.current].possessionRemoved || 0) + 1;
    store.data[store.current].possessionRemoved = cur;
    persistCurrentCharacter(store);
    return cur;
  }

  function resetPossessionRemoved(store) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].possessionRemoved = 0;
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistMeta(store);
    persistCharacter(store, newId);
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
    persistMeta(store);
    if (store.data[charId]) persistCharacter(store, charId);
  }

  function deleteCharacter(store, charId) {
    if (!charId) return;
    store.characters = store.characters.filter(c => c.id !== charId);
    delete store.data[charId];
    if (store.current === charId) store.current = '';
    persistMeta(store);
    persistCharacter(store, charId);
  }

  function deleteAllCharacters(store) {
    const prevIds = Array.isArray(store.characters) ? store.characters.map(c => c.id).filter(Boolean) : [];
    store.characters = [];
    store.data = {};
    store.current = '';
    persistMeta(store);
    prevIds.forEach(id => persistCharacter(store, id));
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
      persistMeta(store);
      toDelete.forEach(id => persistCharacter(store, id));
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
  }

  function getFilterUnion(store) {
    return Boolean(store.filterUnion);
  }

  function setFilterUnion(store, val) {
    store.filterUnion = Boolean(val);
    persistMeta(store);
  }

  function getCompactEntries(store) {
    return Boolean(store.compactEntries);
  }

  function setCompactEntries(store, val) {
    store.compactEntries = Boolean(val);
    persistMeta(store);
  }

  function getOnlySelected(store) {
    return Boolean(store.onlySelected);
  }

  function setOnlySelected(store, val) {
    store.onlySelected = Boolean(val);
    persistMeta(store);
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
    persistCurrentCharacter(store);
    bumpRuntimeVersion('revealed');
  }

  function removeRevealedArtifact(store, id) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const list = store.data[store.current].revealedArtifacts || [];
    store.data[store.current].revealedArtifacts = list.filter(n => n !== id);
    persistCurrentCharacter(store);
    bumpRuntimeVersion('revealed');
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
            || (typeof global.lookupEntry === 'function'
              ? global.lookupEntry({ id: row.id, name: row.name })
              : {})
            || {};
          const tagTyp = entry.taggar?.typ || [];
          if (isHiddenTags(tagTyp) && entry.id) keep.add(entry.id);
          if (Array.isArray(row.contains)) collect(row.contains);
        });
      };
    collect(getInventory(store));
    const cur = getRevealedArtifacts(store);
    store.data[store.current].revealedArtifacts = cur.filter(n => keep.has(n));
    bumpRuntimeVersion('revealed');
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
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
    persistCurrentCharacter(store);
  }

  const RITUAL_COST = 10;
  const ADVANTAGE_STEP_COST = 5;

  const ELITE_TO_BASE_MAGIC = {
    'Templár': 'Teurgi',
    'Stavmagiker': 'Ordensmagi',
    'Andebesvärjare': 'Häxkonst',
    'Blodvadare': 'Häxkonst',
    'Demonolog': 'Svartkonst',
    'Grönvävare': 'Häxkonst',
    'Illusionist': 'Ordensmagi',
    'Inkvisitor': 'Teurgi',
    'Mentalist': 'Ordensmagi',
    'Nekromantiker': 'Svartkonst',
    'Pyromantiker': 'Ordensmagi',
    'Själasörjare': 'Teurgi'
  };

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
    const entry = typeof global.lookupEntry === 'function'
      ? global.lookupEntry({ id: base, name: base })
      : null;
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
        const baseTrad = ELITE_TO_BASE_MAGIC[tr] || tr;
        const abilityName = TRAD_TO_SKILL[baseTrad] || TRAD_TO_SKILL[tr];
        if (abilityName) {
          lvl = Math.max(lvl, abilityLevel(list, abilityName));
        }
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
    const entries = Array.isArray(list) ? list : [];
    const advantageCounts = new Map();

    entries.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const types = (item.taggar?.typ || []).map(t => t.toLowerCase());

      if (item.nivåer && ['mystisk kraft','förmåga','särdrag','monstruöst särdrag']
          .some(t => types.includes(t))) {
        let cost = isFreeMonsterTrait(entries, item)
          ? 0
          : (XP_LADDER[item.nivå || 'Novis'] || 0);
        cost = Math.max(0, cost - monsterTraitDiscount(entries, item));
        xp += cost;

      } else if (types.includes('monstruöst särdrag')) {
        let cost = isFreeMonsterTrait(entries, item) ? 0 : RITUAL_COST;
        cost = Math.max(0, cost - monsterTraitDiscount(entries, item));
        xp += cost;
      }

      const advKey = getAdvantageKey(item, types);
      if (advKey) {
        advantageCounts.set(advKey, (advantageCounts.get(advKey) || 0) + 1);
      }

      if (types.includes('ritual')) xp += RITUAL_COST;
    });

    advantageCounts.forEach(count => {
      xp += advantageTotalCost(count);
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

  function getAdvantageKey(entry, types) {
    if (!entry || typeof entry !== 'object') return null;
    const rawTypes = Array.isArray(types)
      ? types
      : (Array.isArray(entry?.taggar?.typ)
        ? entry.taggar.typ.map(t => String(t).trim().toLowerCase())
        : []);
    if (!rawTypes.some(t => t === 'fördel')) return null;
    const idStr = typeof entry.id === 'string' ? entry.id.trim() : '';
    const nameStr = typeof entry.namn === 'string' ? entry.namn.trim() : '';
    const id = idStr ? idStr.toLowerCase() : '';
    const name = nameStr ? nameStr.toLowerCase() : '';
    const extras = ['trait', 'race']
      .map(key => {
        const value = entry[key];
        if (value === undefined || value === null) return '';
        const str = String(value).trim();
        return str ? `${key}:${str.toLowerCase()}` : '';
      })
      .filter(Boolean);
    if (!id && !name && !extras.length) return null;
    const parts = [];
    if (id) parts.push(id);
    if (name) parts.push(name);
    if (extras.length) parts.push(...extras);
    return parts.join('#');
  }

  function advantageTotalCost(count) {
    const qty = Number(count) || 0;
    if (qty <= 0) return 0;
    if (qty <= 1) return ADVANTAGE_STEP_COST;
    if (qty === 2) return ADVANTAGE_STEP_COST * 2;
    return ADVANTAGE_STEP_COST * 3;
  }

  function resolveAdvantageCount(entry, list, types) {
    const key = getAdvantageKey(entry, types);
    if (!key) return null;
    const arr = Array.isArray(list) ? list : [];
    let count = 0;
    let includesEntry = false;
    arr.forEach(item => {
      if (getAdvantageKey(item) === key) {
        count += 1;
        if (!includesEntry && item === entry) includesEntry = true;
      }
    });
    const effectiveCount = includesEntry ? count : count + 1;
    return { key, count, effectiveCount };
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
    if (types.includes('fördel')) {
      const advantageInfo = resolveAdvantageCount(entry, list, types);
      if (advantageInfo) {
        xp += advantageTotalCost(advantageInfo.effectiveCount);
      } else {
        xp += ADVANTAGE_STEP_COST;
      }
    }
    if (types.includes('ritual')) xp += RITUAL_COST;
    return xp;
  }

  function stackableDisplayKey(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (!entry.kan_införskaffas_flera_gånger) return null;
    if (entry.trait) return null;
    const types = Array.isArray(entry?.taggar?.typ)
      ? entry.taggar.typ.map(t => String(t).trim().toLowerCase())
      : [];
    if (!types.length) return null;
    const hasAdvantage = types.includes('fördel');
    const hasDisadvantage = types.includes('nackdel');
    if (!hasAdvantage && !hasDisadvantage) return null;
    const name = typeof entry.namn === 'string' ? entry.namn.trim().toLowerCase() : '';
    if (!name) return null;
    if (hasAdvantage) {
      const advKey = getAdvantageKey(entry, types);
      if (advKey) return `adv:${advKey}`;
      return `adv:${name}`;
    }
    return `dis:${name}`;
  }

  function calcEntryDisplayXP(entry, list, options = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const baseList = Array.isArray(list) ? list.filter(Boolean) : [];
    const { xpSource: providedSource, level } = options || {};
    const baseSource = providedSource || entry;
    const xpSource = (level && (!baseSource || baseSource.nivå !== level))
      ? { ...baseSource, nivå: level }
      : baseSource;
    const stackKey = stackableDisplayKey(entry);
    let filtered = [];
    if (stackKey) {
      filtered = baseList.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const itemKey = stackableDisplayKey(item);
        if (!itemKey) return true;
        if (itemKey !== stackKey) return true;
        return item === xpSource;
      });
    } else {
      filtered = baseList.slice();
    }
    if (xpSource && !filtered.includes(xpSource)) {
      filtered.push(xpSource);
    }
    return calcEntryXP(xpSource, filtered);
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
      if (it && (it.id !== undefined || it.namn)) {
        const entry = typeof global.lookupEntry === 'function'
          ? global.lookupEntry({ id: it.id, name: it.namn })
          : null;
        if (entry) {
          const row = entry.id !== undefined ? { i: entry.id } : { n: entry.namn };
          if (it.nivå) row.l = it.nivå;
          if (it.trait) row.t = it.trait;
          if (it.race) row.r = it.race;
          if (it.form) row.f = it.form;
          return row;
        }
      }
      return it;
    });
  }

  function expandList(list) {
    return (list || []).map(it => {
      if (it && it.i !== undefined) {
        const hitById = typeof global.lookupEntry === 'function'
          ? global.lookupEntry({ id: it.i })
          : null;
        if (hitById) {
          const base = { ...hitById };
          if (it.l) base.nivå = it.l;
          if (it.t) base.trait = it.t;
          if (it.r) base.race = it.r;
          if (it.f) base.form = it.f;
          return base;
        }
      }
      if (it && it.n !== undefined) {
        const hitByName = typeof global.lookupEntry === 'function'
          ? global.lookupEntry({ id: it.n, name: it.n })
          : null;
        if (hitByName) {
          const base = { ...hitByName };
          if (it.l) base.nivå = it.l;
          if (it.t) base.trait = it.t;
          if (it.r) base.race = it.r;
          if (it.f) base.form = it.f;
          return base;
        }
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
      const canonical = row.id !== undefined && typeof global.lookupEntry === 'function'
        ? global.lookupEntry({ id: row.id })
        : null;
      const entryName = row.name || canonical?.namn || '';
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
        let entry = null;
        if (effectiveId !== undefined) {
          entry = customById.get(effectiveId)
            || (typeof global.lookupEntry === 'function'
              ? global.lookupEntry({ id: effectiveId })
              : null);
        }
        if (!entry && rawName) {
          entry = customByName.get(rawName)
            || (typeof global.lookupEntry === 'function'
              ? global.lookupEntry({ id: rawName, name: rawName })
              : null);
        }
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
    let folderMeta;
    try {
      const fid = char.folderId || '';
      if (fid) {
        const f = (store.folders || []).find(x => x.id === fid);
        if (f) {
          folderMeta = { id: f.id, name: f.name };
        }
      }
    } catch {}
    const folderPayload = {};
    if (folderMeta) {
      folderPayload.folderId = folderMeta.id;
      if (includeFolder && folderMeta.name) {
        folderPayload.folder = folderMeta.name;
      }
    }
    return {
      name: char.name,
      ...folderPayload,
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
        const folders = Array.isArray(store.folders) ? store.folders : (store.folders = []);
        const folderHintId = typeof obj.folderId === 'string' ? obj.folderId.trim() : '';
        const folderName = String(obj.folder || '').trim();

        if (folderHintId) {
          const byId = folders.find(f => f.id === folderHintId);
          if (byId) folderId = byId.id;
        }

        if (!folderId && folderName) {
          const byName = folders.find(f => f.name === folderName);
          if (byName) {
            folderId = byName.id;
          } else {
            const order = folders.length;
            const generatedId = folderHintId && !folders.some(f => f.id === folderHintId)
              ? folderHintId
              : 'fd' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
            folders.push({ id: generatedId, name: folderName, order });
            folderId = generatedId;
          }
        }

        if (!folderId) {
          // Ingen mapp i filen: lägg i systemmappen "Standard"
          const standard = folders.find(f => f.system) || folders.find(f => f.name === 'Standard');
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
      persistMeta(store);
      persistCharacter(store, id);
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
    persistMeta,
    persistCharacter: (store, id) => persistCharacter(store, id),
    persistCurrent: persistCurrentCharacter,
    persistAllCharacters: (store) => save(store, { allCharacters: true }),
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
        persistMeta(store);
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
      persistMeta(store);
      return id;
    },
    renameFolder: (store, id, name) => {
      if (!id) return;
      const nm = String(name || '').trim();
      if (!nm) return;
      const f = (store.folders || []).find(x => x.id === id);
      if (!f) return;
      f.name = nm;
      persistMeta(store);
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
      persistMeta(store);
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
        persistMeta(store);
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
      persistMeta(store);
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
        persistMeta(store);
      } catch {}
    },
    getRecentSearches,
    addRecentSearch,
    getCurrentList,
    getCharacterRaces,
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
    calcEntryDisplayXP,
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
    DARK_BLOOD_TRAITS,
    getCustomEntriesVersion: getCustomEntriesVersionMeta,
    getRevealedArtifactsVersion: getRevealedArtifactsVersionMeta
  };
})(window);
