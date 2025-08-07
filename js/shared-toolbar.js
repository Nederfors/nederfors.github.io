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
    this.updateToolbarLinks();

    // Expose method for dynamic updates
    window.updateToolbarLinks = () => this.updateToolbarLinks();

    const nativeGetElementById = document.getElementById.bind(document);
    document.getElementById = id =>
      nativeGetElementById(id) || this.shadowRoot.getElementById(id);
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
          <a       id="notesLink"  class="char-btn icon" title="Anteckningar">📜</a>
          <button  id="traitsToggle" class="char-btn icon" title="Egenskaper">📊</button>
          <button  id="invToggle"    class="char-btn icon" title="Inventarie">
            🎒 <span id="invBadge">0</span>
          </button>
          <a       id="switchRole" class="char-btn icon" title="Byt vy">🔄</a>
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

        <div class="char-btn-row three-col">
          <button id="duplicateChar" class="char-btn">Kopiera rollperson</button>
          <button id="renameChar" class="char-btn">Byt namn</button>
          <button id="newCharBtn" class="char-btn">Ny rollperson</button>
        </div>
        <div class="char-btn-row three-col">
          <button id="deleteChar" class="char-btn danger">Ta bort rollperson</button>
          <button id="importChar" class="char-btn">Importera</button>
          <button id="exportChar" class="char-btn">Exportera</button>
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
            <strong>🧝 / 📇</strong> växlar mellan index och rollperson (ikonen ändras beroende på sida).<br>
            <strong>📜 / 📇</strong> öppnar anteckningssidan (ikonen ändras beroende på sida).<br>
            <strong>🎒</strong> öppnar inventariepanelen.<br>
            <strong>📊</strong> öppnar egenskapspanelen.<br>
            <strong>Skriv "lol"</strong> i sökfältet nollställer alla filter.<br>
            <strong>⚙️</strong> öppnar filtermenyn.
          </p>
          <h3>Filtermenyn</h3>
          <p>
            <strong>Ny rollperson</strong> skapar en ny karaktär.<br>
            <strong>Kopiera rollperson</strong> duplicerar den valda karaktären.<br>
            <strong>Byt namn</strong> ändrar karaktärens namn.<br>
            <strong>Ta bort rollperson</strong> raderar karaktären.<br>
            <strong>Exportera</strong> kopierar karaktären som kod.<br>
            <strong>Importera</strong> återställer en karaktär från kod.<br>
            <strong>⚒️ / ⚗️ / 🏺</strong> anger nivå på smed, alkemist och artefaktmakare.<br>
            <strong>🔭</strong> utvidgar sökningen (OR-filter).<br>
            <strong>🤏</strong> växlar kompakt listvy.<br>
            <strong>🏃</strong> låter dig välja försvarskaraktärsdrag manuellt.<br>
            <strong>ℹ️</strong> visar denna hjälpmeny.
          </p>
          <h3>Inventariepanelen</h3>
          <p>
            <strong>Nytt föremål</strong> lägger till eget föremål.<br>
            <strong>Hantera pengar</strong> justerar pengar.<br>
            <strong>Rensa inventarie</strong> tömmer inventariet.
          </p>
          <h3>Egenskapspanelen</h3>
          <p>Ange total XP och få en summering av valda förmågor.</p>
          <h3>Rollpersonspanelen</h3>
          <p><strong>📋</strong> visar en sammanfattning av försvar, korruption, bärkapacitet, hälsa och träffsäkerhet.</p>
          <h3>Anteckningssidan</h3>
          <p>
            <strong>✏️ Redigera</strong> växlar mellan läs- och redigeringsläge.<br>
            <strong>Sudda</strong> rensar alla fält.<br>
            <strong>Spara</strong> sparar anteckningarna.
          </p>
          <h3>Listor och inventarie</h3>
          <p>
            <strong>Lägg till / +</strong> lägger till posten.<br>
            <strong>−</strong> minskar antal eller tar bort posten.<br>
            <strong>Info</strong> visar detaljer.<br>
            <strong>K+</strong> lägger till kvalitet.<br>
            <strong>K🆓</strong> markerar en kostande kvalitet som gratis.<br>
            <strong>🆓</strong> gör ett föremål gratis.<br>
            <strong>💔</strong> visar konflikter.<br>
            <strong>↔</strong> växlar artefaktens kostnad mellan XP och permanent korruption.<br>
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

  updateToolbarLinks() {
    const role = document.body.dataset.role;
    const switchLink = this.shadowRoot.getElementById('switchRole');
    const notesLink  = this.shadowRoot.getElementById('notesLink');

    if (role === 'character') {
      switchLink.href = 'index.html';
      switchLink.textContent = '📇';
      switchLink.title = 'Till index';

      notesLink.href = 'notes.html';
      notesLink.textContent = '📜';
      notesLink.title = 'Anteckningar';
    } else if (role === 'notes') {
      switchLink.href = 'character.html';
      switchLink.textContent = '🧝';
      switchLink.title = 'Till rollperson';

      notesLink.href = 'index.html';
      notesLink.textContent = '📇';
      notesLink.title = 'Till index';
    } else {
      // Default to index
      switchLink.href = 'character.html';
      switchLink.textContent = '🧝';
      switchLink.title = 'Till rollperson';

      notesLink.href = 'notes.html';
      notesLink.textContent = '📜';
      notesLink.title = 'Anteckningar';
    }
  }
}

customElements.define('shared-toolbar', SharedToolbar);
