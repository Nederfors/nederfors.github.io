/**
 * Hash-based router for the single-shell app.
 *
 * Route format: #/<role>  (e.g. #/index, #/character, #/inventory, #/notes, #/traits)
 * Summary and effects are aliases for traits with a tab hint.
 *
 * Exports a singleton so every module shares the same router state.
 */

const VALID_ROLES = new Set(['index', 'character', 'inventory', 'notes', 'traits']);
const DEFAULT_ROLE = 'index';

/** summary/effects → traits with a tab hint */
const ROLE_ALIASES = Object.freeze({
  summary: { role: 'traits', tab: 'summary' },
  effects: { role: 'traits', tab: 'effects' }
});

function parseHash(hash = location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/')[0].toLowerCase();
  if (VALID_ROLES.has(raw)) return { role: raw, tab: null };
  const alias = ROLE_ALIASES[raw];
  if (alias) return { role: alias.role, tab: alias.tab };
  return { role: DEFAULT_ROLE, tab: null };
}

function roleToHash(role, tab) {
  if (tab === 'summary') return '#/summary';
  if (tab === 'effects') return '#/effects';
  return `#/${role}`;
}

let currentRole = '';
let currentTab = null;
const listeners = [];

function notifyListeners(prev, next) {
  for (const fn of listeners) {
    try { fn(next, prev); } catch (e) { console.error('[router] listener error', e); }
  }
}

function applyRoute(pushState = false) {
  const { role, tab } = parseHash();
  const prev = { role: currentRole, tab: currentTab };
  if (role === currentRole && tab === currentTab) return;
  currentRole = role;
  currentTab = tab;
  notifyListeners(prev, { role, tab });
}

function navigateTo(role, opts = {}) {
  const { tab = null, replace = false } = opts;
  const hash = roleToHash(role, tab);
  if (replace) {
    history.replaceState(null, '', hash);
  } else {
    location.hash = hash;
    return; // hashchange will fire and call applyRoute
  }
  applyRoute();
}

function onRouteChange(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function init() {
  // Default to #/index if no hash
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    history.replaceState(null, '', '#/index');
  }
  const { role, tab } = parseHash();
  currentRole = role;
  currentTab = tab;
  window.addEventListener('hashchange', () => applyRoute());
}

const router = {
  init,
  navigateTo,
  onRouteChange,
  parseHash,
  get currentRole() { return currentRole; },
  get currentTab() { return currentTab; },
  roleToHash,
  VALID_ROLES,
  DEFAULT_ROLE
};

export default router;
