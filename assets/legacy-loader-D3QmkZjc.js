const V="modulepreload",$=function(t){return"/"+t},k={},F=function(a,s,n){let l=Promise.resolve();if(s&&s.length>0){let y=function(r){return Promise.all(r.map(u=>Promise.resolve(u).then(p=>({status:"fulfilled",value:p}),p=>({status:"rejected",reason:p}))))};document.getElementsByTagName("link");const e=document.querySelector("meta[property=csp-nonce]"),i=e?.nonce||e?.getAttribute("nonce");l=y(s.map(r=>{if(r=$(r),r in k)return;k[r]=!0;const u=r.endsWith(".css"),p=u?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${r}"]${p}`))return;const o=document.createElement("link");if(o.rel=u?"stylesheet":V,u||(o.as="script"),o.crossOrigin="",o.href=r,i&&o.setAttribute("nonce",i),document.head.appendChild(o),u)return new Promise((B,N)=>{o.addEventListener("load",B),o.addEventListener("error",()=>N(new Error(`Unable to preload CSS for ${r}`)))})}))}function c(e){const i=new Event("vite:preloadError",{cancelable:!0});if(i.payload=e,window.dispatchEvent(i),!i.defaultPrevented)throw e}return l.then(e=>{for(const i of e||[])i.status==="rejected"&&c(i.reason);return a().catch(c)})},L=new Set(["index","character","inventory","notes","traits"]),R="index",K=Object.freeze({summary:{role:"traits",tab:"summary"},effects:{role:"traits",tab:"effects"}});function w(t=location.hash){const a=String(t||"").replace(/^#\/?/,"").split("?")[0].split("/")[0].toLowerCase();if(L.has(a))return{role:a,tab:null};const s=K[a];return s?{role:s.role,tab:s.tab}:{role:R,tab:null}}function z(t,a){return a==="summary"?"#/summary":a==="effects"?"#/effects":`#/${t}`}let b="",m=null;const v=[];function M(t,a){for(const s of v)try{s(a,t)}catch(n){console.error("[router] listener error",n)}}function A(t=!1){const{role:a,tab:s}=w(),n={role:b,tab:m};a===b&&s===m||(b=a,m=s,M(n,{role:a,tab:s}))}function U(t,a={}){const{tab:s=null,replace:n=!1}=a,l=z(t,s);if(n)history.replaceState(null,"",l);else{location.hash=l;return}A()}function q(t){return v.push(t),()=>{const a=v.indexOf(t);a>=0&&v.splice(a,1)}}function D(){(!location.hash||location.hash==="#"||location.hash==="#/")&&history.replaceState(null,"","#/index");const{role:t,tab:a}=w();b=t,m=a,window.addEventListener("hashchange",()=>A())}const ta={init:D,navigateTo:U,onRouteChange:q,parseHash:w,get currentRole(){return b},get currentTab(){return m},roleToHash:z,VALID_ROLES:L,DEFAULT_ROLE:R},d=t=>`<img src="icons/${t}.svg" alt="" class="btn-icon" width="32" height="32">`,S=Object.freeze({index:"Symbapedia",character:"Symbapedia - Rollperson",inventory:"Symbapedia - Inventarie",notes:"Symbapedia - Anteckningar",traits:"Symbapedia - Egenskaper"}),T=Object.freeze({summary:"Symbapedia - Oversikt",effects:"Symbapedia - Effekter"});function ea(t,a=null){return a&&T[a]?T[a]:S[t]||S.index}const sa=Object.freeze({index:`
  <h1 class="app-title">Symbapedia</h1>

  <div id="activeFilters" class="tags"></div>

  <!-- Resultatpanel -->
  <div class="db-card panel">
    <div class="db-card__body">
      <ul id="lista" class="db-list db-accordion card-list entry-card-list" data-entry-page="index"></ul>
    </div>
  </div>
`,character:`
  <h1 class="app-title">ROLLPERSON</h1>

  <div id="activeFilters" class="tags"></div>

  <!-- Panel för valda förmågor / krafter -->
  <div class="db-card panel">
    <div class="db-card__header panel-header">
      <h2 id="charName" class="db-card__title" style="margin:0;"></h2>
      <div class="header-actions">
        <button id="clearNonInv" class="db-btn db-btn--icon db-btn--danger" title="Rensa allt utom inventariet">${d("broom")}</button>
        <a href="#/notes" id="notesLink" class="db-btn db-btn--icon" title="Anteckningar">${d("anteckningar")}</a>
        <a id="summaryToggle" class="db-btn db-btn--icon summary-btn" href="#/summary" title="Visa översikt">${d("overview")}</a>
        <a id="effectsToggle" class="db-btn db-btn--icon" href="#/effects" title="Visa effekter">${d("effects")}</a>
      </div>
    </div>
    <div class="db-card__body">
      <ul id="valda" class="db-list db-accordion card-list entry-card-list" data-entry-page="character"></ul>
    </div>
  </div>

  <!-- Konfliktpanel för aktiva handlingar -->
  <aside id="conflictPanel" class="db-drawer offcanvas" data-touch-profile="panel-right">
    <header class="inv-header">
      <h2 id="conflictTitle">Kan ej användas samtidigt som</h2>
      <div class="inv-actions">
        <button class="db-btn db-btn--icon db-btn--icon-only" id="conflictClose">${d("cross")}</button>
      </div>
    </header>
    <div class="conflict-panel-content info-panel-content summary-content">
      <div class="info-panel-stack">
        <section class="summary-section info-panel-section info-panel-overview conflict-panel-overview">
          <div class="info-panel-overview-grid">
            <div class="info-panel-overview-block">
              <div class="info-panel-overview-label">Konflikter</div>
              <p>Poster här blockerar varandra och kan inte vara aktiva samtidigt.</p>
            </div>
            <div class="info-panel-overview-block">
              <div class="info-panel-overview-label">Tips</div>
              <p>Öppna en post för att läsa varför den krockar med din nuvarande uppsättning.</p>
            </div>
          </div>
        </section>

        <section class="summary-section info-panel-section conflict-panel-section">
          <h3>Aktiva konflikter</h3>
          <ul id="conflictList" class="card-list entry-card-list conflict-card-list" data-entry-page="conflict"></ul>
        </section>
      </div>
    </div>
  </aside>
`,inventory:`
  <h1 class="app-title">INVENTARIE</h1>

  <div id="activeFilters" class="tags"></div>

  <div class="db-card panel inventory-panel">
    <div class="db-card__header panel-header">
      <h2 id="charName" class="db-card__title" style="margin:0;"></h2>
      <div class="header-actions">
        <button id="manageItemsBtn" class="db-btn" type="button" title="Hantera föremål">
          Hantera föremål
        </button>
        <button id="manageEconomyBtn" class="db-btn" type="button" title="Hantera ekonomi">
          Hantera ekonomi
        </button>
      </div>
    </div>

    <div class="db-card__body inventory-content">
      <div id="invFormal" class="formal-dashboard-wrap"></div>
      <ul id="invList" class="db-list db-accordion card-list entry-card-list" data-entry-page="inventory"></ul>
    </div>
  </div>

  <button id="invDashFloatBtn" class="db-btn inv-dash-float-btn" type="button" title="Visa inventarieöversikt" aria-label="Visa inventarieöversikt">
    <svg class="inv-dash-float-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="7" x2="19" y2="7"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="17" x2="19" y2="17"/></svg>
  </button>
`,notes:`
  <h1 class="app-title">Anteckningar</h1>

  <div class="db-card panel">
    <div class="db-card__header panel-header">
      <h2 id="charName" class="db-card__title" style="margin:0;"></h2>
      <div class="header-actions">
        <a href="#/character" id="charLink" class="db-btn db-btn--icon icon-only" title="Till rollperson">${d("character")}</a>
        <button id="editBtn" class="db-btn db-btn--icon" title="Redigera">${d("pen")}</button>
      </div>
    </div>

    <form id="characterForm" class="db-card__body">

      <!-- -------- Bakgrund -------- -->
      <details class="note-field" open>
        <summary>Berätta om rollpersonens bakgrund</summary>
        <textarea id="background" name="background" class="auto-resize" placeholder="Här kan du skriva längre text…"></textarea>
      </details>

      <!-- -------- Kortfattat -------- -->
        <div class="field-row">
          <details class="note-field" open>
            <summary>Skugga</summary>
            <textarea id="shadow" name="shadow" class="auto-resize" placeholder="Ex. 'Vit som nyfallen snö med stänk av sot'"></textarea>
          </details>
          <details class="note-field" open>
            <summary>Ålder</summary>
            <textarea id="age" name="age" class="auto-resize" placeholder="T.ex. 34"></textarea>
          </details>
        </div>
        <div class="field-row">
          <details class="note-field" open>
            <summary>Utseende</summary>
            <textarea id="appearance" name="appearance" class="auto-resize" placeholder="Kort beskrivning"></textarea>
          </details>
          <details class="note-field" open>
            <summary>Manér</summary>
            <textarea id="manner" name="manner" class="auto-resize" placeholder="Särskilda drag"></textarea>
          </details>
        </div>
        <details class="note-field" open>
          <summary>Citat</summary>
          <textarea id="quote" name="quote" class="auto-resize" placeholder="Ex. 'Jag önskar att min skugga var Smygaren'"></textarea>
        </details>

        <details class="note-field" open>
          <summary>Fraktion/ätt/klan/stam</summary>
          <textarea id="faction" name="faction" class="auto-resize" placeholder="T.ex. ätt eller klan"></textarea>
        </details>

      <!-- -------- Mellanlångt -------- -->
        <div class="field-row">
          <details class="note-field" open>
            <summary>Personligt mål</summary>
            <textarea id="goal" name="goal" class="auto-resize" placeholder="Livsmål, ambition"></textarea>
          </details>
          <details class="note-field" open>
            <summary>Drivkrafter</summary>
            <textarea id="drives" name="drives" class="auto-resize" placeholder="Vad får dem att agera?"></textarea>
          </details>
        </div>
        <div class="field-row">
          <details class="note-field" open>
            <summary>Lojaliteter</summary>
            <textarea id="loyalties" name="loyalties" class="auto-resize" placeholder="T.ex. familj, gille"></textarea>
          </details>
          <details class="note-field" open>
            <summary>Älskar</summary>
            <textarea id="likes" name="likes" class="auto-resize" placeholder="T.ex. skogar, böcker"></textarea>
          </details>
        </div>
        <details class="note-field" open>
          <summary>Hatar</summary>
          <textarea id="hates" name="hates" class="auto-resize" placeholder="T.ex. orättvisa, korruption"></textarea>
        </details>

      <!-- -------- Knappar -------- -->
      <div class="char-btn-row">
        <button type="button" id="clearBtn" class="db-btn db-btn--danger">Sudda</button>
        <button type="submit" class="db-btn">Spara</button>
      </div>

    </form>
  </div>
`,traits:`
  <h1 class="app-title">EGENSKAPER</h1>

  <div id="activeFilters" class="tags"></div>

  <div class="db-card panel traits-hub-panel">
    <span id="traitsViewTitle" class="db-sr-only">Karaktärsdrag</span>
    <span id="charName" class="db-sr-only" aria-live="polite"></span>

    <div class="db-tabs traits-tabs-shell">
      <nav class="db-tabs__list traits-tabs" aria-label="Egenskapsnavigering" role="tablist">
        <a id="traitsTabTraits" class="db-tabs__tab traits-tab active" href="#tab-traits" data-traits-tab="traits" role="tab" aria-controls="traitsTabPanel" aria-selected="true" aria-current="page">Karaktärsdrag</a>
        <a id="traitsTabSummary" class="db-tabs__tab traits-tab" href="#tab-summary" data-traits-tab="summary" role="tab" aria-controls="summaryTabPanel" aria-selected="false" tabindex="-1">Översikt</a>
        <a id="traitsTabEffects" class="db-tabs__tab traits-tab" href="#tab-effects" data-traits-tab="effects" role="tab" aria-controls="effectsTabPanel" aria-selected="false" tabindex="-1">Effekter</a>
      </nav>

      <div class="db-card__body traits-tab-panels">
        <section id="traitsTabPanel" class="db-tabs__panel traits-tab-panel traits-content summary-content active" data-tab-panel="traits" role="tabpanel" aria-labelledby="traitsTabTraits">
        <section class="summary-section trait-xp-section">
          <div id="xpSummary" class="trait-xp-summary">
            <div class="trait-xp-header">
              <span class="trait-xp-title">Erfarenhet</span>
              <div class="xp-control trait-xp-buttons">
                <button id="xpMinus" class="db-btn db-btn--icon icon-only" type="button" aria-label="Minska XP" title="Minska XP">
                  <img src="icons/minus.svg" alt="" class="btn-icon" width="32" height="32">
                </button>
                <input id="xpInput" type="number" min="0" value="0" aria-label="Totala erfarenhetspoäng">
                <button id="xpPlus" class="db-btn db-btn--icon icon-only" type="button" aria-label="Öka XP" title="Öka XP">
                  <img src="icons/plus.svg" alt="" class="btn-icon" width="32" height="32">
                </button>
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
            <div class="traits-total-row">
              <button id="defenseCalcBtn" class="db-btn db-btn--icon defense-action-btn" type="button" data-action="open-defense-calc">
                <img src="icons/forsvar.svg" alt="" class="btn-icon" width="24" height="24">
                <span>Beräkna försvar</span>
              </button>
              <div class="traits-total" role="status">
                Karaktärsdrag: <span id="traitsTotal">0</span> / <span id="traitsMax">0</span>
              </div>
              <button id="resetTraits" class="db-btn db-btn--icon db-btn--icon-only db-btn--danger traits-reset-btn" title="Återställ basegenskaper" aria-label="Återställ basegenskaper">
                <img src="icons/broom.svg" alt="" class="btn-icon" width="32" height="32">
              </button>
            </div>
            <div id="traitStats" class="trait-extra-meta" aria-live="polite"></div>
          </div>
          <div id="traits" class="traits-grid traits"></div>
        </section>
        </section>

        <section id="summaryTabPanel" class="db-tabs__panel traits-tab-panel summary-panel summary-content" data-tab-panel="summary" role="tabpanel" aria-labelledby="traitsTabSummary" hidden>
          <div id="summaryContent" class="summary-content"></div>
        </section>

        <section id="effectsTabPanel" class="db-tabs__panel traits-tab-panel effects-panel summary-content" data-tab-panel="effects" role="tabpanel" aria-labelledby="traitsTabEffects" hidden>
          <div id="effectsContent" class="summary-content"></div>
        </section>
      </div>
    </div>
  </div>
`}),H=["js/auto-resize.js","js/text-format.js","js/catalog-schema.js","js/utils.js","js/rules-helper.js","js/store.js"],J=["js/snapshot-helper.js","js/popup-ui.js","js/tools-popup-shell.js","js/inventory-popup-registry.js","js/inventory-utils.js","js/traits-utils.js","js/popup-manager.js","js/shared-toolbar.js","js/yrke-panel.js","js/elite-utils.js","js/elite-req.js","js/entry-card.js","js/entry-card-builder.js","js/choice-popup.js","js/requirement-popup.js","js/exceptionellt.js","js/djurmask.js","js/beastform.js","js/kraftval.js","js/artifact-payment.js","js/bloodbond.js","js/monsterlard.js"],C=Object.freeze({index:["js/entry-xp.js","js/index-view.js","js/elite-add.js"],character:["js/entry-xp.js","js/character-view.js"],inventory:["js/inventory-view.js"],notes:["js/notes-view.js"],traits:["js/summary-effects.js"]}),Z=["js/main.js"],_=new Map,E=new Set;let h=null,g=null,j=null;function G(t="index"){const a=String(t||"").trim().toLowerCase();return a==="summary"||a==="effects"?"traits":C[a]?a:"index"}const X=t=>new URL(t,document.baseURI).href;function f(t){const a=X(t),s=_.get(a);if(s)return s;const n=new Promise((l,c)=>{const e=document.createElement("script");e.src=t,e.async=!1,e.addEventListener("load",l,{once:!0}),e.addEventListener("error",()=>{c(new Error(`Failed to load script: ${t}`))},{once:!0}),document.head.appendChild(e)});return _.set(a,n),n}async function x(t=[]){for(const a of t)await f(a)}function I(){return h||(h=x([...H,...J])),h}async function O(t="index"){const a=G(t);if(await I(),E.has(a))return;const s=C[a]||[];await x(s),E.add(a)}function W(){return g||(g=x(Z)),g}async function na(t="index"){await I(),await O(t),await W()}async function Q(){return window.JSZip?window.JSZip:(j||(j=F(()=>import("./jszip.min-D7KnG0-e.js").then(t=>t.j),[]).then(t=>{const a=t?.default||t?.JSZip||t;return window.JSZip=a,a})),j)}async function Y(){return await f("js/character-generator.js"),window.symbaroumGenerator||null}async function P(){return await f("js/tabell-popup.js"),window.tabellPopup||null}async function aa(){return await f("js/pdf-library.js"),window.pdfLibrary||null}function ia(t,a){const s=()=>{const c=document.querySelector("shared-toolbar")?.shadowRoot;if(!c)return!1;const e=c.getElementById(t);return!e||e.dataset.lazyScriptBound==="1"?!!e:(e.dataset.lazyScriptBound="1",e.addEventListener("click",async i=>{if(e.dataset.lazyScriptReady==="1")return;i.preventDefault(),i.stopImmediatePropagation();const y=e.disabled;e.disabled=!0;try{await a(),e.dataset.lazyScriptReady="1"}catch(r){console.error(r)}finally{e.disabled=y}e.dataset.lazyScriptReady==="1"&&e.click()},{capture:!0}),!0)};if(s())return;const n=document.querySelector("shared-toolbar");n&&n.addEventListener("toolbar-rendered",s)}function ra(){window.ensureScript=f,window.ensureRouteScripts=O,window.ensureJsZip=Q,window.ensureCharacterGenerator=Y,window.ensureTabellPopup=P,window.ensurePdfLibrary=aa,window.openTablePopup=async(t,a)=>(await P(),window.tabellPopup?.open?.(t,a)||null)}export{sa as V,F as _,aa as a,ia as b,O as c,ra as e,ea as g,na as l,G as n,ta as r};
