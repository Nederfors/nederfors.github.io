import { expect, test } from '@playwright/test';

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

test('inventory manager shells and representative dialogs stay visually aligned', async ({ page }) => {
  await waitForApp(page, '/#/inventory');
  await seedInventoryFixtures(page);

  await page.evaluate(() => {
    window.openCharacterToolsPopup?.('generate');
  });
  await expect(page.locator('#characterToolsPopup')).toBeVisible();
  await expect(page.locator('#characterToolsPopup .db-modal')).toHaveScreenshot('character-tools-shell.png');
  await page.locator('#characterToolsPopup .db-modal__close').click();
  await expect(page.locator('#characterToolsPopup')).toBeHidden();

  await page.locator('#manageItemsBtn').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();
  await expect(page.locator('#inventoryItemsPopup .db-modal')).toHaveScreenshot('inventory-items-custom.png');

  await page.evaluate(() => {
    window.openInventoryItemsHub?.('vehicle-load');
  });
  await expect(page.locator('#inventoryItemsPopup')).toBeVisible();
  await expect(page.locator('#inventoryItemsPopup .db-modal')).toHaveScreenshot('inventory-items-vehicle.png');

  await page.locator('#inventoryItemsPopup .db-modal__close').click();
  await expect(page.locator('#inventoryItemsPopup')).toBeHidden();

  await page.locator('#manageEconomyBtn').click();
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();
  await expect(page.locator('#inventoryEconomyPopup .db-modal')).toHaveScreenshot('inventory-economy-money.png');

  await page.evaluate(() => {
    window.openInventoryEconomyHub?.('bulk-price');
  });
  await expect(page.locator('#inventoryEconomyPopup')).toBeVisible();
  await expect(page.locator('#inventoryEconomyPopup .db-modal')).toHaveScreenshot('inventory-economy-price.png');

  await page.evaluate(() => {
    window.invUtil.openSaveFreePopup?.();
  });
  await expect(page.locator('#saveFreePopup')).toBeVisible();
  await expect(page.locator('#saveFreePopup .db-modal')).toHaveScreenshot('inventory-dialog-sm.png');
  await page.locator('#saveFreePopup .db-modal__close').click();
  await expect(page.locator('#saveFreePopup')).toBeHidden();

  await page.evaluate(() => {
    const item = window.DB.find(entry => Array.isArray(entry?.taggar?.typ) && !entry.taggar.typ.includes('Färdmedel'));
    if (item) {
      window.invUtil.openLiveBuyPopup?.(item, null);
    }
  });
  await expect(page.locator('#liveBuyPopup')).toBeVisible();
  await expect(page.locator('#liveBuyPopup .db-modal')).toHaveScreenshot('inventory-dialog-md.png');
});
