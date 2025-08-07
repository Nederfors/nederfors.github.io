(function(window){
  const LVL   = ['Novis','Ges\u00e4ll','M\u00e4stare'];
  const EQUIP = [
    'Vapen',
    'Sköld',
    'Pil/Lod',
    'Rustning',
    'Diverse',
    'Elixir',
    'Mat',
    'Dryck',
    'L\u00e4gre Artefakt',
    'Artefakter',
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
    'Kvalitet': 'Kvaliteter',
    'Mystisk kvalitet': 'Mystiska kvaliteter',
    'Elixir': 'Elixir',
    'Lägre Artefakt': 'Lägre Artefakter',
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

  function isInv(p){ return (p.taggar?.typ||[]).some(t => EQUIP.includes(t)); }
  function isQual(p){
    return (p.taggar?.typ||[]).some(t => ['Kvalitet','Mystisk kvalitet'].includes(t));
  }
  function isYrke(p){ return (p.taggar?.typ||[]).includes('Yrke'); }
  function isRas(p){ return (p.taggar?.typ||[]).includes('Ras'); }
  function isElityrke(p){ return (p.taggar?.typ||[]).includes('Elityrke'); }
  function isEliteSkill(p){ return (p.taggar?.typ||[]).includes('Elityrkesf\u00f6rm\u00e5ga'); }
  function isMonstrousTrait(p){ return (p.taggar?.typ||[]).includes('Monstru\u00f6st s\u00e4rdrag'); }
  function isSardrag(p){ return (p.taggar?.typ||[]).includes('S\u00e4rdrag'); }
  function isMysticQual(name){
    return (window.DB?.find(x => x.namn === name)?.taggar?.typ || []).includes('Mystisk kvalitet');
  }
  function isNegativeQual(name){
    return Boolean(window.DB?.find(x => x.namn === name)?.negativ);
  }
  function isNeutralQual(name){
    return Boolean(window.DB?.find(x => x.namn === name)?.neutral);
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
    const at = taList.join(',');
    const bt = tbList.join(',');
    if(at < bt) return -1;
    if(at > bt) return 1;
    return (a.namn || '').localeCompare(b.namn || '');
  }

  function explodeTags(arr){
    return (arr || [])
      .flatMap(v => v.split(',').map(t => t.trim()))
      .filter(Boolean);
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
    return `${d}D ${s}S ${o}\u00d6`;
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
          if (allQ.includes('Smidig') || allQ.includes('Smidigt')) limit += 2;
          if (allQ.includes('Otymplig') || allQ.includes('Otympligt')) limit -= 1;
          const list = storeHelper.getCurrentList(store);
          const rustLvl = storeHelper.abilityLevel(list, 'Rustmästare');
          if (rustLvl >= 2) limit = 0;
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
  window.isInv = isInv;
  window.isQual = isQual;
  window.isYrke = isYrke;
  window.isRas = isRas;
  window.isElityrke = isElityrke;
  window.isEliteSkill = isEliteSkill;
  window.isMonstrousTrait = isMonstrousTrait;
  window.isSardrag = isSardrag;
  window.isMysticQual = isMysticQual;
  window.isNegativeQual = isNegativeQual;
  window.isNeutralQual = isNeutralQual;
  window.sortByType = sortByType;
  window.explodeTags = explodeTags;
  window.splitQuals = splitQuals;
  window.formatMoney = formatMoney;
  window.itemStatHtml = itemStatHtml;
  window.searchNormalize = searchNormalize;
  window.createSearchSorter = createSearchSorter;
  window.copyToClipboard = copyToClipboard;
  window.catComparator = catComparator;
  window.catName = catName;
})(window);
