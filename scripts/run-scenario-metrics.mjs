import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, devices, webkit } from 'playwright';
import {
  PREVIEW_HOST,
  PREVIEW_PORT,
  createRunDir,
  startPreviewServer,
  stopPreviewServer,
  writeJson
} from './perf-common.mjs';

const DEFAULT_ITERATIONS = 5;
const DEFAULT_RUNTIME = 'desktop-chromium';
const MOBILE_CPU_THROTTLE_RATE = 4;
const TEST_CHAR_ID = 'perf-char-a';
const TEST_CHAR_ID_2 = 'perf-char-b';
const STANDARD_FOLDER_ID = 'fd-standard';

const baseMetaState = {
  current: TEST_CHAR_ID,
  characters: [
    { id: TEST_CHAR_ID, name: 'Mätning Alfa', folderId: STANDARD_FOLDER_ID },
    { id: TEST_CHAR_ID_2, name: 'Mätning Beta', folderId: STANDARD_FOLDER_ID }
  ],
  folders: [
    { id: STANDARD_FOLDER_ID, name: 'Standard', order: 0, system: true }
  ],
  activeFolder: 'ALL',
  filterUnion: false,
  compactEntries: true,
  onlySelected: false,
  recentSearches: [],
  liveMode: false,
  entrySort: 'alpha-asc'
};

const baseCharacter = {
  list: [],
  inventory: [],
  custom: [],
  artifactEffects: {},
  notes: {},
  money: { daler: 3, skilling: 0, 'örtegar': 0 }
};

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeHeavyCharacter(label, options = {}) {
  const listSize = Number.isFinite(options.listSize) ? Math.max(0, Number(options.listSize)) : 1000;
  const inventorySize = Number.isFinite(options.inventorySize) ? Math.max(0, Number(options.inventorySize)) : 1000;
  return {
    list: Array.from({ length: listSize }, (_, index) => ({
      id: `${label}-list-${index}`,
      namn: `${label} List ${index}`,
      nivå: 'Novis',
      form: 'normal',
      taggar: { typ: ['Förmåga'] },
      text: 'x'.repeat(120)
    })),
    inventory: Array.from({ length: inventorySize }, (_, index) => ({
      id: `${label}-inv-${index}`,
      name: `${label} Inv ${index}`,
      qty: 1 + (index % 3),
      gratis: 0,
      gratisKval: [],
      removedKval: []
    })),
    custom: [],
    artifactEffects: {},
    notes: { background: `${label} heavy profile` },
    money: { daler: 3, skilling: 0, 'örtegar': 0 }
  };
}

async function seedStore(context, { profile = 'base' } = {}) {
  const metaState = cloneValue(baseMetaState);
  const characters = {
    [TEST_CHAR_ID]: cloneValue(baseCharacter),
    [TEST_CHAR_ID_2]: {
      ...cloneValue(baseCharacter),
      notes: {
        background: 'Reservkaraktär'
      }
    }
  };

  if (profile === 'heavy') {
    characters[TEST_CHAR_ID] = makeHeavyCharacter('Alpha');
    characters[TEST_CHAR_ID_2] = makeHeavyCharacter('Beta');
  } else if (profile === 'interaction-heavy') {
    characters[TEST_CHAR_ID] = makeHeavyCharacter('Alpha', {
      listSize: 250,
      inventorySize: 250
    });
    characters[TEST_CHAR_ID_2] = makeHeavyCharacter('Beta', {
      listSize: 250,
      inventorySize: 250
    });
  }

  await context.addInitScript(({ metaState, characters }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    Object.entries(characters).forEach(([id, value]) => {
      localStorage.setItem(`rpall-char-${id}`, JSON.stringify(value));
    });
  }, { metaState, characters });
}

async function waitForApp(page, pathName, readySelector, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 120_000;
  await page.goto(`http://${PREVIEW_HOST}:${PREVIEW_PORT}${pathName}`, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs
  });
  await page.waitForFunction(
    () => Boolean(window.DB?.length) && Boolean(window.__symbaroumBootCompleted),
    null,
    { timeout: timeoutMs }
  );
  if (readySelector) {
    await page.locator(readySelector).first().waitFor({ state: 'attached', timeout: timeoutMs });
    await page.waitForFunction((selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const items = element.querySelectorAll?.('li.entry-card, li.card, li');
      if (items && items.length > 0) return true;
      return element.childElementCount > 0;
    }, readySelector, { timeout: timeoutMs });
  }
  await page.waitForTimeout(500);
}

function getRuntimeConfig(runtimeName = DEFAULT_RUNTIME) {
  const runtime = String(runtimeName || DEFAULT_RUNTIME).trim().toLowerCase();
  if (runtime === 'mobile-chromium') {
    return {
      name: runtime,
      browserType: chromium,
      contextOptions: { ...devices['Pixel 7'], serviceWorkers: 'allow' },
      cpuThrottleRate: MOBILE_CPU_THROTTLE_RATE,
      pwa: false
    };
  }
  if (runtime === 'mobile-webkit') {
    return {
      name: runtime,
      browserType: webkit,
      contextOptions: { ...devices['iPhone 15'], serviceWorkers: 'allow' },
      cpuThrottleRate: 1,
      pwa: false
    };
  }
  if (runtime === 'pwa-chromium') {
    return {
      name: runtime,
      browserType: chromium,
      contextOptions: { ...devices['Pixel 7'], serviceWorkers: 'allow' },
      cpuThrottleRate: MOBILE_CPU_THROTTLE_RATE,
      pwa: true
    };
  }
  return {
    name: DEFAULT_RUNTIME,
    browserType: chromium,
    contextOptions: { ...devices['Desktop Chrome'], serviceWorkers: 'allow' },
    cpuThrottleRate: 1,
    pwa: false
  };
}

async function ensurePwaControlled(page, options = {}) {
  if (!options.pwa) return;
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
    await navigator.serviceWorker.ready;
  });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => (
      Boolean(window.__symbaroumBootCompleted)
      && Boolean(navigator.serviceWorker?.controller)
    ), null, { timeout: 120_000 });
  }
}

async function setChromiumCpuThrottle(page, rate) {
  const runtime = getRuntimeConfig(process.env.PERF_RUNTIME || DEFAULT_RUNTIME);
  if (runtime.browserType !== chromium) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: Math.max(1, Number(rate) || 1) });
}

async function clearPerfHistory(page) {
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });
}

async function snapshot(page) {
  return page.evaluate(() => window.symbaroumPerf?.getSnapshot?.() || null);
}

async function waitForScenario(page, name) {
  await page.waitForFunction(
    (scenarioName) => {
      const data = window.symbaroumPerf?.getSnapshot?.();
      return Boolean(data?.scenarios?.some((entry) => entry.name === scenarioName && entry.status === 'completed'));
    },
    name,
    { timeout: 30_000 }
  );

  const data = await snapshot(page);
  const matches = (data?.scenarios || []).filter((entry) => entry.name === name && entry.status === 'completed');
  return matches[matches.length - 1] || null;
}

async function withSeededPage(browser, options, action) {
  const runtime = getRuntimeConfig(process.env.PERF_RUNTIME || DEFAULT_RUNTIME);
  const context = await browser.newContext(runtime.contextOptions);
  try {
    await seedStore(context, { profile: options.profile || 'base' });
    const page = await context.newPage();
    await waitForApp(page, options.pathName, options.readySelector, {
      timeoutMs: options.timeoutMs
    });
    await ensurePwaControlled(page, runtime);
    if (runtime.cpuThrottleRate > 1) {
      await setChromiumCpuThrottle(page, runtime.cpuThrottleRate);
    }
    return await action(page, context);
  } finally {
    await context.close();
  }
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function percentile(values = [], fraction = 0.95) {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!numeric.length) return null;
  const index = Math.min(numeric.length - 1, Math.ceil(numeric.length * fraction) - 1);
  return numeric[index];
}

function summarizeDetail(detail = {}) {
  return {
    scope: detail.scope || null,
    branch: detail.branch || null,
    renderMode: detail.renderMode || null,
    entry: detail.entry || null,
    behaviorSignature: detail.behaviorSignature || null,
    pathMode: detail.pathMode || null,
    stateSize: Number.isFinite(Number(detail.stateSize)) ? Number(detail.stateSize) : null,
    aggregateState: detail.aggregateState || null,
    activeFilters: detail.activeFilters === true,
    direction: detail.direction || null,
    trigger: detail.trigger || null,
    source: detail.source || null,
    endStateHash: detail.endStateHash || null,
    classifier: detail.classifier || null,
    uiStability: detail.uiStability || null,
    browserWork: detail.browserWork || null
  };
}

function aggregateNumbers(values = []) {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numeric.length) {
    return {
      sampleCount: 0,
      totalMs: 0,
      avgMs: null,
      medianMs: null,
      p95Ms: null,
      minMs: null,
      maxMs: null
    };
  }
  const sum = numeric.reduce((total, value) => total + value, 0);
  return {
    sampleCount: numeric.length,
    totalMs: sum,
    avgMs: sum / numeric.length,
    medianMs: median(numeric),
    p95Ms: numeric.length >= 5 ? percentile(numeric, 0.95) : null,
    minMs: Math.min(...numeric),
    maxMs: Math.max(...numeric)
  };
}

function aggregateScenarioRuns(name, runs = []) {
  const durations = runs.map((run) => Number(run?.duration || 0));
  const usesFullCatalogRender = (run) => {
    const stageNames = (run?.detail?.profile?.stages || []).map((stage) => stage.name);
    return run?.detail?.renderMode === 'full'
      || stageNames.includes('full-list-render')
      || stageNames.includes('sort-group-rebuild');
  };
  const stageNames = [...new Set(runs.flatMap((run) => (
    Array.isArray(run?.detail?.profile?.stages)
      ? run.detail.profile.stages.map((stage) => stage.name)
      : []
  )))].filter(Boolean);
  const stages = Object.fromEntries(stageNames.map((stageName) => {
    const totals = runs.map((run) => (
      (run?.detail?.profile?.stages || [])
        .filter((stage) => stage.name === stageName)
        .reduce((sum, stage) => sum + Number(stage.duration || 0), 0)
    ));
    const aggregate = aggregateNumbers(totals);
    aggregate.callCount = runs.reduce((sum, run) => sum + (
      (run?.detail?.profile?.stages || []).filter((stage) => stage.name === stageName).length
    ), 0);
    return [stageName, aggregate];
  }));
  const checkpointNames = [...new Set(runs.flatMap((run) => (
    Array.isArray(run?.detail?.profile?.checkpoints)
      ? run.detail.profile.checkpoints.map((checkpoint) => checkpoint.name)
      : []
  )))].filter(Boolean);
  const checkpoints = Object.fromEntries(checkpointNames.map((checkpointName) => {
    const offsets = runs.flatMap((run) => (
      (run?.detail?.profile?.checkpoints || [])
        .filter((checkpoint) => checkpoint.name === checkpointName)
        .map((checkpoint) => Number(checkpoint.offsetMs))
    ));
    return [checkpointName, aggregateNumbers(offsets)];
  }));
  const counterNames = [...new Set(runs.flatMap((run) => (
    Object.keys(run?.detail?.profile?.counters || {})
  )))].filter(Boolean);
  const counters = Object.fromEntries(counterNames.map((counterName) => [
    counterName,
    aggregateNumbers(runs.map((run) => Number(run?.detail?.profile?.counters?.[counterName] || 0)))
  ]));
  const fallbackReasons = [...new Set(runs.flatMap((run) => (
    (run?.detail?.profile?.fallbacks || []).map((fallback) => fallback.reason)
  )))].filter(Boolean);
  const fallbacks = Object.fromEntries(fallbackReasons.map((reason) => {
    const counts = runs.map((run) => (
      (run?.detail?.profile?.fallbacks || []).filter((fallback) => fallback.reason === reason).length
    ));
    return [reason, {
      ...aggregateNumbers(counts),
      count: counts.reduce((sum, count) => sum + count, 0)
    }];
  }));
  const relativeLatency = (targetNames) => aggregateNumbers(runs.map((run) => {
    const runCheckpoints = run?.detail?.profile?.checkpoints || [];
    const interaction = runCheckpoints.find(checkpoint => (
      checkpoint.name === 'interaction-start' || checkpoint.name === 'pointer-received'
    ));
    const target = targetNames
      .map(targetName => runCheckpoints.find(checkpoint => checkpoint.name === targetName))
      .find(Boolean);
    if (!target) return NaN;
    return Math.max(0, Number(target.offsetMs || 0) - Number(interaction?.offsetMs || 0));
  }));

  return {
    name,
    iterations: runs.length,
    ...aggregateNumbers(durations),
    fullCatalogRenderCount: runs.filter(usesFullCatalogRender).length,
    stages,
    checkpoints,
    counters,
    fallbacks,
    latency: {
      visibleResponse: relativeLatency([
        'first-feedback-presented',
        'first-feedback-dom',
        'post-render-two-raf'
      ]),
      completeConsistency: relativeLatency(['all-views-consistent', 'final-consistency']),
      persistenceComplete: relativeLatency(['persistence-flush-complete'])
    },
    samples: runs.map((run) => ({
      durationMs: Number(run?.duration || 0),
      fullCatalogRender: usesFullCatalogRender(run),
      checkpoints: Object.fromEntries((run?.detail?.profile?.checkpoints || []).map((checkpoint) => (
        [checkpoint.name, Number(checkpoint.offsetMs || 0)]
      ))),
      counters: run?.detail?.profile?.counters || {},
      fallbacks: run?.detail?.profile?.fallbacks || [],
      detail: summarizeDetail(run?.detail || {})
    })),
    detail: summarizeDetail(runs[0]?.detail || {})
  };
}

function aggregateVitals(vitalSamples = []) {
  const grouped = new Map();
  vitalSamples.forEach((metric) => {
    if (!metric?.name || !Number.isFinite(Number(metric.value))) return;
    if (!grouped.has(metric.name)) grouped.set(metric.name, []);
    grouped.get(metric.name).push(Number(metric.value));
  });
  return Array.from(grouped.entries()).map(([name, values]) => ({
    name,
    ...aggregateNumbers(values)
  }));
}

async function collectRuns(browser, iterations, runner) {
  const runs = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    runs.push(await runner(iteration));
  }
  return runs;
}

async function readCanonicalInventory(page) {
  return page.evaluate(() => {
    const canonicalize = value => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (!value || typeof value !== 'object') return value;
      return Object.keys(value).sort().reduce((output, key) => {
        output[key] = canonicalize(value[key]);
        return output;
      }, {});
    };
    const normalize = rows => (Array.isArray(rows) ? rows : []).map(row => {
      const contains = row?.contains;
      const rest = { ...(row || {}) };
      delete rest.contains;
      delete rest.posQualCnt;
      return {
        ...rest,
        artifactEffect: row?.artifactEffect || '',
        kvaliteter: Array.isArray(row?.kvaliteter) ? row.kvaliteter : [],
        gratisKval: Array.isArray(row?.gratisKval) ? row.gratisKval : [],
        removedKval: Array.isArray(row?.removedKval) ? row.removedKval : [],
        ...(Array.isArray(contains) && contains.length ? { contains: normalize(contains) } : {})
      };
    });
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return JSON.stringify(canonicalize(normalize(window.storeHelper.getInventory(activeStore))));
  });
}

async function startBrowserWorkCapture(page) {
  if (getRuntimeConfig(process.env.PERF_RUNTIME || DEFAULT_RUNTIME).browserType !== chromium) return null;
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  return { session, before: await session.send('Performance.getMetrics') };
}

async function finishBrowserWorkCapture(capture) {
  if (!capture?.session || !capture?.before) return null;
  const afterMetrics = await capture.session.send('Performance.getMetrics');
  const before = new Map(capture.before.metrics.map(metric => [metric.name, Number(metric.value) || 0]));
  const after = new Map(afterMetrics.metrics.map(metric => [metric.name, Number(metric.value) || 0]));
  const delta = name => (after.get(name) || 0) - (before.get(name) || 0);
  await capture.session.detach();
  return {
    layoutDurationMs: delta('LayoutDuration') * 1000,
    recalcStyleDurationMs: delta('RecalcStyleDuration') * 1000,
    scriptDurationMs: delta('ScriptDuration') * 1000,
    taskDurationMs: delta('TaskDuration') * 1000,
    layoutCount: delta('LayoutCount'),
    recalcStyleCount: delta('RecalcStyleCount')
  };
}

async function installInventoryDomProbe(page) {
  await page.evaluate(() => {
    const root = document.getElementById('invList');
    const initialNodes = new Map();
    root?.querySelectorAll('li.entry-card[data-uid]').forEach(card => {
      const uid = String(card.dataset.uid || '').trim();
      if (uid && !initialNodes.has(uid)) initialNodes.set(uid, card);
    });
    const added = new Set();
    const removed = new Set();
    const collect = (node, output) => {
      output.add(node);
      node.querySelectorAll?.('*').forEach(child => output.add(child));
    };
    const observer = root ? new MutationObserver(records => {
      records.forEach(record => {
        if (record.type !== 'childList') return;
        record.addedNodes.forEach(node => collect(node, added));
        record.removedNodes.forEach(node => collect(node, removed));
      });
    }) : null;
    observer?.observe(root, { childList: true, subtree: true });
    window.__inventoryControlDomProbe = {
      root,
      initialNodes,
      initialCards: initialNodes.size,
      initialDescendants: root?.querySelectorAll('*').length || 0,
      initialScrollY: window.scrollY,
      initialFocus: document.activeElement,
      added,
      removed,
      observer
    };
  });
}

