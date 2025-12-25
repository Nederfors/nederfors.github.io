(function(window){
  const STAFF_NAMES = ['runstav', 'vandringsstav', 'tr\u00e4stav'];
  const isBalancedQuality = q => {
    const txt = String(q || '').toLowerCase();
    return txt.startsWith('balanser');
  };

  function flattenInventoryWithPath(arr, prefix = []) {
    return (Array.isArray(arr) ? arr : []).reduce((acc, row, idx) => {
      const path = [...prefix, idx];
      acc.push({ row, path });
      if (Array.isArray(row?.contains)) {
        acc.push(...flattenInventoryWithPath(row.contains, path));
      }
      return acc;
    }, []);
  }

  function getAllQualities(row, entry) {
    if (!row || !entry) return [];
    const tagger = entry.taggar || {};
    const baseQ = [
      ...(tagger.kvalitet || []),
      ...splitQuals(entry.kvalitet)
    ];
    const removed = Array.isArray(row.removedKval) ? row.removedKval : [];
    const extra = Array.isArray(row.kvaliteter) ? row.kvaliteter : [];
    const combined = [
      ...baseQ.filter(q => !removed.includes(q)),
      ...extra
    ];
    return typeof window.enforceArmorQualityExclusion === 'function'
      ? window.enforceArmorQualityExclusion(entry, combined)
      : combined;
  }

  function resolveDefenseSelection(inv, mode = 'standard') {
    const setup = typeof storeHelper.getDefenseSetup === 'function'
      ? storeHelper.getDefenseSetup(store)
      : { enabled: false, armor: null, weapons: [] };
    if (!setup || !setup.enabled) {
      return { enabled: false, armor: null, weapons: [] };
    }
    const flat = flattenInventoryWithPath(inv);
    const byPath = new Map(flat.map(obj => [obj.path.join('.'), obj]));
    const matchItem = (item) => {
      if (!item) return null;
      const pathStr = Array.isArray(item.path) ? item.path.join('.') : '';
      if (pathStr && byPath.has(pathStr)) return byPath.get(pathStr);
      const fallbackId = typeof item.id === 'string' ? item.id : '';
      const fallbackName = typeof item.name === 'string' ? item.name : '';
      if (!fallbackId && !fallbackName) return null;
      return flat.find(obj => {
        if (!obj?.row) return false;
        if (fallbackId && obj.row.id === fallbackId) return true;
        if (fallbackName && obj.row.name === fallbackName) return true;
        return false;
      }) || null;
    };
    const armor = matchItem(setup.armor);
    const weapons = mode === 'dancing'
      ? (setup.dancingWeapon ? [matchItem(setup.dancingWeapon)].filter(Boolean) : [])
      : (Array.isArray(setup.weapons) ? setup.weapons.map(matchItem).filter(Boolean) : []);
    return { enabled: true, armor, weapons };
  }

  function calcDefense(traitValue, opts = {}){
    const mode = opts.mode === 'dancing' ? 'dancing' : 'standard';
    const inv = storeHelper.getInventory(store);
    const list = storeHelper.getCurrentList(store);
    const selection = resolveDefenseSelection(inv, mode);
    const flatInv = flattenInventoryWithPath(inv);
    const nameMap = invUtil.makeNameMap(flatInv.map(f => f.row));
    const baseTraitVal = Number.isFinite(traitValue) ? traitValue : 0;

    if (mode === 'dancing') {
      if (storeHelper.abilityLevel(list, 'Dansande vapen') < 3) {
        return [];
      }
      const weaponItems = Array.isArray(selection.weapons) ? selection.weapons : [];
      const hasBalancedWeapon = weaponItems.some(obj => {
        const entry = invUtil.getEntry(obj?.row?.id || obj?.row?.name);
        if (!entry) return false;
        const quals = getAllQualities(obj.row, entry);
        return quals.some(isBalancedQuality);
      });
      const weaponName = weaponItems.length ? nameMap.get(weaponItems[0].row) : '';
      const value = Math.max(1, baseTraitVal + (hasBalancedWeapon ? 1 : 0));
      return [{ name: weaponName || '', value, source: 'dancing' }];
    }

    const rustLvl = storeHelper.abilityLevel(list, 'Rustmästare');
    const hasSensorySensitive = list.some(p => p.namn === 'Sensoriskt känslig');

    const PEN = { Novis: 2, 'Gesäll': 3, 'Mästare': 4 };
    const robustPenalty = list
      .filter(x => x.namn === 'Robust')
      .reduce((sum, x) => sum + (PEN[x.nivå] || 0), 0);
    const hamRobustName = storeHelper.HAMNSKIFTE_NAMES['Robust'];
    const hamRobustPenalty = list
      .filter(x => x.namn === hamRobustName)
      .reduce((sum, x) => sum + (PEN[x.nivå] || 0), 0);

    const resolvedArmor = selection.enabled && selection.armor ? [selection.armor] : [];
    const resolvedWeapons = mode === 'dancing'
      ? selection.weapons || []
      : (selection.enabled ? selection.weapons : null);

    const armorItems = selection.enabled
      ? (resolvedArmor.length ? resolvedArmor : [])
      : flatInv.filter(obj => {
          const entry = invUtil.getEntry(obj.row.id || obj.row.name);
          return entry && (entry.taggar?.typ || []).includes('Rustning');
        });

    const weaponItems = (resolvedWeapons && Array.isArray(resolvedWeapons))
      ? resolvedWeapons
      : (mode === 'dancing'
          ? []
          : flatInv.filter(obj => {
              const entry = invUtil.getEntry(obj.row.id || obj.row.name);
              const types = entry?.taggar?.typ || [];
              return entry && (types.includes('Vapen') || types.includes('Sköld'));
            }));

    let hasBalancedWeapon = false;
    let hasLongWeapon = false;
    let hasLongStaff = false;
    let hasShield = false;
    const weaponCount = weaponItems.reduce((count, obj) => {
      const entry = invUtil.getEntry(obj.row.id || obj.row.name);
      if (!entry) return count;
      const types = entry.taggar?.typ || [];
      if (!types.includes('Vapen') && !types.includes('Sköld')) return count;
      if (types.includes('Sköld')) hasShield = true;
      const quals = getAllQualities(obj.row, entry);
      if (quals.some(isBalancedQuality)) hasBalancedWeapon = true;
      if (quals.includes('L\u00e5ngt')) {
        hasLongWeapon = true;
        const lname = (obj.row.name || '').toLowerCase();
        if (STAFF_NAMES.includes(lname)) {
          hasLongStaff = true;
        }
      }
      return count + 1;
    }, 0);

    let res = armorItems.reduce((out,obj)=>{
      const row = obj.row;
      const entry = invUtil.getEntry(row.id || row.name);
      if(!entry || !((entry.taggar?.typ||[]).includes('Rustning'))) return out;
      const allQ = getAllQualities(row, entry);
      let limit = entry.stat?.['begränsning'] || 0;
      let stonePen = 0;
      if(allQ.includes('Smidig') || allQ.includes('Smidigt')) limit += 2;
      if(allQ.includes('Otymplig') || allQ.includes('Otympligt')) limit -= 1;
      if(allQ.includes('Stenpansar')) stonePen -= 4;
      if(rustLvl >= 2) limit = 0;
      limit += stonePen;
      const armorPenalty = hasSensorySensitive ? 2 : 0;
      out.push({ name: nameMap.get(row), value: baseTraitVal + limit - armorPenalty });
      return out;
    }, []);

    res = res.length ? res : [ { value: baseTraitVal } ];

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
      hamRes = [ { name: hamRobustName, value: baseTraitVal - hamRobustPenalty } ];
      if (mantleLvl >= 1) {
        hamRes.forEach(r => { r.value += 1; });
      }
    }

    res.forEach(r => { r.value = Math.max(1, r.value); });
    hamRes.forEach(r => { r.value = Math.max(1, r.value); });

    return res.concat(hamRes).map(entry => ({
      ...entry,
      source: mode
    }));
  }

  function getDefenseTraitName(list) {
    const setup = typeof storeHelper.getDefenseSetup === 'function'
      ? storeHelper.getDefenseSetup(store)
      : null;
    if (setup?.enabled && setup.trait) return setup.trait;

    const forced = storeHelper.getDefenseTrait(store);
    if (forced) return forced;

    // Automatiska karaktärsdrag för försvar enligt tabellen "Karaktärsdrag för försvar"
    // (ta13) i data/tabeller. Förutsättningarna om vapen och liknande hanteras inte här,
    // utan valet baseras enbart på uppnådd nivå i respektive förmåga.
    const ABILITY_TRAITS = [
      { ability: 'Fint', level: 2, trait: 'Diskret' },
      { ability: 'Pareringsmästare', level: 1, trait: 'Träffsäker' },
      { ability: ['Sjätte Sinne', 'Sjätte sinne'], level: 2, trait: 'Vaksam' },
      { ability: 'Taktiker', level: 2, trait: 'Listig' },
      { ability: 'Provokatör', level: 2, trait: 'Övertygande' }
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

  function getDancingDefenseTraitName(list) {
    const setup = typeof storeHelper.getDefenseSetup === 'function'
      ? storeHelper.getDefenseSetup(store)
      : null;
    if (setup?.dancingTrait) return setup.dancingTrait;
    if (storeHelper.abilityLevel(list, 'Dansande vapen') >= 3) return 'Viljestark';
    return '';
  }

  function renderTraits(){
    if(!dom.traits) return;
    const data = storeHelper.getTraits(store);
    const KEYS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffs\u00e4ker','Vaksam','Viljestark','\u00d6vertygande'];

    const list  = storeHelper.getCurrentList(store);
    const artifactEffects = storeHelper.getArtifactEffects(store);
    const manualAdjust = storeHelper.getManualAdjustments(store);
    const combinedEffects = {
      xp: (artifactEffects?.xp || 0) + (manualAdjust?.xp || 0),
      corruption: (artifactEffects?.corruption || 0) + (manualAdjust?.corruption || 0)
    };
    const manualToughness = Number(manualAdjust?.toughness || 0);
    const manualPain = Number(manualAdjust?.pain || 0);
    const manualCapacity = Number(manualAdjust?.capacity || 0);
    const permBase = storeHelper.calcPermanentCorruption(list, combinedEffects);
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

    const strongGiftLevel = storeHelper.abilityLevel(list, 'Stark gåva');
    const strongGift = strongGiftLevel >= 1;

    const resistCount = list.filter(p => p.namn === 'Motståndskraft').length;
    const sensCount   = list.filter(p => p.namn === 'Korruptionskänslig').length;

    const valWill = vals['Viljestark'];
    const baseMax   = strongGift ? valWill + 5 : valWill;
    const threshBase = strongGift ? valWill : Math.ceil(valWill / 2);
    const maxCor = baseMax + (hasSjalastark ? 1 : 0);
    let   thresh = threshBase + resistCount - sensCount;
    const darkPerm = storeHelper.calcDarkPastPermanentCorruption(list, thresh);
    const effectsWithDark = {
      xp: combinedEffects.xp || 0,
      corruption: (combinedEffects.corruption || 0) + darkPerm
    };

    const defTrait = getDefenseTraitName(list);
    const defs = calcDefense(vals[defTrait], { mode: 'standard' });
    const dancingTrait = getDancingDefenseTraitName(list);
    const dancingDefs = dancingTrait ? calcDefense(vals[dancingTrait], { mode: 'dancing' }) : [];
    if (dom.defenseCalcBtn) {
      const setup = typeof storeHelper.getDefenseSetup === 'function'
        ? storeHelper.getDefenseSetup(store)
        : null;
      dom.defenseCalcBtn.classList.toggle('active', Boolean(setup?.enabled));
      dom.defenseCalcBtn.setAttribute('aria-pressed', setup?.enabled ? 'true' : 'false');
    }

    dom.traits.innerHTML = KEYS.map(k => {
      const val = vals[k];
      const extras = [];
      const countMarkup = `<button class="trait-count" data-trait="${k}">Förmågor: ${counts[k]}</button>`;

      if (k === 'Stark') {
        const hardy = hasHardnackad ? 1 : 0;
        const base = storeHelper.calcCarryCapacity(val, list);
        const capacity = base + manualCapacity;
        const talBase = hasKraftprov ? val + 5 : Math.max(10, val);
        const tal = talBase + hardy + manualToughness;
        const pain = storeHelper.calcPainThreshold(val, list, effectsWithDark) + manualPain;


        extras.push(`Tålighet: ${tal}`)
        extras.push(` Smärtgräns: ${pain}`);
        extras.push(`Bärkapacitet: ${formatWeight(capacity)}`);
      } else if (k === 'Viljestark') {
        let perm = hasEarth ? (permBase % 2) : permBase;
        perm += darkPerm;
        extras.push(`Styggelsetröskel: ${maxCor}`);
        extras.push(`Korruptionströskel: ${thresh}`);
        extras.push(`Permanent korruption: ${perm}`);
      }

      if (k === 'Diskret') {
        if (storeHelper.abilityLevel(list, 'Fint') >= 1) {
          extras.push('Kan användas som träffsäker för attacker i närstrid med kort eller precist vapen');
        }
        if (storeHelper.abilityLevel(list, 'Lönnstöt') >= 1) {
          extras.push('Kan användas som träffsäker för attacker med Övertag');
        }
      }

      if (k === 'Kvick') {
        if (storeHelper.abilityLevel(list, 'Knivgöra') >= 1) {
          extras.push('Kan användas som träffsäker för attacker med knivliknande vapen med kvaliteten Kort');
        }
        if (storeHelper.abilityLevel(list, 'Koreograferad strid') >= 1) {
          extras.push('Kan användas som träffsäker för närstridsattacker med kort eller balanserat vapen efter en förflyttning');
        }
        if (storeHelper.abilityLevel(list, 'Spjutdans') >= 1) {
          extras.push('Kan användas som träffsäker för närstridsattacker med spjut (kvalitet Långt)');
        }
      }

      if (k === 'Listig' && storeHelper.abilityLevel(list, 'Taktiker') >= 3) {
        extras.push('Kan användas som träffsäker för attacker med allt utom tunga vapen');
      }

      if (k === 'Vaksam') {
        const sjatteSinneLvl = Math.max(
          storeHelper.abilityLevel(list, 'Sjätte Sinne'),
          storeHelper.abilityLevel(list, 'Sjätte sinne')
        );
        if (sjatteSinneLvl >= 1) {
          extras.push('Kan användas som träffsäker för avståndsattacker');
        }
      }

      if (k === 'Stark' && storeHelper.abilityLevel(list, 'Järnnäve') >= 1) {
        extras.push('Kan användas som träffsäker för närstridsattacker');
      }

      if (k === 'Övertygande' && storeHelper.abilityLevel(list, 'Dominera') >= 1) {
        extras.push('Kan användas som träffsäker för närstridsattacker');
      }

      if (k === 'Övertygande' && storeHelper.abilityLevel(list, 'Ledare') >= 1) {
        extras.push('Kan användas istället för Viljestark vid användandet av mystiska förmågor och ritualer');
      }

      if (k === defTrait) {
        defs.forEach(d => {
          extras.push(`Försvar${d.name ? ' (' + d.name + ')' : ''}: ${d.value}`);
        });
      }

      if (k === dancingTrait && dancingDefs.length) {
        dancingDefs.forEach(d => {
          const label = d.name ? `Försvar (Dansande v. ${d.name})` : 'Försvar (Dansande v.)';
          extras.push(`${label}: ${d.value}`);
        });
      }

      const extrasHtml = extras.map(text => `<div class="trait-extra">${text}</div>`).join('');

      return `
      <div class="trait" data-key="${k}">
        <div class="trait-header">
          <div class="trait-label">${k}: ${val}</div>
        </div>
        <div class="trait-controls" role="group" aria-label="Justera ${k}">
          <button class="trait-btn" data-d="-5">−5</button>
          <button class="trait-btn" data-d="-1">−1</button>
          <button class="trait-btn" data-d="1">+1</button>
          <button class="trait-btn" data-d="5">+5</button>
        </div>
        <div class="trait-count-row">
          ${countMarkup}
        </div>
        ${extrasHtml}
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
      if (row.id === 'l9' && row.trait) maxTot += 1;
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
    dom.traits.addEventListener('click', async e => {
      const countBtn = e.target.closest('.trait-count');
      if (countBtn) {
        const trait = countBtn.dataset.trait;
        storeHelper.setOnlySelected(store, true);
        if (trait) {
          let target = 'character.html';
          try {
            const params = new URLSearchParams();
            params.set('test', trait);
            target = `character.html?${params.toString()}`;
          } catch {
            target = `character.html?test=${encodeURIComponent(trait)}`;
          }
          window.location.href = target;
        } else {
          window.location.href = 'character.html';
        }
        return;
      }
      const btn = e.target.closest('.trait-btn');
      if(!btn) return;
      const key = btn.closest('.trait').dataset.key;
      const d   = Number(btn.dataset.d);

      const t   = storeHelper.getTraits(store);
      const bonusEx = window.exceptionSkill ? exceptionSkill.getBonus(key) : 0;
      const bonusMask = window.maskSkill ? maskSkill.getBonus(key) : 0;
      const bonus = bonusEx + bonusMask;
      const min   = bonus;
      const currentVal = t[key] || 0;
      const next  = Math.max(0, currentVal + d);
      const proposed = Math.max(min - bonus, next);

      const isIncrease = d > 0 && proposed > currentVal;
      if (isIncrease) {
        const baseValues = storeHelper.getTraits(store); // basvärden utan bonusar som exceptionellt karaktärsdrag
        const countBaseHigh = vals => Object.values(vals).filter(v => v >= 15).length;
        const currentBaseHigh = countBaseHigh(baseValues);
        const simulated = { ...baseValues, [key]: proposed };
        const simulatedBaseHigh = countBaseHigh(simulated);

        if (simulatedBaseHigh > 1 && simulatedBaseHigh > currentBaseHigh) {
          const confirmMsg = 'Detta skulle göra att mer än ett karaktärsdrag får basvärde 15 eller mer. Vill du fortsätta?';
          const confirmer = window.confirmPopup || window.confirm;
          if (typeof confirmer === 'function') {
            const ok = await confirmer(confirmMsg);
            if (!ok) return;
          }
        }
      }

      const shouldConfirm = d < 0 && proposed < currentVal && proposed < 5;
      if (shouldConfirm) {
        const confirmMsg = 'Detta sänker karaktärsdraget under 5. Vill du fortsätta?';
        const confirmer = window.confirmPopup || window.confirm;
        if (typeof confirmer === 'function') {
          const ok = await confirmer(confirmMsg);
          if (!ok) return;
        }
      }

      t[key] = proposed;
      storeHelper.setTraits(store, t);
      renderTraits();
    });
  }

  window.renderTraits = renderTraits;
  window.bindTraits = bindTraits;
  window.calcDefense = calcDefense;
  window.getDefenseTraitName = getDefenseTraitName;
  window.getDancingDefenseTraitName = getDancingDefenseTraitName;
})(window);
