import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const legacyFixtureDir = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'legacy'
);

const legacyCharacterPath = path.join(
  legacyFixtureDir,
  'Rollpersoner.json'
);

const legacyStorePath = path.join(
  legacyFixtureDir,
  'store.js'
);

const legacyMap = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'data', 'legacy-import-map.json'),
    'utf8'
  )
);

const catalogFiles = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'config', 'catalog-files.json'),
    'utf8'
  )
);

const CHARACTER_NAMES = [
  'Briost',
  'Brumhildemei',
  'Hurley',
  'Clemens',
  'Testperson',
  'Rex',
  'Magnum'
];

const OLD_XP_ORACLE = {
  Briost: { baseXp: 260, totalXp: 285, usedXp: 285, freeXp: 0 },
  Brumhildemei: { baseXp: 300, totalXp: 320, usedXp: 280, freeXp: 40 },
  Hurley: { baseXp: 261, totalXp: 281, usedXp: 280, freeXp: 1 },
  Clemens: { baseXp: 300, totalXp: 325, usedXp: 330, freeXp: -5 },
  Testperson: { baseXp: 250, totalXp: 250, usedXp: 60, freeXp: 190 },
  Rex: { baseXp: 256, totalXp: 281, usedXp: 275, freeXp: 6 },
  Magnum: { baseXp: 268, totalXp: 293, usedXp: 276, freeXp: 17 }
};

// Immutable catalog list used by the historical application.
// These fixtures let the historical implementation remain a regression oracle
// without keeping the complete old application in the active repository.
const OLD_CATALOG_FILES = [
  'diverse.json',
  'kuriositeter.json',
  'skatter.json',
  'elixir.json',
  'fordel.json',
  'formaga.json',
  'kvalitet.json',
  'mystisk-kraft.json',
  'mystisk-kvalitet.json',
  'neutral-kvalitet.json',
  'negativ-kvalitet.json',
  'nackdel.json',
  'anstallning.json',
  'byggnader.json',
  'yrke.json',
  'ras.json',
  'elityrke.json',
  'fardmedel.json',
  'forvaring.json',
  'gardsdjur.json',
  'instrument.json',
  'klader.json',
  'specialverktyg.json',
  'tjanster.json',
  'ritual.json',
  'rustning.json',
  'vapen.json',
  'mat.json',
  'dryck.json',
  'sardrag.json',
  'monstruost-sardrag.json',
  'artefakter.json',
  'lagre-artefakter.json',
  'fallor.json'
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLocalStorage() {
  const state = {};

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key)
        ? String(state[key])
        : null;
    },

    setItem(key, value) {
      state[key] = String(value);
    },

    removeItem(key) {
      delete state[key];
    }
  };
}

function createSandbox() {
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
    localStorage: createLocalStorage(),
    ENTRY_SORT_DEFAULT: 'alpha-asc',

    crypto: {
      randomUUID() {
        return `test-${Math.random().toString(36).slice(2)}`;
      }
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

      return {
        daler,
        skilling,
        'örtegar': ortegar,
        d: daler,
        s: skilling,
        o: ortegar
      };
    },

    explodeTags(value) {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string') return [];

      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    },

    isMonstrousTrait(entry) {
      return (entry?.taggar?.typ || []).includes('Monstruöst särdrag');
    }
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  return sandbox;
}

function wireCatalog(sandbox, entries) {
  const byId = new Map();
  const byName = new Map();
  const db = [];
  const dbIndex = {};

  entries.forEach(entry => {
    db.push(entry);

    if (entry?.id !== undefined && entry?.id !== null) {
      byId.set(String(entry.id), entry);
      db[entry.id] = entry;
    }

    if (entry?.namn) {
      byName.set(entry.namn, entry);
      dbIndex[entry.namn] = entry;
    }
  });

  sandbox.DB = db;
  sandbox.DBIndex = dbIndex;

  sandbox.lookupEntry = (ref, options = {}) => {
    const id = typeof ref === 'string'
      ? ref
      : ref?.id;

    const name = typeof ref === 'string'
      ? ref
      : (options.explicitName || ref?.name || ref?.namn);

    return (
      (id !== undefined && id !== null
        ? byId.get(String(id))
        : null)
      || byName.get(name)
      || undefined
    );
  };
}

