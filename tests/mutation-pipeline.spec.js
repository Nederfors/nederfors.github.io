import { expect, test } from '@playwright/test';

const CHAR_ID = 'mutation-pipeline-char';
const STANDARD_FOLDER_ID = 'fd-standard';

const metaState = {
  current: CHAR_ID,
  characters: [
    { id: CHAR_ID, name: 'Mutation Hero', folderId: STANDARD_FOLDER_ID }
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

const characterState = {
  list: [],
  inventory: [],
  custom: [],
  notes: {},
  money: { daler: 10, skilling: 0, 'örtegar': 0 }
};

async function seedProfileStore(page) {
  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__mutationPipelineSeeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__mutationPipelineSeeded', '1');
  }, { metaState, characterState });
}

async function waitForApp(page, route, selector) {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator(selector).waitFor({ state: 'visible' });
}

async function readLatestScenario(page, name, status = 'completed') {
  await page.waitForFunction(({ name, status }) => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    return Boolean((snapshot?.scenarios || []).some((entry) => (
      entry.name === name && (!status || entry.status === status)
    )));
  }, { name, status });

  return page.evaluate(({ name, status }) => {
    const snapshot = window.symbaroumPerf?.getSnapshot?.();
    const matches = (snapshot?.scenarios || []).filter((entry) => (
      entry.name === name && (!status || entry.status === status)
    ));
    return matches[matches.length - 1] || null;
  }, { name, status });
}

async function clearPerfHistory(page, options = {}) {
  await page.evaluate(({ awaitFlush, levelChanges }) => {
    window.__symbaroumPerfAwaitFlush = Boolean(awaitFlush);
    window.__symbaroumPerfCaptureLevelChanges = Boolean(levelChanges);
    window.symbaroumPerf?.clearHistory?.();
  }, {
    awaitFlush: options.awaitFlush !== false,
    levelChanges: Boolean(options.levelChanges)
  });
}

async function setDialogOverrides(page, options = {}) {
  await page.evaluate(({ confirmResult, alertResult }) => {
    window.__testDialogMessages = [];
    window.alertPopup = async (message) => {
      window.__testDialogMessages.push({ type: 'alert', message: String(message || '') });
      return alertResult;
    };
    window.confirmPopup = async (message) => {
      window.__testDialogMessages.push({ type: 'confirm', message: String(message || '') });
      return confirmResult;
    };
    window.openDialog = async (message) => {
      window.__testDialogMessages.push({ type: 'dialog', message: String(message || '') });
      return confirmResult;
    };
  }, {
    confirmResult: options.confirmResult !== false,
    alertResult: options.alertResult !== false
  });
}

async function seedNamedEntries(page, specs) {
  return page.evaluate(async (specs) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const nextList = specs.map((spec, index) => {
      const entry = window.lookupEntry?.({ name: spec.name })
        || (window.DB || []).find((candidate) => String(candidate?.namn || '').trim() === String(spec.name || '').trim())
        || null;
      if (!entry) throw new Error(`Missing entry: ${spec.name}`);
      const clone = JSON.parse(JSON.stringify(entry));
      if (spec.level) clone.nivå = spec.level;
      if (Object.prototype.hasOwnProperty.call(spec, 'trait')) clone.trait = spec.trait;
      if (Object.prototype.hasOwnProperty.call(spec, 'race')) clone.race = spec.race;
      if (Object.prototype.hasOwnProperty.call(spec, 'form')) clone.form = spec.form;
      clone.__uid = `mutation-entry-${Date.now()}-${index}`;
      return clone;
    });
    window.storeHelper.setCurrentList(activeStore, nextList);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-seed-named-entries' });
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
    return nextList.map((entry) => ({
      name: entry.namn,
      level: entry.nivå || '',
      trait: entry.trait || '',
      race: entry.race || '',
      form: entry.form || ''
    }));
  }, specs);
}

async function prepareCharacterLevelCandidate(page, mode = 'fast') {
  return page.evaluate(async ({ mode }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const isListEntry = (candidate) => (
      candidate
      && !window.isInv?.(candidate)
      && !window.isEmployment?.(candidate)
      && !window.isService?.(candidate)
    );
    const hasMultiLevels = (candidate) => Object.keys(candidate?.nivåer || {}).length > 1;
    const hasChoiceRule = (candidate) => Array.isArray(candidate?.taggar?.regler?.val) && candidate.taggar.regler.val.length > 0;
    const hasGrantRules = (candidate) => Array.isArray(candidate?.taggar?.regler?.ger) && candidate.taggar.regler.ger.length > 0;
    const levelKeys = (candidate) => Object.keys(candidate?.nivåer || {}).filter(Boolean);

    const findBlockedCandidate = () => entries.find((candidate) => {
      if (!isListEntry(candidate) || !hasMultiLevels(candidate)) return false;
      const [fromLevel, toLevel] = levelKeys(candidate);
      if (!fromLevel || !toLevel || fromLevel === toLevel) return false;
      const before = [{
        ...JSON.parse(JSON.stringify(candidate)),
        nivå: fromLevel,
        __uid: 'blocked-level-test'
      }];
      const next = {
        ...JSON.parse(JSON.stringify(candidate)),
        nivå: toLevel,
        __uid: 'blocked-level-test'
      };
      const reasons = window.rulesHelper?.getMissingRequirementReasonsForCandidate?.(next, before, { level: toLevel }) || [];
      return reasons.length > 0;
    }) || null;

    const entry = mode === 'structural'
      ? (window.lookupEntry?.({ name: 'Hamnskifte' })
        || entries.find((candidate) => isListEntry(candidate) && hasMultiLevels(candidate) && hasGrantRules(candidate))
        || null)
      : mode === 'blocked'
        ? findBlockedCandidate()
        : (window.lookupEntry?.({ name: 'Akrobatik' })
          || entries.find((candidate) => (
            isListEntry(candidate)
            && hasMultiLevels(candidate)
            && !hasGrantRules(candidate)
            && !hasChoiceRule(candidate)
          ))
          || null);

    if (!entry) throw new Error(`Unable to resolve a ${mode} level-change candidate.`);

    const levels = levelKeys(entry);
    const fromLevel = mode === 'structural'
      ? (levels.find((level) => level === 'Novis') || levels[0] || entry.nivå || '')
      : (levels[0] || entry.nivå || '');
    const toLevel = mode === 'structural'
      ? (levels.find((level) => level === 'Gesäll') || levels[1] || levels[0] || entry.nivå || '')
      : (levels[1] || levels[0] || entry.nivå || '');
    if (!fromLevel || !toLevel || fromLevel === toLevel) {
      throw new Error(`Entry ${entry.namn} does not expose a usable ${mode} level path.`);
    }

    const nextList = [{
      ...JSON.parse(JSON.stringify(entry)),
      nivå: fromLevel,
      __uid: `character-level-${mode}-${Date.now()}`
    }];
    window.storeHelper.setCurrentList(activeStore, nextList);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: `test-character-level-${mode}` });
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
      mode,
      name: entry.namn,
      fromLevel,
      toLevel
    };
  }, { mode });
}

