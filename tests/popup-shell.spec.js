import { expect, test } from '@playwright/test';
import { expectPortablePopupScreenshot } from './helpers/portable-popup-screenshot.js';

async function waitForApp(page, route = '/#/index') {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect(page.locator('shared-toolbar')).toHaveCount(1);
}

async function seedInventoryFixtures(page) {
  await page.waitForFunction(() => Array.isArray(window.DB) && window.DB.length > 0);
  await page.evaluate(() => {
    const vehicle = window.DB.find(entry => Array.isArray(entry?.taggar?.typ) && entry.taggar.typ.includes('Färdmedel'));
    const items = window.DB.filter(entry => Array.isArray(entry?.taggar?.typ) && !entry.taggar.typ.includes('Färdmedel'));
    const firstItem = items[0];
    const secondItem = items.find(entry => entry.id !== firstItem?.id) || items[0];
    if (!vehicle || !firstItem || !secondItem) return;

    const inv = [
      {
        id: vehicle.id,
        name: vehicle.namn,
        qty: 1,
        gratis: 0,
        gratisKval: [],
        removedKval: [],
        contains: [
          {
            id: secondItem.id,
            name: secondItem.namn,
            qty: 2,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          },
          {
            name: 'Pengar',
            typ: 'currency',
            qty: 1,
            money: { daler: 3, skilling: 2, 'örtegar': 1 }
          }
        ]
      },
      {
        id: firstItem.id,
        name: firstItem.namn,
        qty: 3,
        gratis: 0,
        gratisKval: [],
        removedKval: []
      }
    ];

    window.storeHelper.setMoney(store, { daler: 12, skilling: 3, 'örtegar': 4 });
    window.invUtil.saveInventory(inv);
    window.invUtil.renderInventory();
  });
}

async function expectEconomyPanelReady(page, tabId, contentSelector) {
  const popup = page.locator('#inventoryEconomyPopup');
  const tab = popup.locator(`.tools-tab[data-tab="${tabId}"]`);
  const panel = popup.locator(`.tools-panel[data-tab="${tabId}"]`);

  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(panel).not.toHaveAttribute('hidden', '');
  await expect(panel.locator(contentSelector)).toBeVisible();

  const geometry = await popup.evaluate((root, activeTab) => {
    const panels = root.querySelector('.tools-panels');
    const panel = root.querySelector(`.tools-panel[data-tab="${activeTab}"]`);
    const card = panel?.querySelector('.tools-card');
    const modal = root.querySelector('.db-modal');
    const rect = element => element?.getBoundingClientRect() || null;
    const panelsRect = rect(panels);
    const panelRect = rect(panel);
    const cardRect = rect(card);
    const modalRect = rect(modal);
    const visibleCardHeight = cardRect && modalRect
      ? Math.max(0, Math.min(cardRect.bottom, modalRect.bottom) - Math.max(cardRect.top, modalRect.top))
      : 0;
    return {
      activeTab: root.dataset.activeTab || '',
      panelsHeight: panelsRect?.height || 0,
      panelHeight: panelRect?.height || 0,
      cardHeight: cardRect?.height || 0,
      visibleCardHeight
    };
  }, tabId);

  expect(geometry.activeTab).toBe(tabId);
  expect(geometry.panelsHeight, `${tabId} panels host collapsed`).toBeGreaterThan(100);
  expect(geometry.panelHeight, `${tabId} panel collapsed`).toBeGreaterThan(100);
  expect(geometry.cardHeight, `${tabId} card collapsed`).toBeGreaterThan(100);
  expect(geometry.visibleCardHeight, `${tabId} card is clipped out of the modal`).toBeGreaterThan(100);
}

async function expectNoBackdropBlur(locator, { includeBefore = false } = {}) {
  const blurred = await locator.evaluate((root, inspectBefore) => {
    const inspect = (element, pseudo) => {
      const style = window.getComputedStyle(element, pseudo);
      return {
        target: pseudo || element.id || element.className || element.tagName,
        backdropFilter: style.backdropFilter,
        webkitBackdropFilter: style.webkitBackdropFilter
      };
    };
    return [
      inspect(root),
      ...(inspectBefore ? [inspect(root, '::before')] : []),
      ...Array.from(root.querySelectorAll('*')).map(element => inspect(element))
    ].filter(result => (
      result.backdropFilter !== 'none'
      || (result.webkitBackdropFilter && result.webkitBackdropFilter !== 'none')
    ));
  }, includeBefore);
  expect(blurred).toEqual([]);
}

