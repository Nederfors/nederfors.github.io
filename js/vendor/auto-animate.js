const DEFAULT_OPTIONS = Object.freeze({
  duration: 120,
  easing: 'ease-out',
  disrespectUserMotionPreference: false,
  animateMove: false,
  animateRemove: false
});

const CONTROLLERS = new WeakMap();

const canAnimate = () =>
  typeof window !== 'undefined'
  && typeof window.MutationObserver === 'function'
  && typeof Element !== 'undefined'
  && typeof Element.prototype.animate === 'function';

const prefersReducedMotion = (config) =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  && !config.disrespectUserMotionPreference;

function readRect(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
    viewTop: rect.top,
    viewLeft: rect.left
  };
}

function buildStableKey(element) {
  const direct = element.dataset?.autoAnimateKey || element.dataset?.aaKey;
  if (direct) return String(direct);

  const parts = [];
  const data = element.dataset || {};
  if (data.special) parts.push(`special:${data.special}`);
  if (data.cat) parts.push(`cat:${data.cat}`);
  if (data.tabPanel) parts.push(`tab:${data.tabPanel}`);
  if (data.id || data.name) parts.push(`entry:${data.id || data.name}`);
  if (data.level) parts.push(`level:${data.level}`);
  if (data.trait) parts.push(`trait:${data.trait}`);
  if (data.parent) parts.push(`parent:${data.parent}`);
  if (data.child) parts.push(`child:${data.child}`);
  if (parts.length) return parts.join('|');

  if (element.matches?.('li.cat-group')) {
    const details = Array.from(element.children).find(child =>
      child instanceof HTMLElement && child.matches('details[data-cat]')
    );
    const cat = details?.dataset?.cat;
    if (cat) return `cat:${cat}`;
  }

  return '';
}

function animateMove(element, fromRect, toRect, options) {
  if (!options.animateMove) return;
  const deltaX = fromRect.left - toRect.left;
  const deltaY = fromRect.top - toRect.top;
  const scaleX = fromRect.width > 0 && toRect.width > 0 ? fromRect.width / toRect.width : 1;
  const scaleY = fromRect.height > 0 && toRect.height > 0 ? fromRect.height / toRect.height : 1;
  if (
    Math.abs(deltaX) < 1
    && Math.abs(deltaY) < 1
    && Math.abs(scaleX - 1) < 0.01
    && Math.abs(scaleY - 1) < 0.01
  ) {
    return;
  }
  element.animate([
    {
      transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
      transformOrigin: 'top left'
    },
    {
      transform: 'translate(0, 0) scale(1, 1)',
      transformOrigin: 'top left'
    }
  ], {
    duration: options.duration,
    easing: options.easing
  });
}

function animateAdd(element, options) {
  element.animate([
    {
      opacity: 0,
      transform: 'translateY(4px)'
    },
    {
      opacity: 1,
      transform: 'translateY(0)'
    }
  ], {
    duration: Math.max(80, Math.round(options.duration)),
    easing: options.easing
  });
}

function animateRemove(snapshot, options) {
  if (!options.animateRemove) return;
  const ghost = snapshot.element.cloneNode(true);
  if (!(ghost instanceof HTMLElement)) return;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.position = 'fixed';
  ghost.style.left = `${snapshot.rect.viewLeft}px`;
  ghost.style.top = `${snapshot.rect.viewTop}px`;
  ghost.style.width = `${snapshot.rect.width}px`;
  ghost.style.height = `${snapshot.rect.height}px`;
  ghost.style.margin = '0';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '9999';
  ghost.style.boxSizing = 'border-box';
  ghost.style.transformOrigin = 'top left';
  document.body.appendChild(ghost);
  const animation = ghost.animate([
    {
      opacity: 1,
      transform: 'translateY(0)'
    },
    {
      opacity: 0,
      transform: 'translateY(-4px)'
    }
  ], {
    duration: Math.max(70, Math.round(options.duration * 0.8)),
    easing: options.easing,
    fill: 'forwards'
  });
  const cleanup = () => ghost.remove();
  animation.addEventListener('finish', cleanup, { once: true });
  animation.addEventListener('cancel', cleanup, { once: true });
}

function autoAnimate(parent, config = {}) {
  if (!parent || !(parent instanceof HTMLElement) || !canAnimate()) {
    return {
      parent,
      enable() {},
      disable() {},
      isEnabled() { return false; },
      destroy() {}
    };
  }

  const existing = CONTROLLERS.get(parent);
  existing?.destroy?.();

  const options = { ...DEFAULT_OPTIONS, ...(config || {}) };
  let enabled = !prefersReducedMotion(options);
  let snapshot = [];
  let flushQueued = false;
  let destroyed = false;
  let rafId = 0;

  const takeSnapshot = () => Array.from(parent.children)
    .filter(child => child instanceof HTMLElement)
    .map(element => ({
      element,
      key: buildStableKey(element),
      rect: readRect(element)
    }));

  const flush = () => {
    flushQueued = false;
    rafId = 0;
    if (destroyed || !enabled || !parent.isConnected) {
      snapshot = takeSnapshot();
      return;
    }

    const nextSnapshot = takeSnapshot();
    const previousByElement = new Map(snapshot.map(item => [item.element, item]));
    const previousByKey = new Map();
    snapshot.forEach(item => {
      if (!item.key || previousByKey.has(item.key)) return;
      previousByKey.set(item.key, item);
    });
    const matched = new Set();

    nextSnapshot.forEach(item => {
      const previous = (item.key && previousByKey.get(item.key)) || previousByElement.get(item.element) || null;
      if (previous) {
        matched.add(previous);
        animateMove(item.element, previous.rect, item.rect, options);
      } else {
        animateAdd(item.element, options);
      }
    });

    snapshot.forEach(item => {
      if (matched.has(item)) return;
      animateRemove(item, options);
    });

    snapshot = nextSnapshot;
  };

  const queueFlush = () => {
    if (destroyed || flushQueued) return;
    flushQueued = true;
    rafId = window.requestAnimationFrame(flush);
  };

  const mutationObserver = new MutationObserver(queueFlush);

  mutationObserver.observe(parent, {
    childList: true
  });
  snapshot = takeSnapshot();

  const controller = Object.freeze({
    parent,
    enable() {
      enabled = true;
      snapshot = takeSnapshot();
    },
    disable() {
      enabled = false;
      if (rafId) cancelAnimationFrame(rafId);
      flushQueued = false;
    },
    isEnabled() {
      return enabled;
    },
    destroy() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      flushQueued = false;
      mutationObserver.disconnect();
      CONTROLLERS.delete(parent);
    }
  });

  CONTROLLERS.set(parent, controller);
  return controller;
}

export default autoAnimate;
export { autoAnimate };
