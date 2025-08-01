const assert = require('assert');

global.window = {
  localStorage: { getItem: () => null, setItem: () => {} },
  DB: [],
  DBIndex: {}
};

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

delete global.window.DB;

test();

function test(){
  const ability = { namn: 'Testförmåga', taggar:{ typ:['Förmåga']}, nivå:'Novis', nivåer:{Novis:''} };
  const ritual = { namn: 'Testritual', taggar:{ typ:['Ritual'] } };
  const dis = { namn: 'Dålig vana', taggar:{ typ:['Nackdel'] } };
  assert.strictEqual(window.storeHelper.calcEntryXP(ability), 10);
  assert.strictEqual(window.storeHelper.calcEntryXP(ritual), 10);
  assert.strictEqual(window.storeHelper.calcEntryXP(dis), -5);
  console.log('All tests passed.');
}
