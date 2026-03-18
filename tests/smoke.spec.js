import { expect, test } from '@playwright/test';

const pageMatrix = [
  {
    path: '/#/index',
    title: /Symbapedia/i,
    selector: '#lista',
    toolbar: true
  },
  {
    path: '/#/character',
    title: /Rollperson/i,
    selector: '#valda',
    toolbar: true
  },
  {
    path: '/#/inventory',
    title: /Inventarie/i,
    selector: '#invList',
    toolbar: true
  },
  {
    path: '/#/traits',
    title: /Egenskaper/i,
    selector: '#traitsTabPanel',
    toolbar: true
  },
  {
    path: '/#/notes',
    title: /Anteckningar/i,
    selector: '#characterForm',
    toolbar: true
  },
  {
    path: '/webapp.html#android',
    title: /webapp/i,
    selector: '#android',
    toolbar: false
  }
];

for (const scenario of pageMatrix) {
  test(`smoke loads ${scenario.path}`, async ({ page }) => {
    await page.goto(scenario.path);
    await expect(page).toHaveTitle(scenario.title);
    await expect(page.locator(scenario.selector)).toBeVisible();
    if (scenario.toolbar) {
      await expect(page.locator('shared-toolbar')).toHaveCount(1);
    }
  });
}
