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
  const ENTRY_SORT_DEFAULT = (global.ENTRY_SORT_DEFAULT || 'alpha-asc');

  const charStorageKey = (id) => `${STORAGE_CHAR_PREFIX}${id}`;

  const runtimeVersions = {
    custom: 0,
    revealed: 0
  };

  const normalizeEntrySort = (mode) => {
    if (typeof global.normalizeEntrySortMode === 'function') {
      return global.normalizeEntrySortMode(mode);
    }
    const val = typeof mode === 'string' ? mode : '';
    const allowed = new Set(['alpha-asc', 'alpha-desc', 'newest', 'oldest', 'test', 'ark']);
    return allowed.has(val) ? val : ENTRY_SORT_DEFAULT;
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
    recentSearches: Array.isArray(store.recentSearches) ? store.recentSearches.slice(0, MAX_RECENT_SEARCHES) : [],
    liveMode: Boolean(store.liveMode),
    entrySort: normalizeEntrySort(store.entrySort)
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

  function isHamnskifteGrantEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const id = String(entry?.id || '').trim().toLowerCase();
    if (id.startsWith('hamnskifte_grants')) return true;
    const name = String(entry?.namn || '').trim();
    return /^hamnskifte:\s*/i.test(name);
  }

  const DARK_BLOOD_TRAITS = ['Naturligt vapen', 'Pansar', 'Robust', 'Regeneration', 'Vingar'];

  let entryUidCounter = 0;

  function nextEntryUid() {
    entryUidCounter += 1;
    const counterPart = entryUidCounter.toString(36);
    const timePart = Date.now().toString(36);
    return `ent-${timePart}-${counterPart}`;
  }

  function coerceOrderValue(value) {
    if (value === undefined || value === null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function entrySignature(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const parts = [];
    const id = entry.id !== undefined ? String(entry.id).trim() : '';
    const name = entry.namn !== undefined ? String(entry.namn).trim() : '';
    if (id) parts.push(`id:${id.toLowerCase()}`);
    if (name) parts.push(`name:${name.toLowerCase()}`);
    if (entry.trait !== undefined && entry.trait !== null) {
      parts.push(`trait:${String(entry.trait).trim().toLowerCase()}`);
    }
    if (entry.race !== undefined && entry.race !== null) {
      parts.push(`race:${String(entry.race).trim().toLowerCase()}`);
    }
    if (entry.form !== undefined && entry.form !== null) {
      parts.push(`form:${String(entry.form).trim().toLowerCase()}`);
    }
    if (entry.nivå !== undefined && entry.nivå !== null) {
      parts.push(`level:${String(entry.nivå).trim().toLowerCase()}`);
    }
    return parts.join('|');
  }

  const ENTRY_DIGEST_IGNORE_KEYS = new Set([
    '__uid',
    '__order',
    '__entryMeta',
    '__appliedDigest',
    '__dbPinnedDigest',
    'nivå',
    'trait',
    'form',
    'race',
    'noInv',
    'manualRuleOverride'
  ]);

  const ENTRY_PRESERVE_KEYS = new Set([
    '__uid',
    '__order',
    '__dbPinnedDigest',
    'nivå',
    'trait',
    'form',
    'race',
    'noInv',
    'manualRuleOverride'
  ]);

  const stableClone = (value) => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(stableClone);
    const out = {};
    Object.keys(value).sort().forEach(key => {
      if (ENTRY_DIGEST_IGNORE_KEYS.has(key)) return;
      const v = value[key];
      if (v === undefined) return;
      out[key] = stableClone(v);
    });
    return out;
  };

  const computeEntryDigest = (entry) => {
    if (!entry || typeof entry !== 'object') return '';
    try {
      return JSON.stringify(stableClone(entry));
    } catch {
      return '';
    }
  };

  const computeComparableDigest = (entry) => {
    if (!entry || typeof entry !== 'object') return '';
    const name = typeof entry.namn === 'string' ? entry.namn : '';
    const hamBase = name && HAMNSKIFTE_BASE[name];
    if (hamBase) {
      return computeEntryDigest({ ...entry, namn: hamBase });
    }
    return computeEntryDigest(entry);
  };

  function ensureAppliedDigest(entry, dbDigest = '') {
    if (!entry || typeof entry !== 'object') return '';
    const current = typeof entry.__appliedDigest === 'string' ? entry.__appliedDigest : '';
    if (current) return current;
    const digest = (typeof dbDigest === 'string' && dbDigest)
      ? dbDigest
      : computeEntryDigest(entry);
    if (digest) entry.__appliedDigest = digest;
    return digest;
  }

  function lookupDbEntryInfo(entry) {
    try {
      if (typeof global.lookupEntry !== 'function') return { dbEntry: null, dbDigest: '' };
      const dbEntry = global.lookupEntry(entry);
      if (!dbEntry) return { dbEntry: null, dbDigest: '' };
      const dbDigest = computeEntryDigest(dbEntry);
      return { dbEntry, dbDigest };
    } catch {
      return { dbEntry: null, dbDigest: '' };
    }
  }

  function mergeEntryWithDb(entry, dbEntry, dbDigest) {
    if (!dbEntry || typeof dbEntry !== 'object') return entry;
    const merged = { ...dbEntry };
    Object.keys(entry || {}).forEach(key => {
      if (ENTRY_PRESERVE_KEYS.has(key)) merged[key] = entry[key];
    });
    if (entry && typeof entry.namn === 'string' && HAMNSKIFTE_BASE[entry.namn]) {
      merged.namn = entry.namn;
    }
    const digest = dbDigest || computeEntryDigest(merged);
    if (digest) merged.__appliedDigest = digest;
    if (merged.__dbPinnedDigest) delete merged.__dbPinnedDigest;
    return merged;
  }

  function ensureListAppliedDigests(list) {
    let mutated = false;
    (Array.isArray(list) ? list : []).forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const before = entry.__appliedDigest;
      if (before) return;
      const { dbDigest } = lookupDbEntryInfo(entry);
      const digest = ensureAppliedDigest(entry, dbDigest);
      if (!before && digest) mutated = true;
    });
    return mutated;
  }

  function findOutdatedEntries(store, options = {}) {
    const charId = options.charId || (store && store.current) || '';
    const includePinned = Boolean(options.includePinned);
    const res = { charId, outdated: [], pinned: [], mutated: false };
    if (!charId || !store?.data?.[charId]) return res;
    const list = Array.isArray(store.data[charId].list) ? store.data[charId].list : [];
    list.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const { dbEntry, dbDigest } = lookupDbEntryInfo(entry);
      const before = entry.__appliedDigest;
      let appliedDigest = ensureAppliedDigest(entry, dbDigest);
      if (!before && appliedDigest) res.mutated = true;
      if (!dbDigest) return;
      let pinnedDigest = entry.__dbPinnedDigest;
      if (appliedDigest && appliedDigest !== dbDigest) {
        const comparable = computeComparableDigest(entry);
        if (comparable && comparable === dbDigest) {
          entry.__appliedDigest = dbDigest;
          appliedDigest = dbDigest;
          if (pinnedDigest && pinnedDigest !== dbDigest) {
            entry.__dbPinnedDigest = dbDigest;
            pinnedDigest = dbDigest;
          }
          res.mutated = true;
        }
      }
      const stale = appliedDigest !== dbDigest && (!pinnedDigest || pinnedDigest !== dbDigest);
      const info = { index, entry, dbEntry, dbDigest, appliedDigest, pinnedDigest };
      if (stale) res.outdated.push(info);
      else if (includePinned && pinnedDigest) res.pinned.push(info);
    });
    if (res.mutated) persistCharacter(store, charId);
    return res;
  }

  function syncEntriesWithDb(store, options = {}) {
    const charId = options.charId || (store && store.current) || '';
    const mode = options.mode === 'pin' ? 'pin' : 'update';
    const includePinned = Boolean(options.includePinned);
    const targetIndexes = Array.isArray(options.targetIndexes)
      ? new Set(options.targetIndexes.map(idx => Number(idx)).filter(n => Number.isInteger(n) && n >= 0))
      : null;
    const res = { charId, updated: 0, pinned: 0 };
    if (!charId || !store?.data?.[charId]) return res;
    const list = Array.isArray(store.data[charId].list) ? store.data[charId].list : [];
    let mutated = false;

    list.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      if (targetIndexes && !targetIndexes.has(index)) return;
      const { dbEntry, dbDigest } = lookupDbEntryInfo(entry);
      const before = entry.__appliedDigest;
      const appliedDigest = ensureAppliedDigest(entry, dbDigest);
      if (!before && appliedDigest) mutated = true;
      if (!dbDigest) {
        return;
      }
      const pinnedDigest = entry.__dbPinnedDigest;
      const pinnedCurrentVersion = Boolean(pinnedDigest && pinnedDigest === dbDigest);
      const stale = appliedDigest !== dbDigest && !pinnedCurrentVersion;
      const shouldForcePinnedUpdate = mode === 'update'
        && includePinned
        && pinnedCurrentVersion
        && appliedDigest !== dbDigest;
      if (!stale && !shouldForcePinnedUpdate) return;
      if (mode === 'pin') {
        entry.__dbPinnedDigest = dbDigest;
        mutated = true;
        res.pinned += 1;
        return;
      }
      const merged = mergeEntryWithDb(entry, dbEntry, dbDigest);
      list[index] = merged;
      mutated = true;
      res.updated += 1;
    });

    if (mutated) {
      store.data[charId].list = list;
      persistCharacter(store, charId);
    }
    return res;
  }

  function ensureListEntryMetadata(store, list) {
    if (!store?.current) return;
    const data = store.data?.[store.current];
    if (!data) return;
    let counter = coerceOrderValue(data.entryOrderCounter) || 0;
    (Array.isArray(list) ? list : []).forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      if (!entry.__uid) entry.__uid = nextEntryUid();
      const coerced = coerceOrderValue(entry.__order);
      if (coerced === null) {
        counter += 1;
        entry.__order = counter;
      } else {
        entry.__order = coerced;
        if (coerced > counter) counter = coerced;
      }
    });
    data.entryOrderCounter = counter;
  }

  function syncEntryMetadataFromPrev(store, prevList, nextList) {
    if (!store?.current) return;
    const data = store.data?.[store.current];
    if (!data) return;
    const prev = Array.isArray(prevList) ? prevList : [];
    const next = Array.isArray(nextList) ? nextList : [];

    const queueBySig = new Map();
    prev.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const sig = entrySignature(entry);
      if (!queueBySig.has(sig)) queueBySig.set(sig, []);
      queueBySig.get(sig).push(entry);
    });
    queueBySig.forEach(arr => arr.sort((a, b) => {
      const aOrder = coerceOrderValue(a.__order) || 0;
      const bOrder = coerceOrderValue(b.__order) || 0;
      return aOrder - bOrder;
    }));

    let counter = coerceOrderValue(data.entryOrderCounter) || 0;
    next.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const sig = entrySignature(entry);
      let matched = null;
      const queue = queueBySig.get(sig);
      if (queue && queue.length) {
        matched = queue.shift();
      }
      if (matched) {
        if (matched.__uid && entry.__uid !== matched.__uid) entry.__uid = matched.__uid;
        const matchedOrder = coerceOrderValue(matched.__order);
        if (matchedOrder !== null) entry.__order = matchedOrder;
      }
      if (!entry.__uid) entry.__uid = nextEntryUid();
      const coerced = coerceOrderValue(entry.__order);
      if (coerced === null) {
        counter += 1;
        entry.__order = counter;
      } else {
        entry.__order = coerced;
        if (coerced > counter) counter = coerced;
      }
    });
    data.entryOrderCounter = counter;
  }

  function initializeEntryMetadata(data) {
    if (!data || typeof data !== 'object') return;
    const list = Array.isArray(data.list) ? data.list : [];
    let counter = coerceOrderValue(data.entryOrderCounter) || 0;
    list.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      if (!entry.__uid) entry.__uid = nextEntryUid();
      const coerced = coerceOrderValue(entry.__order);
      if (coerced === null) {
        counter += 1;
        entry.__order = counter;
      } else {
        entry.__order = coerced;
        if (coerced > counter) counter = coerced;
      }
    });
    data.entryOrderCounter = counter;
  }

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
      savedUnusedMoney: defaultMoney(),
      privMoney: defaultMoney(),
      possessionMoney: defaultMoney(),
      possessionRemoved: 0,
      hamnskifteRemoved: [],
      suppressedEntryGrants: {},
      forcedDefense: '',
      defenseSetup: defaultDefenseSetup(),
      notes: defaultNotes(),
      darkPastSuppressed: false,
      nilasPopupShown: false,
      liveMode: false,
      ...base
    };

    let mutated = false;

    if (!data.artifactEffects) {
      data.artifactEffects = { xp: 0, corruption: 0 };
      mutated = true;
    }
    if (!data.manualAdjustments) {
      data.manualAdjustments = defaultManualAdjustments();
      mutated = true;
    }
    if (data.manualAdjustments) {
      data.manualAdjustments = { ...defaultManualAdjustments(), ...(data.manualAdjustments || {}) };
    }
    if (!data.bonusMoney) {
      data.bonusMoney = defaultMoney();
      mutated = true;
    }
    if (!data.savedUnusedMoney) {
      data.savedUnusedMoney = defaultMoney();
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
    if (typeof data.liveMode !== 'boolean') {
      data.liveMode = false;
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
    const normalizedSuppressedEntryGrants = normalizeSuppressedEntryGrantMap(data.suppressedEntryGrants);
    if (Array.isArray(data.hamnskifteRemoved) && data.hamnskifteRemoved.length) {
      const REMOVED_TO_GRANT_ID = {
        'Naturligt vapen': 'hamnskifte_grants4',
        'Pansar': 'hamnskifte_grants2',
        'Robust': 'hamnskifte_grants1',
        'Regeneration': 'hamnskifte_grants3'
      };
      data.hamnskifteRemoved.forEach(baseName => {
        const grantId = REMOVED_TO_GRANT_ID[baseName];
        if (grantId) addSuppressedEntryGrant(normalizedSuppressedEntryGrants, 'Hamnskifte', `id:${grantId}`);
      });
      data.hamnskifteRemoved = [];
      mutated = true;
    }
    if (data.darkPastSuppressed) {
      addSuppressedEntryGrant(
        normalizedSuppressedEntryGrants,
        'Mörkt blod',
        `name:${normalizeEntryGrantName('Mörkt förflutet')}`
      );
    }
    if (JSON.stringify(normalizedSuppressedEntryGrants) !== JSON.stringify(data.suppressedEntryGrants || {})) {
      mutated = true;
    }
    data.suppressedEntryGrants = normalizedSuppressedEntryGrants;
    if (!data.notes) {
      data.notes = defaultNotes();
      mutated = true;
    }
    if (data.forcedDefense === undefined) {
      data.forcedDefense = '';
      mutated = true;
    }
    if (!data.defenseSetup) {
      data.defenseSetup = defaultDefenseSetup();
      mutated = true;
    } else {
      data.defenseSetup = normalizeDefenseSetup(data.defenseSetup);
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

      initializeEntryMetadata(data);

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
      recentSearches: [],
      liveMode: false,
      entrySort: ENTRY_SORT_DEFAULT
    };
  }

  /* ---------- 2. Load / Save ---------- */
  function load() {
    try {
      const metaRaw = localStorage.getItem(STORAGE_META_KEY);
      const legacyRaw = localStorage.getItem(STORAGE_KEY);

      if (metaRaw) {
        const metaParsed = JSON.parse(metaRaw);
        const metaHasLiveMode = Object.prototype.hasOwnProperty.call(metaParsed || {}, 'liveMode');
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

        const hasCurrent = Boolean(store.current);
        const currentLive = hasCurrent
          ? Boolean(store.data?.[store.current]?.liveMode)
          : Boolean(store.liveMode);

        if (!metaHasLiveMode) {
          const normalized = Boolean(store.liveMode);
          store.liveMode = hasCurrent ? currentLive : normalized;
          metaMutated = true;
        } else {
          const metaLive = Boolean(store.liveMode);
          if (hasCurrent && metaLive !== currentLive) {
            store.liveMode = currentLive;
            metaMutated = true;
          } else {
            store.liveMode = metaLive;
          }
        }

        store.entrySort = normalizeEntrySort(store.entrySort);

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
        const legacyCharIds = Object.keys(store.data || {});
        const anyLegacyLive = legacyCharIds.some(id => Boolean(store.data[id]?.liveMode));
        store.liveMode = anyLegacyLive;
        store.entrySort = normalizeEntrySort(store.entrySort);
        legacyCharIds.forEach(id => {
          if (store.data[id]) {
            store.data[id].liveMode = Boolean(store.liveMode);
          }
        });
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

  function normalizeEntryGrantName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeSuppressedEntryGrantMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(sourceName => {
      const source = String(sourceName || '').trim();
      if (!source) return;
      const values = Array.isArray(raw[sourceName]) ? raw[sourceName] : [];
      const keys = values
        .map(value => String(value || '').trim())
        .filter(Boolean);
      if (!keys.length) return;
      out[source] = Array.from(new Set(keys));
    });
    return out;
  }

  function addSuppressedEntryGrant(map, sourceName, targetKey) {
    const source = String(sourceName || '').trim();
    const target = String(targetKey || '').trim();
    if (!source || !target) return;
    const list = Array.isArray(map[source]) ? map[source] : [];
    if (!list.includes(target)) list.push(target);
    map[source] = list;
  }

  function removeSuppressedEntryGrant(map, sourceName, targetKey) {
    const source = String(sourceName || '').trim();
    const target = String(targetKey || '').trim();
    if (!source || !target || !Array.isArray(map[source])) return;
    map[source] = map[source].filter(value => value !== target);
    if (!map[source].length) delete map[source];
  }

  function isSuppressedEntryGrant(map, sourceName, targetKey) {
    const source = String(sourceName || '').trim();
    const target = String(targetKey || '').trim();
    if (!source || !target) return false;
    return Array.isArray(map[source]) && map[source].includes(target);
  }

  function getEntryGrantTargetKey(ref) {
    const name = normalizeEntryGrantName(ref?.name || ref?.namn || '');
    if (name) return `name:${name}`;
    const id = ref?.id === undefined || ref?.id === null
      ? ''
      : String(ref.id).trim();
    return id ? `id:${id}` : '';
  }

  function resolveEntryGrantTarget(target) {
    const id = target?.id === undefined || target?.id === null
      ? ''
      : String(target.id).trim();
    const name = typeof target?.name === 'string'
      ? target.name.trim()
      : (typeof target?.namn === 'string' ? target.namn.trim() : '');
    let hit = null;
    if (typeof global.lookupEntry === 'function') {
      try {
        const query = {};
        if (id) query.id = id;
        if (name) query.name = name;
        if (Object.keys(query).length) hit = global.lookupEntry(query);
      } catch {}
    }
    const resolvedId = hit?.id === undefined || hit?.id === null
      ? (id || undefined)
      : hit.id;
    const resolvedName = (typeof hit?.namn === 'string' && hit.namn.trim())
      ? hit.namn.trim()
      : name;
    const key = getEntryGrantTargetKey({ id: resolvedId, name: resolvedName || name })
      || getEntryGrantTargetKey({ id, name });
    return {
      id: resolvedId,
      name: resolvedName,
      key,
      entry: hit && typeof hit === 'object' ? hit : null
    };
  }

  function listHasEntryByGrantTarget(list, target) {
    const targetId = target?.id === undefined || target?.id === null
      ? ''
      : String(target.id).trim();
    const targetNameNorm = normalizeEntryGrantName(target?.name || target?.namn || '');
    return (Array.isArray(list) ? list : []).some(entry => {
      if (!entry || typeof entry !== 'object') return false;
      if (targetId && entry.id !== undefined && entry.id !== null && String(entry.id) === targetId) return true;
      return targetNameNorm && normalizeEntryGrantName(entry?.namn || '') === targetNameNorm;
    });
  }

  function listHasEntryByName(list, name) {
    const normalized = normalizeEntryGrantName(name);
    if (!normalized) return false;
    return (Array.isArray(list) ? list : []).some(entry => normalizeEntryGrantName(entry?.namn || '') === normalized);
  }

  function buildGrantMaps(list) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const grantCounts = new Map();
    const grantConstraints = new Map();
    if (typeof global.rulesHelper?.getEntryGrantTargets !== 'function') return { grantCounts, grantConstraints };

    global.rulesHelper.getEntryGrantTargets(entries).forEach(rawTarget => {
      const resolvedTarget = resolveEntryGrantTarget(rawTarget);
      const key = resolvedTarget?.key || getEntryGrantTargetKey(rawTarget);
      if (!key) return;
      grantCounts.set(key, (grantCounts.get(key) || 0) + 1);
      if (rawTarget.gratisTill && !grantConstraints.has(key)) {
        grantConstraints.set(key, { gratisTill: rawTarget.gratisTill });
      }
    });

    return { grantCounts, grantConstraints };
  }

  function buildEntryGrantCountMap(list) {
    return buildGrantMaps(list).grantCounts;
  }

  function getGrantTargetOccurrence(list, entry, targetKey) {
    const entries = Array.isArray(list) ? list.filter(item => item && typeof item === 'object') : [];
    const wantedUid = entry && entry.__uid ? String(entry.__uid) : '';
    const wantedSig = entrySignature(entry);
    let count = 0;
    let refIndex = -1;
    let uidIndex = -1;
    let sigIndex = -1;

    entries.forEach(candidate => {
      if (getEntryGrantTargetKey(candidate) !== targetKey) return;
      if (refIndex === -1 && candidate === entry) refIndex = count;
      if (uidIndex === -1 && wantedUid && candidate?.__uid && String(candidate.__uid) === wantedUid) {
        uidIndex = count;
      }
      if (sigIndex === -1 && wantedSig && entrySignature(candidate) === wantedSig) {
        sigIndex = count;
      }
      count += 1;
    });

    if (refIndex !== -1) return { index: refIndex, total: count };
    if (uidIndex !== -1) return { index: uidIndex, total: count };
    if (sigIndex !== -1) return { index: sigIndex, total: count };
    return { index: count, total: count };
  }

  function getEntryGrantCoverage(entry, list, options = {}) {
    const targetKey = getEntryGrantTargetKey(entry);
    if (!targetKey) {
      return {
        key: '',
        grantCount: 0,
        occurrenceIndex: -1,
        matchingCount: 0,
        covered: false
      };
    }

    let grantCounts, grantConstraints;
    if (options.grantCounts instanceof Map) {
      grantCounts = options.grantCounts;
      grantConstraints = options.grantConstraints instanceof Map ? options.grantConstraints : new Map();
    } else {
      const maps = buildGrantMaps(list);
      grantCounts = maps.grantCounts;
      grantConstraints = maps.grantConstraints;
    }

    const grantCount = Math.max(0, Number(grantCounts.get(targetKey) || 0));
    const occurrence = getGrantTargetOccurrence(list, entry, targetKey);
    const occurrenceIndex = occurrence.index;
    const matchingCount = occurrence.total;
    let covered = grantCount > 0 && occurrenceIndex > -1 && occurrenceIndex < grantCount;

    if (covered) {
      const constraint = grantConstraints.get(targetKey);
      if (constraint?.gratisTill) {
        const entryLvlIdx = LEVEL_IDX[entry?.nivå || ''] || 0;
        const gratisTillIdx = LEVEL_IDX[constraint.gratisTill] || 0;
        if (entryLvlIdx > gratisTillIdx) covered = false;
      }
    }

    return {
      key: targetKey,
      grantCount,
      occurrenceIndex,
      matchingCount,
      covered
    };
  }

  function getGrantedEntryOverrideCost(entry, list, options = {}) {
    const targetKey = getEntryGrantTargetKey(entry);
    if (!targetKey) return null;
    const entries = Array.isArray(list) ? list : [];

    const grantConstraints = options.grantConstraints instanceof Map
      ? options.grantConstraints
      : buildGrantMaps(entries).grantConstraints;

    const constraint = grantConstraints.get(targetKey);
    if (!constraint?.gratisTill) return null;

    const entryLevel = normalizeLevelName(entry?.nivå) || resolveEntryLevel(entry, entry?.nivå);
    const gratisLevel = normalizeLevelName(constraint.gratisTill) || resolveEntryLevel(entry, constraint.gratisTill);
    const entryLvlIdx = LEVEL_IDX[entryLevel] || 0;
    const gratisTillIdx = LEVEL_IDX[gratisLevel] || 0;
    if (entryLvlIdx <= gratisTillIdx) return null; // at or below free level → handled by isRuleGrantedEntry

    // Additive auto-discount: cumulative cost minus the free portion
    const totalCost = resolveEntryLevelCost(entry, entryLevel, { list: entries, strictLevel: true });
    const freeCost = resolveEntryLevelCost(entry, gratisLevel, { list: entries, strictLevel: true });
    return Math.max(0, totalCost - freeCost);
  }

  function isRuleGrantedEntry(entry, list, options = {}) {
    return getEntryGrantCoverage(entry, list, options).covered;
  }

  function syncRuleEntryGrants(store, list, prevList) {
    if (!store?.current) return false;
    if (typeof global.rulesHelper?.getEntryGrantTargets !== 'function') return false;
    store.data[store.current] = store.data[store.current] || {};
    const data = store.data[store.current];
    const prev = Array.isArray(prevList) ? prevList : [];
    const now = Array.isArray(list) ? list : [];
    const suppressed = normalizeSuppressedEntryGrantMap(data.suppressedEntryGrants);
    const legacyTargetKey = `name:${normalizeEntryGrantName('Mörkt förflutet')}`;
    if (data.darkPastSuppressed) {
      addSuppressedEntryGrant(suppressed, 'Mörkt blod', legacyTargetKey);
    }

    const desiredBySource = new Map();
    const prevDesiredBySource = new Map();
    const allSources = new Set(Object.keys(suppressed));

    global.rulesHelper.getEntryGrantTargets(now).forEach(rawTarget => {
      const source = String(rawTarget?.sourceEntryName || rawTarget?.sourceEntryId || '').trim();
      if (!source) return;
      const resolvedTarget = resolveEntryGrantTarget(rawTarget);
      if (!resolvedTarget.key) return;

      allSources.add(source);
      if (!desiredBySource.has(source)) desiredBySource.set(source, new Map());
      const sourceTargets = desiredBySource.get(source);
      if (!sourceTargets.has(resolvedTarget.key)) {
        sourceTargets.set(resolvedTarget.key, resolvedTarget);
      }
    });

    global.rulesHelper.getEntryGrantTargets(prev).forEach(rawTarget => {
      const source = String(rawTarget?.sourceEntryName || rawTarget?.sourceEntryId || '').trim();
      if (!source) return;
      const resolvedTarget = resolveEntryGrantTarget(rawTarget);
      if (!resolvedTarget.key) return;
      allSources.add(source);
      if (!prevDesiredBySource.has(source)) prevDesiredBySource.set(source, new Map());
      prevDesiredBySource.get(source).set(resolvedTarget.key, resolvedTarget);
    });

    let changed = false;
    allSources.forEach(source => {
      const sourceWasPresent = listHasEntryByName(prev, source);
      const sourceIsPresent = listHasEntryByName(now, source);
      const sourceTargets = desiredBySource.get(source);
      if (!sourceIsPresent) {
        delete suppressed[source];
        if (sourceWasPresent) {
          const prevTargets = prevDesiredBySource.get(source);
          if (prevTargets) {
            prevTargets.forEach(target => {
              for (let i = now.length - 1; i >= 0; i--) {
                if (listHasEntryByGrantTarget([now[i]], target) && !now[i]?.manualRuleOverride) {
                  now.splice(i, 1);
                  changed = true;
                }
              }
            });
          }
        }
        return;
      }

      if (sourceTargets && sourceWasPresent) {
        sourceTargets.forEach(target => {
          const hadTarget = listHasEntryByGrantTarget(prev, target);
          const hasTarget = listHasEntryByGrantTarget(now, target);
          if (hadTarget && !hasTarget) {
            addSuppressedEntryGrant(suppressed, source, target.key);
          }
        });
      }

      if (sourceTargets) {
        sourceTargets.forEach(target => {
          if (listHasEntryByGrantTarget(now, target)) {
            removeSuppressedEntryGrant(suppressed, source, target.key);
          }
        });
      }

      // Clean up grants that fell off due to source level downgrade
      if (sourceWasPresent) {
        const prevTargetsForSource = prevDesiredBySource.get(source);
        const currentTargetsForSource = desiredBySource.get(source);
        if (prevTargetsForSource) {
          prevTargetsForSource.forEach((prevTarget, key) => {
            if (!currentTargetsForSource || !currentTargetsForSource.has(key)) {
              for (let i = now.length - 1; i >= 0; i--) {
                if (listHasEntryByGrantTarget([now[i]], prevTarget) && !now[i]?.manualRuleOverride) {
                  now.splice(i, 1);
                  changed = true;
                }
              }
              removeSuppressedEntryGrant(suppressed, source, prevTarget.key);
            }
          });
        }
      }
    });

    desiredBySource.forEach((targets, source) => {
      targets.forEach(target => {
        if (!target?.entry) return;
        if (isSuppressedEntryGrant(suppressed, source, target.key)) return;
        if (listHasEntryByGrantTarget(now, target)) return;
        const grantedEntry = { ...target.entry };
        if (isHamnskifteGrantEntry(grantedEntry)) grantedEntry.form = 'beast';
        now.push(grantedEntry);
        changed = true;
      });
    });

    data.suppressedEntryGrants = suppressed;
    data.darkPastSuppressed = isSuppressedEntryGrant(suppressed, 'Mörkt blod', legacyTargetKey);
    return changed;
  }

  function enforceEarthbound(list) {
    // Tidigare blockerades "Mörkt förflutet" av "Jordnära".
    // Ny regel: tillåtet – ingen borttagning här.
  }

  function enforceRuleConflicts(list) {
    if (!Array.isArray(list) || list.length < 2) return;
    const hasResolutionHelper = typeof global.rulesHelper?.getConflictResolutionForCandidate === 'function';
    const hasReasonHelper = typeof global.rulesHelper?.getConflictReasonsForCandidate === 'function';
    if (!hasResolutionHelper && !hasReasonHelper) return;
    const normalizeName = (value) => String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const kept = [];
    list.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.manualRuleOverride) {
        kept.push(entry);
        return;
      }
      const level = typeof entry?.nivå === 'string' ? entry.nivå : '';
      const resolution = hasResolutionHelper
        ? global.rulesHelper.getConflictResolutionForCandidate(entry, kept, { level })
        : {
          reasons: hasReasonHelper ? global.rulesHelper.getConflictReasonsForCandidate(entry, kept, { level }) : [],
          blockingReasons: hasReasonHelper ? global.rulesHelper.getConflictReasonsForCandidate(entry, kept, { level }) : [],
          replaceTargetNames: []
        };
      if (resolution.blockingReasons.length) return;
      if (Array.isArray(resolution.replaceTargetNames) && resolution.replaceTargetNames.length) {
        const replaceSet = new Set(
          resolution.replaceTargetNames
            .map(name => normalizeName(name))
            .filter(Boolean)
        );
        for (let i = kept.length - 1; i >= 0; i--) {
          if (replaceSet.has(normalizeName(kept[i]?.namn || '')) && !kept[i]?.manualRuleOverride) {
            kept.splice(i, 1);
          }
        }
      }
      kept.push(entry);
    });

    if (kept.length !== list.length) {
      list.splice(0, list.length, ...kept);
    }
  }

  function normalizeGrantSourceName(value) {
    return String(value || '').trim();
  }

  function getInventoryGrantItemKey(ref) {
    const id = ref?.id === undefined || ref?.id === null
      ? ''
      : String(ref.id).trim();
    if (id) return `id:${id}`;
    const name = normalizeLevelName(ref?.name || ref?.namn || '');
    return name ? `name:${name}` : '';
  }

  function resolveInventoryGrantItem(grant) {
    const id = grant?.id === undefined || grant?.id === null
      ? ''
      : String(grant.id).trim();
    const name = typeof grant?.name === 'string' ? grant.name.trim() : '';

    let hit = null;
    if (typeof global.lookupEntry === 'function') {
      try {
        const query = {};
        if (id) query.id = id;
        if (name) query.name = name;
        if (Object.keys(query).length) {
          hit = global.lookupEntry(query);
        }
      } catch {}
    }

    const resolvedId = hit?.id === undefined || hit?.id === null
      ? (id || undefined)
      : hit.id;
    const resolvedName = (typeof hit?.namn === 'string' && hit.namn.trim())
      ? hit.namn.trim()
      : name;
    const key = getInventoryGrantItemKey({
      id: resolvedId,
      name: resolvedName || name
    }) || getInventoryGrantItemKey({ id, name });

    return {
      id: resolvedId,
      name: resolvedName,
      key
    };
  }

  function syncRuleInventoryGrants(store, list) {
    if (!store?.current) return false;
    if (typeof global.rulesHelper?.getInventoryGrantItems !== 'function') return false;
    store.data[store.current] = store.data[store.current] || {};
    const data = store.data[store.current];
    const inv = Array.isArray(data.inventory) ? data.inventory : [];
    const desiredBySource = new Map();
    const grants = global.rulesHelper.getInventoryGrantItems(Array.isArray(list) ? list : []);

    grants.forEach(grant => {
      const source = normalizeGrantSourceName(grant?.sourceEntryName || grant?.sourceEntryId);
      if (!source) return;
      const qty = Math.max(0, Math.floor(Number(grant?.qty || 0)));
      if (!qty) return;
      const resolved = resolveInventoryGrantItem(grant);
      if (!resolved.key) return;

      if (!desiredBySource.has(source)) desiredBySource.set(source, new Map());
      const byItem = desiredBySource.get(source);
      if (!byItem.has(resolved.key)) {
        byItem.set(resolved.key, {
          id: resolved.id,
          name: resolved.name,
          qty: 0
        });
      }
      byItem.get(resolved.key).qty += qty;
    });

    let changed = false;

    for (let i = inv.length - 1; i >= 0; i--) {
      const row = inv[i];
      if (!row || typeof row !== 'object') continue;
      const source = normalizeGrantSourceName(row.perk);
      const grantedQty = Math.max(0, Math.floor(Number(row.perkGratis || 0)));
      if (!source || !grantedQty) continue;

      const itemKey = getInventoryGrantItemKey(row);
      const sourceItems = desiredBySource.get(source);
      const desiredQty = itemKey && sourceItems && sourceItems.get(itemKey)
        ? Math.max(0, Math.floor(Number(sourceItems.get(itemKey).qty || 0)))
        : 0;
      if (grantedQty > desiredQty) {
        const diff = grantedQty - desiredQty;
        row.qty = Math.max(0, (Number(row.qty) || 0) - diff);
        row.gratis = Math.max(0, (Number(row.gratis) || 0) - diff);
        row.perkGratis = desiredQty;
        changed = true;
      }
      if (!row.perkGratis) {
        delete row.perk;
        delete row.perkGratis;
        changed = true;
      }
      if ((Number(row.qty) || 0) <= 0) {
        inv.splice(i, 1);
        changed = true;
      }
    }

    desiredBySource.forEach((itemsByKey, source) => {
      itemsByKey.forEach((target, itemKey) => {
        const desiredQty = Math.max(0, Math.floor(Number(target?.qty || 0)));
        if (!desiredQty) return;

        let row = inv.find(candidate => {
          if (!candidate || typeof candidate !== 'object') return false;
          const candidateKey = getInventoryGrantItemKey(candidate);
          if (candidateKey !== itemKey) return false;
          const candidateSource = normalizeGrantSourceName(candidate.perk);
          return candidateSource === source || !candidateSource;
        });

        if (!row) {
          inv.push({
            id: target?.id,
            name: target?.name || '',
            qty: desiredQty,
            gratis: desiredQty,
            kvaliteter: [],
            gratisKval: [],
            removedKval: [],
            perk: source,
            perkGratis: desiredQty
          });
          changed = true;
          return;
        }

        const currentSource = normalizeGrantSourceName(row.perk);
        if (!currentSource) {
          row.perk = source;
        } else if (currentSource !== source) {
          return;
        }

        const currentGrantedQty = Math.max(0, Math.floor(Number(row.perkGratis || 0)));
        if (target?.id !== undefined && target?.id !== null && row.id !== target.id) {
          row.id = target.id;
          changed = true;
        }
        if (target?.name && row.name !== target.name) {
          row.name = target.name;
          changed = true;
        }
        if (desiredQty > currentGrantedQty) {
          const diff = desiredQty - currentGrantedQty;
          row.qty = Math.max(0, Number(row.qty) || 0) + diff;
          row.gratis = Math.max(0, Number(row.gratis) || 0) + diff;
          row.perkGratis = currentGrantedQty + diff;
          changed = true;
        }
      });
    });

    if (changed) {
      data.inventory = inv;
    }
    return changed;
  }

  function applyHamnskifteTraits(store, list) {
    // Migration shim: remove legacy Hamnskifte entries created by old applyHamnskifteTraits.
    // New entries are granted via syncRuleEntryGrants using ger rules on Hamnskifte (mystisk-kraft).
    const legacyNames = new Set(Object.values(HAMNSKIFTE_NAMES));
    for (let i = list.length - 1; i >= 0; i--) {
      if (legacyNames.has(list[i].namn) && !list[i]?.manualRuleOverride) list.splice(i, 1);
    }
  }

  function getEntriesToBeCleanedByGrants(store, newList, prevList) {
    if (typeof global.rulesHelper?.getEntryGrantTargets !== 'function') return [];
    const now = Array.isArray(newList) ? newList : [];
    const prev = Array.isArray(prevList) ? prevList : [];
    const desiredBySource = new Map();
    const prevDesiredBySource = new Map();

    global.rulesHelper.getEntryGrantTargets(now).forEach(rawTarget => {
      const source = String(rawTarget?.sourceEntryName || rawTarget?.sourceEntryId || '').trim();
      if (!source) return;
      const resolvedTarget = resolveEntryGrantTarget(rawTarget);
      if (!resolvedTarget.key) return;
      if (!desiredBySource.has(source)) desiredBySource.set(source, new Map());
      if (!desiredBySource.get(source).has(resolvedTarget.key)) {
        desiredBySource.get(source).set(resolvedTarget.key, resolvedTarget);
      }
    });

    global.rulesHelper.getEntryGrantTargets(prev).forEach(rawTarget => {
      const source = String(rawTarget?.sourceEntryName || rawTarget?.sourceEntryId || '').trim();
      if (!source) return;
      const resolvedTarget = resolveEntryGrantTarget(rawTarget);
      if (!resolvedTarget.key) return;
      if (!prevDesiredBySource.has(source)) prevDesiredBySource.set(source, new Map());
      if (!prevDesiredBySource.get(source).has(resolvedTarget.key)) {
        prevDesiredBySource.get(source).set(resolvedTarget.key, resolvedTarget);
      }
    });

    const allSources = new Set([...desiredBySource.keys(), ...prevDesiredBySource.keys()]);
    const result = [];
    const seen = new WeakSet();

    allSources.forEach(source => {
      const sourceWasPresent = listHasEntryByName(prev, source);
      const sourceIsPresent = listHasEntryByName(now, source);
      let targetsToCheck = null;

      if (!sourceIsPresent && sourceWasPresent) {
        targetsToCheck = prevDesiredBySource.get(source);
      } else if (sourceIsPresent && sourceWasPresent) {
        const prevTargets = prevDesiredBySource.get(source);
        const currentTargets = desiredBySource.get(source);
        if (prevTargets) {
          const dropped = new Map();
          prevTargets.forEach((target, key) => {
            if (!currentTargets || !currentTargets.has(key)) dropped.set(key, target);
          });
          if (dropped.size > 0) targetsToCheck = dropped;
        }
      }

      if (!targetsToCheck) return;
      targetsToCheck.forEach(target => {
        for (const entry of now) {
          if (listHasEntryByGrantTarget([entry], target) && !entry?.manualRuleOverride) {
            if (!seen.has(entry)) {
              seen.add(entry);
              result.push({ entry, sourceName: source });
            }
          }
        }
      });
    });

    return result;
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

    if (typeof global.rulesHelper?.getEntryGrantDependents === 'function') {
      global.rulesHelper.getEntryGrantDependents(list, ent).forEach(depName => {
        if (depName && depName !== name) out.push(depName);
      });
    }

    if (typeof global.rulesHelper?.getRequirementDependents === 'function') {
      global.rulesHelper.getRequirementDependents(list, ent).forEach(depName => {
        if (depName && depName !== name) out.push(depName);
      });
    }

    if (name === 'Hamnskifte') {
      const extras = Object.values(HAMNSKIFTE_NAMES);
      list.forEach(it => {
        if (extras.includes(it.namn)) out.push(it.namn);
      });
    }

    return Array.from(new Set(out));
  }

  function syncRuleMoneyGrant(store, list, prev) {
    if (!store?.current) return;
    if (typeof global.rulesHelper?.getMoneyGrant !== 'function') return;
    store.data[store.current] = store.data[store.current] || {};
    const data = store.data[store.current];
    const prevGrant = global.rulesHelper.getMoneyGrant(Array.isArray(prev) ? prev : []);
    const nowGrant  = global.rulesHelper.getMoneyGrant(Array.isArray(list) ? list : []);
    const prevHas = prevGrant.daler || prevGrant.skilling || prevGrant.ortegar;
    const nowHas  = nowGrant.daler  || nowGrant.skilling  || nowGrant.ortegar;
    const priv    = data.privMoney || defaultMoney();
    const privHas = priv.daler || priv.skilling || priv['örtegar'];
    if (nowHas && !prevHas) {
      data.privMoney = { daler: nowGrant.daler, skilling: nowGrant.skilling, 'örtegar': nowGrant.ortegar };
    } else if (!nowHas && privHas) {
      data.privMoney = defaultMoney();
    }
  }

  function setCurrentList(store, list) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const prev = store.data[store.current]?.list || [];
    ensureListEntryMetadata(store, prev);
    syncRuleEntryGrants(store, list, prev);
    enforceEarthbound(list);
    enforceRuleConflicts(list);
    applyHamnskifteTraits(store, list);
    syncEntryMetadataFromPrev(store, prev, list);
    store.data[store.current].list = list;
    const hiddenRevealChanged = syncHiddenRevealedFromList(store, list);
    syncRuleInventoryGrants(store, list);
    syncRuleMoneyGrant(store, list, prev);

    const hasPos = list.some(x => x.namn === 'Besittning');
    const pos    = store.data[store.current].possessionMoney || defaultMoney();

    if (!hasPos && (pos.daler || pos.skilling || pos['örtegar'])) {
      store.data[store.current].possessionMoney = defaultMoney();
    }

    const total = normalizeMoney({
      daler: store.data[store.current].privMoney.daler + store.data[store.current].possessionMoney.daler,
      skilling: store.data[store.current].privMoney.skilling + store.data[store.current].possessionMoney.skilling,
      'örtegar': store.data[store.current].privMoney['örtegar'] + store.data[store.current].possessionMoney['örtegar']
    });
    store.data[store.current].bonusMoney = total;
    ensureListAppliedDigests(list);
    if (hiddenRevealChanged) bumpRuntimeVersion('revealed');

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

  function defaultManualAdjustments() {
    return {
      xp: 0,
      corruption: 0,
      toughness: 0,
      pain: 0,
      capacity: 0
    };
  }

  function defaultDefenseSetup() {
    return {
      enabled: false,
      trait: '',
      armor: null,
      weapons: [],
      dancingTrait: '',       // kept for backward compat (no longer used in logic)
      dancingWeapon: null,    // kept for backward compat (no longer used in logic)
      separateWeapons: {}     // { [sourceEntryId]: normalizedItem[] }
    };
  }

  function normalizeDefensePath(path) {
    if (!Array.isArray(path)) return [];
    const nums = path.map(n => Number(n)).filter(n => Number.isInteger(n) && n >= 0);
    return nums.length ? nums : [];
  }

  function normalizeDefenseItem(item) {
    if (!item || typeof item !== 'object') return null;
    const normalizedPath = normalizeDefensePath(item.path);
    const id = typeof item.id === 'string' ? item.id : undefined;
    const name = typeof item.name === 'string' ? item.name : undefined;
    if (!normalizedPath.length && !id && !name) return null;
    return {
      path: normalizedPath,
      id,
      name
    };
  }

  function normalizeDefenseSetup(setup) {
    const base = { ...defaultDefenseSetup(), ...(setup || {}) };
    const weapons = Array.isArray(base.weapons)
      ? base.weapons.map(normalizeDefenseItem).filter(Boolean)
      : [];
    const rawSep = (base.separateWeapons && typeof base.separateWeapons === 'object')
      ? base.separateWeapons : {};
    const separateWeapons = {};
    Object.entries(rawSep).forEach(([id, item]) => {
      if (Array.isArray(item)) {
        separateWeapons[String(id)] = item.map(normalizeDefenseItem).filter(Boolean);
      } else {
        const normalized = normalizeDefenseItem(item);
        separateWeapons[String(id)] = normalized ? [normalized] : [];
      }
    });
    return {
      enabled: Boolean(base.enabled),
      trait: typeof base.trait === 'string' ? base.trait : '',
      armor: normalizeDefenseItem(base.armor),
      weapons,
      dancingTrait: typeof base.dancingTrait === 'string' ? base.dancingTrait : '',
      dancingWeapon: normalizeDefenseItem(base.dancingWeapon),
      separateWeapons
    };
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

  function getSavedUnusedMoney(store) {
    if (!store.current) return defaultMoney();
    const data = store.data[store.current] || {};
    return { ...defaultMoney(), ...(data.savedUnusedMoney || {}) };
  }

  function setSavedUnusedMoney(store, money) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const normalized = normalizeMoney(money);
    store.data[store.current].savedUnusedMoney = { ...defaultMoney(), ...normalized };
    persistCurrentCharacter(store);
  }

  function getLiveMode(store) {
    if (!store || typeof store !== 'object') return false;
    if (store.current && store.data && typeof store.data === 'object') {
      const currentData = store.data[store.current];
      if (currentData && typeof currentData.liveMode === 'boolean') {
        return currentData.liveMode;
      }
    }
    return typeof store.liveMode === 'boolean' ? store.liveMode : false;
  }

  function setLiveMode(store, value) {
    if (!store || typeof store !== 'object') return;
    const next = Boolean(value);
    if (store.current) {
      store.data = store.data || {};
      const currentData = store.data[store.current] = store.data[store.current] || {};
      if (currentData.liveMode !== next) {
        currentData.liveMode = next;
        persistCurrentCharacter(store);
      }
    }
    if (store.liveMode !== next) {
      store.liveMode = next;
    }
    persistMeta(store);
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

  function getDefenseSetup(store) {
    if (!store.current) return defaultDefenseSetup();
    const data = store.data[store.current] || {};
    return normalizeDefenseSetup(data.defenseSetup);
  }

  function setDefenseSetup(store, setup) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].defenseSetup = normalizeDefenseSetup(setup);
    persistCurrentCharacter(store);
  }

  function getArtifactEffects(store) {
    if (!store.current) return defaultArtifactEffects();
    const data = store.data[store.current] || {};
    const auto = { ...defaultArtifactEffects(), ...(data.artifactEffects || {}) };
    return {
      xp: Number(auto.xp || 0),
      corruption: Number(auto.corruption || 0)
    };
  }

  function setArtifactEffects(store, eff) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].artifactEffects = { ...defaultArtifactEffects(), ...(eff || {}) };
    persistCurrentCharacter(store);
  }

  function getManualAdjustments(store) {
    if (!store.current) return defaultManualAdjustments();
    const data = store.data[store.current] || {};
    const manual = { ...defaultManualAdjustments(), ...(data.manualAdjustments || {}) };
    return {
      xp: Number(manual.xp || 0),
      corruption: Number(manual.corruption || 0),
      toughness: Number(manual.toughness || 0),
      pain: Number(manual.pain || 0),
      capacity: Number(manual.capacity || 0)
    };
  }

  function setManualAdjustments(store, adj) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const next = { ...defaultManualAdjustments(), ...(adj || {}) };
    next.xp = Number(next.xp || 0);
    next.corruption = Number(next.corruption || 0);
    next.toughness = Number(next.toughness || 0);
    next.pain = Number(next.pain || 0);
    next.capacity = Number(next.capacity || 0);
    store.data[store.current].manualAdjustments = next;
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

  function getEntrySort(store) {
    return normalizeEntrySort(store?.entrySort);
  }

  function setEntrySort(store, val) {
    store.entrySort = normalizeEntrySort(val);
    persistMeta(store);
  }

  function getOnlySelected(store) {
    return Boolean(store.onlySelected);
  }

  function setOnlySelected(store, val) {
    store.onlySelected = Boolean(val);
    persistMeta(store);
  }

  const SEARCH_HIDDEN_PRIMARY_TYPES = new Set(['artefakt', 'kuriositet', 'skatt']);

  function normalizeSearchRuleToken(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function isTruthySearchRuleValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const norm = normalizeSearchRuleToken(value);
    return ['true', '1', 'yes', 'ja', 'on'].includes(norm);
  }

  function hasHiddenSearchRule(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return false;
    const level = options?.level !== undefined ? options.level : entry?.nivå;

    let rules = [];
    if (typeof global.rulesHelper?.getRuleList === 'function') {
      try {
        rules = global.rulesHelper.getRuleList(
          entry,
          'andrar',
          level ? { level } : {}
        ) || [];
      } catch {
        rules = [];
      }
    }

    return rules.some(rule => {
      const target = normalizeSearchRuleToken(rule?.mal);
      if (target !== 'hidden') return false;
      return isTruthySearchRuleValue(rule?.varde);
    });
  }

  function isSearchHiddenEntry(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return false;
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    const primary = normalizeSearchRuleToken(types[0]);
    if (SEARCH_HIDDEN_PRIMARY_TYPES.has(primary)) return true;
    return hasHiddenSearchRule(entry, options);
  }

  function syncHiddenRevealedFromList(store, list) {
    if (!store?.current) return false;
    store.data[store.current] = store.data[store.current] || {};
    const data = store.data[store.current];
    const existing = new Set(Array.isArray(data.revealedArtifacts) ? data.revealedArtifacts : []);
    let changed = false;

    (Array.isArray(list) ? list : []).forEach(entry => {
      if (!entry || entry.id === undefined || entry.id === null) return;
      if (!isSearchHiddenEntry(entry)) return;
      if (existing.has(entry.id)) return;
      existing.add(entry.id);
      changed = true;
    });

    if (!changed) return false;
    data.revealedArtifacts = [...existing];
    return true;
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
    const before = set.size;
    set.add(id);
    if (set.size === before) return;
    store.data[store.current].revealedArtifacts = [...set];
    persistCurrentCharacter(store);
    bumpRuntimeVersion('revealed');
  }

  function removeRevealedArtifact(store, id) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    const list = store.data[store.current].revealedArtifacts || [];
    const next = list.filter(n => n !== id);
    if (next.length === list.length) return;
    store.data[store.current].revealedArtifacts = next;
    persistCurrentCharacter(store);
    bumpRuntimeVersion('revealed');
  }

  function clearRevealedArtifacts(store) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};

    const keep = new Set();

    // Keep any currently selected entries that are hidden types
    getCurrentList(store).forEach(it => {
      if (isSearchHiddenEntry(it) && it.id) keep.add(it.id);
    });

    // Keep any hidden items that still exist in the inventory (recursively)
    const collect = arr => {
        arr.forEach(row => {
          const entry = (getCustomEntries(store).find(e => e.id === row.id || e.namn === row.name))
            || (typeof global.lookupEntry === 'function'
              ? global.lookupEntry({ id: row.id, name: row.name })
              : {})
            || {};
          if (isSearchHiddenEntry(entry) && entry.id) keep.add(entry.id);
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
  const ERF_RULES = Object.freeze({
    levelCosts: Object.freeze({
      Novis: 10,
      'Gesäll': 30,
      'Mästare': 60,
      Enkel: 10,
      'Ordinär': 20,
      Avancerad: 30
    }),
    levelAliases: Object.freeze({
      novis: 'Novis',
      gesall: 'Gesäll',
      'gesäll': 'Gesäll',
      mastare: 'Mästare',
      'mästare': 'Mästare',
      enkel: 'Enkel',
      ordinar: 'Ordinär',
      'ordinär': 'Ordinär',
      avancerad: 'Avancerad'
    }),
    levelPriority: Object.freeze([
      'Novis',
      'Enkel',
      'Gesäll',
      'Ordinär',
      'Mästare',
      'Avancerad'
    ]),
    levelIndex: Object.freeze({
      '': 0,
      Novis: 1,
      Enkel: 1,
      'Gesäll': 2,
      'Ordinär': 2,
      'Mästare': 3,
      Avancerad: 3
    }),
    levelCostTypes: Object.freeze([
      'mystisk kraft',
      'förmåga',
      'basförmåga',
      'särdrag',
      'monstruöst särdrag'
    ]),
    ritualCost: 10,
    advantageStepCost: 5,
    disadvantageCap: 5
  });

  const XP_LADDER = ERF_RULES.levelCosts;
  const LEVEL_ALIASES = ERF_RULES.levelAliases;
  const LEVEL_PRIORITY = ERF_RULES.levelPriority;

  const normalizeLevelName = (level) => {
    const raw = String(level || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    return LEVEL_ALIASES[lower] || raw;
  };

  function entryDefinedLevels(entry) {
    const out = new Set();
    const add = (value) => {
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      if (!value || typeof value !== 'object') return;
      Object.keys(value).forEach(key => {
        const norm = normalizeLevelName(key);
        if (norm) out.add(norm);
      });
    };
    add(entry?.nivåer);
    add(entry?.nivaer);
    add(entry?.taggar?.nivå_data);
    add(entry?.taggar?.niva_data);
    return LEVEL_PRIORITY.filter(level => out.has(level)).concat(
      Array.from(out).filter(level => !LEVEL_PRIORITY.includes(level))
    );
  }

  function resolveEntryLevel(entry, preferredLevel) {
    const preferred = normalizeLevelName(preferredLevel);
    const selected = normalizeLevelName(entry?.nivå);
    const defined = entryDefinedLevels(entry);

    if (preferred) {
      if (!defined.length || defined.includes(preferred)) return preferred;
      if (defined.length === 1) return defined[0];
    }
    if (selected) {
      if (!defined.length || defined.includes(selected)) return selected;
      if (defined.length === 1) return defined[0];
    }
    if (defined.length) {
      if (defined.includes('Novis')) return 'Novis';
      if (defined.includes('Enkel')) return 'Enkel';
      return defined[0];
    }
    return preferred || selected || 'Novis';
  }

  function levelCost(level) {
    const norm = normalizeLevelName(level);
    return XP_LADDER[norm] || 10;
  }

  function normalizeErfOverrideNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.trunc(num);
  }

  function normalizeErfTypeName(type) {
    return String(type || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getEntryErfOverride(entry, list, options = {}) {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof global.rulesHelper?.getEntryErfOverride !== 'function') return null;
    const entries = Array.isArray(list) ? list : [];
    const resolvedLevel = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : resolveEntryLevel(entry, entry?.nivå);
    const override = global.rulesHelper.getEntryErfOverride(entry, entries, {
      ...(options && typeof options === 'object' ? options : {}),
      level: resolvedLevel
    });
    return normalizeErfOverrideNumber(override);
  }

  function getEntryErfMultiplier(entry, list, options = {}) {
    if (!entry || typeof entry !== 'object') return 1;
    if (typeof global.rulesHelper?.getRequirementEffectsForCandidate !== 'function') return 1;
    const entries = Array.isArray(list) ? list : [];
    const resolvedLevel = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : resolveEntryLevel(entry, entry?.nivå);
    const effects = global.rulesHelper.getRequirementEffectsForCandidate(entry, entries, {
      ...(options && typeof options === 'object' ? options : {}),
      level: resolvedLevel
    });
    const raw = Number(effects?.erfMultiplier || 1);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return raw;
  }

  function resolveEntryLevelCost(entry, preferredLevel, options = {}) {
    const normalizedPreferred = normalizeLevelName(preferredLevel);
    const resolvedLevel = options.strictLevel && normalizedPreferred
      ? normalizedPreferred
      : resolveEntryLevel(entry, preferredLevel);
    const list = Array.isArray(options?.list) ? options.list : [];
    const override = getEntryErfOverride(entry, list, {
      ...(options && typeof options === 'object' ? options : {}),
      level: resolvedLevel
    });
    const baseCost = override !== null ? override : levelCost(resolvedLevel);
    const multiplier = getEntryErfMultiplier(entry, list, {
      ...(options && typeof options === 'object' ? options : {}),
      level: resolvedLevel
    });
    if (Math.abs(multiplier - 1) < 0.001) return baseCost;
    const scaled = normalizeErfOverrideNumber(Number(baseCost) * multiplier);
    return scaled === null ? baseCost : scaled;
  }

  function entryLevelCost(entry, preferredLevel, options = {}) {
    return resolveEntryLevelCost(entry, preferredLevel, options);
  }

  function isLevelCostType(types = []) {
    const normalized = types.map(type => normalizeErfTypeName(type));
    const levelTypes = ERF_RULES.levelCostTypes.map(type => normalizeErfTypeName(type));
    return levelTypes.some(type => normalized.includes(type));
  }

  function typeBaseErf(type, level = 'Novis') {
    const normalized = normalizeErfTypeName(type);
    if (!normalized) return levelCost(level);
    if (normalized === 'nackdel') return 0;
    if (normalized === 'fordel') return ADVANTAGE_STEP_COST;
    if (normalized === 'ritual') return RITUAL_COST;
    if (isLevelCostType([normalized])) return levelCost(level);
    return levelCost(level);
  }

  function getErfRules() {
    return ERF_RULES;
  }

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

  const RITUAL_COST = ERF_RULES.ritualCost;
  const ADVANTAGE_STEP_COST = ERF_RULES.advantageStepCost;
  const DISADVANTAGE_CAP = ERF_RULES.disadvantageCap;
  const LEVEL_IDX = ERF_RULES.levelIndex;

  function abilityLevel(list, ability) {
    const ent = list.find(x =>
      x.namn === ability &&
      (x.taggar?.typ || []).some(t => ['Förmåga', 'Mystisk kraft'].includes(t))
    );
    return LEVEL_IDX[ent?.nivå || ''] || 0;
  }

  function hamnskifteNoviceLimit() { return false; }

  function isFreeMonsterTrait(list, item) {
    // Level-free check is now handled by the ger/gratis_upp_till system via isRuleGrantedEntry.
    return isRuleGrantedEntry(item, list);
  }

  function monsterTraitDiscount() {

    return 0;
  }

  function parsePositiveLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.floor(numeric);
    if (rounded <= 0) return null;
    return rounded;
  }

  function entryTypeNames(entry) {
    return Array.isArray(entry?.taggar?.typ)
      ? entry.taggar.typ.map(type => String(type || '').trim().toLowerCase())
      : [];
  }

  function getEntryMaxCount(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return 1;
    if (typeof global.rulesHelper?.getEntryMaxCount === 'function') {
      return global.rulesHelper.getEntryMaxCount(entry, options);
    }
    const tagLimit = parsePositiveLimit(entry?.taggar?.max_antal);
    if (tagLimit !== null) return tagLimit;
    const directLimit = parsePositiveLimit(entry?.max_antal);
    if (directLimit !== null) return directLimit;
    if (options.allowLegacy !== false) {
      const legacyMulti = Boolean(
        entry?.kan_införskaffas_flera_gånger === true
        || entry?.taggar?.kan_införskaffas_flera_gånger === true
      );
      if (legacyMulti) return 3;
    }
    return 1;
  }

  function monsterStackLimit(list, name) {
    const base = HAMNSKIFTE_BASE[name] || name;
    const entry = typeof global.lookupEntry === 'function'
      ? global.lookupEntry({ id: base, name: base })
      : null;
    if (!entry || typeof entry !== 'object') return 1;
    return getEntryMaxCount(entry);
  }

  function calcPermanentCorruption(list, extra) {
    if (typeof global.rulesHelper?.calcPermanentCorruption === 'function') {
      return global.rulesHelper.calcPermanentCorruption(list, {
        corruption: extra?.corruption || 0,
        korruptionstroskel: extra?.korruptionstroskel || 0
      });
    }
    return Number(extra?.corruption || 0);
  }

  function calcCorruptionTrackStats(list, willpower) {
    const will = Number(willpower || 0);
    if (typeof global.rulesHelper?.getCorruptionTrackStats === 'function') {
      return global.rulesHelper.getCorruptionTrackStats(list, {
        viljestark: will
      });
    }

    return {
      viljestark: will,
      korruptionstroskel: Math.ceil(will / 2),
      styggelsetroskel: will
    };
  }

  function calcUsedXP(list, extra) {
    let xp = 0;
    const entries = Array.isArray(list) ? list : [];
    const { grantCounts, grantConstraints } = buildGrantMaps(entries);
    const advantageCounts = new Map();

    entries.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (isRuleGrantedEntry(item, entries, { grantCounts, grantConstraints })) return;
      const types = (item.taggar?.typ || []).map(t => t.toLowerCase());

      if (isLevelCostType(types)) {
        const overrideCost = getGrantedEntryOverrideCost(item, entries, { grantCounts, grantConstraints });
        xp += overrideCost !== null
          ? overrideCost
          : entryLevelCost(item, item?.nivå, { list: entries });
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

  function getDisadvantages(list, options = {}) {
    const entries = Array.isArray(list) ? list : [];
    const grantCounts = options.grantCounts instanceof Map
      ? options.grantCounts
      : buildEntryGrantCountMap(entries);
    return entries.filter(item => {
      const isDis = (item.taggar?.typ || [])
        .map(t => t.toLowerCase())
        .includes('nackdel');
      if (!isDis) return false;
      if (isRuleGrantedEntry(item, entries, { grantCounts })) return false;
      return true;
    });
  }

  function countDisadvantages(list) {
    return getDisadvantages(list).length;
  }

  function entryMembershipKey(entry) {
    const sig = entrySignature(entry);
    if (sig) return sig;
    if (entry && entry.__uid) return `uid:${entry.__uid}`;
    return null;
  }

  function disadvantagesWithXP(list, options = {}) {
    const disadvantages = getDisadvantages(list, options);
    if (disadvantages.length <= DISADVANTAGE_CAP) return disadvantages;
    const sorted = disadvantages
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const aOrder = coerceOrderValue(a.entry?.__order);
        const bOrder = coerceOrderValue(b.entry?.__order);
        if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        if (aOrder !== null && bOrder === null) return -1;
        if (bOrder !== null && aOrder === null) return 1;
        return a.index - b.index;
      })
      .map(item => item.entry);
    return sorted.slice(0, DISADVANTAGE_CAP);
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

  function resolveAdvantageCount(entry, list, types, options = {}) {
    const key = getAdvantageKey(entry, types);
    if (!key) return null;
    const arr = Array.isArray(list) ? list : [];
    const grantCounts = options.grantCounts instanceof Map
      ? options.grantCounts
      : buildEntryGrantCountMap(arr);
    let count = 0;
    let includesEntry = false;
    arr.forEach(item => {
      if (getAdvantageKey(item) === key) {
        if (!isRuleGrantedEntry(item, arr, { grantCounts })) {
          count += 1;
        }
        if (!includesEntry && item === entry) includesEntry = true;
      }
    });
    const previewCount = isRuleGrantedEntry(entry, arr, { grantCounts }) ? 0 : 1;
    const effectiveCount = includesEntry ? count : count + previewCount;
    return { key, count, effectiveCount };
  }

  function calcEntryXP(entry, list) {
    const entries = Array.isArray(list) ? list : [];
    const { grantCounts, grantConstraints } = buildGrantMaps(entries);
    if (isRuleGrantedEntry(entry, entries, { grantCounts, grantConstraints })) return 0;
    const types = (entry.taggar?.typ || []).map(t => t.toLowerCase());
    if (types.includes('nackdel')) {
      const disXp = disadvantagesWithXP(entries, { grantCounts });
      if (entries.includes(entry)) {
        if (disXp.includes(entry)) return -ADVANTAGE_STEP_COST;
        return 0;
      }
      return disXp.length < DISADVANTAGE_CAP ? -ADVANTAGE_STEP_COST : 0;
    }
    let xp = 0;
    if (isLevelCostType(types)) {
      const overrideCost = getGrantedEntryOverrideCost(entry, entries, { grantCounts, grantConstraints });
      xp += overrideCost !== null
        ? overrideCost
        : entryLevelCost(entry, entry?.nivå, { list: entries });
    }
    if (types.includes('fördel')) {
      const advantageInfo = resolveAdvantageCount(entry, entries, types, { grantCounts });
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
    if (getEntryMaxCount(entry) <= 1) return null;
    if (entry.trait) return null;
    const types = entryTypeNames(entry);
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
    const grantCounts = buildEntryGrantCountMap(baseList);
    const stackKey = stackableDisplayKey(entry);
    const stackGrantCount = Math.max(
      0,
      Number(getEntryGrantCoverage(xpSource, baseList, { grantCounts }).grantCount || 0)
    );
    if (stackKey && stackGrantCount <= 0) {
      const stackEntries = baseList.filter(item => stackableDisplayKey(item) === stackKey);
      const actualCount = stackEntries.length;
      const previewBonus = actualCount === 0 ? 1 : 0;
      if (stackKey.startsWith('adv:')) {
        const targetCount = actualCount + previewBonus;
        return advantageTotalCost(targetCount);
      }
      if (stackKey.startsWith('dis:')) {
        const eligible = disadvantagesWithXP(baseList, { grantCounts });
        const eligibleSet = new Set(
          eligible
            .map(entryMembershipKey)
            .filter(Boolean)
        );
        const eligibleCount = stackEntries.reduce((count, item) => {
          const key = entryMembershipKey(item);
          if (!key) return count;
          return count + (eligibleSet.has(key) ? 1 : 0);
        }, 0);
        const totalEligible = eligible.length;
        const extra = previewBonus && totalEligible < DISADVANTAGE_CAP ? 1 : 0;
        return (eligibleCount + extra) * -ADVANTAGE_STEP_COST;
      }
    }
    const workingList = baseList.slice();
    if (xpSource && !workingList.includes(xpSource)) {
      workingList.push(xpSource);
    }
    return calcEntryXP(xpSource, workingList);
  }

  function singlePickAdvantageInfo(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (getEntryMaxCount(entry) > 1) return null;
    const types = entryTypeNames(entry);
    if (!types.length) return null;
    const isAdv = types.includes('fördel');
    const isDis = types.includes('nackdel');
    if (!isAdv && !isDis) return null;
    return { isAdv, isDis };
  }

  function formatEntryXPText(entry, xpVal) {
    if (xpVal === undefined || xpVal === null) return '';
    if (typeof xpVal === 'number') {
      const singleInfo = singlePickAdvantageInfo(entry);
      if (singleInfo) {
        if (singleInfo.isDis) {
          const disXp = Math.max(0, -xpVal);
          return `+${disXp}`;
        }
        return `${Math.max(0, xpVal)}`;
      }
      return xpVal < 0 ? `+${-xpVal}` : String(xpVal);
    }
    return String(xpVal);
  }

  function calcTotalXP(baseXp, list) {
    const entries = Array.isArray(list) ? list : [];
    const grantCounts = buildEntryGrantCountMap(entries);
    return Number(baseXp || 0) + disadvantagesWithXP(entries, { grantCounts }).length * ADVANTAGE_STEP_COST;
  }

  function calcCarryCapacity(strength, list) {
    const str = Number(strength || 0);
    if (typeof global.rulesHelper?.getCarryCapacityBase === 'function') {
      return global.rulesHelper.getCarryCapacityBase(list, {
        stark: str
      });
    }
    return str + 3;
  }

  function calcToughness(strength, list) {
    const str = Number(strength || 0);
    if (typeof global.rulesHelper?.getToughnessBase === 'function') {
      return global.rulesHelper.getToughnessBase(list, {
        stark: str
      });
    }
    return Math.max(10, str);
  }

  function calcTraitTotalMax(list, inventory) {
    if (typeof global.rulesHelper?.getTraitTotalMax === 'function') {
      return global.rulesHelper.getTraitTotalMax(list, inventory);
    }
    return 80;
  }

  function calcPainThreshold(strength, list, extra) {
    const entries = Array.isArray(list) ? list : [];
    const str = Number(strength || 0);
    let pain = Math.ceil(str / 2);
    const perm = calcPermanentCorruption(entries, extra);

    if (typeof global.rulesHelper?.getPainThresholdModifier === 'function') {
      pain += global.rulesHelper.getPainThresholdModifier(entries, {
        ...(extra && typeof extra === 'object' ? extra : {}),
        stark: str,
        permanent_korruption: perm
      });
    }

    return pain;
  }

  /* ---------- Hjälpfunktioner för export/import ---------- */

  function stripDefaults(data) {
    const obj = { ...(data || {}) };
    const emptyMoney = defaultMoney();
    const emptyEff = defaultArtifactEffects();
    const emptyManual = defaultManualAdjustments();

    ['money','bonusMoney','privMoney','possessionMoney','savedUnusedMoney'].forEach(k => {
      if (obj[k] && JSON.stringify(obj[k]) === JSON.stringify(emptyMoney)) delete obj[k];
    });
    if (obj.possessionRemoved === 0) delete obj.possessionRemoved;
    if (Array.isArray(obj.hamnskifteRemoved) && obj.hamnskifteRemoved.length === 0) delete obj.hamnskifteRemoved;
    if (obj.artifactEffects && JSON.stringify(obj.artifactEffects) === JSON.stringify(emptyEff)) delete obj.artifactEffects;
    if (obj.manualAdjustments && JSON.stringify(obj.manualAdjustments) === JSON.stringify(emptyManual)) delete obj.manualAdjustments;
    ['inventory','list','custom'].forEach(k => {
      if (Array.isArray(obj[k]) && obj[k].length === 0) delete obj[k];
    });
    ['partyAlchemist','partySmith','partyArtefacter'].forEach(k => {
      if (obj[k] === '') delete obj[k];
    });
    if (obj.nilasPopupShown === false) delete obj.nilasPopupShown;
    if (obj.darkPastSuppressed === false) delete obj.darkPastSuppressed;
    if (obj.suppressedEntryGrants && typeof obj.suppressedEntryGrants === 'object' && !Array.isArray(obj.suppressedEntryGrants)) {
      const compact = {};
      Object.keys(obj.suppressedEntryGrants).forEach(sourceName => {
        const source = String(sourceName || '').trim();
        if (!source) return;
        const values = obj.suppressedEntryGrants[sourceName];
        const keys = Array.isArray(values)
          ? values.map(value => String(value || '').trim()).filter(Boolean)
          : [];
        if (keys.length) compact[source] = Array.from(new Set(keys));
      });
      if (Object.keys(compact).length) obj.suppressedEntryGrants = compact;
      else delete obj.suppressedEntryGrants;
    }
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
          if (it.namn && it.namn !== entry.namn) row.n = it.namn;
          if (it.nivå) row.l = it.nivå;
          if (it.trait) row.t = it.trait;
          if (it.race) row.r = it.race;
          if (it.form) row.f = it.form;
          if (it.manualRuleOverride) row.mo = 1;
          if (it.__uid) row.u = it.__uid;
          const orderVal = coerceOrderValue(it.__order);
          if (orderVal !== null) row.o = orderVal;
          return row;
        }
      }
      return it;
    });
  }

  function expandList(list, customEntries = [], idMap = null) {
    const customs = Array.isArray(customEntries) ? customEntries : [];
    const customById = new Map();
    const customByName = new Map();
    customs.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      if (entry.id !== undefined) customById.set(entry.id, entry);
      if (entry.namn) customByName.set(entry.namn, entry);
    });

    const remapId = (value) => {
      if (value === undefined || value === null) return value;
      if (idMap instanceof Map) {
        const mapped = idMap.get(value);
        if (mapped !== undefined) return mapped;
        const asString = typeof value === 'string' ? value : String(value);
        const mappedString = idMap.get(asString);
        if (mappedString !== undefined) return mappedString;
      }
      return value;
    };

    const cloneWithOrder = (base, src) => {
      if (src.n && typeof src.n === 'string' && src.n !== base.namn) base.namn = src.n;
      if (src.l) base.nivå = src.l;
      if (src.t) base.trait = src.t;
      if (src.r) base.race = src.r;
      if (src.f) base.form = src.f;
      if (src.mo || src.manualRuleOverride) base.manualRuleOverride = true;
      if (src.u) base.__uid = src.u;
      const orderVal = coerceOrderValue(src.o);
      if (orderVal !== null) base.__order = orderVal;
      return base;
    };

    return (list || []).map(it => {
      if (!it || typeof it !== 'object') return it;

      if (Object.prototype.hasOwnProperty.call(it, 'i')) {
        const rawId = it.i;
        const mappedId = remapId(rawId);
        const hit = customById.get(mappedId)
          || (typeof global.lookupEntry === 'function'
            ? global.lookupEntry({ id: mappedId })
            : null);
        if (hit) {
          const base = { ...hit };
          if (mappedId !== undefined && mappedId !== null) base.id = mappedId;
          return cloneWithOrder(base, { ...it, i: mappedId });
        }
        if (mappedId !== rawId) {
          return { ...it, i: mappedId };
        }
        return it;
      }

      if (Object.prototype.hasOwnProperty.call(it, 'id')) {
        const rawId = it.id;
        const mappedId = remapId(rawId);
        const hit = customById.get(mappedId)
          || (typeof global.lookupEntry === 'function'
            ? global.lookupEntry({ id: mappedId })
            : null);
        if (hit) {
          const base = { ...hit, ...it };
          base.id = mappedId;
          return cloneWithOrder(base, { ...it, id: mappedId });
        }
        if (mappedId !== rawId) {
          return { ...it, id: mappedId };
        }
        return it;
      }

      if (Object.prototype.hasOwnProperty.call(it, 'n')) {
        const hitByName = customByName.get(it.n)
          || (typeof global.lookupEntry === 'function'
            ? global.lookupEntry({ id: it.n, name: it.n })
            : null);
        if (hitByName) {
          const base = { ...hitByName };
          return cloneWithOrder(base, it);
        }
      }

      return it;
    });
  }

  function compressInventory(inv) {
    if (!Array.isArray(inv)) return [];
    return inv.map(row => {
      if (!row || typeof row !== 'object') return row;
      const typeRaw = row.typ ?? row.t;
      const moneyRaw = row.money ?? row.m;
      if (typeRaw === 'currency' || moneyRaw) {
        const res = { t: 'currency' };
        const src = (moneyRaw && typeof moneyRaw === 'object') ? moneyRaw : {};
        res.m = sanitizeMoneyStruct({
          daler: src.daler ?? src.d,
          skilling: src.skilling ?? src.s,
          'örtegar': src['örtegar'] ?? src.o
        });
        const qty = row.qty ?? row.q;
        if (qty && qty !== 1) res.q = qty;
        const name = row.name || row.n;
        if (name) res.n = name;
        const weightRaw = row.vikt ?? row.w;
        if (weightRaw !== undefined) {
          const weightNum = Number(weightRaw);
          if (Number.isFinite(weightNum)) res.w = weightNum;
        }
        return res;
      }
      const res = {};
      if (row.id !== undefined) res.i = row.id;
      const canonical = row.id !== undefined && typeof global.lookupEntry === 'function'
        ? global.lookupEntry({ id: row.id })
        : null;
      let entryName = row.name || canonical?.namn || '';
      if (entryName && row.trait) {
        const traitLabel = String(row.trait).trim();
        if (traitLabel) {
          const suffix = `: ${traitLabel}`;
          if (String(entryName).trim().endsWith(suffix)) {
            entryName = String(entryName).slice(0, -suffix.length).trimEnd();
          }
        }
      }
      if (entryName) res.n = entryName;
      if (row.qty && row.qty !== 1) res.q = row.qty;
      if (row.gratis) res.g = row.gratis;
      if (row.kvaliteter && row.kvaliteter.length) res.k = row.kvaliteter;
      if (row.gratisKval && row.gratisKval.length) res.gk = row.gratisKval;
      if (row.removedKval && row.removedKval.length) res.rk = row.removedKval;
      if (Array.isArray(row.manualQualityOverride) && row.manualQualityOverride.length) {
        const manual = row.manualQualityOverride
          .map(value => String(value || '').trim())
          .filter(Boolean);
        if (manual.length) res.mqo = Array.from(new Set(manual));
      }
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
      if (row.basePriceSource) {
        const src = String(row.basePriceSource).toLowerCase();
        if (src === 'live' || src === 'manual') {
          res.bps = src;
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
        const typeRaw = row.typ ?? row.t;
        const moneyRaw = row.money ?? row.m;
        if (typeRaw === 'currency' || moneyRaw) {
          const qty = sanitizeCount(row.qty ?? row.q, 1);
          const src = (moneyRaw && typeof moneyRaw === 'object') ? moneyRaw : {};
          const money = sanitizeMoneyStruct({
            daler: src.daler ?? src.d,
            skilling: src.skilling ?? src.s,
            'örtegar': src['örtegar'] ?? src.o
          });
          const expanded = {
            typ: 'currency',
            name: row.name ?? row.n ?? 'Pengar',
            qty,
            money
          };
          const weightRaw = row.vikt ?? row.w;
          if (weightRaw !== undefined) {
            const weightNum = Number(weightRaw);
            if (Number.isFinite(weightNum)) expanded.vikt = weightNum;
          }
          const contains = row.contains ?? row.c;
          if (Array.isArray(contains) && contains.length) {
            expanded.contains = expandRows(contains);
          }
          return expanded;
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
        let resolvedName = entry?.namn || rawName || '';
        const rowTrait = row.trait ?? row.t;
        if (resolvedName && rowTrait) {
          const traitLabel = String(rowTrait).trim();
          if (traitLabel) {
            const suffix = `: ${traitLabel}`;
            if (String(resolvedName).trim().endsWith(suffix)) {
              resolvedName = String(resolvedName).slice(0, -suffix.length).trimEnd();
            }
          }
        }
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
        const manualQualityOverride = Array.isArray(row.manualQualityOverride ?? row.mqo)
          ? Array.from(new Set((row.manualQualityOverride ?? row.mqo)
            .map(value => String(value || '').trim())
            .filter(Boolean)))
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
        if (manualQualityOverride.length) {
          expanded.manualQualityOverride = manualQualityOverride;
        }
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
        const baseSourceRaw = row.basePriceSource ?? row.bps;
        let baseSource = typeof baseSourceRaw === 'string' ? baseSourceRaw.toLowerCase() : '';
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
        if (!baseSource && expanded.basePrice) {
          if (qty > 0 && gratis >= qty) {
            baseSource = 'live';
          }
        }
        if (baseSource === 'live' || baseSource === 'manual') {
          expanded.basePriceSource = baseSource;
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
      data.list = expandList(data.list, custom, idMap);
      data.inventory = expandInventory(data.inventory, custom, idMap);
      if (idMap.size && Array.isArray(data.revealedArtifacts)) {
        data.revealedArtifacts = [...new Set(data.revealedArtifacts.map(n => idMap.get(n) || n))];
      }
      store.data[id] = {
        custom: [],
        artifactEffects: defaultArtifactEffects(),
        bonusMoney: defaultMoney(),
        savedUnusedMoney: defaultMoney(),
        privMoney: defaultMoney(),
        possessionMoney: defaultMoney(),
        possessionRemoved: 0,
        notes: defaultNotes(),
        liveMode: false,
        ...data,
        custom,
        inventory: data.inventory
      };
      if (!store.data[id].notes) {
        store.data[id].notes = defaultNotes();
      }
      initializeEntryMetadata(store.data[id]);
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
    syncRuleInventoryGrants,
    findOutdatedEntries,
    syncEntriesWithDb,
    getInventory,
    setInventory,
    getCustomEntries,
    setCustomEntries,
    getNotes,
    setNotes,
    getMoney,
    setMoney,
    getSavedUnusedMoney,
    setSavedUnusedMoney,
    getLiveMode,
    setLiveMode,
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
    getDefenseSetup,
    setDefenseSetup,
    getArtifactEffects,
    setArtifactEffects,
    getManualAdjustments,
    setManualAdjustments,
    getFilterUnion,
    setFilterUnion,
    getCompactEntries,
    setCompactEntries,
    getEntrySort,
    setEntrySort,
    getOnlySelected,
    setOnlySelected,
    getRevealedArtifacts,
    addRevealedArtifact,
    removeRevealedArtifact,
    clearRevealedArtifacts,
    isSearchHiddenEntry,
    migrateInventoryIds,
    genId,
    getNilasPopupSeen,
    setNilasPopupSeen,
    normalizeMoney,
    getTraits,
    setTraits,
    getBaseXP,
    setBaseXP,
    getErfRules,
    typeBaseErf,
    getEntryErfOverride,
    calcUsedXP,
    calcEntryXP,
    calcEntryDisplayXP,
    formatEntryXPText,
    normalizeLevelName,
    entryDefinedLevels,
    resolveEntryLevel,
    entryLevelCost,
    calcTotalXP,
    countDisadvantages,
    calcCorruptionTrackStats,
    calcPermanentCorruption,
    calcCarryCapacity,
    calcToughness,
    calcTraitTotalMax,
    calcPainThreshold,
    abilityLevel,
    hamnskifteNoviceLimit,
    isFreeMonsterTrait,
    monsterTraitDiscount,
    getEntryMaxCount,
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
    buildGrantMaps,
    isRuleGrantedEntry,
    getGrantedEntryOverrideCost,
    getEntriesToBeCleanedByGrants,
    getDependents,
    HAMNSKIFTE_NAMES,
    HAMNSKIFTE_BASE,
    DARK_BLOOD_TRAITS,
    getCustomEntriesVersion: getCustomEntriesVersionMeta,
    getRevealedArtifactsVersion: getRevealedArtifactsVersionMeta
  };
})(window);
