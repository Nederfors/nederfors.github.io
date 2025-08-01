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
  { namn: 'Naturligt vapen', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'', Gesäll:'' } },
  { namn: 'Pansar', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'', Gesäll:'' } },
  { namn: 'Regeneration', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'', Gesäll:'' } },
  { namn: 'Robust', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'', Gesäll:'' } },
  { namn: 'Blodvadare', taggar: { typ: ['Yrke'] } },
  { namn: 'Mörkt blod', taggar: { typ: ['Fördel'] } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
global.isRas = window.isRas;
require('../js/store');

function limit(list, name, lvl){
  return window.storeHelper.hamnskifteNoviceLimit(list, name, lvl);
}

(function test(){
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' };
  assert.strictEqual(limit([hamGes], 'Naturligt vapen', 'Gesäll'), true);
  assert.strictEqual(limit([hamGes, { namn:'Blodvadare', taggar:{typ:['Yrke']} }], 'Naturligt vapen', 'Gesäll'), false);
  assert.strictEqual(limit([hamGes, { namn:'Mörkt blod', taggar:{typ:['Fördel']} }], 'Naturligt vapen', 'Gesäll'), false);
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Mästare' };
  assert.strictEqual(limit([hamMas], 'Robust', 'Gesäll'), true);
  console.log('All tests passed.');
})();
