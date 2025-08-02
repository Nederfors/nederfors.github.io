const assert = require('assert');

global.window = { localStorage: { getItem: () => null, setItem: () => {} } };
global.localStorage = window.localStorage;

require('../js/inventory-utils');

const { addWellEquippedItems, removeWellEquippedItems } = window.invUtil;

// Adding items should populate inventory with the perk flag
let inv = [];
addWellEquippedItems(inv);
assert.strictEqual(inv.length, 7);
assert(inv.every(r => r.perk === 'Välutrustad'));

// Removing should clean up all perk items entirely
removeWellEquippedItems(inv);
assert.deepStrictEqual(inv, []);

// Partial removal when other quantities exist
inv = [
  { name: 'Fackla', qty: 5, gratis: 3, perk: 'Välutrustad', perkGratis: 3 },
  { name: 'Rep, 10 meter', qty: 1 }
];
removeWellEquippedItems(inv);
assert.deepStrictEqual(inv, [
  { name: 'Fackla', qty: 2, gratis: 0 },
  { name: 'Rep, 10 meter', qty: 1 }
]);

console.log('All tests passed.');
