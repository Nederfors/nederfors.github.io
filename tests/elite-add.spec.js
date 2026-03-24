import { expect, test } from '@playwright/test';

const CHAR_ID = 'elite-add-char';

const metaState = {
  current: CHAR_ID,
  characters: [
    { id: CHAR_ID, name: 'Elite Add Hero' }
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

const characterState = {
  list: [],
  inventory: [],
  custom: []
};

async function seedStore(page) {
  await page.addInitScript(({ metaState, characterState }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
  }, { metaState, characterState });
}

test('elite requirement button opens the elite builder popup', async ({ page }) => {
  await seedStore(page);
  await page.goto('/#/index');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const popupState = await page.evaluate(async () => {
    const button = document.querySelector('button[data-elite-req="Järnsvuren"]');
    if (!button) {
      throw new Error('Missing elite requirement button for Järnsvuren.');
    }
    button.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      masterOpen: Boolean(document.getElementById('masterPopup')?.classList.contains('open')),
      charOpen: Boolean(document.getElementById('charPopup')?.classList.contains('open')),
      topPopupId: window.popupManager?.peekTop?.()?.id || null,
      popupGroups: document.querySelectorAll('#masterPopup .master-group').length
    };
  });

  expect(popupState.masterOpen).toBe(true);
  expect(popupState.charOpen).toBe(false);
  expect(popupState.topPopupId).toBe('masterPopup');
  expect(popupState.popupGroups).toBeGreaterThan(0);
});
