/**
 * Web App för JSON till/från Drive.
 * Kör som ägaren (du). Publik får ladda upp, lista, hämta. Radering bara i Drive av ägaren.
 */

const CONFIG = {
  // Din publika domän + lokalt test.
  ALLOWED_ORIGINS: ['https://nederfors.github.io', 'http://localhost:5500'],

  // Huvudroten (föräldermapp). Valfri extra koll om du bygger vidare.
  PARENT_ID: '1AxuJ4DAb_Ao7wgidQMy4QxlBnYu4gojX',

  // Barnmappar som besökare får välja. Nyckeln används i frontend.
  FOLDERS: {
    daniel: '1SmAfbN5Zz10d8pL2OKLdUgYabUJuGqwf',
    david:  '18YsMEGPZpRlP7a1ZVOak6otAJkoqvfdl',
    elin:   '1LU7vzp_7Bv79DoBFoBqk7V5378PTkr-z',
    isac:   '1lqKOZ5DDpFgwWIlwKznHdAJtqfBkTny2',
    leo:    '1ZNBvkQWtf5W_LZqlHra1PRf8_PKFnpkC',
    victor: '1dDLVpKC08-Xxgp0G6M1n3HzGU7HQRmbY'
  },

  // Begränsa storlek på uppladdade JSON-filer (bytes).
  MAX_BYTES: 600000,

  // reCAPTCHA v3 (valfritt): lägg SECRET i Script Properties med nyckeln RECAPTCHA_SECRET för att aktivera.
  RECAPTCHA_MIN_SCORE: 0.3,

  // CORS-lättnad för läsningar (GET/OPTIONS). Sätt till false om du vill låsa ner.
  OPEN_READ_CORS: true
};

function doGet(e) {
  const origin = pickAllowedOrigin_(e, 'GET');
  const action = (e && e.parameter && e.parameter.action) || 'ping';

  if (action === 'ping') {
    return json_(origin, { ok: true });
  }

  if (action === 'list') {
    const folderKey = (e.parameter && e.parameter.folderKey) || '';
    const folder = mustGetFolder_(folderKey);
    const out = [];

    const it = folder.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (f.getMimeType() === 'application/json') {
        out.push({
          id: f.getId(),
          name: f.getName(),
          size: f.getSize(),
          modified: toIsoUtc_(f.getLastUpdated())
        });
      }
    }
    out.sort((a, b) => (a.modified < b.modified ? 1 : -1));
    return json_(origin, { files: out });
  }

  if (action === 'get') {
    const fileId = (e.parameter && e.parameter.fileId) || '';
    const download = (e.parameter && e.parameter.download) || ''; // "1" => tvinga nedladdning
    if (!fileId) return error_(origin, 400, 'Missing fileId');
    const file = DriveApp.getFileById(fileId);
    if (!fileLivesInAllowedTree_(file)) return error_(origin, 403, 'File not allowed');

    const text = file.getBlob().getDataAsString('utf-8');
    // Vid nedladdning skickas Content-Disposition för att trigga "Spara som..."
    const filename = download === '1' ? safeDownloadName_(file.getName()) : null;
    return rawJson_(origin, text, filename);
  }

  return error_(origin, 400, 'Unknown action');
}

function doPost(e) {
  const origin = pickAllowedOrigin_(e, 'POST');

  if (!e || !e.parameter) return error_(origin, 400, 'No data');

  const folderKey = e.parameter.folderKey || '';
  const filenameRaw = e.parameter.filename || '';
  const jsonText = e.parameter.json || '';
  const token = e.parameter.recaptchaToken || '';

  const secret = PropertiesService.getScriptProperties().getProperty('RECAPTCHA_SECRET');
  if (secret) {
    const pass = verifyRecaptcha_(secret, token);
    if (!pass.ok || pass.score < CONFIG.RECAPTCHA_MIN_SCORE) {
      return error_(origin, 403, 'reCAPTCHA failed');
    }
  }

  const folder = mustGetFolder_(folderKey);

  if (!jsonText) return error_(origin, 400, 'Empty json');
  const bytes = Utilities.newBlob(jsonText, 'application/json').getBytes().length;
  if (bytes > CONFIG.MAX_BYTES) return error_(origin, 413, 'JSON too large');

  const filename = sanitizeFilename_(filenameRaw);
  if (!filename.endsWith('.json')) return error_(origin, 400, 'Filename must end with .json');

  const blob = Utilities.newBlob(jsonText, 'application/json', filename);
  const created = folder.createFile(blob);
  created.setDescription('Uploaded via website');

  return json_(origin, { ok: true, fileId: created.getId(), name: created.getName() });
}

