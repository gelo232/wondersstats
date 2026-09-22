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

Sept suites Playwright pilotent l'application réelle (`tests/run.sh`, **154 contrôles**, aucune erreur JS) :

| Suite | Ce qui est vérifié |
|---|---|
| `smoke.js` | Migration v2 → v3, navigation, stabilité de l'identité d'une joueuse (renommage **et** changement de numéro sans perte de cumul), détection des doublons. |
| `e2e.js` | Parcours complet saison → vues → évaluation → soumission → compilation → sélection → match. Anonymat contrôlé dans le DOM **et** dans le paquet exporté. Aucune référence orpheline après suppression. Aucun numéro attribué automatiquement. |
| `modals.js` | Les 17 modales s'ouvrent, se rendent et se ferment sans fuite d'état ; le numéro saisi est conservé, un doublon est refusé. |
| `campaigns.js` | A1 : 2,0 en sélection et 4,0 en fin de saison restent distincts, la progression vaut +2,0, l'écran est cloisonné. A2 : une copie de vue repart vierge. A3 : une campagne ou une saison close disparaît du rôle sélectionneur. A5, A6, A7, A10. |
| `roles.js` | La matrice des accès : Sofia cumule entraîneuse des U15 et sélectionneuse des U18, chacun ne voit que son périmètre, un contexte forgé ne survit pas au rendu, le catalogue de vue libre ne contient ni nom ni donnée superflue, l'export d'équipe n'emporte pas les collègues, et supprimer une équipe ne laisse aucune affectation orpheline. Le journal signe ses entrées, fige le nom de l'auteur malgré un renommage, se cloisonne par équipe et reste borné. |
| `season.js` | Une **saison entière jouée** : 19 rencontres, blessure, départ, arrivée en cours de route, trois campagnes, clôture. Vérifie ce qui doit tenir et relève ce qui manque — voir § 8. |
| `sync.js` | **Trois navigateurs isolés** contre un relais simulé conforme au contrat v2. Au-delà du parcours nominal, la suite vérifie ce que le relais **refuse** : Karl ne voit pas la vue adressée à Marie, aucun sélectionneur ne peut lister les soumissions, un sélectionneur ne peut pas publier une vue forgée, un jeton inconnu est rejeté, un jeton révoqué coupe l'accès. Plus : identité estampillée par le relais, catalogue sans nom, relais injoignable signalé. |

L'application reste sans dépendance : Playwright ne sert qu'aux tests, `index.html` demeure autonome.

## 8. Une saison complète, jouée (v4) — corrigée en v5

Quatrième passage : le parcours a été **joué** dans l'application, pas décrit.
`tests/season.js` déroule neuf mois sur une équipe U15 — sélection d'août, deux
amicaux, trois tournois, sept matchs de championnat, une blessure, un départ, une
arrivée en mars, bilan de mai, clôture.

Le passage a relevé onze observations, dont six tenaient à une seule lacune. Elles
sont **toutes corrigées** ; le tableau ci-dessous garde l'énoncé du constat, et la
section « La correction apportée » dit ce qui a été fait.

### Ce qui tient

| Épreuve | Résultat |
|---|---|
| Le cumul survit à une blessure | Léa passe *Blessée* en novembre : son total reste intact, elle sort du terrain, elle garde son statut *Retenue*. |
| Le cumul survit à un départ | Zoé quitte le club en janvier : ses 8 matchs restent au cumul et son statut de sélection n'est pas réécrit. |
| Une vue de mi-saison repart vierge | La copie de la vue d'août ne reporte aucune note (constat A2). |
| La progression tient malgré l'effectif mouvant | 3 campagnes, une recallée intégrée en janvier, une arrivante en mars : les écarts restent calculables pour celles qui ont deux points. |
| La fiche joueuse réunit les deux moitiés | 8 matchs et 3 campagnes sur un même écran (constat A5). |
| Le journal raconte la saison | 18 entrées signées : 14 décisions de sélection, 2 changements d'effectif, 1 convocation, 1 clôture. |

### Ce qui manquait — un seul concept absent

Six des onze observations tenaient à la même lacune : **la rencontre n'était pas
une entité**. Une session valait `{id, name, date, teamName, entries}` — le reste
était du texte libre dans `name`.

| Réf | Observation | Gravité |
|---|---|---|
| **S1** | Une session n'a pas de **nature** : amical, championnat et tournoi ne se distinguent que par la façon dont l'entraîneur a nommé la session. | Majeur |
| **S2** | L'**adversaire** n'est pas une donnée. « Tous nos matchs contre les Lions » n'est pas une question qu'on peut poser. | Majeur |
| **S3** | Un **tournoi n'existe pas comme unité**. Ses trois ou quatre matchs sont des sessions indépendantes ; aucun écran ne donne le tournoi en un bloc ni son cumul propre. | Majeur |
| **S4** | La **date n'est pas saisissable** : `saveSession()` écrit `nowISO()`. Un tournoi joué samedi et saisi dimanche est daté de dimanche. Les 19 sessions du parcours portent le même horodatage. | Majeur |
| **S5** | **Comparer deux tournois** demande de les reconstituer à la main, en cherchant une chaîne dans les noms. | Majeur |
| **S6** | Le **bilan de fin de saison ignore la nature des rencontres** : les 19 sessions se cumulent en un total unique. « Comment se comporte-t-elle en tournoi ? » reste sans réponse. | Majeur |
| **S7** | Le filtre de période ne connaît que le **rang** : « 3 derniers » isole le tournoi juste après l'avoir joué, puis la fenêtre glisse et il n'est plus isolable. | Modéré |
| **S8** | Aucune fenêtre entre **10 matchs et toute la saison**. « Depuis janvier », « le championnat seul », « hors tournois » ne sont pas exprimables. | Modéré |
| **S9** | Le cumul mélange des **temps de présence** très différents : Inès a joué 1 match, Léa 8, et les totaux bruts se lisent côte à côte. | Modéré |
| **S10** | **Aucun résultat** n'est enregistré — ni score, ni sets, ni victoire. L'application compte des gestes, pas des issues. | Modéré |
| **S11** | Une **arrivante n'a aucun point de comparaison** ; sa ligne de progression est vide sans que l'écran en dise la raison. | Mineur |

### La correction apportée (v5)

Les onze observations sont corrigées. S1 à S6 se referment d'un coup en donnant
une existence à la rencontre :

```
events[]   {id, kind, name, opponent, date, location, note}
               kind ∈ league | tournament | friendly | training
session    {…, eventId, day (date réelle), opponent, result:{sets[]}}
```

