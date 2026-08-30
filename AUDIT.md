# Audit applicatif et fonctionnel — WonderStats

_Audit réalisé sur la version `e638e55` (index.html 791 lignes, sw.js v4, manifest v1)._

---

## 1. Portrait de l'existant

| Élément | Constat |
|---|---|
| Architecture | Application mono-fichier (`index.html`, 58 Ko) — HTML + CSS + JS vanilla ES5, sans build, sans dépendance. PWA installable (`manifest.json` + `sw.js`). |
| Rendu | `render()` reconstruit **tout** le DOM (`app.innerHTML=""`) à chaque changement d'état. Helper `h()` maison. |
| Persistance | `localStorage`, clé `vball_mt_v2`, autosave débounce 1500 ms + sauvegarde sur `beforeunload` / `visibilitychange`. |
| Modèle | `state.teams[] → {id, name, players[], sessions[], activePlayers[], subteams[]}`<br>`player → {name, number, position, stats{23 clés}}` |
| Fonctions | Effectif (CRUD + drag&drop), Saisie (mode rapide / mode grille), Récap (session / global), Sessions (sauvegarde, chargement, suppression), Export/Import JSON, Undo (50 niveaux), sous-équipes, sélection « sur le terrain ». |
| Statistiques | 7 groupes (Services, Réception, Passes, Attaques, Blocs, Défense, Habiletés) → 23 compteurs. 5 vues de saisie prédéfinies. |

**Points forts à préserver :** zéro dépendance, fonctionnement hors-ligne total, saisie tactile très rapide (bouton 44–56 px), undo, export/import, responsive téléphone → iPad.

---

## 2. Défauts identifiés

### 2.1 Critiques — intégrité des données

| # | Problème | Impact |
|---|---|---|
| **A1** | **L'identité d'une joueuse est un index de tableau.** `team.activePlayers` et `subteams[].playerIndices` stockent des `int`. Chaque réordonnancement ou suppression exige un remappage manuel (`remapIndices`, `onPlayerDelete`). | Un seul chemin de code oublié (import, chargement de session, édition concurrente) corrompt silencieusement les compositions et les sous-équipes. |
| **A2** | **Le cumul global fusionne sur `nom#numéro`.** `computeGlobalPlayers()` construit sa clé à partir du nom + numéro. | Changer un numéro de maillot ou corriger une faute de frappe **scinde l'historique** de la joueuse en deux entrées. Changement de nom = perte totale de l'historique. |
| **A3** | **« Charger » une session écrase l'effectif courant sans confirmation** (`team.players=clone(s.players)`). | Perte immédiate et irréversible d'une saisie de match en cours. L'undo ne couvre pas ce cas (aucun `pushUndo`). |
| **A4** | Les sessions stockent une **copie complète** des joueuses, sans lien vers l'effectif. | Aucune traçabilité : impossible de savoir qu'une ligne de session correspond à une joueuse encore active. |
| **A5** | Aucune contrainte d'**unicité du numéro de maillot**. | Deux `#7` rendent tout affichage par numéro ambigu — bloquant pour une saisie « à l'aveugle ». |

### 2.2 Majeurs — expérience utilisateur

| # | Problème | Impact |
|---|---|---|
| **B1** | `window.addEventListener("resize", render)` | À l'ouverture du clavier virtuel (iOS/Android déclenchent `resize`), le DOM est reconstruit → **perte du focus et de la position du curseur** en pleine saisie de nom. |
| **B2** | `showToast()` appelle `render()` deux fois (immédiat + 2,5 s). | Même effet : un toast pendant la frappe éjecte l'utilisateur du champ. |
| **B3** | Re-render intégral pour chaque incrément de stat, avec sauvegarde/restauration de scroll en `requestAnimationFrame`. | Micro-saccades sur iPad ancien ; la restauration de scroll échoue quand `scrollTop === 0` (test `if(scrollPositions[key])` — falsy sur 0). |
| **B4** | `confirm()` / `alert()` natifs mêlés à des modales maison. | Incohérence visuelle ; `confirm()` est bloqué dans certains contextes PWA standalone. |
| **B5** | Aucune indication de duplication ni de validation à la saisie d'effectif. | Erreurs silencieuses. |