function createOldRuntime() {
  const sandbox = createSandbox();

  const entries = OLD_CATALOG_FILES.flatMap(file => (
    JSON.parse(
      fs.readFileSync(
        path.join(legacyFixtureDir, file),
        'utf8'
      )
    )
  ));

  wireCatalog(sandbox, entries);

  vm.runInNewContext(
    fs.readFileSync(legacyStorePath, 'utf8'),
    sandbox,
    { filename: legacyStorePath }
  );

  return sandbox;
}

function createCurrentRuntime() {
  const sandbox = createSandbox();

  const catalogSchemaPath = path.join(
    repoRoot,
    'js',
    'catalog-schema.js'
  );

  vm.runInNewContext(
    fs.readFileSync(catalogSchemaPath, 'utf8'),
    sandbox,
    { filename: catalogSchemaPath }
  );

  const entries = catalogFiles.entryDataFiles.flatMap(file => {
    const payload = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'data', file),
        'utf8'
      )
    );

    return sandbox.catalogSchema.normalizePayload(
      payload,
      { sourceFile: `data/${file}` }
    ).entries;
  });

  wireCatalog(sandbox, entries);

  // Loading rules-helper before store is essential. The current XP model asks
  // it about grants and overrides; omitting it produces plausible but incorrect
  // +10 XP regressions for Hurley, Rex, and Magnum.
  const rulesHelperPath = path.join(
    repoRoot,
    'js',
    'rules-helper.js'
  );

  const storePath = path.join(
    repoRoot,
    'js',
    'store.js'
  );

  vm.runInNewContext(
    fs.readFileSync(rulesHelperPath, 'utf8'),
    sandbox,
    { filename: rulesHelperPath }
  );

  vm.runInNewContext(
    fs.readFileSync(storePath, 'utf8'),
    sandbox,
    { filename: storePath }
  );

  sandbox.storeHelper.setLegacyImportMap(legacyMap);

  return sandbox;
}

function emptyStore() {
  return {
    current: '',
    characters: [],
    folders: [
      {
        id: 'std',
        name: 'Standard',
        system: true,
        order: 0
      }
    ],
    data: {}
  };
}

function importCharacter(runtime, payload) {
  const store = emptyStore();
  const id = runtime.storeHelper.importCharacterJSON(
    store,
    clone(payload)
  );

  expect(id).toBeTruthy();

  store.current = id;

  return {
    store,
    id,
    data: store.data[id]
  };
}

const idAliases = legacyMap.entry_id_aliases || {};
const nameAliases = legacyMap.entry_name_aliases || {};
const qualityAliases = legacyMap.quality_name_aliases || {};
const typeAliases = legacyMap.type_aliases || {};

function aliasValue(map, value) {
  const raw = String(value ?? '').trim();

  if (!raw) return '';

  return Object.prototype.hasOwnProperty.call(map, raw)
    ? map[raw]
    : raw;
}

function normalizeReference(runtime, ref, isOld) {
  const rawId = ref?.id ?? ref?.i;
  const rawName = ref?.namn ?? ref?.name ?? ref?.n;

  let id = rawId === undefined || rawId === null
    ? ''
    : String(rawId).trim();

  let name = rawName === undefined || rawName === null
    ? ''
    : String(rawName).trim();

  if (isOld) {
    id = aliasValue(idAliases, id);

    const nameMappedId = Object.prototype.hasOwnProperty.call(
      nameAliases,
      name
    )
      ? nameAliases[name]
      : '';

    if (nameMappedId) {
      id = nameMappedId;

      const canonical = runtime.current.lookupEntry({
        id: nameMappedId
      });

      name = canonical?.namn || name;
    }
  }

  return { id, name };
}

