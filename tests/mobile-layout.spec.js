import { expect, test } from '@playwright/test';

const PHONE_VIEWPORTS = [
  { name: 'minimum supported', width: 320, height: 700 },
  { name: 'android baseline', width: 360, height: 800 },
  { name: 'iphone baseline', width: 390, height: 844 },
  { name: 'large android', width: 412, height: 915 }
];

const COARSE_TABLET_VIEWPORTS = [
  { name: 'compact tablet', width: 667, height: 900 },
  { name: 'tablet baseline', width: 768, height: 1024 }
];

const CORE_ROUTES = [
  '/#/index',
  '/#/character',
  '/#/inventory',
  '/#/traits',
  '/#/notes'
];

async function loadRoute(page, path) {
  const requestedRole = String(path).split('/').filter(Boolean).at(-1) || 'index';
  const expectedRole = requestedRole === 'summary' || requestedRole === 'effects'
    ? 'traits'
    : requestedRole;
  await page.goto(path);
  await page.waitForFunction(role => {
    const viewRoot = document.getElementById('view-root');
    return Boolean(window.__symbaroumBootCompleted)
      && document.body.dataset.role === role
      && viewRoot?.getAttribute('aria-busy') === 'false';
  }, expectedRole);
}

function measureShell() {
  const toolbarRoot = document.querySelector('shared-toolbar')?.shadowRoot;
  const traitsHost = document.querySelector('.traits-tab-panels');
  const traitsHostRect = traitsHost?.getBoundingClientRect() || null;
  const traitsPanels = [...document.querySelectorAll('.traits-tab-panel')];
  const controls = [
    ...document.querySelectorAll('.traits-tab, #xpMinus, #xpInput, #xpPlus, .trait-btn, .trait-count, .summary-chip-more'),
    ...(toolbarRoot ? toolbarRoot.querySelectorAll('.db-bottom-nav__item, #searchField, #xpToggle') : [])
  ];
  const measureTarget = element => {
    const box = element?.getBoundingClientRect() || null;
    return box ? { width: box.width, height: box.height } : null;
  };
  return {
    pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
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
    namedTargets: {
      search: measureTarget(toolbarRoot?.getElementById('searchField')),
      traitCounts: [...document.querySelectorAll('.trait-count')]
        .filter(element => element.getBoundingClientRect().width > 0)
        .map(measureTarget)
    },
    inputFonts: [...document.querySelectorAll('input, select, textarea')]
      .filter(element => element.getBoundingClientRect().width > 0)
      .map(element => Number.parseFloat(window.getComputedStyle(element).fontSize)),
    navLabels: [...(toolbarRoot?.querySelectorAll('.db-bottom-nav__label') || [])]
      .map(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })),
    panels: [...(toolbarRoot?.querySelectorAll('.offcanvas') || [])]
      .map(element => ({ id: element.id, ariaHidden: element.getAttribute('aria-hidden'), inert: element.hasAttribute('inert') })),
    traits: {
      hostWidth: traitsHostRect?.width || 0,
      panelWidths: traitsPanels.map(panel => panel.getBoundingClientRect().width),
      renderedPanelWidths: traitsPanels
        .map(panel => panel.getBoundingClientRect().width)
        .filter(width => width > 0),
      visiblePanels: traitsPanels.filter(panel => {
        if (!traitsHostRect) return false;
        const style = window.getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();
        const visibleWidth = Math.max(
          0,
          Math.min(rect.right, traitsHostRect.right) - Math.max(rect.left, traitsHostRect.left)
        );
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > 0
          && visibleWidth > 1;
      }).length
    }
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
    expect(metrics.pointerCoarse).toBe(true);
    expect(metrics.scrollWidth).toBe(metrics.clientWidth);
    expect(
      metrics.targets.every(target => target.width >= 44 && target.height >= 44),
      `undersized targets: ${JSON.stringify(metrics.targets.filter(target => target.width < 44 || target.height < 44))}`
    ).toBe(true);
    expect(metrics.inputFonts.every(fontSize => fontSize >= 16)).toBe(true);
    expect(
      metrics.navLabels.every(label => label.scrollWidth <= label.clientWidth),
      `clipped nav labels: ${JSON.stringify(metrics.navLabels.filter(label => label.scrollWidth > label.clientWidth))}`
    ).toBe(true);
    expect(metrics.panels.every(panel => panel.ariaHidden === 'true' && panel.inert)).toBe(true);
    expect(metrics.traits.hostWidth).toBeGreaterThan(0);
    expect(
      metrics.traits.renderedPanelWidths.length > 0
        && metrics.traits.renderedPanelWidths.every(width => Math.abs(width - metrics.traits.hostWidth) < 1),
      `Traits widths: ${JSON.stringify(metrics.traits)}`
    ).toBe(true);
    expect(metrics.namedTargets.search?.width).toBeGreaterThanOrEqual(44);
    expect(metrics.namedTargets.search?.height).toBeGreaterThanOrEqual(44);
    expect(metrics.namedTargets.traitCounts.length).toBeGreaterThan(0);
    expect(metrics.namedTargets.traitCounts.every(target => (
      target.width >= 44 && target.height >= 44
    ))).toBe(true);
    expect(metrics.traits.visiblePanels).toBe(1);
  });
}

