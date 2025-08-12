/**
 * online-export.js
 * 
 * Användning i korthet:
 * 1) Lägg en knapp i HTML:
 *    <button id="exportOnlineBtn">Exportera online</button>
 * 
 * 2) Inkludera denna fil längst ned innan </body>:
 *    <script src="online-export.js"></script>
 * 
 * 3) Konfigurera APPS_URL om det behövs (nedan är redan din URL).
 * 
 * 4) Lägg till en hook i din app:
 *    - window.getCurrentJsonForExport = () => ({ ...din data... });
 *
 * 5) Klart. Knappen börjar fungera direkt om element med ID ovan finns.
 */

// Din Apps Script Web App URL (inkl. /exec)
const APPS_URL = 'https://script.google.com/macros/s/AKfycbwmzYExWhTHIjOzvg58n9zzmt9geHnnggBt8O2zRWbQUkmw2S22D_0jCxZMxMLtdHri/exec';

// Mappar som visas för besökare (keys matchar Apps Script CONFIG.FOLDERS)
const FOLDERS = [
  { key: 'daniel', label: 'Daniel' },
  { key: 'david',  label: 'David' },
  { key: 'elin',   label: 'Elin' },
  { key: 'isac',   label: 'Isac' },
  { key: 'leo',    label: 'Leo' },
  { key: 'victor', label: 'Victor' }
];

// Beständig anonym klientnyckel för rate limit (sparas i localStorage)
const CLIENT_KEY_STORAGE = 'jsonGatewayClientId';
function getClientKey() {
  let k = localStorage.getItem(CLIENT_KEY_STORAGE);
  if (!k) {
    // Skapa Base64-url-liknande nyckel
    const rand = crypto.getRandomValues(new Uint8Array(24));
    k = btoa(String.fromCharCode(...rand)).replace(/[+/=]/g, s => ({'+':'-','/':'_','=':''}[s]));
    localStorage.setItem(CLIENT_KEY_STORAGE, k);
  }
  return k;
}

/* -------- Modal -------- */
(function ensureModal(){
  if (document.getElementById('onlineModal')) return;
  const wrap = document.createElement('div');
  wrap.id = 'onlineModal';
  wrap.innerHTML = `
    <div class="modal-panel panel">
      <h3 id="modalTitle">Online</h3>
      <div id="modalBody"></div>
      <div class="modal-actions">
        <button id="modalCancel" type="button" class="char-btn">Avbryt</button>
        <button id="modalOk" type="button" class="char-btn">OK</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
})();

const modal = document.getElementById('onlineModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const modalOk = document.getElementById('modalOk');
const modalCancel = document.getElementById('modalCancel');

function openModal(title, bodyHTML, onOk) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHTML;
  modal.style.display = 'block';
  const okHandler = async () => {
    modalOk.removeEventListener('click', okHandler);
    modal.style.display = 'none';
    await onOk();
  };
  modalOk.addEventListener('click', okHandler);
}
modalCancel.addEventListener('click', () => (modal.style.display = 'none'));

/* -------- Hookar med standardbeteende -------- */
if (typeof window.getCurrentJsonForExport !== 'function') {
  window.getCurrentJsonForExport = () => ({ savedAt: new Date().toISOString(), data: window.myAppState || {} });
}
/* -------- Hjälpfunktioner -------- */
async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

/* -------- Export -------- */
function setupExport() {
  const btn = document.getElementById('exportOnlineBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const folderOptions = FOLDERS.map(f => `<option value="${f.key}">${f.label}</option>`).join('');
    const defaultName = `export_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    const body = `
      <label>Mapp:<br/><select id="folderPick">${folderOptions}</select></label><br/><br/>
      <label>Filnamn:<br/><input id="fileName" value="${defaultName}" style="width:100%"/></label>
      <p style="font-size:12px;opacity:.7;margin-top:8px;">Om filnamnet redan finns skrivs den över.</p>
    `;
    openModal('Exportera online', body, async () => {
      const folderKey = document.getElementById('folderPick').value;
      const fileName = document.getElementById('fileName').value.trim();

      const payload = window.getCurrentJsonForExport();
      const jsonText = JSON.stringify(payload);

      const form = new URLSearchParams();
      form.set('folderKey', folderKey);
      form.set('filename', fileName);
      form.set('json', jsonText);
      form.set('clientKey', getClientKey());

      try {
        const res = await fetch(APPS_URL, {
          method: 'POST',
          body: form
        });
        if (!res.ok) throw new Error(res.statusText);
        const data = await safeJson(res);
        if (!data || data.ok !== true) throw new Error(data && data.error ? data.error : '');
        alert(data.overwritten ? `Skrev över: ${data.name}` : `Uppladdad: ${data.name}`);
      } catch (err) {
        console.error('Uppladdning misslyckades', err);
      }
    });
  });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  setupExport();
});
