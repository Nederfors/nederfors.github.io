import { onCLS, onFCP, onINP, onLCP, onTTFB } from './vendor/web-vitals.js';

const SCENARIO_HISTORY_KEY = '__symbaroumPerfScenarioHistory';
const PENDING_SCENARIOS_KEY = '__symbaroumPerfPendingScenarios';
const MAX_SCENARIOS = 200;
const ACTIVE_TIMEOUT_MS = 30_000;

const state = {
  role: document.body?.dataset?.role || '',
  scenarios: loadScenarioHistory(),
  vitals: [],
  active: new Map(),
  flowContexts: new Map(),
  nextId: 0
};

function cloneDetail(detail) {
  if (detail === undefined) return undefined;
  if (detail === null) return null;
  try {
    return JSON.parse(JSON.stringify(detail));
  } catch {
    return detail;
  }
}

function withSessionStorage(callback, fallbackValue) {
  try {
    if (window.sessionStorage) {
      return callback(window.sessionStorage);
    }
  } catch {}
  return fallbackValue;
}

function currentUrl() {
  return `${window.location.pathname}${window.location.hash}`;
}

function absoluteNow() {
  return performance.timeOrigin + performance.now();
}

function loadJson(key, fallbackValue) {
  return withSessionStorage((storage) => {
    const raw = storage.getItem(key);
    if (!raw) return fallbackValue;
    try {
      return JSON.parse(raw);
    } catch {
      return fallbackValue;
    }
  }, fallbackValue);
}

function storeJson(key, value) {
  withSessionStorage((storage) => {
    storage.setItem(key, JSON.stringify(value));
  });
}

function loadScenarioHistory() {
  const loaded = loadJson(SCENARIO_HISTORY_KEY, []);
  return Array.isArray(loaded) ? loaded : [];
}

function loadPendingScenarios() {
  const loaded = loadJson(PENDING_SCENARIOS_KEY, []);
  return Array.isArray(loaded) ? loaded : [];
}

function saveScenarioHistory() {
  storeJson(SCENARIO_HISTORY_KEY, state.scenarios.slice(-MAX_SCENARIOS));
}

function savePendingScenarios(pending) {
  storeJson(PENDING_SCENARIOS_KEY, pending.slice(-MAX_SCENARIOS));
}

function makeScenarioId(name) {
  state.nextId += 1;
  return `perf-${String(name || 'scenario').replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${Date.now().toString(36)}-${state.nextId.toString(36)}`;
}

function appendScenario(entry) {
  state.scenarios.push(entry);
  if (state.scenarios.length > MAX_SCENARIOS) {
    state.scenarios.splice(0, state.scenarios.length - MAX_SCENARIOS);
  }
  saveScenarioHistory();
  return entry;
}

function clearFlowContextsForScenario(scenarioId) {
  if (!scenarioId) return;
  Array.from(state.flowContexts.entries()).forEach(([key, value]) => {
    if (value === scenarioId) {
      state.flowContexts.delete(key);
    }
  });
}

function resolveScenarioRef(idOrName) {
  if (!idOrName) return null;
  if (state.active.has(idOrName)) {
    return { id: idOrName, record: state.active.get(idOrName) };
  }
  const entries = Array.from(state.active.entries()).reverse();
  const match = entries.find(([, record]) => record.name === idOrName);
  return match ? { id: match[0], record: match[1] } : null;
}

