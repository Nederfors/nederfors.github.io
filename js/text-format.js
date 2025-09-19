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
    const lvls = [];
    const levels = (window.LVL || ['Novis','Ges\u00e4ll','M\u00e4stare']);

    // Determine if the object uses the standard Novis/Gesäll/Mästare levels
    const keys = Object.keys(p.nivåer);
    const usesStandard = keys.some(k => levels.includes(k));

    if (usesStandard) {
      const idx = maxLevel ? levels.indexOf(maxLevel) : -1;
      const use = idx >= 0 ? levels.slice(0, idx + 1) : levels;
      use.forEach(l => {
        if (p.nivåer[l]) {
          lvls.push(`<dt>${l}</dt><dd>${formatText(p.nivåer[l])}</dd>`);
        }
      });
    } else {
      // Generic handling for entries like artefacts with Förmåga 1/2/... keys
      keys.forEach(k => {
        lvls.push(`<dt>${k}</dt><dd>${formatText(p.nivåer[k])}</dd>`);
      });
    }

    const lvlHtml = lvls.length ? `<dl class="levels">${lvls.join('')}</dl>` : '';
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
      sections = []
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
    return `<div class="info-panel-content summary-content">${inner}</div>`;
  }
  window.formatText = formatText;
  window.abilityHtml = abilityHtml;
  window.buildInfoPanelHtml = buildInfoPanelHtml;
})(window);
