(function(window){
  function resolveArtifactEntry(options = {}) {
    if (options.entry && typeof options.entry === 'object') return options.entry;
    return {
      namn: 'Artefakt',
      taggar: { typ: ['Artefakt'] }
    };
  }

  async function openPopup(current, options = {}){
    const picker = window.choicePopup;
    if (!picker || typeof picker.pickForEntry !== 'function') return null;

    const entry = resolveArtifactEntry(options);
    const context = { entry, sourceEntry: entry };
    const result = await picker.pickForEntry({
      entry,
      context,
      currentValue: current || '',
      usedValues: [],
      fallbackLegacy: true
    });

    if (!result?.hasChoice || result.cancelled) return null;
    return result.value;
  }

  window.selectArtifactPayment = openPopup;
})(window);
