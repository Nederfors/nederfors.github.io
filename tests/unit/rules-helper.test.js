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

function createSandbox(storageSeed = {}) {
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
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadRulesHelper() {
  const sandbox = createSandbox();
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
});
