(function(window){
  const LEGACY_RULE_KEYS = Object.freeze(['andrar', 'kraver', 'krockar', 'ger', 'val']);
  const RULE_KEY_ALIASES = Object.freeze({
    modify: 'andrar',
    andrar: 'andrar',
    require: 'kraver',
    kraver: 'kraver',
    conflict: 'krockar',
    krockar: 'krockar',
    grant: 'ger',
    ger: 'ger',
    choice: 'val',
    val: 'val'
  });
  const LEGACY_TO_ENGLISH_RULE_KEYS = Object.freeze({
    andrar: 'modify',
    kraver: 'require',
    krockar: 'conflict',
    ger: 'grant',
    val: 'choice'
  });
  const LEVEL_ALIASES = Object.freeze({
    novis: 'Novis',
    enkel: 'Enkel',
    gesall: 'Gesäll',
    ordinar: 'Ordinär',
    mastare: 'Mästare',
    avancerad: 'Avancerad'
  });
  const ENGLISH_TO_LEGACY_TARGET = Object.freeze({
    'price.factor': 'pris_faktor',
    'price.additive': 'pris_faktor',
    'quality.freeable': 'kvalitet_gratisbar',
    'defense.modifier': 'forsvar_modifierare',
    'defense.trait': 'forsvar_karaktarsdrag',
    'defense.separate_trait': 'separat_forsvar_karaktarsdrag',
    'attack.trait': 'anfall_karaktarsdrag',
    'attack.modifier': 'traffsaker_modifierare',
    'limits.modifier': 'begransning_modifierare',
    'limits.reset_modifier': 'nollstall_begransning_modifierare',
    'traits.max_bonus': 'karaktarsdrag_max_tillagg',
    'mystic.trait': 'mystik_karaktarsdrag',
    'pain.threshold_bonus': 'smartgrans_tillagg',
    'pain.threshold': 'smartgrans_tillagg',
    'toughness.base': 'talighet_bas',
    'toughness.bonus': 'talighet_tillagg',
    'capacity.factor': 'barkapacitet_faktor',
    'corruption.permanent': 'permanent_korruption',
    'corruption.permanent_factor': 'permanent_korruption_faktor',
    'corruption.guard': 'skydd_permanent_korruption',
    'corruption.threshold': 'korruptionstroskel',
    'monstrosity.threshold': 'styggelsetroskel',
    hidden: 'Hidden',
    entry: 'post',
    item: 'foremal',
    money: 'pengar'
  });
  const LEGACY_TO_ENGLISH_TARGET = Object.freeze(Object.entries(ENGLISH_TO_LEGACY_TARGET).reduce((acc, [english, legacy]) => {
    if (!acc[legacy]) acc[legacy] = english;
    return acc;
  }, Object.create(null)));
  const ENGLISH_OP_MAP = Object.freeze({
    add: 'add',
    plus: 'add',
    addera: 'add',
    subtract: 'subtract',
    sub: 'subtract',
    minus: 'subtract',
    subtrahera: 'subtract',
    multiply: 'multiply',
    mul: 'multiply',
    multiplicera: 'multiply',
    factor: 'multiply',
    faktor: 'multiply',
    divide: 'divide',
    div: 'divide',
    dividera: 'divide',
    set: 'set',
    satt: 'set',
    ersatt: 'set',
    replace: 'set',
    min: 'min',
    minimum: 'max',
    max: 'max',
    maximum: 'min'
  });
  const LEGACY_OP_MAP = Object.freeze({
    add: '',
    subtract: 'subtrahera',
    multiply: 'multiplicera',
    divide: 'dividera',
    set: 'ersatt',
    min: 'maximum',
    max: 'minimum'
  });
  const TOP_LEVEL_KEY_ALIASES = Object.freeze({
    name: 'namn',
    description: 'beskrivning',
    tags: 'taggar',
    key_traits: 'viktiga_karaktarsdrag',
    elite_abilities: 'Elityrkesförmågor',
    possible_benefits: 'mojliga_fordelar',
    possible_drawbacks: 'tankbara_nackdelar',
    requirement_abilities: 'krav_formagor',
    stats: 'stat',
    base_price: 'grundpris',
    max_price: 'maxpris',
    qualities: 'kvalitet',
    corruption: 'korruption',
    suggested_abilities: 'lampliga_formagor',
    suggested_races: 'forslag_pa_slakte',
    female_names: 'namn_kvinna',
    male_names: 'namn_man',
    trait_summary: ['sardrag', 'särdrag'],
    negative: 'negativ',
    effect: 'effekt',
    elite_requirements: 'krav'
  });
  const TAG_KEY_ALIASES = Object.freeze({
    types: 'typ',
    traditions: 'ark_trad',
    tests: 'test',
    qualities: 'kvalitet',
    max_count: 'max_antal',
    hidden: 'dold',
    race: 'ras',
    artifact_binding: 'artefakt_bindning',
    xp: 'erf',
    actions: 'handling'
  });
  const LEVEL_KEY_ALIASES = Object.freeze({
    description: 'beskrivning',
    actions: 'handling',
    tests: 'test',
    damage_type: 'skadetyp',
    xp: 'erf',
    rules: 'regler'
  });
  const ELITE_FIELD_ALIASES = Object.freeze({
    namn: 'name',
    typ: 'types',
    ark_trad: 'traditions',
    test: 'tests',
    kvalitet: 'qualities',
    ras: 'race'
  });

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!isObject(value)) return value;
    const out = {};
    Object.keys(value).forEach(key => {
      out[key] = cloneValue(value[key]);
    });
    return out;
  }

  function toArray(value) {
    return Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
  }

  function normalizeToken(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function canonicalLevelLabel(value) {
    const token = normalizeToken(value);
    return LEVEL_ALIASES[token] || String(value || '').trim();
  }

  function normalizeEliteFieldName(value) {
    const raw = String(value || '').trim();
    return ELITE_FIELD_ALIASES[raw] || raw;
  }

  function copyIfMissing(target, key, value) {
    if (value === undefined) return;
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = cloneValue(value);
    }
  }

  function readAlias(source, englishKey, legacyKey) {
    if (!source || typeof source !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(source, englishKey)) return source[englishKey];
    const legacyKeys = Array.isArray(legacyKey) ? legacyKey : [legacyKey];
    for (const key of legacyKeys) {
      if (!key) continue;
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    }
    return undefined;
  }

  function assignAliasValue(target, englishKey, legacyKey, value) {
    target[englishKey] = cloneValue(value);
    const legacyKeys = Array.isArray(legacyKey) ? legacyKey : [legacyKey];
    legacyKeys.forEach(key => {
      if (!key) return;
      target[key] = cloneValue(value);
    });
  }

  function normalizeRequirementLogic(value, fallback = 'and') {
    const token = normalizeToken(value);
    if (token === 'or' || token === 'eller' || token === 'any') return 'or';
    if (token === 'and' || token === 'och' || token === 'all') return 'and';
    const fallbackToken = normalizeToken(fallback);
    return fallbackToken === 'or' || fallbackToken === 'eller' || fallbackToken === 'any'
      ? 'or'
      : 'and';
  }

  function normalizeRuleFamilyKey(key) {
    return RULE_KEY_ALIASES[String(key || '').trim()] || '';
  }

  function englishRuleFamilyKey(key) {
    const legacy = normalizeRuleFamilyKey(key);
    return LEGACY_TO_ENGLISH_RULE_KEYS[legacy] || '';
  }

  function normalizeRuleTargetToLegacy(value) {
    const raw = String(value || '').trim();
    return ENGLISH_TO_LEGACY_TARGET[raw] || raw;
  }

  function normalizeRuleTargetToEnglish(value) {
    const raw = String(value || '').trim();
    return LEGACY_TO_ENGLISH_TARGET[raw] || raw;
  }

  function normalizeRuleOp(value) {
    const token = normalizeToken(value);
    return ENGLISH_OP_MAP[token] || String(value || '').trim().toLowerCase();
  }

  function normalizeLegacyRuleSetter(value) {
    const op = normalizeRuleOp(value);
    return LEGACY_OP_MAP[op] || String(value || '').trim();
  }

  function generateRuleIdFromContext(context = {}) {
    const parts = [
      context.scope || 'entry',
      context.owner || 'unknown',
      context.level || 'top',
      context.family || 'rule',
      String(context.index ?? 0)
    ];
    return parts
      .map(part => String(part || '').trim())
      .filter(Boolean)
      .join('__')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_:-]+/g, '_');
  }

  function mergeLegacyNarValues(target, source) {
    const out = isObject(target) ? target : {};
    Object.keys(source || {}).forEach(key => {
      const next = source[key];
      if (next === undefined) return;
      if (!Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = cloneValue(next);
        return;
      }
      if (Array.isArray(out[key]) || Array.isArray(next)) {
        out[key] = toArray(out[key]).concat(toArray(next));
        return;
      }
      if (isObject(out[key]) && isObject(next)) {
        out[key] = mergeLegacyNarValues(out[key], next);
        return;
      }
      out[key] = cloneValue(next);
    });
    return out;
  }

  function wrapWhenParts(parts) {
    const filtered = parts.filter(Boolean);
    if (!filtered.length) return null;
    if (filtered.length === 1) return filtered[0];
    return { all: filtered };
  }

  function fieldNode(field, op, value) {
    const out = {
      field: String(field || '').trim(),
      op: String(op || '').trim()
    };
    if (value !== undefined) out.value = cloneValue(value);
    return out;
  }

  function convertLegacyNarToWhen(rawNar) {
    if (!isObject(rawNar)) return null;
    const nar = cloneValue(rawNar);
    const parts = [];

    const addAllNames = (field, op, values) => {
      const list = toArray(values).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push(fieldNode(field, op, list));
    };
    const addObjectComparisons = (prefix, op, source) => {
      if (!isObject(source)) return;
      Object.keys(source).forEach(key => {
        parts.push(fieldNode(`${prefix}.${String(key || '').trim()}`, op, source[key]));
      });
    };

    addAllNames('selected.names', 'includes_all', nar.har_namn);
    addAllNames('selected.names', 'includes_any', nar.nagon_av_namn || nar['någon_av_namn']);
    addAllNames('selected.names', 'includes_any', nar.namn);
    if (nar.saknar_namn !== undefined) {
      const list = toArray(nar.saknar_namn).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('selected.names', 'includes_any', list) });
    }

    addObjectComparisons('state.counts.by_name', 'lte', isObject(nar.antal_namn_max) ? nar.antal_namn_max : null);
    addObjectComparisons('state.counts.by_type', 'lte', isObject(nar.antal_typ_max) ? nar.antal_typ_max : null);
    addAllNames('entry.tags.types', 'includes_any', nar.typ);
    addAllNames('entry.name', 'includes_any', nar.namn);
    addAllNames('entry.tags.traditions', 'includes_any', nar.ark_trad);

    addObjectComparisons('state.values', 'gte', nar.mal_minst);
    toArray(nar.mal_saknas).forEach(name => {
      const key = String(name || '').trim();
      if (key) parts.push({ not: fieldNode(`state.values.${key}`, 'exists', true) });
    });
    toArray(nar.har_mal).forEach(name => {
      const key = String(name || '').trim();
      if (key) parts.push(fieldNode(`state.values.${key}`, 'exists', true));
    });

    addObjectComparisons('state.attributes', 'gte', nar.attribut_minst);
    addObjectComparisons('state.attributes', 'lte', nar.attribut_hogst);

    addAllNames('state.equipped.names', 'includes_any', nar.har_utrustat_namn);
    if (nar.ej_utrustat_namn !== undefined) {
      const list = toArray(nar.ej_utrustat_namn).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('state.equipped.names', 'includes_any', list) });
    }
    addAllNames('state.equipped.types', 'includes_any', nar.har_utrustad_typ);
    if (nar.ej_utrustad_typ !== undefined) {
      const list = toArray(nar.ej_utrustad_typ).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('state.equipped.types', 'includes_any', list) });
    }
    addAllNames('state.equipped.qualities', 'includes_any', nar.har_utrustad_kvalitet);
    if (nar.ej_utrustad_kvalitet !== undefined) {
      const list = toArray(nar.ej_utrustad_kvalitet).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('state.equipped.qualities', 'includes_any', list) });
    }

    if (nar.antal_utrustade_vapen_minst !== undefined) {
      parts.push(fieldNode('state.equipped.weapons.count', 'gte', nar.antal_utrustade_vapen_minst));
    }
    addAllNames('state.equipped.weapons.types', 'includes_any', nar.har_utrustad_vapen_typ);
    if (nar.ej_utrustad_vapen_typ !== undefined) {
      const list = toArray(nar.ej_utrustad_vapen_typ).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('state.equipped.weapons.types', 'includes_any', list) });
    }
    addAllNames('state.equipped.weapons.qualities', 'includes_any', nar.har_utrustad_vapen_kvalitet);
    if (nar.ej_utrustad_vapen_kvalitet !== undefined) {
      const list = toArray(nar.ej_utrustad_vapen_kvalitet).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('state.equipped.weapons.qualities', 'includes_any', list) });
    }

    if (isObject(nar.foremal)) {
      addAllNames('item.types', 'includes_any', nar.foremal.typ);
      if (nar.foremal.ingen_typ !== undefined) {
        const list = toArray(nar.foremal.ingen_typ).map(item => String(item || '').trim()).filter(Boolean);
        if (list.length) parts.push({ not: fieldNode('item.types', 'includes_any', list) });
      }
      addAllNames('item.qualities', 'includes_any', nar.foremal.nagon_kvalitet);
      addAllNames('item.id', 'includes_any', nar.foremal.id);
      addAllNames('item.name', 'includes_any', nar.foremal.namn);
      addAllNames('item.level', 'includes_any', nar.foremal.niva ?? nar.foremal.nivå);
      if (nar.foremal.antal_positiv_kvalitet_max !== undefined) {
        parts.push(fieldNode('item.positive_quality_count', 'lte', nar.foremal.antal_positiv_kvalitet_max));
      }
      if (nar.foremal.antal_mystisk_kvalitet_max !== undefined) {
        parts.push(fieldNode('item.mystic_quality_count', 'lte', nar.foremal.antal_mystisk_kvalitet_max));
      }
    }
    addAllNames('item.types', 'includes_any', nar['foremal.typ']);
    if (nar['foremal.ingen_typ'] !== undefined) {
      const list = toArray(nar['foremal.ingen_typ']).map(item => String(item || '').trim()).filter(Boolean);
      if (list.length) parts.push({ not: fieldNode('item.types', 'includes_any', list) });
    }
    addAllNames('item.qualities', 'includes_any', nar['foremal.nagon_kvalitet']);
    addAllNames('item.id', 'includes_any', nar['foremal.id']);
    addAllNames('item.name', 'includes_any', nar['foremal.namn']);
    addAllNames('item.level', 'includes_any', nar['foremal.niva'] ?? nar['foremal.nivå']);
    if (nar['foremal.antal_positiv_kvalitet_max'] !== undefined) {
      parts.push(fieldNode('item.positive_quality_count', 'lte', nar['foremal.antal_positiv_kvalitet_max']));
    }
    if (nar['foremal.antal_mystisk_kvalitet_max'] !== undefined) {
      parts.push(fieldNode('item.mystic_quality_count', 'lte', nar['foremal.antal_mystisk_kvalitet_max']));
    }

    if (nar.narstrid !== undefined) parts.push(fieldNode('combat.is_melee', 'equals', Boolean(nar.narstrid)));
    if (nar.avstand !== undefined) parts.push(fieldNode('combat.is_ranged', 'equals', Boolean(nar.avstand)));
    if (nar.overtag !== undefined) parts.push(fieldNode('combat.has_advantage', 'equals', Boolean(nar.overtag)));
    if (nar.efter_forflyttning !== undefined) parts.push(fieldNode('combat.after_move', 'equals', Boolean(nar.efter_forflyttning)));
    if (nar.kalla_niva_minst !== undefined) parts.push(fieldNode('source.level', 'gte', canonicalLevelLabel(nar.kalla_niva_minst)));
    if (nar.trait !== undefined) parts.push(fieldNode('row.trait', 'includes_any', toArray(nar.trait)));

    const addNameLevelRules = (rawValue) => {
      if (!rawValue || typeof rawValue !== 'object') return;
      Object.keys(rawValue).forEach(name => {
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return;
        parts.push(fieldNode(`selected.levels.by_name.${trimmedName}`, 'gte', canonicalLevelLabel(rawValue[name])));
      });
    };
    addNameLevelRules(nar.har_namn_niva_minst);
    addNameLevelRules(nar['har_namn_nivå_minst']);
    addNameLevelRules(nar.har_namn_level_min);

    const onlySelected = nar.endast_valda ?? nar.endastValda ?? nar.only_selected ?? nar.onlySelected ?? nar.selected_only ?? nar.selectedOnly;
    if (onlySelected !== undefined) {
      parts.push(fieldNode('source.is_selected', 'equals', Boolean(onlySelected)));
    }

    if (Array.isArray(nar.eller) && nar.eller.length) {
      parts.push({
        any: nar.eller
          .map(convertLegacyNarToWhen)
          .filter(Boolean)
      });
    }
    if (isObject(nar.inte)) {
      parts.push({ not: convertLegacyNarToWhen(nar.inte) });
    }

    return wrapWhenParts(parts);
  }

  function leafWhenToLegacyNar(node) {
    const field = String(node?.field || '').trim();
    const op = String(node?.op || '').trim();
    const value = cloneValue(node?.value);
    if (!field || !op) return null;

    if (field === 'selected.names' && op === 'includes_all') return { har_namn: value };
    if (field === 'selected.names' && op === 'includes_any') return { nagon_av_namn: value };
    if (field.startsWith('state.counts.by_name.') && op === 'lte') {
      return { antal_namn_max: { [field.split('.').slice(3).join('.')]: value } };
    }
    if (field.startsWith('state.counts.by_type.') && op === 'lte') {
      return { antal_typ_max: { [field.split('.').slice(3).join('.')]: value } };
    }
    if (field === 'entry.tags.types' && op === 'includes_any') return { typ: value };
    if (field === 'source.tags.types' && op === 'includes_any') return { typ: value };
    if (field === 'entry.name' && op === 'includes_any') return { namn: value };
    if (field === 'source.name' && op === 'includes_any') return { namn: value };
    if (field === 'entry.tags.traditions' && op === 'includes_any') return { ark_trad: value };
    if (field === 'source.tags.traditions' && op === 'includes_any') return { ark_trad: value };
    if (field.startsWith('state.values.') && op === 'gte') {
      return { mal_minst: { [field.split('.').slice(2).join('.')]: value } };
    }
    if (field.startsWith('state.values.') && op === 'exists') {
      return { har_mal: [field.split('.').slice(2).join('.')] };
    }
    if (field.startsWith('state.attributes.') && op === 'gte') {
      return { attribut_minst: { [field.split('.').slice(2).join('.')]: value } };
    }
    if (field.startsWith('state.attributes.') && op === 'lte') {
      return { attribut_hogst: { [field.split('.').slice(2).join('.')]: value } };
    }
    if (field === 'state.equipped.names' && op === 'includes_any') return { har_utrustat_namn: value };
    if (field === 'state.equipped.types' && op === 'includes_any') return { har_utrustad_typ: value };
    if (field === 'state.equipped.qualities' && op === 'includes_any') return { har_utrustad_kvalitet: value };
    if (field === 'state.equipped.weapons.count' && op === 'gte') return { antal_utrustade_vapen_minst: value };
    if (field === 'state.equipped.weapons.types' && op === 'includes_any') return { har_utrustad_vapen_typ: value };
    if (field === 'state.equipped.weapons.qualities' && op === 'includes_any') return { har_utrustad_vapen_kvalitet: value };
    if (field === 'item.types' && op === 'includes_any') return { foremal: { typ: value } };
    if (field === 'item.qualities' && op === 'includes_any') return { foremal: { nagon_kvalitet: value } };
    if (field === 'item.id' && op === 'includes_any') return { foremal: { id: value } };
    if (field === 'item.name' && op === 'includes_any') return { foremal: { namn: value } };
    if (field === 'item.level' && op === 'includes_any') return { foremal: { niva: value } };
    if (field === 'item.positive_quality_count' && op === 'lte') return { foremal: { antal_positiv_kvalitet_max: value } };
    if (field === 'item.mystic_quality_count' && op === 'lte') return { foremal: { antal_mystisk_kvalitet_max: value } };
    if (field.startsWith('selected.levels.by_name.') && op === 'gte') {
      return { har_namn_niva_minst: { [field.split('.').slice(3).join('.')]: value } };
    }
    if (field === 'combat.is_melee' && op === 'equals') return { narstrid: Boolean(value) };
    if (field === 'combat.is_ranged' && op === 'equals') return { avstand: Boolean(value) };
    if (field === 'combat.has_advantage' && op === 'equals') return { overtag: Boolean(value) };
    if (field === 'combat.after_move' && op === 'equals') return { efter_forflyttning: Boolean(value) };
    if (field === 'source.level' && op === 'gte') return { kalla_niva_minst: value };
    if (field === 'row.trait' && op === 'includes_any') return { trait: value };
    if (field === 'source.is_selected' && op === 'equals') return { endast_valda: Boolean(value) };
    return null;
  }

  function convertWhenToLegacyNar(node) {
    if (!node) return null;
    if (Array.isArray(node)) {
      const converted = node.map(convertWhenToLegacyNar).filter(Boolean);
      return converted.length ? { eller: converted } : null;
    }
    if (!isObject(node)) return null;
    if (node.field) return leafWhenToLegacyNar(node);
    if (Array.isArray(node.all)) {
      return node.all
        .map(convertWhenToLegacyNar)
        .filter(Boolean)
        .reduce((acc, part) => mergeLegacyNarValues(acc, part), {});
    }
    if (Array.isArray(node.any)) {
      const converted = node.any.map(convertWhenToLegacyNar).filter(Boolean);
      return converted.length ? { eller: converted } : null;
    }
    if (isObject(node.not)) {
      if (node.not.field && String(node.not.op || '').trim() === 'includes_any') {
        const field = String(node.not.field || '').trim();
        const value = cloneValue(node.not.value);
        if (field === 'selected.names') return { saknar_namn: value };
        if (field === 'state.equipped.names') return { ej_utrustat_namn: value };
        if (field === 'state.equipped.types') return { ej_utrustad_typ: value };
        if (field === 'state.equipped.qualities') return { ej_utrustad_kvalitet: value };
        if (field === 'state.equipped.weapons.types') return { ej_utrustad_vapen_typ: value };
        if (field === 'state.equipped.weapons.qualities') return { ej_utrustad_vapen_kvalitet: value };
        if (field === 'item.types') return { foremal: { ingen_typ: value } };
      }
      const nested = convertWhenToLegacyNar(node.not);
      return nested ? { inte: nested } : null;
    }
    return null;
  }

  function normalizeWhenNode(rawWhen) {
    if (!rawWhen) return null;
    if (Array.isArray(rawWhen)) {
      const values = rawWhen.map(normalizeWhenNode).filter(Boolean);
      if (!values.length) return null;
      if (values.length === 1) return values[0];
      return { all: values };
    }
    if (!isObject(rawWhen)) return null;
    if (rawWhen.field || rawWhen.op) {
      const field = String(rawWhen.field || '').trim();
      const op = String(rawWhen.op || '').trim();
      if (!field || !op) return null;
      const out = { field, op };
      if (Object.prototype.hasOwnProperty.call(rawWhen, 'value')) out.value = cloneValue(rawWhen.value);
      return out;
    }
    if (Array.isArray(rawWhen.all)) {
      const values = [];
      const seen = new Set();
      rawWhen.all.map(normalizeWhenNode).filter(Boolean).forEach(value => {
        if (isObject(value) && Array.isArray(value.all)) {
          value.all.forEach(item => {
            const key = JSON.stringify(item);
            if (seen.has(key)) return;
            seen.add(key);
            values.push(item);
          });
          return;
        }
        const key = JSON.stringify(value);
        if (seen.has(key)) return;
        seen.add(key);
        values.push(value);
      });
      if (!values.length) return null;
      if (values.length === 1) return values[0];
      return { all: values };
    }
    if (Array.isArray(rawWhen.any)) {
      const values = [];
      const seen = new Set();
      rawWhen.any.map(normalizeWhenNode).filter(Boolean).forEach(value => {
        if (isObject(value) && Array.isArray(value.any)) {
          value.any.forEach(item => {
            const key = JSON.stringify(item);
            if (seen.has(key)) return;
            seen.add(key);
            values.push(item);
          });
          return;
        }
        const key = JSON.stringify(value);
        if (seen.has(key)) return;
        seen.add(key);
        values.push(value);
      });
      if (!values.length) return null;
      if (values.length === 1) return values[0];
      return { any: values };
    }
    if (isObject(rawWhen.not)) {
      const nested = normalizeWhenNode(rawWhen.not);
      return nested ? { not: nested } : null;
    }
    return null;
  }

  function collectLegacyNameLevelPairs(rawValue, addPair) {
    if (rawValue === undefined || rawValue === null || typeof addPair !== 'function') return;
    if (Array.isArray(rawValue)) {
      rawValue.forEach(item => collectLegacyNameLevelPairs(item, addPair));
      return;
    }
    if (!isObject(rawValue)) return;

    const hasNamedFields = (
      Object.prototype.hasOwnProperty.call(rawValue, 'namn')
      || Object.prototype.hasOwnProperty.call(rawValue, 'name')
      || Object.prototype.hasOwnProperty.call(rawValue, 'entry')
      || Object.prototype.hasOwnProperty.call(rawValue, 'post')
    );
    if (hasNamedFields) {
      const name = rawValue.namn ?? rawValue.name ?? rawValue.entry ?? rawValue.post;
      const minLevel = rawValue['nivå_minst']
        ?? rawValue.niva_minst
        ?? rawValue.level_min
        ?? rawValue.levelMin
        ?? rawValue.level
        ?? rawValue.nivå
        ?? rawValue.niva;
      addPair(name, minLevel);
      return;
    }

    Object.keys(rawValue).forEach(name => {
      addPair(name, rawValue[name]);
    });
  }

  function buildLegacyRequirementWhen(rawRule) {
    if (!isObject(rawRule)) return null;
    const explicitWhen = normalizeWhenNode(rawRule.when);
    if (explicitWhen) return explicitWhen;

    const parts = [];

    const directWhen = normalizeWhenNode(convertLegacyNarToWhen(rawRule.nar));
    if (directWhen) parts.push(directWhen);

    const requiredNames = toArray(readAlias(rawRule, 'name', 'namn'))
      .map(value => String(value || '').trim())
      .filter(Boolean);
    if (requiredNames.length) {
      parts.push(fieldNode('selected.names', 'includes_all', requiredNames));
    }

    const globalMinLevel = readAlias(rawRule, 'min_level', ['nivå_minst', 'niva_minst', 'level_min', 'levelMin']);
    if (globalMinLevel !== undefined && requiredNames.length) {
      requiredNames.forEach(name => {
        parts.push(fieldNode(`selected.levels.by_name.${name}`, 'gte', canonicalLevelLabel(globalMinLevel)));
      });
    }

    const addNameLevelRule = (rawName, rawLevel) => {
      const name = String(rawName || '').trim();
      if (!name) return;
      parts.push(fieldNode(`selected.levels.by_name.${name}`, 'gte', canonicalLevelLabel(rawLevel)));
    };
    collectLegacyNameLevelPairs(rawRule.namn_niva_minst, addNameLevelRule);
    collectLegacyNameLevelPairs(rawRule['namn_nivå_minst'], addNameLevelRule);
    collectLegacyNameLevelPairs(rawRule.name_level_min, addNameLevelRule);

    if (Array.isArray(rawRule.grupp) && rawRule.grupp.length) {
      const groupNodes = rawRule.grupp
        .map(item => buildLegacyRequirementWhen(item))
        .filter(Boolean);
      if (groupNodes.length) {
        parts.push(normalizeRequirementLogic(rawRule.grupp_logik, 'and') === 'or'
          ? { any: groupNodes }
          : { all: groupNodes });
      }
    }

    return wrapWhenParts(parts);
  }

  function normalizeArtifactBindingOption(rawOption, context = {}) {
    if (!isObject(rawOption)) return cloneValue(rawOption);
    const option = cloneValue(rawOption);
    const rules = normalizeRuleBlock(readAlias(option, 'rules', 'regler'), context);
    if (Object.keys(rules).length) {
      option.rules = rules;
      option.regler = rules;
    }
    return option;
  }

  function normalizeArtifactBindingConfig(rawBinding, context = {}) {
    if (Array.isArray(rawBinding)) {
      return {
        options: rawBinding.map((option, index) => normalizeArtifactBindingOption(option, {
          ...context,
          scope: 'artifact_binding',
          owner: `${String(context?.owner || 'entry')}__binding_${index}`
        }))
      };
    }
    if (!isObject(rawBinding)) return cloneValue(rawBinding);
    const binding = cloneValue(rawBinding);
    if (Array.isArray(binding.options)) {
      binding.options = binding.options.map((option, index) => normalizeArtifactBindingOption(option, {
        ...context,
        scope: 'artifact_binding',
        owner: `${String(context?.owner || 'entry')}__binding_${index}`
      }));
    }
    return binding;
  }

  function normalizeRule(rawRule, familyKey, context = {}) {
    if (!isObject(rawRule)) return null;
    const rule = cloneValue(rawRule);
    const legacyFamily = normalizeRuleFamilyKey(familyKey);
    if (!legacyFamily) return null;
    const englishFamily = englishRuleFamilyKey(legacyFamily);

    const ruleId = String(readAlias(rule, 'rule_id', 'regel_id') || rule.id || '').trim();
    const target = readAlias(rule, 'target', 'mal');
    const message = readAlias(rule, 'message', 'meddelande');
    const value = readAlias(rule, 'value', 'varde');
    const formula = readAlias(rule, 'formula', 'formel');
    const name = readAlias(rule, 'name', 'namn');
    const minLevel = readAlias(rule, 'min_level', ['nivå_minst', 'niva_minst', 'level_min', 'levelMin']);
    const op = readAlias(rule, 'op', 'satt') ?? readAlias(rule, 'operation', 'operation');
    const when = legacyFamily === 'kraver'
      ? buildLegacyRequirementWhen(rule)
      : normalizeWhenNode(rule.when || convertLegacyNarToWhen(rule.nar));
    const onFail = readAlias(rule, 'on_fail', 'else');
    const onPass = readAlias(rule, 'on_pass', 'vid_uppfyllt');

    if (ruleId) {
      rule.rule_id = ruleId;
      rule.regel_id = ruleId;
    }
    if (!rule.rule_id) {
      const generatedId = generateRuleIdFromContext({
        ...context,
        family: englishFamily || legacyFamily
      });
      rule.rule_id = generatedId;
      rule.regel_id = generatedId;
    }
    if (target !== undefined) {
      rule.target = normalizeRuleTargetToEnglish(target);
      rule.mal = normalizeRuleTargetToLegacy(target);
    }
    if (message !== undefined) {
      rule.message = String(message || '').trim();
      rule.meddelande = String(message || '').trim();
    }
    if (value !== undefined) {
      rule.value = cloneValue(value);
      rule.varde = cloneValue(value);
    }
    if (formula !== undefined) {
      rule.formula = cloneValue(formula);
      rule.formel = cloneValue(formula);
    }
    if (name !== undefined) {
      rule.name = cloneValue(name);
      rule.namn = cloneValue(name);
    }
    if (minLevel !== undefined) {
      const normalizedLevel = canonicalLevelLabel(minLevel);
      rule.min_level = normalizedLevel;
      rule['nivå_minst'] = normalizedLevel;
      rule.niva_minst = normalizedLevel;
    }
    if (op !== undefined) {
      rule.op = normalizeRuleOp(op);
      rule.satt = normalizeLegacyRuleSetter(op);
      if (rule.op === 'subtract' || rule.op === 'divide') {
        rule.operation = rule.op;
      }
    }
    if (when) {
      rule.when = when;
      const nar = convertWhenToLegacyNar(when);
      if (nar) rule.nar = nar;
    }
    if (onFail !== undefined) {
      rule.on_fail = cloneValue(onFail);
      rule.else = cloneValue(onFail);
    }
    if (onPass !== undefined) {
      rule.on_pass = cloneValue(onPass);
      rule.vid_uppfyllt = cloneValue(onPass);
    }
    if (rule.source && isObject(rule.source)) {
      const source = cloneValue(rule.source);
      const sourceTypes = readAlias(source, 'types', 'typ');
      if (sourceTypes !== undefined) {
        source.types = cloneValue(sourceTypes);
        source.typ = cloneValue(sourceTypes);
      }
      const sourceWhen = normalizeWhenNode(source.when || convertLegacyNarToWhen(source.nar));
      if (sourceWhen) {
        source.when = sourceWhen;
        const nar = convertWhenToLegacyNar(sourceWhen);
        if (nar) source.nar = nar;
      }
      rule.source = source;
    }
    return rule;
  }

  function normalizeRuleBlock(rawBlock, context = {}) {
    if (!isObject(rawBlock)) return {};
    const out = {};
    const ruleKeys = new Set([
      ...LEGACY_RULE_KEYS,
      ...Object.values(LEGACY_TO_ENGLISH_RULE_KEYS)
    ]);
    LEGACY_RULE_KEYS.forEach(legacyKey => {
      const englishKey = LEGACY_TO_ENGLISH_RULE_KEYS[legacyKey];
      const rawList = rawBlock[legacyKey] !== undefined ? rawBlock[legacyKey] : rawBlock[englishKey];
      const list = toArray(rawList)
        .map((rule, index) => normalizeRule(rule, legacyKey, { ...context, family: englishKey, index }))
        .filter(Boolean);
      if (!list.length) return;
      out[legacyKey] = list;
      out[englishKey] = list;
    });
    Object.keys(rawBlock).forEach(key => {
      if (ruleKeys.has(key) || Object.prototype.hasOwnProperty.call(out, key)) return;
      out[key] = cloneValue(rawBlock[key]);
    });
    return out;
  }

  function normalizeLevelObject(rawValue, context = {}) {
    const level = {};
    if (typeof rawValue === 'string') {
      level.description = rawValue;
      level.beskrivning = rawValue;
      return level;
    }
    if (!isObject(rawValue)) return level;

    const description = readAlias(rawValue, 'description', 'beskrivning');
    const actions = readAlias(rawValue, 'actions', 'handling');
    const tests = readAlias(rawValue, 'tests', 'test');
    const damageType = readAlias(rawValue, 'damage_type', 'skadetyp');
    const xp = readAlias(rawValue, 'xp', 'erf');
    const rules = normalizeRuleBlock(readAlias(rawValue, 'rules', 'regler'), context);

    if (description !== undefined) {
      level.description = description;
      level.beskrivning = description;
    }
    if (actions !== undefined) {
      level.actions = cloneValue(actions);
      level.handling = cloneValue(actions);
    }
    if (tests !== undefined) {
      level.tests = cloneValue(tests);
      level.test = cloneValue(tests);
    }
    if (damageType !== undefined) {
      level.damage_type = cloneValue(damageType);
      level.skadetyp = cloneValue(damageType);
    }
    if (xp !== undefined) {
      level.xp = cloneValue(xp);
      level.erf = cloneValue(xp);
    }
    if (Object.keys(rules).length) {
      level.rules = rules;
      level.regler = rules;
    }

    Object.keys(rawValue).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(level, key)) return;
      level[key] = cloneValue(rawValue[key]);
    });
    return level;
  }

  function normalizeLevels(rawEntry, rawTags, context = {}) {
    const levels = {};
    const ensureLevel = (rawKey) => {
      const key = canonicalLevelLabel(rawKey);
      if (!key) return null;
      if (!levels[key]) levels[key] = {};
      return levels[key];
    };

    const canonicalLevels = readAlias(rawEntry, 'levels', 'nivåer') ?? rawEntry.nivaer;
    if (isObject(canonicalLevels)) {
      Object.keys(canonicalLevels).forEach(levelKey => {
        const bucket = ensureLevel(levelKey);
        if (!bucket) return;
        Object.assign(bucket, normalizeLevelObject(canonicalLevels[levelKey], {
          ...context,
          level: canonicalLevelLabel(levelKey)
        }));
      });
    }

    const descriptions = rawEntry.nivåer || rawEntry.nivaer;
    if (isObject(descriptions)) {
      Object.keys(descriptions).forEach(levelKey => {
        const bucket = ensureLevel(levelKey);
        if (!bucket) return;
        if (bucket.description === undefined) {
          bucket.description = descriptions[levelKey];
          bucket.beskrivning = descriptions[levelKey];
        }
      });
    }

    const levelMeta = rawTags?.nivå_data || rawTags?.niva_data;
    if (isObject(levelMeta)) {
      Object.keys(levelMeta).forEach(levelKey => {
        const bucket = ensureLevel(levelKey);
        if (!bucket) return;
        Object.assign(bucket, normalizeLevelObject(levelMeta[levelKey], {
          ...context,
          level: canonicalLevelLabel(levelKey)
        }));
      });
    }

    const legacyHandling = rawTags?.handling;
    if (isObject(legacyHandling)) {
      Object.keys(legacyHandling).forEach(levelKey => {
        const bucket = ensureLevel(levelKey);
        if (!bucket) return;
        if (bucket.actions === undefined) {
          bucket.actions = cloneValue(legacyHandling[levelKey]);
          bucket.handling = cloneValue(legacyHandling[levelKey]);
        }
      });
    }

    const legacyDescriptions = {};
    const legacyLevelMeta = {};
    const legacyActions = {};
    Object.keys(levels).forEach(levelKey => {
      const bucket = levels[levelKey];
      if (bucket.description !== undefined) {
        legacyDescriptions[levelKey] = bucket.description;
      }
      const meta = {};
      if (bucket.actions !== undefined) {
        meta.handling = cloneValue(bucket.actions);
        legacyActions[levelKey] = cloneValue(bucket.actions);
      }
      if (bucket.tests !== undefined) meta.test = cloneValue(bucket.tests);
      if (bucket.damage_type !== undefined) meta.skadetyp = cloneValue(bucket.damage_type);
      if (bucket.xp !== undefined) meta.erf = cloneValue(bucket.xp);
      if (bucket.rules && Object.keys(bucket.rules).length) meta.regler = cloneValue(bucket.rules);
      if (Object.keys(meta).length) legacyLevelMeta[levelKey] = meta;
    });

    return {
      levels,
      legacyDescriptions,
      legacyLevelMeta,
      legacyActions
    };
  }

  function normalizeTags(rawTags, context = {}) {
    const input = isObject(rawTags) ? cloneValue(rawTags) : {};
    const tags = {};

    Object.keys(TAG_KEY_ALIASES).forEach(englishKey => {
      const legacyKey = TAG_KEY_ALIASES[englishKey];
      const value = readAlias(input, englishKey, legacyKey);
      if (value === undefined) return;
      const normalizedValue = englishKey === 'artifact_binding'
        ? normalizeArtifactBindingConfig(value, context)
        : cloneValue(value);
      assignAliasValue(tags, englishKey, legacyKey, normalizedValue);
    });

    const rules = normalizeRuleBlock(readAlias(input, 'rules', 'regler'), context);
    if (Object.keys(rules).length) {
      tags.rules = rules;
      tags.regler = rules;
    }

    Object.keys(input).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(tags, key)) return;
      tags[key] = cloneValue(input[key]);
    });
    return tags;
  }

  function normalizeEliteRequirements(raw) {
    if (!isObject(raw)) return null;
    if (Array.isArray(raw.stages)) {
      return cloneValue(raw);
    }
    if (!Object.keys(raw).length) return null;

    const stages = [];
    const primary = raw.primarformaga;
    if (isObject(primary)) {
      const names = toArray(primary.namn_lista).length
        ? toArray(primary.namn_lista)
        : toArray(primary.namn);
      stages.push({
        id: 'primary',
        kind: 'primary',
        min_xp: Number(primary.krav_erf) || 0,
        min_count: 1,
        options: names.map(name => ({
          type: '',
          name: String(name || '').trim()
        })).filter(option => option.name)
      });
    }
    toArray(raw.specifikt_val).forEach((rule, idx) => {
      stages.push({
        id: `specific_choice_${idx}`,
        kind: 'specific_choice',
        min_xp: Number(rule?.krav_erf) || 0,
        min_count: Number(rule?.min_antal) || 1,
        options: toArray(rule?.alternativ).map(option => ({
          type: String(option?.typ || '').trim(),
          name: String(option?.namn || '').trim()
        })).filter(option => option.name)
      });
    });
    toArray(raw.valfri_inom_tagg).forEach((rule, idx) => {
      stages.push({
        id: `tag_pool_${idx}`,
        kind: 'tag_pool',
        min_xp: Number(rule?.krav_erf) || 0,
        entry_type: String(rule?.typ || '').trim(),
        field: normalizeEliteFieldName(rule?.taggfalt),
        values: toArray(rule?.taggar).map(value => String(value || '').trim()).filter(Boolean)
      });
    });
    if (isObject(raw.valfritt) && Number(raw.valfritt.krav_erf) > 0) {
      stages.push({
        id: 'optional_pool',
        kind: 'optional_pool',
        min_xp: Number(raw.valfritt.krav_erf) || 0
      });
    }
    if (isObject(raw.specifika_fordelar)) {
      stages.push({
        id: 'specific_benefits',
        kind: 'named_count',
        entry_type: 'Fördel',
        names: toArray(raw.specifika_fordelar.namn).map(value => String(value || '').trim()).filter(Boolean),
        min_count: Number(raw.specifika_fordelar.min_antal) || 0
      });
    }
    if (isObject(raw.specifika_nackdelar)) {
      stages.push({
        id: 'specific_drawbacks',
        kind: 'named_count',
        entry_type: 'Nackdel',
        names: toArray(raw.specifika_nackdelar.namn).map(value => String(value || '').trim()).filter(Boolean),
        min_count: Number(raw.specifika_nackdelar.min_antal) || 0
      });
    }
    return {
      total_xp: Number(raw.total_erf) || 0,
      stages
    };
  }

  function normalizeEntry(rawEntry, options = {}) {
    if (!isObject(rawEntry)) return rawEntry;
    const entry = cloneValue(rawEntry);

    const name = readAlias(entry, 'name', 'namn');
    const description = readAlias(entry, 'description', 'beskrivning');
    const rawTags = {
      ...(isObject(entry.tags) ? cloneValue(entry.tags) : {}),
      ...(isObject(entry.taggar) ? cloneValue(entry.taggar) : {})
    };
    const tags = normalizeTags(rawTags, {
      scope: 'entry',
      owner: String(entry.id || readAlias(entry, 'name', 'namn') || 'entry').trim()
    });
    const levelData = normalizeLevels(entry, rawTags, {
      scope: 'level',
      owner: String(entry.id || readAlias(entry, 'name', 'namn') || 'entry').trim()
    });
    const topRules = normalizeRuleBlock(readAlias(entry, 'rules', 'regler') || readAlias(rawTags, 'rules', 'regler'), {
      scope: 'entry',
      owner: String(entry.id || readAlias(entry, 'name', 'namn') || 'entry').trim()
    });

    if (name !== undefined) {
      entry.name = name;
      entry.namn = name;
    }
    if (description !== undefined) {
      entry.description = description;
      entry.beskrivning = description;
    }
    entry.tags = tags;
    entry.taggar = tags;
    entry.levels = levelData.levels;
    entry.nivåer = levelData.legacyDescriptions;
    entry.nivaer = levelData.legacyDescriptions;

    if (Object.keys(topRules).length) {
      entry.rules = topRules;
      entry.regler = topRules;
      tags.rules = topRules;
      tags.regler = topRules;
    }
    if (Object.keys(levelData.legacyLevelMeta).length) {
      tags.nivå_data = levelData.legacyLevelMeta;
      tags.niva_data = levelData.legacyLevelMeta;
    }
    if (Object.keys(levelData.legacyActions).length) {
      tags.handling = levelData.legacyActions;
      tags.actions = levelData.legacyActions;
    }

    const eliteRequirements = normalizeEliteRequirements(readAlias(entry, 'elite_requirements', 'krav'));
    if (eliteRequirements) {
      entry.elite_requirements = eliteRequirements;
      if (!entry.krav) entry.krav = cloneValue(readAlias(rawEntry, 'krav', 'krav') || rawEntry.krav || {});
    }

    Object.keys(TOP_LEVEL_KEY_ALIASES).forEach(englishKey => {
      const legacyKey = TOP_LEVEL_KEY_ALIASES[englishKey];
      const value = readAlias(entry, englishKey, legacyKey);
      if (value === undefined) return;
      assignAliasValue(entry, englishKey, legacyKey, value);
    });

    const rawStats = readAlias(entry, 'stats', 'stat');
    if (isObject(rawStats)) {
      entry.stats = cloneValue(rawStats);
      entry.stat = cloneValue(rawStats);
      if (entry.stats.weight === undefined && entry.stats.vikt !== undefined) entry.stats.weight = entry.stats.vikt;
      if (entry.stats.vikt === undefined && entry.stats.weight !== undefined) entry.stats.vikt = entry.stats.weight;
      if (entry.stat.weight === undefined && entry.stat.vikt !== undefined) entry.stat.weight = entry.stat.vikt;
      if (entry.stat.vikt === undefined && entry.stat.weight !== undefined) entry.stat.vikt = entry.stat.weight;
    }
    const rawPrice = readAlias(entry, 'base_price', 'grundpris');
    if (isObject(rawPrice)) {
      entry.base_price = cloneValue(rawPrice);
      entry.grundpris = cloneValue(rawPrice);
    }

    if (options.typeRules) {
      attachTypeRules(entry, options.typeRules);
    }
    return entry;
  }

  function normalizeTypeRuleTemplate(rawTemplate, typeName = '') {
    if (!isObject(rawTemplate)) return null;
    const template = isObject(rawTemplate.tags) || isObject(rawTemplate.taggar)
      ? normalizeEntry(rawTemplate)
      : normalizeEntry({
          id: `type_rule_${String(typeName || '').trim() || 'type'}`,
          tags: rawTemplate.tags || rawTemplate.taggar || {},
          rules: rawTemplate.rules || rawTemplate.regler || rawTemplate,
          levels: rawTemplate.levels || rawTemplate.nivå_data || rawTemplate.niva_data || {}
        });
    return template;
  }

  function normalizeTypeRules(typeRules) {
    if (!isObject(typeRules)) return {};
    const out = {};
    Object.keys(typeRules).forEach(typeName => {
      const normalized = normalizeTypeRuleTemplate(typeRules[typeName], typeName);
      if (normalized) out[typeName] = normalized;
    });
    return out;
  }

  function attachTypeRules(entry, typeRules) {
    if (!isObject(entry) || !isObject(typeRules) || !Object.keys(typeRules).length) return entry;
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
    try {
      Object.defineProperty(entry, '__type_rules', {
        value: typeRules,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (_) {
      entry.__type_rules = typeRules;
    }
    return entry;
  }

  function normalizePayload(payload, options = {}) {
    if (Array.isArray(payload)) {
      return {
        schemaVersion: 0,
        entries: payload.map(entry => normalizeEntry(entry)),
        typeRules: {},
        extra: {},
        isObjectFormat: false
      };
    }
    if (!isObject(payload)) {
      throw new Error(`${options.sourceFile || 'data file'} has invalid JSON payload`);
    }
    if (!Array.isArray(payload.entries)) {
      throw new Error(`${options.sourceFile || 'data file'} must contain an entries array`);
    }

    const typeRules = normalizeTypeRules(payload.type_rules || payload.typ_regler || {});
    const entries = payload.entries.map(entry => attachTypeRules(normalizeEntry(entry, { typeRules }), typeRules));
    const extra = {};
    Object.keys(payload).forEach(key => {
      if (key === 'entries' || key === 'type_rules' || key === 'typ_regler') return;
      extra[key] = cloneValue(payload[key]);
    });
    return {
      schemaVersion: Number(payload.schema_version) || 0,
      entries,
      typeRules,
      extra,
      isObjectFormat: true
    };
  }

  window.catalogSchema = Object.freeze({
    LEGACY_RULE_KEYS,
    normalizeRuleFamilyKey,
    englishRuleFamilyKey,
    normalizeRuleTargetToLegacy,
    normalizeRuleTargetToEnglish,
    normalizeRuleOp,
    normalizeLegacyRuleSetter,
    canonicalLevelLabel,
    convertLegacyNarToWhen,
    convertWhenToLegacyNar,
    normalizeWhenNode,
    normalizeRuleBlock,
    normalizeEntry,
    normalizePayload,
    normalizeEliteRequirements,
    attachTypeRules
  });
})(window);
