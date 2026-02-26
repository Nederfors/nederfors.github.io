(function (window) {
  const LEVEL_VALUE = Object.freeze({ '': 0, Novis: 1, 'Gesäll': 2, 'Mästare': 3 });
  const DEFAULT_XP_KALLOR = Object.freeze(['Förmåga', 'Mystisk kraft', 'Ritual', 'Fördel']);

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
    if (raw === 'Novis' || raw === 'Gesäll' || raw === 'Mästare') return raw;
    return fallback;
  }

  function typeBaseErf(type, level = 'Novis') {
    const normType = normalizeType(type);
    if (normType === 'Nackdel') return 0;
    if (normType === 'Fördel') return 5;
    if (normType === 'Ritual') return 10;
    if (
      normType === 'Förmåga' ||
      normType === 'Mystisk kraft' ||
      normType === 'Monstruöst särdrag' ||
      normType === 'Särdrag'
    ) {
      const lvl = normalizeLevel(level, 'Novis');
      if (lvl === 'Mästare') return 60;
      if (lvl === 'Gesäll') return 30;
      return 10;
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

  function normalizeTagRule(raw = {}, includeActive = false) {
    const parseActive = (value) => {
      if (typeof value === 'string') {
        const norm = value.trim().toLowerCase();
        if (norm === 'true') return true;
        if (norm === 'false') return false;
      }
      return Boolean(value);
    };
    const activeDefault = includeActive ? parseActive(raw.aktiv) : false;
    return {
      aktiv: includeActive ? activeDefault : false,
      taggfalt: String(raw.taggfalt || '').trim(),
      taggar: uniqStrings(raw.taggar),
      krav_erf: toInt(raw.krav_erf, 0),
      min_antal: toInt(raw.min_antal, 0)
    };
  }

  function normalizeSpecific(raw = {}, type) {
    const normType = normalizeType(type);
    const minCount = toInt(raw.min_antal, 0);
    const hasExplicitMinErf = raw.min_erf !== undefined && raw.min_erf !== null && String(raw.min_erf).trim() !== '';
    let minErf = toInt(raw.min_erf, 0);
    if (!hasExplicitMinErf && raw.min_niva !== undefined) {
      const legacyLevel = normalizeLevel(raw.min_niva || 'Novis', 'Novis');
      minErf = minCount * typeBaseErf(normType, legacyLevel);
    }
    return {
      namn: uniqStrings(raw.namn),
      min_antal: minCount,
      min_erf: minErf
    };
  }

  function normalizeValfriRule(raw = {}) {
    const types = normalizeTypeList(raw.typ);
    const type = types.length === 1 ? types[0] : '';
    const minCount = toInt(raw.min_antal, 0);
    const hasExplicitMinErf = raw.min_erf !== undefined && raw.min_erf !== null && String(raw.min_erf).trim() !== '';
    let minErf = toInt(raw.min_erf, 0);
    if (!hasExplicitMinErf && raw.min_niva !== undefined) {
      const legacyLevel = normalizeLevel(raw.min_niva || 'Novis', 'Novis');
      const legacyType = types[0] || normalizeType(raw.typ);
      minErf = minCount * typeBaseErf(legacyType || 'Förmåga', legacyLevel);
    }
    const rule = {
      typ: type,
      typer: types,
      taggfalt: String(raw.taggfalt || '').trim(),
      taggar: uniqStrings(raw.taggar),
      min_antal: minCount,
      min_erf: minErf
    };
    return rule;
  }

  function normalizeKrav(rawKrav = {}) {
    const raw = rawKrav && typeof rawKrav === 'object' ? rawKrav : {};
    const primaryRaw = raw.primarformaga || {};
    return {
      primarformaga: {
        namn: String(primaryRaw.namn || '').trim()
      },
      primartagg: normalizeTagRule(raw.primartagg, false),
      sekundartagg: normalizeTagRule(raw.sekundartagg, true),
      valfri_inom_tagg: toArray(raw.valfri_inom_tagg).map(normalizeValfriRule),
      specifika_formagor: normalizeSpecific(raw.specifika_formagor, 'Förmåga'),
      specifika_mystiska_krafter: normalizeSpecific(raw.specifika_mystiska_krafter, 'Mystisk kraft'),
      specifika_ritualer: normalizeSpecific(raw.specifika_ritualer, 'Ritual'),
      specifika_fordelar: normalizeSpecific(raw.specifika_fordelar, 'Fördel'),
      specifika_nackdelar: normalizeSpecific(raw.specifika_nackdelar, 'Nackdel')
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
    return getDBList(options).find(entry => normalizeKey(entry?.namn) === key) || null;
  }

  function entryTypes(entry) {
    return toArray(entry?.taggar?.typ).map(normalizeType).filter(Boolean);
  }

  function entryHasType(entry, type) {
    const want = normalizeType(type);
    if (!want) return true;
    return entryTypes(entry).includes(want);
  }

  function entryAllowsMultiple(entry) {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.kan_införskaffas_flera_gånger) return true;
    if (entry.taggar?.kan_införskaffas_flera_gånger) return true;
    return false;
  }

  function isRepeatableBenefitEntry(entry) {
    if (!entryAllowsMultiple(entry)) return false;
    return entryHasType(entry, 'Fördel') || entryHasType(entry, 'Nackdel');
  }

  function requirementErf(entry, level) {
    if (!entry) return 0;
    if (entryHasType(entry, 'Nackdel')) return 0;
    if (entryHasType(entry, 'Fördel')) return 5;
    if (entryHasType(entry, 'Ritual')) return 10;
    if (
      entryHasType(entry, 'Förmåga') ||
      entryHasType(entry, 'Mystisk kraft') ||
      entryHasType(entry, 'Monstruöst särdrag') ||
      entryHasType(entry, 'Särdrag')
    ) {
      const lvl = normalizeLevel(level || entry?.nivå, 'Novis');
      if (lvl === 'Mästare') return 60;
      if (lvl === 'Gesäll') return 30;
      return 10;
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
    if (tagField === 'namn') {
      const name = String(entry?.namn || '').trim();
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
    const types = normalizeTypeList(rule.typer?.length ? rule.typer : rule.typ);
    if (!types.length) return [];
    const db = getDBList(options);
    const names = db
      .filter(entry => !isEliteSkillEntry(entry))
      .filter(entry => types.some(type => entryHasType(entry, type)))
      .filter(entry => matchesTagRule(entry, rule))
      .map(entry => String(entry?.namn || '').trim())
      .filter(Boolean);
    return uniqStrings(names).sort((a, b) => a.localeCompare(b, 'sv'));
  }

  function normalizeXpSources(list) {
    const allowed = new Set([
      'Förmåga',
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
    const types = entryTypes(entry);
    return sources.some(type => types.includes(type));
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

  function buildNameGroups(source, type, config = {}, options = {}, extra = {}) {
    const normType = normalizeType(type);
    const list = uniqStrings(config?.namn);
    const minCount = toInt(config?.min_antal, 0);
    const minErf = toInt(config?.min_erf, 0);
    if (!normType || !list.length || (minCount <= 0 && minErf <= 0)) return [];
    const ritual = normType === 'Ritual';
    const allowRepeat = list.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
    const slotCost = Math.max(1, typeBaseErf(normType, 'Novis'));
    const slotByErf = minErf > 0 ? Math.ceil(minErf / slotCost) : 0;
    return [{
      source,
      type: normType,
      names: list,
      min_niva: 'Novis',
      min_antal: minCount,
      min_erf: minErf,
      slot_count: Math.max(1, minCount, slotByErf),
      allRitual: ritual,
      dynamic_select: minCount < list.length || minErf > 0,
      allow_repeat: allowRepeat,
      ...extra
    }];
  }

  function getKravGroups(rawKrav, options = {}) {
    const krav = normalizeKrav(rawKrav);
    const groups = [];
    const xpSources = DEFAULT_XP_KALLOR.slice();

    const pushTagXpGroup = (source, rawRule = {}) => {
      const tagRule = normalizeTagRule(rawRule, source === 'sekundartagg');
      const minErf = Math.max(0, Number(tagRule.krav_erf) || 0);
      const minCount = Math.max(0, Number(tagRule.min_antal) || 0);
      if (source === 'sekundartagg' && !tagRule.aktiv) return;
      if (!tagRule.taggfalt || !tagRule.taggar.length || (minErf <= 0 && minCount <= 0)) return;
      const names = resolveGroupNamesFromTagRule(tagRule, options, xpSources);
      const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
      const minPositiveCost = names
        .map(name => requirementErf(findEntryByName(name, options), 'Novis'))
        .filter(cost => cost > 0)
        .reduce((min, cost) => Math.min(min, cost), Infinity);
      const slotCost = Number.isFinite(minPositiveCost) ? minPositiveCost : 5;
      const slotByErf = minErf > 0 ? Math.ceil(minErf / Math.max(1, slotCost)) : 0;
      groups.push({
        source,
        type: '',
        names,
        min_antal: minCount,
        min_niva: 'Novis',
        min_erf: minErf,
        slot_count: Math.max(1, minCount, slotByErf),
        dynamic_select: true,
        allow_repeat: allowRepeat,
        tagRule: {
          ...tagRule,
          xp_kallor: xpSources
        }
      });
    };

    const primaryName = String(krav.primarformaga?.namn || '').trim();
    if (primaryName) {
      const entry = findEntryByName(primaryName, options);
      const type = normalizeType(entryTypes(entry)[0] || 'Förmåga');
      const minErf = typeBaseErf(type, type === 'Ritual' ? 'Novis' : 'Mästare');
      groups.push({
        source: 'primarformaga',
        type,
        names: [primaryName],
        min_antal: 1,
        min_niva: 'Novis',
        min_erf: minErf,
        allRitual: type === 'Ritual',
        isPrimary: true
      });
    }

    pushTagXpGroup('primartagg', krav.primartagg);
    pushTagXpGroup('sekundartagg', krav.sekundartagg);

    toArray(krav.valfri_inom_tagg).forEach((rawRule, idx) => {
      const rule = normalizeValfriRule(rawRule);
      const types = normalizeTypeList(rule.typer?.length ? rule.typer : rule.typ);
      const hasAnyRequirement = (rule.min_antal > 0) || (rule.min_erf > 0);
      if (!types.length || !hasAnyRequirement) return;
      const source = `valfri_inom_tagg[${idx}]`;
      const isAnyByType = !rule.taggfalt && !rule.taggar.length;

      if (isAnyByType && types.length === 1 && types[0] === 'Mystisk kraft') {
        groups.push({
          source,
          type: 'Mystisk kraft',
          types,
          anyMystic: true,
          min_antal: rule.min_antal,
          min_niva: 'Novis',
          min_erf: rule.min_erf,
          dynamic_select: true
        });
        return;
      }

      if (isAnyByType && types.length === 1 && types[0] === 'Ritual') {
        groups.push({
          source,
          type: 'Ritual',
          types,
          anyRitual: true,
          allRitual: true,
          min_antal: rule.min_antal,
          min_niva: 'Novis',
          min_erf: rule.min_erf,
          dynamic_select: true
        });
        return;
      }

      const names = rule.taggfalt === 'namn' && rule.taggar.length
        ? rule.taggar.slice()
        : resolveGroupNamesFromRule(rule, options);
      const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
      const oneType = types.length === 1 ? types[0] : '';
      const tagRule = {
        ...rule,
        typer: types,
        xp_kallor: types
      };

      groups.push({
        source,
        type: oneType,
        types,
        names: uniqStrings(names),
        min_antal: Math.max(0, Number(rule.min_antal) || 0),
        min_niva: 'Novis',
        min_erf: Math.max(0, Number(rule.min_erf) || 0),
        allRitual: oneType === 'Ritual',
        dynamic_select: true,
        allow_repeat: allowRepeat,
        tagRule
      });
    });

    groups.push(...buildNameGroups(
      'specifika_formagor',
      'Förmåga',
      krav.specifika_formagor,
      options
    ));

    groups.push(...buildNameGroups(
      'specifika_mystiska_krafter',
      'Mystisk kraft',
      krav.specifika_mystiska_krafter,
      options
    ));

    groups.push(...buildNameGroups(
      'specifika_ritualer',
      'Ritual',
      krav.specifika_ritualer,
      options
    ));

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
    const types = normalizeTypeList(rule.typer?.length ? rule.typer : rule.typ);
    if (!types.length) return false;
    if (!types.some(type => entryHasType(entry, type))) return false;
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
    isRepeatableBenefitEntry,
    requirementErf
  });
})(window);