function normalizeMoney(value) {
  const money = value && typeof value === 'object'
    ? value
    : {};

  return {
    daler: Number(money.daler ?? money.d) || 0,
    skilling: Number(money.skilling ?? money.s) || 0,
    'örtegar': Number(money['örtegar'] ?? money.o) || 0
  };
}

function normalizeEffects(value) {
  const effects = value && typeof value === 'object'
    ? value
    : {};

  return {
    xp: Number(effects.xp) || 0,
    corruption: Number(effects.corruption) || 0,
    toughness: Number(effects.toughness) || 0,
    pain: Number(effects.pain) || 0,
    capacity: Number(effects.capacity) || 0
  };
}

function normalizeStringList(values, aliases = null) {
  return (Array.isArray(values) ? values : [])
    .map(value => (
      aliases
        ? aliasValue(aliases, value)
        : String(value)
    ));
}

function projectSelected(runtime, list, isOld) {
  return (Array.isArray(list) ? list : [])
    .map(entry => {
      const ref = normalizeReference(
        runtime,
        entry,
        isOld
      );

      return {
        ...ref,
        level: String(entry?.nivå ?? entry?.l ?? ''),
        trait: String(entry?.trait ?? entry?.t ?? ''),
        race: String(entry?.race ?? entry?.r ?? ''),
        form: String(entry?.form ?? entry?.f ?? ''),
        order: entry?.__order ?? entry?.o ?? null,
        uid: String(entry?.__uid ?? entry?.u ?? ''),
        manualRuleOverride: Boolean(
          entry?.manualRuleOverride
          ?? entry?.mo
        )
      };
    });
}

function projectInventory(runtime, rows, isOld) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const type = row?.typ ?? row?.t;
      const money = row?.money ?? row?.m;

      if (type === 'currency' || money) {
        return {
          type: 'currency',
          name: String(
            row?.name
            ?? row?.n
            ?? 'Pengar'
          ),
          qty: Number(row?.qty ?? row?.q) || 1,
          money: normalizeMoney(money),
          weight: row?.vikt ?? row?.w ?? null,
          contains: projectInventory(
            runtime,
            row?.contains ?? row?.c,
            isOld
          )
        };
      }

      const ref = normalizeReference(
        runtime,
        row,
        isOld
      );

      const basePrice = row?.basePrice ?? row?.bp;

      return {
        ...ref,
        qty: Number(row?.qty ?? row?.q) || 1,
        free: Number(row?.gratis ?? row?.g) || 0,

        qualities: normalizeStringList(
          row?.kvaliteter ?? row?.k,
          isOld ? qualityAliases : null
        ),

        freeQualities: normalizeStringList(
          row?.gratisKval ?? row?.gk,
          isOld ? qualityAliases : null
        ),

        removedQualities: normalizeStringList(
          row?.removedKval ?? row?.rk,
          isOld ? qualityAliases : null
        ),

        manualQualities: normalizeStringList(
          row?.manualQualityOverride ?? row?.mqo,
          isOld ? qualityAliases : null
        ),

        artifactEffect: String(
          row?.artifactEffect
          ?? row?.e
          ?? ''
        ),

        level: String(
          row?.nivå
          ?? row?.l
          ?? ''
        ),

        trait: String(
          row?.trait
          ?? row?.t
          ?? ''
        ),

        perk: String(
          row?.perk
          ?? row?.pk
          ?? ''
        ),

        perkFree: Number(
          row?.perkGratis
          ?? row?.pg
        ) || 0,

        weight: row?.vikt ?? row?.w ?? null,

        basePrice: basePrice
          ? normalizeMoney(basePrice)
          : null,

        basePriceSource: String(
          row?.basePriceSource
          ?? row?.bps
          ?? ''
        ),

        priceMultiplier: Number(
          row?.priceMult
          ?? row?.pm
        ) || 1,

        snapshotSourceKey: String(
          row?.snapshotSourceKey
          ?? row?.ssk
          ?? ''
        ),

        equippedSlot: String(
          row?.equippedSlot
          ?? row?.es
          ?? ''
        ),

        contains: projectInventory(
          runtime,
          row?.contains ?? row?.c,
          isOld
        )
      };
    });
}

