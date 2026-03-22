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

async function readDialogMessages(page) {
  return page.evaluate(() => Array.isArray(window.__testDialogMessages) ? window.__testDialogMessages.slice() : []);
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

async function setIndexCardLevel(page, name, level) {
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
    const button = [...optionRoot.querySelectorAll('button')]
      .find((candidate) => !candidate.disabled && String(candidate.textContent || '').trim() === String(label || '').trim()) || null;
    if (!button) return false;
    button.click();
    return true;
  }, { label });

  if (!clicked) throw new Error(`Unable to pick popup option ${label}.`);
}

async function cancelChoicePopup(page) {
  await page.locator('#choicePopup').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const popup = document.getElementById('choicePopup');
    const button = popup?.querySelector('#choiceCancel');
    if (!button) throw new Error('Missing choice popup cancel button.');
    button.click();
  });
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

  const entries = await readListEntries(page, 'Exceptionellt karaktärsdrag');
  const matches = entries.filter((entry) => entry.trait === 'Diskret');
  expect(matches).toHaveLength(1);
  expect(matches[0]?.level).toBe('Gesäll');
});

test('choice-popup add reports no-options when all Monsterlärd specializations are already used', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await setDialogOverrides(page);
  await seedNamedEntries(page, [
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Bestar' },
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Kulturvarelser' },
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Odöda' },
    { name: 'Monsterlärd', level: 'Gesäll', trait: 'Styggelser' }
  ]);

  await setIndexCardLevel(page, 'Monsterlärd', 'Gesäll');
  await clickIndexAdd(page, 'Monsterlärd');

  const scenario = await readLatestScenario(page, 'add-item-to-character', 'cancelled');
  const messages = await readDialogMessages(page);
  const alerts = messages.filter((entry) => entry.type === 'alert').map((entry) => entry.message);

  expect(scenario?.detail?.reason).toBe('list-choice-cancelled');
  expect(alerts.some((message) => message.includes('Inga val kvar'))).toBe(true);
  await expect.poll(async () => (await readListEntries(page, 'Monsterlärd')).length).toBe(4);
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

test('character structural level changes fall back to a full selection render when grants add entries', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  const target = await prepareCharacterLevelCandidate(page, 'structural');
  await clearPerfHistory(page, { awaitFlush: true, levelChanges: true });

  await changeCardLevel(page, '#valda', target.name, target.toLevel);
  const scenario = await readLatestScenario(page, 'character-level-change');
  const entries = await readListEntries(page, '');
  const granted = entries.filter((entry) => entry.name.startsWith('Hamnskifte:'));
  const stageNames = (scenario?.detail?.profile?.stages || []).map((entry) => entry.name);

  expect(scenario?.detail?.renderMode).toBe('full');
  expect(stageNames).toEqual(expect.arrayContaining([
    'store-mutation',
    'pending-choice-resolution',
    'selection-render',
    'persistence-flush'
  ]));
  expect(granted.length).toBeGreaterThan(0);
});

test('character level changes can keep granted entries when the cleanup confirm is accepted', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  await setDialogOverrides(page, { confirmResult: true });
  await seedNamedEntries(page, [{
    name: 'Hamnskifte',
    level: 'Gesäll'
  }]);

  const grantedBefore = (await readListEntries(page, '')).filter((entry) => entry.name.startsWith('Hamnskifte:'));
  expect(grantedBefore.length).toBeGreaterThan(0);

  await changeCardLevel(page, '#valda', 'Hamnskifte', 'Novis');
  const messages = await readDialogMessages(page);
  const confirmMessage = messages.find((entry) => entry.type === 'confirm' && entry.message.includes('automatiskt tillagda förmågor'));
  await expect.poll(async () => (
    (await readListEntries(page, 'Hamnskifte')).find((entry) => entry.name === 'Hamnskifte')?.level || ''
  )).toBe('Novis');
  const afterEntries = await readListEntries(page, '');

  expect(confirmMessage).toBeTruthy();
  grantedBefore.forEach((entry) => {
    expect(afterEntries.some((candidate) => candidate.name === entry.name)).toBe(true);
  });
  expect(afterEntries.find((entry) => entry.name === 'Hamnskifte')?.level).toBe('Novis');
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
