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

async function prepareContainerFixture(page) {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(window.invUtil?.planInventoryTopologyMutation)
  ));
  await page.locator('#invList').waitFor({ state: 'visible' });
  return page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const vehicle = entries.find(entry => (
      window.isInv?.(entry)
      && window.inventoryCapabilities?.resolve?.(entry)?.topology === 'vehicle'
    ));
    const leaves = entries.filter(entry => {
      const capabilities = window.inventoryCapabilities?.resolve?.(entry);
      const types = entry?.taggar?.typ || [];
      return window.isInv?.(entry)
        && capabilities?.topology === 'leaf'
        && !capabilities.stateLinks.length
        && !capabilities.derivedDomains.length
        && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type))
        && !window.invUtil.isInventoryBundleEntry(entry);
    });
    if (!vehicle || leaves.length < 24) throw new Error('Missing container topology fixture entries.');
    const row = (entry, uid) => ({
      id: entry.id,
      name: entry.namn,
      __uid: uid,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    });
    const children = [
      row(leaves[0], 'container-child-a'),
      row(leaves[1], 'container-child-b')
    ];
    const vehicleRow = {
      ...row(vehicle, 'container-parent'),
      contains: children
    };
    const fillers = leaves.slice(2, 24)
      .map((entry, index) => row(entry, `container-filler-${index}`));
    const inventory = [...fillers, vehicleRow];
    window.storeHelper.setInventory(activeStore, inventory, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'container-topology-parity-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({
      reason: 'container-topology-parity-setup'
    });
    return {
      vehicleUid: vehicleRow.__uid,
      vehicleId: vehicle.id,
      childUids: children.map(child => child.__uid),
      childIds: children.map(child => child.id),
      fillerUids: fillers.map(filler => filler.__uid),
      initial: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)))
    };
  });
}

