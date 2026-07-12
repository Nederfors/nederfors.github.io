(function(window){
  function pickBound(boundType, used, cb, sourceEntry) {
    const hasUsed = Array.isArray(used);
    const usedValues = hasUsed ? used : [];
    const done = typeof (hasUsed ? cb : used) === 'function' ? (hasUsed ? cb : used) : () => {};
    const picker = window.choicePopup;
    if (!picker || typeof picker.pickForEntry !== 'function') {
      done(null);
      return;
    }

    const type = boundType === 'ritual' ? 'ritual' : 'kraft';
    const fallbackEntry = {
      namn: type === 'kraft' ? 'Formelpergament' : 'Ritualkodex',
      bound: type,
      boundLabel: type === 'kraft' ? 'Formel' : 'Ritual'
    };
    const entry = sourceEntry && typeof sourceEntry === 'object' ? sourceEntry : fallbackEntry;
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

  function pickKraft(used, cb, sourceEntry){
    pickBound('kraft', used, cb, sourceEntry);
  }

  function pickRitual(used, cb, sourceEntry){
    pickBound('ritual', used, cb, sourceEntry);
  }

  window.powerPicker = { pickKraft, pickRitual };
})(window);
