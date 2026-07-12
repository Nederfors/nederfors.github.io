(function(window){
  const utils = window.eliteUtils || {};

  const toArray = (value) => (Array.isArray(value) ? value : []);
  const normalizeType = (type) => (typeof utils.normalizeType === 'function'
    ? utils.normalizeType(type)
    : String(type || '').trim());
  const entryHasType = (entry, type) => (typeof utils.entryHasType === 'function'
    ? utils.entryHasType(entry, type)
    : toArray(entry?.taggar?.typ).includes(type));

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeSourceHint(value) {
    return String(value || '').trim();
  }

  function parseSourceIndex(source, prefix) {
    const match = normalizeSourceHint(source).match(new RegExp(`^${prefix}\\[(\\d+)\\]$`));
    return match ? (Number(match[1]) || 0) : -1;
  }

  function tokenSourceHint(item) {
    if (!item || typeof item !== 'object') return '';
    const candidates = [
      item.__elite_source,
      item.elite_source,
      item.__krav_source,
      item.krav_source
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const hint = normalizeSourceHint(candidates[i]);
      if (hint) return hint;
    }
    return '';
  }

  function toInt(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.floor(num));
  }

  function getLookupOptions() {
    return {
      dbList: Array.isArray(window.DB) ? window.DB : (Array.isArray(window.DBList) ? window.DBList : []),
      lookupEntry: window.lookupEntry
    };
  }

  function getKrav(entry) {
    const rawKrav = entry?.elite_requirements || entry?.krav || {};
    if (typeof utils.normalizeKrav === 'function') {
      return utils.normalizeKrav(rawKrav);
    }
    return rawKrav;
  }

  function getGroups(entry) {
    if (typeof utils.getKravGroups === 'function') {
      return utils.getKravGroups(getKrav(entry), getLookupOptions());
    }
    return [];
  }

  function itemName(item) {
    return String(item?.namn || item?.name || '').trim();
  }

  function isBenefit(item) {
    return entryHasType(item, 'Fördel');
  }

  function isDrawback(item) {
    return entryHasType(item, 'Nackdel');
  }

  function matchesType(item, type) {
    const wanted = normalizeType(type);
    if (!wanted) return true;
    return entryHasType(item, wanted);
  }

  function calcItemXP(item, list, grantMaps) {
    if (!item || typeof item !== 'object') return 0;
    const helper = window.storeHelper;
    if (helper && typeof helper.calcEntryXP === 'function') {
      try {
        const value = Number(helper.calcEntryXP(item, list, grantMaps ? { grantMaps } : undefined));
        if (Number.isFinite(value)) return Math.max(0, value);
      } catch {}
    }
    if (typeof utils.requirementErf === 'function') {
      try {
        const fallback = Number(utils.requirementErf(item, item?.nivå));
        if (Number.isFinite(fallback)) return Math.max(0, fallback);
      } catch {}
    }
    return 0;
  }

  function buildTokens(list) {
    const sourceList = toArray(list);
    const grantMaps = (window.storeHelper && typeof window.storeHelper.buildGrantMaps === 'function')
      ? window.storeHelper.buildGrantMaps(sourceList)
      : null;
    return sourceList
      .map((item, idx) => {
        const name = itemName(item);
        if (!name) return null;
        return {
          id: `pc:${idx}`,
          idx,
          item,
          name,
          key: normalizeKey(name),
          xp: calcItemXP(item, sourceList, grantMaps),
          isBenefit: isBenefit(item),
          isDrawback: isDrawback(item),
          sourceHint: tokenSourceHint(item)
        };
      })
      .filter(Boolean);
  }

  function normalizeAlternative(raw = {}) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const name = String(raw || '').trim();
      if (!name) return null;
      return { typ: '', namn: name };
    }
    if (typeof raw !== 'object') return null;
    const name = String(raw.namn || '').trim();
    if (!name) return null;
    return {
      typ: normalizeType(raw.typ),
      namn: name
    };
  }

  function matchesAlternative(token, alternative) {
    if (!token || !alternative) return false;
    if (!alternative.namn) return false;
    const altKey = normalizeKey(alternative.namn);
    const wildcard = altKey === '*' || altKey === 'valfri';
    if (!wildcard && token.key !== altKey) return false;
    if (!matchesType(token.item, alternative.typ)) return false;
    return true;
  }

  function matchesValfriRule(token, rawRule = {}) {
    if (!token || token.xp <= 0) return false;
    if (token.isBenefit || token.isDrawback) return false;
    if (typeof utils.matchesValfriRule === 'function') {
      try {
        return Boolean(utils.matchesValfriRule(token.item, rawRule));
      } catch {}
    }
    const type = normalizeType(rawRule.typ);
    if (type && !matchesType(token.item, type)) return false;
    if (typeof utils.matchesTagRule === 'function') {
      try {
        return Boolean(utils.matchesTagRule(token.item, rawRule));
      } catch {}
    }
    return false;
  }

  function parseSpecificRules(krav) {
    return toArray(krav?.specifikt_val).map((rule, idx) => {
      const alternatives = toArray(rule?.alternativ)
        .map(normalizeAlternative)
        .filter(Boolean)
        .filter(alt => {
          const type = normalizeType(alt.typ);
          return type !== 'Fördel' && type !== 'Nackdel';
        });
      const hasMinCount = rule?.min_antal !== undefined && rule?.min_antal !== null && String(rule.min_antal).trim() !== '';
      const minCount = hasMinCount ? Math.max(0, toInt(rule.min_antal, 0)) : 1;
      return {
        idx,
        alternatives,
        requiredErf: toInt(rule?.krav_erf, 0),
        minCount
      };
    });
  }

  function parseValfriRules(krav) {
    return toArray(krav?.valfri_inom_tagg).map((rule, idx) => ({
      idx,
      taggfalt: String(rule?.taggfalt || '').trim(),
      taggar: toArray(rule?.taggar).map(value => String(value || '').trim()).filter(Boolean),
      typ: normalizeType(rule?.typ),
      requiredErf: toInt(rule?.krav_erf, 0)
    }));
  }

  function parsePrimaryNames(krav) {
    const fromList = toArray(krav?.primarformaga?.namn_lista)
      .map(value => String(value || '').trim())
      .filter(Boolean);
    if (fromList.length) return fromList;
    const rawName = krav?.primarformaga?.namn;
    if (Array.isArray(rawName)) {
      return rawName
        .map(value => String(value || '').trim())
        .filter(Boolean);
    }
    const one = String(rawName || '').trim();
    return one ? [one] : [];
  }

  function parsePrimaryAlternatives(krav) {
    const alternatives = toArray(krav?.primarformaga?.alternativ)
      .map(normalizeAlternative)
      .filter(Boolean);
    if (alternatives.length) return alternatives;
    return parsePrimaryNames(krav).map(name => ({ typ: '', namn: name }));
  }

  function primaryAlternativeLabel(alternative) {
    const name = String(alternative?.namn || '').trim();
    const type = normalizeType(alternative?.typ);
    if ((name === '*' || normalizeKey(name) === 'valfri') && type) return `Valfri ${type.toLowerCase()}`;
    return name;
  }

  function alternativesLabel(alternatives = []) {
    const names = alternatives
      .map(alt => String(alt?.namn || '').trim())
      .filter(Boolean);
    if (!names.length) return 'Specifikt val';
    if (names.length === 1) return names[0];
    return names.join(' eller ');
  }

  function valfriLabel(rule = {}) {
    const tags = toArray(rule.taggar).map(tag => String(tag || '').trim()).filter(Boolean).join(', ');
    if (tags) return `Valfri inom tagg: ${tags}`;
    return 'Valfri inom tagg';
  }

  function annotateRequiredShare(sources = [], requiredErf = 0) {
    let remaining = Math.max(0, Number(requiredErf) || 0);
    return toArray(sources).map(raw => {
      const usedErf = Math.max(0, Number(raw?.usedErf) || 0);
      const appliedErf = Math.min(remaining, usedErf);
      remaining = Math.max(0, remaining - appliedErf);
      return {
        ...raw,
        usedErf,
        appliedErf,
        overflowErf: Math.max(0, usedErf - appliedErf)
      };
    });
  }

  function checkNamedSet(list, config, type) {
    const names = toArray(config?.namn).map(name => String(name || '').trim()).filter(Boolean);
    const minCount = toInt(config?.min_antal, 0);
    if (!names.length || minCount <= 0) {
      return { ok: true, missing: '', count: 0, required: minCount };
    }
    const wanted = new Set(names.map(normalizeKey));
    const count = toArray(list).reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum;
      if (!wanted.has(normalizeKey(item?.namn))) return sum;
      if (type && !matchesType(item, type)) return sum;
      return sum + 1;
    }, 0);
    if (count >= minCount) {
      return { ok: true, missing: '', count, required: minCount };
    }
    if (minCount === 1) {
      return {
        ok: false,
        missing: names.length === 1 ? names[0] : names.join(' eller '),
        count,
        required: minCount
      };
    }
    return {
      ok: false,
      missing: `Specifika ${normalizeType(type).toLowerCase()} (${count}/${minCount} val)`,
      count,
      required: minCount
    };
  }

  function evaluate(entry, list) {
    const pcList = toArray(list);
    const krav = getKrav(entry);
    const tokens = buildTokens(pcList);

    const totalRequired = toInt(krav?.total_erf, 0);
    const totalErf = tokens.reduce((sum, token) => {
      if (token.isBenefit || token.isDrawback) return sum;
      return sum + token.xp;
    }, 0);
    const totalMissing = Math.max(0, totalRequired - totalErf);

    const primaryNames = parsePrimaryNames(krav);
    const primaryAlternatives = parsePrimaryAlternatives(krav);
    const primaryRequiredErf = toInt(krav?.primarformaga?.krav_erf, 0);
    const primaryMatches = tokens.filter(token =>
      !token.isBenefit
      && !token.isDrawback
      && primaryAlternatives.some(alternative => matchesAlternative(token, alternative))
    );
    const primaryHintedMatches = primaryMatches.filter(token => normalizeSourceHint(token.sourceHint) === 'primarformaga');
    const primaryPool = primaryHintedMatches.length ? primaryHintedMatches : primaryMatches;
    const primaryBestToken = primaryPool
      .slice()
      .sort((a, b) => b.xp - a.xp)[0] || null;
    const primarySelectedErf = Math.max(0, Number(primaryBestToken?.xp) || 0);
    const primaryTokenId = String(primaryBestToken?.id || '').trim();
    const primarySelectedAlternative = primaryBestToken
      ? primaryAlternatives.find(alternative => matchesAlternative(primaryBestToken, alternative))
      : null;
    const primaryOk = primaryAlternatives.length > 0 && (primarySelectedErf >= primaryRequiredErf);
    const primaryMissing = Math.max(0, primaryRequiredErf - primarySelectedErf);
    const countsPrimaryBaseline = Boolean(krav?.primarformaga?.counts_primary_baseline);
    let primaryBaselineUsed = false;

    const specificRules = parseSpecificRules(krav);
    const tokenById = new Map(tokens.map(token => [token.id, token]));
    const assignedTokenIds = new Set();
    const overflowByToken = new Map();
    const specificRowsWork = specificRules.map(rule => ({
      idx: rule.idx,
      alternatives: toArray(rule.alternatives),
      requiredErf: Math.max(0, Number(rule.requiredErf) || 0),
      requiredCount: Math.max(0, Number(rule.minCount) || 0),
      candidateCount: 0,
      primaryCreditErf: 0,
      primaryTokenId: '',
      pickedIds: [],
      selectedCount: 0,
      selectedErf: 0
    }));

    const specificCandidates = tokens
      .filter(token =>
        token.xp > 0
        && !token.isBenefit
        && !token.isDrawback
        && token.id !== primaryTokenId
      );

    const matchedRowsByToken = new Map();
    specificCandidates.forEach(token => {
      const sourceHint = normalizeSourceHint(token.sourceHint);
      const forcedSpecificIdx = parseSourceIndex(sourceHint, 'specifikt_val');
      if (sourceHint && forcedSpecificIdx < 0) return;
      const rowIdxs = [];
      specificRowsWork.forEach((row, rowIdx) => {
        if (forcedSpecificIdx >= 0 && rowIdx !== forcedSpecificIdx) return;
        if (row.alternatives.some(alt => matchesAlternative(token, alt))) {
          rowIdxs.push(rowIdx);
        }
      });
      if (rowIdxs.length) matchedRowsByToken.set(token.id, rowIdxs);
    });

    specificRowsWork.forEach((row, rowIdx) => {
      let count = 0;
      matchedRowsByToken.forEach(rowIdxs => {
        if (rowIdxs.includes(rowIdx)) count += 1;
      });
      row.candidateCount = count;
    });

    if (countsPrimaryBaseline && primaryBestToken) {
      const primarySpecificRow = specificRowsWork.find(row =>
        row
        && row.requiredErf > 0
        && toArray(row.alternatives).some(alt => matchesAlternative(primaryBestToken, alt))
      );
      if (primarySpecificRow) {
        const creditedErf = Math.min(primarySelectedErf, primarySpecificRow.requiredErf);
        primarySpecificRow.primaryCreditErf = creditedErf;
        primarySpecificRow.primaryTokenId = primaryTokenId;
        primarySpecificRow.selectedCount += 1;
        primarySpecificRow.selectedErf += creditedErf;
        primaryBaselineUsed = true;
      }
    }

    const assignables = specificCandidates
      .filter(token => matchedRowsByToken.has(token.id))
      .sort((a, b) => {
        const aFlex = toArray(matchedRowsByToken.get(a.id)).length;
        const bFlex = toArray(matchedRowsByToken.get(b.id)).length;
        if (aFlex !== bFlex) return aFlex - bFlex;
        return b.xp - a.xp;
      });

    assignables.forEach(token => {
      const rowIndexes = toArray(matchedRowsByToken.get(token.id));
      if (!rowIndexes.length) return;

      let bestRow = null;
      let bestScore = -Infinity;
      rowIndexes.forEach(rowIdx => {
        const row = specificRowsWork[rowIdx];
        if (!row) return;

        const needCount = Math.max(0, row.requiredCount - row.selectedCount);
        const needErf = Math.max(0, row.requiredErf - row.selectedErf);
        const erfGain = Math.min(token.xp, needErf);
        const countGain = needCount > 0 ? 1 : 0;
        const scarcity = row.candidateCount > 0 ? (1_000 / row.candidateCount) : 0;
        let score = (erfGain * 100_000) + (countGain * 10_000) + scarcity;
        score += Math.min(token.xp, Math.max(0, row.requiredErf));
        if (erfGain <= 0 && countGain <= 0) score += 1;
        score -= row.idx * 0.001;

        if (score > bestScore) {
          bestScore = score;
          bestRow = row;
        }
      });

      if (!bestRow) return;
      bestRow.pickedIds.push(token.id);
      bestRow.selectedCount += 1;
      bestRow.selectedErf += token.xp;
      assignedTokenIds.add(token.id);
    });

    const specificRows = specificRowsWork.map(row => {
      const ok = row.alternatives.length > 0
        && row.requiredErf > 0
        && row.selectedCount >= row.requiredCount
        && row.selectedErf >= row.requiredErf;

      if (ok) {
        let remainingRequired = row.requiredErf;
        const pickedTokens = toArray(row.pickedIds)
          .map(id => tokenById.get(id))
          .filter(Boolean)
          .sort((a, b) => b.xp - a.xp);

        pickedTokens.forEach(token => {
          const appliedErf = Math.min(remainingRequired, token.xp);
          remainingRequired = Math.max(0, remainingRequired - appliedErf);
          const overflowErf = Math.max(0, token.xp - appliedErf);
          if (overflowErf <= 0) return;
          overflowByToken.set(token.id, (overflowByToken.get(token.id) || 0) + overflowErf);
        });
      }

      return {
        idx: row.idx,
        alternatives: row.alternatives,
        requiredErf: row.requiredErf,
        requiredCount: row.requiredCount,
        candidateCount: row.candidateCount,
        selectedCount: row.selectedCount,
        selectedErf: row.selectedErf,
        ok,
        missingCount: Math.max(0, row.requiredCount - row.selectedCount),
        missingErf: Math.max(0, row.requiredErf - row.selectedErf),
        primaryCreditErf: row.primaryCreditErf,
        primaryTokenId: row.primaryTokenId,
        pickedIds: row.pickedIds.slice()
      };
    });

    const valfriRules = parseValfriRules(krav);
    const hasValfriRules = valfriRules.some(rule => rule.taggfalt && rule.taggar.length && rule.requiredErf > 0);
    const tokenEligibleForSpecific = new Set(matchedRowsByToken.keys());

    let optionalFromSpecificBypass = 0;
    const optionalSpecificBypassSources = [];
    const overflowRemaining = new Map();
    overflowByToken.forEach((value, key) => {
      const amount = Math.max(0, Number(value) || 0);
      if (amount <= 0) return;
      const token = tokens.find(row => row.id === key);
      if (!token) return;
      const matchesAnyValfri = hasValfriRules && valfriRules.some(rule => {
        const normalizedRule = {
          taggfalt: rule.taggfalt,
          taggar: rule.taggar,
          typ: rule.typ,
          krav_erf: rule.requiredErf
        };
        return matchesValfriRule(token, normalizedRule);
      });
      if (!matchesAnyValfri) {
        optionalFromSpecificBypass += amount;
        optionalSpecificBypassSources.push({
          tokenId: token.id,
          name: token.name,
          usedErf: amount,
          reason: 'specifikt_val->valfritt (ingen taggmatch)'
        });
        return;
      }
      overflowRemaining.set(key, amount);
    });

    const freePool = new Map();
    tokens.forEach(token => {
      if (token.xp <= 0) return;
      if (token.isBenefit || token.isDrawback) return;
      if (token.id === primaryTokenId) return;
      if (assignedTokenIds.has(token.id)) return;
      // Tokens tied to specifikt_val are reserved until they fulfill that step.
      if (tokenEligibleForSpecific.has(token.id)) return;
      freePool.set(token.id, token.xp);
    });

    const valfriRowsWork = valfriRules.map(rule => {
      const requiredErf = Math.max(0, Number(rule.requiredErf) || 0);
      return {
        idx: rule.idx,
        requiredErf,
        taggfalt: rule.taggfalt,
        taggar: rule.taggar,
        typ: rule.typ,
        normalizedRule: {
          taggfalt: rule.taggfalt,
          taggar: rule.taggar,
          typ: rule.typ,
          krav_erf: requiredErf
        },
        selectedFromPrimary: 0,
        selectedFromOverflow: 0,
        selectedFromPool: 0,
        primarySources: [],
        overflowSources: [],
        poolSources: []
      };
    });

    if (countsPrimaryBaseline && primaryBestToken && !primaryBaselineUsed) {
      const primaryValfriRow = valfriRowsWork.find(row =>
        row
        && row.requiredErf > 0
        && row.taggfalt
        && toArray(row.taggar).length
        && matchesValfriRule(primaryBestToken, row.normalizedRule)
      );
      if (primaryValfriRow) {
        const creditedErf = Math.min(primarySelectedErf, primaryValfriRow.requiredErf);
        primaryValfriRow.selectedFromPrimary = creditedErf;
        primaryValfriRow.primarySources = [{
          tokenId: primaryTokenId,
          name: primaryBestToken.name,
          usedErf: creditedErf,
          reason: 'primarformaga->baseline'
        }];
        primaryBaselineUsed = true;
      }
    }

    const valfriRemainingNeed = (row) => Math.max(
      0,
      (Math.max(0, Number(row?.requiredErf) || 0))
      - (Math.max(0, Number(row?.selectedFromOverflow) || 0) + Math.max(0, Number(row?.selectedFromPool) || 0))
    );

    function addValfriSource(row, sourceKind, token, usedErf, availableErf) {
      const used = Math.max(0, Number(usedErf) || 0);
      if (!row || !token || used <= 0) return;
      const selectedKey = sourceKind === 'overflow' ? 'selectedFromOverflow' : 'selectedFromPool';
      const listKey = sourceKind === 'overflow' ? 'overflowSources' : 'poolSources';
      const availableKey = sourceKind === 'overflow' ? 'availableOverflowErf' : 'availableErf';
      row[selectedKey] += used;
      const list = toArray(row[listKey]);
      const existing = list.find(entry => String(entry?.tokenId || '') === String(token.id || ''));
      if (existing) {
        existing.usedErf = Math.max(0, Number(existing.usedErf) || 0) + used;
        existing[availableKey] = Math.max(
          Math.max(0, Number(existing[availableKey]) || 0),
          Math.max(0, Number(availableErf) || 0),
          existing.usedErf
        );
        return;
      }
      list.push({
        tokenId: token.id,
        name: token.name,
        usedErf: used,
        [availableKey]: Math.max(0, Number(availableErf) || 0)
      });
      row[listKey] = list;
    }

    function allocateValfriFromMap(sourceMap, sourceKind) {
      if (!(sourceMap instanceof Map) || !valfriRowsWork.length) return;

      const matchesByToken = new Map();
      const candidateCountByRow = new Map();
      sourceMap.forEach((rawValue, tokenId) => {
        const available = Math.max(0, Number(rawValue) || 0);
        if (available <= 0) return;
        const token = tokenById.get(tokenId);
        if (!token) return;
        const rowIndexes = [];
        valfriRowsWork.forEach((row, rowIdx) => {
          if (row.requiredErf <= 0) return;
          if (!row.taggfalt || !toArray(row.taggar).length) return;
          if (!matchesValfriRule(token, row.normalizedRule)) return;
          rowIndexes.push(rowIdx);
        });
        if (!rowIndexes.length) return;
        matchesByToken.set(tokenId, rowIndexes);
        rowIndexes.forEach(idx => {
          candidateCountByRow.set(idx, (candidateCountByRow.get(idx) || 0) + 1);
        });
      });

      const tokenOrder = Array.from(matchesByToken.keys()).sort((a, b) => {
        const aFlex = toArray(matchesByToken.get(a)).length;
        const bFlex = toArray(matchesByToken.get(b)).length;
        if (aFlex !== bFlex) return aFlex - bFlex;
        return (sourceMap.get(b) || 0) - (sourceMap.get(a) || 0);
      });

      tokenOrder.forEach(tokenId => {
        let remaining = Math.max(0, Number(sourceMap.get(tokenId)) || 0);
        if (remaining <= 0) {
          sourceMap.delete(tokenId);
          return;
        }
        const token = tokenById.get(tokenId);
        if (!token) return;
        const rowIndexes = toArray(matchesByToken.get(tokenId));
        if (!rowIndexes.length) return;

        const originalAvailable = remaining;
        while (remaining > 0) {
          const needyRows = rowIndexes.filter(idx => valfriRemainingNeed(valfriRowsWork[idx]) > 0);
          if (needyRows.length) {
            const bestRowIdx = needyRows.slice().sort((a, b) => {
              const needDiff = valfriRemainingNeed(valfriRowsWork[b]) - valfriRemainingNeed(valfriRowsWork[a]);
              if (needDiff !== 0) return needDiff;
              const aCandidates = candidateCountByRow.get(a) || Number.MAX_SAFE_INTEGER;
              const bCandidates = candidateCountByRow.get(b) || Number.MAX_SAFE_INTEGER;
              if (aCandidates !== bCandidates) return aCandidates - bCandidates;
              return a - b;
            })[0];
            const bestRow = valfriRowsWork[bestRowIdx];
            const need = valfriRemainingNeed(bestRow);
            const used = Math.min(remaining, need);
            if (used <= 0) break;
            addValfriSource(bestRow, sourceKind, token, used, originalAvailable);
            remaining -= used;
            continue;
          }

          const spillRowIdx = rowIndexes.slice().sort((a, b) => {
            const reqDiff = (valfriRowsWork[b]?.requiredErf || 0) - (valfriRowsWork[a]?.requiredErf || 0);
            if (reqDiff !== 0) return reqDiff;
            return a - b;
          })[0];
          const spillRow = valfriRowsWork[spillRowIdx];
          if (!spillRow) break;
          addValfriSource(spillRow, sourceKind, token, remaining, originalAvailable);
          remaining = 0;
        }

        sourceMap.delete(tokenId);
      });
    }

    // Priority chain: specifikt_val overflow -> valfri_inom_tagg -> valfritt
    allocateValfriFromMap(overflowRemaining, 'overflow');
    allocateValfriFromMap(freePool, 'pool');

    let optionalFromValfriOverflow = 0;
    const optionalValfriOverflowSources = [];
    const valfriRows = valfriRowsWork.map(row => {
      const requiredErf = Math.max(0, Number(row.requiredErf) || 0);
      const selectedFromPrimary = Math.max(0, Number(row.selectedFromPrimary) || 0);
      const selectedFromOverflow = Math.max(0, Number(row.selectedFromOverflow) || 0);
      const selectedFromPool = Math.max(0, Number(row.selectedFromPool) || 0);
      const selectedErf = selectedFromPrimary + selectedFromOverflow + selectedFromPool;
      const ok = requiredErf <= 0 || selectedErf >= requiredErf;
      const overflowAnnotated = annotateRequiredShare(row.overflowSources, Math.max(0, requiredErf - selectedFromPrimary));
      const overflowApplied = overflowAnnotated.reduce((sum, source) => sum + Math.max(0, Number(source?.appliedErf) || 0), 0);
      const poolAnnotated = annotateRequiredShare(row.poolSources, Math.max(0, requiredErf - selectedFromPrimary - overflowApplied));
      const rowOverflowErf = Math.max(0, selectedErf - requiredErf);
      if (rowOverflowErf > 0) {
        optionalFromValfriOverflow += rowOverflowErf;
        const rowOverflowParts = overflowAnnotated
          .concat(poolAnnotated)
          .filter(source => Math.max(0, Number(source?.overflowErf) || 0) > 0)
          .map(source => ({
            tokenId: source.tokenId,
            name: source.name,
            usedErf: Math.max(0, Number(source?.overflowErf) || 0),
            reason: `valfri_inom_tagg[${row.idx}]->valfritt`
          }));
        optionalValfriOverflowSources.push(...rowOverflowParts);
      }

      return {
        idx: row.idx,
        requiredErf,
        selectedErf,
        ok,
        missingErf: Math.max(0, requiredErf - selectedErf),
        taggfalt: row.taggfalt,
        taggar: row.taggar,
        typ: row.typ,
        selectedFromPrimary,
        selectedFromOverflow,
        selectedFromPool,
        overflowErf: rowOverflowErf,
        primarySources: row.primarySources,
        overflowSources: overflowAnnotated,
        poolSources: poolAnnotated
      };
    });

    const optionalRequiredErf = toInt(krav?.valfritt?.krav_erf, 0);
    let optionalFromSpecificRemainder = 0;
    const optionalSpecificRemainderSources = [];
    overflowRemaining.forEach((value, key) => {
      const amount = Math.max(0, Number(value) || 0);
      if (amount <= 0) return;
      const token = tokens.find(row => row.id === key);
      optionalFromSpecificRemainder += amount;
      optionalSpecificRemainderSources.push({
        tokenId: key,
        name: token?.name || '',
        usedErf: amount,
        reason: 'specifikt_val->valfritt (kvarvarande overflow)'
      });
    });

    let optionalFromPool = 0;
    const optionalPoolSources = [];
    freePool.forEach((value, key) => {
      const amount = Math.max(0, Number(value) || 0);
      if (amount <= 0) return;
      const token = tokens.find(row => row.id === key);
      optionalFromPool += amount;
      optionalPoolSources.push({
        tokenId: key,
        name: token?.name || '',
        usedErf: amount,
        reason: 'valfritt direkt'
      });
    });

    const optionalSelectedFromOverflow = optionalFromSpecificBypass + optionalFromSpecificRemainder + optionalFromValfriOverflow;
    const optionalSelectedErf = optionalSelectedFromOverflow + optionalFromPool;
    const optionalMissing = Math.max(0, optionalRequiredErf - optionalSelectedErf);
    const optionalOk = optionalSelectedErf >= optionalRequiredErf;

    const specificBenefits = checkNamedSet(pcList, krav?.specifika_fordelar, 'Fördel');
    const specificDrawbacks = checkNamedSet(pcList, krav?.specifika_nackdelar, 'Nackdel');

    const missing = [];
    if (totalMissing > 0) {
      missing.push(`Total ERF exkl. Fördel/Nackdel (${totalErf}/${totalRequired} ERF)`);
    }
    if (!primaryOk) {
      const primaryLabels = primaryAlternatives
        .map(primaryAlternativeLabel)
        .filter(Boolean);
      const label = primaryLabels.length > 1
        ? primaryLabels.join(' eller ')
        : (primaryLabels[0] || 'Primärförmåga');
      missing.push(`${label} (${primarySelectedErf}/${primaryRequiredErf} ERF)`);
    }

    specificRows.forEach(row => {
      if (row.ok) return;
      const label = alternativesLabel(row.alternatives);
      if (row.requiredCount > 1) {
        missing.push(`${label} (${row.selectedCount}/${row.requiredCount} val, ${row.selectedErf}/${row.requiredErf} ERF)`);
        return;
      }
      missing.push(`${label} (${row.selectedErf}/${row.requiredErf} ERF)`);
    });

    valfriRows.forEach(row => {
      if (row.ok) return;
      missing.push(`${valfriLabel(row)} (${row.selectedErf}/${row.requiredErf} ERF)`);
    });

    if (!optionalOk) {
      missing.push(`Valfritt (${optionalSelectedErf}/${optionalRequiredErf} ERF)`);
    }

    if (!specificBenefits.ok && specificBenefits.missing) missing.push(specificBenefits.missing);
    if (!specificDrawbacks.ok && specificDrawbacks.missing) missing.push(specificDrawbacks.missing);

    return {
      ok: missing.length === 0,
      missing,
      master: primaryOk,
      primary: primaryOk,
      profile: {
        total: {
          selectedErf: totalErf,
          requiredErf: totalRequired,
          missingErf: totalMissing
        },
        primary: {
          names: primaryAlternatives.map(primaryAlternativeLabel).filter(Boolean),
          name: primaryAlternativeLabel(primarySelectedAlternative || primaryAlternatives[0]) || '',
          selectedErf: primarySelectedErf,
          requiredErf: primaryRequiredErf,
          missingErf: primaryMissing,
          ok: primaryOk
        },
        specifikt_val: specificRows,
        valfri_inom_tagg: valfriRows,
        valfritt: {
          selectedErf: optionalSelectedErf,
          selectedFromOverflow: optionalSelectedFromOverflow,
          selectedFromPool: optionalFromPool,
          overflowSources: optionalSpecificBypassSources
            .concat(optionalSpecificRemainderSources)
            .concat(optionalValfriOverflowSources),
          poolSources: optionalPoolSources,
          requiredErf: optionalRequiredErf,
          missingErf: optionalMissing,
          ok: optionalOk
        },
        specifika_fordelar: specificBenefits,
        specifika_nackdelar: specificDrawbacks
      }
    };
  }

  function check(entry, list){
    return evaluate(entry, list);
  }

  function minXP(entry, list){
    try {
      const result = evaluate(entry, list);
      const profile = result?.profile || {};
      const specificMissing = toArray(profile.specifikt_val)
        .reduce((sum, row) => {
          const missingErf = Math.max(0, Number(row?.missingErf) || 0);
          const missingCount = Math.max(0, Number(row?.missingCount) || 0);
          // A missing specific pick costs at least 10 ERF in practice.
          const countFloor = missingCount * 10;
          return sum + Math.max(missingErf, countFloor);
        }, 0);
      const valfriMissing = toArray(profile.valfri_inom_tagg)
        .reduce((sum, row) => sum + Math.max(0, Number(row?.missingErf) || 0), 0);
      const primaryMissing = Math.max(0, Number(profile?.primary?.missingErf) || 0);
      const totalMissing = Math.max(0, Number(profile?.total?.missingErf) || 0);
      const optionalMissing = Math.max(0, Number(profile?.valfritt?.missingErf) || 0);
      // Heuristic: avoid double counting overlaps between non-primary requirements.
      // Primary remains isolated from non-primary flows.
      const nonPrimaryNeed = Math.max(optionalMissing, specificMissing, valfriMissing);
      return Math.max(0, Math.max(totalMissing, primaryMissing + nonPrimaryNeed));
    } catch {
      return 50;
    }
  }

  function isElite(entry){
    return entryHasType(entry, 'Elityrke');
  }

  function canChange(list){
    const entries = toArray(list);
    const elites = entries.filter(isElite);
    return elites.every(el => check(el, entries).ok);
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
