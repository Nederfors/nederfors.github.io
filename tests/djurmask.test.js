const assert = require('assert');

global.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: [],
  DBIndex: {}
};
global.localStorage = window.localStorage;

require('../js/lz-string.min.js');
require('../js/utils');
require('../js/store');
require('../js/djurmask');

const defaultMoney = { "\u00f6rtegar":0, skilling:0, daler:0 };
const store = { current:'c', data:{ c:{ inventory:[
  { name:'Djurmask', trait:'Stark', qty:1 },
  { name:'Djurmask', trait:'Kvick', qty:1 }
], privMoney: defaultMoney, possessionMoney: defaultMoney } } };

const bonuses = window.animalMask.getBonuses(store.data.c.inventory);
assert.deepStrictEqual(bonuses, { Stark:1, Kvick:1 });
assert.strictEqual(window.animalMask.getBonus('Stark', store.data.c.inventory), 1);
console.log('All tests passed.');
