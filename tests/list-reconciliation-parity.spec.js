import { expect, test } from '@playwright/test';

const TEST_CHAR_ID = 'reconciliation-parity-host';
const STANDARD_FOLDER_ID = 'fd-standard';

async function seedHostCharacter(page) {
  await page.addInitScript(({ charId, folderId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: charId,
      characters: [{ id: charId, name: 'Parity Host', folderId }],
      folders: [{ id: folderId, name: 'Standard', order: 0, system: true }],
      activeFolder: 'ALL',
      filterUnion: false,
      compactEntries: true,
      onlySelected: false,
      recentSearches: [],
      liveMode: false,
      entrySort: 'alpha-asc'
    }));
    localStorage.setItem(`rpall-char-${charId}`, JSON.stringify({
      list: [],
      inventory: [],
      custom: [],
      notes: {},
      privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
      possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
      bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
    }));
  }, { charId: TEST_CHAR_ID, folderId: STANDARD_FOLDER_ID });
}

test('incremental and forced-full list reconciliation produce identical public state', async ({ page }) => {
  await seedHostCharacter(page);
  await page.goto('/#/index');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(window.storeHelper?.setCurrentList)
  ));

  const results = await page.evaluate(async () => {
    await window.catalogLoader?.ensureFullDatabase?.();

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const money = () => ({ daler: 0, skilling: 0, 'örtegar': 0 });
    const neutralEntry = () => ({
      id: 'parity-neutral',
      namn: 'Parity Neutral',
      nivå: 'Novis',
      form: 'normal',
      taggar: { typ: ['Förmåga'] }
    });
    const lookup = (name) => {
      const entry = window.lookupEntry?.({ name })
        || (window.DB || []).find(candidate => String(candidate?.namn || '').trim() === name)
        || null;
      if (!entry) throw new Error(`Missing parity catalog entry: ${name}`);
      return clone(entry);
    };
    const withLevel = (entry, level) => ({ ...entry, nivå: level });
    const snapshotEntry = () => ({
      id: 'parity-snapshot',
      namn: 'Parity Snapshot',
      nivå: 'Novis',
      taggar: {
        typ: ['Fördel'],
        regler: {
          andrar: [{
            mal: 'smartgrans_tillagg',
            varde: -2,
            snapshot: true
          }]
        }
      }
    });

    const scenarios = [
      {
        name: 'plain-add',
        base: [],
        added: () => withLevel(lookup('Akrobatik'), 'Novis')
      },
      {
        name: 'choice-data',
        base: [],
        added: () => ({
          ...withLevel(lookup('Monsterlärd'), 'Gesäll'),
          trait: 'Bestar'
        })
      },
      {
        name: 'automatic-entry-grant',
        base: [],
        added: () => lookup('Mörkt blod')
      },
      {
        name: 'conflict-replacement',
        base: [() => lookup('Korruptionskänslig')],
        added: () => lookup('Dvärg')
      },
      {
        name: 'duplicate-entry',
        base: [() => withLevel(lookup('Akrobatik'), 'Novis')],
        added: () => withLevel(lookup('Akrobatik'), 'Novis')
      },
      {
        name: 'manual-conflict-override',
        base: [() => ({ ...lookup('Korruptionskänslig'), manualRuleOverride: true })],
        added: () => lookup('Dvärg')
      },
      {
        name: 'snapshot-materialization',
        base: [],
        added: snapshotEntry
      },
      {
        name: 'inventory-grant',
        base: [],
        inventory: [{
          id: 'di12',
          name: 'Rep, 10 meter',
          qty: 1,
          gratis: 0,
          kvaliteter: [],
          gratisKval: [],
          removedKval: []
        }],
        added: () => lookup('Välutrustad')
      },
      {
        name: 'money-grant',
        base: [],
        added: () => lookup('Privilegierad')
      }
    ];

    const materializeBase = (scenario) => [neutralEntry(), ...scenario.base.map(factory => factory())]
      .map((entry, index) => ({
        ...entry,
        __uid: `parity-base-${scenario.name}-${index}`,
        __order: index + 1
      }));
    const makeStore = (id, scenario) => ({
      current: id,
      characters: [{ id, name: id }],
      folders: [],
      data: {
        [id]: {
          list: clone(materializeBase(scenario)),
          inventory: clone(scenario.inventory || []),
          custom: [],
          privMoney: money(),
          possessionMoney: money(),
          bonusMoney: money(),
          entryOrderCounter: materializeBase(scenario).length,
          snapshotRules: [],
          revealedArtifacts: []
        }
      }
    });
    const normalizeState = (data) => {
      const clean = (value, key = '') => {
        if (Array.isArray(value)) return value.map(item => clean(item));
        if (!value || typeof value !== 'object') return value;
        const out = {};
        Object.keys(value).sort().forEach(childKey => {
          if ([
            '__uid',
            '__order',
            '__appliedDigest',
            '__dbPinnedDigest',
            'lastCurrentListMutationSummary'
          ].includes(childKey)) return;
          if (childKey === 'sourceKey') return;
          if (key === 'sourceRef' && childKey === 'entryUid') return;
          out[childKey] = clean(value[childKey], childKey);
        });
        return out;
      };
      return clean(data);
    };

    return scenarios.map((scenario) => {
      const fastId = `parity-fast-${scenario.name}`;
      const fullId = `parity-full-${scenario.name}`;
      const fastStore = makeStore(fastId, scenario);
      const fullStore = makeStore(fullId, scenario);

      // Establish the same trusted reconciliation baseline through the public
      // mutation API before comparing the two paths. Fresh/legacy character
      // state intentionally receives one full reconciliation before it may use
      // the single-add fast path.
      const fastBaselineSummary = window.storeHelper.setCurrentList(
        fastStore,
        window.storeHelper.getCurrentList(fastStore)
      );
      const fullBaselineSummary = window.storeHelper.setCurrentList(
        fullStore,
        window.storeHelper.getCurrentList(fullStore)
      );

      const fastNext = window.storeHelper.getCurrentList(fastStore);
      fastNext.push(scenario.added());
      const fastSummary = window.storeHelper.setCurrentList(fastStore, fastNext);

      const fullNext = window.storeHelper.getCurrentList(fullStore);
      // Removing one retained UID makes the delta deliberately ambiguous while
      // preserving the exact logical input. Full metadata reconciliation repairs
      // it from the previous entry signature.
      delete fullNext[0].__uid;
      fullNext.push(scenario.added());
      const fullSummary = window.storeHelper.setCurrentList(fullStore, fullNext);

      return {
        name: scenario.name,
        fastBaselineMode: fastBaselineSummary?.reconciliationMode || '',
        fullBaselineMode: fullBaselineSummary?.reconciliationMode || '',
        fastMode: fastSummary?.reconciliationMode || '',
        fullMode: fullSummary?.reconciliationMode || '',
        fastReason: fastSummary?.reconciliationReason || '',
        fullReason: fullSummary?.reconciliationReason || '',
        fastState: normalizeState(fastStore.data[fastId]),
        fullState: normalizeState(fullStore.data[fullId])
      };
    });
  });

  expect(results.map(result => result.name)).toEqual([
    'plain-add',
    'choice-data',
    'automatic-entry-grant',
    'conflict-replacement',
    'duplicate-entry',
    'manual-conflict-override',
    'snapshot-materialization',
    'inventory-grant',
    'money-grant'
  ]);

  results.forEach(result => {
    expect(result.fastBaselineMode, `${result.name} fast baseline should reconcile fully`).toBe('full');
    expect(result.fullBaselineMode, `${result.name} comparison baseline should reconcile fully`).toBe('full');
    expect(result.fullMode, `${result.name} should force the full path`).toBe('full');
    expect(result.fastState, `${result.name} state parity`).toEqual(result.fullState);
  });

  const modes = Object.fromEntries(results.map(result => [result.name, result.fastMode]));
  expect(modes).toMatchObject({
    'plain-add': 'incremental',
    'choice-data': 'incremental',
    'automatic-entry-grant': 'incremental',
    'duplicate-entry': 'incremental',
    'manual-conflict-override': 'incremental',
    'snapshot-materialization': 'incremental',
    'inventory-grant': 'incremental',
    'money-grant': 'incremental'
  });
});

