const assert = require('assert');

// Minimal DOM/window stubs
global.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: []
};
global.localStorage = window.localStorage;

// Populate minimal database entries
window.DB = [
  { namn: 'Robust', taggar: { typ: ['S\u00e4rdrag'] }, nivaer: { Novis: '' } },
  { namn: 'R\u00e5styrka', taggar: { typ: ['F\u00f6rdel'] } }
];
global.DB = window.DB;
require('../js/utils');
global.isRas = window.isRas;
global.isElityrke = window.isElityrke;
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

const defaultMoney = { "\u00f6rtegar":0, skilling:0, daler:0 };
const store = { current: 'c', data: { c: { privMoney: defaultMoney, possessionMoney: defaultMoney } } };
const list = [
  { namn: 'Robust', taggar: { typ: ['S\u00e4rdrag'] }, niv\u00e5: 'Novis' },
  { namn: 'R\u00e5styrka', taggar: { typ: ['F\u00f6rdel'] } }
];
window.storeHelper.setCurrentList(store, list);
const deps = window.storeHelper.getDependents(store.data.c.list, 'Robust');
assert.deepStrictEqual(deps, ['R\u00e5styrka']);

console.log('All tests passed.');
