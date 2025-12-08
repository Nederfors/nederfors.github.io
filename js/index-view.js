(function(window){
const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';

const quoteName = (value) => {
  const str = String(value ?? '').trim();
  return str ? `“${str}”` : '';
};

function formatQuotedList(values) {
  if (!Array.isArray(values) || !values.length) return '';
  return values
    .map(val => quoteName(val))
    .filter(Boolean)
    .join(', ');
}

  function getGrundritualRequirements(entry) {
  const raw = entry?.taggar?.grundritual;
  if (Array.isArray(raw)) {
    return raw
      .map(val => (typeof val === 'string' ? val.trim() : ''))
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

async function enforceGrundritualRequirement(entry, list) {
  const required = getGrundritualRequirements(entry);
  if (!required.length) return { allowed: true, autoAdd: [] };
  const current = Array.isArray(list) ? list : [];
  const missing = required.filter(name => !current.some(item => item?.namn === name));
  if (!missing.length) return { allowed: true, autoAdd: [] };
  const entryLabel = quoteName(entry?.namn) || 'Denna ritual';
  const requirementText = missing.length === 1 ? 'grundritualen' : 'grundritualerna';
  const missingText = formatQuotedList(missing) || 'den angivna ritualen';
  const baseMessage = `${entryLabel} kräver ${requirementText} ${missingText}.`;
  if (typeof window.openDialog === 'function') {
    const extraLabel = missing.length === 1 ? `Lägg till ${missingText}` : 'Lägg till alla';
    const response = await window.openDialog(`${baseMessage} Lägg till grundritual nu, hoppa över kravet eller avbryt.`, {
      cancel: true,
      okText: 'Hoppa över kravet',
      cancelText: 'Avbryt',
      extraText: extraLabel
    });
    if (response === false) return { allowed: false, autoAdd: [] };
    if (response === 'extra') return { allowed: true, autoAdd: missing };
    return { allowed: true, autoAdd: [] };
  }
  const fallback = await confirmPopup(`${baseMessage}\nHoppa över kravet?`);
  return { allowed: !!fallback, autoAdd: [] };
}

function computeIndexEntryXP(entry, list, options = {}) {
  const defaults = {
    allowInventory: true,
    allowEmployment: true,
    allowService: true,
    forceDisplay: true,
    label: 'Erf'
  };
  const xpOptions = { ...defaults, ...(options || {}) };
  const baseList = Array.isArray(list) ? list.filter(Boolean) : [];
  const workingList = baseList.slice();

  const hasLevelOverride = Object.prototype.hasOwnProperty.call(xpOptions, 'level')
    && xpOptions.level !== undefined
    && xpOptions.level !== null
    && xpOptions.level !== '';
  const levelOverride = hasLevelOverride
    ? xpOptions.level
    : (entry && Object.prototype.hasOwnProperty.call(entry, 'nivå') ? entry.nivå : undefined);

  const cloneEntryWithLevel = (src) => {
    if (!src || typeof src !== 'object') return {};
    const clone = { ...src };
    if (hasLevelOverride) clone.nivå = levelOverride;
    else if (levelOverride !== undefined && levelOverride !== null) clone.nivå = levelOverride;
    return clone;
  };

  const ensureOrderValue = (listRef) => {
    const orders = listRef
      .map(item => Number(item?.__order))
      .filter(value => Number.isFinite(value));
    if (!orders.length) return listRef.length;
    return Math.max(...orders) + 1;
  };

  const baseSource = xpOptions.xpSource || null;
  let targetEntry = null;

  if (baseSource && workingList.includes(baseSource)) {
    if (hasLevelOverride && baseSource.nivå !== levelOverride) {
      targetEntry = cloneEntryWithLevel(baseSource);
      const idx = workingList.indexOf(baseSource);
      if (idx !== -1) workingList[idx] = targetEntry;
    } else {
      targetEntry = baseSource;
    }
  } else if (baseSource && !workingList.includes(baseSource)) {
    targetEntry = cloneEntryWithLevel(baseSource);
    if (targetEntry.__order === undefined) {
      targetEntry.__order = ensureOrderValue(workingList);
    }
    workingList.push(targetEntry);
  } else {
    targetEntry = cloneEntryWithLevel(entry || {});
    if (targetEntry.__order === undefined) {
      targetEntry.__order = ensureOrderValue(workingList);
    }
    workingList.push(targetEntry);
  }

  const helperOptions = {
    ...xpOptions,
    xpSource: targetEntry
  };
  if (hasLevelOverride) helperOptions.level = levelOverride;
  else delete helperOptions.level;

  const xpHelper = window.entryXp?.buildDisplay || window.entryXp?.compute;
  if (typeof xpHelper === 'function') {
    const result = xpHelper(targetEntry, workingList, helperOptions) || {};
    return {
      ...result,
      label: result.label ?? helperOptions.label
    };
  }

  if (window.storeHelper && typeof window.storeHelper.calcEntryDisplayXP === 'function') {
    const calcOpts = {};
    if (hasLevelOverride) calcOpts.level = levelOverride;
    const rawValue = window.storeHelper.calcEntryDisplayXP(
      targetEntry,
      workingList,
      Object.keys(calcOpts).length ? calcOpts : undefined
    );
    const rawText = window.storeHelper.formatEntryXPText(targetEntry, rawValue);
    const shouldShow = helperOptions.forceDisplay || !!(rawText && String(rawText).trim());
    const prefix = `${helperOptions.label}: `;
    return {
      value: rawValue,
      text: rawText,
      tagHtml: shouldShow ? `<span class="tag xp-cost">${prefix}${rawText}</span>` : '',
      headerHtml: shouldShow ? `<span class="entry-xp-value">${prefix}${rawText}</span>` : '',
      label: helperOptions.label,
      shouldShow
    };
  }

  return {
    value: null,
    text: '',
    tagHtml: '',
    headerHtml: '',
    label: helperOptions.label,
    shouldShow: false
  };
}

function getActiveHandlingKeys(p){
  const meta = typeof window.getEntryLevelMeta === 'function'
    ? window.getEntryLevelMeta(p)
    : (p?.taggar?.nivå_data || {});
  const source = Object.keys(meta || {}).length ? meta : (p?.taggar?.handling || {});

  const availableLevels = LVL.filter(l => p?.nivåer?.[l]);
  const currentLevel = LVL.includes(p?.nivå || '')
    ? p.nivå
    : (availableLevels.length === 1 ? availableLevels[0] : null);
  const currentIdx = currentLevel ? LVL.indexOf(currentLevel) : -1;

  return Object.entries(source)
    .filter(([levelKey, v]) => {
      if (LVL.includes(levelKey)) {
        if (currentIdx < 0 || LVL.indexOf(levelKey) > currentIdx) return false;
      }

      const handlingVal = v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, 'handling')
        ? v.handling
        : v;
      const list = Array.isArray(handlingVal) ? handlingVal : [handlingVal];
      return list.some(item => String(item || '').toLowerCase().includes('aktiv'));
    })
    .map(([k]) => k);
}

function handlingName(p, key){
  if (!LVL.includes(key)) {
    const txt = p?.nivåer?.[key];
    if (typeof txt === 'string') {
      const idx = txt.indexOf(';');
      return idx >= 0 ? txt.slice(0, idx) : txt;
    }
  }
  return key;
}

function findConflictingEntries(entry, list){
  const baseKeys = new Set(getActiveHandlingKeys(entry));
  if (!baseKeys.size) return [];
  return (Array.isArray(list) ? list : [])
    .filter(item => {
      if (!item || item === entry) return false;
      if ((item.namn || '') === (entry?.namn || '')
        && (item.trait ?? null) === (entry?.trait ?? null)
        && (item.nivå ?? null) === (entry?.nivå ?? null)) {
        return false;
      }
      const otherKeys = getActiveHandlingKeys(item);
      return otherKeys.some(k => baseKeys.has(k));
    });
}

const charCategory = (entry, { allowFallback = true } = {}) => {
  const rawTypes = Array.isArray(entry?.taggar?.typ)
    ? entry.taggar.typ
    : [];
  const normalized = rawTypes
    .map(t => typeof t === 'string' ? t.trim() : '')
    .filter(Boolean);
  if (!normalized.length) {
    return allowFallback ? 'Övrigt' : undefined;
  }

  const primaryType = normalized[0];
  const firstNonCustomIdx = normalized.findIndex(t => t.toLowerCase() !== 'hemmagjort');
  const artifactIdx = normalized.findIndex(t => t.toLowerCase() === 'artefakt');

  if (artifactIdx > 0 && artifactIdx === firstNonCustomIdx && primaryType) {
    return primaryType;
  }

  if (firstNonCustomIdx >= 0) {
    return normalized[firstNonCustomIdx];
  }

  if (primaryType) return primaryType;
  return allowFallback ? 'Övrigt' : undefined;
};

function renderConflictTabButton(){
  return '<button class="info-tab" data-tab="conflict" type="button">Konflikter</button>';
}

function conflictEntryHtml(p){
  const activeKeys = getActiveHandlingKeys(p);
  const activeNames = activeKeys.map(k => handlingName(p, k));
  const lvlHtml = activeKeys
    .map(k => {
      const name = handlingName(p, k);
      let desc = p.nivåer?.[k] || '';
      if (!LVL.includes(k) && typeof desc === 'string') {
        const idx = desc.indexOf(';');
        desc = idx >= 0 ? desc.slice(idx + 1) : '';
      }
      if (!desc) return '';
      const body = formatText(desc);
      if (!body) return '';
      return `
        <details class="level-block">
          <summary>${name}</summary>
          <div class="level-content">${body}</div>
        </details>
      `.trim();
    })
    .filter(Boolean)
    .join('');
  const desc = lvlHtml
    ? `<div class="card-desc"><div class="levels">${lvlHtml}</div></div>`
    : '';
  const titleName = (!LVL.includes(p.nivå || '') && p.nivå)
    ? `${p.namn}: ${handlingName(p, p.nivå)}`
    : p.namn;
  return `<li class="card entry-card"><div class="card-title"><span>${titleName}</span></div>${desc}</li>`;
}

function buildConflictsHtml(list, { wrap = true } = {}){
  if(!list.length){
    const emptyLi = '<li class="card entry-card">Inga konflikter.</li>';
    return wrap
      ? `<ul class="card-list entry-card-list" data-entry-page="conflict">${emptyLi}</ul>`
      : emptyLi;
  }

  const cats = {};
  list.forEach(p=>{
    const cat = charCategory(p);
    (cats[cat] ||= []).push(p);
  });

  const catKeys = Object.keys(cats).sort(catComparator);
  const html = catKeys.map(cat => {
    const items = cats[cat].map(conflictEntryHtml).join('');
    return `
      <li class="cat-group">
        <details open>
          <summary>${catName(cat)}</summary>
          <ul class="card-list entry-card-list" data-entry-page="conflict">${items}</ul>
        </details>
      </li>`;
  }).join('');

  if (!wrap) return html;
  return `<ul class="card-list entry-card-list" data-entry-page="conflict">${html}</ul>`;
}

function ensureToolbarControls(onReady) {
  const toolbar = document.querySelector('shared-toolbar');
  if (!toolbar) {
    return false;
  }

  const rerun = () => {
    toolbar.__indexControlsPending = false;
    if (ensureToolbarControls(onReady) && typeof onReady === 'function') {
      onReady();
    }
  };

  const registerRerun = () => {
    if (toolbar.__indexControlsPending) return;
    toolbar.__indexControlsPending = true;
    toolbar.addEventListener('toolbar-rendered', rerun, { once: true });
  };

  const { shadowRoot } = toolbar;
  if (!shadowRoot) {
    registerRerun();
    return false;
  }

  const filterUnion = shadowRoot.getElementById('filterUnion');
  const entryViewToggle = shadowRoot.getElementById('entryViewToggle');
  if (filterUnion && entryViewToggle) {
    dom.filterUnion = filterUnion;
    dom.entryViewToggle = entryViewToggle;
    return true;
  }

  registerRerun();
  return false;
}

function initIndex() {
  if (!ensureToolbarControls(() => initIndex())) {
    return;
  }
  const createEntryCard = window.entryCardFactory.create;
  if (dom.cName) {
    dom.cName.textContent = store.characters.find(c => c.id === store.current)?.name || '';
  }
  const F = { search:[], typ:[], ark:[], test:[] };
  const INTERNAL_SEARCH_TERMS = new Set(['lol','molly<3']);
  const scrubInternalSearchTerms = () => {
    const filtered = F.search.filter(term => {
      const lower = String(term || '').toLowerCase();
      return !INTERNAL_SEARCH_TERMS.has(lower);
    });
    const changed = filtered.length !== F.search.length;
    if (changed) {
      F.search = filtered;
    }
    return changed;
  };
  const LEVEL_IDX = { '':0, Novis:1, 'Ges\u00e4ll':2, 'M\u00e4stare':3 };
  let sTemp = '';
  let union = storeHelper.getFilterUnion(store);
  dom.filterUnion.classList.toggle('active', union);
  let compact = storeHelper.getCompactEntries(store);
  dom.entryViewToggle.classList.toggle('active', !compact);
  let catsMinimized = false;
  let showArtifacts = false;
  let revealedArtifacts = new Set(storeHelper.getRevealedArtifacts(store));
  let revealedArtifactsVersion = 0;
  const SECRET_SEARCH = { 'pajkastare': 'ar86' };
  const SECRET_IDS = new Set(Object.values(SECRET_SEARCH));
  const ONLY_SELECTED_VALUE = '__onlySelected';
  const ONLY_SELECTED_LABEL = 'Endast valda';
  // Open matching categories once after certain actions (search/type select)
  let openCatsOnce = new Set();
  // (Removed) Hoppsan no longer auto-syncs with other categories
  // If set, override filtered list with these entries (from Random:N)
  let fixedRandomEntries = null;

  const STATE_KEY = 'indexViewState';
  let catState = {};
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
    catch { return {}; }
  };
  const saveState = () => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ filters: F, cats: catState })); }
    catch {}
  };
  {
    const saved = loadState();
    if (saved.filters) {
      ['search','typ','ark','test'].forEach(k => {
        if (Array.isArray(saved.filters[k])) F[k] = saved.filters[k];
      });
      scrubInternalSearchTerms();
    }
    catState = saved.cats || {};
  }

  const ENTRY_META_FIELD = '__entryMeta';
  const toArray = (value) => (Array.isArray(value) ? value : []);

  const fallbackEnsureEntryMeta = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    if (entry[ENTRY_META_FIELD]) return entry[ENTRY_META_FIELD];
    const safeString = (value) => String(value ?? '').trim();
    const toLower = (value) => safeString(value).toLowerCase();
    const normFn = typeof searchNormalize === 'function'
      ? searchNormalize
      : (value) => value;

    const lowerName = toLower(entry.namn);
    const normName = normFn(lowerName);
    const levelText = Object.values(entry.nivåer || {})
      .map(toLower)
      .join(' ');
    const descText = toLower(entry.beskrivning);
    const combined = `${lowerName} ${descText} ${levelText}`.trim();
    const normText = normFn(combined);

    const normalizeList = (list) => toArray(list)
      .map(safeString)
      .filter(Boolean);

    const tags = entry.taggar || {};
    const typList = normalizeList(tags.typ);
    let arkList = [];
    try {
      const exploded = typeof explodeTags === 'function' ? explodeTags(tags.ark_trad) : [];
      arkList = normalizeList(exploded);
    } catch {
      arkList = [];
    }
    if (!arkList.length && Array.isArray(tags.ark_trad)) {
      arkList = ['Traditionslös'];
    }
    const testList = normalizeList(tags.test);
    const secondaryTags = [...arkList, ...testList];
    const allTagsNormalized = new Set(
      [...typList, ...secondaryTags].map(tag => normFn(tag.toLowerCase()))
    );
    const allTags = new Set([...typList, ...secondaryTags]);

    const meta = {
      normName,
      normText,
      typList,
      primaryType: typList[0] || 'Övrigt',
      primaryTypeLower: (typList[0] || 'Övrigt').toLowerCase(),
      arkList,
      testList,
      secondaryTags,
      secondaryLookup: new Set(secondaryTags.map(tag => normFn(tag.toLowerCase()))),
      allTagsNormalized,
      allTags
    };

    Object.defineProperty(entry, ENTRY_META_FIELD, {
      value: meta,
      enumerable: false,
      configurable: true
    });
    return meta;
  };

  const ensureEntryMeta = (entry) => {
    if (typeof window.ensureEntryMeta === 'function') {
      return window.ensureEntryMeta(entry);
    }
    return fallbackEnsureEntryMeta(entry);
  };

  const ensureEntryMetaList = (list) => {
    if (typeof window.ensureEntryMetaList === 'function') {
      return window.ensureEntryMetaList(list);
    }
    toArray(list).forEach(fallbackEnsureEntryMeta);
    return list;
  };

  const entryCache = {
    baseKey: '',
    baseEntries: [],
    filteredKey: '',
    filteredEntries: []
  };

  const filteredResultCache = {
    key: '',
    entries: null
  };

  const invalidateFilteredResults = () => {
    filteredResultCache.key = '';
    filteredResultCache.entries = null;
  };

  const touchFilteredCache = () => {
    entryCache.filteredKey = '';
    invalidateFilteredResults();
  };

  const bumpRevealedArtifactsVersion = () => {
    revealedArtifactsVersion += 1;
    touchFilteredCache();
  };

  const hiddenPrimaryTypes = new Set(['artefakt', 'kuriositet', 'skatt']);

  const buildBaseEntries = () => {
    const versions = window.__entryDataVersions || { db: 0, tables: 0 };
    const customVersion = typeof storeHelper.getCustomEntriesVersion === 'function'
      ? storeHelper.getCustomEntriesVersion(store)
      : 0;
    const key = [
      versions.db,
      versions.tables,
      customVersion,
      store.current || ''
    ].join('|');
    if (entryCache.baseKey !== key) {
      const customEntries = storeHelper.getCustomEntries(store) || [];
      ensureEntryMetaList(customEntries);
      const base = [
        ...(Array.isArray(DB) ? DB : []),
        ...(Array.isArray(window.TABELLER) ? window.TABELLER : []),
        ...customEntries
      ];
      ensureEntryMetaList(base);
      entryCache.baseEntries = base;
      entryCache.baseKey = key;
      entryCache.filteredKey = '';
      hiddenNameIndex = null;
    }
    return entryCache.baseEntries;
  };

  const isHidden = (entry) => {
    const meta = ensureEntryMeta(entry);
    const primary = meta?.primaryTypeLower || '';
    return hiddenPrimaryTypes.has(primary);
  };

  const buildFilteredEntries = () => {
    const base = buildBaseEntries();
    const revealedVersion = typeof storeHelper.getRevealedArtifactsVersion === 'function'
      ? storeHelper.getRevealedArtifactsVersion(store)
      : 0;
    const key = [
      entryCache.baseKey,
      showArtifacts ? '1' : '0',
      revealedVersion,
      revealedArtifactsVersion
    ].join('|');
    if (entryCache.filteredKey !== key) {
      const filtered = base.filter(entry => {
        if (!entry || SECRET_IDS.has(entry.id)) return false;
        if (showArtifacts) return true;
        return !isHidden(entry) || revealedArtifacts.has(entry.id);
      });
      entryCache.filteredEntries = filtered;
      entryCache.filteredKey = key;
      invalidateFilteredResults();
    }
    return entryCache.filteredEntries;
  };

  const getEntries = () => buildFilteredEntries();

  const hasArtifactTag = entry => {
    const meta = ensureEntryMeta(entry);
    return (meta?.typList || []).some(t => t.toLowerCase() === 'artefakt');
  };

  let hiddenNameIndex = null;
  const getHiddenNameIndex = () => {
    const dbArr = Array.isArray(DB) ? DB : [];
    if (hiddenNameIndex && hiddenNameIndex.size === dbArr.length) {
      return hiddenNameIndex.map;
    }
    const map = new Map();
    dbArr.forEach(ent => {
      if (!isHidden(ent) || SECRET_IDS.has(ent.id)) return;
      const key = searchNormalize(String(ent.namn || '').toLowerCase());
      if (!key) return;
      if (!map.has(key)) map.set(key, ent.id);
    });
    hiddenNameIndex = { map, size: dbArr.length };
    return map;
  };

  const FALT_BUNDLE = ['di10','di11','di12','di13','di14','di15'];
  const STACKABLE_IDS = ['l1','l11','l27','l6','l12','l13','l28','l30'];

  const QUAL_TYPE_MAP = {
    'Vapenkvalitet': 'Vapen',
    'Rustningskvalitet': 'Rustning',
    'Sköldkvalitet': 'Sköld',
    'Allmän kvalitet': 'Allmänt'
  };
  const QUAL_TYPE_KEYS = Object.keys(QUAL_TYPE_MAP);
  const DOCK_TAG_TYPES = new Set(['Fördel','Nackdel','Särdrag','Monstruöst särdrag','Ritual','Mystisk kraft','Förmåga']);

  const levelLetter = (lvl) => {
    const text = String(lvl || '').trim();
    if (!text) return '';
    if (text === 'Mästare') return 'M';
    if (text === 'Gesäll') return 'G';
    if (text === 'Novis') return 'N';
    return text.charAt(0).toUpperCase();
  };

  const normalizeMatchValue = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return String(val);
    return val;
  };

  const normalizeId = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'number') return String(val);
    return String(val).trim();
  };

  const entrySignature = (ent) => {
    if (!ent || typeof ent !== 'object') return '';
    const norm = value => String(value ?? '').trim().toLowerCase();
    const parts = [];
    if (ent.id !== undefined && ent.id !== null && String(ent.id).trim() !== '') {
      parts.push(`id:${norm(ent.id)}`);
    } else if (ent.namn !== undefined && ent.namn !== null) {
      parts.push(`name:${norm(ent.namn)}`);
    }
    if (ent.trait !== undefined && ent.trait !== null && String(ent.trait).trim() !== '') {
      parts.push(`trait:${norm(ent.trait)}`);
    }
    if (ent.race !== undefined && ent.race !== null && String(ent.race).trim() !== '') {
      parts.push(`race:${norm(ent.race)}`);
    }
    if (ent.form !== undefined && ent.form !== null && String(ent.form).trim() !== '') {
      parts.push(`form:${norm(ent.form)}`);
    }
    if (ent.nivå !== undefined && ent.nivå !== null && String(ent.nivå).trim() !== '') {
      parts.push(`level:${norm(ent.nivå)}`);
    }
    return parts.join('|');
  };

  const findMatchingListEntry = (list, entry, options = {}) => {
    if (!Array.isArray(list) || !entry || typeof entry !== 'object') return null;
    const wantsLevel = Object.prototype.hasOwnProperty.call(options, 'level')
      || Object.prototype.hasOwnProperty.call(entry, 'nivå');
    const wantsTrait = Object.prototype.hasOwnProperty.call(options, 'trait')
      || Object.prototype.hasOwnProperty.call(entry, 'trait');
    const desiredLevel = Object.prototype.hasOwnProperty.call(options, 'level')
      ? normalizeMatchValue(options.level)
      : normalizeMatchValue(entry.nivå);
    const desiredTrait = Object.prototype.hasOwnProperty.call(options, 'trait')
      ? normalizeMatchValue(options.trait)
      : normalizeMatchValue(entry.trait);
    const targetSig = entrySignature({
      ...entry,
      trait: Object.prototype.hasOwnProperty.call(options, 'trait') ? options.trait : entry.trait,
      nivå: Object.prototype.hasOwnProperty.call(options, 'level') ? options.level : entry.nivå
    });
    let fallbackById = null;
    let fallbackByName = null;
    let fallbackBySig = null;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (item === entry) return item;
      const sameId = entry.id != null && item.id != null
        && normalizeId(item.id) === normalizeId(entry.id);
      const sameName = item.namn && entry.namn
        && String(item.namn).trim() === String(entry.namn).trim();
      const levelMatches = !wantsLevel || normalizeMatchValue(item.nivå) === desiredLevel;
      const traitMatches = !wantsTrait || normalizeMatchValue(item.trait) === desiredTrait;
      if ((sameId || sameName) && levelMatches && traitMatches) {
        return item;
      }
      if (sameId && !fallbackById) {
        fallbackById = item;
        continue;
      }
      if (sameName && !fallbackByName) {
        fallbackByName = item;
      }
      if (!fallbackBySig && targetSig && targetSig === entrySignature(item)) {
        fallbackBySig = item;
      }
    }
    return fallbackById || fallbackByName || fallbackBySig || null;
  };

  const flashAdded = (name, trait) => {
    const selector = `li[data-name="${CSS.escape(name)}"]${trait ? `[data-trait="${CSS.escape(trait)}"]` : ''}`;
    const root = dom.lista || document;
    const items = root.querySelectorAll(selector);
    const li = items?.[items.length - 1];
    if (li) {
      li.classList.add('inv-flash');
      setTimeout(() => li.classList.remove('inv-flash'), 1000);
    }
  };

  const getMonsterLoreSpecs = () => {
    const list = window.monsterLore?.SPECS;
    if (Array.isArray(list) && list.length) return list;
    return ['Bestar','Kulturvarelser','Odöda','Styggelser'];
  };

  const usedMonsterLoreSpecs = (list) => {
    if (!Array.isArray(list)) return [];
    return list
      .filter(x => x?.namn === 'Monsterlärd' && x.trait)
      .map(x => x.trait);
  };

  const flashRemoved = (name, trait) => {
    const selector = `li[data-name="${CSS.escape(name)}"]${trait ? `[data-trait="${CSS.escape(trait)}"]` : ''}`;
    const root = dom.lista || document;
    const items = root.querySelectorAll(selector);
    const li = items?.[items.length - 1];
    if (li) {
      li.classList.add('rm-flash');
      setTimeout(() => li.classList.remove('rm-flash'), 1000);
    }
  };

  const tabellInfoHtml = p => {
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    const cols = p.kolumner || [];
    const rows = p.rader || [];

    const head = `<tr>${cols.map(c => `<th>${cap(c)}</th>`).join('')}</tr>`;
    const body = rows
      .map(r => `<tr>${cols.map(c => {
        const v = r[c] ?? '';
        const dl = cap(c);
        return `<td data-label=\"${dl}\">${v}</td>`;
      }).join('')}</tr>`)
      .join('');
    const tableHtml = `<div class=\"table-wrap\"><table class=\"stack-mobile\"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    const extraHtml = p.extra ? `<div class=\"table-notes\">${formatText(p.extra)}</div>` : '';
    return `${tableHtml}${extraHtml}`;
  };

  // Inline highlight (wrap <mark>) for current search terms
  const buildNormMap = (str) => {
    const low = String(str || '').toLowerCase();
    let norm = '';
    const map = [];
    for (let i = 0; i < low.length; i++) {
      const ch = low[i];
      const n = searchNormalize(ch);
      norm += n;
      for (let k = 0; k < n.length; k++) map.push(i);
    }
    return { norm, map };
  };

  const highlightTextNode = (node, termsNorm) => {
    const text = node.nodeValue;
    if (!text || !text.trim()) return;
    const { norm, map } = buildNormMap(text);
    const ranges = [];
    for (const term of termsNorm) {
      if (!term) continue;
      let start = 0;
      while (true) {
        const idx = norm.indexOf(term, start);
        if (idx === -1) break;
        const s = map[idx];
        const e = map[idx + term.length - 1] + 1; // exclusive
        if (s != null && e != null && e > s) ranges.push([s, e]);
        start = idx + Math.max(1, term.length);
      }
    }
    if (!ranges.length) return;
    ranges.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [s,e] of merged) {
      if (pos < s) frag.appendChild(document.createTextNode(text.slice(pos, s)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(s, e);
      frag.appendChild(mark);
      pos = e;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  };

  const highlightInElement = (el, termsNorm) => {
    if (!el || !termsNorm || !termsNorm.length) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = (p.nodeName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'mark') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => highlightTextNode(n, termsNorm));
  };

  /* fyll dropdowns */
  const dropdownCache = {
    key: '',
    typ: [],
    ark: [],
    test: []
  };

  const categoryCache = {
    key: '',
    map: new Map(),
    list: []
  };

  const getCategoryIndex = () => {
    const entries = getEntries();
    const key = entryCache.filteredKey;
    if (categoryCache.key !== key) {
      const map = new Map();
      const set = new Set();
      entries.forEach(entry => {
        const meta = ensureEntryMeta(entry) || {};
        (meta.typList || []).forEach(tag => {
          const norm = searchNormalize(String(tag || '').toLowerCase());
          if (norm && !map.has(norm)) map.set(norm, tag);
          if (tag) set.add(tag);
        });
      });
      categoryCache.key = key;
      categoryCache.map = map;
      categoryCache.list = Array.from(set).sort((a,b) => (typeof compareSv === 'function'
        ? compareSv(a, b)
        : a.localeCompare(b, 'sv')));
    }
    return categoryCache.map;
  };

  const getCategoryList = () => {
    getCategoryIndex();
    return categoryCache.list;
  };

  const fillDropdowns = ()=>{
    const entries = getEntries();
    const cacheKey = entryCache.filteredKey;
    if (dropdownCache.key !== cacheKey) {
      const sets = { typ: new Set(), ark: new Set(), test: new Set() };
      entries.forEach(entry => {
        const meta = ensureEntryMeta(entry) || {};
        (meta.typList || []).forEach(tag => sets.typ.add(tag));
        (meta.arkList || []).forEach(tag => sets.ark.add(tag));
        (meta.testList || []).forEach(tag => sets.test.add(tag));
      });
      dropdownCache.key = cacheKey;
      dropdownCache.typ = Array.from(sets.typ).sort((a,b) => a.localeCompare(b));
      dropdownCache.ark = Array.from(sets.ark).sort((a,b) => a.localeCompare(b));
      dropdownCache.test = Array.from(sets.test).sort((a,b) => a.localeCompare(b));
    }
    const fill = (sel, values, label, extra = []) => {
      if (!sel) return;
      const opts = [`<option value="">${label} (alla)</option>`];
      extra.forEach(opt => {
        const text = String(opt?.label || '').trim();
        if (!text) return;
        const value = String(opt?.value ?? '');
        opts.push(`<option value="${value}">${text}</option>`);
      });
      values.forEach(value => {
        const text = String(value || '').trim();
        if (text) opts.push(`<option>${text}</option>`);
      });
      const markup = opts.join('');
      if (sel.dataset.optionCache !== markup) {
        sel.innerHTML = markup;
        sel.dataset.optionCache = markup;
      }
    };
    fill(dom.typSel , dropdownCache.typ ,'Typ', [{ value: ONLY_SELECTED_VALUE, label: ONLY_SELECTED_LABEL }]);
    fill(dom.arkSel , dropdownCache.ark ,'Arketyp');
    fill(dom.tstSel , dropdownCache.test,'Test');
  };
  fillDropdowns();

  const updateSearchDatalist = () => {
    window.globalSearch?.refreshSuggestions?.();
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  const buildRandomSuggestionHtml = (query) => {
    const q = String(query || '');
    const match = q.match(/^\s*(\d+)?\s*(random|slump)\s*:\s*(.*)$/i);
    if (!match) return '';
    const num = (match[1] || '').trim();
    const prefix = match[2];
    const part = searchNormalize((match[3] || '').toLowerCase());
    const cats = getCategoryList()
      .filter(cat => {
        const key = searchNormalize(String(cat || '').toLowerCase());
        return part ? key.includes(part) : true;
      });
    if (!cats.length) return '';
    return cats.map((cat, i) => {
      const base = prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
      const text = `${num ? (num + ' ') : ''}${base}: ${cat}`;
      const disp = text.charAt(0).toUpperCase() + text.slice(1);
      return `<div class="item" data-idx="rand-${i}" data-val="${escapeHtml(text)}" data-cat="${escapeHtml(cat)}" data-count="${escapeHtml(num || '1')}" data-cmd="random">${escapeHtml(disp)}</div>`;
    }).join('');
  };

  const clearSearchInput = ({ blur = true } = {}) => {
    if (dom.sIn) dom.sIn.value = '';
    sTemp = '';
    window.globalSearch?.hideSuggestions?.();
    if (blur && dom.sIn) {
      window.__searchBlurGuard = true;
      try { dom.sIn.blur(); } catch {}
    }
  };

  const takePendingIndexSearch = () => {
    try {
      const stored = sessionStorage.getItem('__pendingIndexSearch');
      if (stored !== null) sessionStorage.removeItem('__pendingIndexSearch');
      return String(stored || '').trim();
    } catch {
      return '';
    }
  };

  const applyIndexSearchTerm = (value, { scroll = true } = {}) => {
    const term = String(value || '').trim();
    const union = storeHelper.getFilterUnion(store);
    if (term) {
      if (union) {
        if (!F.search.includes(term)) F.search.push(term);
      } else {
        F.search = [term];
      }
    } else {
      F.search = [];
    }
    scrubInternalSearchTerms();
    invalidateFilteredResults();
    if (term) {
      const norm = searchNormalize(term.toLowerCase());
      const match = getEntries().find(p => searchNormalize(String(p.namn || '').toLowerCase()) === norm);
      const cat = match?.taggar?.typ?.[0];
      if (cat) openCatsOnce.add(cat);
      if (window.storeHelper?.addRecentSearch) {
        storeHelper.addRecentSearch(store, term);
      }
    }
    clearSearchInput();
    activeTags();
    scheduleRenderList();
    if (scroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleRandomSuggestion = (dataset) => {
    const cat = dataset.cat || '';
    const count = Math.max(1, parseInt(dataset.count || '1', 10) || 1);
    const pool = getEntries().filter(p => (p.taggar?.typ || []).includes(cat));
    if (!pool.length) {
      if (window.alertPopup) alertPopup(`Hittade inga poster i kategorin: ${cat}`);
      clearSearchInput();
      return true;
    }
    const picks = [];
    const indices = pool.map((_, idx) => idx);
    const drawCount = Math.min(count, pool.length);
    for (let i = 0; i < drawCount; i++) {
      const index = Math.floor(Math.random() * indices.length);
      const [pickedIdx] = indices.splice(index, 1);
      picks.push(pool[pickedIdx]);
    }
    fixedRandomEntries = picks;
    fixedRandomInfo = { cat, count: picks.length };
    invalidateFilteredResults();
    const catName = cat || picks[0]?.taggar?.typ?.[0];
    if (catName) openCatsOnce.add(catName);
    clearSearchInput();
    activeTags();
    scheduleRenderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };

  const handleIndexSearchSubmit = (term, opts = {}) => {
    const raw = String(term || '').trim();
    if (!raw) {
      F.search = [];
      invalidateFilteredResults();
      clearSearchInput(opts);
      activeTags();
      scheduleRenderList();
      return true;
    }
    const lower = raw.toLowerCase();
    if (lower === 'webapp') {
      const ua = navigator.userAgent.toLowerCase();
      let anchor = 'general';
      if (/iphone|ipad|ipod/.test(ua)) anchor = 'ios';
      else if (/android/.test(ua)) anchor = 'android';
      else if (/edg|edge/.test(ua)) anchor = 'edge';
      else if (/firefox/.test(ua)) anchor = 'firefox';
      else if (/chrome/.test(ua)) anchor = 'chrome';
      window.open(`webapp.html#${anchor}`, '_blank');
      clearSearchInput(opts);
      return true;
    }
    if (lower === 'lol') {
      F.search = [];
      F.typ = [];
      F.ark = [];
      F.test = [];
      fixedRandomEntries = null;
      fixedRandomInfo = null;
      invalidateFilteredResults();
      clearSearchInput(opts);
      if (dom.typSel) dom.typSel.value = '';
      if (dom.arkSel) dom.arkSel.value = '';
      if (dom.tstSel) dom.tstSel.value = '';
      storeHelper.setOnlySelected(store, false);
      storeHelper.clearRevealedArtifacts(store);
      revealedArtifacts = new Set(storeHelper.getRevealedArtifacts(store));
      bumpRevealedArtifactsVersion();
      if (showArtifacts) {
        showArtifacts = false;
        touchFilteredCache();
      }
      fillDropdowns();
      activeTags();
      scheduleRenderList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    if (lower === 'molly<3') {
      const removed = scrubInternalSearchTerms();
      if (removed) invalidateFilteredResults();
      showArtifacts = true;
      touchFilteredCache();
      clearSearchInput(opts);
      fillDropdowns();
      activeTags();
      scheduleRenderList();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    const randomMatch = raw.match(/^\s*(\d+)?\s*(random|slump)\s*:\s*(.+)$/i);
    if (randomMatch) {
      const requested = Math.max(1, parseInt(randomMatch[1] || '1', 10) || 1);
      const catInput = (randomMatch[3] || '').trim();
      if (catInput) {
        const normalizedCat = searchNormalize(catInput.toLowerCase());
        const categoryIndex = getCategoryIndex();
        const canonical = categoryIndex.get(normalizedCat);
        if (!canonical) {
          if (window.alertPopup) alertPopup(`Okänd kategori: ${catInput}`);
          clearSearchInput(opts);
          return true;
        }
        const pool = getEntries().filter(p => (p.taggar?.typ || []).includes(canonical));
        if (!pool.length) {
          if (window.alertPopup) alertPopup(`Hittade inga poster i kategorin: ${catInput}`);
          clearSearchInput(opts);
          return true;
        }
        const picks = [];
        const idxs = pool.map((_, idx) => idx);
        const drawCount = Math.min(requested, pool.length);
        for (let i = 0; i < drawCount; i++) {
          const index = Math.floor(Math.random() * idxs.length);
          const [pickedIdx] = idxs.splice(index, 1);
          picks.push(pool[pickedIdx]);
        }
        fixedRandomEntries = picks;
        fixedRandomInfo = { cat: canonical, count: picks.length };
        invalidateFilteredResults();
        const catName = canonical || picks[0]?.taggar?.typ?.[0];
        if (catName) openCatsOnce.add(catName);
        clearSearchInput(opts);
        activeTags();
        scheduleRenderList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
    }
    if (tryBomb(raw)) {
      clearSearchInput();
      return true;
    }
    if (tryNilasPopup(raw)) {
      clearSearchInput();
      return true;
    }
    applyIndexSearchTerm(raw, opts);
    return true;
  };

  if (window.globalSearch) {
    window.globalSearch.setContext({
      name: 'index',
      getEntrySource: () => getEntries(),
      buildExtraSuggestions: (query) => buildRandomSuggestionHtml(query),
      handleDataset: (dataset) => {
        if (dataset.cmd === 'random') return handleRandomSuggestion(dataset);
        if (dataset.entry) {
          applyIndexSearchTerm(dataset.entry);
          return true;
        }
        return false;
      },
      handleSubmit: (term) => handleIndexSearchSubmit(term),
      onQueryChanged: (value) => {
        sTemp = String(value || '').trim();
      }
    });
  }
  window.handleIndexSearchTerm = (term, opts) => {
    handleIndexSearchSubmit(term, opts);
  };
  updateSearchDatalist();

  const pendingSearch = takePendingIndexSearch();

  /* render helpers */
  const activeTags =()=>{
    dom.active.innerHTML='';
    const push=t=>dom.active.insertAdjacentHTML('beforeend',t);
    if (storeHelper.getOnlySelected(store)) {
      push('<span class="tag removable" data-type="onlySel">Endast valda ✕</span>');
    }
    if (fixedRandomEntries && fixedRandomEntries.length) {
      const cnt = fixedRandomEntries.length;
      const cat = (window.catName ? (fixedRandomInfo?.cat || '') : (fixedRandomInfo?.cat || ''));
      const labelCat = cat ? (window.catName ? catName(cat) : cat) : 'Urval';
      const label = `Random: ${labelCat} ×${cnt}`;
      push(`<span class="tag removable" data-type="random" data-cat="${fixedRandomInfo?.cat || ''}" data-count="${cnt}">${label} ✕</span>`);
    }
    F.search.forEach(v=>push(`<span class="tag removable" data-type="search" data-val="${v}">${v} ✕</span>`));
    F.typ .forEach(v=>push(`<span class="tag removable" data-type="typ" data-val="${v}">${v} ✕</span>`));
    F.ark .forEach(v=>push(`<span class="tag removable" data-type="ark" data-val="${v}">${v} ✕</span>`));
    F.test.forEach(v=>push(`<span class="tag removable" data-type="test" data-val="${v}">${v} ✕</span>`));
  };

  const buildFilterCacheKey = ({
    baseKey,
    unionFlag,
    onlySelected,
    selectedNames,
    terms,
    combinedFilters,
    randomNames
  }) => [
    baseKey,
    unionFlag,
    onlySelected,
    selectedNames,
    terms.join('\u0001'),
    combinedFilters.join('\u0001'),
    randomNames.join('\u0001')
  ].join('||');

  const filtered = () => {
    union = storeHelper.getFilterUnion(store);
    const onlySel = storeHelper.getOnlySelected(store);
    const terms = F.search
      .map(t => searchNormalize(t.toLowerCase()));
    let baseEntries = getEntries();
    let randomNames = [];
    if (fixedRandomEntries && fixedRandomEntries.length) {
      randomNames = fixedRandomEntries.map(e => e.namn || '').filter(Boolean);
      const allowed = new Set(randomNames);
      baseEntries = baseEntries.filter(p => allowed.has(p.namn));
    }
    let selectedNamesKey = '';
    let nameSet = null;
    if (onlySel) {
      const currentList = storeHelper.getCurrentList(store);
      const names = currentList
        .map(x => x?.namn || '')
        .filter(Boolean);
      nameSet = new Set(names);
      selectedNamesKey = names.slice().sort().join('\u0001');
    }
    const combinedFilters = [...F.typ, ...F.ark, ...F.test];
    const cacheKey = buildFilterCacheKey({
      baseKey: entryCache.filteredKey,
      unionFlag: union ? '1' : '0',
      onlySelected: onlySel ? '1' : '0',
      selectedNames: selectedNamesKey,
      terms,
      combinedFilters,
      randomNames
    });
    if (filteredResultCache.key === cacheKey && filteredResultCache.entries) {
      return filteredResultCache.entries;
    }
    if (!fixedRandomEntries && combinedFilters.length === 0 && F.search.length === 1) {
      const term = terms[0];
      const specialId = SECRET_SEARCH[term];
      if (specialId) {
        const hid = lookupEntry({ id: specialId });
        if (hid) {
          const cat = hid.taggar?.typ?.[0];
          if (cat) openCatsOnce.add(cat);
          filteredResultCache.entries = [hid];
          filteredResultCache.key = cacheKey;
          return filteredResultCache.entries;
        }
      }
      if (!showArtifacts) {
        const hiddenIndex = getHiddenNameIndex();
        const hiddenId = hiddenIndex.get(term);
        const hid = hiddenId !== undefined ? lookupEntry({ id: hiddenId }) : null;
        if (hid) {
          if (!revealedArtifacts.has(hid.id)) {
            revealedArtifacts.add(hid.id);
            storeHelper.addRevealedArtifact(store, hid.id);
            bumpRevealedArtifactsVersion();
            fillDropdowns();
          }
          const cat = hid.taggar?.typ?.[0];
          if (cat) openCatsOnce.add(cat);
          filteredResultCache.entries = [hid];
          filteredResultCache.key = cacheKey;
          return filteredResultCache.entries;
        }
      }
    }
    const hasFilterTags = combinedFilters.length > 0;
    const result = baseEntries.filter(entry => {
      const meta = ensureEntryMeta(entry) || {};
      const text = meta.normText || '';
      const hasTerms = terms.length > 0;
      const txtHit = hasTerms && (
        union ? terms.some(q => text.includes(q))
               : terms.every(q => text.includes(q))
      );
      const tagSet = meta.allTags || new Set();
      const tagHit = hasFilterTags && (
        union
          ? combinedFilters.some(tag => tagSet.has(tag))
          : combinedFilters.every(tag => tagSet.has(tag))
      );
      const tagOk = !hasFilterTags || tagHit;
      const txtOk  = !hasTerms || txtHit;
      const selOk = !onlySel || nameSet.has(entry.namn);
      const combinedOk = union
        ? ((hasFilterTags || hasTerms) ? (tagHit || txtHit) : true)
        : (tagOk && txtOk);
      return combinedOk && selOk;
    }).sort(createSearchSorter(terms));
    filteredResultCache.entries = result;
    filteredResultCache.key = cacheKey;
    return filteredResultCache.entries;
  };

  const renderList = arr=>{
    const sortMode = storeHelper.getEntrySort
      ? storeHelper.getEntrySort(store)
      : (typeof ENTRY_SORT_DEFAULT !== 'undefined' ? ENTRY_SORT_DEFAULT : 'alpha-asc');
    const entrySorter = typeof entrySortComparator === 'function'
      ? entrySortComparator(sortMode)
      : ((a, b) => (typeof compareSv === 'function'
          ? compareSv(a?.namn || '', b?.namn || '')
          : String(a?.namn || '').localeCompare(String(b?.namn || ''), 'sv')));
    const cardKeyFromEl = el => {
      const id = el.dataset.id || el.dataset.name || '';
      const level = el.dataset.level || '';
      const trait = el.dataset.trait || '';
      return `${id}|${level}|${trait}`;
    };
    const prevCards = [...dom.lista.querySelectorAll('li.card.entry-card')];
    const openCardKeys = new Set(prevCards.filter(li => !li.classList.contains('compact')).map(cardKeyFromEl));
    const compactCardKeys = new Set(prevCards.filter(li => li.classList.contains('compact')).map(cardKeyFromEl));
    const openCats = new Set(
      [...dom.lista.querySelectorAll('.cat-group > details[open]')]
        .map(d => d.dataset.cat)
    );
    const fragment = document.createDocumentFragment();
    // Always render list; a fallback "Hoppsan" category is appended last.
    const charList = storeHelper.getCurrentList(store);
    const invList  = storeHelper.getInventory(store);
    const compact = storeHelper.getCompactEntries(store);
    const cats = {};
    const terms = F.search
      .map(t => searchNormalize(t.toLowerCase()));
    const searchActive = terms.length > 0;
    const catNameMatch = {};
    arr.forEach(p=>{
      const meta = ensureEntryMeta(p) || {};
      const cat = meta.primaryType || p.taggar?.typ?.[0] || 'Övrigt';
      (cats[cat] ||= []).push(p);
      if (searchActive) {
        const name = meta.normName || searchNormalize((p.namn || '').toLowerCase());
        const union = storeHelper.getFilterUnion(store);
        const nameOk = union ? terms.some(q => name.includes(q))
                             : terms.every(q => name.includes(q));
        if (nameOk) {
          catNameMatch[cat] = true;
        }
      }
    });
    const catKeys = Object.keys(cats);
    catKeys.sort((a,b)=>{
      if (searchActive) {
        const aMatch = catNameMatch[a] ? 1 : 0;
        const bMatch = catNameMatch[b] ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return catComparator(a,b);
    });
    catKeys.forEach(cat=>{
      cats[cat].sort(entrySorter);
      const catLi=document.createElement('li');
      catLi.className='cat-group';
      // Allow temporary "open once" categories to override saved state
      const shouldOpen = openCatsOnce.has(cat) || (catState[cat] !== undefined ? catState[cat] : openCats.has(cat));
      catLi.innerHTML=`<details data-cat="${cat}"${shouldOpen ? ' open' : ''}><summary>${catName(cat)}</summary><ul class="card-list entry-card-list"></ul></details>`;
      const detailsEl = catLi.querySelector('details');
      const listEl=catLi.querySelector('ul');
      detailsEl.addEventListener('toggle', (ev) => {
        updateCatToggle();
        if (!ev.isTrusted) return;
        catState[cat] = detailsEl.open;
        saveState();
      });
      cats[cat].forEach(p=>{
        const meta = ensureEntryMeta(p) || {};
        if (p.kolumner && p.rader) {
          const infoHtml = tabellInfoHtml(p);
          const infoBtn = `<button class="char-btn icon icon-only info-btn" data-info="${encodeURIComponent(infoHtml)}" data-tabell="1" aria-label="Visa info">${icon('info')}</button>`;
          const dataset = { name: p.namn };
          if (p.id) dataset.id = p.id;
          const visibleTags = (meta.typList || [])
            .filter(t => t && !/^tabell(er)?$/i.test(t));
          const tagsHtml = visibleTags.length
            ? visibleTags.map(t => `<span class="tag">${t}</span>`).join(' ')
            : '';
          const li = createEntryCard({
            compact,
            dataset,
            nameHtml: p.namn,
            tagsHtml,
            titleActions: [infoBtn],
            collapsible: true
          });
          listEl.appendChild(li);
          const entryKey = cardKeyFromEl(li);
          if (openCardKeys.has(entryKey)) li.classList.remove('compact');
          else if (compactCardKeys.has(entryKey)) li.classList.add('compact');
          if (searchActive && terms.length) {
            const titleSpan = li.querySelector('.card-title .entry-title-main');
            if (titleSpan) highlightInElement(titleSpan, terms);
          }
          return;
        }
        let charEntry = findMatchingListEntry(charList, p) || null;
        const levelStr = typeof charEntry?.nivå === 'string' ? charEntry.nivå.trim() : '';
        const isEx = p.namn === 'Exceptionellt karakt\u00e4rsdrag';
        const charLevel = !isEx && levelStr ? levelStr : null;
        const curLvl = charLevel
          || LVL.find(l => p.nivåer?.[l]) || 'Novis';
        const availLvls = LVL.filter(l => p.nivåer?.[l]);
        const hasAnyLevel = availLvls.length > 0;
        const hasLevelSelect = availLvls.length > 1;
        if (curLvl != null) {
          const matchOpts = { level: curLvl };
          const traitSource = charEntry && Object.prototype.hasOwnProperty.call(charEntry, 'trait')
            ? charEntry.trait
            : (Object.prototype.hasOwnProperty.call(p, 'trait') ? p.trait : undefined);
          if (traitSource !== undefined) matchOpts.trait = traitSource;
          const refinedEntry = findMatchingListEntry(charList, p, matchOpts);
          if (refinedEntry) charEntry = refinedEntry;
        }
        const inChar = isEx ? false : !!charEntry;
        const levelOptionsHtml = hasLevelSelect
          ? availLvls.map(l => {
              const short = levelLetter(l);
              const selected = l === curLvl ? ' selected' : '';
              const shortAttr = short ? ` data-short="${short}"` : '';
              return `<option value="${l}"${shortAttr}${selected}>${l}</option>`;
            }).join('')
          : '';
        const lvlSel = hasLevelSelect
          ? `<select class="level" data-name="${p.namn}" aria-label="Välj nivå för ${p.namn}">
              ${levelOptionsHtml}
            </select>`
          : '';
        const hideDetails = isRas(p) || isYrke(p) || isElityrke(p);
        let desc = abilityHtml(p, charLevel || undefined);
        let cardDesc = desc;
        const infoMeta = [];
        let priceText = '';
        let weightVal = null;
        let capacityVal = null;
        const isVehicle = (meta.typList || []).includes('Färdmedel');
        let priceLabel = '';
        if (isInv(p)) {
          const statsHtml = itemStatHtml(p);
          desc += statsHtml;
          cardDesc += statsHtml;
          const baseQuals = [
            ...(p.taggar?.kvalitet ?? []),
            ...splitQuals(p.kvalitet)
          ];
          if (baseQuals.length) {
            const qhtml = baseQuals
              .map(q => `<span class="tag">${q}</span>`)
              .join(' ');
            const qualBlock = `<br>Kvalitet:<div class="tags">${qhtml}</div>`;
            desc += qualBlock;
            cardDesc += qualBlock;
          }
          if (p.grundpris) {
            priceText = formatMoney(invUtil.calcEntryCost(p));
            priceLabel = 'Pris:';
          }
          const baseW = p.vikt ?? p.stat?.vikt ?? 0;
          const massCnt = baseQuals.filter(q => q === 'Massivt').length;
          if (baseW || massCnt) {
            const w = baseW + massCnt;
            weightVal = formatWeight(w);
          }
          if (isVehicle) {
            const cap = p.stat?.bärkapacitet ?? null;
            if (cap != null) {
              capacityVal = cap;
            }
          }
        } else if (isEmployment(p)) {
          if (p.grundpris) {
            priceText = formatMoney(p.grundpris);
            priceLabel = 'Dagslön:';
          }
        } else if (isService(p)) {
          if (p.grundpris) {
            priceText = formatMoney(p.grundpris);
            priceLabel = 'Pris:';
          }
        }
        if (priceText) {
          infoMeta.push({ label: priceLabel.replace(/:$/, ''), value: priceText });
        }
        if (capacityVal != null) {
          infoMeta.push({ label: 'Bärkapacitet', value: capacityVal });
        }
        if (weightVal != null) {
          infoMeta.push({ label: 'Vikt', value: weightVal });
        }
        const infoBodyExtras = [];
        if (isRas(p) || isYrke(p) || isElityrke(p)) {
          const extra = yrkeInfoHtml(p);
          if (extra) infoBodyExtras.push(extra);
        }
        if (p.namn === 'Blodsband') {
          const races = charList.filter(c => c.namn === 'Blodsband').map(c => c.race).filter(Boolean);
          if (races.length) {
            const str = races.join(', ');
            const block = `<p><strong>Raser:</strong> ${str}</p>`;
            cardDesc += block;
            infoBodyExtras.push(`<div class="info-block info-block-extra">${block}</div>`);
          }
        }
        let spec = null;
        if (p.namn === 'Monsterlärd') {
          spec = charEntry?.trait || null;
          if (spec) {
            const block = `<p><strong>Specialisering:</strong> ${spec}</p>`;
            cardDesc += block;
            infoBodyExtras.push(`<div class="info-block info-block-extra">${block}</div>`);
          }
        }
        let infoBodyHtml = desc;
        if (infoBodyExtras.length) infoBodyHtml += infoBodyExtras.join('');
        const levelCapable = hasAnyLevel
          || Object.prototype.hasOwnProperty.call(charEntry || {}, 'nivå')
          || Object.prototype.hasOwnProperty.call(p, 'nivå');
        let xpInfo = null;
        if (!(isInv(p) || isEmployment(p) || isService(p))) {
          const xpOptions = {};
          if (charEntry) xpOptions.xpSource = charEntry;
          if (levelCapable) xpOptions.level = curLvl;
          xpInfo = computeIndexEntryXP(p, charList, xpOptions);
        }
        const xpVal = xpInfo?.value ?? null;
        const xpTag = xpInfo?.tagHtml || '';
        const renderFilterTag = (tag, extra = '') => `<span class="tag filter-tag" data-section="${tag.section}" data-val="${tag.value}"${extra}>${tag.label}</span>`;
        const filterTagData = [];
        const primaryTagParts = [];
        (meta.typList || []).forEach((t, idx) => {
          if (!t) return;
          const tag = { section: 'typ', value: t, label: QUAL_TYPE_MAP[t] || t, hidden: idx === 0 };
          filterTagData.push(tag);
          if (!tag.hidden) primaryTagParts.push(renderFilterTag(tag));
        });
        (meta.arkList || []).forEach(t => {
          if (!t) return;
          const tag = { section: 'ark', value: t, label: t, hidden: t === 'Traditionslös' };
          filterTagData.push(tag);
          if (!tag.hidden) primaryTagParts.push(renderFilterTag(tag));
        });
        (meta.testList || []).forEach(t => {
          if (!t) return;
          filterTagData.push({ section: 'test', value: t, label: t });
        });
        const primaryTagsHtml = primaryTagParts.join(' ');
        const visibleTagData = filterTagData.filter(tag => !tag.hidden);
        const dockableTagData = visibleTagData.filter(tag => tag.section !== 'typ' && tag.section !== 'ark');
        const filterTagHtml = dockableTagData.map(tag => renderFilterTag(tag));
        const infoFilterTagHtml = visibleTagData.map(tag => renderFilterTag(tag));
        let tagsHtml = filterTagHtml.join(' ');
        const lvlBadgeVal = hasAnyLevel ? curLvl : '';
        const lvlShort = levelLetter(lvlBadgeVal);
        const singleLevelTagHtml = (!hasLevelSelect && lvlShort && lvlBadgeVal)
          ? `<span class="tag level-tag" title="${lvlBadgeVal}">${lvlShort}</span>`
          : '';
        const infoTagParts = [xpTag].concat(infoFilterTagHtml).filter(Boolean);
        if (singleLevelTagHtml) infoTagParts.push(singleLevelTagHtml);
        const infoBoxTagParts = infoFilterTagHtml.filter(Boolean);
        if (singleLevelTagHtml) infoBoxTagParts.push(singleLevelTagHtml);
        const activeKeys = getActiveHandlingKeys(p);
        const currentChars = storeHelper.getCurrentList(store);
        const conflictPool = findConflictingEntries(p, currentChars);
        const conflictsHtml = (activeKeys.length && conflictPool.length)
          ? buildConflictsHtml(conflictPool)
          : '';
        const conflictWarn = conflictsHtml
          ? `<span class="tag filter-tag conflict-flag" title="Har konflikter med valda förmågor">${icon('active', { className: 'btn-icon conflict-icon', alt: 'Konflikt' }) || '⚠️'}</span>`
          : '';
        if (conflictWarn) infoBoxTagParts.unshift(conflictWarn);
        const infoBoxFacts = infoMeta.filter(meta => {
          if (!meta) return false;
          const value = meta.value;
          if (value === undefined || value === null || value === '') return false;
          const label = String(meta.label || '').toLowerCase();
          return label.includes('pris') || label.includes('dagslön') || label.includes('vikt');
        });
        const infoBoxFactParts = infoBoxFacts
          .map(f => {
            const label = String(f.label ?? '').trim();
            const value = String(f.value ?? '').trim();
            if (!label || !value) return '';
            return `<div class="card-info-fact"><span class="card-info-fact-label">${label}</span><span class="card-info-fact-value">${value}</span></div>`;
          })
          .filter(Boolean);
        let infoBoxContentHtml = '';
        if (isInv(p) && (infoBoxTagParts.length || infoBoxFactParts.length)) {
          const inlineTagsHtml = infoBoxTagParts.length
            ? `<div class="card-info-tags tags">${infoBoxTagParts.join(' ')}</div>`
            : '';
          const inlineFactsHtml = infoBoxFactParts.length
            ? `<div class="card-info-facts">${infoBoxFactParts.join('')}</div>`
            : '';
          const inlineParts = [inlineTagsHtml, inlineFactsHtml]
            .filter(Boolean)
            .join('');
          infoBoxContentHtml = inlineParts
            ? `<div class="card-info-inline">${inlineParts}</div>`
            : '';
        } else {
          const infoBoxTagsHtml = infoBoxTagParts.length
            ? `<div class="card-info-tags tags">${infoBoxTagParts.join(' ')}</div>`
            : '';
          const infoBoxFactsHtml = infoBoxFactParts.length
            ? `<div class="card-info-facts">${infoBoxFactParts.join('')}</div>`
            : '';
          infoBoxContentHtml = `${infoBoxTagsHtml}${infoBoxFactsHtml}`;
        }
        const infoBoxHtml = infoBoxContentHtml
          ? `<div class="card-info-box">${infoBoxContentHtml}</div>`
          : '';
        const dockPrimary = (p.taggar?.typ || [])[0] || '';
        const shouldDockTags = DOCK_TAG_TYPES.has(dockPrimary);
        const renderDockedTags = (tags, extraClass = '') => {
          if (!tags.length) return '';
          const cls = ['entry-tags', extraClass].filter(Boolean).join(' ');
          return `<div class="${cls}">${tags.map(tag => renderFilterTag(tag)).join('')}</div>`;
        };
        const dockedTagsHtml = shouldDockTags ? renderDockedTags(dockableTagData) : '';
        const mobileTagsHtml = (!compact && !shouldDockTags && dockableTagData.length)
          ? renderDockedTags(dockableTagData, 'entry-tags-mobile')
          : '';
        const xpHtml = xpInfo?.headerHtml || '';
        const levelHtml = hideDetails ? '' : (hasLevelSelect ? lvlSel : '');
        // Compact meta badges (P/V/level) using short labels for mobile space
        const priceBadgeLabel = (priceLabel || 'Pris').replace(':','');
        const priceBadgeText = priceLabel === 'Dagslön:' ? 'Dagslön' : 'P';
        const badgeParts = [];
        if (isQual(p)) {
          (p.taggar?.typ || [])
            .filter(t => QUAL_TYPE_KEYS.includes(t))
            .map(t => QUAL_TYPE_MAP[t])
            .forEach(lbl => badgeParts.push(`<span class="meta-badge">${lbl}</span>`));
        }
        if (priceText) badgeParts.push(`<span class="meta-badge price-badge" title="${priceBadgeLabel}">${priceBadgeText}: ${priceText}</span>`);
        if (capacityVal != null) badgeParts.push(`<span class="meta-badge capacity-badge" title="Bärkapacitet">BK: ${capacityVal}</span>`);
        if (weightVal != null) badgeParts.push(`<span class="meta-badge weight-badge" title="Vikt">V: ${weightVal}</span>`);
        if (isInv(p) && lvlShort) badgeParts.push(`<span class="meta-badge level-badge" title="${lvlBadgeVal}">${lvlShort}</span>`);
        const metaBadges = badgeParts.length ? `<div class="meta-badges">${badgeParts.join('')}</div>` : '';
        const infoSections = (isElityrke(p) && typeof buildElityrkeInfoSections === 'function')
          ? buildElityrkeInfoSections(p)
          : [];
        const skadeTabHtml = (typeof buildSkadetypPanelHtml === 'function' && typeof entryHasDamageType === 'function' && entryHasDamageType(p))
          ? buildSkadetypPanelHtml(p, { level: curLvl, tables: window.TABELLER })
          : '';
        const conflictTabHtml = conflictsHtml ? renderConflictTabButton() : '';
        const infoTagsHtml = infoTagParts.join(' ');
        const infoPanelHtml = buildInfoPanelHtml({
          tagsHtml: infoTagsHtml,
          bodyHtml: infoBodyHtml,
          meta: infoMeta,
          sections: infoSections,
          skadetypHtml: skadeTabHtml,
          conflictTabHtml,
          conflictContentHtml: conflictsHtml
        });
        const infoBtn = `<button class="char-btn icon icon-only info-btn" data-info="${encodeURIComponent(infoPanelHtml)}" aria-label="Visa info">${icon('info')}</button>`;
        const isInventoryEntry = isInv(p);
        const isMonsterLore = p.namn === 'Monsterlärd';
        const monsterLoreUsed = isMonsterLore ? usedMonsterLoreSpecs(charList) : [];
        const monsterLoreMulti = isMonsterLore && monsterLoreUsed.length > 0;
        const multi = isInventoryEntry || (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t))) || monsterLoreMulti;
        let count;
        if (isInv(p)) {
          if (p.id === 'di79') {
            const qtys = FALT_BUNDLE.map(id => invList.find(c => c.id === id)?.qty || 0);
            count = Math.min(...qtys);
          } else {
            count = invList.filter(c => c.id === p.id).reduce((sum,c)=>sum+(c.qty||1),0);
          }
        } else {
          if (isMonsterLore) {
            count = charList.filter(c => c.namn === p.namn && c.trait).length;
          } else {
            count = charList.filter(c => c.id === p.id && !c.trait).length;
          }
        }
        const limit = isInv(p)
          ? Infinity
          : isMonsterLore
            ? getMonsterLoreSpecs().length
            : storeHelper.monsterStackLimit(charList, p.namn);
        const badge = multi && count > 0 ? `<span class="count-badge">×${count}</span>` : '';
        const showInfo = compact || hideDetails;
        const canEdit = (p.taggar?.typ || []).includes('Hemmagjort');
        const idAttr = p.id ? ` data-id="${p.id}"` : '';
        const editBtn = canEdit
          ? `<button data-act="editCustom" class="char-btn" data-name="${p.namn}"${idAttr}>✏️</button>`
          : '';
        const eliteBtn = isElityrke(p)
          ? `<button class="char-btn icon icon-only" data-elite-req="${p.namn}" aria-label="Lägg till elityrke med krav">${icon('elityrke')}</button>`
          : '';
        const allowAdd = !(isService(p) || isEmployment(p));
        const titleActions = [];
        const actionButtons = [];
        if (showInfo) titleActions.push(infoBtn);
        if (editBtn) actionButtons.push(editBtn);
        if (allowAdd) {
          if (multi) {
            const buyMultiButton = `<button data-act="buyMulti" class="char-btn icon icon-only" data-name="${p.namn}" aria-label="Köp flera">${icon('buymultiple')}</button>`;
            if (count > 0) {
              actionButtons.push(`<button data-act="del" class="char-btn danger icon icon-only" data-name="${p.namn}">${icon('remove')}</button>`);
              actionButtons.push(`<button data-act="sub" class="char-btn icon icon-only" data-name="${p.namn}" aria-label="Minska">${icon('minus')}</button>`);
              if (isInventoryEntry) actionButtons.push(buyMultiButton);
              if (count < limit) actionButtons.push(`<button data-act="add" class="char-btn icon icon-only" data-name="${p.namn}" aria-label="Lägg till">${icon('plus')}</button>`);
            } else {
              if (count < limit) actionButtons.push(`<button data-act="add" class="char-btn icon icon-only add-btn" data-name="${p.namn}" aria-label="Lägg till">${icon('plus')}</button>`);
              if (isInventoryEntry) actionButtons.push(buyMultiButton);
            }
          } else {
            const mainBtn = inChar
              ? `<button data-act="rem" class="char-btn danger icon icon-only" data-name="${p.namn}">${icon('remove')}</button>`
              : `<button data-act="add" class="char-btn icon icon-only add-btn" data-name="${p.namn}" aria-label="Lägg till">${icon('plus')}</button>`;
            actionButtons.push(mainBtn);
          }
        }
        if (eliteBtn) actionButtons.push(eliteBtn);
        const leftSections = [];
        if (metaBadges) leftSections.push(metaBadges);
        if (shouldDockTags && dockedTagsHtml) leftSections.push(dockedTagsHtml);
        else if (mobileTagsHtml) leftSections.push(mobileTagsHtml);
        const dataset = { name: p.namn };
        if (spec) dataset.trait = spec;
        if (xpVal != null) dataset.xp = xpVal;
        if (p.id) dataset.id = p.id;
        const descBlock = cardDesc
          ? `<div class="card-desc">${cardDesc}</div>`
          : '';
        const li = createEntryCard({
          compact,
          dataset,
          nameHtml: p.namn,
          titleSuffixHtml: badge,
          xpHtml,
          primaryTagsHtml,
          tagsHtml: (!compact && !shouldDockTags && tagsHtml) ? tagsHtml : '',
          infoBox: infoBoxHtml,
          hasLevels: hasLevelSelect,
          levelHtml,
          levelShort: hasLevelSelect ? lvlShort : '',
          levelShortLabel: hasLevelSelect ? lvlBadgeVal : '',
          descHtml: descBlock,
          leftSections,
          titleActions,
          buttonSections: actionButtons,
          collapsible: true
        });
        listEl.appendChild(li);
        const entryKey = cardKeyFromEl(li);
        if (openCardKeys.has(entryKey)) li.classList.remove('compact');
        else if (compactCardKeys.has(entryKey)) li.classList.add('compact');
        if (searchActive && terms.length) {
          const titleSpan = li.querySelector('.card-title .entry-title-main');
          if (titleSpan) highlightInElement(titleSpan, terms);
          const descEl = li.querySelector('.card-desc');
          if (descEl) highlightInElement(descEl, terms);
        }
      });
      fragment.appendChild(catLi);
    });
    // Append special "Hoppsan" category with a clear-filters action
    {
      const hopLi = document.createElement('li');
      hopLi.className = 'cat-group';
      hopLi.innerHTML = `
        <details class="hoppsan-group" data-cat="Hoppsan" open>
          <summary>Hoppsan</summary>
          <ul class="card-list entry-card-list" data-entry-page="hoppsan"></ul>
        </details>`;
      const listEl = hopLi.querySelector('ul');
      const hopCard = createEntryCard({
        compact: true,
        classes: ['hoppsan-card'],
        dataset: { name: 'Hoppsan' },
        nameHtml: 'Hoppsan, här tog det slut.',
        buttonSections: ['<button class="char-btn" data-clear-filters="1">Börja om?</button>'],
        collapsible: false
      });
      listEl.appendChild(hopCard);
      const detailsEl = hopLi.querySelector('details');
      detailsEl.addEventListener('toggle', (ev) => {
        updateCatToggle();
        if (!detailsEl.open) {
          detailsEl.open = true;
          return;
        }
        if (!ev.isTrusted) return;
        catState['Hoppsan'] = true;
        saveState();
      });
      catState['Hoppsan'] = true;
      fragment.appendChild(hopLi);
    }
    dom.lista.replaceChildren(fragment);
    updateCatToggle();
    // Only auto-open once per triggering action
    openCatsOnce.clear();
    saveState();
  };

  let renderListFrame = null;
  const scheduleRenderList = () => {
    if (renderListFrame !== null) return;
    const run = () => {
      renderListFrame = null;
      renderList(filtered());
    };
    if (typeof requestAnimationFrame === 'function') {
      renderListFrame = requestAnimationFrame(run);
    } else {
      renderListFrame = setTimeout(run, 0);
    }
  };

  const updateCatToggle = () => {
    const allDetails = [...document.querySelectorAll('.cat-group > details')];
    const hop = allDetails.find(d => d.dataset.cat === 'Hoppsan');
    const others = allDetails.filter(d => d !== hop);
    catsMinimized = others.length ? others.every(d => !d.open) : true;
    dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
    dom.catToggle.title = catsMinimized
      ? 'Öppna alla kategorier'
      : 'Minimera alla kategorier';
  };

  const escapeSelectorValue = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (window.CSS?.escape) return CSS.escape(str);
    return str.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  };

  const findEntryCards = (entry) => {
    if (!entry || !dom.lista) return [];
    const cards = [];
    const id = entry.id !== undefined && entry.id !== null ? String(entry.id) : '';
    const name = entry.namn ? String(entry.namn) : '';
    if (id) {
      cards.push(...dom.lista.querySelectorAll(
        `li.entry-card[data-id="${escapeSelectorValue(id)}"]`
      ));
    }
    if (!cards.length && name) {
      cards.push(...dom.lista.querySelectorAll(
        `li.entry-card[data-name="${escapeSelectorValue(name)}"]`
      ));
    }
    return cards;
  };

  const syncActionRowState = (card) => {
    if (!card) return;
    const actionsRow = card.querySelector('.entry-row.entry-row-actions');
    if (!actionsRow) return;
    const dynamicGroup = actionsRow.querySelector('.entry-action-group-dynamic');
    const standardGroup = actionsRow.querySelector('.entry-action-group-standard');
    const levelControl = actionsRow.querySelector('.entry-level-control');
    const hasDynamic = !!(dynamicGroup && dynamicGroup.children.length);
    const hasStandard = !!(standardGroup && standardGroup.children.length);
    const hasLevel = !!(levelControl && levelControl.children.length);
    if (!hasDynamic && hasStandard && !hasLevel) actionsRow.classList.add('only-standard');
    else actionsRow.classList.remove('only-standard');
  };

  const updateEntryCardUI = (entry) => {
    const cards = findEntryCards(entry);
    if (!cards.length) return false;
    const charList = storeHelper.getCurrentList(store);
    const invList  = storeHelper.getInventory(store);
    const entryTypes = entry?.taggar?.typ || [];
    const isInventory = isInv(entry);
    const isMonsterLore = entry.namn === 'Monsterlärd';
    const monsterLoreUsed = isMonsterLore ? usedMonsterLoreSpecs(charList) : [];
    const monsterLoreMulti = isMonsterLore && monsterLoreUsed.length > 0;
    const multi = isInventory || (entry.kan_införskaffas_flera_gånger && entryTypes.some(t => ["Fördel","Nackdel"].includes(t))) || monsterLoreMulti;
    let count = 0;
    if (isInventory) {
      if (entry.id === 'di79') {
        const qtys = FALT_BUNDLE.map(id => invList.find(c => c.id === id)?.qty || 0);
        count = qtys.length ? Math.min(...qtys) : 0;
      } else {
        count = invList
          .filter(c => c.id === entry.id)
          .reduce((sum, c) => sum + (c.qty || 1), 0);
      }
    } else {
      if (isMonsterLore) {
        count = charList.filter(c => c?.namn === entry.namn && c.trait).length;
      } else {
        count = charList
          .filter(c => {
            if (!c || c.namn !== entry.namn) return false;
            if (entry.id !== undefined && entry.id !== null && c.id !== entry.id) return false;
            return !c.trait;
          })
          .length;
      }
    }
    const limit = isInventory
      ? Infinity
      : isMonsterLore
        ? getMonsterLoreSpecs().length
        : storeHelper.monsterStackLimit(charList, entry.namn);
    const allowAdd = !(isService(entry) || isEmployment(entry));

    cards.forEach(card => {
      const traitKey = card.dataset.trait || null;
      const baseMatchOpts = {};
      if (traitKey !== null) baseMatchOpts.trait = traitKey;
      let cardCharEntry = isInventory ? null : findMatchingListEntry(charList, entry, baseMatchOpts) || null;
      const isException = entry.namn === 'Exceptionellt karaktärsdrag';
      let curLvl = null;
      if (cardCharEntry?.nivå) curLvl = String(cardCharEntry.nivå);
      if (!curLvl) {
        const select = card.querySelector('select.level');
        if (select?.value) curLvl = select.value;
      }
      if (!curLvl) {
        curLvl = LVL.find(l => entry.nivåer?.[l]) || 'Novis';
      }
      if (!isInventory) {
        const refineOpts = { ...baseMatchOpts };
        if (curLvl != null) refineOpts.level = curLvl;
        const refinedEntry = findMatchingListEntry(charList, entry, refineOpts);
        if (refinedEntry) cardCharEntry = refinedEntry;
      }
      const inChar = isException ? false : !!cardCharEntry;
      let xpInfo = null;
      if (!isInventory && !isEmployment(entry) && !isService(entry)) {
        const xpOptions = {};
        if (cardCharEntry) xpOptions.xpSource = cardCharEntry;
        if (curLvl != null) xpOptions.level = curLvl;
        xpInfo = computeIndexEntryXP(entry, charList, xpOptions);
      }
      if (xpInfo && xpInfo.value != null) card.dataset.xp = xpInfo.value;
      else delete card.dataset.xp;
      const xpSpan = card.querySelector('.entry-header-xp .entry-xp-value');
      if (xpSpan) {
        if (xpInfo && xpInfo.headerHtml) {
          xpSpan.textContent = `${xpInfo.label}: ${xpInfo.text}`;
        } else {
          xpSpan.textContent = '';
        }
      }
      const infoBtn = card.querySelector('button[data-info]');
      if (infoBtn?.dataset.info) {
        const infoHtml = decodeURIComponent(infoBtn.dataset.info);
        const xpTagHtml = xpInfo?.tagHtml || '';
        let newInfo = infoHtml;
        if (xpTagHtml) {
          if (infoHtml.includes('class="tag xp-cost"')) {
            newInfo = infoHtml.replace(/<span class="tag xp-cost">[\s\S]*?<\/span>/, xpTagHtml);
          } else {
            newInfo = infoHtml.replace(/(<div class="tags">)/, `$1${xpTagHtml}`);
          }
        } else {
          newInfo = infoHtml.replace(/<span class="tag xp-cost">[\s\S]*?<\/span>\s*/g, '');
        }
        infoBtn.dataset.info = encodeURIComponent(newInfo);
      }

      const titleEl = card.querySelector('.card-title');
      if (titleEl) {
        let suffix = titleEl.querySelector('.entry-title-suffix');
        const ensureSuffix = () => {
          if (suffix) return suffix;
          suffix = document.createElement('span');
          suffix.className = 'entry-title-suffix';
          titleEl.appendChild(suffix);
          return suffix;
        };
        const badge = suffix?.querySelector('.count-badge');
        if (multi && count > 0) {
          const host = ensureSuffix();
          if (badge) {
            badge.textContent = `×${count}`;
          } else {
            const badgeEl = document.createElement('span');
            badgeEl.className = 'count-badge';
            badgeEl.textContent = `×${count}`;
            host.appendChild(badgeEl);
          }
        } else if (badge) {
          badge.remove();
          if (suffix && !suffix.children.length && !suffix.textContent.trim()) {
            suffix.remove();
          }
        }
      }

      const standardGroup = card.querySelector('.entry-action-group-standard');
      if (standardGroup) {
        const buttonName = card.dataset.name || entry.namn || '';
        const buttonId = card.dataset.id || (entry.id !== undefined && entry.id !== null ? String(entry.id) : '');
        const buttons = [];
        const createButton = (act, classes, iconName, ariaLabel = '', highlight = false) => {
          const btn = document.createElement('button');
          btn.className = highlight ? `${classes} add-btn` : classes;
          btn.dataset.act = act;
          if (buttonName) btn.dataset.name = buttonName;
          if (buttonId) btn.dataset.id = buttonId;
          if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
          btn.innerHTML = icon(iconName);
          return btn;
        };

        if (allowAdd) {
          if (multi) {
            if (count > 0) {
              buttons.push(createButton('del', 'char-btn danger icon icon-only', 'remove'));
              buttons.push(createButton('sub', 'char-btn icon icon-only', 'minus', 'Minska'));
              if (isInventory) buttons.push(createButton('buyMulti', 'char-btn icon icon-only', 'buymultiple', 'Köp flera'));
              if (count < limit) {
                buttons.push(createButton('add', 'char-btn icon icon-only', 'plus', 'Lägg till'));
              }
            } else {
              buttons.push(createButton('add', 'char-btn icon icon-only', 'plus', 'Lägg till', true));
              if (isInventory) buttons.push(createButton('buyMulti', 'char-btn icon icon-only', 'buymultiple', 'Köp flera'));
            }
          } else {
            if (inChar) {
              buttons.push(createButton('rem', 'char-btn danger icon icon-only', 'remove'));
            } else {
              buttons.push(createButton('add', 'char-btn icon icon-only', 'plus', 'Lägg till', true));
            }
          }
        }

        standardGroup.replaceChildren(...buttons);
        syncActionRowState(card);
      }
    });

    return true;
  };

  /* första render */
  if (pendingSearch) {
    handleIndexSearchSubmit(pendingSearch);
  } else {
    scheduleRenderList();
    activeTags();
  }
  updateXP();

  /* expose update function for party toggles */
  window.indexViewUpdate = () => { scheduleRenderList(); activeTags(); };
  window.indexViewRefreshFilters = () => { fillDropdowns(); updateSearchDatalist(); };

  /* -------- events -------- */
  dom.sIn.addEventListener('input', () => {
    sTemp = dom.sIn.value.trim();
  });

  const DROPDOWN_CONFIG = [
    ['typSel', 'typ'],
    ['arkSel', 'ark'],
    ['tstSel', 'test']
  ];
  const DROPDOWN_ID_MAP = {
    typSel: 'typFilter',
    arkSel: 'arkFilter',
    tstSel: 'testFilter'
  };

  const handleDropdownChange = (sel, key) => (event) => {
    const el = event?.currentTarget;
    if (!el) return;
    dom[sel] = el;
    const v = el.value;
    if (sel === 'tstSel' && !v) {
      F[key] = [];
      storeHelper.setOnlySelected(store, false);
      invalidateFilteredResults();
      activeTags(); scheduleRenderList();
      return;
    }
    if (sel === 'typSel' && v === ONLY_SELECTED_VALUE) {
      storeHelper.setOnlySelected(store, true);
      invalidateFilteredResults();
      el.value = '';
      activeTags(); scheduleRenderList();
      return;
    }
    if (v && !F[key].includes(v)) F[key].push(v);
    if (v) invalidateFilteredResults();
    if (sel === 'typSel' && v) {
      openCatsOnce.add(v);
    }
    el.value = '';
    activeTags(); scheduleRenderList();
  };

  const ensureDropdownChangeHandlers = () => {
    const toolbar = document.querySelector('shared-toolbar');
    if (toolbar && toolbar.dataset.indexDropdownWatcher !== '1') {
      toolbar.addEventListener('toolbar-rendered', () => {
        ensureDropdownChangeHandlers();
      });
      toolbar.dataset.indexDropdownWatcher = '1';
    }
    const root = toolbar?.shadowRoot || null;
    let missing = false;
    DROPDOWN_CONFIG.forEach(([sel, key]) => {
      let el = dom[sel];
      if (!el || !el.isConnected) {
        const resolvedId = DROPDOWN_ID_MAP[sel] || sel;
        el = root?.getElementById(resolvedId) || document.getElementById(resolvedId) || null;
      }
      if (!el) {
        missing = true;
        return;
      }
      dom[sel] = el;
      if (el.dataset.indexDropdownBound === '1') return;
      el.addEventListener('change', handleDropdownChange(sel, key));
      el.dataset.indexDropdownBound = '1';
    });
    return !missing;
  };

  ensureDropdownChangeHandlers();

  dom.catToggle.addEventListener('click', () => {
    const details = document.querySelectorAll('.cat-group > details');
    if (catsMinimized) {
      details.forEach(d => { d.open = true; });
    } else {
      details.forEach(d => {
        if (d.dataset.cat === 'Hoppsan') return;
        d.open = false;
      });
    }
    updateCatToggle();
  });
  // Dropdown handlers are bound via ensureDropdownChangeHandlers().
  dom.active.addEventListener('click',e=>{
    const t=e.target.closest('.tag.removable'); if(!t) return;
    const section=t.dataset.type, val=t.dataset.val;
    if (section==='random') { fixedRandomEntries = null; fixedRandomInfo = null; invalidateFilteredResults(); activeTags(); scheduleRenderList(); return; }
    if(section==='search'){ F.search = F.search.filter(x=>x!==val); }
    else if(section==='onlySel'){ storeHelper.setOnlySelected(store,false); }
    else F[section] = (F[section] || []).filter(x=>x!==val);
    if(section==='test'){ storeHelper.setOnlySelected(store,false); dom.tstSel.value=''; }
    invalidateFilteredResults();
    activeTags(); scheduleRenderList();
  });

  if (dom.lista && !dom.lista.dataset.entryToggleBound) {
    dom.lista.dataset.entryToggleBound = '1';
    dom.lista.addEventListener('entry-card-toggle', () => {
      updateCatToggle();
    });
  }

  // Treat clicks on tags anywhere as filter selections
  document.addEventListener('click', e => {
    const tag = e.target.closest('.filter-tag');
    if (tag && tag.classList.contains('conflict-flag')) return;
    if (!tag) return;
    const sectionMap = { ark_trad: 'ark', ark: 'ark', typ: 'typ', test: 'test' };
    const section = sectionMap[tag.dataset.section];
    if (!section) return;
    const val = tag.dataset.val;
    if (!F[section].includes(val)) F[section].push(val);
    if (section === 'typ') openCatsOnce.add(val);
    invalidateFilteredResults();
    activeTags(); scheduleRenderList();
  });

  /* lista-knappar */
  dom.lista.addEventListener('click', async e=>{
    const conflictFlag = e.target.closest('.conflict-flag');
    if (conflictFlag) {
      const liEl = conflictFlag.closest('li');
      const infoBtn = liEl?.querySelector('button[data-info]');
      if (infoBtn?.dataset.info) {
        let html = decodeURIComponent(infoBtn.dataset.info || '');
        const title = liEl?.querySelector('.card-title .entry-title-main')?.textContent || '';
        yrkePanel.open(title, html, { initialTab: 'conflict' });
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest('.filter-tag')) return;
    // Special clear-filters action inside the Hoppsan category
    const clearBtn = e.target.closest('button[data-clear-filters]');
    if (clearBtn) {
      // Reset all filters and state
      storeHelper.setOnlySelected(store, false);
      storeHelper.clearRevealedArtifacts(store);
      try { localStorage.removeItem(STATE_KEY); sessionStorage.setItem('hoppsanReset', '1'); } catch {}
      // Scroll to top immediately, then refresh the page to restore default state
      window.scrollTo(0, 0);
      location.reload();
      return;
    }
    const infoBtn=e.target.closest('button[data-info]');
    if(infoBtn){
      let html=decodeURIComponent(infoBtn.dataset.info||'');
      const liEl = infoBtn.closest('li');
      const title = liEl?.querySelector('.card-title .entry-title-main')?.textContent || '';
      if(infoBtn.dataset.tabell!=null){
        const terms = F.search.map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
        if (terms.length) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          highlightInElement(tmp, terms);
          html = tmp.innerHTML;
        }
        tabellPopup.open(html, title);
        return;
      }
      {
        const terms = F.search.map(t => searchNormalize(t.toLowerCase())).filter(Boolean);
        if (terms.length) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          highlightInElement(tmp, terms);
          html = tmp.innerHTML;
        }
      }
      yrkePanel.open(title, html);
      return;
    }
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (!store.current && !(await requireCharacter())) return;
    const act = btn.dataset.act;
    const li = btn.closest('li');
    if (!li) return;
    const name = btn.dataset.name || li.dataset.name;
    const tr = li.dataset.trait || null;
    const idAttr = btn.dataset.id || li.dataset.id || null;
    const ref = { id: idAttr || undefined, name };
    const entries = getEntries();
    let p = idAttr ? entries.find(x => String(x.id) === String(idAttr)) : null;
    if (!p && name) p = entries.find(x => x.namn === name);
    if (!p) p = lookupEntry(ref);
    if (!p) return;
    if (act === 'editCustom') {
      if (!window.invUtil || typeof window.invUtil.editCustomEntry !== 'function') return;
      window.invUtil.editCustomEntry(p, () => {
        if (window.indexViewRefreshFilters) window.indexViewRefreshFilters();
        if (window.indexViewUpdate) window.indexViewUpdate();
        if (window.invUtil && typeof window.invUtil.renderInventory === 'function') {
          window.invUtil.renderInventory();
        }
        if (window.updateXP) updateXP();
      });
      return;
    }
    const lvlSel = li.querySelector('select.level');
    let   lvl = lvlSel ? lvlSel.value : null;
    if (!lvl && p.nivåer) lvl = LVL.find(l => p.nivåer[l]) || null;


    /* Lägg till kvalitet direkt */
      if (isQual(p)) {
        const inv = storeHelper.getInventory(store);
        if (!inv.length) { await alertPopup('Ingen utrustning i inventariet.'); return; }
        const qTypes = p.taggar?.typ || [];
        const TYPE_MAP = {
          'Vapenkvalitet': 'Vapen',
          'Rustningskvalitet': 'Rustning',
          'Sköldkvalitet': 'Sköld',
          'Allmän kvalitet': ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt','Lägre Artefakt']
        };
        const allowed = new Set();
        qTypes.forEach(t => {
          const mapped = TYPE_MAP[t];
          if (Array.isArray(mapped)) mapped.forEach(x => allowed.add(x));
          else if (mapped) allowed.add(mapped);
        });
        if (!allowed.size) ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt','Lägre Artefakt'].forEach(x => allowed.add(x));
        const elig = inv.filter(it => {
          const entry = invUtil.getEntry(it.id || it.name);
          if (window.canApplyQuality) return canApplyQuality(entry, p);
          const types = entry?.taggar?.typ || [];
          return types.some(t => allowed.has(t));
        });
        if (!elig.length) { await alertPopup('Ingen lämplig utrustning att förbättra.'); return; }
        invUtil.openQualPopup(elig, iIdx => {
          const row   = elig[iIdx];
          const entry = invUtil.getEntry(row.id || row.name);
          if (window.canApplyQuality && !canApplyQuality(entry, p)) return;
          row.kvaliteter = row.kvaliteter || [];
          const qn = p.namn;
          if (!row.kvaliteter.includes(qn)) row.kvaliteter.push(qn);
          invUtil.saveInventory(inv); invUtil.renderInventory();
          activeTags();
          scheduleRenderList();
        });
        return;
      }

    const pendingUpdates = new Set();
    let needsFullRefresh = false;
    const queueUpdate = (entry) => {
      if (entry) pendingUpdates.add(entry);
    };

    if (act==='add') {
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        const list = storeHelper.getCurrentList(store);
        if (p.id === 'di79') {
          FALT_BUNDLE.forEach(id => {
            const ent = invUtil.getEntry(id);
            if (!ent.namn) return;
            const indivItem = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
              .some(t=>ent.taggar.typ.includes(t)) && !STACKABLE_IDS.includes(ent.id);
            const existing = inv.find(r => r.id === ent.id);
            if (indivItem || !existing) {
              inv.push({ id: ent.id, name: ent.namn, qty:1, gratis:0, gratisKval:[], removedKval:[] });
            } else {
              existing.qty++;
            }
          });
          invUtil.saveInventory(inv); invUtil.renderInventory();
          queueUpdate(p);
          FALT_BUNDLE.forEach(id => {
            const ent = invUtil.getEntry(id);
            const i = inv.findIndex(r => r.id === id);
            const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(ent.namn)}"][data-idx="${i}"]`);
            if (li) {
              li.classList.add('inv-flash');
              setTimeout(() => li.classList.remove('inv-flash'), 1000);
            }
          });
        } else {
          const indiv = ['Vapen','Sköld','Rustning','L\u00e4gre Artefakt','Artefakt','Färdmedel']
            .some(t=>p.taggar.typ.includes(t)) && !STACKABLE_IDS.includes(p.id);
          const rowTemplate = await invUtil.buildInventoryRow({ entry: p, list });
          if (!rowTemplate) return;
          const liveEnabled = typeof storeHelper?.getLiveMode === 'function'
            && storeHelper.getLiveMode(store)
            && window.invUtil
            && typeof window.invUtil.openLiveBuyPopup === 'function'
            && typeof window.invUtil.applyLiveModePayment === 'function';
          const cloneInvRow = obj => JSON.parse(JSON.stringify(obj));
          let desiredQty = 1;
          let priceMoney = null;
          let overrideO = null;
          const livePairs = liveEnabled ? [] : null;
          if (liveEnabled) {
            const existingRow = indiv ? null : inv.find(x => x.id === p.id);
            const purchase = await window.invUtil.openLiveBuyPopup(p, existingRow || null);
            if (!purchase) return;
            desiredQty = Math.max(1, Math.floor(Number(purchase.qty) || 0));
            priceMoney = purchase.pricePerUnit || null;
            overrideO = Number.isFinite(purchase.totalO) ? Math.max(0, Math.floor(purchase.totalO)) : null;
          }
          const assignPrice = target => {
            if (!priceMoney || !target) return;
            target.basePrice = {
              daler: Number(priceMoney.daler) || 0,
              skilling: Number(priceMoney.skilling) || 0,
              'örtegar': Number(priceMoney['örtegar']) || 0
            };
            target.basePriceSource = 'live';
          };
          const finalizeLivePayment = () => {
            if (!livePairs || !livePairs.length) return;
            window.invUtil.applyLiveModePayment(
              livePairs,
              overrideO != null ? { overrideO } : undefined
            );
            livePairs.length = 0;
          };
          const addRow = trait => {
            let flashIdx;
            const qtyToAdd = desiredQty;
            if (indiv) {
              for (let i = 0; i < qtyToAdd; i++) {
                const instance = cloneInvRow(rowTemplate);
                instance.qty = 1;
                if (trait) instance.trait = trait;
                assignPrice(instance);
                inv.push(instance);
                flashIdx = inv.length - 1;
                if (livePairs) livePairs.push({ prev: null, next: instance });
              }
            } else {
              const match = inv.find(x => x.id === p.id && (!trait || x.trait === trait));
              if (match) {
                const prevState = livePairs ? cloneInvRow(match) : null;
                match.qty = (Number(match.qty) || 0) + qtyToAdd;
                if (trait) match.trait = trait;
                assignPrice(match);
                flashIdx = inv.indexOf(match);
                if (livePairs) livePairs.push({ prev: prevState, next: match });
              } else {
                const instance = cloneInvRow(rowTemplate);
                instance.qty = qtyToAdd;
                if (trait) instance.trait = trait;
                assignPrice(instance);
                inv.push(instance);
                flashIdx = inv.length - 1;
                if (livePairs) livePairs.push({ prev: null, next: instance });
              }
            }
            finalizeLivePayment();
            invUtil.saveInventory(inv); invUtil.renderInventory();
            const hidden = isHidden(p);
            const artifactTagged = hasArtifactTag(p);
            let addedToList = false;
            if (hidden || artifactTagged) {
              const list = storeHelper.getCurrentList(store);
              if (artifactTagged && !list.some(x => x.id === p.id && x.noInv)) {
                list.push({ ...p, noInv: true });
                storeHelper.setCurrentList(store, list);
                addedToList = true;
              }
              if (addedToList || hidden) {
                if (window.updateXP) updateXP();
                if (window.renderTraits) renderTraits();
              }
              if (hidden && p.id) {
                storeHelper.addRevealedArtifact(store, p.id);
              }
            }
            queueUpdate(p);
            if (hidden || addedToList) needsFullRefresh = true;
            const li = dom.invList?.querySelector(`li[data-name="${CSS.escape(p.namn)}"][data-idx="${flashIdx}"]`);
            if (li) {
              li.classList.add('inv-flash');
              setTimeout(() => li.classList.remove('inv-flash'), 1000);
            }
          };
          if (p.traits && window.maskSkill) {
            const used = inv.filter(it => it.id===p.id).map(it=>it.trait).filter(Boolean);
            maskSkill.pickTrait(used, async trait => {
              if(!trait) return;
              if (used.includes(trait) && !(await confirmPopup('Samma karakt\u00e4rsdrag finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(trait);
            });
          } else if (p.bound === 'kraft' && window.powerPicker) {
            const used = inv.filter(it => it.id===p.id).map(it=>it.trait).filter(Boolean);
            powerPicker.pickKraft(used, async val => {
              if(!val) return;
              if (used.includes(val) && !STACKABLE_IDS.includes(p.id) && !(await confirmPopup('Samma formel finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(val);
            });
          } else if (p.bound === 'ritual' && window.powerPicker) {
            const used = inv.filter(it => it.id===p.id).map(it=>it.trait).filter(Boolean);
            powerPicker.pickRitual(used, async val => {
              if(!val) return;
              if (used.includes(val) && !STACKABLE_IDS.includes(p.id) && !(await confirmPopup('Samma ritual finns redan. L\u00e4gga till \u00e4nd\u00e5?'))) return;
              addRow(val);
            });
          } else {
            addRow();
          }
        }
      } else {
        const list = storeHelper.getCurrentList(store);
        const disBefore = storeHelper.countDisadvantages(list);
        const checkDisadvWarning = async () => {
          if (storeHelper.countDisadvantages(list) === 5 && disBefore < 5) {
            await alertPopup('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
          }
        };
        if (p.namn === 'Korruptionskänslig' && list.some(x => x.namn === 'Dvärg')) {
          await alertPopup('Dvärgar kan inte ta Korruptionskänslig.');
          return;
        }
        if (isRas(p) && list.some(isRas)) {
          if (!(await confirmPopup('Du kan bara välja en ras. Lägga till ändå?'))) return;
        }
        if (p.namn === 'Dvärg') {
          const hasKorrupt = list.some(x => x.namn === 'Korruptionskänslig');
          if (hasKorrupt) {
            if (!(await confirmPopup('Du har korruptionskänslig, om du väljer till rasen Dvärg så kommer den nackdelen tas bort. Fortsätt?'))) return;
            for (let i = list.length - 1; i >= 0; i--) {
              if (list[i].namn === 'Korruptionskänslig') list.splice(i, 1);
            }
          }
        }
        if (isYrke(p) && list.some(isYrke)) {
          if (!(await confirmPopup('Du kan bara välja ett yrke. Lägga till ändå?'))) return;
        }
        if (isElityrke(p) && list.some(isElityrke)) {
          if (!(await confirmPopup('Du kan bara välja ett elityrke. Lägga till ändå?'))) return;
        }
        if (isElityrke(p)) {
          const res = eliteReq.check(p, list);
          if (!res.ok) {
            const msg = 'Krav ej uppfyllda:\n' +
              (res.missing.length ? 'Saknar: ' + res.missing.join(', ') + '\n' : '') +
              (res.master ? '' : 'Ingen av kraven på Mästare-nivå.\n') +
              'Lägga till ändå?';
            if (!(await confirmPopup(msg))) return;
          }
        }
        if (isEliteSkill(p)) {
          const allowed = explodeTags(p.taggar.ark_trad).some(reqYrke =>
            list.some(item => isElityrke(item) && item.namn === reqYrke)
          );
          if (!allowed) {
            const msg =
              'Förmågan är låst till elityrket ' +
              explodeTags(p.taggar.ark_trad).join(', ') +
              '.\nLägga till ändå?';
            if (!(await confirmPopup(msg))) return;
          }
        }
        let monsterOk = false;
        if (isMonstrousTrait(p)) {
          const baseName = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
          const baseRace = list.find(isRas)?.namn;
          const trollTraits = ['Naturligt vapen', 'Pansar', 'Regeneration', 'Robust'];
          const undeadTraits = ['Gravkyla', 'Skräckslå', 'Vandödhet'];
          const bloodvaderTraits = ['Naturligt vapen','Pansar','Regeneration','Robust'];
          const hamLvl = storeHelper.abilityLevel(list, 'Hamnskifte');
          const bloodRaces = list.filter(x => x.namn === 'Blodsband' && x.race).map(x => x.race);
          monsterOk = (p.taggar.typ || []).includes('Elityrkesförmåga') ||
            (list.some(x => x.namn === 'Mörkt blod') && storeHelper.DARK_BLOOD_TRAITS.includes(baseName)) ||
            (baseRace === 'Troll' && trollTraits.includes(baseName)) ||
            (baseRace === 'Vandöd' && undeadTraits.includes(baseName)) ||
            (baseRace === 'Djur/Bjära' || bloodRaces.includes('Djur/Bjära')) ||
            (baseRace === 'Rese' && baseName === 'Robust') ||
            (list.some(x => x.namn === 'Blodvadare') && bloodvaderTraits.includes(baseName)) ||
            ((baseRace === 'Andrik' || bloodRaces.includes('Andrik')) && baseName === 'Diminutiv') ||
            (hamLvl >= 2 && lvl === 'Novis' && ['Naturligt vapen','Pansar'].includes(baseName)) ||
            (hamLvl >= 3 && lvl === 'Novis' && ['Regeneration','Robust'].includes(baseName));
          if (!monsterOk) {
            if (!(await confirmPopup('Monstruösa särdrag kan normalt inte väljas. Lägga till ändå?'))) return;
          }
          if (storeHelper.hamnskifteNoviceLimit(list, p, lvl)) {
            await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
            return;
          }
        }
        if (storeHelper.HAMNSKIFTE_BASE[p.namn] ? storeHelper.HAMNSKIFTE_BASE[p.namn] === 'Robust' : p.namn === 'Robust') {
          const hamLvl = storeHelper.abilityLevel(list, 'Hamnskifte');
          const robustOk = monsterOk || (hamLvl >= 3 && lvl === 'Novis');
          if (!robustOk) {
            if (!(await confirmPopup('Robust kan normalt inte väljas. Lägga till ändå?'))) return;
          }
        }
        if (p.namn === 'Råstyrka') {
          const robust = list.find(x => x.namn === 'Robust');
          const hasRobust = !!robust && (robust.nivå === undefined || robust.nivå !== '');
          if (!hasRobust) {
            if (!(await confirmPopup('Råstyrka kräver Robust på minst Novis-nivå. Lägga till ändå?'))) return;
          }
        }
        // Tidigare blockerades Mörkt förflutet om Jordnära fanns – inte längre.
        if (isSardrag(p) && (p.taggar.ras || []).length && !(isMonstrousTrait(p) && monsterOk)) {
          const races = [];
          const base = list.find(isRas)?.namn;
          if (base) races.push(base);
          list.forEach(it => { if (it.namn === 'Blodsband' && it.race) races.push(it.race); });
          const ok = races.some(r => p.taggar.ras.includes(r));
          if (!ok) {
            const msg = 'Särdraget är bundet till rasen ' + p.taggar.ras.join(', ') + '.\nLägga till ändå?';
            if (!(await confirmPopup(msg))) return;
          }
        }
        if (p.namn === 'Blodsband' && window.bloodBond) {
          const used=list.filter(x=>x.namn===p.namn).map(x=>x.race).filter(Boolean);
          bloodBond.pickRace(used, async race => {
            if(!race) return;
            const added = { ...p, race };
            list.push(added);
            await checkDisadvWarning();
            storeHelper.setCurrentList(store,list); updateXP();
            scheduleRenderList();
            renderTraits();
            flashAdded(added.namn, added.trait);
          });
          return;
        }
        if (p.namn === 'Monsterlärd' && ['Gesäll','Mästare'].includes(lvl) && window.monsterLore) {
          const usedSpecs = usedMonsterLoreSpecs(list);
          const availableSpecs = getMonsterLoreSpecs();
          if (usedSpecs.length >= availableSpecs.length) {
            await alertPopup('Alla specialiseringar är redan valda.');
            return;
          }
          monsterLore.pickSpec(usedSpecs, async spec => {
            if(!spec || usedSpecs.includes(spec)) return;
            const added = { ...p, nivå: lvl, trait: spec };
            list.push(added);
            await checkDisadvWarning();
            storeHelper.setCurrentList(store,list); updateXP();
            scheduleRenderList();
            renderTraits();
            flashAdded(added.namn, added.trait);
          });
          return;
        }
          if (p.namn === 'Exceptionellt karakt\u00e4rsdrag' && window.exceptionSkill) {
            const used=list.filter(x=>x.namn===p.namn).map(x=>x.trait).filter(Boolean);
            exceptionSkill.pickTrait(used, async trait => {
              if(!trait) return;
            const existing=list.find(x=>x.namn===p.namn && x.trait===trait);
            let added;
            if(existing){
              existing.nivå=lvl;
              added = existing;
            }else{
              added = { ...p, nivå:lvl, trait };
              list.push(added);
            }
            await checkDisadvWarning();
            storeHelper.setCurrentList(store,list); updateXP();
            scheduleRenderList();
            renderTraits();
            flashAdded(added.namn, added.trait);
            });
            return;
          }
          const grundCheck = await enforceGrundritualRequirement(p, list);
          if (!grundCheck.allowed) return;
          if (grundCheck.autoAdd.length) {
            const autoAdded = [];
            const missingBases = [];
            grundCheck.autoAdd.forEach(baseName => {
              if (list.some(item => item?.namn === baseName)) return;
              const baseEntry = lookupEntry({ name: baseName });
              if (baseEntry) {
                list.push({ ...baseEntry });
                autoAdded.push(baseName);
              } else {
                missingBases.push(baseName);
              }
            });
            if (autoAdded.length && typeof window.toast === 'function') {
              window.toast(`La till ${formatQuotedList(autoAdded)}.`);
            }
            if (missingBases.length && typeof alertPopup === 'function') {
              const plural = missingBases.length === 1 ? 'grundritualen' : 'grundritualerna';
              await alertPopup(`Hittar inte ${plural} ${formatQuotedList(missingBases)} i databasen. Lägg till manuellt.`);
            }
          }
          const multi = (p.kan_införskaffas_flera_gånger && (p.taggar.typ || []).some(t => ["Fördel","Nackdel"].includes(t)));
          if(multi){
            const cnt = list.filter(x=>x.namn===p.namn && !x.trait).length;
          const limit = storeHelper.monsterStackLimit(list, p.namn);
          if(p.namn !== 'Blodsband' && cnt >= limit){
            await alertPopup(`Denna fördel eller nackdel kan bara tas ${limit} gånger.`);
            return;
          }
        }else if(list.some(x=>x.namn===p.namn && !x.trait)){
          return;
        }
        let form = 'normal';
        const finishAdd = async added => {
          await checkDisadvWarning();
          storeHelper.setCurrentList(store, list); updateXP();
          if (p.namn === 'Privilegierad') {
            invUtil.renderInventory();
          }
          if (p.namn === 'Besittning') {
            const amount = Math.floor(Math.random() * 10) + 11;
            storeHelper.setPossessionMoney(store, { daler: amount, skilling: 0, 'örtegar': 0 });
            await alertPopup(`Grattis! Din besittning har tjänat dig ${amount} daler!`);
            invUtil.renderInventory();
          }
          if (p.namn === 'Välutrustad') {
            const inv = storeHelper.getInventory(store);
            invUtil.addWellEquippedItems(inv);
            invUtil.saveInventory(inv); invUtil.renderInventory();
          }
          needsFullRefresh = true;
          renderTraits();
          flashAdded(added.namn, added.trait);
        };
        if (isMonstrousTrait(p)) {
          const test = { ...p, nivå: lvl, form: 'beast' };
          if (storeHelper.isFreeMonsterTrait(list, test) && window.beastForm) {
            beastForm.pickForm(async res => {
              if(!res) return;
              const added = { ...p, nivå: lvl, form: res };
              list.push(added);
              await finishAdd(added);
            });
            return;
          }
        }
        const added = { ...p, nivå: lvl, form };
        list.push(added);
        await finishAdd(added);
      }
      needsFullRefresh = true;
    } else if (act==='buyMulti') {
      if (!isInv(p)) return;
      if (!window.invUtil || typeof window.invUtil.openBuyMultiplePopup !== 'function') return;
      const inv = storeHelper.getInventory(store);
      let idxInv = inv.findIndex(x => x.id === p.id);
      let row = idxInv >= 0 ? inv[idxInv] : null;
      let isNewRow = false;
      if (idxInv < 0) {
        if (typeof invUtil.buildInventoryRow !== 'function') return;
        const list = storeHelper.getCurrentList(store);
        const newRow = await invUtil.buildInventoryRow({ entry: p, list });
        if (!newRow) return;
        newRow.qty = 0;
        inv.push(newRow);
        row = newRow;
        idxInv = inv.length - 1;
        isNewRow = true;
      }
      const safeName = escapeSelectorValue(p.namn);
      let invLi = null;
      if (!isNewRow && safeName) {
        invLi = dom.invList?.querySelector(`li[data-name="${safeName}"][data-idx="${idxInv}"]`) || null;
      }
      const cancelTempRow = () => {
        if (!isNewRow) return;
        const curIdx = inv.indexOf(row);
        if (curIdx >= 0) inv.splice(curIdx, 1);
      };
      const confirmTempRow = () => {
        if (isNewRow) queueUpdate(p);
      };
      window.invUtil.openBuyMultiplePopup({
        row,
        entry: p,
        inv,
        li: invLi,
        parentArr: inv,
        idx: idxInv,
        onCancel: isNewRow ? cancelTempRow : undefined,
        onConfirm: confirmTempRow,
        isNewRow
      });
      return;
    } else if (act==='sub' || act==='del' || act==='rem') {
      if (isInv(p)) {
        const inv = storeHelper.getInventory(store);
        if (p.id === 'di79') {
          const removeCnt = (act === 'del' || act === 'rem')
            ? Math.min(...FALT_BUNDLE.map(id => inv.find(r => r.id === id)?.qty || 0))
            : 1;
          if (removeCnt > 0) {
            FALT_BUNDLE.forEach(id => {
              const idxRow = inv.findIndex(r => r.id === id);
              if (idxRow >= 0) {
                inv[idxRow].qty -= removeCnt;
                if (inv[idxRow].qty < 1) inv.splice(idxRow,1);
              }
            });
          }
        } else {
          const idxInv = inv.findIndex(x => x.id===p.id);
          if (idxInv >= 0) {
            if (act === 'del' || act === 'rem') {
              inv.splice(idxInv,1);
            } else {
              inv[idxInv].qty--;
              if (inv[idxInv].qty < 1) inv.splice(idxInv,1);
            }
          }
        }
        invUtil.saveInventory(inv); invUtil.renderInventory();
        const hidden = isHidden(p);
        const artifactTagged = hasArtifactTag(p);
        if (hidden || artifactTagged) {
          const still = inv.some(r => r.id === p.id);
          if (!still) {
            let list = storeHelper.getCurrentList(store).filter(x => !(x.id === p.id && x.noInv));
            storeHelper.setCurrentList(store, list);
            if (window.updateXP) updateXP();
            if (window.renderTraits) renderTraits();
            if (hidden) storeHelper.removeRevealedArtifact(store, p.id);
          }
        }
        queueUpdate(p);
        if (hidden || artifactTagged) needsFullRefresh = true;
      } else {
        needsFullRefresh = true;
        const tr = btn.closest('li').dataset.trait || null;
        const before = storeHelper.getCurrentList(store);
        if(p.namn==='Mörkt förflutet' && before.some(x=>x.namn==='Mörkt blod')){
          if(!(await confirmPopup('Mörkt förflutet hänger ihop med Mörkt blod. Ta bort ändå?')))
            return;
        }
        const baseRem = storeHelper.HAMNSKIFTE_BASE[p.namn] || p.namn;
        if(isMonstrousTrait(p) && storeHelper.DARK_BLOOD_TRAITS.includes(baseRem) && before.some(x=>x.namn==='Mörkt blod')){
          if(!(await confirmPopup(p.namn+' hänger ihop med Mörkt blod. Ta bort ändå?')))
            return;
        }
        if(storeHelper.HAMNSKIFTE_BASE[p.namn] && before.some(x=>x.namn==='Hamnskifte')){
          if(!(await confirmPopup(p.namn+' hänger ihop med Hamnskifte. Ta bort ändå?')))
            return;
          const rem=storeHelper.getHamnskifteRemoved(store);
          const base=storeHelper.HAMNSKIFTE_BASE[p.namn];
          if(!rem.includes(base)){
            rem.push(base);
            storeHelper.setHamnskifteRemoved(store, rem);
          }
        }
        let list;
        if(act === 'del' || act === 'rem'){
          list = before.filter(x => !(x.namn===p.namn && (tr?x.trait===tr:!x.trait)));
        }else{
          let removed=false;
          list = [];
          for(const it of before){
            if(!removed && it.namn===p.namn && (tr?it.trait===tr:!it.trait)){
              removed=true;
              continue;
            }
            list.push(it);
          }
        }
        const removed = before.find(it => it.namn===p.namn && (tr?it.trait===tr:!it.trait));
        const remDeps = storeHelper.getDependents(before, removed);
        if(p.namn==='Mörkt blod' && remDeps.length){
          if(await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)){
            list = list.filter(x => !remDeps.includes(x.namn));
          }
        } else if(p.namn==='Hamnskifte' && remDeps.length){
          if(await confirmPopup(`Ta bort även: ${remDeps.join(', ')}?`)){
            list = list.filter(x => !remDeps.includes(x.namn));
            storeHelper.setHamnskifteRemoved(store, []);
          }
        } else if(remDeps.length){
          if(!(await confirmPopup(`F\u00f6rm\u00e5gan kr\u00e4vs f\u00f6r: ${remDeps.join(', ')}. Ta bort \u00e4nd\u00e5?`))) return;
        }
        if(eliteReq.canChange(before) && !eliteReq.canChange(list)) {
          const deps = before
            .filter(isElityrke)
            .filter(el => eliteReq.check(el, before).ok && !eliteReq.check(el, list).ok)
            .map(el => el.namn);
        const msg = deps.length
            ? `Förmågan krävs för: ${deps.join(', ')}. Ta bort ändå?`
            : 'Förmågan krävs för ett valt elityrke. Ta bort ändå?';
          if(!(await confirmPopup(msg)))
            return;
        }
        storeHelper.setCurrentList(store,list); updateXP();
        const affected = new Set([p.namn, ...remDeps]);
        affected.forEach(name => {
          const depEntry = entries.find(x => x.namn === name);
          if (depEntry) pendingUpdates.add(depEntry);
        });
        if (p.namn === 'Privilegierad') {
          invUtil.renderInventory();
        }
        if (p.namn === 'Besittning') {
          storeHelper.setPossessionMoney(store, { daler: 0, skilling: 0, 'örtegar': 0 });
          const cnt = storeHelper.incrementPossessionRemoved(store);
          if (cnt >= 3) {
            const id = store.current;
            await alertPopup('Karaktären raderas på grund av misstänkt fusk.');
            storeHelper.deleteCharacter(store, id);
            // Soft refresh after deletion: pick next sensible current and re-render
            try {
              const active = storeHelper.getActiveFolder(store);
              const remaining = (store.characters || [])
                .filter(c => !active || active === 'ALL' || (c.folderId || '') === active)
                .slice()
                .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'sv'));
              store.current = remaining[0]?.id || '';
              storeHelper.save(store);
            } catch {}
            if (window.applyCharacterChange) { applyCharacterChange(); }
            return;
          } else if (cnt === 2) {
            await alertPopup('Misstänkt fusk: lägger du till och tar bort denna fördel igen raderas karaktären omedelbart');
          }
          invUtil.renderInventory();
        }
        if (p.namn === 'Välutrustad') {
          const inv = storeHelper.getInventory(store);
          invUtil.removeWellEquippedItems(inv);
          invUtil.saveInventory(inv); invUtil.renderInventory();
        }
        const hidden = isHidden(p);
        const artifactTagged = hasArtifactTag(p);
        if (hidden || artifactTagged) {
          const inv = storeHelper.getInventory(store);
          const removeItem = arr => {
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i].id === p.id) arr.splice(i, 1);
              else if (Array.isArray(arr[i].contains)) removeItem(arr[i].contains);
            }
          };
          removeItem(inv);
          invUtil.saveInventory(inv); invUtil.renderInventory();
          if (hidden) storeHelper.removeRevealedArtifact(store, p.id);
        }
      }
    }
    pendingUpdates.add(p);
    pendingUpdates.forEach(entry => {
      if (!updateEntryCardUI(entry)) needsFullRefresh = true;
    });
    activeTags();
    if (needsFullRefresh) scheduleRenderList();
    renderTraits();
    if (act==='add') {
      flashAdded(name, tr);
    } else if (act==='sub' || act==='del' || act==='rem') {
      flashRemoved(name, tr);
    }
  });

  /* level-byte i listan */
  dom.lista.addEventListener('change', async e=>{
    if(!e.target.matches('select.level')) return;
    const select = e.target;
    window.entryCardFactory?.syncLevelControl?.(select);
    const name = select.dataset.name;
    const tr = select.closest('li').dataset.trait || null;
    const list = storeHelper.getCurrentList(store);
    const ent  = list.find(x=>x.namn===name && (tr?x.trait===tr:!x.trait));
    if (ent){
      const before = list.map(x => ({...x}));
      const old = ent.nivå;
      ent.nivå = select.value;
      if(eliteReq.canChange(before) && !eliteReq.canChange(list)){
        await alertPopup('Förmågan krävs för ett valt elityrke och kan inte ändras.');
        ent.nivå = old;
        select.value = old;
        window.entryCardFactory?.syncLevelControl?.(select);
        return;
      }
      if (storeHelper.hamnskifteNoviceLimit(list, ent, ent.nivå)) {
        await alertPopup('Särdraget kan inte tas högre än Novis utan Blodvadare eller motsvarande.');
        ent.nivå = old;
        select.value = old;
        window.entryCardFactory?.syncLevelControl?.(select);
        return;
      }
      if(name==='Monsterlärd'){
        if(['Gesäll','Mästare'].includes(ent.nivå)){
          if(!ent.trait && window.monsterLore){
            const usedSpecs = usedMonsterLoreSpecs(list);
            if (usedSpecs.length >= getMonsterLoreSpecs().length) {
              ent.nivå=old;
              select.value=old;
              window.entryCardFactory?.syncLevelControl?.(select);
              await alertPopup('Alla specialiseringar är redan valda.');
              return;
            }
            monsterLore.pickSpec(usedSpecs, spec=>{
              if(!spec){
                ent.nivå=old;
                select.value=old;
                window.entryCardFactory?.syncLevelControl?.(select);
                return;
              }
              ent.trait=spec;
              storeHelper.setCurrentList(store,list); updateXP();
              scheduleRenderList(); renderTraits();
            });
            return;
          }
        }else if(ent.trait){
          delete ent.trait;
          storeHelper.setCurrentList(store,list); updateXP();
          scheduleRenderList(); renderTraits();
          updateSearchDatalist();
          return;
        }
      }
      if(name==='Hamnskifte'){
        const lvlMap={"":0,Novis:1, Gesäll:2, Mästare:3};
        const oldIdx=lvlMap[old]||0;
        const newIdx=lvlMap[ent.nivå]||0;
        let toRemove=[];
        if(oldIdx>=3 && newIdx<3) toRemove.push('Robust','Regeneration');
        if(oldIdx>=2 && newIdx<2) toRemove.push('Naturligt vapen','Pansar');
        toRemove=toRemove.filter(n=>list.some(x=>x.namn===storeHelper.HAMNSKIFTE_NAMES[n]));
        if(toRemove.length){
          const dispNames=toRemove.map(n=>storeHelper.HAMNSKIFTE_NAMES[n]);
          if(!(await confirmPopup(`Ta bort även: ${dispNames.join(', ')}?`))){
            ent.nivå=old;
            select.value=old;
            window.entryCardFactory?.syncLevelControl?.(select);
            return;
          }
          for(let i=list.length-1;i>=0;i--){
            const base=storeHelper.HAMNSKIFTE_BASE[list[i].namn];
            if(base && toRemove.includes(base)) list.splice(i,1);
          }
          const rem=storeHelper.getHamnskifteRemoved(store).filter(x=>!toRemove.includes(x));
          storeHelper.setHamnskifteRemoved(store, rem);
        }
        const toAdd=[];
        if(newIdx>=2 && oldIdx<2) toAdd.push('Naturligt vapen','Pansar');
        if(newIdx>=3 && oldIdx<3) toAdd.push('Robust','Regeneration');
        let rem=storeHelper.getHamnskifteRemoved(store);
        toAdd.forEach(n=>{
          const hamName=storeHelper.HAMNSKIFTE_NAMES[n];
          if(!list.some(x=>x.namn===hamName) && !rem.includes(n)){
            const entry=lookupEntry({ id: n, name: n });
            if(entry) list.push({ ...entry, namn:hamName, form:'beast' });
          }
          rem=rem.filter(x=>x!==n);
        });
        storeHelper.setHamnskifteRemoved(store, rem);
      }
      storeHelper.setCurrentList(store,list); updateXP();
      scheduleRenderList(); renderTraits();
      flashAdded(name, tr);
      return;
    }

    /* uppdatera pris om förmågan inte lagts till */
    const p = getEntries().find(x=>x.namn===name);
    if(!p) return;
    const lvl = select.value;
    const xpInfo = (isInv(p) || isEmployment(p) || isService(p))
      ? null
      : computeIndexEntryXP(p, list, { level: lvl });
    const xpVal = xpInfo?.value ?? null;
    const liEl = select.closest('li');
    if (xpVal != null) liEl.dataset.xp = xpVal; else delete liEl.dataset.xp;
    const xpSpan = liEl.querySelector('.entry-header-xp .entry-xp-value');
    if (xpSpan) {
      if (xpInfo && xpInfo.headerHtml) {
        xpSpan.textContent = `${xpInfo.label}: ${xpInfo.text}`;
      } else {
        xpSpan.textContent = '';
      }
    }
    const infoBtn = liEl.querySelector('button[data-info]');
    if (infoBtn?.dataset.info) {
      const infoHtml = decodeURIComponent(infoBtn.dataset.info);
      const xpTagHtml = xpInfo?.tagHtml || '';
      let newInfo = infoHtml;
      if (xpTagHtml) {
        if (infoHtml.includes('class="tag xp-cost"')) {
          newInfo = infoHtml.replace(/<span class="tag xp-cost">[\s\S]*?<\/span>/, xpTagHtml);
        } else {
          newInfo = infoHtml.replace(/(<div class="tags">)/, `$1${xpTagHtml}`);
        }
      } else {
        newInfo = infoHtml.replace(/<span class="tag xp-cost">[\s\S]*?<\/span>\s*/g, '');
      }
      infoBtn.dataset.info = encodeURIComponent(newInfo);
    }
    window.entryCardFactory?.syncLevelControl?.(select);
  });
}

  window.initIndex = initIndex;
})(window);
