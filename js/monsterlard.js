(function(window){
  const SPECS = ['Bestar', 'Kulturvarelser', 'Odöda', 'Styggelser'];

  function getEntry() {
    if (typeof window.lookupEntry === 'function') {
      try {
        const hit = window.lookupEntry({ name: 'Monsterlärd' });
        if (hit && typeof hit === 'object') return hit;
      } catch (_) {
        // Fall through to legacy shim.
      }
    }
    return { namn: 'Monsterlärd', nivå: 'Gesäll' };
  }

  function pickSpec(used, cb) {
    const hasUsed = Array.isArray(used);
    const usedValues = hasUsed ? used : [];
    const done = typeof (hasUsed ? cb : used) === 'function' ? (hasUsed ? cb : used) : () => {};
    const picker = window.choicePopup;
    if (!picker || typeof picker.pickForEntry !== 'function') {
      done(null);
      return;
    }

    const entry = getEntry();
    const context = {
      entry,
      sourceEntry: entry,
      level: 'Gesäll',
      sourceLevel: 'Gesäll'
    };

    picker.pickForEntry({
      entry,
      context,
      usedValues,
      fallbackLegacy: true
    }).then(result => {
      done(result?.value ?? null);
    }).catch(() => done(null));
  }

  window.monsterLore = { pickSpec, SPECS: [...SPECS] };
})(window);
