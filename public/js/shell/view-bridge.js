import router from './router.js';
import { normalizeRole } from './legacy-loader.js';

const mountHandlers = new Map();
const viewHooks = new Map();

function currentRole() {
  return normalizeRole(router.currentRole || document.body?.dataset?.role || 'index');
}

function mergeHooks(role, hooks = {}) {
  const key = normalizeRole(role);
  const nextHooks = { ...(viewHooks.get(key) || {}), ...(hooks || {}) };
  viewHooks.set(key, nextHooks);
  return nextHooks;
}

function registerMount(role, handler) {
  const key = normalizeRole(role);
  if (typeof handler === 'function') {
    mountHandlers.set(key, handler);
  }
  return handler;
}

function mount(role, detail = {}) {
  const handler = mountHandlers.get(normalizeRole(role));
  if (typeof handler !== 'function') return false;
  return handler(detail);
}

function getViewHooks(role) {
  return viewHooks.get(normalizeRole(role)) || null;
}

function refreshRole(role, options = {}) {
  const hooks = getViewHooks(role);
  if (!hooks) return false;
  const specificHooks = [
    ['name', 'refreshName'],
    ['filters', 'refreshFilters'],
    ['selection', 'refreshSelection'],
    ['inventory', 'refreshInventory'],
    ['notes', 'refreshNotes'],
    ['traits', 'refreshTraits'],
    ['summary', 'refreshSummary'],
    ['effects', 'refreshEffects']
  ];
  let specificRequested = false;
  let specificHandled = false;
  specificHooks.forEach(([flag, hookName]) => {
    if (!options[flag]) return;
    specificRequested = true;
    if (typeof hooks[hookName] !== 'function') return;
    hooks[hookName](options);
    specificHandled = true;
  });
  const shouldRunGeneric = Boolean(
    options.full
    || options.refresh
    || !specificRequested
    || (!specificHandled && options.strict !== true)
  );
  if (shouldRunGeneric && typeof hooks.refresh === 'function') {
    hooks.refresh(options);
    return true;
  }
  return specificHandled;
}

function refreshCurrent(options = {}) {
  return refreshRole(currentRole(), options);
}

const bridge = {
  currentRole,
  getViewHooks,
  mount,
  refreshCurrent,
  refreshRole,
  registerMount,
  registerViewHooks: mergeHooks
};

window.symbaroumViewBridge = bridge;

export default bridge;
