import { expect, test } from '@playwright/test';

async function expectOverlayLifecycleClean(page) {
  await expect.poll(() => page.evaluate(() => {
    const roots = [document, document.querySelector('shared-toolbar')?.shadowRoot].filter(Boolean);
    const stale = roots.flatMap(root => Array.from(root.querySelectorAll(
      '.popup, .offcanvas, .db-modal-overlay, .db-drawer'
    )).filter(element => (
      element.classList.contains('open')
      || element.classList.contains('db-modal--open')
      || element.classList.contains('db-drawer--open')
      || element.getAttribute('aria-hidden') === 'false'
    )).map(element => element.id || element.className));
    return {
      stale,
      managerTop: window.popupManager?.peekTop?.()?.id || '',
      bodyLocked: document.body.classList.contains('no-scroll'),
      bodyTop: document.body.style.top,
      bodyOverflow: document.body.style.overflow,
      viewInert: document.getElementById('view-root')?.hasAttribute('inert') || false,
      toolbarInert: document.querySelector('shared-toolbar')?.hasAttribute('inert') || false
    };
  })).toEqual({
    stale: [],
    managerTop: '',
    bodyLocked: false,
    bodyTop: '',
    bodyOverflow: '',
    viewInert: false,
    toolbarInert: false
  });
}

test('inventory and traits render after in-app route changes', async ({ page }) => {
  const metaState = {
    current: 'route-char',
    characters: [
      { id: 'route-char', name: 'Route Hero', folderId: 'fd-standard' }
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
    traits: {
      Diskret: 5,
      Kvick: 7,
      Listig: 9,
      Stark: 11,
      Träffsäker: 13,
      Vaksam: 15,
      Viljestark: 10,
      Övertygande: 8
    },
    notes: { background: 'Route test' },
    money: { daler: 3, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__routeSwitchSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__routeSwitchSeeded', '1');
  }, { metaState, characterState });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  await page.evaluate(() => {
    window.location.hash = '#/inventory';
  });
  await page.waitForFunction(() => document.body.dataset.role === 'inventory');
  // Dashboard content now lives in the toolbar shadow DOM; verify inventory view loaded
  await expect(page.locator('.inventory-panel')).toBeVisible();
  await expect(page.locator('#charName')).toContainText('Route Hero');

  await page.evaluate(() => {
    window.location.hash = '#/traits';
  });
  await page.waitForFunction(() => document.body.dataset.role === 'traits');
  await expect.poll(async () => (
    page.locator('#traits .trait').count()
  )).toBe(8);
  await expect(page.locator('#charName')).toContainText('Route Hero');
});

test('rapid drawer changes and stacked route teardown leave no blocking overlay state', async ({ page }) => {
  await page.goto('/#/index');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(document.querySelector('shared-toolbar')?.shadowRoot)
  ));

  await page.evaluate(() => {
    const toggle = document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('filterToggle');
    toggle?.click();
    toggle?.click();
    toggle?.click();
    window.location.hash = '#/inventory';
  });
  await page.waitForFunction(() => (
    document.body.dataset.role === 'inventory'
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
  ));
  await expectOverlayLifecycleClean(page);

  await page.locator('#overviewToggle').click();
  await expect(page.locator('#invDashPanel')).toBeVisible();
  await page.evaluate(() => { void window.alertPopup?.('Route teardown fixture'); });
  await expect(page.locator('#daub-dialog-modal')).toBeVisible();

  await page.evaluate(() => { window.location.hash = '#/traits'; });
  await page.waitForFunction(() => (
    document.body.dataset.role === 'traits'
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
  ));
  await expectOverlayLifecycleClean(page);
  await expect(page.locator('.trait[data-key="Diskret"] .trait-btn[data-d="1"]')).toBeEnabled();
});

