import { expect, test } from '@playwright/test';

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

async function seedProfileStore(page) {
  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__addProfileSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__addProfileSeeded', '1');
  }, { metaState, characterState });
}

async function readCompletedAddScenario(page) {
  await page.waitForFunction(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    return Boolean(snapshot?.scenarios?.some((entry) => entry.name === 'add-item-to-character' && entry.status === 'completed'));
  });

  return page.evaluate(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    const matches = (snapshot?.scenarios || []).filter((entry) => entry.name === 'add-item-to-character' && entry.status === 'completed');
    return matches[matches.length - 1] || null;
  });
}

async function clickProfileTarget(page, kind) {
  return page.evaluate((targetKind) => {
    const listTypes = new Set(['Förmåga', 'Basförmåga', 'Särdrag', 'Fördel', 'Nackdel', 'Mystisk kraft', 'Ritual']);
    const preferredName = targetKind === 'inventory' ? 'Dubbel ringbrynja' : 'Akrobatik';
    const buttons = Array.from(document.querySelectorAll('#lista button.add-btn'));
    const visible = buttons.filter((button) => {
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    }).map((button) => {
      const card = button.closest('li');
      const id = button.dataset.id || card?.dataset?.id || '';
      const name = button.dataset.name || card?.dataset?.name || '';
      const entry = typeof window.lookupEntry === 'function'
        ? window.lookupEntry({ id: id || undefined, name })
        : null;
      const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      return {
        button,
        name: name || entry?.namn || '',
        types,
        isInventory: typeof window.isInv === 'function' ? Boolean(window.isInv(entry)) : false,
        isEmployment: typeof window.isEmployment === 'function' ? Boolean(window.isEmployment(entry)) : false,
        isService: typeof window.isService === 'function' ? Boolean(window.isService(entry)) : false,
        isHidden: typeof window.storeHelper?.isSearchHiddenEntry === 'function'
          ? Boolean(window.storeHelper.isSearchHiddenEntry(entry))
          : false,
        isArtifact: types.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()))
      };
    });

    const preferred = visible.find((item) => item.name === preferredName);
    const fallback = targetKind === 'inventory'
      ? visible.find((item) => item.isInventory && !item.isHidden && !item.isArtifact) || visible.find((item) => item.isInventory)
      : visible.find((item) => (
        !item.isInventory
        && !item.isEmployment
        && !item.isService
        && item.types.some((type) => listTypes.has(String(type || '').trim()))
      ));
    const target = preferred || fallback || null;
    if (!target?.button) return null;
    target.button.click();
    return target.name;
  }, kind);
}

test('add-item profiling records staged breakdown for inventory adds', async ({ page }) => {
  await seedProfileStore(page);

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });

  const clicked = await clickProfileTarget(page, 'inventory');
  expect(clicked).toBeTruthy();

  const scenario = await readCompletedAddScenario(page);
  expect(scenario?.detail?.entry).toBeTruthy();
  expect(scenario?.detail?.profile).toBeTruthy();
  expect(scenario?.detail?.branch).toBe('inventory');
  expect(scenario?.detail?.renderMode).toBe('incremental');

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
  const indexDomPatches = stages.filter((entry) => entry.name === 'dom-patch' && entry.detail?.surface === 'index');
  expect(indexDomPatches).toHaveLength(0);
});

test('add-item profiling records incremental list adds without a full index rerender', async ({ page }) => {
  await seedProfileStore(page);

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });

  const clicked = await clickProfileTarget(page, 'list');
  expect(clicked).toBe('Akrobatik');

  const scenario = await readCompletedAddScenario(page);
  expect(scenario?.detail?.entry).toBeTruthy();
  expect(scenario?.detail?.profile).toBeTruthy();
  expect(scenario?.detail?.branch).toBe('list');
  expect(scenario?.detail?.renderMode).toBe('incremental');

  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);
  expect(stageNames).toEqual(expect.arrayContaining([
    'form-serialization',
    'store-mutation',
    'worker-round-trip',
    'derived-totals-recompute'
  ]));
  expect(stageNames).not.toContain('sort-group-rebuild');
  expect(stageNames).not.toContain('dom-patch');
});
