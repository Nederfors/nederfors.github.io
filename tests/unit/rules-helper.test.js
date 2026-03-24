import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const rulesHelperPath = path.join(repoRoot, 'js', 'rules-helper.js');
const rulesHelperSource = fs.readFileSync(rulesHelperPath, 'utf8');

function createLocalStorage(seed = {}) {
  const state = { ...seed };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? String(state[key]) : null;
    },
    setItem(key, value) {
      state[key] = String(value);
    },
    removeItem(key) {
      delete state[key];
    },
    clear() {
      Object.keys(state).forEach((key) => delete state[key]);
    }
  };
}

function createSandbox(storageSeed = {}, overrides = {}) {
  const localStorage = createLocalStorage(storageSeed);
  const sandbox = {
    JSON,
    Math,
    Date,
    Set,
    Map,
    WeakMap,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Intl,
    console,
    performance: { now() { return 0; } },
    localStorage,
    ENTRY_SORT_DEFAULT: 'alpha-asc',
    normalizeEntrySortMode(mode) {
      const value = typeof mode === 'string' ? mode : '';
      return ['alpha-asc', 'alpha-desc', 'newest', 'oldest', 'test', 'ark'].includes(value)
        ? value
        : 'alpha-asc';
    },
    lookupEntry() {
      return null;
    },
    moneyToO(money = {}) {
      return (money.daler || money.d || 0) * 100
        + (money.skilling || money.s || 0) * 10
        + (money['örtegar'] || money.o || 0);
    },
    oToMoney(total) {
      let rest = Math.max(0, Math.floor(Number(total) || 0));
      const daler = Math.floor(rest / 100);
      rest %= 100;
      const skilling = Math.floor(rest / 10);
      const ortegar = rest % 10;
      return { daler, skilling, 'örtegar': ortegar, d: daler, s: skilling, o: ortegar };
    }
  };
  Object.assign(sandbox, overrides || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadRulesHelper(overrides = {}) {
  const sandbox = createSandbox({}, overrides);
  vm.runInNewContext(rulesHelperSource, sandbox, { filename: rulesHelperPath });
  return sandbox.window.rulesHelper;
}

describe('rules-helper unit coverage', () => {
  it('supports nested requirement groups with mixed and/or logic', () => {
    const rulesHelper = loadRulesHelper();
    const getMissingReasons = rulesHelper.getMissingRequirementReasonsForCandidate;

    const entry = {
      id: 'test-skrack',
      namn: 'Testskracksla',
      taggar: {
        typ: ['Monstruost sardrag'],
        regler: {
          kraver: [
            {
              grupp: [
                { nar: { nagon_av_namn: ['Monster'] } },
                { namn: ['Andeform'] }
              ],
              grupp_logik: 'and',
              meddelande: 'Kraever Monster + Andeform.'
            },
            {
              nar: { nagon_av_namn: ['Andebesvarjare'] },
              meddelande: 'Alternativt: Andebesvarjare.'
            }
          ],
          kraver_typ_och_entry: 'or',
          kraver_logik: 'or'
        }
      }
    };

    expect(getMissingReasons(entry, [{ namn: 'Monster' }, { namn: 'Andeform' }])).toHaveLength(0);
    expect(getMissingReasons(entry, [{ namn: 'Andebesvarjare' }])).toHaveLength(0);
    expect(getMissingReasons(entry, [{ namn: 'Monster' }]).length).toBeGreaterThan(0);
    expect(getMissingReasons(entry, [{ namn: 'Andeform' }]).length).toBeGreaterThan(0);
  });

  it('surfaces alternative name requirements in stop messages', () => {
    const rulesHelper = loadRulesHelper();

    const candidate = {
      id: 'test-robust',
      namn: 'Testrobust',
      taggar: {
        typ: ['Särdrag'],
        regler: {
          kraver: [
            {
              nar: {
                nagon_av_namn: ['Troll', 'Rese', 'Monster']
              }
            }
          ]
        }
      }
    };

    const reasons = rulesHelper.getMissingRequirementReasonsForCandidate(candidate, []);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.alternativeNames).toEqual(['Troll', 'Rese', 'Monster']);
    expect(reasons[0]?.missingNames).toEqual(expect.arrayContaining(['Troll', 'Rese', 'Monster']));

    const stopResult = rulesHelper.evaluateEntryStops(candidate, [], { action: 'add' });
    expect(rulesHelper.formatEntryStopMessages(candidate.namn, stopResult)).toContain('Krav: Troll, Rese eller Monster');
  });

  it('does not let equipment-quality rules unlock entry requirements', () => {
    const rulesHelper = loadRulesHelper();

    const candidate = {
      id: 'test-robust-level',
      namn: 'Testrobust nivå',
      nivå: 'Novis',
      taggar: {
        typ: ['Särdrag'],
        nivå_data: {
          Novis: {
            regler: {
              kraver: [
                {
                  utrustning_typ: ['Rustning'],
                  utrustning_kvalitet: ['Robustanpassad (Novis)']
                }
              ]
            }
          }
        },
        regler: {
          kraver: [
            {
              nar: {
                nagon_av_namn: ['Troll', 'Rese', 'Monster']
              }
            }
          ]
        }
      }
    };

    const missingWithoutPrereq = rulesHelper.getMissingRequirementReasonsForCandidate(candidate, [], { level: 'Novis' });
    expect(missingWithoutPrereq).toHaveLength(1);
    expect(missingWithoutPrereq[0]?.missingNames).toEqual(expect.arrayContaining(['Troll', 'Rese', 'Monster']));

    const blockedStop = rulesHelper.evaluateEntryStops(candidate, [], { action: 'add', level: 'Novis' });
    expect(blockedStop.hasStops).toBe(true);
    expect(rulesHelper.formatEntryStopMessages(candidate.namn, blockedStop)).toContain('Krav: Troll, Rese eller Monster');

    const unlockedStop = rulesHelper.evaluateEntryStops(candidate, [{ namn: 'Troll' }], { action: 'add', level: 'Novis' });
    expect(unlockedStop.hasStops).toBe(false);
  });

  it('evaluates rule-extension nar conditions and numeric modifiers', () => {
    const rulesHelper = loadRulesHelper();

    expect(
      rulesHelper.evaluateRuleNar(
        { nar_eller: [{ har_namn: ['Robust'] }, { har_namn: ['Smidig'] }] },
        { list: [{ namn: 'Robust' }] }
      )
    ).toBe(true);

    expect(
      rulesHelper.evaluateNar(
        {
          har_namn: ['Robust'],
          eller: [
            { har_utrustad_typ: ['Medel'] },
            { har_utrustad_typ: ['Tung'] }
          ]
        },
        { list: [{ namn: 'Robust' }], utrustadTyper: ['Tung'] }
      )
    ).toBe(true);

    expect(
      rulesHelper.evaluateNar(
        {
          har_utrustat_namn: ['Solring'],
          har_utrustad_typ: ['Amulett'],
          har_utrustad_kvalitet: ['Välsignad']
        },
        {
          utrustadeNamn: ['Solring'],
          utrustadTyper: ['Amulett'],
          utrustadeKvaliteter: ['Välsignad']
        }
      )
    ).toBe(true);

    expect(
      rulesHelper.evaluateNar(
        { ej_utrustat_namn: ['Solring'] },
        { utrustadeNamn: ['Solring'] }
      )
    ).toBe(false);

    expect(
      rulesHelper.evaluateNar(
        { ej_utrustad_typ: ['Amulett'] },
        { utrustadTyper: ['Amulett'] }
      )
    ).toBe(false);

    expect(
      rulesHelper.evaluateNar(
        { ej_utrustad_kvalitet: ['Välsignad'] },
        { utrustadeKvaliteter: ['Välsignad'] }
      )
    ).toBe(false);

    expect(
      rulesHelper.evaluateNar(
        { inte: { har_namn: ['Robust'] } },
        { list: [{ namn: 'Robust' }] }
      )
    ).toBe(false);

    expect(
      rulesHelper.evaluateNar(
        {
          attribut_minst: { stark: 10 },
          attribut_hogst: { flink: 15 }
        },
        { attribut: { stark: 15, flink: 10 } }
      )
    ).toBe(true);

    expect(rulesHelper.applyNumericChange(10, { satt: 'multiplicera', varde: 2 })).toBe(20);
    expect(rulesHelper.applyNumericChange(-3, { satt: 'minimum', varde: 0 })).toBe(0);
    expect(rulesHelper.applyNumericChange(15, { satt: 'maximum', varde: 10 })).toBe(10);
    expect(rulesHelper.applyNumericChange(5, { satt: 'ersatt', varde: 99 })).toBe(99);

    expect(
      rulesHelper.computeObjectFormulaValue(
        { bas: 'niva', faktor: 3, min: 2, max: 8 },
        { nivå: 'Mästare' }
      )
    ).toBe(8);
  });

  it('keeps legacy traffsaker_modifierare_vapen behavior for weapon-scoped rules', () => {
    const rulesHelper = loadRulesHelper();
    const list = [{
      namn: 'Tränad skytt',
      taggar: {
        regler: {
          andrar: [
            {
              mal: 'traffsaker_modifierare_vapen',
              varde: 2,
              nar: {
                har_utrustad_vapen_typ: ['Avståndsvapen'],
                har_utrustad_vapen_kvalitet: ['Precist']
              }
            }
          ]
        }
      }
    }];

    expect(rulesHelper.queryMal(list, 'traffsaker_modifierare_vapen', {
      vapenFakta: [{ typer: ['Avståndsvapen'], kvaliteter: ['Precist'] }],
      antalVapen: 1
    })).toBe(2);
  });

  it('supports traffsaker_modifierare with active-item context and equipped pools', () => {
    const rulesHelper = loadRulesHelper({
      lookupEntry({ name }) {
        if (name === 'Välsignad') {
          return {
            namn: 'Välsignad',
            taggar: {
              regler: {
                andrar: [
                  {
                    mal: 'traffsaker_modifierare',
                    varde: 1,
                    nar: { har_utrustat_namn: ['Solring'] }
                  }
                ]
              }
            }
          };
        }
        return null;
      }
    });
    const list = [{
      namn: 'Skjutexpert',
      taggar: {
        regler: {
          andrar: [
            {
              mal: 'traffsaker_modifierare',
              varde: 2,
              nar: {
                avstand: true,
                'foremal.typ': ['Avståndsvapen']
              }
            },
            {
              mal: 'traffsaker_modifierare',
              varde: 3,
              nar: { har_utrustad_vapen_kvalitet: ['Precist'] }
            },
            {
              mal: 'traffsaker_modifierare',
              varde: 4,
              nar: { har_utrustad_typ: ['Amulett'] }
            },
            {
              mal: 'traffsaker_modifierare',
              varde: 5,
              nar: { har_utrustat_namn: ['Solring'] }
            },
            {
              mal: 'traffsaker_modifierare',
              varde: 6,
              nar: { har_utrustad_kvalitet: ['Välsignad'] }
            }
          ]
        }
      }
    }];
    const weaponFact = {
      entryRef: { namn: 'Långbåge', taggar: { typ: ['Avståndsvapen'] } },
      types: ['Avståndsvapen'],
      qualities: ['Precist']
    };
    const extraItemFact = {
      entryRef: { namn: 'Solring', taggar: { typ: ['Amulett'] } },
      types: ['Amulett'],
      qualities: ['Välsignad']
    };

    expect(rulesHelper.getEquippedAttackModifier(list, [weaponFact], {
      activeItemFact: weaponFact,
      equippedItemFacts: [extraItemFact]
    })).toBe(21);
  });

  it('supports forsvar_modifierare from equipped extra items', () => {
    const rulesHelper = loadRulesHelper({
      lookupEntry({ name }) {
        if (name === 'Välsignad') {
          return {
            namn: 'Välsignad',
            taggar: {
              regler: {
                andrar: [
                  {
                    mal: 'forsvar_modifierare',
                    varde: 1,
                    nar: { har_utrustat_namn: ['Skyddsring'] }
                  }
                ]
              }
            }
          };
        }
        return null;
      }
    });
    const list = [{
      namn: 'Försvarsstil',
      taggar: {
        regler: {
          andrar: [
            {
              mal: 'forsvar_modifierare',
              varde: 2,
              nar: { har_utrustat_namn: ['Skyddsring'] }
            },
            {
              mal: 'forsvar_modifierare',
              varde: 3,
              nar: { har_utrustad_typ: ['Ring'] }
            },
            {
              mal: 'forsvar_modifierare',
              varde: 4,
              nar: { har_utrustad_kvalitet: ['Välsignad'] }
            }
          ]
        }
      }
    }];
    const extraItemFact = {
      entryRef: {
        namn: 'Skyddsring',
        taggar: {
          typ: ['Ring'],
          regler: {
            andrar: [
              { mal: 'forsvar_modifierare', varde: 5 }
            ]
          }
        }
      },
      types: ['Ring'],
      qualities: ['Välsignad']
    };

    expect(rulesHelper.getEquippedDefenseModifier(list, [], {
      equippedItemFacts: [extraItemFact]
    })).toBe(15);
  });

  it('offers only directly addable requirement unlocks and flags locked ones', () => {
    const rulesHelper = loadRulesHelper({
      lookupEntry({ name }) {
        const entries = {
          'Målförmåga': {
            namn: 'Målförmåga',
            nivå: 'Novis',
            taggar: {
              typ: ['Förmåga'],
              regler: {
                kraver: [
                  { namn: ['Direkt krav'] },
                  { namn: ['Låst krav'] },
                  { namn: ['Krockkrav'] }
                ],
                kraver_logik: 'or'
              }
            }
          },
          'Direkt krav': {
            namn: 'Direkt krav',
            nivåer: { Novis: true },
            taggar: { typ: ['Förmåga'] }
          },
          'Låst krav': {
            namn: 'Låst krav',
            nivåer: { Novis: true },
            taggar: {
              typ: ['Förmåga'],
              regler: {
                kraver: [{ namn: ['Grundkrav'] }]
              }
            }
          },
          'Krockkrav': {
            namn: 'Krockkrav',
            nivåer: { Novis: true },
            taggar: {
              typ: ['Förmåga'],
              regler: {
                krockar: [{ namn: 'Redan vald' }]
              }
            }
          },
          'Grundkrav': {
            namn: 'Grundkrav',
            nivåer: { Novis: true },
            taggar: { typ: ['Förmåga'] }
          },
          'Redan vald': {
            namn: 'Redan vald',
            nivåer: { Novis: true },
            taggar: { typ: ['Förmåga'] }
          }
        };
        return entries[name] || null;
      }
    });

    const candidate = {
      namn: 'Målförmåga',
      nivå: 'Novis',
      taggar: {
        typ: ['Förmåga'],
        regler: {
          kraver: [
            { namn: ['Direkt krav'] },
            { namn: ['Låst krav'] },
            { namn: ['Krockkrav'] }
          ],
          kraver_logik: 'or'
        }
      }
    };
    const list = [{ namn: 'Redan vald', nivå: 'Novis', taggar: { typ: ['Förmåga'] } }];

    const options = rulesHelper.getRequirementAssistOptions(candidate, list, { level: 'Novis' });
    const byName = new Map(options.map(option => [option.name, option]));

    expect(byName.get('Direkt krav')).toBeTruthy();
    expect(byName.get('Låst krav')).toBeTruthy();
    expect(byName.get('Krockkrav')).toBeTruthy();

    const state = rulesHelper.evaluateRequirementAssistState(candidate, list, options, [], {
      action: 'add',
      level: 'Novis'
    });
    const stateByName = new Map(state.options.map(option => [option.name, option]));

    expect(stateByName.get('Direkt krav')?.disabled).toBe(false);
    expect(stateByName.get('Direkt krav')?.status).toBe('available');
    expect(stateByName.get('Låst krav')?.disabled).toBe(true);
    expect(stateByName.get('Låst krav')?.status).toBe('locked');
    expect(stateByName.get('Låst krav')?.messages?.join(' ')).toMatch(/Grundkrav/);
    expect(stateByName.get('Krockkrav')?.disabled).toBe(true);
    expect(stateByName.get('Krockkrav')?.status).toBe('conflict');

    const unlockedState = rulesHelper.evaluateRequirementAssistState(candidate, list, options, [
      byName.get('Direkt krav')?.key
    ], {
      action: 'add',
      level: 'Novis'
    });

    expect(unlockedState.unlocked).toBe(true);
    expect(unlockedState.targetStopResult?.hasStops).toBe(false);
  });

  it('lets type rules opt out of the requirement popup', () => {
    const rulesHelper = loadRulesHelper();

    const typeOptOutEntry = {
      namn: 'Järnsvuren',
      nivå: 'Novis',
      taggar: {
        typ: ['Elityrke']
      }
    };
    Object.defineProperty(typeOptOutEntry, '__typ_regler', {
      value: {
        Elityrke: {
          regler: {
            ignorera_krav_popup: true
          }
        }
      },
      enumerable: false,
      configurable: true
    });

    expect(rulesHelper.shouldSkipRequirementPopup(typeOptOutEntry, { level: 'Novis' })).toBe(true);

    const entryOverride = {
      ...typeOptOutEntry,
      taggar: {
        ...typeOptOutEntry.taggar,
        regler: {
          ignorera_krav_popup: false
        }
      }
    };
    Object.defineProperty(entryOverride, '__typ_regler', {
      value: typeOptOutEntry.__typ_regler,
      enumerable: false,
      configurable: true
    });

    expect(rulesHelper.shouldSkipRequirementPopup(entryOverride, { level: 'Novis' })).toBe(false);
  });
});