async function readInventoryDomProbe(page) {
  return page.evaluate(() => {
    const probe = window.__inventoryControlDomProbe;
    if (!probe) return null;
    probe.observer?.takeRecords?.().forEach(record => {
      if (record.type !== 'childList') return;
      const collect = (node, output) => {
        output.add(node);
        node.querySelectorAll?.('*').forEach(child => output.add(child));
      };
      record.addedNodes.forEach(node => collect(node, probe.added));
      record.removedNodes.forEach(node => collect(node, probe.removed));
    });
    probe.observer?.disconnect?.();
    const currentByUid = new Map();
    probe.root?.querySelectorAll('li.entry-card[data-uid]').forEach(card => {
      const uid = String(card.dataset.uid || '').trim();
      if (uid && !currentByUid.has(uid)) currentByUid.set(uid, card);
    });
    let preserved = 0;
    let reconstructed = 0;
    let removedCards = 0;
    probe.initialNodes.forEach((node, uid) => {
      const current = currentByUid.get(uid);
      if (current === node) preserved += 1;
      else if (current) reconstructed += 1;
      else removedCards += 1;
    });
    const moved = [...probe.added].filter(node => probe.removed.has(node));
    const created = Math.max(0, probe.added.size - moved.length);
    const deleted = Math.max(0, probe.removed.size - moved.length);
    const result = {
      scrollBefore: probe.initialScrollY,
      scrollAfter: window.scrollY,
      focusPreserved: document.activeElement === probe.initialFocus,
      cardNodesBefore: probe.initialCards,
      cardNodesAfter: currentByUid.size,
      cardNodesPreserved: preserved,
      cardsReconstructed: reconstructed,
      cardsRemoved: removedCards,
      rootDescendantsBefore: probe.initialDescendants,
      rootDescendantsAfter: probe.root?.querySelectorAll('*').length || 0,
      domNodesCreated: created,
      domNodesMoved: moved.length,
      domNodesRemoved: deleted,
      domNodesReplaced: Math.min(created, deleted)
    };
    delete window.__inventoryControlDomProbe;
    return result;
  });
}

async function revealIndexPerfTarget(page, kind, options = {}) {
  const preferredNames = options.entryName
    ? [String(options.entryName)]
    : kind === 'inventory'
      ? ['Dubbel ringbrynja']
      : kind === 'popup'
        ? ['Monsterlärd', 'Exceptionellt karaktärsdrag', 'Blodsband']
        : ['Akrobatik'];
  const target = await page.evaluate(({ kind, preferredNames }) => {
    const listEntryTypes = new Set(['Förmåga', 'Basförmåga', 'Särdrag', 'Fördel', 'Nackdel', 'Mystisk kraft', 'Ritual']);
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const visibleCards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
    const visibleMatch = preferredNames
      .map((name) => visibleCards.find((card) => String(card?.dataset?.name || '').trim() === name))
      .find(Boolean);
    if (visibleMatch) {
      return {
        id: visibleMatch.dataset.id || '',
        name: String(visibleMatch.dataset.name || '').trim()
      };
    }

    const describe = (entry) => {
      const meta = typeof window.ensureEntryMeta === 'function'
        ? window.ensureEntryMeta(entry)
        : null;
      const types = Array.isArray(meta?.typList)
        ? meta.typList
        : (Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : []);
      return {
        entry,
        id: String(entry?.id || ''),
        name: String(entry?.namn || '').trim(),
        types,
        isInventory: typeof window.isInv === 'function' ? Boolean(window.isInv(entry)) : false,
        isEmployment: typeof window.isEmployment === 'function' ? Boolean(window.isEmployment(entry)) : false,
        isService: typeof window.isService === 'function' ? Boolean(window.isService(entry)) : false,
        isHidden: typeof window.storeHelper?.isSearchHiddenEntry === 'function'
          ? Boolean(window.storeHelper.isSearchHiddenEntry(entry))
          : false,
        isArtifact: types.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()))
      };
    };
    const candidates = entries.map(describe).filter((item) => item.name);
    const preferred = preferredNames
      .map((name) => candidates.find((item) => item.name === name))
      .find(Boolean);
    const fallback = kind === 'inventory'
      ? candidates.find((item) => item.isInventory && !item.isHidden && !item.isArtifact)
        || candidates.find((item) => item.isInventory)
      : candidates.find((item) => (
        !item.isInventory
        && !item.isEmployment
        && !item.isService
        && item.types.some((type) => listEntryTypes.has(String(type || '').trim()))
      )) || candidates.find((item) => !item.isInventory && !item.isEmployment && !item.isService);
    const picked = preferred || fallback || null;
    if (!picked) return null;
    if (typeof window.handleIndexSearchTerm === 'function') {
      window.handleIndexSearchTerm(picked.name, { scroll: false });
    } else {
      const cat = picked.types[0] || '';
      const details = [...document.querySelectorAll('.cat-group > details')]
        .find((candidate) => String(candidate?.dataset?.cat || '') === cat);
      if (details) {
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
      }
    }
    return {
      id: picked.id,
      name: picked.name
    };
  }, { kind, preferredNames });

  if (!target?.name) {
    throw new Error(`Unable to reveal a deterministic ${kind} index target.`);
  }

  const actionSelector = options.actionSelector || 'button.add-btn, button[data-act="add"], button[data-act="addInventory"]';
  await page.waitForFunction(({ id, name, actionSelector }) => {
    const cards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
    return cards.some((card) => {
      const cardId = String(card?.dataset?.id || '').trim();
      const cardName = String(card?.dataset?.name || '').trim();
      const sameEntry = (id && cardId === id) || cardName === name;
      return sameEntry && (!actionSelector || Boolean(card.querySelector(actionSelector)));
    });
  }, { ...target, actionSelector }, { timeout: 120_000 });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  return target;
}

async function clickDeterministicAddButton(page, kind) {
  const target = await page.evaluate((targetKind) => {
    const listEntryTypes = new Set(['Förmåga', 'Basförmåga', 'Särdrag', 'Fördel', 'Nackdel', 'Mystisk kraft', 'Ritual']);
    const preferredNames = targetKind === 'inventory'
      ? ['Dubbel ringbrynja']
      : ['Akrobatik'];
    const buttons = Array.from(document.querySelectorAll('#lista button.add-btn'));
    const visible = buttons.filter((button) => {
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    }).map((button) => {
      const card = button.closest('li');
      const id = button.dataset.id || card?.dataset?.id || '';
      const name = button.dataset.name || card?.dataset?.name || '';
      const entry = typeof window.lookupEntry === 'function'
        ? window.lookupEntry({ id: id || undefined, name })
        : null;
      const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      const isInventory = typeof window.isInv === 'function'
        ? Boolean(window.isInv(entry))
        : false;
      const isEmployment = typeof window.isEmployment === 'function'
        ? Boolean(window.isEmployment(entry))
        : false;
      const isService = typeof window.isService === 'function'
        ? Boolean(window.isService(entry))
        : false;
      const isHidden = typeof window.storeHelper?.isSearchHiddenEntry === 'function'
        ? Boolean(window.storeHelper.isSearchHiddenEntry(entry))
        : false;
      const isArtifact = types.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()));
      return {
        button,
        id,
        name: name || entry?.namn || '',
        types,
        isInventory,
        isEmployment,
        isService,
        isHidden,
        isArtifact
      };
    });

    const preferred = preferredNames
      .map((name) => visible.find((item) => item.name === name))
      .find(Boolean);

    const fallback = targetKind === 'inventory'
      ? visible.find((item) => item.isInventory && !item.isHidden && !item.isArtifact)
        || visible.find((item) => item.isInventory)
      : visible.find((item) => (
        !item.isInventory
        && !item.isEmployment
        && !item.isService
        && item.types.some((type) => listEntryTypes.has(String(type || '').trim()))
      )) || visible.find((item) => !item.isInventory && !item.isEmployment && !item.isService);

    const picked = preferred || fallback || null;
    if (!picked?.button) return null;
    picked.button.click();
    return {
      name: picked.name,
      types: picked.types,
      kind: targetKind
    };
  }, kind);

  if (!target) {
    throw new Error(`Unable to find a deterministic ${kind} add target.`);
  }
  return target;
}

async function settleAfterMutation(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function enableRemoveProfiling(page, options = {}) {
  await page.evaluate(async ({ overrideDialogs }) => {
    window.__symbaroumPerfCaptureRemovals = true;
    window.__symbaroumPerfAwaitFlush = true;
    if (overrideDialogs && !window.__symbaroumPerfDialogOverrides) {
      window.__symbaroumPerfDialogOverrides = {
        alertPopup: window.alertPopup,
        confirmPopup: window.confirmPopup,
        openDialog: window.openDialog
      };
    }
    if (overrideDialogs) {
      window.alertPopup = async () => true;
      window.confirmPopup = async () => true;
      window.openDialog = async () => true;
    }
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'remove-prep' });
    window.symbaroumPerf?.clearHistory?.();
  }, { overrideDialogs: options.overrideDialogs !== false });
}

async function clickCardAction(page, { rootSelector, name, act }) {
  const acts = (Array.isArray(act) ? act : [act]).map((value) => String(value || '').trim()).filter(Boolean);
  const clicked = await page.evaluate(({ rootSelector, name, acts }) => {
    const root = document.querySelector(rootSelector);
    if (!root) return null;
    const cards = [...root.querySelectorAll('li.entry-card, li.card')];
    const target = cards.find((card) => {
      const cardName = String(card?.dataset?.name || '').trim();
      if (name && cardName !== name) return false;
      return acts.some((candidateAct) => Boolean(card.querySelector(`button[data-act="${candidateAct}"]`)));
    }) || null;
    if (!target) return null;
    const button = acts
      .map((candidateAct) => target.querySelector(`button[data-act="${candidateAct}"]`))
      .find(Boolean);
    if (!button) return null;
    button.click();
    return {
      name: String(target.dataset.name || '').trim(),
      act: String(button.dataset.act || '').trim()
    };
  }, { rootSelector, name, acts });

  if (!clicked) {
    const available = await page.evaluate(({ rootSelector, name }) => {
      const root = document.querySelector(rootSelector);
      if (!root) return { rootFound: false, cards: [] };
      const cards = [...root.querySelectorAll('li.entry-card, li.card')].map((card) => ({
        name: String(card?.dataset?.name || '').trim(),
        acts: [...card.querySelectorAll('button[data-act]')].map((button) => String(button.dataset.act || '').trim()).filter(Boolean)
      }));
      return {
        rootFound: true,
        cards: name
          ? cards.filter((card) => card.name === name)
          : cards.slice(0, 20)
      };
    }, { rootSelector, name });
    throw new Error(`Unable to click ${acts.join('/')} in ${rootSelector}${name ? ` for ${name}` : ''}. Available: ${JSON.stringify(available)}`);
  }
  return clicked;
}

async function waitForRemoveScenario(page) {
  return waitForScenario(page, 'remove-item-from-character');
}

async function prepareCharacterListEntry(page, options = {}) {
  return page.evaluate(async ({ entryName = 'Akrobatik', count = 1, onlySelected = false }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = window.lookupEntry?.({ name: entryName })
      || (window.DB || []).find((candidate) => String(candidate?.namn || '').trim() === String(entryName).trim())
      || null;
    if (!entry) throw new Error(`Missing entry: ${entryName}`);
    const levels = Object.keys(entry.nivåer || {});
    const level = levels[0] || entry.nivå || 'Novis';
    const list = Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => ({
      ...JSON.parse(JSON.stringify(entry)),
      nivå: level,
      __uid: `perf-char-${Date.now()}-${index}`
    }));
    window.storeHelper.setCurrentList(activeStore, list);
    window.storeHelper.setOnlySelected(activeStore, Boolean(onlySelected));
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-character-list' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      traits: true,
      summary: true,
      effects: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
    return {
      name: entry.namn,
      count: list.length
    };
  }, options);
}

// Retained for targeted artifact-removal profiling runs.
// eslint-disable-next-line no-unused-vars
async function prepareCharacterArtifactRemove(page) {
  return page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const candidates = (window.DB || []).filter((candidate) => (
      window.isInv?.(candidate)
      && Array.isArray(candidate?.taggar?.typ)
      && candidate.taggar.typ.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()))
    ));
    const entry = candidates.find((candidate) => (
      Array.isArray(candidate?.taggar?.typ)
      && candidate.taggar.typ.some((type) => String(type || '').trim() === 'Artefakt')
    )) || candidates[0] || null;
    if (!entry) throw new Error('Missing artifact entry for character remove scenario.');
    const row = {
      id: entry.id,
      name: entry.namn,
      qty: 1,
      gratis: 0,
      gratisKval: [],
      removedKval: [],
      artifactEffect: entry.artifactEffect || ''
    };
    const levels = Object.keys(entry.nivåer || {});
    window.storeHelper.setCurrentList(activeStore, [{
      ...JSON.parse(JSON.stringify(entry)),
      nivå: levels[0] || entry.nivå || 'Novis',
      __uid: `perf-artifact-${Date.now()}`
    }]);
    window.storeHelper.setInventory(activeStore, [row]);
    if (entry.id) window.storeHelper.addRevealedArtifact(activeStore, entry.id);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-character-artifact' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      strict: true
    });
    return { name: entry.namn, id: entry.id || null };
  });
}

async function prepareCharacterGrantCascadeRemove(page) {
  return page.evaluate(async () => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = window.lookupEntry?.({ name: 'Hamnskifte' })
      || (window.DB || []).find(candidate => String(candidate?.namn || '').trim() === 'Hamnskifte')
      || null;
    if (!entry) throw new Error('Missing grant source for cascading remove scenario.');
    const levels = Object.keys(entry.nivåer || {});
    const level = levels.includes('Mästare') ? 'Mästare' : (levels.at(-1) || entry.nivå || 'Novis');
    window.storeHelper.setCurrentList(activeStore, [{
      ...JSON.parse(JSON.stringify(entry)),
      nivå: level,
      __uid: `perf-grant-cascade-${Date.now()}`
    }]);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-grant-cascade' });
    window.symbaroumViewBridge?.refreshCurrent({ selection: true, strict: true });
    return {
      name: entry.namn,
      level,
      grantedCount: window.storeHelper.getCurrentList(activeStore).filter(candidate => candidate.namn !== entry.namn).length
    };
  });
}

async function prepareIndexListEntry(page, options = {}) {
  return page.evaluate(async ({ entryName = 'Akrobatik', count = 1, onlySelected = false }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    let entry = window.lookupEntry?.({ name: entryName })
      || (window.DB || []).find((candidate) => String(candidate?.namn || '').trim() === String(entryName).trim())
      || null;
    if (!entry) throw new Error(`Missing entry: ${entryName}`);
    if (typeof window.catalogLoader?.ensureEntryData === 'function') {
      entry = await window.catalogLoader.ensureEntryData(entry);
    }
    const levels = Object.keys(entry.nivåer || {});
    const level = levels[0] || entry.nivå || 'Novis';
    const list = Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => ({
      ...JSON.parse(JSON.stringify(entry)),
      nivå: level,
      __uid: `perf-index-${Date.now()}-${index}`
    }));
    window.storeHelper.setCurrentList(activeStore, list);
    window.storeHelper.setOnlySelected(activeStore, Boolean(onlySelected));
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-index-list' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
    return { name: entry.namn, count: list.length };
  }, options);
}

async function prepareIndexInventoryEntry(page, options = {}) {
  return page.evaluate(async ({ entryName = 'Dubbel ringbrynja', qty = 1, useArtifactCandidate = false, onlySelected = false }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    let entry = useArtifactCandidate
      ? (() => {
          const visibleCards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
            .map((card) => {
              const ref = {
                id: card?.dataset?.id || undefined,
                name: String(card?.dataset?.name || '').trim()
              };
              const candidate = window.lookupEntry?.(ref) || null;
              return candidate ? { card, candidate } : null;
            })
            .filter(Boolean);
          const visibleArtifact = visibleCards.find(({ candidate }) => (
            window.isInv?.(candidate)
            && Array.isArray(candidate?.taggar?.typ)
            && candidate.taggar.typ.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()))
          ))?.candidate || null;
          if (visibleArtifact) return visibleArtifact;
          return (window.DB || []).find((candidate) => (
            window.isInv?.(candidate)
            && Array.isArray(candidate?.taggar?.typ)
            && candidate.taggar.typ.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()))
          )) || (window.DB || []).find((candidate) => (
            window.isInv?.(candidate)
            && window.storeHelper?.isSearchHiddenEntry?.(candidate)
          )) || null;
        })()
      : window.lookupEntry?.({ name: entryName })
        || (window.DB || []).find((candidate) => String(candidate?.namn || '').trim() === String(entryName).trim())
        || null;
    if (!entry) throw new Error('Missing inventory entry for index remove scenario.');
    if (typeof window.catalogLoader?.ensureEntryData === 'function') {
      entry = await window.catalogLoader.ensureEntryData(entry);
    }
    const row = useArtifactCandidate
      ? {
          id: entry.id,
          name: entry.namn,
          qty: 1,
          gratis: 0,
          gratisKval: [],
          removedKval: [],
          artifactEffect: entry.artifactEffect || ''
        }
      : await window.invUtil?.buildInventoryRow?.({
          entry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
    if (!row) throw new Error('Unable to build inventory row.');
    row.qty = Math.max(1, Number(qty) || 1);
    window.storeHelper.setInventory(activeStore, [row]);
    if (useArtifactCandidate) {
      const levels = Object.keys(entry.nivåer || {});
      window.storeHelper.setCurrentList(activeStore, [{
        ...JSON.parse(JSON.stringify(entry)),
        nivå: levels[0] || entry.nivå || 'Novis'
      }]);
      if (entry.id && typeof window.storeHelper.addRevealedArtifact === 'function') {
        window.storeHelper.addRevealedArtifact(activeStore, entry.id);
      }
    }
    window.storeHelper.setOnlySelected(activeStore, Boolean(onlySelected));
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-index-inventory' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      strict: true
    });
    window.invUtil?.renderInventory?.();
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
    return {
      name: entry.namn,
      qty: row.qty,
      useArtifactCandidate
    };
  }, options);
}

