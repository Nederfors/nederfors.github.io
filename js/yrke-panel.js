(function(window){
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
    const panel = document.createElement('div');
    panel.id = 'yrkePanel';
    panel.classList.add('db-drawer', 'db-drawer--structured', 'db-drawer--content-wide', 'offcanvas');
    panel.dataset.touchProfile = 'panel-right';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('inert', '');
    panel.innerHTML = `
      <div class="db-drawer__overlay" aria-hidden="true"></div>
      <aside class="db-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="yrkeTitle">
        <header class="inv-header">
          <h2 id="yrkeTitle"></h2>
          <div class="inv-actions">
            <button id="yrkeClose" class="db-btn db-btn--icon">✕</button>
          </div>
        </header>
        <div id="yrkeContent" class="db-drawer__body"></div>
      </aside>
    `;
    document.body.appendChild(panel);
    window.registerOverlayElement?.(panel);
    panel.querySelector('#yrkeClose').addEventListener('click', close);
    panel.addEventListener('click', (e) => {
      const conflictBtn = e.target.closest('[data-conflict-btn]');
      const tab = e.target.closest('.info-tab');
      const skadetypSummary = e.target.closest('.skadetyp-level-details > summary');
      if (skadetypSummary) {
        const detailsEl = skadetypSummary.parentElement;
        requestAnimationFrame(() => {
          if (!detailsEl?.open) return;
          const scope = detailsEl.closest('.skadetyp-panel') || panel;
          scope.querySelectorAll('.skadetyp-level-details[open]').forEach(other => {
            if (other !== detailsEl) other.open = false;
          });
        });
        return;
      }
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

    panel.scrollTop = 0;
    window.popupManager?.open?.(panel, {
      type: 'form',
      touchProfile: 'panel-right',
      onClose: () => { conflictHandler = null; }
    });
    if (options.initialTab) {
      activateTab(panel, options.initialTab);
      requestAnimationFrame(() => activateTab(panel, options.initialTab));
    }
  }

  function close(){
    const p = document.getElementById('yrkePanel');
    if (p) window.popupManager?.close?.(p, 'programmatic');
    conflictHandler = null;
  }

  window.yrkePanel = { open, close };
  if (document.readyState !== 'loading') create();
  else document.addEventListener('DOMContentLoaded', create);
})(window);