async function runContainerControl(page, target, mode, forceSafePath) {
  await page.evaluate(({ forceSafePath }) => {
    window.__symbaroumPerfForceSafeInventoryMutations = forceSafePath;
  }, { forceSafePath });
  const vehicleCard = page.locator(`#invList li.entry-card[data-uid="${target.vehicleUid}"]`).first();
  const deleteButton = vehicleCard.locator('button[data-act="del"]').first();
  if (!await deleteButton.isVisible()) await vehicleCard.locator('.card-title').click();
  await deleteButton.click();
  const confirmSelector = mode === 'unwrap' ? '#deleteContainerOnly' : '#deleteContainerAll';
  const confirm = page.locator(`shared-toolbar ${confirmSelector}`);
  await confirm.waitFor({ state: 'visible' });
  await page.evaluate(({ target, mode, forceSafePath }) => {
    const perf = window.symbaroumPerf;
    perf?.clearHistory?.();
    const scenarioId = perf?.startScenario?.(`container-${mode}-${forceSafePath ? 'safe' : 'optimized'}`, {
      scope: 'inventory',
      pathMode: forceSafePath ? 'safe' : 'optimized'
    });
    perf?.setFlowContext?.('inventory-mutation', scenarioId);
    const cardFor = uid => document.querySelector(
      `#invList li.entry-card[data-uid="${window.CSS.escape(uid)}"]`
    );
    window.__containerParityProbe = {
      scenarioId,
      scroll: { x: window.scrollX, y: window.scrollY },
      activeTag: document.activeElement?.tagName?.toLowerCase() || '',
      fillers: Object.fromEntries(target.fillerUids.map(uid => [uid, cardFor(uid)])),
      children: Object.fromEntries(target.childUids.map(uid => [uid, cardFor(uid)])),
      expansion: Object.fromEntries(
        [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
          .map(card => [card.dataset.uid, card.classList.contains('compact')])
      )
    };
  }, { target, mode, forceSafePath });
  await confirm.click();
  await page.waitForFunction(({ target, mode }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const inventory = window.storeHelper.getInventory(activeStore);
    const parentGone = !inventory.some(row => String(row?.id || '') === String(target.vehicleId));
    const childIds = new Set(inventory.map(row => String(row?.id || '')));
    const childrenPresent = target.childIds.every(id => childIds.has(String(id)));
    return parentGone && (mode === 'unwrap' ? childrenPresent : !childrenPresent);
  }, { target, mode });
}

async function captureContainerState(page, target, mode, reason) {
  return page.evaluate(async ({ target, mode, reason }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason });
    await window.symbaroumPerf?.afterNextPaint?.(2);
    const normalizeInventory = rows => (Array.isArray(rows) ? rows : []).map(row => ({
      ...row,
      artifactEffect: row.artifactEffect || '',
      kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
      gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
      removedKval: Array.isArray(row.removedKval) ? row.removedKval : [],
      ...(Array.isArray(row.contains) && row.contains.length
        ? { contains: normalizeInventory(row.contains) }
        : { contains: undefined })
    }));
    const cards = [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
      .map(card => ({
        uid: card.dataset.uid,
        parentUid: card.parentElement?.closest('li.entry-card[data-uid]')?.dataset.uid || 'root',
        category: card.closest('.cat-group')?.querySelector(':scope > details')?.dataset.cat || '',
        title: card.querySelector('.entry-title-main')?.textContent || '',
        compact: card.classList.contains('compact')
      }))
      .sort((left, right) => left.uid.localeCompare(right.uid));
    const categories = [...document.querySelectorAll('#invList .cat-group > details[data-cat]')]
      .map(details => ({
        category: details.dataset.cat,
        open: details.open,
        rows: [...details.querySelector('ul[data-cat]')?.children || []]
          .map(card => card.dataset.uid || '')
          .filter(Boolean)
      }));
    const probe = window.__containerParityProbe;
    const cardFor = uid => document.querySelector(
      `#invList li.entry-card[data-uid="${window.CSS.escape(uid)}"]`
    );
    const perf = window.symbaroumPerf;
    perf?.clearFlowContext?.('inventory-mutation', probe?.scenarioId);
    const scenario = perf?.endScenario?.(probe?.scenarioId);
    const rawInventory = JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
    return {
      core: {
        inventory: normalizeInventory(rawInventory),
        cards,
        categories,
        totalWeight: document.querySelector('#weightOutput')?.textContent || '',
        maxCapacity: document.querySelector('#strengthOutput')?.textContent || ''
      },
      ui: {
        scroll: { x: window.scrollX, y: window.scrollY },
        activeTag: document.activeElement?.tagName?.toLowerCase() || '',
        expansion: Object.fromEntries(cards.map(card => [card.uid, card.compact]))
      },
      fillerCardsPreserved: target.fillerUids.every(uid => cardFor(uid) === probe?.fillers?.[uid]),
      childCardsPreserved: mode === 'unwrap'
        ? target.childUids.every(uid => cardFor(uid) === probe?.children?.[uid])
        : target.childUids.every(uid => !cardFor(uid)),
      counters: scenario?.detail?.profile?.counters || {},
      fallbacks: scenario?.detail?.profile?.fallbacks || [],
      consistency: (scenario?.detail?.profile?.checkpoints || [])
        .find(checkpoint => checkpoint.name === 'all-views-consistent')?.detail || null
    };
  }, { target, mode, reason });
}

async function revealBundleCard(page, target, mode) {
  await page.evaluate(({ name }) => {
    window.handleIndexSearchTerm?.(name, { scroll: false });
  }, target);
  const acts = mode === 'insert' ? ['add'] : ['sub', 'del', 'rem'];
  await page.waitForFunction(({ name, acts }) => {
    const cards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
    return cards.some(card => (
      String(card?.dataset?.name || '').trim() === name
      && acts.some(act => Boolean(card.querySelector(`button[data-act="${act}"]`)))
    ));
  }, { name: target.name, acts }, { timeout: 120_000 });
}

