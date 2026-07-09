import { expect, test } from '@playwright/test';

const PHONE_VIEWPORTS = [
  { name: 'android baseline', width: 360, height: 800 },
  { name: 'iphone baseline', width: 390, height: 844 },
  { name: 'large android', width: 412, height: 915 }
];

const CORE_ROUTES = [
  '/#/index',
  '/#/character',
  '/#/inventory',
  '/#/traits',
  '/#/notes'
];

async function loadRoute(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));
}

function measureShell() {
  const toolbarRoot = document.querySelector('shared-toolbar')?.shadowRoot;
  const controls = [
    ...document.querySelectorAll('.traits-tab, #xpMinus, #xpInput, #xpPlus, .trait-btn'),
    ...(toolbarRoot ? toolbarRoot.querySelectorAll('.db-bottom-nav__item, #searchField, #xpToggle') : [])
  ];
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    targets: controls
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
      .map(element => {
        const box = element.getBoundingClientRect();
        return { id: element.id, width: box.width, height: box.height };
      }),
    inputFonts: [...document.querySelectorAll('input, select, textarea')]
      .filter(element => element.getBoundingClientRect().width > 0)
      .map(element => Number.parseFloat(getComputedStyle(element).fontSize)),
    navLabels: [...(toolbarRoot?.querySelectorAll('.db-bottom-nav__label') || [])]
      .map(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })),
    panels: [...(toolbarRoot?.querySelectorAll('.offcanvas') || [])]
      .map(element => ({ id: element.id, ariaHidden: element.getAttribute('aria-hidden'), inert: element.hasAttribute('inert') }))
  };
}

for (const viewport of PHONE_VIEWPORTS) {
  test(`mobile shell remains usable at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of CORE_ROUTES) {
      await loadRoute(page, path);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(scrollWidth, `${path} must not create horizontal page overflow`).toBe(clientWidth);
    }

    await loadRoute(page, '/#/traits');

    const metrics = await page.evaluate(measureShell);
    expect(metrics.scrollWidth).toBe(metrics.clientWidth);
    expect(metrics.targets.every(target => target.width >= 44 && target.height >= 44)).toBe(true);
    expect(metrics.inputFonts.every(fontSize => fontSize >= 16)).toBe(true);
    expect(metrics.navLabels.every(label => label.scrollWidth <= label.clientWidth)).toBe(true);
    expect(metrics.panels.every(panel => panel.ariaHidden === 'true' && panel.inert)).toBe(true);
  });
}

test('360px index cards and the functions drawer retain touch targets and accessibility state', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await loadRoute(page, '/#/index');

  const raser = page.getByText('Raser', { exact: true });
  await expect(raser).toHaveCount(1);
  await raser.click();
  await page.waitForFunction(() => Boolean(document.querySelector('.entry-card.compact .entry-standard-action')));

  const cardMetrics = await page.evaluate(() => {
    const card = document.querySelector('.entry-card.compact');
    const controls = card
      ? [...card.querySelectorAll('.entry-collapse-btn, .info-btn, .entry-standard-action, .add-btn')]
      : [];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      controls: controls.map(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      })
    };
  });
  expect(cardMetrics.scrollWidth).toBe(cardMetrics.clientWidth);
  expect(cardMetrics.controls.length).toBeGreaterThan(0);
  expect(cardMetrics.controls.every(control => control.width >= 44 && control.height >= 44)).toBe(true);

  const toolbar = page.locator('shared-toolbar');
  const filterToggle = toolbar.locator('#filterToggle');
  await expect(filterToggle).toHaveCount(1);
  await filterToggle.click();

  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('filterPanel');
    const surface = panel?.querySelector('.db-drawer__panel');
    const root = panel?.getRootNode();
    return panel ? {
      ariaHidden: panel.getAttribute('aria-hidden'),
      inert: panel.hasAttribute('inert'),
      surfaceHeight: surface?.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      focusedWithinDrawer: Boolean(root?.activeElement && panel.contains(root.activeElement))
    } : null;
  })).toEqual({ ariaHidden: 'false', inert: false, surfaceHeight: 800, viewportHeight: 800, focusedWithinDrawer: true });

  const closeButton = toolbar.locator('#filterPanel button[data-close="filterPanel"]');
  await expect(closeButton).toHaveCount(1);
  await closeButton.click();
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const panel = root?.getElementById('filterPanel');
    return panel ? {
      ariaHidden: panel.getAttribute('aria-hidden'),
      inert: panel.hasAttribute('inert'),
      returnedToTrigger: root?.activeElement?.id === 'filterToggle'
    } : null;
  })).toEqual({ ariaHidden: 'true', inert: true, returnedToTrigger: true });

  // The overlay is represented in browser history; Back must close it without
  // leaving its DAUB state or focusability behind.
  await page.waitForTimeout(350);
  await filterToggle.click();
  await expect.poll(() => page.evaluate(() => {
    const panel = document.querySelector('shared-toolbar')?.shadowRoot?.getElementById('filterPanel');
    return panel?.getAttribute('aria-hidden');
  })).toBe('false');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const panel = root?.getElementById('filterPanel');
    return panel ? {
      ariaHidden: panel.getAttribute('aria-hidden'),
      inert: panel.hasAttribute('inert'),
      daubOpen: panel.classList.contains('db-drawer--open'),
      returnedToTrigger: root?.activeElement?.id === 'filterToggle'
    } : null;
  })).toEqual({ ariaHidden: 'true', inert: true, daubOpen: false, returnedToTrigger: true });
});