async function revealIndexEntry(page, name) {
  const visibleCardCount = await page.locator('#lista li.entry-card:visible, #lista li.card:visible').evaluateAll(
    (cards, entryName) => cards.filter((card) => String(card?.dataset?.name || '').trim() === String(entryName || '').trim()).length,
    name
  );
  if (visibleCardCount > 0) return;

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

  const visibleCards = details.locator('li.entry-card:visible, li.card:visible');
  const categoryLoadMore = page.locator('#lista button[data-load-more-cat]:visible');
  await expect.poll(async () => {
    const targetCount = await visibleCards.evaluateAll(
      (cards, entryName) => cards.filter(card => String(card?.dataset?.name || '').trim() === entryName).length,
      name
    );
    const loadMoreCount = await categoryLoadMore.evaluateAll(
      (buttons, categoryName) => buttons.filter(button => button.dataset.loadMoreCat === categoryName).length,
      category
    );
    return targetCount + loadMoreCount;
  }).toBeGreaterThan(0);

  for (let batch = 0; batch < 20; batch += 1) {
    const targetCount = await visibleCards.evaluateAll(
      (cards, entryName) => cards.filter(card => String(card?.dataset?.name || '').trim() === entryName).length,
      name
    );
    if (targetCount > 0) return;

    const loadMoreIndex = await categoryLoadMore.evaluateAll(
      (buttons, categoryName) => buttons.findIndex(button => button.dataset.loadMoreCat === categoryName),
      category
    );
    if (loadMoreIndex < 0) break;

    const previousCount = await visibleCards.count();
    await categoryLoadMore.nth(loadMoreIndex).evaluate(button => button.click());
    await expect.poll(() => visibleCards.count()).toBeGreaterThan(previousCount);
  }

  throw new Error(`Unable to reveal ${name} in the index category ${category}.`);
}

async function setIndexCardLevel(page, name, level) {
  await revealIndexEntry(page, name);
  const changed = await page.evaluate(({ name, level }) => {
    const card = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    if (!card) return false;
    const select = card.querySelector('select.level');
    if (!select) return false;
    select.value = level;
    window.entryCardFactory?.syncLevelControl?.(select);
    return true;
  }, { name, level });

  if (!changed) throw new Error(`Unable to set index level for ${name}.`);
}

async function clickIndexAdd(page, name) {
  const clicked = await page.evaluate(({ name }) => {
    const card = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    if (!card) return false;
    const button = card.querySelector('button[data-act="add"]');
    if (!button) return false;
    button.click();
    return true;
  }, { name });

  if (!clicked) throw new Error(`Unable to click add for ${name}.`);
}

async function choosePopupOption(page, label) {
  await page.locator('#choicePopup').waitFor({ state: 'visible' });
  const clicked = await page.evaluate(({ label }) => {
    const popup = document.getElementById('choicePopup');
    if (!popup) return false;
    const optionRoot = popup.querySelector('#choiceOpts') || popup;
    const radio = [...optionRoot.querySelectorAll('.db-radio')]
      .find((candidate) => String(candidate.textContent || '').trim() === String(label || '').trim()) || null;
    if (radio) {
      const input = radio.querySelector('input[type="radio"]');
      if (!input || input.disabled) return false;
      input.checked = true;
      input.click();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const button = [...optionRoot.querySelectorAll('button')]
      .find((candidate) => !candidate.disabled && String(candidate.textContent || '').trim() === String(label || '').trim()) || null;
    if (!button) return false;
    button.click();
    return true;
  }, { label });

  if (!clicked) throw new Error(`Unable to pick popup option ${label}.`);
}

async function changeCardLevel(page, rootSelector, name, value) {
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

  if (!changed) throw new Error(`Unable to change level for ${name}.`);
}

async function readListEntries(page, name) {
  return page.evaluate(({ name }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const list = window.storeHelper.getCurrentList(activeStore);
    return list
      .filter((entry) => !name || String(entry?.namn || '').trim() === String(name || '').trim())
      .map((entry) => ({
        name: entry.namn,
        level: entry.nivå || '',
        trait: entry.trait || '',
        race: entry.race || '',
        form: entry.form || '',
        manualRuleOverride: Boolean(entry.manualRuleOverride)
      }));
  }, { name });
}

async function readLevelControlValue(page, rootSelector, name) {
  return page.evaluate(({ rootSelector, name }) => {
    const root = document.querySelector(rootSelector);
    const card = root
      ? [...root.querySelectorAll('li.entry-card, li.card')]
          .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null
      : null;
    return card?.querySelector('select.level')?.value || '';
  }, { rootSelector, name });
}

function visibleEntryCard(page, rootSelector, name) {
  return page.locator(`${rootSelector} li.entry-card[data-name="${name}"], ${rootSelector} li.card[data-name="${name}"]`).first();
}

async function revealCharacterEntry(page, name) {
  const card = visibleEntryCard(page, '#valda', name);
  await expect(card).toBeAttached();

  const category = card.locator('xpath=ancestor::details[1]');
  if (await category.count() && !await category.evaluate(details => details.open)) {
    await category.locator(':scope > summary').click();
  }

  await expect(card).toBeVisible();
  return card;
}

async function resolveCascadeDialog(page, { keepGenerated }) {
  const dialog = page.locator('#daub-dialog-modal');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.db-modal__body')).toContainText('automatiskt tillagda förmågor');

  if (keepGenerated) {
    await dialog.locator('[data-dialog-action="ok"]').click();
  } else {
    await page.keyboard.press('Escape');
  }

  await expect(dialog).toBeHidden();
}

async function seedInventoryRow(page, { id, name, qty = 1 }) {
  await page.evaluate(async ({ id, name, qty }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.storeHelper.setInventory(activeStore, [{
      id,
      name,
      qty,
      gratis: 0,
      gratisKval: [],
      removedKval: []
    }]);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-seed-inventory-row' });
    window.invUtil?.renderInventory?.();
  }, { id, name, qty });
}

async function readInventoryRows(page) {
  return page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return window.storeHelper.getInventory(activeStore).map(row => ({
      id: row.id || '',
      name: row.name || row.namn || '',
      qty: Number(row.qty) || 0
    }));
  });
}

async function clickInventoryAction(page, name, action) {
  const card = page.locator('#invList li.entry-card, #invList li.card')
    .filter({ has: page.locator(`[data-name="${name}"]`) });
  const directCard = page.locator(`#invList li[data-name="${name}"]`).first();
  const target = (await directCard.count()) ? directCard : card.first();
  await expect(target).toBeVisible();
  await target.locator(`button[data-act="${action}"]`).click();
}

