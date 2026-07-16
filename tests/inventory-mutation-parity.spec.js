import { expect, test } from '@playwright/test';

const CHAR_ID = 'inventory-parity-char';

async function seedStore(page) {
  await page.addInitScript(({ charId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: charId,
      characters: [{ id: charId, name: 'Inventory Parity', folderId: 'fd-standard' }],
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

async function addQualityThroughUi(page, target) {
  const card = page.locator(`#invList li.entry-card[data-uid="${target.rowUid}"]`).first();
  const button = card.locator('button[data-act="addQual"]');
  if (!await button.isVisible()) await card.locator('.card-title').click();
  await button.click();
  const search = page.locator('shared-toolbar #qualSearch');
  await search.waitFor({ state: 'visible' });
  await search.fill(target.quality);
  await page.locator('shared-toolbar #qualOptions .quality-option').first().click();
  await page.locator('shared-toolbar #qualApply').click();
  await expect(card.locator(`.db-chip[data-qual="${target.quality}"]`)).toBeVisible();
}

async function captureQualityState(page, target, reason) {
  return page.evaluate(async ({ target, reason }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason });
    const inventory = JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))).map(row => ({
      ...row,
      artifactEffect: row.artifactEffect || '',
      kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
      gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
      removedKval: Array.isArray(row.removedKval) ? row.removedKval : []
    }));
    const card = document.querySelector(`#invList li.entry-card[data-uid="${target.rowUid}"]`);
    const infoButton = card?.querySelector('.info-btn');
    let info = infoButton?.dataset.info || '';
    try { info = decodeURIComponent(info); } catch {}
    return {
      inventory,
      money: window.storeHelper.getMoney(activeStore),
      artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
      derived: window.storeHelper.getDerived?.(activeStore) || null,
      rendered: {
        qualities: [...(card?.querySelectorAll('.db-chip[data-qual]') || [])].map(chip => chip.dataset.qual),
        price: card?.querySelector('.price-click')?.textContent || '',
        weight: card?.querySelector('.weight-badge')?.textContent || '',
        details: card?.querySelector('.entry-card-details')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        info: String(info).replace(/\s+/g, ' ').trim(),
        totalWeight: document.querySelector('#weightOutput')?.textContent || ''
      }
    };
  }, { target, reason });
}

