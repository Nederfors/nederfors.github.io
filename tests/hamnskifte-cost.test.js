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
  { namn: 'Hamnskifte', taggar: { typ: ['Förmåga','Mystisk kraft'] }, nivåer: { Novis:'', 'Gesäll':'', 'Mästare':'' } },
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

  const nv = { ...window.DB.find(x => x.namn === 'Naturligt vapen'), namn:'Naturligt vapen: Hamnskifte', form:'beast' };
  const pan = { ...window.DB.find(x => x.namn === 'Pansar'), namn:'Pansar: Hamnskifte', form:'beast' };
  const reg = { ...window.DB.find(x => x.namn === 'Regeneration'), namn:'Regeneration: Hamnskifte', form:'beast' };
  const rob = { ...window.DB.find(x => x.namn === 'Robust'), namn:'Robust: Hamnskifte', form:'beast' };
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga','Mystisk kraft']}, nivå:'Gesäll' };
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga','Mystisk kraft']}, nivå:'Mästare' };

  // No Hamnskifte: full cost
  assert.strictEqual(xpFor([nv]), 10);

  // Gesäll Hamnskifte: Naturligt vapen och Pansar free
  assert.strictEqual(xpFor([hamGes, nv, pan]), 30);

  // Gesäll-level trait upgrade still costs XP
  assert.strictEqual(
    xpFor([hamGes, { ...nv, nivå: 'Gesäll' }]),
    50
  );

  // Mästare Hamnskifte: all four free
  assert.strictEqual(xpFor([hamMas, reg, rob]), 60);

  // Mästare-level trait upgrade still costs XP
  assert.strictEqual(
    xpFor([hamMas, { ...reg, nivå: 'Mästare' }]),
    110
  );

  console.log('All tests passed.');
}