Un tournoi est un `event` portant plusieurs sessions ; un amical, un event à une
seule session. Chaque match garde **son propre adversaire** — dans un tournoi il
change à chaque tour, et la rencontre affiche la liste.

| Réf | Ce qui a été fait |
|---|---|
| **S1** | Quatre natures — championnat, tournoi, amical, entraînement — choisies à l'enregistrement, avec icône et couleur propres. |
| **S2** | L'adversaire est un champ, porté par le match. L'écran Rencontres et le journal le citent. |
| **S3** | Le tournoi est une unité : une carte, ses matchs, son bilan, son cumul propre en un geste (bouton 📊). |
| **S4** | La date de la rencontre est saisissable et distincte de l'horodatage de saisie. Un tournoi joué samedi et saisi dimanche reste daté de samedi. |
| **S5** | Deux tournois se comparent en basculant le filtre de rencontre ; plus rien à reconstituer à la main. |
| **S6** | Le bilan de fin de saison se décline par nature : « Champ. 5V–2D · Tournoi 7V–3D · Amical 2V–0D ». |
| **S7** | Le filtre de nature et le filtre d'événement se composent avec la fenêtre de rang : un tournoi reste isolable après coup. |
| **S8** | « Le championnat seul », « ce tournoi », « hors tournois » sont exprimables — nature et événement sont des axes de lecture. |
| **S9** | Le cumul affiche le nombre de sessions par joueuse et propose la moyenne par match, qui met sur un pied d'égalité 1 match et 8. |
| **S10** | Le score par set est saisi, l'issue en est déduite (V/D/N) et remonte au match, à la rencontre, à la nature et à la saison. |
| **S11** | Une progression vide dit sa raison : « pas d'évaluation en « X » (arrivée après / écartée avant / partie en cours de saison) ». |

La migration v4 → v5 rattache les sessions existantes : les matchs nommés
« Tournoi de Laval · match 1..3 » se regroupent sous une rencontre unique, la
nature est devinée du nom, l'adversaire extrait de « vs X », la date reprise du
plus ancien match du groupe. L'opération est idempotente. `tests/smoke.js` la
vérifie sur une base v4 fabriquée pour l'occasion.

S10 était présenté comme une décision de périmètre distincte : elle a été prise.
L'application suit désormais des issues autant que des gestes — sans quoi « bonne
en tournoi » restait une intuition invérifiable.

### Rejoué après correction

`tests/season.js` déroule la même saison avec de vraies rencontres : **19 matchs
en 12 rencontres sur 12 dates distinctes, bilan 14V–5D, 36 étapes, 0 observation
d'audit, aucune erreur JS.** Les onze ⚑ du quatrième passage sont devenus des
assertions : la suite échouerait si l'un des défauts revenait.

## 9. Rôles, profils et accès (v4)

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
| **R10** | Aucune trace des actions. | Mineur | Journal des décisions : statut de sélection, statut d'effectif, convocation et retrait, numéro, suppression d'une soumission, clôture, application des avis, affectations et jetons. Consultable par équipe (entraîneur) ou pour tout le club (administration). |

### Ce qui change dans le modèle

`season.teams[]` disparaît au profit de `squads[]`, indexé par `(teamId, seasonId)`.
Le squad porte le roster, l'effectif, les statistiques, les sessions, les campagnes,
les vues et les soumissions ; il embarque une copie du nom, de la catégorie et du
réglage de vue de son équipe, recalculée à chaque chargement. La migration v3 → v4
réunit les équipes homonymes de saisons différentes en une seule équipe durable,
crée un administrateur et l'affecte à toutes les équipes trouvées.

### Le journal (R10)

Sont enregistrés les actes qui **engagent**, pas les frappes : un statut tranché,
une soumission supprimée, une saison close. Chaque entrée fige le nom de son
auteur au moment des faits — renommer une personne ne réécrit pas son historique —
ainsi que le numéro que portait l'athlète alors. Les entrées ne sont ni
modifiables ni supprimables, les 500 dernières sont conservées, et l'export
d'équipe emporte le journal de cette équipe.

Un entraîneur ne voit que le journal de son équipe ; l'administrateur voit tout le
club. Comme le reste du cloisonnement côté client, c'est un cadrage : le journal
documente, il ne prouve pas.

### Deux limites assumées

- **Le cloisonnement côté client n'est pas une protection.** Sur un appareil, tout
  reste modifiable depuis la console. Aucun texte d'interface ne prétend le
  contraire ; la formulation retenue est « chacun voit ce qui le concerne ».
- **Un jeton identifie, il n'authentifie pas.** Quiconque obtient un lien
  d'invitation en prend l'identité. Il est révocable, ce qui suffit à l'usage
  d'un club, et pas davantage.
- **Le journal n'est pas une preuve.** Il est écrit par l'appareil qui agit, et
  reste modifiable depuis la console au même titre que le reste. Il sert à se
  souvenir, pas à établir.

## 10. Reste à considérer

- **Le code de salon n'est pas une authentification.** Quiconque obtient le lien
  peut lire les vues publiées et déposer des soumissions. Suffisant pour un club,
  insuffisant si les données devenaient sensibles.
- **Le biais d'un sélectionneur est estimé globalement, pas critère par critère.**
  La correction de sévérité se mesure sur les athlètes que plusieurs ont vues, puis
  s'applique à toutes les notes de la personne. Quand le recoupement ne porte que
  sur un critère — un coach de drill qui ne note que la Technique — le biais mesuré
  là s'applique aussi ailleurs. Il est amorti selon le nombre de recoupements, borné
  à ±1,5, et **recentré** pour ne pas déplacer le niveau général ; l'ordre s'en
  trouve peu affecté, mais la limite est réelle. Un biais par critère demanderait
  bien plus de données qu'une séance de sélection n'en produit.
- **L'échelle des statistiques est relative à la campagne.** Une efficacité est notée
  par rapport aux autres athlètes du même moment, jamais contre un barème absolu.
  C'est ce qui permet de servir une U13 et une senior sans réglage, mais cela veut
  dire qu'un score statistique n'est pas comparable d'une campagne à l'autre si les
  groupes diffèrent entièrement.
- **Quota `localStorage`** : ~5 Mo, très loin des besoins ; l'échec d'écriture est
  désormais signalé à l'utilisateur au lieu d'être avalé.


---

## Refonte v7 — ce qui a été corrigé, et ce qui restait à corriger