test('trait controls apply each increment once after traits view initialization', async ({ page }) => {
  const metaState = {
    current: 'trait-increment-char',
    characters: [
      { id: 'trait-increment-char', name: 'Trait Increment Hero', folderId: 'fd-standard' }
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
    traits: {
      Diskret: 5,
      Kvick: 7,
      Listig: 9,
      Stark: 11,
      Träffsäker: 13,
      Vaksam: 14,
      Viljestark: 10,
      Övertygande: 8
    },
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });

  await page.goto('/#/traits');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const trait = page.locator('.trait[data-key="Diskret"]');
  await expect(trait.locator('.trait-label')).toHaveText('Diskret: 5');
  await page.evaluate(() => {
    const card = document.querySelector('.trait[data-key="Diskret"]');
    window.__traitFastPathProbe = {
      card,
      button: card?.querySelector('.trait-btn[data-d="1"]'),
      fullRenders: 0,
      effectsRenders: 0,
      refreshes: []
    };
    window.symbaroumViewBridge.registerViewHooks('traits', {
      refreshTraits: () => { window.__traitFastPathProbe.fullRenders += 1; },
      refreshEffects: () => { window.__traitFastPathProbe.effectsRenders += 1; }
    });
    const pipeline = window.symbaroumMutationPipeline;
    const originalSchedule = pipeline.scheduleCharacterRefresh;
    pipeline.scheduleCharacterRefresh = options => {
      window.__traitFastPathProbe.refreshes.push(options.invalidates || []);
      return originalSchedule(options);
    };
  });
  await trait.locator('.trait-btn[data-d="1"]').click();
  await expect(trait.locator('.trait-label')).toHaveText('Diskret: 6');
  const fastPath = await page.evaluate(async () => {
    await window.symbaroumMutationPipeline.waitForCharacterRefresh();
    const card = document.querySelector('.trait[data-key="Diskret"]');
    return {
      cardPreserved: card === window.__traitFastPathProbe.card,
      buttonPreserved: card?.querySelector('.trait-btn[data-d="1"]') === window.__traitFastPathProbe.button,
      fullRenders: window.__traitFastPathProbe.fullRenders,
      effectsRenders: window.__traitFastPathProbe.effectsRenders,
      refreshes: window.__traitFastPathProbe.refreshes
    };
  });
  expect(fastPath.cardPreserved).toBe(true);
  expect(fastPath.buttonPreserved).toBe(true);
  expect(fastPath.fullRenders).toBe(0);
  expect(fastPath.effectsRenders).toBe(0);
  expect(fastPath.refreshes).toHaveLength(1);
  expect(fastPath.refreshes[0]).toEqual(expect.arrayContaining(['traits.base', 'summary.traits']));
  expect(fastPath.refreshes[0]).not.toContain('effects');
  await trait.locator('.trait-btn[data-d="5"]').click();
  await expect(trait.locator('.trait-label')).toHaveText('Diskret: 11');
  await expect(page.locator('#summaryContent')).toHaveAttribute('data-summary-dirty', '1');
  await page.locator('[data-traits-tab="summary"]').click();
  const summaryTraitRow = page.locator('#summaryContent .summary-section').filter({ hasText: 'Karaktärsdrag' })
    .locator('li').filter({ hasText: 'Diskret' });
  await expect(summaryTraitRow.locator('.summary-value')).toHaveText('11');
  await expect(page.locator('#summaryContent')).not.toHaveAttribute('data-summary-dirty', '1');
});

test('all eight trait controls preserve keyed nodes for plus and minus one and five', async ({ page }) => {
  const metaState = {
    current: 'trait-matrix-char',
    characters: [{ id: 'trait-matrix-char', name: 'Trait Matrix Hero', folderId: 'fd-standard' }],
    folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
    activeFolder: 'ALL',
    filterUnion: false,
    compactEntries: true,
    onlySelected: false,
    recentSearches: [],
    liveMode: false,
    entrySort: 'alpha-asc'
  };
  const keys = ['Diskret', 'Kvick', 'Listig', 'Stark', 'Träffsäker', 'Vaksam', 'Viljestark', 'Övertygande'];
  const characterState = {
    list: [],
    inventory: [],
    custom: [],
    traits: Object.fromEntries(keys.map(key => [key, 10])),
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState: meta, characterState: character }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(meta));
    localStorage.setItem(`rpall-char-${meta.current}`, JSON.stringify(character));
  }, { metaState, characterState });
  await page.goto('/#/traits');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  for (const key of keys) {
    const trait = page.locator(`.trait[data-key="${key}"]`);
    const originalHandle = await trait.evaluate(card => {
      const id = Math.random().toString(36).slice(2);
      card.dataset.identityProbe = id;
      return id;
    });
    for (const [delta, expected] of [[1, 11], [-1, 10], [5, 15], [-5, 10]]) {
      await trait.locator(`.trait-btn[data-d="${delta}"]`).click();
      await expect(trait.locator('.trait-label')).toHaveText(`${key}: ${expected}`);
      await expect(trait).toHaveAttribute('data-identity-probe', originalHandle);
    }
  }
  await page.evaluate(() => window.symbaroumMutationPipeline.waitForCharacterRefresh());
  expect(await page.evaluate(() => window.storeHelper.getTraits(
    typeof store === 'object' && store ? store : window.storeHelper.load()
  ))).toEqual(Object.fromEntries(keys.map(key => [key, 10])));
});