async function prepareBundleFixture(page, mode) {
  await seedStore(page);
  await page.goto('/#/index');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(window.invUtil?.planInventoryTopologyMutation)
  ));
  await page.locator('#lista').waitFor({ state: 'visible' });
  const target = await page.evaluate(async ({ mode }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const bundleSummary = entries.find(entry => String(entry?.id || '') === 'di79');
    const bundle = await window.catalogLoader?.ensureEntryData?.(bundleSummary);
    if (!bundle) throw new Error('Missing bundle production-control representative.');
    const bundleIds = new Set(
      window.invUtil.getInventoryBundleItems(bundle)
        .map(item => String(item?.id || '').trim())
        .filter(Boolean)
    );
    const fillers = entries
      .filter(entry => {
        const capabilities = window.inventoryCapabilities?.resolve?.(entry);
        return window.isInv?.(entry)
          && capabilities?.topology === 'leaf'
          && !capabilities.stateLinks.length
          && !capabilities.derivedDomains.length
          && !bundleIds.has(String(entry?.id || '').trim())
          && !(window.invUtil.getInventoryBundleItems(entry)?.length || 0);
      })
      .slice(0, 18)
      .map((entry, index) => ({
        id: entry.id,
        name: entry.namn,
        __uid: `bundle-filler-${index}`,
        qty: 1,
        gratis: 0,
        gratisKval: [],
        removedKval: []
      }));
    const inventory = JSON.parse(JSON.stringify(fillers));
    if (mode === 'remove') {
      const refs = window.invUtil.addInventoryBundle(inventory, bundle);
      if (!refs.length) throw new Error('Unable to seed the bundle removal fixture.');
    }
    window.storeHelper.setInventory(activeStore, inventory, { bumpDerived: false });
    await window.symbaroumPersistence?.flushPendingWrites?.({
      reason: `bundle-${mode}-topology-parity-setup`
    });
    return {
      id: bundle.id,
      name: bundle.namn,
      initial: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))),
      initialCount: window.invUtil.getInventoryBundleCount(
        window.storeHelper.getInventory(activeStore),
        bundle
      )
    };
  }, { mode });
  await page.reload();
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
  ));
  await revealBundleCard(page, target, mode);
  return target;
}

async function restoreBundleFixture(page, target, mode) {
  await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(
      activeStore,
      JSON.parse(JSON.stringify(target.initial)),
      { bumpDerived: false }
    );
    await window.symbaroumPersistence?.flushPendingWrites?.({
      reason: 'bundle-topology-parity-restore'
    });
    window.__symbaroumPerfForceSafeInventoryMutations = false;
  }, { target });
  await page.reload();
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
  ));
  await revealBundleCard(page, target, mode);
}

async function runBundleControl(page, target, mode, forceSafePath) {
  await page.evaluate(({ target, mode, forceSafePath }) => {
    window.__symbaroumPerfAwaitFlush = true;
    window.__symbaroumPerfCaptureRemovals = true;
    window.__symbaroumPerfForceSafeInventoryMutations = forceSafePath;
    window.symbaroumPerf?.clearHistory?.();
    const cards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
    const card = cards.find(candidate => (
      String(candidate?.dataset?.name || '').trim() === target.name
    ));
    window.__bundleParityProbe = {
      card,
      scroll: { x: window.scrollX, y: window.scrollY },
      activeTag: document.activeElement?.tagName?.toLowerCase() || '',
      categoryOpen: card?.closest('.cat-group')?.querySelector(':scope > details')?.open ?? null
    };
    const acts = mode === 'insert' ? ['add'] : ['sub', 'del', 'rem'];
    const button = acts
      .map(act => card?.querySelector(`button[data-act="${act}"]`))
      .find(Boolean);
    if (!button) throw new Error(`Missing bundle ${mode} production control.`);
    button.click();
  }, { target, mode, forceSafePath });

  const scenarioName = mode === 'insert'
    ? 'add-item-to-character'
    : 'remove-item-from-character';
  await page.waitForFunction(({ scenarioName }) => (
    window.symbaroumPerf?.getSnapshot?.().scenarios?.some(
      scenario => scenario.name === scenarioName && scenario.status === 'completed'
    )
  ), { scenarioName }, { timeout: 120_000 });
  await page.waitForFunction(({ target, mode }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = window.lookupEntry?.({ id: target.id, name: target.name });
    const count = window.invUtil.getInventoryBundleCount(
      window.storeHelper.getInventory(activeStore),
      entry
    );
    return mode === 'insert' ? count === target.initialCount + 1 : count === 0;
  }, { target, mode });
}

