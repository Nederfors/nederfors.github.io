(function(window){
  function create() {
    if (document.getElementById('yrkePanel')) return;
    const panel = document.createElement('aside');
    panel.id = 'yrkePanel';
    panel.innerHTML = `
      <header class="inv-header">
        <h2 id="yrkeTitle"></h2>
        <button id="yrkeClose" class="char-btn icon">✕</button>
      </header>
      <div id="yrkeContent"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#yrkeClose').addEventListener('click', close);
  }

  function open(title, html){
    create();
    document.getElementById('yrkeTitle').textContent = title || '';
    document.getElementById('yrkeContent').innerHTML = html || '';
    document.getElementById('yrkePanel').classList.add('open');
  }

  function close(){
    const p = document.getElementById('yrkePanel');
    if(p) p.classList.remove('open');
  }

  window.yrkePanel = { open, close };
  if (document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);
})(window);
