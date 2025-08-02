const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
const match = code.match(/function tryBomb\(term\) {[^]*?}/);
assert(match, 'tryBomb function not found');

let deleted = false;
let reloaded = false;
const context = {
  storeHelper: { deleteAllCharacters: () => { deleted = true; } },
  store: {},
  location: { reload: () => { reloaded = true; } }
};
vm.createContext(context);
vm.runInContext(match[0], context);

assert.strictEqual(context.tryBomb('BOMB!'), true);
assert.strictEqual(deleted, true);
assert.strictEqual(reloaded, true);

deleted = false;
reloaded = false;
assert.strictEqual(context.tryBomb('bomb!'), false);
assert.strictEqual(deleted, false);
assert.strictEqual(reloaded, false);

console.log('All tests passed.');