function projectDefenseItem(runtime, item, isOld) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    ...normalizeReference(
      runtime,
      item,
      isOld
    ),

    path: Array.isArray(item.path)
      ? item.path.map(Number)
      : []
  };
}

function projectDefense(runtime, setup, isOld) {
  const source = setup && typeof setup === 'object'
    ? setup
    : {};

  const separateWeapons = {};

  Object.entries(
    source.separateWeapons || {}
  ).forEach(([key, value]) => {
    const normalizedKey = isOld
      ? aliasValue(idAliases, key)
      : key;

    separateWeapons[normalizedKey] = (
      Array.isArray(value)
        ? value
        : [value]
    ).map(item => (
      projectDefenseItem(
        runtime,
        item,
        isOld
      )
    ));
  });

  return {
    enabled: Boolean(source.enabled),
    trait: String(source.trait || ''),

    armor: projectDefenseItem(
      runtime,
      source.armor,
      isOld
    ),

    weapons: (
      Array.isArray(source.weapons)
        ? source.weapons
        : []
    ).map(item => (
      projectDefenseItem(
        runtime,
        item,
        isOld
      )
    )),

    dancingTrait: String(
      source.dancingTrait || ''
    ),

    dancingWeapon: projectDefenseItem(
      runtime,
      source.dancingWeapon,
      isOld
    ),

    separateWeapons
  };
}

function normalizeCustomTags(tags, isOld) {
  if (
    !tags
    || typeof tags !== 'object'
    || Array.isArray(tags)
  ) {
    return tags;
  }

  const normalized = clone(tags);

  ['typ', 'types'].forEach(key => {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalizeStringList(
        normalized[key],
        isOld ? typeAliases : null
      );
    }
  });

  ['kvalitet', 'qualities'].forEach(key => {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalizeStringList(
        normalized[key],
        isOld ? qualityAliases : null
      );
    }
  });

  return normalized;
}

function projectCustom(entries, isOld) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => {
      const normalized = clone(entry);

      if (
        normalized.id !== undefined
        && isOld
      ) {
        normalized.id = aliasValue(
          idAliases,
          normalized.id
        );
      }

      if (normalized.taggar) {
        normalized.taggar = normalizeCustomTags(
          normalized.taggar,
          isOld
        );
      }

      if (normalized.tags) {
        normalized.tags = normalizeCustomTags(
          normalized.tags,
          isOld
        );
      }

      [
        'kvaliteter',
        'qualities',
        'gratisKval',
        'removedKval',
        'manualQualityOverride'
      ].forEach(key => {
        if (Array.isArray(normalized[key])) {
          normalized[key] = normalizeStringList(
            normalized[key],
            isOld ? qualityAliases : null
          );
        }
      });

      return normalized;
    });
}

function normalizeRevealed(values, isOld) {
  return (Array.isArray(values) ? values : [])
    .map(value => {
      const raw = String(value ?? '').trim();

      if (!isOld) {
        return raw;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          nameAliases,
          raw
        )
      ) {
        return nameAliases[raw];
      }

      return aliasValue(
        idAliases,
        raw
      );
    });
}

