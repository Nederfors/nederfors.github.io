ObjC.import('Foundation');
ObjC.import('stdlib');

function unwrap(value) {
  return ObjC.unwrap(value);
}

function joinPath(root, relativePath) {
  return unwrap($(root).stringByAppendingPathComponent($(relativePath)));
}

function readText(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, null);
  if (!text) throw new Error(`Kunde inte läsa ${path}`);
  return unwrap(text);
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert failed');
}

function deepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nactual:   ${actualJson}`);
  }
}

function parsePositiveLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  if (rounded <= 0) return null;
  return rounded;
}

function hasHardStopCode(stopResult, code) {
  const wanted = String(code || '').trim();
  if (!wanted) return false;
  return (Array.isArray(stopResult?.hardStops) ? stopResult.hardStops : [])
    .some(stop => String(stop?.code || '').trim() === wanted);
}

function listDataJsonFiles(rootPath) {
  const dataPath = joinPath(rootPath, 'data');
  const names = ObjC.deepUnwrap($.NSFileManager.defaultManager.contentsOfDirectoryAtPathError($(dataPath), null));
  return (Array.isArray(names) ? names : [])
    .filter(name => typeof name === 'string' && name.endsWith('.json'))
    .filter(name => name !== 'all.json' && name !== 'struktur.json')
    .sort();
}

function resolveTypeRuleMap(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const primary = payload.typ_regler;
  if (primary && typeof primary === 'object' && !Array.isArray(primary)) return primary;
  const legacy = payload.type_rules;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) return legacy;
  return {};
}

function attachTypeRulesToEntries(entries, typeRules) {
  if (!Array.isArray(entries)) return [];
  if (!typeRules || typeof typeRules !== 'object' || Array.isArray(typeRules)) return entries;
  if (!Object.keys(typeRules).length) return entries;

  return entries.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    try {
      Object.defineProperty(entry, '__typ_regler', {
        value: typeRules,
        configurable: true,
        writable: true,
        enumerable: false
      });
    } catch (_) {
      entry.__typ_regler = typeRules;
    }
    return entry;
  });
}

function parseEntryDataPayload(payload, sourceFile = '') {
  if (Array.isArray(payload)) {
    return { entries: payload, typeRules: {} };
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${sourceFile || 'data file'} har ogiltigt JSON-format`);
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error(`${sourceFile || 'data file'} saknar entries-array`);
  }
  return {
    entries: payload.entries,
    typeRules: resolveTypeRuleMap(payload)
  };
}

function readEntryDataFile(rootPath, relativePath) {
  const payload = JSON.parse(readText(joinPath(rootPath, relativePath)));
  const parsed = parseEntryDataPayload(payload, relativePath);
  return attachTypeRulesToEntries(parsed.entries, parsed.typeRules);
}

function readWeaponEntries(rootPath) {
  const files = ['data/narstridsvapen.json', 'data/avstandsvapen.json'];
  const out = [];
  files.forEach(file => {
    try {
      out.push(...readEntryDataFile(rootPath, file));
    } catch (_) {
      // Ignore missing split files and try legacy fallback below.
    }
  });
  if (out.length) return out;
  return readEntryDataFile(rootPath, 'data/vapen.json');
}

function collectLegacyRepeatabilityTrue(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectLegacyRepeatabilityTrue(item, `${path}[${index}]`, out);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(key => {
    const nextPath = path ? `${path}.${key}` : key;
    if (key === 'kan_införskaffas_flera_gånger' && value[key] === true) {
      out.push(nextPath);
    }
    collectLegacyRepeatabilityTrue(value[key], nextPath, out);
  });
}

function createLocalStorage(seed = {}) {
  const state = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? String(state[key]) : null;
    },
    setItem(key, value) {
      state[key] = String(value);
    },
    removeItem(key) {
      delete state[key];
    },
    clear() {
      Object.keys(state).forEach(key => delete state[key]);
    }
  };
}