test('metadata quantity fast path matches the conservative save/render path and reload', async ({ page }) => {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#invList').waitFor({ state: 'visible' });

  const target = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const entry = entries.filter(candidate => {
      const inventoryMeta = candidate?.taggar?.inventory || {};
      const choices = window.rulesHelper?.getRuleList?.(candidate, 'val') || [];
      return window.isInv?.(candidate)
        && inventoryMeta.stackbar === true
        && ['kraft', 'ritual'].includes(String(candidate?.bound || '').trim())
        && choices.some(rule => String(rule?.field || '').trim() === 'trait')
        && !(window.rulesHelper?.getRuleList?.(candidate, 'andrar') || []).length
        && !window.storeHelper?.isSearchHiddenEntry?.(candidate);
    }).sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))[0];
    const traitEntry = entries.find(candidate => (candidate?.taggar?.typ || []).includes('Mystisk kraft'));
    if (!entry || !traitEntry) throw new Error('Missing metadata quantity parity representative.');
    const inventory = [{
      id: entry.id,
      name: entry.namn,
      qty: 1,
      trait: traitEntry.namn,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    }];
    window.storeHelper.setInventory(activeStore, inventory, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'parity-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-setup' });
    const initial = JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
    return { id: entry.id, name: entry.namn, initial };
  });

  await page.evaluate(() => {
    window.__symbaroumPerfForceSafeInventoryMutations = true;
  });
  const safeCard = page.locator(`#invList li[data-name="${target.name}"]`).first();
  await safeCard.locator('button[data-act="add"]').click();
  await expect(page.locator(`#invList li[data-name="${target.name}"] .count-badge`).first()).toHaveText('×2');

  const safeState = await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-safe' });
    const card = document.querySelector(`#invList li[data-name="${window.CSS.escape(target.name)}"]`);
    return {
      inventory: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))).map(row => ({
        ...row,
        artifactEffect: row.artifactEffect || '',
        kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : []
      })),
      money: window.storeHelper.getMoney(activeStore),
      artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
      rendered: {
        quantity: card?.querySelector('.count-badge')?.textContent || '',
        title: card?.querySelector('.entry-title-main')?.textContent || '',
        weight: document.querySelector('#weightOutput')?.textContent || ''
      }
    };
  }, { target });

  await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const restored = JSON.parse(JSON.stringify(target.initial));
    window.storeHelper.setInventory(activeStore, restored, { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'parity-restore' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-restore' });
    window.__symbaroumPerfForceSafeInventoryMutations = false;
  }, { target });

  const card = page.locator(`#invList li[data-name="${target.name}"]`).first();
  await card.locator('button[data-act="add"]').click();
  await expect(card.locator('.count-badge')).toHaveText('×2');

  const fastState = await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-fast' });
    const card = document.querySelector(`#invList li[data-name="${window.CSS.escape(target.name)}"]`);
    return {
      inventory: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))).map(row => ({
        ...row,
        artifactEffect: row.artifactEffect || '',
        kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : []
      })),
      money: window.storeHelper.getMoney(activeStore),
      artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
      rendered: {
        quantity: card?.querySelector('.count-badge')?.textContent || '',
        title: card?.querySelector('.entry-title-main')?.textContent || '',
        weight: document.querySelector('#weightOutput')?.textContent || ''
      }
    };
  }, { target });

  expect(fastState).toEqual(safeState);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const reloadedInventory = await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))).map(row => ({
      ...row,
      artifactEffect: row.artifactEffect || '',
      kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : []
    }));
  });
  expect(reloadedInventory).toEqual(fastState.inventory);

  const safeRemoval = await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, JSON.parse(JSON.stringify(target.initial)), { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'parity-removal-safe-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-removal-safe-setup' });
    window.__symbaroumPerfForceSafeInventoryMutations = true;
    return true;
  }, { target });
  expect(safeRemoval).toBe(true);
  await page.locator(`#invList li[data-name="${target.name}"] button[data-act="del"]`).first().click();
  await expect(page.locator(`#invList li[data-name="${target.name}"]`)).toHaveCount(0);
  const safeRemovalState = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-removal-safe' });
    return {
      inventory: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))),
      money: window.storeHelper.getMoney(activeStore),
      artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
      rendered: {
        cardCount: document.querySelectorAll('#invList li.entry-card[data-uid]').length,
        weight: document.querySelector('#weightOutput')?.textContent || ''
      }
    };
  });

  await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, JSON.parse(JSON.stringify(target.initial)), { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'parity-removal-fast-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-removal-fast-setup' });
    window.__symbaroumPerfForceSafeInventoryMutations = false;
  }, { target });
  await page.locator(`#invList li[data-name="${target.name}"] button[data-act="del"]`).first().click();
  await expect(page.locator(`#invList li[data-name="${target.name}"]`)).toHaveCount(0);
  const fastRemovalState = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'parity-removal-fast' });
    return {
      inventory: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))),
      money: window.storeHelper.getMoney(activeStore),
      artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
      rendered: {
        cardCount: document.querySelectorAll('#invList li.entry-card[data-uid]').length,
        weight: document.querySelector('#weightOutput')?.textContent || ''
      }
    };
  });
  expect(fastRemovalState).toEqual(safeRemovalState);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const removalReload = await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)));
  });
  expect(removalReload).toEqual(fastRemovalState.inventory);
});