function finalizeScenario(record, status, detail = {}) {
  const finishedAt = absoluteNow();
  const endMark = `${record.id}:end`;
  try {
    performance.mark(endMark);
    performance.measure(`symbaroum:${record.name}`, record.startMark, endMark);
  } catch {}
  const checkpoints = Array.isArray(record.checkpoints)
    ? record.checkpoints.map((entry) => ({
        name: entry.name,
        atAbs: entry.atAbs,
        offsetMs: Math.max(0, entry.atAbs - record.startedAtAbs),
        detail: cloneDetail(entry.detail || {})
      }))
    : [];
  const stages = [
    ...(Array.isArray(record.stages) ? record.stages : []),
    ...Array.from(record.activeStages?.values?.() || []).map((stage) => ({
      name: stage.name,
      startedAtAbs: stage.startedAtAbs,
      finishedAtAbs: finishedAt,
      duration: Math.max(0, finishedAt - stage.startedAtAbs),
      detail: {
        ...(cloneDetail(stage.detail || {}) || {}),
        truncated: true
      }
    }))
  ].map((stage) => ({
    name: stage.name,
    startedAtAbs: stage.startedAtAbs,
    finishedAtAbs: stage.finishedAtAbs,
    duration: stage.duration,
    startedOffsetMs: Math.max(0, stage.startedAtAbs - record.startedAtAbs),
    finishedOffsetMs: Math.max(0, stage.finishedAtAbs - record.startedAtAbs),
    detail: cloneDetail(stage.detail || {})
  }));
  const profile = (checkpoints.length || stages.length) ? { checkpoints, stages } : null;
  const mergedDetail = {
    ...(record.detail || {}),
    ...(detail || {}),
    ...(profile ? { profile } : {})
  };
  clearFlowContextsForScenario(record.id);
  return appendScenario({
    id: record.id,
    name: record.name,
    status,
    duration: Math.max(0, finishedAt - record.startedAtAbs),
    startedAtAbs: record.startedAtAbs,
    finishedAtAbs: finishedAt,
    fromUrl: record.fromUrl,
    toUrl: currentUrl(),
    fromRole: record.fromRole,
    toRole: state.role || document.body?.dataset?.role || '',
    detail: mergedDetail
  });
}

function startScenario(name, detail = {}) {
  if (!name) return null;
  const id = makeScenarioId(name);
  const startMark = `${id}:start`;
  try {
    performance.mark(startMark);
  } catch {}
  const record = {
    id,
    name,
    detail,
    checkpoints: [],
    stages: [],
    activeStages: new Map(),
    startMark,
    startedAtAbs: absoluteNow(),
    fromUrl: currentUrl(),
    fromRole: state.role || document.body?.dataset?.role || ''
  };
  record.timeoutId = window.setTimeout(() => {
    cancelScenario(id, { reason: 'timeout' });
  }, ACTIVE_TIMEOUT_MS);
  state.active.set(id, record);
  return id;
}

function endScenario(idOrName, detail = {}) {
  const resolved = resolveScenarioRef(idOrName);
  if (!resolved) return null;
  const { id, record } = resolved;
  window.clearTimeout(record.timeoutId);
  state.active.delete(id);
  return finalizeScenario(record, 'completed', detail);
}

function cancelScenario(idOrName, detail = {}) {
  const resolved = resolveScenarioRef(idOrName);
  if (!resolved) return null;
  const { id, record } = resolved;
  window.clearTimeout(record.timeoutId);
  state.active.delete(id);
  return finalizeScenario(record, 'cancelled', detail);
}

function markScenario(idOrName, name, detail = {}) {
  const resolved = resolveScenarioRef(idOrName);
  if (!resolved || !name) return null;
  const { record } = resolved;
  const entry = {
    name,
    atAbs: absoluteNow(),
    detail: cloneDetail(detail || {})
  };
  record.checkpoints.push(entry);
  return entry;
}

function startScenarioStage(idOrName, name, detail = {}) {
  const resolved = resolveScenarioRef(idOrName);
  if (!resolved || !name) return null;
  const { id, record } = resolved;
  const stageId = `${id}:stage:${name}:${record.stages.length + record.activeStages.size + 1}`;
  record.activeStages.set(stageId, {
    id: stageId,
    name,
    startedAtAbs: absoluteNow(),
    detail: cloneDetail(detail || {})
  });
  return {
    scenarioId: id,
    stageId
  };
}

function finishScenarioStage(token, detail = {}) {
  if (!token?.scenarioId || !token?.stageId) return null;
  const record = state.active.get(token.scenarioId);
  if (!record?.activeStages?.has(token.stageId)) return null;
  const stage = record.activeStages.get(token.stageId);
  record.activeStages.delete(token.stageId);
  const finishedAtAbs = absoluteNow();
  const entry = {
    name: stage.name,
    startedAtAbs: stage.startedAtAbs,
    finishedAtAbs,
    duration: Math.max(0, finishedAtAbs - stage.startedAtAbs),
    detail: {
      ...(cloneDetail(stage.detail || {}) || {}),
      ...(cloneDetail(detail || {}) || {})
    }
  };
  record.stages.push(entry);
  return entry;
}

function timeScenarioStage(idOrName, name, callback, detail = {}) {
  if (typeof callback !== 'function') return undefined;
  const token = startScenarioStage(idOrName, name, detail);
  try {
    const result = callback();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        finishScenarioStage(token);
      });
    }
    finishScenarioStage(token);
    return result;
  } catch (error) {
    finishScenarioStage(token, { error: true });
    throw error;
  }
}

