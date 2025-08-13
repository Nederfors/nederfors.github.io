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
        </div>
        <div id="tabellContent"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.querySelector('#tabellClose').addEventListener('click', close);
    wrap.addEventListener('click', e => {
      if (e.target === wrap) close();
    });
  }

  function open(html, title){
    create();
    document.getElementById('tabellContent').innerHTML = html || '';
    document.getElementById('tabellTitle').textContent = title || '';
    document.getElementById('tabellPopup').classList.add('open');
  }

  function close(){
    const p = document.getElementById('tabellPopup');
    if(p) p.classList.remove('open');
  }

  window.tabellPopup = { open, close };
  if(document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);
})(window);
