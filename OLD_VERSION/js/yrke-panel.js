(function(window){
  let outsideHandler = null;
  let conflictHandler = null;

  function activateTab(container, tabName) {
    if (!container || !tabName) return;
    const root = container.matches?.('.info-panel-content.has-tabs')
      ? container
      : container.querySelector?.('.info-panel-content.has-tabs');
    if (!root) return;
    const tabBtn = root.querySelector(`.info-tab[data-tab="${tabName}"]`);
    if (!tabBtn) return;
    root.querySelectorAll('.info-tab').forEach(btn => btn.classList.toggle('active', btn === tabBtn));
    root.querySelectorAll('.info-tab-panel').forEach(panelEl => {
      panelEl.classList.toggle('active', panelEl.dataset.tabPanel === tabName);
    });
  }

  function create() {
    if (document.getElementById('yrkePanel')) return;
    const panel = document.createElement('aside');
    panel.id = 'yrkePanel';
    panel.classList.add('offcanvas');
    panel.innerHTML = `
      <header class="inv-header">
        <h2 id="yrkeTitle"></h2>
        <div class="inv-actions">
          <button id="yrkeClose" class="char-btn icon">✕</button>
        </div>
      </header>
      <div id="yrkeContent"></div>
    `;
    document.body.appendChild(panel);
    window.registerOverlayElement?.(panel);
    panel.querySelector('#yrkeClose').addEventListener('click', close);
    panel.addEventListener('click', (e) => {
      const conflictBtn = e.target.closest('[data-conflict-btn]');
      const tab = e.target.closest('.info-tab');
      if (!tab) return;
      const target = tab.dataset.tab;
      if (!target) return;
      activateTab(tab.closest('.info-panel-content.has-tabs'), target);
    });
  }

  function open(title, html, opts){
    const options = (opts && typeof opts === 'object') ? opts : {};
    create();
    document.getElementById('yrkeTitle').textContent = title || '';
    document.getElementById('yrkeContent').innerHTML = html || '';
    const panel = document.getElementById('yrkePanel');
    conflictHandler = (options.conflict && typeof options.conflict.onClick === 'function')
      ? options.conflict.onClick
      : null;

    // Ensure any previous listener is removed to avoid duplicates
    if(outsideHandler){
      document.removeEventListener('click', outsideHandler);
    }

    panel.classList.add('open');
    panel.scrollTop = 0;
    if (options.initialTab) {
      activateTab(panel, options.initialTab);
      requestAnimationFrame(() => activateTab(panel, options.initialTab));
    }
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
    conflictHandler = null;
    if(outsideHandler){
      document.removeEventListener('click', outsideHandler);
      outsideHandler = null;
    }
  }

  window.yrkePanel = { open, close };
  if (document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);
})(window);
