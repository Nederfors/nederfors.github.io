const assert = require('assert');
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '../js/index-view.js'), 'utf8');
const match = code.match(/if \(isMonstrousTrait\(p\)\) {([^]*?)if \(!monsterOk\)/);
assert(match, 'monstrous trait block not found');
const fn = new Function('p', 'list', 'lvl', 'isRas', 'storeHelper', match[1] + 'return monsterOk;');

const isRas = x => (x.taggar?.typ || []).includes('Ras');
const abilityLevel = () => 0;

function canTake(list) {
  const p = { namn: 'Robust', taggar: { typ: ['Monstruöst särdrag'] } };
  return fn(p, list, 'Novis', isRas, { abilityLevel, HAMNSKIFTE_BASE: {} });
}

assert.strictEqual(canTake([{ namn: 'Rese', taggar: { typ: ['Ras'] } }]), true);
assert.strictEqual(canTake([
  { namn: 'Människa', taggar: { typ: ['Ras'] } },
  { namn: 'Mörkt blod' }
]), true);
assert.strictEqual(canTake([{ namn: 'Människa', taggar: { typ: ['Ras'] } }]), false);

console.log('All tests passed.');