// Retained for targeted multi-entry profiling runs.
// eslint-disable-next-line no-unused-vars
async function pickMultiListEntryName(page) {
  return page.evaluate(() => {
    const entry = (window.DB || []).find((candidate) => (
      !window.isInv?.(candidate)
      && !window.isEmployment?.(candidate)
      && !window.isService?.(candidate)
      && Number(candidate?.taggar?.max_antal) > 1
    )) || null;
    return entry?.namn || null;
  });
}

async function runFirstLoad(browser, iterations) {
  const vitals = [];
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      const data = await snapshot(page);
      vitals.push(...(data?.vitals || []));
      const firstLoad = ((data?.scenarios || []).filter((entry) => entry.name === 'first-load')).at(-1) || null;
      return firstLoad;
    })
  ));

  return {
    ...aggregateScenarioRuns('first-load', runs),
    vitals: aggregateVitals(vitals)
  };
}

async function runRouteChange(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      await clearPerfHistory(page);
      await page.locator('shared-toolbar').locator('#traitsLink').click();
      await page.waitForURL(/#\/traits/);
      await page.locator('#traitsTabPanel').waitFor({ state: 'visible' });
      return waitForScenario(page, 'route-change');
    })
  ));
  return aggregateScenarioRuns('route-change', runs);
}

async function runOpenInventory(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      await clearPerfHistory(page);
      await page.locator('shared-toolbar').locator('#inventoryLink').click();
      await page.waitForURL(/#\/inventory/);
      await page.locator('#invList').waitFor({ state: 'visible' });
      return waitForScenario(page, 'open-inventory');
    })
  ));
  return aggregateScenarioRuns('open-inventory', runs);
}

async function runSwitchCharacter(browser, iterations, options = {}) {
  const scenarioName = options.profile === 'interaction-heavy'
    ? 'switch-character-large-specialized'
    : 'switch-character';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/character',
      readySelector: '#valda',
      profile: options.profile || 'base'
    }, async (page) => {
      await clearPerfHistory(page);
      await page.locator('shared-toolbar').locator('#charSelect').selectOption(TEST_CHAR_ID_2);
      await page.locator('#charName').waitFor({ state: 'visible' });
      return waitForScenario(page, 'switch-character');
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runSearchFilter(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/index', readySelector: '#lista' }, async (page) => {
      await clearPerfHistory(page);
      await page.evaluate(() => {
        if (typeof window.handleIndexSearchTerm === 'function') {
          window.handleIndexSearchTerm('Akrobatik');
        }
      });
      return waitForScenario(page, 'search-filter');
    })
  ));
  return aggregateScenarioRuns('search-filter', runs);
}

async function runIndexAdd(browser, iterations, kind) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/index',
      readySelector: '#lista',
      profile: kind === 'list' ? 'interaction-heavy' : 'base'
    }, async (page) => {
      await revealIndexPerfTarget(page, kind);
      await clearPerfHistory(page);
      const target = await clickDeterministicAddButton(page, kind);
      const scenario = await waitForScenario(page, 'add-item-to-character');
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target
        }
      };
    })
  ));
  return aggregateScenarioRuns(kind === 'inventory' ? 'index-inventory-add' : 'index-list-add', runs);
}

async function runIndexPopupAdd(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/index',
      readySelector: '#lista',
      profile: 'interaction-heavy'
    }, async (page) => {
      await revealIndexPerfTarget(page, 'popup');
      await page.evaluate(() => {
        window.__symbaroumPerfAwaitFlush = true;
        window.symbaroumPerf?.clearHistory?.();
      });

      const target = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
        const currentList = window.storeHelper.getCurrentList(typeof store === 'object' && store ? store : window.storeHelper.load());
        const picker = window.choicePopup;
        const preferredNames = ['Monsterlärd', 'Exceptionellt karaktärsdrag', 'Blodsband'];
        const candidates = cards.map((card) => {
          const name = String(card?.dataset?.name || '').trim();
          const id = String(card?.dataset?.id || '').trim();
          const entry = window.lookupEntry?.({ id: id || undefined, name }) || null;
          if (!entry || window.isInv?.(entry) || window.isEmployment?.(entry) || window.isService?.(entry)) return null;
          const select = card.querySelector('select.level');
          const levels = select
            ? [...select.options].map((option) => String(option.value || '').trim()).filter(Boolean)
            : Object.keys(entry?.nivåer || {});
          const chosenLevel = levels.find((level) => {
            if (!picker || typeof picker.getChoiceRule !== 'function') return false;
            const candidate = level && entry?.nivå !== level ? { ...entry, nivå: level } : { ...entry };
            const context = {
              list: Array.isArray(currentList) ? currentList : [],
              entry: candidate,
              sourceEntry: candidate,
              level: level || candidate?.nivå || '',
              sourceLevel: level || candidate?.nivå || ''
            };
            try {
              return Boolean(picker.getChoiceRule(candidate, context, { fallbackLegacy: true }));
            } catch {
              return false;
            }
          }) || '';
          const button = card.querySelector('button[data-act="add"]');
          if (!chosenLevel || !button) return null;
          return { card, button, select, name, level: chosenLevel };
        }).filter(Boolean);

        const picked = preferredNames
          .map((name) => candidates.find((candidate) => candidate.name === name))
          .find(Boolean) || candidates[0] || null;
        if (!picked?.button) return null;
        if (picked.select) {
          picked.select.value = picked.level;
          window.entryCardFactory?.syncLevelControl?.(picked.select);
        }
        picked.button.click();
        return {
          name: picked.name,
          level: picked.level
        };
      });

      if (!target) {
        throw new Error('Unable to find a deterministic popup-based add target.');
      }

      await page.locator('#choicePopup').waitFor({ state: 'visible' });
      await page.waitForFunction(() => {
        const popup = document.getElementById('choicePopup');
        if (!popup) return false;
        const optionRoot = popup.querySelector('#choiceOpts') || popup;
        const buttons = [...optionRoot.querySelectorAll('button')]
          .some((candidate) => !candidate.disabled && String(candidate.textContent || '').trim());
        const radios = [...optionRoot.querySelectorAll('input[type="radio"]')]
          .some((candidate) => !candidate.disabled);
        return buttons || radios;
      }, null, { timeout: 10_000 });
      const popupClose = await page.evaluate(async () => {
        const popup = document.getElementById('choicePopup');
        if (!popup) throw new Error('Choice popup was not found.');
        const optionRoot = popup.querySelector('#choiceOpts') || popup;
        const button = [...optionRoot.querySelectorAll('button')]
          .find((candidate) => !candidate.disabled && String(candidate.textContent || '').trim());
        const radio = [...optionRoot.querySelectorAll('input[type="radio"]')]
          .find((candidate) => !candidate.disabled);
        const control = button || radio || null;
        if (!control) throw new Error('Choice popup had no selectable option.');
        const labelRoot = control.closest('label') || control;
        const label = String(labelRoot.textContent || control.value || '').trim();
        const isVisible = () => {
          if (!popup.isConnected) return false;
          const style = window.getComputedStyle(popup);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (popup.getAttribute('aria-hidden') === 'true') return false;
          if (popup.hidden) return false;
          return popup.classList.contains('open')
            || popup.getAttribute('aria-hidden') === 'false'
            || popup.getBoundingClientRect().height > 0;
        };
        const start = performance.now();
        control.click();
        if (radio) {
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const timeoutAt = performance.now() + 5000;
        await new Promise((resolve, reject) => {
          const tick = () => {
            if (!isVisible()) {
              resolve();
              return;
            }
            if (performance.now() > timeoutAt) {
              reject(new Error('Choice popup did not close after selection.'));
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });
        return {
          durationMs: Math.max(0, performance.now() - start),
          label
        };
      });

      const scenario = await waitForScenario(page, 'add-item-to-character');
      const profile = scenario?.detail?.profile || {};
      const stages = Array.isArray(profile?.stages) ? profile.stages.slice() : [];
      stages.push({
        name: 'popup-close',
        duration: Number(popupClose?.durationMs || 0),
        detail: {
          surface: 'index',
          entry: target.name,
          option: popupClose?.label || null
        }
      });
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target: {
            ...target,
            choice: popupClose?.label || null
          },
          profile: {
            ...profile,
            stages
          }
        }
      };
    })
  ));
  return aggregateScenarioRuns('index-popup-add', runs);
}

async function runIndexConflictReplacement(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/index',
      readySelector: '#lista',
      profile: 'interaction-heavy'
    }, async (page) => {
      await page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = window.lookupEntry?.({ name: 'Korruptionskänslig' });
        if (!entry) throw new Error('Missing conflict seed entry Korruptionskänslig.');
        window.storeHelper.setCurrentList(activeStore, [{
          ...JSON.parse(JSON.stringify(entry)),
          __uid: `perf-conflict-${Date.now()}`
        }]);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-index-conflict-replacement' });
        window.symbaroumViewBridge?.refreshCurrent({
          selection: true,
          inventory: true,
          filters: true,
          traits: true,
          summary: true,
          effects: true,
          strict: true
        });
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
      });
      await revealIndexPerfTarget(page, 'list', { entryName: 'Dvärg' });
      await page.evaluate(() => {
        window.__symbaroumPerfAwaitFlush = true;
        window.symbaroumPerf?.clearHistory?.();
      });
      const clicked = await page.evaluate(() => {
        const card = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
          .find(candidate => String(candidate?.dataset?.name || '').trim() === 'Dvärg');
        const button = card?.querySelector('button[data-act="add"]');
        if (!button) return false;
        button.click();
        return true;
      });
      if (!clicked) throw new Error('Unable to trigger Dvärg conflict replacement.');
      const dialog = page.locator('#daub-dialog-modal');
      await dialog.waitFor({ state: 'visible' });
      await page.evaluate(() => {
        const scenario = window.symbaroumPerf?.getSnapshot?.().active
          ?.find(candidate => candidate.name === 'add-item-to-character');
        if (scenario?.id) {
          window.symbaroumPerf?.markScenario?.(scenario.id, 'confirmation-start', {
            action: 'conflict-replacement',
            entry: 'Dvärg'
          });
        }
      });
      await dialog.locator('[data-dialog-action="ok"]').click();
      await dialog.waitFor({ state: 'hidden' });
      await page.evaluate(() => {
        const scenario = window.symbaroumPerf?.getSnapshot?.().active
          ?.find(candidate => candidate.name === 'add-item-to-character');
        if (scenario?.id) {
          window.symbaroumPerf?.markScenario?.(scenario.id, 'confirmation-feedback-presented', {
            action: 'conflict-replacement',
            entry: 'Dvärg'
          });
        }
      });
      const scenario = await waitForScenario(page, 'add-item-to-character');
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          entry: 'Dvärg',
          source: 'conflict-replacement'
        }
      };
    })
  ));
  return aggregateScenarioRuns('index-conflict-replacement', runs);
}

async function runIndexInventoryChoiceAdd(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/index',
      readySelector: '#lista',
      profile: 'interaction-heavy'
    }, async (page) => {
      const target = await revealIndexPerfTarget(page, 'inventory', {
        entryName: 'Formelsigill (Novis)'
      });
      await clearPerfHistory(page);
      await page.evaluate(({ id, name }) => {
        window.__symbaroumPerfAwaitFlush = true;
        const cards = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')];
        const card = cards.find(candidate => (
          (id && String(candidate?.dataset?.id || '') === String(id))
          || String(candidate?.dataset?.name || '').trim() === String(name || '').trim()
        ));
        const button = card?.querySelector('button[data-act="add"]');
        if (!button) throw new Error(`Unable to click choice-bound inventory add for ${name}.`);
        button.click();
      }, target);
      await page.locator('#choicePopup').waitFor({ state: 'visible', timeout: 30_000 });
      const picked = await page.evaluate(async () => {
        const popup = document.getElementById('choicePopup');
        const optionRoot = popup?.querySelector('#choiceOpts') || popup;
        const option = optionRoot
          ? [...optionRoot.querySelectorAll('input[type="radio"], button')]
            .find(control => !control.disabled && (
              control.matches('input[type="radio"]')
              || String(control.textContent || '').trim()
            ))
          : null;
        if (!option) throw new Error('Choice-bound inventory popup had no selectable option.');
        const labelRoot = option.closest('label') || option;
        const label = String(labelRoot.textContent || option.value || '').trim();
        const isVisible = () => {
          if (!popup?.isConnected || popup.hidden || popup.getAttribute('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle(popup);
          return style.display !== 'none' && style.visibility !== 'hidden' && popup.getBoundingClientRect().height > 0;
        };
        const startedAt = performance.now();
        option.click();
        if (option.matches('input[type="radio"]')) {
          option.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const timeoutAt = performance.now() + 5000;
        await new Promise((resolve, reject) => {
          const tick = () => {
            if (!isVisible()) return resolve();
            if (performance.now() > timeoutAt) return reject(new Error('Choice-bound inventory popup did not close.'));
            requestAnimationFrame(tick);
          };
          tick();
        });
        return { label, closeDurationMs: Math.max(0, performance.now() - startedAt) };
      });
      const scenario = await waitForScenario(page, 'add-item-to-character');
      const endState = await page.evaluate(async ({ targetName, picked }) => {
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'index-inventory-choice-add' });
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        return window.storeHelper.getInventory(activeStore)
          .filter(row => row?.name === targetName && row?.trait === picked)
          .map(row => ({ id: row.id || '', name: row.name || '', trait: row.trait || '', qty: Number(row.qty) || 0 }));
      }, { targetName: target.name, picked: picked.label });
      const profile = scenario?.detail?.profile || {};
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target: { ...target, choice: picked.label },
          endStateHash: JSON.stringify(endState),
          profile: {
            ...profile,
            stages: [
              ...(Array.isArray(profile.stages) ? profile.stages : []),
              {
                name: 'popup-close',
                duration: picked.closeDurationMs,
                detail: { surface: 'index', entry: target.name, option: picked.label }
              }
            ]
          }
        }
      };
    })
  ));
  return aggregateScenarioRuns('index-inventory-choice-add', runs);
}

