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

## 5. Vérification

Trois suites Playwright pilotent l'application réelle (`tests/run.sh`, **51 contrôles**, aucune erreur JS) :

| Suite | Ce qui est vérifié |
|---|---|
| `smoke.js` | La migration v2 → v3 reconstruit joueuses, roster, compositions, sous-équipes, statistiques et sessions ; renommer une joueuse **et** changer son numéro laisse son cumul intact (régression **A2**) ; les doublons de numéro sont détectés. |
| `e2e.js` | Parcours complet saison → vues → évaluation → soumission → compilation → sélection → match. Contrôle explicite de l'**anonymat** : aucun des noms du jeu de données n'apparaît dans le DOM du rôle sélectionneur ni dans le paquet exporté. Contrôle qu'après suppression d'une joueuse il ne subsiste **aucune référence orpheline** (régression **A1**). |
| `modals.js` | Les 13 modales s'ouvrent, se rendent et se ferment sans erreur ni fuite d'état. |

L'application reste sans dépendance : Playwright ne sert qu'aux tests, `index.html` demeure autonome.

## 6. Reste à considérer

- **Transport des paquets** : le circuit hors-ligne passe par des fichiers `.json`. Un partage réseau (QR code, lien) supprimerait cette manipulation, au prix d'un serveur.
- **Pondération des critères** : le score est une moyenne simple. Pondérer par critère ou par sélectionneur (expérience) est une évolution naturelle.
- **Quota `localStorage`** : ~5 Mo. À raison de ~2 Ko par session, la limite est loin, mais l'échec d'écriture est désormais signalé à l'utilisateur au lieu d'être avalé.
