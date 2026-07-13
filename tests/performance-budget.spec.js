import { expect, test } from '@playwright/test';

const SEARCH_BUDGET_MS = 150;
const CPU_THROTTLE_RATE = 4;
const CATALOG_ADD_CHARACTER_ID = 'catalog-add-priority-char';

async function seedCatalogAddCharacter(page) {
  await page.addInitScript(({ characterId }) => {
    localStorage.setItem('rpall-meta', JSON.stringify({
      current: characterId,
      characters: [{ id: characterId, name: 'Priority Hero', folderId: 'fd-standard' }],
      folders: [{ id: 'fd-standard', name: 'Standard', order: 0, system: true }],
      activeFolder: 'ALL',
      filterUnion: false,
      compactEntries: true,
      onlySelected: false,
      recentSearches: [],
      liveMode: false,
      entrySort: 'alpha-asc'
    }));
    localStorage.setItem(`rpall-char-${characterId}`, JSON.stringify({
      list: [],
      inventory: [],
      custom: [],
      notes: {},
      money: { daler: 5, skilling: 0, 'örtegar': 0 }
    }));
  }, { characterId: CATALOG_ADD_CHARACTER_ID });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

async function prepareThrottledSearch(page, { deferAutomaticWarm = true } = {}) {
  await page.addInitScript(({ shouldDeferAutomaticWarm }) => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        saveData: shouldDeferAutomaticWarm,
        effectiveType: '4g'
      }
    });
  }, { shouldDeferAutomaticWarm: deferAutomaticWarm });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true
  });

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted));

  // This suite protects interaction responsiveness, not cold-start time. Load
  // the lazily requested source and worker before applying the reference-device
  // throttle, then exercise the same warm path a user has after the app is
  // ready for offline use.
  await page.evaluate(async () => {
    await window.catalogLoader.ensureSource('data/formaga.json');
    if (typeof window.ensureSymbaroumIndexSearchReady !== 'function') {
      throw new Error('Index search warmup hook is unavailable.');
    }
    await window.ensureSymbaroumIndexSearchReady();
    await new Promise(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
  return session;
}

async function collectSearchSamples(page, { count = 5 } = {}) {
  const searchField = page.locator('shared-toolbar').locator('#searchField');
  await expect(searchField).toBeVisible();

  const scenarios = [];
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(() => window.symbaroumPerf.clearHistory());
    const completedScenario = page.waitForFunction(() => (
      window.symbaroumPerf.getSnapshot().scenarios.find(item => (
        item.name === 'search-filter'
        && item.status === 'completed'
        && item.detail?.trigger === 'search-submit'
      )) || null
    ), undefined, { timeout: 10_000 });

    await searchField.fill('');
    await searchField.pressSequentially('Akrobatik');
    await expect(searchField).toHaveValue('Akrobatik');
    const interactionStartedAtAbs = await page.evaluate(() => (
      performance.timeOrigin + performance.now()
    ));
    await searchField.press('Enter');

    const scenarioHandle = await completedScenario;
    const scenario = await scenarioHandle.jsonValue();
    await scenarioHandle.dispose();
    expect(scenario).toMatchObject({
      name: 'search-filter',
      status: 'completed',
      detail: { trigger: 'search-submit' }
    });
    expect(Number(scenario.finishedAtAbs)).toBeGreaterThan(Number(scenario.startedAtAbs));
    expect(Number(scenario.startedAtAbs)).toBeGreaterThanOrEqual(interactionStartedAtAbs);
    await expect(page.locator('#activeFilters .tag-search-chip')).toContainText('Akrobatik');
    scenarios.push({
      ...scenario,
      interactionStartedAtAbs,
      interactionDuration: Number(scenario.finishedAtAbs) - interactionStartedAtAbs
    });
  }
  return scenarios;
}

async function startRulesWarmProbe(page) {
  await page.evaluate(() => {
    const probe = {
      startedAtAbs: performance.timeOrigin + performance.now(),
      progress: [],
      terminal: null,
      settled: false,
      settledAtAbs: null,
      result: null
    };
    const absoluteNow = () => performance.timeOrigin + performance.now();
    window.__performanceWarmProbe = probe;
    window.__performanceWarmUnsubscribe?.();
    window.__performanceWarmUnsubscribe = window.symbaroumOffline.subscribe(detail => {
      if (detail.type === 'OFFLINE_RULES_PROGRESS') {
        probe.progress.push({
          atAbs: absoluteNow(),
          completed: Number(detail.completed) || 0,
          total: Number(detail.total) || 0
        });
      }
      if (detail.type === 'OFFLINE_RULES_COMPLETE' || detail.type === 'OFFLINE_RULES_ERROR') {
        probe.terminal = { type: detail.type, atAbs: absoluteNow() };
      }
    });
    window.__performanceWarmPromise = window.symbaroumOffline.retryRules()
      .then(result => {
        probe.result = result;
        return result;
      })
      .finally(() => {
        probe.settled = true;
        probe.settledAtAbs = absoluteNow();
      });
  });

  await page.waitForFunction(() => (
    window.__performanceWarmProbe?.progress?.length > 0
    && window.__performanceWarmProbe.settled === false
  ), undefined, { timeout: 15_000 });
}

async function clearRulesWarmCache(page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const rawScopePath = new URL(registration.scope).pathname;
    const scopePath = rawScopePath.endsWith('/') ? rawScopePath : `${rawScopePath}/`;
    const namespace = `symbaroum-${encodeURIComponent(scopePath)}`;
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => (
        key.startsWith(`${namespace}-rules-`)
        || key === `${namespace}-offline-meta`
      ))
      .map(key => caches.delete(key)));
  });
}

