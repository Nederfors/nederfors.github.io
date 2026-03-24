(function (window) {
  const LEVEL_VALUE = Object.freeze({
    '': 0,
    Novis: 1,
    Enkel: 1,
    'Gesäll': 2,
    'Ordinär': 2,
    'Mästare': 3,
    Avancerad: 3
  });
  const LEVEL_COST = Object.freeze({
    Novis: 10,
    Enkel: 10,
    'Gesäll': 30,
    'Ordinär': 20,
    'Mästare': 60,
    Avancerad: 30
  });
  const LEVEL_PRIORITY = Object.freeze([
    'Novis',
    'Enkel',
    'Gesäll',
    'Ordinär',
    'Mästare',
    'Avancerad'
  ]);
  const DEFAULT_XP_KALLOR = Object.freeze(['Förmåga', 'Basförmåga', 'Mystisk kraft', 'Ritual', 'Fördel']);

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toInt(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.floor(num));
  }

  function uniqStrings(list) {
    const out = [];
    const seen = new Set();
    toArray(list).forEach(item => {
      const value = String(item || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out;
  }

  function normalizeType(type) {
    const raw = String(type || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'förmåga' || lower === 'formaga') return 'Förmåga';
    if (lower === 'basförmåga' || lower === 'basformaga') return 'Basförmåga';
    if (lower === 'mystisk kraft' || lower === 'mystiskkraft') return 'Mystisk kraft';
    if (lower === 'ritual') return 'Ritual';
    if (lower === 'fördel' || lower === 'fordel') return 'Fördel';
    if (lower === 'nackdel') return 'Nackdel';
    if (lower === 'monstruöst särdrag' || lower === 'monstruost särdrag') return 'Monstruöst särdrag';
    if (lower === 'särdrag' || lower === 'sardrag') return 'Särdrag';
    return raw;
  }

  function normalizeLevel(level, fallback = 'Novis') {
    const raw = String(level || '').trim();
    if (!raw) return fallback;
    const lower = raw.toLowerCase();
    if (lower === 'novis') return 'Novis';
    if (lower === 'gesäll' || lower === 'gesall') return 'Gesäll';
    if (lower === 'mästare' || lower === 'mastare') return 'Mästare';
    if (lower === 'enkel') return 'Enkel';
    if (lower === 'ordinär' || lower === 'ordinar') return 'Ordinär';
    if (lower === 'avancerad') return 'Avancerad';
    return fallback;
  }

  function levelCost(level) {
    const norm = normalizeLevel(level, '');
    const helper = window.storeHelper;
    if (helper && typeof helper.typeBaseErf === 'function') {
      try {
        const fromStore = Number(helper.typeBaseErf('Förmåga', norm || 'Novis'));
        if (Number.isFinite(fromStore)) return fromStore;
      } catch {}
    }
    return LEVEL_COST[norm] || 10;
  }

  function entryDefinedLevels(entry) {
    const helper = window.storeHelper;
    if (helper && typeof helper.entryDefinedLevels === 'function') {
      try {
        const levels = helper.entryDefinedLevels(entry);
        if (Array.isArray(levels) && levels.length) {
          return levels.map(level => normalizeLevel(level, '')).filter(Boolean);
        }
      } catch {}
    }

    const keys = new Set();
    const add = (source) => {
      if (!source || typeof source !== 'object') return;
      Object.keys(source).forEach(level => {
        const norm = normalizeLevel(level, '');
        if (norm) keys.add(norm);
      });
    };
    add(entry?.levels);
    add(entry?.nivåer);
    add(entry?.nivaer);
    add(entry?.taggar?.nivå_data);
    add(entry?.taggar?.niva_data);
    return LEVEL_PRIORITY.filter(level => keys.has(level)).concat(
      Array.from(keys).filter(level => !LEVEL_PRIORITY.includes(level))
    );
  }

  function resolveEntryLevel(entry, preferredLevel, fallback = 'Novis') {
    const helper = window.storeHelper;
    if (helper && typeof helper.resolveEntryLevel === 'function') {
      try {
        const level = helper.resolveEntryLevel(entry, preferredLevel);
        const norm = normalizeLevel(level, '');
        if (norm) return norm;
      } catch {}
    }

    const preferred = normalizeLevel(preferredLevel, '');
    const selected = normalizeLevel(entry?.nivå, '');
    const defined = entryDefinedLevels(entry);

    if (preferred) {
      if (!defined.length || defined.includes(preferred)) return preferred;
      if (defined.length === 1) return defined[0];
    }
    if (selected) {
      if (!defined.length || defined.includes(selected)) return selected;
      if (defined.length === 1) return defined[0];
    }
    if (defined.length) {
      if (defined.includes('Novis')) return 'Novis';
      if (defined.includes('Enkel')) return 'Enkel';
      return defined[0];
    }
    return normalizeLevel(preferred || selected || fallback, fallback);
  }

  function typeBaseErf(type, level = 'Novis') {
    const normType = normalizeType(type);
    const helper = window.storeHelper;
    if (helper && typeof helper.typeBaseErf === 'function') {
      try {
        const fromStore = Number(helper.typeBaseErf(normType || type, level));
        if (Number.isFinite(fromStore)) return fromStore;
      } catch {}
    }
    if (normType === 'Nackdel') return 0;
    if (normType === 'Fördel') return 5;
    if (normType === 'Ritual') return 10;
    if (
      normType === 'Förmåga' ||
      normType === 'Basförmåga' ||
      normType === 'Mystisk kraft' ||
      normType === 'Monstruöst särdrag' ||
      normType === 'Särdrag'
    ) {
      return levelCost(level);
    }
    return 10;
  }

  function normalizeTypeList(input) {
    const out = [];
    const addType = (value) => {
      if (Array.isArray(value)) {
        value.forEach(addType);
        return;
      }
      const raw = String(value || '').trim();
      if (!raw) return;
      raw
        .split(/\s*(?:,|;|\/|\boch\b|\beller\b)\s*/i)
        .map(part => normalizeType(part))
        .filter(Boolean)
        .forEach(part => out.push(part));
    };
    addType(input);
    return uniqStrings(out);
  }

  function levelMeets(actual, required = 'Novis') {
    const cur = LEVEL_VALUE[normalizeLevel(actual, '')] || 0;
    const min = LEVEL_VALUE[normalizeLevel(required, 'Novis')] || 0;
    return cur >= min;
  }

  function isAbilityType(type) {
    const norm = normalizeType(type);
    return norm === 'Förmåga' || norm === 'Basförmåga';
  }

  function splitComma(str) {
    const out = [];
    let buf = '';
    let depth = 0;
    const input = String(str || '');
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function splitOr(str) {
    const out = [];
    let buf = '';
    let depth = 0;
    const input = String(str || '');
    const lower = input.toLowerCase();
    for (let i = 0; i < input.length;) {
      if (lower.startsWith(' eller ', i) && depth === 0) {
        if (buf.trim()) out.push(buf.trim());
        buf = '';
        i += 7;
        continue;
      }
      const ch = input[i];
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      buf += ch;
      i++;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function formatRequirementGroup(group) {
    const items = (Array.isArray(group) ? group : [])
      .map(item => String(item || '').trim())
      .filter(Boolean);
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    return items.join(' eller ');
  }

  function normalizePrimaryNames(rawPrimary = {}) {
    const source = rawPrimary && typeof rawPrimary === 'object'
      ? rawPrimary
      : { namn: rawPrimary };
    const out = [];
    const pushName = (value) => {
      const text = String(value || '').trim();
      if (!text) return;
      out.push(text);
    };
    const add = (value) => {
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      const text = String(value || '').trim();
      if (!text) return;

      const commaParts = splitComma(text);
      if (commaParts.length > 1) {
        commaParts.forEach(add);
        return;
      }

      const splitParts = text
        .split(/\s*(?:;|\/|\|)\s*/)
        .map(part => part.trim())
        .filter(Boolean);
      if (splitParts.length > 1) {
        splitParts.forEach(add);
        return;
      }

      const orParts = splitOr(text);
      if (orParts.length > 1) {
        orParts.forEach(add);
        return;
      }

      pushName(text);
    };

    add(source.namn);
    add(source.namn_lista);
    add(source.alternativ);
    add(source.namn_or);
    return uniqStrings(out);
  }

  function normalizePrimary(rawPrimary = {}) {
    const source = rawPrimary && typeof rawPrimary === 'object'
      ? rawPrimary
      : { namn: rawPrimary };
    const names = normalizePrimaryNames(source);
    return {
      namn: names.length === 1 ? names[0] : names,
      namn_lista: names,
      krav_erf: toInt(source.krav_erf, 0)
    };
  }

  function normalizeNamedCount(raw = {}) {
    return {
      namn: uniqStrings(raw.namn),
      min_antal: toInt(raw.min_antal, 0)
    };
  }

  function normalizeSpecificAlternative(raw = {}) {
    if (typeof raw === 'string') {
      const text = String(raw || '').trim();
      if (!text) return null;
      return { typ: '', namn: text };
    }
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.namn || '').trim();
    if (!name) return null;
    return {
      typ: normalizeType(raw.typ),
      namn: name
    };
  }

  function normalizeSpecificChoice(raw = {}) {
    const seen = new Set();
    const alternatives = toArray(raw.alternativ)
      .map(normalizeSpecificAlternative)
      .filter(Boolean)
      .filter(item => {
        const key = `${normalizeKey(item.typ)}::${normalizeKey(item.namn)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const hasMinCount = raw.min_antal !== undefined && raw.min_antal !== null && String(raw.min_antal).trim() !== '';
    return {
      alternativ: alternatives,
      krav_erf: toInt(raw.krav_erf, 0),
      min_antal: hasMinCount ? Math.max(0, toInt(raw.min_antal, 0)) : 1
    };
  }

  function normalizeValfriRule(raw = {}) {
    return {
      typ: normalizeType(raw.typ),
      taggfalt: String(raw.taggfalt || raw.field || '').trim(),
      taggar: uniqStrings(raw.taggar || raw.values),
      xp_kallor: normalizeTypeList(raw.xp_kallor || raw.allowed_entry_types),
      krav_erf: toInt(raw.krav_erf, 0)
    };
  }

  function normalizeCanonicalEliteRequirements(raw = {}) {
    const base = {
      total_erf: toInt(raw.total_xp ?? raw.total_erf, 0),
      primarformaga: normalizePrimary({}),
      specifikt_val: [],
      valfri_inom_tagg: [],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: normalizeNamedCount({}),
      specifika_nackdelar: normalizeNamedCount({})
    };

    toArray(raw.stages).forEach((stage, idx) => {
      const kind = String(stage?.kind || '').trim();
      if (!kind) return;

      if (kind === 'primary') {
        base.primarformaga = normalizePrimary({
          namn_lista: toArray(stage?.options).map(option => option?.name ?? option?.namn),
          krav_erf: stage?.min_xp
        });
        return;
      }

      if (kind === 'specific_choice') {
        const normalized = normalizeSpecificChoice({
          alternativ: toArray(stage?.options).map(option => ({
            typ: option?.type ?? option?.typ,
            namn: option?.name ?? option?.namn
          })),
          krav_erf: stage?.min_xp,
          min_antal: stage?.min_count
        });
        if (normalized.alternativ.length && normalized.krav_erf > 0) {
          base.specifikt_val.push(normalized);
        }
        return;
      }

      if (kind === 'tag_pool') {
        const normalized = normalizeValfriRule({
          typ: stage?.entry_type ?? stage?.type,
          taggfalt: stage?.field,
          taggar: stage?.values,
          allowed_entry_types: stage?.allowed_entry_types,
          krav_erf: stage?.min_xp
        });
        if (normalized.taggfalt && normalized.taggar.length && normalized.krav_erf > 0) {
          base.valfri_inom_tagg.push(normalized);
        }
        return;
      }

      if (kind === 'optional_pool') {
        base.valfritt = {
          krav_erf: Math.max(base.valfritt.krav_erf, toInt(stage?.min_xp, 0)),
          xp_kallor: normalizeTypeList(stage?.allowed_entry_types)
        };
        return;
      }

      if (kind === 'named_count') {
        const entryType = normalizeType(stage?.entry_type || stage?.type);
        const named = normalizeNamedCount({
          namn: stage?.names,
          min_antal: stage?.min_count
        });
        if (entryType === 'Fördel') {
          base.specifika_fordelar = named;
        } else if (entryType === 'Nackdel') {
          base.specifika_nackdelar = named;
        }
        return;
      }

      const id = String(stage?.id || '').trim() || `stage_${idx}`;
      if (id === 'specific_benefits') {
        base.specifika_fordelar = normalizeNamedCount({ namn: stage?.names, min_antal: stage?.min_count });
      } else if (id === 'specific_drawbacks') {
        base.specifika_nackdelar = normalizeNamedCount({ namn: stage?.names, min_antal: stage?.min_count });
      }
    });

    return base;
  }

  function normalizeKrav(rawKrav = {}) {
    const raw = rawKrav && typeof rawKrav === 'object' ? rawKrav : {};
    if (Array.isArray(raw.stages)) {
      return normalizeCanonicalEliteRequirements(raw);
    }
    return {
      total_erf: toInt(raw.total_erf, 0),
      primarformaga: normalizePrimary(raw.primarformaga || {}),
      specifikt_val: toArray(raw.specifikt_val)
        .map(normalizeSpecificChoice)
        .filter(rule => rule.alternativ.length > 0 && rule.krav_erf > 0 && rule.min_antal >= 0),
      valfri_inom_tagg: toArray(raw.valfri_inom_tagg)
        .map(normalizeValfriRule)
        .filter(rule => rule.taggfalt && rule.taggar.length > 0 && rule.krav_erf > 0),
      valfritt: {
        krav_erf: toInt(raw?.valfritt?.krav_erf, 0),
        xp_kallor: normalizeTypeList(raw?.valfritt?.xp_kallor)
      },
      specifika_fordelar: normalizeNamedCount(raw.specifika_fordelar || {}),
      specifika_nackdelar: normalizeNamedCount(raw.specifika_nackdelar || {})
    };
  }

  function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getDBList(options = {}) {
    if (Array.isArray(options.dbList)) return options.dbList;
    if (Array.isArray(window.DBList)) return window.DBList;
    if (Array.isArray(window.DB)) return window.DB;
    return [];
  }

  function getLookup(options = {}) {
    if (typeof options.lookupEntry === 'function') return options.lookupEntry;
    if (typeof window.lookupEntry === 'function') return window.lookupEntry;
    return null;
  }

  function findEntryByName(name, options = {}) {
    const key = normalizeKey(name);
    if (!key) return null;
    const lookup = getLookup(options);
    if (lookup) {
      try {
        const hit = lookup({ id: name, name }) || lookup(name);
        if (hit) return hit;
      } catch { }
    }
    return getDBList(options).find(entry => normalizeKey(entry?.namn || entry?.name) === key) || null;
  }

  function entryTypes(entry) {
    return toArray(entry?.taggar?.typ ?? entry?.tags?.types).map(normalizeType).filter(Boolean);
  }

  function entryHasType(entry, type) {
    const want = normalizeType(type);
    if (!want) return true;
    const types = entryTypes(entry);
    if (types.includes(want)) return true;
    if (want === 'Förmåga' && types.includes('Basförmåga')) return true;
    return false;
  }

  function parsePositiveLimit(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.floor(numeric);
    if (rounded <= 0) return null;
    return rounded;
  }

  function normalizeMaxCount(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 99;
    const rounded = Math.floor(numeric);
    if (rounded <= 0) return fallback;
    return rounded;
  }

  function getEntryMaxCount(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return 1;
    if (typeof window.rulesHelper?.getEntryMaxCount === 'function') {
      return normalizeMaxCount(window.rulesHelper.getEntryMaxCount(entry, options), 1);
    }
    if (typeof window.storeHelper?.getEntryMaxCount === 'function') {
      return normalizeMaxCount(window.storeHelper.getEntryMaxCount(entry, options), 1);
    }
    const tagLimit = parsePositiveLimit(entry?.taggar?.max_antal ?? entry?.tags?.max_count);
    if (tagLimit !== null) return tagLimit;
    const directLimit = parsePositiveLimit(entry?.max_antal);
    if (directLimit !== null) return directLimit;
    if (options.allowLegacy !== false) {
      const legacyMulti = Boolean(
        entry?.kan_införskaffas_flera_gånger === true
        || entry?.taggar?.kan_införskaffas_flera_gånger === true
      );
      if (legacyMulti) return 3;
    }
    return 1;
  }

  function entryAllowsMultiple(entry) {
    return getEntryMaxCount(entry) > 1;
  }

  function isRepeatableBenefitEntry(entry) {
    if (!entryAllowsMultiple(entry)) return false;
    return entryHasType(entry, 'Fördel') || entryHasType(entry, 'Nackdel');
  }

  function requirementErf(entry, level) {
    if (!entry) return 0;
    if (entryHasType(entry, 'Nackdel')) return typeBaseErf('Nackdel', 'Novis');
    if (entryHasType(entry, 'Fördel')) return typeBaseErf('Fördel', 'Novis');
    if (entryHasType(entry, 'Ritual')) return typeBaseErf('Ritual', 'Novis');
    if (
      entryHasType(entry, 'Förmåga') ||
      entryHasType(entry, 'Basförmåga') ||
      entryHasType(entry, 'Mystisk kraft') ||
      entryHasType(entry, 'Monstruöst särdrag') ||
      entryHasType(entry, 'Särdrag')
    ) {
      const lvl = resolveEntryLevel(entry, level, 'Novis');
      const helper = window.storeHelper;
      if (helper && typeof helper.entryLevelCost === 'function') {
        try {
          const fromStore = Number(helper.entryLevelCost(entry, lvl));
          if (Number.isFinite(fromStore)) return fromStore;
        } catch {}
      }
      return levelCost(lvl);
    }
    return 10;
  }

  function isEliteSkillEntry(entry) {
    return toArray(entry?.taggar?.typ).includes('Elityrkesförmåga');
  }

  function getValueCaseInsensitive(obj, key) {
    if (!obj || typeof obj !== 'object') return undefined;
    const wanted = String(key || '').trim().toLowerCase();
    if (!wanted) return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    const match = Object.keys(obj).find(name => String(name || '').trim().toLowerCase() === wanted);
    return match ? obj[match] : undefined;
  }

  function getTagValues(entry, field) {
    const tagField = String(field || '').trim();
    if (!tagField) return [];
    if (tagField === 'namn' || tagField === 'name') {
      const name = String(entry?.namn || entry?.name || '').trim();
      return name ? [name] : [];
    }
    const values = [];
    const add = (value) => {
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      const text = String(value || '').trim();
      if (text) values.push(text);
    };
    add(getValueCaseInsensitive(entry, tagField));
    add(getValueCaseInsensitive(entry?.taggar, tagField));
    add(getValueCaseInsensitive(entry?.tags, tagField));
    return values;
  }

  function matchesTagRule(entry, rule = {}) {
    const tags = uniqStrings(rule.taggar || []);
    if (!tags.length) return true;
    const field = String(rule.taggfalt || '').trim();
    if (!field) return false;
    const target = new Set(tags.map(normalizeKey));
    return getTagValues(entry, field).some(value => target.has(normalizeKey(value)));
  }

  function resolveGroupNamesFromRule(rule, options = {}) {
    const db = getDBList(options);
    const names = db
      .filter(entry => !isEliteSkillEntry(entry))
      .filter(entry => {
        if (rule.typ && !entryHasType(entry, rule.typ)) return false;
        if (!matchesTagRule(entry, rule)) return false;
        if (entryHasType(entry, 'Fördel') || entryHasType(entry, 'Nackdel')) return false;
        return true;
      })
      .map(entry => String(entry?.namn || '').trim())
      .filter(Boolean);
    return uniqStrings(names).sort((a, b) => a.localeCompare(b, 'sv'));
  }

  function normalizeXpSources(list) {
    const allowed = new Set([
      'Förmåga',
      'Basförmåga',
      'Mystisk kraft',
      'Ritual',
      'Fördel',
      'Nackdel',
      'Monstruöst särdrag',
      'Särdrag'
    ]);
    const sources = uniqStrings(list).map(normalizeType).filter(Boolean);
    const filtered = sources.filter(type => allowed.has(type));
    return filtered.length ? filtered : DEFAULT_XP_KALLOR.slice();
  }

  function entryMatchesXpSources(entry, xpSources = []) {
    const sources = normalizeXpSources(xpSources);
    if (!sources.length) return true;
    return sources.some(type => entryHasType(entry, type));
  }

  function resolveGroupNamesFromTagRule(rule, options = {}, xpSources = []) {
    const db = getDBList(options);
    const names = db
      .filter(entry => !isEliteSkillEntry(entry))
      .filter(entry => matchesTagRule(entry, rule))
      .filter(entry => entryMatchesXpSources(entry, xpSources))
      .map(entry => String(entry?.namn || '').trim())
      .filter(Boolean);
    return uniqStrings(names).sort((a, b) => a.localeCompare(b, 'sv'));
  }

  function buildPrimaryOption(name, options = {}, explicitMinErf = 0) {
    const primaryName = String(name || '').trim();
    if (!primaryName) return null;
    const entry = findEntryByName(primaryName, options);
    const type = normalizeType(entryTypes(entry)[0] || 'Förmåga');
    let minErf = Math.max(0, Number(explicitMinErf) || 0);
    if (entry) {
      if (minErf <= 0 && type === 'Ritual') {
        minErf = requirementErf(entry, 'Novis');
      } else if (minErf <= 0 && type !== 'Fördel' && type !== 'Nackdel') {
        const levels = entryDefinedLevels(entry);
        const targetLevel = levels.length
          ? levels.slice().sort((a, b) => (LEVEL_VALUE[b] || 0) - (LEVEL_VALUE[a] || 0))[0]
          : (isAbilityType(type) ? 'Mästare' : 'Novis');
        minErf = requirementErf(entry, targetLevel);
      }
    }
    return {
      name: primaryName,
      type,
      min_erf: Math.max(0, Number(minErf) || 0),
      allRitual: type === 'Ritual'
    };
  }

  function buildNamedCountGroup(source, type, config = {}, options = {}) {
    const normType = normalizeType(type);
    const names = uniqStrings(config?.namn);
    const minCount = Math.max(0, Number(config?.min_antal) || 0);
    if (!normType || !names.length || minCount <= 0) return null;
    const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
    return {
      source,
      type: normType,
      names,
      min_niva: 'Novis',
      min_antal: minCount,
      min_erf: 0,
      slot_count: Math.max(1, minCount),
      dynamic_select: true,
      allow_repeat: allowRepeat
    };
  }

  function getKravGroups(rawKrav, options = {}) {
    const krav = normalizeKrav(rawKrav);
    const groups = [];
    const primaryNames = uniqStrings(
      toArray(krav?.primarformaga?.namn_lista).length
        ? krav.primarformaga.namn_lista
        : [krav?.primarformaga?.namn]
    );
    const primaryOptions = primaryNames
      .map(name => buildPrimaryOption(name, options, krav?.primarformaga?.krav_erf))
      .filter(Boolean);
    if (primaryOptions.length) {
      const types = uniqStrings(primaryOptions.map(opt => normalizeType(opt.type)).filter(Boolean));
      const minErf = Math.max(
        0,
        Number(krav?.primarformaga?.krav_erf) || 0,
        Number(primaryOptions[0]?.min_erf) || 0
      );
      groups.push({
        source: 'primarformaga',
        type: types.length === 1 ? types[0] : '',
        names: primaryOptions.map(opt => opt.name),
        min_antal: 1,
        min_niva: 'Novis',
        min_erf: minErf,
        allRitual: types.length === 1 && types[0] === 'Ritual',
        isPrimary: true,
        dynamic_select: true,
        primary_options: primaryOptions
      });
    }

    toArray(krav.specifikt_val).forEach((choice, idx) => {
      const alternatives = toArray(choice.alternativ)
        .map(normalizeSpecificAlternative)
        .filter(Boolean);
      if (!alternatives.length) return;
      const minErf = Math.max(0, Number(choice.krav_erf) || 0);
      const minCount = Math.max(0, Number(choice.min_antal) || 0);
      if (minErf <= 0) return;
      const names = uniqStrings(alternatives.map(item => item.namn));
      const types = uniqStrings(alternatives.map(item => normalizeType(item.typ)).filter(Boolean));
      const oneType = types.length === 1 ? types[0] : '';
      const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
      const slotByErf = minErf > 0 ? Math.ceil(minErf / 10) : 0;
      groups.push({
        source: `specifikt_val[${idx}]`,
        type: oneType,
        names,
        min_antal: minCount,
        min_niva: 'Novis',
        min_erf: minErf,
        slot_count: Math.max(1, minCount, slotByErf),
        dynamic_select: true,
        allow_repeat: allowRepeat,
        specifikt_val: {
          alternativ: alternatives,
          krav_erf: minErf,
          min_antal: minCount
        }
      });
    });

    toArray(krav.valfri_inom_tagg).forEach((rawRule, idx) => {
      const rule = normalizeValfriRule(rawRule);
      const minErf = Math.max(0, Number(rule.krav_erf) || 0);
      if (!rule.taggfalt || !rule.taggar.length || minErf <= 0) return;
      const names = rule.taggfalt === 'namn' && rule.taggar.length
        ? rule.taggar.slice()
        : resolveGroupNamesFromTagRule(rule, options, rule.xp_kallor);
      const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
      groups.push({
        source: `valfri_inom_tagg[${idx}]`,
        type: rule.typ || '',
        names: uniqStrings(names),
        min_antal: 0,
        min_niva: 'Novis',
        min_erf: minErf,
        slot_count: Math.max(1, Math.ceil(minErf / 10)),
        dynamic_select: true,
        allow_repeat: allowRepeat,
        tagRule: {
          taggfalt: rule.taggfalt,
          taggar: rule.taggar,
          typ: rule.typ,
          xp_kallor: rule.xp_kallor,
          krav_erf: minErf
        }
      });
    });

    const specificBenefits = buildNamedCountGroup('specifika_fordelar', 'Fördel', krav.specifika_fordelar, options);
    if (specificBenefits) groups.push(specificBenefits);

    const specificDrawbacks = buildNamedCountGroup('specifika_nackdelar', 'Nackdel', krav.specifika_nackdelar, options);
    if (specificDrawbacks) groups.push(specificDrawbacks);

    return groups;
  }

  function listRequirementNames(rawKrav, options = {}) {
    const names = [];
    getKravGroups(rawKrav, options).forEach(group => {
      toArray(group.names).forEach(name => names.push(name));
    });
    return uniqStrings(names);
  }

  function matchesValfriRule(entry, rawRule = {}) {
    const rule = normalizeValfriRule(rawRule);
    if (!rule.taggfalt || !rule.taggar.length) return false;
    if (rule.typ && !entryHasType(entry, rule.typ)) return false;
    if (!matchesTagRule(entry, rule)) return false;
    return true;
  }

  window.eliteUtils = Object.freeze({
    LEVEL_VALUE,
    splitComma,
    splitOr,
    parseElityrkeRequirements: getKravGroups,
    formatRequirementGroup,
    normalizeType,
    normalizeTypeList,
    normalizeLevel,
    levelMeets,
    typeBaseErf,
    normalizeKrav,
    getKravGroups,
    listRequirementNames,
    matchesTagRule,
    matchesValfriRule,
    findEntryByName,
    entryHasType,
    getEntryMaxCount,
    isRepeatableBenefitEntry,
    requirementErf
  });
})(window);