function calculateXp(runtime, imported) {
  const helper = runtime.storeHelper;

  const list = helper.getCurrentList(
    imported.store
  );

  const artifactEffects = helper.getArtifactEffects(
    imported.store
  );

  const manualAdjustments = helper.getManualAdjustments(
    imported.store
  );

  const baseXp = helper.getBaseXP(
    imported.store
  );

  const usedXp = helper.calcUsedXP(
    list,
    {
      xp:
        (artifactEffects?.xp || 0)
        + (manualAdjustments?.xp || 0),

      corruption:
        (artifactEffects?.corruption || 0)
        + (manualAdjustments?.corruption || 0)
    }
  );

  const totalXp = helper.calcTotalXP(
    baseXp,
    list
  );

  return {
    baseXp,
    totalXp,
    usedXp,
    freeXp: totalXp - usedXp
  };
}

function projectCharacter(
  runtimePair,
  runtime,
  imported,
  isOld
) {
  const helper = runtime.storeHelper;
  const data = imported.data;

  const character = imported.store.characters
    .find(item => item.id === imported.id);

  return {
    name: character?.name || '',
    folderId: character?.folderId || '',
    xp: calculateXp(runtime, imported),
    traits: clone(data.traits || {}),
    money: normalizeMoney(data.money),
    bonusMoney: normalizeMoney(data.bonusMoney),
    savedUnusedMoney: normalizeMoney(data.savedUnusedMoney),
    privateMoney: normalizeMoney(data.privMoney),
    possessionMoney: normalizeMoney(data.possessionMoney),
    possessionRemoved: Number(data.possessionRemoved) || 0,
    notes: clone(data.notes || {}),

    artifactEffects: normalizeEffects(
      helper.getArtifactEffects(imported.store)
    ),

    manualAdjustments: normalizeEffects(
      helper.getManualAdjustments(imported.store)
    ),

    selected: projectSelected(
      runtimePair,
      helper.getCurrentList(imported.store),
      isOld
    ),

    inventory: projectInventory(
      runtimePair,
      data.inventory,
      isOld
    ),

    defense: projectDefense(
      runtimePair,
      data.defenseSetup,
      isOld
    ),

    forcedDefense: String(
      data.forcedDefense || ''
    ),

    custom: projectCustom(
      data.custom,
      isOld
    ),

    revealedArtifacts: normalizeRevealed(
      data.revealedArtifacts,
      isOld
    ),

    liveMode: Boolean(data.liveMode)
  };
}

function resolveInventoryPath(rows, pathParts) {
  let currentRows = rows;
  let row = null;

  for (const part of pathParts) {
    if (!Array.isArray(currentRows)) {
      return null;
    }

    row = currentRows[Number(part)] || null;

    if (!row) {
      return null;
    }

    currentRows = row.contains;
  }

  return row;
}

function defenseItems(setup) {
  const items = [];

  if (setup?.armor) {
    items.push({
      kind: 'armor',
      item: setup.armor
    });
  }

  if (Array.isArray(setup?.weapons)) {
    setup.weapons.forEach((item, index) => {
      items.push({
        kind: `weapon:${index}`,
        item
      });
    });
  }

  if (setup?.dancingWeapon) {
    items.push({
      kind: 'dancingWeapon',
      item: setup.dancingWeapon
    });
  }

  Object.entries(
    setup?.separateWeapons || {}
  ).forEach(([key, value]) => {
    (
      Array.isArray(value)
        ? value
        : [value]
    ).forEach((item, index) => {
      if (item) {
        items.push({
          kind: `separateWeapon:${key}:${index}`,
          item
        });
      }
    });
  });

  return items;
}

function projectDefensePathResolution(
  runtimePair,
  imported,
  isOld
) {
  return defenseItems(
    imported.data.defenseSetup
  ).map(({ kind, item }) => {
    const pathParts = Array.isArray(item.path)
      ? item.path.map(Number)
      : [];

    const inventoryRow = resolveInventoryPath(
      imported.data.inventory,
      pathParts
    );

    const ref = normalizeReference(
      runtimePair,
      item,
      isOld
    );

    const target = inventoryRow
      ? normalizeReference(
          runtimePair,
          inventoryRow,
          isOld
        )
      : null;

    return {
      kind,
      path: pathParts,
      ref,
      target,
      matches: Boolean(
        target
        && target.id === ref.id
        && target.name === ref.name
      )
    };
  });
}

