const assert = require('assert');

function calcPain(val, list) {
  let pain = Math.ceil(val / 2);
  const painBonus = list.filter(e => e === 'Smärttålig').length;
  const painPenalty = list.filter(e => e === 'Bräcklig').length;
  pain += painBonus - painPenalty;
  return pain;
}

assert.strictEqual(calcPain(11, []), 6);
assert.strictEqual(calcPain(12, ['Smärttålig']), 7);
assert.strictEqual(calcPain(10, ['Bräcklig']), 4);
assert.strictEqual(calcPain(10, ['Smärttålig', 'Bräcklig', 'Bräcklig']), 4);

console.log('All tests passed.');