_Ajouté lors de la refonte du profil entraîneur (v7.0)._

### Défauts de cet audit enfin levés

| # | Constat d'origine | État |
|---|---|---|
| **B4** | `confirm()` / `alert()` natifs mêlés à des modales maison ; `confirm()` bloqué en PWA standalone | **Corrigé.** C'était le plus grave : en mode autonome la boîte n'apparaît pas et renvoie `false`, donc l'action la plus destructrice de l'application échouait **en silence**. Les 29 appels passent par une confirmation maison dont le bouton porte le verbe |
| **B5** | Aucune indication de duplication ni de validation à la saisie d'effectif | **Corrigé** depuis la v5, renforcé ici |
| **C7** | Aucun test, aucun linter, aucune version affichée | **Corrigé** : dix-huit suites Playwright, dont cinq neuves en v7 |

### Contrastes — mesurés, et sous le seuil

Relevé pendant la refonte, absent des audits précédents : `#64748B`, le gris des
libellés secondaires, est à **3,75:1** sur le fond de l'application et **3,07:1**
sur les cartes — sous le seuil AA, partout où il porte du texte. Blanc sur le vert
des boutons d'enregistrement : **2,54:1**. Corrigés, avec le passage de toute la
palette en variables CSS.

### Le piège qui aurait détruit des données

`normalizeSquad` ne normalise pas `sq.sessions` par `Object.assign` : il le
**reconstruit champ par champ en littéral**. Toute clé qu'il ne nomme pas est donc
détruite à chaque chargement, **silencieusement**. Ajouter la ventilation par set
sans étendre ce littéral aurait effacé une saison de saisie sans un message.
`sets` et `splitAt` y sont désormais nommés, et un test le vérifie
(`tests/migration.js`, invariant I13).

La même mécanique vaut pour `sq.submissions` et `sq.subteams` : tout champ ajouté à
l'une de ces trois collections doit être nommé dans son littéral.

### Défauts trouvés en construisant la v7

Cinq défauts du noyau v7 sont sortis en bâtissant la partie Sélection dessus, et un
sixième en écrivant les tests de rencontres :

1. la migration ne gardait que la première campagne : une athlète convoquée à la
   seule journée 2 était reversée dans la journée 1 **à chaque rechargement** ;
2. convoquer à une campagne ne recalculait pas le statut dérivé ;
3. retirer une athlète de la saison laissait des convocations orphelines et des
   offres en attente ;
4. supprimer une campagne n'emportait ni ses convocations ni ses offres ;
5. le registre de modales était déclaré après les écrans qui s'en servent : toute
   modale déclarée depuis une partie était effacée en silence ;
6. les scores miroirs d'un set créé en séance n'étaient pas rafraîchis, et
   « Archiver » ne pouvait pas retirer une athlète qui avait déjà accepté.

Aucun n'aurait été trouvé par relecture : tous l'ont été par un test qui comparait
un chiffre à un autre, ou par un invariant vérifié après rechargement.

### Ce qui reste ouvert

- La modale de composition d'une vue propose encore le roster de la saison plutôt
  que les convoquées de la campagne ; un raccourci « Les convoquées » y pallie.
- Le budget vertical est tendu sur un téléphone de 375 × 667 : au-dessus d'un volet
  s'empilent l'en-tête, la barre de contexte, la barre de saison, le bandeau de
  partie, la barre de campagne, les pastilles de volet, puis la barre de liste.
- Un export v7 relu par une v6 conserve les convocations, les offres et les
  objectifs, mais **perd la ventilation par set** — conséquence du littéral
  ci-dessus. La rétrocompatibilité descendante n'est donc pas promise.
- Les valeurs de départ des objectifs par catégorie d'âge sont des extrapolations,
  sauf une. Les seuils réellement utilisés se calculent sur la dispersion de
  l'équipe, ce qui rend ce barème secondaire, mais il mériterait d'être remplacé
  par des références mesurées.

---

## Audit v7.1 — ce qu'une saison entière a fait sortir

_Ajouté après `tests/saison-complete.js` : deux équipes, trois
sélectionneurs, soixante-dix athlètes, huit mois de relevés, sur une
application déjà en service._

Aucun des défauts ci-dessous n'était visible sur un geste isolé. Tous sont
apparus dans l'enchaînement, et deux d'entre eux auraient faussé des
décisions de sélection sans que personne s'en aperçoive.

| # | Défaut | Portée |
|---|---|---|
| **D1** | **Une soumission ne pouvait pas être corrigée.** Resoumettre ajoutait une observation : les notes se moyennaient, donc une note fautive survivait pour toujours dans le score. L'écran promettait pourtant le contraire. | **Critique** — un évaluateur qui se trompe faussait le classement définitivement. Le seul recours était que l'entraîneur supprime la soumission reçue, ce qu'un sélectionneur ne peut pas demander et qu'un entraîneur ne devine pas. |
| **D2** | **Retenir une athlète déjà dans l'équipe lui refabriquait une offre en attente.** | **Majeur** — une équipe de douze reconduite à la campagne suivante engendrait douze offres fantômes. L'entraîneuse voyait douze athlètes à « confirmer » alors qu'elles jouaient déjà. |
| **D3** | **La recherche de la base du club appelait `render()` à chaque frappe** — c'est-à-dire le défaut B1 de l'audit d'origine, revenu par un écran qui n'avait pas été converti. | **Majeur** sur téléphone : le clavier se referme entre deux lettres. |
| **D4** | Dans « Constituer l'équipe », un bouton grisé était la seule marque d'une offre acceptée, et les offres en attente n'étaient pas en tête de liste. | **Ergonomie** — constituer une équipe de douze demande douze gestes d'affilée ; on cherchait sa prochaine ligne à chaque fois. |
| **D5** | La place occupée sur l'appareil n'était signalée qu'**après** l'échec d'une sauvegarde. | **Majeur** — le pire moment pour l'apprendre. Mesuré : ≈ 700 Ko chiffrés par saison de deux équipes, pour un quota d'environ 5 Mo. Quatre à cinq saisons tiennent. |

