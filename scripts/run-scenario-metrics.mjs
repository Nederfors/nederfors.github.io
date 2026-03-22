import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  PREVIEW_HOST,
  PREVIEW_PORT,
  createRunDir,
  startPreviewServer,
  stopPreviewServer,
  writeJson
} from './perf-common.mjs';

const DEFAULT_ITERATIONS = 5;
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
  const context = await browser.newContext();
  try {
    await seedStore(context, { profile: options.profile || 'base' });
    const page = await context.newPage();
    await waitForApp(page, options.pathName, options.readySelector, {
      timeoutMs: options.timeoutMs
    });
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

function summarizeDetail(detail = {}) {
  return {
    scope: detail.scope || null,
    branch: detail.branch || null,
    renderMode: detail.renderMode || null,
    entry: detail.entry || null,
    trigger: detail.trigger || null,
    source: detail.source || null
  };
}

function aggregateNumbers(values = []) {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!numeric.length) {
    return {
      avgMs: null,
      medianMs: null,
      minMs: null,
      maxMs: null
    };
  }
  const sum = numeric.reduce((total, value) => total + value, 0);
  return {
    avgMs: sum / numeric.length,
    medianMs: median(numeric),
    minMs: Math.min(...numeric),
    maxMs: Math.max(...numeric)
  };
}

function aggregateScenarioRuns(name, runs = []) {
  const durations = runs.map((run) => Number(run?.duration || 0));
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
    return [stageName, aggregateNumbers(totals)];
  }));

  return {
    name,
    iterations: runs.length,
    ...aggregateNumbers(durations),
    stages,
    samples: runs.map((run) => ({
      durationMs: Number(run?.duration || 0),
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

async function enableRemoveProfiling(page) {
  await page.evaluate(async () => {
    window.__symbaroumPerfCaptureRemovals = true;
    window.__symbaroumPerfAwaitFlush = true;
    if (!window.__symbaroumPerfDialogOverrides) {
      window.__symbaroumPerfDialogOverrides = {
        alertPopup: window.alertPopup,
        confirmPopup: window.confirmPopup,
        openDialog: window.openDialog
      };
    }
    window.alertPopup = async () => true;
    window.confirmPopup = async () => true;
    window.openDialog = async () => true;
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'remove-prep' });
    window.symbaroumPerf?.clearHistory?.();
  });
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

async function prepareIndexListEntry(page, options = {}) {
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
    const entry = useArtifactCandidate
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

async function runSwitchCharacter(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => {
      await clearPerfHistory(page);
      await page.locator('shared-toolbar').locator('#charSelect').selectOption(TEST_CHAR_ID_2);
      await page.locator('#charName').waitFor({ state: 'visible' });
      return waitForScenario(page, 'switch-character');
    })
  ));
  return aggregateScenarioRuns('switch-character', runs);
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
    withSeededPage(browser, { pathName: '/#/index', readySelector: '#lista' }, async (page) => {
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
      const popupClose = await page.evaluate(async () => {
        const popup = document.getElementById('choicePopup');
        if (!popup) throw new Error('Choice popup was not found.');
        const optionRoot = popup.querySelector('#choiceOpts') || popup;
        const button = [...optionRoot.querySelectorAll('button')]
          .find((candidate) => !candidate.disabled && String(candidate.textContent || '').trim());
        if (!button) throw new Error('Choice popup had no selectable option.');
        const label = String(button.textContent || '').trim();
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
        button.click();
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
  const changed = await page.evaluate(({ rootSelector, name, value }) => {
    const root = document.querySelector(rootSelector);
    if (!root) return false;
    const card = [...root.querySelectorAll('li.entry-card, li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    if (!card) return false;
    const select = card.querySelector('select.level');
    if (!select) return false;
    select.value = value;
    window.entryCardFactory?.syncLevelControl?.(select);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { rootSelector, name, value });

  if (!changed) {
    throw new Error(`Unable to change level for ${name} in ${rootSelector}.`);
  }
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
      const target = await prepareCharacterLevelChangeTarget(page, mode);
      await settleAfterMutation(page);
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
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = window.lookupEntry?.({ name: 'Dubbel ringbrynja' });
        const row = await window.invUtil?.buildInventoryRow?.({
          entry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
        window.storeHelper.setInventory(activeStore, [row]);
        window.invUtil?.renderInventory?.();
        window.symbaroumPerf?.clearHistory?.();
        const perf = window.symbaroumPerf;
        const scenarioId = perf?.startScenario?.('inventory-buy-multiple', { scope: 'inventory', entry: entry?.namn || null });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          row.qty = (Number(row.qty) || 0) + 4;
          window.invUtil?.saveInventory?.([row], { source: 'perf-buy-multiple', afterPaint: false });
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, { scope: 'inventory', entry: entry?.namn || null });
      })
    ))
  ));
  return aggregateScenarioRuns('inventory-buy-multiple', runs);
}

async function runInventoryAddQuality(browser, iterations) {
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async () => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const entry = window.lookupEntry?.({ name: 'Dubbel ringbrynja' });
        const row = await window.invUtil?.buildInventoryRow?.({
          entry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
        window.storeHelper.setInventory(activeStore, [row]);
        window.invUtil?.renderInventory?.();
        const qualityEntry = (window.DB || []).find((candidate) => (
          window.isQual?.(candidate) && window.canApplyQuality?.(entry, candidate)
        )) || null;
        window.symbaroumPerf?.clearHistory?.();
        const perf = window.symbaroumPerf;
        const scenarioId = perf?.startScenario?.('inventory-add-quality', {
          scope: 'inventory',
          entry: entry?.namn || null,
          quality: qualityEntry?.namn || null
        });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          row.kvaliteter = [...(row.kvaliteter || []), qualityEntry?.namn || 'Massivt'];
          window.invUtil?.saveInventory?.([row], { source: 'perf-add-quality', afterPaint: false });
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          entry: entry?.namn || null,
          quality: qualityEntry?.namn || 'Massivt'
        });
      })
    ))
  ));
  return aggregateScenarioRuns('inventory-add-quality', runs);
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