test('a normal ability can be added, levelled, observed, and reloaded through user controls', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await clearPerfHistory(page, { awaitFlush: true });

  const toolbar = page.locator('shared-toolbar');
  await revealIndexEntry(page, 'Akrobatik');

  const indexCard = visibleEntryCard(page, '#lista', 'Akrobatik');
  await expect(indexCard).toBeVisible();
  await expect(indexCard.locator('select.level')).toHaveValue('Novis');
  await expect(indexCard.locator('button[data-act="add"]')).toBeVisible();
  await indexCard.locator('button[data-act="add"]').click();

  const addScenario = await readLatestScenario(page, 'add-item-to-character');
  expect(addScenario?.detail?.entry).toBe('Akrobatik');
  expect(addScenario?.detail?.branch).toBe('list');
  await expect.poll(async () => await readListEntries(page, 'Akrobatik')).toEqual([
    expect.objectContaining({ name: 'Akrobatik', level: 'Novis' })
  ]);
  await expect(indexCard.locator('button[data-act="rem"]')).toBeVisible();

  await toolbar.locator('#characterLink').click();
  await page.waitForFunction(() => (
    document.body.dataset.role === 'character'
    && document.getElementById('view-root')?.getAttribute('aria-busy') === 'false'
  ));

  const characterCard = await revealCharacterEntry(page, 'Akrobatik');
  const levelSelect = characterCard.locator('select.level');
  await expect(levelSelect).toBeVisible();
  await expect(levelSelect).toHaveValue('Novis');

  await clearPerfHistory(page, { awaitFlush: true, levelChanges: true });
  await levelSelect.selectOption('Gesäll');
  const levelScenario = await readLatestScenario(page, 'character-level-change');
  expect(levelScenario?.detail?.entry).toBe('Akrobatik');
  expect(levelScenario?.detail?.renderMode).toBe('targeted');

  await expect(levelSelect).toHaveValue('Gesäll');
  await expect.poll(async () => await readListEntries(page, 'Akrobatik')).toEqual([
    expect.objectContaining({ name: 'Akrobatik', level: 'Gesäll' })
  ]);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const reloadedCard = await revealCharacterEntry(page, 'Akrobatik');
  await expect(reloadedCard.locator('select.level')).toHaveValue('Gesäll');
  await expect.poll(async () => await readListEntries(page, 'Akrobatik')).toEqual([
    expect.objectContaining({ name: 'Akrobatik', level: 'Gesäll' })
  ]);
});

test('index popup adds close the choice popup before store mutation and stay on the targeted refresh path', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await clearPerfHistory(page, { awaitFlush: true });

  await setIndexCardLevel(page, 'Monsterlärd', 'Gesäll');
  await clickIndexAdd(page, 'Monsterlärd');
  await choosePopupOption(page, 'Bestar');

  const scenario = await readLatestScenario(page, 'add-item-to-character');
  const checkpoint = (scenario?.detail?.profile?.checkpoints || []).find((entry) => entry.name === 'popup-close');
  const storeStage = (scenario?.detail?.profile?.stages || []).find((entry) => entry.name === 'store-mutation');
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);

  expect(scenario?.detail?.entry).toBe('Monsterlärd');
  expect(scenario?.detail?.branch).toBe('list');
  expect(scenario?.detail?.renderMode).toBe('incremental');
  expect(checkpoint).toBeTruthy();
  expect(storeStage).toBeTruthy();
  expect(checkpoint?.atAbs).toBeLessThanOrEqual(storeStage?.startedAtAbs || Infinity);
  expect(stageNames).toEqual(expect.arrayContaining([
    'store-mutation',
    'pending-choice-resolution',
    'targeted-ui-refresh',
    'persistence-flush'
  ]));
  expect(stageNames).not.toContain('full-list-render');

  await expect.poll(async () => {
    const entries = await readListEntries(page, 'Monsterlärd');
    return entries.find((entry) => entry.trait === 'Bestar')?.level || '';
  }).toBe('Gesäll');
});

