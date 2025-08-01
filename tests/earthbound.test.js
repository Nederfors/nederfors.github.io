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
  { namn: 'Jordnära', taggar: { typ: ['Särdrag'] } },
  { namn: 'Mörkt förflutet', taggar: { typ: ['Nackdel'] } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });

global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');

global.isRas = window.isRas;
global.isElityrke = window.isElityrke;
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

const defaultMoney = { "örtegar":0, skilling:0, daler:0 };
const store = { current: 'c', data: { c: { privMoney: defaultMoney, possessionMoney: defaultMoney } } };
const list = [
  { namn: 'Jordnära', taggar: { typ: ['Särdrag'] } },
  { namn: 'Mörkt förflutet', taggar: { typ: ['Nackdel'] } }
];
window.storeHelper.setCurrentList(store, list);
const hasDarkPast = store.data.c.list.some(x => x.namn === 'Mörkt förflutet');
assert.strictEqual(hasDarkPast, false);

// Additional check for Earthbound effects on pain threshold and corruption
const effects = { corruption: 2 };
const perm = window.storeHelper.calcPermanentCorruption(store.data.c.list, effects);
assert.strictEqual(perm, 2);
const pain = window.storeHelper.calcPainThreshold(10, store.data.c.list, effects);
assert.strictEqual(pain, 4);
assert.strictEqual(perm % 2, 0);

console.log('All tests passed.');
