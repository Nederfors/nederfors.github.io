import { expect, test } from '@playwright/test';

const CHAR_ID = 'index-inventory-removal-parity';

async function seedStore(page) {
  await page.addInitScript(({ charId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: charId,
      characters: [{ id: charId, name: 'Index removal parity', folderId: 'fd-standard' }],
      folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
      activeFolder: 'ALL',
      compactEntries: true,
      filterUnion: false,
      liveMode: false,
      onlySelected: false
    }));
    localStorage.setItem(`rpall-char-${charId}`, JSON.stringify({
      list: [],
      inventory: [],
      custom: [],
      notes: {},
      artifactEffects: {},
      snapshotRules: [],
      revealedArtifacts: [],
      money: { daler: 20, skilling: 0, 'örtegar': 0 }
    }));
  }, { charId: CHAR_ID });
}

async function waitForApp(page, route, selector) {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready));
  await page.locator(selector).waitFor({ state: 'visible' });
}

async function revealBandage(page) {
  await page.evaluate(() => {
    window.handleIndexSearchTerm?.('Bandage', { scroll: false });
  });
  await page.waitForFunction(() => {
    const card = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
      .find(candidate => candidate.dataset.name === 'Bandage');
    return Boolean(card?.querySelector('button[data-act="del"]'));
  });
  await page.evaluate(() => new Promise(resolve => {
    const root = document.getElementById('lista');
    if (!root) {
      resolve();
      return;
    }
    let timer = 0;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, 150);
    });
    const finish = () => {
      observer.disconnect();
      resolve();
    };
    observer.observe(root, { childList: true, subtree: true });
    timer = window.setTimeout(finish, 150);
  }));
}

async function captureState(page, reason) {
  return page.evaluate(async ({ reason }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason });
    const inventory = JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
    return {
      inventory,
      list: JSON.parse(JSON.stringify(window.storeHelper.getCurrentList(activeStore))),
      revealedArtifacts: JSON.parse(JSON.stringify(
        activeStore.data?.[activeStore.current]?.revealedArtifacts || []
      )),
      artifactEffects: JSON.parse(JSON.stringify(
        window.storeHelper.getArtifactEffects(activeStore)
      )),
      snapshotRules: JSON.parse(JSON.stringify(
        window.storeHelper.getSnapshotRuleRecords(activeStore)
      )),
      derived: JSON.parse(JSON.stringify(
        window.storeHelper.getDerived?.(activeStore) || null
      )),
      money: JSON.parse(JSON.stringify(window.storeHelper.getMoney(activeStore)))
    };
  }, { reason });
}

function inventoryTopology(inventory) {
  return inventory.map(row => ({
    uid: row.__uid || '',
    id: row.id || '',
    name: row.name || '',
    qty: Number(row.qty || 0),
    gratis: Number(row.gratis || 0),
    gratisKval: [...(row.gratisKval || [])],
    removedKval: [...(row.removedKval || [])],
    kvaliteter: [...(row.kvaliteter || [])],
    contains: inventoryTopology(row.contains || [])
  }));
}

function linkedState(state) {
  return {
    list: state.list,
    revealedArtifacts: state.revealedArtifacts,
    artifactEffects: state.artifactEffects,
    snapshotRules: state.snapshotRules,
    derived: state.derived,
    money: state.money
  };
}

