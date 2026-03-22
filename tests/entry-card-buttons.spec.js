import { expect, test } from '@playwright/test';

const CHAR_ID = 'entry-card-char';

const metaState = {
  current: CHAR_ID,
  characters: [
    { id: CHAR_ID, name: 'Entry Card Hero', folderId: 'fd-standard' }
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
  money: { daler: 10, skilling: 0, 'örtegar': 0 }
};

async function seedProfileStore(page) {
  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__entryCardButtonsSeeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__entryCardButtonsSeeded', '1');
  }, { metaState, characterState });
}

async function waitForApp(page, route, selector) {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator(selector).waitFor({ state: 'visible' });
}

async function prepareIndexInventoryEntry(page, qty, preferredName = 'Dubbel ringbrynja') {
  return page.evaluate(async ({ qty, preferredName }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const entry = window.lookupEntry?.({ name: preferredName })
      || entries.find((candidate) => {
        const types = Array.isArray(candidate?.taggar?.typ) ? candidate.taggar.typ : [];
        return window.isInv?.(candidate)
          && !window.storeHelper?.isSearchHiddenEntry?.(candidate)
          && !types.includes('Artefakt');
      })
      || entries.find(candidate => window.isInv?.(candidate))
      || null;
    if (!entry) throw new Error('Missing inventory entry for entry-card tests.');

    let row = null;
    if ((Number(qty) || 0) > 0) {
      row = typeof window.invUtil?.buildInventoryRow === 'function'
        ? await window.invUtil.buildInventoryRow({
            entry,
            list: window.storeHelper.getCurrentList(activeStore)
          })
        : null;
      if (!row) {
        row = {
          id: entry.id,
          name: entry.namn,
          qty: Number(qty) || 1,
          gratis: 0,
          gratisKval: [],
          removedKval: []
        };
      }
      row.qty = Number(qty) || 1;
    }

    window.storeHelper.setInventory(activeStore, row ? [row] : []);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-index-inventory-entry' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      inventory: true,
      filters: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
    return {
      name: entry.namn
    };
  }, { qty, preferredName });
}

async function prepareCharacterMultiEntry(page, count, preferredName = '') {
  return page.evaluate(async ({ count, preferredName }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const getLimit = (candidate) => (
      typeof window.storeHelper?.getEntryMaxCount === 'function'
        ? window.storeHelper.getEntryMaxCount(candidate)
        : 1
    );
    const entry = (preferredName
      ? window.lookupEntry?.({ name: preferredName })
      : null)
      || entries.find((candidate) => {
        const types = Array.isArray(candidate?.taggar?.typ) ? candidate.taggar.typ : [];
        return types.includes('Nackdel') && getLimit(candidate) >= 3;
      })
      || entries.find((candidate) => {
        const types = Array.isArray(candidate?.taggar?.typ) ? candidate.taggar.typ : [];
        return types.includes('Nackdel') && getLimit(candidate) > 1;
      })
      || null;
    if (!entry) throw new Error('Missing multi-count character entry for entry-card tests.');

    const nextList = Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => ({
      ...JSON.parse(JSON.stringify(entry)),
      __uid: `entry-card-multi-${Date.now()}-${index}`
    }));

    window.storeHelper.setCurrentList(activeStore, nextList);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-character-multi-entry' });
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
      limit: getLimit(entry)
    };
  }, { count, preferredName });
}

async function prepareCharacterLevelEntry(page, preferredName = 'Akrobatik') {
  return page.evaluate(async ({ preferredName }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entries = Array.isArray(window.DB) ? window.DB : [];
    const entry = window.lookupEntry?.({ name: preferredName })
      || entries.find((candidate) => (
        !window.isInv?.(candidate)
        && !window.isEmployment?.(candidate)
        && !window.isService?.(candidate)
        && Object.keys(candidate?.nivåer || {}).length > 1
      ))
      || null;
    if (!entry) throw new Error('Missing level-based character entry for entry-card tests.');

    const levels = Object.keys(entry.nivåer || {});
    if (levels.length < 2) throw new Error(`Entry lacks multiple levels: ${entry.namn}`);

    window.storeHelper.setCurrentList(activeStore, [{
      ...JSON.parse(JSON.stringify(entry)),
      nivå: levels[0],
      __uid: `entry-card-level-${Date.now()}`
    }]);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-character-level-entry' });
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
      levels
    };
  }, { preferredName });
}

async function readStandardButtons(page, rootSelector, name) {
  return page.evaluate(({ rootSelector, name }) => {
    const root = document.querySelector(rootSelector);
    if (!root) return null;
    const card = [...root.querySelectorAll('li.entry-card, li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    if (!card) return null;
    return [...card.querySelectorAll('.entry-action-group-standard > button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        act: String(button.dataset.act || '').trim(),
        className: button.className,
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2))
      };
    });
  }, { rootSelector, name });
}

async function readCharacterEntryState(page, name) {
  return page.evaluate(({ name }) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const list = window.storeHelper.getCurrentList(activeStore);
    const count = list.filter((entry) => (
      String(entry?.namn || '').trim() === String(name || '').trim() && !entry?.trait
    )).length;
    const card = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    const acts = card
      ? [...card.querySelectorAll('.entry-action-group-standard > button')].map((button) => String(button.dataset.act || '').trim())
      : [];
    return { count, acts };
  }, { name });
}