test('choice-bound inventory variants batch identical quantities, preserve distinct choices, and reload', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await setDialogOverrides(page, { confirmResult: true });
  await clearPerfHistory(page, { awaitFlush: true });
  await revealIndexEntry(page, 'Formelsigill (Novis)');

  const identityChecks = await page.evaluate(() => {
    const entry = window.lookupEntry?.({ name: 'Formelsigill (Novis)' });
    const left = {
      id: entry.id,
      name: entry.namn,
      qty: 1,
      trait: 'Anatema',
      kvaliteter: ['Bräcklig', 'Diskret'],
      boundData: { beta: 2, alpha: 1 }
    };
    const reordered = {
      boundData: { alpha: 1, beta: 2 },
      kvaliteter: ['Diskret', 'Bräcklig'],
      trait: 'Anatema',
      qty: 9,
      name: entry.namn,
      id: entry.id
    };
    const otherChoice = { ...left, trait: 'Andeplåga' };
    return {
      stableAcrossPropertyOrder: window.invUtil.getInventoryVariantIdentity(left, entry)
        === window.invUtil.getInventoryVariantIdentity(reordered, entry),
      separatesChoice: window.invUtil.getInventoryVariantIdentity(left, entry)
        !== window.invUtil.getInventoryVariantIdentity(otherChoice, entry),
      stackableAcrossQuantity: window.invUtil.canStackRows(left, reordered, entry),
      rejectsDifferentChoice: window.invUtil.canStackRows(left, otherChoice, entry)
    };
  });
  expect(identityChecks).toEqual({
    stableAcrossPropertyOrder: true,
    separatesChoice: true,
    stackableAcrossQuantity: true,
    rejectsDifferentChoice: false
  });

  await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.__variantBatchProbe = {
      initialDerivedVersion: window.storeHelper.getDerivedVersion(activeStore),
      refreshes: []
    };
    const pipeline = window.symbaroumMutationPipeline;
    const originalSchedule = pipeline.scheduleCharacterRefresh;
    window.__variantBatchProbe.restore = () => { pipeline.scheduleCharacterRefresh = originalSchedule; };
    pipeline.scheduleCharacterRefresh = options => {
      window.__variantBatchProbe.refreshes.push({
        source: options.source || '',
        invalidates: options.invalidates || [],
        topology: options.topology || ''
      });
      return originalSchedule(options);
    };
  });

  const addChoice = async choice => {
    const completedBefore = await page.evaluate(() => (
      window.symbaroumPerf?.getSnapshot?.()?.scenarios || []
    ).filter(entry => entry.name === 'add-item-to-character' && entry.status === 'completed').length);
    await clickIndexAdd(page, 'Formelsigill (Novis)');
    await choosePopupOption(page, choice);
    await expect.poll(() => page.evaluate(() => (
      window.symbaroumPerf?.getSnapshot?.()?.scenarios || []
    ).filter(entry => entry.name === 'add-item-to-character' && entry.status === 'completed').length)).toBeGreaterThan(completedBefore);
    await page.evaluate(() => window.symbaroumMutationPipeline.waitForCharacterRefresh());
  };
  for (let index = 0; index < 5; index += 1) await addChoice('Anatema');
  await addChoice('Andeplåga');

  const acceptedScenario = await readLatestScenario(page, 'add-item-to-character');
  const acceptedStages = (acceptedScenario?.detail?.profile?.stages || []).map(stage => stage.name);
  expect(acceptedStages.filter(stage => stage === 'common-commit')).toHaveLength(1);
  expect(acceptedStages).not.toContain('sort-group-rebuild');
  expect(acceptedStages).not.toContain('inventory-render');

  const readVariants = () => page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    return window.storeHelper.getInventory(activeStore)
      .filter(row => row.id === 'l13')
      .map(row => ({ trait: row.trait || '', qty: Number(row.qty) || 0 }))
      .sort((left, right) => left.trait.localeCompare(right.trait, 'sv'));
  });
  await expect.poll(readVariants).toEqual([
    { trait: 'Anatema', qty: 5 },
    { trait: 'Andeplåga', qty: 1 }
  ]);

  const beforeCancelled = await page.evaluate(() => JSON.stringify(
    window.storeHelper.getInventory(typeof store === 'object' && store ? store : window.storeHelper.load())
  ));
  await clickIndexAdd(page, 'Formelsigill (Novis)');
  await page.locator('#choicePopup').waitFor({ state: 'visible' });
  await page.locator('#choicePopup #choiceClose').click();
  await expect(page.locator('#choicePopup')).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(
    window.storeHelper.getInventory(typeof store === 'object' && store ? store : window.storeHelper.load())
  ))).toBe(beforeCancelled);

  await setDialogOverrides(page, { confirmResult: false });
  await clickIndexAdd(page, 'Formelsigill (Novis)');
  await choosePopupOption(page, 'Anatema');
  await expect.poll(() => page.evaluate(() => JSON.stringify(
    window.storeHelper.getInventory(typeof store === 'object' && store ? store : window.storeHelper.load())
  ))).toBe(beforeCancelled);

  const probe = await page.evaluate(async () => {
    await window.symbaroumMutationPipeline.waitForCharacterRefresh();
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const result = {
      derivedVersion: window.storeHelper.getDerivedVersion(activeStore),
      initialDerivedVersion: window.__variantBatchProbe.initialDerivedVersion,
      refreshes: window.__variantBatchProbe.refreshes
    };
    window.__variantBatchProbe.restore();
    return result;
  });
  expect(probe.derivedVersion).toBe(probe.initialDerivedVersion);
  expect(probe.refreshes).toHaveLength(6);
  probe.refreshes.forEach(refresh => {
    expect(refresh.source).toBe('index-inventory-variant-add');
    expect(refresh.invalidates).toEqual(expect.arrayContaining([
      'inventory.totals',
      'summary.economy',
      'persistence'
    ]));
  });

  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'choice-variant-batch-test' }));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(readVariants).toEqual([
    { trait: 'Anatema', qty: 5 },
    { trait: 'Andeplåga', qty: 1 }
  ]);

  await page.goto('/#/inventory');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#invList').waitFor({ state: 'visible' });
  const anatemaCard = page.locator('#invList li[data-name="Formelsigill (Novis)"][data-trait="Anatema"]').first();
  await expect(anatemaCard).toBeVisible();
  await anatemaCard.locator('button[data-act="sub"]').click();
  await expect.poll(readVariants).toEqual([
    { trait: 'Anatema', qty: 4 },
    { trait: 'Andeplåga', qty: 1 }
  ]);
  await anatemaCard.locator('button[data-act="del"]').click();
  await expect.poll(readVariants).toEqual([{ trait: 'Andeplåga', qty: 1 }]);

  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'choice-variant-removal-test' }));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(readVariants).toEqual([{ trait: 'Andeplåga', qty: 1 }]);
});

test('a non-stackable choice inventory variant invalidates rule domains once', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await setDialogOverrides(page, { confirmResult: true });
  await clearPerfHistory(page, { awaitFlush: true });
  await revealIndexEntry(page, 'Djurmask');
  await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.__ruleVariantProbe = {
      version: window.storeHelper.getDerivedVersion(activeStore),
      refreshes: []
    };
    const pipeline = window.symbaroumMutationPipeline;
    const originalSchedule = pipeline.scheduleCharacterRefresh;
    window.__ruleVariantProbe.restore = () => { pipeline.scheduleCharacterRefresh = originalSchedule; };
    pipeline.scheduleCharacterRefresh = options => {
      window.__ruleVariantProbe.refreshes.push({
        source: options.source || '',
        invalidates: options.invalidates || []
      });
      return originalSchedule(options);
    };
  });

  await clickIndexAdd(page, 'Djurmask');
  await choosePopupOption(page, 'Stark');
  const scenario = await readLatestScenario(page, 'add-item-to-character');
  await page.evaluate(() => window.symbaroumMutationPipeline.waitForCharacterRefresh());

  const result = await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const row = window.storeHelper.getInventory(activeStore).find(candidate => candidate.id === 'l9');
    const output = {
      row: row ? { trait: row.trait || '', qty: Number(row.qty) || 0 } : null,
      version: window.storeHelper.getDerivedVersion(activeStore),
      initialVersion: window.__ruleVariantProbe.version,
      refreshes: window.__ruleVariantProbe.refreshes
    };
    window.__ruleVariantProbe.restore();
    return output;
  });
  expect(result.row).toEqual({ trait: 'Stark', qty: 1 });
  expect(result.version).toBe(result.initialVersion + 1);
  expect(result.refreshes).toHaveLength(1);
  expect(result.refreshes[0]).toEqual({
    source: 'index-inventory-variant-add',
    invalidates: expect.arrayContaining([
      'inventory.structure',
      'inventory.totals',
      'traits',
      'combat',
      'effects',
      'summary',
      'persistence'
    ])
  });
  const stageNames = (scenario?.detail?.profile?.stages || []).map(stage => stage.name);
  expect(stageNames.filter(stage => stage === 'common-commit')).toHaveLength(1);
  expect(stageNames).not.toContain('sort-group-rebuild');
  expect(stageNames).not.toContain('inventory-render');

  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'rule-choice-variant-test' }));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(() => page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const row = window.storeHelper.getInventory(activeStore).find(candidate => candidate.id === 'l9');
    return row ? { trait: row.trait || '', qty: Number(row.qty) || 0 } : null;
  })).toEqual({ trait: 'Stark', qty: 1 });
});