Deux ajouts au composant de liste partagé sont sortis de là, et servent
partout : un **comparateur sur mesure** (ranger par naissance a trois
règles qu'une clé comparable ne sait pas exprimer) et un **ordre par
défaut** (une liste sans tri paraissait dans l'ordre de création des
fiches, ce qui ne veut rien dire pour qui la lit).

### Ce que la saison chargée a confirmé

- Rendu de 1 à 15 ms par partie sur 50 698 gestes relevés et 158 relevés,
  deux équipes. Aucun écran ne déborde à 375 px.
- La somme des sets vaut le total sur les trente-deux matchs ventilés.
- Le récap global concorde exactement avec chacune des parties dont il sort.
- La saison précédente ressort intacte : mêmes matchs, mêmes effectifs,
  même total de gestes.
- Une athlète inscrite dans deux équipes y porte deux jugements
  indépendants — écartée d'un côté, retenue de l'autre — sans que l'un
  contamine l'autre.

### D6 · Trois contrôles d'objectifs qui ne prouvaient rien

Relevé en relisant les tests plutôt que le code, à la suite d'une question
simple : « la régression est-elle réellement simulée ? »

| Contrôle | Ce qu'il asseyait vraiment |
|---|---|
| « un seul recul ne déclare rien » | Acceptait `en-cours`, `à-confirmer` **ou** `regression` : il passait même si aucun recul n'avait jamais été détecté. |
| « confirmé sur une seconde fenêtre » | Passait si l'état était seulement *à confirmer*. Ne prouvait ni le marqueur, ni le réajustement de la cible. |
| « un recul d'équipe n'est pas imputé » | Vérifiait uniquement que la fonction **renvoie un nombre**. |

Et le parcours de saison n'inscrivait **aucun** recul : les performances
simulées étaient plates, donc tout le versant descendant du recalcul
traversait la saison sans être exercé une seule fois.

Remplacés par une **trajectoire déterministe** : six athlètes identiques,
une seule dont on fait varier la forme au centième. Un écart-type d'équipe
nul fixe le pas d'objectif à sa valeur plancher, donc plus rien n'est
approximatif. On exige l'état EXACT à chaque étape : silence sous le
volume, en-cours avec sa distance, atteinte marquée et cible relevée,
premier recul non déclaré, second recul inscrit et cible redescendue au
niveau réel, puis recul collectif non imputé à l'athlète.

Deux défauts d'application en sont sortis :

- **le garde-fou d'équipe ne mesurait presque rien.** Il comparait la
  fenêtre courante à celle d'un relevé plus tôt : les deux partageaient
  presque tous leurs relevés, donc l'écart mesuré valait une fraction de
  l'écart réel et le garde-fou ne se déclenchait jamais. Il recule
  désormais d'une fenêtre entière, sans recouvrement ;
- **un objectif ne mesurait par défaut que les matchs et les tournois.**
  Une équipe de club fait cinquante séances pour dix-huit matchs : un
  objectif qui n'écoute que les matchs reste presque immobile toute la
  saison, alors que l'application promet de le recalculer à chaque relevé.
  Les entraînements entrent donc dans le périmètre par défaut ;
  l'entraîneur peut restreindre.

La saison complète inscrit maintenant cinq paliers franchis et trois
reculs notés, dont un objectif marqué en recul.

---

## Audit v7.2 — le filet de sécurité, éprouvé pour la première fois

Les audits précédents portaient sur ce que l'application **fait** : les
calculs, les statuts, les parcours. Celui-ci porte sur ce qu'elle promet
de **ne pas perdre** — sauvegarder, restaurer, annuler, verrouiller. C'est
la partie qu'aucune suite ne couvrait, et c'est là que se trouvaient les
défauts les plus coûteux : tous silencieux, tous découverts après coup.

### A. Restaurer une sauvegarde n'en restaurait qu'une partie

| # | Défaut | Ce que vivait l'utilisateur |
|---|---|---|
| **A1** | `mergeDB` n'importait **ni les clubs ni les affectations de club**. Les équipes entraient avec le `clubId` de l'appareil d'origine, inconnu ici, et `normalizeDB` les supprimait au **rechargement suivant** (`db.teams=db.teams.filter(…knownClubs…)`). | « 📥 Import terminé », les équipes apparaissent. Le lendemain, elles et tous leurs matchs ont disparu, sans un mot. |
| **A2** | `mergeDB` se terminait par `normalizeDB(DB);` — **sans reprendre le retour**. Or `normalizeDB` repart d'un objet neuf (`Object.assign(emptyDB(),db)`) : l'import n'était donc jamais normalisé. Seul des quatorze appels du fichier à l'oublier. | C'est ce qui masquait A1 : l'import paraissait réussi, la perte venait plus tard. |
| **A3** | Le remappage des identifiants oubliait toutes les collections nées avec la v7 : `campaignRoster`, `offers`, `goals`, `sessions[].sets[].entries[]`, `setMarks[].stats`, `selectorViews[].playerGroups`. | Sur un appareil qui connaissait déjà les athlètes (dédoublonnage par nom + année), l'historique de convocation se réduisait à une ligne, les offres étaient refabriquées, et un match ventilé basculait entier dans « Reste non ventilé ». |
| **A4** | `if(!squadFor(…))DB.squads.push(sq)` — une équipe-saison déjà présente était écartée **en silence**, et le toast disait « Import terminé ». | Deux entraîneurs ayant saisi des matchs différents de la même équipe : l'un importe l'export de l'autre, rien n'entre, rien ne le dit. |
| **A5** | Une fusion qui levait à mi-chemin laissait la base à moitié fondue, sans retour. `pickJSON` enveloppait la lecture ET le traitement dans le même `catch`, et disait « Fichier illisible » d'un fichier parfaitement lisible. | Base corrompue, message faux, cause invisible. |

**Corrigé.** Les clubs et leurs affectations entrent avant les équipes ; une
équipe importée est rattachée à un club d'ici avant d'être dédoublonnée ;
le remappage couvre les huit collections ; `DB=normalizeDB(DB)` ; ce qui
n'est pas repris est **nommé** à l'écran ; une fusion qui lève restaure
l'empreinte prise juste avant ; lecture et traitement ont chacun leur
message.

### B. « Sauvegardé » ne voulait pas dire écrit

Sous coffre — c'est-à-dire toujours, depuis la v5.1 — `saveAll()` est
**asynchrone** : `queueVaultWrite()` lance un chiffrement AES-GCM et rend
la main aussitôt. Or ses deux appelants enchaînaient :

```js
saveAll(); updateIndicators(false); clearOpsJournal();
```

`clearOpsJournal()` efface le journal d'opérations — **le seul filet entre
deux blocs complets** — et l'indicateur passe à « Sauvegardé », avant que
quoi que ce soit n'ait atteint le disque. Mesuré : à l'instant où
`saveNow()` rend la main, le bloc sur disque est **encore l'ancien** et le
journal est **déjà effacé**. Sur `beforeunload`, la fenêtre est certaine :
une promesse ne se résout jamais après le déchargement. Et le bouton
« Mettre à jour » faisait `saveNow(); location.reload()` — perte garantie.

**Corrigé.** `saveAll()` et `saveNow()` rendent la promesse ; le journal
n'est purgé qu'une fois l'écriture **confirmée**, jamais si elle a échoué ;
au déchargement on n'y touche pas du tout — il est ce qui survivra, et
`replayPendingOps` le rejouera ; « Mettre à jour » attend.

### C. Une base illisible était écrasée par une base vide

`loadAll` rattrapait toute exception par `catch(e){DB=emptyDB()}`, sans
distinguer « rien à lire » de « je n'ai pas su lire ». `saveAll` ne posait
aucune condition. La première bascule d'onglet écrivait la base vide
par-dessus l'originale. Toute la saison, définitivement.

**Corrigé.** `loadFailed` est posé, `saveAll` refuse d'écrire, et l'erreur
part en console au lieu d'être muette.

### D. L'annulation mentait

| # | Défaut |
|---|---|
| **D1** | `acceptOffer`, `declineOffer`, `reopenOffer`, `convokeToCampaign`, `setCampaignDecision` écrivaient `sq.playerIds`, `sq.lineup`, `sq.subteams` et `roster[].membership` **hors du Store**. Ces champs n'appartiennent à aucune collection déclarée : aucun instantané ne les prenait. Annuler « Confirmer » laissait l'athlète dans l'équipe avec une offre revenue « en attente ». |
| **D2** | `doUndo` restaurait les entités sources mais ne rappelait pas `recomputeRosterStatus` : le badge restait sur la décision annulée jusqu'au prochain rechargement. `tests/migration.js` le contournait en appelant la fonction lui-même — la trace d'un défaut connu de fait et non corrigé. |
| **D3** | `findViewAnywhere` parcourait `DB.seasons` au lieu de `DB.squads`. Les vues sont portées par le squad depuis la v4 : la boucle levait **à chaque fois**. L'annulation d'une note d'évaluateur ne faisait rien, en silence. |
| **D4** | Quatre toasts offraient « Annuler » sur un retrait de saison qui n'empilait rien : le bouton annulait l'**opération précédente** — un compteur de match, une décision de sélection. |
| **D5** | `doUndo` ne poussait aucune opération compensatoire : un rejeu du journal après plantage réappliquait ce qui venait d'être annulé. |
| **D6** | `ensureCampaignRosterEntry` créait la convocation hors du Store ; le `patch` qui suivait n'avait donc rien à rejouer, et la décision était perdue au redémarrage. |

**Corrigé.** `snapshotSquad()` prend le squad entier au début de chaque
transaction qui le remanie ; `doUndo` recalcule les statuts dérivés et
journalise l'annulation ; `findViewAnywhere` cherche dans les squads ;
`pushUndoSquad()` donne un vrai instantané aux gestes qui n'en avaient
pas ; la convocation passe par `Store.put`.

### E. Ce que la ventilation laissait passer

`reconcileSessionTotals` ne versait dans le bloc de reste que les écarts
**positifs** : un set qui compte PLUS que le match restait en trop
indéfiniment, et l'écran affichait des sets dont la somme dépasse leur
propre total. La fonction était idempotente — sur un état faux.

**Corrigé.** Les sets réels sont écrêtés sur le total avant tout calcul
d'écart.

### F. Sécurité — ce qui sortait, et ce qui restait

| # | Défaut | Portée |
|---|---|---|
| **F1** | Un lien d'invitation ouvert sur une application **déjà installée** reconfigurait le relais et réécrivait l'identité, sans confirmation. | Quiconque fait toucher un `…#s=…` à une entraîneuse détournait sa synchronisation vers un relais qu'il contrôle : ses vues y partaient, et les « soumissions » qu'il y déposait entraient dans sa base. |
| **F2** | `exportBackup` exportait `DB.people[].token` — le jeton de relais de chacun — en clair, dans un fichier qui circule par courriel. | Qui l'obtient prend l'identité de n'importe quel membre sur le relais. L'écran promettait pourtant « aucun jeton d'accès ». |
| **F3** | `revokeToken` effaçait le jeton **localement d'abord**, puis avalait l'échec de l'appel. Hors ligne, la révocation affichait un succès, le jeton restait valide 120 jours, et plus personne ne savait lequel. | Le seul remède en cas d'appareil perdu ne faisait rien. |
| **F4** | `mkToken` et `mkRoomCode` tiraient de `Math.random()`, alors que `randBytes` est défini trente lignes plus haut. | Un jeton EST la seule chose qui sépare un inconnu des données du club. |
| **F5** | `vaultCreate` n'effaçait que `wonderstats_v3` et deux clés héritées : `wonderstats_inbox_v3` — les vues et les commentaires libres d'un sélectionneur — restait **en clair** sur un appareil qui avait tourné avant le verrou. « Phrase oubliée — repartir de zéro » laissait le journal chiffré, l'inbox, et le jeton de relais. | La promesse « rien de lisible ne reste sur le disque » était fausse. |
| **F6** | `vaultLock` ne touchait ni à `SYNC.token` ni à l'autosauvegarde armée : verrouiller laissait un accès réseau vivant, et pouvait réécrire une base vide en clair. | — |
| **F7** | `verifyAll` ne contrôlait pas `kind` : une nomination signée passait pour une charte. | Dormant, mais du genre qui devient exploitable dès qu'on conditionne quoi que ce soit à `clubVerified`. |
| **F8** | `buildPacket` inscrivait `selectorName` même dans un paquet publié **sans destinataire**, donc lisible de tous les sélectionneurs de l'équipe. | Ils apprenaient qui évalue quoi. |
| **F9** | Le service worker servait `superadmin.json` depuis son cache : une rotation de la racine de confiance n'était prise en compte qu'au démarrage suivant. | — |
| **F10** | Relais : `grant` n'attachait pas le jeton cible à son émetteur — un porteur `coach` pouvait **réécrire la nomination** de n'importe quel jeton dont il connaissait la valeur, et fabriquer des jetons permanents qu'aucun écran ne montre. Un rôle d'équipe sans `teamId` recevait le préfixe de tout le salon. | La faille la plus sérieuse côté serveur. |
| **F11** | `integrateSubmission` ne bornait pas `ratings`, alors que `stats`, `reco` et `pos` l'étaient. | Un fichier bricolé y glissait un 9999 que le score compilé moyennait tel quel. |

**Tout corrigé.** Voir les notes de version v7.2.

### G. Ce que le code savait faire et que l'écran n'offrait pas

Vingt et une fonctions n'étaient appelées par personne. Trois d'entre
elles étaient des manques fonctionnels réels :

- **`vaultChangePass`** — une phrase de passe choisie à la hâte le premier
  jour ne pouvait plus **jamais** être changée ;
- **`vaultLock`** — la seule façon de refermer l'application sur un iPad
  de club partagé était de fermer le navigateur ;
- **`splitPrepare` / `splitSetCount` / `splitMove` / `unsplitSession`** —
  l'application écrivait « Vous pourrez le ventiler plus tard » au moment
  d'enregistrer un match sans borne. Plus tard, l'écran disait « seule la
  répartition manque » et n'offrait **aucun geste**. Le moteur était
  écrit, la feuille de style aussi. Rien ne les appelait.

Et un quatrième manque, celui-là de pure distribution : la **sauvegarde
complète** n'était atteignable que du rôle administrateur, alors que le
README la donnait comme un geste d'entraîneur. Une entraîneuse qui
n'administre rien n'avait aucun moyen de sauvegarder l'ensemble.

**Tout branché.** `⚙️ Réglages → 🔒 Sécurité` verrouille et change la
phrase ; `💾 Données` porte la sauvegarde complète et la restauration ;
`🗓️ Saison → une rencontre → Ventilation` reporte une feuille de match
après coup, compteur par compteur, sans jamais toucher au total.

### H. Les deux gestes qui referment une couche

`Échap` ne faisait rien. Le retour système d'Android — le geste le plus
employé sur un téléphone — **quittait l'application** en pleine saisie de
match, quand l'utilisateur voulait seulement refermer une boîte. Et le
fond d'une modale la fermait au moindre contact : au bord d'un terrain,
le pouce se pose n'importe où, et un formulaire de rencontre à moitié
rempli disparaissait sans un mot.

**Corrigé.** Une entrée d'historique par couche ouverte ; `Échap` et le
retour système referment la couche du dessus ; le fond demande
confirmation quand un brouillon a été saisi.

### J. Une saison entière ne tenait plus sur l'appareil

Le défaut le plus lourd de tous, et le seul qui ne se voyait qu'à
l'échelle réelle. `localStorage` n'accepte que des chaînes, compte son
quota en UTF-16, et s'arrête vers 5 Mo. Le bloc chiffré doit donc passer
par base64, qui l'enfle d'un tiers.

Mesuré sur une saison de club — deux équipes, soixante-dix athlètes,
deux cent soixante relevés :

| | |
|---|---|
| base sérialisée | 5,06 Mo |
| coffre après base64 | ~6,7 M caractères |
| quota consommé (UTF-16) | ~13 Mo |
| `localStorage.setItem` | **QuotaExceededError** |
| après rechargement | **0 athlète, 0 relevé** |

L'écriture échouait, et la saison entière disparaissait au rechargement
suivant. Deux aggravations : la bannière « l'espace se remplit » mesurait
ce qui est **sur le disque**, donc se taisait précisément au moment où
l'écriture échouait ; et `b64()` concaténait caractère par caractère —
365 ms par sauvegarde sur un portable, 2 274 ms sur un vieil iPad, soit
77 % du coût total, pour une fonction de trois lignes.

**Corrigé.** `b64()` travaille par tranches de 32 Ko — sortie identique,
octet pour octet, neuf fois et demie plus vite. La bannière mesure ce
qu'il **faut écrire**, et devient un avertissement bloquant quand
l'écriture a échoué. Et le coffre bascule sur **IndexedDB** dès que
`localStorage` refuse : tant qu'il tient, il reste où il a toujours été —
un appareil qui marche n'a rien à gagner à changer — mais il ne se perd
plus. Mesuré après correction : la même saison de 5,06 Mo s'enregistre en
171 ms et revient entière.

### K. L'écran mangé par ses propres barres

Mesuré au pixel, sur un téléphone de 375 × 667 — le plus petit visé —
avec une saison ordinaire : vingt-quatre athlètes, six relevés.

| Écran | Avant | Après |
|---|---|---|
| Saison · tableau de bord | 264 px | **163 px** |
| Sélection · récap | **628 px** | **372 px** |
| Entraînements | 407 px | **290 px** |
| Joueuses · base | 619 px | **328 px** |
| Joueuses · convocation | 381 px | **272 px** |
| Récapitulatif · cumul | 489 px | **287 px** |
| Réglages · saisons | 325 px | **216 px** |

*(La colonne « Après » a été mesurée avant la correction des cibles de la
section M : l'en-tête y a depuis gagné **10 px** — il ne mesurait que
34 px, et la pastille de rôle qu'il porte ne pouvait donc pas atteindre
les 44 px de toucher. Chaque valeur ci-dessus est donc à lire +10.)*

628 px sur 667 : sur l'écran Sélection, **94 % de la hauteur était de la
chrome**, et il restait de quoi afficher UNE ligne de liste. Le détail,
bande par bande : en-tête 50, barre de contexte 59, barre de saison 59,
en-tête de partie 73, barre de campagne 62, rangée de volets 61, barre de
liste **186**. Plus, en bas, la barre d'onglets et la barre d'action.

Ce qui a été fait :

- **la barre de liste passe de quatre rangées à une** — recherche,
  filtres, tri et compteur s'empilaient ; il reste un champ de recherche,
  un bouton `⚙︎` portant le **nombre de filtres posés**, et un bouton `⇅`
  portant le tri courant. Filtres et tris s'ouvrent dans une feuille, où
  ils ont enfin la place de porter **le chiffre de chaque option** : non
  pas un comptage brut, mais ce que l'option laisserait passer TOUT LE
  RESTE étant appliqué — la seule réponse à la question qu'on se pose en
  la regardant. Une option qui ne laisserait rien passer est désactivée
  plutôt que menteuse ;
- **les deux barres de contexte n'en font plus qu'une** : l'équipe et la
  saison tiennent sur une ligne, et l'en-tête ne répète plus le rôle ;
- **l'en-tête de partie et la barre de campagne** tenaient chacun sur
  deux lignes empilées ; chacun tient sur une ;
- **les explications se replient à deux lignes** et se déplient d'un
  geste. Elles sont précieuses la première fois, pas la deux centième ;
- **le récapitulatif** empilait cinq rangées de sélecteurs — poste,
  famille, nature, période, échelle — soit 180 px au-dessus d'un tableau
  qui n'avait plus que 159 px. Une seule commande les remplace, qui dit
  en clair ce qu'on regarde.

Deux garde-fous posés en chemin, parce que la compression peut trop bien
réussir : le retour d'une partie **redit où il mène** (« ‹ Saison », et
non une flèche muette), et les deux gestes secondaires de la base de
joueuses, réduits à leur signe, **gardent un nom accessible explicite** —
que les suites vérifient désormais en les visant par ce nom.

