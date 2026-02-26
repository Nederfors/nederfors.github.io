(function(window){
  const utils = window.eliteUtils || {};
  const LEVEL_VALUE = utils.LEVEL_VALUE || { '': 0, Novis: 1, 'Gesäll': 2, 'Mästare': 3 };

  const toArray = (value) => (Array.isArray(value) ? value : []);
  const normalizeType = (type) => (typeof utils.normalizeType === 'function'
    ? utils.normalizeType(type)
    : String(type || '').trim());
  const normalizeLevel = (level, fallback = 'Novis') => (typeof utils.normalizeLevel === 'function'
    ? utils.normalizeLevel(level, fallback)
    : String(level || '').trim() || fallback);
  const levelMeets = (actual, required = 'Novis') => (typeof utils.levelMeets === 'function'
    ? utils.levelMeets(actual, required)
    : (LEVEL_VALUE[normalizeLevel(actual, '')] || 0) >= (LEVEL_VALUE[normalizeLevel(required, 'Novis')] || 0));
  const entryHasType = (entry, type) => (typeof utils.entryHasType === 'function'
    ? utils.entryHasType(entry, type)
    : toArray(entry?.taggar?.typ).includes(type));
  const entryUsesLevel = (entry) => (
    entryHasType(entry, 'Förmåga') ||
    entryHasType(entry, 'Mystisk kraft') ||
    entryHasType(entry, 'Monstruöst särdrag') ||
    entryHasType(entry, 'Särdrag')
  );

  function getLookupOptions() {
    return {
      dbList: Array.isArray(window.DB) ? window.DB : (Array.isArray(window.DBList) ? window.DBList : []),
      lookupEntry: window.lookupEntry
    };
  }

  function getKrav(entry) {
    if (typeof utils.normalizeKrav === 'function') {
      return utils.normalizeKrav(entry?.krav || {});
    }
    return entry?.krav || {};
  }

  function getGroups(entry) {
    if (typeof utils.getKravGroups === 'function') {
      return utils.getKravGroups(getKrav(entry), getLookupOptions());
    }
    return [];
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isRepeatableBenefitEntry(item) {
    if (typeof utils.isRepeatableBenefitEntry === 'function') {
      return utils.isRepeatableBenefitEntry(item);
    }
    const types = toArray(item?.taggar?.typ).map(normalizeType);
    const multi = Boolean(item?.kan_införskaffas_flera_gånger || item?.taggar?.kan_införskaffas_flera_gånger);
    return multi && (types.includes('Fördel') || types.includes('Nackdel'));
  }

  function uniqueByName(list) {
    const map = new Map();
    const out = [];
    toArray(list).forEach(item => {
      if (isRepeatableBenefitEntry(item)) {
        out.push(item);
        return;
      }
      const key = normalizeKey(item?.namn);
      if (!key) return;
      if (map.has(key)) return;
      map.set(key, item);
      out.push(item);
    });
    return out;
  }

  function costForEntry(item, level) {
    if (!item) return 0;
    if (typeof utils.requirementErf === 'function') {
      return Math.max(0, Number(utils.requirementErf(item, level)) || 0);
    }
    if (entryHasType(item, 'Nackdel')) return 0;
    if (entryHasType(item, 'Fördel')) return 5;
    if (entryHasType(item, 'Ritual')) return 10;
    const lvl = normalizeLevel(level || item?.nivå, 'Novis');
    if (
      entryHasType(item, 'Förmåga') ||
      entryHasType(item, 'Mystisk kraft') ||
      entryHasType(item, 'Monstruöst särdrag') ||
      entryHasType(item, 'Särdrag')
    ) {
      if (lvl === 'Mästare') return 60;
      if (lvl === 'Gesäll') return 30;
      return 10;
    }
    return 10;
  }

  function findEntry(name) {
    if (typeof utils.findEntryByName === 'function') {
      return utils.findEntryByName(name, getLookupOptions());
    }
    try {
      return typeof window.lookupEntry === 'function'
        ? (window.lookupEntry({ id: name, name }) || window.lookupEntry(name))
        : null;
    } catch {
      return null;
    }
  }

  function groupSlotCost(group) {
    const type = normalizeType(group?.type);
    if (type === 'Nackdel') return 0;
    if (type === 'Fördel') return 5;
    if (type === 'Ritual' || group?.anyRitual || group?.allRitual) return 10;
    const min = normalizeLevel(group?.min_niva || 'Novis', 'Novis');
    if (
      group?.isPrimary ||
      group?.anyMystic ||
      type === 'Förmåga' ||
      type === 'Mystisk kraft' ||
      type === 'Monstruöst särdrag' ||
      type === 'Särdrag'
    ) {
      if (min === 'Mästare') return 60;
      if (min === 'Gesäll') return 30;
      return 10;
    }
    const candidateMin = toArray(group?.names)
      .map(name => findEntry(name))
      .filter(Boolean)
      .map(entry => costForEntry(entry, min))
      .reduce((acc, value) => Math.min(acc, value), Infinity);
    if (Number.isFinite(candidateMin)) return candidateMin;
    return 10;
  }

  function groupBaseCost(group) {
    const minErf = Math.max(0, Number(group?.min_erf) || 0);
    if (minErf > 0) return minErf;
    const minCount = Math.max(1, Number(group?.min_antal) || 1);
    return minCount * groupSlotCost(group);
  }

  function groupLabel(group) {
    const min = normalizeLevel(group?.min_niva || 'Novis', 'Novis');
    const source = String(group?.source || '');
    const minErf = Math.max(0, Number(group?.min_erf) || 0);
    if (minErf > 0) {
      if (source === 'primartagg') return `Primärt taggkrav (${minErf} ERF)`;
      if (source === 'sekundartagg') return `Sekundärt taggkrav (${minErf} ERF)`;
      return `Taggkrav (${minErf} ERF)`;
    }
    if (group?.isPrimary) {
      const name = String(group?.names?.[0] || 'Primärförmåga');
      return `${name} (${min})`;
    }
    if (group?.anyMystic) return `Valfri mystisk kraft (${min})`;
    if (group?.anyRitual) return 'Valfri ritual';
    if (source.startsWith('valfri_inom_tagg')) {
      const type = normalizeType(group?.type);
      const label = type ? `Valfri ${type.toLowerCase()}` : 'Valfritt val';
      if ((Number(group?.min_antal) || 1) > 1) return `${group.min_antal} val från ${label}`;
      return label;
    }
    const names = toArray(group?.names).map(name => String(name || '').trim()).filter(Boolean);
    if (!names.length) return 'Okänt krav';
    if (group?.min_antal > 1) {
      return `${group.min_antal} av: ${names.join(', ')}`;
    }
    if (names.length > 5) {
      return `${names.slice(0, 5).join(', ')} och fler${normalizeType(group?.type) === 'Ritual' ? '' : ` (${min})`}`;
    }
    const suffix = normalizeType(group?.type) === 'Ritual' ? '' : ` (${min})`;
    return names.length === 1 ? `${names[0]}${suffix}` : `${names.join(' eller ')}${suffix}`;
  }

  function matchesNamedGroupEntry(item, group) {
    const names = new Set(toArray(group?.names).map(name => normalizeKey(name)));
    if (!names.size) return false;
    if (!names.has(normalizeKey(item?.namn))) return false;
    const type = normalizeType(group?.type);
    if (type && !entryHasType(item, type)) return false;
    if (type !== 'Ritual' && type !== 'Fördel' && type !== 'Nackdel' && entryUsesLevel(item)) {
      return levelMeets(item?.nivå, group?.min_niva || 'Novis');
    }
    return true;
  }

  function collectGroupMatches(group, list) {
    const items = toArray(list);
    const type = normalizeType(group?.type);

    if (group?.anyMystic) {
      return uniqueByName(items.filter(item => entryHasType(item, 'Mystisk kraft') && levelMeets(item?.nivå, group?.min_niva || 'Novis')));
    }
    if (group?.anyRitual) {
      return uniqueByName(items.filter(item => entryHasType(item, 'Ritual')));
    }
    if (group?.tagRule) {
      const source = String(group?.source || '');
      const xpTypes = toArray(group?.tagRule?.xp_kallor)
        .map(normalizeType)
        .filter(Boolean);
      const matcher = (item) => {
        if (source.startsWith('valfri_inom_tagg') && type && typeof utils.matchesValfriRule === 'function') {
          return utils.matchesValfriRule(item, group.tagRule);
        }
        if (typeof utils.matchesTagRule === 'function' && !utils.matchesTagRule(item, group.tagRule)) {
          return false;
        }
        if (xpTypes.length) {
          return xpTypes.some(xpType => entryHasType(item, xpType));
        }
        if (type) return entryHasType(item, type);
        return true;
      };
      return uniqueByName(items.filter(matcher));
    }
    if (toArray(group?.names).length) {
      return uniqueByName(items.filter(item => matchesNamedGroupEntry(item, group)));
    }
    return [];
  }

  function isReservedGroup(group) {
    const source = String(group?.source || '');
    if (group?.isPrimary) return true;
    return source.startsWith('specifika_');
  }

  function reservedNamesFromKrav(krav, groups) {
    const reserved = new Set();
    const addName = (value) => {
      const key = normalizeKey(value);
      if (key) reserved.add(key);
    };

    const primary = String(krav?.primarformaga?.namn || '').trim();
    if (primary) addName(primary);

    toArray(krav?.specifika_formagor?.namn).forEach(addName);
    toArray(krav?.specifika_mystiska_krafter?.namn).forEach(addName);
    toArray(krav?.specifika_ritualer?.namn).forEach(addName);
    toArray(krav?.specifika_fordelar?.namn).forEach(addName);
    toArray(krav?.specifika_nackdelar?.namn).forEach(addName);
    toArray(groups).forEach(group => {
      if (!isReservedGroup(group)) return;
      toArray(group?.names).forEach(addName);
    });
    return reserved;
  }

  function groupPriority(group) {
    const source = String(group?.source || '');
    if (group?.isPrimary) return 0;
    if (source.startsWith('specifika_')) return 1;
    if (group?.tagRule) return 2;
    if (Math.max(0, Number(group?.min_erf) || 0) > 0) return 3;
    return 4;
  }

  function groupOptionCount(group) {
    const names = toArray(group?.names).map(name => String(name || '').trim()).filter(Boolean);
    if (!names.length) return 9999;
    if (!group?.tagRule) return names.length;
    const typeCounts = new Map();
    names.forEach(name => {
      const item = findEntry(name);
      const key = (
        entryHasType(item, 'Förmåga') || entryHasType(item, 'Monstruöst särdrag') || entryHasType(item, 'Särdrag')
      ) ? 'ability'
        : entryHasType(item, 'Mystisk kraft') ? 'mystic'
          : entryHasType(item, 'Ritual') ? 'ritual'
            : entryHasType(item, 'Fördel') ? 'advantage'
              : entryHasType(item, 'Nackdel') ? 'drawback'
                : 'other';
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    });
    const nonZero = Array.from(typeCounts.values()).filter(count => count > 0);
    if (!nonZero.length) return names.length;
    return Math.min(...nonZero);
  }

  function collapseListTokens(list) {
    const out = [];
    const nonRepeatIndex = new Map();
    toArray(list).forEach((item, idx) => {
      const name = String(item?.namn || '').trim();
      const key = normalizeKey(name);
      if (!key) return;
      const token = {
        id: `pc:${idx}`,
        item,
        name,
        key
      };
      if (isRepeatableBenefitEntry(item)) {
        out.push(token);
        return;
      }
      const existingIdx = nonRepeatIndex.get(key);
      if (existingIdx === undefined) {
        nonRepeatIndex.set(key, out.length);
        out.push(token);
        return;
      }
      const prev = out[existingIdx];
      if (deductionForItem(item).ded >= deductionForItem(prev.item).ded) {
        out[existingIdx] = token;
      }
    });
    return out;
  }

  function dedupeTokensForGroup(group, list) {
    const allowRepeat = Boolean(group?.allow_repeat);
    const out = [];
    const seen = new Set();
    toArray(list).forEach(token => {
      const key = String(token?.key || '').trim();
      if (!key) return;
      const repeatable = isRepeatableBenefitEntry(token?.item);
      if (!allowRepeat || !repeatable) {
        if (seen.has(key)) return;
        seen.add(key);
      }
      out.push(token);
    });
    return out;
  }

  function buildGroupStates(groups, list, krav) {
    const tokens = collapseListTokens(list);

    const reservedNames = reservedNamesFromKrav(krav, groups);
    const consumed = new Set();
    const states = new Map();

    const ordered = toArray(groups)
      .map((group, idx) => ({ group, idx }))
      .sort((a, b) => {
        const p = groupPriority(a.group) - groupPriority(b.group);
        if (p !== 0) return p;
        if (a.group?.tagRule && b.group?.tagRule) {
          const aCount = groupOptionCount(a.group);
          const bCount = groupOptionCount(b.group);
          if (aCount !== bCount) return aCount - bCount;
        }
        const aErf = Math.max(0, Number(a.group?.min_erf) || 0);
        const bErf = Math.max(0, Number(b.group?.min_erf) || 0);
        if (aErf !== bErf) return bErf - aErf;
        return a.idx - b.idx;
      });

    ordered.forEach(({ group, idx }) => {
      const reservedGroup = isReservedGroup(group);
      const candidates = dedupeTokensForGroup(group, tokens.filter(token => {
        if (consumed.has(token.id)) return false;
        if (!reservedGroup && reservedNames.has(token.key)) return false;
        return collectGroupMatches(group, [token.item]).length > 0;
      }));

      const minErf = Math.max(0, Number(group?.min_erf) || 0);
      if (minErf > 0) {
        const ranked = candidates
          .map(token => ({ token, ded: deductionForItem(token.item).ded || 0 }))
          .sort((a, b) => (b.ded || 0) - (a.ded || 0));
        const picked = [];
        let total = 0;
        for (let i = 0; i < ranked.length && total < minErf; i += 1) {
          picked.push(ranked[i]);
          total += ranked[i].ded || 0;
        }
        picked.forEach(row => consumed.add(row.token.id));
        states.set(idx, {
          ok: total >= minErf,
          selected: total,
          required: minErf,
          metric: 'erf',
          picked: picked.map(row => row.token),
          deduction: Math.min(total, minErf)
        });
        return;
      }

      const minCount = Math.max(1, Number(group?.min_antal) || 1);
      const ranked = candidates
        .map(token => ({ token, ded: deductionForItem(token.item).ded || 0 }))
        .sort((a, b) => (b.ded || 0) - (a.ded || 0));
      const picked = ranked.slice(0, minCount);
      picked.forEach(row => consumed.add(row.token.id));
      const ded = picked.reduce((sum, row) => sum + (row.ded || 0), 0);
      states.set(idx, {
        ok: picked.length >= minCount,
        selected: picked.length,
        required: minCount,
        metric: 'count',
        picked: picked.map(row => row.token),
        deduction: Math.min(ded, groupBaseCost(group))
      });
    });

    toArray(groups).forEach((group, idx) => {
      if (states.has(idx)) return;
      states.set(idx, {
        ok: false,
        selected: 0,
        required: Math.max(0, Number(group?.min_erf) || 0) || Math.max(1, Number(group?.min_antal) || 1),
        metric: Math.max(0, Number(group?.min_erf) || 0) > 0 ? 'erf' : 'count',
        picked: [],
        deduction: 0
      });
    });

    return states;
  }

  function groupErfTotal(group, list) {
    const matches = collectGroupMatches(group, list);
    return matches.reduce((sum, item) => sum + (deductionForItem(item).ded || 0), 0);
  }

  function checkNamedSet(list, config, type) {
    const names = toArray(config?.namn).map(name => String(name || '').trim()).filter(Boolean);
    const minCount = Math.max(0, Number(config?.min_antal) || 0);
    if (!names.length || minCount <= 0) return { ok: true, missing: '' };
    const target = new Set(names.map(normalizeKey));
    const matches = uniqueByName(toArray(list).filter(item => {
      if (!target.has(normalizeKey(item?.namn))) return false;
      if (type && !entryHasType(item, type)) return false;
      if (type !== 'Ritual' && type !== 'Fördel' && type !== 'Nackdel') {
        return levelMeets(item?.nivå, config?.min_niva || 'Novis');
      }
      return true;
    }));
    if (matches.length >= minCount) return { ok: true, missing: '' };
    if (minCount === 1) return { ok: false, missing: names.join(' eller ') };
    return { ok: false, missing: `${minCount} av: ${names.join(', ')}` };
  }

  function check(entry, list){
    const pcList = toArray(list);
    const krav = getKrav(entry);
    const groups = getGroups(entry);
    const groupStates = buildGroupStates(groups, pcList, krav);
    const missing = [];
    let primaryOk = true;
    const primaryName = String(krav?.primarformaga?.namn || '').trim();

    if (!primaryName) {
      primaryOk = false;
      missing.push('Primärförmåga saknas');
    }

    groups.forEach((group, idx) => {
      const state = groupStates.get(idx) || { ok: false, selected: 0, required: 0, metric: 'count' };
      const minErf = Math.max(0, Number(group?.min_erf) || 0);
      const ok = Boolean(state.ok);
      if (group?.isPrimary) primaryOk = ok;
      if (!ok) {
        if (minErf > 0) {
          const total = Math.max(0, Number(state.selected) || 0);
          missing.push(`${groupLabel(group)} (${total}/${minErf} ERF)`);
        } else {
          missing.push(groupLabel(group));
        }
      }
    });

    const ford = checkNamedSet(pcList, krav.specifika_fordelar, 'Fördel');
    if (!ford.ok && ford.missing) missing.push(ford.missing);
    const nack = checkNamedSet(pcList, krav.specifika_nackdelar, 'Nackdel');
    if (!nack.ok && nack.missing) missing.push(nack.missing);

    const ok = missing.length === 0;
    return { ok, missing, master: primaryOk, primary: primaryOk };
  }

  function deductionForItem(item) {
    if (!item) return { kind: 'none', ded: 0 };
    if (entryHasType(item, 'Nackdel')) return { kind: 'disadvantage', ded: 0 };
    if (entryHasType(item, 'Fördel')) return { kind: 'advantage', ded: 5 };
    if (entryHasType(item, 'Ritual')) return { kind: 'ritual', ded: 10 };
    const isAbility =
      entryHasType(item, 'Förmåga') ||
      entryHasType(item, 'Mystisk kraft') ||
      entryHasType(item, 'Monstruöst särdrag') ||
      entryHasType(item, 'Särdrag');
    if (!isAbility) return { kind: 'other', ded: 10 };
    const lvl = normalizeLevel(item?.nivå, 'Novis');
    if (lvl === 'Mästare') return { kind: 'ability', ded: 60 };
    if (lvl === 'Gesäll') return { kind: 'ability', ded: 30 };
    return { kind: 'ability', ded: 10 };
  }

  function bestGroupDeduction(group, list) {
    const matches = collectGroupMatches(group, list).map(deductionForItem);
    if (!matches.length) return { kind: 'none', ded: 0 };
    const minErf = Math.max(0, Number(group?.min_erf) || 0);
    if (minErf > 0) {
      const sorted = matches.sort((a, b) => (b.ded || 0) - (a.ded || 0));
      const total = sorted.reduce((sum, row) => sum + (row.ded || 0), 0);
      const limited = Math.min(total, minErf);
      const kind = sorted.some(cur => cur.kind === 'ability')
        ? 'ability'
        : (sorted.some(cur => cur.kind === 'ritual') ? 'ritual' : 'other');
      return { kind, ded: limited };
    }
    const minCount = Math.max(1, Number(group?.min_antal) || 1);
    const sorted = matches.sort((a, b) => (b.ded || 0) - (a.ded || 0));
    const picked = sorted.slice(0, minCount);
    const ded = picked.reduce((sum, cur) => sum + (cur.ded || 0), 0);
    const kind = picked.some(cur => cur.kind === 'ability')
      ? 'ability'
      : (picked.some(cur => cur.kind === 'ritual') ? 'ritual' : 'other');
    return { kind, ded: Math.min(ded, groupBaseCost(group)) };
  }

  function namedSetCost(config, type) {
    const names = toArray(config?.namn).map(name => String(name || '').trim()).filter(Boolean);
    const minCount = Math.max(0, Number(config?.min_antal) || 0);
    if (!names.length || minCount <= 0) return 0;
    if (type === 'Nackdel') return 0;
    if (type === 'Fördel') return minCount * 5;
    if (type === 'Ritual') return minCount * 10;
    const minLevel = normalizeLevel(config?.min_niva || 'Novis', 'Novis');
    if (minLevel === 'Mästare') return minCount * 60;
    if (minLevel === 'Gesäll') return minCount * 30;
    return minCount * 10;
  }

  function namedSetDeduction(list, config, type) {
    const names = toArray(config?.namn).map(name => String(name || '').trim()).filter(Boolean);
    const minCount = Math.max(0, Number(config?.min_antal) || 0);
    if (!names.length || minCount <= 0) return 0;
    const target = new Set(names.map(normalizeKey));
    const matches = uniqueByName(toArray(list).filter(item => {
      if (!target.has(normalizeKey(item?.namn))) return false;
      if (type && !entryHasType(item, type)) return false;
      if (type !== 'Ritual' && type !== 'Fördel' && type !== 'Nackdel') {
        return levelMeets(item?.nivå, config?.min_niva || 'Novis');
      }
      return true;
    }));
    const capped = matches
      .map(deductionForItem)
      .sort((a, b) => (b.ded || 0) - (a.ded || 0))
      .slice(0, minCount);
    const total = capped.reduce((sum, row) => sum + (row.ded || 0), 0);
    return Math.min(total, namedSetCost(config, type));
  }

  function primaryPartialDeduction(krav, list) {
    const name = String(krav?.primarformaga?.namn || '').trim();
    if (!name) return 0;
    const minLevel = 'Mästare';
    const entries = toArray(list).filter(item => normalizeKey(item?.namn) === normalizeKey(name));
    if (!entries.length) return 0;
    if (entries.some(item => levelMeets(item?.nivå, minLevel))) return 0;
    return entries
      .map(item => costForEntry(item, item?.nivå || 'Novis'))
      .reduce((best, value) => Math.max(best, value), 0);
  }

  function minXP(entry, list){
    try {
      const groups = getGroups(entry).filter(group =>
        Math.max(0, Number(group?.min_erf) || 0) > 0 ||
        Math.max(1, Number(group?.min_antal) || 1) > 0
      );
      const pcList = toArray(list);
      const krav = getKrav(entry);
      const groupStates = buildGroupStates(groups, pcList, krav);
      const base = groups.reduce((sum, group) => sum + groupBaseCost(group), 0) +
        namedSetCost(krav.specifika_fordelar, 'Fördel') +
        namedSetCost(krav.specifika_nackdelar, 'Nackdel');
      const totalDed = Array.from(groupStates.values()).reduce((sum, state) => sum + (state?.deduction || 0), 0) +
        namedSetDeduction(pcList, krav.specifika_fordelar, 'Fördel') +
        namedSetDeduction(pcList, krav.specifika_nackdelar, 'Nackdel') +
        primaryPartialDeduction(krav, pcList);
      const result = base - totalDed;
      return result > 0 ? result : 0;
    } catch {
      return 50;
    }
  }

  function isElite(entry){
    return (entry.taggar?.typ || []).includes('Elityrke');
  }

  function canChange(list){
    const elites = toArray(list).filter(isElite);
    return elites.every(el => check(el, list).ok);
  }

  function parse(krav) {
    return getGroups({ krav });
  }

  window.eliteReq = {
    check,
    canChange,
    parse,
    minXP
  };
})(window);
