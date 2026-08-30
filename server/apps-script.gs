/**
 * WonderStats — relais de synchronisation (Google Apps Script)
 *
 * Même contrat que server/worker.js : un jeton détermine ce que son
 * porteur peut lire et écrire. C'est le seul endroit du système où une
 * autorisation est réellement vérifiée (voir ROLES.md § 4).
 *
 * Déploiement (gratuit) :
 *   1. Google Drive → Nouveau → Google Sheets, classeur vide.
 *   2. Extensions → Apps Script, coller ce fichier.
 *   3. Déployer → Nouveau déploiement → Application web
 *        · Exécuter en tant que : moi   · Qui a accès : tout le monde
 *   4. Copier l'URL /exec dans WonderStats → Administration → Relais.
 *
 * L'application envoie ses corps en text/plain, ce qui évite la requête
 * préliminaire CORS qu'Apps Script ne sait pas traiter.
 */

var ITEMS = 'items';
var GRANTS = 'grants';
var MAX_ITEMS = 500;
var ROOM_RE = /^[A-Za-z0-9_-]{4,64}$/;
var TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;
var KINDS = ['packet', 'catalog', 'submission'];

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); }
  return sh;
}
function itemsSheet_() { return sheet_(ITEMS, ['room', 'teamId', 'kind', 'id', 'at', 'to', 'by', 'payload']); }
function grantsSheet_() { return sheet_(GRANTS, ['room', 'token', 'name', 'role', 'teamId', 'teamName', 'at']); }

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(m) { return out_({ ok: false, error: m }); }

function findGrant_(room, token) {
  var rows = grantsSheet_().getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === room && String(rows[i][1]) === String(token)) {
      return { row: i + 1, grant: { token: String(rows[i][1]), name: rows[i][2], role: rows[i][3],
        teamId: String(rows[i][4] || ''), teamName: rows[i][5] } };
    }
  }
  return null;
}
function ownerOf_(room) {
  var rows = grantsSheet_().getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === room && rows[i][3] === 'admin') return String(rows[i][1]);
  return null;
}

/* Le premier jeton présenté sur un salon vierge en devient propriétaire. */
function resolve_(room, token) {
  if (!ROOM_RE.test(room || '')) return { error: 'Code de salon invalide' };
  if (!TOKEN_RE.test(token || '')) return { error: 'Jeton invalide' };
  var owner = ownerOf_(room);
  if (!owner) {
    grantsSheet_().appendRow([room, token, 'Administrateur', 'admin', '', '', new Date().toISOString()]);
    return { grant: { token: token, name: 'Administrateur', role: 'admin', teamId: '', teamName: '' }, isOwner: true };
  }
  var f = findGrant_(room, token);
  if (!f) return { error: 'Jeton inconnu ou révoqué' };
  return { grant: f.grant, isOwner: (owner === String(token)) };
}

function mayPublish_(g, isOwner, kind, teamId) {
  if (isOwner || g.role === 'admin') return true;
  if (g.teamId && g.teamId !== teamId) return false;
  if (g.role === 'coach') return kind === 'packet' || kind === 'catalog';
  if (g.role === 'selector') return kind === 'submission';
  return false;
}
function mayRead_(g, isOwner, rec) {
  if (isOwner || g.role === 'admin') return true;
  if (g.teamId && rec.teamId && g.teamId !== rec.teamId) return false;
  if (g.role === 'coach') return rec.kind === 'submission' || (rec.by && rec.by.token === g.token);
  if (g.role === 'selector') {
    if (rec.kind === 'submission') return false;    // garantie centrale
    if (rec.to) return rec.to === g.token;
    return true;
  }
  return false;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';

  if (action === 'ping') {
    if (!ROOM_RE.test(p.room || '')) return fail_('Code de salon invalide');
    return out_({ ok: true, room: p.room, at: new Date().toISOString() });
  }

  if (action === 'whoami' || action === 'list') {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var r = resolve_(p.room, p.token);
      if (r.error) return fail_(r.error);
      if (action === 'whoami') return out_({ ok: true, grant: r.grant, isOwner: r.isOwner });

      if (KINDS.indexOf(p.kind) === -1) return fail_('Type inconnu');
      var rows = itemsSheet_().getDataRange().getValues();
      var items = [];
      for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        if (row[0] !== p.room || row[2] !== p.kind) continue;
        var at = String(row[4]);
        if (p.since && at <= p.since) continue;
        var payload, by;
        try { payload = JSON.parse(row[7]); by = row[6] ? JSON.parse(row[6]) : null; } catch (err) { continue; }
        var rec = { id: String(row[3]), kind: row[2], teamId: String(row[1] || ''), at: at,
          to: String(row[5] || ''), by: by, payload: payload };
        if (!mayRead_(r.grant, r.isOwner, rec)) continue;
        items.push(rec);
      }
      items.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
      return out_({ ok: true, items: items.slice(-MAX_ITEMS) });
    } finally { lock.releaseLock(); }
  }
  return fail_('Action inconnue — attendu ping, whoami ou list');
}

