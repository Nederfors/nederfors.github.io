const assert = require('assert');

// Minimal DOM/window stubs
global.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: [],
  DBIndex: {}
};
global.localStorage = window.localStorage;

// Populate minimal database entries
window.DB = [
  { namn: 'Dvärg', taggar: { typ: ['Ras'] } },
  { namn: 'Människa', taggar: { typ: ['Ras'] } },
  { namn: 'Vedergällning', taggar: { typ: ['Mystisk kraft'], ark_trad: ['Svartkonst'] },
    nivåer: { Novis: '', Gesäll: '', Mästare: '' } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isRas = window.isRas;
global.explodeTags = window.explodeTags;
require('../js/store');

function permForRace(race, level) {
  const defaultMoney = { "örtegar":0, skilling:0, daler:0 };
  const store = { current: 'c', data: { c: { privMoney: defaultMoney, possessionMoney: defaultMoney } } };
  const list = [
    { namn: race, taggar: { typ: ['Ras'] } },
    { namn: 'Vedergällning', taggar: { typ: ['Mystisk kraft'], ark_trad: ['Svartkonst'] }, nivå: level }
  ];
  window.storeHelper.setCurrentList(store, list);
  return window.storeHelper.calcPermanentCorruption(store.data.c.list, {});
}

assert.strictEqual(permForRace('Dvärg', 'Novis'), 0);
assert.strictEqual(permForRace('Dvärg', 'Mästare'), 0);
assert.strictEqual(permForRace('Människa', 'Novis'), 1);
assert.strictEqual(permForRace('Människa', 'Mästare'), 3);

console.log('All tests passed.');