test('character repeated additions hold foreground catalog priority', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await seedNamedEntries(page, [{
    name: 'Arkivarie'
  }]);
  await page.evaluate(() => {
    window.__characterAddPriorityEvents = [];
    window.__characterAddPriorityUnsubscribe?.();
    window.__characterAddPriorityUnsubscribe = window.symbaroumOffline?.subscribe?.(detail => {
      if (detail.type === 'OFFLINE_RULES_PRIORITY' && detail.reason === 'catalog-add') {
        window.__characterAddPriorityEvents.push({
          status: detail.status,
          active: detail.active
        });
      }
    });
  });

  const card = await revealCharacterEntry(page, 'Arkivarie');
  await expect(card.locator('button[data-act="add"]')).toBeVisible();
  await card.locator('button[data-act="add"]').click();

  await expect.poll(async () => (await readListEntries(page, 'Arkivarie')).length).toBe(2);
  const priorityEvents = await page.evaluate(() => window.__characterAddPriorityEvents || []);
  expect(priorityEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'paused' }),
    expect.objectContaining({ status: 'resumed', active: 0 })
  ]));
});

test('character simple remove uses the shared refresh pipeline and preserves unaffected cards', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await seedNamedEntries(page, [
    { name: 'Akrobatik', level: 'Novis' },
    { name: 'Arkivarie' }
  ]);
  const akrobatik = await revealCharacterEntry(page, 'Akrobatik');
  const arkivarie = await revealCharacterEntry(page, 'Arkivarie');
  await page.evaluate(() => {
    window.__characterRemoveProbe = {
      unaffected: [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
        .find(card => card.dataset.name === 'Arkivarie') || null,
      refreshes: []
    };
    const pipeline = window.symbaroumMutationPipeline;
    const originalSchedule = pipeline.scheduleCharacterRefresh;
    pipeline.scheduleCharacterRefresh = options => {
      window.__characterRemoveProbe.refreshes.push({ source: options.source || '' });
      return originalSchedule(options);
    };
  });

  await akrobatik.locator('button[data-act="del"], button[data-act="rem"]').first().click();
  await expect.poll(async () => await readListEntries(page, 'Akrobatik')).toEqual([]);
  await page.evaluate(() => window.symbaroumMutationPipeline.waitForCharacterRefresh());

  await expect(akrobatik).toHaveCount(0);
  await expect(arkivarie).toBeVisible();
  const result = await page.evaluate(() => ({
    unaffectedPreserved: [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .find(card => card.dataset.name === 'Arkivarie') === window.__characterRemoveProbe.unaffected,
    refreshes: window.__characterRemoveProbe.refreshes
  }));
  expect(result.unaffectedPreserved).toBe(true);
  expect(result.refreshes).toEqual([{ source: 'character-list-remove' }]);
});

test('choice-popup add with replace_existing upgrades the existing Exceptionellt karaktärsdrag entry', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await seedNamedEntries(page, [{
    name: 'Exceptionellt karaktärsdrag',
    level: 'Novis',
    trait: 'Diskret'
  }]);

  await setIndexCardLevel(page, 'Exceptionellt karaktärsdrag', 'Gesäll');
  await clickIndexAdd(page, 'Exceptionellt karaktärsdrag');
  await choosePopupOption(page, 'Diskret');
  await readLatestScenario(page, 'add-item-to-character');

  await expect.poll(async () => {
    const entries = await readListEntries(page, 'Exceptionellt karaktärsdrag');
    const matches = entries.filter((entry) => entry.trait === 'Diskret');
    return {
      count: matches.length,
      level: matches[0]?.level || ''
    };
  }).toEqual({
    count: 1,
    level: 'Gesäll'
  });
});

test('conflict replacement patches known catalog cards without a full catalog render', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await seedNamedEntries(page, [{ name: 'Korruptionskänslig' }]);
  await revealIndexEntry(page, 'Dvärg');
  await clearPerfHistory(page, { awaitFlush: true });

  await clickIndexAdd(page, 'Dvärg');
  const popup = page.locator('#daub-dialog-modal');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.db-modal__body')).toContainText('ersätter');
  await popup.locator('[data-dialog-action="ok"]').click();

  const scenario = await readLatestScenario(page, 'add-item-to-character');
  const stages = (scenario?.detail?.profile?.stages || []).map(stage => stage.name);
  const entries = await readListEntries(page, '');
  expect(entries.some(entry => entry.name === 'Dvärg')).toBe(true);
  expect(entries.some(entry => entry.name === 'Korruptionskänslig')).toBe(false);
  expect(scenario?.detail?.renderMode).toBe('incremental');
  expect(stages.filter(stage => stage === 'common-commit')).toHaveLength(1);
  expect(stages).toContain('targeted-ui-refresh');
  expect(stages).not.toContain('sort-group-rebuild');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  const afterReload = await readListEntries(page, '');
  expect(afterReload.some(entry => entry.name === 'Dvärg')).toBe(true);
  expect(afterReload.some(entry => entry.name === 'Korruptionskänslig')).toBe(false);
});

test('Monsterlärd hides Add and preserves four entries when every specialization is used', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await seedNamedEntries(page, [
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Bestar' },
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Kulturvarelser' },
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Odöda' },
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Styggelser' }
  ]);

  await setIndexCardLevel(page, 'Monsterlärd', 'Gesäll');
  await clearPerfHistory(page, { awaitFlush: true });

  const card = visibleEntryCard(page, '#lista', 'Monsterlärd');
  await expect(card).toBeVisible();
  await expect(card.locator('.count-badge')).toHaveText('×4');
  await expect(card.locator('button[data-act="add"]')).toHaveCount(0);
  expect(await card.locator('button[data-act]').evaluateAll(buttons => (
    buttons.map(button => button.dataset.act)
  ))).toEqual(['del', 'sub']);
  await expect(page.locator('#choicePopup')).toBeHidden();

  const addScenarioCount = await page.evaluate(() => (
    (window.symbaroumPerf?.getSnapshot?.()?.scenarios || [])
      .filter(entry => entry.name === 'add-item-to-character').length
  ));
  expect(addScenarioCount).toBe(0);
  await expect.poll(async () => (await readListEntries(page, 'Monsterlärd')).length).toBe(4);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#lista').waitFor({ state: 'visible' });

  await expect.poll(async () => (await readListEntries(page, 'Monsterlärd')).length).toBe(4);
  await expect(page.locator('#choicePopup')).toBeHidden();
});