async function expectTransparentBackdrop(locator, { includeBefore = false } = {}) {
  const backdrops = await locator.evaluate((root, inspectBefore) => {
    const inspect = (element, pseudo, target) => {
      const style = window.getComputedStyle(element, pseudo);
      return {
        target,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage
      };
    };
    return [
      inspect(root, null, 'root'),
      ...(inspectBefore ? [inspect(root, '::before', '::before')] : [])
    ];
  }, includeBefore);

  for (const backdrop of backdrops) {
    expect(backdrop.backgroundColor, `${backdrop.target} darkens the page`).toBe('rgba(0, 0, 0, 0)');
    expect(backdrop.backgroundImage, `${backdrop.target} adds a backdrop image`).toBe('none');
  }
}

test('desktop Traits tabs each expose one full-width panel', async ({ page }, testInfo) => {
  test.skip(!['chromium', 'webkit'].includes(testInfo.project.name), 'Desktop release projects own this geometry contract.');

  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForApp(page, '/#/traits');
  const host = page.locator('.traits-tab-panels');
  await expect(host).not.toHaveAttribute('data-swipe-tabs', '1');

  const tabs = [
    { tabId: 'traitsTabTraits', panelId: 'traitsTabPanel' },
    { tabId: 'traitsTabSummary', panelId: 'summaryTabPanel' },
    { tabId: 'traitsTabEffects', panelId: 'effectsTabPanel' }
  ];
  for (const { tabId, panelId } of tabs) {
    await page.locator(`#${tabId}`).click();
    await expect(page.locator(`#${tabId}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`#${tabId}`)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(`#${panelId}`)).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.traits-tab-panel:visible')).toHaveCount(1);
    await expect(page.locator(`#${panelId}`)).toBeVisible();

    const geometry = await page.evaluate(activePanelId => {
      const hostRect = document.querySelector('.traits-tab-panels')?.getBoundingClientRect() || null;
      const panelRect = document.getElementById(activePanelId)?.getBoundingClientRect() || null;
      return {
        hostWidth: hostRect?.width || 0,
        panelWidth: panelRect?.width || 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, panelId);
    expect(geometry.hostWidth).toBeGreaterThan(0);
    expect(Math.abs(geometry.panelWidth - geometry.hostWidth)).toBeLessThan(1);
    expect(geometry.overflow).toBe(0);
  }
});

test('desktop Character Tools is a 700px two-column dialog', async ({ page }, testInfo) => {
  test.skip(!['chromium', 'webkit'].includes(testInfo.project.name), 'Desktop release projects own this geometry contract.');

  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForApp(page, '/#/character');
  const toolbar = page.locator('shared-toolbar');
  await toolbar.locator('#filterToggle').click();
  const filterPanel = toolbar.locator('#filterPanel');
  await expect(filterPanel).toHaveAttribute('aria-hidden', 'false');
  await expectNoBackdropBlur(filterPanel, { includeBefore: true });
  await expectTransparentBackdrop(filterPanel, { includeBefore: true });
  const toolsButton = toolbar.locator('#characterToolsBtn');
  if (!(await toolsButton.isVisible())) {
    await toolbar.locator('#filterFormalCard .card-title').click();
  }
  await expect(toolsButton).toBeVisible();
  await toolsButton.click();
  await expect(page.locator('#characterToolsPopup')).toBeVisible();
  await expect(page.locator('#characterToolsPopup .tools-panel.active .tools-card')).toBeVisible();

  const geometry = await page.locator('#characterToolsPopup').evaluate(popup => {
    const modal = popup.querySelector('.db-modal');
    const modalRect = modal?.getBoundingClientRect() || null;
    const grids = [...popup.querySelectorAll('.tools-panel.active .tools-grid.two-col')]
      .filter(grid => grid.getBoundingClientRect().height > 0);
    return {
      modalWidth: modalRect?.width || 0,
      modalLeft: modalRect?.left ?? -1,
      modalRight: modalRect?.right ?? -1,
      columns: grids.map(grid => (
        window.getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length
      )),
      modalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 1,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.modalWidth).toBeGreaterThanOrEqual(699);
  expect(geometry.modalWidth).toBeLessThanOrEqual(701);
  expect(geometry.modalLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.modalRight).toBeLessThanOrEqual(1280);
  expect(geometry.columns.length).toBeGreaterThan(0);
  expect(geometry.columns.every(columns => columns === 2)).toBe(true);
  expect(geometry.modalOverflow).toBeLessThanOrEqual(0);
  expect(geometry.pageOverflow).toBe(0);
});

test('toolbar popups use unified DAUB shell and shared choice markup', async ({ page }) => {
  await waitForApp(page, '/#/inventory');

  await page.evaluate(() => {
    if (typeof window.openFolderManagerPopup === 'function') {
      void window.openFolderManagerPopup();
    }
  });

  const popupState = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const sortPopup = root?.getElementById('entrySortPopup');
    const qualPopup = root?.getElementById('qualPopup');
    const folderPopup = root?.getElementById('folderManagerPopup');
    return {
      sortHasHeaderClose: Boolean(sortPopup?.querySelector('.db-modal__header .db-modal__close#entrySortCancel')),
      sortHasFooterCancel: Boolean(sortPopup?.querySelector('.db-modal__footer #entrySortCancel')),
      sortHasFooterSave: Boolean(sortPopup?.querySelector('.db-modal__footer #entrySortSave')),
      sortUsesRadioInputs: (sortPopup?.querySelectorAll('#entrySortOptions .db-radio__input').length || 0) > 0,
      qualHasHeaderClose: Boolean(qualPopup?.querySelector('.db-modal__header .db-modal__close#qualClose')),
      qualHasFooterCancel: Boolean(qualPopup?.querySelector('#qualCancel')),
      folderHasHeaderClose: Boolean(folderPopup?.querySelector('.db-modal__header .db-modal__close#folderManagerCloseX')),
      folderHasFooterDone: Boolean(folderPopup?.querySelector('#folderManagerDone')),
      folderUsesCheckboxRows: (folderPopup?.querySelectorAll('#folderCharList .db-checkbox').length || 0) > 0
    };
  });

  expect(popupState.sortHasHeaderClose).toBe(true);
  expect(popupState.sortHasFooterCancel).toBe(false);
  expect(popupState.sortHasFooterSave).toBe(true);
  expect(popupState.sortUsesRadioInputs).toBe(true);
  expect(popupState.qualHasHeaderClose).toBe(true);
  expect(popupState.qualHasFooterCancel).toBe(false);
  expect(popupState.folderHasHeaderClose).toBe(true);
  expect(popupState.folderHasFooterDone).toBe(false);
  expect(popupState.folderUsesCheckboxRows).toBe(true);
});

test('shadow-root drawers and choice controls keep their complete component layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page, '/#/index');

  const toolbar = page.locator('shared-toolbar');
  await toolbar.locator('#filterToggle').click();
  const filterPanel = toolbar.locator('#filterPanel');
  await expect(filterPanel).toHaveAttribute('aria-hidden', 'false');
  await expectNoBackdropBlur(filterPanel, { includeBefore: true });
  await expectTransparentBackdrop(filterPanel, { includeBefore: true });

  const formalCard = toolbar.locator('#filterFormalCard');
  if (await formalCard.evaluate(card => card.classList.contains('compact'))) {
    await formalCard.locator('.card-title').click();
  }
  const actionRow = formalCard.locator('.char-btn-row').first();
  await expect(actionRow).toBeVisible();

  const drawerGeometry = await toolbar.locator('#filterPanel').evaluate(panel => {
    const actionRow = panel.querySelector('#filterFormalCard .char-btn-row');
    const panelSurface = panel.querySelector('.db-drawer__panel');
    const rowStyle = actionRow ? window.getComputedStyle(actionRow) : null;
    const panelStyle = panelSurface ? window.getComputedStyle(panelSurface) : null;
    return {
      actionDisplay: rowStyle?.display || '',
      actionColumns: rowStyle?.gridTemplateColumns.split(/\s+/).filter(Boolean).length || 0,
      surfacePosition: panelStyle?.position || '',
      surfaceOverflowY: panelStyle?.overflowY || ''
    };
  });

  expect(drawerGeometry.actionDisplay).toBe('grid');
  expect(drawerGeometry.actionColumns).toBeGreaterThanOrEqual(1);
  expect(drawerGeometry.surfacePosition).toBe('absolute');
  expect(['auto', 'scroll']).toContain(drawerGeometry.surfaceOverflowY);

  const settingsCard = toolbar.locator('#filterSettingsCard');
  if (await settingsCard.evaluate(card => card.classList.contains('compact'))) {
    await settingsCard.locator('.card-title').click();
  }
  await toolbar.locator('#entrySortBtn').click();
  const sortPopup = toolbar.locator('#entrySortPopup');
  await expect(sortPopup).toBeVisible();
  await expectNoBackdropBlur(sortPopup);
  await expectTransparentBackdrop(sortPopup);
  const firstChoice = sortPopup.locator('.popup-choice-row.db-radio').first();
  await expect(firstChoice).toBeVisible();

  const choiceGeometry = await firstChoice.evaluate(row => {
    const input = row.querySelector('.db-radio__input');
    const indicator = row.querySelector('.db-radio__circle');
    const inputStyle = input ? window.getComputedStyle(input) : null;
    const indicatorRect = indicator?.getBoundingClientRect() || null;
    return {
      display: window.getComputedStyle(row).display,
      inputPosition: inputStyle?.position || '',
      inputOpacity: inputStyle?.opacity || '',
      inputWidth: inputStyle?.width || '',
      indicatorWidth: indicatorRect?.width || 0,
      indicatorHeight: indicatorRect?.height || 0
    };
  });

  expect(choiceGeometry.display).toBe('flex');
  expect(choiceGeometry.inputPosition).toBe('absolute');
  expect(choiceGeometry.inputOpacity).toBe('0');
  expect(choiceGeometry.inputWidth).toBe('0px');
  expect(choiceGeometry.indicatorWidth).toBe(20);
  expect(choiceGeometry.indicatorHeight).toBe(20);

  await firstChoice.click();
  await expect(firstChoice.locator('.db-radio__input')).toBeChecked();
  await sortPopup.locator('#entrySortCancel').click();
  await expect(sortPopup).toBeHidden();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await toolbar.locator('#entrySortBtn').click();
    await expect(sortPopup).toBeVisible();
    await sortPopup.locator('#entrySortCancel').click();
    await expect(sortPopup).toBeHidden();
  }

  await toolbar.locator('#filterPanel button[data-close="filterPanel"]').click();
  await expect(filterPanel).toHaveAttribute('aria-hidden', 'true');
  await toolbar.locator('#filterToggle').click();
  await expect(filterPanel).toHaveAttribute('aria-hidden', 'false');
});

test('inventory managers use the Rollpersonshantering shell and shared tools structure', async ({ page }) => {
  await waitForApp(page, '/#/inventory');
  await seedInventoryFixtures(page);

  await page.locator('#manageItemsBtn').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();

  const itemsState = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const popup = root?.getElementById('inventoryItemsPopup');
    return {
      layout: popup?.dataset.popupLayout || '',
      hasTabs: Boolean(popup?.querySelector('.tools-tabs')),
      hasPanels: Boolean(popup?.querySelector('.tools-panels')),
      hasCustomView: Boolean(popup?.querySelector('#customPopup .tools-card')),
      hasQtyView: Boolean(popup?.querySelector('#qtyPopup .tools-card')),
      hasVehicleView: Boolean(popup?.querySelector('#vehiclePopup .tools-card')),
      hasVehicleRemoveView: Boolean(popup?.querySelector('#vehicleRemovePopup .tools-card'))
    };
  });

  await page.locator('#inventoryItemsPopup .db-modal__close').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeHidden();

  await page.locator('#manageEconomyBtn').click();
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();

  const economyState = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const popup = root?.getElementById('inventoryEconomyPopup');
    return {
      layout: popup?.dataset.popupLayout || '',
      hasTabs: Boolean(popup?.querySelector('.tools-tabs')),
      hasPanels: Boolean(popup?.querySelector('.tools-panels')),
      hasMoneyView: Boolean(popup?.querySelector('#moneyPopup .tools-card')),
      hasPriceView: Boolean(popup?.querySelector('#pricePopup .tools-card')),
      hasMassActions: Boolean(popup?.querySelector('#inventoryEconomyMassActions'))
    };
  });

  await page.locator('#inventoryEconomyPopup .db-modal__close').click();
  await expect(page.locator('#inventoryEconomyPopup')).toBeHidden();

  await page.evaluate(() => {
    if (typeof window.openCharacterToolsPopup === 'function') {
      window.openCharacterToolsPopup('generate');
    }
  });
  await expect(page.locator('#characterToolsPopup')).toBeVisible();

  const characterState = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const popup = root?.getElementById('characterToolsPopup');
    return {
      layout: popup?.dataset.popupLayout || '',
      hasTabs: Boolean(popup?.querySelector('.tools-tabs')),
      hasPanels: Boolean(popup?.querySelector('.tools-panels')),
      hasToolsCard: Boolean(popup?.querySelector('.tools-card'))
    };
  });

  await expect(page.locator('#manageItemsBtn')).toBeVisible();
  await expect(page.locator('#manageEconomyBtn')).toBeVisible();
  expect(itemsState.layout).toBe('tools-popup-lg');
  expect(itemsState.hasTabs).toBe(true);
  expect(itemsState.hasPanels).toBe(true);
  expect(itemsState.hasCustomView).toBe(true);
  expect(itemsState.hasQtyView).toBe(true);
  expect(itemsState.hasVehicleView).toBe(true);
  expect(itemsState.hasVehicleRemoveView).toBe(true);
  expect(economyState.layout).toBe('tools-popup-lg');
  expect(economyState.hasTabs).toBe(true);
  expect(economyState.hasPanels).toBe(true);
  expect(economyState.hasMoneyView).toBe(true);
  expect(economyState.hasPriceView).toBe(true);
  expect(economyState.hasMassActions).toBe(true);
  expect(characterState.layout).toBe('tools-popup-lg');
  expect(characterState.hasTabs).toBe(true);
  expect(characterState.hasPanels).toBe(true);
  expect(characterState.hasToolsCard).toBe(true);
});

