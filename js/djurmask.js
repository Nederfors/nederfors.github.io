(function(window){
  const TRAITS = ['Diskret', 'Kvick', 'Listig', 'Stark', 'Vaksam'];

  function getPickerEntry(sourceEntry) {
    if (sourceEntry && typeof sourceEntry === 'object') return sourceEntry;
    if (typeof window.lookupEntry === 'function') {
      try {
        const hit = window.lookupEntry({ name: 'Djurmask' });
        if (hit && typeof hit === 'object') return hit;
      } catch (_) {
        // Fall through to fallback.
      }
    }
    return { namn: 'Djurmask', traits: [...TRAITS] };
  }

  function pickTrait(used, cb, sourceEntry) {
    const hasUsed = Array.isArray(used);
    const usedValues = hasUsed ? used : [];
    const done = typeof (hasUsed ? cb : used) === 'function' ? (hasUsed ? cb : used) : () => {};
    const picker = window.choicePopup;
    if (!picker || typeof picker.pickForEntry !== 'function') {
      done(null);
      return;
    }

    const entry = getPickerEntry(sourceEntry);
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

  function resolveInventoryEntry(item){
    const ref = item?.id || item?.name || '';
    if (window.invUtil && typeof window.invUtil.getEntry === 'function') {
      return window.invUtil.getEntry(ref);
    }
    if (typeof window.lookupEntry === 'function') {
      return window.lookupEntry({ id: item?.id, name: item?.name }, { explicitName: item?.name });
    }
    return {};
  }

  function getTraitBonusForItem(item, entry){
    const trait = String(item?.trait || '').trim();
    if (!trait || !entry || typeof entry !== 'object') return 0;
    const helper = window.rulesHelper;

    if (helper && typeof helper.queryMal === 'function') {
      try {
        const sourceEntry = { ...entry };
        if (item?.nivå) sourceEntry.nivå = item.nivå;
        const value = Number(helper.queryMal([sourceEntry], 'karaktarsdrag_max_tillagg', { trait, row: item, sourceEntry }));
        if (Number.isFinite(value) && value !== 0) return value;
      } catch (_) {
        // Fall through to local fallback.
      }
    }

    if (Array.isArray(entry.traits) && entry.traits.includes(trait)) return 1;
    return 0;
  }

  function getBonuses(inv){
    const cur = inv || storeHelper.getInventory(storeHelper.load());
    const res = {};
    cur.forEach(it => {
      const trait = String(it?.trait || '').trim();
      if (!trait) return;
      const entry = resolveInventoryEntry(it);
      const bonus = getTraitBonusForItem(it, entry);
      if (!bonus) return;
      res[trait] = (res[trait] || 0) + bonus;
    });
    return res;
  }

  function getBonus(trait){
    const inv = storeHelper.getInventory(storeHelper.load());
    return getBonuses(inv)[trait] || 0;
  }

  window.maskSkill = { pickTrait, getBonuses, getBonus };
})(window);
