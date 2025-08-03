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

// A balanced weapon grants +1 defense even without armor
window.DB.push({ namn: 'Svärd', taggar: { typ: ['Vapen'] } });
window.DBIndex['Svärd'] = window.DB[1];
store.data.c.inventory = [ { name: 'Svärd', qty: 1, kvaliteter: ['Balanserat'] } ];
const res3 = window.calcDefense(15);
assert.deepStrictEqual(res3, [ { value: 16 } ]);

// Balanced weapon bonus stacks with armor
store.data.c.inventory.unshift({ name: 'Otymplig rustning', qty: 1 });
const res4 = window.calcDefense(15);
assert.deepStrictEqual(res4, [ { name: 'Otymplig rustning', value: 13 } ]);

// Robust trait reduces defense
store.data.c.inventory = [];
store.data.c.list = [ { namn: 'Robust', taggar: { typ: ['S\u00e4rdrag'] }, nivå: 'Novis' } ];
const res5 = window.calcDefense(15);
assert.deepStrictEqual(res5, [ { value: 13 } ]);

// Robust via Hamnskifte adds separate defense value
store.data.c.inventory = [ { name: 'Smidig rustning', qty: 1 } ];
store.data.c.list = [ { namn: 'Robust', taggar: { typ: ['Monstruöst särdrag'] }, nivå: 'Novis', form: 'beast' } ];
const res6 = window.calcDefense(15);
assert.deepStrictEqual(res6, [
  { name: 'Smidig rustning', value: 15 },
  { name: 'Hamnskifte', value: 13 }
]);

console.log('All tests passed.');