async function runRemoval(page, initialInventory, forceSafePath) {
  await waitForApp(page, '/#/index', '#lista');
  await page.evaluate(async ({ initialInventory }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(
      activeStore,
      JSON.parse(JSON.stringify(initialInventory)),
      { bumpDerived: false }
    );
    window.storeHelper.setCurrentList(activeStore, []);
    window.storeHelper.setArtifactEffects(activeStore, {});
    activeStore.data[activeStore.current].snapshotRules = [];
    activeStore.data[activeStore.current].revealedArtifacts = [];
    window.invUtil.renderInventory({
      trigger: 'index-inventory-removal-parity-restore'
    });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'index-removal-restore' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      strict: true
    });
  }, { initialInventory });
  await revealBandage(page);

  await page.evaluate(useSafePath => {
    window.__symbaroumPerfCaptureRemovals = true;
    window.__symbaroumPerfAwaitFlush = true;
    window.__symbaroumPerfForceSafeInventoryMutations = useSafePath;
    window.symbaroumPerf?.clearHistory?.();
    const root = document.getElementById('lista');
    const target = [...root.querySelectorAll('li.entry-card, li.card')]
      .find(card => card.dataset.name === 'Bandage');
    window.__indexRemovalDomProbe = {
      target,
      unaffected: [...root.querySelectorAll('li.entry-card, li.card')]
        .filter(card => card !== target)
        .map(card => ({ id: card.dataset.id || '', name: card.dataset.name || '', card }))
    };
  }, forceSafePath);

  await page.locator('#lista li[data-name="Bandage"] button[data-act="del"]').click();
  await expect.poll(async () => page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return window.storeHelper.getInventory(activeStore)
      .some(row => String(row?.id || '') === 'di1');
  })).toBe(false);
  await page.waitForFunction(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    return Boolean(snapshot?.scenarios?.some(candidate =>
      candidate.name === 'remove-item-from-character' && candidate.status === 'completed'));
  });

  const indexResult = await page.evaluate(async () => {
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'index-removal-run' });
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    const scenario = (snapshot?.scenarios || [])
      .filter(candidate => candidate.name === 'remove-item-from-character'
        && candidate.status === 'completed')
      .at(-1);
    const target = window.__indexRemovalDomProbe.target;
    const actions = [...(target?.querySelectorAll('button[data-act]') || [])]
      .map(button => button.dataset.act);
    return {
      scenario,
      targetPreserved: target?.isConnected === true,
      targetBadge: target?.querySelector('.count-badge')?.textContent || '',
      targetActions: actions,
      unaffectedPreserved: window.__indexRemovalDomProbe.unaffected.every(({ card }) => card.isConnected)
    };
  });
  const state = await captureState(page, 'index-removal-capture');

  await waitForApp(page, '/#/inventory', '#invList');
  const rendered = await page.evaluate(() => ({
    cardUids: [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
      .map(card => card.dataset.uid),
    weight: document.querySelector('#weightOutput')?.textContent || '',
    value: document.querySelector('#moneyDiffOutput')?.textContent || ''
  }));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#invList').waitFor({ state: 'visible' });
  const reloaded = await captureState(page, 'index-removal-reload');
  const renderedReload = await page.evaluate(() => ({
    cardUids: [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
      .map(card => card.dataset.uid),
    weight: document.querySelector('#weightOutput')?.textContent || '',
    value: document.querySelector('#moneyDiffOutput')?.textContent || ''
  }));
  return { indexResult, state, rendered, reloaded, renderedReload };
}

test('real index final-copy removal matches forced-safe state, DOM, persistence, and reload', async ({ page }) => {
  await seedStore(page);
  await waitForApp(page, '/#/index', '#lista');
  const initialInventory = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = window.DB || [];
    const bandage = entries.find(entry => entry.id === 'di1');
    const fillers = entries
      .filter(entry => entry.id !== 'di1'
        && window.isInv?.(entry)
        && !window.storeHelper?.isSearchHiddenEntry?.(entry))
      .slice(0, 249);
    if (!bandage || fillers.length < 249) throw new Error('Missing large stable inventory parity fixtures.');
    const inventory = [
      {
        id: bandage.id,
        name: bandage.namn,
        qty: 1,
        gratis: 0,
        gratisKval: [],
        removedKval: []
      },
      ...fillers.map(entry => ({
        id: entry.id,
        name: entry.namn,
        qty: 1,
        gratis: 0,
        gratisKval: [],
        removedKval: []
      }))
    ];
    window.invUtil.saveInventory(inventory, { bumpDerived: false });
    window.invUtil.renderInventory({
      trigger: 'index-inventory-removal-parity-initial-normalization'
    });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'index-removal-initial' });
    return JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
  });

  const safe = await runRemoval(page, initialInventory, true);
  const optimized = await runRemoval(page, initialInventory, false);

  expect(inventoryTopology(optimized.state.inventory))
    .toEqual(inventoryTopology(safe.state.inventory));
  expect(linkedState(optimized.state)).toEqual(linkedState(safe.state));
  expect(optimized.reloaded).toEqual(safe.reloaded);
  expect(inventoryTopology(optimized.state.inventory))
    .toEqual(inventoryTopology(optimized.reloaded.inventory));
  expect(linkedState(optimized.state)).toEqual(linkedState(optimized.reloaded));
  expect(optimized.rendered).toEqual(safe.rendered);
  expect(optimized.renderedReload).toEqual(safe.renderedReload);
  expect(optimized.rendered).toEqual(optimized.renderedReload);

  expect(optimized.indexResult.targetPreserved).toBe(true);
  expect(optimized.indexResult.unaffectedPreserved).toBe(true);
  expect(optimized.indexResult.targetBadge).toBe('');
  expect(optimized.indexResult.targetActions).toContain('add');
  expect(optimized.indexResult.targetActions).not.toContain('del');
  expect(optimized.indexResult.targetActions).not.toContain('sub');

  const safeProfile = safe.indexResult.scenario?.detail?.profile || {};
  const optimizedProfile = optimized.indexResult.scenario?.detail?.profile || {};
  expect(safeProfile.fallbacks.map(fallback => fallback.reason)).toContain('forced-safe-path');
  expect(optimizedProfile.fallbacks).toEqual([]);
  expect(optimizedProfile.counters).toMatchObject({
    rootBatches: 1,
    storeMutations: 1,
    commonCommits: 1,
    refreshGenerations: 1,
    persistenceSchedules: 1,
    inventoryUidTargetValidations: 1,
    inventoryRemovalProofEvidenceLookups: 1
  });
  expect(optimizedProfile.counters.inventoryRemovalProofScans || 0).toBe(0);
  expect(optimizedProfile.counters.inventoryRemovalProofFallbackScans || 0).toBe(0);
  expect(optimizedProfile.counters.fullInventoryRenders || 0).toBe(0);
  expect(optimizedProfile.counters.inventoryNormalizations || 0).toBe(0);
  expect(optimizedProfile.counters.inventoryScans || 0).toBe(0);
  expect(optimizedProfile.counters.inventoryFlattenCalls || 0).toBe(0);
  expect(optimizedProfile.counters.artifactEffectScans || 0).toBe(0);
  expect(optimizedProfile.counters.derivedRequests || 0).toBe(0);
  expect(optimizedProfile.counters.workerRequests || 0).toBe(0);
});

