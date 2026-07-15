import { expect, test } from '@playwright/test';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

async function waitForApp(page, route = '/#/index') {
  await page.goto(route);
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
  ));
  await expect(page.locator('shared-toolbar')).toHaveCount(1);
}

async function deepActiveId(page) {
  return page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active?.id || '';
  });
}

async function settleFocusFrames(page) {
  await page.evaluate(() => new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));
}

async function getFocusBoundaries(locator) {
  return locator.evaluate((surface, selector) => {
    const focusable = Array.from(surface.querySelectorAll(selector)).filter(element => {
      if (!(element instanceof HTMLElement) || element.closest('[inert]')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && element.getClientRects().length > 0;
    });
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first?.id) first.id = 'test-first-focus-boundary';
    if (!last?.id) last.id = 'test-last-focus-boundary';
    return { first: first?.id || '', last: last?.id || '' };
  }, FOCUSABLE_SELECTOR);
}

test('landmarks, skip links, search, Notes, and party controls expose accessibility contracts', async ({ page }) => {
  await waitForApp(page);

  const main = page.locator('main#view-root');
  await expect(main).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#skip-to-content')).toHaveText('Hoppa till innehåll');
  await expect(page.locator('#skip-to-search')).toHaveText('Hoppa till sök');

  await page.locator('#skip-to-content').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => deepActiveId(page)).toBe('view-root');

  const search = page.locator('#searchField');
  await expect(search).toHaveAttribute('role', 'combobox');
  await expect(search).toHaveAttribute('aria-autocomplete', 'list');
  await expect(search).toHaveAttribute('aria-controls', 'searchSuggest');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#searchSuggest')).toHaveAttribute('role', 'listbox');

  await page.evaluate(() => { window.location.hash = '#/notes'; });
  await page.waitForFunction(() => (
    document.body.dataset.role === 'notes'
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
    && Boolean(document.querySelector('#characterForm textarea'))
  ));
  await expect.poll(() => deepActiveId(page)).toBe('view-root');

  const noteLabels = await page.locator('#characterForm textarea').evaluateAll(textareas => (
    textareas.map(textarea => {
      const labelId = textarea.getAttribute('aria-labelledby') || '';
      const label = labelId ? document.getElementById(labelId) : null;
      return {
        id: textarea.id,
        labelId,
        label: String(label?.textContent || '').trim()
      };
    })
  ));
  expect(noteLabels.length).toBeGreaterThan(0);
  expect(noteLabels.every(item => item.id && item.labelId && item.label)).toBe(true);

  await page.locator('#filterToggle').click();
  await expect(page.locator('#filterPanel')).toBeVisible();
  const partyControls = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    return ['partySmith', 'partyAlchemist', 'partyArtefacter'].map(id => {
      const control = root?.getElementById(id);
      return {
        id,
        name: control?.getAttribute('aria-label') || '',
        pressed: control?.getAttribute('aria-pressed') || ''
      };
    });
  });
  expect(partyControls.every(control => control.name)).toBe(true);
  expect(partyControls.every(control => ['true', 'false'].includes(control.pressed))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#filterPanel')).toBeHidden();
  await settleFocusFrames(page);

  await page.locator('#skip-to-search').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => deepActiveId(page)).toBe('searchField');
});

test('search suggestions expose dynamic listbox state and support keyboard selection', async ({ page }) => {
  await waitForApp(page, '/#/index');

  const search = page.locator('shared-toolbar').locator('#searchField');
  const listbox = page.locator('shared-toolbar').locator('#searchSuggest');
  await search.fill('Akrobat');

  await expect(listbox).toBeVisible();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  const options = listbox.locator('[role="option"]');
  await expect(options).not.toHaveCount(0);
  await expect(options.first()).toContainText('Akrobatik');
  await expect(options.first()).toHaveAttribute('aria-selected', 'false');

  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/);
  const activeOptionId = await search.getAttribute('aria-activedescendant');
  expect(activeOptionId).toBeTruthy();
  const activeOption = listbox.locator(`#${activeOptionId}`);
  await expect(activeOption).toHaveAttribute('role', 'option');
  await expect(activeOption).toHaveAttribute('aria-selected', 'true');
  const activeLabel = String(await activeOption.textContent()).trim();
  expect(activeLabel).toContain('Akrobatik');
  await expect(search).toBeFocused();

  await search.press('Enter');
  await expect(listbox).toBeHidden();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(search).not.toHaveAttribute('aria-activedescendant', /.+/);
  await expect(search).toBeFocused();
  await expect(page.locator('#activeFilters')).toContainText(activeLabel);
});

test('a lone document dialog inerts and restores the application background', async ({ page }) => {
  await waitForApp(page, '/#/inventory');

  await page.evaluate(() => {
    document.querySelector('.skip-links')?.setAttribute('inert', '');
  });
  const opener = page.locator('#overviewToggle');
  await opener.focus();
  await page.evaluate(() => { void window.alertPopup?.('Tillgänglighetstest'); });

  const popup = page.locator('#daub-dialog-modal');
  const dialog = popup.locator('.db-modal');
  await expect(popup).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAccessibleName(/Symbapedia/i);
  await expect(page.locator('#view-root')).toHaveAttribute('inert', '');

  const toolbarBackgroundInert = await page.locator('shared-toolbar').evaluate(element => (
    element.hasAttribute('inert')
  ));
  expect(toolbarBackgroundInert).toBe(true);

  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(page.locator('#view-root')).not.toHaveAttribute('inert', '');
  await expect.poll(() => deepActiveId(page)).toBe('overviewToggle');
  await expect(page.locator('.skip-links')).toHaveAttribute('inert', '');

  const toolbarBackgroundRestored = await page.locator('shared-toolbar').evaluate(element => (
    element.hasAttribute('inert')
  ));
  expect(toolbarBackgroundRestored).toBe(false);
});

