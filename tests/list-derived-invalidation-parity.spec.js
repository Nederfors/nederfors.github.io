import { expect, test } from '@playwright/test';

const CHAR_ID = 'list-derived-invalidation-parity';

async function seedCharacter(page) {
  await page.addInitScript(({ charId }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: charId,
      characters: [{ id: charId, name: 'Derived invalidation parity', folderId: 'fd-standard' }],
      folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
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
      artifactEffects: {},
      snapshotRules: [],
      revealedArtifacts: [],
      traits: {
        Diskret: 10,
        Kvick: 11,
        Listig: 12,
        Stark: 13,
        Träffsäker: 14,
        Vaksam: 15,
        Viljestark: 16,
        Övertygande: 17
      },
      privMoney: { daler: 2, skilling: 3, 'örtegar': 4 },
      possessionMoney: { daler: 5, skilling: 6, 'örtegar': 7 },
      bonusMoney: { daler: 8, skilling: 9, 'örtegar': 10 }
    }));
  }, { charId: CHAR_ID });
}

async function waitForCharacter(page) {
  await page.goto('/#/character');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(window.storeHelper?.planCurrentListRemoval)
    && Boolean(document.querySelector('#valda'))
  ));
}

async function prepareBaseline(page, targetName) {
  return page.evaluate(async (name) => {
    await window.catalogLoader?.ensureFullDatabase?.();
    let entry = window.lookupEntry?.({ name })
      || (window.DB || []).find(candidate => String(candidate?.namn || '').trim() === name);
    if (!entry) throw new Error(`Missing derived-invalidation entry: ${name}`);
    entry = await window.catalogLoader?.ensureEntryData?.(entry) || entry;
    const clone = value => JSON.parse(JSON.stringify(value));
    const selected = {
      ...clone(entry),
      nivå: Object.keys(entry.nivåer || {})[0] || entry.nivå || 'Novis',
      __uid: `derived-impact-${String(entry.id || name)}`,
      __order: 1
    };
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.__symbaroumPerfForceSafeListMutations = true;
    window.storeHelper.setCurrentList(activeStore, [selected]);
    window.__symbaroumPerfForceSafeListMutations = false;
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      traits: true,
      summary: true,
      effects: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') await window.updateXP({ source: 'derived-parity-baseline' });
    if (typeof window.renderTraits === 'function') await window.renderTraits();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'derived-parity-baseline' });
    return clone(window.storeHelper.getCurrentList(activeStore));
  }, targetName);
}

async function restoreBaseline(page, baseline) {
  await page.evaluate(async (entries) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.__symbaroumPerfForceSafeListMutations = true;
    window.storeHelper.setCurrentList(activeStore, JSON.parse(JSON.stringify(entries)));
    window.__symbaroumPerfForceSafeListMutations = false;
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      traits: true,
      summary: true,
      effects: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') await window.updateXP({ source: 'derived-parity-restore' });
    if (typeof window.renderTraits === 'function') await window.renderTraits();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'derived-parity-restore' });
  }, baseline);
}