async function cardExists(page, rootSelector, name) {
  return page.evaluate(({ rootSelector, name }) => {
    const root = document.querySelector(rootSelector);
    if (!root) return false;
    return [...root.querySelectorAll('li.entry-card, li.card')]
      .some((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim());
  }, { rootSelector, name });
}

async function clickCardAction(page, rootSelector, name, act) {
  await page.evaluate(({ rootSelector, name, act }) => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`Missing root: ${rootSelector}`);
    const card = [...root.querySelectorAll('li.entry-card, li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    if (!card) throw new Error(`Missing card: ${name}`);
    const button = card.querySelector(`.entry-action-group-standard > button[data-act="${act}"]`)
      || card.querySelector(`button[data-act="${act}"]`);
    if (!button) throw new Error(`Missing button ${act} for ${name}`);
    button.click();
  }, { rootSelector, name, act });
}

async function changeCardLevel(page, rootSelector, name, value) {
  await page.evaluate(({ rootSelector, name, value }) => {
    const root = document.querySelector(rootSelector);
    if (!root) throw new Error(`Missing root: ${rootSelector}`);
    const card = [...root.querySelectorAll('li.entry-card, li.card')]
      .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
    if (!card) throw new Error(`Missing card: ${name}`);
    const select = card.querySelector('select.level');
    if (!select) throw new Error(`Missing level selector for ${name}`);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, { rootSelector, name, value });
}

test('index inventory cards keep the canonical standard-button order for counts 0, 1, and 2', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');

  const entry = await prepareIndexInventoryEntry(page, 0);
  await expect.poll(async () => (
    (await readStandardButtons(page, '#lista', entry.name))?.map((button) => button.act) || []
  )).toEqual(['buyMulti', 'add']);

  await prepareIndexInventoryEntry(page, 1, entry.name);
  await expect.poll(async () => (
    (await readStandardButtons(page, '#lista', entry.name))?.map((button) => button.act) || []
  )).toEqual(['del', 'buyMulti', 'add']);

  await prepareIndexInventoryEntry(page, 2, entry.name);
  await expect.poll(async () => (
    (await readStandardButtons(page, '#lista', entry.name))?.map((button) => button.act) || []
  )).toEqual(['del', 'buyMulti', 'sub', 'add']);
});

test('index incremental action updates keep db-btn styling and button footprint stable', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');

  const entry = await prepareIndexInventoryEntry(page, 1);
  await expect.poll(async () => (
    (await readStandardButtons(page, '#lista', entry.name))?.map((button) => button.act) || []
  )).toEqual(['del', 'buyMulti', 'add']);

  const before = await readStandardButtons(page, '#lista', entry.name);
  await clickCardAction(page, '#lista', entry.name, 'add');

  await expect.poll(async () => (
    (await readStandardButtons(page, '#lista', entry.name))?.map((button) => button.act) || []
  )).toEqual(['del', 'buyMulti', 'sub', 'add']);

  const after = await readStandardButtons(page, '#lista', entry.name);
  expect(after).toBeTruthy();

  after.forEach((button) => {
    expect(button.className).toContain('db-btn');
    expect(button.className).not.toContain('char-btn');
  });

  const beforeByAct = new Map((before || []).map((button) => [button.act, button]));
  const afterByAct = new Map((after || []).map((button) => [button.act, button]));
  ['del', 'buyMulti', 'add'].forEach((act) => {
    const previous = beforeByAct.get(act);
    const next = afterByAct.get(act);
    expect(previous).toBeTruthy();
    expect(next).toBeTruthy();
    expect(Math.abs((next?.width || 0) - (previous?.width || 0))).toBeLessThan(1);
    expect(Math.abs((next?.height || 0) - (previous?.height || 0))).toBeLessThan(1);
  });
});

test('character multi-count cards hide minus at count 1 and only render remove when present', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');

  const entry = await prepareCharacterMultiEntry(page, 0);
  await expect.poll(async () => (
    await cardExists(page, '#valda', entry.name)
  )).toBe(false);

  await prepareCharacterMultiEntry(page, 1, entry.name);
  await expect.poll(async () => (
    await readCharacterEntryState(page, entry.name)
  )).toEqual({ count: 1, acts: ['del', 'add'] });

  await clickCardAction(page, '#valda', entry.name, 'add');
  await expect.poll(async () => (
    await readCharacterEntryState(page, entry.name)
  )).toEqual({ count: 2, acts: ['del', 'sub', 'add'] });

  await clickCardAction(page, '#valda', entry.name, 'sub');
  await expect.poll(async () => (
    await readCharacterEntryState(page, entry.name)
  )).toEqual({ count: 1, acts: ['del', 'add'] });
});

test('character level changes keep the surviving standard-button order stable', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');

  const entry = await prepareCharacterLevelEntry(page);
  const beforeActs = await readStandardButtons(page, '#valda', entry.name);
  expect(beforeActs?.map((button) => button.act) || []).toEqual(['rem']);

  await changeCardLevel(page, '#valda', entry.name, entry.levels[1]);
  await expect.poll(async () => {
    return page.evaluate(({ name, value }) => {
      const card = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
        .find((candidate) => String(candidate?.dataset?.name || '').trim() === String(name || '').trim()) || null;
      const select = card?.querySelector('select.level');
      return select?.value || '';
    }, { name: entry.name, value: entry.levels[1] });
  }).toBe(entry.levels[1]);

  await expect.poll(async () => (
    (await readStandardButtons(page, '#valda', entry.name))?.map((button) => button.act) || []
  )).toEqual(['rem']);
});