test('drawer and nested dialogs keep only the top layer interactive and restore focus', async ({ page }) => {
  await waitForApp(page, '/#/inventory');

  await page.evaluate(() => {
    document.querySelector('.skip-links')?.setAttribute('inert', '');
  });

  const dashboardOpener = page.locator('#overviewToggle');
  await dashboardOpener.click();
  const drawer = page.locator('#invDashPanel');
  await expect(drawer).toBeVisible();

  const economyTrigger = drawer.locator('button[data-dash-trigger="manageEconomyBtn"]');
  await economyTrigger.click();
  const economy = page.locator('#inventoryEconomyPopup');
  const economyDialog = economy.locator('.db-modal');
  await expect(economy).toBeVisible();
  await expect(economyDialog).toHaveAttribute('role', 'dialog');
  await expect(economyDialog).toHaveAttribute('aria-modal', 'true');

  const initialStack = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const drawerElement = root?.getElementById('invDashPanel');
    const drawerDialog = drawerElement?.querySelector('.db-drawer__panel');
    const popup = root?.getElementById('inventoryEconomyPopup');
    const dialog = popup?.querySelector('.db-modal');
    const titleId = dialog?.getAttribute('aria-labelledby') || '';
    return {
      mainInert: document.getElementById('view-root')?.hasAttribute('inert') || false,
      drawerInert: drawerElement?.hasAttribute('inert') || false,
      drawerModal: drawerDialog?.getAttribute('aria-modal') || '',
      popupModal: dialog?.getAttribute('aria-modal') || '',
      popupTitle: String(root?.getElementById(titleId)?.textContent || '').trim(),
      drawerZ: Number(window.getComputedStyle(drawerElement).zIndex),
      popupZ: Number(window.getComputedStyle(popup).zIndex)
    };
  });
  expect(initialStack).toMatchObject({
    mainInert: true,
    drawerInert: true,
    drawerModal: 'false',
    popupModal: 'true'
  });
  expect(initialStack.popupTitle).toBeTruthy();
  expect(initialStack.popupZ).toBeGreaterThan(initialStack.drawerZ);

  await settleFocusFrames(page);
  const economyBoundaries = await getFocusBoundaries(economyDialog);
  expect(economyBoundaries.first).toBeTruthy();
  expect(economyBoundaries.last).toBeTruthy();
  await page.locator(`#${economyBoundaries.last}`).focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => deepActiveId(page)).toBe(economyBoundaries.first);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => deepActiveId(page)).toBe(economyBoundaries.last);

  const nestedOpener = page.locator('#inventoryEconomySaveFreeBtn');
  await nestedOpener.focus();
  await page.evaluate(() => window.invUtil.openSaveFreePopup?.());
  const nested = page.locator('#saveFreePopup');
  const nestedDialog = nested.locator('.db-modal');
  await expect(nested).toBeVisible();

  const nestedStack = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const outer = root?.getElementById('inventoryEconomyPopup');
    const inner = root?.getElementById('saveFreePopup');
    const outerDialog = outer?.querySelector('.db-modal');
    const innerDialog = inner?.querySelector('.db-modal');
    const titleId = innerDialog?.getAttribute('aria-labelledby') || '';
    return {
      outerInert: outer?.hasAttribute('inert') || false,
      outerModal: outerDialog?.getAttribute('aria-modal') || '',
      innerRole: innerDialog?.getAttribute('role') || '',
      innerModal: innerDialog?.getAttribute('aria-modal') || '',
      innerTitle: String(root?.getElementById(titleId)?.textContent || '').trim(),
      outerZ: Number(window.getComputedStyle(outer).zIndex),
      innerZ: Number(window.getComputedStyle(inner).zIndex)
    };
  });
  expect(nestedStack).toMatchObject({
    outerInert: true,
    outerModal: 'false',
    innerRole: 'dialog',
    innerModal: 'true'
  });
  expect(nestedStack.innerTitle).toBeTruthy();
  expect(nestedStack.innerZ).toBeGreaterThan(nestedStack.outerZ);

  await settleFocusFrames(page);
  const nestedBoundaries = await getFocusBoundaries(nestedDialog);
  await page.locator(`#${nestedBoundaries.last}`).focus();
  await page.keyboard.press('Tab');
  await expect.poll(() => deepActiveId(page)).toBe(nestedBoundaries.first);
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => deepActiveId(page)).toBe(nestedBoundaries.last);

  await page.keyboard.press('Escape');
  await expect(nested).toBeHidden();
  await expect(economy).toBeVisible();
  await expect(drawer).toBeVisible();
  await expect.poll(() => deepActiveId(page)).toBe('inventoryEconomySaveFreeBtn');
  await expect(economy).not.toHaveAttribute('inert', '');
  await expect(economyDialog).toHaveAttribute('aria-modal', 'true');

  await page.keyboard.press('Escape');
  await expect(economy).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(drawer).not.toHaveAttribute('inert', '');
  await expect.poll(async () => economyTrigger.evaluate(element => (
    element.getRootNode().activeElement === element
  ))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('#view-root')).not.toHaveAttribute('inert', '');
  await expect.poll(() => deepActiveId(page)).toBe('overviewToggle');
  await expect(page.locator('.skip-links')).toHaveAttribute('inert', '');
});
