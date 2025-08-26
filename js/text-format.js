(function(window){
  function formatText(str){
    if(!str) return '';
    return str
      .split(/\n{2,}/)                   // dela upp i stycken vid tomma rader
      .map(p => p
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>')
      )
      .map(p => `<p>${p}</p>`)            // wrappa varje stycke i <p>
      .join('');
  }

  function abilityHtml(p, maxLevel){
    if(!p) return '';
    const base = formatText(p.beskrivning || '');
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
