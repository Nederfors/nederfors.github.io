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
        <div class="toolbar-top">
          <input id="searchField" placeholder="Sök…">
          <span class="exp-counter">XP: <span id="xpOut">0</span></span>
        </div>
        <div class="button-row">
          <a       id="switchRole" class="char-btn icon" title="Byt vy">🔄</a>
          <button  id="invToggle"    class="char-btn icon" title="Inventarie">
            🎒 <span id="invBadge">0</span>
          </button>
          <button  id="traitsToggle" class="char-btn icon" title="Egenskaper">📊</button>
          <button  id="clearFilters" class="char-btn">Rensa filter</button>
          <button  id="filterToggle" class="char-btn icon" title="Filter">⚙️</button>
        </div>
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
        <div class="inv-buttons">
          <button id="addCustomBtn" class="char-btn" style="flex:1">Nytt föremål</button>
          <button id="manageMoneyBtn" class="char-btn" style="flex:1">Hantera pengar</button>
          <button id="clearInvBtn" class="char-btn danger" style="flex:1">Rensa inventarie</button>
        </div>
        <ul id="invList" class="card-list"></ul>
      </aside>

      <!-- ---------- Egenskaper ---------- -->
      <aside id="traitsPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Egenskaper</h2>
          <button class="char-btn icon" data-close="traitsPanel">✕</button>
        </header>

        <!-- Erfarenhetspoäng -->
        <div class="filter-group">
          <label for="xpInput">Erfarenhetspoäng</label>
          <input id="xpInput" type="number" min="0" value="0">
        </div>
        <!-- Sammanfattning -->
        <div id="xpSummary" class="exp-counter"></div>
        <div class="exp-counter traits-total" style="text-align:center;">
          Karaktärsdrag: <span id="traitsTotal">0</span> / <span id="traitsMax">0</span>
        </div>
        <div id="traits" class="traits"></div>
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
          <button id="duplicateChar" class="char-btn">Kopiera rollperson</button>
          <button id="renameChar" class="char-btn">Byt namn</button>
          <button id="deleteChar" class="char-btn danger">Ta bort rollperson</button>
          <button id="exportChar" class="char-btn">Exportera</button>
          <button id="importChar" class="char-btn">Importera</button>
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
                <span class="toggle-note">Halverar priset beroende på smideskonstnivå.</span>
              </span>
              <button id="partySmith" class="party-toggle">⚒️</button>
            </li>
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Har du en alkemist i partyt?</span>
                <span class="toggle-note">Halverar priset på elixir beroende på alkemistnivå.</span>
              </span>
              <button id="partyAlchemist" class="party-toggle">⚗️</button>
            </li>
            <li>
              <span class="toggle-desc">
              <span class="toggle-question">Har du en artefaktmakare i partyt?</span>
              <span class="toggle-note">Halverar priset på lägre artefakter beroende på artefaktmakarnivå.</span>
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
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Tvinga försvarskaraktärsdrag?</span>
                <span class="toggle-note">Välj karaktärsdrag via meny.</span>
              </span>
              <button id="forceDefense" class="party-toggle" title="Välj försvarskaraktärsdrag">🏃</button>
            </li>
            <li>
              <span class="toggle-desc">
                <span class="toggle-question">Behöver du hjälp?</span>
                <span class="toggle-note">Öppnar en översikt av alla knappar.</span>
              </span>
              <button id="infoToggle" class="party-toggle" title="Visa hjälp">ℹ️</button>
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

      <!-- ---------- Popup Pengar ---------- -->
      <div id="moneyPopup">
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

      <!-- ---------- Popup Alkemistniv\u00e5 ---------- -->
      <div id="alcPopup">
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
      <div id="smithPopup">
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
      <div id="artPopup">
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
      <div id="defensePopup">
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

      <!-- ---------- Nilas Popup ---------- -->
      <div id="nilasPopup">
        <div class="popup-inner">
          <h3>Nilas \u00e4r b\u00e4st. H\u00e5ller du med?</h3>
          <div class="button-row">
            <button id="nilasNo" class="char-btn">Nej!</button>
            <button id="nilasYes" class="char-btn">Ja!</button>
          </div>
        </div>
      </div>

      <!-- ---------- Hj\u00e4lp ---------- -->
      <aside id="infoPanel" class="offcanvas">
        <header class="inv-header">
          <h2>Hj\u00e4lp</h2>
          <button class="char-btn icon" data-close="infoPanel">✕</button>
        </header>
        <div class="help-content">
          <h3>Verktygsrad</h3>
          <p>
            <strong>🔄</strong> Byter mellan index- och rollpersons-vy.<br>
            <strong>🎒</strong> \u00d6ppnar inventariet.<br>
            <strong>📊</strong> \u00d6ppnar egenskaper.<br>
            <strong>Rensa filter</strong> nollst\u00e4ller filtren.<br>
            <strong>⚙️</strong> \u00d6ppnar filtermenyn.
          </p>
          <h3>Filtermenyn</h3>
          <p>
            <strong>Ny rollperson</strong> skapar en ny karakt\u00e4r.<br>
            <strong>Ta bort rollperson</strong> raderar vald karakt\u00e4r.<br>
            <strong>Exportera</strong> kopierar karakt\u00e4ren som en delbar kod.<br>
            <strong>Importera</strong> \u00e5terst\u00e4ller en sparad karakt\u00e4r från kopierad kod.<br>
            <strong>⚒️/⚗️/🏺</strong> v\u00e4ljer niv\u00e5 p\u00e5 smed, alkemist och artefaktmakare för prisreducieringar.<br>
            <strong>🔭</strong> l\u00e5ter tillagda filter utöka sökningen istället för att göra den snävare.<br>
            <strong>🤏</strong> v\u00e4xlar till kompakt vy.<br>
            <strong>🏃</strong> l\u00e5ter dig v\u00e4lja f\u00f6rsvarskarakt\u00e4rsdrag manuellt.<br>
            <strong>ℹ️</strong> visar denna hj\u00e4lpmeny.
          </p>
          <h3>Inventariepanelen</h3>
          <p>
            <strong>Nytt f\u00f6rem\u00e5l</strong> l\u00e4gger till eget f\u00f6rem\u00e5l ifall din karaktär har specialbehov, t.ex för artefakter.<br>
            <strong>Hantera pengar</strong> justerar pengar.<br>
            <strong>Rensa inventarie</strong> tar bort all utrustning.
          </p>
          <h3>Egenskapspanelen</h3>
          <p>
            H\u00e4r kan du ange total erfarenhet och se summering av valda f\u00f6rm\u00e5gor.
          </p>
          <h3>Rollpersonspanelen</h3>
          <p>
            <strong>📋</strong> visar en sammanfattning av f\u00f6rsvar, korruption, b\u00e4rkapacitet, h\u00e4lsa och tr\u00e4ffs\u00e4kerhet.<br>
          </p>
          <h3>Listor och inventarie</h3>
          <p>
            <strong>L\u00e4gg till</strong> eller <strong>+</strong> l\u00e4gger till posten till karaktären / inventariet.<br>
            <strong>−</strong> minskar antal eller tar bort posten helt om det bara finns en kvar.<br>
            <strong>Info</strong> visar mer information om inlägget.<br>
            <strong>K+</strong> låter dig l\u00e4gga till en kvalitet till föremålet från en lista.<br>
            <strong>K🆓</strong> markerar den kostande kvaliteten längst till vänster som gratis.<br>
            <strong>🆓</strong> Gör ett föremål gratis, går att använda flera gånger för en stack av föremål.<br>
            <strong>💔</strong> visar vilka andra aktiva f\u00f6rm\u00e5gor som inte kan anv\u00e4ndas samtidigt.<br>
            <strong>↔</strong> v\u00e4xlar artefaktens effekt mellan att kosta 1 erfarenhet eller att ge en permanent korruption.<br>
            <strong>🗑</strong> tar bort posten helt.
          </p>
        </div>
      </aside>

    `;
  }

  /* ------------------------------------------------------- */
  cache() {
    const $ = id => this.shadowRoot.getElementById(id);
    this.panels = {
      invPanel   : $('invPanel'),
      traitsPanel: $('traitsPanel'),
      filterPanel: $('filterPanel'),
      infoPanel  : $('infoPanel')
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
    if (btn.id === 'infoToggle')   return this.toggle('infoPanel');
    /* stäng */
    if (btn.dataset.close) return this.close(btn.dataset.close);
  }

  handleOutsideClick(e) {
    const path = e.composedPath();
    const toggles = ['invToggle','traitsToggle','filterToggle','infoToggle'];
    if (path.some(el => toggles.includes(el.id))) return;

    // ignore clicks inside popups so panels stay open
    const popups = ['qualPopup','customPopup','moneyPopup','masterPopup','alcPopup','smithPopup','artPopup','defensePopup','nilasPopup'];
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
