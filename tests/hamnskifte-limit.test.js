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

const defaultMoney = { "örtegar":0, skilling:0, daler:0 };

function limit(list, item, lvl){
  return window.storeHelper.hamnskifteNoviceLimit(list, item, lvl);
}

(function test(){
  const hamGes = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' };
  const nvBeast = { namn:'Naturligt vapen: Hamnskifte', taggar:{typ:['Monstruöst särdrag']}, form:'beast' };
  assert.strictEqual(limit([hamGes, nvBeast], nvBeast, 'Gesäll'), true);
  assert.strictEqual(limit([hamGes, nvBeast, { namn:'Blodvadare', taggar:{typ:['Yrke']} }], nvBeast, 'Gesäll'), false);
  assert.strictEqual(limit([hamGes, nvBeast, { namn:'Mörkt blod', taggar:{typ:['Fördel']} }], nvBeast, 'Gesäll'), true);
  const hamMas = { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Mästare' };
  const robBeast = { namn:'Robust: Hamnskifte', taggar:{typ:['Monstruöst särdrag']}, form:'beast' };
  assert.strictEqual(limit([hamMas, robBeast], robBeast, 'Gesäll'), true);
  const robBase = { namn:'Robust', nivå:'Novis', taggar:{typ:['Monstruöst särdrag']} };
  assert.strictEqual(limit([hamMas, robBeast, robBase], robBase, 'Gesäll'), false);

  const store = { current:'c', data:{ c:{ privMoney:defaultMoney, possessionMoney:defaultMoney } } };
  const list = [hamMas, robBase];
  window.storeHelper.setCurrentList(store, list);
  const hamRob = store.data.c.list.find(x=>x.namn==='Robust: Hamnskifte');
  hamRob.nivå = 'Gesäll';
  window.storeHelper.setCurrentList(store, store.data.c.list);
  const base = store.data.c.list.find(x=>x.namn==='Robust');
  assert.strictEqual(base.nivå, 'Novis');
  console.log('All tests passed.');
})();
