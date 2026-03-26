import { expect, test } from '@playwright/test';

async function waitForApp(page, route = '/#/index') {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect(page.locator('shared-toolbar')).toHaveCount(1);
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
