import { expect, test } from '@playwright/test';

const CHAR_ID = 'inventory-topology-parity-char';

async function seedStore(page) {
  await page.addInitScript(({ charId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: charId,
      characters: [{ id: charId, name: 'Topology Parity', folderId: 'fd-standard' }],
      folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
      activeFolder: 'ALL',
      compactEntries: true,
      filterUnion: false,
      liveMode: false
    }));
    localStorage.setItem(`rpall-char-${charId}`, JSON.stringify({
      list: [],
      inventory: [],
      custom: [],
      notes: {},
      artifactEffects: {},
      money: { daler: 10, skilling: 0, 'örtegar': 0 }
    }));
  }, { charId: CHAR_ID });
}

async function prepareTopologyFixture(page, direction) {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(window.invUtil?.planInventoryTopologyMutation)
  ));
  await page.locator('#invList').waitFor({ state: 'visible' });
  return page.evaluate(async ({ direction }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const vehicles = entries
      .filter(entry => window.isInv?.(entry) && (entry?.taggar?.typ || []).includes('Färdmedel'))
      .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
    const items = entries
      .filter(entry => {
        const types = entry?.taggar?.typ || [];
        return window.isInv?.(entry)
          && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type));
      })
      .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
    let picked = null;
    for (const vehicleEntry of vehicles) {
      for (const itemEntry of items) {
        const itemRow = {
          id: itemEntry.id,
          name: itemEntry.namn,
          __uid: 'topology-item',
          qty: 1,
          gratis: 0,
          gratisKval: [],
          removedKval: []
        };
        const vehicleRow = {
          id: vehicleEntry.id,
          name: vehicleEntry.namn,
          __uid: 'topology-vehicle',
          qty: 1,
          gratis: 0,
          gratisKval: [],
          removedKval: [],
          contains: direction === 'unload' ? [itemRow] : []
        };
        const inventory = direction === 'unload' ? [vehicleRow] : [vehicleRow, itemRow];
        const plan = window.invUtil.planInventoryTopologyMutation(inventory, {
          direction,
          sourcePath: direction === 'unload' ? [0, 0] : [1],
          vehiclePath: [0],
          moveQty: 1,
          operationCount: 1,
          list: [],
          activeFilters: false,
          forceSafePath: false,
          aggregateSnapshotAvailable: true
        });
        if (plan.fastPath) {
          picked = { vehicleEntry, itemEntry };
          break;
        }
      }
      if (picked) break;
    }
    if (!picked) throw new Error('Missing safe vehicle topology signature.');

    const itemRow = {
      id: picked.itemEntry.id,
      name: picked.itemEntry.namn,
      __uid: 'topology-item',
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    };
    const vehicleRow = {
      id: picked.vehicleEntry.id,
      name: picked.vehicleEntry.namn,
      __uid: 'topology-vehicle',
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      contains: direction === 'unload' ? [itemRow] : []
    };
    const fillers = entries
      .filter(entry => entry.id !== picked.itemEntry.id && entry.id !== picked.vehicleEntry.id
        && window.isInv?.(entry)
        && !(entry?.taggar?.typ || []).some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type)))
      .slice(0, 28)
      .map((entry, index) => ({
        id: entry.id,
        name: entry.namn,
        __uid: `topology-filler-${index}`,
        qty: 1,
        gratis: 0,
        gratisKval: [],
        removedKval: []
      }));
    const inventory = direction === 'unload'
      ? [vehicleRow, ...fillers]
      : [vehicleRow, itemRow, ...fillers];
    window.storeHelper.setInventory(activeStore, inventory, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'topology-parity-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'topology-parity-setup' });
    const persisted = window.storeHelper.getInventory(activeStore);
    const sourcePath = direction === 'unload' ? [0, 0] : [1];
    const before = JSON.stringify(persisted);
    const plan = window.invUtil.planInventoryTopologyMutation(persisted, {
      direction,
      sourcePath,
      vehiclePath: [0],
      moveQty: 1,
      operationCount: 1,
      list: window.storeHelper.getCurrentList(activeStore),
      activeFilters: false,
      forceSafePath: false,
      aggregateSnapshotAvailable: true
    });
    const after = JSON.stringify(persisted);
    return {
      direction,
      vehicleUid: vehicleRow.__uid,
      vehicleId: picked.vehicleEntry.id,
      vehicleName: picked.vehicleEntry.namn,
      itemUid: itemRow.__uid,
      itemId: picked.itemEntry.id,
      itemName: picked.itemEntry.namn,
      initial: JSON.parse(before),
      plan: {
        fastPath: plan.fastPath,
        fallbackReasons: plan.fallbackReasons,
        renderStrategy: plan.renderStrategy,
        sourcePath: plan.source.path,
        destinationPath: plan.destination.path,
        invalidates: plan.invalidates,
        treeUnchanged: before === after
      }
    };
  }, { direction });
}