async function prepareCharacterLevelChangeTarget(page, mode = 'fast') {
  return page.evaluate(async ({ mode }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const preferredName = mode === 'structural' ? 'Hamnskifte' : 'Akrobatik';
    const isStructuralEntry = (candidate) => {
      const grants = candidate?.taggar?.regler?.ger;
      return Array.isArray(grants) && grants.length > 0;
    };
    const hasMultiLevels = (candidate) => Object.keys(candidate?.nivåer || {}).length > 1;
    const isListEntry = (candidate) => (
      candidate
      && !window.isInv?.(candidate)
      && !window.isEmployment?.(candidate)
      && !window.isService?.(candidate)
    );
    const entry = window.lookupEntry?.({ name: preferredName })
      || entries.find((candidate) => (
        isListEntry(candidate)
        && hasMultiLevels(candidate)
        && (mode === 'structural' ? isStructuralEntry(candidate) : !isStructuralEntry(candidate))
        && !Array.isArray(candidate?.taggar?.regler?.val)
      ))
      || entries.find((candidate) => isListEntry(candidate) && hasMultiLevels(candidate))
      || null;
    if (!entry) {
      throw new Error(`Unable to prepare a ${mode} level-change candidate.`);
    }

    const levels = Object.keys(entry.nivåer || {}).filter(Boolean);
    const fromLevel = mode === 'structural'
      ? (levels.find((level) => level === 'Novis') || levels[0] || entry.nivå || '')
      : (levels[0] || entry.nivå || '');
    const toLevel = mode === 'structural'
      ? (levels.find((level) => level === 'Gesäll') || levels[1] || levels[0] || entry.nivå || '')
      : (levels[1] || levels[0] || entry.nivå || '');
    if (!fromLevel || !toLevel || fromLevel === toLevel) {
      throw new Error(`Entry ${entry.namn} does not expose a usable ${mode} level-change path.`);
    }

    const existingList = Array.isArray(window.storeHelper.getCurrentList(activeStore))
      ? window.storeHelper.getCurrentList(activeStore).filter(Boolean)
      : [];
    const nextList = existingList.filter((item) => String(item?.namn || '').trim() !== String(entry.namn || '').trim());
    nextList.push({
      ...JSON.parse(JSON.stringify(entry)),
      nivå: fromLevel,
      __uid: `perf-character-level-${mode}-${Date.now()}`
    });

    window.storeHelper.setCurrentList(activeStore, nextList);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-character-level-${mode}` });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      traits: true,
      summary: true,
      effects: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
    window.__symbaroumPerfCaptureLevelChanges = true;
    window.__symbaroumPerfAwaitFlush = true;
    window.symbaroumPerf?.clearHistory?.();
    return {
      mode,
      name: entry.namn,
      fromLevel,
      toLevel
    };
  }, { mode });
}

async function changeCardLevel(page, { rootSelector, name, value }) {
  const cards = page.locator(`${rootSelector} li.entry-card, ${rootSelector} li.card`);
  const index = await cards.evaluateAll((nodes, targetName) => (
    nodes.findIndex(node => String(node?.dataset?.name || '').trim() === String(targetName || '').trim())
  ), name);
  if (index < 0) {
    throw new Error(`Unable to change level for ${name} in ${rootSelector}.`);
  }
  await cards.nth(index).locator('select.level').selectOption(value);
}

async function runCharacterLevelChange(browser, iterations, mode) {
  const scenarioName = mode === 'structural'
    ? 'character-level-change-structural'
    : 'character-level-change-fast';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/character',
      readySelector: '#valda',
      profile: 'interaction-heavy'
    }, async (page) => {
      const runtime = getRuntimeConfig(process.env.PERF_RUNTIME || DEFAULT_RUNTIME);
      if (runtime.cpuThrottleRate > 1) await setChromiumCpuThrottle(page, 1);
      const target = await prepareCharacterLevelChangeTarget(page, mode);
      await settleAfterMutation(page);
      if (runtime.cpuThrottleRate > 1) await setChromiumCpuThrottle(page, runtime.cpuThrottleRate);
      await changeCardLevel(page, {
        rootSelector: '#valda',
        name: target.name,
        value: target.toLevel
      });
      const scenario = await waitForScenario(page, 'character-level-change');
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target
        }
      };
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runInventoryBuyMultiple(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/inventory',
      readySelector: '#invList',
      profile: 'interaction-heavy'
    }, async (page) => {
      await page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = window.lookupEntry?.({ name: 'Bandage' });
        const row = await window.invUtil?.buildInventoryRow?.({
          entry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
        row.qty = 1;
        const current = window.storeHelper.getInventory(activeStore)
          .filter(candidate => String(candidate?.name || '') !== 'Bandage');
        window.storeHelper.setInventory(activeStore, [row, ...current]);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-inventory-buy-multiple' });
        window.invUtil?.renderInventory?.();
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        window.symbaroumPerf?.clearHistory?.();
        const perf = window.symbaroumPerf;
        const scenarioId = perf?.startScenario?.('inventory-buy-multiple', { scope: 'inventory', entry: entry?.namn || null });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', { action: 'buy-multiple', quantity: 5 });
        }, { capture: true, once: true });
        window.__inventoryBuyMultipleScenarioId = scenarioId;
      });

      const card = page.locator('#invList li.entry-card[data-name="Bandage"]').first();
      await card.locator('button[data-act="buyMulti"]').click();
      await page.locator('#buyMultipleInput').fill('5');
      await page.evaluate(() => {
        window.symbaroumPerf?.markScenario?.(
          window.__inventoryBuyMultipleScenarioId,
          'confirmation-start',
          { action: 'buy-multiple', quantity: 5 }
        );
      });
      await page.locator('#buyMultipleConfirm').click();
      await page.waitForFunction(() => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        return Number(window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.name || '') === 'Bandage')?.qty || 0) === 6;
      });

      return page.evaluate(async () => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__inventoryBuyMultipleScenarioId;
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => (
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'inventory-buy-multiple' })
        ));
        await perf?.afterNextPaint?.(2);
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const row = window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.name || '') === 'Bandage');
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          entry: 'Bandage',
          quantity: Number(row?.qty || 0),
          endStateHash: JSON.stringify({ id: row?.id || '', name: row?.name || '', qty: Number(row?.qty || 0) })
        });
      });
    })
  ));
  return aggregateScenarioRuns('inventory-buy-multiple', runs);
}

async function runInventoryAddQuality(browser, iterations, options = {}) {
  const forceSafePath = options.forceSafePath === true;
  const scenarioName = forceSafePath ? 'inventory-add-quality-safe' : 'inventory-add-quality';
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 20) || 20);
  const aggregateMode = String(process.env.PERF_AGGREGATE_STATE || 'warm').trim().toLowerCase() === 'cold'
    ? 'cold'
    : 'warm';
  const activeFilters = /^(1|true|yes)$/i.test(String(process.env.PERF_ACTIVE_FILTERS || ''));
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => {
      const target = await page.evaluate(async ({
        size,
        forceSafePath: useSafePath,
        scenarioName: name,
        aggregateMode: cacheMode,
        activeFilters: useFilters
      }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = (window.DB || []).filter(candidate => {
          const types = candidate?.taggar?.typ || [];
          const hasSpecialRules = ['val', 'kraver', 'krockar', 'ger', 'andrar'].some(key => (
            (window.rulesHelper?.getRuleList?.(candidate, key) || []).length > 0
          ));
          return types.includes('Rustning') && window.isInv?.(candidate) && !hasSpecialRules;
        }).sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))[0];
        if (!entry) throw new Error('Unable to find a quality-bearing inventory representative.');
        const row = {
          id: entry.id,
          name: entry.namn,
          qty: 1,
          gratis: 0,
          kvaliteter: [],
          gratisKval: [],
          removedKval: []
        };
        const fillers = (window.DB || [])
          .filter(candidate => {
            const types = candidate?.taggar?.typ || [];
            return candidate?.id !== entry?.id
              && window.isInv?.(candidate)
              && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type))
              && !window.storeHelper?.isSearchHiddenEntry?.(candidate);
          })
          .slice(0, Math.max(0, size - 1))
          .map(candidate => ({
            id: candidate.id,
            name: candidate.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
        }));
        window.storeHelper.setInventory(activeStore, [row, ...fillers]);
        window.invUtil.filter.invTxt = useFilters ? entry.namn : '';
        window.invUtil?.renderInventory?.();
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        if (cacheMode === 'cold') {
          const cloned = window.storeHelper.getInventory(activeStore).map(candidate => ({ ...candidate }));
          window.storeHelper.setInventory(activeStore, cloned, { bumpDerived: false });
        }
        const economyDomains = new Set(['inventory.row', 'inventory.totals', 'summary.economy', 'persistence']);
        const qualityEntry = (window.DB || []).find((candidate) => {
          if (!window.isQual?.(candidate) || !window.canApplyQuality?.(entry, candidate)) return false;
          if (String(entry?.kvalitet || '').split(',').map(value => value.trim()).includes(candidate?.namn)) return false;
          const impact = window.invUtil?.classifyInventoryMutation?.(candidate, {
            id: candidate.id,
            name: candidate.namn,
            __uid: 'quality-signature-probe',
            qty: 1
          }, { requiresStableRowUid: true });
          return impact?.fastPath === true
            && (impact.affectedDomains || []).every(domain => economyDomains.has(domain));
        }) || null;
        if (!qualityEntry) throw new Error('Missing applicable quality representative.');
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-inventory-add-quality' });
        window.__symbaroumPerfForceSafeInventoryMutations = useSafePath;
        window.symbaroumPerf?.clearHistory?.();
        const perf = window.symbaroumPerf;
        const scenarioId = perf?.startScenario?.(name, {
          scope: 'inventory',
          entry: entry?.namn || null,
          quality: qualityEntry?.namn || null,
          behaviorSignature: 'quality-bearing-existing-row:economy-only',
          pathMode: useSafePath ? 'safe' : 'optimized',
          stateSize: 1 + fillers.length,
          aggregateState: cacheMode,
          activeFilters: useFilters
        });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        window.__inventoryQualityScenarioId = scenarioId;
        return {
          id: entry.id,
          name: entry.namn,
          rowUid: row.__uid,
          quality: qualityEntry.namn,
          stateSize: 1 + fillers.length
        };
      }, {
        size: requestedSize,
        forceSafePath,
        scenarioName,
        aggregateMode,
        activeFilters
      });

      const card = page.locator(`#invList li.entry-card[data-uid="${target.rowUid}"]`).first();
      const addQualityButton = card.locator('button[data-act="addQual"]');
      if (!await addQualityButton.isVisible()) {
        await card.locator('.card-title').click({ timeout: 10_000 });
      }
      await addQualityButton.click({ timeout: 10_000 });
      const search = page.locator('shared-toolbar #qualSearch');
      await search.waitFor({ state: 'visible', timeout: 10_000 });
      await search.fill(target.quality);
      const choice = page.locator('shared-toolbar #qualOptions .quality-option').first();
      await choice.click({ timeout: 10_000 });
      await page.evaluate(() => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__inventoryQualityScenarioId;
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', { action: 'quality-add-apply' });
        }, { capture: true, once: true });
      });
      await page.locator('shared-toolbar #qualApply').click({ timeout: 10_000 });
      await page.waitForFunction(({ id, quality }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const row = window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.id || '') === String(id));
        return Array.isArray(row?.kvaliteter) && row.kvaliteter.includes(quality);
      }, { id: target.id, quality: target.quality }, { timeout: 10_000 });
      await page.evaluate(() => {
        window.symbaroumPerf?.markScenario?.(
          window.__inventoryQualityScenarioId,
          'first-feedback-dom',
          { action: 'quality-add' }
        );
      });

      return page.evaluate(async ({ target, aggregateMode: cacheMode, activeFilters: useFilters }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__inventoryQualityScenarioId;
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => (
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'inventory-add-quality' })
        ));
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'first-feedback-presented', { action: 'quality-add' });
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const row = window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.id || '') === String(target.id));
        perf?.markScenario?.(scenarioId, 'final-consistency', { quality: target.quality });
        perf?.clearFlowContext?.('inventory-mutation', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          entry: target.name,
          quality: target.quality,
          behaviorSignature: 'quality-bearing-existing-row:economy-only',
          pathMode: window.__symbaroumPerfForceSafeInventoryMutations ? 'safe' : 'optimized',
          stateSize: target.stateSize,
          aggregateState: cacheMode,
          activeFilters: useFilters,
          endStateHash: JSON.stringify({
            id: row?.id || '',
            uid: row?.__uid || '',
            qualities: row?.kvaliteter || []
          })
        });
      }, { target, aggregateMode, activeFilters });
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runInventoryCustomItemCreate(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.('inventory-custom-item-create', { scope: 'inventory' });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          const customs = window.storeHelper.getCustomEntries(activeStore);
          window.storeHelper.setCustomEntries(activeStore, [
            ...customs,
            {
              namn: 'Perf föremål',
              beskrivning: 'Skapad av perf-harness.',
              taggar: { typ: ['Diverse', 'Hemmagjort'] },
              stat: { vikt: 1 },
              grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
            }
          ]);
        });
        await perf?.timeScenarioStage?.(scenarioId, 'view-refresh', () => {
          window.invUtil?.renderInventory?.();
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, { scope: 'inventory' });
      })
    ))
  ));
  return aggregateScenarioRuns('inventory-custom-item-create', runs);
}

async function runInventoryCustomItemEdit(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        window.storeHelper.setCustomEntries(activeStore, [{
          id: 'perf-custom-entry',
          namn: 'Perf föremål',
          beskrivning: 'Skapad av perf-harness.',
          taggar: { typ: ['Diverse', 'Hemmagjort'] },
          stat: { vikt: 1 },
          grundpris: { daler: 1, skilling: 0, 'örtegar': 0 }
        }]);
        window.invUtil?.renderInventory?.();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.('inventory-custom-item-edit', { scope: 'inventory' });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          window.storeHelper.setCustomEntries(activeStore, [{
            id: 'perf-custom-entry',
            namn: 'Perf föremål uppdaterad',
            beskrivning: 'Redigerad av perf-harness.',
            taggar: { typ: ['Diverse', 'Hemmagjort'] },
            stat: { vikt: 2 },
            grundpris: { daler: 2, skilling: 0, 'örtegar': 0 }
          }]);
        });
        await perf?.timeScenarioStage?.(scenarioId, 'view-refresh', () => {
          window.invUtil?.renderInventory?.();
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, { scope: 'inventory' });
      })
    ))
  ));
  return aggregateScenarioRuns('inventory-custom-item-edit', runs);
}

