import { expect, test } from '@playwright/test';

const DESTINATION_ORIGIN = 'http://127.0.0.1:4186';
const LEGACY_ORIGIN = 'http://localhost:4186';

const legacyMeta = {
  current: 'legacy-hero',
  characters: [
    { id: 'legacy-hero', name: 'Legacy Hero', folderId: 'legacy-folder' }
  ],
  folders: [
    { id: 'fd-standard', name: 'Standard', order: 0, system: true },
    { id: 'legacy-folder', name: 'Legacy Folder', order: 1 }
  ],
  activeFolder: 'ALL',
  compactEntries: true,
  entrySort: 'alpha-asc'
};

const legacyCharacter = {
  list: [],
  inventory: [
    { id: 'di10', name: 'Flinta & stål', qty: 1, kvaliteter: [] }
  ],
  custom: [],
  notes: { background: 'Saved on nederfors.github.io' },
  money: { daler: 7, skilling: 2, 'örtegar': 0 }
};

const destinationMeta = {
  current: 'destination-hero',
  characters: [
    { id: 'destination-hero', name: 'Destination Hero', folderId: 'fd-standard' }
  ],
  folders: [
    { id: 'fd-standard', name: 'Standard', order: 0, system: true }
  ],
  activeFolder: 'ALL',
  compactEntries: true,
  entrySort: 'alpha-asc'
};

const destinationCharacter = {
  list: [],
  inventory: [],
  custom: [],
  notes: { background: 'Created on symbapedia.se' }
};

const exportedDeviceCharacter = {
  format: 'symbapedia-character',
  formatVersion: 1,
  name: 'Device JSON Hero',
  folder: 'Mobile exports',
  data: {
    list: [],
    inventory: [
      { n: 'Fältkök', q: 1, k: [] }
    ],
    notes: { background: 'Imported from a JSON file on the device' }
  }
};

