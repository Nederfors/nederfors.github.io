const listeners = new Set();
const DEFAULT_TIMEOUT_MS = 90_000;
const AUTO_WARM_DELAY_MS = 3_000;
const INPUT_QUIET_PERIOD_MS = 750;
const WARM_PAUSE_MS = 900;
const FOREGROUND_WARM_LEASE_MS = 120_000;
const FOREGROUND_WARM_HEARTBEAT_MS = 30_000;
const FOREGROUND_CONTROL_TIMEOUT_MS = 250;
let automaticWarmScheduled = false;
let rulesWarmActive = false;
let lastInputAt = 0;
let foregroundPauseSequence = 0;
let foregroundPauseTimer = null;
const foregroundPauseTokens = new Map();
const foregroundPauseClientId = (() => {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // Fall through to a page-local identifier.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
})();

function notify(detail) {
  listeners.forEach(listener => {
    try {
      listener(detail);
    } catch (error) {
      console.error('Offline status listener failed', error);
    }
  });
}

function currentWorkerController() {
  try {
    return navigator.serviceWorker?.controller || null;
  } catch {
    return null;
  }
}

async function resolveWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const controller = currentWorkerController();
  if (controller) return controller;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.active || registration.waiting || registration.installing || null;
  } catch {
    return null;
  }
}

