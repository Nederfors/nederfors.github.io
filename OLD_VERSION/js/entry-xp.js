(function(window){
  function computeEntryXP(entry, list, options = {}) {
    if (!entry || !window.storeHelper) {
      return {
        value: null,
        text: '',
        tagHtml: '',
        headerHtml: '',
        shouldShow: false,
        label: (options && options.label) || 'Erf'
      };
    }

    const {
      xpSource,
      level,
      allowInventory = false,
      allowEmployment = false,
      allowService = false,
      forceDisplay = false,
      label = 'Erf'
    } = options || {};

    const isFunc = (fn) => typeof fn === 'function';
    const skipInv = !allowInventory && isFunc(window.isInv) && window.isInv(entry);
    const skipEmployment = !allowEmployment && isFunc(window.isEmployment) && window.isEmployment(entry);
    const skipService = !allowService && isFunc(window.isService) && window.isService(entry);
    const shouldSkipXP = skipInv || skipEmployment || skipService;

    let xpVal = null;
    if (!shouldSkipXP) {
      const xpOpts = {};
      if (xpSource) xpOpts.xpSource = xpSource;
      if (level !== undefined && level !== null && level !== '') xpOpts.level = level;
      const optsArg = Object.keys(xpOpts).length ? xpOpts : undefined;
      xpVal = window.storeHelper.calcEntryDisplayXP(entry, list, optsArg);
    }

    let xpText = window.storeHelper.formatEntryXPText(entry, xpVal);
    const isElite = isFunc(window.isElityrke) && window.isElityrke(entry);
    if (isElite) {
      const eliteReq = window.eliteReq;
      const minFn = eliteReq && typeof eliteReq.minXP === 'function' ? eliteReq.minXP : null;
      const minXP = minFn ? minFn(entry, list) : 50;
      xpText = `Minst ${minXP}`;
    }

    const shouldShow = forceDisplay || xpText !== '' || isElite;
    const prefix = `${label}: `;
    const xpTagHtml = shouldShow ? `<span class="tag xp-cost">${prefix}${xpText}</span>` : '';
    const xpHeaderHtml = shouldShow ? `<span class="entry-xp-value">${prefix}${xpText}</span>` : '';

    return {
      value: xpVal,
      text: xpText,
      tagHtml: xpTagHtml,
      headerHtml: xpHeaderHtml,
      shouldShow,
      label
    };
  }

  function buildEntryXPDisplay(entry, list, options = {}) {
    const xpInfo = computeEntryXP(entry, list, options) || {};
    const label = options?.label ?? xpInfo.label ?? 'Erf';
    const merged = {
      label,
      value: xpInfo.value,
      text: xpInfo.text,
      tagHtml: xpInfo.tagHtml,
      headerHtml: xpInfo.headerHtml,
      shouldShow: xpInfo.shouldShow
    };

    const needsFallback = merged.value === null || merged.value === undefined;
    if (needsFallback && window.storeHelper) {
      const calcOpts = {};
      if (options?.xpSource) calcOpts.xpSource = options.xpSource;
      if (options?.level !== undefined && options.level !== null && options.level !== '') {
        calcOpts.level = options.level;
      }
      const hasCalcOpts = Object.keys(calcOpts).length > 0;
      const fallbackValue = window.storeHelper.calcEntryDisplayXP(
        entry,
        list,
        hasCalcOpts ? calcOpts : undefined
      );
      merged.value = fallbackValue;
      merged.text = window.storeHelper.formatEntryXPText(entry, fallbackValue);
    }

    if (merged.text === undefined || merged.text === null) merged.text = '';
    const hasText = String(merged.text).trim() !== '';
    if (!merged.shouldShow && hasText) {
      merged.shouldShow = true;
    }
    if (merged.shouldShow) {
      const prefix = `${label}: `;
      merged.tagHtml = `<span class="tag xp-cost">${prefix}${merged.text}</span>`;
      merged.headerHtml = `<span class="entry-xp-value">${prefix}${merged.text}</span>`;
    } else {
      merged.tagHtml = '';
      merged.headerHtml = '';
    }

    return merged;
  }

  window.entryXp = Object.freeze({
    compute: computeEntryXP,
    buildDisplay: buildEntryXPDisplay
  });
})(window);
