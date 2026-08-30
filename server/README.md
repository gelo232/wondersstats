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
| Stockage | KV, purge automatique à 120 jours | Deux feuilles : `items` et `grants` |
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

Tout autre serveur respectant ce contrat fait l'affaire. **Toute requête porte un
jeton** ; le premier jeton présenté sur un salon vierge en devient propriétaire.

```
GET  {url}?action=ping&room=CODE
GET  {url}?action=whoami&room=CODE&token=T
     → {"ok":true,"grant":{"token":"…","name":"Marie T.","role":"selector",
                            "teamId":"…","teamName":"U15 Wonders"},"isOwner":false}

GET  {url}?action=list&room=CODE&token=T&kind=packet|catalog|submission&since=ISO
     → {"ok":true,"items":[{"id":"…","kind":"packet","teamId":"…","at":"ISO",
                             "to":"…","by":{…},"payload":{…}}]}

POST {url}?action=publish   Content-Type: text/plain;charset=utf-8
     {"room":"CODE","token":"T","kind":"packet","id":"…","teamId":"…",
      "to":"jeton du destinataire (facultatif)","payload":{…}}

POST {url}?action=grant     {"room","token","grant":{token,name,role,teamId,teamName}}
POST {url}?action=revoke    {"room","token","target":"jeton à révoquer"}
```

### Autorisations à faire respecter

| Porteur | publish | list |
|---|---|---|
| propriétaire / `admin` | tout | tout |
| `coach` de T | `packet`, `catalog` sur T | les `submission` de T, et ses propres dépôts |
| `selector` de T | `submission` sur T | les `catalog` de T, et les `packet` non adressés ou qui lui sont adressés |

Trois règles font la valeur du relais — les retirer viderait le dispositif :

1. **un `selector` ne lit jamais un `submission`**, y compris le sien ;
2. un dépôt portant `to` n'est lisible que par le jeton nommé ;
3. le champ `by` est **écrit par le serveur** à partir du jeton présenté, jamais
   repris du corps de la requête.

Autres contraintes : `room` sur `[A-Za-z0-9_-]{4,64}`, `token` sur
`[A-Za-z0-9]{16,64}`, un `id` déjà présent est **remplacé** (republier une vue ne
l'empile pas), erreurs en `{"ok":false,"error":"…"}`, en-tête
`Access-Control-Allow-Origin: *`. Un `coach` ne peut émettre un jeton que sur son
équipe, et jamais un jeton `admin`.

Les corps sont envoyés en `text/plain` à dessein : cela évite la requête
préliminaire CORS qu'Apps Script ne sait pas traiter.

---

## Ce que le relais voit, et ce qu'il ne voit pas

- Une **vue anonyme** (le réglage par défaut) ne contient aucun nom : uniquement
  des identifiants opaques et des numéros de dossard. C'est également ce que
  voit le relais.
- Une **vue nominative**, que l'entraîneur active explicitement pour un bilan de
  fin de saison, contient un nom abrégé par athlète (« Léa T. »).
- Chaque personne reçoit un **jeton personnel**, émis à l'invitation et
  révocable. Le relais ne restitue à chacun que ce qui lui revient : un
  sélectionneur n'accède ni aux soumissions, ni aux vues adressées à ses
  collègues.
- **Un jeton identifie, il n'authentifie pas.** Quiconque obtient un lien
  d'invitation en prend l'identité. Révoquez-le si un appareil est perdu, et
  changez de salon entre deux saisons.
- Les données restent chez **vous** : le relais est déployé sur votre propre
  compte Cloudflare ou Google.