async function installTransferOrigins(context, { seedDestination = true, seedLegacy = true } = {}) {
  await context.addInitScript(({ destinationOrigin, legacyOrigin, seedDestination, seedLegacy, legacyMeta, legacyCharacter, destinationMeta, destinationCharacter }) => {
    // Exercise the input[type=file] path used by iOS and Android browsers.
    for (const pickerName of ['showOpenFilePicker', 'showDirectoryPicker']) {
      try {
        Object.defineProperty(window, pickerName, {
          configurable: true,
          writable: true,
          value: undefined
        });
      } catch {
        try { window[pickerName] = undefined; } catch {}
      }
    }

    window.__symbaroumCharacterTransferTestOrigins = {
      destinationOrigin,
      legacyOrigin
    };

    if (location.origin === legacyOrigin && seedLegacy && sessionStorage.getItem('__legacyTransferSeeded') !== '1') {
      localStorage.clear();
      localStorage.setItem('rpall-meta', JSON.stringify(legacyMeta));
      localStorage.setItem(`rpall-char-${legacyMeta.current}`, JSON.stringify(legacyCharacter));
      sessionStorage.setItem('__legacyTransferSeeded', '1');
    }

    if (location.origin === destinationOrigin
      && seedDestination
      && sessionStorage.getItem('__destinationTransferSeeded') !== '1') {
      localStorage.clear();
      localStorage.setItem('rpall-meta', JSON.stringify(destinationMeta));
      localStorage.setItem(`rpall-char-${destinationMeta.current}`, JSON.stringify(destinationCharacter));
      sessionStorage.setItem('__destinationTransferSeeded', '1');
    }
  }, {
    destinationOrigin: DESTINATION_ORIGIN,
    legacyOrigin: LEGACY_ORIGIN,
    seedDestination,
    seedLegacy,
    legacyMeta,
    legacyCharacter,
    destinationMeta,
    destinationCharacter
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => (
    Boolean(window.__symbaroumBootCompleted)
    && Boolean(window.symbaroumPersistence?.ready)
  ));
}

async function openStorageImport(page) {
  const toolbar = page.locator('shared-toolbar');
  await toolbar.locator('#filterToggle').click();
  const storageButton = toolbar.locator('#driveStorageBtn');
  if (!(await storageButton.isVisible())) {
    await toolbar.locator('#filterFormalCard .card-title').click();
  }
  await expect(storageButton).toBeVisible();
  await storageButton.click();
  const popup = toolbar.locator('#driveStoragePopup');
  await expect(popup).toBeVisible();
  await popup.locator('#driveStorageTab-import').click();
  return popup;
}

test('merges legacy-origin characters without replacing the destination character', async ({ page, context }) => {
  await installTransferOrigins(context);
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  const storagePopup = await openStorageImport(page);
  const importButton = storagePopup.locator('[data-action="legacy-site-import"]');
  await expect(importButton).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await importButton.click();
  const legacyPopup = await popupPromise;
  await legacyPopup.waitForLoadState('domcontentloaded').catch(() => {});

  await expect.poll(() => page.evaluate(() => window.storeHelper.load().characters.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.symbaroumLegacyCharacterTransfer?.getStatus?.())).toBe('completed');
  const imported = await page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    const legacy = activeStore.characters.find(char => char.name === 'Legacy Hero');
    return {
      current: activeStore.current,
      names: activeStore.characters.map(char => char.name).sort(),
      legacyId: legacy?.id || '',
      legacyFolder: activeStore.folders.find(folder => folder.id === legacy?.folderId)?.name || '',
      notes: activeStore.data[legacy?.id]?.notes?.background || '',
      inventory: (activeStore.data[legacy?.id]?.inventory || []).map(row => row.name),
      status: window.symbaroumLegacyCharacterTransfer?.getStatus?.() || ''
    };
  });

  expect(imported.current).toBe('destination-hero');
  expect(imported.names).toEqual(['Destination Hero', 'Legacy Hero']);
  expect(imported.legacyId).not.toBe('legacy-hero');
  expect(imported.legacyFolder).toBe('Legacy Folder');
  expect(imported.notes).toBe('Saved on nederfors.github.io');
  expect(imported.inventory).toEqual(['Flinta & stål']);
  expect(imported.status).toBe('completed');

  await page.reload();
  await waitForApp(page);
  const afterReload = await page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    return {
      current: activeStore.current,
      names: activeStore.characters.map(char => char.name).sort()
    };
  });
  expect(afterReload).toEqual({
    current: 'destination-hero',
    names: ['Destination Hero', 'Legacy Hero']
  });

  await page.evaluate(() => {
    window.__repeatLegacyTransfer = window.symbaroumLegacyCharacterTransfer.request();
  });
  const repeatDialog = page.locator('#daub-dialog-modal');
  await expect(repeatDialog).toBeVisible();
  await expect(repeatDialog).toContainText('skapas nya kopior');
  await repeatDialog.locator('[data-dialog-action="cancel"]').click();
  const repeatResult = await page.evaluate(() => window.__repeatLegacyTransfer);
  expect(repeatResult).toEqual({ imported: 0, cancelled: true });
  expect(await page.evaluate(() => window.storeHelper.load().characters.length)).toBe(2);
});

test('imports device JSON files as copies on mobile and preserves the current character', async ({ page, context }) => {
  await installTransferOrigins(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  let storagePopup = await openStorageImport(page);
  const deviceImportButton = storagePopup.locator('[data-action="legacy-device-import"]');
  await expect(deviceImportButton).toBeVisible();

  const chooserPromise = page.waitForEvent('filechooser');
  await deviceImportButton.click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'nederfors-character.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exportedDeviceCharacter))
  });

  await expect.poll(() => page.evaluate(() => window.storeHelper.load().characters.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.symbaroumLegacyCharacterTransfer?.getStatus?.())).toBe('completed');
  const imported = await page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    const deviceCharacter = activeStore.characters.find(char => char.name === 'Device JSON Hero');
    return {
      current: activeStore.current,
      importedId: deviceCharacter?.id || '',
      folder: activeStore.folders.find(folder => folder.id === deviceCharacter?.folderId)?.name || '',
      notes: activeStore.data[deviceCharacter?.id]?.notes?.background || '',
      inventory: (activeStore.data[deviceCharacter?.id]?.inventory || []).map(row => row.name)
    };
  });
  expect(imported.current).toBe('destination-hero');
  expect(imported.importedId).not.toBe('');
  expect(imported.importedId).not.toBe('destination-hero');
  expect(imported.folder).toBe('Mobile exports');
  expect(imported.notes).toBe('Imported from a JSON file on the device');
  expect(imported.inventory).toEqual(['Fältkök']);

  await page.reload();
  await waitForApp(page);
  expect(await page.evaluate(() => window.storeHelper.load().current)).toBe('destination-hero');

  storagePopup = await openStorageImport(page);
  await storagePopup.locator('[data-action="legacy-device-import"]').click();
  const repeatDialog = page.locator('#daub-dialog-modal');
  await expect(repeatDialog).toContainText('skapas nya kopior');
  await repeatDialog.locator('[data-dialog-action="cancel"]').click();
  expect(await page.evaluate(() => window.storeHelper.load().characters.length)).toBe(2);
});

