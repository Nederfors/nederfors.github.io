import { expect, test } from '@playwright/test';

const MOBILE_PROJECTS = new Set(['Mobile Chrome', 'Mobile Safari']);
const PHONE_VIEWPORTS = [
  { name: 'minimum portrait', width: 320, height: 700 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 }
];

async function waitForApp(page) {
  await page.goto('/#/index');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Boolean(document.querySelector('shared-toolbar')?.shadowRoot)
  ));
}

async function seedInventoryPopupProfile(page) {
  await page.addInitScript(() => {
    const id = 'mobile-inventory-popup';
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: id,
      characters: [{ id, name: 'Popup Scroll', folderId: 'fd-standard' }],
      folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
      activeFolder: 'ALL',
      filterUnion: false,
      compactEntries: true,
      onlySelected: false,
      recentSearches: [],
      liveMode: false,
      entrySort: 'alpha-asc'
    }));
    localStorage.setItem(`rpall-char-${id}`, JSON.stringify({
      list: [],
      inventory: [],
      custom: [],
      traits: {},
      notes: {},
      money: { daler: 50, skilling: 0, 'örtegar': 0 }
    }));
  });
}

async function expectInventoryPopupEndReachable(page, tabId, actionSelector) {
  const popup = page.locator('#inventoryItemsPopup');
  const body = popup.locator('.popup-modal-body');
  await expect(popup.locator(`.tools-tab[data-tab="${tabId}"]`)).toHaveAttribute('aria-selected', 'true');

  const initial = await popup.evaluate((root, selector) => {
    const scrollBody = root.querySelector('.popup-modal-body');
    const swipeHost = root.querySelector('.inventory-hub-panels[data-swipe-tabs="1"]');
    const action = root.querySelector(selector);
    const bodyRect = scrollBody?.getBoundingClientRect();
    const actionRect = action?.getBoundingClientRect();
    return {
      bodyScrollable: Boolean(scrollBody && scrollBody.scrollHeight > scrollBody.clientHeight + 1),
      bodyTouchAction: scrollBody ? window.getComputedStyle(scrollBody).touchAction : '',
      swipeHostShrinks: Boolean(
        swipeHost && swipeHost.scrollHeight > swipeHost.clientHeight + 1
      ),
      actionStartsBelowBody: Boolean(
        bodyRect && actionRect && actionRect.bottom > bodyRect.bottom + 1
      )
    };
  }, actionSelector);

  expect(initial.bodyScrollable, `${tabId} does not expose popup overflow`).toBe(true);
  expect(initial.bodyTouchAction).toBe('pan-y');
  expect(initial.swipeHostShrinks, `${tabId} swipe host clips its active panel`).toBe(false);
  expect(initial.actionStartsBelowBody, `${tabId} fixture is not dense enough`).toBe(true);

  await body.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(popup.locator(actionSelector)).toBeInViewport();
  await body.evaluate(element => {
    element.scrollTop = 0;
  });
}

async function openPopupFixture(page) {
  await page.evaluate(() => {
    document.getElementById('mobilePopupFixture')?.remove();
    const popup = document.createElement('div');
    popup.id = 'mobilePopupFixture';
    popup.className = 'db-modal-overlay popup';
    popup.setAttribute('aria-hidden', 'true');
    popup.innerHTML = `
      <div class="db-modal popup-inner">
        <header class="popup-header">
          <div class="fixture-header-copy">
            <div id="mobilePopupKicker">Verktyg och inställningar</div>
            <h2 id="mobilePopupTitle">En avsiktligt lång popuprubrik som får använda högst två rader</h2>
            <p id="mobilePopupSubtitle">Den här instruktionen ska ligga i den skrollbara dialogdelen.</p>
            <div id="mobilePopupStatus" role="status" aria-live="polite"></div>
          </div>
          <button id="mobilePopupClose" type="button" aria-label="Stäng">×</button>
        </header>
        <section id="mobilePopupContent">
          ${Array.from({ length: 36 }, (_, index) => `<p>Skrollbart innehåll ${index + 1}</p>`).join('')}
          <label for="mobilePopupInput">Sista fältet</label>
          <input id="mobilePopupInput" type="text" value="Nås längst ned">
          <div id="mobilePopupEnd">Slut på dialogen</div>
        </section>
        <div class="button-row"><button id="mobilePopupSave" type="button">Spara</button></div>
      </div>
    `;
    document.body.appendChild(popup);
    const options = {
      type: 'form',
      size: 'lg',
      layoutFamily: 'modal',
      mobileMode: 'center',
      touchProfile: 'none'
    };
    window.popupUi.normalizeModal(popup, options);
    window.popupManager.register(popup, options);
    window.registerOverlayElement?.(popup);
    window.popupManager.open(popup, options);
  });
  await expect(page.locator('#mobilePopupFixture')).toBeVisible();
  await page.waitForTimeout(50);
}