function afterNextPaint(frameCount = 2) {
  const safeFrames = Math.max(1, Number(frameCount) || 1);
  return new Promise((resolve) => {
    let remaining = safeFrames;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  });
}

function scheduleScenarioEnd(idOrName, detail = {}, frameCount = 2) {
  if (!idOrName) return Promise.resolve(null);
  return afterNextPaint(frameCount).then(() => endScenario(idOrName, detail));
}

function queueNavigationScenario(name, detail = {}) {
  if (!name) return null;
  const pending = loadPendingScenarios();
  const entry = {
    id: makeScenarioId(name),
    name,
    detail,
    startedAtAbs: absoluteNow(),
    fromUrl: currentUrl(),
    fromRole: state.role || document.body?.dataset?.role || ''
  };
  pending.push(entry);
  savePendingScenarios(pending);
  return entry.id;
}

function resolveQueuedScenarios(detail = {}) {
  const pending = loadPendingScenarios();
  if (!pending.length) return [];
  const now = absoluteNow();
  const role = detail.role || state.role || document.body?.dataset?.role || '';
  const url = currentUrl();
  const resolved = [];
  const remaining = [];

  pending.forEach((entry) => {
    const targetRole = String(entry?.detail?.targetRole || '').trim();
    const targetPath = String(entry?.detail?.targetPath || '').trim();
    const expired = now - Number(entry?.startedAtAbs || 0) > ACTIVE_TIMEOUT_MS;
    const roleMatches = !targetRole || targetRole === role;
    const pathMatches = !targetPath || url.includes(targetPath);

    if (!expired && roleMatches && pathMatches) {
      resolved.push(appendScenario({
        id: entry.id,
        name: entry.name,
        status: 'completed',
        duration: Math.max(0, now - Number(entry.startedAtAbs || now)),
        startedAtAbs: entry.startedAtAbs,
        finishedAtAbs: now,
        fromUrl: entry.fromUrl,
        toUrl: url,
        fromRole: entry.fromRole,
        toRole: role,
        detail: {
          ...(entry.detail || {}),
          ...detail,
          crossDocument: true
        }
      }));
      return;
    }

    if (!expired) {
      remaining.push(entry);
    }
  });

  savePendingScenarios(remaining);
  return resolved;
}

function recordVital(metric) {
  state.vitals.push({
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    id: metric.id
  });
}

function setContext(detail = {}) {
  state.role = String(detail.role || state.role || document.body?.dataset?.role || '').trim();
  return state.role;
}

function setFlowContext(key, scenarioId) {
  if (!key || !scenarioId) return null;
  state.flowContexts.set(String(key), scenarioId);
  return scenarioId;
}

function getFlowContext(key) {
  if (!key) return null;
  return state.flowContexts.get(String(key)) || null;
}

function clearFlowContext(key, scenarioId = null) {
  if (!key) return;
  const normalizedKey = String(key);
  if (!state.flowContexts.has(normalizedKey)) return;
  if (scenarioId && state.flowContexts.get(normalizedKey) !== scenarioId) return;
  state.flowContexts.delete(normalizedKey);
}

function clearHistory() {
  state.scenarios = [];
  state.vitals = [];
  state.active.forEach((record) => window.clearTimeout(record.timeoutId));
  state.active.clear();
  state.flowContexts.clear();
  saveScenarioHistory();
  savePendingScenarios([]);
}

function getSnapshot() {
  return {
    page: {
      role: state.role || document.body?.dataset?.role || '',
      url: currentUrl(),
      timeOrigin: performance.timeOrigin
    },
    scenarios: state.scenarios.slice(),
    vitals: state.vitals.slice(),
    contexts: Object.fromEntries(state.flowContexts.entries()),
    active: Array.from(state.active.values()).map((record) => ({
      id: record.id,
      name: record.name,
      detail: record.detail
    }))
  };
}

onCLS(recordVital);
onFCP(recordVital);
onINP(recordVital);
onLCP(recordVital);
onTTFB(recordVital);

window.symbaroumPerf = Object.freeze({
  afterNextPaint,
  cancelScenario,
  clearFlowContext,
  clearHistory,
  endScenario,
  finishScenarioStage,
  getFlowContext,
  getSnapshot,
  markScenario,
  queueNavigationScenario,
  resolveQueuedScenarios,
  scheduleScenarioEnd,
  setContext,
  setFlowContext,
  startScenario,
  startScenarioStage,
  timeScenarioStage
});

export default window.symbaroumPerf;