async function readRulesWarmProbe(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__performanceWarmProbe)));
}

test('throttled mobile search remains inside the isolated interaction budget', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools capability.');

  await prepareThrottledSearch(page);
  const scenarios = await collectSearchSamples(page);
  const samples = scenarios.map(scenario => Number(scenario.interactionDuration));

  expect(samples).toHaveLength(5);
  expect(
    percentile(samples, 0.95),
    `isolated search samples: ${samples.map(value => value.toFixed(1)).join(', ')} ms`
  ).toBeLessThanOrEqual(SEARCH_BUDGET_MS);
});

test('throttled mobile search keeps priority while offline rules are warming', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools capability.');
  test.setTimeout(60_000);

  // Keep the automatic three-second warm scheduler out of this measurement.
  // retryRules() below starts the same background worker path deterministically.
  const session = await prepareThrottledSearch(page);
  expect(await page.evaluate(() => ({
    saveData: navigator.connection?.saveData,
    effectiveType: navigator.connection?.effectiveType
  }))).toEqual({ saveData: true, effectiveType: '4g' });

  await clearRulesWarmCache(page);
  await startRulesWarmProbe(page);

  const warmBeforeFirstSample = await readRulesWarmProbe(page);
  expect(warmBeforeFirstSample.progress.length).toBeGreaterThan(0);
  expect(warmBeforeFirstSample.terminal).toBeNull();
  expect(warmBeforeFirstSample.settled).toBe(false);

  const [firstScenario] = await collectSearchSamples(page, { count: 1 });
  const warmAfterFirstSample = await readRulesWarmProbe(page);
  expect(warmBeforeFirstSample.progress.some(event => (
    Number(event.atAbs) <= Number(firstScenario.interactionStartedAtAbs)
  ))).toBe(true);
  expect(warmAfterFirstSample.terminal).toBeNull();
  expect(warmAfterFirstSample.settled).toBe(false);
  expect(warmAfterFirstSample.progress.length)
    .toBeGreaterThanOrEqual(warmBeforeFirstSample.progress.length);

  const remainingScenarios = await collectSearchSamples(page, { count: 4 });
  const scenarios = [firstScenario, ...remainingScenarios];
  const samples = scenarios.map(scenario => Number(scenario.interactionDuration));
  expect(samples).toHaveLength(5);
  expect(
    percentile(samples, 0.95),
    `warming search samples: ${samples.map(value => value.toFixed(1)).join(', ')} ms`
  ).toBeLessThanOrEqual(SEARCH_BUDGET_MS);

  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const warmResult = await page.evaluate(() => window.__performanceWarmPromise);
  expect(warmResult.ok).toBe(true);

  const completedWarm = await readRulesWarmProbe(page);
  expect(completedWarm.settled).toBe(true);
  expect(completedWarm.settledAtAbs).toBeGreaterThan(Number(firstScenario.finishedAtAbs));
  expect(completedWarm.progress.some(event => (
    Number(event.atAbs) > Number(firstScenario.finishedAtAbs)
  ))).toBe(true);
  expect(completedWarm.result?.ok).toBe(true);
});

