const assert = require('assert');

global.window = {};
const store = { current: 'c', data: { c: { forcedDefense: '' } } };
global.store = store;
const levels = { Novis:1, 'Gesäll':2, 'Mästare':3 };
global.storeHelper = {
  abilityLevel: (list, name) => {
    const it = list.find(x => x.namn === name);
    return it ? (levels[it.nivå] || 0) : 0;
  },
  getDefenseTrait: s => s.data[s.current].forcedDefense || ''
};
require('../js/traits-utils');
const getDefenseTraitName = window.getDefenseTraitName;

// Default to Kvick
assert.strictEqual(getDefenseTraitName([]), 'Kvick');
// Forced trait overrides
store.data.c.forcedDefense = 'Listig';
assert.strictEqual(getDefenseTraitName([]), 'Listig');
store.data.c.forcedDefense = '';
// Ability checks
assert.strictEqual(getDefenseTraitName([{ namn:'Fint', nivå:'Gesäll' }]), 'Diskret');
assert.strictEqual(getDefenseTraitName([{ namn:'Sjätte Sinne', nivå:'Gesäll' }]), 'Vaksam');
assert.strictEqual(getDefenseTraitName([{ namn:'Taktiker', nivå:'Gesäll' }]), 'Listig');
assert.strictEqual(getDefenseTraitName([{ namn:'Pareringsmästare', nivå:'Novis' }]), 'Träffsäker');
// Priority: Fint over Pareringsmästare
assert.strictEqual(getDefenseTraitName([
  { namn:'Fint', nivå:'Gesäll' },
  { namn:'Pareringsmästare', nivå:'Novis' }
]), 'Diskret');
// Novis levels shouldn't trigger Vaksam
assert.strictEqual(
  getDefenseTraitName([{ namn: 'Sjätte Sinne', nivå: 'Novis' }]),
  'Kvick'
);
// Fint has priority over Sjätte Sinne
assert.strictEqual(getDefenseTraitName([
  { namn: 'Fint', nivå: 'Gesäll' },
  { namn: 'Sjätte Sinne', nivå: 'Gesäll' }
]), 'Diskret');

console.log('All tests passed.');
