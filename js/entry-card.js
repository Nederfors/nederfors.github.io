(function(window){
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

  const scheduleFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (fn => window.setTimeout(fn, 16));

  const QUALITY_MIN_FONT_PX = 7;
  const QUALITY_ABS_MIN_PX = 3;
  const qualityContainers = new Set();
  const qualityPending = new WeakSet();
  const qualityMutationObservers = new WeakMap();
  const qualityContainerObservers = new WeakMap();
  const qualityResizeObserver = typeof window.ResizeObserver === 'function'
    ? new window.ResizeObserver(entries => {
      entries.forEach(entry => scheduleQualityFit(entry.target));
    })
    : null;
  let qualityResizeListenerBound = false;

  const ensureQualityResizeListener = () => {
    if (qualityResizeListenerBound || qualityResizeObserver) return;
    qualityResizeListenerBound = true;
    window.addEventListener('resize', () => {
      qualityContainers.forEach(container => scheduleQualityFit(container));
    });
  };

  const scheduleQualityFit = (container) => {
    if (!container || qualityPending.has(container)) return;
    qualityPending.add(container);
    scheduleFrame(() => {
      qualityPending.delete(container);
      fitQualityTags(container);
    });
  };

  const observeQualityMutations = (tagsEl) => {
    if (!tagsEl || qualityMutationObservers.has(tagsEl)) return;
    if (typeof window.MutationObserver !== 'function') return;
    const observer = new window.MutationObserver(() => {
      const container = tagsEl.closest('.entry-action-qualities');
      if (container) scheduleQualityFit(container);
    });
    observer.observe(tagsEl, { childList: true, characterData: true, subtree: true });
    qualityMutationObservers.set(tagsEl, observer);
  };

  const fitQualityTags = (container) => {
    if (!container) return;
    const tagsEl = container.querySelector('.quality-tags');
    if (!tagsEl) return;

    const available = container.clientWidth;
    if (!available) return;

    tagsEl.style.fontSize = '';
    const computed = window.getComputedStyle(tagsEl);
    const baseFont = parseFloat(computed.fontSize) || 12;
    const minFont = Math.max(QUALITY_MIN_FONT_PX, baseFont * 0.55);
    const fullWidth = tagsEl.scrollWidth;

    if (fullWidth <= available) {
      tagsEl.style.fontSize = '';
      return;
    }

    let appliedSize = baseFont * (available / fullWidth);
    if (!Number.isFinite(appliedSize) || appliedSize <= 0) {
      appliedSize = baseFont;
    }
    appliedSize = Math.max(minFont, appliedSize);
    tagsEl.style.fontSize = `${appliedSize}px`;

    let iterations = 0;
    while (tagsEl.scrollWidth > available && iterations < 5) {
      const ratio = available / tagsEl.scrollWidth;
      if (!(ratio > 0 && ratio < 1)) break;
      const nextSize = Math.max(QUALITY_ABS_MIN_PX, appliedSize * ratio);
      if (Math.abs(nextSize - appliedSize) < 0.1) break;
      appliedSize = nextSize;
      tagsEl.style.fontSize = `${appliedSize}px`;
      iterations += 1;
    }

    if (Math.abs(appliedSize - baseFont) < 0.5) {
      tagsEl.style.fontSize = '';
      return;
    }

    if (tagsEl.scrollWidth > available) {
      appliedSize = Math.max(QUALITY_ABS_MIN_PX, appliedSize * (available / Math.max(tagsEl.scrollWidth, 1)));
      tagsEl.style.fontSize = `${appliedSize}px`;
    }

    if (tagsEl.scrollWidth <= available + 0.5) {
      tagsEl.style.fontSize = `${appliedSize}px`;
    }
  };

  const observeQualityContainer = (container) => {
    if (!container || qualityContainers.has(container)) return;
    qualityContainers.add(container);
    const tagsEl = container.querySelector('.quality-tags');
    if (tagsEl) observeQualityMutations(tagsEl);
    if (!qualityContainerObservers.has(container) && typeof window.MutationObserver === 'function') {
      const observer = new window.MutationObserver(() => {
        const currentTags = container.querySelector('.quality-tags');
        if (currentTags) observeQualityMutations(currentTags);
        scheduleQualityFit(container);
      });
      observer.observe(container, { childList: true });
      qualityContainerObservers.set(container, observer);
    }
    scheduleQualityFit(container);
    if (qualityResizeObserver) {
      try {
        qualityResizeObserver.observe(container);
      } catch {}
    } else {
      ensureQualityResizeListener();
    }
  };

  const splitButtons = (buttonParts) => {
    const dynamic = [];
    const standardBuckets = { remove: [], minus: [], plus: [] };
    const ACT_MAP = new Map([
      ['del', 'remove'],
      ['rem', 'remove'],
      ['sub', 'minus'],
      ['add', 'plus']
    ]);

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

    const standardOrder = ['remove', 'minus', 'plus'];
    const standard = standardOrder.reduce((acc, key) => acc.concat(standardBuckets[key]), []);
    return {
      dynamic,
      standard,
      hasDynamic: dynamic.length > 0,
      hasStandard: standard.length > 0
    };
  };

  const syncLevelControl = () => {};

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

  const INTERACTIVE_SELECTOR = 'button, a, select, input, textarea, [contenteditable="true"], [role="button"]';
  let collapseHandlerBound = false;

  const handleGlobalClick = e => {
    const rootCard = e.target.closest('li.entry-card');
    if (!rootCard) return;
    const collapseBtn = e.target.closest('.entry-collapse-btn');
    if (collapseBtn) {
      const card = collapseBtn.closest('li.entry-card');
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
      collapsible = false
    } = options;

    const li = document.createElement('li');
    const classNames = ['card', 'entry-card'];
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
    const titleHtml = `<div class="card-title"><span>${collapseBtnHtml}${nameHtml || ''}</span></div>`;
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
    const actionRowContent = [qualitiesBlock, controlsBlock]
      .filter(Boolean)
      .join('');
    const actionsRowHtml = actionRowContent
      ? `<div class="${actionRowClasses.join(' ')}">${actionRowContent}</div>`
      : '';

    const summaryHtml = `<div class="entry-card-summary card-header">${joinParts([headerRowHtml, infoRowHtml, actionsRowHtml])}</div>`;

    const detailSections = [];
    if (descHtml) detailSections.push(descHtml);
    const detailHtml = detailSections.length
      ? `<div class="entry-card-details">${detailSections.join('')}</div>`
      : '';

    li.innerHTML = `${summaryHtml}${detailHtml}`;

    if (collapsible) {
      syncCollapseButton(li);
      if (typeof window.MutationObserver === 'function') {
        const observer = new MutationObserver(() => syncCollapseButton(li));
        observer.observe(li, { attributes: true, attributeFilter: ['class'] });
      }
    }

    li.querySelectorAll('.entry-action-qualities').forEach(observeQualityContainer);

    return li;
  }

  ensureCollapseHandler();

  window.entryCardFactory = Object.freeze({
    create: createEntryCard,
    syncCollapse: syncCollapseButton,
    syncLevelControl,
    toggle: toggleEntryCard
  });
})(window);
