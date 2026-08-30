/**
 * WonderStats — relais de synchronisation (Cloudflare Worker)
 *
 * Le relais est le SEUL endroit du système où une autorisation est
 * réellement vérifiée. Sur les appareils, les rôles ne sont qu'un cadrage
 * ergonomique — voir ROLES.md § 4. Ici, un jeton détermine ce que son
 * porteur peut lire et écrire, et rien d'autre ne passe.
 *
 * Trois garanties tenues :
 *   · un sélectionneur ne lit jamais les soumissions de qui que ce soit ;
 *   · une vue nominativement adressée n'est lisible que par son destinataire ;
 *   · une soumission porte l'identité de son jeton, estampillée ici, et
 *     non un nom saisi à la main.
 *
 * Déploiement (gratuit, sans carte bancaire) :
 *   1. npm install -g wrangler && wrangler login
 *   2. wrangler kv namespace create WONDERSTATS
 *   3. reporter l'id retourné dans wrangler.toml
 *   4. wrangler deploy
 *
 * Contrat HTTP : voir server/README.md
 */

const TTL_SECONDS = 60 * 60 * 24 * 120;   // 120 jours
const MAX_BODY = 512 * 1024;
const MAX_ITEMS = 500;
const ROOM_RE = /^[A-Za-z0-9_-]{4,64}$/;
const TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;
const KINDS = ["packet", "catalog", "submission"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json;charset=utf-8", ...CORS }
  });
}
const fail = (msg, status = 400) => json({ ok: false, error: msg }, status);

const ownerKey = (room) => `${room}/_owner`;
const grantKey = (room, token) => `${room}/_grant/${token}`;
const itemKey = (room, teamId, kind, id) => `${room}/item/${teamId || "_"}/${kind}/${id}`;

/**
 * Résout le porteur d'un jeton. Le premier jeton présenté sur un salon
 * vierge en devient le propriétaire : c'est l'amorçage, il n'y a personne
 * d'autre pour l'autoriser.
 */
async function resolve(env, room, token) {
  if (!ROOM_RE.test(room)) return { error: "Code de salon invalide" };
  if (!TOKEN_RE.test(token)) return { error: "Jeton invalide" };

  const owner = await env.WONDERSTATS.get(ownerKey(room));
  if (!owner) {
    await env.WONDERSTATS.put(ownerKey(room), token, { expirationTtl: TTL_SECONDS });
    const g = { token, name: "Administrateur", role: "admin", teamId: "", teamName: "" };
    await env.WONDERSTATS.put(grantKey(room, token), JSON.stringify(g), { expirationTtl: TTL_SECONDS });
    return { grant: g, isOwner: true };
  }
  if (owner === token) {
    const raw = await env.WONDERSTATS.get(grantKey(room, token));
    const g = raw ? JSON.parse(raw) : { token, name: "Administrateur", role: "admin", teamId: "", teamName: "" };
    return { grant: g, isOwner: true };
  }
  const raw = await env.WONDERSTATS.get(grantKey(room, token));
  if (!raw) return { error: "Jeton inconnu ou révoqué" };
  return { grant: JSON.parse(raw), isOwner: false };
}

/** Le porteur peut-il déposer ce type pour cette équipe ? */
function mayPublish(grant, isOwner, kind, teamId) {
  if (isOwner || grant.role === "admin") return true;
  if (grant.teamId && grant.teamId !== teamId) return false;
  if (grant.role === "coach") return kind === "packet" || kind === "catalog";
  if (grant.role === "selector") return kind === "submission";
  return false;
}