async function runVehicleControl(page, target, forceSafePath) {
  await page.evaluate(({ forceSafePath }) => {
    window.__symbaroumPerfForceSafeInventoryMutations = forceSafePath;
  }, { forceSafePath });
  const vehicleCard = page.locator(`#invList li.entry-card[data-uid="${target.vehicleUid}"]`).first();
  const action = target.direction === 'load' ? 'vehicleLoad' : 'vehicleUnload';
  const button = vehicleCard.locator(`button[data-act="${action}"]`);
  if (!await button.isVisible()) await vehicleCard.locator('.card-title').click();
  await button.click();
  const listSelector = target.direction === 'load' ? '#vehicleItemList' : '#vehicleRemoveItemList';
  const applySelector = target.direction === 'load' ? '#vehicleApply' : '#vehicleRemoveApply';
  await page.locator(`shared-toolbar ${listSelector} .price-item`)
    .filter({ hasText: target.itemName })
    .first()
    .click();
  await page.evaluate(({ target, forceSafePath }) => {
    const perf = window.symbaroumPerf;
    perf?.clearHistory?.();
    const scenarioId = perf?.startScenario?.(`topology-parity-${target.direction}`, {
      scope: 'inventory',
      pathMode: forceSafePath ? 'safe' : 'optimized'
    });
    perf?.setFlowContext?.('inventory-mutation', scenarioId);
    window.__topologyParityProbe = {
      scenarioId,
      sourceCard: document.querySelector(`#invList li.entry-card[data-uid="${window.CSS.escape(target.itemUid)}"]`),
      vehicleCard: document.querySelector(`#invList li.entry-card[data-uid="${window.CSS.escape(target.vehicleUid)}"]`)
    };
  }, { target, forceSafePath });
  await page.locator(`shared-toolbar ${applySelector}`).click();
  await page.waitForFunction(({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const inventory = window.storeHelper.getInventory(activeStore);
    const vehicle = inventory.find(row => String(row?.id || '') === String(target.vehicleId));
    const inside = (vehicle?.contains || []).some(row => String(row?.id || '') === String(target.itemId));
    return target.direction === 'load' ? inside : !inside;
  }, { target });
}

async function captureTopologyState(page, target, reason) {
  return page.evaluate(async ({ target, reason }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason });
    await window.symbaroumPerf?.afterNextPaint?.(2);
    const deepActiveElement = () => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active;
    };
    const elementKey = element => {
      if (!(element instanceof window.Element)) return '';
      return [element.tagName.toLowerCase(), element.id ? `#${element.id}` : '']
        .filter(Boolean).join('');
    };
    const normalizeInventory = rows => (Array.isArray(rows) ? rows : []).map(row => {
      const { contains, ...rest } = row;
      return {
        ...rest,
        artifactEffect: row.artifactEffect || '',
        kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
        gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
        removedKval: Array.isArray(row.removedKval) ? row.removedKval : [],
        ...(Array.isArray(contains) && contains.length
          ? { contains: normalizeInventory(contains) }
          : {})
      };
    });
    const inventory = normalizeInventory(JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))));
    const cards = [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
      .map(card => {
        const parentCard = card.parentElement?.closest('li.entry-card[data-uid]');
        const category = card.closest('.cat-group')?.querySelector(':scope > details')?.dataset.cat || '';
        return {
          uid: card.dataset.uid,
          parentUid: parentCard?.dataset.uid || 'root',
          category,
          title: card.querySelector('.entry-title-main')?.textContent || '',
          weight: card.querySelector('.weight-badge')?.textContent || '',
          capacity: card.querySelector('.capacity-badge')?.textContent || '',
          remaining: card.querySelector('.remaining-badge')?.textContent || '',
          compact: card.classList.contains('compact')
        };
      })
      .sort((left, right) => left.uid.localeCompare(right.uid));
    const categories = [...document.querySelectorAll('#invList .cat-group > details[data-cat]')]
      .map(details => ({
        category: details.dataset.cat,
        open: details.open,
        rows: [...details.querySelector('ul[data-cat]')?.children || []]
          .map(card => card.dataset.uid || '')
          .filter(Boolean)
      }));
    const probe = window.__topologyParityProbe;
    const sourceCard = document.querySelector(`#invList li.entry-card[data-uid="${window.CSS.escape(target.itemUid)}"]`);
    const vehicleCard = document.querySelector(`#invList li.entry-card[data-uid="${window.CSS.escape(target.vehicleUid)}"]`);
    const perf = window.symbaroumPerf;
    perf?.clearFlowContext?.('inventory-mutation', probe?.scenarioId);
    const scenario = perf?.endScenario?.(probe?.scenarioId);
    return {
      core: {
        inventory,
        money: window.storeHelper.getMoney(activeStore),
        artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
        derived: window.storeHelper.getDerived?.(activeStore) || null,
        cards,
        categories,
        visibleCardCount: document.querySelectorAll('#invList li.entry-card[data-uid]').length,
        totalWeight: document.querySelector('#weightOutput')?.textContent || '',
        maxCapacity: document.querySelector('#strengthOutput')?.textContent || '',
        focus: elementKey(deepActiveElement()),
        scroll: { x: window.scrollX, y: window.scrollY }
      },
      sourceCardPreserved: sourceCard === probe?.sourceCard,
      vehicleCardPreserved: vehicleCard === probe?.vehicleCard,
      sourceCardCount: document.querySelectorAll(`#invList li.entry-card[data-uid="${window.CSS.escape(target.itemUid)}"]`).length,
      counters: scenario?.detail?.profile?.counters || {},
      fallbacks: scenario?.detail?.profile?.fallbacks || [],
      consistency: (scenario?.detail?.profile?.checkpoints || [])
        .find(checkpoint => checkpoint.name === 'all-views-consistent')?.detail || null
    };
  }, { target, reason });
}