function findInventoryRow(rows, predicate) {
  for (const row of Array.isArray(rows) ? rows : []) {
    if (predicate(row)) {
      return row;
    }

    const nested = findInventoryRow(
      row?.contains,
      predicate
    );

    if (nested) {
      return nested;
    }
  }

  return null;
}

let runtimes;
let fixturePairs;

beforeAll(() => {
  const fixtures = JSON.parse(
    fs.readFileSync(
      legacyCharacterPath,
      'utf8'
    )
  );

  expect(
    fixtures.map(item => item.name)
  ).toEqual(CHARACTER_NAMES);

  runtimes = {
    old: createOldRuntime(),
    current: createCurrentRuntime()
  };

  const runtimePair = {
    old: runtimes.old,
    current: runtimes.current
  };

  fixturePairs = new Map(
    fixtures.map(payload => {
      const oldImported = importCharacter(
        runtimes.old,
        payload
      );

      const currentImported = importCharacter(
        runtimes.current,
        payload
      );

      return [
        payload.name,
        {
          oldImported,
          currentImported,

          oldProjection: projectCharacter(
            runtimePair,
            runtimes.old,
            oldImported,
            true
          ),

          currentProjection: projectCharacter(
            runtimePair,
            runtimes.current,
            currentImported,
            false
          )
        }
      ];
    })
  );
});

