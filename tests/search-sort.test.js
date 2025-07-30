const assert = require('assert');

// Stub minimal window
global.window = {
  localStorage: { getItem: () => null, setItem: () => {} }
};

require('../js/utils');

const entries = [
  { namn: 'Gruvhacka', beskrivning: 'Ett robust verktyg', taggar: { typ: ['S\u00e4rdrag'] } },
  { namn: 'M\u00f6rkt blod', beskrivning: 'Robust beskrivning', taggar: { typ: ['S\u00e4rdrag'] } },
  { namn: 'Robust', beskrivning: 'S\u00e4rdrag', taggar: { typ: ['S\u00e4rdrag'] } }
];

entries.sort(window.createSearchSorter(['robust']));

assert.strictEqual(entries[0].namn, 'Robust');
assert.deepStrictEqual(entries.slice(1).map(e => e.namn), ['Gruvhacka', 'M\u00f6rkt blod']);

console.log('All tests passed.');
