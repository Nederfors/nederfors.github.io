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
    return base ? `${base}${lvlHtml}` : lvlHtml;
  }
  window.formatText = formatText;
  window.abilityHtml = abilityHtml;
})(window);