for (const viewport of COARSE_TABLET_VIEWPORTS) {
  test(`coarse-pointer controls remain usable at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loadRoute(page, '/#/traits');

    const metrics = await page.evaluate(measureShell);
    expect(metrics.pointerCoarse).toBe(true);
    expect(metrics.scrollWidth).toBe(metrics.clientWidth);
    expect(
      metrics.targets.every(target => target.width >= 44 && target.height >= 44),
      `undersized targets: ${JSON.stringify(metrics.targets.filter(target => target.width < 44 || target.height < 44))}`
    ).toBe(true);
    expect(metrics.namedTargets.search?.width).toBeGreaterThanOrEqual(44);
    expect(metrics.namedTargets.search?.height).toBeGreaterThanOrEqual(44);
    expect(metrics.namedTargets.traitCounts.length).toBeGreaterThan(0);
    expect(metrics.namedTargets.traitCounts.every(target => (
      target.width >= 44 && target.height >= 44
    ))).toBe(true);
    expect(metrics.traits.visiblePanels).toBe(1);

    await loadRoute(page, '/#/inventory');
    const inventoryMetrics = await page.evaluate(() => {
      const actions = document.querySelector('.inventory-panel .panel-header .header-actions');
      const controls = [...(actions?.querySelectorAll('button, .db-btn') || [])]
        .filter(control => control.getBoundingClientRect().width > 0)
        .map(control => {
          const rect = control.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        controls
      };
    });
    expect(inventoryMetrics.scrollWidth).toBe(inventoryMetrics.clientWidth);
    expect(inventoryMetrics.controls.length).toBeGreaterThan(0);
    expect(inventoryMetrics.controls.every(control => control.width >= 44 && control.height >= 44)).toBe(true);

    await loadRoute(page, '/#/index');
    await page.locator('details[data-cat="Förmåga"] > summary').click();
    const loadMore = page.locator('button[data-load-more-cat="Förmåga"]');
    await expect(loadMore).toBeVisible();
    const indexTargets = await page.evaluate(() => {
      const root = document.querySelector('shared-toolbar')?.shadowRoot;
      const search = root?.getElementById('searchField');
      const more = document.querySelector('button[data-load-more-cat="Förmåga"]');
      const measure = element => {
        const rect = element?.getBoundingClientRect() || null;
        return rect ? { width: rect.width, height: rect.height } : null;
      };
      return {
        pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
        search: measure(search),
        loadMore: measure(more)
      };
    });
    expect(indexTargets.pointerCoarse).toBe(true);
    expect(indexTargets.search?.width).toBeGreaterThanOrEqual(44);
    expect(indexTargets.search?.height).toBeGreaterThanOrEqual(44);
    expect(indexTargets.loadMore?.width).toBeGreaterThanOrEqual(44);
    expect(indexTargets.loadMore?.height).toBeGreaterThanOrEqual(44);
  });
}

for (const { width, expectedColumns } of [
  { width: 320, expectedColumns: 1 },
  { width: 340, expectedColumns: 1 },
  { width: 360, expectedColumns: 2 }
]) {
  test(`${width}px Inventory header actions use ${expectedColumns} column${expectedColumns === 1 ? '' : 's'} without clipping or overlap`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await loadRoute(page, '/#/inventory');

    const metrics = await page.evaluate(() => {
      const title = document.querySelector('.inventory-panel .panel-header > .db-card__title');
      const actions = document.querySelector('.inventory-panel .panel-header .header-actions');
      const fab = document.querySelector('#invDashFloatBtn');
      const titleRect = title?.getBoundingClientRect() || null;
      const actionsRect = actions?.getBoundingClientRect() || null;
      const fabRect = fab?.getBoundingClientRect() || null;
      const intersects = (left, right) => Boolean(left && right
        && left.left < right.right
        && left.right > right.left
        && left.top < right.bottom
        && left.bottom > right.top);
      const overlaps = titleRect && actionsRect
        ? intersects(titleRect, actionsRect)
        : false;
      const controls = [...(actions?.querySelectorAll('button, .db-btn') || [])].map(control => {
        const rect = control.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      });
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        actionsLeft: actionsRect?.left ?? -1,
        actionsRight: actionsRect?.right ?? -1,
        gridColumns: actions
          ? window.getComputedStyle(actions).gridTemplateColumns.split(/\s+/).filter(Boolean).length
          : 0,
        overlaps,
        fabTitleOverlap: intersects(fabRect, titleRect),
        fabLeft: fabRect?.left ?? -1,
        fabRight: fabRect?.right ?? -1,
        controls
      };
    });

    expect(metrics.scrollWidth).toBe(metrics.clientWidth);
    expect(metrics.actionsLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.actionsRight).toBeLessThanOrEqual(metrics.viewportWidth + 0.5);
    expect(metrics.gridColumns).toBe(expectedColumns);
    expect(metrics.overlaps).toBe(false);
    expect(metrics.fabTitleOverlap).toBe(false);
    expect(metrics.fabLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.fabRight).toBeLessThanOrEqual(metrics.viewportWidth + 0.5);
    expect(metrics.controls.length).toBeGreaterThan(0);
    expect(metrics.controls.every(control => (
      control.left >= 0
      && control.right <= metrics.viewportWidth + 0.5
      && control.width >= 44
      && control.height >= 44
    ))).toBe(true);
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

test('every Traits tab settles as the only visible full-width slide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadRoute(page, '/#/traits');

  const tabs = [
    { name: 'traits', id: 'traitsTabTraits', panelId: 'traitsTabPanel' },
    { name: 'summary', id: 'traitsTabSummary', panelId: 'summaryTabPanel' },
    { name: 'effects', id: 'traitsTabEffects', panelId: 'effectsTabPanel' }
  ];

  for (const tab of tabs) {
    await page.locator(`#${tab.id}`).click();

    await expect.poll(() => page.evaluate(({ id, panelId }) => {
      const host = document.querySelector('.traits-tab-panels');
      const hostRect = host?.getBoundingClientRect() || null;
      const panels = [...document.querySelectorAll('.traits-tab-panel')];
      const visible = panels.filter(panel => {
        if (!hostRect) return false;
        const rect = panel.getBoundingClientRect();
        const style = window.getComputedStyle(panel);
        const intersection = Math.max(
          0,
          Math.min(rect.right, hostRect.right) - Math.max(rect.left, hostRect.left)
        );
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > 0
          && intersection > 1;
      });
      const selectedTab = document.getElementById(id);
      const activePanel = document.getElementById(panelId);
      const activeRect = activePanel?.getBoundingClientRect() || null;
      return {
        selected: selectedTab?.getAttribute('aria-selected') || '',
        current: selectedTab?.getAttribute('aria-current') || '',
        activePanel: activePanel?.classList.contains('active') || false,
        activeAriaHidden: activePanel?.getAttribute('aria-hidden') || '',
        activeWidth: activeRect?.width || 0,
        hostWidth: hostRect?.width || 0,
        visibleIds: visible.map(panel => panel.id),
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    }, tab)).toEqual({
      selected: 'true',
      current: 'page',
      activePanel: true,
      activeAriaHidden: 'false',
      activeWidth: expect.any(Number),
      hostWidth: expect.any(Number),
      visibleIds: [tab.panelId],
      pageOverflow: 0
    });

    const widths = await page.evaluate(({ panelId }) => {
      const hostWidth = document.querySelector('.traits-tab-panels')?.getBoundingClientRect().width || 0;
      const panelWidth = document.getElementById(panelId)?.getBoundingClientRect().width || 0;
      return { hostWidth, panelWidth };
    }, tab);
    expect(widths.hostWidth).toBeGreaterThan(0);
    expect(Math.abs(widths.panelWidth - widths.hostWidth)).toBeLessThan(1);
  }
});