test('five rapid trait clicks coalesce to one secondary refresh while applying every increment', async ({ page }) => {
  const metaState = {
    current: 'trait-burst-char',
    characters: [{ id: 'trait-burst-char', name: 'Trait Burst Hero', folderId: 'fd-standard' }],
    folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
    activeFolder: 'ALL', filterUnion: false, compactEntries: true, onlySelected: false,
    recentSearches: [], liveMode: false, entrySort: 'alpha-asc'
  };
  const characterState = {
    list: [], inventory: [], custom: [],
    traits: { Diskret: 5, Kvick: 10, Listig: 10, Stark: 10, Träffsäker: 10, Vaksam: 10, Viljestark: 10, Övertygande: 10 },
    notes: {}, money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };
  await page.addInitScript(({ metaState: meta, characterState: character }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(meta));
    localStorage.setItem(`rpall-char-${meta.current}`, JSON.stringify(character));
  }, { metaState, characterState });
  await page.goto('/#/traits');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    const hooks = window.symbaroumViewBridge.getViewHooks('traits');
    const original = hooks.refreshTraitTargets;
    window.__rapidTraitRefreshes = 0;
    window.symbaroumViewBridge.registerViewHooks('traits', {
      refreshTraitTargets: options => {
        window.__rapidTraitRefreshes += 1;
        return original(options);
      }
    });
  });

  const plus = page.locator('.trait[data-key="Diskret"] .trait-btn[data-d="1"]');
  await plus.click({ clickCount: 5, delay: 0 });
  await expect(page.locator('.trait[data-key="Diskret"] .trait-label')).toHaveText('Diskret: 10');
  await page.evaluate(() => window.symbaroumMutationPipeline.waitForCharacterRefresh());
  expect(await page.evaluate(() => window.__rapidTraitRefreshes)).toBe(1);
});

test('rule override dialog cancels or continues and is remembered for the character', async ({ page }) => {
  const metaState = {
    current: 'trait-override-char',
    characters: [
      { id: 'trait-override-char', name: 'Trait Override Hero', folderId: 'fd-standard' }
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
    traits: {
      Diskret: 15,
      Kvick: 14,
      Listig: 14,
      Stark: 10,
      Träffsäker: 10,
      Vaksam: 10,
      Viljestark: 10,
      Övertygande: 10
    },
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__ruleOverrideSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__ruleOverrideSeeded', '1');
  }, { metaState, characterState });

  await page.goto('/#/traits');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const kvick = page.locator('.trait[data-key="Kvick"]');
  await kvick.locator('.trait-btn[data-d="1"]').click();

  const dialog = page.locator('#daub-dialog-modal');
  const cancel = dialog.locator('[data-dialog-action="cancel"]');
  const proceed = dialog.locator('[data-dialog-action="ok"]');
  await expect(dialog).toBeVisible();
  await expect(cancel).toHaveText('Avbryt');
  await expect(proceed).toHaveText('Fortsätt');
  const cancelBox = await cancel.boundingBox();
  const proceedBox = await proceed.boundingBox();
  expect(cancelBox?.x).toBeLessThan(proceedBox?.x ?? 0);

  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(kvick.locator('.trait-label')).toHaveText('Kvick: 14');

  await kvick.locator('.trait-btn[data-d="1"]').click();
  await proceed.click();
  await expect(dialog).toBeHidden();
  await expect(kvick.locator('.trait-label')).toHaveText('Kvick: 15');
  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-rule-override' }));
  await expect.poll(() => page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return window.storeHelper.getRuleOverrides(activeStore);
  })).toContain('trait:multiple-base-values-15');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const listig = page.locator('.trait[data-key="Listig"]');
  await listig.locator('.trait-btn[data-d="1"]').click();
  await expect(listig.locator('.trait-label')).toHaveText('Listig: 15');
  await expect(dialog).toBeHidden();
});

test('trait count opens index with only-selected and trait filters', async ({ page }) => {
  const metaState = {
    current: 'trait-filter-char',
    characters: [
      { id: 'trait-filter-char', name: 'Trait Filter Hero', folderId: 'fd-standard' }
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
    traits: {
      Diskret: 5,
      Kvick: 7,
      Listig: 9,
      Stark: 11,
      Träffsäker: 13,
      Vaksam: 15,
      Viljestark: 10,
      Övertygande: 8
    },
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = window.lookupEntry?.({ name: 'Alkemist' });
    if (!entry) throw new Error('Missing Listig test entry.');
    window.storeHelper.setCurrentList(activeStore, [{ ...JSON.parse(JSON.stringify(entry)), nivå: 'Novis' }]);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-trait-filter' });
  });

  await page.evaluate(() => {
    window.location.hash = '#/traits';
  });
  await page.waitForFunction(() => document.body.dataset.role === 'traits');
  await expect(page.locator('.trait[data-key="Listig"] .trait-count')).toContainText('Förmågor: 1');

  await page.locator('.trait[data-key="Listig"] .trait-count').click();
  await page.waitForFunction(() => document.body.dataset.role === 'index');
  await expect(page.locator('#activeFilters')).toContainText('Endast valda');
  await expect(page.locator('#activeFilters')).toContainText('Karaktärsdrag: Listig');
});
