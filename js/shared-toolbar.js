/* ===========================================================
   js/shared-toolbar.js
   Web Component som innehåller:
     • Verktygsrad
     • Off-canvas-paneler: Inventarie, Egenskaper, Filter
     • Popup för kvaliteter
   =========================================================== */

class SharedToolbar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  /* ------------------------------------------------------- */
  connectedCallback() {
    this.render();
    this.cache();
    this.shadowRoot.addEventListener('click', e => this.handleClick(e));
    this._outsideHandler = e => this.handleOutsideClick(e);
    document.addEventListener('click', this._outsideHandler);
    this.initSwitchLink();
  }

  /* ------------------------------------------------------- */
  render() {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="css/style.css">

      <!-- ---------- Verktygsrad ---------- -->
      <footer class="toolbar">
        <input id="searchField" placeholder="Sök…">
        <span    class="exp-counter">XP: <span id="xpOut">0</span></span>
        <a       id="switchRole" class="char-btn icon" title="Byt vy">🔄</a>

        <button  id="invToggle"    class="char-btn icon" title="Inventarie">
          🎒 <span id="invBadge">0</span>
        </button>
        <button  id="traitsToggle" class="char-btn icon" title="Egenskaper">📊</button>
        <button  id="clearFilters" class="char-btn">Rensa filter</button>
        <button  id="filterToggle" class="char-btn icon" title="Filter">⚙️</button>
      </footer>

      <!-- ---------- Inventarie ---------- -->
      <aside id="invPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Inventarie</h2>
          <button class="char-btn icon" data-close="invPanel">✕</button>
        </header>
        <div class="filter-group">
          <label for="invTypeFilter">Kategori</label>
          <select id="invTypeFilter"></select>
        </div>
        <div id="moneyForm" class="money-form">
          <div class="money-row">
            <input id="moneyDaler" type="number" min="0" placeholder="Daler">
            <button id="moneyDalerBtn" class="char-btn">Lägg till</button>
          </div>
          <div class="money-row">
            <input id="moneySkilling" type="number" min="0" placeholder="Skilling">
            <button id="moneySkillingBtn" class="char-btn">Lägg till</button>
          </div>
          <div class="money-row">
            <input id="moneyOrtegar" type="number" min="0" placeholder="Örtegar">
            <button id="moneyOrtegarBtn" class="char-btn">Lägg till</button>
          </div>
          <div class="money-row">
            <button id="moneyResetBtn" class="char-btn danger" style="flex:1">Nollställ pengar</button>
          </div>
          <div class="money-row">
            <button id="clearInvBtn" class="char-btn danger" style="flex:1">Rensa inventarie</button>
          </div>
          <div class="money-row">
            <button id="addCustomBtn" class="char-btn" style="flex:1">Nytt föremål</button>
          </div>
        </div>
        <ul id="invList" class="card-list"></ul>
      </aside>

      <!-- ---------- Egenskaper ---------- -->
      <aside id="traitsPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Egenskaper</h2>
          <button class="char-btn icon" data-close="traitsPanel">✕</button>
        </header>

        <!-- Total erf -->
        <div class="filter-group">
          <label for="xpInput">Total erf</label>
          <input id="xpInput" type="number" min="0" value="0">
        </div>
        <!-- Sammanfattning -->
        <div id="xpSummary" class="exp-counter"></div>

        <div id="traits" class="traits"></div>
        <div class="exp-counter" style="text-align:right;">
          Tot: <span id="traitsTotal">0</span>
        </div>
        <div id="traitStats" class="exp-counter"></div>
      </aside>

      <!-- ---------- Filter ---------- -->
      <aside id="filterPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Filter</h2>
          <button class="char-btn icon" data-close="filterPanel">✕</button>
        </header>

        <div class="char-btn-row">
          <button id="newCharBtn" class="char-btn">Ny rollperson</button>
          <button id="deleteChar" class="char-btn danger">Ta bort rollperson</button>
        </div>

        <div class="filter-group">
          <label for="charSelect">Välj rollperson</label>
          <select id="charSelect"></select>
        </div>
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
        <div class="filter-group party-toggles">
          <ul class="toggle-list">
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Har du en smed i partyt?</span>
                <span class="toggle-note">Halverar priset för vapen och rustningar.</span>
              </span>
              <button id="partySmith" class="party-toggle">⚒️</button>
            </li>
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Har du en alkemist i partyt?</span>
                <span class="toggle-note">Halverar priset på alla elixir.</span>
              </span>
              <button id="partyAlchemist" class="party-toggle">⚗️</button>
            </li>
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Har du en artefaktmästare i partyt?</span>
                <span class="toggle-note">Halverar priset på Lägre Artefakter.</span>
              </span>
              <button id="partyArtefacter" class="party-toggle">🏺</button>
            </li>
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Utvidga sökningen?</span>
                <span class="toggle-note">Bara ett av de markerade filtren behöver matcha.</span>
              </span>
              <button id="filterUnion" class="party-toggle" title="Matcha någon tag (OR)">🔭</button>
            </li>
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Visa kompakt vy?</span>
                <span class="toggle-note">Slår av eller på kortare listvy.</span>
              </span>
              <button id="entryViewToggle" class="party-toggle" title="Växla kompakt vy">🤏</button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- ---------- Popup Kvalitet ---------- -->
      <div id="qualPopup">
        <div class="popup-inner">
          <h3 id="qualTitle">Välj kvalitet</h3>
          <div id="qualOptions"></div>
          <button id="qualCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Custom ---------- -->
      <div id="customPopup">
        <div class="popup-inner">
          <h3>Nytt föremål</h3>
          <input id="customName" placeholder="Namn">
          <select id="customType"></select>
          <div id="customArtifactEffect" class="filter-group" style="display:none">
            <label for="artifactEffect">Effekt</label>
            <select id="artifactEffect">
              <option value="corruption">+1 permanent korruption</option>
              <option value="xp">\u20131 erfarenhet</option>
            </select>
          </div>
          <div class="money-row">
            <input id="customDaler" type="number" min="0" placeholder="Daler">
            <input id="customSkilling" type="number" min="0" placeholder="Skilling">
            <input id="customOrtegar" type="number" min="0" placeholder="Örtegar">
          </div>
          <textarea id="customDesc" placeholder="Beskrivning"></textarea>
          <button id="customAdd" class="char-btn">Spara</button>
          <button id="customCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

      <!-- ---------- Popup Alkemistniv\u00e5 ---------- -->
      <div id="alcPopup">
        <div class="popup-inner">
          <h3>Alkemistniv\u00e5</h3>
          <div id="alcOptions">
            <button data-level="Novis" class="char-btn">Novis</button>
            <button data-level="Ges\u00e4ll" class="char-btn">Ges\u00e4ll</button>
            <button data-level="M\u00e4stare" class="char-btn">M\u00e4stare</button>
          </div>
          <button id="alcCancel" class="char-btn danger">Avbryt</button>
        </div>
      </div>

    `;
  }

  /* ------------------------------------------------------- */
  cache() {
    const $ = id => this.shadowRoot.getElementById(id);
    this.panels = {
      invPanel   : $('invPanel'),
      traitsPanel: $('traitsPanel'),
      filterPanel: $('filterPanel')
    };
    this.entryViewToggle = $('entryViewToggle');
  }

  /* ------------------------------------------------------- */
  handleClick(e) {
    const btn = e.target.closest('button, a');
    if (!btn) return;

    /* öppna/stäng (toggle) */
    if (btn.id === 'invToggle')    return this.toggle('invPanel');
    if (btn.id === 'traitsToggle') return this.toggle('traitsPanel');
    if (btn.id === 'filterToggle') return this.toggle('filterPanel');
    /* stäng */
    if (btn.dataset.close) return this.close(btn.dataset.close);
  }

  handleOutsideClick(e) {
    const path = e.composedPath();
    const toggles = ['invToggle','traitsToggle','filterToggle'];
    if (path.some(el => toggles.includes(el.id))) return;

    // ignore clicks inside popups so panels stay open
    const popups = ['qualPopup','customPopup','masterPopup','alcPopup'];
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
    if (!isOpen) panel.classList.add('open');
  }
  open(id)  { Object.values(this.panels).forEach(p=>p.classList.remove('open')); this.panels[id]?.classList.add('open'); }
  close(id) { this.panels[id]?.classList.remove('open'); }

  initSwitchLink() {
    const role = document.body.dataset.role;
    this.shadowRoot.getElementById('switchRole').href =
      role === 'index' ? 'character.html' : 'index.html';
  }
}

customElements.define('shared-toolbar', SharedToolbar);
