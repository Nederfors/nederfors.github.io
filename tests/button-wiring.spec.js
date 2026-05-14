import { expect, test } from '@playwright/test';

const TRAITS = {
  Diskret: 15,
  Kvick: 12,
  Listig: 11,
  Stark: 9,
  Träffsäker: 14,
  Vaksam: 13,
  Viljestark: 8,
  Övertygande: 7
};

const makeMetaState = () => ({
  current: 'button-main',
  characters: [
    { id: 'button-main', name: 'Button Main', folderId: 'fd-standard' },
    { id: 'button-folder-a', name: 'Folder A', folderId: 'fd-clear' },
    { id: 'button-folder-b', name: 'Folder B', folderId: 'fd-clear' }
  ],
  folders: [
    { id: 'fd-standard', name: 'Standard', order: 0, system: true },
    { id: 'fd-clear', name: 'Clear Target', order: 1 }
  ],
  activeFolder: 'ALL',
  filterUnion: false,
  compactEntries: true,
  onlySelected: false,
  recentSearches: [],
  liveMode: false,
  entrySort: 'alpha-asc'
});

const makeCharacterState = () => ({
  baseXp: 20,
  list: [
    {
      id: 'button-ability',
      namn: 'Button Ability',
      nivå: 'Novis',
      taggar: { typ: ['Förmåga'], test: ['Listig'] }
    },
    {
      id: 'button-sword',
      namn: 'Button Sword',
      antal: 1,
      taggar: { typ: ['Vapen'] }
    }
  ],
  inventory: [
    {
      id: 'button-rope',
      name: 'Button Rope',
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      taggar: { typ: ['Diverse'] }
    }
  ],
  custom: [],
  traits: { ...TRAITS },
  notes: {
    background: 'Seeded background',
    shadow: 'Seeded shadow'
  },
  money: { daler: 4, skilling: 2, 'örtegar': 1 }
});

async function seedButtonStore(page, { preserveAfterReload = false } = {}) {
  const metaState = makeMetaState();
  const characterState = makeCharacterState();
  const emptyState = {
    list: [],
    inventory: [],
    custom: [],
    traits: { ...TRAITS },
    notes: {},
    money: { daler: 0, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState, emptyState, preserveAfterReload }) => {
    if (preserveAfterReload && sessionStorage.getItem('__buttonWiringSeeded') === '1') return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    localStorage.setItem('rpall-char-button-folder-a', JSON.stringify(emptyState));
    localStorage.setItem('rpall-char-button-folder-b', JSON.stringify(emptyState));
    if (preserveAfterReload) sessionStorage.setItem('__buttonWiringSeeded', '1');
  }, { metaState, characterState, emptyState, preserveAfterReload });
}

async function waitForApp(page, route) {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
}

async function installClickRecorder(page) {
  await page.addInitScript(() => {
    if (window.__buttonWiringRecorderInstalled) return;
    window.__buttonWiringRecorderInstalled = true;
    const clickListeners = new WeakMap();
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'click') {
        clickListeners.set(this, (clickListeners.get(this) || 0) + 1);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
    window.__buttonWiringClickCount = target => clickListeners.get(target) || 0;
  });
}

