/**
 * WonderStats — relais de synchronisation (Google Apps Script)
 *
 * Alternative au Cloudflare Worker pour qui préfère rester dans son
 * compte Google. Les dépôts sont rangés dans une feuille de calcul.
 *
 * Déploiement (gratuit) :
 *   1. Google Drive → Nouveau → Google Sheets, créer un classeur vide.
 *   2. Extensions → Apps Script, coller ce fichier.
 *   3. Déployer → Nouveau déploiement → type « Application web »
 *        · Exécuter en tant que : moi
 *        · Qui a accès : tout le monde
 *   4. Copier l'URL /exec obtenue dans WonderStats → Sélection → Configurer.
 *
 * Note : l'application envoie ses corps en text/plain, ce qui évite la
 * requête préliminaire CORS qu'Apps Script ne sait pas traiter.
 */

var SHEET_NAME = 'wonderstats';
var MAX_ITEMS = 500;
var ROOM_RE = /^[A-Za-z0-9_-]{4,64}$/;

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['room', 'kind', 'id', 'at', 'payload']);
  }
  return sh;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg) { return out_({ ok: false, error: msg }); }

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';

  if (action === 'ping') {
    if (!ROOM_RE.test(p.room || '')) return fail_('Code de salon invalide');
    return out_({ ok: true, room: p.room, at: new Date().toISOString() });
  }

  if (action === 'list') {
    if (!ROOM_RE.test(p.room || '')) return fail_('Code de salon invalide');
    if (p.kind !== 'packet' && p.kind !== 'submission') return fail_('Type inconnu');

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var rows = sheet_().getDataRange().getValues();
      var items = [];
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (r[0] !== p.room || r[1] !== p.kind) continue;
        var at = String(r[3]);
        if (p.since && at <= p.since) continue;
        var payload;
        try { payload = JSON.parse(r[4]); } catch (err) { continue; }
        items.push({ id: String(r[2]), kind: p.kind, at: at, payload: payload });
      }
      items.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
      return out_({ ok: true, items: items.slice(-MAX_ITEMS) });
    } finally {
      lock.releaseLock();
    }
  }

  return fail_('Action inconnue — attendu ping ou list');
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return fail_('JSON invalide'); }

  var room = body.room, kind = body.kind, id = body.id, payload = body.payload;
  if (!ROOM_RE.test(room || '')) return fail_('Code de salon invalide');
  if (kind !== 'packet' && kind !== 'submission') return fail_('Type inconnu');
  if (!id || String(id).length > 128) return fail_('Identifiant invalide');
  if (!payload || typeof payload !== 'object') return fail_('Contenu manquant');

  var at = new Date().toISOString();
  var serialized = JSON.stringify(payload);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var rows = sh.getDataRange().getValues();
    // Republier une vue la remplace au lieu de l'empiler.
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === room && rows[i][1] === kind && String(rows[i][2]) === String(id)) {
        sh.getRange(i + 1, 4).setValue(at);
        sh.getRange(i + 1, 5).setValue(serialized);
        return out_({ ok: true, id: id, at: at });
      }
    }
    sh.appendRow([room, kind, id, at, serialized]);
    return out_({ ok: true, id: id, at: at });
  } finally {
    lock.releaseLock();
  }
}
