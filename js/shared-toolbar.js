/* ===========================================================
   js/shared-toolbar.js
   Web Component som innehåller:
     • Verktygsrad
     • Off-canvas-paneler: Egenskaper, Filter, Info
     • Popup för kvaliteter
   =========================================================== */
const FILTER_TOOLS_KEY = 'filterToolsOpen';
const FILTER_SETTINGS_KEY = 'filterSettingsOpen';
const FILTER_INV_FUNCS_KEY = 'invToolsOpen';
const FILTER_CARD_KEY_MAP = Object.freeze({
  filterFormalCard: FILTER_TOOLS_KEY,
  filterInventoryFunctions: FILTER_INV_FUNCS_KEY,
  filterSettingsCard: FILTER_SETTINGS_KEY
});

const icon = (name, opts) => window.iconHtml ? window.iconHtml(name, opts) : '';

class SharedToolbar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // One-time flag: ensure filter cards restore state on first open
    this._filterFirstOpenHandled = false;
  }

  /* ------------------------------------------------------- */
  connectedCallback() {
    this.render();
    this.dispatchEvent(new CustomEvent('toolbar-rendered'));

    const toolbar = this.shadowRoot.querySelector('.toolbar');
    if (window.visualViewport) {
      this._vvHandler = () => {
        /*
          Lås verktygsraden precis ovanför tangentbordet. När tangent-
          bordet inte är öppet blir offset noll och raden placeras mot
          skärmens nederkant.
        */
        const vv = window.visualViewport;
        let offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        if (offset < 50) {
          toolbar.style.bottom = 'env(safe-area-inset-bottom)';
        } else {
          toolbar.style.bottom = `calc(env(safe-area-inset-bottom) + ${offset}px)`;
        }
      };
      window.visualViewport.addEventListener('resize', this._vvHandler);
      window.visualViewport.addEventListener('scroll', this._vvHandler);
      this._vvHandler();
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
    window.visualViewport?.removeEventListener('resize', this._vvHandler);
    window.visualViewport?.removeEventListener('scroll', this._vvHandler);
    document.removeEventListener('click', this._outsideHandler);
  }

  /* ------------------------------------------------------- */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }

        .toolbar {
          position: fixed;
          bottom: 0;
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
        }
        .toolbar-top .suggestions .item:hover,
        .toolbar-top .suggestions .item.active {
          background: var(--border);
        }
        .button-row {
          display: flex;
          gap: .6rem;
        }
        .button-row > a,
        .button-row > button {
          flex: 1;
          min-width: 0;
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
          <button  id="traitsToggle" class="char-btn icon icon-only" title="Egenskaper">${icon('egenskaper')}</button>
          <a       id="inventoryLink" class="char-btn icon nav-link" title="Inventarievy" href="inventory.html">${icon('inventarie')}</a>
          <a       id="indexLink" class="char-btn icon icon-only nav-link" title="Index" href="index.html">${icon('index')}</a>
          <a       id="characterLink" class="char-btn icon icon-only nav-link" title="Rollperson" href="character.html">${icon('character')}</a>
          <button  id="filterToggle" class="char-btn icon icon-only" title="Filter">${icon('settings')}</button>
        </div>
      </footer>

      <!-- ---------- Egenskaper ---------- -->
      <aside id="traitsPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Egenskaper</h2>
          <div class="inv-actions">
            <button id="resetTraits" class="char-btn icon danger" title="Återställ basegenskaper">${icon('broom')}</button>
            <button class="char-btn icon" data-close="traitsPanel">✕</button>
          </div>
        </header>

        <div class="traits-content summary-content">
          <section class="summary-section trait-xp-section">
            <div id="xpSummary" class="trait-xp-summary">
              <div class="trait-xp-header">
                <span class="trait-xp-title">XP-status</span>
                <div class="xp-control trait-xp-buttons">
                  <button id="xpMinus" class="char-btn icon icon-only" type="button" aria-label="Minska XP" title="Minska XP">${icon('minus')}</button>
                  <input id="xpInput" type="number" min="0" value="0" aria-label="Totala erfarenhetspoäng">
                  <button id="xpPlus" class="char-btn icon icon-only" type="button" aria-label="Öka XP" title="Öka XP">${icon('plus')}</button>
                </div>
              </div>
              <div class="trait-xp-row">
                <span class="trait-xp-item">
                  <span class="trait-xp-label">TOTALT:</span>
                  <span id="xpTotal" class="trait-xp-value">0</span>
                </span>
                <span class="trait-xp-item">
                  <span class="trait-xp-label">ANVÄNT:</span>
                  <span id="xpUsed" class="trait-xp-value">0</span>
                </span>
                <span class="trait-xp-item">
                  <span class="trait-xp-label">OANVÄNT:</span>
                  <span id="xpFree" class="trait-xp-value">0</span>
                </span>
              </div>
            </div>
          </section>

          <section class="summary-section trait-list-section">
            <div class="trait-meta">
              <div class="traits-total" role="status">
                Karaktärsdrag: <span id="traitsTotal">0</span> / <span id="traitsMax">0</span>
              </div>
              <div id="traitStats" class="trait-extra-meta" aria-live="polite"></div>
            </div>
            <div id="traits" class="traits-grid traits"></div>
          </section>
        </div>
      </aside>

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
            <div class="card-title"><span><span class="collapse-btn"></span>Verktyg 🧰</span></div>
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
          <li class="card" data-special="__invfunc__" id="filterInventoryFunctions">
            <div class="card-title"><span><span class="collapse-btn"></span>Inventarie 💰</span></div>
            <div class="card-desc">
              <div class="inv-buttons" id="filterInventoryFunctionsInner"></div>
            </div>
          </li>
          <li class="card" data-special="__formal__" id="filterSettingsCard">
            <div class="card-title"><span><span class="collapse-btn"></span>Inställningar 💡</span></div>
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
                    <button id="partyArtefacter" class="party-toggle">🏺</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Utvidgad sökning?</span>
                    </span>
                    <button id="filterUnion" class="party-toggle" title="Matcha någon tag (OR)">🔭</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Expandera vy?</span>
                    </span>
                    <button id="entryViewToggle" class="party-toggle" title="Expandera vy">↕️</button>
                  </li>
                  <li>
                    <span class="toggle-desc">
                      <span class="toggle-question">Tvinga försvar?</span>
                    </span>
                    <button id="forceDefense" class="party-toggle" title="Välj försvarskaraktärsdrag">🏃</button>
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
            <textarea id="customLevelNovis" placeholder="Novis"></textarea>
            <textarea id="customLevelGesall" placeholder="Gesäll"></textarea>
            <textarea id="customLevelMastare" placeholder="Mästare"></textarea>
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
          <textarea id="customDesc" placeholder="Beskrivning"></textarea>
          <button id="customAdd" class="char-btn" type="button">Spara</button>
          <button id="customDelete" class="char-btn danger" type="button" style="display:none">Radera</button>
          <button id="customCancel" class="char-btn danger" type="button">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Pengar ---------- -->
      <div id="moneyPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Hantera pengar</h3>
          <div class="money-row">
            <input id="moneyDaler" type="number" min="0" placeholder="Daler">
            <input id="moneySkilling" type="number" min="0" placeholder="Skilling">
            <input id="moneyOrtegar" type="number" min="0" placeholder="Örtegar">
          </div>
          <button id="moneySetBtn" class="char-btn">Spara som totalen</button>
          <button id="moneyAddBtn" class="char-btn">Addera till totalen</button>
          <button id="moneyResetBtn" class="char-btn danger">Nollställ pengar</button>
          <button id="moneyCancel" class="char-btn danger">Avbryt</button>
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

      <!-- ---------- Popup Ta bort föremål med innehåll ---------- -->
      <div id="deleteContainerPopup" class="popup popup-bottom">
        <div class="popup-inner">
          <p>Du håller på att ta bort ett föremål som innehåller föremål. Vill du ta bort föremålen i föremålet?</p>
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

      <!-- ---------- Popup Försvarskaraktärsdrag ---------- -->
      <div id="defensePopup" class="popup popup-bottom">
        <div class="popup-inner">
          <h3>Försvarskaraktärsdrag</h3>
          <div id="defenseOptions">
            <button data-trait="" class="char-btn">Automatiskt</button>
            <button data-trait="Diskret" class="char-btn">Diskret</button>
            <button data-trait="Kvick" class="char-btn">Kvick</button>
            <button data-trait="Listig" class="char-btn">Listig</button>
            <button data-trait="Stark" class="char-btn">Stark</button>
            <button data-trait="Träffsäker" class="char-btn">Träffsäker</button>
            <button data-trait="Vaksam" class="char-btn">Vaksam</button>
            <button data-trait="Viljestark" class="char-btn">Viljestark</button>
            <button data-trait="Övertygande" class="char-btn">Övertygande</button>
          </div>
          <button id="defenseCancel" class="char-btn danger">Avbryt</button>
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
              <li>Öppna panelerna längst ned: ${icon('egenskaper')} Egenskaper, ${icon('inventarie')} Inventarie, ${icon('settings')} Filter.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Verktygsrad</h3>
            <ul class="summary-list">
              <li>▼: Minimerar/expanderar alla kategorier i listor.</li>
              <li>${icon('character')} / ${icon('index')}: Växlar mellan rollperson och index (ikonen ändras per sida).</li>
              <li>${icon('anteckningar')}: Öppnar anteckningssidan (i rollpersonens sidhuvud).</li>
              <li>${icon('inventarie')}: Öppnar inventariepanelen. ${icon('egenskaper')}: Öppnar egenskapspanelen. ${icon('settings')}: Öppnar filter.</li>
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
              <li>Mapphantering: Skapa mappar och flytta rollpersoner mellan mappar.</li>
              <li>Export/Import: Säkerhetskopiera eller hämta karaktärer som JSON.</li>
              <li>${icon('smithing')}/${icon('alkemi')}/🏺: Välj nivå för smed, alkemist och artefaktmakare (påverkar pris och åtkomst).</li>
              <li>🔭 Utvidga sökning: Växla till OR-filter (matcha någon tag).</li>
              <li>↕️ Expandera vy: Visar fler detaljer i kort (alla utom Ras, Yrken och Elityrken).</li>
              <li>🏃 Försvar: Välj försvarskaraktärsdrag manuellt.</li>
              <li>${icon('info')} Hjälp: Visar denna panel.</li>
            </ul>
          </section>

          <section class="summary-section">
            <h3>Inventarie</h3>
            <ul class="summary-list">
              <li>Sök i inventarie: Filtrerar föremål i realtid.</li>
              <li>▶/▼ Öppna eller kollapsa alla.</li>
              <li>🔀 Dra-och-släpp-läge för att ändra ordning.</li>
              <li>🆕 Eget föremål. 💰 Pengar (Spara/Addera/Nollställ; ${icon('minus')}/${icon('plus')} justerar 1 daler).</li>
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
              <li>${icon('free')} Gör föremål gratis. 💔 Visa konflikter.</li>
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
      traitsPanel: $('traitsPanel'),
      filterPanel: $('filterPanel'),
      infoPanel  : $('infoPanel')
    };
    this.entryViewToggle = $('entryViewToggle');
    this.filterCollapseBtn = $('collapseAllFilters');
  }

  restoreFilterCollapse() {
    const cards = [
      { el: this.shadowRoot.getElementById('filterFormalCard'),    key: FILTER_TOOLS_KEY },
      { el: this.shadowRoot.getElementById('filterInventoryFunctions'), key: FILTER_INV_FUNCS_KEY },
      { el: this.shadowRoot.getElementById('filterSettingsCard'),  key: FILTER_SETTINGS_KEY }
    ];
    cards.forEach(({ el, key }) => {
      if (!el) return;
      const val = localStorage.getItem(key);
      const open = val === '1' || val === null;
      el.classList.toggle('compact', !open);
      window.entryCardFactory?.syncCollapse?.(el);
      if (val === null) localStorage.setItem(key, open ? '1' : '0');
    });
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
        if (card && key) {
          const isCompact = card.classList.toggle('compact');
          localStorage.setItem(key, isCompact ? '0' : '1');
          this.updateFilterCollapseBtn();
          window.entryCardFactory?.syncCollapse?.(card);
        }
      }
      return;
    }

    /* öppna/stäng (toggle) */
    if (btn.id === 'traitsToggle') return this.toggle('traitsPanel');
    if (btn.id === 'filterToggle') return this.toggle('filterPanel');
    if (btn.id === 'infoToggle')   return this.toggle('infoPanel');
    /* stäng */
    if (btn.dataset.close) return this.close(btn.dataset.close);

    if (btn.id === 'checkForUpdates') {
      if (typeof window.requestPwaUpdate !== 'function') {
        window.toast?.('Uppdateringsfunktionen är inte tillgänglig.');
        return;
      }
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Kontrollerar…';
      Promise.resolve()
        .then(() => window.requestPwaUpdate())
        .then(result => {
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
        })
        .catch(error => {
          console.error('PWA update failed', error);
          window.toast?.('Kunde inte söka efter uppdatering.');
        })
        .finally(() => {
          btn.disabled = false;
          btn.textContent = originalText;
        });
      return;
    }

    if (btn.id === 'collapseAllFilters') {
      const cards = [...this.shadowRoot.querySelectorAll('#filterPanel .card:not(#searchFiltersCard):not(.help-card)')];
      const anyOpen = cards.some(c => !c.classList.contains('compact'));
      cards.forEach(c => {
        c.classList.toggle('compact', anyOpen);
        const key = FILTER_CARD_KEY_MAP[c.id];
        if (key) localStorage.setItem(key, c.classList.contains('compact') ? '0' : '1');
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
      if (card && key) {
        const isCompact = card.classList.toggle('compact');
        localStorage.setItem(key, isCompact ? '0' : '1');
        this.updateFilterCollapseBtn();
        window.entryCardFactory?.syncCollapse?.(card);
      }
    }
  }

  handleOutsideClick(e) {
    const path = e.composedPath();
    const toggles = ['traitsToggle','filterToggle','infoToggle'];
    if (path.some(el => toggles.includes(el.id))) return;

    // Hide search suggestions when clicking outside search UI
    const sugEl = this.shadowRoot.getElementById('searchSuggest');
    const sIn   = this.shadowRoot.getElementById('searchField');
    if (sugEl && !sugEl.hidden) {
      const insideSearch = path.includes(sugEl) || path.includes(sIn);
      if (!insideSearch) {
        sugEl.hidden = true;
      }
    }

    // ignore clicks inside popups so panels stay open
      const popups = ['qualPopup','customPopup','moneyPopup','saveFreePopup','advMoneyPopup','qtyPopup','pricePopup','rowPricePopup','vehiclePopup','vehicleRemovePopup','masterPopup','alcPopup','smithPopup','artPopup','defensePopup','exportPopup','importPopup','pdfPopup','nilasPopup','tabellPopup','dialogPopup','folderManagerPopup','newCharPopup','dupCharPopup','renameCharPopup','artifactPaymentPopup'];
    if (path.some(el => popups.includes(el.id))) return;

    const openPanel = Object.values(this.panels).find(p => p.classList.contains('open'));
    if (openPanel && !path.includes(openPanel)) {
      openPanel.classList.remove('open');
    }
  }

  toggle(id) {
    const panel = this.panels[id];
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    Object.values(this.panels).forEach(p=>p.classList.remove('open'));
    if (!isOpen) {
      if (id === 'filterPanel' && !this._filterFirstOpenHandled) {
        this.restoreFilterCollapse();
        this._filterFirstOpenHandled = true;
      }
      if (id === 'filterPanel') this.updateFilterCollapseBtn();
      panel.classList.add('open');
      panel.scrollTop = 0;
    }
  }
  open(id)  {
    Object.values(this.panels).forEach(p=>p.classList.remove('open'));
    const panel = this.panels[id];
    if (panel) {
      if (id === 'filterPanel' && !this._filterFirstOpenHandled) {
        this.restoreFilterCollapse();
        this._filterFirstOpenHandled = true;
      }
      if (id === 'filterPanel') this.updateFilterCollapseBtn();
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

    setLinkState('inventoryLink', 'inventory.html', ['inventory']);
    setLinkState('indexLink', 'index.html', ['index']);
    setLinkState('characterLink', 'character.html', ['character', 'notes']);
  }
}

customElements.define('shared-toolbar', SharedToolbar);