### L. Ce qu'un audit d'ergonomie mesuré a trouvé

Quarante et un écrans, neuf modales et deux feuilles, mesurés au pixel à
375 × 667, puis repassés à 320, 768, 1024 et 188 px (zoom 200 %).

**Contrastes.** La palette de texte tient partout (9,3 à 17,9:1). Ce qui
ne tenait pas, ce sont les teintes MÉTIER employées comme encre :

| | mesuré | seuil |
|---|---|---|
| blanc sur l'ambre de la pilule active | **2,15** | 4,5 |
| « passes » #8B5CF6 sur ardoise | **3,45** | 4,5 |
| « attaques » #EF4444 sur ardoise | **3,89** | 4,5 |
| « services » #3B82F6 sur ardoise | **3,98** | 4,5 |
| jeton rouge « ⛔ Non retenue » | **4,37** | 4,5 |

Corrigé : les sept familles portent désormais une **encre** distincte de
leur teinte — `color` peint les fonds, les bords et les jauges, `ink`
écrit — et toutes passent au-dessus de 5,2 ; la pilule active passe par
`paintOn()`, qui existait déjà pour cela et était appelé partout ailleurs
(2,15 → 8,72) ; le voile des jetons descend de 13 % à 8 %, ce qui les
fait tous passer sans en dégrader aucun.

