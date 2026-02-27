(function(window){
  const utils = window.eliteUtils || {};

  const toArray = (value) => (Array.isArray(value) ? value : []);
  const normalizeType = (type) => (typeof utils.normalizeType === 'function'
    ? utils.normalizeType(type)
    : String(type || '').trim());
  const normalizeLevel = (level, fallback = 'Novis') => (typeof utils.normalizeLevel === 'function'
    ? utils.normalizeLevel(level, fallback)
    : String(level || '').trim() || fallback);
  const entryHasType = (entry, type) => (typeof utils.entryHasType === 'function'
    ? utils.entryHasType(entry, type)
    : toArray(entry?.taggar?.typ).includes(type));

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

  function countFloorForGroup(group) {
    const type = normalizeType(group?.type);
    if (type === 'Nackdel') return 0;
    if (type === 'Fördel') return 5;
    return 10;
  }

  function countCreditForItem(item, group) {
    if (entryHasType(item, 'Nackdel')) {
      const groupType = normalizeType(group?.type);
      return groupType === 'Nackdel' ? 1 : 0;
    }
    const ded = deductionForItem(item).ded || 0;
    if (ded <= 0) return 0;
    if (entryHasType(item, 'Fördel')) {
      const groupType = normalizeType(group?.type);
      return groupType === 'Fördel' ? 1 : 0;
    }
    return ded >= countFloorForGroup(group) ? 1 : 0;
  }

  function groupSlotCost(group) {
    const type = normalizeType(group?.type);
    if (type === 'Nackdel') return 0;
    if (type === 'Fördel') return 5;
    if (type === 'Ritual' || group?.anyRitual || group?.allRitual) return 10;
    if (
      group?.isPrimary ||
      group?.anyMystic ||
      type === 'Förmåga' ||
      type === 'Mystisk kraft' ||
      type === 'Monstruöst särdrag' ||
      type === 'Särdrag'
    ) {
      return 10;
    }
    const candidateMin = toArray(group?.names)
      .map(name => findEntry(name))
      .filter(Boolean)
      .map(entry => costForEntry(entry, 'Novis'))
      .reduce((acc, value) => Math.min(acc, value), Infinity);
    if (Number.isFinite(candidateMin)) return candidateMin;
    return 10;
  }

  function groupBaseCost(group) {
    const minErf = Math.max(0, Number(group?.min_erf) || 0);
    const minCount = Math.max(0, Number(group?.min_antal) || 0);
    const countCost = minCount * countFloorForGroup(group);
    if (minErf > 0 && minCount > 0) return Math.max(minErf, countCost);
    if (minErf > 0) return minErf;
    if (minCount > 0) return countCost;
    return 0;
  }

  function groupLabel(group) {
    const source = String(group?.source || '');
    const minErf = Math.max(0, Number(group?.min_erf) || 0);
    const minCount = Math.max(0, Number(group?.min_antal) || 0);
    let label = 'Krav';
    if (group?.isPrimary) {
      const names = toArray(group?.names).map(name => String(name || '').trim()).filter(Boolean);
      if (!names.length) label = 'Primärförmåga';
      else label = names.length === 1 ? names[0] : names.join(' eller ');
    } else if (group?.anyMystic) {
      label = 'Valfri mystisk kraft';
    } else if (group?.anyRitual) {
      label = 'Valfri ritual';
    } else if (source === 'primartagg') {
      label = 'Primärt taggkrav';
    } else if (source === 'sekundartagg') {
      label = 'Sekundärt taggkrav';
    } else if (source.startsWith('valfri_inom_tagg')) {
      const type = normalizeType(group?.type);
      label = type ? `Valfri ${type.toLowerCase()}` : 'Valfritt val';
    } else {
      const names = toArray(group?.names).map(name => String(name || '').trim()).filter(Boolean);
      if (!names.length) return 'Okänt krav';
      if (names.length > 5) label = `${names.slice(0, 5).join(', ')} och fler`;
      else label = names.length === 1 ? names[0] : names.join(' eller ');
    }

    const reqParts = [];
    if (minErf > 0) reqParts.push(`${minErf} ERF`);
    if (minCount > 0) {
      reqParts.push(group?.isPrimary
        ? `minst ${minCount} val`
        : `minst ${minCount} val (${countFloorForGroup(group)}+ ERF/st)`);
    }
    if (!reqParts.length) return label;
    return `${label} (${reqParts.join(' · ')})`;
  }

  function matchesNamedGroupEntry(item, group) {
    const names = new Set(toArray(group?.names).map(name => normalizeKey(name)));
    if (!names.size) return false;
    if (!names.has(normalizeKey(item?.namn))) return false;
    const type = normalizeType(group?.type);
    if (type && !entryHasType(item, type)) return false;
    return true;
  }

  function collectGroupMatches(group, list) {
    const items = toArray(list);
    const type = normalizeType(group?.type);

    if (group?.anyMystic) {
      return uniqueByName(items.filter(item => entryHasType(item, 'Mystisk kraft')));
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
        if (source.startsWith('valfri_inom_tagg') && typeof utils.matchesValfriRule === 'function') {
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

  function primaryNamesFromKrav(krav) {
    const out = [];
    const seen = new Set();
    const add = (value) => {
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      const text = String(value || '').trim();
      if (!text) return;
      text
        .replace(/\beller\b/gi, ',')
        .split(/[,;/|]+/)
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(name => {
          const key = normalizeKey(name);
          if (!key || seen.has(key)) return;
          seen.add(key);
          out.push(name);
        });
    };
    add(krav?.primarformaga?.namn_lista);
    add(krav?.primarformaga?.namn);
    return out;
  }

  function reservedNamesFromKrav(krav, groups) {
    const reserved = new Set();
    const addName = (value) => {
      const key = normalizeKey(value);
      if (key) reserved.add(key);
    };

    primaryNamesFromKrav(krav).forEach(addName);

    toArray(krav?.specifika_formagor?.namn).forEach(addName);
    toArray(krav?.specifika_mystiska_krafter?.namn).forEach(addName);
    toArray(krav?.specifika_ritualer?.namn).forEach(addName);
    toArray(krav?.specifika_fordelar?.namn).forEach(addName);
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
      const minCount = Math.max(0, Number(group?.min_antal) || 0);
      const primaryOptions = toArray(group?.primary_options);
      if (group?.isPrimary && primaryOptions.length) {
        const optionByKey = new Map(primaryOptions
          .map(opt => {
            const key = normalizeKey(opt?.name);
            if (!key) return null;
            return [key, {
              minErf: Math.max(0, Number(opt?.min_erf) || 0)
            }];
          })
          .filter(Boolean));

        const rankedPrimary = candidates
          .map(token => {
            const option = optionByKey.get(token.key);
            if (!option) return null;
            const ded = deductionForItem(token.item).ded || 0;
            const requiredErf = option.minErf;
            const countCredit = ded > 0 ? 1 : 0;
            const progress = requiredErf > 0 ? (ded / requiredErf) : ded;
            return {
              token,
              ded,
              countCredit,
              requiredErf,
              progress,
              meetsErf: requiredErf <= 0 || ded >= requiredErf
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            const meetsDiff = Number(b.meetsErf) - Number(a.meetsErf);
            if (meetsDiff !== 0) return meetsDiff;
            if ((b.progress || 0) !== (a.progress || 0)) return (b.progress || 0) - (a.progress || 0);
            if ((b.countCredit || 0) !== (a.countCredit || 0)) return (b.countCredit || 0) - (a.countCredit || 0);
            return (b.ded || 0) - (a.ded || 0);
          });

        const picked = rankedPrimary.length ? [rankedPrimary[0]] : [];
        let selectedErf = 0;
        let selectedCount = 0;
        let requiredErf = minErf;
        let requiredCount = minCount;
        if (picked.length) {
          selectedErf = picked[0].ded || 0;
          selectedCount = picked[0].countCredit || 0;
          requiredErf = Math.max(minErf, picked[0].requiredErf || 0);
        }

        const hasErfReq = requiredErf > 0;
        const hasCountReq = requiredCount > 0;
        const metric = hasErfReq && hasCountReq
          ? 'both'
          : (hasErfReq ? 'erf' : (hasCountReq ? 'count' : 'none'));
        const ok = (!hasErfReq || selectedErf >= requiredErf) && (!hasCountReq || selectedCount >= requiredCount);
        picked.forEach(row => consumed.add(row.token.id));
        states.set(idx, {
          ok,
          selected: metric === 'count' ? selectedCount : selectedErf,
          required: metric === 'count' ? requiredCount : requiredErf,
          metric,
          selected_erf: selectedErf,
          required_erf: requiredErf,
          selected_count: selectedCount,
          required_count: requiredCount,
          picked: picked.map(row => row.token),
          deduction: Math.min(selectedErf, Math.max(groupBaseCost(group), requiredErf))
        });
        return;
      }

      const hasErfReq = minErf > 0;
      const hasCountReq = minCount > 0;

      const ranked = candidates
        .map(token => ({
          token,
          ded: deductionForItem(token.item).ded || 0,
          countCredit: countCreditForItem(token.item, group)
        }))
        .sort((a, b) => {
          const countDiff = (b.countCredit || 0) - (a.countCredit || 0);
          if (countDiff !== 0) return countDiff;
          return (b.ded || 0) - (a.ded || 0);
        });

      const picked = [];
      let selectedErf = 0;
      let selectedCount = 0;
      for (let i = 0; i < ranked.length; i += 1) {
        if ((!hasErfReq || selectedErf >= minErf) && (!hasCountReq || selectedCount >= minCount)) break;
        const row = ranked[i];
        picked.push(row);
        selectedErf += row.ded || 0;
        selectedCount += row.countCredit || 0;
      }
      picked.forEach(row => consumed.add(row.token.id));

      const metric = hasErfReq && hasCountReq
        ? 'both'
        : (hasErfReq ? 'erf' : (hasCountReq ? 'count' : 'none'));
      const ok = (!hasErfReq || selectedErf >= minErf) && (!hasCountReq || selectedCount >= minCount);
      states.set(idx, {
        ok,
        selected: metric === 'count' ? selectedCount : selectedErf,
        required: metric === 'count' ? minCount : minErf,
        metric,
        selected_erf: selectedErf,
        required_erf: minErf,
        selected_count: selectedCount,
        required_count: minCount,
        picked: picked.map(row => row.token),
        deduction: Math.min(selectedErf, groupBaseCost(group))
      });
    });

    toArray(groups).forEach((group, idx) => {
      if (states.has(idx)) return;
      const minErf = Math.max(0, Number(group?.min_erf) || 0);
      const minCount = Math.max(0, Number(group?.min_antal) || 0);
      const metric = minErf > 0 && minCount > 0
        ? 'both'
        : (minErf > 0 ? 'erf' : (minCount > 0 ? 'count' : 'none'));
      states.set(idx, {
        ok: metric === 'none',
        selected: 0,
        required: metric === 'count' ? minCount : minErf,
        metric,
        selected_erf: 0,
        required_erf: minErf,
        selected_count: 0,
        required_count: minCount,
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
    const normType = normalizeType(type);
    if (normType === 'Nackdel') {
      return { ok: true, missing: '' };
    }
    const names = toArray(config?.namn).map(name => String(name || '').trim()).filter(Boolean);
    const minCount = Math.max(0, Number(config?.min_antal) || 0);
    const minErf = Math.max(0, Number(config?.min_erf) || 0);
    if (!names.length || (minCount <= 0 && minErf <= 0)) return { ok: true, missing: '' };
    const target = new Set(names.map(normalizeKey));
    const rows = uniqueByName(toArray(list).filter(item => {
      if (!target.has(normalizeKey(item?.namn))) return false;
      if (type && !entryHasType(item, type)) return false;
      return true;
    }))
      .map(item => ({
        item,
        ded: deductionForItem(item).ded || 0,
        countCredit: countCreditForItem(item, { type: normType })
      }))
      .sort((a, b) => {
        const countDiff = (b.countCredit || 0) - (a.countCredit || 0);
        if (countDiff !== 0) return countDiff;
        return (b.ded || 0) - (a.ded || 0);
      });

    let selectedErf = 0;
    let selectedCount = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if ((minErf <= 0 || selectedErf >= minErf) && (minCount <= 0 || selectedCount >= minCount)) break;
      const row = rows[i];
      selectedErf += row.ded || 0;
      selectedCount += row.countCredit || 0;
    }

    const ok = (minErf <= 0 || selectedErf >= minErf) && (minCount <= 0 || selectedCount >= minCount);
    if (ok) return { ok: true, missing: '' };
    if (minErf > 0 && minCount > 0) {
      return {
        ok: false,
        missing: `Specifika ${normType.toLowerCase()} (${selectedErf}/${minErf} ERF, ${selectedCount}/${minCount} val)`
      };
    }
    if (minErf > 0) return { ok: false, missing: `Specifika ${normType.toLowerCase()} (${selectedErf}/${minErf} ERF)` };
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
    const primaryNames = primaryNamesFromKrav(krav);

    if (!primaryNames.length) {
      primaryOk = false;
      missing.push('Primärförmåga saknas');
    }

    groups.forEach((group, idx) => {
      const state = groupStates.get(idx) || {
        ok: false,
        selected_erf: 0,
        required_erf: 0,
        selected_count: 0,
        required_count: 0
      };
      const minErf = Math.max(0, Number(state?.required_erf ?? group?.min_erf) || 0);
      const minCount = Math.max(0, Number(state?.required_count ?? group?.min_antal) || 0);
      const ok = Boolean(state.ok);
      if (group?.isPrimary) primaryOk = ok;
      if (!ok) {
        const selectedErf = Math.max(0, Number(state.selected_erf) || 0);
        const selectedCount = Math.max(0, Number(state.selected_count) || 0);
        if (minErf > 0 && minCount > 0) {
          missing.push(`${groupLabel(group)} (${selectedErf}/${minErf} ERF, ${selectedCount}/${minCount} val)`);
        } else if (minErf > 0) {
          missing.push(`${groupLabel(group)} (${selectedErf}/${minErf} ERF)`);
        } else if (minCount > 0) {
          missing.push(`${groupLabel(group)} (${selectedCount}/${minCount} val)`);
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
    return { kind: 'ability', ded: costForEntry(item, item?.nivå) };
  }

  function namedSetRemaining(list, config, type) {
    const normType = normalizeType(type);
    if (normType === 'Nackdel') return 0;
    const names = toArray(config?.namn).map(name => String(name || '').trim()).filter(Boolean);
    const minCount = Math.max(0, Number(config?.min_antal) || 0);
    const minErf = Math.max(0, Number(config?.min_erf) || 0);
    if (!names.length || (minCount <= 0 && minErf <= 0)) return 0;
    const target = new Set(names.map(normalizeKey));
    const rows = uniqueByName(toArray(list).filter(item => {
      if (!target.has(normalizeKey(item?.namn))) return false;
      if (type && !entryHasType(item, type)) return false;
      return true;
    }))
      .map(item => ({
        ded: deductionForItem(item).ded || 0,
        countCredit: countCreditForItem(item, { type: normType })
      }))
      .sort((a, b) => {
        const countDiff = (b.countCredit || 0) - (a.countCredit || 0);
        if (countDiff !== 0) return countDiff;
        return (b.ded || 0) - (a.ded || 0);
      });

    let selectedErf = 0;
    let selectedCount = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if ((minErf <= 0 || selectedErf >= minErf) && (minCount <= 0 || selectedCount >= minCount)) break;
      selectedErf += rows[i].ded || 0;
      selectedCount += rows[i].countCredit || 0;
    }

    const missingErf = Math.max(0, minErf - selectedErf);
    const missingCount = Math.max(0, minCount - selectedCount);
    const perItem = normType === 'Fördel' ? 5 : 10;
    if (minErf > 0 && minCount > 0) return Math.max(missingErf, missingCount * perItem);
    if (minErf > 0) return missingErf;
    return missingCount * perItem;
  }

  function groupRemainingXP(group, state = {}) {
    const minErf = Math.max(0, Number(state?.required_erf ?? group?.min_erf) || 0);
    const minCount = Math.max(0, Number(state?.required_count ?? group?.min_antal) || 0);
    const selectedErf = Math.max(0, Number(state?.selected_erf) || 0);
    const selectedCount = Math.max(0, Number(state?.selected_count) || 0);
    const missingErf = Math.max(0, minErf - selectedErf);
    const missingCount = Math.max(0, minCount - selectedCount);
    const countGapCost = missingCount * countFloorForGroup(group);
    if (minErf > 0 && minCount > 0) return Math.max(missingErf, countGapCost);
    if (minErf > 0) return missingErf;
    if (minCount > 0) return countGapCost;
    return 0;
  }

  function minXP(entry, list){
    try {
      const groups = getGroups(entry).filter(group =>
        Math.max(0, Number(group?.min_erf) || 0) > 0 ||
        Math.max(0, Number(group?.min_antal) || 0) > 0
      );
      const pcList = toArray(list);
      const krav = getKrav(entry);
      const groupStates = buildGroupStates(groups, pcList, krav);
      const missingGroups = groups.reduce((sum, group, idx) =>
        sum + groupRemainingXP(group, groupStates.get(idx)), 0);
      const missingBenefits = namedSetRemaining(pcList, krav.specifika_fordelar, 'Fördel');
      const result = missingGroups + missingBenefits;
      return Math.max(0, result);
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