async function runProductionRemoval(page, targetName, forceSafe) {
  const beforeVersion = await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.symbaroumPerf?.clearHistory?.();
    window.__symbaroumPerfCaptureRemovals = true;
    window.__symbaroumPerfAwaitFlush = true;
    window.__symbaroumPerfForceSafeListMutations = false;
    return window.storeHelper.getDerivedVersion(activeStore);
  });
  await page.evaluate(({ name, safe }) => {
    window.__symbaroumPerfForceSafeListMutations = safe;
    const card = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .find(candidate => String(candidate?.dataset?.name || '').trim() === name);
    const button = card?.querySelector('button[data-act="del"], button[data-act="rem"]');
    if (!button) throw new Error(`Missing production removal control for ${name}`);
    button.click();
  }, { name: targetName, safe: forceSafe });
  await expect.poll(async () => page.evaluate((name) => (
    !window.storeHelper.getCurrentList(
      typeof store === 'object' && store ? store : window.storeHelper.load()
    ).some(entry => String(entry?.namn || '').trim() === name)
  ), targetName)).toBe(true);
  await page.waitForFunction(() => (
    window.symbaroumPerf?.getSnapshot?.().scenarios
      ?.some(scenario => scenario.name === 'remove-item-from-character' && scenario.status === 'completed')
  ));
  return page.evaluate(async ({ priorVersion, safe }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'derived-parity-capture' });
    await window.symbaroumPerf?.afterNextPaint?.(2);
    const clone = value => JSON.parse(JSON.stringify(value));
    const data = activeStore.data?.[activeStore.current] || {};
    const list = window.storeHelper.getCurrentList(activeStore);
    const inventory = window.storeHelper.getInventory(activeStore);
    const traits = window.storeHelper.getTraits(activeStore);
    const scenario = window.symbaroumPerf.getSnapshot().scenarios
      .filter(candidate => candidate.name === 'remove-item-from-character')
      .at(-1);
    const summary = window.storeHelper.getLastCurrentListMutationSummary(activeStore);
    const text = selector => String(document.querySelector(selector)?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    const cards = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .map(card => ({
        id: card.dataset.id || '',
        uid: card.dataset.uid || '',
        name: card.dataset.name || '',
        text: card.textContent.replace(/\s+/g, ' ').trim()
      }));
    const currentVersion = window.storeHelper.getDerivedVersion(activeStore);
    const persisted = clone(JSON.parse(localStorage.getItem(`rpall-char-${activeStore.current}`) || '{}'));
    delete persisted.lastCurrentListMutationSummary;
    window.__symbaroumPerfForceSafeListMutations = false;
    window.__symbaroumPerfCaptureRemovals = false;
    window.__symbaroumPerfAwaitFlush = false;
    return {
      core: {
        list: clone(list),
        inventory: clone(inventory),
        suppressedEntryGrants: clone(data.suppressedEntryGrants || []),
        darkPastSuppressed: clone(data.darkPastSuppressed || []),
        revealedArtifacts: clone(window.storeHelper.getRevealedArtifacts(activeStore)),
        artifactEffects: clone(window.storeHelper.getArtifactEffects(activeStore)),
        snapshotRules: clone(window.storeHelper.getSnapshotRuleRecords(activeStore)),
        traits: clone(traits),
        defenseSetup: clone(window.storeHelper.getDefenseSetup(activeStore)),
        derived: {
          totalXp: window.storeHelper.calcTotalXP(window.storeHelper.getBaseXP(activeStore), list),
          usedXp: window.storeHelper.calcUsedXP(list),
          corruption: clone(window.storeHelper.calcCorruptionTrackStats(list, traits.Viljestark)),
          permanentCorruption: window.storeHelper.calcPermanentCorruption(list),
          carryCapacity: window.storeHelper.calcCarryCapacity(traits.Stark, list),
          toughness: window.storeHelper.calcToughness(traits.Stark, list),
          painThreshold: window.storeHelper.calcPainThreshold(traits.Stark, list),
          traitTotalMax: window.storeHelper.calcTraitTotalMax(list, inventory)
        },
        surfaces: {
          xpSummary: text('#xpSummary'),
          xpTotal: text('#xpTotal'),
          xpUsed: text('#xpUsed'),
          xpFree: text('#xpFree'),
          traits: text('#traits'),
          traitStats: text('#traitStats'),
          summary: text('#summaryContent'),
          effects: text('#effectsContent'),
          cards
        },
        persisted
      },
      mode: summary?.reconciliationMode || '',
      reason: summary?.reconciliationReason || '',
      impact: clone(summary?.derivedImpact || null),
      versionDelta: Number(currentVersion || 0) - Number(priorVersion || 0),
      counters: clone(scenario?.detail?.profile?.counters || {}),
      fallbacks: clone(scenario?.detail?.profile?.fallbacks || []),
      safe
    };
  }, { priorVersion: beforeVersion, safe: forceSafe });
}

async function captureReloadedCore(page) {
  await page.reload();
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(document.querySelector('#valda'))
  ));
  return page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    const clone = value => JSON.parse(JSON.stringify(value));
    const data = activeStore.data?.[activeStore.current] || {};
    return {
      list: clone(window.storeHelper.getCurrentList(activeStore)),
      inventory: clone(window.storeHelper.getInventory(activeStore)),
      suppressedEntryGrants: clone(data.suppressedEntryGrants || []),
      darkPastSuppressed: clone(data.darkPastSuppressed || []),
      revealedArtifacts: clone(window.storeHelper.getRevealedArtifacts(activeStore)),
      artifactEffects: clone(window.storeHelper.getArtifactEffects(activeStore)),
      snapshotRules: clone(window.storeHelper.getSnapshotRuleRecords(activeStore))
    };
  });
}