async function captureBundleState(page, target, mode, reason) {
  return page.evaluate(async ({ target, mode, reason }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason });
    await window.symbaroumPerf?.afterNextPaint?.(2);
    const canonicalize = value => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (!value || typeof value !== 'object') return value;
      return Object.keys(value).sort().reduce((output, key) => {
        output[key] = canonicalize(value[key]);
        return output;
      }, {});
    };
    const normalizeInventory = rows => (Array.isArray(rows) ? rows : []).map(row => {
      const rest = { ...(row || {}) };
      const contains = rest.contains;
      delete rest.contains;
      delete rest.posQualCnt;
      delete rest.__uid;
      return {
        ...rest,
        artifactEffect: row?.artifactEffect || '',
        kvaliteter: Array.isArray(row?.kvaliteter) ? row.kvaliteter : [],
        gratisKval: Array.isArray(row?.gratisKval) ? row.gratisKval : [],
        removedKval: Array.isArray(row?.removedKval) ? row.removedKval : [],
        ...(Array.isArray(contains) && contains.length
          ? { contains: normalizeInventory(contains) }
          : {})
      };
    });
    const cards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
    const card = cards.find(candidate => (
      String(candidate?.dataset?.name || '').trim() === target.name
    ));
    const scenarios = window.symbaroumPerf?.getSnapshot?.().scenarios || [];
    const scenarioName = mode === 'insert'
      ? 'add-item-to-character'
      : 'remove-item-from-character';
    const scenario = [...scenarios].reverse().find(candidate => (
      candidate.name === scenarioName && candidate.status === 'completed'
    ));
    const profile = scenario?.detail?.profile || {};
    const probe = window.__bundleParityProbe;
    const rawInventory = JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
    const collectIdentities = rows => (Array.isArray(rows) ? rows : []).flatMap(row => [
      { id: String(row?.id || ''), uid: String(row?.__uid || '') },
      ...collectIdentities(row?.contains)
    ]);
    return {
      core: {
        inventory: canonicalize(normalizeInventory(
          rawInventory
        )),
        money: canonicalize(window.storeHelper.getMoney(activeStore)),
        card: {
          acts: [...card?.querySelectorAll('button[data-act]') || []]
            .map(button => button.dataset.act || '')
            .filter(Boolean),
          compact: card?.classList.contains('compact') || false,
          category: card?.closest('.cat-group')?.querySelector(':scope > details')?.dataset.cat || ''
        }
      },
      identities: collectIdentities(rawInventory),
      ui: {
        scroll: { x: window.scrollX, y: window.scrollY },
        activeTag: document.activeElement?.tagName?.toLowerCase() || '',
        categoryOpen: card?.closest('.cat-group')?.querySelector(':scope > details')?.open ?? null
      },
      cardPreserved: card === probe?.card,
      counters: profile.counters || {},
      fallbacks: profile.fallbacks || [],
      consistency: (profile.checkpoints || [])
        .find(checkpoint => checkpoint.name === 'all-views-consistent')?.detail || null
    };
  }, { target, mode, reason });
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

