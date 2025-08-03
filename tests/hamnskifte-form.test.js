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
  { namn: 'Regeneration', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

function xpFor(items){
  const list = items.map(it => {
    const base = window.DBIndex[it.namn] || {};
    return { ...base, ...it };
  });
  return window.storeHelper.calcUsedXP(list, {});
}

(function test(){
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' };
  const nvBeast = { namn:'Naturligt vapen: Hamnskifte', taggar:{typ:['Monstruöst särdrag']}, form:'beast' };
  const nvNorm = { namn:'Naturligt vapen', taggar:{typ:['Monstruöst särdrag']}, form:'normal' };
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Mästare' };
  const regBeast = { namn:'Regeneration: Hamnskifte', taggar:{typ:['Monstruöst särdrag']}, form:'beast' };
  const regNorm = { namn:'Regeneration', taggar:{typ:['Monstruöst särdrag']}, form:'normal' };

  assert.strictEqual(xpFor([hamGes, nvNorm]), 40);
  assert.strictEqual(xpFor([hamGes, nvBeast]), 30);

  assert.strictEqual(xpFor([hamMas, regNorm]), 70);
  assert.strictEqual(xpFor([hamMas, regBeast]), 60);

  console.log('All tests passed.');
})();
