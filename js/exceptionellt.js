(function(window){
  const TRAITS = ['Diskret', 'Kvick', 'Listig', 'Stark', 'Träffsäker', 'Vaksam', 'Viljestark', 'Övertygande'];
  const BONUS = { Novis: 1, 'Gesäll': 2, 'Mästare': 3 };

  function getEntry() {
    if (typeof window.lookupEntry === 'function') {
      try {
        const hit = window.lookupEntry({ name: 'Exceptionellt karaktärsdrag' });
        if (hit && typeof hit === 'object') return hit;
      } catch (_) {
        // Fall through to fallback.
      }
    }
    return { namn: 'Exceptionellt karaktärsdrag', traits: [...TRAITS] };
  }

  function pickTrait(used, cb){
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

  function getBonuses(list){
    const cur = list || storeHelper.getCurrentList(storeHelper.load());
    const res = {};
    cur.forEach(it => {
      if (it.namn === 'Exceptionellt karaktärsdrag' && it.trait) {
        res[it.trait] = BONUS[it.nivå] || 0;
      }
    });
    return res;
  }

  function getBonus(trait){
    const list = storeHelper.getCurrentList(storeHelper.load());
    return getBonuses(list)[trait] || 0;
  }

  window.exceptionSkill = { pickTrait, getBonus, getBonuses };
})(window);
