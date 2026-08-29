# Relais de synchronisation

Sans relais, WonderStats fonctionne entièrement hors-ligne et les sélectionneurs
échangent des fichiers `.json` avec l'entraîneur. **Le relais sert uniquement à
ce que chaque sélectionneur travaille sur son propre appareil** : l'entraîneur y
publie ses vues, les sélectionneurs y téléversent leurs soumissions.

Deux implémentations de référence sont fournies. Les deux sont gratuites et ne
demandent pas de carte bancaire — choisissez celle qui correspond à vos habitudes.

| | Cloudflare Worker | Google Apps Script |
|---|---|---|
| Compte requis | Cloudflare | Google |
| Stockage | KV, purge automatique à 120 jours | Une feuille de calcul |
| Mise en place | ligne de commande (`wrangler`) | tout dans le navigateur |
| Recommandé si | vous êtes à l'aise avec un terminal | vous préférez rester dans Drive |

---

## Option A — Cloudflare Worker

```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create WONDERSTATS   # reportez l'id dans wrangler.toml
wrangler deploy
```

Wrangler affiche une URL du type `https://wonderstats-relais.<votre-compte>.workers.dev`.

## Option B — Google Apps Script

1. Google Drive → **Nouveau → Google Sheets**, créez un classeur vide.
2. **Extensions → Apps Script**, collez le contenu de `apps-script.gs`.
3. **Déployer → Nouveau déploiement → Application web**
   · *Exécuter en tant que* : moi · *Qui a accès* : tout le monde
4. Copiez l'URL `…/exec`.

---

## Brancher l'application

Dans WonderStats, rôle entraîneur : **🎯 Sélection → Configurer**.

1. Collez l'URL du relais.
2. **🎲 Générer un code** de salon, puis **🔌 Tester**.
3. Enregistrez, puis **🔗 Lien sélectionneur** : envoyez ce lien à chaque
   sélectionneur (SMS, courriel, messagerie). En l'ouvrant sur son téléphone,
   son application se configure seule et se place en mode sélectionneur.

Ensuite : **📡 Publier** une vue côté entraîneur, **📥 Récupérer mes vues** côté
sélectionneur, **📡 Téléverser ma soumission** en retour, et **📥 Relever les
soumissions** côté entraîneur.

---

## Contrat HTTP

Tout autre serveur respectant ce contrat fait l'affaire.

```
GET  {url}?action=ping&room=CODE
     → {"ok":true,"room":"CODE","at":"2026-08-29T14:00:00.000Z"}

GET  {url}?action=list&room=CODE&kind=packet|submission&since=ISO
     → {"ok":true,"items":[{"id":"…","kind":"packet","at":"ISO","payload":{…}}]}

POST {url}?action=publish        Content-Type: text/plain;charset=utf-8
     corps {"room":"CODE","kind":"packet","id":"…","payload":{…}}
     → {"ok":true,"id":"…","at":"ISO"}
```

Contraintes attendues côté serveur : `room` sur `[A-Za-z0-9_-]{4,64}`, `kind`
limité à `packet` ou `submission`, un `id` déjà présent est **remplacé** (une vue
republiée ne s'empile pas), réponse d'erreur `{"ok":false,"error":"…"}`, et les
en-têtes CORS `Access-Control-Allow-Origin: *`.

Les corps sont envoyés en `text/plain` à dessein : cela évite la requête
préliminaire CORS qu'Apps Script ne sait pas traiter.

---

## Ce que le relais voit, et ce qu'il ne voit pas

- Une **vue anonyme** (le réglage par défaut) ne contient aucun nom : uniquement
  des identifiants opaques et des numéros de dossard. C'est également ce que
  voit le relais.
- Une **vue nominative**, que l'entraîneur active explicitement pour un bilan de
  fin de saison, contient un nom abrégé par athlète (« Léa T. »).
- Le **code de salon fait office de mot de passe partagé** : il n'y a pas de
  compte utilisateur. Toute personne qui obtient le lien peut lire les vues
  publiées et déposer des soumissions. Changez-en entre deux saisons, et ne le
  diffusez qu'à vos sélectionneurs.
- Les données restent chez **vous** : le relais est déployé sur votre propre
  compte Cloudflare ou Google.
