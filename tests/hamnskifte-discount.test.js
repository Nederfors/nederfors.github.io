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
  { namn: 'Naturligt vapen', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'', Gesäll:'', Mästare:'' } },
  { namn: 'Regeneration', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'', Gesäll:'', Mästare:'' } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

test();

function xpFor(items){
  const list = items.map(it => {
    const base = window.DBIndex[it.namn] || {};
    return { ...base, ...it };
  });
  return window.storeHelper.calcUsedXP(list, {});
}

function test(){
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' };
  const nvGes = { namn:'Naturligt vapen', taggar:{typ:['Monstruöst särdrag']}, nivå:'Gesäll' };
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Mästare' };
  const regGes = { namn:'Regeneration', taggar:{typ:['Monstruöst särdrag']}, nivå:'Gesäll' };

  assert.strictEqual(xpFor([hamGes, nvGes]), 50);
  assert.strictEqual(xpFor([hamMas, regGes]), 80);

  console.log('All tests passed.');
}
