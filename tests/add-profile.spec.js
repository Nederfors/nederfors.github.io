import { expect, test } from '@playwright/test';

const DIRECT_ADD_BUDGET_MS = 300;
const CHOICE_ADD_BUDGET_MS = 750;
const MOBILE_CPU_THROTTLE_RATE = 4;
const PERFORMANCE_SAMPLE_COUNT = Math.max(
  1,
  Number.parseInt(process.env.ADD_PROFILE_SAMPLE_COUNT || '5', 10) || 5
);

const metaState = {
  current: 'profile-char',
  characters: [
    { id: 'profile-char', name: 'Profile Hero', folderId: 'fd-standard' }
  ],
  folders: [
    { id: 'fd-standard', name: 'Standard', order: 0, system: true }
  ],
  activeFolder: 'ALL',
  filterUnion: false,
  compactEntries: true,
  onlySelected: false,
  recentSearches: [],
  liveMode: false,
  entrySort: 'alpha-asc'
};

const characterState = {
  list: [],
  inventory: [],
  custom: [],
  notes: {},
  money: { daler: 5, skilling: 0, 'örtegar': 0 }
};

async function seedProfileStore(page, state = characterState) {
  await page.addInitScript(({ metaState, characterState: seedState }) => {
    if (sessionStorage.getItem('__addProfileSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(seedState));
    sessionStorage.setItem('__addProfileSeeded', '1');
  }, { metaState, characterState: state });
}

function makeInteractionHeavyCharacter() {
  return {
    ...characterState,
    list: Array.from({ length: 250 }, (_, index) => ({
      id: `profile-list-${index}`,
      namn: `Profile List ${index}`,
      nivå: 'Novis',
      form: 'normal',
      taggar: { typ: ['Förmåga'] },
      text: 'x'.repeat(120)
    })),
    inventory: Array.from({ length: 250 }, (_, index) => ({
      id: `profile-inventory-${index}`,
      name: `Profile Inventory ${index}`,
      qty: 1 + (index % 3),
      gratis: 0,
      gratisKval: [],
      removedKval: []
    }))
  };
}

function percentile(values, fraction) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function assertIncrementalCatalogAdd(scenario) {
  expect(scenario?.detail?.reconciliationMode).toBe('incremental');
  expect(scenario?.detail?.renderMode).toBe('incremental');
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);
  expect(stageNames).not.toContain('full-list-render');
  expect(stageNames).not.toContain('sort-group-rebuild');
  expect(stageNames).not.toContain('dom-patch');
}

async function readCompletedAddScenario(page) {
  await page.waitForFunction(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    return Boolean(snapshot?.scenarios?.some((entry) => entry.name === 'add-item-to-character' && entry.status === 'completed'));
  });

  return page.evaluate(() => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    const matches = (snapshot?.scenarios || []).filter((entry) => entry.name === 'add-item-to-character' && entry.status === 'completed');
    return matches[matches.length - 1] || null;
  });
}

async function revealIndexTarget(page, query) {
  const search = page.locator('shared-toolbar').locator('#searchField');
  await search.fill(query);
  await search.press('Enter');
  await expect.poll(async () => page.locator('#lista button.add-btn:visible').count()).toBeGreaterThan(0);
}

async function openChoiceProfileTarget(page) {
  const result = await page.evaluate(async () => {
    const card = document.querySelector(
      '#lista li.entry-card[data-name="Monsterlärd"], #lista li.card[data-name="Monsterlärd"]'
    );
    const select = card?.querySelector('select.level');
    const addButton = card?.querySelector('button[data-act="add"]');
    if (!card || !select || !addButton) return { ok: false, reason: 'missing-card-controls' };

    select.value = 'Gesäll';
    window.entryCardFactory?.syncLevelControl?.(select);
    addButton.click();

    const timeoutAt = performance.now() + 10_000;
    const option = await new Promise((resolve) => {
      const inspect = () => {
        const popup = document.getElementById('choicePopup');
        const root = popup?.querySelector('#choiceOpts') || popup;
        const candidate = root
          ? [...root.querySelectorAll('input[type="radio"], button')]
            .find(control => !control.disabled && (
              control.matches('input[type="radio"]')
              || String(control.textContent || '').trim()
            ))
          : null;
        if (candidate) {
          resolve(candidate);
          return;
        }
        if (performance.now() >= timeoutAt) {
          resolve(null);
          return;
        }
        requestAnimationFrame(inspect);
      };
      inspect();
    });
    if (!option) return { ok: false, reason: 'missing-popup-option' };
    return { ok: true };
  });
  expect(result).toEqual({ ok: true });
}