test('character fast level changes stay targeted and survive reload', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  const target = await prepareCharacterLevelCandidate(page, 'fast');
  await clearPerfHistory(page, { awaitFlush: true, levelChanges: true });

  await changeCardLevel(page, '#valda', target.name, target.toLevel);
  const scenario = await readLatestScenario(page, 'character-level-change');
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);

  expect(scenario?.detail?.entry).toBe(target.name);
  expect(scenario?.detail?.renderMode).toBe('targeted');
  expect(stageNames).toEqual(expect.arrayContaining([
    'store-mutation',
    'pending-choice-resolution',
    'targeted-ui-refresh',
    'persistence-flush'
  ]));
  expect(stageNames).not.toContain('selection-render');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#valda').waitFor({ state: 'visible' });
  await expect.poll(async () => (
    await readLevelControlValue(page, '#valda', target.name)
  )).toBe(target.toLevel);
});

test('character structural level changes batch granted cards without a full selection render', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  const target = await prepareCharacterLevelCandidate(page, 'structural');
  await clearPerfHistory(page, { awaitFlush: true, levelChanges: true });

  await changeCardLevel(page, '#valda', target.name, target.toLevel);
  const scenario = await readLatestScenario(page, 'character-level-change');
  const entries = await readListEntries(page, '');
  const granted = entries.filter((entry) => entry.name.startsWith('Hamnskifte:'));
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);

  expect(scenario?.detail?.renderMode).toBe('targeted');
  expect(stageNames).toEqual(expect.arrayContaining([
    'store-mutation',
    'pending-choice-resolution',
    'targeted-ui-refresh',
    'persistence-flush'
  ]));
  expect(stageNames).not.toContain('selection-render');
  expect(stageNames.filter(stage => stage === 'common-commit')).toHaveLength(1);
  expect(granted.length).toBeGreaterThan(0);
  for (const entry of granted) {
    await expect(page.locator(`#valda li[data-name="${entry.name}"]`).first()).toBeAttached();
  }
});

test('cascading grant removal patches all affected cards in one committed batch', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await seedNamedEntries(page, [{
    name: 'Hamnskifte',
    level: 'Gesäll'
  }]);
  const grantedBefore = (await readListEntries(page, '')).filter(entry => entry.name.startsWith('Hamnskifte:'));
  expect(grantedBefore.length).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__symbaroumPerfCaptureRemovals = true;
    window.__symbaroumPerfAwaitFlush = true;
    window.symbaroumPerf?.clearHistory?.();
  });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  const sourceCard = await revealCharacterEntry(page, 'Hamnskifte');
  await sourceCard.locator('button[data-act="rem"], button[data-act="del"], button[data-act="sub"]').first().click();
  await resolveCascadeDialog(page, { keepGenerated: false });
  const scenario = await readLatestScenario(page, 'remove-item-from-character');
  expect(pageErrors).toEqual([]);
  const stages = (scenario?.detail?.profile?.stages || []).map(stage => stage.name);
  expect(scenario?.detail?.renderMode).toBe('targeted');
  expect(stages.filter(stage => stage === 'common-commit')).toHaveLength(1);
  expect(stages).toContain('targeted-ui-refresh');
  expect(stages).not.toContain('selection-render');
  expect(await readListEntries(page, '')).toEqual([]);
  await expect(page.locator('#valda li[data-name="Hamnskifte"]')).toHaveCount(0);
  for (const entry of grantedBefore) {
    await expect(page.locator(`#valda li[data-name="${entry.name}"]`)).toHaveCount(0);
  }

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#valda').waitFor({ state: 'visible' });
  expect(await readListEntries(page, '')).toEqual([]);
});

test('character level changes can keep granted entries by accepting the real cleanup dialog', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await seedNamedEntries(page, [{
    name: 'Hamnskifte',
    level: 'Gesäll'
  }]);

  const grantedBefore = (await readListEntries(page, '')).filter((entry) => entry.name.startsWith('Hamnskifte:'));
  expect(grantedBefore.length).toBeGreaterThan(0);

  const hamnskifteCard = await revealCharacterEntry(page, 'Hamnskifte');
  await hamnskifteCard.locator('select.level').selectOption('Novis');
  await resolveCascadeDialog(page, { keepGenerated: true });
  await expect.poll(async () => (
    (await readListEntries(page, 'Hamnskifte')).find((entry) => entry.name === 'Hamnskifte')?.level || ''
  )).toBe('Novis');
  const afterEntries = await readListEntries(page, '');

  grantedBefore.forEach((entry) => {
    expect(afterEntries.some((candidate) => candidate.name === entry.name)).toBe(true);
  });
  expect(afterEntries.find((entry) => entry.name === 'Hamnskifte')?.level).toBe('Novis');
});

test('character level changes remove generated grants by rejecting the real cleanup dialog', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await seedNamedEntries(page, [{
    name: 'Hamnskifte',
    level: 'Gesäll'
  }]);

  const grantedBefore = (await readListEntries(page, '')).filter(entry => entry.name.startsWith('Hamnskifte:'));
  expect(grantedBefore.length).toBeGreaterThan(0);

  const hamnskifteCard = await revealCharacterEntry(page, 'Hamnskifte');
  await hamnskifteCard.locator('select.level').selectOption('Novis');
  await resolveCascadeDialog(page, { keepGenerated: false });
  await expect.poll(async () => {
    const entries = await readListEntries(page, '');
    return {
      level: entries.find(entry => entry.name === 'Hamnskifte')?.level || '',
      generated: entries.filter(entry => entry.name.startsWith('Hamnskifte:')).map(entry => entry.name)
    };
  }).toEqual({ level: 'Novis', generated: [] });

  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-rejected-cascade' }));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#valda').waitFor({ state: 'visible' });

  const afterReload = await readListEntries(page, '');
  expect(afterReload.find(entry => entry.name === 'Hamnskifte')?.level).toBe('Novis');
  expect(afterReload.filter(entry => entry.name.startsWith('Hamnskifte:'))).toEqual([]);
});

