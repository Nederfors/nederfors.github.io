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
    settings  : 'icons/settings.svg',
    smithing  : 'icons/smithing.svg'
  });

  function iconHtml(name, opts = {}) {
    if (!name) return '';
    const src = ICON_SOURCES[name] || `icons/${name}.svg`;
    const extraClass = opts.className ? ` ${opts.className}` : '';
    const alt = typeof opts.alt === 'string' ? opts.alt : '';
    const attrs = [];
    if (opts.loading) attrs.push(`loading="${opts.loading}"`);
    if (opts.decoding) attrs.push(`decoding="${opts.decoding}"`);
    const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
    return `<img src="${src}" alt="${alt}" class="btn-icon${extraClass}"${attrStr}>`;
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
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
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
    return (a.namn || '').localeCompare(b.namn || '');
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
          const allQ = [...baseQ, ...(row.kvaliteter || [])];
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
  window.formatMoney = formatMoney;
  window.itemStatHtml = itemStatHtml;
  window.formatWeight = formatWeight;
  window.searchNormalize = searchNormalize;
  window.createSearchSorter = createSearchSorter;
  window.copyToClipboard = copyToClipboard;
  window.catComparator = catComparator;
  window.catName = catName;
  window.lookupEntry = lookupEntry;
  window.iconHtml = iconHtml;
})(window);
