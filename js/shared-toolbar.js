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
const toolbarUiPrefsStorage = window.symbaroumUiPrefs || window.localStorage;
const setToolbarUiPref = (key, value) => {
  try {
    toolbarUiPrefsStorage?.setItem?.(key, value);
  } catch {}
};
const removeToolbarUiPref = (key) => {
  try {
    toolbarUiPrefsStorage?.removeItem?.(key);
  } catch {}
};

const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';
const LEVEL_OPTION_SPECS = Object.freeze([
  { value: '', label: 'Ingen', hint: 'Stäng av bonusen från partyt.' },
  { value: 'Novis', label: 'Novis', hint: 'Grundnivå för hantverket.' },
  { value: 'Gesäll', label: 'Gesäll', hint: 'Mellanläge för bättre stöd.' },
  { value: 'Mästare', label: 'Mästare', hint: 'Högsta nivån för partystöd.' }
]);
const SORT_OPTION_SPECS = Object.freeze([
  { value: 'alpha-asc', label: 'Alfabetisk (A → Ö)', hint: 'Standardordning' },
  { value: 'alpha-desc', label: 'Alfabetisk (Ö → A)', hint: 'Omvänd alfabetisk ordning' },
  { value: 'newest', label: 'Nyast först', hint: 'Senast tillagda hamnar överst' },
  { value: 'oldest', label: 'Äldst först', hint: 'Äldre poster visas före nya' },
  { value: 'test', label: 'Efter test', hint: 'Sorterar på test-taggen' },
  { value: 'ark', label: 'Efter arketyp', hint: 'Sorterar på arketyp/tradition' }
]);
const renderFilterSwitchRow = ({ id, label, note, title, iconName, fallback = '' }) => `
  <li>
    <button id="${id}" class="db-switch filter-setting-switch" type="button" title="${title || label}" aria-checked="false">
      <span class="filter-setting-switch-main">
        <span class="filter-setting-switch-icon" aria-hidden="true">${icon(iconName, { className: 'btn-icon', alt: label }) || fallback}</span>
        <span class="toggle-desc">
          <span class="toggle-question">${label}</span>
          ${note ? `<span class="toggle-note">${note}</span>` : ''}
        </span>
      </span>
      <span class="db-switch__track" aria-hidden="true"><span class="db-switch__thumb"></span></span>
    </button>
  </li>
`.trim();
const renderLevelRadioOptions = (groupName) => `
  <div class="db-radio-group popup-radio-list">
    ${LEVEL_OPTION_SPECS.map(option => (
      window.renderDaubRadioRow
        ? window.renderDaubRadioRow({
          rowClass: 'popup-radio-option',
          labelAttrs: ` data-level="${option.value}"`,
          copyHtml: `<span class="popup-radio-copy"><span class="popup-radio-title">${option.label}</span><span class="popup-radio-hint">${option.hint}</span></span>`,
          inputAttrs: ` name="${groupName}" value="${option.value}"`
        })
        : `
      <label class="db-radio popup-choice-row popup-radio-option" data-level="${option.value}">
        <input class="db-radio__input" type="radio" name="${groupName}" value="${option.value}">
        <span class="db-radio__circle"></span>
        <span class="popup-radio-copy">
          <span class="popup-radio-title">${option.label}</span>
          <span class="popup-radio-hint">${option.hint}</span>
        </span>
      </label>
    `
    )).join('')}
  </div>
`.trim();
const renderSortRadioOptions = () => `
  <div class="db-radio-group sort-option-list">
    ${SORT_OPTION_SPECS.map(option => (
      window.renderDaubRadioRow
        ? window.renderDaubRadioRow({
          rowClass: 'popup-radio-option sort-option',
          labelAttrs: ` data-mode="${option.value}"`,
          copyHtml: `<span class="popup-radio-copy sort-option-copy"><span class="popup-radio-title sort-option-title">${icon('sort', { className: 'btn-icon', alt: 'Sortering' })}<span>${option.label}</span></span><span class="popup-radio-hint">${option.hint}</span></span>`,
          inputAttrs: ` name="entrySortMode" value="${option.value}"`
        })
        : `
      <label class="db-radio popup-choice-row popup-radio-option sort-option" data-mode="${option.value}">
        <input class="db-radio__input" type="radio" name="entrySortMode" value="${option.value}">
        <span class="db-radio__circle"></span>
        <span class="popup-radio-copy sort-option-copy">
          <span class="popup-radio-title sort-option-title">${icon('sort', { className: 'btn-icon', alt: 'Sortering' })}<span>${option.label}</span></span>
          <span class="popup-radio-hint">${option.hint}</span>
        </span>
      </label>
    `
    )).join('')}
  </div>
`.trim();
const popupMeta = (type, size, layoutFamily, mobileMode, touchProfile) => Object.freeze({
  type,
  size,
  layoutFamily,
  mobileMode,
  touchProfile
});
const BASE_POPUP_META_BY_ID = Object.freeze({
  qualPopup: popupMeta('picker', 'md', 'modal', 'center', 'none'),
  manualAdjustPopup: popupMeta('form', 'md', 'modal', 'center', 'none'),
  defenseCalcPopup: popupMeta('form', 'lg', 'workflow-lg', 'center', 'none'),
  alcPopup: popupMeta('form', 'sm', 'modal', 'sheet', 'sheet-down'),
  smithPopup: popupMeta('form', 'sm', 'modal', 'sheet', 'sheet-down'),
  artPopup: popupMeta('form', 'sm', 'modal', 'sheet', 'sheet-down'),
  entrySortPopup: popupMeta('form', 'md', 'modal', 'center', 'none'),
  pdfPopup: popupMeta('form', 'md', 'modal', 'center', 'none'),
  driveStoragePopup: popupMeta('form', 'lg', 'tabbed-popup-lg', 'center', 'none'),
  characterToolsPopup: popupMeta('form', 'lg', 'tools-popup-lg', 'center', 'none'),
  nilasPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down'),
  folderManagerPopup: popupMeta('form', 'md', 'modal', 'center', 'none'),
  renameFolderPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down'),
  newCharPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down'),
  generatorPopup: popupMeta('form', 'md', 'modal', 'center', 'none'),
  dupCharPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down'),
  renameCharPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down'),
  dialogPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down'),
  danielPopup: popupMeta('dialog', 'sm', 'modal', 'sheet', 'sheet-down')
});
const getPopupMetaById = () => Object.freeze({
  ...BASE_POPUP_META_BY_ID,
  ...(window.inventoryPopupRegistry?.getPopupMetaById?.() || {})
});
const renderToolsManagerPopup = ({ popupId, title, optionsId, closeId, className = '' }) => `
      <div id="${popupId}" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner ${String(className || '').trim()}">
          <h3>${title}</h3>
          <div id="${optionsId}" class="tools-popup-content"></div>
          <button id="${closeId}" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>
`;
const renderInventoryPopupSurfaces = () => `
      ${renderToolsManagerPopup({
        popupId: 'inventoryItemsPopup',
        title: 'Hantera föremål',
        optionsId: 'inventoryItemsOptions',
        closeId: 'inventoryItemsClose',
        className: 'inventory-tools-ui'
      })}
      ${renderToolsManagerPopup({
        popupId: 'inventoryEconomyPopup',
        title: 'Hantera ekonomi',
        optionsId: 'inventoryEconomyOptions',
        closeId: 'inventoryEconomyClose',
        className: 'inventory-tools-ui'
      })}

      <div id="liveBuyPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3>Köp i live-läge</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p id="liveBuyItemName" class="tools-meta popup-item-name" hidden></p>
              <div class="tools-form">
                <label class="tools-field">
                  <span class="tools-label">Antal</span>
                  <input id="liveBuyQty" class="db-input" type="number" min="1" step="1" value="1">
                </label>
                <div class="tools-grid two-col">
                  <label class="tools-field">
                    <span class="tools-label">Daler</span>
                    <input id="liveBuyPriceDaler" class="db-input" type="number" min="0" step="1" placeholder="0">
                  </label>
                  <label class="tools-field">
                    <span class="tools-label">Skilling</span>
                    <input id="liveBuyPriceSkilling" class="db-input" type="number" min="0" step="1" placeholder="0">
                  </label>
                </div>
                <label class="tools-field">
                  <span class="tools-label">Örtegar</span>
                  <input id="liveBuyPriceOrtegar" class="db-input" type="number" min="0" step="1" placeholder="0">
                </label>
              </div>
            </section>
          </div>
          <div class="confirm-row">
            <button id="liveBuyCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="liveBuyConfirm" class="db-btn">Köp</button>
          </div>
        </div>
      </div>

      <div id="buyMultiplePopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3>Köp flera</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p id="buyMultipleItemName" class="tools-meta popup-item-name" hidden></p>
              <label class="tools-field">
                <span class="tools-label">Antal</span>
                <input id="buyMultipleInput" class="db-input" type="number" min="1" step="1" placeholder="1">
              </label>
            </section>
          </div>
          <div class="confirm-row">
            <button id="buyMultipleCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="buyMultipleRemove" class="db-btn db-btn--danger">Ta bort</button>
            <button id="buyMultipleConfirm" class="db-btn">Köp</button>
          </div>
        </div>
      </div>

      <div id="rowPricePopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3>Snabb prisjustering</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <div class="tools-form">
                <div id="rowPricePresets" class="tools-grid two-col">
                  <button class="db-btn" type="button" data-factor="0.5">Halvera</button>
                  <button class="db-btn" type="button" data-factor="0.75">-25%</button>
                  <button class="db-btn" type="button" data-factor="1.25">+25%</button>
                  <button class="db-btn" type="button" data-factor="1.5">+50%</button>
                  <button class="db-btn" type="button" data-factor="2">Dubbel</button>
                  <button class="db-btn db-btn--secondary" type="button" data-factor="1">Återställ faktor</button>
                </div>
                <label class="tools-field">
                  <span class="tools-label">Multiplicera pris</span>
                  <input id="rowPriceFactor" class="db-input" type="number" min="0" step="0.01" placeholder="1.25">
                </label>
                <div class="tools-grid two-col">
                  <label class="tools-field">
                    <span class="tools-label">Grundpris i daler</span>
                    <input id="rowBaseDaler" class="db-input" type="number" min="0" step="1" placeholder="0">
                  </label>
                  <label class="tools-field">
                    <span class="tools-label">Grundpris i skilling</span>
                    <input id="rowBaseSkilling" class="db-input" type="number" min="0" step="1" placeholder="0">
                  </label>
                </div>
                <label class="tools-field">
                  <span class="tools-label">Grundpris i örtegar</span>
                  <input id="rowBaseOrtegar" class="db-input" type="number" min="0" step="1" placeholder="0">
                </label>
              </div>
            </section>
          </div>
          <div class="confirm-row">
            <button id="rowPriceCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="rowBaseApply" class="db-btn db-btn--secondary">Sätt grundpris</button>
            <button id="rowPriceApply" class="db-btn">Verkställ</button>
          </div>
        </div>
      </div>

      <div id="vehicleQtyPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3 id="vehicleQtyTitle">Välj antal</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p id="vehicleQtyMessage" class="tools-intro"></p>
              <label class="tools-field">
                <span class="tools-label">Antal</span>
                <input id="vehicleQtyInput" class="db-input" type="number" min="1" step="1" value="1">
              </label>
              <p id="vehicleQtyHint" class="tools-meta"></p>
            </section>
          </div>
          <div class="confirm-row">
            <button id="vehicleQtyCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="vehicleQtyConfirm" class="db-btn">Fortsätt</button>
          </div>
        </div>
      </div>

      <div id="vehicleMoneyPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3 id="vehicleMoneyTitle">Ta ut pengar</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p id="vehicleMoneyMessage" class="tools-intro"></p>
              <p id="vehicleMoneyHint" class="tools-meta"></p>
              <div class="tools-grid two-col">
                <label class="tools-field">
                  <span class="tools-label">Daler</span>
                  <input id="vehicleMoneyDalerRemove" class="db-input" type="number" min="0" step="1" placeholder="0">
                </label>
                <label class="tools-field">
                  <span class="tools-label">Skilling</span>
                  <input id="vehicleMoneySkillingRemove" class="db-input" type="number" min="0" step="1" placeholder="0">
                </label>
              </div>
              <label class="tools-field">
                <span class="tools-label">Örtegar</span>
                <input id="vehicleMoneyOrtegarRemove" class="db-input" type="number" min="0" step="1" placeholder="0">
              </label>
              <p id="vehicleMoneyError" class="tools-meta tools-warning" aria-live="polite"></p>
            </section>
          </div>
          <div class="confirm-row">
            <button id="vehicleMoneyCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="vehicleMoneyConfirm" class="db-btn db-btn--danger">Ta ut</button>
          </div>
        </div>
      </div>

      <div id="saveFreePopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3>Spara och gratismarkera</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p class="tools-intro">Markera alla nuvarande föremål som gratis och spara sedan den aktuella ekonomin som ny utgångspunkt.</p>
            </section>
          </div>
          <div class="confirm-row">
            <button id="saveFreeCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="saveFreeConfirm" class="db-btn">Fortsätt</button>
          </div>
        </div>
      </div>

      <div id="advMoneyPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3>Fördelspengar</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p class="tools-intro">Privata pengar och fördelspengar kommer att nollställas innan åtgärden fortsätter.</p>
            </section>
          </div>
          <div class="confirm-row">
            <button id="advMoneyCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="advMoneyConfirm" class="db-btn db-btn--danger">Nollställ och fortsätt</button>
          </div>
        </div>
      </div>

      <div id="deleteContainerPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner inventory-dialog-ui">
          <h3>Ta bort föremål med innehåll</h3>
          <div class="tools-sections">
            <section class="db-card tools-card">
              <p id="deleteContainerText" class="tools-intro">Du håller på att ta bort ett färdmedel som innehåller föremål. Vill du ta bort innehållet också?</p>
            </section>
          </div>
          <div class="confirm-row">
            <button id="deleteContainerCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="deleteContainerOnly" class="db-btn db-btn--danger">Ta bara bort färdmedlet</button>
            <button id="deleteContainerAll" class="db-btn db-btn--danger">Ta bort allt</button>
          </div>
        </div>
      </div>
`;

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
    window.popupUi?.normalizeTree?.(this.shadowRoot, getPopupMetaById());
    window.DAUB?.init?.(this.shadowRoot);
    window.autoResizeAll?.(this.shadowRoot);
    this.bindPopupManager();
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
    this.bindPerfHooks();
    this.shadowRoot.addEventListener('click', e => this.handleClick(e));
    this._outsideHandler = e => this.handleOutsideClick(e);
    document.addEventListener('click', this._outsideHandler);
    this.updateToolbarLinks();

    // Expose method for dynamic updates
    window.updateToolbarLinks = () => this.updateToolbarLinks();

    const nativeGetElementById = document.getElementById.bind(document);
    document.getElementById = id =>
      nativeGetElementById(id) || this.shadowRoot.getElementById(id);

    window.openDialog = (msg, opts) => this.openDialog(msg, opts);
    window.alertPopup = msg => this.openDialog(msg);
    window.confirmPopup = msg => this.openDialog(msg, { cancel: true });
    window.toast = msg => {
      if (typeof DAUB !== 'undefined' && DAUB.toast) {
        DAUB.toast({ message: String(msg), duration: 3000 });
      }
    };

    // Allow search suggestions to scroll without affecting the page
    const sugEl = this.shadowRoot.getElementById('searchSuggest');
    ['touchmove', 'wheel'].forEach(ev =>
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
    const helpOverviewCards = [
      {
        label: 'Kom igång',
        value: 'Sök efter poster, öppna detaljer och lägg till dem direkt från listan.'
      },
      {
        label: 'Paneler',
        value: 'Verktygsraden leder vidare till Egenskaper, Inventarie, Index, Rollperson och Funktioner.'
      },
      {
        label: 'Lagring',
        value: 'Allt sparas lokalt i webbläsaren. Export och import används för säkerhetskopior.'
      }
    ];
    const helpSections = [
      {
        title: 'Kom igång',
        items: [
          'Sök i fältet ovan och tryck Enter för att filtrera.',
          'Klicka på en post för detaljer. Lägg till med "Lägg till" eller "+".',
          `Använd knapparna längst ned: ${icon('egenskaper')} Egenskaper, ${icon('inventarie')} Inventarie, ${icon('index')} Index, ${icon('character')} Rollperson, ${icon('settings')} Funktioner.`
        ]
      },
      {
        title: 'Verktygsrad',
        items: [
          '▼: Minimerar eller expanderar alla kategorier i listor.',
          `${icon('index')} Index och ${icon('character')} Rollperson är separata länkar till respektive vy.`,
          `${icon('inventarie')}: Öppnar inventariesidan. ${icon('egenskaper')}: Öppnar egenskapsvyn med tabbarna Karaktärsdrag, Översikt och Effekter. ${icon('settings')}: Öppnar funktionspanelen.`,
          `${icon('anteckningar')}: Öppnar anteckningssidan i rollpersonens sidhuvud.`,
          'XP: Visar dina totala erfarenhetspoäng.',
          'Sök: Skriv och tryck Enter för att lägga till ett filter. Skriv ett ord inom citattecken för att tvinga fritextsökning. Klicka på taggarna under sökfältet för att ta bort filter.',
          'Förslag: Använd ↑/↓ för att bläddra, klicka för att lägga till.',
          'Ångra: Esc eller webbläsarens tillbaka stänger senast öppnade panel eller popup.'
        ]
      },
      {
        title: 'Kortkommandon',
        items: [
          'Enter: Lägg till skriven term.',
          'Esc: Stäng öppna paneler eller popupfönster på desktop.'
        ]
      },
      {
        title: 'Funktionsmeny',
        items: [
          'Välj rollperson: Byter aktiv rollperson.',
          'Aktiv mapp: Begränsar listan "Välj rollperson". "Alla" visar alla mappar.',
          'Typ, Arketyp, Karaktärsdrag: Filtrerar listor.',
          'Ny/Kopiera/Byt namn/Ta bort: Hanterar karaktärer.',
          'Generera rollperson: Skapar en rollperson automatiskt.',
          'PDF-bank: Öppnar samlingen med regel-PDF:er.',
          'Uppdatera appen: Söker efter ny version och uppdaterar.',
          'Mapphantering: Skapa mappar och flytta rollpersoner mellan mappar.',
          'Export/Import: Säkerhetskopiera eller hämta karaktärer som JSON.',
          `${icon('smithing')}/${icon('alkemi')}/${icon('artefakt') || '🏺'}: Välj nivå för smed, alkemist och artefaktmakare.`,
          `${icon('extend') || '🔭'} Utvidga sökning: Växla till OR-filter och matcha någon tagg.`,
          `${icon('expand') || '↕️'} Expandera vy: Visar fler detaljer i korten.`,
          `${icon('forsvar') || '🏃'} Försvar: Välj försvarskaraktärsdrag manuellt.`,
          `${icon('adjust')} Manuella justeringar: Hantera egna modifieringar.`,
          `${icon('sort')} Sortering: Välj ordning för listor.`,
          `${icon('info')} Hjälp: Visar denna panel.`
        ]
      },
      {
        title: 'Inventarie',
        items: [
          'Sök i inventarie: Filtrerar föremål i realtid.',
          '▶/▼ Öppna eller kollapsa alla.',
          '🔀 Dra-och-släpp-läge för att ändra ordning.',
          `🆕 Eget föremål. ${icon('basket', { className: 'title-icon', alt: 'Pengar' })} Pengar (Spara, addera, nollställ; ${icon('minus')}/${icon('plus')} justerar 1 daler).`,
          '💸 Multiplicera pris på markerade rader; klick på pris öppnar snabbmeny.',
          `🔒 Spara inventarie och markera alla befintliga föremål som gratis. ${icon('broom')} Töm inventariet.`,
          'x² Lägg till flera av samma. Icke-staplingsbara får egna fält.',
          'Kategori: Filtrera på föremålstyp.',
          '🛞/🐎 Lasta i: Flytta valda föremål till ett valt färdmedel.'
        ]
      },
      {
        title: 'Egenskaper',
        items: [
          `Ange total XP via ${icon('minus')}/${icon('plus')} eller genom att skriva värdet.`,
          'Summeringen visar Totalt, Använt och Oanvänt.',
          'Knappen "Förmågor: X" filtrerar till Endast valda.',
          `${icon('broom')} Återställ basegenskaper: Nollställer grundvärdena utan bonusar från förmågor eller inventarie.`
        ]
      },
      {
        title: 'Rollperson',
        items: [
          '📋 Sammanfattning av försvar, korruption, bärkapacitet, hälsa och träffsäkerhet.',
          `${icon('effects')} Effekter: Öppnar effektfliken i egenskapsvyn.`,
          `${icon('overview')} Översikt: Snabb sammanställning av värden och modifikationer.`
        ]
      },
      {
        title: 'Anteckningar',
        items: [
          '✏️ Redigera: Växla mellan läs- och redigeringsläge.',
          'Sudda: Rensa alla fält. Spara: Spara anteckningar.',
          '▶/▼ i verktygsraden: Öppna eller stäng alla anteckningsfält samtidigt.',
          `${icon('index')}/${icon('character')} i sidhuvudet: Till index respektive rollperson.`
        ]
      },
      {
        title: 'Listor och rader',
        items: [
          `Lägg till / ${icon('plus')}: Lägg till posten. ${icon('minus')}: Minska antal eller ta bort.`,
          'Info: Visa detaljer.',
          '🏋🏻‍♂️ Elityrke: Lägg till elityrket med dess krav på förmågor.',
          `${icon('addqual')} Lägg till kvalitet. ${icon('qualfree')} Markera kostsam kvalitet som gratis.`,
          `${icon('free')} Gör föremål gratis. ${(icon('active') || '💔')} Visa konflikter.`,
          '↔ Växla artefaktens kostnad mellan XP och permanent korruption.',
          '⬇️/⬆️ Lasta på eller av föremål till eller från färdmedel.',
          `${icon('remove')} Ta bort posten helt.`
        ]
      },
      {
        title: 'Tabeller',
        items: [
          '↔︎ Ingen radbrytning: Visar hela cellinnehållet på en rad och möjliggör horisontell scroll.',
          '⤢ Bred vy: Ökar popupens maxbredd för bredare tabeller.'
        ]
      },
      {
        title: 'Tips',
        items: [
          'Knappen "Börja om" i kategorin "Hoppsan" rensar alla filter, kollapsar alla kategorier och uppdaterar sidan.',
          'Snabb nollställning: Skriv "lol" i sökfältet och tryck Enter för att rensa alla filter.',
          'Rensa karaktärer: Skriv "BOMB!" i sökfältet och tryck Enter för att radera samtliga karaktärer i den här webbläsaren.',
          'Klicka på taggarna under sökfältet för att snabbt ta bort ett filter.',
          'Webbapp: Skriv "webapp" i sökfältet för instruktioner och öppna webapp-sidan.'
        ]
      },
      {
        title: 'Data & lagring',
        items: [
          'Allt sparas lokalt i din webbläsare (localStorage).',
          'Använd Export/Import under Funktioner för säkerhetskopior och flytt mellan enheter.',
          'Rensar du webbläsardata tas lokala rollpersoner bort.'
        ]
      },
      {
        title: 'Installera som webapp',
        body: `
          <p>
            Instruktioner finns på <a href="webapp.html" target="_blank">webapp-sidan</a>.
            Sidan kan nås via direktlänk eller genom att skriva "webapp" i sökfältet.
          </p>
        `
      }
    ];
    const renderHelpSection = section => {
      const listHtml = Array.isArray(section.items) && section.items.length
        ? `<ul class="summary-list">${section.items.map(item => `<li>${item}</li>`).join('')}</ul>`
        : String(section.body || '').trim();
      return `
        <section class="summary-section info-panel-section help-panel-section">
          <h3>${section.title}</h3>
          <div class="info-panel-extra">
            <div class="info-block">
              ${listHtml}
            </div>
          </div>
        </section>
      `.trim();
    };
    const helpPanelHtml = `
      <div class="help-content info-panel-content summary-content">
        <div class="info-panel-stack">
          <section class="summary-section info-panel-section info-panel-overview help-panel-overview">
            <div class="info-panel-overview-grid">
              ${helpOverviewCards.map(card => `
                <div class="info-panel-overview-block">
                  <div class="info-panel-overview-label">${card.label}</div>
                  <p>${card.value}</p>
                </div>
              `).join('')}
            </div>
          </section>
          ${helpSections.map(renderHelpSection).join('')}
        </div>
      </div>
    `.trim();
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }

        .toolbar.db-bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          z-index: 1000;
          background: var(--panel);
          border-top: 1.5px solid var(--border);
          padding: .6rem .8rem calc(.6rem + env(safe-area-inset-bottom, 0px));
          display: flex;
          flex-direction: column;
          gap: .6rem;
          --toolbar-control-height: 2.72rem;
        }
        .toolbar-top {
          display: flex;
          align-items: center;
          gap: .6rem;
        }
        .toolbar-top .search-wrap { flex: 1 1 110px; min-width: 90px; position: relative; }
        .toolbar-top .search-wrap input { width: 100%; height: var(--toolbar-control-height); }
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
        .toolbar .toolbar-nav-items {
          position: relative;
          inset: auto;
          z-index: auto;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: .15rem;
          padding: .2rem;
          border: 1px solid var(--db-color-border, rgba(245, 230, 208, .1));
          border-radius: 1rem;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .01)),
            rgba(25, 20, 17, .74);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, .05),
            0 8px 18px rgba(0, 0, 0, .16);
          padding-bottom: .2rem;
        }
        .toolbar .db-bottom-nav__item {
          min-width: 0;
          min-height: 3.35rem;
          padding: .42rem .22rem .38rem;
          border: 1px solid transparent;
          border-radius: .78rem;
          background: transparent;
          box-shadow: none;
          color: var(--txt-muted, rgba(245, 230, 208, .72));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: .2rem;
          font-size: .6rem;
          font-weight: 650;
          line-height: 1.08;
          text-decoration: none;
          text-shadow: none;
          letter-spacing: 0;
        }
        .toolbar .db-bottom-nav__item .btn-icon {
          width: 1.42rem;
          height: 1.42rem;
        }
        .toolbar .db-bottom-nav__label {
          display: block;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .toolbar .toolbar-nav-items .db-bottom-nav__item.db-bottom-nav__item--active,
        .toolbar .toolbar-nav-items .db-bottom-nav__item.active {
          border-color: rgba(221, 225, 186, .34);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .02)),
            #7a9470;
          color: #192013;
          box-shadow:
            0 2px 8px rgba(0, 0, 0, .18),
            inset 0 1px 0 rgba(255, 255, 255, .16);
        }
        .toolbar .db-bottom-nav__item:hover {
          color: #fff7ee;
          border-color: rgba(245, 230, 208, .16);
          background: rgba(255, 255, 255, .06);
          filter: none;
          transform: translateY(-1px);
        }
        .toolbar .db-bottom-nav__item:active {
          transform: translateY(1px);
        }
        .toolbar .db-bottom-nav__item.db-bottom-nav__item--active:hover,
        .toolbar .db-bottom-nav__item.active:hover {
          color: #192013;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .03)),
            #7a9470;
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
        .filter-setting-switch {
          width: 100%;
          justify-content: space-between;
          padding: .65rem .8rem;
          border-radius: .8rem;
          border: 1px solid rgba(255, 255, 255, .08);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .03), rgba(0, 0, 0, .08)),
            rgba(18, 15, 13, .68);
          color: var(--txt);
          box-shadow: none;
        }
        .filter-setting-switch:hover {
          filter: none;
          transform: translateY(-1px);
          border-color: rgba(185, 122, 82, .45);
          box-shadow: 0 10px 24px rgba(0, 0, 0, .18);
        }
        .filter-setting-switch:active {
          transform: translateY(0);
        }
        .filter-setting-switch-main {
          display: flex;
          align-items: center;
          gap: .75rem;
          min-width: 0;
          flex: 1;
        }
        .filter-setting-switch-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.2rem;
          height: 2.2rem;
          border-radius: .7rem;
          background: rgba(255, 255, 255, .05);
          border: 1px solid rgba(255, 255, 255, .08);
          flex-shrink: 0;
        }
        .filter-setting-switch-icon .btn-icon {
          width: 1.5rem;
          height: 1.5rem;
        }
        .filter-setting-switch .toggle-desc {
          margin-right: 0;
          min-width: 0;
        }
        .filter-setting-switch .toggle-question {
          color: var(--txt);
        }
        .filter-setting-switch .toggle-note {
          color: var(--txt-muted, var(--txt));
          font-size: .84rem;
          line-height: 1.35;
          margin-top: .14rem;
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
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: .42rem;
          height: var(--toolbar-control-height);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .08), rgba(255, 255, 255, .01)),
            rgba(49, 43, 39, .72);
          color: #fff;
          padding: 0 .95rem;
          border: 1.5px solid rgba(194, 163, 106, .24);
          border-radius: .6rem;
          box-shadow:
            0 4px 10px rgba(0, 0, 0, .22),
            inset 0 1px 0 rgba(255, 255, 255, .08);
          font-weight: 700;
          font-size: .95rem;
          letter-spacing: .02em;
          text-shadow:
            0 0 1px rgba(0, 0, 0, .9),
            0 1px 0 rgba(0, 0, 0, .45);
          font-family: inherit;
          white-space: nowrap;
          cursor: pointer;
          transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
        }
        .toolbar .exp-counter:hover {
          border-color: rgba(194, 163, 106, .4);
          box-shadow:
            0 6px 13px rgba(0, 0, 0, .26),
            inset 0 1px 0 rgba(255, 255, 255, .1);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .11), rgba(255, 255, 255, .02)),
            rgba(56, 49, 44, .8);
        }
        .toolbar .exp-counter:focus-visible {
          outline: 2px solid rgba(194, 163, 106, .6);
          outline-offset: 2px;
        }
        .toolbar .exp-counter:active {
          transform: translateY(1px) scale(.992);
        }
        .toolbar .exp-counter span {
          min-width: 1.8ch;
          color: rgba(255, 255, 255, .95);
          text-align: center;
          text-shadow:
            0 0 1px rgba(0, 0, 0, .9),
            0 1px 0 rgba(0, 0, 0, .45);
          font-variant-numeric: tabular-nums;
        }
        #entrySortPopup .popup-inner {
          align-items: stretch;
          text-align: left;
        }
        .sort-option-list,
        .popup-radio-list {
          display: flex;
          flex-direction: column;
          gap: .5rem;
          margin-bottom: .2rem;
        }
        .popup-radio-option {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: .75rem;
          padding: .72rem .82rem;
          width: 100%;
          background: var(--db-color-bg-alt, rgba(26, 19, 16, 0.96));
          color: var(--db-color-text, var(--txt));
          border-radius: var(--db-radius-2, .8rem);
          border: 1px solid var(--db-color-border, rgba(255, 243, 228, 0.08));
          cursor: pointer;
          text-align: left;
          transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
        }
        .popup-radio-option .db-radio__circle {
          flex-shrink: 0;
          margin-top: .05rem;
        }
        .popup-radio-copy {
          display: flex;
          flex-direction: column;
          gap: .2rem;
          align-items: flex-start;
          min-width: 0;
          flex: 1;
        }
        .popup-radio-title {
          display: flex;
          align-items: center;
          gap: .65rem;
          font-weight: 700;
        }
        .sort-option-title .btn-icon {
          width: 1.45rem;
          height: 1.45rem;
          flex-shrink: 0;
        }
        .popup-radio-hint {
          color: var(--txt-muted, var(--txt));
          font-size: .92rem;
        }
        .popup-radio-option:hover {
          border-color: rgba(var(--db-color-accent-rgb, 185, 122, 82), 0.52);
          box-shadow: inset 0 0 0 1px rgba(var(--db-color-accent-rgb, 185, 122, 82), 0.16);
        }
        .popup-radio-option:focus-within {
          border-color: rgba(var(--db-color-accent-rgb, 185, 122, 82), 0.52);
          box-shadow: inset 0 0 0 1px rgba(var(--db-color-accent-rgb, 185, 122, 82), 0.16);
          outline: none;
        }
        .popup-radio-option.is-selected {
          background: var(--db-color-bg-alt, rgba(26, 19, 16, 0.96));
          border-color: var(--db-color-accent, var(--accent));
          box-shadow: inset 0 0 0 1px rgba(var(--db-color-accent-rgb, 185, 122, 82), 0.24);
        }
        .popup-radio-option.is-selected .popup-radio-hint {
          color: var(--txt-muted, var(--txt));
        }
        .popup-radio-option.is-selected .popup-radio-title {
          color: inherit;
        }
        .sort-meta {
          color: var(--txt-muted, var(--txt));
          font-size: .9rem;
          margin: .15rem 0 .35rem;
        }
        .char-btn,
        .db-btn,
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
        .char-btn.danger,
        .db-btn--danger,
        button.db-btn--danger,
        .db-card button.db-btn--danger:not(.entry-collapse-btn),
        .toolbar button.db-btn--danger {
          background: #a83830;
          color: #fff;
        }
        .db-btn--secondary { background: var(--border); color: var(--txt); }
        .char-btn.icon,
        .db-btn--icon { font-size: 1.1rem; }
        .char-btn:hover,
        .db-btn:hover { opacity: .85; }
        .char-btn:active,
        .db-btn:active { transform: scale(.95); opacity: .7; }
        /* Ensure help card and search filter cards can never be collapsed */
        .help-card.compact .card-desc { display: block !important; }
        #searchFiltersCard.compact .card-desc { display: block !important; }
        #invSpendCard.compact .card-desc { display: block !important; }
        /* Inline ikoner i hjälplistan så de inte bryter rader */
        .help-content .btn-icon {
          display: inline-block;
          vertical-align: text-bottom;
          width: 1.15em;
          height: 1.15em;
          margin: 0 .25em 0 0;
        }
      </style>
      <link rel="stylesheet" href="css/style.css">

      <!-- ---------- Verktygsrad ---------- -->
      <nav class="toolbar db-bottom-nav db-bottom-nav--always" aria-label="Primär navigering">
        <div class="toolbar-top">
          <button id="catToggle" class="db-btn db-btn--icon chevron-toggle" title="Minimera alla kategorier"><span class="chevron-icon"></span></button>
          <div class="search-wrap db-search" role="search">
            <input id="searchField" class="db-input" type="search" placeholder="T.ex 'Pajkastare'" aria-label="Sök" autocomplete="off">
            <div id="searchSuggest" class="suggestions" hidden></div>
          </div>
          <button type="button" class="exp-counter" id="xpToggle">ERF: <span id="xpOut">0</span></button>
        </div>
        <div class="button-row toolbar-nav-items" role="list" aria-label="Vyer och filter">
          <a id="traitsLink" class="db-bottom-nav__item nav-link" title="Egenskaper" href="#/traits">
            ${icon('egenskaper')}
            <span class="db-bottom-nav__label">Egenskaper</span>
          </a>
          <a id="inventoryLink" class="db-bottom-nav__item nav-link" title="Inventarievy" href="#/inventory">
            ${icon('inventarie')}
            <span class="db-bottom-nav__label">Inventarie</span>
          </a>
          <a id="indexLink" class="db-bottom-nav__item nav-link" title="Index" href="#/index">
            ${icon('index')}
            <span class="db-bottom-nav__label">Index</span>
          </a>
          <a id="characterLink" class="db-bottom-nav__item nav-link" title="Rollperson" href="#/character">
            ${icon('character')}
            <span class="db-bottom-nav__label">Rollperson</span>
          </a>
          <button id="filterToggle" class="db-bottom-nav__item" type="button" title="Funktioner">
            ${icon('settings')}
            <span class="db-bottom-nav__label">Funktioner</span>
          </button>
        </div>
      </nav>

      <!-- ---------- Filter ---------- -->
      <aside id="filterPanel" class="db-drawer offcanvas" data-touch-profile="panel-right">
        <header class="inv-header">
          <h2>Funktioner</h2>
          <div class="inv-actions">
            <button id="collapseAllFilters" class="db-btn db-btn--icon chevron-toggle" title="Öppna alla"><span class="chevron-icon collapsed"></span></button>
            <button class="db-btn db-btn--icon" data-close="filterPanel">✕</button>
          </div>
        </header>
        <div class="filter-panel-content info-panel-content summary-content">
          <div class="filter-panel-stack">
        <ul class="card-list filter-card-list">
          <li class="db-card" data-special="__formal__" id="filterFormalCard">
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
                <button id="newCharBtn" class="db-btn">Ny rollperson</button>
              </div>
              <div class="char-btn-row">
                <button id="characterToolsBtn" class="db-btn">Rollpersonshantering</button>
              </div>
              <div class="char-btn-row">
                <button id="driveStorageBtn" class="db-btn">Lagring</button>
              </div>
              <div class="char-btn-row">
                <button id="pdfLibraryBtn" class="db-btn">PDF-bank</button>
              </div>
              <div class="char-btn-row">
                <button id="checkForUpdates" class="db-btn">Uppdatera appen</button>
              </div>
              <div class="char-btn-row">
                <button id="deleteChar" class="db-btn db-btn--danger">Radera rollperson</button>
              </div>
            </div>
          </li>
          <li class="db-card" data-special="__formal__" id="filterSettingsCard">
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
                  ${renderFilterSwitchRow({
                    id: 'filterUnion',
                    label: 'Utvidgad sökning',
                    note: 'Matcha någon tagg (OR) i stället för alla.',
                    title: 'Matcha någon tag (OR)',
                    iconName: 'extend',
                    fallback: '<span class="emoji-fallback">🔭</span>'
                  })}
                  ${renderFilterSwitchRow({
                    id: 'entryViewToggle',
                    label: 'Expandera vy',
                    note: 'Visa poster i expanderad standardvy.',
                    title: 'Expandera vy',
                    iconName: 'expand',
                    fallback: '<span class="emoji-fallback">↕️</span>'
                  })}
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Utrustning & strid?</span>
                    </span>
                    <button id="forceDefense" class="party-toggle icon-only" title="Öppna utrustning, försvar och anfall">${icon('forsvar') || '<span class="emoji-fallback">🏃</span>'}</button>
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
        <!-- Snabbspendera-kort (visible only on inventory view, replaces Sökfilter) -->
        <div class="db-card filter-panel-static-card" id="invSpendCard" hidden>
          <div class="card-title">Snabbspendera</div>
          <div class="card-desc">
            <div id="invSpendInner"></div>
          </div>
        </div>
        <!-- Sökfilter-kort som samlar relaterade dropdowns (hidden on inventory view) -->
        <div class="db-card filter-panel-static-card" id="searchFiltersCard">
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
              <label for="testFilter">Karaktärsdrag</label>
              <select id="testFilter"></select>
            </div>
          </div>
        </div>
        <!-- Hjälp-ruta för att tydliggöra koppling till knappen -->
        <div class="db-card help-card filter-panel-static-card">
          <div class="card-title">Hjälp</div>
          <div class="card-desc">
            <div class="filter-group party-toggles">
              <ul class="toggle-list">
                <li>
                  <span class="toggle-desc">
                    <span class="toggle-question">Behöver du hjälp?</span>
                  </span>
                  <button id="infoToggle" class="party-toggle icon-only" type="button" title="Visa hjälp">${icon('info')}</button>
                </li>
              </ul>
            </div>
          </div>
        </div>
          </div>
        </div>
      </aside>

      <!-- ---------- Popup Kvalitet ---------- -->
      <div id="qualPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner qual-popup-ui">
          <header class="qual-popup-header">
            <div class="qual-popup-copy">
              <div class="qual-popup-kicker">Inventarieverktyg</div>
              <h3 id="qualTitle">Välj kvalitet</h3>
              <p id="qualSubtitle" class="qual-popup-subtitle">Välj ett alternativ i listan nedan.</p>
              <div id="qualLegend" class="qual-popup-legend" aria-label="Färgkodning">
                <span class="qual-legend-item positive">Positiv</span>
                <span class="qual-legend-item neutral">Neutral</span>
                <span class="qual-legend-item negative">Negativ</span>
                <span class="qual-legend-item mystic">Mystisk</span>
              </div>
            </div>
            <button id="qualClose" class="db-btn db-btn--icon qual-popup-close" type="button" title="Stäng">✕</button>
          </header>
          <label for="qualSearch" class="qual-popup-search-label">Sök</label>
          <input id="qualSearch" class="qual-popup-search-input" type="search" placeholder="Sök..." autocomplete="off" spellcheck="false">
          <div class="qual-popup-meta">
            <span id="qualCount" class="qual-popup-count"></span>
          </div>
          <div id="qualOptions" class="qual-popup-options"></div>
          <p id="qualEmpty" class="qual-popup-empty" hidden>Inga alternativ matchar sökningen.</p>
          <div class="confirm-row qual-popup-actions">
            <button id="qualApply" class="db-btn" type="button" hidden disabled>Lägg till valda</button>
          </div>
        </div>
      </div>

      <!-- ---------- Inventory popup surfaces removed pending rebuild ---------- -->
      ${renderInventoryPopupSurfaces()}

      <!-- ---------- Popup Manuella justeringar ---------- -->
      <div id="manualAdjustPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Manuella justeringar</h3>
          <p class="manual-adjust-hint">Använd knapparna för att lägga till eller ta bort manuella ändringar. Erf påverkar endast spenderad erfarenhet.</p>
          <div class="manual-adjust-groups" id="manualAdjustGroups">
            <div class="manual-adjust-card db-card">
              <div class="manual-adjust-label">
                <span>Korruption</span>
                <span id="manualCorruptionDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="db-btn" type="button" data-type="corruption" data-direction="decrease">-1</button>
                <button class="db-btn" type="button" data-type="corruption" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card db-card">
              <div class="manual-adjust-label">
                <span>Spenderad erf</span>
                <span id="manualXpDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="db-btn" type="button" data-type="xp" data-direction="decrease">-1</button>
                <button class="db-btn" type="button" data-type="xp" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card db-card">
              <div class="manual-adjust-label">
                <span>Tålighet</span>
                <span id="manualToughnessDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="db-btn" type="button" data-type="toughness" data-direction="decrease">-1</button>
                <button class="db-btn" type="button" data-type="toughness" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card db-card">
              <div class="manual-adjust-label">
                <span>Smärtgräns</span>
                <span id="manualPainDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="db-btn" type="button" data-type="pain" data-direction="decrease">-1</button>
                <button class="db-btn" type="button" data-type="pain" data-direction="increase">+1</button>
              </div>
            </div>
            <div class="manual-adjust-card db-card">
              <div class="manual-adjust-label">
                <span>Bärkapacitet</span>
                <span id="manualCapacityDisplay" class="manual-adjust-current">0</span>
              </div>
              <div class="manual-adjust-buttons">
                <button class="db-btn" type="button" data-type="capacity" data-direction="decrease">-1</button>
                <button class="db-btn" type="button" data-type="capacity" data-direction="increase">+1</button>
              </div>
            </div>
          </div>
          <div class="manual-adjust-footer">
            <button id="manualAdjustReset" class="db-btn db-btn--danger" type="button">Återställ</button>
            <button id="manualAdjustClose" class="db-btn" type="button">Stäng</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Utrustning, försvar och anfall ---------- -->
      <div id="defenseCalcPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner defense-calc-ui">
          <header class="defense-calc-header">
            <div class="defense-calc-header-copy">
              <div class="defense-calc-kicker">Utrustningshanterare</div>
              <h3>Utrustning, försvar och anfall</h3>
              <p class="defense-calc-intro">Välj aktiv utrustning och vilka karaktärsdrag som ska användas när Försvar och Träffsäkerhet beräknas.</p>
            </div>
            <button id="defenseCalcCloseX" class="db-btn defense-calc-close" type="button" title="Stäng">✕</button>
          </header>
          <div class="defense-calc-hero">
            <div class="defense-calc-status-block">
              <span class="defense-calc-status-label">Läge</span>
              <span id="defenseCalcStatus" class="defense-calc-status-value">Automatiskt läge</span>
            </div>
            <div class="defense-calc-meta">
              <span id="defenseCalcBasisSummary" class="defense-calc-pill">Försvar: Automatiskt</span>
              <span id="defenseCalcWeaponSummary" class="defense-calc-pill">Inga vapen valda</span>
              <span id="defenseCalcAccuracySummary" class="defense-calc-pill">Träffsäkerhet</span>
              <span id="defenseCalcDancingSummary" class="defense-calc-pill" hidden></span>
            </div>
          </div>
          <div class="defense-calc-sections">
            <section class="db-card defense-calc-card">
              <div class="defense-calc-card-head">
                <div class="defense-calc-card-title-group">
                  <div class="defense-calc-step">1. Grund</div>
                  <div class="defense-calc-heading">Karaktärsdrag och rustning</div>
                </div>
                <p class="defense-calc-card-note">Välj karaktärsdrag för försvar och anfall samt vilken rustning som ska vara aktiv.</p>
              </div>
              <div class="defense-calc-field-grid">
                <div class="defense-calc-field">
                  <label for="defenseCalcTrait">Försvar</label>
                  <select id="defenseCalcTrait"></select>
                </div>
                <div class="defense-calc-field">
                  <label for="defenseCalcAttackTrait">Träffsäkerhet</label>
                  <select id="defenseCalcAttackTrait"></select>
                </div>
                <div class="defense-calc-field">
                  <label for="defenseCalcArmor">Rustning</label>
                  <select id="defenseCalcArmor"></select>
                </div>
              </div>
            </section>
            <section class="db-card defense-calc-card defense-calc-group">
              <div class="defense-calc-card-head">
                <div class="defense-calc-card-title-group">
                  <div class="defense-calc-step">2. Utrustning</div>
                  <div class="defense-calc-heading">Vapen & sköldar</div>
                </div>
                <p class="defense-calc-card-note">Markera det som ska räknas. Tvåhandsvapen kan inte kombineras med armfäst sköld.</p>
              </div>
              <p id="defenseCalcEmpty" class="defense-calc-empty" hidden></p>
              <div id="defenseCalcWeaponList" class="defense-item-list"></div>
            </section>
            <section class="db-card defense-calc-card defense-calc-group">
              <div class="defense-calc-card-head">
                <div class="defense-calc-card-title-group">
                  <div class="defense-calc-step">3. Utrustning</div>
                  <div class="defense-calc-heading">Övriga utrustade föremål</div>
                </div>
                <p class="defense-calc-card-note">Välj plats för utrustning som ska räknas som aktiv och kunna påverka Försvar och Träffsäkerhet.</p>
              </div>
              <p id="defenseCalcExtraEmpty" class="defense-calc-empty" hidden></p>
              <div id="defenseCalcExtraItems" class="defense-item-list defense-item-list-equipment"></div>
            </section>
            <section id="defenseCalcDancingCard" class="db-card defense-calc-card defense-calc-card-dancing">
              <div class="defense-calc-card-head">
                <div class="defense-calc-card-title-group">
                  <div class="defense-calc-step">4. Specialfall</div>
                  <div class="defense-calc-heading">Alternativt försvar</div>
                </div>
                <p class="defense-calc-card-note">Visas när rollpersonen har separat försvarsform. Välj vapen om tillämpligt.</p>
              </div>
              <div id="defenseCalcSeparateSelectors"></div>
            </section>
          </div>
          <div class="confirm-row defense-calc-actions">
            <button id="defenseCalcReset" class="db-btn db-btn--danger" type="button">Återställ</button>
            <button id="defenseCalcApply" class="db-btn" type="button">Verkställ</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Alkemistniv\u00e5 ---------- -->
      <div id="alcPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Alkemistniv\u00e5</h3>
          <p class="popup-desc">Välj exakt en nivå för partiets alkemist.</p>
          <div id="alcOptions">${renderLevelRadioOptions('party-alchemist-level')}</div>
          <button id="alcCancel" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Smedsniv\u00e5 ---------- -->
      <div id="smithPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Smedsniv\u00e5</h3>
          <p class="popup-desc">Välj exakt en nivå för partiets smed.</p>
          <div id="smithOptions">${renderLevelRadioOptions('party-smith-level')}</div>
          <button id="smithCancel" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Artefaktmakarniv\u00e5 ---------- -->
      <div id="artPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Artefaktmakarniv\u00e5</h3>
          <p class="popup-desc">Välj exakt en nivå för partiets artefaktmakare.</p>
          <div id="artOptions">${renderLevelRadioOptions('party-artificer-level')}</div>
        <button id="artCancel" class="db-btn db-btn--danger">Avbryt</button>
      </div>
      </div>

      <!-- ---------- Popup Sortering ---------- -->
      <div id="entrySortPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Sortera poster</h3>
          <p class="popup-desc">Välj hur posterna i varje kategori ska ordnas.</p>
          <div id="entrySortOptions">${renderSortRadioOptions()}</div>
          <p class="sort-meta">Standard: Alfabetisk (A → Ö)</p>
          <button id="entrySortSave" class="db-btn">Spara</button>
          <button id="entrySortCancel" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup PDF-bank ---------- -->
      <div id="pdfPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>PDF-bank</h3>
          <div id="pdfOptions"></div>
          <button id="pdfCancel" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Drivelagring ---------- -->
      <div id="driveStoragePopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner drive-storage-ui">
          <h3>Lagring</h3>
          <div id="driveStorageOptions"></div>
          <button id="driveStorageCancel" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Rollpersonshantering ---------- -->
      <div id="characterToolsPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner character-tools-ui">
          <h3>Rollpersonshantering</h3>
          <div id="characterToolsOptions" class="tools-popup-content"></div>
          <button id="characterToolsCancel" class="db-btn db-btn--danger">Avbryt</button>
        </div>
      </div>

      

      <!-- ---------- Nilas Popup ---------- -->
      <div id="nilasPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Nilas \u00e4r b\u00e4st. H\u00e5ller du med?</h3>
          <div class="button-row">
            <button id="nilasNo" class="db-btn">Nej!</button>
            <button id="nilasYes" class="db-btn">Ja!</button>
          </div>
        </div>
      </div>
      <!-- ---------- Popup Mapphanterare ---------- -->
      <div id="folderManagerPopup" class="db-modal-overlay popup popup-bottom" aria-hidden="true">
        <div class="db-modal popup-inner folder-ui">
          <header class="popup-header">
            <h3>Mappar</h3>
            <button id="folderManagerCloseX" class="db-btn db-btn--icon" title="Stäng">✕</button>
          </header>

          <!-- Skapa ny mapp -->
          <section class="folder-section">
            <h4>Mappar</h4>
            <div class="inline-row">
              <label for="newFolderName">+ Ny mapp:</label>
              <div class="inline-controls">
                <input id="newFolderName" placeholder="Mappnamn">
                <button id="addFolderBtn" class="db-btn db-btn--icon db-btn--icon-only" aria-label="Lägg till mapp" title="Lägg till mapp">${icon('plus')}</button>
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
                <button id="folderMoveApply" class="db-btn">Flytta</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- ---------- Popup Byt namn på mapp ---------- -->
      <div id="renameFolderPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Byt namn på mapp</h3>
          <div class="filter-group">
            <label for="renameFolderName">Nytt namn:</label>
            <input id="renameFolderName" type="text" placeholder="Ny mapp" autocomplete="off">
          </div>
          <div class="confirm-row">
            <button id="renameFolderCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="renameFolderApply" class="db-btn">Spara</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Ny rollperson (med mappval) ---------- -->
      <div id="newCharPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
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
            <button id="newCharCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="newCharCreate" class="db-btn">Skapa</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Generera rollperson ---------- -->
      <div id="generatorPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner generator-popup">
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
            <button id="genCharCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="genCharCreate" class="db-btn">Generera</button>
          </div>
          <p id="genCharDataWarning" class="field-hint" hidden>Databasen laddas – vänta tills den är klar innan du genererar.</p>
        </div>
      </div>

      <!-- ---------- Popup Kopiera rollperson (med mappval) ---------- -->
      <div id="dupCharPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
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
            <button id="dupCharCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="dupCharCreate" class="db-btn">Kopiera</button>
          </div>
        </div>
      </div>

      <!-- ---------- Popup Byt namn (med mappval) ---------- -->
      <div id="renameCharPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
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
            <button id="renameCharCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="renameCharApply" class="db-btn">Spara</button>
          </div>
        </div>
      </div>

      <!-- ---------- Dialog Popup ---------- -->
      <div id="dialogPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
          <p id="dialogMessage"></p>
          <div class="confirm-row">
            <button id="dialogCancel" class="db-btn db-btn--danger">Avbryt</button>
            <button id="dialogOk" class="db-btn">OK</button>
            <button id="dialogExtra" class="db-btn">Extra</button>
          </div>
        </div>
      </div>

      <!-- ---------- Hemlig Daniel-popup ---------- -->
      <div id="danielPopup" class="db-modal-overlay popup" aria-hidden="true">
        <div class="db-modal popup-inner">
          <h3>Vilken kille!</h3>
          <div class="confirm-row">
            <button id="danielPopupClose" class="db-btn">Visst?!</button>
          </div>
        </div>
      </div>

      <!-- ---------- Hj\u00e4lp ---------- -->
      <aside id="infoPanel" class="db-drawer offcanvas" data-touch-profile="panel-right">
        <header class="inv-header">
          <h2>Hjälp</h2>
          <button class="db-btn db-btn--icon" data-close="infoPanel">✕</button>
        </header>
        ${helpPanelHtml}
      </aside>

      <!-- ---------- Översikt (XP slide-in) ---------- -->
      <aside id="summarySlidePanel" class="db-drawer offcanvas" data-touch-profile="panel-right">
        <header class="inv-header">
          <h2>Översikt</h2>
          <div class="inv-actions">
            <button class="db-btn db-btn--icon" data-close="summarySlidePanel">✕</button>
          </div>
        </header>
        <div class="summary-slide-content summary-content">
          <div id="summarySlideInner"></div>
        </div>
      </aside>

      <!-- ---------- Inventarie Dashboard (KPI sidebar) ---------- -->
      <aside id="invDashPanel" class="db-drawer offcanvas inv-dash-drawer" data-touch-profile="panel-right">
        <header class="inv-header">
          <h2>Inventarium</h2>
          <div class="inv-actions">
            <button class="db-btn db-btn--icon" data-close="invDashPanel" aria-label="Stäng inventarium">${icon('cross', { alt: '', width: 24, height: 24 }) || '✕'}</button>
          </div>
        </header>
        <div class="inv-dash-panel-content">
          <div id="invDashInner"></div>
        </div>
      </aside>


    `;
  }

  /* ------------------------------------------------------- */
  cache() {
    const $ = id => this.shadowRoot.getElementById(id);
    this.panels = {
      filterPanel: $('filterPanel'),
      infoPanel: $('infoPanel'),
      summarySlidePanel: $('summarySlidePanel'),
      invDashPanel: $('invDashPanel')
    };
    this.entryViewToggle = $('entryViewToggle');
    this.filterCollapseBtn = $('collapseAllFilters');
  }

  bindPopupManager() {
    const manager = window.popupManager;
    if (!manager) return;
    manager.observeRoot?.(this.shadowRoot);
    const registrations = Object.entries(getPopupMetaById()).map(([id, meta]) => ({ id, ...meta }));
    manager.registerMany?.(registrations);
  }

  collapseNonPersistentCards() {
    const ids = Array.from(NON_PERSISTENT_FILTER_CARDS);
    ids.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      el.classList.add('compact');
      window.entryCardFactory?.syncCollapse?.(el);
    });
    removeToolbarUiPref(FILTER_TOOLS_KEY);
    removeToolbarUiPref(FILTER_SETTINGS_KEY);
  }

  restoreFilterCollapse() {
    this.collapseNonPersistentCards();
  }

  updateFilterCollapseBtn() {
    if (!this.filterCollapseBtn) return;
    const cards = [...this.shadowRoot.querySelectorAll('#filterPanel .db-card:not(#searchFiltersCard):not(#invSpendCard):not(.help-card)')];
    const allCollapsed = cards.every(c => c.classList.contains('compact'));
    { const ci = this.filterCollapseBtn.querySelector('.chevron-icon'); if (ci) ci.classList.toggle('collapsed', allCollapsed); }
    this.filterCollapseBtn.title = allCollapsed ? 'Öppna alla' : 'Kollapsa alla';
  }

  async ensureSummaryEffectsReady() {
    if (window.summaryEffects?.renderSummaryHtml) {
      return window.summaryEffects;
    }
    if (!this._summaryEffectsPromise) {
      this._summaryEffectsPromise = (async () => {
        if (typeof window.ensureRouteScripts === 'function') {
          await window.ensureRouteScripts('traits');
        } else if (typeof window.ensureScript === 'function') {
          await window.ensureScript('js/summary-effects.js');
        }
        return window.summaryEffects || null;
      })();
    }
    try {
      return await this._summaryEffectsPromise;
    } finally {
      if (!window.summaryEffects?.renderSummaryHtml) {
        this._summaryEffectsPromise = null;
      }
    }
  }

  async openSummarySlide() {
    const panel = this.panels.summarySlidePanel;
    const inner = this.shadowRoot.getElementById('summarySlideInner');
    const toggleBtn = this.shadowRoot.getElementById('xpToggle');
    if (!panel) return;

    if (panel.classList.contains('open')) {
      this.close('summarySlidePanel');
      return;
    }

    if (inner) {
      inner.innerHTML = '<section class="summary-section"><ul class="summary-list summary-text"><li>Beräknar…</li></ul></section>';
    }
    this.toggle('summarySlidePanel');

    const previousDisabled = Boolean(toggleBtn?.disabled);
    if (toggleBtn) toggleBtn.disabled = true;
    try {
      await this.ensureSummaryEffectsReady();
      if (inner) {
        inner.innerHTML = window.summaryEffects?.renderSummaryHtml?.()
          || '<section class="summary-section"><ul class="summary-list summary-text"><li>Kunde inte visa översikten.</li></ul></section>';
      }
    } catch (error) {
      console.error('Failed to load summary slide', error);
      if (inner) {
        inner.innerHTML = '<section class="summary-section"><ul class="summary-list summary-text"><li>Kunde inte ladda översikten.</li></ul></section>';
      }
      window.toast?.('Kunde inte öppna översikten.');
    } finally {
      if (toggleBtn) toggleBtn.disabled = previousDisabled;
    }
  }

  /* ------------------------------------------------------- */
  handleClick(e) {
    const btn = e.target.closest('button, a');
    if (!btn) {
      // Support toggling special cards in Filter via title click
      const title = e.target.closest('#filterPanel .card-title');
      if (title) {
        const card = title.closest('.db-card');
        const key = FILTER_CARD_KEY_MAP[card?.id];
        if (card) {
          const isCompact = card.classList.toggle('compact');
          if (key && !NON_PERSISTENT_FILTER_CARDS.has(card.id)) {
            setToolbarUiPref(key, isCompact ? '0' : '1');
          }
          this.updateFilterCollapseBtn();
          window.entryCardFactory?.syncCollapse?.(card);
        }
      }
      return;
    }

    if (btn.classList.contains('summary-chip-btn')) {
      e.preventDefault();
      window.summaryEffects?.handleSummaryChipClick?.(btn);
      return;
    }

    if (btn.dataset.action === 'open-defense-calc') {
      e.preventDefault();
      if (typeof window.openDefenseCalcPopup === 'function') {
        window.openDefenseCalcPopup();
      }
      return;
    }

    /* öppna/stäng (toggle) */
    if (btn.id === 'filterToggle') return this.toggle('filterPanel');
    if (btn.id === 'infoToggle') return this.toggle('infoPanel');
    if (btn.id === 'invDashToggle') return this.toggle('invDashPanel');
    if (btn.id === 'xpToggle') {
      void this.openSummarySlide();
      return;
    }
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
        let shouldReloadNow = false;
        const queuePostUpdateSync = () => {
          try {
            sessionStorage.setItem('pwa-post-update-sync', '1');
          } catch { }
        };
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
              queuePostUpdateSync();
              if (!navigator.serviceWorker?.controller) {
                shouldReloadNow = true;
              }
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
                queuePostUpdateSync();
                if (result?.status !== 'applied') {
                  shouldReloadNow = true;
                }
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

          // Always reload after "Uppdatera appen" to guarantee fresh content
          window.toast?.('Laddar om…');
          setTimeout(() => {
            try { window.location.reload(); } catch { }
          }, 120);
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
      const cards = [...this.shadowRoot.querySelectorAll('#filterPanel .db-card:not(#searchFiltersCard):not(#invSpendCard):not(.help-card)')];
      const anyOpen = cards.some(c => !c.classList.contains('compact'));
      cards.forEach(c => {
        c.classList.toggle('compact', anyOpen);
        const key = FILTER_CARD_KEY_MAP[c.id];
        if (key && !NON_PERSISTENT_FILTER_CARDS.has(c.id)) {
          setToolbarUiPref(key, c.classList.contains('compact') ? '0' : '1');
        }
        window.entryCardFactory?.syncCollapse?.(c);
      });
      // Ensure non-collapsible cards remain open
      const alwaysOpen = this.shadowRoot.querySelectorAll('#searchFiltersCard, #invSpendCard, .help-card');
      alwaysOpen.forEach(c => {
        c.classList.remove('compact');
        window.entryCardFactory?.syncCollapse?.(c);
      });
      this.updateFilterCollapseBtn();
      return;
    }

    // Collapse/expand specialkorten i filterpanelen
    if (btn.classList.contains('collapse-btn')) {
      const card = btn.closest('#filterPanel .db-card');
      const key = FILTER_CARD_KEY_MAP[card?.id];
      if (card) {
        const isCompact = card.classList.toggle('compact');
        if (key && !NON_PERSISTENT_FILTER_CARDS.has(card.id)) {
          setToolbarUiPref(key, isCompact ? '0' : '1');
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

    const toggleButtons = ['filterToggle', 'infoToggle', 'xpToggle']
      .map(id => this.shadowRoot.getElementById(id))
      .filter(Boolean);
    const isToggleClick = toggleButtons.some(btn => containsInPath(btn));
    if (isToggleClick) return;

    // Hide search suggestions when clicking outside search UI
    const sugEl = this.shadowRoot.getElementById('searchSuggest');
    const sIn = this.shadowRoot.getElementById('searchField');
    if (sugEl && !sugEl.hidden) {
      const insideSearch = containsInPath(sugEl) || containsInPath(sIn);
      if (!insideSearch) {
        sugEl.hidden = true;
      }
    }

    // Ignore clicks inside any overlay so panels stay open.
    const hasOverlayInPath = path.some(el =>
      el instanceof Element &&
      (el.classList?.contains('popup') || el.classList?.contains('offcanvas'))
    );
    if (hasOverlayInPath) return;

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
  open(id) {
    Object.values(this.panels).forEach(p => p.classList.remove('open'));
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

  bindPerfHooks() {
    const perf = window.symbaroumPerf;
    if (!perf) return;
    const targets = [
      { id: 'traitsLink', targetRole: 'traits', targetPath: '#/traits' },
      { id: 'inventoryLink', targetRole: 'inventory', targetPath: '#/inventory' },
      { id: 'indexLink', targetRole: 'index', targetPath: '#/index' },
      { id: 'characterLink', targetRole: 'character', targetPath: '#/character' }
    ];
    const isPrimaryNavigation = event => (
      event.button === 0
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey
    );

    targets.forEach(target => {
      const link = this.shadowRoot.getElementById(target.id);
      if (!link || link.dataset.perfBound === '1') return;
      link.dataset.perfBound = '1';
      link.addEventListener('click', event => {
        if (!isPrimaryNavigation(event)) return;
        if (link.getAttribute('aria-current') === 'page') return;
        perf.queueNavigationScenario('route-change', {
          source: 'toolbar',
          linkId: target.id,
          targetRole: target.targetRole,
          targetPath: target.targetPath
        });
        if (target.id === 'inventoryLink') {
          perf.queueNavigationScenario('open-inventory', {
            source: 'toolbar',
            linkId: target.id,
            targetRole: 'inventory',
            targetPath: '#/inventory'
          });
        }
      });
    });
  }

  openDialog(message, opts = {}) {
    const {
      cancel = false,
      okText = 'OK',
      cancelText = 'Avbryt',
      extraText
    } = opts;

    // Use DAUB-styled modal when available (body-appended, unified via popup manager)
    if (typeof DAUB !== 'undefined') {
      return this._openDaubDialog(message, { cancel, okText, cancelText, extraText });
    }

    // Fallback to legacy popup-manager approach
    return this._openLegacyDialog(message, { cancel, okText, cancelText, extraText });
  }

  _openDaubDialog(message, { cancel, okText, cancelText, extraText }) {
    const MODAL_ID = 'daub-dialog-modal';
    return new Promise(resolve => {
      let settled = false;

      // Build footer buttons
      let footerHtml = '';
      if (extraText) {
        footerHtml += `<button class="db-btn db-btn--secondary" data-dialog-action="extra">${extraText}</button>`;
      }
      footerHtml += `<button class="db-btn db-btn--primary" data-dialog-action="ok">${okText}</button>`;

      // Ensure modal element exists
      let overlay = document.getElementById(MODAL_ID);
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'db-modal-overlay popup';
        overlay.id = MODAL_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `<div class="db-modal">
          <div class="db-modal__header">
            <h2 class="db-modal__title">Symbapedia</h2>
            <button class="db-modal__close" aria-label="Stäng">&times;</button>
          </div>
          <div class="db-modal__body"></div>
          <div class="db-modal__footer"></div>
        </div>`;
        document.body.appendChild(overlay);
        const popupMeta = {
          type: 'dialog',
          size: 'sm',
          layoutFamily: 'modal',
          mobileMode: 'sheet',
          touchProfile: 'sheet-down'
        };
        window.popupUi?.normalizeModal?.(overlay, popupMeta);
        window.popupManager?.register?.(overlay, popupMeta);
      }

      const modalEl = overlay.querySelector('.db-modal');
      const bodyEl = overlay.querySelector('.db-modal__body') || (() => {
        const el = document.createElement('div');
        el.className = 'db-modal__body popup-modal-body';
        modalEl?.appendChild(el);
        return el;
      })();
      const footerEl = overlay.querySelector('.db-modal__footer') || (() => {
        const el = document.createElement('div');
        el.className = 'db-modal__footer popup-modal-footer';
        modalEl?.appendChild(el);
        return el;
      })();
      bodyEl.textContent = message;
      footerEl.innerHTML = footerHtml;
      footerEl.hidden = !footerHtml.trim();

      let pendingResult = false;
      const popupManager = window.popupManager;

      const cleanup = () => {
        footerEl.removeEventListener('click', onClick);
      };

      const finish = res => {
        if (settled) return;
        settled = true;
        pendingResult = res;
        if (popupManager?.close && overlay.id) {
          popupManager.close(overlay, 'programmatic');
          return;
        }
        overlay.classList.remove('open');
        cleanup();
        resolve(res);
      };

      const onManagerClose = () => {
        cleanup();
        resolve(pendingResult);
      };

      const onClick = e => {
        const btn = e.target.closest('[data-dialog-action]');
        if (!btn) return;
        const action = btn.dataset.dialogAction;
        if (action === 'ok') finish(true);
        else if (action === 'extra') finish('extra');
      };
      footerEl.addEventListener('click', onClick);

      if (popupManager?.open && overlay.id) {
        popupManager.open(overlay, { type: 'dialog', onClose: onManagerClose });
      } else {
        overlay.classList.add('open');
      }
    });
  }

  _openLegacyDialog(message, { cancel, okText, cancelText, extraText }) {
    return new Promise(resolve => {
      const pop = this.shadowRoot.getElementById('dialogPopup');
      const msgEl = this.shadowRoot.getElementById('dialogMessage');
      const okBtn = this.shadowRoot.getElementById('dialogOk');
      const cancelBtn = this.shadowRoot.getElementById('dialogCancel');
      const extraBtn = this.shadowRoot.getElementById('dialogExtra');
      const popupManager = window.popupManager;
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
      pop.querySelector('.popup-inner').scrollTop = 0;
      let settled = false;
      let pendingResult = false;
      const finish = res => {
        if (settled) return;
        settled = true;
        resolve(res);
      };
      const cleanup = () => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        extraBtn.removeEventListener('click', onExtra);
        pop.removeEventListener('click', onOutside);
      };
      const close = (res, reason = 'programmatic') => {
        pendingResult = res;
        if (popupManager?.close && pop.id) {
          popupManager.close(pop, reason);
          return;
        }
        pop.classList.remove('open');
        cleanup();
        finish(res);
      };
      const onOk = () => close(true, 'ok');
      const onCancel = () => close(false, 'cancel');
      const onExtra = () => close('extra', 'extra');
      const onOutside = e => {
        if (!pop.querySelector('.popup-inner').contains(e.target)) close(false, 'backdrop');
      };
      const onManagerClose = () => {
        cleanup();
        finish(pendingResult);
      };

      if (popupManager?.open && pop.id) popupManager.open(pop, { type: 'dialog', onClose: onManagerClose });
      else pop.classList.add('open');

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
      link.classList.toggle('db-bottom-nav__item--active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    };

    setLinkState('traitsLink', '#/traits', ['traits', 'summary', 'effects']);
    setLinkState('inventoryLink', '#/inventory', ['inventory']);
    setLinkState('indexLink', '#/index', ['index']);
    setLinkState('characterLink', '#/character', ['character', 'notes']);

    // Swap searchFilters ↔ snabbspendera card based on inventory view
    const searchCard = this.shadowRoot.getElementById('searchFiltersCard');
    const spendCard = this.shadowRoot.getElementById('invSpendCard');
    if (searchCard) searchCard.hidden = role === 'inventory';
    if (spendCard) spendCard.hidden = role !== 'inventory';

    // Close inventory panels when leaving inventory view
    if (role !== 'inventory') {
      this.close('invDashPanel');
    }
  }

  updateInvDash(html) {
    const el = this.shadowRoot.getElementById('invDashInner');
    if (el) el.innerHTML = html;
  }

  updateInvSpend(html) {
    const el = this.shadowRoot.getElementById('invSpendInner');
    if (el) el.innerHTML = html;
  }
}

customElements.define('shared-toolbar', SharedToolbar);