/* ---------- helpers ---------- */

function mustGetFolder_(key) {
  const id = CONFIG.FOLDERS[key];
  if (!id) throw new Error('Folder key not allowed');
  return DriveApp.getFolderById(id);
}

function sanitizeFilename_(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe || ('file_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
}

function safeDownloadName_(name) {
  return String(name || 'file.json').replace(/[\r\n"]/g, '_');
}

function toIsoUtc_(d) {
  return Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

/**
 * Tillåter fil som ligger i tillåten mapp ELLER i dess underkatalog(er).
 */
function fileLivesInAllowedTree_(file) {
  const allowed = new Set(Object.values(CONFIG.FOLDERS));
  const visited = new Set();

  // Starta från alla omedelbara föräldrar
  const stack = [];
  let it = file.getParents();
  while (it.hasNext()) stack.push(it.next());

  // Vandra uppåt tills rot eller träff
  while (stack.length) {
    const folder = stack.pop();
    const id = folder.getId();
    if (allowed.has(id)) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    let gp = folder.getParents();
    while (gp.hasNext()) stack.push(gp.next());
  }
  return false;
}

/**
 * CORS-policy:
 * - Om klienten skickar ?origin= och den finns i vitlistan => eko samma.
 * - Vid GET/OPTIONS: OPEN_READ_CORS === true => '*', vilket hindrar mismatch vid nedladdning.
 * - Vid POST: eko godkänd origin om given, annars '*'. Inga cookies används, så '*' är säkert här.
 */
function pickAllowedOrigin_(e, method) {
  const p = e && e.parameter && e.parameter.origin;
  if (p && CONFIG.ALLOWED_ORIGINS.indexOf(p) !== -1) return p;

  if (method === 'GET' || method === 'OPTIONS') {
    return CONFIG.OPEN_READ_CORS ? '*' : CONFIG.ALLOWED_ORIGINS[0];
  }
  // POST
  return '*';
}

function json_(origin, obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return addCors_(origin, out);
}

function rawJson_(origin, jsonText, downloadName /* optional */) {
  const out = ContentService.createTextOutput(jsonText);
  out.setMimeType(ContentService.MimeType.JSON);
  if (downloadName) {
    out.setHeader('Content-Disposition', 'attachment; filename="' + downloadName + '"');
  }
  return addCors_(origin, out);
}

function error_(origin, httpCode, message) {
  const out = ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }));
  out.setMimeType(ContentService.MimeType.JSON);
  // ContentService kan inte sätta statuskod, vi skickar fel i kroppen.
  return addCors_(origin, out);
}

function addCors_(origin, output) {
  output.setHeader('Access-Control-Allow-Origin', origin);
  output.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  // Bred lista för att undvika preflight-problem vid olika klienter
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Requested-With, Authorization, Origin');
  // Exponera header för nedladdning
  output.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  // Låt preflighten cacheas en stund
  output.setHeader('Access-Control-Max-Age', '600');
  return output;
}

function doOptions(e) {
  // Preflight-svar med samma CORS-policy som addCors_
  const origin = pickAllowedOrigin_(e, 'OPTIONS');
  const out = ContentService.createTextOutput('');
  out.setMimeType(ContentService.MimeType.TEXT);
  return addCors_(origin, out);
}

/* ---------- reCAPTCHA ---------- */

function verifyRecaptcha_(secret, token) {
  try {
    if (!token) return { ok: false, score: 0 };
    const resp = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      payload: { secret: secret, response: token }
    });
    const data = JSON.parse(resp.getContentText() || '{}');
    return { ok: !!data.success, score: data.score || 0 };
  } catch (err) {
    return { ok: false, score: 0 };
  }
}