test('phone popups use one fullscreen visual-viewport shell', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name), 'Mobile browser projects own the phone popup contract.');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page);
  await openPopupFixture(page);

  for (const viewport of PHONE_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.popupUi.syncVisualViewport());
    await expect.poll(() => page.evaluate(() => {
      const cssHeight = Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue('--popup-visual-viewport-height')
      );
      return Math.abs(cssHeight - (window.visualViewport?.height || window.innerHeight));
    }), `${viewport.name} visual viewport variable did not settle`).toBeLessThanOrEqual(1);

    const geometry = await page.locator('#mobilePopupFixture').evaluate(popup => {
      const modal = popup.querySelector('.db-modal');
      const header = popup.querySelector('.popup-modal-header');
      const title = popup.querySelector('.db-modal__title');
      const close = popup.querySelector('.db-modal__close');
      const body = popup.querySelector('.popup-modal-body');
      const footer = popup.querySelector('.popup-modal-footer');
      const intro = body?.querySelector(':scope > .popup-modal-intro');
      const rect = element => element?.getBoundingClientRect() || null;
      const modalRect = rect(modal);
      const headerRect = rect(header);
      const closeRect = rect(close);
      const bodyRect = rect(body);
      const footerRect = rect(footer);
      const visualViewport = window.visualViewport;
      const scrollableElements = [body, ...Array.from(body?.querySelectorAll('*') || [])]
        .filter(Boolean)
        .filter(element => {
          const overflowY = window.getComputedStyle(element).overflowY;
          return /(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight + 1;
        })
        .map(element => element.className || element.id || element.tagName);

      return {
        modal: modalRect && {
          left: modalRect.left,
          top: modalRect.top,
          width: modalRect.width,
          height: modalRect.height,
          right: modalRect.right,
          bottom: modalRect.bottom
        },
        headerHeight: headerRect?.height || 0,
        closeWidth: closeRect?.width || 0,
        closeHeight: closeRect?.height || 0,
        bodyHeight: bodyRect?.height || 0,
        bodyScrollable: Boolean(body && body.scrollHeight > body.clientHeight + 1),
        bodyTouchAction: body ? window.getComputedStyle(body).touchAction : '',
        headerTouchAction: header ? window.getComputedStyle(header).touchAction : '',
        footerBottom: footerRect?.bottom || 0,
        viewport: {
          left: visualViewport?.offsetLeft || 0,
          top: visualViewport?.offsetTop || 0,
          width: visualViewport?.width || window.innerWidth,
          height: visualViewport?.height || window.innerHeight
        },
        directHeaderExtras: Array.from(header?.children || [])
          .filter(element => element !== title && element !== close)
          .map(element => element.id || element.className || element.tagName),
        introContainsSupportingCopy: Boolean(
          intro?.querySelector('#mobilePopupKicker')
          && intro?.querySelector('#mobilePopupSubtitle')
          && intro?.querySelector('#mobilePopupStatus')
        ),
        labelledBy: modal?.getAttribute('aria-labelledby') || '',
        titleId: title?.id || '',
        horizontalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 1,
        pageHorizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollableElements
      };
    });

    expect(geometry.modal, `${viewport.name} modal has no geometry`).not.toBeNull();
    expect(Math.abs(geometry.modal.left - geometry.viewport.left), viewport.name).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.modal.top - geometry.viewport.top), viewport.name).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.modal.width - geometry.viewport.width), viewport.name).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.modal.height - geometry.viewport.height), viewport.name).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.footerBottom - geometry.modal.bottom), viewport.name).toBeLessThanOrEqual(1);
    expect(geometry.headerHeight, `${viewport.name} header is oversized`).toBeLessThanOrEqual(88);
    expect(geometry.closeWidth).toBeGreaterThanOrEqual(44);
    expect(geometry.closeHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.bodyHeight).toBeGreaterThan(0);
    expect(geometry.bodyScrollable).toBe(true);
    expect(geometry.bodyTouchAction).toBe('pan-y');
    expect(geometry.headerTouchAction).toBe('pan-x');
    expect(geometry.directHeaderExtras).toEqual([]);
    expect(geometry.introContainsSupportingCopy).toBe(true);
    expect(geometry.labelledBy).toBe(geometry.titleId);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(geometry.pageHorizontalOverflow).toBe(0);
    expect(geometry.scrollableElements).toEqual(['db-modal__body popup-modal-body']);

    await testInfo.attach(
      `phone-popup-${testInfo.project.name.toLowerCase().replace(/\s+/g, '-')}-${viewport.width}x${viewport.height}`,
      { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' }
    );

    const endIsReachable = await page.locator('#mobilePopupFixture .popup-modal-body').evaluate(body => {
      body.scrollTop = body.scrollHeight;
      const bodyRect = body.getBoundingClientRect();
      const endRect = body.querySelector('#mobilePopupEnd')?.getBoundingClientRect();
      return Boolean(endRect && endRect.top >= bodyRect.top && endRect.bottom <= bodyRect.bottom + 1);
    });
    expect(endIsReachable, `${viewport.name} cannot scroll to the final control`).toBe(true);

    await page.locator('#mobilePopupInput').focus();
    const focusedGeometry = await page.locator('#mobilePopupFixture').evaluate(popup => {
      const input = popup.querySelector('#mobilePopupInput');
      const body = popup.querySelector('.popup-modal-body');
      const footer = popup.querySelector('.popup-modal-footer');
      const inputRect = input?.getBoundingClientRect() || null;
      const bodyRect = body?.getBoundingClientRect() || null;
      const footerRect = footer?.getBoundingClientRect() || null;
      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop || 0;
      const visibleBottom = visibleTop + (viewport?.height || window.innerHeight);
      return {
        activeId: document.activeElement?.id || '',
        inputWithinBody: Boolean(
          inputRect && bodyRect
          && inputRect.top >= bodyRect.top - 1
          && inputRect.bottom <= bodyRect.bottom + 1
        ),
        footerWithinVisualViewport: Boolean(
          footerRect
          && footerRect.top >= visibleTop - 1
          && footerRect.bottom <= visibleBottom + 1
        )
      };
    });
    expect(focusedGeometry.activeId).toBe('mobilePopupInput');
    expect(focusedGeometry.inputWithinBody, `${viewport.name} focused input escaped the body scroller`).toBe(true);
    expect(
      focusedGeometry.footerWithinVisualViewport,
      `${viewport.name} footer escaped the visual viewport after focus`
    ).toBe(true);
  }

  // Desktop browser emulation cannot summon a software keyboard. Shrinking the
  // visible viewport while the final input owns focus exercises the same
  // visualViewport-driven layout path used when a phone keyboard opens.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobilePopupInput').focus();
  await page.setViewportSize({ width: 390, height: 480 });
  await page.evaluate(() => window.popupUi.syncVisualViewport());
  await page.locator('#mobilePopupInput').scrollIntoViewIfNeeded();
  const keyboardGeometry = await page.locator('#mobilePopupFixture').evaluate(popup => {
    const modal = popup.querySelector('.db-modal');
    const input = popup.querySelector('#mobilePopupInput');
    const body = popup.querySelector('.popup-modal-body');
    const footer = popup.querySelector('.popup-modal-footer');
    const viewport = window.visualViewport;
    const visibleTop = viewport?.offsetTop || 0;
    const visibleBottom = visibleTop + (viewport?.height || window.innerHeight);
    const within = element => {
      const rect = element?.getBoundingClientRect();
      return Boolean(rect && rect.top >= visibleTop - 1 && rect.bottom <= visibleBottom + 1);
    };
    const inputRect = input?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    return {
      modalHeight: modal?.getBoundingClientRect().height || 0,
      viewportHeight: viewport?.height || window.innerHeight,
      inputWithinBody: Boolean(
        inputRect && bodyRect
        && inputRect.top >= bodyRect.top - 1
        && inputRect.bottom <= bodyRect.bottom + 1
      ),
      footerVisible: within(footer),
      closeVisible: within(popup.querySelector('.db-modal__close'))
    };
  });
  expect(Math.abs(keyboardGeometry.modalHeight - keyboardGeometry.viewportHeight)).toBeLessThanOrEqual(1);
  expect(keyboardGeometry.inputWithinBody).toBe(true);
  expect(keyboardGeometry.footerVisible).toBe(true);
  expect(keyboardGeometry.closeVisible).toBe(true);
  await testInfo.attach(
    `phone-popup-${testInfo.project.name.toLowerCase().replace(/\s+/g, '-')}-keyboard`,
    { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' }
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.popupUi.syncVisualViewport());

  const inheritedViewport = await page.evaluate(() => {
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    const popup = root?.getElementById('characterToolsPopup');
    return {
      rootHeight: window.getComputedStyle(document.documentElement).getPropertyValue('--popup-visual-viewport-height').trim(),
      shadowPopupHeight: popup
        ? window.getComputedStyle(popup).getPropertyValue('--popup-visual-viewport-height').trim()
        : ''
    };
  });
  expect(inheritedViewport.rootHeight).toBeTruthy();
  expect(inheritedViewport.shadowPopupHeight).toBe(inheritedViewport.rootHeight);
});

