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
      levelHtml = '',
      descHtml = '',
      leftSections = [],
      buttonSections = [],
      titleActions = []
    } = options;

    const li = document.createElement('li');
    const classNames = ['card'];
    if (compact) classNames.push('compact');
    classNames.push(...normalizeClasses(classes));
    li.className = classNames.join(' ');

    applyDataset(li, dataset);

    const leftParts = Array.isArray(leftSections) ? leftSections.filter(Boolean) : [];
    const buttonParts = Array.isArray(buttonSections) ? buttonSections.filter(Boolean) : [];
    const titleActionParts = Array.isArray(titleActions) ? titleActions.filter(Boolean) : [];

    const tagParts = [];
    const auxParts = [];
    leftParts.forEach(part => {
      const str = typeof part === 'string' ? part : '';
      if (str.includes('entry-tags')) tagParts.push(part);
      else auxParts.push(part);
    });

    const tagSources = [];
    if (tagsHtml) tagSources.push(`<div class="tags entry-tags-block">${tagsHtml}</div>`);
    if (tagParts.length) tagSources.push(...tagParts);
    const tagsRow = tagSources.length ? `<div class="card-tags-row">${tagSources.join('')}</div>` : '';

    const auxRow = auxParts.length ? `<div class="card-aux-row">${auxParts.join('')}</div>` : '';
    const levelRow = (levelHtml || xpHtml)
      ? `<div class="card-level-row"><div class="card-level">${levelHtml || ''}</div>${xpHtml ? `<div class="card-xp">${xpHtml}</div>` : ''}</div>`
      : '';
    const actionsHtml = titleActionParts.length
      ? `<div class="card-title-actions">${titleActionParts.join('')}</div>`
      : '';
    const headerHtml = `<div class="card-header"><div class="card-title"><span>${nameHtml}</span></div>${actionsHtml}</div>`;
    const controlsHtml = wrapControls([], buttonParts);

    li.innerHTML = `
      ${headerHtml}
      ${levelRow}
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