async function closeVehiclePopup(page, direction) {
  const cancel = direction === 'load' ? '#vehicleCancel' : '#vehicleRemoveCancel';
  const button = page.locator(`shared-toolbar ${cancel}`);
  if (await button.isVisible()) await button.click();
}

async function restoreInitialState(page, target) {
  await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, JSON.parse(JSON.stringify(target.initial)), { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'topology-parity-restore' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'topology-parity-restore' });
    window.__symbaroumPerfForceSafeInventoryMutations = false;
  }, { target });
}

for (const direction of ['load', 'unload']) {
  test(`vehicle ${direction} pure plan and targeted reconciliation match the safe path and reload`, async ({ page }) => {
    const target = await prepareTopologyFixture(page, direction);
    expect(target.plan).toMatchObject({
      fastPath: true,
      fallbackReasons: [],
      renderStrategy: 'targeted-move',
      treeUnchanged: true
    });
    expect(target.plan.invalidates).toEqual(expect.arrayContaining([
      'inventory.structure',
      'inventory.totals',
      'capacity',
      'summary.economy',
      'persistence'
    ]));

    await runVehicleControl(page, target, true);
    const safe = await captureTopologyState(page, target, `topology-${direction}-safe`);
    expect(safe.fallbacks.map(fallback => fallback.reason)).toContain('forced-safe-path');
    await closeVehiclePopup(page, direction);

    await restoreInitialState(page, target);
    await runVehicleControl(page, target, false);
    const optimized = await captureTopologyState(page, target, `topology-${direction}-optimized`);
    expect(optimized.core).toEqual(safe.core);
    expect(optimized.sourceCardPreserved).toBe(true);
    expect(optimized.vehicleCardPreserved).toBe(true);
    expect(optimized.sourceCardCount).toBe(1);
    expect(optimized.counters.fullInventoryRenders || 0).toBe(0);
    expect(optimized.counters.inventoryUidFullNormalizations || 0).toBe(0);
    expect(optimized.counters.inventoryUidTargetValidations).toBe(1);
    expect(optimized.counters.workerRequests || 0).toBe(0);
    expect(optimized.counters.derivedVersions || 0).toBe(0);
    expect(optimized.counters.refreshGenerations).toBe(1);
    expect(optimized.counters.persistenceSchedules).toBe(1);
    expect(optimized.fallbacks).toEqual([]);
    expect(optimized.consistency).toMatchObject({ renderStrategy: 'targeted-move' });
    expect(optimized.consistency.invalidates).toEqual(expect.arrayContaining(target.plan.invalidates));

    await closeVehiclePopup(page, direction);
    await page.reload();
    await page.waitForFunction(() => (
      Boolean(window.__symbaroumBootCompleted)
      && Boolean(window.symbaroumPersistence?.ready)
    ));
    const reloadCore = await page.evaluate(async () => {
      const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
      await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
      const normalizeInventory = rows => (Array.isArray(rows) ? rows : []).map(row => {
        const { contains, ...rest } = row;
        return {
          ...rest,
          artifactEffect: row.artifactEffect || '',
          kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
          gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
          removedKval: Array.isArray(row.removedKval) ? row.removedKval : [],
          ...(Array.isArray(contains) && contains.length
            ? { contains: normalizeInventory(contains) }
            : {})
        };
      });
      const inventory = normalizeInventory(JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))));
      const cards = [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
        .map(card => ({
          uid: card.dataset.uid,
          parentUid: card.parentElement?.closest('li.entry-card[data-uid]')?.dataset.uid || 'root',
          category: card.closest('.cat-group')?.querySelector(':scope > details')?.dataset.cat || '',
          title: card.querySelector('.entry-title-main')?.textContent || '',
          weight: card.querySelector('.weight-badge')?.textContent || '',
          capacity: card.querySelector('.capacity-badge')?.textContent || '',
          remaining: card.querySelector('.remaining-badge')?.textContent || '',
          compact: card.classList.contains('compact')
        }))
        .sort((left, right) => left.uid.localeCompare(right.uid));
      return { inventory, cards };
    });
    expect(reloadCore.inventory).toEqual(optimized.core.inventory);
    expect(reloadCore.cards).toEqual(optimized.core.cards);
  });
}

