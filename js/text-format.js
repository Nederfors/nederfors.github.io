(function(window){
  function formatText(str, opts){
    if(!str) return '';
    const options = opts || {};
    const treatSinglesAsParagraphs = !!options.singleAsParagraph;

    const hasDoubleNewline = /\n{2,}/.test(str);
    // Split paragraphs: default on double newlines; optionally escalate single newlines
    const paraChunks = hasDoubleNewline
      ? str.split(/\n{2,}/)
      : (treatSinglesAsParagraphs ? str.split(/\n+/) : [str]);

    return paraChunks
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => p
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // If we escalated single newlines to paragraphs, remaining newlines are likely formatting noise
        .replace(/\n/g, treatSinglesAsParagraphs && !hasDoubleNewline ? '' : '<br>')
      )
      .map(p => `<p>${p}</p>`)            // wrappa varje stycke i <p>
      .join('');
  }

  function abilityHtml(p, maxLevel){
    if(!p) return '';
    const isBio = (window.isRas && window.isRas(p)) || (window.isYrke && window.isYrke(p)) || (window.isElityrke && window.isElityrke(p));
    let descText = p.beskrivning || '';
    // Ensure a standalone motto/quote at the start becomes its own paragraph
    if (isBio) {
      descText = descText.replace(/^(\s*\*[^*]+\*)\n(?!\n)/, '$1\n\n');
    }
    const base = formatText(descText, { singleAsParagraph: !!isBio });
    if(!p.nivåer) return base;

    const levelData = p.nivåer || {};
    const rawKeys = Object.keys(levelData);
    const stdLevels = (window.LVL || ['Novis','Ges\u00e4ll','M\u00e4stare']);
    const hasStd = rawKeys.some(key => stdLevels.includes(key));

    let orderedKeys = [];
    if (hasStd) {
      const seen = new Set();
      stdLevels.forEach(level => {
        if (levelData[level]) {
          orderedKeys.push(level);
          seen.add(level);
        }
      });
      rawKeys
        .filter(key => !seen.has(key))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .forEach(key => orderedKeys.push(key));
    } else {
      orderedKeys = rawKeys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }

    const pageRole = typeof document !== 'undefined' ? document.body?.dataset?.role : '';
    const normalizedMax = typeof maxLevel === 'string' ? maxLevel : '';
    const highestUnlockedIdx = normalizedMax ? orderedKeys.indexOf(normalizedMax) : -1;
    const allowLocks = normalizedMax && highestUnlockedIdx >= 0;
    const shouldStyleLock = allowLocks && (pageRole === 'character' || pageRole === 'index');
    const shouldCollapseLocked = allowLocks && pageRole === 'character';

    const levelBlocks = [];
    orderedKeys.forEach((key, idx) => {
      const raw = levelData[key];
      if (!raw) return;
      const content = formatText(typeof raw === 'string' ? raw : String(raw));
      if (!content) return;
      const isUnlocked = idx <= highestUnlockedIdx;
      const classes = ['level-block'];
      if (shouldStyleLock && !isUnlocked) classes.push('level-locked');
      const isOpen = !shouldCollapseLocked || isUnlocked;
      levelBlocks.push(`
        <details class="${classes.join(' ')}"${isOpen ? ' open' : ''}>
          <summary>${key}</summary>
          <div class="level-content">${content}</div>
        </details>
      `.trim());
    });

    const lvlHtml = levelBlocks.length
      ? `<div class="levels">${levelBlocks.join('')}</div>`
      : '';

    const segments = [];
    if (base) segments.push(`<div class="info-block info-block-desc">${base}</div>`);
    if (lvlHtml) segments.push(`<div class="info-block info-block-levels">${lvlHtml}</div>`);
    return segments.join('');
  }
  function buildInfoPanelHtml(options = {}) {
    const {
      tagsHtml = '',
      bodyHtml = '',
      meta = [],
      sections = [],
      skadetypHtml = '',
      skadetypLabel = 'Skadetyper',
      conflictTabHtml = '',
      conflictContentHtml = '',
      conflictLabel = 'Konflikter'
    } = options || {};

    const parts = [];

    const trimmedTags = String(tagsHtml || '').trim();
    if (trimmedTags) {
      parts.push(`
        <section class="summary-section info-panel-section info-panel-tags">
          <h3>Nyckelinfo</h3>
          <div class="info-panel-tagswrap">
            <div class="tags">${trimmedTags}</div>
          </div>
        </section>
      `);
    }

    const metaItems = Array.isArray(meta) ? meta.filter(item => item && (item.value || item.value === 0)) : [];
    if (metaItems.length) {
      const metaRows = metaItems.map(item => {
        const label = String(item.label || '').trim();
        const value = item.value === 0 ? '0' : (item.value ?? '');
        const valueHtml = typeof value === 'string' ? value : String(value);
        return `
          <li>
            <span class="summary-key">${label}</span>
            <span class="summary-value">${valueHtml}</span>
          </li>
        `;
      }).join('');
      parts.push(`
        <section class="summary-section info-panel-section info-panel-meta">
          <h3>Fakta</h3>
          <ul class="summary-list summary-pairs">
            ${metaRows}
          </ul>
        </section>
      `);
    }

    const trimmedBody = String(bodyHtml || '').trim();
    if (trimmedBody) {
      parts.push(`
        <section class="summary-section info-panel-section info-panel-body">
          <h3>Beskrivning</h3>
          <div class="info-panel-body">${trimmedBody}</div>
        </section>
      `);
    }

    const extraSections = Array.isArray(sections) ? sections : [];
    extraSections.forEach(sec => {
      if (!sec) return;
      const title = String(sec.title || '').trim();
      const content = String(sec.content || '').trim();
      if (!content) return;
      const extraClass = sec.className ? ` ${sec.className}` : '';
      const headingHtml = title ? `<h3>${title}</h3>` : '';
      parts.push(`
        <section class="summary-section info-panel-section${extraClass}">
          ${headingHtml}
          <div class="info-panel-extra">${content}</div>
        </section>
      `);
    });

    const inner = parts.join('');
    const hasSkadeTab = String(skadetypHtml || '').trim().length > 0;
    const hasConflictTab = String(conflictContentHtml || '').trim().length > 0;
    if (!hasSkadeTab && !hasConflictTab) {
      return `<div class="info-panel-content summary-content">${inner}</div>`;
    }

    const tabLabel = String(skadetypLabel || 'Skadetyper').trim() || 'Skadetyper';
    const conflictTabLabel = String(conflictLabel || 'Konflikter').trim() || 'Konflikter';
    const conflictTab = conflictTabHtml || `<button class="info-tab" data-tab="conflict">${conflictTabLabel}</button>`;
    return `
      <div class="info-panel-content summary-content has-tabs">
        <div class="info-tab-header">
          <button class="info-tab active" data-tab="info">Info</button>
          ${hasSkadeTab ? `<button class="info-tab" data-tab="skadetyp">${tabLabel}</button>` : ''}
          ${hasConflictTab ? conflictTab : ''}
        </div>
        <div class="info-tab-panels">
          <div class="info-tab-panel active" data-tab-panel="info">${inner}</div>
          ${hasSkadeTab ? `<div class="info-tab-panel" data-tab-panel="skadetyp">${skadetypHtml}</div>` : ''}
          ${hasConflictTab ? `<div class="info-tab-panel" data-tab-panel="conflict">${conflictContentHtml}</div>` : ''}
        </div>
      </div>`;
  }
  window.formatText = formatText;
  window.abilityHtml = abilityHtml;
  window.buildInfoPanelHtml = buildInfoPanelHtml;
})(window);
