(function(window){
  function applyContentMode(wrap){
    if (!wrap) return;
    const inner = wrap.querySelector('.popup-inner');
    const hasTableView = !!wrap.querySelector('.tabell-view');
    wrap.classList.toggle('has-table-view', hasTableView);
    inner?.classList.toggle('has-table-view', hasTableView);
    if (!hasTableView) inner?.classList.remove('nowrap');
  }

  function create(){
    if(document.getElementById('tabellPopup')) return;
    const wrap = document.createElement('div');
    wrap.id = 'tabellPopup';
    wrap.innerHTML = `
      <div class="popup-inner">
        <div class="popup-header">
          <button id="tabellClose" class="char-btn icon">✕</button>
          <h2 id="tabellTitle"></h2>
          <div class="header-actions" id="tabellActions">
            <button id="tabellNoWrap" class="char-btn icon" title="Ingen radbrytning">↔︎</button>
            <button id="tabellWidth" class="char-btn icon" title="Växla bredd">⤢</button>
          </div>
        </div>
        <div id="tabellContent"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    window.registerOverlayElement?.(wrap);
    wrap.querySelector('#tabellClose').addEventListener('click', close);
    wrap.querySelector('#tabellWidth').addEventListener('click', (e) => {
      const inner = wrap.querySelector('.popup-inner');
      inner.classList.toggle('wide');
      e.currentTarget.classList.toggle('danger', !inner.classList.contains('wide'));
    });
    wrap.querySelector('#tabellNoWrap').addEventListener('click', (e) => {
      const inner = wrap.querySelector('.popup-inner');
      inner.classList.toggle('nowrap');
      e.currentTarget.classList.toggle('danger', !inner.classList.contains('nowrap'));
    });
    wrap.addEventListener('click', e => {
      if (e.target === wrap) close();
    });
  }

  function open(html, title){
    create();
    document.getElementById('tabellContent').innerHTML = html || '';
    document.getElementById('tabellTitle').textContent = title || '';
    const pop = document.getElementById('tabellPopup');
    window.registerOverlayElement?.(pop);
    const inner = pop.querySelector('.popup-inner');
    const content = document.getElementById('tabellContent');
    const isMobile = window.matchMedia('(max-width: 760px)').matches;
    const hasTableView = !!pop.querySelector('.tabell-view');
    // Default modes on open: wide + no-wrap on desktop only
    inner.classList.toggle('wide', !isMobile);
    inner.classList.toggle('nowrap', !isMobile && hasTableView);
    const noWrapBtn = pop.querySelector('#tabellNoWrap');
    const wideBtn   = pop.querySelector('#tabellWidth');
    if (noWrapBtn) noWrapBtn.classList.remove('danger');
    if (wideBtn)   wideBtn.classList.remove('danger');
    applyContentMode(pop);
    pop.classList.add('open');
    inner.scrollTop = 0;
    if (content) content.scrollTop = 0;
    window.updateScrollLock?.();
  }

  function close(){
    const p = document.getElementById('tabellPopup');
    if(p) {
      p.classList.remove('open');
      p.classList.remove('has-table-view');
      p.querySelector('.popup-inner')?.classList.remove('has-table-view');
      window.updateScrollLock?.();
    }
  }

  window.tabellPopup = { open, close };
  if(document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);

})(window);
