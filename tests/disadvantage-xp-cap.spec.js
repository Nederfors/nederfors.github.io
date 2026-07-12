import { expect, test } from '@playwright/test';

const CHAR_ID = 'disadvantage-cap-char';

const metaState = {
  current: CHAR_ID,
  characters: [
    { id: CHAR_ID, name: 'Disadvantage Cap Hero', folderId: 'fd-standard' }
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
    if (sessionStorage.getItem('__disadvantageCapSeeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__disadvantageCapSeeded', '1');
  }, { metaState, characterState });
}

async function waitForApp(page, route, selector) {
  await page.goto(route);
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator(selector).waitFor({ state: 'visible' });
}

async function captureDialogsAndToasts(page) {
  await page.evaluate(() => {
    window.__disadvantageCapMessages = [];
    window.alertPopup = async (message) => {
      window.__disadvantageCapMessages.push({ type: 'alert', message: String(message || '') });
      return true;
    };
    window.confirmPopup = async (message) => {
      window.__disadvantageCapMessages.push({ type: 'confirm', message: String(message || '') });
      return true;
    };
    window.toast = (message) => {
      window.__disadvantageCapMessages.push({ type: 'toast', message: String(message || '') });
    };
  });
}

async function readMessages(page) {
  return page.evaluate(() => Array.isArray(window.__disadvantageCapMessages)
    ? window.__disadvantageCapMessages.slice()
    : []);
}

async function readOpenDialogText(page) {
  return page.evaluate(() => {
    const daubDialog = document.getElementById('daub-dialog-modal');
    if (daubDialog?.classList.contains('open')) {
      return String(daubDialog.querySelector('.db-modal__body')?.textContent || '').trim();
    }
    const toolbar = document.querySelector('shared-toolbar');
    const legacyDialog = toolbar?.shadowRoot?.getElementById('dialogPopup');
    if (legacyDialog?.classList.contains('open')) {
      return String(toolbar.shadowRoot.getElementById('dialogMessage')?.textContent || '').trim();
    }
    return '';
  });
}

async function closeOpenDialog(page) {
  await page.evaluate(() => {
    const daubOk = document.querySelector('#daub-dialog-modal [data-dialog-action="ok"]');
    if (daubOk) {
      daubOk.click();
      return;
    }
    const toolbar = document.querySelector('shared-toolbar');
    toolbar?.shadowRoot?.getElementById('dialogOk')?.click();
  });
}

async function pickStandardDrawbackNames(page, count) {
  return page.evaluate((count) => {
    const picked = [];
    const entries = Array.isArray(window.DB) ? window.DB : [];
    for (const entry of entries) {
      if (!entry || picked.length >= count) break;
      const types = Array.isArray(entry?.taggar?.typ) ? entry.taggar.typ : [];
      if (!types.includes('Nackdel')) continue;
      if (window.storeHelper?.isSearchHiddenEntry?.(entry)) continue;
      const maxCount = Number(window.storeHelper?.getEntryMaxCount?.(entry) || 1);
      if (maxCount > 1) continue;
      if (picked.some((item) => item.name === entry.namn)) continue;
      const candidate = {
        ...JSON.parse(JSON.stringify(entry)),
        __uid: `drawback-pick-${picked.length}`
      };
      const stopResult = window.rulesHelper?.evaluateEntryStops?.(candidate, picked.map(item => item.entry), {
        action: 'add'
      });
      if (stopResult?.hasStops) continue;
      picked.push({ name: entry.namn, entry: candidate });
    }
    if (picked.length < count) {
      throw new Error(`Only found ${picked.length} usable standard drawbacks.`);
    }
    return picked.map((item) => item.name);
  }, count);
}

async function seedDrawbacks(page, names) {
  await page.evaluate(async (names) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const list = names.map((name, index) => {
      const entry = window.lookupEntry?.({ name })
        || (window.DB || []).find(candidate => String(candidate?.namn || '').trim() === String(name || '').trim());
      if (!entry) throw new Error(`Missing drawback: ${name}`);
      return {
        ...JSON.parse(JSON.stringify(entry)),
        __uid: `seeded-drawback-${Date.now()}-${index}`
      };
    });
    window.storeHelper.setCurrentList(activeStore, list);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-seed-drawbacks' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      filters: true,
      traits: true,
      summary: true,
      effects: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
  }, names);
}

