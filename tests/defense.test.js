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
window.DB.push({ namn: 'Kråkrustning', taggar: { typ: ['Rustning'] }, stat: { skydd: '1T4', begränsning: -3 } });
window.DBIndex['Kråkrustning'] = window.DB[window.DB.length - 1];
store.data.c.inventory.unshift({ name: 'Kråkrustning', qty: 1 });
const res4 = window.calcDefense(15);
assert.deepStrictEqual(res4, [ { name: 'Kråkrustning', value: 13 } ]);

// Stavkamp grants +1 defense with a long weapon
window.DB.push({ namn: 'Spjut', taggar: { typ: ['Vapen'], kvalitet: ['Långt'] } });
window.DBIndex['Spjut'] = window.DB[window.DB.length - 1];
store.data.c.inventory = [ { name: 'Spjut', qty: 1 } ];
store.data.c.list = [ { namn: 'Stavkamp', nivå: 'Novis', taggar: { typ: ['Förmåga'] } } ];
const res5 = window.calcDefense(15);
assert.deepStrictEqual(res5, [ { value: 16 } ]);

// Stavkamp grants +2 defense with a runstav or trästav
window.DB.push({ namn: 'Runstav', taggar: { typ: ['Vapen'], kvalitet: ['Långt'] } });
window.DBIndex['Runstav'] = window.DB[window.DB.length - 1];
store.data.c.inventory = [ { name: 'Runstav', qty: 1 } ];
const res6 = window.calcDefense(15);
assert.deepStrictEqual(res6, [ { value: 17 } ]);

console.log('All tests passed.');