async function selectChoiceProfileTarget(page) {
  const result = await page.evaluate(() => {
    const popup = document.getElementById('choicePopup');
    const root = popup?.querySelector('#choiceOpts') || popup;
    const option = root
      ? [...root.querySelectorAll('input[type="radio"], button')]
        .find(control => !control.disabled && (
          control.matches('input[type="radio"]')
          || String(control.textContent || '').trim()
        ))
      : null;
    if (!option) return { ok: false, reason: 'missing-popup-option' };
    option.click();
    if (option.matches('input[type="radio"]')) {
      option.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { ok: true };
  });
  expect(result).toEqual({ ok: true });
}

async function clickChoiceProfileTarget(page, { beforeSelection = null } = {}) {
  await openChoiceProfileTarget(page);
  if (typeof beforeSelection === 'function') await beforeSelection();
  await selectChoiceProfileTarget(page);
}

async function ensureControlledServiceWorker(page) {
  await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active));
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload();
    await page.waitForFunction(() => (
      Boolean(window.__symbaroumBootCompleted)
      && Boolean(window.symbaroumPersistence?.ready)
    ));
  }
  await expect.poll(
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    { timeout: 15_000 }
  ).toBe(true);
}

async function startCatalogRulesWarmProbe(page) {
  await page.evaluate(() => {
    const absoluteNow = () => performance.timeOrigin + performance.now();
    const probe = {
      progress: [],
      priority: [],
      settled: false,
      result: null
    };
    window.__catalogAddWarmProbe = probe;
    window.__catalogAddWarmUnsubscribe?.();
    window.__catalogAddWarmUnsubscribe = window.symbaroumOffline.subscribe(detail => {
      if (detail.type === 'OFFLINE_RULES_PROGRESS') {
        probe.progress.push({
          atAbs: absoluteNow(),
          completed: Number(detail.completed) || 0,
          total: Number(detail.total) || 0
        });
      }
      if (detail.type === 'OFFLINE_RULES_PRIORITY' && detail.reason === 'catalog-add') {
        probe.priority.push({
          atAbs: absoluteNow(),
          status: detail.status,
          active: Number(detail.active) || 0,
          warmSettled: probe.settled
        });
      }
    });
    window.__catalogAddWarmPromise = window.symbaroumOffline.retryRules()
      .then(result => {
        probe.result = result;
        return result;
      })
      .finally(() => {
        probe.settled = true;
      });
  });
  await page.waitForFunction(() => (
    window.__catalogAddWarmProbe?.progress?.length > 0
    && window.__catalogAddWarmProbe.settled === false
  ), undefined, { timeout: 15_000 });
}

async function assertCatalogRulesWarmOverlap(page, scenario) {
  const probe = await page.evaluate(() => JSON.parse(JSON.stringify(window.__catalogAddWarmProbe)));
  const pauseEvent = probe.priority.find(event => event.status === 'paused');
  const resumeEvent = probe.priority.find(event => event.status === 'resumed');
  const storeStage = (scenario?.detail?.profile?.stages || [])
    .find(stage => stage.name === 'store-mutation');

  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(probe.progress.length).toBeGreaterThan(0);
  expect(pauseEvent?.warmSettled).toBe(false);
  expect(pauseEvent?.active).toBeGreaterThan(0);
  expect(resumeEvent?.active).toBe(0);
  expect(storeStage).toBeTruthy();
  expect(pauseEvent?.atAbs).toBeLessThanOrEqual(storeStage?.startedAtAbs || Infinity);
  expect(resumeEvent?.atAbs).toBeGreaterThanOrEqual(storeStage?.finishedAtAbs || 0);
  expect(probe.progress.filter(event => (
    event.atAbs >= storeStage.startedAtAbs && event.atAbs <= storeStage.finishedAtAbs
  ))).toHaveLength(0);
}