function createSandbox(storageSeed = {}) {
  const localStorage = createLocalStorage(storageSeed);
  const sandbox = {
    JSON,
    Math,
    Date,
    Set,
    Map,
    WeakMap,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Intl,
    console,
    performance: { now() { return 0; } },
    localStorage,
    ENTRY_SORT_DEFAULT: 'alpha-asc',
    normalizeEntrySortMode(mode) {
      const value = typeof mode === 'string' ? mode : '';
      return ['alpha-asc', 'alpha-desc', 'newest', 'oldest', 'test', 'ark'].includes(value)
        ? value
        : 'alpha-asc';
    },
    lookupEntry() {
      return null;
    },
    moneyToO(money = {}) {
      return (money.daler || money.d || 0) * 100
        + (money.skilling || money.s || 0) * 10
        + (money['örtegar'] || money.o || 0);
    },
    oToMoney(total) {
      let rest = Math.max(0, Math.floor(Number(total) || 0));
      const daler = Math.floor(rest / 100);
      rest %= 100;
      const skilling = Math.floor(rest / 10);
      const ortegar = rest % 10;
      return { daler, skilling, 'örtegar': ortegar, d: daler, s: skilling, o: ortegar };
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadBrowserScript(sandbox, fullPath) {
  const source = readText(fullPath);
  const runner = new Function('window', `with (window) {\n${source}\n}\nreturn window;`);
  runner(sandbox);
  return sandbox;
}

function verifyRuleHelper(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const data = readEntryDataFile(rootPath, 'data/formaga.json');
  const byName = name => data.find(entry => entry && entry.namn === name);
  const fint = byName('Fint');
  const dominera = byName('Dominera');
  const jarnnave = byName('Järnnäve');
  const ledare = byName('Ledare');
  const sjatteSinne = byName('Sjätte sinne');
  const taktiker = byName('Taktiker');
  const knivgora = byName('Knivgöra');
  const pareringsmastare = byName('Pareringsmästare');
  const koreograferadStrid = byName('Koreograferad strid');
  const spjutdans = byName('Spjutdans');
  const provokator = byName('Provokatör');
  [
    ['Fint', fint],
    ['Dominera', dominera],
    ['Järnnäve', jarnnave],
    ['Ledare', ledare],
    ['Sjätte sinne', sjatteSinne],
    ['Taktiker', taktiker],
    ['Knivgöra', knivgora],
    ['Pareringsmästare', pareringsmastare],
    ['Koreograferad strid', koreograferadStrid],
    ['Spjutdans', spjutdans],
    ['Provokatör', provokator]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} i data/formaga.json`);
  });

  const noviceExpected = {
    andrar: [
      {
        mal: 'anfall_karaktarsdrag',
        satt: 'ersatt',
        varde: 'Diskret',
        nar: {
          narstrid: true,
          foremal: {
            typ: ['Vapen'],
            nagon_kvalitet: ['Kort', 'Precist']
          }
        }
      }
    ]
  };

  const gesallExpected = {
    andrar: [
      noviceExpected.andrar[0],
      {
        mal: 'forsvar_karaktarsdrag',
        satt: 'ersatt',
        varde: 'Diskret'
      }
    ]
  };

  const before = JSON.stringify(fint);
  assert(
    typeof sandbox.rulesHelper.getConflictReasonsForCandidate === 'function',
    'rulesHelper ska exponera getConflictReasonsForCandidate'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(fint, { level: 'Novis' }),
    noviceExpected,
    'Fint Novis-regler blev fel'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(fint, { level: 'Gesall' }),
    gesallExpected,
    'Fint Gesäll-regler blev fel'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(fint, { level: 'M\u00e4stare' }),
    gesallExpected,
    'Fint M\u00e4stare-regler ska \u00e4rva Ges\u00e4ll-regeln'
  );
  assert(JSON.stringify(fint) === before, 'rulesHelper muterade Fint-posten');
  assert(sandbox.rulesHelper.hasRules(fint, { level: 'Gesäll' }) === true, 'rulesHelper missade regler på Fint');
  assert(
    sandbox.rulesHelper.hasRules({ namn: 'Gammal post', taggar: { typ: ['Förmåga'] } }, { level: 'Novis' }) === false,
    'Legacy-post utan regler ska vara inert'
  );

  const artifacts = readEntryDataFile(rootPath, 'data/artefakter.json');
  const artifactById = id => artifacts.find(entry => entry && entry.id === id);
  const skymningsvatten = artifactById('ar02');
  const nidvatten = artifactById('ar06');
  assert(skymningsvatten, 'Hittade inte ar02 i data/artefakter.json');
  assert(nidvatten, 'Hittade inte ar06 i data/artefakter.json');

  const skymRule = sandbox.rulesHelper.getEntryChoiceRule(skymningsvatten, { field: 'artifactEffect' });
  const skymOptions = sandbox.rulesHelper.resolveChoiceOptions(skymRule, {
    entry: skymningsvatten,
    sourceEntry: skymningsvatten,
    field: 'artifactEffect'
  });
  deepEqual(
    skymOptions.map(option => option.value),
    ['', 'xp'],
    'Skymningsvatten ska bara tillåta Obunden eller XP-bindning'
  );
  deepEqual(
    skymOptions.map(option => option.label),
    ['Obunden', '−1 Erfarenhetspoäng'],
    'Skymningsvatten ska visa korrekta bindningsetiketter'
  );
  deepEqual(
    sandbox.rulesHelper.getArtifactEffectValueEffects(skymningsvatten, 'xp'),
    { xp: 1 },
    'XP-bindning ska ge +1 XP-kostnad'
  );

  const nidRule = sandbox.rulesHelper.getEntryChoiceRule(nidvatten, { field: 'artifactEffect' });
  const nidOptions = sandbox.rulesHelper.resolveChoiceOptions(nidRule, {
    entry: nidvatten,
    sourceEntry: nidvatten,
    field: 'artifactEffect'
  });
  deepEqual(
    nidOptions.map(option => option.value),
    ['', 'corruption'],
    'Nidvatten ska bara tillåta Obunden eller korruptionsbindning'
  );
  deepEqual(
    sandbox.rulesHelper.getArtifactEffectValueEffects(nidvatten, 'corruption'),
    { corruption: 1 },
    'Korruptionsbindning ska ge +1 permanent korruption'
  );
  assert(
    sandbox.rulesHelper.getArtifactEffectValueLabel(nidvatten, '') === 'Obunden',
    'Tomt artefaktvärde ska visas som Obunden'
  );

  const customArtifact = {
    id: 'custom-artifact-bind-test',
    namn: 'Custom Bind Test',
    taggar: {
      typ: ['Artefakt'],
      artefakt_bindning: {
        options: [
          { value: 'blood', label: '+1 Blodspris', effects: { toughness: -1, xp: 2 } }
        ]
      }
    }
  };
  const customRule = sandbox.rulesHelper.getEntryChoiceRule(customArtifact, { field: 'artifactEffect' });
  const customOptions = sandbox.rulesHelper.resolveChoiceOptions(customRule, {
    entry: customArtifact,
    sourceEntry: customArtifact,
    field: 'artifactEffect'
  });
  deepEqual(
    customOptions.map(option => ({ value: option.value, label: option.label })),
    [
      { value: '', label: 'Obunden' },
      { value: 'blood', label: '+1 Blodspris' }
    ],
    'Custom artefaktbindning ska ha Obunden + customval'
  );
  const customEffects = sandbox.rulesHelper.getArtifactEffectValueEffects(customArtifact, 'blood');
  assert(customEffects.xp === 2, 'Custom bindning ska kunna ge XP-kostnad');
  assert(customEffects.toughness === -1, 'Custom bindning ska kunna ge tålighetskostnad');
  assert(Object.keys(customEffects).length === 2, 'Custom bindning ska inte lägga till extra defaultkostnader');

  const prevDb = Array.isArray(sandbox.DB) ? sandbox.DB.slice() : sandbox.DB;
  sandbox.DB = [
    { id: 'mk-selected', namn: 'Vald kraft', taggar: { typ: ['Mystisk kraft'] } },
    { id: 'mk-other', namn: 'Ovald kraft', taggar: { typ: ['Mystisk kraft'] } },
    { id: 'rit-selected', namn: 'Vald ritual', taggar: { typ: ['Ritual'] } }
  ];
  const selectedList = [
    { id: 'mk-selected', namn: 'Vald kraft' },
    { id: 'rit-selected', namn: 'Vald ritual' }
  ];
  const selectedTagOptions = sandbox.rulesHelper.resolveChoiceOptions(
    {
      field: 'trait',
      source: {
        typ: ['Mystisk kraft', 'Endast valda'],
        sort: 'alpha'
      }
    },
    { list: selectedList }
  );
  deepEqual(
    selectedTagOptions.map(option => option.value),
    ['Vald kraft'],
    'source.typ=Endast valda ska filtrera till entries som finns sparade på karaktären'
  );
  const selectedNarOptions = sandbox.rulesHelper.resolveChoiceOptions(
    {
      field: 'trait',
      source: {
        typ: ['Mystisk kraft'],
        nar: { endast_valda: true },
        sort: 'alpha'
      }
    },
    { list: selectedList }
  );
  deepEqual(
    selectedNarOptions.map(option => option.value),
    ['Vald kraft'],
    'source.nar.endast_valda ska filtrera till entries som finns sparade på karaktären'
  );
  sandbox.DB = prevDb;

  const unsupported = sandbox.rulesHelper.getEntryRules({
    taggar: {
      regler: {
        andrar: { mal: 'test', satt: 'ersatt', varde: 'Diskret' },
        otillaten: [{ foo: 'bar' }]
      }
    }
  });
  deepEqual(
    unsupported,
    {
      andrar: [
        { mal: 'test', satt: 'ersatt', varde: 'Diskret' }
      ]
    },
    'rulesHelper ska ignorera otillåtna toppnycklar'
  );

  const fintMaster = { ...fint, niv\u00e5: 'M\u00e4stare' };
  deepEqual(
    sandbox.rulesHelper.getDefenseTraitRuleCandidates([fintMaster]),
    ['Diskret'],
    'Fint ska ge Diskret som f\u00f6rsvarsdrag fr\u00e5n Ges\u00e4ll och upp\u00e5t'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([fintMaster]),
    [
      {
        trait: 'Diskret',
        summaryText: 'Diskret som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med kort eller precist vapen',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med kort eller precist vapen',
        sourceEntryId: fint.id,
        sourceEntryName: 'Fint',
        sourceEntryLevel: 'M\u00e4stare'
      }
    ],
    'Fint ska ge regelstyrda attacknotiser'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...knivgora, niv\u00e5: 'Novis' }]),
    [
      {
        trait: 'Kvick',
        summaryText: 'Kvick som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med korta vapen',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med korta vapen',
        sourceEntryId: knivgora.id,
        sourceEntryName: 'Knivg\u00f6ra',
        sourceEntryLevel: 'Novis'
      }
    ],
    'Knivg\u00f6ra ska ge regelstyrd attacknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...koreograferadStrid, niv\u00e5: 'Novis' }]),
    [
      {
        trait: 'Kvick',
        summaryText: 'Kvick som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med kort eller balanserat vapen efter en f\u00f6rflyttning',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med kort eller balanserat vapen efter en f\u00f6rflyttning',
        sourceEntryId: koreograferadStrid.id,
        sourceEntryName: 'Koreograferad strid',
        sourceEntryLevel: 'Novis'
      }
    ],
    'Koreograferad strid ska ge regelstyrd attacknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...spjutdans, niv\u00e5: 'Novis' }]),
    [
      {
        trait: 'Kvick',
        summaryText: 'Kvick som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med l\u00e5nga vapen',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker med l\u00e5nga vapen',
        sourceEntryId: spjutdans.id,
        sourceEntryName: 'Spjutdans',
        sourceEntryLevel: 'Novis'
      }
    ],
    'Spjutdans ska ge regelstyrd attacknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...taktiker, niv\u00e5: 'M\u00e4stare' }]),
    [
      {
        trait: 'Listig',
        summaryText: 'Listig som tr\u00e4ffs\u00e4ker f\u00f6r attacker med allt utom tv\u00e5handsvapen',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r attacker med allt utom tv\u00e5handsvapen',
        sourceEntryId: taktiker.id,
        sourceEntryName: 'Taktiker',
        sourceEntryLevel: 'M\u00e4stare'
      }
    ],
    'Taktiker M\u00e4stare ska ge regelstyrd attacknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...sjatteSinne, niv\u00e5: 'M\u00e4stare' }]),
    [
      {
        trait: 'Vaksam',
        summaryText: 'Vaksam som tr\u00e4ffs\u00e4ker f\u00f6r avst\u00e5ndsattacker',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r avst\u00e5ndsattacker',
        sourceEntryId: sjatteSinne.id,
        sourceEntryName: 'Sj\u00e4tte sinne',
        sourceEntryLevel: 'M\u00e4stare'
      },
      {
        trait: 'Vaksam',
        summaryText: 'Vaksam som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker',
        sourceEntryId: sjatteSinne.id,
        sourceEntryName: 'Sj\u00e4tte sinne',
        sourceEntryLevel: 'M\u00e4stare'
      }
    ],
    'Sj\u00e4tte sinne M\u00e4stare ska ge b\u00e5de avst\u00e5nds- och n\u00e4rstridsnotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...jarnnave, niv\u00e5: 'Novis' }]),
    [
      {
        trait: 'Stark',
        summaryText: 'Stark som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker',
        sourceEntryId: jarnnave.id,
        sourceEntryName: 'J\u00e4rnn\u00e4ve',
        sourceEntryLevel: 'Novis'
      }
    ],
    'J\u00e4rnn\u00e4ve ska ge regelstyrd attacknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...dominera, niv\u00e5: 'Novis' }]),
    [
      {
        trait: '\u00d6vertygande',
        summaryText: '\u00d6vertygande som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker',
        extraText: 'Kan anv\u00e4ndas som tr\u00e4ffs\u00e4ker f\u00f6r n\u00e4rstridsattacker',
        sourceEntryId: dominera.id,
        sourceEntryName: 'Dominera',
        sourceEntryLevel: 'Novis'
      }
    ],
    'Dominera ska ge regelstyrd attacknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ ...ledare, niv\u00e5: 'Novis' }]),
    [
      {
        trait: '\u00d6vertygande',
        summaryText: '\u00d6vertygande ist\u00e4llet f\u00f6r Viljestark vid mystiska f\u00f6rm\u00e5gor och ritualer',
        extraText: 'Kan anv\u00e4ndas ist\u00e4llet f\u00f6r Viljestark vid anv\u00e4ndandet av mystiska f\u00f6rm\u00e5gor och ritualer',
        sourceEntryId: ledare.id,
        sourceEntryName: 'Ledare',
        sourceEntryLevel: 'Novis'
      }
    ],
    'Ledare ska ge regelstyrd mystiknotis'
  );
  deepEqual(
    sandbox.rulesHelper.getDefenseTraitRuleCandidates([
      { ...pareringsmastare, niv\u00e5: 'Novis' },
      { ...sjatteSinne, niv\u00e5: 'Ges\u00e4ll' },
      { ...taktiker, niv\u00e5: 'Ges\u00e4ll' },
      { ...provokator, niv\u00e5: 'Ges\u00e4ll' },
      fintMaster
    ]),
    ['Tr\u00e4ffs\u00e4ker', 'Vaksam', 'Listig', '\u00d6vertygande', 'Diskret'],
    'F\u00f6rsvarsers\u00e4ttningar ska l\u00e4sas fr\u00e5n regler'
  );
  const dancingTraitRule = {
    namn: 'Testdans',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'dansande_forsvar_karaktarsdrag', satt: 'ersatt', varde: 'Listig' },
          {
            mal: 'dansande_forsvar_karaktarsdrag',
            satt: 'ersatt',
            varde: 'Vaksam',
            nar: { har_utrustad_vapen_kvalitet: ['Precist'] }
          }
        ]
      }
    }
  };
  deepEqual(
    sandbox.rulesHelper.getDancingDefenseTraitRuleCandidates([dancingTraitRule], {
      vapenFakta: [{ typer: ['Vapen', 'Korta vapen'], kvaliteter: ['Precist'] }],
      antalVapen: 1
    }),
    ['Listig', 'Vaksam'],
    'Dansande försvarsdrag ska vara kontextstyrda via regler'
  );
  deepEqual(
    sandbox.rulesHelper.getDancingDefenseTraitRuleCandidates([dancingTraitRule], {
      vapenFakta: [{ typer: ['Vapen', 'Korta vapen'], kvaliteter: [] }],
      antalVapen: 1
    }),
    ['Listig'],
    'Dansande försvarsdrag ska filtreras av vapenkvalitet'
  );
  deepEqual(
    sandbox.rulesHelper.getAttackTraitRuleNotes([{ namn: 'Gammal post', niv\u00e5: 'Novis', taggar: { typ: ['F\u00f6rm\u00e5ga'] } }]),
    [],
    'Legacy-poster utan regler ska inte ge attacknotiser'
  );
}

function verifySnapshotRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const artifacts = readEntryDataFile(rootPath, 'data/artefakter.json');
  const artifactById = id => artifacts.find(entry => entry && entry.id === id);
  const skymningsvatten = artifactById('ar02');
  const rasthuulsAndekarl = artifactById('ar61');
  const nidvatten = artifactById('ar06');
  assert(skymningsvatten, 'Hittade inte ar02 för snapshot-verifiering');
  assert(rasthuulsAndekarl, 'Hittade inte ar61 för snapshot-verifiering');
  assert(nidvatten, 'Hittade inte ar06 för snapshot-verifiering');

  deepEqual(
    sandbox.rulesHelper.getArtifactEffectValueEffects(nidvatten, 'corruption'),
    { corruption: 1 },
    'Artefaktbindning utan regler ska behålla legacy effects-beteende'
  );
  deepEqual(
    sandbox.rulesHelper.getArtifactEffectValueRules(nidvatten, 'corruption'),
    {},
    'Artefaktbindning utan regler ska inte skapa regelblock implicit'
  );

  const makePermanentRuleEntry = (id, amount) => ({
    id,
    namn: id,
    taggar: {
      typ: ['Nackdel'],
      regler: {
        ger: [{ mal: 'permanent_korruption', varde: Number(amount) || 0 }]
      }
    }
  });
  const makePermanentModifierEntry = (id, amount) => ({
    id,
    namn: id,
    taggar: {
      typ: ['Fördel'],
      regler: {
        andrar: [{ mal: 'permanent_korruption', varde: Number(amount) || 0 }]
      }
    }
  });
  const attachResolvedRules = (list, rules, sourceKey = 'snapshot-test') => {
    const targetList = Array.isArray(list) ? list : [];
    const mapped = (Array.isArray(rules) ? rules : []).map(rule => ({
      key: 'andrar',
      rule: JSON.parse(JSON.stringify(rule)),
      sourceEntryId: sourceKey,
      sourceEntryName: sourceKey
    }));
    try {
      Object.defineProperty(targetList, '__snapshotRules', {
        value: mapped,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (_) {
      targetList.__snapshotRules = mapped;
    }
    return targetList;
  };

  const skymRules = sandbox.rulesHelper.getArtifactEffectValueRules(skymningsvatten, 'xp');
  assert(Array.isArray(skymRules.andrar) && skymRules.andrar.length === 2, 'ar02 ska ha två bindningsregler');
  assert(skymRules.andrar.every(rule => rule && rule.snapshot === true), 'ar02-bindningsregler ska vara snapshot');
  const skymMaterialized = sandbox.rulesHelper.materializeSnapshotAndrarRules(skymRules.andrar, {
    list: [makePermanentRuleEntry('perm-base-3', 3)]
  });
  deepEqual(
    skymMaterialized.map(rule => ({ mal: rule.mal, varde: rule.varde })),
    [
      { mal: 'smartgrans_tillagg', varde: -3 },
      { mal: 'permanent_korruption', varde: -3 }
    ],
    'ar02 snapshot-kedjan ska materialiseras med bindningstidens permanent korruption'
  );

  const andekarlRules = sandbox.rulesHelper.getArtifactEffectValueRules(rasthuulsAndekarl, 'corruption');
  assert(Array.isArray(andekarlRules.andrar) && andekarlRules.andrar.length === 2, 'ar61 ska ha två bindningsregler');
  assert(andekarlRules.andrar.every(rule => rule && rule.snapshot === true), 'ar61-bindningsregler ska vara snapshot');
  const andekarlMaterialized = sandbox.rulesHelper.materializeSnapshotAndrarRules(andekarlRules.andrar, {
    list: [makePermanentRuleEntry('perm-base-2', 2)]
  });
  deepEqual(
    andekarlMaterialized.map(rule => Number(rule.varde)),
    [1, 3],
    'ar61 snapshot-regler ska köras sekventiellt och läsa mellanstatus'
  );
  const andekarlList = attachResolvedRules(
    [makePermanentRuleEntry('perm-base-2', 2)],
    andekarlMaterialized,
    'ar61-test'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(andekarlList, { korruptionstroskel: 12 }) === 6,
    'ar61 snapshot-kedjan ska ge slutvärde 6 från bas 2'
  );

  const nonSnapshotRules = sandbox.rulesHelper.materializeSnapshotAndrarRules([
    {
      mal: 'smartgrans_tillagg',
      formel: { bas: 'mal:permanent_korruption', faktor: -1 }
    }
  ], {
    list: [makePermanentRuleEntry('perm-base-4', 4)]
  });
  assert(nonSnapshotRules.length === 1, 'Icke-snapshot-regel ska finnas kvar i materialiseringsresultatet');
  assert(
    nonSnapshotRules[0].formel && nonSnapshotRules[0].varde === undefined,
    'Icke-snapshot-regel ska behålla dynamisk formel och inte frysa till varde'
  );
  assert(
    !nonSnapshotRules[0]?.metadata?.snapshot,
    'Icke-snapshot-regel ska inte få snapshot-metadata'
  );

  const snapshotNarRules = sandbox.rulesHelper.materializeSnapshotAndrarRules([
    {
      mal: 'smartgrans_tillagg',
      formel: { bas: 'mal:permanent_korruption', faktor: -1 },
      nar: { mal_minst: { permanent_korruption: 3 } },
      snapshot: true
    },
    {
      mal: 'smartgrans_tillagg',
      formel: { bas: 'mal:permanent_korruption', faktor: -1 },
      nar: { mal_minst: { permanent_korruption: 4 } },
      snapshot: true
    }
  ], {
    list: [
      makePermanentRuleEntry('perm-base-2', 2),
      makePermanentModifierEntry('perm-plus-1', 1)
    ]
  });
  assert(snapshotNarRules.length === 1, 'Snapshot nar-villkor ska filtrera bort regler som inte uppfylls');
  assert(snapshotNarRules[0].varde === -3, 'Snapshot med nar ska läsa effektiva värden efter aktiva regler');
  assert(
    Number(snapshotNarRules[0]?.metadata?.source_values?.permanent_korruption) === 3,
    'Snapshot-metadata ska spåra avläst permanent korruption'
  );

  const traitSnapshot = sandbox.rulesHelper.materializeSnapshotAndrarRules([
    {
      mal: 'talighet_tillagg',
      formel: { bas: 'mal:karaktarsdrag:stark', faktor: -1 },
      snapshot: true
    }
  ], {
    list: [],
    traits: { Stark: 15 }
  });
  assert(traitSnapshot.length === 1, 'Trait-baserad snapshot ska materialiseras');
  assert(traitSnapshot[0].varde === -15, 'Snapshot ska kunna läsa ett specifikt trait-värde');
  assert(
    Number(traitSnapshot[0]?.metadata?.source_values?.['karaktarsdrag:stark']) === 15,
    'Trait-baserad snapshot ska logga läst trait-värde i metadata'
  );

  const emptyMoney = { daler: 0, skilling: 0, 'örtegar': 0 };
  const createStore = () => ({
    current: 'snapshot-test',
    characters: [{ id: 'snapshot-test', name: 'Snapshot Test' }],
    folders: [],
    data: {
      'snapshot-test': {
        list: [],
        inventory: [],
        custom: [],
        bonusMoney: { ...emptyMoney },
        privMoney: { ...emptyMoney },
        possessionMoney: { ...emptyMoney }
      }
    }
  });

  const freezeStore = createStore();
  sandbox.storeHelper.setCurrentList(freezeStore, [makePermanentRuleEntry('perm-base-3', 3)]);
  sandbox.storeHelper.syncSnapshotRuleSources(freezeStore, [
    {
      sourceKey: 'artifact:freeze',
      sourceName: 'Freeze source',
      sourceType: 'artifact_binding',
      sourceSignature: 'freeze-v1',
      rules: [
        {
          mal: 'permanent_korruption',
          formel: { bas: 'mal:permanent_korruption', faktor: -1 },
          snapshot: true
        }
      ]
    }
  ], {
    sourceType: 'artifact_binding',
    removeMissing: true
  });
  let freezeRecords = sandbox.storeHelper.getSnapshotRuleRecords(freezeStore);
  assert(freezeRecords.length === 1, 'Snapshot-källa ska materialisera en regel i store');
  assert(freezeRecords[0].rule.varde === -3, 'Snapshot ska frysa permanent korruption till bindningsvärdet');

  sandbox.storeHelper.setCurrentList(freezeStore, [makePermanentRuleEntry('perm-base-5', 5)]);
  sandbox.storeHelper.syncSnapshotRuleSources(freezeStore, [
    {
      sourceKey: 'artifact:freeze',
      sourceName: 'Freeze source',
      sourceType: 'artifact_binding',
      sourceSignature: 'freeze-v1',
      rules: [
        {
          mal: 'permanent_korruption',
          formel: { bas: 'mal:permanent_korruption', faktor: -1 },
          snapshot: true
        }
      ]
    }
  ], {
    sourceType: 'artifact_binding',
    removeMissing: true
  });
  freezeRecords = sandbox.storeHelper.getSnapshotRuleRecords(freezeStore);
  assert(freezeRecords.length === 1, 'Snapshot-källa ska behålla tidigare materialiserad regel');
  assert(freezeRecords[0].rule.varde === -3, 'Snapshot-värde ska ligga kvar oförändrat efter senare stat-ändring');
  assert(
    sandbox.storeHelper.calcPermanentCorruption(
      sandbox.storeHelper.getCurrentList(freezeStore),
      { korruptionstroskel: 12 }
    ) === 2,
    'Fryst snapshot ska fortsätta bidra med ursprungsvärdet även när basvärdet ändras'
  );

  const equipmentStore = createStore();
  const artifactEntry = {
    id: 'ar61',
    namn: 'Rasthuuls Andekärl',
    taggar: { typ: ['Artefakt'] },
    noInv: true
  };
  sandbox.storeHelper.setCurrentList(equipmentStore, [
    makePermanentRuleEntry('perm-base-2', 2),
    artifactEntry
  ]);
  sandbox.storeHelper.setArtifactEffects(equipmentStore, { corruption: 1 });
  sandbox.storeHelper.syncSnapshotRuleSources(equipmentStore, [
    {
      sourceKey: 'artifact:equipment',
      sourceName: 'Equipment source',
      sourceType: 'artifact_binding',
      sourceSignature: 'equipment-v1',
      sourceRef: {
        kind: 'artifact_binding',
        artifactId: 'ar61',
        artifactName: 'Rasthuuls Andekärl'
      },
      rules: [
        {
          mal: 'smartgrans_tillagg',
          formel: { bas: 'mal:permanent_korruption', faktor: -1 },
          snapshot: true
        }
      ]
    }
  ], {
    sourceType: 'artifact_binding',
    removeMissing: true
  });
  const equipmentRecords = sandbox.storeHelper.getSnapshotRuleRecords(equipmentStore);
  assert(equipmentRecords.length === 1, 'Snapshot med artefaktkälla ska materialiseras');
  assert(
    equipmentRecords[0].rule.varde === -3,
    'Snapshot ska läsa effektiva värden inklusive aktiv utrustningskorruption'
  );
  const equipmentList = sandbox.storeHelper.getCurrentList(equipmentStore);
  const equipmentArtifact = equipmentList.find(entry => entry && entry.id === 'ar61');
  assert(equipmentArtifact, 'Artefaktentry för impact-test ska finnas i listan');
  const equipmentImpact = sandbox.storeHelper.getSnapshotSourceImpactForEntry(equipmentStore, equipmentArtifact);
  assert(
    Number(equipmentImpact.count || 0) > 0 && Array.isArray(equipmentImpact.sourceKeys) && equipmentImpact.sourceKeys.includes('artifact:equipment'),
    'Snapshot-impact i listvyer ska hitta artefaktkällor via sourceRef'
  );

  const snapshotEntry = {
    id: 'snapshot-entry-test',
    namn: 'Snapshot Entry',
    taggar: {
      typ: ['Fördel'],
      regler: {
        andrar: [
          {
            mal: 'smartgrans_tillagg',
            varde: -2,
            snapshot: true
          }
        ]
      }
    }
  };

  const keepStore = createStore();
  sandbox.storeHelper.setCurrentList(keepStore, [{ ...snapshotEntry }]);
  const keepList = sandbox.storeHelper.getCurrentList(keepStore);
  const keepSourceEntry = keepList.find(entry => entry.id === 'snapshot-entry-test');
  assert(keepSourceEntry, 'Snapshot-källa ska finnas i listan före borttagning');
  const keepImpact = sandbox.storeHelper.getSnapshotSourceImpactForEntry(keepStore, keepSourceEntry);
  assert(keepImpact.count === 1 && keepImpact.sourceKey, 'Snapshot-impact ska hittas för entry-källa');
  assert(
    sandbox.storeHelper.detachSnapshotRulesBySource(keepStore, keepImpact.sourceKey) === true,
    'Detach ska kunna behålla snapshot-effekter utan källa'
  );
  sandbox.storeHelper.setCurrentList(keepStore, []);
  const keptRecords = sandbox.storeHelper.getSnapshotRuleRecords(keepStore);
  assert(keptRecords.length === 1 && keptRecords[0].detached === true, 'Detachade snapshot-regler ska persistera');
  assert(
    sandbox.storeHelper.calcPainThreshold(
      10,
      sandbox.storeHelper.getCurrentList(keepStore),
      { korruptionstroskel: 12 }
    ) === 3,
    'Behåll-valet ska låta snapshot-effekter ligga kvar efter att käll-entry tagits bort'
  );

  const removeStore = createStore();
  sandbox.storeHelper.setCurrentList(removeStore, [{ ...snapshotEntry }]);
  const removeList = sandbox.storeHelper.getCurrentList(removeStore);
  const removeSourceEntry = removeList.find(entry => entry.id === 'snapshot-entry-test');
  assert(removeSourceEntry, 'Snapshot-källa för remove-test ska finnas i listan');
  const removeImpact = sandbox.storeHelper.getSnapshotSourceImpactForEntry(removeStore, removeSourceEntry);
  assert(removeImpact.count === 1 && removeImpact.sourceKey, 'Remove-test ska hitta snapshot-impact');
  assert(
    sandbox.storeHelper.removeSnapshotRulesBySource(removeStore, removeImpact.sourceKey) === true,
    'Remove ska kunna ta bort snapshot-effekter med källan'
  );
  sandbox.storeHelper.setCurrentList(removeStore, []);
  assert(
    sandbox.storeHelper.getSnapshotRuleRecords(removeStore).length === 0,
    'Ta-bort-valet ska rensa snapshot-effekter från state'
  );
  assert(
    sandbox.storeHelper.calcPainThreshold(
      10,
      sandbox.storeHelper.getCurrentList(removeStore),
      { korruptionstroskel: 12 }
    ) === 5,
    'Efter remove-valet ska ingen snapshot-effekt påverka smärtgränsen'
  );
}

function verifyRuntimeConsumers(rootPath) {
  const traitsSource = readText(joinPath(rootPath, 'js/traits-utils.js'));
  const characterViewSource = readText(joinPath(rootPath, 'js/character-view.js'));
  const indexViewSource = readText(joinPath(rootPath, 'js/index-view.js'));
  const summaryEffectsSource = readText(joinPath(rootPath, 'js/summary-effects.js'));
  const storeSource = readText(joinPath(rootPath, 'js/store.js'));
  const inventoryUtilsSource = readText(joinPath(rootPath, 'js/inventory-utils.js'));

  assert(
    characterViewSource.includes('handleSnapshotEntryRemoval(')
      && characterViewSource.includes('getSnapshotSourceImpactForEntry')
      && characterViewSource.includes('removeSnapshotRulesBySource')
      && characterViewSource.includes('detachSnapshotRulesBySource')
      && characterViewSource.includes('openDialog')
      && characterViewSource.includes('Behåll effekter'),
    'character-view ska trigga snapshot popup/confirm-flöde med val för behåll/ta bort'
  );
  assert(
    indexViewSource.includes('handleSnapshotEntryRemoval(')
      && indexViewSource.includes('getSnapshotSourceImpactForEntry')
      && indexViewSource.includes('removeSnapshotRulesBySource')
      && indexViewSource.includes('detachSnapshotRulesBySource')
      && indexViewSource.includes('openDialog')
      && indexViewSource.includes('Behåll effekter'),
    'index-view ska trigga snapshot popup/confirm-flöde med val för behåll/ta bort'
  );
  assert(
    inventoryUtilsSource.includes('confirmSnapshotSourceRemoval(')
      && inventoryUtilsSource.includes('getSnapshotRuleRecords')
      && inventoryUtilsSource.includes('removeSnapshotRulesBySource')
      && inventoryUtilsSource.includes('detachSnapshotRulesBySource')
      && inventoryUtilsSource.includes('openDialog')
      && inventoryUtilsSource.includes('Behåll effekter'),
    'inventory-utils ska trigga snapshot popup/confirm-flöde med val för behåll/ta bort'
  );

  assert(!traitsSource.includes('AUTO_DEFENSE_TRAITS'), 'traits-utils ska inte ha kvar AUTO_DEFENSE_TRAITS');
  assert(!storeSource.includes('calcDarkPastPermanentCorruption'), 'store ska inte ha kvar calcDarkPastPermanentCorruption');
  [
    'Knivgöra',
    'Koreograferad strid',
    'Spjutdans',
    'Taktiker',
    'Sjätte Sinne',
    'Sjätte sinne',
    'Järnnäve',
    'Dominera',
    'Ledare',
    'Pareringsmästare',
    'Provokatör'
  ].forEach(name => {
    assert(!characterViewSource.includes(name), `character-view har kvar hårdkodad gren för ${name}`);
    assert(!summaryEffectsSource.includes(name), `summary-effects har kvar hårdkodad gren för ${name}`);
  });
  assert(!characterViewSource.includes('const strongGiftLevel ='), 'character-view ska inte räkna korruptionströskel lokalt');
  assert(!summaryEffectsSource.includes('const strongGiftLevel ='), 'summary-effects ska inte räkna korruptionströskel lokalt');
  assert(!traitsSource.includes('const strongGiftLevel ='), 'traits-utils ska inte räkna korruptionströskel lokalt');
  assert(
    !characterViewSource.includes("if (name === 'Packåsna' && before.some(x => x.namn === 'Hafspackare'))"),
    'character-view ska inte ha kvar hårdkodad Packåsna/Hafspackare-gren'
  );
  assert(
    !characterViewSource.includes("if (name === 'Hafspackare' && before.some(x => x.namn === 'Packåsna'))"),
    'character-view ska inte ha kvar hårdkodad Hafspackare/Packåsna-gren'
  );
  assert(
    !storeSource.includes('function enforcePackAnimal'),
    'store ska inte ha kvar hårdkodad enforcePackAnimal'
  );
  assert(
    storeSource.includes('function enforceRuleConflicts'),
    'store ska använda generisk enforceRuleConflicts'
  );
  assert(
    storeSource.includes('getConflictReasonsForCandidate'),
    'store ska använda rulesHelper.getConflictReasonsForCandidate för regelkrockar'
  );
  assert(
    storeSource.includes('getConflictResolutionForCandidate'),
    'store ska använda rulesHelper.getConflictResolutionForCandidate för konfliktupplösning'
  );
  assert(
    !storeSource.includes('function enforceDwarf'),
    'store ska inte ha kvar hårdkodad enforceDwarf'
  );
  assert(
    storeSource.includes('getRequirementDependents'),
    'store ska använda rulesHelper.getRequirementDependents för kravberoenden'
  );
  assert(
    !storeSource.includes('function applyDarkBloodEffects'),
    'store ska inte ha kvar hårdkodad applyDarkBloodEffects'
  );
  assert(
    storeSource.includes('syncRuleEntryGrants('),
    'store ska synka regelstyrda post-grants i setCurrentList'
  );
  assert(
    storeSource.includes('getEntryGrantTargets'),
    'store ska använda rulesHelper.getEntryGrantTargets för post-grants'
  );
  assert(
    storeSource.includes('getEntryGrantDependents'),
    'store ska använda rulesHelper.getEntryGrantDependents för post-beroenden'
  );
  assert(
    !storeSource.includes("if (name === 'Robust')"),
    'store ska inte ha kvar hårdkodad Robust/Råstyrka-beroendekoppling'
  );
  assert(
    !characterViewSource.includes("if (name === 'Råstyrka')"),
    'character-view ska inte ha kvar hårdkodad Råstyrka/Robust-gren'
  );
  assert(
    characterViewSource.includes('getMissingRequirementReasonsForCandidate'),
    'character-view ska använda rulesHelper.getMissingRequirementReasonsForCandidate för krav'
  );
  assert(
    characterViewSource.includes('getConflictResolutionForCandidate'),
    'character-view ska använda rulesHelper.getConflictResolutionForCandidate för regelkrockar'
  );
  assert(
    !characterViewSource.includes("if (p.namn === 'Välutrustad')"),
    'character-view ska inte ha kvar hårdkodad Välutrustad-gren'
  );
  assert(
    !characterViewSource.includes("if (name === 'Korruptionskänslig' && before.some(x => x.namn === 'Dvärg'))"),
    'character-view ska inte ha kvar hårdkodad Korruptionskänslig/Dvärg-gren'
  );
  assert(
    !indexViewSource.includes("if (p.namn === 'Råstyrka')"),
    'index-view ska inte ha kvar hårdkodad Råstyrka/Robust-gren'
  );
  assert(
    indexViewSource.includes('getMissingRequirementReasonsForCandidate'),
    'index-view ska använda rulesHelper.getMissingRequirementReasonsForCandidate för krav'
  );
  assert(
    indexViewSource.includes('getConflictResolutionForCandidate'),
    'index-view ska använda rulesHelper.getConflictResolutionForCandidate för regelkrockar'
  );
  assert(
    !characterViewSource.includes('kan_införskaffas_flera_gånger'),
    'character-view ska inte bygga add/level-spärrar på kan_införskaffas_flera_gånger'
  );
  assert(
    !indexViewSource.includes('kan_införskaffas_flera_gånger'),
    'index-view ska inte bygga add/level-spärrar på kan_införskaffas_flera_gånger'
  );
  assert(
    characterViewSource.includes('getEntryMaxCount('),
    'character-view ska använda max_antal-modellen via getEntryMaxCount'
  );
  assert(
    indexViewSource.includes('getEntryMaxCount('),
    'index-view ska använda max_antal-modellen via getEntryMaxCount'
  );
  assert(
    !indexViewSource.includes("if (p.namn === 'Välutrustad')"),
    'index-view ska inte ha kvar hårdkodad Välutrustad-gren'
  );
  assert(
    !indexViewSource.includes("if (p.namn === 'Korruptionskänslig' && list.some(x => x.namn === 'Dvärg'))"),
    'index-view ska inte ha kvar hårdkodad Korruptionskänslig/Dvärg-gren'
  );
  assert(
    !indexViewSource.includes("if (p.namn === 'Dvärg')"),
    'index-view ska inte ha kvar hårdkodad Dvärg/Korruptionskänslig-gren'
  );
  assert(!characterViewSource.includes('Kraftprov'), 'character-view ska inte hårdkoda Kraftprov för Tålighet');
  assert(!summaryEffectsSource.includes('Kraftprov'), 'summary-effects ska inte hårdkoda Kraftprov för Tålighet');
  assert(!traitsSource.includes('Kraftprov'), 'traits-utils ska inte hårdkoda Kraftprov för Tålighet');
  assert(!characterViewSource.includes('Hårdnackad'), 'character-view ska inte hårdkoda Hårdnackad för Tålighet');
  assert(!summaryEffectsSource.includes('Hårdnackad'), 'summary-effects ska inte hårdkoda Hårdnackad för Tålighet');
  assert(!traitsSource.includes('Hårdnackad'), 'traits-utils ska inte hårdkoda Hårdnackad för Tålighet');
  assert(!traitsSource.includes('Exceptionellt karaktärsdrag'), 'traits-utils ska inte hårdkoda Exceptionellt karaktärsdrag för max total');
  assert(!traitsSource.includes("row.id === 'l9'"), 'traits-utils ska inte hårdkoda Djurmask för max total');
  assert(characterViewSource.includes('calcCorruptionTrackStats('), 'character-view ska använda storeHelper.calcCorruptionTrackStats');
  assert(summaryEffectsSource.includes('calcCorruptionTrackStats('), 'summary-effects ska använda storeHelper.calcCorruptionTrackStats');
  assert(traitsSource.includes('calcCorruptionTrackStats('), 'traits-utils ska använda storeHelper.calcCorruptionTrackStats');
  assert(characterViewSource.includes('calcToughness('), 'character-view ska använda storeHelper.calcToughness');
  assert(summaryEffectsSource.includes('calcToughness('), 'summary-effects ska använda storeHelper.calcToughness');
  assert(traitsSource.includes('calcToughness('), 'traits-utils ska använda storeHelper.calcToughness');
  assert(traitsSource.includes('calcTraitTotalMax('), 'traits-utils ska använda storeHelper.calcTraitTotalMax');
  assert(
    !inventoryUtilsSource.includes('function addWellEquippedItems'),
    'inventory-utils ska inte ha kvar addWellEquippedItems'
  );
  assert(
    !inventoryUtilsSource.includes('function removeWellEquippedItems'),
    'inventory-utils ska inte ha kvar removeWellEquippedItems'
  );
  assert(
    !inventoryUtilsSource.includes("row.perk === 'Välutrustad'"),
    'inventory-utils ska inte ha kvar hårdkodad Välutrustad-källa'
  );
  assert(
    storeSource.includes('syncRuleInventoryGrants('),
    'store ska synka regelstyrda inventarie-grants i setCurrentList'
  );
  assert(
    storeSource.includes('getInventoryGrantItems'),
    'store ska använda rulesHelper.getInventoryGrantItems för inventarie-grants'
  );

  const carryStart = storeSource.indexOf('function calcCarryCapacity');
  const toughStart = storeSource.indexOf('function calcToughness');
  const traitMaxStart = storeSource.indexOf('function calcTraitTotalMax');
  const painStart = storeSource.indexOf('function calcPainThreshold');
  if (carryStart !== -1 && toughStart !== -1 && toughStart > carryStart) {
    const carrySource = storeSource.slice(carryStart, toughStart);
    assert(!carrySource.includes('Packåsna'), 'calcCarryCapacity ska inte vara hårdkodad för Packåsna');
    assert(!carrySource.includes('Hafspackare'), 'calcCarryCapacity ska inte vara hårdkodad för Hafspackare');
    assert(carrySource.includes('getCarryCapacityBase'), 'calcCarryCapacity ska använda rulesHelper.getCarryCapacityBase');
  } else {
    throw new Error('Kunde inte läsa calcCarryCapacity-blocket i store.js');
  }

  if (toughStart !== -1 && painStart !== -1 && painStart > toughStart) {
    const toughEnd = traitMaxStart !== -1 && traitMaxStart > toughStart ? traitMaxStart : painStart;
    const toughSource = storeSource.slice(toughStart, toughEnd);
    assert(!toughSource.includes('Kraftprov'), 'calcToughness ska inte vara hårdkodad för Kraftprov');
    assert(!toughSource.includes('Hårdnackad'), 'calcToughness ska inte vara hårdkodad för Hårdnackad');
    assert(toughSource.includes('getToughnessBase'), 'calcToughness ska använda rulesHelper.getToughnessBase');
  } else {
    throw new Error('Kunde inte läsa calcToughness-blocket i store.js');
  }

  if (traitMaxStart !== -1 && painStart !== -1 && painStart > traitMaxStart) {
    const traitMaxSource = storeSource.slice(traitMaxStart, painStart);
    assert(!traitMaxSource.includes('Exceptionellt karaktärsdrag'), 'calcTraitTotalMax ska inte vara hårdkodad för Exceptionellt karaktärsdrag');
    assert(!traitMaxSource.includes("row?.id === 'l9'"), 'calcTraitTotalMax ska inte vara hårdkodad för Djurmask');
    assert(traitMaxSource.includes('getTraitTotalMax'), 'calcTraitTotalMax ska använda rulesHelper.getTraitTotalMax');
  } else {
    throw new Error('Kunde inte läsa calcTraitTotalMax-blocket i store.js');
  }

  const stripStart = storeSource.indexOf('function stripDefaults');
  if (painStart !== -1 && stripStart !== -1 && stripStart > painStart) {
    const painSource = storeSource.slice(painStart, stripStart);
    assert(!painSource.includes('Smärttålig'), 'calcPainThreshold ska inte vara hårdkodad för Smärttålig');
    assert(!painSource.includes('Bräcklig'), 'calcPainThreshold ska inte vara hårdkodad för Bräcklig');
    assert(!painSource.includes('Jordnära'), 'calcPainThreshold ska inte vara hårdkodad för Jordnära');
    assert(!painSource.includes('Mörkt förflutet'), 'calcPainThreshold ska inte vara hårdkodad för Mörkt förflutet');
    assert(painSource.includes('getPainThresholdModifier'), 'calcPainThreshold ska använda rulesHelper.getPainThresholdModifier');
  } else {
    throw new Error('Kunde inte läsa calcPainThreshold-blocket i store.js');
  }
}

function verifyMaxCountRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const evaluateEntryStops = sandbox.rulesHelper?.evaluateEntryStops;
  assert(typeof evaluateEntryStops === 'function', 'rulesHelper ska exponera evaluateEntryStops');

  const makeCopies = (entry, count) => Array.from({ length: Number(count) || 0 }, (_, index) => ({
    ...entry,
    id: `${entry.id || 'copy'}-${index + 1}`
  }));

  const singlePickEntry = {
    id: 'max-test-single',
    namn: 'Enstaka testpost',
    taggar: { typ: ['Fördel'] }
  };
  const defaultSecondCopyStop = evaluateEntryStops(singlePickEntry, makeCopies(singlePickEntry, 1), { action: 'add' });
  assert(
    hasHardStopCode(defaultSecondCopyStop, 'duplicate_entry'),
    'evaluateEntryStops ska blockera andra kopian när max_antal saknas'
  );
  assert(
    !hasHardStopCode(defaultSecondCopyStop, 'stack_limit'),
    'Default max_antal=1 ska använda duplicate_entry, inte stack_limit'
  );

  const stackableEntry = {
    id: 'max-test-stack',
    namn: 'Staplingsbar testpost',
    taggar: {
      typ: ['Fördel'],
      max_antal: 3
    }
  };
  const allowThirdCopy = evaluateEntryStops(stackableEntry, makeCopies(stackableEntry, 2), { action: 'add' });
  assert(
    !allowThirdCopy.hasStops,
    'evaluateEntryStops ska tillåta val upp till taggar.max_antal'
  );
  const blockFourthCopy = evaluateEntryStops(stackableEntry, makeCopies(stackableEntry, 3), { action: 'add' });
  assert(
    hasHardStopCode(blockFourthCopy, 'stack_limit'),
    'evaluateEntryStops ska blockera först över taggar.max_antal'
  );
  assert(
    !hasHardStopCode(blockFourthCopy, 'duplicate_entry'),
    'taggar.max_antal > 1 ska ge stack_limit, inte duplicate_entry'
  );

  const legacyTrueWithExplicitLimit = {
    id: 'max-test-legacy-true',
    namn: 'Legacy med limit',
    kan_införskaffas_flera_gånger: true,
    taggar: {
      typ: ['Fördel'],
      max_antal: 2,
      kan_införskaffas_flera_gånger: true
    }
  };
  const legacyFalseWithExplicitLimit = {
    id: 'max-test-legacy-false',
    namn: 'Legacy med limit',
    kan_införskaffas_flera_gånger: false,
    taggar: {
      typ: ['Fördel'],
      max_antal: 2,
      kan_införskaffas_flera_gånger: false
    }
  };
  const legacyTrueStop = evaluateEntryStops(
    legacyTrueWithExplicitLimit,
    makeCopies(legacyTrueWithExplicitLimit, 2),
    { action: 'add' }
  );
  const legacyFalseStop = evaluateEntryStops(
    legacyFalseWithExplicitLimit,
    makeCopies(legacyFalseWithExplicitLimit, 2),
    { action: 'add' }
  );
  assert(
    hasHardStopCode(legacyTrueStop, 'stack_limit') && hasHardStopCode(legacyFalseStop, 'stack_limit'),
    'Legacy-flaggan ska inte påverka utfallet när max_antal finns (förväntad stack_limit)'
  );
  const stopCodes = result => (Array.isArray(result?.hardStops) ? result.hardStops : [])
    .map(stop => String(stop?.code || '').trim())
    .filter(Boolean)
    .sort();
  deepEqual(
    stopCodes(legacyTrueStop),
    stopCodes(legacyFalseStop),
    'Legacy-flaggan ska inte ändra hardStops när max_antal finns'
  );

  const maxOneLegacyTrue = {
    id: 'max-test-legacy-max-one',
    namn: 'Legacy ignoreras av max_antal',
    kan_införskaffas_flera_gånger: true,
    taggar: {
      typ: ['Fördel'],
      max_antal: 1
    }
  };
  const maxOneLegacyStop = evaluateEntryStops(maxOneLegacyTrue, makeCopies(maxOneLegacyTrue, 1), { action: 'add' });
  assert(
    hasHardStopCode(maxOneLegacyStop, 'duplicate_entry'),
    'Legacy-flagga true ska inte överstyra explicit max_antal=1'
  );

  const repeatableExpectations = {
    'data/fordel.json': [
      'Arkivarie',
      'Berättare',
      'Blodhund',
      'Bluffmakare',
      'Falköga',
      'Falskspelare',
      'Fingerfärdig',
      'Grodbent',
      'Gröna fingrar',
      'Imitatör',
      'Inbrottstjuv',
      'Kartograf',
      'Klanvän',
      'Klippvandrare',
      'Kommenderande stämma',
      'Lagvrängare',
      'Medium',
      'Motståndskraft',
      'Musikant',
      'Prios Barn',
      'Prisjakt',
      'Rännstensfostran',
      'Sjövan',
      'Skattöga',
      'Skräckinjagande',
      'Skuggyngel',
      'Skvallerbytta',
      'Smärttålig',
      'Stegrytm',
      'Stigkedja',
      'Stridsberedd',
      'Stäppfödd',
      'Taktisk spelare',
      'Teckentydare',
      'Tyst andning',
      'Vildmarksvana',
      'Väderbiten',
      'Vägvisare',
      'Väktarblick'
    ],
    'data/nackdel.json': [
      'Bräcklig',
      'Korruptionskänslig'
    ]
  };

  Object.keys(repeatableExpectations).forEach(relativePath => {
    const entries = readEntryDataFile(rootPath, relativePath);
    const expectedNames = [...repeatableExpectations[relativePath]].sort();
    const byName = new Map(
      (Array.isArray(entries) ? entries : [])
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => [String(entry.namn || '').trim(), entry])
    );
    expectedNames.forEach(name => {
      const entry = byName.get(name);
      assert(entry, `${relativePath}: saknar förväntad repeatable-post ${name}`);
      assert(
        parsePositiveLimit(entry?.taggar?.max_antal) > 1,
        `${relativePath}: repeatable-posten ${name} måste ha taggar.max_antal > 1`
      );
    });

    const actualRepeatable = (Array.isArray(entries) ? entries : [])
      .filter(entry => parsePositiveLimit(entry?.taggar?.max_antal) > 1)
      .map(entry => String(entry?.namn || '').trim())
      .filter(Boolean)
      .sort();
    deepEqual(
      actualRepeatable,
      expectedNames,
      `${relativePath}: repeatable-listan har ändrats. Uppdatera verify_rules_helper.js och säkra max_antal > 1.`
    );
  });

  const legacyHits = [];
  listDataJsonFiles(rootPath).forEach(fileName => {
    const relativePath = `data/${fileName}`;
    const parsed = readEntryDataFile(rootPath, relativePath);
    const fileHits = [];
    collectLegacyRepeatabilityTrue(parsed, '$', fileHits);
    fileHits.forEach(hit => legacyHits.push(`${relativePath}:${hit}`));
  });
  assert(
    legacyHits.length === 0,
    [
      'Källdata får inte innehålla kan_införskaffas_flera_gånger: true.',
      ...legacyHits.slice(0, 20),
      legacyHits.length > 20 ? `... och ${legacyHits.length - 20} till` : ''
    ].filter(Boolean).join('\n')
  );
}

function verifyPermanentCorruption(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const abilities = readEntryDataFile(rootPath, 'data/formaga.json');
  const powers = readEntryDataFile(rootPath, 'data/mystisk-kraft.json');
  const rituals = readEntryDataFile(rootPath, 'data/ritual.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const traits = readEntryDataFile(rootPath, 'data/sardrag.json');
  const races = readEntryDataFile(rootPath, 'data/ras.json');

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const ordensmagi = findByName(abilities, 'Ordensmagi');
  const reningskraft = findByName(abilities, 'Reningskraft');
  const anatema = findByName(powers, 'Anatema');
  const vedergallning = findByName(powers, 'Vedergällning');
  const askansBerattelse = findByName(rituals, 'Askans berättelse');
  const morktForflutet = findByName(disadvantages, 'Mörkt förflutet');
  const jordnara = findByName(traits, 'Jordnära');
  const dvarg = findByName(races, 'Dvärg');
  const stjarnamagi = {
    id: 'test-trad-1',
    namn: 'Stjärnamagi',
    nivå: 'Gesäll',
    taggar: {
      typ: ['Förmåga'],
      ark_trad: ['Stjärnmagiker'],
      regler: {
        ger: [
          {
            mal: 'skydd_permanent_korruption',
            formel: { bas: 'niva' },
            nar: {
              typ: ['Mystisk kraft', 'Ritual']
            }
          }
        ]
      }
    }
  };
  const stjarnmystik = {
    id: 'test-mystik-1',
    namn: 'Norrskenets kall',
    nivå: 'Mästare',
    taggar: {
      typ: ['Mystisk kraft'],
      ark_trad: ['Stjärnmagiker']
    }
  };
  const stjarnbesvarjare = {
    id: 'test-elit-1',
    namn: 'Stjärnbesvärjare',
    taggar: {
      typ: ['Elityrke'],
      ark_trad: ['Stjärnbesvärjare', 'Stjärnmagiker']
    }
  };
  const stjarnmystikElit = {
    id: 'test-mystik-2',
    namn: 'Stjärnfall',
    nivå: 'Mästare',
    taggar: {
      typ: ['Mystisk kraft'],
      ark_trad: ['Stjärnbesvärjare']
    }
  };
  const stjarnritualElit = {
    id: 'test-ritual-1',
    namn: 'Stjärnport',
    nivå: 'Enkel',
    taggar: {
      typ: ['Ritual'],
      ark_trad: ['Stjärnbesvärjare'],
      nivå_data: {
        Enkel: {
          handling: 'Speciell',
          skadetyp: ''
        }
      }
    }
  };

  [
    ['Ordensmagi', ordensmagi],
    ['Reningskraft', reningskraft],
    ['Anatema', anatema],
    ['Vedergällning', vedergallning],
    ['Askans berättelse', askansBerattelse],
    ['Mörkt förflutet', morktForflutet],
    ['Jordnära', jordnara],
    ['Dvärg', dvarg]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för permanent-korruptionsverifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(reningskraft, { level: 'Mästare' }),
    {
      ger: [
        {
          mal: 'permanent_korruption',
          formel: { bas: 'niva' }
        }
      ]
    },
    'Reningskraft ska ha regel för permanent korruption'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(morktForflutet),
    {
      ger: [
        {
          nar: { saknar_namn: ['Jordnära'] },
          mal: 'permanent_korruption',
          formel: { bas: 'attribut:korruptionstroskel', division: 4, avrunda: 'uppat' }
        },
        {
          nar: { har_namn: ['Jordnära'] },
          mal: 'smartgrans_tillagg',
          formel: { bas: 'attribut:aktuell_smartgrans', division: 4, avrunda: 'nedat' }
        }
      ]
    },
    'Mörkt förflutet ska ha regel för permanent korruption'
  );

  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [{ ...reningskraft, nivå: 'Mästare' }],
      { korruptionstroskel: 14 }
    ) === 3,
    'Reningskraft Mästare ska ge 3 permanent korruption'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [{ ...morktForflutet }],
      { korruptionstroskel: 14 }
    ) === 4,
    'Mörkt förflutet ska ge en fjärdedel av korruptionströskeln uppåt'
  );
  const customPermanentFormula = {
    id: 'test-perm-1',
    namn: 'Skuggarv',
    taggar: {
      typ: ['Nackdel'],
      regler: {
        ger: [
          {
            mal: 'permanent_korruption',
            formel: {
              bas: 'korruptionstroskel',
              division: 4,
              avrunda: 'uppat'
            }
          }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [customPermanentFormula],
      { korruptionstroskel: 14 }
    ) === 4,
    'Permanent korruption ska stödja generisk formel med division'
  );
  const customStackedPermanentFormula = {
    id: 'test-perm-2',
    namn: 'Skuggsnöboll',
    taggar: {
      typ: ['Nackdel'],
      regler: {
        ger: [
          {
            mal: 'permanent_korruption',
            varde: 2
          },
          {
            mal: 'permanent_korruption',
            formel: {
              bas: 'aktuell_permanent_korruption',
              division: 2,
              avrunda: 'nedat'
            }
          }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [customStackedPermanentFormula],
      { korruptionstroskel: 14 }
    ) === 3,
    'Permanent korruption ska kunna referera aktuell totalsumma via generell formel'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [{ ...anatema, nivå: 'Mästare' }],
      { korruptionstroskel: 14 }
    ) === 3,
    'Mystisk kraft utan skyddande tradition ska ge permanent korruption enligt nivå'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...ordensmagi, nivå: 'Gesäll' },
        { ...anatema, nivå: 'Mästare' }
      ],
      { korruptionstroskel: 14 }
    ) === 1,
    'Ordensmagi Gesäll ska skydda upp till gesällnivå för traditionens krafter'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...ordensmagi, nivå: 'Novis' },
        { ...askansBerattelse, nivå: 'Enkel' }
      ],
      { korruptionstroskel: 14 }
    ) === 0,
    'Ordensmagi Novis ska skydda traditionens ritualer på enkel nivå'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...dvarg },
        { ...vedergallning, nivå: 'Mästare' }
      ],
      { korruptionstroskel: 14 }
    ) === 0,
    'Dvärg ska skydda mot permanent korruption från Vedergällning'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...stjarnamagi },
        { ...stjarnmystik }
      ],
      { korruptionstroskel: 14 }
    ) === 1,
    'Nya traditioner ska skydda via samma ark_trad utan hårdkodad alias'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...stjarnamagi },
        { ...stjarnmystikElit }
      ],
      { korruptionstroskel: 14 }
    ) === 3,
    'Elitmärkt mystik utan länkande elityrke ska inte få traditionens skydd'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...stjarnamagi },
        { ...stjarnbesvarjare },
        { ...stjarnmystikElit }
      ],
      { korruptionstroskel: 14 }
    ) === 1,
    'Elityrke ska länka sin första och andra ark_trad för mystiska krafter'
  );
  assert(
    sandbox.rulesHelper.calcPermanentCorruption(
      [
        { ...stjarnamagi, nivå: 'Novis' },
        { ...stjarnbesvarjare },
        { ...stjarnritualElit }
      ],
      { korruptionstroskel: 14 }
    ) === 0,
    'Elityrke ska länka sin första och andra ark_trad för ritualer'
  );
  assert(
    sandbox.storeHelper.calcPermanentCorruption(
      [
        { ...dvarg },
        { ...vedergallning, nivå: 'Mästare' },
        { ...morktForflutet }
      ],
      { korruptionstroskel: 14 }
    ) === 4,
    'storeHelper ska använda regler för permanent korruption'
  );
  assert(
    sandbox.storeHelper.calcPainThreshold(
      15,
      [
        { ...dvarg },
        { ...jordnara },
        { ...morktForflutet }
      ],
      { korruptionstroskel: 14 }
    ) === 6,
    'Jordnära + Mörkt förflutet ska fortfarande ge extra smärtgränssänkning (halverad perm korruption)'
  );
}

function verifyCorruptionTrackStats(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const abilities = readEntryDataFile(rootPath, 'data/formaga.json');
  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const allEntries = [...abilities, ...advantages, ...disadvantages];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = () => false;
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const starkGava = findByName(abilities, 'Stark gåva');
  const motstandskraft = findByName(advantages, 'Motståndskraft');
  const sjalastark = findByName(advantages, 'Själastark');
  const korruptionskanslig = findByName(disadvantages, 'Korruptionskänslig');

  [
    ['Stark gåva', starkGava],
    ['Motståndskraft', motstandskraft],
    ['Själastark', sjalastark],
    ['Korruptionskänslig', korruptionskanslig]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för korruptionströskel-verifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(starkGava, { level: 'Novis' }),
    {
      andrar: [
        {
          mal: 'korruptionstroskel',
          satt: 'add',
          formel: { bas: 'attribut:viljestark', division: 2, avrunda: 'nedat' }
        },
        {
          mal: 'styggelsetroskel',
          satt: 'add',
          varde: 5
        }
      ]
    },
    'Stark gåva Novis ska ha regelstyrda korruptionsspårs-ändringar'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(motstandskraft),
    {
      andrar: [
        {
          mal: 'korruptionstroskel',
          satt: 'add',
          varde: 1
        }
      ]
    },
    'Motståndskraft ska ha regelstyrd korruptionströskel-ökning'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(sjalastark),
    {
      andrar: [
        {
          mal: 'styggelsetroskel',
          satt: 'add',
          varde: 1
        }
      ]
    },
    'Själastark ska ha regelstyrd styggelsetröskel-ökning'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(korruptionskanslig),
    {
      andrar: [
        {
          mal: 'korruptionstroskel',
          satt: 'add',
          varde: -1
        }
      ]
    },
    'Korruptionskänslig ska ha regelstyrd korruptionströskel-sänkning'
  );

  deepEqual(
    sandbox.rulesHelper.getCorruptionTrackStats([], { viljestark: 15 }),
    { viljestark: 15, korruptionstroskel: 8, styggelsetroskel: 15 },
    'Grundberäkning för korruptionsspåret ska vara viljestark/2 uppåt och viljestark'
  );
  deepEqual(
    sandbox.rulesHelper.getCorruptionTrackStats(
      [{ ...starkGava, nivå: 'Novis' }],
      { viljestark: 15 }
    ),
    { viljestark: 15, korruptionstroskel: 15, styggelsetroskel: 20 },
    'Stark gåva Novis ska ge hel viljestark i tröskel och +5 styggelsetröskel'
  );
  deepEqual(
    sandbox.rulesHelper.getCorruptionTrackStats(
      [
        { ...starkGava, nivå: 'Novis' },
        { ...motstandskraft },
        { ...motstandskraft },
        { ...korruptionskanslig },
        { ...sjalastark }
      ],
      { viljestark: 15 }
    ),
    { viljestark: 15, korruptionstroskel: 16, styggelsetroskel: 21 },
    'Stackade fördelar/nackdelar ska justera korruptionsspåret via regler'
  );

  const customGuard = {
    id: 'test-corr-1',
    namn: 'Stjärnskydd',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'korruptionstroskel', satt: 'add', varde: 2 },
          { mal: 'styggelsetroskel', satt: 'add', varde: 3 }
        ]
      }
    }
  };
  deepEqual(
    sandbox.rulesHelper.getCorruptionTrackStats([customGuard], { viljestark: 13 }),
    { viljestark: 13, korruptionstroskel: 9, styggelsetroskel: 16 },
    'Nya poster med samma regelnycklar ska påverka korruptionsspåret utan kodändring'
  );
  const customCorruptionFormula = {
    id: 'test-corr-2',
    namn: 'Måttad tröskel',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'korruptionstroskel',
            satt: 'add',
            formel: {
              bas: 'aktuell_korruptionstroskel',
              division: 2,
              avrunda: 'nedat'
            }
          },
          {
            mal: 'styggelsetroskel',
            satt: 'add',
            formel: {
              bas: 'viljestark',
              division: 3,
              avrunda: 'nedat'
            }
          }
        ]
      }
    }
  };
  deepEqual(
    sandbox.rulesHelper.getCorruptionTrackStats([customCorruptionFormula], { viljestark: 15 }),
    { viljestark: 15, korruptionstroskel: 12, styggelsetroskel: 20 },
    'Korruptionsspåret ska stödja generisk formel med division/faktorbas'
  );

  const legacyStarkGava = {
    id: starkGava.id,
    namn: starkGava.namn,
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      ark_trad: ['Mystiker']
    }
  };
  deepEqual(
    sandbox.rulesHelper.getCorruptionTrackStats([legacyStarkGava], { viljestark: 15 }),
    { viljestark: 15, korruptionstroskel: 15, styggelsetroskel: 20 },
    'Legacy-post utan regler ska läsa regeldata via lookupEntry'
  );
  deepEqual(
    sandbox.storeHelper.calcCorruptionTrackStats(
      [
        { ...starkGava, nivå: 'Novis' },
        { ...motstandskraft },
        { ...sjalastark }
      ],
      13
    ),
    { viljestark: 13, korruptionstroskel: 14, styggelsetroskel: 19 },
    'storeHelper ska använda central regelberäkning för korruptionsspåret'
  );
}

function verifyCarryCapacityRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const traits = readEntryDataFile(rootPath, 'data/sardrag.json');
  const allEntries = [...advantages, ...disadvantages, ...traits];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const packasna = findByName(advantages, 'Packåsna');
  const hafspackare = findByName(disadvantages, 'Hafspackare');

  [
    ['Packåsna', packasna],
    ['Hafspackare', hafspackare]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för bärkapacitets-verifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(packasna),
    {
      andrar: [
        {
          mal: 'barkapacitet_faktor',
          satt: 'ersatt',
          varde: 1.5
        }
      ],
      krockar: [
        {
          namn: 'Hafspackare'
        }
      ]
    },
    'Packåsna ska ha faktorstyrd bärkapacitet'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(hafspackare),
    {
      andrar: [
        {
          mal: 'barkapacitet_faktor',
          satt: 'ersatt',
          varde: 0.5
        }
      ],
      krockar: [
        {
          namn: 'Packåsna',
          varde: 'packasna_hafspackare'
        }
      ]
    },
    'Hafspackare ska ha faktorstyrd bärkapacitet'
  );
  const packConflictReasons = sandbox.rulesHelper.getConflictReasonsForCandidate(
    { ...packasna },
    [{ ...hafspackare }]
  );
  assert(
    packConflictReasons.length >= 1
      && packConflictReasons.some(r => r.sourceEntryName === 'Packåsna' && r.targetEntryName === 'Hafspackare')
      || (packConflictReasons.length >= 1
        && packConflictReasons.some(r => r.sourceEntryName === 'Hafspackare' && r.targetEntryName === 'Packåsna')),
    'Packåsna ska ge regelstyrd konflikt mot Hafspackare'
  );

  const hafsConflictReasons = sandbox.rulesHelper.getConflictReasonsForCandidate(
    { ...hafspackare },
    [{ ...packasna }]
  );
  assert(
    hafsConflictReasons.length >= 1
      && hafsConflictReasons.some(r =>
        (r.sourceEntryName === 'Hafspackare' && r.targetEntryName === 'Packåsna')
        || (r.sourceEntryName === 'Packåsna' && r.targetEntryName === 'Hafspackare')),
    'Hafspackare ska ge regelstyrd konflikt mot Packåsna'
  );

  assert(
    sandbox.rulesHelper.getCarryCapacityBase([], { stark: 10 }) === 13,
    'Grundberäkning för bärkapacitet ska vara Stark + 3'
  );
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([{ ...packasna }], { stark: 10 }) === 18,
    'Packåsna ska ge bärkapacitet enligt Stark ×1,5 + 3'
  );
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([{ ...hafspackare }], { stark: 10 }) === 8,
    'Hafspackare ska ge bärkapacitet enligt Stark ×0,5 + 3 avrundat uppåt'
  );

  const customCarrier = {
    id: 'test-carry-1',
    namn: 'Bärjätte',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'barkapacitet_faktor', satt: 'ersatt', varde: 2 },
          { mal: 'barkapacitet_tillagg', satt: 'add', varde: 2 }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([customCarrier], { stark: 10 }) === 25,
    'Nya poster med barkapacitet_faktor och barkapacitet_tillagg ska fungera utan kodändring'
  );

  const customFlatBonus = {
    id: 'test-carry-2',
    namn: 'Bärremmar',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'barkapacitet_tillagg', satt: 'add', varde: 2 }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([customFlatBonus], { stark: 10 }) === 15,
    'Flat +X på bärkapacitet ska kunna läggas till via barkapacitet_tillagg'
  );
  const customCarryFormula = {
    id: 'test-carry-3',
    namn: 'Delad packning',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'barkapacitet_tillagg',
            satt: 'add',
            formel: {
              bas: 'stark',
              division: 5,
              avrunda: 'nedat'
            }
          },
          {
            mal: 'barkapacitet_bas',
            satt: 'add',
            formel: {
              bas: 'aktuell_barkapacitet_bas',
              division: 2,
              avrunda: 'nedat'
            }
          }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([customCarryFormula], { stark: 10 }) === 22,
    'Bärkapacitet ska stödja generisk formel med division/faktorbas'
  );

  const legacyBaseOverride = {
    id: 'test-carry-legacy-1',
    namn: 'Bärost',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'barkapacitet_bas', satt: 'add', varde: 2 }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([legacyBaseOverride], { stark: 10 }) === 15,
    'Legacy-regeln barkapacitet_bas ska fortsätta fungera'
  );

  const legacyPackasna = {
    id: packasna.id,
    namn: packasna.namn,
    taggar: {
      typ: ['Fördel'],
      ark_trad: [],
      test: []
    }
  };
  assert(
    sandbox.rulesHelper.getCarryCapacityBase([legacyPackasna], { stark: 10 }) === 18,
    'Legacy-post utan regler ska läsa regeldata via lookupEntry för bärkapacitet'
  );
  const legacyConflictReasons = sandbox.rulesHelper.getConflictReasonsForCandidate(
    legacyPackasna,
    [{ ...hafspackare }]
  );
  assert(
    legacyConflictReasons.length >= 1
      && legacyConflictReasons.some(r => r.targetEntryName === 'Hafspackare' || r.sourceEntryName === 'Hafspackare'),
    'Legacy Packåsna utan regler ska läsa konfliktregel via lookupEntry'
  );
  assert(
    sandbox.storeHelper.calcCarryCapacity(10, [{ ...packasna }]) === 18,
    'storeHelper ska använda regler för bärkapacitet'
  );
}

function verifyRequirementRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const traits = readEntryDataFile(rootPath, 'data/sardrag.json');
  const allEntries = [...advantages, ...traits];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = () => false;
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const rawstyrka = findByName(advantages, 'Råstyrka');
  const robust = findByName(traits, 'Robust');

  [
    ['Råstyrka', rawstyrka],
    ['Robust', robust]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för krav-verifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(rawstyrka),
    {
      kraver: [
        {
          nar: {
            har_namn: ['Robust']
          },
          varde: 'rawstyrka_robust'
        }
      ]
    },
    'Råstyrka ska ha regelstyrt krav på Robust'
  );
  assert(
    typeof sandbox.rulesHelper.getMissingRequirementReasonsForCandidate === 'function',
    'rulesHelper ska exponera getMissingRequirementReasonsForCandidate'
  );
  assert(
    typeof sandbox.rulesHelper.hasEntryAtLeastLevel === 'function',
    'rulesHelper ska exponera hasEntryAtLeastLevel'
  );
  assert(
    typeof sandbox.rulesHelper.getRequirementDependents === 'function',
    'rulesHelper ska exponera getRequirementDependents'
  );
  assert(
    typeof sandbox.rulesHelper.getRequirementEffectsForCandidate === 'function',
    'rulesHelper ska exponera getRequirementEffectsForCandidate'
  );

  const missingReasons = sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(
    { ...rawstyrka },
    []
  );
  assert(
    missingReasons.length === 1
      && missingReasons[0].code === 'rawstyrka_robust'
      && Array.isArray(missingReasons[0].missingNames)
      && missingReasons[0].missingNames.includes('Robust'),
    'Råstyrka ska ge krav-reason när Robust saknas'
  );

  deepEqual(
    sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(
      { ...rawstyrka },
      [{ ...robust, nivå: 'Novis' }]
    ),
    [],
    'Råstyrka ska vara tillåten när Robust finns i listan'
  );
  deepEqual(
    sandbox.rulesHelper.getRequirementDependents(
      [{ ...robust, nivå: 'Novis' }, { ...rawstyrka }],
      { ...robust, nivå: 'Novis' }
    ),
    ['Råstyrka'],
    'Råstyrka ska bli beroende när Robust tas bort'
  );
  deepEqual(
    sandbox.rulesHelper.getRequirementDependents(
      [{ ...robust, nivå: 'Novis' }, { ...robust, nivå: 'Gesäll' }, { ...rawstyrka }],
      { ...robust, nivå: 'Novis' }
    ),
    [],
    'Råstyrka ska inte bli beroende när Robust finns kvar på annan rad'
  );

  const legacyRawstyrka = {
    id: rawstyrka.id,
    namn: rawstyrka.namn,
    taggar: {
      typ: ['Fördel'],
      test: ['Stark']
    }
  };
  const legacyReasons = sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(
    legacyRawstyrka,
    []
  );
  assert(
    legacyReasons.length === 1 && legacyReasons[0].code === 'rawstyrka_robust',
    'Legacy Råstyrka utan regler ska läsa kravregel via lookupEntry'
  );

  const customRequirement = {
    id: 'test-krav-1',
    namn: 'Sköldteknik',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver: [
          {
            nar: {
              har_namn: ['Sköldträning']
            },
            varde: 'test_krav_1'
          }
        ]
      }
    }
  };
  const customMissing = sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(customRequirement, []);
  assert(
    customMissing.length === 1
      && customMissing[0].code === 'test_krav_1'
      && customMissing[0].missingNames.includes('Sköldträning'),
    'Nya poster med kraver-regler ska fungera utan kodändring'
  );
  deepEqual(
    sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(
      customRequirement,
      [{ namn: 'Sköldträning' }]
    ),
    [],
    'Generisk kraver-regel ska lösas när kravet finns i listan'
  );
  deepEqual(
    sandbox.rulesHelper.getRequirementDependents(
      [{ namn: 'Sköldträning' }, customRequirement],
      { namn: 'Sköldträning' }
    ),
    ['Sköldteknik'],
    'Generisk kraver-regel ska ge beroende vid borttagning'
  );

  const customLevelRequirement = {
    id: 'test-krav-2',
    namn: 'Traditionsmask',
    taggar: {
      typ: ['Lägre Artefakt'],
      regler: {
        kraver_logik: 'and',
        kraver: [
          { namn: ['Blodvadare'], else: { pengar_multiplikator: 10, erf_multiplikator: 10 } },
          { namn: ['Häxkonster'], nivå_minst: 'Gesäll', else: { pengar_multiplikator: 10, erf_multiplikator: 10 } }
        ]
      }
    }
  };
  const levelMissingNone = sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(
    customLevelRequirement,
    [{ namn: 'Blodvadare' }, { namn: 'Häxkonster', nivå: 'Novis' }]
  );
  assert(
    levelMissingNone.length === 1
      && Array.isArray(levelMissingNone[0].missingLevelRequirements)
      && levelMissingNone[0].missingLevelRequirements.some(req => req.name === 'Häxkonster' && req.minLevelName === 'Gesäll'),
    'Kraver namn + nivå_minst ska blockera när nivån är för låg'
  );
  deepEqual(
    sandbox.rulesHelper.getMissingRequirementReasonsForCandidate(
      customLevelRequirement,
      [{ namn: 'Blodvadare' }, { namn: 'Häxkonster', nivå: 'Gesäll' }]
    ),
    [],
    'Kraver namn + nivå_minst ska släppa igenom när nivån uppfylls'
  );
  assert(
    sandbox.rulesHelper.hasEntryAtLeastLevel(
      [{ namn: 'Häxkonster', nivå: 'Mästare' }],
      'Häxkonster',
      'Gesäll'
    ).ok === true,
    'hasEntryAtLeastLevel ska kunna verifiera nivåparitet'
  );
  assert(
    sandbox.rulesHelper.hasEntryAtLeastLevel(
      [{ namn: 'Häxkonster', nivå: 'Novis' }],
      'Häxkonster',
      'Gesäll'
    ).ok === false,
    'hasEntryAtLeastLevel ska ge false när nivån är för låg'
  );
  const failedRequirementEffects = sandbox.rulesHelper.getRequirementEffectsForCandidate(
    customLevelRequirement,
    [{ namn: 'Blodvadare' }, { namn: 'Häxkonster', nivå: 'Novis' }]
  );
  assert(
    failedRequirementEffects.met === false
      && failedRequirementEffects.moneyMultiplier === 10
      && failedRequirementEffects.erfMultiplier === 10,
    'kraver else ska kunna sätta pengar/erf-multiplikator vid missat krav'
  );
  const passedRequirementEffects = sandbox.rulesHelper.getRequirementEffectsForCandidate(
    customLevelRequirement,
    [{ namn: 'Blodvadare' }, { namn: 'Häxkonster', nivå: 'Gesäll' }]
  );
  assert(
    passedRequirementEffects.met === true
      && passedRequirementEffects.moneyMultiplier === 1
      && passedRequirementEffects.erfMultiplier === 1,
    'kraver else ska inte appliceras när kravet är uppfyllt'
  );
  const erfScaledEntry = {
    id: 'test-krav-3',
    namn: 'Kravförmåga',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver: [
          {
            namn: ['Robust'],
            else: { erf_multiplikator: 10 }
          }
        ]
      }
    }
  };
  assert(
    sandbox.storeHelper.calcEntryDisplayXP(erfScaledEntry, []) === 100,
    'kraver else med erf_multiplikator ska påverka visad XP-kostnad'
  );
  assert(
    sandbox.storeHelper.calcEntryDisplayXP(erfScaledEntry, [{ ...robust, nivå: 'Novis' }]) === 10,
    'kraver else med erf_multiplikator ska upphöra när kravet uppfylls'
  );
  deepEqual(
    sandbox.storeHelper.getDependents(
      [{ ...robust, nivå: 'Novis' }, { ...rawstyrka }],
      { ...robust, nivå: 'Novis' }
    ),
    ['Råstyrka'],
    'storeHelper.getDependents ska använda regelstyrda kravberoenden'
  );
}

function verifyRequirementScopeLogic(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const helper = sandbox.rulesHelper;
  const missing = (entry, list = [], level = '') => helper.getMissingRequirementReasonsForCandidate(entry, list, { level });

  const attachTypeRules = (entry, typeRules) => {
    try {
      Object.defineProperty(entry, '__typ_regler', {
        value: typeRules,
        configurable: true,
        writable: true,
        enumerable: false
      });
    } catch (_) {
      entry.__typ_regler = typeRules;
    }
    return entry;
  };

  const typeOnlyRules = {
    'Förmåga': {
      regler: {
        kraver: [
          { nar: { har_namn: ['Monster'] }, varde: 'type_monster' }
        ]
      }
    }
  };
  const typeOnly = attachTypeRules({
    id: 'req-scope-type-only',
    namn: 'TypeOnly',
    taggar: { typ: ['Förmåga'] }
  }, typeOnlyRules);
  assert(missing(typeOnly, []).length === 1, 'Endast typkrav ska blockera när typkravet saknas');
  assert(missing(typeOnly, [{ namn: 'Monster' }]).length === 0, 'Endast typkrav ska passera när typkravet uppfylls');

  const entryOnly = {
    id: 'req-scope-entry-only',
    namn: 'EntryOnly',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver: [
          { nar: { har_namn: ['Robust'] }, varde: 'entry_robust' }
        ]
      }
    }
  };
  assert(missing(entryOnly, []).length === 1, 'Endast entrykrav ska blockera när entrykravet saknas');
  assert(missing(entryOnly, [{ namn: 'Robust' }]).length === 0, 'Endast entrykrav ska passera när entrykravet uppfylls');

  const entryOr = {
    id: 'req-scope-entry-or',
    namn: 'EntryOr',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver_logik: 'or',
        kraver: [
          { nar: { har_namn: ['A'] }, varde: 'entry_a' },
          { nar: { har_namn: ['B'] }, varde: 'entry_b' }
        ]
      }
    }
  };
  assert(missing(entryOr, [{ namn: 'A' }]).length === 0, 'Entry OR ska passera när en gren uppfylls');
  assert(missing(entryOr, []).length === 2, 'Entry OR ska ge reasons för båda grenar när båda saknas');

  const entryAnd = {
    id: 'req-scope-entry-and',
    namn: 'EntryAnd',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver_logik: 'and',
        kraver: [
          { nar: { har_namn: ['A'] }, varde: 'entry_a' },
          { nar: { har_namn: ['B'] }, varde: 'entry_b' }
        ]
      }
    }
  };
  assert(missing(entryAnd, [{ namn: 'A' }]).length === 1, 'Entry AND ska blockera när en del saknas');
  assert(missing(entryAnd, [{ namn: 'A' }, { namn: 'B' }]).length === 0, 'Entry AND ska passera när båda delkrav uppfylls');

  const typeOrRules = {
    'Förmåga': {
      regler: {
        kraver_logik: 'or',
        kraver: [
          { nar: { har_namn: ['A'] }, varde: 'type_a' },
          { nar: { har_namn: ['B'] }, varde: 'type_b' }
        ]
      }
    }
  };
  const typeOr = attachTypeRules({
    id: 'req-scope-type-or',
    namn: 'TypeOr',
    taggar: { typ: ['Förmåga'] }
  }, typeOrRules);
  assert(missing(typeOr, [{ namn: 'A' }]).length === 0, 'Type OR ska passera när en gren uppfylls');
  assert(missing(typeOr, []).length === 2, 'Type OR ska ge reasons när båda grenar saknas');

  const typeAndRules = {
    'Förmåga': {
      regler: {
        kraver_logik: 'and',
        kraver: [
          { nar: { har_namn: ['A'] }, varde: 'type_a' },
          { nar: { har_namn: ['B'] }, varde: 'type_b' }
        ]
      }
    }
  };
  const typeAnd = attachTypeRules({
    id: 'req-scope-type-and',
    namn: 'TypeAnd',
    taggar: { typ: ['Förmåga'] }
  }, typeAndRules);
  assert(missing(typeAnd, [{ namn: 'A' }]).length === 1, 'Type AND ska blockera när en gren saknas');
  assert(missing(typeAnd, [{ namn: 'A' }, { namn: 'B' }]).length === 0, 'Type AND ska passera när båda grenar uppfylls');

  const combinedAndOr = {
    id: 'req-combined-and-or',
    namn: 'CombinedAndOr',
    taggar: {
      typ: ['Monstruöst särdrag'],
      regler: {
        kraver_logik: 'and',
        kraver: [
          { nar: { nagon_av_namn: ['Vandöd', 'Best', 'Andebesvärjare'] }, varde: 'req_source' },
          { namn: ['Andeform'], varde: 'req_form' }
        ]
      }
    }
  };
  assert(
    missing(combinedAndOr, [{ namn: 'Best' }, { namn: 'Andeform' }]).length === 0,
    '(A OR B OR C) AND D ska passera när både OR-grupp och D uppfylls'
  );
  assert(
    missing(combinedAndOr, [{ namn: 'Andeform' }]).length === 1,
    '(A OR B OR C) AND D ska blockera när OR-gruppen saknas'
  );
  assert(
    missing(combinedAndOr, [{ namn: 'Best' }]).length === 1,
    '(A OR B OR C) AND D ska blockera när D saknas'
  );

  const levelCombined = {
    id: 'req-level-combined',
    namn: 'LevelCombined',
    taggar: {
      typ: ['Monstruöst särdrag'],
      regler: {
        kraver_logik: 'and',
        kraver: [
          { nar: { nagon_av_namn: ['Vandöd', 'Best', 'Andebesvärjare'] }, varde: 'req_source' },
          { namn: ['Andeform'], nivå_minst: 'Novis', varde: 'req_form_level' }
        ]
      }
    }
  };
  assert(
    missing(levelCombined, [{ namn: 'Best' }, { namn: 'Andeform', nivå: 'Novis' }]).length === 0,
    'Nivåkrav + kombinerad AND/OR ska passera vid tillräcklig nivå'
  );
  assert(
    missing(levelCombined, [{ namn: 'Best' }, { namn: 'Andeform', nivå: '' }]).length === 1,
    'Nivåkrav + kombinerad AND/OR ska blockera vid för låg nivå'
  );

  const typeEntryBaseRules = {
    'Förmåga': {
      regler: {
        kraver: [
          { nar: { har_namn: ['Monster'] }, varde: 'type_monster' }
        ]
      }
    }
  };
  const typeEntryOr = attachTypeRules({
    id: 'req-type-entry-or',
    namn: 'TypeEntryOr',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver: [
          { namn: ['Väldig'], nivå_minst: 'Novis', varde: 'entry_valdig' }
        ]
      }
    }
  }, typeEntryBaseRules);
  assert(missing(typeEntryOr, [{ namn: 'Monster' }]).length === 0, 'Type+Entry OR ska passera med enbart type-krav');
  assert(missing(typeEntryOr, [{ namn: 'Väldig', nivå: 'Novis' }]).length === 0, 'Type+Entry OR ska passera med enbart entry-krav');

  const typeEntryAnd = attachTypeRules({
    id: 'req-type-entry-and',
    namn: 'TypeEntryAnd',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        kraver_typ_och_entry: 'and',
        kraver: [
          { namn: ['Väldig'], nivå_minst: 'Novis', varde: 'entry_valdig' }
        ]
      }
    }
  }, typeEntryBaseRules);
  const andMissingMonsterOnly = missing(typeEntryAnd, [{ namn: 'Monster' }]);
  assert(andMissingMonsterOnly.length === 1, 'Type+Entry AND ska blockera när entry-kravet saknas');
  const andMissingValdigOnly = missing(typeEntryAnd, [{ namn: 'Väldig', nivå: 'Novis' }]);
  assert(andMissingValdigOnly.length === 1, 'Type+Entry AND ska blockera när type-kravet saknas');
  assert(
    missing(typeEntryAnd, [{ namn: 'Monster' }, { namn: 'Väldig', nivå: 'Novis' }]).length === 0,
    'Type+Entry AND ska passera när båda scope uppfylls'
  );
}

function verifyRaceConflictRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const races = readEntryDataFile(rootPath, 'data/ras.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const allEntries = [...races, ...disadvantages];
  sandbox.DB = allEntries;

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = (entry) => {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.includes('Ras');
  };
  sandbox.isSardrag = (entry) => (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []).includes('Särdrag');
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const dvarg = findByName(races, 'Dvärg');
  const korruptionskanslig = findByName(disadvantages, 'Korruptionskänslig');

  [
    ['Dvärg', dvarg],
    ['Korruptionskänslig', korruptionskanslig]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för ras-konfliktverifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getRuleList(dvarg, 'krockar'),
    [
      {
        namn: 'Korruptionskänslig',
        satt: 'ersatt',
        varde: 'dvarg_korruptionskanslig'
      }
    ],
    'Dvärg ska ha regelstyrd krock mot Korruptionskänslig'
  );
  assert(
    typeof sandbox.rulesHelper.getConflictResolutionForCandidate === 'function',
    'rulesHelper ska exponera getConflictResolutionForCandidate'
  );

  const addDvargResolution = sandbox.rulesHelper.getConflictResolutionForCandidate(
    { ...dvarg },
    [{ ...korruptionskanslig }]
  );
  deepEqual(
    addDvargResolution.blockingReasons,
    [],
    'Dvärg ska inte blockeras när den ersätter Korruptionskänslig'
  );
  deepEqual(
    addDvargResolution.replaceTargetNames,
    ['Korruptionskänslig'],
    'Dvärg ska ersätta Korruptionskänslig via regler'
  );

  const addDisadvantageResolution = sandbox.rulesHelper.getConflictResolutionForCandidate(
    { ...korruptionskanslig },
    [{ ...dvarg }]
  );
  assert(
    addDisadvantageResolution.blockingReasons.length === 1
      && addDisadvantageResolution.blockingReasons[0].code === 'dvarg_korruptionskanslig',
    'Korruptionskänslig ska blockeras när Dvärg finns'
  );
  deepEqual(
    addDisadvantageResolution.replaceTargetNames,
    [],
    'Korruptionskänslig ska inte ersätta Dvärg'
  );

  const legacyDvarg = {
    id: dvarg.id,
    namn: dvarg.namn,
    taggar: {
      typ: ['Ras']
    }
  };
  const legacyResolution = sandbox.rulesHelper.getConflictResolutionForCandidate(
    legacyDvarg,
    [{ ...korruptionskanslig }]
  );
  deepEqual(
    legacyResolution.replaceTargetNames,
    ['Korruptionskänslig'],
    'Legacy Dvärg utan regler ska läsa ersättningskrock via lookupEntry'
  );

  const store = {
    current: 'race-conflict-test',
    characters: [{ id: 'race-conflict-test', name: 'Race Conflict Test' }],
    folders: [],
    data: {
      'race-conflict-test': {
        list: [],
        inventory: [],
        custom: [],
        privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
        possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
        bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
      }
    }
  };
  sandbox.storeHelper.setCurrentList(store, [{ ...korruptionskanslig }, { ...dvarg }]);
  const afterDvargAdds = sandbox.storeHelper.getCurrentList(store).map(entry => entry.namn);
  assert(
    afterDvargAdds.includes('Dvärg'),
    'setCurrentList ska behålla Dvärg när den ersätter Korruptionskänslig'
  );
  assert(
    !afterDvargAdds.includes('Korruptionskänslig'),
    'setCurrentList ska ta bort Korruptionskänslig när Dvärg läggs till'
  );
  sandbox.storeHelper.setCurrentList(store, [{ ...dvarg }, { ...korruptionskanslig }]);
  const afterDisadvantageAdds = sandbox.storeHelper.getCurrentList(store).map(entry => entry.namn);
  assert(
    afterDisadvantageAdds.includes('Dvärg'),
    'setCurrentList ska behålla Dvärg om Korruptionskänslig läggs till efteråt'
  );
  assert(
    !afterDisadvantageAdds.includes('Korruptionskänslig'),
    'setCurrentList ska fortsatt blockera Korruptionskänslig när Dvärg redan finns'
  );
}

function verifyInventoryGrantRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const misc = readEntryDataFile(rootPath, 'data/diverse.json');
  const elixirs = readEntryDataFile(rootPath, 'data/elixir.json');
  const instruments = readEntryDataFile(rootPath, 'data/instrument.json');
  const allEntries = [...advantages, ...misc, ...elixirs, ...instruments];
  sandbox.DB = allEntries;

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = (entry) => {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.includes('Ras');
  };
  sandbox.isSardrag = (entry) => (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []).includes('Särdrag');
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const wellEquipped = findByName(advantages, 'Välutrustad');
  assert(wellEquipped, 'Hittade inte Välutrustad i data/fordel.json');

  const topGrantRules = sandbox.rulesHelper.getRuleList(wellEquipped, 'ger');
  assert(topGrantRules.length === 1, 'Välutrustad ska ha exakt en ger-regel');
  assert(topGrantRules[0]?.mal === 'foremal', 'Välutrustad ger-regel ska använda mal=foremal');
  assert(Array.isArray(topGrantRules[0]?.foremal), 'Välutrustad foremal-regel ska ha foremal-lista');

  assert(
    typeof sandbox.rulesHelper.getInventoryGrantItems === 'function',
    'rulesHelper ska exponera getInventoryGrantItems'
  );

  const expectedGrantMap = {
    di12: 3,
    di23: 1,
    di18: 1,
    di5: 3,
    i11: 1,
    elix34: 3,
    elix43: 3
  };

  const assertGrantMap = (actualMap, messagePrefix) => {
    const expectedKeys = Object.keys(expectedGrantMap).sort();
    const actualKeys = Object.keys(actualMap || {}).sort();
    assert(
      JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
      `${messagePrefix}: fel uppsättning item-id`
    );
    expectedKeys.forEach(id => {
      assert(
        Number(actualMap[id] || 0) === Number(expectedGrantMap[id]),
        `${messagePrefix}: fel mängd för ${id}`
      );
    });
  };

  const topRuleGrantMap = {};
  topGrantRules[0].foremal.forEach(item => {
    const id = String(item?.id || '').trim();
    if (!id) return;
    topRuleGrantMap[id] = (topRuleGrantMap[id] || 0) + (Number(item?.antal) || 0);
  });
  assertGrantMap(topRuleGrantMap, 'Välutrustad foremal-regel');

  const grantMap = {};
  sandbox.rulesHelper.getInventoryGrantItems([{ ...wellEquipped }]).forEach(item => {
    const id = String(item?.id || '').trim();
    if (!id) return;
    grantMap[id] = (grantMap[id] || 0) + (Number(item?.qty) || 0);
    assert(
      item.sourceEntryName === 'Välutrustad',
      'Inventarie-grants ska bära med källnamnet Välutrustad'
    );
  });
  assertGrantMap(grantMap, 'Välutrustad inventarie-grants');

  const store = {
    current: 'inventory-grant-test',
    characters: [{ id: 'inventory-grant-test', name: 'Inventory Grant Test' }],
    folders: [],
    data: {
      'inventory-grant-test': {
        list: [],
        inventory: [
          {
            id: 'di12',
            name: 'Rep, 10 meter',
            qty: 1,
            gratis: 0,
            kvaliteter: [],
            gratisKval: [],
            removedKval: []
          }
        ],
        custom: [],
        privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
        possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
        bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
      }
    }
  };

  sandbox.storeHelper.setCurrentList(store, [{ ...wellEquipped }]);
  const withGrants = sandbox.storeHelper.getInventory(store);

  const repRow = withGrants.find(row => row && row.id === 'di12');
  assert(repRow, 'Rep-raden ska finnas kvar efter Välutrustad-grant');
  assert(repRow.qty === 4, 'Rep-raden ska behålla manuellt 1 + ge 3 från grant');
  assert(repRow.gratis === 3, 'Rep-raden ska ge 3 gratis från grant');
  assert(repRow.perk === 'Välutrustad', 'Rep-raden ska markeras med regelkälla Välutrustad');
  assert(repRow.perkGratis === 3, 'Rep-raden ska spara grantmängd i perkGratis');

  const activeGrantMap = {};
  withGrants.forEach(row => {
    if (!row || row.perk !== 'Välutrustad') return;
    const id = String(row.id || '').trim();
    if (!id) return;
    activeGrantMap[id] = (activeGrantMap[id] || 0) + (Number(row.perkGratis) || 0);
  });
  assertGrantMap(activeGrantMap, 'setCurrentList inventarie-grants');

  sandbox.storeHelper.setCurrentList(store, []);
  const withoutGrants = sandbox.storeHelper.getInventory(store);
  const repAfterRemoval = withoutGrants.find(row => row && row.id === 'di12');
  assert(repAfterRemoval, 'Rep-raden ska finnas kvar efter att grant tas bort');
  assert(repAfterRemoval.qty === 1, 'Rep-raden ska återgå till manuell mängd när grant tas bort');
  assert(repAfterRemoval.gratis === 0, 'Rep-raden ska återgå till manuell gratis-mängd när grant tas bort');
  assert(!repAfterRemoval.perk, 'Rep-raden ska inte ha kvar perk-källa efter borttag');
  assert(!repAfterRemoval.perkGratis, 'Rep-raden ska inte ha kvar perkGratis efter borttag');
  assert(
    withoutGrants.every(row => !(row && Number(row.perkGratis || 0) > 0)),
    'Inga regelstyrda grantmängder ska finnas kvar efter att Välutrustad tagits bort'
  );
}

function verifyEntryGrantRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const allEntries = [...advantages, ...disadvantages];
  sandbox.DB = allEntries;

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = (entry) => {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.includes('Ras');
  };
  sandbox.isSardrag = (entry) => (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []).includes('Särdrag');
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;
  sandbox.isMonstrousTrait = (entry) => {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.includes('Monstruöst särdrag');
  };

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const darkBlood = findByName(advantages, 'Mörkt blod');
  const darkPast = findByName(disadvantages, 'Mörkt förflutet');

  [
    ['Mörkt blod', darkBlood],
    ['Mörkt förflutet', darkPast]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för post-grant-verifiering`);
  });

  const darkBloodGrantRules = sandbox.rulesHelper.getRuleList(darkBlood, 'ger');
  assert(darkBloodGrantRules.length >= 1, 'Mörkt blod ska ha minst en ger-regel');
  const postRule = darkBloodGrantRules.find(r => r?.mal === 'post');
  assert(postRule, 'Mörkt blod ska använda mal=post för auto-grant');
  deepEqual(
    postRule?.namn || [],
    ['Mörkt förflutet'],
    'Mörkt blod ska auto-granta Mörkt förflutet via regler'
  );

  assert(
    typeof sandbox.rulesHelper.getEntryGrantTargets === 'function',
    'rulesHelper ska exponera getEntryGrantTargets'
  );
  assert(
    typeof sandbox.rulesHelper.getEntryGrantDependents === 'function',
    'rulesHelper ska exponera getEntryGrantDependents'
  );

  const helperTargets = sandbox.rulesHelper.getEntryGrantTargets([{ ...darkBlood }]);
  assert(helperTargets.length === 1, 'Mörkt blod ska ge exakt ett post-grantmål');
  assert(
    helperTargets[0]?.sourceEntryName === 'Mörkt blod' && helperTargets[0]?.name === 'Mörkt förflutet',
    'getEntryGrantTargets ska hitta Mörkt blod -> Mörkt förflutet'
  );
  // Mörkt blod -> Mörkt förflutet kan vara gratis i nuvarande data

  deepEqual(
    sandbox.rulesHelper.getEntryGrantDependents(
      [{ ...darkBlood }, { ...darkPast }],
      { ...darkBlood }
    ),
    ['Mörkt förflutet'],
    'getEntryGrantDependents ska hitta beroendet Mörkt blod -> Mörkt förflutet'
  );

  const baseStoreData = {
    list: [],
    inventory: [],
    custom: [],
    privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
  };
  const createStore = (overrides = {}) => ({
    current: 'entry-grant-test',
    characters: [{ id: 'entry-grant-test', name: 'Entry Grant Test' }],
    folders: [],
    data: {
      'entry-grant-test': {
        ...baseStoreData,
        ...overrides
      }
    }
  });

  const autoGrantStore = createStore();
  sandbox.storeHelper.setCurrentList(autoGrantStore, [{ ...darkBlood }]);
  deepEqual(
    sandbox.storeHelper.getCurrentList(autoGrantStore).map(entry => entry.namn).sort((a, b) => a.localeCompare(b, 'sv')),
    ['Mörkt blod', 'Mörkt förflutet'],
    'setCurrentList ska auto-lägga till Mörkt förflutet från Mörkt blod-regeln'
  );
  deepEqual(
    sandbox.storeHelper.getDependents(
      sandbox.storeHelper.getCurrentList(autoGrantStore),
      { ...darkBlood }
    ),
    ['Mörkt förflutet'],
    'storeHelper.getDependents ska använda regelstyrda post-grants'
  );

  const suppressionStore = createStore({
    list: [{ ...darkBlood }, { ...darkPast }]
  });
  sandbox.storeHelper.setCurrentList(suppressionStore, [{ ...darkBlood }]);
  deepEqual(
    sandbox.storeHelper.getCurrentList(suppressionStore).map(entry => entry.namn),
    ['Mörkt blod'],
    'Mörkt förflutet ska kunna tas bort utan omedelbar återläggning'
  );
  assert(
    suppressionStore.data['entry-grant-test'].darkPastSuppressed === true,
    'Mörkt blod-suppression ska lagras kompatibelt i darkPastSuppressed'
  );
  assert(
    suppressionStore.data['entry-grant-test'].suppressedEntryGrants
      && Array.isArray(suppressionStore.data['entry-grant-test'].suppressedEntryGrants['Mörkt blod'])
      && suppressionStore.data['entry-grant-test'].suppressedEntryGrants['Mörkt blod'].includes('name:morkt forflutet'),
    'Mörkt blod-suppression ska lagras generiskt i suppressedEntryGrants'
  );

  sandbox.storeHelper.setCurrentList(suppressionStore, [{ ...darkBlood }]);
  deepEqual(
    sandbox.storeHelper.getCurrentList(suppressionStore).map(entry => entry.namn),
    ['Mörkt blod'],
    'Suppression ska hindra återläggning så länge Mörkt blod finns kvar'
  );

  sandbox.storeHelper.setCurrentList(suppressionStore, []);
  assert(
    suppressionStore.data['entry-grant-test'].darkPastSuppressed === false,
    'Suppression ska återställas när Mörkt blod tas bort'
  );

  sandbox.storeHelper.setCurrentList(suppressionStore, [{ ...darkBlood }]);
  deepEqual(
    sandbox.storeHelper.getCurrentList(suppressionStore).map(entry => entry.namn).sort((a, b) => a.localeCompare(b, 'sv')),
    ['Mörkt blod', 'Mörkt förflutet'],
    'Mörkt förflutet ska auto-läggas igen när Mörkt blod väljs efter reset'
  );

  const legacySuppressedStore = createStore({
    list: [{ ...darkBlood }],
    darkPastSuppressed: true
  });
  sandbox.storeHelper.setCurrentList(legacySuppressedStore, [{ ...darkBlood }]);
  deepEqual(
    sandbox.storeHelper.getCurrentList(legacySuppressedStore).map(entry => entry.namn),
    ['Mörkt blod'],
    'Legacy darkPastSuppressed ska fortsatt hindra auto-grant'
  );
}

function verifyToughnessRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const abilities = readEntryDataFile(rootPath, 'data/formaga.json');
  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const allEntries = [...abilities, ...advantages];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const kraftprov = findByName(abilities, 'Kraftprov');
  const hardnackad = findByName(advantages, 'Hårdnackad');

  [
    ['Kraftprov', kraftprov],
    ['Hårdnackad', hardnackad]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för tålighets-verifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(kraftprov, { level: 'Novis' }),
    {
      andrar: [
        {
          mal: 'talighet_bas',
          satt: 'ersatt',
          formel: {
            bas: 'stark',
            tillagg: 5
          }
        }
      ]
    },
    'Kraftprov ska ha regelstyrd tålighetsbas'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(hardnackad),
    {
      andrar: [
        {
          mal: 'talighet_tillagg',
          satt: 'add',
          varde: 1
        }
      ]
    },
    'Hårdnackad ska ha regelstyrd tålighetstillägg'
  );

  assert(
    sandbox.rulesHelper.getToughnessBase([], { stark: 8 }) === 10,
    'Grundberäkning för tålighet ska vara max(10, Stark)'
  );
  assert(
    sandbox.rulesHelper.getToughnessBase([{ ...kraftprov, nivå: 'Novis' }], { stark: 8 }) === 13,
    'Kraftprov ska ersätta tålighetsbasen med Stark + 5'
  );
  assert(
    sandbox.rulesHelper.getToughnessBase([{ ...hardnackad }], { stark: 8 }) === 11,
    'Hårdnackad ska ge +1 tålighet'
  );
  assert(
    sandbox.rulesHelper.getToughnessBase(
      [{ ...kraftprov, nivå: 'Novis' }, { ...hardnackad }],
      { stark: 8 }
    ) === 14,
    'Kraftprov + Hårdnackad ska summeras regelstyrt'
  );

  const customToughnessFormula = {
    id: 'test-tough-1',
    namn: 'Seglivad',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'talighet_tillagg',
            satt: 'add',
            formel: {
              bas: 'aktuell_talighet_bas',
              division: 2,
              avrunda: 'nedat'
            }
          }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getToughnessBase([customToughnessFormula], { stark: 11 }) === 16,
    'Tålighet ska stödja generisk formel med division'
  );

  const legacyKraftprov = {
    id: kraftprov.id,
    namn: kraftprov.namn,
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      ark_trad: ['Krigare'],
      test: ['Stark']
    }
  };
  const legacyHardnackad = {
    id: hardnackad.id,
    namn: hardnackad.namn,
    taggar: {
      typ: ['Fördel'],
      ark_trad: [],
      test: []
    }
  };
  assert(
    sandbox.rulesHelper.getToughnessBase([legacyKraftprov, legacyHardnackad], { stark: 8 }) === 14,
    'Legacy-poster utan regler ska läsa regeldata via lookupEntry för tålighet'
  );
  assert(
    sandbox.storeHelper.calcToughness(8, [{ ...kraftprov, nivå: 'Novis' }, { ...hardnackad }]) === 14,
    'storeHelper ska använda regler för tålighet'
  );
}

function verifyTraitTotalMaxRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const abilities = readEntryDataFile(rootPath, 'data/formaga.json');
  const lowerArtifacts = readEntryDataFile(rootPath, 'data/lagre-artefakter.json');
  const allEntries = [...abilities, ...lowerArtifacts];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const exceptionell = findByName(abilities, 'Exceptionellt karaktärsdrag');
  const djurmask = findByName(lowerArtifacts, 'Djurmask');

  [
    ['Exceptionellt karaktärsdrag', exceptionell],
    ['Djurmask', djurmask]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för max-total-verifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(exceptionell, { level: 'Mästare' }),
    {
      andrar: [
        {
          mal: 'karaktarsdrag_max_tillagg',
          satt: 'add',
          formel: { bas: 'niva' }
        }
      ],
      val: [
        {
          field: 'trait',
          title: 'Välj karaktärsdrag',
          subtitle: 'Välj vilket karaktärsdrag som ska få bonus.',
          options: ['Diskret', 'Kvick', 'Listig', 'Stark', 'Träffsäker', 'Vaksam', 'Viljestark', 'Övertygande'],
          duplicate_policy: 'replace_existing'
        }
      ]
    },
    'Exceptionellt karaktärsdrag ska ha regelstyrd max-total'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(djurmask),
    {
      andrar: [
        {
          mal: 'karaktarsdrag_max_tillagg',
          satt: 'add',
          varde: 1,
          nar: {
            trait: ['Diskret', 'Kvick', 'Listig', 'Stark', 'Vaksam']
          }
        }
      ],
      kraver: [
        {
          namn: ['Blodvadare'],
          meddelande: 'Krav: Blodvadare',
          else: {
            pengar_multiplikator: 10
          }
        },
        {
          namn: ['Häxkonster'],
          nivå_minst: 'Gesäll',
          meddelande: 'Krav: Häxkonster >= Gesäll',
          else: {
            pengar_multiplikator: 10
          }
        }
      ],
      val: [
        {
          field: 'trait',
          title: 'Välj karaktärsdrag',
          subtitle: 'Välj vilket karaktärsdrag som ska få +1.',
          options: ['Diskret', 'Kvick', 'Listig', 'Stark', 'Vaksam'],
          duplicate_policy: 'confirm'
        }
      ]
    },
    'Djurmask ska ha regelstyrd max-total'
  );

  assert(
    sandbox.rulesHelper.getTraitTotalMax([], []) === 80,
    'Grundvärdet för max total av karaktärsdrag ska vara 80'
  );
  assert(
    sandbox.rulesHelper.getTraitTotalMax(
      [{ ...exceptionell, nivå: 'Novis', trait: 'Stark' }],
      []
    ) === 81,
    'Exceptionellt karaktärsdrag Novis ska ge +1 max total'
  );
  assert(
    sandbox.rulesHelper.getTraitTotalMax(
      [{ ...exceptionell, nivå: 'Gesäll', trait: 'Stark' }],
      []
    ) === 82,
    'Exceptionellt karaktärsdrag Gesäll ska ge +2 max total'
  );
  assert(
    sandbox.rulesHelper.getTraitTotalMax(
      [{ ...exceptionell, nivå: 'Mästare', trait: 'Stark' }],
      [{ id: 'l9', name: 'Djurmask', trait: 'Vaksam', qty: 1 }]
    ) === 84,
    'Exceptionellt karaktärsdrag + Djurmask ska summera max total regelstyrt'
  );
  assert(
    sandbox.rulesHelper.getTraitTotalMax([], [{ id: 'l9', name: 'Djurmask', qty: 1 }]) === 80,
    'Djurmask utan valt trait ska inte öka max total'
  );

  const legacyExceptionell = {
    id: exceptionell.id,
    namn: exceptionell.namn,
    nivå: 'Mästare',
    trait: 'Stark',
    taggar: {
      typ: ['Förmåga'],
      ark_trad: ['Krigare']
    }
  };
  const legacyMask = {
    id: djurmask.id,
    name: djurmask.namn,
    trait: 'Diskret',
    qty: 1
  };
  assert(
    sandbox.rulesHelper.getTraitTotalMax([legacyExceptionell], [legacyMask]) === 84,
    'Legacy-poster utan regler ska läsa regeldata via lookupEntry för max total'
  );
  assert(
    sandbox.storeHelper.calcTraitTotalMax(
      [{ ...exceptionell, nivå: 'Gesäll', trait: 'Stark' }],
      [{ id: 'l9', name: 'Djurmask', trait: 'Vaksam', qty: 1 }]
    ) === 83,
    'storeHelper ska använda regler för max total av karaktärsdrag'
  );
}

function verifyPainThresholdRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const traits = readEntryDataFile(rootPath, 'data/sardrag.json');
  const allEntries = [...advantages, ...disadvantages, ...traits];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const smarttalig = findByName(advantages, 'Smärttålig');
  const bracklig = findByName(disadvantages, 'Bräcklig');
  const morktForflutet = findByName(disadvantages, 'Mörkt förflutet');
  const jordnara = findByName(traits, 'Jordnära');

  [
    ['Smärttålig', smarttalig],
    ['Bräcklig', bracklig],
    ['Mörkt förflutet', morktForflutet],
    ['Jordnära', jordnara]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för smärtgräns-verifiering`);
  });

  deepEqual(
    sandbox.rulesHelper.getEntryRules(smarttalig),
    {
      andrar: [
        {
          mal: 'smartgrans_tillagg',
          satt: 'add',
          varde: 1
        }
      ]
    },
    'Smärttålig ska ha regelstyrd smärtgräns-modifiering'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(bracklig),
    {
      andrar: [
        {
          mal: 'smartgrans_tillagg',
          satt: 'add',
          varde: -1
        }
      ]
    },
    'Bräcklig ska ha regelstyrd smärtgräns-modifiering'
  );
  deepEqual(
    sandbox.rulesHelper.getEntryRules(jordnara),
    {
      andrar: [
        {
          mal: 'smartgrans_tillagg',
          satt: 'add',
          formel: {
            bas: 'permanent_korruption',
            division: 2,
            avrunda: 'nedat'
          },
          varde: -1
        },
        {
          mal: 'smartgrans_tillagg',
          satt: 'add',
          formel: {
            bas: 'aktuell_smartgrans',
            division: 4,
            avrunda: 'nedat'
          },
          varde: -1,
          nar: {
            har_namn: ['Mörkt förflutet']
          }
        },
        {
          mal: 'permanent_korruption_faktor',
          varde: 0.5
        }
      ],
      kraver: [{ nar: { nagon_av_namn: ['Dvärg'] } }]
    },
    'Jordnära ska ha regelstyrd smärtgränsöversättning'
  );

  assert(
    sandbox.rulesHelper.getPainThresholdModifier([], { stark: 15 }) === 0,
    'Grundmodifiering av smärtgräns ska vara 0'
  );
  assert(
    sandbox.rulesHelper.getPainThresholdModifier([{ ...smarttalig }], { stark: 15 }) === 1,
    'Smärttålig ska ge +1 på smärtgränsen'
  );
  assert(
    sandbox.rulesHelper.getPainThresholdModifier([{ ...bracklig }], { stark: 15 }) === -1,
    'Bräcklig ska ge -1 på smärtgränsen'
  );
  assert(
    sandbox.rulesHelper.getPainThresholdModifier(
      [{ ...jordnara }],
      { stark: 15, permanent_korruption: 4 }
    ) === -2,
    'Jordnära ska sänka smärtgränsen med hälften av permanent korruption'
  );
  assert(
    sandbox.rulesHelper.getPainThresholdModifier(
      [{ ...jordnara }, { ...morktForflutet }],
      { stark: 15, permanent_korruption: 4 }
    ) === -3,
    'Jordnära + Mörkt förflutet ska ge extra fjärdedel av aktuell smärtgräns'
  );

  const customPainBonus = {
    id: 'test-pain-1',
    namn: 'Stålsinne',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'smartgrans_tillagg', satt: 'add', varde: 2 }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getPainThresholdModifier([customPainBonus], { stark: 15 }) === 2,
    'Nya poster med smartgrans_tillagg ska fungera utan kodändring'
  );
  const customFractionFormula = {
    id: 'test-pain-2',
    namn: 'Kvartsår',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'smartgrans_tillagg',
            satt: 'add',
            formel: {
              bas: 'aktuell_smartgrans',
              division: 4,
              avrunda: 'nedat'
            },
            varde: -1
          }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getPainThresholdModifier([customFractionFormula], { stark: 15 }) === -2,
    'Generisk formel med division ska fungera för smärtgräns'
  );
  const customScaledFormula = {
    id: 'test-pain-3',
    namn: 'Skalfaktor',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'smartgrans_tillagg',
            satt: 'add',
            formel: {
              bas: 'permanent_korruption',
              faktor: 1.5,
              division: 2,
              avrunda: 'nedat'
            },
            varde: -1
          }
        ]
      }
    }
  };
  assert(
    sandbox.rulesHelper.getPainThresholdModifier(
      [customScaledFormula],
      { stark: 15, permanent_korruption: 5 }
    ) === -3,
    'Generisk formel med faktor och division ska fungera'
  );

  const legacySmarttalig = {
    id: smarttalig.id,
    namn: smarttalig.namn,
    taggar: {
      typ: ['Fördel'],
      ark_trad: [],
      test: []
    }
  };
  assert(
    sandbox.rulesHelper.getPainThresholdModifier([legacySmarttalig], { stark: 15 }) === 1,
    'Legacy-post utan regler ska läsa regeldata via lookupEntry för smärtgräns'
  );
  const legacyJordnara = {
    id: jordnara.id,
    namn: jordnara.namn,
    taggar: {
      typ: ['Särdrag'],
      ras: ['Dvärg']
    }
  };
  assert(
    sandbox.rulesHelper.getPainThresholdModifier(
      [legacyJordnara, { ...morktForflutet }],
      { stark: 15, permanent_korruption: 4 }
    ) === -3,
    'Legacy Jordnära ska läsa regeldata via lookupEntry för smärtgränsöversättning'
  );
  assert(
    sandbox.storeHelper.calcPainThreshold(15, [{ ...smarttalig }], { korruptionstroskel: 14 }) === 9,
    'storeHelper ska använda regler för smärtgränsmodifikationer'
  );
  assert(
    sandbox.storeHelper.calcPainThreshold(
      15,
      [{ ...jordnara }, { ...morktForflutet }],
      { korruptionstroskel: 14 }
    ) === 6,
    'storeHelper ska använda regelstyrd Jordnära-översättning för Mörkt förflutet (halverad perm korruption)'
  );
}

function verifyLegacyImportExport(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const store = {
    current: '',
    characters: [],
    folders: [{ id: 'std', name: 'Standard', system: true, order: 0 }],
    data: {}
  };

  const payload = {
    name: 'Legacy Hero',
    data: {
      list: [
        {
          id: 'form6',
          namn: 'Fint',
          nivå: 'Novis',
          taggar: {
            typ: ['Förmåga'],
            test: ['Diskret']
          }
        }
      ],
      inventory: [
        {
          id: 'vapen1',
          name: 'Kniv',
          qty: 1,
          kvaliteter: ['Kort']
        }
      ],
      custom: [],
      notes: {
        background: 'Legacy'
      }
    }
  };

  const importedId = sandbox.storeHelper.importCharacterJSON(store, payload);
  assert(importedId, 'importCharacterJSON misslyckades');

  const importedEntry = store.data[importedId].list[0];
  assert(importedEntry && importedEntry.taggar, 'Importerad post saknas');
  assert(!Object.prototype.hasOwnProperty.call(importedEntry.taggar, 'regler'), 'Import lade till regler på legacy-post');

  const exported = sandbox.storeHelper.exportCharacterJSON(store, importedId, true);
  assert(exported && exported.data && Array.isArray(exported.data.list), 'Export misslyckades');
  const exportedEntry = exported.data.list[0];
  assert(exportedEntry && exportedEntry.taggar, 'Exporterad post saknas');
  assert(!Object.prototype.hasOwnProperty.call(exportedEntry.taggar, 'regler'), 'Export lade till regler på legacy-post');
}

function verifyLegacyLoad(rootPath) {
  const legacyBlob = {
    current: 'legacy-1',
    characters: [{ id: 'legacy-1', name: 'Legacy Hero' }],
    folders: [],
    data: {
      'legacy-1': {
        list: [
          {
            id: 'form6',
            namn: 'Fint',
            nivå: 'Gesäll',
            taggar: {
              typ: ['Förmåga'],
              test: ['Diskret']
            }
          }
        ],
        inventory: [],
        custom: []
      }
    }
  };

  const sandbox = createSandbox({
    rpall: JSON.stringify(legacyBlob)
  });
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const loaded = sandbox.storeHelper.load();
  assert(loaded && loaded.data && loaded.data['legacy-1'], 'Legacy-laddning misslyckades');

  const loadedEntry = loaded.data['legacy-1'].list[0];
  assert(loadedEntry && loadedEntry.taggar, 'Legacy-post saknas efter load');
  assert(!Object.prototype.hasOwnProperty.call(loadedEntry.taggar, 'regler'), 'Legacy load lade till regler');
  assert(sandbox.localStorage.getItem('rpall') === null, 'Legacy-lagringen migrerades inte bort från rpall');
  assert(sandbox.localStorage.getItem('rpall-meta') !== null, 'Legacy-laddning skapade inte ny meta-lagring');
}

function verifyMoneyGrantRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const allEntries = [...advantages];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = () => false;
  sandbox.isSardrag = (entry) => (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []).includes('Särdrag');
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;
  sandbox.DB = allEntries;

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const privilegierad = findByName(advantages, 'Privilegierad');
  assert(privilegierad, 'Hittade inte Privilegierad för pengagrant-verifiering');

  // 1. Rule structure is correct in data
  const gerRules = sandbox.rulesHelper.getRuleList(privilegierad, 'ger');
  assert(gerRules.length === 1, 'Privilegierad ska ha exakt en ger-regel');
  assert(gerRules[0]?.mal === 'pengar', 'Privilegierad ger-regel ska använda mal=pengar');
  assert(gerRules[0]?.daler === 50, 'Privilegierad pengagrant ska ge 50 daler');

  // 2. getMoneyGrant aggregates correctly
  assert(
    typeof sandbox.rulesHelper.getMoneyGrant === 'function',
    'rulesHelper ska exponera getMoneyGrant'
  );
  const grantWithPriv = sandbox.rulesHelper.getMoneyGrant([{ ...privilegierad }]);
  assert(grantWithPriv.daler === 50,   'getMoneyGrant ska ge 50 daler för Privilegierad');
  assert(grantWithPriv.skilling === 0, 'getMoneyGrant ska ge 0 skilling för Privilegierad');
  assert(grantWithPriv.ortegar === 0,  'getMoneyGrant ska ge 0 örtegar för Privilegierad');

  const grantEmpty = sandbox.rulesHelper.getMoneyGrant([]);
  assert(grantEmpty.daler === 0, 'getMoneyGrant utan Privilegierad ska ge 0 daler');

  // 3. setCurrentList seeds privMoney when Privilegierad is newly added
  const baseData = {
    list: [],
    inventory: [],
    custom: [],
    privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
  };
  const createStore = (overrides = {}) => ({
    current: 'money-test',
    characters: [{ id: 'money-test', name: 'Money Test' }],
    folders: [],
    data: { 'money-test': { ...baseData, ...overrides } }
  });

  const addStore = createStore();
  sandbox.storeHelper.setCurrentList(addStore, [{ ...privilegierad }]);
  assert(
    addStore.data['money-test'].privMoney.daler === 50,
    'setCurrentList ska sätta privMoney.daler till 50 när Privilegierad läggs till'
  );
  assert(
    addStore.data['money-test'].privMoney.skilling === 0,
    'setCurrentList ska sätta privMoney.skilling till 0 när Privilegierad läggs till'
  );
  assert(
    addStore.data['money-test'].privMoney['örtegar'] === 0,
    'setCurrentList ska sätta privMoney.örtegar till 0 när Privilegierad läggs till'
  );

  // 4. Adding again (already present) does not overwrite manually-adjusted money
  addStore.data['money-test'].privMoney = { daler: 99, skilling: 0, 'örtegar': 0 };
  sandbox.storeHelper.setCurrentList(addStore, [{ ...privilegierad }]);
  assert(
    addStore.data['money-test'].privMoney.daler === 99,
    'setCurrentList ska inte skriva över manuellt ändrade pengar om Privilegierad redan fanns'
  );

  // 5. Removing Privilegierad resets privMoney
  sandbox.storeHelper.setCurrentList(addStore, []);
  assert(
    addStore.data['money-test'].privMoney.daler === 0,
    'setCurrentList ska nollställa privMoney.daler när Privilegierad tas bort'
  );
  assert(
    addStore.data['money-test'].privMoney.skilling === 0,
    'setCurrentList ska nollställa privMoney.skilling när Privilegierad tas bort'
  );
  assert(
    addStore.data['money-test'].privMoney['örtegar'] === 0,
    'setCurrentList ska nollställa privMoney.örtegar när Privilegierad tas bort'
  );

  // 6. Old character without regler still loads (backward compat)
  const legacyStore = createStore({
    list: [{ id: 'ford41', namn: 'Privilegierad', taggar: { typ: ['Fördel'] } }],
    privMoney: { daler: 50, skilling: 0, 'örtegar': 0 }
  });
  sandbox.storeHelper.setCurrentList(
    legacyStore,
    [{ id: 'ford41', namn: 'Privilegierad', taggar: { typ: ['Fördel'] } }]
  );
  assert(
    legacyStore.data['money-test'].privMoney.daler === 50,
    'Gammal karaktär med Privilegierad och sparade pengar ska behålla privMoney efter setCurrentList'
  );
}

function verifyXpNeutralizationForGrants(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const advantages = readEntryDataFile(rootPath, 'data/fordel.json');
  const disadvantages = readEntryDataFile(rootPath, 'data/nackdel.json');
  const allEntries = [...advantages, ...disadvantages];

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = () => false;
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;

  const findByName = (list, name) => list.find(entry => entry && entry.namn === name);
  const darkBlood = findByName(advantages, 'Mörkt blod');
  const darkPast = findByName(disadvantages, 'Mörkt förflutet');

  [
    ['Mörkt blod', darkBlood],
    ['Mörkt förflutet', darkPast]
  ].forEach(([name, entry]) => {
    assert(entry, `Hittade inte ${name} för XP-neutraliseringstest`);
  });

  const { calcEntryXP, calcTotalXP, calcUsedXP, countDisadvantages } = sandbox.storeHelper;

  // Test 1-4: Mörkt blod -> Mörkt förflutet har nu gratis:true i data
  const listWithGrant = [{ ...darkBlood }, { ...darkPast }];
  assert(
    calcEntryXP(listWithGrant[1], listWithGrant) === 0,
    'Mörkt förflutet (granted med gratis-tag) ska kosta 0 ERF i calcEntryXP'
  );
  assert(
    countDisadvantages(listWithGrant) === 0,
    'Mörkt förflutet (granted med gratis-tag) ska inte räknas som nackdel i countDisadvantages'
  );
  assert(
    calcTotalXP(0, listWithGrant) === 0,
    'Mörkt förflutet (granted med gratis-tag) ska inte ge ERF i calcTotalXP'
  );
  const usedXp = calcUsedXP(listWithGrant);
  assert(
    usedXp === 5,
    `calcUsedXP ska ge 5 ERF (bara Mörkt blod som fördel), fick ${usedXp}`
  );

  // Test 5: Explicit gratis-tag should neutralize granted disadvantage
  const explicitFreeGrantSource = {
    id: 'explicit-free-grant-source',
    namn: 'Explicit gratis-grant',
    taggar: {
      typ: ['Fördel'],
      regler: {
        ger: [
          {
            mal: 'post',
            namn: ['Mörkt förflutet'],
            gratis: true
          }
        ]
      }
    }
  };
  const listWithExplicitFreeGrant = [explicitFreeGrantSource, { ...darkPast }];
  assert(
    calcEntryXP(listWithExplicitFreeGrant[1], listWithExplicitFreeGrant) === 0,
    'Mörkt förflutet (granted med gratis:true) ska kosta 0 ERF via calcEntryXP'
  );
  assert(
    countDisadvantages(listWithExplicitFreeGrant) === 0,
    'Mörkt förflutet (granted med gratis:true) ska inte räknas som nackdel i countDisadvantages'
  );
  assert(
    calcTotalXP(0, listWithExplicitFreeGrant) === 0,
    'Mörkt förflutet (granted med gratis:true) ska inte ge ERF i calcTotalXP'
  );

  // Test 6: Non-granted Mörkt förflutet (no grant source) counts normally
  const listWithoutGrantSource = [{ ...darkPast }];
  assert(
    countDisadvantages(listWithoutGrantSource) === 1,
    'Mörkt förflutet utan Mörkt blod ska räknas som vanlig nackdel'
  );
  assert(
    calcTotalXP(0, listWithoutGrantSource) === 5,
    'Mörkt förflutet utan grant-källa ska ge +5 ERF i calcTotalXP'
  );

  // Test 7: Untagged granted disadvantage occupies a cap slot
  // Build 5 real non-granted disadvantages + the untagged granted pair
  const syntheticDis = (i) => ({
    id: `synthetic-dis-${i}`,
    namn: `Syntetisk nackdel ${i}`,
    taggar: { typ: ['Nackdel'] }
  });
  const fiveRealDis = [1, 2, 3, 4, 5].map(syntheticDis);
  const listWithCapTest = [...fiveRealDis, { ...darkBlood }, { ...darkPast }];
  assert(
    countDisadvantages(listWithCapTest) === 5,
    'Mörkt förflutet (granted med gratis-tag) ska inte räknas mot nackdelstaket'
  );
  assert(
    calcTotalXP(0, listWithCapTest) === 25,
    'Nackdelstaket ska fortsatt begränsa till +25 ERF'
  );

  // Test 8: ignoreLimits-grant should bypass disadvantage cap counting but still grant XP
  const ignoreLimitGrantSource = {
    id: 'ignore-limit-grant-source',
    namn: 'Ignore limit grant',
    taggar: {
      typ: ['Fördel'],
      regler: {
        ger: [
          {
            mal: 'post',
            namn: ['Mörkt förflutet'],
            ignoreLimits: true
          }
        ]
      }
    }
  };
  const listWithIgnoreLimitGrant = [...fiveRealDis, ignoreLimitGrantSource, { ...darkPast }];
  assert(
    countDisadvantages(listWithIgnoreLimitGrant) === 5,
    'ignoreLimits-grantad nackdel ska inte räknas mot nackdelstaket'
  );
  assert(
    calcEntryXP(listWithIgnoreLimitGrant[listWithIgnoreLimitGrant.length - 1], listWithIgnoreLimitGrant) === -5,
    'ignoreLimits-grantad nackdel ska fortsatt ge ERF via calcEntryXP'
  );
  assert(
    calcTotalXP(0, listWithIgnoreLimitGrant) === 30,
    'ignoreLimits-grantad nackdel ska ge ERF utanför nackdelstaket'
  );
}

function verifyDefenseModifierRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const sardrag = readEntryDataFile(rootPath, 'data/sardrag.json');
  const robust = sardrag.find(e => e.namn === 'Robust');
  assert(robust, 'Hittade inte Robust i sardrag.json');

  const { getDefenseValueModifier } = sandbox.rulesHelper;
  assert(typeof getDefenseValueModifier === 'function', 'getDefenseValueModifier ska vara exporterad');

  // Test 1: Data structure — nivå_data present with forsvar_modifierare rules
  ['Novis', 'Gesäll', 'Mästare'].forEach(lvl => {
    const rule = robust.taggar.nivå_data?.[lvl]?.regler?.andrar?.[0];
    assert(rule, `Robust ${lvl} saknar andrar-regel i nivå_data`);
    assert(rule.mal === 'forsvar_modifierare', `Robust ${lvl} andrar-regel ska ha mal=forsvar_modifierare`);
    assert(rule.satt === 'ersatt', `Robust ${lvl} andrar-regel ska ha satt=ersatt`);
  });
  assert(robust.taggar.nivå_data.Novis.regler.andrar[0].varde === -2, 'Robust Novis varde ska vara -2');
  assert(robust.taggar.nivå_data.Gesäll.regler.andrar[0].varde === -3, 'Robust Gesäll varde ska vara -3');
  assert(robust.taggar.nivå_data.Mästare.regler.andrar[0].varde === -4, 'Robust Mästare varde ska vara -4');

  // Test 2: Empty list → 0
  assert(getDefenseValueModifier([]) === 0, 'Tom lista ska ge 0');

  // Test 3: Robust Novis → -2
  const robustNovis = { ...robust, nivå: 'Novis' };
  const result2 = getDefenseValueModifier([robustNovis]);
  assert(result2 === -2, `Robust Novis ska ge -2, fick ${result2}`);

  // Test 4: Robust Gesäll → -3 (ersatt, not cumulative)
  const robustGesall = { ...robust, nivå: 'Gesäll' };
  const result3 = getDefenseValueModifier([robustGesall]);
  assert(result3 === -3, `Robust Gesäll ska ge -3, fick ${result3}`);

  // Test 5: Robust Mästare → -4
  const robustMastare = { ...robust, nivå: 'Mästare' };
  const result4 = getDefenseValueModifier([robustMastare]);
  assert(result4 === -4, `Robust Mästare ska ge -4, fick ${result4}`);

  // Test 6: Non-Robust entry → 0
  const noRule = { namn: 'Annat', taggar: { typ: ['Särdrag'] }, nivå: 'Novis' };
  assert(getDefenseValueModifier([noRule]) === 0, 'Icke-Robust entry ska ge 0');

  // Tests for Sensoriskt känslig (forsvar_modifierare + nar.har_utrustad_typ — only when armor worn)
  const nackdelar = readEntryDataFile(rootPath, 'data/nackdel.json');
  const sensorisk = nackdelar.find(e => e.namn === 'Sensoriskt känslig');
  assert(sensorisk, 'Hittade inte Sensoriskt känslig i nackdel.json');

  const { getArmorDefenseModifier } = sandbox.rulesHelper;
  assert(typeof getArmorDefenseModifier === 'function', 'getArmorDefenseModifier ska vara exporterad');

  // Test 7: Data structure — forsvar_modifierare + nar.har_utrustad_typ: ["Rustning"]
  const sRule = sensorisk.taggar?.regler?.andrar?.[0];
  assert(sRule, 'Sensoriskt känslig saknar andrar-regel i taggar.regler');
  assert(sRule.mal === 'forsvar_modifierare', 'Sensoriskt känslig andrar-regel ska ha mal=forsvar_modifierare');
  assert(sRule.varde === -2, 'Sensoriskt känslig andrar-regel ska ha varde=-2');
  assert(
    Array.isArray(sRule.nar?.har_utrustad_typ) && sRule.nar.har_utrustad_typ.includes('Rustning'),
    'Sensoriskt känslig andrar-regel ska ha nar.har_utrustad_typ: ["Rustning"]'
  );

  // Item contexts for testing
  const lightArmorCtx  = { utrustadTyper: ['Rustning', 'Lätt rustning'],      utrustadeKvaliteter: [] };
  const heavyArmorCtx  = { utrustadTyper: ['Rustning', 'Tung rustning'],       utrustadeKvaliteter: [] };
  const noArmorCtx     = { utrustadTyper: ['Vapen'],                            utrustadeKvaliteter: [] };

  const sensoriskEntry = { ...sensorisk };

  // Test 8: getArmorDefenseModifier with Rustning context returns -2
  const result7 = getArmorDefenseModifier([sensoriskEntry], lightArmorCtx);
  assert(result7 === -2, `getArmorDefenseModifier (lätt rustning) ska ge -2, fick ${result7}`);

  // Test 8b: also works with heavy armor (both have "Rustning" in their type list)
  const result7h = getArmorDefenseModifier([sensoriskEntry], heavyArmorCtx);
  assert(result7h === -2, `getArmorDefenseModifier (tung rustning) ska ge -2, fick ${result7h}`);

  // Test 9: getDefenseValueModifier returns 0 for Sensoriskt känslig (nar.har_utrustad_typ → excluded from base)
  const result7b = getDefenseValueModifier([sensoriskEntry]);
  assert(result7b === 0, `getDefenseValueModifier ska ignorera nar.har_utrustad_typ-villkorade regler, fick ${result7b}`);

  // Test 10: getArmorDefenseModifier returns 0 when item type doesn't match nar condition
  const result8 = getArmorDefenseModifier([sensoriskEntry], noArmorCtx);
  assert(result8 === 0, `getArmorDefenseModifier ska ge 0 för icke-Rustning kontext, fick ${result8}`);

  // Test 10b: Robust has no nar.har_utrustad_typ → NOT included in armor-conditional modifier
  const result8b = getArmorDefenseModifier([robustGesall], lightArmorCtx);
  assert(result8b === 0, `getArmorDefenseModifier ska ignorera regler utan nar.har_utrustad_typ (Robust), fick ${result8b}`);

  // Test 11: additive across entries with matching context
  const result9 = getArmorDefenseModifier([sensoriskEntry, sensoriskEntry], lightArmorCtx);
  assert(result9 === -4, `Två Sensoriskt känslig ska ge -4, fick ${result9}`);
}

function verifyArmorRestrictionBonusRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const kvalitet = readEntryDataFile(rootPath, 'data/kvalitet.json');
  const negativKvalitet = readEntryDataFile(rootPath, 'data/negativ-kvalitet.json');
  const mystiskKvalitet = readEntryDataFile(rootPath, 'data/mystisk-kvalitet.json');

  const smidigt = kvalitet.find(e => e.namn === 'Smidigt');
  const otymplig = negativKvalitet.find(e => e.namn === 'Otymplig');
  const stenpansar = mystiskKvalitet.find(e => e.namn === 'Stenpansar');

  assert(smidigt, 'Hittade inte Smidigt i kvalitet.json');
  assert(otymplig, 'Hittade inte Otymplig i negativ-kvalitet.json');
  assert(stenpansar, 'Hittade inte Stenpansar i mystisk-kvalitet.json');

  // Test 1–3: Data structure
  const smRule = smidigt.taggar?.regler?.andrar?.[0];
  assert(smRule?.mal === 'begransning_modifierare', 'Smidigt ska ha mal=begransning_modifierare');
  assert(smRule?.varde === 2, 'Smidigt ska ha varde=2');

  const otRule = otymplig.taggar?.regler?.andrar?.[0];
  assert(otRule?.mal === 'begransning_modifierare', 'Otymplig ska ha mal=begransning_modifierare');
  assert(otRule?.varde === -1, 'Otymplig ska ha varde=-1');

  const stRule = stenpansar.taggar?.regler?.andrar?.[0];
  assert(stRule?.mal === 'forsvar_modifierare', 'Stenpansar ska ha mal=forsvar_modifierare');
  assert(stRule?.varde === -4, 'Stenpansar ska ha varde=-4');

  const { getArmorRestrictionBonus, getArmorRestrictionBonusFast, sumRustningBonus } = sandbox.rulesHelper;
  assert(typeof getArmorRestrictionBonus === 'function', 'getArmorRestrictionBonus ska vara exporterad');
  assert(typeof getArmorRestrictionBonusFast === 'function', 'getArmorRestrictionBonusFast ska vara exporterad');
  assert(typeof sumRustningBonus === 'function', 'sumRustningBonus ska vara exporterad');

  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'Smidigt') return smidigt;
    if (ref?.name === 'Otymplig') return otymplig;
    if (ref?.name === 'Stenpansar') return stenpansar;
    return null;
  };

  // Test 4–8: getArmorRestrictionBonus (regular, Rustmästare-cancelable)
  assert(getArmorRestrictionBonus([]) === 0, 'Inga kvaliteter ska ge 0');
  assert(getArmorRestrictionBonus(['Smidigt']) === 2, 'Smidigt ska ge +2');
  assert(getArmorRestrictionBonus(['Otymplig']) === -1, 'Otymplig ska ge -1');
  assert(getArmorRestrictionBonus(['Smidigt', 'Otymplig']) === 1, 'Smidigt + Otymplig ska ge +1');
  assert(getArmorRestrictionBonus(['Stenpansar']) === 0, 'Stenpansar ska inte påverka vanlig begränsning');

  // Test 9–10: getArmorRestrictionBonusFast (fixed, not cancelled by Rustmästare)
  assert(getArmorRestrictionBonusFast([]) === 0, 'Tom lista ska ge 0 för fast');
  assert(getArmorRestrictionBonusFast(['Stenpansar']) === 0, 'Stenpansar (forsvar_modifierare) ska inte påverka fast begränsning');
  assert(getArmorRestrictionBonusFast(['Smidigt']) === 0, 'Smidigt ska inte påverka fast begränsning');

  // Test 11: Rustmästare interaction — regular resets to 0, fast unaffected
  let limit = -2; // base restriction
  limit += getArmorRestrictionBonus(['Smidigt', 'Stenpansar']); // regular: +2 → 0
  assert(limit === 0, `limit efter Smidigt ska vara 0, fick ${limit}`);
  limit = 0; // Rustmästare Gesäll resets to 0
  limit += getArmorRestrictionBonusFast(['Smidigt', 'Stenpansar']); // fast: 0 (Stenpansar is forsvar_modifierare)
  assert(limit === 0, `limit efter fast utan fast-regler ska vara 0, fick ${limit}`);
}

function verifyWeaponDefenseBonusRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const formaga = readEntryDataFile(rootPath, 'data/formaga.json');
  const kvalitet = readEntryDataFile(rootPath, 'data/kvalitet.json');
  const vapen = readWeaponEntries(rootPath);

  const manteldans = formaga.find(e => e.namn === 'Manteldans');
  const sköldkamp = formaga.find(e => e.namn === 'Sköldkamp');
  const tvillingattack = formaga.find(e => e.namn === 'Tvillingattack');
  const stavkamp = formaga.find(e => e.namn === 'Stavkamp');
  const balanserat = kvalitet.find(e => e.namn === 'Balanserat');
  const vandringsstav = vapen.find(e => e.namn === 'Vandringsstav');

  assert(manteldans, 'Hittade inte Manteldans i formaga.json');
  assert(sköldkamp, 'Hittade inte Sköldkamp i formaga.json');
  assert(tvillingattack, 'Hittade inte Tvillingattack i formaga.json');
  assert(stavkamp, 'Hittade inte Stavkamp i formaga.json');
  assert(balanserat, 'Hittade inte Balanserat i kvalitet.json');
  assert(vandringsstav, 'Hittade inte Vandringsstav i vapenkällorna');

  // Test 1: Data structure — Balanserat has forsvar_modifierare rule
  const bRule = balanserat.taggar?.regler?.andrar?.[0];
  assert(bRule, 'Balanserat saknar andrar-regel i taggar.regler');
  assert(bRule.mal === 'forsvar_modifierare', 'Balanserat andrar-regel ska ha mal=forsvar_modifierare');
  assert(bRule.varde === 1, 'Balanserat andrar-regel ska ha varde=1');

  // Test 2: Vandringsstav has Stav type
  assert((vandringsstav.taggar?.typ || []).includes('Stav'), 'Vandringsstav ska ha typ Stav');

  // Test 3: Manteldans Novis — regler borttagna ur data, hoppa över

  // Test 4: Tvillingattack Novis has antal_utrustade_vapen_minst: 2
  const tRule = tvillingattack.taggar?.nivå_data?.Novis?.regler?.andrar?.[0];
  assert(tRule, 'Tvillingattack Novis saknar andrar-regel');
  assert(tRule.mal === 'forsvar_modifierare', 'Tvillingattack Novis regel ska ha mal=forsvar_modifierare');
  assert(tRule.varde === -5, 'Tvillingattack Novis regel ska ha varde=-5');
  assert(tRule.nar?.antal_utrustade_vapen_minst === 2, 'Tvillingattack Novis ska kräva antal_utrustade_vapen_minst=2');

  // Test 5: Sköldkamp Novis has har_utrustad_vapen_typ: ["Sköld"] + ej_utrustad_vapen_kvalitet: ["Armfäst"]
  const skRule = sköldkamp.taggar?.nivå_data?.Novis?.regler?.andrar?.[0];
  assert(skRule, 'Sköldkamp Novis saknar andrar-regel');
  assert(skRule.mal === 'forsvar_modifierare', 'Sköldkamp Novis regel ska ha mal=forsvar_modifierare');
  assert(skRule.varde === 1, 'Sköldkamp Novis regel ska ha varde=1');
  assert(JSON.stringify(skRule.nar?.har_utrustad_vapen_typ) === JSON.stringify(['Sköld']), 'Sköldkamp Novis ska kräva Sköld');
  assert(JSON.stringify(skRule.nar?.ej_utrustad_vapen_kvalitet) === JSON.stringify(['Armfäst']), 'Sköldkamp Novis ska utesluta Armfäst');

  // Test 6: Stavkamp Novis has two rules (Stav +2, Långt-not-Stav +1)
  const stRules = stavkamp.taggar?.nivå_data?.Novis?.regler?.andrar || [];
  assert(stRules.length === 2, `Stavkamp Novis ska ha 2 andrar-regler, hittade ${stRules.length}`);
  const stavRule = stRules.find(r => r.nar?.har_utrustad_vapen_typ?.[0] === 'Stav');
  const langtRule = stRules.find(r => r.nar?.har_utrustad_vapen_kvalitet?.[0] === 'Långt');
  assert(stavRule, 'Stavkamp Novis saknar Stav-regel');
  assert(stavRule.varde === 2, 'Stavkamp Novis Stav-regel ska ge +2');
  assert(langtRule, 'Stavkamp Novis saknar Långt-regel');
  assert(langtRule.varde === 1, 'Stavkamp Novis Långt-regel ska ge +1');
  assert(JSON.stringify(langtRule.nar?.ej_utrustad_vapen_typ) === JSON.stringify(['Stav']), 'Stavkamp Novis Långt-regel ska utesluta Stav');

  const { getWeaponDefenseBonus, getEquippedQualityDefenseBonus } = sandbox.rulesHelper;
  assert(typeof getWeaponDefenseBonus === 'function', 'getWeaponDefenseBonus ska vara exporterad');
  assert(typeof getEquippedQualityDefenseBonus === 'function', 'getEquippedQualityDefenseBonus ska vara exporterad');

  // Test 7: getWeaponDefenseBonus — empty list → 0
  assert(getWeaponDefenseBonus([], {}) === 0, 'Tom lista ska ge 0');

  // Test 8: Manteldans Novis — regler borttagna, ger 0
  const manteldansNovis = { ...manteldans, nivå: 'Novis' };
  assert(getWeaponDefenseBonus([manteldansNovis], {}) === 0, 'Manteldans Novis utan regler ska ge 0');

  // Test 9: Tvillingattack — needs 2 weapons
  const tvillingNovis = { ...tvillingattack, nivå: 'Novis' };
  assert(getWeaponDefenseBonus([tvillingNovis], { antalVapen: 1 }) === 0, 'Tvillingattack med 1 vapen ska ge 0');
  assert(getWeaponDefenseBonus([tvillingNovis], { antalVapen: 2 }) === -5, 'Tvillingattack med 2 vapen ska ge -5');

  // Test 10: Sköldkamp — shield without Armfäst gives +1, with Armfäst gives 0
  const sköldkampNovis = { ...sköldkamp, nivå: 'Novis' };
  const shieldCtx = { vapenFakta: [{ typer: ['Sköld'], kvaliteter: [] }], antalVapen: 1 };
  const armfästCtx = { vapenFakta: [{ typer: ['Sköld'], kvaliteter: ['Armfäst'] }], antalVapen: 1 };
  assert(getWeaponDefenseBonus([sköldkampNovis], shieldCtx) === 1, 'Sköldkamp med normal sköld ska ge +1');
  assert(getWeaponDefenseBonus([sköldkampNovis], armfästCtx) === 0, 'Sköldkamp med Armfäst ska ge 0');

  // Test 11: Stavkamp — stave +2, long non-stave +1, no long weapon 0
  const stavkampNovis = { ...stavkamp, nivå: 'Novis' };
  const stavCtx = { vapenFakta: [{ typer: ['Vapen', 'Långa vapen', 'Stav'], kvaliteter: ['Långt'] }], antalVapen: 1 };
  const langtCtx = { vapenFakta: [{ typer: ['Vapen', 'Långa vapen'], kvaliteter: ['Långt'] }], antalVapen: 1 };
  const kortCtx = { vapenFakta: [{ typer: ['Vapen', 'Korta vapen'], kvaliteter: [] }], antalVapen: 1 };
  assert(getWeaponDefenseBonus([stavkampNovis], stavCtx) === 2, 'Stavkamp med Stav ska ge +2');
  assert(getWeaponDefenseBonus([stavkampNovis], langtCtx) === 1, 'Stavkamp med långt vapen (ej Stav) ska ge +1');
  assert(getWeaponDefenseBonus([stavkampNovis], kortCtx) === 0, 'Stavkamp med kort vapen ska ge 0');

  // Test 12: getEquippedQualityDefenseBonus — Balanserat gives +1 via lookupEntry
  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'Balanserat') return balanserat;
    return null;
  };
  assert(getEquippedQualityDefenseBonus([]) === 0, 'Inga kvaliteter ska ge 0');
  assert(getEquippedQualityDefenseBonus(['Balanserat']) === 1, 'Balanserat ska ge +1');
  assert(getEquippedQualityDefenseBonus(['Balanserat', 'Precist']) === 1, 'Balanserat + icke-defensiv kvalitet ska ge +1');

  // Test 13: Vandringsstav type enables Stavkamp +2
  assert((vandringsstav.taggar?.typ || []).includes('Stav'), 'Vandringsstav ska ha Stav-typ för Stavkamp');
  const vandringCtx = { vapenFakta: [{ typer: vandringsstav.taggar.typ, kvaliteter: vandringsstav.taggar.kvalitet }], antalVapen: 1 };
  assert(getWeaponDefenseBonus([stavkampNovis], vandringCtx) === 2, 'Stavkamp med Vandringsstav ska ge +2');
}

function verifySelectiveDefenseModifierWeaponContext(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const formaga = readEntryDataFile(rootPath, 'data/formaga.json');
  const tvillingattack = formaga.find(e => e.namn === 'Tvillingattack');
  assert(tvillingattack, 'Hittade inte Tvillingattack i formaga.json');

  const { getSelectiveDefenseModifier } = sandbox.rulesHelper;
  assert(typeof getSelectiveDefenseModifier === 'function', 'getSelectiveDefenseModifier ska vara exporterad');

  const tvillingNovis = { ...tvillingattack, nivå: 'Novis' };
  const weaponFact1 = { path: [0], id: 'w1', name: 'Vapen 1', entryRef: null, types: ['Vapen'], qualities: [] };
  const weaponFact2 = { path: [1], id: 'w2', name: 'Vapen 2', entryRef: null, types: ['Vapen'], qualities: [] };

  // Test 1: No tillat sources → always 0
  const noSources = getSelectiveDefenseModifier([tvillingNovis], [weaponFact1, weaponFact2], {}, {});
  assert(noSources === 0, `Inga tillat-källor ska ge 0, fick ${noSources}`);

  // Test 2: karaktarsdrag=true with 1 weapon — Tvillingattack condition fails (needs 2)
  const oneWeapon = getSelectiveDefenseModifier(
    [tvillingNovis], [weaponFact1], {}, { karaktarsdrag: true }
  );
  assert(oneWeapon === 0, `Tvillingattack med 1 vapen ska ge 0, fick ${oneWeapon}`);

  // Test 3: karaktarsdrag=true with 2 weapons — Tvillingattack condition met, +1 applies
  const twoWeapons = getSelectiveDefenseModifier(
    [tvillingNovis], [weaponFact1, weaponFact2], {}, { karaktarsdrag: true }
  );
  assert(twoWeapons === -5, `Tvillingattack med 2 vapen ska ge -5, fick ${twoWeapons}`);

  // Test 4: karaktarsdrag=true, vapen_typer=false — weapon context must still propagate
  // (this was the bug: empty facts broke antalVapen)
  const twoWeaponsNoVapenTyper = getSelectiveDefenseModifier(
    [tvillingNovis], [weaponFact1, weaponFact2], {}, { karaktarsdrag: true, vapen_typer: false }
  );
  assert(twoWeaponsNoVapenTyper === -5, `karaktarsdrag utan vapen_typer ska fortfarande ge -5, fick ${twoWeaponsNoVapenTyper}`);
}

function verifyArmorQualityDefenseModifier(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const mystiskKvalitet = readEntryDataFile(rootPath, 'data/mystisk-kvalitet.json');
  const stenpansar = mystiskKvalitet.find(e => e.namn === 'Stenpansar');
  assert(stenpansar, 'Hittade inte Stenpansar i mystisk-kvalitet.json');

  sandbox.lookupEntry = (ref) => {
    const name = typeof ref === 'string' ? ref : (ref?.name || ref?.namn);
    if (name === 'Stenpansar') return stenpansar;
    return null;
  };

  const { getEquippedDefenseModifier } = sandbox.rulesHelper;
  assert(typeof getEquippedDefenseModifier === 'function', 'getEquippedDefenseModifier ska vara exporterad');

  // Test 1: No armor equipped → Stenpansar rule not applied → 0
  const noArmor = getEquippedDefenseModifier([], [], {});
  assert(noArmor === 0, `Inget rustning ska ge 0, fick ${noArmor}`);

  // Test 2: Stenpansar armor equipped → forsvar_modifierare: -4 applies
  const withStenpansar = getEquippedDefenseModifier(
    [],
    [],
    { utrustadTyper: ['Rustning'], utrustadeKvaliteter: ['Stenpansar'] }
  );
  assert(withStenpansar === -4, `Stenpansar ska ge -4, fick ${withStenpansar}`);

  // Test 3: Armor without Stenpansar → 0
  const plainArmor = getEquippedDefenseModifier(
    [],
    [],
    { utrustadTyper: ['Rustning'], utrustadeKvaliteter: [] }
  );
  assert(plainArmor === 0, `Rustning utan Stenpansar ska ge 0, fick ${plainArmor}`);
}

function verifyWeaponAttackBonusRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const formaga = readEntryDataFile(rootPath, 'data/formaga.json');
  const kvalitet = readEntryDataFile(rootPath, 'data/kvalitet.json');
  const fint = formaga.find(e => e.namn === 'Fint');
  const precist = kvalitet.find(e => e.namn === 'Precist');

  assert(fint, 'Hittade inte Fint i formaga.json');
  assert(precist, 'Hittade inte Precist i kvalitet.json');

  const pRule = precist.taggar?.regler?.andrar?.[0];
  assert(pRule, 'Precist saknar andrar-regel i taggar.regler');
  assert(pRule.mal === 'traffsaker_modifierare_vapen', 'Precist andrar-regel ska ha mal=traffsaker_modifierare_vapen');
  assert(pRule.varde === 1, 'Precist andrar-regel ska ha varde=1');

  const {
    getAttackTraitRuleCandidates,
    getWeaponAttackBonus,
    getEquippedQualityAttackBonus
  } = sandbox.rulesHelper;
  assert(typeof getAttackTraitRuleCandidates === 'function', 'getAttackTraitRuleCandidates ska vara exporterad');
  assert(typeof getWeaponAttackBonus === 'function', 'getWeaponAttackBonus ska vara exporterad');
  assert(typeof getEquippedQualityAttackBonus === 'function', 'getEquippedQualityAttackBonus ska vara exporterad');

  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'Precist') return precist;
    return null;
  };
  assert(getEquippedQualityAttackBonus([]) === 0, 'Inga kvaliteter ska ge 0');
  assert(getEquippedQualityAttackBonus(['Precist']) === 1, 'Precist ska ge +1');
  assert(getEquippedQualityAttackBonus(['Precist', 'Balanserat']) === 1, 'Precist + icke-attackkvalitet ska ge +1');

  const customAttackAbility = {
    id: 'test-attack-bonus',
    namn: 'Testattack',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'traffsaker_modifierare_vapen',
            varde: 2,
            nar: { har_utrustad_vapen_typ: ['Avståndsvapen'] }
          }
        ]
      }
    }
  };
  const rangedCtx = { vapenFakta: [{ typer: ['Avståndsvapen', 'Pilbåge'], kvaliteter: ['Precist'] }], antalVapen: 1 };
  const thrownCtx = { vapenFakta: [{ typer: ['Avståndsvapen', 'Kastvapen'], kvaliteter: ['Precist'] }], antalVapen: 1 };
  const meleeCtx = { vapenFakta: [{ typer: ['Närstridsvapen', 'Korta vapen'], kvaliteter: ['Precist'] }], antalVapen: 1 };
  assert(getWeaponAttackBonus([customAttackAbility], rangedCtx) === 2, 'Ranged kontext ska ge +2 från custom attack-regel');
  assert(getWeaponAttackBonus([customAttackAbility], thrownCtx) === 2, 'Kastvapen kontext ska ge +2 från custom attack-regel');
  assert(getWeaponAttackBonus([customAttackAbility], meleeCtx) === 0, 'Melee kontext ska inte ge ranged-bonus');

  const fintNovis = { ...fint, nivå: 'Novis' };
  const fintMatch = getAttackTraitRuleCandidates([fintNovis], {
    narstrid: true,
    foremal: { typ: ['Vapen', 'Korta vapen'], kvalitet: ['Precist'] }
  });
  deepEqual(fintMatch, ['Diskret'], 'Fint ska ge Diskret när foremal uppfyller villkoren');

  const fintMiss = getAttackTraitRuleCandidates([fintNovis], {
    narstrid: true,
    foremal: { typ: ['Vapen', 'Korta vapen'], kvalitet: [] }
  });
  deepEqual(fintMiss, [], 'Fint ska inte ge kandidat utan krävd foremal-kvalitet');
}

function verifyObalanserat(rootPath) {
  const negativKvalitet = readEntryDataFile(rootPath, 'data/negativ-kvalitet.json');
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  // Test 1: Obalanserat has forsvar_modifierare: -1 in data
  const obalanserat = negativKvalitet.find(e => e.namn === 'Obalanserat');
  assert(obalanserat, 'Hittade inte Obalanserat i negativ-kvalitet.json');
  const andrar = obalanserat?.taggar?.regler?.andrar || [];
  const vapenRule = andrar.find(r => r.mal === 'forsvar_modifierare');
  assert(vapenRule, 'Obalanserat saknar forsvar_modifierare-regel');
  assert(vapenRule.varde === -1, 'Obalanserat forsvar_modifierare ska vara -1');

  const { getEquippedQualityDefenseBonus } = sandbox.rulesHelper;

  // Test 2: getEquippedQualityDefenseBonus returns -1 for Obalanserat
  const balanserat = readEntryDataFile(rootPath, 'data/kvalitet.json').find(e => e.namn === 'Balanserat');
  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'Obalanserat') return obalanserat;
    if (ref?.name === 'Balanserat') return balanserat;
    return null;
  };
  assert(getEquippedQualityDefenseBonus(['Obalanserat']) === -1, 'Obalanserat ska ge -1');

  // Test 3: Balanced + Unbalanced cancel out to 0
  assert(getEquippedQualityDefenseBonus(['Balanserat', 'Obalanserat']) === 0, 'Balanserat + Obalanserat ska ge 0');

  // Test 4: Obalanserat alone with no other qualities
  assert(getEquippedQualityDefenseBonus([]) === 0, 'Tom lista ska ge 0');
  assert(getEquippedQualityDefenseBonus(['Obalanserat', 'Precist']) === -1, 'Obalanserat + icke-defensiv kvalitet ska ge -1');
}

function verifyDefenseSchemaMigration(rootPath) {
  const defenseFiles = [
    'formaga.json',
    'kvalitet.json',
    'negativ-kvalitet.json',
    'narstridsvapen.json',
    'avstandsvapen.json'
  ];
  defenseFiles.forEach(file => {
    const source = readText(joinPath(rootPath, 'data/' + file));
    assert(!source.includes('forsvar_modifierare_vapen'), `${file} ska inte innehålla forsvar_modifierare_vapen`);
  });
}

function verifyDefenseLoadoutCompatibility(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const { validateDefenseLoadout, normalizeDefenseLoadout } = sandbox.rulesHelper;
  assert(typeof validateDefenseLoadout === 'function', 'validateDefenseLoadout ska vara exporterad');
  assert(typeof normalizeDefenseLoadout === 'function', 'normalizeDefenseLoadout ska vara exporterad');

  const listNoTwin = [{ namn: 'Fint' }];
  const listWithTwin = [{ namn: 'Tvillingattack' }];
  const oneA = { path: [0], id: 'w1', types: ['Vapen', 'Enhandsvapen'], qualities: [] };
  const oneB = { path: [1], id: 'w2', types: ['Vapen', 'Korta vapen'], qualities: [] };
  const shield = { path: [2], id: 's1', types: ['Sköld'], qualities: [] };
  const armShield = { path: [3], id: 's2', types: ['Sköld'], qualities: ['Armfäst'] };
  const longWeapon = { path: [4], id: 'w3', types: ['Vapen', 'Långa vapen'], qualities: ['Långt'] };
  const heavyWeapon = { path: [5], id: 'w4', types: ['Vapen', 'Tvåhandsvapen'], qualities: [] };
  const bastardLong = { path: [6], id: 'w5', types: ['Vapen', 'Tvåhandsvapen'], qualities: ['Långt', 'Bastardvapen'] };

  assert(!validateDefenseLoadout(listNoTwin, [oneA, oneB]).valid, 'Dual-wield utan Tvillingattack ska vara ogiltigt');
  assert(validateDefenseLoadout(listWithTwin, [oneA, oneB]).valid, 'Tvillingattack + två vapen ska vara giltigt');
  assert(!validateDefenseLoadout(listWithTwin, [oneA, oneB, shield]).valid, 'Två vapen + sköld utan Armfäst ska vara ogiltigt');
  assert(validateDefenseLoadout(listWithTwin, [oneA, oneB, armShield]).valid, 'Två vapen + Armfäst sköld ska vara giltigt');
  assert(!validateDefenseLoadout(listWithTwin, [longWeapon, shield]).valid, 'Sköld + Långt utan Bastardvapen ska vara ogiltigt');
  assert(!validateDefenseLoadout(listWithTwin, [heavyWeapon, shield]).valid, 'Sköld + Tvåhandsvapen utan Bastardvapen ska vara ogiltigt');
  assert(validateDefenseLoadout(listWithTwin, [bastardLong, shield]).valid, 'Sköld + Bastardvapen ska vara giltigt');

  const normalized = normalizeDefenseLoadout(listWithTwin, [oneA, oneB, shield, armShield]);
  assert(validateDefenseLoadout(listWithTwin, normalized).valid, 'normalizeDefenseLoadout ska ge en giltig uppsättning');
  assert(normalized.length <= 3, 'normalizeDefenseLoadout ska respektera max legal utrustning');
}

function verifyDefenseAutoOptimizer(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const db = new Map();
  const addEntry = (entry) => { db.set(entry.id, entry); return entry; };
  addEntry({
    id: 'w1',
    namn: 'Vapen A',
    taggar: {
      typ: ['Vapen', 'Enhandsvapen'],
      regler: { andrar: [{ mal: 'forsvar_modifierare', varde: 2 }] }
    }
  });
  addEntry({
    id: 'w2',
    namn: 'Vapen B',
    taggar: {
      typ: ['Vapen', 'Korta vapen'],
      regler: { andrar: [{ mal: 'forsvar_modifierare', varde: 2 }] }
    }
  });
  addEntry({
    id: 's1',
    namn: 'Sköld',
    taggar: {
      typ: ['Sköld'],
      regler: { andrar: [{ mal: 'forsvar_modifierare', varde: 1 }] }
    }
  });
  addEntry({
    id: 's2',
    namn: 'Armfäst sköld',
    taggar: {
      typ: ['Sköld'],
      kvalitet: ['Armfäst'],
      regler: { andrar: [{ mal: 'forsvar_modifierare', varde: 1 }] }
    }
  });
  addEntry({
    id: 'dw',
    namn: 'Dansvapen',
    taggar: {
      typ: ['Vapen', 'Korta vapen'],
      kvalitet: ['Precist']
    }
  });

  const inventory = [
    { id: 'w1', name: 'Vapen A' },
    { id: 'w2', name: 'Vapen B' },
    { id: 's1', name: 'Sköld' },
    { id: 's2', name: 'Armfäst sköld' },
    { id: 'dw', name: 'Dansvapen' }
  ];
  const list = [
    {
      namn: 'Tvillingattack',
      nivå: 'Novis',
      taggar: {
        typ: ['Förmåga'],
        regler: {
          andrar: [{ mal: 'forsvar_modifierare', varde: 5, nar: { antal_utrustade_vapen_minst: 2 } }]
        }
      }
    },
    {
      namn: 'Dansregel',
      nivå: 'Novis',
      taggar: {
        typ: ['Förmåga'],
        regler: {
          andrar: [
            { mal: 'dansande_forsvar_karaktarsdrag', satt: 'ersatt', varde: 'Listig' },
            { mal: 'dansande_forsvar_karaktarsdrag', satt: 'ersatt', varde: 'Vaksam', nar: { har_utrustad_vapen_kvalitet: ['Precist'] } }
          ]
        }
      }
    }
  ];
  const traits = {
    Diskret: 10,
    Kvick: 10,
    Listig: 11,
    Stark: 10,
    Träffsäker: 10,
    Vaksam: 14,
    Viljestark: 12,
    Övertygande: 10
  };

  sandbox.store = {};
  sandbox.splitQuals = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String).filter(Boolean);
    return String(val).split(',').map(v => v.trim()).filter(Boolean);
  };
  sandbox.enforceArmorQualityExclusion = (_entry, qualities) => Array.isArray(qualities) ? qualities : [];
  sandbox.lookupEntry = (ref) => {
    const name = ref?.name || ref?.namn || '';
    if (!name) return null;
    for (const entry of db.values()) {
      if (entry.namn === name) return entry;
    }
    return null;
  };
  sandbox.invUtil = {
    getEntry(ref) {
      if (!ref) return null;
      const key = typeof ref === 'string' ? ref : (ref.id || ref.name || ref.namn || '');
      if (!key) return null;
      return db.get(key) || [...db.values()].find(entry => entry.namn === key) || null;
    },
    makeNameMap(rows) {
      const map = new Map();
      (Array.isArray(rows) ? rows : []).forEach(row => {
        map.set(row, row?.name || row?.id || '');
      });
      return map;
    }
  };
  sandbox.storeHelper = {
    HAMNSKIFTE_NAMES: { Robust: 'Hamnskifte robust' },
    getCurrentList() { return list; },
    getInventory() { return inventory; },
    getTraits() { return traits; },
    getDefenseSetup() { return { enabled: false, trait: '', armor: null, weapons: [], dancingTrait: '', dancingWeapon: null }; },
    getDefenseTrait() { return ''; }
  };
  sandbox.exceptionSkill = { getBonuses() { return {}; }, getBonus() { return 0; } };
  sandbox.maskSkill = { getBonuses() { return {}; }, getBonus() { return 0; } };
  sandbox.isTwoHandedWeaponType = () => false;
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/traits-utils.js'));

  const auto = sandbox.getAutoDefenseSetup({ list, inv: inventory, traitValues: traits });
  const selectedPaths = (auto.weapons || [])
    .map(item => Array.isArray(item.path) ? item.path.join('.') : '')
    .sort();
  deepEqual(selectedPaths, ['0', '1', '3'], 'Auto standard ska välja högsta giltiga uppsättning (2 vapen + Armfäst sköld)');
  assert(auto.dancingTrait === 'Vaksam', 'Auto dancing ska välja bästa dansande karaktärsdrag');
  assert(Array.isArray(auto.dancingWeapon?.path), 'Auto dancing ska välja ett dansvapen');
  assert(auto.dancingWeapon.path.join('.') === '4', 'Auto dancing ska välja vapnet som triggar bästa dansande drag');
}

function verifyTargetDrivenMonstruosKrav(rootPath) {
  const rasList = readEntryDataFile(rootPath, 'data/ras.json');
  const fordelList = readEntryDataFile(rootPath, 'data/fordel.json');
  const elityrkeList = readEntryDataFile(rootPath, 'data/elityrke.json');
  const monstruostSardrag = readEntryDataFile(rootPath, 'data/monstruost-sardrag.json');
  const sardrag = readEntryDataFile(rootPath, 'data/sardrag.json');
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const { getMissingRequirementReasonsForCandidate, getMonstruosTraitPermissions } = sandbox.rulesHelper;

  const troll = rasList.find(e => e.namn === 'Troll');
  const vandod = rasList.find(e => e.namn === 'Vandöd');
  const andrik = rasList.find(e => e.namn === 'Andrik');
  const monster = rasList.find(e => e.namn === 'Monster');
  const djurBjara = rasList.find(e => e.namn === 'Best');
  const morktBlod = fordelList.find(e => e.namn === 'Mörkt blod');
  const blodvadare = elityrkeList.find(e => e.namn === 'Blodvadare');
  const diminutiv = monstruostSardrag.find(e => e.namn === 'Diminutiv');
  const naturligtVapen = monstruostSardrag.find(e => e.namn === 'Naturligt vapen');
  const gravkyla = monstruostSardrag.find(e => e.namn === 'Gravkyla');
  const slukare = monstruostSardrag.find(e => e.namn === 'Slukare');
  const valdig = monstruostSardrag.find(e => e.namn === 'Väldig');
  const vingar = monstruostSardrag.find(e => e.namn === 'Vingar');
  const robustSardrag = sardrag.find(e => e.namn === 'Robust');

  assert(monster, 'Hittade inte rasen Monster');

  const hasReasonCode = (reasons, code) => (Array.isArray(reasons) ? reasons : [])
    .some(reason => String(reason?.code || '').trim() === code);

  sandbox.lookupEntry = () => null;

  // Test 1: Diminutiv blocked without source
  const missing1 = getMissingRequirementReasonsForCandidate(diminutiv, []);
  assert(missing1.length > 0, 'Diminutiv ska ha krav utan källa');

  // Test 2: Diminutiv permitted with only Andrik (entry-krav överstyr type-krav)
  const missing2 = getMissingRequirementReasonsForCandidate(diminutiv, [{ ...andrik, nivå: '' }]);
  assert(missing2.length === 0, 'Diminutiv ska vara tillåtet med enbart Andrik');

  // Test 3: Diminutiv permitted with only Best
  const missing3 = getMissingRequirementReasonsForCandidate(
    diminutiv,
    [{ ...djurBjara, nivå: '' }]
  );
  assert(missing3.length === 0, 'Diminutiv ska vara tillåtet med enbart Best');

  // Test 4: Diminutiv permitted with only Monster (type-krav fallback)
  const missing4 = getMissingRequirementReasonsForCandidate(
    diminutiv,
    [{ ...monster, nivå: '' }]
  );
  assert(missing4.length === 0, 'Diminutiv ska vara tillåtet med enbart Monster');

  // Test 5: Gravkyla blocked without Vandöd or Best
  const missing5 = getMissingRequirementReasonsForCandidate(
    gravkyla,
    [{ ...troll, nivå: '' }]
  );
  assert(missing5.length > 0, 'Gravkyla ska vara blockerat utan Vandöd/Best');

  // Test 6: Gravkyla permitted with Vandödhet (kravet ändrades från Vandöd)
  const missing6 = getMissingRequirementReasonsForCandidate(
    gravkyla,
    [{ ...monster, nivå: '' }, { id: 'test-vandodhet', namn: 'Vandödhet', taggar: { typ: ['Ras'] } }]
  );
  assert(missing6.length === 0, 'Gravkyla ska vara tillåtet med Vandödhet: ' + JSON.stringify(missing6));

  // Test 7: Vingar permitted with Mörkt blod
  const missing7 = getMissingRequirementReasonsForCandidate(
    vingar,
    [{ ...morktBlod, nivå: '' }]
  );
  assert(missing7.length === 0, 'Vingar ska vara tillåtet med Mörkt blod');

  // Test 8: Vingar blocked with Andrik-only (ingen entry-undantag och saknar Monster)
  const missing8 = getMissingRequirementReasonsForCandidate(vingar, [{ ...andrik, nivå: '' }]);
  assert(missing8.length > 0, 'Vingar ska vara blockerat med enbart Andrik');
  assert(
    hasReasonCode(missing8, 'monster_race_required'),
    'Vingar med enbart Andrik ska fortsatt blockeras av type-kravet Monster'
  );

  // Test 9: Robust (sardrag) permitted with Troll
  const missing9 = getMissingRequirementReasonsForCandidate(robustSardrag, [{ ...troll, nivå: '' }]);
  assert(missing9.length === 0, 'Robust (sardrag) ska vara tillåtet med Troll');

  // Test 10: Robust (sardrag) blocked without source
  const missing10 = getMissingRequirementReasonsForCandidate(robustSardrag, [{ ...andrik, nivå: '' }]);
  assert(missing10.length > 0, 'Robust (sardrag) ska vara blockerat utan källa');

  // Test 11: Blodsband.race counts as that race (Blodsband Andrik → permits Diminutiv)
  const blodsband = { namn: 'Blodsband', race: 'Andrik', nivå: '' };
  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'Andrik') return andrik;
    return null;
  };
  const missing11 = getMissingRequirementReasonsForCandidate(diminutiv, [blodsband]);
  assert(missing11.length === 0, 'Blodsband Andrik ska tillåta Diminutiv via nagon_av_namn');

  // Test 12: Naturligt vapen permitted with Blodvadare
  sandbox.lookupEntry = () => null;
  const missing12 = getMissingRequirementReasonsForCandidate(
    naturligtVapen,
    [{ ...blodvadare, nivå: '' }]
  );
  assert(missing12.length === 0, 'Naturligt vapen ska vara tillåtet med Blodvadare');

  // Test 12b: Slukare requires both Monster (type) and Väldig Novis (entry)
  const missing12bMonsterOnly = getMissingRequirementReasonsForCandidate(
    slukare,
    [{ ...monster, nivå: '' }]
  );
  assert(missing12bMonsterOnly.length > 0, 'Slukare ska vara blockerat med enbart Monster');
  const missing12bValdigOnly = getMissingRequirementReasonsForCandidate(
    slukare,
    [{ ...valdig, nivå: 'Novis' }]
  );
  assert(missing12bValdigOnly.length > 0, 'Slukare ska vara blockerat med enbart Väldig Novis');
  const missing12bBoth = getMissingRequirementReasonsForCandidate(
    slukare,
    [{ ...monster, nivå: '' }, { ...valdig, nivå: 'Novis' }]
  );
  assert(missing12bBoth.length === 0, 'Slukare ska vara tillåtet med Monster + Väldig Novis');

  // Test 13: No tillater_monstruost remains in data sources
  const allSources = [...rasList, ...fordelList, ...elityrkeList];
  const remaining = allSources.filter(e => (e?.taggar?.regler?.ger || []).some(r => r.mal === 'tillater_monstruost'));
  assert(remaining.length === 0, 'Ingen källa ska ha kvar tillater_monstruost: ' + remaining.map(e => e.namn).join(', '));

  // Test 14: getMonstruosTraitPermissions shim returns empty (deprecated)
  const shim = getMonstruosTraitPermissions([{ ...troll, nivå: '' }]);
  assert(!shim.allowAll, 'getMonstruosTraitPermissions-shim ska ge allowAll=false');
  assert(shim.allowedNames.size === 0, 'getMonstruosTraitPermissions-shim ska ge tom allowedNames');
}

function verifyUnifiedNarEvaluator(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const evaluateNar = sandbox.rulesHelper.evaluateNar;

  // No nar → always passes
  assert(evaluateNar(null, {}), 'null nar ska passera');
  assert(evaluateNar({}, {}), 'tom nar ska passera');

  // --- List conditions ---
  const listA = [{ namn: 'Robust' }, { namn: 'Stark' }];
  assert(evaluateNar({ har_namn: ['Robust'] }, { list: listA }), 'har_namn: Robust finns');
  assert(!evaluateNar({ har_namn: ['Smidig'] }, { list: listA }), 'har_namn: Smidig saknas');
  assert(!evaluateNar({ saknar_namn: ['Robust'] }, { list: listA }), 'saknar_namn: Robust finns');
  assert(evaluateNar({ saknar_namn: ['Smidig'] }, { list: listA }), 'saknar_namn: Smidig saknas → ok');
  assert(
    !evaluateNar({ har_namn_niva_minst: { Robust: 'Gesäll' } }, { list: [{ namn: 'Robust', nivå: 'Novis' }] }),
    'har_namn_niva_minst ska blockera för låg nivå'
  );
  assert(
    evaluateNar({ har_namn_niva_minst: { Robust: 'Gesäll' } }, { list: [{ namn: 'Robust', nivå: 'Mästare' }] }),
    'har_namn_niva_minst ska passera när nivåkrav uppfylls'
  );

  // --- nagon_av_namn ---
  assert(evaluateNar({ nagon_av_namn: ['Robust', 'Smidig'] }, { list: listA }), 'nagon_av_namn: Robust matchar');
  assert(!evaluateNar({ nagon_av_namn: ['Smidig', 'Kvick'] }, { list: listA }), 'nagon_av_namn: inget matchar');
  // Blodsband.race
  const blodsband = [{ namn: 'Blodsband', race: 'Andrik' }];
  assert(evaluateNar({ nagon_av_namn: ['Andrik'] }, { list: blodsband }), 'Blodsband.race ska räknas som Andrik');
  assert(
    !evaluateNar({ namn: ['Robust'], antal_namn_max: 1 }, { list: [{ namn: 'Robust' }, { namn: 'Robust' }] }),
    'antal_namn_max ska blockera när max överskrids'
  );
  assert(
    evaluateNar(
      { namn: ['Robust'], antal_namn_max: 1 },
      {
        list: [
          { namn: 'Robust' },
          { namn: 'Robust', taggar: { ignore_limits: true } }
        ]
      }
    ),
    'antal_namn_max ska ignorera entries med ignore_limits-tag'
  );
  assert(
    evaluateNar(
      { typ: ['Nackdel'], antal_typ_max: 1 },
      {
        list: [
          { namn: 'Nackdel A', taggar: { typ: ['Nackdel'] } },
          { namn: 'Nackdel B', taggar: { typ: ['Nackdel'], ignore_limits: true } }
        ]
      }
    ),
    'antal_typ_max ska ignorera entries med ignore_limits-tag'
  );

  // --- List conditions ignored when no list in context ---
  assert(evaluateNar({ har_namn: ['Robust'] }, {}), 'har_namn ignoreras utan list i kontext');
  assert(evaluateNar({ nagon_av_namn: ['Robust'] }, {}), 'nagon_av_namn ignoreras utan list i kontext');
  assert(
    evaluateNar({ endast_valda: true }, { sourceEntry: { id: 'mk-selected', namn: 'Vald kraft' } }),
    'endast_valda ignoreras när list saknas i kontext'
  );
  const selectedContext = {
    list: [{ id: 'mk-selected', namn: 'Vald kraft' }],
    sourceEntry: { id: 'mk-selected', namn: 'Vald kraft' }
  };
  assert(
    evaluateNar({ endast_valda: true }, selectedContext),
    'endast_valda=true ska matcha entries som finns i listan'
  );
  assert(
    !evaluateNar(
      { endast_valda: true },
      {
        list: selectedContext.list,
        sourceEntry: { id: 'mk-other', namn: 'Ovald kraft' }
      }
    ),
    'endast_valda=true ska blockera entries som saknas i listan'
  );
  assert(
    evaluateNar(
      { only_selected: false },
      {
        list: selectedContext.list,
        sourceEntry: { id: 'mk-other', namn: 'Ovald kraft' }
      }
    ),
    'only_selected=false ska tillåta entries som inte finns i listan'
  );

  // --- Weapon conditions ---
  const weaponCtx = {
    vapenFakta: [{ typer: ['Kort vapen'], kvaliteter: ['Balanserat'] }],
    antalVapen: 1
  };
  assert(evaluateNar({ har_utrustad_vapen_typ: ['Kort vapen'] }, weaponCtx), 'har_utrustad_vapen_typ matchar');
  assert(!evaluateNar({ ej_utrustad_vapen_typ: ['Kort vapen'] }, weaponCtx), 'ej_utrustad_vapen_typ blockerar');
  assert(!evaluateNar({ antal_utrustade_vapen_minst: 2 }, weaponCtx), 'antal_utrustade_vapen_minst: 2 > 1');
  assert(evaluateNar({ antal_utrustade_vapen_minst: 1 }, weaponCtx), 'antal_utrustade_vapen_minst: 1 = 1');

  // --- Weapon conditions ignored when no vapenFakta in context ---
  assert(evaluateNar({ har_utrustad_vapen_typ: ['Kort vapen'] }, {}), 'vapen-nar ignoreras utan vapenFakta');
  assert(evaluateNar({ antal_utrustade_vapen_minst: 2 }, {}), 'antal_vapen ignoreras utan vapenFakta');

  // --- Item (foremal) conditions ---
  const foremalCtx = { foremal: { typ: ['Vapen', 'Korta vapen'], kvalitet: ['Precist'] } };
  assert(evaluateNar({ foremal: { typ: ['Vapen'] } }, foremalCtx), 'foremal.typ matchar Vapen');
  assert(evaluateNar({ foremal: { typ: ['Korta vapen'] } }, foremalCtx), 'foremal.typ matchar Korta vapen');
  assert(!evaluateNar({ foremal: { typ: ['Tvåhandsvapen'] } }, foremalCtx), 'foremal.typ missar Tvåhandsvapen');
  assert(evaluateNar({ foremal: { ingen_typ: ['Tvåhandsvapen'] } }, foremalCtx), 'foremal.ingen_typ tillåter frånvaro');
  assert(!evaluateNar({ foremal: { ingen_typ: ['Vapen'] } }, foremalCtx), 'foremal.ingen_typ blockerar matchande typ');
  assert(evaluateNar({ foremal: { nagon_kvalitet: ['Precist'] } }, foremalCtx), 'foremal.nagon_kvalitet matchar Precist');
  assert(!evaluateNar({ foremal: { nagon_kvalitet: ['Balanserat'] } }, foremalCtx), 'foremal.nagon_kvalitet missar Balanserat');
  assert(evaluateNar({ foremal: { typ: ['Vapen'] } }, {}), 'foremal ignoreras utan foremal i kontext');

  // --- Combat context flags ---
  assert(evaluateNar({ narstrid: true }, { narstrid: true }), 'narstrid matchar true');
  assert(!evaluateNar({ narstrid: true }, { narstrid: false }), 'narstrid mismatch blockerar');
  assert(evaluateNar({ avstand: true }, { avstand: true }), 'avstand matchar true');
  assert(!evaluateNar({ avstand: true }, { avstand: false }), 'avstand mismatch blockerar');
  assert(evaluateNar({ overtag: true }, { overtag: true }), 'overtag matchar true');
  assert(!evaluateNar({ overtag: true }, { overtag: false }), 'overtag mismatch blockerar');
  assert(evaluateNar({ efter_forflyttning: true }, { efter_forflyttning: true }), 'efter_forflyttning matchar true');
  assert(!evaluateNar({ efter_forflyttning: true }, { efter_forflyttning: false }), 'efter_forflyttning mismatch blockerar');
  assert(evaluateNar({ narstrid: true }, {}), 'combat-flaggor ignoreras utan motsvarande kontext');

  // --- Armor conditions ---
  const armorCtx = { utrustadTyper: ['Rustning'] };
  assert(evaluateNar({ har_utrustad_typ: ['Rustning'] }, armorCtx), 'har_utrustad_typ matchar');
  assert(!evaluateNar({ har_utrustad_typ: ['Rustning'] }, { utrustadTyper: [] }), 'har_utrustad_typ missar tom lista');
  assert(evaluateNar({ har_utrustad_typ: ['Rustning'] }, {}), 'har_utrustad_typ ignoreras utan utrustadTyper');

  // --- computedValues conditions ---
  const cv = { computedValues: { permanent_korruption: 4 } };
  assert(evaluateNar({ mal_minst: { permanent_korruption: 4 } }, cv), 'mal_minst: 4 >= 4');
  assert(!evaluateNar({ mal_minst: { permanent_korruption: 5 } }, cv), 'mal_minst: 4 < 5');
  assert(!evaluateNar({ har_mal: 'permanent_korruption' }, { computedValues: { permanent_korruption: 0 } }), 'har_mal: 0 är falsy');
  assert(evaluateNar({ har_mal: 'permanent_korruption' }, cv), 'har_mal: 4 är truthy');
  assert(!evaluateNar({ mal_saknas: 'permanent_korruption' }, cv), 'mal_saknas: 4 finns → blockeras');
  assert(evaluateNar({ mal_saknas: 'permanent_korruption' }, { computedValues: {} }), 'mal_saknas: saknas → ok');

  // --- computedValues ignored without computedValues in context ---
  assert(evaluateNar({ mal_minst: { permanent_korruption: 999 } }, {}), 'mal_minst ignoreras utan computedValues');

  // --- Mixed context: list + weapon ---
  const mixed = { list: listA, vapenFakta: weaponCtx.vapenFakta, antalVapen: 1 };
  assert(evaluateNar({ har_namn: ['Robust'], har_utrustad_vapen_typ: ['Kort vapen'] }, mixed), 'blandat kontext: båda villkor uppfyllda');
  assert(!evaluateNar({ har_namn: ['Smidig'], har_utrustad_vapen_typ: ['Kort vapen'] }, mixed), 'blandat: lista-villkor misslyckas');

  // --- Backward-compat: evaluateVapenNar wrapper ---
  const evn = sandbox.rulesHelper.evaluateVapenNar;
  assert(evn({ har_utrustad_vapen_typ: ['Kort vapen'] }, { vapenFakta: weaponCtx.vapenFakta, antalVapen: 1 }), 'evaluateVapenNar wrapper fungerar');

  // --- Backward-compat: evaluateRustningNar wrapper ---
  const ern = sandbox.rulesHelper.evaluateRustningNar;
  assert(ern({}, {}), 'evaluateRustningNar: tom nar passerar');
}

function verifySeparateDefenseRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const monstruostSardrag = readEntryDataFile(rootPath, 'data/monstruost-sardrag.json');
  const mystiskKraft = readEntryDataFile(rootPath, 'data/mystisk-kraft.json');
  const kvalitet = readEntryDataFile(rootPath, 'data/kvalitet.json');

  const hamRobust = monstruostSardrag.find(e => e.id === 'hamnskifte_grants1');
  const dansandeVapen = mystiskKraft.find(e => e.id === 'mystiskkr6');
  const balanserat = kvalitet.find(e => e.namn === 'Balanserat');

  assert(hamRobust, 'Hittade inte hamnskifte_grants1 i monstruost-sardrag.json');
  assert(dansandeVapen, 'Hittade inte mystiskkr6 (Dansande vapen) i mystisk-kraft.json');
  assert(balanserat, 'Hittade inte Balanserat i kvalitet.json');

  const { getSeparateDefenseTraitRules, getSelectiveDefenseModifier } = sandbox.rulesHelper;
  assert(typeof getSeparateDefenseTraitRules === 'function', 'getSeparateDefenseTraitRules ska vara exporterad');
  assert(typeof getSelectiveDefenseModifier === 'function', 'getSelectiveDefenseModifier ska vara exporterad');

  // Test 1: Empty list → no rules
  assert(getSeparateDefenseTraitRules([]).length === 0, 'Tom lista ska ge inga separat-regler');

  // Test 2: Hamnskifte Robust Novis → 1 rule with varde:"Kvick", modifierare:-2, no tillat
  const hamNovis = { ...hamRobust, nivå: 'Novis' };
  const rulesNovis = getSeparateDefenseTraitRules([hamNovis]);
  assert(rulesNovis.length === 1, `Hamnskifte Robust Novis ska ge 1 regel, fick ${rulesNovis.length}`);
  assert(rulesNovis[0].varde === 'Kvick', `Regel ska ha varde=Kvick, fick ${rulesNovis[0].varde}`);
  assert(rulesNovis[0].modifierare === -2, `Regel ska ha modifierare=-2, fick ${rulesNovis[0].modifierare}`);
  assert(!rulesNovis[0].tillat, 'Hamnskifte Robust Novis ska inte ha tillat-konfiguration');

  // Test 3: Hamnskifte Robust Gesäll → modifierare:-3
  const hamGesall = { ...hamRobust, nivå: 'Gesäll' };
  const rulesGesall = getSeparateDefenseTraitRules([hamGesall]);
  assert(rulesGesall.length === 1, 'Hamnskifte Robust Gesäll ska ge 1 regel');
  assert(rulesGesall[0].modifierare === -3, `Gesäll ska ha modifierare=-3, fick ${rulesGesall[0].modifierare}`);

  // Test 4: Hamnskifte Robust Mästare → modifierare:-4
  const hamMastare = { ...hamRobust, nivå: 'Mästare' };
  const rulesMastare = getSeparateDefenseTraitRules([hamMastare]);
  assert(rulesMastare.length === 1, 'Hamnskifte Robust Mästare ska ge 1 regel');
  assert(rulesMastare[0].modifierare === -4, `Mästare ska ha modifierare=-4, fick ${rulesMastare[0].modifierare}`);

  // Test 5: getSelectiveDefenseModifier — no tillat (fully isolated) → 0
  assert(getSelectiveDefenseModifier([hamNovis], [], {}, undefined) === 0,
    'Utan tillat ska getSelectiveDefenseModifier ge 0');
  assert(getSelectiveDefenseModifier([hamNovis], [], {}, {}) === 0,
    'Tom tillat ska ge 0');

  // Test 6: getSelectiveDefenseModifier — tillat.vapen_kvaliteter → Balanserat quality gives +1
  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'Balanserat') return balanserat;
    return null;
  };
  const balaFact = { entryRef: null, types: [], qualities: ['Balanserat'] };
  const bonusWithQual = getSelectiveDefenseModifier([], [balaFact], {}, { vapen_kvaliteter: true });
  assert(bonusWithQual === 1, `tillat.vapen_kvaliteter med Balanserat ska ge +1, fick ${bonusWithQual}`);

  // Test 7: getSelectiveDefenseModifier — no tillat → Balanserat does NOT contribute
  const bonusNoTillat = getSelectiveDefenseModifier([], [balaFact], {}, {});
  assert(bonusNoTillat === 0, `Utan tillat ska Balanserat inte bidra, fick ${bonusNoTillat}`);

  // Test 8: Dansande vapen Mästare rule → varde:"Viljestark", tillat.vapen_typer+vapen_kvaliteter
  const dansandeMastare = { ...dansandeVapen, nivå: 'Mästare' };
  const rulesDansande = getSeparateDefenseTraitRules([dansandeMastare]);
  assert(rulesDansande.length === 1, `Dansande vapen Mästare ska ge 1 regel, fick ${rulesDansande.length}`);
  assert(rulesDansande[0].varde === 'Viljestark', `Dansande vapen ska ha varde=Viljestark, fick ${rulesDansande[0].varde}`);
  assert(rulesDansande[0].tillat?.vapen_typer === true, 'Dansande vapen ska ha tillat.vapen_typer=true');
  assert(rulesDansande[0].tillat?.vapen_kvaliteter === true, 'Dansande vapen ska ha tillat.vapen_kvaliteter=true');
  assert(!rulesDansande[0].tillat?.rustning, 'Dansande vapen ska inte ha tillat.rustning');

  // Test 9: Dansande vapen — Balanserat applies (tillat.vapen_kvaliteter)
  const bonusDansande = getSelectiveDefenseModifier([], [balaFact], {}, rulesDansande[0].tillat);
  assert(bonusDansande === 1, `Dansande vapen med Balanserat ska ge +1, fick ${bonusDansande}`);

  // Test 10: sourceEntryName is attached to rules
  assert(rulesNovis[0].sourceEntryName === hamRobust.namn,
    `Regel ska ha sourceEntryName="${hamRobust.namn}", fick "${rulesNovis[0].sourceEntryName}"`);
  assert(rulesDansande[0].sourceEntryName === dansandeVapen.namn,
    `Dansande vapen regel ska ha sourceEntryName="${dansandeVapen.namn}", fick "${rulesDansande[0].sourceEntryName}"`);
}

function verifyItemWeightModifiers(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const { getItemWeightModifiers, evaluateNar } = sandbox.rulesHelper;

  const rope = { id: 'di12', namn: 'Rep, 10 meter', taggar: { typ: ['Diverse'] } };
  const torch = { id: 'di1', namn: 'Fackla', taggar: { typ: ['Diverse'] } };

  const repmastare = {
    id: 'bas4',
    namn: 'Repmästare',
    taggar: {
      typ: ['Basförmåga'],
      regler: {
        andrar: [
          { mal: 'vikt_faktor', nar: { foremal: { id: ['di12'] } }, varde: 0.5 }
        ]
      }
    }
  };

  // Test 1: no modifier when list is empty
  const mod0 = getItemWeightModifiers([], rope);
  assert(mod0.faktor === 1, `Faktor ska vara 1 utan regler, fick ${mod0.faktor}`);
  assert(mod0.tillagg === 0, `Tillagg ska vara 0 utan regler, fick ${mod0.tillagg}`);

  // Test 2: vikt_faktor 0.5 applied to rope when Repmästare is in list
  const mod1 = getItemWeightModifiers([repmastare], rope);
  assert(mod1.faktor === 0.5, `Repmästare ska halvera vikten av rep, faktor=${mod1.faktor}`);
  assert(mod1.tillagg === 0, `Tillagg ska vara 0, fick ${mod1.tillagg}`);

  // Test 3: no modifier applied to unrelated item (torch)
  const mod2 = getItemWeightModifiers([repmastare], torch);
  assert(mod2.faktor === 1, `Repmästare ska inte ändra vikten av fackla, faktor=${mod2.faktor}`);

  // Test 4: multiple vikt_faktor rules stack multiplicatively
  const extraHalf = {
    id: 'test1', namn: 'Halvare', taggar: { typ: ['Särdrag'],
      regler: { andrar: [{ mal: 'vikt_faktor', nar: { foremal: { id: ['di12'] } }, varde: 0.5 }] }
    }
  };
  const mod3 = getItemWeightModifiers([repmastare, extraHalf], rope);
  assert(Math.abs(mod3.faktor - 0.25) < 0.001, `Två halvare ska ge faktor 0.25, fick ${mod3.faktor}`);

  // Test 5: vikt_tillagg works additively
  const addRule = {
    id: 'test2', namn: 'Lättare', taggar: { typ: ['Särdrag'],
      regler: { andrar: [{ mal: 'vikt_tillagg', nar: { foremal: { id: ['di12'] } }, varde: -0.2 }] }
    }
  };
  const mod4 = getItemWeightModifiers([addRule], rope);
  assert(mod4.faktor === 1, `vikt_tillagg ska inte ändra faktor, faktor=${mod4.faktor}`);
  assert(Math.abs(mod4.tillagg - (-0.2)) < 0.001, `vikt_tillagg ska ge tillagg=-0.2, fick ${mod4.tillagg}`);

  // Test 6: nar.foremal.namn matching by name
  const nameRule = {
    id: 'test3', namn: 'Namnmatchare', taggar: { typ: ['Särdrag'],
      regler: { andrar: [{ mal: 'vikt_faktor', nar: { foremal: { namn: ['Rep, 10 meter'] } }, varde: 0.5 }] }
    }
  };
  const mod5 = getItemWeightModifiers([nameRule], rope);
  assert(mod5.faktor === 0.5, `Namnmatchning ska ge faktor 0.5 för rep, fick ${mod5.faktor}`);
  const mod6 = getItemWeightModifiers([nameRule], torch);
  assert(mod6.faktor === 1, `Namnmatchning ska inte träffa fackla, fick ${mod6.faktor}`);

  // Test 7: evaluateNar foremal.id works in isolation
  const narWithId = { foremal: { id: ['di12'] } };
  assert(evaluateNar(narWithId, { foremal: { id: 'di12' } }), 'foremal.id ska matcha di12');
  assert(!evaluateNar(narWithId, { foremal: { id: 'di1' } }), 'foremal.id ska inte matcha di1');
}

function verifyQualityPriceAndFreeRules(rootPath) {
  const sandbox = createSandbox();
  sandbox.SBASE = 10;
  sandbox.OBASE = 10;
  sandbox.document = {
    body: { dataset: {} },
    querySelector() { return null; },
    getElementById() { return null; }
  };
  sandbox.store = { current: 'quality-price-test' };
  const LEVEL_IDX = { '': 0, Novis: 1, Gesäll: 2, Mästare: 3 };
  let activeList = [];
  let partySmith = '';
  let partyAlchemist = '';
  let partyArtefacter = '';
  sandbox.storeHelper = {
    getCustomEntries() { return []; },
    getPartySmith() { return partySmith; },
    getPartyAlchemist() { return partyAlchemist; },
    getPartyArtefacter() { return partyArtefacter; },
    abilityLevel(list, name) {
      const wanted = String(name || '').trim().toLowerCase();
      return (Array.isArray(list) ? list : []).reduce((max, entry) => {
        if (String(entry?.namn || '').trim().toLowerCase() !== wanted) return max;
        const lvl = LEVEL_IDX[String(entry?.nivå || '').trim()] || 0;
        return Math.max(max, lvl);
      }, 0);
    },
    getCurrentList() { return activeList; }
  };
  sandbox.splitQuals = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  };

  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));

  const kvalitet = readEntryDataFile(rootPath, 'data/kvalitet.json');
  const mystiskKvalitet = readEntryDataFile(rootPath, 'data/mystisk-kvalitet.json');
  const negativKvalitet = readEntryDataFile(rootPath, 'data/negativ-kvalitet.json');
  const neutralKvalitet = readEntryDataFile(rootPath, 'data/neutral-kvalitet.json');
  const formagor = readEntryDataFile(rootPath, 'data/formaga.json');
  const lowerArtifacts = readEntryDataFile(rootPath, 'data/lagre-artefakter.json');

  const qualityEntries = [
    ...kvalitet,
    ...mystiskKvalitet,
    ...negativKvalitet,
    ...neutralKvalitet
  ];
  const qualityByName = new Map(
    qualityEntries
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => [String(entry.namn || '').trim(), entry])
  );
  const findQuality = (name) => qualityByName.get(String(name || '').trim()) || null;
  const formagaByName = new Map(
    formagor
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => [String(entry.namn || '').trim(), entry])
  );
  const findFormaga = (name) => formagaByName.get(String(name || '').trim()) || null;
  const lowerArtifactById = new Map(
    lowerArtifacts
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => [String(entry.id || '').trim(), entry])
  );

  [
    'Precist',
    'Brinnande',
    'Trubbigt',
    'Kort',
    'Robustanpassad (Novis)',
    'Robustanpassad (Gesäll)',
    'Robustanpassad (Mästare)'
  ].forEach(name => {
    assert(findQuality(name), `Hittade inte kvaliteten ${name}`);
  });

  const dynamicEntriesById = new Map();
  sandbox.lookupEntry = (ref) => {
    const id = String(ref?.id || '').trim();
    const name = String(ref?.name || ref?.namn || '').trim();
    if (id && dynamicEntriesById.has(id)) return dynamicEntriesById.get(id);
    if (name && qualityByName.has(name)) return qualityByName.get(name);
    if (name && formagaByName.has(name)) return formagaByName.get(name);
    if (name) {
      for (const entry of dynamicEntriesById.values()) {
        if (String(entry?.namn || '').trim() === name) return entry;
      }
    }
    return null;
  };

  const armorTarget = {
    id: 'target-rustning',
    namn: 'Testpansar',
    taggar: { typ: ['Rustning'] }
  };
  const weaponTarget = {
    id: 'target-vapen',
    namn: 'Testsvärd',
    taggar: { typ: ['Vapen'] }
  };

  const { getItemQualityRuleEffects, getItemPriceRuleEffects, queryMal } = sandbox.rulesHelper;
  assert(typeof getItemQualityRuleEffects === 'function', 'rulesHelper ska exponera getItemQualityRuleEffects');
  assert(typeof getItemPriceRuleEffects === 'function', 'rulesHelper ska exponera getItemPriceRuleEffects');

  const baseEffects = getItemQualityRuleEffects(
    ['Precist', 'Brinnande', 'Trubbigt', 'Kort'],
    armorTarget
  );
  assert(baseEffects['Precist'].multiplier === 5, `Precist ska ge pris_faktor=5, fick ${baseEffects['Precist'].multiplier}`);
  assert(baseEffects['Brinnande'].multiplier === 10, `Brinnande ska ge pris_faktor=10, fick ${baseEffects['Brinnande'].multiplier}`);
  assert(Math.abs(baseEffects['Trubbigt'].multiplier - 0.2) < 0.0001, `Trubbigt ska ge pris_faktor=0.2, fick ${baseEffects['Trubbigt'].multiplier}`);
  assert(baseEffects['Kort'].multiplier === 1, `Kort ska sakna pris_faktor och ge 1, fick ${baseEffects['Kort'].multiplier}`);
  assert(baseEffects['Precist'].gratisbar === true, 'Precist ska vara kvalitet_gratisbar=true');
  assert(baseEffects['Brinnande'].gratisbar === true, 'Brinnande ska vara kvalitet_gratisbar=true');
  assert(baseEffects['Trubbigt'].gratisbar === false, 'Trubbigt ska vara kvalitet_gratisbar=false');
  assert(baseEffects['Kort'].gratisbar === false, 'Kort ska defaulta till kvalitet_gratisbar=false');

  const robustArmorEffects = getItemQualityRuleEffects(
    ['Robustanpassad (Novis)', 'Robustanpassad (Gesäll)', 'Robustanpassad (Mästare)'],
    armorTarget
  );
  assert(robustArmorEffects['Robustanpassad (Novis)'].multiplier === 2, 'Robustanpassad (Novis) ska ge x2 på rustning');
  assert(robustArmorEffects['Robustanpassad (Gesäll)'].multiplier === 3, 'Robustanpassad (Gesäll) ska ge x3 på rustning');
  assert(robustArmorEffects['Robustanpassad (Mästare)'].multiplier === 4, 'Robustanpassad (Mästare) ska ge x4 på rustning');
  assert(robustArmorEffects['Robustanpassad (Novis)'].gratisbar === false, 'Robustanpassad (Novis) ska vara explicit icke-gratisbar');
  assert(robustArmorEffects['Robustanpassad (Gesäll)'].gratisbar === false, 'Robustanpassad (Gesäll) ska vara explicit icke-gratisbar');
  assert(robustArmorEffects['Robustanpassad (Mästare)'].gratisbar === false, 'Robustanpassad (Mästare) ska vara explicit icke-gratisbar');

  const robustWeaponEffects = getItemQualityRuleEffects(
    ['Robustanpassad (Gesäll)'],
    weaponTarget
  );
  assert(robustWeaponEffects['Robustanpassad (Gesäll)'].multiplier === 1, 'Robustanpassad ska inte påverka icke-rustning');
  assert(robustWeaponEffects['Robustanpassad (Gesäll)'].gratisbar === false, 'Robustanpassad ska vara false även när villkor ej matchar');

  const robustNovis = findQuality('Robustanpassad (Novis)');
  const robustGesall = findQuality('Robustanpassad (Gesäll)');
  const robustMastare = findQuality('Robustanpassad (Mästare)');
  assert(robustNovis && robustGesall && robustMastare, 'Hittade inte Robustanpassad-kvaliteter för krocktest');
  const mediumArmorTargetForConflicts = {
    id: 'target-medium-rustning',
    namn: 'Testrustning Medeltung',
    taggar: { typ: ['Rustning', 'Medeltung Rustning'] }
  };
  const lightArmorTargetForConflicts = {
    id: 'target-light-rustning',
    namn: 'Testrustning Lätt',
    taggar: { typ: ['Rustning', 'Lätt Rustning'] }
  };
  const robustOnMedium = sandbox.rulesHelper.getConflictResolutionForCandidate(
    robustNovis,
    [mediumArmorTargetForConflicts],
    { conditionContext: { foremal: { typ: mediumArmorTargetForConflicts.taggar.typ } } }
  );
  assert(
    Array.isArray(robustOnMedium?.blockingReasons)
      && robustOnMedium.blockingReasons.some(reason => String(reason?.code || '') === 'kvalitet_krockar_med_foremaltyp'),
    'Robustanpassad ska krocka med Medeltung Rustning'
  );
  const robustOnLight = sandbox.rulesHelper.getConflictResolutionForCandidate(
    robustNovis,
    [lightArmorTargetForConflicts],
    { conditionContext: { foremal: { typ: lightArmorTargetForConflicts.taggar.typ } } }
  );
  assert(
    Array.isArray(robustOnLight?.blockingReasons) && robustOnLight.blockingReasons.length === 0,
    'Robustanpassad ska inte krocka med Lätt Rustning'
  );
  const robustPairConflict = sandbox.rulesHelper.getConflictResolutionForCandidate(
    robustGesall,
    [robustNovis],
    { conditionContext: { foremal: { typ: lightArmorTargetForConflicts.taggar.typ } } }
  );
  assert(
    Array.isArray(robustPairConflict?.blockingReasons)
      && robustPairConflict.blockingReasons.some(reason => String(reason?.code || '') === 'kvalitet_krockar_med_andra_i_grupp'),
    'Robustanpassad-kvaliteter ska krocka med varandra'
  );

  const cumulativeEffects = getItemQualityRuleEffects(
    ['Precist', 'Robustanpassad (Novis)', 'Trubbigt'],
    armorTarget
  );
  const cumulativeMultiplier = cumulativeEffects['Precist'].multiplier
    * cumulativeEffects['Robustanpassad (Novis)'].multiplier
    * cumulativeEffects['Trubbigt'].multiplier;
  assert(Math.abs(cumulativeMultiplier - 2) < 0.0001, `Kvalitetsfaktorer ska vara kumulativa (förväntat 2, fick ${cumulativeMultiplier})`);

  assert(
    queryMal([findQuality('Precist')], 'pris_faktor', { targetEntry: armorTarget, qualityNames: ['Precist'] }) === 5,
    'queryMal(pris_faktor) ska läsa datadrivet pris_faktor'
  );
  assert(
    queryMal([findQuality('Precist')], 'kvalitet_gratisbar', { targetEntry: armorTarget, qualityNames: ['Precist'] }) === true,
    'queryMal(kvalitet_gratisbar) ska läsa explicit true'
  );
  assert(
    queryMal([findQuality('Trubbigt')], 'kvalitet_gratisbar', { targetEntry: armorTarget, qualityNames: ['Trubbigt'] }) === false,
    'queryMal(kvalitet_gratisbar) ska läsa explicit false'
  );
  assert(
    queryMal([findQuality('Kort')], 'kvalitet_gratisbar', { targetEntry: armorTarget, qualityNames: ['Kort'] }) === false,
    'queryMal(kvalitet_gratisbar) ska defaulta till false när regel saknas'
  );

  const opRuleEntry = {
    id: 'op-rule-entry',
    namn: 'Prisregeloperationer',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'pris_faktor', operation: 'addera', varde: 10, nar: { foremal: { typ: ['Elixir'] } } },
          { mal: 'pris_faktor', operation: 'subtrahera', varde: 3, nar: { foremal: { typ: ['Elixir'] } } },
          { mal: 'pris_faktor', operation: 'multiplicera', varde: 2, nar: { foremal: { typ: ['Elixir'] } } },
          { mal: 'pris_faktor', operation: 'dividera', varde: 4, nar: { foremal: { typ: ['Elixir'] } } }
        ]
      }
    }
  };
  const opTarget = {
    id: 'op-target',
    namn: 'Operationselixir',
    nivå: 'Gesäll',
    taggar: { typ: ['Elixir'] }
  };
  const opEffects = getItemPriceRuleEffects([opRuleEntry], [], opTarget);
  assert(opEffects.additiveO === 7, `pris_faktor add/sub ska ge additiveO=7, fick ${opEffects.additiveO}`);
  assert(Math.abs(opEffects.factor - 0.5) < 0.0001, `pris_faktor mul/div ska ge faktor=0.5, fick ${opEffects.factor}`);
  const orderedPrice = (100 + opEffects.additiveO) * opEffects.factor;
  assert(Math.abs(orderedPrice - 53.5) < 0.0001, `Prisordningen ska vara ((bas+additivt)*faktor), fick ${orderedPrice}`);

  const selectorEntry = {
    id: 'selector-rule-entry',
    namn: 'Selektorregler',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'pris_faktor', varde: 2, nar: { foremal: { id: ['sel-item'] } } },
          { mal: 'pris_faktor', varde: 3, nar: { foremal: { namn: ['Selektorobjekt'] } } },
          { mal: 'pris_faktor', varde: 4, nar: { foremal: { niva: ['Gesäll'] } } }
        ]
      }
    }
  };
  const selectorEffects = getItemPriceRuleEffects([selectorEntry], [], {
    id: 'sel-item',
    namn: 'Selektorobjekt',
    nivå: 'Gesäll',
    taggar: { typ: ['Diverse'] }
  });
  assert(Math.abs(selectorEffects.factor - 24) < 0.0001, `Selektorer id/namn/niva ska stapla till faktor 24, fick ${selectorEffects.factor}`);

  const orRuleEntry = {
    id: 'or-rule-entry',
    namn: 'OR-regel',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'pris_faktor',
            varde: 2,
            matchning: 'or',
            nar: { foremal: { typ: ['Rustning'], id: ['target-vapen'] } }
          }
        ]
      }
    }
  };
  const andRuleEntry = {
    id: 'and-rule-entry',
    namn: 'AND-regel',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          {
            mal: 'pris_faktor',
            varde: 2,
            nar: { foremal: { typ: ['Rustning'], id: ['target-vapen'] } }
          }
        ]
      }
    }
  };
  const orFactor = getItemPriceRuleEffects([orRuleEntry], [], weaponTarget).factor;
  const andFactor = getItemPriceRuleEffects([andRuleEntry], [], weaponTarget).factor;
  assert(Math.abs(orFactor - 2) < 0.0001, `matchning=or ska träffa när minst ett villkor matchar, fick ${orFactor}`);
  assert(Math.abs(andFactor - 1) < 0.0001, `Default matchning=and ska kräva alla villkor, fick ${andFactor}`);

  const qualityConflictCandidate = {
    id: 'quality-conflict-candidate',
    namn: 'Krockkvalitet',
    taggar: {
      typ: ['Kvalitet', 'Vapenkvalitet'],
      regler: {
        krockar: [
          {
            namn: ['Provokatör'],
            nar: { foremal: { typ: ['Vapen'] } },
            varde: 'quality_vs_entry_conflict'
          }
        ]
      }
    }
  };
  const qualityConflictPeer = {
    id: 'quality-conflict-peer',
    namn: 'Krockkvalitet B',
    taggar: { typ: ['Kvalitet', 'Vapenkvalitet'] }
  };
  const qualityToQualityCandidate = {
    id: 'quality-conflict-candidate-2',
    namn: 'Krockkvalitet A',
    taggar: {
      typ: ['Kvalitet', 'Vapenkvalitet'],
      regler: {
        krockar: [
          {
            namn: ['Krockkvalitet B'],
            nar: { foremal: { typ: ['Vapen'] } },
            varde: 'quality_vs_quality_conflict'
          }
        ]
      }
    }
  };
  const provokator = findFormaga('Provokatör');
  assert(provokator, 'Hittade inte Provokatör för quality-krocktest');

  const qualityEntryConflict = sandbox.rulesHelper.getConflictResolutionForCandidate(
    qualityConflictCandidate,
    [provokator],
    { conditionContext: { foremal: { typ: ['Vapen'] } } }
  );
  assert(
    Array.isArray(qualityEntryConflict?.blockingReasons) && qualityEntryConflict.blockingReasons.length === 1,
    `conditionContext.foremal ska aktivera quality->entry-krock (förväntat 1, fick ${qualityEntryConflict?.blockingReasons?.length || 0})`
  );

  const qualityEntryNoConflict = sandbox.rulesHelper.getConflictResolutionForCandidate(
    qualityConflictCandidate,
    [provokator],
    { conditionContext: { foremal: { typ: ['Rustning'] } } }
  );
  assert(
    Array.isArray(qualityEntryNoConflict?.blockingReasons) && qualityEntryNoConflict.blockingReasons.length === 0,
    `conditionContext.foremal ska kunna filtrera bort quality->entry-krock (förväntat 0, fick ${qualityEntryNoConflict?.blockingReasons?.length || 0})`
  );

  const qualityQualityConflict = sandbox.rulesHelper.getConflictResolutionForCandidate(
    qualityToQualityCandidate,
    [qualityConflictPeer],
    { conditionContext: { foremal: { typ: ['Vapen'] } } }
  );
  assert(
    Array.isArray(qualityQualityConflict?.blockingReasons) && qualityQualityConflict.blockingReasons.length === 1,
    `conditionContext.foremal ska aktivera quality->quality-krock (förväntat 1, fick ${qualityQualityConflict?.blockingReasons?.length || 0})`
  );

  const qualityQualityNoConflict = sandbox.rulesHelper.getConflictResolutionForCandidate(
    qualityToQualityCandidate,
    [qualityConflictPeer],
    { conditionContext: { foremal: { typ: ['Rustning'] } } }
  );
  assert(
    Array.isArray(qualityQualityNoConflict?.blockingReasons) && qualityQualityNoConflict.blockingReasons.length === 0,
    `conditionContext.foremal ska kunna filtrera bort quality->quality-krock (förväntat 0, fick ${qualityQualityNoConflict?.blockingReasons?.length || 0})`
  );

  loadBrowserScript(sandbox, joinPath(rootPath, 'js/inventory-utils.js'));
  assert(typeof sandbox.invUtil?.calcEntryCost === 'function', 'inventory-utils ska exponera calcEntryCost');
  assert(typeof sandbox.invUtil?.calcRowCost === 'function', 'inventory-utils ska exponera calcRowCost');

  const armorWithPrecist = {
    id: 'inv-test-armor-precist',
    namn: 'Testrustning Precist',
    taggar: { typ: ['Rustning'], kvalitet: ['Precist'] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  const armorWithRobust = {
    id: 'inv-test-armor-robust',
    namn: 'Testrustning Robust',
    taggar: { typ: ['Rustning'], kvalitet: ['Robustanpassad (Gesäll)'] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  const weaponWithRobust = {
    id: 'inv-test-weapon-robust',
    namn: 'Testvapen Robust',
    taggar: { typ: ['Vapen'], kvalitet: ['Robustanpassad (Gesäll)'] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  [armorWithPrecist, armorWithRobust, weaponWithRobust].forEach(entry => {
    dynamicEntriesById.set(entry.id, entry);
  });
  sandbox.DB = [
    ...qualityEntries,
    armorWithPrecist,
    armorWithRobust,
    weaponWithRobust
  ];

  const entryCostPrecist = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(armorWithPrecist));
  assert(entryCostPrecist === 500, `calcEntryCost ska använda pris_faktor för kvalitet (förväntat 500, fick ${entryCostPrecist})`);
  const entryCostRobustArmor = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(armorWithRobust));
  assert(entryCostRobustArmor === 300, `calcEntryCost ska använda Robustanpassad på rustning (förväntat 300, fick ${entryCostRobustArmor})`);
  const entryCostRobustWeapon = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(weaponWithRobust));
  assert(entryCostRobustWeapon === 100, `calcEntryCost ska ignorera Robustanpassad på icke-rustning (förväntat 100, fick ${entryCostRobustWeapon})`);

  const rowPrecistFree = {
    id: armorWithPrecist.id,
    name: armorWithPrecist.namn,
    qty: 1,
    gratis: 0,
    kvaliteter: [],
    gratisKval: ['Precist'],
    removedKval: []
  };
  const rowPrecistFreeCost = sandbox.moneyToO(sandbox.invUtil.calcRowCost(rowPrecistFree, 0, 0, 0));
  assert(rowPrecistFreeCost === 100, `Gratisbar kvalitet ska kunna markeras gratis i prisberäkning (förväntat 100, fick ${rowPrecistFreeCost})`);

  const rowRobustFreeAttempt = {
    id: armorWithRobust.id,
    name: armorWithRobust.namn,
    qty: 1,
    gratis: 0,
    kvaliteter: [],
    gratisKval: ['Robustanpassad (Gesäll)'],
    removedKval: []
  };
  const rowRobustFreeCost = sandbox.moneyToO(sandbox.invUtil.calcRowCost(rowRobustFreeAttempt, 0, 0, 0));
  assert(rowRobustFreeCost === 300, `Icke-gratisbar kvalitet ska inte bli gratis i prisberäkning (förväntat 300, fick ${rowRobustFreeCost})`);

  const armorPlain = {
    id: 'inv-test-armor-plain',
    namn: 'Testrustning Bas',
    taggar: { typ: ['Rustning'], kvalitet: [] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  const genericPriceAbility = {
    id: 'test-price-ability',
    namn: 'Prisjusterare',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'pris_faktor', operation: 'addera', varde: 2, nar: { foremal: { typ: ['Rustning'] } } },
          { mal: 'pris_faktor', operation: 'multiplicera', varde: 2, nar: { foremal: { typ: ['Rustning'] } } }
        ]
      }
    }
  };
  [armorPlain].forEach(entry => dynamicEntriesById.set(entry.id, entry));
  sandbox.DB = [...sandbox.DB, armorPlain];

  activeList = [genericPriceAbility];
  const entryCostWithListRules = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(armorPlain));
  assert(entryCostWithListRules === 204, `calcEntryCost ska följa ((bas+additivt)*faktor) (förväntat 204, fick ${entryCostWithListRules})`);
  const rowCostWithListRules = sandbox.moneyToO(sandbox.invUtil.calcRowCost({
    id: armorPlain.id,
    name: armorPlain.namn,
    qty: 1,
    gratis: 0,
    kvaliteter: [],
    gratisKval: [],
    removedKval: []
  }, 0, 0, 0));
  assert(rowCostWithListRules === 204, `calcRowCost ska använda samma regelkälla som calcEntryCost (förväntat 204, fick ${rowCostWithListRules})`);

  const rowPrecistWithListFree = {
    id: armorWithPrecist.id,
    name: armorWithPrecist.namn,
    qty: 1,
    gratis: 0,
    kvaliteter: [],
    gratisKval: ['Precist'],
    removedKval: []
  };
  const rowPrecistWithListFreeCost = sandbox.moneyToO(sandbox.invUtil.calcRowCost(rowPrecistWithListFree, 0, 0, 0));
  assert(rowPrecistWithListFreeCost === 204, `Gratis kvalitet ska bara påverka kvalitetseffekter, inte listregler (förväntat 204, fick ${rowPrecistWithListFreeCost})`);

  activeList = [];
  const rowManualMult = sandbox.moneyToO(sandbox.invUtil.calcRowCost({
    id: armorPlain.id,
    name: armorPlain.namn,
    qty: 1,
    gratis: 0,
    kvaliteter: [],
    gratisKval: [],
    removedKval: [],
    priceMult: 1.5
  }, 0, 0, 0));
  assert(rowManualMult === 150, `row.priceMult ska appliceras sist (förväntat 150, fick ${rowManualMult})`);
  const rowBaseOverride = sandbox.moneyToO(sandbox.invUtil.calcRowCost({
    id: armorPlain.id,
    name: armorPlain.namn,
    qty: 1,
    gratis: 0,
    kvaliteter: [],
    gratisKval: [],
    removedKval: [],
    basePrice: { daler: 2, skilling: 0, 'örtegar': 0 },
    basePriceSource: 'manual'
  }, 0, 0, 0));
  assert(rowBaseOverride === 200, `basePrice-override ska fortsätta fungera (förväntat 200, fick ${rowBaseOverride})`);

  const smides = findFormaga('Smideskonst');
  const alkemist = findFormaga('Alkemist');
  const artefaktmakande = findFormaga('Artefaktmakande');
  assert(smides && alkemist && artefaktmakande, 'Hittade inte Smideskonst/Alkemist/Artefaktmakande i formaga.json');

  const forgeArmorNoQuality = {
    id: 'forge-no-quality',
    namn: 'Smidestest Rustning',
    taggar: { typ: ['Rustning'], kvalitet: [] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  const forgeArmorOneQuality = {
    id: 'forge-one-quality',
    namn: 'Smidestest Rustning + Precist',
    taggar: { typ: ['Rustning'], kvalitet: ['Precist'] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  const forgeArmorTwoQuality = {
    id: 'forge-two-quality',
    namn: 'Smidestest Rustning + Precist + Brinnande',
    taggar: { typ: ['Rustning'], kvalitet: ['Precist', 'Brinnande'] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  [forgeArmorNoQuality, forgeArmorOneQuality, forgeArmorTwoQuality].forEach(entry => dynamicEntriesById.set(entry.id, entry));
  sandbox.DB = [...sandbox.DB, forgeArmorNoQuality, forgeArmorOneQuality, forgeArmorTwoQuality];

  activeList = [{ ...smides, nivå: 'Gesäll' }];
  const forgeNoQualCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(forgeArmorNoQuality));
  assert(forgeNoQualCost === 50, `Smideskonst Gesäll ska halvera smidbart utan positiva kvaliteter (förväntat 50, fick ${forgeNoQualCost})`);
  const forgeOneQualCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(forgeArmorOneQuality));
  assert(forgeOneQualCost === 250, `Smideskonst Gesäll + en positiv kvalitet ska halvera innan kvalitetsfaktor (förväntat 250, fick ${forgeOneQualCost})`);
  const forgeTwoQualCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(forgeArmorTwoQuality));
  assert(forgeTwoQualCost === 5000, `Smideskonst Gesäll ska inte halvera vid två positiva kvaliteter (förväntat 5000, fick ${forgeTwoQualCost})`);

  const elixirGesall = {
    id: 'elixir-gesall',
    namn: 'Elixirstest Gesäll',
    nivå: 'Gesäll',
    taggar: { typ: ['Elixir'], kvalitet: [] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  const elixirMastare = {
    id: 'elixir-mastare',
    namn: 'Elixirstest Mästare',
    nivå: 'Mästare',
    taggar: { typ: ['Elixir'], kvalitet: [] },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  [elixirGesall, elixirMastare].forEach(entry => dynamicEntriesById.set(entry.id, entry));
  sandbox.DB = [...sandbox.DB, elixirGesall, elixirMastare];

  activeList = [{ ...alkemist, nivå: 'Gesäll' }];
  const elixirGesallCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(elixirGesall));
  const elixirMastareCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(elixirMastare));
  assert(elixirGesallCost === 50, `Alkemist Gesäll ska halvera Gesäll-elixir (förväntat 50, fick ${elixirGesallCost})`);
  assert(elixirMastareCost === 100, `Alkemist Gesäll ska inte halvera Mästare-elixir (förväntat 100, fick ${elixirMastareCost})`);

  const genericRequirementItem = {
    id: 'generic-requirement-price-item',
    namn: 'Generisk kravpryl',
    taggar: {
      typ: ['Diverse'],
      regler: {
        kraver: [
          {
            namn: ['Generiskt krav'],
            meddelande: 'Krav: Generiskt krav',
            else: { pengar_multiplikator: 3 }
          }
        ]
      }
    },
    grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
  };
  dynamicEntriesById.set(genericRequirementItem.id, genericRequirementItem);
  sandbox.DB = [...sandbox.DB, genericRequirementItem];

  activeList = [];
  const genericRequirementMissingCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(genericRequirementItem));
  assert(genericRequirementMissingCost === 300, `Kravbaserad moneyMultiplier ska gälla generellt i prisflödet (förväntat 300, fick ${genericRequirementMissingCost})`);
  activeList = [
    { id: 'generic-req-gate', namn: 'Generiskt krav', nivå: 'Novis', taggar: { typ: ['Förmåga'] } }
  ];
  const genericRequirementMetCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(genericRequirementItem));
  assert(genericRequirementMetCost === 100, `Generiskt krav ska ge normalpris när kravet uppfylls (förväntat 100, fick ${genericRequirementMetCost})`);

  const lowerArtifactTradition = lowerArtifactById.get('l4');
  const lowerArtifactNoTrad = lowerArtifactById.get('l2');
  assert(lowerArtifactTradition && lowerArtifactNoTrad, 'Hittade inte testartefakter l4/l2 i lagre-artefakter.json');
  dynamicEntriesById.set(lowerArtifactTradition.id, lowerArtifactTradition);
  dynamicEntriesById.set(lowerArtifactNoTrad.id, lowerArtifactNoTrad);
  sandbox.DB = [...sandbox.DB, lowerArtifactTradition, lowerArtifactNoTrad];

  const ordensmagikerReq = {
    id: 'req-ordensmagiker',
    namn: 'Ordensmagiker',
    nivå: 'Novis',
    taggar: { typ: ['Förmåga'] }
  };
  const ordensmagiReq = {
    id: 'req-ordensmagi',
    namn: 'Ordensmagi',
    nivå: 'Novis',
    taggar: { typ: ['Mystisk kraft'] }
  };

  const lowerTradBase = sandbox.moneyToO(lowerArtifactTradition.grundpris || {});
  const lowerNoTradBase = sandbox.moneyToO(lowerArtifactNoTrad.grundpris || {});

  partyArtefacter = '';
  activeList = [];
  const lowerTradMissingNoMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactTradition));
  assert(
    lowerTradMissingNoMakerCost === lowerTradBase * 10,
    `Lägre artefakt utan tradition och utan Artefaktmakande ska kosta ×10 (förväntat ${lowerTradBase * 10}, fick ${lowerTradMissingNoMakerCost})`
  );

  activeList = [ordensmagikerReq, ordensmagiReq];
  const lowerTradMetNoMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactTradition));
  assert(
    lowerTradMetNoMakerCost === lowerTradBase,
    `Traditionskrav uppfyllt utan Artefaktmakande ska ge normalpris (förväntat ${lowerTradBase}, fick ${lowerTradMetNoMakerCost})`
  );

  activeList = [{ ...artefaktmakande, nivå: 'Novis' }];
  const lowerTradMissingWithMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactTradition));
  assert(
    lowerTradMissingWithMakerCost === lowerTradBase * 5,
    `Missat traditionskrav + Artefaktmakande Novis ska ge netto ×5 (förväntat ${lowerTradBase * 5}, fick ${lowerTradMissingWithMakerCost})`
  );

  activeList = [{ ...artefaktmakande, nivå: 'Novis' }, ordensmagikerReq, ordensmagiReq];
  const lowerTradMetWithMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactTradition));
  assert(
    lowerTradMetWithMakerCost === lowerTradBase / 2,
    `Uppfyllda traditionskrav + Artefaktmakande Novis ska ge halvt pris (förväntat ${lowerTradBase / 2}, fick ${lowerTradMetWithMakerCost})`
  );

  partyArtefacter = '';
  activeList = [];
  const lowerNoTradNoMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactNoTrad));
  assert(
    lowerNoTradNoMakerCost === lowerNoTradBase,
    `Tom ark_trad utan Artefaktmakande ska ge normalpris (förväntat ${lowerNoTradBase}, fick ${lowerNoTradNoMakerCost})`
  );

  activeList = [{ ...artefaktmakande, nivå: 'Novis' }];
  const lowerNoTradWithMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactNoTrad));
  assert(
    lowerNoTradWithMakerCost === lowerNoTradBase / 2,
    `Tom ark_trad med Artefaktmakande Novis ska ge halvt pris (förväntat ${lowerNoTradBase / 2}, fick ${lowerNoTradWithMakerCost})`
  );

  activeList = [];
  partyArtefacter = 'Novis';
  const lowerNoTradWithPartyMakerCost = sandbox.moneyToO(sandbox.invUtil.calcEntryCost(lowerArtifactNoTrad));
  assert(
    lowerNoTradWithPartyMakerCost === lowerNoTradBase / 2,
    `Party-Artefaktmakare Novis ska ge samma halvering som egen förmåga (förväntat ${lowerNoTradBase / 2}, fick ${lowerNoTradWithPartyMakerCost})`
  );
  partyArtefacter = '';
}

function verifyMalCoverage(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const { MAL_REGISTRY } = sandbox.rulesHelper;

  const dataFiles = [
    'basformagor.json', 'elityrke.json', 'fordel.json', 'formaga.json', 'kvalitet.json',
    'lagre-artefakter.json', 'mystisk-kraft.json', 'mystisk-kvalitet.json',
    'monstruost-sardrag.json', 'nackdel.json', 'negativ-kvalitet.json',
    'ras.json', 'sardrag.json', 'narstridsvapen.json', 'avstandsvapen.json', 'ritual.json'
  ];

  function scanRegler(regler, uncovered) {
    if (!regler || typeof regler !== 'object') return;
    ['andrar', 'ger', 'kraver', 'krockar'].forEach(key => {
      (Array.isArray(regler[key]) ? regler[key] : []).forEach(rule => {
        const mal = String(rule?.mal || '').trim();
        if (mal && !MAL_REGISTRY.has(mal)) uncovered.add(mal);
      });
    });
  }

  const uncovered = new Set();
  dataFiles.forEach(fileName => {
    try {
      const content = readEntryDataFile(rootPath, 'data/' + fileName);
      const entries = Array.isArray(content) ? content : [content];
      entries.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        scanRegler(entry?.taggar?.regler, uncovered);
        const nivaData = entry?.taggar?.nivå_data || entry?.taggar?.niva_data || {};
        Object.values(nivaData).forEach(level => scanRegler(level?.regler, uncovered));
      });
    } catch (_) { /* ignore parse errors for optional files */ }
  });

  assert(uncovered.size === 0, 'Saknar MAL_REGISTRY-hanterare för: ' + [...uncovered].join(', '));
}

function verifyRuleExtends(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const { getPainThresholdModifier } = sandbox.rulesHelper;

  const baseEntry = {
    id: 'base-1',
    namn: 'Bastrait',
    taggar: {
      typ: ['Särdrag'],
      regler: {
        andrar: [
          { mal: 'smartgrans_tillagg', satt: 'add', varde: 2 }
        ]
      }
    }
  };
  const derivedEntry = {
    id: 'derived-1',
    namn: 'HärledtTrait',
    taggar: {
      typ: ['Särdrag'],
      extends: 'Bastrait',
      regler: {
        andrar: [
          { mal: 'smartgrans_tillagg', satt: 'add', varde: 1 }
        ]
      }
    }
  };

  sandbox.lookupEntry = (ref) => {
    if (ref?.name === 'HärledtTrait' || ref?.id === 'derived-1') return derivedEntry;
    if (ref?.name === 'Bastrait') return baseEntry;
    return null;
  };

  // Derived inherits base rule (+2) plus own rule (+1) = +3
  const listEntry = { id: 'derived-1', namn: 'HärledtTrait', nivå: '' };
  const modifier = getPainThresholdModifier([listEntry], { stark: 10 });
  assert(modifier === 3, 'extends-kedja ska slå ihop regler från bas och härledd (förväntar +3, fick ' + modifier + ')');

  // Base alone gives +2
  const baseListEntry = { id: 'base-1', namn: 'Bastrait', nivå: '' };
  const baseModifier = getPainThresholdModifier([baseListEntry], { stark: 10 });
  assert(baseModifier === 2, 'Basepost ska bara ge sina egna regler (+2, fick ' + baseModifier + ')');
}

function verifyTypeRuleHierarchy(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  const helper = sandbox.rulesHelper;
  assert(typeof helper.getTypeRules === 'function', 'rulesHelper ska exponera getTypeRules');

  const typeRules = {
    'Förmåga': {
      max_antal: 2,
      regler: {
        andrar: [
          { mal: 'forsvar_modifierare', satt: 'add', varde: 1 },
          { mal: 'anfall_karaktarsdrag', satt: 'ersatt', varde: 'Stark' },
          { mal: 'talighet_tillagg', satt: 'add', varde: 1 }
        ],
        kraver: [
          {
            nar: { har_namn: ['Monster'] },
            varde: 'monster_race_required'
          }
        ]
      },
      nivå_data: {
        Novis: {
          regler: {
            andrar: [
              { mal: 'forsvar_modifierare', satt: 'add', varde: 2 }
            ]
          }
        }
      }
    }
  };

  const addTypeRules = (entry) => {
    try {
      Object.defineProperty(entry, '__typ_regler', {
        value: typeRules,
        configurable: true,
        writable: true,
        enumerable: false
      });
    } catch (_) {
      entry.__typ_regler = typeRules;
    }
    return entry;
  };

  const baseline = addTypeRules({
    id: 'type-base-1',
    namn: 'Typbas',
    taggar: {
      typ: ['Förmåga']
    }
  });
  assert(helper.getEntryMaxCount(baseline) === 2, 'Typregel ska sätta baseline max_antal=2');

  const overrideMax = addTypeRules({
    id: 'type-entry-max-1',
    namn: 'Entry max',
    taggar: {
      typ: ['Förmåga'],
      max_antal: 4
    }
  });
  assert(helper.getEntryMaxCount(overrideMax) === 4, 'Entry-regel ska överstyra type max_antal');

  const ignoreLimitsMax = addTypeRules({
    id: 'type-entry-ignore-limit-1',
    namn: 'Ignore max',
    taggar: {
      typ: ['Förmåga'],
      max_antal: 1,
      ignore_limits: true
    }
  });
  assert(
    helper.getEntryMaxCount(ignoreLimitsMax) === Number.POSITIVE_INFINITY,
    'ignore_limits-tag ska göra att max_antal ignoreras'
  );
  const ignoreStops = helper.evaluateEntryStops(ignoreLimitsMax, [{ ...ignoreLimitsMax }], { action: 'add' });
  const hasLimitStop = (ignoreStops.hardStops || []).some(stop => {
    const code = String(stop?.code || '').trim();
    return code === 'duplicate_entry' || code === 'stack_limit';
  });
  assert(!hasLimitStop, 'ignore_limits-tag ska förhindra duplicate/stack hard-stops');

  const candidate = addTypeRules({
    id: 'type-entry-rules-1',
    namn: 'Entry regler',
    nivå: 'Novis',
    taggar: {
      typ: ['Förmåga'],
      regler: {
        andrar: [
          { mal: 'forsvar_modifierare', satt: 'ersatt', varde: 5 }
        ],
        kraver: [
          {
            nar: { nagon_av_namn: ['Andrik'] },
            varde: 'andrik_required'
          }
        ]
      },
      nivå_data: {
        Novis: {
          regler: {
            andrar: [
              { mal: 'anfall_karaktarsdrag', satt: 'ersatt', varde: 'Kvick' }
            ]
          }
        }
      }
    }
  });

  const mergedRules = helper.getEntryRules(candidate, { level: 'Novis' });
  const andrar = Array.isArray(mergedRules?.andrar) ? mergedRules.andrar : [];
  const byMal = mal => andrar.filter(rule => String(rule?.mal || '').trim() === mal);

  const defenseRules = byMal('forsvar_modifierare');
  assert(defenseRules.length === 1, `Entry-regel ska ersätta type-regler för forsvar_modifierare, fick ${defenseRules.length}`);
  assert(Number(defenseRules[0]?.varde) === 5, 'forsvar_modifierare ska följa entry-regeln (varde=5)');

  const attackRules = byMal('anfall_karaktarsdrag');
  assert(attackRules.length === 1, 'Entry-nivåregel ska ersätta type-regel för anfall_karaktarsdrag');
  assert(String(attackRules[0]?.varde || '') === 'Kvick', 'anfall_karaktarsdrag ska följa entry-nivåregeln (Kvick)');

  const toughnessRules = byMal('talighet_tillagg');
  assert(toughnessRules.length === 1, 'Type-regel ska finnas kvar när entry saknar samma mal');
  assert(Number(toughnessRules[0]?.varde) === 1, 'Type-regel talighet_tillagg ska behålla baseline-värdet');

  const missingWithAndrik = helper.getMissingRequirementReasonsForCandidate(
    candidate,
    [{ namn: 'Andrik' }],
    { level: 'Novis' }
  );
  assert(missingWithAndrik.length === 0, 'Entry-krav (Andrik) ska kunna överstyra type-krav (Monster)');

  const missingWithMonster = helper.getMissingRequirementReasonsForCandidate(
    candidate,
    [{ namn: 'Monster' }],
    { level: 'Novis' }
  );
  assert(missingWithMonster.length === 0, 'Type-krav (Monster) ska fungera som fallback när entry-krav inte uppfylls');

  const missingWithoutEither = helper.getMissingRequirementReasonsForCandidate(
    candidate,
    [],
    { level: 'Novis' }
  );
  const missingCodes = new Set((Array.isArray(missingWithoutEither) ? missingWithoutEither : [])
    .map(reason => String(reason?.code || '').trim())
    .filter(Boolean));
  assert(
    missingCodes.has('andrik_required') && missingCodes.has('monster_race_required'),
    'När varken entry-krav eller type-krav uppfylls ska båda reasons rapporteras'
  );
}

function verifyHamnskifteGrants(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const mysticPowers = readEntryDataFile(rootPath, 'data/mystisk-kraft.json');
  const monstrousTraits = readEntryDataFile(rootPath, 'data/monstruost-sardrag.json');
  const allEntries = [...mysticPowers, ...monstrousTraits];
  sandbox.DB = allEntries;

  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = () => false;
  sandbox.isSardrag = (entry) => (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []).includes('Särdrag');
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;
  sandbox.isMonstrousTrait = (entry) => {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.includes('Monstruöst särdrag');
  };

  const hamnskifte = allEntries.find(e => e.id === 'mystiskkr15');
  const grants1 = allEntries.find(e => e.id === 'hamnskifte_grants1'); // Robust
  const grants2 = allEntries.find(e => e.id === 'hamnskifte_grants2'); // Pansar
  const grants3 = allEntries.find(e => e.id === 'hamnskifte_grants3'); // Regeneration
  const grants4 = allEntries.find(e => e.id === 'hamnskifte_grants4'); // Naturligt vapen

  assert(hamnskifte, 'Hittade inte Hamnskifte (mystiskkr15)');
  assert(grants1, 'Hittade inte hamnskifte_grants1 (Robust)');
  assert(grants2, 'Hittade inte hamnskifte_grants2 (Pansar)');
  assert(grants3, 'Hittade inte hamnskifte_grants3 (Regeneration)');
  assert(grants4, 'Hittade inte hamnskifte_grants4 (Naturligt vapen)');

  const {
    getEntryGrantTargets,
    getPartialGrantInfo,
    getEntryErfOverride,
    setEntryErfOverride,
    clearAllEntryErfOverrides
  } = sandbox.rulesHelper;
  const {
    calcEntryXP,
    buildGrantMaps,
    isRuleGrantedEntry,
    getGrantedEntryOverrideCost,
    setCurrentList,
    getCurrentList
  } = sandbox.storeHelper;

  // Test 1: No Hamnskifte in list → no grant targets
  const emptyList = [];
  const targetsEmpty = getEntryGrantTargets(emptyList);
  assert(targetsEmpty.length === 0, 'Tom lista ska inte ge några grant-mål');

  // Test 2: Hamnskifte Novis → no grants (kalla_niva_minst: Gesäll not met)
  const listNovis = [{ ...hamnskifte, nivå: 'Novis' }];
  const targetsNovis = getEntryGrantTargets(listNovis);
  assert(targetsNovis.length === 0, 'Hamnskifte Novis ska inte ge några grant-mål');

  // Test 3: Hamnskifte Gesäll → 2 grants (grants4 + grants2)
  const listGesall = [{ ...hamnskifte, nivå: 'Gesäll' }];
  const targetsGesall = getEntryGrantTargets(listGesall);
  assert(targetsGesall.length === 2, `Hamnskifte Gesäll ska ge 2 grant-mål, fick ${targetsGesall.length}`);
  const gesallIds = targetsGesall.map(t => t.id).sort();
  deepEqual(gesallIds, ['hamnskifte_grants2', 'hamnskifte_grants4'], 'Hamnskifte Gesäll ska granta grants2 och grants4');
  targetsGesall.forEach(t => {
    assert(t.gratis === true, `Grant ${t.id} ska markeras som gratis-grant`);
    assert(t.gratisTill === 'Novis', `Grant ${t.id} ska ha gratisTill=Novis, fick ${t.gratisTill}`);
  });

  // Test 4: Hamnskifte Mästare → 4 grants (inherits Gesäll rules too)
  const listMastare = [{ ...hamnskifte, nivå: 'Mästare' }];
  const targetsMastare = getEntryGrantTargets(listMastare);
  assert(targetsMastare.length === 4, `Hamnskifte Mästare ska ge 4 grant-mål, fick ${targetsMastare.length}`);
  const mastareIds = targetsMastare.map(t => t.id).sort();
  deepEqual(mastareIds, ['hamnskifte_grants1', 'hamnskifte_grants2', 'hamnskifte_grants3', 'hamnskifte_grants4'],
    'Hamnskifte Mästare ska granta alla 4 entries');

  // Test 5: getPartialGrantInfo for grants4 with Hamnskifte Gesäll in list
  const partialInfo = getPartialGrantInfo({ ...grants4 }, listGesall);
  assert(partialInfo !== null, 'getPartialGrantInfo ska returnera info för hamnskifte_grants4 med Gesäll i lista');
  assert(partialInfo.gratisTill === 'Novis', `gratisTill ska vara Novis, fick ${partialInfo.gratisTill}`);

  // Test 6: Novis-level granted entry → isRuleGrantedEntry = true, calcEntryXP = 0
  const grants4Novis = { ...grants4, nivå: 'Novis' };
  const listWithGesallAndGrant4 = [{ ...hamnskifte, nivå: 'Gesäll' }, grants4Novis];
  assert(
    isRuleGrantedEntry(grants4Novis, listWithGesallAndGrant4),
    'grants4 Novis ska vara granted (isRuleGrantedEntry = true)'
  );
  assert(
    calcEntryXP(grants4Novis, listWithGesallAndGrant4) === 0,
    'grants4 Novis ska kosta 0 ERF'
  );

  // Test 7: Gesäll-level granted entry → NOT fully free (above gratisTill=Novis), auto-discount applies
  const grants4Gesall = { ...grants4, nivå: 'Gesäll' };
  const listWithGesallAndGrantGesall = [{ ...hamnskifte, nivå: 'Gesäll' }, grants4Gesall];
  assert(
    !isRuleGrantedEntry(grants4Gesall, listWithGesallAndGrantGesall),
    'grants4 Gesäll ska INTE vara gratis (ovanför gratisTill=Novis)'
  );
  // Auto-discount: XP_LADDER[Gesäll]=30 − XP_LADDER[Novis]=10 = 20
  const overrideCost = getGrantedEntryOverrideCost(grants4Gesall, listWithGesallAndGrantGesall);
  assert(overrideCost === 20, `Override-kostnad för grants4 Gesäll ska vara 20 (auto-calc), fick ${overrideCost}`);

  // Test 8: gratisTill auto-discount — synthetic rule without niva_kostnad
  const syntheticSource = {
    id: 'synth-source',
    namn: 'SynthAbility',
    nivå: 'Gesäll',
    taggar: {
      typ: ['Mystisk kraft'],
      regler: {
        ger: [
          { mal: 'post', id: 'hamnskifte_grants4', gratis_upp_till: 'Novis' }
        ]
      }
    }
  };
  const synthGrant4Gesall = { ...grants4, nivå: 'Gesäll' };
  const synthList = [syntheticSource, synthGrant4Gesall];
  const synthOverride = getGrantedEntryOverrideCost(synthGrant4Gesall, synthList);
  assert(synthOverride === 20, `Override-kostnad för Gesäll med gratisTill=Novis ska vara 20 (auto-calc), fick ${synthOverride}`);
  assert(
    calcEntryXP(synthGrant4Gesall, synthList) === 20,
    `calcEntryXP för grants4 Gesäll med gratisTill=Novis ska vara 20`
  );

  // Test 9: Mästare-level auto-discount
  const synthGrant4Mastare = { ...grants4, nivå: 'Mästare' };
  const synthListM = [{ ...syntheticSource, nivå: 'Gesäll' }, synthGrant4Mastare];
  const synthOverrideM = getGrantedEntryOverrideCost(synthGrant4Mastare, synthListM);
  assert(synthOverrideM === 50, `Override-kostnad för Mästare med gratisTill=Novis ska vara 50 (auto-calc), fick ${synthOverrideM}`);
  assert(
    calcEntryXP(synthGrant4Mastare, synthListM) === 50,
    `calcEntryXP för grants4 Mästare med gratisTill=Novis ska vara 50`
  );

  // Test 10: Explicit ERF override in nivå_data should be used by calcEntryXP
  const customCostGrant = {
    ...grants4,
    nivå: 'Gesäll',
    taggar: {
      ...(grants4.taggar || {}),
      nivå_data: {
        ...(grants4.taggar?.nivå_data || {}),
        Gesäll: {
          ...((grants4.taggar?.nivå_data && grants4.taggar.nivå_data.Gesäll) || {}),
          erf: 17
        }
      }
    }
  };
  assert(
    getEntryErfOverride(customCostGrant, [customCostGrant], { level: 'Gesäll' }) === 17,
    'getEntryErfOverride ska läsa explicit nivåkostnad (erf) från entry data'
  );
  assert(
    calcEntryXP(customCostGrant, [customCostGrant]) === 17,
    'calcEntryXP ska använda explicit nivåkostnad (erf) från entry data'
  );

  // Test 11: Runtime manual ERF override API
  clearAllEntryErfOverrides();
  assert(
    setEntryErfOverride({ id: grants4.id }, 'Gesäll', 14),
    'setEntryErfOverride ska acceptera id + nivå + värde'
  );
  const manualOverrideGrant = { ...grants4, nivå: 'Gesäll' };
  assert(
    calcEntryXP(manualOverrideGrant, [manualOverrideGrant]) === 14,
    'calcEntryXP ska använda runtime-manual ERF override'
  );
  clearAllEntryErfOverrides();

  // Test 12: Rule-based ERF override on ger:post supports level maps
  const pricedSource = {
    id: 'synth-priced-source',
    namn: 'SynthPricedAbility',
    nivå: 'Gesäll',
    taggar: {
      typ: ['Mystisk kraft'],
      regler: {
        ger: [
          {
            mal: 'post',
            id: 'hamnskifte_grants4',
            gratis_upp_till: 'Novis',
            erf_per_niva: {
              Novis: 10,
              'Gesäll': 35,
              'Mästare': 80
            }
          }
        ]
      }
    }
  };
  const pricedGrantGesall = { ...grants4, nivå: 'Gesäll' };
  const pricedList = [pricedSource, pricedGrantGesall];
  assert(
    getEntryErfOverride(pricedGrantGesall, pricedList, { level: 'Gesäll' }) === 35,
    'Rule-based ERF map ska ge nivåspecifik total kostnad (Gesäll)'
  );
  assert(
    getGrantedEntryOverrideCost(pricedGrantGesall, pricedList) === 25,
    'Rule-based ERF map ska påverka gratis_upp_till-avdraget korrekt (35-10=25)'
  );
  assert(
    calcEntryXP(pricedGrantGesall, pricedList) === 25,
    'calcEntryXP ska använda rule-based nivåspecifik ERF override vid partial grant'
  );

  // Test 13–15: Source removal cleanup — granted entries removed when source is removed
  const baseStoreData = {
    list: [],
    inventory: [],
    custom: [],
    privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
  };
  const createStore = () => ({
    current: 'hamnskifte-removal-test',
    characters: [{ id: 'hamnskifte-removal-test', name: 'Test' }],
    folders: [],
    data: { 'hamnskifte-removal-test': { ...baseStoreData } }
  });

  // Test 10: Hamnskifte Gesäll → grants2 + grants4 added. Remove Hamnskifte → grants removed
  const removalStore = createStore();
  setCurrentList(removalStore, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listAfterGrant = getCurrentList(removalStore);
  assert(
    listAfterGrant.some(e => e.id === 'hamnskifte_grants2') && listAfterGrant.some(e => e.id === 'hamnskifte_grants4'),
    'grants2 och grants4 ska läggas till av Hamnskifte Gesäll'
  );
  setCurrentList(removalStore, []);
  const listAfterRemoval = getCurrentList(removalStore);
  assert(
    !listAfterRemoval.some(e => e.id === 'hamnskifte_grants2') && !listAfterRemoval.some(e => e.id === 'hamnskifte_grants4'),
    'grants2 och grants4 ska tas bort när Hamnskifte tas bort (Test 10)'
  );

  // Test 11: Granted entry upgraded to Gesäll → still removed when source removed
  const upgradedStore = createStore();
  setCurrentList(upgradedStore, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listWithGrant = getCurrentList(upgradedStore);
  const upgradedGrant = listWithGrant.map(e => e.id === 'hamnskifte_grants4' ? { ...e, nivå: 'Gesäll' } : e);
  upgradedStore.data['hamnskifte-removal-test'].list = upgradedGrant;
  setCurrentList(upgradedStore, upgradedGrant.filter(e => e.id !== hamnskifte.id));
  const listAfterUpgradedRemoval = getCurrentList(upgradedStore);
  assert(
    !listAfterUpgradedRemoval.some(e => e.id === 'hamnskifte_grants4'),
    'Uppgraderat hamnskifte_grants4 ska tas bort när Hamnskifte tas bort (Test 11)'
  );
}

function verifyGrantCleanupRules(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));

  const mysticPowers = readEntryDataFile(rootPath, 'data/mystisk-kraft.json');
  const monstrousTraits = readEntryDataFile(rootPath, 'data/monstruost-sardrag.json');
  const allEntries = [...mysticPowers, ...monstrousTraits];
  sandbox.DB = allEntries;
  sandbox.lookupEntry = (ref) => {
    if (ref === undefined || ref === null) return null;
    if (typeof ref === 'object') {
      const id = ref.id;
      const name = ref.name || ref.namn;
      return allEntries.find(entry => {
        if (!entry || typeof entry !== 'object') return false;
        if (id !== undefined && id !== null && String(entry.id) === String(id)) return true;
        return typeof name === 'string' && name && entry.namn === name;
      }) || null;
    }
    const key = String(ref);
    return allEntries.find(entry => entry && (String(entry.id) === key || entry.namn === key)) || null;
  };
  sandbox.isRas = () => false;
  sandbox.isSardrag = (entry) => (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []).includes('Särdrag');
  sandbox.isElityrke = () => false;
  sandbox.isEliteSkill = () => false;
  sandbox.isMonstrousTrait = (entry) => {
    const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
    return types.includes('Monstruöst särdrag');
  };

  const hamnskifte = allEntries.find(e => e.id === 'mystiskkr15');
  assert(hamnskifte, 'Hittade inte Hamnskifte (mystiskkr15)');

  const { setCurrentList, getCurrentList, getEntriesToBeCleanedByGrants } = sandbox.storeHelper;
  assert(typeof getEntriesToBeCleanedByGrants === 'function', 'getEntriesToBeCleanedByGrants ska exporteras av storeHelper');

  const baseStoreData = {
    list: [], suppressedEntryGrants: {}, darkPastSuppressed: false,
    inventory: [], custom: [], privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
    bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
  };
  const createStore = () => ({
    current: 'gc-test',
    characters: [{ id: 'gc-test', name: 'Test' }],
    folders: [],
    data: { 'gc-test': { ...baseStoreData } }
  });

  // Test 1: getEntriesToBeCleanedByGrants returns empty when nothing would be cleaned
  const s1 = createStore();
  setCurrentList(s1, [{ ...hamnskifte, nivå: 'Novis' }]);
  const list1 = getCurrentList(s1);
  const clean1 = getEntriesToBeCleanedByGrants(s1, list1, []);
  assert(clean1.length === 0, 'Inga poster ska rensas för Hamnskifte Novis (Test 1, gc)');

  // Test 2: Hamnskifte Gesäll → remove it → getEntriesToBeCleanedByGrants returns grants2 and grants4
  const s2 = createStore();
  setCurrentList(s2, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listWithGrants = getCurrentList(s2);
  const listAfterRemove = listWithGrants.filter(e => e.id !== hamnskifte.id);
  const clean2 = getEntriesToBeCleanedByGrants(s2, listAfterRemove, listWithGrants);
  const clean2Ids = clean2.map(r => r.entry?.id).sort();
  assert(
    clean2Ids.includes('hamnskifte_grants2') && clean2Ids.includes('hamnskifte_grants4'),
    `getEntriesToBeCleanedByGrants ska returnera grants2 och grants4 vid borttagning, fick ${JSON.stringify(clean2Ids)} (Test 2, gc)`
  );
  assert(clean2.every(r => r.sourceName === hamnskifte.namn), 'Alla rensade poster ska ha Hamnskifte som sourceName (Test 2, gc)');

  // Test 3: manualRuleOverride = true → entry excluded from cleanup candidates
  const s3 = createStore();
  setCurrentList(s3, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listWithGrants3 = getCurrentList(s3);
  listWithGrants3.forEach(e => { if (e.id === 'hamnskifte_grants2') e.manualRuleOverride = true; });
  const listAfterRemove3 = listWithGrants3.filter(e => e.id !== hamnskifte.id);
  const clean3 = getEntriesToBeCleanedByGrants(s3, listAfterRemove3, listWithGrants3);
  assert(
    !clean3.some(r => r.entry?.id === 'hamnskifte_grants2'),
    'grants2 med manualRuleOverride ska inte ingå i cleanup-kandidater (Test 3, gc)'
  );
  assert(
    clean3.some(r => r.entry?.id === 'hamnskifte_grants4'),
    'grants4 utan manualRuleOverride ska ingå i cleanup-kandidater (Test 3, gc)'
  );

  // Test 4: Level downgrade Gesäll→Novis → getEntriesToBeCleanedByGrants returns grants2 and grants4
  const s4 = createStore();
  setCurrentList(s4, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listBeforeDowngrade = getCurrentList(s4);
  // Simulate level downgrade: mutate in-place as the UI level-change handler does
  const listAfterDowngrade = listBeforeDowngrade.map(e => ({ ...e }));
  const before4 = listBeforeDowngrade.map(e => ({ ...e }));
  const srcEntry4 = listAfterDowngrade.find(e => e.id === hamnskifte.id);
  srcEntry4.nivå = 'Novis';
  const clean4 = getEntriesToBeCleanedByGrants(s4, listAfterDowngrade, before4);
  const clean4Ids = clean4.map(r => r.entry?.id).sort();
  assert(
    clean4Ids.includes('hamnskifte_grants2') && clean4Ids.includes('hamnskifte_grants4'),
    `getEntriesToBeCleanedByGrants ska returnera grants2 och grants4 vid nedgradering, fick ${JSON.stringify(clean4Ids)} (Test 4, gc)`
  );

  // Test 5: Level downgrade triggers actual cleanup in setCurrentList
  const s5 = createStore();
  setCurrentList(s5, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listGesall5 = getCurrentList(s5);
  assert(
    listGesall5.some(e => e.id === 'hamnskifte_grants2'),
    'grants2 ska finnas efter Gesäll (Test 5, gc)'
  );
  // Downgrade: provide list with Hamnskifte at Novis (grants fell off)
  const listDowngraded5 = listGesall5.map(e => e.id === hamnskifte.id ? { ...e, nivå: 'Novis' } : { ...e });
  setCurrentList(s5, listDowngraded5);
  const listAfterDowngrade5 = getCurrentList(s5);
  assert(
    !listAfterDowngrade5.some(e => e.id === 'hamnskifte_grants2'),
    'grants2 ska tas bort när Hamnskifte nedgraderas till Novis (Test 5, gc)'
  );
  assert(
    !listAfterDowngrade5.some(e => e.id === 'hamnskifte_grants4'),
    'grants4 ska tas bort när Hamnskifte nedgraderas till Novis (Test 5, gc)'
  );
  assert(
    listAfterDowngrade5.some(e => e.id === hamnskifte.id && e.nivå === 'Novis'),
    'Hamnskifte Novis ska finnas kvar i listan (Test 5, gc)'
  );

  // Test 6: Upgraded granted entry still removed on level downgrade
  const s6 = createStore();
  setCurrentList(s6, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listGesall6 = getCurrentList(s6);
  // Upgrade the granted entry beyond gratisTill
  listGesall6.forEach(e => { if (e.id === 'hamnskifte_grants4') e.nivå = 'Gesäll'; });
  s6.data['gc-test'].list = listGesall6;
  const listDowngraded6 = listGesall6.map(e => e.id === hamnskifte.id ? { ...e, nivå: 'Novis' } : { ...e });
  setCurrentList(s6, listDowngraded6);
  const listAfterDowngrade6 = getCurrentList(s6);
  assert(
    !listAfterDowngrade6.some(e => e.id === 'hamnskifte_grants4'),
    'Uppgraderat grants4 ska tas bort vid nedgradering av källan (Test 6, gc)'
  );

  // Test 7: manualRuleOverride protects entry from level-downgrade cleanup
  const s7 = createStore();
  setCurrentList(s7, [{ ...hamnskifte, nivå: 'Gesäll' }]);
  const listGesall7 = getCurrentList(s7);
  listGesall7.forEach(e => { if (e.id === 'hamnskifte_grants4') e.manualRuleOverride = true; });
  s7.data['gc-test'].list = listGesall7;
  const listDowngraded7 = listGesall7.map(e => e.id === hamnskifte.id ? { ...e, nivå: 'Novis' } : { ...e });
  setCurrentList(s7, listDowngraded7);
  const listAfterDowngrade7 = getCurrentList(s7);
  assert(
    listAfterDowngrade7.some(e => e.id === 'hamnskifte_grants4'),
    'grants4 med manualRuleOverride ska behållas vid nedgradering (Test 7, gc)'
  );
}

function verifyEliteRequirementV2(rootPath) {
  const sandbox = createSandbox();
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/rules-helper.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/store.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/elite-utils.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/elite-req.js'));
  loadBrowserScript(sandbox, joinPath(rootPath, 'js/elite-add.js'));

  assert(sandbox.eliteReq && typeof sandbox.eliteReq.check === 'function', 'eliteReq.check ska finnas');
  assert(sandbox.eliteAdd && typeof sandbox.eliteAdd.checkProjectedRequirements === 'function', 'eliteAdd.checkProjectedRequirements ska finnas');
  assert(sandbox.eliteAdd && typeof sandbox.eliteAdd.projectRequirementList === 'function', 'eliteAdd.projectRequirementList ska finnas');
  assert(sandbox.eliteAdd && typeof sandbox.eliteAdd.getValfrittTypeOptions === 'function', 'eliteAdd.getValfrittTypeOptions ska finnas');
  assert(sandbox.eliteUtils && typeof sandbox.eliteUtils.normalizeKrav === 'function', 'eliteUtils.normalizeKrav ska finnas');

  const makeEntry = (name, type, level = 'Novis', extraTags = {}) => ({
    id: `elite-v2-${String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    namn: name,
    nivå: level,
    taggar: {
      typ: [type],
      ...extraTags
    }
  });

  const elite = {
    id: 'elite-v2-test',
    namn: 'Elit V2 Test',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 150,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [
        {
          alternativ: [{ typ: 'Förmåga', namn: 'Krav A' }],
          krav_erf: 30,
          min_antal: 1
        },
        {
          alternativ: [
            { typ: 'Förmåga', namn: 'Krav B' },
            { typ: 'Ritual', namn: 'Ritual A' },
            { typ: 'Mystisk kraft', namn: 'Mystisk A' }
          ],
          krav_erf: 10,
          min_antal: 1
        }
      ],
      valfri_inom_tagg: [
        {
          taggfalt: 'ark_trad',
          taggar: ['TaggX'],
          krav_erf: 40,
          typ: 'Förmåga'
        }
      ],
      valfritt: { krav_erf: 10 },
      specifika_fordelar: { namn: ['Fördel A'], min_antal: 1 },
      specifika_nackdelar: { namn: ['Nackdel A'], min_antal: 1 }
    }
  };

  const primaryMaster = makeEntry('Primärförmåga', 'Förmåga', 'Mästare', { ark_trad: ['PrimTagg'] });
  const primaryJourneyman = makeEntry('Primärförmåga', 'Förmåga', 'Gesäll', { ark_trad: ['PrimTagg'] });
  const kravA = makeEntry('Krav A', 'Förmåga', 'Mästare', { ark_trad: ['TaggX'] });
  const kravB = makeEntry('Krav B', 'Förmåga', 'Novis', { ark_trad: ['TaggX'] });
  const ritualA = makeEntry('Ritual A', 'Ritual', 'Novis', { ark_trad: ['TaggX'] });
  const fillerTag = makeEntry('Fyllnad Tagg', 'Förmåga', 'Novis', { ark_trad: ['TaggX'] });
  const fillerTagGesall = makeEntry('Fyllnad Tagg Gesäll', 'Förmåga', 'Gesäll', { ark_trad: ['TaggX'] });
  const fillerNoTag = makeEntry('Fyllnad Övrig', 'Förmåga', 'Novis', { ark_trad: ['AnnanTagg'] });
  const benefitA = makeEntry('Fördel A', 'Fördel', 'Novis');
  const drawbackA = makeEntry('Nackdel A', 'Nackdel', 'Novis');

  const passingList = [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...fillerNoTag },
    { ...benefitA },
    { ...drawbackA }
  ];
  const passRes = sandbox.eliteReq.check(elite, passingList);
  assert(passRes.ok === true, `V2-passfall ska vara godkänt, fick fel: ${(passRes.missing || []).join(' | ')}`);

  assert(
    Number(passRes.profile?.total?.selectedErf) === 150,
    `total_erf ska exkludera Fördel/Nackdel och bli 150, fick ${passRes.profile?.total?.selectedErf}`
  );

  const lowPrimaryRes = sandbox.eliteReq.check(elite, [
    { ...primaryJourneyman },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...fillerNoTag },
    { ...benefitA },
    { ...drawbackA }
  ]);
  assert(lowPrimaryRes.ok === false, 'Primärförmåga under krav_erf ska underkänna');
  assert(
    (lowPrimaryRes.missing || []).some(msg => String(msg).includes('Primärförmåga')),
    'Primärförmågemiss ska synas i missing-listan'
  );

  const minXpSimpleElite = {
    id: 'elite-v2-minxp-simple',
    namn: 'Elit V2 MinXP Simple',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 100,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [],
      valfri_inom_tagg: [],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const minXpSimple = sandbox.eliteReq.minXP(minXpSimpleElite, [{ ...primaryJourneyman }]);
  assert(
    Number(minXpSimple) === 70,
    `minXP ska inte dubbelräkna total + primär (förväntat 70, fick ${minXpSimple})`
  );

  const alternativeRes = sandbox.eliteReq.check(elite, [
    { ...primaryMaster },
    { ...kravA },
    { ...ritualA },
    { ...fillerTag },
    { ...fillerNoTag },
    { ...benefitA },
    { ...drawbackA }
  ]);
  assert(alternativeRes.ok === true, 'specifikt_val ska godkänna alternativmatch (Ritual A)');

  const doubleUseElite = {
    ...elite,
    krav: {
      ...elite.krav,
      total_erf: 120,
      specifikt_val: [
        {
          alternativ: [{ typ: 'Förmåga', namn: 'Krav A' }],
          krav_erf: 30,
          min_antal: 1
        },
        {
          alternativ: [{ typ: 'Förmåga', namn: 'Krav A' }],
          krav_erf: 30,
          min_antal: 1
        }
      ],
      valfri_inom_tagg: [],
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const doubleUseRes = sandbox.eliteReq.check(doubleUseElite, [
    { ...primaryMaster },
    { ...kravA },
    { ...fillerTag },
    { ...fillerNoTag }
  ]);
  assert(doubleUseRes.ok === false, 'Samma post ska inte kunna uppfylla två specifikt_val-rader');

  const overflowOnlyRes = sandbox.eliteReq.check(elite, [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerNoTag },
    { ...benefitA },
    { ...drawbackA }
  ]);
  assert(overflowOnlyRes.ok === false, 'valfri_inom_tagg ska falla när bara 30 overflow finns men 40 krävs');
  const valfriProfile = (Array.isArray(overflowOnlyRes.profile?.valfri_inom_tagg)
    ? overflowOnlyRes.profile.valfri_inom_tagg
    : [])[0] || {};
  assert(
    Number(valfriProfile.selectedErf) === 30,
    `Overflow till valfri_inom_tagg ska bli 30 i detta fall, fick ${valfriProfile.selectedErf}`
  );
  assert(
    Array.isArray(valfriProfile.overflowSources)
      && valfriProfile.overflowSources.some(row => String(row?.name || '').trim() === 'Krav A' && Number(row?.usedErf) === 30),
    `valfri_inom_tagg ska exponera overflow-källa (Krav A +30), fick ${JSON.stringify(valfriProfile.overflowSources)}`
  );

  const hybridRes = sandbox.eliteReq.check(elite, [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...benefitA },
    { ...drawbackA }
  ]);
  assert(hybridRes.ok === false, 'Hybridfyllning ska fortfarande blockeras när total_erf < 150');
  const hybridValfri = (Array.isArray(hybridRes.profile?.valfri_inom_tagg)
    ? hybridRes.profile.valfri_inom_tagg
    : [])[0] || {};
  assert(
    Number(hybridValfri.selectedErf) === 40,
    `Hybridfyllning ska ge 40 mot valfri_inom_tagg, fick ${hybridValfri.selectedErf}`
  );

  const valfriOverflowRes = sandbox.eliteReq.check(elite, [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTagGesall },
    { ...fillerNoTag },
    { ...benefitA },
    { ...drawbackA }
  ]);
  const valfriOverflowRow = (Array.isArray(valfriOverflowRes.profile?.valfri_inom_tagg)
    ? valfriOverflowRes.profile.valfri_inom_tagg
    : [])[0] || {};
  assert(
    Number(valfriOverflowRow.overflowErf) === 20,
    `valfri_inom_tagg ska skapa overflow vidare till valfritt (förväntat 20), fick ${valfriOverflowRow.overflowErf}`
  );
  assert(
    Number(valfriOverflowRes.profile?.valfritt?.selectedFromOverflow) >= 20,
    `valfritt ska ta emot overflow från valfri_inom_tagg (minst 20), fick ${valfriOverflowRes.profile?.valfritt?.selectedFromOverflow}`
  );

  const dualTagSource = makeEntry('Dubbel Tagg Källa', 'Förmåga', 'Mästare', { ark_trad: ['TaggA', 'TaggB'] });
  const dualTagElite = {
    id: 'elite-v2-dual-tag-priority',
    namn: 'Elit V2 Dual Tag Priority',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 120,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [
        {
          alternativ: [{ typ: 'Förmåga', namn: 'Dubbel Tagg Källa' }],
          krav_erf: 30,
          min_antal: 1
        }
      ],
      valfri_inom_tagg: [
        { taggfalt: 'ark_trad', taggar: ['TaggA'], krav_erf: 20, typ: 'Förmåga' },
        { taggfalt: 'ark_trad', taggar: ['TaggB'], krav_erf: 10, typ: 'Förmåga' }
      ],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const dualTagRes = sandbox.eliteReq.check(dualTagElite, [
    { ...primaryMaster },
    { ...dualTagSource }
  ]);
  const dualTagRows = Array.isArray(dualTagRes.profile?.valfri_inom_tagg) ? dualTagRes.profile.valfri_inom_tagg : [];
  const dualTagRow0 = dualTagRows[0] || {};
  const dualTagRow1 = dualTagRows[1] || {};
  assert(
    Number(dualTagRow0.selectedErf) === 20 && Number(dualTagRow1.selectedErf) === 10,
    `Overflow som matchar flera taggar ska fylla samtliga valfri_inom_tagg före valfritt (fick ${dualTagRow0.selectedErf}/${dualTagRow1.selectedErf})`
  );
  assert(
    Number(dualTagRes.profile?.valfritt?.selectedFromOverflow) === 0,
    `Ingen overflow ska gå till valfritt innan taggkraven är fyllda (fick ${dualTagRes.profile?.valfritt?.selectedFromOverflow})`
  );
  assert(dualTagRes.ok === true, 'Dubbel-taggsprioritering ska bli godkänd');

  const noBenefitRes = sandbox.eliteReq.check(elite, [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...fillerNoTag },
    { ...drawbackA }
  ]);
  assert(noBenefitRes.ok === false, 'saknad specifik fördel ska blockera även om total_erf är uppfylld');

  const noDrawbackRes = sandbox.eliteReq.check(elite, [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...fillerNoTag },
    { ...benefitA }
  ]);
  assert(noDrawbackRes.ok === false, 'saknad specifik nackdel ska blockera även om total_erf är uppfylld');

  const minCountZeroNormalized = sandbox.eliteUtils.normalizeKrav({
    specifikt_val: [
      {
        alternativ: [{ typ: 'Förmåga', namn: 'Krav A' }],
        krav_erf: 30,
        min_antal: 0
      }
    ]
  });
  assert(
    Number(minCountZeroNormalized?.specifikt_val?.[0]?.min_antal) === 0,
    `min_antal:0 ska bevaras i normalisering, fick ${JSON.stringify(minCountZeroNormalized?.specifikt_val?.[0])}`
  );
  const minCountZeroElite = {
    id: 'elite-v2-min-count-zero',
    namn: 'Elit V2 Min Count Zero',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 90,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [
        {
          alternativ: [{ typ: 'Förmåga', namn: 'Krav A' }],
          krav_erf: 30,
          min_antal: 0
        }
      ],
      valfri_inom_tagg: [],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const minCountZeroRes = sandbox.eliteReq.check(minCountZeroElite, [
    { ...primaryMaster },
    { ...kravA }
  ]);
  const minCountZeroRow = (Array.isArray(minCountZeroRes.profile?.specifikt_val)
    ? minCountZeroRes.profile.specifikt_val
    : [])[0] || {};
  assert(
    Number(minCountZeroRow.requiredCount) === 0,
    `specifikt_val med min_antal:0 ska ha requiredCount=0, fick ${minCountZeroRow.requiredCount}`
  );
  assert(minCountZeroRes.ok === true, 'specifikt_val med min_antal:0 ska godkännas när ERF-kravet uppfylls');

  const overlapA = makeEntry('Överlapp A', 'Förmåga', 'Gesäll', { ark_trad: ['TaggX'] });
  const overlapB = makeEntry('Överlapp B', 'Förmåga', 'Novis', { ark_trad: ['TaggX'] });
  const overlapOnly = makeEntry('Överlapp Endast Rad2', 'Förmåga', 'Novis', { ark_trad: ['TaggX'] });
  const hintedSpecificElite = {
    id: 'elite-v2-hinted-specific',
    namn: 'Elit V2 Hinted Specific',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 110,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [
        {
          alternativ: [
            { typ: 'Förmåga', namn: 'Överlapp A' },
            { typ: 'Förmåga', namn: 'Överlapp B' }
          ],
          krav_erf: 40,
          min_antal: 1
        },
        {
          alternativ: [
            { typ: 'Förmåga', namn: 'Överlapp A' },
            { typ: 'Förmåga', namn: 'Överlapp Endast Rad2' }
          ],
          krav_erf: 10,
          min_antal: 1
        }
      ],
      valfri_inom_tagg: [],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const hintedSpecificRes = sandbox.eliteReq.check(hintedSpecificElite, [
    { ...primaryMaster, __elite_source: 'primarformaga' },
    { ...overlapA, __elite_source: 'specifikt_val[0]' },
    { ...overlapB, __elite_source: 'specifikt_val[0]' },
    { ...overlapOnly, __elite_source: 'specifikt_val[1]' }
  ]);
  const hintedRows = Array.isArray(hintedSpecificRes.profile?.specifikt_val) ? hintedSpecificRes.profile.specifikt_val : [];
  const hintedRow0 = hintedRows[0] || {};
  const hintedRow1 = hintedRows[1] || {};
  assert(
    Number(hintedRow0.selectedErf) === 40,
    `specifikt_val[0] ska summera Gesäll + Novis till 40 med radlåsning, fick ${hintedRow0.selectedErf}`
  );
  assert(
    Number(hintedRow1.selectedErf) === 10,
    `specifikt_val[1] ska behålla sitt explicit val (10), fick ${hintedRow1.selectedErf}`
  );
  assert(hintedSpecificRes.ok === true, 'Radlåst specifikt_val-fall ska bli godkänt');

  const specOverflowMain = makeEntry('Spec Overflow Main', 'Förmåga', 'Gesäll', { ark_trad: ['TaggX'] });
  const specOverflowExtra1 = makeEntry('Spec Overflow Extra 1', 'Förmåga', 'Novis', { ark_trad: ['TaggX'] });
  const specOverflowExtra2 = makeEntry('Spec Overflow Extra 2', 'Förmåga', 'Novis', { ark_trad: ['TaggX'] });
  const multiOverflowElite = {
    id: 'elite-v2-multi-overflow',
    namn: 'Elit V2 Multi Overflow',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 110,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [
        {
          alternativ: [
            { typ: 'Förmåga', namn: 'Spec Overflow Main' },
            { typ: 'Förmåga', namn: 'Spec Overflow Extra 1' },
            { typ: 'Förmåga', namn: 'Spec Overflow Extra 2' }
          ],
          krav_erf: 30,
          min_antal: 1
        }
      ],
      valfri_inom_tagg: [
        {
          taggfalt: 'ark_trad',
          taggar: ['TaggX'],
          krav_erf: 20,
          typ: 'Förmåga'
        }
      ],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const multiOverflowRes = sandbox.eliteReq.check(multiOverflowElite, [
    { ...primaryMaster, __elite_source: 'primarformaga' },
    { ...specOverflowMain, __elite_source: 'specifikt_val[0]' },
    { ...specOverflowExtra1, __elite_source: 'specifikt_val[0]' },
    { ...specOverflowExtra2, __elite_source: 'specifikt_val[0]' }
  ]);
  const multiSpecRow = (Array.isArray(multiOverflowRes.profile?.specifikt_val)
    ? multiOverflowRes.profile.specifikt_val
    : [])[0] || {};
  assert(
    Number(multiSpecRow.selectedErf) === 50,
    `Specifik rad ska summera alla bidrag (förväntat 50), fick ${multiSpecRow.selectedErf}`
  );
  const multiValfriRow = (Array.isArray(multiOverflowRes.profile?.valfri_inom_tagg)
    ? multiOverflowRes.profile.valfri_inom_tagg
    : [])[0] || {};
  assert(
    Number(multiValfriRow.selectedFromOverflow) === 20,
    `Overflow till valfri_inom_tagg ska fungera utan Mästare (förväntat 20), fick ${multiValfriRow.selectedFromOverflow}`
  );
  const multiOverflowSources = Array.isArray(multiValfriRow.overflowSources) ? multiValfriRow.overflowSources : [];
  const sourceNames = multiOverflowSources
    .map(row => String(row?.name || '').trim())
    .filter(Boolean)
    .sort();
  assert(
    sourceNames.includes('Spec Overflow Extra 1') && sourceNames.includes('Spec Overflow Extra 2'),
    `Overflow ska kunna komma från flera specifika källor, fick ${JSON.stringify(multiOverflowSources)}`
  );
  assert(multiOverflowRes.ok === true, 'Multi-overflow-fall ska bli godkänt');

  const strictOptionalElite = {
    ...elite,
    krav: {
      ...elite.krav,
      valfritt: { krav_erf: 160 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const strictOptionalRes = sandbox.eliteReq.check(strictOptionalElite, [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...fillerNoTag }
  ]);
  assert(strictOptionalRes.ok === false, 'valfritt ska underkännas när overflow/pool inte når valfritt.krav_erf');

  const noPrimaryOverflowElite = {
    id: 'elite-v2-no-primary-overflow',
    namn: 'Elit V2 No Primary Overflow',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 120,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [
        {
          alternativ: [
            { typ: 'Förmåga', namn: 'Primärförmåga' },
            { typ: 'Förmåga', namn: 'Krav A' }
          ],
          krav_erf: 30,
          min_antal: 1
        }
      ],
      valfri_inom_tagg: [
        {
          taggfalt: 'ark_trad',
          taggar: ['PrimTagg'],
          krav_erf: 20,
          typ: 'Förmåga'
        }
      ],
      valfritt: { krav_erf: 0 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const noPrimaryOverflowRes = sandbox.eliteReq.check(noPrimaryOverflowElite, [
    { ...primaryMaster },
    { ...kravA }
  ]);
  const noPrimaryOverflowRow = (Array.isArray(noPrimaryOverflowRes.profile?.valfri_inom_tagg)
    ? noPrimaryOverflowRes.profile.valfri_inom_tagg
    : [])[0] || {};
  assert(
    Number(noPrimaryOverflowRow.selectedFromOverflow) === 0,
    `Primärförmåga får inte bidra som overflow-källa (förväntat 0), fick ${noPrimaryOverflowRow.selectedFromOverflow}`
  );
  assert(
    Array.isArray(noPrimaryOverflowRow.overflowSources) && noPrimaryOverflowRow.overflowSources.length === 0,
    `Primärförmåga får inte synas bland overflow-källor, fick ${JSON.stringify(noPrimaryOverflowRow.overflowSources)}`
  );
  assert(
    Number(noPrimaryOverflowRes.profile?.valfritt?.selectedFromOverflow) === 30,
    `Overflow utan taggmatch ska hoppa valfri_inom_tagg och gå till valfritt (förväntat 30), fick ${noPrimaryOverflowRes.profile?.valfritt?.selectedFromOverflow}`
  );

  const primaryIsolatedElite = {
    id: 'elite-v2-primary-isolated',
    namn: 'Elit V2 Primary Isolated',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 60,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [],
      valfri_inom_tagg: [],
      valfritt: { krav_erf: 60 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const primaryIsolatedRes = sandbox.eliteReq.check(primaryIsolatedElite, [{ ...primaryMaster }]);
  assert(primaryIsolatedRes.ok === false, 'Primärförmåga ska vara isolerad och inte kunna uppfylla valfritt');
  assert(
    Number(primaryIsolatedRes.profile?.total?.selectedErf) === 60,
    `Primärförmåga ska fortfarande räknas i total_erf (förväntat 60), fick ${primaryIsolatedRes.profile?.total?.selectedErf}`
  );
  assert(
    Number(primaryIsolatedRes.profile?.valfritt?.selectedErf) === 0,
    `Primärförmåga ska inte bidra till valfritt (förväntat 0), fick ${primaryIsolatedRes.profile?.valfritt?.selectedErf}`
  );

  const stackTrait = makeEntry('Stackad Särdrag', 'Särdrag', 'Novis', { max_antal: 2 });
  const helperDb = [
    { ...primaryMaster },
    { ...kravA },
    { ...kravB },
    { ...fillerTag },
    { ...fillerNoTag },
    { ...benefitA },
    { ...drawbackA },
    makeEntry('Typ Förmåga', 'Förmåga', 'Novis'),
    makeEntry('Typ Mystik', 'Mystisk kraft', 'Novis'),
    makeEntry('Typ Ritual', 'Ritual', 'Novis'),
    { ...stackTrait }
  ];
  sandbox.DB = helperDb.map(item => ({ ...item }));
  sandbox.DBList = sandbox.DB;

  const projectedFail = sandbox.eliteAdd.checkProjectedRequirements(
    elite,
    [
      { ...primaryMaster },
      { ...kravA },
      { ...kravB },
      { ...fillerNoTag },
      { ...benefitA },
      { ...drawbackA }
    ],
    []
  );
  assert(projectedFail && projectedFail.ok === false, 'Popup-projektion ska falla utan extra val när valfri_inom_tagg saknar ERF');
  const projectedFailValfri = (Array.isArray(projectedFail?.profile?.valfri_inom_tagg)
    ? projectedFail.profile.valfri_inom_tagg
    : [])[0] || {};
  assert(
    Number(projectedFailValfri.selectedErf) === 30,
    `Popup-projektion ska använda eliteReq overspill (förväntat 30), fick ${projectedFailValfri.selectedErf}`
  );

  const projectedPass = sandbox.eliteAdd.checkProjectedRequirements(
    elite,
    [
      { ...primaryMaster },
      { ...kravA },
      { ...kravB },
      { ...fillerNoTag },
      { ...benefitA },
      { ...drawbackA }
    ],
    [{ name: 'Fyllnad Tagg', level: 'Novis' }]
  );
  assert(projectedPass && projectedPass.ok === true, 'Popup-projektion ska godkännas när ett taggmatchande val fyller valfri_inom_tagg');

  const valfrittTypes = sandbox.eliteAdd.getValfrittTypeOptions();
  const valfrittTypeKeys = Array.isArray(valfrittTypes) ? valfrittTypes.map(row => String(row?.key || '').trim()) : [];
  assert(!valfrittTypeKeys.includes('advantage') && !valfrittTypeKeys.includes('drawback'), 'Valfritt-typval ska exkludera Fördel/Nackdel');
  assert(
    valfrittTypeKeys.includes('ability') && valfrittTypeKeys.includes('mystic') && valfrittTypeKeys.includes('ritual'),
    `Valfritt-typval ska innehålla ERF-bärande typer, fick: ${JSON.stringify(valfrittTypeKeys)}`
  );

  const valfrittStackElite = {
    id: 'elite-v2-stack-valfritt',
    namn: 'Elit V2 Stack Valfritt',
    taggar: { typ: ['Elityrke'] },
    krav: {
      total_erf: 80,
      primarformaga: { namn: 'Primärförmåga', krav_erf: 60 },
      specifikt_val: [],
      valfri_inom_tagg: [],
      valfritt: { krav_erf: 20 },
      specifika_fordelar: { namn: [], min_antal: 0 },
      specifika_nackdelar: { namn: [], min_antal: 0 }
    }
  };
  const projectedStackList = sandbox.eliteAdd.projectRequirementList(
    [{ ...primaryMaster }],
    [
      { name: 'Stackad Särdrag', level: 'pick' },
      { name: 'Stackad Särdrag', level: 'pick' }
    ]
  );
  const stackedCount = projectedStackList.filter(item => String(item?.namn || '').trim() === 'Stackad Särdrag').length;
  assert(stackedCount === 2, `Valfritt-projektion ska stödja antal för stapelbara poster (förväntat 2, fick ${stackedCount})`);
  const stackProjectedRes = sandbox.eliteAdd.checkProjectedRequirements(
    valfrittStackElite,
    [{ ...primaryMaster }],
    [
      { name: 'Stackad Särdrag', level: 'pick' },
      { name: 'Stackad Särdrag', level: 'pick' }
    ]
  );
  assert(stackProjectedRes && stackProjectedRes.ok === true, 'Valfritt med antal ska påverka projekterad ERF så kravet kan uppfyllas via valfritt-poolen');
}

try {
  const rootPath = unwrap($.NSFileManager.defaultManager.currentDirectoryPath);
  verifyRuleHelper(rootPath);
  verifySnapshotRules(rootPath);
  verifyUnifiedNarEvaluator(rootPath);
  verifyRuntimeConsumers(rootPath);
  verifyMaxCountRules(rootPath);
  verifyPermanentCorruption(rootPath);
  verifyCorruptionTrackStats(rootPath);
  verifyCarryCapacityRules(rootPath);
  verifyRaceConflictRules(rootPath);
  verifyInventoryGrantRules(rootPath);
  verifyEntryGrantRules(rootPath);
  verifyMoneyGrantRules(rootPath);
  verifyXpNeutralizationForGrants(rootPath);
  verifyRequirementRules(rootPath);
  verifyRequirementScopeLogic(rootPath);
  verifyEliteRequirementV2(rootPath);
  verifyToughnessRules(rootPath);
  verifyTraitTotalMaxRules(rootPath);
  verifyPainThresholdRules(rootPath);
  verifyLegacyImportExport(rootPath);
  verifyLegacyLoad(rootPath);
  verifyDefenseSchemaMigration(rootPath);
  verifyDefenseModifierRules(rootPath);
  verifyArmorRestrictionBonusRules(rootPath);
  verifyWeaponDefenseBonusRules(rootPath);
  verifySelectiveDefenseModifierWeaponContext(rootPath);
  verifyArmorQualityDefenseModifier(rootPath);
  verifyDefenseLoadoutCompatibility(rootPath);
  verifyDefenseAutoOptimizer(rootPath);
  verifyWeaponAttackBonusRules(rootPath);
  verifyObalanserat(rootPath);
  verifyTargetDrivenMonstruosKrav(rootPath);
  verifyRuleExtends(rootPath);
  verifyTypeRuleHierarchy(rootPath);
  verifyHamnskifteGrants(rootPath);
  verifyGrantCleanupRules(rootPath);
  verifySeparateDefenseRules(rootPath);
  verifyItemWeightModifiers(rootPath);
  verifyQualityPriceAndFreeRules(rootPath);
  verifyMalCoverage(rootPath);
  console.log('verify_rules_helper: ok');
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  const stack = error && error.stack ? error.stack : '';
  console.log(`verify_rules_helper: failed\n${message}\n${stack}`);
  $.exit(1);
}