test('Inventory UI add, subtract, and remove actions persist their resulting quantities', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/inventory', '#invList');
  await seedInventoryRow(page, { id: 'di1', name: 'Bandage', qty: 1 });

  const card = page.locator('#invList li[data-name="Bandage"]').first();
  await expect(card).toBeVisible();
  const stableRowUid = await page.evaluate(() => (
    window.storeHelper.getInventory(typeof store === 'object' && store ? store : window.storeHelper.load())
      .find(row => row?.name === 'Bandage')?.__uid || ''
  ));
  expect(stableRowUid).toBeTruthy();

  await page.evaluate(() => {
    const card = document.querySelector('#invList li[data-name="Bandage"]');
    window.__quantityFastPathProbe = {
      card,
      plus: card?.querySelector('button[data-standard-slot="plus"]'),
      refreshes: []
    };
    const pipeline = window.symbaroumMutationPipeline;
    const originalSchedule = pipeline.scheduleCharacterRefresh;
    window.__quantityFastPathProbe.restore = () => {
      pipeline.scheduleCharacterRefresh = originalSchedule;
    };
    pipeline.scheduleCharacterRefresh = options => {
      window.__quantityFastPathProbe.refreshes.push({
        invalidates: options.invalidates || [],
        topology: options.topology || ''
      });
      return originalSchedule(options);
    };
  });

  await clickInventoryAction(page, 'Bandage', 'add');
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 2 }]);
  await expect(card.locator('.count-badge')).toHaveText('×2');
  const addFastPath = await page.evaluate(async () => {
    await window.symbaroumMutationPipeline.waitForCharacterRefresh();
    const current = document.querySelector('#invList li[data-name="Bandage"]');
    return {
      cardPreserved: current === window.__quantityFastPathProbe.card,
      plusPreserved: current?.querySelector('button[data-standard-slot="plus"]') === window.__quantityFastPathProbe.plus,
      hasMinus: Boolean(current?.querySelector('button[data-standard-slot="minus"]')),
      refreshes: window.__quantityFastPathProbe.refreshes
    };
  });
  expect(addFastPath).toEqual({
    cardPreserved: true,
    plusPreserved: true,
    hasMinus: true,
    refreshes: [{
      invalidates: ['inventory.row', 'inventory.totals', 'summary.economy'],
      topology: 'row'
    }]
  });
  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'inventory-add-acceptance' }));

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 2 }]);
  expect(await page.evaluate(() => (
    window.storeHelper.getInventory(typeof store === 'object' && store ? store : window.storeHelper.load())
      .find(row => row?.name === 'Bandage')?.__uid || ''
  ))).toBe(stableRowUid);

  await page.evaluate(() => {
    const card = document.querySelector('#invList li[data-name="Bandage"]');
    window.__quantitySubtractProbe = {
      card,
      plus: card?.querySelector('button[data-standard-slot="plus"]')
    };
  });

  await clickInventoryAction(page, 'Bandage', 'sub');
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 1 }]);
  await expect(page.locator('#invList li[data-name="Bandage"] button[data-act="sub"]')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const current = document.querySelector('#invList li[data-name="Bandage"]');
    return {
      cardPreserved: current === window.__quantitySubtractProbe.card,
      plusPreserved: current?.querySelector('button[data-standard-slot="plus"]') === window.__quantitySubtractProbe.plus
    };
  })).toEqual({ cardPreserved: true, plusPreserved: true });
  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'inventory-subtract-acceptance' }));

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 1 }]);

  await clickInventoryAction(page, 'Bandage', 'add');
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 2 }]);
  await clickInventoryAction(page, 'Bandage', 'del');
  await expect.poll(() => readInventoryRows(page)).toEqual([]);
  await expect(page.locator('#invList li[data-name="Bandage"]')).toHaveCount(0);
  await page.evaluate(() => window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'inventory-remove-acceptance' }));

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(() => readInventoryRows(page)).toEqual([]);
});

test('inventory multi-buy batches an existing stable row without a full render or derived refresh', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/inventory', '#invList');
  await seedInventoryRow(page, { id: 'di1', name: 'Bandage', qty: 1 });
  await clearPerfHistory(page, { awaitFlush: true });

  await page.evaluate(() => {
    const perf = window.symbaroumPerf;
    const card = document.querySelector('#invList li[data-name="Bandage"]');
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    window.__multiQuantityProbe = {
      card,
      uid: window.storeHelper.getInventory(activeStore).find(row => row?.name === 'Bandage')?.__uid || '',
      scenarioId: perf?.startScenario?.('test-inventory-multi-buy', { scope: 'inventory' })
    };
    perf?.setFlowContext?.('inventory-mutation', window.__multiQuantityProbe.scenarioId);
  });

  const card = page.locator('#invList li[data-name="Bandage"]').first();
  await card.locator('button[data-act="buyMulti"]').click();
  await page.locator('#buyMultipleInput').fill('5');
  await page.locator('#buyMultipleConfirm').click();
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 6 }]);
  await expect(card.locator('.count-badge')).toHaveText('×6');

  const result = await page.evaluate(async () => {
    await window.symbaroumMutationPipeline?.waitForCharacterRefresh?.();
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-inventory-multi-buy' });
    const perf = window.symbaroumPerf;
    const scenario = perf?.endScenario?.(window.__multiQuantityProbe.scenarioId);
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const row = window.storeHelper.getInventory(activeStore).find(candidate => candidate?.name === 'Bandage');
    return {
      cardPreserved: document.querySelector('#invList li[data-name="Bandage"]') === window.__multiQuantityProbe.card,
      uidPreserved: row?.__uid === window.__multiQuantityProbe.uid,
      availableMoneyText: document.querySelector('shared-toolbar')?.shadowRoot
        ?.querySelector('.dash-unused-out')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      counters: scenario?.detail?.profile?.counters || {}
    };
  });
  expect(result.cardPreserved).toBe(true);
  expect(result.uidPreserved).toBe(true);
  expect(result.availableMoneyText).toContain('9 D · 7 S · 0 Ö');
  expect(result.counters.rootBatches).toBe(1);
  expect(result.counters.commonCommits).toBe(1);
  expect(result.counters.derivedVersions || 0).toBe(0);
  expect(result.counters.persistenceSchedules).toBe(1);
  expect(result.counters.fullInventoryRenders || 0).toBe(0);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await expect.poll(() => readInventoryRows(page)).toEqual([{ id: 'di1', name: 'Bandage', qty: 6 }]);
});

test('character level changes revert when higher-level requirements are blocked', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await setDialogOverrides(page, { confirmResult: false });
  const target = await prepareCharacterLevelCandidate(page, 'blocked');
  await clearPerfHistory(page, { awaitFlush: true, levelChanges: true });

  await changeCardLevel(page, '#valda', target.name, target.toLevel);

  await expect.poll(async () => (
    await readLevelControlValue(page, '#valda', target.name)
  )).toBe(target.fromLevel);

  const scenario = await readLatestScenario(page, 'character-level-change', 'cancelled');
  expect(scenario?.detail?.reason).toBe('requirements-blocked');
});