test('choice-based catalog additions pause active rule warming and let it continue afterwards', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium DevTools capability.');
  test.setTimeout(60_000);

  await seedCatalogAddCharacter(page);
  const session = await prepareThrottledSearch(page);
  await clearRulesWarmCache(page);
  await startRulesWarmProbe(page);

  await page.evaluate(async () => {
    window.__catalogAddPriorityEvents = [];
    window.__catalogAddPriorityUnsubscribe?.();
    window.__catalogAddPriorityUnsubscribe = window.symbaroumOffline.subscribe(detail => {
      if (detail.type !== 'OFFLINE_RULES_PRIORITY') return;
      window.__catalogAddPriorityEvents.push({
        ...detail,
        atAbs: performance.timeOrigin + performance.now()
      });
    });
    window.__catalogAddSetupPauses = [
      window.symbaroumOffline.pauseRules('test-setup-primary'),
      window.symbaroumOffline.pauseRules('test-setup-secondary')
    ];
    await Promise.all(window.__catalogAddSetupPauses.map(token => (
      window.symbaroumOffline.yieldRules(token)
    )));
  });

  // Let any batch that was already in flight finish, then verify token leases
  // remain active beyond the old two-second anonymous pause ceiling.
  await page.waitForTimeout(250);
  const heldProgressCount = (await readRulesWarmProbe(page)).progress.length;
  await page.waitForTimeout(2_250);
  expect((await readRulesWarmProbe(page)).progress).toHaveLength(heldProgressCount);

  // Releasing one token must not resume warming while another foreground
  // holder is still active.
  await page.evaluate(() => {
    window.symbaroumOffline.resumeRules(window.__catalogAddSetupPauses.shift());
  });
  await page.waitForTimeout(300);
  expect((await readRulesWarmProbe(page)).progress).toHaveLength(heldProgressCount);

  const searchField = page.locator('shared-toolbar').locator('#searchField');
  await searchField.fill('Monsterlärd');
  await searchField.press('Enter');
  const card = page.locator('#lista li.entry-card[data-name="Monsterlärd"], #lista li.card[data-name="Monsterlärd"]').first();
  await expect(card).toBeVisible();
  await card.locator('select.level').evaluate((select) => {
    select.value = 'Gesäll';
    window.entryCardFactory?.syncLevelControl?.(select);
  });
  await card.locator('button[data-act="add"]').click();
  await expect(page.locator('#choicePopup')).toBeVisible();

  const beforeChoice = await readRulesWarmProbe(page);
  expect(beforeChoice.settled).toBe(false);
  await page.evaluate(() => {
    window.__catalogAddSetupPauses.splice(0).forEach(token => {
      window.symbaroumOffline.resumeRules(token);
    });
  });
  await page.locator('#choicePopup .db-radio', { hasText: 'Bestar' }).click();

  await page.waitForFunction(() => (
    window.symbaroumPerf?.getSnapshot?.().scenarios.some(entry => (
      entry.name === 'add-item-to-character' && entry.status === 'completed'
    ))
  ));
  const result = await page.evaluate(() => {
    const scenarios = window.symbaroumPerf?.getSnapshot?.().scenarios || [];
    const scenario = scenarios.filter(entry => (
      entry.name === 'add-item-to-character' && entry.status === 'completed'
    )).at(-1);
    const priorityEvents = (window.__catalogAddPriorityEvents || [])
      .filter(event => event.reason === 'catalog-add');
    return { scenario, priorityEvents };
  });

  const storeStage = (result.scenario?.detail?.profile?.stages || [])
    .find(stage => stage.name === 'store-mutation');
  const pauseEvent = result.priorityEvents.find(event => event.status === 'paused');
  const resumeEvent = result.priorityEvents.find(event => event.status === 'resumed');
  expect(storeStage).toBeTruthy();
  expect(pauseEvent?.active).toBeGreaterThan(0);
  expect(resumeEvent?.active).toBe(0);
  expect(pauseEvent?.atAbs).toBeLessThanOrEqual(storeStage?.startedAtAbs || Infinity);
  expect(resumeEvent?.atAbs).toBeGreaterThanOrEqual(storeStage?.finishedAtAbs || 0);

  const progressDuringMutation = (await readRulesWarmProbe(page)).progress.filter(event => (
    event.atAbs >= pauseEvent.atAbs && event.atAbs <= resumeEvent.atAbs
  ));
  expect(progressDuringMutation).toHaveLength(0);

  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const warmResult = await page.evaluate(() => window.__performanceWarmPromise);
  expect(warmResult.ok).toBe(true);
  const completedWarm = await readRulesWarmProbe(page);
  expect(completedWarm.settled).toBe(true);
  expect(completedWarm.progress.some(event => event.atAbs > resumeEvent.atAbs)).toBe(true);
});