for (const mode of ['unwrap', 'delete-all']) {
  test(`container ${mode} targeted transition matches forced-safe state and preserves unaffected DOM`, async ({ page }) => {
    const target = await prepareContainerFixture(page);

    await runContainerControl(page, target, mode, true);
    const safe = await captureContainerState(page, target, mode, `container-${mode}-safe`);
    expect(safe.fallbacks.map(fallback => fallback.reason)).toContain('forced-safe-path');

    await restoreInitialState(page, target);
    await runContainerControl(page, target, mode, false);
    const optimized = await captureContainerState(page, target, mode, `container-${mode}-optimized`);
    expect(optimized.core).toEqual(safe.core);
    expect(optimized.ui.activeTag).toBe(safe.ui.activeTag);
    expect(optimized.ui.expansion).toEqual(safe.ui.expansion);
    expect(optimized.ui.scroll.x).toBe(safe.ui.scroll.x);
    expect(Math.abs(optimized.ui.scroll.y - safe.ui.scroll.y)).toBeLessThanOrEqual(200);
    expect(optimized.fillerCardsPreserved).toBe(true);
    expect(optimized.childCardsPreserved).toBe(true);
    expect(optimized.counters.fullInventoryRenders || 0).toBe(0);
    expect(optimized.counters.inventoryUidFullNormalizations || 0).toBe(0);
    expect(optimized.counters.inventoryUidTargetValidations).toBe(1);
    expect(optimized.counters.rootBatches).toBe(1);
    expect(optimized.counters.refreshGenerations).toBe(1);
    expect(optimized.counters.persistenceSchedules).toBe(1);
    expect(optimized.fallbacks).toEqual([]);
    expect(optimized.consistency).toMatchObject({
      renderStrategy: mode === 'unwrap' ? 'targeted-topology' : 'targeted-remove'
    });

    await page.reload();
    await page.waitForFunction(() => (
      Boolean(window.__symbaroumBootCompleted)
      && Boolean(window.symbaroumPersistence?.ready)
    ));
    const reloadInventory = await page.evaluate(() => {
      const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
      const normalizeInventory = rows => (Array.isArray(rows) ? rows : []).map(row => ({
        ...row,
        artifactEffect: row.artifactEffect || '',
        kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
        gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
        removedKval: Array.isArray(row.removedKval) ? row.removedKval : [],
        ...(Array.isArray(row.contains) && row.contains.length
          ? { contains: normalizeInventory(row.contains) }
          : { contains: undefined })
      }));
      return normalizeInventory(JSON.parse(JSON.stringify(
        window.storeHelper.getInventory(activeStore)
      )));
    });
    expect(reloadInventory).toEqual(optimized.core.inventory);
  });
}

for (const mode of ['insert', 'remove']) {
  test(`bundle ${mode} transition matches forced-safe index state and reload`, async ({ page }) => {
    const target = await prepareBundleFixture(page, mode);

    await runBundleControl(page, target, mode, true);
    const safe = await captureBundleState(page, target, mode, `bundle-${mode}-safe`);
    expect(safe.fallbacks.map(fallback => fallback.reason)).toContain('forced-safe-path');

    await restoreBundleFixture(page, target, mode);
    await runBundleControl(page, target, mode, false);
    const optimized = await captureBundleState(page, target, mode, `bundle-${mode}-optimized`);
    expect(optimized.core).toEqual(safe.core);
    expect(optimized.ui).toEqual(safe.ui);
    expect(optimized.identities.every(identity => identity.uid)).toBe(true);
    expect(new Set(optimized.identities.map(identity => identity.uid)).size)
      .toBe(optimized.identities.length);
    expect(optimized.counters.fullInventoryRenders || 0).toBe(0);
    expect(optimized.counters.fullCatalogRenders || 0).toBe(0);
    expect(optimized.counters.inventoryUidFullNormalizations || 0).toBe(0);
    expect(optimized.counters.inventoryUidTargetValidations).toBe(1);
    expect(optimized.counters.rootBatches).toBe(1);
    expect(optimized.counters.refreshGenerations).toBe(1);
    expect(optimized.counters.persistenceSchedules).toBe(1);
    expect(optimized.fallbacks).toEqual([]);
    expect(optimized.consistency).toMatchObject({ renderStrategy: 'targeted-none' });

    await page.reload();
    await page.waitForFunction(() => (
      Boolean(window.__symbaroumBootCompleted)
      && Boolean(window.symbaroumPersistence?.ready)
    ));
    const reloadInventory = await page.evaluate(() => {
      const canonicalize = value => {
        if (Array.isArray(value)) return value.map(canonicalize);
        if (!value || typeof value !== 'object') return value;
        return Object.keys(value).sort().reduce((output, key) => {
          output[key] = canonicalize(value[key]);
          return output;
        }, {});
      };
      const normalizeInventory = rows => (Array.isArray(rows) ? rows : []).map(row => {
        const rest = { ...(row || {}) };
        const contains = rest.contains;
        delete rest.contains;
        delete rest.posQualCnt;
        delete rest.__uid;
        return {
          ...rest,
          artifactEffect: row?.artifactEffect || '',
          kvaliteter: Array.isArray(row?.kvaliteter) ? row.kvaliteter : [],
          gratisKval: Array.isArray(row?.gratisKval) ? row.gratisKval : [],
          removedKval: Array.isArray(row?.removedKval) ? row.removedKval : [],
          ...(Array.isArray(contains) && contains.length
            ? { contains: normalizeInventory(contains) }
            : {})
        };
      });
      const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
      const rawInventory = JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
      const collectIdentities = rows => (Array.isArray(rows) ? rows : []).flatMap(row => [
        { id: String(row?.id || ''), uid: String(row?.__uid || '') },
        ...collectIdentities(row?.contains)
      ]);
      return {
        inventory: canonicalize(normalizeInventory(rawInventory)),
        identities: collectIdentities(rawInventory)
      };
    });
    expect(reloadInventory.inventory).toEqual(optimized.core.inventory);
    expect(reloadInventory.identities).toEqual(optimized.identities);
  });
}

