(function(window){
  function create(){
    if(document.getElementById('tabellPopup')) return;
    const wrap = document.createElement('div');
    wrap.id = 'tabellPopup';
    wrap.innerHTML = `
      <div class="popup-inner">
        <button id="tabellClose" class="char-btn icon">✕</button>
        <div id="tabellContent"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.querySelector('#tabellClose').addEventListener('click', close);
  }

  function open(html){
    create();
    document.getElementById('tabellContent').innerHTML = html || '';
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
