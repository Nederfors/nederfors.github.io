(function(window){
  function resolveEntry() {
    if (typeof window.lookupEntry === 'function') {
      try {
        const byId = window.lookupEntry({ id: 'hamnskifte_grants1' });
        if (byId && typeof byId === 'object') return byId;
      } catch (_) {
        // Ignore and fallback.
      }
    }
    return { id: 'hamnskifte_grants1', namn: 'Hamnskifte: Formval' };
  }

  function pickForm(cb){
    const done = typeof cb === 'function' ? cb : () => {};
    const picker = window.choicePopup;
    if (!picker || typeof picker.pickForEntry !== 'function') {
      done(null);
      return;
    }

    const entry = resolveEntry();
    const context = { entry, sourceEntry: entry };
    picker.pickForEntry({
      entry,
      context,
      usedValues: [],
      fallbackLegacy: true
    }).then(result => {
      done(result?.value ?? null);
    }).catch(() => done(null));
  }

  window.beastForm = { pickForm };
})(window);
