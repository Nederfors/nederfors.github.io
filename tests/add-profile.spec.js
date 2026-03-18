import { expect, test } from '@playwright/test';

test('add-item profiling records staged breakdown for inventory adds', async ({ page }) => {
  const metaState = {
    current: 'profile-char',
    characters: [
      { id: 'profile-char', name: 'Profile Hero', folderId: 'fd-standard' }
    ],
    folders: [
      { id: 'fd-standard', name: 'Standard', order: 0, system: true }
    ],
    activeFolder: 'ALL',
    filterUnion: false,
    compactEntries: true,
    onlySelected: false,
    recentSearches: [],
    liveMode: false,
    entrySort: 'alpha-asc'
  };

  const characterState = {
    list: [],
    inventory: [],
    custom: [],
    notes: {},
    money: { daler: 5, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__addProfileSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__addProfileSeeded', '1');
  }, { metaState, characterState });

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });

  const clicked = await page.evaluate(() => {
    const inventoryTypes = new Set([
      'Vapen',
      'Närstridsvapen',
      'Avståndsvapen',
      'Sköld',
      'Rustning',
      'Lägre Artefakt',
      'Artefakt',
      'Färdmedel',
      'Kuriositet',
      'Utrustning'
    ]);
    const buttons = Array.from(document.querySelectorAll('#lista button.add-btn'));
    const visible = buttons.filter((button) => {
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    });
    const target = visible.find((button) => {
      const card = button.closest('li');
      const id = button.dataset.id || card?.dataset?.id || '';
      const name = button.dataset.name || card?.dataset?.name || '';
      const entry = typeof window.lookupEntry === 'function'
        ? window.lookupEntry({ id: id || undefined, name })
        : null;
      const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      const isInventory = typeof window.isInv === 'function'
        ? Boolean(window.isInv(entry))
        : types.some((type) => inventoryTypes.has(String(type || '').trim()));
      return isInventory;
    });
    if (!target) return null;
    target.click();
    return target.dataset.name || target.closest('li')?.dataset?.name || null;
  });

  expect(clicked).not.toBeNull();

  await page.waitForFunction(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    return Boolean(snapshot?.scenarios?.some((entry) => entry.name === 'add-item-to-character' && entry.status === 'completed'));
  });

  const scenario = await page.evaluate(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    const matches = (snapshot?.scenarios || []).filter((entry) => entry.name === 'add-item-to-character' && entry.status === 'completed');
    return matches[matches.length - 1] || null;
  });

  expect(scenario?.detail?.entry).toBeTruthy();
  expect(scenario?.detail?.profile).toBeTruthy();

  const checkpointNames = (scenario?.detail?.profile?.checkpoints || []).map((entry) => entry.name);
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);

  expect(checkpointNames).toEqual(expect.arrayContaining([
    'click-handler-start',
    'dexie-flush-scheduled',
    'post-render-paint-complete'
  ]));
  expect(stageNames).toEqual(expect.arrayContaining([
    'form-serialization',
    'store-mutation',
    'worker-round-trip',
    'derived-totals-recompute',
    'sort-group-rebuild',
    'dom-patch'
  ]));

  const stages = scenario?.detail?.profile?.stages || [];
  const derivedRuns = stages.filter((entry) => entry.name === 'derived-totals-recompute');
  const workerRuns = stages.filter((entry) => entry.name === 'worker-round-trip');
  const indexDomPatches = stages.filter((entry) => entry.name === 'dom-patch' && entry.detail?.surface === 'index');

  expect(derivedRuns).toHaveLength(1);
  expect(workerRuns).toHaveLength(1);
  expect(indexDomPatches).toHaveLength(0);
});
