/**
 * WonderStats — relais de synchronisation (Cloudflare Worker)
 *
 * Rôle : stocker temporairement les vues publiées par l'entraîneur et les
 * soumissions déposées par les sélectionneurs, pour que chacun travaille
 * sur son propre appareil. Le relais ne comprend pas les données : il les
 * range par salon et les rend telles quelles.
 *
 * Déploiement (gratuit, sans carte bancaire) :
 *   1. npm install -g wrangler && wrangler login
 *   2. wrangler kv namespace create WONDERSTATS
 *   3. reporter l'id retourné dans wrangler.toml
 *   4. wrangler deploy
 *   5. coller l'URL obtenue dans WonderStats → Sélection → Configurer
 *
 * Contrat HTTP :
 *   GET  ?action=ping&room=CODE
 *   GET  ?action=list&room=CODE&kind=packet|submission&since=ISO
 *   POST ?action=publish        corps {room, kind, id, payload}
 */

const TTL_SECONDS = 60 * 60 * 24 * 120;   // 120 jours : au-delà, une saison est finie
const MAX_BODY = 512 * 1024;              // 512 Ko par dépôt
const MAX_ITEMS = 500;                    // par salon et par type
const ROOM_RE = /^[A-Za-z0-9_-]{4,64}$/;

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";

    if (!env.WONDERSTATS) return fail("Espace de stockage KV non lié (voir wrangler.toml)", 500);

    try {
      if (action === "ping") {
        const room = url.searchParams.get("room") || "";
        if (!ROOM_RE.test(room)) return fail("Code de salon invalide");
        return json({ ok: true, room, at: new Date().toISOString() });
      }

      if (action === "list") {
        const room = url.searchParams.get("room") || "";
        const kind = url.searchParams.get("kind") || "";
        const since = url.searchParams.get("since") || "";
        if (!ROOM_RE.test(room)) return fail("Code de salon invalide");
        if (kind !== "packet" && kind !== "submission") return fail("Type inconnu");

        const prefix = `${room}/${kind}/`;
        const listed = await env.WONDERSTATS.list({ prefix, limit: MAX_ITEMS });
        const items = [];
        for (const key of listed.keys) {
          const raw = await env.WONDERSTATS.get(key.name);
          if (!raw) continue;
          let rec;
          try { rec = JSON.parse(raw); } catch { continue; }
          if (since && rec.at && rec.at <= since) continue;
          items.push(rec);
        }
        items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
        return json({ ok: true, items });
      }

      if (action === "publish") {
        if (request.method !== "POST") return fail("POST attendu", 405);
        const text = await request.text();
        if (text.length > MAX_BODY) return fail("Dépôt trop volumineux", 413);

        let body;
        try { body = JSON.parse(text); } catch { return fail("JSON invalide"); }

        const { room, kind, id, payload } = body || {};
        if (!ROOM_RE.test(room || "")) return fail("Code de salon invalide");
        if (kind !== "packet" && kind !== "submission") return fail("Type inconnu");
        if (!id || typeof id !== "string" || id.length > 128) return fail("Identifiant invalide");
        if (!payload || typeof payload !== "object") return fail("Contenu manquant");

        const record = { id, kind, at: new Date().toISOString(), payload };
        // La clé porte l'identifiant : republier une vue la remplace au lieu de l'empiler.
        await env.WONDERSTATS.put(`${room}/${kind}/${id}`, JSON.stringify(record), {
          expirationTtl: TTL_SECONDS
        });
        return json({ ok: true, id, at: record.at });
      }

      return fail("Action inconnue — attendu ping, list ou publish", 404);
    } catch (err) {
      return fail("Erreur du relais : " + (err && err.message ? err.message : "inconnue"), 500);
    }
  }
};
