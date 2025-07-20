(function(window){
  function formatText(str){
    if(!str) return '';
    return str
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function abilityHtml(p, maxLevel){
    if(!p) return '';
    const base = formatText(p.beskrivning || '');
    if(!p.nivåer) return base;
    const lvls = [];
    const levels = (window.LVL || ['Novis','Ges\u00e4ll','M\u00e4stare']);
    const idx = maxLevel ? levels.indexOf(maxLevel) : -1;
    const use = idx >= 0 ? levels.slice(0, idx+1) : levels;
    use.forEach(l => {
      if(p.nivåer[l]){
        lvls.push(`<dt>${l}</dt><dd>${formatText(p.nivåer[l])}</dd>`);
      }
    });
    const lvlHtml = `<dl class="levels">${lvls.join('')}</dl>`;
    return base ? `<p>${base}</p>${lvlHtml}` : lvlHtml;
  }
  window.formatText = formatText;
  window.abilityHtml = abilityHtml;
})(window);