test('unsupported container, deep nesting, unwrap, and bundle plans remain pure full fallbacks', async ({ page }) => {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.invUtil?.planInventoryTopologyMutation)
  ));
  const plans = await page.evaluate(() => {
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const vehicle = entries.find(entry => window.isInv?.(entry)
      && (entry?.taggar?.typ || []).includes('Färdmedel'));
    const container = entries.find(entry => window.isInv?.(entry)
      && (entry?.taggar?.typ || []).includes('Förvaring'));
    const bundle = entries.find(entry => window.isInv?.(entry)
      && window.invUtil.isInventoryBundleEntry(entry));
    const item = entries.find(entry => {
      const types = entry?.taggar?.typ || [];
      return window.isInv?.(entry)
        && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type))
        && !window.invUtil.isInventoryBundleEntry(entry);
    });
    if (!vehicle || !container || !bundle || !item) {
      throw new Error('Missing conservative topology representatives.');
    }
    const row = (entry, uid, contains) => ({
      id: entry.id,
      name: entry.namn,
      __uid: uid,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      ...(contains ? { contains } : {})
    });
    const options = {
      moveQty: 1,
      operationCount: 1,
      list: [],
      activeFilters: false,
      forceSafePath: false,
      aggregateSnapshotAvailable: true
    };
    const capture = (inventory, mutation) => {
      const before = JSON.stringify(inventory);
      const plan = window.invUtil.planInventoryTopologyMutation(inventory, { ...options, ...mutation });
      return {
        fastPath: plan.fastPath,
        renderStrategy: plan.renderStrategy,
        fallbackReasons: plan.fallbackReasons,
        treeUnchanged: before === JSON.stringify(inventory)
      };
    };
    const vehicleRow = row(vehicle, 'conservative-vehicle', []);
    const nestedItem = row(item, 'conservative-item');
    const containerRow = row(container, 'conservative-container', [nestedItem]);
    const deepItem = row(item, 'deep-item');
    const inner = row(container, 'deep-inner', [deepItem]);
    const middle = row(container, 'deep-middle', [inner]);
    const outer = row(container, 'deep-outer', [middle]);
    return {
      simpleContainerMove: capture([containerRow, vehicleRow], {
        direction: 'load', sourcePath: [0, 0], vehiclePath: [1]
      }),
      depthThreeMove: capture([outer, vehicleRow], {
        direction: 'load', sourcePath: [0, 0, 0, 0], vehiclePath: [1]
      }),
      containerUnwrap: capture([containerRow, vehicleRow], {
        direction: 'unwrap', sourcePath: [0], vehiclePath: [1]
      }),
      bundleRemoval: capture([row(bundle, 'conservative-bundle'), vehicleRow], {
        direction: 'remove-bundle', sourcePath: [0], vehiclePath: [1]
      })
    };
  });

  Object.values(plans).forEach(plan => {
    expect(plan.fastPath).toBe(false);
    expect(plan.renderStrategy).toBe('full-fallback');
    expect(plan.treeUnchanged).toBe(true);
  });
  expect(plans.simpleContainerMove.fallbackReasons).toContain('nested-inventory-path');
  expect(plans.depthThreeMove.fallbackReasons).toContain('nested-inventory-path');
  expect(plans.containerUnwrap.fallbackReasons).toEqual(expect.arrayContaining([
    'unsupported-topology-path',
    'container-topology'
  ]));
  expect(plans.bundleRemoval.fallbackReasons).toEqual(expect.arrayContaining([
    'unsupported-topology-path',
    'bundle-expansion'
  ]));
});
