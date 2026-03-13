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

  const DEFAULT_TYPE = 'form';

  function normalizeType(type) {
    const key = String(type || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(TYPE_DEFAULTS, key) ? key : DEFAULT_TYPE;
  }

  function normalizePolicy(type, dismissPolicy) {
    const base = TYPE_DEFAULTS[normalizeType(type)] || TYPE_DEFAULTS[DEFAULT_TYPE];
    if (!dismissPolicy || typeof dismissPolicy !== 'object') return { ...base };
    return {
      backdrop: dismissPolicy.backdrop === undefined ? base.backdrop : Boolean(dismissPolicy.backdrop),
      escape: dismissPolicy.escape === undefined ? base.escape : Boolean(dismissPolicy.escape)
    };
  }

  function resolveId(target) {
    if (typeof target === 'string') return target.trim();
    if (target && typeof target === 'object' && typeof target.id === 'string') return target.id.trim();
    return '';
  }

  function collectPopupElements(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll('.popup[id]'));
  }

  function getAllKnownRoots() {
    const roots = [];
    if (typeof document !== 'undefined') roots.push(document);
    observedRoots.forEach(root => {
      if (root && !roots.includes(root)) roots.push(root);
    });
    return roots;
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
    return Boolean(el && el.classList?.contains('open'));
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
        if (el.classList.contains('open')) openEls.push(el);
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
    if (options.type) existing.type = normalizeType(options.type);
    if (Object.prototype.hasOwnProperty.call(options, 'dismissPolicy')) {
      existing.dismissPolicy = options.dismissPolicy || null;
    }
    if (typeof options.cleanup === 'function') {
      existing.cleanup = options.cleanup;
    }

    entries.set(id, existing);

    if (existing.element && typeof window.registerOverlayElement === 'function') {
      try { window.registerOverlayElement(existing.element); } catch {}
    }

    if (!openStateById.has(id)) {
      openStateById.set(id, Boolean(existing.element?.classList?.contains('open')));
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
    if (el && !options.skipClassRemoval && el.classList.contains('open')) {
      internalCloseIds.add(id);
      el.classList.remove('open');
      setTimeout(() => internalCloseIds.delete(id), 0);
    }

    removeFromStack(id);
    openStateById.set(id, false);

    if (el && typeof window.registerOverlayCleanup === 'function') {
      try { window.registerOverlayCleanup(el, null); } catch {}
    }

    sessions.delete(id);

    const callbacks = [session?.onClose, session?.cleanup, entry?.cleanup];
    callbacks.forEach(fn => {
      if (typeof fn !== 'function') return;
      try { fn(reason || 'programmatic'); } catch (error) { console.error(error); }
    });

    return true;
  }

  function register(target, options = {}) {
    const entry = ensureEntry(target, options);
    if (!entry) return null;
    return {
      id: entry.id,
      type: entry.type,
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
    const policy = normalizePolicy(type, options.dismissPolicy ?? entry.dismissPolicy);

    const prev = sessions.get(id) || {};
    sessions.set(id, {
      id,
      type,
      policy,
      onClose: typeof options.onClose === 'function' ? options.onClose : prev.onClose || null,
      cleanup: typeof options.cleanup === 'function' ? options.cleanup : prev.cleanup || null,
      isClosing: false
    });

    if (typeof window.registerOverlayElement === 'function') {
      try { window.registerOverlayElement(el); } catch {}
    }
    if (typeof window.registerOverlayCleanup === 'function') {
      try { window.registerOverlayCleanup(el, () => close(id, 'history')); } catch {}
    }

    if (!el.classList.contains('open')) {
      el.classList.add('open');
    }

    pushToStack(id);
    openStateById.set(id, true);

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
    return { id, entry, session, policy };
  }

  function pathContains(path, target) {
    if (!target) return false;
    return Array.isArray(path) && path.some(node => node === target);
  }

  function onGlobalKeydown(event) {
    if (event.key !== 'Escape') return;
    const top = getTopSession();
    if (!top || !top.policy.escape) return;
    event.preventDefault();
    close(top.id, 'escape');
  }

  function onGlobalClick(event) {
    const top = getTopSession();
    if (!top || !top.policy.backdrop) return;
    const pop = top.entry.element || findElementById(top.id);
    if (!pop) return;

    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const inner = pop.querySelector('.popup-inner');
    const clickedInner = inner
      ? (pathContains(path, inner) || (event.target instanceof Node && inner.contains(event.target)))
      : false;
    const clickedPopup = pathContains(path, pop)
      || (event.target instanceof Node && pop.contains(event.target));
    const pathHasOverlay = Array.isArray(path) && path.some(node =>
      node instanceof Element &&
      (node.classList?.contains('popup') || node.classList?.contains('offcanvas'))
    );

    if (clickedInner) return;
    if (clickedPopup) {
      close(top.id, 'backdrop');
      return;
    }
    if (pathHasOverlay) return;
    close(top.id, 'backdrop');
  }

  function registerPopupElement(el) {
    if (!el || !el.id || !el.classList?.contains('popup')) return;
    ensureEntry(el, {});
  }

  function registerPopupTree(node) {
    if (!node) return;
    if (node.nodeType === 1) {
      if (node.classList?.contains('popup') && node.id) registerPopupElement(node);
      if (typeof node.querySelectorAll === 'function') {
        node.querySelectorAll('.popup[id]').forEach(registerPopupElement);
      }
    }
  }

  function onPopupClassMutation(el) {
    if (!el || !el.id || !el.classList?.contains('popup')) return;
    const id = el.id;
    ensureEntry(el);
    const wasOpen = Boolean(openStateById.get(id));
    const isOpen = el.classList.contains('open');
    openStateById.set(id, isOpen);

    if (isOpen && !wasOpen) {
      pushToStack(id);
      return;
    }

    if (!isOpen && wasOpen) {
      removeFromStack(id);
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
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
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
        attributeFilter: ['class']
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
    observeRoot,
    unobserveRoot
  };

  document.addEventListener('keydown', onGlobalKeydown, true);
  document.addEventListener('click', onGlobalClick, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observeRoot(document), { once: true });
  } else {
    observeRoot(document);
  }
})(window);
