(function(window){
  const icon = (name, opts) => typeof window.iconHtml === 'function'
    ? window.iconHtml(name, opts)
    : '';

  const escapeAttr = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);

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

  const joinParts = (parts) => (Array.isArray(parts) ? parts.filter(Boolean).join('') : '');

  const STANDARD_ACTION_ORDER = ['remove', 'multi', 'minus', 'plus'];
  const STANDARD_ACTION_DEFAULTS = Object.freeze({
    remove: Object.freeze({
      act: 'rem',
      iconName: 'remove',
      ariaLabel: 'Ta bort',
      danger: true
    }),
    multi: Object.freeze({
      act: 'buyMulti',
      iconName: 'buymultiple',
      ariaLabel: 'Köp flera',
      danger: false
    }),
    minus: Object.freeze({
      act: 'sub',
      iconName: 'minus',
      ariaLabel: 'Minska',
      danger: false
    }),
    plus: Object.freeze({
      act: 'add',
      iconName: 'plus',
      ariaLabel: 'Lägg till',
      danger: false
    })
  });
  const ACT_MAP = new Map([
    ['del', 'remove'],
    ['rem', 'remove'],
    ['sub', 'minus'],
    ['add', 'plus'],
    ['buyMulti', 'multi']
  ]);

  const normalizeStandardActionDescriptor = (slot, config) => {
    if (!slot || !STANDARD_ACTION_DEFAULTS[slot] || !config || config === false) return null;
    const extraClasses = normalizeClasses(config.classes || config.className || config.extraClasses);
    return {
      ...STANDARD_ACTION_DEFAULTS[slot],
      ...config,
      slot,
      act: String(config.act || STANDARD_ACTION_DEFAULTS[slot].act),
      iconName: String(config.iconName || STANDARD_ACTION_DEFAULTS[slot].iconName),
      ariaLabel: config.ariaLabel === undefined
        ? STANDARD_ACTION_DEFAULTS[slot].ariaLabel
        : String(config.ariaLabel || ''),
      title: config.title ? String(config.title) : '',
      highlight: Boolean(config.highlight),
      danger: config.danger === undefined
        ? Boolean(STANDARD_ACTION_DEFAULTS[slot].danger)
        : Boolean(config.danger),
      extraClasses
    };
  };

  const getStandardActionDescriptors = (config = {}) => {
    const source = Array.isArray(config)
      ? config.reduce((acc, item) => {
          if (item?.slot) acc[item.slot] = item;
          return acc;
        }, {})
      : (config && typeof config === 'object' ? config : {});
    return STANDARD_ACTION_ORDER
      .map(slot => normalizeStandardActionDescriptor(slot, source[slot]))
      .filter(Boolean);
  };

  const buildStandardActionClassName = (descriptor) => {
    const classes = [
      'db-btn',
      'db-btn--icon',
      'db-btn--icon-only',
      'entry-standard-action',
      `entry-standard-action--${descriptor.slot}`
    ];
    if (descriptor.danger) classes.push('db-btn--danger');
    if (descriptor.highlight) classes.push('add-btn');
    classes.push(...normalizeClasses(descriptor.extraClasses));
    return [...new Set(classes)].join(' ');
  };

  const buildStandardActionMarkup = (descriptor, options = {}) => {
    if (!descriptor) return '';
    const attrs = [
      `class="${escapeAttr(buildStandardActionClassName(descriptor))}"`,
      `data-act="${escapeAttr(descriptor.act)}"`,
      `data-standard-slot="${escapeAttr(descriptor.slot)}"`
    ];
    const buttonName = options.buttonName ? String(options.buttonName) : '';
    const buttonId = options.buttonId ? String(options.buttonId) : '';
    if (buttonName) attrs.push(`data-name="${escapeAttr(buttonName)}"`);
    if (buttonId) attrs.push(`data-id="${escapeAttr(buttonId)}"`);
    if (descriptor.ariaLabel) attrs.push(`aria-label="${escapeAttr(descriptor.ariaLabel)}"`);
    if (descriptor.title) attrs.push(`title="${escapeAttr(descriptor.title)}"`);
    return `<button ${attrs.join(' ')}>${icon(descriptor.iconName)}</button>`;
  };

  const buildStandardActionButtons = (config = {}, options = {}) =>
    getStandardActionDescriptors(config).map(descriptor => buildStandardActionMarkup(descriptor, options));

  const splitButtons = (buttonParts) => {
    const dynamic = [];
    const standardBuckets = { remove: [], minus: [], plus: [], multi: [] };

    buttonParts.forEach(part => {
      if (typeof part !== 'string' || !part.trim()) return;
      const match = part.match(/data-act\s*=\s*["']([^"']+)["']/i);
      if (match) {
        const bucket = ACT_MAP.get(match[1]);
        if (bucket) {
          standardBuckets[bucket].push(part);
          return;
        }
      }
      dynamic.push(part);
    });

    const standard = STANDARD_ACTION_ORDER.reduce((acc, key) => acc.concat(standardBuckets[key]), []);
    return {
      dynamic,
      standard,
      hasDynamic: dynamic.length > 0,
      hasStandard: standard.length > 0
    };
  };

  const syncLevelControl = () => {};

  const syncStandardActionButtons = (standardGroup, config = {}, options = {}) => {
    if (!standardGroup || !(standardGroup instanceof HTMLElement)) return;
    const descriptors = getStandardActionDescriptors(config);
    const existing = [...standardGroup.querySelectorAll(':scope > button')];

    while (existing.length > descriptors.length) {
      existing.pop()?.remove();
    }

    descriptors.forEach((descriptor, index) => {
      let button = existing[index];
      if (!button) {
        button = document.createElement('button');
        standardGroup.appendChild(button);
        existing.push(button);
      }
      button.type = 'button';
      button.className = buildStandardActionClassName(descriptor);
      button.dataset.act = descriptor.act;
      button.dataset.standardSlot = descriptor.slot;
      if (descriptor.ariaLabel) button.setAttribute('aria-label', descriptor.ariaLabel);
      else button.removeAttribute('aria-label');
      if (descriptor.title) button.setAttribute('title', descriptor.title);
      else button.removeAttribute('title');
      if (options.buttonName) button.dataset.name = String(options.buttonName);
      else delete button.dataset.name;
      if (options.buttonId) button.dataset.id = String(options.buttonId);
      else delete button.dataset.id;
      if (button.dataset.iconName !== descriptor.iconName) {
        button.innerHTML = icon(descriptor.iconName);
        button.dataset.iconName = descriptor.iconName;
      }
    });
  };

  const syncCollapseButton = (card) => {
    if (!card || !(card instanceof HTMLElement)) return;
    const btn = card.querySelector('.entry-collapse-btn');
    if (!btn) return;
    const isCompact = card.classList.contains('compact');
    const label = isCompact ? 'Visa mer' : 'Visa mindre';
    btn.setAttribute('aria-expanded', isCompact ? 'false' : 'true');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  };

  const toggleEntryCard = (card, forceExpanded = null) => {
    if (!card || !(card instanceof HTMLElement)) return null;
    if (card.dataset.collapsible !== '1') return null;

    const wasCompact = card.classList.contains('compact');
    const shouldExpand = forceExpanded === null ? wasCompact : Boolean(forceExpanded);
    const shouldCompact = !shouldExpand;

    if (forceExpanded !== null && wasCompact === shouldCompact) {
      syncCollapseButton(card);
      return !shouldCompact;
    }

    card.classList.toggle('compact', shouldCompact);
    syncCollapseButton(card);

    card.dispatchEvent(new CustomEvent('entry-card-toggle', {
      bubbles: true,
      detail: {
        card,
        expanded: !shouldCompact
      }
    }));

    return !shouldCompact;
  };

  const syncActionRowState = (card) => {
    if (!card || !(card instanceof HTMLElement)) return;
    const actionsRow = card.querySelector('.entry-row.entry-row-actions');
    if (!actionsRow) return;
    const dynamicGroup = actionsRow.querySelector('.entry-action-group-dynamic');
    const standardGroup = actionsRow.querySelector('.entry-action-group-standard');
    const levelControl = actionsRow.querySelector('.entry-level-control');
    const hasDynamic = !!(dynamicGroup && dynamicGroup.children.length);
    const hasStandard = !!(standardGroup && standardGroup.children.length);
    const hasLevel = !!(levelControl && levelControl.children.length);
    actionsRow.classList.toggle('only-standard', !hasDynamic && hasStandard && !hasLevel);
  };

  const INTERACTIVE_SELECTOR = 'button, a, select, input, textarea, [contenteditable="true"], [role="button"], .filter-tag, .tag.removable';
  let collapseHandlerBound = false;

  const handleGlobalClick = e => {
    const rootCard = e.target.closest('li.entry-card, li.db-card');
    if (!rootCard) return;
    const collapseBtn = e.target.closest('.entry-collapse-btn');
    if (collapseBtn) {
      const card = collapseBtn.closest('li.entry-card, li.db-card');
      if (card) toggleEntryCard(card);
      return;
    }

    const header = e.target.closest('.card-header');
    if (!header || !rootCard.contains(header)) return;

    const card = rootCard;
    if (!card) return;
    if (card.dataset.collapsible !== '1') return;

    const interactive = e.target.closest(INTERACTIVE_SELECTOR);
    if (interactive && header.contains(interactive)) return;

    toggleEntryCard(card);
  };

  const ensureCollapseHandler = () => {
    if (collapseHandlerBound) return;
    document.addEventListener('click', handleGlobalClick);
    collapseHandlerBound = true;
  };

  function createEntryCard(options = {}) {
    const {
      compact = false,
      classes = [],
      dataset = {},
      nameHtml = '',
      xpHtml = '',
      levelHtml = '',
      descHtml = '',
      qualityHtml = '',
      buttonSections = [],
      titleActions = [],
      infoBox = '',
      hasLevels = false,
      collapsible = false,
      titlePrefixHtml = '',
      titleSuffixHtml = ''
    } = options;

    const li = document.createElement('li');
    const classNames = ['card', 'db-card', 'db-card--interactive', 'entry-card'];
    if (compact) classNames.push('compact');
    classNames.push(...normalizeClasses(classes));
    if (hasLevels) classNames.push('has-levels');
    else classNames.push('no-levels');
    li.className = classNames.join(' ');

    applyDataset(li, dataset);
    if (collapsible) {
      li.dataset.collapsible = '1';
    }

    const buttonParts = Array.isArray(buttonSections) ? buttonSections.filter(Boolean) : [];
    const titleActionParts = Array.isArray(titleActions) ? titleActions.filter(Boolean) : [];
    const infoBoxHtml = typeof infoBox === 'string' ? infoBox : '';

    const collapseBtnHtml = collapsible
      ? `<button type="button" class="collapse-btn entry-collapse-btn"></button>`
      : '';
    const prefixBlock = titlePrefixHtml
      ? `<span class="entry-title-prefix">${titlePrefixHtml}</span>`
      : '';
    const suffixBlock = titleSuffixHtml
      ? `<span class="entry-title-suffix">${titleSuffixHtml}</span>`
      : '';
    const titleParts = [
      collapseBtnHtml,
      prefixBlock,
      `<span class="entry-title-main">${nameHtml || ''}</span>`,
      suffixBlock
    ].filter(Boolean);
    const titleHtml = `<div class="card-title">${titleParts.join('')}</div>`;
    const headerRowClasses = ['entry-row', 'entry-row-header'];

    const levelControl = hasLevels ? (levelHtml || '') : '';
    const xpBlock = xpHtml ? `<div class="entry-header-xp">${xpHtml}</div>` : '';
    const actionsBlock = titleActionParts.length
      ? `<div class="entry-header-actions">${titleActionParts.join('')}</div>`
      : '';
    const headerRowHtml = `
      <div class="${headerRowClasses.join(' ')}">
        <div class="entry-header-main">${titleHtml}</div>
        ${xpBlock}
        ${actionsBlock}
      </div>`;

    const infoBlocks = [];
    if (infoBoxHtml) {
      infoBlocks.push(`<div class="entry-info-block entry-info-box">${infoBoxHtml}</div>`);
    }
    const infoRowHtml = infoBlocks.length
      ? `<div class="entry-row entry-row-info"><div class="entry-info-panel">${infoBlocks.join('')}</div></div>`
      : '';

    const { dynamic, standard, hasDynamic, hasStandard } = splitButtons(buttonParts);
    const levelControlBlock = levelControl
      ? `<div class="entry-level-control">${levelControl}</div>`
      : '';
    const qualitiesBlock = qualityHtml
      ? `<div class="entry-action-qualities">${qualityHtml}</div>`
      : '';
    const dynamicGroup = hasDynamic
      ? `<div class="entry-action-group entry-action-group-dynamic control-buttons">${dynamic.join('')}</div>`
      : '';
    const standardGroup = hasStandard
      ? `<div class="entry-action-group entry-action-group-standard control-buttons">${standard.join('')}</div>`
      : '';
    const controlsParts = [levelControlBlock, dynamicGroup, standardGroup].filter(Boolean);
    const controlsBlock = controlsParts.length
      ? `<div class="entry-action-controls">${controlsParts.join('')}</div>`
      : '';
    const actionRowClasses = ['entry-row', 'entry-row-actions'];
    if (!hasDynamic && hasStandard && !levelControlBlock) actionRowClasses.push('only-standard');
    const actionRowContent = [controlsBlock]
      .filter(Boolean)
      .join('');
    const actionsRowHtml = actionRowContent
      ? `<div class="${actionRowClasses.join(' ')}">${actionRowContent}</div>`
      : '';

    const summaryHtml = `<div class="db-card__header entry-card-summary card-header">${joinParts([headerRowHtml, infoRowHtml, qualitiesBlock, actionsRowHtml])}</div>`;

    const bodyHtml = '';

    const detailSections = [];
    if (descHtml) detailSections.push(descHtml);
    const detailHtml = detailSections.length
      ? `<div class="db-card__footer entry-card-details">${detailSections.join('')}</div>`
      : '';

    li.innerHTML = `${summaryHtml}${bodyHtml}${detailHtml}`;
    syncActionRowState(li);

    if (collapsible) {
      syncCollapseButton(li);
      if (typeof window.MutationObserver === 'function') {
        const observer = new MutationObserver(() => syncCollapseButton(li));
        observer.observe(li, { attributes: true, attributeFilter: ['class'] });
      }
    }

    return li;
  }

  ensureCollapseHandler();

  window.entryCardFactory = Object.freeze({
    create: createEntryCard,
    buildStandardActionButtons,
    getStandardActionDescriptors,
    syncActionRow: syncActionRowState,
    syncStandardActionButtons,
    syncCollapse: syncCollapseButton,
    syncLevelControl,
    toggle: toggleEntryCard
  });
})(window);
