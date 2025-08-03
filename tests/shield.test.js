const assert = require('assert');

// Minimal DOM/window stubs
global.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: [],
  DBIndex: {},
};
global.localStorage = window.localStorage;

global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/utils');
global.splitQuals = window.splitQuals;
require('../js/store');
global.storeHelper = window.storeHelper;
global.SBASE = 10; // needed for inventory utils
global.OBASE = 10;
require('../js/inventory-utils');
global.invUtil = window.invUtil;
require('../js/traits-utils');

// Stub helper methods for forging
storeHelper.getCurrentList = () => [];
storeHelper.getPartySmith = () => 'Novis';
storeHelper.getPartyAlchemist = () => null;
storeHelper.getPartyArtefacter = () => null;
storeHelper.abilityLevel = () => 0;

// Add shield entry with only the type 'Sköld'
window.DB.push({
  namn: 'Sköld',
  taggar: { typ: ['Sköld'] },
  stat: { skada: '1T4' },
  grundpris: { daler: 3, skilling: 0, 'örtegar': 0 },
});
window.DBIndex['Sköld'] = window.DB[0];

const defaultMoney = { 'örtegar':0, skilling:0, daler:0 };
const store = { current: 'c', data: { c: { inventory: [ { name: 'Sköld', qty: 1 } ], list: [], privMoney: defaultMoney, possessionMoney: defaultMoney } } };

global.store = store;
window.store = store;

// Shield should benefit from forging discounts like a weapon
const cost = invUtil.calcEntryCost(window.DBIndex['Sköld']);
assert.deepStrictEqual(cost, { d:1, s:5, o:0 });

// Shield should provide +1 defense on its own
const res = window.calcDefense(15);
assert.deepStrictEqual(res, [ { value: 16 } ]);

console.log('Shield treated as weapon tests passed.');
