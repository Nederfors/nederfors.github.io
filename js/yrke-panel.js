(function(window){
  let outsideHandler = null;
  function create() {
    if (document.getElementById('yrkePanel')) return;
    const panel = document.createElement('aside');
    panel.id = 'yrkePanel';
    panel.innerHTML = `
      <header class="inv-header">
        <div class="inv-actions"><span id="yrkeXp" class="xp-cost"></span></div>
        <h2 id="yrkeTitle"></h2>
        <div class="inv-actions"><button id="yrkeClose" class="char-btn icon">✕</button></div>
      </header>
      <div id="yrkeContent"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#yrkeClose').addEventListener('click', close);
  }

  function open(title, html, xp){
    create();
    document.getElementById('yrkeTitle').textContent = title || '';
    const xpEl = document.getElementById('yrkeXp');
    if (xpEl) {
      if (xp === undefined || xp === null) xpEl.textContent = '';
      else {
        const xpText = xp < 0 ? `+${-xp}` : xp;
        xpEl.textContent = `Erf: ${xpText}`;
      }
    }
    document.getElementById('yrkeContent').innerHTML = html || '';
    const panel = document.getElementById('yrkePanel');

    // Ensure any previous listener is removed to avoid duplicates
    if(outsideHandler){
      document.removeEventListener('click', outsideHandler);
    }

    panel.classList.add('open');
    panel.scrollTop = 0;
    window.updateScrollLock?.();
    outsideHandler = e => {
      if(!panel.contains(e.target)){
        close();
      }
    };
    setTimeout(() => document.addEventListener('click', outsideHandler));
  }

  function close(){
    const p = document.getElementById('yrkePanel');
    if(p) {
      p.classList.remove('open');
      window.updateScrollLock?.();
    }
    if(outsideHandler){
      document.removeEventListener('click', outsideHandler);
      outsideHandler = null;
    }
  }

  window.yrkePanel = { open, close };
  if (document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);
})(window);
