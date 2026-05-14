import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const catalogSchemaPath = path.join(repoRoot, 'js', 'catalog-schema.js');
const storePath = path.join(repoRoot, 'js', 'store.js');
const catalogSchemaSource = fs.readFileSync(catalogSchemaPath, 'utf8');
const storeSource = fs.readFileSync(storePath, 'utf8');
const legacyMap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'legacy-import-map.json'), 'utf8'));

const DATA_EXCLUDES = new Set([
  'ai-plugin.json',
  'all.json',
  'index-catalog.json',
  'legacy-import-map.json',
  'pdf-list.json',
  'struktur.json',
  'tabeller.json'
]);

function createLocalStorage() {
  const state = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? String(state[key]) : null;
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
    crypto: {
      randomUUID() {
        return `test-${Math.random().toString(36).slice(2)}`;
      }
    },
    localStorage: createLocalStorage(),
    ENTRY_SORT_DEFAULT: 'alpha-asc',
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
  vm.runInNewContext(catalogSchemaSource, sandbox, { filename: catalogSchemaPath });
  const entries = loadCatalogEntries(sandbox.window.catalogSchema);
  const db = [];
  const dbIndex = {};
  entries.forEach(entry => {
    db.push(entry);
    if (entry?.id) db[entry.id] = entry;
    if (entry?.namn) dbIndex[entry.namn] = entry;
  });
  sandbox.DB = db;
  sandbox.DBIndex = dbIndex;
  sandbox.lookupEntry = (ref, options = {}) => {
    const id = typeof ref === 'string' ? ref : ref?.id;
    const name = typeof ref === 'string' ? ref : (options.explicitName || ref?.name || ref?.namn);
    if (id && db[id]) return db[id];
    if (id) {
      const byId = db.find(entry => String(entry?.id ?? '') === String(id));
      if (byId) return byId;
    }
    if (options.allowNameFallback !== false && name) {
      return dbIndex[name] || db.find(entry => entry?.namn === name);
    }
    return undefined;
  };
  vm.runInNewContext(storeSource, sandbox, { filename: storePath });
  sandbox.window.storeHelper.setLegacyImportMap(legacyMap);
  return sandbox;
}

function loadCatalogEntries(catalogSchema) {
  const dataDir = path.join(repoRoot, 'data');
  return fs.readdirSync(dataDir)
    .filter(name => name.endsWith('.json') && !DATA_EXCLUDES.has(name))
    .flatMap(name => {
      const payload = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
      return catalogSchema.normalizePayload(payload, { sourceFile: `data/${name}` }).entries;
    });
}

function emptyStore() {
  return {
    current: '',
    characters: [],
    folders: [{ id: 'std', name: 'Standard', system: true, order: 0 }],
    data: {}
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function importFixture(storeHelper, store, relativePath) {
  const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
  const items = Array.isArray(payload) ? payload : [payload];
  return items.map(item => {
    const id = storeHelper.importCharacterJSON(store, clone(item));
    expect(id).toBeTruthy();
    return id;
  });
}

function collectStringValues(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectStringValues(item, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectStringValues(item, out));
  }
  return out;
}

function assertCharacterRefsResolved(sandbox, data) {
  const customById = new Set((data.custom || []).map(entry => entry.id).filter(Boolean));
  const isKnown = id => Boolean(customById.has(id) || sandbox.DB[id]);
  const unresolved = [];
  const checkRef = (kind, ref) => {
    if (!ref || typeof ref !== 'object') return;
    const id = ref.id;
    if (id && !isKnown(id)) unresolved.push(`${kind}:${id}:${ref.name || ref.namn || ''}`);
  };
  (data.list || []).forEach(entry => checkRef('list', entry));
  const walkInventory = rows => (rows || []).forEach(row => {
    if (row?.typ !== 'currency') checkRef('inventory', row);
    if (Array.isArray(row?.contains)) walkInventory(row.contains);
  });
  walkInventory(data.inventory || []);
  checkRef('defense-armor', data.defenseSetup?.armor);
  (data.defenseSetup?.weapons || []).forEach(item => checkRef('defense-weapon', item));
  checkRef('defense-dancing', data.defenseSetup?.dancingWeapon);
  Object.values(data.defenseSetup?.separateWeapons || {}).flat().forEach(item => checkRef('defense-separate', item));
  (data.revealedArtifacts || []).forEach(id => {
    if (id && !isKnown(id)) unresolved.push(`revealed:${id}`);
  });
  expect(unresolved).toEqual([]);
}

function oldWeaponIdValues(value) {
  return collectStringValues(value).filter(text => /^v\d+$/.test(text));
}

describe('legacy character import map', () => {
  it('canonicalizes old weapon IDs and aliases during import/export', () => {
    const sandbox = createSandbox();
    const storeHelper = sandbox.window.storeHelper;
    const store = emptyStore();
    const id = storeHelper.importCharacterJSON(store, {
      name: 'Legacy aliases',
      data: {
        list: [{ id: 'v17', namn: 'Tunga vapen', taggar: { typ: ['Vapen', 'Tunga vapen'] } }],
        inventory: [
          { i: 'v14', n: 'Sköld' },
          { i: 'v21', n: 'Armborst' },
          { n: 'Flinta och stål' }
        ],
        defenseSetup: {
          enabled: true,
          weapons: [{ id: 'v15', name: 'Bucklare' }, { id: 'v21', name: 'Armborst' }]
        }
      }
    });

    expect(id).toBeTruthy();
    const data = store.data[id];
    expect(data.list[0].id).toBe('nv17');
    expect(data.list[0].namn).toBe('Tvåhandsvapen');
    expect(data.inventory.map(row => row.id)).toEqual(['nv14', 'av1', 'di10']);
    expect(data.inventory[2].name).toBe('Flinta & stål');
    expect(data.defenseSetup.weapons.map(item => item.id)).toEqual(['nv15', 'av1']);
    expect(oldWeaponIdValues(storeHelper.exportCharacterJSON(store, id))).toEqual([]);
  });

  it('imports representative OLD_VERSION character fixtures without unresolved refs', () => {
    const sandbox = createSandbox();
    const storeHelper = sandbox.window.storeHelper;
    const store = emptyStore();
    const ids = [
      ...importFixture(storeHelper, store, 'OLD_VERSION/CHARACTERS/Briost.json'),
      ...importFixture(storeHelper, store, 'OLD_VERSION/CHARACTERS/Rex.json'),
      ...importFixture(storeHelper, store, 'OLD_VERSION/CHARACTERS/Magnum.json'),
      ...importFixture(storeHelper, store, 'OLD_VERSION/CHARACTERS/Rollpersoner.json')
    ];

    ids.forEach(id => {
      assertCharacterRefsResolved(sandbox, store.data[id]);
      expect(oldWeaponIdValues(storeHelper.exportCharacterJSON(store, id))).toEqual([]);
    });

    const importedNames = ids.map(id => store.characters.find(char => char.id === id)?.name);
    const magnumId = ids.find(id => store.characters.find(char => char.id === id)?.name === 'Magnum');
    expect(importedNames).toContain('Magnum');
    const magnumCustom = store.data[magnumId].custom;
    expect(magnumCustom.filter(entry => entry.namn === 'Ruinen').map(entry => entry.id).sort()).toEqual([
      '4f280447-f9d7-4741-8d3c-1e1f4f996b55',
      '812d8166-e2fa-46f2-8623-d7092a5d6f89',
      'b7962a60-d324-4910-8ef5-16e48b52768d',
    ]);
    expect(store.data[ids[0]].inventory.some(row => row.id === 'nv14' && row.name === 'Sköld')).toBe(true);
  });
});