async function runVehicleScenario(browser, iterations, direction, options = {}) {
  const forceSafePath = options.forceSafePath === true;
  const nestedTransfer = options.nestedTransfer === true;
  const mode = nestedTransfer ? 'load' : direction;
  const baseScenarioName = nestedTransfer
    ? 'inventory-vehicle-nested-transfer'
    : mode === 'load' ? 'inventory-vehicle-load' : 'inventory-vehicle-unload';
  const scenarioName = forceSafePath ? `${baseScenarioName}-safe` : baseScenarioName;
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 20) || 20);
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => {
      const target = await page.evaluate(async ({ mode, size, scenarioName: name, nestedTransfer }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entries = Array.isArray(window.DB) ? window.DB : [];
        const vehicleEntries = entries
          .filter(candidate => (candidate?.taggar?.typ || []).includes('Färdmedel') && window.isInv?.(candidate))
          .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
        const vehicleEntry = vehicleEntries[0];
        const sourceVehicleEntry = nestedTransfer ? vehicleEntries[0] : null;
        const itemEntry = entries
          .filter(candidate => {
            const types = candidate?.taggar?.typ || [];
            return window.isInv?.(candidate)
              && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type));
          })
          .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')))[0];
        if (!vehicleEntry || !itemEntry || nestedTransfer && !sourceVehicleEntry) {
          throw new Error('Missing vehicle topology representative.');
        }
        const itemRow = {
          id: itemEntry.id,
          name: itemEntry.namn,
          qty: 1,
          gratis: 0,
          gratisKval: [],
          removedKval: []
        };
        const vehicleRow = {
          id: vehicleEntry.id,
          name: vehicleEntry.namn,
          qty: 1,
          gratis: 0,
          contains: mode === 'unload' ? [itemRow] : [],
          gratisKval: [],
          removedKval: []
        };
        const sourceVehicleRow = nestedTransfer ? {
          id: sourceVehicleEntry.id,
          name: sourceVehicleEntry.namn,
          qty: 1,
          gratis: 0,
          contains: [itemRow],
          gratisKval: [],
          removedKval: []
        } : null;
        const fillers = entries
          .filter(candidate => candidate.id !== vehicleEntry.id
            && candidate.id !== sourceVehicleEntry?.id
            && candidate.id !== itemEntry.id
            && window.isInv?.(candidate)
            && !(candidate?.taggar?.typ || []).some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type)))
          .slice(0, Math.max(0, size - 2))
          .map(candidate => ({
            id: candidate.id,
            name: candidate.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          }));
        vehicleRow.contains = mode === 'unload' ? [itemRow] : [];
        const inventory = nestedTransfer
          ? [sourceVehicleRow, vehicleRow, ...fillers]
          : mode === 'unload'
          ? [vehicleRow, ...fillers]
          : [vehicleRow, itemRow, ...fillers];
        window.storeHelper.setInventory(activeStore, inventory);
        window.invUtil?.renderInventory?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${name}` });
        const storedInventory = window.storeHelper.getInventory(activeStore);
        const storedSourceVehicle = nestedTransfer ? storedInventory[0] : null;
        const storedVehicle = nestedTransfer ? storedInventory[1] : storedInventory[0];
        const storedItem = nestedTransfer
          ? storedSourceVehicle?.contains?.[0]
          : mode === 'unload'
          ? storedVehicle?.contains?.[0]
          : storedInventory[1];
        return {
          vehicleUid: storedVehicle?.__uid || '',
          vehicleId: vehicleEntry.id,
          vehicle: vehicleEntry.namn,
          itemUid: storedItem?.__uid || '',
          itemId: itemEntry.id,
          item: itemEntry.namn,
          sourceVehicleUid: storedSourceVehicle?.__uid || '',
          sourceVehicleId: sourceVehicleEntry?.id || '',
          stateSize: inventory.length
        };
      }, { mode, size: requestedSize, scenarioName, nestedTransfer });

      if (nestedTransfer) {
        const nestedStart = await page.evaluate(() => performance.now());
        const sourceCard = page.locator(`#invList li.entry-card[data-uid="${target.sourceVehicleUid}"]`).first();
        const unloadButton = sourceCard.locator('button[data-act="vehicleUnload"]');
        if (!await unloadButton.isVisible()) await sourceCard.locator('.card-title').click();
        await unloadButton.click();
        const unloadList = page.locator('shared-toolbar #vehicleRemoveItemList');
        await unloadList.waitFor({ state: 'visible' });
        await unloadList.locator(`.price-item[data-row-uid="${target.itemUid}"]`).first().click();
        await page.locator('shared-toolbar #vehicleRemoveApply').click();
        await page.waitForFunction(({ itemId, sourceVehicleUid }) => {
          const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
          const inventory = window.storeHelper.getInventory(activeStore);
          const sourceVehicle = inventory.find(row => String(row?.__uid || '') === String(sourceVehicleUid));
          return inventory.some(row => String(row?.id || '') === String(itemId))
            && !(sourceVehicle?.contains || []).some(row => String(row?.id || '') === String(itemId));
        }, { itemId: target.itemId, sourceVehicleUid: target.sourceVehicleUid });
        const closeUnload = page.locator('shared-toolbar #vehicleRemoveCancel');
        if (await closeUnload.isVisible()) await closeUnload.click();
        target.nestedUnloadPreparationMs = await page.evaluate(start => performance.now() - start, nestedStart);
      }

      const vehicleCard = page.locator(`#invList li.entry-card[data-uid="${target.vehicleUid}"]`).first();
      const action = mode === 'load' ? 'vehicleLoad' : 'vehicleUnload';
      const button = vehicleCard.locator(`button[data-act="${action}"]`);
      const listSelector = mode === 'load' ? '#vehicleItemList' : '#vehicleRemoveItemList';
      const applySelector = mode === 'load' ? '#vehicleApply' : '#vehicleRemoveApply';
      if (!await button.isVisible()) await vehicleCard.locator('.card-title').click();
      await vehicleCard.scrollIntoViewIfNeeded();
      await button.scrollIntoViewIfNeeded();
      const controlActivationStart = await page.evaluate(() => performance.now());
      await button.click();
      await page.locator(`shared-toolbar ${listSelector}`).waitFor({ state: 'visible' });
      target.controlActivationMs = await page.evaluate(start => performance.now() - start, controlActivationStart);
      const option = page.locator(
        `shared-toolbar ${listSelector} .price-item[data-row-uid="${target.itemUid}"]`
      ).first();
      await option.click();
      await page.evaluate(({ mode, target, name, useSafePath }) => {
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(name, {
          scope: 'inventory',
          vehicle: target.vehicle,
          item: target.item,
          behaviorSignature: 'vehicle-topology-move',
          stateSize: target.stateSize,
          direction: mode,
          controlActivationMs: target.controlActivationMs,
          pathMode: useSafePath ? 'safe' : 'optimized'
        });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        window.__symbaroumPerfForceSafeInventoryMutations = useSafePath;
        window.__vehicleScenarioId = scenarioId;
        const list = document.getElementById('invList');
        const deepActiveElement = () => {
          let active = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          return active;
        };
        const elementKey = element => {
          if (!(element instanceof window.Element)) return '';
          return [
            element.tagName.toLowerCase(),
            element.id ? `#${element.id}` : '',
            element.getAttribute('data-act') ? `[data-act="${element.getAttribute('data-act')}"]` : '',
            element.getAttribute('data-uid') ? `[data-uid="${element.getAttribute('data-uid')}"]` : '',
            element.getAttribute('aria-label') ? `[aria-label="${element.getAttribute('aria-label')}"]` : ''
          ].filter(Boolean).join('');
        };
        const collectNodes = (node, output) => {
          if (!node || !output) return;
          output.add(node);
          node.querySelectorAll?.('*').forEach(child => output.add(child));
        };
        const expandedCategories = () => [...(list?.querySelectorAll('.cat-group > details[open]') || [])]
          .map(details => details.dataset.cat || '')
          .filter(Boolean)
          .sort();
        const expandedParents = () => [...(list?.querySelectorAll('li.entry-card[data-uid]:not(.compact)') || [])]
          .map(card => card.dataset.uid || '')
          .filter(Boolean)
          .sort();
        const initialUidNodes = new Map();
        list?.querySelectorAll('li.entry-card[data-uid]').forEach(card => {
          if (card.dataset.uid && !initialUidNodes.has(card.dataset.uid)) {
            initialUidNodes.set(card.dataset.uid, card);
          }
        });
        const addedNodes = new Set();
        const removedNodes = new Set();
        const initialDirectChildren = list?.childElementCount || 0;
        const probe = {
          addedNodes,
          removedNodes,
          initialUidNodes,
          initialScrollX: window.scrollX,
          initialScrollY: window.scrollY,
          initialListScrollTop: list?.scrollTop || 0,
          initialFocus: elementKey(deepActiveElement()),
          initialExpandedCategories: expandedCategories(),
          initialExpandedParents: expandedParents(),
          initialDescendants: list?.querySelectorAll('*').length || 0,
          initialVisibleCards: list?.querySelectorAll('li.entry-card').length || 0,
          initialDirectChildren,
          rootCleared: false,
          animationCalls: 0,
          inventoryAnimationCalls: 0,
          layoutShift: 0,
          mode,
          target
        };
        const processMutationRecords = records => {
          records.forEach(record => {
            if (record.type !== 'childList') return;
            record.addedNodes.forEach(node => collectNodes(node, addedNodes));
            record.removedNodes.forEach(node => collectNodes(node, removedNodes));
            if (record.target === list
                && record.addedNodes.length === 0
                && record.removedNodes.length >= initialDirectChildren
                && initialDirectChildren > 0) {
              probe.rootCleared = true;
            }
          });
        };
        probe.observer = list ? new MutationObserver(processMutationRecords) : null;
        probe.observer?.observe(list, { childList: true, subtree: true });
        probe.processMutationRecords = processMutationRecords;
        if (typeof window.PerformanceObserver === 'function'
            && window.PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
          probe.layoutObserver = new window.PerformanceObserver(entries => {
            entries.getEntries().forEach(entry => {
              if (!entry.hadRecentInput) probe.layoutShift += Number(entry.value) || 0;
            });
          });
          probe.layoutObserver.observe({ type: 'layout-shift', buffered: false });
        }
        const animateOwner = typeof window.Element !== 'undefined' ? window.Element.prototype : null;
        const originalAnimate = animateOwner?.animate;
        if (animateOwner && typeof originalAnimate === 'function') {
          animateOwner.animate = function (...args) {
            probe.animationCalls += 1;
            if (list?.contains(this)) probe.inventoryAnimationCalls += 1;
            return originalAnimate.apply(this, args);
          };
          probe.restoreAnimate = () => { animateOwner.animate = originalAnimate; };
        }
        probe.presentationStage = perf?.startScenarioStage?.(
          scenarioId,
          'input-layout-paint-presentation',
          { surface: 'inventory', direction: mode }
        ) || null;
        window.__vehicleDomProbe = probe;
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', { action: `vehicle-${mode}` });
        }, { capture: true, once: true });
      }, { mode, target, name: scenarioName, useSafePath: forceSafePath });

      let cdpSession = null;
      let browserMetricsBefore = null;
      if (getRuntimeConfig(process.env.PERF_RUNTIME || DEFAULT_RUNTIME).browserType === chromium) {
        cdpSession = await page.context().newCDPSession(page);
        await cdpSession.send('Performance.enable');
        browserMetricsBefore = await cdpSession.send('Performance.getMetrics');
      }
      await page.locator(`shared-toolbar ${applySelector}`).click();
      await page.waitForFunction(({ vehicleUid, sourceVehicleUid, itemId, mode, nestedTransfer }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const inventory = window.storeHelper.getInventory(activeStore);
        const vehicle = inventory.find(row => String(row?.__uid || '') === String(vehicleUid));
        const inside = (vehicle?.contains || []).some(row => String(row?.id || '') === String(itemId));
        const sourceVehicle = nestedTransfer
          ? inventory.find(row => String(row?.__uid || '') === String(sourceVehicleUid))
          : null;
        const stillInSource = (sourceVehicle?.contains || [])
          .some(row => String(row?.id || '') === String(itemId));
        return mode === 'load' ? inside && !stillInSource : !inside;
      }, {
        vehicleUid: target.vehicleUid,
        sourceVehicleUid: target.sourceVehicleUid,
        itemId: target.itemId,
        mode,
        nestedTransfer
      });

      const result = await page.evaluate(async ({ target, scenarioName: name, mode }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__vehicleScenarioId;
        perf?.markScenario?.(scenarioId, 'correct-dom-observed', { action: `vehicle-${mode}` });
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: name });
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'first-painted-correct-state', { action: `vehicle-${mode}` });
        const probe = window.__vehicleDomProbe;
        const list = document.getElementById('invList');
        const deepActiveElement = () => {
          let active = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          return active;
        };
        const elementKey = element => {
          if (!(element instanceof window.Element)) return '';
          return [
            element.tagName.toLowerCase(),
            element.id ? `#${element.id}` : '',
            element.getAttribute('data-act') ? `[data-act="${element.getAttribute('data-act')}"]` : '',
            element.getAttribute('data-uid') ? `[data-uid="${element.getAttribute('data-uid')}"]` : '',
            element.getAttribute('aria-label') ? `[aria-label="${element.getAttribute('aria-label')}"]` : ''
          ].filter(Boolean).join('');
        };
        const expandedCategories = () => [...(list?.querySelectorAll('.cat-group > details[open]') || [])]
          .map(details => details.dataset.cat || '')
          .filter(Boolean)
          .sort();
        const expandedParents = () => [...(list?.querySelectorAll('li.entry-card[data-uid]:not(.compact)') || [])]
          .map(card => card.dataset.uid || '')
          .filter(Boolean)
          .sort();
        const pendingRecords = probe?.observer?.takeRecords?.() || [];
        probe?.processMutationRecords?.(pendingRecords);
        probe?.observer?.disconnect?.();
        probe?.layoutObserver?.disconnect?.();
        probe?.restoreAnimate?.();
        perf?.finishScenarioStage?.(probe?.presentationStage, { surface: 'inventory', direction: mode });
        const addedNodes = probe?.addedNodes || new Set();
        const removedNodes = probe?.removedNodes || new Set();
        const movedNodes = [...addedNodes].filter(node => removedNodes.has(node));
        const createdNodes = Math.max(0, addedNodes.size - movedNodes.length);
        const deletedNodes = Math.max(0, removedNodes.size - movedNodes.length);
        const currentUidNodes = new Map();
        list?.querySelectorAll('li.entry-card[data-uid]').forEach(card => {
          const uid = card.dataset.uid || '';
          if (!uid) return;
          if (!currentUidNodes.has(uid)) currentUidNodes.set(uid, []);
          currentUidNodes.get(uid).push(card);
        });
        let preservedCardNodes = 0;
        probe?.initialUidNodes?.forEach((node, uid) => {
          if ((currentUidNodes.get(uid) || []).includes(node)) preservedCardNodes += 1;
        });
        const itemCards = [...(list?.querySelectorAll(`li.entry-card[data-uid="${window.CSS.escape(target.itemUid || '')}"]`) || [])];
        const vehicleCards = [...(list?.querySelectorAll(`li.entry-card[data-uid="${window.CSS.escape(target.vehicleUid || '')}"]`) || [])];
        const itemCard = itemCards[0] || null;
        const itemNested = Boolean(itemCard?.closest('.vehicle-items'));
        const itemParentUid = itemCard?.parentElement?.closest('li.entry-card[data-uid]')?.dataset?.uid || '';
        const duplicateUids = [...currentUidNodes.entries()]
          .filter(([, cards]) => cards.length !== 1)
          .map(([uid, cards]) => ({ uid, count: cards.length }));
        const afterExpandedCategories = expandedCategories();
        const afterExpandedParents = expandedParents();
        const uiStability = {
          controlActivationMs: Number(target.controlActivationMs || 0),
          nestedUnloadPreparationMs: Number(target.nestedUnloadPreparationMs || 0),
          scrollBefore: {
            x: Number(probe?.initialScrollX || 0),
            y: Number(probe?.initialScrollY || 0),
            listTop: Number(probe?.initialListScrollTop || 0)
          },
          scrollAfter: { x: window.scrollX, y: window.scrollY, listTop: list?.scrollTop || 0 },
          focusBefore: probe?.initialFocus || '',
          focusAfter: elementKey(deepActiveElement()),
          expandedCategoriesBefore: probe?.initialExpandedCategories || [],
          expandedCategoriesAfter: afterExpandedCategories,
          expandedParentsBefore: probe?.initialExpandedParents || [],
          expandedParentsAfter: afterExpandedParents,
          cardNodesBefore: probe?.initialUidNodes?.size || 0,
          cardNodesPreserved: preservedCardNodes,
          cardsReconstructed: Math.max(0, (probe?.initialUidNodes?.size || 0) - preservedCardNodes),
          rootDescendantsBefore: Number(probe?.initialDescendants || 0),
          rootDescendantsAfter: list?.querySelectorAll('*').length || 0,
          rootBrieflyEmpty: Boolean(probe?.rootCleared),
          domNodesCreated: createdNodes,
          domNodesMoved: movedNodes.length,
          domNodesRemoved: deletedNodes,
          domNodesReplaced: Math.min(createdNodes, deletedNodes),
          visibleCardsBefore: Number(probe?.initialVisibleCards || 0),
          visibleCardsAfter: list?.querySelectorAll('li.entry-card').length || 0,
          targetCardCount: itemCards.length,
          vehicleCardCount: vehicleCards.length,
          itemParentUid,
          rowUnderCorrectParent: mode === 'load'
            ? itemNested && itemParentUid === target.vehicleUid
            : !itemNested,
          duplicateUids,
          intermediateIncorrectLocation: false,
          animationCalls: Number(probe?.inventoryAnimationCalls || 0),
          totalAnimationCalls: Number(probe?.animationCalls || 0),
          layoutShift: Number(probe?.layoutShift || 0)
        };
        perf?.incrementScenarioCounter?.(scenarioId, 'domObserverNodesCreated', createdNodes);
        perf?.incrementScenarioCounter?.(scenarioId, 'domObserverNodesMoved', movedNodes.length);
        perf?.incrementScenarioCounter?.(scenarioId, 'domObserverNodesRemoved', deletedNodes);
        perf?.incrementScenarioCounter?.(scenarioId, 'domObserverNodesReplaced', Math.min(createdNodes, deletedNodes));
        perf?.incrementScenarioCounter?.(scenarioId, 'cardsReconstructed', uiStability.cardsReconstructed);
        perf?.incrementScenarioCounter?.(scenarioId, 'cardNodesPreserved', preservedCardNodes);
        perf?.incrementScenarioCounter?.(scenarioId, 'animationCalls', uiStability.animationCalls);
        perf?.incrementScenarioCounter?.(scenarioId, 'totalAnimationCalls', uiStability.totalAnimationCalls);
        if (uiStability.rootBrieflyEmpty) perf?.incrementScenarioCounter?.(scenarioId, 'inventoryRootEmptyTransitions');
        if (duplicateUids.length) perf?.incrementScenarioCounter?.(scenarioId, 'duplicateCardStates');
        perf?.markScenario?.(scenarioId, 'ui-stability-captured', uiStability);
        perf?.markScenario?.(scenarioId, 'first-feedback-presented', { action: `vehicle-${mode}` });
        perf?.markScenario?.(scenarioId, 'final-consistency', { action: `vehicle-${mode}` });
        perf?.clearFlowContext?.('inventory-mutation', scenarioId);
        delete window.__vehicleDomProbe;
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          vehicle: target.vehicle,
          item: target.item,
          behaviorSignature: 'vehicle-topology-move',
          stateSize: target.stateSize,
          direction: mode,
          controlActivationMs: target.controlActivationMs,
          pathMode: window.__symbaroumPerfForceSafeInventoryMutations ? 'safe' : 'optimized',
          uiStability
        });
      }, { target, scenarioName, mode });
      if (cdpSession && browserMetricsBefore) {
        const browserMetricsAfter = await cdpSession.send('Performance.getMetrics');
        const before = new Map(browserMetricsBefore.metrics.map(metric => [metric.name, Number(metric.value) || 0]));
        const after = new Map(browserMetricsAfter.metrics.map(metric => [metric.name, Number(metric.value) || 0]));
        const delta = name => (after.get(name) || 0) - (before.get(name) || 0);
        result.detail.browserWork = {
          layoutDurationMs: delta('LayoutDuration') * 1000,
          recalcStyleDurationMs: delta('RecalcStyleDuration') * 1000,
          scriptDurationMs: delta('ScriptDuration') * 1000,
          taskDurationMs: delta('TaskDuration') * 1000,
          layoutCount: delta('LayoutCount'),
          recalcStyleCount: delta('RecalcStyleCount')
        };
        await cdpSession.detach();
      }
      const beforeReload = await readCanonicalInventory(page);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      const afterReload = await readCanonicalInventory(page);
      result.detail.uiStability = {
        ...(result.detail.uiStability || {}),
        affectedRows: [target.itemUid, target.vehicleUid].filter(Boolean),
        affectedParents: ['root', target.sourceVehicleUid, target.vehicleUid].filter(Boolean),
        persistenceReloadParity: beforeReload === afterReload
      };
      return result;
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runNotesEdit(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/notes', readySelector: '#characterForm' }, async (page) => (
      page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.('notes-edit', { scope: 'notes' });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          const notes = window.storeHelper.getNotes(activeStore);
          window.storeHelper.setNotes(activeStore, {
            ...notes,
            background: `Perf notes ${Date.now()}`
          });
        });
        await perf?.timeScenarioStage?.(scenarioId, 'view-refresh', async () => {
          if (typeof window.symbaroumMutationPipeline?.scheduleCharacterRefresh === 'function') {
            window.symbaroumMutationPipeline.scheduleCharacterRefresh({
              notes: true,
              name: true,
              source: 'perf-notes-edit',
              xp: false,
              afterPaint: false
            });
            await window.symbaroumMutationPipeline.waitForCharacterRefresh();
          }
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, { scope: 'notes' });
      })
    ))
  ));
  return aggregateScenarioRuns('notes-edit', runs);
}

async function runMoneyEdit(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.('money-edit', { scope: 'inventory' });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          const money = window.storeHelper.getMoney(activeStore);
          window.storeHelper.setMoney(activeStore, {
            ...money,
            daler: (Number(money.daler) || 0) + 1
          });
        });
        await perf?.timeScenarioStage?.(scenarioId, 'view-refresh', () => {
          window.invUtil?.renderInventory?.();
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, { scope: 'inventory' });
      })
    ))
  ));
  return aggregateScenarioRuns('money-edit', runs);
}