test('inventory dashboard manager buttons keep their popups open', async ({ page }) => {
  await waitForApp(page, '/#/inventory');
  await seedInventoryFixtures(page);

  await page.locator('#invDashFloatBtn').click();
  await expect(page.locator('#invDashPanel')).toBeVisible();

  await page.locator('#invDashPanel button[data-dash-trigger="manageEconomyBtn"]').click();
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();

  await page.locator('#inventoryEconomyPopup .db-modal__close').click();
  await expect(page.locator('#inventoryEconomyPopup')).toBeHidden();

  await page.locator('#invDashPanel button[data-dash-trigger="manageItemsBtn"]').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();
});

test('dynamic and legacy-created popups close through the unified header close', async ({ page }) => {
  await waitForApp(page, '/#/index');

  await page.evaluate(() => {
    void window.choicePopup.open({
      title: 'Testval',
      options: [{ value: 'one', label: 'Alpha' }]
    });
  });

  const choicePopup = page.locator('#choicePopup');
  await expect(choicePopup).toBeVisible();
  await expect(choicePopup.locator('.db-modal__header .db-modal__close#choiceClose')).toHaveCount(1);
  await expect(choicePopup.locator('#choiceCancel')).toHaveCount(0);
  await choicePopup.click({ position: { x: 5, y: 5 } });
  await expect(choicePopup).toBeHidden();

  await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    activeStore.current = '';
    window.storeHelper.save(activeStore);
    if (typeof window.refreshCharSelect === 'function') window.refreshCharSelect();
    void window.requireCharacter();
  });

  const charPopup = page.locator('#charPopup');
  await expect(charPopup).toBeVisible();
  await expect(charPopup.locator('.db-modal__header .db-modal__title')).toContainText('Aktiv karaktar kravs');
  await expect(charPopup.locator('.db-modal__header .db-modal__close#charReqCancel')).toHaveCount(1);
  await expect(charPopup.locator('.db-modal__footer #charReqCancel')).toHaveCount(0);
  await charPopup.locator('.db-modal__header .db-modal__close#charReqCancel').click();
  await expect(charPopup).toBeHidden();
});

