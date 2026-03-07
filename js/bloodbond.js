(function(window){
  function getEntry() {
    if (typeof window.lookupEntry === 'function') {
      try {
        const hit = window.lookupEntry({ name: 'Blodsband' });
        if (hit && typeof hit === 'object') return hit;
      } catch (_) {
        // Fall through to fallback.
      }
    }
    return { namn: 'Blodsband' };
  }

  function pickRace(used, cb){
    const hasUsed = Array.isArray(used);
    const usedValues = hasUsed ? used : [];
    const done = typeof (hasUsed ? cb : used) === 'function' ? (hasUsed ? cb : used) : () => {};
    const picker = window.choicePopup;
    if (!picker || typeof picker.pickForEntry !== 'function') {
      done(null);
      return;
    }

    const entry = getEntry();
    const context = { entry, sourceEntry: entry };
    picker.pickForEntry({
      entry,
      context,
      usedValues,
      fallbackLegacy: true
    }).then(result => {
      done(result?.value ?? null);
    }).catch(() => done(null));
  }

  window.bloodBond = { pickRace };
})(window);
