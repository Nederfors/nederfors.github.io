const assert = require('assert');

// Minimal DOM/window stubs
global.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: [],
  DBIndex: {}
};
global.localStorage = window.localStorage;

global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/utils');
global.splitQuals = window.splitQuals;
require('../js/store');
global.storeHelper = window.storeHelper;
require('../js/inventory-utils');
global.invUtil = window.invUtil;
require('../js/traits-utils');

// Add sample armors to database
window.DB.push({
  namn: 'Smidig rustning',
  taggar: { typ: ['Rustning'] },
  kvalitet: 'Smidigt',
  stat: { skydd: '1T4', begränsning: -2 }
});
window.DBIndex['Smidig rustning'] = window.DB[0];

window.DB.push({
  namn: 'Otymplig rustning',
  taggar: { typ: ['Rustning'] },
  kvalitet: 'Otympligt',
  stat: { skydd: '1T4', begränsning: -2 }
});
window.DBIndex['Otymplig rustning'] = window.DB[1];

const defaultMoney = { 'örtegar':0, skilling:0, daler:0 };
const store = { current: 'c', data: { c: { inventory: [ { name: 'Smidig rustning', qty: 1 } ], list: [], privMoney: defaultMoney, possessionMoney: defaultMoney } } };

global.store = store;
window.store = store;

// Smidigt should remove the limitation
let res = window.calcDefense(15);
assert.deepStrictEqual(res, [ { name: 'Smidig rustning', value: 15 } ]);
let html = window.itemStatHtml(window.DBIndex['Smidig rustning'], store.data.c.inventory[0]);
assert(html.includes('Begränsning: 0'));

// Otympligt should increase the limitation by one
store.data.c.inventory = [ { name: 'Otymplig rustning', qty: 1 } ];
res = window.calcDefense(15);
assert.deepStrictEqual(res, [ { name: 'Otymplig rustning', value: 12 } ]);
html = window.itemStatHtml(window.DBIndex['Otymplig rustning'], store.data.c.inventory[0]);
assert(html.includes('Begränsning: -3'));

// No armor should still yield a defense value with zero limitation
store.data.c.inventory = [];
const res2 = window.calcDefense(15);
assert.deepStrictEqual(res2, [ { value: 15 } ]);

console.log('All tests passed.');
