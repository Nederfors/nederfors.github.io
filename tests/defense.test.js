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

// Add sample armor to database
window.DB.push({
  namn: 'Kråkrustning',
  taggar: { typ: ['Rustning'] },
  stat: { skydd: '1T6', begränsning: -3 }
});
window.DBIndex['Kråkrustning'] = window.DB[0];

const defaultMoney = { 'örtegar':0, skilling:0, daler:0 };
const store = { current: 'c', data: { c: { inventory: [ { name: 'Kråkrustning', qty: 1 } ], list: [], privMoney: defaultMoney, possessionMoney: defaultMoney } } };

global.store = store;
window.store = store;

const res = window.calcDefense(15);
assert.deepStrictEqual(res, [ { name: 'Kråkrustning', value: 12 } ]);

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
store.data.c.inventory.unshift({ name: 'Kråkrustning', qty: 1 });
const res4 = window.calcDefense(15);
assert.deepStrictEqual(res4, [ { name: 'Kråkrustning', value: 13 } ]);

console.log('All tests passed.');
