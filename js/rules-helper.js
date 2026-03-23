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
  const CHOICE_FIELDS = Object.freeze(['trait', 'race', 'form', 'artifactEffect']);
  const CHOICE_FIELD_DISPLAY_LABELS = Object.freeze({
    trait: 'Karaktärsdrag',
    race: 'Ras',
    form: 'Form',
    artifactEffect: 'Betalning'
  });
  const CHOICE_DUPLICATE_POLICIES = Object.freeze(['allow', 'reject', 'confirm', 'replace_existing']);
  const MONSTER_LORE_SPECS = Object.freeze(['Bestar', 'Kulturvarelser', 'Odöda', 'Styggelser']);
  const EXCEPTION_TRAITS = Object.freeze(['Diskret', 'Kvick', 'Listig', 'Stark', 'Träffsäker', 'Vaksam', 'Viljestark', 'Övertygande']);
  const CHOICE_EMPTY_VALUE_KEY = '__empty__';
  const CHOICE_SOURCE_ONLY_SELECTED_KEYS = Object.freeze([
    'endast_valda',
    'endastValda',
    'endast valda',
    'only_selected',
    'onlySelected',
    'selected_only',
    'selectedOnly'
  ]);
  const CHOICE_SOURCE_ONLY_SELECTED_TYP_TOKENS = new Set([
    '__onlyselected',
    'onlyselected',
    'only_selected',
    'selectedonly',
    'selected_only',
    'endast valda',
    'endast_valda',
    'endastvalda'
  ]);
  const NAR_ONLY_SELECTED_KEYS = Object.freeze([
    'endast_valda',
    'endastValda',
    'endast valda',
    'only_selected',
    'onlySelected',
    'selected_only',
    'selectedOnly'
  ]);
  const ARTIFACT_BINDING_TAG_KEYS = Object.freeze([
    'artefakt_bindning',
    'artefakt_bindningar',
    'artefaktbindning',
    'artefaktbindningar',
    'artifact_binding',
    'artifact_bindings',
    'artifactbinding',
    'artifactbindings',
    'artifactEffectOptions',
    'artifactEffects',
    'artifact_effect_options',
    'artifact_effects'
  ]);
  const LIMIT_IGNORE_TAG_KEYS = Object.freeze([
    'ignore_limits',
    'ignore_limit',
    'ignorelimits',
    'ignorelimit',
    'ignoreLimits',
    'ignoreLimit',
    'bypass_limits',
    'bypass_limit'
  ]);
  const REQUIREMENT_SCOPE_LOGIC_KEYS = Object.freeze([
    'kraver_logik',
    'krav_logik'
  ]);
  const REQUIREMENT_SCOPE_COMBINATION_LOGIC_KEYS = Object.freeze([
    'kraver_typ_och_entry',
    'krav_typ_och_entry'
  ]);
  const ARTIFACT_EFFECT_STAT_KEY_MAP = Object.freeze({
    xp: 'xp',
    erf: 'xp',
    erfarenhet: 'xp',
    erfarenhetspoang: 'xp',
    experience: 'xp',
    corruption: 'corruption',
    korruption: 'corruption',
    permanent_korruption: 'corruption',
    permanentkorruption: 'corruption',
    permanent_corruption: 'corruption',
    permanentcorruption: 'corruption',
    toughness: 'toughness',
    talighet: 'toughness',
    pain: 'pain',
    smartgrans: 'pain',
    smartgransen: 'pain',
    capacity: 'capacity',
    barkapacitet: 'capacity'
  });
  const TRAIT_VALUE_ALIASES = Object.freeze({
    diskret: 'Diskret',
    kvick: 'Kvick',
    listig: 'Listig',
    stark: 'Stark',
    traffsaker: 'Träffsäker',
    vaksam: 'Vaksam',
    viljestark: 'Viljestark',
    overtygande: 'Övertygande'
  });
  const SNAPSHOT_RULE_LIST_KEYS = Object.freeze(['__snapshotRules', '__resolvedRules']);
  const ARTIFACT_BINDING_PRESETS = Object.freeze({
    unbound: Object.freeze({
      value: '',
      label: 'Obunden',
      effects: Object.freeze({})
    }),
    corruption: Object.freeze({
      value: 'corruption',
      label: '+1 Permanent korruption',
      effects: Object.freeze({ corruption: 1 })
    }),
    xp: Object.freeze({
      value: 'xp',
      label: '−1 Erfarenhetspoäng',
      effects: Object.freeze({ xp: 1 })
    })
  });
  const ARTIFACT_BINDING_PRESET_ALIASES = Object.freeze({
    '': 'unbound',
    obunden: 'unbound',
    unbound: 'unbound',
    none: 'unbound',
    ingen: 'unbound',
    corruption: 'corruption',
    korruption: 'corruption',
    permanent_korruption: 'corruption',
    permanentkorruption: 'corruption',
    permanent_corruption: 'corruption',
    permanentcorruption: 'corruption',
    xp: 'xp',
    erf: 'xp',
    erfarenhet: 'xp',
    erfarenhetspoang: 'xp',
    experience: 'xp'
  });

  const MAL_REGISTRY = new Map();
  const MANUAL_ENTRY_ERF_OVERRIDES = new Map();

  function registerMal(mal, handler) {
    MAL_REGISTRY.set(String(mal), handler);
  }

  function resolveTraitValueFromContext(rawMal, context = {}) {
    const mal = String(rawMal || '').trim();
    if (!mal) return null;
    const token = normalizeLevelName(mal);
    let traitToken = token;
    if (token.startsWith('trait:')) traitToken = token.slice(6).trim();
    if (token.startsWith('karaktarsdrag:')) traitToken = token.slice(14).trim();
    const canonical = TRAIT_VALUE_ALIASES[traitToken];
    if (!canonical) return null;

    const traits = context?.traits && typeof context.traits === 'object' && !Array.isArray(context.traits)
      ? context.traits
      : {};
    const byCanonical = Number(traits[canonical]);
    if (Number.isFinite(byCanonical)) return byCanonical;

    const byLower = Number(context?.[traitToken]);
    if (Number.isFinite(byLower)) return byLower;

    const byCanonicalKey = Number(context?.[canonical]);
    if (Number.isFinite(byCanonicalKey)) return byCanonicalKey;

    return null;
  }

  function queryMal(list, mal, context) {
    const entries = Array.isArray(list) ? list : [];
    const ctx = context || {};
    if (!ctx.bypassResolveMal && typeof ctx.resolveMal === 'function') {
      try {
        const resolved = ctx.resolveMal(String(mal), { ...ctx, bypassResolveMal: true });
        if (resolved !== undefined) return resolved;
      } catch (_) {
        // Fall through to registry/default handlers on resolver errors.
      }
    }
    const traitValue = resolveTraitValueFromContext(mal, ctx);
    if (traitValue !== null) return traitValue;
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

  function parseRequirementLogic(value) {
    const token = normalizeLevelName(value);
    if (token === 'and' || token === 'och' || token === 'all') return 'and';
    if (token === 'or' || token === 'eller' || token === 'any') return 'or';
    return '';
  }

  function normalizeRequirementLogic(value, fallback = 'or') {
    const parsed = parseRequirementLogic(value);
    if (parsed) return parsed;
    return parseRequirementLogic(fallback) || 'or';
  }

  function readRequirementLogicFromContainer(container, keys = []) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) return '';
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
      const parsed = parseRequirementLogic(container[key]);
      if (parsed) return parsed;
    }
    return '';
  }

  function isTruthyRuleValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const norm = normalizeLevelName(value);
    return ['true', '1', 'yes', 'ja', 'on'].includes(norm);
  }

  function readIgnoreLimitFlagFromContainer(container) {
    const raw = getTaggedConfigValue(container, LIMIT_IGNORE_TAG_KEYS);
    if (raw === undefined) return null;
    return isTruthyRuleValue(raw);
  }

  function entryIgnoresLimits(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return false;
    if (isTruthyRuleValue(context?.ignoreLimits) || isTruthyRuleValue(context?.limitBypass)) return true;

    const fromTags = readIgnoreLimitFlagFromContainer(entry?.taggar);
    if (fromTags !== null) return fromTags;

    const fromEntry = readIgnoreLimitFlagFromContainer(entry);
    if (fromEntry !== null) return fromEntry;

    return false;
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

  function getRuleOverrideToken(key, rule) {
    if (!rule || typeof rule !== 'object') return '';
    const explicitId = String(rule.regel_id || rule.rule_id || rule.id || '').trim();
    if (explicitId) return `id:${normalizeLevelName(explicitId)}`;

    const mal = String(rule.mal || '').trim();
    if (mal) return `mal:${normalizeLevelName(mal)}`;

    const nar = rule.nar && typeof rule.nar === 'object' ? rule.nar : {};
    const ruleNames = toArray(rule.namn).map(name => normalizeLevelName(name)).filter(Boolean);
    const narNames = toArray(nar.namn).map(name => normalizeLevelName(name)).filter(Boolean);
    const narTypes = toArray(nar.typ).map(type => normalizeLevelName(type)).filter(Boolean);
    const narTraditions = toArray(nar.ark_trad).map(trad => normalizeLevelName(trad)).filter(Boolean);

    const names = Array.from(new Set([...ruleNames, ...narNames])).sort();
    const types = Array.from(new Set(narTypes)).sort();
    const traditions = Array.from(new Set(narTraditions)).sort();

    if (names.length || types.length || traditions.length) {
      return `${key}:names=${names.join(',')}|types=${types.join(',')}|ark_trad=${traditions.join(',')}`;
    }
    return '';
  }

  function mergeRuleListsByHierarchy(lowPriority, highPriority, key) {
    const low = toRuleList(lowPriority);
    const high = toRuleList(highPriority);
    if (!low.length) return high;
    if (!high.length) return low;

    const highTokens = new Set(
      high
        .map(rule => getRuleOverrideToken(key, rule))
        .filter(Boolean)
    );

    const baseline = highTokens.size
      ? low.filter(rule => !highTokens.has(getRuleOverrideToken(key, rule)))
      : low;

    return baseline.concat(high);
  }

  function mergeRuleBlocksByHierarchy(lowPriority, highPriority) {
    const out = {};
    RULE_KEYS.forEach(key => {
      const list = mergeRuleListsByHierarchy(lowPriority?.[key], highPriority?.[key], key);
      if (list.length) out[key] = list;
    });
    return out;
  }

  function getTypeRuleMap(entry) {
    const map = entry?.__typ_regler || entry?.typ_regler || entry?.__type_rules || entry?.type_rules;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    return map;
  }

  function attachTypeRuleMap(entry, typeRules) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    if (!typeRules || typeof typeRules !== 'object' || Array.isArray(typeRules)) return entry;
    if (!Object.keys(typeRules).length) return entry;
    try {
      Object.defineProperty(entry, '__typ_regler', {
        value: typeRules,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (_) {
      entry.__typ_regler = typeRules;
    }
    return entry;
  }

  function normalizeTypeRuleTemplate(rawTemplate) {
    if (!rawTemplate || typeof rawTemplate !== 'object' || Array.isArray(rawTemplate)) return null;
    if (rawTemplate.taggar && typeof rawTemplate.taggar === 'object' && !Array.isArray(rawTemplate.taggar)) {
      return { taggar: rawTemplate.taggar };
    }

    const taggar = {};

    if (rawTemplate.regler && typeof rawTemplate.regler === 'object' && !Array.isArray(rawTemplate.regler)) {
      taggar.regler = rawTemplate.regler;
    } else if (RULE_KEYS.some(key => rawTemplate[key] !== undefined)) {
      taggar.regler = rawTemplate;
    }

    if (rawTemplate.nivå_data && typeof rawTemplate.nivå_data === 'object' && !Array.isArray(rawTemplate.nivå_data)) {
      taggar.nivå_data = rawTemplate.nivå_data;
    } else if (rawTemplate.niva_data && typeof rawTemplate.niva_data === 'object' && !Array.isArray(rawTemplate.niva_data)) {
      taggar.niva_data = rawTemplate.niva_data;
    }

    if (rawTemplate.max_antal !== undefined) {
      taggar.max_antal = rawTemplate.max_antal;
    }
    if (rawTemplate.kan_införskaffas_flera_gånger !== undefined) {
      taggar.kan_införskaffas_flera_gånger = rawTemplate.kan_införskaffas_flera_gånger;
    }
    if (rawTemplate.kan_inforskaffas_flera_ganger !== undefined) {
      taggar.kan_inforskaffas_flera_ganger = rawTemplate.kan_inforskaffas_flera_ganger;
    }

    if (!Object.keys(taggar).length) return null;
    return { taggar };
  }

  function getTypeRuleTemplateEntries(entry) {
    const map = getTypeRuleMap(entry);
    if (!map) return [];

    const mapByType = new Map();
    Object.keys(map).forEach(typeName => {
      const normalized = normalizeLevelName(typeName);
      if (!normalized) return;
      if (!mapByType.has(normalized)) mapByType.set(normalized, []);
      mapByType.get(normalized).push(typeName);
    });

    const out = [];
    const seenTemplates = new Set();
    getEntryTypes(entry).forEach(typeName => {
      const normalized = normalizeLevelName(typeName);
      const matching = mapByType.get(normalized) || [];
      matching.forEach(rawKey => {
        if (seenTemplates.has(rawKey)) return;
        seenTemplates.add(rawKey);
        const template = normalizeTypeRuleTemplate(map[rawKey]);
        if (template) out.push(template);
      });
    });
    return out;
  }

  function getTypeRules(entry, level = '') {
    const templates = getTypeRuleTemplateEntries(entry);
    if (!templates.length) return {};

    return templates.reduce((acc, templateEntry) => {
      const block = !level
        ? getTopLevelRules(templateEntry)
        : mergeRuleBlocks(getTopLevelRules(templateEntry), getLevelRules(templateEntry, level));
      return mergeRuleBlocksByHierarchy(acc, block);
    }, {});
  }

  function readRequirementRuleConfig(container) {
    return {
      scopeLogic: readRequirementLogicFromContainer(container, REQUIREMENT_SCOPE_LOGIC_KEYS),
      scopeCombinationLogic: readRequirementLogicFromContainer(container, REQUIREMENT_SCOPE_COMBINATION_LOGIC_KEYS)
    };
  }

  function mergeRequirementRuleConfigs(lowPriority, highPriority) {
    return {
      scopeLogic: String(highPriority?.scopeLogic || '').trim() || String(lowPriority?.scopeLogic || '').trim(),
      scopeCombinationLogic: String(highPriority?.scopeCombinationLogic || '').trim()
        || String(lowPriority?.scopeCombinationLogic || '').trim()
    };
  }

  function getEntryRequirementRuleConfig(entry, level = '') {
    const top = readRequirementRuleConfig(getTopLevelRuleContainer(entry));
    const levelConfig = getLevelRuleContainers(entry, level)
      .map(readRequirementRuleConfig)
      .reduce((acc, cfg) => mergeRequirementRuleConfigs(acc, cfg), {});
    return mergeRequirementRuleConfigs(top, levelConfig);
  }

  function getTypeRequirementRuleConfig(entry, level = '') {
    const templates = getTypeRuleTemplateEntries(entry);
    if (!templates.length) return {};
    return templates.reduce((acc, templateEntry) => {
      const top = readRequirementRuleConfig(getTopLevelRuleContainer(templateEntry));
      const levelConfig = getLevelRuleContainers(templateEntry, level)
        .map(readRequirementRuleConfig)
        .reduce((tmpAcc, cfg) => mergeRequirementRuleConfigs(tmpAcc, cfg), {});
      const mergedTemplateConfig = mergeRequirementRuleConfigs(top, levelConfig);
      return mergeRequirementRuleConfigs(acc, mergedTemplateConfig);
    }, {});
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

  function getTopLevelRuleContainer(entry) {
    const raw = entry?.taggar?.regler;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw;
  }

  function getLevelRuleContainers(entry, level) {
    const levelData = getLevelDataMap(entry);
    if (!levelData || typeof levelData !== 'object') return [];
    const wanted = normalizeLevelName(level);
    if (!wanted) return [];

    const configuredOrder = Array.isArray(window.LVL) && window.LVL.length
      ? window.LVL.map(normalizeLevelName).filter(Boolean)
      : DEFAULT_LEVEL_ORDER;
    const order = configuredOrder.length ? configuredOrder : DEFAULT_LEVEL_ORDER;
    const wantedIndex = order.indexOf(wanted);

    if (wantedIndex === -1) {
      const raw = findLevelData(entry, level)?.regler;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
      return [raw];
    }

    return Object.keys(levelData)
      .map(key => ({
        key,
        index: order.indexOf(normalizeLevelName(key))
      }))
      .filter(item => item.index !== -1 && item.index <= wantedIndex)
      .sort((a, b) => a.index - b.index)
      .map(item => levelData[item.key]?.regler)
      .filter(raw => raw && typeof raw === 'object' && !Array.isArray(raw));
  }

  function getTopLevelRules(entry) {
    return normalizeRuleBlock(getTopLevelRuleContainer(entry));
  }

  function getLevelRules(entry, level) {
    const blocks = getLevelRuleContainers(entry, level).map(normalizeRuleBlock);
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
    const hasInlineRules = entryHasInlineRules(entry);
    if (hasInlineRules && getTypeRuleMap(entry)) return entry;
    if (typeof window.lookupEntry !== 'function') return entry;

    const query = {};
    if (entry.id !== undefined && entry.id !== null) query.id = entry.id;
    if (typeof entry.namn === 'string' && entry.namn.trim()) query.name = entry.namn;
    if (!Object.keys(query).length) return entry;

    try {
      const hit = window.lookupEntry(query);
      if (hit && typeof hit === 'object') {
        const hitTypeRules = getTypeRuleMap(hit);
        if (hasInlineRules) {
          return attachTypeRuleMap(entry, hitTypeRules);
        }
        const extendsName = typeof hit.taggar?.extends === 'string' ? hit.taggar.extends.trim() : '';
        if (extendsName) {
          try {
            const base = window.lookupEntry({ name: extendsName });
            if (base && typeof base === 'object') {
              return attachTypeRuleMap({
                ...hit,
                taggar: {
                  ...hit.taggar,
                  regler: mergeRuleBlocks(base.taggar?.regler || {}, hit.taggar?.regler || {})
                }
              }, hitTypeRules);
            }
          } catch (_) { /* ignore base lookup errors */ }
        }
        return attachTypeRuleMap(hit, hitTypeRules);
      }
    } catch (_) {
      // Ignore lookup errors and keep the original entry as source.
    }

    return entry;
  }

  function getEntryRules(entry, options = {}) {
    const level = options && typeof options === 'object' ? options.level : '';
    const sourceEntry = resolveRuleSourceEntry(entry);
    const typeRules = getTypeRules(sourceEntry, level);
    const entryRules = !level
      ? getTopLevelRules(sourceEntry)
      : mergeRuleBlocks(getTopLevelRules(sourceEntry), getLevelRules(sourceEntry, level));
    return mergeRuleBlocksByHierarchy(typeRules, entryRules);
  }

  function getRuleList(entry, key, options = {}) {
    if (!RULE_KEYS.includes(key)) return [];
    return toRuleList(getEntryRules(entry, options)[key]);
  }

  function normalizeChoiceField(value) {
    const field = String(value || '').trim();
    return CHOICE_FIELDS.includes(field) ? field : '';
  }

  function normalizeChoiceDuplicatePolicy(value) {
    const policy = String(value || '').trim().toLowerCase();
    return CHOICE_DUPLICATE_POLICIES.includes(policy) ? policy : 'allow';
  }

  function normalizeChoiceRule(rawRule) {
    if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) return null;
    const field = normalizeChoiceField(rawRule.field || rawRule.mal);
    if (!field) return null;

    const rule = { field };
    if (rawRule.title !== undefined) rule.title = String(rawRule.title || '').trim();
    if (rawRule.subtitle !== undefined) rule.subtitle = String(rawRule.subtitle || '').trim();
    if (rawRule.search !== undefined) rule.search = isTruthyRuleValue(rawRule.search);
    if (rawRule.exclude_used !== undefined) rule.exclude_used = isTruthyRuleValue(rawRule.exclude_used);
    rule.duplicate_policy = normalizeChoiceDuplicatePolicy(rawRule.duplicate_policy);

    if (rawRule.duplicate_message !== undefined) {
      rule.duplicate_message = String(rawRule.duplicate_message || '').trim();
    }
    if (rawRule.options !== undefined) {
      rule.options = cloneRuleValue(toArray(rawRule.options));
    }
    if (rawRule.source && typeof rawRule.source === 'object' && !Array.isArray(rawRule.source)) {
      rule.source = cloneRuleValue(rawRule.source);
    }
    if (rawRule.nar && typeof rawRule.nar === 'object' && !Array.isArray(rawRule.nar)) {
      rule.nar = cloneRuleValue(rawRule.nar);
    }
    return rule;
  }

  function normalizeChoiceOptionKey(value) {
    const token = normalizeChoiceUsedValue(value);
    return token || CHOICE_EMPTY_VALUE_KEY;
  }

  function getArtifactBindingPresetName(value) {
    const token = normalizeChoiceUsedValue(value);
    if (Object.prototype.hasOwnProperty.call(ARTIFACT_BINDING_PRESET_ALIASES, token)) {
      return ARTIFACT_BINDING_PRESET_ALIASES[token];
    }
    return '';
  }

  function cloneArtifactBindingPreset(name) {
    const preset = ARTIFACT_BINDING_PRESETS[name];
    if (!preset) return null;
    return {
      value: preset.value,
      label: preset.label,
      effects: { ...(preset.effects || {}) }
    };
  }

  function normalizeArtifactEffectMap(rawMap, fallbackPreset = '') {
    const out = {};
    if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
      Object.keys(rawMap).forEach(rawKey => {
        const statKey = ARTIFACT_EFFECT_STAT_KEY_MAP[normalizeCompareToken(rawKey)];
        if (!statKey) return;
        const value = Number(rawMap[rawKey]);
        if (!Number.isFinite(value) || value === 0) return;
        out[statKey] = (out[statKey] || 0) + value;
      });
    }

    if (Object.keys(out).length) return out;
    const fallback = cloneArtifactBindingPreset(fallbackPreset);
    if (fallback && fallback.effects && typeof fallback.effects === 'object') {
      Object.keys(fallback.effects).forEach(key => {
        const value = Number(fallback.effects[key]);
        if (!Number.isFinite(value) || value === 0) return;
        out[key] = value;
      });
    }
    return out;
  }

  function getTaggedConfigValue(container, wantedKeys) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) return undefined;
    for (const key of wantedKeys) {
      if (Object.prototype.hasOwnProperty.call(container, key)) return container[key];
    }
    const wanted = new Set(wantedKeys.map(normalizeCompareToken));
    for (const key of Object.keys(container)) {
      if (wanted.has(normalizeCompareToken(key))) return container[key];
    }
    return undefined;
  }

  function getArtifactBindingConfig(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const fromTags = getTaggedConfigValue(entry?.taggar, ARTIFACT_BINDING_TAG_KEYS);
    if (fromTags !== undefined) return fromTags;
    const fromEntry = getTaggedConfigValue(entry, ARTIFACT_BINDING_TAG_KEYS);
    if (fromEntry !== undefined) return fromEntry;
    return null;
  }

  function getArtifactBindingConfigOptions(rawConfig) {
    if (rawConfig === undefined || rawConfig === null) return null;
    if (Array.isArray(rawConfig)) return rawConfig;
    if (rawConfig && typeof rawConfig === 'object') {
      const optionKeys = ['options', 'alternativ', 'choices', 'val', 'betalning', 'kostnad', 'cost'];
      const fromObject = getTaggedConfigValue(rawConfig, optionKeys);
      if (fromObject !== undefined) return toArray(fromObject);
      const hasInlineOptionKeys = (
        rawConfig.value !== undefined
        || rawConfig.varde !== undefined
        || rawConfig.id !== undefined
        || rawConfig.key !== undefined
        || rawConfig.preset !== undefined
        || rawConfig.typ !== undefined
        || rawConfig.namn !== undefined
        || rawConfig.name !== undefined
      );
      return hasInlineOptionKeys ? [rawConfig] : null;
    }
    return [rawConfig];
  }

  function normalizeArtifactBindingOption(rawOption) {
    if (rawOption === undefined || rawOption === null) return null;

    if (typeof rawOption !== 'object' || Array.isArray(rawOption)) {
      const value = String(rawOption).trim();
      const presetName = getArtifactBindingPresetName(value);
      if (presetName) return cloneArtifactBindingPreset(presetName);
      return {
        value,
        label: value,
        effects: {}
      };
    }

    const rawValue = rawOption.value ?? rawOption.varde ?? rawOption.id ?? rawOption.namn ?? rawOption.key;
    const presetName = getArtifactBindingPresetName(
      rawOption.preset ?? rawOption.typ ?? rawValue ?? ''
    );

    let value = '';
    if (rawValue !== undefined && rawValue !== null) {
      value = String(rawValue).trim();
    } else if (presetName) {
      value = ARTIFACT_BINDING_PRESETS[presetName].value;
    } else {
      return null;
    }

    const canonicalPreset = presetName || getArtifactBindingPresetName(value);
    if (canonicalPreset) {
      value = ARTIFACT_BINDING_PRESETS[canonicalPreset].value;
    }

    const rawLabel = rawOption.label ?? rawOption.text ?? rawOption.name ?? null;
    const label = rawLabel !== null && rawLabel !== undefined
      ? String(rawLabel)
      : (canonicalPreset ? ARTIFACT_BINDING_PRESETS[canonicalPreset].label : (value || ARTIFACT_BINDING_PRESETS.unbound.label));

    const rawEffects = rawOption.effects
      ?? rawOption.effekter
      ?? rawOption.effect
      ?? rawOption.kostnad
      ?? rawOption.cost;
    const effects = normalizeArtifactEffectMap(rawEffects, canonicalPreset || '');
    const rawRules = rawOption.regler
      ?? rawOption.rules
      ?? rawOption.ruleBlock
      ?? null;
    const regler = normalizeRuleBlock(rawRules);

    const out = { value, label, effects };
    if (Object.keys(regler).length) out.regler = regler;
    if (rawOption.search !== undefined) out.search = String(rawOption.search || '');
    if (rawOption.disabled !== undefined) out.disabled = isTruthyRuleValue(rawOption.disabled);
    if (rawOption.disabledReason !== undefined) out.disabledReason = String(rawOption.disabledReason || '');
    return out;
  }

  function normalizeArtifactBindingOptions(rawOptions) {
    const normalized = toArray(rawOptions)
      .map(normalizeArtifactBindingOption)
      .filter(Boolean);

    const seen = new Set();
    const out = [];
    const pushUnique = (option) => {
      const key = normalizeChoiceOptionKey(option?.value);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(option);
    };

    pushUnique(cloneArtifactBindingPreset('unbound'));
    normalized.forEach(option => {
      const key = normalizeChoiceOptionKey(option?.value);
      if (key === CHOICE_EMPTY_VALUE_KEY) return;
      pushUnique(option);
    });

    return out;
  }

  function createDefaultArtifactBindingChoiceRule() {
    return {
      field: 'artifactEffect',
      title: 'Välj betalning',
      subtitle: 'Välj hur artefakten ska bindas.',
      options: normalizeArtifactBindingOptions([
        cloneArtifactBindingPreset('corruption'),
        cloneArtifactBindingPreset('xp')
      ])
    };
  }

  function applyArtifactBindingChoiceConfig(rule, sourceEntry, context = {}) {
    const wantedField = normalizeChoiceField(context?.field);
    if (wantedField && wantedField !== 'artifactEffect') return rule;
    if (!entryHasType(sourceEntry, 'Artefakt')) return rule;

    const baseRule = normalizeChoiceRule(rule || createDefaultArtifactBindingChoiceRule());
    if (!baseRule || baseRule.field !== 'artifactEffect') return baseRule;

    const rawConfig = getArtifactBindingConfig(sourceEntry);
    const configObj = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig : null;
    const configOptions = rawConfig !== null && rawConfig !== undefined
      ? getArtifactBindingConfigOptions(rawConfig)
      : null;
    const rawOptions = configOptions === null ? toArray(baseRule.options) : configOptions;
    const options = normalizeArtifactBindingOptions(rawOptions);

    if (configObj) {
      if (configObj.title !== undefined) baseRule.title = String(configObj.title || '').trim();
      if (configObj.subtitle !== undefined) baseRule.subtitle = String(configObj.subtitle || '').trim();
      if (configObj.search !== undefined) baseRule.search = isTruthyRuleValue(configObj.search);
      if (configObj.exclude_used !== undefined) baseRule.exclude_used = isTruthyRuleValue(configObj.exclude_used);
      if (configObj.duplicate_policy !== undefined) {
        baseRule.duplicate_policy = normalizeChoiceDuplicatePolicy(configObj.duplicate_policy);
      }
    }

    baseRule.options = options;
    return baseRule;
  }

  function buildChoiceContext(entry, context = {}) {
    const ctx = context && typeof context === 'object' ? { ...context } : {};
    const sourceEntry = ctx.sourceEntry && typeof ctx.sourceEntry === 'object'
      ? ctx.sourceEntry
      : (entry && typeof entry === 'object' ? entry : null);

    if (!ctx.entry && entry && typeof entry === 'object') ctx.entry = entry;
    if (!ctx.sourceEntry && sourceEntry) ctx.sourceEntry = sourceEntry;

    const sourceLevel = typeof ctx.sourceLevel === 'string' && ctx.sourceLevel.trim()
      ? ctx.sourceLevel.trim()
      : (typeof ctx.level === 'string' && ctx.level.trim()
        ? ctx.level.trim()
        : (typeof sourceEntry?.nivå === 'string' && sourceEntry.nivå.trim()
          ? sourceEntry.nivå.trim()
          : (typeof entry?.nivå === 'string' && entry.nivå.trim() ? entry.nivå.trim() : '')));
    if (sourceLevel) {
      ctx.sourceLevel = sourceLevel;
      if (!ctx.level) ctx.level = sourceLevel;
    }
    return ctx;
  }

  function ruleMatchesChoiceContext(rule, context = {}) {
    if (!rule) return false;
    const wantedField = normalizeChoiceField(context?.field);
    if (wantedField && rule.field !== wantedField) return false;
    if (!evaluateRuleNar(rule, context)) return false;
    return true;
  }

  function getEntryChoiceRule(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const ctx = buildChoiceContext(entry, context);
    const sourceEntry = resolveRuleSourceEntry(entry);
    const level = typeof ctx.level === 'string' && ctx.level.trim()
      ? ctx.level.trim()
      : (typeof sourceEntry?.nivå === 'string' ? sourceEntry.nivå : '');
    const rules = getRuleList(sourceEntry, 'val', level ? { level } : {});

    let chosenRule = null;
    for (const rawRule of rules) {
      const rule = normalizeChoiceRule(rawRule);
      if (!rule) continue;
      if (!ruleMatchesChoiceContext(rule, ctx)) continue;
      chosenRule = rule;
      break;
    }

    const withArtifactConfig = applyArtifactBindingChoiceConfig(chosenRule, sourceEntry, ctx);
    if (withArtifactConfig) {
      if (ruleMatchesChoiceContext(withArtifactConfig, ctx)) return withArtifactConfig;
    }
    return chosenRule && ruleMatchesChoiceContext(chosenRule, ctx) ? chosenRule : null;
  }

  function normalizeChoiceOption(rawOption) {
    if (rawOption && typeof rawOption === 'object' && !Array.isArray(rawOption)) {
      const rawValue = rawOption.value ?? rawOption.varde ?? rawOption.id ?? rawOption.namn;
      if (rawValue === undefined || rawValue === null) return null;
      const value = String(rawValue);
      const rawLabel = rawOption.label ?? rawOption.namn ?? rawOption.name ?? value;
      const out = {
        value,
        label: String(rawLabel || value)
      };
      if (rawOption.search !== undefined) out.search = String(rawOption.search || '');
      if (rawOption.disabled !== undefined) out.disabled = isTruthyRuleValue(rawOption.disabled);
      if (rawOption.disabledReason !== undefined) out.disabledReason = String(rawOption.disabledReason || '');
      if (rawOption.effects && typeof rawOption.effects === 'object' && !Array.isArray(rawOption.effects)) {
        out.effects = cloneRuleValue(rawOption.effects);
      }
      const rawRules = rawOption.regler
        ?? rawOption.rules
        ?? null;
      if (rawRules && typeof rawRules === 'object' && !Array.isArray(rawRules)) {
        const regler = normalizeRuleBlock(rawRules);
        if (Object.keys(regler).length) out.regler = regler;
      }
      return out;
    }

    if (rawOption === undefined || rawOption === null) return null;
    const value = String(rawOption);
    return { value, label: value };
  }

  function normalizeChoiceUsedValue(value) {
    return normalizeCompareToken(String(value || ''));
  }

  function getChoiceUsedValueSet(context = {}) {
    const used = new Set();
    toArray(context?.usedValues).forEach(value => {
      const token = normalizeChoiceUsedValue(value);
      if (token) used.add(token);
    });
    return used;
  }

  function normalizeChoiceSourceTypList(value) {
    return toArray(value)
      .flatMap(item => toTagList(item))
      .map(String)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function parseChoiceSourceTypeFilter(rawTypeValue) {
    let onlySelected = false;
    const wantedTypes = [];
    normalizeChoiceSourceTypList(rawTypeValue).forEach(typeName => {
      const token = normalizeCompareToken(typeName);
      if (token && CHOICE_SOURCE_ONLY_SELECTED_TYP_TOKENS.has(token)) {
        onlySelected = true;
        return;
      }
      wantedTypes.push(typeName);
    });
    return { wantedTypes, onlySelected };
  }

  function buildListEntryLookup(list) {
    const byId = new Set();
    const byName = new Set();
    (Array.isArray(list) ? list : []).forEach(item => {
      const idToken = normalizeCompareToken(item?.id || '');
      if (idToken) byId.add(idToken);
      const nameToken = normalizeCompareToken(item?.namn || item?.name || '');
      if (nameToken) byName.add(nameToken);
    });
    return { byId, byName };
  }

  function isEntryInListLookup(entry, lookup) {
    if (!entry || typeof entry !== 'object' || !lookup) return false;
    const idToken = normalizeCompareToken(entry?.id || '');
    if (idToken && lookup.byId.has(idToken)) return true;
    const nameToken = normalizeCompareToken(entry?.namn || entry?.name || '');
    return Boolean(nameToken && lookup.byName.has(nameToken));
  }

  function readOnlySelectedFlag(container, wantedKeys) {
    const raw = getTaggedConfigValue(container, wantedKeys);
    if (raw === undefined) return undefined;
    return isTruthyRuleValue(raw);
  }

  function resolveChoiceSourceOptions(source, context = {}) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return [];

    const typeFilter = parseChoiceSourceTypeFilter(source.typ);
    const sourceOnlySelected = readOnlySelectedFlag(source, CHOICE_SOURCE_ONLY_SELECTED_KEYS);
    const onlySelected = Boolean(typeFilter.onlySelected || sourceOnlySelected);
    const onlySelectedLookup = onlySelected ? buildListEntryLookup(context?.list) : null;
    const wantedTypes = typeFilter.wantedTypes;
    const valueField = String(source.value_field || source.valueField || source.field || 'namn').trim() || 'namn';
    const labelField = String(source.label_field || source.labelField || 'namn').trim() || 'namn';
    const sort = String(source.sort || 'alpha').trim().toLowerCase();
    const nar = source.nar && typeof source.nar === 'object' && !Array.isArray(source.nar) ? source.nar : null;

    const db = Array.isArray(window.DB) ? window.DB : [];
    const out = [];
    db.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      if (onlySelected && !isEntryInListLookup(entry, onlySelectedLookup)) return;
      if (wantedTypes.length && !wantedTypes.some(typeName => entryHasType(entry, typeName))) return;
      if (nar && !evaluateNar(nar, { ...context, sourceEntry: entry, entry })) return;

      const rawValue = entry[valueField] ?? entry.namn;
      if (rawValue === undefined || rawValue === null) return;
      const value = String(rawValue);
      if (!value && value !== '0') return;

      const rawLabel = entry[labelField] ?? entry.namn ?? value;
      out.push({
        value,
        label: String(rawLabel || value),
        search: String(entry.namn || '')
      });
    });

    if (sort !== 'none') {
      out.sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'sv'));
    }
    return out;
  }

  function resolveChoiceOptions(rule, context = {}) {
    const normalizedRule = normalizeChoiceRule(rule);
    if (!normalizedRule) return [];
    const ctx = buildChoiceContext(context?.entry || context?.sourceEntry || null, context);
    const currentToken = normalizeChoiceUsedValue(ctx.currentValue);
    const usedTokens = getChoiceUsedValueSet(ctx);

    const options = [];
    if (normalizedRule.source) {
      options.push(...resolveChoiceSourceOptions(normalizedRule.source, ctx));
    }
    if (normalizedRule.options) {
      options.push(...toArray(normalizedRule.options));
    }

    const deduped = [];
    const seen = new Set();
    options.forEach(rawOption => {
      const option = normalizeChoiceOption(rawOption);
      if (!option) return;
      const key = normalizeChoiceOptionKey(option.value);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(option);
    });

    const shouldExcludeUsed = Boolean(normalizedRule.exclude_used);
    const shouldDisableUsed = !shouldExcludeUsed && normalizedRule.duplicate_policy === 'reject';

    return deduped
      .map(option => {
        const key = normalizeChoiceUsedValue(option.value);
        const used = key && usedTokens.has(key) && (!currentToken || key !== currentToken);
        if (used && shouldExcludeUsed) return null;
        if (used && shouldDisableUsed) {
          return {
            ...option,
            disabled: true,
            disabledReason: option.disabledReason || 'Redan vald'
          };
        }
        return option;
      })
      .filter(Boolean);
  }

  function getArtifactEffectChoiceRule(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const ctx = buildChoiceContext(entry, { ...(context || {}), field: 'artifactEffect' });
    const sourceEntry = resolveRuleSourceEntry(entry);
    let rule = getEntryChoiceRule(sourceEntry, ctx);
    if (!rule && typeof getLegacyChoiceRule === 'function') {
      rule = getLegacyChoiceRule(sourceEntry, ctx);
    }
    return applyArtifactBindingChoiceConfig(rule, sourceEntry, ctx);
  }

  function getArtifactEffectOption(entry, value, context = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const ctx = buildChoiceContext(entry, { ...(context || {}), field: 'artifactEffect' });
    const rule = getArtifactEffectChoiceRule(entry, ctx);
    if (!rule) return null;

    const options = resolveChoiceOptions(rule, {
      ...ctx,
      usedValues: [],
      currentValue: value
    });
    const wantedKey = normalizeChoiceOptionKey(value);
    const match = options.find(option => normalizeChoiceOptionKey(option?.value) === wantedKey) || null;
    if (match) {
      const normalized = normalizeArtifactBindingOption(match);
      return normalized ? normalized : null;
    }

    const presetName = getArtifactBindingPresetName(value);
    return presetName ? cloneArtifactBindingPreset(presetName) : null;
  }

  function getArtifactEffectValueLabel(entry, value, context = {}) {
    const option = getArtifactEffectOption(entry, value, context);
    if (option?.label) return String(option.label);
    const presetName = getArtifactBindingPresetName(value);
    if (presetName) return ARTIFACT_BINDING_PRESETS[presetName].label;
    const raw = value === undefined || value === null ? '' : String(value);
    return raw || ARTIFACT_BINDING_PRESETS.unbound.label;
  }

  function getArtifactEffectValueEffects(entry, value, context = {}) {
    const option = getArtifactEffectOption(entry, value, context);
    if (option && option.effects && typeof option.effects === 'object') {
      return normalizeArtifactEffectMap(option.effects, getArtifactBindingPresetName(option.value));
    }
    return normalizeArtifactEffectMap(null, getArtifactBindingPresetName(value));
  }

  function getArtifactEffectValueRules(entry, value, context = {}) {
    const option = getArtifactEffectOption(entry, value, context);
    if (!option || !option.regler || typeof option.regler !== 'object' || Array.isArray(option.regler)) {
      return {};
    }
    return normalizeRuleBlock(option.regler);
  }

  function isHamnskifteGrantEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const id = String(entry?.id || '').trim().toLowerCase();
    if (id.startsWith('hamnskifte_grants')) return true;
    const name = String(entry?.namn || '').trim();
    return /^hamnskifte:\s*/i.test(name);
  }

  function getLegacyChoiceRule(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const sourceEntry = resolveRuleSourceEntry(entry);
    const ctx = buildChoiceContext(sourceEntry, context);
    const name = String(sourceEntry?.namn || entry?.namn || '').trim();
    const levelValue = getLevelValue(ctx.sourceLevel || sourceEntry?.nivå || entry?.nivå || '');

    const makeRule = (candidate) => {
      const normalized = normalizeChoiceRule(candidate);
      if (!normalized) return null;
      return ruleMatchesChoiceContext(normalized, ctx) ? normalized : null;
    };

    if (name === 'Monsterlärd' && levelValue >= 2) {
      return makeRule({
        field: 'trait',
        title: 'Välj specialisering',
        subtitle: 'Välj en specialisering för Monsterlärd.',
        options: MONSTER_LORE_SPECS,
        duplicate_policy: 'reject',
        exclude_used: true,
        nar: { kalla_niva_minst: 'gesall' }
      });
    }

    if (name === 'Exceptionellt karaktärsdrag') {
      return makeRule({
        field: 'trait',
        title: 'Välj karaktärsdrag',
        subtitle: 'Välj vilket karaktärsdrag som ska få bonus.',
        options: EXCEPTION_TRAITS,
        duplicate_policy: 'replace_existing'
      });
    }

    if (name === 'Blodsband') {
      return makeRule({
        field: 'race',
        title: 'Välj ras',
        subtitle: 'Välj en ras för Blodsband.',
        search: true,
        source: { typ: ['Ras'], sort: 'alpha' },
        duplicate_policy: 'reject',
        exclude_used: true
      });
    }

    if (Array.isArray(sourceEntry?.traits) && sourceEntry.traits.length) {
      return makeRule({
        field: 'trait',
        title: 'Välj karaktärsdrag',
        subtitle: 'Välj vilket karaktärsdrag som ska användas.',
        options: sourceEntry.traits,
        duplicate_policy: 'confirm'
      });
    }

    if (sourceEntry?.bound === 'kraft' || sourceEntry?.bound === 'ritual') {
      const isPower = sourceEntry.bound === 'kraft';
      const label = String(sourceEntry?.boundLabel || (isPower ? 'Formel' : 'Ritual')).trim();
      const sourceType = isPower ? 'Mystisk kraft' : 'Ritual';
      return makeRule({
        field: 'trait',
        title: `Välj ${label.toLowerCase()}`,
        subtitle: `Välj vilken ${label.toLowerCase()} som ska bindas.`,
        search: true,
        source: { typ: [sourceType], sort: 'alpha' },
        duplicate_policy: 'confirm'
      });
    }

    if (isHamnskifteGrantEntry(sourceEntry) || isHamnskifteGrantEntry(entry)) {
      return makeRule({
        field: 'form',
        title: 'Välj form',
        subtitle: 'Välj vilken form som ska användas för Hamnskifte.',
        options: [
          { value: 'normal', label: 'Humanoid form (vanlig kostnad)' },
          { value: 'beast', label: 'För hamnskifte (gratis upp till novisnivå)' }
        ]
      });
    }

    if (entryHasType(sourceEntry, 'Artefakt') || entryHasType(entry, 'Artefakt')) {
      const baseRule = makeRule({
        field: 'artifactEffect',
        title: 'Välj betalning',
        subtitle: 'Välj hur artefakten ska bindas.',
        options: [
          { value: '', label: 'Obunden' },
          { value: 'corruption', label: '+1 Permanent korruption' },
          { value: 'xp', label: '−1 Erfarenhetspoäng' }
        ]
      });
      return applyArtifactBindingChoiceConfig(baseRule, sourceEntry, ctx);
    }

    return null;
  }

  function normalizeChoiceFieldDisplayLabel(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function stripChoicePromptPrefix(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text
      .replace(/^[Vv][äa]lj\s+/u, '')
      .replace(/^[Ss]elect\s+/u, '')
      .replace(/[.?!:]+$/u, '')
      .trim();
  }

  function getChoiceFieldDisplayLabel(field, rule = null) {
    const normalizedField = normalizeChoiceField(field);
    const explicitLabel = [
      rule?.display_label,
      rule?.displayLabel,
      rule?.label,
      rule?.title
    ]
      .map(value => stripChoicePromptPrefix(value))
      .find(Boolean);
    if (explicitLabel) return normalizeChoiceFieldDisplayLabel(explicitLabel);
    return CHOICE_FIELD_DISPLAY_LABELS[normalizedField] || 'Val';
  }

  function getEntryChoiceDisplay(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return null;

    const sourceEntry = context?.sourceEntry && typeof context.sourceEntry === 'object'
      ? context.sourceEntry
      : resolveRuleSourceEntry(entry);
    const ctx = buildChoiceContext(entry, {
      ...(context || {}),
      entry,
      sourceEntry
    });

    let rule = getEntryChoiceRule(sourceEntry, ctx);
    if (!rule && typeof getLegacyChoiceRule === 'function') {
      rule = getLegacyChoiceRule(sourceEntry, ctx);
    }
    if (!rule) return null;

    const field = normalizeChoiceField(rule.field);
    if (!field) return null;

    const rawValue = entry[field];
    const hasExplicitValue = Object.prototype.hasOwnProperty.call(entry, field);
    const rawText = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    const hasValue = rawText.trim() !== '' || (field === 'artifactEffect' && hasExplicitValue);
    if (!hasValue) return null;

    let valueLabel = '';
    if (field === 'artifactEffect') {
      valueLabel = String(getArtifactEffectValueLabel(sourceEntry, rawValue, ctx) || '').trim();
    } else {
      try {
        const options = resolveChoiceOptions(rule, {
          ...ctx,
          entry,
          sourceEntry,
          currentValue: rawValue
        });
        const wantedKey = normalizeChoiceOptionKey(rawValue);
        const hit = options.find(option => normalizeChoiceOptionKey(option?.value) === wantedKey) || null;
        if (hit?.label !== undefined && hit?.label !== null) {
          valueLabel = String(hit.label).trim();
        }
      } catch (_) {
        // Fall back to raw value below if option resolution fails.
      }
    }

    if (!valueLabel) valueLabel = rawText.trim() || rawText;

    return {
      field,
      label: getChoiceFieldDisplayLabel(field, rule),
      value: rawText,
      valueLabel,
      rule
    };
  }

  function formatEntryDisplayName(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return '';
    const base = String(context?.baseName || entry?.namn || '').trim();
    if (!base) return '';

    const parts = [];
    if (context?.includeChoice !== false) {
      const choice = getEntryChoiceDisplay(entry, context);
      if (choice?.valueLabel) parts.push(String(choice.valueLabel).trim());
    }

    if (context?.includeLevel !== false) {
      const level = context?.level !== undefined && context?.level !== null
        ? context.level
        : entry?.nivå;
      const levelLabel = String(level || '').trim();
      if (levelLabel) parts.push(levelLabel);
    }

    const dedupedParts = [];
    const seen = new Set();
    parts.forEach(part => {
      const text = String(part || '').trim();
      if (!text) return;
      const key = normalizeCompareToken(text);
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      dedupedParts.push(text);
    });

    if (!dedupedParts.length) return base;
    return `${base} (${dedupedParts.join(', ')})`;
  }

  function getListContextRules(list) {
    const records = [];
    const arr = Array.isArray(list) ? list : [];
    SNAPSHOT_RULE_LIST_KEYS.forEach(key => {
      const raw = arr?.[key];
      if (!Array.isArray(raw)) return;
      raw.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const explicitRule = item.rule && typeof item.rule === 'object' && !Array.isArray(item.rule)
          ? cloneRuleValue(item.rule)
          : null;
        if (explicitRule) {
          const ruleKey = RULE_KEYS.includes(item.key) ? item.key : 'andrar';
          records.push({
            key: ruleKey,
            rule: explicitRule,
            sourceEntryId: item.sourceEntryId,
            sourceEntryName: item.sourceEntryName,
            sourceEntryLevel: item.sourceEntryLevel,
            sourceEntry: item.sourceEntry || null
          });
          return;
        }

        RULE_KEYS.forEach(ruleKey => {
          toRuleList(item?.[ruleKey]).forEach(rule => {
            records.push({
              key: ruleKey,
              rule,
              sourceEntryId: item.sourceEntryId,
              sourceEntryName: item.sourceEntryName,
              sourceEntryLevel: item.sourceEntryLevel,
              sourceEntry: item.sourceEntry || null
            });
          });
        });
      });
    });
    return records;
  }

  function copyListContextRules(targetList, sourceList) {
    if (!Array.isArray(targetList) || !Array.isArray(sourceList)) return targetList;
    SNAPSHOT_RULE_LIST_KEYS.forEach(key => {
      const raw = sourceList[key];
      if (!Array.isArray(raw)) return;
      try {
        Object.defineProperty(targetList, key, {
          value: raw,
          writable: true,
          configurable: true,
          enumerable: false
        });
      } catch (_) {
        targetList[key] = raw;
      }
    });
    return targetList;
  }

  function getRuleEntries(list) {
    if (!Array.isArray(list)) return [];
    const filtered = list.filter(entry => entry && typeof entry === 'object');
    return copyListContextRules(filtered, list);
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

    getListContextRules(list).forEach(record => {
      if (!record || typeof record !== 'object') return;
      const key = String(record.key || '').trim();
      if (!RULE_KEYS.includes(key)) return;
      if (keyFilter && key !== keyFilter) return;
      const rule = record.rule && typeof record.rule === 'object'
        ? cloneRuleValue(record.rule)
        : null;
      if (!rule) return;
      if (targetFilter && String(rule?.mal || '') !== targetFilter) return;
      out.push({
        ...rule,
        sourceEntryId: record.sourceEntryId,
        sourceEntryName: typeof record.sourceEntryName === 'string' ? record.sourceEntryName : '',
        sourceEntryLevel: typeof record.sourceEntryLevel === 'string' ? record.sourceEntryLevel : '',
        sourceEntry: record.sourceEntry || null
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
      if (!evaluateRuleNar(rule, { list: entries, ...context })) return;
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
      if (!evaluateRuleNar(rule, { list: entries, ...context })) return;
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

  // Returns full rule objects for separat_forsvar_karaktarsdrag rules on the list.
  // Each returned rule already carries sourceEntryName, sourceEntryLevel, etc. from getListRules.
  // satt:'ersatt' with cumulative level merging means the highest-level rule wins per (source, varde).
  function getSeparateDefenseTraitRules(list, context = {}) {
    const entries = Array.isArray(list) ? list : [];
    const candidates = getListRules(entries, { key: 'andrar', mal: 'separat_forsvar_karaktarsdrag' })
      .filter(rule => String(rule?.satt || '') === 'ersatt'
        && evaluateRuleNar(rule, { list: entries, ...context }));
    // Deduplicate by (sourceEntryId, varde): last rule in accumulation order is the highest level
    const seen = new Map();
    candidates.forEach(rule => {
      const key = `${rule.sourceEntryId}|${String(rule.varde || '')}`;
      seen.set(key, rule);
    });
    return [...seen.values()];
  }

  // Applies only the modifier components opted-in via tillat flags.
  // tillat: { karaktarsdrag, vapen_typer, vapen_kvaliteter }  (all default false → returns 0)
  function getSelectiveDefenseModifier(list, weaponFacts, armorCtx, tillat) {
    const tl = tillat || {};
    if (!tl.karaktarsdrag && !tl.vapen_typer && !tl.vapen_kvaliteter) return 0;
    const facts = normalizeDefenseWeaponFacts(weaponFacts || []);
    // Always pass facts so nar weapon conditions (e.g. antal_utrustade_vapen_minst) evaluate
    // correctly even when only karaktarsdrag is enabled in tillat.
    const ctx = buildDefenseContext(
      tl.karaktarsdrag ? list : [],
      facts,
      armorCtx || { utrustadTyper: [], utrustadeKvaliteter: [] }
    );
    let total = 0;
    if (tl.karaktarsdrag) {
      total += sumModifierByMal(Array.isArray(list) ? list : [], 'forsvar_modifierare', ctx);
    }
    if (tl.vapen_typer) {
      const weaponEntries = facts.map(f => f.entryRef).filter(e => e && typeof e === 'object');
      total += sumModifierByMal(weaponEntries, 'forsvar_modifierare', ctx);
    }
    if (tl.vapen_kvaliteter) {
      const qualNames = [...new Set(facts.flatMap(f => toArray(f.qualities).map(String).filter(Boolean)))];
      total += sumModifierByMal(lookupEntriesByNames(qualNames), 'forsvar_modifierare', ctx);
    }
    return total;
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

  function normalizeGrantFreeLevel(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed || '';
  }

  function parseGrantFreeConfig(rule) {
    if (!rule || typeof rule !== 'object') {
      return { gratis: false, gratisTill: null };
    }

    const levelCandidates = [
      rule?.gratis_upp_till,
      rule?.gratis_till,
      rule?.gratisTill
    ];
    for (const candidate of levelCandidates) {
      const level = normalizeGrantFreeLevel(candidate);
      if (level) return { gratis: true, gratisTill: level };
    }

    const boolCandidates = [rule?.gratis, rule?.free, rule?.is_gratis, rule?.isGratis];
    for (const candidate of boolCandidates) {
      if (candidate === undefined || candidate === null || candidate === '') continue;

      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (!trimmed) continue;
        const normalized = normalizeLevelName(trimmed);
        if (['false', '0', 'no', 'nej', 'off'].includes(normalized)) continue;
        if (['true', '1', 'yes', 'ja', 'on'].includes(normalized)) {
          return { gratis: true, gratisTill: null };
        }
        return { gratis: true, gratisTill: trimmed };
      }

      if (isTruthyRuleValue(candidate)) return { gratis: true, gratisTill: null };
    }

    return { gratis: false, gratisTill: null };
  }

  function parseGrantIgnoreLimitsConfig(rule) {
    if (!rule || typeof rule !== 'object') return false;
    const explicit = readIgnoreLimitFlagFromContainer(rule);
    return explicit === null ? false : explicit;
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

      const grantFree = parseGrantFreeConfig(rule);
      const grantIgnoreLimits = parseGrantIgnoreLimitsConfig(rule);

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
          gratis: grantFree.gratis,
          gratisTill: grantFree.gratisTill,
          ignoreLimits: grantIgnoreLimits
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
      const grantFree = parseGrantFreeConfig(rule);
      if (!grantFree.gratis) continue;
      if (!matchesListCondition(rule, entries)) continue;
      const refs = getEntryGrantRefs(rule);
      const matches = refs.some(ref => {
        const refKey = ref.id
          ? `id:${String(ref.id).trim()}`
          : `name:${normalizeLevelName(ref.name)}`;
        return refKey === targetKey;
      });
      if (!matches) continue;
      return { gratis: true, gratisTill: grantFree.gratisTill };
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

  function normalizeErfOverrideNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.trunc(numeric);
  }

  function getEntryTargetKeys(entry) {
    if (!entry || typeof entry !== 'object') return [];
    const keys = [];
    const id = entry.id === undefined || entry.id === null
      ? ''
      : String(entry.id).trim();
    const name = typeof entry.namn === 'string'
      ? entry.namn.trim()
      : (typeof entry.name === 'string' ? entry.name.trim() : '');
    if (id) keys.push(`id:${id}`);
    const normalizedName = normalizeLevelName(name);
    if (normalizedName) keys.push(`name:${normalizedName}`);
    return keys;
  }

  function normalizeErfOverrideLevel(level) {
    const normalized = normalizeLevelName(level);
    return normalized || '*';
  }

  function makeEntryErfOverrideKey(targetKey, level) {
    if (!targetKey) return '';
    return `${targetKey}|${normalizeErfOverrideLevel(level)}`;
  }

  function getManualEntryErfOverride(entry, level = '') {
    const targetKeys = getEntryTargetKeys(entry);
    if (!targetKeys.length) return null;

    for (const targetKey of targetKeys) {
      const exactKey = makeEntryErfOverrideKey(targetKey, level);
      if (exactKey && MANUAL_ENTRY_ERF_OVERRIDES.has(exactKey)) {
        return MANUAL_ENTRY_ERF_OVERRIDES.get(exactKey);
      }
      const wildcardKey = makeEntryErfOverrideKey(targetKey, '*');
      if (wildcardKey && MANUAL_ENTRY_ERF_OVERRIDES.has(wildcardKey)) {
        return MANUAL_ENTRY_ERF_OVERRIDES.get(wildcardKey);
      }
    }
    return null;
  }

  function setEntryErfOverride(target, levelOrValue, maybeValue) {
    const hasExplicitLevel = maybeValue !== undefined;
    const level = hasExplicitLevel ? levelOrValue : '';
    const value = hasExplicitLevel ? maybeValue : levelOrValue;
    const normalizedValue = normalizeErfOverrideNumber(value);
    if (normalizedValue === null) return false;

    const targetKeys = getEntryTargetKeys(target);
    if (!targetKeys.length) return false;

    const normalizedLevel = normalizeErfOverrideLevel(level);
    targetKeys.forEach(targetKey => {
      const key = `${targetKey}|${normalizedLevel}`;
      MANUAL_ENTRY_ERF_OVERRIDES.set(key, normalizedValue);
    });
    return true;
  }

  function clearEntryErfOverride(target, level = '') {
    const targetKeys = getEntryTargetKeys(target);
    if (!targetKeys.length) return false;
    const normalizedLevel = normalizeErfOverrideLevel(level);
    let removed = false;
    targetKeys.forEach(targetKey => {
      const key = `${targetKey}|${normalizedLevel}`;
      if (MANUAL_ENTRY_ERF_OVERRIDES.delete(key)) removed = true;
    });
    return removed;
  }

  function clearAllEntryErfOverrides() {
    MANUAL_ENTRY_ERF_OVERRIDES.clear();
  }

  function getEntryErfOverrideMapValue(mapLike, level = '') {
    if (!mapLike || typeof mapLike !== 'object' || Array.isArray(mapLike)) return null;
    const wanted = normalizeLevelName(level);
    if (!wanted) return null;
    const key = Object.keys(mapLike).find(name => normalizeLevelName(name) === wanted);
    if (!key) return null;
    return normalizeErfOverrideNumber(mapLike[key]);
  }

  function getEntryStaticErfOverride(entry, level = '') {
    if (!entry || typeof entry !== 'object') return null;

    const levelData = findLevelData(entry, level);
    if (levelData && typeof levelData === 'object') {
      const levelValue = normalizeErfOverrideNumber(levelData.erf ?? levelData.xp);
      if (levelValue !== null) return levelValue;
      const taggedLevelValue = normalizeErfOverrideNumber(levelData?.taggar?.erf ?? levelData?.taggar?.xp);
      if (taggedLevelValue !== null) return taggedLevelValue;
    }

    const tagMapValue = getEntryErfOverrideMapValue(
      entry?.taggar?.erf_per_niva
      ?? entry?.taggar?.erf_per_nivå
      ?? entry?.taggar?.erf_niva
      ?? entry?.taggar?.erf_nivå
      ?? entry?.taggar?.xp_per_niva
      ?? entry?.taggar?.xp_per_nivå
      ?? entry?.taggar?.xp_niva
      ?? entry?.taggar?.xp_nivå,
      level
    );
    if (tagMapValue !== null) return tagMapValue;

    const entryMapValue = getEntryErfOverrideMapValue(
      entry?.erf_per_niva
      ?? entry?.erf_per_nivå
      ?? entry?.erf_niva
      ?? entry?.erf_nivå
      ?? entry?.xp_per_niva
      ?? entry?.xp_per_nivå
      ?? entry?.xp_niva
      ?? entry?.xp_nivå,
      level
    );
    if (entryMapValue !== null) return entryMapValue;

    const taggedValue = normalizeErfOverrideNumber(entry?.taggar?.erf ?? entry?.taggar?.xp);
    if (taggedValue !== null) return taggedValue;

    return normalizeErfOverrideNumber(entry?.erf ?? entry?.xp);
  }

  function getRuleEntryErfOverride(rule, level = '') {
    const mapValue = getEntryErfOverrideMapValue(
      rule?.erf_per_niva
      ?? rule?.erf_per_nivå
      ?? rule?.erf_niva
      ?? rule?.erf_nivå
      ?? rule?.xp_per_niva
      ?? rule?.xp_per_nivå
      ?? rule?.xp_niva
      ?? rule?.xp_nivå,
      level
    );
    if (mapValue !== null) return mapValue;
    return normalizeErfOverrideNumber(rule?.erf ?? rule?.xp);
  }

  function getRuleBasedEntryErfOverride(entry, list, level = '') {
    const targetKeys = getEntryTargetKeys(entry);
    if (!targetKeys.length) return null;

    const entries = Array.isArray(list) ? list : [];
    let matchedOverride = null;
    getListRules(entries, { key: 'ger', mal: 'post' }).forEach(rule => {
      if (!matchesListCondition(rule, entries)) return;
      const matchesTarget = getEntryGrantRefs(rule).some(ref => {
        const key = ref.id
          ? `id:${String(ref.id).trim()}`
          : `name:${normalizeLevelName(ref.name)}`;
        return key && targetKeys.includes(key);
      });
      if (!matchesTarget) return;
      const value = getRuleEntryErfOverride(rule, level);
      if (value === null) return;
      matchedOverride = value;
    });
    return matchedOverride;
  }

  function getEntryErfOverride(entry, list, options = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const level = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : (typeof entry?.nivå === 'string' ? entry.nivå.trim() : '');

    const manualOverride = getManualEntryErfOverride(entry, level);
    if (manualOverride !== null) return manualOverride;

    const sourceEntry = resolveRuleSourceEntry(entry);
    const staticOverride = getEntryStaticErfOverride(sourceEntry, level);
    if (staticOverride !== null) return staticOverride;

    const fallbackStaticOverride = getEntryStaticErfOverride(entry, level);
    if (fallbackStaticOverride !== null) return fallbackStaticOverride;

    return getRuleBasedEntryErfOverride(entry, list, level);
  }

  function getEntryGrantDependents(list, removedEntry) {
    if (!removedEntry || typeof removedEntry !== 'object') return [];
    const entries = getRuleEntries(list);
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
    const hasHeavyType = hasNormalizedAny(types, ['Tvåhandsvapen']);
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

  function getCombatFactDisplayName(fact) {
    if (!fact || typeof fact !== 'object') return '';
    const direct = typeof fact.name === 'string' ? fact.name.trim() : '';
    if (direct) return direct;
    const entryName = typeof fact.entryRef?.namn === 'string' ? fact.entryRef.namn.trim() : '';
    if (entryName) return entryName;
    return '';
  }

  function getCombatFactEntry(fact) {
    if (!fact || typeof fact !== 'object') return null;
    if (fact.entryRef && typeof fact.entryRef === 'object') return fact.entryRef;
    const name = getCombatFactDisplayName(fact);
    const types = toArray(fact.types ?? fact.typer).map(String).filter(Boolean);
    if (!name && fact.id === undefined && !types.length) return null;
    return {
      id: fact.id,
      namn: name,
      taggar: { typ: types }
    };
  }

  function buildCombatEquipmentFacts(weaponFacts, extra = {}) {
    const armorFacts = [];
    if (extra?.armorFact && typeof extra.armorFact === 'object') armorFacts.push(extra.armorFact);
    if (Array.isArray(extra?.armorFacts)) armorFacts.push(...extra.armorFacts);
    const equippedItemFacts = Array.isArray(extra?.equippedItemFacts) ? extra.equippedItemFacts : [];
    return normalizeDefenseWeaponFacts([
      ...(Array.isArray(weaponFacts) ? weaponFacts : []),
      ...armorFacts,
      ...equippedItemFacts
    ]);
  }

  function hasEntryByName(list, name) {
    const wanted = normalizeLevelName(name);
    if (!wanted) return false;
    return (Array.isArray(list) ? list : []).some(entry =>
      normalizeLevelName(entry?.namn || '') === wanted
    );
  }

  function buildCombatContext(list, weaponFacts, extra = {}) {
    const normalizedFacts = normalizeDefenseWeaponFacts(weaponFacts);
    const equippedFacts = buildCombatEquipmentFacts(normalizedFacts, extra);
    const antalVapen = Number.isFinite(Number(extra?.antalVapen))
      ? Number(extra.antalVapen)
      : normalizedFacts.filter(f => f.isWeapon).length;
    const vapenFakta = normalizedFacts.map(f => ({
      typer: toArray(f.types),
      kvaliteter: toArray(f.qualities)
    }));
    const equippedNames = [
      ...new Set([
        ...equippedFacts.map(getCombatFactDisplayName).filter(Boolean),
        ...toArray(extra?.utrustadeNamn).map(String).map(name => name.trim()).filter(Boolean)
      ])
    ];
    const equippedTypes = [
      ...new Set([
        ...equippedFacts.flatMap(f => toArray(f.types).map(String).filter(Boolean)),
        ...toArray(extra?.utrustadTyper).map(String).filter(Boolean)
      ])
    ];
    const equippedQualities = [
      ...new Set([
        ...equippedFacts.flatMap(f => toArray(f.qualities).map(String).filter(Boolean)),
        ...toArray(extra?.utrustadeKvaliteter).map(String).filter(Boolean)
      ])
    ];
    let foremal = Object.prototype.hasOwnProperty.call(extra || {}, 'foremal')
      ? extra.foremal
      : undefined;
    if (foremal === undefined && extra?.activeItemFact) {
      const activeFact = normalizeDefenseWeaponFacts([extra.activeItemFact])[0] || null;
      const targetEntry = getCombatFactEntry(activeFact);
      foremal = targetEntry
        ? buildItemRuleTargetContext(targetEntry, toArray(activeFact?.qualities), extra?.foremalContext || extra)
        : undefined;
    }
    return {
      ...extra,
      list: Array.isArray(list) ? list : [],
      weaponFacts: normalizedFacts,
      vapenFakta,
      antalVapen,
      foremal,
      utrustadeNamn: equippedNames,
      utrustadTyper: equippedTypes,
      utrustadeKvaliteter: equippedQualities
    };
  }

  function buildDefenseContext(list, weaponFacts, extra = {}) {
    return buildCombatContext(list, weaponFacts, extra);
  }

  function sumModifierByMal(entries, mal, context = {}) {
    const targetMal = String(mal || '').trim();
    if (!targetMal) return 0;
    let total = 0;
    (Array.isArray(entries) ? entries : []).forEach(entry => {
      const rules = getRuleList(entry, 'andrar', { level: entry?.nivå })
        .filter(rule => String(rule?.mal || '') === targetMal
          && evaluateRuleNar(rule, context));
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

  function getCombatFactEntries(facts) {
    return (Array.isArray(facts) ? facts : [])
      .map(getCombatFactEntry)
      .filter(entry => entry && typeof entry === 'object');
  }

  function getCombatFactQualityNames(facts) {
    return [
      ...new Set(
        (Array.isArray(facts) ? facts : [])
          .flatMap(f => toArray(f?.qualities).map(String).filter(Boolean))
      )
    ];
  }

  function getEquippedModifierByMal(list, mal, weaponFacts = [], context = {}) {
    const facts = normalizeDefenseWeaponFacts(weaponFacts);
    const equippedFacts = buildCombatEquipmentFacts(facts, context);
    const ctx = buildCombatContext(list, facts, context || {});
    let total = 0;
    total += sumModifierByMal(Array.isArray(list) ? list : [], mal, ctx);
    total += sumModifierByMal(getCombatFactEntries(equippedFacts), mal, ctx);
    total += sumModifierByMal(lookupEntriesByNames(getCombatFactQualityNames(equippedFacts)), mal, ctx);
    return total;
  }

  function sumAndrarByMal(list, mal, initialValue, options = {}) {
    const entries = Array.isArray(list) ? list : [];
    const dynamic = typeof options === 'function';
    return getListRules(entries, { key: 'andrar', mal })
      .filter(r => matchesListCondition(r, entries))
      .reduce((val, r) => applyNumericChange(val, r, r?.sourceEntry,
        dynamic ? options(val) : options), initialValue);
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
            'Sköld kan inte kombineras med Långt eller Tvåhandsvapen utan Bastardvapen.'
          );
          violations.push({ code: 'shield_long_or_heavy', shield, weapon });
        }
      });
    });

    const forbiddenWeaponTypes = getEquipmentConflictTypes(list);
    if (forbiddenWeaponTypes.length) {
      facts.forEach(f => {
        const blockedTypes = (f.types || []).filter(t =>
          forbiddenWeaponTypes.some(ft => normalizeCompareToken(ft) === normalizeCompareToken(t)));
        if (blockedTypes.length) {
          pushReason('forbidden_weapon_type_' + f.key,
            'Kan inte utrusta vapen av typ ' + blockedTypes.join(', ') + '.');
          violations.push({ code: 'forbidden_weapon_type', offenders: [f], forbiddenTypes: blockedTypes });
        }
      });
    }

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
          && evaluateRuleNar(rule, context));
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
  //   utrustadeNamn,      — string[] → har_utrustat_namn / ej_utrustat_namn
  //   utrustadTyper,      — string[] → har_utrustad_typ / ej_utrustad_typ
  //   utrustadeKvaliteter,— string[] → har_utrustad_kvalitet / ej_utrustad_kvalitet
  //   row,                — inventory row → trait
  //   sourceEntry,        — inventory item DB entry → namn, typ
  //   computedValues,     — pre-computed values: { <mal>: value, ... } → mal_minst, har_mal, mal_saknas
  // }
  // Each condition block is only evaluated when the relevant context key is present.
  function normalizeCompareToken(value) {
    return normalizeLevelName(String(value || ''));
  }

  const NORMALIZED_TOKEN_ALIASES = (() => {
    const rawMap = Object.freeze({
      Vapen: ['Vapen', 'Närstridsvapen', 'Avståndsvapen'],
      Närstridsvapen: ['Närstridsvapen'],
      Avståndsvapen: ['Avståndsvapen'],
      'Tvåhandsvapen': ['Tvåhandsvapen', 'Tvåhandsvapen'],
      Tvåhandsvapen: ['Tvåhandsvapen', 'Tvåhandsvapen'],
      Projektilvapen: ['Projektilvapen', 'Avståndsvapen'],
      'Kort vapen': ['Kort vapen', 'Korta vapen'],
      'Korta vapen': ['Korta vapen', 'Kort vapen']
    });
    const map = new Map();
    Object.keys(rawMap).forEach(key => {
      const token = normalizeCompareToken(key);
      if (!token) return;
      const aliases = new Set(
        toArray(rawMap[key])
          .map(normalizeCompareToken)
          .filter(Boolean)
      );
      aliases.add(token);
      map.set(token, aliases);
    });
    return map;
  })();

  function expandNormalizedTokens(values) {
    const expanded = new Set();
    toArray(values)
      .map(normalizeCompareToken)
      .filter(Boolean)
      .forEach(token => {
        expanded.add(token);
        const aliases = NORMALIZED_TOKEN_ALIASES.get(token);
        if (!aliases) return;
        aliases.forEach(alias => expanded.add(alias));
      });
    return expanded;
  }

  function hasNormalizedAny(haystackValues, needleValues) {
    const haystack = expandNormalizedTokens(haystackValues);
    if (!haystack.size) return false;
    return [...expandNormalizedTokens(needleValues)].some(value => haystack.has(value));
  }

  function parseMaxConstraint(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.floor(parsed);
    if (rounded < 0) return null;
    return rounded;
  }

  function getNameCount(list, name, options = {}) {
    const target = normalizeLevelName(name || '');
    if (!target) return 0;
    const skipIgnoredLimits = options?.skipIgnoredLimits === true;
    return (Array.isArray(list) ? list : []).reduce((count, entry) => {
      if (skipIgnoredLimits && entryIgnoresLimits(entry, options)) return count;
      if (normalizeLevelName(entry?.namn || '') !== target) return count;
      return count + 1;
    }, 0);
  }

  function getTypeCount(list, typeName, options = {}) {
    const target = normalizeLevelName(typeName || '');
    if (!target) return 0;
    const skipIgnoredLimits = options?.skipIgnoredLimits === true;
    return (Array.isArray(list) ? list : []).reduce((count, entry) => {
      if (skipIgnoredLimits && entryIgnoresLimits(entry, options)) return count;
      if (!entryHasType(entry, typeName)) return count;
      return count + 1;
    }, 0);
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

      const requiredNameLevels = getRequirementLevelRules({ nar }, []);
      if (requiredNameLevels.length) {
        const missingLevel = requiredNameLevels.some(requirement =>
          !hasEntryAtLeastLevel(list, requirement.name, requirement.minLevelValue).ok
        );
        if (missingLevel) return false;
      }

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

      const nameMaxObject = nar.antal_namn_max && typeof nar.antal_namn_max === 'object' && !Array.isArray(nar.antal_namn_max)
        ? nar.antal_namn_max
        : null;
      if (nameMaxObject) {
        const failed = Object.keys(nameMaxObject).some(name => {
          const max = parseMaxConstraint(nameMaxObject[name]);
          if (max === null) return false;
          return getNameCount(list, name, { skipIgnoredLimits: true }) > max;
        });
        if (failed) return false;
      }
      const listNameMax = parseMaxConstraint(nar.antal_namn_max);
      if (listNameMax !== null) {
        const names = toArray(nar.namn).map(String).filter(Boolean);
        if (names.length && names.some(name => getNameCount(list, name, { skipIgnoredLimits: true }) > listNameMax)) return false;
      }

      const typeMaxObject = nar.antal_typ_max && typeof nar.antal_typ_max === 'object' && !Array.isArray(nar.antal_typ_max)
        ? nar.antal_typ_max
        : null;
      if (typeMaxObject) {
        const failed = Object.keys(typeMaxObject).some(typeName => {
          const max = parseMaxConstraint(typeMaxObject[typeName]);
          if (max === null) return false;
          return getTypeCount(list, typeName, { skipIgnoredLimits: true }) > max;
        });
        if (failed) return false;
      }
      const listTypeMax = parseMaxConstraint(nar.antal_typ_max);
      if (listTypeMax !== null) {
        const types = toArray(nar.typ).map(String).filter(Boolean);
        if (types.length && types.some(typeName => getTypeCount(list, typeName, { skipIgnoredLimits: true }) > listTypeMax)) return false;
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

    // --- Attribute conditions (only when attribut is in context) ---
    if (ctx.attribut !== undefined) {
      const attr = ctx.attribut && typeof ctx.attribut === 'object' ? ctx.attribut : {};
      if (nar.attribut_minst && typeof nar.attribut_minst === 'object') {
        const failed = Object.keys(nar.attribut_minst).some(key =>
          Number(attr[key] ?? 0) < Number(nar.attribut_minst[key])
        );
        if (failed) return false;
      }
      if (nar.attribut_hogst && typeof nar.attribut_hogst === 'object') {
        const failed = Object.keys(nar.attribut_hogst).some(key =>
          Number(attr[key] ?? 0) > Number(nar.attribut_hogst[key])
        );
        if (failed) return false;
      }
    }

    // --- Equipped item conditions (only when any equipped pool key is in context) ---
    if (ctx.utrustadTyper !== undefined
      || ctx.utrustadeKvaliteter !== undefined
      || ctx.utrustadeNamn !== undefined) {
      const contextNames = new Set(
        toArray(ctx.utrustadeNamn)
          .map(normalizeCompareToken)
          .filter(Boolean)
      );
      const contextTypes = toArray(ctx.utrustadTyper).map(String).filter(Boolean);
      const contextQualities = toArray(ctx.utrustadeKvaliteter).map(String).filter(Boolean);

      const requiredNames = toArray(nar.har_utrustat_namn).map(normalizeCompareToken).filter(Boolean);
      if (requiredNames.length && !requiredNames.some(name => contextNames.has(name))) return false;

      const excludedNames = toArray(nar.ej_utrustat_namn).map(normalizeCompareToken).filter(Boolean);
      if (excludedNames.length && excludedNames.some(name => contextNames.has(name))) return false;

      const requiredTypes = toArray(nar.har_utrustad_typ).map(String).filter(Boolean);
      if (requiredTypes.length && !hasNormalizedAny(contextTypes, requiredTypes)) return false;

      const excludedTypes = toArray(nar.ej_utrustad_typ).map(String).filter(Boolean);
      if (excludedTypes.length && hasNormalizedAny(contextTypes, excludedTypes)) return false;

      const requiredQualities = toArray(nar.har_utrustad_kvalitet).map(String).filter(Boolean);
      if (requiredQualities.length && !hasNormalizedAny(contextQualities, requiredQualities)) return false;

      const excludedQualities = toArray(nar.ej_utrustad_kvalitet).map(String).filter(Boolean);
      if (excludedQualities.length && hasNormalizedAny(contextQualities, excludedQualities)) return false;
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
      const ids = toArray(cond.id).map(String).filter(Boolean);
      if (ids.length && !ids.includes(String(target.id || ''))) return false;
      const namns = toArray(cond.namn).map(String).filter(Boolean);
      if (namns.length && !namns.some(n => normalizeLevelName(n) === normalizeLevelName(String(target.namn || '')))) return false;
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

    // --- Source entry must be selected in list (only when both list + sourceEntry exist) ---
    if (ctx.list !== undefined && ctx.sourceEntry !== undefined) {
      const onlySelected = readOnlySelectedFlag(nar, NAR_ONLY_SELECTED_KEYS);
      if (onlySelected !== undefined) {
        const lookup = buildListEntryLookup(ctx.list);
        const isSelected = isEntryInListLookup(ctx.sourceEntry, lookup);
        if (Boolean(onlySelected) !== isSelected) return false;
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

    // --- Negation block: nar.inte inverts a nested nar ---
    if (nar.inte && typeof nar.inte === 'object' && !Array.isArray(nar.inte)) {
      if (evaluateNar(nar.inte, ctx)) return false;
    }

    // --- Inline OR block: nar.eller — at least one nested nar must pass ---
    if (Array.isArray(nar.eller) && nar.eller.length) {
      if (!nar.eller.some(alt => evaluateNar(alt, ctx))) return false;
    }

    return true;
  }

  // Evaluates a rule's nar condition, supporting both nar (AND) and nar_eller (OR over multiple nar blocks).
  function evaluateRuleNar(rule, context) {
    if (!rule || typeof rule !== 'object') return true;
    if (Array.isArray(rule.nar_eller) && rule.nar_eller.length) {
      return rule.nar_eller.some(alt => evaluateNar(alt, context));
    }
    return evaluateNar(rule.nar, context);
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
          && evaluateRuleNar(rule, {
            vapenFakta: weaponContext?.vapenFakta,
            antalVapen: weaponContext?.antalVapen
          }));
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
    return getEquippedModifierByMal(list, 'forsvar_modifierare', weaponFacts, context);
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

  function getEquippedAttackModifier(list, weaponFacts = [], context = {}) {
    return getEquippedModifierByMal(list, 'traffsaker_modifierare', weaponFacts, context);
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
    if (targetMal === 'forsvar_modifierare' || targetMal === 'traffsaker_modifierare') {
      const facts = normalizeDefenseWeaponFacts(
        weaponContext?.weaponFacts || weaponContext?.vapenFakta || []
      );
      const ctx = buildCombatContext([], facts, weaponContext || {});
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
    return getEquippedQualityVapenBonus(qualityNames, 'traffsaker_modifierare', weaponContext);
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
          && evaluateRuleNar(rule, { utrustadTyper: armorContext?.utrustadTyper }));
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

  function getEquipmentConflictTypes(list) {
    return getListRules(list, { key: 'krockar' })
      .filter(r => Array.isArray(r.utrustning_typ))
      .flatMap(r => r.utrustning_typ)
      .map(String);
  }

  function getEquipmentQualityRequirements(list) {
    return getListRules(list, { key: 'kraver' })
      .filter(r => Array.isArray(r.utrustning_typ) && Array.isArray(r.utrustning_kvalitet))
      .map(r => ({
        types: r.utrustning_typ.map(String),
        requiredQualities: r.utrustning_kvalitet.map(String),
        sourceName: r.sourceName || ''
      }));
  }

  function validateEquipment(list, itemTypes, itemQualities) {
    const reasons = [];
    const forbidden = getEquipmentConflictTypes(list);
    const blocked = (itemTypes || []).filter(t =>
      forbidden.some(f => normalizeCompareToken(f) === normalizeCompareToken(t)));
    if (blocked.length) reasons.push('Kan inte utrusta: ' + blocked.join(', ') + '.');
    getEquipmentQualityRequirements(list).forEach(req => {
      const typeMatch = req.types.some(t =>
        (itemTypes || []).some(it => normalizeCompareToken(it) === normalizeCompareToken(t)));
      if (!typeMatch) return;
      const qualMatch = req.requiredQualities.some(q =>
        (itemQualities || []).some(iq => normalizeCompareToken(iq) === normalizeCompareToken(q)));
      if (!qualMatch) reasons.push('Kräver kvalitet: ' + req.requiredQualities.join(' eller ') + ' (' + req.sourceName + ').');
    });
    return { valid: reasons.length === 0, reasons };
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
    return hasNormalizedAny(getEntryTypes(entry), [typeName]);
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

  function matchesListCondition(rule, list, context = {}) {
    const extra = context && typeof context === 'object' ? context : {};
    const ctx = {
      ...extra,
      list: Array.isArray(list) ? list : [],
      sourceLevel: rule?.sourceEntryLevel || extra?.sourceLevel
    };
    return evaluateRuleNar(rule, ctx);
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
    if (Array.isArray(rule?.utrustning_typ)) return false;
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
    const entries = getRuleEntries(list);
    const conditionContext = options?.conditionContext && typeof options.conditionContext === 'object'
      ? options.conditionContext
      : {};
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
        if (!matchesListCondition(rule, contextList, { ...conditionContext, sourceEntry })) return;
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

  function getCanonicalLevelLabel(value) {
    const normalized = normalizeLevelName(value);
    if (!normalized) return '';
    if (normalized === 'novis' || normalized === 'enkel') return 'Novis';
    if (normalized === 'gesall' || normalized === 'ordinar') return 'Gesäll';
    if (normalized === 'mastare' || normalized === 'avancerad') return 'Mästare';
    return String(value || '').trim();
  }

  function hasEntryAtLeastLevel(list, entryName, minLevel) {
    const name = String(entryName || '').trim();
    const nameToken = normalizeLevelName(name);
    const numericMin = Number(minLevel);
    const minLevelValue = Number.isFinite(numericMin) && numericMin > 0
      ? Math.max(0, Math.floor(numericMin))
      : getLevelValue(minLevel);
    const minLevelLabel = getCanonicalLevelLabel(minLevel);
    if (!nameToken) {
      return {
        ok: false,
        found: false,
        entryName: name,
        requiredLevelValue: minLevelValue,
        requiredLevelName: minLevelLabel,
        highestLevelValue: 0,
        highestLevelName: ''
      };
    }

    let found = false;
    let highestLevelValue = 0;
    let highestLevelName = '';
    (Array.isArray(list) ? list : []).forEach(entry => {
      if (normalizeLevelName(entry?.namn || '') !== nameToken) return;
      found = true;
      const levelName = String(entry?.nivå || '').trim();
      const levelValue = getLevelValue(levelName);
      if (levelValue > highestLevelValue) {
        highestLevelValue = levelValue;
        highestLevelName = getCanonicalLevelLabel(levelName) || levelName;
      }
    });

    const ok = minLevelValue > 0
      ? (found && highestLevelValue >= minLevelValue)
      : found;
    return {
      ok,
      found,
      entryName: name,
      requiredLevelValue: minLevelValue,
      requiredLevelName: minLevelLabel,
      highestLevelValue,
      highestLevelName
    };
  }

  function collectRequirementLevelPairs(rawValue, addPair) {
    if (rawValue === undefined || rawValue === null || typeof addPair !== 'function') return;
    if (Array.isArray(rawValue)) {
      rawValue.forEach(item => collectRequirementLevelPairs(item, addPair));
      return;
    }
    if (typeof rawValue !== 'object') return;

    const hasNamedFields = (
      Object.prototype.hasOwnProperty.call(rawValue, 'namn')
      || Object.prototype.hasOwnProperty.call(rawValue, 'name')
      || Object.prototype.hasOwnProperty.call(rawValue, 'entry')
      || Object.prototype.hasOwnProperty.call(rawValue, 'post')
    );
    if (hasNamedFields) {
      const name = rawValue.namn ?? rawValue.name ?? rawValue.entry ?? rawValue.post;
      const minLevel = (
        rawValue['nivå_minst']
        ?? rawValue.niva_minst
        ?? rawValue.nivå
        ?? rawValue.niva
        ?? rawValue.level_min
        ?? rawValue.levelMin
        ?? rawValue.level
      );
      addPair(name, minLevel);
      return;
    }

    Object.keys(rawValue).forEach(name => {
      addPair(name, rawValue[name]);
    });
  }

  function getRequirementLevelRules(rule, requiredNames = []) {
    const byName = new Map();
    const add = (rawName, rawLevel) => {
      const name = String(rawName || '').trim();
      if (!name) return;
      const numeric = Number(rawLevel);
      const minLevelValue = Number.isFinite(numeric) && numeric > 0
        ? Math.max(0, Math.floor(numeric))
        : getLevelValue(rawLevel);
      if (minLevelValue <= 0) return;
      const key = normalizeLevelName(name);
      if (!key) return;
      const minLevelName = getCanonicalLevelLabel(rawLevel) || String(rawLevel || '').trim();
      const prev = byName.get(key);
      if (!prev || minLevelValue > prev.minLevelValue) {
        byName.set(key, {
          name,
          minLevelValue,
          minLevelName: minLevelName || `Nivå ${minLevelValue}`
        });
      }
    };

    const globalMinLevel = rule?.['nivå_minst'] ?? rule?.niva_minst ?? rule?.level_min ?? rule?.levelMin;
    if (globalMinLevel !== undefined && globalMinLevel !== null && String(globalMinLevel).trim() !== '') {
      getUniqueNames(requiredNames).forEach(name => add(name, globalMinLevel));
    }

    collectRequirementLevelPairs(rule?.namn_niva_minst, add);
    collectRequirementLevelPairs(rule?.['namn_nivå_minst'], add);
    collectRequirementLevelPairs(rule?.name_level_min, add);

    const nar = rule?.nar && typeof rule.nar === 'object' ? rule.nar : null;
    collectRequirementLevelPairs(nar?.har_namn_niva_minst, add);
    collectRequirementLevelPairs(nar?.['har_namn_nivå_minst'], add);
    collectRequirementLevelPairs(nar?.har_namn_level_min, add);

    return Array.from(byName.values());
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

  function getCandidateRequirementRuleSets(candidateEntry, level = '') {
    const sourceEntry = resolveRuleSourceEntry(candidateEntry || {});
    const typeRules = getTypeRules(sourceEntry, level);
    const entryRules = !level
      ? getTopLevelRules(sourceEntry)
      : mergeRuleBlocks(getTopLevelRules(sourceEntry), getLevelRules(sourceEntry, level));
    const typeRequirementConfig = getTypeRequirementRuleConfig(sourceEntry, level);
    const entryRequirementConfig = getEntryRequirementRuleConfig(sourceEntry, level);
    const scopeCombinationLogic = normalizeRequirementLogic(
      entryRequirementConfig.scopeCombinationLogic || typeRequirementConfig.scopeCombinationLogic,
      'or'
    );
    const rawContainer = getTopLevelRuleContainer(sourceEntry);
    const skipTypeKraver = rawContainer?.ignorera_typ_kraver === true;
    return {
      entryRequirements: toRuleList(entryRules?.kraver),
      typeRequirements: skipTypeKraver ? [] : toRuleList(typeRules?.kraver),
      entryScopeLogic: normalizeRequirementLogic(entryRequirementConfig.scopeLogic, 'or'),
      typeScopeLogic: normalizeRequirementLogic(typeRequirementConfig.scopeLogic, 'or'),
      scopeCombinationLogic
    };
  }

  function buildRequirementReason(rule, candidate, entries, contextEntries, nameSet) {
    // --- Nested group: grupp contains sub-rules combined with grupp_logik ---
    if (Array.isArray(rule?.grupp) && rule.grupp.length) {
      const subRules = rule.grupp;
      const groupLogic = normalizeRequirementLogic(rule?.grupp_logik, 'and');
      const subReasons = subRules.map(sub =>
        buildRequirementReason(sub, candidate, entries, contextEntries, nameSet)
      );
      const satisfied = groupLogic === 'and'
        ? subReasons.every(r => r === null)
        : subReasons.some(r => r === null);
      if (satisfied) return null;

      const failedReasons = subReasons.filter(Boolean);
      const allMissing = failedReasons.flatMap(r => r.missingNames || []);
      const allRequired = failedReasons.flatMap(r => r.requiredNames || []);
      const allMissingLevels = failedReasons.flatMap(r => r.missingLevelRequirements || []);
      const allLevelReqs = failedReasons.flatMap(r => r.levelRequirements || []);
      return {
        code: getRequirementReasonCode(rule, candidate),
        sourceEntryId: candidate?.id || '',
        sourceEntryName: candidate?.namn || '',
        sourceEntryLevel: candidate?.nivå || '',
        requiredNames: getUniqueNames(allRequired),
        missingNames: getUniqueNames(allMissing),
        levelRequirements: allLevelReqs,
        missingLevelRequirements: allMissingLevels,
        message: String(rule?.meddelande || rule?.message || '').trim()
      };
    }

    const baseRequiredNames = getRequirementNames(rule);
    const levelRequirements = getRequirementLevelRules(rule, baseRequiredNames);
    const requiredNames = getUniqueNames([
      ...baseRequiredNames,
      ...levelRequirements.map(requirement => requirement.name)
    ]);
    const missingNames = requiredNames.filter(name => !nameSet.has(normalizeLevelName(name)));
    const missingLevelRequirements = levelRequirements
      .map(requirement => ({
        ...requirement,
        status: hasEntryAtLeastLevel(entries, requirement.name, requirement.minLevelValue)
      }))
      .filter(requirement => !requirement.status.ok)
      .map(requirement => ({
        name: requirement.name,
        minLevelName: requirement.minLevelName,
        minLevelValue: requirement.minLevelValue
      }));

    const satisfied = (requiredNames.length || levelRequirements.length)
      ? (missingNames.length === 0 && missingLevelRequirements.length === 0)
      : matchesListCondition(rule, contextEntries);
    if (satisfied) return null;

    return {
      code: getRequirementReasonCode(rule, candidate),
      sourceEntryId: candidate?.id || '',
      sourceEntryName: candidate?.namn || '',
      sourceEntryLevel: candidate?.nivå || '',
      requiredNames,
      missingNames,
      levelRequirements,
      missingLevelRequirements,
      message: String(rule?.meddelande || rule?.message || '').trim()
    };
  }

  function getRequirementReasonDedupeKey(reason) {
    if (!reason || typeof reason !== 'object') return '';
    const levelPart = (Array.isArray(reason.missingLevelRequirements) ? reason.missingLevelRequirements : [])
      .map(req => `${normalizeLevelName(req?.name || '')}>=${Number(req?.minLevelValue || 0)}`)
      .sort()
      .join(',');
    return `${String(reason.code || '').trim()}|${normalizeLevelName(reason.sourceEntryName || '')}|${(Array.isArray(reason.missingNames) ? reason.missingNames : [])
      .map(name => normalizeLevelName(name))
      .sort()
      .join(',')}|${levelPart}|${normalizeLevelName(reason.message || '')}`;
  }

  function evaluateRequirementRules(candidate, entries, contextEntries, requirementRules, scope = 'entry') {
    const nameSet = new Set(entries.map(entry => normalizeLevelName(entry?.namn || '')).filter(Boolean));
    return toRuleList(requirementRules).map(rule => {
      const reason = buildRequirementReason(rule, candidate, entries, contextEntries, nameSet);
      return {
        scope,
        rule,
        passed: !reason,
        reason: reason || null
      };
    });
  }

  function evaluateRequirementScope(evaluations, logic = 'or', scope = '') {
    const items = toArray(evaluations);
    const normalizedLogic = normalizeRequirementLogic(logic, 'or');
    if (!items.length) {
      return {
        scope,
        logic: normalizedLogic,
        hasRules: false,
        passed: true,
        activeEvaluations: [],
        missingReasons: []
      };
    }

    const passed = normalizedLogic === 'and'
      ? items.every(item => Boolean(item?.passed))
      : items.some(item => Boolean(item?.passed));

    const activeEvaluations = normalizedLogic === 'and'
      ? items
      : (passed ? items.filter(item => Boolean(item?.passed)) : items);

    const missingReasons = passed
      ? []
      : items
        .filter(item => !item?.passed)
        .map(item => item.reason)
        .filter(Boolean);

    return {
      scope,
      logic: normalizedLogic,
      hasRules: true,
      passed,
      activeEvaluations,
      missingReasons
    };
  }

  function dedupeRequirementReasons(reasons) {
    const out = [];
    const seen = new Set();
    toArray(reasons).forEach(reason => {
      if (!reason || typeof reason !== 'object') return;
      const dedupeKey = getRequirementReasonDedupeKey(reason);
      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      out.push(reason);
    });
    return out;
  }

  function buildCandidateRequirementEvaluationSet(candidate, entries, candidateLevel = '') {
    const contextEntries = [...entries, candidate];
    const {
      entryRequirements,
      typeRequirements,
      entryScopeLogic,
      typeScopeLogic,
      scopeCombinationLogic
    } = getCandidateRequirementRuleSets(candidate, candidateLevel);
    const entryEvaluations = evaluateRequirementRules(candidate, entries, contextEntries, entryRequirements, 'entry');
    const typeEvaluations = evaluateRequirementRules(candidate, entries, contextEntries, typeRequirements, 'type');
    const entryScope = evaluateRequirementScope(entryEvaluations, entryScopeLogic, 'entry');
    const typeScope = evaluateRequirementScope(typeEvaluations, typeScopeLogic, 'type');
    const relevantScopes = [entryScope, typeScope].filter(scope => scope.hasRules);
    const combineLogic = normalizeRequirementLogic(scopeCombinationLogic, 'or');

    const met = !relevantScopes.length
      ? true
      : (combineLogic === 'and'
        ? relevantScopes.every(scope => scope.passed)
        : relevantScopes.some(scope => scope.passed));

    let activeScopes = [];
    if (relevantScopes.length) {
      if (combineLogic === 'and') {
        activeScopes = relevantScopes;
      } else if (entryScope.hasRules && entryScope.passed) {
        activeScopes = [entryScope];
      } else if (typeScope.hasRules && typeScope.passed) {
        activeScopes = [typeScope];
      } else {
        activeScopes = relevantScopes;
      }
    }
    const activeEvaluations = activeScopes.flatMap(scope => scope.activeEvaluations);

    const missingReasons = met
      ? []
      : dedupeRequirementReasons(
        relevantScopes
          .filter(scope => !scope.passed)
          .flatMap(scope => scope.missingReasons)
      );

    return {
      entryRequirements,
      typeRequirements,
      entryEvaluations,
      typeEvaluations,
      entryScopeLogic: entryScope.logic,
      typeScopeLogic: typeScope.logic,
      scopeCombinationLogic: combineLogic,
      entryScope,
      typeScope,
      activeEvaluations,
      missingReasons,
      met
    };
  }

  function normalizeRequirementMultiplier(rawValue, fallback = 1) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return numeric;
  }

  function pickRequirementBlockValue(rawBlock, keys = []) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return undefined;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(rawBlock, key)) {
        const value = rawBlock[key];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
    return undefined;
  }

  function getNestedMultiplierContainer(rawBlock) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return null;
    const container = (
      rawBlock.mult
      ?? rawBlock.multiplikator
      ?? rawBlock.multipliers
      ?? rawBlock.multiplier
    );
    if (!container || typeof container !== 'object' || Array.isArray(container)) return null;
    return container;
  }

  function hasRequirementEffectFields(rawBlock) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return false;
    const direct = pickRequirementBlockValue(rawBlock, [
      'pengar_multiplikator', 'pengar_mult', 'pris_multiplikator', 'pris_mult',
      'grundpris_multiplikator', 'money_multiplier', 'money_mult',
      'price_multiplier', 'price_mult', 'cost_multiplier',
      'erf_multiplikator', 'erf_mult', 'xp_multiplier', 'xp_mult', 'experience_multiplier'
    ]);
    if (direct !== undefined) return true;
    const nested = getNestedMultiplierContainer(rawBlock);
    if (!nested) return false;
    return pickRequirementBlockValue(nested, [
      'pengar', 'pris', 'grundpris', 'money', 'price', 'cost',
      'erf', 'xp', 'experience'
    ]) !== undefined;
  }

  function getRequirementOutcomeBlock(rule, outcome = 'fail') {
    if (!rule || typeof rule !== 'object') return null;
    const passKeys = [
      'om_uppfyllt',
      'vid_uppfyllt',
      'on_pass',
      'if_true',
      'then'
    ];
    const failKeys = [
      'om_ej_uppfyllt',
      'vid_ej_uppfyllt',
      'on_fail',
      'if_false',
      'else',
      'annars'
    ];
    const keys = outcome === 'pass' ? passKeys : failKeys;
    const explicit = pickRequirementBlockValue(rule, keys);
    if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) return explicit;
    if (outcome === 'fail' && hasRequirementEffectFields(rule)) return rule;
    return null;
  }

  function getRequirementEffectMultiplier(rawBlock, kind = 'money') {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return 1;
    const moneyKeys = [
      'pengar_multiplikator', 'pengar_mult', 'pris_multiplikator', 'pris_mult',
      'grundpris_multiplikator', 'money_multiplier', 'money_mult',
      'price_multiplier', 'price_mult', 'cost_multiplier'
    ];
    const erfKeys = [
      'erf_multiplikator', 'erf_mult', 'xp_multiplier', 'xp_mult', 'experience_multiplier'
    ];
    const direct = pickRequirementBlockValue(rawBlock, kind === 'money' ? moneyKeys : erfKeys);
    if (direct !== undefined) return normalizeRequirementMultiplier(direct, 1);
    const nested = getNestedMultiplierContainer(rawBlock);
    if (!nested) return 1;
    const nestedKeyList = kind === 'money'
      ? ['pengar', 'pris', 'grundpris', 'money', 'price', 'cost']
      : ['erf', 'xp', 'experience'];
    const nestedValue = pickRequirementBlockValue(nested, nestedKeyList);
    return normalizeRequirementMultiplier(nestedValue, 1);
  }

  function normalizeRequirementOutcomeEffect(rawBlock) {
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return null;
    const normalizedRules = normalizeRuleBlock(rawBlock);
    const out = {
      moneyMultiplier: getRequirementEffectMultiplier(rawBlock, 'money'),
      erfMultiplier: getRequirementEffectMultiplier(rawBlock, 'erf')
    };
    RULE_KEYS.forEach(key => {
      const list = toRuleList(normalizedRules?.[key]);
      if (!list.length) return;
      out[key] = list;
    });
    const hasRuleEffects = RULE_KEYS.some(key => Array.isArray(out[key]) && out[key].length);
    if (!hasRuleEffects && out.moneyMultiplier === 1 && out.erfMultiplier === 1) return null;
    return out;
  }

  function mergeRequirementOutcomeEffects(target, effect) {
    if (!target || !effect) return;
    target.moneyMultiplier = Math.max(
      normalizeRequirementMultiplier(target.moneyMultiplier, 1),
      normalizeRequirementMultiplier(effect.moneyMultiplier, 1)
    );
    target.erfMultiplier = Math.max(
      normalizeRequirementMultiplier(target.erfMultiplier, 1),
      normalizeRequirementMultiplier(effect.erfMultiplier, 1)
    );
    RULE_KEYS.forEach(key => {
      if (!Array.isArray(effect[key]) || !effect[key].length) return;
      if (!Array.isArray(target[key])) target[key] = [];
      target[key].push(...effect[key].map(cloneRuleValue));
    });
  }

  function getMissingRequirementReasonsForCandidate(candidateEntry, list, options = {}) {
    if (!candidateEntry || typeof candidateEntry !== 'object') return [];
    const entries = getRuleEntries(list);
    const candidateLevel = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : (typeof candidateEntry?.nivå === 'string' ? candidateEntry.nivå.trim() : '');
    const candidate = candidateLevel && candidateEntry?.nivå !== candidateLevel
      ? { ...candidateEntry, nivå: candidateLevel }
      : candidateEntry;
    const evaluation = buildCandidateRequirementEvaluationSet(candidate, entries, candidateLevel);
    return evaluation.missingReasons;
  }

  function getRequirementEffectsForCandidate(candidateEntry, list, options = {}) {
    const out = {
      met: true,
      missingReasons: [],
      moneyMultiplier: 1,
      erfMultiplier: 1
    };
    RULE_KEYS.forEach(key => { out[key] = []; });
    if (!candidateEntry || typeof candidateEntry !== 'object') return out;

    const entries = getRuleEntries(list);
    const candidateLevel = typeof options?.level === 'string' && options.level.trim()
      ? options.level.trim()
      : (typeof candidateEntry?.nivå === 'string' ? candidateEntry.nivå.trim() : '');
    const candidate = candidateLevel && candidateEntry?.nivå !== candidateLevel
      ? { ...candidateEntry, nivå: candidateLevel }
      : candidateEntry;
    const evaluation = buildCandidateRequirementEvaluationSet(candidate, entries, candidateLevel);
    out.missingReasons = evaluation.missingReasons;
    out.met = Boolean(evaluation.met);

    evaluation.activeEvaluations.forEach(item => {
      const outcome = item.passed ? 'pass' : 'fail';
      const rawBlock = getRequirementOutcomeBlock(item.rule, outcome);
      if (!rawBlock) return;
      const effect = normalizeRequirementOutcomeEffect(rawBlock);
      if (!effect) return;
      mergeRequirementOutcomeEffects(out, effect);
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

  function parsePositiveLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.floor(numeric);
    if (rounded <= 0) return null;
    return rounded;
  }

  function splitListTags(value) {
    return toArray(value)
      .flatMap(item => String(item ?? '').split(','))
      .map(item => item.trim())
      .filter(Boolean);
  }

  function getDirectMaxCount(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return null;
    if (entryIgnoresLimits(entry, options)) return Number.POSITIVE_INFINITY;
    const tagLimit = parsePositiveLimit(entry?.taggar?.max_antal);
    if (tagLimit !== null) return tagLimit;
    const directLimit = parsePositiveLimit(entry?.max_antal);
    if (directLimit !== null) return directLimit;

    if (options.allowLegacy !== false) {
      const legacyMulti = Boolean(
        entry?.kan_införskaffas_flera_gånger === true
        || entry?.taggar?.kan_införskaffas_flera_gånger === true
        || entry?.kan_inforskaffas_flera_ganger === true
        || entry?.taggar?.kan_inforskaffas_flera_ganger === true
      );
      if (legacyMulti) return 3;
    }
    return null;
  }

  function getTypeDefaultMaxCount(entry, options = {}) {
    let resolved = null;
    getTypeRuleTemplateEntries(entry).forEach(templateEntry => {
      const candidate = getDirectMaxCount(templateEntry, options);
      if (candidate !== null) resolved = candidate;
    });
    return resolved;
  }

  function getEntryMaxCount(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return 1;
    const sourceEntry = resolveRuleSourceEntry(entry);
    if (entryIgnoresLimits(sourceEntry, options)) return Number.POSITIVE_INFINITY;
    const direct = getDirectMaxCount(sourceEntry, options);
    if (direct !== null) return direct;

    const typeDefault = getTypeDefaultMaxCount(sourceEntry, options);
    if (typeDefault !== null) return typeDefault;

    return 1;
  }

  function entryMatchesCountTarget(candidate, existing) {
    if (!candidate || !existing) return false;
    const candidateName = normalizeLevelName(candidate?.namn || '');
    const existingName = normalizeLevelName(existing?.namn || '');
    if (!candidateName || candidateName !== existingName) return false;
    const candidateTrait = normalizeLevelName(candidate?.trait || '');
    const existingTrait = normalizeLevelName(existing?.trait || '');
    if (candidateTrait) return candidateTrait === existingTrait;
    return !existingTrait;
  }

  function buildLevelChangeAfterEntries(beforeEntries, candidate) {
    const out = [];
    let replaced = false;
    const candidateId = String(candidate?.id || '').trim();
    const candidateName = normalizeLevelName(candidate?.namn || '');
    const candidateTrait = normalizeLevelName(candidate?.trait || '');

    (Array.isArray(beforeEntries) ? beforeEntries : []).forEach(entry => {
      if (!entry || replaced) {
        out.push(entry);
        return;
      }
      const sameId = candidateId && String(entry?.id || '').trim() === candidateId;
      const sameName = candidateName && normalizeLevelName(entry?.namn || '') === candidateName;
      if (!sameId && !sameName) {
        out.push(entry);
        return;
      }
      const existingTrait = normalizeLevelName(entry?.trait || '');
      if (candidateTrait) {
        if (existingTrait !== candidateTrait) {
          out.push(entry);
          return;
        }
      } else if (existingTrait) {
        out.push(entry);
        return;
      }
      out.push(candidate);
      replaced = true;
    });

    if (!replaced) out.push(candidate);
    return out;
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
    const entries = getRuleEntries(list);
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
        const missingRequirements = requirementReasons;
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

    const autoHardStops = [];

    if (action === 'add') {
      const ignoresLimits = entryIgnoresLimits(candidate, options);
      if (!ignoresLimits) {
        const maxCount = getEntryMaxCount(candidate);
        const currentCount = entries.filter(entry =>
          entryMatchesCountTarget(candidate, entry)
          && !entryIgnoresLimits(entry, options)
        ).length;
        if (currentCount >= maxCount) {
          const candidateName = String(candidate?.namn || '').trim();
          if (maxCount <= 1) {
            autoHardStops.push({
              code: 'duplicate_entry',
              message: candidateName ? `${candidateName}: Posten är redan vald.` : 'Posten är redan vald.'
            });
          } else {
            const isAdvantageOrDisadvantage = entryHasType(candidate, 'Fördel') || entryHasType(candidate, 'Nackdel');
            const label = isAdvantageOrDisadvantage ? 'fördel eller nackdel' : 'post';
            autoHardStops.push({
              code: 'stack_limit',
              message: `Limit: Denna ${label} kan normalt bara tas ${maxCount} gånger.`
            });
          }
        }
      }

      const eliteReq = window.eliteReq;
      if (entryHasType(candidate, 'Elityrke') && typeof eliteReq?.check === 'function') {
        const res = eliteReq.check(candidate, entries);
        if (!res?.ok) {
          if (Array.isArray(res?.missing) && res.missing.length) {
            autoHardStops.push({
              code: 'elite_missing_requirements',
              message: `Elityrke: Saknar ${res.missing.join(', ')}.`
            });
          }
          if (!res?.master) {
            autoHardStops.push({
              code: 'elite_primary_requirement',
              message: 'Elityrke: Primärförmågekravet uppfylls inte.'
            });
          }
        }
      }

      if (entryHasType(candidate, 'Elityrkesförmåga') && requirementReasons.length > 0) {
        const requiredEliteNames = (typeof window.explodeTags === 'function'
          ? window.explodeTags(candidate?.taggar?.ark_trad)
          : splitListTags(candidate?.taggar?.ark_trad)
        ).map(String).filter(Boolean);
        if (requiredEliteNames.length) {
          const allowed = requiredEliteNames.some(reqYrke =>
            entries.some(item =>
              entryHasType(item, 'Elityrke')
              && String(item?.namn || '').trim() === String(reqYrke || '').trim()
            )
          );
          if (!allowed) {
            autoHardStops.push({
              code: 'elite_skill_locked',
              message: `Elityrkesförmåga: Låst till elityrket ${requiredEliteNames.join(', ')}.`
            });
          }
        }
      }
    }

    if (action === 'level-change' && typeof window.eliteReq?.canChange === 'function') {
      const beforeEntries = Array.isArray(options?.beforeList) ? options.beforeList : entries;
      const afterEntries = Array.isArray(options?.afterList)
        ? options.afterList
        : buildLevelChangeAfterEntries(beforeEntries, candidate);
      if (window.eliteReq.canChange(beforeEntries) && !window.eliteReq.canChange(afterEntries)) {
        autoHardStops.push({
          code: 'elite_locked_level_change',
          message: 'Elityrke: Förmågan krävs för ett valt elityrke och kan normalt inte ändras.'
        });
      }
    }

    const hardStops = [...toArray(options?.hardStops), ...autoHardStops]
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
      const explicitMessage = String(reason?.message || '').trim();
      if (explicitMessage) {
        add(explicitMessage);
        return;
      }
      const levelRequirements = Array.isArray(reason?.missingLevelRequirements)
        ? reason.missingLevelRequirements
        : [];
      const levelRequirementNames = new Set();
      levelRequirements.forEach(requirement => {
        const name = String(requirement?.name || '').trim();
        const levelName = String(requirement?.minLevelName || '').trim();
        if (!name || !levelName) return;
        levelRequirementNames.add(normalizeLevelName(name));
        add(`Krav: ${name} >= ${levelName}`);
      });
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
        if (levelRequirementNames.has(normalizeLevelName(clean))) return;
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

  function getRequirementDependents(list, removedEntry, options = {}) {
    if (!removedEntry || typeof removedEntry !== 'object') return [];
    const entries = getRuleEntries(list);
    if (!entries.length) return [];

    const removedName = normalizeLevelName(removedEntry?.namn || '');
    if (!removedName) return [];
    const afterEntries = removeOneMatchingEntry(entries, removedEntry);
    const afterNameSet = buildNameSet(afterEntries);
    const out = [];
    const seen = new Set();

    entries.forEach(candidate => {
      if (!candidate || candidate === removedEntry) return;
      const candidateLevel = typeof candidate?.nivå === 'string' ? candidate.nivå : '';
      const beforeMissing = getMissingRequirementReasonsForCandidate(candidate, entries, { level: candidateLevel });
      if (beforeMissing.length) return;

      const afterMissing = getMissingRequirementReasonsForCandidate(candidate, afterEntries, { level: candidateLevel });
      if (!afterMissing.length) return;

      const removedStillExists = afterNameSet.has(removedName);
      const referencesRemoved = afterMissing.some(reason =>
        (Array.isArray(reason?.requiredNames) ? reason.requiredNames : [])
          .map(name => normalizeLevelName(name))
          .includes(removedName)
        || (Array.isArray(reason?.missingNames) ? reason.missingNames : [])
          .map(name => normalizeLevelName(name))
          .includes(removedName)
        || [...(Array.isArray(reason?.levelRequirements) ? reason.levelRequirements : []), ...(Array.isArray(reason?.missingLevelRequirements) ? reason.missingLevelRequirements : [])]
          .map(requirement => normalizeLevelName(requirement?.name || ''))
          .includes(removedName)
      );
      if (!referencesRemoved && !removedStillExists) return;

      const candidateName = String(candidate?.namn || '').trim();
      const dedupeKey = normalizeLevelName(candidateName);
      if (!candidateName || !dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      out.push(candidateName);
    });

    return out;
  }

  function getFormulaBaseValue(baseKey, sourceEntry, options = {}) {
    const key = String(baseKey || '').trim();
    if (!key) return 0;
    if (key === 'niva') return getEntryLevelValue(sourceEntry || {});
    if (key.startsWith('mal:')) {
      const malName = key.slice(4).trim();
      let result;
      if (typeof options?.resolveMal === 'function' && !options?.bypassResolveMal) {
        result = options.resolveMal(malName, options);
      }
      if (result === undefined) {
        result = queryMal(options?.list, malName, options);
      }
      return Number.isFinite(Number(result)) ? Number(result) : 0;
    }
    if (key.startsWith('attribut:')) {
      const attrName = key.slice(9).trim();
      const value = Number(options?.[attrName]);
      return Number.isFinite(value) ? value : 0;
    }
    const traitValue = resolveTraitValueFromContext(key, options);
    if (traitValue !== null) return traitValue;
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

    const minVal = Number(formel.min);
    if (Number.isFinite(minVal)) computed = Math.max(computed, minVal);
    const maxVal = Number(formel.max);
    if (Number.isFinite(maxVal)) computed = Math.min(computed, maxVal);

    return computed;
  }

  function getRuleNumericValue(rule, sourceEntry, options = {}) {
    const rawFormel = rule?.formel;
    const numericValue = Number(rule?.varde);
    const objectFormulaValue = computeObjectFormulaValue(rawFormel, sourceEntry, options);
    if (Number.isFinite(objectFormulaValue)) {
      return Number.isFinite(numericValue) ? objectFormulaValue * numericValue : objectFormulaValue;
    }
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  function applyNumericChange(currentValue, rule, sourceEntry, options = {}) {
    const mode = normalizeLevelName(rule?.satt || '');
    const amount = getRuleNumericValue(rule, sourceEntry, options);
    if (!Number.isFinite(amount)) return currentValue;
    if (mode === 'ersatt' || mode === 'satt') return amount;
    if (mode === 'multiplicera') return currentValue * amount;
    if (mode === 'minimum') return Math.max(currentValue, amount);
    if (mode === 'maximum') return Math.min(currentValue, amount);
    return currentValue + amount;
  }

  function appendSnapshotSourceValue(sourceValues, key, value) {
    const sourceKey = String(key || '').trim();
    if (!sourceKey) return;
    const num = Number(value);
    sourceValues[sourceKey] = Number.isFinite(num) ? num : value;
  }

  function collectSnapshotFormulaSourceValues(rule, context, sourceValues) {
    if (!rule || typeof rule !== 'object') return;
    const rawFormel = rule.formel;
    if (!rawFormel || typeof rawFormel !== 'object' || Array.isArray(rawFormel)) return;
    const base = String(rawFormel.bas || '').trim();
    if (!base) return;
    if (base.startsWith('mal:')) {
      const malName = base.slice(4).trim();
      if (!malName) return;
      appendSnapshotSourceValue(sourceValues, malName, context.resolveMal(malName, context.baseOptions));
      return;
    }
    const traitValue = resolveTraitValueFromContext(base, context.baseOptions);
    if (traitValue !== null) {
      appendSnapshotSourceValue(sourceValues, base, traitValue);
      return;
    }
    const direct = Number(context.baseOptions?.[base]);
    if (Number.isFinite(direct)) {
      appendSnapshotSourceValue(sourceValues, base, direct);
    }
  }

  function collectSnapshotNarSourceValues(rule, context, sourceValues) {
    const nar = rule?.nar && typeof rule.nar === 'object' && !Array.isArray(rule.nar)
      ? rule.nar
      : null;
    if (!nar) return {};
    const computedValues = {};
    const addMal = (malName) => {
      const key = String(malName || '').trim();
      if (!key) return;
      if (Object.prototype.hasOwnProperty.call(computedValues, key)) return;
      const value = context.resolveMal(key, context.baseOptions);
      computedValues[key] = value;
      appendSnapshotSourceValue(sourceValues, key, value);
    };

    if (nar.mal_minst && typeof nar.mal_minst === 'object') {
      Object.keys(nar.mal_minst).forEach(addMal);
    }
    toArray(nar.mal_saknas).forEach(addMal);
    toArray(nar.har_mal).forEach(addMal);
    return computedValues;
  }

  function computeSnapshotRuleAmount(rule, sourceEntry, options = {}) {
    const rawFormel = rule?.formel;
    const objectFormulaValue = computeObjectFormulaValue(rawFormel, sourceEntry, options);
    const numericValue = Number(rule?.varde);
    if (Number.isFinite(objectFormulaValue)) {
      return Number.isFinite(numericValue) ? objectFormulaValue * numericValue : objectFormulaValue;
    }
    if (Number.isFinite(numericValue)) return numericValue;
    return null;
  }

  function materializeSnapshotAndrarRules(rawRules, options = {}) {
    const rules = toArray(rawRules)
      .map(cloneRuleValue)
      .filter(rule => rule && typeof rule === 'object' && !Array.isArray(rule));
    if (!rules.length) return [];

    const baseList = Array.isArray(options?.list) ? options.list : [];
    const sourceEntry = options?.sourceEntry && typeof options.sourceEntry === 'object'
      ? options.sourceEntry
      : null;
    const baseOptions = {
      ...(options && typeof options === 'object' ? options : {}),
      list: baseList
    };
    const snapshotState = {};
    const resolvingMals = new Set();
    const resolveMal = (malName, malOptions = {}) => {
      const key = String(malName || '').trim();
      if (!key) return 0;
      if (Object.prototype.hasOwnProperty.call(snapshotState, key)) {
        return snapshotState[key];
      }
      if (resolvingMals.has(key)) return 0;
      resolvingMals.add(key);
      try {
        return queryMal(baseList, key, {
          ...baseOptions,
          ...(malOptions && typeof malOptions === 'object' ? malOptions : {}),
          list: baseList,
          resolveMal,
          bypassResolveMal: true
        });
      } finally {
        resolvingMals.delete(key);
      }
    };

    const materialized = [];
    rules.forEach((rule, index) => {
      const sourceValues = {};
      const computedValues = collectSnapshotNarSourceValues(rule, { resolveMal, baseOptions }, sourceValues);
      const narContext = {
        ...(baseOptions && typeof baseOptions === 'object' ? baseOptions : {}),
        list: baseList,
        sourceEntry: sourceEntry || rule?.sourceEntry || null,
        row: baseOptions?.row || null,
        computedValues
      };
      if (!evaluateRuleNar(rule, narContext)) {
        return;
      }

      collectSnapshotFormulaSourceValues(rule, { resolveMal, baseOptions }, sourceValues);
      const mal = String(rule?.mal || '').trim();
      const mode = normalizeLevelName(rule?.satt || '');
      const amount = computeSnapshotRuleAmount(rule, sourceEntry || rule?.sourceEntry, {
        ...baseOptions,
        list: baseList,
        resolveMal,
        aktuell_malvarde: resolveMal(mal, baseOptions)
      });
      if (amount !== null && mal) {
        const currentValue = Number(resolveMal(mal, baseOptions));
        if (Number.isFinite(currentValue)) {
          const nextValue = (mode === 'ersatt' || mode === 'satt')
            ? Number(amount)
            : currentValue + Number(amount);
          if (Number.isFinite(nextValue)) snapshotState[mal] = nextValue;
        }
      }

      const isSnapshot = isTruthyRuleValue(rule?.snapshot);
      const resolvedRule = cloneRuleValue(rule);
      if (resolvedRule.snapshot !== undefined) delete resolvedRule.snapshot;

      if (isSnapshot) {
        if (resolvedRule.nar !== undefined) delete resolvedRule.nar;
        if (amount !== null) {
          if (resolvedRule.formel !== undefined) delete resolvedRule.formel;
          resolvedRule.varde = amount;
        }
        resolvedRule.metadata = {
          ...(resolvedRule.metadata && typeof resolvedRule.metadata === 'object' && !Array.isArray(resolvedRule.metadata)
            ? resolvedRule.metadata
            : {}),
          snapshot: true,
          source_rule: cloneRuleValue(rule),
          source_values: sourceValues,
          snapshot_index: index
        };
      }

      materialized.push(resolvedRule);
    });

    return materialized;
  }

  function getCorruptionTrackStats(list, options = {}) {
    const entries = getRuleEntries(list);
    const willpower = Number(options?.viljestark || 0);
    const normalizedWillpower = Number.isFinite(willpower) ? willpower : 0;
    const baseKorr = Math.ceil(normalizedWillpower / 2);
    const opts = { ...options, viljestark: normalizedWillpower };

    const korruptionstroskel = sumAndrarByMal(entries, 'korruptionstroskel', baseKorr,
      (val) => ({ ...opts, aktuell_korruptionstroskel: val, aktuell_styggelsetroskel: normalizedWillpower }));
    const styggelsetroskel = sumAndrarByMal(entries, 'styggelsetroskel', normalizedWillpower,
      (val) => ({ ...opts, aktuell_korruptionstroskel: korruptionstroskel, aktuell_styggelsetroskel: val }));

    return { viljestark: normalizedWillpower, korruptionstroskel, styggelsetroskel };
  }

  function getCarryCapacityBase(list, options = {}) {
    const entries = getRuleEntries(list);
    const strength = Number(options?.stark || 0);
    const normalizedStrength = Number.isFinite(strength) ? strength : 0;
    const opts = { ...options, stark: normalizedStrength };

    const starkTillagg = sumAndrarByMal(entries, 'barkapacitet_stark', 0, opts);
    const faktor = sumAndrarByMal(entries, 'barkapacitet_faktor', 1,
      (val) => ({ ...opts, aktuell_barkapacitet_faktor: val }));
    const tillagg = sumAndrarByMal(entries, 'barkapacitet_tillagg', 3,
      (val) => ({ ...opts, aktuell_barkapacitet_faktor: faktor, aktuell_barkapacitet_tillagg: val }));

    const computed = Math.ceil((normalizedStrength + starkTillagg) * faktor) + tillagg;
    return sumAndrarByMal(entries, 'barkapacitet_bas', computed,
      (val) => ({ ...opts, aktuell_barkapacitet_faktor: faktor, aktuell_barkapacitet_tillagg: tillagg, aktuell_barkapacitet_bas: val }));
  }

  function getToughnessBase(list, options = {}) {
    const entries = getRuleEntries(list);
    const strength = Number(options?.stark || 0);
    const normalizedStrength = Number.isFinite(strength) ? strength : 0;
    const opts = { ...options, stark: normalizedStrength };

    let bas = sumAndrarByMal(entries, 'talighet_bas', Math.max(10, normalizedStrength),
      (val) => ({ ...opts, aktuell_talighet_bas: val }));
    const faktor = sumAndrarByMal(entries, 'talighet_faktor', 1,
      (val) => ({ ...opts, aktuell_talighet_bas: bas, aktuell_talighet_faktor: val }));
    bas = Math.ceil(bas * faktor);
    const tillagg = sumAndrarByMal(entries, 'talighet_tillagg', 0,
      (val) => ({ ...opts, aktuell_talighet_bas: bas, aktuell_talighet_tillagg: val }));

    return bas + tillagg;
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
    return evaluateRuleNar(rule, { row, sourceEntry });
  }

  function getTraitTotalMax(list, inventory, options = {}) {
    const entries = getRuleEntries(list);
    let maxTotal = sumAndrarByMal(entries, 'karaktarsdrag_max_tillagg', 80, options);

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
    const entries = getRuleEntries(list);
    const strength = Number(options?.stark || 0);
    const normalizedStrength = Number.isFinite(strength) ? strength : 0;
    const opts = { ...options, stark: normalizedStrength };
    const basePainThreshold = Math.ceil(normalizedStrength / 2);

    const faktor = sumAndrarByMal(entries, 'smartgrans_faktor', 1, opts);
    const factored = Math.ceil(basePainThreshold * faktor);
    const current = sumAndrarByMal(entries, 'smartgrans_tillagg', factored,
      (val) => ({ ...opts, aktuell_smartgrans: val }));

    return current - basePainThreshold;
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
    const entries = getRuleEntries(list);
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
    const resolvingAndrarMals = new Set();
    const resolveAndrarMal = (malName, malOptions = {}) => {
      const key = String(malName || '').trim();
      if (!key) return 0;
      if (key === 'permanent_korruption') return total;
      if (resolvingAndrarMals.has(key)) return 0;
      resolvingAndrarMals.add(key);
      try {
        return queryMal(list, key, {
          ...options,
          ...(malOptions && typeof malOptions === 'object' ? malOptions : {}),
          list,
          resolveMal: resolveAndrarMal,
          bypassResolveMal: true,
          aktuell_permanent_korruption: total,
          permanent_korruption: total
        });
      } finally {
        resolvingAndrarMals.delete(key);
      }
    };

    getListRules(list, { key: 'andrar', mal: 'permanent_korruption' }).forEach(rule => {
      const narComputed = collectSnapshotNarSourceValues(rule, {
        resolveMal: resolveAndrarMal,
        baseOptions: { ...options, list }
      }, {});
      if (!evaluateRuleNar(rule, {
        ...options,
        list,
        sourceEntry: rule?.sourceEntry || null,
        computedValues: narComputed
      })) return;
      const mal = String(rule?.mal || '').trim();
      const amount = computeSnapshotRuleAmount(rule, rule?.sourceEntry, {
        ...options,
        list,
        resolveMal: resolveAndrarMal,
        aktuell_permanent_korruption: total,
        permanent_korruption: total,
        aktuell_malvarde: resolveAndrarMal(mal, options)
      });
      if (amount === null) return;
      const mode = normalizeLevelName(rule?.satt || '');
      if (mode === 'ersatt' || mode === 'satt') {
        total = Number(amount);
      } else {
        total += Number(amount);
      }
      contributions.push({
        amount,
        sourceEntryId: rule.sourceEntryId,
        sourceEntryName: rule.sourceEntryName || '',
        sourceEntryLevel: rule.sourceEntryLevel || '',
        kind: 'andrar'
      });
    });

    const faktor = queryMal(list, 'permanent_korruption_faktor', { list, ...options });
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

    if (hasNormalizedAny(types, ['Vapen']) && hasNormalizedAny(excludedTypes, ['Tvåhandsvapen'])) {
      return 'allt utom tvåhandsvapen';
    }
    if (types.includes('Korta vapen')) {
      return 'korta vapen';
    }
    if (types.includes('Långa vapen')) {
      return 'långa vapen';
    }
    if (hasNormalizedAny(types, ['Vapen']) && anyQualities.length) {
      const qualityText = joinLabelsWithOr(anyQualities);
      return qualityText ? `${qualityText} vapen` : '';
    }
    if (hasNormalizedAny(types, ['Vapen'])) {
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

  // Returns { faktor, tillagg } representing the combined weight modifier from character rules
  // for a specific inventory item.
  // vikt_faktor rules are multiplied together (starting from 1); supports nar.foremal item targeting.
  // vikt_tillagg rules are summed (starting from 0); supports nar.foremal item targeting.
  function getItemWeightModifiers(list, entry) {
    if (!entry) return { faktor: 1, tillagg: 0 };
    const entries = Array.isArray(list) ? list : [];
    const foremalCtx = {
      id: entry.id,
      namn: entry.namn,
      typ: entry.taggar?.typ ?? [],
      kvalitet: entry.taggar?.kvalitet ?? []
    };
    const ctx = { list: entries, foremal: foremalCtx };
    const faktor = getListRules(entries, { key: 'andrar', mal: 'vikt_faktor' })
      .filter(rule => evaluateRuleNar(rule, ctx))
      .reduce((prod, rule) => prod * Number(rule.varde ?? 1), 1);
    const tillagg = getListRules(entries, { key: 'andrar', mal: 'vikt_tillagg' })
      .filter(rule => evaluateRuleNar(rule, ctx))
      .reduce((sum, rule) => applyNumericChange(sum, rule, rule.sourceEntry), 0);
    return { faktor, tillagg };
  }

  function getEntryPrimaryLevelName(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const ownLevel = typeof entry.nivå === 'string' ? entry.nivå.trim() : '';
    if (ownLevel) return ownLevel;
    const levelKeys = Object.keys(entry.nivåer || {});
    return levelKeys.find(key => String(key || '').trim()) || '';
  }

  function toPositiveFiniteNumber(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return numeric;
  }

  function getQualityContextSummary(qualityNames = []) {
    const names = toArray(qualityNames).map(String).map(name => name.trim()).filter(Boolean);
    if (!names.length) {
      return {
        totalCount: 0,
        positiveCount: 0,
        mysticCount: 0
      };
    }

    const qualityByName = new Map();
    lookupEntriesByNames(names).forEach(entry => {
      const key = normalizeLevelName(entry?.namn || '');
      if (!key || qualityByName.has(key)) return;
      qualityByName.set(key, entry);
    });

    let positiveCount = 0;
    let mysticCount = 0;
    names.forEach(name => {
      const entry = qualityByName.get(normalizeLevelName(name));
      const types = toArray(entry?.taggar?.typ).map(normalizeLevelName);
      const isNegative = entry?.negativ === true
        || types.includes(normalizeLevelName('Negativ kvalitet'));
      const isNeutral = entry?.neutral === true
        || types.includes(normalizeLevelName('Neutral kvalitet'));
      const isMystic = types.includes(normalizeLevelName('Mystisk kvalitet'));
      if (!isNegative && !isNeutral) {
        positiveCount += 1;
        if (isMystic) mysticCount += 1;
      }
    });

    return {
      totalCount: names.length,
      positiveCount,
      mysticCount
    };
  }

  function buildItemRuleTargetContext(targetEntry, qualityNames = [], extra = {}) {
    const entry = targetEntry && typeof targetEntry === 'object' ? targetEntry : {};
    const names = toArray(qualityNames).map(String).map(name => name.trim()).filter(Boolean);
    const details = extra && typeof extra === 'object' ? extra : {};
    const qualitySummary = getQualityContextSummary(names);
    const levelName = typeof details.targetLevel === 'string' && details.targetLevel.trim()
      ? details.targetLevel.trim()
      : getEntryPrimaryLevelName(entry);
    const qualityCount = Number(details.kvalitet_antal ?? details.antal_kvalitet ?? qualitySummary.totalCount);
    const positiveCount = Number(details.positiv_kvalitet_antal ?? details.antal_positiv_kvalitet ?? qualitySummary.positiveCount);
    const mysticCount = Number(details.mystisk_kvalitet_antal ?? details.antal_mystisk_kvalitet ?? qualitySummary.mysticCount);
    const out = {
      id: entry.id,
      namn: entry.namn,
      typ: toArray(entry?.taggar?.typ ?? entry?.typ),
      kvalitet: names,
      niva: levelName,
      kvalitet_antal: Number.isFinite(qualityCount) ? qualityCount : names.length,
      antal_kvalitet: Number.isFinite(qualityCount) ? qualityCount : names.length,
      positiv_kvalitet_antal: Number.isFinite(positiveCount) ? positiveCount : 0,
      antal_positiv_kvalitet: Number.isFinite(positiveCount) ? positiveCount : 0,
      mystisk_kvalitet_antal: Number.isFinite(mysticCount) ? mysticCount : 0,
      antal_mystisk_kvalitet: Number.isFinite(mysticCount) ? mysticCount : 0
    };
    if (Object.prototype.hasOwnProperty.call(details, 'krav_uppfyllda')) {
      out.krav_uppfyllda = Boolean(details.krav_uppfyllda);
    }
    return out;
  }

  function normalizePriceOperation(operation, fallbackSetter = '') {
    const direct = normalizeLevelName(operation || '');
    if (['multiplicera', 'multiply', 'mul', 'factor', 'faktor'].includes(direct)) return 'multiply';
    if (['dividera', 'divide', 'div'].includes(direct)) return 'divide';
    if (['addera', 'add', 'plus'].includes(direct)) return 'add';
    if (['subtrahera', 'subtract', 'sub', 'minus'].includes(direct)) return 'subtract';

    const setterToken = normalizeLevelName(fallbackSetter || '');
    if (['add', 'addera'].includes(setterToken)) return 'add';
    if (['sub', 'subtract', 'subtrahera'].includes(setterToken)) return 'subtract';
    if (['divide', 'dividera', 'div'].includes(setterToken)) return 'divide';
    return 'multiply';
  }

  function readPriceRuleNumericValue(rule, operation) {
    if (!rule || typeof rule !== 'object') return null;
    const raw = rule.varde;
    if (operation === 'add' || operation === 'subtract') {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const asMoney = typeof window.moneyToO === 'function'
          ? window.moneyToO(raw)
          : (
            (Number(raw.daler ?? raw.d) || 0) * 100
            + (Number(raw.skilling ?? raw.s) || 0) * 10
            + (Number(raw['örtegar'] ?? raw.o) || 0)
          );
        if (Number.isFinite(asMoney)) return Number(asMoney);
      }
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }

  function readPriceRuleMatchMode(rule) {
    const fromRule = normalizeRequirementLogic(rule?.matchning, 'and');
    if (fromRule) return fromRule;
    const fromNar = normalizeRequirementLogic(rule?.nar?.matchning, 'and');
    if (fromNar) return fromNar;
    return 'and';
  }

  function readBoundedNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function evaluatePriceForemalCondition(condition, target, mode = 'and') {
    const cond = condition && typeof condition === 'object' ? condition : {};
    const out = [];

    const requiredTypes = toArray(cond.typ).map(String).filter(Boolean);
    if (requiredTypes.length) out.push(hasNormalizedAny(target?.typ, requiredTypes));

    const excludedTypes = toArray(cond.ingen_typ).map(String).filter(Boolean);
    if (excludedTypes.length) out.push(!hasNormalizedAny(target?.typ, excludedTypes));

    const anyQuality = toArray(cond.nagon_kvalitet).map(String).filter(Boolean);
    if (anyQuality.length) out.push(hasNormalizedAny(target?.kvalitet, anyQuality));

    const ids = toArray(cond.id).map(v => String(v || '').trim()).filter(Boolean);
    if (ids.length) out.push(ids.includes(String(target?.id || '').trim()));

    const names = toArray(cond.namn).map(v => normalizeLevelName(v)).filter(Boolean);
    if (names.length) out.push(names.includes(normalizeLevelName(target?.namn || '')));

    const levels = toArray(cond.niva ?? cond.nivå).map(v => normalizeLevelName(v)).filter(Boolean);
    if (levels.length) {
      const levelValue = normalizeLevelName(target?.niva ?? target?.nivå ?? target?.level ?? '');
      out.push(levels.includes(levelValue));
    }

    const qualityCount = Number(target?.kvalitet_antal ?? target?.antal_kvalitet ?? toArray(target?.kvalitet).length ?? 0);
    const positiveCount = Number(target?.positiv_kvalitet_antal ?? target?.antal_positiv_kvalitet ?? 0);
    const mysticCount = Number(target?.mystisk_kvalitet_antal ?? target?.antal_mystisk_kvalitet ?? 0);

    const qualityMin = readBoundedNumber(cond.antal_kvalitet_minst);
    if (qualityMin !== null) out.push(qualityCount >= qualityMin);
    const qualityMax = readBoundedNumber(cond.antal_kvalitet_max);
    if (qualityMax !== null) out.push(qualityCount <= qualityMax);

    const posMin = readBoundedNumber(cond.antal_positiv_kvalitet_minst);
    if (posMin !== null) out.push(positiveCount >= posMin);
    const posMax = readBoundedNumber(cond.antal_positiv_kvalitet_max);
    if (posMax !== null) out.push(positiveCount <= posMax);

    const mystMin = readBoundedNumber(cond.antal_mystisk_kvalitet_minst);
    if (mystMin !== null) out.push(mysticCount >= mystMin);
    const mystMax = readBoundedNumber(cond.antal_mystisk_kvalitet_max);
    if (mystMax !== null) out.push(mysticCount <= mystMax);

    if (Object.prototype.hasOwnProperty.call(cond, 'krav_uppfyllda')) {
      out.push(Boolean(target?.krav_uppfyllda) === isTruthyRuleValue(cond.krav_uppfyllda));
    }
    if (Object.prototype.hasOwnProperty.call(cond, 'krav_saknas')) {
      out.push(Boolean(!target?.krav_uppfyllda) === isTruthyRuleValue(cond.krav_saknas));
    }

    if (!out.length) return true;
    if (mode === 'or') return out.some(Boolean);
    return out.every(Boolean);
  }

  function evaluatePriceRuleNar(rule, context = {}) {
    if (!rule || typeof rule !== 'object') return false;
    const nar = rule.nar && typeof rule.nar === 'object' ? rule.nar : null;
    if (!nar) return true;

    const narWithoutForemal = cloneRuleValue(nar);
    delete narWithoutForemal.foremal;
    delete narWithoutForemal.matchning;

    if (Object.keys(narWithoutForemal).length && !evaluateNar(narWithoutForemal, context)) {
      return false;
    }

    if (!nar.foremal || typeof nar.foremal !== 'object') return true;
    const mode = readPriceRuleMatchMode(rule);
    const target = context.foremal && typeof context.foremal === 'object' ? context.foremal : {};
    return evaluatePriceForemalCondition(nar.foremal, target, mode);
  }

  function getPriceRuleEffectsForEntry(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return { factor: 1, additiveO: 0, explicit: false };
    let factor = 1;
    let additiveO = 0;
    let explicit = false;
    getRuleList(entry, 'andrar', { level: entry?.nivå || '' })
      .filter(rule => String(rule?.mal || '') === 'pris_faktor')
      .forEach(rule => {
        if (!evaluatePriceRuleNar(rule, context)) return;
        const operation = normalizePriceOperation(rule?.operation, rule?.satt);
        const value = readPriceRuleNumericValue(rule, operation);
        if (value === null) return;
        const setterMode = normalizeLevelName(rule?.satt || '');
        const replace = setterMode === 'ersatt' || setterMode === 'satt' || setterMode === 'replace' || setterMode === 'set';
        if (operation === 'add') {
          additiveO = replace ? value : additiveO + value;
        } else if (operation === 'subtract') {
          additiveO = replace ? -value : additiveO - value;
        } else if (operation === 'divide') {
          if (value === 0) return;
          factor = replace ? (1 / value) : (factor / value);
        } else {
          factor = replace ? value : (factor * value);
        }
        explicit = true;
      });
    return { factor, additiveO, explicit };
  }

  function getPriceRuleEffectsForEntries(entries, context = {}) {
    const list = Array.isArray(entries) ? entries : [];
    let factor = 1;
    let additiveO = 0;
    list.forEach(entry => {
      const effect = getPriceRuleEffectsForEntry(entry, context);
      if (!effect.explicit) return;
      factor *= toPositiveFiniteNumber(effect.factor, 1);
      additiveO += Number(effect.additiveO || 0);
    });
    return { factor, additiveO };
  }

  function getQualityGratisbarForEntry(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return { gratisbar: false, explicit: false };
    let gratisbar = false;
    let explicit = false;
    getRuleList(entry, 'andrar', { level: entry?.nivå || '' })
      .filter(rule => String(rule?.mal || '') === 'kvalitet_gratisbar')
      .forEach(rule => {
        if (!evaluateRuleNar(rule, context)) return;
        if (!Object.prototype.hasOwnProperty.call(rule, 'varde')) return;
        const value = isTruthyRuleValue(rule?.varde);
        const mode = normalizeLevelName(rule?.satt || '');
        if (mode === 'ersatt' || mode === 'satt' || !explicit) {
          gratisbar = value;
        } else {
          // When multiple non-replace rules match, the last matching rule wins.
          gratisbar = value;
        }
        explicit = true;
      });
    return { gratisbar, explicit };
  }

  function getItemQualityRuleEffects(qualityNames, targetEntry, options = {}) {
    const names = Array.from(new Set(
      toArray(qualityNames)
        .map(String)
        .map(name => name.trim())
        .filter(Boolean)
    ));
    if (!names.length) return {};

    const entriesByName = new Map();
    lookupEntriesByNames(names).forEach(entry => {
      const key = normalizeLevelName(entry?.namn || '');
      if (!key || entriesByName.has(key)) return;
      entriesByName.set(key, entry);
    });

    const out = {};
    names.forEach(name => {
      const key = normalizeLevelName(name);
      const entry = entriesByName.get(key);
      if (!entry) {
        out[name] = { multiplier: 1, gratisbar: false };
        return;
      }

      const details = options && typeof options === 'object'
        ? (options.foremalContext && typeof options.foremalContext === 'object' ? options.foremalContext : options)
        : {};
      const ctx = {
        ...(options && typeof options === 'object' ? options : {}),
        foremal: buildItemRuleTargetContext(targetEntry, names, details),
        targetEntry
      };
      const mult = getPriceRuleEffectsForEntry(entry, ctx);
      const free = getQualityGratisbarForEntry(entry, ctx);
      out[name] = {
        multiplier: mult.explicit ? toPositiveFiniteNumber(mult.factor, 1) : 1,
        additiveO: mult.explicit ? Number(mult.additiveO || 0) : 0,
        // Explicit-only model: unspecified means not gratisbar.
        gratisbar: free.explicit ? Boolean(free.gratisbar) : false
      };
    });
    return out;
  }

  function getItemPriceRuleEffects(list, qualityNames, targetEntry, options = {}) {
    const names = Array.from(new Set(
      toArray(qualityNames)
        .map(String)
        .map(name => name.trim())
        .filter(Boolean)
    ));
    const details = options && typeof options === 'object'
      ? (options.foremalContext && typeof options.foremalContext === 'object' ? options.foremalContext : options)
      : {};
    const context = {
      ...(options && typeof options === 'object' ? options : {}),
      foremal: buildItemRuleTargetContext(targetEntry, names, details),
      targetEntry
    };
    const listEffects = getPriceRuleEffectsForEntries(getRuleEntries(list), context);
    const qualityEffects = getItemQualityRuleEffects(names, targetEntry, options);
    let qualityFactor = 1;
    let qualityAdditiveO = 0;
    names.forEach(name => {
      const effect = qualityEffects[name];
      if (!effect || typeof effect !== 'object') return;
      qualityFactor *= toPositiveFiniteNumber(effect.multiplier, 1);
      qualityAdditiveO += Number(effect.additiveO || 0);
    });
    return {
      additiveO: Number(listEffects.additiveO || 0) + Number(qualityAdditiveO || 0),
      factor: toPositiveFiniteNumber(listEffects.factor, 1) * toPositiveFiniteNumber(qualityFactor, 1),
      listAdditiveO: Number(listEffects.additiveO || 0),
      listFactor: toPositiveFiniteNumber(listEffects.factor, 1),
      qualityAdditiveO: Number(qualityAdditiveO || 0),
      qualityFactor: toPositiveFiniteNumber(qualityFactor, 1),
      qualityEffects
    };
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
  registerMal('barkapacitet_stark', (list, ctx) => sumAndrarByMal(list, 'barkapacitet_stark', 0, ctx));
  registerMal('talighet_bas', (list, ctx) => getToughnessBase(list, ctx));
  registerMal('talighet_faktor', (list, ctx) => sumAndrarByMal(list, 'talighet_faktor', 1, ctx));
  registerMal('smartgrans_faktor', (list, ctx) => sumAndrarByMal(list, 'smartgrans_faktor', 1, ctx));
  registerMal('talighet_tillagg', (list, ctx) => sumAndrarByMal(list, 'talighet_tillagg', 0, ctx));
  registerMal('smartgrans_tillagg', (list, ctx) => getPainThresholdModifier(list, ctx));
  registerMal('barkapacitet', (list, ctx) => getCarryCapacityBase(list, ctx));
  registerMal('barkapacitet_faktor', (list, ctx) => sumAndrarByMal(list, 'barkapacitet_faktor', 1, ctx));
  registerMal('barkapacitet_tillagg', (list, ctx) => sumAndrarByMal(list, 'barkapacitet_tillagg', 3, ctx));
  registerMal('barkapacitet_bas', (list, ctx) => sumAndrarByMal(list, 'barkapacitet_bas', 0, ctx));
  registerMal('forsvar_modifierare', (list, ctx) => {
    const facts = Array.isArray(ctx?.weaponFacts)
      ? ctx.weaponFacts
      : (Array.isArray(ctx?.vapenFakta) ? ctx.vapenFakta : []);
    return getDefenseModifier(list, facts, ctx || {});
  });
  registerMal('traffsaker_modifierare', (list, ctx) => {
    const facts = Array.isArray(ctx?.weaponFacts)
      ? ctx.weaponFacts
      : (Array.isArray(ctx?.vapenFakta) ? ctx.vapenFakta : []);
    return getEquippedAttackModifier(list, facts, ctx || {});
  });
  registerMal('traffsaker_modifierare_vapen', (list, ctx) => getWeaponAttackBonus(list, ctx));
  registerMal('karaktarsdrag_max_tillagg', (list, ctx) => sumAndrarByMal(list, 'karaktarsdrag_max_tillagg', 0, ctx));
  registerMal('begransning_modifierare', (list, ctx) => getArmorRestrictionBonus(ctx?.qualityNames || [], ctx));
  registerMal('begransning_modifierare_fast', (list, ctx) => getArmorRestrictionBonusFast(ctx?.qualityNames || [], ctx));
  registerMal('nollstall_begransning_modifierare', (list) => hasArmorRestrictionReset(list));
  registerMal('tillater_monstruost', () => ({ allowAll: false, allowedNames: new Set() }));
  registerMal('anfall_karaktarsdrag', (list, ctx) => getAttackTraitRuleNotes(list, ctx));
  registerMal('forsvar_karaktarsdrag', (list, ctx) => getDefenseTraitRuleCandidates(list, ctx));
  registerMal('dansande_forsvar_karaktarsdrag', () => []); // deprecated: superseded by separat_forsvar_karaktarsdrag
  registerMal('separat_forsvar_karaktarsdrag', (list, ctx) =>
    getSeparateDefenseTraitRules(list, ctx).map(r => r.varde).filter(Boolean));
  registerMal('mystik_karaktarsdrag', (list) => getListRules(list, { key: 'andrar', mal: 'mystik_karaktarsdrag' }));
  registerMal('post', (list) => getListRules(list, { key: 'ger', mal: 'post' }));
  registerMal('foremal', (list, ctx) => getInventoryGrantItems(list, ctx));
  registerMal('pengar', (list, ctx) => getMoneyGrant(list, ctx));
  registerMal('Hidden', (list, ctx) => {
    const entries = Array.isArray(list) ? list : [];
    const rules = getListRules(entries, { key: 'andrar', mal: 'Hidden' });
    return rules.some(rule =>
      evaluateRuleNar(rule, { list: entries, ...(ctx || {}) })
      && isTruthyRuleValue(rule?.varde)
    );
  });
  registerMal('skydd_permanent_korruption', (list) => getListRules(list, { key: 'ger', mal: 'skydd_permanent_korruption' }));
  registerMal('vikt_faktor', (list, ctx) => getItemWeightModifiers(list, ctx?.targetEntry).faktor);
  registerMal('vikt_tillagg', (list, ctx) => getItemWeightModifiers(list, ctx?.targetEntry).tillagg);
  registerMal('pris_faktor', (list, ctx) => {
    const entries = getRuleEntries(list);
    if (!entries.length) return 1;
    const targetEntry = ctx?.targetEntry || null;
    const qualityNames = toArray(ctx?.qualityNames).map(String).filter(Boolean);
    const details = ctx && typeof ctx === 'object'
      ? (ctx.foremalContext && typeof ctx.foremalContext === 'object' ? ctx.foremalContext : ctx)
      : {};
    const targetContext = {
      ...(ctx && typeof ctx === 'object' ? ctx : {}),
      foremal: buildItemRuleTargetContext(targetEntry, qualityNames, details)
    };
    return toPositiveFiniteNumber(getPriceRuleEffectsForEntries(entries, targetContext).factor, 1);
  });
  registerMal('kvalitet_gratisbar', (list, ctx) => {
    const entries = getRuleEntries(list);
    if (!entries.length) return false;
    const targetEntry = ctx?.targetEntry || null;
    const qualityNames = toArray(ctx?.qualityNames).map(String).filter(Boolean);
    const details = ctx && typeof ctx === 'object'
      ? (ctx.foremalContext && typeof ctx.foremalContext === 'object' ? ctx.foremalContext : ctx)
      : {};
    const targetContext = {
      ...(ctx && typeof ctx === 'object' ? ctx : {}),
      foremal: buildItemRuleTargetContext(targetEntry, qualityNames, details)
    };
    let hasExplicit = false;
    let latest = false;
    entries.forEach(entry => {
      const value = getQualityGratisbarForEntry(entry, targetContext);
      if (!value.explicit) return;
      hasExplicit = true;
      latest = Boolean(value.gratisbar);
    });
    return hasExplicit ? latest : false;
  });

  window.rulesHelper = {
    RULE_KEYS,
    CHOICE_FIELDS,
    CHOICE_DUPLICATE_POLICIES,
    MAL_REGISTRY,
    registerMal,
    queryMal,
    normalizeRuleBlock,
    mergeRuleBlocks,
    mergeRuleBlocksByHierarchy,
    getTopLevelRules,
    getLevelRules,
    getTypeRules,
    getEntryRules,
    getRuleList,
    getEntryChoiceRule,
    getEntryChoiceDisplay,
    formatEntryDisplayName,
    getChoiceFieldDisplayLabel,
    resolveChoiceOptions,
    entryIgnoresLimits,
    getArtifactEffectChoiceRule,
    getArtifactEffectOption,
    getArtifactEffectValueLabel,
    getArtifactEffectValueEffects,
    getArtifactEffectValueRules,
    getLegacyChoiceRule,
    getListRules,
    evaluateNar,
    evaluateRuleNar,
    hasEntryAtLeastLevel,
    getConflictReasonsForCandidate,
    getConflictResolutionForCandidate,
    getMissingRequirementReasonsForCandidate,
    getRequirementEffectsForCandidate,
    getEntryMaxCount,
    evaluateEntryStops,
    formatEntryStopMessages,
    getRequirementDependents,
    getEntryGrantTargets,
    getEntryGrantDependents,
    getPartialGrantInfo,
    getGrantedLevelRestriction,
    getEntryErfOverride,
    setEntryErfOverride,
    clearEntryErfOverride,
    clearAllEntryErfOverrides,
    getMoneyGrant,
    validateDefenseLoadout,
    validateEquipment,
    getEquipmentConflictTypes,
    getEquipmentQualityRequirements,
    normalizeDefenseLoadout,
    buildCombatContext,
    getDefenseModifier,
    getEquippedDefenseModifier,
    getDefenseValueModifier,
    getArmorDefenseModifier,
    evaluateVapenNar,
    sumVapenBonusByMal,
    sumVapenBonus,
    getWeaponDefenseBonus,
    getWeaponAttackBonus,
    getEquippedAttackModifier,
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
    getSeparateDefenseTraitRules,
    getSelectiveDefenseModifier,
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
    materializeSnapshotAndrarRules,
    hasRules,
    getItemWeightModifiers,
    getItemQualityRuleEffects,
    getItemPriceRuleEffects,
    applyNumericChange,
    computeObjectFormulaValue
  };
})(window);