/** Le porteur peut-il lire cet enregistrement ? */
function mayRead(grant, isOwner, rec) {
  if (isOwner || grant.role === "admin") return true;
  if (grant.teamId && rec.teamId && grant.teamId !== rec.teamId) return false;

  if (grant.role === "coach") {
    // L'entraîneur relève les soumissions de son équipe et retrouve ses dépôts.
    return rec.kind === "submission" || rec.by?.token === grant.token;
  }
  if (grant.role === "selector") {
    // Jamais de soumission — c'est la garantie qui fait exister ce relais.
    if (rec.kind === "submission") return false;
    // Une vue adressée n'est lisible que par son destinataire.
    if (rec.to) return rec.to === grant.token;
    return true;   // catalogues et vues diffusées à toute l'équipe
  }
  return false;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (!env.WONDERSTATS) return fail("Espace de stockage KV non lié (voir wrangler.toml)", 500);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";

    try {
      if (action === "ping") {
        const room = url.searchParams.get("room") || "";
        if (!ROOM_RE.test(room)) return fail("Code de salon invalide");
        return json({ ok: true, room, at: new Date().toISOString() });
      }

      if (action === "whoami" || action === "list") {
        const room = url.searchParams.get("room") || "";
        const token = url.searchParams.get("token") || "";
        const r = await resolve(env, room, token);
        if (r.error) return fail(r.error, 403);

        if (action === "whoami") return json({ ok: true, grant: r.grant, isOwner: r.isOwner });

        const kind = url.searchParams.get("kind") || "";
        const since = url.searchParams.get("since") || "";
        if (!KINDS.includes(kind)) return fail("Type inconnu");

        // Le préfixe restreint déjà à l'équipe quand le porteur en a une.
        const scope = (r.isOwner || r.grant.role === "admin" || !r.grant.teamId)
          ? `${room}/item/`
          : `${room}/item/${r.grant.teamId}/${kind}/`;

        const listed = await env.WONDERSTATS.list({ prefix: scope, limit: MAX_ITEMS });
        const items = [];
        for (const key of listed.keys) {
          const raw = await env.WONDERSTATS.get(key.name);
          if (!raw) continue;
          let rec;
          try { rec = JSON.parse(raw); } catch { continue; }
          if (rec.kind !== kind) continue;
          if (since && rec.at && rec.at <= since) continue;
          if (!mayRead(r.grant, r.isOwner, rec)) continue;
          items.push(rec);
        }
        items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
        return json({ ok: true, items });
      }

      if (request.method !== "POST") return fail("POST attendu", 405);
      const text = await request.text();
      if (text.length > MAX_BODY) return fail("Dépôt trop volumineux", 413);
      let body;
      try { body = JSON.parse(text); } catch { return fail("JSON invalide"); }

      const r = await resolve(env, body.room || "", body.token || "");
      if (r.error) return fail(r.error, 403);

      if (action === "grant") {
        // Seuls le propriétaire et un entraîneur peuvent émettre un jeton,
        // et l'entraîneur uniquement sur sa propre équipe.
        const g = body.grant || {};
        if (!TOKEN_RE.test(g.token || "")) return fail("Jeton cible invalide");
        if (!["admin", "coach", "selector"].includes(g.role)) return fail("Rôle inconnu");
        if (!r.isOwner && r.grant.role !== "admin") {
          if (r.grant.role !== "coach") return fail("Émission réservée à l'entraîneur ou à l'administrateur", 403);
          if (g.role === "admin") return fail("Un entraîneur ne peut pas nommer d'administrateur", 403);
          if (g.teamId !== r.grant.teamId) return fail("Émission limitée à votre équipe", 403);
        }
        const rec = {
          token: g.token, name: String(g.name || "").slice(0, 80), role: g.role,
          teamId: String(g.teamId || ""), teamName: String(g.teamName || "").slice(0, 80),
          at: new Date().toISOString()
        };
        await env.WONDERSTATS.put(grantKey(body.room, g.token), JSON.stringify(rec), { expirationTtl: TTL_SECONDS });
        return json({ ok: true, grant: rec });
      }

      if (action === "revoke") {
        const target = body.target || "";
        if (!TOKEN_RE.test(target)) return fail("Jeton cible invalide");
        if (!r.isOwner && r.grant.role !== "admin") return fail("Révocation réservée à l'administrateur", 403);
        const owner = await env.WONDERSTATS.get(ownerKey(body.room));
        if (owner === target) return fail("Le jeton propriétaire ne peut pas être révoqué", 409);
        await env.WONDERSTATS.delete(grantKey(body.room, target));
        return json({ ok: true, revoked: target });
      }

      if (action === "publish") {
        const { kind, id, payload } = body;
        const teamId = String(body.teamId || "");
        if (!KINDS.includes(kind)) return fail("Type inconnu");
        if (!id || typeof id !== "string" || id.length > 128) return fail("Identifiant invalide");
        if (!payload || typeof payload !== "object") return fail("Contenu manquant");
        if (!mayPublish(r.grant, r.isOwner, kind, teamId))
          return fail("Ce jeton n'a pas le droit de déposer ceci", 403);

        const rec = {
          id, kind, teamId, at: new Date().toISOString(),
          to: String(body.to || ""),
          // L'identité est estampillée ici, jamais fournie par l'appelant.
          by: { token: r.grant.token, name: r.grant.name, role: r.grant.role },
          payload
        };
        await env.WONDERSTATS.put(itemKey(body.room, teamId, kind, id), JSON.stringify(rec), {
          expirationTtl: TTL_SECONDS
        });
        return json({ ok: true, id, at: rec.at });
      }

      return fail("Action inconnue — attendu ping, whoami, list, publish, grant ou revoke", 404);
    } catch (err) {
      return fail("Erreur du relais : " + (err && err.message ? err.message : "inconnue"), 500);
    }
  }
};
