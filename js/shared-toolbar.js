/* ===========================================================
   js/shared-toolbar.js
   Web Component som innehåller:
     • Verktygsrad
     • Off-canvas-paneler: Filter, Info
     • Popup för kvaliteter
   =========================================================== */
const FILTER_TOOLS_KEY = 'filterToolsOpen';
const FILTER_SETTINGS_KEY = 'filterSettingsOpen';
// Dessa kort ska alltid starta kollapsade och inte minnas sitt läge.
const NON_PERSISTENT_FILTER_CARDS = new Set(['filterFormalCard', 'filterSettingsCard']);
const FILTER_CARD_KEY_MAP = Object.freeze({
  filterFormalCard: FILTER_TOOLS_KEY,
  filterSettingsCard: FILTER_SETTINGS_KEY
});

const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';

class SharedToolbar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // One-time flag: ensure filter cards restore state on first open
    this._filterFirstOpenHandled = false;
    this._keyboardLikelyVisible = false;
    this._keyboardVisibilityTimer = null;
  }

  /* ------------------------------------------------------- */
  connectedCallback() {
    this.render();
    window.autoResizeAll?.(this.shadowRoot);
    this.dispatchEvent(new CustomEvent('toolbar-rendered'));

    const toolbar = this.shadowRoot.querySelector('.toolbar');
    if (window.visualViewport && toolbar) {
      this._toolbarElement = toolbar;
      this._largeViewportHeight = null;

      const measureLayoutViewport = () =>
        Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);

      const refreshLargeViewportHeight = (reset = false) => {
        const measurement = measureLayoutViewport();
        const shouldForceBaseline = reset || !this._keyboardLikelyVisible || this._largeViewportHeight == null;
        if (shouldForceBaseline) {
          this._largeViewportHeight = measurement;
          return;
        }
        if (measurement > this._largeViewportHeight) {
          this._largeViewportHeight = measurement;
        }
      };

      const updateToolbarLift = ({ resetLargeViewport } = {}) => {
        const vv = window.visualViewport;
        if (!vv || !this._toolbarElement) {
          return;
        }

        refreshLargeViewportHeight(resetLargeViewport);

        let lift = 0;
        const virtualKeyboard = navigator.virtualKeyboard;
        const keyboardRect = virtualKeyboard?.boundingRect;
        if (keyboardRect && typeof keyboardRect.height === 'number') {
          lift = Math.max(0, keyboardRect.height);
        }

        if (!lift) {
          const vvHeight = vv.height ?? 0;
          const vvOffsetTop = vv.offsetTop ?? 0;
          let layoutViewportHeight = this._largeViewportHeight ?? measureLayoutViewport();
          // Use offsetTop instead of pageTop so the toolbar lift stays stable while scrolling.
          lift = Math.max(0, layoutViewportHeight - (vvHeight + vvOffsetTop));
          const offsetTop = vvOffsetTop;

          if (lift > 0 && offsetTop === 0) {
            refreshLargeViewportHeight(true);
            layoutViewportHeight = this._largeViewportHeight ?? measureLayoutViewport();
            lift = Math.max(0, layoutViewportHeight - (vvHeight + vvOffsetTop));
          }

          if (!lift) {
            const offsetLift = offsetTop > 0 ? offsetTop : 0;
            const minOffset = 8;
            if (this._keyboardLikelyVisible && offsetLift > minOffset) {
              lift = offsetLift;
            }
          }
        }

        if (!this._keyboardLikelyVisible && lift > 0) {
          const minResidualLift = 12; // ignore tiny offsets caused by viewport chrome jitter
          if (lift < minResidualLift) {
            lift = 0;
          }
        }

        if (lift > 0) {
          this._toolbarElement.style.setProperty('--toolbar-lift', `${lift}px`);
        } else {
          this._toolbarElement.style.removeProperty('--toolbar-lift');
        }
      };

      this._updateToolbarLift = updateToolbarLift;

      const scheduleToolbarLiftUpdate = opts => {
        window.requestAnimationFrame(() => this._updateToolbarLift?.(opts));
      };
      this._scheduleToolbarLiftUpdate = scheduleToolbarLiftUpdate;

      const setKeyboardLikelyVisible = visible => {
        if (this._keyboardLikelyVisible === visible) {
          return;
        }
        this._keyboardLikelyVisible = visible;
        if (this._toolbarElement) {
          this._toolbarElement.classList.toggle('keyboard-open', visible);
        }
        if (visible) {
          scheduleToolbarLiftUpdate();
        } else {
          this._toolbarElement?.style.removeProperty('--toolbar-lift');
          scheduleToolbarLiftUpdate({ resetLargeViewport: true });
        }
      };

      if (!navigator.virtualKeyboard) {
        const textInputTypes = new Set(['text', 'search', 'email', 'url', 'password', 'tel', 'number']);
        const isTextInput = el => {
          if (!el) {
            return false;
          }
          if (el.isContentEditable) {
            return true;
          }
          const tag = el.tagName;
          if (!tag) {
            return false;
          }
          const tagName = tag.toUpperCase();
          if (tagName === 'TEXTAREA') {
            return true;
          }
          if (tagName === 'INPUT') {
            const type = (el.getAttribute('type') || '').toLowerCase();
            return !type || textInputTypes.has(type);
          }
          return tagName === 'SELECT';
        };

        const handleFocusIn = event => {
          if (isTextInput(event.target)) {
            if (this._keyboardVisibilityTimer) {
              clearTimeout(this._keyboardVisibilityTimer);
              this._keyboardVisibilityTimer = null;
            }
            setKeyboardLikelyVisible(true);
          }
        };

        const handleFocusOut = () => {
          if (this._keyboardVisibilityTimer) {
            clearTimeout(this._keyboardVisibilityTimer);
          }
          this._keyboardVisibilityTimer = setTimeout(() => {
            const active = document.activeElement;
            if (isTextInput(active)) {
              setKeyboardLikelyVisible(true);
            } else {
              setKeyboardLikelyVisible(false);
            }
            this._keyboardVisibilityTimer = null;
          }, 150);
        };

        document.addEventListener('focusin', handleFocusIn);
        document.addEventListener('focusout', handleFocusOut);
        this._keyboardVisibilityCleanup = () => {
          document.removeEventListener('focusin', handleFocusIn);
          document.removeEventListener('focusout', handleFocusOut);
        };
      }

      const vvEvents = 'ongeometrychange' in window.visualViewport
        ? ['geometrychange']
        : ['resize', 'scroll'];

      this._vvCleanup = vvEvents.map(type => {
        const handler = () => scheduleToolbarLiftUpdate();
        window.visualViewport.addEventListener(type, handler);
        return () => window.visualViewport?.removeEventListener(type, handler);
      });

      const fallbackEvents = [
        { target: window, type: 'focusout' },
        { target: window, type: 'touchend' },
        { target: window, type: 'orientationchange', reset: true },
        { target: window, type: 'resize', reset: true }
      ];

      this._vvFallbackCleanup = fallbackEvents.map(({ target, type, reset }) => {
        const fallbackHandler = () => {
          const opts = reset ? { resetLargeViewport: true } : undefined;
          scheduleToolbarLiftUpdate(opts);
        };
        target.addEventListener(type, fallbackHandler, { passive: true });
        return () => target.removeEventListener(type, fallbackHandler, { passive: true });
      });

      if (navigator.virtualKeyboard?.addEventListener) {
        this._vkHandler = () => scheduleToolbarLiftUpdate();
        navigator.virtualKeyboard.addEventListener('geometrychange', this._vkHandler);
      }

      scheduleToolbarLiftUpdate({ resetLargeViewport: true });
    }

    this.cache();
    this.shadowRoot.addEventListener('click', e => this.handleClick(e));
    this._outsideHandler = e => this.handleOutsideClick(e);
    document.addEventListener('click', this._outsideHandler);
    this.updateToolbarLinks();

    // Expose method for dynamic updates
    window.updateToolbarLinks = () => this.updateToolbarLinks();

    const nativeGetElementById = document.getElementById.bind(document);
    document.getElementById = id =>
      nativeGetElementById(id) || this.shadowRoot.getElementById(id);

    window.openDialog  = (msg, opts) => this.openDialog(msg, opts);
    window.alertPopup  = msg => this.openDialog(msg);
    window.confirmPopup = msg => this.openDialog(msg, { cancel: true });
    let toastTimer;
    window.toast = msg => {
      let el = document.getElementById('toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
    };

    // Allow search suggestions to scroll without affecting the page
    const sugEl = this.shadowRoot.getElementById('searchSuggest');
    ['touchmove','wheel'].forEach(ev =>
      sugEl.addEventListener(ev, e => e.stopPropagation())
    );
  }

  disconnectedCallback() {
    this._vvCleanup?.forEach(cleanup => cleanup());
    this._vvCleanup = null;
    this._vvFallbackCleanup?.forEach(cleanup => cleanup());
    this._vvFallbackCleanup = null;
    if (this._keyboardVisibilityTimer) {
      clearTimeout(this._keyboardVisibilityTimer);
      this._keyboardVisibilityTimer = null;
    }
    this._keyboardVisibilityCleanup?.();
    this._keyboardVisibilityCleanup = null;
    this._keyboardLikelyVisible = false;
    this._toolbarElement?.classList.remove('keyboard-open');
    if (navigator.virtualKeyboard?.removeEventListener && this._vkHandler) {
      navigator.virtualKeyboard.removeEventListener('geometrychange', this._vkHandler);
    }
    this._vkHandler = null;
    this._toolbarElement?.style.removeProperty('--toolbar-lift');
    this._updateToolbarLift = null;
    this._scheduleToolbarLiftUpdate = null;
    this._toolbarElement = null;
    this._largeViewportHeight = null;
    document.removeEventListener('click', this._outsideHandler);
  }

  /* ------------------------------------------------------- */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }

        .toolbar {
          position: fixed;
          bottom: calc(env(safe-area-inset-bottom) + var(--toolbar-lift, 0px));
          left: 0;
          right: 0;
          width: 100%;
          z-index: 900;
          background: var(--panel);
          border-top: 1.5px solid var(--border);
          padding: .6rem .8rem;
          display: flex;
          flex-direction: column;
          gap: .6rem;
        }
        .toolbar-top {
          display: flex;
          align-items: center;
          gap: .6rem;
        }
        .toolbar-top .search-wrap { flex: 1 1 110px; min-width: 90px; position: relative; }
        .toolbar-top .search-wrap input { width: 100%; }
        .toolbar-top .suggestions {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + .35rem);
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: .55rem;
          box-shadow: 0 6px 18px rgba(0,0,0,.25);
          max-height: 40vh;
          overflow: auto;
          overscroll-behavior: contain;
          z-index: 1200;
          padding: .25rem;
        }
        .toolbar-top .suggestions .item {
          padding: .4rem .6rem;
          border-radius: .4rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: .45rem;
        }
        .toolbar-top .suggestions .item .suggest-icon .btn-icon {
          width: 1.4rem;
          height: 1.4rem;
        }
        .toolbar-top .suggestions .item .suggest-emoji {
          font-size: 1.1rem;
          line-height: 1;
        }
        .toolbar-top .suggestions .item .suggest-label {
          flex: 1;
        }
        .emoji-fallback {
          display: inline-block;
          font-size: 1.2rem;
          line-height: 1;
        }
        .toolbar-top .suggestions .item:hover,
        .toolbar-top .suggestions .item.active {
          background: var(--border);
        }
        .button-row {
          display: flex;
          gap: .6rem;
        }
        @media (pointer: coarse) {
          .toolbar.keyboard-open .button-row {
            pointer-events: none;
          }
        }
        .button-row > a,
        .button-row > button {
          flex: 1;
          min-width: 0;
        }
        .button-row .char-btn {
          padding: .55rem 1.1rem;
          min-height: 3rem;
        }
        .button-row .char-btn.icon-only {
          padding: .55rem 1.1rem;
        }
        .generator-popup .popup-desc {
          margin-bottom: .5rem;
          color: var(--txt-muted, var(--txt));
          opacity: .85;
        }
        .generator-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: .9rem;
        }
        .generator-grid .filter-group {
          margin-bottom: 0;
        }
        .generator-popup .filter-group + .generator-grid,
        .generator-grid + .generator-grid {
          margin-top: .9rem;
        }
        .generator-popup .field-hint {
          margin-top: .35rem;
          font-size: .85rem;
          color: var(--txt-muted, #c7c7c7);
        }
        .btn-icon {
          width: 1.8rem;
          height: 1.8rem;
          max-width: 100%;
          max-height: 100%;
          display: block;
          pointer-events: none;
          object-fit: contain;
        }
        .char-btn.icon .btn-icon {
          width: 1.8rem;
          height: 1.8rem;
        }
        .char-btn.icon-only .btn-icon {
          width: 2rem;
          height: 2rem;
        }
        .party-toggle .btn-icon {
          width: 1.85rem;
          height: 1.85rem;
        }
        .button-row .nav-link.active {
          background: var(--neutral);
          color: #1d2118;
          font-weight: 600;
        }
        .button-row .nav-link.active:hover {
          opacity: 1;
        }
        .toolbar .exp-counter {
          display: flex;
          align-items: center;
          gap: .3rem;
          background: var(--border);
          color: var(--txt);
          padding: .3rem .7rem;
          border-radius: .55rem;
          font-weight: 600;
          font-size: .9rem;
          white-space: nowrap;
        }
        .toolbar .exp-counter span {
          color: var(--accent);
          font-variant-numeric: tabular-nums;
        }
        #entrySortPopup .popup-inner {
          align-items: stretch;
          text-align: left;
        }
        .sort-grid {
          display: flex;
          flex-direction: column;
          gap: .5rem;
          margin-bottom: .2rem;
        }
        .sort-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .75rem;
          padding: .9rem 1rem;
          width: 100%;
          background: var(--card);
          color: var(--txt);
          border-radius: .8rem;
          border: 2px solid var(--card-border);
          cursor: pointer;
          text-align: left;
          transition: background .14s ease, transform .08s ease, border-color .14s ease, color .14s ease, box-shadow .14s ease;
        }
        .sort-btn .sort-label-wrap {
          display: flex;
          flex-direction: column;
          gap: .2rem;
          align-items: flex-start;
          min-width: 0;
          flex: 1;
        }
        .sort-btn .sort-label {
          display: flex;
          align-items: center;
          gap: .65rem;
          font-weight: 700;
        }
        .sort-btn .sort-label .btn-icon {
          width: 1.45rem;
          height: 1.45rem;
          flex-shrink: 0;
        }
        .sort-btn .sort-hint {
          color: var(--txt-muted, var(--txt));
          font-size: .92rem;
        }
        .sort-btn .sort-check {
          width: 1.2rem;
          height: 1.2rem;
          border-radius: .35rem;
          border: 2px solid var(--card-border);
          display: grid;
          place-items: center;
          background: var(--bg);
          color: transparent;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,.12) inset;
        }
        .sort-btn:hover {
          border-color: var(--accent);
          box-shadow: 0 10px 24px rgba(0,0,0,.18);
        }
        .sort-btn:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .sort-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .sort-btn.active .sort-hint {
          color: rgba(255,255,255,.85);
        }
        .sort-btn.active .sort-check {
          background: #fff;
          border-color: #fff;
          color: var(--accent);
        }
        .sort-btn.active .sort-check::after {
          content: '✓';
          font-weight: 800;
        }
        .sort-meta {
          color: var(--txt-muted, var(--txt));
          font-size: .9rem;
          margin: .15rem 0 .35rem;
        }
        .char-btn,
        .toolbar button,
        .toolbar a {
          padding: .55rem 1.1rem;
          border: none;
          border-radius: .6rem;
          background: var(--accent);
          color: #fff;
          cursor: pointer;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          transition: transform .1s ease, opacity .1s ease;
        }
        .char-btn.danger { background: var(--danger); }
        .char-btn.icon   { font-size: 1.1rem; }
        .char-btn:hover  { opacity: .85; }
        .char-btn:active { transform: scale(.95); opacity: .7; }
        /* Ensure help card and search filter cards can never be collapsed */
        .help-card.compact .card-desc { display: block !important; }
        #searchFiltersCard.compact .card-desc { display: block !important; }
      </style>
      <link rel="stylesheet" href="css/style.css">

      <!-- ---------- Verktygsrad ---------- -->
      <footer class="toolbar">
        <div class="toolbar-top">
          <button id="catToggle" class="char-btn icon" title="Minimera alla kategorier">▼</button>
          <div class="search-wrap">
            <input id="searchField" placeholder="T.ex 'Pajkastare'" autocomplete="off">
            <div id="searchSuggest" class="suggestions" hidden></div>
          </div>
          <span class="exp-counter">XP: <span id="xpOut">0</span></span>
        </div>
        <div class="button-row">
          <a       id="traitsLink" class="char-btn icon icon-only nav-link" title="Egenskaper" href="traits.html">${icon('egenskaper')}</a>
          <a       id="inventoryLink" class="char-btn icon nav-link" title="Inventarievy" href="inventory.html">${icon('inventarie')}</a>
          <a       id="indexLink" class="char-btn icon icon-only nav-link" title="Index" href="index.html">${icon('index')}</a>
          <a       id="characterLink" class="char-btn icon icon-only nav-link" title="Rollperson" href="character.html">${icon('character')}</a>
          <button  id="filterToggle" class="char-btn icon icon-only" title="Filter">${icon('settings')}</button>
        </div>
      </footer>

      <!-- ---------- Filter ---------- -->
      <aside id="filterPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Filter</h2>
          <div class="inv-actions">
            <button id="collapseAllFilters" class="char-btn icon" title="Öppna alla">▶</button>
            <button class="char-btn icon" data-close="filterPanel">✕</button>
          </div>
        </header>

        <ul class="card-list">
          <li class="card" data-special="__formal__" id="filterFormalCard">
            <div class="card-title"><span><span class="collapse-btn"></span>Verktyg ${icon('tool-box', { className: 'title-icon', alt: 'Verktyg' })}</span></div>
            <div class="card-desc">
              <!-- Välj rollperson och Aktiv mapp -->
              <div class="filter-group">
                <label for="charSelect">Välj rollperson</label>
                <select id="charSelect"></select>
              </div>
              <div class="filter-group">
                <label for="folderFilter">Aktiv mapp</label>
                <select id="folderFilter"></select>
              </div>

              <!-- Helradsknappar -->
              <div class="char-btn-row">
                <button id="newCharBtn" class="char-btn">Ny rollperson</button>
              </div>
              <div class="char-btn-row">
                <button id="generateCharBtn" class="char-btn">Generera rollperson</button>
              </div>
              <div class="char-btn-row">
                <button id="duplicateChar" class="char-btn">Kopiera rollperson</button>
              </div>
              <div class="char-btn-row">
                <button id="renameChar" class="char-btn">Byt namn</button>
              </div>
              <div class="char-btn-row">
                <button id="manageFolders" class="char-btn">Mapphantering</button>
              </div>
              <div class="char-btn-row">
                <button id="exportChar" class="char-btn">Exportera</button>
              </div>
              <div class="char-btn-row">
                <button id="importChar" class="char-btn">Importera</button>
              </div>
              <div class="char-btn-row">
                <button id="driveStorageBtn" class="char-btn">Drivelagring</button>
              </div>
              <div class="char-btn-row">
                <button id="pdfLibraryBtn" class="char-btn">PDF-bank</button>
              </div>
              <div class="char-btn-row">
                <button id="checkForUpdates" class="char-btn">Uppdatera appen</button>
              </div>
              <div class="char-btn-row">
                <button id="deleteChar" class="char-btn danger">Radera rollperson</button>
              </div>
            </div>
          </li>
          <li class="card" data-special="__formal__" id="filterSettingsCard">
            <div class="card-title"><span><span class="collapse-btn"></span>Inställningar ${icon('lamp', { className: 'title-icon', alt: 'Inställningar' })}</span></div>
            <div class="card-desc">
              <!-- Grupp med partymedlemmar och vy-knappar -->
              <div class="filter-group party-toggles">
                <ul class="toggle-list">
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Smed i partyt?</span>
                    </span>
                    <button id="partySmith" class="party-toggle icon-only">${icon('smithing')}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Alkemist i partyt?</span>
                    </span>
                    <button id="partyAlchemist" class="party-toggle icon-only">${icon('alkemi')}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Artefaktmakare i partyt?</span>
                    </span>
                    <button id="partyArtefacter" class="party-toggle icon-only">${icon('artefakt') || '<span class="emoji-fallback">🏺</span>'}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Utvidgad sökning?</span>
                    </span>
                    <button id="filterUnion" class="party-toggle icon-only" title="Matcha någon tag (OR)">${icon('extend') || '<span class="emoji-fallback">🔭</span>'}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Expandera vy?</span>
                    </span>
                    <button id="entryViewToggle" class="party-toggle icon-only" title="Expandera vy">${icon('expand') || '<span class="emoji-fallback">↕️</span>'}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Beräkna försvar?</span>
                    </span>
                    <button id="forceDefense" class="party-toggle icon-only" title="Öppna försvarsberäkning">${icon('forsvar') || '<span class="emoji-fallback">🏃</span>'}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Manuella justeringar?</span>
                    </span>
                    <button id="manualAdjustBtn" class="party-toggle icon-only" title="Hantera manuella justeringar">${icon('adjust')}</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Sortering?</span>
                    </span>
                    <button id="entrySortBtn" class="party-toggle icon-only" title="Välj sorteringsordning">
                      ${icon('sort', { className: 'btn-icon', alt: 'Sortering' })}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ul>
        <!-- Sökfilter-kort som samlar relaterade dropdowns -->
        <div class="card" id="searchFiltersCard">
          <div class="card-title">Sökfilter</div>
          <div class="card-desc">
            <div class="filter-group">
              <label for="typFilter">Typ</label>
              <select id="typFilter"></select>
            </div>
            <div class="filter-group">
              <label for="arkFilter">Arketyp</label>
              <select id="arkFilter"></select>
            </div>
            <div class="filter-group">
              <label for="testFilter">Test</label>
              <select id="testFilter"></select>
            </div>
          </div>
        </div>
        <!-- Hjälp-ruta för att tydliggöra koppling till knappen -->
        <div class="card help-card">
          <div class="card-desc">
            <div class="filter-group party-toggles">
              <ul class="toggle-list">
                <li>
                  <span class="toggle-desc">
                    <span class="toggle-question">Behöver du hjälp?</span>
                  </span>
                  <button id="infoToggle" class="party-toggle icon-only" title="Visa hjälp">${icon('info')}</button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </aside>

      <!-- ---------- Popup Kvalitet ---------- -->
      <div id="qualPopup" class="popup">
        <div class="popup-inner">
          <h3 id="qualTitle">Välj kvalitet</h3>
          <div id="qualOptions"></div>
          <button id="qualCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Custom ---------- -->
      <div id="customPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3 id="customTitle">Nytt föremål</h3>
          <input id="customName" placeholder="Namn">
          <div id="customTypeGroup" class="filter-group">
            <label for="customType">Typ</label>
            <div class="custom-type-row">
              <select id="customType"></select>
              <button id="customTypeAdd" class="char-btn icon icon-only" type="button" aria-label="Lägg till typ" title="Lägg till typ">${icon('plus')}</button>
            </div>
            <div id="customTypeTags" class="tags"></div>
          </div>
          <div id="customArtifactEffect" class="filter-group" style="display:none">
            <label for="artifactEffect">Effekt</label>
            <select id="artifactEffect">
              <option value="">Obunden</option>
              <option value="xp">\u20131 erfarenhet</option>
              <option value="corruption">+1 permanent korruption</option>
            </select>
          </div>
          <div id="customWeaponFields" class="filter-group" style="display:none">
            <label for="customDamage">Skada</label>
            <input id="customDamage" placeholder="Skada">
          </div>
          <div id="customVehicleFields" class="filter-group" style="display:none">
            <label for="customCapacity">Bärkapacitet</label>
            <input id="customCapacity" type="number" min="0" step="1" placeholder="Bärkapacitet">
          </div>
          <div id="customLevelFields" class="filter-group" style="display:none">
            <label for="customLevelMode">Nivåtyp</label>
            <select id="customLevelMode">
              <option value="novis">Novis</option>
              <option value="gesall">Gesäll</option>
              <option value="mastare">Mästare</option>
              <option value="triple">Novis/Gesäll/Mästare</option>
            </select>
            <textarea id="customLevelNovis" class="auto-resize" placeholder="Novis"></textarea>
            <textarea id="customLevelGesall" class="auto-resize" placeholder="Gesäll"></textarea>
            <textarea id="customLevelMastare" class="auto-resize" placeholder="Mästare"></textarea>
          </div>
          <div id="customPowerFields" class="filter-group" style="display:none">
            <label>Förmågor</label>
            <div id="customPowerList"></div>
            <button id="customPowerAdd" class="char-btn icon icon-only" type="button" aria-label="Lägg till förmåga" title="Lägg till förmåga">${icon('plus')}</button>
          </div>
          <div id="customBoundFields" class="filter-group" style="display:none">
            <label for="customBoundType">Bundet till</label>
            <select id="customBoundType">
              <option value="">Obundet</option>
              <option value="kraft">Mystisk kraft</option>
              <option value="ritual">Ritual</option>
            </select>
            <input id="customBoundLabel" placeholder="Etikett (t.ex. Formel)">
          </div>
          <div id="customArmorFields" class="filter-group" style="display:none">
            <label for="customProtection">Skydd</label>
            <input id="customProtection" placeholder="Skydd">
            <label for="customRestriction">Begränsning</label>
            <input id="customRestriction" type="number" step="1" placeholder="Begränsning">
          </div>
          <div class="filter-group">
            <label for="customWeight">Vikt</label>
            <input id="customWeight" type="number" min="0" step="0.01" placeholder="Vikt">
          </div>
          <div class="money-row">
            <input id="customDaler" type="number" min="0" placeholder="Daler">
            <input id="customSkilling" type="number" min="0" placeholder="Skilling">
            <input id="customOrtegar" type="number" min="0" placeholder="Örtegar">
          </div>
          <textarea id="customDesc" class="auto-resize" placeholder="Beskrivning"></textarea>
          <button id="customAdd" class="char-btn" type="button">Spara</button>
          <button id="customDelete" class="char-btn danger" type="button" style="display:none">Radera</button>
          <button id="customCancel" class="char-btn danger" type="button">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Pengar ---------- -->
      <div id="moneyPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Hantera pengar</h3>
          <div class="money-wrapper">
            <section class="money-section card money-section-fast">
              <header class="money-header">
                <h4>Snabbspendera</h4>
                <p>Kostnader som inte ska sparas i inventariet.</p>
              </header>
              <div class="money-row">
                <input id="moneyDaler" type="number" min="0" placeholder="Daler">
                <input id="moneySkilling" type="number" min="0" placeholder="Skilling">
                <input id="moneyOrtegar" type="number" min="0" placeholder="Örtegar">
              </div>
              <div class="money-button-row">
                <button id="moneySpendBtn" class="char-btn">Betala</button>
              </div>
            </section>
            <section class="money-section card money-section-balance">
              <header class="money-header">
                <h4>Saldo</h4>
                <p>Justera kontanterna när ditt lager har ändrats.</p>
              </header>
              <div class="money-row">
                <input id="moneyBalanceDaler" type="number" min="0" placeholder="Daler">
                <input id="moneyBalanceSkilling" type="number" min="0" placeholder="Skilling">
                <input id="moneyBalanceOrtegar" type="number" min="0" placeholder="Örtegar">
              </div>
              <div class="money-button-row">
                <button id="moneySetBtn" class="char-btn">Spara som totalen</button>
                <button id="moneyAddBtn" class="char-btn">Addera till totalen</button>
              </div>
              <button id="moneyResetBtn" class="char-btn danger">Nollställ pengar</button>
            </section>
            <p id="moneyStatus" class="money-status"></p>
            <button id="moneyCancel" class="char-btn danger">Stäng</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Manuella justeringar ---------- -->
      <div id="manualAdjustPopup" class="popup">
        <div class="popup-inner">
          <h3>Manuella justeringar</h3>
          <p class="manual-adjust-hint">Använd knapparna för att lägga till eller ta bort manuella ändringar. Erf påverkar endast spenderad erfarenhet.</p>
          <div class="manual-adjust-groups" id="manualAdjustGroups">
            <div class="manual-adjust-card card">
              <div class="manual-adjust-label">
                <span>Korruption</span>
                <span id="manualCorruptionDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="char-btn" type="button" data-type="corruption" data-direction="decrease">-1</button>
                <button class="char-btn" type="button" data-type="corruption" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card card">
              <div class="manual-adjust-label">
                <span>Spenderad erf</span>
                <span id="manualXpDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="char-btn" type="button" data-type="xp" data-direction="decrease">-1</button>
                <button class="char-btn" type="button" data-type="xp" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card card">
              <div class="manual-adjust-label">
                <span>Tålighet</span>
                <span id="manualToughnessDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="char-btn" type="button" data-type="toughness" data-direction="decrease">-1</button>
                <button class="char-btn" type="button" data-type="toughness" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card card">
              <div class="manual-adjust-label">
                <span>Smärtgräns</span>
                <span id="manualPainDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="char-btn" type="button" data-type="pain" data-direction="decrease">-1</button>
                <button class="char-btn" type="button" data-type="pain" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card card">
              <div class="manual-adjust-label">
                <span>Bärkapacitet</span>
                <span id="manualCapacityDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="char-btn" type="button" data-type="capacity" data-direction="decrease">-1</button>
                <button class="char-btn" type="button" data-type="capacity" data-direction="increase">+1</button>
              </div>
            </div>
          </div>
          <div class="manual-adjust-footer">
            <button id="manualAdjustReset" class="char-btn danger" type="button">Återställ</button>
            <button id="manualAdjustClose" class="char-btn" type="button">Stäng</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Spara & Gratis ---------- -->
      <div id="saveFreePopup" class="popup">
        <div class="popup-inner">
          <p>Du håller på att markera allt i ditt inventarie som gratis och spara dina oanvända pengar som dina enda pengar. Är du säker på att du vill fortsätta?</p>
          <div class="confirm-row">
            <button id="saveFreeCancel" class="char-btn danger">Nej</button>
            <button id="saveFreeConfirm" class="char-btn">Ja</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Varning Fördelspengar ---------- -->
      <div id="advMoneyPopup" class="popup">
        <div class="popup-inner">
          <p>Du håller på att ändra pengar du fått från en fördel.</p>
          <div class="confirm-row">
            <button id="advMoneyCancel" class="char-btn danger">Avbryt</button>
            <button id="advMoneyConfirm" class="char-btn">Fortsätt</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Antal ---------- -->
      <div id="qtyPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Lägg till antal</h3>
          <input id="qtyInput" type="number" min="1" step="1" placeholder="Antal">
          <div id="qtyItemList"></div>
          <button id="qtyCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Köp Flera ---------- -->
      <div id="buyMultiplePopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Köp flera</h3>
          <p id="buyMultipleItemName" class="popup-item-name" hidden></p>
          <input id="buyMultipleInput" type="number" min="1" step="1" placeholder="Antal" aria-label="Antal att köpa">
          <div class="confirm-row">
            <button id="buyMultipleCancel" class="char-btn danger">Avbryt</button>
            <button id="buyMultipleRemove" class="char-btn">Ta bort</button>
            <button id="buyMultipleConfirm" class="char-btn">Lägg till</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Live-köp ---------- -->
      <div id="liveBuyPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Köp i live-läge</h3>
          <p id="liveBuyItemName" class="popup-item-name" hidden></p>
          <label class="live-buy-label" for="liveBuyQty">Antal</label>
          <input id="liveBuyQty" type="number" min="1" step="1" placeholder="Antal" aria-label="Antal att köpa">
          <fieldset class="live-buy-fieldset">
            <legend>Pris per enhet</legend>
            <div class="money-row">
              <input id="liveBuyPriceDaler" type="number" min="0" step="1" placeholder="Daler" aria-label="Pris i daler">
              <input id="liveBuyPriceSkilling" type="number" min="0" step="1" placeholder="Skilling" aria-label="Pris i skilling">
              <input id="liveBuyPriceOrtegar" type="number" min="0" step="1" placeholder="Örtegar" aria-label="Pris i örtegar">
            </div>
          </fieldset>
          <div class="confirm-row">
            <button id="liveBuyCancel" class="char-btn danger">Avbryt</button>
            <button id="liveBuyConfirm" class="char-btn">Köp</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Pris ---------- -->
      <div id="pricePopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Multiplicera pris</h3>
          <input id="priceFactor" type="number" step="0.1" placeholder="Faktor">
          <div id="priceItemList"></div>
          <button id="priceApply" class="char-btn">Verkställ</button>
          <button id="priceCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Snabb Pris ---------- -->
      <div id="rowPricePopup" class="popup">
        <div class="popup-inner">
          <h3>Snabb prisjustering</h3>
          <div class="export-sections">
            <div class="card export-card">
              <div class="card-title">Multiplicera pris</div>
              <div class="card-desc">
                <div class="price-custom-row">
                  <input id="rowPriceFactor" type="number" min="0" step="0.1" placeholder="Faktor">
                  <button id="rowPriceApply" class="char-btn">Multiplicera</button>
                </div>
                <div id="rowPricePresets" class="char-btn-row three-col">
                  <button class="char-btn" data-factor="0.5">×0.5</button>
                  <button class="char-btn" data-factor="1.5">×1.5</button>
                  <button class="char-btn" data-factor="2">×2</button>
                </div>
              </div>
            </div>
            <div class="card export-card">
              <div class="card-title">Sätt nytt grundpris</div>
              <div class="card-desc">
                <label for="rowBaseDaler">Pris</label>
                <div class="inline-controls">
                  <div class="money-row">
                    <input id="rowBaseDaler" type="number" min="0" placeholder="Daler">
                    <input id="rowBaseSkilling" type="number" min="0" placeholder="Skilling">
                    <input id="rowBaseOrtegar" type="number" min="0" placeholder="Örtegar">
                  </div>
                </div>
                <button id="rowBaseApply" class="char-btn">Sätt pris</button>
              </div>
            </div>
          </div>
          <button id="rowPriceCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Färdmedel ---------- -->
      <div id="vehiclePopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Flytta till färdmedel</h3>
          <select id="vehicleSelect"></select>
          <div id="vehicleItemList"></div>
          <button id="vehicleApply" class="char-btn">Verkställ</button>
          <button id="vehicleCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Ta ut ur färdmedel ---------- -->
      <div id="vehicleRemovePopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Ta ut ur färdmedel</h3>
          <select id="vehicleRemoveSelect"></select>
          <div id="vehicleRemoveItemList"></div>
          <button id="vehicleRemoveApply" class="char-btn">Verkställ</button>
          <button id="vehicleRemoveCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Antal för färdmedel ---------- -->
      <div id="vehicleQtyPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3 id="vehicleQtyTitle">Välj antal</h3>
          <p id="vehicleQtyMessage"></p>
          <p id="vehicleQtyHint"></p>
          <input id="vehicleQtyInput" type="number" min="1" step="1" placeholder="Antal">
          <div class="confirm-row">
            <button id="vehicleQtyCancel" class="char-btn danger">Avbryt</button>
            <button id="vehicleQtyConfirm" class="char-btn">Verkställ</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Pengar i färdmedel ---------- -->
      <div id="vehicleMoneyPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3 id="vehicleMoneyTitle">Ta ut pengar</h3>
          <p id="vehicleMoneyMessage"></p>
          <p id="vehicleMoneyHint"></p>
          <div class="vehicle-money-inputs">
            <input id="vehicleMoneyDalerRemove" type="number" min="0" step="1" placeholder="Daler">
            <input id="vehicleMoneySkillingRemove" type="number" min="0" step="1" placeholder="Skilling">
            <input id="vehicleMoneyOrtegarRemove" type="number" min="0" step="1" placeholder="Örtegar">
          </div>
          <p id="vehicleMoneyError" class="popup-error"></p>
          <div class="confirm-row">
            <button id="vehicleMoneyCancel" class="char-btn danger">Avbryt</button>
            <button id="vehicleMoneyConfirm" class="char-btn">Verkställ</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Beräkna försvar ---------- -->
      <div id="defenseCalcPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Beräkna försvar</h3>
          <div class="defense-calc-card">
            <div class="defense-calc-heading">Grundval</div>
            <div class="defense-calc-field">
              <label for="defenseCalcTrait">Karaktärsdrag</label>
              <select id="defenseCalcTrait"></select>
            </div>
            <div class="defense-calc-field">
              <label for="defenseCalcArmor">Rustning</label>
              <select id="defenseCalcArmor"></select>
            </div>
          </div>
          <div class="defense-calc-card defense-calc-group">
            <div class="defense-calc-heading">Vapen & sköldar</div>
            <p id="defenseCalcEmpty" class="popup-desc" hidden></p>
            <div id="defenseCalcWeaponList" class="defense-item-list"></div>
          </div>
          <div id="defenseCalcDancingCard" class="defense-calc-card defense-calc-card-dancing">
            <div class="defense-calc-heading">Dansande vapen</div>
            <div class="defense-calc-field">
              <label for="defenseCalcDancingTrait">Karaktärsdrag</label>
              <select id="defenseCalcDancingTrait"></select>
            </div>
            <div class="defense-calc-field">
              <label for="defenseCalcDancingWeapon">Vapen</label>
              <select id="defenseCalcDancingWeapon"></select>
            </div>
            <p class="popup-desc">Om inget vapen väljs används inget vapen för dansande vapen.</p>
          </div>
          <div class="confirm-row">
            <button id="defenseCalcReset" class="char-btn danger" type="button">Återställ</button>
            <button id="defenseCalcCancel" class="char-btn danger" type="button">Avbryt</button>
            <button id="defenseCalcApply" class="char-btn" type="button">Verkställ</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Ta bort föremål med innehåll ---------- -->
      <div id="deleteContainerPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <p id="deleteContainerText">Du håller på att ta bort ett föremål som innehåller föremål. Vill du ta bort föremålen i föremålet?</p>
          <button id="deleteContainerAll" class="char-btn danger">Ja, ta bort allt</button>
          <button id="deleteContainerOnly" class="char-btn">Ta bara bort föremålet</button>
          <button id="deleteContainerCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Alkemistniv\u00e5 ---------- -->
      <div id="alcPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Alkemistniv\u00e5</h3>
          <div id="alcOptions">
            <button data-level="" class="char-btn">Ingen</button>
            <button data-level="Novis" class="char-btn">Novis</button>
            <button data-level="Ges\u00e4ll" class="char-btn">Ges\u00e4ll</button>
            <button data-level="M\u00e4stare" class="char-btn">M\u00e4stare</button>
          </div>
          <button id="alcCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Smedsniv\u00e5 ---------- -->
      <div id="smithPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Smedsniv\u00e5</h3>
          <div id="smithOptions">
            <button data-level="" class="char-btn">Ingen</button>
            <button data-level="Novis" class="char-btn">Novis</button>
            <button data-level="Ges\u00e4ll" class="char-btn">Ges\u00e4ll</button>
            <button data-level="M\u00e4stare" class="char-btn">M\u00e4stare</button>
          </div>
          <button id="smithCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Artefaktmakarniv\u00e5 ---------- -->
      <div id="artPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Artefaktmakarniv\u00e5</h3>
          <div id="artOptions">
            <button data-level="" class="char-btn">Ingen</button>
            <button data-level="Novis" class="char-btn">Novis</button>
            <button data-level="Ges\u00e4ll" class="char-btn">Ges\u00e4ll</button>
            <button data-level="M\u00e4stare" class="char-btn">M\u00e4stare</button>
          </div>
        <button id="artCancel" class="char-btn danger">Avbryt</button>
      </div>
      </div>

      <!-- ---------- Popup Sortering ---------- -->
      <div id="entrySortPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Sortera poster</h3>
          <p class="popup-desc">Välj hur posterna i varje kategori ska ordnas.</p>
          <div id="entrySortOptions" class="sort-grid">
            <button class="sort-btn" type="button" data-mode="alpha-asc">
              <span class="sort-label-wrap">
                <span class="sort-label">${icon('sort')} Alfabetisk (A → Ö)</span>
                <span class="sort-hint">Standardordning</span>
              </span>
              <span class="sort-check" aria-hidden="true"></span>
            </button>
            <button class="sort-btn" type="button" data-mode="alpha-desc">
              <span class="sort-label-wrap">
                <span class="sort-label">${icon('sort')} Alfabetisk (Ö → A)</span>
                <span class="sort-hint">Omvänd alfabetisk ordning</span>
              </span>
              <span class="sort-check" aria-hidden="true"></span>
            </button>
            <button class="sort-btn" type="button" data-mode="newest">
              <span class="sort-label-wrap">
                <span class="sort-label">${icon('sort')} Nyast först</span>
                <span class="sort-hint">Senast tillagda hamnar överst</span>
              </span>
              <span class="sort-check" aria-hidden="true"></span>
            </button>
            <button class="sort-btn" type="button" data-mode="oldest">
              <span class="sort-label-wrap">
                <span class="sort-label">${icon('sort')} Äldst först</span>
                <span class="sort-hint">Äldre poster visas före nya</span>
              </span>
              <span class="sort-check" aria-hidden="true"></span>
            </button>
            <button class="sort-btn" type="button" data-mode="test">
              <span class="sort-label-wrap">
                <span class="sort-label">${icon('sort')} Efter test</span>
                <span class="sort-hint">Sorterar på test-taggen</span>
              </span>
              <span class="sort-check" aria-hidden="true"></span>
            </button>
            <button class="sort-btn" type="button" data-mode="ark">
              <span class="sort-label-wrap">
                <span class="sort-label">${icon('sort')} Efter arketyp</span>
                <span class="sort-hint">Sorterar på arketyp/tradition</span>
              </span>
              <span class="sort-check" aria-hidden="true"></span>
            </button>
          </div>
          <p class="sort-meta">Standard: Alfabetisk (A → Ö)</p>
          <button id="entrySortSave" class="char-btn">Spara</button>
          <button id="entrySortCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup PDF-bank ---------- -->
      <div id="pdfPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>PDF-bank</h3>
          <div id="pdfOptions"></div>
          <button id="pdfCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Export ---------- -->
      <div id="exportPopup" class="popup">
        <div class="popup-inner">
          <h3>Export</h3>
          <div id="exportOptions"></div>
          <button id="exportCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Drivelagring ---------- -->
      <div id="driveStoragePopup" class="popup">
        <div class="popup-inner">
          <h3>Drivelagring</h3>
          <div id="driveStorageOptions"></div>
          <button id="driveStorageCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Import ---------- -->
      <div id="importPopup" class="popup">
        <div class="popup-inner">
          <h3>Importera</h3>
          <div class="export-sections">
            <div class="card export-card">
              <div class="card-title">Vald mapp</div>
              <div class="card-desc">
                <label for="importFolderSelect">Mapp</label>
                <div class="inline-controls">
                  <select id="importFolderSelect"></select>
                </div>
                <button id="importBtnChoose" class="char-btn">Importera</button>
                <label class="price-item import-check">
                  <input type="checkbox" id="importMakeActiveChoose">
                  <span>Gör målmappen aktiv efter import</span>
                </label>
              </div>
            </div>
            <div class="card export-card">
              <div class="card-title">Mappar i fil</div>
              <div class="card-desc">
                <p>Importera en hel mapp</p>
                <button id="importBtnFromFile" class="char-btn">Importera</button>
                <label class="price-item import-check">
                  <input type="checkbox" id="importMakeActiveFromDir">
                  <span>Gör målmappen aktiv efter import</span>
                </label>
              </div>
            </div>
          </div>
          <div class="confirm-row">
            <button id="importCancel" class="char-btn danger">Avbryt</button>
          </div>
        </div>
      </div>

      

      <!-- ---------- Nilas Popup ---------- -->
      <div id="nilasPopup" class="popup">
        <div class="popup-inner">
          <h3>Nilas \u00e4r b\u00e4st. H\u00e5ller du med?</h3>
          <div class="button-row">
            <button id="nilasNo" class="char-btn">Nej!</button>
            <button id="nilasYes" class="char-btn">Ja!</button>
          </div>
        </div>
      </div>
      <!-- ---------- Popup Mapphanterare ---------- -->
      <div id="folderManagerPopup" class="popup popup-bottom">
        <div class="popup-inner folder-ui">
          <header class="popup-header">
            <h3>Mappar</h3>
            <button id="folderManagerCloseX" class="char-btn icon" title="Stäng">✕</button>
          </header>

          <!-- Skapa ny mapp -->
          <section class="folder-section">
            <h4>Mappar</h4>
            <div class="inline-row">
              <label for="newFolderName">+ Ny mapp:</label>
              <div class="inline-controls">
                <input id="newFolderName" placeholder="Mappnamn">
                <button id="addFolderBtn" class="char-btn icon icon-only" aria-label="Lägg till mapp" title="Lägg till mapp">${icon('plus')}</button>
              </div>
            </div>
          </section>

          <!-- Lista -->
          <section class="folder-section">
            <h4>Lista</h4>
            <div id="folderList" class="folder-list"></div>
          </section>

          <!-- Flytta -->
          <section class="folder-section">
            <h4>Flytta rollpersoner:</h4>
            <div class="inline-row">
              <div id="folderCharList" class="readonly-field"></div>
            </div>
            <div id="folderMoveGroup" class="inline-row">
              <label for="folderMoveSelect">Till mapp:</label>
              <div class="inline-controls">
                <select id="folderMoveSelect"></select>
                <button id="folderMoveApply" class="char-btn">Flytta</button>
              </div>
            </div>
          </section>

          <div class="popup-footer">
            <button id="folderManagerDone" class="char-btn">Klar</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Byt namn på mapp ---------- -->
      <div id="renameFolderPopup" class="popup">
        <div class="popup-inner">
          <h3>Byt namn på mapp</h3>
          <div class="filter-group">
            <label for="renameFolderName">Nytt namn:</label>
            <input id="renameFolderName" type="text" placeholder="Ny mapp" autocomplete="off">
          </div>
          <div class="confirm-row">
            <button id="renameFolderCancel" class="char-btn danger">Avbryt</button>
            <button id="renameFolderApply" class="char-btn">Spara</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Ny rollperson (med mappval) ---------- -->
      <div id="newCharPopup" class="popup">
        <div class="popup-inner">
          <h3>Ny rollperson</h3>
          <div class="filter-group">
            <label for="newCharName">Namn</label>
            <input id="newCharName" type="text" placeholder="Namn på rollperson" autocomplete="off">
          </div>
          <div class="filter-group">
            <label for="newCharFolder">Mapp</label>
            <select id="newCharFolder"></select>
          </div>
          <div class="filter-group">
            <label for="newCharXp">Erfarenhetspoäng</label>
            <div class="xp-control">
              <input id="newCharXp" type="number" min="0" value="0" aria-label="Erfarenhetspoäng">
            </div>
          </div>
          <div class="confirm-row">
            <button id="newCharCancel" class="char-btn danger">Avbryt</button>
            <button id="newCharCreate" class="char-btn">Skapa</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Generera rollperson ---------- -->
      <div id="generatorPopup" class="popup">
        <div class="popup-inner generator-popup">
          <h3>Generera rollperson</h3>
          <p class="popup-desc">Välj startvärden och låt generatorn plocka förmågor automatiskt.</p>
          <div class="generator-grid">
            <div class="filter-group">
              <label for="genCharName">Namn</label>
              <input id="genCharName" type="text" placeholder="Rollpersonens namn" autocomplete="off">
            </div>
            <div class="filter-group">
              <label for="genCharFolder">Mapp</label>
              <select id="genCharFolder"></select>
            </div>
          </div>
          <div class="generator-grid">
            <div class="filter-group">
              <label for="genCharXp">Erfarenhetspoäng</label>
              <div class="xp-control">
                <input id="genCharXp" type="number" min="0" step="10" value="100" aria-label="Erfarenhetspoäng">
              </div>
            </div>
            <div class="filter-group">
              <label for="genCharAttr">Karaktärsdrag</label>
              <select id="genCharAttr">
                <option value="">Balanserade (slump)</option>
                <option value="specialist">Spetskompetens (ett drag pressas till 15)</option>
                <option value="minmax">Ytterligheter (en max, tre höga och ett svagt)</option>
              </select>
            </div>
          </div>
          <div class="generator-grid">
            <div class="filter-group">
              <label for="genCharTrait">Fokusera drag</label>
              <select id="genCharTrait"></select>
            </div>
          </div>
          <div class="generator-grid">
            <div class="filter-group">
              <label for="genCharRace">Ras</label>
              <select id="genCharRace"></select>
            </div>
            <div class="filter-group">
              <label for="genCharYrke">Yrke</label>
              <select id="genCharYrke"></select>
            </div>
          </div>
          <div class="filter-group">
            <label for="genCharElityrke">Elityrke</label>
            <select id="genCharElityrke"></select>
            <p class="field-hint">Elityrket lägger automatiskt in sina krav och minst en elityrkesförmåga.</p>
          </div>
          <div class="confirm-row">
            <button id="genCharCancel" class="char-btn danger">Avbryt</button>
            <button id="genCharCreate" class="char-btn">Generera</button>
          </div>
          <p id="genCharDataWarning" class="field-hint" hidden>Databasen laddas – vänta tills den är klar innan du genererar.</p>
        </div>
      </div>

      <!-- ---------- Popup Kopiera rollperson (med mappval) ---------- -->
      <div id="dupCharPopup" class="popup">
        <div class="popup-inner">
          <h3>Kopiera rollperson</h3>
          <div class="filter-group">
            <label for="dupCharName">Namn på klonen:</label>
            <input id="dupCharName" type="text" placeholder="Boba Fett" autocomplete="off">
          </div>
          <div class="filter-group">
            <label for="dupCharFolder">Klona till mappen:</label>
            <select id="dupCharFolder"></select>
          </div>
          <div class="confirm-row">
            <button id="dupCharCancel" class="char-btn danger">Avbryt</button>
            <button id="dupCharCreate" class="char-btn">Kopiera</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Byt namn (med mappval) ---------- -->
      <div id="renameCharPopup" class="popup">
        <div class="popup-inner">
          <h3>Byt namn</h3>
          <div class="filter-group">
            <label for="renameCharName">Nytt namn:</label>
            <input id="renameCharName" type="text" placeholder="Prutt Pruttsson" autocomplete="off">
          </div>
          <div class="filter-group">
            <label for="renameCharFolder">Flytta också till mappen:</label>
            <select id="renameCharFolder"></select>
          </div>
          <div class="confirm-row">
            <button id="renameCharCancel" class="char-btn danger">Avbryt</button>
            <button id="renameCharApply" class="char-btn">Spara</button>
          </div>
        </div>
      </div>

      <!-- ---------- Dialog Popup ---------- -->
      <div id="dialogPopup" class="popup">
        <div class="popup-inner">
          <p id="dialogMessage"></p>
          <div class="confirm-row">
            <button id="dialogCancel" class="char-btn danger">Avbryt</button>
            <button id="dialogOk" class="char-btn">OK</button>
            <button id="dialogExtra" class="char-btn">Extra</button>
          </div>
        </div>
      </div>

      <!-- ---------- Hemlig Daniel-popup ---------- -->
      <div id="danielPopup" class="popup">
        <div class="popup-inner">
          <h3>Vilken kille!</h3>
          <div class="confirm-row">
            <button id="danielPopupClose" class="char-btn">Visst?!</button>
          </div>
        </div>
      </div>

      <!-- ---------- Hj\u00e4lp ---------- -->
      <aside id="infoPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Hjälp</h2>
          <button class="char-btn icon" data-close="infoPanel">✕</button>
        </header>
        <div class="help-content summary-content">
          <section class="summary-section">
            <h3>Kom igång</h3>
            <ul class="summary-list">
              <li>Sök i fältet ovan och tryck Enter för att filtrera.</li>
              <li>Klicka på en post för detaljer. Lägg till med "Lägg till" eller "+".</li>
              <li>Använd knapparna längst ned: ${icon('egenskaper')} Egenskaper, ${icon('inventarie')} Inventarie, ${icon('index')} Index, ${icon('character')} Rollperson, ${icon('settings')} Filter.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Verktygsrad</h3>
            <ul class="summary-list">
              <li>▼: Minimerar/expanderar alla kategorier i listor.</li>
              <li>${icon('index')} Index och ${icon('character')} Rollperson är separata länkar till respektive vy.</li>
              <li>${icon('inventarie')}: Öppnar inventariesidan. ${icon('egenskaper')}: Öppnar egenskapssidorna (Karaktärsdrag, Översikt, Effekter). ${icon('settings')}: Öppnar filterpanelen.</li>
              <li>${icon('anteckningar')}: Öppnar anteckningssidan (i rollpersonens sidhuvud).</li>
              <li>XP: Visar dina totala erfarenhetspoäng.</li>
              <li>Sök: Skriv och tryck Enter för att lägga till ett filter. Klicka på taggarna under sökfältet för att ta bort filter.</li>
              <li>Förslag: Använd ↑/↓ för att bläddra, klicka för att lägga till.</li>
              <li>Ångra: Esc eller webbläsarens tillbaka stänger senast öppnade panel/popup.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Kortkommandon</h3>
            <ul class="summary-list">
              <li>Enter: Lägg till skriven term.</li>
              <li>Esc: Stäng öppna paneler/popup (desktop).</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Filtermeny</h3>
            <ul class="summary-list">
              <li>Välj rollperson: Byter aktiv rollperson.</li>
              <li>Aktiv mapp: Begränsar listan ”Välj rollperson”. ”Alla” visar alla mappar.</li>
              <li>Typ, Arketyp, Test: Filtrerar listor.</li>
              <li>Ny/Kopiera/Byt namn/Ta bort: Hanterar karaktärer.</li>
              <li>Generera rollperson: Skapar en rollperson automatiskt.</li>
              <li>PDF-bank: Öppnar samlingen med regel-PDF:er.</li>
              <li>Uppdatera appen: Söker efter ny version och uppdaterar.</li>
              <li>Mapphantering: Skapa mappar och flytta rollpersoner mellan mappar.</li>
              <li>Export/Import: Säkerhetskopiera eller hämta karaktärer som JSON.</li>
              <li>${icon('smithing')}/${icon('alkemi')}/${icon('artefakt') || '🏺'}: Välj nivå för smed, alkemist och artefaktmakare (påverkar pris och åtkomst).</li>
              <li>${icon('extend') || '🔭'} Utvidga sökning: Växla till OR-filter (matcha någon tag).</li>
              <li>${icon('expand') || '↕️'} Expandera vy: Visar fler detaljer i kort (alla utom Ras, Yrken och Elityrken).</li>
              <li>${icon('forsvar') || '🏃'} Försvar: Välj försvarskaraktärsdrag manuellt.</li>
              <li>${icon('adjust')} Manuella justeringar: Hantera egna modifieringar.</li>
              <li>${icon('sort')} Sortering: Välj ordning för listor.</li>
              <li>${icon('info')} Hjälp: Visar denna panel.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Inventarie</h3>
            <ul class="summary-list">
              <li>Sök i inventarie: Filtrerar föremål i realtid.</li>
              <li>▶/▼ Öppna eller kollapsa alla.</li>
              <li>🔀 Dra-och-släpp-läge för att ändra ordning.</li>
              <li>🆕 Eget föremål. ${icon('basket', { className: 'title-icon', alt: 'Pengar' })} Pengar (Spara/Addera/Nollställ; ${icon('minus')}/${icon('plus')} justerar 1 daler).</li>
              <li>💸 Multiplicera pris på markerade rader; klick på pris öppnar snabbmeny (×0.5, ×1, ×1.5, ×2).</li>
              <li>🔒 Spara inventarie och markera alla befintliga föremål som gratis. ${icon('broom')} Töm inventariet.</li>
              <li>x² Lägg till flera av samma. Icke-staplingsbara får egna fält.</li>
              <li>Kategori: Filtrera på föremålstyp.</li>
              <li>🛞/🐎 Lasta i: Flytta valda föremål till ett valt färdmedel.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Egenskaper</h3>
            <ul class="summary-list">
              <li>Ange total XP via ${icon('minus')}/${icon('plus')} eller genom att skriva värdet.</li>
              <li>Summeringen visar Totalt/Använt/Oanvänt.</li>
              <li>Knappen "Förmågor: X" filtrerar till Endast valda (ta bort via taggen).</li>
              <li>${icon('broom')} Återställ basegenskaper: Nollställer grundvärdena (påverkar inte bonusar från förmågor/inventarie).</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Rollperson</h3>
            <ul class="summary-list">
              <li>📋 Sammanfattning av försvar, korruption, bärkapacitet, hälsa och träffsäkerhet.</li>
              <li>${icon('effects')} Effekter: Öppnar aktiv effektöversikt.</li>
              <li>${icon('overview')} Översikt: Snabb sammanställning av värden och modifikationer.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Anteckningar</h3>
            <ul class="summary-list">
              <li>✏️ Redigera: Växla läs-/redigeringsläge.</li>
              <li>Sudda: Rensa alla fält. Spara: Spara anteckningar.</li>
              <li>▶/▼ i verktygsraden: Öppna eller stäng alla anteckningsfält samtidigt.</li>
              <li>${icon('index')}/${icon('character')} i sidhuvudet: Till index respektive rollperson.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Listor och rader</h3>
            <ul class="summary-list">
              <li>Lägg till / ${icon('plus')}: Lägg till posten. ${icon('minus')}: Minska antal eller ta bort.</li>
              <li>Info: Visa detaljer.</li>
              <li>🏋🏻‍♂️ Elityrke: Lägg till elityrket med dess krav på förmågor.</li>
              <li>${icon('addqual')} Lägg till kvalitet. ${icon('qualfree')} Markera kostsam kvalitet som gratis.</li>
              <li>${icon('free')} Gör föremål gratis (Shift-klick tar bort gratis). ${(icon('active') || '💔')} Visa konflikter.</li>
              <li>↔ Växla artefaktens kostnad mellan XP och permanent korruption.</li>
              <li>⬇️/⬆️ Lasta på/av föremål till/från färdmedel.</li>
              <li>${icon('remove')} Ta bort posten helt.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Tabeller</h3>
            <ul class="summary-list">
              <li>↔︎ Ingen radbrytning: Visar hela cellinnehållet på en rad. Inaktiverar mobilens staplade vy och möjliggör horisontell scroll. Knappen är röd när funktionen är avstängd.</li>
              <li>⤢ Bred vy: Ökar popupens maxbredd för bredare tabeller. Knappen är röd när bred vy är avstängd.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Tips</h3>
            <ul class="summary-list">
              <li>Knappen "Börja om" i kategorin "Hoppsan" rensar alla filter, kollapsar alla kategorier och uppdaterar sidan.</li>
              <li>Snabb nollställning: Skriv "lol" i sökfältet och tryck Enter för att rensa alla filter.</li>
              <li>Rensa karaktärer: Skriv "BOMB!" i sökfältet och tryck Enter för att radera samtliga karaktärer i den här webbläsaren.</li>
              <li>Klicka på taggarna under sökfältet för att snabbt ta bort ett filter.</li>
              <li>Webbapp: Skriv "webapp" i sökfältet för instruktioner (öppnar webapp-sidan).</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Data & lagring</h3>
            <ul class="summary-list">
              <li>Allt sparas lokalt i din webbläsare (localStorage).</li>
              <li>Använd Export/Import under Filter för säkerhetskopior och flytt mellan enheter.</li>
              <li>Rensar du webbläsardata tas lokala rollpersoner bort.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Installera som webapp</h3>
            <p>
              Instruktioner finns på <a href="webapp.html">webapp-sidan</a>.
              Sidan kan nås via direktlänk eller genom att skriva "webapp" i sökfältet.
            </p>
          </section>
        </div>
      </aside>

    `;
  }

  /* ------------------------------------------------------- */
  cache() {
    const $ = id => this.shadowRoot.getElementById(id);
    this.panels = {
      filterPanel: $('filterPanel'),
      infoPanel  : $('infoPanel')
    };
    this.entryViewToggle = $('entryViewToggle');
    this.filterCollapseBtn = $('collapseAllFilters');
  }

  collapseNonPersistentCards() {
    const ids = Array.from(NON_PERSISTENT_FILTER_CARDS);
    ids.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      el.classList.add('compact');
      window.entryCardFactory?.syncCollapse?.(el);
    });
    try {
      localStorage.removeItem(FILTER_TOOLS_KEY);
      localStorage.removeItem(FILTER_SETTINGS_KEY);
    } catch {}
  }

  restoreFilterCollapse() {
    this.collapseNonPersistentCards();
  }

  updateFilterCollapseBtn() {
    if (!this.filterCollapseBtn) return;
    const cards = [...this.shadowRoot.querySelectorAll('#filterPanel .card:not(#searchFiltersCard):not(.help-card)')];
    const allCollapsed = cards.every(c => c.classList.contains('compact'));
    this.filterCollapseBtn.textContent = allCollapsed ? '▶' : '▼';
    this.filterCollapseBtn.title = allCollapsed ? 'Öppna alla' : 'Kollapsa alla';
  }

  /* ------------------------------------------------------- */
  handleClick(e) {
    const btn = e.target.closest('button, a');
    if (!btn) {
      // Support toggling special cards in Filter via title click
      const title = e.target.closest('#filterPanel .card-title');
      if (title) {
        const card = title.closest('.card');
        const key = FILTER_CARD_KEY_MAP[card?.id];
        if (card) {
          const isCompact = card.classList.toggle('compact');
          if (key && !NON_PERSISTENT_FILTER_CARDS.has(card.id)) {
            localStorage.setItem(key, isCompact ? '0' : '1');
          }
          this.updateFilterCollapseBtn();
          window.entryCardFactory?.syncCollapse?.(card);
        }
      }
      return;
    }

    /* öppna/stäng (toggle) */
    if (btn.id === 'filterToggle') return this.toggle('filterPanel');
    if (btn.id === 'infoToggle')   return this.toggle('infoPanel');
    /* stäng */
    if (btn.dataset.close) return this.close(btn.dataset.close);

    if (btn.id === 'checkForUpdates') {
      if (typeof window.requestPwaUpdate !== 'function') {
        window.toast?.('Uppdateringsfunktionen är inte tillgänglig.');
        return;
      }

      const runUpdate = async () => {
        const originalText = btn.textContent;
        let cacheTextTimer;
        btn.disabled = true;
        btn.textContent = 'Kontrollerar…';

        try {
          cacheTextTimer = setTimeout(() => {
            btn.textContent = 'Cachen uppdateras…';
          }, 150);

          const result = await window.requestPwaUpdate({ forceReload: true });
          if (cacheTextTimer) {
            clearTimeout(cacheTextTimer);
            cacheTextTimer = null;
          }

          switch (result?.status) {
            case 'applied':
              window.toast?.('Uppdaterar appen…');
              break;
            case 'up-to-date':
              window.toast?.('Appen är redan uppdaterad.');
              break;
            case 'missing':
              window.toast?.('Ingen installerad webapp hittades.');
              break;
            case 'error':
              window.toast?.('Kunde inte söka efter uppdatering.');
              break;
            default:
              window.toast?.('Kunde inte söka efter uppdatering.');
              break;
          }

          if (result?.cacheRefresh) {
            switch (result.cacheRefresh.status) {
              case 'refreshed':
                window.toast?.('Cachen uppdaterades.');
                break;
              case 'unavailable':
                window.toast?.('Ingen aktiv service worker kunde uppdatera cachen.');
                break;
              case 'failed':
                window.toast?.('Kunde inte uppdatera cachen.');
                break;
              default:
                break;
            }
          }
        } catch (error) {
          if (cacheTextTimer) {
            clearTimeout(cacheTextTimer);
            cacheTextTimer = null;
          }
          console.error('PWA update failed', error);
          window.toast?.('Kunde inte söka efter uppdatering.');
        } finally {
          if (cacheTextTimer) {
            clearTimeout(cacheTextTimer);
          }
          btn.disabled = false;
          btn.textContent = originalText;
        }
      };

      runUpdate();
      return;
    }

    if (btn.id === 'collapseAllFilters') {
      const cards = [...this.shadowRoot.querySelectorAll('#filterPanel .card:not(#searchFiltersCard):not(.help-card)')];
      const anyOpen = cards.some(c => !c.classList.contains('compact'));
      cards.forEach(c => {
        c.classList.toggle('compact', anyOpen);
        const key = FILTER_CARD_KEY_MAP[c.id];
        if (key && !NON_PERSISTENT_FILTER_CARDS.has(c.id)) {
          localStorage.setItem(key, c.classList.contains('compact') ? '0' : '1');
        }
        window.entryCardFactory?.syncCollapse?.(c);
      });
      // Ensure non-collapsible cards remain open
      const alwaysOpen = this.shadowRoot.querySelectorAll('#searchFiltersCard, .help-card');
      alwaysOpen.forEach(c => {
        c.classList.remove('compact');
        window.entryCardFactory?.syncCollapse?.(c);
      });
      this.updateFilterCollapseBtn();
      return;
    }

    // Collapse/expand specialkorten i filterpanelen
    if (btn.classList.contains('collapse-btn')) {
      const card = btn.closest('#filterPanel .card');
      const key = FILTER_CARD_KEY_MAP[card?.id];
      if (card) {
        const isCompact = card.classList.toggle('compact');
        if (key && !NON_PERSISTENT_FILTER_CARDS.has(card.id)) {
          localStorage.setItem(key, isCompact ? '0' : '1');
        }
        this.updateFilterCollapseBtn();
        window.entryCardFactory?.syncCollapse?.(card);
      }
    }
  }

  handleOutsideClick(e) {
    const buildFallbackPath = start => {
      if (!start) return [];
      const path = [];
      let current = start;
      const seen = new Set();

      while (current && !seen.has(current)) {
        path.push(current);
        seen.add(current);

        if (current === document) {
          path.push(window);
          break;
        }

        if (current instanceof Element) {
          const slot = current.assignedSlot;
          if (slot) {
            current = slot;
            continue;
          }
        }

        if (current.parentNode) {
          current = current.parentNode;
          continue;
        }

        if (current.host) {
          current = current.host;
          continue;
        }

        if (current.defaultView) {
          path.push(current.defaultView);
        }
        break;
      }

      return path;
    };

    const rawPath = typeof e.composedPath === 'function'
      ? e.composedPath()
      : (e.path || buildFallbackPath(e.target));
    const path = Array.isArray(rawPath) ? [...rawPath] : [];
    if (!path.length && e.target) path.push(e.target);

    const containsInPath = target => {
      if (!target) return false;
      return path.some(node => {
        if (!node) return false;
        if (node === target) return true;
        if (typeof target.contains === 'function' && node instanceof Node) {
          return target.contains(node);
        }
        return false;
      });
    };

    const toggleButtons = ['filterToggle','infoToggle']
      .map(id => this.shadowRoot.getElementById(id))
      .filter(Boolean);
    const isToggleClick = toggleButtons.some(btn => containsInPath(btn));
    if (isToggleClick) return;

    // Hide search suggestions when clicking outside search UI
    const sugEl = this.shadowRoot.getElementById('searchSuggest');
    const sIn   = this.shadowRoot.getElementById('searchField');
    if (sugEl && !sugEl.hidden) {
      const insideSearch = containsInPath(sugEl) || containsInPath(sIn);
      if (!insideSearch) {
        sugEl.hidden = true;
      }
    }

    // ignore clicks inside popups so panels stay open
      const popups = ['qualPopup','customPopup','moneyPopup','saveFreePopup','advMoneyPopup','qtyPopup','buyMultiplePopup','liveBuyPopup','pricePopup','rowPricePopup','vehiclePopup','vehicleRemovePopup','vehicleQtyPopup','vehicleMoneyPopup','defenseCalcPopup','masterPopup','alcPopup','smithPopup','artPopup','exportPopup','driveStoragePopup','importPopup','pdfPopup','nilasPopup','tabellPopup','dialogPopup','danielPopup','folderManagerPopup','newCharPopup','generatorPopup','dupCharPopup','renameCharPopup','artifactPaymentPopup','manualAdjustPopup','entrySortPopup'];
    if (path.some(el => el && popups.includes(el.id))) return;

    const openPanel = Object.values(this.panels).find(p => p.classList.contains('open'));
    if (openPanel && !containsInPath(openPanel)) {
      openPanel.classList.remove('open');
    }
  }

  toggle(id) {
    const panel = this.panels[id];
    if (!panel) return;

    // 1. 🛡️ DEBOUNCE: Ignore rapid-fire clicks (Ghost Clicks)
    // If we just toggled this panel <300ms ago, ignore this click.
    const now = Date.now();
    if (this._lastToggle && (now - this._lastToggle < 300)) {
        console.log("🚫 Ghost click blocked.");
        return;
    }
    this._lastToggle = now;

    // 2. CHECK STATE
    const isOpen = panel.classList.contains('open');

    // 3. SYNCHRONOUS CLOSE
    // Always close other panels immediately.
    Object.values(this.panels).forEach(p => p.classList.remove('open'));

    // 4. ASYNC OPEN
    // If we need to open, we WAIT 50ms.
    // This allows the 'click' event to finish bubbling up to the document
    // and for 'handleOutsideClick' to run and finish BEFORE the menu actually opens.
    if (!isOpen) {
      if (id === 'filterPanel') {
        this.collapseNonPersistentCards();
        if (!this._filterFirstOpenHandled) {
          this.restoreFilterCollapse();
          this._filterFirstOpenHandled = true;
        }
        this.updateFilterCollapseBtn();
      }
      
      // The Magic Delay
      setTimeout(() => {
          panel.classList.add('open');
          panel.scrollTop = 0;
      }, 50); 
    }
  }
  open(id)  {
    Object.values(this.panels).forEach(p=>p.classList.remove('open'));
    const panel = this.panels[id];
    if (panel) {
      if (id === 'filterPanel') {
        this.collapseNonPersistentCards();
        if (!this._filterFirstOpenHandled) {
          this.restoreFilterCollapse();
          this._filterFirstOpenHandled = true;
        }
        this.updateFilterCollapseBtn();
      }
      panel.classList.add('open');
      panel.scrollTop = 0;
    }
  }
  close(id) { this.panels[id]?.classList.remove('open'); }

  openDialog(message, opts = {}) {
    const {
      cancel = false,
      okText = 'OK',
      cancelText = 'Avbryt',
      extraText
    } = opts;
    return new Promise(resolve => {
      const pop      = this.shadowRoot.getElementById('dialogPopup');
      const msgEl    = this.shadowRoot.getElementById('dialogMessage');
      const okBtn    = this.shadowRoot.getElementById('dialogOk');
      const cancelBtn= this.shadowRoot.getElementById('dialogCancel');
      const extraBtn = this.shadowRoot.getElementById('dialogExtra');
      msgEl.textContent = message;
      cancelBtn.style.display = cancel ? '' : 'none';
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;
      if (extraText) {
        extraBtn.style.display = '';
        extraBtn.textContent = extraText;
      } else {
        extraBtn.style.display = 'none';
      }
      pop.classList.add('open');
      pop.querySelector('.popup-inner').scrollTop = 0;
      const close = res => {
        pop.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        extraBtn.removeEventListener('click', onExtra);
        pop.removeEventListener('click', onOutside);
        resolve(res);
      };
      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onExtra = () => close('extra');
      const onOutside = e => {
        if (!pop.querySelector('.popup-inner').contains(e.target)) close(false);
      };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      extraBtn.addEventListener('click', onExtra);
      pop.addEventListener('click', onOutside);
    });
  }

  updateToolbarLinks() {
    const role = document.body.dataset.role;
    const setLinkState = (id, href, activeRoles) => {
      const link = this.shadowRoot.getElementById(id);
      if (!link) return;
      if (href) link.href = href;
      const act = Array.isArray(activeRoles) ? activeRoles : [activeRoles];
      const isActive = act.includes(role);
      link.classList.toggle('active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    };

    setLinkState('traitsLink', 'traits.html', ['traits','summary','effects']);
    setLinkState('inventoryLink', 'inventory.html', ['inventory']);
    setLinkState('indexLink', 'index.html', ['index']);
    setLinkState('characterLink', 'character.html', ['character', 'notes']);
  }
}

customElements.define('shared-toolbar', SharedToolbar);
