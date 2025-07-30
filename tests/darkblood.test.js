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
  { namn: 'Robust', taggar: { typ: ['S\u00e4rdrag'], ras: ['Rese', 'Troll'] }, nivaer: { Novis: '' } },
  { namn: 'Naturligt vapen', taggar: { typ: ['Monstru\u00f6st s\u00e4rdrag'] } },
  { namn: 'Pansar', taggar: { typ: ['Monstru\u00f6st s\u00e4rdrag'] } },
  { namn: 'Regeneration', taggar: { typ: ['Monstru\u00f6st s\u00e4rdrag'] } },
  { namn: 'Vingar', taggar: { typ: ['Monstru\u00f6st s\u00e4rdrag'] } }
];
global.DB = window.DB;
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DBIndex = window.DBIndex;
require("../js/lz-string.min.js");
require('../js/utils');
global.isRas = window.isRas;
require('../js/store');

function hasRobust(race) {
  const defaultMoney = { "\u00f6rtegar":0, skilling:0, daler:0 };
  const store = { current: 'c', data: { c: { privMoney: defaultMoney, possessionMoney: defaultMoney } } };
  const list = [
    { namn: race, taggar: { typ: ['Ras'] } },
    { namn: 'Robust', taggar: { typ: ['S\u00e4rdrag'], ras: ['Rese','Troll'] } }
  ];
  window.storeHelper.setCurrentList(store, list);
  return store.data.c.list.some(x => x.namn === 'Robust');
}

assert.strictEqual(hasRobust('Troll'), true);
assert.strictEqual(hasRobust('Rese'), true);
assert.strictEqual(hasRobust('M\u00e4nniska'), false);

console.log('All tests passed.');
