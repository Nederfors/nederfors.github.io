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
  { namn: 'Naturligt vapen', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'' } },
  { namn: 'Pansar', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'' } },
  { namn: 'Regeneration', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'' } },
  { namn: 'Robust', taggar: { typ: ['Monstruöst särdrag'] }, nivåer: { Novis:'' } }
];
window.DB.forEach(e => { window.DBIndex[e.namn] = e; });
global.DB = window.DB;
global.DBIndex = window.DBIndex;

require('../js/lz-string.min.js');
require('../js/utils');
global.isMonstrousTrait = window.isMonstrousTrait;
global.isRas = window.isRas;
global.isElityrke = window.isElityrke;
require('../js/store');

const defaultMoney = { "örtegar":0, skilling:0, daler:0 };

function traitsFor(level){
  const store = { current: 'c', data: { c: { privMoney: defaultMoney, possessionMoney: defaultMoney } } };
  const list = [ { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå: level } ];
  window.storeHelper.setCurrentList(store, list);
  return store.data.c.list.filter(x => ['Naturligt vapen','Pansar','Robust','Regeneration'].includes(x.namn)).map(x => x.namn).sort();
}

assert.deepStrictEqual(traitsFor('Novis'), []);
assert.deepStrictEqual(traitsFor('Gesäll'), ['Naturligt vapen','Pansar'].sort());
assert.deepStrictEqual(traitsFor('Mästare'), ['Naturligt vapen','Pansar','Regeneration','Robust'].sort());

(function testDependents(){
  const store = { current:'c', data:{ c:{ privMoney:defaultMoney, possessionMoney:defaultMoney } } };
  const list = [ { namn:'Hamnskifte', taggar:{typ:['Förmåga']}, nivå:'Gesäll' } ];
  window.storeHelper.setCurrentList(store, list);
  const deps = window.storeHelper.getDependents(store.data.c.list, 'Hamnskifte').sort();
  assert.deepStrictEqual(deps, ['Naturligt vapen','Pansar']);
})();

console.log('All tests passed.');