**Cibles tactiles.** Le plancher de 44 px était écrit, et tenu partout
où il était écrit. Il ne l'était pas là où cela comptait le plus :

| contrôle | mesuré | risque |
|---|---|---|
| `−` de la saisie grille | **23 × 20 px** | à 2 px du `+1`, et à **11 px du `+1` de l'athlète suivante** |
| `−` de la saisie rapide | **23 × 44** | sous un bouton de 70, collé à lui |
| crayon de sous-équipe | **19 × 14** | **0 px** d'écart avec le chip |
| filtre de poste (`L`, `S`) | **25 et 26 px** | 3 à 5 px entre six cibles |
| `🗑️`, `✏️`, `↩` | 36 à 41 px de large | voisins d'actions irréversibles |
| badge de rôle, bouton « qui suis-je » | 23 px de haut, 36 de large | présents sur **tous** les écrans |

Le premier est le plus grave : corriger un compteur mal tapé est le geste
le plus courant au bord d'un terrain, et une visée basse l'inscrivait chez
la mauvaise athlète, sans toast et sans nom. Tous corrigés — le dessin ne
grossit pas, c'est la zone de toucher qui s'étend, comme le faisait déjà
`.pick-box`.

**Accessibilité.** Dix-neuf champs de formulaire sur vingt et un
n'avaient **aucun nom accessible** : le `<label>` n'avait ni `for`, ni
n'englobait son champ. VoiceOver annonçait « champ de texte ». Corrigé
dans le patron partagé — le `<label>` englobe désormais, ce qui le nomme
*et* agrandit sa cible. Les modales n'enfermaient pas le focus : vingt-sept
tabulations suffisaient à se retrouver à piloter l'écran resté derrière le
voile, sans le voir. La barre « Terrain » — le premier geste de chaque
match — était un `<div onclick>`, inatteignable au clavier. L'issue d'un
match ne tenait qu'à la couleur du score, alors que `OUTCOMES[].short`
existait depuis toujours sans être employé nulle part.

