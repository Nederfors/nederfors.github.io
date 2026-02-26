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
      krav_erf: toInt(raw.krav_erf, 0)
    };
  }

  function normalizeSpecific(raw = {}, type) {
    const hasLevel = normalizeType(type) !== 'Ritual';
    const base = {
      namn: uniqStrings(raw.namn),
      min_antal: toInt(raw.min_antal, 0)
    };
    if (hasLevel) {
      base.min_niva = normalizeLevel(raw.min_niva || 'Novis', 'Novis');
    }
    return base;
  }

  function normalizeValfriRule(raw = {}) {
    const type = normalizeType(raw.typ);
    const rule = {
      typ: type,
      taggfalt: String(raw.taggfalt || '').trim(),
      taggar: uniqStrings(raw.taggar),
      min_antal: toInt(raw.min_antal, 0)
    };
    if (type !== 'Ritual') {
      rule.min_niva = normalizeLevel(raw.min_niva || 'Novis', 'Novis');
    }
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
    const type = normalizeType(rule.typ);
    if (!type) return [];
    const db = getDBList(options);
    const names = db
      .filter(entry => !isEliteSkillEntry(entry))
      .filter(entry => entryHasType(entry, type))
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

  function buildNameGroups(source, type, names, minLevel, minCount, extra = {}) {
    const out = [];
    const normType = normalizeType(type);
    const list = uniqStrings(names);
    const min = toInt(minCount, 0);
    if (!normType || min <= 0 || !list.length) return out;
    const ritual = normType === 'Ritual';
    const level = ritual ? 'Novis' : normalizeLevel(minLevel || 'Novis', 'Novis');
    const base = {
      source,
      type: normType,
      min_niva: level,
      allRitual: ritual,
      ...extra
    };
    if (min === 1) {
      out.push({ ...base, names: list, min_antal: 1 });
      return out;
    }
    if (min >= list.length) {
      list.forEach(name => out.push({ ...base, names: [name], min_antal: 1 }));
      return out;
    }
    out.push({ ...base, names: list, min_antal: min, multi: true });
    return out;
  }

  function getKravGroups(rawKrav, options = {}) {
    const krav = normalizeKrav(rawKrav);
    const groups = [];
    const xpSources = DEFAULT_XP_KALLOR.slice();

    const pushTagXpGroup = (source, rawRule = {}) => {
      const tagRule = normalizeTagRule(rawRule, source === 'sekundartagg');
      const minErf = Math.max(0, Number(tagRule.krav_erf) || 0);
      if (source === 'sekundartagg' && !tagRule.aktiv) return;
      if (!tagRule.taggfalt || !tagRule.taggar.length || minErf <= 0) return;
      const names = resolveGroupNamesFromTagRule(tagRule, options, xpSources);
      const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));
      const minPositiveCost = names
        .map(name => requirementErf(findEntryByName(name, options), 'Novis'))
        .filter(cost => cost > 0)
        .reduce((min, cost) => Math.min(min, cost), Infinity);
      const slotCost = Number.isFinite(minPositiveCost) ? minPositiveCost : 5;
      groups.push({
        source,
        type: '',
        names,
        min_antal: 1,
        min_niva: 'Novis',
        min_erf: minErf,
        slot_count: Math.max(1, Math.ceil(minErf / Math.max(1, slotCost))),
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
      groups.push({
        source: 'primarformaga',
        type,
        names: [primaryName],
        min_antal: 1,
        min_niva: type === 'Ritual' ? 'Novis' : 'Mästare',
        allRitual: type === 'Ritual',
        isPrimary: true
      });
    }

    pushTagXpGroup('primartagg', krav.primartagg);
    pushTagXpGroup('sekundartagg', krav.sekundartagg);

    toArray(krav.valfri_inom_tagg).forEach((rawRule, idx) => {
      const rule = normalizeValfriRule(rawRule);
      if (!rule.typ || rule.min_antal <= 0) return;
      const source = `valfri_inom_tagg[${idx}]`;
      const isAnyByType = !rule.taggfalt && !rule.taggar.length;

      if (isAnyByType && rule.typ === 'Mystisk kraft') {
        groups.push({
          source,
          type: 'Mystisk kraft',
          anyMystic: true,
          min_antal: rule.min_antal,
          min_niva: normalizeLevel(rule.min_niva || 'Novis', 'Novis'),
          dynamic_select: true
        });
        return;
      }

      if (isAnyByType && rule.typ === 'Ritual') {
        groups.push({
          source,
          type: 'Ritual',
          anyRitual: true,
          allRitual: true,
          min_antal: rule.min_antal,
          min_niva: 'Novis',
          dynamic_select: true
        });
        return;
      }

      const names = rule.taggfalt === 'namn' && rule.taggar.length
        ? rule.taggar.slice()
        : resolveGroupNamesFromRule(rule, options);
      const allowRepeat = names.some(name => isRepeatableBenefitEntry(findEntryByName(name, options)));

      groups.push({
        source,
        type: normalizeType(rule.typ),
        names: uniqStrings(names),
        min_antal: Math.max(1, Number(rule.min_antal) || 1),
        min_niva: normalizeType(rule.typ) === 'Ritual'
          ? 'Novis'
          : normalizeLevel(rule.min_niva || 'Novis', 'Novis'),
        allRitual: normalizeType(rule.typ) === 'Ritual',
        dynamic_select: true,
        allow_repeat: allowRepeat,
        tagRule: rule
      });
    });

    groups.push(...buildNameGroups(
      'specifika_formagor',
      'Förmåga',
      krav.specifika_formagor.namn,
      krav.specifika_formagor.min_niva,
      krav.specifika_formagor.min_antal
    ));

    groups.push(...buildNameGroups(
      'specifika_mystiska_krafter',
      'Mystisk kraft',
      krav.specifika_mystiska_krafter.namn,
      krav.specifika_mystiska_krafter.min_niva,
      krav.specifika_mystiska_krafter.min_antal
    ));

    groups.push(...buildNameGroups(
      'specifika_ritualer',
      'Ritual',
      krav.specifika_ritualer.namn,
      'Novis',
      krav.specifika_ritualer.min_antal
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
    if (!rule.typ) return false;
    if (!entryHasType(entry, rule.typ)) return false;
    if (!matchesTagRule(entry, rule)) return false;
    if (rule.typ !== 'Ritual') {
      return levelMeets(entry?.nivå, rule.min_niva || 'Novis');
    }
    return true;
  }

  window.eliteUtils = Object.freeze({
    LEVEL_VALUE,
    splitComma,
    splitOr,
    parseElityrkeRequirements: getKravGroups,
    formatRequirementGroup,
    normalizeType,
    normalizeLevel,
    levelMeets,
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