async function finishCatalogRulesWarmProbe(page) {
  const result = await page.evaluate(() => window.__catalogAddWarmPromise);
  expect(result?.ok).toBe(true);
  const probe = await page.evaluate(() => JSON.parse(JSON.stringify(window.__catalogAddWarmProbe)));
  const resumeEvent = probe.priority.find(event => event.status === 'resumed');
  expect(probe.settled).toBe(true);
  expect(resumeEvent).toBeTruthy();
  expect(probe.progress.some(event => event.atAbs > (resumeEvent?.atAbs || Infinity))).toBe(true);
}

async function collectCatalogAddSamples(browser, kind, { rulesWarming = false } = {}) {
  const samples = [];
  for (let index = 0; index < PERFORMANCE_SAMPLE_COUNT; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    let cdp = null;
    try {
      // Automatic warming is covered separately. Keep this reference-device
      // budget isolated from nondeterministic background work.
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: { saveData: true, effectiveType: '4g' }
        });
      });
      await seedProfileStore(context, makeInteractionHeavyCharacter());
      const page = await context.newPage();
      await page.goto('/#/index');
      await page.waitForFunction(() => (
        Boolean(window.__symbaroumBootCompleted)
        && Boolean(window.symbaroumPersistence?.ready)
      ));
      if (rulesWarming) await ensureControlledServiceWorker(page);

      await revealIndexTarget(page, kind === 'choice' ? 'Monsterlärd' : 'Akrobatik');
      cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: MOBILE_CPU_THROTTLE_RATE });
      await page.evaluate(() => {
        window.__symbaroumPerfAwaitFlush = false;
        window.symbaroumPerf?.clearHistory?.();
      });

      if (kind === 'choice') {
        await clickChoiceProfileTarget(page, {
          beforeSelection: rulesWarming
            ? () => startCatalogRulesWarmProbe(page)
            : null
        });
      } else {
        if (rulesWarming) await startCatalogRulesWarmProbe(page);
        expect(await clickProfileTarget(page, 'list')).toBe('Akrobatik');
      }

      const scenario = await readCompletedAddScenario(page);
      assertIncrementalCatalogAdd(scenario);
      if (rulesWarming) {
        await assertCatalogRulesWarmOverlap(page, scenario);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await finishCatalogRulesWarmProbe(page);
      }
      const duration = Number(scenario?.duration);
      expect(Number.isFinite(duration) && duration >= 0).toBe(true);
      samples.push({
        duration,
        checkpoints: scenario?.detail?.profile?.checkpoints || [],
        stages: scenario?.detail?.profile?.stages || []
      });
    } finally {
      if (cdp) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
        await cdp.detach().catch(() => {});
      }
      await context.close();
    }
  }
  return samples;
}

function formatCatalogAddSamples(samples) {
  return samples.map((sample) => {
    const stages = sample.stages
      .filter(stage => Number(stage?.duration) >= 1)
      .sort((left, right) => Number(right.duration) - Number(left.duration))
      .slice(0, 6)
      .map(stage => (
        `${stage.name}=${Number(stage.duration).toFixed(1)}`
        + `@${Number(stage.startedOffsetMs).toFixed(1)}-${Number(stage.finishedOffsetMs).toFixed(1)}`
      ))
      .join(', ');
    const lastCheckpoint = sample.checkpoints.at(-1);
    const checkpoint = lastCheckpoint
      ? `${lastCheckpoint.name}@${Number(lastCheckpoint.offsetMs).toFixed(1)}`
      : 'none';
    return `${sample.duration.toFixed(1)} ms [${stages || 'no >=1ms stages'}; last=${checkpoint}]`;
  }).join(' | ');
}

async function revealIndexTargetByCategory(page, name) {
  const category = await page.evaluate((entryName) => {
    const entry = window.lookupEntry?.({ name: entryName })
      || (window.DB || []).find(candidate => String(candidate?.namn || '').trim() === entryName)
      || null;
    return String(entry?.taggar?.typ?.[0] || '').trim();
  }, name);
  if (!category) throw new Error(`Unable to resolve the index category for ${name}.`);

  const categories = page.locator('#lista details[data-cat]');
  const categoryIndex = await categories.evaluateAll(
    (details, categoryName) => details.findIndex(detail => detail.dataset.cat === categoryName),
    category
  );
  if (categoryIndex < 0) throw new Error(`Unable to find the index category ${category}.`);

  const details = categories.nth(categoryIndex);
  if (!(await details.evaluate(element => element.open))) {
    await details.locator(':scope > summary').click();
  }
  await expect.poll(async () => page.locator('#lista li.entry-card:visible, #lista li.card:visible').evaluateAll(
    (cards, entryName) => cards.filter(card => String(card?.dataset?.name || '').trim() === entryName).length,
    name
  )).toBeGreaterThan(0);
}