describe('legacy character import parity', () => {
  it.each(CHARACTER_NAMES)(
    '%s preserves the legacy XP result',
    name => {
      const pair = fixturePairs.get(name);

      expect(
        pair.oldProjection.xp
      ).toEqual(
        OLD_XP_ORACLE[name]
      );

      expect(
        pair.currentProjection.xp
      ).toEqual(
        OLD_XP_ORACLE[name]
      );
    }
  );

  it.each(CHARACTER_NAMES)(
    '%s preserves semantic character state',
    name => {
      const pair = fixturePairs.get(name);
      const oldState = pair.oldProjection;
      const currentState = pair.currentProjection;

      const sections = [
        'name',
        'folderId',
        'traits',
        'money',
        'bonusMoney',
        'savedUnusedMoney',
        'privateMoney',
        'possessionMoney',
        'possessionRemoved',
        'notes',
        'artifactEffects',
        'manualAdjustments',
        'selected',
        'inventory',
        'defense',
        'forcedDefense',
        'custom',
        'revealedArtifacts',
        'liveMode'
      ];

      sections.forEach(section => {
        expect.soft(
          currentState[section],
          `${name}: ${section}`
        ).toEqual(
          oldState[section]
        );
      });
    }
  );

  it.each(CHARACTER_NAMES)(
    '%s preserves defense path resolution',
    name => {
      const pair = fixturePairs.get(name);

      const runtimePair = {
        old: runtimes.old,
        current: runtimes.current
      };

      const oldResolution = projectDefensePathResolution(
        runtimePair,
        pair.oldImported,
        true
      );

      const currentResolution = projectDefensePathResolution(
        runtimePair,
        pair.currentImported,
        false
      );

      expect(
        currentResolution
      ).toEqual(
        oldResolution
      );

      if (name !== 'Clemens') {
        expect(
          currentResolution.every(
            item => item.matches
          )
        ).toBe(true);
      }
    }
  );

  it(
    'keeps Clemens\'s stale legacy defense paths explicit',
    () => {
      const clemens = fixturePairs.get('Clemens');

      const runtimePair = {
        old: runtimes.old,
        current: runtimes.current
      };

      const currentResolution = projectDefensePathResolution(
        runtimePair,
        clemens.currentImported,
        false
      );

      expect(currentResolution).toEqual([
        {
          kind: 'armor',
          path: [1],
          ref: {
            id: 'ru12',
            name: 'Helrustning'
          },
          target: {
            id: 'di23',
            name: 'Papper'
          },
          matches: false
        },
        {
          kind: 'weapon:0',
          path: [0],
          ref: {
            id: 'nv18',
            name: 'Bastardsvärd'
          },
          target: {
            id: 'di12',
            name: 'Rep, 10 meter'
          },
          matches: false
        }
      ]);
    }
  );

  it(
    'keeps documented literal alias changes explicit',
    () => {
      const rex = fixturePairs.get('Rex');

      const oldFlint = findInventoryRow(
        rex.oldImported.data.inventory,
        row => (
          row?.name || row?.n
        ) === 'Flinta och stål'
      );

      const currentFlint = findInventoryRow(
        rex.currentImported.data.inventory,
        row => row?.id === 'di10'
      );

      expect({
        oldId: oldFlint?.id || '',
        oldName: oldFlint?.name || '',
        currentId: currentFlint?.id || '',
        currentName: currentFlint?.name || ''
      }).toEqual({
        oldId: '',
        oldName: 'Flinta och stål',
        currentId: 'di10',
        currentName: 'Flinta & stål'
      });

      const magnum = fixturePairs.get('Magnum');

      const oldTitan = magnum.oldImported.data.custom
        .find(
          entry => (
            entry.namn === 'Titanernas fot'
          )
        );

      const currentTitan = magnum.currentImported.data.custom
        .find(
          entry => (
            entry.namn === 'Titanernas fot'
          )
        );

      expect({
        oldTypes: oldTitan?.taggar?.typ || [],
        currentTypes: currentTitan?.taggar?.typ || []
      }).toEqual({
        oldTypes: ['Hemmagjort', 'Vapen'],
        currentTypes: [
          'Hemmagjort',
          'Närstridsvapen'
        ]
      });
    }
  );

  it(
    'preserves legacy display names when no documented name alias exists',
    () => {
      const clemens = fixturePairs.get('Clemens');

      const oldEntry = clemens.oldImported.data.list
        .find(
          entry => entry.id === 'form71'
        );

      const currentEntry = clemens.currentImported.data.list
        .find(
          entry => entry.id === 'form71'
        );

      expect({
        oldName: oldEntry?.namn || '',
        currentName: currentEntry?.namn || ''
      }).toEqual({
        oldName: 'Krigarens skärpa',
        currentName: 'Krigarens skärpa'
      });
    }
  );

  it(
    'keeps the imported projection stable across reload and versions new exports',
    () => {
      const runtime = createCurrentRuntime();

      const fixtures = JSON.parse(
        fs.readFileSync(
          legacyCharacterPath,
          'utf8'
        )
      );

      const payload = fixtures.find(
        item => item.name === 'Clemens'
      );

      const imported = importCharacter(
        runtime,
        payload
      );

      const runtimePair = {
        old: runtime,
        current: runtime
      };

      const beforeReload = projectCharacter(
        runtimePair,
        runtime,
        imported,
        false
      );

      const reloadedStore = runtime.storeHelper.load();

      const reloaded = {
        store: reloadedStore,
        id: imported.id,
        data: reloadedStore.data[imported.id]
      };

      const afterReload = projectCharacter(
        runtimePair,
        runtime,
        reloaded,
        false
      );

      expect(
        afterReload
      ).toEqual(
        beforeReload
      );

      expect(
        reloaded.data.list.find(
          entry => entry.id === 'form71'
        )?.namn
      ).toBe(
        'Krigarens skärpa'
      );

      expect(
        runtime.storeHelper.exportCharacterJSON(
          reloadedStore,
          imported.id,
          false
        )
      ).toMatchObject({
        format: 'symbapedia-character',
        formatVersion: 2,
        rulesetVersion: 3
      });
    }
  );
});