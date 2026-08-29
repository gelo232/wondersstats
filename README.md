# WonderStats

Application de statistiques, de **sélection** et d'**évaluation** pour le volleyball féminin.
Fichier unique, sans dépendance, installable et **fonctionnelle hors-ligne** (PWA).

```
index.html      application complète (HTML + CSS + JS vanilla)
manifest.json   métadonnées PWA
sw.js           service worker (app-shell en cache-first)
server/         relais de synchronisation optionnel (deux implémentations)
AUDIT.md        audit, modèle de données, suivi des corrections
tests/          suite de non-régression Playwright
```

---

## Les deux rôles

Le bouton en haut à droite bascule entre les deux modes.

### 👔 Entraîneur

| Onglet | Rôle |
|---|---|
| 🗓️ **Saison** | Créer une saison (nom, catégorie, dates, objectifs) · tableau de sélection · **campagnes d'évaluation** · équipes |
| 👥 **Joueuses** | Base de données partagée entre toutes les saisons · convocation |
| ✏️ **Saisie** | Statistiques en direct — mode rapide ou mode grille |
| 📊 **Récap** | Match en cours · cumul (filtrable par période) · **⭐ évaluations par campagne** et **📈 progression** · sessions |
| 🎯 **Sélection** | Vues sélectionneur · publication · soumissions reçues |

### 🎯 Sélectionneur

Interface réduite : chaque athlète est désignée par son **numéro**. Pour chacune,
5 critères notés de 1 à 5, des compteurs de statistiques, une recommandation et un
commentaire. Puis `📤 Soumettre`.

---

## Numéros d'athlète

Le numéro n'est **jamais attribué automatiquement** — vous le saisissez.

- à la création d'une fiche joueuse (champ *Numéro d'athlète*, facultatif) ;
- en fin de ligne dans l'ajout en lot : `Léa Tremblay 7` ;
- **et à tout moment ensuite**, directement dans la case de gauche du tableau
  `🗓️ Saison → Sélection`.

Un numéro déjà pris est refusé, un doublon s'affiche en rouge, et les joueuses sans
numéro sont signalées — c'est la seule information que verront vos sélectionneurs,
elle doit être exacte.

---

## Campagnes d'évaluation

Une **campagne** est un moment d'évaluation daté : la sélection d'août, un point de
mi-saison, le bilan de mai. Chaque vue sélectionneur appartient à une campagne, et
**les moyennes ne se mélangent jamais d'une campagne à l'autre**.

```
Sélection (août)     Léa · 2,5  ─┐
Mi-saison (janvier)  Léa · 3,5  ─┼─▶  chaque campagne garde son score
Fin de saison (mai)  Léa · 4,5  ─┘    Récap → 📈 Progression : +2,0
```

Pour réévaluer les mêmes athlètes plus tard, **🔁 Réévaluer** duplique la vue dans
une autre campagne avec des données **vierges** : aucune note périmée ne peut être
resoumise par inadvertance.

`🗓️ Saison → Campagnes` permet d'ouvrir, renommer, clore et supprimer une campagne.
Une campagne close, comme une saison clôturée, disparaît du rôle sélectionneur.

---

## Le circuit de sélection

```
Base de joueuses ──convocation──▶ Roster de la saison (numéros saisis)
                                        │
                                        ├──▶ Vue sélectionneur A  (#7 #12 #3)   ─┐
                                        ├──▶ Vue sélectionneur B  (#3 #9 #14)   ─┤ une joueuse
                                        └──▶ …                                  ─┘ peut être
                                                                                   dans plusieurs vues
   chaque sélectionneur soumet ──▶ Soumissions (figées, rattachées à leur campagne)
                                        │
                                   compilation par joueuse
                     (somme des stats · moyenne/min/max par critère · avis)
                                        │
                     ▼ Récap → ⭐ Évaluations   et   📈 Progression
                     ▼ Saison → Sélection : Retenir / Recaller / Non retenue
                                        │
                             joueuses retenues ──▶ équipe de la saison
```

### Trois façons de distribuer une vue

**Sur un seul appareil** — `🎯 Ouvrir ici` passe le téléphone au sélectionneur.

**Sur son propre appareil, par le réseau** *(recommandé)* — configurez un relais une
fois (voir ci-dessous), puis `📡 Publier` la vue et envoyez le `🔗 Lien sélectionneur`.
Le sélectionneur ouvre le lien sur son téléphone : l'application se configure seule,
il récupère ses vues, évalue, et `📡 Téléverse` sa soumission. Vous la relevez d'un
bouton.

**Par fichier, hors-ligne** — `📤 Fichier` produit un paquet JSON ; le sélectionneur
l'importe, évalue, et renvoie un fichier de soumission. Aucun réseau requis.

### Anonymat

Par défaut une vue est **anonyme** : ni l'interface du sélectionneur, ni le paquet
exporté, ni ce qui transite par le relais ne contiennent de nom. Pour un bilan de fin
de saison, où l'évaluateur connaît déjà l'équipe, la vue peut être passée en
**nominative** — un libellé court (« Léa T. ») accompagne alors le numéro.

---

## Synchronisation

Optionnelle. Sans elle, tout fonctionne par échange de fichiers.

Le relais est un petit service que **vous** déployez, gratuitement et sans carte
bancaire : un Cloudflare Worker ou un script Google Apps Script. Les deux sont
fournis dans [`server/`](server/README.md) avec leurs instructions.

Ensuite, dans `🎯 Sélection → Configurer` : collez l'URL, générez un code de salon,
testez, enregistrez.

> Le **code de salon fait office de mot de passe partagé** : il n'y a pas de compte
> utilisateur. Ne diffusez le lien qu'à vos sélectionneurs, et changez de code entre
> deux saisons.

---

## Statuts

Deux axes indépendants, pour ne jamais réécrire l'histoire d'une joueuse.

| Sélection | | Effectif *(une fois retenue)* | |
|---|---|---|---|
| ◻️ Candidate | convoquée, en cours d'évaluation | ● Active | sur le terrain |
| 🔁 Recallée | rappelée pour la suite | 🩹 Blessée | hors terrain, reste dans l'équipe |
| ✅ Retenue | fait partie de l'équipe | → Partie | a quitté l'équipe en cours de saison |
| ⛔ Non retenue | écartée | | |

Une joueuse blessée ou partie **conserve son statut *Retenue*, ses matchs joués et
son cumul** ; elle est simplement retirée du terrain.

---

## Créer une nouvelle saison

`Saison → Saisons → + Nouvelle saison`, puis au choix :

- **partir d'une base vide** — vous convoquez ensuite qui vous voulez ;
- **reprendre l'effectif d'une saison précédente** — toutes ses joueuses reviennent
  au statut *Candidate*, avec leur numéro et leur position, à re-sélectionner.

Dans les deux cas la **base de joueuses reste commune** : l'historique de chacune est
conservé d'une saison à l'autre.

---

## Données

Tout est stocké localement (`localStorage`). Rien ne sort de l'appareil, sauf ce que
vous publiez explicitement sur votre propre relais.

- `Saison → Saisons → 📤 Sauvegarde` produit un fichier complet.
- `📥 Restaurer / fusionner` réimporte en dédoublonnant les joueuses. Les exports de
  l'ancienne version (v7 et antérieurs) sont acceptés.
- Au premier lancement, les données de l'ancienne version sont migrées automatiquement.

---

## Développement

Aucun build. Ouvrez `index.html`, ou servez le dossier pour tester le service worker :

```bash
python3 -m http.server 8899
```

Non-régression : voir [`tests/README.md`](tests/README.md).