function doPost(e) {
  var url = (e && e.parameter) || {};
  var action = url.action || '';
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return fail_('JSON invalide'); }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var r = resolve_(body.room, body.token);
    if (r.error) return fail_(r.error);

    if (action === 'grant') {
      var g = body.grant || {};
      if (!TOKEN_RE.test(g.token || '')) return fail_('Jeton cible invalide');
      if (['admin', 'coach', 'selector'].indexOf(g.role) === -1) return fail_('Rôle inconnu');
      if (!r.isOwner && r.grant.role !== 'admin') {
        if (r.grant.role !== 'coach') return fail_("Émission réservée à l'entraîneur ou à l'administrateur");
        if (g.role === 'admin') return fail_("Un entraîneur ne peut pas nommer d'administrateur");
        if (String(g.teamId || '') !== r.grant.teamId) return fail_('Émission limitée à votre équipe');
      }
      var at = new Date().toISOString();
      var existing = findGrant_(body.room, g.token);
      var sh = grantsSheet_();
      if (existing) {
        sh.getRange(existing.row, 3, 1, 5).setValues([[g.name || '', g.role, g.teamId || '', g.teamName || '', at]]);
      } else {
        sh.appendRow([body.room, g.token, g.name || '', g.role, g.teamId || '', g.teamName || '', at]);
      }
      return out_({ ok: true, grant: { token: g.token, name: g.name, role: g.role,
        teamId: g.teamId || '', teamName: g.teamName || '', at: at } });
    }

    if (action === 'revoke') {
      if (!r.isOwner && r.grant.role !== 'admin') return fail_("Révocation réservée à l'administrateur");
      var target = body.target || '';
      if (!TOKEN_RE.test(target)) return fail_('Jeton cible invalide');
      if (ownerOf_(body.room) === String(target)) return fail_('Le jeton propriétaire ne peut pas être révoqué');
      var f = findGrant_(body.room, target);
      if (f) grantsSheet_().deleteRow(f.row);
      return out_({ ok: true, revoked: target });
    }

    if (action === 'publish') {
      var kind = body.kind, id = body.id, payload = body.payload, teamId = String(body.teamId || '');
      if (KINDS.indexOf(kind) === -1) return fail_('Type inconnu');
      if (!id || String(id).length > 128) return fail_('Identifiant invalide');
      if (!payload || typeof payload !== 'object') return fail_('Contenu manquant');
      if (!mayPublish_(r.grant, r.isOwner, kind, teamId)) return fail_("Ce jeton n'a pas le droit de déposer ceci");

      var now = new Date().toISOString();
      var byJson = JSON.stringify({ token: r.grant.token, name: r.grant.name, role: r.grant.role });
      var serialized = JSON.stringify(payload);
      var ish = itemsSheet_(), rows = ish.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === body.room && rows[i][2] === kind && String(rows[i][3]) === String(id)) {
          ish.getRange(i + 1, 5, 1, 4).setValues([[now, String(body.to || ''), byJson, serialized]]);
          return out_({ ok: true, id: id, at: now });
        }
      }
      ish.appendRow([body.room, teamId, kind, id, now, String(body.to || ''), byJson, serialized]);
      return out_({ ok: true, id: id, at: now });
    }

    return fail_('Action inconnue — attendu publish, grant ou revoke');
  } finally { lock.releaseLock(); }
}
