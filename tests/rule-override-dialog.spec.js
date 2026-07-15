import { expect, test } from '@playwright/test';

async function openRequirementDialog(page) {
  await page.evaluate(() => {
    const candidate = window.catalogSchema.normalizeEntry({
      id: 'rule-override-dialog-entry',
      name: 'Regelpost',
      tags: { types: ['Förmåga'] },
      rules: {
        require: [{
          rule_id: 'rule-override-dialog-requirement',
          when: { field: 'selected.names', op: 'includes', value: 'Nyckel' },
          message: 'Kräver Nyckel.'
        }]
      }
    });
    window.__requirementDialogResult = null;
    window.requirementPopup.open({
      candidate,
      list: [],
      title: 'Regelundantag',
      subtitle: 'Lägg till kravet eller fortsätt med ett undantag.'
    }).then(result => {
      window.__requirementDialogResult = result;
    });
  });
}

test('requirement override keeps cancel left and reports the selected action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));

  await openRequirementDialog(page);
  const dialog = page.locator('#requirementPopup');
  const cancel = dialog.locator('#requirementCancel');
  const proceed = dialog.locator('#requirementOverride');

  await expect(dialog).toBeVisible();
  await expect(cancel).toHaveText('Avbryt');
  await expect(proceed).toHaveText('Fortsätt');

  const [cancelBox, proceedBox] = await Promise.all([cancel.boundingBox(), proceed.boundingBox()]);
  expect(cancelBox?.x).toBeLessThan(proceedBox?.x ?? 0);
  expect(Math.abs((cancelBox?.y ?? 0) - (proceedBox?.y ?? 0))).toBeLessThan(2);
  expect([cancelBox, proceedBox].every(box => box && box.width >= 44 && box.height >= 44)).toBe(true);

  await cancel.click();
  await page.waitForFunction(() => window.__requirementDialogResult?.action === 'cancel');

  await openRequirementDialog(page);
  await proceed.click();
  await page.waitForFunction(() => window.__requirementDialogResult?.action === 'override');
});