async function seedStackableDrawback(page, count) {
  return page.evaluate(async (count) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const entry = {
      id: 'test-stackable-drawback',
      namn: 'Testbar nackdel',
      name: 'Testbar nackdel',
      beskrivning: 'Testnackdel som kan tas flera gånger.',
      description: 'Testnackdel som kan tas flera gånger.',
      taggar: {
        typ: ['Nackdel'],
        max_antal: 10
      },
      tags: {
        types: ['Nackdel'],
        max_count: 10
      },
      nivåer: {},
      levels: {}
    };
    const list = Array.from({ length: count }, (_, index) => ({
      ...JSON.parse(JSON.stringify(entry)),
      __uid: `stackable-drawback-${Date.now()}-${index}`
    }));
    window.storeHelper.setCurrentList(activeStore, list);
    await window.symbaroumPersistence?.flushPendingWrites?.({ reason: 'test-seed-stackable-drawback' });
    window.symbaroumViewBridge?.refreshCurrent({
      selection: true,
      filters: true,
      traits: true,
      summary: true,
      effects: true,
      strict: true
    });
    if (typeof window.updateXP === 'function') window.updateXP();
    if (typeof window.renderTraits === 'function') window.renderTraits();
    return entry.namn;
  }, count);
}

async function filterIndexToEntry(page, name) {
  await page.evaluate((name) => {
    window.handleIndexSearchTerm?.(name, { scroll: false, blur: false });
  }, name);
  await expect.poll(async () => page.evaluate((name) => {
    const card = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
      .find(candidate => String(candidate?.dataset?.name || '').trim() === String(name || '').trim());
    return Boolean(card?.querySelector('button[data-act="add"]'));
  }, name)).toBe(true);
}

async function clickIndexAdd(page, name) {
  await page.evaluate((name) => {
    const card = [...document.querySelectorAll('#lista li.entry-card, #lista li.card')]
      .find(candidate => String(candidate?.dataset?.name || '').trim() === String(name || '').trim());
    const button = card?.querySelector('button[data-act="add"]');
    if (!button) throw new Error(`Missing index add button for ${name}`);
    button.click();
  }, name);
}

async function clickCharacterAdd(page, name) {
  await page.evaluate((name) => {
    const card = [...document.querySelectorAll('#valda li.entry-card, #valda li.card')]
      .find(candidate => String(candidate?.dataset?.name || '').trim() === String(name || '').trim());
    const button = card?.querySelector('button[data-act="add"]');
    if (!button) throw new Error(`Missing character add button for ${name}`);
    button.click();
  }, name);
}

async function readCurrentListStats(page, name = '') {
  return page.evaluate((name) => {
    const activeStore = typeof store === 'object' && store ? store : window.storeHelper.load();
    const list = window.storeHelper.getCurrentList(activeStore);
    const matches = list.filter(entry => !name || String(entry?.namn || '').trim() === String(name || '').trim());
    return {
      count: matches.length,
      totalXp: window.storeHelper.calcTotalXP(0, list),
      names: list.map(entry => entry.namn)
    };
  }, name);
}

test('drawback XP caps at five while additional drawbacks display +0', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  const names = await pickStandardDrawbackNames(page, 7);

  const result = await page.evaluate((names) => {
    const entries = names.map((name, index) => {
      const entry = window.lookupEntry?.({ name });
      return {
        ...JSON.parse(JSON.stringify(entry)),
        __uid: `xp-cap-drawback-${index}`,
        __order: index + 1
      };
    });
    const previewValue = window.storeHelper.calcEntryDisplayXP(entries[5], entries.slice(0, 5));
    return {
      totalSeven: window.storeHelper.calcTotalXP(0, entries),
      totalSix: window.storeHelper.calcTotalXP(0, entries.slice(0, 6)),
      totalFive: window.storeHelper.calcTotalXP(0, entries.slice(0, 5)),
      totalFour: window.storeHelper.calcTotalXP(0, entries.slice(0, 4)),
      sixthPreviewValue: previewValue,
      sixthPreviewText: window.storeHelper.formatEntryXPText(entries[5], previewValue)
    };
  }, names);

  expect(result).toEqual({
    totalSeven: 25,
    totalSix: 25,
    totalFive: 25,
    totalFour: 20,
    sixthPreviewValue: 0,
    sixthPreviewText: '+0'
  });
});

