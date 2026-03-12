(function(window){
  const TRAIT_KEYS = ['Diskret','Kvick','Listig','Stark','Tr\u00e4ffs\u00e4ker','Vaksam','Viljestark','\u00d6vertygande'];
  const hasWeaponType = (types) => {
    if (typeof window.hasWeaponType === 'function') return window.hasWeaponType(types);
    return (Array.isArray(types) ? types : []).some(type => ['Vapen', 'Närstridsvapen', 'Avståndsvapen'].includes(String(type || '').trim()));
  };
  const isRangedWeaponType = (typeName) => {
    if (typeof window.isRangedWeaponType === 'function') return window.isRangedWeaponType(typeName);
    const txt = String(typeName || '').trim();
    return ['Avståndsvapen', 'Armborst', 'Pilbåge', 'Kastvapen', 'Slunga', 'Blåsrör', 'Belägringsvapen', 'Projektilvapen', 'Pil/Lod'].includes(txt);
  };
  const isBalancedQuality = q => {
    const txt = String(q || '').toLowerCase();
    return txt.startsWith('balanser');
  };
  const isArmMountedShieldQuality = q => {
    if (typeof window.lookupEntry === 'function') {
      const entry = window.lookupEntry({ name: q });
      if (entry) return Boolean(entry?.taggar?.arm_fast);
    }
    const txt = String(q || '').toLowerCase();
    return txt.startsWith('armf\u00e4st') || txt.startsWith('armfast') || txt.startsWith('smidig');
  };
  const isTwoHandedWeaponType = typeName => {
    if (typeof window.isTwoHandedWeaponType === 'function') {
      return window.isTwoHandedWeaponType(typeName);
    }
    const txt = String(typeName || '').toLowerCase();
    return txt === 'l\u00e5nga vapen' || txt === 'langa vapen' || txt === 'tvåhandsvapen' || txt === 'tvahandsvapen' || txt === 'tvåhandsvapen';
  };

  function qualityHasWeaponBonusByMal(qualityName, mal, fallbackCheck = null) {
    const qualityEntry = typeof window.lookupEntry === 'function'
      ? window.lookupEntry({ name: qualityName })
      : null;
    if (!qualityEntry) {
      return typeof fallbackCheck === 'function' ? Boolean(fallbackCheck(qualityName)) : false;
    }
    if (typeof window.rulesHelper?.sumVapenBonusByMal === 'function') {
      return (window.rulesHelper.sumVapenBonusByMal([qualityEntry], mal, {}) || 0) > 0;
    }
    if (mal === 'forsvar_modifierare') {
      return (window.rulesHelper?.sumVapenBonus?.([qualityEntry], {}) || 0) > 0;
    }
    return typeof fallbackCheck === 'function' ? Boolean(fallbackCheck(qualityName)) : false;
  }

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

  function getCurrentTraitValues(list = null, inv = null) {
    const currentList = Array.isArray(list) ? list : storeHelper.getCurrentList(store);
    const inventory = Array.isArray(inv) ? inv : storeHelper.getInventory(store);
    const data = storeHelper.getTraits(store);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(currentList) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(inventory) : {};
    const vals = {};
    TRAIT_KEYS.forEach(key => {
      vals[key] = (data[key] || 0) + (bonus[key] || 0) + (maskBonus[key] || 0);
    });
    return vals;
  }

  function getAutomaticDefenseTraitCandidates(list, context = {}) {
    const candidates = ['Kvick'];
    if (typeof window.rulesHelper?.getDefenseTraitRuleCandidates === 'function') {
      candidates.push(...window.rulesHelper.getDefenseTraitRuleCandidates(list, context));
    }
    return [...new Set(candidates)];
  }

  function getAutomaticDancingDefenseTraitCandidates(list, context = {}) {
    if (typeof window.rulesHelper?.getDancingDefenseTraitRuleCandidates !== 'function') return [];
    return [...new Set(window.rulesHelper.getDancingDefenseTraitRuleCandidates(list, context) || [])];
  }

  function getAutomaticAttackTraitCandidates(list, context = {}) {
    const candidates = ['Tr\u00e4ffs\u00e4ker'];
    if (typeof window.rulesHelper?.getAttackTraitRuleCandidates === 'function') {
      candidates.push(...window.rulesHelper.getAttackTraitRuleCandidates(list, context));
    }
    return [...new Set(candidates)];
  }

  function getAttackTraitRuleNotes(list) {
    return typeof window.rulesHelper?.getAttackTraitRuleNotes === 'function'
      ? window.rulesHelper.getAttackTraitRuleNotes(list)
      : [];
  }

  function pickBestTrait(candidates, traitValues, fallbackTrait) {
    const baseTrait = typeof fallbackTrait === 'string' && fallbackTrait.trim()
      ? fallbackTrait.trim()
      : 'Kvick';
    let bestTrait = baseTrait;
    let bestValue = Number.NEGATIVE_INFINITY;
    (Array.isArray(candidates) ? candidates : []).forEach((trait, index) => {
      const value = Number(traitValues?.[trait] || 0);
      if (value > bestValue) {
        bestTrait = trait;
        bestValue = value;
        return;
      }
      if (value === bestValue && bestTrait === baseTrait && trait !== baseTrait && index > 0) {
        bestTrait = trait;
      }
    });
    return bestTrait;
  }

  function pickBestDefenseTrait(candidates, traitValues) {
    return pickBestTrait(candidates, traitValues, 'Kvick');
  }

  function findInventoryItemByDefenseRef(inv, item) {
    if (!item) return null;
    const flat = flattenInventoryWithPath(inv);
    const byPath = new Map(flat.map(obj => [obj.path.join('.'), obj]));
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
  }

  function toDefenseRef(obj) {
    if (!obj?.row) return null;
    return {
      path: Array.isArray(obj.path) ? [...obj.path] : [],
      id: obj.row.id,
      name: obj.row.name || ''
    };
  }

  function buildPathKey(path) {
    return Array.isArray(path) ? path.join('.') : '';
  }

  function buildArmorInfos(inv) {
    const flat = flattenInventoryWithPath(inv);
    const nameMap = invUtil.makeNameMap(flat.map(f => f.row));
    return flat.map(obj => {
      const entry = invUtil.getEntry(obj.row.id || obj.row.name);
      const types = entry?.taggar?.typ || [];
      if (!entry || !types.includes('Rustning')) return null;
      return {
        ...obj,
        entry,
        name: nameMap.get(obj.row) || obj.row?.name || entry?.namn || 'Rustning',
        types,
        qualities: getAllQualities(obj.row, entry)
      };
    }).filter(Boolean);
  }

  function buildWeaponInfos(inv) {
    const flat = flattenInventoryWithPath(inv);
    const nameMap = invUtil.makeNameMap(flat.map(f => f.row));
    return flat.map(obj => {
      const entry = invUtil.getEntry(obj.row.id || obj.row.name);
      const types = entry?.taggar?.typ || [];
      if (!entry || (!hasWeaponType(types) && !types.includes('Sköld'))) return null;
      const qualities = getAllQualities(obj.row, entry);
      return {
        ...obj,
        entry,
        name: nameMap.get(obj.row) || obj.row?.name || entry?.namn || 'Vapen',
        types,
        qualities,
        isShield: types.includes('Sköld'),
        isArmMountedShield: types.includes('Sköld') && qualities.some(isArmMountedShieldQuality),
        isTwoHandedWeapon: !types.includes('Sköld') && types.some(isTwoHandedWeaponType),
        isBalanced: qualities.some(q => qualityHasWeaponBonusByMal(
          q,
          'forsvar_modifierare',
          isBalancedQuality
        )),
        hasLongWeapon: qualities.includes('L\u00e5ngt'),
        hasLongStaff: types.includes('Stav')
      };
    }).filter(Boolean);
  }

  function getHighestDefenseValue(entries) {
    return (Array.isArray(entries) ? entries : []).reduce((max, entry) => {
      const value = Number(entry?.value);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, Number.NEGATIVE_INFINITY);
  }

  function toWeaponFact(info) {
    if (!info) return null;
    return {
      path: Array.isArray(info.path) ? [...info.path] : [],
      id: info.row?.id,
      name: info.row?.name || info.entry?.namn || info.name || '',
      entryRef: info.entry || null,
      types: Array.isArray(info.types) ? [...info.types] : [],
      qualities: Array.isArray(info.qualities) ? [...info.qualities] : []
    };
  }

  function toArmorContext(armorInfo) {
    if (!armorInfo?.entry) return { utrustadTyper: [], utrustadeKvaliteter: [] };
    const qualities = Array.isArray(armorInfo.qualities)
      ? armorInfo.qualities
      : getAllQualities(armorInfo.row, armorInfo.entry);
    return {
      utrustadTyper: Array.isArray(armorInfo.types) ? armorInfo.types : (armorInfo.entry.taggar?.typ || []),
      utrustadeKvaliteter: qualities
    };
  }

  function normalizeSelectedWeapons(list, weaponInfos, preferredPath = '') {
    const infos = Array.isArray(weaponInfos) ? weaponInfos.filter(Boolean) : [];
    if (!infos.length) return [];
    if (typeof window.rulesHelper?.normalizeDefenseLoadout !== 'function') return infos;
    const facts = infos.map(info => {
      const fact = toWeaponFact(info);
      return fact ? { ...fact, __source: info } : null;
    }).filter(Boolean);
    const normalized = window.rulesHelper.normalizeDefenseLoadout(list, facts, preferredPath);
    return (Array.isArray(normalized) ? normalized : [])
      .map(fact => fact?.__source)
      .filter(Boolean);
  }

  function getWeaponSelectionValidation(list, weaponInfos) {
    const facts = (Array.isArray(weaponInfos) ? weaponInfos : [])
      .map(info => toWeaponFact(info))
      .filter(Boolean);
    if (typeof window.rulesHelper?.validateDefenseLoadout === 'function') {
      return window.rulesHelper.validateDefenseLoadout(list, facts);
    }
    return { valid: true, reasons: [] };
  }

  function getArmorRestrictionValue(list, armorInfo) {
    if (!armorInfo?.entry) return 0;
    const qualities = Array.isArray(armorInfo.qualities)
      ? armorInfo.qualities
      : getAllQualities(armorInfo.row, armorInfo.entry);
    let limit = Number(armorInfo.entry.stat?.['begränsning'] || 0);
    limit += window.rulesHelper?.getArmorRestrictionBonus?.(qualities) || 0;
    if (window.rulesHelper?.hasArmorRestrictionReset?.(list)) limit = 0;
    limit += window.rulesHelper?.getArmorRestrictionBonusFast?.(qualities) || 0;
    return limit;
  }

  function getDefenseModifierForSetup(list, weaponInfos, armorInfo = null) {
    const selectedWeapons = normalizeSelectedWeapons(list, weaponInfos);
    const weaponFacts = selectedWeapons.map(info => toWeaponFact(info)).filter(Boolean);
    const armorContext = toArmorContext(armorInfo);
    if (typeof window.rulesHelper?.getEquippedDefenseModifier === 'function') {
      return window.rulesHelper.getEquippedDefenseModifier(list, weaponFacts, armorContext) || 0;
    }
    return window.rulesHelper?.getDefenseValueModifier?.(list) || 0;
  }

  function computeDancingDefenseEntries(baseTraitVal, list, _inv, weaponItems) {
    const selected = normalizeSelectedWeapons(list, (Array.isArray(weaponItems) ? weaponItems : []).slice(0, 1));
    const modifier = getDefenseModifierForSetup(list, selected, null);
    const value = Math.max(1, Number(baseTraitVal || 0) + Number(modifier || 0));
    return [{ name: selected[0]?.name || '', value, source: 'dancing' }];
  }

  // weaponsBySourceId: { [sourceEntryId]: weaponInfo[] } — per-rule weapon selection.
  // Falls back to empty (fully isolated) for rules with no entry in the map.
  function computeSeparateDefenseEntries(stdTraitName, list, traitValues, weaponsBySourceId) {
    const rules = window.rulesHelper?.getSeparateDefenseTraitRules?.(list) || [];
    if (!rules.length) return [];
    const byId = weaponsBySourceId && typeof weaponsBySourceId === 'object' ? weaponsBySourceId : {};
    return rules.map(rule => {
      const trait = String(rule.varde || stdTraitName || 'Kvick');
      const baseVal = Number(traitValues?.[trait] || 0);
      const mod = Number(rule.modifierare || 0);
      const ruleWeapons = Array.isArray(byId[rule.sourceEntryId]) ? byId[rule.sourceEntryId] : [];
      const weaponFacts = ruleWeapons.map(info => toWeaponFact(info)).filter(Boolean);
      const bonus = typeof window.rulesHelper?.getSelectiveDefenseModifier === 'function'
        ? window.rulesHelper.getSelectiveDefenseModifier(list, weaponFacts, { utrustadTyper: [], utrustadeKvaliteter: [] }, rule.tillat)
        : 0;
      return {
        name: String(rule.sourceEntryName || ''),
        value: Math.max(1, baseVal + mod + bonus),
        trait,
        source: 'separate'
      };
    });
  }

  function computeStandardDefenseEntries(baseTraitVal, list, _inv, armorItems, weaponItems) {
    const selectedWeapons = normalizeSelectedWeapons(list, weaponItems || []);
    const armorInfos = (Array.isArray(armorItems) && armorItems.length) ? armorItems : [null];
    let res = armorInfos.map(armorInfo => {
      const limit = getArmorRestrictionValue(list, armorInfo);
      const modifier = getDefenseModifierForSetup(list, selectedWeapons, armorInfo);
      return {
        name: armorInfo?.name || '',
        value: Math.max(1, Number(baseTraitVal || 0) + Number(limit || 0) + Number(modifier || 0))
      };
    });

    return res.map(entry => ({
      ...entry,
      source: 'standard'
    }));
  }

  function getStableDefenseOrderKey(entry) {
    const trait = String(entry?.trait || '').trim();
    const armorKey = buildPathKey(entry?.armor?.path || []);
    const weaponKeys = (Array.isArray(entry?.weapons) ? entry.weapons : [])
      .map(item => buildPathKey(item?.path || []))
      .sort()
      .join('|');
    const danceTrait = String(entry?.dancingTrait || '').trim();
    const danceWeapon = buildPathKey(entry?.dancingWeapon?.path || []);
    return `${trait}|${armorKey}|${weaponKeys}|${danceTrait}|${danceWeapon}`;
  }

  function isBetterDefenseCandidate(next, best) {
    if (!best) return true;
    if (next.value !== best.value) return next.value > best.value;
    if (next.itemCount !== best.itemCount) return next.itemCount < best.itemCount;
    // Prefer more weapons when tied — allows Tvillingattack setups to beat shield-alone
    const nextWeapons = Array.isArray(next.weapons) ? next.weapons.length : 0;
    const bestWeapons = Array.isArray(best.weapons) ? best.weapons.length : 0;
    if (nextWeapons !== bestWeapons) return nextWeapons > bestWeapons;
    return String(next.orderKey || '') < String(best.orderKey || '');
  }

  function generateLegalWeaponSelections(list, weaponInfos) {
    const infos = (Array.isArray(weaponInfos) ? weaponInfos : [])
      .filter(Boolean)
      .slice()
      .sort((a, b) => buildPathKey(a.path).localeCompare(buildPathKey(b.path), 'sv'));
    const out = [[]];
    const seen = new Set(['']);
    const addCandidate = (candidate) => {
      const current = Array.isArray(candidate) ? candidate.filter(Boolean) : [];
      const paths = current.map(info => buildPathKey(info.path)).sort();
      const key = paths.join('|');
      if (seen.has(key)) return;
      if (!getWeaponSelectionValidation(list, current).valid) return;
      seen.add(key);
      out.push(current);
    };

    infos.forEach((_, i) => addCandidate([infos[i]]));
    infos.forEach((_, i) => {
      for (let j = i + 1; j < infos.length; j += 1) addCandidate([infos[i], infos[j]]);
    });
    infos.forEach((_, i) => {
      for (let j = i + 1; j < infos.length; j += 1) {
        for (let k = j + 1; k < infos.length; k += 1) {
          addCandidate([infos[i], infos[j], infos[k]]);
        }
      }
    });
    return out;
  }

  function optimizeStandardDefenseSetup(inv, list, traitValues) {
    const weaponInfos = buildWeaponInfos(inv);
    const armorInfos = [null, ...buildArmorInfos(inv)];
    const weaponSelections = generateLegalWeaponSelections(list, weaponInfos);
    let bestWithArmor = null;
    let bestWithoutArmor = null;

    armorInfos.forEach(armorInfo => {
      const armorContext = toArmorContext(armorInfo);
      weaponSelections.forEach(selection => {
        const selected = normalizeSelectedWeapons(list, selection);
        const weaponFacts = selected.map(info => toWeaponFact(info)).filter(Boolean);
        const defenseContext = {
          list,
          vapenFakta: weaponFacts.map(f => ({ typer: f.types, kvaliteter: f.qualities })),
          antalVapen: weaponFacts.filter(f => hasWeaponType(f.types || [])).length,
          utrustadTyper: armorContext.utrustadTyper,
          utrustadeKvaliteter: armorContext.utrustadeKvaliteter
        };
        const trait = pickBestDefenseTrait(getAutomaticDefenseTraitCandidates(list, defenseContext), traitValues);
        const traitValue = Number(traitValues?.[trait] || 0);
        const entries = computeStandardDefenseEntries(traitValue, list, inv, armorInfo ? [armorInfo] : [], selected);
        const value = getHighestDefenseValue(entries);
        const candidate = {
          trait,
          armor: armorInfo ? toDefenseRef(armorInfo) : null,
          weapons: selected.map(toDefenseRef).filter(Boolean),
          value: Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY,
          itemCount: selected.length + (armorInfo ? 1 : 0)
        };
        candidate.orderKey = getStableDefenseOrderKey(candidate);
        // Track armored and unarmed best separately — armor is always preferred when available
        if (armorInfo) {
          if (isBetterDefenseCandidate(candidate, bestWithArmor)) bestWithArmor = candidate;
        } else {
          if (isBetterDefenseCandidate(candidate, bestWithoutArmor)) bestWithoutArmor = candidate;
        }
      });
    });

    return bestWithArmor || bestWithoutArmor || {
      trait: 'Kvick',
      armor: null,
      weapons: [],
      value: Number.NEGATIVE_INFINITY,
      itemCount: 0,
      orderKey: ''
    };
  }

  function optimizeDancingDefenseSetup(inv, list, traitValues) {
    const weapons = buildWeaponInfos(inv);
    const candidates = [null, ...weapons];
    let best = null;

    candidates.forEach(weaponInfo => {
      const selected = normalizeSelectedWeapons(list, weaponInfo ? [weaponInfo] : []);
      const weaponFacts = selected.map(info => toWeaponFact(info)).filter(Boolean);
      const context = {
        list,
        vapenFakta: weaponFacts.map(f => ({ typer: f.types, kvaliteter: f.qualities })),
        antalVapen: weaponFacts.filter(f => hasWeaponType(f.types || [])).length
      };
      const dancingTraits = getAutomaticDancingDefenseTraitCandidates(list, context);
      if (!dancingTraits.length) return;
      const trait = pickBestTrait(dancingTraits, traitValues, dancingTraits[0]);
      const traitValue = Number(traitValues?.[trait] || 0);
      const entries = computeDancingDefenseEntries(traitValue, list, inv, selected);
      const value = getHighestDefenseValue(entries);
      const candidate = {
        dancingTrait: trait,
        dancingWeapon: selected[0] ? toDefenseRef(selected[0]) : null,
        value: Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY,
        itemCount: selected.length
      };
      candidate.orderKey = getStableDefenseOrderKey(candidate);
      if (isBetterDefenseCandidate(candidate, best)) best = candidate;
    });

    return best || { dancingTrait: '', dancingWeapon: null, value: Number.NEGATIVE_INFINITY, itemCount: 0, orderKey: '' };
  }

  // Generates weapon combinations up to maxCount from an array of weapon infos.
  // Returns an array of arrays (each sub-array is a combination).
  function generateWeaponCombinationsForRule(weapons, maxCount) {
    if (!weapons.length || maxCount < 1) return [];
    const result = weapons.map(w => [w]);
    if (maxCount >= 2) {
      for (let i = 0; i < weapons.length; i++) {
        for (let j = i + 1; j < weapons.length; j++) {
          result.push([weapons[i], weapons[j]]);
        }
      }
    }
    return result;
  }

  // For each separate defense rule that allows weapon selection, finds the best weapon(s).
  // Returns { [sourceEntryId]: weaponRef[] }
  function optimizeSeparateDefenseSetups(inv, list, traitValues) {
    const rules = (window.rulesHelper?.getSeparateDefenseTraitRules?.(list) || [])
      .filter(r => r.tillat?.vapen_typer || r.tillat?.vapen_kvaliteter || r.tillat?.sköld);
    if (!rules.length) return {};
    const allWeaponInfos = buildWeaponInfos(inv);
    const result = {};
    rules.forEach(rule => {
      const tl = rule.tillat || {};
      const maxWeapons = Math.max(1, Number(tl.antal_vapen || 1));
      const candidates = allWeaponInfos.filter(info => !info.isShield || Boolean(tl.sköld));
      const trait = String(rule.varde || 'Kvick');
      const baseVal = Number(traitValues?.[trait] || 0);
      const mod = Number(rule.modifierare || 0);
      let best = { weaponRefs: [], value: Math.max(1, baseVal + mod) };
      generateWeaponCombinationsForRule(candidates, maxWeapons).forEach(combo => {
        const facts = combo.map(info => toWeaponFact(info)).filter(Boolean);
        const bonus = window.rulesHelper?.getSelectiveDefenseModifier?.(list, facts, { utrustadTyper: [], utrustadeKvaliteter: [] }, rule.tillat) || 0;
        const value = Math.max(1, baseVal + mod + bonus);
        if (value > best.value) best = { weaponRefs: combo.map(toDefenseRef).filter(Boolean), value };
      });
      result[rule.sourceEntryId] = best.weaponRefs;
    });
    return result;
  }

  function getAutoDefenseSetup(options = {}) {
    const inv = Array.isArray(options.inv) ? options.inv : storeHelper.getInventory(store);
    const list = Array.isArray(options.list) ? options.list : storeHelper.getCurrentList(store);
    const traitValues = options.traitValues || getCurrentTraitValues(list, inv);
    const standardBest = optimizeStandardDefenseSetup(inv, list, traitValues);
    const dancingBest = optimizeDancingDefenseSetup(inv, list, traitValues);
    const separateWeapons = optimizeSeparateDefenseSetups(inv, list, traitValues);
    return {
      enabled: false,
      trait: standardBest?.trait || '',
      armor: standardBest?.armor || null,
      weapons: standardBest?.weapons || [],
      dancingTrait: dancingBest?.dancingTrait || '',
      dancingWeapon: dancingBest?.dancingWeapon || null,
      separateWeapons
    };
  }

  function resolveDefenseSelection(inv, mode = 'standard', opts = {}) {
    const list = Array.isArray(opts.list) ? opts.list : storeHelper.getCurrentList(store);
    const weaponInfos = buildWeaponInfos(inv);
    const armorInfos = buildArmorInfos(inv);
    const weaponByPath = new Map(weaponInfos.map(info => [buildPathKey(info.path), info]));
    const armorByPath = new Map(armorInfos.map(info => [buildPathKey(info.path), info]));
    const resolveFromRef = (ref, map, fallbackInfos) => {
      if (!ref) return null;
      const key = buildPathKey(ref.path || []);
      if (key && map.has(key)) return map.get(key);
      const fallbackId = typeof ref.id === 'string' ? ref.id : '';
      const fallbackName = typeof ref.name === 'string' ? ref.name : '';
      return (Array.isArray(fallbackInfos) ? fallbackInfos : []).find(info => {
        if (!info?.row) return false;
        if (fallbackId && info.row.id === fallbackId) return true;
        if (fallbackName && (info.row.name === fallbackName || info.entry?.namn === fallbackName)) return true;
        return false;
      }) || null;
    };

    const setup = Object.prototype.hasOwnProperty.call(opts, 'setupOverride')
      ? (opts.setupOverride || null)
      : (typeof storeHelper.getDefenseSetup === 'function'
          ? storeHelper.getDefenseSetup(store)
          : { enabled: false, armor: null, weapons: [], dancingTrait: '', dancingWeapon: null });
    if (setup?.enabled) {
      const armor = resolveFromRef(setup.armor, armorByPath, armorInfos);
      const selectedWeapons = mode === 'dancing'
        ? (setup.dancingWeapon ? [resolveFromRef(setup.dancingWeapon, weaponByPath, weaponInfos)].filter(Boolean) : [])
        : (Array.isArray(setup.weapons) ? setup.weapons.map(item => resolveFromRef(item, weaponByPath, weaponInfos)).filter(Boolean) : []);
      const weapons = normalizeSelectedWeapons(list, selectedWeapons);
      return { enabled: true, armor, weapons };
    }

    const autoSetup = getAutoDefenseSetup({
      inv,
      list,
      traitValues: opts.traitValues
    });
    return {
      enabled: false,
      armor: resolveFromRef(autoSetup.armor, armorByPath, armorInfos),
      weapons: mode === 'dancing'
        ? (autoSetup.dancingWeapon ? [resolveFromRef(autoSetup.dancingWeapon, weaponByPath, weaponInfos)].filter(Boolean) : [])
        : (autoSetup.weapons || []).map(item => resolveFromRef(item, weaponByPath, weaponInfos)).filter(Boolean)
    };
  }

  function calcDefense(traitValue, opts = {}){
    const mode = opts.mode === 'dancing' ? 'dancing' : 'standard';
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const list = Array.isArray(opts.list) ? opts.list : storeHelper.getCurrentList(store);
    const baseTraitVal = Number.isFinite(traitValue) ? traitValue : 0;
    const resolveOpts = { list, traitValues: opts.traitValues };
    if ('setupOverride' in opts) {
      resolveOpts.setupOverride = opts.setupOverride;
    }
    const selection = resolveDefenseSelection(inv, mode, resolveOpts);
    if (mode === 'dancing') {
      return computeDancingDefenseEntries(baseTraitVal, list, inv, selection.weapons || []);
    }
    const armorItems = selection.armor ? [selection.armor] : [];
    return computeStandardDefenseEntries(baseTraitVal, list, inv, armorItems, selection.weapons || []);
  }

  function calcSeparateDefense(stdTraitName, traitValues, opts = {}) {
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const list = Array.isArray(opts.list) ? opts.list : storeHelper.getCurrentList(store);
    const setup = ('setupOverride' in opts)
      ? (opts.setupOverride || null)
      : (typeof storeHelper.getDefenseSetup === 'function' ? storeHelper.getDefenseSetup(store) : null);
    const storedMap = setup?.enabled
      ? (setup.separateWeapons || {})
      : (getAutoDefenseSetup({ inv, list, traitValues }).separateWeapons || {});
    // Resolve stored weapon refs to weaponInfo arrays (supports both single ref and array)
    const weaponInfos = buildWeaponInfos(inv);
    const weaponByPath = new Map(weaponInfos.map(info => [buildPathKey(info.path), info]));
    const weaponsBySourceId = {};
    Object.entries(storedMap).forEach(([id, refs]) => {
      const refArray = Array.isArray(refs) ? refs : (refs ? [refs] : []);
      const infos = refArray.map(ref => {
        if (!ref) return null;
        const key = buildPathKey(ref.path || []);
        return (key && weaponByPath.get(key))
          || weaponInfos.find(i => (typeof ref.id === 'string' && ref.id && i.row?.id === ref.id)
            || (typeof ref.name === 'string' && ref.name && i.entry?.namn === ref.name));
      }).filter(Boolean);
      if (infos.length) weaponsBySourceId[id] = infos;
    });
    return computeSeparateDefenseEntries(stdTraitName, list, traitValues, weaponsBySourceId);
  }

  function getDefenseTraitName(list, traitValues = null, opts = {}) {
    const setup = Object.prototype.hasOwnProperty.call(opts, 'setup')
      ? (opts.setup || null)
      : (typeof storeHelper.getDefenseSetup === 'function' ? storeHelper.getDefenseSetup(store) : null);
    if (setup?.enabled && setup.trait) return setup.trait;

    const forced = storeHelper.getDefenseTrait(store);
    if (forced) return forced;
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const vals = traitValues || getCurrentTraitValues(list, inv);
    const autoSetup = getAutoDefenseSetup({ list, inv, traitValues: vals });
    if (autoSetup?.trait) return autoSetup.trait;
    return pickBestDefenseTrait(getAutomaticDefenseTraitCandidates(list), vals);
  }

  function getDancingDefenseTraitName(list, traitValues = null, opts = {}) {
    const setup = Object.prototype.hasOwnProperty.call(opts, 'setup')
      ? (opts.setup || null)
      : (typeof storeHelper.getDefenseSetup === 'function' ? storeHelper.getDefenseSetup(store) : null);
    if (setup?.enabled && setup.dancingTrait) return setup.dancingTrait;
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const vals = traitValues || getCurrentTraitValues(list, inv);
    const autoSetup = getAutoDefenseSetup({ list, inv, traitValues: vals });
    return autoSetup?.dancingTrait || '';
  }

  function getDefensePreview(opts = {}) {
    const list = Array.isArray(opts.list) ? opts.list : storeHelper.getCurrentList(store);
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const traitValues = opts.traitValues || getCurrentTraitValues(list, inv);
    const setup = Object.prototype.hasOwnProperty.call(opts, 'setup')
      ? (opts.setup || null)
      : (typeof storeHelper.getDefenseSetup === 'function' ? storeHelper.getDefenseSetup(store) : null);
    const standardTrait = getDefenseTraitName(list, traitValues, { setup, inv });
    const standardEntries = calcDefense(Number(traitValues?.[standardTrait] || 0), {
      mode: 'standard',
      list,
      inv,
      traitValues,
      setupOverride: setup
    });
    const dancingTrait = getDancingDefenseTraitName(list, traitValues, { setup, inv });
    const dancingEntries = dancingTrait ? calcDefense(Number(traitValues?.[dancingTrait] || 0), {
      mode: 'dancing',
      list,
      inv,
      traitValues,
      setupOverride: setup
    }) : [];
    const separateEntries = calcSeparateDefense(standardTrait, traitValues, { list, inv, setupOverride: setup });
    return {
      standardTrait,
      standardEntries,
      standardValue: getHighestDefenseValue(standardEntries),
      dancingTrait,
      dancingEntries,
      dancingValue: getHighestDefenseValue(dancingEntries),
      separateEntries,
      separateValue: getHighestDefenseValue(separateEntries)
    };
  }

  function buildAttackWeaponInfos(inv) {
    const flatInv = flattenInventoryWithPath(inv);
    const nameMap = invUtil.makeNameMap(flatInv.map(f => f.row));
    const byPath = new Set();
    const out = [];
    flatInv.forEach(obj => {
      const pathKey = Array.isArray(obj.path) ? obj.path.join('.') : '';
      if (pathKey && byPath.has(pathKey)) return;
      const entry = invUtil.getEntry(obj.row.id || obj.row.name);
      const types = entry?.taggar?.typ || [];
      if (!entry || !hasWeaponType(types)) return;
      if (pathKey) byPath.add(pathKey);
      out.push({
        ...obj,
        entry,
        types,
        qualities: getAllQualities(obj.row, entry),
        name: nameMap.get(obj.row) || obj.row?.name || entry?.namn || ''
      });
    });
    return out;
  }

  function isRangedWeapon(types) {
    const list = Array.isArray(types) ? types : [];
    return list.some(type => isRangedWeaponType(type));
  }

  function getAttackTraitNameForWeapon(list, weaponInfo, traitValues) {
    const types = Array.isArray(weaponInfo?.types) ? weaponInfo.types : [];
    const qualities = Array.isArray(weaponInfo?.qualities) ? weaponInfo.qualities : [];
    const ranged = isRangedWeapon(types);
    const context = {
      avstand: ranged,
      narstrid: !ranged,
      foremal: {
        typ: types,
        kvalitet: qualities
      }
    };
    const candidates = getAutomaticAttackTraitCandidates(list, context);
    return pickBestTrait(candidates, traitValues, 'Tr\u00e4ffs\u00e4ker');
  }

  function calcAccuracy(opts = {}) {
    const list = Array.isArray(opts.list) ? opts.list : storeHelper.getCurrentList(store);
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const traitValues = opts.traitValues || getCurrentTraitValues(list, inv);
    const weapons = buildAttackWeaponInfos(inv);
    if (!weapons.length) {
      const baseValue = Number(traitValues?.['Tr\u00e4ffs\u00e4ker'] || 0);
      return [{
        name: '',
        value: Math.max(1, baseValue),
        trait: 'Tr\u00e4ffs\u00e4ker',
        source: 'base'
      }];
    }

    return weapons.map(info => {
      const types = Array.isArray(info.types) ? info.types : [];
      const qualities = Array.isArray(info.qualities) ? info.qualities : [];
      const ranged = isRangedWeapon(types);
      const weaponContext = {
        vapenFakta: [{ typer: types, kvaliteter: qualities }],
        antalVapen: 1
      };
      const trait = getAttackTraitNameForWeapon(list, info, traitValues);
      const traitValue = Number(traitValues?.[trait] || 0);
      const entryBonus = window.rulesHelper?.getEquippedWeaponEntryAttackBonus?.([{
        entryRef: info.entry,
        types,
        qualities
      }]) || 0;
      const abilityBonus = window.rulesHelper?.getWeaponAttackBonus?.(list, weaponContext) || 0;
      const qualityBonus = window.rulesHelper?.getEquippedQualityAttackBonus?.(qualities, weaponContext) || 0;
      return {
        name: info.name || '',
        value: Math.max(1, traitValue + entryBonus + abilityBonus + qualityBonus),
        trait,
        source: ranged ? 'ranged' : 'melee'
      };
    });
  }

  function getAccuracyPreview(opts = {}) {
    const list = Array.isArray(opts.list) ? opts.list : storeHelper.getCurrentList(store);
    const inv = Array.isArray(opts.inv) ? opts.inv : storeHelper.getInventory(store);
    const traitValues = opts.traitValues || getCurrentTraitValues(list, inv);
    const entries = calcAccuracy({ list, inv, traitValues });
    return {
      entries,
      value: getHighestDefenseValue(entries)
    };
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
    const artifactToughness = Number(artifactEffects?.toughness || 0);
    const artifactPain = Number(artifactEffects?.pain || 0);
    const artifactCapacity = Number(artifactEffects?.capacity || 0);
    const manualToughness = Number(manualAdjust?.toughness || 0);
    const manualPain = Number(manualAdjust?.pain || 0);
    const manualCapacity = Number(manualAdjust?.capacity || 0);
    const bonus = window.exceptionSkill ? exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? maskSkill.getBonuses(storeHelper.getInventory(store)) : {};
    const counts = {};
    const vals = {};
    KEYS.forEach(k => {
      counts[k] = list.filter(p => {
        const tests = typeof window.getEntryTestTags === 'function'
          ? window.getEntryTestTags(p, { level: p?.nivå })
          : (Array.isArray(p?.taggar?.nivå_data?.Enkel?.test)
            ? p.taggar.nivå_data.Enkel.test
            : (Array.isArray(p?.taggar?.niva_data?.Enkel?.test)
              ? p.taggar.niva_data.Enkel.test
              : (p?.taggar?.test || [])));
        return tests.includes(k);
      }).length;
      vals[k] = (data[k] || 0) + (bonus[k] || 0) + (maskBonus[k] || 0);
    });
    const valWill = vals['Viljestark'];
    const corruptionStats = storeHelper.calcCorruptionTrackStats(list, valWill);
    const maxCor = corruptionStats.styggelsetroskel;
    const thresh = corruptionStats.korruptionstroskel;
    const effectsWithDark = {
      ...combinedEffects,
      korruptionstroskel: thresh
    };
    const permBase = storeHelper.calcPermanentCorruption(list, effectsWithDark);

    const defTrait = getDefenseTraitName(list, vals);
    const defs = calcDefense(vals[defTrait], { mode: 'standard' });
    const dancingTrait = getDancingDefenseTraitName(list);
    const dancingDefs = dancingTrait ? calcDefense(vals[dancingTrait], { mode: 'dancing' }) : [];
    const separateDefs = calcSeparateDefense(defTrait, vals);
    const accuracyPreview = getAccuracyPreview({
      list,
      inv: storeHelper.getInventory(store),
      traitValues: vals
    });
    const accuracyByTrait = (accuracyPreview?.entries || []).reduce((acc, entry) => {
      const trait = typeof entry?.trait === 'string' ? entry.trait.trim() : '';
      if (!trait) return acc;
      if (!acc[trait]) acc[trait] = [];
      acc[trait].push(entry);
      return acc;
    }, {});
    const attackRuleNotes = getAttackTraitRuleNotes(list);
    const attackNotesByTrait = attackRuleNotes.reduce((acc, note) => {
      const trait = typeof note?.trait === 'string' ? note.trait.trim() : '';
      const text = typeof note?.extraText === 'string' ? note.extraText.trim() : '';
      if (!trait || !text) return acc;
      if (!acc[trait]) acc[trait] = [];
      acc[trait].push(text);
      return acc;
    }, {});
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
        const base = storeHelper.calcCarryCapacity(val, list);
        const capacity = base + artifactCapacity + manualCapacity;
        const tal = storeHelper.calcToughness(val, list) + artifactToughness + manualToughness;
        const pain = storeHelper.calcPainThreshold(val, list, effectsWithDark) + artifactPain + manualPain;


        extras.push(`Tålighet: ${tal}`)
        extras.push(` Smärtgräns: ${pain}`);
        extras.push(`Bärkapacitet: ${formatWeight(capacity)}`);
      } else if (k === 'Viljestark') {
        const perm = permBase;
        extras.push(`Styggelsetröskel: ${maxCor}`);
        extras.push(`Korruptionströskel: ${thresh}`);
        extras.push(`Permanent korruption: ${perm}`);
      }

      (attackNotesByTrait[k] || []).forEach(text => extras.push(text));
      (accuracyByTrait[k] || []).forEach(entry => {
        const sourceLabel = entry?.name ? ` (${entry.name})` : '';
        const value = Number(entry?.value);
        if (!Number.isFinite(value)) return;
        extras.push(`Tr\u00e4ffs\u00e4kerhet${sourceLabel}: ${value}`);
      });

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

      const traitSeparateDefs = separateDefs.filter(d => d.trait === k);
      if (traitSeparateDefs.length) {
        traitSeparateDefs.forEach(d => {
          const label = d.name ? `Försvar (${d.name})` : 'Försvar';
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

    const inv = storeHelper.getInventory(store);
    const maxTot = storeHelper.calcTraitTotalMax(list, inv);
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
      if (typeof window.refreshSummaryPage === 'function') window.refreshSummaryPage();
    });
  }

  window.renderTraits = renderTraits;
  window.bindTraits = bindTraits;
  window.calcDefense = calcDefense;
  window.calcAccuracy = calcAccuracy;
  window.getCurrentTraitValues = getCurrentTraitValues;
  window.getAutoDefenseSetup = getAutoDefenseSetup;
  window.getDefensePreview = getDefensePreview;
  window.getAccuracyPreview = getAccuracyPreview;
  window.getDefenseTraitName = getDefenseTraitName;
  window.getDancingDefenseTraitName = getDancingDefenseTraitName;
  window.getAttackTraitRuleNotes = getAttackTraitRuleNotes;
})(window);
