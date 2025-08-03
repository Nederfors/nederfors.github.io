(function(window){
  function calcDefense(kvick){
    const inv = storeHelper.getInventory(store);
    const list = storeHelper.getCurrentList(store);
    const rustLvl = storeHelper.abilityLevel(list, 'Rustmästare');

    let hasBalancedWeapon = false;
    let weaponCount = 0;
    inv.forEach(row => {
      const entry = invUtil.getEntry(row.name);
      if (!entry || !((entry.taggar?.typ || []).includes('Vapen'))) return;
      weaponCount += 1;
      const tagger = entry.taggar || {};
      const baseQ = [
        ...(tagger.kvalitet || []),
        ...splitQuals(entry.kvalitet)
      ];
      const removed = row.removedKval || [];
      const allQ = [
        ...baseQ.filter(q => !removed.includes(q)),
        ...(row.kvaliteter || [])
      ];
      if (allQ.includes('Balanserat')) hasBalancedWeapon = true;
    });

    let res = inv.reduce((out,row)=>{
      const entry = invUtil.getEntry(row.name);
      if(!entry || !((entry.taggar?.typ||[]).includes('Rustning'))) return out;
      const tagger = entry.taggar || {};
      const baseQ = [
        ...(tagger.kvalitet || []),
        ...splitQuals(entry.kvalitet)
      ];
      const removed = row.removedKval || [];
      const allQ = [
        ...baseQ.filter(q=>!removed.includes(q)),
        ...(row.kvaliteter || [])
      ];
      let limit = entry.stat?.['begränsning'] || 0;
      if(allQ.includes('Smidig') || allQ.includes('Smidigt')) limit += 2;
      if(allQ.includes('Otymplig') || allQ.includes('Otympligt')) limit -= 1;
      if(rustLvl >= 2) limit = 0;
      out.push({ name: row.name, value: kvick + limit });
      return out;
    }, []);

    res = res.length ? res : [ { value: kvick } ];

    const twinLvl = storeHelper.abilityLevel(list, 'Tvillingattack');
    if (twinLvl >= 1 && weaponCount >= 2) {
      res.forEach(r => { r.value += 1; });
    }

    if (hasBalancedWeapon) {
      res.forEach(r => { r.value += 1; });
    }

    return res;
  }

  function renderTraits(){
    if(!dom.traits) return;
    const data = storeHelper.getTraits(store);
    const KEYS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffs\u00e4ker','Vaksam','Viljestark','\u00d6vertygande'];

    const list  = storeHelper.getCurrentList(store);
    const effects = storeHelper.getArtifactEffects(store);
    const permBase = storeHelper.calcPermanentCorruption(list, effects);
    const hasEarth = list.some(p => p.namn === 'Jordnära');
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(storeHelper.getInventory(store)) : {};
    const counts = {};
    KEYS.forEach(k => {
      counts[k] = list.filter(p => (p.taggar?.test || []).includes(k)).length;
    });
    const hasKraftprov = list.some(p => p.namn === 'Kraftprov');
    const hasHardnackad = list.some(p => p.namn === 'Hårdnackad');
    const hasSjalastark = list.some(p => p.namn === 'Själastark');

    const strongGift = list.some(
      p =>
        p.namn === 'Stark gåva' &&
        ['Gesäll', 'Mästare'].includes(p.nivå || '')
    );

    const resistCount = list.filter(p => p.namn === 'Motståndskraft').length;
    const sensCount   = list.filter(p => p.namn === 'Korruptionskänslig').length;
    const hasDarkPast = list.some(p => p.namn === 'Mörkt förflutet');

    dom.traits.innerHTML = KEYS.map(k => {
      const val = (data[k] || 0) + (bonus[k] || 0) + (maskBonus[k] || 0);
      const hardy = hasHardnackad && k === 'Stark' ? 1 : 0;
      const talBase = hasKraftprov && k === 'Stark'
        ? val + 5
        : Math.max(10, val);
      // Base pain threshold is derived from Strength and modifiers
      let tal  = talBase;
      let pain = 0;

      let extra = '';
      let beforeExtra = '';
      let afterExtra = `<div class="trait-count">F\u00f6rm\u00e5gor: ${counts[k]}</div>`;
      if (k === 'Stark') {
        let base = val;
        const hasPack = list.some(e => e.namn === 'Pack\u00e5sna');
        if (hasPack) base = Math.ceil(base * 1.5);

        // Apply advantage/disadvantage effects last
        tal  += hardy;
        pain = storeHelper.calcPainThreshold(val, list, effects);

        beforeExtra = `<div class="trait-count">F\u00f6rm\u00e5gor: ${counts[k]}</div>` +
          `<div class="trait-extra">B\u00e4rkapacitet: ${base}</div>`;
        afterExtra = '';
        extra = `<div class="trait-extra">T\u00e5lighet: ${tal} \u2022 Sm\u00e4rtgr\u00e4ns: ${pain}</div>`;
      } else if (k === 'Kvick') {
        const defs = calcDefense(val);
        extra = defs
          .map(d => `<div class="trait-extra">F\u00f6rsvar${d.name ? ' (' + d.name + ')' : ''}: ${d.value}</div>`)
          .join('');
      } else if (k === 'Viljestark') {
        const baseMax   = strongGift ? val * 2 : val;
        const threshBase = strongGift ? val : Math.ceil(val / 2);

        // Apply advantage/disadvantage effects after base calculations
        const maxCor = baseMax + (hasSjalastark ? 1 : 0);
        let   thresh = threshBase + resistCount - sensCount;
        let perm = hasEarth ? (permBase % 2) : permBase;
        if (hasDarkPast) perm += Math.ceil(thresh / 3);
        extra = `<div class="trait-extra">Permanent korruption: ${perm}</div>` +
                `<div class="trait-extra">Maximal korruption: ${maxCor} \u2022 Korruptionstr\u00f6skel: ${thresh}</div>`;
      }
      return `
      <div class="trait" data-key="${k}">
        <div class="trait-name">${k}</div>
        <div class="trait-controls">
          <button class="trait-btn" data-d="-5">\u22125</button>
          <button class="trait-btn" data-d="-1">\u22121</button>
          <div class="trait-value">${val}</div>
          <button class="trait-btn" data-d="1">+1</button>
          <button class="trait-btn" data-d="5">+5</button>
        </div>
        ${beforeExtra}
        ${extra}
        ${afterExtra}
      </div>`;
    }).join('');

    const total = KEYS.reduce((sum,k)=>sum+(data[k]||0)+(bonus[k]||0)+(maskBonus[k]||0),0);

    const lvlMap = { Novis: 1, 'Gesäll': 2, 'Mästare': 3 };
    let maxTot = 80;
    list.forEach(it => {
      if (it.namn === 'Exceptionellt karaktärsdrag') {
        maxTot += lvlMap[it.nivå] || 0;
      }
    });
    const inv = storeHelper.getInventory(store);
    inv.forEach(row => {
      if (row.name === 'Djurmask' && row.trait) maxTot += 1;
    });
    if (dom.traitsTot) dom.traitsTot.textContent = total;
    if (dom.traitsMax) dom.traitsMax.textContent = maxTot;
    const parent = dom.traitsTot.closest('.traits-total');
    if (parent) {
      parent.classList.remove('good','under','over');
      if (total === maxTot) {
        parent.classList.add('good');
      } else if (total < maxTot) {
        parent.classList.add('under');
      } else {
        parent.classList.add('over');
      }
    }

    if (dom.traitStats) {
      dom.traitStats.textContent = "";
    }
  }

  function bindTraits(){
    if(!dom.traits) return;
    dom.traits.addEventListener('click', e => {
      const btn = e.target.closest('.trait-btn');
      if(!btn) return;
      const key = btn.closest('.trait').dataset.key;
      const d   = Number(btn.dataset.d);

      const t   = storeHelper.getTraits(store);
      const bonusEx = window.exceptionSkill ? exceptionSkill.getBonus(key) : 0;
      const bonusMask = window.maskSkill ? maskSkill.getBonus(key) : 0;
      const bonus = bonusEx + bonusMask;
      const min   = bonus;
      const next  = Math.max(0, (t[key] || 0) + d);
      t[key] = Math.max(min - bonus, next);
      storeHelper.setTraits(store, t);
      renderTraits();
    });
  }

  window.renderTraits = renderTraits;
  window.bindTraits = bindTraits;
  window.calcDefense = calcDefense;
})(window);
