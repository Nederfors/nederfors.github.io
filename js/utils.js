(function(window){
  const LVL   = ['Novis','Ges\u00e4ll','M\u00e4stare'];
  const EQUIP = [
    'Vapen',
    'Sköld',
    'Pil/Lod',
    'Rustning',
    'Kuriositet',
    'Skatt',
    'Diverse',
    'Elixir',
    'Mat',
    'Dryck',
    'L\u00e4gre Artefakt',
    'Artefakt',
    'Kl\u00e4der',
    'Musikinstrument',
    'F\u00e4rdmedel',
    'F\u00f6rvaring',
    'G\u00e5rdsdjur',
    'Byggnad',
    'Specialverktyg',
    'F\u00e4lla'
  ];
  const SBASE = 10, OBASE = 10;

  const ICON_SOURCES = Object.freeze({
    character : 'icons/character.svg',
    egenskaper: 'icons/egenskaper.svg',
    index     : 'icons/index.svg',
    info      : 'icons/info.svg',
    inventarie: 'icons/inventarie.svg',
    minus     : 'icons/minus.svg',
    plus      : 'icons/plus.svg',
    remove    : 'icons/remove.svg',
    skadetyp  : 'icons/skadetyp.svg',
    settings  : 'icons/settings.svg',
    smithing  : 'icons/smithing.svg'
  });

  const DEFAULT_CHARACTER_ICON = ICON_SOURCES.character;
  let characterIconOverride = '';

  const SV_COLLATOR = (typeof Intl !== 'undefined' && typeof Intl.Collator === 'function')
    ? new Intl.Collator('sv', { sensitivity: 'base', usage: 'sort', ignorePunctuation: true })
    : null;

  function compareSv(a, b) {
    const aStr = String(a ?? '').trim();
    const bStr = String(b ?? '').trim();
    if (SV_COLLATOR) {
      const res = SV_COLLATOR.compare(aStr, bStr);
      if (res) return res;
    }
    const localeRes = aStr.localeCompare(bStr, 'sv');
    if (localeRes) return localeRes;
    return aStr.localeCompare(bStr);
  }

  function normalizeIconPath(input) {
    if (typeof input !== 'string') return '';
    let str = input.trim();
    if (!str) return '';
    str = str.replace(/\\+/g, '/');
    if (/^[a-z]+:/i.test(str)) return str; // Absolute/URL paths – leave untouched
    if (str.includes('/')) {
      const segments = str.split('/');
      const last = segments.pop() || '';
      const normalizedLast = (/\.svg$/i.test(last) ? last.slice(0, -4) : last).toLowerCase();
      segments.push(`${normalizedLast}.svg`);
      return segments.join('/');
    }
    const base = (/\.svg$/i.test(str) ? str.slice(0, -4) : str).toLowerCase();
    return `icons/${base}.svg`;
  }

  function resolveIconSource(name) {
    const rawName = typeof name === 'string' ? name.trim() : '';
    if (!rawName) return '';
    const lowerName = rawName.toLowerCase();
    if (lowerName === 'character' && characterIconOverride) {
      return characterIconOverride;
    }
    if (Object.prototype.hasOwnProperty.call(ICON_SOURCES, rawName)) {
      return ICON_SOURCES[rawName];
    }
    if (Object.prototype.hasOwnProperty.call(ICON_SOURCES, lowerName)) {
      return ICON_SOURCES[lowerName];
    }
    return `icons/${rawName}.svg`;
  }

  function refreshCharacterIconElements() {
    if (typeof document === 'undefined') return;
    const target = characterIconOverride || DEFAULT_CHARACTER_ICON;
    const applyToRoot = (root) => {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      const nodes = root.querySelectorAll('img[data-icon-name="character"]');
      nodes.forEach(img => {
        if (img.getAttribute('src') !== target) {
          img.setAttribute('src', target);
        }
      });
    };
    applyToRoot(document);
    const toolbars = document.querySelectorAll ? document.querySelectorAll('shared-toolbar') : [];
    toolbars.forEach(el => applyToRoot(el.shadowRoot));
  }

  function setCharacterIconOverride(value) {
    if (typeof document === 'undefined') {
      characterIconOverride = '';
      return;
    }
    const normalized = typeof value === 'string' ? value.trim() : '';
    let resolved = normalized ? normalizeIconPath(normalized) : '';
    if (resolved === DEFAULT_CHARACTER_ICON) resolved = '';
    if (characterIconOverride === resolved) {
      refreshCharacterIconElements();
      return;
    }
    characterIconOverride = resolved;
    refreshCharacterIconElements();
  }

  function setCharacterIconVariant(variant) {
    setCharacterIconOverride(variant);
  }

  function getCharacterIconSrc() {
    return resolveIconSource('character');
  }

  function iconHtml(name, opts = {}) {
    if (!name) return '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) return '';
    const lowerName = normalizedName.toLowerCase();
    const src = resolveIconSource(normalizedName);
    const extraClass = opts.className ? ` ${opts.className}` : '';
    const alt = typeof opts.alt === 'string' ? opts.alt : '';
    const attrs = [];
    const widthAttr = Object.prototype.hasOwnProperty.call(opts, 'width') ? opts.width : 32;
    const heightAttr = Object.prototype.hasOwnProperty.call(opts, 'height') ? opts.height : 32;
    if (widthAttr !== undefined && widthAttr !== null && widthAttr !== '') {
      attrs.push(`width="${widthAttr}"`);
    }
    if (heightAttr !== undefined && heightAttr !== null && heightAttr !== '') {
      attrs.push(`height="${heightAttr}"`);
    }
    if (opts.loading) attrs.push(`loading="${opts.loading}"`);
    if (opts.decoding) attrs.push(`decoding="${opts.decoding}"`);
    const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
    return `<img src="${src}" alt="${alt}" class="btn-icon${extraClass}" data-icon-name="${lowerName}"${attrStr}>`;
  }

  // Konvertera ett penningobjekt till totalt antal örtegar
  function moneyToO(m) {
    m = m || {};
    return (m.daler || m.d || 0) * SBASE * OBASE +
           (m.skilling || m.s || 0) * OBASE +
           (m['örtegar'] || m.o || 0);
  }

  // Konvertera örtegar till ett objekt med daler/skilling/örtegar
  function oToMoney(o) {
    let rem = Math.max(0, Math.floor(o));
    const d = Math.floor(rem / (SBASE * OBASE));
    rem %= SBASE * OBASE;
    const s = Math.floor(rem / OBASE);
    const ø = rem % OBASE;
    return { daler: d, skilling: s, 'örtegar': ø, d, s, o: ø };
  }

  const TYPE_PRIORITIES = { Ras: 0, Yrke: 1, Elityrke: 2 };

  const CAT_ORDER = [
    'Ras',
    'Yrke',
    'Elityrke',
    'Förmåga',
    'Basförmåga',
    'Mystisk kraft',
    'Ritual',
    'Fördel',
    'Nackdel',
    'Särdrag',
    'Monstruöst särdrag',
    'Rustning',
    'Vapen',
    'Pil/Lod',
    'Kvalitet',
    'Mystisk kvalitet',
    'Elixir',
    'Lägre Artefakt',
    'Artefakt',
    'Skatt',
    'Kuriositet',
    'Specialverktyg',
    'Diverse',
    'Mat',
    'Dryck'
  ];

  const CAT_DISPLAY = {
    'Ras': 'Raser',
    'Yrke': 'Yrken',
    'Elityrke': 'Elityrken',
    'Förmåga': 'Förmågor',
    'Basförmåga': 'Basförmågor',
    'Mystisk kraft': 'Mystiska krafter',
    'Ritual': 'Ritualer',
    'Fördel': 'Fördelar',
    'Nackdel': 'Nackdelar',
    'Särdrag': 'Särdrag',
    'Monstruöst särdrag': 'Monstruösa särdrag',
    'Rustning': 'Rustningar',
    'Vapen': 'Vapen',
    'Pil/Lod': 'Pilar/Lod',
    'Sköld': 'Sköldar',
    'Tabell': 'Tabeller',
    'Kvalitet': 'Kvaliteter',
    'Mystisk kvalitet': 'Mystiska kvaliteter',
    'Elixir': 'Elixir',
    'Lägre Artefakt': 'Lägre Artefakter',
    'Artefakt': 'Artefakter',
    'Skatt': 'Skatter',
    'Kuriositet': 'Kuriositeter',
    'skatt': 'Skatter',
    'kuriositet': 'Kuriositeter',
    'Specialverktyg': 'Specialverktyg',
    'Diverse': 'Diverse',
    'Mat': 'Mat',
    'Dryck': 'Drycker',
    'Byggnad': 'Byggnader',
    'Förvaring': 'Förvaringsföremål',
    'Fälla': 'Fällor'
  };

  function catName(cat){
    return CAT_DISPLAY[cat] || cat;
  }

  function catComparator(a, b){
    if (a === 'Färdmedel' && b !== 'Färdmedel') return 1;
    if (b === 'Färdmedel' && a !== 'Färdmedel') return -1;
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return compareSv(a, b);
  }

  const EQUIP_LC_SET = new Set(EQUIP.map(t => String(t).toLowerCase()));
  function isInv(p){
    return !p.noInv && (p.taggar?.typ||[]).some(t => EQUIP_LC_SET.has(String(t).toLowerCase()));
  }
  function isQual(p){
    return (p.taggar?.typ||[]).some(t => ['Kvalitet','Mystisk kvalitet'].includes(t));
  }
  function normalizeRef(ref) {
    if (ref && typeof ref === 'object') {
      const { id, namn, name, sourceEntryName } = ref;
      const canonicalName = typeof sourceEntryName === 'string' && sourceEntryName.trim()
        ? sourceEntryName.trim()
        : undefined;
      return {
        id: id !== undefined && id !== null && String(id).trim() !== '' ? String(id).trim() : undefined,
        name: canonicalName || (typeof namn === 'string' && namn.trim() ? namn.trim()
          : (typeof name === 'string' && name.trim() ? name.trim() : undefined))
      };
    }
    if (ref === undefined || ref === null) return { id: undefined, name: undefined };
    if (typeof ref === 'string') {
      const trimmed = ref.trim();
      if (!trimmed) return { id: undefined, name: undefined };
      return { id: trimmed, name: trimmed };
    }
    if (typeof ref === 'number') {
      return { id: String(ref), name: undefined };
    }
    return { id: undefined, name: undefined };
  }

  function lookupEntry(ref, options = {}) {
    const { allowNameFallback = true, explicitName } = options || {};
    const db = window.DB;
    const dbIndex = window.DBIndex;
    const { id, name } = normalizeRef(ref);
    const fallbackName = explicitName || name;

    if (id !== undefined) {
      if (db && db[id]) return db[id];
      if (Array.isArray(db)) {
        const hitById = db.find(ent => String(ent?.id ?? '') === id);
        if (hitById) return hitById;
      }
    }

    if (!allowNameFallback) return undefined;

    const key = typeof fallbackName === 'string' ? fallbackName : undefined;
    if (key) {
      if (dbIndex && dbIndex[key]) return dbIndex[key];
      if (Array.isArray(db)) {
        const hitByName = db.find(ent => ent?.namn === key);
        if (hitByName) return hitByName;
      }
    }

    return undefined;
  }
  // Kontrollera om en viss kvalitet kan läggas på ett specifikt föremål
  // Stödjer nya taggar: Vapenkvalitet, Sköldkvalitet, Rustningskvalitet, Allmän kvalitet
  function canApplyQuality(itemOrName, qualOrName) {
    const item = lookupEntry(itemOrName) || (typeof itemOrName === 'object' && itemOrName ? itemOrName : {});
    const qual = lookupEntry(qualOrName) || (typeof qualOrName === 'object' && qualOrName ? qualOrName : {});
    const itTypes = Array.isArray(item.taggar?.typ) ? item.taggar.typ : [];
    const qTypes  = Array.isArray(qual.taggar?.typ) ? qual.taggar.typ : [];

    // Ny typindelning för kvaliteter
    const isGeneral = qTypes.includes('Allmän kvalitet');
    const toWeapon  = qTypes.includes('Vapenkvalitet');
    const toShield  = qTypes.includes('Sköldkvalitet');
    const toArmor   = qTypes.includes('Rustningskvalitet');

    const QUAL_ITEM_TYPES = ['Vapen','Sköld','Pil/Lod','Rustning','Artefakt','Lägre Artefakt'];

    // Allmän kvalitet: endast för föremål som kan ha kvaliteter
    if (isGeneral) {
      return QUAL_ITEM_TYPES.some(t => itTypes.includes(t));
    }

    // Om inga nya typer finns på kvaliteten: falla tillbaka till gamla beteendet
    // (kvaliteter gällde generellt för vapen/sköld/rustning)
    if (!toWeapon && !toShield && !toArmor) {
      return QUAL_ITEM_TYPES.some(t => itTypes.includes(t));
    }

    if (toWeapon && itTypes.includes('Vapen')) return true;
    if (toShield && itTypes.includes('Sköld')) return true;
    if (toArmor  && itTypes.includes('Rustning')) return true;
    return false;
  }
  function isYrke(p){ return (p.taggar?.typ||[]).includes('Yrke'); }
  function isRas(p){ return (p.taggar?.typ||[]).includes('Ras'); }
  function isElityrke(p){ return (p.taggar?.typ||[]).includes('Elityrke'); }
  function isEliteSkill(p){ return (p.taggar?.typ||[]).includes('Elityrkesf\u00f6rm\u00e5ga'); }
  function isMonstrousTrait(p){ return (p.taggar?.typ||[]).includes('Monstru\u00f6st s\u00e4rdrag'); }
  function isSardrag(p){ return (p.taggar?.typ||[]).includes('S\u00e4rdrag'); }
  function isEmployment(p){ return (p.taggar?.typ||[]).includes('Anställning'); }
  function isService(p){ return (p.taggar?.typ||[]).includes('Tjänster'); }
  function isMysticQual(name){
    const entry = lookupEntry(name);
    return (entry?.taggar?.typ || []).includes('Mystisk kvalitet');
  }
  function isNegativeQual(name){
    const entry = lookupEntry(name);
    return Boolean(entry?.negativ);
  }
  function isNeutralQual(name){
    const entry = lookupEntry(name);
    return Boolean(entry?.neutral);
  }
  function sortByType(a, b){
    const ta = (a.taggar?.typ || [''])[0] || '';
    const tb = (b.taggar?.typ || [''])[0] || '';
    const pa = TYPE_PRIORITIES.hasOwnProperty(ta) ? TYPE_PRIORITIES[ta] : 99;
    const pb = TYPE_PRIORITIES.hasOwnProperty(tb) ? TYPE_PRIORITIES[tb] : 99;
    if(pa !== pb) return pa - pb;
    const taList = a.taggar?.typ || [];
    const tbList = b.taggar?.typ || [];
    const sameElixir = taList.includes('Elixir') && tbList.includes('Elixir');
    const sameArtefakt = taList.includes('L\u00e4gre Artefakt') && tbList.includes('L\u00e4gre Artefakt');
    if(sameElixir || sameArtefakt){
      const aLvl = LVL.find(l=>a.niv\u00e5er?.[l]) || '';
      const bLvl = LVL.find(l=>b.niv\u00e5er?.[l]) || '';
      const ai = LVL.indexOf(aLvl);
      const bi = LVL.indexOf(bLvl);
      if(ai !== bi) return ai - bi;
    }
    if (['Kvalitet','Mystisk kvalitet'].includes(ta) && ['Kvalitet','Mystisk kvalitet'].includes(tb)) {
      const order = ['Allm\u00e4n kvalitet','Vapenkvalitet','Rustningskvalitet','Sk\u00f6ldkvalitet'];
      const aSub = taList[taList.indexOf(ta)+1];
      const bSub = tbList[tbList.indexOf(tb)+1];
      const ai = order.indexOf(aSub);
      const bi = order.indexOf(bSub);
      const ia = ai === -1 ? 0 : ai;
      const ib = bi === -1 ? 0 : bi;
      if (ia !== ib) return ia - ib;
    }
    const at = taList.join(',');
    const bt = tbList.join(',');
    if(at < bt) return -1;
    if(at > bt) return 1;
    return compareSv(a.namn || '', b.namn || '');
  }

  function splitTags(arr){
    const source = Array.isArray(arr)
      ? arr
      : ((arr === undefined || arr === null) ? [] : [arr]);
    return source
      .flatMap(v => String(v ?? '').split(',').map(t => t.trim()))
      .filter(Boolean);
  }

  function getEntryTestTags(entry, opts = {}){
    if (!entry || typeof entry !== 'object') return [];
    const out = [];
    const seen = new Set();
    const add = (value) => {
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      const txt = String(value ?? '').trim();
      if (!txt) return;
      const key = searchNormalize(txt.toLowerCase());
      if (seen.has(key)) return;
      seen.add(key);
      out.push(txt);
    };

    const tags = entry.taggar || {};
    add(tags.test);

    const levelData = tags.nivå_data || tags.niva_data;
    if (levelData && typeof levelData === 'object') {
      const wantedLevel = String(opts.level || '').trim();
      if (wantedLevel) {
        const wantedKey = searchNormalize(wantedLevel.toLowerCase());
        const matchKey = Object.keys(levelData).find(key => searchNormalize(String(key || '').toLowerCase()) === wantedKey);
        if (matchKey) add(levelData[matchKey]?.test);
      } else {
        Object.values(levelData).forEach(meta => add(meta?.test));
      }
    }
    return out;
  }

  function explodeTags(arr){
    const map = {
      'H\u00e4xa': 'H\u00e4xkonst',
      'H\u00e4xkonst': 'H\u00e4xkonst',
      'H\u00e4xkonster': 'H\u00e4xkonst',
      'Ordensmagiker': 'Ordensmagi',
      'Ordensmagi': 'Ordensmagi',
      'Teurg': 'Teurgi',
      'Teurgi': 'Teurgi'
    };
    return splitTags(arr)
      .map(t => map[t] || t);
  }

  function splitQuals(val){
    if (!val) return [];
    if (Array.isArray(val)) return val.map(v=>String(v).trim()).filter(Boolean);
    return String(val).split(',').map(t=>t.trim()).filter(Boolean);
  }

  const TWO_HANDED_WEAPON_TYPES = Object.freeze(['Långa vapen', 'Tunga vapen']);
  const normalizeTypeNameForMatch = value => String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const TWO_HANDED_WEAPON_TYPE_KEYS = new Set(
    TWO_HANDED_WEAPON_TYPES.map(normalizeTypeNameForMatch)
  );

  function isTwoHandedWeaponType(typeName) {
    if (!typeName) return false;
    return TWO_HANDED_WEAPON_TYPE_KEYS.has(normalizeTypeNameForMatch(typeName));
  }

  function isTwoHandedWeaponEntry(entry) {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.some(isTwoHandedWeaponType);
  }

  function enforceArmorQualityExclusion(entry, qualities) {
    const types = entry?.taggar?.typ || [];
    const isArmor = Array.isArray(types) && types.includes('Rustning');
    const isShield = Array.isArray(types) && types.includes('Sköld');
    const list = Array.isArray(qualities) ? qualities.filter(Boolean) : [];
    if (!isArmor && !isShield) return list;

    const isArmorAgile = txt => txt.startsWith('smidig');
    // Backward compatibility: old saves may still have "Smidig/Smidigt" on shields.
    const isArmMountedShield = txt =>
      txt.startsWith('armfäst') || txt.startsWith('armfast') || txt.startsWith('smidig');

    const out = [];
    let hasOtymplig = false;
    let hasArmorAgile = false;
    let hasArmMountedShield = false;
    list.forEach(q => {
      const txt = String(q || '').toLowerCase();
      const isOtymplig = txt.startsWith('otymplig');
      const armorAgile = isArmorAgile(txt);
      const armMountedShield = isArmMountedShield(txt);
      if (isArmor && ((isOtymplig && hasArmorAgile) || (armorAgile && hasOtymplig))) return;
      if (isOtymplig) hasOtymplig = true;
      if (armorAgile) hasArmorAgile = true;
      if (armMountedShield) hasArmMountedShield = true;
      out.push(q);
    });

    if (isShield && hasArmMountedShield) {
      let hasKeptArmMounted = false;
      return out.filter(q => {
        if (isNegativeQual(q) || isNeutralQual(q)) return true;
        if (!isArmMountedShield(String(q || '').toLowerCase())) return false;
        if (hasKeptArmMounted) return false;
        hasKeptArmMounted = true;
        return true;
      });
    }

    return out;
  }

  function formatMoney(m) {
    if (!m) m = {};
    const d = m.d ?? m.daler ?? 0;
    const s = m.s ?? m.skilling ?? 0;
    const o = m.o ?? m['\u00f6rtegar'] ?? 0;
    const parts = [];
    if (d) parts.push(`${d}D`);
    if (s) parts.push(`${s}S`);
    if (o) parts.push(`${o}\u00d6`);
    return parts.join(' ') || '0';
  }

  // Returnera HTML med skada/skydd-stats för vapen och rustningar
  function itemStatHtml(entry, row) {
    if (!entry) return '';
    const types = entry.taggar?.typ || [];
    if (types.includes('Rustning')) {
      const stats = entry.stat || {};
      const parts = [];
      if (stats.skydd) parts.push(`Skydd: ${stats.skydd}`);
      if (stats.hasOwnProperty('begr\u00e4nsning')) {
        let limit = stats['begr\u00e4nsning'];
        if (row) {
          const removed = row.removedKval || [];
          const baseQuals = [
            ...(entry.taggar?.kvalitet || []),
            ...splitQuals(entry.kvalitet)
          ];
          const baseQ = baseQuals.filter(q => !removed.includes(q));
          let allQ = [...baseQ, ...(row.kvaliteter || [])];
          allQ = enforceArmorQualityExclusion(entry, allQ);
          let stonePen = 0;
          if (allQ.includes('Smidig') || allQ.includes('Smidigt')) limit += 2;
          if (allQ.includes('Otymplig') || allQ.includes('Otympligt')) limit -= 1;
          if (allQ.includes('Stenpansar')) stonePen -= 4;
          const list = storeHelper.getCurrentList(store);
          const rustLvl = storeHelper.abilityLevel(list, 'Rustmästare');
          if (rustLvl >= 2) limit = 0;
          limit += stonePen;
        }
        parts.push(`Begr\u00e4nsning: ${limit}`);
      }
      return parts.length ? `<br>${parts.join('<br>')}` : '';
    }
    if (types.includes('Vapen') || types.includes('Sköld')) {
      const dmg = entry.stat?.skada;
      return dmg ? `<br>Skada: ${dmg}` : '';
    }
    return '';
  }

  function formatWeight(w) {
    return Number(w).toFixed(2);
  }

  // Normalize text for searches by removing diacritics except for
  // the Swedish characters å, ä and ö. Everything should be in
  // lowercase before calling this function.
  function searchNormalize(str){
    return str
      .replace(/\u00e5/g,'__ao__')  // å
      .replace(/\u00e4/g,'__ae__')  // ä
      .replace(/\u00f6/g,'__oe__')  // ö
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/__ao__/g,'\u00e5')
      .replace(/__ae__/g,'\u00e4')
      .replace(/__oe__/g,'\u00f6');
  }

  // Copy text to clipboard. Uses the modern Clipboard API when available
  // and falls back to a temporary textarea element for older browsers.
  function copyToClipboard(text) {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
    return Promise.resolve();
  }

  function createSearchSorter(terms){
    const t = (terms||[])
      .map(s => searchNormalize(String(s).toLowerCase()))
      .filter(Boolean);
    return function(a,b){
      const aName = searchNormalize((a.namn||'').toLowerCase());
      const bName = searchNormalize((b.namn||'').toLowerCase());
      const aMatch = t.length && t.every(q=>aName.includes(q));
      const bMatch = t.length && t.every(q=>bName.includes(q));
      if(aMatch && !bMatch) return -1;
      if(!aMatch && bMatch) return 1;
      return sortByType(a,b);
    };
  }

  const ENTRY_SORT_DEFAULT = 'alpha-asc';
  const ENTRY_SORT_MODES = new Set([ENTRY_SORT_DEFAULT, 'alpha-desc', 'newest', 'oldest', 'test', 'ark']);

  function normalizeEntrySortMode(mode) {
    return ENTRY_SORT_MODES.has(mode) ? mode : ENTRY_SORT_DEFAULT;
  }

  function entryIdNumber(entry) {
    if (!entry || typeof entry !== 'object') return NaN;
    const rawId = String(entry.id ?? '').trim();
    if (!rawId) return NaN;
    const matches = rawId.match(/(\d+)/g);
    if (!matches || !matches.length) return NaN;
    const last = matches[matches.length - 1];
    const num = Number(last);
    return Number.isFinite(num) ? num : NaN;
  }

  function entrySortComparator(mode = ENTRY_SORT_DEFAULT, opts = {}) {
    const normalizedMode = normalizeEntrySortMode(mode);
    const extract = typeof opts.extract === 'function' ? opts.extract : (v => v);
    const tieKey = typeof opts.tieKey === 'function'
      ? opts.tieKey
      : (ent => {
          const name = String(ent?.namn ?? ent?.name ?? '').trim();
          const lvl  = String(ent?.nivå ?? ent?.level ?? '').trim();
          const trait = String(ent?.trait ?? '').trim();
          const id = String(ent?.id ?? '').trim();
          return `${name}|${lvl}|${trait}|${id}`;
        });

    const primaryTest = (ent) => {
      if (!ent || typeof ent !== 'object') return '';
      const list = getEntryTestTags(ent);
      return list[0] || '';
    };

    const primaryArk = (ent) => {
      if (!ent || typeof ent !== 'object') return '';
      const tags = ent.taggar || {};
      if (Array.isArray(tags.ark_trad) && tags.ark_trad.length) {
        const exploded = typeof splitTags === 'function' ? splitTags(tags.ark_trad) : tags.ark_trad;
        if (Array.isArray(exploded) && exploded.length) return exploded[0];
        return tags.ark_trad[0] || '';
      }
      return '';
    };

    return (a, b) => {
      const entA = extract(a) || {};
      const entB = extract(b) || {};
      const nameA = entA ? (entA.namn ?? entA.name ?? '') : '';
      const nameB = entB ? (entB.namn ?? entB.name ?? '') : '';
      const idNumA = entryIdNumber(entA);
      const idNumB = entryIdNumber(entB);
      const tieA = tieKey(entA);
      const tieB = tieKey(entB);

      if (normalizedMode === 'test') {
        const tA = primaryTest(entA);
        const tB = primaryTest(entB);
        const res = compareSv(tA, tB);
        if (res) return res;
        const nameRes = compareSv(nameA, nameB);
        if (nameRes) return nameRes;
        return compareSv(tieA, tieB);
      }

      if (normalizedMode === 'ark') {
        const aArk = primaryArk(entA);
        const bArk = primaryArk(entB);
        const res = compareSv(aArk, bArk);
        if (res) return res;
        const nameRes = compareSv(nameA, nameB);
        if (nameRes) return nameRes;
        return compareSv(tieA, tieB);
      }

      if (normalizedMode === 'newest') {
        const aHas = Number.isFinite(idNumA);
        const bHas = Number.isFinite(idNumB);
        if (aHas || bHas) {
          const aVal = aHas ? idNumA : -Infinity;
          const bVal = bHas ? idNumB : -Infinity;
          if (aVal !== bVal) return bVal - aVal;
        }
      } else if (normalizedMode === 'oldest') {
        const aHas = Number.isFinite(idNumA);
        const bHas = Number.isFinite(idNumB);
        if (aHas || bHas) {
          const aVal = aHas ? idNumA : Infinity;
          const bVal = bHas ? idNumB : Infinity;
          if (aVal !== bVal) return aVal - bVal;
        }
      }

      if (normalizedMode === 'alpha-desc') {
        const res = compareSv(nameB, nameA);
        if (res) return res;
        return compareSv(tieB, tieA);
      }

      const res = compareSv(nameA, nameB);
      if (res) return res;
      return compareSv(tieA, tieB);
    };
  }

  function normalizeLevelKey(level) {
    return typeof level === 'string' ? level.trim() : String(level ?? '').trim();
  }

  function getEntryLevelMeta(entry) {
    if (!entry || typeof entry !== 'object') return {};
    const levelKeys = new Set();
    const addLevelKey = (lvl) => {
      const key = normalizeLevelKey(lvl);
      if (key) levelKeys.add(key);
    };
    const levelData = entry?.taggar?.nivå_data;
    if (levelData && typeof levelData === 'object') {
      Object.keys(levelData).forEach(addLevelKey);
    }
    const levelDesc = entry?.nivåer;
    if (levelDesc && typeof levelDesc === 'object') {
      Object.keys(levelDesc).forEach(addLevelKey);
    }
    const legacyHandling = entry?.taggar?.handling;
    if (legacyHandling && typeof legacyHandling === 'object') {
      Object.keys(legacyHandling).forEach(addLevelKey);
    }
    const result = {};
    levelKeys.forEach(level => {
      const meta = {};
      const data = levelData?.[level];
      if (data && typeof data === 'object') {
        if (data.handling !== undefined && data.handling !== null) {
          meta.handling = Array.isArray(data.handling)
            ? data.handling.map(v => String(v ?? '').trim()).filter(Boolean).join(', ')
            : String(data.handling ?? '').trim();
        }
        if (data.skadetyp !== undefined && data.skadetyp !== null) {
          meta.skadetyp = String(data.skadetyp ?? '').trim();
        }
      }
      const legacy = legacyHandling?.[level];
      if (!meta.handling && legacy !== undefined && legacy !== null) {
        meta.handling = Array.isArray(legacy)
          ? legacy.map(v => String(v ?? '').trim()).filter(Boolean).join(', ')
          : String(legacy ?? '').trim();
      }
      if (Object.keys(meta).length) {
        result[level] = meta;
      }
    });
    return result;
  }

  const SKADETYP_NONE = new Set(['ingen', 'none', 'saknas', '-', '']);
  const SKADETYP_SPLIT_RE = /\s*(?:&|\/|,|\boch\b)\s*/i;
  const SKADETYP_ALIASES = new Map([
    ['fysisk', ['Yttre fysisk']],
    ['yttre fysisk och inre fysisk', ['Yttre fysisk', 'Inre fysisk']],
    ['yttre fysisk & inre fysisk', ['Yttre fysisk', 'Inre fysisk']]
  ]);

  const normalizeSkadetyp = (value) => String(value ?? '').trim();
  const skadetypIsNone = (value) => {
    const norm = searchNormalize(normalizeSkadetyp(value).toLowerCase());
    return SKADETYP_NONE.has(norm);
  };

  function getEntryDamageProfiles(entry, { includeNone = false } = {}) {
    const meta = getEntryLevelMeta(entry);
    const levels = Object.keys(meta);
    if (!levels.length) return [];
    return levels
      .map(level => {
        const info = meta[level] || {};
        return {
          level,
          skadetyp: normalizeSkadetyp(info.skadetyp || ''),
          handling: normalizeSkadetyp(info.handling || '')
        };
      })
      .filter(item => includeNone || !skadetypIsNone(item.skadetyp));
  }

  function entryHasDamageType(entry) {
    return getEntryDamageProfiles(entry).length > 0;
  }

  function findNamedTable(tables = window.TABELLER, options = {}) {
    const list = Array.isArray(tables) ? tables : [];
    const ids = Array.isArray(options.ids) ? options.ids.map(id => String(id || '').toLowerCase()) : [];
    const names = Array.isArray(options.names)
      ? options.names.map(name => searchNormalize(String(name || '').toLowerCase())).filter(Boolean)
      : [];
    const includes = Array.isArray(options.includes)
      ? options.includes.map(name => searchNormalize(String(name || '').toLowerCase())).filter(Boolean)
      : [];
    const byId = ids.length
      ? list.find(t => ids.includes(String(t?.id || '').toLowerCase()))
      : null;
    if (byId) return byId;
    const byName = names.length
      ? list.find(t => names.includes(searchNormalize(String(t?.namn || '').toLowerCase())))
      : null;
    if (byName) return byName;
    return includes.length
      ? list.find(t => includes.some(part => searchNormalize(String(t?.namn || '').toLowerCase()).includes(part)))
      : null;
  }

  function findSkadetypTable(tables = window.TABELLER) {
    return findNamedTable(tables, {
      ids: ['ta26'],
      names: ['Skadetyper och penetrering'],
      includes: ['skadetyper']
    });
  }

  function findBepansringTable(tables = window.TABELLER) {
    return findNamedTable(tables, {
      ids: ['ta25'],
      names: ['Bepansring och skydd'],
      includes: ['bepansring']
    });
  }

  function getTableRowLabelKey(table, fallbacks = []) {
    const columns = Array.isArray(table?.kolumner) ? table.kolumner : [];
    const normalizedFallbacks = fallbacks
      .map(name => searchNormalize(String(name || '').toLowerCase()))
      .filter(Boolean);
    const byColumn = columns.find(col => normalizedFallbacks.includes(searchNormalize(String(col || '').toLowerCase())));
    if (byColumn) return byColumn;

    const firstRow = Array.isArray(table?.rader) && table.rader.length ? table.rader[0] : null;
    if (!firstRow || typeof firstRow !== 'object') return '';
    return Object.keys(firstRow).find(key => normalizedFallbacks.includes(searchNormalize(String(key || '').toLowerCase()))) || '';
  }

  function findMatchingColumn(table, label) {
    const wanted = searchNormalize(String(label || '').toLowerCase());
    const columns = Array.isArray(table?.kolumner) ? table.kolumner : [];
    return columns.find(col => searchNormalize(String(col || '').toLowerCase()) === wanted) || '';
  }

  function resolveSkadetypLabels(skadetyp, tables = window.TABELLER) {
    const raw = normalizeSkadetyp(skadetyp);
    if (!raw || skadetypIsNone(raw)) return [];

    const knownLabels = new Set();
    const tablesToCheck = [findSkadetypTable(tables), findBepansringTable(tables)];
    tablesToCheck.forEach(table => {
      if (!table) return;
      const rowKey = getTableRowLabelKey(table, ['Skadetyp', 'Bepansringstyp']);
      if (rowKey) {
        (Array.isArray(table.rader) ? table.rader : []).forEach(row => {
          const label = String(row?.[rowKey] ?? '').trim();
          if (label) knownLabels.add(label);
        });
      }
      (Array.isArray(table.kolumner) ? table.kolumner : []).forEach(col => {
        const label = String(col ?? '').trim();
        if (label) knownLabels.add(label);
      });
    });

    const dedupe = (values) => {
      const seen = new Set();
      return values.filter(value => {
        const label = String(value ?? '').trim();
        if (!label) return false;
        const key = searchNormalize(label.toLowerCase());
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const tryDirect = dedupe([raw]).filter(label => {
      const wanted = searchNormalize(label.toLowerCase());
      for (const known of knownLabels) {
        if (searchNormalize(String(known || '').toLowerCase()) === wanted) return true;
      }
      return false;
    });
    if (tryDirect.length) return tryDirect;

    const alias = SKADETYP_ALIASES.get(searchNormalize(raw.toLowerCase()));
    if (alias?.length) return dedupe(alias);

    const parts = raw
      .split(SKADETYP_SPLIT_RE)
      .map(part => String(part || '').trim())
      .filter(Boolean);
    if (!parts.length) return [];

    const expanded = parts.flatMap(part => {
      const normalized = searchNormalize(part.toLowerCase());
      return SKADETYP_ALIASES.get(normalized) || [part];
    });
    return dedupe(expanded);
  }

  function buildTableFactsFromRow(row, columns) {
    return columns
      .map(column => ({
        label: String(column ?? '').trim(),
        value: String(row?.[column] ?? '').trim()
      }))
      .filter(item => item.label && item.value);
  }

  function getSkadetypTableDetails(skadetyp, tables = window.TABELLER) {
    const skadetypTable = findSkadetypTable(tables);
    const bepansringTable = findBepansringTable(tables);
    const labels = resolveSkadetypLabels(skadetyp, tables);
    const details = {
      labels,
      tables: {
        skadetyp: skadetypTable || null,
        bepansring: bepansringTable || null
      },
      items: []
    };
    if (!labels.length) return details;

    const penetrationRowKey = getTableRowLabelKey(skadetypTable, ['Skadetyp']);
    const penetrationValueColumns = (Array.isArray(skadetypTable?.kolumner) ? skadetypTable.kolumner : [])
      .filter(column => column !== penetrationRowKey);
    const armorRowKey = getTableRowLabelKey(bepansringTable, ['Bepansringstyp']);

    labels.forEach(label => {
      const normalizedLabel = searchNormalize(String(label || '').toLowerCase());
      let item = null;

      if (skadetypTable && penetrationRowKey) {
        const rows = Array.isArray(skadetypTable.rader) ? skadetypTable.rader : [];
        const row = rows.find(entry => searchNormalize(String(entry?.[penetrationRowKey] || '').toLowerCase()) === normalizedLabel) || null;
        if (row) {
          item = {
            label: String(row?.[penetrationRowKey] ?? label).trim() || label,
            source: String(skadetypTable.namn || '').trim(),
            facts: buildTableFactsFromRow(row, penetrationValueColumns)
          };
        }
      }

      if (!item && bepansringTable && armorRowKey) {
        const matchingColumn = findMatchingColumn(bepansringTable, label);
        if (matchingColumn) {
          const rows = Array.isArray(bepansringTable.rader) ? bepansringTable.rader : [];
          item = {
            label,
            source: String(bepansringTable.namn || '').trim(),
            facts: rows
              .map(row => ({
                label: String(row?.[armorRowKey] ?? '').trim(),
                value: String(row?.[matchingColumn] ?? '').trim()
              }))
              .filter(entry => entry.label && entry.value)
          };
        }
      }

      if (item) details.items.push(item);
    });

    return details;
  }

  function getSkadetypShielding(skadetyp, tables = window.TABELLER) {
    const details = getSkadetypTableDetails(skadetyp, tables);
    return {
      table: details?.tables?.skadetyp || details?.tables?.bepansring || null,
      skadetyp,
      labels: Array.isArray(details?.labels) ? details.labels.slice() : [],
      items: Array.isArray(details?.items) ? details.items.slice() : [],
      stops: [],
      pierces: [],
      unknown: []
    };
  }

  function describeSkadetypFactValue(value, sourceLabel = '') {
    const raw = String(value ?? '').trim();
    const norm = searchNormalize(raw.toLowerCase());
    const sourceNorm = searchNormalize(String(sourceLabel || '').toLowerCase());
    const fromSkadetypTable = sourceNorm.includes(searchNormalize('skadetyper och penetrering'));
    const fromArmorTable = sourceNorm.includes(searchNormalize('bepansring och skydd'));

    if (norm === 'ja') {
      if (fromSkadetypTable) return { text: 'Stoppas', tone: 'blocked', pill: true };
      if (fromArmorTable) return { text: 'Skyddar', tone: 'blocked', pill: true };
    }
    if (norm === 'nej') {
      if (fromSkadetypTable) return { text: 'Går igenom', tone: 'piercing', pill: true };
      if (fromArmorTable) return { text: 'Skyddar inte', tone: 'piercing', pill: true };
    }
    if (norm === 'stoppas' || norm === 'skyddar') {
      return { text: raw, tone: 'blocked', pill: true };
    }
    if (norm === 'går igenom' || norm === 'gar igenom' || norm === 'skyddar inte') {
      return { text: raw, tone: 'piercing', pill: true };
    }
    if (norm.includes('immun')) {
      return { text: raw, tone: 'immunity', pill: false };
    }
    if (/\d/.test(raw)) {
      return { text: raw, tone: 'scaled', pill: false };
    }
    return { text: raw, tone: 'neutral', pill: false };
  }

  function expandSkadetypLevelCodes(value) {
    const map = {
      n: 'Novis',
      g: 'Gesäll',
      m: 'Mästare',
      alla: 'Alla nivåer',
      'alla nivaer': 'Alla nivåer'
    };
    return String(value ?? '')
      .split('/')
      .map(part => {
        const label = String(part ?? '').trim();
        if (!label) return '';
        const norm = searchNormalize(label.toLowerCase());
        return map[norm] || label;
      })
      .filter(Boolean)
      .join(' / ');
  }

  function compactSkadetypLevelCodes(value) {
    const map = {
      novis: 'N',
      gesall: 'G',
      mastare: 'M',
      alla: 'Alla',
      'alla nivaer': 'Alla'
    };
    return String(value ?? '')
      .split('/')
      .map(part => {
        const label = String(part ?? '').trim();
        if (!label) return '';
        const norm = searchNormalize(label.toLowerCase());
        return map[norm] || label;
      })
      .filter(Boolean)
      .join('/');
  }

  function describeSkadetypDamageAmount(value) {
    const raw = String(value ?? '').trim();
    const norm = searchNormalize(raw.toLowerCase());
    if (norm === '100%') return 'Full skada';
    if (norm === '50%') return 'Halv skada';
    if (norm === 'immun') return 'Ingen skada';
    const pct = raw.match(/^(\d+)%$/);
    if (pct) return `${pct[1]}% skada`;
    return raw;
  }

  function parseSkadetypValueBreakdown(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const parts = raw.split(/\s*,\s*/).filter(Boolean);
    const parsed = parts.map(part => {
      const colonMatch = part.match(/^(.+?)\s*:\s*(.+)$/);
      if (colonMatch) {
        return {
          levelLabel: expandSkadetypLevelCodes(colonMatch[1]),
          effectLabel: describeSkadetypDamageAmount(colonMatch[2])
        };
      }
      const match = part.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (match) {
        return {
          levelLabel: expandSkadetypLevelCodes(match[2]),
          effectLabel: describeSkadetypDamageAmount(match[1])
        };
      }
      if (parts.length === 1) {
        return {
          levelLabel: '',
          effectLabel: describeSkadetypDamageAmount(part)
        };
      }
      return null;
    });
    return parsed.every(Boolean) ? parsed : null;
  }

  function buildSkadetypBreakdownHtml(value, escapeHtmlFn) {
    const breakdown = parseSkadetypValueBreakdown(value);
    if (!breakdown?.length) return '';
    const escape = typeof escapeHtmlFn === 'function'
      ? escapeHtmlFn
      : (input => String(input ?? ''));
    return `<span class="skadetyp-fact-breakdown">${breakdown.map(part => `
      <span class="skadetyp-fact-segment">
        <span class="skadetyp-fact-segment-label">${escape(part.levelLabel || 'Alla nivåer')}</span>
        <span class="skadetyp-fact-segment-value">${escape(part.effectLabel)}</span>
      </span>
    `).join('')}</span>`;
  }

  function buildSkadetypPanelHtml(entry, opts = {}) {
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
    const toSafeDomKey = (value) => searchNormalize(String(value ?? '').toLowerCase())
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';

    if (!entry || typeof entry !== 'object') return null;
    const profiles = getEntryDamageProfiles(entry, { includeNone: true });
    if (!profiles.length) return null;

    const desiredLevel = normalizeLevelKey(opts.level);
    const pick = (profiles.find(p => normalizeLevelKey(p.level) === desiredLevel)
      || profiles.find(p => !skadetypIsNone(p.skadetyp))
      || profiles[0]) || {};
    const primaryType = skadetypIsNone(pick.skadetyp) ? 'Ingen skadetyp' : (pick.skadetyp || 'Skadetyp');
    const iconHtmlStr = iconHtml('skadetyp', { width: 40, height: 40 });
    const levelTags = profiles
      .map(p => {
        const label = skadetypIsNone(p.skadetyp) ? 'Ingen' : p.skadetyp || '';
        const active = normalizeLevelKey(p.level) === normalizeLevelKey(pick.level);
        const cls = active ? 'tag active' : 'tag';
        return `<span class="${cls}">${escapeHtml(p.level || '')}: ${escapeHtml(label)}</span>`;
      })
      .join('');

    const renderFactPairs = (facts, sourceLabel = '') => {
      if (!facts.length) {
        return `<p class="skadetyp-empty">Ingen matchande rad hittades i tabellen.</p>`;
      }
      const rowsHtml = facts.map(item => {
        const display = describeSkadetypFactValue(item.value, sourceLabel);
        const breakdownHtml = buildSkadetypBreakdownHtml(item.value, escapeHtml);
        const rowClasses = ['skadetyp-fact-row'];
        const valueClasses = ['summary-value', 'skadetyp-fact-value'];
        if (display.tone) rowClasses.push(`is-${display.tone}`);
        let valueHtml = '';
        if (breakdownHtml) {
          const breakdown = parseSkadetypValueBreakdown(item.value);
          if (breakdown?.length === 1 && !breakdown[0].levelLabel) {
            valueClasses.push('skadetyp-fact-badge-wrap');
            valueHtml = `
              <span class="skadetyp-status-badge is-scaled no-dot">
                <span class="skadetyp-status-badge__label">${escapeHtml(breakdown[0].effectLabel)}</span>
              </span>
            `.trim();
          } else {
            valueClasses.push('skadetyp-fact-breakdown-wrap');
            valueHtml = breakdownHtml;
          }
        } else if (display.pill) {
          valueClasses.push('skadetyp-fact-badge-wrap');
          valueHtml = `
            <span class="skadetyp-status-badge${display.tone ? ` is-${display.tone}` : ''}">
              <span class="skadetyp-status-badge__dot" aria-hidden="true"></span>
              <span class="skadetyp-status-badge__label">${escapeHtml(display.text)}</span>
            </span>
          `.trim();
        } else {
          if (display.tone) valueClasses.push(`is-${display.tone}`);
          valueHtml = escapeHtml(display.text);
        }
        return `
          <li class="${rowClasses.join(' ')}">
            <span class="summary-key">${escapeHtml(item.label)}</span>
            <span class="${valueClasses.join(' ')}">${valueHtml}</span>
          </li>`;
      }).join('');
      return `<ul class="summary-list summary-pairs skadetyp-pairs">${rowsHtml}</ul>`;
    };

    const renderLevelBlock = (profile) => {
      const lvl = profile.level || 'Okänd';
      const hasDamage = !skadetypIsNone(profile.skadetyp);
      const isActiveLevel = normalizeLevelKey(profile.level) === normalizeLevelKey(pick.level);
      const tableDetails = hasDamage ? getSkadetypTableDetails(profile.skadetyp, opts.tables || window.TABELLER) : null;
      const levelTypes = hasDamage
        ? resolveSkadetypLabels(profile.skadetyp, opts.tables || window.TABELLER)
        : [];
      let armorSection = '';
      if (!hasDamage) {
        armorSection = `<p class="skadetyp-empty">Ingen skadetyp angiven för denna nivå.</p>`;
      } else if (!(tableDetails?.tables?.skadetyp || tableDetails?.tables?.bepansring)) {
        armorSection = `<p class="skadetyp-empty">Ingen skadetypstabell hittades.</p>`;
      } else if (!tableDetails?.items?.length) {
        armorSection = `<p class="skadetyp-empty">Ingen matchande rad eller kolumn hittades i skadetypstabellerna.</p>`;
      } else if (tableDetails.items.length === 1) {
        const item = tableDetails.items[0];
        armorSection = `
          <div class="skadetyp-columns">
            <div class="skadetyp-col skadetyp-table-block">
              <div class="skadetyp-col-title">${escapeHtml(item.label || 'Skadetyp')}</div>
              ${item.source ? `<div class="skadetyp-source">${escapeHtml(item.source)}</div>` : ''}
              ${renderFactPairs(Array.isArray(item.facts) ? item.facts : [], item.source || '')}
            </div>
          </div>`;
      } else {
        const switcherKey = [entry?.id || entry?.namn || 'skadetyp', lvl]
          .map(toSafeDomKey)
          .join('-');
        armorSection = `
          <div class="skadetyp-switcher" data-skadetyp-switcher>
            <div class="skadetyp-switcher-tabs" role="tablist" aria-label="Skadetyper">
              ${tableDetails.items.map((item, idx) => {
                const targetId = `${switcherKey}-${toSafeDomKey(item.label || idx)}`;
                return `<button
                  class="skadetyp-switcher-tab${idx === 0 ? ' is-active' : ''}"
                  type="button"
                  role="tab"
                  aria-selected="${idx === 0 ? 'true' : 'false'}"
                  data-skadetyp-switcher-tab="${targetId}"
                >${escapeHtml(item.label || 'Skadetyp')}</button>`;
              }).join('')}
            </div>
            <div class="skadetyp-switcher-panels">
              ${tableDetails.items.map((item, idx) => {
                const targetId = `${switcherKey}-${toSafeDomKey(item.label || idx)}`;
                return `<div
                  class="skadetyp-switcher-panel${idx === 0 ? ' is-active' : ''}"
                  role="tabpanel"
                  data-skadetyp-switcher-panel="${targetId}"
                  ${idx === 0 ? '' : 'hidden'}
                >
                  <div class="skadetyp-col skadetyp-table-block">
                    <div class="skadetyp-col-title">${escapeHtml(item.label || 'Skadetyp')}</div>
                    ${item.source ? `<div class="skadetyp-source">${escapeHtml(item.source)}</div>` : ''}
                    ${renderFactPairs(Array.isArray(item.facts) ? item.facts : [], item.source || '')}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }
      const levelTypeHtml = levelTypes.length > 1
        ? `<span class="skadetyp-level-types tags">${levelTypes.map(type => `<span class="tag">${escapeHtml(type)}</span>`).join('')}</span>`
        : `<span class="skadetyp-level-type">${escapeHtml(hasDamage ? (profile.skadetyp || '') : 'Ingen skadetyp')}</span>`;
      return `
        <details class="skadetyp-level-block skadetyp-level-details"${isActiveLevel ? ' open' : ''}>
          <summary class="skadetyp-level-head">
            <span class="tag">${escapeHtml(lvl)}</span>
            ${levelTypeHtml}
            <span class="skadetyp-level-toggle" aria-hidden="true"></span>
          </summary>
          <div class="skadetyp-level-body">
            ${armorSection}
          </div>
        </details>`;
    };

    const levelBlocks = profiles.map(renderLevelBlock).join('');

    const header = `
      <div class="skadetyp-hero">
        <div class="skadetyp-icon">${iconHtmlStr}</div>
        <div class="skadetyp-meta">
          <div class="skadetyp-label">${escapeHtml(entry.namn || 'Skadetyp')}</div>
          <div class="skadetyp-type">${escapeHtml(primaryType)}</div>
          ${levelTags ? `<div class="skadetyp-levels tags">${levelTags}</div>` : ''}
        </div>
      </div>`;

    return `<div class="skadetyp-panel">${header}${levelBlocks}</div>`;
  }

  function openSkadetypPanel(entry, opts = {}) {
    const html = buildSkadetypPanelHtml(entry, opts);
    if (!html) {
      window.toast?.('Ingen skadetyp hittades för denna kraft.');
      return false;
    }
    const titleName = entry?.namn ? `${entry.namn} – Skadetyp` : 'Skadetyp';
    if (window.yrkePanel?.open) {
      window.yrkePanel.open(titleName, html);
    } else if (window.tabellPopup?.open) {
      window.tabellPopup.open(html, titleName);
    } else {
      const host = document.createElement('div');
      host.innerHTML = html;
      alert(host.textContent || titleName);
    }
    return true;
  }

  let skadetypSwitcherBound = false;
  function ensureSkadetypSwitcherHandler() {
    if (skadetypSwitcherBound || typeof document === 'undefined') return;
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-skadetyp-switcher-tab]');
      if (!button) return;
      const wrap = button.closest('[data-skadetyp-switcher]');
      if (!wrap) return;
      const target = String(button.dataset.skadetypSwitcherTab || '').trim();
      if (!target) return;
      wrap.querySelectorAll('[data-skadetyp-switcher-tab]').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      wrap.querySelectorAll('[data-skadetyp-switcher-panel]').forEach(panel => {
        const active = String(panel.dataset.skadetypSwitcherPanel || '').trim() === target;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    });
    skadetypSwitcherBound = true;
  }

  ensureSkadetypSwitcherHandler();

  window.LVL = LVL;
  window.EQUIP = EQUIP;
  window.SBASE = SBASE;
  window.OBASE = OBASE;
  window.moneyToO = moneyToO;
  window.oToMoney = oToMoney;
  window.isInv = isInv;
  window.isQual = isQual;
  window.canApplyQuality = canApplyQuality;
  window.isYrke = isYrke;
  window.isRas = isRas;
  window.isElityrke = isElityrke;
  window.isEliteSkill = isEliteSkill;
  window.isMonstrousTrait = isMonstrousTrait;
  window.isSardrag = isSardrag;
  window.isEmployment = isEmployment;
  window.isService = isService;
  window.isMysticQual = isMysticQual;
  window.isNegativeQual = isNegativeQual;
  window.isNeutralQual = isNeutralQual;
  window.sortByType = sortByType;
  window.splitTags = splitTags;
  window.explodeTags = explodeTags;
  window.splitQuals = splitQuals;
  window.TWO_HANDED_WEAPON_TYPES = TWO_HANDED_WEAPON_TYPES;
  window.isTwoHandedWeaponType = isTwoHandedWeaponType;
  window.isTwoHandedWeaponEntry = isTwoHandedWeaponEntry;
  Object.defineProperty(window, 'enforceArmorQualityExclusion', {
    value: enforceArmorQualityExclusion,
    writable: false,
    configurable: false
  });
  window.formatMoney = formatMoney;
  window.itemStatHtml = itemStatHtml;
  window.formatWeight = formatWeight;
  window.searchNormalize = searchNormalize;
  window.createSearchSorter = createSearchSorter;
  window.normalizeEntrySortMode = normalizeEntrySortMode;
  window.entrySortComparator = entrySortComparator;
  window.getEntryTestTags = getEntryTestTags;
  window.compareSv = compareSv;
  window.ENTRY_SORT_DEFAULT = ENTRY_SORT_DEFAULT;
  window.ENTRY_SORT_MODES = ENTRY_SORT_MODES;
  window.copyToClipboard = copyToClipboard;
  window.catComparator = catComparator;
  window.catName = catName;
  window.lookupEntry = lookupEntry;
  window.iconHtml = iconHtml;
  window.refreshCharacterIconElements = refreshCharacterIconElements;
  window.setCharacterIconOverride = setCharacterIconOverride;
  window.setCharacterIconVariant = setCharacterIconVariant;
  window.getCharacterIconSrc = getCharacterIconSrc;
  window.getEntryLevelMeta = getEntryLevelMeta;
  window.getEntryDamageProfiles = getEntryDamageProfiles;
  window.entryHasDamageType = entryHasDamageType;
  window.getSkadetypShielding = getSkadetypShielding;
  window.describeSkadetypFactValue = describeSkadetypFactValue;
  window.parseSkadetypValueBreakdown = parseSkadetypValueBreakdown;
  window.compactSkadetypLevelCodes = compactSkadetypLevelCodes;
  window.buildSkadetypBreakdownHtml = buildSkadetypBreakdownHtml;
  window.buildSkadetypPanelHtml = buildSkadetypPanelHtml;
  window.openSkadetypPanel = openSkadetypPanel;
})(window);