async function runHeavyCurrentCharacterSave(browser, iterations) {
  const heavyAlpha = makeHeavyCharacter('Alpha');
  const heavyBeta = makeHeavyCharacter('Beta');
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/notes',
      readySelector: '#characterForm'
    }, async (page) => (
      page.evaluate(async ({ charA, charB, charIdA, charIdB }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        activeStore.data = activeStore.data && typeof activeStore.data === 'object' ? activeStore.data : {};
        activeStore.data[charIdA] = JSON.parse(JSON.stringify(charA));
        activeStore.data[charIdB] = JSON.parse(JSON.stringify(charB));
        if (window.symbaroumPersistence?.mode === 'dexie') {
          await window.symbaroumPersistence.saveCharacter(charIdA, activeStore.data[charIdA]);
          await window.symbaroumPersistence.saveCharacter(charIdB, activeStore.data[charIdB]);
          await window.symbaroumPersistence.flushPendingWrites?.();
        }
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.('heavy-current-character-save', {
          scope: 'character',
          profile: 'heavy'
        });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          const notes = window.storeHelper.getNotes(activeStore);
          window.storeHelper.setNotes(activeStore, {
            ...notes,
            background: `Heavy save ${Date.now()}`
          });
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, {
          scope: 'character',
          profile: 'heavy'
        });
      }, {
        charA: heavyAlpha,
        charB: heavyBeta,
        charIdA: TEST_CHAR_ID,
        charIdB: TEST_CHAR_ID_2
      })
    ))
  ));
  return aggregateScenarioRuns('heavy-current-character-save', runs);
}

async function runCharacterRemoveSingle(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      const target = await prepareCharacterListEntry(page, { entryName: 'Akrobatik', count: 1 });
      await settleAfterMutation(page);
      await enableRemoveProfiling(page);
      await clickCardAction(page, { rootSelector: '#valda', name: target.name, act: 'rem' });
      const scenario = await waitForRemoveScenario(page);
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target
        }
      };
    })
  ));
  return aggregateScenarioRuns('character-list-remove-single', runs);
}

async function runCharacterRemoveMulti(browser, iterations, action) {
  const scenarioName = action === 'sub' ? 'character-list-remove-decrement' : 'character-list-remove-all';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => (
      page.evaluate(async ({ action, scenarioName }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = window.lookupEntry?.({ name: 'Akrobatik' })
          || (window.DB || []).find((candidate) => String(candidate?.namn || '').trim() === 'Akrobatik')
          || null;
        if (!entry) throw new Error('Missing Akrobatik for character multi remove scenario.');
        const levels = Object.keys(entry.nivåer || {});
        const list = [0, 1].map((index) => ({
          ...JSON.parse(JSON.stringify(entry)),
          nivå: levels[0] || entry.nivå || 'Novis',
          __uid: `perf-char-multi-${index}`
        }));
        window.storeHelper.setCurrentList(activeStore, list);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName });
        window.symbaroumViewBridge?.refreshCurrent({ selection: true, strict: true });
        if (typeof window.updateXP === 'function') window.updateXP();
        if (typeof window.renderTraits === 'function') window.renderTraits();
        window.symbaroumPerf?.clearHistory?.();
        const perf = window.symbaroumPerf;
        const scenarioId = perf?.startScenario?.(scenarioName, {
          scope: 'character',
          entry: entry.namn,
          branch: 'list'
        });
        perf?.setFlowContext?.('remove-item', scenarioId);
        const next = action === 'sub' ? list.slice(1) : [];
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          window.storeHelper.setCurrentList(activeStore, next);
        }, {
          surface: 'character',
          branch: 'list'
        });
        await perf?.timeScenarioStage?.(scenarioId, 'selection-render', () => {
          window.symbaroumViewBridge?.refreshCurrent({ selection: true, strict: true });
        }, {
          surface: 'character',
          branch: 'list'
        });
        await perf?.timeScenarioStage?.(scenarioId, 'derived-refresh', () => {
          if (typeof window.updateXP === 'function') window.updateXP();
          if (typeof window.renderTraits === 'function') window.renderTraits();
        }, {
          surface: 'character',
          branch: 'list'
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => (
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName })
        ));
        await perf?.afterNextPaint?.(2);
        perf?.clearFlowContext?.('remove-item', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'character',
          entry: entry.namn,
          branch: 'list'
        });
      }, { action, scenarioName })
    ))
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runCharacterArtifactRemove(browser, iterations) {
  const scenarioName = 'character-artifact-cascade-remove';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      const target = await prepareCharacterGrantCascadeRemove(page);
      await settleAfterMutation(page);
      await enableRemoveProfiling(page, { overrideDialogs: false });
      await clickCardAction(page, {
        rootSelector: '#valda',
        name: target.name,
        act: ['rem', 'del', 'sub']
      });
      const dialog = page.locator('#daub-dialog-modal');
      await dialog.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      const scenario = await waitForRemoveScenario(page);
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target
        }
      };
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runCharacterClearNonInv(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      await page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const listEntries = ['Akrobatik', 'Sjätte sinne']
          .map((name, index) => {
            const entry = window.lookupEntry?.({ name });
            if (!entry) return null;
            const levels = Object.keys(entry.nivåer || {});
            return {
              ...JSON.parse(JSON.stringify(entry)),
              nivå: levels[0] || entry.nivå || 'Novis',
              __uid: `perf-clear-${index}`
            };
          })
          .filter(Boolean);
        const invEntry = window.lookupEntry?.({ name: 'Dubbel ringbrynja' }) || null;
        const invRow = invEntry
          ? await window.invUtil?.buildInventoryRow?.({
              entry: invEntry,
              list: window.storeHelper.getCurrentList(activeStore)
            })
          : null;
        window.storeHelper.setCurrentList(activeStore, listEntries);
        if (invRow) window.storeHelper.setInventory(activeStore, [invRow]);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'prepare-clear-non-inv' });
        window.symbaroumViewBridge?.refreshCurrent({
          selection: true,
          inventory: true,
          filters: true,
          strict: true
        });
        window.invUtil?.renderInventory?.();
      });
      await settleAfterMutation(page);
      await enableRemoveProfiling(page);
      await page.locator('#clearNonInv').click();
      const scenario = await waitForRemoveScenario(page);
      return scenario;
    })
  ));
  return aggregateScenarioRuns('character-clear-non-inventory', runs);
}