async function clickProfileTarget(page, kind) {
  return page.evaluate((targetKind) => {
    const listTypes = new Set(['Förmåga', 'Basförmåga', 'Särdrag', 'Fördel', 'Nackdel', 'Mystisk kraft', 'Ritual']);
    const preferredName = targetKind === 'inventory' ? 'Dubbel ringbrynja' : 'Akrobatik';
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
      return {
        button,
        name: name || entry?.namn || '',
        types,
        isInventory: typeof window.isInv === 'function' ? Boolean(window.isInv(entry)) : false,
        isEmployment: typeof window.isEmployment === 'function' ? Boolean(window.isEmployment(entry)) : false,
        isService: typeof window.isService === 'function' ? Boolean(window.isService(entry)) : false,
        isHidden: typeof window.storeHelper?.isSearchHiddenEntry === 'function'
          ? Boolean(window.storeHelper.isSearchHiddenEntry(entry))
          : false,
        isArtifact: types.some((type) => ['Artefakt', 'Lägre Artefakt'].includes(String(type || '').trim()))
      };
    });

    const preferred = visible.find((item) => item.name === preferredName);
    const fallback = targetKind === 'inventory'
      ? visible.find((item) => item.isInventory && !item.isHidden && !item.isArtifact) || visible.find((item) => item.isInventory)
      : visible.find((item) => (
        !item.isInventory
        && !item.isEmployment
        && !item.isService
        && item.types.some((type) => listTypes.has(String(type || '').trim()))
      ));
    const target = preferred || fallback || null;
    if (!target?.button) return null;
    target.button.click();
    return target.name;
  }, kind);
}

test('add-item profiling records staged breakdown for inventory adds', async ({ page }) => {
  await seedProfileStore(page);

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
    window.__inventoryAddPriorityEvents = [];
    window.__inventoryAddPriorityUnsubscribe?.();
    window.__inventoryAddPriorityUnsubscribe = window.symbaroumOffline?.subscribe?.(detail => {
      if (detail.type === 'OFFLINE_RULES_PRIORITY' && detail.reason === 'catalog-add') {
        window.__inventoryAddPriorityEvents.push({
          status: detail.status,
          active: detail.active
        });
      }
    });
  });

  await revealIndexTarget(page, 'Dubbel ringbrynja');
  const clicked = await clickProfileTarget(page, 'inventory');
  expect(clicked).toBeTruthy();

  const scenario = await readCompletedAddScenario(page);
  expect(scenario?.detail?.entry).toBeTruthy();
  expect(scenario?.detail?.profile).toBeTruthy();
  expect(scenario?.detail?.branch).toBe('inventory');
  expect(scenario?.detail?.renderMode).toBe('incremental');
  const priorityEvents = await page.evaluate(() => window.__inventoryAddPriorityEvents || []);
  expect(priorityEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'paused' }),
    expect.objectContaining({ status: 'resumed', active: 0 })
  ]));

  const checkpointNames = (scenario?.detail?.profile?.checkpoints || []).map((entry) => entry.name);
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);

  expect(checkpointNames).toEqual(expect.arrayContaining([
    'click-handler-start',
    'dexie-flush-scheduled',
    'post-render-paint-complete'
  ]));
  expect(stageNames).toEqual(expect.arrayContaining([
    'form-serialization',
    'store-mutation',
    'common-commit',
    'inventory-aggregate-work',
    'sort-group-rebuild',
    'dom-patch'
  ]));
  expect(stageNames).not.toContain('worker-round-trip');
  expect(stageNames).not.toContain('derived-totals-recompute');
  expect(stageNames).not.toContain('full-list-render');

  const stages = scenario?.detail?.profile?.stages || [];
  const indexDomPatches = stages.filter((entry) => entry.name === 'dom-patch' && entry.detail?.surface === 'index');
  expect(indexDomPatches).toHaveLength(0);
});