test('filtered final-row removal matches the forced safe path and reload', async ({ page }) => {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#invList').waitFor({ state: 'visible' });

  const target = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = window.lookupEntry?.({ name: 'Bandage' });
    const filler = window.lookupEntry?.({ name: 'Fackla' }) || window.lookupEntry?.({ name: 'Dryckesbälte' });
    if (!entry || !filler) throw new Error('Missing filtered removal representative.');
    const initial = [{
      id: entry.id,
      name: entry.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    }, {
      id: filler.id,
      name: filler.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    }];
    window.storeHelper.setInventory(activeStore, initial, { bumpDerived: false });
    const stored = window.storeHelper.getInventory(activeStore);
    window.invUtil.filter.invTxt = entry.namn;
    window.invUtil.renderInventory({ trigger: 'filtered-removal-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'filtered-removal-setup' });
    const row = stored[0];
    const renamed = { ...row, name: 'Helt annat föremål' };
    return {
      name: entry.namn,
      rowUid: row.__uid,
      initial: JSON.parse(JSON.stringify(stored)),
      classifier: {
        leave: window.invUtil.classifyInventoryFilterMutation({
          previousRow: row, row: renamed, previousEntry: entry, entry,
          previousIndex: 0, nextIndex: 0
        }),
        enter: window.invUtil.classifyInventoryFilterMutation({
          previousRow: renamed, row, previousEntry: entry, entry,
          previousIndex: 0, nextIndex: 0
        }),
        reorder: window.invUtil.classifyInventoryFilterMutation({
          previousRow: row, row: { ...row }, previousEntry: entry, entry,
          previousIndex: 0, nextIndex: 1
        })
      }
    };
  });

  expect(target.classifier.leave).toMatchObject({
    membership: 'leave',
    requiredRenderStrategy: 'targeted-remove',
    fallbackReason: 'active-filter-leave-unoptimized'
  });
  expect(target.classifier.enter).toMatchObject({
    membership: 'enter',
    requiredRenderStrategy: 'targeted-insert',
    fallbackReason: 'active-filter-enter-unoptimized'
  });
  expect(target.classifier.reorder).toMatchObject({
    membership: 'remain',
    positionChanged: true,
    requiredRenderStrategy: 'targeted-move',
    fallbackReason: 'active-filter-order-change-unoptimized'
  });

  const runRemoval = async forceSafePath => {
    await page.evaluate(({ forceSafePath }) => {
      window.__symbaroumPerfForceSafeInventoryMutations = forceSafePath;
      const perf = window.symbaroumPerf;
      perf?.clearHistory?.();
      const scenarioId = perf?.startScenario?.('filtered-removal-parity', { scope: 'inventory' });
      perf?.setFlowContext?.('inventory-mutation', scenarioId);
      window.__filteredRemovalScenarioId = scenarioId;
    }, { forceSafePath });
    await page.locator(`#invList li[data-uid="${target.rowUid}"] button[data-act="del"]`).first().click();
    await expect(page.locator(`#invList li[data-uid="${target.rowUid}"]`)).toHaveCount(0);
    return page.evaluate(async () => {
      const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
      await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
      await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'filtered-removal-parity' });
      await window.symbaroumPerf?.afterNextPaint?.(2);
      const scenarioId = window.__filteredRemovalScenarioId;
      window.symbaroumPerf?.clearFlowContext?.('inventory-mutation', scenarioId);
      const scenario = window.symbaroumPerf?.endScenario?.(scenarioId);
      return {
        core: {
          inventory: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))).map(row => ({
            ...row,
            artifactEffect: row.artifactEffect || '',
            kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
            gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
            removedKval: Array.isArray(row.removedKval) ? row.removedKval : []
          })),
          money: window.storeHelper.getMoney(activeStore),
          artifactEffects: window.storeHelper.getArtifactEffects(activeStore),
          visibleCards: [...document.querySelectorAll('#invList li.entry-card[data-uid]')]
            .map(card => card.dataset.uid)
        },
        counters: scenario?.detail?.profile?.counters || {},
        fallbacks: scenario?.detail?.profile?.fallbacks || []
      };
    });
  };

  const safe = await runRemoval(true);
  expect(safe.fallbacks.map(fallback => fallback.reason)).toContain('forced-safe-path');
  expect(safe.counters.fullInventoryRenders).toBeGreaterThanOrEqual(1);

  await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, JSON.parse(JSON.stringify(target.initial)), { bumpDerived: false });
    window.invUtil.filter.invTxt = target.name;
    window.invUtil.renderInventory({ trigger: 'filtered-removal-restore' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'filtered-removal-restore' });
  }, { target });

  const optimized = await runRemoval(false);
  expect(optimized.core).toEqual(safe.core);
  expect(optimized.fallbacks).toEqual([]);
  expect(optimized.counters.fullInventoryRenders || 0).toBe(0);
  expect(optimized.counters.targetedRenders).toBeGreaterThanOrEqual(1);
  expect(optimized.counters.refreshGenerations).toBe(1);
  expect(optimized.counters.persistenceSchedules).toBe(1);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const reloaded = await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore))).map(row => ({
      ...row,
      artifactEffect: row.artifactEffect || '',
      kvaliteter: Array.isArray(row.kvaliteter) ? row.kvaliteter : [],
      gratisKval: Array.isArray(row.gratisKval) ? row.gratisKval : [],
      removedKval: Array.isArray(row.removedKval) ? row.removedKval : []
    }));
  });
  expect(reloaded).toEqual(optimized.core.inventory);
});

