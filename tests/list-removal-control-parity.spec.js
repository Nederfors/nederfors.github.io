import { expect, test } from '@playwright/test';

const CHAR_ID = 'list-removal-control-parity';
const TARGET_NAME = 'Akrobatik';

async function seedCharacter(page) {
  await page.addInitScript(({ charId }) => {
    if (localStorage.getItem('list-removal-control-parity-seeded') === '1') return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('list-removal-control-parity-seeded', '1');
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: charId,
      characters: [{ id: charId, name: 'Removal parity', folderId: 'fd-standard' }],
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
        Kvick: 10,
        Listig: 10,
        Stark: 10,
        Träffsäker: 10,
        Vaksam: 10,
        Viljestark: 10,
        Övertygande: 10
      },
      privMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
      possessionMoney: { daler: 0, skilling: 0, 'örtegar': 0 },
      bonusMoney: { daler: 0, skilling: 0, 'örtegar': 0 }
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

async function prepareBaseline(page) {
  return page.evaluate(async () => {
    await window.catalogLoader?.ensureFullDatabase?.();
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const names = ['Akrobatik', 'Arkivarie', 'Impulsiv', 'Robust'];
    const clone = value => JSON.parse(JSON.stringify(value));
    const entries = names.map((name) => {
      const catalogEntry = window.lookupEntry?.({ name })
        || (window.DB || []).find(entry => String(entry?.namn || '').trim() === name);
      if (!catalogEntry) throw new Error(`Missing list-removal parity entry: ${name}`);
      return { ...clone(catalogEntry), nivå: 'Novis' };
    });
    window.__symbaroumPerfForceSafeListMutations = true;
    window.storeHelper.setCurrentList(activeStore, entries);
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
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'list-removal-parity-baseline' });
    return clone(window.storeHelper.getCurrentList(activeStore));
  });
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
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'list-removal-parity-restore' });
  }, baseline);
}

async function clickCompleteRemoval(page, forceSafe) {
  await page.evaluate((enabled) => {
    window.__symbaroumPerfForceSafeListMutations = enabled;
  }, forceSafe);
  await page.evaluate((name) => {
    const card = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .find(candidate => String(candidate?.dataset?.name || '').trim() === name);
    const button = card?.querySelector('button[data-act="del"], button[data-act="rem"]');
    if (!button) throw new Error(`Missing production complete-removal control for ${name}`);
    button.click();
  }, TARGET_NAME);
  await expect.poll(async () => page.evaluate((name) => (
    !window.storeHelper.getCurrentList(
      typeof store === 'object' && store ? store : window.storeHelper.load()
    ).some(entry => String(entry?.namn || '').trim() === name)
  ), TARGET_NAME)).toBe(true);
}

async function captureConsistentState(page, reason) {
  return page.evaluate(async (flushReason) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: flushReason });
    await window.symbaroumPerf?.afterNextPaint?.(2);
    const clone = value => JSON.parse(JSON.stringify(value));
    const list = window.storeHelper.getCurrentList(activeStore);
    const traits = window.storeHelper.getTraits(activeStore);
    const cards = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .map(card => ({
        id: card.dataset.id || '',
        uid: card.dataset.uid || '',
        name: card.dataset.name || '',
        trait: card.dataset.trait || '',
        text: card.textContent.replace(/\s+/g, ' ').trim()
      }));
    const summary = window.storeHelper.getLastCurrentListMutationSummary(activeStore);
    return {
      core: {
        list: clone(list),
        inventory: clone(window.storeHelper.getInventory(activeStore)),
        revealedArtifacts: clone(window.storeHelper.getRevealedArtifacts(activeStore)),
        artifactEffects: clone(window.storeHelper.getArtifactEffects(activeStore)),
        snapshotRules: clone(window.storeHelper.getSnapshotRuleRecords(activeStore)),
        derived: {
          traits: clone(traits),
          usedXp: window.storeHelper.calcUsedXP(list),
          permanentCorruption: window.storeHelper.calcPermanentCorruption(list),
          carryCapacity: window.storeHelper.calcCarryCapacity(Number(traits?.Stark || 0), list),
          toughness: window.storeHelper.calcToughness(Number(traits?.Stark || 0), list),
          painThreshold: window.storeHelper.calcPainThreshold(Number(traits?.Stark || 0), list)
        },
        cards
      },
      mode: summary?.reconciliationMode || '',
      reason: summary?.reconciliationReason || ''
    };
  }, reason);
}

test('real character complete-removal control matches forced-safe state, rendering, persistence, and reload', async ({ page }) => {
  await seedCharacter(page);
  await waitForCharacter(page);
  const baseline = await prepareBaseline(page);

  await clickCompleteRemoval(page, true);
  const safe = await captureConsistentState(page, 'list-removal-parity-safe');

  await restoreBaseline(page, baseline);
  await clickCompleteRemoval(page, false);
  const optimized = await captureConsistentState(page, 'list-removal-parity-optimized');

  expect(safe.mode).toBe('full');
  expect(safe.reason).toBe('forced-safe-path');
  expect(optimized.mode).toBe('incremental-remove');
  expect(optimized.reason).toBe('single-entry-remove');
  expect(optimized.core).toEqual(safe.core);

  await page.reload();
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(document.querySelector('#valda'))
  ));
  const reloaded = await captureConsistentState(page, 'list-removal-parity-reload');
  expect(reloaded.core).toEqual(optimized.core);
});
