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
  { namn: 'Robust', taggar: { typ: ['Monstruöst särdrag'] }, nivåer:{ Novis:'' } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
require('../js/store');

test();

function test(){
  const defaultMoney = { "örtegar":0, skilling:0, daler:0 };
  function xpFor(items){
    const list = items.map(it => {
      const base = window.DBIndex[it.namn] || {};
      return { ...base, ...it };
    });
    return window.storeHelper.calcUsedXP(list, {});
  }

  const nv = window.DB.find(x => x.namn === 'Naturligt vapen');
  const pan = window.DB.find(x => x.namn === 'Pansar');
  const reg = window.DB.find(x => x.namn === 'Regeneration');
  const rob = window.DB.find(x => x.namn === 'Robust');
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' };
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Mästare' };

  // No Hamnskifte: full cost
  assert.strictEqual(xpFor([nv]), 10);

  // Gesäll Hamnskifte: Naturligt vapen och Pansar free
  assert.strictEqual(xpFor([hamGes, nv, pan]), 30);

  // Mästare Hamnskifte: all four free
  assert.strictEqual(xpFor([hamMas, reg, rob]), 60);

  console.log('All tests passed.');
}
