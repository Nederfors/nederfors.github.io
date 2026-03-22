import { expect, test } from '@playwright/test';

const CHAR_ID = 'pipeline-char';

async function seedCharacter(page) {
  const metaState = {
    current: CHAR_ID,
    characters: [
      { id: CHAR_ID, name: 'Pipeline Hero', folderId: 'fd-standard' }
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

  const character = {
    list: [],
    inventory: [],
    custom: [],
    artifactEffects: {},
    notes: { background: 'Initial note' },
    money: { daler: 1, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, character, charId }) => {
    if (sessionStorage.getItem('__mutationPipelineSeeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${charId}`, JSON.stringify(character));
    sessionStorage.setItem('__mutationPipelineSeeded', '1');
  }, { metaState, character, charId: CHAR_ID });
}

async function trackMutationPipeline(page) {
  await page.evaluate(() => {
    const pipeline = window.symbaroumMutationPipeline;
    if (!pipeline || pipeline.__testWrapped) return;
    window.__mutationPipelineCalls = [];
    const original = pipeline.scheduleCharacterRefresh?.bind(pipeline);
    pipeline.scheduleCharacterRefresh = (options = {}) => {
      window.__mutationPipelineCalls.push(JSON.parse(JSON.stringify(options)));
      return original ? original(options) : undefined;
    };
    pipeline.__testWrapped = true;
  });
}

async function readCharacterState(page, charId) {
  return page.evaluate(async (id) => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('symbapedia-app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const db = await openDb();
    const tx = db.transaction(['characterFields', 'characterState'], 'readonly');
    const fieldRows = await new Promise((resolve, reject) => {
      const request = tx.objectStore('characterFields').index('charId').getAll(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
    if (Array.isArray(fieldRows) && fieldRows.length) {
      db.close();
      return fieldRows.reduce((acc, row) => {
        if (!row?.field) return acc;
        acc[row.field] = row.value;
        return acc;
      }, {});
    }
    const record = await new Promise((resolve, reject) => {
      const request = tx.objectStore('characterState').get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
    db.close();
    return record?.state || null;
  }, charId);
}

test('notes submit uses the mutation pipeline and persists', async ({ page }) => {
  await seedCharacter(page);
  await page.goto('/#/notes');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#characterForm').waitFor({ state: 'visible' });
  await trackMutationPipeline(page);

  await page.locator('#editBtn').click();
  await page.locator('#background').fill('Pipeline notes save');
  await page.evaluate(() => { window.__mutationPipelineCalls = []; });
  await page.locator('#characterForm button[type="submit"]').click();

  await expect.poll(async () => (
    await page.evaluate(() => (
      (window.__mutationPipelineCalls || []).some((call) => call?.source === 'notes-save')
    ))
  )).toBe(true);

  const noteCall = await page.evaluate(() => (
    (window.__mutationPipelineCalls || []).find((call) => call?.source === 'notes-save') || null
  ));
  expect(noteCall).toMatchObject({
    notes: true,
    name: true,
    source: 'notes-save',
    xp: false,
    afterPaint: false
  });

  await page.evaluate(() => window.symbaroumPersistence.flushPendingWrites());
  await expect.poll(async () => (
    (await readCharacterState(page, CHAR_ID))?.notes?.background || ''
  )).toBe('Pipeline notes save');
});

test('money save uses the mutation pipeline and persists', async ({ page }) => {
  await seedCharacter(page);
  await page.goto('/#/inventory');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));
  await page.locator('#invList').waitFor({ state: 'visible' });
  await trackMutationPipeline(page);

  await page.evaluate(() => {
    window.__mutationPipelineCalls = [];
    window.invUtil?.openMoneyPopup?.();
    const root = document.querySelector('shared-toolbar')?.shadowRoot;
    if (!root) throw new Error('Missing shared-toolbar shadow root');
    const setValue = (id, value) => {
      const input = root.getElementById(id);
      if (!input) throw new Error(`Missing input: ${id}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('moneyBalanceDaler', '7');
    setValue('moneyBalanceSkilling', '1');
    setValue('moneyBalanceOrtegar', '2');
    const setBtn = root.getElementById('moneySetBtn');
    if (!setBtn) throw new Error('Missing money set button');
    setBtn.click();
  });

  await expect.poll(async () => (
    await page.evaluate(() => (
      (window.__mutationPipelineCalls || []).filter((call) => call?.source === 'inventory-money-set').length
    ))
  )).toBe(1);

  const moneyCall = await page.evaluate(() => (
    (window.__mutationPipelineCalls || []).find((call) => call?.source === 'inventory-money-set') || null
  ));
  expect(moneyCall).toMatchObject({
    role: 'character',
    summary: true,
    effects: true,
    source: 'inventory-money-set'
  });

  await page.evaluate(() => window.symbaroumPersistence.flushPendingWrites());
  await expect.poll(async () => (
    (await readCharacterState(page, CHAR_ID))?.money || null
  )).toMatchObject({
    daler: 7,
    skilling: 1,
    'örtegar': 2
  });
});
