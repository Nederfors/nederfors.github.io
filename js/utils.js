(function(window){
  const LVL   = ['Novis','Ges\u00e4ll','M\u00e4stare'];
  const EQUIP = [
    'Vapen',
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
    'Specialverktyg'
  ];
  const SBASE = 10, OBASE = 10;

  const TYPE_PRIORITIES = { Ras: 0, Yrke: 1, Elityrke: 2 };

  function isInv(p){ return (p.taggar?.typ||[]).some(t => EQUIP.includes(t)); }
  function isQual(p){
    return (p.taggar?.typ||[]).some(t => ['Kvalitet','Mystisk kvalitet'].includes(t));
  }
  function isYrke(p){ return (p.taggar?.typ||[]).includes('Yrke'); }
  function isRas(p){ return (p.taggar?.typ||[]).includes('Ras'); }
  function isElityrke(p){ return (p.taggar?.typ||[]).includes('Elityrke'); }
  function isEliteSkill(p){ return (p.taggar?.typ||[]).includes('Elityrkesf\u00f6rm\u00e5ga'); }
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
    const at = (a.taggar?.typ || ['']).join(',');
    const bt = (b.taggar?.typ || ['']).join(',');
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
  function itemStatHtml(entry) {
    if (!entry) return '';
    const types = entry.taggar?.typ || [];
    if (types.includes('Rustning')) {
      const stats = entry.stat || {};
      const parts = [];
      if (stats.skydd) parts.push(`Skydd: ${stats.skydd}`);
      if (stats.hasOwnProperty('begr\u00e4nsning'))
        parts.push(`Begr\u00e4nsning: ${stats['begr\u00e4nsning']}`);
      return parts.length ? `<br>${parts.join(' ')}` : '';
    }
    if (types.includes('Vapen')) {
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
  window.isMysticQual = isMysticQual;
  window.isNegativeQual = isNegativeQual;
  window.isNeutralQual = isNeutralQual;
  window.sortByType = sortByType;
  window.explodeTags = explodeTags;
  window.splitQuals = splitQuals;
  window.formatMoney = formatMoney;
  window.itemStatHtml = itemStatHtml;
  window.searchNormalize = searchNormalize;
})(window);
