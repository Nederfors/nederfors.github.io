import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const snapshotHelperPath = path.join(repoRoot, 'js', 'snapshot-helper.js');
const snapshotHelperSource = fs.readFileSync(snapshotHelperPath, 'utf8');

function createSandbox(overrides = {}) {
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
    console
  };
  Object.assign(sandbox, overrides || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadSnapshotHelper(overrides = {}) {
  const sandbox = createSandbox(overrides);
  vm.runInNewContext(snapshotHelperSource, sandbox, { filename: snapshotHelperPath });
  return {
    helper: sandbox.window.snapshotHelper,
    sandbox
  };
}

describe('snapshot-helper', () => {
  it('returns empty impacts and noop for entries without snapshot sources', async () => {
    const { helper } = loadSnapshotHelper({
      storeHelper: {
        getSnapshotSourceImpactForEntry() {
          return { count: 0, sourceKeys: [], records: [] };
        }
      }
    });

    expect(helper.getEntryRemovalImpacts({}, { namn: 'Ingen källa' })).toEqual([]);
    await expect(helper.confirmRemovalDecision([])).resolves.toBe('noop');
  });

  it('builds singular entry prompts and maps dialog choices to decisions', async () => {
    const messages = [];
    const createHelper = (choice) => loadSnapshotHelper({
      storeHelper: {
        getSnapshotSourceImpactForEntry() {
          return {
            count: 2,
            sourceKeys: ['entry:1'],
            records: [
              { sourceKey: 'entry:1' },
              { sourceKey: 'entry:1' }
            ]
          };
        }
      },
      openDialog(message, options) {
        messages.push({ message, options });
        return Promise.resolve(choice);
      }
    }).helper;

    const removeHelper = createHelper(true);
    const detachHelper = createHelper('extra');
    const cancelHelper = createHelper(false);

    await expect(
      removeHelper.confirmRemovalDecision(removeHelper.getEntryRemovalImpacts({}, { namn: 'Solring' }))
    ).resolves.toBe('remove');
    await expect(
      detachHelper.confirmRemovalDecision(detachHelper.getEntryRemovalImpacts({}, { namn: 'Solring' }))
    ).resolves.toBe('detach');
    await expect(
      cancelHelper.confirmRemovalDecision(cancelHelper.getEntryRemovalImpacts({}, { namn: 'Solring' }))
    ).resolves.toBe('cancel');

    expect(messages).toEqual([
      {
        message: '“Solring” har 2 snapshot-effekter.\nVälj om de ska tas bort eller behållas när posten tas bort.',
        options: {
          cancel: true,
          okText: 'Ta bort effekter',
          extraText: 'Behåll effekter',
          cancelText: 'Avbryt'
        }
      },
      {
        message: '“Solring” har 2 snapshot-effekter.\nVälj om de ska tas bort eller behållas när posten tas bort.',
        options: {
          cancel: true,
          okText: 'Ta bort effekter',
          extraText: 'Behåll effekter',
          cancelText: 'Avbryt'
        }
      },
      {
        message: '“Solring” har 2 snapshot-effekter.\nVälj om de ska tas bort eller behållas när posten tas bort.',
        options: {
          cancel: true,
          okText: 'Ta bort effekter',
          extraText: 'Behåll effekter',
          cancelText: 'Avbryt'
        }
      }
    ]);
  });

  it('deduplicates row impacts and builds plural prompts', async () => {
    const messages = [];
    const { helper } = loadSnapshotHelper({
      storeHelper: {
        getSnapshotRuleRecords() {
          return [
            { sourceKey: 'artifact:a' },
            { sourceKey: 'artifact:a' },
            { sourceKey: 'artifact:b' },
            { sourceKey: 'artifact:c', detached: true }
          ];
        }
      },
      openDialog(message) {
        messages.push(message);
        return Promise.resolve(true);
      }
    });

    const impacts = helper.getRowRemovalImpacts({}, [
      {
        name: 'Amulett',
        snapshotSourceKey: 'artifact:a',
        contains: [{ name: 'Dublett', snapshotSourceKey: 'artifact:a' }]
      },
      {
        name: 'Ring',
        snapshotSourceKey: 'artifact:b'
      },
      {
        name: 'Ignorerad',
        snapshotSourceKey: 'artifact:c'
      }
    ], { includeChildren: true });

    expect(impacts).toEqual([
      { sourceKey: 'artifact:a', count: 2, label: 'Amulett' },
      { sourceKey: 'artifact:b', count: 1, label: 'Ring' }
    ]);
    await expect(helper.confirmRemovalDecision(impacts)).resolves.toBe('remove');
    expect(messages).toEqual([
      '2 poster har totalt 3 snapshot-effekter.\nVälj om de ska tas bort eller behållas när posterna tas bort.'
    ]);
  });

  it('uses fallback confirmPopup only for remove or cancel', async () => {
    const removeHelper = loadSnapshotHelper({
      confirmPopup() {
        return Promise.resolve(true);
      }
    }).helper;
    const cancelHelper = loadSnapshotHelper({
      confirmPopup() {
        return Promise.resolve(false);
      }
    }).helper;
    const impacts = [{ sourceKey: 'entry:1', count: 1, label: 'Solring' }];

    await expect(removeHelper.confirmRemovalDecision(impacts)).resolves.toBe('remove');
    await expect(cancelHelper.confirmRemovalDecision(impacts)).resolves.toBe('cancel');
  });
});