test('add-item profiling records incremental list adds without a full index rerender', async ({ page }) => {
  await seedProfileStore(page);

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });

  await revealIndexTargetByCategory(page, 'Akrobatik');
  const clicked = await clickProfileTarget(page, 'list');
  expect(clicked).toBe('Akrobatik');

  const scenario = await readCompletedAddScenario(page);
  expect(scenario?.detail?.entry).toBeTruthy();
  expect(scenario?.detail?.profile).toBeTruthy();
  expect(scenario?.detail?.branch).toBe('list');
  expect(scenario?.detail?.renderMode).toBe('incremental');
  expect(scenario?.detail?.reconciliationMode).toBe('incremental');

  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);
  expect(stageNames).toEqual(expect.arrayContaining([
    'form-serialization',
    'store-mutation',
    'list-delta-analysis',
    'rule-entry-grants',
    'rule-conflicts',
    'entry-metadata',
    'snapshot-rules',
    'inventory-grants',
    'money-grants',
    'entry-digests',
    'mutation-persistence-schedule',
    'worker-round-trip',
    'derived-totals-recompute'
  ]));
  expect(stageNames).not.toContain('sort-group-rebuild');
  expect(stageNames).not.toContain('dom-patch');
  expect(stageNames).not.toContain('full-list-render');
});

test('adding from an active search patches the result card without rebuilding the filtered catalog', async ({ page }) => {
  await seedProfileStore(page);

  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.evaluate(() => {
    window.symbaroumPerf?.clearHistory?.();
  });

  await revealIndexTarget(page, 'Akrobatik');
  const clicked = await clickProfileTarget(page, 'list');
  expect(clicked).toBe('Akrobatik');

  const scenario = await readCompletedAddScenario(page);
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);
  expect(scenario?.detail?.renderMode).toBe('incremental');
  expect(scenario?.detail?.reconciliationMode).toBe('incremental');
  expect(stageNames).not.toContain('full-list-render');
  await expect(page.locator('#lista li.entry-card[data-name="Akrobatik"] button[data-act="rem"]')).toBeVisible();
});

test('250-list/250-inventory character keeps direct-add mobile p95 within 300ms', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium-only test capability.');
  test.setTimeout(180_000);
  const samples = await collectCatalogAddSamples(browser, 'direct');
  expect(samples).toHaveLength(PERFORMANCE_SAMPLE_COUNT);
  expect(
    percentile(samples.map(sample => sample.duration), 0.95),
    `direct-add samples: ${formatCatalogAddSamples(samples)}`
  ).toBeLessThanOrEqual(DIRECT_ADD_BUDGET_MS);
});

test('250-list/250-inventory character keeps choice-add mobile p95 within 750ms', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium-only test capability.');
  test.setTimeout(180_000);
  const samples = await collectCatalogAddSamples(browser, 'choice');
  expect(samples).toHaveLength(PERFORMANCE_SAMPLE_COUNT);
  expect(
    percentile(samples.map(sample => sample.duration), 0.95),
    `choice-add samples: ${formatCatalogAddSamples(samples)}`
  ).toBeLessThanOrEqual(CHOICE_ADD_BUDGET_MS);
});

test('installed-PWA rule warming keeps direct-add mobile p95 within 300ms', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium-only test capability.');
  test.setTimeout(240_000);
  const samples = await collectCatalogAddSamples(browser, 'direct', { rulesWarming: true });
  expect(samples).toHaveLength(PERFORMANCE_SAMPLE_COUNT);
  expect(
    percentile(samples.map(sample => sample.duration), 0.95),
    `controlled-PWA warming direct-add samples: ${formatCatalogAddSamples(samples)}`
  ).toBeLessThanOrEqual(DIRECT_ADD_BUDGET_MS);
});

test('installed-PWA rule warming keeps choice-add mobile p95 within 750ms', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling is a Chromium-only test capability.');
  test.setTimeout(240_000);
  const samples = await collectCatalogAddSamples(browser, 'choice', { rulesWarming: true });
  expect(samples).toHaveLength(PERFORMANCE_SAMPLE_COUNT);
  expect(
    percentile(samples.map(sample => sample.duration), 0.95),
    `controlled-PWA warming choice-add samples: ${formatCatalogAddSamples(samples)}`
  ).toBeLessThanOrEqual(CHOICE_ADD_BUDGET_MS);
});
