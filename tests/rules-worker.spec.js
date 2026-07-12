import { expect, test } from '@playwright/test';

test('rules worker matches derived calculations and filtering', async ({ page }) => {
  const metaState = {
    current: 'worker-char',
    characters: [
      { id: 'worker-char', name: 'Worker Hero', folderId: 'fd-standard' }
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
    list: [
      {
        id: 'boon-jordnara',
        namn: 'Jordnära',
        nivå: 'Novis',
        taggar: { typ: ['Fördel'] }
      },
      {
        id: 'skill-robust',
        namn: 'Robust',
        nivå: 'Gesäll',
        taggar: { typ: ['Förmåga'] }
      }
    ],
    inventory: [],
    custom: [],
    traits: {
      Diskret: 5,
      Kvick: 7,
      Listig: 9,
      Stark: 11,
      Träffsäker: 13,
      Vaksam: 15,
      Viljestark: 10,
      Övertygande: 8
    },
    money: { daler: 5, skilling: 0, 'örtegar': 0 }
  };

  await page.addInitScript(({ metaState, characterState }) => {
    if (sessionStorage.getItem('__rulesWorkerSeeded')) return;
    localStorage.clear();
    localStorage.setItem('rpall-meta', JSON.stringify(metaState));
    localStorage.setItem(`rpall-char-${metaState.current}`, JSON.stringify(characterState));
    sessionStorage.setItem('__rulesWorkerSeeded', '1');
  }, { metaState, characterState });

  await page.goto('/#/character');
  await page.waitForFunction(() => Boolean(window.__symbaroumBootCompleted) && Boolean(window.symbaroumPersistence?.ready));

  const result = await page.evaluate(async () => {
    await window.symbaroumRulesWorkerReady;
    const activeStore = window.store || window.symbaroumPersistence?.getStoreSnapshot?.();
    const list = window.storeHelper.getCurrentList(activeStore);
    const inv = window.storeHelper.getInventory(activeStore);
    const traits = window.storeHelper.getTraits(activeStore);
    const artifactEffects = window.storeHelper.getArtifactEffects(activeStore);
    const manualAdjust = window.storeHelper.getManualAdjustments(activeStore);
    const bonus = window.exceptionSkill ? window.exceptionSkill.getBonuses(list) : {};
    const maskBonus = window.maskSkill ? window.maskSkill.getBonuses(inv) : {};
    const traitValues = {
      Diskret: (traits.Diskret || 0) + (bonus.Diskret || 0) + (maskBonus.Diskret || 0),
      Kvick: (traits.Kvick || 0) + (bonus.Kvick || 0) + (maskBonus.Kvick || 0),
      Listig: (traits.Listig || 0) + (bonus.Listig || 0) + (maskBonus.Listig || 0),
      Stark: (traits.Stark || 0) + (bonus.Stark || 0) + (maskBonus.Stark || 0),
      Träffsäker: (traits.Träffsäker || 0) + (bonus.Träffsäker || 0) + (maskBonus.Träffsäker || 0),
      Vaksam: (traits.Vaksam || 0) + (bonus.Vaksam || 0) + (maskBonus.Vaksam || 0),
      Viljestark: (traits.Viljestark || 0) + (bonus.Viljestark || 0) + (maskBonus.Viljestark || 0),
      Övertygande: (traits.Övertygande || 0) + (bonus.Övertygande || 0) + (maskBonus.Övertygande || 0)
    };
    const baseXp = window.storeHelper.getBaseXP(activeStore);
    const combinedEffects = {
      xp: (artifactEffects?.xp || 0) + (manualAdjust?.xp || 0),
      corruption: (artifactEffects?.corruption || 0) + (manualAdjust?.corruption || 0)
    };
    const expectedCorruptionStats = window.storeHelper.calcCorruptionTrackStats(list, traitValues.Viljestark);
    const expectedCorruptionEffects = {
      ...combinedEffects,
      korruptionstroskel: expectedCorruptionStats.korruptionstroskel
    };
    const derived = await window.symbaroumRulesWorker.computeDerivedCharacter({
      list,
      baseXp,
      traitValues,
      artifactEffects,
      manualAdjust
    });
    const filtered = await window.symbaroumRulesWorker.filterEntries({
      entries: [
        { namn: 'Jordnära', searchKey: window.searchNormalize('jordnära fördel') },
        { namn: 'Robust', searchKey: window.searchNormalize('robust förmåga') },
        { namn: 'Häxkonst', searchKey: window.searchNormalize('häxkonst mystisk kraft') }
      ],
      searchTerms: ['jord', 'fördel']
    });

    return {
      mode: window.symbaroumRulesWorker?.mode || '',
      derived,
      expected: {
        corruptionStats: expectedCorruptionStats,
        permanentCorruption: window.storeHelper.calcPermanentCorruption(list, expectedCorruptionEffects),
        carryCapacity: window.storeHelper.calcCarryCapacity(traitValues.Stark, list)
          + Number(artifactEffects?.capacity || 0)
          + Number(manualAdjust?.capacity || 0),
        toughness: window.storeHelper.calcToughness(traitValues.Stark, list)
          + Number(artifactEffects?.toughness || 0)
          + Number(manualAdjust?.toughness || 0),
        painThreshold: window.storeHelper.calcPainThreshold(traitValues.Stark, list, expectedCorruptionEffects)
          + Number(artifactEffects?.pain || 0)
          + Number(manualAdjust?.pain || 0),
        usedXp: window.storeHelper.calcUsedXP(list, combinedEffects),
        totalXp: window.storeHelper.calcTotalXP(baseXp, list)
      },
      filtered
    };
  });

  expect(result.mode).toBe('worker');
  expect(result.derived.corruptionStats).toEqual(result.expected.corruptionStats);
  expect(result.derived.permanentCorruption).toBe(result.expected.permanentCorruption);
  expect(result.derived.carryCapacity).toBe(result.expected.carryCapacity);
  expect(result.derived.toughness).toBe(result.expected.toughness);
  expect(result.derived.painThreshold).toBe(result.expected.painThreshold);
  expect(result.derived.usedXp).toBe(result.expected.usedXp);
  expect(result.derived.totalXp).toBe(result.expected.totalXp);
  expect(result.derived.freeXp).toBe(result.expected.totalXp - result.expected.usedXp);
  expect(result.filtered.indexes).toEqual([0]);
  expect(result.filtered.entries.map(entry => entry.namn)).toEqual(['Jordnära']);
});