**Ce qui était déjà bon, et vérifié comme tel** : aucun débordement
horizontal sur 41 écrans, à 320 comme à 1024 ; `prefers-reduced-motion`
complet — zéro animation résiduelle ; l'information ne repose jamais sur
la couleur seule pour les huit familles de jetons métier, qui portent
tous glyphe *et* mot ; les champs à 16 px, donc pas de zoom iOS ; soixante
pas d'annulation couvrant compteurs et bornes de set.

### I. Vérification

Deux suites sont nées de cet audit. `tests/sauvegarde.js` — quinze
contrôles sur le cycle sauvegarder → restaurer → annuler, dont **douze
échouent** sur la version d'avant, le dernier étant celui qui compte le
plus : une saison de deux cent soixante relevés qui revient entière.
`tests/ventilation.js` — onze contrôles sur le report d'une feuille de
match après coup, tous articulés autour d'un seul invariant : le total
du match ne bouge jamais d'un compteur.

### M. Ce qu'une exploration au navigateur a trouvé, écran par écran

Les sections précédentes lisaient le code, mesuraient des pixels et
rejouaient des scénarios écrits d'avance. Ce dernier passage a fait
l'inverse : ouvrir l'application dans un vrai Chromium et **toucher
chaque bouton de chaque écran** — dix-neuf écrans entraîneur, treize
onglets pour les trois autres rôles, trois tailles d'écran, entrées
hostiles, hors ligne. Compteur d'erreurs JavaScript sur toute la
campagne : **zéro**. Aucun des neuf défauts trouvés ne lève d'exception.
C'est précisément ce qui les rendait invisibles.

**1. Deux onglets, et le dernier qui écrit gagnait.** Le plus lourd.
Chaque onglet tient la base entière en mémoire et la réécrit **en
entier** — à chaque bascule d'onglet, à chaque fermeture. Deux onglets
ouverts sur le même club, une fiche créée dans l'un, un aller-retour, et
elle n'existait plus. Ni message, ni ligne au journal. Aucun écouteur
`storage`, aucun jeton de version : rien ne comparait ce qu'on allait
écrire à ce qui était sur le disque — alors que la sauvegarde GitHub,
elle, refuse depuis toujours d'écraser un dépôt modifié ailleurs.

La correction ne fusionne pas, et c'est délibéré : la plupart des
écritures de l'application touchent `DB` directement, sans passer par le
journal d'opérations, qu'un rejeu ne saurait donc pas reconstituer. Un
marqueur en clair (un identifiant d'onglet et un compteur, rien d'autre)
est posé à chaque sauvegarde réussie. Un onglet qui ne le reconnaît plus
sait qu'un autre est passé, et il y a alors deux cas :

