(function(window){
  if (window.toolsPopupShell) return;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function make(tag, className = '', text = null) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function decorateInput(input) {
    if (input instanceof HTMLElement) input.classList.add('db-input');
    return input;
  }

  function decorateSelect(select) {
    if (select instanceof HTMLElement) select.classList.add('db-select__input');
    return select;
  }

  function createShell(options = {}) {
    const tabs = Array.isArray(options.tabs) ? options.tabs.filter(Boolean) : [];
    const root = make('div', 'db-tabs popup-tabs tools-popup-shell');
    const list = make('div', 'db-tabs__list popup-tabs__list tools-tabs');
    const panels = make('div', 'popup-tabs__panels tools-panels');
    const tabButtons = new Map();
    const tabPanels = new Map();
    let activeTab = '';

    if (options.className) root.classList.add(...String(options.className).trim().split(/\s+/).filter(Boolean));
    if (options.listClassName) list.classList.add(...String(options.listClassName).trim().split(/\s+/).filter(Boolean));
    if (options.panelsClassName) panels.classList.add(...String(options.panelsClassName).trim().split(/\s+/).filter(Boolean));

    list.setAttribute('role', 'tablist');
    if (options.ariaLabel) list.setAttribute('aria-label', String(options.ariaLabel));

    const setActiveTab = (tabId, setOptions = {}) => {
      const notify = Boolean(setOptions.notify);
      const nextId = tabButtons.has(tabId) ? tabId : (tabs[0]?.id || '');
      activeTab = nextId;
      tabButtons.forEach((btn, id) => {
        const isActive = id === nextId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
        if (isActive) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
      });
      tabPanels.forEach((panel, id) => {
        const isActive = id === nextId;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
      });
      if (notify && typeof options.onTabChange === 'function') {
        options.onTabChange(nextId);
      }
      return nextId;
    };

    tabs.forEach((tab, index) => {
      const button = make('button', 'db-tabs__tab popup-tabs__tab tools-tab', tab.label || tab.title || tab.id);
      const panel = make('section', 'db-tabs__panel popup-tabs__panel tools-panel');
      const buttonId = tab.buttonId || `${options.idPrefix || 'tools'}Tab-${tab.id}`;
      const panelId = tab.panelId || `${options.idPrefix || 'tools'}Panel-${tab.id}`;

      if (tab.buttonClassName) {
        button.classList.add(...String(tab.buttonClassName).trim().split(/\s+/).filter(Boolean));
      }
      if (tab.panelClassName) {
        panel.classList.add(...String(tab.panelClassName).trim().split(/\s+/).filter(Boolean));
      }

      button.type = 'button';
      button.id = buttonId;
      button.dataset.tab = tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', panelId);
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;

      panel.id = panelId;
      panel.dataset.tab = tab.id;
      panel.dataset.tabPanel = tab.id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', buttonId);
      panel.hidden = true;

      list.appendChild(button);
      panels.appendChild(panel);
      tabButtons.set(tab.id, button);
      tabPanels.set(tab.id, panel);

      if (typeof tab.build === 'function') {
        tab.build(panel, { index, tab, make, decorateInput, decorateSelect, escapeHtml });
      } else if (tab.content instanceof Node) {
        panel.appendChild(tab.content);
      } else if (typeof tab.html === 'string' && tab.html) {
        panel.innerHTML = tab.html;
      }

      button.addEventListener('click', () => {
        setActiveTab(tab.id);
        if (typeof options.onTabChange === 'function') {
          options.onTabChange(tab.id);
        }
      });
    });

    root.appendChild(list);
    root.appendChild(panels);

    const initialTab = tabs.some(tab => tab.id === options.initialTab)
      ? options.initialTab
      : (tabs[0]?.id || '');
    if (initialTab) setActiveTab(initialTab);

    return {
      root,
      list,
      panels,
      tabButtons,
      tabPanels,
      make,
      setActiveTab,
      getActiveTab: () => activeTab
    };
  }

  window.toolsPopupShell = {
    escapeHtml,
    make,
    decorateInput,
    decorateSelect,
    createShell
  };
})(window);