for (const signature of [
  {
    targetName: 'Kortlivad',
    status: 'none',
    expectedDomains: [],
    workerRequired: false
  },
  {
    targetName: 'Balanserat',
    status: 'bounded',
    expectedDomains: ['combat', 'inventory.totals', 'summary.combat', 'summary.economy'],
    workerRequired: false
  },
  {
    targetName: 'Akrobatik',
    status: 'bounded',
    expectedDomains: ['xp', 'traits.counts'],
    workerRequired: true
  }
]) {
  test(`real removal preserves forced-safe parity for ${signature.targetName}`, async ({ page }) => {
    await seedCharacter(page);
    await waitForCharacter(page);
    const baseline = await prepareBaseline(page, signature.targetName);

    const safe = await runProductionRemoval(page, signature.targetName, true);
    const safeReloaded = await captureReloadedCore(page);

    await restoreBaseline(page, baseline);
    const optimized = await runProductionRemoval(page, signature.targetName, false);
    const optimizedReloaded = await captureReloadedCore(page);

    expect(safe.mode).toBe('full');
    expect(safe.reason).toBe('forced-safe-path');
    expect(optimized.mode).toBe('incremental-remove');
    expect(optimized.reason).toBe('single-entry-remove');
    expect(optimized.impact?.status).toBe(signature.status);
    expect(optimized.impact?.workerRequired).toBe(signature.workerRequired);
    expect(optimized.impact?.domains || []).toEqual(expect.arrayContaining(signature.expectedDomains));
    expect(optimized.core).toEqual(safe.core);
    expect(optimizedReloaded).toEqual(safeReloaded);

    if (!signature.workerRequired) {
      expect(optimized.versionDelta).toBe(0);
      expect(optimized.counters.derivedVersions || 0).toBe(0);
      expect(optimized.counters.workerRequests || 0).toBe(0);
      expect(optimized.counters.workerApplications || 0).toBe(0);
      expect(safe.versionDelta).toBeGreaterThan(0);
      expect(safe.counters.workerRequests || 0).toBeGreaterThan(0);
    } else {
      expect(optimized.versionDelta).toBeGreaterThan(0);
      expect(optimized.counters.workerRequests || 0).toBeGreaterThan(0);
      expect(optimized.counters.workerApplications || 0).toBeGreaterThan(0);
    }
  });
}

test('planner preserves canonical conservative reasons for list-wide, retained requirements, and custom state', async ({ page }) => {
  await seedCharacter(page);
  await waitForCharacter(page);
  const result = await page.evaluate(async () => {
    await window.catalogLoader?.ensureFullDatabase?.();
    const clone = value => JSON.parse(JSON.stringify(value));
    const lookup = async (name) => {
      let entry = window.lookupEntry?.({ name })
        || (window.DB || []).find(candidate => String(candidate?.namn || '').trim() === name);
      if (!entry) throw new Error(`Missing conservative planner fixture: ${name}`);
      entry = await window.catalogLoader?.ensureEntryData?.(entry) || entry;
      return clone(entry);
    };
    const money = () => ({ daler: 0, skilling: 0, 'örtegar': 0 });
    const makeStore = (id, entries) => ({
      current: id,
      characters: [{ id, name: id }],
      folders: [],
      data: {
        [id]: {
          list: entries.map((entry, index) => ({
            ...entry,
            nivå: Object.keys(entry.nivåer || {})[0] || entry.nivå || 'Novis',
            __uid: `${id}-${index}`,
            __order: index + 1
          })),
          inventory: [],
          custom: [],
          privMoney: money(),
          possessionMoney: money(),
          bonusMoney: money(),
          snapshotRules: [],
          revealedArtifacts: []
        }
      }
    });
    const primeAndPlan = (candidateStore, removeIndex) => {
      window.storeHelper.setCurrentList(
        candidateStore,
        window.storeHelper.getCurrentList(candidateStore)
      );
      const before = window.storeHelper.getCurrentList(candidateStore);
      const next = before.filter((_, index) => index !== removeIndex);
      return window.storeHelper.planCurrentListRemoval(candidateStore, next);
    };

    const akrobatik = await lookup('Akrobatik');
    const darkPast = await lookup('Mörkt förflutet');
    const shortLived = await lookup('Kortlivad');
    const listWide = primeAndPlan(makeStore('planner-list-wide', [darkPast, akrobatik]), 1);
    const retainedRequirement = primeAndPlan(
      makeStore('planner-retained-requirement', [akrobatik, shortLived]),
      0
    );
    const custom = primeAndPlan(makeStore('planner-custom', [{
      id: 'custom-derived-impact',
      namn: 'Custom derived impact',
      taggar: { typ: ['Hemmagjort'] }
    }]), 0);

    const summarize = plan => ({
      mode: plan?.mode || '',
      reason: plan?.reason || '',
      impactStatus: plan?.derivedImpact?.status || '',
      workerRequired: plan?.derivedImpact?.workerRequired !== false,
      impactReasons: plan?.derivedImpact?.reasons || []
    });
    return {
      listWide: summarize(listWide),
      retainedRequirement: summarize(retainedRequirement),
      custom: summarize(custom)
    };
  });

  expect(result.listWide).toMatchObject({
    mode: 'full',
    reason: 'list-wide-rule-dependency',
    workerRequired: true
  });
  expect(result.retainedRequirement).toMatchObject({
    mode: 'incremental-remove',
    reason: 'single-entry-remove',
    impactStatus: 'unknown',
    workerRequired: true
  });
  expect(result.retainedRequirement.impactReasons)
    .toContain('derived-impact-retained-requirement-dependency');
  expect(result.custom).toMatchObject({
    mode: 'full',
    reason: 'unstable-or-unclassified-entry-source',
    workerRequired: true
  });
});