async function collectUnhandledVisibleButtons(page) {
  return page.evaluate(() => {
    const delegatedIds = new Set([
      'catToggle',
      'xpToggle',
      'filterToggle',
      'collapseAllFilters',
      'newCharBtn',
      'characterToolsBtn',
      'driveStorageBtn',
      'pdfLibraryBtn',
      'checkForUpdates',
      'deleteChar',
      'infoToggle',
      'clearNonInv',
      'resetTraits',
      'manageItemsBtn',
      'manageEconomyBtn',
      'invDashFloatBtn',
      'editBtn',
      'clearBtn',
      'conflictClose'
    ]);
    const delegatedClasses = [
      'db-chip__close',
      'collapse-btn',
      'summary-chip-btn',
      'trait-btn',
      'trait-count'
    ];
    const delegatedDataKeys = [
      'act',
      'action',
      'close',
      'factor',
      'clearFilters',
      'dashTrigger',
      'd',
      'eliteReq',
      'info',
      'loadMoreCat',
      'skadetypSwitcherTab'
    ];

    const roots = [];
    const addRoot = (root, label) => {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      roots.push({ root, label });
      root.querySelectorAll('*').forEach(node => {
        if (node.shadowRoot) addRoot(node.shadowRoot, `${node.localName}${node.id ? `#${node.id}` : ''}`);
      });
    };
    addRoot(document, 'document');

    const isVisible = button => {
      if (!(button instanceof HTMLElement)) return false;
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none';
    };

    const clickCount = target => window.__buttonWiringClickCount?.(target) || 0;
    const hasClickAncestor = button => {
      let current = button.parentNode;
      while (current) {
        if (clickCount(current) > 0) return true;
        current = current.parentNode || current.host || null;
      }
      return clickCount(document) > 0 || clickCount(window) > 0;
    };

    const isRecognizedDelegatedButton = button => {
      if (button.id && delegatedIds.has(button.id)) return true;
      if (delegatedClasses.some(className => button.classList.contains(className))) return true;
      return delegatedDataKeys.some(key => {
        const value = button.dataset?.[key];
        return value !== undefined && value !== null && value !== '';
      });
    };

    const rows = [];
    roots.forEach(({ root, label }) => {
      root.querySelectorAll('button').forEach(button => {
        if (!isVisible(button)) return;
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;

        const type = (button.getAttribute('type') || button.type || '').toLowerCase();
        const wiredDirectly = clickCount(button) > 0 || typeof button.onclick === 'function';
        const wiredByForm = type === 'submit' && Boolean(button.form);
        const wiredByDelegation = isRecognizedDelegatedButton(button) && hasClickAncestor(button);
        if (wiredDirectly || wiredByForm || wiredByDelegation) return;

        rows.push({
          route: document.body?.dataset?.role || location.hash || location.pathname,
          root: label,
          id: button.id || '',
          text: String(button.textContent || '').replace(/\s+/g, ' ').trim(),
          title: button.getAttribute('title') || button.getAttribute('aria-label') || '',
          className: button.className || '',
          data: { ...button.dataset }
        });
      });
    });
    return rows;
  });
}

test('visible enabled buttons on core routes have recognized wiring', async ({ page }) => {
  await installClickRecorder(page);
  await seedButtonStore(page);

  const routes = ['/#/index', '/#/character', '/#/inventory', '/#/notes', '/#/traits'];
  const failures = [];
  for (const route of routes) {
    await waitForApp(page, route);
    failures.push(...await collectUnhandledVisibleButtons(page));
  }

  expect(failures).toEqual([]);
});

test('clear/reset buttons mutate only their intended state', async ({ page }) => {
  await seedButtonStore(page);

  await waitForApp(page, '/#/character');
  await page.evaluate(() => { window.confirmPopup = async () => true; });
  await page.locator('#clearNonInv').click();
  await expect.poll(() => page.evaluate(() => (
    window.storeHelper.getCurrentList(window.storeHelper.load()).map(entry => entry.namn || entry.name)
  ))).toEqual(['Button Sword']);

  await page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    window.storeHelper.setCurrentList(activeStore, [
      {
        id: 'button-ability',
        namn: 'Button Ability',
        nivå: 'Novis',
        taggar: { typ: ['Förmåga'], test: ['Listig'] }
      },
      {
        id: 'button-sword',
        namn: 'Button Sword',
        antal: 1,
        taggar: { typ: ['Vapen'] }
      }
    ]);
  });

  await page.evaluate(() => { window.location.hash = '#/inventory'; });
  await page.waitForFunction(() => document.body.dataset.role === 'inventory');
  await page.evaluate(() => { window.confirmPopup = async () => true; });
  await page.locator('#clearInvBtn').evaluate(button => button.click());
  await expect.poll(() => page.evaluate(() => (
    window.storeHelper.getInventory(window.storeHelper.load()).length
  ))).toBe(0);

  await page.evaluate(() => { window.location.hash = '#/traits'; });
  await page.waitForFunction(() => document.body.dataset.role === 'traits');
  await page.evaluate(() => { window.confirmPopup = async () => true; });
  await page.locator('#resetTraits').click();
  await expect.poll(() => page.evaluate(() => {
    const traits = window.storeHelper.getTraits(window.storeHelper.load());
    return Object.values(traits).every(value => value === 10);
  })).toBe(true);

  await page.evaluate(() => { window.location.hash = '#/notes'; });
  await page.waitForFunction(() => document.body.dataset.role === 'notes');
  await page.evaluate(() => { window.confirmPopup = async () => true; });
  await page.locator('#editBtn').click();
  await page.locator('#background').fill('Temporary notes');
  await page.locator('#clearBtn').click();
  await expect(page.locator('#background')).toHaveValue('');
  await expect(page.locator('#shadow')).toHaveValue('');
});

test('folder clear removes only characters in the selected folder', async ({ page }) => {
  await seedButtonStore(page);
  await waitForApp(page, '/#/character');
  await page.evaluate(() => {
    window.confirmPopup = async () => true;
    window.openCharacterToolsPopup('folders');
  });

  const folderPopup = page.locator('#characterToolsPopup');
  await expect(folderPopup).toBeVisible();
  await folderPopup.locator('[data-id="fd-clear"] button[data-action="clear"]').click();

  await expect.poll(() => page.evaluate(() => (
    window.storeHelper.load().characters.map(character => character.id).sort()
  ))).toEqual(['button-main']);
});

test('no-results clear-filters button resets the index view', async ({ page }) => {
  await seedButtonStore(page, { preserveAfterReload: true });
  await waitForApp(page, '/#/index');

  await page.locator('#searchField').fill('zzzz-no-button-result');
  await page.locator('#searchField').press('Enter');
  await expect(page.locator('button[data-clear-filters="1"]')).toBeVisible();
  await page.evaluate(() => {
    window.symbaroumUiPrefs.setItem('indexViewState', JSON.stringify({ search: 'persisted-filter-state' }));
    window.storeHelper.setOnlySelected(window.storeHelper.load(), true);
  });

  await page.locator('button[data-clear-filters="1"]').evaluate(button => button.click());
  await expect(page.locator('button[data-clear-filters="1"]')).toHaveCount(0);
  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.symbaroumUiPrefs.getItem('indexViewState');
      if (!raw) return [];
      return JSON.parse(raw)?.filters?.search || [];
    });
  }, { timeout: 10000 }).toEqual([]);
  await expect.poll(async () => {
    return page.evaluate(() => (
      window.storeHelper.getOnlySelected(window.storeHelper.load())
    ));
  }, { timeout: 10000 }).toBe(false);
});