test('dense inventory swipe tabs scroll to every quantity and vehicle action', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name), 'Mobile browser projects own the inventory popup touch contract.');

  await seedInventoryPopupProfile(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/#/inventory');
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
    && Array.isArray(window.DB)
    && window.DB.length > 36
    && Boolean(document.querySelector('shared-toolbar')?.shadowRoot)
  ));
  await page.evaluate(() => {
    const vehicle = window.DB.find(entry => entry?.taggar?.typ?.includes('Färdmedel'));
    const items = window.DB
      .filter(entry => window.isInv?.(entry) && !entry?.taggar?.typ?.includes('Färdmedel'))
      .slice(0, 36);
    if (!vehicle || items.length < 36) throw new Error('Inventory popup fixture data is incomplete.');

    const rows = items.map((entry, index) => ({
      id: entry.id,
      name: entry.namn,
      qty: (index % 3) + 1,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    }));
    window.invUtil.saveInventory([
      ...rows.slice(12),
      {
        id: vehicle.id,
        name: vehicle.namn,
        qty: 1,
        gratis: 0,
        gratisKval: [],
        removedKval: [],
        contains: rows.slice(0, 12)
      }
    ]);
    window.invUtil.renderInventory();
  });

  await page.locator('#overviewToggle').click();
  await expect(page.locator('#invDashPanel')).toBeVisible();
  await page.locator('#invDashPanel button[data-dash-trigger="manageItemsBtn"]').click();
  const popup = page.locator('#inventoryItemsPopup');
  await expect(popup).toBeVisible();

  await popup.locator('.tools-tab[data-tab="bulk-qty"]').click();
  await expect.poll(() => popup.locator('#qtyItemList input[data-path]').count()).toBeGreaterThan(30);
  await expectInventoryPopupEndReachable(page, 'bulk-qty', '#qtyPopup .confirm-row');

  await popup.locator('.tools-tab[data-tab="vehicle-load"]').click();
  await expect.poll(() => popup.locator('#vehicleItemList input[data-path]').count()).toBeGreaterThan(20);
  await expectInventoryPopupEndReachable(page, 'vehicle-load', '#vehiclePopup .confirm-row');

  await popup.locator('.tools-tab[data-tab="vehicle-unload"]').click();
  await expect.poll(() => popup.locator('#vehicleRemoveItemList input[data-path]').count()).toBeGreaterThan(10);
  await expectInventoryPopupEndReachable(page, 'vehicle-unload', '#vehicleRemovePopup .confirm-row');

  await popup.locator('#vehicleRemoveCancel').scrollIntoViewIfNeeded();
  await popup.locator('#vehicleRemoveCancel').click();
  await expect(popup).toBeHidden();
});