async function runIndexListRemove(browser, iterations, options = {}) {
  const scenarioName = options.onlySelected ? 'index-list-remove-full-rerender' : 'index-list-remove';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/index', readySelector: '#lista' }, async (page) => {
      const target = await prepareIndexListEntry(page, {
        entryName: 'Akrobatik',
        count: 1,
        onlySelected: Boolean(options.onlySelected)
      });
      await settleAfterMutation(page);
      await revealIndexPerfTarget(page, 'list', {
        entryName: target.name,
        actionSelector: 'button[data-act="rem"], button[data-act="sub"], button[data-act="del"]'
      });
      await enableRemoveProfiling(page);
      await clickCardAction(page, { rootSelector: '#lista', name: target.name, act: 'rem' });
      const scenario = await waitForRemoveScenario(page);
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target
        }
      };
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runIndexInventoryRemove(browser, iterations, options = {}) {
  const scenarioName = options.useArtifactCandidate ? 'index-hidden-artifact-remove' : 'index-inventory-remove';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/index', readySelector: '#lista' }, async (page) => {
      const target = await prepareIndexInventoryEntry(page, {
        entryName: 'Dubbel ringbrynja',
        qty: options.useArtifactCandidate ? 1 : 2,
        useArtifactCandidate: Boolean(options.useArtifactCandidate)
      });
      await settleAfterMutation(page);
      await revealIndexPerfTarget(page, 'inventory', {
        entryName: target.name,
        actionSelector: 'button[data-act="rem"], button[data-act="sub"], button[data-act="del"]'
      });
      await enableRemoveProfiling(page);
      await clickCardAction(page, {
        rootSelector: '#lista',
        name: target.name,
        act: options.useArtifactCandidate ? ['rem', 'del', 'sub'] : 'sub'
      });
      const scenario = await waitForRemoveScenario(page);
      return {
        ...scenario,
        detail: {
          ...(scenario?.detail || {}),
          target
        }
      };
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runIndexBundleAdd(browser, iterations, options = {}) {
  const forceSafePath = options.forceSafePath === true;
  const scenarioName = forceSafePath
    ? 'index-inventory-bundle-add-safe'
    : 'index-inventory-bundle-add';
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 20) || 20);
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/index', readySelector: '#lista' }, async (page) => {
      const target = await page.evaluate(async ({ size, scenarioName: name }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entries = Array.isArray(window.DB) ? window.DB : [];
        const bundleSummary = entries.find(entry => String(entry?.id || '') === 'di79');
        const bundleEntry = await window.catalogLoader?.ensureEntryData?.(bundleSummary);
        if (!bundleEntry) throw new Error('Missing inventory bundle production-control representative.');
        const inventory = entries
          .filter(entry => {
            const types = entry?.taggar?.typ || [];
            return entry.id !== bundleEntry.id
              && window.isInv?.(entry)
              && !(window.invUtil?.getInventoryBundleItems?.(entry)?.length || 0)
              && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type));
          })
          .slice(0, Math.max(0, size - 6))
          .map(entry => ({
            id: entry.id,
            name: entry.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          }));
        window.storeHelper.setInventory(activeStore, inventory);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${name}` });
        return {
          id: bundleEntry.id,
          name: bundleEntry.namn,
          affectedRows: window.invUtil.getInventoryBundleItems(bundleEntry).length,
          stateSize: inventory.length
        };
      }, { size: requestedSize, scenarioName });

      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      await page.locator('#lista').waitFor({ state: 'attached' });
      await revealIndexPerfTarget(page, 'inventory', {
        entryName: target.name,
        actionSelector: 'button[data-act="add"]'
      });
      await settleAfterMutation(page);
      await page.evaluate(useSafePath => {
        window.__symbaroumPerfAwaitFlush = true;
        window.__symbaroumPerfForceSafeInventoryMutations = useSafePath;
        window.symbaroumPerf?.clearHistory?.();
      }, forceSafePath);
      const browserCapture = await startBrowserWorkCapture(page);
      await clickCardAction(page, { rootSelector: '#lista', name: target.name, act: 'add' });
      const scenario = await waitForScenario(page, 'add-item-to-character');
      const browserWork = await finishBrowserWorkCapture(browserCapture);
      await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'bundle-add-parity' }));
      const beforeReload = await readCanonicalInventory(page);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      const afterReload = await readCanonicalInventory(page);
      scenario.detail = {
        ...(scenario.detail || {}),
        behaviorSignature: 'bundle-insertion',
        pathMode: forceSafePath ? 'safe' : 'optimized',
        stateSize: target.stateSize,
        browserWork,
        uiStability: {
          inventorySurfaceMounted: false,
          affectedRows: target.affectedRows,
          affectedParents: ['root'],
          persistenceReloadParity: beforeReload === afterReload
        }
      };
      return scenario;
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runIndexBundleRemove(browser, iterations, options = {}) {
  const forceSafePath = options.forceSafePath === true;
  const scenarioName = forceSafePath
    ? 'index-inventory-bundle-remove-safe'
    : 'index-inventory-bundle-remove';
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 20) || 20);
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/index', readySelector: '#lista' }, async (page) => {
      const target = await page.evaluate(async ({ size, scenarioName: name }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entries = Array.isArray(window.DB) ? window.DB : [];
        const bundleSummary = entries.find(entry => String(entry?.id || '') === 'di79');
        const bundleEntry = await window.catalogLoader?.ensureEntryData?.(bundleSummary);
        if (!bundleEntry) throw new Error('Missing inventory bundle production-control representative.');
        const inventory = entries
          .filter(entry => {
            const types = entry?.taggar?.typ || [];
            return entry.id !== bundleEntry.id
              && window.isInv?.(entry)
              && !(window.invUtil?.getInventoryBundleItems?.(entry)?.length || 0)
              && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type));
          })
          .slice(0, Math.max(0, size - 8))
          .map(entry => ({
            id: entry.id,
            name: entry.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          }));
        const refs = window.invUtil?.addInventoryBundle?.(inventory, bundleEntry) || [];
        if (!refs.length) throw new Error(`Unable to expand bundle ${bundleEntry.namn}.`);
        window.storeHelper.setInventory(activeStore, inventory);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${name}` });
        return {
          id: bundleEntry.id,
          name: bundleEntry.namn,
          refs,
          stateSize: inventory.length
        };
      }, { size: requestedSize, scenarioName });

      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      await page.locator('#lista').waitFor({ state: 'attached' });
      await revealIndexPerfTarget(page, 'inventory', {
        entryName: target.name,
        actionSelector: 'button[data-act="sub"], button[data-act="rem"], button[data-act="del"]'
      });
      await settleAfterMutation(page);
      await enableRemoveProfiling(page);
      await page.evaluate(useSafePath => {
        window.__symbaroumPerfForceSafeInventoryMutations = useSafePath;
      }, forceSafePath);
      const browserCapture = await startBrowserWorkCapture(page);
      await clickCardAction(page, { rootSelector: '#lista', name: target.name, act: ['sub', 'del', 'rem'] });
      const scenario = await waitForRemoveScenario(page);
      const browserWork = await finishBrowserWorkCapture(browserCapture);
      await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'bundle-remove-parity' }));
      const beforeReload = await readCanonicalInventory(page);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      const afterReload = await readCanonicalInventory(page);
      scenario.detail = {
        ...(scenario.detail || {}),
        behaviorSignature: 'bundle-removal',
        pathMode: forceSafePath ? 'safe' : 'optimized',
        stateSize: target.stateSize,
        browserWork,
        uiStability: {
          inventorySurfaceMounted: false,
          affectedRows: target.refs.length,
          affectedParents: ['root'],
          persistenceReloadParity: beforeReload === afterReload
        }
      };
      return scenario;
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runContainerUnwrap(browser, iterations, options = {}) {
  const forceSafePath = options.forceSafePath === true;
  const scenarioName = forceSafePath
    ? 'inventory-container-unwrap-safe'
    : 'inventory-container-unwrap';
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 20) || 20);
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => {
      const target = await page.evaluate(async ({ size, scenarioName: name }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entries = Array.isArray(window.DB) ? window.DB : [];
        const vehicleEntry = entries.find(entry => (
          window.isInv?.(entry) && (entry?.taggar?.typ || []).includes('Färdmedel')
        ));
        const itemEntry = entries.find(entry => {
          const types = entry?.taggar?.typ || [];
          return window.isInv?.(entry)
            && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type));
        });
        if (!vehicleEntry || !itemEntry) throw new Error('Missing container unwrap representative.');
        const child = {
          id: itemEntry.id,
          name: itemEntry.namn,
          qty: 1,
          gratis: 0,
          gratisKval: [],
          removedKval: []
        };
        const vehicle = {
          id: vehicleEntry.id,
          name: vehicleEntry.namn,
          qty: 1,
          gratis: 0,
          contains: [child],
          gratisKval: [],
          removedKval: []
        };
        const fillers = entries
          .filter(entry => entry.id !== vehicleEntry.id && entry.id !== itemEntry.id
            && window.isInv?.(entry)
            && !(entry?.taggar?.typ || []).some(type => (
              ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type)
            )))
          .slice(0, Math.max(0, size - 1))
          .map(entry => ({
            id: entry.id,
            name: entry.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          }));
        const inventory = [vehicle, ...fillers];
        window.storeHelper.setInventory(activeStore, inventory);
        window.invUtil?.renderInventory?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${name}` });
        return {
          vehicleUid: vehicle.__uid,
          vehicleId: vehicleEntry.id,
          itemUid: child.__uid,
          itemId: itemEntry.id,
          stateSize: inventory.length
        };
      }, { size: requestedSize, scenarioName });

      const vehicleCard = page.locator(`#invList li.entry-card[data-uid="${target.vehicleUid}"]`).first();
      const deleteButton = vehicleCard.locator(`button[data-act="del"][data-id="${target.vehicleId}"]`).first();
      if (!await deleteButton.isVisible()) await vehicleCard.locator('.card-title').click();
      const activationStart = await page.evaluate(() => performance.now());
      await deleteButton.click();
      const confirm = page.locator('shared-toolbar #deleteContainerOnly');
      await confirm.waitFor({ state: 'visible' });
      const controlActivationMs = await page.evaluate(start => performance.now() - start, activationStart);

      await installInventoryDomProbe(page);
      await page.evaluate(({ name, target, controlActivationMs, forceSafePath }) => {
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(name, {
          scope: 'inventory',
          behaviorSignature: 'container-unwrap',
          stateSize: target.stateSize,
          pathMode: forceSafePath ? 'safe' : 'optimized',
          controlActivationMs
        });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        window.__symbaroumPerfForceSafeInventoryMutations = forceSafePath;
        window.__containerScenarioId = scenarioId;
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', { action: 'container-unwrap' });
        }, { capture: true, once: true });
      }, { name: scenarioName, target, controlActivationMs, forceSafePath });
      const browserCapture = await startBrowserWorkCapture(page);
      await confirm.click();
      await page.waitForFunction(({ vehicleId, itemId }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const inventory = window.storeHelper.getInventory(activeStore);
        return !inventory.some(row => String(row?.id || '') === String(vehicleId))
          && inventory.some(row => String(row?.id || '') === String(itemId));
      }, { vehicleId: target.vehicleId, itemId: target.itemId });
      const scenario = await page.evaluate(async ({ target, controlActivationMs, forceSafePath }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__containerScenarioId;
        perf?.markScenario?.(scenarioId, 'first-feedback-dom', { action: 'container-unwrap' });
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'container-unwrap' });
        perf?.markScenario?.(scenarioId, 'all-views-consistent', { action: 'container-unwrap' });
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'first-feedback-presented', { action: 'container-unwrap' });
        perf?.markScenario?.(scenarioId, 'final-consistency', { action: 'container-unwrap' });
        perf?.clearFlowContext?.('inventory-mutation', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          behaviorSignature: 'container-unwrap',
          stateSize: target.stateSize,
          pathMode: forceSafePath ? 'safe' : 'optimized',
          controlActivationMs
        });
      }, { target, controlActivationMs, forceSafePath });
      const uiStability = await readInventoryDomProbe(page);
      const browserWork = await finishBrowserWorkCapture(browserCapture);
      const beforeReload = await readCanonicalInventory(page);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      const afterReload = await readCanonicalInventory(page);
      scenario.detail = {
        ...(scenario.detail || {}),
        browserWork,
        uiStability: {
          ...(uiStability || {}),
          controlActivationMs,
          affectedRows: [target.vehicleUid, target.itemUid],
          affectedParents: ['root', target.vehicleUid],
          persistenceReloadParity: beforeReload === afterReload
        }
      };
      return scenario;
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runFilteredRowRemoval(browser, iterations, options = {}) {
  const forceSafePath = options.forceSafePath === true;
  const scenarioName = forceSafePath
    ? 'inventory-filtered-row-remove-safe'
    : 'inventory-filtered-row-remove';
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 20) || 20);
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async page => {
      const target = await page.evaluate(async ({ size, name }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entries = Array.isArray(window.DB) ? window.DB : [];
        const entry = window.lookupEntry?.({ name: 'Bandage' });
        if (!entry) throw new Error('Missing filtered row-removal representative.');
        const targetRow = {
          id: entry.id,
          name: entry.namn,
          qty: 1,
          gratis: 0,
          gratisKval: [],
          removedKval: []
        };
        const fillers = entries
          .filter(candidate => {
            const types = candidate?.taggar?.typ || [];
            return candidate.id !== entry.id
              && window.isInv?.(candidate)
              && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type));
          })
          .slice(0, Math.max(0, size - 1))
          .map(candidate => ({
            id: candidate.id,
            name: candidate.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          }));
        window.storeHelper.setInventory(activeStore, [targetRow, ...fillers]);
        const stored = window.storeHelper.getInventory(activeStore);
        const row = stored[0];
        window.invUtil.filter.invTxt = entry.namn;
        window.invUtil.renderInventory({ trigger: 'filtered-removal-setup' });
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${name}` });
        const renamed = { ...row, name: 'Helt annat föremål' };
        return {
          id: entry.id,
          name: entry.namn,
          rowUid: row.__uid,
          stateSize: stored.length,
          classifier: {
            leave: window.invUtil.classifyInventoryFilterMutation({
              previousRow: row, row: renamed, previousEntry: entry, entry,
              previousIndex: 0, nextIndex: 0
            }),
            enter: window.invUtil.classifyInventoryFilterMutation({
              previousRow: renamed, row, previousEntry: entry, entry,
              previousIndex: 0, nextIndex: 0
            }),
            reorder: window.invUtil.classifyInventoryFilterMutation({
              previousRow: row, row: { ...row }, previousEntry: entry, entry,
              previousIndex: 0, nextIndex: 1
            })
          }
        };
      }, { size: requestedSize, name: scenarioName });

      await installInventoryDomProbe(page);
      await page.evaluate(({ name, target, forceSafePath }) => {
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(name, {
          scope: 'inventory',
          entry: target.name,
          behaviorSignature: 'filtered-membership-remove',
          stateSize: target.stateSize,
          activeFilters: true,
          pathMode: forceSafePath ? 'safe' : 'optimized'
        });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        window.__filteredRemovalScenarioId = scenarioId;
        window.__symbaroumPerfForceSafeInventoryMutations = forceSafePath;
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', { action: 'filtered-row-remove' });
        }, { capture: true, once: true });
      }, { name: scenarioName, target, forceSafePath });

      const browserCapture = await startBrowserWorkCapture(page);
      const card = page.locator(`#invList li.entry-card[data-uid="${target.rowUid}"]`).first();
      await card.locator('button[data-act="del"]').first().click();
      await page.waitForFunction(rowUid => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        return !window.storeHelper.getInventory(activeStore)
          .some(row => String(row?.__uid || '') === String(rowUid));
      }, target.rowUid);
      const scenario = await page.evaluate(async ({ target, forceSafePath }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__filteredRemovalScenarioId;
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        perf?.markScenario?.(scenarioId, 'all-views-consistent', { action: 'filtered-row-remove' });
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'filtered-row-remove' });
        perf?.markScenario?.(scenarioId, 'persistence-flush-complete', { action: 'filtered-row-remove' });
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'first-feedback-presented', { action: 'filtered-row-remove' });
        perf?.markScenario?.(scenarioId, 'final-consistency', { action: 'filtered-row-remove' });
        perf?.clearFlowContext?.('inventory-mutation', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          entry: target.name,
          behaviorSignature: 'filtered-membership-remove',
          stateSize: target.stateSize,
          activeFilters: true,
          pathMode: forceSafePath ? 'safe' : 'optimized'
        });
      }, { target, forceSafePath });
      const uiStability = await readInventoryDomProbe(page);
      const browserWork = await finishBrowserWorkCapture(browserCapture);
      const beforeReload = await readCanonicalInventory(page);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
      const afterReload = await readCanonicalInventory(page);
      scenario.detail = {
        ...(scenario.detail || {}),
        classifier: target.classifier,
        browserWork,
        uiStability: {
          ...(uiStability || {}),
          affectedRows: [target.rowUid],
          affectedParents: ['root'],
          membership: 'leave',
          finalOrderProvable: true,
          persistenceReloadParity: beforeReload === afterReload
        }
      };
      return scenario;
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runInventoryRemove(browser, iterations, kind) {
  const scenarioNames = {
    'row-delete': 'inventory-row-delete',
    'stack-decrement': 'inventory-stack-decrement',
    'tag-remove': 'inventory-tag-remove',
    'container-delete-all': 'inventory-container-delete-all',
    'container-delete-only': 'inventory-container-delete-only',
    'vehicle-unload': 'inventory-vehicle-unload-remove',
    'vehicle-money-remove': 'inventory-vehicle-money-remove',
    'clear-inventory': 'inventory-clear'
  };
  const scenarioName = scenarioNames[kind];
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async ({ kind, scenarioName }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const perf = window.symbaroumPerf;
        const ringArmor = window.lookupEntry?.({ name: 'Dubbel ringbrynja' });
        const bandage = window.lookupEntry?.({ name: 'Bandage' }) || window.lookupEntry?.({ name: 'Dryckesbälte' });
        const vehicleEntry = window.lookupEntry?.({ name: 'Kärra' }) || window.lookupEntry?.({ name: 'Mulåsna' });
        const buildRow = async (entry) => {
          const row = await window.invUtil?.buildInventoryRow?.({
            entry,
            list: window.storeHelper.getCurrentList(activeStore)
          });
          if (!row) throw new Error(`Unable to build inventory row for ${entry?.namn || 'unknown entry'}.`);
          return row;
        };
        let inventory = [];
        if (kind === 'row-delete' || kind === 'stack-decrement' || kind === 'tag-remove' || kind === 'clear-inventory') {
          const row = await buildRow(ringArmor);
          row.qty = kind === 'stack-decrement' ? 3 : 1;
          if (kind === 'tag-remove') {
            row.kvaliteter = ['Massivt'];
            row.gratisKval = ['Massivt'];
          }
          inventory = kind === 'clear-inventory'
            ? [row, { ...(await buildRow(bandage)), qty: 2 }]
            : [row];
        } else if (kind === 'container-delete-all' || kind === 'container-delete-only' || kind === 'vehicle-unload' || kind === 'vehicle-money-remove') {
          const vehicle = await buildRow(vehicleEntry);
          if (kind === 'vehicle-money-remove') {
            vehicle.contains = [{
              name: 'Pengar',
              typ: 'currency',
              money: { daler: 3, skilling: 0, 'örtegar': 0 },
              qty: 1
            }];
          } else {
            const item = await buildRow(bandage);
            item.qty = 2;
            vehicle.contains = [item];
          }
          inventory = [vehicle];
        }

        window.storeHelper.setInventory(activeStore, inventory);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${scenarioName}` });
        window.invUtil?.renderInventory?.();
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(scenarioName, { scope: 'inventory', kind });
        perf?.setFlowContext?.('remove-item', scenarioId);

        const runMutation = async () => {
          if (kind === 'row-delete') {
            inventory.splice(0, 1);
            window.invUtil?.saveInventory?.(inventory, { source: 'perf-row-delete', afterPaint: false });
          } else if (kind === 'stack-decrement') {
            inventory[0].qty = 2;
            window.invUtil?.saveInventory?.(inventory, { source: 'perf-stack-decrement', afterPaint: false });
          } else if (kind === 'tag-remove') {
            inventory[0].gratisKval = [];
            inventory[0].kvaliteter = [];
            window.invUtil?.saveInventory?.(inventory, { source: 'perf-tag-remove', afterPaint: false });
          } else if (kind === 'container-delete-all') {
            inventory.splice(0, 1);
            window.invUtil?.saveInventory?.(inventory, { source: 'perf-container-delete-all', afterPaint: false });
          } else if (kind === 'container-delete-only') {
            const [vehicle] = inventory.splice(0, 1);
            inventory.push(...(vehicle.contains || []));
            window.invUtil?.saveInventory?.(inventory, { source: 'perf-container-delete-only', afterPaint: false });
          } else if (kind === 'vehicle-unload') {
            const vehicle = inventory[0];
            const item = (vehicle.contains || []).shift();
            if (item) inventory.push(item);
            window.invUtil?.saveInventory?.(inventory, { source: 'perf-vehicle-unload-remove', afterPaint: false });
          } else if (kind === 'vehicle-money-remove') {
            const vehicle = inventory[0];
            window.invUtil?.removeMoneyFromVehicle?.(vehicle, [0, 0], {
              daler: 1,
              skilling: 0,
              'örtegar': 0
            });
          } else if (kind === 'clear-inventory') {
            window.invUtil?.saveInventory?.([], { source: 'perf-clear-inventory', afterPaint: false });
          }
        };

        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', runMutation, {
          surface: 'inventory'
        });
        if (kind !== 'vehicle-money-remove') {
          await perf?.timeScenarioStage?.(scenarioId, 'inventory-render', () => {
            window.invUtil?.renderInventory?.();
          }, {
            surface: 'inventory'
          });
        }
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => (
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName })
        ));
        await perf?.afterNextPaint?.(2);
        perf?.clearFlowContext?.('remove-item', scenarioId);
        return perf?.endScenario?.(scenarioId, { scope: 'inventory', kind });
      }, { kind, scenarioName })
    ))
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runInventoryQuantity(browser, iterations, direction) {
  const isAdd = direction === 'add';
  const scenarioName = isAdd ? 'inventory-quantity-add' : 'inventory-quantity-subtract';
  const initialQuantity = isAdd ? 1 : 2;
  const expectedQuantity = isAdd ? 2 : 1;
  const action = isAdd ? 'add' : 'sub';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/inventory',
      readySelector: '#invList',
      profile: 'interaction-heavy'
    }, async (page) => {
      await page.evaluate(async ({ initialQuantity, scenarioName }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = window.lookupEntry?.({ name: 'Bandage' });
        const row = await window.invUtil?.buildInventoryRow?.({
          entry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
        if (!row) throw new Error('Unable to build Bandage inventory row.');
        row.qty = initialQuantity;
        const current = window.storeHelper.getInventory(activeStore)
          .filter((candidate) => String(candidate?.name || '') !== 'Bandage');
        window.storeHelper.setInventory(activeStore, [row, ...current]);
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${scenarioName}` });
        window.invUtil?.renderInventory?.();
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(scenarioName, {
          scope: 'inventory',
          entry: 'Bandage',
          direction: initialQuantity === 1 ? 'add' : 'subtract'
        });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', {
            action: initialQuantity === 1 ? 'quantity-add' : 'quantity-subtract'
          });
        }, { capture: true, once: true });
        window.__inventoryQuantityScenarioId = scenarioId;
      }, { initialQuantity, scenarioName });

      const card = page.locator('#invList li.entry-card[data-name="Bandage"]').first();
      await card.locator(`button[data-act="${action}"]`).click();
      await page.waitForFunction((quantity) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const row = window.storeHelper.getInventory(activeStore)
          .find((candidate) => String(candidate?.name || '') === 'Bandage');
        return Number(row?.qty || 0) === quantity;
      }, expectedQuantity);

      return page.evaluate(async ({ expectedQuantity, scenarioName }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__inventoryQuantityScenarioId;
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName });
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'post-render-two-raf', { quantity: expectedQuantity });
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const row = window.storeHelper.getInventory(activeStore)
          .find((candidate) => String(candidate?.name || '') === 'Bandage');
        const endStateHash = JSON.stringify({
          quantity: Number(row?.qty || 0),
          version: window.storeHelper.getDerivedVersion?.(activeStore)
        });
        perf?.clearFlowContext?.('inventory-mutation', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          entry: 'Bandage',
          endStateHash
        });
      }, { expectedQuantity, scenarioName });
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runMetadataInventoryQuantity(browser, iterations, direction, options = {}) {
  const isAdd = direction === 'add';
  const isRemove = direction === 'remove';
  const forceSafePath = options.forceSafePath === true;
  const baseScenarioName = isRemove
    ? 'inventory-metadata-final-copy-remove'
    : (isAdd ? 'inventory-metadata-quantity-add' : 'inventory-metadata-quantity-subtract');
  const scenarioName = forceSafePath ? `${baseScenarioName}-safe` : baseScenarioName;
  const initialQuantity = isAdd || isRemove ? 1 : 2;
  const expectedQuantity = isRemove ? 0 : (isAdd ? 2 : 1);
  const action = isRemove ? 'del' : (isAdd ? 'add' : 'sub');
  const requestedSize = Math.max(10, Number(process.env.PERF_STATE_SIZE || 100) || 100);
  const aggregateMode = String(process.env.PERF_AGGREGATE_STATE || 'warm').trim().toLowerCase() === 'cold'
    ? 'cold'
    : 'warm';
  const activeFilters = /^(1|true|yes)$/i.test(String(process.env.PERF_ACTIVE_FILTERS || ''));
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/inventory',
      readySelector: '#invList'
    }, async (page) => {
      const target = await page.evaluate(async ({
        initialQuantity: quantity,
        requestedSize: size,
        aggregateMode: cacheMode,
        activeFilters: useFilters,
        isRemove: removeMode,
        forceSafePath: useSafePath,
        scenarioName: name
      }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entries = Array.isArray(window.DB) ? window.DB : [];
        const candidates = entries.filter(entry => {
          const types = entry?.taggar?.typ || [];
          const inventoryMeta = entry?.taggar?.inventory || {};
          const choiceRules = window.rulesHelper?.getRuleList?.(entry, 'val') || [];
          return window.isInv?.(entry)
            && inventoryMeta.stackbar === true
            && ['kraft', 'ritual'].includes(String(entry?.bound || '').trim())
            && choiceRules.some(rule => String(rule?.field || '').trim() === 'trait')
            && !types.includes('Artefakt');
        }).sort((left, right) => {
          const leftRuleCount = ['val', 'kraver', 'andrar'].reduce((sum, key) => (
            sum + (window.rulesHelper?.getRuleList?.(left, key) || []).length
          ), 0);
          const rightRuleCount = ['val', 'kraver', 'andrar'].reduce((sum, key) => (
            sum + (window.rulesHelper?.getRuleList?.(right, key) || []).length
          ), 0);
          return rightRuleCount - leftRuleCount
            || String(left?.id || '').localeCompare(String(right?.id || ''));
        });
        const entry = candidates[0] || null;
        if (!entry) throw new Error('Missing stackable metadata-bearing choice representative.');
        const traitEntry = entries.find(candidate => (
          (candidate?.taggar?.typ || []).includes('Mystisk kraft')
        ));
        const targetRow = {
          id: entry.id,
          name: entry.namn,
          qty: quantity,
          trait: traitEntry?.namn || 'Metadatarepresentant',
          gratis: 0,
          gratisKval: [],
          removedKval: []
        };
        const fillers = entries
          .filter(candidate => {
            const types = candidate?.taggar?.typ || [];
            return candidate?.id !== entry.id
              && window.isInv?.(candidate)
              && !types.some(type => ['Artefakt', 'Lägre Artefakt', 'Färdmedel', 'Förvaring'].includes(type))
              && !window.storeHelper?.isSearchHiddenEntry?.(candidate);
          })
          .slice(0, Math.max(0, size - 1))
          .map(candidate => ({
            id: candidate.id,
            name: candidate.namn,
            qty: 1,
            gratis: 0,
            gratisKval: [],
            removedKval: []
          }));
        window.storeHelper.setInventory(activeStore, [targetRow, ...fillers], { bumpDerived: false });
        window.invUtil.filter.invTxt = useFilters ? entry.namn : '';
        window.invUtil.renderInventory({ trigger: 'metadata-quantity-setup' });
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        if (cacheMode === 'cold') {
          const cloned = window.storeHelper.getInventory(activeStore).map(row => ({ ...row }));
          window.storeHelper.setInventory(activeStore, cloned, { bumpDerived: false });
        }
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${name}` });
        const row = window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.id || '') === String(entry.id));
        window.__symbaroumPerfForceSafeInventoryMutations = useSafePath;
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(name, {
          scope: 'inventory',
          entry: entry.namn,
          behaviorSignature: 'stackable-choice-metadata-quantity',
          stateSize: 1 + fillers.length,
          aggregateState: cacheMode,
          activeFilters: useFilters,
          pathMode: useSafePath ? 'safe' : 'optimized',
          direction: removeMode ? 'remove' : (quantity === 1 ? 'add' : 'subtract')
        });
        perf?.setFlowContext?.('inventory-mutation', scenarioId);
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', {
            action: removeMode ? 'complete-stack-removal' : (quantity === 1 ? 'quantity-add' : 'quantity-subtract')
          });
        }, { capture: true, once: true });
        window.__metadataQuantityScenarioId = scenarioId;
        return {
          id: entry.id,
          name: entry.namn,
          rowUid: row?.__uid || '',
          stateSize: 1 + fillers.length
        };
      }, {
        initialQuantity,
        requestedSize,
        aggregateMode,
        activeFilters,
        isRemove,
        forceSafePath,
        scenarioName
      });

      const card = page.locator(`#invList li.entry-card[data-uid="${target.rowUid}"]`).first();
      await card.locator(`button[data-act="${action}"]`).click();
      await page.waitForFunction(({ id, quantity }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        return Number(window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.id || '') === String(id))?.qty || 0) === quantity;
      }, { id: target.id, quantity: expectedQuantity });

      return page.evaluate(async ({ expectedQuantity: quantity, scenarioName: name, target }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__metadataQuantityScenarioId;
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: name });
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'final-consistency', { quantity });
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const row = window.storeHelper.getInventory(activeStore)
          .find(candidate => String(candidate?.id || '') === String(target.id));
        perf?.clearFlowContext?.('inventory-mutation', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          entry: target.name,
          behaviorSignature: 'stackable-choice-metadata-quantity',
          pathMode: window.__symbaroumPerfForceSafeInventoryMutations ? 'safe' : 'optimized',
          stateSize: target.stateSize,
          endStateHash: JSON.stringify({
            id: row?.id || '',
            uid: row?.__uid || '',
            trait: row?.trait || '',
            quantity: Number(row?.qty || 0)
          })
        });
      }, { expectedQuantity, scenarioName, target });
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