test('shared index removal planner keeps unsupported identity, topology, rule, linked, and legacy state conservative', async ({ page }) => {
  await seedStore(page);
  await waitForApp(page, '/#/index', '#lista');
  const plans = await page.evaluate(async () => {
    let entry = window.lookupEntry?.({ name: 'Bandage' })
      || (window.DB || []).find(candidate => String(candidate?.id || '') === 'di1');
    entry = await window.catalogLoader?.ensureEntryData?.(entry) || entry;
    const unrelatedEntry = (window.DB || []).find(candidate =>
      candidate?.id !== entry?.id && window.isInv?.(candidate));
    if (!entry || !unrelatedEntry) throw new Error('Missing removal planner fixtures.');
    const makeRow = (uid, overrides = {}) => ({
      id: entry.id,
      name: entry.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      __uid: uid,
      ...overrides
    });
    const summarize = plan => ({
      fastPath: plan.fastPath,
      fallbackReasons: plan.fallbackReasons,
      invalidates: plan.invalidates,
      renderStrategy: plan.renderStrategy,
      aggregateStrategy: plan.aggregateStrategy,
      topologyGuarantee: plan.topologyGuarantee
    });
    const plan = (inventory, row, options = {}) => summarize(window.invUtil.planInventoryMutation({
      kind: 'remove',
      row,
      entry: options.entry || entry,
      inv: inventory,
      parentArr: options.parentArr || inventory,
      surface: 'index',
      requireFinalOwnedCopy: true
    }));

    const stableRow = makeRow('stable-target');
    const unrelated = {
      id: unrelatedEntry.id,
      name: unrelatedEntry.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      __uid: 'stable-unrelated'
    };
    const stableInventory = [stableRow, unrelated];
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, stableInventory, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'index-removal-planner-test' });

    const duplicateUidRow = makeRow('duplicate-uid-target');
    const duplicateUidInventory = [
      duplicateUidRow,
      { ...unrelated, __uid: 'duplicate-uid-target' }
    ];
    const duplicateBaseRow = makeRow('duplicate-base-target');
    const duplicateBaseInventory = [
      duplicateBaseRow,
      makeRow('duplicate-base-copy')
    ];
    const nestedRow = makeRow('nested-target');
    const nestedParent = { ...unrelated, __uid: 'nested-parent', contains: [nestedRow] };
    const nestedInventory = [nestedParent];
    const missingUidRow = makeRow('');
    const snapshotRow = makeRow('snapshot-target', { snapshotSourceKey: 'snapshot-source' });
    const artifactRow = makeRow('artifact-target', { artifactEffect: 'bound-effect' });
    const ruleRow = makeRow('rule-target', { perk: 'rule-source' });
    const containerRow = makeRow('container-target', { contains: [{ ...unrelated, __uid: 'child' }] });
    const customEntry = {
      id: 'custom-unknown',
      namn: 'Custom unknown',
      taggar: { typ: ['Hemmagjort'] }
    };
    const customRow = {
      ...makeRow('custom-target'),
      id: customEntry.id,
      name: customEntry.namn
    };
    window.__symbaroumPerfForceSafeInventoryMutations = true;
    const forcedSafe = plan(stableInventory, stableRow);
    window.__symbaroumPerfForceSafeInventoryMutations = false;

    return {
      stable: plan(stableInventory, stableRow),
      duplicateUid: plan(duplicateUidInventory, duplicateUidRow),
      duplicateBase: plan(duplicateBaseInventory, duplicateBaseRow),
      nested: plan(nestedInventory, nestedRow, { parentArr: nestedParent.contains }),
      missingUid: plan([missingUidRow], missingUidRow),
      snapshot: plan([snapshotRow], snapshotRow),
      artifact: plan([artifactRow], artifactRow),
      rule: plan([ruleRow], ruleRow),
      container: plan([containerRow], containerRow),
      custom: plan([customRow], customRow, { entry: customEntry }),
      forcedSafe
    };
  });

  expect(plans.stable.fallbackReasons).toEqual([]);
  expect(plans.stable).toMatchObject({
    fastPath: true,
    renderStrategy: 'targeted-none',
    aggregateStrategy: 'delta',
    topologyGuarantee: 'known-top-level-row-removal'
  });
  expect(plans.stable.invalidates).toContain('inventory.structure');
  expect(plans.duplicateUid.fallbackReasons).toContain('duplicate-row-uid');
  expect(plans.duplicateBase.fallbackReasons).toContain('duplicate-base-identity');
  expect(plans.nested.fallbackReasons).toContain('nested-inventory-path');
  expect(plans.missingUid.fallbackReasons).toContain('missing-row-uid');
  expect(plans.snapshot.fallbackReasons).toContain('snapshot-sync');
  expect(plans.artifact.fallbackReasons).toContain('artifact-list-sync');
  expect(plans.rule.fallbackReasons).toContain('rule-reconciliation-required');
  expect(plans.container.fallbackReasons).toContain('container-topology');
  expect(plans.custom.fastPath).toBe(false);
  expect(plans.forcedSafe.fallbackReasons).toContain('forced-safe-path');
});