test('Traits panels advance through a real browser swipe gesture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadRoute(page, '/#/traits');

  const host = page.locator('.traits-tab-panels');
  await expect(host).toHaveAttribute('data-swipe-tabs', '1');
  await expect(page.locator('#traitsTabTraits')).toHaveAttribute('aria-selected', 'true');

  const swipeLeft = async () => {
    const box = await host.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('Traits swipe host has no rendered bounds.');
    const y = box.y + Math.min(120, Math.max(24, box.height * 0.2));
    await page.mouse.move(box.x + box.width * 0.82, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.18, y, { steps: 12 });
    await page.mouse.up();
  };

  for (const destination of [
    { tabId: 'traitsTabSummary', panelId: 'summaryTabPanel', hash: '#/summary' },
    { tabId: 'traitsTabEffects', panelId: 'effectsTabPanel', hash: '#/effects' }
  ]) {
    await swipeLeft();
    await expect(page.locator(`#${destination.tabId}`)).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe(destination.hash);

    await expect.poll(() => page.evaluate(panelId => {
      const hostElement = document.querySelector('.traits-tab-panels');
      const hostRect = hostElement?.getBoundingClientRect() || null;
      const panels = [...document.querySelectorAll('.traits-tab-panel')];
      const visibleIds = panels.filter(panel => {
        if (!hostRect) return false;
        const rect = panel.getBoundingClientRect();
        const style = window.getComputedStyle(panel);
        const intersection = Math.max(
          0,
          Math.min(rect.right, hostRect.right) - Math.max(rect.left, hostRect.left)
        );
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number.parseFloat(style.opacity || '1') > 0
          && intersection > 1;
      }).map(panel => panel.id);
      const activeRect = document.getElementById(panelId)?.getBoundingClientRect() || null;
      return {
        visibleIds,
        hostHasWidth: (hostRect?.width || 0) > 0,
        widthAligned: Math.abs((activeRect?.width || 0) - (hostRect?.width || 0)) < 1
      };
    }, destination.panelId)).toEqual({
      visibleIds: [destination.panelId],
      hostHasWidth: true,
      widthAligned: true
    });
  }
});