### 2.3 Mineurs — qualité de code

| # | Problème |
|---|---|
| **C1** | `state.editingSubteamId` utilisé mais absent de l'objet `state` initial. |
| **C2** | `var tm` déclaré deux fois dans la même portée de fonction (`renderModal`). |
| **C3** | `sw.js` : stratégie *network-first* qui met en cache **toutes** les requêtes, y compris non-`GET` → `cache.put()` lève une exception non gérée (rejet de promesse silencieux). |
| **C4** | `sw.js` : `location.reload()` automatique dès `statechange === "activated"` → **rechargement en pleine saisie** si une mise à jour est déployée. |
| **C5** | Tous les `catch(e){}` sont vides — aucune remontée d'erreur en cas de quota `localStorage` dépassé. |
| **C6** | `Object.fromEntries` (ES2019) — exclut Safari < 12.2 (iPad de prêt / club). |
| **C7** | Aucun test, aucun linter, aucune version affichée dans l'UI. |

### 2.4 Sécurité

Aucune faille : tout le texte passe par `document.createTextNode`, aucun `innerHTML` avec données utilisateur, aucun réseau sortant. L'import JSON est le seul vecteur d'entrée et n'est pas évalué comme du code.

---

## 3. Manques fonctionnels au regard du besoin

| Besoin exprimé | État avant |
|---|---|
| Base de données de joueuses indépendante des équipes | **Absent** — les joueuses n'existent qu'à l'intérieur d'une équipe |
| Notion de **saison** | **Absent** |
| Processus de **sélection** (retenir / recaller / couper) | **Absent** |
| **Vues sélectionneur** (sous-ensembles évaluables de la base) | **Absent** (les « sous-équipes » sont un simple filtre d'affichage, sans évaluation ni soumission) |
| Évaluation qualitative (critères notés) | **Absent** — uniquement des compteurs quantitatifs |
| **Soumission** des données par un sélectionneur | **Absent** |
| **Compilation multi-évaluateurs** par joueuse | **Absent** |
| Anonymat par numéro d'athlète | **Absent** — le nom est affiché partout |

---

## 4. Remodélisation retenue (v3)

### 4.1 Nouveau modèle de données

```
DB (clé localStorage: wonderstats_v3)
├─ players[]            ← BASE DE DONNÉES CENTRALE, identité stable (id)
│    {id, firstName, lastName, birthYear, notes, archived}
└─ seasons[]
     {id, name, createdAt, archived,
      roster[]          ← convocation : lien saison ↔ joueuse
        {playerId, number, position, status, note}
              status ∈ candidate | recalled | selected | cut
      teams[]           ← équipes de la saison
        {id, name, playerIds[], lineup[], subteams[], stats{playerId→stats}, sessions[]}
      selectorViews[]   ← vues sélectionneur
        {id, name, selectorName, playerIds[], criteria[], data{playerId→{stats,ratings,reco,note}}, submittedAt}
      submissions[]     ← soumissions figées (immuables)
        {id, viewId, viewName, selectorName, submittedAt, entries[{playerId, number, stats, ratings, reco, note}]}
     }
```

**Corrections structurelles apportées :**

- **A1 corrigé** — toute référence à une joueuse est un `playerId` opaque et stable. `remapIndices` / `onPlayerDelete` supprimés : réordonner ou supprimer ne peut plus corrompre les compositions.
- **A2 corrigé** — le cumul global agrège par `playerId`. Renommer une joueuse ou changer son numéro préserve intégralement son historique.
- **A3 corrigé** — le chargement d'une session demande confirmation et empile un `undo`.
- **A4 corrigé** — chaque entrée de session porte `playerId` + un instantané (`name`, `number`, `position`) pour l'affichage historique.
- **A5 corrigé** — unicité du numéro validée par saison, doublons signalés en rouge, création de vue sélectionneur bloquée tant qu'un doublon subsiste.
- **B1/B2 corrigés** — `resize` débounce + ignoré si un champ a le focus ; le toast est injecté/retiré du DOM sans re-render.
- **B3 corrigé** — restauration de scroll avec test `!= null`.
- **C1→C6 corrigés** — état déclaré exhaustivement, `sw.js` réécrit (cache-first sur l'app-shell, `GET` uniquement, mise à jour non intrusive), `Object.fromEntries` remplacé, erreurs de quota remontées à l'utilisateur.

### 4.2 Nouveaux flux fonctionnels

**Saison** — création (vierge, ou en reprenant l'effectif de la saison précédente), activation, archivage. Toutes les données (roster, équipes, vues, soumissions) sont portées par la saison.

**Sélection** — tableau de sélection listant les convoquées avec leur score compilé ; boutons `✅ Retenir` / `🔁 Recaller` / `⛔ Non retenue` ; les joueuses **retenues** alimentent automatiquement l'équipe de la saison.

**Vues sélectionneur** — le coach crée une vue, coche N joueuses de la base (une joueuse peut appartenir à autant de vues que nécessaire), choisit les critères et les groupes de statistiques. La vue est utilisable :
- *sur le même appareil* — bascule de rôle « Sélectionneur » ;
- *sur un autre appareil* — export d'un **paquet sélectionneur** (JSON ne contenant **que les numéros**, aucun nom), importé par le sélectionneur, qui renvoie un fichier de **soumission**.

**Anonymat** — en rôle Sélectionneur, l'interface est construite exclusivement à partir des couples `{playerId, number}`. Le nom n'est jamais lu ni rendu ; le paquet exporté ne le contient pas.

**Compilation** — pour chaque joueuse : somme des statistiques soumises, moyenne / min / max par critère, score global, décompte des recommandations, notes qualitatives attribuées. Restitué dans la **vue entraîneur** (onglet Récap → Évaluations) et injecté dans le tableau de sélection.

---

## 5. Audit du workflow de saison (second passage)

Une fois la v3 en place, le parcours complet — de l'ouverture d'une saison au bilan
de fin d'année — a été retracé dans le code. Dix constats, tous corrigés depuis.

| Réf | Constat | Gravité | Correction |
|---|---|---|---|
| **A1** | `compileSubmissions` moyennait **toutes** les soumissions d'une saison, sans axe temporel. Une joueuse notée 2,5 en sélection et 4,5 en mai affichait 3,5. | Bloquant | Notion de **campagne** portée par la saison ; chaque vue et chaque soumission y sont rattachées ; `compileSubmissions(season, campaignId)` filtre ; écran **Progression** comparant deux campagnes critère par critère. |
| **A2** | `submitLocalView` ne réinitialisait pas `view.data` : rouvrir en mai la vue d'août présentait des notes déjà cochées, resoumises comme neuves. | Bloquant | Une vue appartient à une campagne et n'est jamais réutilisée. **🔁 Réévaluer** crée une copie **vierge** dans la campagne cible. |
| **A3** | Le champ `archived` existait, était affiché, mais **rien ne l'écrivait**. | Majeur | Clôture réversible de saison **et** de campagne ; les vues concernées disparaissent du rôle sélectionneur et les soumissions sont refusées. |
| **A4** | Une saison ne portait qu'un nom. | Majeur | Catégorie, dates de début et de fin, objectifs ; modifiables après coup. |
| **A5** | Le cumul de match et les évaluations ne se rejoignaient sur aucun écran. | Majeur | **Fiche joueuse de saison** : cumul toutes équipes, évaluations campagne par campagne avec l'écart, commentaires signés, note de l'entraîneur. |
| **A6** | `candidate / recalled / selected / cut` ne décrivait qu'une sélection. Une joueuse partant en janvier ne pouvait être qu'« écartée ». | Majeur | Statut d'**effectif** distinct : active / blessée / partie. Elle reste *Retenue*, garde ses matchs et son cumul, sort simplement du terrain. |
| **A7** | L'anonymat s'appliquait même quand l'entraîneur évalue sa propre équipe. | À arbitrer | Réglage **par vue**. Anonyme par défaut ; en mode nominatif seul un libellé court (« Léa T. ») accompagne le numéro. |
| **A8** | Une soumission n'était rattachée à aucun match. | Mineur | Champ **contexte** libre sur la vue (« Match vs Lions, 12 nov. »), repris dans la soumission. |
| **A9** | Le choix des athlètes d'une vue n'affichait pas leur statut. | Mineur | Badge de statut dans la liste, plus des raccourcis *L'équipe / Toutes / Aucune*. |
| **A10** | `computeGlobalPlayers` additionnait toutes les sessions. | Mineur | Filtre de période sur le cumul : toute la saison, 3, 5 ou 10 derniers matchs. |

## 6. Évolutions de la même passe

**Numéros d'athlète saisis à la main.** L'attribution automatique (`suggestNumber`)
est supprimée de tous les chemins : création de fiche, ajout en lot, convocation
unitaire ou en lot. Le numéro est un champ de la fiche joueuse, facultatif à la
création, refusé s'il est déjà pris, et **modifiable à tout moment** dans la case
de gauche du tableau de sélection. Les joueuses sans numéro sont signalées en
rouge et bloquent la publication d'une vue.

**Sélectionneurs sur leur propre appareil.** Une couche de synchronisation HTTP
minimale (`publish` / `list` / `ping`) permet à l'entraîneur de publier ses vues
et aux sélectionneurs de les récupérer puis de téléverser leurs soumissions
depuis leur propre téléphone. Un lien de partage configure l'application du
sélectionneur en un geste. Deux relais de référence gratuits sont fournis
(`server/worker.js` pour Cloudflare, `server/apps-script.gs` pour Google) ;
l'échange par fichier demeure comme repli hors-ligne, et l'anonymat tient
jusque dans ce qui transite par le relais.

## 7. Vérification

Six suites Playwright pilotent l'application réelle (`tests/run.sh`, **117 contrôles**, aucune erreur JS) :

| Suite | Ce qui est vérifié |
|---|---|
| `smoke.js` | Migration v2 → v3, navigation, stabilité de l'identité d'une joueuse (renommage **et** changement de numéro sans perte de cumul), détection des doublons. |
| `e2e.js` | Parcours complet saison → vues → évaluation → soumission → compilation → sélection → match. Anonymat contrôlé dans le DOM **et** dans le paquet exporté. Aucune référence orpheline après suppression. Aucun numéro attribué automatiquement. |
| `modals.js` | Les 17 modales s'ouvrent, se rendent et se ferment sans fuite d'état ; le numéro saisi est conservé, un doublon est refusé. |
| `campaigns.js` | A1 : 2,0 en sélection et 4,0 en fin de saison restent distincts, la progression vaut +2,0, l'écran est cloisonné. A2 : une copie de vue repart vierge. A3 : une campagne ou une saison close disparaît du rôle sélectionneur. A5, A6, A7, A10. |
| `roles.js` | La matrice des accès : Sofia cumule entraîneuse des U15 et sélectionneuse des U18, chacun ne voit que son périmètre, un contexte forgé ne survit pas au rendu, le catalogue de vue libre ne contient ni nom ni donnée superflue, l'export d'équipe n'emporte pas les collègues, et supprimer une équipe ne laisse aucune affectation orpheline. |
| `sync.js` | **Trois navigateurs isolés** contre un relais simulé conforme au contrat v2. Au-delà du parcours nominal, la suite vérifie ce que le relais **refuse** : Karl ne voit pas la vue adressée à Marie, aucun sélectionneur ne peut lister les soumissions, un sélectionneur ne peut pas publier une vue forgée, un jeton inconnu est rejeté, un jeton révoqué coupe l'accès. Plus : identité estampillée par le relais, catalogue sans nom, relais injoignable signalé. |

L'application reste sans dépendance : Playwright ne sert qu'aux tests, `index.html` demeure autonome.

## 8. Rôles, profils et accès (v4)

Un troisième passage a porté sur le modèle d'autorisation : un parcours
administrateur, des équipes durables, et un sélectionneur qui choisit lui-même
ses athlètes. L'analyse complète et la matrice des accès sont dans
[`ROLES.md`](ROLES.md) ; voici les dix constats et leur traitement.

| Réf | Constat | Gravité | Correction |
|---|---|---|---|
| **R1** | Aucune identité en base : zéro occurrence de `userId`, `account`, `login`, `password` ou `auth`. `state.role` était une bascule d'interface à deux valeurs. | Critique | Modèle `people` / `teams` / `assignments`, contexte `(rôle, équipe)` et sélecteur de contexte. **Cadrage ergonomique, pas une barrière** — c'est dit explicitement partout. |
| **R2** | Le salon du relais était un espace plat à secret partagé : `list` renvoyait tout, donc un sélectionneur pouvait lire les vues de ses collègues **et toutes les soumissions déposées**. | Critique | Contrat de relais v2 : jeton par personne, dépôts adressés, `list` filtré par jeton. Un sélectionneur ne lit plus aucune `submission`, la sienne comprise. |
| **R3** | L'équipe n'avait ni existence durable ni propriétaire, et vivait dans une saison. | Majeur | `teams[]` durable, `squads[]` pour le croisement équipe × saison. Les campagnes descendent au squad : un entraîneur mène les siennes sans affecter ses collègues. |
| **R4** | Le rôle était global là où le besoin est contextuel. | Majeur | Le rôle est une arête `(personne, équipe, rôle)`. « Entraîneur des U15 et sélectionneur des U18 » s'exprime enfin. |
| **R5** | Le sélectionneur ne pouvait rien choisir. | Majeur | Nouveau type `catalog` (numéros et postes), réglage *vue libre* par équipe, et composition d'une vue par le sélectionneur lui-même. |
| **R6** | La sauvegarde était tout-ou-rien. | Majeur | `📤 Exporter mon équipe` produit un club minuscule (une équipe, une saison, ses joueuses) ; la sauvegarde complète reste à l'administration. |
| **R7** | Le rôle sélectionneur voyait toutes les saisons locales. | Modéré | `svSources()` est cloisonné par affectation : sur un appareil partagé, chacun ne voit que ses équipes. |
| **R8** | `selectorName` était du texte libre, une soumission n'était pas attribuable. | Modéré | Le relais **estampille** l'identité du jeton (`by`), reprise à l'intégration avec le jeton d'origine. |
| **R9** | La base de joueuses n'était pas cloisonnée. | Modéré | Partiellement traité : la base reste commune au club — la cloisonner casserait l'identité stable corrigée en A2 — mais l'écriture est périmétrée et la suppression réservée à l'administration. |
| **R10** | Aucune trace des actions. | Mineur | **Non traité.** Reste ouvert. |

### Ce qui change dans le modèle

`season.teams[]` disparaît au profit de `squads[]`, indexé par `(teamId, seasonId)`.
Le squad porte le roster, l'effectif, les statistiques, les sessions, les campagnes,
les vues et les soumissions ; il embarque une copie du nom, de la catégorie et du
réglage de vue de son équipe, recalculée à chaque chargement. La migration v3 → v4
réunit les équipes homonymes de saisons différentes en une seule équipe durable,
crée un administrateur et l'affecte à toutes les équipes trouvées.

### Deux limites assumées

- **Le cloisonnement côté client n'est pas une protection.** Sur un appareil, tout
  reste modifiable depuis la console. Aucun texte d'interface ne prétend le
  contraire ; la formulation retenue est « chacun voit ce qui le concerne ».
- **Un jeton identifie, il n'authentifie pas.** Quiconque obtient un lien
  d'invitation en prend l'identité. Il est révocable, ce qui suffit à l'usage
  d'un club, et pas davantage.

## 8. Reste à considérer

- **Le code de salon n'est pas une authentification.** Quiconque obtient le lien
  peut lire les vues publiées et déposer des soumissions. Suffisant pour un club,
  insuffisant si les données devenaient sensibles.
- **Pondération des critères** : le score reste une moyenne simple. Pondérer par
  critère ou par expérience du sélectionneur est l'évolution naturelle.
- **Quota `localStorage`** : ~5 Mo, très loin des besoins ; l'échec d'écriture est
  désormais signalé à l'utilisateur au lieu d'être avalé.
