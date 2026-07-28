import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildHandoffMessage,
  buildRecoveryEnvelope,
  extractIndexedDb,
  extractLegacyJson,
  extractLocalStorage,
  serializeRecoveryEnvelope
} from '../recovery/recovery-core.js';

const sourceOrigin = 'https://nederfors.github.io';

test('combined and split localStorage are both inventoried, exact duplicates deduplicate, and conflicts survive', () => {
  const shared = { list: [{ id: 'ability-a' }], notes: { background: 'shared' } };
  const combined = extractLocalStorage({
    rpall: JSON.stringify({
      current: 'same-id',
      characters: [
        { id: 'same-id', name: 'Shared Hero', folderId: 'f1' },
        { id: 'conflict-id', name: 'Combined Hero', folderId: 'f1' }
      ],
      folders: [{ id: 'f1', name: 'Heroes', order: 1 }],
      data: { 'same-id': shared, 'conflict-id': { notes: { background: 'combined' } } }
    })
  });
  const split = extractLocalStorage({
    'rpall-meta': JSON.stringify({
      characters: [
        { id: 'same-id', name: 'Shared Hero', folderId: 'f1' },
        { id: 'conflict-id', name: 'Split Hero', folderId: 'f1' }
      ],
      folders: [{ id: 'f1', name: 'Heroes', order: 1 }]
    }),
    'rpall-char-same-id': JSON.stringify(shared),
    'rpall-char-conflict-id': JSON.stringify({ notes: { background: 'split' } })
  });
  const envelope = buildRecoveryEnvelope({ sourceOrigin, extractions: [combined, split] });

  assert.equal(envelope.characters.filter(row => row.sourceId === 'same-id').length, 1);
  assert.equal(envelope.characters.find(row => row.sourceId === 'same-id').sources.length, 2);
  assert.equal(envelope.characters.filter(row => row.sourceId === 'conflict-id').length, 2);
  assert.ok(envelope.characters.filter(row => row.sourceId === 'conflict-id').every(row => row.variant.count === 2));
  assert.ok(envelope.anomalies.some(row => row.code === 'same-source-id-conflict'));
  assert.equal(envelope.folders.length, 1);
  assert.equal(envelope.folders[0].sources.length, 2);
});
test('raw IndexedDB v1, v2, v3 and partial mixed rows reconstruct without cached catalog content', () => {
  const stores = {
    characters: [
      { id: 'mixed', name: 'Mixed Hero', sortOrder: 0, folderId: 'folder-a' },
      { id: 'fields-only', name: 'Fields Only', sortOrder: 1, folderId: 'folder-a' }
    ],
    characterState: [{ id: 'mixed', state: { notes: { background: 'v1' }, money: { daler: 4 }, list: ['kept'] } }],
    characterFields: [
      { key: 'mixed:notes', charId: 'mixed', field: 'notes', value: { background: 'v2' } },
      { key: 'fields-only:money', charId: 'fields-only', field: 'money', value: { daler: 9 } }
    ],
    folders: [{ id: 'folder-a', name: 'Recovered', order: 0 }],
    cachedEntries: { count: 250 },
    uiPrefs: { count: 2 },
    hostedCharacterProvenance: [{ accountId: 'account-a', characterId: 'mixed', kind: 'revision', revision: 'r7' }]
  };

  for (const [version, generation] of [[10, 'indexeddb-v1'], [20, 'indexeddb-v2'], [30, 'indexeddb-v3']]) {
    const extraction = extractIndexedDb({ version, stores });
    assert.equal(extraction.inventory[0].generation, generation);
    assert.equal(extraction.inventory[0].stores.cachedEntries, 250);
  }

  const extraction = extractIndexedDb({ version: 30, stores });
  const mixed = extraction.candidates.find(row => row.sourceId === 'mixed');
  assert.deepEqual(mixed.data, {
    list: ['kept'],
    money: { daler: 4 },
    notes: { background: 'v2' }
  });
  assert.deepEqual(extraction.candidates.find(row => row.sourceId === 'fields-only').data, { money: { daler: 9 } });
  assert.ok(extraction.anomalies.some(row => row.code === 'missing-indexeddb-base-state'));
  assert.equal(extraction.hostedProvenance.length, 1);
  assert.equal(extraction.hostedProvenance[0].recoveryProvenance, false);
  assert.equal(serializeRecoveryEnvelope(buildRecoveryEnvelope({ sourceOrigin, extractions: [extraction] })).includes('cached catalog'), false);
  assert.equal(serializeRecoveryEnvelope(buildRecoveryEnvelope({ sourceOrigin, extractions: [extraction] })).includes('account-a'), true);
});