async function runVehicleScenario(browser, iterations, direction) {
  const scenarioName = direction === 'load' ? 'inventory-vehicle-load' : 'inventory-vehicle-unload';
  const runs = await collectRuns(browser, iterations, async () => (
    withSeededPage(browser, { pathName: '/#/inventory', readySelector: '#invList' }, async (page) => (
      page.evaluate(async (mode) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const vehicleEntry = window.lookupEntry?.({ name: 'Kärra' }) || window.lookupEntry?.({ name: 'Mulåsna' });
        const itemEntry = window.lookupEntry?.({ name: 'Bandage' }) || window.lookupEntry?.({ name: 'Dryckesbälte' });
        const vehicleRow = await window.invUtil?.buildInventoryRow?.({
          entry: vehicleEntry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
        const itemRow = await window.invUtil?.buildInventoryRow?.({
          entry: itemEntry,
          list: window.storeHelper.getCurrentList(activeStore)
        });
        vehicleRow.contains = mode === 'unload' ? [itemRow] : [];
        const inventory = mode === 'unload' ? [vehicleRow] : [vehicleRow, itemRow];
        window.storeHelper.setInventory(activeStore, inventory);
        window.invUtil?.renderInventory?.();
        const perf = window.symbaroumPerf;
        perf?.clearHistory?.();
        const scenarioId = perf?.startScenario?.(mode === 'load' ? 'inventory-vehicle-load' : 'inventory-vehicle-unload', {
          scope: 'inventory',
          vehicle: vehicleEntry?.namn || null,
          item: itemEntry?.namn || null
        });
        await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
          if (mode === 'load') {
            const moved = inventory.pop();
            vehicleRow.contains = [...(vehicleRow.contains || []), moved];
          } else {
            const moved = (vehicleRow.contains || []).shift();
            inventory.push(moved);
          }
          window.invUtil?.saveInventory?.(inventory, {
            source: mode === 'load' ? 'perf-vehicle-load' : 'perf-vehicle-unload',
            afterPaint: false
          });
        });
        await perf?.timeScenarioStage?.(scenarioId, 'persistence-flush', () => window.symbaroumPersistence?.flushPendingWrites?.());
        await perf?.afterNextPaint?.(2);
        return perf?.endScenario?.(scenarioId, {
          scope: 'inventory',
          vehicle: vehicleEntry?.namn || null,
          item: itemEntry?.namn || null
        });
      }, direction)
    ))
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
    withSeededPage(browser, { pathName: '/#/character', readySelector: '#valda' }, async (page) => (
      page.evaluate(async ({ scenarioName }) => {
        const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
        const waitWithTimeout = (value, label, timeoutMs = 8_000) => Promise.race([
          Promise.resolve(value),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(label)), timeoutMs);
          })
        ]);
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
          __uid: 'perf-character-artifact-remove'
        }]);
        window.storeHelper.setInventory(activeStore, [row]);
        if (entry.id) window.storeHelper.addRevealedArtifact(activeStore, entry.id);
        await waitWithTimeout(
          window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName }),
          'Artifact scenario setup flush timed out.'
        );
        window.symbaroumViewBridge?.refreshCurrent({ selection: true, strict: true });
        window.symbaroumPerf?.clearHistory?.();

        const perf = window.symbaroumPerf;
        const scenarioId = perf?.startScenario?.(scenarioName, {
          scope: 'character',
          entry: entry.namn,
          branch: 'list'
        });
        perf?.setFlowContext?.('remove-item', scenarioId);

        const runMutationBatch = typeof window.storeHelper?.batchCurrentCharacterMutation === 'function'
          ? (callback) => window.storeHelper.batchCurrentCharacterMutation(activeStore, {}, callback)
          : async (callback) => callback();

        await waitWithTimeout(runMutationBatch(async () => {
          await perf?.timeScenarioStage?.(scenarioId, 'store-mutation', () => {
            window.storeHelper.setCurrentList(activeStore, []);
          }, {
            surface: 'character',
            branch: 'list'
          });

          const nextInventory = window.storeHelper.getInventory(activeStore);
          const removeItem = (items) => {
            for (let index = items.length - 1; index >= 0; index -= 1) {
              if (items[index]?.id === entry.id) items.splice(index, 1);
              else if (Array.isArray(items[index]?.contains)) removeItem(items[index].contains);
            }
          };
          removeItem(nextInventory);

          await perf?.timeScenarioStage?.(scenarioId, 'inventory-sync', () => (
            window.invUtil?.saveInventory?.(nextInventory, {
              source: 'perf-character-artifact-remove',
              skipCharacterRefresh: true,
              afterPaint: false
            })
          ), {
            surface: 'character',
            branch: 'list'
          });

          if (entry.id) {
            window.storeHelper.removeRevealedArtifact(activeStore, entry.id);
          }
        }), 'Artifact scenario mutation batch timed out.');

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
          waitWithTimeout(
            window.symbaroumPersistence?.flushPendingWrites?.({ reason: scenarioName }),
            'Artifact scenario final flush timed out.'
          )
        ));
        await perf?.afterNextPaint?.(2);
        perf?.clearFlowContext?.('remove-item', scenarioId);
        return perf?.endScenario?.(scenarioId, {
          scope: 'character',
          entry: entry.namn,
          branch: 'list'
        });
      }, { scenarioName })
    ))
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