test('index add shows modal warning on fifth drawback and +0 toast after cap', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  await captureDialogsAndToasts(page);
  const names = await pickStandardDrawbackNames(page, 6);
  await seedDrawbacks(page, names.slice(0, 4));

  await filterIndexToEntry(page, names[4]);
  await clickIndexAdd(page, names[4]);
  await expect.poll(async () => (await readCurrentListStats(page)).count).toBe(5);
  await expect.poll(async () => (await readMessages(page)).filter(item => item.type === 'alert').map(item => item.message))
    .toContain('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
  const fifthMessages = await readMessages(page);
  expect(fifthMessages.filter(item => item.type === 'alert').map(item => item.message)).toContain('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
  expect(fifthMessages.filter(item => item.type === 'toast')).toEqual([]);

  await filterIndexToEntry(page, names[5]);
  await clickIndexAdd(page, names[5]);
  await expect.poll(async () => (await readCurrentListStats(page)).count).toBe(6);

  const stats = await readCurrentListStats(page);
  const messages = await readMessages(page);
  expect(stats.totalXp).toBe(25);
  expect(messages.filter(item => item.type === 'alert').map(item => item.message)).toContain('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
  expect(messages.filter(item => item.type === 'toast').map(item => item.message)).toContain('Nackdelar över fem ger +0 Erf.');
});

test('index add persists fifth drawback before the real warning is dismissed', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  const names = await pickStandardDrawbackNames(page, 5);
  await seedDrawbacks(page, names.slice(0, 4));

  await filterIndexToEntry(page, names[4]);
  await clickIndexAdd(page, names[4]);

  await expect.poll(async () => (await readCurrentListStats(page)).count).toBe(5);
  await expect.poll(async () => readOpenDialogText(page)).toContain('framtida nackdelar ger +0 erfarenhetspoäng');
  await closeOpenDialog(page);
});

test('character add shows modal warning on fifth stackable drawback', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  const name = await seedStackableDrawback(page, 4);
  await captureDialogsAndToasts(page);

  await clickCharacterAdd(page, name);
  await expect.poll(async () => (await readCurrentListStats(page, name)).count).toBe(5);
  await expect.poll(async () => (await readMessages(page)).filter(item => item.type === 'alert').map(item => item.message))
    .toContain('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');

  const stats = await readCurrentListStats(page, name);
  const messages = await readMessages(page);
  expect(stats.totalXp).toBe(25);
  expect(messages.filter(item => item.type === 'alert').map(item => item.message)).toContain('Nu har du försökt gamea systemet för mycket, framtida nackdelar ger +0 erfarenhetspoäng');
  expect(messages.filter(item => item.type === 'toast')).toEqual([]);
});

test('character add persists fifth stackable drawback before the real warning is dismissed', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  const name = await seedStackableDrawback(page, 4);

  await clickCharacterAdd(page, name);

  await expect.poll(async () => (await readCurrentListStats(page, name)).count).toBe(5);
  await expect.poll(async () => readOpenDialogText(page)).toContain('framtida nackdelar ger +0 erfarenhetspoäng');
  await closeOpenDialog(page);
});

test('character add can cross the drawback XP cap for stackable drawbacks', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/character', '#valda');
  const name = await seedStackableDrawback(page, 5);
  await captureDialogsAndToasts(page);

  await clickCharacterAdd(page, name);
  await expect.poll(async () => (await readCurrentListStats(page, name)).count).toBe(6);

  const stats = await readCurrentListStats(page, name);
  const messages = await readMessages(page);
  expect(stats.totalXp).toBe(25);
  expect(messages.filter(item => item.type === 'alert')).toEqual([]);
  expect(messages.filter(item => item.type === 'toast').map(item => item.message)).toContain('Nackdelar över fem ger +0 Erf.');
});

test('non-stackable drawback duplicates remain blocked by entry limits', async ({ page }) => {
  await seedProfileStore(page);
  await waitForApp(page, '/#/index', '#lista');
  const [name] = await pickStandardDrawbackNames(page, 1);

  const result = await page.evaluate((name) => {
    const entry = window.lookupEntry?.({ name });
    const selected = [{
      ...JSON.parse(JSON.stringify(entry)),
      __uid: 'duplicate-drawback-existing'
    }];
    const stopResult = window.rulesHelper.evaluateEntryStops(entry, selected, { action: 'add' });
    return {
      maxCount: window.storeHelper.getEntryMaxCount(entry),
      hasStops: Boolean(stopResult?.hasStops),
      hardStopCodes: (stopResult?.hardStops || []).map(item => item.code)
    };
  }, name);

  expect(result.maxCount).toBe(1);
  expect(result.hasStops).toBe(true);
  expect(result.hardStopCodes).toContain('duplicate_entry');
});
