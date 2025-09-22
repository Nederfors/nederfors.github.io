(function(window){
  const normalizeClasses = (classes) => {
    if (!classes) return [];
    if (Array.isArray(classes)) return classes.filter(Boolean);
    if (typeof classes === 'string') {
      return classes.split(/\s+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  };

  const applyDataset = (element, dataset) => {
    if (!element || !dataset || typeof dataset !== 'object') return;
    Object.entries(dataset).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      element.dataset[key] = String(value);
    });
  };

  const wrapControls = (leftSections, buttonSections) => {
    const leftParts = Array.isArray(leftSections) ? leftSections.filter(Boolean) : [];
    const buttonParts = Array.isArray(buttonSections) ? buttonSections.filter(Boolean) : [];
    const leftHtml = leftParts.length ? `<div class="inv-controls-left">${leftParts.join('')}</div>` : '';
    const buttonsHtml = buttonParts.length ? `<div class="control-buttons">${buttonParts.join('')}</div>` : '';
    if (!leftHtml && !buttonsHtml) return '';
    return `<div class="inv-controls">${leftHtml || ''}${buttonsHtml || ''}</div>`;
  };

  function createEntryCard(options = {}) {
    const {
      compact = false,
      classes = [],
      dataset = {},
      nameHtml = '',
      xpHtml = '',
      tagsHtml = '',
      primaryTagsHtml = '',
      levelHtml = '',
      descHtml = '',
      leftSections = [],
      buttonSections = [],
      titleActions = [],
      infoBox = '',
      hasLevels = false
    } = options;

    const li = document.createElement('li');
    const classNames = ['card'];
    if (compact) classNames.push('compact');
    classNames.push(...normalizeClasses(classes));
    if (hasLevels) classNames.push('has-levels');
    else classNames.push('no-levels');
    li.className = classNames.join(' ');

    applyDataset(li, dataset);

    const leftParts = Array.isArray(leftSections) ? leftSections.filter(Boolean) : [];
    let buttonParts = Array.isArray(buttonSections) ? buttonSections.filter(Boolean) : [];
    const titleActionParts = Array.isArray(titleActions) ? titleActions.filter(Boolean) : [];
    const infoBoxHtml = typeof infoBox === 'string' ? infoBox : '';
    const actionIdxs = [];
    buttonParts.forEach((part, idx) => {
      if (typeof part !== 'string') return;
      if (/data-act=(["'])(add|sub|rem|del)\1/.test(part)) actionIdxs.push(idx);
    });
    let inlineLevelButton = '';
    let infoBoxActionButtons = [];
    if (actionIdxs.length) {
      if (hasLevels && infoBoxHtml) {
        infoBoxActionButtons = actionIdxs.map(idx => buttonParts[idx]).filter(Boolean);
        const idxSet = new Set(actionIdxs);
        buttonParts = buttonParts.filter((_, idx) => !idxSet.has(idx));
      } else if (levelHtml) {
        const idx = actionIdxs[0];
        inlineLevelButton = buttonParts[idx];
        buttonParts.splice(idx, 1);
      }
    }
    const infoBoxBlockHtml = infoBoxActionButtons.length
      ? `<div class="card-info-row">${infoBoxHtml}<div class="card-info-actions">${infoBoxActionButtons.join('')}</div></div>`
      : infoBoxHtml;

    const tagParts = [];
    const auxParts = [];
    leftParts.forEach(part => {
      const str = typeof part === 'string' ? part : '';
      if (str.includes('entry-tags')) tagParts.push(part);
      else auxParts.push(part);
    });

    const tagSources = [];
    if (primaryTagsHtml) tagSources.push(`<div class="tags entry-tags-block primary-tags">${primaryTagsHtml}</div>`);
    if (tagsHtml) tagSources.push(`<div class="tags entry-tags-block">${tagsHtml}</div>`);
    if (tagParts.length) tagSources.push(...tagParts);
    const tagsRow = tagSources.length ? `<div class="card-tags-row">${tagSources.join('')}</div>` : '';

    const auxRow = auxParts.length ? `<div class="card-aux-row">${auxParts.join('')}</div>` : '';
    const levelRow = (levelHtml || inlineLevelButton)
      ? `<div class="card-level-row"><div class="card-level">${levelHtml || ''}</div>${inlineLevelButton ? `<div class="card-level-actions">${inlineLevelButton}</div>` : ''}</div>`
      : '';
    const hasLevelRow = Boolean(levelRow);
    const levelSection = hasLevelRow
      ? `${levelRow}${infoBoxBlockHtml ? infoBoxBlockHtml : ''}`
      : '';
    const infoBoxAboveTags = (!hasLevelRow && hasLevels && infoBoxBlockHtml) ? infoBoxBlockHtml : '';
    const controlsLeftParts = (!hasLevelRow && !hasLevels && infoBoxBlockHtml) ? [infoBoxBlockHtml] : [];
    const headerExtras = [];
    if (xpHtml) headerExtras.push(`<div class="card-xp">${xpHtml}</div>`);
    if (titleActionParts.length) headerExtras.push(`<div class="card-title-actions">${titleActionParts.join('')}</div>`);
    const headerRight = headerExtras.length ? `<div class="card-header-right">${headerExtras.join('')}</div>` : '';
    const headerHtml = `<div class="card-header"><div class="card-title"><span>${nameHtml}</span></div>${headerRight}</div>`;
    const controlsHtml = wrapControls(controlsLeftParts, buttonParts);

    li.innerHTML = `
      ${headerHtml}
      ${levelSection}
      ${infoBoxAboveTags}
      ${tagsRow}
      ${auxRow}
      ${descHtml || ''}
      ${controlsHtml}
    `;

    return li;
  }

  window.entryCardFactory = Object.freeze({
    create: createEntryCard
  });
})(window);
