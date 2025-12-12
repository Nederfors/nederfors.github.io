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
      const { id, namn, name } = ref;
      return {
        id: id !== undefined && id !== null && String(id).trim() !== '' ? String(id).trim() : undefined,
        name: typeof namn === 'string' && namn.trim() ? namn.trim()
          : (typeof name === 'string' && name.trim() ? name.trim() : undefined)
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
    return (arr || [])
      .flatMap(v => v.split(',').map(t => t.trim()))
      .filter(Boolean)
      .map(t => map[t] || t);
  }

  function splitQuals(val){
    if (!val) return [];
    if (Array.isArray(val)) return val.map(v=>String(v).trim()).filter(Boolean);
    return String(val).split(',').map(t=>t.trim()).filter(Boolean);
  }

  function enforceArmorQualityExclusion(entry, qualities) {
    const types = entry?.taggar?.typ || [];
    const isArmor = Array.isArray(types) && types.includes('Rustning');
    const list = Array.isArray(qualities) ? qualities.filter(Boolean) : [];
    if (!isArmor) return list;

    const out = [];
    let hasOtymplig = false;
    let hasSmidig = false;
    list.forEach(q => {
      const txt = String(q || '').toLowerCase();
      const isOtymplig = txt.startsWith('otymplig');
      const isSmidig = txt.startsWith('smidig');
      if ((isOtymplig && hasSmidig) || (isSmidig && hasOtymplig)) return;
      if (isOtymplig) hasOtymplig = true;
      if (isSmidig) hasSmidig = true;
      out.push(q);
    });

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
      const tags = ent.taggar || {};
      const list = Array.isArray(tags.test) ? tags.test : [];
      return list[0] || '';
    };

    const primaryArk = (ent) => {
      if (!ent || typeof ent !== 'object') return '';
      const tags = ent.taggar || {};
      if (Array.isArray(tags.ark_trad) && tags.ark_trad.length) {
        const exploded = typeof explodeTags === 'function' ? explodeTags(tags.ark_trad) : tags.ark_trad;
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

  const SKADETYP_NONE = new Set(['ingen', 'none', 'saknas', '']);
  const armorStopWords = [/stoppas/i, /skyddar(?!\s*inte)/i];
  const armorPierceWords = [/går igenom/i, /gar igenom/i, /skyddar inte/i];
  const SKADETYP_ARMOR_KEYS = [
    'Bepansring – rustningar',
    'Naturligt pansar',
    'Mystisk bepansring',
    'Robust/Överlevnadsinstinkt'
  ];
  const ARMOR_DISPLAY_LABELS = new Map([
    [searchNormalize('Bepansring – rustningar'.toLowerCase()), 'Rustningar']
  ]);
  const SKADETYP_MATRIX = {
    'yttre fysisk': {
      stop: SKADETYP_ARMOR_KEYS,
      pierce: []
    },
    'inre fysisk': {
      stop: [],
      pierce: SKADETYP_ARMOR_KEYS
    },
    'elementär': {
      stop: ['Naturligt pansar', 'Mystisk bepansring'],
      pierce: ['Bepansring – rustningar', 'Robust/Överlevnadsinstinkt']
    },
    'mystisk': {
      stop: ['Mystisk bepansring'],
      pierce: ['Bepansring – rustningar', 'Naturligt pansar', 'Robust/Överlevnadsinstinkt']
    },
    'gift': {
      stop: [],
      pierce: SKADETYP_ARMOR_KEYS
    },
    'ignorerar bepansring': {
      stop: ['Mystisk bepansring', 'Robust/Överlevnadsinstinkt'],
      pierce: ['Bepansring – rustningar', 'Naturligt pansar']
    },
    'fallskada': {
      stop: [],
      pierce: SKADETYP_ARMOR_KEYS
    }
  };

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

  function findSkadetypTable(tables = window.TABELLER) {
    const list = Array.isArray(tables) ? tables : [];
    const byId = list.find(t => String(t.id || '').toLowerCase() === 'ta23');
    if (byId) return byId;
    return list.find(t => (t?.namn || '').toLowerCase().includes('skadetyper'));
  }

  function classifyArmorResult(value) {
    const norm = searchNormalize(String(value ?? '').toLowerCase());
    if (!norm) return 'unknown';
    if (armorStopWords.some(rx => rx.test(norm))) return 'stop';
    if (armorPierceWords.some(rx => rx.test(norm))) return 'pierce';
    return 'unknown';
  }

  function buildShieldingFromMatrix(normType) {
    const matrix = SKADETYP_MATRIX[normType];
    if (!matrix) return null;
    const displayArmor = (label) => {
      const norm = searchNormalize(String(label || '').toLowerCase());
      return ARMOR_DISPLAY_LABELS.get(norm) || label;
    };
    const result = {
      table: null,
      skadetyp: normType,
      stops: [],
      pierces: [],
      unknown: [],
      armorKeys: SKADETYP_ARMOR_KEYS.slice()
    };
    matrix.stop.forEach(armor => {
      result.stops.push({ armor: displayArmor(armor), text: 'Stoppas' });
    });
    matrix.pierce.forEach(armor => {
      result.pierces.push({ armor: displayArmor(armor), text: 'Går igenom' });
    });
    // Any remaining armor keys not listed become unknown
    const listed = new Set([...matrix.stop, ...matrix.pierce]);
    SKADETYP_ARMOR_KEYS.forEach(armor => {
      if (!listed.has(armor)) {
        result.unknown.push({ armor: displayArmor(armor), text: '' });
      }
    });
    return result;
  }

  function getSkadetypShielding(skadetyp, tables = window.TABELLER) {
    const normType = searchNormalize(String(skadetyp || '').toLowerCase());
    const staticResult = buildShieldingFromMatrix(normType);
    if (staticResult) return staticResult;

    const table = findSkadetypTable(tables);
    const result = {
      table: table || null,
      skadetyp,
      stops: [],
      pierces: [],
      unknown: [],
      armorKeys: []
    };
    if (!table) return result;

    const displayArmor = (label) => {
      const norm = searchNormalize(String(label || '').toLowerCase());
      return ARMOR_DISPLAY_LABELS.get(norm) || label;
    };

    const armorKeys = (Array.isArray(table.kolumner) ? table.kolumner : []).filter(col => {
      const norm = searchNormalize(String(col || '').toLowerCase());
      return norm && norm !== 'skadetyp';
    });
    result.armorKeys = armorKeys;

    const rows = Array.isArray(table.rader) ? table.rader : [];
    const row = rows.find(r => searchNormalize(String(r?.Skadetyp || r?.skadetyp || '').toLowerCase()) === normType) || null;
    if (!row) return result;

    armorKeys.forEach(key => {
      const val = row[key] ?? '';
      const verdict = classifyArmorResult(val);
      const entry = { armor: displayArmor(key), text: String(val ?? '').trim() };
      if (verdict === 'stop') result.stops.push(entry);
      else if (verdict === 'pierce') result.pierces.push(entry);
      else result.unknown.push(entry);
    });

    return result;
  }

  function buildSkadetypPanelHtml(entry, opts = {}) {
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);

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

    const renderList = (items, emptyText) => {
      if (!items.length) {
        return `<p class="skadetyp-empty">${escapeHtml(emptyText)}</p>`;
      }
      return `<ul class="skadetyp-list">${items.map(it => {
        const suffix = it.text && it.text.toLowerCase() !== 'stoppas' && it.text.toLowerCase() !== 'går igenom'
          ? ` – ${escapeHtml(it.text)}`
          : '';
        return `<li><strong>${escapeHtml(it.armor)}</strong>${suffix}</li>`;
      }).join('')}</ul>`;
    };

    const renderLevelBlock = (profile) => {
      const lvl = profile.level || 'Okänd';
      const hasDamage = !skadetypIsNone(profile.skadetyp);
      const shielding = hasDamage ? getSkadetypShielding(profile.skadetyp, opts.tables || window.TABELLER) : null;
      const stops = shielding?.stops || [];
      const pierces = shielding?.pierces || [];
      const unknown = shielding?.unknown || [];
      const hasShieldingData = shielding && (stops.length || pierces.length || unknown.length);
      let armorSection;
      if (!hasDamage) {
        armorSection = `<p class="skadetyp-empty">Ingen skadetyp angiven för denna nivå.</p>`;
      } else if (!shielding) {
        armorSection = `<p class="skadetyp-empty">Ingen tabell för skadetyper hittades.</p>`;
      } else if (!hasShieldingData) {
        armorSection = `<p class="skadetyp-empty">Ingen tabellrad för skadetypen hittades.</p>`;
      } else {
        armorSection = `<div class="skadetyp-columns">
            <div class="skadetyp-col skadetyp-stop">
              <div class="skadetyp-col-title">Stoppas av</div>
              ${renderList(stops, 'Inga bepansringar stoppar denna skadetyp.')}
            </div>
            <div class="skadetyp-col skadetyp-pierce">
              <div class="skadetyp-col-title">Går igenom</div>
            ${renderList(pierces, 'Går inte igenom någon bepansring.')}
            </div>
            ${unknown.length ? `<div class="skadetyp-col skadetyp-unknown">
              <div class="skadetyp-col-title">Okänt</div>
              ${renderList(unknown, 'Ingen uppgift.')}
            </div>` : ''}
          </div>`;
      }
      return `
        <section class="skadetyp-level-block">
          <div class="skadetyp-level-head">
            <span class="tag">${escapeHtml(lvl)}</span>
            <span class="skadetyp-level-type">${escapeHtml(hasDamage ? (profile.skadetyp || '') : 'Ingen skadetyp')}</span>
          </div>
          ${armorSection}
        </section>`;
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
  window.explodeTags = explodeTags;
  window.splitQuals = splitQuals;
  window.enforceArmorQualityExclusion = enforceArmorQualityExclusion;
  window.formatMoney = formatMoney;
  window.itemStatHtml = itemStatHtml;
  window.formatWeight = formatWeight;
  window.searchNormalize = searchNormalize;
  window.createSearchSorter = createSearchSorter;
  window.normalizeEntrySortMode = normalizeEntrySortMode;
  window.entrySortComparator = entrySortComparator;
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
  window.buildSkadetypPanelHtml = buildSkadetypPanelHtml;
  window.openSkadetypPanel = openSkadetypPanel;
})(window);
