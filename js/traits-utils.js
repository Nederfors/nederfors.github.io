(function(window){
  function calcDefense(kvick){
    const inv = storeHelper.getInventory(store);
    const list = storeHelper.getCurrentList(store);
    const rustLvl = storeHelper.abilityLevel(list, 'Rustmästare');

    const PEN = { Novis: 2, 'Gesäll': 3, 'Mästare': 4 };
    const robustPenalty = list
      .filter(x => x.namn === 'Robust')
      .reduce((sum, x) => sum + (PEN[x.nivå] || 0), 0);
    const hamRobustName = storeHelper.HAMNSKIFTE_NAMES['Robust'];
    const hamRobustPenalty = list
      .filter(x => x.namn === hamRobustName)
      .reduce((sum, x) => sum + (PEN[x.nivå] || 0), 0);

    let hasBalancedWeapon = false;
    let hasLongWeapon = false;
    let hasLongStaff = false;
    let hasShield = false;
    let weaponCount = 0;
    inv.forEach(row => {
      const entry = invUtil.getEntry(row.name);
      if (!entry) return;
      const types = entry.taggar?.typ || [];
      if (!types.includes('Vapen') && !types.includes('Sköld')) return;
      weaponCount += 1;
      if (types.includes('Sköld')) hasShield = true;
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
      if (allQ.includes('L\u00e5ngt')) {
        hasLongWeapon = true;
        const lname = (row.name || '').toLowerCase();
        if ([
          'runstav',
          'vandringsstav',
          'tr\u00e4stav'
        ].includes(lname)) {
          hasLongStaff = true;
        }
      }
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

    if (robustPenalty) {
      res.forEach(r => { r.value -= robustPenalty; });
    }

    const twinLvl = storeHelper.abilityLevel(list, 'Tvillingattack');
    if (twinLvl >= 1 && weaponCount >= 2) {
      res.forEach(r => { r.value += 1; });
    }

    if (hasBalancedWeapon) {
      res.forEach(r => { r.value += 1; });
    }

    if (hasShield) {
      res.forEach(r => { r.value += 1; });
      const shieldfightLvl = storeHelper.abilityLevel(list, 'Sköldkamp');
      if (shieldfightLvl >= 1) {
        res.forEach(r => { r.value += 1; });
      }
    }

    const stafffightLvl = storeHelper.abilityLevel(list, 'Stavkamp');
    if (stafffightLvl >= 1) {
      const bonus = hasLongStaff ? 2 : (hasLongWeapon ? 1 : 0);
      if (bonus) res.forEach(r => { r.value += bonus; });
    }

    const mantleLvl = storeHelper.abilityLevel(list, 'Manteldans');
    if (mantleLvl >= 1) {
      res.forEach(r => { r.value += 1; });
    }

    let hamRes = [];
    if (hamRobustPenalty) {
      hamRes = [ { name: hamRobustName, value: kvick - hamRobustPenalty } ];
      if (mantleLvl >= 1) {
        hamRes.forEach(r => { r.value += 1; });
      }
    }

    return res.concat(hamRes);
  }

  function getDefenseTraitName(list) {
    const forced = storeHelper.getDefenseTrait(store);
    if (forced) return forced;

    const ABILITY_TRAITS = [
      { ability: 'Dansande vapen', level: 3, trait: 'Viljestark' },
      { ability: 'Fint', level: 2, trait: 'Diskret' },
      { ability: ['Sjätte Sinne', 'Sjätte sinne'], level: 2, trait: 'Vaksam' },
      { ability: 'Taktiker', level: 2, trait: 'Listig' },
      { ability: 'Pareringsmästare', level: 1, trait: 'Tr\u00e4ffs\u00e4ker' }
    ];

    for (const { ability, level, trait } of ABILITY_TRAITS) {
      const abilities = Array.isArray(ability) ? ability : [ability];
      const highest = abilities.reduce((max, a) => Math.max(max, storeHelper.abilityLevel(list, a)), 0);
      if (highest >= level) {
        return trait;
      }
    }

    return 'Kvick';
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
    const vals = {};
    KEYS.forEach(k => {
      counts[k] = list.filter(p => (p.taggar?.test || []).includes(k)).length;
      vals[k] = (data[k] || 0) + (bonus[k] || 0) + (maskBonus[k] || 0);
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

    const defTrait = getDefenseTraitName(list);
    const defs = calcDefense(vals[defTrait]);

    dom.traits.innerHTML = KEYS.map(k => {
      const val = vals[k];
      const hardy = hasHardnackad && k === 'Stark' ? 1 : 0;
      const talBase = hasKraftprov && k === 'Stark' ? val + 5 : Math.max(10, val);
      let tal  = talBase;
      let pain = 0;
      let extra = '';
      let beforeExtra = '';
      let afterExtra = `<div class="trait-count">Förmågor: ${counts[k]}</div>`;
      if (k === 'Stark') {
        let base = val;
        const hasPack = list.some(e => e.namn === 'Packåsna');
        if (hasPack) base = Math.ceil(base * 1.5);
        tal  += hardy;
        pain = storeHelper.calcPainThreshold(val, list, effects);
        beforeExtra = `<div class="trait-count">Förmågor: ${counts[k]}</div>` + `<div class="trait-extra">Bärkapacitet: ${base}</div>`;
        afterExtra = '';
        extra = `<div class="trait-extra">Tålighet: ${tal} • Smärtgräns: ${pain}</div>`;
      } else if (k === 'Viljestark') {
        const baseMax   = strongGift ? val * 2 : val;
        const threshBase = strongGift ? val : Math.ceil(val / 2);
        const maxCor = baseMax + (hasSjalastark ? 1 : 0);
        let   thresh = threshBase + resistCount - sensCount;
        let perm = hasEarth ? (permBase % 2) : permBase;
        if (hasDarkPast) perm += Math.ceil(thresh / 3);
        extra = `<div class="trait-extra">Permanent korruption: ${perm}</div>` + `<div class="trait-extra">Maximal korruption: ${maxCor} • Korruptionströskel: ${thresh}</div>`;
      }
      if (k === 'Diskret') {
        if (storeHelper.abilityLevel(list, 'Fint') >= 1) {
          extra += '<div class="trait-extra">Kan användas som träffsäker för attacker i närstrid med kort eller precist vapen</div>';
        }
        if (storeHelper.abilityLevel(list, 'Lönnstöt') >= 1) {
          extra += '<div class="trait-extra">Kan användas som träffsäker för attacker med Övertag</div>';
        }
      }
      if (k === 'Listig' && storeHelper.abilityLevel(list, 'Taktiker') >= 3) {
        extra += '<div class="trait-extra">Kan användas som träffsäker för attacker med allt utom tunga vapen</div>';
      }
      if (k === 'Vaksam') {
        const sjatteSinneLvl = Math.max(
          storeHelper.abilityLevel(list, 'Sjätte Sinne'),
          storeHelper.abilityLevel(list, 'Sjätte sinne')
        );
        if (sjatteSinneLvl >= 3) {
          extra += '<div class="trait-extra">Kan användas som träffsäker</div>';
        } else if (sjatteSinneLvl >= 1) {
          extra += '<div class="trait-extra">Kan användas som träffsäker för attacker med avståndsvapen</div>';
        }
      }
      if (k === 'Stark' && storeHelper.abilityLevel(list, 'Järnnäve') >= 1) {
        extra += '<div class="trait-extra">Kan användas som träffsäker för attacker i närstrid</div>';
      }
      if (k === 'Övertygande' && storeHelper.abilityLevel(list, 'Dominera') >= 1) {
        extra += '<div class="trait-extra">Kan användas som träffsäker för attacker i närstrid</div>';
      }
      if (k === defTrait) {
        const defHtml = defs.map(d => `<div class="trait-extra">Försvar${d.name ? ' (' + d.name + ')' : ''}: ${d.value}</div>`).join('');
        extra += defHtml;
      }
      return `
      <div class="trait" data-key="${k}">
        <div class="trait-name">${k}</div>
        <div class="trait-controls">
          <button class="trait-btn" data-d="-5">−5</button>
          <button class="trait-btn" data-d="-1">−1</button>
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
  window.getDefenseTraitName = getDefenseTraitName;
})(window);
