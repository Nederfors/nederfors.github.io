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

function makeHeavyCharacter(label) {
  return {
    list: Array.from({ length: 1000 }, (_, index) => ({
      id: `${label}-list-${index}`,
      namn: `${label} List ${index}`,
      nivå: 'Novis',
      form: 'normal',
      taggar: { typ: ['Förmåga'] },
      text: 'x'.repeat(120)
    })),
    inventory: Array.from({ length: 1000 }, (_, index) => ({
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
  if (readySelector) {
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: timeoutMs });
  }
  await page.waitForFunction(
    () => Boolean(window.DB?.length) && Boolean(window.__symbaroumBootCompleted),
    null,
    { timeout: timeoutMs }
  );
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

export async function runScenarioMetrics({ runDir = null, iterations = DEFAULT_ITERATIONS } = {}) {
  const resolvedRunDir = runDir || await createRunDir('scenarios');
  const reportDir = path.join(resolvedRunDir, 'scenarios');
  const server = await startPreviewServer({ port: PREVIEW_PORT });
  const browser = await chromium.launch({ headless: true });

  try {
    const scenarios = {
      firstLoad: await runFirstLoad(browser, iterations),
      routeChange: await runRouteChange(browser, iterations),
      openInventory: await runOpenInventory(browser, iterations),
      switchCharacter: await runSwitchCharacter(browser, iterations),
      addIndexList: await runIndexAdd(browser, iterations, 'list'),
      addIndexInventory: await runIndexAdd(browser, iterations, 'inventory'),
      searchFilter: await runSearchFilter(browser, iterations),
      inventoryBuyMultiple: await runInventoryBuyMultiple(browser, iterations),
      inventoryAddQuality: await runInventoryAddQuality(browser, iterations),
      inventoryCustomItemCreate: await runInventoryCustomItemCreate(browser, iterations),
      inventoryCustomItemEdit: await runInventoryCustomItemEdit(browser, iterations),
      inventoryVehicleLoad: await runVehicleScenario(browser, iterations, 'load'),
      inventoryVehicleUnload: await runVehicleScenario(browser, iterations, 'unload'),
      notesEdit: await runNotesEdit(browser, iterations),
      moneyEdit: await runMoneyEdit(browser, iterations),
      heavyCharacterSave: await runHeavyCurrentCharacterSave(browser, iterations)
    };

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