test('declared economy quality add and remove match the forced safe path and reload', async ({ page }) => {
  await seedStore(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#invList').waitFor({ state: 'visible' });

  const target = await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const economyDomains = new Set(['inventory.row', 'inventory.totals', 'summary.economy', 'persistence']);
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const entry = entries.filter(candidate => {
      const types = candidate?.taggar?.typ || [];
      const hasSpecialRules = ['val', 'kraver', 'krockar', 'ger', 'andrar'].some(key => (
        (window.rulesHelper?.getRuleList?.(candidate, key) || []).length > 0
      ));
      return types.includes('Rustning') && window.isInv?.(candidate) && !hasSpecialRules;
    }).sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))[0];
    const quality = entries.find(candidate => {
      if (!window.isQual?.(candidate) || !window.canApplyQuality?.(entry, candidate)) return false;
      const impact = window.invUtil.classifyInventoryMutation(candidate, {
        id: candidate.id,
        name: candidate.namn,
        __uid: 'quality-parity-probe',
        qty: 1
      }, { metadataOnly: true, requiresStableRowUid: true });
      return impact.fastPath && impact.affectedDomains.every(domain => economyDomains.has(domain));
    });
    if (!entry || !quality) throw new Error('Missing declared economy quality parity representative.');
    const initial = [{
      id: entry.id,
      name: entry.namn,
      qty: 1,
      gratis: 0,
      kvaliteter: [],
      gratisKval: [],
      removedKval: [],
      artifactEffect: ''
    }];
    window.storeHelper.setInventory(activeStore, initial, { bumpDerived: false });
    window.invUtil.filter.invTxt = entry.namn;
    window.invUtil.renderInventory({ trigger: 'quality-parity-setup' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'quality-parity-setup' });
    const row = window.storeHelper.getInventory(activeStore)[0];
    const filterImpact = window.invUtil.classifyInventoryFilterMutation({
      previousRow: row,
      row: { ...row, kvaliteter: [quality.namn] },
      previousEntry: entry,
      entry,
      previousIndex: 0,
      nextIndex: 0
    });
    return {
      entryId: entry.id,
      name: entry.namn,
      quality: quality.namn,
      rowUid: row.__uid,
      filterImpact,
      initial: JSON.parse(JSON.stringify(window.storeHelper.getInventory(activeStore)))
    };
  });
  expect(target.filterImpact).toMatchObject({
    active: true,
    provable: true,
    beforeMatches: true,
    afterMatches: true,
    membership: 'remain',
    positionChanged: false,
    requiredRenderStrategy: 'targeted-patch',
    targetedPatchSafe: true,
    fallbackReason: ''
  });

  await page.evaluate(() => { window.__symbaroumPerfForceSafeInventoryMutations = true; });
  await addQualityThroughUi(page, target);
  const safeAdd = await captureQualityState(page, target, 'quality-parity-safe-add');

  await page.evaluate(async ({ target }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, JSON.parse(JSON.stringify(target.initial)), { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'quality-parity-fast-restore' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'quality-parity-fast-restore' });
    window.__symbaroumPerfForceSafeInventoryMutations = false;
  }, { target });
  await page.evaluate(({ rowUid }) => {
    window.__filteredQualityCard = document.querySelector(`#invList li.entry-card[data-uid="${rowUid}"]`);
  }, { rowUid: target.rowUid });
  await addQualityThroughUi(page, target);
  const fastAdd = await captureQualityState(page, target, 'quality-parity-fast-add');
  expect(fastAdd).toEqual(safeAdd);
  expect(await page.evaluate(({ rowUid }) => (
    document.querySelector(`#invList li.entry-card[data-uid="${rowUid}"]`) === window.__filteredQualityCard
  ), { rowUid: target.rowUid })).toBe(true);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const reloadedAdd = await captureQualityState(page, target, 'quality-parity-reload-add');
  expect(reloadedAdd).toEqual(fastAdd);

  await page.evaluate(({ name }) => {
    window.invUtil.filter.invTxt = name;
    window.invUtil.renderInventory({ trigger: 'quality-parity-filter-restore' });
  }, { name: target.name });
  await page.evaluate(() => { window.__symbaroumPerfForceSafeInventoryMutations = true; });
  await page.locator(`#invList li[data-uid="${target.rowUid}"] .db-chip[data-qual="${target.quality}"]`).click();
  await expect(page.locator(`#invList li[data-uid="${target.rowUid}"] .db-chip[data-qual="${target.quality}"]`)).toHaveCount(0);
  const safeRemove = await captureQualityState(page, target, 'quality-parity-safe-remove');

  await page.evaluate(async ({ inventory }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, JSON.parse(JSON.stringify(inventory)), { bumpDerived: false });
    window.invUtil.renderInventory({ trigger: 'quality-parity-remove-restore' });
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'quality-parity-remove-restore' });
    window.__symbaroumPerfForceSafeInventoryMutations = false;
  }, { inventory: fastAdd.inventory });
  await page.locator(`#invList li[data-uid="${target.rowUid}"] .db-chip[data-qual="${target.quality}"]`).click();
  await expect(page.locator(`#invList li[data-uid="${target.rowUid}"] .db-chip[data-qual="${target.quality}"]`)).toHaveCount(0);
  const fastRemove = await captureQualityState(page, target, 'quality-parity-fast-remove');
  expect(fastRemove).toEqual(safeRemove);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const reloadedRemove = await captureQualityState(page, target, 'quality-parity-reload-remove');
  expect(reloadedRemove).toEqual(fastRemove);
});
