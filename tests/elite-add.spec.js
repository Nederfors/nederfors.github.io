import { expect, test } from '@playwright/test';

const CHAR_ID = 'elite-add-char';

const metaState = {
  current: CHAR_ID,
  characters: [
    { id: CHAR_ID, name: 'Elite Add Hero' }
  ],
  folders: [],
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
  custom: []
};

async function seedStore(page) {
  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__eliteAddSeeded') === '1') return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__eliteAddSeeded', '1');
  }, { metaState, characterState });
}

async function waitForApp(page) {
  await page.goto('/#/index');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && document.body.dataset.role === 'index'
  ));
}

async function openLazyEliteBuilder(page, name = 'Järnsvuren') {
  const initialEntryState = await page.evaluate(entryName => {
    const entry = window.lookupEntry?.({ name: entryName });
    return {
      summary: Boolean(entry?.__catalogSummary),
      hasRequirements: Boolean(entry?.elite_requirements || entry?.krav)
    };
  }, name);
  expect(initialEntryState).toEqual({ summary: true, hasRequirements: false });

  await page.getByText('Elityrken', { exact: true }).click();
  const requirementButton = page.locator(`button[data-elite-req="${name}"]`);
  await requirementButton.waitFor({ state: 'visible' });
  await expect.poll(() => page.evaluate(entryName => {
    const entry = window.lookupEntry?.({ name: entryName });
    return Boolean(!entry?.__catalogSummary && (entry?.elite_requirements || entry?.krav));
  }, name)).toBe(true);
  const searchField = page.locator('shared-toolbar').locator('#searchField');
  await searchField.fill(name);
  await searchField.press('Enter');
  await requirementButton.waitFor({ state: 'visible' });
  await page.waitForFunction(() => typeof window.ensureEliteAdd === 'function');
  await requirementButton.click();
  await expect(page.locator('#masterPopup')).toBeVisible({ timeout: 15000 });
}

async function completeEliteBuilder(page) {
  const popup = page.locator('#masterPopup');
  const addButton = popup.locator('#masterAdd');

  for (let attempt = 0; attempt < 80 && !(await addButton.isEnabled()); attempt += 1) {
    const selects = popup.locator('select:visible:not(:disabled)');
    const count = await selects.count();
    let changed = false;

    for (let index = 0; index < count; index += 1) {
      const select = selects.nth(index);
      const choice = await select.evaluate(element => {
        const options = [...element.options]
          .filter(option => !option.disabled && option.value && option.value !== 'skip');
        if (!options.length) return '';

        const values = options.map(option => option.value);
        const isLevel = element.matches('select.level, select[data-name]');
        if (isLevel && values.includes('Mästare') && element.value !== 'Mästare') return 'Mästare';
        if (element.matches('select[data-benefit-qty]')) {
          const value = values.at(-1) || '';
          return element.value === value ? '' : value;
        }
        if (!element.value || element.value === 'skip') return values[0] || '';
        return '';
      });

      if (!choice) continue;
      await select.selectOption(choice);
      changed = true;
      break;
    }

    if (!changed) break;
  }

  const builderState = await popup.evaluate(element => ({
    addDisabled: element.querySelector('#masterAdd')?.disabled ?? true,
    groups: [...element.querySelectorAll('.master-group[data-group-card]')].map(group => ({
      source: group.getAttribute('data-group-source') || '',
      state: group.getAttribute('data-state') || '',
      count: group.querySelector('.master-group-count')?.textContent?.trim() || ''
    }))
  }));

  expect(builderState.groups.length).toBeGreaterThan(0);
  expect(builderState.groups.every(group => group.state === 'ok'), JSON.stringify(builderState.groups)).toBe(true);
  expect(builderState.addDisabled, JSON.stringify(builderState.groups)).toBe(false);
  await addButton.click();
}

async function readCurrentList(page) {
  return page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    return window.storeHelper.getCurrentList(activeStore).map(entry => ({
      id: entry.id || '',
      name: entry.namn || entry.name || '',
      level: entry.nivå || ''
    }));
  });
}

test('elite requirement button opens the elite builder popup', async ({ page }) => {
  await seedStore(page);
  await waitForApp(page);
  await openLazyEliteBuilder(page);

  const popupState = await page.evaluate(() => ({
    masterOpen: Boolean(document.getElementById('masterPopup')?.classList.contains('open')),
    charOpen: Boolean(document.getElementById('charPopup')?.classList.contains('open')),
    topPopupId: window.popupManager?.peekTop?.()?.id || null,
    popupGroups: document.querySelectorAll('#masterPopup .master-group').length
  }));

  expect(popupState.masterOpen).toBe(true);
  expect(popupState.charOpen).toBe(false);
  expect(popupState.topPopupId).toBe('masterPopup');
  expect(popupState.popupGroups).toBeGreaterThan(0);

  const masterPopup = page.locator('#masterPopup');
  await expect(masterPopup.locator('.db-modal__header .db-modal__close#masterCancel')).toHaveCount(1);
  await expect(masterPopup.locator('.db-modal__footer #masterCancel')).toHaveCount(0);
  await masterPopup.click({ position: { x: 5, y: 5 } });
  await expect(masterPopup).toBeHidden();
});

test('lazy-loaded elite builder adds requirements and persists the completed elite profession', async ({ page }) => {
  await seedStore(page);
  await waitForApp(page);
  await openLazyEliteBuilder(page);
  await completeEliteBuilder(page);

  await expect.poll(async () => {
    const list = await readCurrentList(page);
    return list.find(entry => entry.id === 'elit1')?.name || '';
  }).toBe('Järnsvuren');

  const beforeReload = await readCurrentList(page);
  expect(beforeReload.filter(entry => entry.id === 'elit1')).toHaveLength(1);
  expect(beforeReload.some(entry => entry.id !== 'elit1' && entry.level)).toBe(true);

  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'elite-add-acceptance' }));
  await page.reload();
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && document.body.dataset.role === 'index'
  ));

  const afterReload = await readCurrentList(page);
  expect(afterReload).toEqual(beforeReload);
});
