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

const TEST_CHAR_ID = 'perf-char-a';
const TEST_CHAR_ID_2 = 'perf-char-b';

const metaState = {
  current: TEST_CHAR_ID,
  characters: [
    { id: TEST_CHAR_ID, name: 'Mätning Alfa' },
    { id: TEST_CHAR_ID_2, name: 'Mätning Beta' }
  ],
  folders: [],
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
  money: { daler: 3, skilling: 0, 'örtegar': 0 }
};

async function seedStore(context) {
  await context.addInitScript(({ metaState, baseCharacter, secondId }) => {
    if (!localStorage.getItem('__symbaroumPerfSeeded')) {
      localStorage.clear();
      localStorage.setItem('rpall-meta', JSON.stringify(metaState));
      localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(baseCharacter));
      localStorage.setItem(`rpall-char-${secondId}`, JSON.stringify({
        ...baseCharacter,
        notes: {
          background: 'Reservkaraktär'
        }
      }));
      localStorage.setItem('__symbaroumPerfSeeded', '1');
    }
  }, { metaState, baseCharacter, secondId: TEST_CHAR_ID_2 });
}

async function waitForApp(page, pathName, readySelector) {
  await page.goto(`http://${PREVIEW_HOST}:${PREVIEW_PORT}${pathName}`);
  await page.locator(readySelector).first().waitFor({ state: 'visible' });
  await page.waitForFunction(() => Boolean(window.DB?.length) && Boolean(window.__symbaroumBootCompleted));
  await page.waitForTimeout(800);
}

async function clearPerfHistory(page) {
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });
}

async function snapshot(page) {
  return page.evaluate(() => window.symbaroumPerf?.getSnapshot?.() || null);
}

async function clickFirstVisibleAddButton(page) {
  const clicked = await page.evaluate(() => {
    const inventoryTypes = new Set([
      'Vapen',
      'Närstridsvapen',
      'Avståndsvapen',
      'Sköld',
      'Rustning',
      'Lägre Artefakt',
      'Artefakt',
      'Färdmedel',
      'Kuriositet',
      'Utrustning'
    ]);
    const resolveEntry = (button) => {
      const card = button.closest('li');
      const id = button.dataset.id || card?.dataset?.id || '';
      const name = button.dataset.name || card?.dataset?.name || '';
      const entry = typeof window.lookupEntry === 'function'
        ? window.lookupEntry({ id: id || undefined, name })
        : null;
      const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      const isInventory = typeof window.isInv === 'function'
        ? Boolean(window.isInv(entry))
        : types.some((type) => inventoryTypes.has(String(type || '').trim()));
      return {
        button,
        id,
        isInventory,
        name: name || entry?.namn || ''
      };
    };
    const buttons = Array.from(document.querySelectorAll('#lista button.add-btn'));
    const candidates = buttons.filter((button) => {
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    }).map(resolveEntry);
    const target = candidates.find((candidate) => candidate.isInventory) || candidates[0];
    if (!target?.button) return { clicked: false };
    target.button.click();
    return {
      clicked: true,
      id: target.id || null,
      isInventory: target.isInventory,
      name: target.name || null
    };
  });
  if (!clicked?.clicked) {
    throw new Error('Unable to find a visible add button on the index view.');
  }
  return clicked;
}

async function waitForScenario(page, name) {
  try {
    await page.waitForFunction(
      (scenarioName) => {
        const snapshot = window.symbaroumPerf?.getSnapshot?.();
        return Boolean(snapshot?.scenarios?.some((entry) => entry.name === scenarioName && entry.status === 'completed'));
      },
      name,
      { timeout: 30_000 }
    );
  } catch (error) {
    const debugSnapshot = await page.evaluate(() => ({
      snapshot: window.symbaroumPerf?.getSnapshot?.() || null,
      pendingScenarios: window.sessionStorage?.getItem('__symbaroumPerfPendingScenarios') || null
    }));
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Timed out waiting for scenario "${name}". ${message}\n${JSON.stringify(debugSnapshot, null, 2)}`);
  }
  const data = await snapshot(page);
  const matches = (data?.scenarios || []).filter((entry) => entry.name === name && entry.status === 'completed');
  return matches[matches.length - 1] || null;
}

export async function runScenarioMetrics({ runDir = null } = {}) {
  const resolvedRunDir = runDir || await createRunDir('scenarios');
  const reportDir = path.join(resolvedRunDir, 'scenarios');
  const server = await startPreviewServer({ port: PREVIEW_PORT });
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    await seedStore(context);
    const page = await context.newPage();

    await waitForApp(page, '/#/character', '#valda');
    const initialSnapshot = await snapshot(page);
    const firstLoad = ((initialSnapshot?.scenarios || []).filter((entry) => entry.name === 'first-load')).at(-1) || null;
    const firstLoadVitals = initialSnapshot?.vitals || [];

    await clearPerfHistory(page);
    await page.locator('shared-toolbar').locator('#traitsLink').click();
    await page.waitForURL(/#\/traits/);
    await page.locator('#traitsTabPanel').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const routeChange = await waitForScenario(page, 'route-change');

    await waitForApp(page, '/#/character', '#valda');
    await clearPerfHistory(page);
    await page.locator('shared-toolbar').locator('#inventoryLink').click();
    await page.waitForURL(/#\/inventory/);
    await page.locator('#invList').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const openInventory = await waitForScenario(page, 'open-inventory');

    await waitForApp(page, '/#/character', '#valda');
    await clearPerfHistory(page);
    await page.locator('shared-toolbar').locator('#charSelect').selectOption(TEST_CHAR_ID_2);
    await page.locator('#charName').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const switchCharacter = await waitForScenario(page, 'switch-character');

    await waitForApp(page, '/#/index', '#lista');
    await clearPerfHistory(page);
    const addTarget = await clickFirstVisibleAddButton(page);
    const addItemToCharacter = await waitForScenario(page, 'add-item-to-character');

    await waitForApp(page, '/#/index', '#lista');
    await clearPerfHistory(page);
    await page.evaluate(() => {
      if (typeof window.handleIndexSearchTerm === 'function') {
        window.handleIndexSearchTerm('Akrobatik');
      }
    });
    const searchFilter = await waitForScenario(page, 'search-filter');

    const summary = {
      generatedAt: new Date().toISOString(),
      reportDir,
      scenarios: {
        firstLoad,
        routeChange,
        addItemToCharacter,
        switchCharacter,
        openInventory,
        searchFilter
      },
      addTarget,
      addItemProfile: addItemToCharacter?.detail?.profile || null,
      vitals: {
        firstLoad: firstLoadVitals
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
