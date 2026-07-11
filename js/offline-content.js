const listeners = new Set();
const DEFAULT_TIMEOUT_MS = 90_000;
const AUTO_WARM_DELAY_MS = 3_000;
const INPUT_QUIET_PERIOD_MS = 750;
const WARM_PAUSE_MS = 900;
let automaticWarmScheduled = false;
let rulesWarmActive = false;
let lastInputAt = 0;

function notify(detail) {
  listeners.forEach(listener => {
    try {
      listener(detail);
    } catch (error) {
      console.error('Offline status listener failed', error);
    }
  });
}

async function resolveWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.active || registration.waiting || registration.installing || null;
  } catch {
    return null;
  }
}

async function postToWorker(type, payload = {}, timeout = DEFAULT_TIMEOUT_MS) {
  const worker = await resolveWorker();
  if (!worker || typeof MessageChannel === 'undefined') {
    return { ok: false, status: 'unavailable', error: 'Ingen aktiv service worker.' };
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

async function signalWorker(type, payload = {}) {
  const worker = await resolveWorker();
  try {
    worker?.postMessage?.({ type, ...payload });
  } catch {
    // A transient controller change should not interrupt the user interaction.
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
  subscribe,
  scheduleWarmRules
});

window.symbaroumOffline = offlineContent;

export default offlineContent;