test('legacy master popup normalizes to a compact single-scroller phone shell without changing tablet sizing', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name), 'Mobile browser projects own the phone popup contract.');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page);
  await page.evaluate(() => {
    document.getElementById('masterPopup')?.remove();
    const popup = document.createElement('div');
    popup.id = 'masterPopup';
    popup.className = 'popup';
    popup.setAttribute('aria-hidden', 'true');
    popup.innerHTML = `
      <div class="popup-inner">
        <div class="master-header">
          <h3>Valj installningar for en avsiktligt lang mastarfunktion</h3>
          <p id="masterSubtitle">Stodtext ska flyttas till den skrollbara dialogdelen.</p>
        </div>
        <div id="masterOpts">
          ${Array.from({ length: 48 }, (_, index) => `<p>Val ${index + 1}</p>`).join('')}
          <input id="masterLastControl" value="Sista kontrollen">
        </div>
        <div id="masterBtns">
          <button id="masterCancel" type="button">Avbryt</button>
          <button id="masterAdd" type="button">Lagg till</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);
    const options = { type: 'picker', size: 'lg', layoutFamily: 'modal', touchProfile: 'none' };
    window.popupUi.normalizeModal(popup, options);
    window.popupManager.register(popup, options);
    window.registerOverlayElement?.(popup);
    window.popupManager.open(popup, options);
  });
  await expect(page.locator('#masterPopup')).toBeVisible();

  const phoneLayout = await page.locator('#masterPopup').evaluate(popup => {
    const header = popup.querySelector('.popup-modal-header');
    const body = popup.querySelector('.popup-modal-body');
    const options = popup.querySelector('#masterOpts');
    const scrollableElements = [body, ...Array.from(body?.querySelectorAll('*') || [])]
      .filter(Boolean)
      .filter(element => {
        const overflowY = window.getComputedStyle(element).overflowY;
        return /(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight + 1;
      })
      .map(element => element.className || element.id || element.tagName);
    return {
      headerDirection: header ? window.getComputedStyle(header).flexDirection : '',
      headerHeight: header?.getBoundingClientRect().height || 0,
      optionsOverflowY: options ? window.getComputedStyle(options).overflowY : '',
      subtitleInBody: Boolean(body?.querySelector('#masterSubtitle')),
      scrollableElements
    };
  });
  expect(phoneLayout.headerDirection).toBe('row');
  expect(phoneLayout.headerHeight).toBeLessThanOrEqual(88);
  expect(phoneLayout.optionsOverflowY).toBe('visible');
  expect(phoneLayout.subtitleInBody).toBe(true);
  expect(phoneLayout.scrollableElements).toEqual(['db-modal__body popup-modal-body']);
  await testInfo.attach(
    `master-popup-${testInfo.project.name.toLowerCase().replace(/\s+/g, '-')}-390x844`,
    { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' }
  );

  await page.setViewportSize({ width: 1024, height: 600 });
  await page.evaluate(() => window.popupUi.syncVisualViewport());
  const tabletLayout = await page.locator('#masterPopup').evaluate(popup => {
    const modal = popup.querySelector('.db-modal');
    const rect = modal?.getBoundingClientRect();
    return {
      phoneContractMatches: window.matchMedia(
        '(max-width: 640px), (max-height: 500px) and (pointer: coarse)'
      ).matches,
      width: rect?.width || 0,
      height: rect?.height || 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      borderRadius: Number.parseFloat(modal ? window.getComputedStyle(modal).borderRadius : '0')
    };
  });
  expect(tabletLayout.phoneContractMatches).toBe(false);
  expect(tabletLayout.width).toBeLessThan(tabletLayout.viewportWidth);
  expect(tabletLayout.height).toBeLessThan(tabletLayout.viewportHeight);
  expect(tabletLayout.borderRadius).toBeGreaterThan(0);
});

test('body touch stays scrollable and only a header swipe dismisses the phone popup', async ({ page }, testInfo) => {
  test.skip(!MOBILE_PROJECTS.has(testInfo.project.name), 'Mobile browser projects own the phone popup touch contract.');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForApp(page);
  await openPopupFixture(page);

  const bodyTouch = await page.locator('#mobilePopupFixture').evaluate(popup => {
    const body = popup.querySelector('.popup-modal-body');
    if (!(body instanceof HTMLElement)) return null;
    body.scrollTop = Math.min(180, body.scrollHeight - body.clientHeight);

    const dispatchTouch = (target, type, x, y, active = true) => {
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
      const touch = { identifier: 1, target, clientX: x, clientY: y };
      Object.defineProperty(event, 'touches', { value: active ? [touch] : [] });
      Object.defineProperty(event, 'changedTouches', { value: [touch] });
      const accepted = target.dispatchEvent(event);
      return { accepted, defaultPrevented: event.defaultPrevented };
    };

    const box = body.getBoundingClientRect();
    dispatchTouch(body, 'touchstart', box.left + 20, box.top + 180);
    const move = dispatchTouch(body, 'touchmove', box.left + 20, box.top + 80);
    dispatchTouch(body, 'touchend', box.left + 20, box.top + 80, false);
    return {
      move,
      scrollTop: body.scrollTop,
      popupOpen: popup.classList.contains('open'),
      touchUi: Boolean(window.daubMotion?.isTouchUi?.())
    };
  });

  expect(bodyTouch?.touchUi).toBe(true);
  expect(bodyTouch?.scrollTop).toBeGreaterThan(0);
  expect(bodyTouch?.move.defaultPrevented).toBe(false);
  expect(bodyTouch?.move.accepted).toBe(true);
  expect(bodyTouch?.popupOpen).toBe(true);
  await expect(page.locator('#mobilePopupFixture')).toBeVisible();

  const headerTouch = await page.locator('#mobilePopupFixture').evaluate(popup => {
    const header = popup.querySelector('.popup-modal-header');
    const modal = popup.querySelector('.db-modal');
    if (!(header instanceof HTMLElement) || !(modal instanceof HTMLElement)) return null;

    const dispatchTouch = (target, type, x, y, active = true) => {
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
      const touch = { identifier: 2, target, clientX: x, clientY: y };
      Object.defineProperty(event, 'touches', { value: active ? [touch] : [] });
      Object.defineProperty(event, 'changedTouches', { value: [touch] });
      const accepted = target.dispatchEvent(event);
      return { accepted, defaultPrevented: event.defaultPrevented };
    };

    const box = header.getBoundingClientRect();
    const x = box.left + Math.min(80, box.width / 3);
    const startY = box.top + Math.min(24, box.height / 2);
    dispatchTouch(header, 'touchstart', x, startY);
    const move = dispatchTouch(header, 'touchmove', x, startY + 220);
    const transformedDuringSwipe = modal.style.transform.includes('translate3d');
    dispatchTouch(header, 'touchend', x, startY + 220, false);
    return { move, transformedDuringSwipe };
  });

  expect(headerTouch?.move.defaultPrevented).toBe(true);
  expect(headerTouch?.move.accepted).toBe(false);
  expect(headerTouch?.transformedDuringSwipe).toBe(true);
  await expect(page.locator('#mobilePopupFixture')).toBeHidden();
});