export async function runScenarioMetrics({ runDir = null, iterations = DEFAULT_ITERATIONS } = {}) {
  const resolvedRunDir = runDir || await createRunDir('scenarios');
  const reportDir = path.join(resolvedRunDir, 'scenarios');
  const server = await startPreviewServer({ port: PREVIEW_PORT });
  const browser = await chromium.launch({ headless: true });
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
      { key: 'addIndexList', name: 'index-list-add', aliases: ['add'], run: () => runIndexAdd(browser, iterations, 'list') },
      { key: 'addIndexPopup', name: 'index-popup-add', aliases: ['add', 'popup add'], run: () => runIndexPopupAdd(browser, iterations) },
      { key: 'addIndexInventory', name: 'index-inventory-add', aliases: ['add'], run: () => runIndexAdd(browser, iterations, 'inventory') },
      { key: 'searchFilter', name: 'search-filter', run: () => runSearchFilter(browser, iterations) },
      { key: 'inventoryBuyMultiple', name: 'inventory-buy-multiple', aliases: ['inventory add'], run: () => runInventoryBuyMultiple(browser, iterations) },
      { key: 'inventoryAddQuality', name: 'inventory-add-quality', aliases: ['inventory add'], run: () => runInventoryAddQuality(browser, iterations) },
      { key: 'inventoryCustomItemCreate', name: 'inventory-custom-item-create', aliases: ['inventory add'], run: () => runInventoryCustomItemCreate(browser, iterations) },
      { key: 'inventoryCustomItemEdit', name: 'inventory-custom-item-edit', run: () => runInventoryCustomItemEdit(browser, iterations) },
      { key: 'inventoryVehicleLoad', name: 'inventory-vehicle-load', aliases: ['inventory add'], run: () => runVehicleScenario(browser, iterations, 'load') },
      { key: 'inventoryVehicleUnload', name: 'inventory-vehicle-unload', aliases: ['inventory remove'], run: () => runVehicleScenario(browser, iterations, 'unload') },
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
      { key: 'indexHiddenArtifactRemove', name: 'index-hidden-artifact-remove', aliases: ['remove', 'index remove'], run: () => runIndexInventoryRemove(browser, iterations, { useArtifactCandidate: true }) },
      { key: 'indexListRemoveFullRerender', name: 'index-list-remove-full-rerender', aliases: ['remove', 'index remove'], run: () => runIndexListRemove(browser, iterations, { onlySelected: true }) },
      { key: 'inventoryRowDelete', name: 'inventory-row-delete', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'row-delete') },
      { key: 'inventoryStackDecrement', name: 'inventory-stack-decrement', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'stack-decrement') },
      { key: 'inventoryTagRemove', name: 'inventory-tag-remove', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'tag-remove') },
      { key: 'inventoryContainerDeleteAll', name: 'inventory-container-delete-all', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'container-delete-all') },
      { key: 'inventoryContainerDeleteOnly', name: 'inventory-container-delete-only', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'container-delete-only') },
      { key: 'inventoryVehicleUnloadRemove', name: 'inventory-vehicle-unload-remove', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'vehicle-unload') },
      { key: 'inventoryVehicleMoneyRemove', name: 'inventory-vehicle-money-remove', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'vehicle-money-remove') },
      { key: 'inventoryClear', name: 'inventory-clear', aliases: ['remove', 'inventory remove'], run: () => runInventoryRemove(browser, iterations, 'clear-inventory') }
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
  const summary = await runScenarioMetrics();
  console.log(JSON.stringify(summary, null, 2));
}