test('refresh tickets coalesce rapid schedules and wait for promise-returning view hooks', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');

  const result = await page.evaluate(async () => {
    let hookCalls = 0;
    let releaseHook;
    window.symbaroumViewBridge.registerViewHooks('character', {
      refreshSummary: () => {
        hookCalls += 1;
        return new Promise(resolve => {
          releaseHook = resolve;
        });
      }
    });

    const tickets = Array.from({ length: 5 }, () => (
      window.symbaroumMutationPipeline.scheduleCharacterRefresh({
        summary: true,
        source: 'ticket-coalescing-test',
        afterPaint: false
      })
    ));
    while (!releaseHook) await new Promise(resolve => setTimeout(resolve, 0));

    let completed = false;
    const completion = window.symbaroumMutationPipeline
      .waitForCharacterRefresh(tickets.at(-1))
      .then(value => {
        completed = true;
        return value;
      });
    await Promise.resolve();
    const waitedForHook = completed === false;
    releaseHook({ ok: true });
    const refreshResult = await completion;

    return {
      hookCalls,
      waitedForHook,
      generations: tickets.map(ticket => ticket.generation),
      completedGenerations: refreshResult.generations
    };
  });

  expect(result.hookCalls).toBe(1);
  expect(result.waitedForHook).toBe(true);
  expect(result.generations).toEqual([...result.generations].sort((a, b) => a - b));
  expect(new Set(result.generations).size).toBe(5);
  expect(result.completedGenerations).toEqual(result.generations);
});

test('refresh scheduled during an active flush receives a separate consistency barrier', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');

  const result = await page.evaluate(async () => {
    let releaseSummary;
    let releaseEffects;
    let summaryStarted = false;
    let effectsStarted = false;
    window.symbaroumViewBridge.registerViewHooks('character', {
      refreshSummary: () => {
        summaryStarted = true;
        return new Promise(resolve => { releaseSummary = resolve; });
      },
      refreshEffects: () => {
        effectsStarted = true;
        return new Promise(resolve => { releaseEffects = resolve; });
      }
    });

    const first = window.symbaroumMutationPipeline.scheduleCharacterRefresh({
      summary: true,
      source: 'refresh-race-first',
      afterPaint: false
    });
    while (!summaryStarted) await new Promise(resolve => setTimeout(resolve, 0));

    const second = window.symbaroumMutationPipeline.scheduleCharacterRefresh({
      effects: true,
      source: 'refresh-race-second',
      afterPaint: false
    });
    let secondCompleted = false;
    second.consistencyReady.then(() => { secondCompleted = true; });

    releaseSummary();
    const firstResult = await first.consistencyReady;
    const secondWasPending = !secondCompleted;
    while (!effectsStarted) await new Promise(resolve => setTimeout(resolve, 0));
    const secondStillPendingAtHook = !secondCompleted;
    releaseEffects();
    const secondResult = await second.consistencyReady;

    return {
      firstGeneration: first.generation,
      secondGeneration: second.generation,
      firstCompleted: firstResult.generations,
      secondCompleted: secondResult.generations,
      secondWasPending,
      secondStillPendingAtHook
    };
  });

  expect(result.secondGeneration).toBeGreaterThan(result.firstGeneration);
  expect(result.firstCompleted).toEqual([result.firstGeneration]);
  expect(result.secondCompleted).toEqual([result.secondGeneration]);
  expect(result.secondWasPending).toBe(true);
  expect(result.secondStillPendingAtHook).toBe(true);
});

test('superseded derived requests settle from the latest queued version', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');

  const result = await page.evaluate(async () => {
    await window.symbaroumMutationPipeline.waitForCharacterRefresh();
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const worker = window.symbaroumRulesWorker;
    const originalCompute = worker.computeDerivedCharacter;
    let workerCalls = 0;
    worker.computeDerivedCharacter = async () => {
      workerCalls += 1;
      return {
        usedXp: 1,
        totalXp: 9,
        freeXp: 8,
        corruptionStats: { korruptionstroskel: 5, styggelsetroskel: 10 },
        permanentCorruption: 0,
        carryCapacity: 10,
        toughness: 10,
        painThreshold: 5
      };
    };

    try {
      const traits = window.storeHelper.getTraits(activeStore);
      window.storeHelper.setTraits(activeStore, { ...traits, Diskret: traits.Diskret + 1 });
      const firstVersion = window.storeHelper.getDerivedVersion(activeStore);
      const first = window.symbaroumDerivedState.requestCurrentCharacterDerived({
        version: firstVersion,
        afterPaint: true,
        source: 'superseded-derived-first'
      });

      window.storeHelper.setTraits(activeStore, { ...traits, Diskret: traits.Diskret + 2 });
      const secondVersion = window.storeHelper.getDerivedVersion(activeStore);
      const second = window.symbaroumDerivedState.requestCurrentCharacterDerived({
        version: secondVersion,
        afterPaint: true,
        source: 'superseded-derived-second'
      });

      const [firstResult, secondResult] = await Promise.all([first, second]);
      return {
        firstVersion,
        secondVersion,
        workerCalls,
        firstFreeXp: firstResult?.freeXp,
        secondFreeXp: secondResult?.freeXp
      };
    } finally {
      worker.computeDerivedCharacter = originalCompute;
    }
  });

  expect(result.secondVersion).toBe(result.firstVersion + 1);
  expect(result.workerCalls).toBe(1);
  expect(result.firstFreeXp).toBe(8);
  expect(result.secondFreeXp).toBe(8);
});

test('nested character batches union invalidations and run each afterCommit callback once', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');

  const result = await page.evaluate(() => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const callbacks = [];
    const sharedCallback = summary => callbacks.push({ type: 'shared', summary });
    const nestedCallback = summary => callbacks.push({ type: 'nested', summary });
    window.storeHelper.batchCurrentCharacterMutation(activeStore, {
      invalidates: ['traits.base'],
      targets: { traits: ['Diskret'] },
      afterCommit: sharedCallback
    }, () => {
      const traits = window.storeHelper.getTraits(activeStore);
      window.storeHelper.setTraits(activeStore, { ...traits, Diskret: traits.Diskret + 1 }, {
        invalidates: ['summary.traits'],
        targets: { summary: ['Diskret'] },
        afterCommit: sharedCallback
      });
      window.storeHelper.batchCurrentCharacterMutation(activeStore, {
        invalidates: ['traits.stark-derived'],
        targets: { traits: ['Stark'] },
        afterCommit: nestedCallback
      }, () => {});
    });
    return callbacks.map(entry => ({
      type: entry.type,
      invalidates: entry.summary.invalidates,
      targets: entry.summary.targets,
      version: entry.summary.version
    }));
  });

  expect(result).toHaveLength(2);
  expect(result.map(entry => entry.type).sort()).toEqual(['nested', 'shared']);
  result.forEach(entry => {
    expect(entry.invalidates).toEqual(expect.arrayContaining([
      'traits.base',
      'summary.traits',
      'traits.stark-derived'
    ]));
    expect(entry.targets.traits).toEqual(expect.arrayContaining(['Diskret', 'Stark']));
    expect(entry.targets.summary).toEqual(['Diskret']);
  });
  expect(new Set(result.map(entry => entry.version)).size).toBe(1);
});
