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
  { namn: 'Hamnskifte', taggar: { typ: ['Förmåga'] }, nivåer: { Novis:'', 'Gesäll':'', 'Mästare':'' } },
  { namn: 'Naturligt vapen', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } },
  { namn: 'Pansar', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } },
  { namn: 'Regeneration', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } },
  { namn: 'Robust', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } },
  { namn: 'Vingar', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

function limit(list, name){
  return window.storeHelper.monsterStackLimit(list, name);
}

(function test(){
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' };
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Mästare' };

  assert.strictEqual(limit([], 'Naturligt vapen'), 1);
  assert.strictEqual(limit([hamGes], 'Naturligt vapen'), 2);
  assert.strictEqual(limit([hamGes], 'Pansar'), 2);
  assert.strictEqual(limit([hamGes], 'Regeneration'), 1);
  assert.strictEqual(limit([hamMas], 'Regeneration'), 2);
  assert.strictEqual(limit([hamMas], 'Robust'), 2);
  assert.strictEqual(limit([hamMas], 'Vingar'), 1);
  assert.strictEqual(limit([hamGes], 'Naturligt vapen: Hamnskifte'), 2);
  assert.strictEqual(limit([hamMas], 'Regeneration: Hamnskifte'), 2);

  console.log('All tests passed.');
})();
