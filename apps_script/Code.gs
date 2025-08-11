/**
 * Web App för JSON till/från Drive.
 * Kör som ägaren (du). Publik får ladda upp, lista, hämta. Radering bara i Drive av ägaren.
 */

const CONFIG = {
  // Din publika domän + lokalt test.
  ALLOWED_ORIGINS: ['https://nederfors.github.io', 'http://localhost:5500'],

  // Huvudroten (föräldermapp). Används för extra kontroll om du vill bygga vidare.
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
  RECAPTCHA_MIN_SCORE: 0.3
};

function doGet(e) {
  const origin = pickAllowedOrigin_();
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
          modified: toIso_(f.getLastUpdated())
        });
      }
    }
    out.sort((a, b) => (a.modified < b.modified ? 1 : -1));
    return json_(origin, { files: out });
  }

  if (action === 'get') {
    const fileId = (e.parameter && e.parameter.fileId) || '';
    if (!fileId) return error_(origin, 400, 'Missing fileId');
    const file = DriveApp.getFileById(fileId);
    if (!fileLivesInAllowedFolder_(file)) return error_(origin, 403, 'File not allowed');

    const text = file.getBlob().getDataAsString('utf-8');
    return rawJson_(origin, text);
  }

  return error_(origin, 400, 'Unknown action');
}

function doPost(e) {
  const origin = pickAllowedOrigin_();

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

function toIso_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function fileLivesInAllowedFolder_(file) {
  const allowedIds = Object.values(CONFIG.FOLDERS);
  const parents = file.getParents();
  while (parents.hasNext()) {
    const p = parents.next();
    if (allowedIds.indexOf(p.getId()) !== -1) return true;
  }
  return false;
}

function pickAllowedOrigin_() {
  // En enkel plats för ev. framtida logik. Apps Script behöver inte CORS-header här för "simple requests".
  return CONFIG.ALLOWED_ORIGINS[0];
}

function json_(origin, obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return addCors_(origin, out);
}

function rawJson_(origin, jsonText) {
  const out = ContentService.createTextOutput(jsonText);
  out.setMimeType(ContentService.MimeType.JSON);
  return addCors_(origin, out);
}

function error_(origin, httpCode, message) {
  const out = ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }));
  out.setMimeType(ContentService.MimeType.JSON);
  return addCors_(origin, out);
}

function addCors_(origin, output) {
  output.setHeader('Access-Control-Allow-Origin', origin);
  output.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

function doOptions(e) {
  var origin = e && e.parameter && e.parameter.origin ? e.parameter.origin : '*';
  return addCors_(origin, ContentService.createTextOutput(''));
}