async function runTraitMutation(browser, iterations, delta) {
  const scenarioNames = {
    1: 'trait-plus-one',
    5: 'trait-plus-five',
    '-1': 'trait-minus-one',
    '-5': 'trait-minus-five'
  };
  const initialValues = { 1: 9, 5: 5, '-1': 10, '-5': 10 };
  const scenarioName = scenarioNames[delta];
  const initialValue = initialValues[delta];
  const expectedValue = initialValue + delta;
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, {
      pathName: '/#/traits',
      readySelector: '#traits',
      profile: 'interaction-heavy'
    }, async (page) => {
      await page.evaluate(async ({ delta, initialValue, scenarioName }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const traits = window.storeHelper.getTraits(activeStore);
        window.storeHelper.setTraits(activeStore, { ...traits, Diskret: initialValue });
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `prepare-${scenarioName}` });
        await window.renderTraits?.();
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(scenarioName, {
          scope: 'traits',
          entry: 'Diskret',
          delta
        });
        perf?.setFlowContext?.('trait-mutation', scenarioId);
        document.addEventListener('pointerdown', () => {
          perf?.markScenario?.(scenarioId, 'interaction-start', { key: 'Diskret', delta });
        }, { capture: true, once: true });
        window.__traitMutationScenarioId = scenarioId;
      }, { delta, initialValue, scenarioName });

      const trait = page.locator('.trait[data-key="Diskret"]');
      await trait.locator(`button[data-d="${delta}"]`).click();
      await page.waitForFunction((value) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        return Number(window.storeHelper.getTraits(activeStore)?.Diskret || 0) === value;
      }, expectedValue);

      return page.evaluate(async ({ delta, expectedValue, scenarioName }) => {
        const perf = window.symbaroumPerf;
        const scenarioId = window.__traitMutationScenarioId;
        await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
        await window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName });
        await perf?.afterNextPaint?.(2);
        perf?.markScenario?.(scenarioId, 'post-render-two-raf', { value: expectedValue });
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const endStateHash = JSON.stringify({
          value: Number(window.storeHelper.getTraits(activeStore)?.Diskret || 0),
          version: window.storeHelper.getDerivedVersion?.(activeStore)
        });
        perf?.clearFlowContext?.('trait-mutation', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'traits',
          entry: 'Diskret',
          delta,
          endStateHash
        });
      }, { delta, expectedValue, scenarioName });
    })
  ));
  return aggregateScenarioRuns(scenarioName, runs);
}

export async function runScenarioMetrics({ runDir = null, iterations = DEFAULT_ITERATIONS, runtimeName = null } = {}) {
  const resolvedRunDir = runDir || await createRunDir('scenarios');
  const reportDir = path.join(resolvedRunDir, 'scenarios');
  const server = await startPreviewServer({ port: PREVIEW_PORT });
  const runtime = getRuntimeConfig(runtimeName || process.env.PERF_RUNTIME || DEFAULT_RUNTIME);
  process.env.PERF_RUNTIME = runtime.name;
  const browser = await runtime.browserType.launch({ headless: true });
  const scenarioFilter = String(process.env.SCENARIO_FILTER || '').trim().toLowerCase();
  const normalizeScenarioToken = (value) => String(value || '').trim().toLowerCase();
  const splitScenarioTokens = (value) => normalizeScenarioToken(value).split(/[\s-]+/).filter(Boolean);
  const includeScenario = (name, aliases = []) => {
    if (!scenarioFilter) return true;
    const candidates = [name, ...aliases]
      .map(normalizeScenarioToken)
      .filter(Boolean);
    if (!candidates.length) return false;
    if (candidates.includes(scenarioFilter)) return true;
    const filterTokens = splitScenarioTokens(scenarioFilter);
    if (filterTokens.length !== 1) return false;
    return candidates.some((candidate) => splitScenarioTokens(candidate).includes(filterTokens[0]));
  };

  try {
    const scenarioDefinitions = [
      { key: 'firstLoad', name: 'first-load', run: () => runFirstLoad(browser, iterations) },
      { key: 'routeChange', name: 'route-change', run: () => runRouteChange(browser, iterations) },
      { key: 'openInventory', name: 'open-inventory', run: () => runOpenInventory(browser, iterations) },
      { key: 'switchCharacter', name: 'switch-character', run: () => runSwitchCharacter(browser, iterations) },
      { key: 'switchCharacterLargeSpecialized', name: 'switch-character-large-specialized', aliases: ['switch large'], run: () => runSwitchCharacter(browser, iterations, { profile: 'interaction-heavy' }) },
      { key: 'addIndexList', name: 'index-list-add', aliases: ['add'], run: () => runIndexAdd(browser, iterations, 'list') },
      { key: 'addIndexPopup', name: 'index-popup-add', aliases: ['add', 'popup add'], run: () => runIndexPopupAdd(browser, iterations) },
      { key: 'addIndexInventoryChoice', name: 'index-inventory-choice-add', aliases: ['add', 'popup add', 'inventory choice'], run: () => runIndexInventoryChoiceAdd(browser, iterations) },
      { key: 'addIndexInventory', name: 'index-inventory-add', aliases: ['add'], run: () => runIndexAdd(browser, iterations, 'inventory') },
      { key: 'indexConflictReplacement', name: 'index-conflict-replacement', aliases: ['add', 'conflict replacement'], run: () => runIndexConflictReplacement(browser, iterations) },
      { key: 'searchFilter', name: 'search-filter', run: () => runSearchFilter(browser, iterations) },
      { key: 'inventoryBuyMultiple', name: 'inventory-buy-multiple', aliases: ['inventory add'], run: () => runInventoryBuyMultiple(browser, iterations) },
      { key: 'inventoryAddQuality', name: 'inventory-add-quality', aliases: ['inventory add'], run: () => runInventoryAddQuality(browser, iterations) },
      { key: 'inventoryAddQualitySafe', name: 'inventory-add-quality-safe', aliases: ['inventory quality safe'], run: () => runInventoryAddQuality(browser, iterations, { forceSafePath: true }) },
      { key: 'inventoryCustomItemCreate', name: 'inventory-custom-item-create', aliases: ['inventory add'], run: () => runInventoryCustomItemCreate(browser, iterations) },
      { key: 'inventoryCustomItemEdit', name: 'inventory-custom-item-edit', run: () => runInventoryCustomItemEdit(browser, iterations) },
      { key: 'inventoryVehicleLoad', name: 'inventory-vehicle-load', aliases: ['inventory add', 'vehicle topology'], run: () => runVehicleScenario(browser, iterations, 'load') },
      { key: 'inventoryVehicleLoadSafe', name: 'inventory-vehicle-load-safe', aliases: ['vehicle load safe', 'vehicle topology'], run: () => runVehicleScenario(browser, iterations, 'load', { forceSafePath: true }) },
      { key: 'inventoryVehicleUnload', name: 'inventory-vehicle-unload', aliases: ['inventory remove', 'vehicle topology'], run: () => runVehicleScenario(browser, iterations, 'unload') },
      { key: 'inventoryVehicleUnloadSafe', name: 'inventory-vehicle-unload-safe', aliases: ['vehicle unload safe', 'vehicle topology'], run: () => runVehicleScenario(browser, iterations, 'unload', { forceSafePath: true }) },
      { key: 'inventoryVehicleNestedTransfer', name: 'inventory-vehicle-nested-transfer', aliases: ['nested topology'], run: () => runVehicleScenario(browser, iterations, 'load', { nestedTransfer: true }) },
      { key: 'inventoryContainerUnwrap', name: 'inventory-container-unwrap', aliases: ['container topology'], run: () => runContainerUnwrap(browser, iterations) },
      { key: 'inventoryContainerUnwrapSafe', name: 'inventory-container-unwrap-safe', aliases: ['container topology safe'], run: () => runContainerUnwrap(browser, iterations, { forceSafePath: true }) },
      { key: 'inventoryFilteredRowRemove', name: 'inventory-filtered-row-remove', aliases: ['filtered membership'], run: () => runFilteredRowRemoval(browser, iterations) },
      { key: 'inventoryFilteredRowRemoveSafe', name: 'inventory-filtered-row-remove-safe', aliases: ['filtered membership safe'], run: () => runFilteredRowRemoval(browser, iterations, { forceSafePath: true }) },
      { key: 'notesEdit', name: 'notes-edit', run: () => runNotesEdit(browser, iterations) },
      { key: 'moneyEdit', name: 'money-edit', run: () => runMoneyEdit(browser, iterations) },
      { key: 'heavyCharacterSave', name: 'heavy-current-character-save', run: () => runHeavyCurrentCharacterSave(browser, iterations) },
      { key: 'characterLevelChangeFast', name: 'character-level-change-fast', aliases: ['character level change'], run: () => runCharacterLevelChange(browser, iterations, 'fast') },
      { key: 'characterLevelChangeStructural', name: 'character-level-change-structural', aliases: ['character level change'], run: () => runCharacterLevelChange(browser, iterations, 'structural') },
      { key: 'characterListRemoveSingle', name: 'character-list-remove-single', aliases: ['remove', 'character remove'], run: () => runCharacterRemoveSingle(browser, iterations) },
      { key: 'characterListRemoveDecrement', name: 'character-list-remove-decrement', aliases: ['remove', 'character remove'], run: () => runCharacterRemoveMulti(browser, iterations, 'sub') },
      { key: 'characterListRemoveAll', name: 'character-list-remove-all', aliases: ['remove', 'character remove'], run: () => runCharacterRemoveMulti(browser, iterations, 'del') },
      { key: 'characterArtifactCascadeRemove', name: 'character-artifact-cascade-remove', aliases: ['remove', 'character remove'], run: () => runCharacterArtifactRemove(browser, iterations) },
      { key: 'characterClearNonInventory', name: 'character-clear-non-inventory', aliases: ['remove', 'character remove'], run: () => runCharacterClearNonInv(browser, iterations) },
      { key: 'indexListRemove', name: 'index-list-remove', aliases: ['remove', 'index remove'], run: () => runIndexListRemove(browser, iterations) },
      { key: 'indexInventoryRemove', name: 'index-inventory-remove', aliases: ['remove', 'index remove'], run: () => runIndexInventoryRemove(browser, iterations) },
      { key: 'indexInventoryBundleAdd', name: 'index-inventory-bundle-add', aliases: ['bundle insertion'], run: () => runIndexBundleAdd(browser, iterations) },
      { key: 'indexInventoryBundleAddSafe', name: 'index-inventory-bundle-add-safe', aliases: ['bundle insertion safe'], run: () => runIndexBundleAdd(browser, iterations, { forceSafePath: true }) },
      { key: 'indexInventoryBundleRemove', name: 'index-inventory-bundle-remove', aliases: ['bundle removal'], run: () => runIndexBundleRemove(browser, iterations) },
      { key: 'indexInventoryBundleRemoveSafe', name: 'index-inventory-bundle-remove-safe', aliases: ['bundle removal safe'], run: () => runIndexBundleRemove(browser, iterations, { forceSafePath: true }) },
      { key: 'indexHiddenArtifactRemove', name: 'index-hidden-artifact-remove', aliases: ['remove', 'index remove'], run: () => runIndexInventoryRemove(browser, iterations, { useArtifactCandidate: true }) },
      { key: 'indexListRemoveFullRerender', name: 'index-list-remove-full-rerender', aliases: ['remove', 'index remove'], run: () => runIndexListRemove(browser, iterations, { onlySelected: true }) },
      { key: 'inventoryRowDelete', name: 'inventory-row-delete', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'row-delete') },
      { key: 'inventoryStackDecrement', name: 'inventory-stack-decrement', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'stack-decrement') },
      { key: 'inventoryTagRemove', name: 'inventory-tag-remove', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'tag-remove') },
      { key: 'inventoryContainerDeleteAll', name: 'inventory-container-delete-all', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'container-delete-all') },
      { key: 'inventoryContainerDeleteOnly', name: 'inventory-container-delete-only', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'container-delete-only') },
      { key: 'inventoryVehicleUnloadRemove', name: 'inventory-vehicle-unload-remove', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'vehicle-unload') },
      { key: 'inventoryVehicleMoneyRemove', name: 'inventory-vehicle-money-remove', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'vehicle-money-remove') },
      { key: 'inventoryClear', name: 'inventory-clear', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'clear-inventory') },
      { key: 'inventoryQuantityAdd', name: 'inventory-quantity-add', aliases: ['inventory quantity'], run: () => runInventoryQuantity(browser, iterations, 'add') },
      { key: 'inventoryQuantitySubtract', name: 'inventory-quantity-subtract', aliases: ['inventory quantity'], run: () => runInventoryQuantity(browser, iterations, 'subtract') },
      { key: 'inventoryMetadataQuantityAdd', name: 'inventory-metadata-quantity-add', aliases: ['inventory metadata quantity'], run: () => runMetadataInventoryQuantity(browser, iterations, 'add') },
      { key: 'inventoryMetadataQuantityAddSafe', name: 'inventory-metadata-quantity-add-safe', aliases: ['inventory metadata quantity safe'], run: () => runMetadataInventoryQuantity(browser, iterations, 'add', { forceSafePath: true }) },
      { key: 'inventoryMetadataQuantitySubtract', name: 'inventory-metadata-quantity-subtract', aliases: ['inventory metadata quantity'], run: () => runMetadataInventoryQuantity(browser, iterations, 'subtract') },
      { key: 'inventoryMetadataFinalCopyRemove', name: 'inventory-metadata-final-copy-remove', aliases: ['inventory metadata remove'], run: () => runMetadataInventoryQuantity(browser, iterations, 'remove') },
      { key: 'inventoryMetadataFinalCopyRemoveSafe', name: 'inventory-metadata-final-copy-remove-safe', aliases: ['inventory metadata remove safe'], run: () => runMetadataInventoryQuantity(browser, iterations, 'remove', { forceSafePath: true }) },
      { key: 'traitPlusOne', name: 'trait-plus-one', aliases: ['trait mutation'], run: () => runTraitMutation(browser, iterations, 1) },
      { key: 'traitPlusFive', name: 'trait-plus-five', aliases: ['trait mutation'], run: () => runTraitMutation(browser, iterations, 5) },
      { key: 'traitMinusOne', name: 'trait-minus-one', aliases: ['trait mutation'], run: () => runTraitMutation(browser, iterations, -1) },
      { key: 'traitMinusFive', name: 'trait-minus-five', aliases: ['trait mutation'], run: () => runTraitMutation(browser, iterations, -5) }
    ];

    const scenarios = {};
    for (const definition of scenarioDefinitions) {
      if (!includeScenario(definition.name, definition.aliases || [])) continue;
      scenarios[definition.key] = await definition.run();
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      reportDir,
      iterations,
      runtime: {
        name: runtime.name,
        browser: runtime.browserType === webkit ? 'webkit' : 'chromium',
        mobile: runtime.name.startsWith('mobile-') || runtime.name.startsWith('pwa-'),
        cpuThrottleRate: runtime.cpuThrottleRate,
        serviceWorkerControlled: runtime.pwa
      },
      scenarios,
      vitals: {
        firstLoad: scenarios.firstLoad?.vitals || []
      }
    };

    await writeJson(path.join(reportDir, 'summary.json'), summary);
    return summary;
  } finally {
    await browser.close();
    await stopPreviewServer(server);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const requestedIterations = Math.max(1, Number(process.env.PERF_ITERATIONS) || DEFAULT_ITERATIONS);
  const summary = await runScenarioMetrics({ iterations: requestedIterations });
  console.log(JSON.stringify(summary, null, 2));
}
