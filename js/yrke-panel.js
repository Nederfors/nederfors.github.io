(function(window){
  let outsideHandler = null;
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
    const panel = document.getElementById('yrkePanel');

    // Ensure any previous listener is removed to avoid duplicates
    if(outsideHandler){
      document.removeEventListener('click', outsideHandler);
    }

    panel.classList.add('open');
    outsideHandler = e => {
      if(!panel.contains(e.target)){
        close();
      }
    };
    setTimeout(() => document.addEventListener('click', outsideHandler));
  }

  function close(){
    const p = document.getElementById('yrkePanel');
    if(p) p.classList.remove('open');
    if(outsideHandler){
      document.removeEventListener('click', outsideHandler);
      outsideHandler = null;
    }
  }

  window.yrkePanel = { open, close };
  if (document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);
})(window);