function postToResolvedWorker(worker, type, payload = {}, timeout = DEFAULT_TIMEOUT_MS) {
  if (!worker || typeof MessageChannel === 'undefined') {
    return Promise.resolve({
      ok: false,
      status: 'unavailable',
      error: 'Ingen aktiv service worker.'
    });
  }

  return new Promise(resolve => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        channel.port1.close();
      } catch {
        // Ignore a port that has already closed.
      }
      resolve(value || { ok: false, status: 'error' });
    };
    const timeoutId = setTimeout(() => finish({
      ok: false,
      status: 'timeout',
      error: 'Offline-cachen svarade inte i tid.'
    }), timeout);

    channel.port1.onmessage = event => finish(event.data);
    try {
      worker.postMessage({ type, ...payload }, [channel.port2]);
    } catch (error) {
      finish({
        ok: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

async function postToWorker(type, payload = {}, timeout = DEFAULT_TIMEOUT_MS) {
  // Avoid yielding to service-worker readiness when this page is already
  // controlled. Calling the resolved-worker helper directly also guarantees
  // postMessage runs in the caller's task before foreground work can begin.
  const controller = currentWorkerController();
  const worker = controller || await resolveWorker();
  return postToResolvedWorker(worker, type, payload, timeout);
}

async function signalWorker(type, payload = {}) {
  // Keep controller messages synchronous. The readiness fallback remains
  // asynchronous so a first install never delays foreground interaction.
  const controller = currentWorkerController();
  const worker = controller || await resolveWorker();
  try {
    worker?.postMessage?.({ type, ...payload });
    return Boolean(worker);
  } catch {
    // A transient controller change should not interrupt the user interaction.
    return false;
  }
}

function foregroundWorkerTokenId(token) {
  const record = foregroundPauseTokens.get(token);
  return record?.workerTokenId || '';
}

function foregroundPausePayload(token) {
  return {
    durationMs: FOREGROUND_WARM_LEASE_MS,
    tokenId: foregroundWorkerTokenId(token)
  };
}

function signalForegroundPause(token, { acknowledge = false } = {}) {
  const record = foregroundPauseTokens.get(token);
  if (!record) return null;
  lastInputAt = Date.now();

  const controller = acknowledge ? currentWorkerController() : null;
  if (controller && typeof MessageChannel !== 'undefined') {
    // Start the acknowledgement request synchronously. withForegroundPriority
    // consumes this same promise, avoiding a duplicate pause message.
    record.pauseAcknowledgement = postToResolvedWorker(
      controller,
      'PAUSE_RULES_CACHE',
      foregroundPausePayload(token),
      FOREGROUND_CONTROL_TIMEOUT_MS
    );
    return record.pauseAcknowledgement;
  }

  void signalWorker('PAUSE_RULES_CACHE', foregroundPausePayload(token));
  return null;
}

function renewForegroundPauses() {
  if (!foregroundPauseTokens.size) return;
  lastInputAt = Date.now();
  foregroundPauseTokens.forEach((_record, token) => {
    void signalWorker('PAUSE_RULES_CACHE', foregroundPausePayload(token));
  });
}

function scheduleForegroundPauseHeartbeat() {
  if (foregroundPauseTimer || !foregroundPauseTokens.size) return;
  foregroundPauseTimer = window.setTimeout(() => {
    foregroundPauseTimer = null;
    renewForegroundPauses();
    scheduleForegroundPauseHeartbeat();
  }, FOREGROUND_WARM_HEARTBEAT_MS);
}

function pauseRules(reason = 'foreground') {
  const token = Object.freeze({
    id: ++foregroundPauseSequence,
    reason: String(reason || 'foreground')
  });
  foregroundPauseTokens.set(token, {
    reason: token.reason,
    workerTokenId: `${foregroundPauseClientId}:${token.id}`,
    pauseAcknowledgement: null
  });
  signalForegroundPause(token, { acknowledge: true });
  scheduleForegroundPauseHeartbeat();
  notify({
    type: 'OFFLINE_RULES_PRIORITY',
    status: 'paused',
    reason: token.reason,
    active: foregroundPauseTokens.size
  });
  return token;
}

async function yieldRules(token) {
  const record = foregroundPauseTokens.get(token);
  if (!record) return false;
  lastInputAt = Date.now();
  const acknowledgement = record.pauseAcknowledgement || postToWorker(
      'PAUSE_RULES_CACHE',
      foregroundPausePayload(token),
      FOREGROUND_CONTROL_TIMEOUT_MS
    );
  record.pauseAcknowledgement = null;
  await acknowledgement;
  await new Promise(resolve => window.setTimeout(resolve, 0));
  return true;
}

function resumeRules(token) {
  const record = foregroundPauseTokens.get(token);
  if (!record) return false;
  foregroundPauseTokens.delete(token);
  void signalWorker('RESUME_RULES_CACHE', { tokenId: record.workerTokenId });
  if (!foregroundPauseTokens.size && foregroundPauseTimer) {
    window.clearTimeout(foregroundPauseTimer);
    foregroundPauseTimer = null;
  }
  notify({
    type: 'OFFLINE_RULES_PRIORITY',
    status: foregroundPauseTokens.size ? 'paused' : 'resumed',
    reason: record.reason,
    active: foregroundPauseTokens.size
  });
  return true;
}

function waitForPresentationOpportunity() {
  if (typeof window.requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

async function withForegroundPriority(callback, { reason = 'foreground', presentFeedback = false } = {}) {
  if (typeof callback !== 'function') return undefined;
  const token = pauseRules(reason);
  try {
    const record = foregroundPauseTokens.get(token);
    // An existing controller receives the pause synchronously in pauseRules.
    // Wait only for that already-started, 250 ms-bounded acknowledgement. A
    // first install without a controller still enters the callback at once.
    if (record?.pauseAcknowledgement || (rulesWarmActive && currentWorkerController())) {
      if (presentFeedback) await waitForPresentationOpportunity();
      await yieldRules(token);
    }
    return await callback();
  } finally {
    resumeRules(token);
  }
}

async function storageStatus({ requestPersistence = false } = {}) {
  if (!navigator.storage) return { persisted: null, quota: null, usage: null };
  let persisted = null;
  try {
    persisted = await navigator.storage.persisted?.();
    if (requestPersistence && !persisted && typeof navigator.storage.persist === 'function') {
      persisted = await navigator.storage.persist();
    }
  } catch {
    // Browsers are allowed to deny persistence without further detail.
  }
  try {
    const estimate = await navigator.storage.estimate?.();
    return {
      persisted,
      quota: Number(estimate?.quota) || null,
      usage: Number(estimate?.usage) || null
    };
  } catch {
    return { persisted, quota: null, usage: null };
  }
}

async function status() {
  const [workerStatus, storage] = await Promise.all([
    postToWorker('GET_OFFLINE_STATUS', {}, 10_000),
    storageStatus()
  ]);
  return { ...workerStatus, storage };
}

async function warmRules({ force = false } = {}) {
  await storageStatus({ requestPersistence: true });
  rulesWarmActive = true;
  try {
    return await postToWorker(force ? 'UPDATE_RULES_CACHE' : 'WARM_RULES_CACHE');
  } finally {
    rulesWarmActive = false;
  }
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function networkDefersAutomaticWarm() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  return Boolean(connection?.saveData) || effectiveType === '2g' || effectiveType === 'slow-2g';
}

function inputIsPending() {
  try {
    return Boolean(navigator.scheduling?.isInputPending?.());
  } catch {
    return false;
  }
}

function requestAutomaticWarmIdle(callback) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout: 15_000 });
  } else {
    window.setTimeout(callback, 500);
  }
}

function scheduleWarmRules() {
  if (!('serviceWorker' in navigator) || automaticWarmScheduled) return;
  automaticWarmScheduled = true;

  if (networkDefersAutomaticWarm()) {
    notify({ type: 'OFFLINE_RULES_DEFERRED', status: 'deferred', reason: 'connection' });
    return;
  }

  const launchWhenQuiet = () => requestAutomaticWarmIdle(() => {
    const recentlyActive = Date.now() - lastInputAt < INPUT_QUIET_PERIOD_MS;
    if (recentlyActive || inputIsPending()) {
      window.setTimeout(launchWhenQuiet, INPUT_QUIET_PERIOD_MS);
      return;
    }
    warmRules().then(result => notify({ type: 'OFFLINE_RULES_RESULT', ...result }));
  });

  const afterBoot = () => window.setTimeout(launchWhenQuiet, AUTO_WARM_DELAY_MS);
  if (window.__symbaroumBootCompleted) {
    afterBoot();
  } else {
    window.addEventListener('symbaroum-view-boot', afterBoot, { once: true });
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const detail = event.data || {};
    if (detail.type === 'OFFLINE_RULES_PROGRESS') rulesWarmActive = true;
    if (detail.type === 'OFFLINE_RULES_COMPLETE' || detail.type === 'OFFLINE_RULES_ERROR') {
      rulesWarmActive = false;
    }
    if (String(detail.type || '').startsWith('OFFLINE_')) notify(detail);
  });

  const pauseWarmForInput = () => {
    lastInputAt = Date.now();
    if (rulesWarmActive) signalWorker('PAUSE_RULES_CACHE', { durationMs: WARM_PAUSE_MS });
  };
  window.addEventListener('pointerdown', pauseWarmForInput, { capture: true, passive: true });
  window.addEventListener('touchstart', pauseWarmForInput, { capture: true, passive: true });
  window.addEventListener('wheel', pauseWarmForInput, { capture: true, passive: true });
  window.addEventListener('keydown', pauseWarmForInput, { capture: true });
}

const offlineContent = Object.freeze({
  getStatus: status,
  warmRules,
  retryRules: () => warmRules({ force: true }),
  clearDocuments: () => postToWorker('CLEAR_DOCUMENT_CACHE'),
  requestStoragePersistence: () => storageStatus({ requestPersistence: true }),
  pauseRules,
  yieldRules,
  resumeRules,
  withForegroundPriority,
  subscribe,
  scheduleWarmRules
});

window.symbaroumOffline = offlineContent;

export default offlineContent;
