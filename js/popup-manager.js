(function(window){
  if (window.popupManager) return;

  const TYPE_DEFAULTS = Object.freeze({
    dialog: Object.freeze({ backdrop: true, escape: true }),
    picker: Object.freeze({ backdrop: true, escape: true }),
    form: Object.freeze({ backdrop: true, escape: true }),
    hub: Object.freeze({ backdrop: true, escape: true })
  });

  const entries = new Map();
  const sessions = new Map();
  const stack = [];
  const openStateById = new Map();
  const observedRoots = new Set();
  const rootObservers = new Map();
  const internalCloseIds = new Set();
  const managedBackgroundInert = new Map();
  const managedAriaModal = new Map();
  const managedZIndex = new Map();
  const POPUP_Z_BASE = 4000;
  const RESTORE_TARGET_MAX_AGE_MS = 1500;
  let lastInteractionTarget = null;
  let lastInteractionAt = 0;
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const DEFAULT_TYPE = 'form';
  const TOUCH_PROFILE_SET = new Set(['panel-right', 'sheet-down', 'none']);
  const MOBILE_MODE_SET = new Set(['center', 'sheet']);

  function normalizeType(type) {
    const key = String(type || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(TYPE_DEFAULTS, key) ? key : DEFAULT_TYPE;
  }

  function normalizeSize(size) {
    return String(size || '').trim().toLowerCase();
  }

  function normalizeLayoutFamily(layoutFamily) {
    return String(layoutFamily || '').trim().toLowerCase();
  }

  function normalizeMobileMode(mobileMode) {
    const key = String(mobileMode || '').trim().toLowerCase();
    return MOBILE_MODE_SET.has(key) ? key : '';
  }

  function normalizePolicy(type, dismissPolicy) {
    const base = TYPE_DEFAULTS[normalizeType(type)] || TYPE_DEFAULTS[DEFAULT_TYPE];
    if (!dismissPolicy || typeof dismissPolicy !== 'object') return { ...base };
    return {
      backdrop: dismissPolicy.backdrop === undefined ? base.backdrop : Boolean(dismissPolicy.backdrop),
      escape: dismissPolicy.escape === undefined ? base.escape : Boolean(dismissPolicy.escape)
    };
  }

  function normalizeTouchProfile(type, touchProfile) {
    const raw = String(touchProfile || '').trim().toLowerCase();
    if (TOUCH_PROFILE_SET.has(raw)) return raw;
    if (typeof window.daubMotion?.defaultTouchProfile === 'function') {
      const fallback = window.daubMotion.defaultTouchProfile(type);
      return TOUCH_PROFILE_SET.has(fallback) ? fallback : 'none';
    }
    return normalizeType(type) === 'dialog' ? 'none' : 'sheet-down';
  }

  function resolveId(target) {
    if (typeof target === 'string') return target.trim();
    if (target && typeof target === 'object' && typeof target.id === 'string') return target.id.trim();
    return '';
  }

  function isDaubOverlay(el) {
    return el && el.classList?.contains('db-modal-overlay');
  }

  function isDrawerOverlay(el) {
    return Boolean(el?.classList?.contains('offcanvas') || el?.classList?.contains('db-drawer'));
  }

  function isManagedOverlay(el) {
    return Boolean(
      el?.classList?.contains('popup')
      || el?.classList?.contains('db-modal-overlay')
      || isDrawerOverlay(el)
    );
  }

  function collectPopupElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('.popup[id], .db-modal-overlay[id], .offcanvas[id], .db-drawer[id]'));
  }

  function getAllKnownRoots() {
    const roots = [];
    if (typeof document !== 'undefined') roots.push(document);
    observedRoots.forEach(root => {
      if (root && !roots.includes(root)) roots.push(root);
    });
    return roots;
  }

  function getDeepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active instanceof HTMLElement ? active : null;
  }

  function rememberInteractionTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const target = path.find(node => (
      node instanceof HTMLElement && node.matches?.(FOCUSABLE_SELECTOR)
    ));
    if (!target) return;
    lastInteractionTarget = target;
    lastInteractionAt = window.performance?.now?.() || Date.now();
  }

  function isUsableRestoreTarget(target, overlay) {
    return Boolean(
      target instanceof HTMLElement
      && target.isConnected
      && target !== document.body
      && target !== document.documentElement
      && target !== overlay
      && !overlay?.contains?.(target)
    );
  }

  function resolveRestoreFocus(overlay) {
    const active = getDeepActiveElement();
    if (isUsableRestoreTarget(active, overlay) && active.matches?.(FOCUSABLE_SELECTOR)) {
      return active;
    }
    const now = window.performance?.now?.() || Date.now();
    if (
      now - lastInteractionAt <= RESTORE_TARGET_MAX_AGE_MS
      && isUsableRestoreTarget(lastInteractionTarget, overlay)
    ) {
      return lastInteractionTarget;
    }
    if (isUsableRestoreTarget(active, overlay)) return active;
    return null;
  }

  function getFocusableElements(container) {
    if (!(container instanceof Element)) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => {
      if (!(element instanceof HTMLElement) || element.closest('[inert]')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
  }

  function focusOverlay(element) {
    if (!(element instanceof HTMLElement)) return;
    window.requestAnimationFrame(() => {
      const active = getDeepActiveElement();
      if (active && element.contains(active)) return;
      const surface = element.querySelector('.popup-inner, .db-modal, .db-drawer__panel') || element;
      const target = getFocusableElements(surface)[0] || surface;
      if (target === surface && !surface.hasAttribute('tabindex')) surface.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
    });
  }

  function forEachKnownElement(selector, callback) {
    getAllKnownRoots().forEach(root => {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      root.querySelectorAll(selector).forEach(callback);
    });
  }

  function getDialogSurface(element) {
    if (!(element instanceof HTMLElement)) return null;
    return element.querySelector(
      '.db-modal[role="dialog"], .popup-inner[role="dialog"], .db-drawer__panel[role="dialog"]'
    ) || element.querySelector('.db-modal, .popup-inner, .db-drawer__panel') || element;
  }

  function restoreManagedBackground() {
    managedBackgroundInert.forEach((hadInert, element) => {
      if (!(element instanceof HTMLElement)) return;
      if (hadInert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    });
    managedBackgroundInert.clear();
  }

  function makeBackgroundInert(element) {
    if (!(element instanceof HTMLElement)) return;
    if (!managedBackgroundInert.has(element)) {
      managedBackgroundInert.set(element, element.hasAttribute('inert'));
    }
    element.setAttribute('inert', '');
  }

  function inertSiblingsAlongComposedPath(top) {
    let current = top;
    while (current) {
      const parent = current.parentNode;
      if (parent instanceof ShadowRoot) {
        Array.from(parent.children).forEach(sibling => {
          if (sibling !== current) makeBackgroundInert(sibling);
        });
        current = parent.host;
        continue;
      }
      if (parent instanceof HTMLElement) {
        Array.from(parent.children).forEach(sibling => {
          if (sibling !== current) makeBackgroundInert(sibling);
        });
        current = parent;
        continue;
      }
      break;
    }
  }

  function restoreManagedAriaModal() {
    managedAriaModal.forEach((state, surface) => {
      if (!(surface instanceof HTMLElement)) return;
      if (state.hadAttribute) surface.setAttribute('aria-modal', state.value);
      else surface.removeAttribute('aria-modal');
    });
    managedAriaModal.clear();
  }

  function setManagedAriaModal(surface, value) {
    if (!(surface instanceof HTMLElement)) return;
    if (!managedAriaModal.has(surface)) {
      managedAriaModal.set(surface, {
        hadAttribute: surface.hasAttribute('aria-modal'),
        value: surface.getAttribute('aria-modal') || ''
      });
    }
    surface.setAttribute('aria-modal', value);
  }

  function restoreManagedZIndexes() {
    managedZIndex.forEach((value, element) => {
      if (!(element instanceof HTMLElement)) return;
      if (value) element.style.zIndex = value;
      else element.style.removeProperty('z-index');
    });
    managedZIndex.clear();
  }

  function setManagedZIndex(element, value) {
    if (!(element instanceof HTMLElement)) return;
    if (!managedZIndex.has(element)) managedZIndex.set(element, element.style.zIndex);
    element.style.zIndex = String(value);
  }

  function normalizeDrawerSemantics(element) {
    if (!(element instanceof HTMLElement) || !isDrawerOverlay(element)) return;
    const surface = element.querySelector('.db-drawer__panel');
    if (!(surface instanceof HTMLElement) || surface === element) return;
    surface.setAttribute('role', 'dialog');
    surface.setAttribute('aria-modal', 'true');
    element.removeAttribute('role');
    element.removeAttribute('aria-modal');
  }

  function restoreManagedUnderlay(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.dataset.popupManagedInert === 'true') {
      element.removeAttribute('inert');
      delete element.dataset.popupManagedInert;
    }
    element.removeAttribute('data-popup-underlay');
  }

  function coverWithTopOverlay(element) {
    if (!(element instanceof HTMLElement)) return;
    if (!element.hasAttribute('inert')) {
      element.dataset.popupManagedInert = 'true';
      element.setAttribute('inert', '');
    }
    element.dataset.popupUnderlay = 'true';
    setManagedAriaModal(getDialogSurface(element), 'false');
  }

  function syncOverlayStack() {
    restoreManagedBackground();
    restoreManagedAriaModal();
    restoreManagedZIndexes();
    forEachKnownElement('[data-popup-underlay], [data-popup-managed-inert="true"]', restoreManagedUnderlay);

    const openPopups = stack
      .map(id => entries.get(id)?.element || findElementById(id))
      .filter(element => element instanceof HTMLElement && isPopupOpen(element.id));
    openPopups.forEach((element, index) => {
      normalizeDrawerSemantics(element);
      setManagedZIndex(element, POPUP_Z_BASE + (index * 20));
    });

    const top = openPopups[openPopups.length - 1];
    if (!top) return;

    openPopups.slice(0, -1).forEach(coverWithTopOverlay);
    inertSiblingsAlongComposedPath(top);
    restoreManagedUnderlay(top);
    setManagedAriaModal(getDialogSurface(top), 'true');
  }

  function findElementById(id) {
    if (!id) return null;
    try {
      const fromDocument = document.getElementById(id);
      if (fromDocument) return fromDocument;
    } catch {}

    const roots = getAllKnownRoots();
    for (const root of roots) {
      if (!root || typeof root.getElementById !== 'function') continue;
      try {
        const hit = root.getElementById(id);
        if (hit) return hit;
      } catch {}
    }

    return null;
  }

  function removeFromStack(id) {
    const idx = stack.lastIndexOf(id);
    if (idx >= 0) stack.splice(idx, 1);
  }

  function pushToStack(id) {
    if (!id) return;
    removeFromStack(id);
    stack.push(id);
  }

  function isPopupOpen(id) {
    const entry = entries.get(id);
    const el = entry?.element || findElementById(id);
    if (!el) return false;
    if (isDaubOverlay(el)) return el.getAttribute('aria-hidden') === 'false';
    return Boolean(el.classList?.contains('open') || el.classList?.contains('db-drawer--open'));
  }

  function getTopPopupId() {
    while (stack.length) {
      const id = stack[stack.length - 1];
      if (isPopupOpen(id)) return id;
      stack.pop();
    }

    const roots = getAllKnownRoots();
    const openEls = [];
    roots.forEach(root => {
      collectPopupElements(root).forEach(el => {
        if (isPopupOpen(el.id)) openEls.push(el);
      });
    });
    const top = openEls[openEls.length - 1];
    if (!top?.id) return '';
    pushToStack(top.id);
    return top.id;
  }

  function ensureEntry(target, options = {}) {
    const id = resolveId(target);
    if (!id) return null;
    const existing = entries.get(id) || {
      id,
      type: DEFAULT_TYPE,
      size: '',
      layoutFamily: '',
      mobileMode: '',
      touchProfile: '',
      dismissPolicy: null,
      cleanup: null,
      element: null
    };

    if (target && typeof target === 'object' && target.classList) {
      existing.element = target;
    }
    if (!existing.element) {
      existing.element = findElementById(id);
    }
    const dataset = existing.element?.dataset || {};
    const resolvedType = options.type || dataset.popupType || existing.type;
    existing.type = normalizeType(resolvedType);
    if (Object.prototype.hasOwnProperty.call(options, 'size')) {
      existing.size = normalizeSize(options.size);
    } else if (dataset.popupSize) {
      existing.size = normalizeSize(dataset.popupSize);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'layoutFamily')) {
      existing.layoutFamily = normalizeLayoutFamily(options.layoutFamily);
    } else if (dataset.popupLayout) {
      existing.layoutFamily = normalizeLayoutFamily(dataset.popupLayout);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'mobileMode')) {
      existing.mobileMode = normalizeMobileMode(options.mobileMode);
    } else if (dataset.popupMobileMode) {
      existing.mobileMode = normalizeMobileMode(dataset.popupMobileMode);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'touchProfile')) {
      existing.touchProfile = normalizeTouchProfile(existing.type, options.touchProfile);
    } else if (dataset.touchProfile) {
      existing.touchProfile = normalizeTouchProfile(existing.type, dataset.touchProfile);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'dismissPolicy')) {
      existing.dismissPolicy = options.dismissPolicy || null;
    }
    if (typeof options.cleanup === 'function') {
      existing.cleanup = options.cleanup;
    }

    entries.set(id, existing);

    if (existing.element) {
      existing.element.dataset.popupType = existing.type;
      existing.element.dataset.touchProfile = normalizeTouchProfile(existing.type, existing.touchProfile);
      if (existing.size) existing.element.dataset.popupSize = existing.size;
      if (existing.layoutFamily) existing.element.dataset.popupLayout = existing.layoutFamily;
      if (existing.mobileMode) existing.element.dataset.popupMobileMode = existing.mobileMode;
    }

    if (existing.element && typeof window.registerOverlayElement === 'function') {
      try { window.registerOverlayElement(existing.element); } catch {}
    }

    if (!openStateById.has(id)) {
      openStateById.set(id, Boolean(existing.element && isPopupOpen(id)));
    }
    return existing;
  }

  function runSessionClose(id, reason, options = {}) {
    const entry = entries.get(id);
    const session = sessions.get(id);
    if (!entry && !session) return false;

    if (session?.isClosing) return true;
    if (session) session.isClosing = true;

    const el = entry?.element || findElementById(id);
    const restoreFocus = session?.restoreFocus || null;
    if (isDrawerOverlay(el) && restoreFocus?.isConnected) {
      el._overlayReturnFocus = restoreFocus;
    }
    if (el && !options.skipClassRemoval) {
      internalCloseIds.add(id);
      if (isDaubOverlay(el)) {
        if (el.getAttribute('aria-hidden') === 'false') {
          el.setAttribute('aria-hidden', 'true');
        }
      }
      if (el.classList.contains('open')) {
        el.classList.remove('open');
      }
      if (el.classList.contains('db-drawer--open')) {
        el.classList.remove('db-drawer--open');
      }
      if (isDrawerOverlay(el)) {
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('inert', '');
      }
      setTimeout(() => internalCloseIds.delete(id), 0);
    }

    removeFromStack(id);
    openStateById.set(id, false);
    if (el instanceof HTMLElement) {
      restoreManagedUnderlay(el);
    }
    syncOverlayStack();

    if (el && typeof window.registerOverlayCleanup === 'function') {
      try { window.registerOverlayCleanup(el, null); } catch {}
    }

    sessions.delete(id);

    const callbacks = [session?.onClose, session?.cleanup, entry?.cleanup];
    callbacks.forEach(fn => {
      if (typeof fn !== 'function') return;
      try { fn(reason || 'programmatic'); } catch (error) { console.error(error); }
    });

    window.requestAnimationFrame(() => {
      const nextTop = getInteractiveTopOverlay();
      if (nextTop && (!restoreFocus || !nextTop.contains(restoreFocus))) {
        focusOverlay(nextTop);
        return;
      }
      if (restoreFocus?.isConnected) {
        try { restoreFocus.focus({ preventScroll: true }); } catch { restoreFocus.focus?.(); }
      } else if (nextTop) {
        focusOverlay(nextTop);
      }
    });

    return true;
  }

  function register(target, options = {}) {
    const entry = ensureEntry(target, options);
    if (!entry) return null;
    return {
      id: entry.id,
      type: entry.type,
      size: entry.size,
      layoutFamily: entry.layoutFamily,
      mobileMode: entry.mobileMode,
      touchProfile: normalizeTouchProfile(entry.type, entry.touchProfile),
      dismissPolicy: normalizePolicy(entry.type, entry.dismissPolicy)
    };
  }

  function registerMany(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      if (!item || typeof item !== 'object') return null;
      const id = resolveId(item.id || item.target || '');
      if (!id) return null;
      return register(id, item);
    }).filter(Boolean);
  }

  function open(target, options = {}) {
    const entry = ensureEntry(target, options);
    if (!entry) return null;
    const id = entry.id;
    const el = entry.element || findElementById(id);
    if (!el) return null;

    entry.element = el;
    const type = normalizeType(options.type || entry.type);
    entry.type = type;
    const touchProfile = normalizeTouchProfile(type, options.touchProfile ?? entry.touchProfile);
    entry.touchProfile = touchProfile;
    const policy = normalizePolicy(type, options.dismissPolicy ?? entry.dismissPolicy);

    const prev = sessions.get(id) || {};
    sessions.set(id, {
      id,
      type,
      touchProfile,
      policy,
      onClose: typeof options.onClose === 'function' ? options.onClose : prev.onClose || null,
      cleanup: typeof options.cleanup === 'function' ? options.cleanup : prev.cleanup || null,
      restoreFocus: prev.restoreFocus || resolveRestoreFocus(el),
      isClosing: false
    });

    if (typeof window.registerOverlayElement === 'function') {
      try { window.registerOverlayElement(el); } catch {}
    }
    if (typeof window.registerOverlayCleanup === 'function') {
      try { window.registerOverlayCleanup(el, () => close(id, 'history')); } catch {}
    }

    if (isDaubOverlay(el)) {
      if (el.getAttribute('aria-hidden') !== 'false') {
        el.setAttribute('aria-hidden', 'false');
      }
    }
    if (!el.classList.contains('open')) {
      el.classList.add('open');
    }
    if (isDrawerOverlay(el) && !el.classList.contains('db-drawer--open')) {
      el.classList.add('db-drawer--open');
    }
    if (isDrawerOverlay(el)) {
      el.removeAttribute('inert');
      el.setAttribute('aria-hidden', 'false');
    }
    el.dataset.touchProfile = touchProfile;

    pushToStack(id);
    openStateById.set(id, true);
    syncOverlayStack();
    focusOverlay(el);

    return {
      id,
      element: el,
      close: (reason = 'programmatic') => close(id, reason)
    };
  }

  function close(target, reason = 'programmatic') {
    const id = resolveId(target);
    if (!id) return false;
    ensureEntry(id);
    return runSessionClose(id, reason);
  }

  function closeTop(reason = 'programmatic') {
    const id = getTopPopupId();
    if (!id) return false;
    return close(id, reason);
  }

  function getTopSession() {
    const id = getTopPopupId();
    if (!id) return null;
    const entry = ensureEntry(id);
    if (!entry) return null;
    const session = sessions.get(id);
    const type = normalizeType(session?.type || entry.type);
    const policy = normalizePolicy(type, session?.policy || entry.dismissPolicy);
    const touchProfile = normalizeTouchProfile(type, session?.touchProfile || entry.touchProfile);
    return { id, entry, session, policy, touchProfile };
  }

  function pathContains(path, target) {
    if (!target) return false;
    return Array.isArray(path) && path.some(node => node === target);
  }

  function getInteractiveTopOverlay() {
    const historyTop = typeof window.peekTopOverlay === 'function' ? window.peekTopOverlay() : null;
    if (historyTop instanceof HTMLElement && historyTop.classList.contains('open')) return historyTop;
    const popupId = getTopPopupId();
    return popupId ? entries.get(popupId)?.element || findElementById(popupId) : null;
  }

  function trapFocus(event, element) {
    const surface = element?.querySelector?.('.popup-inner, .db-modal, .db-drawer__panel') || element;
    if (!(surface instanceof HTMLElement)) return false;
    const focusable = getFocusableElements(surface);
    if (!focusable.length) {
      if (!surface.hasAttribute('tabindex')) surface.setAttribute('tabindex', '-1');
      event.preventDefault();
      surface.focus({ preventScroll: true });
      return true;
    }

    const active = getDeepActiveElement();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!active || !element.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
      return true;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return true;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
      return true;
    }
    return false;
  }

  function onGlobalKeydown(event) {
    if (event.key === 'Tab') {
      const interactiveTop = getInteractiveTopOverlay();
      if (interactiveTop) trapFocus(event, interactiveTop);
      return;
    }
    if (event.key !== 'Escape') return;
    const top = getTopSession();
    if (!top || !top.policy.escape) return;
    const interactiveTop = getInteractiveTopOverlay();
    const popup = top.entry.element || findElementById(top.id);
    if (interactiveTop && popup !== interactiveTop) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    close(top.id, 'escape');
  }

  function onGlobalClick(event) {
    const top = getTopSession();
    if (!top || !top.policy.backdrop) return;
    const pop = top.entry.element || findElementById(top.id);
    if (!pop) return;

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const closeButton = Array.isArray(path)
      ? path.find(node => node instanceof Element && node.matches?.('.db-modal__close, [data-popup-close]'))
      : null;
    if (closeButton) {
      close(top.id, 'close-button');
      return;
    }
    const inner = pop.querySelector('.popup-inner') || pop.querySelector('.db-modal') || pop.querySelector('.db-drawer__panel');
    const clickedInner = inner
      ? (pathContains(path, inner) || (event.target instanceof Node && inner.contains(event.target)))
      : false;
    const clickedPopup = pathContains(path, pop)
      || (event.target instanceof Node && pop.contains(event.target));
    const hasPointerCoordinates = Number.isFinite(event.clientX)
      && Number.isFinite(event.clientY)
      && (event.clientX !== 0 || event.clientY !== 0);
    const pointTarget = hasPointerCoordinates
      ? document.elementFromPoint(event.clientX, event.clientY)
      : null;
    const clickedSurfaceLessDrawerContent = !inner
      && isDrawerOverlay(pop)
      && clickedPopup
      && (event.target !== pop
        || (pointTarget instanceof Node && pointTarget !== pop && pop.contains(pointTarget)));
    const pathHasOverlay = Array.isArray(path) && path.some(node =>
      node instanceof Element &&
      (node.classList?.contains('popup') || node.classList?.contains('offcanvas') || node.classList?.contains('db-modal-overlay') || node.classList?.contains('db-drawer'))
    );

    // Legacy offcanvas panels use the drawer root as their content surface.
    // Descendant clicks must stay inside, while a direct root click remains a
    // valid backdrop dismissal just like structured drawers.
    if (clickedInner || clickedSurfaceLessDrawerContent) return;
    if (clickedPopup) {
      close(top.id, 'backdrop');
      return;
    }
    if (pathHasOverlay) return;
    close(top.id, 'backdrop');
  }

  function registerPopupElement(el) {
    if (!el || !el.id) return;
    if (!isManagedOverlay(el)) return;
    ensureEntry(el, {});
  }

  function registerPopupTree(node) {
    if (!node) return;
    if (node.nodeType === 1) {
      if (isManagedOverlay(node) && node.id) registerPopupElement(node);
      if (typeof node.querySelectorAll === 'function') {
        node.querySelectorAll('.popup[id], .db-modal-overlay[id], .offcanvas[id], .db-drawer[id]').forEach(registerPopupElement);
      }
    }
  }

  function onPopupClassMutation(el) {
    if (!el || !el.id) return;
    const isOverlay = isDaubOverlay(el);
    if (!isManagedOverlay(el)) return;
    const id = el.id;
    ensureEntry(el);
    const wasOpen = Boolean(openStateById.get(id));
    const isOpen = isOverlay
      ? el.getAttribute('aria-hidden') === 'false'
      : (el.classList.contains('open') || el.classList.contains('db-drawer--open'));
    openStateById.set(id, isOpen);

    if (isOpen && !wasOpen) {
      if (!sessions.has(id)) {
        const entry = entries.get(id);
        const type = normalizeType(entry?.type);
        sessions.set(id, {
          id,
          type,
          touchProfile: normalizeTouchProfile(type, entry?.touchProfile),
          policy: normalizePolicy(type, entry?.dismissPolicy),
          onClose: null,
          cleanup: null,
          restoreFocus: resolveRestoreFocus(el),
          isClosing: false
        });
      }
      pushToStack(id);
      syncOverlayStack();
      window.queueMicrotask?.(syncOverlayStack);
      focusOverlay(el);
      return;
    }

    if (!isOpen && wasOpen) {
      removeFromStack(id);
      syncOverlayStack();
      if (internalCloseIds.has(id)) return;
      if (sessions.has(id)) {
        runSessionClose(id, 'external', { skipClassRemoval: true });
      } else if (typeof window.registerOverlayCleanup === 'function') {
        try { window.registerOverlayCleanup(el, null); } catch {}
      }
    }
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return false;
    observedRoots.add(root);

    collectPopupElements(root).forEach(registerPopupElement);

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'class' || mutation.attributeName === 'aria-hidden')) {
          onPopupClassMutation(mutation.target);
          return;
        }
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(registerPopupTree);
        }
      });
    });

    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-hidden']
      });
      rootObservers.set(root, observer);
    } catch (error) {
      console.error(error);
      return false;
    }

    return true;
  }

  function unobserveRoot(root) {
    const observer = rootObservers.get(root);
    if (observer) observer.disconnect();
    rootObservers.delete(root);
    observedRoots.delete(root);
  }

  window.popupManager = {
    register,
    registerMany,
    open,
    close,
    closeTop,
    peekTop: getTopSession,
    observeRoot,
    unobserveRoot
  };

  document.addEventListener('keydown', onGlobalKeydown, true);
  document.addEventListener('pointerdown', rememberInteractionTarget, true);
  document.addEventListener('click', onGlobalClick, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observeRoot(document), { once: true });
  } else {
    observeRoot(document);
  }
})(window);
