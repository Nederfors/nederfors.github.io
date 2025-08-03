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

window.DB.push({
  namn: 'Kråkrustning',
  taggar: { typ: ['Rustning'] },
  stat: { skydd: '1T6', begränsning: -3 }
});
window.DBIndex['Kråkrustning'] = window.DB[2];

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
window.DBIndex['Svärd'] = window.DB[3];
store.data.c.inventory = [ { name: 'Svärd', qty: 1, kvaliteter: ['Balanserat'] } ];
const res3 = window.calcDefense(15);
assert.deepStrictEqual(res3, [ { value: 16 } ]);

// Balanced weapon bonus stacks with armor
window.DB.push({
  namn: 'Kråkrustning',
  taggar: { typ: ['Rustning'] },
  kvalitet: 'Otymplig',
  stat: { skydd: '1T6', begränsning: -3 }
});
window.DBIndex['Kråkrustning'] = window.DB[3];
store.data.c.inventory.unshift({ name: 'Kråkrustning', qty: 1 });
const res4 = window.calcDefense(15);
assert.deepStrictEqual(res4, [ { name: 'Kråkrustning', value: 13 } ]);

// Tvillingattack grants +1 defense when wielding two weapons
window.DB.push({ namn: 'Kniv', taggar: { typ: ['Vapen'] } });
window.DB.push({ namn: 'Yxa', taggar: { typ: ['Vapen'] } });
store.data.c.inventory = [
  { name: 'Kniv', qty: 1 },
  { name: 'Yxa', qty: 1 }
];
store.data.c.list = [
  { namn: 'Tvillingattack', nivå: 'Novis', taggar: { typ: ['Förmåga'] } }
];
const res5 = window.calcDefense(15);
assert.deepStrictEqual(res5, [ { value: 16 } ]);

// No bonus with only one weapon
store.data.c.inventory = [ { name: 'Kniv', qty: 1 } ];
const res6 = window.calcDefense(15);
assert.deepStrictEqual(res6, [ { value: 15 } ]);

// Manteldans Novis should grant +1 defense
store.data.c.inventory = [];
store.data.c.list = [ { namn: 'Manteldans', nivå: 'Novis', taggar: { typ: ['Förmåga'] } } ];
const res7 = window.calcDefense(15);
assert.deepStrictEqual(res7, [ { value: 16 } ]);

// Manteldans stacks with balanced weapon
store.data.c.inventory = [ { name: 'Svärd', qty: 1, kvaliteter: ['Balanserat'] } ];
const res8 = window.calcDefense(15);
assert.deepStrictEqual(res8, [ { value: 17 } ]);

// Stavkamp grants +1 defense with a long weapon
window.DB.push({ namn: 'Spjut', taggar: { typ: ['Vapen'], kvalitet: ['Långt'] } });
window.DBIndex['Spjut'] = window.DB[window.DB.length - 1];
store.data.c.inventory = [ { name: 'Spjut', qty: 1 } ];
store.data.c.list = [ { namn: 'Stavkamp', nivå: 'Novis', taggar: { typ: ['Förmåga'] } } ];
const res9 = window.calcDefense(15);
assert.deepStrictEqual(res9, [ { value: 16 } ]);

// Stavkamp grants +2 defense with a long runstav or trästav
window.DB.push({ namn: 'Vandringsstav', taggar: { typ: ['Vapen'], kvalitet: ['Långt'] } });
window.DBIndex['Vandringsstav'] = window.DB[window.DB.length - 1];
store.data.c.inventory = [ { name: 'Vandringsstav', qty: 1 } ];
store.data.c.list = [ { namn: 'Stavkamp', nivå: 'Novis', taggar: { typ: ['Förmåga'] } } ];
const res10 = window.calcDefense(15);
assert.deepStrictEqual(res10, [ { value: 17 } ]);

// A shield grants +1 defense
window.DB.push({ namn: 'Sköld', taggar: { typ: ['Vapen', 'Sköld'] } });
window.DBIndex['Sköld'] = window.DB[window.DB.length - 1];
store.data.c.inventory = [ { name: 'Sköld', qty: 1 } ];
store.data.c.list = [];
const res11 = window.calcDefense(15);
assert.deepStrictEqual(res11, [ { value: 16 } ]);

// Sköldkamp Novis grants an additional +1 defense when using a shield
  store.data.c.inventory = [ { name: 'Sköld', qty: 1 } ];
  store.data.c.list = [ { namn: 'Sköldkamp', nivå: 'Novis', taggar: { typ: ['Förmåga'] } } ];
  const res12 = window.calcDefense(15);
  assert.deepStrictEqual(res12, [ { value: 17 } ]);

  // Robust Novis reduces defense by 2
  store.data.c.inventory = [];
  store.data.c.list = [ { namn: 'Robust', nivå: 'Novis', taggar: { typ: ['S\u00e4rdrag'] } } ];
  const res13 = window.calcDefense(15);
  assert.deepStrictEqual(res13, [ { value: 13 } ]);

  // Robust Ges\u00e4ll reduces defense by 3
  store.data.c.list[0].niv\u00e5 = 'Ges\u00e4ll';
  const res14 = window.calcDefense(15);
  assert.deepStrictEqual(res14, [ { value: 12 } ]);

  // Robust M\u00e4stare reduces defense by 4
  store.data.c.list[0].niv\u00e5 = 'M\u00e4stare';
  const res15 = window.calcDefense(15);
  assert.deepStrictEqual(res15, [ { value: 11 } ]);

  // Robust: Hamnskifte ignores inventory but allows abilities
  store.data.c.inventory = [ { name: 'Sv\u00e4rd', qty: 1, kvaliteter: ['Balanserat'] } ];
  store.data.c.list = [
    { namn: 'Robust', niv\u00e5: 'Novis', taggar: { typ: ['S\u00e4rdrag'] }, form: 'beast' },
    { namn: 'Manteldans', niv\u00e5: 'Novis', taggar: { typ: ['F\u00f6rm\u00e5ga'] } }
  ];
  const res16 = window.calcDefense(15);
  assert.deepStrictEqual(res16, [
    { value: 17 },
    { name: 'Robust: Hamnskifte', value: 14 }
  ]);

  console.log('All tests passed.');