test('stale removal evidence and failed postconditions stay conservative', async ({ page }) => {
  await seedStore(page);
  await waitForApp(page, '/#/index', '#lista');
  const result = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    let entry = window.lookupEntry?.({ name: 'Bandage' })
      || (window.DB || []).find(candidate => String(candidate?.id || '') === 'di1');
    entry = await window.catalogLoader?.ensureEntryData?.(entry) || entry;
    const fillerEntry = (window.DB || []).find(candidate => (
      candidate?.id !== entry?.id && window.isInv?.(candidate)
    ));
    const makeInventory = suffix => [{
      id: entry.id,
      name: entry.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      __uid: `proof-target-${suffix}`
    }, {
      id: fillerEntry.id,
      name: fillerEntry.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      __uid: `proof-filler-${suffix}`
    }];
    const planRemoval = inventory => window.invUtil.planInventoryMutation({
      kind: 'remove',
      row: inventory[0],
      entry,
      inv: inventory,
      parentArr: inventory,
      surface: 'index',
      requireFinalOwnedCopy: true
    });

    const staleInventory = makeInventory('stale');
    window.storeHelper.setInventory(activeStore, staleInventory, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'stale-removal-proof-setup' });
    const stalePlan = planRemoval(staleInventory);
    window.storeHelper.setInventory(activeStore, [...staleInventory], { bumpDerived: false });
    const staleCommit = window.invUtil.commitInventoryMutation(stalePlan);

    const postconditionInventory = makeInventory('postcondition');
    window.storeHelper.setInventory(activeStore, postconditionInventory, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'postcondition-removal-proof-setup' });
    const postconditionPlan = planRemoval(postconditionInventory);
    let fallbackReason = '';
    const postconditionCommit = window.invUtil.commitInventoryMutation(postconditionPlan, {
      reconcileDom: () => {
        postconditionInventory[0] = { ...postconditionInventory[0] };
        return { ok: true, reason: '' };
      },
      onDomFallback: reason => { fallbackReason = reason; }
    });
    return {
      stale: {
        committed: staleCommit.committed,
        reasons: staleCommit.plan.fallbackReasons,
        targetStillPresent: staleInventory.includes(staleInventory[0])
      },
      postcondition: {
        committed: postconditionCommit.committed,
        targeted: postconditionCommit.targeted,
        reasons: postconditionCommit.fallbackReasons,
        fallbackReason,
        targetStillPresent: postconditionInventory.some(row => row.id === entry.id)
      }
    };
  });

  expect(result.stale).toMatchObject({
    committed: false,
    targetStillPresent: true
  });
  expect(result.stale.reasons).toContain('removal-plan-stale');
  expect(result.postcondition).toEqual({
    committed: true,
    targeted: false,
    reasons: ['inventory-topology-postcondition-failed'],
    fallbackReason: 'inventory-topology-postcondition-failed',
    targetStillPresent: false
  });
});
