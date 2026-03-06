(function(window){
  const RULE_KEYS = Object.freeze(['andrar', 'kraver', 'krockar', 'ger', 'val']);
  const DEFAULT_LEVEL_ORDER = Object.freeze(['novis', 'gesall', 'mastare']);
  const LEVEL_VALUE_MAP = Object.freeze({
    novis: 1,
    enkel: 1,
    gesall: 2,
    ordinar: 2,
    mastare: 3,
    avancerad: 3
  });
  const TRADITION_ALIAS_MAP = Object.freeze({
    haxa: 'Häxkonst',
    haxkonst: 'Häxkonst',
    haxkonster: 'Häxkonst',
    andebesvarjare: 'Häxkonst',
    gronvavare: 'Häxkonst',
    ordensmagiker: 'Ordensmagi',
    ordensmagi: 'Ordensmagi',
    demonolog: 'Ordensmagi',
    illusionist: 'Ordensmagi',
    mentalist: 'Ordensmagi',
    pyromantiker: 'Ordensmagi',
    stavmagiker: 'Stavmagi',
    stavmagi: 'Stavmagi',
    teurg: 'Teurgi',
    teurgi: 'Teurgi',
    inkvisitor: 'Teurgi',
    sjalasorjare: 'Teurgi',
    trollsang: 'Trollsång',
    trollsangare: 'Trollsång',
    symbolist: 'Symbolism',
    symbolism: 'Symbolism',
    svartkonst: 'Svartkonst',
    svartkonstnar: 'Svartkonst',
    nekromantiker: 'Svartkonst'
  });

  const MAL_REGISTRY = new Map();

  function registerMal(mal, handler) {
    MAL_REGISTRY.set(String(mal), handler);
  }

  function queryMal(list, mal, context) {
    const entries = Array.isArray(list) ? list : [];
    const ctx = context || {};
    const handler = MAL_REGISTRY.get(String(mal));
    if (!handler) return getListRules(entries, { key: 'andrar', mal });
    return handler(entries, ctx);
  }

  function cloneRuleValue(value) {
    if (Array.isArray(value)) return value.map(cloneRuleValue);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    Object.keys(value).forEach(key => {
      const next = value[key];
      if (next === undefined) return;
      out[key] = cloneRuleValue(next);
    });
    return out;
  }

  function normalizeLevelName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function toRuleList(value) {
    if (value === undefined || value === null) return [];
    const list = Array.isArray(value) ? value : [value];
    return list
      .filter(item => item !== undefined && item !== null)
      .map(cloneRuleValue);
  }

  function toTagList(value) {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
      return value
        .flatMap(item => toTagList(item))
        .filter(Boolean);
    }
    return String(value)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  function normalizeRuleBlock(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    RULE_KEYS.forEach(key => {
      const list = toRuleList(raw[key]);
      if (list.length) out[key] = list;
    });
    return out;
  }

  function mergeRuleBlocks() {
    const out = {};
    Array.from(arguments).forEach(block => {
      if (!block || typeof block !== 'object') return;
      RULE_KEYS.forEach(key => {
        const list = toRuleList(block[key]);
        if (!list.length) return;
        if (!out[key]) out[key] = [];
        out[key].push(...list);
      });
    });
    return out;
  }

  function getLevelDataMap(entry) {
    const tags = entry?.taggar;
    if (!tags || typeof tags !== 'object') return null;
    return tags.nivå_data || tags.niva_data || null;
  }

  function findLevelData(entry, level) {
    const levelData = getLevelDataMap(entry);
    if (!levelData || typeof levelData !== 'object') return null;
    const wanted = normalizeLevelName(level);
    if (!wanted) return null;
    const exactKey = Object.keys(levelData).find(key => normalizeLevelName(key) === wanted);
    return exactKey ? levelData[exactKey] : null;
  }

  function getTopLevelRules(entry) {
    return normalizeRuleBlock(entry?.taggar?.regler);
  }

  function getLevelRules(entry, level) {
    const levelData = getLevelDataMap(entry);
    if (!levelData || typeof levelData !== 'object') return {};
    const wanted = normalizeLevelName(level);
    if (!wanted) return {};

    const configuredOrder = Array.isArray(window.LVL) && window.LVL.length
      ? window.LVL.map(normalizeLevelName).filter(Boolean)
      : DEFAULT_LEVEL_ORDER;
    const order = configuredOrder.length ? configuredOrder : DEFAULT_LEVEL_ORDER;
    const wantedIndex = order.indexOf(wanted);

    if (wantedIndex === -1) {
      return normalizeRuleBlock(findLevelData(entry, level)?.regler);
    }

    const blocks = Object.keys(levelData)
      .map(key => ({ key, index: order.indexOf(normalizeLevelName(key)) }))
      .filter(item => item.index !== -1 && item.index <= wantedIndex)
      .sort((a, b) => a.index - b.index)
      .map(item => normalizeRuleBlock(levelData[item.key]?.regler));

    return mergeRuleBlocks.apply(null, blocks);
  }

  function entryHasInlineRules(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (RULE_KEYS.some(key => toRuleList(entry?.taggar?.regler?.[key]).length > 0)) {
      return true;
    }
    const levelData = getLevelDataMap(entry);
    if (!levelData || typeof levelData !== 'object') return false;
    return Object.keys(levelData).some(levelName =>
      RULE_KEYS.some(key => toRuleList(levelData[levelName]?.regler?.[key]).length > 0)
    );
  }

  function resolveRuleSourceEntry(entry) {
    if (!entry || typeof entry !== 'object') return entry;
    if (entryHasInlineRules(entry)) return entry;
    if (typeof window.lookupEntry !== 'function') return entry;

    const query = {};
    if (entry.id !== undefined && entry.id !== null) query.id = entry.id;
    if (typeof entry.namn === 'string' && entry.namn.trim()) query.name = entry.namn;
    if (!Object.keys(query).length) return entry;

    try {
      const hit = window.lookupEntry(query);
      if (hit && typeof hit === 'object') {
        const extendsName = typeof hit.taggar?.extends === 'string' ? hit.taggar.extends.trim() : '';
        if (extendsName) {
          try {
            const base = window.lookupEntry({ name: extendsName });
            if (base && typeof base === 'object') {
              return {
                ...hit,
                taggar: {
                  ...hit.taggar,
                  regler: mergeRuleBlocks(base.taggar?.regler || {}, hit.taggar?.regler || {})
                }
              };
            }
          } catch (_) { /* ignore base lookup errors */ }
        }
        return hit;
      }
    } catch (_) {
      // Ignore lookup errors and keep the original entry as source.
    }

    return entry;
  }

  function getEntryRules(entry, options = {}) {
    const level = options && typeof options === 'object' ? options.level : '';
    const sourceEntry = resolveRuleSourceEntry(entry);
    if (!level) return getTopLevelRules(sourceEntry);
    return mergeRuleBlocks(getTopLevelRules(sourceEntry), getLevelRules(sourceEntry, level));
  }

  function getRuleList(entry, key, options = {}) {
    if (!RULE_KEYS.includes(key)) return [];
    return toRuleList(getEntryRules(entry, options)[key]);
  }

  function getListRules(list, options = {}) {
    const keyFilter = typeof options.key === 'string' ? options.key : '';
    const targetFilter = typeof options.mal === 'string' ? options.mal : '';
    const out = [];

    (Array.isArray(list) ? list : []).forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const sourceName = typeof entry.namn === 'string' ? entry.namn.trim() : '';
      const sourceLevel = typeof entry.nivå === 'string' ? entry.nivå.trim() : '';
      const rules = getEntryRules(entry, { level: sourceLevel });
      RULE_KEYS.forEach(key => {
        if (keyFilter && key !== keyFilter) return;
        toRuleList(rules[key]).forEach(rule => {
          if (targetFilter && String(rule?.mal || '') !== targetFilter) return;
          out.push({
            ...cloneRuleValue(rule),
            sourceEntryId: entry.id,
            sourceEntryName: sourceName,
            sourceEntryLevel: sourceLevel,
            sourceEntry: entry
          });
        });
      });
    });

    return out;
  }

  function getTraitRuleCandidates(list, mal, context = {}) {
    const entries = Array.isArray(list) ? list : [];
    const seen = new Set();
    const out = [];
    getListRules(entries, { key: 'andrar', mal }).forEach(rule => {
      if (String(rule?.satt || '') !== 'ersatt') return;
      if (!evaluateNar(rule?.nar, { list: entries, ...context })) return;
      const trait = String(rule?.varde || '').trim();
      if (!trait || seen.has(trait)) return;
      seen.add(trait);
      out.push(trait);
    });
    return out;
  }

  function getDefenseTraitRuleCandidates(list, context = {}) {
    return getTraitRuleCandidates(list, 'forsvar_karaktarsdrag', context);
  }

  function getAttackTraitRuleCandidates(list, context = {}) {
    const entries = Array.isArray(list) ? list : [];
    const seen = new Set();
    const out = [];
    getListRules(entries, { key: 'andrar', mal: 'anfall_karaktarsdrag' }).forEach(rule => {
      if (String(rule?.satt || '') !== 'ersatt') return;
      if (!evaluateNar(rule?.nar, { list: entries, ...context })) return;
      const trait = String(rule?.varde || '').trim();
      if (!trait || seen.has(trait)) return;
      seen.add(trait);
      out.push(trait);
    });
    return out;
  }

  function getDancingDefenseTraitRuleCandidates(list, context = {}) {
    return getTraitRuleCandidates(list, 'dansande_forsvar_karaktarsdrag', context);
  }

  function hasPermanentCorruptionHalving(list) {
    return getListRules(list, { key: 'andrar', mal: 'permanent_korruption_halvera' }).length > 0;
  }

  /** @deprecated Use getMissingRequirementReasonsForCandidate with kraver/nagon_av_namn instead. */
  function getMonstruosTraitPermissions(_list) {
    return { allowAll: false, allowedNames: new Set() };
  }

  function normalizeRuleQuantity(value, fallback = 1) {
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, num);
  }

  function getInventoryGrantItems(list) {
    const aggregate = new Map();

    getListRules(list, { key: 'ger', mal: 'foremal' }).forEach(rule => {
      if (!matchesListCondition(rule, list)) return;
      const sourceName = String(rule?.sourceEntryName || '').trim();
      const sourceId = rule?.sourceEntryId === undefined || rule?.sourceEntryId === null
        ? ''
        : String(rule.sourceEntryId).trim();
      const sourceKey = sourceName || sourceId;
      if (!sourceKey) return;

      toArray(rule?.foremal).forEach(item => {
        const raw = (item && typeof item === 'object')
          ? item
          : (typeof item === 'string' ? { id: item } : null);
        if (!raw) return;

        const id = raw.id === undefined || raw.id === null
          ? ''
          : String(raw.id).trim();
        const name = typeof raw.namn === 'string'
          ? raw.namn.trim()
          : (typeof raw.name === 'string' ? raw.name.trim() : '');
        if (!id && !name) return;

        const qty = normalizeRuleQuantity(raw.antal ?? raw.qty ?? raw.varde, 1);
        if (!qty) return;

        const itemKey = id
          ? `id:${id}`
          : `name:${normalizeLevelName(name)}`;
        if (!itemKey) return;

        const aggregateKey = `${sourceKey}|${itemKey}`;
        if (!aggregate.has(aggregateKey)) {
          aggregate.set(aggregateKey, {
            id: id || undefined,
            name,
            qty: 0,
            sourceEntryId: sourceId,
            sourceEntryName: sourceName,
            sourceEntryLevel: String(rule?.sourceEntryLevel || '').trim()
          });
        }
        aggregate.get(aggregateKey).qty += qty;
      });
    });

    return Array.from(aggregate.values()).filter(item => item.qty > 0);
  }

  function parseEntryGrantRef(raw) {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') {
      const name = raw.trim();
      return name ? { id: '', name } : null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id === undefined || raw.id === null
      ? ''
      : String(raw.id).trim();
    const name = typeof raw.namn === 'string'
      ? raw.namn.trim()
      : (typeof raw.name === 'string' ? raw.name.trim() : '');
    if (!id && !name) return null;
    return { id, name };
  }

  function getEntryGrantRefs(rule) {
    const refs = [];
    const seen = new Set();
    const addRef = (raw) => {
      const parsed = parseEntryGrantRef(raw);
      if (!parsed) return;
      const key = parsed.id
        ? `id:${parsed.id}`
        : `name:${normalizeLevelName(parsed.name)}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      refs.push(parsed);
    };

    toArray(rule?.post).forEach(addRef);
    toArray(rule?.id).forEach(value => addRef({ id: value }));
    toArray(rule?.namn).forEach(value => addRef({ namn: value }));

    return refs;
  }

  function getEntryGrantTargets(list) {
    const aggregate = new Map();

    getListRules(list, { key: 'ger', mal: 'post' }).forEach(rule => {
      if (!matchesListCondition(rule, list)) return;
      const sourceName = String(rule?.sourceEntryName || '').trim();
      const sourceId = rule?.sourceEntryId === undefined || rule?.sourceEntryId === null
        ? ''
        : String(rule.sourceEntryId).trim();
      const sourceKey = sourceName || sourceId;
      if (!sourceKey) return;

      const gratisTill = typeof rule.gratis_upp_till === 'string' ? rule.gratis_upp_till.trim() : null;

      getEntryGrantRefs(rule).forEach(target => {
        const targetKey = target.id
          ? `id:${target.id}`
          : `name:${normalizeLevelName(target.name)}`;
        if (!targetKey) return;
        const aggregateKey = `${sourceKey}|${targetKey}`;
        if (aggregate.has(aggregateKey)) return;
        aggregate.set(aggregateKey, {
          id: target.id || undefined,
          name: target.name || '',
          sourceEntryId: sourceId,
          sourceEntryName: sourceName,
          sourceEntryLevel: String(rule?.sourceEntryLevel || '').trim(),
          gratisTill
        });
      });
    });

    return Array.from(aggregate.values());
  }

  function getPartialGrantInfo(entry, list) {
    const targetKey = entry?.id
      ? `id:${String(entry.id).trim()}`
      : (entry?.namn ? `name:${normalizeLevelName(entry.namn)}` : '');
    if (!targetKey) return null;

    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'ger', mal: 'post' });
    for (const rule of rules) {
      if (!rule.gratis_upp_till) continue;
      if (!matchesListCondition(rule, entries)) continue;
      const refs = getEntryGrantRefs(rule);
      const matches = refs.some(ref => {
        const refKey = ref.id
          ? `id:${String(ref.id).trim()}`
          : `name:${normalizeLevelName(ref.name)}`;
        return refKey === targetKey;
      });
      if (!matches) continue;
      return { gratisTill: rule.gratis_upp_till.trim() };
    }
    return null;
  }

  function getGrantedLevelRestriction(entry, list) {
    const targetKey = entry?.id
      ? `id:${String(entry.id).trim()}`
      : (entry?.namn ? `name:${normalizeLevelName(entry.namn)}` : '');
    if (!targetKey) return null;

    const entries = Array.isArray(list) ? list : [];
    for (const rule of getListRules(entries, { key: 'ger', mal: 'post' })) {
      if (!rule.beviljad_niva) continue;
      if (!matchesListCondition(rule, entries)) continue;
      const matches = getEntryGrantRefs(rule).some(ref => {
        const refKey = ref.id
          ? `id:${String(ref.id).trim()}`
          : `name:${normalizeLevelName(ref.name)}`;
        return refKey === targetKey;
      });
      if (matches) return String(rule.beviljad_niva).trim();
    }
    return null;
  }

  function getEntryGrantDependents(list, removedEntry) {
    if (!removedEntry || typeof removedEntry !== 'object') return [];
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    if (!entries.length) return [];

    const sourceEntry = resolveRuleSourceEntry(removedEntry);
    const sourceLevel = typeof removedEntry?.nivå === 'string'
      ? removedEntry.nivå
      : (typeof sourceEntry?.nivå === 'string' ? sourceEntry.nivå : '');
    const out = [];
    const seen = new Set();

    getRuleList(sourceEntry, 'ger', { level: sourceLevel }).forEach(rule => {
      if (String(rule?.mal || '') !== 'post') return;
      if (!matchesListCondition(rule, entries)) return;

      getEntryGrantRefs(rule).forEach(target => {
        const targetId = target.id ? String(target.id).trim() : '';
        const targetNameNorm = target.name ? normalizeLevelName(target.name) : '';
        const match = entries.find(entry => {
          if (!entry || typeof entry !== 'object') return false;
          if (entry === removedEntry) return false;
          if (targetId && entry.id !== undefined && entry.id !== null && String(entry.id) === targetId) return true;
          return targetNameNorm && normalizeLevelName(entry?.namn || '') === targetNameNorm;
        });
        const dependentName = typeof match?.namn === 'string' ? match.namn.trim() : '';
        const dependentKey = normalizeLevelName(dependentName);
        if (!dependentName || !dependentKey || seen.has(dependentKey)) return;
        seen.add(dependentKey);
        out.push(dependentName);
      });
    });

    return out;
  }

  function getMoneyGrant(list) {
    const out = { daler: 0, skilling: 0, ortegar: 0 };
    getListRules(list, { key: 'ger', mal: 'pengar' }).forEach(rule => {
      out.daler   += Math.max(0, Math.floor(Number(rule.daler   || 0)));
      out.skilling += Math.max(0, Math.floor(Number(rule.skilling || 0)));
      out.ortegar += Math.max(0, Math.floor(Number(rule.ortegar  || 0)));
    });
    return out;
  }

  const ONE_HANDED_DEFENSE_TYPES = Object.freeze(['Enhandsvapen', 'Korta vapen', 'Obeväpnad attack']);

  function getDefenseFactKey(fact, index) {
    const path = Array.isArray(fact?.path) ? fact.path.map(n => Number(n)).filter(Number.isInteger) : [];
    if (path.length) return `path:${path.join('.')}`;
    const id = typeof fact?.id === 'string' ? fact.id.trim() : '';
    if (id) return `id:${id}`;
    const name = typeof fact?.name === 'string' ? normalizeCompareToken(fact.name) : '';
    if (name) return `name:${name}`;
    return `idx:${Number(index) || 0}`;
  }

  function getNormalizedDefenseWeaponFact(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const types = toArray(raw.types ?? raw.typer).map(String).map(x => x.trim()).filter(Boolean);
    const qualities = toArray(raw.qualities ?? raw.kvaliteter).map(String).map(x => x.trim()).filter(Boolean);
    const isShield = hasNormalizedAny(types, ['Sköld']);
    const isWeapon = !isShield && hasNormalizedAny(types, ['Vapen']);
    const hasBastard = hasNormalizedAny(qualities, ['Bastardvapen']);
    const hasLong = hasNormalizedAny(qualities, ['Långt']);
    const hasHeavyType = hasNormalizedAny(types, ['Tunga vapen']);
    const isArmMountedShield = isShield && hasNormalizedAny(qualities, ['Armfäst']);
    const isOneHandedClass = isWeapon && (hasBastard || hasNormalizedAny(types, ONE_HANDED_DEFENSE_TYPES));
    const key = getDefenseFactKey(raw, index);
    return {
      ...raw,
      key,
      order: Number(index) || 0,
      types,
      qualities,
      isShield,
      isWeapon,
      hasBastard,
      hasLong,
      hasHeavyType,
      isArmMountedShield,
      isOneHandedClass
    };
  }

  function normalizeDefenseWeaponFacts(weaponFacts) {
    const out = [];
    const seen = new Set();
    (Array.isArray(weaponFacts) ? weaponFacts : []).forEach((fact, index) => {
      const normalized = getNormalizedDefenseWeaponFact(fact, index);
      if (!normalized || seen.has(normalized.key)) return;
      seen.add(normalized.key);
      out.push(normalized);
    });
    return out;
  }

  function hasEntryByName(list, name) {
    const wanted = normalizeLevelName(name);
    if (!wanted) return false;
    return (Array.isArray(list) ? list : []).some(entry =>
      normalizeLevelName(entry?.namn || '') === wanted
    );
  }

  function buildDefenseContext(list, weaponFacts, extra = {}) {
    const normalizedFacts = normalizeDefenseWeaponFacts(weaponFacts);
    const antalVapen = Number.isFinite(Number(extra?.antalVapen))
      ? Number(extra.antalVapen)
      : normalizedFacts.filter(f => f.isWeapon).length;
    const vapenFakta = normalizedFacts.map(f => ({
      typer: toArray(f.types),
      kvaliteter: toArray(f.qualities)
    }));
    return {
      ...extra,
      list: Array.isArray(list) ? list : [],
      vapenFakta,
      antalVapen,
      utrustadTyper: toArray(extra?.utrustadTyper).map(String).filter(Boolean),
      utrustadeKvaliteter: toArray(extra?.utrustadeKvaliteter).map(String).filter(Boolean)
    };
  }

  function sumModifierByMal(entries, mal, context = {}) {
    const targetMal = String(mal || '').trim();
    if (!targetMal) return 0;
    let total = 0;
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const rules = getRuleList(entry, 'andrar', { level: entry?.nivå })
        .filter(rule => String(rule?.mal || '') === targetMal
          && evaluateNar(rule?.nar, context));
      if (!rules.length) return;
      let entryValue = 0;
      rules.forEach(rule => {
        if (String(rule?.satt || '') === 'ersatt') {
          entryValue = Number(rule?.varde || 0);
        } else {
          entryValue += Number(rule?.varde || 0);
        }
      });
      total += entryValue;
    });
    return total;
  }

  function lookupEntriesByNames(names) {
    const lookup = typeof window.lookupEntry === 'function' ? window.lookupEntry : () => null;
    const seen = new Set();
    const out = [];
    (Array.isArray(names) ? names : []).forEach(name => {
      const label = String(name || '').trim();
      if (!label) return;
      const key = normalizeCompareToken(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      const hit = lookup({ name: label });
      if (hit && typeof hit === 'object') out.push(hit);
    });
    return out;
  }

  function analyzeDefenseLoadout(list, weaponFacts) {
    const facts = normalizeDefenseWeaponFacts(weaponFacts);
    const weapons = facts.filter(f => f.isWeapon);
    const shields = facts.filter(f => f.isShield);
    const hasTwinAttack = hasEntryByName(list, 'Tvillingattack');
    const maxWeapons = hasTwinAttack ? 2 : 1;
    const reasons = [];
    const reasonKeys = new Set();
    const violations = [];
    const pushReason = (key, text) => {
      if (!key || reasonKeys.has(key)) return;
      reasonKeys.add(key);
      reasons.push(String(text || ''));
    };

    if (shields.length > 1) {
      pushReason('max_one_shield', 'Endast en sköld kan utrustas åt gången.');
      const sortedShields = [...shields].sort((a, b) => a.order - b.order);
      violations.push({ code: 'max_one_shield', offenders: sortedShields.slice(1), shields: sortedShields });
    }

    if (weapons.length > maxWeapons) {
      pushReason(
        'max_weapons',
        hasTwinAttack
          ? 'Med Tvillingattack kan högst två vapen utrustas samtidigt.'
          : 'Utan Tvillingattack kan bara ett vapen utrustas.'
      );
      violations.push({ code: 'max_weapons', offenders: [...weapons], maxWeapons });
    }

    if (!hasTwinAttack && weapons.length > 1 && weapons.some(f => f.isOneHandedClass)) {
      pushReason(
        'one_handed_without_twin',
        'Enhandsvapen, Korta vapen, Obeväpnad attack och Bastardvapen kan inte kombineras utan Tvillingattack.'
      );
      violations.push({ code: 'one_handed_without_twin', offenders: [...weapons] });
    }

    if (weapons.length >= 2) {
      const nonArmMountedShields = shields.filter(f => !f.isArmMountedShield);
      if (nonArmMountedShields.length) {
        pushReason('dual_requires_armfast', 'Vid två vapen får bara sköld med kvaliteten Armfäst användas.');
        violations.push({ code: 'dual_requires_armfast', offenders: nonArmMountedShields, weapons: [...weapons] });
      }
    }

    shields.forEach(shield => {
      weapons.forEach(weapon => {
        if ((weapon.hasLong || weapon.hasHeavyType) && !weapon.hasBastard) {
          pushReason(
            'shield_long_or_heavy',
            'Sköld kan inte kombineras med Långt eller Tunga vapen utan Bastardvapen.'
          );
          violations.push({ code: 'shield_long_or_heavy', shield, weapon });
        }
      });
    });

    return {
      valid: reasons.length === 0,
      reasons,
      violations,
      facts,
      weapons,
      shields,
      hasTwinAttack
    };
  }

  function validateDefenseLoadout(list, weaponFacts) {
    const result = analyzeDefenseLoadout(list, weaponFacts);
    return { valid: result.valid, reasons: result.reasons };
  }

  function normalizePreferredDefenseKey(preferredPath) {
    if (Array.isArray(preferredPath)) {
      const nums = preferredPath.map(n => Number(n)).filter(Number.isInteger);
      return nums.length ? `path:${nums.join('.')}` : '';
    }
    const txt = String(preferredPath || '').trim();
    if (!txt) return '';
    return txt.startsWith('path:') ? txt : `path:${txt}`;
  }

  function chooseDropCandidate(candidates, preferredKey) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return null;
    const nonPreferred = list.filter(item => item && item.key !== preferredKey);
    const pool = nonPreferred.length ? nonPreferred : list;
    return [...pool]
      .sort((a, b) => Number(b?.order || 0) - Number(a?.order || 0))[0] || null;
  }

  function normalizeDefenseLoadout(list, weaponFacts, preferredPath) {
    const preferredKey = normalizePreferredDefenseKey(preferredPath);
    let current = normalizeDefenseWeaponFacts(weaponFacts);
    let guard = 0;
    while (guard < 32) {
      guard += 1;
      const analysis = analyzeDefenseLoadout(list, current);
      if (analysis.valid) return current;
      const first = analysis.violations[0];
      if (!first) return current;
      let remove = null;

      if (first.code === 'max_one_shield') {
        remove = chooseDropCandidate(first.offenders, preferredKey);
      } else if (first.code === 'max_weapons' || first.code === 'one_handed_without_twin') {
        remove = chooseDropCandidate(first.offenders, preferredKey);
      } else if (first.code === 'dual_requires_armfast') {
        const preferredShield = first.offenders.find(item => item?.key === preferredKey);
        if (preferredShield) {
          remove = chooseDropCandidate(first.weapons, preferredKey);
        } else {
          remove = chooseDropCandidate(first.offenders, preferredKey);
        }
      } else if (first.code === 'shield_long_or_heavy') {
        const shieldPreferred = first.shield?.key === preferredKey;
        const weaponPreferred = first.weapon?.key === preferredKey;
        if (shieldPreferred && !weaponPreferred) remove = first.weapon || null;
        else if (weaponPreferred && !shieldPreferred) remove = first.shield || null;
        else remove = first.shield || first.weapon || null;
      }

      if (!remove || !remove.key) return current;
      current = current.filter(item => item.key !== remove.key);
    }
    return current;
  }

  // Returns the total base defense modifier — always applies including when no armor is worn.
  function getDefenseValueModifier(list) {
    return sumModifierByMal(
      Array.isArray(list) ? list : [],
      'forsvar_modifierare',
      buildDefenseContext(list, [])
    );
  }

  // Returns defense modifiers that apply to a specific equipped armor context.
  // Only includes rules that have a nar.har_utrustad_typ condition (armor-conditional).
  // Unconditional rules (e.g. Robust) are handled by getDefenseValueModifier instead.
  function getArmorDefenseModifier(list, itemContext) {
    const context = buildDefenseContext(list, [], {
      utrustadTyper: toArray(itemContext?.utrustadTyper).map(String).filter(Boolean),
      utrustadeKvaliteter: toArray(itemContext?.utrustadeKvaliteter).map(String).filter(Boolean)
    });
    const entries = Array.isArray(list) ? list : [];
    let total = 0;
    entries.forEach(entry => {
      const rules = getRuleList(entry, 'andrar', { level: entry?.nivå })
        .filter(rule => String(rule?.mal || '') === 'forsvar_modifierare'
          && rule?.nar?.har_utrustad_typ != null
          && evaluateNar(rule?.nar, context));
      if (!rules.length) return;
      let entryValue = 0;
      rules.forEach(rule => {
        if (String(rule?.satt || '') === 'ersatt') {
          entryValue = Number(rule?.varde || 0);
        } else {
          entryValue += Number(rule?.varde || 0);
        }
      });
      total += entryValue;
    });
    return total;
  }

  // Unified nar condition evaluator.
  // context = {
  //   list,               — character list  → har_namn, saknar_namn, nagon_av_namn
  //   vapenFakta,         — [{typer, kvaliteter}] → weapon nar keys
  //   antalVapen,         — number → antal_utrustade_vapen_minst
  //   foremal,            — { typ, kvalitet } → nar.foremal.typ/ingen_typ/nagon_kvalitet
  //   utrustadTyper,      — string[] → har_utrustad_typ
  //   row,                — inventory row → trait
  //   sourceEntry,        — inventory item DB entry → namn, typ
  //   computedValues,     — pre-computed values: { <mal>: value, ... } → mal_minst, har_mal, mal_saknas
  // }
  // Each condition block is only evaluated when the relevant context key is present.
  function normalizeCompareToken(value) {
    return normalizeLevelName(String(value || ''));
  }

  function hasNormalizedAny(haystackValues, needleValues) {
    const haystack = new Set(toArray(haystackValues).map(normalizeCompareToken).filter(Boolean));
    if (!haystack.size) return false;
    return toArray(needleValues)
      .map(normalizeCompareToken)
      .filter(Boolean)
      .some(value => haystack.has(value));
  }

  function evaluateNar(nar, context) {
    if (!nar || typeof nar !== 'object') return true;
    const ctx = context || {};

    // --- List conditions (only when list is in context) ---
    if (ctx.list !== undefined) {
      const list = Array.isArray(ctx.list) ? ctx.list : [];
      const nameSet = buildNameSet(list);

      const requiredNames = toArray(nar.har_namn).map(normalizeLevelName).filter(Boolean);
      if (requiredNames.length && !requiredNames.every(n => nameSet.has(n))) return false;

      const saknarNames = toArray(nar.saknar_namn).map(normalizeLevelName).filter(Boolean);
      if (saknarNames.some(n => nameSet.has(n))) return false;

      const nagonAv = toArray(nar.nagon_av_namn).map(normalizeLevelName).filter(Boolean);
      if (nagonAv.length) {
        const effectiveNames = new Set(nameSet);
        list.forEach(e => {
          if (normalizeLevelName(e?.namn || '') === 'blodsband' && typeof e.race === 'string' && e.race.trim())
            effectiveNames.add(normalizeLevelName(e.race));
        });
        if (!nagonAv.some(n => effectiveNames.has(n))) return false;
      }
    }

    // --- Computed value conditions (only when computedValues is in context) ---
    if (ctx.computedValues !== undefined) {
      const cv = ctx.computedValues;

      if (nar.mal_minst && typeof nar.mal_minst === 'object') {
        const failed = Object.keys(nar.mal_minst).some(malName =>
          Number(cv[malName] ?? 0) < Number(nar.mal_minst[malName])
        );
        if (failed) return false;
      }

      const saknas = toArray(nar.mal_saknas).map(String).filter(Boolean);
      if (saknas.some(m => cv[m])) return false;

      const harMal = toArray(nar.har_mal).map(String).filter(Boolean);
      if (harMal.length && !harMal.every(m => cv[m])) return false;
    }

    // --- Armor type conditions (only when utrustadTyper is in context) ---
    if (ctx.utrustadTyper !== undefined) {
      const condTypes = toArray(nar.har_utrustad_typ).map(String).filter(Boolean);
      if (condTypes.length) {
        const contextTypes = toArray(ctx.utrustadTyper).map(String).filter(Boolean);
        if (!condTypes.some(t => contextTypes.includes(t))) return false;
      }
    }

    // --- Weapon conditions (only when vapenFakta or antalVapen is in context) ---
    if (ctx.vapenFakta !== undefined || ctx.antalVapen !== undefined) {
      const vapenFakta = Array.isArray(ctx.vapenFakta) ? ctx.vapenFakta : [];
      const antalVapen = Number.isFinite(Number(ctx.antalVapen)) ? Number(ctx.antalVapen) : 0;

      const minVapen = Number(nar.antal_utrustade_vapen_minst || 0);
      if (minVapen > 0 && antalVapen < minVapen) return false;

      const harTyp = toArray(nar.har_utrustad_vapen_typ).map(String).filter(Boolean);
      if (harTyp.length > 0 && !vapenFakta.some(f => hasNormalizedAny(f.typer, harTyp))) return false;
      const ejTyp = toArray(nar.ej_utrustad_vapen_typ).map(String).filter(Boolean);
      if (ejTyp.length > 0 && vapenFakta.some(f => hasNormalizedAny(f.typer, ejTyp))) return false;
      const harKval = toArray(nar.har_utrustad_vapen_kvalitet).map(String).filter(Boolean);
      if (harKval.length > 0 && !vapenFakta.some(f => hasNormalizedAny(f.kvaliteter, harKval))) return false;
      const ejKval = toArray(nar.ej_utrustad_vapen_kvalitet).map(String).filter(Boolean);
      if (ejKval.length > 0 && vapenFakta.some(f => hasNormalizedAny(f.kvaliteter, ejKval))) return false;
    }

    // --- Item-context conditions (only when foremal is in context) ---
    if (ctx.foremal !== undefined) {
      const target = ctx.foremal && typeof ctx.foremal === 'object' ? ctx.foremal : {};
      const cond = nar.foremal && typeof nar.foremal === 'object' ? nar.foremal : {};
      const requiredTypes = toArray(cond.typ).map(String).filter(Boolean);
      if (requiredTypes.length && !hasNormalizedAny(target.typ, requiredTypes)) return false;
      const excludedTypes = toArray(cond.ingen_typ).map(String).filter(Boolean);
      if (excludedTypes.length && hasNormalizedAny(target.typ, excludedTypes)) return false;
      const anyQuality = toArray(cond.nagon_kvalitet).map(String).filter(Boolean);
      if (anyQuality.length && !hasNormalizedAny(target.kvalitet, anyQuality)) return false;
    }

    // --- Combat context flags (only when present in context) ---
    if (ctx.narstrid !== undefined && nar.narstrid !== undefined && Boolean(nar.narstrid) !== Boolean(ctx.narstrid)) {
      return false;
    }
    if (ctx.avstand !== undefined && nar.avstand !== undefined && Boolean(nar.avstand) !== Boolean(ctx.avstand)) {
      return false;
    }
    if (ctx.overtag !== undefined && nar.overtag !== undefined && Boolean(nar.overtag) !== Boolean(ctx.overtag)) {
      return false;
    }
    if (ctx.efter_forflyttning !== undefined
      && nar.efter_forflyttning !== undefined
      && Boolean(nar.efter_forflyttning) !== Boolean(ctx.efter_forflyttning)) {
      return false;
    }

    // --- Source entry level conditions (only when sourceLevel is in context) ---
    if (ctx.sourceLevel !== undefined) {
      if (nar.kalla_niva_minst !== undefined) {
        const minLvl = LEVEL_VALUE_MAP[normalizeLevelName(String(nar.kalla_niva_minst))] || 0;
        const srcLvl = LEVEL_VALUE_MAP[normalizeLevelName(String(ctx.sourceLevel || ''))] || 0;
        if (srcLvl < minLvl) return false;
      }
    }

    // --- Inventory conditions (only when row or sourceEntry is in context) ---
    if (ctx.row !== undefined || ctx.sourceEntry !== undefined) {
      const traitFilter = toArray(nar.trait).map(normalizeLevelName).filter(Boolean);
      if (traitFilter.length) {
        const rowTrait = normalizeLevelName(ctx.row?.trait || '');
        if (!rowTrait || !traitFilter.includes(rowTrait)) return false;
      }
      if (ctx.sourceEntry !== undefined) {
        const names = toArray(nar.namn).map(String).filter(Boolean);
        if (names.length && !names.some(name => normalizeLevelName(ctx.sourceEntry?.namn || '') === normalizeLevelName(name))) return false;
        const types = toArray(nar.typ).map(String).filter(Boolean);
        if (types.length && !types.some(typeName => entryHasType(ctx.sourceEntry, typeName))) return false;
      }
    }

    return true;
  }

  // Thin wrappers — preserve existing call signatures while delegating to evaluateNar.
  function evaluateVapenNar(nar, weaponContext) {
    return evaluateNar(nar, {
      vapenFakta: weaponContext?.vapenFakta,
      antalVapen: weaponContext?.antalVapen
    });
  }

  // Sums a weapon-specific mal across any array of data entries.
  // Entries may be character list entries (with nivå) or flat data entries (e.g. quality).
  // weaponContext is forwarded to evaluateVapenNar for each rule's nar block.
  function sumVapenBonusByMal(entries, mal, weaponContext) {
    const targetMal = String(mal || '').trim();
    if (!targetMal) return 0;
    let total = 0;
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const rules = getRuleList(entry, 'andrar', { level: entry.nivå })
        .filter(rule => String(rule?.mal || '') === targetMal
          && evaluateVapenNar(rule?.nar, weaponContext));
      total += rules.reduce((sum, rule) => sum + Number(rule.varde || 0), 0);
    });
    return total;
  }

  // Sums forsvar_modifierare bonuses across any array of data entries.
  function sumVapenBonus(entries, weaponContext) {
    return sumVapenBonusByMal(entries, 'forsvar_modifierare', weaponContext);
  }

  function getDefenseModifier(list, weaponFacts = [], context = {}) {
    const facts = normalizeDefenseWeaponFacts(weaponFacts);
    const ctx = buildDefenseContext(list, facts, context);
    return sumModifierByMal(Array.isArray(list) ? list : [], 'forsvar_modifierare', ctx);
  }

  function getEquippedDefenseModifier(list, weaponFacts = [], context = {}) {
    const facts = normalizeDefenseWeaponFacts(weaponFacts);
    const qualityNames = [...new Set(facts.flatMap(f => toArray(f.qualities).map(String).filter(Boolean)))];
    const qualityEntries = lookupEntriesByNames(qualityNames);
    const weaponEntries = facts.map(f => f.entryRef).filter(entry => entry && typeof entry === 'object');
    const ctx = buildDefenseContext(list, facts, context);
    let total = 0;
    total += sumModifierByMal(Array.isArray(list) ? list : [], 'forsvar_modifierare', ctx);
    total += sumModifierByMal(weaponEntries, 'forsvar_modifierare', ctx);
    total += sumModifierByMal(qualityEntries, 'forsvar_modifierare', ctx);
    return total;
  }

  // Returns weapon/ability-based defense bonus from the character trait list.
  function getWeaponDefenseBonus(list, weaponContext) {
    const facts = normalizeDefenseWeaponFacts(
      weaponContext?.weaponFacts || weaponContext?.vapenFakta || []
    );
    return getDefenseModifier(Array.isArray(list) ? list : [], facts, weaponContext || {});
  }

  // Returns weapon/ability-based attack bonus from the character trait list.
  function getWeaponAttackBonus(list, weaponContext) {
    return sumVapenBonusByMal(Array.isArray(list) ? list : [], 'traffsaker_modifierare_vapen', weaponContext);
  }

  // Returns defense bonus from the weapon entries themselves (e.g. shield base +1).
  // weaponFacts: [{ entryRef: dbEntry, types: string[], qualities: string[] }]
  function getEquippedWeaponEntryDefenseBonus(weaponFacts, context = {}) {
    const facts = normalizeDefenseWeaponFacts(weaponFacts);
    const entries = facts.map(f => f.entryRef).filter(entry => entry && typeof entry === 'object');
    const ctx = buildDefenseContext([], facts, context || {});
    return sumModifierByMal(entries, 'forsvar_modifierare', ctx);
  }

  // Returns attack bonus from the weapon entries themselves.
  // weaponFacts: [{ entryRef: dbEntry, types: string[], qualities: string[] }]
  function getEquippedWeaponEntryAttackBonus(weaponFacts) {
    let total = 0;
    (Array.isArray(weaponFacts) ? weaponFacts : []).forEach(fact => {
      if (!fact?.entryRef) return;
      total += sumVapenBonusByMal([fact.entryRef], 'traffsaker_modifierare_vapen', {
        vapenFakta: [{ typer: toArray(fact.types), kvaliteter: toArray(fact.qualities) }],
        antalVapen: 1
      });
    });
    return total;
  }

  // Returns bonus from equipped weapon qualities, resolved by name via lookupEntry.
  // qualityNames: string[] — unique quality names found on equipped weapons.
  // mal: weapon modifier mal to evaluate, e.g. 'forsvar_modifierare'.
  function getEquippedQualityVapenBonus(qualityNames, mal, weaponContext = {}) {
    if (!Array.isArray(qualityNames) || !qualityNames.length) return 0;
    const targetMal = String(mal || '').trim();
    if (!targetMal) return 0;
    const entries = lookupEntriesByNames(qualityNames);
    if (targetMal === 'forsvar_modifierare') {
      const facts = normalizeDefenseWeaponFacts(
        weaponContext?.weaponFacts || weaponContext?.vapenFakta || []
      );
      const ctx = buildDefenseContext([], facts, weaponContext || {});
      return sumModifierByMal(entries, targetMal, ctx);
    }
    return sumVapenBonusByMal(entries, targetMal, weaponContext);
  }

  // Returns defense bonus from equipped weapon qualities, resolved by name via lookupEntry.
  // qualityNames: string[] — unique quality names found on equipped weapons.
  function getEquippedQualityDefenseBonus(qualityNames, weaponContext = {}) {
    return getEquippedQualityVapenBonus(qualityNames, 'forsvar_modifierare', weaponContext);
  }

  // Returns attack bonus from equipped weapon qualities, resolved by name via lookupEntry.
  // qualityNames: string[] — unique quality names found on equipped weapons.
  function getEquippedQualityAttackBonus(qualityNames, weaponContext = {}) {
    return getEquippedQualityVapenBonus(qualityNames, 'traffsaker_modifierare_vapen', weaponContext);
  }

  function evaluateRustningNar(nar, armorContext) {
    return evaluateNar(nar, { utrustadTyper: armorContext?.utrustadTyper });
  }

  // Sums a specific mal bonus from armor quality entries resolved by name.
  // qualityNames: string[] — quality names on the equipped armor item.
  // mal: the rule type to sum (e.g. 'begransning_modifierare').
  function sumRustningBonus(qualityNames, mal, armorContext) {
    if (!Array.isArray(qualityNames) || !qualityNames.length) return 0;
    const lookup = typeof window.lookupEntry === 'function' ? window.lookupEntry : () => null;
    const entries = qualityNames.map(name => lookup({ name })).filter(e => e && typeof e === 'object');
    let total = 0;
    entries.forEach(entry => {
      const rules = getRuleList(entry, 'andrar')
        .filter(rule => String(rule?.mal || '') === String(mal)
          && evaluateRustningNar(rule?.nar, armorContext));
      total += rules.reduce((sum, rule) => sum + Number(rule.varde || 0), 0);
    });
    return total;
  }

  // Regular restriction modifier — may be cancelled by Rustmästare (e.g. Smidigt +2, Otymplig −1).
  function getArmorRestrictionBonus(qualityNames) {
    return sumRustningBonus(qualityNames, 'begransning_modifierare', {});
  }

  // Fixed restriction modifier — NOT cancelled by Rustmästare (e.g. Stenpansar −4).
  function getArmorRestrictionBonusFast(qualityNames) {
    return sumRustningBonus(qualityNames, 'begransning_modifierare_fast', {});
  }

  // Returns true if any entry in the list grants the Rustmästare-level reset of begransning_modifierare.
  function hasArmorRestrictionReset(list) {
    return getListRules(list, { key: 'andrar', mal: 'nollstall_begransning_modifierare' }).length > 0;
  }

  function toArray(value) {
    return Array.isArray(value)
      ? value.filter(item => item !== undefined && item !== null)
      : (value === undefined || value === null ? [] : [value]);
  }

  function getLevelValue(value) {
    return LEVEL_VALUE_MAP[normalizeLevelName(value)] || 0;
  }

  function normalizeTradition(value) {
    const label = String(value || '').trim();
    if (!label) return '';
    return TRADITION_ALIAS_MAP[normalizeLevelName(label)] || label;
  }

  function getEntryTypes(entry) {
    return toTagList(entry?.taggar?.typ);
  }

  function entryHasType(entry, typeName) {
    const wanted = normalizeLevelName(typeName);
    if (!wanted) return false;
    return getEntryTypes(entry).some(type => normalizeLevelName(type) === wanted);
  }

  function getEntryTraditions(entry) {
    const seen = new Set();
    const out = [];
    toTagList(entry?.taggar?.ark_trad)
      .map(normalizeTradition)
      .filter(Boolean)
      .forEach(tradition => {
        if (seen.has(tradition)) return;
        seen.add(tradition);
        out.push(tradition);
      });
    return out;
  }

  function buildTraditionGraph(list) {
    const graph = new Map();

    (Array.isArray(list) ? list : []).forEach(entry => {
      const traditions = getEntryTraditions(entry);
      traditions.forEach(tradition => {
        if (!graph.has(tradition)) graph.set(tradition, new Set());
        const links = graph.get(tradition);
        traditions.forEach(other => {
          if (other) links.add(other);
        });
      });
    });

    return graph;
  }

  function expandTraditions(traditions, graph) {
    const queue = [];
    const seen = new Set();

    toArray(traditions)
      .map(normalizeTradition)
      .filter(Boolean)
      .forEach(tradition => {
        if (seen.has(tradition)) return;
        seen.add(tradition);
        queue.push(tradition);
      });

    while (queue.length) {
      const current = queue.shift();
      const links = graph?.get(current);
      if (!links) continue;
      links.forEach(next => {
        if (!next || seen.has(next)) return;
        seen.add(next);
        queue.push(next);
      });
    }

    return Array.from(seen);
  }

  function getResolvedEntryTraditions(entry, options = {}) {
    return expandTraditions(
      getEntryTraditions(entry),
      options?.traditionGraph || buildTraditionGraph(options?.list)
    );
  }

  function getEntryLevelValue(entry) {
    return getLevelValue(entry?.nivå || '');
  }

  function getRitualRequiredLevel(entry) {
    const selectedLevel = getLevelValue(entry?.nivå || '');
    if (selectedLevel) return selectedLevel;

    const levelData = getLevelDataMap(entry);
    if (!levelData || typeof levelData !== 'object') return 1;
    const defined = Object.keys(levelData).map(getLevelValue).filter(value => value > 0);
    if (defined.includes(1)) return 1;
    return defined.length ? defined[0] : 1;
  }

  function matchesListCondition(rule, list) {
    return evaluateNar(rule?.nar, {
      list: Array.isArray(list) ? list : [],
      sourceLevel: rule?.sourceEntryLevel
    });
  }

  function matchesTargetCondition(rule, targetEntry, options = {}) {
    const nar = rule?.nar || {};
    const names = toArray(nar.namn).map(String).filter(Boolean);
    if (names.length && !names.some(name => normalizeLevelName(targetEntry?.namn || '') === normalizeLevelName(name))) {
      return false;
    }
    const types = toArray(nar.typ).map(String).filter(Boolean);
    if (types.length && !types.some(typeName => entryHasType(targetEntry, typeName))) {
      return false;
    }
    const traditions = toArray(nar.ark_trad).map(normalizeTradition).filter(Boolean);
    if (traditions.length) {
      const targetTraditions = getResolvedEntryTraditions(targetEntry, options);
      if (!targetTraditions.some(tradition => traditions.includes(tradition))) {
        return false;
      }
    }
    return true;
  }

  function matchesConflictTargetCondition(rule, targetEntry, options = {}) {
    const names = toArray(rule?.namn)
      .map(name => normalizeLevelName(name))
      .filter(Boolean);
    if (names.length) {
      const targetName = normalizeLevelName(targetEntry?.namn || '');
      if (!targetName || !names.includes(targetName)) return false;
    }
    return matchesTargetCondition(rule, targetEntry, options);
  }

  function getConflictReasonCode(rule, sourceEntry, targetEntry) {
    const explicitCode = String(rule?.varde || '').trim();
    if (explicitCode) return explicitCode;

    const sourceName = normalizeLevelName(sourceEntry?.namn || '');
    const targetName = normalizeLevelName(targetEntry?.namn || '');
    if (sourceName && targetName) return `krock_${sourceName}_${targetName}`;
    if (sourceName) return `krock_${sourceName}`;
    return 'krock';
  }

  function normalizeConflictMode(value) {
    const mode = normalizeLevelName(value || '');
    return mode === 'ersatt' ? 'ersatt' : 'blockera';
  }

  function addConflictReason(out, seen, rule, sourceEntry, targetEntry) {
    const sourceName = normalizeLevelName(sourceEntry?.namn || '');
    const targetName = normalizeLevelName(targetEntry?.namn || '');
    if (!sourceName || !targetName) return;

    const reasonCode = getConflictReasonCode(rule, sourceEntry, targetEntry);
    const pairKey = sourceName <= targetName
      ? `${sourceName}|${targetName}`
      : `${targetName}|${sourceName}`;
    const dedupeKey = `${reasonCode}|${pairKey}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    out.push({
      code: reasonCode,
      mode: normalizeConflictMode(rule?.satt),
      sourceEntryId: sourceEntry?.id || '',
      sourceEntryName: sourceEntry?.namn || '',
      sourceEntryLevel: sourceEntry?.nivå || '',
      targetEntryId: targetEntry?.id || '',
      targetEntryName: targetEntry?.namn || '',
      targetEntryLevel: targetEntry?.nivå || ''
    });
  }

  function getConflictReasonsForCandidate(candidateEntry, list, options = {}) {
    if (!candidateEntry || typeof candidateEntry !== 'object') return [];
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const candidateLevel = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : (typeof candidateEntry?.nivå === 'string' ? candidateEntry.nivå.trim() : '');
    const candidate = candidateLevel && candidateEntry?.nivå !== candidateLevel
      ? { ...candidateEntry, nivå: candidateLevel }
      : candidateEntry;
    const contextList = [...entries, candidate];
    const traditionGraph = buildTraditionGraph(contextList);
    const out = [];
    const seen = new Set();

    const collectForSource = (sourceEntry, targets, level = '') => {
      getRuleList(sourceEntry, 'krockar', { level }).forEach(rule => {
        if (!matchesListCondition(rule, contextList)) return;
        targets.forEach(targetEntry => {
          if (!targetEntry || targetEntry === sourceEntry) return;
          if (!matchesConflictTargetCondition(rule, targetEntry, { traditionGraph })) return;
          addConflictReason(out, seen, rule, sourceEntry, targetEntry);
        });
      });
    };

    collectForSource(candidate, entries, candidateLevel);
    entries.forEach(entry => {
      collectForSource(
        entry,
        [candidate],
        typeof entry?.nivå === 'string' ? entry.nivå : ''
      );
    });

    return out;
  }

  function getConflictResolutionForCandidate(candidateEntry, list, options = {}) {
    const reasons = getConflictReasonsForCandidate(candidateEntry, list, options);
    const candidateName = normalizeLevelName(candidateEntry?.namn || '');
    const replaceTargetMap = new Map();
    const blockingReasons = [];

    reasons.forEach(reason => {
      const sourceName = normalizeLevelName(reason?.sourceEntryName || '');
      const targetName = String(reason?.targetEntryName || '').trim();
      const targetKey = normalizeLevelName(targetName);
      const mode = normalizeConflictMode(reason?.mode);
      const canReplaceTarget = (
        mode === 'ersatt'
        && candidateName
        && sourceName === candidateName
        && targetKey
      );
      if (canReplaceTarget) {
        if (!replaceTargetMap.has(targetKey)) replaceTargetMap.set(targetKey, targetName);
        return;
      }
      blockingReasons.push(reason);
    });

    return {
      reasons,
      blockingReasons,
      replaceTargetNames: Array.from(replaceTargetMap.values())
    };
  }

  function getUniqueNames(values) {
    const seen = new Set();
    const out = [];
    toArray(values).forEach(value => {
      const name = String(value || '').trim();
      const normalized = normalizeLevelName(name);
      if (!name || !normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(name);
    });
    return out;
  }

  function getRequirementNames(rule) {
    return getUniqueNames([
      ...toArray(rule?.namn),
      ...toArray(rule?.nar?.har_namn)
    ]);
  }

  function getRequirementReasonCode(rule, sourceEntry) {
    const explicitCode = String(rule?.varde || '').trim();
    if (explicitCode) return explicitCode;
    const sourceName = normalizeLevelName(sourceEntry?.namn || '');
    if (sourceName) return `krav_${sourceName}`;
    return 'krav';
  }

  function getMissingRequirementReasonsForCandidate(candidateEntry, list, options = {}) {
    if (!candidateEntry || typeof candidateEntry !== 'object') return [];
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const candidateLevel = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : (typeof candidateEntry?.nivå === 'string' ? candidateEntry.nivå.trim() : '');
    const candidate = candidateLevel && candidateEntry?.nivå !== candidateLevel
      ? { ...candidateEntry, nivå: candidateLevel }
      : candidateEntry;

    const nameSet = new Set(entries.map(entry => normalizeLevelName(entry?.namn || '')).filter(Boolean));
    const out = [];
    const seen = new Set();

    getRuleList(candidate, 'kraver', { level: candidateLevel }).forEach(rule => {
      const requiredNames = getRequirementNames(rule);
      const missingNames = requiredNames.filter(name => !nameSet.has(normalizeLevelName(name)));
      const satisfied = requiredNames.length
        ? missingNames.length === 0
        : matchesListCondition(rule, entries);
      if (satisfied) return;

      const code = getRequirementReasonCode(rule, candidate);
      const dedupeKey = `${code}|${normalizeLevelName(candidate?.namn || '')}|${missingNames
        .map(name => normalizeLevelName(name))
        .sort()
        .join(',')}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      out.push({
        code,
        sourceEntryId: candidate?.id || '',
        sourceEntryName: candidate?.namn || '',
        sourceEntryLevel: candidate?.nivå || '',
        requiredNames,
        missingNames
      });
    });

    return out;
  }

  function getEntryTypeLabel(name) {
    const label = String(name || '').trim();
    if (!label || typeof window.lookupEntry !== 'function') return 'Krav';
    let hit = null;
    try { hit = window.lookupEntry({ name: label }); } catch {}
    const types = Array.isArray(hit?.taggar?.typ) ? hit.taggar.typ : [];
    if (types.includes('Ras')) return 'Ras';
    if (types.includes('Nackdel')) return 'Nackdel';
    if (types.includes('Fördel')) return 'Fördel';
    if (types.includes('Elityrke')) return 'Elityrke';
    if (types.includes('Yrke')) return 'Yrke';
    if (types.includes('Särdrag')) return 'Särdrag';
    if (types.includes('Monstruöst särdrag')) return 'Monstruöst särdrag';
    if (types.includes('Förmåga')) return 'Förmåga';
    if (types.includes('Basförmåga')) return 'Basförmåga';
    if (types.includes('Mystisk kraft')) return 'Mystisk kraft';
    if (types.includes('Ritual')) return 'Ritual';
    return types[0] || 'Krav';
  }

  function normalizeHardStop(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      const message = raw.trim();
      return message ? { code: message, message } : null;
    }
    if (typeof raw !== 'object') return null;
    const message = typeof raw.message === 'string' ? raw.message.trim() : '';
    const code = typeof raw.code === 'string' ? raw.code.trim() : '';
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    const value = typeof raw.value === 'string' ? raw.value.trim() : '';
    if (!message && !label && !value && !code) return null;
    return {
      ...raw,
      code: code || message || `${label}:${value}`,
      message,
      label,
      value
    };
  }

  function evaluateEntryStops(candidateEntry, list, options = {}) {
    if (!candidateEntry || typeof candidateEntry !== 'object') {
      return {
        requirementReasons: [],
        blockingConflicts: [],
        replaceTargetNames: [],
        grantedLevelStop: null,
        hardStops: [],
        hasStops: false
      };
    }
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const action = String(options?.action || 'add').trim();
    const toLevel = typeof options?.toLevel === 'string' && options.toLevel.trim()
      ? options.toLevel.trim()
      : (typeof options?.level === 'string' && options.level.trim()
        ? options.level.trim()
        : (typeof candidateEntry?.nivå === 'string' ? candidateEntry.nivå.trim() : ''));
    const fromLevel = typeof options?.fromLevel === 'string' && options.fromLevel.trim()
      ? options.fromLevel.trim()
      : '';

    const candidate = toLevel && candidateEntry?.nivå !== toLevel
      ? { ...candidateEntry, nivå: toLevel }
      : candidateEntry;

    const requirementReasons = getMissingRequirementReasonsForCandidate(candidate, entries, { level: toLevel });
    const conflictResolution = getConflictResolutionForCandidate(candidate, entries, { level: toLevel });
    const blockingConflicts = Array.isArray(conflictResolution?.blockingReasons)
      ? conflictResolution.blockingReasons
      : [];
    const replaceTargetNames = Array.isArray(conflictResolution?.replaceTargetNames)
      ? conflictResolution.replaceTargetNames
      : [];

    let grantedLevelStop = null;
    if (action === 'level-change') {
      const beviljadNiva = getGrantedLevelRestriction(candidate, entries);
      const requestedIdx = getLevelValue(toLevel);
      const grantedIdx = getLevelValue(beviljadNiva);
      if (beviljadNiva && requestedIdx > grantedIdx) {
        const missingRequirements = getMissingRequirementReasonsForCandidate(candidate, entries, { level: toLevel });
        if (missingRequirements.length) {
          grantedLevelStop = {
            beviljadNiva,
            fromLevel,
            toLevel,
            missingRequirements
          };
        }
      }
    }

    const hardStops = toArray(options?.hardStops)
      .map(normalizeHardStop)
      .filter(Boolean);

    return {
      requirementReasons,
      blockingConflicts,
      replaceTargetNames,
      grantedLevelStop,
      hardStops,
      hasStops: Boolean(
        requirementReasons.length
        || blockingConflicts.length
        || grantedLevelStop
        || hardStops.length
      )
    };
  }

  function formatEntryStopMessages(entryName, stopResult = {}) {
    const entryLabel = String(entryName || '').trim();
    const out = [];
    const seen = new Set();
    const add = (message) => {
      const text = String(message || '').trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      out.push(text);
    };

    (Array.isArray(stopResult?.requirementReasons) ? stopResult.requirementReasons : []).forEach(reason => {
      const names = Array.isArray(reason?.missingNames) && reason.missingNames.length
        ? reason.missingNames
        : (Array.isArray(reason?.requiredNames) ? reason.requiredNames : []);
      if (!names.length) {
        add('Krav: Förkunskaper saknas');
        return;
      }
      names.forEach(name => {
        const clean = String(name || '').trim();
        if (!clean) return;
        add(`${getEntryTypeLabel(clean)}: ${clean}`);
      });
    });

    (Array.isArray(stopResult?.blockingConflicts) ? stopResult.blockingConflicts : []).forEach(reason => {
      const source = String(reason?.sourceEntryName || '').trim();
      const target = String(reason?.targetEntryName || '').trim();
      let other = '';
      if (source && target) {
        if (source === entryLabel) other = target;
        else if (target === entryLabel) other = source;
        else other = `${source} / ${target}`;
      } else {
        other = source || target || '';
      }
      add(other ? `Krock: ${other}` : 'Krock med valt innehåll');
    });

    (Array.isArray(stopResult?.replaceTargetNames) ? stopResult.replaceTargetNames : []).forEach(name => {
      const clean = String(name || '').trim();
      if (!clean) return;
      add(`Ersätter normalt: ${clean}`);
    });

    if (stopResult?.grantedLevelStop?.beviljadNiva) {
      const target = String(stopResult?.grantedLevelStop?.toLevel || '').trim();
      if (target) add(`Beviljad nivå: ${stopResult.grantedLevelStop.beviljadNiva} (försöker ${target})`);
      else add(`Beviljad nivå: ${stopResult.grantedLevelStop.beviljadNiva}`);
    }

    (Array.isArray(stopResult?.hardStops) ? stopResult.hardStops : []).forEach(stop => {
      const msg = String(stop?.message || '').trim();
      if (msg) {
        add(msg);
        return;
      }
      const label = String(stop?.label || '').trim();
      const value = String(stop?.value || '').trim();
      if (label && value) add(`${label}: ${value}`);
      else if (label) add(label);
      else if (value) add(value);
      else add('Spärrad av regel');
    });

    return out;
  }

  function removeOneMatchingEntry(list, entryToRemove) {
    const removedName = normalizeLevelName(entryToRemove?.namn || '');
    let removed = false;
    const out = [];

    (Array.isArray(list) ? list : []).forEach(entry => {
      if (!removed) {
        if (entry === entryToRemove) {
          removed = true;
          return;
        }
        if (removedName && normalizeLevelName(entry?.namn || '') === removedName) {
          removed = true;
          return;
        }
      }
      out.push(entry);
    });

    return out;
  }

  function buildNameSet(list) {
    return new Set(
      (Array.isArray(list) ? list : [])
        .map(entry => normalizeLevelName(entry?.namn || ''))
        .filter(Boolean)
    );
  }

  function isRequirementRuleSatisfied(rule, nameSet, listForCondition) {
    const requiredNames = getRequirementNames(rule)
      .map(name => normalizeLevelName(name))
      .filter(Boolean);
    if (requiredNames.length) {
      return requiredNames.every(name => nameSet.has(name));
    }
    return matchesListCondition(rule, listForCondition);
  }

  function getRequirementDependents(list, removedEntry, options = {}) {
    if (!removedEntry || typeof removedEntry !== 'object') return [];
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    if (!entries.length) return [];

    const removedName = normalizeLevelName(removedEntry?.namn || '');
    if (!removedName) return [];
    const afterEntries = removeOneMatchingEntry(entries, removedEntry);
    const beforeNameSet = buildNameSet(entries);
    const afterNameSet = buildNameSet(afterEntries);
    const out = [];
    const seen = new Set();

    entries.forEach(candidate => {
      if (!candidate || candidate === removedEntry) return;
      const candidateLevel = typeof candidate?.nivå === 'string' ? candidate.nivå : '';
      getRuleList(candidate, 'kraver', { level: candidateLevel }).forEach(rule => {
        const requiredNames = getRequirementNames(rule)
          .map(name => normalizeLevelName(name))
          .filter(Boolean);
        if (requiredNames.length && !requiredNames.includes(removedName)) return;

        const beforeSatisfied = isRequirementRuleSatisfied(rule, beforeNameSet, entries);
        const afterSatisfied = isRequirementRuleSatisfied(rule, afterNameSet, afterEntries);
        if (!(beforeSatisfied && !afterSatisfied)) return;

        const candidateName = String(candidate?.namn || '').trim();
        const dedupeKey = normalizeLevelName(candidateName);
        if (!candidateName || !dedupeKey || seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        out.push(candidateName);
      });
    });

    return out;
  }

  function getFormulaBaseValue(baseKey, sourceEntry, options = {}) {
    const key = String(baseKey || '').trim();
    if (!key) return 0;
    if (key === 'niva') return getEntryLevelValue(sourceEntry || {});
    if (key.startsWith('mal:')) {
      const malName = key.slice(4).trim();
      const result = queryMal(options?.list, malName, options);
      return Number.isFinite(Number(result)) ? Number(result) : 0;
    }
    if (key.startsWith('attribut:')) {
      const attrName = key.slice(9).trim();
      const value = Number(options?.[attrName]);
      return Number.isFinite(value) ? value : 0;
    }
    const value = Number(options?.[key]);
    return Number.isFinite(value) ? value : 0;
  }

  function computeObjectFormulaValue(formel, sourceEntry, options = {}) {
    if (!formel || typeof formel !== 'object' || Array.isArray(formel)) return null;
    let computed = getFormulaBaseValue(formel.bas, sourceEntry, options);

    const factor = Number(formel.faktor);
    if (Number.isFinite(factor)) computed *= factor;

    const division = Number(formel.division);
    if (Number.isFinite(division) && division !== 0) {
      computed /= division;
    }

    const offset = Number(formel.tillagg);
    if (Number.isFinite(offset)) computed += offset;

    const rounding = normalizeLevelName(formel.avrunda || '');
    if (rounding === 'uppat') {
      computed = Math.ceil(computed);
    } else if (rounding === 'nedat') {
      computed = Math.floor(computed);
    } else if (rounding === 'narmast') {
      computed = Math.round(computed);
    }

    return computed;
  }

  function getRuleNumericValue(rule, sourceEntry, options = {}) {
    const rawFormel = rule?.formel;
    const formel = typeof rawFormel === 'string' ? rawFormel.trim() : '';
    const numericValue = Number(rule?.varde);
    const willpower = Number(options?.viljestark || 0);
    const strength = Number(options?.stark || 0);
    const permanentCorruption = Number(options?.permanent_korruption || 0);
    const currentPainThreshold = Number(options?.aktuell_smartgrans || 0);
    const objectFormulaValue = computeObjectFormulaValue(rawFormel, sourceEntry, options);
    if (Number.isFinite(objectFormulaValue)) {
      return Number.isFinite(numericValue) ? objectFormulaValue * numericValue : objectFormulaValue;
    }
    if (!formel) {
      return Number.isFinite(numericValue) ? numericValue : 0;
    }

    let computed = 0;
    if (formel === 'viljestark' || formel === 'hel_viljestark') {
      computed = Number.isFinite(willpower) ? willpower : 0;
    } else if (formel === 'halv_viljestark_uppat') {
      computed = Number.isFinite(willpower) ? Math.ceil(willpower / 2) : 0;
    } else if (formel === 'halv_viljestark_nedat') {
      computed = Number.isFinite(willpower) ? Math.floor(willpower / 2) : 0;
    } else if (formel === 'stark_plus_3') {
      computed = Number.isFinite(strength) ? strength + 3 : 3;
    } else if (formel === 'stark_x_1_5_plus_3') {
      computed = Number.isFinite(strength) ? Math.ceil(strength * 1.5) + 3 : 3;
    } else if (formel === 'stark_x_0_5_plus_3') {
      computed = Number.isFinite(strength) ? Math.ceil(strength * 0.5) + 3 : 3;
    } else if (formel === 'halv_permanent_korruption_nedat') {
      computed = Number.isFinite(permanentCorruption) ? Math.floor(permanentCorruption / 2) : 0;
    } else if (formel === 'fjardedel_aktuell_smartgrans_nedat') {
      computed = Number.isFinite(currentPainThreshold) ? Math.floor(currentPainThreshold / 4) : 0;
    } else if (formel === 'niva') {
      computed = getEntryLevelValue(sourceEntry || {});
    } else if (formel === 'fjardedel_korruptionstroskel_uppat') {
      const threshold = Number(options?.korruptionstroskel || 0);
      computed = Math.ceil(threshold / 4);
    }

    return Number.isFinite(numericValue) ? computed * numericValue : computed;
  }

  function applyNumericChange(currentValue, rule, sourceEntry, options = {}) {
    const mode = normalizeLevelName(rule?.satt || '');
    const amount = getRuleNumericValue(rule, sourceEntry, options);
    if (!Number.isFinite(amount)) return currentValue;
    if (mode === 'ersatt' || mode === 'satt') return amount;
    return currentValue + amount;
  }

  function getCorruptionTrackStats(list, options = {}) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const willpower = Number(options?.viljestark || 0);
    const normalizedWillpower = Number.isFinite(willpower) ? willpower : 0;
    let korruptionstroskel = Math.ceil(normalizedWillpower / 2);
    let styggelsetroskel = normalizedWillpower;

    getListRules(entries, { key: 'andrar' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      const mal = String(rule?.mal || '').trim();
      if (mal === 'korruptionstroskel') {
        korruptionstroskel = applyNumericChange(
          korruptionstroskel,
          rule,
          rule?.sourceEntry,
          {
            ...options,
            viljestark: normalizedWillpower,
            aktuell_korruptionstroskel: korruptionstroskel,
            aktuell_styggelsetroskel: styggelsetroskel
          }
        );
        return;
      }
      if (mal === 'styggelsetroskel') {
        styggelsetroskel = applyNumericChange(
          styggelsetroskel,
          rule,
          rule?.sourceEntry,
          {
            ...options,
            viljestark: normalizedWillpower,
            aktuell_korruptionstroskel: korruptionstroskel,
            aktuell_styggelsetroskel: styggelsetroskel
          }
        );
      }
    });

    return {
      viljestark: normalizedWillpower,
      korruptionstroskel,
      styggelsetroskel
    };
  }

  function getCarryCapacityBase(list, options = {}) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const strength = Number(options?.stark || 0);
    const normalizedStrength = Number.isFinite(strength) ? strength : 0;
    let barkapacitetFaktor = 1;
    let barkapacitetTillagg = 3;
    let barkapacitetStarkTillagg = 0;

    getListRules(entries, { key: 'andrar', mal: 'barkapacitet_stark' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      barkapacitetStarkTillagg = applyNumericChange(
        barkapacitetStarkTillagg,
        rule,
        rule?.sourceEntry,
        { ...options, stark: normalizedStrength }
      );
    });

    getListRules(entries, { key: 'andrar', mal: 'barkapacitet_faktor' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      barkapacitetFaktor = applyNumericChange(
        barkapacitetFaktor,
        rule,
        rule?.sourceEntry,
        {
          ...options,
          stark: normalizedStrength,
          aktuell_barkapacitet_faktor: barkapacitetFaktor,
          aktuell_barkapacitet_tillagg: barkapacitetTillagg
        }
      );
    });

    getListRules(entries, { key: 'andrar', mal: 'barkapacitet_tillagg' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      barkapacitetTillagg = applyNumericChange(
        barkapacitetTillagg,
        rule,
        rule?.sourceEntry,
        {
          ...options,
          stark: normalizedStrength,
          aktuell_barkapacitet_faktor: barkapacitetFaktor,
          aktuell_barkapacitet_tillagg: barkapacitetTillagg
        }
      );
    });

    let barkapacitetBas = Math.ceil((normalizedStrength + barkapacitetStarkTillagg) * barkapacitetFaktor) + barkapacitetTillagg;

    // Compatibility path for earlier authored data that used direct base overrides.
    getListRules(entries, { key: 'andrar', mal: 'barkapacitet_bas' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      barkapacitetBas = applyNumericChange(
        barkapacitetBas,
        rule,
        rule?.sourceEntry,
        {
          ...options,
          stark: normalizedStrength,
          aktuell_barkapacitet_faktor: barkapacitetFaktor,
          aktuell_barkapacitet_tillagg: barkapacitetTillagg,
          aktuell_barkapacitet_bas: barkapacitetBas
        }
      );
    });

    return barkapacitetBas;
  }

  function getToughnessBase(list, options = {}) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const strength = Number(options?.stark || 0);
    const normalizedStrength = Number.isFinite(strength) ? strength : 0;
    let talighetBas = Math.max(10, normalizedStrength);
    let talighetTillagg = 0;

    getListRules(entries, { key: 'andrar', mal: 'talighet_bas' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      talighetBas = applyNumericChange(
        talighetBas,
        rule,
        rule?.sourceEntry,
        {
          ...options,
          stark: normalizedStrength,
          aktuell_talighet_bas: talighetBas,
          aktuell_talighet_tillagg: talighetTillagg
        }
      );
    });

    let talighetFaktor = 1;
    getListRules(entries, { key: 'andrar', mal: 'talighet_faktor' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      talighetFaktor = applyNumericChange(
        talighetFaktor,
        rule,
        rule?.sourceEntry,
        { ...options, stark: normalizedStrength, aktuell_talighet_bas: talighetBas }
      );
    });
    talighetBas = Math.ceil(talighetBas * talighetFaktor);

    getListRules(entries, { key: 'andrar', mal: 'talighet_tillagg' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      talighetTillagg = applyNumericChange(
        talighetTillagg,
        rule,
        rule?.sourceEntry,
        {
          ...options,
          stark: normalizedStrength,
          aktuell_talighet_bas: talighetBas,
          aktuell_talighet_tillagg: talighetTillagg
        }
      );
    });

    return talighetBas + talighetTillagg;
  }

  function flattenInventoryRows(inventory) {
    const out = [];
    const walk = (rows) => {
      (Array.isArray(rows) ? rows : []).forEach(row => {
        if (!row || typeof row !== 'object') return;
        out.push(row);
        if (Array.isArray(row.contains) && row.contains.length) {
          walk(row.contains);
        }
      });
    };
    walk(inventory);
    return out;
  }

  function getInventoryRowSourceEntry(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.taggar && typeof row.taggar === 'object') return row;
    const id = row.id;
    const name = row.name || row.namn;
    if (id === undefined && (typeof name !== 'string' || !name.trim())) return null;
    return resolveRuleSourceEntry({
      id,
      namn: typeof name === 'string' ? name.trim() : '',
      nivå: typeof row.nivå === 'string' ? row.nivå : ''
    });
  }

  function matchesInventoryRuleCondition(rule, row, sourceEntry) {
    return evaluateNar(rule?.nar, { row, sourceEntry });
  }

  function getTraitTotalMax(list, inventory, options = {}) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    let maxTotal = 80;

    getListRules(entries, { key: 'andrar', mal: 'karaktarsdrag_max_tillagg' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      maxTotal = applyNumericChange(maxTotal, rule, rule?.sourceEntry, options);
    });

    flattenInventoryRows(inventory).forEach(row => {
      const sourceEntry = getInventoryRowSourceEntry(row);
      if (!sourceEntry) return;
      const rowLevel = typeof row?.nivå === 'string' ? row.nivå : '';

      getRuleList(sourceEntry, 'andrar', { level: rowLevel }).forEach(rule => {
        if (String(rule?.mal || '') !== 'karaktarsdrag_max_tillagg') return;
        if (!matchesInventoryRuleCondition(rule, row, sourceEntry)) return;
        maxTotal = applyNumericChange(maxTotal, rule, sourceEntry, {
          ...options,
          trait: row?.trait || ''
        });
      });
    });

    return maxTotal;
  }

  function getPainThresholdModifier(list, options = {}) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const strength = Number(options?.stark || 0);
    const normalizedStrength = Number.isFinite(strength) ? strength : 0;
    const basePainThreshold = Math.ceil(normalizedStrength / 2);
    let currentPainThreshold = basePainThreshold;

    let smartgransFaktor = 1;
    getListRules(entries, { key: 'andrar', mal: 'smartgrans_faktor' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      smartgransFaktor = applyNumericChange(
        smartgransFaktor,
        rule,
        rule?.sourceEntry,
        { ...options, stark: normalizedStrength }
      );
    });
    currentPainThreshold = Math.ceil(currentPainThreshold * smartgransFaktor);

    getListRules(entries, { key: 'andrar', mal: 'smartgrans_tillagg' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      currentPainThreshold = applyNumericChange(
        currentPainThreshold,
        rule,
        rule?.sourceEntry,
        {
          ...options,
          stark: normalizedStrength,
          aktuell_smartgrans: currentPainThreshold
        }
      );
    });

    return currentPainThreshold - basePainThreshold;
  }

  function getProtectionTraditions(rule, options = {}) {
    const rawValue = rule?.varde;
    const fromValue = (typeof rawValue === 'string' || Array.isArray(rawValue))
      ? expandTraditions(
        toArray(rawValue).map(normalizeTradition).filter(Boolean),
        options?.traditionGraph || buildTraditionGraph(options?.list)
      )
      : [];
    if (fromValue.length) return fromValue;
    return getResolvedEntryTraditions(rule?.sourceEntry, options);
  }

  function getBestPermanentCorruptionProtection(list, targetEntry, options = {}) {
    const protectionRules = getListRules(list, { key: 'ger', mal: 'skydd_permanent_korruption' });
    const traditionGraph = options?.traditionGraph || buildTraditionGraph(list);
    const targetTraditions = getResolvedEntryTraditions(targetEntry, { traditionGraph });
    return protectionRules.reduce((best, rule) => {
      if (!matchesListCondition(rule, list)) return best;
      if (!matchesTargetCondition(rule, targetEntry, { traditionGraph })) return best;

      const ruleTraditions = getProtectionTraditions(rule, { list, traditionGraph });
      if (ruleTraditions.length && !targetTraditions.some(tradition => ruleTraditions.includes(tradition))) {
        return best;
      }

      return Math.max(best, getRuleNumericValue(rule, rule.sourceEntry, options));
    }, 0);
  }

  function getPermanentCorruptionBreakdown(list, options = {}) {
    const entries = Array.isArray(list) ? list.filter(entry => entry && typeof entry === 'object') : [];
    const traditionGraph = buildTraditionGraph(entries);
    const contributions = [];
    let runningPermanentCorruption = 0;

    entries.forEach(entry => {
      getRuleList(entry, 'ger', { level: entry?.nivå || '' }).forEach(rule => {
        if (String(rule?.mal || '') !== 'permanent_korruption') return;
        if (!matchesListCondition(rule, entries)) return;

        const amount = getRuleNumericValue(rule, entry, {
          ...options,
          aktuell_permanent_korruption: runningPermanentCorruption
        });
        if (!Number.isFinite(amount) || amount === 0) return;

        contributions.push({
          amount,
          sourceEntryId: entry.id,
          sourceEntryName: entry.namn || '',
          sourceEntryLevel: entry.nivå || '',
          kind: 'regel'
        });
        runningPermanentCorruption += amount;
      });

      const isMysticPower = entryHasType(entry, 'Mystisk kraft');
      const isRitual = entryHasType(entry, 'Ritual');
      if (!isMysticPower && !isRitual) return;

      const requiredLevel = isMysticPower
        ? Math.max(1, getEntryLevelValue(entry))
        : getRitualRequiredLevel(entry);
      const protection = getBestPermanentCorruptionProtection(entries, entry, {
        ...options,
        traditionGraph
      });
      const amount = isMysticPower
        ? Math.max(0, requiredLevel - protection)
        : (protection >= requiredLevel ? 0 : 1);

      if (!amount) return;
      contributions.push({
        amount,
        sourceEntryId: entry.id,
        sourceEntryName: entry.namn || '',
        sourceEntryLevel: entry.nivå || '',
        kind: isMysticPower ? 'mystisk_kraft' : 'ritual'
      });
      runningPermanentCorruption += amount;
    });

    const extraCorruption = Number(options?.corruption ?? options?.extra?.corruption ?? 0);
    if (Number.isFinite(extraCorruption) && extraCorruption !== 0) {
      contributions.push({
        amount: extraCorruption,
        sourceEntryId: '',
        sourceEntryName: 'Manuell justering',
        sourceEntryLevel: '',
        kind: 'justering'
      });
      runningPermanentCorruption += extraCorruption;
    }

    let total = contributions.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
    const faktor = queryMal(entries, 'permanent_korruption_faktor', { list: entries, ...options });
    if (Number.isFinite(Number(faktor)) && Number(faktor) !== 1) {
      total = Math.ceil(total * Number(faktor));
    }
    return { total, contributions };
  }

  function calcPermanentCorruption(list, options = {}) {
    return getPermanentCorruptionBreakdown(list, options).total;
  }

  const QUALITY_DISPLAY = Object.freeze({
    'Kort': 'kort',
    'Precist': 'precist',
    'Balanserad': 'balanserat',
    'Balanserat': 'balanserat',
    'Långt': 'långt',
    'Langt': 'långt'
  });

  function toLowerLabel(value) {
    return String(value || '').trim().toLowerCase();
  }

  function qualityToDisplay(value) {
    const label = String(value || '').trim();
    if (!label) return '';
    return QUALITY_DISPLAY[label] || toLowerLabel(label);
  }

  function joinLabelsWithOr(values) {
    const list = (Array.isArray(values) ? values : [])
      .map(qualityToDisplay)
      .filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} eller ${list[1]}`;
    return `${list.slice(0, -1).join(', ')} eller ${list[list.length - 1]}`;
  }

  function describeWeaponTarget(rule) {
    const foremal = rule?.nar?.foremal;
    const types = toArray(foremal?.typ).map(String);
    const excludedTypes = toArray(foremal?.ingen_typ).map(String);
    const anyQualities = toArray(foremal?.nagon_kvalitet);

    if (types.includes('Vapen') && excludedTypes.includes('Tunga vapen')) {
      return 'allt utom tunga vapen';
    }
    if (types.includes('Korta vapen')) {
      return 'korta vapen';
    }
    if (types.includes('Långa vapen')) {
      return 'långa vapen';
    }
    if (types.includes('Vapen') && anyQualities.length) {
      const qualityText = joinLabelsWithOr(anyQualities);
      return qualityText ? `${qualityText} vapen` : '';
    }
    if (types.includes('Vapen')) {
      return 'vapen';
    }
    return '';
  }

  function describeAttackContext(rule) {
    const nar = rule?.nar || {};
    const weaponTarget = describeWeaponTarget(rule);

    if (nar.overtag) return 'attacker med Övertag';
    if (nar.avstand) {
      return weaponTarget ? `avståndsattacker med ${weaponTarget}` : 'avståndsattacker';
    }
    if (nar.narstrid) {
      if (!weaponTarget) {
        return nar.efter_forflyttning
          ? 'närstridsattacker efter en förflyttning'
          : 'närstridsattacker';
      }
      const suffix = nar.efter_forflyttning ? ' efter en förflyttning' : '';
      return `närstridsattacker med ${weaponTarget}${suffix}`;
    }
    if (nar.efter_forflyttning) {
      return weaponTarget
        ? `attacker med ${weaponTarget} efter en förflyttning`
        : 'attacker efter en förflyttning';
    }
    if (weaponTarget) {
      return `attacker med ${weaponTarget}`;
    }
    return 'attacker';
  }

  function describeMysticContext(rule) {
    const nar = rule?.nar || {};
    const targets = [];
    if (nar.mystisk_kraft !== false) targets.push('mystiska förmågor');
    if (nar.ritual !== false) targets.push('ritualer');
    if (!targets.length) targets.push('mystiska förmågor', 'ritualer');
    if (targets.length === 1) return targets[0];
    return `${targets[0]} och ${targets[1]}`;
  }

  function getAttackTraitRuleNotes(list) {
    const seen = new Set();
    const out = [];
    getListRules(list, { key: 'andrar' }).forEach(rule => {
      if (String(rule?.satt || '') !== 'ersatt') return;
      const target = String(rule?.mal || '').trim();
      const trait = String(rule?.varde || '').trim();
      if (!trait) return;

      let summaryText = '';
      let extraText = '';
      if (target === 'anfall_karaktarsdrag') {
        const context = describeAttackContext(rule);
        summaryText = `${trait} som tr\u00e4ffs\u00e4ker f\u00f6r ${context}`;
        extraText = `Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r ${context}`;
      } else if (target === 'mystik_karaktarsdrag') {
        const context = describeMysticContext(rule);
        summaryText = `${trait} ist\u00e4llet f\u00f6r Viljestark vid ${context}`;
        extraText = `Kan anv\u00e4ndas ist\u00e4llet f\u00f6r Viljestark vid anv\u00e4ndandet av ${context}`;
      } else {
        return;
      }

      const dedupeKey = `${trait}|${summaryText}|${extraText}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      out.push({
        trait,
        summaryText,
        extraText,
        sourceEntryId: rule.sourceEntryId,
        sourceEntryName: rule.sourceEntryName,
        sourceEntryLevel: rule.sourceEntryLevel
      });
    });
    return out;
  }

  function hasRules(entry, options = {}) {
    return RULE_KEYS.some(key => getRuleList(entry, key, options).length > 0);
  }

  // --- Mal handler registry (Phase B) ---
  // Numeric mals: handler(list, context) → number
  registerMal('korruptionstroskel', (list, ctx) =>
    getCorruptionTrackStats(list, ctx).korruptionstroskel);
  registerMal('styggelsetroskel', (list, ctx) =>
    getCorruptionTrackStats(list, ctx).styggelsetroskel);
  registerMal('permanent_korruption', (list, ctx) =>
    getPermanentCorruptionBreakdown(list, ctx).total);
  registerMal('permanent_korruption_halvera', (list) =>
    hasPermanentCorruptionHalving(list));
  registerMal('permanent_korruption_faktor', (list, ctx) => {
    const rules = getListRules(list, { key: 'andrar', mal: 'permanent_korruption_faktor' });
    return rules.filter(r => evaluateNar(r.nar, { list, ...ctx }))
      .reduce((prod, r) => prod * Number(r.varde ?? 1), 1);
  });
  registerMal('barkapacitet_stark', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'barkapacitet_stark' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((sum, r) => applyNumericChange(sum, r, r.sourceEntry, ctx), 0);
  });
  registerMal('talighet_bas', (list, ctx) => getToughnessBase(list, ctx));
  registerMal('talighet_faktor', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'talighet_faktor' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((val, r) => applyNumericChange(val, r, r.sourceEntry, ctx), 1);
  });
  registerMal('smartgrans_faktor', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'smartgrans_faktor' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((val, r) => applyNumericChange(val, r, r.sourceEntry, ctx), 1);
  });
  registerMal('talighet_tillagg', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'talighet_tillagg' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((sum, r) => applyNumericChange(sum, r, r.sourceEntry, ctx), 0);
  });
  registerMal('smartgrans_tillagg', (list, ctx) => getPainThresholdModifier(list, ctx));
  registerMal('barkapacitet', (list, ctx) => getCarryCapacityBase(list, ctx));
  registerMal('barkapacitet_faktor', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'barkapacitet_faktor' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((val, r) => applyNumericChange(val, r, r.sourceEntry, ctx), 1);
  });
  registerMal('barkapacitet_tillagg', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'barkapacitet_tillagg' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((val, r) => applyNumericChange(val, r, r.sourceEntry, ctx), 3);
  });
  registerMal('barkapacitet_bas', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'barkapacitet_bas' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((val, r) => applyNumericChange(val, r, r.sourceEntry, ctx), 0);
  });
  registerMal('forsvar_modifierare', (list, ctx) => {
    const facts = Array.isArray(ctx?.weaponFacts)
      ? ctx.weaponFacts
      : (Array.isArray(ctx?.vapenFakta) ? ctx.vapenFakta : []);
    return getDefenseModifier(list, facts, ctx || {});
  });
  registerMal('traffsaker_modifierare_vapen', (list, ctx) => getWeaponAttackBonus(list, ctx));
  registerMal('karaktarsdrag_max_tillagg', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'karaktarsdrag_max_tillagg' });
    return rules.filter(r => matchesListCondition(r, entries))
      .reduce((sum, r) => applyNumericChange(sum, r, r.sourceEntry, ctx), 0);
  });
  registerMal('begransning_modifierare', (list, ctx) => getArmorRestrictionBonus(ctx?.qualityNames || [], ctx));
  registerMal('begransning_modifierare_fast', (list, ctx) => getArmorRestrictionBonusFast(ctx?.qualityNames || [], ctx));
  registerMal('nollstall_begransning_modifierare', (list) => hasArmorRestrictionReset(list));
  registerMal('tillater_monstruost', () => ({ allowAll: false, allowedNames: new Set() }));
  registerMal('anfall_karaktarsdrag', (list, ctx) => getAttackTraitRuleNotes(list, ctx));
  registerMal('forsvar_karaktarsdrag', (list, ctx) => getDefenseTraitRuleCandidates(list, ctx));
  registerMal('dansande_forsvar_karaktarsdrag', (list, ctx) => getDancingDefenseTraitRuleCandidates(list, ctx));
  registerMal('mystik_karaktarsdrag', (list) => getListRules(list, { key: 'andrar', mal: 'mystik_karaktarsdrag' }));
  registerMal('post', (list) => getListRules(list, { key: 'ger', mal: 'post' }));
  registerMal('foremal', (list, ctx) => getInventoryGrantItems(list, ctx));
  registerMal('pengar', (list, ctx) => getMoneyGrant(list, ctx));
  registerMal('skydd_permanent_korruption', (list) => getListRules(list, { key: 'ger', mal: 'skydd_permanent_korruption' }));

  window.rulesHelper = {
    RULE_KEYS,
    MAL_REGISTRY,
    registerMal,
    queryMal,
    normalizeRuleBlock,
    mergeRuleBlocks,
    getTopLevelRules,
    getLevelRules,
    getEntryRules,
    getRuleList,
    getListRules,
    evaluateNar,
    getConflictReasonsForCandidate,
    getConflictResolutionForCandidate,
    getMissingRequirementReasonsForCandidate,
    evaluateEntryStops,
    formatEntryStopMessages,
    getRequirementDependents,
    getEntryGrantTargets,
    getEntryGrantDependents,
    getPartialGrantInfo,
    getGrantedLevelRestriction,
    getMoneyGrant,
    validateDefenseLoadout,
    normalizeDefenseLoadout,
    getDefenseModifier,
    getEquippedDefenseModifier,
    getDefenseValueModifier,
    getArmorDefenseModifier,
    evaluateVapenNar,
    sumVapenBonusByMal,
    sumVapenBonus,
    getWeaponDefenseBonus,
    getWeaponAttackBonus,
    getEquippedWeaponEntryDefenseBonus,
    getEquippedWeaponEntryAttackBonus,
    getEquippedQualityVapenBonus,
    getEquippedQualityDefenseBonus,
    getEquippedQualityAttackBonus,
    evaluateRustningNar,
    sumRustningBonus,
    getArmorRestrictionBonus,
    getArmorRestrictionBonusFast,
    hasArmorRestrictionReset,
    getInventoryGrantItems,
    getAttackTraitRuleCandidates,
    getDefenseTraitRuleCandidates,
    getDancingDefenseTraitRuleCandidates,
    hasPermanentCorruptionHalving,
    getMonstruosTraitPermissions,
    getAttackTraitRuleNotes,
    getCorruptionTrackStats,
    getCarryCapacityBase,
    getToughnessBase,
    getTraitTotalMax,
    getPainThresholdModifier,
    getPermanentCorruptionBreakdown,
    calcPermanentCorruption,
    hasRules
  };
})(window);