test('container topology preflight failure returns to the safe renderer', async ({ page }) => {
  const target = await prepareContainerFixture(page);
  await page.evaluate(({ childUid }) => {
    document.querySelector(
      `#invList li.entry-card[data-uid="${window.CSS.escape(childUid)}"]`
    )?.remove();
  }, { childUid: target.childUids[0] });
  await runContainerControl(page, target, 'unwrap', false);
  const result = await captureContainerState(page, target, 'unwrap', 'container-preflight-fallback');
  expect(result.core.inventory.some(row => row.__uid === target.vehicleUid)).toBe(false);
  expect(target.childUids.every(uid => result.core.inventory.some(row => row.__uid === uid))).toBe(true);
  expect(result.counters.fullInventoryRenders).toBeGreaterThanOrEqual(1);
  expect(result.fallbacks.map(fallback => fallback.reason)).toContain('target-dom-card-missing');
});

test('general topology planner produces exact immutable unwrap, subtree, and bundle transitions', async ({ page }) => {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.invUtil?.createInventoryTopologyCandidate)
    && Boolean(window.invUtil?.planInventoryTopologyMutation)
  ));
  const result = await page.evaluate(async () => {
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const vehicle = entries.find(entry => window.isInv?.(entry)
      && window.inventoryCapabilities?.resolve?.(entry)?.topology === 'vehicle');
    const storage = entries.find(entry => window.isInv?.(entry)
      && window.inventoryCapabilities?.resolve?.(entry)?.topology === 'container');
    const leaves = entries.filter(entry => {
      const capabilities = window.inventoryCapabilities?.resolve?.(entry);
      const types = entry?.taggar?.typ || [];
      return window.isInv?.(entry)
        && capabilities?.topology === 'leaf'
        && !capabilities.stateLinks.length
        && !capabilities.derivedDomains.length
        && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type))
        && !window.invUtil.isInventoryBundleEntry(entry);
    });
    const bundleSummary = entries.find(entry => String(entry?.id || '') === 'di79')
      || entries.find(entry => window.invUtil.isInventoryBundleEntry(entry));
    const bundle = await window.catalogLoader?.ensureEntryData?.(bundleSummary);
    if (!vehicle || !storage || leaves.length < 3 || !bundle) {
      throw new Error('Missing generalized topology representatives.');
    }
    const row = (entry, uid, qty = 1, contains) => ({
      id: entry.id,
      name: entry.namn,
      __uid: uid,
      qty,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      ...(contains ? { contains } : {})
    });
    const childA = row(leaves[0], 'general-child-a');
    const childB = row(leaves[1], 'general-child-b');
    const parent = row(vehicle, 'general-parent', 1, [childA, childB]);
    const filler = row(leaves[2], 'general-filler');
    const before = [filler, parent];
    const beforeJson = JSON.stringify(before);
    const common = {
      list: [],
      activeFilters: false,
      forceSafePath: false,
      aggregateSnapshotAvailable: true
    };
    const summarize = plan => ({
      fastPath: plan.fastPath,
      fallbackReasons: plan.fallbackReasons,
      renderStrategy: plan.renderStrategy,
      rows: plan.rows,
      affectedParents: plan.affectedParents,
      affectedCategories: plan.affectedCategories,
      shells: plan.shells,
      aggregateEffects: plan.aggregateEffects,
      expected: plan.expected
    });

    const unwrapAfter = window.invUtil.createInventoryTopologyCandidate(before, candidate => {
      const index = candidate.findIndex(candidateRow => candidateRow.__uid === 'general-parent');
      candidate.splice(index, 1, ...candidate[index].contains);
    });
    const unwrapAfterJson = JSON.stringify(unwrapAfter);
    const unwrap = window.invUtil.planInventoryTopologyMutation(before, {
      ...common,
      afterInventory: unwrapAfter,
      action: 'container-unwrap',
      surface: 'inventory'
    });

    const deleteAfter = window.invUtil.createInventoryTopologyCandidate(before, candidate => {
      const index = candidate.findIndex(candidateRow => candidateRow.__uid === 'general-parent');
      candidate.splice(index, 1);
    });
    const deleteAll = window.invUtil.planInventoryTopologyMutation(before, {
      ...common,
      afterInventory: deleteAfter,
      action: 'container-delete-all',
      surface: 'inventory'
    });

    const bundleBefore = [row(leaves[2], 'bundle-filler')];
    const bundleInsertAfter = window.invUtil.createInventoryTopologyCandidate(bundleBefore, candidate => {
      window.invUtil.addInventoryBundle(candidate, bundle);
    });
    const bundleInsertAfterJson = JSON.stringify(bundleInsertAfter);
    const bundleInsert = window.invUtil.planInventoryTopologyMutation(bundleBefore, {
      ...common,
      afterInventory: bundleInsertAfter,
      action: 'bundle-insert',
      surface: 'index',
      sourceEntry: bundle
    });
    const bundleRemoveAfter = window.invUtil.createInventoryTopologyCandidate(bundleInsertAfter, candidate => {
      window.invUtil.removeInventoryBundle(candidate, bundle, 1);
    });
    const bundleRemove = window.invUtil.planInventoryTopologyMutation(bundleInsertAfter, {
      ...common,
      afterInventory: bundleRemoveAfter,
      action: 'bundle-remove',
      surface: 'index',
      sourceEntry: bundle
    });

    const forced = window.invUtil.planInventoryTopologyMutation(before, {
      ...common,
      afterInventory: unwrapAfter,
      action: 'container-unwrap',
      surface: 'inventory',
      forceSafePath: true
    });
    const filtered = window.invUtil.planInventoryTopologyMutation(before, {
      ...common,
      afterInventory: unwrapAfter,
      action: 'container-unwrap',
      surface: 'inventory',
      activeFilters: true
    });
    const missingUid = JSON.parse(JSON.stringify(unwrapAfter));
    delete missingUid[0].__uid;
    const missing = window.invUtil.planInventoryTopologyMutation(before, {
      ...common,
      afterInventory: missingUid,
      action: 'container-unwrap',
      surface: 'inventory'
    });
    const duplicateUid = JSON.parse(JSON.stringify(unwrapAfter));
    duplicateUid[1].__uid = duplicateUid[0].__uid;
    const duplicate = window.invUtil.planInventoryTopologyMutation(before, {
      ...common,
      afterInventory: duplicateUid,
      action: 'container-unwrap',
      surface: 'inventory'
    });
    const deepBefore = [
      row(vehicle, 'deep-root', 1, [
        row(vehicle, 'deep-middle', 1, [
          row(leaves[0], 'deep-leaf')
        ])
      ])
    ];
    const deepAfter = window.invUtil.createInventoryTopologyCandidate(deepBefore, candidate => {
      candidate.push(candidate[0].contains[0].contains.splice(0, 1)[0]);
    });
    const deep = window.invUtil.planInventoryTopologyMutation(deepBefore, {
      ...common,
      afterInventory: deepAfter,
      action: 'nested-move',
      surface: 'inventory'
    });
    const storageBefore = [
      row(storage, 'storage-parent', 1, []),
      row(leaves[0], 'storage-leaf')
    ];
    const storageAfter = window.invUtil.createInventoryTopologyCandidate(storageBefore, candidate => {
      candidate[0].contains.push(candidate.splice(1, 1)[0]);
    });
    const storageMove = window.invUtil.planInventoryTopologyMutation(storageBefore, {
      ...common,
      afterInventory: storageAfter,
      action: 'nested-move',
      surface: 'inventory'
    });

    return {
      immutable: {
        before: beforeJson === JSON.stringify(before),
        unwrapAfter: unwrapAfterJson === JSON.stringify(unwrapAfter),
        bundleAfter: bundleInsertAfterJson === JSON.stringify(bundleInsertAfter)
      },
      ids: {
        parent: parent.__uid,
        children: [childA.__uid, childB.__uid],
        filler: filler.__uid
      },
      unwrap: summarize(unwrap),
      deleteAll: summarize(deleteAll),
      bundleInsert: summarize(bundleInsert),
      bundleRemove: summarize(bundleRemove),
      conservative: {
        forced: summarize(forced),
        filtered: summarize(filtered),
        missing: summarize(missing),
        duplicate: summarize(duplicate),
        deep: summarize(deep),
        storageMove: summarize(storageMove)
      }
    };
  });

  expect(result.immutable).toEqual({ before: true, unwrapAfter: true, bundleAfter: true });
  expect(result.unwrap).toMatchObject({
    fastPath: true,
    fallbackReasons: [],
    renderStrategy: 'targeted-topology'
  });
  expect(result.unwrap.rows.removed.map(change => change.uid)).toEqual([result.ids.parent]);
  expect(result.unwrap.rows.moved.map(change => change.uid).sort()).toEqual([...result.ids.children].sort());
  expect(result.unwrap.rows.inserted).toEqual([]);
  expect(result.unwrap.shells.parent.removed).toContain(result.ids.parent);
  expect(result.unwrap.expected.topLevelUids).toEqual([
    result.ids.filler,
    ...result.ids.children
  ]);
  expect(result.unwrap.affectedParents).toEqual(expect.arrayContaining([
    expect.objectContaining({
      uid: 'root',
      beforeOrder: [result.ids.filler, result.ids.parent],
      afterOrder: [result.ids.filler, ...result.ids.children]
    }),
    expect.objectContaining({
      uid: result.ids.parent,
      beforeOrder: result.ids.children,
      afterOrder: []
    })
  ]));

  expect(result.deleteAll).toMatchObject({
    fastPath: true,
    fallbackReasons: [],
    renderStrategy: 'targeted-remove'
  });
  expect(result.deleteAll.rows.removed.map(change => change.uid).sort()).toEqual([
    result.ids.parent,
    ...result.ids.children
  ].sort());
  expect(result.deleteAll.expected.topLevelUids).toEqual([result.ids.filler]);

  expect(result.bundleInsert).toMatchObject({
    fastPath: true,
    fallbackReasons: [],
    renderStrategy: 'targeted-none'
  });
  expect(result.bundleInsert.rows.inserted.length + result.bundleInsert.rows.patched.length).toBeGreaterThan(0);
  expect(result.bundleRemove).toMatchObject({
    fastPath: true,
    fallbackReasons: [],
    renderStrategy: 'targeted-none'
  });
  expect(result.bundleRemove.rows.removed.length + result.bundleRemove.rows.patched.length).toBeGreaterThan(0);

  expect(result.conservative.forced.fallbackReasons).toContain('forced-safe-path');
  expect(result.conservative.filtered.fallbackReasons).toContain('active-filter-membership-uncertain');
  expect(result.conservative.missing.fallbackReasons).toContain('missing-row-uid');
  expect(result.conservative.duplicate.fallbackReasons).toContain('duplicate-row-uid');
  expect(result.conservative.deep.fallbackReasons).toContain('nested-inventory-path');
  expect(result.conservative.storageMove.fallbackReasons).toContain('unsupported-topology-transition');
  Object.values(result.conservative).forEach(plan => {
    expect(plan.fastPath).toBe(false);
    expect(plan.renderStrategy).toBe('full-fallback');
  });
});

test('legacy intent adapter keeps unsupported container, deep nesting, unwrap, and bundle moves conservative', async ({ page }) => {
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