test('offers device JSON selection from the empty mobile migration prompt', async ({ page, context }) => {
  await installTransferOrigins(context, { seedDestination: false, seedLegacy: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  const dialog = page.locator('#daub-dialog-modal');
  await expect(dialog).toContainText('välj exporterade JSON-filer på enheten');
  const chooserPromise = page.waitForEvent('filechooser');
  await dialog.locator('[data-dialog-action="extra"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'nederfors-character.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exportedDeviceCharacter))
  });

  await expect.poll(() => page.evaluate(() => window.storeHelper.load().characters.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.symbaroumLegacyCharacterTransfer?.getStatus?.())).toBe('completed');
  expect(await page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    return activeStore.characters.find(char => char.id === activeStore.current)?.name || '';
  })).toBe('Device JSON Hero');
});

test('offers the one-time prompt on an empty destination and activates the imported character', async ({ page, context }) => {
  await installTransferOrigins(context, { seedDestination: false });
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  const dialog = page.locator('#daub-dialog-modal');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Har du rollpersoner sparade på nederfors.github.io?');

  const popupPromise = page.waitForEvent('popup');
  await dialog.locator('[data-dialog-action="ok"]').click();
  await popupPromise;

  await expect.poll(() => page.evaluate(() => window.storeHelper.load().characters.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.symbaroumLegacyCharacterTransfer?.getStatus?.())).toBe('completed');
  const result = await page.evaluate(() => {
    const activeStore = window.storeHelper.load();
    return {
      currentName: activeStore.characters.find(char => char.id === activeStore.current)?.name || '',
      status: window.symbaroumLegacyCharacterTransfer?.getStatus?.() || ''
    };
  });
  expect(result).toEqual({ currentName: 'Legacy Hero', status: 'completed' });
});

test('dismisses the empty-destination prompt once', async ({ page, context }) => {
  await installTransferOrigins(context, { seedDestination: false, seedLegacy: false });
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  const dialog = page.locator('#daub-dialog-modal');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-dialog-action="cancel"]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.symbaroumLegacyCharacterTransfer?.getStatus?.())).toBe('dismissed');

  await page.reload();
  await waitForApp(page);
  await page.waitForTimeout(500);
  await expect(dialog).toBeHidden();
});

test('reports a blocked popup and leaves destination data unchanged', async ({ page, context }) => {
  await installTransferOrigins(context);
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  await page.evaluate(() => {
    window.open = () => null;
    window.__blockedLegacyTransfer = window.symbaroumLegacyCharacterTransfer.request();
  });

  const dialog = page.locator('#daub-dialog-modal');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('blockerade fönstret från nederfors.github.io');
  await dialog.locator('[data-dialog-action="ok"]').click();
  const result = await page.evaluate(() => window.__blockedLegacyTransfer);
  expect(result).toEqual({ imported: 0, error: 'popup-blocked' });
  expect(await page.evaluate(() => window.storeHelper.load().characters.map(char => char.name))).toEqual([
    'Destination Hero'
  ]);
});

test('records an empty legacy store so the startup prompt does not repeat', async ({ page, context }) => {
  await installTransferOrigins(context, { seedDestination: false, seedLegacy: false });
  await page.goto(`${DESTINATION_ORIGIN}/#/index`);
  await waitForApp(page);

  const dialog = page.locator('#daub-dialog-modal');
  await expect(dialog).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await dialog.locator('[data-dialog-action="ok"]').click();
  await popupPromise;

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Inga sparade rollpersoner hittades');
  await dialog.locator('[data-dialog-action="ok"]').click();
  await expect.poll(() => page.evaluate(() => window.symbaroumLegacyCharacterTransfer?.getStatus?.())).toBe('empty');

  await page.reload();
  await waitForApp(page);
  await page.waitForTimeout(500);
  await expect(dialog).toBeHidden();
});