test('surface-less drawers keep descendant clicks open and dismiss on their root backdrop', async ({ page }) => {
  await waitForApp(page, '/#/index');

  await page.evaluate(() => {
    const drawer = document.createElement('aside');
    drawer.id = 'surfaceLessDrawerFixture';
    drawer.className = 'offcanvas';
    drawer.style.cssText = 'position:fixed;top:24px;right:24px;width:240px;height:240px;padding:16px;';
    drawer.innerHTML = '<button type="button" data-drawer-action>Byt flik</button>';
    drawer.querySelector('[data-drawer-action]').addEventListener('click', () => {
      drawer.dataset.actionCount = String((Number(drawer.dataset.actionCount) || 0) + 1);
    });
    document.body.appendChild(drawer);
    window.registerOverlayElement?.(drawer);
    window.popupManager?.register?.(drawer, {
      type: 'form',
      touchProfile: 'panel-right'
    });
    window.popupManager?.open?.(drawer, {
      type: 'form',
      touchProfile: 'panel-right'
    });
  });

  const drawer = page.locator('#surfaceLessDrawerFixture');
  await expect(drawer).toHaveClass(/open/);
  await drawer.locator('[data-drawer-action]').click();
  await expect(drawer).toHaveAttribute('data-action-count', '1');
  await expect(drawer).toHaveClass(/open/);

  const drawerBox = await drawer.boundingBox();
  expect(drawerBox).not.toBeNull();
  await drawer.click({
    position: {
      x: Math.max(1, drawerBox.width - 8),
      y: Math.max(1, drawerBox.height - 8)
    }
  });
  await expect(drawer).not.toHaveClass(/open/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');

  await page.evaluate(() => {
    const fixture = document.getElementById('surfaceLessDrawerFixture');
    if (!fixture) return;
    window.popupManager?.open?.(fixture, {
      type: 'form',
      touchProfile: 'panel-right'
    });
  });
  await expect(drawer).toHaveClass(/open/);
  await drawer.evaluate(element => element.click());
  await expect(drawer).not.toHaveClass(/open/);
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
});

test('inventory manager shells and representative dialogs stay visually aligned', async ({ page }, testInfo) => {
  await waitForApp(page, '/#/inventory');
  await seedInventoryFixtures(page);

  await page.evaluate(() => {
    window.openCharacterToolsPopup?.('generate');
  });
  await expect(page.locator('#characterToolsPopup')).toBeVisible();
  await expectPortablePopupScreenshot(
    page.locator('#characterToolsPopup .db-modal'),
    'character-tools-shell.png',
    testInfo
  );
  await page.locator('#characterToolsPopup .db-modal__close').click();
  await expect(page.locator('#characterToolsPopup')).toBeHidden();

  await page.locator('#manageItemsBtn').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();
  await expectPortablePopupScreenshot(
    page.locator('#inventoryItemsPopup .db-modal'),
    'inventory-items-custom.png',
    testInfo
  );

  await page.evaluate(() => {
    window.openInventoryItemsHub?.('vehicle-load');
  });
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();
  await expectPortablePopupScreenshot(
    page.locator('#inventoryItemsPopup .db-modal'),
    'inventory-items-vehicle.png',
    testInfo
  );

  await page.locator('#inventoryItemsPopup .db-modal__close').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeHidden();

  await page.locator('#manageEconomyBtn').click();
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();
  await expectEconomyPanelReady(page, 'money', '#moneyStatus');
  await expectPortablePopupScreenshot(
    page.locator('#inventoryEconomyPopup .db-modal'),
    'inventory-economy-money.png',
    testInfo
  );

  await page.evaluate(() => {
    window.openInventoryEconomyHub?.('bulk-price');
  });
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();
  await expectEconomyPanelReady(page, 'bulk-price', '#priceItemList');
  await expectPortablePopupScreenshot(
    page.locator('#inventoryEconomyPopup .db-modal'),
    'inventory-economy-price.png',
    testInfo
  );

  await page.evaluate(() => {
    window.invUtil.openSaveFreePopup?.();
  });
  await expect(page.locator('#saveFreePopup')).toBeVisible();
  await expectPortablePopupScreenshot(
    page.locator('#saveFreePopup .db-modal'),
    'inventory-dialog-sm.png',
    testInfo
  );
  await page.locator('#saveFreePopup .db-modal__close').click();
  await expect(page.locator('#saveFreePopup')).toBeHidden();

  await page.evaluate(() => {
    const item = window.DB.find(entry => Array.isArray(entry?.taggar?.typ) && !entry.taggar.typ.includes('Färdmedel'));
    if (item) {
      window.invUtil.openLiveBuyPopup?.(item, null);
    }
  });
  await expect(page.locator('#liveBuyPopup')).toBeVisible();
  await expectPortablePopupScreenshot(
    page.locator('#liveBuyPopup .db-modal'),
    'inventory-dialog-md.png',
    testInfo
  );
});