test('Character Tools uses the 700px two-column desktop shell and one-column mobile form', async ({ page }) => {
  const openFromFunctionsDrawer = async () => {
    const toolbar = page.locator('shared-toolbar');
    if ((await toolbar.locator('#filterPanel').getAttribute('aria-hidden')) !== 'false') {
      await toolbar.locator('#filterToggle').click();
    }
    await expect(toolbar.locator('#filterPanel')).toHaveAttribute('aria-hidden', 'false');
    const toolsButton = toolbar.locator('#characterToolsBtn');
    if (!(await toolsButton.isVisible())) {
      await toolbar.locator('#filterFormalCard .card-title').click();
    }
    await expect(toolsButton).toBeVisible();
    await toolsButton.click();
    await expect(page.locator('#characterToolsPopup')).toBeVisible();
    await expect(page.locator('#characterToolsPopup .tools-panel.active .tools-card')).toBeVisible();
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await loadRoute(page, '/#/character');
  await openFromFunctionsDrawer();

  const desktop = await page.locator('#characterToolsPopup').evaluate(popup => {
    const modal = popup.querySelector('.db-modal');
    const grids = [...popup.querySelectorAll('.tools-panel.active .tools-grid.two-col')]
      .filter(grid => grid.getBoundingClientRect().height > 0);
    const modalRect = modal?.getBoundingClientRect() || null;
    return {
      modalWidth: modalRect?.width || 0,
      modalLeft: modalRect?.left ?? -1,
      modalRight: modalRect?.right ?? -1,
      gridColumns: grids.map(grid => window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length),
      horizontalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 1
    };
  });

  expect(desktop.modalWidth).toBeGreaterThanOrEqual(699);
  expect(desktop.modalWidth).toBeLessThanOrEqual(701);
  expect(desktop.modalLeft).toBeGreaterThanOrEqual(0);
  expect(desktop.modalRight).toBeLessThanOrEqual(1280);
  expect(desktop.gridColumns.length).toBeGreaterThan(0);
  expect(desktop.gridColumns.every(columns => columns === 2)).toBe(true);
  expect(desktop.horizontalOverflow).toBeLessThanOrEqual(0);

  await page.locator('#characterToolsPopup .db-modal__close').click();
  await expect(page.locator('#characterToolsPopup')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await openFromFunctionsDrawer();

  const mobile = await page.locator('#characterToolsPopup').evaluate(popup => {
    const modal = popup.querySelector('.db-modal');
    const grids = [...popup.querySelectorAll('.tools-panel.active .tools-grid.two-col')]
      .filter(grid => grid.getBoundingClientRect().height > 0);
    const modalRect = modal?.getBoundingClientRect() || null;
    return {
      viewportWidth: window.innerWidth,
      modalWidth: modalRect?.width || 0,
      modalLeft: modalRect?.left ?? -1,
      modalRight: modalRect?.right ?? -1,
      gridColumns: grids.map(grid => window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length),
      horizontalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 1,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  expect(mobile.modalWidth).toBeGreaterThan(0);
  expect(mobile.modalWidth).toBeLessThan(mobile.viewportWidth);
  expect(mobile.modalLeft).toBeGreaterThanOrEqual(0);
  expect(mobile.modalRight).toBeLessThanOrEqual(mobile.viewportWidth);
  expect(mobile.gridColumns.length).toBeGreaterThan(0);
  expect(mobile.gridColumns.every(columns => columns === 1)).toBe(true);
  expect(mobile.horizontalOverflow).toBeLessThanOrEqual(0);
  expect(mobile.pageOverflow).toBe(0);
});