- il n'a **rien modifié** depuis sa dernière écriture — c'est le cas
  courant, un onglet laissé ouvert : il relit le disque et se remet à
  jour tout seul, sans un mot ;
- il porte du **travail non enregistré** : les deux versions divergent et
  aucune ne peut être choisie sans perdre l'autre. Il cesse d'écrire —
  mieux vaut ne rien faire que défaire — garde son journal de secours,
  affiche « Non sauvegardé », et pose la question à l'écran avec les deux
  issues et ce que chacune coûte.

**2. Le chiffre de « Toutes » comptait deux fois les lignes sans
valeur.** La clé `""` servait à la fois de total et de seau pour les
valeurs absentes : sur vingt athlètes dont quinze sans offre, la feuille
annonçait `Toutes = 35` au-dessus d'un bouton qui disait « Voir les
résultats (20) ». Les trois filtres dont le `get` pouvait rendre `""`
n'offraient de surcroît **aucune option pour isoler les lignes sans
valeur** : elles ont désormais la leur — « — Sans poste », « — Aucune ».

**3. Un chiffre qui ignorait la période déjà posée.** Dans « Ce qu'on
regarde », « 🏆 Champ. = 4 » suivi d'un tableau « cumulé sur 3 matchs ».
Le groupe *Poste* respectait pourtant la règle. Nature et période se
comptent maintenant l'une l'autre, comme `listFacettes` l'exige.

**4. Une recherche infructueuse était un cul-de-sac.** Ni croix
d'effacement, ni ligne « 0 sur 20 · Tout effacer », alors que les deux
existent dans le code : l'écouteur de frappe ne repeignait pas la barre
(pour ne pas perdre le focus, ce qui est juste) et rien ne rattrapait les
deux éléments qui en dépendent. Preuve que ce n'était pas un choix :
ouvrir puis refermer la feuille de filtres les faisait paraître. Les
états vides sur mesure — « Aucune athlète » — n'offraient eux non plus
aucune sortie ; ils en portent une dès qu'une recherche ou un filtre est
en cause.

**5. Taper détruisait « Tout effacer ».** `textContent` posé sur la
rangée entière du compteur remplaçait ses deux enfants par du texte.

**6. Le « Annuler » des bandeaux n'était jamais offert.** `showToast`
construisait bien le bouton, puis le `render()` de l'appelant vidait
`#app` et réinstallait un bandeau nu — texte seul, ton perdu.
**Douze appelants** dans ce cas, tous des actions destructrices :
remise en attente, suppression d'un match, d'une soumission, retrait de
saison, retrait d'une convocation, réinitialisation. Le filet existait,
`undoStack` était bien rempli — il n'était simplement plus atteignable.

**7. L'ajout en lot créait des dossards en double.** La fiche unique les
refuse depuis toujours ; le lot en créait deux d'un coup, en silence, y
compris deux fois le même numéro dans la même saisie — alors que le
dossard est *la seule information transmise aux sélectionneurs*. Le
contrôle a lieu à la lecture, avant la moindre écriture. Accessoirement,
le champ numéro ne gardait que les chiffres sans le dire : `-5` devenait
5, et le refus parlait alors d'un « numéro 5 » qu'on n'avait pas tapé ;
il corrige désormais sous les doigts.

**8. Supprimer une fiche laissait une offre qui la désignait.** Garder
les offres tranchées a un sens pour un *retrait de saison* : elles ont eu
lieu, elles sont datées. Pas quand la fiche elle-même est détruite —
l'offre survivante désignait alors un identifiant que `playerById` ne
résout plus, et se faisait compter parmi les pertes d'une campagne
supprimée plus tard.

**9. Deux cibles sous 44 px, sur tous les écrans et pour tous les
rôles.** La pastille de rôle (80 × 23) et le bouton « qui suis-je »
(36 × 44) : la règle `.ctx-bar button::after` censée agrandir leur zone
n'avait ni dimensions ni `inset` — elle était sans effet depuis sa
création. Un clic 6 px sous la pastille n'ouvrait rien. Et dans la
feuille des campagnes, `🗑️` mesurait 41 px de large.

**Un écran orphelin.** Rien dans l'application ne posait plus
`state.tab = "summary"` : le tableau détaillé — athlètes × compteurs,
triable, par match ou cumulé, avec la barre « Ce qu'on regarde » — n'était
plus atteignable que par un état d'interface relu au démarrage. Une
installation mise à jour y retombait, une installation neuve n'y accédait
jamais. Il a de nouveau sa porte, depuis « Récap global », et un retour
qui ramène d'où l'on vient.

**Une exception assumée.** Le volet « 👥 Athlètes → 📋 Convoquées » reste
le seul écran de liste sans barre de liste — ni recherche, ni tri, ni
filtre — alors qu'il porte l'effectif entier. C'est cohérent avec le
glisser-déposer qu'il propose : l'ordre y est l'information, et une liste
filtrée qu'on réordonne ne veut rien dire. Le trou dans la promesse
« toute liste passe par `listToolbar` » est donc conservé, mais il est
désormais écrit.

**Ce qui a tenu.** Fermetures et focus des feuilles (Échap, fond, retour
système, couches empilées) ; chiffres exacts sur cinq listes, option par
option, comparés au nombre de lignes rendues ; explications repliables au
clavier ; les quatre refus de la phrase de passe et le cycle verrouiller
/ déverrouiller ; la ventilation après coup, dont le total n'a pas bougé
d'un compteur sous `-4`, `999`, `1e9`, `abc` ; les dates impossibles
(`31/02/2010`, `01/01/1800`) toutes refusées ; 500 caractères, balises et
emoji acceptés sans injection — le DOM est construit par
`createTextNode`, aucun `innerHTML` ne reçoit de donnée utilisateur ;
hors ligne, les six écrans se rendent et le rechargement est servi par le
service worker ; aucun débordement de page à 375, 768 et 1024, et la
barre du bas ne masque jamais la dernière ligne.

### N. Vérification de ce dernier passage

`tests/onglets.js` — onze contrôles, dont **dix échouent** sur la version
d'avant. Les quatre premiers ouvrent réellement deux pages sur le même
`localStorage` et vérifient, en rechargeant depuis une troisième, ce qui
est vraiment sur le disque : que l'onglet resté ouvert rattrape le
travail de l'autre, qu'aucun des deux ne l'efface en cas de divergence,
que le journal de secours survit, et qu'un choix explicite — et lui seul
— écrit par-dessus.