test('catalog entry replacement invalidates the trusted incremental baseline', async ({ page }) => {
  await seedHostCharacter(page);
  await page.goto('/#/index');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.storeHelper?.setCurrentList)
    && Boolean(window.storeHelper?.syncEntriesWithDb)
  ));

  const result = await page.evaluate(() => {
    const charId = 'reconciliation-db-sync';
    const baseEntry = {
      id: 'reconciliation-db-entry',
      namn: 'Reconciliation DB entry',
      nivå: 'Novis',
      taggar: { typ: ['Förmåga'] },
      __uid: 'reconciliation-db-entry-uid',
      __order: 1
    };
    const localStore = {
      current: charId,
      characters: [{ id: charId, name: 'DB sync' }],
      folders: [],
      data: {
        [charId]: {
          list: [{ ...baseEntry }],
          inventory: [],
          custom: [],
          privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
          possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
          bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
          entryOrderCounter: 1,
          snapshotRules: [],
          revealedArtifacts: []
        }
      }
    };

    const baseline = window.storeHelper.setCurrentList(
      localStore,
      window.storeHelper.getCurrentList(localStore)
    );
    const originalLookup = window.lookupEntry;
    window.lookupEntry = ref => {
      const id = String(ref?.id || '');
      const name = String(ref?.namn || ref?.name || '');
      if (name === 'Villkorad gåva') {
        return {
          id: 'reconciliation-granted-entry',
          namn: 'Villkorad gåva',
          nivå: 'Novis',
          taggar: { typ: ['Förmåga'] }
        };
      }
      if (id === baseEntry.id || name === baseEntry.namn) {
        return {
          ...baseEntry,
          taggar: {
            typ: ['Förmåga'],
            regler: {
              ger: [{
                mal: 'post',
                post: ['Villkorad gåva'],
                nar: { har_namn: ['Reconciliation trigger'] }
              }]
            }
          }
        };
      }
      return originalLookup?.(ref) || null;
    };

    try {
      const syncResult = window.storeHelper.syncEntriesWithDb(localStore, {
        charId,
        mode: 'update'
      });
      const needsReconciliation = window.storeHelper.needsCurrentListReconciliation(localStore, charId);
      const next = window.storeHelper.getCurrentList(localStore);
      next.push({
        id: 'reconciliation-trigger',
        namn: 'Reconciliation trigger',
        nivå: 'Novis',
        taggar: { typ: ['Förmåga'] }
      });
      const summary = window.storeHelper.setCurrentList(localStore, next);
      return {
        baselineMode: baseline?.reconciliationMode || '',
        updated: syncResult?.updated || 0,
        needsReconciliation,
        nextMode: summary?.reconciliationMode || '',
        nextReason: summary?.reconciliationReason || '',
        names: window.storeHelper.getCurrentList(localStore).map(entry => entry?.namn || '')
      };
    } finally {
      window.lookupEntry = originalLookup;
    }
  });

  expect(result.baselineMode).toBe('full');
  expect(result.updated).toBe(1);
  expect(result.needsReconciliation).toBe(true);
  expect(result.nextMode).toBe('full');
  expect(result.nextReason).toBe('reconciliation-version-mismatch');
  expect(result.names).toContain('Villkorad gåva');
});
