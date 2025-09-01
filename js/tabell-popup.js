(function(window){
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
    wrap.querySelector('#tabellClose').addEventListener('click', close);

    const actions = wrap.querySelector('#tabellActions');
    const isMobile = window.matchMedia('(max-width: 600px)').matches;

    if (isMobile) {
      actions.remove();
    } else {
      wrap.querySelector('#tabellWidth').addEventListener('click', (e) => {
        const inner = wrap.querySelector('.popup-inner');
        inner.classList.toggle('wide');
        // Red when OFF
        e.currentTarget.classList.toggle('danger', !inner.classList.contains('wide'));
      });
      wrap.querySelector('#tabellNoWrap').addEventListener('click', (e) => {
        const inner = wrap.querySelector('.popup-inner');
        inner.classList.toggle('nowrap');
        // Red when OFF
        e.currentTarget.classList.toggle('danger', !inner.classList.contains('nowrap'));
      });
    }
    wrap.addEventListener('click', e => {
      if (e.target === wrap) close();
    });
  }

  function open(html, title){
    create();
    document.getElementById('tabellContent').innerHTML = html || '';
    document.getElementById('tabellTitle').textContent = title || '';
    const pop = document.getElementById('tabellPopup');
    const inner = pop.querySelector('.popup-inner');
    // Default modes on open: wide + no-wrap
    inner.classList.add('wide', 'nowrap');
    const noWrapBtn = pop.querySelector('#tabellNoWrap');
    const wideBtn   = pop.querySelector('#tabellWidth');
    if (noWrapBtn) noWrapBtn.classList.remove('danger');
    if (wideBtn)   wideBtn.classList.remove('danger');
    pop.classList.add('open');
    inner.scrollTop = 0;
    window.updateScrollLock?.();
  }

  function close(){
    const p = document.getElementById('tabellPopup');
    if(p) {
      p.classList.remove('open');
      window.updateScrollLock?.();
    }
  }

  window.tabellPopup = { open, close };
  if(document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);

})(window);