test('malformed and orphan records remain explicit while valid orphan state stays recoverable', () => {
  const local = extractLocalStorage({
    'rpall-meta': '{bad',
    'rpall-char-orphan': JSON.stringify({ notes: { background: 'recover me' } }),
    'rpall-char-broken': 'not-json'
  });
  const database = extractIndexedDb({
    version: 20,
    stores: {
      characters: [{ id: 'missing', name: 'Missing state' }],
      characterState: [{ id: 'db-orphan', state: { money: { daler: 2 } } }, { id: '', state: [] }],
      characterFields: [{ key: 'bad', charId: '', field: '', value: 1 }],
      folders: [{ name: 'No id' }]
    }
  });
  const envelope = buildRecoveryEnvelope({ sourceOrigin, extractions: [local, database] });
  assert.ok(envelope.characters.some(row => row.sourceId === 'orphan'));
  assert.ok(envelope.characters.some(row => row.sourceId === 'db-orphan'));
  assert.ok(!envelope.characters.some(row => row.sourceId === 'missing'));
  for (const code of ['malformed-split-meta-json', 'malformed-split-character-json', 'orphan-character-state', 'malformed-indexeddb-state', 'malformed-indexeddb-field', 'missing-indexeddb-character-state']) {
    assert.ok(envelope.anomalies.some(row => row.code === code), `missing anomaly ${code}`);
  }
});

test('approved legacy JSON forms are normalized and deterministic', () => {
  const single = extractLegacyJson(JSON.stringify({
    format: 'symbapedia-character',
    formatVersion: 1,
    name: 'Single',
    folder: 'Exports',
    data: { inventory: [{ i: 'di10', n: 'Flinta & stål' }] }
  }), 'single.json');
  const array = extractLegacyJson(JSON.stringify([
    { name: 'Unversioned', data: { notes: { background: 'old' } } },
    { format: 'symbapedia-character', formatVersion: 2, name: 'Current', data: { list: [] } }
  ]), 'array.json');
  const folders = extractLegacyJson(JSON.stringify({ folders: [{
    id: 'folder-json',
    name: 'JSON folder',
    characters: [{ name: 'Bundled', data: { money: { daler: 3 } } }]
  }] }), 'folders.json');
  const wrapped = extractLegacyJson(JSON.stringify({ characters: [{ name: 'Wrapped', data: { custom: [] } }] }), 'wrapped.json');
  const extractions = [single, array, folders, wrapped];
  const one = buildRecoveryEnvelope({ sourceOrigin, extractions });
  const two = buildRecoveryEnvelope({ sourceOrigin, extractions: [...extractions].reverse() });
  assert.equal(one.characters.length, 5);
  assert.equal(serializeRecoveryEnvelope(one), serializeRecoveryEnvelope(two));
  assert.equal(one.recoveryFormat, 'symbapedia-recovery');
  assert.equal(one.formatVersion, 1);
  const handoff = buildHandoffMessage(one, 'nonce-1', sourceOrigin);
  assert.equal(handoff.type, 'symbapedia-recovery-transfer');
  assert.deepEqual(handoff.recovery, one);
});

test('static recovery source contains no old app, Dexie, service-worker registration, or source writes', async () => {
  const files = await Promise.all([
    readFile(new URL('../recovery/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../recovery/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../recovery/recovery-core.js', import.meta.url), 'utf8')
  ]);
  const source = files.join('\n');
  assert.doesNotMatch(source, /\bDexie\b|serviceWorker\s*\.\s*register|js\/main\.js|js\/persistence\.js|app-bootstrap/);
  assert.doesNotMatch(source, /localStorage\s*\.\s*(?:setItem|removeItem|clear)\s*\(/);
  assert.doesNotMatch(source, /objectStore\([^)]*\)\s*\.\s*(?:add|put|delete|clear)\s*\(/);
  assert.doesNotMatch(source, /transaction\([^)]*,\s*['"]readwrite['"]/);
  assert.match(source, /transaction\(supportedStores, 'readonly'\)/);
  assert.match(source, /typeof indexedDB\.databases !== 'function'/);
});
